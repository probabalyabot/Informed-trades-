// Unit tests for the client's pure helpers (no browser, no React).
// Run with: npm test   (from client/)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatMultiple, formatPercent, formatPrice, formatVolume, signClass } from '../src/format.js';
import { monthsAgo } from '../src/lib/ranges.js';
import {
  activityLevel, averageTone, capitalise, coverageText, formatScore, gaugeFill, gaugePosition,
} from '../src/lib/sentiment.js';
import { seriesChangePct, sparklineCoords, toPolyline } from '../src/lib/sparkline.js';
import { assignSlots, parseSymbolsParam, sortStocks, toggleSelection } from '../src/lib/stocks.js';

test('sparklineCoords spans the box, with the highest value at the top', () => {
  const coords = sparklineCoords([10, 20, 15], 100, 30, 2);
  assert.deepEqual(coords, [{ x: 2, y: 28 }, { x: 50, y: 2 }, { x: 98, y: 15 }]);
  assert.equal(toPolyline(coords), '2,28 50,2 98,15');
});

test('sparklineCoords draws a flat series on the centre line and needs two points', () => {
  assert.deepEqual(sparklineCoords([5, 5, 5], 100, 30).map((c) => c.y), [15, 15, 15]);
  assert.deepEqual(sparklineCoords([5], 100, 30), []);
  assert.deepEqual(sparklineCoords([], 100, 30), []);
  assert.deepEqual(sparklineCoords(null, 100, 30), []);
});

test('seriesChangePct is the first-to-last change', () => {
  assert.ok(Math.abs(seriesChangePct([100, 90, 110]) - 10) < 1e-9);
  assert.equal(seriesChangePct([200, 150]), -25);
  assert.equal(seriesChangePct([100]), null);
  assert.equal(seriesChangePct([0, 5]), null);
});

test('averageTone uses the same +/-0.15 band as the database views', () => {
  assert.equal(averageTone(0.16), 'positive');
  assert.equal(averageTone(0.15), 'mixed');
  assert.equal(averageTone(0), 'mixed');
  assert.equal(averageTone(-0.15), 'mixed');
  assert.equal(averageTone(-0.16), 'negative');
  assert.equal(averageTone(null), null);
  assert.equal(averageTone(undefined), null);
});

test('gauge geometry maps -1..+1 onto 0..100 and fills from the centre', () => {
  assert.equal(gaugePosition(-1), 0);
  assert.equal(gaugePosition(0), 50);
  assert.equal(gaugePosition(1), 100);
  assert.equal(gaugePosition(3), 100, 'clamped');
  assert.deepEqual(gaugeFill(0.5), { left: 50, width: 25 });
  assert.deepEqual(gaugeFill(-0.5), { left: 25, width: 25 });
  assert.deepEqual(gaugeFill(0), { left: 50, width: 0 });
});

test('formatScore always shows the sign, and never "-0.00"', () => {
  assert.equal(formatScore(0.425), '+0.42');
  assert.equal(formatScore(-0.3), '-0.30');
  assert.equal(formatScore(0), '0.00');
  assert.equal(formatScore(-0.001), '0.00');
  assert.equal(formatScore(null), '—');
});

test('coverageText states what an average rests on', () => {
  assert.equal(coverageText(38, 240), 'based on 38 of 240 articles');
  assert.equal(coverageText(0, 240), 'none of 240 articles analysed yet');
  assert.equal(coverageText(0, 0), 'no articles in this period');
});

test('activityLevel describes news volume against the usual level', () => {
  assert.equal(activityLevel(2.1), 'Busier than usual');
  assert.equal(activityLevel(1.5), 'Busier than usual');
  assert.equal(activityLevel(1.0), 'About usual');
  assert.equal(activityLevel(0.6), 'Quieter than usual');
  assert.equal(activityLevel(null), null);
});

test('capitalise', () => {
  assert.equal(capitalise('positive'), 'Positive');
  assert.equal(capitalise(''), '');
  assert.equal(capitalise(null), '');
});

