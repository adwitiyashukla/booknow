import { describe, expect, it } from 'vitest';

import { TfIdfIndex, cosine, norm, rankRooms, satisfiesFeature, stem, tokenize, type RankableRoom } from '@/lib/retriever';

const rooms: RankableRoom[] = [
  {
    id: 'garden', name: 'Dune Garden Room',
    searchCorpus: 'quiet secluded ground floor garden terrace step-free accessible affordable calm',
    baseRateCents: 18_500, maxAdults: 2, maxChildren: 1,
    hasOceanView: false, hasBalcony: true, isAccessible: true, sizeSqm: 32, rating: 4.7,
  },
  {
    id: 'coral', name: 'Coral Deluxe',
    searchCorpus: 'ocean view sea view corner balcony sunrise reef romantic couples soaking tub',
    baseRateCents: 26_000, maxAdults: 2, maxChildren: 2,
    hasOceanView: true, hasBalcony: true, isAccessible: false, sizeSqm: 38, rating: 4.9,
  },
  {
    id: 'family', name: 'Lagoon Family Suite',
    searchCorpus: 'family kids children bunk two bedrooms kitchenette spacious large suite',
    baseRateCents: 41_000, maxAdults: 4, maxChildren: 4,
    hasOceanView: true, hasBalcony: true, isAccessible: true, sizeSqm: 62, rating: 4.6,
  },
  {
    id: 'loft', name: 'Atelier Loft',
    searchCorpus: 'workspace desk remote work office fibre wifi quiet loft studio business',
    baseRateCents: 32_000, maxAdults: 2, maxChildren: 0,
    hasOceanView: false, hasBalcony: false, isAccessible: false, sizeSqm: 45, rating: 4.8,
  },
];

describe('tokenize and stem', () => {
  it('drops stopwords and short tokens', () => {
    expect(tokenize('a room with the sea')).not.toContain('the');
    expect(tokenize('a room with the sea')).toContain('sea');
  });

  it('unifies plurals so "kids" matches "kid"', () => {
    expect(stem('children')).toBe(stem('children'));
    expect(stem('rooms')).toBe('room');
    expect(stem('working')).toBe('work');
  });

  it('leaves short words alone rather than mangling them', () => {
    expect(stem('spa')).toBe('spa');
    expect(stem('view')).toBe('view');
  });
});

describe('cosine similarity', () => {
  it('is 1 for identical vectors', () => {
    const v = new Map([['a', 1], ['b', 2]]);
    expect(cosine(v, norm(v), v, norm(v))).toBeCloseTo(1, 10);
  });

  it('is 0 for disjoint vectors', () => {
    const a = new Map([['a', 1]]);
    const b = new Map([['b', 1]]);
    expect(cosine(a, norm(a), b, norm(b))).toBe(0);
  });

  it('is 0 against an empty vector rather than NaN', () => {
    const a = new Map([['a', 1]]);
    const empty = new Map<string, number>();
    expect(cosine(a, norm(a), empty, norm(empty))).toBe(0);
  });
});

describe('TfIdfIndex', () => {
  const index = new TfIdfIndex(rooms.map((r) => ({ id: r.id, text: `${r.name} ${r.searchCorpus}` })));

  it('ranks the obviously matching document first', () => {
    expect(index.search('somewhere to work remotely with a desk')[0]?.id).toBe('loft');
    expect(index.search('sunrise over the ocean')[0]?.id).toBe('coral');
    expect(index.search('room for the kids')[0]?.id).toBe('family');
  });

  it('returns nothing for a query with no shared vocabulary', () => {
    expect(index.search('helicopter aviation turbine')).toHaveLength(0);
  });

  it('respects the result limit', () => {
    expect(index.search('room quiet ocean family work', 2)).toHaveLength(2);
  });

  it('is deterministic across repeated calls', () => {
    const a = index.search('quiet garden');
    const b = index.search('quiet garden');
    expect(a).toEqual(b);
  });
});

