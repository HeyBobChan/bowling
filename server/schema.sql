CREATE TABLE IF NOT EXISTS leaderboard_scores (
  submission_id uuid PRIMARY KEY,
  game_id text NOT NULL,
  name text NOT NULL CHECK (name ~ '^([A-Z]{3}|[א-ת]{3})$'),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 1000000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS leaderboard_scores_ranking
  ON leaderboard_scores (game_id, score DESC, created_at ASC, submission_id ASC);
