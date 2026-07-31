# Working on BookNow

## Layout rules

- `src/lib/**` is **pure**. No Prisma, no `next/*`, no environment access, no `new Date()` that
  cannot be injected. Everything here is unit tested.
- `src/server/**` is where I/O lives: database, auth, payments, the LLM call.
- `src/app/**` is routing and rendering only. Business logic that grows past a few lines belongs
  in `server/` or `lib/`.

If a change to pricing, availability, or the booking state machine does not come with a test,
it is not finished.

## Before opening a pull request

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

CI runs the same four commands plus a Docker build, against a real Postgres service container.

## Adding a booking state

1. Add it to `BookingState` and `ALLOWED_TRANSITIONS` in `src/lib/booking-state.ts`.
2. Add it to the Prisma `BookingStatus` enum and run `npm run db:migrate`.
3. The reachability and acyclicity tests will fail until the new state is properly connected.
   That is the point.

## Commit style

Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
