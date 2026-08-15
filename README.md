# BookNow

[![CI](https://github.com/adwitiyashukla/booknow/actions/workflows/ci.yml/badge.svg)](https://github.com/adwitiyashukla/booknow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A hotel reservation system where availability is worked out from the booking ledger rather than
stored on the room, so two people booking the last room at the same time cannot both succeed.

Live demo: https://booknow-gold.vercel.app

Sign in as `admin@booknow.dev` / `Password123` for the operations dashboard, or
`guest@booknow.dev` / `Password123` for the guest side. Payments run in a simulated mode, so you
can book a room end to end without a card.

| | |
| --- | --- |
| ![Availability search](docs/screenshots/02-search.png) | ![AI concierge](docs/screenshots/03-concierge.png) |
| Search, with rates worked out from occupancy on those dates | The concierge answering a plain English request |

![Revenue dashboard](docs/screenshots/04-dashboard.png)

## Why I didn't just put a boolean on the room

Nearly every booking project I looked at stores `isBooked` on a room row, or a status enum, and
flips it when someone books. It demos fine. It also cannot answer "is room 12 free next March",
because a single flag has no dates attached to it.

The bigger problem is that the flag is a copy of the truth rather than the truth. The bookings are
what actually happened. The flag is something you have to remember to update, and the moment those
two disagree you have a room that is sold twice or a room you cannot sell at all.

So I didn't store availability anywhere. There are two tables: a room type, which is the thing you
buy and which carries the rate and the photos, and a room unit, which is a physical room with a
number on the door. Availability is worked out at read time by counting how many units of a type
are taken on each night you asked for, and taking the worst night. A type with ten units sells ten
stays at once and nothing needs updating.

That one decision is what let everything else work. Same-day turnover falls out of it, because
stays are half-open intervals and a checkout on the 5th doesn't collide with a check-in on the 5th.
So does the dashboard, because occupancy is derived from the same ledger the guest search reads.

## Where the data came from

I didn't want to make up the numbers on the dashboard, because invented data always looks
invented. The behaviour comes from a published dataset:

> Antonio, N., de Almeida, A., and Nunes, L. (2019). Hotel booking demand datasets.
> Data in Brief, 22, 41-49. 119,390 reservations from two Portuguese hotels, arrivals July 2015 to
> August 2017. Openly licensed.

I use the resort property, since that is what I was modelling. Real in the ledger: lead time,
length of stay, party size, cancellation and no-show behaviour, daily rate, arrival seasonality,
market segment, distribution channel and guest country. The acquisition panels on the dashboard
read straight off those columns.

What is not real is the property itself. Cove and Spruce is invented, and so are the rooms, the
photos and the guest names. The dataset is anonymised, which it has to be, so there are no names in
it to use. I generate names from a pool matched to each booking's real country, so the mix of
source markets stays true even though no individual is.

There is a second seed that needs no download and produces a synthetic ledger instead. That one
exists so anyone can clone the repo and get a working app without waiting for a 40 MB file.

## Fitting 39,291 arrivals into 42 rooms

This is the part that took the most thought.

The dataset has no rooms in it. Room types are anonymised to single letters and there is no unit
inventory at all, so there was nothing to book those 39,291 arrivals into. I could have assigned
them randomly, but then the calendar would contain overlaps, which is exactly the thing the whole
project is supposed to prevent.

What I did instead was replay the arrival stream in date order against my 42 units, using the same
half-open interval rule the live booking code uses, and refuse anything that didn't fit. That is
what a real property does when it is full. The importer prints how much it refused.

Two things I got wrong on the first attempt and had to fix:

Demand was split evenly across the seven room types. That sounds fair and is wrong, because the
types are not the same size. A seventh of all demand was being aimed at a two-room penthouse and
refused, while the ten-room category sat half empty. I changed it to allocate demand in proportion
to each type's inventory.

Room assignment took the first free unit in the list. That scatters short gaps across the floor
that nothing fits into. I changed it to take the room vacated most recently, which closes the
smallest gap it can and leaves the longer-idle rooms free for longer stays. Writing the test for
that also turned up a tie-break bug that made assignment non-deterministic between runs.

Together those two changes took accepted bookings from 4,627 to 5,118 and occupancy from 47.3
percent to 56.7 percent.

The final import reads:

```
39,291 usable reservations after cleaning
7 room types, 38 sellable units
replayed against inventory: 5,118 accepted, 23,138 turned away (18.1% fit)
ledger: 7,112 reservations
cancellations: 1,939 (27.3%)
```

Refusing 23,138 requests is not a failure. A 42-room property could only absorb 18 percent of a
large resort's real demand, and that constraint is the reason the occupancy figures are believable.

The rates needed adjusting too. The source is in euros and would have contradicted the prices shown
on my room pages, so each type is rescaled by the ratio of its listed base rate to the mean source
rate for that type. The spread and the seasonality survive, the absolute level matches my catalogue.

All of this lives in `src/lib/hotel-dataset.ts` as pure functions, so I can test it against a small
fixture instead of the 40 MB file.

## The booking engine

Two guests can ask for the last room within milliseconds of each other. If you check availability
and then write, both requests see one room free and both get it. Checking first and writing second
is the bug.

So the whole reservation is one Serializable transaction that re-reads inventory inside itself,
picks a specific unit, recalculates the price, and writes. Postgres raises 40001 when it cannot
serialize two concurrent transactions, Prisma surfaces that as P2034, and I catch it and return 409
rather than letting it become a 500. The loser of the race gets a message they can act on.

The price is recalculated inside that transaction on purpose. Whatever the browser sends is treated
as a suggestion, so editing the request body doesn't get you a cheaper suite.

Pricing itself is a pure function in `src/lib/pricing.ts` with no database and no clock it isn't
handed:

```
nightly = base
        x seasonal multiplier    (highest priority rate rule wins)
        x weekend multiplier     (Friday and Saturday, 1.25)
        x demand multiplier      (0.92 to 1.60 across the occupancy curve)
        x lead time multiplier   (0.88 to 1.00)

subtotal = sum(nightly) + extra guests - length of stay discount + rate plan adjustment
total    = subtotal + resort fee + service fee + occupancy tax
```

Every applied factor comes back with a label, so the booking page can show a guest why a Saturday
in August costs what it does. Every amount is an integer number of cents from end to end, and a
test asserts no field in a quote is ever fractional.

The concierge is a three-stage thing rather than a chat wrapper. It turns the message into a
structured query, retrieves real rows with a TF-IDF index and cosine similarity, then writes the
answer from what it retrieved. It cannot name a room or a price that isn't in the database. If
there is no Anthropic key it uses a rule-based parser instead of an LLM for the first stage, and
everything after that is identical.

## What the dashboard shows

These are from the live deployment with the real ledger loaded, over a 30 day window:

| Metric | Value |
| --- | --- |
| Revenue | $370,462.43 across 249 reservations |
| Occupancy | 56.7 percent, 668 of 1,178 room nights |
| ADR | $397.37 |
| RevPAR | $225.33 |
| Realisation | 81 percent, 19 percent cancelled or abandoned |

The number I find most interesting is the 27.3 percent cancellation rate in the ledger. I never set
that. It came through from the source data and survived the whole import, which told me the
transformation hadn't quietly distorted the behaviour it was supposed to preserve.

56.7 percent occupancy is lower than the 70 I was aiming for when I started tuning. I stopped
chasing it, because the gap is seasonality. That resort has a strong summer and thin winter months,
and no amount of clever room assignment fills a room nobody wants in February. A suspiciously flat
70 percent would have been less believable than an uneven 56.7.

## Getting it running

It's deployed on Vercel with a Neon Postgres behind it, and there is a Dockerfile and a compose
file if you'd rather run the whole thing locally. The runtime image uses the standalone Next output
and runs as a non-root user.

One deployment constraint changed the design for the better. Rooms are held for 15 minutes while
someone pays, and I originally released abandoned holds with a cron job every five minutes. Vercel's
free plan runs cron once a day, so a hold that lapsed at 09:01 would have blocked the room until the
next morning.

The fix wasn't a faster scheduler. I moved expiry into the availability query itself, so a lapsed
hold stops blocking the room the moment it lapses, on any host. The cron job still runs daily but
now only tidies the status column, and correctness no longer depends on it being punctual. What it
costs is that `status` is eventually consistent: a row can read HELD while the booking is
effectively expired, so anything that needs the truth asks the query rather than reading the column.

## Things I got wrong

Several things broke while I was building this. Three were worth writing down.

### The conversion rate said 100 percent and meant nothing

The dashboard had a conversion metric and it read 100 percent, which I was pleased about for
roughly a minute. Then I worked out what it was dividing. It counted confirmed bookings against
confirmed plus expired, and my seed data contained no expired bookings at all, so the denominator
was just the numerator. It could not have shown anything except 100.

I replaced it with a realisation rate that counts cancellations and abandoned holds against
everything booked, and seeded abandoned holds so there is something real to measure. It now reads
81 percent, which is a number that can move.

### The concierge ignored the budget it was given

I asked it for a quiet ocean view room for two under $300 and it led with a $680 villa.

Budget was one weighted signal in the ranking at 14 percent of the score, and a strong feature match
outvoted it. The villa matched "quiet" perfectly, so it won on points while being more than twice
the price I asked for. The ranking was working exactly as written and the output was still wrong.

A stated budget is a constraint, not a preference. I moved price bounds out of the scoring and made
them a filter, alongside the hard requirements. When the filter leaves nothing, the concierge says
so and offers the nearest alternatives instead of quietly pretending an expensive room was an
answer. There is now a test that fails if a strong feature match ever smuggles an over-budget room
back in.

### I wiped my own production database

I had exported a remote database URL into a terminal to seed the deployed app. An hour later, in
the same terminal, I ran the seed command again to pick up a change. The seed truncates every
table. It had no idea it was pointed at production and neither did I, because it printed nothing
about where it was going.

The importer is deterministic, so restoring it was one command. The lesson wasn't about being more
careful. A destructive script that doesn't say what it is about to destroy is the actual problem.
Both seed commands now print the target database before they touch anything, and refuse to run
against a remote host unless you set `ALLOW_REMOTE_SEED=true`. One of the tests reproduces the exact
shape of the mistake. The parsing also never prints the password, and treats a URL it cannot parse
as remote rather than local, because guessing "local" wrongly costs you a database and guessing
"remote" wrongly costs you one extra keystroke.

## How I decided it was good enough

154 unit tests, all against the parts where being wrong actually matters: pricing, availability,
the booking state machine, query parsing, retrieval ranking, the dataset transformation, and the
seed guard.

| Suite | Tests |
| --- | --- |
| `tests/hotel-dataset.test.ts` | 33 of 33 |
| `tests/availability.test.ts` | 28 of 28 |
| `tests/nlu.test.ts` | 28 of 28 |
| `tests/pricing.test.ts` | 23 of 23 |
| `tests/retriever.test.ts` | 23 of 23 |
| `tests/db-target.test.ts` | 11 of 11 |
| `tests/booking-state.test.ts` | 8 of 8 |

Several are property based rather than example based, which I found more useful than adding more
cases. The demand multiplier is checked across the whole occupancy range instead of at three
points. No field in a quote is allowed to be fractional. Refund plus penalty always equals the
amount paid. The same room is never assigned twice for overlapping dates. Shifting the dataset
forward preserves every gap between arrivals.

What those numbers do not show is just as worth saying. Every one of these is a unit test over pure
functions. The transactional booking path, the API routes and the auth flow have no automated test
covering them. CI does run against a real Postgres, and it pushes the schema, seeds it and builds
the app, so I know the database layer works end to end. But nothing yet fires concurrent requests at
one room and asserts that exactly one wins. That is the single biggest gap and it is the next thing
I would write.

## Running it

Needs Node 20 or later, and either Docker or a local Postgres 14 or later.

```
git clone https://github.com/adwitiyashukla/booknow.git
cd booknow
npm install
cp .env.example .env

docker compose up -d db

npx prisma db push
npm run db:seed
npm run dev
```

That gets you a working app on http://localhost:3000 with no accounts to create and no keys to
configure. The default `.env` works as it is.

To load the real dataset instead of the synthetic one, add `npm run db:import:real`. That is the
only step that needs the internet, and it caches the file afterwards.

Both external services degrade rather than fail. With no Stripe key a simulated payment provider
takes over, calling the same settlement function the real webhook calls, idempotency guard and all.
With no Anthropic key the concierge uses its rule-based parser and everything downstream is
unchanged.

| Email | Password | Sees |
| --- | --- | --- |
| `admin@booknow.dev` | `Password123` | Operations dashboard |
| `staff@booknow.dev` | `Password123` | Front desk view |
| `guest@booknow.dev` | `Password123` | Guest account and stay history |

## What is in the repo

```
src/
  app/          routes, server components and API handlers
  components/   UI, no component library
  lib/          pure logic: pricing, availability, state machine, query parsing, retrieval
  server/       anything that does I/O: database, auth, payments, analytics
prisma/
  schema.prisma       the data model
  seed.ts             synthetic ledger, no network needed
  import-hotel-data.ts  the real dataset importer
tests/          seven vitest suites
docs/           photo credits and screenshots
```

The split between `lib` and `server` is the one I would defend hardest. Nothing in `lib` imports
Prisma or touches the network, which is why all 154 tests run in about three seconds with no
database.

## Tests

```
npm run test
```

A few worth reading if you only read a few:

| Test | What it pins down |
| --- | --- |
| `availability`, same-day turnover | A checkout and a check-in on the same date do not collide |
| `availability`, lapsed holds | An expired hold frees the room without waiting for the sweeper |
| `hotel-dataset`, conflict-free replay | No unit is ever double booked across 200 generated arrivals |
| `hotel-dataset`, date shifting | Moving the dataset forward preserves every interval between arrivals |
| `pricing`, integer cents | No field in a quote is ever fractional |
| `retriever`, budget filter | A strong feature match cannot bring back an over-budget room |
| `db-target`, remote guard | A remote database URL left in the shell is refused |
| `booking-state`, acyclicity | No path through the booking lifecycle can loop |

## Stack and license

Next.js 15 with the App Router, React 19, TypeScript in strict mode, PostgreSQL with Prisma,
Auth.js for sessions, Stripe for payments, Tailwind for styling, Vitest for tests, GitHub Actions
for CI, Docker for the container, deployed on Vercel with Neon.

Photo credits are in `docs/CREDITS.md`. Everything is MIT licensed.
