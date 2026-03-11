import { Router } from 'express';
import { query } from '../../db/connection';

export const teamRoutes = Router();

// GET /api/teams
teamRoutes.get('/', async (_req, res, next) => {
  try {
    const rows = await query(`SELECT * FROM teams ORDER BY name`);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/teams/:id/stats
teamRoutes.get('/:id/stats', async (req, res, next) => {
  try {
    const stats = await query(`
      SELECT
        COUNT(*) FILTER (WHERE winner_team_id = $1) AS wins,
        COUNT(*) FILTER (WHERE (team1_id = $1 OR team2_id = $1) AND status = 'completed') AS played,
        COUNT(*) FILTER (WHERE (team1_id = $1 OR team2_id = $1) AND status = 'completed' AND winner_team_id IS NULL) AS no_result,
        season
      FROM matches
      WHERE team1_id = $1 OR team2_id = $1
      GROUP BY season
      ORDER BY season DESC
    `, [req.params.id]);
    res.json({ data: stats });
  } catch (err) { next(err); }
});
