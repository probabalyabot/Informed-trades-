// Tests the trg_event_alert trigger and the alerts API.
// The trigger tests run in transactions that are rolled back. The API tests
// expect the demo user to have at least one alert (npm run migrate, then
// npm run detect with events for a stock on the demo watchlist).
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { app } from '../src/app.js';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';

let server;
let base;
let client;
let stockId;
let userId;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://localhost:${server.address().port}/api`;
});

after(async () => {
  server.close();
  await pool.end();
});

// A user and a stock that exist only inside the transaction.
beforeEach(async () => {
  client = await pool.connect();
  await client.query('BEGIN');
  stockId = (await client.query(
    `INSERT INTO stock (symbol, company_name, exchange) VALUES ('ZZALERT', 'Alert Corp', 'TEST') RETURNING stock_id`,
  )).rows[0].stock_id;
  userId = (await client.query(
    `INSERT INTO app_user (name, email) VALUES ('Watcher', 'watcher@test.local') RETURNING user_id`,
  )).rows[0].user_id;
});

afterEach(async () => {
  await client.query('ROLLBACK');
  client.release();
});

async function watch(listName) {
  const { rows } = await client.query(
    'INSERT INTO watchlist (user_id, name) VALUES ($1, $2) RETURNING watchlist_id',
    [userId, listName],
  );
  await client.query('INSERT INTO watchlist_stock (watchlist_id, stock_id) VALUES ($1, $2)', [rows[0].watchlist_id, stockId]);
}

// Stores an event the way detect_events() does: insert, or refresh on conflict.
async function upsertEvent(day, pct = 5) {
  const { rows } = await client.query(
    `INSERT INTO news_price_event
         (stock_id, event_date, price_change_pct, news_count, baseline_news_avg, direction, severity)
     VALUES ($1, $2, $3, 10, 2, 'up', 'medium')
     ON CONFLICT (stock_id, event_date) DO UPDATE SET price_change_pct = EXCLUDED.price_change_pct
     RETURNING event_id`,
    [stockId, day, pct],
  );
  return rows[0].event_id;
}

const alertsFor = async () =>
  (await client.query('SELECT * FROM alert WHERE user_id = $1 ORDER BY alert_id', [userId])).rows;

test('a new event alerts a user who watches the stock', async () => {
  await watch('Tech');
  const eventId = await upsertEvent('2026-03-10');

  const [alert, ...others] = await alertsFor();
  assert.equal(others.length, 0);
  assert.equal(alert.event_id, eventId);
  assert.equal(alert.read_at, null, 'starts unread');
});

test('a user who does not watch the stock gets no alert', async () => {
  await upsertEvent('2026-03-10');
  assert.equal((await alertsFor()).length, 0);
});

test('the stock on two watchlists still gives one alert per event', async () => {
  await watch('Tech');
  await watch('Favourites');
  await upsertEvent('2026-03-10');
  assert.equal((await alertsFor()).length, 1);
});

test('refreshing an existing event does not alert again', async () => {
  await watch('Tech');
  await upsertEvent('2026-03-10', 5);
  await upsertEvent('2026-03-10', 6);
  assert.equal((await alertsFor()).length, 1);

  await upsertEvent('2026-03-11');
  assert.equal((await alertsFor()).length, 2, 'a different day is a new event');
});

test('deleting an event removes its alerts', async () => {
  await watch('Tech');
  const eventId = await upsertEvent('2026-03-10');
  await client.query('DELETE FROM news_price_event WHERE event_id = $1', [eventId]);
  assert.equal((await alertsFor()).length, 0);
});

test('GET /alerts lists the demo user\'s alerts with their event', async () => {
  const res = await fetch(`${base}/alerts`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.length > 0, 'the demo user has alerts');
  for (const alert of body) {
    assert.equal(typeof alert.alert_id, 'number');
    assert.match(alert.symbol, /^[A-Z]+$/);
    assert.match(alert.explanation, /alongside/);
  }
});

test('PATCH /alerts/:id/read marks an alert read', async () => {
  const { rows } = await pool.query(
    `SELECT a.alert_id, a.read_at FROM alert a JOIN app_user u USING (user_id)
     WHERE u.email = $1 ORDER BY a.alert_id LIMIT 1`,
    [config.demoUserEmail],
  );
  assert.ok(rows[0], 'the demo user has alerts');
  const { alert_id: id, read_at: before } = rows[0];

  try {
    await pool.query('UPDATE alert SET read_at = NULL WHERE alert_id = $1', [id]);
    const unread = async () => (await (await fetch(`${base}/alerts?unread=true`)).json()).map((a) => a.alert_id);
    assert.ok((await unread()).includes(id));

    const res = await fetch(`${base}/alerts/${id}/read`, { method: 'PATCH' });
    assert.equal(res.status, 200);
    assert.ok((await res.json()).read_at);
    assert.ok(!(await unread()).includes(id), 'no longer listed as unread');
  } finally {
    // Put the alert back as it was.
    await pool.query('UPDATE alert SET read_at = $2 WHERE alert_id = $1', [id, before]);
  }
});

test('PATCH /alerts/:id/read rejects bad and unknown ids', async () => {
  assert.equal((await fetch(`${base}/alerts/abc/read`, { method: 'PATCH' })).status, 400);
  assert.equal((await fetch(`${base}/alerts/999999999/read`, { method: 'PATCH' })).status, 404);
});
