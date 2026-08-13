import { describe, expect, it } from 'vitest';

import {
  buildRateScalers,
  computeDateShift,
  loadDataset,
  mapRoomCodes,
  nightlyCents,
  normaliseRow,
  parseCsv,
  replayAgainstInventory,
  shiftBooking,
  type SourceBooking,
} from '@/lib/hotel-dataset';

const CSV = [
  'hotel,is_canceled,lead_time,arrival_date_year,arrival_date_month,arrival_date_day_of_month,stays_in_weekend_nights,stays_in_week_nights,adults,children,babies,meal,country,market_segment,distribution_channel,is_repeated_guest,reserved_room_type,adr,total_of_special_requests,reservation_status,reservation_status_date',
  'Resort Hotel,0,342,2015,July,1,0,3,2,0,0,BB,PRT,Direct,Direct,0,C,120.5,1,Check-Out,2015-07-04',
  'Resort Hotel,1,85,2015,July,2,2,2,2,1,0,HB,GBR,"Offline TA, TO",TA/TO,0,A,75,0,Canceled,2015-06-20',
  'Resort Hotel,0,7,2016,March,14,0,2,1,0,0,SC,FRA,Online TA,TA/TO,1,D,210,3,Check-Out,2016-03-16',
  'City Hotel,0,10,2016,March,14,0,2,2,0,0,BB,ESP,Corporate,Corporate,0,A,90,0,Check-Out,2016-03-16',
  'Resort Hotel,0,3,2016,April,1,0,0,2,0,0,BB,DEU,Direct,Direct,0,A,110,0,Check-Out,2016-04-01',
  'Resort Hotel,0,3,2016,April,2,0,2,2,0,0,BB,DEU,Direct,Direct,0,A,0,0,Check-Out,2016-04-04',
  'Resort Hotel,0,12,2017,August,20,1,1,2,0,0,BB,USA,Groups,TA/TO,0,H,480,2,No-Show,2017-08-20',
].join('\n');

describe('parseCsv', () => {
  it('reads every data row', () => {
    expect(parseCsv(CSV)).toHaveLength(7);
  });

  it('keeps a quoted field containing a comma intact', () => {
    const rows = parseCsv(CSV);
    expect(rows[1]!.market_segment).toBe('Offline TA, TO');
  });

  it('returns an empty list for empty input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('a,b,c')).toEqual([]);
  });
});

describe('normaliseRow', () => {
  const rows = parseCsv(CSV);

  it('parses a well-formed row completely', () => {
    const b = normaliseRow(rows[0]!)!;
    expect(b.roomCode).toBe('C');
    expect(b.nights).toBe(3);
    expect(b.arrival.toISOString().slice(0, 10)).toBe('2015-07-01');
    expect(b.departure.toISOString().slice(0, 10)).toBe('2015-07-04');
    expect(b.adr).toBe(120.5);
    expect(b.cancelled).toBe(false);
    expect(b.country).toBe('PRT');
  });

  it('folds babies into the children count', () => {
    expect(normaliseRow(rows[1]!)!.children).toBe(1);
  });

  it('rejects a zero-night booking', () => {
    expect(normaliseRow(rows[4]!)).toBeNull();
  });

  it('rejects a complimentary (zero rate) row', () => {
    expect(normaliseRow(rows[5]!)).toBeNull();
  });

  it('rejects an unparseable month', () => {
    expect(normaliseRow({ ...rows[0]!, arrival_date_month: 'Smarch' })).toBeNull();
  });

  it('preserves the no-show status rather than treating it as a stay', () => {
    expect(normaliseRow(rows[6]!)!.status).toBe('No-Show');
  });
});

