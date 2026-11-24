import './kit/shell.css';
import { createInput } from './kit/input.js';
import { createHud } from './kit/hud.js';
import { beep, noise, chord } from './kit/audio.js';
import rig from './zikit-rig.json';
import chamUrl from './assets/zikit/chameleon.webp';
import monUrl from './assets/zikit/monster.webp';
import forestUrl from './assets/zikit/forest.webp';

// "הזיקית בורחת" by גבריאל ומיכאלה (Gabriel and Michaela) — the rules, in their handwriting on drawings/zikit-1-page.webp:
//   "יש זיקית שבורחת ממפלצת שמנסה לדרוך עליה. לזיקית יש לב 1. אנחנו הזיקית. ברקע יש יער."
//   There is a chameleon running away from a monster that tries to step on it. The chameleon
//   has one heart. We are the chameleon. In the background there is a forest.
// Every character on screen is cut straight out of the drawing by scripts/zikit-cutouts.py:
// the chameleon with its colourful hair (drawings/zikit-4-chameleon.webp), the blue monster
// with her clown, bracelets, underwear, walking stick, horns, elephant ears and the poop on
// her head (drawings/zikit-2-monster.webp), the four trees that are repeated into the forest
// (drawings/zikit-3-trees.png) and the little pencil bug beside her arm. Verb sheet:
// design/zikit.md.

const SIM = new URLSearchParams(location.search).has('sim');

// ---------- Knobs (design/zikit.md) ----------
const RUN_V = 6.4;                  // the chameleon's top speed, metres a second
const ACCEL = 60, FRICTION = 50, AIR_ACCEL = 34;
const G = 34, JUMP_V = 11;          // a held jump: 1.8 m up, 0.65 s in the air
const CUT = 0.5, MIN_HOLD = 0.12, COYOTE = 0.09, BUFFER = 0.13;   // even a tap gets over a wave
const KILL_HALF = 0.95;             // half of what comes down on you: her body, shoe to shoe and a bit
const CHAM_HALF = 0.5;              // the part of the chameleon that counts (not the tail curl, not the hair)
const HOVER_Y = 2.7, LOW_Y = 1.5;   // how high her shoes hang while she aims; the low second hop
const FALL_G = 95;
const WARN_0 = 1.15, WARN_MIN = 0.55, WARN_RAMP = 14;      // seconds of red scribble before she drops
const CHASE_V = 24;                 // she is always faster than you in the air
const HOVER_MIN = 0.35, HOVER_MAX = 2.4, RISE_T = 0.45, LOCK_T = 0.28;
const TRACK_0 = 1.2, TRACK_MAX = 3;                        // how fast the scribble creeps after you
const REST_0 = 1.2, REST_MIN = 0.6, REST_RAMP = 10;
const LEAD_FROM = 2, LEAD_OFTEN = 0.8;                     // after two easy stomps she lands where you are GOING to be
const WAVE_FROM = 2, WAVE_V = 7, WAVE_R0 = 3.2, WAVE_R1 = 7, WAVE_RAMP = 10;
const STUN_T = 0.75, IMMUNE_T = 0.6;
const POOP_FROM = 4, POOP_CHANCE = 0.5, POOP_OFTEN = 0.85, POOP_LIFE = 7, POOP_SLOW = 0.4, POOP_GROW = 2.5, POOP_G = 30;
const DOUBLE_FROM = 8, DOUBLE_CHANCE = 0.3, DOUBLE_OFTEN = 0.6;
const TONGUE_R = 3.3, TONGUE_OUT = 0.09, TONGUE_BACK = 0.14, TONGUE_COOL = 0.25;
const BUG_PTS = 10, DODGE_PTS = 5, CLOSE_PTS = 10, CLOSE_R = 1.1;
const SHAKE_R = 2.8;                // a tree this close to where she lands drops its bugs
const BUG_MAX = 9;
const SUB = 1 / 120;

// sprite pixels → metres
const CHAM_PX = 2.6 / 644;          // tail curl to hair tip
const MON_PX = 5 / 1062;            // fist to tail fin
const TREE_PX = 3.4 / 465;          // the tallest tree
const BUG_PX = 0.62 / 152;

const TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const approach = (v, to, step) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));
const ease = (t) => t * t * (3 - 2 * t);
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// the same tree stands in the same place every time you run past it
const hash = (i, seed) => {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(seed + 11, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const spring = (s, target, k, d, dt) => { s.v += (k * (target - s.a) - d * s.v) * dt; s.a += s.v * dt; };

const warnOf = (n) => WARN_MIN + (WARN_0 - WARN_MIN) * Math.exp(-n / WARN_RAMP);
const restOf = (n) => REST_MIN + (REST_0 - REST_MIN) * Math.exp(-n / REST_RAMP);
const trackOf = (n) => Math.min(TRACK_MAX, TRACK_0 + n * 0.09);
const waveOf = (n) => (n < WAVE_FROM ? 0 : WAVE_R0 + (WAVE_R1 - WAVE_R0) * (1 - Math.exp(-(n - WAVE_FROM) / WAVE_RAMP)));

// ---------- Page ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput({ touch: 'auto' });
input.touch?.setLabels({ a: '⤒', b: '👅' });
const hud = createHud(null, { gameId: 'zikit', music: { seed: 47, bpm: 132, root: 57 } });

const art = { ready: false };
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`could not load ${url}`));
    im.src = url;
  });
}
const loaded = Promise.all([loadImage(chamUrl), loadImage(monUrl), loadImage(forestUrl)]).then(([c, m, f]) => {
  Object.assign(art, { cham: c, mon: m, forest: f, ready: true });
});

const PAPER = '#f8f5ec', PENCIL = '#77736c', RED = '#d92c2c', TONGUE = '#e23a55';
const view = { W: 1, H: 1, dpr: 1, s: 60, groundY: 0, viewW: 16, ground: null, danger: [], hills: null };
const TREES = ['treeA', 'treeB', 'treeC', 'bush'];
// Three rows of the same four trees. In a kid's drawing a row drawn higher up is further away,
// so the far rows stand on their own fainter ground lines.
const ROWS = [
  { par: 0.22, scale: 0.4, alpha: 0.3, cell: 1.7, lift: 1.55, seed: 11, density: 0.9 },
  { par: 0.5, scale: 0.66, alpha: 0.55, cell: 2.5, lift: 0.75, seed: 23, density: 0.85 },
  { par: 1, scale: 1, alpha: 1, cell: 3.4, lift: 0, seed: 37, density: 0.72 },
];
const NEAR = ROWS[2];

