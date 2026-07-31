import { NextResponse } from 'next/server';

import { quoteRequestSchema } from '@/lib/validation';
import { quoteForRoom } from '@/server/booking-service';
import { toErrorResponse } from '@/server/errors';
import { clientKey, rateLimit } from '@/server/rate-limit';

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, 'quote'), { limit: 60, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many pricing requests.' }, { status: 429 });
  }

  try {
    const input = quoteRequestSchema.parse(await request.json());
    const result = await quoteForRoom(input);
    return NextResponse.json(result);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
