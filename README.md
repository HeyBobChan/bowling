# 🎳⚽🦖🥊🎿🤸 המשחקייה של ב׳3 (The Marker Games)

The game roster is at `/` (index.html), with original artwork and links to every game.

Six games designed by kids, drawn with markers, and brought to life. Every
game is a page of the same little kit: cel-shaded "marker on paper" rendering, one
keyboard or a touch pad, one or two players, and a headless test that drives it.

| Game | Page | The kid's rule |
|---|---|---|
| 🎳 **כדור באולינג בורח** (Bowling Escape) | `/bowling.html` | The world only moves when the ball moves. Every strike is worth ten, the crowd of monsters keeps growing the longer you roll, and the lane twists and turns forever. |
| ⚽ **פנדלים בנגיחה** (Header Penalties) | `/pendel.html` | Read the keeper's lean, head the lob into the corner he isn't. Five kicks a round; two players can take turns as keeper. |
| 🦖 **דינו במבוך** (Dino Maze) | `/dino.html` | Eat fifteen little dinos in an endless maze, dodge the dragon's flame, find the exit before the dragons get angry. |
| 🥊 **חתול ביער** (Punch Game) | `/punch.html` | Stretch-punch the whole forest, dash out of trouble, survive wave after wave. A second cat can join. |
| 🎿 **רוקרוק בשלג** (Kelpie Downhill) | `/ski.html` | Our real dog, as a 3D model, skis an endless mountain that gets harder zone by zone: follow the groomed lane through the gates (a streak multiplies them), grab the bones, jump the fallen logs, launch off kickers and spin. Three bones, and a golden one now and then. |
| 🤸 **קופצים מעל הרעים** (Jump Over the Bad Guys) | `/jump.html` | Pick one of three box characters, walk both ways and jump over the bad guys who want to eat you — flipping feet, head, feet, head. Climb the green towers; the cute one double-jumps, the scary one slams down with a roar, the regular one glides on its wing. Once in a while the monster king stomps in and blocks the way: dodge his hands, then climb his sleeping hand and arm and bounce off his head to get over him. A 2D canvas game, not three.js. |

The drawings the games were built from are in [`drawings/`](drawings/README.md); the
one-page design sheets ("verb sheets") are in [`design/`](design/README.md).

## Run it

```bash
npm install
npm run dev
```

`npm run build` builds all pages into `dist/`. `npm run build:artifacts` builds each game
as a single self-contained HTML fragment in `artifacts/`, ready to publish (cross-links
then point at the published artifact URLs in `games.json`). `npm test` runs the headless
balance checks in Chrome.

`npm run test:site` checks the production roster, every game entry point, return
links and asset references after a build. The roster content lives in each game's
`lobby` field in `games.json` and is rendered to static HTML by Vite.

Performance regressions also exercise the real renderer: skiing caps its drawing
buffer at 2× pixel density, including rotation and display changes. The forest
game reuses its six fighter models across waves and restarts so graphics memory
and outline bookkeeping stay bounded; match state and physics bodies still reset.

## Controls

- **One player:** arrows or WASD to move · **Space** = the action (shoot / head / punch) ·
  **Shift** = dash (punch game) · Enter or Space starts and restarts.
- **Two players** (penalties, punch): player 1 = arrows + Enter + right Shift, player 2 =
  WASD + Space + left Shift.
- **Touch:** drag on the left half of the screen to move, tap the buttons on the right.
- 🔊 in the corner mutes everything, and remembers.

## How it's built

- `games.json` — the one list of games: page, title, colour, published artifact URL. The
  Vite config, the "more games" links on every intro card and the artifact build all read
  it, so adding a game touches one file plus its own page and source.
- `src/kit/` — the shared engine:
  - `app.js` renderer, scene, lights, marker outlines (three's `OutlineEffect`) and the
    frame loop; `?sim` in the URL stops the loop so tests can step it by hand
  - `toon.js` cached cel materials, per-material outline tints, blob shadows, hull
    outlines for instanced props, hand-drawn textures, wobble
  - `input.js` one- or two-player keyboard maps, edge-triggered actions, touch pad
  - `hud.js` badges, the centre flash, overlays, manifest links, best scores, mute
  - `audio.js` beeps, noise bursts, a master mute and a tiny generative music box
  - `juice.js` hitstop, camera shake, floating score numbers, squash-and-stretch
- `src/characters/` — the punch game's fighters, each built from its drawing.
- `src/main.js`, `pendel.js`, `dino.js`, `punch.js` — one file per game; `src/track.js` is
  the bowling game's endless winding lane (straights and bends, lane coordinates, the
  brown edge-line ribbons).
- `src/jump.js` + `src/jump-art.js` — the jump game, the one 2D page: a Canvas 2D side-scroller
  whose marker art (wobbly boxes, scribble fills, line boil, the pencil-scribble background) is
  drawn in code from the five `drawings/jump-game-*` pages; it uses the kit's HUD, input and audio
  but not `app.js`/three.js.
- `src/ski.js` — the ski game; Babylon.js (`@babylonjs/core`) instead of three.js because the dog
  model (`src/assets/dog.glb`, see `design/ski.md`) was exported for Babylon, but it uses the kit's
  HUD, input, audio and `?sim` hook like every other page.
- `tests/` — Playwright specs that load each page with `?sim`, drive
  `window.__<game>.step(dt)` and assert the balance rules from the design sheets.

## Publish flow

### Railway website

The live website is https://bowling-escape-production.up.railway.app, also served
through https://matanbob.com/kids/. The release branch is `main` in
[`HeyBobChan/bowling`](https://github.com/HeyBobChan/bowling). Upstream game development
continues in [`BobYeger/bowling`](https://github.com/BobYeger/bowling).

In the current local checkout, `origin` points to BobYeger's repository and `fork`
points to HeyBobChan's. To bring in upstream changes, start with a clean checkout,
fetch both remotes, create a new task branch from `fork/main`, and merge
`origin/main`. Keep local changes on their own branch or back them up first.

```bash
git fetch --all
git switch -c codex/sync-games-upstream fork/main
git merge origin/main
npm test -- --workers=1
npm run build
npm run test:site
git push -u fork HEAD
```

Use a fresh task branch name for each sync. Open a pull request targeting
`HeyBobChan/bowling:main` and merge it with a merge commit to preserve upstream
history. This keeps later syncs from presenting already-integrated commits again.

Railway currently receives CLI source uploads; a GitHub push alone does not
publish. Deploy a clean source archive of the tested, merged `fork/main` commit
to project `39d512ee-cd58-40ae-a335-494cb54b2caf`, service
`76d27ee0-de6b-4d82-88ac-0980721a2a24`, production environment
`0b5a2b7c-93e8-491c-9e57-4daefa1e5958`. Verify the deployment reaches `SUCCESS`
and check the roster, games and return links through `/kids/` afterward.

### Standalone artifacts

`npm run build:artifacts -- <id>` writes `artifacts/<id>.html`; publish it with the
Artifact tool using the `artifact` URL from `games.json` to keep the same link.

🤖 Built with [Claude Code](https://claude.com/claude-code)
