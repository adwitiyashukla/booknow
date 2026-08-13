import { NextResponse } from 'next/server';

import { expireStaleHolds } from '@/server/booking-service';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const expired = await expireStaleHolds();
  return NextResponse.json({ expired, at: new Date().toISOString() });
}
