import { addDays, eachNight, toDateKey, toUtcDate } from '@/lib/dates';
import { db } from './db';

/**
 * Revenue management metrics.
 *
 * ADR    = room revenue / rooms sold
 * RevPAR = room revenue / rooms available   (the metric hotels actually run on)
 * ALOS   = average length of stay
 * These are computed from the booking ledger rather than stored, so they can
 * never drift out of sync with the source of truth.
 */

export interface DashboardMetrics {
  rangeLabel: string;
  totalRevenueCents: number;
  roomRevenueCents: number;
  bookings: number;
  roomNightsSold: number;
  roomNightsAvailable: number;
  occupancyRate: number;
  adrCents: number;
  revParCents: number;
  averageLeadTimeDays: number;
  averageLengthOfStay: number;
  cancellationRate: number;
  /** Share of reservations made that actually materialised into a stay. */
  realisationRate: number;
  revenueByDay: { date: string; revenueCents: number; bookings: number }[];
  occupancyByDay: { date: string; occupancy: number; roomsSold: number }[];
  revenueByRoomType: { name: string; revenueCents: number; nights: number }[];
  statusMix: { status: string; count: number }[];
  /** Real acquisition mix when the ledger came from the source dataset. */
  topSources: { label: string; value: number }[];
  topCountries: { label: string; value: number }[];
  channelMix: { label: string; value: number }[];
}

