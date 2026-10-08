// Checks that every external dependency answers: database, price provider,
// news provider and Ollama. Run with: npm run smoke
import { config } from '../config.js';

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

const checks = {
  async database() {
    const { pool } = await import('../db.js');
    try {
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM stock');
      return `${rows[0].n} stocks`;
    } finally {
      await pool.end();
    }
  },
  async prices() {
    const { fetchDailyPrices } = await import('../providers/prices.yahoo.js');
    const rows = await fetchDailyPrices('AAPL', day(-10), day(0));
    if (!rows.length) throw new Error('no rows returned');
    const last = rows.at(-1);
    return `${rows.length} candles, latest ${last.date} close ${last.close.toFixed(2)}`;
  },
  async news() {
    const { fetchCompanyNews } = await import('../providers/news.finnhub.js');
    const items = await fetchCompanyNews('AAPL', day(-3), day(0));
    if (!items.length) throw new Error('no articles returned');
    return `${items.length} articles, e.g. "${items[0].title.slice(0, 60)}"`;
  },
  async ollama() {
    const { analyzeSentiment } = await import('../providers/ollama.js');
    const r = await analyzeSentiment({
      title: 'Acme Corp shares slide after profit warning and CEO resignation',
      summary: 'The company cut its full-year guidance, citing weak demand.',
    });
    return `${config.ollamaModel}: ${r.sentiment} score=${r.score} confidence=${r.confidence}`;
  },
};

for (const [name, check] of Object.entries(checks)) {
  try {
    console.log(`OK    ${name.padEnd(9)} ${await check()}`);
  } catch (err) {
    console.log(`FAIL  ${name.padEnd(9)} ${err.message}`);
    process.exitCode = 1;
  }
}
