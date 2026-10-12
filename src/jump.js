import './kit/shell.css';
import { createInput } from './kit/input.js';
import { createHud } from './kit/hud.js';
import { beep, noise, chord, music } from './kit/audio.js';
import {
  TAU, FONT, C, rng, createSprites, drawFigure, drawFoe, drawTower, drawHeart, drawGround, drawKing,
  scribbleTile, asterisk, stroke, BODY,
} from './jump-art.js';

// "קופצים מעל הרעים" — the kids' rules, written on drawings/jump-game-1-characters.webp:
//   "There are characters down here that you choose between, and there are bad guys that try
//    to eat you, and you try to jump over them."
// Space jumps, the arrows walk both ways. The box characters flip in the air — feet, head,
// feet, head. The green box towers (drawings/jump-game-4-towers.png) are what you jump up on;
// the bad guy is drawings/jump-game-2-bad-guys.webp; the page is covered in pencil scribbles
// (drawings/jump-game-3-background.webp); and once in a while the monster king
// (drawings/jump-game-5-monster-king.webp) stomps in with his enormous arms. The page itself
// wrote "eat them with Space" — the kids changed that to "jump over them". Verb sheet:
// design/jump.md.

const SIM = new URLSearchParams(location.search).has('sim');

// ---------- Knobs (design/jump.md) ----------
const G = 36;                   // gravity, blocks / s²
const JUMP_V = 12.9;            // a held jump: apex 2.3 blocks, 0.72 s in the air
const MIN_HOLD = 0.12;          // even a tap stays up long enough to clear a bad guy
const CUT = 0.5;                // letting go early keeps half the upward speed
const COYOTE = 0.1;             // jump a moment after running off a ledge
const BUFFER = 0.13;            // …or a moment before landing
const STEP = 0.35;              // a ledge this close under your feet pops you onto it
const RUN_V = 6.2;              // top walking speed, either way
const ACCEL = 60, FRICTION = 50, AIR_ACCEL = 34, AIR_DRAG = 8;
const BACK_LIMIT = 45;          // how far back behind your best distance you can walk
const FOE_GAIN = 0.5, FOE_RAMP = 900;
const FLIP_W = TAU / ((2 * JUMP_V) / G);            // one whole flip per full jump
const HEARTS = 3;
const INVULN = 1.8;
const EAT_T = 0.95;
const BOUNCE_V = 13.5;          // off a bad guy's head
const DOUBLE_V = 11.5;          // cute: second jump
const GLIDE_G = 0.22, GLIDE_FALL = 2.3;              // regular: the wing
const SLAM_V = 24, ROAR_R = 3.8, SCARE_T = 2.2;      // scary: slam and roar
const HOP_WAIT = 0.3;
const SPAWN_GAP0 = 13, SPAWN_GAP_MIN = 5.5, SPAWN_RAMP = 700;
const QUIET_T = 2.5;            // this long with no bad guy on screen and another one comes
// the monster king
const KING_FIRST = 130, KING_EVERY = 300;            // metres
const KING_TIME = 30;           // he gets bored and stomps off
const KING_WALL = 3;            // his legs block you up to his shoulders; above that you're over him
const HEAD_BOUNCE_V = 13.5;     // his head springs you right over him
const ARM_STEP = 1.1;           // walk into the sleeping hand and you're lifted onto it
const PASS_PTS = 200;
const KING_PAUSE = 1.5;         // a breather between attacks
const WINDUP_T = 1.0;           // the "!" before a sweep
const SWEEP_V = 5, SWEEP_Y = 0.35, SWEEP_R = 0.3;   // the sweeping hand: slow, low, small
const HOVER_T = 1.4, HOVER_V = 3.6, LOCK_T = 0.55, SLAM_FALL = 16, SLAM_R = 0.45;
const REST_T = 2.6;             // how long a slammed hand lies there to be jumped on
// more slams than sweeps: a slam is also your chance to hit him back
const KING_PLAN = ['sweep', 'slam', 'slam', 'sweep', 'slam', 'slam', 'sweep', 'slam'];
const SUB = 1 / 120;
const BOIL_FPS = 8;

const TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const KEY = TOUCH ? 'הכפתור' : 'רווח';
const CHARS = {
  cute: { name: 'דמות חמודה', ability: 'double', hint: `${KEY} שוב באוויר = קפיצה כפולה!` },
  scary: { name: 'דמות מפחידה', ability: 'slam', hint: `${KEY} שוב באוויר = נחיתה עם שאגה — הרעים בורחים!` },
  regular: { name: 'דמות רגילה', ability: 'glide', hint: `מחזיקים את ${KEY} בירידה = דואים עם הכנף` },
};
const KINDS = ['cute', 'scary', 'regular'];

// One drawing, four ways to move: the shoe leg, the wheel leg, both, and big.
const FOES = {
  runner: { w: 0.78, h: 0.95, scale: 1.15, speed: 1.3 },     // runs at you, kicks up over towers with the shoe
  hopper: { w: 0.72, h: 0.9, scale: 1.1, speed: 1.7, hopV: 8.5 },  // pogos on the big shoe — a held jump always clears it
  roller: { w: 0.7, h: 0.75, scale: 1.05, speed: 3.1 },    // spins along on the wheel, bounces off towers
  giant: { w: 1.25, h: 1.5, scale: 1.75, speed: 0.85 },   // slow and tall, waits at walls
};

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const foeMul = (d) => 1 + FOE_GAIN * (1 - Math.exp(-Math.max(0, d) / FOE_RAMP));
const uprightFrom = (a) => Math.ceil(a / TAU - 1e-6) * TAU;
const hasHebrew = (s) => /[֐-׿]/.test(s);

// ---------- Page ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const sprites = createSprites();
const pickSprites = createSprites();
const input = createInput({ touch: 'auto' });
input.touch?.setLabels({ a: '⤒', b: '' });
const hud = createHud(null, { gameId: 'jump', music: { seed: 31, bpm: 126, root: 62 } });

const view = { W: 1, H: 1, dpr: 1, s: 60, groundY: 0, viewW: 16, bg: null, ground: null, tileW: 1200 };
function resize() {
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  view.W = window.innerWidth;
  view.H = window.innerHeight;
  canvas.width = Math.round(view.W * view.dpr);
  canvas.height = Math.round(view.H * view.dpr);
  // ~15 blocks across in landscape; a phone held upright gets bigger blocks and sees less ahead
  view.s = Math.max(24, Math.min(view.H / 8.6, view.W / (view.W < view.H ? 11 : 15.5)));
  view.groundY = Math.min(view.H * 0.83, view.H / 2 + 4.2 * view.s);
  view.viewW = view.W / view.s;
  view.tileW = Math.max(1200, Math.ceil(view.W));
  view.bg = scribbleTile(view.tileW, view.H, view.dpr, 20260930);
  view.ground = scribbleTile(view.tileW, Math.max(8, Math.min(view.H - view.groundY + 6, view.s * 3.5)), view.dpr, 777,
    { density: 1.6, flat: true, unit: view.s * 0.9 });
  sprites.setScale(view.s * view.dpr);
}
resize();
window.addEventListener('resize', resize);

// ---------- State ----------
const st = {
  mode: 'demo',         // demo (behind the intro card) | play | over
  kind: 'cute',
  anim: 0,              // wall-clock seconds, for boil and idle animation
  t: 0,                 // simulated seconds this run
  points: 0, overs: 0, bestCombo: 0, hearts: HEARTS,
  airId: 0, comboAir: -1, comboN: 0,                   // bad guys jumped in the same airtime make a combo
  maxX: 0, leftLimit: -3, quietT: 0,
  kingAt: KING_FIRST, kingsPassed: 0,
  eat: null,            // { foe | king, t } while something chews
  hitstop: 0, shake: 0,
  overT: 0, overShown: false, overFoe: null,
  spawns: true,         // tests switch the generators off to set up a scene by hand
  hintT: 0,
  bot: true,            // the autopilot plays the demo; tests can hand it a real run
  get score() { return st.points + Math.floor(Math.max(0, st.maxX)); },
};
const P = {
  x: 0, y: 0, vx: 0, vy: 0, w: 0.72, h: 1, prevY: 0, facing: 1,
  ground: true, landed: false, coyote: 0, buffer: 0, jumpT: 0, cut: false, used: false,
  glide: false, slam: false, invuln: 0, blocked: false, blockDir: 0, blockedTop: 0, bonked: false,
  angle: 0, flipTo: 0, flipDir: 1, phase: 0, flap: 0, sq: 0, sqv: 0, trail: [], trailT: 0,
  arm: null, kingFly: false,              // standing on one of the king's arms / flying over him
};
const cam = { x: 0, y: 0 };
let towers = [], foes = [], hearts = [], parts = [], pops = [];
let king = null;
const gen = { x: 0, spawnX: 0, r: rng(1), id: 0 };
const virt = { pressed: false, held: false, x: 0 };   // test input
const bot = { holdT: 9, want: 0, cool: 0, move: 1, moveT: 0 };

function reset(kind, mode, seed) {
  king = null;
  Object.assign(st, {
    kind, mode, t: 0, points: 0, overs: 0, bestCombo: 0, hearts: HEARTS,
    airId: 0, comboAir: -1, comboN: 0, maxX: 0, leftLimit: -3, quietT: 0,
    kingAt: KING_FIRST, kingsPassed: 0,
    eat: null, hitstop: 0, shake: 0, overT: 0, overShown: false, overFoe: null,
    hintT: mode === 'play' ? 8 : 0, bot: mode === 'demo', spawns: true,
  });
  Object.assign(P, {
    x: 0, y: 0, vx: 0, vy: 0, prevY: 0, facing: 1, ground: true, landed: false, coyote: 0, buffer: 0,
    jumpT: 0, cut: false, used: false, glide: false, slam: false, invuln: mode === 'play' ? 1 : 0,
    blocked: false, blockDir: 0, blockedTop: 0, bonked: false, angle: 0, flipTo: 0, flipDir: 1,
    phase: 0, flap: 0, sq: 0, sqv: 0, trail: [], trailT: 0, arm: null, kingFly: false,
  });
  towers = []; foes = []; hearts = []; parts = []; pops = [];
  gen.r = rng(seed ?? (mode === 'play' ? (Math.random() * 2 ** 31) | 0 : 4242));
  gen.x = 14; gen.spawnX = 20; gen.id = 0;
  Object.assign(virt, { pressed: false, held: false, x: 0 });
  Object.assign(bot, { holdT: 9, want: 0, cool: 0, move: 1, moveT: 0 });
  cam.x = P.x - view.viewW * 0.3; cam.y = 0;
  growWorld();
  syncHud();
}

