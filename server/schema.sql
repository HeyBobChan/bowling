CREATE TABLE IF NOT EXISTS leaderboard_scores (
  submission_id uuid PRIMARY KEY,
  game_id text NOT NULL,
  name text NOT NULL CHECK (name ~ '^([A-Z]{3}|[א-ת]{3})$'),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 1000000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS leaderboard_scores_ranking
  ON leaderboard_scores (game_id, score DESC, created_at ASC, submission_id ASC);

-- Birthday rooms use separate tables from the arcade leaderboard.
CREATE TABLE IF NOT EXISTS chana_rooms (
 code text PRIMARY KEY,
 host_hash text NOT NULL UNIQUE,
 phase text NOT NULL DEFAULT 'lobby' CHECK (phase IN ('lobby','playing','review','results')),
 review_index integer NOT NULL DEFAULT 0,
 created_at bigint NOT NULL,
 expires_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS chana_players (
 id text PRIMARY KEY,
 room_code text NOT NULL REFERENCES chana_rooms(code),
 token_hash text NOT NULL,
 name text NOT NULL,
 order_json text NOT NULL,
 guesses_json text NOT NULL DEFAULT '{}',
 revision integer NOT NULL DEFAULT 0,
 submitted integer NOT NULL DEFAULT 0,
 order_submitted integer NOT NULL DEFAULT 0,
 removed integer NOT NULL DEFAULT 0,
 joined_at bigint NOT NULL,
 updated_at bigint NOT NULL,
 bonus_overrides_json text NOT NULL DEFAULT '{}',
 UNIQUE(room_code,token_hash)
);
CREATE INDEX IF NOT EXISTS chana_players_by_room ON chana_players(room_code,removed);

-- Existing games retain their completed submissions; new games can lock order first.
ALTER TABLE chana_players ADD COLUMN IF NOT EXISTS order_submitted integer NOT NULL DEFAULT 0;
