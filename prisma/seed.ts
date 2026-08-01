/**
 * Deterministic seed.
 *
 * A fixed PRNG seed means every clone of this repo produces byte-identical
 * demo data: the dashboard screenshots in the README always match what a
 * reviewer sees locally, and the analytics tests have stable fixtures.
 */
import { PrismaClient, type BookingStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { confirmationMessage, describeDatabaseTarget, requiresConfirmation } from '../src/lib/db-target';

const db = new PrismaClient();

// ---------------------------------------------------------------------------
// Mulberry32: tiny, fast, seeded PRNG.
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260728);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
const between = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

const DAY = 86_400_000;
const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
const shift = (days: number) => new Date(today.getTime() + days * DAY);

const AMENITIES = [
  { slug: 'infinity-pool', label: 'Infinity pool', icon: 'Waves', category: 'leisure' },
  { slug: 'spa', label: 'Thermal spa', icon: 'Flower2', category: 'wellness' },
  { slug: 'gym', label: '24h gym', icon: 'Dumbbell', category: 'wellness' },
  { slug: 'restaurant', label: 'Chef restaurant', icon: 'UtensilsCrossed', category: 'dining' },
  { slug: 'beach-club', label: 'Private beach club', icon: 'Umbrella', category: 'leisure' },
  { slug: 'wifi', label: 'Fibre wi-fi', icon: 'Wifi', category: 'tech' },
  { slug: 'parking', label: 'Valet parking', icon: 'CarFront', category: 'general' },
  { slug: 'air-con', label: 'Climate control', icon: 'Snowflake', category: 'room' },
  { slug: 'minibar', label: 'Curated minibar', icon: 'Wine', category: 'room' },
  { slug: 'espresso', label: 'Espresso machine', icon: 'Coffee', category: 'room' },
  { slug: 'workspace', label: 'Dedicated workspace', icon: 'Laptop', category: 'room' },
  { slug: 'soaking-tub', label: 'Soaking tub', icon: 'Bath', category: 'room' },
  { slug: 'kitchenette', label: 'Kitchenette', icon: 'ChefHat', category: 'room' },
  { slug: 'plunge-pool', label: 'Private plunge pool', icon: 'Droplets', category: 'room' },
  { slug: 'pet-friendly', label: 'Pet friendly', icon: 'PawPrint', category: 'general' },
  { slug: 'breakfast', label: 'Breakfast included', icon: 'Croissant', category: 'dining' },
];

