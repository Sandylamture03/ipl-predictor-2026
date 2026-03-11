import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { matchRoutes } from './modules/matches/match.routes';
import { teamRoutes } from './modules/teams/team.routes';
import { predictionRoutes } from './modules/predictions/prediction.routes';
import { liveRoutes } from './modules/live/live.routes';
import { adminRoutes } from './modules/admin/admin.routes';

const app = express();

// ── Middleware ──────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.WEB_URL || 'http://localhost:5173' }));
app.use(express.json());
app.use(morgan('dev'));

// ── Routes ──────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'ipl-predictor-api' });
});

app.use('/api/matches', matchRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/admin', adminRoutes);

// ── 404 Handler ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Error Handler ────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

export default app;
