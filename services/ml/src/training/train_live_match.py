"""Train a true live in-match win probability model from Cricsheet ball-by-ball states."""

import json
import os
import sys
from collections import defaultdict, deque
from typing import Dict, List

import joblib
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

ROOT_ENV = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", ".env"))
load_dotenv(ROOT_ENV)
load_dotenv()

DEFAULT_DATA_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "data", "cricsheet")
)

ARTIFACTS_DIR = os.path.join(os.path.dirname(__file__), "../../artifacts")
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

ARTIFACT_PATH = os.path.join(ARTIFACTS_DIR, "live_match_v1.pkl")

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


def is_legal_ball(delivery: Dict) -> bool:
    extras = delivery.get("extras") or {}
    return extras.get("wides") is None and extras.get("noballs") is None


def is_ball_faced(delivery: Dict) -> bool:
    extras = delivery.get("extras") or {}
    return extras.get("wides") is None


def runs_conceded_by_bowler(delivery: Dict) -> int:
    runs_obj = delivery.get("runs") or {}
    total = int(runs_obj.get("total") or 0)
    extras = delivery.get("extras") or {}
    byes = int(extras.get("byes") or 0)
    legbyes = int(extras.get("legbyes") or 0)
    return total - byes - legbyes


def is_bowler_wicket(wicket_obj: Dict) -> bool:
    kind = str((wicket_obj or {}).get("kind") or "").strip().lower()
    if not kind:
        return False
    return kind not in NON_BOWLER_WICKET_KINDS


def player_key(name) -> str:
    return str(name or "").strip().lower()


def tail_sum(values: List[float], n: int) -> float:
    if not values:
        return 0.0
    return float(sum(values[-n:]))


def parse_match_rows(file_path: str) -> List[Dict]:
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    info = data.get("info") or {}
    teams = info.get("teams") or []
    innings = data.get("innings") or []
    outcome = info.get("outcome") or {}
    winner = outcome.get("winner")

    if len(teams) < 2 or not winner or not innings:
        return []

    match_ref = os.path.basename(file_path).replace(".json", "")
    match_date = str((info.get("dates") or ["2008-01-01"])[0])
    team1 = teams[0]

    rows: List[Dict] = []
    first_innings_total = None

    for inn_idx, inn in enumerate(innings[:2], start=1):
        batting_team = inn.get("team")
        if not batting_team:
            continue

        target = (inn.get("target") or {}).get("runs")
        if inn_idx == 2 and (target is None) and first_innings_total is not None:
            target = int(first_innings_total) + 1

        legal_balls = 0
        score = 0
        wickets = 0

        recent_runs = deque(maxlen=24)
        recent_wkts = deque(maxlen=24)
        recent_boundaries = deque(maxlen=24)
        recent_dots = deque(maxlen=24)

        batter_stats = defaultdict(lambda: {"runs": 0.0, "balls": 0.0})
        bowler_stats = defaultdict(lambda: {"runs": 0.0, "balls": 0.0, "wkts": 0.0})

        partnership_runs = 0.0
        partnership_balls = 0.0

        overs = inn.get("overs") or []
        for ov in overs:
            deliveries = ov.get("deliveries") or []
            for delivery in deliveries:
                runs_obj = delivery.get("runs") or {}
                runs_total = int(runs_obj.get("total") or 0)
                runs_batter = int(runs_obj.get("batter") or 0)
                wickets_list = delivery.get("wickets") or []
                wicket_count = int(len(wickets_list))
                boundary = 1 if runs_batter in (4, 6) else 0

                batter = player_key(delivery.get("batter"))
                non_striker = player_key(delivery.get("non_striker"))
                bowler = player_key(delivery.get("bowler"))

                legal_ball = is_legal_ball(delivery)
                ball_faced = is_ball_faced(delivery)

                score += runs_total
                wickets += wicket_count

                if batter:
                    batter_stats[batter]["runs"] += runs_batter
                    if ball_faced:
                        batter_stats[batter]["balls"] += 1
                if non_striker:
                    _ = batter_stats[non_striker]

                if bowler:
                    bowler_stats[bowler]["runs"] += runs_conceded_by_bowler(delivery)
                    if legal_ball:
                        bowler_stats[bowler]["balls"] += 1
                    for wicket_obj in wickets_list:
                        if is_bowler_wicket(wicket_obj):
                            bowler_stats[bowler]["wkts"] += 1

                partnership_runs += runs_total

                if legal_ball:
                    legal_balls = min(120, legal_balls + 1)
                    partnership_balls += 1

                    recent_runs.append(float(runs_total))
                    recent_wkts.append(float(wicket_count))
                    recent_boundaries.append(float(boundary))
                    recent_dots.append(1.0 if runs_total == 0 else 0.0)

                balls_bowled = legal_balls
                balls_left = max(120 - balls_bowled, 0)
                wickets_left = max(10 - wickets, 0)
                current_run_rate = (score * 6.0) / max(balls_bowled, 1)

                if target:
                    runs_needed = max(int(target) - score, 0)
                    required_run_rate = (
                        (runs_needed * 6.0) / max(balls_left, 1)
                        if balls_left > 0
                        else (0.0 if runs_needed <= 0 else 36.0)
                    )
                else:
                    runs_needed = 0
                    required_run_rate = 0.0

                run_rate_diff = current_run_rate - required_run_rate
                pressure_index = (
                    required_run_rate / (current_run_rate + 0.1) if target else 0.0
                )
                projected_total = score + (current_run_rate * balls_left / 6.0)
                progress_pct = (balls_bowled / 120.0) * 100.0
                required_per_wicket = (
                    runs_needed / max(wickets_left, 1) if target else 0.0
                )

                rr = list(recent_runs)
                rw = list(recent_wkts)
                rb = list(recent_boundaries)
                rd = list(recent_dots)

                recent_runs_12 = tail_sum(rr, 12)
                recent_wkts_12 = tail_sum(rw, 12)
                recent_boundaries_12 = tail_sum(rb, 12)

                recent_runs_6 = tail_sum(rr, 6)
                recent_wkts_6 = tail_sum(rw, 6)
                recent_boundaries_6 = tail_sum(rb, 6)
                dot_balls_12 = tail_sum(rd, 12)

                prev_runs_6 = float(sum(rr[-12:-6])) if len(rr) > 6 else 0.0
                momentum_delta_runs_6 = recent_runs_6 - prev_runs_6

                striker_stats = batter_stats[batter] if batter else {"runs": 0.0, "balls": 0.0}
                non_striker_stats = (
                    batter_stats[non_striker] if non_striker else {"runs": 0.0, "balls": 0.0}
                )
                bowler_row = (
                    bowler_stats[bowler] if bowler else {"runs": 0.0, "balls": 0.0, "wkts": 0.0}
                )

                striker_runs = float(striker_stats["runs"])
                striker_balls = float(striker_stats["balls"])
                striker_sr = (striker_runs * 100.0) / max(striker_balls, 1.0)

                non_striker_runs = float(non_striker_stats["runs"])
                non_striker_balls = float(non_striker_stats["balls"])
                non_striker_sr = (non_striker_runs * 100.0) / max(non_striker_balls, 1.0)

                bowler_balls = float(bowler_row["balls"])
                bowler_runs_conceded = float(bowler_row["runs"])
                bowler_wkts = float(bowler_row["wkts"])
                bowler_econ = (bowler_runs_conceded * 6.0) / max(bowler_balls, 1.0)

                partnership_run_rate = (partnership_runs * 6.0) / max(partnership_balls, 1.0)

                rows.append(
                    {
                        "match_ref": match_ref,
                        "match_date": match_date,
                        "innings_number": 1 if inn_idx == 1 else 2,
                        "batting_team_is_t1": 1 if batting_team == team1 else 0,
                        "score": float(score),
                        "wickets": float(wickets),
                        "wickets_left": float(wickets_left),
                        "balls_bowled": float(balls_bowled),
                        "balls_left": float(balls_left),
                        "target": float(target or 0),
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
                        "batting_team_win": 1 if winner == batting_team else 0,
                    }
                )

                if wicket_count > 0:
                    partnership_runs = 0.0
                    partnership_balls = 0.0

        if inn_idx == 1:
            first_innings_total = score

    return rows


