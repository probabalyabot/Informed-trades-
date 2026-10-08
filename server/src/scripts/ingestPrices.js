// Loads daily OHLCV candles into price_history.
// Usage: npm run ingest:prices -- [--days=400] [SYMBOL ...]
// With no symbols, every row in the stock table is refreshed. Safe to re-run.
import { pool } from '../db.js';
import { fetchDailyPrices } from '../providers/prices.yahoo.js';

const args = process.argv.slice(2);
const days = Number(args.find((a) => a.startsWith('--days='))?.split('=')[1]) || 400;
const symbols = args.filter((a) => !a.startsWith('--')).map((s) => s.toUpperCase());

const isoDay = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const round4 = (n) => Math.round(n * 1e4) / 1e4;

// Mirrors the price_history CHECK constraints so one bad candle from the
// provider is skipped and reported instead of failing the whole batch.
function isValidCandle(c) {
  return (
    c.low > 0 &&
    c.high >= Math.max(c.open, c.close) &&
    c.low <= Math.min(c.open, c.close) &&
    Number.isInteger(c.volume) &&
    c.volume >= 0
  );
}

// One statement, so the whole batch for a stock is stored or none of it is.
const UPSERT = `
  INSERT INTO price_history (stock_id, timeframe, period_start, open, high, low, close, volume)
  SELECT $1, '1d', t.period_start, t.open, t.high, t.low, t.close, t.volume
  FROM unnest($2::date[], $3::numeric[], $4::numeric[], $5::numeric[], $6::numeric[], $7::bigint[])
       AS t (period_start, open, high, low, close, volume)
  ON CONFLICT (stock_id, timeframe, period_start) DO UPDATE
     SET open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
         close = EXCLUDED.close, volume = EXCLUDED.volume`;

async function ingest(stock) {
  const fetched = await fetchDailyPrices(stock.symbol, isoDay(-days), isoDay(1));
  const candles = fetched.map((c) => ({
    ...c,
    open: round4(c.open),
    high: round4(c.high),
    low: round4(c.low),
    close: round4(c.close),
  }));
  const valid = candles.filter(isValidCandle);
  for (const bad of candles.filter((c) => !isValidCandle(c))) {
    console.warn(`  skipped invalid candle ${stock.symbol} ${bad.date}: ${JSON.stringify(bad)}`);
  }
  if (valid.length) {
    const col = (key) => valid.map((c) => c[key]);
    await pool.query(UPSERT, [
      stock.stock_id, col('date'), col('open'), col('high'), col('low'), col('close'), col('volume'),
    ]);
  }
  return valid.length;
}

async function main() {
  const { rows: stocks } = symbols.length
    ? await pool.query('SELECT stock_id, symbol FROM stock WHERE symbol = ANY($1) ORDER BY symbol', [symbols])
    : await pool.query('SELECT stock_id, symbol FROM stock ORDER BY symbol');

  const unknown = symbols.filter((s) => !stocks.some((st) => st.symbol === s));
  if (unknown.length) console.warn(`Not in the stock table, ignored: ${unknown.join(', ')}`);

  for (const stock of stocks) {
    try {
      console.log(`${stock.symbol.padEnd(6)} ${await ingest(stock)} candles`);
    } catch (err) {
      // A provider failure for one ticker must not stop the others.
      console.error(`${stock.symbol.padEnd(6)} FAILED: ${err.message}`);
      process.exitCode = 1;
    }
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
