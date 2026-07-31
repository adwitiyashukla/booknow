import Link from 'next/link';
import type { Metadata } from 'next';
import { Award } from 'lucide-react';

import { Badge, Card, EmptyState, SectionHeading, Stat } from '@/components/ui';
import { requireUser } from '@/server/auth';
import { db } from '@/server/db';
import { formatMoney } from '@/lib/money';
import { formatStayRange } from '@/lib/dates';

export const metadata: Metadata = { title: 'My stays' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await requireUser();

  const [profile, bookings] = await Promise.all([
    db.user.findUnique({ where: { id: user.id } }),
    db.booking.findMany({
      where: { OR: [{ userId: user.id }, { guestEmail: user.email ?? '' }] },
      orderBy: { checkIn: 'desc' },
      include: { roomType: { select: { name: true, slug: true } } },
    }),
  ]);

  const upcoming = bookings.filter(
    (b) => b.checkOut >= new Date() && ['HELD', 'CONFIRMED', 'CHECKED_IN'].includes(b.status),
  );
  const past = bookings.filter((b) => !upcoming.includes(b));
  const lifetime = bookings
    .filter((b) => ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'].includes(b.status))
    .reduce((acc, b) => acc + b.totalCents, 0);

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <SectionHeading eyebrow="Your account" title={`Welcome back, ${user.name?.split(' ')[0] ?? 'guest'}`} />

      <Card className="mb-10 flex flex-wrap items-center justify-between gap-6 p-6">
        <Stat label="Stays booked" value={String(bookings.length)} />
        <Stat label="Lifetime spend" value={formatMoney(lifetime)} />
        <Stat label="Loyalty points" value={(profile?.loyaltyPoints ?? 0).toLocaleString()} />
        <Badge tone="brand"><Award className="size-3" /> {profile?.loyaltyTier ?? 'EXPLORER'}</Badge>
      </Card>

      <section className="mb-10">
        <h2 className="mb-4 text-xl text-ink-50">Upcoming</h2>
        {upcoming.length ? (
          <ul className="space-y-3">
            {upcoming.map((b) => (
              <li key={b.id}>
                <Link href={`/bookings/${b.reference}`}>
                  <Card className="flex flex-wrap items-center justify-between gap-4 p-5 transition-colors hover:border-brand-400/50">
                    <div>
                      <p className="font-medium text-ink-50">{b.roomType.name}</p>
                      <p className="text-sm text-ink-400">
                        {formatStayRange(b.checkIn, b.checkOut)} · {b.nights} nights · {b.reference}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-ink-200">{formatMoney(b.totalCents)}</span>
                      <Badge tone={b.status === 'CONFIRMED' ? 'good' : 'warn'}>{b.status}</Badge>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No upcoming stays" hint="When you book, it will appear here with your room assignment and full price breakdown." />
        )}
      </section>

      {past.length ? (
        <section>
          <h2 className="mb-4 text-xl text-ink-50">Past and cancelled</h2>
          <ul className="space-y-2">
            {past.slice(0, 12).map((b) => (
              <li key={b.id}>
                <Link href={`/bookings/${b.reference}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border hairline px-4 py-3 text-sm transition-colors hover:border-brand-400/40">
                  <span className="text-ink-200">{b.roomType.name}</span>
                  <span className="text-ink-500">{formatStayRange(b.checkIn, b.checkOut)}</span>
                  <Badge tone={b.status === 'CHECKED_OUT' ? 'neutral' : 'bad'}>{b.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
