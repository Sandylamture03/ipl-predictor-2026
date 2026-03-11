/**
 * IPL Cricsheet Fast Importer — matches + innings only (no deliveries)
 * The ML model needs match outcomes, not ball-by-ball data.
 * Run from project root: node scripts\import_cricsheet.js .\data\cricsheet
 * ~1,169 matches imports in ~2–3 minutes instead of hours
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('❌ Set DATABASE_URL first'); process.exit(1); }

const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 5 });

// ─── Cache to avoid repeat lookups ───────────────────────────
const teamCache   = {};
const venueCache  = {};
const playerCache = {};

async function upsertTeam(client, name) {
  if (teamCache[name]) return teamCache[name];
  const short = name.replace(/\b(\w)/g, c => c).replace(/[^A-Z]/g, '').slice(0, 5) || name.slice(0, 4).toUpperCase();
  const r = await client.query(
    `INSERT INTO teams (name, short_name) VALUES ($1,$2)
     ON CONFLICT (name) DO UPDATE SET short_name = EXCLUDED.short_name RETURNING id`, [name, short]);
  teamCache[name] = r.rows[0].id;
  return teamCache[name];
}

async function upsertVenue(client, venue, city) {
  const key = `${venue}|${city}`;
  if (venueCache[key]) return venueCache[key];
  const r = await client.query(
    `INSERT INTO venues (name, city) VALUES ($1,$2)
     ON CONFLICT (name, city) DO UPDATE SET city = EXCLUDED.city RETURNING id`,
    [venue || 'Unknown', city || '']);
  venueCache[key] = r.rows[0].id;
  return venueCache[key];
}

async function importMatch(client, filePath) {
  const raw  = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const { info, innings } = data;
  if (!info || !Array.isArray(info.teams) || info.teams.length < 2) return;

  const team1Id  = await upsertTeam(client, info.teams[0]);
  const team2Id  = await upsertTeam(client, info.teams[1]);
  const venueId  = await upsertVenue(client, info.venue, info.city);
  const winnerId = info.outcome?.winner
    ? (info.outcome.winner === info.teams[0] ? team1Id : team2Id) : null;
  const tossWinnerId = info.toss?.winner === info.teams[0] ? team1Id : team2Id;
  const matchRef = path.basename(filePath, '.json');

  const mr = await client.query(
    `INSERT INTO matches
       (external_match_ref, season, match_date, event_name, match_number, stage,
        venue_id, team1_id, team2_id, toss_winner_team_id, toss_decision,
        winner_team_id, result_type, win_by_runs, win_by_wickets, method,
        player_of_match, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'completed')
     ON CONFLICT (external_match_ref) DO NOTHING RETURNING id`,
    [
      matchRef,
      String(info.season ?? ''),
      info.dates?.[0] ?? '2008-01-01',
      info.event?.name ?? 'IPL',
      info.event?.match_number ?? null,
      info.event?.stage ?? 'league',
      venueId, team1Id, team2Id, tossWinnerId,
      info.toss?.decision ?? 'bat',
      winnerId,
      info.outcome?.result ?? 'win',
      info.outcome?.by?.runs ?? null,
      info.outcome?.by?.wickets ?? null,
      info.outcome?.method ?? null,
      info.player_of_match?.[0] ?? null,
    ]);

  if (!mr.rows[0]) return; // already imported
  const matchId = mr.rows[0].id;

  // Innings summary (fast — no per-delivery inserts)
  if (Array.isArray(innings)) {
    for (let i = 0; i < innings.length; i++) {
      const inn = innings[i];
      if (!inn?.team) continue;
      const battingTeamId  = inn.team === info.teams[0] ? team1Id : team2Id;
      const bowlingTeamId  = battingTeamId === team1Id ? team2Id : team1Id;

      let runs = 0, wkts = 0, overs = 0;
      for (const ov of (inn.overs ?? [])) {
        for (const d of ov.deliveries) {
          runs += d.runs?.total ?? 0;
          if (d.wickets?.length) wkts++;
        }
        overs = ov.over + 1;
      }

      await client.query(
        `INSERT INTO innings
           (match_id, innings_number, batting_team_id, bowling_team_id,
            target_runs, target_overs, total_runs, wickets_lost, overs_bowled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT DO NOTHING`,
        [matchId, i+1, battingTeamId, bowlingTeamId,
         inn.target?.runs ?? null, inn.target?.overs ?? null,
         runs, wkts, overs]);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) {
    console.error(`❌ Data directory not found: ${dir}`); process.exit(1);
  }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  console.log(`📦 Found ${files.length} match files — importing (fast mode, no deliveries)...`);

  const client = await pool.connect();
  let imported = 0, skipped = 0, errors = 0;
  const t0 = Date.now();

  for (const file of files) {
    try {
      await importMatch(client, path.join(dir, file));
      imported++;
      if (imported % 100 === 0) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
        console.log(`  ✅ ${imported}/${files.length} (${elapsed}s elapsed)`);
      }
    } catch (err) {
      errors++;
      if (errors <= 3) console.error(`  ⚠️  ${file}: ${err.message}`);
    }
  }

  client.release();
  await pool.end();
  const total = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n🏏 Done in ${total}s!  Imported: ${imported} | Errors: ${errors}`);
}

main().catch(e => { console.error(e); process.exit(1); });
