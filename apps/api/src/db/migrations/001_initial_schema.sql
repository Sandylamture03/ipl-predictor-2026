-- IPL Win Predictor — Initial Schema
-- Run once against ipl_predictor database

CREATE TABLE IF NOT EXISTS teams (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  short_name VARCHAR(20),
  city VARCHAR(80),
  primary_color VARCHAR(10) DEFAULT '#1a1a2e',
  secondary_color VARCHAR(10) DEFAULT '#ffffff',
  logo_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS players (
  id BIGSERIAL PRIMARY KEY,
  cricsheet_player_id VARCHAR(64) UNIQUE,
  name VARCHAR(120) NOT NULL,
  batting_style VARCHAR(40),
  bowling_style VARCHAR(40),
  role VARCHAR(40),
  country VARCHAR(80),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS venues (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  city VARCHAR(80),
  country VARCHAR(80) DEFAULT 'India',
  avg_first_innings_score NUMERIC(6,2),
  chase_win_pct NUMERIC(5,2),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(name, city)
);

CREATE TABLE IF NOT EXISTS matches (
  id BIGSERIAL PRIMARY KEY,
  external_match_ref VARCHAR(120) UNIQUE,
  source_match_key VARCHAR(120),
  season VARCHAR(20) NOT NULL,
  match_date DATE NOT NULL,
  match_time TIME,
  event_name VARCHAR(150),
  match_number INT,
  stage VARCHAR(80),
  venue_id BIGINT REFERENCES venues(id),
  team1_id BIGINT NOT NULL REFERENCES teams(id),
  team2_id BIGINT NOT NULL REFERENCES teams(id),
  toss_winner_team_id BIGINT REFERENCES teams(id),
  toss_decision VARCHAR(10) CHECK (toss_decision IN ('bat', 'field')),
  match_type VARCHAR(20) DEFAULT 'T20',
  overs_limit INT DEFAULT 20,
  winner_team_id BIGINT REFERENCES teams(id),
  result_type VARCHAR(30),
  win_by_runs INT,
  win_by_wickets INT,
  method VARCHAR(40),
  player_of_match TEXT,
  status VARCHAR(20) DEFAULT 'scheduled',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (team1_id <> team2_id)
);

CREATE TABLE IF NOT EXISTS match_players (
  id BIGSERIAL PRIMARY KEY,
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id BIGINT NOT NULL REFERENCES teams(id),
  player_id BIGINT NOT NULL REFERENCES players(id),
  is_playing_xi BOOLEAN DEFAULT TRUE,
  is_captain BOOLEAN DEFAULT FALSE,
  is_wicketkeeper BOOLEAN DEFAULT FALSE,
  batting_position INT,
  UNIQUE(match_id, player_id)
);

CREATE TABLE IF NOT EXISTS innings (
  id BIGSERIAL PRIMARY KEY,
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  innings_number INT NOT NULL,
  batting_team_id BIGINT NOT NULL REFERENCES teams(id),
  bowling_team_id BIGINT REFERENCES teams(id),
  target_runs INT,
  target_overs NUMERIC(5,2),
  total_runs INT DEFAULT 0,
  wickets_lost INT DEFAULT 0,
  overs_bowled NUMERIC(5,2) DEFAULT 0,
  is_super_over BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, innings_number)
);

CREATE TABLE IF NOT EXISTS deliveries (
  id BIGSERIAL PRIMARY KEY,
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  innings_id BIGINT NOT NULL REFERENCES innings(id) ON DELETE CASCADE,
  innings_number INT NOT NULL,
  over_number INT NOT NULL,
  ball_in_over INT NOT NULL,
  legal_ball_number INT,
  batter_id BIGINT REFERENCES players(id),
  bowler_id BIGINT REFERENCES players(id),
  non_striker_id BIGINT REFERENCES players(id),
  runs_batter INT NOT NULL DEFAULT 0,
  runs_extras INT NOT NULL DEFAULT 0,
  runs_total INT NOT NULL DEFAULT 0,
  extra_type VARCHAR(20),
  extra_runs INT DEFAULT 0,
  is_wicket BOOLEAN DEFAULT FALSE,
  wicket_kind VARCHAR(40),
  player_out_id BIGINT REFERENCES players(id),
  fielder1_id BIGINT REFERENCES players(id),
  fielder2_id BIGINT REFERENCES players(id),
  is_boundary_four BOOLEAN DEFAULT FALSE,
  is_boundary_six BOOLEAN DEFAULT FALSE,
  raw_payload JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, innings_number, over_number, ball_in_over)
);

