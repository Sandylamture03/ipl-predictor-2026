<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# indian premier league 2026 i want to create and tool which can gather all the relevant data from web from past all ipl leagues till now and also on each upcoming match based on true and live data we can predict who will going to wins the match each time new match starts,  is it possible to make some tool for achieve this

Yes — you can build this, and the idea is technically realistic. A strong version would collect historical IPL data from past seasons, merge it with live match information for the current game, and output a win probability that updates as the match progresses rather than claiming a guaranteed winner. [^1_1][^1_2][^1_3][^1_4]

## What to build

The product should have two parts: a **data pipeline** that keeps IPL history and live match data updated, and a prediction engine that recalculates probabilities before the toss, after team lineups, and during every over. [^1_2][^1_3][^1_5][^1_4]
This fits your background well because you already have React front-end experience and around four years of development experience, so you could handle the dashboard/UI while building the backend and model incrementally.

## Best data sources

For historical IPL seasons, Cricsheet is one of the best starting points because it provides freely available structured cricket data and ball-by-ball match downloads. [^1_2][^1_3][^1_6]
For official current-season scheduling and results, the IPL site has dedicated fixtures and results pages, and ESPN Cricinfo also maintains IPL series pages and records pages that are useful for standings, player stats, and reference data. [^1_1][^1_7][^1_8][^1_9]
For live or near-real-time match state, Cricbuzz offers fast live scores and ball-by-ball commentary, while cricket data providers such as Roanuz Cricket API expose ball-by-ball API endpoints for match and over-level updates. [^1_5][^1_10][^1_4]

## How prediction works

You should not try to predict only from old season tables; the model becomes much better when it uses match context such as venue, toss, batting first vs chasing, powerplay score, wickets in hand, current run rate, required rate, team form, player matchups, and final playing XI. [^1_3][^1_6][^1_4]
In practice, build two models: a pre-match model using historical team and player features, and an in-match model that updates win probability ball by ball from live score state. [^1_3][^1_6][^1_4]
The output should be phrased as probability, such as “Team A has 68% win chance,” because no model can truly know the winner with certainty before the game ends.

## System design

A practical stack would be React for the dashboard, a Python or Node backend for data ingestion and APIs, PostgreSQL for cleaned match tables, and a scheduled job that refreshes fixtures, scorecards, and player stats several times per day or every few seconds during a live game. [^1_1][^1_7][^1_4]
Your database should store at least these tables: matches, innings, deliveries, teams, players, venues, toss decisions, playing XI, and rolling performance features derived from recent matches. [^1_3][^1_6]
For the model, start with simpler approaches like logistic regression or gradient boosting before trying deep learning, because the biggest gain usually comes from clean cricket features and reliable live data, not from a complicated model.

## Reality check

This is feasible, but the hardest part is not coding the UI — it is keeping data clean, current, and legally safe to use at scale. Official fixtures for IPL 2026 are available on the IPL site, but reporting around the season has also noted that full fixture details can change or be released in stages, so your scraper and scheduler must expect updates. [^1_1][^1_11][^1_12]
You also need to check each source’s terms of use before scraping heavily, and in many cases using an approved cricket API is safer than scraping public pages repeatedly. [^1_4][^1_5]
If you want the fastest path, build an MVP in this order: historical database first, pre-match prediction second, live score ingestion third, and ball-by-ball win probability last. Would you like a full architecture plan with database schema, APIs, and a step-by-step build roadmap for your first MVP?
<span style="display:none">[^1_13][^1_14][^1_15][^1_16][^1_17][^1_18][^1_19][^1_20][^1_21][^1_22][^1_23][^1_24][^1_25][^1_26][^1_27][^1_28][^1_29][^1_30]</span>

<div align="center">⁂</div>

[^1_1]: https://www.iplt20.com/matches/fixtures

[^1_2]: https://cricsheet.org/downloads/

[^1_3]: https://cricsheet.org

[^1_4]: https://www.cricketapi.com/docs/Core-API/Ball-By-Ball-API/

[^1_5]: https://apps.apple.com/us/app/cricbuzz-live-cricket-scores/id360466413

[^1_6]: https://cricsheet.org/matches/

[^1_7]: https://www.iplt20.com/matches/results

[^1_8]: https://www.espncricinfo.com/series/ipl-2026-1510719