function pencilLine(g, pts, width, color, alpha = 1) {
  g.save();
  g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  g.stroke();
  g.restore();
}
function makeCanvas(w, h, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  return [c, g];
}
function buildTextures() {
  const { dpr, s } = view;
  const r = rng(20261124);
  // the ground: one long wobbly pencil line that joins up with itself
  const GW = 1400;
  const [gc, gg] = makeCanvas(GW, 16, dpr);
  for (const [w, a, off] of [[2.2, 0.9, 0], [1.1, 0.4, 2.5]]) {
    const pts = [];
    for (let i = 0; i <= 28; i++) pts.push([(i / 28) * GW, 8 + off + (i === 0 || i === 28 ? 0 : (r() - 0.5) * 3.2)]);
    pencilLine(gg, pts, w, PENCIL, a);
  }
  view.ground = gc; view.groundW = GW;
  // the red scribble where she will land: two versions, so it boils like a marker drawing
  view.danger = [];
  const dw = Math.ceil(KILL_HALF * 2 * s * 1.08), dh = Math.max(16, Math.ceil(s * 0.5));
  for (let v = 0; v < 2; v++) {
    const [dc, dg] = makeCanvas(dw, dh, dpr);
    for (const [n, width, alpha] of [[18, 0.1, 0.55], [30, 0.065, 0.95]]) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n, edge = Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
        const x = 5 + u * (dw - 10) + (r() - 0.5) * 6;
        pts.push([x, dh / 2 + (i % 2 ? 1 : -1) * (0.25 + 0.75 * edge) * (dh / 2 - 4) * (0.7 + r() * 0.3)]);
      }
      pencilLine(dg, pts, Math.max(2.4, s * width), RED, alpha);
    }
    view.danger.push(dc);
  }
  view.dangerW = dw; view.dangerH = dh;
  // faint pencil hills far behind everything, like the big pencil shapes on the page
  const HW = 2200, HH = Math.ceil(s * 6);
  const [hc, hg] = makeCanvas(HW, HH, dpr);
  const pts = [];
  const bumps = 9;
  for (let i = 0; i <= bumps * 6; i++) {
    const u = i / (bumps * 6);
    const hgt = 0.42 + 0.3 * Math.sin(u * Math.PI * 2 * 3 + 1) + 0.2 * Math.sin(u * Math.PI * 2 * 7 + 2.4);
    pts.push([u * HW, HH - 6 - Math.max(0.08, hgt) * (HH - 20) + (i === 0 || i === bumps * 6 ? 0 : (r() - 0.5) * 9)]);
  }
  pts[pts.length - 1][1] = pts[0][1];
  pencilLine(hg, pts, 1.6, PENCIL, 0.3);
  view.hills = hc; view.hillsW = HW; view.hillsH = HH;
}
function resize() {
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  view.W = window.innerWidth;
  view.H = window.innerHeight;
  canvas.width = Math.round(view.W * view.dpr);
  canvas.height = Math.round(view.H * view.dpr);
  // about 16 metres across in landscape; a phone held upright sees less forest but the same monster
  view.s = Math.max(20, Math.min(view.H / 9.4, view.W / (view.W < view.H ? 10.5 : 16)));
  view.groundY = Math.round(Math.min(view.H * 0.84, view.H / 2 + 4.1 * view.s));
  view.viewW = view.W / view.s;
  buildTextures();
}
resize();
window.addEventListener('resize', resize);
const X = (x, par = 1) => (x - cam.x * par) * view.s + view.W / 2;
const Y = (y) => view.groundY - y * view.s;

// ---------- State ----------
const st = {
  mode: 'demo',        // demo (the bot plays behind the intro card) | play | over
  seed: 1, t: 0, anim: 0,
  points: 0, maxX: 0, eaten: 0, dodged: 0, close: 0,
  shake: 0, hitstop: 0, overT: 0, overShown: false, hintT: 0,
  bugT: 0, spawns: true,
  get score() { return st.points + Math.floor(Math.max(0, st.maxX)); },
};
const P = {};      // the chameleon
const M = {};      // the monster
const cam = { x: 0 };
let bugs = [], waves = [], splats = [], dust = [], pops = [];
let flying = null;                  // the poop in the air
const shaken = new Map();           // near-row tree index → seconds of shaking left
let rand = rng(1);
const told = new Set();              // each of her tricks is explained once, the first time it happens
function tell(key, text) {
  if (st.mode !== 'play' || told.has(key)) return;
  told.add(key);
  hud.flash(text, { dur: 1500 });
}
const virt = { x: 0, jump: false, hold: false, tongue: false };   // test input
const bot = { on: false, delay: 0.12, seen: 0, hold: 0 };

function reset(mode, seed = (Math.random() * 2 ** 31) | 0) {
  rand = rng(seed);
  Object.assign(st, {
    mode, seed, t: 0, points: 0, maxX: 0, eaten: 0, dodged: 0, close: 0,
    shake: 0, hitstop: 0, overT: 0, overShown: false, hintT: mode === 'play' ? 10 : 0, bugT: 1.2, spawns: true,
  });
  Object.assign(P, {
    x: 0, y: 0, vx: 0, vy: 0, pvx: 0, pvy: 0, fax: 0, fay: 0, face: 1,
    ground: true, coyote: 0, buffer: 0, cut: false, jumpT: 0,
    stun: 0, immune: 0, sticky: 0, wasSticky: false, spin: 0,
    phase: 0, sq: { a: 0, v: 0 }, tail: { a: 0, v: 0 }, hair: [0, 1, 2, 3].map(() => ({ a: 0, v: 0 })),
    tongue: null, tongueCool: 0, dead: false, flat: 0,
  });
  Object.assign(M, {
    x: -10, y: HOVER_Y + 1.6, vx: 0, vy: 0, state: 'hover', t: -1.3, warnT: WARN_0, n: 0,
    flip: -1, lead: 0, low: false, aimX: 0, poop: 1, wantPoop: false, threw: false, anim: 0,
    sq: { a: 0, v: 0 }, wob: { a: 0, v: 0 }, clown: { a: 0, v: 0 }, ear: { a: 0, v: 0 }, tail: { a: 0, v: 0 },
    arm: { a: 0, v: 0 }, stick: { a: 0, v: 0 }, poopW: { a: 0, v: 0 }, laugh: 0,
  });
  bugs = []; waves = []; splats = []; dust = []; pops = []; flying = null;
  shaken.clear();
  cam.x = 1.2;
  Object.assign(virt, { x: 0, jump: false, hold: false, tongue: false });
  Object.assign(bot, { seen: 0, hold: 0 });
  lastHeart = null;
}

// ---------- Sound ----------
const quiet = () => st.mode === 'demo';
const sfx = {
  jump() { if (!quiet()) beep(420, 0, 0.12, 'square', 0.07, 760); },
  land() { if (!quiet()) noise(0.06, 500, 0.06); },
  warn() { if (!quiet()) { beep(300, 0, 0.14, 'sawtooth', 0.05, 520); beep(300, 0.16, 0.14, 'sawtooth', 0.05, 620); } },
  fall() { if (!quiet()) beep(900, 0, 0.22, 'triangle', 0.08, 140); },
  stomp() { if (!quiet()) { noise(0.35, 140, 0.34, 0, 0.7); beep(70, 0, 0.3, 'sine', 0.3, 38); } },
  stun() { if (!quiet()) beep(520, 0, 0.3, 'square', 0.07, 180); },
  tongue() { if (!quiet()) beep(700, 0, 0.07, 'triangle', 0.08, 1300); },
  eat() { if (!quiet()) chord([880, 1320], 0.06, 0.1, 'square', 0.07); },
  miss() { if (!quiet()) beep(300, 0, 0.08, 'triangle', 0.05, 220); },
  poop() { if (!quiet()) beep(240, 0, 0.3, 'sawtooth', 0.06, 90); },
  splat() { if (!quiet()) noise(0.18, 320, 0.16, 0, 0.6); },
  yuck() { if (!quiet()) beep(190, 0, 0.18, 'square', 0.06, 120); },
  close() { if (!quiet()) chord([660, 880, 1100], 0.05, 0.12, 'square', 0.06); },
  over() { if (!quiet()) chord([392, 330, 262, 196], 0.16, 0.3, 'triangle', 0.12); },
};

