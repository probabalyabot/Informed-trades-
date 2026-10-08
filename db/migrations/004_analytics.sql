-- Analytics layer. Nothing here is stored: returns, volatility, news volume
-- and sentiment averages are all derived from the raw tables on demand.
-- Only detect_events() writes, and only to news_price_event / event_article.

-- The trading day an article counts toward for a given stock.
-- News published after the 16:00 New York close, or on a weekend or holiday,
-- cannot coincide with that day's candle, so it rolls forward to the next
-- trading day. Adding 8 hours moves 16:00 to midnight, which turns
-- "after the close" into "the next calendar date".
-- Returns NULL when no candle exists yet for that day.
CREATE FUNCTION trading_day_for(p_stock_id BIGINT, p_published_at TIMESTAMPTZ)
RETURNS DATE
LANGUAGE sql STABLE AS $$
    SELECT min(period_start)
    FROM price_history
    WHERE stock_id = p_stock_id
      AND timeframe = '1d'
      AND period_start >= ((p_published_at AT TIME ZONE 'America/New_York') + INTERVAL '8 hours')::date
$$;

-- Daily close-to-close return per stock.
CREATE VIEW v_daily_returns AS
SELECT stock_id, period_start, close,
       LAG(close) OVER w AS prev_close,
       close / LAG(close) OVER w - 1 AS daily_return
FROM price_history
WHERE timeframe = '1d'
WINDOW w AS (PARTITION BY stock_id ORDER BY period_start);

-- News volume and average sentiment per stock per trading day.
CREATE VIEW v_stock_daily_news AS
SELECT stock_id, trading_day,
       count(*)                    AS news_count,
       count(sentiment_score)      AS analysed_count,
       avg(sentiment_score)        AS avg_sentiment
FROM (
    SELECT sa.stock_id,
           trading_day_for(sa.stock_id, a.published_at) AS trading_day,
           la.sentiment_score
    FROM stock_article sa
    JOIN news_article a USING (article_id)
    LEFT JOIN v_latest_analysis la USING (article_id)
) linked
WHERE trading_day IS NOT NULL
GROUP BY stock_id, trading_day;

-- One row per stock per trading day with every signal used for detection.
-- The 20-day windows end on the previous day, so a day is always compared
-- with the behaviour that preceded it, never with itself.
-- News baselines only use days on or after the stock's first stored article;
-- baseline_days says how many such days the baseline rests on.
CREATE VIEW v_stock_daily_metrics AS
SELECT stock_id, period_start, close, daily_return,
       volatility_20d,
       daily_return / NULLIF(volatility_20d, 0) AS return_zscore,
       news_count, baseline_news_avg, baseline_days,
       avg_sentiment, analysed_count
FROM (
    SELECT r.stock_id, r.period_start, r.close, r.daily_return,
           STDDEV_SAMP(r.daily_return) OVER prior_20         AS volatility_20d,
           COALESCE(n.news_count, 0)                          AS news_count,
           AVG(COALESCE(n.news_count, 0))
               FILTER (WHERE r.period_start >= f.first_day) OVER prior_20 AS baseline_news_avg,
           COUNT(*)
               FILTER (WHERE r.period_start >= f.first_day) OVER prior_20 AS baseline_days,
           n.avg_sentiment,
           COALESCE(n.analysed_count, 0)                      AS analysed_count
    FROM v_daily_returns r
    LEFT JOIN v_stock_daily_news n
           ON n.stock_id = r.stock_id AND n.trading_day = r.period_start
    LEFT JOIN (
        SELECT stock_id, min(trading_day) AS first_day
        FROM v_stock_daily_news
        GROUP BY stock_id
    ) f ON f.stock_id = r.stock_id
    WINDOW prior_20 AS (
        PARTITION BY r.stock_id ORDER BY r.period_start
        ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING
    )
) m;