[^1_9]: https://www.espncricinfo.com/records/trophy/indian-premier-league-117

[^1_10]: https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches

[^1_11]: https://www.latestly.com/sports/cricket/ipl-2026-schedule-heres-all-you-need-to-know-about-fixtures-and-time-table-7347000.html

[^1_12]: https://www.ndtvprofit.com/sports/ipl-2026-schedule-released-heres-the-truth-behind-the-viral-image-11188847

[^1_13]: https://www.goodreturns.in/news/ipl-2026-date-schedule-venue-competing-teams-ticket-prices-how-to-watch-ipl-at-jiohotstar-1494619.html

[^1_14]: https://news.abplive.com/sports/cricket/ipl-2026-schedule-delayed-new-announcement-date-and-time-revealed-1830346

[^1_15]: https://hauterrfly.com/trending/ipl-2026-schedule-royal-challengers-bengaluru-vs-punjab-kings-expected-first-match/

[^1_16]: https://en.wikipedia.org/wiki/2026_Indian_Premier_League

[^1_17]: https://news.abplive.com/sports/cricket/ipl-2026-schedule-start-date-final-first-match-playoffs-details-indian-premier-league-1830279

[^1_18]: https://ipl2026.net

[^1_19]: https://apps.apple.com/nr/app/cricbuzz-live-cricket-scores/id360466413

[^1_20]: https://play.google.com/store/apps/details?id=com.cricheroes.cricheroes.alpha\&hl=en_IN

[^1_21]: https://www.kaggle.com/datasets/sanjeesi/ipl-dataset-by-cricsheet

[^1_22]: https://www.r-bloggers.com/2017/12/analysing-ipl-matches-using-cricsheet-data-part-1/

[^1_23]: https://web.archive.org/web/20190517034904/https:/www.iplt20.com/results/men

[^1_24]: https://www.sportsyaari.com/cricket/ipl-stats-s1/

[^1_25]: https://www.r-bloggers.com/2017/12/analysing-ipl-matches-using-cricsheet-data-part-2/

[^1_26]: https://www.crictracker.com/t20/ipl-indian-premier-league/archives/

[^1_27]: https://en.wikipedia.org/wiki/List_of_Indian_Premier_League_records_and_statistics

[^1_28]: https://github.com/Vaishali-Garg/IPL-data-for-analytics

[^1_29]: https://www.iplt20.com/teams/delhi-capitals/archive

[^1_30]: https://www.kaggle.com/datasets/chaitu20/ipl-dataset2008-2025/versions/1


---

# Would you like a full architecture plan with database schema, APIs, and a step-by-step build roadmap for your first MVP?,

yes please

Yes — the best MVP is a live IPL intelligence platform with four layers: data ingestion, a cricket database, feature engineering, and a prediction service that returns win probabilities for every upcoming or live match. [^2_1][^2_2][^2_3]
Because you already work with React and have solid front-end experience, you can build the dashboard yourself and keep the first version focused on backend reliability plus a simple prediction UI.

## Core architecture

Use one historical source and one live source at the start: Cricsheet for past IPL ball-by-ball data, and either an approved live cricket API such as Roanuz or a legally permitted live-score provider for current match updates. [^2_1][^2_2][^2_3][^2_4]
The flow should be: scheduled collector pulls fixtures and results from official IPL pages, historical importer loads Cricsheet files into PostgreSQL, live ingestor updates active matches, feature service computes model inputs, and prediction API serves the front end. [^2_5][^2_6][^2_1][^2_3]

## Data model

Start with these main tables so your system stays clean and queryable from day one. [^2_2][^2_7][^2_3]