const rows = [
  { symbol: 'BBB', change_pct: 1.5, signal: { sentiment_label: 'positive', sentiment_avg: 0.4, news_activity_ratio: 0.8 } },
  { symbol: 'AAA', change_pct: -2, signal: { sentiment_label: null, sentiment_avg: 0.9, news_activity_ratio: null } },
  { symbol: 'CCC', change_pct: null, signal: null },
  { symbol: 'DDD', change_pct: 1.5, signal: { sentiment_label: 'negative', sentiment_avg: -0.3, news_activity_ratio: 2 } },
];
const order = (key, dir) => sortStocks(rows, key, dir).map((s) => s.symbol);

test('sortStocks sorts by any column in either direction without mutating the input', () => {
  assert.deepEqual(order('symbol', 'asc'), ['AAA', 'BBB', 'CCC', 'DDD']);
  assert.deepEqual(order('symbol', 'desc'), ['DDD', 'CCC', 'BBB', 'AAA']);
  assert.deepEqual(order('change', 'desc'), ['BBB', 'DDD', 'AAA', 'CCC'], 'ties by symbol, missing last');
  assert.deepEqual(order('change', 'asc'), ['AAA', 'BBB', 'DDD', 'CCC'], 'missing still last');
  assert.deepEqual(order('news', 'desc'), ['DDD', 'BBB', 'AAA', 'CCC']);
  assert.deepEqual(rows.map((s) => s.symbol), ['BBB', 'AAA', 'CCC', 'DDD']);
});

test('sortStocks ranks sentiment only where there is a label', () => {
  // AAA has the highest raw average but too little coverage to carry a label.
  assert.deepEqual(order('sentiment', 'desc'), ['BBB', 'DDD', 'AAA', 'CCC']);
  assert.deepEqual(order('sentiment', 'asc'), ['DDD', 'BBB', 'AAA', 'CCC']);
});

test('toggleSelection adds, removes and caps at four', () => {
  assert.deepEqual(toggleSelection([], 'A'), ['A']);
  assert.deepEqual(toggleSelection(['A', 'B'], 'A'), ['B']);
  assert.deepEqual(toggleSelection(['A', 'B', 'C', 'D'], 'E'), ['A', 'B', 'C', 'D']);
  assert.deepEqual(toggleSelection(['A', 'B', 'C', 'D'], 'D'), ['A', 'B', 'C']);
});

test('assignSlots keeps a stock\'s colour slot while it stays selected', () => {
  const first = assignSlots({}, ['AAPL', 'MSFT', 'NVDA']);
  assert.deepEqual(first, { AAPL: 0, MSFT: 1, NVDA: 2 });

  const afterRemoval = assignSlots(first, ['MSFT', 'NVDA']);
  assert.deepEqual(afterRemoval, { MSFT: 1, NVDA: 2 }, 'survivors are not repainted');

  const afterAdd = assignSlots(afterRemoval, ['MSFT', 'NVDA', 'TSLA']);
  assert.deepEqual(afterAdd, { MSFT: 1, NVDA: 2, TSLA: 0 }, 'the newcomer takes the free slot');
});

test('parseSymbolsParam normalises the URL parameter', () => {
  assert.deepEqual(parseSymbolsParam('aapl, MSFT,aapl'), ['AAPL', 'MSFT']);
  assert.deepEqual(parseSymbolsParam('a,b,c,d,e'), ['A', 'B', 'C', 'D']);
  assert.deepEqual(parseSymbolsParam(''), []);
  assert.deepEqual(parseSymbolsParam(null), []);
});

test('monthsAgo counts back whole months from a given day', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  assert.equal(monthsAgo(1, now), '2026-09-08');
  assert.equal(monthsAgo(12, now), '2025-10-08');
});

test('formatters', () => {
  assert.equal(formatPrice(1234.5), '$1,234.50');
  assert.equal(formatPrice(null), '—');
  assert.equal(formatPercent(2.567), '+2.57%');
  assert.equal(formatPercent(-0.5), '-0.50%');
  assert.equal(formatPercent(null), '—');
  assert.equal(formatVolume(34128200), '34.1M');
  assert.equal(formatMultiple(1.83), '1.8× usual');
  assert.equal(formatMultiple(null), '—');
  assert.equal(signClass(1), 'up');
  assert.equal(signClass(-1), 'down');
  assert.equal(signClass(0), '');
  assert.equal(signClass(null), '');
});
