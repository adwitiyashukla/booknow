import { Prisma } from '@prisma/client';

import {
  buildAvailabilityCalendar,
  remainingInventory,
  selectFreeUnit,
  type BookedInterval,
} from '@/lib/availability';
import { addDays, toDateKey, toUtcDate } from '@/lib/dates';
import { quoteStay, type PriceQuote, type RateRuleInput } from '@/lib/pricing';
import { db } from './db';
import { NotFoundError } from './errors';

const BLOCKING = ['HELD', 'CONFIRMED', 'CHECKED_IN'] as const;

/**
 * The set of bookings that genuinely consume a room right now.
 *
 * A HELD booking blocks inventory, but only until its hold expires. Deriving
 * that at query time rather than waiting for the sweeper means an abandoned
 * checkout stops blocking the room the moment it lapses, so the cron job is
 * housekeeping (tidying the status column) rather than something correctness
 * depends on. That matters: schedulers are late, miss runs, and on some hosting
 * plans cannot run more than once a day.
 */
export function blockingWhere(now = new Date()) {
  return {
    OR: [
      { status: { in: ['CONFIRMED', 'CHECKED_IN'] as const } },
      { status: 'HELD' as const, holdExpiresAt: { gt: now } },
      { status: 'HELD' as const, holdExpiresAt: null },
    ],
  };
}


/**
 * Load every booking that could touch a stay window. The half-open overlap
 * predicate is pushed down to Postgres so we never pull the whole table.
 */
export async function loadOverlappingBookings(
  checkIn: Date,
  checkOut: Date,
  roomTypeIds?: string[],
): Promise<(BookedInterval & { roomTypeId: string })[]> {
  const rows = await db.booking.findMany({
    where: {
      ...blockingWhere(),
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
      ...(roomTypeIds?.length ? { roomTypeId: { in: roomTypeIds } } : {}),
    },
    select: {
      roomTypeId: true,
      roomUnitId: true,
      checkIn: true,
      checkOut: true,
      status: true,
    },
  });
  return rows.map((r) => ({ ...r, status: r.status }));
}

export interface AvailableRoomResult {
  roomType: Prisma.RoomTypeGetPayload<{
    include: { amenities: { include: { amenity: true } }; reviews: { select: { rating: true } } };
  }>;
  unitsTotal: number;
  unitsAvailable: number;
  occupancyByDate: Record<string, number>;
  quote: PriceQuote | null;
  rating: number;
  reviewCount: number;
}

/**
 * The search read-model. One pass over the catalogue joins live inventory,
 * demand-aware pricing, and review aggregates so the UI can render a full
 * result card without any further round trips.
 */
export async function searchAvailability(params: {
  checkIn?: string;
  checkOut?: string;
  adults: number;
  children: number;
  minPrice?: number;
  maxPrice?: number;
  oceanView?: boolean;
  balcony?: boolean;
  accessible?: boolean;
  amenities?: string[];
}): Promise<AvailableRoomResult[]> {
  const roomTypes = await db.roomType.findMany({
    where: {
      ...(params.oceanView ? { hasOceanView: true } : {}),
      ...(params.balcony ? { hasBalcony: true } : {}),
      ...(params.accessible ? { isAccessible: true } : {}),
      ...(params.amenities?.length
        ? { amenities: { some: { amenity: { slug: { in: params.amenities } } } } }
        : {}),
      maxAdults: { gte: Math.min(params.adults, 8) },
    },
    include: {
      amenities: { include: { amenity: true } },
      reviews: { select: { rating: true } },
      units: { where: { status: 'AVAILABLE' }, select: { id: true } },
      rateRules: true,
    },
  });

  const hasDates = Boolean(params.checkIn && params.checkOut);
  const checkIn = hasDates ? toUtcDate(params.checkIn!) : toUtcDate(new Date());
  const checkOut = hasDates ? toUtcDate(params.checkOut!) : addDays(checkIn, 1);

  const overlapping = hasDates
    ? await loadOverlappingBookings(checkIn, checkOut, roomTypes.map((r) => r.id))
    : [];

  const globalRules = await db.rateRule.findMany({ where: { roomTypeId: null } });

  const results: AvailableRoomResult[] = roomTypes.map((roomType) => {
    const unitsTotal = roomType.units.length;
    const booked = overlapping.filter((b) => b.roomTypeId === roomType.id);
    const { available, occupancyByDate } = hasDates
      ? remainingInventory({ checkIn, checkOut }, unitsTotal, booked)
      : { available: unitsTotal, occupancyByDate: {} as Record<string, number> };

    const rateRules: RateRuleInput[] = [...globalRules, ...roomType.rateRules].map((r) => ({
      label: r.label,
      startDate: r.startDate,
      endDate: r.endDate,
      multiplier: r.multiplier,
      priority: r.priority,
    }));

    let quote: PriceQuote | null = null;
    if (hasDates) {
      try {
        quote = quoteStay({
          baseRateCents: roomType.baseRateCents,
          checkIn,
          checkOut,
          adults: params.adults,
          children: params.children,
          maxAdults: roomType.maxAdults,
          occupancyByDate,
          rateRules,
        });
      } catch {
        quote = null;
      }
    }

    const ratings = roomType.reviews.map((r) => r.rating);
    const rating = ratings.length
      ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
      : 4.6;

    return {
      roomType,
      unitsTotal,
      unitsAvailable: available,
      occupancyByDate,
      quote,
      rating,
      reviewCount: ratings.length,
    };
  });

  return results.filter((r) => {
    const nightly = r.quote?.averageNightlyCents ?? r.roomType.baseRateCents;
    if (params.minPrice && nightly < params.minPrice) return false;
    if (params.maxPrice && nightly > params.maxPrice) return false;
    return true;
  });
}

/** 60-day forward availability strip for the room detail calendar. */
export async function getRoomCalendar(roomTypeId: string, days = 60) {
  const roomType = await db.roomType.findUnique({
    where: { id: roomTypeId },
    include: { units: { where: { status: 'AVAILABLE' }, select: { id: true } } },
  });
  if (!roomType) throw new NotFoundError('Room type');

  const from = toUtcDate(new Date());
  const to = addDays(from, days);
  const booked = (await loadOverlappingBookings(from, to, [roomTypeId])).map((b) => ({
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    status: b.status,
    roomUnitId: b.roomUnitId,
  }));

  return {
    roomTypeId,
    unitsTotal: roomType.units.length,
    days: buildAvailabilityCalendar(from, to, roomType.units.length, booked),
  };
}

/**
 * Assign a physical room. Runs inside the booking transaction so the read of
 * "which units are free" and the write that claims one are atomic.
 */
export async function pickUnitForStay(
  tx: Prisma.TransactionClient,
  roomTypeId: string,
  checkIn: Date,
  checkOut: Date,
): Promise<string | null> {
  const units = await tx.roomUnit.findMany({
    where: { roomTypeId, status: 'AVAILABLE' },
    select: { id: true },
    orderBy: { code: 'asc' },
  });

  const busy = await tx.booking.findMany({
    where: {
      roomTypeId,
      ...blockingWhere(),
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    select: { roomUnitId: true, checkIn: true, checkOut: true, status: true },
  });

  return selectFreeUnit(
    { checkIn, checkOut },
    units.map((u) => u.id),
    busy,
  );
}

export { toDateKey };
