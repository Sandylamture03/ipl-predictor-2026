/**
 * Cron Jobs — fixture sync + live match polling
 * Live polling uses cricketdata.org free API
 */
import cron from 'node-cron';
import { fetchIPLMatches, parseScore } from '../providers/cricket.provider';
import { pool } from '../db/connection';

// In-memory store for live state (shared with live routes)
export const liveMatchCache: Map<string, any> = new Map();

export function startJobs() {
  // ── Live match polling — every 60 seconds (conserves API quota) ──────
  // 100 calls/day free = call once per ~15 min to be safe outside match hours
  // During IPL (March 28 – May 31): poll every 60s during match windows
  cron.schedule('*/60 * * * * *', async () => {
    const now = new Date();
    const istHour = (now.getUTCHours() + 5) % 24; // IST = UTC+5:30 approx
    
    // Only poll during likely match hours: 14:00–23:59 IST
    if (istHour < 14) return;

    try {
      const matches = await fetchIPLMatches();
      if (matches.length > 0) {
        console.log(`⚡ Live IPL matches found: ${matches.length}`);
        for (const m of matches) {
          if (m.matchStarted && !m.matchEnded) {
            liveMatchCache.set(m.id, {
              ...m,
              parsedScore: parseScore(m),
              lastUpdated: new Date().toISOString(),
            });
          }
        }
        // Clean up ended matches
        for (const [id, cached] of liveMatchCache) {
          const found = matches.find(m => m.id === id);
          if (found?.matchEnded) liveMatchCache.delete(id);
        }
      }
    } catch (err: any) {
      console.error('Live poll error:', err.message);
    }
  });

  // ── Fixture sync — every 6 hours ──────────────────────────────────────
  cron.schedule('0 */6 * * *', async () => {
    console.log('🔄 Fixture sync tick (connect live API for real data)');
    // Fixtures will auto-appear from the cricket API currentMatches endpoint
  });

  console.log('✅ Cron jobs started: live poll every 60s | fixture sync every 6h');
}