// ---------- The forest ----------
// tree `i` of a row: where it stands, which of the four drawings it is, how big, which way round
function treeAt(row, i) {
  if (hash(i, row.seed) > row.density) return null;
  const kind = TREES[Math.floor(hash(i, row.seed + 1) * 3.999)];
  const sprite = rig.forest[kind];
  const size = row.scale * (0.82 + hash(i, row.seed + 2) * 0.4) * (kind === 'bush' ? 0.95 : 1);
  return {
    i, kind, sprite, size,
    x: (i + 0.5 + (hash(i, row.seed + 3) - 0.5) * 0.6) * row.cell,
    flip: hash(i, row.seed + 4) < 0.5 ? -1 : 1,
    top: sprite.pivot[1] * TREE_PX * size,
  };
}
function nearTrees(x0, x1) {
  const out = [];
  for (let i = Math.floor(x0 / NEAR.cell) - 1; i <= Math.ceil(x1 / NEAR.cell); i++) {
    const t = treeAt(NEAR, i);
    if (t && t.x >= x0 && t.x <= x1) out.push(t);
  }
  return out;
}
function addBug(x, y, vx = 0, vy = 0, life = 12) {
  if (bugs.length >= BUG_MAX) return null;
  const b = { x, y, vx, vy, home: clamp(y, 0.9, 2.6), ph: rand() * 6.28, life, caught: false, wing: rand() * 6.28 };
  bugs.push(b);
  return b;
}
function shakeTrees(x) {
  for (const t of nearTrees(x - SHAKE_R, x + SHAKE_R)) {
    shaken.set(t.i, 0.7);
    const n = 2 + (rand() < 0.4 ? 1 : 0);
    for (let k = 0; k < n; k++) addBug(t.x + (rand() - 0.5) * 0.8, t.top * (0.6 + rand() * 0.3), (rand() - 0.5) * 5, 1 + rand() * 3, 8.5);
    for (let k = 0; k < 5; k++) dust.push({ kind: 'leaf', x: t.x + (rand() - 0.5) * 1.2, y: t.top * (0.6 + rand() * 0.35), vx: (rand() - 0.5) * 3, vy: 1 + rand() * 2, life: 0.9, max: 0.9, rot: rand() * 6 });
  }
}

// ---------- The monster ----------
function planHop() {
  const n = M.n;
  // on your head at first; later mostly ahead of a runner, and now and then a short feint
  if (M.low || n < LEAD_FROM) M.lead = 0;
  else M.lead = rand() < Math.min(LEAD_OFTEN, 0.4 + (n - LEAD_FROM) * 0.06) ? 1 : 0.15 + rand() * 0.5;
  M.wantPoop = !M.low && n >= POOP_FROM && rand() < Math.min(POOP_OFTEN, POOP_CHANCE + (n - POOP_FROM) * 0.03);
  M.threw = false;
}
function throwPoop() {
  M.threw = true; M.poop = 0;
  tell('poop', 'זהירות, קקי! 💩');
  const x0 = M.x + M.flip * 0.3, y0 = M.y + 3.3;
  // it lands about where a runner will pull up, so backing away from her is slow and sticky
  const vy = 5, T = (vy + Math.sqrt(vy * vy + 2 * POOP_G * y0)) / POOP_G;
  const tx = P.x + P.vx * T * 0.6 + (rand() - 0.5) * 1.6;
  flying = { x: x0, y: y0, vx: (tx - x0) / T, vy, rot: 0 };
  M.poopW.v -= 6;
  sfx.poop();
}
function land() {
  const n = M.n;
  M.y = 0; M.vy = 0; M.n = n + 1;
  M.sq.v += 9; M.clown.v += 7; M.ear.v -= 6; M.arm.v -= 5; M.stick.v -= 6; M.poopW.v += 8;
  st.shake = Math.max(st.shake, M.low ? 0.6 : 1);
  sfx.stomp();
  for (let k = 0; k < 9; k++) {
    const dir = k % 2 ? 1 : -1;
    dust.push({ kind: 'puff', x: M.x + dir * (0.3 + rand() * 0.9), y: 0.08, vx: dir * (1.5 + rand() * 3.5), vy: 0.6 + rand() * 1.8, life: 0.55, max: 0.55, R: 0.16 + rand() * 0.18 });
  }
  const d = Math.abs(P.x - M.x);
  if (!P.dead && d < KILL_HALF + CHAM_HALF) return squash();   // jumping does not help: she comes from above
  // missed
  if (st.mode !== 'over' && !P.dead) {
    st.dodged++;
    let pts = DODGE_PTS, text = `+${DODGE_PTS}`;
    if (d < KILL_HALF + CHAM_HALF + CLOSE_R) { pts += CLOSE_PTS; text = `כמעט! +${pts}`; st.close++; sfx.close(); }
    st.points += pts;
    pops.push({ x: P.x, y: P.y + 1.3, text, life: 1, max: 1, color: '#2f8a25' });
    hud.pop('#score');
  }
  const R = waveOf(n);
  if (R > 0) {
    for (const dir of [-1, 1]) waves.push({ x: M.x + dir * KILL_HALF, dir, left: R, max: R });
    tell('wave', 'קופצים מעל הגל!');
  }
  shakeTrees(M.x);
  // sometimes she bounces straight into a second, lower hop
  M.low = !M.low && n >= DOUBLE_FROM && rand() < Math.min(DOUBLE_OFTEN, DOUBLE_CHANCE + (n - DOUBLE_FROM) * 0.025);
  M.state = 'rest';
  M.t = M.low ? 0.3 : restOf(n);
}
function squash() {
  P.dead = true; P.vx = P.vy = 0; P.y = 0; P.tongue = null;
  P.x = clamp(P.x, M.x - KILL_HALF, M.x + KILL_HALF);
  st.mode = st.mode === 'demo' ? 'demo' : 'over';
  st.overT = 0; st.hitstop = 0.14; st.shake = 1;
  M.state = 'done'; M.t = 0;
  for (let k = 0; k < 7; k++) dust.push({ kind: 'star', x: P.x + (rand() - 0.5) * 1.6, y: 0.5 + rand() * 0.6, vx: (rand() - 0.5) * 5, vy: 2 + rand() * 4, life: 1.1, max: 1.1, rot: rand() * 6 });
  if (st.mode === 'over') { hud.stopMusic(); sfx.over(); }
}
function stepMonster(dt) {
  const n = M.n;
  M.anim += dt;
  if (M.poop < 1) M.poop = Math.min(1, M.poop + dt / POOP_GROW);
  const hoverY = M.low ? LOW_Y : HOVER_Y;
  // she turns to face the chameleon, but not while she is committed to a drop
  if (M.state === 'hover' || M.state === 'rise') {
    if (P.x > M.x + 0.7) M.flip = -1; else if (P.x < M.x - 0.7) M.flip = 1;
  }
  if (M.state === 'hover') {
    M.t += dt;
    const warn = warnOf(n) * (M.low ? 0.65 : 1);
    M.aimX = P.x + P.vx * (warn + Math.sqrt((2 * hoverY) / FALL_G)) * M.lead;
    const dx = M.aimX - M.x;
    M.vx += (clamp(dx * 5, -CHASE_V, CHASE_V) - M.vx) * Math.min(1, 9 * dt);
    M.x += M.vx * dt;
    M.y += (hoverY - M.y) * Math.min(1, 5 * dt);
    if (M.wantPoop && !M.threw && M.t > 0.3 && M.poop >= 1 && Math.abs(P.x - M.x) < 7 && splats.length < 3 && !flying) throwPoop();
    if (M.t > 0 && ((Math.abs(dx) < 0.45 && M.t > HOVER_MIN) || M.t > (M.low ? 0.7 : HOVER_MAX))) {
      M.state = 'warn'; M.t = M.warnT = Math.max(0.45, warn); M.vx = 0;
      if (M.lead === 1 && Math.abs(P.vx) > 3) tell('ahead', 'עוצרים! היא נוחתת לפניכם');
      sfx.warn();
    }
  } else if (M.state === 'warn') {
    M.t -= dt;
    if (M.t > LOCK_T) {          // the scribble still creeps to where you are heading; in the last moment it stays put
      const d = P.x + P.vx * (M.t + Math.sqrt((2 * hoverY) / FALL_G)) * M.lead - M.x;
      M.x += Math.sign(d) * Math.min(Math.abs(d), trackOf(n) * dt);
    }
    M.y += (hoverY - M.y) * Math.min(1, 5 * dt);
    if (M.t <= 0) { M.state = 'fall'; M.vy = 0; sfx.fall(); }
  } else if (M.state === 'fall') {
    M.vy -= FALL_G * dt;
    M.y += M.vy * dt;
    if (M.y <= 0) land();
  } else if (M.state === 'rest') {
    M.t -= dt;
    if (M.t <= 0) { M.state = 'rise'; M.t = 0; planHop(); }
  } else if (M.state === 'rise') {
    M.t += dt;
    M.y = hoverY * ease(Math.min(1, M.t / RISE_T));
    if (M.t >= RISE_T) { M.state = 'hover'; M.t = 0; }
  } else if (M.state === 'done') {
    M.t += dt; M.laugh += dt;
  }
  // everything that dangles from her
  const air = M.state === 'hover' || M.state === 'warn' || M.state === 'rise';
  const up = M.state === 'fall' || M.state === 'rest' || M.state === 'done';
  spring(M.sq, 0, 190, 13, dt);
  spring(M.wob, air ? Math.sin(M.anim * 1.4) * 0.03 - M.vx * 0.006 * M.flip : 0, 60, 9, dt);
  spring(M.clown, Math.sin(M.anim * 2.3) * 0.07 + (M.state === 'fall' ? -0.25 : 0), 70, 5, dt);
  spring(M.ear, Math.sin(M.anim * 5.2) * (air ? 0.12 : 0.03) + (M.state === 'fall' ? -0.35 : 0), 90, 8, dt);
  spring(M.tail, (up ? -0.5 : Math.sin(M.anim * 3.1) * 0.05), up ? 150 : 40, up ? 16 : 7, dt);   // up and out of the way when she lands
  spring(M.arm, M.state === 'warn' ? 0.13 : Math.sin(M.anim * 1.7) * 0.03, 80, 9, dt);
  spring(M.stick, M.state === 'warn' ? 0.12 : Math.sin(M.anim * 1.9 + 1) * 0.04, 80, 9, dt);
  spring(M.poopW, Math.sin(M.anim * 4.3) * 0.03, 120, 7, dt);
}

