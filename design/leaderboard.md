# Shared arcade scores

Bowling (`main` in games.json) offers an optional score submission at game over and
a public top-ten list on the intro and result screens. Names contain exactly three
English or Hebrew letters; English becomes uppercase. Names are labels, not unique
accounts. Each completed run can appear separately, even with the same name.
Scores sort descending, with earlier submissions first on ties. The submitted
result's rank is shown even when it falls outside the top ten.

The shared browser component is `src/kit/leaderboard.js`. Call `begin()` when a
game starts and `finish(score, { durationMs, strikes, knocked })` when it ends. Other games can opt in with their own
game ID and scoring rule in `server/app.mjs`. Published standalone artifacts hide
this feature because their host has no same-origin API. Personal bests continue to
use the existing localStorage keys, independently of shared score availability.

## API and storage

- `GET /api/leaderboards/main` returns `{ entries: [{ id, game, name, score, createdAt, rank }] }`.
- `POST /api/leaderboards/main/runs` creates a four-hour run with a random bearer
  token. Only its SHA-256 hash is stored; the browser keeps the token in memory.
- `POST /api/leaderboards/main` accepts `{ submissionId, name, score, runId,
  runToken, durationMs, strikes, knocked }` and returns `{ entry }`.
- Each run may save one score. A transaction locks the run, verifies its token,
  expiration, scoring equation, elapsed time and conservative gameplay bounds.
  Offline runs retain personal bests but cannot publish a shared score.
- `submissionId` is a UUID v4 generated once per saved run. Retries of the same
  payload return the original result; changed payloads return 409. The client
  freezes the submitted name until the next run, including after a lost response.
- PostgreSQL stores all accepted results in `leaderboard_scores`. The migration
  schema is additive and serialized with a transaction advisory lock. Run
  `MIGRATION_DATABASE_URL=... node server/migrate.mjs` separately before a release.
  The web process never runs schema changes, and refuses administrative roles in production.
- Queries use bound parameters. The server validates IDs, names and each game's
  score range/step, limits request bodies and request rates, and returns generic
  errors. This is a casual arcade leaderboard: client-reported scores are not
  authoritative proof of gameplay or a competition-grade anti-cheat system. A bot
  can still wait and submit plausible results; stronger proof requires server-side
  gameplay simulation.
- Each server instance limits reads to 180 requests/minute and writes to 30/minute
  per client IP. In production it trusts one proxy hop (Railway's edge); when the
  browser uses the direct API origin, its requests bypass the /kids/ proxy. Limits
  reset on a server restart. Run creation is limited to 15/minute/IP, all bowling
  leaderboard requests to 600/minute/instance, and all APIs to 12,000/minute/instance.
  Database quotas persist across restarts/replicas: 5,000 runs and 2,000 scores per
  UTC day. At most 64 transactions per process may be running or waiting.
- Database insert triggers enforce ceilings of 50,000 saved scores, 2,000 active
  run tickets, 2,000 birthday rooms and 100,000 birthday players. Expired tickets
  are removed on run creation. Existing scores and rooms are never automatically
  removed. When capacity is full, administrators must review/archive data or
  deliberately raise the cap; the game remains playable without score saving.
- Top-ten database reads are coalesced/cached for two seconds and invalidated on
  saves. Health reads are coalesced/cached for five seconds and globally limited
  to 120/minute/instance. These controls bound application/database work; they do
  not replace an upstream network-level DDoS service.
- Database credentials exist only in the server's `DATABASE_URL`, never Vite
  variables or browser code. Browsers receive no-store API responses.

## Development and checks

Install the small server dependency set with `npm ci --prefix server`. Start a
local PostgreSQL database, migrate it with the separate administrator connection,
then run `DATABASE_URL=... npm run dev:server` and
`npm run dev` in another terminal. Vite forwards `/api` to port 5200. Without
DATABASE_URL the dev server serves games and returns an unavailable message for
shared scores. Production requires a restricted DATABASE_URL and an already migrated schema.

`TEST_DATABASE_URL=... npm run test:server` runs real PostgreSQL integration tests.
**Use a disposable database**: these tests truncate `leaderboard_runs` and `leaderboard_scores` between
cases. The variable deliberately differs from production's DATABASE_URL.
`npm test -- tests/leaderboard.spec.js` tests the browser flow, offline errors,
retry identity, keyboard entry, Hebrew text and small-phone layouts.

## Railway

The existing web service now runs Node and Express instead of Caddy, serving both
the built games and `/api`. HTML revalidates, hashed assets remain immutable,
compression is enabled, and missing assets still return 404. Docker verifies the
eight-game site after building it. `/healthz` checks the database connection.

Add a PostgreSQL service in the same production project. Run `server/migrate.mjs` and apply
`server/permissions.sql` with its administrator, set a generated password on
`marker_games_web`, and give the web service that role's private `DATABASE_URL`.
Keep the administrator connection on the database service, outside the web service.
Use the private connection URL. Enable volume backups in Railway for recovery.
Set the web service's `VITE_LEADERBOARD_API_ORIGIN` to
`https://bowling-escape-production.up.railway.app` and `LEADERBOARD_ALLOWED_ORIGINS`
to `https://matanbob.com`. The former is a public build argument; the latter is
the explicit browser origin allowlist. No cookies or credentials are sent.
Follow the README's clean-source release workflow and verify both the Railway
domain and `https://matanbob.com/kids/`, including saving on one browser and reading
the result in another. The /kids/ proxy forwards reads but rejects POSTs, so the
production browser uses the direct Railway API with CORS preflight support. Local
development defaults to a relative API URL. The database itself stays private.
