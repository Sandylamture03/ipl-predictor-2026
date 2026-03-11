/**
 * Live match routes
 * GET /api/live          — all currently live IPL matches (from API cache)
 * GET /api/live/:apiId   — single live match detail
 * GET /api/live/test     — verify the cricket API key is working
 */
import { Router, Request, Response } from 'express';
import { fetchCurrentMatches, fetchIPLMatches, parseScore } from '../../providers/cricket.provider';
import { liveMatchCache } from '../../jobs/index';

const router = Router();

// GET /api/live — all live IPL matches
router.get('/', async (_req: Request, res: Response) => {
  try {
    // First check in-memory cache (updated every 60s by cron)
    if (liveMatchCache.size > 0) {
      return res.json({
        status: 'live',
        source: 'cache',
        matches: Array.from(liveMatchCache.values()),
      });
    }

    // Cache miss — fetch directly (uses 1 API call)
    const matches = await fetchIPLMatches();
    const live = matches.filter(m => m.matchStarted && !m.matchEnded);

    return res.json({
      status: live.length > 0 ? 'live' : 'no_live_matches',
      source: 'api',
      count: live.length,
      matches: live.map(m => ({ ...m, parsedScore: parseScore(m) })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/live/test — test API key & connection
router.get('/test', async (_req: Request, res: Response) => {
  try {
    const all = await fetchCurrentMatches();
    const ipl = all.filter(m => m.isIPL);
    res.json({
      status: 'ok',
      total_matches: all.length,
      ipl_matches: ipl.length,
      api_calls_used_today: 'check cricapi.com dashboard',
      sample: all[0] || null,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /api/live/:apiId — single match from cache
router.get('/:apiId', (req: Request, res: Response) => {
  const cached = liveMatchCache.get(req.params.apiId);
  if (!cached) {
    return res.status(404).json({ 
      message: 'Match not in live cache. IPL starts March 28, 2026.' 
    });
  }
  res.json(cached);
});

export default router;
