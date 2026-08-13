import { Badge, Card } from '@/components/ui';
import { db } from '@/server/db';
import { loadOverlappingBookings } from '@/server/inventory';
import { remainingInventory } from '@/lib/availability';
import { addDays, toUtcDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function AdminRooms() {
  const roomTypes = await db.roomType.findMany({
    orderBy: { baseRateCents: 'asc' },
    include: {
      units: true,
      reviews: { select: { rating: true } },
      _count: { select: { bookings: true } },
    },
  });

  const tonight = toUtcDate(new Date());
  const tomorrow = addDays(tonight, 1);
  const booked = await loadOverlappingBookings(tonight, tomorrow);

  return (
    <div className="space-y-6">
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="border-b hairline text-left text-xs uppercase tracking-wider text-ink-500">
              <th className="px-4 py-3 font-medium">Room type</th>
              <th className="px-4 py-3 text-right font-medium">Base rate</th>
              <th className="px-4 py-3 text-right font-medium">Units</th>
              <th className="px-4 py-3 text-right font-medium">Free tonight</th>
              <th className="px-4 py-3 text-right font-medium">Lifetime bookings</th>
              <th className="px-4 py-3 text-right font-medium">Rating</th>
              <th className="px-4 py-3 font-medium">Attributes</th>
            </tr>
          </thead>
          <tbody>
            {roomTypes.map((rt) => {
              const sellable = rt.units.filter((u) => u.status === 'AVAILABLE');
              const { available } = remainingInventory(
                { checkIn: tonight, checkOut: tomorrow },
                sellable.length,
                booked.filter((b) => b.roomTypeId === rt.id),
              );
              const ratings = rt.reviews.map((r) => r.rating);
              const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
              const outOfService = rt.units.length - sellable.length;

              return (
                <tr key={rt.id} className="border-b hairline last:border-0 hover:bg-ink-800/40">
                  <td className="px-4 py-3">
                    <p className="text-ink-100">{rt.name}</p>
                    <p className="text-xs text-ink-500">{rt.sizeSqm} sqm, sleeps {rt.maxAdults + rt.maxChildren}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-ink-200">{formatMoney(rt.baseRateCents)}</td>
                  <td className="px-4 py-3 text-right text-ink-300">
                    {sellable.length}
                    {outOfService ? <span className="text-xs text-amber-300"> (+{outOfService} OOS)</span> : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={available === 0 ? 'text-red-300' : available <= 2 ? 'text-amber-300' : 'text-emerald-300'}>
                      {available}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-ink-300">{rt._count.bookings}</td>
                  <td className="px-4 py-3 text-right text-ink-300">{avg ? avg.toFixed(2) : '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {rt.hasOceanView ? <Badge tone="brand">Ocean</Badge> : null}
                      {rt.hasBalcony ? <Badge tone="neutral">Balcony</Badge> : null}
                      {rt.isAccessible ? <Badge tone="neutral">Accessible</Badge> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-ink-500">
        Availability is computed live from the booking ledger using the same half-open interval
        logic the reservation endpoint uses, so this table can never disagree with what a guest sees.
      </p>
    </div>
  );
}
