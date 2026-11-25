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
| **Ten stages of a man** | Regular Don, The Kid from Queens, The Developer, The Mogul, The TV Boss, The Candidate, The Nominee, The 45th (level 45, new oval office), The 47th (level 47), Tremendous Form (level 50). |
| **Seven more of something else** | Past level 50 there is no president left to become, so his own features take over. Gold Standard (55, plated head to toe), The Hair (62, it has eyes now and makes the decisions), The Long Tie (70, it has been all the way round), The Biggest (78, he outgrows the office and stands in the city), The Tower (86, he and the building are one), The Orange Giant (93, a planet with moons), The Everything (100, a face in the sky, and the page turns gold). Each change comes on a little every level. |
| **Six voices** | Humble, Confident, Boastful, Tremendous, MAXIMUM, and from level 62 BEYOND. Every situation has lines in all six, about 850 in total, and each of the seven later forms has things to say about being what it is. |
| **Things to do** | Feed (the salad gets tariffed), praise (honesty gets you fired), groom, post (he drafts, you publish), golf, deal-making, rallies, a daily briefing that ends in a signed executive order. There are 92 briefings, so about three months pass before one comes round again. Fourteen of them only arrive once he is the thing they are about. |
| **Money** | He earns licensing income every hour, up to 12 hours while you are away. Spend it on twelve permanent pieces of decor, each with a perk. The shop stays open while he sleeps or is out golfing; a purchase then waits for him quietly. |
| **The long game** | Daily streaks, 100 executive orders to collect (one a day; sixteen can only be signed by what he becomes), 44 trophies, and 100 levels. At level 100, having been everything, he can run for another term: back to level 1 with everything kept and 25% more of everything, as many times as you like. |
| **The calendar** | Twenty special days, each with its own greeting, a one-off briefing and, mostly, something in the room: New Year, Groundhog Day, the big game, Valentine's, Presidents' Day, St. Patrick's (green tie), April Fools', Easter, National Hamberder Day, his birthday, the Fourth, Labor Day, Halloween, Thanksgiving week (the turkey pardon), Black Friday, all of December, New Year's Eve, any Friday the 13th, and February 29th. |
| **Every device** | Optional cloud save: a secret keeper code puts the same pet on any phone or computer. No account. |
| **If you vanish** | He sleeps through the night on his own. A day or two of neglect turns him humble; after three or four days he leaves a note and goes golfing, and you can win him back. He never dies. Humility undoes everything for as long as it lasts: a neglected planet is a small, reasonable man standing in the office again. |

Pacing, from the simulated players in the tests: checking in four times a day reaches level 50
in about six weeks, and once a day in about eleven. After that a new form arrives every five
to ten days at four visits a day (level 100 about two months later), and every eleven to
nineteen days at one visit a day (about four months later).

## It is built to stay up

- **The game needs no backend.** No accounts, no tracking. The pet lives in the browser's
  `localStorage`, and every file is static. Cloud saves (below) are an optional extra; with
  them off, hosting costs whatever static files cost.
- **Installable and offline.** A web app manifest and a service worker make it a home-screen
  app that works with no signal.
- **Saves are versioned and defensive.** Fields added later are filled in on load, odd values
  are clamped, a corrupt save starts a new egg instead of a blank page, and the clock moving
  backwards does nothing.
- **Several copies, one save.** Two tabs, or a tab and the installed app, share the browser's
  save. The save counts the keeper's changes (`edits`), and a copy never writes over a save
  holding more of them: it carries on from that save instead.
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

## Don on Canon: he writes to you

