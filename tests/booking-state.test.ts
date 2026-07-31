import { describe, expect, it } from 'vitest';

import {
  ALLOWED_TRANSITIONS,
  blocksInventory,
  canTransition,
  isTerminal,
  reachableFrom,
  toMermaid,
  type BookingState,
} from '@/lib/booking-state';

const ALL = Object.keys(ALLOWED_TRANSITIONS) as BookingState[];

describe('booking state machine', () => {
  it('allows the happy path end to end', () => {
    expect(canTransition('HELD', 'CONFIRMED')).toBe(true);
    expect(canTransition('CONFIRMED', 'CHECKED_IN')).toBe(true);
    expect(canTransition('CHECKED_IN', 'CHECKED_OUT')).toBe(true);
  });

  it('forbids skipping payment', () => {
    expect(canTransition('HELD', 'CHECKED_IN')).toBe(false);
  });

  it('forbids resurrecting a terminal booking', () => {
    for (const state of ALL.filter(isTerminal)) {
      for (const target of ALL) {
        expect(canTransition(state, target), `${state} -> ${target}`).toBe(false);
      }
    }
  });

  it('has no self-loops', () => {
    for (const state of ALL) expect(canTransition(state, state)).toBe(false);
  });

  it('reaches every state from HELD, so no state is dead code', () => {
    const reachable = reachableFrom('HELD');
    for (const state of ALL) expect(reachable.has(state), `${state} unreachable`).toBe(true);
  });

  it('marks exactly the pre-checkout states as inventory blocking', () => {
    expect(ALL.filter(blocksInventory).sort()).toEqual(['CHECKED_IN', 'CONFIRMED', 'HELD']);
  });

  it('cannot cycle: every path terminates', () => {
    const visit = (state: BookingState, seen: BookingState[]): void => {
      for (const next of ALLOWED_TRANSITIONS[state]) {
        expect(seen.includes(next), `cycle via ${[...seen, next].join(' -> ')}`).toBe(false);
        visit(next, [...seen, next]);
      }
    };
    visit('HELD', ['HELD']);
  });

  it('generates a mermaid diagram covering every edge', () => {
    const diagram = toMermaid();
    const edgeCount = Object.values(ALLOWED_TRANSITIONS).flat().length;
    const arrows = diagram.split('\n').filter((l) => l.includes('-->') && !l.includes('[*]'));
    expect(arrows).toHaveLength(edgeCount);
  });
});
