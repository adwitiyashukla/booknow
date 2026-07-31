import { Prisma, type BookingStatus } from '@prisma/client';

import { nightsBetween, toUtcDate } from '@/lib/dates';
import { quoteStay, refundForCancellation, type PriceQuote, type RateRuleInput } from '@/lib/pricing';
import { remainingInventory } from '@/lib/availability';
import { bookingReference } from '@/lib/utils';
import type { CreateBookingInput } from '@/lib/validation';
import { db } from './db';
import { env } from './env';
import { AppError, InventoryConflictError, NotFoundError } from './errors';
import { pickUnitForStay, loadOverlappingBookings, blockingWhere } from './inventory';
import { ALLOWED_TRANSITIONS, canTransition } from '@/lib/booking-state';

export { ALLOWED_TRANSITIONS, canTransition };

export async function quoteForRoom(input: {
  roomTypeId: string;
  ratePlanId?: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
}): Promise<{ quote: PriceQuote; unitsAvailable: number; roomTypeName: string }> {
  const checkIn = toUtcDate(input.checkIn);
  const checkOut = toUtcDate(input.checkOut);
  if (nightsBetween(checkIn, checkOut) <= 0) {
    throw new AppError('Check-out must be after check-in.');
  }

  const roomType = await db.roomType.findUnique({
    where: { id: input.roomTypeId },
    include: {
      units: { where: { status: 'AVAILABLE' }, select: { id: true } },
      rateRules: true,
      ratePlans: true,
    },
  });
  if (!roomType) throw new NotFoundError('Room type');

  const booked = await loadOverlappingBookings(checkIn, checkOut, [roomType.id]);
  const { available, occupancyByDate } = remainingInventory(
    { checkIn, checkOut },
    roomType.units.length,
    booked,
  );

  const globalRules = await db.rateRule.findMany({ where: { roomTypeId: null } });
  const rateRules: RateRuleInput[] = [...globalRules, ...roomType.rateRules];

  const ratePlan = input.ratePlanId
    ? roomType.ratePlans.find((p) => p.id === input.ratePlanId)
    : undefined;

  if (ratePlan && nightsBetween(checkIn, checkOut) < ratePlan.minNights) {
    throw new AppError(`The ${ratePlan.name} rate requires at least ${ratePlan.minNights} nights.`);
  }

  const quote = quoteStay({
    baseRateCents: roomType.baseRateCents,
    checkIn,
    checkOut,
    adults: input.adults,
    children: input.children,
    maxAdults: roomType.maxAdults,
    occupancyByDate,
    rateRules,
    ratePlanAdjustmentPct: ratePlan?.adjustmentPct ?? 0,
  });

  return { quote, unitsAvailable: available, roomTypeName: roomType.name };
}

/**
 * Create a HELD booking.
 *
 * Correctness notes
 *  - Runs at Serializable isolation. Two guests racing for the last unit will
 *    make one transaction fail with a 40001 serialization error rather than
 *    both succeeding, and we surface that as a clean 409.
 *  - Availability is re-checked *inside* the transaction. Checking before the
 *    transaction would be a time-of-check-to-time-of-use bug.
 *  - The price is recomputed server side. The client quote is advisory only,
 *    so a tampered payload cannot buy a suite for a dollar.
 *  - The hold expires, so abandoned checkouts return inventory automatically.
 */