// Photography: see docs/CREDITS.md. All images are Unsplash-licensed and served
// from images.unsplash.com, the only remote host allowed by next.config.ts.
const IMG = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=80`;

const ROOM_TYPES = [
  {
    slug: 'dune-garden-room',
    name: 'Dune Garden Room',
    shortPitch: 'Ground-floor calm with a private planted terrace.',
    description:
      'A quiet ground-floor room opening onto a walled garden of beach grass and bayberry. Designed for light sleepers: triple glazing, blackout linen, and no adjoining corridor traffic.',
    baseRateCents: 18_500,
    maxAdults: 2, maxChildren: 1, sizeSqm: 32, bedType: 'QUEEN' as const, bedCount: 1,
    floorMin: 0, floorMax: 0, hasOceanView: false, hasBalcony: true, isAccessible: true,
    units: 8,
    amenities: ['wifi', 'air-con', 'espresso', 'minibar', 'pet-friendly', 'workspace'],
    images: [IMG('1636980015567-01c079ac7304'), IMG('1611892440504-42a792e24d32')],
    corpus: 'quiet secluded ground floor garden terrace step-free accessible affordable value calm tranquil pet friendly desk workspace',
  },
  {
    slug: 'otter-cliff-deluxe',
    name: 'Otter Cliff Deluxe',
    shortPitch: 'Corner room, full sea view, morning sun.',
    description:
      'A corner room with two aspects: sunrise over the Atlantic from the bed, and Otter Cliff from the balcony. Lime plaster, cane and white oak, and a deep soaking tub.',
    baseRateCents: 26_000,
    maxAdults: 2, maxChildren: 2, sizeSqm: 38, bedType: 'KING' as const, bedCount: 1,
    floorMin: 2, floorMax: 4, hasOceanView: true, hasBalcony: true, isAccessible: false,
    units: 10,
    amenities: ['wifi', 'air-con', 'espresso', 'minibar', 'soaking-tub', 'breakfast'],
    images: [IMG('1776876648949-63ccabf63b10'), IMG('1566073771259-6a8506099945')],
    corpus: 'ocean view sea view corner balcony sunrise atlantic cliff romantic couples soaking tub breakfast included',
  },
  {
    slug: 'somes-sound-family-suite',
    name: 'Somes Sound Family Suite',
    shortPitch: 'Two bedrooms, bunk nook, and a kitchenette.',
    description:
      'Built for families who want to actually relax: a separate childrens room with bunks, a kitchenette for early breakfasts, and a lockable connecting door.',
    baseRateCents: 41_000,
    maxAdults: 4, maxChildren: 4, sizeSqm: 62, bedType: 'KING' as const, bedCount: 2,
    floorMin: 1, floorMax: 3, hasOceanView: true, hasBalcony: true, isAccessible: true,
    units: 6,
    amenities: ['wifi', 'air-con', 'kitchenette', 'minibar', 'breakfast', 'parking'],
    images: [IMG('1631049035634-c04c637651b1'), IMG('1522708323590-d24dbb6b0267')],
    corpus: 'family kids children bunk two bedrooms kitchenette spacious large suite connecting accessible step-free ocean view',
  },
  {
    slug: 'atelier-loft',
    name: 'Atelier Loft',
    shortPitch: 'Double-height studio with a proper desk and fast fibre.',
    description:
      'A mezzanine loft in the converted boathouse. Six-metre ceilings, a full-width desk under the north window, 1 Gbps fibre, and a coffee setup that means business.',
    baseRateCents: 32_000,
    maxAdults: 2, maxChildren: 0, sizeSqm: 45, bedType: 'QUEEN' as const, bedCount: 1,
    floorMin: 1, floorMax: 2, hasOceanView: false, hasBalcony: false, isAccessible: false,
    units: 5,
    amenities: ['wifi', 'workspace', 'espresso', 'air-con', 'gym'],
    images: [IMG('1737305457553-d6427adfdc8f'), IMG('1616486338812-3dadae4b4ace')],
    corpus: 'workspace desk remote work office fibre wifi quiet loft studio business long stay solo digital nomad',
  },
  {
    slug: 'seal-cove-plunge-villa',
    name: 'Seal Cove Plunge Villa',
    shortPitch: 'Standalone villa with a heated private plunge pool.',
    description:
      'A detached villa at the far end of the headland path. Heated plunge pool, cedar outdoor shower, and an eight-metre deck that catches the first of the sun.',
    baseRateCents: 68_000,
    maxAdults: 2, maxChildren: 2, sizeSqm: 78, bedType: 'KING' as const, bedCount: 1,
    floorMin: 0, floorMax: 0, hasOceanView: true, hasBalcony: true, isAccessible: false,
    units: 4,
    amenities: ['plunge-pool', 'wifi', 'air-con', 'minibar', 'spa', 'soaking-tub', 'breakfast'],
    images: [IMG('1596178067639-5c6e68aea6dc'), IMG('1520250497591-112f2f40a3f4')],
    corpus: 'luxury premium private plunge pool villa secluded quiet romantic honeymoon ocean view spa splurge finest',
  },
  {
    slug: 'headland-penthouse',
    name: 'Headland Penthouse',
    shortPitch: 'The whole top floor, 180 degrees of water.',
    description:
      'The top floor in its own right: wraparound terrace, dining for eight, a grand piano nobody plays, and the best sunrise angle on the property.',
    baseRateCents: 98_000,
    maxAdults: 6, maxChildren: 3, sizeSqm: 140, bedType: 'KING' as const, bedCount: 3,
    floorMin: 5, floorMax: 5, hasOceanView: true, hasBalcony: true, isAccessible: true,
    units: 2,
    amenities: ['wifi', 'air-con', 'kitchenette', 'minibar', 'spa', 'plunge-pool', 'breakfast', 'parking'],
    images: [IMG('1542928658-22251e208ac1'), IMG('1578683010236-d716f9a3f461')],
    corpus: 'penthouse luxury premium finest largest suite spacious panoramic ocean view terrace family group celebration',
  },
  {
    slug: 'boathouse-twin',
    name: 'Boathouse Twin',
    shortPitch: 'Two singles, low rate, right by the jetty.',
    description:
      'Simple, well-made, and the best value on the property. Two proper single beds, a shared jetty deck, and thirty seconds to the water.',
    baseRateCents: 14_500,
    maxAdults: 2, maxChildren: 0, sizeSqm: 24, bedType: 'TWIN' as const, bedCount: 2,
    floorMin: 0, floorMax: 1, hasOceanView: false, hasBalcony: false, isAccessible: false,
    units: 7,
    amenities: ['wifi', 'air-con', 'parking'],
    images: [IMG('1771775529138-a7a20ba7e032'), IMG('1598928506311-c55ded91a20c')],
    corpus: 'budget cheap affordable value twin beds friends solo simple jetty basic economical',
  },
];

const REVIEW_TITLES = [
  'Exactly what the photos promised',
  'The quietest night of sleep in years',
  'Worth every dollar',
  'Staff remembered our names',
  'Would book the same room again',
  'Small things done properly',
  'Sunrise from the balcony made the trip',
];

const REVIEW_BODIES = [
  'The room was ready early, the terrace was genuinely private, and housekeeping worked around our schedule without being asked twice.',
  'We booked late and still got a corner room. The bed is excellent and the blackout blinds actually black out.',
  'Breakfast is a highlight rather than an afterthought. The pastry chef deserves the credit here.',
  'One niggle: the wifi dropped once on the second evening. Everything else was faultless.',
  'Taking the kids somewhere this considered usually costs twice as much. The bunk nook bought us two lie-ins.',
  'The plunge pool is not a marketing gimmick, it is deep enough to swim in.',
];

async function main() {
  // Announce the target before deleting anything. See src/lib/db-target.ts.
  const target = describeDatabaseTarget(process.env.DATABASE_URL);
  console.log(`Target database: ${target.label}${target.isLocal ? '' : '  [REMOTE]'}`);
  if (requiresConfirmation(target)) {
    console.error(confirmationMessage(target, 'db:seed'));
    process.exit(1);
  }

  console.log('Resetting database...');
  await db.$transaction([
    db.bookingEvent.deleteMany(),
    db.payment.deleteMany(),
    db.review.deleteMany(),
    db.booking.deleteMany(),
    db.ratePlan.deleteMany(),
    db.rateRule.deleteMany(),
    db.roomUnit.deleteMany(),
    db.roomTypeAmenity.deleteMany(),
    db.propertyAmenity.deleteMany(),
    db.roomType.deleteMany(),
    db.property.deleteMany(),
    db.amenity.deleteMany(),
    db.conciergeSession.deleteMany(),
    db.session.deleteMany(),
    db.account.deleteMany(),
    db.user.deleteMany(),
  ]);

  console.log('Seeding amenities...');
  await db.amenity.createMany({ data: AMENITIES });
  const amenityBySlug = new Map((await db.amenity.findMany()).map((a) => [a.slug, a.id]));

  console.log('Seeding property...');
  const property = await db.property.create({
    data: {
      slug: 'cove-and-spruce',
      name: 'Cove & Spruce',
      tagline: 'A 42-room granite headland retreat on Mount Desert Island.',
      description:
        'Cove & Spruce sits on a granite headland where the spruce-fir forest of Mount Desert Island meets the North Atlantic. Forty-two rooms across five buildings, a working kitchen garden, and tide pools that are best at seven in the morning.',
      city: 'Bar Harbor',
      country: 'United States',
      latitude: 44.3876,
      longitude: -68.2039,
      timezone: 'America/New_York',
      currency: 'USD',
      heroImage: IMG('1633366957209-a79999bba16a'),
      starRating: 4.8,
      amenities: {
        create: ['infinity-pool', 'spa', 'gym', 'restaurant', 'beach-club', 'wifi', 'parking', 'breakfast'].map(
          (slug) => ({ amenityId: amenityBySlug.get(slug)! }),
        ),
      },
    },
  });

  console.log('Seeding room types, units, and rate plans...');
  const roomTypeIds: { id: string; units: string[]; base: number }[] = [];

  for (const rt of ROOM_TYPES) {
    const created = await db.roomType.create({
      data: {
        propertyId: property.id,
        slug: rt.slug,
        name: rt.name,
        shortPitch: rt.shortPitch,
        description: rt.description,
        baseRateCents: rt.baseRateCents,
        maxAdults: rt.maxAdults,
        maxChildren: rt.maxChildren,
        sizeSqm: rt.sizeSqm,
        bedType: rt.bedType,
        bedCount: rt.bedCount,
        floorMin: rt.floorMin,
        floorMax: rt.floorMax,
        hasOceanView: rt.hasOceanView,
        hasBalcony: rt.hasBalcony,
        isAccessible: rt.isAccessible,
        images: rt.images,
        searchCorpus: rt.corpus,
        amenities: { create: rt.amenities.map((slug) => ({ amenityId: amenityBySlug.get(slug)! })) },
        ratePlans: {
          create: [
            {
              code: 'FLEX',
              name: 'Flexible',
              description: 'Free cancellation up to 48 hours before arrival.',
              adjustmentPct: 0,
              refundable: true,
              cancellationHours: 48,
              includesBreakfast: rt.amenities.includes('breakfast'),
            },
            {
              code: 'ADVANCE',
              name: 'Advance purchase',
              description: 'Save 15% when you pay now. Non-refundable.',
              adjustmentPct: -15,
              refundable: false,
              cancellationHours: 0,
              minNights: 2,
            },
            {
              code: 'LONGSTAY',
              name: 'Slow travel',
              description: 'A further 8% off for stays of five nights or more.',
              adjustmentPct: -8,
              refundable: true,
              cancellationHours: 72,
              minNights: 5,
              includesBreakfast: true,
            },
          ],
        },
      },
    });

    const prefix = rt.slug.slice(0, 2).toUpperCase();
    const units = await Promise.all(
      Array.from({ length: rt.units }, (_, i) => {
        const floor = between(rt.floorMin, rt.floorMax);
        return db.roomUnit.create({
          data: {
            roomTypeId: created.id,
            code: `${prefix}-${floor}${String(i + 1).padStart(2, '0')}`,
            floor,
            status: rand() < 0.04 ? 'OUT_OF_SERVICE' : 'AVAILABLE',
          },
        });
      }),
    );

    roomTypeIds.push({
      id: created.id,
      units: units.filter((u) => u.status === 'AVAILABLE').map((u) => u.id),
      base: rt.baseRateCents,
    });
  }

  console.log('Seeding seasonal rate rules...');
  await db.rateRule.createMany({
    data: [
      { label: 'Shoulder season', startDate: shift(-40), endDate: shift(-5), multiplier: 0.8, priority: 1 },
      { label: 'Peak summer', startDate: shift(60), endDate: shift(140), multiplier: 1.35, priority: 5 },
      { label: 'Holiday week', startDate: shift(150), endDate: shift(158), multiplier: 1.9, priority: 10 },
      { label: 'Foliage weekend', startDate: shift(24), endDate: shift(27), multiplier: 1.45, priority: 8 },
    ],
  });

  console.log('Seeding users...');
  const passwordHash = await bcrypt.hash('Password123', 12);
  const admin = await db.user.create({
    data: {
      email: 'admin@booknow.dev',
      name: 'Adwitiya Shukla',
      role: 'ADMIN',
      passwordHash,
      loyaltyTier: 'FOUNDER',
    },
  });
  await db.user.create({
    data: { email: 'staff@booknow.dev', name: 'Marcus Bell', role: 'STAFF', passwordHash },
  });
  const guest = await db.user.create({
    data: {
      email: 'guest@booknow.dev', name: 'Sam Whitaker', role: 'GUEST', passwordHash,
      loyaltyTier: 'VOYAGER', loyaltyPoints: 4820,
    },
  });

  const guestNames = [
    'Emily Carter', 'Daniel Okonkwo', 'Nora Whitfield', 'Marcus Delgado', 'Hannah Brennan',
    'Ethan Kowalski', 'Olivia Hayes', 'Jonah Reinhardt', 'Priya Raman', 'Caleb Thornton',
    'Ingrid Larsen', 'Simone Beaulieu', 'Grace Abernathy', 'Wyatt Coleman', 'Chloe Dubois',
  ];
  const extraUsers = await Promise.all(
    guestNames.map((name, i) =>
      db.user.create({
        data: {
          email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
          name,
          role: 'GUEST',
          passwordHash,
          loyaltyPoints: between(0, 9000),
          loyaltyTier: pick(['EXPLORER', 'VOYAGER', 'FOUNDER']),
          createdAt: shift(-between(30, 400)),
        },
      }),
    ),
  );
  const allGuests = [guest, ...extraUsers];

  console.log('Seeding booking history...');

  // ---------------------------------------------------------------------
  // Occupancy timeline.
  //
  // Random placement with collision rejection produces a sparse, clustered
  // calendar that makes the dashboard look like a failing hotel. Instead we
  // walk each physical room unit forward through time, alternating a stay
  // with a gap. The ratio of the two means long-run occupancy is a tunable
  // number rather than an accident: roughly 79% gross, landing near 70% net
  // once cancellations are removed, which is what a healthy resort runs at.
  // ---------------------------------------------------------------------
  const STAY_LENGTHS = [2, 2, 3, 3, 4, 5, 7];
  const GAP_LENGTHS = [0, 0, 0, 1, 1, 2, 3];
  const WINDOW_START = -95;
  const WINDOW_END = 100;

  type SeedBooking = {
    reference: string;
    userId: string;
    roomTypeId: string;
    roomUnitId: string | null;
    status: BookingStatus;
    guestName: string;
    guestEmail: string;
    checkIn: Date;
    checkOut: Date;
    nights: number;
    adults: number;
    children: number;
    subtotalCents: number;
    taxesCents: number;
    feesCents: number;
    totalCents: number;
    priceBreakdown: { date: string; rateCents: number }[];
    createdAt: Date;
    confirmedAt: Date | null;
    cancelledAt: Date | null;
    holdExpiresAt: Date | null;
  };

  const pending: SeedBooking[] = [];
  let reference = 100000;

  /** Seasonal shape, mirroring the rate rules seeded above. */
  const seasonFactor = (offset: number) =>
    offset >= 60 ? 1.35 : offset >= 24 && offset <= 27 ? 1.45 : offset < -5 ? 0.8 : 1;

  function draft(params: {
    rt: { id: string; base: number };
    unitId: string | null;
    start: number;
    nights: number;
    status: BookingStatus;
    leadDays?: number;
  }): SeedBooking {
    const { rt, unitId, start, nights, status } = params;
    const user = pick(allGuests);
    const nightly = Math.round(rt.base * seasonFactor(start) * (0.92 + rand() * 0.5));
    const subtotal = nightly * nights;
    const fees = 3500 * nights + Math.round(subtotal * 0.05);
    const taxes = Math.round((subtotal + 3500 * nights) * 0.12);
    const lead = params.leadDays ?? between(2, 70);
    const createdAt = shift(start - lead);

    reference += 1;
    return {
      reference: `BN-${reference}`,
      userId: user.id,
      roomTypeId: rt.id,
      roomUnitId: unitId,
      status,
      guestName: user.name,
      guestEmail: user.email,
      checkIn: shift(start),
      checkOut: shift(start + nights),
      nights,
      adults: between(1, 2),
      children: rand() < 0.25 ? between(1, 2) : 0,
      subtotalCents: subtotal,
      taxesCents: taxes,
      feesCents: fees,
      totalCents: subtotal + taxes + fees,
      priceBreakdown: Array.from({ length: nights }, (_, n) => ({
        date: new Date(today.getTime() + (start + n) * DAY).toISOString().slice(0, 10),
        rateCents: nightly,
      })),
      createdAt,
      confirmedAt: status === 'CANCELLED' || status === 'EXPIRED' ? null : createdAt,
      cancelledAt: status === 'CANCELLED' ? shift(start - between(1, Math.max(2, lead - 1))) : null,
      holdExpiresAt: status === 'HELD' ? new Date(Date.now() + 9 * 60_000) : null,
    };
  }

  for (const rt of roomTypeIds) {
    for (const unitId of rt.units) {
      // Stagger each unit's first arrival so the calendar does not pulse.
      let cursor = WINDOW_START + between(0, 6);

      while (cursor < WINDOW_END) {
        const nights = pick(STAY_LENGTHS);
        const end = cursor + nights;

        // A stay that has finished is checked out; one spanning today is in
        // house; anything later is on the books.
        let status: BookingStatus;
        if (end <= 0) status = rand() < 0.1 ? (rand() < 0.6 ? 'CANCELLED' : 'NO_SHOW') : 'CHECKED_OUT';
        else if (cursor <= 0) status = 'CHECKED_IN';
        else status = rand() < 0.11 ? 'CANCELLED' : 'CONFIRMED';

        pending.push(draft({ rt, unitId, start: cursor, nights, status }));
        cursor = end + pick(GAP_LENGTHS);
      }
    }
  }

  // Abandoned checkouts. These never consumed a room in the end, so they can
  // overlap freely, and they are what makes the conversion metric meaningful:
  // without them every funnel reads a fictitious 100%.
  for (let i = 0; i < 46; i += 1) {
    const rt = pick(roomTypeIds);
    pending.push(
      draft({
        rt,
        unitId: null,
        start: between(3, 80),
        nights: pick(STAY_LENGTHS),
        status: 'EXPIRED',
        leadDays: between(1, 28),
      }),
    );
  }

  // A couple of live holds so the operations table has every state in it.
  for (let i = 0; i < 3; i += 1) {
    const rt = pick(roomTypeIds);
    pending.push({
      ...draft({ rt, unitId: null, start: between(20, 60), nights: 2, status: 'HELD', leadDays: 0 }),
      createdAt: new Date(Date.now() - 4 * 60_000),
    });
  }

  await db.booking.createMany({ data: pending });
  const stored = await db.booking.findMany({
    select: { id: true, reference: true, status: true, totalCents: true, userId: true, roomTypeId: true },
  });
  const createdCount = stored.length;

  await db.payment.createMany({
    data: stored
      .filter((b) => b.status === 'CHECKED_OUT' || b.status === 'CHECKED_IN' || b.status === 'CONFIRMED')
      .map((b) => ({
        bookingId: b.id,
        provider: 'SIMULATED' as const,
        providerRef: `sim_seed_${b.id}`,
        idempotencyKey: `seed_${b.id}`,
        status: 'SUCCEEDED' as const,
        amountCents: b.totalCents,
      })),
  });

  await db.bookingEvent.createMany({
    data: stored.map((b) => ({
      bookingId: b.id,
      type: 'SEEDED',
      toState: b.status,
      actor: 'seed',
    })),
  });

  const reviewable = stored.filter((b) => b.status === 'CHECKED_OUT' && rand() < 0.22);
  await db.review.createMany({
    data: reviewable.map((b) => ({
      bookingId: b.id,
      userId: b.userId!,
      roomTypeId: b.roomTypeId,
      rating: pick([5, 5, 5, 4, 4, 3]),
      title: pick(REVIEW_TITLES),
      body: pick(REVIEW_BODIES),
    })),
  });

  console.log(`\nSeed complete.`);
  console.log(`  Property      : ${property.name}`);
  console.log(`  Room types    : ${ROOM_TYPES.length}`);
  console.log(`  Room units    : ${await db.roomUnit.count()}`);
  console.log(`  Bookings      : ${createdCount}`);
  console.log(`  Reviews       : ${await db.review.count()}`);
  console.log(`  Occupancy     : synthetic timeline, roughly 70% net of cancellations`);
  console.log(`\nSign in with:`);
  console.log(`  admin@booknow.dev / Password123  (admin dashboard)`);
  console.log(`  guest@booknow.dev / Password123  (guest account)`);
  void admin;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
