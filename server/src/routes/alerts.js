import { Router } from 'express';
import { currentUser } from '../middleware/currentUser.js';
import { badRequest, notFound } from '../middleware/errors.js';
import * as alerts from '../queries/alerts.js';

export const router = Router();

router.use(currentUser);

router.get('/', async (req, res) => {
  res.json(await alerts.getAlerts(req.user.user_id, req.query.unread === 'true'));
});

router.patch('/:id/read', async (req, res) => {
  if (!/^\d{1,15}$/.test(req.params.id)) throw badRequest('Alert id must be a positive whole number.');
  const id = Number(req.params.id);

  const alert = await alerts.markAlertRead(req.user.user_id, id);
  if (!alert) throw notFound(`No alert with id ${id}.`);
  res.json(alert);
});