def load_rows(data_dir: str) -> pd.DataFrame:
    if not os.path.isdir(data_dir):
        raise FileNotFoundError(f"Cricsheet data dir not found: {data_dir}")

    files = sorted(
        [
            os.path.join(data_dir, file_name)
            for file_name in os.listdir(data_dir)
            if file_name.endswith(".json")
        ]
    )
    if not files:
        raise FileNotFoundError(f"No Cricsheet JSON files found under: {data_dir}")

    all_rows: List[Dict] = []
    parsed = 0
    for file_path in files:
        try:
            rows = parse_match_rows(file_path)
            if rows:
                all_rows.extend(rows)
                parsed += 1
        except Exception:
            # Keep training robust even if a few files are malformed.
            continue

    if not all_rows:
        raise RuntimeError("No trainable live rows could be built from Cricsheet files.")

    df = pd.DataFrame(all_rows)
    df["match_date"] = pd.to_datetime(df["match_date"], errors="coerce").fillna(
        pd.Timestamp("2008-01-01")
    )
    df = df.sort_values(
        ["match_date", "match_ref", "innings_number", "balls_bowled"], ignore_index=True
    )
    print(f"Loaded {len(df):,} live-state rows from {parsed} matches.")
    return df


def split_by_match(df: pd.DataFrame):
    match_meta = (
        df[["match_ref", "match_date"]]
        .drop_duplicates()
        .sort_values(["match_date", "match_ref"])
        .reset_index(drop=True)
    )
    if len(match_meta) < 20:
        raise RuntimeError("Not enough matches to split train/test robustly.")

    split_idx = max(1, min(int(len(match_meta) * 0.8), len(match_meta) - 1))
    train_refs = set(match_meta.iloc[:split_idx]["match_ref"])
    test_refs = set(match_meta.iloc[split_idx:]["match_ref"])

    train_df = df[df["match_ref"].isin(train_refs)].copy()
    test_df = df[df["match_ref"].isin(test_refs)].copy()
    return train_df, test_df, len(train_refs), len(test_refs)


