# Live Feature Rollout Plan (March 28, 2026)

Goal: enable full live ball-by-ball ingestion so live win prediction uses striker/non-striker/bowler and momentum features in real time.

## Current status
- Pre-match model: deployed and working.
- Live model: deployed and working with fallback-safe feature extraction.
- Full live feature quality depends on ball-level `deliveries` + `live_match_state` updates during matches.

## On March 28, 2026 (match day) do this
1. Start live ingestion job (poll + upsert) to keep `live_match_state` updated.
2. Insert/update ball-level rows in `deliveries` for each innings.
3. Ensure these live IDs are populated continuously:
   - `striker_id`
   - `non_striker_id`
   - `bowler_id`
4. Trigger live predictions repeatedly per over/ball:
   - `POST /api/predictions/live/:matchId`
5. Verify model output includes live context fields from the upgraded model.

## Validation checklist
- `GET /api/health` returns OK.
- `GET /health` on ML service returns OK.
- Live match has non-null `live_match_state` row.
- Recent `deliveries` rows exist for the active innings.
- Prediction response `model_version` is trained live model (not heuristic fallback).

## Resume instruction
When you return, say:  
"Continue live ingestion implementation from LIVE_INGESTION_2026-03-28.md"

