import { redirect } from 'next/navigation';
import { CreditCard } from 'lucide-react';

import { Button, Card } from '@/components/ui';
import { db } from '@/server/db';
import { settlePayment } from '@/server/payments';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';

/**
 * Stand-in for Stripe Checkout when no API key is configured.
 *
 * It deliberately calls the exact same settlePayment() path the real webhook
 * uses, so the demo exercises the production code rather than a shortcut.
 */
export default async function SimulatedCheckout({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; amount?: string }>;
}) {
  const { ref, amount } = await searchParams;
  if (!ref) redirect('/rooms');

  const booking = await db.booking.findUnique({ where: { reference: ref } });
  if (!booking) redirect('/rooms');

  async function confirm() {
    'use server';
    await settlePayment({
      reference: ref!,
      providerRef: `sim_${ref}`,
      amountCents: Number(amount ?? booking!.totalCents),
      idempotencyKey: `sim_evt_${ref}`,
    });
    redirect(`/bookings/${ref}?paid=1`);
  }

  return (
    <div className="mx-auto max-w-md px-5 py-20">
      <Card className="p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-500/12 text-brand-400">
            <CreditCard className="size-5" />
          </span>
          <div>
            <p className="font-semibold text-ink-50">Simulated payment</p>
            <p className="text-xs text-ink-500">No Stripe key configured</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-ink-300">
          In production this screen is Stripe Checkout. Confirming here runs the same settlement
          function the Stripe webhook calls, including the idempotency guard, so the booking
          lifecycle is genuinely exercised.
        </p>

        <div className="my-6 rounded-xl bg-ink-900/60 p-4">
          <p className="text-xs uppercase tracking-wider text-ink-500">Amount</p>
          <p className="text-2xl font-semibold text-ink-50">
            {formatMoney(Number(amount ?? booking.totalCents))}
          </p>
          <p className="mt-1 text-xs text-ink-500">Reference {ref}</p>
        </div>

        <form action={confirm}>
          <Button type="submit" size="lg" className="w-full">Confirm payment</Button>
        </form>
      </Card>
    </div>
  );
}
