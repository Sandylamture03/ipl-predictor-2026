/**
 * Cron jobs:
 * - Fast live poll + DB ingestion (every 60s)
 * - Detail scorecard ingestion (every 3 min)
 * - Fixture sync (every 6h)
 */
import cron from 'node-cron';
import { fetchIPLMatches, parseScore, LiveMatchData } from '../providers/cricket.provider';
import { syncIplFixtures } from '../services/fixture-sync.service';
import {
  runFastCycle,
  runDetailCycle,
  markMatchCompleted,
  logIngestionRun,
} from '../services/live-ingestion.service';

// In-memory store for live state (shared with live routes for backward compat)
export const liveMatchCache: Map<string, unknown> = new Map();

// Keep a reference to the latest live matches for the detail cycle
let _latestLiveMatches: LiveMatchData[] = [];

async function runFixtureSync(tag: string): Promise<void> {
  try {
    const result = await syncIplFixtures();
    console.log(
      `[${tag}] Fixture sync complete: fetched=${result.fetched}, upserted=${result.upserted}, ` +
      `upcoming_or_live=${result.upcomingOrLive}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${tag}] Fixture sync failed: ${message}`);
  }
}

export function startJobs() {
  // ──────────────────────────────────────────────────────────
  // Fast cycle: every 60s during match hours (14:00-23:59 IST)
  // Uses already-cached /currentMatches data → 0 extra API calls.
  // Writes match-level state to live_match_state in PostgreSQL.
  // ──────────────────────────────────────────────────────────
  cron.schedule('*/60 * * * * *', async () => {
    const now = new Date();
    const istHour = (now.getUTCHours() + 5) % 24;
    if (istHour < 14) return;

    try {
      const matches = await fetchIPLMatches();
      if (matches.length === 0) return;

      // Separate live vs ended
      const live: LiveMatchData[] = [];
      const ended: LiveMatchData[] = [];

      for (const match of matches) {
        if (match.matchStarted && !match.matchEnded) {
          live.push(match);
        } else if (match.matchEnded) {
          ended.push(match);
        }
      }

      // Update in-memory cache (backward compat with /api/live routes)
      for (const match of live) {
        liveMatchCache.set(match.id, {
          ...match,
          parsedScore: parseScore(match),
          lastUpdated: new Date().toISOString(),
        });
      }
      for (const [id] of liveMatchCache) {
        const found = matches.find((m) => m.id === id);
        if (found?.matchEnded) liveMatchCache.delete(id);
      }

      // Save reference for the detail cycle
      _latestLiveMatches = live;

      if (live.length > 0) {
        console.log(`[fast-cycle] ${live.length} live IPL match(es) — ingesting to DB...`);
        const fastResult = await runFastCycle(live);
        console.log(
          `[fast-cycle] Updated ${fastResult.matchesUpdated}/${fastResult.matchesProcessed} match(es)` +
          (fastResult.errors.length > 0 ? ` | errors: ${fastResult.errors.join('; ')}` : '')
        );
      }

      // Mark ended matches
      for (const match of ended) {
        try {
          await markMatchCompleted(match.id);
          console.log(`[fast-cycle] Marked match ${match.id} as completed.`);
        } catch (e: any) {
          console.error(`[fast-cycle] Failed to mark ${match.id} completed: ${e.message}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[fast-cycle] Error: ${message}`);
    }
  });

  // ──────────────────────────────────────────────────────────
  // Detail cycle: every 3 minutes during match hours
  // Calls /match_scorecard per match (1 API call each).
  // Populates players, innings, striker/bowler IDs.
  // Triggers ML live prediction after each match.
  // ──────────────────────────────────────────────────────────
  cron.schedule('*/3 * * * *', async () => {
    const now = new Date();
    const istHour = (now.getUTCHours() + 5) % 24;
    if (istHour < 14) return;

    const live = _latestLiveMatches;
    if (live.length === 0) return;

    console.log(`[detail-cycle] Fetching scorecards for ${live.length} match(es)...`);
    try {
      const detailResult = await runDetailCycle(live);
      console.log(
        `[detail-cycle] Scorecards=${detailResult.scorecardsFetched} | ` +
        `Players=${detailResult.playersUpserted} | Innings=${detailResult.inningsUpserted} | ` +
        `Predictions=${detailResult.predictionsTriggered}`
      );

      if (detailResult.errors.length > 0) {
        console.warn(`[detail-cycle] Errors: ${detailResult.errors.join('; ')}`);
      }

      await logIngestionRun(
        'cricapi',
        'detail_cycle',
        detailResult.errors.length > 0 ? 'partial' : 'success',
        detailResult.scorecardsFetched,
        `matches=${detailResult.matchesProcessed}, predictions=${detailResult.predictionsTriggered}`
      );
    } catch (err: any) {
      console.error(`[detail-cycle] Error: ${err.message}`);
      await logIngestionRun('cricapi', 'detail_cycle', 'error', 0, err.message);
    }
  });

  // ──────────────────────────────────────────────────────────
  // Fixture sync every 6 hours
  // ──────────────────────────────────────────────────────────
  cron.schedule('0 */6 * * *', async () => {
    await runFixtureSync('cron');
  });

  // Run one sync on startup so upcoming matches are available after deploy/restart.
  void runFixtureSync('startup');

  console.log(
    'Cron jobs started: fast poll 60s | detail scorecard 3min | fixture sync 6h'
  );
}

/**
 * Manually trigger a full ingestion cycle (used by admin routes).
 */
export async function triggerIngestionCycleManual(): Promise<{
  fast: import('../services/live-ingestion.service').FastCycleResult;
  detail: import('../services/live-ingestion.service').DetailCycleResult;
}> {
  const matches = await fetchIPLMatches();
  const live = matches.filter(m => m.matchStarted && !m.matchEnded);

  // Update cache
  for (const match of live) {
    liveMatchCache.set(match.id, {
      ...match,
      parsedScore: parseScore(match),
      lastUpdated: new Date().toISOString(),
    });
  }

  const fast = await runFastCycle(live);
  const detail = await runDetailCycle(live);

  await logIngestionRun(
    'cricapi',
    'manual_trigger',
    detail.errors.length > 0 ? 'partial' : 'success',
    detail.scorecardsFetched,
    `manual trigger: matches=${live.length}`
  );

  return { fast, detail };
}

