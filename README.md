# 🏏 IPL 2026 Win Predictor

AI-powered cricket match prediction platform with live win probability, historical data analysis, and an XGBoost ML engine.

---

## 🚀 Quick Start (React UI)

The React dashboard works immediately with demo data — no backend required.

```powershell
# Step 1 — Install dependencies
cd "apps\web"
npm install

# Step 2 — Start the dev server
npm run dev

# Open: http://localhost:5173
```

---

## 🗄️ Full Stack Setup

### 1. Start PostgreSQL (Docker)
```powershell
cd infra
docker-compose up -d db redis
```

### 2. Run Database Schema
```powershell
# In psql or any DB tool, connect and run:
# apps/api/src/db/migrations/001_initial_schema.sql
```

### 3. Start the API Server
```powershell
cd apps\api
npm install
cp ../../.env.example ../../.env   # then fill in your values
npm run dev
# API: http://localhost:3001
# Health: http://localhost:3001/api/health
```

### 4. Import Historical Data (IPL 2008–2025)
```powershell
# A. Download Cricsheet IPL data
# Go to: https://cricsheet.org/downloads/
# Download: ipl_json.zip
# Extract to: data\cricsheet\

# B. Run the importer
npx ts-node scripts\import_cricsheet.ts .\data\cricsheet\
# Imports ~1000 matches with ball-by-ball data
```

### 5. Train the ML Model
```powershell
cd services\ml
pip install -r requirements.txt
python -m src.training.train_pre_match
# Saves model to: services/ml/artifacts/pre_match_v1.pkl
```

### 6. Start the ML Service
```powershell
cd services\ml
uvicorn main:app --port 8000
# ML API: http://localhost:8000
```

---

## 📁 Project Structure

```
ipl betting/
├── apps/
│   ├── web/              ← React + Vite dashboard (http://localhost:5173)
│   └── api/              ← Node + Express API     (http://localhost:3001)
├── services/
│   └── ml/               ← Python FastAPI ML      (http://localhost:8000)
├── scripts/
│   └── import_cricsheet.ts  ← Historical data importer
├── infra/
│   └── docker-compose.yml   ← PostgreSQL + Redis
└── .env.example             ← Copy to .env and fill in API keys
```

---

## 🔑 Live Cricket API Key (for IPL 2026)

To get live ball-by-ball updates during matches (starting March 28, 2026):

1. Sign up at **[Roanuz Cricket API](https://sports.roanuz.com)** (free tier available)
2. Add your key to `.env`:  `ROANUZ_API_KEY=your_key_here`
3. The API poller in `apps/api/src/jobs/index.ts` will auto-activate

---

## 🤖 How Predictions Work

| Phase | Model | Inputs |
|---|---|---|
| Pre-match | XGBoost | ELO, team form, venue, head-to-head, toss |
| Live | Heuristic → ML | Score, wickets, CRR, RRR, balls remaining |

- **Pre-match**: Updates when IPL 2026 fixtures are announced
- **Live**: Refreshes every 3 seconds in the UI, every 10s from the poller

---

## 🛠️ Data Sources

| Source | Purpose | URL |
|---|---|---|
| Cricsheet | Historical IPL 2008–2025 | cricsheet.org/downloads |
| IPL Official | 2026 Fixtures & Results | iplt20.com |
| Roanuz / CricketAPI | Live ball-by-ball | sports.roanuz.com |

---

## Complete Guide

For full beginner-to-advanced documentation, read:

- [COMPLETE_GUIDE.md](./COMPLETE_GUIDE.md)