// ---------- The chameleon ----------
function botInput(dt) {
  const out = { x: 1, jump: false, hold: bot.hold > 0, tongue: false };
  bot.hold = Math.max(0, bot.hold - dt);
  const threat = M.state === 'warn' || M.state === 'fall';
  bot.seen = threat ? bot.seen + dt : 0;
  if (threat && bot.seen >= bot.delay) {
    const d = P.x - M.x, zone = KILL_HALF + CHAM_HALF + 0.45;
    if (Math.abs(d) < zone) out.x = d >= 0 ? 1 : -1;      // on the scribble: out by the nearer side
    else out.x = d < 0 ? 0 : 1;                           // it is ahead: wait for her to land
  }
  if (P.ground) {
    for (const w of waves) if ((P.x - w.x) * w.dir > 0 && Math.abs(P.x - w.x) < 1.15) { out.jump = true; bot.hold = 0.3; }
    for (const s of splats) if (out.x && (s.x - P.x) * out.x > 0 && Math.abs(s.x - P.x) < 1.05) { out.jump = true; bot.hold = 0.3; }
  }
  if (P.tongueCool <= 0 && !P.tongue && bugs.some((b) => !b.caught && Math.hypot(b.x - P.x, b.y - P.y - 0.3) < TONGUE_R * 0.85)) out.tongue = true;
  out.hold = out.hold || out.jump;
  return out;
}
let upPressed = false;
window.addEventListener('keydown', (e) => {
  if (e.repeat || hud.overlayOpen()) return;
  if (e.code === 'ArrowUp' || e.code === 'KeyW') upPressed = true;
});
function readInput(dt) {
  if (st.mode === 'demo' || bot.on) { upPressed = false; return botInput(dt); }
  const ax = input.p1.axis();
  const upHeld = input.keys.has('ArrowUp') || input.keys.has('KeyW');
  const out = {
    x: clamp((Math.abs(ax.x) > 0.22 ? Math.sign(ax.x) * Math.min(1, Math.abs(ax.x) * 1.4) : 0) + virt.x, -1, 1),
    jump: input.p1.consume('a') || upPressed || virt.jump,
    hold: input.p1.down('a') || upHeld || virt.hold,
    tongue: input.p1.consume('b') || virt.tongue,
  };
  upPressed = false; virt.jump = false; virt.tongue = false;
  return out;
}
const mouth = () => ({ x: P.x + P.face * rig.chameleon.marks.mouth[0] * CHAM_PX, y: P.y - rig.chameleon.marks.mouth[1] * CHAM_PX });
function shootTongue() {
  const m = mouth();
  let best = null, bd = TONGUE_R;
  for (const b of bugs) {
    if (b.caught) continue;
    const d = Math.hypot(b.x - m.x, b.y - m.y);
    if (d < bd) { bd = d; best = b; }
  }
  if (best) {
    if (Math.abs(best.x - P.x) > 0.3) P.face = Math.sign(best.x - P.x);
    best.caught = true;
    P.tongue = { bug: best, t: 0, phase: 'out', tx: best.x, ty: best.y };
  } else P.tongue = { bug: null, t: 0, phase: 'out', tx: m.x + P.face * 2.1, ty: m.y + 0.5 };
  P.tongueCool = TONGUE_OUT + TONGUE_BACK + TONGUE_COOL;
  sfx.tongue();
}
function eat(b) {
  bugs = bugs.filter((x) => x !== b);
  st.eaten++; st.points += BUG_PTS;
  pops.push({ x: P.x + P.face * 0.6, y: P.y + 1.1, text: `+${BUG_PTS}`, life: 0.9, max: 0.9, color: '#c9302c' });
  P.sq.v -= 3;
  for (const h of P.hair) h.v += 3;
  hud.pop('#score');
  sfx.eat();
}
function stepChameleon(dt, ctl) {
  P.pvx = P.vx; P.pvy = P.vy;
  P.tongueCool = Math.max(0, P.tongueCool - dt);
  P.immune = Math.max(0, P.immune - dt);
  P.sticky = Math.max(0, P.sticky - dt);
  if (P.dead) { P.flat = Math.min(1, P.flat + dt * 14); return; }
  const stunned = P.stun > 0;
  if (stunned) {
    P.stun -= dt; P.spin += dt * 9;
    if (P.stun <= 0) { P.spin = 0; P.immune = IMMUNE_T; }
    ctl = { x: 0, jump: false, hold: false, tongue: false };
  }
  if (ctl.jump) P.buffer = BUFFER;
  if (ctl.tongue && !P.tongue && P.tongueCool <= 0) shootTongue();

  const top = RUN_V * (P.sticky > 0 ? POOP_SLOW : 1);
  if (ctl.x && !P.tongue?.bug) P.face = Math.sign(ctl.x);
  if (!stunned) P.vx = approach(P.vx, ctl.x * top, (P.ground ? (ctl.x ? ACCEL : FRICTION) : AIR_ACCEL) * dt);
  else if (P.ground) P.vx = approach(P.vx, 0, FRICTION * 0.4 * dt);
  P.buffer = Math.max(0, P.buffer - dt);
  P.coyote = P.ground ? COYOTE : Math.max(0, P.coyote - dt);
  if (P.buffer > 0 && P.coyote > 0 && !stunned) {
    P.vy = JUMP_V; P.ground = false; P.coyote = 0; P.buffer = 0; P.cut = false; P.jumpT = 0;
    P.sq.v -= 5;
    dust.push({ kind: 'puff', x: P.x - P.face * 0.3, y: 0.06, vx: -P.face * 1.2, vy: 0.8, life: 0.35, max: 0.35, R: 0.12 });
    sfx.jump();
  }
  if (!P.ground) {
    P.jumpT += dt;
    if (!ctl.hold && P.vy > 0 && !P.cut && !stunned && P.jumpT >= MIN_HOLD) { P.vy *= CUT; P.cut = true; }
    P.vy -= G * dt;
  }
  P.x += P.vx * dt;
  P.y += P.vy * dt;
  if (P.y <= 0 && !P.ground) {
    P.y = 0; P.ground = true;
    P.sq.v += Math.min(7, -P.vy * 0.45);
    P.vy = 0;
    sfx.land();
  }
  P.phase += Math.abs(P.vx) * dt * 2.9;
  st.maxX = Math.max(st.maxX, P.x);

  // what her landing sends along the ground
  for (const w of waves) {
    if (!w.hit && P.ground && !stunned && P.immune <= 0 && Math.abs(P.x - w.x) < 0.42) {
      w.hit = true;
      P.stun = STUN_T; P.spin = 0; P.vx = w.dir * 3.2; P.vy = 5.5; P.ground = false; P.tongue = null;
      bugs.forEach((b) => { b.caught = false; });
      pops.push({ x: P.x, y: 1.3, text: 'אוי!', life: 0.8, max: 0.8, color: '#b93007' });
      sfx.stun();
    }
  }
  // the poop she threw
  let inPoop = false;
  for (const s of splats) if (P.ground && Math.abs(P.x - s.x) < 0.6) inPoop = true;
  if (inPoop) {
    if (!P.wasSticky) { pops.push({ x: P.x, y: 1.2, text: 'איכס!', life: 0.8, max: 0.8, color: '#6b3d1e' }); sfx.yuck(); }
    P.sticky = 0.3;
    if (Math.abs(P.vx) > 0.5 && rand() < dt * 14) dust.push({ kind: 'drop', x: P.x - P.face * 0.3, y: 0.08, vx: -P.face * (0.5 + rand()), vy: 1.2 + rand() * 1.5, life: 0.4, max: 0.4, R: 0.05 });
  }
  P.wasSticky = P.sticky > 0;

  // the tongue
  const T = P.tongue;
  if (T) {
    T.t += dt;
    if (T.bug) { T.tx = T.bug.x; T.ty = T.bug.y; }
    if (T.phase === 'out' && T.t >= TONGUE_OUT) { T.phase = 'back'; T.t = 0; if (!T.bug) sfx.miss(); }
    else if (T.phase === 'back') {
      if (T.bug) {
        const m = mouth(), k = Math.min(1, T.t / TONGUE_BACK);
        T.bug.x = lerp(T.bug.x, m.x, k); T.bug.y = lerp(T.bug.y, m.y, k);
      }
      if (T.t >= TONGUE_BACK) { if (T.bug) eat(T.bug); P.tongue = null; }
    }
  }
  // a bug you run or jump into is eaten too
  const m = mouth();
  for (const b of bugs) if (!b.caught && Math.hypot(b.x - m.x, b.y - m.y) < 0.5) { b.caught = true; eat(b); break; }

  // squash, tail and hair follow what the body just did
  spring(P.sq, 0, 260, 15, dt);
  const ax = clamp((P.vx - P.pvx) / dt, -90, 90) * P.face, ay = clamp((P.vy - P.pvy) / dt, -150, 150);
  P.fax += (ax - P.fax) * Math.min(1, 16 * dt);
  P.fay += (ay - P.fay) * Math.min(1, 16 * dt);
  const speed = Math.abs(P.vx) / RUN_V;
  spring(P.tail, clamp(P.fax * 0.004 - P.vy * 0.012, -0.3, 0.3) + Math.sin(P.phase * 0.5) * 0.06 * speed, 70, 7, dt);
  for (let i = 0; i < 4; i++) {
    const h = P.hair[i], w = 1 + i * 0.45;
    const want = clamp(-P.fax * 0.005 * w + P.fay * 0.0022 * w - speed * 0.06 * w + Math.sin(st.anim * (9 + i * 2) + i) * 0.03 * speed * w, -0.33, 0.33);
    spring(h, want, 150 - i * 22, 9 - i, dt);
  }
}

