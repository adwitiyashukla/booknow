'use client';

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

import { formatMoney } from '@/lib/money';

type FormatterResult = [string, string];

const moneyFormatter =
  (label: string) =>
  (value: unknown): FormatterResult => [formatMoney(Number(value)), label];

const occupancyFormatter = (value: unknown, name: unknown): FormatterResult =>
  name === 'occupancy'
    ? [`${(Number(value) * 100).toFixed(0)}%`, 'Occupancy']
    : [String(value), 'Rooms sold'];

const AXIS = { stroke: 'oklch(0.58 0.015 250)', fontSize: 11 };
const GRID = 'oklch(0.36 0.02 250 / 0.25)';
const BRAND = 'oklch(0.64 0.13 194)';
const SAND = 'oklch(0.74 0.09 68)';

const PALETTE = [BRAND, SAND, 'oklch(0.7 0.1 150)', 'oklch(0.68 0.11 30)', 'oklch(0.66 0.09 280)', 'oklch(0.72 0.08 220)', 'oklch(0.6 0.1 340)'];

function tooltipStyle() {
  return {
    contentStyle: {
      background: 'oklch(0.21 0.018 250)',
      border: '1px solid oklch(0.36 0.02 250 / 0.6)',
      borderRadius: 12,
      fontSize: 12,
      color: 'oklch(0.94 0.008 250)',
    },
    labelStyle: { color: 'oklch(0.78 0.012 250)' },
  };
}

const shortDate = (value: string) => value.slice(5);

export function RevenueChart({ data }: { data: { date: string; revenueCents: number; bookings: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND} stopOpacity={0.45} />
            <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickFormatter={(v) => `$${Math.round(Number(v) / 100)}`} tick={AXIS} tickLine={false} axisLine={false} width={56} />
        <Tooltip {...tooltipStyle()} formatter={moneyFormatter('Room revenue')} />
        <Area type="monotone" dataKey="revenueCents" stroke={BRAND} strokeWidth={2} fill="url(#revenueFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function OccupancyChart({ data }: { data: { date: string; occupancy: number; roomsSold: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} domain={[0, 1]} tick={AXIS} tickLine={false} axisLine={false} width={44} />
        <Tooltip {...tooltipStyle()} formatter={occupancyFormatter} />
        <Line type="monotone" dataKey="occupancy" stroke={SAND} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MixChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => `$${Math.round(Number(v) / 100)}`} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" tick={{ ...AXIS, fontSize: 10 }} tickLine={false} axisLine={false} width={110} />
        <Tooltip {...tooltipStyle()} formatter={moneyFormatter('Revenue')} cursor={{ fill: 'oklch(0.27 0.02 250 / 0.4)' }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {data.map((entry, i) => <Cell key={entry.name} fill={PALETTE[i % PALETTE.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
