#!/usr/bin/env node
// Renders every kid-drawn character next to the drawing it came from:
//   npm run render:characters          → renders/<id>.png, renders/index.html, renders/artifact.html
//
// Starts a vite dev server, opens each game page with ?sim (no animation loop), poses
// the character through the game's debug hook, frames it with the camera, grabs the
// WebGL canvas, and writes a comparison page: drawing on one side, renders on the other.
// The Scribble Monster is left out — it's Claude's, not the kids'. Uses the installed
// Chrome (like the tests) so nothing needs downloading.

import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'renders');
mkdirSync(out, { recursive: true });
const PORT = 5197;
const SIZE = 640;

// ---------- the drawings and the characters made from them ----------
const GROUPS = [
  {
    drawing: 'bowling-lane-and-monsters.jpg', game: 'main', date: '18.7.2026',
    title: 'כדור באולינג בורח · דף 1', note: 'The lane, the pins, the ball and the first three monsters.',
    shots: [
      { id: 'pins', label: 'הפינים · the pins', kind: 'pins' },
      { id: 'ball', label: 'כדור הבאולינג · the ball', kind: 'ball' },
      { id: 'purple', label: 'הלולאה הסגולה · the purple loop on wheels', kind: 'purple' },
      { id: 'green', label: 'הירוק עם העיניים · the stalk-eyed zigzag', kind: 'green' },
      { id: 'wheel', label: 'הגלגל הצהוב · the yellow wheel', kind: 'wheel' },
    ],
  },
  {
    drawing: 'bowling-monsters-2.jpg', game: 'main', date: '18.7.2026',
    title: 'כדור באולינג בורח · דף 2', note: 'The snake with wheels on its tail, the spiral snail, the dino with spikes down its back. The yellow crown and the striped fish are not in the game.',
    shots: [
      { id: 'snake', label: 'הנחש · the snake', kind: 'snake' },
      { id: 'snail', label: 'החילזון · the spiral snail', kind: 'snail' },
      { id: 'dino', label: 'הדינו · the dino', kind: 'dino' },
    ],
  },
  {
    drawing: 'bowling-monsters-3-whiteboard.png', game: 'main', date: '5.8.2026',
    title: 'כדור באולינג בורח · הלוח', note: 'The lollipop, the peanut-head worm and the alien.',
    shots: [
      { id: 'lollipop', label: 'הסוכרייה · the lollipop', kind: 'lollipop' },
      { id: 'worm', label: 'התולעת · the peanut-head worm', kind: 'worm' },
      { id: 'alien', label: 'החייזר · the alien', kind: 'alien' },
    ],
  },
  {
    drawing: 'header-penalties.jpg', game: 'pendel', date: '20.7.2026',
    title: 'פנדלים בנגיחה', note: 'The keeper with his arms flung wide, and the header with the ball on his head.',
    shots: [
      { id: 'keeper', label: 'השוער · the keeper', kind: 'keeper' },
      { id: 'header', label: 'הנוגח · the header', kind: 'header' },
    ],
  },
  {
    drawing: 'punch-fighters-1.webp', game: 'punch', date: '13.8.2026',
    title: 'חתול ביער · החתול', note: 'The player.',
    shots: [{ id: 'cat', label: 'החתול הירוק · the cat', kind: 'cat' }],
  },
  {
    drawing: 'punch-fighters-2.webp', game: 'punch', date: '13.8.2026',
    title: 'חתול ביער · הלוחמים', note: 'The Emperor, the King, the Queen and the creature with the green mohawk.',
    shots: [
      { id: 'emperor', label: 'הקיסר · the Emperor', kind: 'emperor' },
      { id: 'king', label: 'המלך · the King', kind: 'king' },
      { id: 'queen', label: 'המלכה · the Queen', kind: 'queen' },
      { id: 'mohawk', label: 'היצור · the creature', kind: 'mohawk' },
    ],
  },
];
const PAGES = { main: { path: '/', hook: '__game' }, pendel: { path: '/pendel.html', hook: '__pendel' }, punch: { path: '/punch.html', hook: '__punch' } };

