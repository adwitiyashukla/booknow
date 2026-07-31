import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SlidersHorizontal } from 'lucide-react';

import { Badge, Card, EmptyState, SectionHeading } from '@/components/ui';
import { RoomCard } from '@/components/room-card';
import { SearchBar } from '@/components/search-bar';
import { RoomFilters } from '@/components/room-filters';
import { searchAvailability } from '@/server/inventory';
import { searchParamsSchema } from '@/lib/validation';
import { formatStayRange } from '@/lib/dates';

export const metadata: Metadata = { title: 'Rooms' };
export const dynamic = 'force-dynamic';

type RawParams = Record<string, string | string[] | undefined>;

async function Results({ raw }: { raw: RawParams }) {
  const parsed = searchParamsSchema.safeParse({
    ...raw,
    oceanView: raw.oceanView === 'true',
    balcony: raw.balcony === 'true',
    accessible: raw.accessible === 'true',
  });

  if (!parsed.success) {
    return (
      <EmptyState
        title="That search does not look right"
        hint={parsed.error.issues.map((i) => i.message).join('. ')}
      />
    );
  }

  const params = parsed.data;
  const results = await searchAvailability(params);

  const sorted = [...results].sort((a, b) => {
    const priceA = a.quote?.averageNightlyCents ?? a.roomType.baseRateCents;
    const priceB = b.quote?.averageNightlyCents ?? b.roomType.baseRateCents;
    switch (params.sort) {
      case 'price-asc': return priceA - priceB;
      case 'price-desc': return priceB - priceA;
      case 'size-desc': return b.roomType.sizeSqm - a.roomType.sizeSqm;
      case 'rating-desc': return b.rating - a.rating;
      default:
        // Recommended: available first, then rating, then price.
        if ((b.unitsAvailable > 0 ? 1 : 0) !== (a.unitsAvailable > 0 ? 1 : 0)) {
          return (b.unitsAvailable > 0 ? 1 : 0) - (a.unitsAvailable > 0 ? 1 : 0);
        }
        return b.rating - a.rating || priceA - priceB;
    }
  });

  const query = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : [])),
  ).toString();

  if (!sorted.length) {
    return (
      <EmptyState
        title="No rooms match every filter"
        hint="Try widening the price range or removing a requirement. The concierge in the corner can suggest alternatives."
      />
    );
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-ink-500">
        <span>{sorted.length} room type{sorted.length > 1 ? 's' : ''}</span>
        {params.checkIn && params.checkOut ? (
          <Badge tone="brand">{formatStayRange(params.checkIn, params.checkOut)}</Badge>
        ) : (
          <Badge tone="neutral">Add dates for live pricing</Badge>
        )}
        <span>· {params.adults} adults{params.children ? `, ${params.children} children` : ''}</span>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map(({ roomType, quote, rating, reviewCount, unitsAvailable }) => (
          <RoomCard
            key={roomType.id}
            query={query}
            room={{
              slug: roomType.slug,
              name: roomType.name,
              shortPitch: roomType.shortPitch,
              image: roomType.images[0] ?? null,
              sizeSqm: roomType.sizeSqm,
              bedType: roomType.bedType,
              bedCount: roomType.bedCount,
              maxAdults: roomType.maxAdults,
              maxChildren: roomType.maxChildren,
              hasOceanView: roomType.hasOceanView,
              hasBalcony: roomType.hasBalcony,
              isAccessible: roomType.isAccessible,
              rating,
              reviewCount,
              nightlyCents: quote?.averageNightlyCents ?? roomType.baseRateCents,
              totalCents: quote?.totalCents,
              nights: quote?.nights,
              unitsAvailable,
            }}
          />
        ))}
      </div>
    </>
  );
}

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const raw = await searchParams;

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <SectionHeading
        eyebrow="Availability"
        title="Find your room"
        description="Prices update with real occupancy, so the number you see is the number you pay."
      />

      <Suspense fallback={<div className="skeleton h-28 rounded-2xl" />}>
        <SearchBar />
      </Suspense>

      <div className="mt-8 grid gap-8 lg:grid-cols-[16rem_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink-100">
              <SlidersHorizontal className="size-4" /> Refine
            </p>
            <Suspense fallback={<div className="skeleton h-64 rounded-xl" />}>
              <RoomFilters />
            </Suspense>
          </Card>
        </aside>

        <section>
          <Suspense
            fallback={
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-96 rounded-2xl" />)}
              </div>
            }
          >
            <Results raw={raw} />
          </Suspense>
        </section>
      </div>
    </div>
  );
}
