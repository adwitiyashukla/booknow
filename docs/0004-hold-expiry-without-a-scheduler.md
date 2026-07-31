# ADR 0004: Expire holds in the query, not on a schedule

**Status:** Accepted
**Date:** 2026-07

## Context

A guest who reaches checkout gets the room held for 15 minutes. Most of them pay. Some close the
tab, and that hold has to be released or the room is unsellable until something notices.

The obvious implementation is a scheduled job: sweep every few minutes, flip lapsed `HELD` rows
to `EXPIRED`, done. That is what this project did first, with a five-minute cron.

Deploying it exposed the flaw. Vercel's free plan runs cron jobs **once per day**. A hold that
lapsed at 09:01 would keep blocking the room until the sweep ran the following morning. The
instinct was to find a host with a faster scheduler. The better question was why correctness
depended on a scheduler at all.

It does not only matter on a free plan. Schedulers are late, get throttled, silently fail, and
skip runs during deploys. Any design where inventory is wrong between ticks is a design with a
window of wrongness proportional to someone else's reliability.

## Decision

A hold's expiry is evaluated **at read time, inside the availability query**:

```ts
export function blockingWhere(now = new Date()): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
      { status: 'HELD', holdExpiresAt: { gt: now } },
      { status: 'HELD', holdExpiresAt: null },
    ],
  };
}
```

The same predicate is used by search, the room calendar, the admin inventory view, and the
re-check inside the booking transaction, so every path agrees. The pure layer in
`src/lib/availability.ts` mirrors it with `consumesInventory()`, which is what the unit tests
exercise.

The cron endpoint stays, but its job description changed. It no longer releases inventory; it
tidies the `status` column so the booking ledger and the audit trail read correctly. Running it
once a day is entirely adequate for that.

## Consequences

**Good**

- A lapsed hold stops blocking the room at the exact second it lapses, on any host, on any plan.
- Correctness no longer depends on an external scheduler being punctual.
- The free tier stopped being a compromise, which is the sign the design got better rather than
  merely cheaper.
- The rule is expressed once and shared, so the guest-facing search and the transactional
  re-check can never disagree about what "available" means.

**Costs**

- Every availability query carries a slightly larger `WHERE` clause. Immaterial next to the
  index on `(roomTypeId, checkIn, checkOut)`.
- `status` is now eventually consistent with reality: a row can read `HELD` while the booking is
  effectively expired. Anything that cares about truth asks the predicate, not the column. This
  is worth stating plainly because it is a real trade, not a free win.
- Time is now an input to availability, so tests must inject `now` rather than rely on the
  system clock. That is a discipline, not a defect.

## Alternatives considered

- **A faster cron.** Treats the symptom. The window shrinks but never closes, and it makes the
  hosting plan a correctness dependency.
- **A database TTL or scheduled job inside Postgres.** Ties the rule to one engine and moves it
  out of the code where the tests live.
- **Expiring lazily on write only.** Would fix the booking transaction but leave search showing
  rooms as unavailable when they are not, which is the more visible failure.
