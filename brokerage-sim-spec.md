# Bank of the Bovine Overlord — Project Spec

(Working name for the brokerage simulator described below. Yes, it's a brokerage, not a bank — the name stays anyway.)

## Summary

A multi-user fake-money brokerage simulator. Users "fund" a simulated brokerage account by transferring fake cash from a simulated external bank account, then buy/sell simulated positions in real stocks using real (delayed-free-tier) quote data. Tracks cost basis, tax lots, and portfolio performance. Supports a competitive "seasons" mode with a leaderboard.

Not a real financial product. No real money, no real trades, no real brokerage functionality. Quote data is for simulation purposes only — the app must clearly disclose this in the UI and point users elsewhere for real market data.

## Tech Stack

- **Frontend/App**: Next.js (TypeScript) — unified frontend + API routes in one deployable, strong ecosystem for dashboards/charts, type safety end-to-end
- **Worker**: Go — standalone binary, no web framework needed, just a scheduler loop + Finnhub HTTP client + DB/Redis drivers. Chosen for low memory footprint (relevant on a 2GB box) and because it's a strong fit for concurrent polling/background-job workloads. `app` and `worker` never talk to each other directly — they only communicate via Postgres and Redis, so this language split is a non-issue and the worker can scale independently later if needed.
- **Database**: PostgreSQL (chosen over MySQL/DynamoDB for ACID transactions across ledger entries and exact-decimal `NUMERIC` math — required for anything modeling money)
- **Cache / pub-sub**: Redis (quote caching, websocket pub-sub for live price pushes)
- **Reverse proxy / TLS**: Caddy — automatic Let's Encrypt cert issuance and renewal, minimal config (chosen over a Linode NodeBalancer, which would add ~$10/mo, and over nginx since Caddy auto-manages certs)
- **Quote data source**: Finnhub free tier (60 calls/min, real-time US equities, websocket streaming for up to 50 symbols)
- **Local dev**: Docker Compose (app, worker, Postgres, Redis, Caddy)
- **Deployment ("prod")**: single Linode instance (~$12–24/mo tier), same Docker Compose stack. No Kubernetes for now — revisit only if scale actually demands it.

## Containers (both local and prod)

1. `app` (Next.js) — frontend UI + API routes (auth, orders, transfers, portfolio views, leaderboard). Reads/writes Postgres directly, reads live quotes from Redis.
2. `worker` (Go) — standalone binary handling two scheduled jobs: polling/streaming Finnhub for symbols currently watched or held (writes hot quotes to Redis, history to Postgres), and evaluating open limit/stop/GTC orders against fresh prices to execute or expire them.
3. `postgres` — primary datastore (accounts, orders, tax lots, transactions, ledger)
4. `redis` — quote cache + pub/sub for live updates to connected clients
5. `caddy` — reverse proxy in front of `app`; handles HTTPS termination and automatic Let's Encrypt cert issuance/renewal (chosen over a Linode NodeBalancer, which would add ~$10/mo — not worth it at this scale, and over nginx since Caddy auto-manages TLS certs with minimal config)

## Core Data Model (high level)

- `users`
- `accounts` (brokerage account per user; balance derived from ledger, not stored as a mutable field if possible)
- `external_bank_accounts` (the fake funding source — effectively infinite balance, exists just so transfers have a documented origin)
- `transfers` (transactions between external bank and brokerage account — this is the "funding" mechanic; see below)
- `securities` (symbol, name, exchange metadata)
- `quotes` (latest + historical price snapshots, populated by the worker)
- `orders` (type, side, symbol, qty, limit/stop price, time-in-force, status)
- `tax_lots` (per-purchase lot: symbol, qty, cost basis, acquired date, still-open qty)
- `trades`/`executions` (filled orders, links to which lots were consumed on a sell)
- `seasons` (optional — see Stretch Goals)
- `season_participants` (starting balance snapshot, season-scoped account state)

## Funding / Transfer Mechanic

No arbitrary "add funds" button. Funding works as a real transfer between two modeled accounts:

- Every user has a fake **external bank account** with an effectively unlimited balance.
- Users initiate a **transfer** from the external account into their brokerage account.
- Every transfer is a logged transaction and appears in account history, same as a real ACH transfer would.
- In free-play mode, transfers are unlimited (no cap) — this is just the onboarding/funding flow.
- In **season mode** (stretch goal), transfers are locked after the season's initial funding — no topping up mid-season, since unlimited funding would break the leaderboard.

## Order Types (MVP)

- Market order (fills at current quote, executed immediately)
- Limit order
- Stop-loss order
- Time-in-force: Day and **Good-Til-Cancelled (GTC)**
- Order cancellation
- Pending orders are evaluated by the `worker` process against incoming quotes; GTC orders persist until filled or cancelled

## Cost Basis / Tax Lots

- Track individual purchase lots (qty, price, date) per symbol per user
- Support lot selection method on sell: FIFO (default), LIFO, specific-lot selection
- Realized vs. unrealized gain/loss tracking
- Cost basis reporting per position and per lot

## Portfolio & Performance Tracking

- Current holdings, market value, unrealized gain/loss
- Realized gain/loss (closed positions)
- Historical price charts per symbol (needs historical data, not just latest quote — confirm Finnhub endpoint coverage for this during build)
- Portfolio performance over time — day change, total return
- Time-weighted return, ideally with a benchmark comparison (e.g., vs. S&P 500) — nice-to-have, not blocking for MVP

## Watchlists

- Users can add/remove symbols to a personal watchlist
- Watchlist shows live-ish quotes (via Redis-cached data / websocket push)
- No price alerts / notifications (explicitly out of scope — no alerting infrastructure)

## Multi-User / Social

- Standard multi-user auth (need to decide: email/password, magic link, OAuth — TBD)
- **Leaderboard**: rank users by portfolio performance
- Data isolation: users only see their own account details, but leaderboard surfaces relative performance

## Explicitly Out of Scope (for now)

- Margin trading / short selling
- Options trading
- Price alerts / notifications of any kind
- Kubernetes deployment
- Real payment/funding integration (obviously — this is entirely fake money)

## Stretch Goals

- **Seasons**: time-boxed competitions. Each participant starts with a fixed balance (e.g. $100k) for a fixed window (e.g. 3 months). Funding is locked for the season (see Funding section above). Leaderboard is scoped per season. Requires snapshotting season-start state separately from free-play account state.
- Dividend simulation
- Multiple portfolios per user (e.g., separate "strategies")
- Historical performance benchmarking against index funds

## Quote Data Notes

- Finnhub free tier: real-time for US equities, 60 req/min, websocket streaming up to 50 symbols, international exchanges may be delayed or EOD-only
- Worker should poll/stream only symbols that are actively watched or held across all users to stay within rate limits — do not fetch on a per-request basis
- **UI must display a persistent disclaimer**: "Quotes are for simulation purposes only. Not real-time investment data — consult a real market data source for actual trading decisions."

## Deployment Notes

- Same Docker Compose stack runs locally and on the Linode box — no environment drift between dev and "prod"
- HTTPS handled by the `caddy` container (Let's Encrypt, auto-renewal) — no Linode NodeBalancer needed
- Entry-tier Linode (2GB RAM) may be tight running app + worker + Postgres + Redis + Caddy simultaneously; monitor memory (`docker stats`) and be ready to bump to the 4GB tier (~$24/mo) if needed
- No HA control plane / Kubernetes needed at this scale — revisit only if user count or traffic grows meaningfully beyond ~5 users

## Open Questions (for Claude Code / implementation phase to resolve or flag back)

- Auth strategy (email/password vs. OAuth vs. magic link)
- Whether historical price/chart data is available on Finnhub's free tier or needs a secondary source
- Exact schema for the ledger — event-sourced (immutable transaction log, balance derived) vs. mutable balance field with transaction log for audit only
- Season scheduling/administration — manual admin trigger vs. automated recurring seasons
