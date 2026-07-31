/**
 * Adapter for the Hotel Booking Demand dataset.
 *
 *   Antonio, N., de Almeida, A., & Nunes, L. (2019).
 *   "Hotel booking demand datasets." Data in Brief, 22, 41-49.
 *   119,390 real reservations from two Portuguese hotels, arrivals
 *   July 2015 to August 2017. Openly licensed.
 *
 * What is real: lead time, length of stay, party composition, cancellation
 * and no-show behaviour, average daily rate, arrival seasonality, market
 * segment, distribution channel, and country of origin.
 *
 * What this module has to synthesise, because the source cannot provide it:
 *   * Physical room numbers. The dataset anonymises room types to letters and
 *     carries no unit inventory, so arrivals are replayed against this
 *     property's 42 units and anything that does not fit is dropped, exactly
 *     as a real property turns business away when it is full.
 *   * Guest identity. The dataset is anonymised, as it must be.
 *   * Calendar position. Arrivals are shifted forward as one rigid block, so
 *     every interval, gap, and seasonal peak is preserved relative to the
 *     others while the data lands around today.
 *
 * Everything here is pure so the transformation can be unit tested against a
 * fixture rather than a 40 MB download.
 */

export const DATASET_CITATION =
  'Antonio, Almeida & Nunes (2019), Hotel booking demand datasets, Data in Brief 22:41-49';

export const DATASET_URL =
  'https://raw.githubusercontent.com/rfordatascience/tidytuesday/main/data/2020/2020-02-11/hotels.csv';

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

export interface SourceBooking {
  /** Anonymised room type code from the source, e.g. "A". */
  roomCode: string;
  arrival: Date;
  departure: Date;
  nights: number;
  leadTimeDays: number;
  adults: number;
  children: number;
  /** Average daily rate as recorded by the hotel, in euros. */
  adr: number;
  cancelled: boolean;
  status: 'Check-Out' | 'Canceled' | 'No-Show';
  statusDate: Date | null;
  marketSegment: string;
  distributionChannel: string;
  country: string;
  repeatedGuest: boolean;
  specialRequests: number;
  mealPlan: string;
}

/** Minimal RFC 4180 parser. The dataset quotes a few fields containing commas. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += char;
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  const header = rows.shift();
  if (!header) return [];

  return rows
    .filter((r) => r.length >= header.length - 1 && r.some((v) => v !== ''))
    .map((r) => {
      const record: Record<string, string> = {};
      header.forEach((key, i) => { record[key.trim()] = (r[i] ?? '').trim(); });
      return record;
    });
}

const num = (value: string | undefined) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Turn one raw CSV record into a booking, or null when the row cannot support
 * a reservation: zero nights, a non-positive rate (complimentary and
 * "undefined" rows), or an unparseable arrival date.
 */
export function normaliseRow(record: Record<string, string>): SourceBooking | null {
  const monthIndex = MONTHS[(record.arrival_date_month ?? '').toLowerCase()];
  if (monthIndex === undefined) return null;

  const year = num(record.arrival_date_year);
  const day = num(record.arrival_date_day_of_month);
  if (!year || !day) return null;

  const nights = num(record.stays_in_weekend_nights) + num(record.stays_in_week_nights);
  if (nights <= 0 || nights > 30) return null;

  const adr = num(record.adr);
  if (adr <= 0 || adr > 1000) return null;

  const adults = num(record.adults);
  if (adults <= 0 || adults > 8) return null;

  const arrival = new Date(Date.UTC(year, monthIndex, day));
  if (Number.isNaN(arrival.getTime())) return null;

  const rawStatus = record.reservation_status ?? '';
  const status: SourceBooking['status'] =
    rawStatus === 'Canceled' ? 'Canceled' : rawStatus === 'No-Show' ? 'No-Show' : 'Check-Out';

  const statusDate = record.reservation_status_date
    ? new Date(`${record.reservation_status_date}T00:00:00.000Z`)
    : null;

  return {
    roomCode: (record.reserved_room_type || 'A').toUpperCase(),
    arrival,
    departure: new Date(arrival.getTime() + nights * 86_400_000),
    nights,
    leadTimeDays: Math.min(600, num(record.lead_time)),
    adults,
    children: Math.min(6, num(record.children) + num(record.babies)),
    adr,
    cancelled: record.is_canceled === '1',
    status,
    statusDate: statusDate && !Number.isNaN(statusDate.getTime()) ? statusDate : null,
    marketSegment: record.market_segment || 'Undefined',
    distributionChannel: record.distribution_channel || 'Undefined',
    country: record.country || 'UNK',
    repeatedGuest: record.is_repeated_guest === '1',
    specialRequests: Math.min(5, num(record.total_of_special_requests)),
    mealPlan: record.meal || 'SC',
  };
}

