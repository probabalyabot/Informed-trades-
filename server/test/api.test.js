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

test('unknown routes return a JSON 404', async () => {
  const { status, body } = await get('/nope');
  assert.equal(status, 404);
  assert.equal(body.error.code, 'not_found');
});
