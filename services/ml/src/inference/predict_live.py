"""Live in-match win probability inference using trained model + heuristic fallback."""

import math
import os

import joblib
import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = os.environ.get(
    "DATABASE_URL", "postgres://ipl_user:ipl_pass_2026@127.0.0.1:5432/ipl_predictor"
)

ARTIFACTS_DIR = os.path.join(os.path.dirname(__file__), "../../artifacts")
LIVE_MODEL_PATH = os.path.join(ARTIFACTS_DIR, "live_match_v1.pkl")

FEATURE_COLS = [
    "innings_number",
    "batting_team_is_t1",
    "score",
    "wickets",
    "wickets_left",
    "balls_bowled",
    "balls_left",
    "target",
    "runs_needed",
    "current_run_rate",
    "required_run_rate",
    "run_rate_diff",
    "pressure_index",
    "projected_total",
    "progress_pct",
    "required_per_wicket",
    "recent_runs_12",
    "recent_wkts_12",
    "recent_boundaries_12",
]

_LIVE_ARTIFACT = None
_LIVE_ARTIFACT_LOAD_ATTEMPTED = False


def _safe_int(value, default=0):
    try:
        return int(value)
    except Exception:
        return default


def _safe_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return default


def _overs_to_balls(overs_value) -> int:
    overs = _safe_float(overs_value, 0.0)
    if overs <= 0:
        return 0
    whole_overs = int(math.floor(overs))
    partial_balls = int(round((overs - whole_overs) * 10))
    partial_balls = max(0, min(partial_balls, 5))
    return max(0, min(whole_overs * 6 + partial_balls, 120))


def _other_team(team_id, team1_id, team2_id):
    if team_id == team1_id:
        return team2_id
    if team_id == team2_id:
        return team1_id
    return None


def _infer_batting_team_id(state):
    innings_batting_team = state.get("innings_batting_team_id")
    if innings_batting_team is not None:
        return _safe_int(innings_batting_team, 0)

    innings_number = max(1, _safe_int(state.get("innings_number"), 1))
    team1_id = _safe_int(state.get("team1_id"), 0)
    team2_id = _safe_int(state.get("team2_id"), 0)
    toss_winner = _safe_int(state.get("toss_winner_team_id"), 0)
    toss_decision = str(state.get("toss_decision") or "").strip().lower()

    if team1_id == 0 or team2_id == 0:
        return team1_id

    if toss_winner not in (team1_id, team2_id):
        return team1_id if innings_number == 1 else team2_id

    if toss_decision == "bat":
        first_innings_batting = toss_winner
    elif toss_decision == "field":
        first_innings_batting = _other_team(toss_winner, team1_id, team2_id)
    else:
        first_innings_batting = team1_id

    if innings_number == 1:
        return first_innings_batting or team1_id
    return _other_team(first_innings_batting, team1_id, team2_id) or team2_id


def _fetch_recent_window(cur, match_id: int, innings_number: int):
    cur.execute(
        """
        SELECT runs_total, is_wicket, is_boundary_four, is_boundary_six
        FROM deliveries
        WHERE match_id = %s
          AND innings_number = %s
          AND legal_ball_number IS NOT NULL
        ORDER BY over_number DESC, ball_in_over DESC
        LIMIT 12
        """,
        (match_id, innings_number),
    )
    recent = cur.fetchall() or []
    recent_runs = float(sum(_safe_int(r.get("runs_total"), 0) for r in recent))
    recent_wkts = float(sum(1 if r.get("is_wicket") else 0 for r in recent))
    recent_boundaries = float(
        sum(1 if (r.get("is_boundary_four") or r.get("is_boundary_six")) else 0 for r in recent)
    )
    return recent_runs, recent_wkts, recent_boundaries


def _build_features(
    state,
    recent_runs_12: float,
    recent_wkts_12: float,
    recent_boundaries_12: float,
):
    innings_number = max(1, _safe_int(state.get("innings_number"), 1))
    team1_id = _safe_int(state.get("team1_id"), 0)
    batting_team_id = _infer_batting_team_id(state)

    score = _safe_float(state.get("score"), 0.0)
    wickets = max(0.0, min(_safe_float(state.get("wickets"), 0.0), 10.0))
    wickets_left = max(10.0 - wickets, 0.0)

    balls_bowled = float(_overs_to_balls(state.get("overs")))
    balls_left = max(120.0 - balls_bowled, 0.0)

    target_from_state = _safe_float(state.get("target"), 0.0)
    target_from_innings = _safe_float(state.get("innings_target_runs"), 0.0)
    target = target_from_state if target_from_state > 0 else target_from_innings

    runs_needed = max(target - score, 0.0) if target > 0 else 0.0

    current_run_rate = _safe_float(state.get("current_run_rate"), 0.0)
    if current_run_rate <= 0 and balls_bowled > 0:
        current_run_rate = (score * 6.0) / balls_bowled

    required_run_rate = _safe_float(state.get("required_run_rate"), 0.0)
    if target > 0 and balls_left > 0 and required_run_rate <= 0:
        required_run_rate = (runs_needed * 6.0) / balls_left
    if target <= 0:
        required_run_rate = 0.0

    run_rate_diff = current_run_rate - required_run_rate
    pressure_index = (required_run_rate / (current_run_rate + 0.1)) if target > 0 else 0.0
    projected_total = score + (current_run_rate * balls_left / 6.0)
    progress_pct = (balls_bowled / 120.0) * 100.0
    required_per_wicket = (runs_needed / max(wickets_left, 1.0)) if target > 0 else 0.0

    return {
        "innings_number": float(innings_number),
        "batting_team_is_t1": float(1 if batting_team_id == team1_id else 0),
        "score": float(score),
        "wickets": float(wickets),
        "wickets_left": float(wickets_left),
        "balls_bowled": float(balls_bowled),
        "balls_left": float(balls_left),
        "target": float(target),
        "runs_needed": float(runs_needed),
        "current_run_rate": float(round(current_run_rate, 4)),
        "required_run_rate": float(round(required_run_rate, 4)),
        "run_rate_diff": float(round(run_rate_diff, 4)),
        "pressure_index": float(round(pressure_index, 4)),
        "projected_total": float(round(projected_total, 4)),
        "progress_pct": float(round(progress_pct, 4)),
        "required_per_wicket": float(round(required_per_wicket, 4)),
        "recent_runs_12": float(recent_runs_12),
        "recent_wkts_12": float(recent_wkts_12),
        "recent_boundaries_12": float(recent_boundaries_12),
    }


