"""
Fast pre-match XGBoost trainer — single SQL query, all features in pandas.
Run: python -m src.training.train_pre_match
"""
import os, sys, joblib
import pandas as pd
import numpy as np
import psycopg2
from psycopg2.extras import RealDictCursor
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, roc_auc_score

DB_URL = os.environ.get("DATABASE_URL", "")
if not DB_URL:
    print("❌ Set DATABASE_URL env var"); sys.exit(1)

ARTIFACTS_DIR = os.path.join(os.path.dirname(__file__), "../../artifacts")
os.makedirs(ARTIFACTS_DIR, exist_ok=True)


def load_all_matches():
    """Single query to get everything needed for feature engineering."""
    conn = psycopg2.connect(DB_URL, sslmode="require", cursor_factory=RealDictCursor)
    cur = conn.cursor()
    cur.execute("""
        SELECT
            m.id, m.match_date, m.season, m.venue_id,
            m.team1_id, m.team2_id,
            m.toss_winner_team_id, m.toss_decision,
            m.winner_team_id,
            t1.name AS team1_name,
            t2.name AS team2_name,
            CASE WHEN m.winner_team_id = m.team1_id THEN 1 ELSE 0 END AS team1_win,
            COALESCE(i1.total_runs, 0) AS inn1_runs,
            COALESCE(i2.total_runs, 0) AS inn2_runs,
            COALESCE(i1.wickets_lost, 0) AS inn1_wkts,
            COALESCE(i2.wickets_lost, 0) AS inn2_wkts,
            COALESCE(i1.overs_bowled, 20) AS inn1_overs,
            COALESCE(i2.overs_bowled, 20) AS inn2_overs
        FROM matches m
        JOIN teams t1 ON t1.id = m.team1_id
        JOIN teams t2 ON t2.id = m.team2_id
        LEFT JOIN innings i1 ON i1.match_id = m.id AND i1.innings_number = 1
        LEFT JOIN innings i2 ON i2.match_id = m.id AND i2.innings_number = 2
        WHERE m.status = 'completed'
          AND m.winner_team_id IS NOT NULL
        ORDER BY m.match_date
    """)
    rows = cur.fetchall()
    conn.close()
    return pd.DataFrame([dict(r) for r in rows])


def build_features(df):
    """Compute rolling features entirely in pandas — no extra DB calls."""
    df = df.copy()
    df["match_date"] = pd.to_datetime(df["match_date"])
    df = df.sort_values("match_date").reset_index(drop=True)

    # Rolling team win rates (last 10 matches, computed before each match)
    team_wins = {}  # team_id → list of (date, won)

    elo = {}  # team_id → elo score (start 1500)
    K = 32

    rows = []
    for _, row in df.iterrows():
        t1, t2 = int(row["team1_id"]), int(row["team2_id"])
        win = int(row["team1_win"])

        # ELO
        e1 = elo.get(t1, 1500)
        e2 = elo.get(t2, 1500)
        exp1 = 1 / (1 + 10 ** ((e2 - e1) / 400))
        elo_diff_pre = e1 - e2

        # Rolling last-5 win pct
        def last_n(tid, n=5):
            hist = team_wins.get(tid, [])
            if not hist: return 0.5
            recent = hist[-n:]
            return sum(recent) / len(recent)

        t1_last5 = last_n(t1)
        t2_last5 = last_n(t2)

        # Toss feature: did team1 win the toss?
        toss_win_t1 = 1 if row["toss_winner_team_id"] == t1 else 0
        toss_bat    = 1 if row["toss_decision"] == "bat" else 0

        # Venue avg score (from innings data)
        inn1_runs = float(row.get("inn1_runs", 150))
        inn2_runs = float(row.get("inn2_runs", 140))

        feat = {
            "elo_diff":          elo_diff_pre,
            "team1_last5":       t1_last5,
            "team2_last5":       t2_last5,
            "team1_win_rate":    last_n(t1, 20),
            "team2_win_rate":    last_n(t2, 20),
            "toss_win_team1":    toss_win_t1,
            "toss_bat":          toss_bat,
            "toss_win_bat":      toss_win_t1 * toss_bat,
            "inn1_runs":         inn1_runs,
            "inn2_runs":         inn2_runs,
            "team1_win":         win,
        }
        rows.append(feat)

        # Update ELO after match
        elo[t1] = e1 + K * (win - exp1)
        elo[t2] = e2 + K * ((1 - win) - (1 - exp1))

        # Update win history
        if t1 not in team_wins: team_wins[t1] = []
        if t2 not in team_wins: team_wins[t2] = []
        team_wins[t1].append(win)
        team_wins[t2].append(1 - win)

    return pd.DataFrame(rows)


FEATURE_COLS = [
    "elo_diff", "team1_last5", "team2_last5",
    "team1_win_rate", "team2_win_rate",
    "toss_win_team1", "toss_bat", "toss_win_bat",
    "inn1_runs", "inn2_runs"
]


def train():
    print("📊 Loading training data (single query)...")
    df_raw = load_all_matches()
    print(f"   → {len(df_raw)} completed matches loaded")

    print("⚙️  Building features in pandas...")
    df = build_features(df_raw)

    X = df[FEATURE_COLS].fillna(0.5)
    y = df["team1_win"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42)

    print(f"🏋️  Training XGBoost on {len(X_train)} matches...")
    model = XGBClassifier(
        n_estimators=200, max_depth=4, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8,
        eval_metric="logloss", random_state=42
    )
    model.fit(X_train, y_train,
              eval_set=[(X_test, y_test)], verbose=50)

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]
    acc = accuracy_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_prob)
    print(f"\n📈 Accuracy={acc:.3f} | AUC={auc:.3f}  (on {len(X_test)} test matches)")

    model_path = os.path.join(ARTIFACTS_DIR, "pre_match_v1.pkl")
    joblib.dump({
        "model": model,
        "feature_cols": FEATURE_COLS,
        "accuracy": acc,
        "auc": auc,
        "version": "v1.0"
    }, model_path)
    print(f"✅ Model saved → {model_path}")
    print("\n🏏 Training complete! Ready for IPL 2026 predictions.")


if __name__ == "__main__":
    train()
