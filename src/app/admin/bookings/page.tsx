import Link from 'next/link';

import { Badge, Card, EmptyState } from '@/components/ui';
import { db } from '@/server/db';
import { formatMoney } from '@/lib/money';
import { formatStayRange } from '@/lib/dates';

export const dynamic = 'force-dynamic';

type Tone = 'neutral' | 'brand' | 'warn' | 'good' | 'bad';

const STATUS_TONE: Record<string, Tone> = {
  HELD: 'warn', CONFIRMED: 'good', CHECKED_IN: 'brand', CHECKED_OUT: 'neutral',
  CANCELLED: 'bad', EXPIRED: 'bad', NO_SHOW: 'bad',
};

const toneFor = (status: string): Tone => STATUS_TONE[status] ?? 'neutral';

const FILTERS = ['ALL', 'HELD', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'] as const;

export default async function AdminBookings({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status, q } = await searchParams;
  const active = status && status !== 'ALL' ? status : undefined;

  const bookings = await db.booking.findMany({
    where: {
      ...(active ? { status: active as never } : {}),
      ...(q
        ? {
            OR: [
              { reference: { contains: q, mode: 'insensitive' as const } },
              { guestName: { contains: q, mode: 'insensitive' as const } },
              { guestEmail: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: { checkIn: 'desc' },
    take: 60,
    include: {
      roomType: { select: { name: true } },
      roomUnit: { select: { code: true } },
    },
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <nav className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={`/admin/bookings${f === 'ALL' ? '' : `?status=${f}`}`}
              className={`rounded-full px-3.5 py-1.5 text-xs transition-colors ${
                (status ?? 'ALL') === f
                  ? 'bg-brand-500 text-ink-950'
                  : 'border hairline text-ink-400 hover:text-ink-100'
              }`}
            >
              {f.replace('_', ' ').toLowerCase()}
            </Link>
          ))}
        </nav>

        <form className="ml-auto">
          {active ? <input type="hidden" name="status" value={active} /> : null}
          <input
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search reference, name, email"
            className="h-9 w-64 rounded-full border border-ink-700/60 bg-ink-900/60 px-4 text-sm text-ink-50 placeholder:text-ink-600 focus:border-brand-400 focus:outline-none"
          />
        </form>
      </div>

      {bookings.length === 0 ? (
        <EmptyState title="No bookings match that filter" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b hairline text-left text-xs uppercase tracking-wider text-ink-500">
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Guest</th>
                <th className="px-4 py-3 font-medium">Room</th>
                <th className="px-4 py-3 font-medium">Stay</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-b hairline last:border-0 hover:bg-ink-800/40">
                  <td className="px-4 py-3">
                    <Link href={`/bookings/${b.reference}`} className="font-mono text-xs text-brand-300 hover:underline">
                      {b.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink-100">{b.guestName}</p>
                    <p className="text-xs text-ink-500">{b.guestEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-300">
                    {b.roomType.name}
                    {b.roomUnit ? <span className="block text-xs text-ink-500">{b.roomUnit.code}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-ink-300">
                    {formatStayRange(b.checkIn, b.checkOut)}
                    <span className="block text-xs text-ink-500">{b.nights} nights</span>
                  </td>
                  <td className="px-4 py-3 text-right text-ink-100">{formatMoney(b.totalCents)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={toneFor(b.status)}>{b.status.replace('_', ' ').toLowerCase()}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