// ---------- World ----------
function weighted(r, opts) {
  let sum = 0;
  for (const [, w] of opts) sum += w;
  let x = r() * sum;
  for (const [k, w] of opts) { x -= w; if (x <= 0) return k; }
  return opts[0][0];
}
function surfaceAt(l, r) {
  let s = 0;
  for (const t of towers) if (!t.wall && t.x < r && t.x + t.w > l && t.top > s) s = t.top;
  return s;
}
function addTower(x, h, w = 1) {
  const t = { x, w, h, top: h, id: gen.id++, sq: 0, sqv: 0 };
  towers.push(t);
  return t;
}
// Patterns straight off the towers drawing: single stacks, the 1-2-3 staircase, and friends.
function placePattern() {
  // the king needs a flat stretch to swing his arms in
  if (gen.x > st.kingAt - 12 && gen.x < st.kingAt + 24) gen.x = st.kingAt + 24;
  const r = gen.r, d = gen.x;
  const opts = [['one', 3], ['flat', 1.2]];
  if (d > 35) opts.push(['two', 2]);
  if (d > 55) opts.push(['stairs', 2.2]);
  if (d > 80) opts.push(['pair', 1.2]);
  if (d > 110) opts.push(['down', 1.4]);
  if (d > 220) opts.push(['wall', 1]);
  if (d > 320) opts.push(['leap', 0.9]);
  const kind = weighted(r, opts);
  const H = { one: [1], two: [2], stairs: [1, 2, 3], down: [3, 2, 1], pair: [1, 1], wall: [2, 3], leap: [1, 3], flat: [] }[kind];
  const gap = { stairs: () => 1.3 + r() * 0.9, down: () => 1.2 + r() * 0.8, pair: () => 3.2 + r() * 1.2, wall: () => 0, leap: () => 1.5 + r() * 0.3 }[kind];
  let x = gen.x;
  H.forEach((h, i) => {
    if (i) x += gap();
    const w = 0.95 + r() * 0.18;
    addTower(x, h, w);
    if (h === 3 && d > 60 && r() < 0.4) hearts.push({ x: x + w / 2, y: h + 1.25, taken: false, t: r() * 5 });
    x += w;
  });
  if (kind === 'flat') x += 4;
  gen.x = x + lerp(9, 5, 1 - Math.exp(-d / 800)) * (0.8 + r() * 0.5);
}
function spawnFoe(type, x, y) {
  const F = FOES[type];
  const f = {
    id: gen.id++, type, x, y: y ?? surfaceAt(x - F.w / 2, x + F.w / 2), vx: 0, vy: 0, prevY: 0,
    w: F.w, h: F.h, scale: F.scale, ground: true, landed: false, facing: x > P.x ? -1 : 1,
    phase: gen.r() * TAU, wheel: 0, mouth: 0, lean: 0, scared: 0, dizzy: 0,
    side: x > P.x ? 1 : -1, over: false, overAir: -1, counted: false, ateMe: false,
    hopWait: 0.3, sq: 0, sqv: 0, knockT: 0, knockV: 0, kickT: 0, kickV: 0,
  };
  if (type === 'roller') f.lean = -0.18;
  foes.push(f);
  return f;
}
function foeType(d) {
  const opts = [['runner', 1]];
  if (d > 70) opts.push(['hopper', 0.7]);
  if (d > 200) opts.push(['roller', 0.6]);
  if (d > 450) opts.push(['giant', 0.3]);
  return d < 40 ? 'runner' : weighted(gen.r, opts);
}
function spawnNext() {
  const r = gen.r, d = gen.spawnX;
  let x = gen.spawnX;
  // the first stretch is a lesson: bad guys only on the ground, one at a time
  if (d < 150) while (surfaceAt(x - 0.8, x + 0.8) > 0) x += 0.5;
  if (!king) {
    spawnFoe(foeType(d), x);
    if (d > 260 && r() < 0.22) spawnFoe(r() < 0.5 ? 'runner' : 'hopper', x + 1.7);
  }
  gen.spawnX = x + lerp(SPAWN_GAP0, SPAWN_GAP_MIN, 1 - Math.exp(-d / SPAWN_RAMP)) * (0.75 + r() * 0.55);
}
// Walking back doesn't make the world safe: with nobody on screen for a moment, another one comes,
// sometimes from behind.
function keepBusy(dt) {
  if (!st.spawns || king) { st.quietT = 0; return; }
  const l = cam.x - 1, r = cam.x + view.viewW + 3;
  const busy = foes.some((f) => f.x > l && f.x < r && !f.scared);
  st.quietT = busy ? 0 : st.quietT + dt;
  if (st.quietT < QUIET_T) return;
  st.quietT = 0;
  const behind = st.maxX > 80 && gen.r() < 0.3;
  spawnFoe(foeType(st.maxX), behind ? Math.max(st.leftLimit, cam.x - 1.2) : cam.x + view.viewW + 1.2);
}
function growWorld() {
  const right = cam.x + view.viewW;
  if (st.spawns) {
    while (gen.x < right + 22) placePattern();
    while (gen.spawnX < right + 1.5) spawnNext();
  }
  const left = st.leftLimit - 6;
  towers = towers.filter((t) => t.x + t.w > left);
  foes = foes.filter((f) => f.x > left - 4 && f.x < right + 30 && !(f.flee && f.x < cam.x - 2));
  hearts = hearts.filter((h) => h.x > left && !h.gone);
}

// Axis-aligned bodies against the towers. Returns the wall hit: +1 on the right, -1 on the left.
function move(b, dt, step) {
  let wall = 0, wallTop = 0;
  const hw = b.w / 2;
  let nx = b.x + b.vx * dt;
  for (const t of towers) {
    if (t.top <= b.y + 1e-4) continue;
    const hitL = b.vx > 0 && b.x + hw <= t.x + 1e-4 && nx + hw > t.x;
    const hitR = b.vx < 0 && b.x - hw >= t.x + t.w - 1e-4 && nx - hw < t.x + t.w;
    if (!hitL && !hitR) continue;
    if (!t.wall && b.y + step >= t.top) { b.y = t.top; if (b.vy < 0) b.vy = 0; continue; }
    if (hitL) { nx = t.x - hw; wall = 1; } else { nx = t.x + t.w + hw; wall = -1; }
    wallTop = t.top;
  }
  b.x = nx;
  const sup = surfaceAt(b.x - hw + 0.05, b.x + hw - 0.05);
  const ny = b.y + b.vy * dt;
  b.landed = false;
  if (b.vy <= 0 && ny <= sup) {
    if (!b.ground) b.landed = true;
    b.y = sup; b.vy = 0; b.ground = true;
  } else {
    b.y = ny; b.ground = false;
  }
  return { wall, wallTop, sup };
}
function towerUnder(b) {
  const hw = b.w / 2;
  return towers.find((t) => !t.wall && t.x < b.x + hw - 0.05 && t.x + t.w > b.x - hw + 0.05 && Math.abs(t.top - b.y) < 0.01);
}

// ---------- The player ----------
const axisOut = { x: 0, z: 0 };
function readInput(dt) {
  const p1 = input.p1;
  const live = st.mode === 'play';       // the demo behind the intro card ignores the keys (← → pick a character there)
  let pressed = (live && p1.consume('a')) || virt.pressed;
  let held = (live && (p1.down('a') || input.keys.has('ArrowUp') || input.keys.has('KeyW'))) || virt.held;
  if (upPressed) { pressed = pressed || live; upPressed = false; }
  virt.pressed = false;
  let x = live ? p1.axis(axisOut).x : 0;
  if (Math.abs(x) < 0.25) x = 0;        // a resting thumb on the stick doesn't walk
  x = x || virt.x;
  if (st.bot) {
    const b = botThink(dt);
    pressed = pressed || b.pressed;
    held = held || b.held;
    x = x || b.x;
  }
  return { pressed, held, x: clamp(x, -1, 1) };
}

function takeoff(vy) {
  P.vy = vy;
  P.slam = false;
  P.arm = null;
  P.ground = false;
  P.coyote = 0;
  P.buffer = 0;
  P.jumpT = 0;
  P.cut = false;
  // flip the way you're going (standing still: the way you face) — unless still rolling from the last one
  if (P.angle >= P.flipTo - 1e-6) P.flipDir = Math.abs(P.vx) > 1 ? Math.sign(P.vx) : P.facing;
  P.flipTo = uprightFrom(P.angle) + TAU;
  P.sqv -= 5;
}

