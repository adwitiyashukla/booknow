'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { Label, Select } from '@/components/ui';

const TOGGLES = [
  { key: 'oceanView', label: 'Ocean view' },
  { key: 'balcony', label: 'Balcony or terrace' },
  { key: 'accessible', label: 'Step-free access' },
] as const;

const PRICE_BANDS = [
  { label: 'Any price', min: '', max: '' },
  { label: 'Under $200', min: '', max: '20000' },
  { label: '$200 to $400', min: '20000', max: '40000' },
  { label: '$400 to $700', min: '40000', max: '70000' },
  { label: '$700 and up', min: '70000', max: '' },
];

export function RoomFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    startTransition(() => router.push(`/rooms?${next.toString()}`, { scroll: false }));
  }

  const activeBand =
    PRICE_BANDS.findIndex(
      (b) => b.min === (params.get('minPrice') ?? '') && b.max === (params.get('maxPrice') ?? ''),
    ) ?? 0;

  return (
    <div className={pending ? 'space-y-5 opacity-60 transition-opacity' : 'space-y-5'}>
      <fieldset className="space-y-2.5">
        <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-500">
          Must have
        </legend>
        {TOGGLES.map((t) => (
          <label key={t.key} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-200">
            <input
              type="checkbox"
              checked={params.get(t.key) === 'true'}
              onChange={(e) =>
                update((next) => {
                  if (e.target.checked) next.set(t.key, 'true');
                  else next.delete(t.key);
                })
              }
              className="size-4 rounded border-ink-600 bg-ink-900 accent-[var(--color-brand-500)]"
            />
            {t.label}
          </label>
        ))}
      </fieldset>

      <div>
        <Label htmlFor="price">Nightly price</Label>
        <Select
          id="price"
          value={Math.max(0, activeBand)}
          onChange={(e) =>
            update((next) => {
              const band = PRICE_BANDS[Number(e.target.value)]!;
              if (band.min) next.set('minPrice', band.min);
              else next.delete('minPrice');
              if (band.max) next.set('maxPrice', band.max);
              else next.delete('maxPrice');
            })
          }
        >
          {PRICE_BANDS.map((b, i) => <option key={b.label} value={i}>{b.label}</option>)}
        </Select>
      </div>

      <div>
        <Label htmlFor="sort">Sort by</Label>
        <Select
          id="sort"
          value={params.get('sort') ?? 'recommended'}
          onChange={(e) => update((next) => next.set('sort', e.target.value))}
        >
          <option value="recommended">Recommended</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
          <option value="size-desc">Largest first</option>
          <option value="rating-desc">Best rated</option>
        </Select>
      </div>

      <button
        onClick={() => {
          const next = new URLSearchParams();
          for (const key of ['checkIn', 'checkOut', 'adults', 'children']) {
            const v = params.get(key);
            if (v) next.set(key, v);
          }
          startTransition(() => router.push(`/rooms?${next.toString()}`, { scroll: false }));
        }}
        className="text-xs text-ink-500 underline-offset-4 hover:text-ink-200 hover:underline"
      >
        Clear filters
      </button>
    </div>
  );
}
