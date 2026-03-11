import { Router } from 'express';
import { pool } from '../../db/connection';
import fs from 'fs';
import path from 'path';

export const adminRoutes = Router();

// POST /api/admin/migrate — run SQL migrations
adminRoutes.post('/migrate', async (_req, res, next) => {
  try {
    const migrationDir = path.join(__dirname, '../../db/migrations');
    const files = fs.readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort();
    const client = await pool.connect();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationDir, file), 'utf-8');
      await client.query(sql);
      console.log(`✅ Ran migration: ${file}`);
    }
    client.release();
    res.json({ status: 'ok', migrationsRun: files });
  } catch (err) { next(err); }
});

// POST /api/admin/import/cricsheet — bulk import from data/cricsheet folder
adminRoutes.post('/import/cricsheet', async (_req, res, next) => {
  try {
    const dataDir = path.join(process.cwd(), 'data', 'cricsheet');
    if (!fs.existsSync(dataDir)) {
      return res.status(400).json({ error: 'data/cricsheet folder not found. Download IPL JSON from cricsheet.org' });
    }
    // Trigger async import — import is done via the script
    res.json({ status: 'started', message: 'Run: npx ts-node scripts/import_cricsheet.ts to bulk import.' });
    return;
  } catch (err) { return next(err); }
});

// GET /api/admin/ingestion-runs
adminRoutes.get('/ingestion-runs', async (_req, res, next) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 50`);
    client.release();
    res.json({ data: result.rows });
  } catch (err) { next(err); }
});
