import type { ComponentProps, ReactNode } from 'react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-500 text-ink-950 hover:bg-brand-400 shadow-lg shadow-brand-700/20 font-semibold',
  secondary: 'glass text-ink-100 hover:border-brand-400/60',
  ghost: 'text-ink-300 hover:text-ink-50 hover:bg-ink-800/60',
  danger: 'bg-red-500/90 text-white hover:bg-red-500',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-13 px-7 text-base',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full transition-all duration-200 disabled:opacity-45 disabled:pointer-events-none active:scale-[0.98] whitespace-nowrap';

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...props} />;
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('glass rounded-[var(--radius-card)] overflow-hidden', className)}
      {...props}
    />
  );
}

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: ComponentProps<'span'> & { tone?: 'neutral' | 'brand' | 'warn' | 'good' | 'bad' }) {
  const tones = {
    neutral: 'bg-ink-800/80 text-ink-300 border-ink-700/60',
    brand: 'bg-brand-500/15 text-brand-200 border-brand-400/30',
    warn: 'bg-amber-500/15 text-amber-200 border-amber-400/30',
    good: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
    bad: 'bg-red-500/15 text-red-200 border-red-400/30',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-xl border border-ink-700/60 bg-ink-900/60 px-3.5 text-sm text-ink-50',
        'placeholder:text-ink-500 transition-colors focus:border-brand-400 focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-11 w-full rounded-xl border border-ink-700/60 bg-ink-900/60 px-3 text-sm text-ink-50',
        'transition-colors focus:border-brand-400 focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      className={cn('mb-1.5 block text-xs font-medium uppercase tracking-wider text-ink-500', className)}
      {...props}
    />
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-brand-400">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-ink-50 sm:text-4xl">
          {title}
        </h2>
        {description ? <p className="mt-3 text-ink-300">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <p className="text-lg text-ink-100">{title}</p>
      {hint ? <p className="max-w-md text-sm text-ink-500">{hint}</p> : null}
      {action}
    </Card>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink-50">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-ink-500">{sub}</p> : null}
    </div>
  );
}
