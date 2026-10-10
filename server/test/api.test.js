// API tests. They run against the database in DATABASE_URL and expect the
// seed data plus ingested prices for AAPL (npm run migrate && npm run ingest:prices).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../src/app.js';
import { pool } from '../src/db.js';

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://localhost:${server.address().port}/api`;
});

after(async () => {
  server.close();
  await pool.end();
});

const get = async (path) => {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json() };
};

test('GET /stocks lists seeded stocks with a quote', async () => {
  const { status, body } = await get('/stocks');
  assert.equal(status, 200);
  const aapl = body.find((s) => s.symbol === 'AAPL');
  assert.ok(aapl, 'AAPL is listed');
  assert.equal(typeof aapl.last_close, 'number');
  assert.equal(typeof aapl.change_pct, 'number');
});

test('GET /stocks?q= matches symbol prefix and company name', async () => {
  assert.deepEqual((await get('/stocks?q=nv')).body.map((s) => s.symbol), ['NVDA']);
  assert.deepEqual((await get('/stocks?q=boeing')).body.map((s) => s.symbol), ['BA']);
  assert.deepEqual((await get('/stocks?q=zzzz')).body, []);
});

test('GET /stocks/:symbol is case-insensitive and 404s for unknown symbols', async () => {
  assert.equal((await get('/stocks/aapl')).body.symbol, 'AAPL');
  const missing = await get('/stocks/NOPE');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'not_found');
});

test('GET /stocks/:symbol/prices returns ordered, well-formed candles', async () => {
  const { status, body } = await get('/stocks/AAPL/prices');
  assert.equal(status, 200);
  assert.ok(body.length > 100, 'has a history');
  for (const [i, c] of body.entries()) {
    assert.match(c.time, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close));
    if (i > 0) assert.ok(c.time > body[i - 1].time, 'ascending and unique');
  }
});

test('GET /stocks/:symbol/prices honours from/to and rejects bad dates', async () => {
  const all = (await get('/stocks/AAPL/prices')).body;
  const from = all[all.length - 10].time;
  const to = all[all.length - 3].time;
  const ranged = (await get(`/stocks/AAPL/prices?from=${from}&to=${to}`)).body;
  assert.equal(ranged.length, 8);
  assert.equal(ranged[0].time, from);
  assert.equal(ranged.at(-1).time, to);

  assert.equal((await get('/stocks/AAPL/prices?from=yesterday')).status, 400);
  assert.equal((await get('/stocks/AAPL/prices?from=2026-02-31')).status, 400);
  assert.equal((await get(`/stocks/AAPL/prices?from=${to}&to=${from}`)).status, 400);
});

test('GET /stocks/:symbol/news returns newest-first articles and honours filters', async () => {
  const { status, body } = await get('/stocks/DIS/news?limit=20');
  assert.equal(status, 200);
  assert.ok(body.length > 0 && body.length <= 20, 'DIS has stored news');
  for (const [i, a] of body.entries()) {
    assert.ok(a.title && a.url && a.source);
    assert.ok('sentiment' in a && 'sentiment_score' in a);
    if (i > 0) assert.ok(a.published_at <= body[i - 1].published_at, 'newest first');
  }

  const day = body[0].published_at.slice(0, 10);
  const sameDay = (await get(`/stocks/DIS/news?from=${day}&to=${day}&limit=200`)).body;
  assert.ok(sameDay.length > 0);
  assert.ok(sameDay.every((a) => a.published_at.startsWith(day)));

  const negative = (await get('/stocks/DIS/news?sentiment=negative')).body;
  assert.ok(negative.every((a) => a.sentiment === 'negative'));
});

test('GET /stocks/:symbol/news rejects invalid parameters', async () => {
  assert.equal((await get('/stocks/DIS/news?sentiment=bullish')).status, 400);
  assert.equal((await get('/stocks/DIS/news?limit=0')).status, 400);
  assert.equal((await get('/stocks/DIS/news?limit=abc')).status, 400);
  assert.equal((await get('/stocks/DIS/news?limit=1000')).status, 400);
  assert.equal((await get('/stocks/NOPE/news')).status, 404);
});

