export type BookingState =
  | 'HELD'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'NO_SHOW';

export const ALLOWED_TRANSITIONS: Record<BookingState, BookingState[]> = {
  HELD: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: [],
  CANCELLED: [],
  EXPIRED: [],
  NO_SHOW: [],
};

export const TERMINAL_STATES: BookingState[] = ['CHECKED_OUT', 'CANCELLED', 'EXPIRED', 'NO_SHOW'];

export const BLOCKING_STATES: BookingState[] = ['HELD', 'CONFIRMED', 'CHECKED_IN'];

export function canTransition(from: BookingState, to: BookingState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(state: BookingState): boolean {
  return TERMINAL_STATES.includes(state);
}

export function blocksInventory(state: BookingState): boolean {
  return BLOCKING_STATES.includes(state);
}

export function reachableFrom(start: BookingState): Set<BookingState> {
  const seen = new Set<BookingState>([start]);
  const queue: BookingState[] = [start];
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of ALLOWED_TRANSITIONS[current] ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

export function toMermaid(): string {
  const lines = ['stateDiagram-v2', '    [*] --> HELD'];
  for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
    for (const to of targets) lines.push(`    ${from} --> ${to}`);
  }
  for (const terminal of TERMINAL_STATES) lines.push(`    ${terminal} --> [*]`);
  return lines.join('\n');
}
