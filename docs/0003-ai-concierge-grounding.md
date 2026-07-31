# ADR 0003: Ground the AI concierge in retrieval, and make the LLM optional

**Status:** Accepted
**Date:** 2026-07

## Context

A concierge that pipes the guest's message straight into an LLM and returns the completion will
eventually invent a room that does not exist, quote a price that is not real, or promise a policy
we do not offer. In a booking context those are not amusing errors, they are commitments.

There is a second problem specific to a portfolio project: if the app requires an API key to do
anything interesting, most people who clone it will never see the feature work.

## Decision

Split the concierge into three stages with a schema between each.

1. **Plan.** Turn the message into a `StructuredQuery`: dates, party size, budget, hard
   requirements, soft preferences, intent. Two interchangeable planners produce it:
   - a deterministic rule-based parser (`src/lib/nlu.ts`) that always runs, and
   - an LLM planner that supersedes it when `ANTHROPIC_API_KEY` is set.

   Both outputs are validated against the same shape, so nothing downstream knows or cares which
   tier produced the plan. Any LLM failure, timeout, or malformed response silently falls back to
   tier one.

2. **Retrieve.** Rank actual database rows with a TF-IDF index and cosine similarity, blended
   with soft-preference boosting and a review-score prior. Hard requirements and any stated
   price bound are applied as **filters**, not as weighted terms.

   That last point was learned the hard way. Budget was originally one more weighted signal at
   14% of the score, which let a strong feature match outvote it: asked for "a quiet ocean-view
   room under $300", the concierge led with a $680 villa because it matched "quiet". A stated
   budget is a constraint, not a preference. When the filter leaves nothing, the concierge says
   so and offers the nearest alternatives rather than quietly ignoring the number.

3. **Answer.** Template the reply from the retrieved rows.

## Consequences

**Good**

- The concierge cannot name a room or a price that is not in the database.
- It works with zero configuration, which means it works for everyone who clones the repo.
- The rule-based tier doubles as the evaluation baseline for the LLM tier.
- Retrieval is deterministic, so ranking behaviour is unit tested.

**Costs**

- The rule-based parser handles common phrasings, not everything. That is what tier two is for.
- Templated answers are less fluent than free generation. Acceptable trade for not lying to
  guests.
- TF-IDF is weaker than dense embeddings on paraphrase. Fine at this catalogue size, and the
  `embed`/`cosine` interface mirrors a vector store, so moving to pgvector is a one-file change.

## Alternatives considered

- **Function calling / tool use.** Strictly better with a key present, and roughly where tier two
  would go next. Rejected as the *only* path because it makes the key mandatory.
- **Hosted vector database.** Unjustified operational weight for a catalogue of seven room types.
