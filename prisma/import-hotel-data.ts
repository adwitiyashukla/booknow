import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { PrismaClient, type BookingStatus, type Prisma } from '@prisma/client';

import {
  DATASET_CITATION,
  DATASET_URL,
  buildRateScalers,
  computeDateShift,
  loadDataset,
  mapRoomCodes,
  nightlyCents,
  replayAgainstInventory,
  shiftBooking,
  type SourceBooking,
} from '../src/lib/hotel-dataset';
import { confirmationMessage, describeDatabaseTarget, requiresConfirmation } from '../src/lib/db-target';

const db = new PrismaClient();

const CACHE_DIR = path.join(process.cwd(), 'prisma', '.data');
const CACHE_FILE = path.join(CACHE_DIR, 'hotels.csv');

const DAY = 86_400_000;
const today = new Date(
  Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()),
);

function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260730);

async function ensureDataset(): Promise<string> {
  if (existsSync(CACHE_FILE)) {
    console.log(`Using cached dataset at ${path.relative(process.cwd(), CACHE_FILE)}`);
    return readFileSync(CACHE_FILE, 'utf8');
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  console.log('Downloading the hotel booking demand dataset (about 40 MB, once)...');

  const response = await fetch(DATASET_URL);
  if (!response.ok || !response.body) {
    throw new Error(`Could not download the dataset: HTTP ${response.status}`);
  }
  await pipeline(response.body as unknown as NodeJS.ReadableStream, createWriteStream(CACHE_FILE));
  console.log('Download complete.');
  return readFileSync(CACHE_FILE, 'utf8');
}

const NAME_POOLS: Record<string, [string[], string[]]> = {
  PRT: [['Miguel', 'Ana', 'Joao', 'Beatriz', 'Rui', 'Ines'], ['Silva', 'Santos', 'Ferreira', 'Costa', 'Oliveira']],
  GBR: [['Oliver', 'Amelia', 'Harry', 'Isla', 'George', 'Freya'], ['Smith', 'Taylor', 'Walker', 'Hughes', 'Bennett']],
  FRA: [['Lucas', 'Chloe', 'Hugo', 'Manon', 'Nathan', 'Camille'], ['Bernard', 'Dubois', 'Moreau', 'Laurent', 'Girard']],
  ESP: [['Alejandro', 'Lucia', 'Pablo', 'Marta', 'Diego', 'Carmen'], ['Garcia', 'Fernandez', 'Lopez', 'Ruiz', 'Molina']],
  DEU: [['Lukas', 'Hannah', 'Felix', 'Lena', 'Jonas', 'Mia'], ['Muller', 'Schmidt', 'Weber', 'Wagner', 'Becker']],
  ITA: [['Marco', 'Giulia', 'Matteo', 'Sofia', 'Luca', 'Chiara'], ['Rossi', 'Russo', 'Greco', 'Bruno', 'Conti']],
  IRL: [['Sean', 'Aoife', 'Cian', 'Niamh', 'Fionn', 'Saoirse'], ['Murphy', 'Kelly', 'Byrne', 'Doyle', 'Walsh']],
  USA: [['Ethan', 'Ava', 'Mason', 'Harper', 'Logan', 'Nora'], ['Johnson', 'Miller', 'Davis', 'Wilson', 'Brooks']],
  BRA: [['Gabriel', 'Larissa', 'Thiago', 'Camila', 'Bruno', 'Fernanda'], ['Souza', 'Almeida', 'Barbosa', 'Ribeiro', 'Rocha']],
  NLD: [['Daan', 'Sanne', 'Bram', 'Fleur', 'Sem', 'Julia'], ['de Vries', 'Jansen', 'Visser', 'Bakker', 'Meijer']],
  IND: [['Arjun', 'Ananya', 'Rohan', 'Priya', 'Kabir', 'Meera'], ['Sharma', 'Iyer', 'Nair', 'Deshpande', 'Menon']],
};
const FALLBACK: [string[], string[]] = [
  ['Alex', 'Sam', 'Noor', 'Yuki', 'Omar', 'Elif', 'Ivan', 'Lea'],
  ['Novak', 'Kovacs', 'Hassan', 'Larsen', 'Okafor', 'Petrov', 'Tanaka'],
];

function nameFor(country: string, n: number): string {
  const [first, last] = NAME_POOLS[country] ?? FALLBACK;
  return `${first[n % first.length]} ${last[Math.floor(n / first.length) % last.length]}`;
}

function statusFor(b: SourceBooking): BookingStatus {
  if (b.status === 'No-Show') return 'NO_SHOW';
  if (b.cancelled || b.status === 'Canceled') return 'CANCELLED';
  if (b.departure.getTime() <= today.getTime()) return 'CHECKED_OUT';
  if (b.arrival.getTime() <= today.getTime()) return 'CHECKED_IN';
  return 'CONFIRMED';
}

async function main() {
  const target = describeDatabaseTarget(process.env.DATABASE_URL);
  console.log(`Target database: ${target.label}${target.isLocal ? '' : '  [REMOTE]'}`);
  if (requiresConfirmation(target)) {
    console.error(confirmationMessage(target, 'db:import:real'));
    process.exit(1);
  }

  console.log(`\nSource: ${DATASET_CITATION}\n`);
  const csv = await ensureDataset();

  console.log('Parsing...');
  const all = loadDataset(csv, { hotel: 'Resort Hotel' });
  console.log(`  ${all.length.toLocaleString()} usable reservations after cleaning`);

  const roomTypes = await db.roomType.findMany({
    orderBy: { baseRateCents: 'asc' },
    include: { units: { where: { status: 'AVAILABLE' }, select: { id: true }, orderBy: { code: 'asc' } } },
  });
  if (!roomTypes.length) {
    throw new Error('No room catalogue found. Run `npm run db:seed` first, then re-run this import.');
  }
  const units = roomTypes.flatMap((rt) => rt.units.map((u) => ({ id: u.id, roomTypeId: rt.id })));
  console.log(`  ${roomTypes.length} room types, ${units.length} sellable units`);

  const shift = computeDateShift(all, today, 100);
  const shifted = all.map((b) => shiftBooking(b, shift));
  console.log(`  shifted arrivals forward by ${shift} days to straddle today`);

  const codeToRoomType = mapRoomCodes(
    shifted,
    roomTypes.map((rt) => ({ id: rt.id, capacity: rt.units.length })),
  );

  const kept = shifted
    .filter((b) => !b.cancelled && b.status !== 'Canceled')
    .map((b) => ({ ...b, roomTypeId: codeToRoomType[b.roomCode] ?? roomTypes[0]!.id }));

  const { accepted, turnedAway } = replayAgainstInventory(kept, units);
  const acceptanceRate = kept.length ? accepted.length / kept.length : 0;
  console.log(
    `  replayed against inventory: ${accepted.length.toLocaleString()} accepted, ` +
      `${turnedAway.toLocaleString()} turned away (${(acceptanceRate * 100).toFixed(1)}% fit)`,
  );

  const cancellations = shifted
    .filter((b) => b.cancelled || b.status === 'Canceled')
    .filter(() => rand() < acceptanceRate)
    .map((b) => ({
      ...b,
      roomTypeId: codeToRoomType[b.roomCode] ?? roomTypes[0]!.id,
      roomUnitId: null as string | null,
    }));

  const ledger = [...accepted, ...cancellations].sort(
    (a, b) => a.arrival.getTime() - b.arrival.getTime(),
  );
  console.log(`  ledger: ${ledger.length.toLocaleString()} reservations`);

  const baseRateByRoomType = Object.fromEntries(roomTypes.map((rt) => [rt.id, rt.baseRateCents]));
  const scalers = buildRateScalers(accepted, baseRateByRoomType);

  console.log('Creating guest records...');
  const countries = [...new Set(ledger.map((b) => b.country))];
  const guestCount = Math.min(600, Math.max(120, Math.round(ledger.length / 12)));
  const guestData = Array.from({ length: guestCount }, (_, i) => {
    const country = countries[i % countries.length] ?? 'UNK';
    const name = nameFor(country, i);
    return {
      email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.${i}@example.com`,
      name,
      role: 'GUEST' as const,
      loyaltyPoints: Math.floor(rand() * 9000),
      loyaltyTier: (['EXPLORER', 'VOYAGER', 'FOUNDER'] as const)[Math.floor(rand() * 3)]!,
    };
  });

  console.log('Clearing the synthetic ledger...');
  await db.$transaction([
    db.bookingEvent.deleteMany(),
    db.payment.deleteMany(),
    db.review.deleteMany(),
    db.booking.deleteMany(),
  ]);
  await db.user.deleteMany({ where: { role: 'GUEST', email: { contains: '@example.com' } } });
  await db.user.createMany({ data: guestData, skipDuplicates: true });

  const guests = await db.user.findMany({ where: { role: 'GUEST' }, select: { id: true, name: true, email: true } });
  if (!guests.length) throw new Error('No guest users available.');

  console.log('Writing reservations...');
  const rows: Prisma.BookingCreateManyInput[] = ledger.map((b, i) => {
    const guest = guests[i % guests.length]!;
    const nightly = nightlyCents(b.adr, scalers[b.roomTypeId] ?? 1);
    const subtotal = nightly * b.nights;
    const fees = 3500 * b.nights + Math.round(subtotal * 0.05);
    const taxes = Math.round((subtotal + 3500 * b.nights) * 0.12);
    const status = statusFor(b);
    const createdAt = new Date(b.arrival.getTime() - b.leadTimeDays * DAY);

    return {
      reference: `BN-${String(200000 + i)}`,
      userId: guest.id,
      roomTypeId: b.roomTypeId,
      roomUnitId: 'roomUnitId' in b ? (b.roomUnitId as string | null) : null,
      status,
      guestName: guest.name,
      guestEmail: guest.email,
      checkIn: b.arrival,
      checkOut: b.departure,
      nights: b.nights,
      adults: b.adults,
      children: b.children,
      subtotalCents: subtotal,
      taxesCents: taxes,
      feesCents: fees,
      totalCents: subtotal + taxes + fees,
      priceBreakdown: Array.from({ length: b.nights }, (_, n) => ({
        date: new Date(b.arrival.getTime() + n * DAY).toISOString().slice(0, 10),
        rateCents: nightly,
      })) as unknown as Prisma.InputJsonValue,
      createdAt,
      confirmedAt: status === 'CANCELLED' ? null : createdAt,
      cancelledAt: status === 'CANCELLED' ? b.statusDate ?? createdAt : null,
      marketSegment: b.marketSegment,
      distributionChannel: b.distributionChannel,
      guestCountry: b.country,
      mealPlan: b.mealPlan,
      isRepeatGuest: b.repeatedGuest,
      specialRequestCount: b.specialRequests,
    };
  });

  const CHUNK = 2000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.booking.createMany({ data: rows.slice(i, i + CHUNK) });
    process.stdout.write(`\r  ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
  process.stdout.write('\n');

  const stored = await db.booking.findMany({
    select: { id: true, status: true, totalCents: true, userId: true, roomTypeId: true },
  });

  console.log('Writing payments and audit events...');
  const payable = stored.filter((b) => ['CHECKED_OUT', 'CHECKED_IN', 'CONFIRMED'].includes(b.status));
  for (let i = 0; i < payable.length; i += CHUNK) {
    await db.payment.createMany({
      data: payable.slice(i, i + CHUNK).map((b) => ({
        bookingId: b.id,
        provider: 'SIMULATED' as const,
        providerRef: `real_${b.id}`,
        idempotencyKey: `real_${b.id}`,
        status: 'SUCCEEDED' as const,
        amountCents: b.totalCents,
      })),
    });
  }
  for (let i = 0; i < stored.length; i += CHUNK) {
    await db.bookingEvent.createMany({
      data: stored.slice(i, i + CHUNK).map((b) => ({
        bookingId: b.id,
        type: 'IMPORTED',
        toState: b.status,
        actor: 'dataset',
      })),
    });
  }

  const REVIEW_TITLES = [
    'Exactly what the photos promised', 'The quietest night of sleep in years',
    'Worth every dollar', 'Staff remembered our names', 'Would book the same room again',
    'Small things done properly', 'Sunrise from the balcony made the trip',
  ];
  const REVIEW_BODIES = [
    'The room was ready early and housekeeping worked around our schedule without being asked twice.',
    'We booked late and still got a corner room. The bed is excellent and the blinds actually black out.',
    'Breakfast is a highlight rather than an afterthought.',
    'One niggle: the wifi dropped once on the second evening. Everything else was faultless.',
    'Taking the kids somewhere this considered usually costs twice as much.',
    'The plunge pool is not a marketing gimmick, it is deep enough to swim in.',
  ];
  const reviewable = stored.filter((b) => b.status === 'CHECKED_OUT' && rand() < 0.04);
  for (let i = 0; i < reviewable.length; i += CHUNK) {
    await db.review.createMany({
      data: reviewable.slice(i, i + CHUNK).map((b) => ({
        bookingId: b.id,
        userId: b.userId!,
        roomTypeId: b.roomTypeId,
        rating: [5, 5, 5, 4, 4, 3][Math.floor(rand() * 6)]!,
        title: REVIEW_TITLES[Math.floor(rand() * REVIEW_TITLES.length)]!,
        body: REVIEW_BODIES[Math.floor(rand() * REVIEW_BODIES.length)]!,
      })),
      skipDuplicates: true,
    });
  }

  const cancelled = stored.filter((b) => b.status === 'CANCELLED').length;
  console.log('\nImport complete.');
  console.log(`  Reservations   : ${stored.length.toLocaleString()}`);
  console.log(`  Cancellations  : ${cancelled.toLocaleString()} (${((cancelled / stored.length) * 100).toFixed(1)}%)`);
  console.log(`  Reviews        : ${await db.review.count()}`);
  console.log(`  Turned away    : ${turnedAway.toLocaleString()} requests did not fit the 42 units`);
  console.log(`\n  ${DATASET_CITATION}\n`);
}

main()
  .catch((e) => {
    console.error('\n' + (e as Error).message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