| Table | Purpose | Key columns |
| :-- | :-- | :-- |
| `teams` | IPL team master list for joins across seasons. [^2_5][^2_8] | `team_id`, `team_name`, `short_name`, `city` |
| `players` | Normalized player directory because Cricsheet provides structured match/player data and identifier mapping. [^2_1][^2_2] | `player_id`, `player_name`, `bat_style`, `bowl_style`, `role` |
| `venues` | Venue context is important for toss effects, chasing patterns, and scoring trends. [^2_7][^2_8] | `venue_id`, `venue_name`, `city`, `country` |
| `matches` | Match-level facts from fixtures, results, toss, outcome, and venue. [^2_5][^2_6][^2_7] | `match_id`, `season`, `date`, `team1_id`, `team2_id`, `venue_id`, `toss_winner_id`, `toss_decision`, `winner_id`, `result_type` |
| `playing_xi` | Final lineup table because pre-match prediction improves after the confirmed XI is known. [^2_3][^2_8] | `match_id`, `team_id`, `player_id`, `is_captain`, `is_wicketkeeper` |
| `innings` | Innings summary for first-innings vs chase analysis. [^2_7] | `innings_id`, `match_id`, `batting_team_id`, `bowling_team_id`, `runs`, `wickets`, `overs` |
| `deliveries` | Core ball-by-ball table because Cricsheet and live ball APIs both expose delivery or over details. [^2_2][^2_7][^2_3] | `match_id`, `innings_no`, `over_no`, `ball_no`, `striker_id`, `bowler_id`, `runs_bat`, `extras`, `wicket_type`, `fielder_id` |
| `team_form_snapshot` | Rolling team features such as last 5 matches, venue record, chase success, and powerplay trends. [^2_2][^2_9] | `match_id`, `team_id`, `last5_win_pct`, `avg_powerplay_runs`, `avg_death_runs`, `chase_win_pct` |
| `player_form_snapshot` | Rolling player features such as batting SR, bowling economy, wickets, and matchup history. [^2_10][^2_9] | `match_id`, `player_id`, `bat_sr_last5`, `avg_last5`, `econ_last5`, `wkts_last5` |
| `live_match_state` | Current state for win prediction updates during the match. [^2_3][^2_11] | `match_id`, `innings_no`, `score`, `wickets`, `overs`, `target`, `req_rate`, `current_rate`, `last_updated_at` |
| `predictions` | Stores every probability generated by the model for analysis and retraining. | `prediction_id`, `match_id`, `timestamp`, `phase`, `team1_win_prob`, `team2_win_prob`, `model_version` |

## APIs to build

Keep your backend small and clean in v1, with separate endpoints for data, features, and predictions.
A good first set is:

- `GET /api/seasons` — list IPL seasons available in your database. [^2_1][^2_5]
- `GET /api/matches?season=2026` — return fixtures, results, and match status from official schedule/result data. [^2_5][^2_6]
- `GET /api/matches/:id` — match details, venue, squads, toss, score, and latest prediction. [^2_8][^2_3]
- `GET /api/matches/:id/ball-by-ball` — return delivery stream or over stream using your stored data or live provider response. [^2_3][^2_11]
- `GET /api/matches/:id/features/pre-match` — computed features for the pre-match model.
- `GET /api/matches/:id/features/live` — live state features such as wickets left, required rate, pressure index, and recent-over momentum.
- `POST /api/predict/pre-match` — returns win probability before toss or after XI confirmation.
- `POST /api/predict/live` — returns updated win probability every over or every ball. [^2_3][^2_11]
- `POST /api/admin/retrain` — retrain models after each completed match.
- `GET /api/leaderboard/models` — accuracy, log loss, and calibration of each model version.


## Prediction engine

Build this in three stages so you get value early instead of waiting for a perfect AI system.
Stage 1 is a pre-match model using team strength, recent form, venue record, head-to-head, toss, and probable or confirmed XI; Stage 2 is an innings-break model that updates after the first innings; Stage 3 is a live model that recalculates after each over or ball using score, wickets, run rate, required rate, batter-bowler context, and venue scoring pattern. [^2_10][^2_9][^2_3][^2_11]
Use gradient boosting or logistic regression first, because Cricsheet’s structured ball-by-ball data makes feature engineering practical, and Roanuz-style live endpoints provide the state variables needed for in-match inference. [^2_2][^2_7][^2_3]

Useful feature groups for the model:

- Team strength: last 5 wins, Elo rating, season win rate, home/away effect.
- Venue features: average first-innings score, dew/chasing bias, spin vs pace support.
- Toss features: toss winner, bat/field decision, chase bias at that venue. [^2_7][^2_8]
- Batting features: powerplay scoring, middle-over stability, death-over strike rate. [^2_9][^2_10]
- Bowling features: powerplay wickets, death economy, matchup vs left/right combinations. [^2_10]
- Live features: current score, wickets in hand, required run rate, recent 12-ball momentum, projected total. [^2_3][^2_11]


## Build roadmap

Follow this order for the first 6-8 weeks so the product becomes usable quickly.

