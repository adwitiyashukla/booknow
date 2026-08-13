import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Clock, ShieldCheck } from 'lucide-react';

import { Badge, Card } from '@/components/ui';
import { PayButton } from '@/components/pay-button';
import { getBookingByReference } from '@/server/booking-service';
import { features } from '@/server/env';
import { formatMoney } from '@/lib/money';
import { formatStayRange } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const booking = await getBookingByReference(reference).catch(() => null);
  if (!booking) notFound();

  const expired = booking.holdExpiresAt ? booking.holdExpiresAt < new Date() : false;

  if (booking.status === 'CONFIRMED') {
    return (
      <div className="mx-auto max-w-lg px-5 py-20 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink-50">
          This booking is already paid.
        </h1>
        <Link href={`/bookings/${booking.reference}`} className="mt-4 inline-block text-brand-300 hover:underline">
          View your confirmation
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-brand-400">Step 2 of 2</p>
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-ink-50">Confirm and pay</h1>

      <Card className="mt-8 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-500">Reservation</p>
            <p className="text-lg font-semibold text-ink-50">{booking.roomType.name}</p>
            <p className="text-sm text-ink-400">
              {formatStayRange(booking.checkIn, booking.checkOut)}, {booking.nights} night
              {booking.nights > 1 ? 's' : ''}, {booking.adults} adults
              {booking.children ? `, ${booking.children} children` : ''}
            </p>
            {booking.roomUnit ? (
              <p className="mt-1 text-xs text-ink-500">
                Room {booking.roomUnit.code}, floor {booking.roomUnit.floor}
              </p>
            ) : null}
          </div>
          <Badge tone={expired ? 'bad' : 'warn'}>
            <Clock className="size-3" />
            {expired ? 'Hold expired' : 'Held for you'}
          </Badge>
        </div>

        <dl className="mt-6 space-y-2 border-t hairline pt-5 text-sm">
          <div className="flex justify-between text-ink-300">
            <dt>Room subtotal</dt><dd>{formatMoney(booking.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between text-ink-300">
            <dt>Fees</dt><dd>{formatMoney(booking.feesCents)}</dd>
          </div>
          <div className="flex justify-between text-ink-300">
            <dt>Taxes</dt><dd>{formatMoney(booking.taxesCents)}</dd>
          </div>
          <div className="flex justify-between border-t hairline pt-3 text-lg font-semibold text-ink-50">
            <dt>Due now</dt><dd>{formatMoney(booking.totalCents)}</dd>
          </div>
        </dl>

        {expired ? (
          <p className="mt-6 rounded-xl bg-red-500/10 p-4 text-sm text-red-200">
            This hold expired and the room went back into inventory.{' '}
            <Link href="/rooms" className="underline">Search again</Link>.
          </p>
        ) : (
          <>
            <PayButton reference={booking.reference} amountCents={booking.totalCents} />
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-500">
              <ShieldCheck className="size-3.5" />
              {features.stripe
                ? 'Card details go straight to Stripe. They never touch our servers.'
                : 'Demo mode: no Stripe key configured, so payment is simulated locally.'}
            </p>
          </>
        )}
      </Card>

      <p className="mt-6 text-center text-xs text-ink-500">
        Reference {booking.reference}, {booking.ratePlan?.name ?? 'Standard rate'}
        {booking.ratePlan && !booking.ratePlan.refundable ? ' (non-refundable)' : ''}
      </p>
    </div>
  );
}
