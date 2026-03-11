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

export interface LiveMatchData {
  id: string;
  name: string;
  status: string;
  teams: string[];
  score: Array<{ r: number; w: number; o: number; inning: string }>;
  matchStarted: boolean;
  matchEnded: boolean;
  isIPL: boolean;
}

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
