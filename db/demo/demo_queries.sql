-- Informed Trades: queries to run live in pgAdmin (database: informed_trades).
-- Select ONE query (from its "-- Q" line to the semicolon) and press F5.
-- Nothing here changes stored data: the write demos roll themselves back.

-- Q1  Row counts: how much data the project holds
SELECT 'stocks' AS item, count(*) FROM stock
UNION ALL SELECT 'daily candles', count(*) FROM price_history
UNION ALL SELECT 'news articles', count(*) FROM news_article
UNION ALL SELECT 'stock-article links', count(*) FROM stock_article
UNION ALL SELECT 'sentiment analyses', count(*) FROM article_analysis
UNION ALL SELECT 'detected events', count(*) FROM news_price_event;

-- Q2  JOIN across four tables: latest Apple news with its sentiment
--     LEFT JOIN keeps articles that have not been analysed.
SELECT a.published_at, a.source, la.sentiment, la.sentiment_score, a.title
FROM stock s
JOIN stock_article sa USING (stock_id)
JOIN news_article a USING (article_id)
LEFT JOIN v_latest_analysis la USING (article_id)
WHERE s.symbol = 'AAPL'
ORDER BY a.published_at DESC
LIMIT 15;

-- Q3  Many-to-many: articles that mention the most stocks
SELECT a.title, count(*) AS stocks_mentioned, string_agg(s.symbol, ', ' ORDER BY s.symbol) AS symbols
FROM stock_article sa
JOIN news_article a USING (article_id)
JOIN stock s USING (stock_id)
GROUP BY a.article_id, a.title
HAVING count(*) >= 4
ORDER BY stocks_mentioned DESC
LIMIT 10;

-- Q4  GROUP BY with conditional aggregation: sentiment mix per stock
SELECT s.symbol,
       count(*)                                           AS analysed,
       count(*) FILTER (WHERE la.sentiment = 'positive')  AS positive,
       count(*) FILTER (WHERE la.sentiment = 'neutral')   AS neutral,
       count(*) FILTER (WHERE la.sentiment = 'negative')  AS negative,
       round(avg(la.sentiment_score), 3)                  AS avg_score
FROM stock s
JOIN stock_article sa USING (stock_id)
JOIN v_latest_analysis la USING (article_id)
GROUP BY s.symbol
ORDER BY avg_score DESC;

-- Q5  Window function LAG: daily return from the previous close
SELECT period_start, close,
       LAG(close) OVER (ORDER BY period_start) AS prev_close,
       round((close / LAG(close) OVER (ORDER BY period_start) - 1) * 100, 2) AS return_pct
FROM price_history
WHERE stock_id = (SELECT stock_id FROM stock WHERE symbol = 'NVDA')
ORDER BY period_start DESC
LIMIT 10;

-- Q6  Rolling window: each day against the stock's previous 20 trading days
SELECT period_start,
       round(daily_return * 100, 2)   AS return_pct,
       round(volatility_20d * 100, 2) AS usual_move_pct,
       round(return_zscore, 2)        AS times_usual_move,
       news_count,
       round(baseline_news_avg, 1)    AS usual_news
FROM v_stock_daily_metrics
WHERE stock_id = (SELECT stock_id FROM stock WHERE symbol = 'META')
ORDER BY period_start DESC
LIMIT 15;

-- Q7  Ranking with a CTE: the three biggest daily moves of each stock
WITH ranked AS (
    SELECT s.symbol, r.period_start, round(r.daily_return * 100, 2) AS return_pct,
           rank() OVER (PARTITION BY r.stock_id ORDER BY abs(r.daily_return) DESC) AS rnk
    FROM v_daily_returns r
    JOIN stock s USING (stock_id)
    WHERE r.daily_return IS NOT NULL
)
SELECT symbol, period_start, return_pct
FROM ranked
WHERE rnk <= 3
ORDER BY symbol, rnk;

-- Q8  View: detected events with the explanation sentence built in SQL
SELECT symbol, event_date, price_change_pct, news_count, news_multiple, severity, explanation
FROM v_event_summary
ORDER BY event_date DESC;

-- Q9  Junction table in use: the articles counted toward one event
SELECT a.published_at, la.sentiment, a.title
FROM event_article ea
JOIN news_article a USING (article_id)
LEFT JOIN v_latest_analysis la USING (article_id)
WHERE ea.event_id = (SELECT event_id FROM news_price_event ORDER BY abs(price_change_pct) DESC LIMIT 1)
ORDER BY a.published_at
LIMIT 20;

-- Q10 Function: which trading day does an article count toward?
--     Friday 2 Oct 2026, New York time: before the close vs after the close.
SELECT trading_day_for(stock_id, TIMESTAMPTZ '2026-10-02 11:00 America/New_York') AS published_11am,
       trading_day_for(stock_id, TIMESTAMPTZ '2026-10-02 18:00 America/New_York') AS published_6pm,
       trading_day_for(stock_id, TIMESTAMPTZ '2026-10-03 14:00 America/New_York') AS published_saturday
FROM stock
WHERE symbol = 'AAPL';

-- Q11 Stored function with parameters: stricter thresholds find fewer events.
--     Runs inside a transaction and rolls back, so stored events are untouched.
BEGIN;
SELECT detect_events()                      AS default_rule_2x_news,
       detect_events(p_news_multiple => 3)  AS stricter_rule_3x_news;
