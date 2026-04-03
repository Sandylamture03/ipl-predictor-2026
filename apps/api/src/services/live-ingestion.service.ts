/**
 * Live Ingestion Service
 *
 * Orchestrates the flow:
 *   cricapi.com → PostgreSQL (live_match_state, innings, players, deliveries)
 *                → ML service (trigger live prediction)
 *
 * Two cadences:
 *   - Fast cycle (60s): uses cached /currentMatches data to upsert live_match_state
 *   - Detail cycle (180s): calls /match_scorecard per match for player/bowler detail
 */

import axios from 'axios';
import { PoolClient } from 'pg';
import { pool, queryOne } from '../db/connection';
import {
  LiveMatchData,
  MatchScorecard,
  ScorecardInnings,
  fetchMatchScorecard,
  parseScore,
} from '../providers/cricket.provider';

const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';

/* ─── Team name normalisation (reuse fixture-sync map) ─── */

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

function normalize(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
}

/* ─── DB Helpers ──────────────────────────────────────── */

async function resolveMatchId(client: PoolClient, apiMatchId: string): Promise<number | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM matches WHERE external_match_ref = $1 LIMIT 1`,
    [apiMatchId],
  );
  return result.rows[0] ? Number(result.rows[0].id) : null;
}

async function resolveTeamId(client: PoolClient, teamName: string): Promise<number | null> {
  // Try exact match first
  let result = await client.query<{ id: string }>(
    `SELECT id FROM teams WHERE name = $1 LIMIT 1`,
    [teamName],
  );
  if (result.rows[0]) return Number(result.rows[0].id);

  // Try short name
  const short = TEAM_SHORT[normalize(teamName)];
  if (short) {
    result = await client.query<{ id: string }>(
      `SELECT id FROM teams WHERE short_name = $1 LIMIT 1`,
      [short],
    );
    if (result.rows[0]) return Number(result.rows[0].id);
  }

  return null;
}

async function upsertPlayer(client: PoolClient, name: string, externalRef?: string): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) return 0;

  // Try find by name first
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM players WHERE name = $1 LIMIT 1`,
    [trimmed],
  );
  if (existing.rows[0]) return Number(existing.rows[0].id);

  // Insert new
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO players (name, external_player_ref)
     VALUES ($1, $2)
     ON CONFLICT (cricsheet_player_id) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [trimmed, externalRef || null],
  );

  // If ON CONFLICT didn't fire and no row returned (cricsheet_player_id was null),
  // we need a simpler insert:
  if (inserted.rows[0]) return Number(inserted.rows[0].id);

  // Fallback: insert without conflict constraint
  const fallback = await client.query<{ id: string }>(
    `INSERT INTO players (name) VALUES ($1) RETURNING id`,
    [trimmed],
  );
  return fallback.rows[0] ? Number(fallback.rows[0].id) : 0;
}

