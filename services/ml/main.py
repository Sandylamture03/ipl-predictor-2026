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
from src.inference.predict_pre_match import predict_pre_match
from src.inference.predict_live import predict_live

load_dotenv()
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
