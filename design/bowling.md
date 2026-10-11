# 🎳 Bowling Escape — כדור באולינג בורח

**Drawing:** `drawings/bowling-lane-and-monsters.jpg`, `bowling-monsters-2.jpg`,
`bowling-monsters-3-whiteboard.png`

**Fantasy:** "A bowling ball runs away from monsters that chase it, and when it hits the
pins you get 10 points — it's always a strike."

**Player verbs:** roll (arrows / stick) · shoot mini balls (Space, ammo from strikes) ·
**freeze** (stop rolling and the whole world stops) · aim strikes at racks.

**Enemy verbs:** each monster has its own move — the purple loop and yellow wheel charge
in straight lines and turn wide; the green zigzag waits and lunges; the snake and worm
slither; the dino bounds in hops; the snail barely moves but its arm reaches far; the
scribble monster tumbles about in jittery sidesteps (it used to blink closer, which read as
popping in and out of existence — removed 2026-09-04); the lollipop sways and fishes from above;
the alien mirrors your sideways moves. Every one grabs with a long body part; a slow ball
gets caught, a fast ball rips free.

**Goal:** none — it's an endless run; the score and the strike count are the trophy.
**Fail:** a grabber catches the ball, or you bump a monster's body.

**Twist:** the world only moves when the ball moves. Shots obey it too — stand still,
fire a volley, then roll and they all launch.

**The lane:** endless and WINDING (`src/track.js`). The drawing's straight opening runs
60 m, then bends alternate with straights — radius 30–75 m, heading never more than ≈57°
off the opening direction so the lane cannot cross itself, and the first two bends of a
run are gentle. The camera turns with the lane (it looks where the lane heads 8 m on) and
the stick is read relative to the camera, so "up" always means "down the lane". Ball and
monsters live in lane coordinates (distance along, offset across); far-away monsters
follow the bends toward you, close ones charge straight. Pushing into an edge line stops
that part of the ball's speed — the world only moves when the ball really moves.

**Difficulty:** the CROWD. The lane starts with three monsters and wants one more for
every 12 seconds the world was actually moving and one more for every two strikes, up
to sixteen. Monster speed only creeps up, so the lane stays readable.

**Round length:** open-ended; a good run is a minute or two.

**Knobs (src/main.js):** `MONSTERS_START`, `CROWD_EVERY_S`, `CROWD_EVERY_STRIKES`,
`MAX_MONSTERS`, `BALL_MAX_SPEED`, `BREAK_SPEED`, the `BRAINS` table (speed / agility /
pattern per monster). **Lane knobs (src/track.js):** `OPENING_STRAIGHT`, `HEADING_MAX`,
`RADIUS_MIN` / `RADIUS_MAX`, `TURN_MIN`, `GENTLE_BENDS`.

**Verified by:** `tests/games.spec.js` — a dodging controller (steering in lane
coordinates) must survive and strike; the run must meet real bends with the ball and every
monster still between the edge lines; lane coordinates must round-trip through the world;
the crowd cap must grow with rolling time and with strikes; strikes must never end the
game.

**Not in the game yet:** the yellow crown and the small striped fish on the second sheet.

## Playtest log
- 2026-09-11 · the user · "the track should twist and turn, not always stay straight" ·
  the lane is now an endless winding path (src/track.js), camera and controls turn with it
- 2026-09-04 · the user · no ending after ten strikes, no ball trail, the alien must match
  the whiteboard drawing, difficulty = more and more adversaries · done the same day
- 2026-08-12 · the kid · "OK" · wanted new games rather than more of this · next: monster
  personalities (done 2026-09-04)
