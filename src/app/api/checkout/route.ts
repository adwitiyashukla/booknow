import { NextResponse } from 'next/server';
import { z } from 'zod';

import { startCheckout } from '@/server/payments';
import { toErrorResponse } from '@/server/errors';

const schema = z.object({ reference: z.string().min(3) });

export async function POST(request: Request) {
  try {
    const { reference } = schema.parse(await request.json());
    const origin = new URL(request.url).origin;
    const result = await startCheckout(reference, origin);
    return NextResponse.json(result);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
