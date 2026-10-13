import express from 'express';
import { errorHandler, unknownRoute } from './middleware/errors.js';
import { router as alerts } from './routes/alerts.js';
import { router as compare } from './routes/compare.js';
import { router as dashboard } from './routes/dashboard.js';
import { router as events } from './routes/events.js';
import { router as stocks } from './routes/stocks.js';

export const app = express();

app.use(express.json());
app.use('/api/stocks', stocks);
app.use('/api/events', events);
app.use('/api/dashboard', dashboard);
app.use('/api/compare', compare);
app.use('/api/alerts', alerts);
app.use(unknownRoute);
app.use(errorHandler);