function updatePlayer(dt, inp) {
  const ability = CHARS[st.kind].ability;
  if (inp.pressed) P.buffer = BUFFER;
  P.coyote = P.ground ? COYOTE : Math.max(0, P.coyote - dt);
  P.invuln = Math.max(0, P.invuln - dt);
  const acc = P.ground ? (inp.x ? ACCEL : FRICTION) : (inp.x ? AIR_ACCEL : P.kingFly ? 0 : AIR_DRAG);
  P.vx += clamp(inp.x * RUN_V - P.vx, -acc * dt, acc * dt);
  if (Math.abs(inp.x) > 0.2) P.facing = Math.sign(inp.x);
  if (P.buffer > 0) {
    if (P.coyote > 0) {
      if (P.blocked && P.blockedTop - P.y > 2) {
        // pressed up against a wall too tall to jump: scramble up its face
        takeoff(Math.sqrt(2 * G * (P.blockedTop - P.y + 0.45)));
        P.cut = true;
        burst(P.x + 0.3 * P.blockDir, P.y + 0.3, 'dust', 3);
      } else takeoff(JUMP_V);
      sfx.jump();
    } else if (!P.used && ability === 'double') {
      P.used = true;
      takeoff(DOUBLE_V);
      P.cut = true;
      burst(P.x, P.y, 'star', 5);
      sfx.double();
    } else if (!P.used && ability === 'slam') {
      P.used = true;
      P.slam = true;
      P.buffer = 0;
      sfx.slam();
    }
  }
  P.buffer = Math.max(0, P.buffer - dt);
  P.jumpT += dt;
  if (P.vy > 0 && !P.cut && !inp.held && P.jumpT > MIN_HOLD) { P.vy *= CUT; P.cut = true; }
  P.glide = ability === 'glide' && !P.ground && !P.slam && inp.held && P.vy < 0;
  P.vy -= G * (P.glide ? GLIDE_G : 1) * dt;
  if (P.glide) P.vy = Math.max(P.vy, -GLIDE_FALL);
  if (P.slam) { P.vy = -SLAM_V; P.vx *= 0.9; }
  P.prevY = P.y;
  const vyBefore = P.vy, vxBefore = P.vx;
  let c = { wall: 0, wallTop: 0 };
  if (P.arm && king) {
    // walking along one of the king's arms: the same speed along the tube, so steep bits go slower
    const s0 = armSurface(king, P.arm, P.x);
    P.x += (P.vx * dt) / Math.sqrt(1 + (s0 ? s0.slope : 0) ** 2);
    const s1 = armSurface(king, P.arm, P.x);
    if (s1) { P.y = s1.y; P.vy = 0; P.ground = true; P.landed = false; }
    else { P.arm = null; P.ground = false; }
  } else {
    P.arm = null;
    c = move(P, dt, STEP);
    if (king) onArms();
  }
  if (P.x < st.leftLimit) { P.x = st.leftLimit; P.vx = Math.max(0, P.vx); }
  if (c.wall) P.vx = 0;
  P.blocked = c.wall !== 0 && Math.sign(inp.x) === c.wall;
  P.blockDir = c.wall;
  P.blockedTop = c.wall ? c.wallTop : 0;
  if (P.blocked && !P.bonked && Math.abs(vxBefore) > 2) { P.bonked = true; P.sqv += 3; sfx.bonk(); }
  if (!P.blocked) P.bonked = false;
  if (P.landed) land(vyBefore);
  st.maxX = Math.max(st.maxX, P.x);
  st.leftLimit = Math.max(-3, st.maxX - BACK_LIMIT);
  updateFlip(dt);
  // animation
  P.phase += dt * (P.blocked ? 18 : Math.abs(P.vx) * 2.6);
  P.flap += dt * (P.glide ? 16 : 5);
  P.sqv += (-170 * P.sq - 12 * P.sqv) * dt;
  P.sq += P.sqv * dt;
}

function land(vy) {
  P.cut = false;
  P.used = false;
  st.airId++;
  P.sqv += 3 + Math.min(6, -vy * 0.3);
  const t = towerUnder(P);
  if (t) t.sqv += 4;
  if (P.slam) { P.slam = false; roar(); } else {
    burst(P.x, P.y, 'dust', -vy > 14 ? 4 : 2);
    sfx.land(-vy);
  }
}

// Flip so the feet come down just as you land: aim the spin at the next upright angle over
// the predicted air time, and add another whole flip when there's air to spare.
function updateFlip(dt) {
  if (P.ground) {
    if (P.angle < P.flipTo) P.angle = Math.min(P.flipTo, P.angle + FLIP_W * 2.6 * dt);
    return;
  }
  if (P.glide || P.slam) {
    P.flipTo = uprightFrom(P.angle);
    P.angle = Math.min(P.flipTo, P.angle + FLIP_W * (P.slam ? 3 : 1.6) * dt);
    return;
  }
  const tl = timeToLand();
  let w = (P.flipTo - P.angle) / Math.max(tl, 0.05);
  if (w < FLIP_W * 0.45 && tl > 0.3) {
    P.flipTo += TAU;
    w = (P.flipTo - P.angle) / tl;
  }
  P.angle = Math.min(P.flipTo, P.angle + clamp(w, 0, FLIP_W * 2.4) * dt);
}
function timeToLand() {
  let x = P.x, y = P.y, vy = P.vy;
  const hw = P.w / 2 - 0.05, h = 1 / 60;
  for (let t = h; t < 2.5; t += h) {
    vy -= G * h;
    y += vy * h;
    x += P.vx * h;
    if (vy < 0 && y <= surfaceAt(x - hw, x + hw)) return t;
  }
  return 2.5;
}

// ---------- The bad guys ----------
function updateFoe(f, dt) {
  const F = FOES[f.type];
  f.scared = Math.max(0, f.scared - dt);
  f.dizzy = Math.max(0, f.dizzy - dt);
  const dx = P.x - f.x, dy = P.y - f.y;
  let speed = F.speed * foeMul(st.maxX);
  if (f.flee) { f.scared = 1; f.facing = -1; speed = 4.5; }
  else if (f.scared > 0) { f.facing = dx > 0 ? -1 : 1; speed = 3.2; }
  else if (f.type !== 'roller') f.facing = dx > 0 ? 1 : -1;
  if (f.dizzy > 0 || f.kickT > 0) speed = 0;
  // close and on your level: the star splits into a mouth and it lunges — that's the tell
  const hungry = !f.scared && !f.dizzy && !st.eat && st.mode !== 'over'
    && Math.sign(dx) === f.facing && Math.abs(dx) < 3.2 && Math.abs(dy) < 0.9;
  f.mouth += ((hungry ? 1 : 0) - f.mouth) * Math.min(1, dt * 10);
  f.vx = f.facing * speed * (hungry && Math.abs(dx) < 2.2 ? 1.5 : 1);
  if (f.knockT > 0) { f.knockT -= dt; f.vx = f.knockV; }
  if (f.kickT > 0 && (f.kickT -= dt) <= 0) { f.vy = f.kickV; f.ground = false; f.sqv -= 5; }
  f.vy -= G * dt;
  f.prevY = f.y;
  const c = move(f, dt, 0.18);
  if (c.wall) {
    // the runner crouches for a beat, then its big shoe kicks it up and over
    if (f.type === 'runner' && f.ground && !(f.kickT > 0) && c.wallTop < 6) { f.kickT = 0.3; f.kickV = Math.sqrt(2 * G * (c.wallTop - f.y + 0.4)); f.sqv += 4; }
    else if (f.type === 'roller') f.facing = -c.wall;
  }
  if (f.type === 'hopper' && f.ground && !f.dizzy) {
    f.hopWait -= dt;
    if (f.hopWait <= 0) { f.vy = F.hopV; f.ground = false; f.hopWait = HOP_WAIT; f.sqv -= 3; }
  }
  if (f.landed) f.sqv += 3;
  f.phase += dt * (Math.abs(f.vx) * 5 + 2);
  f.wheel -= (dt * f.vx * f.facing) / 0.14;   // drawn facing left: rolling forward turns it anticlockwise
  f.sqv += (-150 * f.sq - 10 * f.sqv) * dt;
  f.sq += f.sqv * dt;
}

// Forgiving hitboxes: about 80 % of the body, and the horns, arms and fists never count.
function contact(p, prevY, f) {
  if (Math.abs(p.x - f.x) >= f.w * 0.41 + p.w * 0.4 || p.y > f.y + f.h * 0.86 || p.y + p.h * 0.85 < f.y + 0.05) return null;
  if (p.vy < 0 && prevY >= f.y + f.h * 0.6) return 'bounce';
  if (f.vy < 0 && f.prevY >= p.y + p.h * 0.6) return 'squish';   // it came down on YOUR head: a boink, not a bite
  return 'eat';
}

function interact() {
  for (const f of foes) {
    const ox = Math.abs(P.x - f.x) < f.w * 0.41 + P.w * 0.4;
    // jumped over: you were clear above it while passing, and came down on its other side
    if (ox) {
      if (!P.ground && P.y > f.y + f.h * 0.8 && !f.over) { f.over = true; f.overAir = st.airId; }
    } else {
      const side = f.x > P.x ? 1 : -1;
      if (f.over && side !== f.side && !f.counted && !f.ateMe) { f.counted = true; if (st.mode === 'play') jumpedOver(f); }
      f.side = side;
      f.over = false;
    }
    const touch = contact(P, P.prevY, f);
    if (!touch) continue;
    if (touch === 'bounce') { headBounce(f); continue; }
    if (touch === 'squish') { squished(f); continue; }
    if (P.invuln > 0 || f.scared > 0 || f.dizzy > 0 || st.mode !== 'play') continue;
    eaten(f);
    return;
  }
  for (const h of hearts) {
    if (h.taken || Math.hypot(P.x - h.x, P.y + 0.5 - h.y) > 0.8) continue;
    h.taken = true;
    if (st.mode !== 'play') continue;
    if (st.hearts < HEARTS) { st.hearts++; pop(h.x, h.y + 0.4, '+1 ❤️', C.red); hud.pop('#hearts'); }
    else { st.points += 25; pop(h.x, h.y + 0.4, '+25', C.red); }
    burst(h.x, h.y, 'star', 6);
    sfx.heart();
  }
}

function jumpedOver(f) {
  if (st.comboAir === f.overAir) st.comboN++;
  else { st.comboAir = f.overAir; st.comboN = 1; }
  const combo = st.comboN;
  const pts = 10 * combo + (f.type === 'giant' ? 10 : 0);
  st.points += pts;
  st.overs++;
  st.bestCombo = Math.max(st.bestCombo, combo);
  pop(f.x, f.y + f.h + 0.7, `+${pts}`, combo > 1 ? C.crimson : C.tower, 30 + combo * 5);
  if (combo === 2) hud.flash('כפול!', { good: true, dur: 800 });
  else if (combo === 3) hud.flash('משולש!', { good: true, dur: 900 });
  else if (combo > 3) hud.flash(`מטורף! פי ${combo}`, { good: true, dur: 1000 });
  hud.pop('#score');
  sfx.over(combo);
}

function headBounce(f) {
  P.y = f.y + f.h * 0.86;
  const slammed = P.slam, fresh = !f.dizzy;
  P.vx += (P.x >= f.x ? 1 : -1) * 3;       // off to one side, never straight back onto the same head
  takeoff(BOUNCE_V);
  if (slammed) roar();                      // the scary one slamming onto a head roars from up there
  P.cut = true;
  P.used = false;
  f.dizzy = 0.8;
  f.sqv += 8;
  f.mouth = 0;
  if (!f.over) { f.over = true; f.overAir = st.airId; }
  if (st.mode === 'play' && fresh) { st.points += 5; pop(f.x, f.y + f.h + 0.3, 'בוינג!', C.blue, 26); }
  burst(P.x, P.y, 'star', 5);
  sfx.boing();
}