def _load_live_artifact():
    global _LIVE_ARTIFACT, _LIVE_ARTIFACT_LOAD_ATTEMPTED
    if _LIVE_ARTIFACT_LOAD_ATTEMPTED:
        return _LIVE_ARTIFACT

    _LIVE_ARTIFACT_LOAD_ATTEMPTED = True
    if not os.path.exists(LIVE_MODEL_PATH):
        _LIVE_ARTIFACT = None
        return None

    try:
        _LIVE_ARTIFACT = joblib.load(LIVE_MODEL_PATH)
    except Exception:
        _LIVE_ARTIFACT = None
    return _LIVE_ARTIFACT


def _predict_with_heuristic(features: dict):
    target = features["target"]
    score = features["score"]
    wickets = features["wickets"]
    wickets_left = max(features["wickets_left"], 0.0)
    crr = max(features["current_run_rate"], 0.0)
    rrr = max(features["required_run_rate"], 0.0)

    if target > 0:
        runs_needed = max(target - score, 0.0)
        pressure = min(rrr / max(crr, 0.1), 3.0)
        wkts_bonus = wickets_left / 10.0
        runs_ratio = max(1.0 - (runs_needed / max(target, 1.0)), 0.0)
        batting_prob = min(max(0.5 * wkts_bonus + 0.3 * runs_ratio + 0.2 * (1.0 / pressure), 0.05), 0.95)
        key_driver = "required_run_rate vs current_run_rate"
    else:
        expected_first_inns = 165.0
        projected = features["projected_total"] if features["projected_total"] > 0 else 165.0
        projected_ratio = min(projected / expected_first_inns, 1.5)
        batting_prob = min(max(0.3 + 0.2 * projected_ratio - 0.04 * wickets, 0.2), 0.8)
        key_driver = "projected_total"

    return float(batting_prob), key_driver


def predict_live(match_id: int) -> dict:
    conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
              lm.*,
              m.team1_id,
              m.team2_id,
              m.toss_decision,
              m.toss_winner_team_id,
              i.batting_team_id AS innings_batting_team_id,
              i.target_runs AS innings_target_runs
            FROM live_match_state lm
            JOIN matches m ON m.id = lm.match_id
            LEFT JOIN innings i
              ON i.match_id = lm.match_id
             AND i.innings_number = lm.innings_number
            WHERE lm.match_id = %s
            """,
            (match_id,),
        )
        state = cur.fetchone()

        if not state:
            return {
                "match_id": match_id,
                "model_version": "live_missing_state",
                "team1_win_prob": 0.50,
                "team2_win_prob": 0.50,
                "features": {},
                "explanation": {"note": "No live state found"},
            }

        innings_number = max(1, _safe_int(state.get("innings_number"), 1))
        recent_runs_12, recent_wkts_12, recent_boundaries_12 = _fetch_recent_window(
            cur, match_id, innings_number
        )
        features = _build_features(state, recent_runs_12, recent_wkts_12, recent_boundaries_12)

        artifact = _load_live_artifact()
        batting_team_is_t1 = bool(int(features["batting_team_is_t1"]))

        if artifact and artifact.get("model") is not None:
            model = artifact["model"]
            model_cols = artifact.get("feature_cols") or FEATURE_COLS
            x_row = pd.DataFrame(
                [{col: float(features.get(col, 0.0)) for col in model_cols}],
                columns=model_cols,
            )
            probs = model.predict_proba(x_row)[0]
            batting_team_win_prob = float(np.clip(probs[1], 0.01, 0.99))
            team1_prob = batting_team_win_prob if batting_team_is_t1 else 1.0 - batting_team_win_prob

            return {
                "match_id": match_id,
                "model_version": artifact.get("version", "live_ml_v2"),
                "team1_win_prob": round(float(team1_prob), 4),
                "team2_win_prob": round(float(1.0 - team1_prob), 4),
                "features": features,
                "explanation": {
                    "note": "Trained live model (ball-by-ball historical states).",
                    "model_kind": artifact.get("model_kind", "live_ml"),
                    "metrics": {
                        "accuracy": artifact.get("accuracy"),
                        "auc": artifact.get("auc"),
                        "log_loss": artifact.get("log_loss"),
                        "brier": artifact.get("brier"),
                    },
                    "top_features": artifact.get("top_features", []),
                },
            }

        batting_prob, key_driver = _predict_with_heuristic(features)
        team1_prob = batting_prob if batting_team_is_t1 else 1.0 - batting_prob
        return {
            "match_id": match_id,
            "model_version": "live_heuristic_v1",
            "team1_win_prob": round(float(team1_prob), 4),
            "team2_win_prob": round(float(1.0 - team1_prob), 4),
            "features": features,
            "explanation": {
                "note": "Live model artifact missing; using heuristic fallback.",
                "key_driver": key_driver,
            },
        }
    finally:
        conn.close()
