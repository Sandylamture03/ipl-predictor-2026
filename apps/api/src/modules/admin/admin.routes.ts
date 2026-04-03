import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from '../../db/connection';
import { syncIplFixtures } from '../../services/fixture-sync.service';
import { triggerIngestionCycleManual } from '../../jobs/index';
import {
  runDetailCycle,
  logIngestionRun,
} from '../../services/live-ingestion.service';
import { fetchMatchScorecard } from '../../providers/cricket.provider';

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

/* ═══════════════════════════════════════════════════════
   Live Ingestion Admin Endpoints
   ═══════════════════════════════════════════════════════ */

// POST /api/admin/ingest/trigger — manually run a full ingestion cycle
adminRoutes.post('/ingest/trigger', async (_req, res, next) => {
  try {
    console.log('[admin] Manual ingestion trigger...');
    const result = await triggerIngestionCycleManual();
    res.json({
      status: 'ok',
      fast: result.fast,
      detail: result.detail,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/ingest/match/:apiId — ingest a single match by its CricAPI ID
adminRoutes.post('/ingest/match/:apiId', async (req, res, next) => {
  try {
    const apiId = req.params.apiId;
    console.log(`[admin] Manual ingest for match ${apiId}...`);

    const scorecard = await fetchMatchScorecard(apiId);
    if (!scorecard) {
      return res.status(404).json({ error: `Could not fetch scorecard for API match ${apiId}` });
    }

    // Build a minimal LiveMatchData to pass to the detail cycle
    const fakeMatch: any = {
      id: scorecard.id,
      name: scorecard.name,
      status: scorecard.status,
      teams: scorecard.teams,
      matchStarted: scorecard.matchStarted,
      matchEnded: scorecard.matchEnded,
      score: [],
      isIPL: true,
    };

    const detail = await runDetailCycle([fakeMatch]);

    await logIngestionRun(
      'cricapi',
      'manual_match',
      detail.errors.length > 0 ? 'partial' : 'success',
      detail.scorecardsFetched,
      `manual match ingest: ${apiId}`
    );

    return res.json({ status: 'ok', apiId, detail });
  } catch (err) {
    return next(err);
  }
});

// GET /api/admin/ingest/status — live ingestion status summary
adminRoutes.get('/ingest/status', async (_req, res, next) => {
  try {
    const client = await pool.connect();
    try {
      // Latest ingestion runs
      const runs = await client.query(
        `SELECT * FROM ingestion_runs
         WHERE run_type IN ('detail_cycle', 'manual_trigger', 'manual_match')
         ORDER BY started_at DESC LIMIT 10`
      );

      // Currently live matches
      const liveState = await client.query(
        `SELECT lm.*, m.external_match_ref,
           t1.short_name AS team1_short, t2.short_name AS team2_short,
           s.name AS striker_name, ns.name AS non_striker_name, b.name AS bowler_name
         FROM live_match_state lm
         JOIN matches m ON m.id = lm.match_id
         JOIN teams t1 ON t1.id = m.team1_id
         JOIN teams t2 ON t2.id = m.team2_id
         LEFT JOIN players s ON s.id = lm.striker_id
         LEFT JOIN players ns ON ns.id = lm.non_striker_id
         LEFT JOIN players b ON b.id = lm.bowler_id
         WHERE lm.is_live = TRUE
         ORDER BY lm.fetched_at DESC`
      );

      res.json({
        recentRuns: runs.rows,
        liveMatches: liveState.rows,
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

