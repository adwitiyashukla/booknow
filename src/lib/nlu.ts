/**
 * Offline natural-language understanding for the concierge.
 *
 * The concierge has two tiers:
 *   1. This deterministic rule-based parser, which always runs. It costs
 *      nothing, is instant, and makes the demo work with zero API keys.
 *   2. An optional LLM planner (see src/server/ai.ts) that supersedes tier 1
 *      when ANTHROPIC_API_KEY is present.
 *
 * Tier 1 is also the evaluation baseline: every LLM output is validated
 * against the same StructuredQuery schema, so the rest of the system never
 * has to care which tier produced the plan.
 */

import { addDays, toDateKey } from './dates';

export interface StructuredQuery {
  checkIn?: string;
  checkOut?: string;
  adults: number;
  children: number;
  maxNightlyCents?: number;
  minNightlyCents?: number;
  mustHave: string[];
  niceToHave: string[];
  freeText: string;
  intent: 'search' | 'availability' | 'policy' | 'greeting' | 'unknown';
  confidence: number;
}

const MONTHS: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
  september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10,
  december: 11, dec: 11,
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  a: 1, an: 1, couple: 2, solo: 1,
};

/** Feature vocabulary with synonyms, so "sea view" and "ocean view" unify. */
export const FEATURE_LEXICON: Record<string, string[]> = {
  ocean_view: ['ocean view', 'sea view', 'seaview', 'oceanview', 'sea facing', 'ocean facing', 'water view', 'beachfront'],
  balcony: ['balcony', 'terrace', 'patio', 'veranda', 'private deck'],
  accessible: ['accessible', 'wheelchair', 'step free', 'step-free', 'mobility'],
  quiet: ['quiet', 'peaceful', 'silent', 'secluded', 'calm', 'away from noise'],
  spa: ['spa', 'massage', 'wellness', 'sauna', 'hammam'],
  pool: ['pool', 'plunge pool', 'infinity pool', 'swimming'],
  kitchen: ['kitchen', 'kitchenette', 'self catering', 'cook'],
  family: ['family', 'kids', 'children', 'child friendly', 'bunk'],
  workspace: ['work', 'desk', 'workspace', 'remote work', 'wifi', 'business'],
  romantic: ['romantic', 'honeymoon', 'anniversary', 'couples', 'proposal'],
  suite: ['suite', 'spacious', 'large', 'big', 'penthouse'],
  budget: ['cheap', 'budget', 'affordable', 'value', 'economical'],
  luxury: ['luxury', 'premium', 'best', 'finest', 'high end', 'splurge'],
  breakfast: ['breakfast', 'half board', 'meals included'],
  pet_friendly: ['pet', 'dog', 'cat friendly', 'pets allowed'],
};

function detectFeatures(text: string): string[] {
  const found: string[] = [];
  for (const [feature, synonyms] of Object.entries(FEATURE_LEXICON)) {
    if (synonyms.some((s) => text.includes(s))) found.push(feature);
  }
  return found;
}

function detectGuests(text: string): { adults: number; children: number } {
  let adults = 2;
  let children = 0;

  const adultMatch = text.match(/(\d+|one|two|three|four|five|six|seven|eight)\s*(adults?|people|guests?|persons?|pax|of us)/);
  if (adultMatch?.[1]) adults = NUMBER_WORDS[adultMatch[1]] ?? (parseInt(adultMatch[1], 10) || 2);

  const childMatch = text.match(/(\d+|one|two|three|four)\s*(kids?|children|child|toddlers?|infants?)/);
  if (childMatch?.[1]) children = NUMBER_WORDS[childMatch[1]] ?? (parseInt(childMatch[1], 10) || 0);

  if (/\b(solo|alone|just me|by myself)\b/.test(text)) adults = 1;
  if (/\b(couple|honeymoon|my partner|the two of us)\b/.test(text)) adults = 2;
  if (/\bfamily\b/.test(text) && children === 0) children = 2;

  return { adults: Math.min(8, Math.max(1, adults)), children: Math.min(6, Math.max(0, children)) };
}

function detectBudget(text: string): { max?: number; min?: number } {
  const under = text.match(/(?:under|below|less than|max|up to|budget of|no more than)\s*\$?\s*(\d{2,5})/);
  const over = text.match(/(?:over|above|at least|more than|minimum)\s*\$?\s*(\d{2,5})/);
  const between = text.match(/\$?\s*(\d{2,5})\s*(?:-|to|and)\s*\$?\s*(\d{2,5})/);

  if (between?.[1] && between[2]) {
    return { min: parseInt(between[1], 10) * 100, max: parseInt(between[2], 10) * 100 };
  }
  return {
    max: under?.[1] ? parseInt(under[1], 10) * 100 : undefined,
    min: over?.[1] ? parseInt(over[1], 10) * 100 : undefined,
  };
}

