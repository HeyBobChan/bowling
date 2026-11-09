# חיים בצבע — חוגגים לחנה

A Hebrew birthday game for phones and a shared host screen, at `/chana.html`
(`/kids/chana.html` through matanbob.com). It appears in the main game roster.

## Running the birthday

1. Connect a laptop to the TV/projector, open the game and choose **ניהול המשחק במסך הגדול**.
2. Create a room and save the **private host recovery link**. Share the player QR code or player link only.
3. Everyone enters a name on their phone. Confirm the participant list, then start. Joining closes at that point.
4. Each person gets all 52 dated works in an independent shuffle. Hold a painting briefly and drag it into place on a phone, or drag directly with a mouse. The page scrolls near its edges and numbers update during the move. Undo is available. Tap an image for a larger view, an optional exhibition-name guess, or **שינוי מיקום** as a keyboard-accessible alternative.
5. Everyone submits once. Submitted answers are locked. The host cannot reveal until every active participant has submitted. If someone leaves, explicitly remove that unsubmitted participant.
6. Review 18 exhibitions together. The host advances by buttons or left/right arrows. Phones follow the host. The review panel shows each person's guesses and placements; the host may approve a close spelling for bonus credit.
7. Reveal the scoreboard, then download the JSON results if desired. Rooms remain accessible for seven days. Rehearse with a few phones on the venue's Wi-Fi before the birthday.

No time limit is imposed. Internet is needed to join, sync, submit and follow review.
Drafts also persist on the same phone/browser, so a failed connection does not lose
work. Failed submissions remain retryable and are never presented as successful.

## Dates and scoring

There are 52 works from 18 exhibitions, spanning 1995–2025. These are **exhibition
years**, not invented painting creation dates. Six undated extras are excluded.
The catalogue includes the official Hebrew names and accepted spelling aliases.

Chronology earns 0–100 points: the percentage of correctly ordered definite
earlier/later pairs, rounded to an integer (1,242 pairs). Same-year and overlapping
ranges impose no internal ordering. Each distinct exhibition correctly named earns
2 points, at most 36. Multiple correct guesses within an exhibition earn one bonus.
Niqqud, punctuation, spaces and Latin letter case are ignored. The host can correct
bonus judgments during shared review. Equal totals share a rank.

## Implementation and hosting

- `chana.html`, `src/chana/`: client UI and locally bundled MIT-licensed QR generator.
- `public/art/chana/`: optimized full-frame WebPs with opaque filenames, about 2.5 MB total.
- `server/chana-catalogue.json`: private answer catalogue and provenance. Never serve it as a static file.
- `server/chana-game.mjs`: authoritative scoring and catalogue filtering.
- `server/chana-api.mjs`: room lifecycle, authentication, save versions and review gating.
- `server/chana-db.mjs` and `chana-router.mjs`: PostgreSQL prepared statements and Express integration.
- `server/schema.sql`: additive `chana_rooms` and `chana_players` tables, using the existing Railway PostgreSQL service. Per-room transaction advisory locks keep concurrent submissions, joins and reveals consistent.

Player/host capabilities are UUIDs stored hashed server-side. Host recovery uses
URL fragments. Tokens never appear in public room responses. No player accounts or
contact details are required. The browser receives no dates, exhibition names or
chronologically ordered catalogue until shared review starts.

The existing `VITE_LEADERBOARD_API_ORIGIN` build setting points writes directly at
Railway because the matanbob.com `/kids/` proxy forwards reads but rejects POSTs.
Requests use `/api/leaderboards/chana`, the prefix permitted by the existing `/kids/` Content Security Policy. The API's explicit origin allowlist is retained. The Chana route supports CORS
preflights with Authorization and PUT, and uses participant-based limits so guests
sharing Wi-Fi do not exhaust the arcade leaderboard's shared-IP limit.

## Validation

Run `TEST_DATABASE_URL=... npm run test:server` against a disposable **UTF-8**
PostgreSQL database. It covers scoring/ties/aliases, independent shuffles, authorization,
hidden answers, idempotent create/join/submit, stale-save protection, custom-domain
CORS and large drafts, removals, review gating, bonus corrections and 40 simulated
concurrent participants, as well as existing arcade leaderboard regression tests.
Run `npm run build` and `npm run test:site` for all eight pages.
Run `npm run test:chana-drag` for RTL drop positions, grid gaps, incomplete rows and scrolling offsets.

Browser rehearsal covers a host and two participants, a 390px phone layout, moving,
undo, image zoom, name guesses, refresh recovery, disconnected submission/retry,
shared review, bonus adjustment, results and export. The 40-participant test is a
server simulation, not a physical-device or venue-network load test.

All artwork is © Chana Goldberg, sourced from https://www.chanagoldberg.com/.