// ---------- Everything else that moves ----------
function stepWorld(dt) {
  for (const w of waves) { const d = WAVE_V * dt; w.x += w.dir * d; w.left -= d; }
  waves = waves.filter((w) => w.left > 0);
  for (const s of splats) s.life -= dt;
  splats = splats.filter((s) => s.life > 0);
  if (flying) {
    const f = flying;
    f.vy -= POOP_G * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += dt * 7;
    if (f.y <= 0) {
      splats.push({ x: f.x, life: POOP_LIFE, born: st.t });
      for (let k = 0; k < 5; k++) dust.push({ kind: 'drop', x: f.x, y: 0.1, vx: (rand() - 0.5) * 5, vy: 2 + rand() * 3, life: 0.5, max: 0.5, R: 0.07 });
      // right on your head: you are stuck in it for a moment
      if (!P.dead && Math.abs(P.x - f.x) < 0.6 && P.y < 0.9) P.sticky = 1.2;
      flying = null;
      sfx.splat();
    }
  }
  // bugs: the pencil bug from the page, fluttering about the forest
  if (st.spawns) {
    st.bugT -= dt;
    if (st.bugT <= 0) {
      st.bugT = 2.4 + rand() * 2.2;
      if (bugs.filter((b) => !b.fromTree).length < 3) addBug(P.x + 5 + rand() * 6, 1 + rand() * 1.5, 0, 0, 14);
    }
  }
  for (const b of bugs) {
    b.life -= dt; b.ph += dt * 3.2; b.wing += dt * 26;
    if (b.caught) continue;
    b.vx *= Math.exp(-2.2 * dt); b.vy *= Math.exp(-2.2 * dt);
    const fleeing = b.life < 1;
    b.vy += ((fleeing ? 9 : b.home) - b.y) * (fleeing ? 0.9 : 5) * dt;
    b.x += (b.vx + Math.sin(b.ph * 0.7) * 0.5) * dt;
    b.y = Math.max(0.35, b.y + (b.vy + Math.cos(b.ph) * 0.35) * dt);
  }
  bugs = bugs.filter((b) => b.caught || (b.life > -2 && Math.abs(b.x - P.x) < 30));
  for (const p of dust) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind !== 'puff') p.vy -= 12 * dt;
    else { p.vx *= Math.exp(-4 * dt); p.vy *= Math.exp(-3 * dt); }
  }
  dust = dust.filter((p) => p.life > 0 && p.y > -0.3);
  for (const p of pops) { p.life -= dt; p.y += dt * 1.1; }
  pops = pops.filter((p) => p.life > 0);
  for (const [i, t] of shaken) { if (t - dt <= 0) shaken.delete(i); else shaken.set(i, t - dt); }
}

