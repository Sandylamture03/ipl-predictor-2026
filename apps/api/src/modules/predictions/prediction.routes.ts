import { Router } from 'express';
import { query, queryOne } from '../../db/connection';
import axios from 'axios';

export const predictionRoutes = Router();

const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';

// GET /api/predictions/match/:matchId
predictionRoutes.get('/match/:matchId', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT * FROM predictions WHERE match_id = $1 ORDER BY created_at ASC`,
      [req.params.matchId]
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// POST /api/predictions/pre-match/:matchId — trigger pre-match prediction
predictionRoutes.post('/pre-match/:matchId', async (req, res, next) => {
  try {
    const matchId = req.params.matchId;

    // Call the Python ML service
    const mlRes = await axios.post(`${ML_URL}/predict/pre-match`, { match_id: Number(matchId) });
    const { team1_win_prob, team2_win_prob, features, explanation } = mlRes.data;

    // Store result
    const stored = await queryOne(
      `INSERT INTO predictions (match_id, phase, model_version, team1_win_prob, team2_win_prob, features, explanation)
       VALUES ($1, 'pre_match', $2, $3, $4, $5, $6)
       RETURNING *`,
      [matchId, mlRes.data.model_version || 'v1.0', team1_win_prob, team2_win_prob,
       JSON.stringify(features), JSON.stringify(explanation)]
    );

    res.json({ data: stored });
  } catch (err) { next(err); }
});

// POST /api/predictions/live/:matchId — trigger live prediction
predictionRoutes.post('/live/:matchId', async (req, res, next) => {
  try {
    const matchId = req.params.matchId;
    const mlRes = await axios.post(`${ML_URL}/predict/live`, { match_id: Number(matchId) });
    const { team1_win_prob, team2_win_prob, features, explanation } = mlRes.data;

    const stored = await queryOne(
      `INSERT INTO predictions (match_id, phase, model_version, team1_win_prob, team2_win_prob, features, explanation)
       VALUES ($1, 'live', $2, $3, $4, $5, $6)
       RETURNING *`,
      [matchId, mlRes.data.model_version || 'v1.0', team1_win_prob, team2_win_prob,
       JSON.stringify(features), JSON.stringify(explanation)]
    );

    res.json({ data: stored });
  } catch (err) { next(err); }
});
