import { Router } from 'express';
import { badRequest, notFound } from '../middleware/errors.js';
import * as events from '../queries/events.js';
import * as news from '../queries/news.js';
import * as stocks from '../queries/stocks.js';

export const router = Router();

// Accepts a missing value (null) or a real calendar date in YYYY-MM-DD form.
export function parseDate(value, name) {
  if (value === undefined || value === '') return null;
  const valid =
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid) throw badRequest(`"${name}" must be a date in YYYY-MM-DD format.`);
  return value;
}

// Resolves :symbol once for every /stocks/:symbol/... route.
router.param('symbol', async (req, res, next, symbol) => {
  req.stock = await stocks.getStock(symbol.toUpperCase());
  if (!req.stock) throw notFound(`Unknown stock symbol "${symbol}".`);
  next();
});

router.get('/', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  res.json(await stocks.searchStocks(q));
});

router.get('/:symbol', (req, res) => {
  res.json(req.stock);
});

router.get('/:symbol/prices', async (req, res) => {
  const from = parseDate(req.query.from, 'from');
  const to = parseDate(req.query.to, 'to');
  if (from && to && from > to) throw badRequest('"from" must not be after "to".');
  res.json(await stocks.getPrices(req.stock.stock_id, from, to));
});

router.get('/:symbol/events', async (req, res) => {
  res.json(await events.getStockEvents(req.stock.stock_id));
});

const SENTIMENTS =['positive', 'neutral', 'negative'];
const NEWS_LIMIT = { default: 50, max: 200 };

router.get('/:symbol/news', async (req, res) => {
  const from = parseDate(req.query.from, 'from');
  const to = parseDate(req.query.to, 'to');
  if (from && to && from > to) throw badRequest('"from" must not be after "to".');

  const sentiment = req.query.sentiment || null;
  if (sentiment && !SENTIMENTS.includes(sentiment)) {
    throw badRequest(`"sentiment" must be one of: ${SENTIMENTS.join(', ')}.`);
  }

  const limit = req.query.limit === undefined ? NEWS_LIMIT.default : Number(req.query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > NEWS_LIMIT.max) {
    throw badRequest(`"limit" must be a whole number from 1 to ${NEWS_LIMIT.max}.`);
  }

  res.json(await news.getStockNews(req.stock.stock_id, { from, to, sentiment, limit }));
});
