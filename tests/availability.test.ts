import { describe, expect, it } from 'vitest';

import {
  buildAvailabilityCalendar,
  isRoomTypeAvailable,
  occupiedCountByNight,
  portfolioOccupancy,
  remainingInventory,
  selectFreeUnit,
} from '@/lib/availability';
import { eachNight, nightsBetween, rangesOverlap } from '@/lib/dates';

const stay = (checkIn: string, checkOut: string, roomUnitId?: string, status = 'CONFIRMED') => ({
  checkIn, checkOut, roomUnitId, status,
});

describe('rangesOverlap (half-open intervals)', () => {
  it('treats a same-day turnover as no overlap', () => {
    // Guest A checks out on the 5th, guest B checks in on the 5th.
    expect(rangesOverlap('2026-08-01', '2026-08-05', '2026-08-05', '2026-08-08')).toBe(false);
  });

  it('detects a one-night intersection', () => {
    expect(rangesOverlap('2026-08-01', '2026-08-05', '2026-08-04', '2026-08-09')).toBe(true);
  });

  it('detects full containment in both directions', () => {
    expect(rangesOverlap('2026-08-01', '2026-08-30', '2026-08-10', '2026-08-12')).toBe(true);
    expect(rangesOverlap('2026-08-10', '2026-08-12', '2026-08-01', '2026-08-30')).toBe(true);
  });

  it('is symmetric for every pair it is given', () => {
    const pairs: [string, string, string, string][] = [
      ['2026-01-01', '2026-01-05', '2026-01-03', '2026-01-09'],
      ['2026-01-01', '2026-01-05', '2026-01-05', '2026-01-09'],
      ['2026-01-01', '2026-01-05', '2026-02-01', '2026-02-09'],
    ];
    for (const [a, b, c, d] of pairs) {
      expect(rangesOverlap(a, b, c, d)).toBe(rangesOverlap(c, d, a, b));
    }
  });
});

