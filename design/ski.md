# 🎿 Kelpie Downhill — רוקרוק בשלג

**Drawing:** `drawings/ski-dog-reference.png` — the dog itself. Asked for in chat, not drawn:
"Could you make a Babylon.js game in which this dog skis down a snowy mountain?" — the dog is the
black-and-tan kelpie photo that was rebuilt as a 3D model (Blender, procedural; `src/assets/dog.glb`
is its game export). Made 2026-09-04.

**Fantasy:** our dog on red skis, flying down a mountain that never ends — and gets wilder the
further down you go.

**Player verbs:** lean into a carve (left/right) · tuck for speed · jump (over fallen logs and
rocks) · spin in the air · thread a gate, and keep a streak of them going · follow the bones and the
groomed lane · grab a golden bone to get a bone back.

**Enemy verbs:** the mountain does the work. The forest keeps a groomed lane around the course line
and nothing else: skiing straight down the middle works on the open slope and runs into the trees
once the forest starts. Deeper down the lane narrows, the snow gets faster, rocks sit inside the lane
(never on the line), fallen logs lie across it, kickers launch you whether you asked or not; the
valley walls push you back to the run.

**Goal:** score — gates are the big points: 50 × the streak (×2, ×3 … up to ×5; a missed gate or a
crash ends the streak); bones +10, a log jumped +25, big air +20, full spins +100 each, distance
0.1 per metre.
**Fail:** three bones (lives); a tree, a rock or a log costs one, with a two-second grace period. A
golden bone on the line every ~480 m gives one back (never more than three).

## The course (2026-09-30)
- **The line** runs gate to gate: a smoothstep from each gate's predecessor into it (`courseX(z)`).
  Gates are a slalom — each one on the other side of a centre line that starts drifting across the
  slope at the forest edge (`courseCentre`), within reach of the previous gate (≤ 0.45·Δz, ≤ 18 m).
- **The lane** (`laneAt(z)` = the zone's `corridor`) is kept clear of trees on both sides of the line
  and tinted a touch bluer than the powder, with a soft line at its edge. Half of each chunk's trees
  crowd the lane edge (a tree line you can read from far away); pines along the edge are slimmer so
  their branches don't hang over the lane (the hit is the trunk either way).
- **The bones** are a trail along the line into each gate (≤ 9, 3 m apart, ending 2.5 m before it).
- **Rocks in the lane** sit ≥ 1.3 m off the line, so skiing the line is always safe (the spec walks
  4.5 km of line and checks it).
- **Kickers and logs** are planned per chunk like the gates (`kickersFor`, `logsFor`, memoised) so a
  chunk can see its neighbours'. Both go where the line bends little over the flight (≤ 3 m / ≤ 3.5 m
  off its tangent), because nobody steers in the air; rocks keep out of every run-up and landing
  (`inFlightZone`). Kickers carry an orange lip across the crest and two pennant poles. Logs span the
  lane (+1.2 m, at most ±7 m), so in a wide lane you can go round the end; later you have to jump.
  A jump pressed up to 0.25 s before landing still happens.
- **Firsts are announced:** the zone name when you enter it, "a log! space = jump" before the first
  log, "a golden bone gives a bone back" before the first golden bone (a card under the badges).

## The climb: zones by distance (2026-09-30)
Each zone starts with these values and blends into the next; the black run keeps climbing slowly to
7 km, then the mountain holds. Nothing lies in the lane on the open slope.

