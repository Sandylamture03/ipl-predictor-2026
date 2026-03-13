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

NON_BOWLER_WICKET_KINDS = {
    "run out",
    "retired hurt",
    "retired out",
    "obstructing the field",
}

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
    "recent_runs_6",
    "recent_wkts_6",
    "recent_boundaries_6",
    "dot_balls_12",
    "momentum_delta_runs_6",
    "striker_runs",
    "striker_balls",
    "striker_sr",
    "non_striker_runs",
    "non_striker_balls",
    "non_striker_sr",
    "bowler_balls",
    "bowler_runs_conceded",
    "bowler_wkts",
    "bowler_econ",
    "partnership_runs",
    "partnership_balls",
    "partnership_run_rate",
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


def _tail_sum(values, n: int) -> float:
    if not values:
        return 0.0
    return float(sum(values[-n:]))


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


def _is_legal_delivery_row(row) -> bool:
    if row.get("legal_ball_number") is not None:
        return True
    extra_type = str(row.get("extra_type") or "").strip().lower()
    return extra_type not in ("wides", "noballs")


def _is_ball_faced_row(row) -> bool:
    extra_type = str(row.get("extra_type") or "").strip().lower()
    return extra_type != "wides"


def _bowler_runs_conceded_row(row) -> float:
    runs_total = _safe_float(row.get("runs_total"), 0.0)
    extra_type = str(row.get("extra_type") or "").strip().lower()
    extra_runs = _safe_float(row.get("extra_runs"), 0.0)
    if extra_type in ("byes", "legbyes"):
        return runs_total - extra_runs
    return runs_total


def _is_bowler_wicket_row(row) -> bool:
    if not row.get("is_wicket"):
        return False
    kind = str(row.get("wicket_kind") or "").strip().lower()
    if not kind:
        return False
    return kind not in NON_BOWLER_WICKET_KINDS


def _empty_context() -> dict:
    return {
        "recent_runs_12": 0.0,
        "recent_wkts_12": 0.0,
        "recent_boundaries_12": 0.0,
        "recent_runs_6": 0.0,
        "recent_wkts_6": 0.0,
        "recent_boundaries_6": 0.0,
        "dot_balls_12": 0.0,
        "momentum_delta_runs_6": 0.0,
        "striker_runs": 0.0,
        "striker_balls": 0.0,
        "striker_sr": 0.0,
        "non_striker_runs": 0.0,
        "non_striker_balls": 0.0,
        "non_striker_sr": 0.0,
        "bowler_balls": 0.0,
        "bowler_runs_conceded": 0.0,
        "bowler_wkts": 0.0,
        "bowler_econ": 0.0,
        "partnership_runs": 0.0,
        "partnership_balls": 0.0,
        "partnership_run_rate": 0.0,
    }


def _resolve_active_ids(rows, striker_id: int, non_striker_id: int, bowler_id: int):
    active_striker = striker_id if striker_id > 0 else 0
    active_non_striker = non_striker_id if non_striker_id > 0 else 0
    active_bowler = bowler_id if bowler_id > 0 else 0

    if not rows:
        return active_striker, active_non_striker, active_bowler

    if active_striker <= 0:
        for row in reversed(rows):
            bid = _safe_int(row.get("batter_id"), 0)
            if bid > 0:
                active_striker = bid
                break

    if active_non_striker <= 0:
        for row in reversed(rows):
            nsid = _safe_int(row.get("non_striker_id"), 0)
            if nsid > 0:
                active_non_striker = nsid
                break

    if active_bowler <= 0:
        for row in reversed(rows):
            boid = _safe_int(row.get("bowler_id"), 0)
            if boid > 0:
                active_bowler = boid
                break

    return active_striker, active_non_striker, active_bowler


