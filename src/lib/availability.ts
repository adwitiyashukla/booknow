import { eachNight, rangesOverlap, toDateKey } from './dates';

export interface StayInterval {
  checkIn: Date | string;
  checkOut: Date | string;
}

export interface BookedInterval extends StayInterval {
  roomUnitId?: string | null;
  status?: string;
  holdExpiresAt?: Date | string | null;
}

export const BLOCKING_STATUSES = ['HELD', 'CONFIRMED', 'CHECKED_IN'] as const;

export function isBlocking(status: string | undefined): boolean {
  return !!status && (BLOCKING_STATUSES as readonly string[]).includes(status);
}

export function consumesInventory(booking: BookedInterval, now: Date = new Date()): boolean {
  if (!isBlocking(booking.status)) return false;
  if (booking.status !== 'HELD') return true;
  if (booking.holdExpiresAt === null || booking.holdExpiresAt === undefined) return true;
  return new Date(booking.holdExpiresAt).getTime() > now.getTime();
}

export function occupiedCountByNight(
  request: StayInterval,
  booked: BookedInterval[],
  now: Date = new Date(),
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const night of eachNight(request.checkIn, request.checkOut)) {
    counts[toDateKey(night)] = 0;
  }
  for (const b of booked) {
    if (b.status && !consumesInventory(b, now)) continue;
    for (const night of eachNight(b.checkIn, b.checkOut)) {
      const key = toDateKey(night);
      if (key in counts) counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

export function remainingInventory(
  request: StayInterval,
  totalUnits: number,
  booked: BookedInterval[],
  now: Date = new Date(),
): { available: number; soldOutNights: string[]; occupancyByDate: Record<string, number> } {
  const counts = occupiedCountByNight(request, booked, now);
  const occupancyByDate: Record<string, number> = {};
  let worst = totalUnits;
  const soldOutNights: string[] = [];

  for (const [date, used] of Object.entries(counts)) {
    const free = totalUnits - used;
    occupancyByDate[date] = totalUnits === 0 ? 1 : used / totalUnits;
    if (free <= 0) soldOutNights.push(date);
    if (free < worst) worst = free;
  }

  return { available: Math.max(0, worst), soldOutNights, occupancyByDate };
}

export function isRoomTypeAvailable(
  request: StayInterval,
  totalUnits: number,
  booked: BookedInterval[],
  quantity = 1,
): boolean {
  return remainingInventory(request, totalUnits, booked).available >= quantity;
}

export function selectFreeUnit(
  request: StayInterval,
  unitIds: string[],
  booked: BookedInterval[],
): string | null {
  const busy = new Set(
    booked
      .filter(
        (b) =>
          consumesInventory(b) &&
          rangesOverlap(request.checkIn, request.checkOut, b.checkIn, b.checkOut),
      )
      .map((b) => b.roomUnitId)
      .filter((id): id is string => !!id),
  );
  return unitIds.find((id) => !busy.has(id)) ?? null;
}

export function buildAvailabilityCalendar(
  from: Date | string,
  to: Date | string,
  totalUnits: number,
  booked: BookedInterval[],
): { date: string; remaining: number; occupancy: number }[] {
  const counts = occupiedCountByNight({ checkIn: from, checkOut: to }, booked);
  return Object.entries(counts).map(([date, used]) => ({
    date,
    remaining: Math.max(0, totalUnits - used),
    occupancy: totalUnits === 0 ? 1 : Math.min(1, used / totalUnits),
  }));
}

export function portfolioOccupancy(
  range: StayInterval,
  totalUnits: number,
  booked: BookedInterval[],
): number {
  const nights = eachNight(range.checkIn, range.checkOut).length;
  if (nights === 0 || totalUnits === 0) return 0;
  const counts = occupiedCountByNight(range, booked);
  const soldNights = Object.values(counts).reduce((a, b) => a + b, 0);
  return Math.min(1, soldNights / (nights * totalUnits));
}