def evaluate_model(model, x_test: pd.DataFrame, y_test: np.ndarray):
    y_prob = model.predict_proba(x_test)[:, 1]
    y_pred = (y_prob >= 0.5).astype(int)
    return {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "auc": float(roc_auc_score(y_test, y_prob)),
        "log_loss": float(log_loss(y_test, y_prob)),
        "brier": float(brier_score_loss(y_test, y_prob)),
    }


def train(data_dir: str = DEFAULT_DATA_DIR):
    print(f"Building live training set from: {data_dir}")
    df = load_rows(data_dir)
    train_df, test_df, train_matches, test_matches = split_by_match(df)

    train_df[FEATURE_COLS] = train_df[FEATURE_COLS].apply(pd.to_numeric, errors="coerce")
    test_df[FEATURE_COLS] = test_df[FEATURE_COLS].apply(pd.to_numeric, errors="coerce")

    train_df[FEATURE_COLS] = train_df[FEATURE_COLS].replace([np.inf, -np.inf], np.nan).fillna(0.0)
    test_df[FEATURE_COLS] = test_df[FEATURE_COLS].replace([np.inf, -np.inf], np.nan).fillna(0.0)

    x_train = train_df[FEATURE_COLS].astype(float)
    y_train = train_df["batting_team_win"].astype(int).values
    x_test = test_df[FEATURE_COLS].astype(float)
    y_test = test_df["batting_team_win"].astype(int).values

    print(
        f"Training rows={len(x_train):,} ({train_matches} matches), "
        f"test rows={len(x_test):,} ({test_matches} matches)"
    )

    xgb_model = XGBClassifier(
        n_estimators=420,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        min_child_weight=2,
        reg_alpha=0.0,
        reg_lambda=1.2,
        objective="binary:logistic",
        eval_metric="logloss",
        tree_method="hist",
        random_state=42,
    )
    xgb_model.fit(x_train, y_train)
    xgb_metrics = evaluate_model(xgb_model, x_test, y_test)

    lr_model = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(max_iter=2500, C=0.8)),
        ]
    )
    lr_model.fit(x_train, y_train)
    lr_metrics = evaluate_model(lr_model, x_test, y_test)

    print(
        "XGBoost -> "
        f"Accuracy={xgb_metrics['accuracy']:.4f} "
        f"AUC={xgb_metrics['auc']:.4f} "
        f"LogLoss={xgb_metrics['log_loss']:.4f} "
        f"Brier={xgb_metrics['brier']:.4f}"
    )
    print(
        "LogReg  -> "
        f"Accuracy={lr_metrics['accuracy']:.4f} "
        f"AUC={lr_metrics['auc']:.4f} "
        f"LogLoss={lr_metrics['log_loss']:.4f} "
        f"Brier={lr_metrics['brier']:.4f}"
    )

    candidates = [
        {
            "name": "xgboost_live_v3",
            "model": xgb_model,
            "metrics": xgb_metrics,
            "version": "live_ml_v3_xgb",
        },
        {
            "name": "logreg_live_v3",
            "model": lr_model,
            "metrics": lr_metrics,
            "version": "live_ml_v3_logreg",
        },
    ]
    best = min(
        candidates,
        key=lambda c: (
            c["metrics"]["log_loss"],
            c["metrics"]["brier"],
            -c["metrics"]["auc"],
        ),
    )

    top_features = []
    if best["name"].startswith("xgboost"):
        importances = best["model"].feature_importances_
        top_idx = np.argsort(importances)[::-1][:15]
        top_features = [
            {"feature": FEATURE_COLS[i], "importance": round(float(importances[i]), 5)}
            for i in top_idx
        ]
    else:
        coef = best["model"].named_steps["clf"].coef_[0]
        top_idx = np.argsort(np.abs(coef))[::-1][:15]
        top_features = [
            {"feature": FEATURE_COLS[i], "importance": round(float(abs(coef[i])), 5)}
            for i in top_idx
        ]

    artifact = {
        "model": best["model"],
        "feature_cols": FEATURE_COLS,
        "model_kind": best["name"],
        "accuracy": best["metrics"]["accuracy"],
        "auc": best["metrics"]["auc"],
        "log_loss": best["metrics"]["log_loss"],
        "brier": best["metrics"]["brier"],
        "train_rows": int(len(train_df)),
        "test_rows": int(len(test_df)),
        "train_matches": int(train_matches),
        "test_matches": int(test_matches),
        "top_features": top_features,
        "version": best["version"],
    }
    joblib.dump(artifact, ARTIFACT_PATH)

    print(f"Selected model: {best['name']}")
    print(f"Saved live artifact -> {ARTIFACT_PATH}")
    print("Top live features:")
    for item in top_features:
        print(f"  - {item['feature']}: {item['importance']}")


if __name__ == "__main__":
    data_dir_arg = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DATA_DIR
    train(data_dir_arg)