async function upsertInnings(
  client: PoolClient,
  matchId: number,
  inningsNumber: number,
  battingTeamId: number,
  bowlingTeamId: number | null,
  totalRuns: number,
  wicketsLost: number,
  oversBowled: number,
  targetRuns: number | null,
): Promise<number> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO innings (match_id, innings_number, batting_team_id, bowling_team_id,
       total_runs, wickets_lost, overs_bowled, target_runs)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (match_id, innings_number)
     DO UPDATE SET
       total_runs = EXCLUDED.total_runs,
       wickets_lost = EXCLUDED.wickets_lost,
       overs_bowled = EXCLUDED.overs_bowled,
       target_runs = EXCLUDED.target_runs
     RETURNING id`,
    [matchId, inningsNumber, battingTeamId, bowlingTeamId, totalRuns, wicketsLost, oversBowled, targetRuns],
  );
  return Number(result.rows[0].id);
}

/* ─── Fast Cycle: match-level state ──────────────────── */

export interface FastCycleResult {
  matchesProcessed: number;
  matchesUpdated: number;
  errors: string[];
}

/**
 * Fast ingestion cycle — uses already-fetched currentMatches data.
 * Upserts `live_match_state` with score/wickets/overs from the cached API response.
 * Does NOT call any additional API endpoints (zero extra API cost).
 */
export async function runFastCycle(liveMatches: LiveMatchData[]): Promise<FastCycleResult> {
  const result: FastCycleResult = { matchesProcessed: 0, matchesUpdated: 0, errors: [] };
  if (liveMatches.length === 0) return result;

  const client = await pool.connect();
  try {
    for (const match of liveMatches) {
      result.matchesProcessed++;
      try {
        const matchId = await resolveMatchId(client, match.id);
        if (!matchId) {
          result.errors.push(`No DB match for API id=${match.id} (${match.name})`);
          continue;
        }

        const parsed = parseScore(match);
        const scores = match.score || [];
        const latestInnings = scores.length >= 2 ? 2 : 1;
        const latestScore = latestInnings === 2 ? scores[1] : scores[0];

        const score = latestScore?.r ?? 0;
        const wickets = latestScore?.w ?? 0;
        const overs = latestScore?.o ?? 0;
        const target = parsed.target ?? null;
        const crr = parsed.current_run_rate ?? (overs > 0 ? +(score / overs).toFixed(2) : 0);
        const rrr = parsed.required_run_rate ?? null;

        await client.query(
          `INSERT INTO live_match_state
             (match_id, source_match_key, api_match_id, innings_number,
              score, wickets, overs, target,
              current_run_rate, required_run_rate,
              is_live, last_event, fetched_at, raw_payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11, NOW(), $12)
           ON CONFLICT (match_id) DO UPDATE SET
             innings_number     = EXCLUDED.innings_number,
             score              = EXCLUDED.score,
             wickets            = EXCLUDED.wickets,
             overs              = EXCLUDED.overs,
             target             = EXCLUDED.target,
             current_run_rate   = EXCLUDED.current_run_rate,
             required_run_rate  = EXCLUDED.required_run_rate,
             is_live            = TRUE,
             last_event         = EXCLUDED.last_event,
             fetched_at         = NOW(),
             raw_payload        = EXCLUDED.raw_payload`,
          [
            matchId,
            match.id,
            match.id,
            latestInnings,
            score,
            wickets,
            overs,
            target,
            crr,
            rrr,
            match.status || null,
            JSON.stringify({ score: match.score, status: match.status }),
          ],
        );

        // Update match status to 'live'
        await client.query(
          `UPDATE matches SET status = 'live', updated_at = NOW()
           WHERE id = $1 AND status != 'completed'`,
          [matchId],
        );

        result.matchesUpdated++;
      } catch (err: any) {
        result.errors.push(`Match ${match.id}: ${err.message}`);
      }
    }
  } finally {
    client.release();
  }

  return result;
}

/* ─── Detail Cycle: scorecard-level ingestion ─────────── */

export interface DetailCycleResult {
  matchesProcessed: number;
  scorecardsFetched: number;
  playersUpserted: number;
  inningsUpserted: number;
  predictionsTriggered: number;
  errors: string[];
}

/**
 * Detail ingestion cycle — calls /match_scorecard for each live match.
 * Populates innings, players, striker/non-striker/bowler IDs in live_match_state.
 * Triggers ML prediction after each match is ingested.
 */
export async function runDetailCycle(liveMatches: LiveMatchData[]): Promise<DetailCycleResult> {
  const result: DetailCycleResult = {
    matchesProcessed: 0,
    scorecardsFetched: 0,
    playersUpserted: 0,
    inningsUpserted: 0,
    predictionsTriggered: 0,
    errors: [],
  };
  if (liveMatches.length === 0) return result;

  for (const match of liveMatches) {
    result.matchesProcessed++;
    const client = await pool.connect();

    try {
      const matchId = await resolveMatchId(client, match.id);
      if (!matchId) {
        result.errors.push(`No DB match for API id=${match.id}`);
        client.release();
        continue;
      }

      // Check if enough time has passed since last scorecard fetch (3 min guard)
      const lastFetch = await client.query<{ last_scorecard_fetch: Date | null }>(
        `SELECT last_scorecard_fetch FROM live_match_state WHERE match_id = $1`,
        [matchId],
      );
      const lastTime = lastFetch.rows[0]?.last_scorecard_fetch;
      if (lastTime && Date.now() - new Date(lastTime).getTime() < 150_000) {
        // Less than 2.5 min since last fetch — skip to stay within rate limits
        client.release();
        continue;
      }

      // Fetch scorecard from API
      const scorecard = await fetchMatchScorecard(match.id);
      if (!scorecard) {
        result.errors.push(`Scorecard fetch failed for ${match.id}`);
        client.release();
        continue;
      }
      result.scorecardsFetched++;

      await client.query('BEGIN');

      // Get team IDs from the match
      const matchRow = await client.query<{ team1_id: string; team2_id: string }>(
        `SELECT team1_id, team2_id FROM matches WHERE id = $1`,
        [matchId],
      );
      const team1Id = Number(matchRow.rows[0]?.team1_id || 0);
      const team2Id = Number(matchRow.rows[0]?.team2_id || 0);

      // Update toss info if available
      if (scorecard.tossWinner && scorecard.tossChoice) {
        const tossTeamId = await resolveTeamId(client, scorecard.tossWinner);
        if (tossTeamId) {
          await client.query(
            `UPDATE matches SET toss_winner_team_id = $1, toss_decision = $2, updated_at = NOW()
             WHERE id = $3 AND toss_winner_team_id IS NULL`,
            [tossTeamId, scorecard.tossChoice.toLowerCase(), matchId],
          );
        }
      }

      // Process each innings from scorecard
      let currentStrikerId: number | null = null;
      let currentNonStrikerId: number | null = null;
      let currentBowlerId: number | null = null;
      let currentInningsNumber = 1;

      for (let idx = 0; idx < scorecard.scorecard.length; idx++) {
        const inn = scorecard.scorecard[idx];
        const inningsNumber = idx + 1;
        currentInningsNumber = inningsNumber;

        // Resolve batting team
        const battingTeamName = inn.battingTeam || '';
        let battingTeamId = await resolveTeamId(client, battingTeamName);
        if (!battingTeamId) {
          battingTeamId = inningsNumber === 1 ? team1Id : team2Id;
        }
        const bowlingTeamId = battingTeamId === team1Id ? team2Id : team1Id;

        // Determine target (2nd innings target = 1st innings total + 1)
        let targetRuns: number | null = null;
        if (inningsNumber === 2 && scorecard.scorecard[0]) {
          targetRuns = (scorecard.scorecard[0].total ?? 0) + 1;
        }

        // Upsert innings
        const inningsId = await upsertInnings(
          client,
          matchId,
          inningsNumber,
          battingTeamId,
          bowlingTeamId,
          inn.total ?? 0,
          inn.wickets ?? 0,
          inn.overs ?? 0,
          targetRuns,
        );
        result.inningsUpserted++;

        // Upsert batsmen players & identify active batsman
        for (const bat of inn.batsman) {
          const playerId = await upsertPlayer(client, bat.batsman.name, bat.batsman.id || undefined);
          if (playerId > 0) result.playersUpserted++;

          // The last "not out" batsmen in the current innings are striker/non-striker
          if (bat.isNotOut && playerId > 0) {
            if (!currentStrikerId) {
              currentStrikerId = playerId;
            } else {
              currentNonStrikerId = playerId;
            }
          }
        }

        // Upsert bowler players & identify current bowler
        for (const bwl of inn.bowler) {
          const playerId = await upsertPlayer(client, bwl.bowler.name, bwl.bowler.id || undefined);
          if (playerId > 0) result.playersUpserted++;

          // The last bowler in the list is typically the current bowler
          if (playerId > 0) {
            currentBowlerId = playerId;
          }
        }

        // Synthesize bowler-level delivery summary rows
        // (We can't get true ball-by-ball from scorecard, but we capture
        //  bowler session data so the ML feature extractor can use it)
        await _synthDeliveriesFromBowlers(client, matchId, inningsId, inningsNumber, inn);
      }

      // Update live_match_state with player IDs + scorecard timestamp
      if (currentStrikerId || currentNonStrikerId || currentBowlerId) {
        await client.query(
          `UPDATE live_match_state SET
             striker_id = COALESCE($1, striker_id),
             non_striker_id = COALESCE($2, non_striker_id),
             bowler_id = COALESCE($3, bowler_id),
             last_scorecard_fetch = NOW()
           WHERE match_id = $4`,
          [currentStrikerId, currentNonStrikerId, currentBowlerId, matchId],
        );
      } else {
        await client.query(
          `UPDATE live_match_state SET last_scorecard_fetch = NOW() WHERE match_id = $1`,
          [matchId],
        );
      }

      await client.query('COMMIT');
      client.release();

      // Trigger live prediction (fire-and-forget)
      try {
        await triggerLivePrediction(matchId);
        result.predictionsTriggered++;
      } catch (predErr: any) {
        result.errors.push(`Prediction trigger failed for match ${matchId}: ${predErr.message}`);
      }
    } catch (err: any) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      client.release();
      result.errors.push(`Detail cycle match ${match.id}: ${err.message}`);
    }
  }

  return result;
}

/* ─── Synthesize deliveries from bowler scorecard ─────── */

async function _synthDeliveriesFromBowlers(
  client: PoolClient,
  matchId: number,
  inningsId: number,
  inningsNumber: number,
  inn: ScorecardInnings,
): Promise<void> {
  // We create one synthetic delivery per bowler-over to capture bowler stats
  // in the deliveries table. This isn't true ball-by-ball but gives the ML
  // model enough data to compute bowler_econ, bowler_wkts, etc.

  for (const bwl of inn.bowler) {
    const bowlerId = await _findPlayerId(client, bwl.bowler.name);
    if (!bowlerId) continue;

    const fullOvers = Math.floor(bwl.overs);
    const partialBalls = Math.round((bwl.overs - fullOvers) * 10);

    // Only insert summary row for the last over bowled by this bowler
    // This keeps deliveries table populated without exploding row count
    const overNumber = Math.max(fullOvers, 1);
    const runsPerOver = fullOvers > 0 ? Math.round(bwl.runs / fullOvers) : bwl.runs;

    // Check if row already exists
    const exists = await client.query(
      `SELECT 1 FROM deliveries
       WHERE match_id = $1 AND innings_number = $2 AND bowler_id = $3 AND over_number = $4
       LIMIT 1`,
      [matchId, inningsNumber, bowlerId, overNumber],
    );

    if (exists.rows.length === 0) {
      await client.query(
        `INSERT INTO deliveries
           (match_id, innings_id, innings_number, over_number, ball_in_over,
            bowler_id, runs_total, runs_batter, runs_extras,
            is_wicket, raw_payload)
         VALUES ($1, $2, $3, $4, 1, $5, $6, $6, 0, $7, $8)
         ON CONFLICT (match_id, innings_number, over_number, ball_in_over)
         DO UPDATE SET
           runs_total = EXCLUDED.runs_total,
           bowler_id  = EXCLUDED.bowler_id,
           is_wicket  = EXCLUDED.is_wicket,
           raw_payload = EXCLUDED.raw_payload`,
        [
          matchId,
          inningsId,
          inningsNumber,
          overNumber,
          bowlerId,
          runsPerOver,
          bwl.wickets > 0,
          JSON.stringify({
            source: 'scorecard_synth',
            bowler_name: bwl.bowler.name,
            total_overs: bwl.overs,
            total_runs: bwl.runs,
            total_wickets: bwl.wickets,
            economy: bwl.economy,
          }),
        ],
      );
    }
  }
}

async function _findPlayerId(client: PoolClient, name: string): Promise<number | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM players WHERE name = $1 LIMIT 1`,
    [name.trim()],
  );
  return result.rows[0] ? Number(result.rows[0].id) : null;
}

