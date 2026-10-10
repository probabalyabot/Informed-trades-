-- Per-stock "at a glance" signal. One row per stock, derived on demand from
-- v_stock_daily_metrics; nothing is stored.
--
-- Everything here DESCRIBES recent data: how analysed news has read, how the
-- price has moved, and how busy the news flow is compared with usual. It is
-- not a forecast and carries no buy / sell meaning.
--
-- "Days" are trading days counted back from each stock's own latest candle
-- (days_back = 1 is the latest), so the view never depends on the wall clock.
--   recent window   : days_back 1-5
--   previous window : days_back 6-10   (for the sentiment trend)
--   news baseline   : days_back 6-25   (the 20 days before the recent window)
--
-- A sentiment average over one or two articles says very little, so the label
-- and the trend are only given when each window they rest on has at least 5
-- analysed articles. The raw averages and counts are always returned so the
-- caller can show exactly how thin the coverage is.
CREATE VIEW v_stock_signal AS
WITH ranked AS (
    SELECT m.stock_id, m.period_start, m.close, m.news_count,
           m.avg_sentiment, m.analysed_count,
           row_number() OVER (PARTITION BY m.stock_id ORDER BY m.period_start DESC) AS days_back
    FROM v_stock_daily_metrics m
),
windows AS (
    SELECT stock_id,
           max(period_start)                                   AS as_of,
           max(close) FILTER (WHERE days_back = 1)             AS close_now,
           max(close) FILTER (WHERE days_back = 6)             AS close_5d_ago,
           max(close) FILTER (WHERE days_back = 21)            AS close_20d_ago,
           -- Weighted by article, not by day: a day with 40 analysed articles
           -- counts for more than a day with 2.
           sum(avg_sentiment * analysed_count) FILTER (WHERE days_back <= 5)
               / NULLIF(sum(analysed_count) FILTER (WHERE days_back <= 5), 0)
                                                                AS sentiment_avg,
           sum(avg_sentiment * analysed_count) FILTER (WHERE days_back BETWEEN 6 AND 10)
               / NULLIF(sum(analysed_count) FILTER (WHERE days_back BETWEEN 6 AND 10), 0)
                                                                AS sentiment_prev,
           COALESCE(sum(analysed_count) FILTER (WHERE days_back <= 5), 0) AS sentiment_analysed,
           COALESCE(sum(analysed_count) FILTER (WHERE days_back BETWEEN 6 AND 10), 0)
                                                                AS sentiment_prev_analysed,
           COALESCE(sum(news_count)     FILTER (WHERE days_back <= 5), 0) AS sentiment_articles,
           avg(news_count) FILTER (WHERE days_back <= 5)                  AS news_recent_avg,
           avg(news_count) FILTER (WHERE days_back BETWEEN 6 AND 25)      AS news_baseline_avg
    FROM ranked
    WHERE days_back <= 25
    GROUP BY stock_id
)
SELECT w.stock_id,
       w.as_of,
       round(w.sentiment_avg, 3)                      AS sentiment_avg,
       round(w.sentiment_prev, 3)                     AS sentiment_prev,
       CASE WHEN w.sentiment_analysed < 5 THEN NULL
            WHEN w.sentiment_avg >  0.15  THEN 'positive'
            WHEN w.sentiment_avg < -0.15  THEN 'negative'
            ELSE 'mixed' END                          AS sentiment_label,
       CASE WHEN w.sentiment_analysed < 5 OR w.sentiment_prev_analysed < 5 THEN NULL
            WHEN w.sentiment_avg - w.sentiment_prev >  0.1 THEN 'rising'
            WHEN w.sentiment_avg - w.sentiment_prev < -0.1 THEN 'falling'
            ELSE 'steady' END                         AS sentiment_trend,
       -- Coverage: how many of the window's articles the average rests on.
       w.sentiment_analysed::integer                  AS sentiment_analysed,
       w.sentiment_articles::integer                  AS sentiment_articles,
       round((w.close_now / w.close_5d_ago  - 1) * 100, 2) AS return_5d_pct,
       round((w.close_now / w.close_20d_ago - 1) * 100, 2) AS return_20d_pct,
       round(w.news_recent_avg, 1)                    AS news_recent_avg,
       round(w.news_baseline_avg, 1)                  AS news_baseline_avg,
       round(w.news_recent_avg / NULLIF(w.news_baseline_avg, 0), 2) AS news_activity_ratio,
       e.event_id                                     AS latest_event_id,
       e.event_date                                   AS latest_event_date,
       e.direction                                    AS latest_event_direction,
       e.severity                                     AS latest_event_severity
FROM windows w
LEFT JOIN LATERAL (
    SELECT event_id, event_date, direction, severity
    FROM news_price_event
    WHERE stock_id = w.stock_id
    ORDER BY event_date DESC
    LIMIT 1
) e ON true;