CREATE TABLE IF NOT EXISTS live_match_state (
  id BIGSERIAL PRIMARY KEY,
  match_id BIGINT NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
  source_match_key VARCHAR(120),
  innings_number INT,
  score INT DEFAULT 0,
  wickets INT DEFAULT 0,
  overs NUMERIC(5,2) DEFAULT 0,
  target INT,
  current_run_rate NUMERIC(6,2),
  required_run_rate NUMERIC(6,2),
  striker_id BIGINT REFERENCES players(id),
  non_striker_id BIGINT REFERENCES players(id),
  bowler_id BIGINT REFERENCES players(id),
  last_event TEXT,
  is_live BOOLEAN DEFAULT FALSE,
  fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
  raw_payload JSONB
);

CREATE TABLE IF NOT EXISTS team_form_snapshots (
  id BIGSERIAL PRIMARY KEY,
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id BIGINT NOT NULL REFERENCES teams(id),
  last5_win_pct NUMERIC(5,2),
  avg_runs_last5 NUMERIC(6,2),
  avg_wkts_last5 NUMERIC(6,2),
  avg_powerplay_runs_last5 NUMERIC(6,2),
  avg_death_runs_last5 NUMERIC(6,2),
  chase_win_pct NUMERIC(5,2),
  venue_win_pct NUMERIC(5,2),
  elo_rating NUMERIC(8,2) DEFAULT 1500,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, team_id)
);

CREATE TABLE IF NOT EXISTS player_form_snapshots (
  id BIGSERIAL PRIMARY KEY,
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id BIGINT NOT NULL REFERENCES players(id),
  team_id BIGINT REFERENCES teams(id),
  batting_avg_last5 NUMERIC(6,2),
  strike_rate_last5 NUMERIC(6,2),
  boundary_pct_last5 NUMERIC(6,2),
  bowling_econ_last5 NUMERIC(6,2),
  bowling_sr_last5 NUMERIC(6,2),
  wickets_last5 INT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, player_id)
);

CREATE TABLE IF NOT EXISTS predictions (
  id BIGSERIAL PRIMARY KEY,
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  phase VARCHAR(20) NOT NULL,
  model_version VARCHAR(40) NOT NULL DEFAULT 'v1.0',
  team1_win_prob NUMERIC(6,4) NOT NULL,
  team2_win_prob NUMERIC(6,4) NOT NULL,
  batting_team_win_prob NUMERIC(6,4),
  chasing_team_win_prob NUMERIC(6,4),
  explanation JSONB,
  features JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id BIGSERIAL PRIMARY KEY,
  source_name VARCHAR(50) NOT NULL,
  run_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP,
  records_processed INT DEFAULT 0,
  message TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_matches_season_date ON matches(season, match_date);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_match_innings_over ON deliveries(match_id, innings_number, over_number, ball_in_over);
CREATE INDEX IF NOT EXISTS idx_deliveries_batter ON deliveries(batter_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_bowler ON deliveries(bowler_id);
CREATE INDEX IF NOT EXISTS idx_predictions_match_phase ON predictions(match_id, phase, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_form_match_team ON team_form_snapshots(match_id, team_id);

-- Seed IPL 2026 Teams
INSERT INTO teams (name, short_name, city, primary_color, secondary_color) VALUES
  ('Chennai Super Kings',    'CSK',  'Chennai',    '#F9CD1B', '#1B4EA8'),
  ('Mumbai Indians',         'MI',   'Mumbai',     '#004E92', '#D4AF37'),
  ('Royal Challengers Bengaluru', 'RCB', 'Bengaluru', '#EC1C24', '#000000'),
  ('Kolkata Knight Riders',  'KKR',  'Kolkata',    '#3A225D', '#B3A123'),
  ('Gujarat Titans',         'GT',   'Ahmedabad',  '#1C2B5E', '#ADB8D0'),
  ('Rajasthan Royals',       'RR',   'Jaipur',     '#FF1493', '#004488'),
  ('Lucknow Super Giants',   'LSG',  'Lucknow',    '#A72056', '#F3B300'),
  ('Sunrisers Hyderabad',    'SRH',  'Hyderabad',  '#FF6B2B', '#000000'),
  ('Delhi Capitals',         'DC',   'Delhi',      '#17479E', '#EF1B23'),
  ('Punjab Kings',           'PBKS', 'Mohali',     '#ED1B24', '#A7A9AC')
ON CONFLICT (name) DO NOTHING;