function squished(f) {
  f.vy = 8;
  f.ground = false;
  f.dizzy = 0.7;
  f.knockT = 0.45;                          // knocked off to the side, never straight back down on you
  f.knockV = f.x >= P.x ? 3.2 : -3.2;
  P.sqv += 7;
  if (st.mode === 'play') pop(P.x, P.y + 1.4, 'בוינק!', C.blue, 26);
  burst(P.x, P.y + 1, 'star', 3);
  sfx.boing();
}

function eaten(f) {
  st.eat = { foe: f, t: 0, x0: P.x, y0: P.y };
  f.ateMe = true;
  f.mouth = 1;
  st.hearts = Math.max(0, st.hearts - 1);
  st.hitstop = 0.09;
  st.shake = 0.8;
  hud.pop('#hearts');
  pop(f.x, f.y + f.h + 0.9, st.hearts ? 'אמממ!' : 'יאמי!', C.crimson, 34);
  sfx.chomp();
}
function updateEat(dt) {
  const e = st.eat;
  e.t += dt;
  if (e.king) { updateKingEat(e, dt); return; }
  const f = e.foe;
  f.mouth = e.t < 0.2 ? 1 : 0.5 + 0.5 * Math.sin(e.t * 24);
  if (e.t > 0.2 && Math.floor(e.t * 8) !== Math.floor((e.t - dt) * 8)) {
    f.sqv += 5;
    burst(f.x - 0.2 * f.facing, f.y + f.h * 0.6, 'crumb', 2);
  }
  f.sqv += (-150 * f.sq - 10 * f.sqv) * dt;
  f.sq += f.sqv * dt;
  if (e.t < EAT_T) return;
  if (st.hearts > 0) {
    // spat back out, over its head, with a moment to get clear
    st.eat = null;
    f.mouth = 0;
    f.dizzy = 1.2;
    P.x = f.x;
    P.y = f.y + f.h + 0.05;
    P.vx = f.facing * 5;                    // out of its mouth and clear of it
    takeoff(12);
    P.cut = true;
    P.invuln = INVULN;
    pop(f.x, f.y + f.h + 1, 'פּוּ!', C.blue, 30);
    sfx.spit();
  } else gameOver(f);
}

function roar() {
  st.shake = Math.max(st.shake, 0.55);
  parts.push({ kind: 'ring', x: P.x, y: P.y + 0.4, life: 0.55, max: 0.55, R: ROAR_R });
  pop(P.x, P.y + 1.8, 'גררר!', C.green, 34);
  for (const f of foes) {
    if (Math.abs(f.x - P.x) < ROAR_R && Math.abs(f.y - P.y) < 2.5) {
      f.scared = SCARE_T;
      f.mouth = 0;
      if (f.ground) { f.vy = 6; f.ground = false; }
    }
  }
  sfx.roar();
}

