CREATE TABLE IF NOT EXISTS leaderboard_runs (
  id uuid PRIMARY KEY,
  game_id text NOT NULL CHECK (game_id = 'main'),
  token_hash text NOT NULL CHECK (length(token_hash) = 64),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  submission_id uuid UNIQUE REFERENCES leaderboard_scores(submission_id)
);
CREATE INDEX IF NOT EXISTS leaderboard_runs_expiry ON leaderboard_runs(expires_at);
CREATE TABLE IF NOT EXISTS leaderboard_budget (
  id integer PRIMARY KEY CHECK (id = 1),
  day date NOT NULL,
  runs integer NOT NULL DEFAULT 0,
  scores integer NOT NULL DEFAULT 0
);
INSERT INTO leaderboard_budget(id,day) VALUES (1,(now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING;

-- Hard storage ceilings also apply to direct writes by the runtime DB role.
-- Existing rows are preserved. Full capacity rejects new rows instead of pruning scores.
CREATE OR REPLACE FUNCTION public.enforce_game_capacity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE total bigint; maximum bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(728301903);
  CASE TG_TABLE_NAME
    WHEN 'leaderboard_scores' THEN SELECT count(*) INTO total FROM public.leaderboard_scores; maximum := 50000;
    WHEN 'leaderboard_runs' THEN SELECT count(*) INTO total FROM public.leaderboard_runs; maximum := 2000;
    WHEN 'chana_rooms' THEN SELECT count(*) INTO total FROM public.chana_rooms; maximum := 2000;
    WHEN 'chana_players' THEN SELECT count(*) INTO total FROM public.chana_players; maximum := 100000;
    ELSE RAISE EXCEPTION 'Unknown capacity table';
  END CASE;
  IF total >= maximum THEN RAISE EXCEPTION 'Game storage capacity reached' USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS leaderboard_score_capacity ON leaderboard_scores;
CREATE TRIGGER leaderboard_score_capacity BEFORE INSERT ON leaderboard_scores FOR EACH ROW EXECUTE FUNCTION public.enforce_game_capacity();
DROP TRIGGER IF EXISTS leaderboard_run_capacity ON leaderboard_runs;
CREATE TRIGGER leaderboard_run_capacity BEFORE INSERT ON leaderboard_runs FOR EACH ROW EXECUTE FUNCTION public.enforce_game_capacity();
DROP TRIGGER IF EXISTS chana_room_capacity ON chana_rooms;
CREATE TRIGGER chana_room_capacity BEFORE INSERT ON chana_rooms FOR EACH ROW EXECUTE FUNCTION public.enforce_game_capacity();
DROP TRIGGER IF EXISTS chana_player_capacity ON chana_players;
CREATE TRIGGER chana_player_capacity BEFORE INSERT ON chana_players FOR EACH ROW EXECUTE FUNCTION public.enforce_game_capacity();

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'marker_games_web') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON leaderboard_runs TO marker_games_web;
    GRANT SELECT, UPDATE ON leaderboard_budget TO marker_games_web;
  END IF;
END $$;
