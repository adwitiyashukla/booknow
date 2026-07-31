import Image from 'next/image';
import { Suspense } from 'react';
import { Building2, CalendarClock, Cpu, GitBranch, LineChart, ShieldCheck, Sparkles, Waves } from 'lucide-react';

import { ButtonLink, Card, SectionHeading } from '@/components/ui';
import { RoomCard } from '@/components/room-card';
import { SearchBar } from '@/components/search-bar';
import { db } from '@/server/db';
import { features } from '@/server/env';

export const dynamic = 'force-dynamic';

async function FeaturedRooms() {
  const rooms = await db.roomType.findMany({
    take: 3,
    orderBy: { baseRateCents: 'asc' },
    include: { reviews: { select: { rating: true } }, units: { select: { id: true } } },
  });

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {rooms.map((room) => {
        const ratings = room.reviews.map((r) => r.rating);
        return (
          <RoomCard
            key={room.id}
            room={{
              slug: room.slug,
              name: room.name,
              shortPitch: room.shortPitch,
              image: room.images[0] ?? null,
              sizeSqm: room.sizeSqm,
              bedType: room.bedType,
              bedCount: room.bedCount,
              maxAdults: room.maxAdults,
              maxChildren: room.maxChildren,
              hasOceanView: room.hasOceanView,
              hasBalcony: room.hasBalcony,
              isAccessible: room.isAccessible,
              rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 4.7,
              reviewCount: ratings.length,
              nightlyCents: room.baseRateCents,
              unitsAvailable: room.units.length,
            }}
          />
        );
      })}
    </div>
  );
}

const ENGINEERING = [
  {
    icon: CalendarClock,
    title: 'Conflict-free availability',
    body: 'Inventory is counted per physical room unit across half-open date intervals. Reservations are written inside a Serializable transaction that re-checks availability, so two guests racing for the last room produce one booking and one clean 409.',
  },
  {
    icon: LineChart,
    title: 'Yield-managed pricing',
    body: 'Every night is priced from base rate, season, weekday, projected occupancy, and booking lead time. The engine is a pure function with no I/O, so the whole model is unit tested and replayable.',
  },
  {
    icon: Sparkles,
    title: 'Grounded AI concierge',
    body: 'Natural language becomes a validated structured query, then a TF-IDF retriever ranks real rows from the database. Answers are templated from what was retrieved, so the concierge cannot invent a room or a price.',
  },
  {
    icon: ShieldCheck,
    title: 'Payments that survive retries',
    body: 'Stripe Checkout with signature-verified webhooks and idempotency keys. Prices are always recomputed server side, so a tampered payload cannot buy a suite for a dollar.',
  },
  {
    icon: Cpu,
    title: 'Typed end to end',
    body: 'TypeScript in strict mode with noUncheckedIndexedAccess, Zod at every boundary, and Prisma types flowing from schema to component props.',
  },
  {
    icon: GitBranch,
    title: 'Shipped like production',
    body: 'A 100-case unit suite over the pricing, availability, state machine, and retrieval logic, GitHub Actions CI, Docker Compose, and a deterministic seed so every clone looks identical.',
  },
];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <Image
            src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=80"
            alt=""
            fill
            priority
            className="object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-ink-950/70 via-ink-950/85 to-ink-950" />
        </div>

        <div className="mx-auto max-w-6xl px-5 pb-16 pt-20 sm:pt-28">
          <p className="animate-rise mb-4 inline-flex items-center gap-2 rounded-full border hairline px-3.5 py-1.5 text-xs uppercase tracking-[0.2em] text-brand-300">
            <Waves className="size-3.5" /> Bar Harbor, Maine
          </p>
          <h1 className="animate-rise max-w-3xl font-[family-name:var(--font-display)] text-5xl leading-[1.05] text-ink-50 sm:text-6xl lg:text-7xl">
            Forty-two rooms on a granite headland.
          </h1>
          <p className="animate-rise mt-6 max-w-xl text-lg text-ink-300">
            Cove &amp; Spruce is a small property with a serious reservation system behind it.
            Live inventory, honest pricing, and a concierge that reads plain English.
          </p>

          <div className="mt-10 max-w-4xl">
            <Suspense fallback={<div className="skeleton h-28 rounded-2xl" />}>
              <SearchBar />
            </Suspense>
          </div>

          <dl className="mt-12 grid max-w-2xl grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              ['42', 'rooms'],
              ['7', 'room types'],
              ['4.8', 'guest rating'],
              [features.stripe ? 'Live' : 'Demo', 'payments'],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="text-2xl font-semibold text-ink-50">{value}</dt>
                <dd className="text-xs uppercase tracking-wider text-ink-500">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="experience" className="mx-auto max-w-6xl px-5 py-20">
        <SectionHeading
          eyebrow="Where you will stay"
          title="Rooms chosen for how you actually travel"
          description="Every room type carries real inventory, real reviews, and a nightly rate that moves with demand."
          action={<ButtonLink href="/rooms" variant="secondary">See all rooms</ButtonLink>}
        />
        <Suspense
          fallback={
            <div className="grid gap-6 md:grid-cols-3">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton h-96 rounded-2xl" />)}
            </div>
          }
        >
          <FeaturedRooms />
        </Suspense>
      </section>

      <section id="engineering" className="border-y hairline bg-ink-950/40">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <SectionHeading
            eyebrow="Under the hood"
            title="The interesting part is the engine"
            description="This is a portfolio project, so the hard bits are deliberately visible: concurrency, money, and grounding an LLM in real data."
          />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {ENGINEERING.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="p-6">
                <span className="mb-4 grid size-10 place-items-center rounded-xl bg-brand-500/12 text-brand-400">
                  <Icon className="size-5" />
                </span>
                <h3 className="mb-2 text-base font-semibold text-ink-50">{title}</h3>
                <p className="text-sm leading-relaxed text-ink-300">{body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20">
        <Card className="flex flex-col items-start gap-6 p-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <span className="mb-3 inline-grid size-10 place-items-center rounded-xl bg-brand-500/12 text-brand-400">
              <Building2 className="size-5" />
            </span>
            <h2 className="font-[family-name:var(--font-display)] text-3xl text-ink-50">
              Want to see the operations side?
            </h2>
            <p className="mt-3 text-ink-300">
              The admin dashboard runs on the same booking ledger: occupancy, ADR, RevPAR, forward
              pickup, and a full audit trail for every reservation.
            </p>
          </div>
          <ButtonLink href="/admin" size="lg">Open the dashboard</ButtonLink>
        </Card>
      </section>
    </>
  );
}