ROLLBACK;

-- Q12 Per-stock summary view (CTE + FILTER + CASE)
SELECT s.symbol, g.sentiment_label, g.sentiment_avg, g.sentiment_trend,
       g.sentiment_analysed || ' of ' || g.sentiment_articles AS coverage,
       g.return_5d_pct, g.return_20d_pct, g.news_activity_ratio, g.latest_event_date
FROM v_stock_signal g
JOIN stock s USING (stock_id)
ORDER BY s.symbol;

-- Q13 Full-text search with ranking (uses the GIN index on search_vector)
SELECT ts_rank(search_vector, q) AS rank, published_at::date, title
FROM news_article, websearch_to_tsquery('english', 'earnings guidance cut') AS q
WHERE search_vector @@ q
ORDER BY rank DESC
LIMIT 10;

-- Q14 Index in action: read the plan and point at "Bitmap Index Scan"
EXPLAIN ANALYZE
SELECT title FROM news_article
WHERE search_vector @@ websearch_to_tsquery('english', 'antitrust lawsuit');

-- Q15 JSONB: read fields from the model's stored raw reply
SELECT model,
       count(*) AS analyses,
       round(avg((raw_response -> 'usage' ->> 'totalTokenCount')::numeric)) AS avg_tokens_per_batch,
       round(avg((raw_response ->> 'eval_count')::numeric))                 AS avg_tokens_generated_ollama
FROM article_analysis
GROUP BY model
ORDER BY analyses DESC;

-- Q16 Subquery with NOT EXISTS: articles still waiting for analysis, per stock
SELECT s.symbol, count(*) AS not_analysed
FROM stock s
JOIN stock_article sa USING (stock_id)
WHERE NOT EXISTS (SELECT 1 FROM article_analysis x WHERE x.article_id = sa.article_id)
GROUP BY s.symbol
ORDER BY not_analysed DESC;

-- Q17 CHECK constraint: this insert MUST FAIL (high is below close)
INSERT INTO price_history (stock_id, period_start, open, high, low, close, volume)
SELECT stock_id, DATE '2030-01-01', 100, 101, 99, 105, 1000 FROM stock WHERE symbol = 'AAPL';

-- Q18 Primary key: this insert MUST FAIL (a candle for that day already exists)
INSERT INTO price_history (stock_id, period_start, open, high, low, close, volume)
SELECT stock_id, period_start, open, high, low, close, volume
FROM price_history ORDER BY period_start DESC LIMIT 1;

-- Q19 Foreign key: this insert MUST FAIL (no such stock)
INSERT INTO price_history (stock_id, period_start, open, high, low, close, volume)
VALUES (-1, DATE '2030-01-01', 100, 101, 99, 100, 1000);

-- Q20 Transaction + cascade: delete a stock, see its rows go, then undo it all.
--     Run the whole block together.
BEGIN;
SELECT 'before' AS stage, (SELECT count(*) FROM price_history) AS candles, (SELECT count(*) FROM news_price_event) AS events;
DELETE FROM stock WHERE symbol = 'DIS';
SELECT 'after delete' AS stage, (SELECT count(*) FROM price_history) AS candles, (SELECT count(*) FROM news_price_event) AS events;
ROLLBACK;
SELECT 'after rollback' AS stage, (SELECT count(*) FROM price_history) AS candles, (SELECT count(*) FROM news_price_event) AS events;

-- Q21 Upsert: inserting an existing candle updates it instead of duplicating.
--     Rolled back, so the real candle is unchanged.
BEGIN;
INSERT INTO price_history (stock_id, timeframe, period_start, open, high, low, close, volume)
SELECT stock_id, timeframe, period_start, open, high, low, close, 1
FROM price_history ORDER BY period_start DESC LIMIT 1
ON CONFLICT (stock_id, timeframe, period_start) DO UPDATE SET volume = EXCLUDED.volume
RETURNING stock_id, period_start, volume AS volume_now_1;
ROLLBACK;

-- Q22 Trigger: inserting an event creates alerts by itself.
--     This block never inserts into alert; trg_event_alert does. AAPL is on the
--     demo watchlist and AMD is not, so only the AAPL event produces an alert.
--     Run the whole block together; it rolls back.
BEGIN;
INSERT INTO news_price_event (stock_id, event_date, price_change_pct, news_count, baseline_news_avg, direction, severity)
SELECT stock_id, DATE '2030-01-01', 5.0, 10, 2, 'up', 'medium'
FROM stock WHERE symbol IN ('AAPL', 'AMD');
SELECT s.symbol, e.event_date, u.name AS alerted_user, a.created_at, a.read_at
FROM news_price_event e
JOIN stock s USING (stock_id)
LEFT JOIN alert a USING (event_id)
LEFT JOIN app_user u USING (user_id)
WHERE e.event_date = DATE '2030-01-01'
ORDER BY s.symbol;
ROLLBACK;

-- Q23 What the trigger has written so far: the demo user's alerts
SELECT a.alert_id, e.symbol, e.event_date, e.severity,
       CASE WHEN a.read_at IS NULL THEN 'unread' ELSE 'read' END AS status,
       e.explanation
FROM alert a
JOIN v_event_summary e USING (event_id)
ORDER BY e.event_date DESC;
