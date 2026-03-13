'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('ERROR: DATABASE_URL is required.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
  query_timeout: 60000,
});

pool.on('error', (err) => {
  // Prevent pool-level client errors from crashing the process.
  console.error('PG pool error:', err.message);
});

const DEFAULT_TEAM_FORM = {
  last5_win_pct: 50,
  avg_runs_last5: 165,
  avg_wkts_last5: 6,
  avg_powerplay_runs_last5: 48,
  avg_death_runs_last5: 55,
  chase_win_pct: 50,
  venue_win_pct: 50,
  elo_rating: 1500,
};

const DEFAULT_PLAYER_FORM = {
  batting_avg_last5: 22,
  strike_rate_last5: 120,
  boundary_pct_last5: 18,
  bowling_econ_last5: 8.2,
  bowling_sr_last5: 24,
  wickets_last5: 1,
};

const NON_BOWLER_WICKET_KINDS = new Set([
  'run out',
  'retired hurt',
  'retired out',
  'obstructing the field',
]);

function normalizeName(v) {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientDbError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return (
    msg.includes('connection terminated unexpectedly') ||
    msg.includes('timeout') ||
    msg.includes('enotfound') ||
    msg.includes('econnreset') ||
    msg.includes('socket hang up') ||
    msg.includes('terminating connection')
  );
}

function venueKey(name, city) {
  return `${normalizeName(name)}|${normalizeName(city)}`;
}

function pct(num, den, fallback = 50) {
  if (!den) return fallback;
  return +(num * 100 / den).toFixed(2);
}

function avg(arr, fallback) {
  if (!arr || arr.length === 0) return fallback;
  return +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2);
}

function pushRolling(arr, value, limit = 30) {
  arr.push(value);
  if (arr.length > limit) arr.shift();
}

function getTeamState(store, teamId) {
  if (!store.has(teamId)) {
    store.set(teamId, {
      elo: 1500,
      wins: [],
      runsFor: [],
      wktsTaken: [],
      powerplayRuns: [],
      deathRuns: [],
      chaseWins: 0,
      chaseAttempts: 0,
      venueStats: new Map(),
    });
  }
  return store.get(teamId);
}

function getPlayerState(store, playerId) {
  if (!store.has(playerId)) {
    store.set(playerId, {
      batting: [],
      bowling: [],
    });
  }
  return store.get(playerId);
}

function computeTeamForm(teamState, venueId) {
  if (!teamState) return { ...DEFAULT_TEAM_FORM };

  const venue = teamState.venueStats.get(venueId) || { wins: 0, played: 0 };

  return {
    last5_win_pct: avg(teamState.wins.slice(-5).map(v => v * 100), DEFAULT_TEAM_FORM.last5_win_pct),
    avg_runs_last5: avg(teamState.runsFor.slice(-5), DEFAULT_TEAM_FORM.avg_runs_last5),
    avg_wkts_last5: avg(teamState.wktsTaken.slice(-5), DEFAULT_TEAM_FORM.avg_wkts_last5),
    avg_powerplay_runs_last5: avg(teamState.powerplayRuns.slice(-5), DEFAULT_TEAM_FORM.avg_powerplay_runs_last5),
    avg_death_runs_last5: avg(teamState.deathRuns.slice(-5), DEFAULT_TEAM_FORM.avg_death_runs_last5),
    chase_win_pct: pct(teamState.chaseWins, teamState.chaseAttempts, DEFAULT_TEAM_FORM.chase_win_pct),
    venue_win_pct: pct(venue.wins, venue.played, DEFAULT_TEAM_FORM.venue_win_pct),
    elo_rating: +teamState.elo.toFixed(2),
  };
}

