# Shared arcade scores

Bowling (`main` in games.json) offers an optional score submission at game over and
a public top-ten list on the intro and result screens. Names contain exactly three
English or Hebrew letters; English becomes uppercase. Names are labels, not unique
accounts. Each completed run can appear separately, even with the same name.
Scores sort descending, with earlier submissions first on ties. The submitted
result's rank is shown even when it falls outside the top ten.

The shared browser component is `src/kit/leaderboard.js`. Call `begin()` when a
game starts and `finish(score)` when it ends. Other games can opt in with their own
game ID and scoring rule in `server/app.mjs`. Published standalone artifacts hide
this feature because their host has no same-origin API. Personal bests continue to
use the existing localStorage keys, independently of shared score availability.

## API and storage

- `GET /api/leaderboards/main` returns `{ entries: [{ id, game, name, score, createdAt, rank }] }`.
- `POST /api/leaderboards/main` accepts `{ submissionId, name, score }` and returns `{ entry }`.
- `submissionId` is a UUID v4 generated once per saved run. Retries of the same
  payload return the original result; changed payloads return 409. The client
  freezes the submitted name until the next run, including after a lost response.
- PostgreSQL stores all accepted results in `leaderboard_scores`. The startup
  schema is additive and serialized with a transaction advisory lock.
- Queries use bound parameters. The server validates IDs, names and each game's
  score range/step, limits request bodies and request rates, and returns generic
  errors. This is a casual arcade leaderboard: client-reported scores are not
  authoritative proof of gameplay or a competition-grade anti-cheat system.
- Each server instance limits reads to 180 requests/minute and writes to 30/minute
  per client IP. In production it trusts one proxy hop (Railway's edge); when the
  browser uses the direct API origin, its requests bypass the /kids/ proxy. Limits
  reset on a server restart. Revisit the rate-limit store if scaling.
- Database credentials exist only in the server's `DATABASE_URL`, never Vite
  variables or browser code. API responses are not cached.

## Development and checks

Install the small server dependency set with `npm ci --prefix server`. Start a
local PostgreSQL database and run `DATABASE_URL=... npm run dev:server`, then
`npm run dev` in another terminal. Vite forwards `/api` to port 5200. Without
DATABASE_URL the dev server serves games and returns an unavailable message for
shared scores. Production requires DATABASE_URL and initializes the schema before
listening.

`TEST_DATABASE_URL=... npm run test:server` runs real PostgreSQL integration tests.
**Use a disposable database**: these tests truncate `leaderboard_scores` between
cases. The variable deliberately differs from production's DATABASE_URL.
`npm test -- tests/leaderboard.spec.js` tests the browser flow, offline errors,
retry identity, keyboard entry, Hebrew text and small-phone layouts.

## Railway

The existing web service now runs Node and Express instead of Caddy, serving both
the built games and `/api`. HTML revalidates, hashed assets remain immutable,
compression is enabled, and missing assets still return 404. Docker verifies the
seven-game site after building it. `/healthz` checks the database connection.

Add a PostgreSQL service in the same production project. On the web service set
`DATABASE_URL=${{Postgres.DATABASE_URL}}` using the actual database service name.
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
