"""Pre-match feature engineering for richer IPL prediction signals."""

import datetime as dt
import os
from typing import Dict

import psycopg2
from psycopg2.extras import RealDictCursor


def get_connection():
    return psycopg2.connect(
        os.environ.get("DATABASE_URL", "postgres://ipl_user:ipl_pass_2026@127.0.0.1:5432/ipl_predictor"),
        cursor_factory=RealDictCursor,
    )


def _fetch_team_form(cur, match_id: int, team_id: int, match_date: dt.date) -> Dict[str, float]:
    cur.execute(
        """
        SELECT
          last5_win_pct, avg_runs_last5, avg_wkts_last5,
          avg_powerplay_runs_last5, avg_death_runs_last5,
          chase_win_pct, venue_win_pct, elo_rating
        FROM team_form_snapshots
        WHERE match_id = %s AND team_id = %s
        LIMIT 1
        """,
        (match_id, team_id),
    )
    row = cur.fetchone()
    if row:
        return dict(row)

    cur.execute(
        """
        SELECT
          tfs.last5_win_pct, tfs.avg_runs_last5, tfs.avg_wkts_last5,
          tfs.avg_powerplay_runs_last5, tfs.avg_death_runs_last5,
          tfs.chase_win_pct, tfs.venue_win_pct, tfs.elo_rating
        FROM team_form_snapshots tfs
        JOIN matches m ON m.id = tfs.match_id
        WHERE tfs.team_id = %s
          AND m.status = 'completed'
          AND m.match_date <= %s
        ORDER BY m.match_date DESC, m.id DESC
        LIMIT 1
        """,
        (team_id, match_date),
    )
    row = cur.fetchone()
    if row:
        return dict(row)

    return {
        "last5_win_pct": 50,
        "avg_runs_last5": 165,
        "avg_wkts_last5": 6,
        "avg_powerplay_runs_last5": 48,
        "avg_death_runs_last5": 55,
        "chase_win_pct": 50,
        "venue_win_pct": 50,
        "elo_rating": 1500,
    }


def _fetch_player_aggregate(cur, match_id: int, team_id: int, match_date: dt.date) -> Dict[str, float]:
    cur.execute(
        """
        SELECT
          AVG(batting_avg_last5)   AS batting_avg_last5,
          AVG(strike_rate_last5)   AS strike_rate_last5,
          AVG(boundary_pct_last5)  AS boundary_pct_last5,
          AVG(bowling_econ_last5)  AS bowling_econ_last5,
          AVG(bowling_sr_last5)    AS bowling_sr_last5,
          AVG(wickets_last5)       AS wickets_last5
        FROM player_form_snapshots
        WHERE match_id = %s AND team_id = %s
        """,
        (match_id, team_id),
    )
    row = cur.fetchone()
    if row and row["batting_avg_last5"] is not None:
        return {k: float(v) for k, v in row.items()}

    cur.execute(
        """
        WITH recent AS (
          SELECT pfs.*
          FROM player_form_snapshots pfs
          JOIN matches m ON m.id = pfs.match_id
          WHERE pfs.team_id = %s
            AND m.status = 'completed'
            AND m.match_date <= %s
          ORDER BY m.match_date DESC, m.id DESC
          LIMIT 55
        )
        SELECT
          AVG(batting_avg_last5)   AS batting_avg_last5,
          AVG(strike_rate_last5)   AS strike_rate_last5,
          AVG(boundary_pct_last5)  AS boundary_pct_last5,
          AVG(bowling_econ_last5)  AS bowling_econ_last5,
          AVG(bowling_sr_last5)    AS bowling_sr_last5,
          AVG(wickets_last5)       AS wickets_last5
        FROM recent
        """,
        (team_id, match_date),
    )
    row = cur.fetchone()
    if row and row["batting_avg_last5"] is not None:
        return {k: float(v) for k, v in row.items()}

    return {
        "batting_avg_last5": 22,
        "strike_rate_last5": 120,
        "boundary_pct_last5": 18,
        "bowling_econ_last5": 8.2,
        "bowling_sr_last5": 24,
        "wickets_last5": 1,
    }