| zone | from | lane ½-width | trees/chunk | lane rocks | logs | kickers | top speed | gate ½-width |
|---|---|---|---|---|---|---|---|---|
| 🏔️ המדרון הפתוח (open slope) | 0 m | 34→20→13 m | 10 | – | – | – | 56 km/h | 3.3 m |
| 🌲 שולי היער (forest edge) | 500 m | 13 m | 34 | 0.6 | 0.6* | 0.5 | 63 km/h | 3.0 m |
| 🌲🌲 היער (forest) | 1300 m | 8.5 m | 52 | 1.4 | 0.85* | 0.6 | 72 km/h | 2.7 m |
| 🌲🌲🌲 היער העבות (deep forest) | 2600 m | 6 m | 64 | 2.2 | 1.0* | 0.7 | 79 km/h | 2.5 m |
| ⚫ המסלול השחור (black run) | 4200 m | 5.5 → 4.8 m | 70 → 74 | 2.6 → 3.2 | 1.1* | 0.7 | 81 → 86 km/h | 2.4 m |

\* targets; the straight-line rule lets about half of them through (0.3–0.5 logs per chunk, one
every 7–12 s). Tucking adds a quarter to the top speed. A skier who follows the line reaches the forest edge
at ~36 s, the forest at ~95 s and the deep forest at ~3 minutes (before: everything at full strength
after 33 s, 80 km/h after 15 s, and 120+ trees per chunk).

## The view (2026-09-30)
The camera rides 2.7–3.7 m up, 5–6.8 m behind, and looks 10 m ahead (it was 6). Pines the dog has
already passed that stand between it and the camera — or crowd the camera — sink into the snow
(thin-instance matrices rewritten, quick down, slow back up) and come back behind it; nothing ahead of
the dog ever hides, since a hidden trunk would be an unfair hit. Measured: a skier on the line never
loses sight of the dog (0 %, was 6–12 % in the forest) or of the next gate (0.3 %, was 13–15 %); a
skier wandering through the trees loses the dog 4 % of the time instead of 14 % (the rest is squeezing
past a trunk level with the dog). Bones are 1.35× bigger, spin, bob and have a dark outline; the golden
bone floats in a glow.

## Skiing model (2026-09-05, third pass)
The input asks for a *lean*, not a turn — like a bike. Starting or reversing a turn first sways the
body the other way for 0.11 s (the counter-steer kick, with the knees extending), then the body falls
into the turn on a stiff spring (`leanSpring` 95, `leanDamp` 13) and the skis carve at the rate a
balanced edge allows, ω = g·tan(lean)/v, so the turn widens with speed. On top of the carve the skis
pivot immediately with the input (`skidSteer`, strongest at low speed) so a turn starts within a
couple of frames; past `grip` (1.7 g) the edge skids: extra drag and spray. Releasing the input leans
the body back toward the fall line (`recentre`); gravity's cross-slope pull also bends the line
downhill. Spray comes off the outside ski in proportion to edge force and skid; the camera rolls a
little with the dog. Trunks are taller than any jump (they hit in the air too — otherwise jumping
straight down the slope would skip the forest); rocks and logs only hit below their tops.

**The dog moves (2026-09-05):** the GLB carries a 22-joint skeleton (hips → spine → chest → neck →
head, ears, three tail bones, four three-bone legs; weights painted by distance in the Blender
build). `animateRig` poses it every frame in dog space with matrices (the glTF root is mirrored, so
quaternion composition of world rotations is wrong there): the hips drop with the crouch and each
leg solves two-bone IK so the paws stay on the skis (elbows fold back, knees forward); hips, spine,
chest, neck and head counter-roll against the lean (angulation) and the head looks into the turn
and tucks; the tail swings faster the harder the edge bites and whips on landing; the ears flap with
speed and lift in the air. Without a skeleton the old morph target and squash still work.

**Twist:** take-off is physical. You lift off when the snow curves away faster than gravity
can pull you down (v²·κ > g), so the same kicker is a tiny hop at 30 km/h and a two-metre
flight at 70. Steer in the air and the dog spins.

**Round length:** a skier who ignores the course is out in under a minute (first tree at ~43 s,
just past the open slope); one who follows it plays three minutes and more.