describe('nightsBetween / eachNight', () => {
  it('counts nights, not calendar days', () => {
    expect(nightsBetween('2026-08-01', '2026-08-04')).toBe(3);
    expect(eachNight('2026-08-01', '2026-08-04')).toHaveLength(3);
  });

  it('is immune to daylight-saving boundaries', () => {
    // A DST transition in many timezones; UTC normalisation must ignore it.
    expect(nightsBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(nightsBetween('2026-10-24', '2026-10-26')).toBe(2);
  });
});

describe('occupiedCountByNight', () => {
  it('only counts nights inside the requested window', () => {
    const counts = occupiedCountByNight(
      { checkIn: '2026-08-10', checkOut: '2026-08-13' },
      [stay('2026-08-01', '2026-08-11'), stay('2026-08-12', '2026-08-20')],
    );
    expect(counts).toEqual({ '2026-08-10': 1, '2026-08-11': 0, '2026-08-12': 1 });
  });

  it('ignores cancelled and expired bookings', () => {
    const counts = occupiedCountByNight(
      { checkIn: '2026-08-10', checkOut: '2026-08-11' },
      [stay('2026-08-10', '2026-08-11', 'u1', 'CANCELLED'), stay('2026-08-10', '2026-08-11', 'u2', 'EXPIRED')],
    );
    expect(counts['2026-08-10']).toBe(0);
  });

  it('counts a HELD booking, because a hold reserves inventory', () => {
    const counts = occupiedCountByNight(
      { checkIn: '2026-08-10', checkOut: '2026-08-11' },
      [stay('2026-08-10', '2026-08-11', 'u1', 'HELD')],
    );
    expect(counts['2026-08-10']).toBe(1);
  });
});

describe('remainingInventory', () => {
  it('is bound by the worst night, not the average', () => {
    const result = remainingInventory({ checkIn: '2026-08-10', checkOut: '2026-08-13' }, 3, [
      stay('2026-08-11', '2026-08-12', 'u1'),
      stay('2026-08-11', '2026-08-12', 'u2'),
      stay('2026-08-11', '2026-08-12', 'u3'),
    ]);
    expect(result.available).toBe(0);
    expect(result.soldOutNights).toEqual(['2026-08-11']);
  });

  it('reports per-night occupancy for the pricing engine', () => {
    const result = remainingInventory({ checkIn: '2026-08-10', checkOut: '2026-08-12' }, 4, [
      stay('2026-08-10', '2026-08-11', 'u1'),
      stay('2026-08-10', '2026-08-11', 'u2'),
    ]);
    expect(result.occupancyByDate['2026-08-10']).toBe(0.5);
    expect(result.occupancyByDate['2026-08-11']).toBe(0);
  });

  it('never returns a negative count when oversold', () => {
    const result = remainingInventory({ checkIn: '2026-08-10', checkOut: '2026-08-11' }, 1, [
      stay('2026-08-10', '2026-08-11', 'u1'),
      stay('2026-08-10', '2026-08-11', 'u2'),
    ]);
    expect(result.available).toBe(0);
  });

  it('treats a property with no units as fully occupied', () => {
    const result = remainingInventory({ checkIn: '2026-08-10', checkOut: '2026-08-11' }, 0, []);
    expect(result.available).toBe(0);
    expect(result.occupancyByDate['2026-08-10']).toBe(1);
  });
});

describe('isRoomTypeAvailable', () => {
  it('allows a back-to-back booking on the turnover day', () => {
    expect(
      isRoomTypeAvailable({ checkIn: '2026-08-05', checkOut: '2026-08-08' }, 1, [
        stay('2026-08-01', '2026-08-05', 'u1'),
      ]),
    ).toBe(true);
  });

  it('supports asking for more than one room', () => {
    const booked = [stay('2026-08-05', '2026-08-08', 'u1')];
    expect(isRoomTypeAvailable({ checkIn: '2026-08-05', checkOut: '2026-08-08' }, 3, booked, 2)).toBe(true);
    expect(isRoomTypeAvailable({ checkIn: '2026-08-05', checkOut: '2026-08-08' }, 3, booked, 3)).toBe(false);
  });
});

describe('selectFreeUnit', () => {
  const units = ['u1', 'u2', 'u3'];

  it('skips units with a colliding stay', () => {
    const chosen = selectFreeUnit({ checkIn: '2026-08-10', checkOut: '2026-08-12' }, units, [
      stay('2026-08-09', '2026-08-11', 'u1'),
      stay('2026-08-11', '2026-08-15', 'u2'),
    ]);
    expect(chosen).toBe('u3');
  });

  it('reuses a unit whose previous guest checks out that morning', () => {
    const chosen = selectFreeUnit({ checkIn: '2026-08-10', checkOut: '2026-08-12' }, ['u1'], [
      stay('2026-08-05', '2026-08-10', 'u1'),
    ]);
    expect(chosen).toBe('u1');
  });

  it('returns null when every unit is taken, which the caller treats as a lost race', () => {
    const chosen = selectFreeUnit({ checkIn: '2026-08-10', checkOut: '2026-08-12' }, ['u1'], [
      stay('2026-08-10', '2026-08-12', 'u1'),
    ]);
    expect(chosen).toBeNull();
  });

  it('never returns the same unit twice for overlapping requests', () => {
    const booked: ReturnType<typeof stay>[] = [];
    const assigned = new Set<string>();
    for (let i = 0; i < 3; i += 1) {
      const unit = selectFreeUnit({ checkIn: '2026-08-10', checkOut: '2026-08-12' }, units, booked);
      expect(unit).not.toBeNull();
      expect(assigned.has(unit!)).toBe(false);
      assigned.add(unit!);
      booked.push(stay('2026-08-10', '2026-08-12', unit!, 'HELD'));
    }
    expect(selectFreeUnit({ checkIn: '2026-08-10', checkOut: '2026-08-12' }, units, booked)).toBeNull();
  });
});

describe('buildAvailabilityCalendar', () => {
  it('produces one entry per night with clamped occupancy', () => {
    const cal = buildAvailabilityCalendar('2026-08-01', '2026-08-04', 2, [
      stay('2026-08-01', '2026-08-03', 'u1'),
    ]);
    expect(cal).toHaveLength(3);
    expect(cal[0]).toEqual({ date: '2026-08-01', remaining: 1, occupancy: 0.5 });
    expect(cal[2]).toEqual({ date: '2026-08-03', remaining: 2, occupancy: 0 });
  });
});

describe('portfolioOccupancy', () => {
  it('returns the fraction of sellable room-nights that were sold', () => {
    const occ = portfolioOccupancy({ checkIn: '2026-08-01', checkOut: '2026-08-03' }, 2, [
      stay('2026-08-01', '2026-08-03', 'u1'),
    ]);
    expect(occ).toBeCloseTo(0.5, 5);
  });

  it('is zero for an empty window', () => {
    expect(portfolioOccupancy({ checkIn: '2026-08-01', checkOut: '2026-08-01' }, 5, [])).toBe(0);
  });
});
