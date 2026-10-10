// Unit tests for request-parameter parsing. No database or network involved.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { pool } from '../src/db.js';
import { HttpError } from '../src/middleware/errors.js';
import { parseSymbols } from '../src/routes/compare.js';
import { parseDate } from '../src/routes/stocks.js';

// Importing the routers creates the (unused) connection pool; close it so the run can exit.
after(() => pool.end());

const rejects = (fn) =>
  assert.throws(fn, (err) => err instanceof HttpError && err.status === 400 && err.code === 'bad_request');

test('parseDate accepts real calendar dates and treats a missing value as no bound', () => {
  assert.equal(parseDate('2026-10-08', 'from'), '2026-10-08');
  assert.equal(parseDate('2028-02-29', 'from'), '2028-02-29', 'leap day');
  assert.equal(parseDate(undefined, 'from'), null);
  assert.equal(parseDate('', 'from'), null);
});

test('parseDate rejects malformed and impossible dates with a 400', () => {
  for (const bad of ['yesterday', '2026-1-5', '08-10-2026', '2026-13-01', '2026-00-10', '2026-02-31', '2027-02-29', '2026-10-08T00:00']) {
    rejects(() => parseDate(bad, 'from'));
  }
  rejects(() => parseDate(['2026-10-08', '2026-10-09'], 'from'));
  assert.throws(() => parseDate('nope', 'to'), /"to" must be a date/);
});

test('parseSymbols trims, upper-cases, de-duplicates and keeps the order', () => {
  assert.deepEqual(parseSymbols('aapl,MSFT'), ['AAPL', 'MSFT']);
  assert.deepEqual(parseSymbols(' nvda , aapl ,nvda,, amd '), ['NVDA', 'AAPL', 'AMD']);
  assert.deepEqual(parseSymbols('a,b,c,d'), ['A', 'B', 'C', 'D']);
});

test('parseSymbols requires 2 to 4 different symbols', () => {
  rejects(() => parseSymbols(undefined));
  rejects(() => parseSymbols(''));
  rejects(() => parseSymbols('AAPL'));
  rejects(() => parseSymbols('AAPL,aapl'));
  rejects(() => parseSymbols('A,B,C,D,E'));
  rejects(() => parseSymbols(['AAPL', 'MSFT']));
});
