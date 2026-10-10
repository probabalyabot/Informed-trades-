import { Router } from 'express';
import * as events from '../queries/events.js';
import * as signals from '../queries/signals.js';

export const router = Router();

const RECENT_EVENTS = 6;

// Everything the home page shows, in one request.
router.get('/', async (req, res) => {
  const [stocks, recentEvents] = await Promise.all([
    signals.getStocksOverview(),
    events.getRecentEvents(RECENT_EVENTS),
  ]);
  res.json({ stocks, recent_events: recentEvents });
});
