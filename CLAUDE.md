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
- **Indicators are descriptive, never advice.** Show sentiment, price trend and
  news activity; no buy / sell / hold wording. The user asked for a "worth
  buying" indicator on 2026-10-08 and, when shown the conflict with the brief,
  chose the descriptive version.
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
| `npm run analyze -- [--limit=500] [--concurrency=1]` | Ollama sentiment for unanalysed articles; resumable |
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
- Sentiment pipeline. **Analysis is paused** (2026-10-08, at the user's
  request: they need the GPU for other work). Nothing is running and the
  model is unloaded from the GPU. **Do not restart analysis without asking
  the user first.** State when paused: 2,121 articles analysed by
  `llama3.1:8b`, all of them event-day articles, out of 3,264 distinct
  event-day articles (1,143 left), and ~33k articles overall. To resume:
  `node src/scripts/analyze.js --limit=1200` from `server/` finishes the
  event-day articles (about 20 minutes), then `npm run detect` so events pick
  up their average sentiment. Check coverage with
  `SELECT model, count(*) FROM article_analysis GROUP BY 1;`. (13 early rows from `qwen2.5-coder:7b` are
  a pipeline trial and a small real example of the 1:N analysis design.)
- Sentiment speed: `num_ctx` is 1024 in `providers/ollama.js`, which keeps the
  model 100% on the 8 GB GPU at about 1 article per second (was 1.8 s each at
  the 4096 default). Parallel slots (`OLLAMA_NUM_PARALLEL` 2 and 4) were
  measured and gave no gain because the extra context spills to CPU, so
  `--concurrency` defaults to 1. The whole ~33k backlog would take ~9 hours.
- Event detection: 27 events across 11 stocks.
- API: `GET /api/stocks[?q=]`, `/api/stocks/:symbol`, `/:symbol/prices`,
  `/:symbol/news`, `/:symbol/events`, `GET /api/events/:id`.
- UI: stock list, search, stock page with candlestick + volume chart, range
  buttons, event timeline, news feed with sentiment badges; selecting an
  event shows that day's articles.
- Tests: 14 passing (9 API, 5 detection).

Not yet confirmed: the event arrow markers on the chart were never checked
visually (preview screenshots timed out). The `.vscode` start task
(Ctrl+Shift+B) was written but not executed.

Operational lesson: stopping a background `npm run analyze` can leave its Node
child running. Before starting another run, check for stray processes whose
command line contains `analyze.js` and stop them. Two runs using different
context sizes make Ollama reload the model on every request (about 8 s per
article). Launch long runs as `node src/scripts/analyze.js ...` directly.

## On hold - resume next session

Agreed with the user on 2026-10-08 and deliberately not started. Pick up in
this order. The full write-up of item 1 is in the session plan file
(`~/.claude/plans/c-users-samar-onedrive-vit-ac-in-vit-db-sprightly-star.md`);
this section is self-sufficient if that file is gone.

### 1. Front-end redesign (next thing to do)

User feedback: the front end is unclear, specifically the **sentiment
display**, the **events section** and the **home page** (overall layout was
not flagged). They want a clearer sentiment value with an at-a-glance
indicator (descriptive, see Hard rules), mini charts on the home page, and a
compare-stocks view.

Design principles from the research done (IBM Carbon dashboards, PatternFly
and Genesys sparkline guidance, the Hawk Eye and Contextifier projects):

- Most important information first and largest; detail on demand.
- Sparklines have no axes and always sit beside a label and a number; no zero
  baseline for prices.
- One meaning per colour. Green/red mean price up/down, so **sentiment gets
  its own pair: blue = positive, orange = negative**, always with a label and
  sign, never colour alone.
- Sentiment goes in its own lane under the price chart on the same time axis,
  aggregated per day. No dual-axis overlay.
- Every sentiment figure states its window and coverage, e.g. "based on 38 of
  240 articles, last 5 trading days", because it is a model's estimate over a
  sample.

Steps:

1. **Mockup first.** Show the redesigned home and stock pages to the user for
   approval before writing project code.
2. **SQL + API.** New migration `005_signals.sql` with `v_stock_signal` (one
   row per stock: 5-day average sentiment, the previous 5 days, a label and
   trend via `CASE`, analysed/total article counts, 5- and 20-day return, news
   activity vs the 20-day baseline, latest event). Endpoints: add signal
   fields and a 30-close `sparkline` array to `GET /api/stocks`; signal fields
   on `GET /api/stocks/:symbol`; new `GET /api/stocks/:symbol/sentiment`
   (daily series from `v_stock_daily_metrics`); new
   `GET /api/compare?symbols=A,B&from=` (max 4, % change from the first day
   using `FIRST_VALUE(close) OVER (...)`).