1. Week 1: Set up PostgreSQL, backend, React dashboard shell, and authentication for admin ingestion tasks.
2. Week 1-2: Import all historical IPL data from Cricsheet, normalize teams/players/venues, and verify every match can reconstruct innings and outcome. [^2_12][^2_2][^2_7]
3. Week 2-3: Add official fixtures/results sync from IPL pages, plus a match-status scheduler for upcoming, live, and completed games. [^2_5][^2_6]
4. Week 3-4: Create feature pipelines for team form, player form, venue trends, and toss effects using rolling windows. [^2_10][^2_9]
5. Week 4-5: Train a pre-match model and expose `POST /predict/pre-match`, then show probabilities on the React UI.
6. Week 5-6: Integrate live ball-by-ball or over-by-over feed from an API provider and update `live_match_state` continuously. [^2_3][^2_11][^2_4]
7. Week 6-7: Train the live model and save every probability change in the `predictions` table for later evaluation.
8. Week 7-8: Add monitoring, rate limits, logging, retraining jobs, and a model-performance page with accuracy and calibration charts.

For the tech stack, React on the front end fits your current strength, while FastAPI or Express can power ingestion and prediction endpoints, PostgreSQL can hold normalized cricket data, Redis can cache live states, and a Python ML service can train and serve the models. [^2_2][^2_3]
For deployment, keep it simple: one app server, one worker for ingestion, one database, and one cron scheduler; after that you can split collectors, predictors, and UI into separate services.

## Practical MVP choices

To reduce scope, do not start with “predict every ball of every match from day one.”
Start with these three screens only: `Upcoming Matches`, `Live Match Win Probability`, and `Past Match Explorer`. [^2_5][^2_6][^2_8]
For legal and reliability reasons, prefer official pages for fixtures/results and a licensed cricket API for live updates, because live scraping can break when page structure changes or access terms tighten. [^2_5][^2_6][^2_3][^2_4]

A very good first MVP definition is:

- Historical IPL data from 2008 onward in one database. [^2_1][^2_12]
- Pre-match win prediction for every scheduled IPL 2026 match. [^2_5][^2_8]
- Live win probability refresh every over during active matches. [^2_3][^2_11]
- Model dashboard showing why the probability moved, such as wickets lost, required rate jump, or strong death bowling available.

Would you like the next step as actual SQL table definitions plus a folder structure for React + Node/Python so you can start coding immediately?
<span style="display:none">[^2_13][^2_14][^2_15][^2_16][^2_17][^2_18][^2_19]</span>

<div align="center">⁂</div>

[^2_1]: https://cricsheet.org

[^2_2]: https://cricsheet.org/format/

[^2_3]: https://www.cricketapi.com/docs/Core-API/Ball-By-Ball-API/

[^2_4]: https://sports.roanuz.com/docs/

[^2_5]: https://www.iplt20.com/matches/fixtures

[^2_6]: https://www.iplt20.com/matches/results

[^2_7]: https://cricsheet.org/format/json/

[^2_8]: https://www.espncricinfo.com/series/ipl-2026-1510719

[^2_9]: https://cran.r-project.org/web/packages/cricketdata/vignettes/cricsheet.html

[^2_10]: https://www.espncricinfo.com/records/trophy/indian-premier-league-117

[^2_11]: https://www.cricketapi.com/v5/docs/match-ball-by-ball-rest-api

[^2_12]: https://cricsheet.org/downloads/

[^2_13]: https://cran.r-project.org/web/packages/cricketdata/cricketdata.pdf

[^2_14]: https://iplt20league.com

[^2_15]: https://robjhyndman.r-universe.dev/cricketdata/doc/manual.html

[^2_16]: https://www.espncricinfo.com/series/ipl-2025-1449924/match-schedule-fixtures-and-results

[^2_17]: https://www.crictracker.com/international-league-t20/schedule/

[^2_18]: https://robjhyndman.r-universe.dev/cricketdata/doc/cricsheet.html

[^2_19]: https://sports.roanuz.com/docs/Core-API/


---

# Would you like the next step as actual SQL table definitions plus a folder structure for React + Node/Python so you can start coding immediately?

yes please

Yes — below is a production-friendly starter schema and folder layout that maps directly to Cricsheet’s JSON structure for match info, players, registry IDs, innings, overs, deliveries, runs, extras, and wickets, while also leaving room for a live feed that can refresh every 5 seconds from a ball-by-ball API.
This is the right level for an MVP because it gives you clean historical storage first and a separate live-state layer for real-time prediction updates.

