import { query } from '../db.js';
import { QUOTE_COLUMNS, QUOTE_JOIN } from './stocks.js';

// Every stock with its quote, its last 30 closes (for a sparkline) and its
// row from v_stock_signal as a nested object. One query for the home page.
export async function getStocksOverview() {
  const { rows } = await query(
    `SELECT ${QUOTE_COLUMNS},
            sp.sparkline,
            to_jsonb(g) - 'stock_id' AS signal
     FROM stock s
     ${QUOTE_JOIN}
     LEFT JOIN LATERAL (
         SELECT array_agg(recent.close::float8 ORDER BY recent.period_start) AS sparkline
         FROM (
             SELECT period_start, close
             FROM price_history
             WHERE stock_id = s.stock_id AND timeframe = '1d'
             ORDER BY period_start DESC
             LIMIT 30
         ) recent
     ) sp ON true
     LEFT JOIN v_stock_signal g ON g.stock_id = s.stock_id
     ORDER BY s.symbol`,
  );
  return rows;
}

export async function getStockSignal(stockId) {
  const { rows } = await query(
    `SELECT to_jsonb(g) - 'stock_id' AS signal FROM v_stock_signal g WHERE g.stock_id = $1`,
    [stockId],
  );
  return rows[0]?.signal ?? null;
}

// One row per trading day: average sentiment of that day's analysed articles
// (NULL when none were analysed) with the counts it rests on.
export async function getDailySentiment(stockId, from, to) {
  const { rows } = await query(
    `SELECT period_start AS time,
            round(avg_sentiment, 3) AS avg_sentiment,
            analysed_count,
            news_count
     FROM v_stock_daily_metrics
     WHERE stock_id = $1
       AND ($2::date IS NULL OR period_start >= $2::date)
       AND ($3::date IS NULL OR period_start <= $3::date)
     ORDER BY period_start`,
    [stockId, from, to],
  );
  return rows;
}
