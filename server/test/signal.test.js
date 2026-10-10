// Tests v_stock_signal on a synthetic stock. Everything runs in one
// transaction that is rolled back, so the real data is never touched.
import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { pool } from '../src/db.js';

let client;
let stockId;

// `count` consecutive weekdays as 'YYYY-MM-DD', oldest first.
function weekdays(count) {
  const days = [];
  for (let d = new Date('2026-03-02T00:00:00Z'); days.length < count; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() % 6 !== 0) days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// The view counts trading days back from the latest candle: daysBack 1 is the latest.
const dayAt = (days, daysBack) => days[days.length - daysBack];

async function insertPrices(days, closeFor = () => 100) {
  for (const day of days) {
    await client.query(
      `INSERT INTO price_history (stock_id, period_start, open, high, low, close, volume)
       VALUES ($1, $2, $3::numeric, $3::numeric + 10, $3::numeric - 10, $3::numeric, 1000)`,
      [stockId, day, closeFor(day)],
    );
  }
}

// `count` articles published at 15:00 UTC (before the close) on `day`.
// The first scores.length of them get a sentiment analysis with that score.
async function insertNews(day, count, scores = []) {
  for (let i = 0; i < count; i++) {
    const { rows } = await client.query(
      `INSERT INTO news_article (url, title, source, published_at)
       VALUES ($1, 'Test headline', 'TestWire', $2) RETURNING article_id`,
      [`https://test.local/signal/${day}/${i}/${Math.random()}`, `${day}T15:00:00Z`],
    );
    await client.query('INSERT INTO stock_article VALUES ($1, $2)', [stockId, rows[0].article_id]);
    if (i < scores.length) {
      const label = scores[i] > 0 ? 'positive' : scores[i] < 0 ? 'negative' : 'neutral';
      await client.query(
        `INSERT INTO article_analysis (article_id, sentiment, sentiment_score, confidence, model, prompt_version)
         VALUES ($1, $2, $3, 0.9, 'test', 'v1')`,
        [rows[0].article_id, label, scores[i]],
      );
    }
  }
}

const signal = async () =>
  (await client.query('SELECT * FROM v_stock_signal WHERE stock_id = $1', [stockId])).rows[0];

beforeEach(async () => {
  client = await pool.connect();
  await client.query('BEGIN');
  const { rows } = await client.query(
    `INSERT INTO stock (symbol, company_name, exchange) VALUES ('ZZSIG', 'Signal Test Corp', 'TEST') RETURNING stock_id`,
  );
  stockId = rows[0].stock_id;
});

afterEach(async () => {
  await client.query('ROLLBACK');
  client.release();
});

after(() => pool.end());

test('summarises sentiment, price trend and news activity over the right windows', async () => {
  const days = weekdays(30);
  const latest = dayAt(days, 1);
  await insertPrices(days, (day) => (day === latest ? 110 : 100));

  // News: 6 a day in the recent window (days back 1-5), 2 a day before it.
  // Recent sentiment: 4 articles at +0.6 and 2 at -0.3. Weighted by article
  // that is +0.3; averaging the two days equally would give +0.15 instead.
  // Previous window (days back 6-10): 5 articles at 0.
  const scores = {
    [dayAt(days, 1)]: [0.6, 0.6, 0.6, 0.6],
    [dayAt(days, 2)]: [-0.3, -0.3],
    [dayAt(days, 6)]: [0, 0],
    [dayAt(days, 7)]: [0, 0],
    [dayAt(days, 8)]: [0],
  };
  for (const [index, day] of days.entries()) {
    const daysBack = days.length - index;
    await insertNews(day, daysBack <= 5 ? 6 : 2, scores[day]);
  }

  const s = await signal();
  assert.equal(s.as_of, latest);
  assert.equal(s.sentiment_avg, 0.3);
  assert.equal(s.sentiment_prev, 0);
  assert.equal(s.sentiment_label, 'positive');
  assert.equal(s.sentiment_trend, 'rising');
  assert.equal(s.sentiment_analysed, 6);
  assert.equal(s.sentiment_articles, 30);
  assert.equal(s.return_5d_pct, 10);
  assert.equal(s.return_20d_pct, 10);
  assert.equal(s.news_recent_avg, 6);
  assert.equal(s.news_baseline_avg, 2);
  assert.equal(s.news_activity_ratio, 3);
  assert.equal(s.latest_event_id, null);
});

test('withholds the label and trend when too few articles were analysed', async () => {
  const days = weekdays(30);
  await insertPrices(days);
  for (const day of days) await insertNews(day, 2);
  await insertNews(dayAt(days, 1), 3, [0.9, 0.9, 0.9]);

  const s = await signal();
  assert.equal(s.sentiment_analysed, 3);
  assert.equal(s.sentiment_avg, 0.9, 'the raw average is still reported');
  assert.equal(s.sentiment_label, null);
  assert.equal(s.sentiment_trend, null);
});

test('labels a clearly negative, worsening window', async () => {
  const days = weekdays(30);
  await insertPrices(days);
  await insertNews(dayAt(days, 3), 5, [-0.5, -0.5, -0.5, -0.5, -0.5]);
  await insertNews(dayAt(days, 9), 5, [0.2, 0.2, 0.2, 0.2, 0.2]);

  const s = await signal();
  assert.equal(s.sentiment_label, 'negative');
  assert.equal(s.sentiment_trend, 'falling');
});

test('labels a near-zero average as mixed and a small change as steady', async () => {
  const days = weekdays(30);
  await insertPrices(days);
  await insertNews(dayAt(days, 1), 6, [0.6, 0.6, 0.6, -0.6, -0.6, -0.5]);
  await insertNews(dayAt(days, 6), 5, [0, 0, 0, 0, 0]);

  const s = await signal();
  assert.equal(s.sentiment_label, 'mixed');
  assert.equal(s.sentiment_trend, 'steady');
});

test('returns are NULL when the history is too short for them', async () => {
  const days = weekdays(8);
  const latest = dayAt(days, 1);
  await insertPrices(days, (day) => (day === latest ? 95 : 100));

  const s = await signal();
  assert.equal(s.return_5d_pct, -5);
  assert.equal(s.return_20d_pct, null);
  assert.equal(s.sentiment_avg, null);
  assert.equal(s.sentiment_articles, 0);
  assert.equal(s.news_activity_ratio, null);
});

test('reports the latest detected event', async () => {
  const days = weekdays(30);
  await insertPrices(days);
  for (const eventDay of [dayAt(days, 12), dayAt(days, 4)]) {
    await client.query(
      `INSERT INTO news_price_event
           (stock_id, event_date, price_change_pct, news_count, baseline_news_avg, direction, severity)
       VALUES ($1, $2, -4.2, 9, 3, 'down', 'medium')`,
      [stockId, eventDay],
    );
  }

  const s = await signal();
  assert.equal(s.latest_event_date, dayAt(days, 4));
  assert.equal(s.latest_event_direction, 'down');
  assert.equal(s.latest_event_severity, 'medium');
});
