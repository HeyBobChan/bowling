# 🤸 Jump Over the Bad Guys — קופצים מעל הרעים

**Drawing:** `drawings/jump-game-1-characters.webp` (the rules, and the three characters to
choose from), `drawings/jump-game-2-bad-guys.webp` (the bad guy), `drawings/jump-game-3-background.webp`
(the pencil-scribble background), `drawings/jump-game-4-towers.png` (the green box towers),
`drawings/jump-game-5-monster-king.webp` (the monster king).

**Fantasy (the kids' words, from the page):** "There are characters down here that you choose
between, and there are bad guys that try to eat you, and you try to jump over them." Space
jumps. The box characters flip as they jump — "feet, head, feet, head".

**Player verbs:** walk both ways (arrows / A D; the joystick on a phone) · jump (hold for
higher) · flip (automatic, the way you're going, always lands feet-down) · climb
the green towers (a jump pressed against a wall too tall scrambles up its face) · bounce off
a bad guy's head · and each character's own move:
- **דמות חמודה** (cute, red): a second press in the air is a **double jump** — hands up.
- **דמות מפחידה** (scary, green): a second press in the air **slams down**; the landing
  **roars** and sends every bad guy nearby running away for two seconds.
- **דמות רגילה** (regular, maroon): holding Space while falling **glides** on the blue wing.

**The monster king (מלך המפלצות)** shows up once in a while — first at 130 m, then every
~300 m, on a stretch the tower generator leaves flat for him. He stomps in, the other bad guys
run off the page, and he plants himself: his legs are a wall you can't walk through. **You get
past him by going over him.** Only his **hands** hurt; his arms and head are for climbing.
- **sweep** — the small hand winds up behind his head for a second ("!"), flies over you, lands
  at least 6 blocks away on the far side and rolls back along the ground towards him at 5
  blocks/s, like a skipping rope. Jump it (+15).
- **slam** — the big cloud hand hovers over you for 1.4 s, a shadow underneath, following slower
  than you walk (3.6 vs 6.2); the shadow turns red and the hand shakes for 0.55 s; then it drops.
  Walk out from under it.
- a slammed hand **falls asleep** on the ground for 2.6 s (dizzy stars, "עולים על היד!") and is
  harmless: walk into it and you're lifted on, walk up its arm (the same speed along the tube,
  so the steep part is slower), and his **head and shoulders spring you right over him**. Land
  on his other side: "קפצתם מעל המלך!" (+200 and a heart back); he looks around ("?!") and runs
  off the other way. The arms are one-way platforms — you jump up through them and land on top —
  so the sweeping arm can be ridden too, if you're quicker than its hand. While flying over him
  his hands can't catch you.

Caught by an awake hand: he carries you to his mouth, chews (your legs kick out), and spits you
back into the arena. He takes **at most one heart a visit and never your last one** — caught
again, he's "already full" and just tosses you away. So the king can't end a run. Left alone,
he gets bored after 30 s and stomps off laughing.

**Enemy verbs:** one drawing, four ways to move (the shoe leg, the wheel leg, both, or big):
the runner chases you and, at a tower, crouches for a beat before its big shoe kicks it up
and over; the hopper (from 70 m) pogos on the shoe; the roller (from 200 m) spins along on
its spiral wheel and bounces back and forth between towers; the giant (from 450 m) is slow
and tall and waits at walls. All of them split their spiky star into a **mouth** when they're
close and on your level — that's the tell to jump. One that drops onto your head boinks off
to the side instead of biting.

**Goal:** endless. Score = best distance in meters + 10 for every bad guy jumped over (the second in the
same jump is 20, the third 30…) + 5 for a head bounce + 25 for a heart when you're full.
Hearts (+1 life) float above some of the three-box towers.

**Fail:** eaten three times. Each bite is a moment of chewing (your legs kick out of its
mouth), then it spits you out over its head with a short invulnerability.

**Twist:** the flip, three characters that play differently from the same button, and the
king — a giant you climb over with the same verbs (jump the sweep, walk out of the slam, walk
up the arm, bounce off his head).

**Round length:** a careful player lasts minutes; a player who never moves lasts ~20 s.
Aim for a kid's run of 60–120 s.

**Knobs (src/jump.js):** `JUMP_V` / `G` (jump height and air time; `FLIP_W` follows from
them), `RUN_V` / `ACCEL` / `FRICTION` (walking), `BACK_LIMIT` (how far back you can go),
`SPAWN_GAP0` / `SPAWN_GAP_MIN` / `SPAWN_RAMP` and `QUIET_T` (how crowded — walking back or
standing still still brings bad guys, sometimes from behind), `FOES` (per-type speed, size,
hop), `INVULN`, the pattern unlock distances in `placePattern`, and the king's `KING_FIRST` /
`KING_EVERY` / `KING_TIME` / `KING_WALL` / `HEAD_BOUNCE_V` / `ARM_STEP` / `PASS_PTS` /
`KING_PAUSE` / `WINDUP_T` / `SWEEP_V` / `HOVER_T` / `HOVER_V` / `LOCK_T` / `SLAM_FALL` / `REST_T` /
`KING_PLAN`.

**Verified by:** `tests/games.spec.js` "Jump Over the Bad Guys" — a held jump peaks near 2.3
blocks with exactly one flip, walking back turns you round and flips you backwards, the back
limit holds, a tap still clears a bad guy and lands upright, a bite costs one heart and spits
you out, jumping over scores 10 either way and a second in the same jump 20, each character's
move works, a three-box wall blocks but never traps, a bad guy landing on your head doesn't
bite, the king blocks the way, catches a player who stands still (one heart a visit, never the
last), can be climbed — sleeping hand, arm, head bounce — and jumped over (a heart back, no wall
left behind), his arms let you jump up through them, and he leaves by himself if you wait, an idle player is out inside a minute,
and the look-ahead autopilot (`simulate` / `botThink`, which also plays the demo behind the
intro card and models the king's attacks) survives two minutes and gets over the king.

## Decisions
- 2026-09-30 · the drawing's right-hand column says "and you eat with the Space key"; the kids
  changed that to **jump over them**. The bad guys do the eating.
- 2026-09-30 · towers are what you "bounce on": landing on one squashes it like a spring (look
  only, no extra height).
- 2026-09-30 · second request: **walk both ways** (no more auto-run; the camera has a dead zone
  and you can't go more than 45 m back) and **the monster king who shows up once in a while**.
- 2026-09-30 · "the king is too difficult". Measured with a scripted kid (0.2–0.45 s reaction):
  2 catches and 2 hearts lost every visit, all to the sweep (it landed at his feet, where you
  stand, and moved at 9.5 blocks/s). Now: the sweep comes from the far side at 5 blocks/s, the
  slam is slower with a red warning, the resting hand lasts 2.6 s and any landing counts, 2 hits
  instead of 3, one heart a visit and never the last, a heart back for beating him. Same kid:
  18/18 visits beaten, 0 catches at 0.2–0.3 s reaction, 4 catches in 6 visits at 0.45 s.
- 2026-09-30 · "maybe we can jump on the big monster's arms and head, as long as we don't get
  caught in the hands — jumping over him instead of defeating him". Stomping to defeat him is
  gone; his arms are one-way platforms, the sleeping hand lifts you onto its arm, his head
  springs you over, and landing behind him is the win. Same scripted kid (now walking into the
  sleeping hand and on up the arm): over him in 18/18 visits; the careful autopilot 24/24.

## Playtest log
- 2026-09-30 · built from the four drawings; not played by the kids yet
