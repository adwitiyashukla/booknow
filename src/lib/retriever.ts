/**
 * Semantic room retrieval.
 *
 * A hosted vector database would be overkill for a catalogue of this size, so
 * the retriever builds a TF-IDF index in memory and ranks by cosine
 * similarity. It runs in single-digit milliseconds, needs no API key, and is
 * fully deterministic - which means the ranking can be unit tested.
 *
 * The `embed`/`cosine` pair is intentionally the same interface a real vector
 * store exposes, so swapping in pgvector later is a one-file change.
 */

const STOPWORDS = new Set([
  'a','an','the','and','or','but','for','with','without','in','on','at','to','of','is','are','be',
  'i','we','my','our','me','us','you','your','it','that','this','was','were','from','by','as','if',
  'want','need','looking','like','would','please','room','rooms','stay','book','booking','have','has',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .map(stem);
}

/** Tiny Porter-flavoured stemmer: enough to unify plurals and gerunds. */
export function stem(word: string): string {
  if (word.length <= 4) return word;
  for (const suffix of ['ing', 'ies', 'ied', 'ies', 'es', 's', 'ed', 'ly']) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, word.length - suffix.length);
    }
  }
  return word;
}

export interface IndexedDoc {
  id: string;
  vector: Map<string, number>;
  norm: number;
}

export class TfIdfIndex {
  private docs: IndexedDoc[] = [];
  private idf = new Map<string, number>();
  private corpusSize = 0;

  constructor(documents: { id: string; text: string }[] = []) {
    if (documents.length) this.build(documents);
  }

  build(documents: { id: string; text: string }[]): this {
    this.corpusSize = documents.length;
    const df = new Map<string, number>();
    const tokenised = documents.map((d) => ({ id: d.id, tokens: tokenize(d.text) }));

    for (const doc of tokenised) {
      for (const term of new Set(doc.tokens)) df.set(term, (df.get(term) ?? 0) + 1);
    }
    this.idf = new Map(
      [...df.entries()].map(([term, count]) => [
        term,
        Math.log((this.corpusSize + 1) / (count + 1)) + 1,
      ]),
    );

    this.docs = tokenised.map((doc) => {
      const vector = this.vectorise(doc.tokens);
      return { id: doc.id, vector, norm: norm(vector) };
    });
    return this;
  }

  private vectorise(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const vector = new Map<string, number>();
    for (const [term, count] of tf) {
      const weight = (count / tokens.length) * (this.idf.get(term) ?? Math.log(this.corpusSize + 1) + 1);
      vector.set(term, weight);
    }
    return vector;
  }

  /** Same shape as a hosted embedding call, minus the network round trip. */
  embed(text: string): Map<string, number> {
    return this.vectorise(tokenize(text));
  }