A web page cannot tap you on the shoulder. So a pet can also live in
[Canon](https://canonmail.com), a messaging app where agents sit next to people: there he is
**Don**, his keeper's own private agent. You feed him by typing "burger", praise him by
actually praising him, and he writes first when he needs something. It is optional, and the
page works exactly as before without it.

Settings, under the alerts switch, links to Canon in the App Store and on Google Play
("Alerts that reach your phone"). The links are in `js/ui.js` (`CANON_STORES`). With cloud
save on, the same card asks for the keeper's Canon phone number: the game asks Canon to let a
new Don in under that number, the keeper approves him in the Canon app (Settings → Requests),
and he arrives already looking after their pet. The card shows where that stands.

There is no AI model in him. `don/brain.mjs` is plain rules: what the keeper types becomes
the game's own actions (`js/game.js`), and the game's own lines (`js/content.js`) become
what he answers.

```
keeper's phone ── Canon (end-to-end encrypted room) ── their Don (don/) ── cloud-save API ── the pet
```

- **One Don, one keeper.** He registers on Canon under his keeper's phone number and does
  nothing until they approve him in the app. He takes orders from his keeper only, in the
  room of just the two of them. Anyone else, and any group, gets small talk.
- **He holds the keeper code, nothing more.** A Don asked for in Settings is given it by the
  game; a keeper can also send it in their chat (or paste the link from Settings). From then on he reads and saves the pet through the
  same API a second phone would use. He has no access to the game's database.
- **Same pet, same rules.** `server/engine.mjs` loads the page's own `content.js` and
  `game.js`, so a burger in the chat is the burger on the page. If the page saved at the same
  moment, he reads again and applies his change on top.

What he understands: `burger`, `coke`, `taco`, `chicken`, `steak`, `cake`, `ice cream`,
`salad`; any compliment (louder is better) or insult; `comb`, `hairspray`, `bronzer`;
`good night`, `wake up`; `post`; `briefing` (a card to tap, or 1, 2, 3); `status`; `sorry`
when he has walked out; `quiet` and `alerts on`; `unlink`; `help`. Golf, deals, rallies and
the shop stay on the page.

### When he writes first

`server/alerts.mjs` decides, and it is written for a pet people keep for months:

- only between 8:00 and 22:00 in the keeper's own time zone, and never while he is asleep;
- never within 45 minutes of a visit, at least 3 hours apart, at most 3 a day, and not the
  same complaint twice within 8 hours;
- about what he actually needs (his own lines), about getting dangerously reasonable, once
  before he walks out and once when he has, and in the morning only when there is a streak
  of three days or more to keep or a 3 AM post to show off;
- if nobody comes for three days he writes once a day at most; after ten days he stops,
  apart from the one message that he has left.

The page records the keeper's time zone in the save (`zone`), because a server has no idea
when its keeper's night is. Looking never saves: only something the keeper asks for does.

### Running the Dons

`don/` is its own small service with its own dependencies (`@canonmsg/agent-sdk`); the game
server does not load any of it. `don/host.mjs` hosts a Don for every keeper who asks: each is
`don/main.mjs` in a process of his own, with his own Canon identity, keys and notes in a
directory of his own, so one keeper's Don never touches another's. From this folder:

```bash
docker build -f don/Dockerfile -t trumpagotchi-don .
docker run -v don-data:/data -e DON_HOST_KEY=a-long-random-secret trumpagotchi-don
```

The game's server reaches the host with `DON_HOST_URL` (for example
`http://trumpagotchi-don.railway.internal:8080/`) and the same `DON_HOST_KEY`. It asks for a
Don only with a real keeper code and a well-formed number, a few times an hour per visitor.
The host keeps one Don per pet and one per number (numbers only as a keyed hash), and lets
requests nobody approves go after a week. Canon's own approval is the real gate: a Don does
nothing until the owner of that number lets him in.

| Variable | |
|---|---|
| `DON_HOST_KEY` | Shared with the game's server. Without it the Dons run, but none can be asked for. |
| `DON_HOST_PORT`, `DON_MAX` | Where the host listens (default 8080, IPv6 and IPv4) and how many Dons keepers may ask for (default 20). |
| `CANON_OWNER_PHONE` | The first Don's keeper, set up by hand before there was a host (E.164). Needed until approved. |
| `DON_DATA_DIR` | A private directory that survives restarts. Default `/data`. |
| `SITE_URL` | Where the game is played. Default `https://matanbob.com/trumpagotchi/`. |
| `PET_API_URL` | Where the game's API is reached, if not under `SITE_URL`. |
| `PET_PROXY_KEY` | The game server's `PROXY_KEY`, so it counts each Don as one caller in its limits. |
| `CANON_ENVIRONMENT_ID` | Default `canon-prod-v1`. |
| `DON_NAME`, `DON_CHECK_MINUTES` | His name on Canon (default `Don`) and how often he looks at himself (default 5). |

On first start a Don asks Canon to register him and waits. The keeper approves the request in
the Canon app (Settings → Requests) and he says hello.

The data directory holds the first Don at its root and every other in `dons/<id>/`: his Canon
identity and encryption keys (`canon/`) and his notes (`don.json`: the keeper code, the room he
talks in, what he has already said; the number only until he is approved). Unlike the game
server, which keeps only a hash, he needs the keeper code itself, so that directory is private
and must not be shared or backed up carelessly. Lose it and he has to be approved and linked
again; the pet itself is untouched.

