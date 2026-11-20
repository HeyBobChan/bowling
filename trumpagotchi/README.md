# Trumpagotchi

A virtual pet that becomes more himself the better you look after him.

He hatches from a golden egg as **Regular Don**: brown hair, grey suit, short tie, polite to a
fault. Feed him, flatter him and keep him glowing, and he climbs fifty levels of
*tremendousness*. The hair rises and turns gold, the glow deepens, the tie creeps toward the
floor, the office fills with gold, and the way he talks goes from
"Thank you. That hamberder was very nice." to
"The GREATEST hamberder in the HISTORY of hamberder! People are saying it!"

Neglect him and the opposite happens: he becomes humble and reasonable. Nobody wants that.

**It is a parody.** Every line he "says" is invented. It is not affiliated with or endorsed by
any real person, campaign, company or toy.

## Play it

Open `index.html` in a browser. That is the whole install. To serve it properly (needed for
the installable, offline app):

```bash
npm start            # http://localhost:8080, no dependencies
```

For one file you can double-click, email or drop on any host:

```bash
npm run build:single # writes dist/trumpagotchi.html (about 220 KB)
```

## How it works

| | |
|---|---|
| **Five needs** | Food, Ego, Fun, Glow (hair and tan) and Energy fade in real time, including while the page is closed. |
| **Tremendousness** | Every bit of care earns it; keeping all his needs above half earns more each hour. It never drops below the start of his current stage. |
| **Ten stages** | Regular Don, The Kid from Queens, The Developer, The Mogul, The TV Boss, The Candidate, The Nominee, The 45th (level 45, new oval office), The 47th (level 47), Tremendous Form (level 50). |
| **Five voices** | Humble, Confident, Boastful, Tremendous, MAXIMUM. Every situation has lines in all five: about 700 in total, so he rarely repeats himself. |
| **Things to do** | Feed (the salad gets tariffed), praise (honesty gets you fired), groom, post (he drafts, you publish), golf, deal-making, rallies, a daily briefing that ends in a signed executive order. There are 70 briefings, so more than two months pass before one comes round again. |
| **Money** | He earns licensing income every hour, up to 12 hours while you are away. Spend it on twelve permanent pieces of decor, each with a perk. |
| **The long game** | Daily streaks, 72 executive orders to collect (one a day), 37 trophies, and at level 50 he can run for another term: back to level 1 with everything kept and 25% more of everything, as many times as you like. |
| **The calendar** | Twenty special days, each with its own greeting, a one-off briefing and, mostly, something in the room: New Year, Groundhog Day, the big game, Valentine's, Presidents' Day, St. Patrick's (green tie), April Fools', Easter, National Hamberder Day, his birthday, the Fourth, Labor Day, Halloween, Thanksgiving week (the turkey pardon), Black Friday, all of December, New Year's Eve, any Friday the 13th, and February 29th. |
| **Every device** | Optional cloud save: a secret keeper code puts the same pet on any phone or computer. No account. |
| **If you vanish** | He sleeps through the night on his own. A day or two of neglect turns him humble; after three or four days he leaves a note and goes golfing, and you can win him back. He never dies. |

Pacing, from the simulated players in the tests: checking in four times a day reaches level 50
in about four weeks, three times a day in about seven, once a day in about fifteen.

## It is built to stay up

- **The game needs no backend.** No accounts, no tracking. The pet lives in the browser's
  `localStorage`, and every file is static. Cloud saves (below) are an optional extra; with
  them off, hosting costs whatever static files cost.
- **Installable and offline.** A web app manifest and a service worker make it a home-screen
  app that works with no signal.
- **Saves are versioned and defensive.** Fields added later are filled in on load, odd values
  are clamped, a corrupt save starts a new egg instead of a blank page, and the clock moving
  backwards does nothing.
- **No build step, and one dependency** (`pg`), loaded only when a database is configured.

Limit worth knowing: alerts ("he is hungry") only fire while the page is still open in the
background, since real push needs more server than this has.

## How people keep their own pets

Every visitor gets their own pet automatically: it is saved in their browser. Nothing to
sign up for. Two things move a pet beyond that one browser:

