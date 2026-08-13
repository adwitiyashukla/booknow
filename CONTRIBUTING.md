# Working on BookNow

## Layout

- `src/lib` is pure. No Prisma, no `next/*`, no environment access, and no `new Date()` that
  cannot be injected. Everything here is unit tested.
- `src/server` holds I/O: database, auth, payments, the LLM call.
- `src/app` is routing and rendering. Business logic belongs in `server` or `lib`.

Changes to pricing, availability or the booking state machine need a test.

## Before a pull request

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

CI runs the same four commands plus a Docker build against a Postgres service container.

## Adding a booking state

1. Add it to `BookingState` and `ALLOWED_TRANSITIONS` in `src/lib/booking-state.ts`.
2. Add it to the Prisma `BookingStatus` enum and run `npm run db:migrate`.
3. The reachability and acyclicity tests will fail until the new state is connected.
