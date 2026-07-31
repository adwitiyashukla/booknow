import type { Metadata } from 'next';
import Link from 'next/link';

import './globals.css';
import { SiteNav } from '@/components/site-nav';
import { ConciergeWidget } from '@/components/concierge-widget';

export const metadata: Metadata = {
  title: {
    default: 'BookNow | Cove & Spruce reservations',
    template: '%s | BookNow',
  },
  description:
    'A production-grade resort reservation platform: real-time availability, demand-based pricing, an AI concierge, and a revenue-management dashboard.',
  openGraph: {
    title: 'BookNow | Cove & Spruce reservations',
    description: 'Real-time availability, dynamic pricing, and an AI concierge.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-ink-950"
        >
          Skip to content
        </a>
        <SiteNav />
        <main id="main">{children}</main>
        <footer className="mt-24 border-t hairline">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-sm text-ink-500 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-[family-name:var(--font-display)] text-lg text-ink-200">BookNow</p>
              <p className="mt-1">Reservation platform for Cove &amp; Spruce, Bar Harbor, Maine.</p>
            </div>
            <nav className="flex flex-wrap gap-5">
              <Link href="/rooms" className="hover:text-ink-200">Rooms</Link>
              <Link href="/account" className="hover:text-ink-200">My stays</Link>
              <Link href="/admin" className="hover:text-ink-200">Operations</Link>
              <a href="https://github.com" className="hover:text-ink-200">Source</a>
            </nav>
          </div>
        </footer>
        <ConciergeWidget />
      </body>
    </html>
  );
}
