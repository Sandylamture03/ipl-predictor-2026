-- 002: Live ingestion enhancements
-- Adds columns needed to link live API data to internal tables

-- Track which API match corresponds to a live_match_state row
ALTER TABLE live_match_state
  ADD COLUMN IF NOT EXISTS api_match_id VARCHAR(120);

-- Timestamp of last scorecard fetch (to pace API calls)
ALTER TABLE live_match_state
  ADD COLUMN IF NOT EXISTS last_scorecard_fetch TIMESTAMP;

-- External player ref for name-based upserts from live API
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS external_player_ref VARCHAR(120);

-- Index for fast player lookup by name during ingestion
CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);

-- Index for api_match_id lookups
CREATE INDEX IF NOT EXISTS idx_live_match_state_api ON live_match_state(api_match_id);