export function loadDataset(
  csv: string,
  options: { hotel?: string } = {},
): SourceBooking[] {
  const wanted = options.hotel;
  return parseCsv(csv)
    .filter((r) => !wanted || r.hotel === wanted)
    .map(normaliseRow)
    .filter((b): b is SourceBooking => b !== null)
    .sort((a, b) => a.arrival.getTime() - b.arrival.getTime());
}

/**
 * Shift the whole stream forward as one rigid block so the newest arrival
 * lands `daysAhead` in the future. Every relative interval survives, which is
 * the point: seasonality, weekday shape, and lead times stay intact.
 */
export function computeDateShift(
  bookings: SourceBooking[],
  today: Date,
  daysAhead = 100,
): number {
  if (!bookings.length) return 0;
  const latest = Math.max(...bookings.map((b) => b.arrival.getTime()));
  const target = today.getTime() + daysAhead * 86_400_000;
  return Math.round((target - latest) / 86_400_000);
}

export function shiftBooking(booking: SourceBooking, days: number): SourceBooking {
  const ms = days * 86_400_000;
  return {
    ...booking,
    arrival: new Date(booking.arrival.getTime() + ms),
    departure: new Date(booking.departure.getTime() + ms),
    statusDate: booking.statusDate ? new Date(booking.statusDate.getTime() + ms) : null,
  };
}

/**
 * Rank the source's anonymised room codes by their mean rate and distribute
 * them across this property's room types, cheapest to dearest.
 *
 * Demand is allocated in proportion to each tier's *inventory*, not evenly.
 * Splitting seven ways regardless of size sends a seventh of all demand at a
 * two-room penthouse while a ten-room category sits half empty, so most of the
 * dataset is refused for no good reason. Weighting by capacity is both the
 * realistic model and the one that wastes less of the source.
 */
export interface RoomTier {
  id: string;
  /** Number of sellable physical units in this tier. */
  capacity: number;
}

export function mapRoomCodes(
  bookings: SourceBooking[],
  tiers: RoomTier[],
): Record<string, string> {
  if (!tiers.length) return {};

  const stats = new Map<string, { total: number; count: number }>();
  for (const b of bookings) {
    const entry = stats.get(b.roomCode) ?? { total: 0, count: 0 };
    entry.total += b.adr;
    entry.count += 1;
    stats.set(b.roomCode, entry);
  }

  const ranked = [...stats.entries()]
    .map(([code, s]) => ({ code, mean: s.total / s.count, count: s.count }))
    .sort((a, b) => a.mean - b.mean);

  const totalVolume = ranked.reduce((acc, r) => acc + r.count, 0) || 1;
  const totalCapacity = tiers.reduce((acc, t) => acc + Math.max(0, t.capacity), 0) || tiers.length;

  // Cumulative share of inventory at the top of each tier.
  const thresholds: number[] = [];
  let cumulative = 0;
  for (const tier of tiers) {
    cumulative += Math.max(0, tier.capacity) || 1;
    thresholds.push(cumulative / totalCapacity);
  }

  const mapping: Record<string, string> = {};
  let running = 0;
  for (const entry of ranked) {
    // Place each code by the midpoint of its volume block, so a code is not
    // pushed into the next tier just because it happens to straddle a border.
    const midpoint = (running + entry.count / 2) / totalVolume;
    const index = thresholds.findIndex((t) => midpoint <= t);
    mapping[entry.code] = tiers[index === -1 ? tiers.length - 1 : index]!.id;
    running += entry.count;
  }
  return mapping;
}

