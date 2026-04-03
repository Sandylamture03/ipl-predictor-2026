/**
 * Cricket Live Data Provider
 * Uses cricketdata.org (cricapi.com) free API — 100 calls/day
 * API Key: stored in CRICKET_API_KEY env var
 */
import axios from 'axios';

const API_KEY = process.env.CRICKET_API_KEY || '';
const BASE    = process.env.CRICKET_API_URL || 'https://api.cricapi.com/v1';

// IPL team short names to match against API data
const IPL_TEAMS = new Set([
  'CSK', 'MI', 'RCB', 'KKR', 'DC', 'PBKS', 'RR', 'SRH', 'GT', 'LSG',
  'Chennai Super Kings', 'Mumbai Indians', 'Royal Challengers Bengaluru',
  'Royal Challengers Bangalore', 'Kolkata Knight Riders', 'Delhi Capitals',
  'Punjab Kings', 'Rajasthan Royals', 'Sunrisers Hyderabad',
  'Gujarat Titans', 'Lucknow Super Giants',
]);

/* ─── Shared types ─────────────────────────────────────── */

export interface LiveMatchData {
  id: string;
  name: string;
  status: string;
  venue?: string;
  teams: string[];
  score: Array<{ r: number; w: number; o: number; inning: string }>;
  matchStarted: boolean;
  matchEnded: boolean;
  isIPL: boolean;
  tpiScore?: string;      // CricAPI tossChoice
  tossChoice?: string;
  tossWinner?: string;
}

export interface ScorecardBatsman {
  batsman: { id: string; name: string };
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  dismissal: string;        // e.g. "not out", "c & b Player"
  isNotOut: boolean;
}

export interface ScorecardBowler {
  bowler: { id: string; name: string };
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
  dots?: number;
}

export interface ScorecardInnings {
  inning: string;               // e.g. "Chennai Super Kings Inning 1"
  battingTeam?: string;
  total?: number;
  wickets?: number;
  overs?: number;
  batsman: ScorecardBatsman[];
  bowler: ScorecardBowler[];
  extras?: number;
}

export interface MatchScorecard {
  id: string;
  name: string;
  status: string;
  teams: string[];
  matchStarted: boolean;
  matchEnded: boolean;
  venue?: string;
  tossWinner?: string;
  tossChoice?: string;
  scorecard: ScorecardInnings[];
  raw: any;
}

export interface MatchInfo {
  id: string;
  name: string;
  status: string;
  teams: string[];
  venue?: string;
  tossWinner?: string;
  tossChoice?: string;
  matchStarted: boolean;
  matchEnded: boolean;
  score: Array<{ r: number; w: number; o: number; inning: string }>;
  raw: any;
}

/* ─── Fetch helpers ────────────────────────────────────── */

export async function fetchCurrentMatches(): Promise<LiveMatchData[]> {
  if (!API_KEY) {
    console.warn('⚠️  CRICKET_API_KEY not set — skipping live fetch');
    return [];
  }

  try {
    const { data } = await axios.get(`${BASE}/currentMatches`, {
      params: { apikey: API_KEY, offset: 0 },
      timeout: 10000,
    });

    if (data.status !== 'success' || !Array.isArray(data.data)) {
      console.warn('Cricket API returned unexpected response', data.status);
      return [];
    }

    return data.data.map((m: any) => ({
      ...m,
      isIPL: isIPLMatch(m),
    }));
  } catch (err: any) {
    console.error('Cricket API error:', err.message);
    return [];
  }
}

export async function fetchIPLMatches(): Promise<LiveMatchData[]> {
  const all = await fetchCurrentMatches();
  return all.filter(m => m.isIPL);
}

/**
 * Fetch full scorecard for a specific match.
 * Costs 1 API call — use sparingly (every 3 min).
 */
