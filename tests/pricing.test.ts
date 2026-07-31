import { describe, expect, it } from 'vitest';

import {
  WEEKEND_MULTIPLIER,
  cheapestNightlyFrom,
  demandMultiplier,
  leadTimeMultiplier,
  lengthOfStayDiscountPct,
  quoteStay,
  refundForCancellation,
  resolveSeasonalMultiplier,
} from '@/lib/pricing';

const BASE = 20_000; // $200.00
// A Monday, so the first three nights are all weekday nights.
const MONDAY = '2026-09-07';
// Far enough ahead that the lead-time multiplier is neutral, so these tests
// isolate one pricing factor at a time.
const TODAY = new Date('2026-08-20T00:00:00.000Z');

describe('demandMultiplier', () => {
  it('discounts a soft window and surges a full house', () => {
    expect(demandMultiplier(0.1)).toBeLessThan(1);
    expect(demandMultiplier(0.4)).toBe(1);
    expect(demandMultiplier(0.99)).toBeGreaterThan(1.5);
  });

  it('is monotonically non-decreasing in occupancy', () => {
    let previous = 0;
    for (let o = 0; o <= 1.0001; o += 0.05) {
      const current = demandMultiplier(o);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it('clamps inputs outside [0, 1]', () => {
    expect(demandMultiplier(-3)).toBe(demandMultiplier(0));
    expect(demandMultiplier(9)).toBe(demandMultiplier(1));
  });
});

describe('leadTimeMultiplier', () => {
  it('discounts distressed inventory and rewards early planners', () => {
    expect(leadTimeMultiplier(1)).toBeLessThan(1);
    expect(leadTimeMultiplier(200)).toBeLessThan(1);
    expect(leadTimeMultiplier(20)).toBe(1);
  });

  it('never moves the price by more than 12%', () => {
    for (let d = 0; d < 400; d += 1) {
      expect(leadTimeMultiplier(d)).toBeGreaterThanOrEqual(0.88);
      expect(leadTimeMultiplier(d)).toBeLessThanOrEqual(1);
    }
  });
});

describe('lengthOfStayDiscountPct', () => {
  it('is a non-decreasing step function capped at 25%', () => {
    expect(lengthOfStayDiscountPct(1)).toBe(0);
    expect(lengthOfStayDiscountPct(4)).toBe(6);
    expect(lengthOfStayDiscountPct(7)).toBe(12);
    expect(lengthOfStayDiscountPct(365)).toBe(25);
  });
});

describe('resolveSeasonalMultiplier', () => {
  const rules = [
    { label: 'Peak', startDate: '2026-12-01', endDate: '2026-12-31', multiplier: 1.4, priority: 5 },
    { label: 'New Year', startDate: '2026-12-28', endDate: '2027-01-02', multiplier: 2.0, priority: 10 },
  ];

  it('returns a neutral multiplier outside every window', () => {
    expect(resolveSeasonalMultiplier(new Date('2026-06-01'), rules).multiplier).toBe(1);
  });

  it('lets the highest priority rule win on overlapping windows', () => {
    const result = resolveSeasonalMultiplier(new Date('2026-12-30'), rules);
    expect(result.label).toBe('New Year');
    expect(result.multiplier).toBe(2.0);
  });

  it('is inclusive of both boundary dates', () => {
    expect(resolveSeasonalMultiplier(new Date('2026-12-01'), rules).label).toBe('Peak');
    expect(resolveSeasonalMultiplier(new Date('2026-12-31'), rules).label).toBe('New Year');
  });
});

describe('quoteStay', () => {
  it('rejects a zero or negative length stay', () => {
    expect(() =>
      quoteStay({ baseRateCents: BASE, checkIn: MONDAY, checkOut: MONDAY, adults: 2, children: 0, maxAdults: 2 }),
    ).toThrow(RangeError);
  });

  it('prices a plain weekday stay at the base rate', () => {
    const q = quoteStay({
      baseRateCents: BASE, checkIn: MONDAY, checkOut: '2026-09-10',
      adults: 2, children: 0, maxAdults: 2, today: TODAY,
    });
    expect(q.nights).toBe(3);
    expect(q.nightly.every((n) => n.rateCents === BASE)).toBe(true);
    expect(q.roomSubtotalCents).toBe(BASE * 3);
  });

  it('applies the weekend surcharge to Friday and Saturday nights only', () => {
    // 2026-09-11 is a Friday. Nights: Fri, Sat, Sun.
    const q = quoteStay({
      baseRateCents: BASE, checkIn: '2026-09-11', checkOut: '2026-09-14',
      adults: 2, children: 0, maxAdults: 2, today: TODAY,
    });
    expect(q.nightly[0]!.rateCents).toBe(Math.round(BASE * WEEKEND_MULTIPLIER));
    expect(q.nightly[1]!.rateCents).toBe(Math.round(BASE * WEEKEND_MULTIPLIER));
    expect(q.nightly[2]!.rateCents).toBe(BASE);
  });

  it('charges for extra adults beyond the room capacity', () => {
    const q = quoteStay({
      baseRateCents: BASE, checkIn: MONDAY, checkOut: '2026-09-09',
      adults: 3, children: 0, maxAdults: 2, today: TODAY,
    });
    expect(q.extraGuestCents).toBe(4000 * 1 * 2);
  });

  it('keeps every monetary field an integer number of cents', () => {
    const q = quoteStay({
      baseRateCents: 18_333, checkIn: MONDAY, checkOut: '2026-09-14',
      adults: 3, children: 1, maxAdults: 2, today: TODAY,
      occupancyByDate: { '2026-09-07': 0.87, '2026-09-08': 0.33 },
      rateRules: [{ label: 'Peak', startDate: '2026-09-01', endDate: '2026-09-30', multiplier: 1.21, priority: 1 }],
      ratePlanAdjustmentPct: -15,
    });
    for (const [key, value] of Object.entries(q)) {
      if (typeof value === 'number') {
        expect(Number.isInteger(value), `${key} must be an integer`).toBe(true);
      }
    }
  });

  it('reconciles: total equals subtotal plus fees plus taxes', () => {
    const q = quoteStay({
      baseRateCents: BASE, checkIn: MONDAY, checkOut: '2026-09-14',
      adults: 2, children: 0, maxAdults: 2, today: TODAY,
    });
    expect(q.totalCents).toBe(q.subtotalCents + q.feesCents + q.taxesCents);
    expect(q.feesCents).toBe(q.resortFeeCents + q.serviceFeeCents);
  });

  it('makes a longer stay cheaper per night than a shorter one', () => {
    const short = quoteStay({
      baseRateCents: BASE, checkIn: MONDAY, checkOut: '2026-09-09',
      adults: 2, children: 0, maxAdults: 2, today: TODAY,
    });
    const long = quoteStay({
      baseRateCents: BASE, checkIn: MONDAY, checkOut: '2026-09-21',
      adults: 2, children: 0, maxAdults: 2, today: TODAY,
    });
    const shortPerNight = short.totalCents / short.nights;
    const longPerNight = long.totalCents / long.nights;
    expect(longPerNight).toBeLessThan(shortPerNight);
  });

  it('records a human-readable reason for every applied factor', () => {
    const q = quoteStay({
      baseRateCents: BASE, checkIn: '2026-09-11', checkOut: '2026-09-12',
      adults: 2, children: 0, maxAdults: 2, today: TODAY,
      occupancyByDate: { '2026-09-11': 0.96 },
    });
    const labels = q.nightly[0]!.factors.map((f) => f.label);
    expect(labels).toContain('Weekend night');
    expect(labels.some((l) => l.includes('High demand'))).toBe(true);
  });
});

describe('refundForCancellation', () => {
  const checkIn = '2026-10-10T00:00:00.000Z';

  it('refunds in full inside the free window', () => {
    const r = refundForCancellation({
      totalCents: 50_000, checkIn, cancellationHours: 48, refundable: true,
      now: new Date('2026-10-01T00:00:00.000Z'),
    });
    expect(r.refundCents).toBe(50_000);
    expect(r.penaltyCents).toBe(0);
  });

  it('charges 50% for a late cancellation', () => {
    const r = refundForCancellation({
      totalCents: 50_000, checkIn, cancellationHours: 48, refundable: true,
      now: new Date('2026-10-09T12:00:00.000Z'),
    });
    expect(r.refundCents).toBe(25_000);
  });

  it('refunds nothing on a non-refundable plan', () => {
    const r = refundForCancellation({
      totalCents: 50_000, checkIn, cancellationHours: 48, refundable: false,
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(r.refundCents).toBe(0);
  });

  it('never refunds more than was paid', () => {
    for (const days of [-5, 0, 1, 2, 10, 60]) {
      const now = new Date(new Date(checkIn).getTime() - days * 86_400_000);
      const r = refundForCancellation({ totalCents: 12_345, checkIn, cancellationHours: 48, refundable: true, now });
      expect(r.refundCents + r.penaltyCents).toBe(12_345);
      expect(r.refundCents).toBeLessThanOrEqual(12_345);
    }
  });
});

describe('cheapestNightlyFrom', () => {
  it('falls back to the base rate without dates', () => {
    expect(cheapestNightlyFrom(BASE)).toBe(BASE);
  });

  it('never exceeds the highest nightly rate in the stay', () => {
    const from = cheapestNightlyFrom(BASE, '2026-09-11', '2026-09-14');
    expect(from).toBeLessThanOrEqual(Math.round(BASE * WEEKEND_MULTIPLIER));
  });
});