function computePlayerForm(playerState) {
  if (!playerState) return { ...DEFAULT_PLAYER_FORM };

  const b = playerState.batting.slice(-5);
  const bRuns = b.reduce((s, x) => s + x.runs, 0);
  const bBalls = b.reduce((s, x) => s + x.balls, 0);
  const bBoundaries = b.reduce((s, x) => s + x.boundaries, 0);

  const bw = playerState.bowling.slice(-5);
  const bwRuns = bw.reduce((s, x) => s + x.runsConceded, 0);
  const bwBalls = bw.reduce((s, x) => s + x.balls, 0);
  const bwWkts = bw.reduce((s, x) => s + x.wickets, 0);

  return {
    batting_avg_last5: b.length ? +(bRuns / b.length).toFixed(2) : DEFAULT_PLAYER_FORM.batting_avg_last5,
    strike_rate_last5: bBalls ? +(bRuns * 100 / bBalls).toFixed(2) : DEFAULT_PLAYER_FORM.strike_rate_last5,
    boundary_pct_last5: bBalls ? +(bBoundaries * 100 / bBalls).toFixed(2) : DEFAULT_PLAYER_FORM.boundary_pct_last5,
    bowling_econ_last5: bwBalls ? +(bwRuns / (bwBalls / 6)).toFixed(2) : DEFAULT_PLAYER_FORM.bowling_econ_last5,
    bowling_sr_last5: bwWkts ? +(bwBalls / bwWkts).toFixed(2) : DEFAULT_PLAYER_FORM.bowling_sr_last5,
    wickets_last5: bwWkts || DEFAULT_PLAYER_FORM.wickets_last5,
  };
}

async function loadReferenceData(client) {
  const teamsByName = new Map();
  const venuesByKey = new Map();
  const playersByCricId = new Map();
  const playersByName = new Map();
  const matchesByRef = new Map();

  const teams = await client.query(`SELECT id, name FROM teams`);
  for (const row of teams.rows) teamsByName.set(normalizeName(row.name), Number(row.id));

  const venues = await client.query(`SELECT id, name, city FROM venues`);
  for (const row of venues.rows) venuesByKey.set(venueKey(row.name, row.city), Number(row.id));

  const players = await client.query(`SELECT id, name, cricsheet_player_id FROM players`);
  for (const row of players.rows) {
    if (row.cricsheet_player_id) playersByCricId.set(String(row.cricsheet_player_id), Number(row.id));
    playersByName.set(normalizeName(row.name), Number(row.id));
  }

  const matches = await client.query(`
    SELECT id, external_match_ref, venue_id, team1_id, team2_id
    FROM matches
    WHERE external_match_ref IS NOT NULL
  `);
  for (const row of matches.rows) {
    matchesByRef.set(String(row.external_match_ref), {
      id: Number(row.id),
      venue_id: Number(row.venue_id),
      team1_id: Number(row.team1_id),
      team2_id: Number(row.team2_id),
    });
  }

  return { teamsByName, venuesByKey, playersByCricId, playersByName, matchesByRef };
}

async function loadCompletedSnapshotMatchIds(client) {
  const rows = await client.query(`
    SELECT t.match_id
    FROM team_form_snapshots t
    GROUP BY t.match_id
    HAVING COUNT(*) >= 2
    INTERSECT
    SELECT p.match_id
    FROM player_form_snapshots p
    GROUP BY p.match_id
  `);
  return new Set(rows.rows.map((r) => Number(r.match_id)));
}

function resolvePlayerId(cache, playerName, cricsheetId) {
  if (cricsheetId && cache.playersByCricId.has(cricsheetId)) {
    return cache.playersByCricId.get(cricsheetId);
  }
  const key = normalizeName(playerName);
  if (cache.playersByName.has(key)) {
    return cache.playersByName.get(key);
  }
  return null;
}

function getTeamShort(name) {
  const letters = String(name || '')
    .split(' ')
    .filter(Boolean)
    .map(p => p[0].toUpperCase())
    .join('');
  return letters.slice(0, 5) || String(name || '').slice(0, 4).toUpperCase();
}

async function upsertTeam(client, cache, teamName) {
  const key = normalizeName(teamName);
  if (cache.teamsByName.has(key)) return cache.teamsByName.get(key);

  const row = await client.query(
    `INSERT INTO teams (name, short_name) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET short_name = EXCLUDED.short_name
     RETURNING id`,
    [teamName, getTeamShort(teamName)]
  );
  const id = Number(row.rows[0].id);
  cache.teamsByName.set(key, id);
  return id;
}

