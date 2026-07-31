import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { BedDouble, Building, Check, Maximize, Star, Users } from 'lucide-react';

import { Badge, Card } from '@/components/ui';
import { BookingPanel } from '@/components/booking-panel';
import { AvailabilityStrip } from '@/components/availability-strip';
import { db } from '@/server/db';
import { getRoomCalendar } from '@/server/inventory';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';

async function loadRoom(slug: string) {
  return db.roomType.findUnique({
    where: { slug },
    include: {
      property: true,
      amenities: { include: { amenity: true } },
      ratePlans: { orderBy: { adjustmentPct: 'desc' } },
      units: { where: { status: 'AVAILABLE' }, select: { id: true } },
      reviews: {
        orderBy: { createdAt: 'desc' },
        take: 4,
        include: { user: { select: { name: true } } },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const room = await loadRoom((await params).slug);
  return room
    ? { title: room.name, description: room.shortPitch }
    : { title: 'Room not found' };
}

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const room = await loadRoom(slug);
  if (!room) notFound();

  const calendar = await getRoomCalendar(room.id, 45);
  const ratings = room.reviews.map((r) => r.rating);
  // Null rather than a flattering default: a room with no reviews should say so.
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

  const str = (key: string) => (typeof query[key] === 'string' ? (query[key] as string) : undefined);

  return (
    <article className="mx-auto max-w-6xl px-5 py-10">
      <nav className="mb-5 text-sm text-ink-500">
        <Link href="/rooms" className="hover:text-ink-200">Rooms</Link>
        <span className="px-2">/</span>
        <span className="text-ink-300">{room.name}</span>
      </nav>

      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2">
          {room.hasOceanView ? <Badge tone="brand">Ocean view</Badge> : null}
          {room.hasBalcony ? <Badge tone="neutral">Balcony</Badge> : null}
          {room.isAccessible ? <Badge tone="neutral">Step-free access</Badge> : null}
          {avgRating !== null ? (
            <Badge tone="neutral">
              <Star className="size-3 fill-sand-500 text-sand-500" />
              {avgRating.toFixed(1)} ({room.reviews.length}{' '}
              {room.reviews.length === 1 ? 'review' : 'reviews'})
            </Badge>
          ) : (
            <Badge tone="neutral">Not yet rated</Badge>
          )}
        </div>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl text-ink-50 sm:text-5xl">
          {room.name}
        </h1>
        <p className="mt-2 max-w-2xl text-lg text-ink-300">{room.shortPitch}</p>
      </header>

      <div className="mb-10 grid gap-3 sm:grid-cols-3">
        {room.images.slice(0, 3).map((src, i) => (
          <div
            key={src}
            className={`relative overflow-hidden rounded-2xl bg-ink-800 ${i === 0 ? 'sm:col-span-2 aspect-[16/10]' : 'aspect-[16/10] sm:aspect-auto'}`}
          >
            <Image
              src={src}
              alt={`${room.name} photo ${i + 1}`}
              fill
              sizes="(max-width: 640px) 100vw, 50vw"
              className="object-cover"
              priority={i === 0}
            />
          </div>
        ))}
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-10">
          <section>
            <ul className="grid grid-cols-2 gap-4 border-y hairline py-5 sm:grid-cols-4">
              <li className="flex items-center gap-2.5 text-sm text-ink-200">
                <Maximize className="size-4 text-brand-400" /> {room.sizeSqm} m²
              </li>
              <li className="flex items-center gap-2.5 text-sm text-ink-200">
                <BedDouble className="size-4 text-brand-400" /> {room.bedCount} × {room.bedType.toLowerCase()}
              </li>
              <li className="flex items-center gap-2.5 text-sm text-ink-200">
                <Users className="size-4 text-brand-400" /> {room.maxAdults} adults, {room.maxChildren} children
              </li>
              <li className="flex items-center gap-2.5 text-sm text-ink-200">
                <Building className="size-4 text-brand-400" /> Floors {room.floorMin}–{room.floorMax}
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl text-ink-50">About this room</h2>
            <p className="leading-relaxed text-ink-300">{room.description}</p>
          </section>

          <section>
            <h2 className="mb-4 text-xl text-ink-50">What is included</h2>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {room.amenities.map(({ amenity }) => (
                <li key={amenity.id} className="flex items-center gap-2.5 text-sm text-ink-200">
                  <Check className="size-4 shrink-0 text-brand-400" />
                  {amenity.label}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-1 text-xl text-ink-50">Next 45 nights</h2>
            <p className="mb-4 text-sm text-ink-500">
              Live inventory across {calendar.unitsTotal} physical rooms of this type.
            </p>
            <AvailabilityStrip days={calendar.days} unitsTotal={calendar.unitsTotal} />
          </section>

          <section>
            <h2 className="mb-4 text-xl text-ink-50">Rate plans</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {room.ratePlans.map((plan) => (
                <Card key={plan.id} className="p-4">
                  <p className="font-medium text-ink-50">{plan.name}</p>
                  <p className="mt-1 text-sm text-ink-400">{plan.description}</p>
                  <p className="mt-3 text-sm font-medium text-brand-300">
                    {plan.adjustmentPct === 0
                      ? 'Standard rate'
                      : `${plan.adjustmentPct > 0 ? '+' : ''}${plan.adjustmentPct}%`}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    {plan.refundable
                      ? `Free cancellation up to ${plan.cancellationHours}h before`
                      : 'Non-refundable'}
                    {plan.minNights > 1 ? ` · min ${plan.minNights} nights` : ''}
                  </p>
                </Card>
              ))}
            </div>
          </section>

          {room.reviews.length ? (
            <section>
              <h2 className="mb-4 text-xl text-ink-50">Recent guests</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {room.reviews.map((review) => (
                  <Card key={review.id} className="p-5">
                    <div className="mb-2 flex items-center gap-1">
                      {Array.from({ length: review.rating }).map((_, i) => (
                        <Star key={i} className="size-3.5 fill-sand-500 text-sand-500" />
                      ))}
                    </div>
                    <p className="font-medium text-ink-100">{review.title}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{review.body}</p>
                    <p className="mt-3 text-xs text-ink-500">
                      {review.user.name} · {review.createdAt.toISOString().slice(0, 10)}
                    </p>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <BookingPanel
            roomTypeId={room.id}
            roomName={room.name}
            baseRateCents={room.baseRateCents}
            maxAdults={room.maxAdults}
            maxChildren={room.maxChildren}
            ratePlans={room.ratePlans.map((p) => ({
              id: p.id,
              name: p.name,
              adjustmentPct: p.adjustmentPct,
              minNights: p.minNights,
              refundable: p.refundable,
            }))}
            initialCheckIn={str('checkIn')}
            initialCheckOut={str('checkOut')}
            initialAdults={Number(str('adults') ?? 2)}
            initialChildren={Number(str('children') ?? 0)}
          />
          <p className="mt-3 px-1 text-xs text-ink-500">
            From {formatMoney(room.baseRateCents)} a night before season and demand adjustments.
          </p>
        </aside>
      </div>
    </article>
  );
}
