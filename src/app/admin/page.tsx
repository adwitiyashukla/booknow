import { Suspense } from 'react';
import { Activity, BedDouble, Percent, TrendingUp, Wallet } from 'lucide-react';

import { Card } from '@/components/ui';
import { KpiCard } from '@/components/admin/kpi-card';
import { RevenueChart, OccupancyChart, MixChart } from '@/components/admin/charts';
import { getDashboardMetrics, getForwardPickup } from '@/server/analytics';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';

/** Ranked breakdown with an inline share bar, used by the acquisition panels. */
function ShareList({ rows }: { rows: { label: string; value: number }[] }) {
  if (!rows.length) {
    return (
      <p className="text-sm text-ink-500">
        No acquisition data on this ledger. Run{' '}
        <code className="text-brand-300">npm run db:import:real</code> to load the real dataset.
      </p>
    );
  }
  const top = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((acc, r) => acc + r.value, 0) || 1;

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="text-ink-300">{row.label}</span>
            <span className="text-ink-500">
              {((row.value / total) * 100).toFixed(0)}%
              <span className="ml-2 text-ink-400">{row.value.toLocaleString()}</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
            <div
              className="h-full rounded-full bg-brand-500/70"
              style={{ width: `${Math.max(3, (row.value / top) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

async function Dashboard() {
  const [metrics, pickup] = await Promise.all([getDashboardMetrics(30), getForwardPickup(45)]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          icon={Wallet}
          label="Revenue (30d)"
          value={formatMoney(metrics.totalRevenueCents)}
          sub={`${metrics.bookings} reservations`}
        />
        <KpiCard
          icon={Percent}
          label="Occupancy"
          value={`${(metrics.occupancyRate * 100).toFixed(1)}%`}
          sub={`${metrics.roomNightsSold} of ${metrics.roomNightsAvailable} room-nights`}
        />
        <KpiCard
          icon={TrendingUp}
          label="ADR"
          value={formatMoney(metrics.adrCents)}
          sub="Average daily rate"
        />
        <KpiCard
          icon={BedDouble}
          label="RevPAR"
          value={formatMoney(metrics.revParCents)}
          sub="Revenue per available room"
        />
        <KpiCard
          icon={Activity}
          label="Realisation"
          value={`${(metrics.realisationRate * 100).toFixed(0)}%`}
          sub={`${(metrics.cancellationRate * 100).toFixed(0)}% cancelled or abandoned`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="p-6 xl:col-span-2">
          <h2 className="mb-1 text-lg text-ink-50">Room revenue, last 30 nights</h2>
          <p className="mb-5 text-sm text-ink-500">{metrics.rangeLabel}</p>
          <RevenueChart data={metrics.revenueByDay} />
        </Card>

        <Card className="p-6">
          <h2 className="mb-1 text-lg text-ink-50">Revenue by room type</h2>
          <p className="mb-5 text-sm text-ink-500">Where the money actually comes from</p>
          <MixChart data={metrics.revenueByRoomType.map((r) => ({ name: r.name, value: r.revenueCents }))} />
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="mb-1 text-lg text-ink-50">Forward pickup, next 45 nights</h2>
        <p className="mb-5 text-sm text-ink-500">
          What is already on the books, including unpaid holds. This is the number a revenue
          manager watches to decide whether to discount.
        </p>
        <OccupancyChart data={pickup} />
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-6">
          <h3 className="mb-4 text-sm font-medium text-ink-100">Booking mix</h3>
          <ul className="space-y-2.5">
            {metrics.statusMix.map((s) => (
              <li key={s.status} className="flex items-center justify-between text-sm">
                <span className="text-ink-400">{s.status.replace('_', ' ').toLowerCase()}</span>
                <span className="text-ink-100">{s.count}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 text-sm font-medium text-ink-100">Guest behaviour</h3>
          <ul className="space-y-2.5 text-sm">
            <li className="flex justify-between"><span className="text-ink-400">Average lead time</span><span className="text-ink-100">{metrics.averageLeadTimeDays} days</span></li>
            <li className="flex justify-between"><span className="text-ink-400">Average stay</span><span className="text-ink-100">{metrics.averageLengthOfStay} nights</span></li>
            <li className="flex justify-between"><span className="text-ink-400">Room nights sold</span><span className="text-ink-100">{metrics.roomNightsSold}</span></li>
          </ul>
        </Card>

        <Card className="p-6">
          <h3 className="mb-1 text-sm font-medium text-ink-100">Market segment</h3>
          <p className="mb-4 text-xs text-ink-500">How the business was acquired</p>
          <ShareList rows={metrics.topSources} />
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <h3 className="mb-1 text-sm font-medium text-ink-100">Source markets</h3>
          <p className="mb-4 text-xs text-ink-500">Guest country of origin</p>
          <ShareList rows={metrics.topCountries} />
        </Card>

        <Card className="p-6">
          <h3 className="mb-1 text-sm font-medium text-ink-100">Distribution channel</h3>
          <p className="mb-4 text-xs text-ink-500">Who owns the guest relationship</p>
          <ShareList rows={metrics.channelMix} />
        </Card>
      </div>
    </div>
  );
}

export default function AdminOverview() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
          </div>
          <div className="skeleton h-80 rounded-2xl" />
        </div>
      }
    >
      <Dashboard />
    </Suspense>
  );
}
