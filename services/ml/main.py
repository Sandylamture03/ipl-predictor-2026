"""
IPL Win Predictor — FastAPI ML Service
Endpoints:
  POST /predict/pre-match  → win probability before toss
  POST /predict/live       → live ball-by-ball win probability
  GET  /health
"""

import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

# Load repo-root .env first, then allow cwd-specific overrides.
ROOT_ENV = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv(ROOT_ENV)
load_dotenv()

from src.inference.predict_pre_match import predict_pre_match
from src.inference.predict_live import predict_live

ARTIFACT_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "pre_match_v1.pkl")


def ensure_pre_match_artifact():
    auto_train = os.environ.get("AUTO_TRAIN_PREMATCH", "1").strip() != "0"
    if os.path.exists(ARTIFACT_PATH):
        return
    if not auto_train:
        print("Pre-match artifact missing and AUTO_TRAIN_PREMATCH=0. Starting without auto-train.")
        return

    print("Pre-match artifact not found. Training model before serving...")
    from src.training.train_pre_match import train

    train()


ensure_pre_match_artifact()

app = FastAPI(title="IPL Win Predictor ML", version="1.0.0")


class MatchRequest(BaseModel):
    match_id: int


@app.get("/health")
def health():
    return {"status": "ok", "service": "ipl-ml"}


@app.post("/predict/pre-match")
def pre_match_prediction(req: MatchRequest):
    try:
        return predict_pre_match(req.match_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/live")
def live_prediction(req: MatchRequest):
    try:
        return predict_live(req.match_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
