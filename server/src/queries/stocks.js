import { query } from '../db.js';

// Each stock with its latest close and the change from the previous close.
// LAG() runs over the stock's whole history before LIMIT keeps the newest row.
const STOCK_WITH_QUOTE = `
  SELECT s.stock_id, s.symbol, s.company_name, s.exchange, s.sector,
         q.period_start AS last_date,
         q.close        AS last_close,
         q.prev_close,
         round((q.close / q.prev_close - 1) * 100, 2) AS change_pct
  FROM stock s
  LEFT JOIN LATERAL (
      SELECT p.period_start, p.close,
             LAG(p.close) OVER (ORDER BY p.period_start) AS prev_close
      FROM price_history p
      WHERE p.stock_id = s.stock_id AND p.timeframe = '1d'
      ORDER BY p.period_start DESC
      LIMIT 1
  ) q ON true`;

export async function searchStocks(q) {
  const { rows } = await query(
    `${STOCK_WITH_QUOTE}
     WHERE $1 = '' OR s.symbol ILIKE $1 || '%' OR s.company_name ILIKE '%' || $1 || '%'
     ORDER BY (s.symbol = upper($1)) DESC, s.symbol
     LIMIT 50`,
    [q],
  );
  return rows;
}

export async function getStock(symbol) {
  const { rows } = await query(`${STOCK_WITH_QUOTE} WHERE s.symbol = $1`, [symbol]);
  return rows[0];
}

// Raw OHLCV rows; the client renders them as candlesticks.
export async function getPrices(stockId, from, to) {
  const { rows } = await query(
    `SELECT period_start AS time, open, high, low, close, volume
     FROM price_history
     WHERE stock_id = $1 AND timeframe = '1d'
       AND ($2::date IS NULL OR period_start >= $2::date)
       AND ($3::date IS NULL OR period_start <= $3::date)
     ORDER BY period_start`,
    [stockId, from, to],
  );
  return rows;
}
