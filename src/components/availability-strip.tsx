'use client';

import { useState } from 'react';

interface Day {
  date: string;
  remaining: number;
  occupancy: number;
}

export function AvailabilityStrip({ days, unitsTotal }: { days: Day[]; unitsTotal: number }) {
  const [hovered, setHovered] = useState<Day | null>(null);

  const colourFor = (day: Day) => {
    if (day.remaining === 0) return 'bg-red-500/70';
    if (day.occupancy >= 0.8) return 'bg-amber-500/70';
    if (day.occupancy >= 0.5) return 'bg-brand-500/60';
    return 'bg-brand-400/30';
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1" onMouseLeave={() => setHovered(null)}>
        {days.map((day) => (
          <button
            key={day.date}
            type="button"
            onMouseEnter={() => setHovered(day)}
            onFocus={() => setHovered(day)}
            aria-label={`${day.date}: ${day.remaining} of ${unitsTotal} rooms free`}
            className={`h-9 w-[calc((100%-2.75rem)/12)] min-w-4 rounded-sm transition-transform hover:scale-110 ${colourFor(day)}`}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-500">
        <p className="min-h-4">
          {hovered
            ? `${hovered.date}, ${hovered.remaining} of ${unitsTotal} free, ${Math.round(hovered.occupancy * 100)}% sold`
            : 'Hover a night to see remaining inventory.'}
        </p>
        <ul className="flex items-center gap-3">
          {[
            ['bg-brand-400/30', 'Open'],
            ['bg-brand-500/60', 'Filling'],
            ['bg-amber-500/70', 'Nearly full'],
            ['bg-red-500/70', 'Sold out'],
          ].map(([cls, label]) => (
            <li key={label} className="flex items-center gap-1.5">
              <span className={`size-2.5 rounded-sm ${cls}`} /> {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