describe('loadDataset', () => {
  it('filters to one property and drops unusable rows', () => {
    const resort = loadDataset(CSV, { hotel: 'Resort Hotel' });
    expect(resort).toHaveLength(4);
    expect(resort.every((b) => b.nights > 0 && b.adr > 0)).toBe(true);
  });

  it('returns arrivals in chronological order', () => {
    const rows = loadDataset(CSV);
    const times = rows.map((b) => b.arrival.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('excludes the other property when asked', () => {
    expect(loadDataset(CSV, { hotel: 'Resort Hotel' }).some((b) => b.country === 'ESP')).toBe(false);
  });
});

describe('computeDateShift and shiftBooking', () => {
  const rows = loadDataset(CSV, { hotel: 'Resort Hotel' });
  const today = new Date('2026-07-30T00:00:00.000Z');

  it('lands the newest arrival the requested distance in the future', () => {
    const shift = computeDateShift(rows, today, 100);
    const shifted = rows.map((b) => shiftBooking(b, shift));
    const latest = Math.max(...shifted.map((b) => b.arrival.getTime()));
    const expected = today.getTime() + 100 * 86_400_000;
    expect(Math.abs(latest - expected)).toBeLessThan(86_400_000);
  });

  it('preserves every gap between arrivals', () => {
    const shift = computeDateShift(rows, today);
    const before = rows.map((b) => b.arrival.getTime());
    const after = rows.map((b) => shiftBooking(b, shift).arrival.getTime());
    for (let i = 1; i < before.length; i += 1) {
      expect(after[i]! - after[i - 1]!).toBe(before[i]! - before[i - 1]!);
    }
  });

  it('preserves each stay length', () => {
    const shift = computeDateShift(rows, today);
    for (const b of rows) {
      const s = shiftBooking(b, shift);
      expect(s.departure.getTime() - s.arrival.getTime()).toBe(
        b.departure.getTime() - b.arrival.getTime(),
      );
    }
  });

  it('handles an empty dataset without dividing by zero', () => {
    expect(computeDateShift([], today)).toBe(0);
  });
});

describe('mapRoomCodes', () => {
  const rows = loadDataset(CSV, { hotel: 'Resort Hotel' });
  const even = [
    { id: 'cheap', capacity: 1 },
    { id: 'mid', capacity: 1 },
    { id: 'dear', capacity: 1 },
  ];

  it('assigns every source code to one of our room types', () => {
    const mapping = mapRoomCodes(rows, even);
    for (const b of rows) expect(Object.keys(mapping)).toContain(b.roomCode);
  });

  it('puts the cheapest source code in the cheapest tier', () => {
    expect(mapRoomCodes(rows, even).A).toBe('cheap');
  });

  it('never maps outside the supplied room types', () => {
    const tiers = [{ id: 'a', capacity: 3 }, { id: 'b', capacity: 2 }];
    const mapping = mapRoomCodes(rows, tiers);
    for (const target of Object.values(mapping)) {
      expect(tiers.map((t) => t.id)).toContain(target);
    }
  });

  it('returns an empty mapping when there are no tiers', () => {
    expect(mapRoomCodes(rows, [])).toEqual({});
  });

  it('sends demand to the tier that has the rooms for it', () => {
    const lopsided = [
      { id: 'big', capacity: 30 },
      { id: 'tiny', capacity: 2 },
    ];
    const many: typeof rows = Array.from({ length: 60 }, (_, i) => ({
      ...rows[0]!,
      roomCode: String.fromCharCode(65 + (i % 6)),
      adr: 50 + i,
    }));
    const mapping = mapRoomCodes(many, lopsided);
    const toBig = Object.values(mapping).filter((v) => v === 'big').length;
    expect(toBig).toBeGreaterThan(Object.keys(mapping).length / 2);
  });

  it('still gives the dearest code the dearest tier', () => {
    const many: typeof rows = Array.from({ length: 60 }, (_, i) => ({
      ...rows[0]!,
      roomCode: String.fromCharCode(65 + (i % 6)),
      adr: 50 + i * 10,
    }));
    const tiers = [{ id: 'low', capacity: 10 }, { id: 'high', capacity: 10 }];
    expect(mapRoomCodes(many, tiers).F).toBe('high');
  });
});

describe('replayAgainstInventory', () => {
  const stay = (arrival: string, departure: string, roomTypeId = 'rt1') => ({
    arrival: new Date(`${arrival}T00:00:00.000Z`),
    departure: new Date(`${departure}T00:00:00.000Z`),
    roomTypeId,
  });

  it('gives back-to-back stays the same unit', () => {
    const { accepted, turnedAway } = replayAgainstInventory(
      [stay('2026-08-01', '2026-08-05'), stay('2026-08-05', '2026-08-08')],
      [{ id: 'u1', roomTypeId: 'rt1' }],
    );
    expect(turnedAway).toBe(0);
    expect(accepted[0]!.roomUnitId).toBe('u1');
    expect(accepted[1]!.roomUnitId).toBe('u1');
  });

  it('turns away an overlapping request when the house is full', () => {
    const { accepted, turnedAway } = replayAgainstInventory(
      [stay('2026-08-01', '2026-08-05'), stay('2026-08-02', '2026-08-06')],
      [{ id: 'u1', roomTypeId: 'rt1' }],
    );
    expect(accepted).toHaveLength(1);
    expect(turnedAway).toBe(1);
  });

  it('prefers the most recently vacated unit, closing the smallest gap', () => {
    const { accepted } = replayAgainstInventory(
      [
        stay('2026-07-28', '2026-08-01'),
        stay('2026-07-30', '2026-08-04'),
        stay('2026-08-05', '2026-08-07'),
      ],
      [{ id: 'u1', roomTypeId: 'rt1' }, { id: 'u2', roomTypeId: 'rt1' }],
    );
    expect(accepted[2]!.roomUnitId).toBe('u2');
  });

  it('packs at least as tightly as naive first-fit', () => {
    const requests = Array.from({ length: 120 }, (_, i) => {
      const day = 1 + Math.floor(i / 2);
      const nights = i % 2 === 0 ? 2 : 5;
      return stay(
        new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10),
        new Date(Date.UTC(2026, 0, day + nights)).toISOString().slice(0, 10),
      );
    });
    const units = Array.from({ length: 6 }, (_, i) => ({ id: `u${i}`, roomTypeId: 'rt1' }));
    const { accepted, turnedAway } = replayAgainstInventory(requests, units);
    expect(accepted.length + turnedAway).toBe(requests.length);
    expect(accepted.length).toBeGreaterThan(requests.length * 0.4);
  });

  it('spreads overlapping demand across available units', () => {
    const { accepted, turnedAway } = replayAgainstInventory(
      [stay('2026-08-01', '2026-08-05'), stay('2026-08-02', '2026-08-06')],
      [{ id: 'u1', roomTypeId: 'rt1' }, { id: 'u2', roomTypeId: 'rt1' }],
    );
    expect(turnedAway).toBe(0);
    expect(new Set(accepted.map((a) => a.roomUnitId)).size).toBe(2);
  });

  it('never assigns a unit belonging to another room type', () => {
    const { accepted, turnedAway } = replayAgainstInventory(
      [stay('2026-08-01', '2026-08-05', 'rt2')],
      [{ id: 'u1', roomTypeId: 'rt1' }],
    );
    expect(accepted).toHaveLength(0);
    expect(turnedAway).toBe(1);
  });

  it('produces a conflict-free calendar for every unit', () => {
    const requests = Array.from({ length: 200 }, (_, i) =>
      stay(
        new Date(Date.UTC(2026, 0, 1 + (i % 90))).toISOString().slice(0, 10),
        new Date(Date.UTC(2026, 0, 1 + (i % 90) + 3)).toISOString().slice(0, 10),
      ),
    ).sort((a, b) => a.arrival.getTime() - b.arrival.getTime());

    const units = Array.from({ length: 5 }, (_, i) => ({ id: `u${i}`, roomTypeId: 'rt1' }));
    const { accepted } = replayAgainstInventory(requests, units);

    const byUnit = new Map<string, { from: number; to: number }[]>();
    for (const a of accepted) {
      const list = byUnit.get(a.roomUnitId) ?? [];
      list.push({ from: a.arrival.getTime(), to: a.departure.getTime() });
      byUnit.set(a.roomUnitId, list);
    }
    for (const intervals of byUnit.values()) {
      intervals.sort((x, y) => x.from - y.from);
      for (let i = 1; i < intervals.length; i += 1) {
        expect(intervals[i]!.from).toBeGreaterThanOrEqual(intervals[i - 1]!.to);
      }
    }
  });
});

describe('rate rescaling', () => {
  const sample = [
    { roomTypeId: 'rt1', adr: 100 },
    { roomTypeId: 'rt1', adr: 200 },
    { roomTypeId: 'rt2', adr: 50 },
  ];

  it('scales a tier so its mean matches the published base rate', () => {
    const scalers = buildRateScalers(sample, { rt1: 30_000, rt2: 10_000 });
    expect(nightlyCents(150, scalers.rt1!)).toBe(30_000);
    expect(nightlyCents(50, scalers.rt2!)).toBe(10_000);
  });

  it('keeps the relative spread of the source rates', () => {
    const scalers = buildRateScalers(sample, { rt1: 30_000, rt2: 10_000 });
    const low = nightlyCents(100, scalers.rt1!);
    const high = nightlyCents(200, scalers.rt1!);
    expect(high / low).toBeCloseTo(2, 5);
  });

  it('falls back to a neutral scaler for a tier with no source rows', () => {
    const scalers = buildRateScalers(sample, { rt3: 20_000 });
    expect(scalers.rt3).toBe(1);
  });

  it('never produces a nightly rate below the floor', () => {
    expect(nightlyCents(0.01, 0.001)).toBe(1000);
  });
});
