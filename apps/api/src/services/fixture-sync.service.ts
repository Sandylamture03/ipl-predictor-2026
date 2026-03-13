import axios from 'axios';
import { PoolClient } from 'pg';
import { pool } from '../db/connection';

type CricketMatch = {
  id: string;
  name?: string;
  matchType?: string;
  status?: string;
  venue?: string;
  date?: string;
  dateTimeGMT?: string;
  teams?: string[];
  series_id?: string;
  matchStarted?: boolean;
  matchEnded?: boolean;
};

type CricketSeries = {
  id: string;
  name?: string;
};

type CricketApiResponse<T> = {
  status: string;
  data: T;
};

export type FixtureSyncResult = {
  fetched: number;
  upserted: number;
  upcomingOrLive: number;
  seriesIds: string[];
};

const API_KEY = process.env.CRICKET_API_KEY || '';
const API_BASE = process.env.CRICKET_API_URL || 'https://api.cricapi.com/v1';
const TARGET_SEASON = process.env.IPL_SEASON || '2026';
const TARGET_EVENT_NAME = `Indian Premier League ${TARGET_SEASON}`;

const TEAM_SHORT: Record<string, string> = {
  'chennai super kings': 'CSK',
  'mumbai indians': 'MI',
  'royal challengers bengaluru': 'RCB',
  'royal challengers bangalore': 'RCB',
  'kolkata knight riders': 'KKR',
  'delhi capitals': 'DC',
  'punjab kings': 'PBKS',
  'rajasthan royals': 'RR',
  'sunrisers hyderabad': 'SRH',
  'gujarat titans': 'GT',
  'lucknow super giants': 'LSG',
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function inferShortName(teamName: string): string {
  const key = normalize(teamName);
  if (TEAM_SHORT[key]) return TEAM_SHORT[key];

  const letters = teamName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
  return letters.slice(0, 5) || teamName.slice(0, 4).toUpperCase();
}

function parseVenue(rawVenue: string | undefined): { name: string; city: string } {
  const value = (rawVenue || '').trim();
  if (!value) return { name: 'Unknown', city: '' };

  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return { name: value, city: '' };

  return {
    name: parts.slice(0, -1).join(', '),
    city: parts[parts.length - 1],
  };
}

function parseMatchNumber(name: string | undefined): number | null {
  const match = (name || '').match(/(\d+)(?:st|nd|rd|th)\s+match/i);
  return match ? Number(match[1]) : null;
}

function inferStage(name: string | undefined): string {
  const value = (name || '').toLowerCase();
  if (value.includes('qualifier')) return 'qualifier';
  if (value.includes('eliminator')) return 'eliminator';
  if (value.includes('final')) return 'final';
  return 'league';
}

function toMatchDateTime(
  dateTimeGMT: string | undefined,
  dateOnly: string | undefined
): { matchDate: string | null; matchTime: string | null } {
  const raw = dateTimeGMT || dateOnly;
  if (!raw) return { matchDate: null, matchTime: null };

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { matchDate: null, matchTime: null };

  const iso = parsed.toISOString();
  return {
    matchDate: iso.slice(0, 10),
    matchTime: iso.slice(11, 19),
  };
}

async function apiGet<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T> {
  if (!API_KEY) {
    throw new Error('CRICKET_API_KEY is not set');
  }

  const { data } = await axios.get<CricketApiResponse<T>>(`${API_BASE}/${endpoint}`, {
    params: { apikey: API_KEY, ...params },
    timeout: 15000,
  });

  if (data.status !== 'success') {
    throw new Error(`Cricket API status for ${endpoint}: ${data.status}`);
  }
  return data.data;
}

async function fetchSeriesIds(): Promise<Set<string>> {
  const rows = await apiGet<CricketSeries[]>('series', { search: TARGET_EVENT_NAME });
  const ids = new Set<string>();
  for (const row of rows || []) {
    const name = (row.name || '').toLowerCase();
    if (name.includes('indian premier league') && name.includes(TARGET_SEASON) && row.id) {
      ids.add(String(row.id));
    }
  }
  return ids;
}

async function fetchMatches(maxPages = 12): Promise<CricketMatch[]> {
  const all: CricketMatch[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * 25;
    const rows = await apiGet<CricketMatch[]>('matches', { offset });
    all.push(...rows);
    if (rows.length < 25) break;
  }
  return all;
}

async function upsertTeam(client: PoolClient, teamName: string): Promise<number> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO teams (name, short_name)
     VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET short_name = EXCLUDED.short_name
     RETURNING id`,
    [teamName, inferShortName(teamName)]
  );
  return Number(result.rows[0].id);
}

async function upsertVenue(client: PoolClient, venueName: string, city: string): Promise<number> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO venues (name, city)
     VALUES ($1, $2)
     ON CONFLICT (name, city) DO UPDATE SET city = EXCLUDED.city
     RETURNING id`,
    [venueName, city]
  );
  return Number(result.rows[0].id);
}