// ---------- The monster king ----------
// He stomps in every few hundred metres and plants himself. His legs are a wall — but his arms
// and head aren't: you get past him by going OVER him. Only his hands hurt, and they attack:
// the small hand flies to the far side of the page and SWEEPS back along the ground towards him
// (jump it — you see it coming for over a second); the big hand HOVERS over you, a shadow
// underneath, and SLAMS down (walk out from under it). A slammed hand falls asleep on the ground
// for a while (dizzy stars) and is harmless: walk into it and you're lifted on, walk up the arm,
// and his head springs you over him. The arms are one-way platforms — you pass up through them
// and land on top. Land on his other side and he runs off. He takes at most one heart a visit
// and never your last one. kingStep is pure enough to run on a copy, so the autopilot can look
// ahead through his attacks.
function startKing() {
  const spot = Math.max(st.kingAt + 12, P.x + 7);
  king = {
    x: spot + 9, spot, phase: 'enter', t: 0, total: 0, planIx: 0, walk: 0, lean: 0, dir: 1,
    hurt: 0, mouth: 0, boing: 0, near: { x: 0, y: 5.4 }, far: { x: 0, y: 5.4 }, nearOpen: 1, farOpen: 1,
    passed: false, swept: false, sx: 0, sy: 0, lx: 0, stepT: 0, wall: null, bitten: false, rests: 0,
    polyN: null, polyF: null,
  };
  king.near.x = king.x - 2.4;
  king.far.x = king.x + 2.4;
  king.polyN = armPoly(king, 'near');
  king.polyF = armPoly(king, 'far');
  king.wall = addTower(king.x - 1.2, KING_WALL, 2.4);   // his legs: you can't walk through them
  king.wall.wall = true;
  for (const f of foes) { f.flee = true; f.mouth = 0; }  // even the bad guys run from him — off the page
  hud.flash('👑 מלך המפלצות!', { bad: true, dur: 1800 });
  st.shake = 0.5;
  sfx.kingRoar();
  if (st.mode === 'play' && music.playing) music.start({ seed: 77, bpm: 150, root: 55 });
}
function endKing() {
  towers = towers.filter((t) => t !== king.wall);
  king = null;
  P.arm = null;
  P.kingFly = false;
  st.kingAt = Math.max(st.maxX, st.kingAt) + KING_EVERY * (0.85 + gen.r() * 0.3);
  if (st.mode === 'play' && music.playing) hud.startMusic();
}
const approach = (p, tx, ty, rate, dt) => { const a = Math.min(1, rate * dt); p.x += (tx - p.x) * a; p.y += (ty - p.y) * a; };
function kingStep(k, dt, px, sim) {
  k.t += dt;
  k.total += dt;
  k.hurt = Math.max(0, k.hurt - dt * 2);
  k.boing = Math.max(0, k.boing - dt * 3);
  const go = (ph) => { k.phase = ph; k.t = 0; };
  const restNear = (rate = 5) => approach(k.near, k.x - 2.4, 5.4 + Math.sin(k.total * 2) * 0.12, rate, dt);
  const restFar = (rate = 5) => approach(k.far, k.x + 2.4, 5.4 + Math.sin(k.total * 2 + 1) * 0.12, rate, dt);
  switch (k.phase) {
    case 'enter':
      if (k.x - px < 3.5) k.spot = Math.max(k.spot, k.x);   // you ran up to him: he plants himself right here
      k.x = Math.max(k.spot, k.x - 4 * dt);
      k.walk += dt * 7;
      k.near.x = k.x - 2.4; k.far.x = k.x + 2.4;
      if (k.x <= k.spot + 1e-6) go('idle');
      break;
    case 'idle':
      restNear(); restFar();
      if (k.x - px > 11) { k.x -= 3 * dt; k.walk += dt * 6; }   // too far to reach you: he stomps closer
      if (k.t > KING_PAUSE) {
        if (k.total > KING_TIME) go('leave');
        else go(KING_PLAN[k.planIx++ % KING_PLAN.length] === 'sweep' ? 'windup' : 'hover');
      }
      break;
    case 'windup':
      restNear();
      approach(k.far, k.x + 1.3, 6.3, 6, dt);
      k.farOpen = 1;
      if (k.t > WINDUP_T) {
        go('reach');
        k.swept = false; k.sx = k.far.x; k.sy = k.far.y;
        k.lx = Math.min(k.x - 14, px - 6);   // always lands well away from you
      }
      break;
    case 'reach': {
      // the hand flies over your head in a high arc and lands on the far side (harmless up there)
      restNear();
      const u = Math.min(1, k.t / 0.45), e = u * u * (3 - 2 * u);
      k.far.x = lerp(k.sx, k.lx, e);
      k.far.y = lerp(k.sy, surfaceAt(k.lx - 0.3, k.lx + 0.3) + SWEEP_Y, e) + Math.sin(u * Math.PI) * 1.5;
      if (u >= 1) { go('sweep'); if (!sim) { st.shake = Math.max(st.shake, 0.3); sfx.kingStep(); } }
      break;
    }
    case 'sweep':
      restNear();
      k.far.x += SWEEP_V * dt;
      k.far.y = surfaceAt(k.far.x - 0.3, k.far.x + 0.3) + SWEEP_Y;
      if (k.far.x > k.x - 1.3) go('back');
      break;
    case 'back':
      restNear(); restFar(3);
      if (k.t > 0.6) go('idle');
      break;
    case 'hover': {
      restFar();
      k.nearOpen = 1;
      const tx = clamp(px, k.x - 15, k.x - 1.5);
      k.near.x += clamp(tx - k.near.x, -HOVER_V * dt, HOVER_V * dt);   // slower than you walk
      k.near.y += (4.4 - k.near.y) * Math.min(1, dt * 5);
      if (k.t > HOVER_T) go('lock');
      break;
    }
    case 'lock':
      restFar();
      if (k.t > LOCK_T) go('slam');
      break;
    case 'slam': {
      restFar();
      const floor = surfaceAt(k.near.x - 0.45, k.near.x + 0.45) + 0.55;
      k.near.y = Math.max(floor, k.near.y - SLAM_FALL * dt);
      k.nearOpen = 0.6;
      if (k.near.y <= floor + 1e-6) { go('rest'); if (!sim) slamImpact(k); }
      break;
    }
    case 'rest':
      restFar();
      k.nearOpen = 0.3;
      if (k.t > REST_T) go('lift');
      break;
    case 'lift':
      restNear(3); restFar();
      k.nearOpen = 1;
      if (k.t > 0.7) go('idle');
      break;
    case 'fooled':
      // you got over him: he looks around for you, then runs off the other way
      restNear(); restFar();
      if (k.t > 1.2) { k.dir = -1; go('leave'); }
      break;
    case 'leave':
      k.x += k.dir * 9 * dt;       // faster than you can follow
      k.walk += dt * 14;
      approach(k.near, k.x - 2.4, 5.4, 8, dt);
      approach(k.far, k.x + 2.4, 5.4, 8, dt);
      break;
  }
}
function cloneKing(k) { return { ...k, near: { ...k.near }, far: { ...k.far }, wall: null }; }
function circleHits(cx, cy, R, p) {
  const hw = p.w * 0.4;
  const nx = clamp(cx, p.x - hw, p.x + hw), ny = clamp(cy, p.y + 0.05, p.y + p.h * 0.85);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < R * R;
}
// A hand is awake — and catches you on touch — unless it's the big one asleep after a slam, the
// small one flying through the air, or he's already leaving.
function handsAwake(k) {
  const calm = k.phase === 'fooled' || k.phase === 'leave';
  return { near: !calm && k.phase !== 'rest' && k.phase !== 'lift', far: !calm && k.phase !== 'reach' };
}
function kingContact(k, p) {
  const a = handsAwake(k);
  if (a.near && circleHits(k.near.x, k.near.y, SLAM_R, p)) return 'near';
  if (a.far && circleHits(k.far.x, k.far.y, SWEEP_R, p)) return 'far';
  return null;
}
// His arms as walkable curves: the same arch drawKing draws, shoulder (t = 0) to hand (t = 1),
// in world coordinates. x runs one way along it, so the top is a height for every x.
const ARM_N = 24;
function armPoly(k, which) {
  const near = which === 'near', h = near ? k.near : k.far;
  const sx = k.x + (near ? -0.3 : 0.3), sy = 3.12;
  const cx = (sx + h.x) / 2 + (sx - h.x) * 0.15;
  const cy = Math.min(6.2, Math.max(sy, h.y) + 1.6 + Math.abs(h.x - sx) * 0.18);
  const pts = [];
  for (let i = 0; i <= ARM_N; i++) {
    const t = i / ARM_N, u = 1 - t;
    pts.push([u * u * sx + 2 * u * t * cx + t * t * h.x, u * u * sy + 2 * u * t * cy + t * t * h.y]);
  }
  return pts;
}
function armSurface(k, which, x) {
  const pts = which === 'near' ? k.polyN : k.polyF;
  if (!pts) return null;
  const h = which === 'near' ? k.near : k.far;
  const half = which === 'near' ? 0.17 : 0.15, handR = which === 'near' ? 0.6 : 0.45;
  const asleep = which === 'near' && (k.phase === 'rest' || k.phase === 'lift');
  let y = -Infinity, slope = 0;
  for (let i = 0; i < ARM_N; i++) {
    const p = pts[i], q = pts[i + 1];
    if (p[0] === q[0] || (x - p[0]) * (x - q[0]) > 0) continue;
    const u = (x - p[0]) / (q[0] - p[0]);
    y = p[1] + (q[1] - p[1]) * u + half;
    slope = (q[1] - p[1]) / (q[0] - p[0]);
    break;
  }
  if (Math.abs(x - h.x) < handR) {
    if (!asleep) return null;              // the end of the arm is a hand: don't touch it
    if (h.y + 0.42 > y) { y = h.y + 0.42; slope = 0; }   // the sleeping hand is a step up onto its arm
  }
  return y > -Infinity ? { y, slope } : null;
}
// Land on an arm from above (generously: from a little below counts), or walk into the sleeping
// hand and get lifted on. Only called when you're not already on one.
function onArms() {
  for (const which of ['near', 'far']) {
    const sf = armSurface(king, which, P.x);
    if (!sf) continue;
    const up = sf.y - P.y;
    const landing = !P.ground && P.vy <= 0 && up >= -0.02 && P.prevY >= sf.y - 0.6;
    const lifted = P.ground && which === 'near' && handsAwake(king).near === false && up > -0.05 && up < ARM_STEP;
    if (!landing && !lifted) continue;
    const vy = P.vy;
    P.arm = which;
    P.y = sf.y;
    P.vy = 0;
    if (!P.ground) { P.ground = true; land(vy); }
    return;
  }
}
function updateKing(dt) {
  if (!king) {
    if (st.mode !== 'over' && P.x > st.kingAt) startKing();
    return;
  }
  const k = king, was = k.phase;
  kingStep(k, dt, P.x, false);
  if (k.phase !== was) kingPhase(k);
  if (k.wall) k.wall.x = k.x - 1.2;
  k.polyN = armPoly(k, 'near');
  k.polyF = armPoly(k, 'far');
  // standing on an arm: it carries you as it moves
  if (P.arm) {
    const sf = armSurface(k, P.arm, P.x);
    if (sf && Math.abs(sf.y - P.y) < 1.5) { P.y = sf.y; P.vy = 0; } else { P.arm = null; P.ground = false; }
  }
  if (k.phase === 'enter' || k.phase === 'leave' || (k.phase === 'idle' && k.x - P.x > 11)) {
    k.stepT -= dt;
    if (k.stepT <= 0) { k.stepT = k.phase === 'leave' ? 0.2 : 0.38; st.shake = Math.max(st.shake, 0.18); sfx.kingStep(); }
  }
  if (k.phase === 'leave' && (k.x > cam.x + view.viewW + 10 || k.x < cam.x - 8)) { endKing(); return; }
  if (k.phase === 'fooled' || k.phase === 'leave') return;
  // jumping the sweeping hand
  if (k.phase === 'sweep' && !k.swept && !P.ground && Math.abs(P.x - k.far.x) < 0.45 && P.y > k.far.y + 0.3) {
    k.swept = true;
    if (st.mode === 'play') { st.points += 15; pop(P.x, P.y + 1.4, 'הופ! +15', C.tower, 28); }
    sfx.over(1);
  }
  // his head and shoulders spring you right over him
  if (Math.abs(P.x - k.x) < 1.25 && P.y > KING_WALL - 0.1 && P.y < 5.4 && !(P.kingFly && P.vy > 0)) kingBounce(k);
  // …and down the other side
  if (P.x > k.x + 1.3 && P.ground) { kingPassed(k); return; }
  if (P.kingFly && P.ground) P.kingFly = false;
  const hand = P.kingFly ? null : kingContact(k, P);
  if (hand && P.invuln <= 0 && st.mode === 'play') kingGrab(k, hand);
}
function kingPhase(k) {
  if (k.phase === 'windup') { pop(k.x - 0.1, 5.1, '!', C.crimson, 46); sfx.windup(); }
  else if (k.phase === 'sweep') sfx.whoosh();
  else if (k.phase === 'lock') sfx.windup();
  else if (k.phase === 'rest' && k.rests++ < 2) pop(k.near.x, k.near.y + 1.7, 'עולים על היד!', C.tower, 28);
  else if (k.phase === 'leave') {
    towers = towers.filter((t) => t !== k.wall);
    k.wall = null;
    if (k.dir > 0) { pop(k.x, 5, 'חה חה חה!', C.crimson, 34); sfx.laugh(); }
  }
}
function slamImpact(k) {
  st.shake = Math.max(st.shake, 0.7);
  burst(k.near.x - 0.5, k.near.y - 0.55, 'dust', 3);
  burst(k.near.x + 0.5, k.near.y - 0.55, 'dust', 3);
  sfx.slamImpact();
  if (st.mode === 'play' && !st.eat && Math.abs(P.x - k.near.x) < 2.2) pop(P.x, P.y + 1.5, 'פספס!', C.blue, 26);
}
function kingBounce(k) {
  takeoff(HEAD_BOUNCE_V);
  P.cut = true;
  P.used = false;
  P.vx = Math.max(P.vx, RUN_V);           // over him, to the far side
  P.kingFly = true;                       // his hands can't catch you on the way over
  k.boing = 1;
  burst(P.x, P.y, 'star', 6);
  pop(k.x, 5.2, 'בוינג!', C.blue, 34);
  sfx.boing();
}
function kingPassed(k) {
  k.passed = true;
  k.phase = 'fooled';
  k.t = 0;
  towers = towers.filter((t) => t !== k.wall);
  k.wall = null;
  P.kingFly = false;
  if (st.mode === 'play') {
    st.points += PASS_PTS;
    st.kingsPassed++;
    hud.pop('#score');
    if (st.hearts < HEARTS) { st.hearts++; hud.pop('#hearts'); pop(P.x, P.y + 2, '+1 ❤️', C.red, 32); }
  }
  pop(k.x, 5.3, '?!', C.crimson, 46);
  hud.flash(`👑 קפצתם מעל המלך! ‎+${PASS_PTS}`, { good: true, dur: 2400 });
  sfx.kingBeaten();
}
// At most one heart a visit, and never your last: after that he just tosses you away.
function kingGrab(k, hand) {
  P.arm = null;
  const bite = !k.bitten && st.hearts > 1;
  st.eat = { king: k, hand, t: 0, hx0: k[hand].x, hy0: k[hand].y, bite };
  if (bite) {
    k.bitten = true;
    st.hearts--;
    hud.pop('#hearts');
  }
  st.hitstop = 0.09;
  st.shake = 0.8;
  pop(k.x, 5.4, 'תפסתי אותך!', C.crimson, 34);
  sfx.grab();
}
// the hand carries you up to his mouth, he chews (or he's full, and doesn't), and spits you back
function updateKingEat(e, dt) {
  const k = e.king, h = k[e.hand], other = e.hand === 'near' ? k.far : k.near;
  const mx = k.x - 0.35, my = 3.5;
  approach(other, k.x + (e.hand === 'near' ? 2.4 : -2.4), 5.4, 4, dt);
  if (e.t < 0.5) {
    const u = 1 - (1 - e.t / 0.5) ** 2;
    h.x = lerp(e.hx0, mx, u);
    h.y = lerp(e.hy0, my, u);
    k[e.hand === 'near' ? 'nearOpen' : 'farOpen'] = 0;
  } else if (e.bite) {
    k.mouth = 0.5 + 0.5 * Math.sin((e.t - 0.5) * 22);
    if (Math.floor(e.t * 8) !== Math.floor((e.t - dt) * 8)) burst(mx + 0.3, my, 'crumb', 2);
  } else if (!e.full) {
    e.full = true;
    pop(k.x, 5.6, 'אני כבר שבע!', C.crimson, 32);
  }
  if (e.t < (e.bite ? 1.3 : 0.9)) return;
  {
    st.eat = null;
    k.mouth = 0;
    k[e.hand === 'near' ? 'nearOpen' : 'farOpen'] = 1;
    k.phase = 'back';
    k.t = 0;
    P.x = Math.max(st.leftLimit, k.x - 2.8);
    P.y = 3.2;
    P.vx = -5;
    takeoff(6);
    P.cut = true;
    P.invuln = 2.2;
    pop(k.x - 0.5, 4.2, 'פּוּ!', C.blue, 30);
    sfx.spit();
  }
}

