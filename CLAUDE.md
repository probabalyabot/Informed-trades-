# Informed Trades

University DBMS course project (30% of grade), built solo on a ~3 week timeline.
A stock research page that puts price candles, news, AI sentiment and detected
"news-price events" side by side to help answer *"why is this stock moving?"*.

**The database is the graded part.** PostgreSQL does the analytical work, Node is
a thin layer, React shows the result. Prefer solving things in SQL (views,
functions, constraints) over application code, and keep the SQL easy to find
and demonstrate.

## Hard rules

- **Research tool, not a trading tool.** No trade execution, recommendations,
  price prediction or portfolio features.
- **No causal claims, anywhere** (UI text, SQL-generated text, comments, docs).
  Say "occurred alongside", never "caused" / "because of" / "due to". A test
  enforces this on event explanations.
- **Do not overengineer.** No ORM, no migration framework, no queues, caches,
  microservices or schedulers. Add a table only when a real feature needs it.
- **Candlesticks are never stored.** They are rendered from `price_history`.
- Never read or print `.env` (it holds the database password and Finnhub key).
  `npm run smoke` reports what is configured without revealing values.

## Stack

PostgreSQL 18 (native Windows service, no Docker) · Node 24 / Express 5 with
raw SQL through `pg` · React 19 + Vite + `lightweight-charts` v5 · Ollama
(`llama3.1:8b`, local, RTX 5060 8 GB).

Data sources: Yahoo Finance via `yahoo-finance2` (prices, no key) and Finnhub
`company-news` (news, free key, 60 calls/min).

## Running it

In VS Code with the project root open, **Ctrl+Shift+B** runs the
"Start Informed Trades" task (API + UI + opens the browser). Manually:

```
cd server && npm run dev      # API  http://localhost:3001
cd client && npm run dev      # UI   http://localhost:5173  (proxies /api)
```

Commands, all from `server/`:

| Command | Purpose |
|---|---|
| `npm run migrate` | Apply new `db/migrations/*.sql`, then re-run idempotent seeds |
| `npm run smoke` | Check database, price provider, news provider, Ollama |
| `npm run ingest:prices -- [--days=400] [SYM ...]` | Upsert daily candles |
| `npm run ingest:news -- [--days=90] [--full] [SYM ...]` | Fetch news; resumes per stock |
| `npm run analyze -- [--limit=500]` | Ollama sentiment for unanalysed articles; resumable |
| `npm run detect -- [SYM ...]` | Run `detect_events()` |
| `npm run db:test` | Constraint and cascade checks (rolled back) |
| `npm test` | API + detection tests against the configured database |

