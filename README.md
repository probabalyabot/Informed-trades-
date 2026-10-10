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
| `npm run ingest:news -- [--days=90] [--full] [SYMBOL ...]` | Fetches news and links it to stocks |
| `npm run analyze -- [--limit=500]` | Sentiment analysis of stored articles with the local Ollama model |
| `npm run detect -- [SYMBOL ...]` | Detects news-price events |
| `npm run smoke` | Verifies every external dependency responds |
| `npm test` | API, SQL and validation tests against the configured database |

From `client/`: `npm test` runs the unit tests for the UI's pure helpers.

## Pages

- **Overview** (`/`): recent events, and every stock with a 30-day sparkline, price change, news sentiment, news activity and latest event. Sortable; tick 2 to 4 stocks to compare.
- **Stock** (`/stocks/:symbol`): an at-a-glance summary, candlesticks with event markers and a daily sentiment lane, the detected events, and the news feed with sentiment filters.
- **Compare** (`/compare?symbols=AAPL,MSFT`): price change of up to 4 stocks on one scale.

Sentiment, trend and activity figures describe recent data. They are not forecasts or advice.

## Layout

- `db/migrations` — schema, indexes, views and the `detect_events()` function
- `db/seed` — stocks and the demo user
- `db/tests` — constraint and cascade tests
- `server/src/queries` — all SQL used by the API, one file per resource
- `server/src/providers` — external data sources (Yahoo prices, Finnhub news, Ollama)
- `server/src/scripts` — command-line jobs (migrate, ingest, analyze, detect, smoke)
- `server/test` — API, event-detection, signal-view and validation tests
- `client/src` — React UI (`lib/` holds the pure helpers covered by `client/test`)