/* ─── Prediction trigger ──────────────────────────────── */

export async function triggerLivePrediction(matchId: number): Promise<any> {
  try {
    const resp = await axios.post(`${ML_URL}/predict/live`, { match_id: matchId }, { timeout: 15000 });
    return resp.data;
  } catch (err: any) {
    console.error(`ML prediction trigger failed for match ${matchId}: ${err.message}`);
    throw err;
  }
}

/* ─── Match completion ────────────────────────────────── */

export async function markMatchCompleted(apiMatchId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE live_match_state SET is_live = FALSE, fetched_at = NOW()
       WHERE source_match_key = $1 OR api_match_id = $1`,
      [apiMatchId],
    );
    await client.query(
      `UPDATE matches SET status = 'completed', updated_at = NOW()
       WHERE external_match_ref = $1 AND status != 'completed'`,
      [apiMatchId],
    );
  } finally {
    client.release();
  }
}

/* ─── Ingestion run logging ──────────────────────────── */

export async function logIngestionRun(
  source: string,
  runType: string,
  status: string,
  recordsProcessed: number,
  message: string,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO ingestion_runs (source_name, run_type, status, records_processed, message, finished_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [source, runType, status, recordsProcessed, message],
    );
  } catch (err: any) {
    console.error(`Failed to log ingestion run: ${err.message}`);
  }
}