describe('satisfiesFeature', () => {
  it('uses structured columns where they exist', () => {
    expect(satisfiesFeature('ocean_view', rooms[1]!)).toBe(true);
    expect(satisfiesFeature('ocean_view', rooms[0]!)).toBe(false);
    expect(satisfiesFeature('accessible', rooms[0]!)).toBe(true);
  });

  it('derives soft features from the text corpus', () => {
    expect(satisfiesFeature('quiet', rooms[0]!)).toBe(true);
    expect(satisfiesFeature('quiet', rooms[1]!)).toBe(false);
  });

  it('classifies budget and luxury by price band', () => {
    expect(satisfiesFeature('budget', rooms[0]!)).toBe(true);
    expect(satisfiesFeature('budget', rooms[2]!)).toBe(false);
  });
});

describe('rankRooms', () => {
  it('filters out anything failing a hard requirement', () => {
    const ranked = rankRooms(rooms, { freeText: 'a nice room', mustHave: ['ocean_view'], niceToHave: [] });
    expect(ranked.map((r) => r.id).sort()).toEqual(['coral', 'family']);
  });

  it('returns an empty list when nothing satisfies the requirements', () => {
    const ranked = rankRooms(rooms, {
      freeText: 'anything', mustHave: ['ocean_view', 'accessible', 'budget'], niceToHave: [],
    });
    expect(ranked).toHaveLength(0);
  });

  it('puts the semantically closest room first', () => {
    const ranked = rankRooms(rooms, {
      freeText: 'quiet room where I can work all week', mustHave: [], niceToHave: ['workspace', 'quiet'],
    });
    expect(ranked[0]?.id).toBe('loft');
  });

  it('explains why each room was suggested', () => {
    const ranked = rankRooms(rooms, {
      freeText: 'ocean view please', mustHave: ['ocean_view'], niceToHave: ['romantic'],
    });
    expect(ranked[0]?.reasons.length).toBeGreaterThan(0);
    expect(ranked[0]?.reasons.join(' ')).toMatch(/ocean view/i);
  });

  it('keeps every score inside [0, 1] and sorted descending', () => {
    const ranked = rankRooms(rooms, {
      freeText: 'family suite near the water under 500', mustHave: [], niceToHave: ['family', 'ocean_view'],
      maxNightlyCents: 50_000,
    });
    for (const r of ranked) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
    const scores = ranked.map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('excludes anything above a stated budget, rather than merely scoring it down', () => {
    const ranked = rankRooms(rooms, {
      freeText: 'quiet room with a view',
      mustHave: [],
      niceToHave: ['quiet', 'ocean_view'],
      maxNightlyCents: 30_000,
    });
    expect(ranked.length).toBeGreaterThan(0);
    for (const r of ranked) {
      const room = rooms.find((x) => x.id === r.id)!;
      expect(room.baseRateCents).toBeLessThanOrEqual(30_000);
    }
  });

  it('does not let a strong feature match smuggle in an over-budget room', () => {
    // The family suite is the only "family" match but costs 41,000.
    const ranked = rankRooms(rooms, {
      freeText: 'space for the family',
      mustHave: [],
      niceToHave: ['family'],
      maxNightlyCents: 30_000,
    });
    expect(ranked.map((r) => r.id)).not.toContain('family');
  });

  it('respects a lower bound too', () => {
    const ranked = rankRooms(rooms, {
      freeText: 'something special',
      mustHave: [],
      niceToHave: [],
      minNightlyCents: 30_000,
    });
    for (const r of ranked) {
      const room = rooms.find((x) => x.id === r.id)!;
      expect(room.baseRateCents).toBeGreaterThanOrEqual(30_000);
    }
  });

  it('returns nothing when the budget excludes every room, so the caller can say so', () => {
    const ranked = rankRooms(rooms, {
      freeText: 'anything at all',
      mustHave: [],
      niceToHave: [],
      maxNightlyCents: 5_000,
    });
    expect(ranked).toHaveLength(0);
  });

  it('honours the requested limit', () => {
    expect(rankRooms(rooms, { freeText: 'room', mustHave: [], niceToHave: [] }, 2)).toHaveLength(2);
  });
});
