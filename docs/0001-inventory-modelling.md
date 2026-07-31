# ADR 0001: Model inventory as room types plus physical units

**Status:** Accepted
**Date:** 2026-07

## Context

The naive booking-app model puts an `isBooked` boolean (or a `status` enum) on a `Room` row.
It is easy to write and wrong in three ways:

1. It cannot represent "this room is booked next March but free tonight".
2. It cannot sell ten identical rooms of the same type without ten separate listings.
3. It makes availability a write-heavy flag flip rather than a read-time derivation, which means
   the flag can drift out of sync with the bookings that caused it.

## Decision

Two tables:

- `RoomType` is the sellable product. It carries the rate, the photos, the attributes, and the
  marketing copy.
- `RoomUnit` is a physical room with a door number. It carries a floor and an operational status
  (`AVAILABLE`, `OUT_OF_SERVICE`, `DEEP_CLEAN`).

Availability is never stored. It is derived at read time by counting how many units of a type are
consumed on each night of the requested range, and taking the minimum across nights.

## Consequences

**Good**

- A room type with ten units naturally sells ten concurrent stays.
- Taking a room out of service for maintenance is one status change and availability follows.
- Availability can never disagree with the booking ledger, because it *is* the booking ledger.
- The same function powers guest search, the room detail calendar, and the admin dashboard.

**Costs**

- Availability is a query rather than a column read. Mitigated with a composite index on
  `(roomTypeId, checkIn, checkOut)` and by pushing the overlap predicate into Postgres.
- Assigning a specific unit at booking time adds a step. Worth it: it lets the front desk see
  exactly which door number a guest has before they arrive.

## Alternatives considered

- **Per-night inventory rows.** One row per room per night. Simpler to query, but it explodes to
  millions of rows and makes rate changes a bulk update.
- **Boolean on room.** Rejected for the reasons above.
