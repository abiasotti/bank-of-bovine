# Bank of the Bovine Overlord

A multi-user fake-money brokerage simulator. Every account starts with the
same fixed cash balance, then buy/sell simulated positions in real stocks.
Tracks cost basis, tax lots, and portfolio performance, with a leaderboard
for bragging rights - since everyone starts even, the leaderboard measures
trading skill, not who deposited more.

**Not a real financial product.** No real money, no real trades. Quote data
is simulated — the app displays a persistent disclaimer and is not a source
of real market data.

See [`brokerage-sim-spec.md`](./brokerage-sim-spec.md) for the full project
spec.

## Status: full production infra in place

The core domain (auth, ledger, transfers, orders, tax lots, portfolio,
watchlists, leaderboard), real Finnhub quotes, full-market lookup, and live
price push are all built and tested. As of this pass, the originally
deferred production infra is too: a Go **worker**, real **Redis** pub/sub,
and **Caddy** — matching the spec's target architecture.

- **Auth**: email/password (Auth.js v5, JWT sessions, argon2id hashing)
- **Accounts & ledger**: event-sourced ledger (`ledger_entries`) — cash
  balances are always derived by summing entries, never stored as a mutable
  column
- **Funding**: every account is seeded with a fixed starting cash balance
  ($500,000) at registration - no funding/transfer flow, everyone starts even
- **Quotes**: real-time via Finnhub's free tier, or a random-walk mock —
  swappable via `QUOTE_PROVIDER`, polled by the Go worker and persisted to
  Postgres (see "Quote data" below)
- **Lookup & Trade**: search the full market by symbol or company name
  (not limited to a fixed list), view a quote and price history, then
  Buy/Sell from a modal pre-scoped to that symbol — a new symbol is created
  in our catalog and priced on demand the moment you look it up
- **Orders**: market, limit, and stop orders; Day and GTC time-in-force;
  cancellation; the worker triggers evaluation of pending limit/stop orders
  against fresh quotes on a timer
- **Tax lots & cost basis**: FIFO, LIFO, and specific-lot sell methods;
  realized and unrealized gain/loss tracking
- **Portfolio**: holdings, market value, day change, total return vs. net
  deposits — Lookup, Watchlist, and Portfolio prices update live via
  Server-Sent Events backed by Redis pub/sub, no page refresh needed (see
  "Live price push" below)
- **Watchlists** and a **leaderboard** (ranked by total return %, not raw
  dollars)
- Persistent "quotes are simulated" disclaimer banner across the app

**Not yet done**: actually deploying to a Linode box (needs a provisioned
server, domain, and SSH access), and the spec's stretch goals (seasons,
dividends, multi-portfolio support, benchmark comparison).

## Architecture

- **`app`** (Next.js): all user-facing pages/API routes, reads quotes from
  Postgres, subscribes to Redis pub/sub for live ticks. Also owns the
  **on-demand** single-symbol fetch used when you look up a brand-new
  ticker (`findOrCreateSecurity` in `lib/securities/securityService.ts`) -
  that's a page-render-triggered need, not a scheduled one.
- **`worker`** (Go, `worker/`): two scheduled jobs. (1) Quote polling -
  computes the watched-or-held symbol set directly against Postgres,
  fetches prices (mock or real Finnhub), writes quotes to Postgres,
  publishes each tick to Redis. (2) Order-eval trigger - POSTs to the
  app's internal route on a timer.
- **`redis`**: pub/sub channel for live quote ticks (not a read-through
  cache in front of Postgres - reads are already fast/indexed at this
  scale).
- **`caddy`**: reverse proxy in front of `app`, automatic HTTPS.
- **`postgres`**: sole source of truth for everything.

**Order evaluation logic deliberately stays in TypeScript**, not Go. The
spec describes the worker directly evaluating orders, but FIFO/LIFO/
specific-lot selection, cost basis, and ledger posting
(`lib/orders/orderEvaluator.ts`, `lib/orders/executeFill.ts`,
`lib/taxlots/*`) are already built, tested, and correct there.
Reimplementing that in Go would mean two independent copies of
money-critical logic that must stay behaviorally identical forever, for no
real benefit. So the worker's "order evaluation job" is just a timer that
calls `POST /api/internal/evaluate-orders`, which runs the existing
TypeScript logic. `app` and `worker` still never talk to each other beyond
that one internal trigger - Postgres and Redis remain the real integration
points, per the spec's original design goal.

## Live price push

`app/api/quotes/stream/route.ts` is a Server-Sent Events endpoint
(`?symbols=AAPL,MSFT`) backed by real Redis pub/sub
(`lib/quotes/quoteEvents.ts`). The worker publishes every scheduled tick
directly to Redis; the app's own on-demand single-symbol fetch publishes
there too, so both paths behave identically regardless of which process
triggered them. `lib/hooks/useLiveQuotes.ts` is the client-side hook that
subscribes and returns the latest price per symbol; `LiveQuoteView`,
`LiveChart`, `LivePortfolioView`, and `WatchlistTable` use it to
live-recompute prices, change badges, market value, and unrealized G/L
without a refresh.

If you're running Caddy in front of the app (the full `docker-compose.yml`
stack), note that reverse proxies buffer streaming responses by default -
`Caddyfile` sets `flush_interval -1` and skips gzip encoding specifically
because SSE needs immediate flushing to work at all.