// ---------- in-page posing, one function per game (serialized into the page) ----------
function poseBowling(kind) {
  const G = window.__game;
  const { app } = G;
  G.startGame();
  G.showcase('none'); // clears the roaming monsters
  G.ball.visible = kind === 'ball';
  if (kind === 'pins') {
    const c = G.state.racks[0].center;
    app.camera.position.set(c.x + 0.6, 2.6, c.z + 6.6);
    app.camera.lookAt(c.x, 0.9, c.z - 1.6);
  } else if (kind === 'ball') {
    const b = G.ball.position;
    app.camera.position.set(b.x + 0.8, 2.5, b.z + 3.3);
    app.camera.lookAt(b.x, 1.0, b.z);
  } else {
    const m = G.showcase(kind, 6);
    const h = m.userData.holdHeight;
    const z0 = m.position.z;
    app.camera.position.set(0.9, h * 0.55 + 0.4, z0 + 1.5 * h + 1.8);
    app.camera.lookAt(0, h * 0.42, z0);
  }
  app.render();
  return app.renderer.domElement.toDataURL('image/png');
}
function posePendel(kind) {
  const P = window.__pendel;
  const { app } = P;
  P.reticle.visible = false;
  if (kind === 'keeper') {
    const k = P.keeperG.position;
    app.camera.position.set(k.x + 0.6, 2.1, k.z + 4.8);
    app.camera.lookAt(k.x, 1.1, k.z);
  } else {
    const p = P.player.position;
    P.player.rotation.y = Math.PI; // face us, like the drawing
    P.ball.position.set(p.x, 3.3, p.z); // the ball on his head
    app.camera.position.set(p.x + 0.7, 2.9, p.z + 5.4);
    app.camera.lookAt(p.x, 1.75, p.z);
  }
  app.render();
  return app.renderer.domElement.toDataURL('image/png');
}
function posePunch(kind) {
  const G = window.__punch;
  const { app } = G;
  if (G.state !== 'play') G.startMatch(false);
  const f = G.fighters.find((x) => x.spec.key === kind);
  const p = f.body.translation();
  const h = f.built.height;
  // far enough back that the widest thing (the cat's stick arms) stays inside the frame
  const dist = 2.6 + Math.max(h * 0.95, f.built.radius * 2.6);
  const camX = p.x + 0.5, camY = h * 0.55 + 0.6, camZ = p.z + dist;
  const yaw = Math.atan2(camX - p.x, camZ - p.z);
  f.yaw = yaw;
  f.pivot.position.set(p.x, p.y, p.z);
  f.pivot.rotation.set(0, yaw, 0);
  for (const o of G.fighters) { o.pivot.visible = o === f; o.shadow.visible = o === f; }
  for (const t of [...G.treeParts, ...G.treeHulls]) t.visible = false;
  const sprites = [];
  app.scene.traverse((o) => { if (o.isSprite && o.visible) { sprites.push(o); o.visible = false; } }); // spawn poofs never got a frame to fade
  app.camera.position.set(camX, camY, camZ);
  app.camera.lookAt(p.x, p.y - f.centerY + h * 0.5, p.z);
  app.render();
  const url = app.renderer.domElement.toDataURL('image/png');
  for (const o of G.fighters) { o.pivot.visible = true; o.shadow.visible = true; }
  for (const t of [...G.treeParts, ...G.treeHulls]) t.visible = true;
  for (const s of sprites) s.visible = true;
  return url;
}
const POSERS = { main: poseBowling, pendel: posePendel, punch: posePunch };