function tick(dt, ctl) {
  st.t += dt;
  stepMonster(dt);
  stepChameleon(dt, ctl);
  stepWorld(dt);
}
let acc = 0;
function step(raw) {
  st.anim += raw;
  st.shake = Math.max(0, st.shake - raw * 3.2);
  if (!art.ready) return;
  if (st.hitstop > 0) { st.hitstop -= raw; return; }
  if (st.mode === 'over' || (st.mode === 'demo' && P.dead)) {
    st.overT += raw;
    if (st.mode === 'demo' && st.overT > 1.4) return reset('demo');
    if (st.mode === 'over' && st.overT > 1.15 && !st.overShown) showGameOver();
  }
  if (st.mode === 'play') st.hintT = Math.max(0, st.hintT - raw);
  const ctl = readInput(raw);
  acc += raw;
  let first = true;
  while (acc >= SUB - 1e-9) {
    tick(SUB, first ? ctl : { ...ctl, jump: false, tongue: false });
    first = false;
    acc -= SUB;
  }
  // the camera looks a little ahead of the chameleon and leans towards the monster
  const want = P.x + P.face * 0.8 + clamp((M.x - P.x) * 0.45, -3.8, 3.8);
  cam.x += (want - cam.x) * Math.min(1, raw * 4.5);
  syncHud();
}

