-- Trumpagotchi keeps everything it stores in its own schema, apart from any other
-- application that shares this database. Run with an administrator (see migrate.mjs).
CREATE SCHEMA IF NOT EXISTS trumpagotchi;

CREATE TABLE IF NOT EXISTS trumpagotchi.pets (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- SHA-256 of the keeper code. The code itself is never stored, so the table alone opens no pet.
  key_hash   text NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  -- The save exactly as the game writes it. No names, emails or addresses of people.
  state      jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object' AND pg_column_size(state) <= 65536),
  rev        integer NOT NULL DEFAULT 1 CHECK (rev > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pets_updated_at ON trumpagotchi.pets (updated_at);

COMMENT ON SCHEMA trumpagotchi IS 'Trumpagotchi (parody virtual pet): cloud saves. Owned by that app alone.';
COMMENT ON TABLE trumpagotchi.pets IS 'One row per cloud-saved pet, found by the hash of its keeper code.';
