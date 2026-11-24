# הזיקית בורחת — Chameleon Escape

Designed and drawn by גבריאל ומיכאלה (Gabriel and Michaela).

```
Drawing:      drawings/zikit-1-page.webp (the page and the rules), zikit-2-monster.webp,
              zikit-3-trees.png, zikit-4-chameleon.webp (close-ups of the same page)
Fantasy:      "יש זיקית שבורחת ממפלצת שמנסה לדרוך עליה. לזיקית יש לב 1. אנחנו הזיקית.
              ברקע יש יער." — a chameleon runs from a monster that tries to step on it;
              the chameleon has one heart; we are the chameleon; the forest is behind.
Player verbs: run (both ways) · jump · shoot the tongue
Enemy verbs:  swoop over you and mark the ground with a red scribble → drop on it →
              send a wave along the ground both ways → throw the poop off her head →
              bounce straight into a second, lower hop
Goal:         escape as far as you can: one point a metre, 10 a bug, 5 for every stomp
              that missed, 10 more when it only just missed
Fail:         one heart. The first time she lands on you the round is over.
Twist:        she lands where you are GOING to be, not where you are — a runner has to
              stop, a chameleon standing still has to run — and where she lands, the
              nearest tree drops its bugs. A narrow escape is also a meal.
Round length: 60–120 seconds for a careful player; the autopilot shows the range below
Knobs:        WARN_0 / WARN_MIN (seconds of red scribble), TRACK_0 / TRACK_MAX (how fast
              the scribble creeps after you), REST_0 / REST_MIN, KILL_HALF, WAVE_R0 / WAVE_R1,
              POOP_FROM, DOUBLE_FROM, LEAD_FROM
Verified by:  tests/zikit.spec.js
```

## What she does, and when

| Stomp | What is new | What the player answers |
|---|---|---|
| 1–2 | She lands where you are standing. | Run. Anything but standing still works. |
| 3 on | She lands where you would be if you kept going (now and then a short feint instead). | Stop, or turn back. Do not be on the red scribble when she comes down. |
| 3 on | Her landing sends a wave along the ground both ways; it reaches further as the round goes on. | Jump it. A hit is not a heart: you tumble for 0.75 s. |
| 5 on | She throws the poop off her head to about where you will pull up. | Jump it or stay out: it is sticky (40% speed), never deadly. It grows back on her head. |
| 9 on | Sometimes she bounces straight into a second, lower hop, aimed at you. | Run again, sooner. |

The red scribble is the whole rule. It is exactly as wide as what lands (`KILL_HALF`), the
chameleon's own counted length is `CHAM_HALF` (the tail curl and the hair do not count), and a
jump does not save you: she comes from above. The scribble creeps towards where you are heading
until the last 0.28 s, then stays put. The first time each trick appears the page says so once
("עוצרים! היא נוחתת לפניכם", "קופצים מעל הגל!", "זהירות, קקי! 💩").

Controls: arrows / A-D run, Space / Enter / ↑ / W jump (hold for higher, a tap still clears a
wave), Shift shoots the tongue at the nearest bug within 3.3 m (it turns to face it). Touch:
stick on the left, ⤒ and 👅 on the right.

## The drawing is on screen, not a redrawing of it

Everything that moves is the kid's own marker and pencil, cut out of the photographs by
`scripts/zikit-cutouts.py` (run it again after changing a polygon; it needs Python with numpy,
OpenCV and Pillow). `design/zikit-parts.webp` shows the page beside every piece.

- **The chameleon** is eight pieces: body and head, the tail, the two legs, and the colourful
  hair in four overlapping lengths, each hinged on the one before, so it whips back when the
  chameleon starts running and flops forward when it stops or lands. The two drawn legs swing
  from the hips; nothing was added (it has two legs because it was drawn with two).
- **The monster** is ten pieces: the body with her face, vampire teeth, bull horns, the three
  spikes (the tall orange one is the unicorn horn), the orange elephant ear, bracelets and
  underwear; and, hinged on it, the yellow clown, the arm with the striped unicorn horn, the
  lower arm with its bracelets, the walking stick, the brown elephant ear, the tail, the two
  legs, and the poop on her head. She is drawn facing left and is mirrored to face the
  chameleon.
- **The forest** is the four trees from the bottom of the page, repeated in three rows. A row
  drawn higher on the page is further away, so the far rows are smaller, paler and stand on
  their own ground lines. The bugs are the little pencil bug beside her arm.

What had to be filled in ("interpolated"), and how:

- The photographs' uneven light is divided out, so bare paper is one flat colour and the
  marker colours are the ones on the page rather than the ones under a yellow lamp.
- The page is full of other pencil lines (the big outline around the monster, erased sketch
  lines round the hair). Each piece has a hand-traced polygon that keeps them out; the one
  long line that runs through her pencil loops is rubbed out above and below the loops.
- Whatever the ink encloses is opaque paper, so the monster's unpainted underwear does not
  show the forest through it.
- Where one piece is hinged under another, its hidden end is continued by mirroring its own
  strokes across the cut, so no gap opens when a leg or the tail swings.
- The orange unicorn horn runs up in front of the poop. In the poop's own sprite the horn is
  replaced with the crayon lump beside it, so the poop is whole when she throws it; on her
  head the real horn is drawn over it, exactly as on the page.
- The pencil ground line that runs through the trunks is rubbed out of the tree sprites (the
  game draws its own ground). The photograph cuts a few millimetres off the top of the third
  tree's crown; it is rounded off again by mirroring the rows below the cut.
- Her tail curl hangs lower than her shoes on the page, so when she lands she throws her tail
  up. The chameleon stands on its front foot, as drawn; its back foot is higher, as drawn.

Added, and not on the page: the red scribble, the wave, the tongue (pink marker, drawn in
code), the dust, the faint pencil hills. Read into the page rather than told: that the pencil
bug is food, and that the poop gets thrown.

## Open questions for the kid

- What is the big pencil shape drawn around the monster, with the tall spike going up to the
  top of the page? It is not in the game (only faint hills are). A mountain, a cave, her foot?
- What are the square teeth along the bottom left and bottom right of the page? A wall?
- Is the yellow clown riding her, stuck to her, or her friend? For now it bobs on her horn.
- Does the monster have a name?
- Who drew which part? (The page is credited to both.)

## Playtest log

2026-11-24 · Built from the drawing and the written rules. Headless rounds, ten seeds each:
standing still is stepped on by the first stomp (3 s); only holding "run" is caught on stomp
3–6 (16–31 s), once she starts landing ahead; an autopilot that answers every scribble within
0.5 s is never caught in four minutes (every stomp can be dodged); one that takes 0.65 s lasts
about two minutes, one that takes 0.8 s about 75 seconds. Checked on a desktop window and on
phone-sized screens both ways round. Not yet played by the kids — the numbers above are the
first thing to check against them.
