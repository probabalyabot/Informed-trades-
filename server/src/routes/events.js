import { Router } from 'express';
import { badRequest, notFound } from '../middleware/errors.js';
import * as events from '../queries/events.js';

export const router = Router();

router.get('/:id', async (req, res) => {
  if (!/^\d{1,15}$/.test(req.params.id)) throw badRequest('Event id must be a positive whole number.');
  const id = Number(req.params.id);

  const event = await events.getEvent(id);
  if (!event) throw notFound(`No event with id ${id}.`);
  res.json({ ...event, articles: await events.getEventArticles(id) });
});