// ---------- Autopilot (the demo behind the intro card, and the tests' careful player) ----------
// Looks ~1 s ahead for nine choices — walk on, stop or back off, each with no jump, a tap or a
// held jump — and changes plan only when the current one would end in a mouth, a king's hand or
// a wall. It uses the game's own physics, so if it survives, the level is fair.
function simulate(dir, hold, target) {
  const p = { x: P.x, y: P.y, vx: P.vx, vy: P.vy, w: P.w, h: P.h, ground: P.ground, landed: false };
  const fs = foes.filter((f) => Math.abs(f.x - P.x) < 14).map((f) => ({
    x: f.x, y: f.y, vx: f.vx, vy: f.vy, w: f.w, h: f.h, ground: f.ground, landed: false, facing: f.facing,
    type: f.type, hopWait: f.hopWait, safe: Math.max(f.scared, f.dizzy, f.knockT), prevY: f.y, kick: f.kickT, kickV: f.kickV,
    speed: FOES[f.type].speed * foeMul(st.maxX),
  }));
  const kc = king && king.phase !== 'leave' ? cloneKing(king) : null;
  const h = 1 / 60;
  let jumped = false, cut = false, jt = 0, blockedAt = 9;
  for (let t = 0; t < 1.1; t += h) {
    if (hold > 0 && !jumped && p.ground) {
      const climb = P.blocked && P.blockDir === dir && P.blockedTop - p.y > 2;
      p.vy = climb ? Math.sqrt(2 * G * (P.blockedTop - p.y + 0.45)) : JUMP_V;
      p.ground = false; jumped = true; cut = climb;
    }
    jt += h;
    if (jumped && !cut && p.vy > 0 && jt > hold) { p.vy *= CUT; cut = true; }
    const acc = p.ground ? (dir ? ACCEL : FRICTION) : (dir ? AIR_ACCEL : AIR_DRAG);
    p.vx += clamp(dir * RUN_V - p.vx, -acc * h, acc * h);
    p.vy -= G * h;
    const prevY = p.y;
    const c = move(p, h, STEP);
    if (c.wall && c.wall === dir && blockedAt > 8) blockedAt = t;
    if (p.x < st.leftLimit) { p.x = st.leftLimit; p.vx = Math.max(0, p.vx); }
    for (const f of fs) {
      if (f.safe <= t && !(f.kick > 0)) {
        // the same chase as updateFoe: turn to face you, lunge when close and level
        const dx = p.x - f.x;
        if (f.type !== 'roller') f.facing = dx > 0 ? 1 : -1;
        f.vx = f.facing * f.speed * (Math.abs(dx) < 2.2 && Math.abs(p.y - f.y) < 0.9 && Math.sign(dx) === f.facing ? 1.5 : 1);
      }
      f.vy -= G * h;
      f.prevY = f.y;
      const fc = move(f, h, 0.18);
      if (f.kick > 0 && (f.kick -= h) <= 0) f.vy = f.kickV;
      else if (fc.wall && f.type === 'runner' && f.ground && !(f.kick > 0) && fc.wallTop < 6) { f.kick = 0.3; f.kickV = Math.sqrt(2 * G * (fc.wallTop - f.y + 0.4)); f.vx = 0; }
      if (fc.wall && f.type === 'roller') f.facing = -fc.wall;
      if (f.type === 'hopper' && f.ground && (f.hopWait -= h) <= 0) { f.vy = FOES.hopper.hopV; f.ground = false; f.hopWait = HOP_WAIT; }
      if (f.safe > t) continue;
      const r = contact(p, prevY, f);
      if (r === 'eat') return { hit: t, blockedAt, dist: Math.abs(target - p.x) };
      if (r === 'bounce') return { hit: 9, blockedAt, dist: Math.max(0, Math.abs(target - p.x) - 3) };
      if (r === 'squish') f.safe = t + 0.8;
    }
    if (kc) {
      kingStep(kc, h, p.x, true);
      if (kingContact(kc, p)) return { hit: t, blockedAt, dist: Math.abs(target - p.x) };
    }
  }
  return { hit: 9, blockedAt, dist: Math.abs(target - p.x) };
}
// not being caught beats everything; then getting where it's going
const planScore = (r) => (r.hit >= 9 ? 100 : r.hit * 10) - r.dist * 0.5;
function botTarget() {
  if (king && king.phase !== 'leave' && !king.passed) return king.x - 5.5;
  return P.x + 30;
}
function botThink(dt) {
  bot.holdT += dt;
  bot.cool -= dt;
  bot.moveT -= dt;
  // the king: once his big hand is asleep, walk into it, up the arm and over his head
  if (king && !king.passed && king.phase !== 'leave') {
    if (P.arm || P.kingFly) return { pressed: false, held: false, x: 1 };
    if (king.phase === 'rest' && king.t < REST_T - 1.3 && Math.abs(king.near.x - P.x) < 5) {
      return { pressed: false, held: false, x: king.near.x >= P.x ? 1 : -1 };
    }
  }
  const target = botTarget();
  const pref = Math.abs(target - P.x) < 0.5 ? 0 : Math.sign(target - P.x);
  if (bot.moveT <= 0 && P.ground) bot.move = pref;   // a dodge is kept until it has landed
  let press = false;
  if (P.ground && bot.cool <= 0) {
    const base = simulate(bot.move, 0, target);
    if (P.blocked || base.hit < 0.9 || base.blockedAt < 0.3 || (king && (base.hit < 1.1 || king.phase === 'rest'))) {
      let best = { dir: bot.move, hold: 0 }, bestS = planScore(base);
      for (const dir of [1, 0, -1]) {
        for (const hold of [0, 0.45, 0.12]) {
          if (dir === bot.move && !hold) continue;
          const sc = planScore(simulate(dir, hold, target));
          if (sc > bestS + 1e-6) { bestS = sc; best = { dir, hold }; }
        }
      }
      if (best.dir !== bot.move || best.hold) { bot.move = best.dir; bot.moveT = 0.35; }
      if (best.hold) { press = true; bot.want = best.hold; bot.holdT = 0; bot.cool = 0.15; }
    }
  }
  return { pressed: press, held: bot.holdT < bot.want, x: bot.move };
}

// ---------- Effects ----------
function burst(x, y, kind, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI;
    const sp = kind === 'star' ? 3 + Math.random() * 3 : kind === 'crumb' ? 2 + Math.random() * 3 : 0.8 + Math.random();
    parts.push({
      kind, x: x + (Math.random() - 0.5) * 0.5, y: y + (kind === 'dust' ? 0.1 : 0.3),
      vx: Math.cos(a) * sp * (kind === 'dust' ? 1.4 : 1), vy: Math.sin(a) * sp * (kind === 'dust' ? 0.4 : 1),
      life: kind === 'dust' ? 0.45 : 0.6, max: kind === 'dust' ? 0.45 : 0.6, R: 0.12 + Math.random() * 0.1,
      rot: Math.random() * TAU, color: kind === 'crumb' ? { cute: C.red, scary: C.green, regular: C.maroon }[st.kind] : C.gold,
    });
  }
}
function pop(x, y, text, color, size = 30) {
  pops.push({ x, y, text, color, size, t: 0, life: 1 });
}
function updateFx(dt, raw) {
  for (const p of parts) {
    p.life -= dt;
    p.x += (p.vx || 0) * dt;
    p.y += (p.vy || 0) * dt;
    if (p.kind === 'star' || p.kind === 'crumb') p.vy -= 14 * dt;
  }
  parts = parts.filter((p) => p.life > 0);
  for (const p of pops) p.t += raw;
  pops = pops.filter((p) => p.t < p.life);
  for (const t of towers) {
    t.sqv += (-220 * t.sq - 14 * t.sqv) * dt;
    t.sq += t.sqv * dt;
  }
  for (const h of hearts) { h.t += dt; if (h.taken) h.gone = (h.fade = (h.fade || 0) + dt) > 0.3; }
}

const sfx = {
  jump: () => { beep(420, 0, 0.12, 'square', 0.06, 760); noise(0.16, 2200, 0.025, 0, 0.7); },
  double: () => beep(620, 0, 0.12, 'square', 0.06, 1180),
  land: (v) => noise(0.06, 380, Math.min(0.12, 0.03 + v * 0.005)),
  bonk: () => beep(150, 0, 0.1, 'square', 0.07, 90),
  over: (combo) => chord([660, 880, 1100, 1320].slice(0, Math.min(4, combo + 1)).map((f) => f * (1 + (combo - 1) * 0.06)), 0.05, 0.12, 'triangle', 0.08),
  boing: () => beep(300, 0, 0.2, 'sine', 0.14, 900),
  chomp: () => { for (let i = 0; i < 3; i++) noise(0.07, 260, 0.2, 0.2 + i * 0.16); beep(170, 0, 0.35, 'sawtooth', 0.07, 70); },
  spit: () => beep(520, 0, 0.14, 'square', 0.07, 260),
  slam: () => beep(700, 0, 0.18, 'square', 0.05, 200),
  roar: () => { noise(0.5, 170, 0.22, 0, 0.8); beep(120, 0, 0.45, 'sawtooth', 0.1, 55); },
  heart: () => chord([523, 659, 784, 1047], 0.06, 0.15, 'triangle', 0.08),
  over1: () => chord([392, 330, 262, 196], 0.15, 0.3, 'triangle', 0.1),
  kingRoar: () => { noise(0.9, 110, 0.25, 0, 0.7); beep(95, 0, 0.9, 'sawtooth', 0.12, 45); },
  kingStep: () => noise(0.09, 90, 0.14),
  windup: () => beep(300, 0, 0.45, 'triangle', 0.06, 720),
  whoosh: () => noise(0.55, 900, 0.09, 0, 0.6),
  slamImpact: () => { noise(0.3, 110, 0.3); beep(70, 0, 0.3, 'sine', 0.2, 40); },
  kingHurt: () => { beep(520, 0, 0.18, 'square', 0.08, 300); beep(420, 0.14, 0.25, 'square', 0.07, 200); },
  kingBeaten: () => chord([523, 659, 784, 1047, 1319], 0.09, 0.3, 'triangle', 0.1),
  laugh: () => { for (let i = 0; i < 3; i++) beep(260 - i * 20, i * 0.16, 0.12, 'sawtooth', 0.07, 200 - i * 20); },
  grab: () => { noise(0.2, 400, 0.15); beep(200, 0.05, 0.3, 'sawtooth', 0.08, 90); },
};

