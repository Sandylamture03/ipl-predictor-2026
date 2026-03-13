/**
 * Cron jobs:
 * - Live IPL polling
 * - Fixture sync
 */
import cron from 'node-cron';
import { fetchIPLMatches, parseScore } from '../providers/cricket.provider';
import { syncIplFixtures } from '../services/fixture-sync.service';

// In-memory store for live state (shared with live routes)
export const liveMatchCache: Map<string, unknown> = new Map();

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
  // Live polling every 60s during likely match hours (14:00-23:59 IST).
  cron.schedule('*/60 * * * * *', async () => {
    const now = new Date();
    const istHour = (now.getUTCHours() + 5) % 24; // IST approximation.
    if (istHour < 14) return;

    try {
      const matches = await fetchIPLMatches();
      if (matches.length === 0) return;

      console.log(`Live IPL matches found: ${matches.length}`);
      for (const match of matches) {
        if (match.matchStarted && !match.matchEnded) {
          liveMatchCache.set(match.id, {
            ...match,
            parsedScore: parseScore(match),
            lastUpdated: new Date().toISOString(),
          });
        }
      }

      for (const [id] of liveMatchCache) {
        const found = matches.find((m) => m.id === id);
        if (found?.matchEnded) liveMatchCache.delete(id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Live poll error: ${message}`);
    }
  });

  // Fixture sync every 6 hours.
  cron.schedule('0 */6 * * *', async () => {
    await runFixtureSync('cron');
  });

  // Run one sync on startup so upcoming matches are available after deploy/restart.
  void runFixtureSync('startup');

  console.log('Cron jobs started: live poll every 60s | fixture sync every 6h');
}
