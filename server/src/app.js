import express from 'express';
import { errorHandler, unknownRoute } from './middleware/errors.js';
import { router as events } from './routes/events.js';
import { router as stocks } from './routes/stocks.js';

export const app = express();

app.use(express.json());
app.use('/api/stocks', stocks);
app.use('/api/events', events);
app.use(unknownRoute);
app.use(errorHandler);