-- Finds stock-days where an unusual price move occurred alongside unusual
-- news volume and records them. A day qualifies when BOTH hold:
--   price: |return| >= p_min_abs_return  OR  |return / 20-day volatility| >= p_min_z
--   news:  news_count >= p_min_news      AND news_count >= p_news_multiple x 20-day average
-- Sentiment is recorded to describe the event; it is never a condition.
-- The current New York date is skipped because its candle and news are
-- still incomplete. Re-running updates existing events instead of
-- duplicating them. Returns the number of events inserted or updated.
CREATE FUNCTION detect_events(
    p_stock_id          BIGINT  DEFAULT NULL,   -- NULL = every stock
    p_min_abs_return    NUMERIC DEFAULT 0.03,
    p_min_z             NUMERIC DEFAULT 2,
    p_min_news          INTEGER DEFAULT 3,
    p_news_multiple     NUMERIC DEFAULT 2,
    p_min_baseline_days INTEGER DEFAULT 10
)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_events INTEGER;
BEGIN
    WITH upserted AS (
        INSERT INTO news_price_event
            (stock_id, event_date, price_change_pct, return_zscore, news_count,
             baseline_news_avg, avg_sentiment, direction, severity)
        SELECT m.stock_id,
               m.period_start,
               round(m.daily_return * 100, 4),
               round(m.return_zscore, 3),
               m.news_count,
               round(m.baseline_news_avg, 3),
               round(m.avg_sentiment, 3),
               CASE WHEN m.daily_return >= 0 THEN 'up' ELSE 'down' END,
               CASE WHEN abs(m.return_zscore) >= 3.5 THEN 'high'
                    WHEN abs(m.return_zscore) >= 2.5 THEN 'medium'
                    ELSE 'low' END
        FROM v_stock_daily_metrics m
        WHERE (p_stock_id IS NULL OR m.stock_id = p_stock_id)
          AND m.period_start < (now() AT TIME ZONE 'America/New_York')::date
          AND m.baseline_days >= p_min_baseline_days
          AND (abs(m.daily_return) >= p_min_abs_return OR abs(m.return_zscore) >= p_min_z)
          AND m.news_count >= p_min_news
          AND m.news_count >= p_news_multiple * m.baseline_news_avg
        ON CONFLICT (stock_id, event_date) DO UPDATE
            SET price_change_pct  = EXCLUDED.price_change_pct,
                return_zscore     = EXCLUDED.return_zscore,
                news_count        = EXCLUDED.news_count,
                baseline_news_avg = EXCLUDED.baseline_news_avg,
                avg_sentiment     = EXCLUDED.avg_sentiment,
                direction         = EXCLUDED.direction,
                severity          = EXCLUDED.severity,
                detected_at       = now()
        RETURNING 1
    )
    SELECT count(*) INTO v_events FROM upserted;

    -- Attach the articles that count toward each event's trading day.
    INSERT INTO event_article (event_id, article_id)
    SELECT e.event_id, sa.article_id
    FROM news_price_event e
    JOIN stock_article sa USING (stock_id)
    JOIN news_article a USING (article_id)
    WHERE (p_stock_id IS NULL OR e.stock_id = p_stock_id)
      AND trading_day_for(sa.stock_id, a.published_at) = e.event_date
    ON CONFLICT DO NOTHING;

    RETURN v_events;
END $$;

-- Events with their stock and a plain-language description of what was
-- observed. The wording reports co-occurrence only.
CREATE VIEW v_event_summary AS
SELECT e.event_id, e.stock_id, s.symbol, s.company_name, e.event_date,
       e.price_change_pct, e.return_zscore, e.news_count, e.baseline_news_avg,
       round(e.news_count / NULLIF(e.baseline_news_avg, 0), 1) AS news_multiple,
       e.avg_sentiment, e.direction, e.severity, e.detected_at,
       format('%s closed %s%% %s',
              s.symbol,
              to_char(abs(e.price_change_pct), 'FM990.00'),
              CASE e.direction WHEN 'up' THEN 'higher' ELSE 'lower' END)
       || COALESCE(format(', %s times its typical daily move',
                          to_char(abs(e.return_zscore), 'FM990.0')), '')
       || format('. This occurred alongside %s news articles', e.news_count)
       || COALESCE(format(', %s times the recent daily average of %s',
                          to_char(e.news_count / NULLIF(e.baseline_news_avg, 0), 'FM9990.0'),
                          to_char(e.baseline_news_avg, 'FM9990.0')), '')
       || '.'
       || CASE
              WHEN e.avg_sentiment IS NULL THEN ''
              ELSE format(' Analysed articles that day were %s on average (%s).',
                          CASE WHEN e.avg_sentiment >  0.15 THEN 'positive'
                               WHEN e.avg_sentiment < -0.15 THEN 'negative'
                               ELSE 'mixed' END,
                          to_char(e.avg_sentiment, 'SG0.00'))
          END AS explanation
FROM news_price_event e
JOIN stock s USING (stock_id);