def _fetch_innings_context(
    cur,
    match_id: int,
    innings_number: int,
    striker_id: int,
    non_striker_id: int,
    bowler_id: int,
):
    cur.execute(
        """
        SELECT
          batter_id,
          non_striker_id,
          bowler_id,
          runs_batter,
          runs_total,
          extra_type,
          extra_runs,
          is_wicket,
          wicket_kind,
          is_boundary_four,
          is_boundary_six,
          legal_ball_number,
          over_number,
          ball_in_over
        FROM deliveries
        WHERE match_id = %s
          AND innings_number = %s
        ORDER BY over_number ASC, ball_in_over ASC
        """,
        (match_id, innings_number),
    )
    rows = cur.fetchall() or []
    if not rows:
        return _empty_context()

    active_striker, active_non_striker, active_bowler = _resolve_active_ids(
        rows,
        striker_id,
        non_striker_id,
        bowler_id,
    )

    legal_runs = []
    legal_wkts = []
    legal_boundaries = []
    legal_dots = []

    striker_runs = 0.0
    striker_balls = 0.0
    non_striker_runs = 0.0
    non_striker_balls = 0.0
    bowler_balls = 0.0
    bowler_runs_conceded = 0.0
    bowler_wkts = 0.0

    partnership_runs = 0.0
    partnership_balls = 0.0

    for row in rows:
        runs_total = _safe_float(row.get("runs_total"), 0.0)
        runs_batter = _safe_float(row.get("runs_batter"), 0.0)

        batter_row_id = _safe_int(row.get("batter_id"), 0)
        bowler_row_id = _safe_int(row.get("bowler_id"), 0)

        legal = _is_legal_delivery_row(row)
        ball_faced = _is_ball_faced_row(row)
        wicket = bool(row.get("is_wicket"))
        boundary = bool(row.get("is_boundary_four") or row.get("is_boundary_six"))

        if active_striker > 0 and batter_row_id == active_striker:
            striker_runs += runs_batter
            if ball_faced:
                striker_balls += 1

        if active_non_striker > 0 and batter_row_id == active_non_striker:
            non_striker_runs += runs_batter
            if ball_faced:
                non_striker_balls += 1

        if active_bowler > 0 and bowler_row_id == active_bowler:
            bowler_runs_conceded += _bowler_runs_conceded_row(row)
            if legal:
                bowler_balls += 1
            if _is_bowler_wicket_row(row):
                bowler_wkts += 1

        partnership_runs += runs_total
        if legal:
            partnership_balls += 1

        if legal:
            legal_runs.append(runs_total)
            legal_wkts.append(1.0 if wicket else 0.0)
            legal_boundaries.append(1.0 if boundary else 0.0)
            legal_dots.append(1.0 if runs_total == 0 else 0.0)

        if wicket:
            partnership_runs = 0.0
            partnership_balls = 0.0

    recent_runs_12 = _tail_sum(legal_runs, 12)
    recent_wkts_12 = _tail_sum(legal_wkts, 12)
    recent_boundaries_12 = _tail_sum(legal_boundaries, 12)
    recent_runs_6 = _tail_sum(legal_runs, 6)
    recent_wkts_6 = _tail_sum(legal_wkts, 6)
    recent_boundaries_6 = _tail_sum(legal_boundaries, 6)
    dot_balls_12 = _tail_sum(legal_dots, 12)

    prev_runs_6 = float(sum(legal_runs[-12:-6])) if len(legal_runs) > 6 else 0.0
    momentum_delta_runs_6 = recent_runs_6 - prev_runs_6

    striker_sr = (striker_runs * 100.0) / max(striker_balls, 1.0)
    non_striker_sr = (non_striker_runs * 100.0) / max(non_striker_balls, 1.0)
    bowler_econ = (bowler_runs_conceded * 6.0) / max(bowler_balls, 1.0)
    partnership_run_rate = (partnership_runs * 6.0) / max(partnership_balls, 1.0)

    return {
        "recent_runs_12": float(recent_runs_12),
        "recent_wkts_12": float(recent_wkts_12),
        "recent_boundaries_12": float(recent_boundaries_12),
        "recent_runs_6": float(recent_runs_6),
        "recent_wkts_6": float(recent_wkts_6),
        "recent_boundaries_6": float(recent_boundaries_6),
        "dot_balls_12": float(dot_balls_12),
        "momentum_delta_runs_6": float(round(momentum_delta_runs_6, 4)),
        "striker_runs": float(striker_runs),
        "striker_balls": float(striker_balls),
        "striker_sr": float(round(striker_sr, 4)),
        "non_striker_runs": float(non_striker_runs),
        "non_striker_balls": float(non_striker_balls),
        "non_striker_sr": float(round(non_striker_sr, 4)),
        "bowler_balls": float(bowler_balls),
        "bowler_runs_conceded": float(bowler_runs_conceded),
        "bowler_wkts": float(bowler_wkts),
        "bowler_econ": float(round(bowler_econ, 4)),
        "partnership_runs": float(partnership_runs),
        "partnership_balls": float(partnership_balls),
        "partnership_run_rate": float(round(partnership_run_rate, 4)),
    }


def _build_features(state, ctx: dict):
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
        "recent_runs_12": float(ctx.get("recent_runs_12", 0.0)),
        "recent_wkts_12": float(ctx.get("recent_wkts_12", 0.0)),
        "recent_boundaries_12": float(ctx.get("recent_boundaries_12", 0.0)),
        "recent_runs_6": float(ctx.get("recent_runs_6", 0.0)),
        "recent_wkts_6": float(ctx.get("recent_wkts_6", 0.0)),
        "recent_boundaries_6": float(ctx.get("recent_boundaries_6", 0.0)),
        "dot_balls_12": float(ctx.get("dot_balls_12", 0.0)),
        "momentum_delta_runs_6": float(ctx.get("momentum_delta_runs_6", 0.0)),
        "striker_runs": float(ctx.get("striker_runs", 0.0)),
        "striker_balls": float(ctx.get("striker_balls", 0.0)),
        "striker_sr": float(ctx.get("striker_sr", 0.0)),
        "non_striker_runs": float(ctx.get("non_striker_runs", 0.0)),
        "non_striker_balls": float(ctx.get("non_striker_balls", 0.0)),
        "non_striker_sr": float(ctx.get("non_striker_sr", 0.0)),
        "bowler_balls": float(ctx.get("bowler_balls", 0.0)),
        "bowler_runs_conceded": float(ctx.get("bowler_runs_conceded", 0.0)),
        "bowler_wkts": float(ctx.get("bowler_wkts", 0.0)),
        "bowler_econ": float(ctx.get("bowler_econ", 0.0)),
        "partnership_runs": float(ctx.get("partnership_runs", 0.0)),
        "partnership_balls": float(ctx.get("partnership_balls", 0.0)),
        "partnership_run_rate": float(ctx.get("partnership_run_rate", 0.0)),
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

        ctx = _fetch_innings_context(
            cur,
            match_id,
            innings_number,
            _safe_int(state.get("striker_id"), 0),
            _safe_int(state.get("non_striker_id"), 0),
            _safe_int(state.get("bowler_id"), 0),
        )
        features = _build_features(state, ctx)

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
                "model_version": artifact.get("version", "live_ml_v3"),
                "team1_win_prob": round(float(team1_prob), 4),
                "team2_win_prob": round(float(1.0 - team1_prob), 4),
                "features": features,
                "explanation": {
                    "note": "Trained live model with player-on-crease, bowler, and momentum features.",
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
