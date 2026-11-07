# Jaffa Hop · שחור לבן · يافا

Drawing: `drawings/jaffa-dog-and-scooters.jpg` (the user's original drawing).
Fantasy: A black-and-white dog escapes delivery riders and young electric-scooter riders along Jerusalem Boulevard in Jaffa.
Player verbs: hop forward, sidestep, retreat, wait for a gap, collect.
Enemy verbs: Wolt delivery scooters cross road lanes; standing electric-scooter riders cross marked sidewalk lanes. Both directions appear, with visible approach arrows.
Goal: travel as far as possible; one point per new row, ten per bone, fifty per rice bag.
Fail: three collisions end a run. A collision gives a 0.12-second impact stop, drawn impact marks, explicit heart-loss feedback and 1.05 seconds of invulnerability. The dog stays visible during immunity. Backtracking is limited to six rows, and only new forward rows earn distance points. No graphic injury.
Twist: sidewalks with outlined scooter markings are also moving lanes; ficus plazas are safe. Rice bags grant a short monochrome protection bubble as well as bonus points.
Round length: endless, with traffic gradually speeding up over the first 120 rows. After the opening, occasional center trees require sidesteps. Rice bags are off the center path, making protection an optional detour.
Knobs: HOP_DURATION, INVULNERABLE_SECONDS, RICE_SECONDS, lane speed, lane spacing.
Controls: arrows/WASD; Space hops forward; touch swipe/tap and four direction buttons; P/Escape pauses; M toggles sound. Start/restart/resume buttons support keyboard focus.
Art: entirely black and white, with pencil linework. The dog, seated delivery rider, standing scooter rider, bone and rice bag are rendered directly from the uploaded drawing, preserving their actual strokes, proportions, faces, clothing, wheels and markings. At runtime, local paper normalization removes the photograph’s uneven lighting and flood fill makes the exterior transparent. The original photograph is unchanged. The original drawn legs tuck and extend during each hop; the wheels turn at a rate derived from each rider’s travel distance. Heads, bodies, faces and the original source image stay unchanged. Legs return exactly to the standing drawing on landing, and all motion freezes during pause. Cutouts hop and mirror in a monochrome street of outlined buildings, paving and hand-drawn ficus trees. An imagined streetscape inspired by Jaffa, not a literal street map.
Music: locally synthesized original Arabic-inspired Hijaz melody with plucked-string timbre and a darbuka-style rhythm; no recordings or external services. Sound starts with a user gesture, respects the shared mute setting, and stops while paused/hidden.
Verified by: `tests/jaffa.spec.js` checks actual keyboard/touch controls, pickup scoring, collisions, immunity, pausing, restart, row generation and bounded render resources.

## Playtest log

2026-11-06 · Addressed the independent review: horizontal road projection aligns travel with the side-on drawings; original ink stays visible over foreground scenery; 0.24-second hops add preparation, directional lean and landing compression. Explicit texture gradients fix crop-border and detached-ink artifacts without changing the source drawing. Both hind legs move as a connected pair. Wider collision footprints, stronger monochrome lane markings, clear damage feedback, shorter immunity and optional rice detours improve readability and choices. Pause now freezes the camera as well as actors. Across eight start timings, holding forward ended at row 11; a timed route using waits and sidesteps reached row 40 with all three hearts.

2026-11-06 · Independent re-review passed all six findings with no blocking regression. Reviewer repeated the mobile edge reproduction, inspected fresh gameplay and motion frames, tested damage and pause, and ran five forward-only timings. Original source-image checksums still match. All 32 automated checks pass, including a real-input replay to row 40 without damage. Longer player sessions can further refine difficulty.

2026-11-06 · Added motion to the original ink: three visible dog legs bend through the hop, and both delivery and electric-scooter wheels rotate with travel. GPU-rendered frame comparisons verify moving limbs/wheels, unchanged upper bodies, exact landing pose, pause behavior, independent rider speeds, and wrap continuity.

2026-11-06 · User requested a completely monochrome game and the exact drawn characters. Replaced the voxel characters with the original pencil cutouts and restyled scenery, UI, icons and effects as a black-and-white sketchbook.

2026-11-06 · Initial implementation from the supplied drawing and spoken rules; automated checks and browser visual QA. Awaiting the kids' playtest.

## Verification and workspace notes

- Browser checks cover controls, collision grace, rice protection, scoring, pause/mute, mobile input and 400 rows of world streaming. Rendered-frame checks verify the original ink at rest, moving limbs/wheels, landing pose, monochrome colors, and player visibility at both mobile edges. Regression checks cover lateral camera pause, impact feedback and forward-only progression. Existing game/character checks run alongside these.
- Desktop and mobile previews were visually inspected. The pencil version uses shared sprite textures and batched scenery; the earlier voxel version’s timing is not treated as a benchmark of this revision.
- No dependencies were installed and no worktrees were created. Existing `node_modules/` (235 MB) and generated `dist/` (21 MB) are reinstallable/rebuildable cleanup candidates when they are no longer needed. The existing security-dependencies worktree is dirty, so it is not a cleanup candidate; no clean merged worktree was identified. All pre-existing character work is retained.
