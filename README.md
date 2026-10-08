# Informed Trades

A stock research page that places price candles, news, AI sentiment and detected
news-price events side by side. It reports what occurred together; it does not
predict prices, recommend trades or claim that news caused a move.

**Stack:** PostgreSQL · Node.js/Express (raw SQL via `pg`) · React (Vite) · Ollama

## Setup

Requirements: Node 20.12+, PostgreSQL 16+, Ollama.

1. Create the database (psql or pgAdmin): `CREATE DATABASE informed_trades;`
2. Fill in `.env` (copy `.env.example` if it does not exist): database password and Finnhub key.
3. Install and load:

   ```bash
   cd server
   npm install
   npm run migrate          # schema + seed stocks and demo user
   npm run smoke            # checks database, price provider, news provider, Ollama
   npm run ingest:prices    # ~1 year of daily candles for every stock
   ```

4. Run (two terminals):

   ```bash
   cd server && npm run dev     # API on http://localhost:3001
   cd client && npm install && npm run dev   # UI on http://localhost:5173
   ```

## Commands (run from `server/`)

| Command | What it does |
|---|---|
| `npm run migrate` | Applies new files in `db/migrations`, then re-runs the idempotent seeds |
| `npm run db:test` | Runs `db/tests/constraints.sql` (integrity checks, rolled back afterwards) |
| `npm run ingest:prices -- [--days=400] [SYMBOL ...]` | Upserts daily OHLCV candles |
| `npm run smoke` | Verifies every external dependency responds |
| `npm test` | API tests against the configured database |

## Layout

- `db/migrations` — schema, indexes (later: views, functions, trigger)
- `db/seed` — stocks and the demo user
- `db/tests` — constraint and cascade tests
- `server/src/queries` — all SQL used by the API, one file per resource
- `server/src/providers` — external data sources (Yahoo prices, Finnhub news, Ollama)
- `server/src/scripts` — command-line jobs (migrate, ingest, smoke)
- `client/src` — React UI