export async function fetchMatchScorecard(apiMatchId: string): Promise<MatchScorecard | null> {
  if (!API_KEY) return null;

  try {
    const { data } = await axios.get(`${BASE}/match_scorecard`, {
      params: { apikey: API_KEY, id: apiMatchId },
      timeout: 15000,
    });

    if (data.status !== 'success' || !data.data) {
      console.warn(`Scorecard API failed for ${apiMatchId}: ${data.status}`);
      return null;
    }

    const d = data.data;
    const scorecard: ScorecardInnings[] = (d.scorecard || []).map((inn: any) => ({
      inning: inn.inning || '',
      battingTeam: inn.battingTeam || _extractTeamFromInning(inn.inning),
      total: inn.total ?? null,
      wickets: inn.wickets ?? null,
      overs: inn.overs ?? null,
      batsman: (inn.batsman || []).map((b: any) => ({
        batsman: { id: b.batsman?.id || '', name: b.batsman?.name || b.name || '' },
        runs: b.runs ?? 0,
        balls: b.balls ?? 0,
        fours: b.fours ?? 0,
        sixes: b.sixes ?? 0,
        strikeRate: b.strikeRate ?? 0,
        dismissal: b.dismissal || '',
        isNotOut: _isNotOut(b),
      })),
      bowler: (inn.bowler || []).map((bw: any) => ({
        bowler: { id: bw.bowler?.id || '', name: bw.bowler?.name || bw.name || '' },
        overs: bw.overs ?? 0,
        maidens: bw.maidens ?? 0,
        runs: bw.runs ?? 0,
        wickets: bw.wickets ?? 0,
        economy: bw.economy ?? 0,
        dots: bw.dots ?? undefined,
      })),
      extras: inn.extras ?? 0,
    }));

    return {
      id: d.id,
      name: d.name || '',
      status: d.status || '',
      teams: d.teams || [],
      matchStarted: !!d.matchStarted,
      matchEnded: !!d.matchEnded,
      venue: d.venue || '',
      tossWinner: d.tossWinner || '',
      tossChoice: d.tossChoice || '',
      scorecard,
      raw: d,
    };
  } catch (err: any) {
    console.error(`Scorecard fetch error for ${apiMatchId}: ${err.message}`);
    return null;
  }
}

/**
 * Fetch match info (lighter than scorecard — gives toss, venue, scores).
 * Costs 1 API call.
 */
export async function fetchMatchInfo(apiMatchId: string): Promise<MatchInfo | null> {
  if (!API_KEY) return null;

  try {
    const { data } = await axios.get(`${BASE}/match_info`, {
      params: { apikey: API_KEY, id: apiMatchId },
      timeout: 10000,
    });

    if (data.status !== 'success' || !data.data) return null;
    const d = data.data;

    return {
      id: d.id,
      name: d.name || '',
      status: d.status || '',
      teams: d.teams || [],
      venue: d.venue || '',
      tossWinner: d.tossWinner || '',
      tossChoice: d.tossChoice || '',
      matchStarted: !!d.matchStarted,
      matchEnded: !!d.matchEnded,
      score: d.score || [],
      raw: d,
    };
  } catch (err: any) {
    console.error(`Match info fetch error for ${apiMatchId}: ${err.message}`);
    return null;
  }
}

/* ─── Utilities ────────────────────────────────────────── */

export function isIPLMatch(m: any): boolean {
  if (!m.teams) return false;
  const nameUpper = (m.name || '').toUpperCase();
  if (nameUpper.includes('IPL') || nameUpper.includes('INDIAN PREMIER LEAGUE')) return true;
  return m.teams.some((t: string) => IPL_TEAMS.has(t));
}

export function parseScore(match: LiveMatchData) {
  const scores = match.score || [];
  const inn1 = scores.find(s => s.inning.toLowerCase().includes('inning 1'));
  const inn2 = scores.find(s => s.inning.toLowerCase().includes('inning 2'));

  return {
    team1_score: inn1 ? `${inn1.r}/${inn1.w}` : null,
    team1_overs: inn1?.o ?? null,
    team2_score: inn2 ? `${inn2.r}/${inn2.w}` : null,
    team2_overs: inn2?.o ?? null,
    target:      inn2 ? (inn1?.r ?? 0) + 1 : null,
    current_run_rate: inn2 ? +(inn2.r / Math.max(inn2.o, 0.1)).toFixed(2) : null,
    required_run_rate: inn2 && inn1
      ? +(((inn1.r + 1 - inn2.r) / Math.max((20 - inn2.o), 0.1))).toFixed(2)
      : null,
  };
}

function _extractTeamFromInning(inning: string): string {
  // "Chennai Super Kings Inning 1" → "Chennai Super Kings"
  return (inning || '').replace(/\s*inning\s*\d+\s*/i, '').trim();
}

function _isNotOut(b: any): boolean {
  const d = (b.dismissal || '').toLowerCase().trim();
  return !d || d === 'not out' || d === 'batting';
}