- **Cloud save** (Settings, "Take him everywhere"). Turning it on gives the pet a secret
  20-character *keeper code*. Enter the code on another phone or computer, or open the link
  the game offers, and the same pet lives there too. Every change is sent to the server
  within a few seconds and fetched by the other devices when they next look. If two devices
  both changed him while apart, the keeper is asked which one carries on; nothing is merged
  or dropped silently. Sound and alert settings stay with each device.
- **Save code** (Settings, "Move him by hand"): a snapshot you copy and paste. No server.

There are no accounts, emails or passwords. Whoever holds the keeper code can play the pet,
so it is shown hidden, can be replaced at any time (which unlinks every other device), and
the cloud copy can be deleted from Settings. A lost code cannot be recovered if no device
still has it.

### What the server stores

One row per cloud-saved pet in `trumpagotchi.pets`: the save exactly as the game writes it
(the pet's name and progress), a revision number, two timestamps, and a SHA-256 hash of the
keeper code. Not the code itself, no addresses, nothing about the person. Pets nobody has
saved for a year and a half are let go.

### Kept apart in the database

Trumpagotchi shares a PostgreSQL server with other applications, so it keeps to itself:

- Everything it owns is in its own **schema, `trumpagotchi`**, and every query names it.
- The web process logs in as **`trumpagotchi_app`**, a login that can read and write rows
  in that schema and nothing else: no other schema's tables, no creating or dropping
  anything, ten connections at most, five-second statements. It is never given an
  administrator's connection.
- `server/migrate.mjs` is run separately, with an administrator, to create the schema, the
  table and that login. It touches nothing outside them. Given the app login as well, it
  finishes by proving the separation and prints `ISOLATION OK` (or the list of what leaked).

```bash
MIGRATION_DATABASE_URL=postgres://admin... APP_DB_PASSWORD=... \
APP_DATABASE_URL=postgres://trumpagotchi_app:...  npm run migrate
```

### The API

Under `api/`, relative to the page, JSON in and out, never cacheable:
`GET status`, `POST pets` (returns a new keeper code), and with `Authorization: Bearer <code>`:
`GET pet`, `PUT pet` (with the revision it was based on; answers 409 and the newer pet if
someone else saved first), `POST pet/key` (new code), `DELETE pet`. Limits per visitor and
per pet keep a script from filling the table; the total number of pets is capped too.

| Variable | |
|---|---|
| `DATABASE_URL` | The `trumpagotchi_app` connection. Unset: cloud saves are off and the game runs as before. |
| `PROXY_KEY` | Shared with a reverse proxy in front; with it the proxy may report the visitor's address in `x-tg-client-ip`. |
| `CLIENT_IP_HEADER` | A header a trusted edge sets to the visitor's address (`x-real-ip` on Railway). Unset: the connection's address. |
| `PUBLIC_URL` | Where visitors reach the page, for absolute link-preview tags. |
| `CLOUD_STORE=memory` | Keeps pets in memory, for tests and local tinkering. Refused in production. |

## Where it is live

**https://matanbob.com/trumpagotchi/** is the address to give people.

It runs on Railway, in the `matanbob` project, as its own service named `trumpagotchi`
(Dockerfile build, health check on `/healthz`), using that project's Postgres through the
restricted login above. matanbob.com forwards `/trumpagotchi/` to it, read-only apart from
the cloud-save API (that route lives in `HeyBobChan/personal_website`). The service also
answers directly at https://trumpagotchi-production.up.railway.app.

Like the other services in that project it takes source uploads, so a GitHub push alone
does not publish. To release, upload the committed contents of this folder to that service
(with the Railway CLI: `railway up --service trumpagotchi` from this folder, linked to the
`matanbob` project), wait for Railway to report success, then load the page and check
`/trumpagotchi/api/status`. Run the migration first if `server/schema.sql` changed.

Without cloud save a pet is saved per browser *and per address*: one hatched at the Railway
address is not the pet at matanbob.com. That is why there is one address to share.

## Put it somewhere else

Any static host works: upload this folder (the game is `index.html`, `manifest.webmanifest`,
`sw.js`, `css/`, `js/`, `icons/`). Cloud save then simply does not appear.

- **Node / Railway / Fly / Render:** `npm start` runs `server.mjs`, which serves only those
  files, answers `/healthz`, and reads `PORT`. Add a database as above for cloud saves.
- **Docker:** `docker build -t trumpagotchi . && docker run -p 8080:8080 trumpagotchi`
- **GitHub Pages, Netlify, Cloudflare Pages, S3:** publish the folder as is. All paths are
  relative, so it also works from a subpath.

Set `PUBLIC_URL` (for example `https://example.com/trumpagotchi/`) on the Node server and
the link-preview tags use absolute addresses, which chat apps and social sites need. The page
itself stays relative, so it works behind a path prefix or a reverse proxy without changes.

When you change a file, bump `VERSION` in `sw.js` so installed copies refresh their cache.

## Files

```
index.html            the page
css/style.css         navy, gold, one long red tie
js/content.js         everything he says, eats, owns and signs
js/game.js            the simulation: needs, time, levels, saves (no DOM; runs in Node)
js/art.js             the pixel art, drawn in code; the pet is parametric by level
js/minigames.js       golf, the rally, the deal
js/audio.js           square-wave blips, no audio files
js/cloud.js           cloud save: the keeper code and talking to the server
js/ui.js              HUD, sheets, speech, modals, the loop
sw.js                 offline cache (never caches a save)
server.mjs            static files, plus the cloud-save API when a database is configured
server/api.mjs        the API: codes, limits, validation (no database code)
server/store-pg.mjs   pets in PostgreSQL; server/store-memory.mjs for tests
server/schema.sql     the trumpagotchi schema; permissions.sql, the restricted login
server/migrate.mjs    creates both, then proves the login is fenced in
tools/                single-file build, icon and preview-image generator
tests/                simulation and API tests (Node), two browser tests
```

## Tests

```bash
npm test             # 32 rule, balance and content tests and 10 cloud-save API tests, plain Node
npm run test:browser # headless Chromium: the first minutes (12 checks), then two devices sharing a pet
```

Set `TEST_DATABASE_URL` to the `trumpagotchi_app` connection of a migrated database and
`npm test` runs the cloud-save tests against PostgreSQL as well. The browser tests and
`npm run icons` need Playwright with Chromium available; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`
to use a particular browser binary.

Add `?debug` to the URL for a time-travel panel at the bottom of Settings (skip hours, add
levels). `?reset` starts from a fresh egg, on `localhost` or a local file only: on a public
address a link must not be able to erase a visitor's pet.

## Tuning

The numbers that shape the experience are in `js/game.js`: need decay rates in `step`, the
level curve in `G.cumXp`, income in `G.incomePerHour`, and the thresholds for humility and
storming off. The pacing test at the bottom of `tests/sim.test.mjs` fails if a change makes
the game much faster or slower than intended.

## Adding writing

Everything he says, signs and is told is plain data in `js/content.js`:

- `C.LINES`: what he says in each situation, as five lists, humble to MAXIMUM. Add a line to
  any list. `{food}`, `{n}`, `{tariff}`, `{hours}`, `{real}` and `{claimed}` are filled in
  only for the situations that already use them.
- `C.POST`: word banks and templates for his posts, again per register, plus the 3 AM ones.
- `C.BRIEFINGS`: the daily briefings. Each is a situation and three choices, each with its
  effects and what happens. Keep the tremendousness between 24 and 40 so pacing holds.
- `C.SEASONS`, `C.SEASON_BRIEFINGS` and `C.seasonFor`: the special days.
- `C.ORDERS`: the collectible orders. Only ever add to the end: saves refer to them by position.
- `C.NEWS`, `C.COMPLIMENTS`, `C.AWAY_EVENTS`, `C.HUMBLE_LINES` and the deal lists.

`npm test` checks the writing is complete and consistent: five registers everywhere, three
choices per briefing, no placeholder the game will not fill, a briefing and a greeting for
every special day, and that every special day actually occurs.

The voice stays affectionate and silly: the hair, the tie, the superlatives, the hamberders.
Every line is invented. It does not quote him, and it stays away from real people other
than him and from anything that is not funny in real life.
