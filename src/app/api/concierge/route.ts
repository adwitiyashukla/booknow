import { NextResponse } from 'next/server';

import { conciergeSchema } from '@/lib/validation';
import { askConcierge } from '@/server/ai';
import { toErrorResponse } from '@/server/errors';
import { clientKey, rateLimit } from '@/server/rate-limit';

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, 'concierge'), { limit: 20, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'You are asking faster than I can answer. Give me a minute.' },
      { status: 429, headers: { 'retry-after': '60' } },
    );
  }

  try {
    const { message } = conciergeSchema.parse(await request.json());
    const reply = await askConcierge(message);
    return NextResponse.json(reply, {
      headers: { 'x-ratelimit-remaining': String(limit.remaining) },
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
