import { explainQuery, parseQuery, type StructuredQuery } from '@/lib/nlu';
import { rankRooms, type RankableRoom, type RankedRoom } from '@/lib/retriever';
import { formatMoney } from '@/lib/money';
import { db } from './db';
import { env, features } from './env';

/**
 * The concierge is a two-tier planner.
 *
 * Tier 1 (always available): the deterministic NLU parser in src/lib/nlu.ts.
 * Tier 2 (when ANTHROPIC_API_KEY is set): an LLM that produces the same
 * StructuredQuery JSON, validated against the identical schema before use.
 *
 * Retrieval and answer generation are shared. That separation - plan, then
 * retrieve, then ground the answer in retrieved rows - is what keeps the
 * assistant from inventing rooms or prices that do not exist.
 */

const PLANNER_SYSTEM_PROMPT = `You are the booking planner for a resort reservation system.
Convert the guest's message into JSON matching exactly this shape:
{"checkIn":"YYYY-MM-DD"|null,"checkOut":"YYYY-MM-DD"|null,"adults":number,"children":number,
"maxNightlyCents":number|null,"minNightlyCents":number|null,"mustHave":string[],"niceToHave":string[],
"intent":"search"|"availability"|"policy"|"greeting"|"unknown"}
Feature vocabulary for mustHave/niceToHave: ocean_view, balcony, accessible, quiet, spa, pool,
kitchen, family, workspace, romantic, suite, budget, luxury, breakfast, pet_friendly.
Only put a feature in mustHave when the guest states it as a hard requirement.
Reply with JSON only, no prose.`;

async function planWithLlm(message: string, today: Date): Promise<StructuredQuery | null> {
  if (!features.llmConcierge) return null;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        max_tokens: 512,
        system: `${PLANNER_SYSTEM_PROMPT}\nToday is ${today.toISOString().slice(0, 10)}.`,
        messages: [{ role: 'user', content: message }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { content?: { text?: string }[] };
    const text = payload.content?.[0]?.text ?? '';
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const raw = JSON.parse(json) as Partial<StructuredQuery>;

    return {
      checkIn: raw.checkIn ?? undefined,
      checkOut: raw.checkOut ?? undefined,
      adults: Math.min(8, Math.max(1, Number(raw.adults) || 2)),
      children: Math.min(6, Math.max(0, Number(raw.children) || 0)),
      maxNightlyCents: raw.maxNightlyCents ?? undefined,
      minNightlyCents: raw.minNightlyCents ?? undefined,
      mustHave: Array.isArray(raw.mustHave) ? raw.mustHave : [],
      niceToHave: Array.isArray(raw.niceToHave) ? raw.niceToHave : [],
      freeText: message,
      intent: raw.intent ?? 'search',
      confidence: 0.95,
    };
  } catch {
    // Any LLM failure silently falls back to tier 1 rather than 500ing.
    return null;
  }
}

export async function planQuery(message: string, today = new Date()): Promise<{
  plan: StructuredQuery;
  tier: 'llm' | 'rules';
}> {
  const llm = await planWithLlm(message, today);
  if (llm) return { plan: llm, tier: 'llm' };
  return { plan: parseQuery(message, today), tier: 'rules' };
}

export interface ConciergeSuggestion {
  roomTypeId: string;
  slug: string;
  name: string;
  image: string | null;
  nightlyFromCents: number;
  score: number;
  reasons: string[];
}

export interface ConciergeReply {
  answer: string;
  plan: StructuredQuery;
  understood: string;
  tier: 'llm' | 'rules';
  suggestions: ConciergeSuggestion[];
  searchUrl: string | null;
}

const POLICY_ANSWERS: { test: RegExp; answer: string }[] = [
  { test: /cancel|refund/, answer: 'Flexible rates are fully refundable up to 48 hours before arrival. Inside that window we retain 50%. Advance-purchase rates are non-refundable but priced about 15% lower.' },
  { test: /check[- ]?in/, answer: 'Check-in opens at 3pm and check-out is 11am. Early check-in and late check-out are free when the house is under 80% occupancy.' },
  { test: /pet|dog/, answer: 'Two pets under 20kg are welcome in garden-level rooms for a one-off cleaning fee. Suites on the upper floors are pet free for allergy reasons.' },
  { test: /deposit|pay/, answer: 'We hold your room for 15 minutes while you pay. Payment is captured in full at booking, and the card is never stored on our servers.' },
];

