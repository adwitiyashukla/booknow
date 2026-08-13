import { notFound } from 'next/navigation';
import Link from 'next/link';
import { CalendarCheck, CheckCircle2, MapPin } from 'lucide-react';

import { Badge, Card } from '@/components/ui';
import { CancelBookingButton } from '@/components/cancel-booking-button';
import { getBookingByReference } from '@/server/booking-service';
import { formatMoney } from '@/lib/money';
import { formatStayRange } from '@/lib/dates';

export const dynamic = 'force-dynamic';

type Tone = 'neutral' | 'brand' | 'warn' | 'good' | 'bad';

const STATUS_TONE: Record<string, Tone> = {
  HELD: 'warn', CONFIRMED: 'good', CHECKED_IN: 'brand', CHECKED_OUT: 'neutral',
  CANCELLED: 'bad', EXPIRED: 'bad', NO_SHOW: 'bad',
};

const toneFor = (status: string): Tone => STATUS_TONE[status] ?? 'neutral';

export default async function BookingPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const booking = await getBookingByReference(reference).catch(() => null);
  if (!booking) notFound();

  const nightly = Array.isArray(booking.priceBreakdown)
    ? (booking.priceBreakdown as { date: string; rateCents: number }[])
    : [];

  const cancellable = booking.status === 'CONFIRMED' || booking.status === 'HELD';

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      {booking.status === 'CONFIRMED' ? (
        <div className="mb-8 flex items-center gap-3 rounded-2xl bg-emerald-500/10 p-4 text-emerald-200">
          <CheckCircle2 className="size-5 shrink-0" />
          <p className="text-sm">
            You are booked. A confirmation is on its way to {booking.guestEmail}.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-brand-400">Reference {booking.reference}</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink-50">
            {booking.roomType.name}
          </h1>
          <p className="mt-2 flex items-center gap-2 text-ink-300">
            <MapPin className="size-4" /> Cove &amp; Spruce, Bar Harbor
          </p>
        </div>
        <Badge tone={toneFor(booking.status)}>{booking.status.replace('_', ' ')}</Badge>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <Card className="p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium text-ink-100">
            <CalendarCheck className="size-4 text-brand-400" /> Your stay
          </p>
          <dl className="space-y-2 text-sm">
            {[
              ['Dates', formatStayRange(booking.checkIn, booking.checkOut)],
              ['Nights', String(booking.nights)],
              ['Guests', `${booking.adults} adults${booking.children ? `, ${booking.children} children` : ''}`],
              ['Room', booking.roomUnit ? `${booking.roomUnit.code} (floor ${booking.roomUnit.floor})` : 'Assigned at check-in'],
              ['Rate plan', booking.ratePlan?.name ?? 'Standard'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-ink-500">{k}</dt>
                <dd className="text-right text-ink-200">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="p-5">
          <p className="mb-3 text-sm font-medium text-ink-100">What you paid</p>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">Room</dt><dd className="text-ink-200">{formatMoney(booking.subtotalCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Fees</dt><dd className="text-ink-200">{formatMoney(booking.feesCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Taxes</dt><dd className="text-ink-200">{formatMoney(booking.taxesCents)}</dd></div>
            <div className="flex justify-between border-t hairline pt-2 font-semibold text-ink-50">
              <dt>Total</dt><dd>{formatMoney(booking.totalCents)}</dd>
            </div>
          </dl>
          {booking.payments.length ? (
            <p className="mt-3 text-xs text-ink-500">
              Paid via {booking.payments[0]!.provider.toLowerCase()}, {booking.payments[0]!.status.toLowerCase()}
            </p>
          ) : null}
        </Card>
      </div>

      {nightly.length ? (
        <Card className="mt-5 p-5">
          <p className="mb-3 text-sm font-medium text-ink-100">Nightly breakdown</p>
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
            {nightly.map((n) => (
              <li key={n.date} className="flex justify-between rounded-lg bg-ink-900/40 px-3 py-1.5">
                <span className="text-ink-400">{n.date}</span>
                <span className="text-ink-200">{formatMoney(n.rateCents)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mt-5 p-5">
        <p className="mb-3 text-sm font-medium text-ink-100">Booking history</p>
        <ol className="space-y-2.5">
          {booking.events.map((event) => (
            <li key={event.id} className="flex items-start gap-3 text-sm">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-400" />
              <div>
                <p className="text-ink-200">
                  {event.type.replace(/_/g, ' ').toLowerCase()}
                  {event.fromState ? ` (${event.fromState} to ${event.toState})` : ''}
                </p>
                <p className="text-xs text-ink-500">
                  {event.createdAt.toISOString().replace('T', ' ').slice(0, 16)}, {event.actor}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <Link href="/rooms" className="text-sm text-ink-400 hover:text-ink-100">Browse more rooms</Link>
        {cancellable ? <CancelBookingButton reference={booking.reference} /> : null}
      </div>
    </div>
  );
}