// ---------- Frame ----------
function update(dt, raw) {
  updateFx(dt, raw);
  if (st.mode === 'over') {
    st.overT += raw;
    const f = st.overFoe;
    if (f) {
      f.mouth = st.overT < 1 ? 0.5 + 0.5 * Math.sin(st.overT * 24) : Math.max(0, f.mouth - raw * 2);
      f.phase += raw * 3;
      f.sqv += (-150 * f.sq - 10 * f.sqv) * raw;
      f.sq += f.sqv * raw;
    }
    if (st.overT > 1.3 && !st.overShown) showGameOver();
    if (st.overT > 1.9) document.querySelectorAll('#gameover button').forEach((b) => { b.disabled = false; });
    return;
  }
  if (st.eat) { updateEat(dt); return; }
  st.t += dt;
  st.hintT = Math.max(0, st.hintT - dt);
  const inp = readInput(dt);
  const n = Math.max(1, Math.ceil(dt / SUB - 1e-6));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    updatePlayer(h, inp);
    inp.pressed = false;
    for (const f of foes) updateFoe(f, h);
    interact();
    if (st.eat) break;
    updateKing(h);
    if (st.eat) break;
  }
  // ghost trail while flipping
  P.trailT -= dt;
  if (!P.ground && P.trailT <= 0) { P.trail.unshift({ x: P.x, y: P.y, a: P.angle * P.flipDir, f: P.facing }); P.trailT = 0.03; }
  if (P.ground || P.trail.length > 4) P.trail.length = P.ground ? 0 : 4;
  updateCam(dt);
  keepBusy(dt);
  growWorld();
  syncHud();
}

// A dead zone: walk inside the middle band and the page holds still; push past it and it scrolls.
// While the king is here he always stays on screen.
function updateCam(dt) {
  let tx = cam.x;
  const lo = view.viewW * 0.3, hi = view.viewW * 0.45;
  if (P.x > cam.x + hi) tx = P.x - hi;
  else if (P.x < cam.x + lo) tx = P.x - lo;
  if (king && king.phase !== 'leave' && !king.passed) tx = Math.min(tx, king.x + 3.2 - view.viewW);
  tx = Math.max(tx, st.leftLimit - 1);
  cam.x = Math.abs(tx - cam.x) > 3 ? lerp(cam.x, tx, Math.min(1, dt * 8)) : tx;
  cam.y = lerp(cam.y, Math.max(0, P.y + 2.4 - view.groundY / view.s), Math.min(1, dt * (P.kingFly ? 9 : 4)));
}

function step(raw) {
  st.anim += raw;
  st.hitstop = Math.max(0, st.hitstop - raw);
  st.shake = Math.max(0, st.shake - raw * 2);
  const dt = raw * (st.hitstop > 0 ? 0.08 : 1);
  update(dt, raw);
  input.endFrame();
}

function render() {
  const { W, H, dpr, s, groundY, tileW } = view;
  const v = Math.floor(st.anim * BOIL_FPS) % 3;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  const sh = st.shake * st.shake * s * 0.25;
  const shx = Math.sin(st.anim * 53) * sh, shy = Math.sin(st.anim * 47) * sh * 0.7;
  // pencil scribbles, drifting slower than the world
  ctx.globalAlpha = 0.42;
  const bgOff = -(((cam.x * s * 0.3) % tileW) + tileW) % tileW;
  for (let x = bgOff; x < W; x += tileW) ctx.drawImage(view.bg, Math.round(x + shx * 0.3), 0, tileW, H);   // whole pixels, or the tiles leave a hairline seam
  ctx.globalAlpha = 1;
  const ox = -cam.x * s + shx, oy = groundY + cam.y * s + shy;
  ctx.fillStyle = C.paper;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(0, oy, W, H - oy + 20);
  ctx.globalAlpha = 0.8;
  const gOff = -(((cam.x * s) % tileW) + tileW) % tileW;
  const gh = view.ground.height / dpr;
  for (let x = gOff; x < W; x += tileW) ctx.drawImage(view.ground, Math.round(x + shx), oy + 4, tileW, gh);
  ctx.globalAlpha = 1;
  const fade = ctx.createLinearGradient(0, oy + s * 0.8, 0, oy + gh + 4);   // the hatching thins out downwards
  fade.addColorStop(0, 'rgba(248,246,239,0)');
  fade.addColorStop(1, 'rgba(248,246,239,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, oy + s * 0.8, W, gh + 4 - s * 0.8);
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, oy + gh + 4, W, H);

  // the world, in block units with y down
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
  const x0 = cam.x - 1, x1 = cam.x + view.viewW + 1;
  drawGround(ctx, x0, x1, v);
  if (king) drawKingWorld(king, v);
  for (const t of towers) if (!t.wall && t.x < x1 && t.x + t.w > x0) drawTower(ctx, sprites, t, v);
  for (const h of hearts) {
    if (h.x < x0 || h.x > x1) continue;
    ctx.save();
    ctx.translate(h.x, -(h.y + Math.sin(h.t * 3) * 0.1));
    const hk = h.taken ? 1 + (h.fade || 0) * 3 : 1 + Math.sin(h.t * 6) * 0.05;
    ctx.globalAlpha = h.taken ? Math.max(0, 1 - (h.fade || 0) / 0.3) : 1;
    ctx.scale(hk, hk);
    drawHeart(ctx, sprites, v);
    ctx.restore();
  }
  for (const f of foes) {
    if (f.x < x0 - 1 || f.x > x1 + 1) continue;
    if (f.type === 'roller' && f.ground) {
      for (let i = 0; i < 3; i++) {
        const y = -(f.y + 0.2 + i * 0.22), x = f.x - f.facing * (0.55 + (i % 2) * 0.15);
        stroke(ctx, [[x, y], [x - f.facing * (0.35 + 0.1 * Math.sin(st.anim * 20 + i)), y]], `rgb(${C.graphite})`, 0.035, 0.6);
      }
    }
    ctx.save();
    ctx.translate(f.x, -f.y);
    const q = clamp(f.sq, -0.5, 0.6);
    ctx.scale(1 + q * 0.25, 1 - q * 0.3);
    ctx.translate(0, -0.5 * f.scale);
    ctx.scale(f.scale, f.scale);
    if (f.scared) ctx.translate(Math.sin(st.anim * 60) * 0.03, 0);
    drawFoe(ctx, sprites, f, v, st.anim);
    ctx.restore();
    if ((st.eat && st.eat.foe === f && st.eat.t > 0.2) || (st.overFoe === f && st.overT < 1.1)) drawSwallowed(f, v);
  }
  drawPlayer(v);
  for (const p of parts) drawPart(p);

  // score pop-ups, in screen space so the text stays crisp
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const p of pops) {
    const pk = p.t / p.life;
    const sx = (p.x - cam.x) * s + shx, sy = oy - (p.y + pk * 0.9) * s;
    ctx.font = `900 ${Math.round(p.size * (0.8 + 0.4 * Math.min(1, pk * 4)))}px ${FONT}`;
    ctx.direction = hasHebrew(p.text) ? 'rtl' : 'ltr';
    ctx.globalAlpha = Math.min(1, (1 - pk) * 2.5);
    ctx.lineWidth = 6;
    ctx.strokeStyle = C.paper;
    ctx.strokeText(p.text, sx, sy);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, sx, sy);
  }
  ctx.globalAlpha = 1;
  renderPicks(v);
}

