import { NextResponse } from 'next/server';

import { cancelBooking } from '@/server/booking-service';
import { refundBooking } from '@/server/payments';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { ForbiddenError, toErrorResponse } from '@/server/errors';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  try {
    const { reference } = await params;
    const session = await auth().catch(() => null);
    const body = (await request.json().catch(() => ({}))) as { reason?: string };

    const booking = await db.booking.findUnique({
      where: { reference },
      select: { userId: true, guestEmail: true },
    });

    // A guest may cancel their own booking; staff may cancel any booking.
    const isStaff = session?.user?.role === 'ADMIN' || session?.user?.role === 'STAFF';
    const isOwner =
      !!session?.user &&
      (booking?.userId === session.user.id || booking?.guestEmail === session.user.email);
    if (!isStaff && !isOwner) throw new ForbiddenError('You cannot cancel this booking.');

    const { refund } = await cancelBooking(reference, body.reason, session?.user?.id ?? 'guest');
    if (refund.refundCents > 0) await refundBooking(reference, refund.refundCents).catch(() => null);

    return NextResponse.json({ ok: true, refund });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
