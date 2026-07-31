import { NextResponse } from 'next/server';

import { createBookingSchema } from '@/lib/validation';
import { createBookingHold } from '@/server/booking-service';
import { auth } from '@/server/auth';
import { toErrorResponse } from '@/server/errors';
import { clientKey, rateLimit } from '@/server/rate-limit';

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, 'booking'), { limit: 10, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many booking attempts. Wait a minute and try again.' },
      { status: 429, headers: { 'retry-after': '60' } },
    );
  }

  try {
    const input = createBookingSchema.parse(await request.json());
    const session = await auth().catch(() => null);

    const result = await createBookingHold({ ...input, userId: session?.user?.id });

    return NextResponse.json(
      {
        reference: result.reference,
        holdExpiresAt: result.holdExpiresAt,
        totalCents: result.quote.totalCents,
      },
      { status: 201 },
    );
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
