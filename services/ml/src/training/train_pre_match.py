"""Pre-match trainer using team-form + player-form snapshot features."""

import os
import sys
import joblib
import pandas as pd
import numpy as np
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from xgboost import XGBClassifier
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score, log_loss
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT_ENV = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", ".env"))
load_dotenv(ROOT_ENV)
load_dotenv()

DB_URL = os.environ.get("DATABASE_URL", "")
if not DB_URL:
    print("ERROR: Set DATABASE_URL env var")
    sys.exit(1)

ARTIFACTS_DIR = os.path.join(os.path.dirname(__file__), "../../artifacts")
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

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

CATEGORICAL_COLS = [
    "team1_id",
    "team2_id",
    "season",
]

MODEL_INPUT_COLS = FEATURE_COLS + CATEGORICAL_COLS


def load_training_rows() -> pd.DataFrame:
    conn = psycopg2.connect(DB_URL, sslmode="require", cursor_factory=RealDictCursor)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
          m.id,
          m.match_date,
          m.season,
          m.team1_id,
          m.team2_id,
          m.toss_winner_team_id,
          m.toss_decision,
          CASE WHEN m.winner_team_id = m.team1_id THEN 1 ELSE 0 END AS team1_win,

          COALESCE(tf1.last5_win_pct, 50) AS t1_last5_win_pct,
          COALESCE(tf2.last5_win_pct, 50) AS t2_last5_win_pct,
          COALESCE(tf1.avg_runs_last5, 165) AS t1_avg_runs,
          COALESCE(tf2.avg_runs_last5, 165) AS t2_avg_runs,
          COALESCE(tf1.avg_wkts_last5, 6) AS t1_avg_wkts,
          COALESCE(tf2.avg_wkts_last5, 6) AS t2_avg_wkts,
          COALESCE(tf1.avg_powerplay_runs_last5, 48) AS t1_powerplay,
          COALESCE(tf2.avg_powerplay_runs_last5, 48) AS t2_powerplay,
          COALESCE(tf1.avg_death_runs_last5, 55) AS t1_death,
          COALESCE(tf2.avg_death_runs_last5, 55) AS t2_death,
          COALESCE(tf1.chase_win_pct, 50) AS t1_chase_pct,
          COALESCE(tf2.chase_win_pct, 50) AS t2_chase_pct,
          COALESCE(tf1.venue_win_pct, 50) AS t1_venue_win_pct,
          COALESCE(tf2.venue_win_pct, 50) AS t2_venue_win_pct,
          COALESCE(tf1.elo_rating, 1500) AS t1_elo,
          COALESCE(tf2.elo_rating, 1500) AS t2_elo,

          COALESCE(v.avg_first_innings_score, 165) AS venue_avg_score,
          COALESCE(v.chase_win_pct, 50) AS venue_chase_pct,

          COALESCE(p1.batting_avg_last5, 22) AS t1_player_bat_avg,
          COALESCE(p2.batting_avg_last5, 22) AS t2_player_bat_avg,
          COALESCE(p1.strike_rate_last5, 120) AS t1_player_sr,
          COALESCE(p2.strike_rate_last5, 120) AS t2_player_sr,
          COALESCE(p1.boundary_pct_last5, 18) AS t1_player_boundary,
          COALESCE(p2.boundary_pct_last5, 18) AS t2_player_boundary,
          COALESCE(p1.bowling_econ_last5, 8.2) AS t1_player_econ,
          COALESCE(p2.bowling_econ_last5, 8.2) AS t2_player_econ,
          COALESCE(p1.bowling_sr_last5, 24) AS t1_player_bowl_sr,
          COALESCE(p2.bowling_sr_last5, 24) AS t2_player_bowl_sr,
          COALESCE(p1.wickets_last5, 1) AS t1_player_wkts,
          COALESCE(p2.wickets_last5, 1) AS t2_player_wkts

        FROM matches m
        LEFT JOIN venues v ON v.id = m.venue_id
        LEFT JOIN team_form_snapshots tf1 ON tf1.match_id = m.id AND tf1.team_id = m.team1_id
        LEFT JOIN team_form_snapshots tf2 ON tf2.match_id = m.id AND tf2.team_id = m.team2_id

        LEFT JOIN LATERAL (
          SELECT
            AVG(batting_avg_last5) AS batting_avg_last5,
            AVG(strike_rate_last5) AS strike_rate_last5,
            AVG(boundary_pct_last5) AS boundary_pct_last5,
            AVG(bowling_econ_last5) AS bowling_econ_last5,
            AVG(bowling_sr_last5) AS bowling_sr_last5,
            AVG(wickets_last5) AS wickets_last5
          FROM player_form_snapshots pfs
          WHERE pfs.match_id = m.id AND pfs.team_id = m.team1_id
        ) p1 ON TRUE

        LEFT JOIN LATERAL (
          SELECT
            AVG(batting_avg_last5) AS batting_avg_last5,
            AVG(strike_rate_last5) AS strike_rate_last5,
            AVG(boundary_pct_last5) AS boundary_pct_last5,
            AVG(bowling_econ_last5) AS bowling_econ_last5,
            AVG(bowling_sr_last5) AS bowling_sr_last5,
            AVG(wickets_last5) AS wickets_last5
          FROM player_form_snapshots pfs
          WHERE pfs.match_id = m.id AND pfs.team_id = m.team2_id
        ) p2 ON TRUE

        WHERE m.status = 'completed'
          AND m.winner_team_id IS NOT NULL
        ORDER BY m.match_date ASC, m.id ASC
        """
    )
    rows = cur.fetchall()
    conn.close()
    return pd.DataFrame([dict(r) for r in rows])


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    d = df.copy()
    d["match_date"] = pd.to_datetime(d["match_date"]) 

    # Pre-match H2H without leakage.
    h2h_state = {}
    h2h_values = []
    for _, row in d.iterrows():
        t1 = int(row["team1_id"])
        t2 = int(row["team2_id"])
        key = tuple(sorted((t1, t2)))
        state = h2h_state.get(key, {"wins": {}, "total": 0})
        t1_wins_before = state["wins"].get(t1, 0)
        total_before = state["total"]
        h2h_values.append(50.0 if total_before == 0 else round(t1_wins_before * 100.0 / total_before, 2))

        winner = t1 if int(row["team1_win"]) == 1 else t2
        state["wins"][winner] = state["wins"].get(winner, 0) + 1
        state["total"] += 1
        h2h_state[key] = state

    d["h2h_t1_win_pct"] = h2h_values

    d["elo_diff"] = d["t1_elo"] - d["t2_elo"]
    d["last5_win_pct_diff"] = d["t1_last5_win_pct"] - d["t2_last5_win_pct"]
    d["avg_runs_diff"] = d["t1_avg_runs"] - d["t2_avg_runs"]
    d["avg_wkts_diff"] = d["t1_avg_wkts"] - d["t2_avg_wkts"]
    d["avg_powerplay_diff"] = d["t1_powerplay"] - d["t2_powerplay"]
    d["avg_death_diff"] = d["t1_death"] - d["t2_death"]
    d["chase_win_pct_diff"] = d["t1_chase_pct"] - d["t2_chase_pct"]
    d["venue_win_pct_diff"] = d["t1_venue_win_pct"] - d["t2_venue_win_pct"]

    d["player_bat_avg_diff"] = d["t1_player_bat_avg"] - d["t2_player_bat_avg"]
    d["player_strike_rate_diff"] = d["t1_player_sr"] - d["t2_player_sr"]
    d["player_boundary_pct_diff"] = d["t1_player_boundary"] - d["t2_player_boundary"]
    d["player_bowling_econ_diff"] = d["t1_player_econ"] - d["t2_player_econ"]
    d["player_bowling_sr_diff"] = d["t1_player_bowl_sr"] - d["t2_player_bowl_sr"]
    d["player_wickets_diff"] = d["t1_player_wkts"] - d["t2_player_wkts"]

    d["toss_win_team1"] = (d["toss_winner_team_id"] == d["team1_id"]).astype(int)
    d["toss_bat"] = (d["toss_decision"].fillna("").str.lower() == "bat").astype(int)
    d["toss_win_bat"] = d["toss_win_team1"] * d["toss_bat"]

    d["season_progress"] = d["match_date"].dt.dayofyear / 366.0 * 100.0

    # Guard against NaN from sparse/older rows.
    d[FEATURE_COLS] = d[FEATURE_COLS].apply(pd.to_numeric, errors="coerce")
    d[FEATURE_COLS] = (
        d[FEATURE_COLS]
        .replace([np.inf, -np.inf], np.nan)
        .fillna(0.0)
        .astype(float)
    )
    return d


def chronological_split(d: pd.DataFrame):
    split_idx = int(len(d) * 0.8)
    split_idx = max(1, min(split_idx, len(d) - 1))

    train = d.iloc[:split_idx].copy()
    test = d.iloc[split_idx:].copy()
    return train, test


def train():
    print("Loading rows with team/player form snapshots...")
    df_raw = load_training_rows()
    if df_raw.empty:
        print("ERROR: No completed matches found for training.")
        sys.exit(1)

    print(f"   -> loaded {len(df_raw)} completed matches")

    print("Building features...")
    df = build_features(df_raw)

    train_df, test_df = chronological_split(df)
    X_train_num = train_df[FEATURE_COLS].copy()
    y_train = train_df["team1_win"].astype(int)
    X_test_num = test_df[FEATURE_COLS].copy()
    y_test = test_df["team1_win"].astype(int)

    print(f"Training on {len(X_train_num)} matches, validating on {len(X_test_num)} recent matches...")

    xgb_model = XGBClassifier(
        n_estimators=450,
        max_depth=5,
        learning_rate=0.03,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_weight=3,
        reg_alpha=0.1,
        reg_lambda=1.0,
        eval_metric="logloss",
        random_state=42,
    )
    xgb_model.fit(X_train_num, y_train)
    xgb_prob = xgb_model.predict_proba(X_test_num)[:, 1]
    xgb_pred = (xgb_prob >= 0.5).astype(int)
    xgb_acc = accuracy_score(y_test, xgb_pred)
    xgb_auc = roc_auc_score(y_test, xgb_prob)
    xgb_ll = log_loss(y_test, xgb_prob)

    X_train_all = train_df[MODEL_INPUT_COLS].copy()
    X_test_all = test_df[MODEL_INPUT_COLS].copy()
    for frame in (X_train_all, X_test_all):
        frame["team1_id"] = pd.to_numeric(frame["team1_id"], errors="coerce").fillna(0).astype(int)
        frame["team2_id"] = pd.to_numeric(frame["team2_id"], errors="coerce").fillna(0).astype(int)
        frame["season"] = frame["season"].fillna("").astype(str)

    lr_pipeline = Pipeline(
        steps=[
            (
                "pre",
                ColumnTransformer(
                    transformers=[
                        ("num", StandardScaler(with_mean=False), FEATURE_COLS),
                        ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_COLS),
                    ]
                ),
            ),
            ("clf", LogisticRegression(max_iter=5000, C=0.5)),
        ]
    )
    lr_pipeline.fit(X_train_all, y_train)
    lr_prob = lr_pipeline.predict_proba(X_test_all)[:, 1]
    lr_pred = (lr_prob >= 0.5).astype(int)
    lr_acc = accuracy_score(y_test, lr_pred)
    lr_auc = roc_auc_score(y_test, lr_prob)
    lr_ll = log_loss(y_test, lr_prob)

    candidates = [
        {
            "name": "xgboost_form_v2",
            "model": xgb_model,
            "feature_cols": FEATURE_COLS,
            "acc": float(xgb_acc),
            "auc": float(xgb_auc),
            "ll": float(xgb_ll),
            "version": "v2.1-xgb-form",
            "top_features": [
                {
                    "feature": FEATURE_COLS[i],
                    "importance": round(float(xgb_model.feature_importances_[i]), 4),
                }
                for i in np.argsort(xgb_model.feature_importances_)[::-1][:10]
            ],
        },
        {
            "name": "logreg_team_context_v3",
            "model": lr_pipeline,
            "feature_cols": MODEL_INPUT_COLS,
            "acc": float(lr_acc),
            "auc": float(lr_auc),
            "ll": float(lr_ll),
            "version": "v3.0-logreg-team-context",
            "top_features": [],
        },
    ]

    lr_pre = lr_pipeline.named_steps["pre"]
    lr_coef = lr_pipeline.named_steps["clf"].coef_[0]
    lr_names = lr_pre.get_feature_names_out()
    lr_top_idx = np.argsort(np.abs(lr_coef))[::-1][:10]
    candidates[1]["top_features"] = [
        {"feature": str(lr_names[i]), "importance": round(float(abs(lr_coef[i])), 4)}
        for i in lr_top_idx
    ]

    best = max(candidates, key=lambda c: (c["auc"], c["acc"], -c["ll"]))
    model = best["model"]
    acc = best["acc"]
    auc = best["auc"]
    ll = best["ll"]
    top_feats = best["top_features"]

    print(f"XGBoost   -> Accuracy={xgb_acc:.3f} | AUC={xgb_auc:.3f} | LogLoss={xgb_ll:.3f}")
    print(f"LogReg    -> Accuracy={lr_acc:.3f} | AUC={lr_auc:.3f} | LogLoss={lr_ll:.3f}")
    print(f"Selected  -> {best['name']} (AUC={auc:.3f}, Acc={acc:.3f}, LogLoss={ll:.3f})")

    model_path = os.path.join(ARTIFACTS_DIR, "pre_match_v1.pkl")
    artifact = {
        "model": model,
        "feature_cols": best["feature_cols"],
        "numeric_feature_cols": FEATURE_COLS,
        "categorical_feature_cols": CATEGORICAL_COLS,
        "model_kind": best["name"],
        "accuracy": float(acc),
        "auc": float(auc),
        "log_loss": float(ll),
        "train_rows": int(len(train_df)),
        "test_rows": int(len(test_df)),
        "test_start_date": str(test_df["match_date"].iloc[0].date()),
        "top_features": top_feats,
        "version": best["version"],
    }
    joblib.dump(artifact, model_path)

    print(f"Model saved -> {model_path}")
    print("Top features:")
    for item in top_feats:
        print(f"  - {item['feature']}: {item['importance']}")


if __name__ == "__main__":
    train()