def _fetch_h2h_t1_win_pct(cur, team1_id: int, team2_id: int, match_date: dt.date, match_id: int) -> float:
    cur.execute(
        """
        SELECT
          COUNT(*) FILTER (WHERE winner_team_id = %s) AS t1_wins,
          COUNT(*) AS total
        FROM matches
        WHERE status = 'completed'
          AND ((team1_id = %s AND team2_id = %s) OR (team1_id = %s AND team2_id = %s))
          AND (match_date < %s OR (match_date = %s AND id < %s))
        """,
        (team1_id, team1_id, team2_id, team2_id, team1_id, match_date, match_date, match_id),
    )
    row = cur.fetchone()
    total = int(row["total"] or 0)
    if total == 0:
        return 50.0
    return round(float(row["t1_wins"] or 0) * 100.0 / total, 2)


def build_pre_match_features(match_id: int) -> dict:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
          m.id, m.season, m.match_date, m.toss_decision,
          m.team1_id, m.team2_id, m.venue_id, m.toss_winner_team_id,
          COALESCE(v.avg_first_innings_score, 165) AS venue_avg_score,
          COALESCE(v.chase_win_pct, 50) AS venue_chase_pct
        FROM matches m
        LEFT JOIN venues v ON v.id = m.venue_id
        WHERE m.id = %s
        """,
        (match_id,),
    )
    match = cur.fetchone()
    if not match:
        conn.close()
        raise ValueError(f"Match {match_id} not found")

    match_date = match["match_date"]
    if isinstance(match_date, dt.datetime):
        match_date = match_date.date()

    t1 = _fetch_team_form(cur, match_id, int(match["team1_id"]), match_date)
    t2 = _fetch_team_form(cur, match_id, int(match["team2_id"]), match_date)
    p1 = _fetch_player_aggregate(cur, match_id, int(match["team1_id"]), match_date)
    p2 = _fetch_player_aggregate(cur, match_id, int(match["team2_id"]), match_date)

    h2h_t1_win_pct = _fetch_h2h_t1_win_pct(
        cur,
        int(match["team1_id"]),
        int(match["team2_id"]),
        match_date,
        int(match["id"]),
    )

    toss_win_team1 = 1 if match["toss_winner_team_id"] == match["team1_id"] else 0
    toss_bat = 1 if str(match["toss_decision"] or "").lower() == "bat" else 0

    season_progress = round((match_date.timetuple().tm_yday / 366.0) * 100.0, 3)

    features = {
        "match_id": match_id,
        "team1_id": int(match["team1_id"]),
        "team2_id": int(match["team2_id"]),
        "season": str(match["season"] or ""),
        "elo_diff": float(t1["elo_rating"] or 1500) - float(t2["elo_rating"] or 1500),
        "last5_win_pct_diff": float(t1["last5_win_pct"] or 50) - float(t2["last5_win_pct"] or 50),
        "avg_runs_diff": float(t1["avg_runs_last5"] or 165) - float(t2["avg_runs_last5"] or 165),
        "avg_wkts_diff": float(t1["avg_wkts_last5"] or 6) - float(t2["avg_wkts_last5"] or 6),
        "avg_powerplay_diff": float(t1["avg_powerplay_runs_last5"] or 48) - float(t2["avg_powerplay_runs_last5"] or 48),
        "avg_death_diff": float(t1["avg_death_runs_last5"] or 55) - float(t2["avg_death_runs_last5"] or 55),
        "chase_win_pct_diff": float(t1["chase_win_pct"] or 50) - float(t2["chase_win_pct"] or 50),
        "venue_win_pct_diff": float(t1["venue_win_pct"] or 50) - float(t2["venue_win_pct"] or 50),
        "venue_avg_score": float(match["venue_avg_score"] or 165),
        "venue_chase_pct": float(match["venue_chase_pct"] or 50),
        "player_bat_avg_diff": float(p1["batting_avg_last5"] or 22) - float(p2["batting_avg_last5"] or 22),
        "player_strike_rate_diff": float(p1["strike_rate_last5"] or 120) - float(p2["strike_rate_last5"] or 120),
        "player_boundary_pct_diff": float(p1["boundary_pct_last5"] or 18) - float(p2["boundary_pct_last5"] or 18),
        "player_bowling_econ_diff": float(p1["bowling_econ_last5"] or 8.2) - float(p2["bowling_econ_last5"] or 8.2),
        "player_bowling_sr_diff": float(p1["bowling_sr_last5"] or 24) - float(p2["bowling_sr_last5"] or 24),
        "player_wickets_diff": float(p1["wickets_last5"] or 1) - float(p2["wickets_last5"] or 1),
        "h2h_t1_win_pct": h2h_t1_win_pct,
        "toss_win_team1": toss_win_team1,
        "toss_bat": toss_bat,
        "toss_win_bat": toss_win_team1 * toss_bat,
        "season_progress": season_progress,
    }

    conn.close()
    return features