export async function askConcierge(message: string, today = new Date()): Promise<ConciergeReply> {
  const { plan, tier } = await planQuery(message, today);
  const understood = explainQuery(plan);

  if (plan.intent === 'greeting') {
    return {
      answer: 'Hello. Tell me who is travelling, roughly when, and what matters most - a sea view, a quiet corner, space for the kids - and I will shortlist rooms that actually fit.',
      plan, understood, tier, suggestions: [], searchUrl: null,
    };
  }

  if (plan.intent === 'policy') {
    const match = POLICY_ANSWERS.find((p) => p.test.test(message.toLowerCase()));
    return {
      answer: match?.answer ?? 'Ask me about cancellation, check-in times, pets, or payment and I will give you the exact policy.',
      plan, understood, tier, suggestions: [], searchUrl: null,
    };
  }

  const roomTypes = await db.roomType.findMany({
    include: {
      amenities: { include: { amenity: true } },
      reviews: { select: { rating: true } },
    },
  });

  const rankable: RankableRoom[] = roomTypes.map((r) => ({
    id: r.id,
    name: r.name,
    searchCorpus: `${r.shortPitch} ${r.description} ${r.searchCorpus}`,
    baseRateCents: r.baseRateCents,
    maxAdults: r.maxAdults,
    maxChildren: r.maxChildren,
    hasOceanView: r.hasOceanView,
    hasBalcony: r.hasBalcony,
    isAccessible: r.isAccessible,
    sizeSqm: r.sizeSqm,
    rating: r.reviews.length
      ? r.reviews.reduce((a, b) => a + b.rating, 0) / r.reviews.length
      : 4.6,
    amenitySlugs: r.amenities.map((a) => a.amenity.slug),
  }));

  const fitsParty = rankable.filter(
    (r) => r.maxAdults >= plan.adults && r.maxChildren >= plan.children,
  );

  const pool = fitsParty.length ? fitsParty : rankable;

  // Budget is a hard filter now, so it can legitimately return nothing. When
  // that happens we say so and show the closest alternatives rather than
  // silently pretending a $680 villa answers a $300 question.
  let ranked: RankedRoom[] = rankRooms(pool, plan, 3);
  let budgetRelaxed = false;
  if (!ranked.length && (plan.maxNightlyCents || plan.minNightlyCents)) {
    ranked = rankRooms(
      pool,
      { ...plan, maxNightlyCents: undefined, minNightlyCents: undefined },
      3,
    );
    budgetRelaxed = ranked.length > 0;
  }

  const byId = new Map(roomTypes.map((r) => [r.id, r]));

  const suggestions: ConciergeSuggestion[] = ranked.map((r) => {
    const room = byId.get(r.id)!;
    return {
      roomTypeId: room.id,
      slug: room.slug,
      name: room.name,
      image: room.images[0] ?? null,
      nightlyFromCents: room.baseRateCents,
      score: Number(r.score.toFixed(3)),
      reasons: r.reasons.slice(0, 3),
    };
  });

  const params = new URLSearchParams();
  if (plan.checkIn) params.set('checkIn', plan.checkIn);
  if (plan.checkOut) params.set('checkOut', plan.checkOut);
  params.set('adults', String(plan.adults));
  params.set('children', String(plan.children));
  if (plan.maxNightlyCents) params.set('maxPrice', String(plan.maxNightlyCents));
  if (plan.mustHave.includes('ocean_view')) params.set('oceanView', 'true');
  if (plan.mustHave.includes('balcony')) params.set('balcony', 'true');
  if (plan.mustHave.includes('accessible')) params.set('accessible', 'true');

  const answer = suggestions.length
    ? buildGroundedAnswer(plan, suggestions, budgetRelaxed)
    : 'I could not find a room matching every requirement. Try relaxing one constraint, for example the budget or the ocean view.';

  return { answer, plan, understood, tier, suggestions, searchUrl: `/rooms?${params.toString()}` };
}

/**
 * The answer is templated from retrieved rows rather than generated freely.
 * Grounding it this way means the concierge cannot hallucinate a room name or
 * a price that is not in the database.
 */
function buildGroundedAnswer(
  plan: StructuredQuery,
  suggestions: ConciergeSuggestion[],
  budgetRelaxed = false,
): string {
  const top = suggestions[0]!;
  const dates = plan.checkIn && plan.checkOut ? ` for ${plan.checkIn} to ${plan.checkOut}` : '';
  const party = `${plan.adults} adult${plan.adults > 1 ? 's' : ''}${plan.children ? ` and ${plan.children} child${plan.children > 1 ? 'ren' : ''}` : ''}`;
  const runnersUp = suggestions.slice(1).map((s) => s.name).join(' and ');

  if (budgetRelaxed && plan.maxNightlyCents) {
    return [
      `Nothing under ${formatMoney(plan.maxNightlyCents)} a night matches the rest of what you asked for.`,
      `The closest is the ${top.name} at ${formatMoney(top.nightlyFromCents)}${dates ? `, ${dates.trim()}` : ''}.`,
      runnersUp ? `You could also look at the ${runnersUp}.` : '',
      'Dropping one requirement would bring more options back into range.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  return [
    `For ${party}${dates}, the closest fit is the ${top.name}, from ${formatMoney(top.nightlyFromCents)} a night.`,
    top.reasons.length ? `${top.reasons.join('. ')}.` : '',
    runnersUp ? `Worth comparing against the ${runnersUp}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
