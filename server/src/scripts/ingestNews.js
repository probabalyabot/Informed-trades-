// Loads news articles and links them to stocks.
// Usage: npm run ingest:news -- [--days=90] [--full] [SYMBOL ...]
// By default each stock resumes from its newest stored article; --full
// refetches the whole period. Safe to re-run and to interrupt.
import { setTimeout as sleep } from 'node:timers/promises';
import { pool, withTransaction } from '../db.js';
import { TRUNCATION_THRESHOLD, fetchCompanyNews } from '../providers/news.finnhub.js';

const args = process.argv.slice(2);
const days = Number(args.find((a) => a.startsWith('--days='))?.split('=')[1]) || 90;
const full = args.includes('--full');
const symbols = args.filter((a) => !a.startsWith('--')).map((s) => s.toUpperCase());

const DAY_MS = 86400000;
const WINDOW_DAYS = 7;
const CALL_SPACING_MS = 1100; // stays under Finnhub's 60 calls/minute

const iso = (date) => date.toISOString().slice(0, 10);
const addDays = (date, n) => new Date(date.getTime() + n * DAY_MS);
const utcDay = (date) => new Date(`${iso(date)}T00:00:00Z`);

// Fetches [from, to] (inclusive dates). When the provider's response looks
// truncated, the window is halved and each half fetched again, down to one day.
async function fetchWindow(symbol, from, to) {
  await sleep(CALL_SPACING_MS);
  const articles = await fetchCompanyNews(symbol, iso(from), iso(to));
  if (articles.length < TRUNCATION_THRESHOLD) return articles;

  const spanDays = Math.round((to - from) / DAY_MS);
  if (spanDays === 0) {
    console.warn(`  ${symbol} ${iso(from)}: ${articles.length} articles in one day, may be incomplete`);
    return articles;
  }
  const mid = addDays(from, Math.floor(spanDays / 2));
  return [
    ...(await fetchWindow(symbol, from, mid)),
    ...(await fetchWindow(symbol, addDays(mid, 1), to)),
  ];
}

// The article rows and their stock links are written together: if either
// statement fails, neither is kept. An article already stored for another
// stock is reused, which is what makes stock_article a real N:M relation.
async function store(stockId, articles) {
  if (!articles.length) return { added: 0, linked: 0 };
  const col = (key) => articles.map((a) => a[key]);
  return withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO news_article (url, title, summary, source, published_at)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[])
       ON CONFLICT (url) DO NOTHING`,
      [col('url'), col('title'), col('summary'), col('source'), col('publishedAt')],
    );
    const linked = await client.query(
      `INSERT INTO stock_article (stock_id, article_id)
       SELECT $1, article_id FROM news_article WHERE url = ANY($2::text[])
       ON CONFLICT DO NOTHING`,
      [stockId, col('url')],
    );
    return { added: inserted.rowCount, linked: linked.rowCount };
  });
}

async function ingest(stock) {
  const today = utcDay(new Date());
  let from = addDays(today, -days);
  if (!full && stock.newest) {
    // Re-read the newest stored day: it may have been partial when last fetched.
    const resume = utcDay(stock.newest);
    if (resume > from) from = resume;
  }

  const totals = { added: 0, linked: 0 };
  // Oldest first, so an interrupted run can resume from the newest stored article.
  for (let start = from; start <= today; start = addDays(start, WINDOW_DAYS)) {
    const end = new Date(Math.min(addDays(start, WINDOW_DAYS - 1), today));
    const result = await store(stock.stock_id, await fetchWindow(stock.symbol, start, end));
    totals.added += result.added;
    totals.linked += result.linked;
  }
  return totals;
}

async function main() {
  const { rows: stocks } = await pool.query(
    `SELECT s.stock_id, s.symbol, max(a.published_at) AS newest
     FROM stock s
     LEFT JOIN stock_article sa USING (stock_id)
     LEFT JOIN news_article a USING (article_id)
     WHERE cardinality($1::text[]) = 0 OR s.symbol = ANY($1)
     GROUP BY s.stock_id, s.symbol
     ORDER BY s.symbol`,
    [symbols],
  );

  const unknown = symbols.filter((s) => !stocks.some((st) => st.symbol === s));
  if (unknown.length) console.warn(`Not in the stock table, ignored: ${unknown.join(', ')}`);

  for (const stock of stocks) {
    try {
      const { added, linked } = await ingest(stock);
      console.log(`${stock.symbol.padEnd(6)} ${linked} new links, ${added} new articles`);
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
