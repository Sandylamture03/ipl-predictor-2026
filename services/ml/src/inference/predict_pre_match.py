"""Pre-match win probability inference."""
import os, joblib
import numpy as np
import pandas as pd
from src.features.build_pre_match_features import build_pre_match_features, get_connection

ARTIFACTS_DIR = os.path.join(os.path.dirname(__file__), "../../artifacts")
MODEL_PATH = os.path.join(ARTIFACTS_DIR, "pre_match_v1.pkl")

FEATURE_COLS = [
    "elo_diff",
    "last5_win_pct_diff",
    "avg_runs_diff",
    "avg_wkts_diff",
    "avg_powerplay_diff",
    "avg_death_diff",
    "chase_win_pct_diff",
    "venue_win_pct_diff",
    "venue_avg_score",
    "venue_chase_pct",
    "player_bat_avg_diff",
    "player_strike_rate_diff",
    "player_boundary_pct_diff",
    "player_bowling_econ_diff",
    "player_bowling_sr_diff",
    "player_wickets_diff",
    "h2h_t1_win_pct",
    "toss_win_team1",
    "toss_bat",
    "toss_win_bat",
    "season_progress",
]

LEGACY_TO_CURRENT = {
    "team1_last5": "last5_win_pct_diff",
    "team2_last5": "last5_win_pct_diff",
    "team1_win_rate": "last5_win_pct_diff",
    "team2_win_rate": "last5_win_pct_diff",
    "toss_win_team1": "toss_win_bat",
    "toss_bat": "toss_win_bat",
    # Older trainer used innings totals as proxy features; map to current aggregates.
    "inn1_runs": "avg_runs_diff",
    "inn2_runs": "avg_runs_diff",
}


def predict_pre_match(match_id: int) -> dict:
    features = build_pre_match_features(match_id)

    # If model doesn't exist yet, return neutral estimate
    if not os.path.exists(MODEL_PATH):
        return {
            "match_id": match_id, "model_version": "none",
            "team1_win_prob": 0.50, "team2_win_prob": 0.50,
            "features": features,
            "explanation": {"note": "Model not trained yet. Run train_pre_match.py first."}
        }

    artifact = joblib.load(MODEL_PATH)
    model = artifact["model"]
    model_cols = artifact.get("feature_cols") or FEATURE_COLS

    # Support old artifacts with different column names by mapping to current features.
    def get_feature_value(col_name: str):
        if col_name in features:
            return features.get(col_name)
        mapped = LEGACY_TO_CURRENT.get(col_name)
        if mapped:
            return features.get(mapped, 0) or 0
        if col_name == "season":
            return ""
        return 0

    model_kind = artifact.get("model_kind", "")
    is_pipeline = hasattr(model, "named_steps") or "logreg" in str(model_kind).lower()
    if is_pipeline:
        row = {c: get_feature_value(c) for c in model_cols}
        X = pd.DataFrame([row])
        prob = model.predict_proba(X)[0]
        try:
            pre = model.named_steps["pre"]
            clf = model.named_steps["clf"]
            names = pre.get_feature_names_out()
            coef = clf.coef_[0]
            top_idx = np.argsort(np.abs(coef))[::-1][:10]
            explanation = {str(names[i]): round(float(abs(coef[i])), 4) for i in top_idx}
        except Exception:
            explanation = {
                str(item.get("feature")): float(item.get("importance", 0))
                for item in artifact.get("top_features", [])
            }
    else:
        X = np.array([[float(get_feature_value(c) or 0) for c in model_cols]], dtype=float)
        prob = model.predict_proba(X)[0]
        if hasattr(model, "feature_importances_"):
            importances = model.feature_importances_
            explanation = {c: round(float(importances[i]), 4) for i, c in enumerate(model_cols)}
        else:
            explanation = {
                str(item.get("feature")): float(item.get("importance", 0))
                for item in artifact.get("top_features", [])
            }

    return {
        "match_id": match_id,
        "model_version": artifact.get("version", "v1.0"),
        "team1_win_prob": round(float(prob[1]), 4),
        "team2_win_prob": round(float(prob[0]), 4),
        "features": features,
        "explanation": explanation,
    }