export async function getDashboardMetrics(days = 30): Promise<DashboardMetrics> {
  const today = toUtcDate(new Date());
  const from = addDays(today, -days);
  const to = addDays(today, 1);

  const [bookings, unitCount, allInWindow, segments, countries, channels] = await Promise.all([
    db.booking.findMany({
      where: {
        status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
        checkIn: { lt: to },
        checkOut: { gt: from },
      },
      include: { roomType: { select: { name: true } } },
    }),
    db.roomUnit.count({ where: { status: 'AVAILABLE' } }),
    db.booking.findMany({
      where: { createdAt: { gte: from } },
      select: { status: true, createdAt: true, checkIn: true, nights: true, totalCents: true },
    }),
    // Acquisition mix is read straight off the ledger rather than estimated.
    db.booking.groupBy({
      by: ['marketSegment'],
      _count: { _all: true },
      where: { marketSegment: { not: null } },
      orderBy: { _count: { marketSegment: 'desc' } },
      take: 6,
    }),
    db.booking.groupBy({
      by: ['guestCountry'],
      _count: { _all: true },
      where: { guestCountry: { not: null } },
      orderBy: { _count: { guestCountry: 'desc' } },
      take: 8,
    }),
    db.booking.groupBy({
      by: ['distributionChannel'],
      _count: { _all: true },
      where: { distributionChannel: { not: null } },
      orderBy: { _count: { distributionChannel: 'desc' } },
      take: 5,
    }),
  ]);

  const dayKeys = eachNight(from, to).map(toDateKey);
  const revenueByDayMap = new Map(dayKeys.map((d) => [d, { revenueCents: 0, bookings: 0 }]));
  const occupancyByDayMap = new Map(dayKeys.map((d) => [d, 0]));
  const byRoomType = new Map<string, { revenueCents: number; nights: number }>();

  let roomRevenueCents = 0;
  let roomNightsSold = 0;

  for (const b of bookings) {
    const nightlyCents = Math.round(b.subtotalCents / Math.max(1, b.nights));
    for (const night of eachNight(b.checkIn, b.checkOut)) {
      const key = toDateKey(night);
      if (!revenueByDayMap.has(key)) continue;
      const bucket = revenueByDayMap.get(key)!;
      bucket.revenueCents += nightlyCents;
      occupancyByDayMap.set(key, (occupancyByDayMap.get(key) ?? 0) + 1);
      roomRevenueCents += nightlyCents;
      roomNightsSold += 1;
    }
    const dayKey = toDateKey(b.createdAt);
    if (revenueByDayMap.has(dayKey)) revenueByDayMap.get(dayKey)!.bookings += 1;

    const rt = byRoomType.get(b.roomType.name) ?? { revenueCents: 0, nights: 0 };
    rt.revenueCents += b.subtotalCents;
    rt.nights += b.nights;
    byRoomType.set(b.roomType.name, rt);
  }

  const roomNightsAvailable = unitCount * dayKeys.length;
  const totalRevenueCents = bookings.reduce((acc, b) => acc + b.totalCents, 0);

  const leadTimes = bookings.map(
    (b) => (toUtcDate(b.checkIn).getTime() - toUtcDate(b.createdAt).getTime()) / 86_400_000,
  );
  const cancelled = allInWindow.filter((b) => b.status === 'CANCELLED').length;
  const expired = allInWindow.filter((b) => b.status === 'EXPIRED').length;
  const confirmedInWindow = allInWindow.filter((b) =>
    ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'].includes(b.status),
  ).length;

  const statusCounts = new Map<string, number>();
  for (const b of allInWindow) statusCounts.set(b.status, (statusCounts.get(b.status) ?? 0) + 1);

  return {
    rangeLabel: `${toDateKey(from)} to ${toDateKey(today)}`,
    totalRevenueCents,
    roomRevenueCents,
    bookings: bookings.length,
    roomNightsSold,
    roomNightsAvailable,
    occupancyRate: roomNightsAvailable ? roomNightsSold / roomNightsAvailable : 0,
    adrCents: roomNightsSold ? Math.round(roomRevenueCents / roomNightsSold) : 0,
    revParCents: roomNightsAvailable ? Math.round(roomRevenueCents / roomNightsAvailable) : 0,
    averageLeadTimeDays: leadTimes.length
      ? Number((leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length).toFixed(1))
      : 0,
    averageLengthOfStay: bookings.length
      ? Number((bookings.reduce((a, b) => a + b.nights, 0) / bookings.length).toFixed(1))
      : 0,
    cancellationRate: allInWindow.length ? cancelled / allInWindow.length : 0,
    // Cancellations and abandoned holds both count against realisation, which
    // is the number a commercial team actually reports.
    realisationRate: allInWindow.length
      ? confirmedInWindow / Math.max(1, confirmedInWindow + cancelled + expired)
      : 0,
    revenueByDay: dayKeys.map((date) => ({
      date,
      revenueCents: revenueByDayMap.get(date)?.revenueCents ?? 0,
      bookings: revenueByDayMap.get(date)?.bookings ?? 0,
    })),
    occupancyByDay: dayKeys.map((date) => ({
      date,
      roomsSold: occupancyByDayMap.get(date) ?? 0,
      occupancy: unitCount ? (occupancyByDayMap.get(date) ?? 0) / unitCount : 0,
    })),
    revenueByRoomType: [...byRoomType.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenueCents - a.revenueCents),
    statusMix: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
    topSources: segments.map((s) => ({
      label: s.marketSegment ?? 'Unknown',
      value: s._count._all,
    })),
    topCountries: countries.map((c) => ({ label: c.guestCountry ?? 'UNK', value: c._count._all })),
    channelMix: channels.map((c) => ({ label: c.distributionChannel ?? 'Unknown', value: c._count._all })),
  };
}

/** Forward-looking pickup: what is already on the books for the next N days. */
export async function getForwardPickup(days = 45) {
  const today = toUtcDate(new Date());
  const to = addDays(today, days);

  const [bookings, unitCount] = await Promise.all([
    db.booking.findMany({
      where: {
        status: { in: ['HELD', 'CONFIRMED', 'CHECKED_IN'] },
        checkIn: { lt: to },
        checkOut: { gt: today },
      },
      select: { checkIn: true, checkOut: true, subtotalCents: true, nights: true },
    }),
    db.roomUnit.count({ where: { status: 'AVAILABLE' } }),
  ]);

  const map = new Map(eachNight(today, to).map((d) => [toDateKey(d), { sold: 0, revenueCents: 0 }]));
  for (const b of bookings) {
    const nightly = Math.round(b.subtotalCents / Math.max(1, b.nights));
    for (const night of eachNight(b.checkIn, b.checkOut)) {
      const key = toDateKey(night);
      const bucket = map.get(key);
      if (!bucket) continue;
      bucket.sold += 1;
      bucket.revenueCents += nightly;
    }
  }

  return [...map.entries()].map(([date, v]) => ({
    date,
    roomsSold: v.sold,
    revenueCents: v.revenueCents,
    occupancy: unitCount ? v.sold / unitCount : 0,
  }));
}
