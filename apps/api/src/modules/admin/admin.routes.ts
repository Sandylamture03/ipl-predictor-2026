import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from '../../db/connection';
import { syncIplFixtures } from '../../services/fixture-sync.service';

export const adminRoutes = Router();

// POST /api/admin/migrate
adminRoutes.post('/migrate', async (_req, res, next) => {
  try {
    const migrationDir = path.join(__dirname, '../../db/migrations');
    const files = fs.readdirSync(migrationDir).filter((f) => f.endsWith('.sql')).sort();
    const client = await pool.connect();

    try {
      for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationDir, file), 'utf-8');
        await client.query(sql);
        console.log(`Ran migration: ${file}`);
      }
    } finally {
      client.release();
    }

    res.json({ status: 'ok', migrationsRun: files });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/import/cricsheet
adminRoutes.post('/import/cricsheet', async (_req, res, next) => {
  try {
    const dataDir = path.join(process.cwd(), 'data', 'cricsheet');
    if (!fs.existsSync(dataDir)) {
      return res.status(400).json({
        error: 'data/cricsheet folder not found. Download IPL JSON from cricsheet.org',
      });
    }

    return res.json({
      status: 'started',
      message: 'Run local script: node scripts/import_cricsheet.js .\\data\\cricsheet',
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/admin/sync/fixtures
adminRoutes.post('/sync/fixtures', async (_req, res, next) => {
  try {
    const result = await syncIplFixtures();
    res.json({ status: 'ok', ...result });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/ingestion-runs
adminRoutes.get('/ingestion-runs', async (_req, res, next) => {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 50'
      );
      res.json({ data: result.rows });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});