**Knobs (src/ski.js):** `ZONES` (the table above) and `courseCentre`; in `T`: `tuckDrag`,
`carveDrag`, `leanBase`/`leanPerSpeed`/`leanMax`, `leanSpring`/`leanDamp`, `kickTime`/`kickLean`,
`grip`, `skidSteer`, `recentre`, `jumpV`, `lives`, `kneeDrop`, `logR`/`logTop`/`logMaxHalf`,
`streakMax`, `goldEvery`, `camBack`/`camHeight`/`camLook`; the course in `gatesFor`, `kickersFor`,
`logsFor`, `makeChunk`.

**Verified by:** `tests/games.spec.js` "Kelpie Downhill" — (1) slope, open-slope speed, carving,
straightening, jump + landing, spin scoring, a three-gate streak, a tree costs one life and the
streak, the forest zone, a kicker launch, a log hit and a log jump, a golden bone, the zone ramp,
finite state, chunk streaming; (2) 4.5 km of course line clear of trees and rocks, no tree in the
lane, nothing in the lane on the open slope, hands-off safe on the open slope and out soon after;
(3) a course-following skier reaches the zones on schedule without a hit, a 0.2 s-late skier reaches
the deep forest, the dog and the next gate stay in view, and ducking halves what a wanderer loses.
No console errors.

## Notes
- Babylon.js (npm `@babylonjs/core` legacy bundle + glTF loader), not the three.js kit; the
  HUD, input, audio, manifest links and `?sim` hook are the kit's, so it behaves like its
  siblings. `dog.glb` is imported with `?url`; the artifact build inlines it as a data URL
  (`assetsInlineLimit` in vite.config.js).
- Thin instances on a `clone()`d mesh render nothing until `makeGeometryUnique()`.
- Babylon's `Quaternion.FromLookDirectionLH` faces a mesh *away* from the direction; the
  dog is oriented with an explicit axes matrix instead (it skied backwards once).
- The glTF `__root__` has scaling (1, 1, −1): bone `absoluteRotationQuaternion`s don't compose, so
  the rig is driven with world matrices (rotate about the joint, then `world × parent⁻¹`, decompose).
  IK bones get an absolute dog-space orientation; the spine chain gets relative deltas.
- The kit's `shell.css` is injected by the JS after the page's own `<style>`, so a page rule with the
  same specificity as a kit rule loses (the streak badge sat on the score badge): use ids.
- Additive glow disappears on white snow; the golden bone's halo is alpha-blended instead.
- The course plans (gates, kickers, logs) are memoised and shared across runs — anything with per-run
  state (`done`, `taken`) is copied into the chunk.

## Playtest log
- 2026-09-04 · first build · "are we skiing backwards?" — yes; orientation fixed
- 2026-09-04 · "more real skiing: lean to turn, like a bike, spray, knees" — lean-driven carve with a
  counter-steer kick, edge-force spray, knee-bend morph, camera roll
- 2026-09-05 · "turning too slow, the dog is rigid like a frozen cube, start easier" — skid-steer pivot on
  top of the carve and a stiffer lean spring; a real skeleton (IK legs, angulation, head look, tail,
  ears); open piste that narrows over the first 660 m
- 2026-09-05 · "the bones should lead to the gates, they're off course" — gates chained within reach of
  each other; bones laid as a smooth trail from the previous gate into each gate, spilling across
  chunk boundaries; trees and rocks keep 3.2 m off the trail
- 2026-09-30 · "if you just go forward you never hit a tree; it gets hard too quickly; the trees block
  our view" — measured first: hands-off lasted forever at x = 0 and outscored a bone-following bot
  (the clear lane was fixed at x = 0), the whole ramp was over at 33 s, gaps after gates had trees on
  the line, the dog was hidden 6–12 % of the time in the forest. Now: the lane follows the course,
  zones over ~3 minutes, gate streaks, logs to jump, golden bones, trees that duck out of the camera's
  way, a camera that looks further ahead, marked kickers, bigger spinning bones
