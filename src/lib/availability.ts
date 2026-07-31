/**
 * Availability algebra.
 *
 * Pure, database-free functions describing what "available" means. The server
 * layer feeds these with rows from Postgres; the unit tests feed them with
 * fixtures. Keeping them separate is what makes concurrency bugs testable.
 */

import { eachNight, rangesOverlap, toDateKey } from './dates';

export interface StayInterval {
  checkIn: Date | string;
  checkOut: Date | string;
}

export interface BookedInterval extends StayInterval {
  roomUnitId?: string | null;
  status?: string;
}

/** Statuses that consume inventory. HELD counts: that is the point of a hold. */
export const BLOCKING_STATUSES = ['HELD', 'CONFIRMED', 'CHECKED_IN'] as const;

export function isBlocking(status: string | undefined): boolean {
  return !!status && (BLOCKING_STATUSES as readonly string[]).includes(status);
}

/** How many of a room type are consumed on each night of a candidate stay. */
export function occupiedCountByNight(
  request: StayInterval,
  booked: BookedInterval[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const night of eachNight(request.checkIn, request.checkOut)) {
    counts[toDateKey(night)] = 0;
  }
  for (const b of booked) {
    if (b.status && !isBlocking(b.status)) continue;
    for (const night of eachNight(b.checkIn, b.checkOut)) {
      const key = toDateKey(night);
      if (key in counts) counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * Remaining inventory for a room type across a requested stay. The binding
 * constraint is the single worst night, not the average.
 */
export function remainingInventory(
  request: StayInterval,
  totalUnits: number,
  booked: BookedInterval[],
): { available: number; soldOutNights: string[]; occupancyByDate: Record<string, number> } {
  const counts = occupiedCountByNight(request, booked);
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

/**
 * Pick a physical room unit that is free for the whole stay. Returns null when
 * every unit collides, which the transaction treats as a lost race.
 */
export function selectFreeUnit(
  request: StayInterval,
  unitIds: string[],
  booked: BookedInterval[],
): string | null {
  const busy = new Set(
    booked
      .filter((b) => isBlocking(b.status) && rangesOverlap(request.checkIn, request.checkOut, b.checkIn, b.checkOut))
      .map((b) => b.roomUnitId)
      .filter((id): id is string => !!id),
  );
  return unitIds.find((id) => !busy.has(id)) ?? null;
}

/** Calendar payload for the room detail page: which nights can be sold. */
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

/** Portfolio-level occupancy for the admin dashboard. */
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
