import { query } from '../db.js';

// Stocks matching the given symbols, with what was observed for each inside
// the date range: detected events, and the average sentiment of the analysed
// articles published in it (from/to are whole UTC days, as in queries/news.js).
export async function getComparedStocks(symbols, from, to) {
  const { rows } = await query(
    `SELECT s.stock_id, s.symbol, s.company_name,
            (SELECT count(*)::int
             FROM news_price_event e
             WHERE e.stock_id = s.stock_id
               AND ($2::date IS NULL OR e.event_date >= $2::date)
               AND ($3::date IS NULL OR e.event_date <= $3::date)) AS event_count,
            sent.avg_sentiment, sent.analysed_count, sent.article_count
     FROM stock s
     LEFT JOIN LATERAL (
         SELECT round(avg(la.sentiment_score), 3) AS avg_sentiment,
                count(la.article_id)::int         AS analysed_count,
                count(*)::int                     AS article_count
         FROM stock_article sa
         JOIN news_article a USING (article_id)
         LEFT JOIN v_latest_analysis la USING (article_id)
         WHERE sa.stock_id = s.stock_id
           AND ($2::date IS NULL OR a.published_at >= $2::date::timestamp AT TIME ZONE 'UTC')
           AND ($3::date IS NULL OR a.published_at < ($3::date + 1)::timestamp AT TIME ZONE 'UTC')
     ) sent ON true
     WHERE s.symbol = ANY($1)`,
    [symbols, from, to],
  );
  return rows;
}

// Each stock's close and its % change from the first trading day in the
// range, so stocks at very different prices share one scale.
export async function getComparisonSeries(stockIds, from, to) {
  const { rows } = await query(
    `SELECT p.stock_id,
            p.period_start AS time,
            p.close,
            round((p.close / FIRST_VALUE(p.close) OVER first_in_range - 1) * 100, 2) AS change_pct
     FROM price_history p
     WHERE p.stock_id = ANY($1) AND p.timeframe = '1d'
       AND ($2::date IS NULL OR p.period_start >= $2::date)
       AND ($3::date IS NULL OR p.period_start <= $3::date)
     WINDOW first_in_range AS (PARTITION BY p.stock_id ORDER BY p.period_start)
     ORDER BY p.stock_id, p.period_start`,
    [stockIds, from, to],
  );
  return rows;
}
