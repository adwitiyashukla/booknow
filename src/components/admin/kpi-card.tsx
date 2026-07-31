import type { LucideIcon } from 'lucide-react';

import { Card } from '@/components/ui';

export function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-ink-500">{label}</p>
        <Icon className="size-4 text-brand-400" />
      </div>
      <p className="text-2xl font-semibold text-ink-50">{value}</p>
      {sub ? <p className="mt-1 text-xs text-ink-500">{sub}</p> : null}
    </Card>
  );
}