// ---------- helpers ----------
function waitForServer(url, ms = 30000) {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    const tick = () => fetch(url).then(() => res()).catch(() => (Date.now() - t0 > ms ? rej(new Error('vite did not start')) : setTimeout(tick, 250)));
    tick();
  });
}
// a downscaled JPEG of a drawing as a data URI (sips on macOS; the original file otherwise)
function drawingDataUri(file) {
  const src = resolve(root, 'drawings', file);
  let buf, mime = 'image/jpeg';
  try {
    const tmp = resolve(out, `drawing-${file.replace(/\.\w+$/, '')}.jpg`);
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '78', '-Z', '760', src, '--out', tmp], { stdio: 'ignore' });
    buf = readFileSync(tmp);
  } catch {
    buf = readFileSync(src);
    mime = { '.png': 'image/png', '.webp': 'image/webp' }[extname(file)] || 'image/jpeg';
  }
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// ---------- the comparison page: a studio wall of taped-up sheets ----------
// Palette is the games' own marker set; type is hand-lettered caps (Amatic SC, which has
// Hebrew) over a round friendly body face (Varela Round, also Hebrew). Both themes.
const FONTS = 'https://fonts.googleapis.com/css2?family=Amatic+SC:wght@700&family=Varela+Round&display=swap';
const CSS = `
  :root {
    --paper: #f8f5ec; --sheet: #fffdf7; --ink: #2a2118; --ink-soft: #6b5d4a;
    --line: #d9cfbb; --blue: #2b4bd7; --orange: #e07612; --tape: rgba(240, 214, 140, .78);
    --shadow: rgba(42, 33, 24, .16);
    --display: "Amatic SC", "Chalkboard SE", "Comic Sans MS", cursive;
    --body: "Varela Round", "Comic Sans MS", "Chalkboard SE", Arial, sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #1f1b17; --sheet: #2a251f; --ink: #f1ebe0; --ink-soft: #b9ad9b;
      --line: #4a4237; --blue: #9fb3ff; --orange: #f0a35a; --tape: rgba(240, 214, 140, .5);
      --shadow: rgba(0, 0, 0, .45);
    }
  }
  :root[data-theme="dark"] {
    --paper: #1f1b17; --sheet: #2a251f; --ink: #f1ebe0; --ink-soft: #b9ad9b;
    --line: #4a4237; --blue: #9fb3ff; --orange: #f0a35a; --tape: rgba(240, 214, 140, .5);
    --shadow: rgba(0, 0, 0, .45);
  }
  body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--body); line-height: 1.45; }
  .wrap { max-width: 1240px; margin: 0 auto; padding: 32px 22px 64px; }
  header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px 28px; border-bottom: 3px solid var(--ink); padding-bottom: 14px; margin-bottom: 30px; }
  h1 { font-family: var(--display); font-weight: 700; font-size: clamp(44px, 7vw, 76px); line-height: .95; margin: 0; color: var(--blue); letter-spacing: .01em; text-wrap: balance; }
  header p { margin: 0; max-width: 62ch; color: var(--ink-soft); font-size: 16px; }
  section { display: grid; grid-template-columns: minmax(250px, 340px) 1fr; gap: 10px 30px; align-items: start; margin: 0 0 36px; padding: 22px 24px 24px; background: var(--sheet); border: 2px solid var(--line); border-radius: 6px; box-shadow: 0 8px 0 -4px var(--shadow); }
  section > h2 { grid-column: 1 / -1; margin: 0 0 6px; font-family: var(--display); font-weight: 700; font-size: clamp(32px, 4vw, 46px); line-height: 1; letter-spacing: .01em; }
  section > h2 .note { display: block; font-family: var(--body); font-size: 15px; color: var(--ink-soft); margin-top: 8px; max-width: 70ch; letter-spacing: 0; direction: ltr; text-align: right; margin-inline-start: auto; }
  .en { display: block; direction: ltr; text-align: right; }
  .drawing { position: relative; margin: 14px 8px 0 0; }
  .drawing img { width: 100%; height: auto; display: block; border-radius: 2px; background: #fff; transform: rotate(-1.4deg); box-shadow: 3px 5px 0 var(--shadow); }
  .drawing::before { content: ""; position: absolute; top: -12px; left: 28%; width: 78px; height: 22px; background: var(--tape); transform: rotate(-4deg); border-radius: 2px; z-index: 2; }
  .drawing figcaption { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; color: var(--ink-soft); margin-top: 14px; letter-spacing: .04em; direction: ltr; }
  .drawing figcaption code { font: inherit; }
  .renders { display: grid; grid-template-columns: repeat(auto-fill, minmax(196px, 1fr)); gap: 16px 14px; align-content: start; }
  figure { margin: 0; }
  .renders img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; border: 2px solid var(--ink); border-radius: 4px; background: var(--paper); }
  .renders figcaption { margin-top: 8px; text-align: center; font-size: 15px; }
  .renders figcaption b { display: block; font-size: 17px; }
  .renders figcaption span { color: var(--ink-soft); font-size: 13px; letter-spacing: .03em; }
  footer { color: var(--ink-soft); font-size: 14px; max-width: 70ch; border-top: 2px solid var(--line); padding-top: 14px; direction: ltr; text-align: right; margin-inline-start: auto; }
  footer code { font-size: 13px; background: var(--sheet); padding: 1px 6px; border-radius: 3px; border: 1px solid var(--line); direction: ltr; unicode-bidi: embed; }
  @media (max-width: 760px) { section { grid-template-columns: 1fr; } .drawing { margin: 16px 6px 12px; } }
  @media (prefers-reduced-motion: no-preference) { .renders img { transition: transform .18s ease-out; } .renders figure:hover img { transform: rotate(-1.5deg) scale(1.03); } }
`;
function caption(label) {
  const [he, en] = label.split(' · ');
  return `<b>${he}</b><span>${en || ''}</span>`;
}
function pageHtml(groups, imgSrc, { fragment }) {
  const sections = groups.map((g) => `
  <section>
    <h2>${g.title}<span class="note">${g.note}</span></h2>
    <figure class="drawing"><img src="${imgSrc.drawing(g)}" alt="${g.title}"><figcaption><code>drawings/${g.drawing}</code><span>${g.date}</span></figcaption></figure>
    <div class="renders">${g.shots.map((s) => `<figure><img src="${imgSrc.shot(s)}" alt="${s.label}"><figcaption>${caption(s.label)}</figcaption></figure>`).join('')}</div>
  </section>`).join('\n');
  const body = `
<title>הציורים מול הדמויות</title>
<link rel="stylesheet" href="${FONTS}">
<style>${CSS}</style>
<div class="wrap" dir="rtl">
  <header>
    <h1>הציורים מול הדמויות</h1>
    <p>כל ציור של הילדים, ולידו הדמויות שנבנו ממנו במשחקים.<span class="en">Every drawing the kids made, next to the characters the games built from it. Dino Maze was described out loud rather than drawn, and the Scribble Monster is Claude's own, so neither is here.</span></p>
  </header>
  ${sections}
  <footer>Rendered from the games themselves: <code>npm run render:characters</code> poses each character in its own scene, facing the camera, and grabs the canvas. The dates are when each drawing was handed over.</footer>
</div>`;
  if (fragment) return `<script>document.documentElement.setAttribute('dir','rtl');document.documentElement.lang='he';</script>\n${body}`;
  return `<!doctype html>\n<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${body}</html>`;
}

