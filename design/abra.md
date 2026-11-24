# אברא כדברא · Abra Kadabra

Drawing: none, on purpose. Every other page here began as a kid's marker drawing. This one was
asked for in chat ("invent your own experience to add to the roster") and its author, Claude,
has no markers. It has words. So the page is built from the one thing it had.

Fantasy: you write a word in your notebook and it gets up off the line and lives, made of
nothing but the letters of its own name.

Player verbs: write · cast · poke · pick up and put down · change the whole world with one
word · take it back (`לא`) · turn the world into a story and sign it.

World verbs (there is no enemy): things walk, fly, swim, drive, grow and sleep according to
what they are. They eat what they like, play tag, kick balls, flee from a roar, gather round a
fire at night. Rain grows the plants and puts out the fire; sun after rain makes a rainbow that
nobody wrote; a fish without water asks for it.

Goal: there is no score. The page keeps a list of the words you have brought to life
(`המילים שלי`), and remembers your page between visits.

Fail: nothing fails. A misspelled word is quietly written correctly on the line and still
works; a word the page does not know becomes a creature that walks around as itself.

Twist: everything on the page is text. A dog is the letters כ ל ב written along its outline and
row after row inside it; the sea is ים; each band of the rainbow is written in the name of its
own colour; the stars are the letters of כוכב. Apart from the paper with its ruled lines and a
few small marks (eyes, hearts, sparks), nothing on the page is anything but a letter.

Round length: none. A first visit opens with about twelve seconds of handwriting (skippable);
a return visit with two lines.

Knobs: `maxEnts` / `maxGlyphs` (how full a page may get), `rowsFor` (letters per thing),
`unit` in `measure()` (how big a dog is), spring `k` and damping in `World.step`, the
`LASTING` set in `src/abra.js` (what a page remembers).

Verified by: `tests/abra.spec.js` (real keys and buttons, plurals, numbers, colours, sizes,
spelling forgiveness, undo, names, night and sleep, sea and fish, the unwritten rainbow,
bounded resources, the ending and back, persistence, a picture for every word) and
`tests/unit/abra-lexicon.mjs` (the parsing rules and the soundness of the dictionary).

## How the page reads a child

- **The alphabet, not a keyboard.** 27 keys in alef-bet order, right to left, final letters in
  the last row: the strip on the classroom wall. A physical keyboard also works, by Hebrew
  letter or by key position, so an English layout still writes Hebrew.
- **Print in, handwriting out.** Keys are print letters (Fredoka). What appears on the line and
  in the world is school handwriting (Playpen Sans Hebrew): the same correspondence a
  second-grader is learning.
- **Spelling is forgiven, then shown.** Lookups ignore final forms, a missing or extra helper
  vav / yod, and letters that sound alike (ט/ת, ק/כ/ח, ע/א, ס/ש). The corrected spelling is what
  gets written on the line. Names are protected: there is no edit-distance guessing, so נועה is
  never "corrected" into נוצה.
- **A little grammar.** Numbers before, adjectives after, `ה` and `ו` prefixes, plurals nobody
  listed: `שלושה כלבים כחולים`, `הדרקון הירוק`, `כלב גדול וחתול קטן`. A bare colour, size or number
  changes the newest thing. `אני` followed by anything is a name, even when it is also a word.
- **Suggestions write themselves.** The three chips above the keys type their word letter by
  letter before casting it, so a child who cannot spell it yet sees how.

## How it is built

- `src/abra/glyphs.js` bakes the handwriting font into a texture atlas and draws every glyph on
  the page as one instanced WebGL2 call (two at night: a blurred, additive halo first). The
  paper, its ruled lines, the margin, the hour and the weather light are one background shader.
- `src/abra/shapes.js` turns a small picture into a calligram: marching squares trace the
  silhouette, the word is written along the smoothed outline with each letter turned to follow
  it, then written row after row inside, right to left. `glFlip` re-deals the letters when a
  creature turns around, so its word never reads backwards.
- `src/abra/world.js` is the living page: each thing is a set of letters on springs plus a
  small brain. `src/abra/scenery.js` is the sea, grass, stars, rainbow, rain and snow.
  `src/abra/paint.js` paints the shapes that have no picture (sun, moon, clouds, mountains,
  one-of-a-kind monsters, stick-figure bodies under emoji heads).
- `src/abra/lexicon.js` + `words-data.js`: 473 nouns with about 1,100 spellings, what each one
  says when poked and what it likes to eat, plus the page's own magic words.
- `src/abra/things.png` is one sheet of 492 Twemoji pictures (CC-BY 4.0) used only as
  silhouettes and colours; nothing on it is ever shown. Rebuild it with
  `scripts/build-abra-sprites.mjs` after changing a picture in the dictionary.
- `src/abra/sound.js`: every letter has a note on a pentatonic scale, so every word has a tune
  and typing is playing. Weather is filtered noise. It shares the kit's mute switch.
- `src/abra.js` is the notebook around the world: the lines, the keys, the opening, the ending
  (every letter on the page flies into a sentence), and what is remembered.

Fonts are bundled, not fetched: `src/abra/fonts/` (SIL Open Font License, texts alongside).

## Playtest log

2026-11-11 · Built in one sitting; headless checks and screenshot review on phone and desktop
sizes. No child has played it yet. First things to watch for: do they find `אני`, do they
notice the word is what the thing is made of, and which word do they try first.
