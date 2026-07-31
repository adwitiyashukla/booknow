import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { env, features } from '@/server/env';
import { getStripe, settlePayment } from '@/server/payments';

/**
 * Stripe webhook receiver.
 *
 * Three things make this production-safe rather than demo-safe:
 *   1. The raw body is verified against the signing secret, so a forged POST
 *      cannot confirm a booking for free.
 *   2. Settlement is keyed on the Stripe event id, so retried deliveries are
 *      no-ops instead of double confirmations.
 *   3. Unknown event types return 200, otherwise Stripe retries them forever.
 */
export async function POST(request: Request) {
  if (!features.stripe) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });

  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.warn('Rejected webhook with a bad signature', error);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const reference = session.client_reference_id ?? session.metadata?.reference;
        if (!reference) break;

        await settlePayment({
          reference,
          providerRef: session.id,
          amountCents: session.amount_total ?? 0,
          idempotencyKey: event.id,
        });
        break;
      }

      case 'checkout.session.expired':
        // The booking hold expires on its own via the cron sweep.
        break;

      default:
        break;
    }
  } catch (error) {
    console.error('Webhook handling failed', error);
    // 500 asks Stripe to retry, which is correct for a transient failure.
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