test('events are listed per stock and include their articles', async () => {
  const stocks = (await get('/stocks')).body;
  let event;
  for (const s of stocks) {
    const list = (await get(`/stocks/${s.symbol}/events`)).body;
    assert.ok(Array.isArray(list));
    if (list.length) {
      event = list[0];
      assert.equal(event.symbol, s.symbol);
      break;
    }
  }
  assert.ok(event, 'at least one event is stored (npm run detect)');
  assert.match(event.event_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(event.explanation.includes('occurred alongside'));

  const detail = (await get(`/events/${event.event_id}`)).body;
  assert.equal(detail.event_id, event.event_id);
  assert.equal(detail.articles.length, detail.news_count);

  assert.equal((await get('/events/999999999')).status, 404);
  assert.equal((await get('/events/abc')).status, 400);
});

const SIGNAL_FIELDS = [
  'as_of', 'sentiment_avg', 'sentiment_prev', 'sentiment_label', 'sentiment_trend',
  'sentiment_analysed', 'sentiment_articles', 'return_5d_pct', 'return_20d_pct',
  'news_recent_avg', 'news_baseline_avg', 'news_activity_ratio',
  'latest_event_id', 'latest_event_date', 'latest_event_direction', 'latest_event_severity',
];

function assertSignalShape(signal) {
  for (const field of SIGNAL_FIELDS) assert.ok(field in signal, `signal.${field} is present`);
  assert.ok(!('stock_id' in signal), 'internal id is not exposed');
  assert.ok([null, 'positive', 'mixed', 'negative'].includes(signal.sentiment_label));
  assert.ok([null, 'rising', 'steady', 'falling'].includes(signal.sentiment_trend));
  assert.ok(signal.sentiment_analysed <= signal.sentiment_articles);
  if (signal.sentiment_avg !== null) assert.ok(signal.sentiment_avg >= -1 && signal.sentiment_avg <= 1);
  // The label is only given when it rests on enough analysed articles.
  if (signal.sentiment_analysed < 5) assert.equal(signal.sentiment_label, null);
}

test('GET /dashboard returns every stock with a sparkline and signal, plus recent events', async () => {
  const { status, body } = await get('/dashboard');
  assert.equal(status, 200);

  assert.equal(body.stocks.length, (await get('/stocks')).body.length);
  assert.deepEqual(body.stocks.map((s) => s.symbol), body.stocks.map((s) => s.symbol).toSorted());
  for (const stock of body.stocks) {
    assert.equal(typeof stock.last_close, 'number');
    assert.ok(stock.sparkline.length > 1 && stock.sparkline.length <= 30);
    assert.ok(stock.sparkline.every((close) => typeof close === 'number'));
    assert.equal(stock.sparkline.at(-1), stock.last_close, 'sparkline ends at the latest close');
    assertSignalShape(stock.signal);
  }

  assert.ok(body.recent_events.length > 0 && body.recent_events.length <= 6);
  for (const [i, e] of body.recent_events.entries()) {
    assert.ok(e.symbol && e.explanation);
    if (i > 0) assert.ok(e.event_date <= body.recent_events[i - 1].event_date, 'newest first');
  }
});

test('GET /stocks/:symbol includes the signal and agrees with the dashboard', async () => {
  const { body } = await get('/stocks/AAPL');
  assert.equal(body.symbol, 'AAPL');
  assertSignalShape(body.signal);

  const onDashboard = (await get('/dashboard')).body.stocks.find((s) => s.symbol === 'AAPL');
  assert.deepEqual(body.signal, onDashboard.signal);
});

test('GET /stocks/:symbol/sentiment returns one row per trading day in range', async () => {
  const prices = (await get('/stocks/AAPL/prices')).body;
  const from = prices[prices.length - 30].time;
  const to = prices.at(-1).time;

  const { status, body } = await get(`/stocks/AAPL/sentiment?from=${from}&to=${to}`);
  assert.equal(status, 200);
  assert.deepEqual(body.map((d) => d.time), prices.slice(-30).map((p) => p.time));
  for (const day of body) {
    assert.ok(day.analysed_count <= day.news_count);
    if (day.analysed_count === 0) assert.equal(day.avg_sentiment, null);
    else assert.ok(day.avg_sentiment >= -1 && day.avg_sentiment <= 1);
  }

  assert.equal((await get('/stocks/AAPL/sentiment?from=nope')).status, 400);
  assert.equal((await get(`/stocks/AAPL/sentiment?from=${to}&to=${from}`)).status, 400);
  assert.equal((await get('/stocks/NOPE/sentiment')).status, 404);
});

test('GET /compare returns % change from the first day for each stock, in the order asked', async () => {
  const prices = (await get('/stocks/AAPL/prices')).body;
  const from = prices[prices.length - 20].time;

  const { status, body } = await get(`/compare?symbols=msft,AAPL,msft&from=${from}`);
  assert.equal(status, 200);
  assert.equal(body.from, from);
  assert.deepEqual(body.series.map((s) => s.symbol), ['MSFT', 'AAPL'], 'upper-cased, de-duplicated, order kept');

  for (const s of body.series) {
    assert.equal(s.points.length, 20);
    assert.equal(s.points[0].time, from);
    assert.equal(s.points[0].change_pct, 0, 'the first day is the base');
    const first = s.points[0].close;
    for (const p of s.points) {
      assert.ok(Math.abs(p.change_pct - (p.close / first - 1) * 100) < 0.006, 'change matches the closes');
    }
    assert.equal(s.return_pct, s.points.at(-1).change_pct);
    assert.equal(typeof s.event_count, 'number');
    assert.ok(s.analysed_count <= s.article_count);
    assert.ok(!('stock_id' in s));
  }
});

test('GET /compare validates its parameters', async () => {
  assert.equal((await get('/compare')).status, 400);
  assert.equal((await get('/compare?symbols=AAPL')).status, 400);
  assert.equal((await get('/compare?symbols=AAPL,aapl')).status, 400, 'duplicates count once');
  assert.equal((await get('/compare?symbols=AAPL,MSFT,NVDA,AMD,TSLA')).status, 400);
  assert.equal((await get('/compare?symbols=AAPL,MSFT&from=2026-13-01')).status, 400);

  const unknown = await get('/compare?symbols=AAPL,NOPE');
  assert.equal(unknown.status, 404);
  assert.match(unknown.body.error.message, /NOPE/);
});

test('unknown routes return a JSON 404', async () => {
  const { status, body } = await get('/nope');
  assert.equal(status, 404);
  assert.equal(body.error.code, 'not_found');
});