## Quote data

`QUOTE_PROVIDER` (set identically in both `.env` and `worker/.env`)
selects the quote source:

- `mock` (default) — `RandomWalkQuoteProvider`/`MockProvider` (TS/Go random
  -walk price generators, kept behaviorally identical). No API key needed.
  Any symbol is "valid" (a fake provider has no real market to validate
  against) — an unseen symbol is lazily seeded at a default starting price
  on first use.
- `finnhub` — real quotes from [Finnhub](https://finnhub.io)'s free tier.
  Requires `FINNHUB_API_KEY`. The worker polls every 30s by default
  (`QUOTE_POLL_INTERVAL_MS` in `worker/.env` to override) - the free tier
  is rate-limited to 60 req/min with no batch quote endpoint.

Finnhub's free tier does **not** include historical OHLC data (confirmed
live — `/stock/candle` returns `{"error":"You don't have access to this
resource."}`), so price history is accumulated in our own `quotes` table by
polling, not fetched on demand.

### Full market, not a fixed list

`prisma/seed.ts` still seeds ~20 popular symbols so the app isn't empty on
first run, but the securities catalog isn't limited to it — `Lookup`
(`lib/securities/securityService.ts`) can search and trade **any** real
US-listed ticker Finnhub recognizes: local-DB search plus, when
`QUOTE_PROVIDER=finnhub`, Finnhub's own `/search` endpoint for anything not
yet in our catalog. Visiting `/lookup/[symbol]` for an unknown ticker
validates it against the live provider and creates it on the spot, or
rolls back cleanly and shows "not found."

**Rate-limit safety, now that the catalog is open-ended:** the worker only
polls symbols on **someone's watchlist or held in an open position** - not
every security ever looked up. A symbol you view but don't watch/hold gets
one fresh quote at view time (self-throttled to once per 60s per symbol
via `ensureFreshQuote` in the app), then goes idle until you act on it.

## Tech stack

- **App**: Next.js 16 (App Router, TypeScript)
- **Worker**: Go, `pgx` (Postgres), `go-redis` (Redis pub/sub),
  `shopspring/decimal` (money-safe math, matching `decimal.js` on the TS
  side)
- **Database**: PostgreSQL via Prisma 7 (`@prisma/adapter-pg`) from the
  app, raw SQL via `pgx` from the worker; `NUMERIC` columns +
  `decimal.js`/`shopspring/decimal` for exact money/share-quantity math —
  never floats
- **Cache/pub-sub**: Redis (`ioredis` from the app, `go-redis` from the
  worker)
- **Reverse proxy**: Caddy (automatic HTTPS)
- **Auth**: Auth.js v5 (`next-auth@beta`), Credentials provider, JWT
  sessions, `@node-rs/argon2` for password hashing
- **Tests**: Vitest (TS) + `go test` (worker)

## Getting started (local dev)

Local dev now requires the worker (and Redis) running alongside
`npm run dev` — there's no in-process scheduler fallback. The app still
runs on the host (not containerized) for fast hot-reload; `docker-compose.dev.yml`
provides the supporting infra (postgres + redis + worker).

### Prerequisites

- Node.js 20.9+ (developed against Node 26)
- Go 1.26+ (only needed if you want to run the worker via `go run .`
  instead of Docker)
- Docker

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
cp worker/.env.example worker/.env
```

Edit `.env` and set `AUTH_SECRET` and `INTERNAL_API_SECRET` to random
values, e.g. `openssl rand -base64 33`. Set the **same** `INTERNAL_API_SECRET`
in `worker/.env` — the worker authenticates to the app's internal route
with it. To use real quotes, set `QUOTE_PROVIDER="finnhub"` and add a free
`FINNHUB_API_KEY` **in both files** — otherwise leave `QUOTE_PROVIDER`
unset in both and quotes are simulated.

### 3. Start the dev infra (postgres + redis + worker)

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

### 4. Run migrations and seed data

```bash
npm run db:migrate
npm run db:seed
```

### 5. Start the app

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) — you'll be redirected
to `/login`. Register an account to get started; every new account is
automatically funded with a fixed $500,000 starting balance - there's no
funding flow, everyone starts even.

### Running the full containerized stack

`docker-compose.yml` (not `.dev.yml`) runs everything containerized,
including `app` behind Caddy — this is the deployment reference, and useful
for verifying the full stack works end-to-end before actually deploying:

```bash
docker compose -f docker-compose.yml up -d --build
```

Requires `AUTH_SECRET`, `INTERNAL_API_SECRET`, and (if using real quotes)
`FINNHUB_API_KEY` set in your shell environment or a root `.env` file (docker
compose reads it automatically for `${VAR}` substitution). Visit
`https://localhost` (Caddy auto-generates a locally-trusted self-signed cert
for `localhost`; set `DOMAIN` to a real domain for an actual deployment and
Caddy will get a real Let's Encrypt certificate instead).

### Other useful commands

```bash
npm run test         # TS test suite (unit + integration)
(cd worker && go test ./...)   # Go worker test suite
npm run build         # production build
npm run db:studio     # Prisma Studio, a GUI for browsing the database
npm run lint          # ESLint
```

Integration tests run against the same local Postgres instance and truncate
their own data between test files — make sure the dev infra from step 3 is
running before `npm run test`.