function drawKingWorld(k, v) {
  // the shadow under the hand that's about to come down
  if (k.phase === 'hover' || k.phase === 'lock' || k.phase === 'slam') {
    const g = surfaceAt(k.near.x - 0.45, k.near.x + 0.45);
    const near = clamp(1 - (k.near.y - g) / 5, 0.2, 1);
    ctx.save();
    ctx.globalAlpha = k.phase === 'hover' ? 0.18 + near * 0.3 : 0.5 + 0.2 * Math.sin(st.anim * 30);
    ctx.fillStyle = k.phase === 'hover' ? `rgb(${C.graphite})` : C.crimson;   // red: it's coming down now
    ctx.beginPath();
    ctx.ellipse(k.near.x, -g - 0.02, 0.5 + near * 0.35, 0.1 + near * 0.05, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  const e = st.eat && st.eat.king === k ? st.eat : null;
  ctx.save();
  ctx.translate(k.x, 0);
  const shake = k.phase === 'lock' ? Math.sin(st.anim * 70) * 0.06 : 0;
  drawKing(ctx, sprites, {
    near: [k.near.x - k.x + shake, -k.near.y], far: [k.far.x - k.x, -k.far.y],
    walk: k.walk, lean: k.lean, mouth: k.mouth, nearOpen: k.nearOpen, farOpen: k.farOpen,
    hurt: k.hurt, bob: Math.sin(k.total * 3) * 0.04 + k.boing * 0.25,
  }, v, st.anim);
  ctx.restore();
  if (k.phase === 'rest') {
    for (let i = 0; i < 3; i++) {
      const a = st.anim * 6 + (i / 3) * TAU;
      asterisk(ctx, k.near.x + Math.cos(a) * 0.5, -(k.near.y + 0.75 + Math.sin(a) * 0.12), 0.08, C.gold, a);
    }
  }
  // caught: a little you in his fist on the way up, then your legs kicking out of his mouth
  // (or, when he's already full, still in his fist until he tosses you away)
  if (e && (e.t < 0.5 || !e.bite)) {
    const hnd = k[e.hand], wob = e.t >= 0.5 ? Math.sin(st.anim * 40) * 0.08 : 0;
    ctx.save();
    ctx.translate(hnd.x + wob, -hnd.y);
    ctx.scale(0.6, 0.6);
    drawFigure(ctx, sprites, st.kind, { phase: st.anim * 30, air: true }, v);
    ctx.restore();
  } else if (e) {
    const t = e.t;
    ctx.save();
    ctx.translate(k.x - 0.1, -3.55);
    ctx.rotate(Math.PI - 0.5 + Math.sin(t * 9) * 0.2);
    ctx.scale(0.9, 0.9);
    ctx.translate(0, -(BODY[st.kind].h - 0.5));
    drawFigure(ctx, sprites, st.kind, { phase: t * 30, air: false, legsOnly: true }, v);
    ctx.restore();
  }
}

function drawPlayer(v) {
  const e = st.eat;
  if (st.mode === 'over' || (e && e.king)) return;
  let x = P.x, y = P.y, k = 1;
  if (e) {
    // swallowed: shrink into the mouth
    const t = Math.min(1, e.t / 0.2);
    if (t >= 1) return;
    x = lerp(e.x0, e.foe.x + 0.03 * e.foe.facing * e.foe.scale, t);
    y = lerp(e.y0, e.foe.y + 0.6 * e.foe.scale, t);
    k = 1 - t;
  }
  const still = P.ground && Math.abs(P.vx) < 0.4 && !P.blocked;
  const pose = { phase: P.phase, still, air: !P.ground, flap: P.glide ? Math.sin(P.flap) * 0.5 - 0.3 : Math.sin(P.flap) * 0.2, glide: P.glide };
  for (let i = P.trail.length - 1; i >= 0; i--) {
    const g = P.trail[i];
    if (Math.abs(g.a - P.angle * P.flipDir) < 0.2) continue;
    ctx.save();
    ctx.globalAlpha = 0.16 * (1 - i / 5);
    ctx.translate(g.x, -(g.y + 0.5));
    ctx.rotate(g.a);
    ctx.scale(g.f, 1);
    drawFigure(ctx, sprites, st.kind, pose, v);
    ctx.restore();
  }
  ctx.save();
  if (P.invuln > 0 && !e && Math.floor(P.invuln * 10) % 2) ctx.globalAlpha = 0.35;
  ctx.translate(x, -y);
  const q = clamp(P.sq, -0.5, 0.6);
  ctx.scale(k * (1 + q * 0.3), k * (1 - q * 0.35));
  ctx.translate(0, -0.5);
  ctx.rotate(P.angle * P.flipDir);
  ctx.scale(P.facing, 1);
  drawFigure(ctx, sprites, st.kind, pose, v);
  ctx.restore();
}

// while it chews, your legs kick out of its mouth
function drawSwallowed(f, v) {
  const t = st.eat ? st.eat.t : st.overT;
  ctx.save();
  ctx.translate(f.x + 0.03 * f.facing * f.scale, -(f.y + 0.6 * f.scale));
  ctx.rotate(Math.PI + f.facing * 0.5 + Math.sin(t * 9) * 0.2);
  ctx.scale(f.scale, f.scale);
  ctx.translate(0, -(BODY[st.kind].h - 0.5));
  drawFigure(ctx, sprites, st.kind, { phase: t * 30, air: false, legsOnly: true }, v);
  ctx.restore();
}

function drawPart(p) {
  const k = p.life / p.max;
  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 1.5);
  if (p.kind === 'ring') {
    const R = p.R * (1 - k) + 0.3;
    ctx.strokeStyle = C.green;
    ctx.lineWidth = 0.1 * k + 0.02;
    for (const m of [1, 0.7]) {
      ctx.beginPath();
      ctx.ellipse(p.x, -p.y, R * m, R * m * 0.55, 0, 0, TAU);
      ctx.stroke();
    }
  } else if (p.kind === 'dust') {
    const R = p.R * (1.6 - k);
    stroke(ctx, [[p.x - R, -p.y], [p.x, -p.y - R], [p.x + R, -p.y], [p.x, -p.y + R * 0.4]], `rgb(${C.graphite})`, 0.035, 0.7, true);
  } else if (p.kind === 'star') {
    asterisk(ctx, p.x, -p.y, p.R, p.color, p.rot + (1 - k) * 6);
  } else {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 0.05, -p.y - 0.05, 0.1, 0.1);
  }
  ctx.restore();
}

// ---------- HUD, overlays, character picker ----------
const heartsEl = document.getElementById('hearts');
const kingEl = document.getElementById('kingbar');
let lastHud = '', lastKing = '';
function syncHud() {
  hud.set('#score', `⭐ ${st.score}`);
  hud.set('#dist', `📏 ${Math.floor(Math.max(0, st.maxX))} מ׳`);
  const key = `${st.hearts}`;
  if (key !== lastHud) {
    lastHud = key;
    heartsEl.innerHTML = Array.from({ length: HEARTS }, (_, i) => `<span class="${i < st.hearts ? '' : 'lost'}">❤️</span>`).join('');
  }
  const kk = king && king.phase !== 'leave' && !king.passed ? 'on' : '';
  if (kk !== lastKing) {
    lastKing = kk;
    kingEl.classList.toggle('hidden', !kk);
    kingEl.textContent = '👑 קופצים מעל המלך! לא נוגעים בידיים';
  }
  const hint = document.getElementById('hint');
  if (st.hintT > 0 && st.mode === 'play') {
    const walk = TOUCH ? 'ג׳ויסטיק = הולכים · ⤒ = קפיצה' : '⬅️ ➡️ = הולכים · רווח = קפיצה (מחזיקים = גבוה יותר)';
    hud.set(hint, `${walk} · ${CHARS[st.kind].hint}`);
    hint.classList.remove('hidden');
  } else hint.classList.add('hidden');
}

function gameOver(f) {
  st.eat = null;
  st.mode = 'over';
  st.overT = 0;
  st.overFoe = f;
  f.dizzy = 0;
  hud.stopMusic();
  sfx.over1();
}
function showGameOver() {
  st.overShown = true;
  const best = hud.best('jump-best', st.score);
  hud.set('#finalScore', `⭐ ${st.score}`);
  hud.set('#goDetail', `📏 ${Math.floor(st.maxX)} מטר · 🤸 קפצתם מעל ${st.overs} רעים${st.bestCombo > 1 ? ` · הכי הרבה בקפיצה אחת: ${st.bestCombo}` : ''}${st.kingsPassed ? ` · 👑 קפצתם מעל המלך${st.kingsPassed > 1 ? ` ${st.kingsPassed} פעמים` : ''}` : ''}`);
  hud.set('#bestScore', st.score >= best ? '🏆 שיא חדש!' : `🏆 השיא: ${best}`);
  document.querySelectorAll('#gameover button').forEach((b) => { b.disabled = true; });
  hud.show('#gameover');
}

let selected = 'cute';
try { if (KINDS.includes(localStorage.getItem('jump-char'))) selected = localStorage.getItem('jump-char'); } catch { /* private mode */ }
const picks = [...document.querySelectorAll('.pick')];
function select(kind) {
  selected = kind;
  try { localStorage.setItem('jump-char', kind); } catch { /* ignore */ }
  for (const p of picks) p.setAttribute('aria-checked', String(p.dataset.char === kind));
  if (st.mode === 'demo') reset(kind, 'demo');
}
for (const p of picks) {
  p.addEventListener('click', () => (p.dataset.char === selected ? startRun() : select(p.dataset.char)));
}
window.addEventListener('keydown', (e) => {
  if (!hud.visible('#intro')) return;
  const i = KINDS.indexOf(selected);
  // the cards read right-to-left like the drawing: cute on the right, regular on the left
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') select(KINDS[Math.min(2, i + 1)]);
  if (e.code === 'ArrowRight' || e.code === 'KeyD') select(KINDS[Math.max(0, i - 1)]);
});
let upPressed = false;
window.addEventListener('keydown', (e) => {
  if (e.repeat || hud.overlayOpen()) return;
  if (e.code === 'ArrowUp' || e.code === 'KeyW') upPressed = true;
});
// with a mouse, a click on the page is a jump too (touch screens get the stick and the ⤒ button)
canvas.addEventListener('pointerdown', (e) => {
  if (hud.overlayOpen() || e.pointerType === 'touch') return;
  e.preventDefault();
  input.p1.pressed.a = true;
  input.p1.touchDown.a = true;
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(ev, () => { input.p1.touchDown.a = false; });

function renderPicks(v) {
  if (!hud.visible('#intro')) return;
  const dpr = view.dpr;
  picks.forEach((p, idx) => {
    const c = p.querySelector('canvas');
    const size = c.clientWidth || 120;
    if (c.width !== Math.round(size * dpr)) { c.width = c.height = Math.round(size * dpr); }
    const g = c.getContext('2d');
    const k = size / 2.05;
    pickSprites.setScale(k * dpr);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(dpr * k, 0, 0, dpr * k, (dpr * size) / 2, dpr * size * 0.88);
    const kind = p.dataset.char;
    const t = st.anim + idx * 0.37;
    let y = 0, a = 0, air = false;
    if (kind === selected) {
      const ph = t % 1.5;
      if (ph < 0.72) { y = (JUMP_V * ph - 0.5 * G * ph * ph) * 0.25; a = (ph / 0.72) * TAU; air = true; }
    } else y = Math.abs(Math.sin(t * 3)) * 0.06;
    drawGround(g, -1.3, 1.3, v);
    g.save();
    g.translate(0, -(y + 0.5));
    g.rotate(a);
    drawFigure(g, pickSprites, kind, { phase: t * 5, air, flap: Math.sin(t * 5) * 0.25 }, v);
    g.restore();
  });
}

function startRun() {
  hud.hide('#intro');
  hud.hide('#gameover');
  document.body.classList.add('playing');
  reset(selected, 'play');
  hud.startMusic();
}
function toPicker() {
  hud.hide('#gameover');
  document.body.classList.remove('playing');
  reset(selected, 'demo');
  hud.show('#intro');
  hud.stopMusic();
}
hud.bind({ start: startRun, restart: startRun, pick: toPicker });
select(selected);
reset(selected, 'demo');

// ---------- Loop + test hook ----------
if (!SIM) {
  let last = performance.now();
  const tick = (now) => {
    requestAnimationFrame(tick);
    const raw = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(raw);
    render();
  };
  requestAnimationFrame(tick);
}

window.__jump = {
  st, P, cam, view, CHARS, FOES, TAU, JUMP_V, G, RUN_V, KING_TIME, REST_T,
  get towers() { return towers; },
  get foes() { return foes; },
  get hearts() { return hearts; },
  get king() { return king; },
  step, render, reset, spawnFoe, addTower, surfaceAt,
  start(kind = 'cute', seed) { select(kind); startRun(); if (seed !== undefined) reset(kind, 'play', seed); },
  // an empty flat world, generators and the king off — for setting up one scene at a time
  clear() { towers.length = 0; foes.length = 0; hearts.length = 0; st.spawns = false; st.kingAt = Infinity; },
  summonKing(at = P.x - 1) { st.kingAt = at; },
  press() { virt.pressed = true; virt.held = true; },
  release() { virt.held = false; },
  walk(dir) { virt.x = dir; },
};
