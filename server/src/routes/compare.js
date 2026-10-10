import { Router } from 'express';
import { badRequest, notFound } from '../middleware/errors.js';
import * as compare from '../queries/compare.js';
import { parseDate } from './stocks.js';

export const router = Router();

const MIN_SYMBOLS = 2;
const MAX_SYMBOLS = 4;

// "aapl, MSFT,aapl" -> ['AAPL', 'MSFT']
export function parseSymbols(value) {
  if (typeof value !== 'string') throw badRequest('"symbols" is required, e.g. symbols=AAPL,MSFT.');
  const symbols = [...new Set(value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (symbols.length < MIN_SYMBOLS || symbols.length > MAX_SYMBOLS) {
    throw badRequest(`"symbols" must list ${MIN_SYMBOLS} to ${MAX_SYMBOLS} different stocks.`);
  }
  return symbols;
}

router.get('/', async (req, res) => {
  const symbols = parseSymbols(req.query.symbols);
  const from = parseDate(req.query.from, 'from');
  const to = parseDate(req.query.to, 'to');
  if (from && to && from > to) throw badRequest('"from" must not be after "to".');

  const stocks = await compare.getComparedStocks(symbols, from, to);
  const unknown = symbols.filter((symbol) => !stocks.some((s) => s.symbol === symbol));
  if (unknown.length) throw notFound(`Unknown stock symbol: ${unknown.join(', ')}.`);

  const points = await compare.getComparisonSeries(stocks.map((s) => s.stock_id), from, to);

  // Series come back in the order the symbols were asked for.
  const series = symbols.map((symbol) => {
    const { stock_id, ...stock } = stocks.find((s) => s.symbol === symbol);
    const own = points
      .filter((p) => p.stock_id === stock_id)
      .map(({ time, close, change_pct }) => ({ time, close, change_pct }));
    return { ...stock, return_pct: own.at(-1)?.change_pct ?? null, points: own };
  });
  res.json({ from, to, series });
});