// ---------- Drawing ----------
function part(g, img, p) {
  g.drawImage(img, p.rect[0], p.rect[1], p.rect[2], p.rect[3], p.at[0], p.at[1], p.rect[2], p.rect[3]);
}
function hinge(g, p, angle, sx = 1, sy = 1) {
  g.translate(p.pivot[0], p.pivot[1]);
  g.rotate(angle);
  if (sx !== 1 || sy !== 1) g.scale(sx, sy);
  g.translate(-p.pivot[0], -p.pivot[1]);
}
function swung(g, img, p, angle, sx = 1, sy = 1) {
  g.save(); hinge(g, p, angle, sx, sy); part(g, img, p); g.restore();
}
function drawChameleon(g, pose = P) {
  const R = rig.chameleon.parts, k = CHAM_PX * view.s;
  const speed = Math.min(1, Math.abs(pose.vx) / RUN_V);
  const bob = pose.ground ? Math.abs(Math.sin(pose.phase)) * 0.035 * speed : 0;
  g.save();
  g.translate(X(pose.x), Y(pose.y + bob));
  if (pose.dead) g.scale(1 + 0.3 * pose.flat, 1 - 0.86 * pose.flat);
  g.scale(pose.face * k * (1 + pose.sq.a * 0.6), k * (1 - pose.sq.a * 0.6));
  if (pose.stun > 0) { g.translate(-40, -110); g.rotate(pose.spin); g.translate(40, 110); }
  else if (!pose.ground) g.rotate(clamp(-pose.vy * 0.022, -0.3, 0.3));
  if (pose.sticky > 0) g.globalAlpha = 0.92;
  let back, front;
  if (pose.stun > 0 || pose.dead) { back = Math.sin(st.anim * 22) * 0.5; front = -back; }
  else if (pose.ground) { back = Math.sin(pose.phase) * 0.6 * speed; front = -back; }
  else { back = 0.5; front = -0.55; }                       // a leap: one leg forward, one back
  swung(g, art.cham, R.tail, pose.tail.a);
  swung(g, art.cham, R.legBack, back);
  swung(g, art.cham, R.legFront, front);
  const hair = (i) => {                                     // each length of hair hangs off the one before
    g.save();
    hinge(g, R[`hair${i}`], pose.hair[i].a);
    if (i < 3) hair(i + 1);
    part(g, art.cham, R[`hair${i}`]);
    g.restore();
  };
  hair(0);
  part(g, art.cham, R.body);
  g.restore();
}
function drawTongue(g) {
  const T = P.tongue;
  if (!T) return;
  const m = mouth();
  const k = T.phase === 'out' ? Math.min(1, T.t / TONGUE_OUT) : (T.bug ? 1 : 1 - Math.min(1, T.t / TONGUE_BACK));
  const tx = T.phase === 'back' && T.bug ? T.bug.x : lerp(m.x, T.tx, k), ty = T.phase === 'back' && T.bug ? T.bug.y : lerp(m.y, T.ty, k);
  const midx = (m.x + tx) / 2, midy = (m.y + ty) / 2 - 0.18;
  pencilLine(g, [[X(m.x), Y(m.y)], [X(midx), Y(midy)], [X(tx), Y(ty)]], Math.max(3, view.s * 0.085), TONGUE);
  g.fillStyle = TONGUE;
  g.beginPath(); g.arc(X(tx), Y(ty), Math.max(3.5, view.s * 0.09), 0, 6.3); g.fill();
}
function drawMonster(g) {
  const R = rig.monster.parts, k = MON_PX * view.s;
  const air = M.state === 'hover' || M.state === 'warn' || M.state === 'rise';
  const jitter = M.state === 'warn' ? Math.sin(st.anim * 70) * 0.035 * (1 - M.t / M.warnT + 0.4) : 0;
  const laugh = M.state === 'done' ? Math.abs(Math.sin(M.laugh * 9)) * 0.06 : 0;
  g.save();
  g.translate(X(M.x + jitter), Y(M.y + (air ? Math.sin(M.anim * 2.4) * 0.09 : 0) + laugh));
  const stretch = M.state === 'fall' ? clamp(-M.vy * 0.006, 0, 0.12) : 0;
  g.scale(M.flip * k * (1 + M.sq.a * 0.5 - stretch), k * (1 - M.sq.a * 0.5 + stretch));
  g.rotate(M.wob.a);
  const kick = M.state === 'warn' ? Math.sin(M.anim * 30) * 0.5 : air ? Math.sin(M.anim * 8) * 0.3 : 0;
  swung(g, art.mon, R.tail, M.tail.a);
  swung(g, art.mon, R.ear, M.ear.a);
  swung(g, art.mon, R.legL, kick, 1, 1 - M.sq.a * 0.4);
  swung(g, art.mon, R.legR, -kick, 1, 1 - M.sq.a * 0.4);
  swung(g, art.mon, R.stick, M.stick.a);
  swung(g, art.mon, R.armLow, M.arm.a * 0.6);
  swung(g, art.mon, R.armHorn, M.arm.a);
  swung(g, art.mon, R.clown, M.clown.a);
  if (M.poop > 0.02) swung(g, art.mon, R.poop, M.poopW.a, M.poop, M.poop * (1 - M.sq.a * 0.3));
  part(g, art.mon, R.core);
  g.restore();
}
function drawTree(g, row, t, sway) {
  const sp = t.sprite, k = TREE_PX * t.size * view.s;
  g.save();
  g.translate(X(t.x, row.par), Y(row.lift));
  g.rotate(sway);
  g.scale(t.flip * k, k);
  g.drawImage(art.forest, sp.rect[0], sp.rect[1], sp.rect[2], sp.rect[3], -sp.pivot[0], -sp.pivot[1], sp.rect[2], sp.rect[3]);
  g.restore();
}
function drawForest(g) {
  const { W, s, viewW } = view;
  // the pencil hills
  const hx = -((cam.x * 0.1 * s) % view.hillsW);
  g.globalAlpha = 0.38;
  for (let x = hx - view.hillsW; x < W; x += view.hillsW) g.drawImage(view.hills, x, Y(0.9) - view.hillsH, view.hillsW, view.hillsH);
  g.globalAlpha = 1;
  for (const row of ROWS) {
    const centre = cam.x * row.par, half = viewW / 2 + 3;
    g.globalAlpha = row.alpha;
    if (row.lift) {                                       // the far rows' own ground lines
      const gx = -(((centre * s) % view.groundW) + view.groundW) % view.groundW;
      for (let x = gx; x < W; x += view.groundW) g.drawImage(view.ground, x, Y(row.lift) - 8, view.groundW, 16);
    }
    for (let i = Math.floor((centre - half) / row.cell); i <= Math.ceil((centre + half) / row.cell); i++) {
      const t = treeAt(row, i);
      if (!t) continue;
      const shake = row === NEAR && shaken.has(i) ? Math.sin(st.anim * 46) * 0.07 * (shaken.get(i) / 0.7) : 0;
      drawTree(g, row, t, Math.sin(st.anim * 0.8 + i * 1.7) * 0.012 + shake);
    }
  }
  g.globalAlpha = 1;
  const gx = -(((cam.x * s) % view.groundW) + view.groundW) % view.groundW;
  for (let x = gx; x < W; x += view.groundW) g.drawImage(view.ground, x, Y(0) - 8, view.groundW, 16);
}
function drawShadow(g) {
  const { s } = view;
  // under the chameleon
  g.fillStyle = 'rgba(60, 55, 48, .13)';
  g.beginPath(); g.ellipse(X(P.x), Y(0) + 2, s * 0.7 * (1 - Math.min(0.5, P.y * 0.2)), s * 0.07, 0, 0, 6.3); g.fill();
  if (M.state === 'done') return;
  // under the monster: grey while she hunts, the red scribble once she has picked her spot
  const h = clamp(M.y / HOVER_Y, 0, 1);
  if (M.state === 'warn' || M.state === 'fall') {
    const k = M.state === 'fall' ? 1 : 1 - M.t / M.warnT;
    const boil = Math.floor(st.anim * 9) % 2;
    g.globalAlpha = 0.45 + 0.55 * k;
    const w = view.dangerW * (0.9 + 0.1 * k), hh = view.dangerH;
    g.drawImage(view.danger[boil], X(M.x) - w / 2, Y(0) - hh * 0.62, w, hh);
    // and a marker "!" standing on it
    const x = X(M.x) + (boil ? 1.5 : -1.5), up = s * (0.12 + 0.06 * Math.abs(Math.sin(st.anim * 14)));
    pencilLine(g, [[x - s * 0.03, Y(1.45) - up], [x + s * 0.02, Y(1.15) - up], [x, Y(0.9) - up]], Math.max(4, s * 0.11), RED, 1);
    g.fillStyle = RED;
    g.beginPath(); g.arc(x, Y(0.66) - up, Math.max(2.6, s * 0.065), 0, 6.3); g.fill();
    g.globalAlpha = 1;
  } else {
    g.fillStyle = `rgba(60, 55, 48, ${0.2 - h * 0.1})`;
    g.beginPath(); g.ellipse(X(M.x), Y(0) + 3, s * KILL_HALF * (1.15 - h * 0.25), s * 0.1, 0, 0, 6.3); g.fill();
  }
}
function drawGroundThings(g) {
  const { s } = view;
  const R = rig.monster.parts.poop;
  for (const sp of splats) {                               // her poop, flat on the ground
    const k = MON_PX * s * 0.9, fade = Math.min(1, sp.life / 0.6), grow = Math.min(1, (st.t - sp.born) / 0.12);
    g.save();
    g.globalAlpha = fade;
    g.translate(X(sp.x), Y(0) + 2);
    g.scale(k * (1.5 + 0.2 * grow), k * 0.3 * grow);
    g.drawImage(art.mon, R.rect[0], R.rect[1], R.rect[2], R.rect[3], -R.rect[2] / 2, -R.rect[3], R.rect[2], R.rect[3]);
    g.restore();
  }
  for (const w of waves) {                                 // the ripple her landing sends out
    const k = Math.min(1, w.left / 1.2) * Math.min(1, (w.max - w.left) / 0.3 + 0.3);
    const x = X(w.x), y = Y(0), hgt = s * 0.62 * k, d = w.dir * s * 0.26, boil = Math.sin(st.anim * 30 + w.x) * s * 0.02;
    const curl = [[x - d * 2.6, y], [x - d * 1.2, y - hgt * 0.45], [x, y - hgt + boil], [x + d * 1.1, y - hgt * 0.8], [x + d * 0.8, y - hgt * 0.3 - boil], [x + d * 1.9, y]];
    pencilLine(g, curl, Math.max(4, s * 0.09), RED, 0.3 * k);
    pencilLine(g, curl, Math.max(2.4, s * 0.05), '#4a4640', 0.95 * k);
    pencilLine(g, [[x - d * 4.4, y], [x - d * 3.4, y - hgt * 0.4 - boil], [x - d * 2.6, y]], Math.max(1.6, s * 0.035), '#4a4640', 0.7 * k);
  }
}
function drawBugs(g) {
  const sp = rig.forest.bug, k = BUG_PX * view.s;
  for (const b of bugs) {
    g.save();
    g.translate(X(b.x), Y(b.y));
    g.rotate(Math.sin(b.ph * 1.3) * 0.18);
    g.scale(k * (0.86 + Math.sin(b.wing) * 0.14), k);      // the wings beat
    g.globalAlpha = b.life < 1 ? clamp(b.life + 1, 0, 1) : 1;
    g.drawImage(art.forest, sp.rect[0], sp.rect[1], sp.rect[2], sp.rect[3], -sp.pivot[0], -sp.pivot[1], sp.rect[2], sp.rect[3]);
    g.restore();
  }
}
function drawDust(g) {
  const { s } = view;
  for (const p of dust) {
    const k = p.life / p.max, x = X(p.x), y = Y(p.y);
    if (p.kind === 'puff') {
      const R = p.R * s * (1.7 - k);
      pencilLine(g, [[x - R, y], [x - R * 0.5, y - R * 0.9], [x + R * 0.4, y - R], [x + R, y - R * 0.2], [x + R * 0.3, y + R * 0.3], [x - R * 0.4, y]], Math.max(1.4, s * 0.028), PENCIL, 0.75 * k);
    } else if (p.kind === 'star') {
      g.save(); g.translate(x, y); g.rotate(p.rot + (1 - k) * 5); g.globalAlpha = k;
      g.strokeStyle = '#e0a400'; g.lineWidth = Math.max(2, s * 0.05); g.lineCap = 'round';
      const R = s * 0.16;
      for (let a = 0; a < 3; a++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(-R, 0); g.lineTo(R, 0); g.stroke(); }
      g.restore();
    } else {
      g.globalAlpha = k;
      g.fillStyle = p.kind === 'leaf' ? '#1f3d33' : '#6b3d1e';
      g.beginPath(); g.ellipse(x, y, s * (p.kind === 'leaf' ? 0.09 : p.R), s * 0.05, (p.rot || 0) + k * 4, 0, 6.3); g.fill();
      g.globalAlpha = 1;
    }
  }
}
function drawPops(g) {
  g.save();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
  g.lineJoin = 'round';
  for (const p of pops) {
    const k = p.life / p.max, size = Math.max(18, view.s * 0.46) * (1 + (1 - k) * 0.15);
    g.font = `900 ${size}px "Comic Sans MS", "Chalkboard SE", "Comic Neue", Arial, sans-serif`;
    g.globalAlpha = Math.min(1, k * 2.5);
    g.strokeStyle = PAPER; g.lineWidth = size * 0.22;
    g.strokeText(p.text, X(p.x), Y(p.y));
    g.fillStyle = p.color;
    g.fillText(p.text, X(p.x), Y(p.y));
  }
  g.restore();
}
function render() {
  const g = ctx, { W, H, dpr } = view;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  if (!art.ready) return;
  g.save();
  if (st.shake > 0) g.translate((Math.sin(st.anim * 91) * 7 + Math.sin(st.anim * 57) * 4) * st.shake, Math.cos(st.anim * 83) * 9 * st.shake);
  drawForest(g);
  drawShadow(g);
  drawGroundThings(g);
  drawBugs(g);
  if (P.dead) { drawChameleon(g); drawMonster(g); } else { drawMonster(g); drawChameleon(g); }
  if (flying) {
    const R = rig.monster.parts.poop, k = MON_PX * view.s;
    g.save();
    g.translate(X(flying.x), Y(flying.y)); g.rotate(flying.rot); g.scale(k, k);
    g.drawImage(art.mon, R.rect[0], R.rect[1], R.rect[2], R.rect[3], -R.rect[2] / 2, -R.rect[3] / 2, R.rect[2], R.rect[3]);
    g.restore();
  }
  drawTongue(g);
  drawDust(g);
  drawPops(g);
  g.restore();
}

