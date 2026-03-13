'use strict';

const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const DB_URL = process.env.DATABASE_URL;
const API_KEY = process.env.CRICKET_API_KEY;
const API_BASE = process.env.CRICKET_API_URL || 'https://api.cricapi.com/v1';
const TARGET_SEASON = process.env.IPL_SEASON || '2026';
const TARGET_EVENT_NAME = `Indian Premier League ${TARGET_SEASON}`;

if (!DB_URL) {
  console.error('ERROR: DATABASE_URL is required');
  process.exit(1);
}
if (!API_KEY) {
  console.error('ERROR: CRICKET_API_KEY is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

const TEAM_SHORT = new Map([
  ['chennai super kings', 'CSK'],
  ['mumbai indians', 'MI'],
  ['royal challengers bengaluru', 'RCB'],
  ['royal challengers bangalore', 'RCB'],
  ['kolkata knight riders', 'KKR'],
  ['delhi capitals', 'DC'],
  ['punjab kings', 'PBKS'],
  ['rajasthan royals', 'RR'],
  ['sunrisers hyderabad', 'SRH'],
  ['gujarat titans', 'GT'],
  ['lucknow super giants', 'LSG'],
]);

function normalize(v) {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function inferShortName(teamName) {
  const key = normalize(teamName);
  if (TEAM_SHORT.has(key)) return TEAM_SHORT.get(key);
  const letters = String(teamName || '')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0].toUpperCase())
    .join('');
  return letters.slice(0, 5) || String(teamName || '').slice(0, 4).toUpperCase();
}

function parseVenue(rawVenue) {
  const v = String(rawVenue || '').trim();
  if (!v) return { name: 'Unknown', city: '' };
  const parts = v.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      name: parts.slice(0, -1).join(', '),
      city: parts[parts.length - 1],
    };
  }
  return { name: v, city: '' };
}

function parseMatchNumber(name) {
  const m = String(name || '').match(/(\d+)(?:st|nd|rd|th)\s+match/i);
  return m ? Number(m[1]) : null;
}

function inferStage(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('qualifier')) return 'qualifier';
  if (n.includes('eliminator')) return 'eliminator';
  if (n.includes('final')) return 'final';
  return 'league';
}

function toDateTimeParts(dateTimeGMT, dateOnly) {
  const raw = dateTimeGMT || dateOnly;
  if (!raw) return { matchDate: null, matchTime: null };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return { matchDate: null, matchTime: null };
  }
  const iso = d.toISOString();
  return {
    matchDate: iso.slice(0, 10),
    matchTime: iso.slice(11, 19),
  };
}

async function apiGet(endpoint, params = {}) {
  const url = new URL(`${API_BASE}/${endpoint}`);
  url.searchParams.set('apikey', API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) {
    throw new Error(`API ${endpoint} failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.status !== 'success') {
    throw new Error(`API ${endpoint} returned status=${data.status}`);
  }
  return data;
}

async function fetchIpl2026SeriesIds() {
  const series = await apiGet('series', { search: 'Indian Premier League 2026' });
  const ids = new Set();
  for (const row of series.data || []) {
    const name = String(row.name || '').toLowerCase();
    if (name.includes('indian premier league') && name.includes('2026') && row.id) {
      ids.add(String(row.id));
    }
  }
  return ids;
}

async function fetchAllMatches(maxPages = 12) {
  const all = [];
  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * 25;
    const data = await apiGet('matches', { offset });
    const rows = Array.isArray(data.data) ? data.data : [];
    all.push(...rows);
    if (rows.length < 25) break;
  }
  return all;
}

async function upsertTeam(client, teamName) {
  const short = inferShortName(teamName);
  const r = await client.query(
    `INSERT INTO teams (name, short_name)
     VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET short_name = EXCLUDED.short_name
     RETURNING id`,
    [teamName, short]
  );
  return Number(r.rows[0].id);
}

async function upsertVenue(client, venueName, city) {
  const r = await client.query(
    `INSERT INTO venues (name, city)
     VALUES ($1, $2)
     ON CONFLICT (name, city) DO UPDATE SET city = EXCLUDED.city
     RETURNING id`,
    [venueName, city || '']
  );
  return Number(r.rows[0].id);
}

async function upsertFixture(client, fixture, seriesIds) {
  const name = String(fixture.name || '');
  const isIpl2026 =
    name.toLowerCase().includes('indian premier league 2026') ||
    (fixture.series_id && seriesIds.has(String(fixture.series_id)));
  if (!isIpl2026) return false;

  const teams = Array.isArray(fixture.teams) ? fixture.teams : [];
  if (teams.length < 2) return false;

  const team1Name = String(teams[0] || '').trim();
  const team2Name = String(teams[1] || '').trim();
  if (!team1Name || !team2Name || normalize(team1Name) === normalize(team2Name)) return false;

  const { name: venueName, city } = parseVenue(fixture.venue);
  const { matchDate, matchTime } = toDateTimeParts(fixture.dateTimeGMT, fixture.date);
  if (!matchDate) return false;

  const team1Id = await upsertTeam(client, team1Name);
  const team2Id = await upsertTeam(client, team2Name);
  const venueId = await upsertVenue(client, venueName, city);
  const matchNumber = parseMatchNumber(name);
  const stage = inferStage(name);

  const status = fixture.matchEnded
    ? 'completed'
    : (fixture.matchStarted ? 'live' : 'upcoming');

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
      String(fixture.id),
      String(fixture.id),
      TARGET_SEASON,
      matchDate,
      matchTime,
      TARGET_EVENT_NAME,
      matchNumber,
      stage,
      venueId,
      team1Id,
      team2Id,
      String(fixture.matchType || 't20').toUpperCase(),
      20,
      status,
    ]
  );

  return true;
}

async function run() {
  const client = await pool.connect();
  try {
    console.log('Fetching IPL 2026 series IDs...');
    const seriesIds = await fetchIpl2026SeriesIds();
    console.log(`Series IDs: ${Array.from(seriesIds).join(', ') || 'none-found'}`);

    console.log('Fetching match fixtures from API...');
    const all = await fetchAllMatches();
    console.log(`Fetched ${all.length} matches from API`);

    await client.query('BEGIN');
    let upserted = 0;
    for (const fixture of all) {
      const ok = await upsertFixture(client, fixture, seriesIds);
      if (ok) upserted += 1;
    }
    await client.query('COMMIT');

    const count = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM matches
       WHERE season = $1 AND status IN ('upcoming', 'live')`,
      [TARGET_SEASON]
    );

    console.log(`IPL 2026 fixtures upserted this run: ${upserted}`);
    console.log(`IPL 2026 upcoming/live in DB: ${count.rows[0].c}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Fixture sync failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
