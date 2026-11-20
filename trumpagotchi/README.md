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
| **Five voices** | Humble, Confident, Boastful, Tremendous, MAXIMUM. Every line has all five. |
| **Things to do** | Feed (the salad gets tariffed), praise (honesty gets you fired), groom, post (he drafts, you publish), golf, deal-making, rallies, a daily briefing that ends in a signed executive order. |
| **Money** | He earns licensing income every hour, up to 12 hours while you are away. Spend it on twelve permanent pieces of decor, each with a perk. |
| **The long game** | Daily streaks, 36 executive orders to collect (one a day), 35 trophies, seasonal events (the Thanksgiving turkey pardon, Christmas, his birthday, the Fourth, and more), and at level 50 he can run for another term: back to level 1 with everything kept and 25% more of everything, as many times as you like. |
| **If you vanish** | He sleeps through the night on his own. A day or two of neglect turns him humble; after three or four days he leaves a note and goes golfing, and you can win him back. He never dies. |

Pacing, from the simulated players in the tests: checking in four times a day reaches level 50
in about four weeks, three times a day in about seven, once a day in about fifteen.

## It is built to stay up

- **No backend, no accounts, no tracking, no network calls.** The pet lives in the browser's
  `localStorage`. Hosting cost is whatever static files cost.
- **Installable and offline.** A web app manifest and a service worker make it a home-screen
  app that works with no signal.
- **Saves are versioned and defensive.** Fields added later are filled in on load, odd values
  are clamped, a corrupt save starts a new egg instead of a blank page, and the clock moving
  backwards does nothing. A save code in Settings moves him to another browser or device.
- **No dependencies and no build step.** Nothing to keep patched.

Limits worth knowing: alerts ("he is hungry") only fire while the page is still open in the
background, since real push needs a server. Saves do not sync between devices on their own.

## Put it online

Any static host works: upload this folder (the app is `index.html`, `manifest.webmanifest`,
`sw.js`, `css/`, `js/`, `icons/`).

- **Node / Railway / Fly / Render:** `npm start` runs `server.mjs`, which serves only those
  files, answers `/healthz`, and reads `PORT`. On Railway, point a service at this folder as
  its root directory; `railway.json` and the `Dockerfile` here are picked up.
- **Docker:** `docker build -t trumpagotchi . && docker run -p 8080:8080 trumpagotchi`
- **GitHub Pages, Netlify, Cloudflare Pages, S3:** publish the folder as is. All paths are
  relative, so it also works from a subpath.

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
js/ui.js              HUD, sheets, speech, modals, the loop
sw.js                 offline cache
server.mjs            optional zero-dependency static server
tools/                single-file build, icon and preview-image generator
tests/                simulation tests (Node) and a browser smoke test
```

## Tests

```bash
npm test             # 28 rule and balance tests, plain Node
npm run test:browser # plays the first minutes in headless Chromium
```

The browser test and `npm run icons` need Playwright with Chromium available; the app itself
needs nothing.

Add `?debug` to the URL for a time-travel panel at the bottom of Settings (skip hours, add
levels), and `?reset` to start from a fresh egg.

## Tuning

The numbers that shape the experience are in `js/game.js`: need decay rates in `step`, the
level curve in `G.cumXp`, income in `G.incomePerHour`, and the thresholds for humility and
storming off. The pacing test at the bottom of `tests/sim.test.mjs` fails if a change makes
the game much faster or slower than intended. New lines, foods, decor, briefings, orders and
trophies are plain data in `js/content.js`; the content test checks they are complete.
