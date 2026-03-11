import { Router } from 'express';
import { query, queryOne } from '../../db/connection';

export const matchRoutes = Router();

// GET /api/matches?season=2026&status=upcoming
matchRoutes.get('/', async (req, res, next) => {
  try {
    const { season, status, limit = '50', offset = '0' } = req.query;
    let sql = `
      SELECT m.*,
        t1.name AS team1_name, t1.short_name AS team1_short, t1.primary_color AS team1_color,
        t2.name AS team2_name, t2.short_name AS team2_short, t2.primary_color AS team2_color,
        tw.short_name AS toss_winner_short,
        w.short_name AS winner_short, w.name AS winner_name,
        v.name AS venue_name, v.city AS venue_city,
        p.team1_win_prob, p.team2_win_prob, p.phase AS pred_phase,
        lm.score, lm.wickets, lm.overs, lm.target,
        lm.current_run_rate, lm.required_run_rate, lm.is_live
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN teams tw ON m.toss_winner_team_id = tw.id
      LEFT JOIN teams w ON m.winner_team_id = w.id
      LEFT JOIN venues v ON m.venue_id = v.id
      LEFT JOIN LATERAL (
        SELECT team1_win_prob, team2_win_prob, phase
        FROM predictions
        WHERE match_id = m.id
        ORDER BY created_at DESC LIMIT 1
      ) p ON true
      LEFT JOIN live_match_state lm ON lm.match_id = m.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let idx = 1;

    if (season) { sql += ` AND m.season = $${idx++}`; params.push(season); }
    if (status) { sql += ` AND m.status = $${idx++}`; params.push(status); }

    sql += ` ORDER BY m.match_date ASC, m.match_number ASC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const rows = await query(sql, params);
    res.json({ data: rows, count: rows.length });
  } catch (err) { next(err); }
});

// GET /api/matches/:id
matchRoutes.get('/:id', async (req, res, next) => {
  try {
    const match = await queryOne(`
      SELECT m.*,
        t1.name AS team1_name, t1.short_name AS team1_short, t1.primary_color AS team1_color, t1.secondary_color AS team1_secondary,
        t2.name AS team2_name, t2.short_name AS team2_short, t2.primary_color AS team2_color, t2.secondary_color AS team2_secondary,
        w.name AS winner_name, w.short_name AS winner_short,
        v.name AS venue_name, v.city AS venue_city,
        lm.score, lm.wickets, lm.overs, lm.target,
        lm.current_run_rate, lm.required_run_rate, lm.is_live,
        lm.last_event
      FROM matches m
      JOIN teams t1 ON m.team1_id = t1.id
      JOIN teams t2 ON m.team2_id = t2.id
      LEFT JOIN teams w ON m.winner_team_id = w.id
      LEFT JOIN venues v ON m.venue_id = v.id
      LEFT JOIN live_match_state lm ON lm.match_id = m.id
      WHERE m.id = $1
    `, [req.params.id]);

    if (!match) return res.status(404).json({ error: 'Match not found' });

    // Get innings
    const innings = await query(
      `SELECT i.*, t.name AS batting_team_name, t.short_name AS batting_team_short
       FROM innings i JOIN teams t ON i.batting_team_id = t.id
       WHERE i.match_id = $1 ORDER BY i.innings_number`, [req.params.id]
    );

    // Get latest prediction
    const prediction = await queryOne(
      `SELECT * FROM predictions WHERE match_id = $1 ORDER BY created_at DESC LIMIT 1`, [req.params.id]
    );

    return res.json({ data: { ...match, innings, prediction } });
  } catch (err) { return next(err); }
});

// GET /api/matches/:id/predictions — all prediction history
matchRoutes.get('/:id/predictions', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT * FROM predictions WHERE match_id = $1 ORDER BY created_at ASC`, [req.params.id]
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/matches/:id/live
matchRoutes.get('/:id/live', async (req, res, next) => {
  try {
    const state = await queryOne(
      `SELECT lm.*, 
        s.name AS striker_name, ns.name AS non_striker_name, b.name AS bowler_name
       FROM live_match_state lm
       LEFT JOIN players s ON lm.striker_id = s.id
       LEFT JOIN players ns ON lm.non_striker_id = ns.id
       LEFT JOIN players b ON lm.bowler_id = b.id
       WHERE lm.match_id = $1`, [req.params.id]
    );
    res.json({ data: state });
  } catch (err) { next(err); }
});