## SQL schema

This schema is designed around the fields Cricsheet exposes in `info`, `players`, `registry.people`, `toss`, `outcome`, `innings`, `overs`, `deliveries`, `runs`, `extras`, and `wickets`, so your importer can stay straightforward instead of doing heavy transformations too early.
It also includes `source_match_key` and `source_over_key` fields so you can connect your stored match to a live provider that identifies matches and over segments in its API paths.

```sql
-- Enable UUID generation if you want UUID primary keys later
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE teams (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  short_name VARCHAR(20),
  city VARCHAR(80),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE players (
  id BIGSERIAL PRIMARY KEY,
  cricsheet_player_id VARCHAR(64) UNIQUE,
  name VARCHAR(120) NOT NULL,
  batting_style VARCHAR(40),
  bowling_style VARCHAR(40),
  role VARCHAR(40),
  country VARCHAR(80),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE venues (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  city VARCHAR(80),
  country VARCHAR(80) DEFAULT 'India',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(name, city)
);

CREATE TABLE matches (
  id BIGSERIAL PRIMARY KEY,
  external_match_ref VARCHAR(120) UNIQUE,
  source_match_key VARCHAR(120), -- live provider key
  season VARCHAR(20) NOT NULL,
  match_date DATE NOT NULL,
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
  balls_per_over INT DEFAULT 6,
  city VARCHAR(80),
  winner_team_id BIGINT REFERENCES teams(id),
  result_type VARCHAR(30), -- win, tie, no_result, draw
  win_by_runs INT,
  win_by_wickets INT,
  method VARCHAR(40), -- D/L etc
  player_of_match TEXT,
  status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, live, completed
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (team1_id <> team2_id)
);

CREATE TABLE match_players (
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

CREATE TABLE innings (
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
  declared BOOLEAN DEFAULT FALSE,
  forfeited BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, innings_number)
);

CREATE TABLE deliveries (
  id BIGSERIAL PRIMARY KEY,
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  innings_id BIGINT NOT NULL REFERENCES innings(id) ON DELETE CASCADE,
  innings_number INT NOT NULL,
  over_number INT NOT NULL,
  ball_in_over INT NOT NULL,
  legal_ball_number INT,
  ball_key VARCHAR(30), -- e.g. 15.3 or provider-specific
  batter_id BIGINT REFERENCES players(id),
  bowler_id BIGINT REFERENCES players(id),
  non_striker_id BIGINT REFERENCES players(id),

  runs_batter INT NOT NULL DEFAULT 0,
  runs_extras INT NOT NULL DEFAULT 0,
  runs_total INT NOT NULL DEFAULT 0,

  extra_type VARCHAR(20), -- wide, noball, bye, legbye, penalty
  extra_runs INT DEFAULT 0,

  is_wicket BOOLEAN DEFAULT FALSE,
  wicket_kind VARCHAR(40),
  player_out_id BIGINT REFERENCES players(id),

  fielder1_id BIGINT REFERENCES players(id),
  fielder2_id BIGINT REFERENCES players(id),

  is_boundary_four BOOLEAN DEFAULT FALSE,
  is_boundary_six BOOLEAN DEFAULT FALSE,
  non_boundary BOOLEAN DEFAULT FALSE,

  raw_payload JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(match_id, innings_number, over_number, ball_in_over)
);

CREATE TABLE live_match_state (
  id BIGSERIAL PRIMARY KEY,
  match_id BIGINT NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
  source_match_key VARCHAR(120),
  latest_over_key VARCHAR(120), -- provider over key if available
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

CREATE TABLE team_form_snapshots (
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
  elo_rating NUMERIC(8,2),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, team_id)
);

CREATE TABLE player_form_snapshots (
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

CREATE TABLE predictions (
  id BIGSERIAL PRIMARY KEY,
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  phase VARCHAR(20) NOT NULL, -- pre_match, toss, innings_break, live
  model_version VARCHAR(40) NOT NULL,
  team1_win_prob NUMERIC(6,4) NOT NULL,
  team2_win_prob NUMERIC(6,4) NOT NULL,
  batting_team_win_prob NUMERIC(6,4),
  chasing_team_win_prob NUMERIC(6,4),
  explanation JSONB,
  features JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ingestion_runs (
  id BIGSERIAL PRIMARY KEY,
  source_name VARCHAR(50) NOT NULL, -- cricsheet, iplt20, roanuz
  run_type VARCHAR(50) NOT NULL,    -- full_import, incremental_sync, live_poll
  status VARCHAR(20) NOT NULL,      -- started, success, failed
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP,
  message TEXT
);

CREATE INDEX idx_matches_season_date ON matches(season, match_date);
CREATE INDEX idx_matches_status_date ON matches(status, match_date);
CREATE INDEX idx_deliveries_match_innings_over ON deliveries(match_id, innings_number, over_number, ball_in_over);
CREATE INDEX idx_deliveries_batter ON deliveries(batter_id);
CREATE INDEX idx_deliveries_bowler ON deliveries(bowler_id);
CREATE INDEX idx_predictions_match_phase_time ON predictions(match_id, phase, created_at DESC);
CREATE INDEX idx_team_form_match_team ON team_form_snapshots(match_id, team_id);
CREATE INDEX idx_player_form_match_player ON player_form_snapshots(match_id, player_id);
```

