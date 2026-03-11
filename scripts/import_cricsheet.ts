/**
 * Cricsheet IPL JSON Importer
 * Usage: npx ts-node scripts/import_cricsheet.ts [path/to/cricsheet/ipl_json]
 *
 * Download data from: https://cricsheet.org/downloads/ipl_json.zip
 * Extract the zip and point this script at the extracted folder.
 */

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://ipl_user:ipl_pass_2026@localhost:5432/ipl_predictor',
});

// ─── Types matching Cricsheet JSON format ────────────────────
interface CricsheetDelivery {
  batter: string; bowler: string; non_striker: string;
  runs: { batter: number; extras: number; total: number; non_boundary?: boolean };
  extras?: { wides?: number; noballs?: number; byes?: number; legbyes?: number; penalty?: number };
  wickets?: Array<{ player_out: string; kind: string; fielders?: Array<{ name: string }> }>;
}

interface CricsheetOver { over: number; deliveries: CricsheetDelivery[]; }
interface CricsheetInnings { team: string; overs?: CricsheetOver[]; target?: { runs: number; overs: number }; }
interface CricsheetMatch {
  info: {
    teams: string[]; dates: string[]; venue: string; city?: string;
    season: string; event?: { name?: string; match_number?: number; stage?: string };
    toss: { winner: string; decision: string };
    outcome: { winner?: string; result?: string; by?: { runs?: number; wickets?: number }; method?: string };
    players: Record<string, string[]>;
    registry: { people: Record<string, string> };
    player_of_match?: string[];
  };
  innings: CricsheetInnings[];
}

// ─── Helpers ─────────────────────────────────────────────────
async function upsertTeam(client: Pool, name: string): Promise<number> {
  const res = await client.query(
    `INSERT INTO teams (name, short_name) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [name, name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 5)]
  );
  return res.rows[0].id;
}

async function upsertVenue(client: Pool, venue: string, city: string): Promise<number> {
  const res = await client.query(
    `INSERT INTO venues (name, city) VALUES ($1, $2) ON CONFLICT (name, city) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [venue, city || '']
  );
  return res.rows[0].id;
}

