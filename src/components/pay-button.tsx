'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui';
import { formatMoney } from '@/lib/money';

export function PayButton({ reference, amountCents }: { reference: string; amountCents: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not start checkout.');

      // Stripe returns an absolute URL; the simulated provider returns a
      // relative one that stays inside the app.
      if (data.url.startsWith('http')) window.location.href = data.url;
      else router.push(data.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <Button size="lg" className="w-full" disabled={busy} onClick={() => void pay()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
        Pay {formatMoney(amountCents)}
      </Button>
      {error ? <p className="mt-3 text-center text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