A few practical mapping rules will save you pain later.
Store Cricsheet `registry.people` IDs into `players.cricsheet_player_id`, map `info.players` into `match_players`, map each innings object into `innings`, and flatten every delivery into one row in `deliveries` while keeping the original object in `raw_payload` for debugging.
For live ingestion, update only `live_match_state` during the match and write final ball-level data back into `deliveries` after reconciliation, because the live API is designed for repeated refreshes and not just one-time fetches.

## Folder structure

A simple monorepo is the fastest setup for you because it keeps React, API, workers, and ML logic in one place during the MVP stage.
This layout separates concerns cleanly: web UI, backend API, ingestion jobs, and model code.

```txt
ipl-win-predictor/
├─ apps/
│  ├─ web/                         # React app
│  │  ├─ public/
│  │  └─ src/
│  │     ├─ api/
│  │     │  ├─ client.ts
│  │     │  ├─ matches.ts
│  │     │  └─ predictions.ts
│  │     ├─ components/
│  │     │  ├─ MatchCard.tsx
│  │     │  ├─ WinProbabilityBar.tsx
│  │     │  ├─ ScoreStrip.tsx
│  │     │  └─ PredictionReasons.tsx
│  │     ├─ pages/
│  │     │  ├─ Dashboard.tsx
│  │     │  ├─ MatchDetail.tsx
│  │     │  ├─ UpcomingMatches.tsx
│  │     │  └─ AdminIngestion.tsx
│  │     ├─ hooks/
│  │     │  ├─ useMatches.ts
│  │     │  ├─ useLiveMatch.ts
│  │     │  └─ usePrediction.ts
│  │     ├─ store/
│  │     ├─ utils/
│  │     ├─ App.tsx
│  │     └─ main.tsx
│  │
│  └─ api/                         # Node or Python API gateway
│     ├─ src/
│     │  ├─ config/
│     │  ├─ db/
│     │  │  ├─ connection.ts
│     │  │  ├─ migrations/
│     │  │  └─ queries/
│     │  ├─ modules/
│     │  │  ├─ matches/
│     │  │  │  ├─ match.routes.ts
│     │  │  │  ├─ match.controller.ts
│     │  │  │  ├─ match.service.ts
│     │  │  │  └─ match.repo.ts
│     │  │  ├─ live/
│     │  │  ├─ predictions/
│     │  │  ├─ teams/
│     │  │  └─ players/
│     │  ├─ middlewares/
│     │  ├─ jobs/
│     │  │  ├─ syncFixtures.job.ts
│     │  │  ├─ pollLiveMatches.job.ts
│     │  │  └─ reconcileCompletedMatches.job.ts
│     │  ├─ providers/
│     │  │  ├─ cricsheet.provider.ts
│     │  │  ├─ iplt20.provider.ts
│     │  │  └─ liveCricket.provider.ts
│     │  ├─ app.ts
│     │  └─ server.ts
│     └─ package.json
│
├─ services/
│  └─ ml/
│     ├─ src/
│     │  ├─ features/
│     │  │  ├─ build_pre_match_features.py
│     │  │  ├─ build_live_features.py
│     │  │  └─ feature_store.py
│     │  ├─ training/
│     │  │  ├─ train_pre_match.py
│     │  │  ├─ train_live_model.py
│     │  │  └─ evaluate.py
│     │  ├─ inference/
│     │  │  ├─ predict_pre_match.py
│     │  │  └─ predict_live.py
│     │  ├─ models/
│     │  └─ utils/
│     ├─ artifacts/
│     └─ requirements.txt
│
├─ packages/
│  ├─ shared-types/
│  └─ shared-utils/
│
├─ scripts/
│  ├─ import_cricsheet.ts
│  ├─ backfill_players.ts
│  ├─ generate_team_form.ts
│  └─ seed_reference_data.ts
│
├─ infra/
│  ├─ docker/
│  │  ├─ api.Dockerfile
│  │  ├─ web.Dockerfile
│  │  └─ ml.Dockerfile
│  ├─ docker-compose.yml
│  └─ nginx.conf
│
├─ .env.example
├─ README.md
└─ package.json
```


