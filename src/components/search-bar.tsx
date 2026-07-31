'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CalendarDays, Search, Users } from 'lucide-react';

import { Button, Label } from '@/components/ui';
import { addDays, toDateKey } from '@/lib/dates';

export function SearchBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();

  const defaultIn = params.get('checkIn') ?? toDateKey(addDays(new Date(), 14));
  const defaultOut = params.get('checkOut') ?? toDateKey(addDays(new Date(), 17));

  const [checkIn, setCheckIn] = useState(defaultIn);
  const [checkOut, setCheckOut] = useState(defaultOut);
  const [adults, setAdults] = useState(params.get('adults') ?? '2');
  const [children, setChildren] = useState(params.get('children') ?? '0');

  function submit(event: FormEvent) {
    event.preventDefault();
    const query = new URLSearchParams({ checkIn, checkOut, adults, children });
    router.push(`/rooms?${query.toString()}`);
  }

  // Check-out can never precede check-in: the input enforces it natively.
  const minCheckOut = toDateKey(addDays(checkIn, 1));

  return (
    <form
      onSubmit={submit}
      className={`glass grid gap-3 rounded-2xl p-3 sm:grid-cols-2 ${compact ? '' : 'lg:grid-cols-[1fr_1fr_auto_auto]'}`}
    >
      <div>
        <Label htmlFor="checkIn">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3" /> Check in
          </span>
        </Label>
        <input
          id="checkIn"
          type="date"
          value={checkIn}
          min={toDateKey(new Date())}
          onChange={(e) => {
            setCheckIn(e.target.value);
            if (e.target.value >= checkOut) setCheckOut(toDateKey(addDays(e.target.value, 2)));
          }}
          className="h-11 w-full rounded-xl border border-ink-700/60 bg-ink-900/60 px-3.5 text-sm text-ink-50 focus:border-brand-400 focus:outline-none"
        />
      </div>

      <div>
        <Label htmlFor="checkOut">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3" /> Check out
          </span>
        </Label>
        <input
          id="checkOut"
          type="date"
          value={checkOut}
          min={minCheckOut}
          onChange={(e) => setCheckOut(e.target.value)}
          className="h-11 w-full rounded-xl border border-ink-700/60 bg-ink-900/60 px-3.5 text-sm text-ink-50 focus:border-brand-400 focus:outline-none"
        />
      </div>

      <div className="flex gap-2">
        <div className="min-w-24 flex-1">
          <Label htmlFor="adults">
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3" /> Adults
            </span>
          </Label>
          <select
            id="adults"
            value={adults}
            onChange={(e) => setAdults(e.target.value)}
            className="h-11 w-full rounded-xl border border-ink-700/60 bg-ink-900/60 px-3 text-sm text-ink-50 focus:border-brand-400 focus:outline-none"
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="min-w-24 flex-1">
          <Label htmlFor="children">Children</Label>
          <select
            id="children"
            value={children}
            onChange={(e) => setChildren(e.target.value)}
            className="h-11 w-full rounded-xl border border-ink-700/60 bg-ink-900/60 px-3 text-sm text-ink-50 focus:border-brand-400 focus:outline-none"
          >
            {[0, 1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-end">
        <Button type="submit" size="lg" className="w-full">
          <Search className="size-4" /> Search
        </Button>
      </div>
    </form>
  );
}
