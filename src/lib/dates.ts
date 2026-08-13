export const MS_PER_DAY = 86_400_000;

export function toUtcDate(value: Date | string): Date {
  const d = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : value;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function toDateKey(value: Date | string): string {
  return toUtcDate(value).toISOString().slice(0, 10);
}

export function addDays(value: Date | string, days: number): Date {
  return new Date(toUtcDate(value).getTime() + days * MS_PER_DAY);
}

export function nightsBetween(checkIn: Date | string, checkOut: Date | string): number {
  return Math.round((toUtcDate(checkOut).getTime() - toUtcDate(checkIn).getTime()) / MS_PER_DAY);
}

export function eachNight(checkIn: Date | string, checkOut: Date | string): Date[] {
  const nights = nightsBetween(checkIn, checkOut);
  return Array.from({ length: Math.max(0, nights) }, (_, i) => addDays(checkIn, i));
}

export function rangesOverlap(
  aStart: Date | string,
  aEnd: Date | string,
  bStart: Date | string,
  bEnd: Date | string,
): boolean {
  return toUtcDate(aStart) < toUtcDate(bEnd) && toUtcDate(bStart) < toUtcDate(aEnd);
}

export function isWeekendNight(date: Date): boolean {
  const day = toUtcDate(date).getUTCDay();
  return day === 5 || day === 6;
}

export function isSameDay(a: Date | string, b: Date | string): boolean {
  return toUtcDate(a).getTime() === toUtcDate(b).getTime();
}

export function daysUntil(target: Date | string, from: Date = new Date()): number {
  return Math.round((toUtcDate(target).getTime() - toUtcDate(from).getTime()) / MS_PER_DAY);
}

export function formatStayRange(checkIn: Date | string, checkOut: Date | string): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `${fmt.format(toUtcDate(checkIn))} - ${fmt.format(toUtcDate(checkOut))}`;
}