## API starter

Your live API should expose simple read-heavy endpoints for the React app and separate internal endpoints for ingestion and prediction updates.
That matches the two-source reality here: historical structured match files on one side and frequently refreshed live ball-by-ball state on the other.

Use this first route set:

- `GET /api/health`
- `GET /api/seasons`
- `GET /api/matches?season=2026&status=upcoming`
- `GET /api/matches/:matchId`
- `GET /api/matches/:matchId/deliveries`
- `GET /api/matches/:matchId/live`
- `GET /api/matches/:matchId/predictions`
- `POST /api/admin/import/cricsheet`
- `POST /api/admin/sync/fixtures`
- `POST /api/admin/predict/pre-match/:matchId`
- `POST /api/admin/predict/live/:matchId`

A minimal response shape for the live screen can look like this:

```json
{
  "matchId": 123,
  "status": "live",
  "score": "142/4",
  "overs": 16.3,
  "target": 181,
  "requiredRunRate": 11.08,
  "currentRunRate": 8.60,
  "battingTeam": "RCB",
  "bowlingTeam": "CSK",
  "team1WinProb": 0.41,
  "team2WinProb": 0.59,
  "updatedAt": "2026-03-09T16:45:05Z"
}
```


## Coding order

Build the importer first, because Cricsheet already gives you stable historical match structure including match info, players, innings, overs, deliveries, extras, and wickets, which is exactly what your prediction features will depend on later.
After that, add live polling, because the ball-by-ball API is explicitly meant for repeated refresh cycles and exposes match and over-oriented request patterns that fit a scheduled poller well.

Do it in this exact order:

1. Create the PostgreSQL database and run the schema above.
2. Build `cricsheet.provider.ts` to read one JSON file and insert one match.
3. Backfill all IPL seasons into `matches`, `innings`, `deliveries`, and `match_players`.
4. Build feature jobs that calculate team form and player form before each match.
5. Build a simple pre-match model and save outputs into `predictions`.
6. Add `liveCricket.provider.ts` for live polling every 5-10 seconds, because the provider documentation shows a 5-second refresh expectation.
7. Update `live_match_state` and recalculate live win probability.
8. Reconcile completed matches and retrain the model nightly.

For the very first working version, keep the UI small: upcoming matches list, one match detail page, and one live win-probability widget.
That will let you prove the whole pipeline before spending time on advanced charts, explainability panels, or player matchup pages.

## Import mapping

Your Cricsheet import function should read `info.teams`, `info.venue`, `info.city`, `info.dates`, `info.toss`, `info.outcome`, `info.players`, `info.registry.people`, and `innings[].overs[].deliveries[]`, because those are the exact structures described in the JSON format documentation.
Your live poller should store the provider’s match key and latest over key so you can request either the full live feed or a smaller over-scoped update depending on your traffic and cost limits.

A practical importer flow is:

- Upsert teams from `info.teams`.
- Upsert venue from `info.venue` and `info.city`.
- Upsert players from `registry.people`.
- Insert the `matches` row from `dates`, `season`, `event`, `toss`, and `outcome`.
- Insert `match_players` from `info.players`.
- Insert `innings` rows from each innings object, including target if present.
- Flatten each delivery into the `deliveries` table with runs, extras, wicket info, and fielders.

Would you like the next step as a real starter codebase outline with Express or FastAPI files and the first importer script implementation?

<div align="center">⁂</div>