async function upsertPlayer(client: Pool, name: string, cricsheetId: string): Promise<number> {
  const res = await client.query(
    `INSERT INTO players (name, cricsheet_player_id) VALUES ($1, $2)
     ON CONFLICT (cricsheet_player_id) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [name, cricsheetId]
  );
  return res.rows[0].id;
}

// ─── Import one match file ────────────────────────────────────
async function importMatch(client: Pool, filePath: string): Promise<void> {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data: CricsheetMatch = JSON.parse(raw);
  const { info, innings } = data;

  const team1Id = await upsertTeam(client, info.teams[0]);
  const team2Id = await upsertTeam(client, info.teams[1]);
  const venueId = await upsertVenue(client, info.venue, info.city || '');

  const tossWinnerId = info.toss.winner === info.teams[0] ? team1Id : team2Id;
  const winnerId = info.outcome?.winner
    ? (info.outcome.winner === info.teams[0] ? team1Id : team2Id)
    : null;

  // Registry → player IDs
  const playerMap: Record<string, number> = {};
  for (const [name, cricId] of Object.entries(info.registry.people)) {
    playerMap[name] = await upsertPlayer(client, name, cricId);
  }

  const matchRef = path.basename(filePath, '.json');
  const matchRes = await client.query(
    `INSERT INTO matches (external_match_ref, season, match_date, event_name, match_number, stage,
       venue_id, team1_id, team2_id, toss_winner_team_id, toss_decision,
       winner_team_id, result_type, win_by_runs, win_by_wickets, method,
       player_of_match, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'completed')
     ON CONFLICT (external_match_ref) DO NOTHING RETURNING id`,
    [
      matchRef, info.season, info.dates[0],
      info.event?.name || 'IPL', info.event?.match_number || null, info.event?.stage || 'league',
      venueId, team1Id, team2Id, tossWinnerId, info.toss.decision,
      winnerId, info.outcome?.result || 'win',
      info.outcome?.by?.runs || null, info.outcome?.by?.wickets || null,
      info.outcome?.method || null,
      info.player_of_match ? info.player_of_match[0] : null,
    ]
  );

  if (!matchRes.rows[0]) return; // Already imported

  const matchId = matchRes.rows[0].id;

  // Match players
  for (const [teamName, players] of Object.entries(info.players)) {
    const teamId = teamName === info.teams[0] ? team1Id : team2Id;
    for (const playerName of players) {
      const pid = playerMap[playerName];
      if (!pid) continue;
      await client.query(
        `INSERT INTO match_players (match_id, team_id, player_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [matchId, teamId, pid]
      );
    }
  }

  // Innings & Deliveries
  for (let inningsIdx = 0; inningsIdx < innings.length; inningsIdx++) {
    const inn = innings[inningsIdx];
    const battingTeamId = inn.team === info.teams[0] ? team1Id : team2Id;
    const bowlingTeamId = battingTeamId === team1Id ? team2Id : team1Id;

    // Aggregate innings totals from deliveries
    let totalRuns = 0, wicketsLost = 0, lastOver = 0;
    for (const ov of (inn.overs || [])) {
      for (const d of ov.deliveries) { totalRuns += d.runs.total; if (d.wickets?.length) wicketsLost++; }
      lastOver = ov.over + 1;
    }

    const innRes = await client.query(
      `INSERT INTO innings (match_id, innings_number, batting_team_id, bowling_team_id,
         target_runs, target_overs, total_runs, wickets_lost, overs_bowled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [matchId, inningsIdx + 1, battingTeamId, bowlingTeamId,
       inn.target?.runs || null, inn.target?.overs || null,
       totalRuns, wicketsLost, lastOver]
    );
    const inningsId = innRes.rows[0].id;

    // Deliveries
    let legalBall = 0;
    for (const ov of (inn.overs || [])) {
      for (let ballIdx = 0; ballIdx < ov.deliveries.length; ballIdx++) {
        const d = ov.deliveries[ballIdx];
        const isExtra = d.extras && (d.extras.wides || d.extras.noballs);
        if (!isExtra) legalBall++;
        const extraType = d.extras
          ? Object.keys(d.extras)[0] || null : null;
        const extraRuns = d.extras ? Object.values(d.extras)[0] || 0 : 0;
        const wicket = d.wickets?.[0];

        await client.query(
          `INSERT INTO deliveries (match_id, innings_id, innings_number, over_number, ball_in_over, legal_ball_number,
             batter_id, bowler_id, non_striker_id,
             runs_batter, runs_extras, runs_total,
             extra_type, extra_runs,
             is_wicket, wicket_kind, player_out_id, fielder1_id,
             is_boundary_four, is_boundary_six)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
           ON CONFLICT DO NOTHING`,
          [
            matchId, inningsId, inningsIdx + 1, ov.over, ballIdx, legalBall,
            playerMap[d.batter] || null, playerMap[d.bowler] || null, playerMap[d.non_striker] || null,
            d.runs.batter, d.runs.extras, d.runs.total,
            extraType, extraRuns,
            !!wicket, wicket?.kind || null,
            wicket ? playerMap[wicket.player_out] || null : null,
            wicket?.fielders?.[0] ? playerMap[wicket.fielders[0].name] || null : null,
            d.runs.batter === 4 && !d.runs.non_boundary,
            d.runs.batter === 6,
          ]
        );
      }
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  const dir = process.argv[2] || path.join(process.cwd(), 'data', 'cricsheet');
  if (!fs.existsSync(dir)) {
    console.error(`❌ Folder not found: ${dir}`);
    console.error('Download IPL JSON from https://cricsheet.org/downloads/ and extract to data/cricsheet/');
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  console.log(`📦 Found ${files.length} Cricsheet match files`);

  let imported = 0, skipped = 0, errors = 0;
  await pool.query(
    `INSERT INTO ingestion_runs (source_name, run_type, status) VALUES ('cricsheet','full_import','started') RETURNING id`
  );

  for (const file of files) {
    try {
      await importMatch(pool, path.join(dir, file));
      imported++;
      if (imported % 100 === 0) console.log(`  ✅ Imported ${imported}/${files.length}...`);
    } catch (err) {
      console.error(`  ⚠️  Error in ${file}:`, (err as Error).message);
      errors++;
    }
  }

  await pool.query(
    `INSERT INTO ingestion_runs (source_name, run_type, status, finished_at, records_processed, message)
     VALUES ('cricsheet','full_import','success',NOW(),$1,$2)`,
    [imported, `Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors}`]
  );

  console.log(`\n🏏 Done! Imported: ${imported} | Errors: ${errors}`);
  await pool.end();
}

main().catch(console.error);