// ---------- HUD and overlays ----------
const heartEl = document.getElementById('heart');
let lastHeart = null;
function syncHud() {
  hud.set('#score', `⭐ ${st.score}`);
  hud.set('#dist', `📏 ${Math.floor(Math.max(0, st.maxX))} מ׳`);
  if (lastHeart !== P.dead) { lastHeart = P.dead; heartEl.classList.toggle('lost', !!P.dead); heartEl.textContent = P.dead ? '💔' : '❤️'; }
  const hint = document.getElementById('hint');
  if (st.hintT > 0 && st.mode === 'play') {
    hud.set(hint, TOUCH
      ? 'ג׳ויסטיק = רצים · ⤒ = קפיצה · 👅 = לשון · לא עומדים על הקשקוש האדום!'
      : '⬅️ ➡️ = רצים · רווח = קפיצה · Shift = לשון · לא עומדים על הקשקוש האדום!');
    hint.classList.remove('hidden');
  } else hint.classList.add('hidden');
}
function showGameOver() {
  st.overShown = true;
  const best = hud.best('zikit-best', st.score);
  hud.set('#finalScore', `⭐ ${st.score}`);
  hud.set('#goDetail', `📏 ${Math.floor(st.maxX)} מטר · 🦶 התחמקתם מ־${st.dodged} דריכות · 👅 אכלתם ${st.eaten} חרקים`);
  hud.set('#bestScore', st.score >= best ? '🏆 שיא חדש!' : `🏆 השיא: ${best}`);
  hud.show('#gameover');
}
function startRun(seed) {
  hud.hide('#intro');
  hud.hide('#gameover');
  document.body.classList.add('playing');
  reset('play', seed);
  hud.startMusic();
}
hud.bind({ start: () => startRun(), restart: () => startRun() });
reset('demo');

// ---------- Loop + test hook ----------
if (!SIM) {
  let last = performance.now();
  const frame = (now) => {
    requestAnimationFrame(frame);
    const raw = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(raw);
    render();
  };
  requestAnimationFrame(frame);
}

window.__zikit = {
  st, P, M, cam, view, rig, art, bot, loaded,
  knobs: { RUN_V, KILL_HALF, CHAM_HALF, HOVER_Y, WARN_0, WARN_MIN, STUN_T, POOP_SLOW, TONGUE_R, BUG_PTS, DODGE_PTS, SHAKE_R, BUG_MAX, WAVE_FROM, POOP_FROM, DOUBLE_FROM },
  get bugs() { return bugs; },
  get waves() { return waves; },
  get splats() { return splats; },
  get dust() { return dust; },
  get pops() { return pops; },
  get flying() { return flying; },
  step, render, reset, treeAt, nearTrees, addBug, warnOf, waveOf, ROWS,
  start(seed) { startRun(seed); },
  // hand the run to the autopilot (the one that plays behind the intro card), with a human's reaction time
  autopilot(on = true, delay = 0.12) { bot.on = on; bot.delay = delay; },
  walk(dir) { virt.x = dir; },
  press(what = 'jump') { if (what === 'tongue') virt.tongue = true; else { virt.jump = true; virt.hold = true; } },
  release() { virt.hold = false; },
  // a quiet forest for setting up one scene at a time: no monster, no bugs of their own
  calm() { st.spawns = false; bugs = []; waves = []; splats = []; flying = null; M.state = 'rest'; M.t = 1e9; M.y = 0; M.x = P.x - 30; },
  wave(x, dir, reach = 6) { waves.push({ x, dir, left: reach, max: reach }); },
  splat(x) { splats.push({ x, life: POOP_LIFE, born: st.t }); },
  // put her over a spot, about to drop
  dropOn(x) { Object.assign(M, { state: 'warn', x, y: HOVER_Y, t: 0.05, warnT: 1, low: false }); },
};