export async function createBookingHold(
  input: CreateBookingInput & { userId?: string },
): Promise<{ reference: string; id: string; quote: PriceQuote; holdExpiresAt: Date }> {
  const checkIn = toUtcDate(input.checkIn);
  const checkOut = toUtcDate(input.checkOut);
  const nights = nightsBetween(checkIn, checkOut);

  if (nights <= 0) throw new AppError('Check-out must be after check-in.');
  if (nights > 30) throw new AppError('Stays longer than 30 nights need a call with our team.');
  if (checkIn < toUtcDate(new Date())) throw new AppError('Check-in cannot be in the past.');

  const holdExpiresAt = new Date(Date.now() + env.BOOKING_HOLD_MINUTES * 60_000);

  try {
    return await db.$transaction(
      async (tx) => {
        const roomType = await tx.roomType.findUnique({
          where: { id: input.roomTypeId },
          include: {
            units: { where: { status: 'AVAILABLE' }, select: { id: true } },
            rateRules: true,
            ratePlans: true,
          },
        });
        if (!roomType) throw new NotFoundError('Room type');
        if (input.adults > roomType.maxAdults + 2) {
          throw new AppError('That party size does not fit this room type.');
        }

        // Re-read inventory inside the transaction (TOCTOU guard).
        const blocking = await tx.booking.findMany({
          where: {
            roomTypeId: roomType.id,
            ...blockingWhere(),
            checkIn: { lt: checkOut },
            checkOut: { gt: checkIn },
          },
          select: { roomUnitId: true, checkIn: true, checkOut: true, status: true },
        });

        const { available, occupancyByDate } = remainingInventory(
          { checkIn, checkOut },
          roomType.units.length,
          blocking,
        );
        if (available < 1) throw new InventoryConflictError();

        const roomUnitId = await pickUnitForStay(tx, roomType.id, checkIn, checkOut);
        if (!roomUnitId) throw new InventoryConflictError();

        const globalRules = await tx.rateRule.findMany({ where: { roomTypeId: null } });
        const ratePlan = input.ratePlanId
          ? roomType.ratePlans.find((p) => p.id === input.ratePlanId)
          : roomType.ratePlans[0];

        // Authoritative price: never trust the client's number.
        const quote = quoteStay({
          baseRateCents: roomType.baseRateCents,
          checkIn,
          checkOut,
          adults: input.adults,
          children: input.children,
          maxAdults: roomType.maxAdults,
          occupancyByDate,
          rateRules: [...globalRules, ...roomType.rateRules],
          ratePlanAdjustmentPct: ratePlan?.adjustmentPct ?? 0,
        });

        const reference = bookingReference();

        const booking = await tx.booking.create({
          data: {
            reference,
            userId: input.userId ?? null,
            roomTypeId: roomType.id,
            roomUnitId,
            ratePlanId: ratePlan?.id ?? null,
            status: 'HELD',
            guestName: input.guestName,
            guestEmail: input.guestEmail,
            guestPhone: input.guestPhone ?? null,
            checkIn,
            checkOut,
            nights,
            adults: input.adults,
            children: input.children,
            subtotalCents: quote.subtotalCents,
            taxesCents: quote.taxesCents,
            feesCents: quote.feesCents,
            discountCents: quote.discountCents,
            totalCents: quote.totalCents,
            currency: quote.currency,
            priceBreakdown: quote.nightly as unknown as Prisma.InputJsonValue,
            specialRequests: input.specialRequests ?? null,
            holdExpiresAt,
          },
        });

        await tx.bookingEvent.create({
          data: {
            bookingId: booking.id,
            type: 'HOLD_CREATED',
            toState: 'HELD',
            actor: input.userId ?? 'guest',
            metadata: { roomUnitId, nights, totalCents: quote.totalCents },
          },
        });

        return { reference, id: booking.id, quote, holdExpiresAt };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 },
    );
  } catch (error) {
    // Postgres raises 40001 when it cannot serialize concurrent writes. That
    // is the database telling us two guests raced, so it is a 409, not a 500.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2034' || error.code === 'P2002')
    ) {
      throw new InventoryConflictError();
    }
    throw error;
  }
}

export async function transitionBooking(params: {
  bookingId: string;
  to: BookingStatus;
  actor?: string;
  metadata?: Prisma.InputJsonValue;
  reason?: string;
}) {
  return db.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: params.bookingId } });
    if (!booking) throw new NotFoundError('Booking');

    if (!canTransition(booking.status, params.to)) {
      throw new AppError(
        `Cannot move a booking from ${booking.status} to ${params.to}.`,
        409,
        'INVALID_TRANSITION',
      );
    }

    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: params.to,
        ...(params.to === 'CONFIRMED' ? { confirmedAt: new Date(), holdExpiresAt: null } : {}),
        ...(params.to === 'CANCELLED'
          ? { cancelledAt: new Date(), cancellationReason: params.reason ?? null }
          : {}),
      },
    });

    await tx.bookingEvent.create({
      data: {
        bookingId: booking.id,
        type: `STATUS_${params.to}`,
        fromState: booking.status,
        toState: params.to,
        actor: params.actor ?? 'system',
        metadata: params.metadata,
      },
    });

    return updated;
  });
}

export async function cancelBooking(reference: string, reason?: string, actor = 'guest') {
  const booking = await db.booking.findUnique({
    where: { reference },
    include: { ratePlan: true, payments: true },
  });
  if (!booking) throw new NotFoundError('Booking');

  const refund = refundForCancellation({
    totalCents: booking.totalCents,
    checkIn: booking.checkIn,
    cancellationHours: booking.ratePlan?.cancellationHours ?? 48,
    refundable: booking.ratePlan?.refundable ?? true,
  });

  await transitionBooking({
    bookingId: booking.id,
    to: 'CANCELLED',
    actor,
    reason,
    metadata: { refundCents: refund.refundCents, policy: refund.reason },
  });

  return { booking, refund };
}

/**
 * Sweep abandoned holds. Invoked by a cron route so inventory is never leaked
 * by a guest who closed the tab mid-checkout.
 */
export async function expireStaleHolds(now = new Date()): Promise<number> {
  const stale = await db.booking.findMany({
    where: { status: 'HELD', holdExpiresAt: { lt: now } },
    select: { id: true },
  });

  for (const { id } of stale) {
    await transitionBooking({ bookingId: id, to: 'EXPIRED', actor: 'cron' }).catch(() => undefined);
  }
  return stale.length;
}

export async function getBookingByReference(reference: string) {
  const booking = await db.booking.findUnique({
    where: { reference },
    include: {
      roomType: { select: { name: true, slug: true, images: true } },
      roomUnit: { select: { code: true, floor: true } },
      ratePlan: true,
      payments: true,
      events: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!booking) throw new NotFoundError('Booking');
  return booking;
}
