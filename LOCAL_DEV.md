# IPL 2026 Win Predictor — Local Development Guide

## Prerequisites

| Tool | Version | Download |
|---|---|---|
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| Python | 3.10+ | [python.org](https://python.org) |
| Git | Any | [git-scm.com](https://git-scm.com) |

---

## Project Structure

```
ipl betting/
├── apps/
│   ├── web/          ← React + Vite frontend (port 5173)
│   └── api/          ← Node.js + Express API (port 3001)
├── services/
│   └── ml/           ← Python + FastAPI ML service (port 8000)
├── scripts/
│   └── import_cricsheet.js  ← Data importer
├── data/
│   └── cricsheet/    ← 1,169 IPL match JSON files
└── .env              ← Environment variables (secrets)
```

---

## First-Time Setup

### 1. Install Node dependencies

```cmd
cd "apps\web"
npm install

cd "..\api"
npm install
```

### 2. Set up Python virtual environment

```cmd
cd "services\ml"
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Verify `.env` file exists in project root

```
DATABASE_URL=postgresql://neondb_owner:npg_afQL2rNt1KRM@ep-soft-waterfall-ad1czxgu-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require
CRICKET_API_KEY=07e9a745-4e39-479e-9802-0bd6035d38c2
CRICKET_API_URL=https://api.cricapi.com/v1
PORT=3001
ML_SERVICE_URL=http://localhost:8000
VITE_API_URL=http://localhost:3001
```

---

## Running the App (3 Terminals)

Open **3 separate command prompt windows**.

### Terminal 1 — React Frontend

```cmd
cd "c:\Users\sandy\OneDrive\Desktop\Antigravety\ipl betting\apps\web"
npm run dev
```

✅ App opens at → **http://localhost:5173**

---

### Terminal 2 — Node.js API

```cmd
cd "c:\Users\sandy\OneDrive\Desktop\Antigravety\ipl betting\apps\api"
set DATABASE_URL=postgresql://neondb_owner:npg_afQL2rNt1KRM@ep-soft-waterfall-ad1czxgu-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require
set CRICKET_API_KEY=07e9a745-4e39-479e-9802-0bd6035d38c2
npm run dev
```

✅ API running at → **http://localhost:3001**

Test it: open http://localhost:3001/api/live/test in browser

---

### Terminal 3 — Python ML Service

```cmd
cd "c:\Users\sandy\OneDrive\Desktop\Antigravety\ipl betting\services\ml"
.venv\Scripts\activate
set DATABASE_URL=postgresql://neondb_owner:npg_afQL2rNt1KRM@ep-soft-waterfall-ad1czxgu-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

✅ ML Service at → **http://localhost:8000**

Test it: open http://localhost:8000/docs in browser (Swagger UI)

---

## What Each Service Does

| URL | Service | Role |
|---|---|---|
| http://localhost:5173 | React UI | Dashboard, match cards, probability bars |
| http://localhost:3001/api/matches | Node API | Match data from Neon DB |
| http://localhost:3001/api/live | Node API | Live IPL scores from cricketdata.org |
| http://localhost:3001/api/predictions | Node API | Stored ML predictions |
| http://localhost:8000/predict/pre-match | ML Service | XGBoost pre-match prediction |
| http://localhost:8000/predict/live | ML Service | Live in-match probability |

---

## Useful Commands

### Retrain the ML model (after new match data)

```cmd
cd "c:\Users\sandy\OneDrive\Desktop\Antigravety\ipl betting\services\ml"
.venv\Scripts\activate
set DATABASE_URL=postgresql://neondb_owner:...
python -m src.training.train_pre_match
```

### Re-import Cricsheet data

```cmd
cd "c:\Users\sandy\OneDrive\Desktop\Antigravety\ipl betting"
set DATABASE_URL=postgresql://neondb_owner:...
node scripts\import_cricsheet.js .\data\cricsheet
```

### Push code changes to GitHub

```cmd
cd "c:\Users\sandy\OneDrive\Desktop\Antigravety\ipl betting"
git add .
git commit -m "describe your change"
git push
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot find module 'pg'` | Run `npm install` from `apps/api/` |
| `ModuleNotFoundError` in Python | Run `.venv\Scripts\activate` first |
| API returns 500 | Check `DATABASE_URL` env var is set |
| Predictions not loading | Make sure Terminal 3 (ML service) is running |
| Live scores not showing | IPL starts March 28, 2026 — mock data shows until then |

---

## March 28 — IPL Goes Live

On match day, all 3 terminals must be running. The app will:
1. Automatically detect live IPL matches via cricketdata.org
2. Display real scores + animated win probability bars
3. Update predictions every 30 seconds

No extra setup needed — just keep all 3 terminals running! 🏏