async function upsertVenue(client, cache, venueName, city) {
  const key = venueKey(venueName, city);
  if (cache.venuesByKey.has(key)) return cache.venuesByKey.get(key);

  const row = await client.query(
    `INSERT INTO venues (name, city) VALUES ($1, $2)
     ON CONFLICT (name, city) DO UPDATE SET city = EXCLUDED.city
     RETURNING id`,
    [venueName || 'Unknown', city || '']
  );
  const id = Number(row.rows[0].id);
  cache.venuesByKey.set(key, id);
  return id;
}

async function upsertPlayer(client, cache, playerName, cricsheetId) {
  const nameKey = normalizeName(playerName);
  if (cricsheetId && cache.playersByCricId.has(cricsheetId)) return cache.playersByCricId.get(cricsheetId);
  if (!cricsheetId && cache.playersByName.has(nameKey)) return cache.playersByName.get(nameKey);

  if (cricsheetId) {
    const row = await client.query(
      `INSERT INTO players (name, cricsheet_player_id) VALUES ($1, $2)
       ON CONFLICT (cricsheet_player_id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [playerName, cricsheetId]
    );
    const id = Number(row.rows[0].id);
    cache.playersByCricId.set(cricsheetId, id);
    cache.playersByName.set(nameKey, id);
    return id;
  }

  const existing = await client.query(`SELECT id FROM players WHERE name = $1 ORDER BY id LIMIT 1`, [playerName]);
  if (existing.rows[0]) {
    const id = Number(existing.rows[0].id);
    cache.playersByName.set(nameKey, id);
    return id;
  }

  const row = await client.query(
    `INSERT INTO players (name) VALUES ($1) RETURNING id`,
    [playerName]
  );
  const id = Number(row.rows[0].id);
  cache.playersByName.set(nameKey, id);
  return id;
}

async function ensureMatch(client, cache, matchRef, matchInfo, ids) {
  if (cache.matchesByRef.has(matchRef)) return cache.matchesByRef.get(matchRef).id;

  const winnerTeamId = matchInfo.outcome?.winner
    ? (normalizeName(matchInfo.outcome.winner) === normalizeName(matchInfo.teams[0]) ? ids.team1Id : ids.team2Id)
    : null;
  const tossWinnerTeamId = normalizeName(matchInfo.toss?.winner) === normalizeName(matchInfo.teams[0])
    ? ids.team1Id
    : ids.team2Id;

  const row = await client.query(
    `INSERT INTO matches (
        external_match_ref, season, match_date, event_name, match_number, stage,
        venue_id, team1_id, team2_id, toss_winner_team_id, toss_decision,
        winner_team_id, result_type, win_by_runs, win_by_wickets, method,
        player_of_match, status
     ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,
        $17,'completed'
     )
     ON CONFLICT (external_match_ref) DO UPDATE
     SET winner_team_id = EXCLUDED.winner_team_id
     RETURNING id`,
    [
      matchRef,
      String(matchInfo.season || ''),
      matchInfo.dates?.[0] || '2008-01-01',
      matchInfo.event?.name || 'IPL',
      matchInfo.event?.match_number || null,
      matchInfo.event?.stage || 'league',
      ids.venueId,
      ids.team1Id,
      ids.team2Id,
      tossWinnerTeamId,
      matchInfo.toss?.decision || 'bat',
      winnerTeamId,
      matchInfo.outcome?.result || 'win',
      matchInfo.outcome?.by?.runs || null,
      matchInfo.outcome?.by?.wickets || null,
      matchInfo.outcome?.method || null,
      matchInfo.player_of_match?.[0] || null,
    ]
  );

  const id = Number(row.rows[0].id);
  cache.matchesByRef.set(matchRef, {
    id,
    venue_id: ids.venueId,
    team1_id: ids.team1Id,
    team2_id: ids.team2Id,
  });
  return id;
}

async function upsertMatchPlayersBulk(client, matchId, teamId, playerIds) {
  if (!playerIds || playerIds.length === 0) return;
  await client.query(
    `INSERT INTO match_players (match_id, team_id, player_id)
     SELECT $1::bigint, $2::bigint, p.player_id
     FROM unnest($3::bigint[]) AS p(player_id)
     ON CONFLICT (match_id, player_id) DO NOTHING`,
    [matchId, teamId, playerIds]
  );
}

async function upsertTeamSnapshotsBulk(client, rows) {
  if (!rows || rows.length === 0) return;
  await client.query(
    `INSERT INTO team_form_snapshots
      (match_id, team_id, last5_win_pct, avg_runs_last5, avg_wkts_last5,
       avg_powerplay_runs_last5, avg_death_runs_last5, chase_win_pct, venue_win_pct, elo_rating)
     SELECT *
     FROM unnest(
       $1::bigint[], $2::bigint[], $3::numeric[], $4::numeric[], $5::numeric[],
       $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[], $10::numeric[]
     )
     AS t(
       match_id, team_id, last5_win_pct, avg_runs_last5, avg_wkts_last5,
       avg_powerplay_runs_last5, avg_death_runs_last5, chase_win_pct, venue_win_pct, elo_rating
     )
     ON CONFLICT (match_id, team_id) DO UPDATE SET
       last5_win_pct = EXCLUDED.last5_win_pct,
       avg_runs_last5 = EXCLUDED.avg_runs_last5,
       avg_wkts_last5 = EXCLUDED.avg_wkts_last5,
       avg_powerplay_runs_last5 = EXCLUDED.avg_powerplay_runs_last5,
       avg_death_runs_last5 = EXCLUDED.avg_death_runs_last5,
       chase_win_pct = EXCLUDED.chase_win_pct,
       venue_win_pct = EXCLUDED.venue_win_pct,
       elo_rating = EXCLUDED.elo_rating`,
    [
      rows.map(r => r.match_id),
      rows.map(r => r.team_id),
      rows.map(r => r.last5_win_pct),
      rows.map(r => r.avg_runs_last5),
      rows.map(r => r.avg_wkts_last5),
      rows.map(r => r.avg_powerplay_runs_last5),
      rows.map(r => r.avg_death_runs_last5),
      rows.map(r => r.chase_win_pct),
      rows.map(r => r.venue_win_pct),
      rows.map(r => r.elo_rating),
    ]
  );
}

async function upsertPlayerSnapshotsBulk(client, rows) {
  if (!rows || rows.length === 0) return;
  await client.query(
    `INSERT INTO player_form_snapshots
      (match_id, player_id, team_id, batting_avg_last5, strike_rate_last5,
       boundary_pct_last5, bowling_econ_last5, bowling_sr_last5, wickets_last5)
     SELECT *
     FROM unnest(
       $1::bigint[], $2::bigint[], $3::bigint[], $4::numeric[], $5::numeric[],
       $6::numeric[], $7::numeric[], $8::numeric[], $9::int[]
     )
     AS p(
       match_id, player_id, team_id, batting_avg_last5, strike_rate_last5,
       boundary_pct_last5, bowling_econ_last5, bowling_sr_last5, wickets_last5
     )
     ON CONFLICT (match_id, player_id) DO UPDATE SET
       team_id = EXCLUDED.team_id,
       batting_avg_last5 = EXCLUDED.batting_avg_last5,
       strike_rate_last5 = EXCLUDED.strike_rate_last5,
       boundary_pct_last5 = EXCLUDED.boundary_pct_last5,
       bowling_econ_last5 = EXCLUDED.bowling_econ_last5,
       bowling_sr_last5 = EXCLUDED.bowling_sr_last5,
       wickets_last5 = EXCLUDED.wickets_last5`,
    [
      rows.map(r => r.match_id),
      rows.map(r => r.player_id),
      rows.map(r => r.team_id),
      rows.map(r => r.batting_avg_last5),
      rows.map(r => r.strike_rate_last5),
      rows.map(r => r.boundary_pct_last5),
      rows.map(r => r.bowling_econ_last5),
      rows.map(r => r.bowling_sr_last5),
      rows.map(r => r.wickets_last5),
    ]
  );
}

function isLegalBall(delivery) {
  const extras = delivery?.extras || {};
  return extras.wides == null && extras.noballs == null;
}

function isBallFaced(delivery) {
  const extras = delivery?.extras || {};
  return extras.wides == null;
}

function runsConcededByBowler(delivery) {
  const total = Number(delivery?.runs?.total || 0);
  const extras = delivery?.extras || {};
  const byes = Number(extras.byes || 0);
  const legByes = Number(extras.legbyes || 0);
  return total - byes - legByes;
}

function isBowlerWicket(wicket) {
  if (!wicket || !wicket.kind) return false;
  return !NON_BOWLER_WICKET_KINDS.has(String(wicket.kind).toLowerCase());
}

function parseMatchPerformances(matchJson, teamIds, playerNameToId) {
  const innings = Array.isArray(matchJson.innings) ? matchJson.innings : [];
  const summaries = [];
  const playerBatting = new Map();
  const playerBowling = new Map();

  for (const inn of innings) {
    const battingTeamId = normalizeName(inn.team) === normalizeName(matchJson.info.teams[0]) ? teamIds.team1Id : teamIds.team2Id;
    const bowlingTeamId = battingTeamId === teamIds.team1Id ? teamIds.team2Id : teamIds.team1Id;
    const overs = Array.isArray(inn.overs) ? inn.overs : [];

    let totalRuns = 0;
    let wicketsLost = 0;
    let powerplayRuns = 0;
    let deathRuns = 0;

    for (const ov of overs) {
      const overNo = Number(ov.over || 0);
      const deliveries = Array.isArray(ov.deliveries) ? ov.deliveries : [];

      for (const d of deliveries) {
        const runsTotal = Number(d?.runs?.total || 0);
        const runsBatter = Number(d?.runs?.batter || 0);
        const wickets = Array.isArray(d.wickets) ? d.wickets : [];
        const batterId = playerNameToId.get(normalizeName(d.batter));
        const bowlerId = playerNameToId.get(normalizeName(d.bowler));

        totalRuns += runsTotal;
        wicketsLost += wickets.length;
        if (overNo < 6) powerplayRuns += runsTotal;
        if (overNo >= 16) deathRuns += runsTotal;

        if (batterId) {
          if (!playerBatting.has(batterId)) playerBatting.set(batterId, { runs: 0, balls: 0, boundaries: 0 });
          const b = playerBatting.get(batterId);
          b.runs += runsBatter;
          b.balls += isBallFaced(d) ? 1 : 0;
          if (runsBatter === 4 || runsBatter === 6) b.boundaries += 1;
        }

        if (bowlerId) {
          if (!playerBowling.has(bowlerId)) playerBowling.set(bowlerId, { runsConceded: 0, balls: 0, wickets: 0 });
          const bw = playerBowling.get(bowlerId);
          bw.runsConceded += runsConcededByBowler(d);
          bw.balls += isLegalBall(d) ? 1 : 0;
          bw.wickets += wickets.filter(isBowlerWicket).length;
        }
      }
    }

    summaries.push({
      battingTeamId,
      bowlingTeamId,
      totalRuns,
      wicketsLost,
      powerplayRuns,
      deathRuns,
    });
  }

  return { summaries, playerBatting, playerBowling };
}

async function gatherMatchFiles(dataDir) {
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
  const meta = [];

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const date = data?.info?.dates?.[0] || '2008-01-01';
      meta.push({
        filePath,
        fileName: file,
        matchRef: path.basename(file, '.json'),
        date,
      });
    } catch {
      // Ignore malformed files.
    }
  }

  meta.sort((a, b) => {
    if (a.date === b.date) return a.matchRef.localeCompare(b.matchRef);
    return a.date.localeCompare(b.date);
  });
  return meta;
}

async function run() {
  const dataDir = process.argv[2] || path.join(process.cwd(), 'data', 'cricsheet');
  const reset = process.argv.includes('--reset');
  const writeExisting = process.argv.includes('--write-existing');
  const skipExistingSnapshotWrites = !reset && !writeExisting;
  if (!fs.existsSync(dataDir)) {
    console.error(`ERROR: Data directory not found: ${dataDir}`);
    process.exit(1);
  }

  const matches = await gatherMatchFiles(dataDir);
  if (matches.length === 0) {
    console.error('ERROR: No Cricsheet JSON files found.');
    process.exit(1);
  }

  const cache = await loadReferenceData(pool);
  const teamState = new Map();
  const playerState = new Map();
  const completedSnapshotMatchIds = skipExistingSnapshotWrites
    ? await loadCompletedSnapshotMatchIds(pool)
    : new Set();

  let processed = 0;
  let teamSnapshotRows = 0;
  let playerSnapshotRows = 0;
  let errors = 0;
  let snapshotWriteMatches = 0;
  let snapshotWritesSkipped = 0;

  if (reset) {
    await pool.query(`DELETE FROM player_form_snapshots`);
    await pool.query(`DELETE FROM team_form_snapshots`);
  }

  for (const meta of matches) {
    let attempts = 0;
    let completed = false;

    while (!completed) {
      attempts += 1;
      try {
        const raw = fs.readFileSync(meta.filePath, 'utf-8');
        const data = JSON.parse(raw);
        const info = data.info || {};
        if (!Array.isArray(info.teams) || info.teams.length < 2) {
          completed = true;
          break;
        }

        const team1Id = await upsertTeam(pool, cache, info.teams[0]);
        const team2Id = await upsertTeam(pool, cache, info.teams[1]);
        const venueId = await upsertVenue(pool, cache, info.venue || 'Unknown', info.city || '');
        const matchId = await ensureMatch(pool, cache, meta.matchRef, info, { team1Id, team2Id, venueId });
        const skipSnapshotWritesForMatch =
          skipExistingSnapshotWrites && completedSnapshotMatchIds.has(matchId);

        const winnerTeamId = info.outcome?.winner
          ? (normalizeName(info.outcome.winner) === normalizeName(info.teams[0]) ? team1Id : team2Id)
          : null;

        const registryPeople = (info.registry && info.registry.people) || {};
        const lineups = info.players || {};
        const playerNameToId = new Map();
        const teamLineupIds = new Map([[team1Id, []], [team2Id, []]]);

        for (const [teamName, names] of Object.entries(lineups)) {
          const currentTeamId = normalizeName(teamName) === normalizeName(info.teams[0]) ? team1Id : team2Id;
          for (const name of names) {
            const cricId = registryPeople[name] || null;
            let pid = resolvePlayerId(cache, name, cricId);
            if (!pid) {
              pid = await upsertPlayer(pool, cache, name, cricId);
            }
            if (!pid) continue;
            playerNameToId.set(normalizeName(name), pid);
            const lineup = teamLineupIds.get(currentTeamId);
            if (!lineup.includes(pid)) lineup.push(pid);
          }
        }

        if (!skipSnapshotWritesForMatch) {
          await upsertMatchPlayersBulk(pool, matchId, team1Id, teamLineupIds.get(team1Id));
          await upsertMatchPlayersBulk(pool, matchId, team2Id, teamLineupIds.get(team2Id));

          const team1Pre = computeTeamForm(teamState.get(team1Id), venueId);
          const team2Pre = computeTeamForm(teamState.get(team2Id), venueId);

          await upsertTeamSnapshotsBulk(pool, [
            {
              match_id: matchId,
              team_id: team1Id,
              ...team1Pre,
            },
            {
              match_id: matchId,
              team_id: team2Id,
              ...team2Pre,
            },
          ]);
          teamSnapshotRows += 2;

          const playerRows = [];
          for (const [teamId, lineup] of teamLineupIds.entries()) {
            for (const pid of lineup) {
              const pre = computePlayerForm(playerState.get(pid));
              playerRows.push({
                match_id: matchId,
                player_id: pid,
                team_id: teamId,
                batting_avg_last5: pre.batting_avg_last5,
                strike_rate_last5: pre.strike_rate_last5,
                boundary_pct_last5: pre.boundary_pct_last5,
                bowling_econ_last5: pre.bowling_econ_last5,
                bowling_sr_last5: pre.bowling_sr_last5,
                wickets_last5: Math.round(pre.wickets_last5 || 0),
              });
            }
          }
          await upsertPlayerSnapshotsBulk(pool, playerRows);
          playerSnapshotRows += playerRows.length;
          snapshotWriteMatches += 1;
          completedSnapshotMatchIds.add(matchId);
        } else {
          snapshotWritesSkipped += 1;
        }

        const perf = parseMatchPerformances(data, { team1Id, team2Id }, playerNameToId);

        for (const inn of perf.summaries) {
          const battingState = getTeamState(teamState, inn.battingTeamId);
          const bowlingState = getTeamState(teamState, inn.bowlingTeamId);
          pushRolling(battingState.runsFor, inn.totalRuns);
          pushRolling(battingState.powerplayRuns, inn.powerplayRuns);
          pushRolling(battingState.deathRuns, inn.deathRuns);
          pushRolling(bowlingState.wktsTaken, inn.wicketsLost);
        }

        const secondInnings = perf.summaries[1];
        if (secondInnings) {
          const chasingState = getTeamState(teamState, secondInnings.battingTeamId);
          chasingState.chaseAttempts += 1;
          if (winnerTeamId && winnerTeamId === secondInnings.battingTeamId) chasingState.chaseWins += 1;
        }

        for (const teamId of [team1Id, team2Id]) {
          const ts = getTeamState(teamState, teamId);
          const current = ts.venueStats.get(venueId) || { wins: 0, played: 0 };
          current.played += 1;
          if (winnerTeamId && winnerTeamId === teamId) current.wins += 1;
          ts.venueStats.set(venueId, current);
        }

        if (winnerTeamId) {
          const s1 = getTeamState(teamState, team1Id);
          const s2 = getTeamState(teamState, team2Id);
          const t1Win = winnerTeamId === team1Id ? 1 : 0;

          pushRolling(s1.wins, t1Win);
          pushRolling(s2.wins, 1 - t1Win);

          const exp1 = 1 / (1 + 10 ** ((s2.elo - s1.elo) / 400));
          const exp2 = 1 - exp1;
          const K = 24;
          s1.elo = s1.elo + K * (t1Win - exp1);
          s2.elo = s2.elo + K * ((1 - t1Win) - exp2);
        } else {
          const s1 = getTeamState(teamState, team1Id);
          const s2 = getTeamState(teamState, team2Id);
          pushRolling(s1.wins, 0.5);
          pushRolling(s2.wins, 0.5);
        }

        for (const [pid, b] of perf.playerBatting.entries()) {
          const ps = getPlayerState(playerState, pid);
          pushRolling(ps.batting, b, 30);
        }
        for (const [pid, bw] of perf.playerBowling.entries()) {
          const ps = getPlayerState(playerState, pid);
          pushRolling(ps.bowling, bw, 30);
        }

        processed += 1;
        if (processed % 25 === 0) {
          console.log(
            `Processed ${processed}/${matches.length} matches... ` +
            `(writes=${snapshotWriteMatches}, skipped=${snapshotWritesSkipped})`
          );
        }
        completed = true;
      } catch (err) {
        const transient = isTransientDbError(err);
        if (transient && attempts < 6) {
          const backoffMs = Math.min(8000, 1000 * attempts);
          console.warn(`Retry ${attempts}/5 for ${meta.fileName}: ${err.message}`);
          await sleep(backoffMs);
          continue;
        }

        errors += 1;
        if (errors <= 40) {
          console.error(`Skipped ${meta.fileName}: ${err.message}`);
        }
        completed = true;
      }
    }
  }

  console.log(`Done. Matches processed: ${processed}`);
  console.log(`Snapshot writes: ${snapshotWriteMatches}`);
  console.log(`Snapshot writes skipped: ${snapshotWritesSkipped}`);
  console.log(`Team snapshots: ${teamSnapshotRows}`);
  console.log(`Player snapshots: ${playerSnapshotRows}`);
  console.log(`Errors: ${errors}`);

  await pool.end();
}

run().catch(async (err) => {
  console.error('Form snapshot build failed:', err.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
