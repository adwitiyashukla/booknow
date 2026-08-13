import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { env, features } from '@/server/env';
import { getStripe, settlePayment } from '@/server/payments';

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
        break;

      default:
        break;
    }
  } catch (error) {
    console.error('Webhook handling failed', error);
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