// ---------- main ----------
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
try {
  await waitForServer(`http://localhost:${PORT}/`);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
  const dataUris = {};
  for (const game of Object.keys(PAGES)) {
    const { path, hook } = PAGES[game];
    await page.goto(`http://localhost:${PORT}${path}?sim`);
    await page.waitForFunction((h) => !!window[h], hook, { timeout: 30000 });
    for (const g of GROUPS.filter((x) => x.game === game)) {
      for (const s of g.shots) {
        const url = await page.evaluate(POSERS[game], s.kind);
        dataUris[s.id] = url;
        writeFileSync(resolve(out, `${s.id}.png`), Buffer.from(url.split(',')[1], 'base64'));
        console.log(`✓ ${s.id}`);
      }
    }
  }
  await browser.close();
  const drawings = Object.fromEntries(GROUPS.map((g) => [g.drawing, drawingDataUri(g.drawing)]));
  writeFileSync(resolve(out, 'index.html'), pageHtml(GROUPS, { drawing: (g) => `../drawings/${g.drawing}`, shot: (s) => `${s.id}.png` }, { fragment: false }));
  const artifact = pageHtml(GROUPS, { drawing: (g) => drawings[g.drawing], shot: (s) => dataUris[s.id] }, { fragment: true });
  writeFileSync(resolve(out, 'artifact.html'), artifact);
  console.log(`\n${Object.keys(dataUris).length} renders → renders/ · index.html · artifact.html (${(artifact.length / 1024 / 1024).toFixed(1)} MB)`);
} finally {
  vite.kill();
}