  search(query: string, limit = 10): { id: string; score: number }[] {
    const qv = this.embed(query);
    const qn = norm(qv);
    if (qn === 0) return [];
    return this.docs
      .map((doc) => ({ id: doc.id, score: cosine(qv, qn, doc.vector, doc.norm) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

export function norm(vector: Map<string, number>): number {
  let sum = 0;
  for (const v of vector.values()) sum += v * v;
  return Math.sqrt(sum);
}

export function cosine(
  a: Map<string, number>,
  aNorm: number,
  b: Map<string, number>,
  bNorm: number,
): number {
  if (aNorm === 0 || bNorm === 0) return 0;
  // Iterate the smaller vector for the dot product.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, weight] of small) {
    const other = large.get(term);
    if (other) dot += weight * other;
  }
  return dot / (aNorm * bNorm);
}

export interface RankableRoom {
  id: string;
  name: string;
  searchCorpus: string;
  baseRateCents: number;
  maxAdults: number;
  maxChildren: number;
  hasOceanView: boolean;
  hasBalcony: boolean;
  isAccessible: boolean;
  sizeSqm: number;
  rating?: number;
  amenitySlugs?: string[];
}

export interface RankedRoom {
  id: string;
  score: number;
  semanticScore: number;
  featureScore: number;
  reasons: string[];
}

const FEATURE_PREDICATES: Record<string, (r: RankableRoom) => boolean> = {
  ocean_view: (r) => r.hasOceanView,
  balcony: (r) => r.hasBalcony,
  accessible: (r) => r.isAccessible,
  suite: (r) => r.sizeSqm >= 45,
  family: (r) => r.maxAdults + r.maxChildren >= 4,
  budget: (r) => r.baseRateCents <= 25_000,
  luxury: (r) => r.baseRateCents >= 55_000,
  quiet: (r) => /quiet|secluded|private|tranquil/i.test(r.searchCorpus),
  spa: (r) => /spa|sauna|hammam|massage/i.test(r.searchCorpus),
  pool: (r) => /pool/i.test(r.searchCorpus),
  kitchen: (r) => /kitchen|kitchenette/i.test(r.searchCorpus),
  workspace: (r) => /desk|workspace|office/i.test(r.searchCorpus),
  romantic: (r) => /romantic|honeymoon|couple/i.test(r.searchCorpus),
  breakfast: (r) => /breakfast/i.test(r.searchCorpus),
  pet_friendly: (r) => /pet|dog friendly/i.test(r.searchCorpus),
};

export function satisfiesFeature(feature: string, room: RankableRoom): boolean {
  const predicate = FEATURE_PREDICATES[feature];
  if (predicate) return predicate(room);
  return new RegExp(feature.replace(/_/g, '[ -]?'), 'i').test(room.searchCorpus);
}

/**
 * Hybrid ranking: semantic similarity blended with explicit feature matching,
 * plus a small quality prior.
 *
 * A stated budget is a constraint, not a preference. Scoring it as one more
 * weighted signal lets a strong feature match outvote it, which is how you end
 * up recommending a $680 villa to someone who asked for something under $300.
 * So price bounds filter alongside the hard requirements, and the caller
 * decides what to do when that leaves nothing.
 */
export function rankRooms(
  rooms: RankableRoom[],
  query: {
    freeText: string;
    mustHave: string[];
    niceToHave: string[];
    maxNightlyCents?: number;
    minNightlyCents?: number;
  },
  limit = 8,
): RankedRoom[] {
  const index = new TfIdfIndex(
    rooms.map((r) => ({ id: r.id, text: `${r.name} ${r.searchCorpus} ${(r.amenitySlugs ?? []).join(' ')}` })),
  );
  const semantic = new Map(index.search(query.freeText, rooms.length).map((r) => [r.id, r.score]));
  const topSemantic = Math.max(0.0001, ...semantic.values());

  return rooms
    .filter((room) => query.mustHave.every((f) => satisfiesFeature(f, room)))
    .filter((room) => {
      if (query.maxNightlyCents && room.baseRateCents > query.maxNightlyCents) return false;
      if (query.minNightlyCents && room.baseRateCents < query.minNightlyCents) return false;
      return true;
    })
    .map((room) => {
      const reasons: string[] = [];
      const semanticScore = (semantic.get(room.id) ?? 0) / topSemantic;

      let matched = 0;
      const soft = query.niceToHave;
      for (const f of soft) {
        if (satisfiesFeature(f, room)) {
          matched += 1;
          reasons.push(`Matches "${f.replace(/_/g, ' ')}"`);
        }
      }
      for (const f of query.mustHave) reasons.push(`Required: ${f.replace(/_/g, ' ')}`);

      const featureScore = soft.length ? matched / soft.length : 0;
      if (query.maxNightlyCents) reasons.push('Within your nightly budget');

      const qualityPrior = Math.min(1, Math.max(0, (room.rating ?? 4.5) - 4)); // 0..1 over 4.0-5.0

      // Budget no longer scores, because everything reaching here already
      // satisfies it. Its weight is redistributed to the remaining signals.
      const score = 0.5 * semanticScore + 0.35 * featureScore + 0.15 * qualityPrior;

      return { id: room.id, score, semanticScore, featureScore, reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