function detectDates(text: string, today: Date): { checkIn?: string; checkOut?: string } {
  const nightsMatch = text.match(/(\d+|one|two|three|four|five|six|seven|ten|fourteen)\s*(nights?|days?)/);
  const wordNights: Record<string, number> = { ...NUMBER_WORDS, ten: 10, fourteen: 14 };
  const nights = nightsMatch?.[1]
    ? (wordNights[nightsMatch[1]] ?? (parseInt(nightsMatch[1], 10) || 3))
    : undefined;

  // Explicit ISO dates win.
  const isoDates = text.match(/\d{4}-\d{2}-\d{2}/g);
  if (isoDates && isoDates.length >= 2 && isoDates[0] && isoDates[1]) {
    return { checkIn: isoDates[0], checkOut: isoDates[1] };
  }
  if (isoDates?.[0]) {
    return { checkIn: isoDates[0], checkOut: toDateKey(addDays(isoDates[0], nights ?? 3)) };
  }

  // Relative language.
  let start: Date | undefined;
  if (/\btonight\b|\btoday\b/.test(text)) start = today;
  else if (/\btomorrow\b/.test(text)) start = addDays(today, 1);
  else if (/\bthis weekend\b/.test(text)) {
    const dow = today.getUTCDay();
    start = addDays(today, (5 - dow + 7) % 7);
  } else if (/\bnext weekend\b/.test(text)) {
    const dow = today.getUTCDay();
    start = addDays(today, ((5 - dow + 7) % 7) + 7);
  } else if (/\bnext week\b/.test(text)) start = addDays(today, 7);
  else if (/\bnext month\b/.test(text)) start = addDays(today, 30);

  // Month names, optionally with a day.
  if (!start) {
    for (const [name, index] of Object.entries(MONTHS)) {
      const re = new RegExp(`\\b${name}\\b(?:\\s+(\\d{1,2}))?`);
      const m = text.match(re);
      if (m) {
        const day = m[1] ? parseInt(m[1], 10) : 12;
        let year = today.getUTCFullYear();
        const candidate = new Date(Date.UTC(year, index, day));
        if (candidate < today) year += 1;
        start = new Date(Date.UTC(year, index, day));
        break;
      }
    }
  }

  if (!start && nights === undefined) return {};
  const checkIn = start ?? addDays(today, 21);
  const stayNights = nights ?? (/\bweekend\b/.test(text) ? 2 : 3);
  return { checkIn: toDateKey(checkIn), checkOut: toDateKey(addDays(checkIn, stayNights)) };
}

function detectIntent(text: string): StructuredQuery['intent'] {
  if (/^\s*(hi|hello|hey|good (morning|evening|afternoon))\b/.test(text)) return 'greeting';
  if (/\b(cancel|refund|policy|check[- ]?in time|check[- ]?out time|pet policy|deposit)\b/.test(text)) return 'policy';
  if (/\b(available|availability|free|vacan|any rooms)\b/.test(text)) return 'availability';
  if (/\b(room|suite|stay|book|reserve|villa|looking for|need|want|find|show)\b/.test(text)) return 'search';
  return 'unknown';
}

export function parseQuery(input: string, today: Date = new Date()): StructuredQuery {
  const text = input.toLowerCase().trim();
  const features = detectFeatures(text);
  const guests = detectGuests(text);
  const budget = detectBudget(text);
  const dates = detectDates(text, today);
  const intent = detectIntent(text);

  // "must have" is anything stated with a hard requirement verb; everything
  // else becomes a soft preference used only for ranking.
  const hardMarkers = /\b(must|need|require|has to|essential|only|non-negotiable)\b/;
  const isHard = hardMarkers.test(text);
  const mustHave = isHard ? features : features.filter((f) => ['accessible', 'ocean_view', 'balcony'].includes(f));
  const niceToHave = features.filter((f) => !mustHave.includes(f));

  const signals = [
    features.length > 0,
    !!dates.checkIn,
    budget.max !== undefined || budget.min !== undefined,
    intent !== 'unknown',
  ].filter(Boolean).length;

  return {
    ...dates,
    adults: guests.adults,
    children: guests.children,
    maxNightlyCents: budget.max,
    minNightlyCents: budget.min,
    mustHave,
    niceToHave,
    freeText: input.trim(),
    intent,
    confidence: Math.min(1, 0.25 + signals * 0.19),
  };
}

/** Human-readable summary of what the concierge understood. */
export function explainQuery(q: StructuredQuery): string {
  const parts: string[] = [];
  parts.push(`${q.adults} adult${q.adults > 1 ? 's' : ''}${q.children ? ` and ${q.children} child${q.children > 1 ? 'ren' : ''}` : ''}`);
  if (q.checkIn && q.checkOut) parts.push(`${q.checkIn} to ${q.checkOut}`);
  if (q.maxNightlyCents) parts.push(`under $${Math.round(q.maxNightlyCents / 100)} per night`);
  const feats = [...q.mustHave, ...q.niceToHave].map((f) => f.replace(/_/g, ' '));
  if (feats.length) parts.push(feats.join(', '));
  return parts.join(' | ');
}