Normal refresh order: `ingest:prices` → `ingest:news` → `detect` → `analyze` → `detect`
(the second `detect` fills in each event's average sentiment).

## Layout

```
db/migrations/   001 schema · 002 indexes · 003 latest-analysis view · 004 analytics + detect_events
db/seed/         12 US stocks, demo user + default watchlist (idempotent)
db/tests/        constraints.sql
server/src/
  config.js db.js app.js index.js
  queries/       all API SQL, one file per resource
  routes/        thin Express routers
  providers/     prices.yahoo.js · news.finnhub.js · ollama.js
  scripts/       migrate · runSql · smoke · ingestPrices · ingestNews · analyze · detect
  middleware/    errors.js
server/test/     api.test.js · detect.test.js   (node:test, no extra deps)
client/src/      App · api.js · format.js · pages/ · components/
```

## Database (10 tables so far)

`app_user`, `stock`, `price_history`, `watchlist`, `watchlist_stock`,
`news_article`, `stock_article`, `article_analysis`, `news_price_event`,
`event_article`. Three N:M junctions: `stock_article`, `event_article`,
`watchlist_stock`.

Views: `v_latest_analysis`, `v_daily_returns`, `v_stock_daily_news`,
`v_stock_daily_metrics`, `v_event_summary`.
Functions: `trading_day_for(stock_id, timestamptz)`, `detect_events(...)`.

Design decisions worth knowing before changing anything:

- **Migrations are apply-once.** Never edit an applied migration; add a new
  numbered file. Seeds re-run every time and must stay idempotent.
- `price_history` PK is `(stock_id, timeframe, period_start)`; `period_start`
  is a `DATE` and `timeframe` is CHECKed to `'1d'` (daily only for now).
- `db.js` parses `DATE` as a `'YYYY-MM-DD'` string and `NUMERIC`/`BIGINT` as
  JS numbers. Do not turn dates into `Date` objects (timezone shifts).
- `article_analysis` is 1:N from an article, unique on
  `(article_id, model, prompt_version)`. Bump `PROMPT_VERSION` in
  `providers/ollama.js` when the prompt changes. "Latest" is a view.
- **Trading-day mapping:** news after the 16:00 New York close, or on a
  weekend/holiday, counts toward the next trading day (`trading_day_for`).
- **Event rule** (`detect_events`, thresholds are function parameters):
  price signal (`|return| >= 3%` OR `|return / 20-day volatility| >= 2`) AND
  news signal (`>= 3` articles AND `>= 2x` the 20-day average). Sentiment only
  describes an event; it is never a condition. Today's New York date is
  skipped (incomplete data). Upserts on `(stock_id, event_date)`; idempotent.
- `news_price_event` stores its metrics as a point-in-time snapshot (the one
  intentional denormalisation). Returns, volatility, news volume and
  baselines are never stored. The explanation sentence is generated in
  `v_event_summary`, not stored.
- No authentication: the API will act as the seeded demo user
  (`DEMO_USER_EMAIL`). Look the user up by email, do not assume id 1.

Data realities discovered along the way:

- Finnhub truncates a response at ~250 articles, so `ingestNews.js` halves the
  window until results fit. Three NVDA days hit the cap even for a single day
  and may be undercounted.
- Finnhub's ticker tagging is loose (e.g. Netflix stories filed under DIS), so
  news volume is a noisy signal. A relevance filter is a possible improvement.
- Volume is high (~33k articles for 90 days), so news covers 90 days rather
  than the originally planned 6 months, and sentiment is analysed for a
  prioritised sample: event-day articles first, then even coverage per
  stock-day. Events are detectable for roughly the latest 54 trading days.

## Status

Done and committed (phases 0-5 of the plan):

- Schema, constraints, indexes, migrations, seeds; 32 integrity checks pass.
- Price ingestion: ~277 daily candles for each of 12 stocks.
- News ingestion: ~33k articles, ~47.7k stock links, ~8.5k articles linked to
  more than one stock.
- Sentiment pipeline; a 4,000-article `llama3.1:8b` run was started on
  2026-10-08. Check coverage with
  `SELECT model, count(*) FROM article_analysis GROUP BY 1;` and re-run
  `npm run analyze` to continue, then `npm run detect`.
- Event detection: 27 events across 11 stocks.
- API: `GET /api/stocks[?q=]`, `/api/stocks/:symbol`, `/:symbol/prices`,
  `/:symbol/news`, `/:symbol/events`, `GET /api/events/:id`.
- UI: stock list, search, stock page with candlestick + volume chart, range
  buttons, event timeline, news feed with sentiment badges; selecting an
  event shows that day's articles.
- Tests: 14 passing (9 API, 5 detection).

Not yet confirmed: the event arrow markers on the chart were never checked
visually (preview screenshots timed out). The `.vscode` start task was written
but not executed.

## Remaining plan

**Phase 6 - Watchlists and dashboard**
- `middleware/currentUser.js` (demo user by email).
- Watchlist CRUD: `GET/POST /api/watchlists`, `DELETE /api/watchlists/:id`,
  `POST /api/watchlists/:id/stocks`, `DELETE /api/watchlists/:id/stocks/:symbol`.
- `v_trending` view: last 5 trading days per stock with each reason exposed as
  its own column (|return|, news vs baseline, event count) so the UI can show
  *why* a stock ranks.
- `GET /api/dashboard`; turn `pages/Dashboard.jsx` (currently a stock list)
  into watchlist movers + recent events + trending; add `pages/Watchlists.jsx`
  and an add-to-watchlist button on the stock page.

**Phase 7 - DBMS showcase**
- `alert` table (11th) + `trg_event_alert` AFTER INSERT trigger on
  `news_price_event` that alerts every user with that stock on a watchlist;
  partial index on unread alerts; `GET /api/alerts`, `PATCH /api/alerts/:id/read`.
  This is the project's only genuine trigger; keep it.
- Full-text search: `GET /api/articles/search?q=` using `search_vector`,
  `websearch_to_tsquery` and `ts_rank`; surface it in the search box.
- `db/demo/demo_queries.sql`: one runnable query per concept for the viva
  (joins, GROUP BY/HAVING, CTE, window functions, views, function, trigger,
  transaction rollback, upsert, `EXPLAIN ANALYZE` before/after an index,
  full-text search, JSONB on `raw_response`).

**Phase 8 - Hardening and deliverables**
- Snapshot scripts (`db:dump` / `db:restore` with `pg_dump`) so the demo runs
  with no network and no Ollama. `pg_dump` lives in
  `C:\Program Files\PostgreSQL\18\bin` and is not on PATH.
- README update, ER diagram, normalisation write-up (1NF/2NF/3NF with the two
  documented exceptions: the event snapshot and the generated `search_vector`).

**If time runs short, cut in this order:** alerts UI (keep the trigger), then
trending, then the dashboard. Never cut the demo SQL file.

**Deferred on purpose:** intraday timeframes, topics, fundamentals, scheduling,
login, LLM ticker extraction, Indian market, materialised views (only if a
view is measurably slow), frontend automated tests.

## Working conventions

- Verify changes: run `npm test` and `npm run db:test`, and check UI changes in
  the browser.
- One logical commit per phase or feature.
- All SQL parameterised; SQL for the API lives in `server/src/queries/`.
- Validate external data before inserting (see `isValidCandle`); one bad row or
  one failing ticker must not abort a batch.
- The original project brief is at
  `C:\Users\Samar\OneDrive - vit.ac.in\VIT\DBMS\handoff.txt`; the approved plan
  is summarised above.
