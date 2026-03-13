import dotenv from 'dotenv';
import path from 'path';

// Prefer repo-root .env when running from apps/api; fallback to cwd .env.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { matchRoutes } from './modules/matches/match.routes';
import { teamRoutes } from './modules/teams/team.routes';
import { predictionRoutes } from './modules/predictions/prediction.routes';
import liveRoutes from './modules/live/live.routes';
import { adminRoutes } from './modules/admin/admin.routes';

const app = express();
const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173'];

function parseAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS || process.env.WEB_URL || '';
  const parsed = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_ORIGINS;
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes('*')) return true;

  for (const rule of allowedOrigins) {
    if (rule === origin) return true;

    // Support wildcard host patterns such as https://*.example.com
    if (!rule.includes('*')) continue;
    const [ruleProto, ruleHost] = rule.split('://');
    if (!ruleProto || !ruleHost || !ruleHost.startsWith('*.')) continue;

    try {
      const originUrl = new URL(origin);
      if (originUrl.protocol.replace(':', '') !== ruleProto) continue;
      const suffix = ruleHost.slice(1); // ".example.com"
      if (originUrl.hostname.endsWith(suffix)) return true;
    } catch {
      // Ignore malformed origins.
    }
  }

  return false;
}

const allowedOrigins = parseAllowedOrigins();

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (isOriginAllowed(origin, allowedOrigins)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  })
);
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'ipl-predictor-api' });
});

app.use('/api/matches', matchRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/admin', adminRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

export default app;
