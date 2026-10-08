// Tests detect_events() on a synthetic stock. Everything runs in one
// transaction that is rolled back, so the real data is never touched.
import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { pool } from '../src/db.js';

let client;
let stockId;

// 40 consecutive weekdays ending well in the past, as 'YYYY-MM-DD'.
const days = [];
for (let d = new Date('2026-03-02T00:00:00Z'); days.length < 40; d.setUTCDate(d.getUTCDate() + 1)) {
  if (d.getUTCDay() % 6 !== 0) days.push(d.toISOString().slice(0, 10));
}
const EVENT_DAY = days[35];
const QUIET_DAY = days[30];

// A quiet stock: closes alternate 100 / 100.5 except for the given overrides.
async function insertPrices(overrides = {}) {
  for (const [i, day] of days.entries()) {
    const close = overrides[day] ?? (i % 2 ? 100.5 : 100);
    await client.query(
      `INSERT INTO price_history (stock_id, period_start, open, high, low, close, volume)
       VALUES ($1, $2, $3::numeric, $3::numeric + 10, $3::numeric - 10, $3::numeric, 1000)`,
      [stockId, day, close],
    );
  }
}

// `count` articles for the test stock, published at 15:00 UTC (before the close).
async function insertNews(day, count, score = null) {
  for (let i = 0; i < count; i++) {
    const { rows } = await client.query(
      `INSERT INTO news_article (url, title, source, published_at)
       VALUES ($1, 'Test headline', 'TestWire', $2) RETURNING article_id`,
      [`https://test.local/${day}/${i}/${Math.random()}`, `${day}T15:00:00Z`],
    );
    await client.query('INSERT INTO stock_article VALUES ($1, $2)', [stockId, rows[0].article_id]);
    if (score !== null) {
      await client.query(
        `INSERT INTO article_analysis (article_id, sentiment, sentiment_score, confidence, model, prompt_version)
         VALUES ($1, 'negative', $2, 0.9, 'test', 'v1')`,
        [rows[0].article_id, score],
      );
    }
  }
}

const detect = async () =>
  (await client.query('SELECT detect_events($1) AS n', [stockId])).rows[0].n;

const storedEvents = async () =>
  (await client.query('SELECT * FROM news_price_event WHERE stock_id = $1 ORDER BY event_date', [stockId])).rows;

beforeEach(async () => {
  client = await pool.connect();
  await client.query('BEGIN');
  const { rows } = await client.query(
    `INSERT INTO stock (symbol, company_name, exchange) VALUES ('ZZTEST', 'Test Corp', 'TEST') RETURNING stock_id`,
  );
  stockId = rows[0].stock_id;
});

afterEach(async () => {
  await client.query('ROLLBACK');
  client.release();
});

after(() => pool.end());

test('a large drop alongside a news spike is recorded once, with its articles', async () => {
  await insertPrices({ [EVENT_DAY]: 94 });
  for (const day of days) await insertNews(day, day === EVENT_DAY ? 8 : 1, day === EVENT_DAY ? -0.6 : null);

  assert.equal(await detect(), 1);
  const [event, ...others] = await storedEvents();
  assert.equal(others.length, 0);
  assert.equal(event.event_date, EVENT_DAY);
  assert.equal(event.direction, 'down');
  assert.equal(event.severity, 'high');
  assert.equal(event.news_count, 8);
  assert.equal(event.baseline_news_avg, 1);
  assert.equal(event.avg_sentiment, -0.6);
  assert.ok(event.price_change_pct < -5 && event.price_change_pct > -7);

  const linked = await client.query('SELECT count(*)::int AS n FROM event_article WHERE event_id = $1', [event.event_id]);
  assert.equal(linked.rows[0].n, 8);

  // Idempotent: a second run updates the same row.
  assert.equal(await detect(), 1);
  assert.equal((await storedEvents()).length, 1);

  const summary = await client.query('SELECT explanation FROM v_event_summary WHERE event_id = $1', [event.event_id]);
  assert.match(summary.rows[0].explanation, /^ZZTEST closed 6\.\d\d% lower.*alongside 8 news articles.*negative on average/);
  assert.doesNotMatch(summary.rows[0].explanation, /caus|because|due to/i);
});

test('a large move without unusual news is not an event', async () => {
  await insertPrices({ [EVENT_DAY]: 94 });
  for (const day of days) await insertNews(day, 1);
  assert.equal(await detect(), 0);
});

test('a news spike without an unusual move is not an event', async () => {
  await insertPrices();
  for (const day of days) await insertNews(day, day === QUIET_DAY ? 8 : 1);
  assert.equal(await detect(), 0);
});

test('news published after the close counts toward the next trading day', async () => {
  await insertPrices({ [EVENT_DAY]: 106 });
  for (const day of days) if (day !== EVENT_DAY) await insertNews(day, 1);
  // 8 articles at 23:00 UTC (after 16:00 New York) on the day BEFORE the move.
  const previous = days[34];
  for (let i = 0; i < 8; i++) {
    const { rows } = await client.query(
      `INSERT INTO news_article (url, title, source, published_at)
       VALUES ($1, 'After-hours headline', 'TestWire', $2) RETURNING article_id`,
      [`https://test.local/after/${i}/${Math.random()}`, `${previous}T23:00:00Z`],
    );
    await client.query('INSERT INTO stock_article VALUES ($1, $2)', [stockId, rows[0].article_id]);
  }

  assert.equal(await detect(), 1);
  const [event] = await storedEvents();
  assert.equal(event.event_date, EVENT_DAY);
  assert.equal(event.direction, 'up');
  assert.equal(event.news_count, 8);
});

test('thresholds are parameters of detect_events', async () => {
  await insertPrices({ [EVENT_DAY]: 94 });
  for (const day of days) await insertNews(day, day === EVENT_DAY ? 8 : 1);
  // Requiring 10x the usual news volume rules the day out.
  const strict = await client.query(
    'SELECT detect_events(p_stock_id => $1, p_news_multiple => 10) AS n',
    [stockId],
  );
  assert.equal(strict.rows[0].n, 0);
});
