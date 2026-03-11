"""
Pre-match feature engineering.
Pulls historical stats from PostgreSQL and builds model-ready feature vectors.
"""

import os
import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor


def get_connection():
    return psycopg2.connect(os.environ.get(
        "DATABASE_URL", "postgres://ipl_user:ipl_pass_2026@localhost:5432/ipl_predictor"
    ), cursor_factory=RealDictCursor)


def build_pre_match_features(match_id: int) -> dict:
    """Return a flat dict of features for the pre-match model."""
    conn = get_connection()
    cur = conn.cursor()

    # ── Match metadata ───────────────────────────────────────
    cur.execute("""
        SELECT m.id, m.season, m.match_date, m.toss_decision,
               m.team1_id, m.team2_id, m.venue_id,
               m.toss_winner_team_id,
               t1.elo_rating AS team1_elo, t2.elo_rating AS team2_elo
        FROM matches m
        LEFT JOIN team_form_snapshots t1 ON t1.match_id = m.id AND t1.team_id = m.team1_id
        LEFT JOIN team_form_snapshots t2 ON t2.match_id = m.id AND t2.team_id = m.team2_id
        WHERE m.id = %s
    """, (match_id,))
    match = cur.fetchone()
    if not match:
        raise ValueError(f"Match {match_id} not found")

    # ── Team form (last 5 matches) ───────────────────────────
    def team_form(team_id):
        cur.execute("""
            SELECT last5_win_pct, avg_runs_last5, avg_powerplay_runs_last5,
                   avg_death_runs_last5, chase_win_pct, venue_win_pct, elo_rating
            FROM team_form_snapshots
            WHERE team_id = %s
            ORDER BY created_at DESC LIMIT 1
        """, (team_id,))
        row = cur.fetchone()
        return dict(row) if row else {
            "last5_win_pct": 50, "avg_runs_last5": 165,
            "avg_powerplay_runs_last5": 48, "avg_death_runs_last5": 55,
            "chase_win_pct": 50, "venue_win_pct": 50, "elo_rating": 1500
        }

    t1 = team_form(match["team1_id"])
    t2 = team_form(match["team2_id"])

    # ── Venue stats ──────────────────────────────────────────
    cur.execute("""
        SELECT COALESCE(avg_first_innings_score, 165) AS avg_score,
               COALESCE(chase_win_pct, 50) AS chase_win_pct
        FROM venues WHERE id = %s
    """, (match["venue_id"],))
    venue = cur.fetchone() or {"avg_score": 165, "chase_win_pct": 50}

    # ── Head-to-head ─────────────────────────────────────────
    cur.execute("""
        SELECT COUNT(*) FILTER (WHERE winner_team_id = %s) AS t1_wins,
               COUNT(*) FILTER (WHERE winner_team_id = %s) AS t2_wins,
               COUNT(*) AS total
        FROM matches
        WHERE (team1_id = %s AND team2_id = %s OR team1_id = %s AND team2_id = %s)
          AND status = 'completed'
    """, (match["team1_id"], match["team2_id"],
          match["team1_id"], match["team2_id"],
          match["team2_id"], match["team1_id"]))
    h2h = cur.fetchone()
    total_h2h = max(h2h["total"], 1)

    toss_win_bat = 1 if match["toss_winner_team_id"] == match["team1_id"] and match["toss_decision"] == "bat" else 0

    conn.close()

    return {
        "match_id": match_id,
        "team1_elo": float(t1["elo_rating"] or 1500),
        "team2_elo": float(t2["elo_rating"] or 1500),
        "elo_diff": float((t1["elo_rating"] or 1500) - (t2["elo_rating"] or 1500)),
        "team1_last5_win_pct": float(t1["last5_win_pct"] or 50),
        "team2_last5_win_pct": float(t2["last5_win_pct"] or 50),
        "team1_avg_runs": float(t1["avg_runs_last5"] or 165),
        "team2_avg_runs": float(t2["avg_runs_last5"] or 165),
        "team1_powerplay": float(t1["avg_powerplay_runs_last5"] or 48),
        "team2_powerplay": float(t2["avg_powerplay_runs_last5"] or 48),
        "team1_death": float(t1["avg_death_runs_last5"] or 55),
        "team2_death": float(t2["avg_death_runs_last5"] or 55),
        "team1_chase_pct": float(t1["chase_win_pct"] or 50),
        "team2_chase_pct": float(t2["chase_win_pct"] or 50),
        "venue_avg_score": float(venue["avg_score"]),
        "venue_chase_pct": float(venue["chase_win_pct"]),
        "h2h_t1_win_pct": round(h2h["t1_wins"] / total_h2h * 100, 2),
        "toss_win_bat": toss_win_bat,
    }
