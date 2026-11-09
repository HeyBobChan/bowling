-- Apply with the database administrator, never with the public web connection.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'marker_games_web') THEN
    CREATE ROLE marker_games_web LOGIN;
  END IF;
END $$;
ALTER ROLE marker_games_web NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 10;
ALTER ROLE marker_games_web SET statement_timeout = '5s';
ALTER ROLE marker_games_web SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE marker_games_web SET search_path = pg_catalog, public;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM marker_games_web;
GRANT USAGE ON SCHEMA public TO marker_games_web;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM marker_games_web;
GRANT SELECT, INSERT ON leaderboard_scores TO marker_games_web;
GRANT SELECT, INSERT, UPDATE ON chana_rooms, chana_players TO marker_games_web;
GRANT SELECT, INSERT, UPDATE, DELETE ON leaderboard_runs TO marker_games_web;
GRANT SELECT, UPDATE ON leaderboard_budget TO marker_games_web;
DO $$ BEGIN
  EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO marker_games_web', current_database());
END $$;
