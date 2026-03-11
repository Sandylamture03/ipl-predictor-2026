"""Pre-match win probability inference."""
import os, joblib
import numpy as np
from src.features.build_pre_match_features import build_pre_match_features, get_connection

ARTIFACTS_DIR = os.path.join(os.path.dirname(__file__), "../../artifacts")
MODEL_PATH = os.path.join(ARTIFACTS_DIR, "pre_match_v1.pkl")

FEATURE_COLS = [
    "elo_diff", "team1_last5_win_pct", "team2_last5_win_pct",
    "team1_avg_runs", "team2_avg_runs", "team1_powerplay", "team2_powerplay",
    "team1_death", "team2_death", "team1_chase_pct", "team2_chase_pct",
    "venue_avg_score", "venue_chase_pct", "h2h_t1_win_pct", "toss_win_bat"
]


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
    X = np.array([[features.get(c, 0) for c in FEATURE_COLS]])
    prob = model.predict_proba(X)[0]

    # Feature importance as explanation
    importances = model.feature_importances_
    explanation = {c: round(float(importances[i]), 4) for i, c in enumerate(FEATURE_COLS)}

    return {
        "match_id": match_id,
        "model_version": artifact.get("version", "v1.0"),
        "team1_win_prob": round(float(prob[1]), 4),
        "team2_win_prob": round(float(prob[0]), 4),
        "features": features,
        "explanation": explanation,
    }