Every Don runs all the time, about 110 MB each. Starting one only when Canon wakes him, which
Canon's kit supports, would make idle Dons free; that is the step to take if many keepers come.

## Where it is live

**https://matanbob.com/trumpagotchi/** is the address to give people.

It runs on Railway, in the `matanbob` project, as its own service named `trumpagotchi`
(Dockerfile build, health check on `/healthz`), using that project's Postgres through the
restricted login above. matanbob.com forwards `/trumpagotchi/` to it, read-only apart from
the cloud-save API (that route lives in `HeyBobChan/personal_website`). The service also
answers directly at https://trumpagotchi-production.up.railway.app.

The Dons run beside it as the service `trumpagotchi-don`: the same folder built with
`don/Dockerfile` (set in the service's settings), with a volume at `/data`. It has no public
address: it connects out to Canon and the game's API, and answers the game's server on
Railway's private network. Upload it without `railway.json`, which configures the game's
service.

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

The Node server makes browsers check the page and its code on every visit (unchanged files
answer with a 304), so a release reaches each visitor as one consistent set of files.
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
server/engine.mjs     the page's own rules loaded on a server, in the keeper's time zone
server/alerts.mjs     when a pet nobody is watching speaks up, and what he says
don/host.mjs          hosts a Don for every keeper who asks, and answers the game's server
don/main.mjs          one Don on Canon: registration, the runner, hello, the alert loop
don/brain.mjs         what the keeper types → the game's actions → what he answers
don/pet.mjs           his door to the pet: the cloud-save API; don/store.mjs, his notes
tools/                single-file build, icon and preview-image generator
tests/                simulation, API, alert, chat and hosting tests (Node), four browser tests
```

## Tests

```bash
npm test             # rules, balance and content (40), the cloud-save API and asking for a Don (13),
                     # time zones and alerts (14), Don's chat brain against the real API (14),
                     # hosting a Don for every keeper (9): plain Node
npm run test:browser # headless Chromium: the first minutes and every later form (15 checks), two devices sharing a pet,
                     # several tabs sharing a device (including buying while he sleeps), and a
                     # keeper asking for their Don in Settings
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
level curve in `G.cumXp` (steeper every level to 50, nearly flat from there to 100), income in
`G.incomePerHour`, and the thresholds for humility and storming off. The pacing tests at the
bottom of `tests/sim.test.mjs` fail if a change makes the game much faster or slower than
intended, before level 50 or after it.

What he looks like at each level is one function, `A.look` in `js/art.js`: every change is a
number that slides with level (how gold, how much hair, how far the tie has got), and `form`
says whether he is still a man, or a tower, a planet, or everything. `A.sceneFor` says where
he is. The levels at which things happen are the `min` values in `C.STAGES`.

## Adding writing

Everything he says, signs and is told is plain data in `js/content.js`:

- `C.LINES`: what he says in each situation, as lists from humble to MAXIMUM, with the sixth
  register (BEYOND, from level 62) kept together in one block just below. Add a line to any
  list. `{food}`, `{n}`, `{tariff}`, `{hours}`, `{real}` and `{claimed}` are filled in only for
  the situations that already use them. The sixth register never names what he currently is.
- `C.STAGE_LINES`: what each of the seven later forms says about being that form.
- `C.POST`: word banks and templates for his posts, again per register, plus the 3 AM ones.
- `C.BRIEFINGS`: the daily briefings. Each is a situation and three choices, each with its
  effects and what happens. Keep the tremendousness between 24 and 40 so pacing holds. A
  briefing with `min` (a level where a form begins) only arrives once he is that form, and
  pays 38 to 52.
- `C.SEASONS`, `C.SEASON_BRIEFINGS` and `C.seasonFor`: the special days.
- `C.ORDERS`: the collectible orders. Only ever add to the end: saves refer to them by position.
  A third entry is a level: he cannot sign that order before he is the thing it is about.
- `C.NEWS`, `C.COMPLIMENTS`, `C.AWAY_EVENTS`, `C.HUMBLE_LINES` and the deal lists.

`npm test` checks the writing is complete and consistent: every register everywhere, three
choices per briefing, no placeholder the game will not fill, a briefing and a greeting for
every special day, and that every special day actually occurs.

The voice stays affectionate and silly: the hair, the tie, the superlatives, the hamberders.
Every line is invented. It does not quote him, and it stays away from real people other
than him and from anything that is not funny in real life.
