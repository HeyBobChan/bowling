-- The web process logs in as `trumpagotchi_app`, which can read and write rows in the
-- `trumpagotchi` schema and nothing else: no other schema's tables, no creating objects.
-- Run with an administrator. This file only ever touches the trumpagotchi schema and
-- this one role; it changes nothing about any other application's objects or logins.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'trumpagotchi_app') THEN
    CREATE ROLE trumpagotchi_app LOGIN;
  END IF;
END $$;
ALTER ROLE trumpagotchi_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 10;
ALTER ROLE trumpagotchi_app SET statement_timeout = '5s';
ALTER ROLE trumpagotchi_app SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE trumpagotchi_app SET search_path = trumpagotchi;

REVOKE ALL ON SCHEMA trumpagotchi FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA trumpagotchi FROM PUBLIC;
GRANT USAGE ON SCHEMA trumpagotchi TO trumpagotchi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON trumpagotchi.pets TO trumpagotchi_app;
DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO trumpagotchi_app', current_database());
END $$;
