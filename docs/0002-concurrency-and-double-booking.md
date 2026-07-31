# ADR 0002: Prevent double booking with Serializable transactions

**Status:** Accepted
**Date:** 2026-07

## Context

Two guests can request the last Coral Deluxe within milliseconds of each other. If availability is
checked before the write, both requests see one room free and both succeed. This is a
time-of-check-to-time-of-use bug, and it is the single most common defect in booking systems.

## Decision

`createBookingHold()` does all of the following inside one `Serializable` transaction:

1. Re-read every blocking booking that overlaps the requested range.
2. Recompute remaining inventory from that read.
3. Select a specific free `RoomUnit`.
4. Recompute the authoritative price.
5. Insert the booking and its audit event.

Postgres raises error `40001` when it cannot serialize two concurrent transactions. Prisma
surfaces that as `P2034`. We catch it and return a `409 INVENTORY_CONFLICT` with a message a guest
can act on, rather than letting it become a 500.

## Consequences

**Good**

- Double booking is prevented by the database, not by application-level optimism.
- The loser of a race gets a correct, actionable error instead of a corrupt reservation.
- Price is computed inside the same transaction, so a tampered client payload cannot buy a suite
  cheaply.

**Costs**

- Serializable is the most expensive isolation level. Acceptable here: the transaction is short,
  touches few rows, and booking writes are rare relative to reads.
- Under heavy contention some transactions retry or fail. That is the correct trade: a failed
  booking is recoverable, an oversold room is not.

## Alternatives considered

- **Optimistic locking with a version column.** Works, but requires the same retry handling while
  giving weaker guarantees across multi-row reads.
- **`SELECT ... FOR UPDATE` on room units.** Viable, but locks rows we may not end up using and
  is harder to reason about as the query grows.
- **A unique constraint on `(roomUnitId, date)`.** Would require the per-night inventory table
  rejected in ADR 0001.
