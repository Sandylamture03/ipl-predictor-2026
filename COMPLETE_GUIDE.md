# IPL 2026 Win Predictor - Complete Guide (Very Simple + Full Technical)

This file explains the full project from zero.
You can read this and explain the app to anyone.

---

## 1. One-Line Summary

This is a full-stack web app that predicts IPL match winners:
- before match starts (pre-match prediction)
- during live match (live win probability)

---

## 2. Explain Like a 5th Standard Kid

Imagine cricket is a game between Team A and Team B.

Our app is like a smart score friend:
1. Before the game, it checks old match history and player form.
2. During the game, it keeps checking current score, wickets, run rate, and momentum.
3. Then it says: "Team A has 62% chance to win now."

So this app does not just show score. It gives a smart prediction.

---

## 3. What Is Inside This Project?

This project has 3 main parts:

1. Frontend (`apps/web`)
- What user sees in browser
- Built with React + Vite + TypeScript

2. Backend API (`apps/api`)
- Talks to database
- Sends data to frontend
- Calls ML service for prediction
- Built with Node.js + Express + TypeScript

3. ML Service (`services/ml`)
- Python service that runs ML models
- Gives pre-match and live probabilities
- Built with FastAPI + scikit-learn + XGBoost

Database:
- PostgreSQL (Neon or local Postgres)

---

## 4. High-Level Architecture

```text
Browser (React UI)
    |
    v
API Server (Node/Express)
    |                \
    |                 \ calls
    v                  v
PostgreSQL DB      ML Service (FastAPI)
```

Flow:
1. User opens dashboard.
2. Frontend asks API for matches/predictions.
3. API reads DB and/or asks ML service.
4. ML service returns win probability.
5. API stores prediction history.
6. Frontend shows result.

---

## 5. Folder Structure (Simple)

```text
ipl betting/
├─ apps/
│  ├─ web/                  # React frontend
│  └─ api/                  # Node API backend
├─ services/
│  └─ ml/                   # Python ML service
├─ scripts/                 # data import, form snapshots, deploy helpers
├─ data/cricsheet/          # historical IPL JSON files
├─ infra/                   # docker/postgres infra files
├─ render.yaml              # Render deployment blueprint
├─ vercel.json              # Vercel static build settings
└─ COMPLETE_GUIDE.md        # this guide
```

---

## 6. Core Features

## 6.1 Match Dashboard
- Upcoming/live/completed match list
- Team names, venue, schedule, status

## 6.2 Pre-Match Prediction
- Triggered before a match starts
- Uses:
  - team form
  - player form snapshots
  - venue pattern
  - toss information (if available)
  - historical features

## 6.3 Live Prediction
- Triggered while match is running
- Uses:
  - score, wickets, overs, target
  - current run rate (CRR), required run rate (RRR)
  - momentum windows (recent balls)
  - striker/non-striker/bowler live context (when ball-level data is available)

## 6.4 Prediction History
- Every prediction call is stored in `predictions` table
- You can show timeline: "probability changed from 45% to 70%"

## 6.5 Fixture Sync
- Script + API job to sync IPL 2026 fixtures from cricket API source

---

## 7. Data and ML Pipeline

## 7.1 Historical Data Source
- Cricsheet IPL JSON files (`data/cricsheet`)

## 7.2 Data Scripts

1. `scripts/import_cricsheet.js`
- Fast import mode (match + innings summary)
- Good for fast setup
- Does not insert full ball-by-ball deliveries

2. `scripts/import_cricsheet.ts`
- Full importer (includes deliveries)
- Heavier import, but needed for rich live ball features from DB

3. `scripts/build_form_snapshots.js`
- Builds `team_form_snapshots` and `player_form_snapshots`
- Used by pre-match model

## 7.3 ML Training

1. Pre-match model:
```powershell
npm run ml:train
```

2. Live model:
```powershell
npm run ml:train:live
```

Live model artifact:
- `services/ml/artifacts/live_match_v1.pkl`

Pre-match model artifact:
- `services/ml/artifacts/pre_match_v1.pkl`

---

## 8. Database (Important Tables)

Main tables:
- `matches` - match metadata
- `teams`, `players`, `venues`
- `innings`, `deliveries`
- `live_match_state`
- `team_form_snapshots`, `player_form_snapshots`
- `predictions`

Why this matters:
- DB is the memory of your app.
- ML predictions depend on clean and updated DB state.

---

## 9. Run Locally from Scratch

## 9.1 Prerequisites
- Node.js 18+
- Python 3.10+
- Git
- PostgreSQL (local or cloud)

