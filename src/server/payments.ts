import Stripe from 'stripe';

import { db } from './db';
import { env, features } from './env';
import { AppError, NotFoundError } from './errors';
import { transitionBooking } from './booking-service';

/**
 * Payment provider abstraction.
 *
 * The app ships with two implementations behind one interface:
 *   - StripeProvider: real Checkout Sessions, signed webhooks, real refunds.
 *   - SimulatedProvider: an in-process mock used when no Stripe key is set.
 *
 * That means a recruiter can clone the repo and complete a booking end to end
 * without creating a Stripe account, while the production path is genuine.
 */

export interface CheckoutRequest {
  bookingId: string;
  reference: string;
  amountCents: number;
  currency: string;
  description: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  url: string;
  providerRef: string;
  provider: 'STRIPE' | 'SIMULATED';
}

export interface PaymentProviderAdapter {
  readonly name: 'STRIPE' | 'SIMULATED';
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  refund(providerRef: string, amountCents: number): Promise<{ refundedCents: number }>;
}

let stripeClient: Stripe | null = null;
export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new AppError('Stripe is not configured.', 503, 'STRIPE_DISABLED');
  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2025-09-30.clover' as Stripe.LatestApiVersion });
  return stripeClient;
}

const stripeProvider: PaymentProviderAdapter = {
  name: 'STRIPE',
  async createCheckout(request) {
    const session = await getStripe().checkout.sessions.create(
      {
        mode: 'payment',
        customer_email: request.customerEmail,
        client_reference_id: request.reference,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: request.currency.toLowerCase(),
              unit_amount: request.amountCents,
              product_data: { name: request.description },
            },
          },
        ],
        metadata: { bookingId: request.bookingId, reference: request.reference },
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      },
      // Stripe deduplicates retries of the same booking for us.
      { idempotencyKey: `checkout_${request.bookingId}` },
    );

    if (!session.url) throw new AppError('Stripe did not return a checkout URL.', 502);
    return { url: session.url, providerRef: session.id, provider: 'STRIPE' };
  },
  async refund(providerRef, amountCents) {
    const session = await getStripe().checkout.sessions.retrieve(providerRef);
    const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!intent) throw new AppError('No payment intent to refund.', 422);
    const refund = await getStripe().refunds.create({ payment_intent: intent, amount: amountCents });
    return { refundedCents: refund.amount ?? amountCents };
  },
};

const simulatedProvider: PaymentProviderAdapter = {
  name: 'SIMULATED',
  async createCheckout(request) {
    const providerRef = `sim_${request.bookingId}`;
    // The mock checkout page lives inside the app and calls the same
    // settlement code path the Stripe webhook uses.
    const url = `/checkout/simulate?ref=${encodeURIComponent(request.reference)}&amount=${request.amountCents}`;
    return { url, providerRef, provider: 'SIMULATED' };
  },
  async refund(_providerRef, amountCents) {
    return { refundedCents: amountCents };
  },
};

export function paymentProvider(): PaymentProviderAdapter {
  return features.stripe ? stripeProvider : simulatedProvider;
}

export async function startCheckout(reference: string, origin: string): Promise<CheckoutResult> {
  const booking = await db.booking.findUnique({
    where: { reference },
    include: { roomType: { select: { name: true } } },
  });
  if (!booking) throw new NotFoundError('Booking');
  if (booking.status !== 'HELD') throw new AppError('This booking is no longer awaiting payment.', 409);
  if (booking.holdExpiresAt && booking.holdExpiresAt < new Date()) {
    throw new AppError('Your hold expired. Please search again.', 410, 'HOLD_EXPIRED');
  }

  const provider = paymentProvider();
  const result = await provider.createCheckout({
    bookingId: booking.id,
    reference: booking.reference,
    amountCents: booking.totalCents,
    currency: booking.currency,
    description: `${booking.roomType.name} - ${booking.nights} night stay (${booking.reference})`,
    customerEmail: booking.guestEmail,
    successUrl: `${origin}/bookings/${booking.reference}?paid=1`,
    cancelUrl: `${origin}/checkout/${booking.reference}?cancelled=1`,
  });

  await db.payment.upsert({
    where: { providerRef: result.providerRef },
    create: {
      bookingId: booking.id,
      provider: provider.name,
      providerRef: result.providerRef,
      status: 'PENDING',
      amountCents: booking.totalCents,
      currency: booking.currency,
    },
    update: { status: 'PENDING' },
  });

  return result;
}

/**
 * Single settlement path shared by the Stripe webhook and the simulated
 * provider. Idempotent: replaying the same event is a no-op, which matters
 * because Stripe retries deliveries.
 */
export async function settlePayment(params: {
  reference: string;
  providerRef: string;
  amountCents: number;
  idempotencyKey: string;
}) {
  const existing = await db.payment.findUnique({ where: { idempotencyKey: params.idempotencyKey } });
  if (existing?.status === 'SUCCEEDED') return { alreadyProcessed: true, bookingId: existing.bookingId };

  const booking = await db.booking.findUnique({ where: { reference: params.reference } });
  if (!booking) throw new NotFoundError('Booking');

  await db.payment.upsert({
    where: { providerRef: params.providerRef },
    create: {
      bookingId: booking.id,
      provider: features.stripe ? 'STRIPE' : 'SIMULATED',
      providerRef: params.providerRef,
      status: 'SUCCEEDED',
      amountCents: params.amountCents,
      currency: booking.currency,
      idempotencyKey: params.idempotencyKey,
    },
    update: { status: 'SUCCEEDED', idempotencyKey: params.idempotencyKey },
  });

  if (booking.status === 'HELD') {
    await transitionBooking({
      bookingId: booking.id,
      to: 'CONFIRMED',
      actor: 'payment',
      metadata: { providerRef: params.providerRef, amountCents: params.amountCents },
    });
  }

  // Loyalty accrual: 1 point per dollar of room revenue.
  if (booking.userId) {
    await db.user.update({
      where: { id: booking.userId },
      data: { loyaltyPoints: { increment: Math.floor(booking.subtotalCents / 100) } },
    });
  }

  return { alreadyProcessed: false, bookingId: booking.id };
}

export async function refundBooking(reference: string, amountCents: number) {
  const booking = await db.booking.findUnique({
    where: { reference },
    include: { payments: { where: { status: 'SUCCEEDED' } } },
  });
  if (!booking) throw new NotFoundError('Booking');
  const payment = booking.payments[0];
  if (!payment?.providerRef) return { refundedCents: 0 };

  const { refundedCents } = await paymentProvider().refund(payment.providerRef, amountCents);

  await db.payment.update({
    where: { id: payment.id },
    data: {
      refundedCents: { increment: refundedCents },
      status: refundedCents >= payment.amountCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
    },
  });

  return { refundedCents };
}
