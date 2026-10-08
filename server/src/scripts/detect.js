// Runs event detection in the database.
// Usage: npm run detect -- [SYMBOL ...]     (no symbols = every stock)
// All of the logic lives in the detect_events() SQL function; see
// db/migrations/004_analytics.sql for the rule and its thresholds.
import { pool } from '../db.js';

const symbols = process.argv.slice(2).map((s) => s.toUpperCase());

async function main() {
  if (symbols.length === 0) {
    const { rows } = await pool.query('SELECT detect_events() AS events');
    console.log(`all stocks: ${rows[0].events} events`);
  }
  for (const symbol of symbols) {
    const { rows } = await pool.query(
      'SELECT detect_events(stock_id) AS events FROM stock WHERE symbol = $1',
      [symbol],
    );
    console.log(rows.length ? `${symbol}: ${rows[0].events} events` : `${symbol}: not in the stock table`);
  }
  const { rows } = await pool.query(
    `SELECT severity, count(*)::int AS n FROM news_price_event GROUP BY severity ORDER BY severity`,
  );
  console.log('stored events by severity:', rows.map((r) => `${r.severity}=${r.n}`).join(', ') || 'none');
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