## 9.2 Clone and open project
```powershell
git clone <your-repo-url>
cd "ipl betting"
```

## 9.3 Environment file
Create `.env` in repo root (use `.env.example` as base).
Do not commit secrets.

Typical variables:
- `DATABASE_URL`
- `CRICKET_API_KEY`
- `CRICKET_API_URL`
- `ML_SERVICE_URL`
- `VITE_API_URL`

## 9.4 Install frontend + API packages
```powershell
npm run install:all
```

## 9.5 Setup Python ML virtual environment
```powershell
cd services/ml
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
cd ../..
```

## 9.6 Run services (3 terminals)

Terminal 1 - Frontend:
```powershell
npm run dev:web
```

Terminal 2 - API:
```powershell
npm run dev:api
```

Terminal 3 - ML:
```powershell
cd services/ml
.\.venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 10. Useful API Endpoints

Health:
- `GET /api/health` (API)
- `GET /health` (ML)

Matches:
- `GET /api/matches`
- `GET /api/matches/:id`

Predictions:
- `POST /api/predictions/pre-match/:matchId`
- `POST /api/predictions/live/:matchId`
- `GET /api/matches/:id/predictions`

Live:
- `GET /api/live`
- `GET /api/live/test`

Admin:
- `POST /api/admin/migrate`
- `POST /api/admin/sync/fixtures`

---

## 11. Deployment (What Is Already Set Up)

Current deployed stack:
- Frontend domain: `https://ai-developer.in`
- API domain: `https://api.ai-developer.in`
- ML service on Render

Main deployment helpers:
- `render.yaml`
- `scripts/render_full_deploy.js`

Vercel:
- Static build config files are available:
  - root `vercel.json`
  - `apps/web/vercel.json`

---

## 12. Live Match Day Plan (March 28, 2026)

For best live prediction quality:
1. Ensure live ingestion is running.
2. Keep `live_match_state` updated continuously.
3. Insert ball-level `deliveries` in near real-time.
4. Call live prediction endpoint repeatedly (per over/ball).

Saved runbook file:
- `LIVE_INGESTION_2026-03-28.md`

---

## 13. How This Project Was Developed (Simple Story)

Phase 1:
- Created full-stack skeleton (React + API + ML service)

Phase 2:
- Added DB schema and match data model

Phase 3:
- Imported historical IPL data
- Built team/player form snapshot pipeline

Phase 4:
- Built pre-match ML model and API integration

Phase 5:
- Added live prediction flow
- Upgraded to trained live model + momentum and player/bowler features

Phase 6:
- Deployed to Render + domain mapping
- Fixed Vercel build config for static deployment compatibility

---

## 14. Limitations (Be Honest When Explaining)

1. No model can guarantee 100% winner prediction.
2. Live accuracy depends on quality and freshness of incoming live data.
3. If ball-level delivery data is missing, live model falls back to smaller feature set.
4. API provider limits/rate limits can affect refresh frequency.

---

## 15. How to Explain This Project in Interviews or Discussions

Short version:
"It is a full-stack IPL prediction platform with a React UI, Node API, Postgres DB, and Python ML microservice for pre-match and live win probability."

Medium version:
"We ingest historical IPL data, compute team/player form snapshots, train pre-match and live models, store prediction history, and expose real-time endpoints for UI updates during live matches."

Technical version:
"The backend persists fixtures, match states, form snapshots, and prediction artifacts. API orchestrates DB reads and ML calls. Live inference supports momentum plus striker/non-striker/bowler context when ball-level rows are present."

---

## 16. Troubleshooting Quick List

Problem: Frontend opens but no data
- Check API URL (`VITE_API_URL`)
- Check API health endpoint

Problem: API 500 errors
- Check `DATABASE_URL`
- Ensure migrations are applied

Problem: Live prediction weak/flat
- Check if `deliveries` are being updated live
- Check `live_match_state` freshness

Problem: ML service error
- Check model artifacts in `services/ml/artifacts`
- Check Python dependencies and logs

---

## 17. Final Notes

- Keep this file in GitHub so anyone can understand project quickly.
- Update this guide whenever architecture changes.
- Never commit secrets/API keys.

If you want, I can also create:
1. `DOCS_TECHNICAL_DEEP_DIVE.md` (for engineers)
2. `DOCS_NON_TECHNICAL_PITCH.md` (for business/demo)
3. `SYSTEM_DESIGN_DIAGRAM.md` (ASCII + flow charts)

