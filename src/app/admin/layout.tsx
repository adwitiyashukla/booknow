import Link from 'next/link';
import type { Metadata } from 'next';
import { BedDouble, CalendarRange, Download, LayoutDashboard } from 'lucide-react';

import { requireRole } from '@/server/auth';
import { Badge } from '@/components/ui';

export const metadata: Metadata = { title: 'Operations' };

const NAV = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/bookings', label: 'Bookings', icon: CalendarRange },
  { href: '/admin/rooms', label: 'Inventory', icon: BedDouble },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('ADMIN', 'STAFF');

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink-50">Operations</h1>
          <p className="mt-1 text-sm text-ink-500">
            Signed in as {user.name} <Badge tone="brand">{user.role}</Badge>
          </p>
        </div>
        <a
          href="/api/admin/export"
          className="inline-flex items-center gap-2 rounded-full glass px-4 py-2 text-sm text-ink-200 transition-colors hover:border-brand-400/60"
        >
          <Download className="size-4" /> Export CSV
        </a>
      </div>

      <nav className="mb-8 flex flex-wrap gap-2">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="inline-flex items-center gap-2 rounded-full border hairline px-4 py-2 text-sm text-ink-300 transition-colors hover:border-brand-400/60 hover:text-ink-50"
          >
            <Icon className="size-4" /> {label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
