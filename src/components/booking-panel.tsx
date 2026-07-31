'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, Lock } from 'lucide-react';

import { Button, Card, Label } from '@/components/ui';
import { addDays, toDateKey } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { PriceQuote } from '@/lib/pricing';

interface RatePlanOption {
  id: string;
  name: string;
  adjustmentPct: number;
  minNights: number;
  refundable: boolean;
}

export function BookingPanel({
  roomTypeId,
  roomName,
  baseRateCents,
  maxAdults,
  maxChildren,
  ratePlans,
  initialCheckIn,
  initialCheckOut,
  initialAdults,
  initialChildren,
}: {
  roomTypeId: string;
  roomName: string;
  baseRateCents: number;
  maxAdults: number;
  maxChildren: number;
  ratePlans: RatePlanOption[];
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialAdults?: number;
  initialChildren?: number;
}) {
  const router = useRouter();
  const [checkIn, setCheckIn] = useState(initialCheckIn ?? toDateKey(addDays(new Date(), 14)));
  const [checkOut, setCheckOut] = useState(initialCheckOut ?? toDateKey(addDays(new Date(), 17)));
  const [adults, setAdults] = useState(initialAdults || 2);
  const [children, setChildren] = useState(initialChildren || 0);
  const [ratePlanId, setRatePlanId] = useState(ratePlans[0]?.id ?? '');

  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [unitsAvailable, setUnitsAvailable] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showGuestFields, setShowGuestFields] = useState(false);

  // Re-quote whenever the stay changes. Debounced so dragging a date input
  // does not fire a request per keystroke.
  useEffect(() => {
    if (checkOut <= checkIn) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/quote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ roomTypeId, ratePlanId, checkIn, checkOut, adults, children }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Could not price that stay.');
        setQuote(data.quote);
        setUnitsAvailable(data.unitsAvailable);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [roomTypeId, ratePlanId, checkIn, checkOut, adults, children]);

  async function reserve() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roomTypeId, ratePlanId, checkIn, checkOut, adults, children,
          guestName, guestEmail,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not hold that room.');
      router.push(`/checkout/${data.reference}`);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  const soldOut = unitsAvailable === 0;
  const selectedPlan = ratePlans.find((p) => p.id === ratePlanId);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <p className="text-2xl font-semibold text-ink-50">
          {formatMoney(quote?.averageNightlyCents ?? baseRateCents)}
          <span className="text-sm font-normal text-ink-500"> / night</span>
        </p>
        {loading ? <Loader2 className="size-4 animate-spin text-ink-500" /> : null}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <Label htmlFor="bp-in">Check in</Label>
          <input
            id="bp-in" type="date" value={checkIn} min={toDateKey(new Date())}
            onChange={(e) => {
              setCheckIn(e.target.value);
              if (e.target.value >= checkOut) setCheckOut(toDateKey(addDays(e.target.value, 2)));
            }}
            className="h-11 w-full rounded-xl border border-ink-700/60 bg-ink-900/60 px-3 text-sm text-ink-50 focus:border-brand-400 focus:outline-none"
          />
        </div>
        <div>
          <Label htmlFor="bp-out">Check out</Label>
          <input
            id="bp-out" type="date" value={checkOut} min={toDateKey(addDays(checkIn, 1))}
            onChange={(e) => setCheckOut(e.target.value)}
            className="h-11 w-full rounded-xl border border-ink-700/60 bg-ink-900/60 px-3 text-sm text-ink-50 focus:border-brand-400 focus:outline-none"
          />
        </div>
        <div>
          <Label htmlFor="bp-adults">Adults</Label>
          <select
            id="bp-adults" value={adults} onChange={(e) => setAdults(Number(e.target.value))}
            className="h-11 w-full rounded-xl border border-ink-700/60 bg-ink-900/60 px-3 text-sm text-ink-50 focus:border-brand-400 focus:outline-none"
          >
            {Array.from({ length: maxAdults + 2 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}{n > maxAdults ? ' (extra charge)' : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="bp-children">Children</Label>
          <select
            id="bp-children" value={children} onChange={(e) => setChildren(Number(e.target.value))}
            className="h-11 w-full rounded-xl border border-ink-700/60 bg-ink-900/60 px-3 text-sm text-ink-50 focus:border-brand-400 focus:outline-none"
          >
            {Array.from({ length: maxChildren + 1 }, (_, i) => i).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {ratePlans.length ? (
        <div className="mt-2.5">
          <Label htmlFor="bp-plan">Rate plan</Label>
          <select
            id="bp-plan" value={ratePlanId} onChange={(e) => setRatePlanId(e.target.value)}
            className="h-11 w-full rounded-xl border border-ink-700/60 bg-ink-900/60 px-3 text-sm text-ink-50 focus:border-brand-400 focus:outline-none"
          >
            {ratePlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.adjustmentPct !== 0 ? ` (${p.adjustmentPct > 0 ? '+' : ''}${p.adjustmentPct}%)` : ''}
              </option>
            ))}
          </select>
          {selectedPlan && !selectedPlan.refundable ? (
            <p className="mt-1.5 text-xs text-amber-300">This rate is non-refundable.</p>
          ) : null}
        </div>
      ) : null}

      {quote ? (
        <dl className="mt-5 space-y-2 border-t hairline pt-4 text-sm">
          <div className="flex justify-between text-ink-300">
            <dt>{formatMoney(quote.averageNightlyCents)} × {quote.nights} nights</dt>
            <dd>{formatMoney(quote.roomSubtotalCents)}</dd>
          </div>
          {quote.extraGuestCents > 0 ? (
            <div className="flex justify-between text-ink-300">
              <dt>Extra guests</dt><dd>{formatMoney(quote.extraGuestCents)}</dd>
            </div>
          ) : null}
          {quote.lengthOfStayDiscountCents > 0 ? (
            <div className="flex justify-between text-emerald-300">
              <dt>Longer-stay discount</dt><dd>-{formatMoney(quote.lengthOfStayDiscountCents)}</dd>
            </div>
          ) : null}
          {quote.ratePlanAdjustmentCents !== 0 ? (
            <div className="flex justify-between text-emerald-300">
              <dt>Rate plan</dt>
              <dd>{quote.ratePlanAdjustmentCents < 0 ? '-' : ''}{formatMoney(Math.abs(quote.ratePlanAdjustmentCents))}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-ink-300">
            <dt>Resort &amp; service fees</dt><dd>{formatMoney(quote.feesCents)}</dd>
          </div>
          <div className="flex justify-between text-ink-300">
            <dt>Taxes</dt><dd>{formatMoney(quote.taxesCents)}</dd>
          </div>
          <div className="flex justify-between border-t hairline pt-3 text-base font-semibold text-ink-50">
            <dt>Total</dt><dd>{formatMoney(quote.totalCents)}</dd>
          </div>
        </dl>
      ) : null}

      {error ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      ) : null}

      {unitsAvailable !== null ? (
        <p className={`mt-4 text-xs ${soldOut ? 'text-red-300' : unitsAvailable <= 2 ? 'text-amber-300' : 'text-ink-500'}`}>
          {soldOut
            ? 'No rooms of this type left for those dates.'
            : `${unitsAvailable} room${unitsAvailable > 1 ? 's' : ''} of this type still free.`}
        </p>
      ) : null}

      {showGuestFields ? (
        <div className="mt-4 space-y-2.5">
          <div>
            <Label htmlFor="bp-name">Full name</Label>
            <input
              id="bp-name" value={guestName} onChange={(e) => setGuestName(e.target.value)}
              placeholder="Priya Nair" autoComplete="name"
              className="h-11 w-full rounded-xl border border-ink-700/60 bg-ink-900/60 px-3 text-sm text-ink-50 placeholder:text-ink-600 focus:border-brand-400 focus:outline-none"
            />
          </div>
          <div>
            <Label htmlFor="bp-email">Email</Label>
            <input
              id="bp-email" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email"
              className="h-11 w-full rounded-xl border border-ink-700/60 bg-ink-900/60 px-3 text-sm text-ink-50 placeholder:text-ink-600 focus:border-brand-400 focus:outline-none"
            />
          </div>
        </div>
      ) : null}

      <Button
        className="mt-4 w-full"
        size="lg"
        disabled={soldOut || loading || submitting || !quote}
        onClick={() => {
          if (!showGuestFields) return setShowGuestFields(true);
          if (guestName.trim().length < 2 || !guestEmail.includes('@')) {
            return setError('Please enter your name and a valid email.');
          }
          void reserve();
        }}
      >
        {submitting ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
        {soldOut ? 'Sold out' : showGuestFields ? 'Hold this room' : `Reserve ${roomName}`}
      </Button>

      <p className="mt-3 text-center text-xs text-ink-500">
        We hold the room for 15 minutes while you pay. No charge until you confirm.
      </p>
    </Card>
  );
}