export interface ReplayUnit {
  id: string;
  roomTypeId: string;
}

export interface ReplayResult<T> {
  accepted: (T & { roomUnitId: string })[];
  turnedAway: number;
}

/**
 * Replay the arrival stream against real inventory.
 *
 * Because arrivals are processed in chronological order, a unit is free for a
 * request exactly when its last departure is on or before the new arrival,
 * which is the same half-open interval rule the live booking engine uses. A
 * request with no free unit is turned away rather than silently overbooked.
 *
 * Among the free units it takes the one vacated *most recently*, which is
 * best-fit rather than first-fit. First-fit keeps reaching for whichever unit
 * happens to sit earliest in the list, scattering short unsellable gaps across
 * the rest of the floor; best-fit closes the smallest gap it can and leaves the
 * longer-idle rooms open for longer stays. It is the same instinct a front
 * office manager has, and it is worth several points of occupancy.
 */
export function replayAgainstInventory<
  T extends { arrival: Date; departure: Date; roomTypeId: string },
>(bookings: T[], units: ReplayUnit[]): ReplayResult<T> {
  const byType = new Map<string, ReplayUnit[]>();
  for (const unit of units) {
    const list = byType.get(unit.roomTypeId) ?? [];
    list.push(unit);
    byType.set(unit.roomTypeId, list);
  }

  const lastDeparture = new Map<string, number>();
  const accepted: (T & { roomUnitId: string })[] = [];
  let turnedAway = 0;

  for (const booking of bookings) {
    const candidates = byType.get(booking.roomTypeId) ?? [];
    const arrival = booking.arrival.getTime();

    let unit: ReplayUnit | undefined;
    let bestVacatedAt = -Infinity;
    for (const candidate of candidates) {
      const vacatedAt = lastDeparture.get(candidate.id) ?? -Infinity;
      // Strict `>` so ties resolve to the first unit in code order, which
      // keeps assignment deterministic across runs.
      if (vacatedAt <= arrival && (unit === undefined || vacatedAt > bestVacatedAt)) {
        unit = candidate;
        bestVacatedAt = vacatedAt;
      }
    }

    if (!unit) {
      turnedAway += 1;
      continue;
    }

    lastDeparture.set(unit.id, booking.departure.getTime());
    accepted.push({ ...booking, roomUnitId: unit.id });
  }

  return { accepted, turnedAway };
}

/**
 * Rescale the source's euro rates onto this property's published rate card.
 *
 * Using the raw figures directly would contradict the rates shown on the room
 * pages, so each tier is scaled by the ratio of its published base rate to the
 * mean rate the source recorded for that tier. Relative dispersion and
 * seasonality survive; the absolute level matches the catalogue.
 */
export function buildRateScalers(
  bookings: { roomTypeId: string; adr: number }[],
  baseRateByRoomType: Record<string, number>,
): Record<string, number> {
  const stats = new Map<string, { total: number; count: number }>();
  for (const b of bookings) {
    const entry = stats.get(b.roomTypeId) ?? { total: 0, count: 0 };
    entry.total += b.adr;
    entry.count += 1;
    stats.set(b.roomTypeId, entry);
  }

  const scalers: Record<string, number> = {};
  for (const [roomTypeId, base] of Object.entries(baseRateByRoomType)) {
    const entry = stats.get(roomTypeId);
    const mean = entry && entry.count > 0 ? entry.total / entry.count : 0;
    scalers[roomTypeId] = mean > 0 ? base / 100 / mean : 1;
  }
  return scalers;
}

/** Nightly rate in integer cents, after rescaling. */
export function nightlyCents(adr: number, scaler: number): number {
  return Math.max(1000, Math.round(adr * scaler * 100));
}