3. **Front end.**
   - Shared: `SentimentGauge.jsx` (-1..+1 scale with marker, label, signed
     value, trend arrow, coverage line), `Sparkline.jsx` (inline SVG), a
     larger `SentimentBadge`.
   - Home: "recent events" strip; stock table with sparkline, change, compact
     gauge, news activity and event flag; sortable; pick up to 4 to compare.
     This replaces the dashboard that was planned for phase 6.
   - Stock page: "at a glance" strip (news sentiment, price trend, news
     activity) with a one-line "descriptive, not advice" note; a daily
     sentiment bar lane as its own pane in `CandleChart.jsx`; OHLC readout on
     hover; events as scannable rows with aligned columns and the explanation
     shown only when a row is selected; news feed with sentiment filter tabs
     (the API already supports `?sentiment=`).
   - Compare page at `/compare?symbols=`.
   - Load the `dataviz` skill before writing chart code.
4. **Coverage prerequisite.** The gauge and lane need analysed articles on
   every stock-day, not just event days. `analyze.js` already orders by even
   coverage per stock-day; keep running it until recent stock-days have about
   5 analysed articles each (roughly 4,000 more articles, a bit over an hour).

Budget: about 3-4 days. If time runs short, drop the compare page first.

### 2. One-time Gemini backfill (deferred future fix)

Purpose: clear the historical sentiment backlog quickly, then remove Gemini
completely. Ollama stays the only permanent analyser; day to day only about
350-400 new articles arrive, which Ollama handles in 6-7 minutes.

- A temporary standalone script (`server/src/scripts/backfillGemini.js`), not
  wired into `config.js`, `.env.example`, `smoke.js` or the tests.
- The binding free-tier limit is requests per day, so it sends ~40 articles
  per request and receives a JSON array (structured output), using the same
  system prompt as Ollama (export `SYSTEM_PROMPT` and `SENTIMENTS` from
  `providers/ollama.js`). Key goes in the `x-goog-api-key` header.
- Validate every returned item; skip invalid or missing ones so they stay
  pending. One multi-row insert per batch. Rows are tagged with the Gemini
  model name, which permanently records how they were produced.
- Wait and retry on a per-minute 429; stop cleanly on a daily-quota 429.
- Permanent change needed alongside it: `analyze.js` should treat an article
  as pending only if **no model** has analysed it (today it is per model, so
  Ollama would redo Gemini's work), with a `--reanalyse` flag for the old
  behaviour. The `--concurrency` flag can be removed at the same time.
- Afterwards delete the script and the `GEMINI_API_KEY` line from `.env`.
- Blocked on the user: a free key from aistudio.google.com/apikey and the real
  requests-per-day / per-minute numbers shown in their AI Studio project.
  Google does not publish fixed free-tier limits and third-party figures
  conflict (roughly 20/day for Flash, 500-1,000/day for Flash-Lite). Free-tier
  content is used to improve Google's products; acceptable for public headlines.

### 3. On/off control for intake and analysis (asked 2026-10-08, undecided)

The user asked for a way to toggle news intake and Ollama analysis on and off.
Nothing runs automatically today (both are manual scripts), so what is missing
is a clean switch. Three options were offered and the user has not chosen yet:

1. Start/stop commands plus VS Code tasks, with a graceful stop that lets the
   current article finish (recommended; also prevents stray processes).
2. A settings table with `analysis_enabled` / `ingestion_enabled` flags that
   the scripts check while running (adds a 12th table).
3. Toggle switches and a progress readout on the website, built on option 2;
   the API would have to start and stop background jobs (about a day).

Ask which one they want before building.

### 4. Similar past incidents (later)

For an event, describe how the same stock moved after its earlier events of
the same direction (e.g. the following 1 and 5 trading days), from a
`v_event_outcomes` view built with `LEAD()`. Descriptive only, with a
small-sample caveat. Needs more history first: only about 54 trading days per
stock are detectable with 90 days of news (`ingest:news --days=180 --full`).

## Remaining plan

The front-end redesign above now comes first and absorbs the dashboard part of
phase 6. The rest is unchanged.

**Phase 6 - Watchlists and dashboard**
- `middleware/currentUser.js` (demo user by email).
- Watchlist CRUD: `GET/POST /api/watchlists`, `DELETE /api/watchlists/:id`,
  `POST /api/watchlists/:id/stocks`, `DELETE /api/watchlists/:id/stocks/:symbol`.
- `v_trending` view: last 5 trading days per stock with each reason exposed as
  its own column (|return|, news vs baseline, event count) so the UI can show
  *why* a stock ranks.
- Add `pages/Watchlists.jsx`, an add-to-watchlist button on the stock page, and
  a watchlist filter on the redesigned home page. (`pages/Dashboard.jsx` is
  currently a plain stock list; the redesign rebuilds it. `v_trending` may be
  unnecessary once `v_stock_signal` exists: decide then.)

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

**If time runs short, cut in this order:** the compare page, alerts UI (keep
the trigger), then trending. Never cut the demo SQL file or the trigger.

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