function isTargetFixture(match: CricketMatch, seriesIds: Set<string>): boolean {
  const name = (match.name || '').toLowerCase();
  if (name.includes('indian premier league') && name.includes(TARGET_SEASON)) return true;
  return !!match.series_id && seriesIds.has(String(match.series_id));
}

async function upsertFixture(client: PoolClient, match: CricketMatch, seriesIds: Set<string>): Promise<boolean> {
  if (!isTargetFixture(match, seriesIds)) return false;

  const teams = Array.isArray(match.teams) ? match.teams : [];
  if (teams.length < 2) return false;

  const team1Name = String(teams[0] || '').trim();
  const team2Name = String(teams[1] || '').trim();
  if (!team1Name || !team2Name || normalize(team1Name) === normalize(team2Name)) return false;

  const { name: venueName, city } = parseVenue(match.venue);
  const { matchDate, matchTime } = toMatchDateTime(match.dateTimeGMT, match.date);
  if (!matchDate) return false;

  const team1Id = await upsertTeam(client, team1Name);
  const team2Id = await upsertTeam(client, team2Name);
  const venueId = await upsertVenue(client, venueName, city);
  const matchNumber = parseMatchNumber(match.name);
  const stage = inferStage(match.name);

  const status = match.matchEnded ? 'completed' : (match.matchStarted ? 'live' : 'upcoming');

  await client.query(
    `INSERT INTO matches (
      external_match_ref, source_match_key, season, match_date, match_time,
      event_name, match_number, stage, venue_id, team1_id, team2_id,
      toss_winner_team_id, toss_decision, match_type, overs_limit, status
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10, $11,
      NULL, NULL, $12, $13, $14
    )
    ON CONFLICT (external_match_ref) DO UPDATE SET
      source_match_key = EXCLUDED.source_match_key,
      season = EXCLUDED.season,
      match_date = EXCLUDED.match_date,
      match_time = EXCLUDED.match_time,
      event_name = EXCLUDED.event_name,
      match_number = EXCLUDED.match_number,
      stage = EXCLUDED.stage,
      venue_id = EXCLUDED.venue_id,
      team1_id = EXCLUDED.team1_id,
      team2_id = EXCLUDED.team2_id,
      match_type = EXCLUDED.match_type,
      overs_limit = EXCLUDED.overs_limit,
      status = EXCLUDED.status,
      updated_at = NOW()`,
    [
      String(match.id),
      String(match.id),
      TARGET_SEASON,
      matchDate,
      matchTime,
      TARGET_EVENT_NAME,
      matchNumber,
      stage,
      venueId,
      team1Id,
      team2Id,
      String(match.matchType || 't20').toUpperCase(),
      20,
      status,
    ]
  );

  return true;
}

export async function syncIplFixtures(): Promise<FixtureSyncResult> {
  const seriesIds = await fetchSeriesIds();
  const matches = await fetchMatches();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    let upserted = 0;
    for (const match of matches) {
      const ok = await upsertFixture(client, match, seriesIds);
      if (ok) upserted += 1;
    }
    await client.query('COMMIT');

    const rows = await client.query<{ c: string }>(
      `SELECT COUNT(*)::int AS c
       FROM matches
       WHERE season = $1
         AND status IN ('upcoming', 'live')`,
      [TARGET_SEASON]
    );

    return {
      fetched: matches.length,
      upserted,
      upcomingOrLive: Number(rows.rows[0].c),
      seriesIds: Array.from(seriesIds),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
