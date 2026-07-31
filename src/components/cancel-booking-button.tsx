'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui';
import { formatMoney } from '@/lib/money';

export function CancelBookingButton({ reference }: { reference: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    try {
      const response = await fetch(`/api/bookings/${reference}/cancel`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not cancel.');
      setMessage(
        `Cancelled. ${data.refund.refundCents > 0 ? `${formatMoney(data.refund.refundCents)} will be refunded.` : 'No refund is due under this rate plan.'}`,
      );
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (message) return <p className="text-sm text-ink-300">{message}</p>;

  return confirming ? (
    <div className="flex items-center gap-2">
      <span className="text-sm text-ink-400">Cancel this booking?</span>
      <Button variant="danger" size="sm" disabled={busy} onClick={() => void cancel()}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Yes, cancel
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Keep it</Button>
    </div>
  ) : (
    <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
      Cancel booking
    </Button>
  );
}
