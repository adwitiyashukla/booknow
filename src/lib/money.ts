export const TAX_RATE = 0.12;
export const RESORT_FEE_CENTS_PER_NIGHT = 3500;
export const SERVICE_FEE_RATE = 0.05;

export function formatMoney(cents: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function applyRate(cents: number, rate: number): number {
  return Math.round(cents * rate);
}

export function percentOf(cents: number, pct: number): number {
  return Math.round((cents * pct) / 100);
}

export function sumCents(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
