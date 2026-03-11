"""Live in-match win probability inference using match state."""
import os
import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = os.environ.get("DATABASE_URL", "postgres://ipl_user:ipl_pass_2026@localhost:5432/ipl_predictor")


def predict_live(match_id: int) -> dict:
    conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
    cur = conn.cursor()

    cur.execute("""
        SELECT lm.*, m.team1_id, m.team2_id, m.toss_decision, m.toss_winner_team_id
        FROM live_match_state lm
        JOIN matches m ON m.id = lm.match_id
        WHERE lm.match_id = %s
    """, (match_id,))
    state = cur.fetchone()
    conn.close()

    if not state:
        return {
            "match_id": match_id, "model_version": "live_v1",
            "team1_win_prob": 0.50, "team2_win_prob": 0.50,
            "features": {}, "explanation": {"note": "No live state found"}
        }

    # Heuristic live model (ML model replacement when not trained)
    score = state["score"] or 0
    wickets = state["wickets"] or 0
    overs = float(state["overs"] or 0)
    target = state["target"]
    crr = float(state["current_run_rate"] or 0)
    rrr = float(state["required_run_rate"] or 0)

    if target and overs > 0:
        # 2nd innings: chasing
        balls_left = max((20 - overs) * 6, 1)
        wickets_left = 10 - wickets
        runs_needed = target - score

        pressure = min(rrr / max(crr, 0.1), 3.0)
        wkts_bonus = wickets_left / 10.0
        runs_ratio = max(1 - runs_needed / max(target, 1), 0)

        chase_prob = min(max(0.5 * wkts_bonus + 0.3 * runs_ratio + 0.2 * (1 / pressure), 0.05), 0.95)
        # batting team = team chasing
        batting_team_is_t1 = state["toss_winner_team_id"] != state["team1_id"] \
            if state["toss_decision"] == "bat" else state["toss_winner_team_id"] == state["team1_id"]
        t1_prob = chase_prob if batting_team_is_t1 else (1 - chase_prob)
    else:
        # 1st innings: rough estimate from current score vs expected
        expected_first_inns = 165
        projected = (score / max(overs, 0.1)) * 20 if overs > 0 else 165
        projected_ratio = min(projected / expected_first_inns, 1.5)
        batting_win_prob = min(max(0.3 + 0.2 * projected_ratio - 0.04 * wickets, 0.2), 0.8)
        batting_team_is_t1 = (state["toss_winner_team_id"] == state["team1_id"] and state["toss_decision"] == "bat") \
                              or (state["toss_winner_team_id"] != state["team1_id"] and state["toss_decision"] == "field")
        t1_prob = batting_win_prob if batting_team_is_t1 else (1 - batting_win_prob)

    features = {
        "score": score, "wickets": wickets, "overs": overs,
        "target": target, "crr": crr, "rrr": rrr,
        "innings": state["innings_number"]
    }

    return {
        "match_id": match_id, "model_version": "live_heuristic_v1",
        "team1_win_prob": round(t1_prob, 4),
        "team2_win_prob": round(1 - t1_prob, 4),
        "features": features,
        "explanation": {
            "note": "Heuristic model — train live model for better accuracy",
            "key_driver": "required_run_rate vs current_run_rate" if target else "projected_total"
        }
    }
