import { describe, expect, it } from 'vitest';

import { explainQuery, parseQuery } from '@/lib/nlu';

const TODAY = new Date('2026-08-03T00:00:00.000Z'); // a Monday

describe('parseQuery: guests', () => {
  it('defaults to two adults', () => {
    expect(parseQuery('somewhere by the sea', TODAY).adults).toBe(2);
  });

  it('reads a digit party size', () => {
    expect(parseQuery('a room for 4 adults', TODAY).adults).toBe(4);
  });

  it('reads a spelled-out party size', () => {
    expect(parseQuery('space for three people', TODAY).adults).toBe(3);
  });

  it('understands solo travel', () => {
    expect(parseQuery('just me, travelling solo', TODAY).adults).toBe(1);
  });

  it('separates children from adults', () => {
    const q = parseQuery('2 adults and 2 kids', TODAY);
    expect(q.adults).toBe(2);
    expect(q.children).toBe(2);
  });

  it('infers children from the word family', () => {
    expect(parseQuery('a family trip in October', TODAY).children).toBeGreaterThan(0);
  });

  it('clamps absurd party sizes', () => {
    expect(parseQuery('room for 99 people', TODAY).adults).toBeLessThanOrEqual(8);
  });
});

describe('parseQuery: dates', () => {
  it('resolves "this weekend" to the coming Friday', () => {
    const q = parseQuery('anything free this weekend', TODAY);
    expect(q.checkIn).toBe('2026-08-07');
    expect(q.checkOut).toBe('2026-08-09');
  });

  it('resolves "tomorrow" plus a night count', () => {
    const q = parseQuery('tomorrow for 4 nights', TODAY);
    expect(q.checkIn).toBe('2026-08-04');
    expect(q.checkOut).toBe('2026-08-08');
  });

  it('reads explicit ISO dates', () => {
    const q = parseQuery('2026-12-20 to 2026-12-27 please', TODAY);
    expect(q.checkIn).toBe('2026-12-20');
    expect(q.checkOut).toBe('2026-12-27');
  });

  it('rolls a past month name forward to next year', () => {
    const q = parseQuery('something in march', TODAY);
    expect(q.checkIn?.startsWith('2027-03')).toBe(true);
  });

  it('keeps a future month in the current year', () => {
    const q = parseQuery('a week in november', TODAY);
    expect(q.checkIn?.startsWith('2026-11')).toBe(true);
  });

  it('leaves dates undefined when the guest gives none', () => {
    expect(parseQuery('do you have a spa', TODAY).checkIn).toBeUndefined();
  });

  it('always produces a check-out strictly after check-in', () => {
    for (const phrase of ['this weekend', 'tomorrow for 1 night', 'next month', 'in july', '5 nights']) {
      const q = parseQuery(phrase, TODAY);
      if (q.checkIn && q.checkOut) expect(q.checkOut > q.checkIn).toBe(true);
    }
  });
});

describe('parseQuery: budget', () => {
  it('reads an upper bound in cents', () => {
    expect(parseQuery('under $250 a night', TODAY).maxNightlyCents).toBe(25_000);
  });

  it('reads a range', () => {
    const q = parseQuery('between $150 and $300', TODAY);
    expect(q.minNightlyCents).toBe(15_000);
    expect(q.maxNightlyCents).toBe(30_000);
  });

  it('handles "no more than"', () => {
    expect(parseQuery('no more than 400 per night', TODAY).maxNightlyCents).toBe(40_000);
  });
});

describe('parseQuery: features', () => {
  it('unifies sea view and ocean view', () => {
    expect(parseQuery('a sea view room', TODAY).mustHave).toContain('ocean_view');
    expect(parseQuery('an oceanview room', TODAY).mustHave).toContain('ocean_view');
  });

  it('treats soft preferences as nice to have', () => {
    const q = parseQuery('somewhere quiet with a spa would be lovely', TODAY);
    expect(q.niceToHave).toContain('quiet');
    expect(q.mustHave).not.toContain('quiet');
  });

  it('promotes preferences to hard requirements on explicit wording', () => {
    const q = parseQuery('I need a quiet room, it is essential', TODAY);
    expect(q.mustHave).toContain('quiet');
  });

  it('always treats accessibility as a hard requirement', () => {
    expect(parseQuery('a wheelchair friendly room', TODAY).mustHave).toContain('accessible');
  });
});

describe('parseQuery: intent', () => {
  it.each([
    ['hello there', 'greeting'],
    ['what is your cancellation policy', 'policy'],
    ['any rooms available in may', 'availability'],
    ['I want a suite with a balcony', 'search'],
  ])('classifies %s as %s', (input, expected) => {
    expect(parseQuery(input, TODAY).intent).toBe(expected);
  });
});

describe('parseQuery: confidence and explanation', () => {
  it('scores a detailed request above a vague one', () => {
    const rich = parseQuery('sea view room for 2 under $300 next weekend', TODAY);
    const vague = parseQuery('hmm', TODAY);
    expect(rich.confidence).toBeGreaterThan(vague.confidence);
    expect(rich.confidence).toBeLessThanOrEqual(1);
  });

  it('explains what it understood in plain language', () => {
    const q = parseQuery('balcony room for 2 adults and 1 kid under $300', TODAY);
    const text = explainQuery(q);
    expect(text).toContain('2 adults');
    expect(text).toContain('1 child');
    expect(text).toContain('$300');
  });

  it('never throws on hostile input', () => {
    for (const input of ['', '   ', '?????', '💥💥', 'a'.repeat(500), '<script>alert(1)</script>']) {
      expect(() => parseQuery(input, TODAY)).not.toThrow();
    }
  });
});
