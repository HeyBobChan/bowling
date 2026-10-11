// Marker-on-paper art for "קופצים מעל הרעים" (jump.html). The drawings are the spec:
//   drawings/jump-game-1-characters.webp — the three box characters: חמודה (red box, big round
//     eyes, green hands in the air), מפחידה (dark green box, angry eyes, a mouth of zigzag
//     teeth, red arms) and רגילה (a narrow maroon box with a blue wing for one arm). All three
//     have blue outlines and blue tube legs.
//   drawings/jump-game-2-bad-guys.webp — the bad guy: a spiky star with a teal middle, two
//     green horns, zigzag arms with round fists, one leg in a big shoe, one on a spiral wheel.
//   drawings/jump-game-3-background.webp — grey pencil scribbles over the whole page.
//   drawings/jump-game-4-towers.png — green marker boxes stacked one, two and three high.
//   drawings/jump-game-5-monster-king.webp — the monster king: a little round head with orange
//     spiky hair and two black horns, a thin pencil body with blue patches and a maroon sash, blue
//     puffy shorts, long legs on clawed bird feet, and two enormous arms that arch over his head,
//     striped with yellow lightning zigzags, ending in a big cloud hand and a smaller one — black
//     claws, blue cuffs.
// Everything here is in BLOCK units (1 = one green box) with y pointing down. Lines "boil"
// like hand-drawn animation: the game picks one of three wobble variants, 8 times a second.

export const TAU = Math.PI * 2;
export const FONT = '"Comic Sans MS", "Chalkboard SE", "Comic Neue", Arial, sans-serif';

export const C = {
  paper: '#f8f6ef',
  ink: '#2a2118',
  blue: '#2c5fcf',
  red: '#d8322b',
  darkRed: '#5b1512',
  green: '#1f6b37',
  lime: '#86c73a',
  limeDark: '#4b8a1c',
  maroon: '#841f2c',
  crimson: '#b41f4e',
  teal: '#1c9db3',
  black: '#262428',
  tower: '#1d7d44',
  pink: '#f59ab0',
  gold: '#f2b90f',
  yellow: '#f2cf0c',
  orange: '#ec6a1c',
  cyan: '#27a6cf',
  graphite: '48,48,54',
};

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash(i, j = 0) {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul((j | 0) + 0x9e37, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}
const J = (r, a) => (r() * 2 - 1) * a;
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

// ---------- Primitives ----------

// A smooth marker path through the points (quadratic curves between midpoints).
function trace(ctx, pts, closed = false) {
  ctx.beginPath();
  const n = pts.length;
  if (n < 3) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (closed) ctx.closePath();
    return;
  }
  if (closed) {
    const m0 = mid(pts[n - 1], pts[0]);
    ctx.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const m = mid(pts[i], pts[(i + 1) % n]);
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    }
    ctx.closePath();
  } else {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n - 1; i++) {
      const m = mid(pts[i], pts[i + 1]);
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    }
    ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
  }
}
function poly(ctx, pts, closed = true) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (closed) ctx.closePath();
}
function ink(ctx, color, width, alpha) {
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}
// smooth stroke
export function stroke(ctx, pts, color, width, alpha = 1, closed = false) {
  const a0 = ctx.globalAlpha;
  ink(ctx, color, width, alpha);
  trace(ctx, pts, closed);
  ctx.stroke();
  ctx.globalAlpha = a0;
}
// sharp stroke (zigzags, stars, horns)
export function line(ctx, pts, color, width, closed = false, alpha = 1) {
  const a0 = ctx.globalAlpha;
  ink(ctx, color, width, alpha);
  poly(ctx, pts, closed);
  ctx.stroke();
  ctx.globalAlpha = a0;
}

// A hand-drawn straight line: bowed a little and overshooting its ends, like a kid's box corners.
function wline(r, x0, y0, x1, y1, wob = 0.025, over = 0) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const o0 = over * (0.3 + r()), o1 = over * (0.3 + r());
  const bow = J(r, wob * 1.6);
  const segs = L > 1.2 ? 4 : 2;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const along = i === 0 ? -o0 : i === segs ? L + o1 : t * L;
    const off = Math.sin(t * Math.PI) * bow + J(r, wob * 0.5);
    pts.push([x0 + ux * along + nx * off, y0 + uy * along + ny * off]);
  }
  return pts;
}
function box(r, x, y, w, h, wob = 0.03) {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([a, b]) => [a + J(r, wob), b + J(r, wob)]);
}
function edges(ctx, r, cs, color, width, over = 0.05, alpha = 1) {
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i], b = cs[(i + 1) % cs.length];
    stroke(ctx, wline(r, a[0], a[1], b[0], b[1], 0.022, over), color, width, alpha);
  }
}
function ellipse(r, cx, cy, rx, ry, n = 10, wob = 0.02, rot = 0) {
  const pts = [];
  const c = Math.cos(rot), s = Math.sin(rot), a0 = r() * TAU;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU;
    const x = Math.cos(a) * (rx + J(r, wob)), y = Math.sin(a) * (ry + J(r, wob));
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return pts;
}
// Back-and-forth marker fill across a disc of radius R (the caller clips it to a shape).
function scribble(ctx, r, cx, cy, R, color, { gap = 0.07, width = 0.06, angle = -0.55, alpha = 0.9 } = {}) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  ctx.beginPath();
  let side = r() < 0.5 ? -1 : 1, first = true;
  for (let v = -R; v <= R + gap; v += gap * (0.75 + r() * 0.5)) {
    const u = side * (R + J(r, R * 0.08)), vv = v + J(r, gap * 0.3);
    const x = cx + u * ca - vv * sa, y = cy + u * sa + vv * ca;
    if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    side = -side;
  }
  const a0 = ctx.globalAlpha;
  ink(ctx, color, width, alpha);
  ctx.stroke();
  ctx.globalAlpha = a0;
}
// A scribble-filled wobbly ellipse with an outline: fists, shoes, feet, eyes.
function blob(ctx, r, cx, cy, rx, ry, fill, lineColor, lw, { rot = 0, paper = true, n = 10 } = {}) {
  const pts = ellipse(r, cx, cy, rx, ry, n, Math.min(rx, ry) * 0.12, rot);
  if (paper || fill) {
    ctx.save();
    trace(ctx, pts, true);
    if (paper) { ctx.fillStyle = C.paper; ctx.fill(); }
    if (fill) {
      ctx.clip();
      const R = Math.max(rx, ry) * 1.1;
      scribble(ctx, r, cx, cy, R, fill, { gap: R * 0.26, width: R * 0.24, angle: J(r, 1.2) });
    }
    ctx.restore();
  }
  if (lineColor) stroke(ctx, pts, lineColor, lw, 1, true);
}
function dot(ctx, x, y, rad, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.fill();
}
// the kids draw arms and legs as two parallel lines: a thick stroke with paper down the middle
function tube(ctx, pts, color, w) {
  stroke(ctx, pts, color, w);
  stroke(ctx, pts, C.paper, w * 0.4);
}
function spikyHand(ctx, r, x, y, dir, color, size) {
  for (let i = -2; i <= 2; i++) {
    const a = dir + i * 0.45 + J(r, 0.12), L = size * (0.75 + r() * 0.45);
    line(ctx, [[x, y], [x + Math.cos(a) * L, y + Math.sin(a) * L]], color, size * 0.3);
  }
  dot(ctx, x, y, size * 0.28, color);
}
function wavy(ctx, r, x0, y0, x1, y1, color, width, waves = 2.5, amp = 0.045) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const pts = [];
  const n = 10;
  const ph = r() * TAU;
  for (let i = 0; i <= n; i++) {
    const t = i / n, o = Math.sin(t * waves * TAU + ph) * amp * Math.sin(t * Math.PI + 0.3);
    pts.push([x0 + dx * t + nx * o, y0 + dy * t + ny * o]);
  }
  stroke(ctx, pts, color, width);
}

// ---------- Sprite cache ----------
// Static pieces (bodies, stars, fists, blocks) are painted once per boil variant at the
// current screen scale and blitted; limbs are drawn live so they can run and wave.
export function createSprites() {
  const cache = new Map();
  let scale = 0;
  return {
    setScale(k) {
      if (Math.abs(k - scale) > 1e-3) { scale = k; cache.clear(); }
    },
    draw(ctx, key, bx, paint) {
      let c = cache.get(key);
      if (!c) {
        c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(bx[2] * scale));
        c.height = Math.max(1, Math.ceil(bx[3] * scale));
        const g = c.getContext('2d');
        const kx = c.width / bx[2], ky = c.height / bx[3];
        g.setTransform(kx, 0, 0, ky, -bx[0] * kx, -bx[1] * ky);
        paint(g);
        cache.set(key, c);
      }
      ctx.drawImage(c, bx[0], bx[1], bx[2], bx[3]);
    },
  };
}

// ---------- The three characters ----------
// Local frame: origin at the middle of the figure, feet at y = +0.5, top of the box at -0.5.
export const BODY = {
  cute:    { w: 0.8,  h: 0.7,  fill: C.red,    seed: 11 },
  scary:   { w: 0.88, h: 0.72, fill: C.green,  seed: 23 },
  regular: { w: 0.62, h: 0.76, fill: C.maroon, seed: 37 },
};
const BODY_TOP = -0.5;
const BODY_BOX = [-0.62, -0.8, 1.24, 1.2];

function tuft(g, r, color, pts) {
  line(g, pts.map(([x, y]) => [x + J(r, 0.012), y + J(r, 0.012)]), color, 0.045);
}

const FACE = {
  cute(g, r) {
    // two big round eyes, pink cheeks and a wide open smile
    for (const ex of [-0.17, 0.17]) {
      blob(g, r, ex, -0.3, 0.135, 0.14, null, C.blue, 0.045);
      blob(g, r, ex + 0.03, -0.28, 0.06, 0.065, C.blue, C.blue, 0.02, { paper: false });
      dot(g, ex - 0.005, -0.33, 0.024, '#fff');
    }
    for (const cx of [-0.3, 0.3]) {
      g.globalAlpha = 0.75;
      blob(g, r, cx, -0.12, 0.06, 0.035, C.pink, null, 0, { paper: false });
      g.globalAlpha = 1;
    }
    const m = [[-0.21, -0.1], [0, -0.075], [0.21, -0.1], [0.13, 0.03], [0, 0.075], [-0.13, 0.03]]
      .map(([x, y]) => [x + J(r, 0.01), y + J(r, 0.01)]);
    g.save();
    trace(g, m, true);
    g.fillStyle = '#6d1410';
    g.fill();
    g.clip();
    blob(g, r, 0.01, 0.05, 0.09, 0.045, C.pink, null, 0, { paper: false });
    g.restore();
    stroke(g, m, C.darkRed, 0.04, 1, true);
    tuft(g, r, C.red, [[0, -0.5], [-0.04, -0.61], [0.02, -0.58], [0.05, -0.68]]);
  },
  scary(g, r) {
    // angry eyes under heavy brows, and a wide box of zigzag teeth
    for (const s of [-1, 1]) {
      blob(g, r, s * 0.2, -0.3, 0.11, 0.1, null, C.blue, 0.04);
      blob(g, r, s * 0.18, -0.29, 0.048, 0.048, C.red, C.red, 0.02, { paper: false });
      line(g, [[s * 0.36, -0.47], [s * 0.21, -0.43 + J(r, 0.01)], [s * 0.06, -0.37]], C.black, 0.05);
    }
    const cs = box(r, -0.35, -0.17, 0.7, 0.29, 0.02);
    g.save();
    poly(g, cs);
    g.fillStyle = C.paper;
    g.fill();
    g.clip();
    const top = [], bot = [];
    for (let i = 0; i <= 8; i++) {
      const x = -0.35 + i * (0.7 / 8);
      top.push([x, i % 2 ? -0.03 + J(r, 0.012) : -0.17]);
      bot.push([x, i % 2 ? 0.12 : -0.0 + J(r, 0.012)]);
    }
    line(g, top, C.teal, 0.04);
    line(g, bot, C.teal, 0.04);
    g.restore();
    edges(g, r, cs, C.blue, 0.045, 0.03);
    tuft(g, r, C.red, [[-0.06, -0.5], [-0.02, -0.63], [0.03, -0.55], [0.07, -0.66]]);
  },
  regular(g, r) {
    // small dot eyes, a little mouth and a red crown of spikes
    for (const s of [-1, 1]) {
      blob(g, r, s * 0.12, -0.3, 0.07, 0.075, null, C.ink, 0.03);
      dot(g, s * 0.12 + 0.015, -0.29, 0.032, C.ink);
    }
    const m = [[-0.09, -0.12], [0.09, -0.12], [0.07, -0.04], [-0.07, -0.04]].map(([x, y]) => [x + J(r, 0.01), y + J(r, 0.01)]);
    g.save();
    poly(g, m);
    g.fillStyle = C.paper;
    g.fill();
    g.restore();
    line(g, m, C.darkRed, 0.035, true);
    line(g, [[-0.06, -0.12], [-0.03, -0.08], [0, -0.12], [0.03, -0.08], [0.06, -0.12]], C.darkRed, 0.02);
    tuft(g, r, C.red, [[-0.12, -0.5], [-0.1, -0.64], [-0.03, -0.54], [0.03, -0.67], [0.08, -0.54], [0.12, -0.63], [0.12, -0.5]]);
  },
};

function paintBody(g, kind, r) {
  const b = BODY[kind];
  const x = -b.w / 2, y = BODY_TOP;
  const cs = box(r, x, y, b.w, b.h, 0.025);
  g.save();
  poly(g, cs);
  g.fillStyle = C.paper;
  g.fill();
  g.clip();
  const R = Math.hypot(b.w, b.h) / 2 + 0.05;
  scribble(g, r, 0, y + b.h / 2, R, b.fill, { gap: 0.075, width: 0.068, angle: -0.6 + J(r, 0.15), alpha: 0.9 });
  scribble(g, r, 0, y + b.h / 2, R, b.fill, { gap: 0.12, width: 0.05, angle: 0.9 + J(r, 0.2), alpha: 0.5 });
  g.restore();
  edges(g, r, cs, C.blue, 0.062, 0.05);
  FACE[kind](g, r);
}

// Draw one character. pose: { phase (running), still, air, flap (wing), glide, legsOnly (sticking out of a mouth) }
export function drawFigure(ctx, sprites, kind, pose, v) {
  const b = BODY[kind];
  const r = rng(v * 7919 + b.seed);
  const bottom = BODY_TOP + b.h;
  // legs
  for (const s of [-1, 1]) {
    const hx = s * b.w * 0.24;
    let fx, fy;
    if (pose.air) {
      fx = hx + s * 0.07;
      fy = 0.4;
    } else if (pose.still) {
      fx = hx + s * 0.03;
      fy = 0.455;
    } else {
      const ph = pose.phase + (s > 0 ? Math.PI : 0);
      fx = hx + Math.sin(ph) * 0.14;
      fy = 0.455 - Math.max(0, Math.cos(ph)) * 0.1;
    }
    const kx = (hx + fx) / 2 + J(r, 0.012) + (pose.air ? s * 0.06 : 0);
    tube(ctx, [[hx, bottom - 0.03], [kx, (bottom + fy) / 2], [fx, fy]], C.blue, 0.085);
    blob(ctx, r, fx + 0.035, fy + 0.005, 0.085, 0.045, C.blue, C.blue, 0.025, { n: 8 });
  }
  if (pose.legsOnly) return;
  // arms, behind the body
  const wave = (s) => Math.sin(pose.phase * 0.5 + (s > 0 ? 1.6 : 0)) * 0.05;
  if (kind === 'cute') {
    for (const s of [-1, 1]) {
      const sx = s * (b.w / 2 - 0.04), sy = -0.26;
      const w = wave(s), hx = s * 0.66, hy = -0.62 + (pose.air ? -0.1 : 0) + w;
      tube(ctx, [[sx, sy], [s * 0.6, -0.38 + w * 0.5], [hx, hy]], C.lime, 0.085);
      spikyHand(ctx, r, hx, hy, s > 0 ? -0.9 : Math.PI + 0.9, C.lime, 0.12);
    }
  } else if (kind === 'scary') {
    for (const s of [-1, 1]) {
      const w = wave(s), hx = s * 0.71, hy = -0.42 + w;
      tube(ctx, [[s * 0.42, -0.12], [s * 0.63, -0.08 + w * 0.5], [hx, hy]], C.red, 0.085);
      spikyHand(ctx, r, hx, hy, s > 0 ? -1.1 : Math.PI + 1.1, C.red, 0.12);
    }
  } else {
    tube(ctx, [[-b.w / 2 + 0.03, -0.16], [-0.42, -0.08], [-0.47, 0.02 + wave(-1)]], C.blue, 0.075);
    spikyHand(ctx, r, -0.47, 0.02 + wave(-1), Math.PI - 0.8, C.blue, 0.09);
  }
  sprites.draw(ctx, `body:${kind}:${v}`, BODY_BOX, (g) => paintBody(g, kind, rng(v * 131 + b.seed)));
  if (kind === 'regular') drawWing(ctx, r, b, pose);
}

// the regular character's one big arm is a blue cloud of a wing (it glides on it)
function drawWing(ctx, r, b, pose) {
  ctx.save();
  ctx.translate(b.w / 2 - 0.03, -0.22);
  ctx.rotate(pose.flap || 0);
  const k = pose.glide ? 1.4 : 1;
  ctx.scale(k, k);
  const pts = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = i % 2 ? 0.2 : 0.25;
    pts.push([0.2 + Math.cos(a) * rr * 1.05 + J(r, 0.01), Math.sin(a) * rr * 0.72 + J(r, 0.01)]);
  }
  ctx.save();
  trace(ctx, pts, true);
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.clip();
  scribble(ctx, r, 0.2, 0, 0.3, C.blue, { gap: 0.08, width: 0.04, angle: 0.4, alpha: 0.35 });
  ctx.restore();
  stroke(ctx, pts, C.blue, 0.05, 1, true);
  ctx.restore();
}

// ---------- The bad guy ----------
// Local frame: facing LEFT (the way it runs at you), feet at y = +0.5, star centre at y = -0.1.
const PART = {
  star: [-0.47, -0.47, 0.94, 0.94],
  fist: [-0.17, -0.17, 0.34, 0.34],
  shoe: [-0.22, -0.14, 0.44, 0.28],
  wheel: [-0.18, -0.18, 0.36, 0.36],
  heart: [-0.42, -0.4, 0.84, 0.8],
};
function paintStar(g, r) {
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + J(r, 0.18), L = 0.3 + r() * 0.14;
    line(g, [[Math.cos(a) * 0.04, Math.sin(a) * 0.04], [Math.cos(a) * L, Math.sin(a) * L]], C.black, 0.034);
  }
  const pts = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + J(r, 0.05), R = i % 2 ? 0.12 + J(r, 0.015) : 0.27 + J(r, 0.04);
    pts.push([Math.cos(a) * R, Math.sin(a) * R]);
  }
  g.save();
  poly(g, pts);
  g.fillStyle = C.paper;
  g.fill();
  g.clip();
  scribble(g, r, 0, 0, 0.3, C.crimson, { gap: 0.08, width: 0.04, alpha: 0.45 });
  g.restore();
  line(g, pts, C.crimson, 0.045, true);
  const tp = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, R = i % 2 ? 0.05 : 0.13 + J(r, 0.02);
    tp.push([Math.cos(a) * R, Math.sin(a) * R]);
  }
  line(g, tp, C.teal, 0.035, true);
}
const paintFist = (g, r) => blob(g, r, 0, 0, 0.12, 0.115, C.crimson, C.crimson, 0.04);
const paintShoe = (g, r) => blob(g, r, 0, 0, 0.18, 0.095, C.crimson, C.crimson, 0.04);
function paintWheel(g, r) {
  const pts = [];
  for (let a = 0; a < 3 * TAU; a += 0.5) {
    const rad = 0.015 + 0.12 * (a / (3 * TAU));
    pts.push([Math.cos(a) * rad + J(r, 0.005), Math.sin(a) * rad + J(r, 0.005)]);
  }
  stroke(g, pts, C.crimson, 0.035);
  stroke(g, ellipse(r, 0, 0, 0.145, 0.145, 10, 0.01), C.crimson, 0.042, 1, true);
}
function paintHeart(g, r) {
  const pts = [];
  for (let i = 0; i < 22; i++) {
    const t = (i / 22) * TAU;
    pts.push([0.02 * 16 * Math.sin(t) ** 3 + J(r, 0.008), -0.02 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) + J(r, 0.008)]);
  }
  g.save();
  trace(g, pts, true);
  g.fillStyle = C.paper;
  g.fill();
  g.clip();
  scribble(g, r, 0, 0, 0.4, C.red, { gap: 0.07, width: 0.06, angle: -0.7 });
  g.restore();
  stroke(g, pts, C.darkRed, 0.045, 1, true);
}

function drawMouth(ctx, r, m) {
  const rx = 0.24 * m, ry = 0.18 * m, cx = -0.03, cy = -0.1;
  const pts = ellipse(r, cx, cy, rx, ry, 10, 0.01);
  ctx.save();
  trace(ctx, pts, true);
  ctx.fillStyle = '#3b0a1c';
  ctx.fill();
  ctx.clip();
  const n = 5, tw = (2 * rx) / n;
  for (let i = 0; i < n; i++) {
    const x = cx - rx + (i + 0.5) * tw;
    for (const [y0, dir] of [[cy - ry, 1], [cy + ry, -1]]) {
      const tooth = [[x - tw * 0.5, y0], [x + tw * 0.5, y0], [x, y0 + dir * ry * 0.6]];
      poly(ctx, tooth);
      ctx.fillStyle = C.paper;
      ctx.fill();
      line(ctx, tooth, C.teal, 0.018, true);
    }
  }
  ctx.restore();
  stroke(ctx, pts, C.crimson, 0.045, 1, true);
}

// f: { type, id, phase, wheel, mouth, facing, scared, dizzy, ground, vy, lean }
export function drawFoe(ctx, sprites, f, v, time) {
  const r = rng(v * 3571 + f.id * 97 + 11);
  ctx.save();
  if (f.facing > 0) ctx.scale(-1, 1);
  if (f.lean) ctx.rotate(f.lean);
  const ph = f.phase;
  const scared = f.scared > 0;
  const hip = [0, 0.12];
  let shoe, shoeRot, wheel, wheelR = 0.14;
  if (f.type === 'roller') {
    shoe = [0.3, 0.05 + Math.sin(ph) * 0.02]; shoeRot = 0.6; wheel = [0.02, 0.34]; wheelR = 0.16;
  } else if (f.type === 'hopper') {
    shoe = [-0.02, f.ground ? 0.45 : 0.42]; shoeRot = -0.1; wheel = [0.3, 0.14];
  } else {
    shoe = [-0.34 + Math.sin(ph) * 0.15, 0.43 - Math.max(0, Math.cos(ph)) * 0.1];
    shoeRot = -0.25 + Math.sin(ph) * 0.2;
    wheel = [0.13 - Math.sin(ph) * 0.07, 0.36 - Math.max(0, -Math.cos(ph)) * 0.07];
    if (!f.ground) { shoe[1] -= 0.06; wheel[1] -= 0.04; }
  }
  stroke(ctx, wline(r, hip[0] - 0.03, hip[1], shoe[0], shoe[1] - 0.05, 0.02), C.crimson, 0.055);
  stroke(ctx, wline(r, hip[0] + 0.03, hip[1], wheel[0], wheel[1], 0.02), C.crimson, 0.055);
  ctx.save();
  ctx.translate(shoe[0], shoe[1]);
  ctx.rotate(shoeRot);
  sprites.draw(ctx, `shoe:${v}`, PART.shoe, (g) => paintShoe(g, rng(v * 19 + 3)));
  ctx.restore();
  ctx.save();
  ctx.translate(wheel[0], wheel[1]);
  ctx.rotate(f.wheel || 0);
  ctx.scale(wheelR / 0.14, wheelR / 0.14);
  sprites.draw(ctx, `wheel:${v}`, PART.wheel, (g) => paintWheel(g, rng(v * 23 + 5)));
  ctx.restore();
  // zigzag arms and round fists
  const pump = Math.sin(ph) * 0.08;
  const lift = f.type === 'hopper' ? (f.vy > 0 ? -0.16 : 0.04) : 0;
  const fists = scared ? [[-0.42, -0.66], [0.42, -0.66]]
    : [[-0.62, -0.26 + pump + lift], [0.6, -0.3 - pump + lift]];
  wavy(ctx, r, -0.22, -0.08, fists[0][0], fists[0][1], C.crimson, 0.05);
  wavy(ctx, r, 0.22, -0.08, fists[1][0], fists[1][1], C.crimson, 0.05);
  for (const p of fists) {
    ctx.save();
    ctx.translate(p[0], p[1]);
    sprites.draw(ctx, `fist:${v}`, PART.fist, (g) => paintFist(g, rng(v * 29 + 7)));
    ctx.restore();
  }
  // the two green horns
  const bob = Math.sin(ph * 2) * 0.02;
  const horn = [[-0.13, -0.32], [-0.1 + J(r, 0.012), -0.74 + bob], [0, -0.45], [0.1 + J(r, 0.012), -0.74 - bob], [0.13, -0.32]];
  line(ctx, horn, C.limeDark, 0.1);
  line(ctx, horn, C.lime, 0.05);
  // the spiky star body — it swells when the mouth opens
  const m = f.mouth || 0;
  ctx.save();
  ctx.translate(0, -0.1);
  ctx.scale(1 + m * 0.12, 1 + m * 0.12);
  sprites.draw(ctx, `star:${v}`, PART.star, (g) => paintStar(g, rng(v * 31 + 9)));
  ctx.restore();
  if (m > 0.03) drawMouth(ctx, r, m);
  if (scared) {
    for (const [x, y] of [[-0.22, -0.95], [0.02, -1.02], [0.26, -0.95]]) {
      line(ctx, [[x, y], [x + J(r, 0.01), y + 0.14]], C.ink, 0.05);
      dot(ctx, x, y + 0.22, 0.03, C.ink);
    }
  }
  if (f.dizzy > 0) {
    for (let i = 0; i < 3; i++) {
      const a = time * 7 + (i / 3) * TAU;
      asterisk(ctx, Math.cos(a) * 0.32, -0.88 + Math.sin(a) * 0.09, 0.07, C.gold, a);
    }
  }
  ctx.restore();
}

export function asterisk(ctx, x, y, R, color, rot = 0) {
  for (let i = 0; i < 3; i++) {
    const a = rot + (i / 3) * Math.PI;
    line(ctx, [[x - Math.cos(a) * R, y - Math.sin(a) * R], [x + Math.cos(a) * R, y + Math.sin(a) * R]], color, R * 0.45);
  }
}

// ---------- The monster king ----------
// Local frame: origin between his feet on the ground, y down, facing LEFT (at you). He is drawn
// in pencil like the page — graphite outlines, white inside — with the marker colours on top.
// pose: { near: [x, y], far: [x, y] hand centres (local), walk, lean, mouth (0-1), nearOpen,
//         farOpen (0 = fist, 1 = claws spread), hurt (0-1 flash), bob }
const PENCIL = `rgb(${C.graphite})`;
function pencilTube(ctx, pts, w) {
  stroke(ctx, pts, PENCIL, w, 0.9);
  stroke(ctx, pts, C.paper, w * 0.78);
}
function bezier(a, c, b, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return pts;
}
// the arms arch up and over like the drawing's: a big curve from the shoulder to the hand
function kingArm(ctx, r, sh, hand, w) {
  const mx = (sh[0] + hand[0]) / 2;
  const top = Math.max(-6.2, Math.min(sh[1], hand[1]) - 1.6 - Math.abs(hand[0] - sh[0]) * 0.18);   // stays on the page
  const pts = bezier(sh, [mx + (sh[0] - hand[0]) * 0.15, top], hand, 22);
  pencilTube(ctx, pts, w);
  // yellow lightning zigzags across the tube, every other stretch
  for (let i = 2; i < pts.length - 2; i += 3) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const hw = w * 0.36, zz = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4, side = k % 2 ? 1 : -1;
      zz.push([x0 + dx * t * 1.6 + nx * hw * side + J(r, 0.01), y0 + dy * t * 1.6 + ny * hw * side + J(r, 0.01)]);
    }
    line(ctx, zz, C.yellow, w * 0.3, false, 0.95);
  }
  return pts;
}
function kingHand(ctx, r, c, dir, R, open) {
  // a scalloped cloud of a hand, black claws on the bumps, a blue cuff at the wrist
  const bumps = 5, pts = [];
  const k = 0.75 + 0.25 * open;
  for (let i = 0; i < bumps * 2; i++) {
    const a = dir + (i / (bumps * 2)) * TAU;
    const rr = (i % 2 ? R * 0.78 : R) * k;
    pts.push([c[0] + Math.cos(a) * rr + J(r, 0.02), c[1] + Math.sin(a) * rr * 0.85 + J(r, 0.02)]);
  }
  ctx.save();
  trace(ctx, pts, true);
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.restore();
  stroke(ctx, pts, PENCIL, 0.045, 0.9, true);
  for (let i = -2; i <= 2; i++) {
    const a = dir + Math.PI + i * (0.55 + 0.25 * open);
    const bx = c[0] + Math.cos(a) * R * k, by = c[1] + Math.sin(a) * R * k * 0.85;
    const L = R * (0.35 + 0.25 * open);
    line(ctx, [[bx, by], [bx + Math.cos(a) * L + J(r, 0.02), by + Math.sin(a) * L + J(r, 0.02)]], C.black, R * 0.2);
  }
  const cx = c[0] + Math.cos(dir) * R * 0.95, cy = c[1] + Math.sin(dir) * R * 0.95;
  blob(ctx, r, cx, cy, R * 0.38, R * 0.3, C.cyan, null, 0, { rot: dir, paper: false, n: 8 });
}
function kingFoot(ctx, r, ax, ay, s) {
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 2 + s * (-0.9 + i * 0.6) + J(r, 0.06);
    const tx = ax + Math.cos(a) * 0.36, ty = Math.min(0, ay + Math.sin(a) * 0.36);
    stroke(ctx, [[ax, ay], [tx, ty]], PENCIL, 0.05, 0.9);
    line(ctx, [[tx, ty], [tx + Math.cos(a) * 0.12, Math.min(0.02, ty + Math.sin(a) * 0.12)]], C.black, 0.07);
  }
}
export function drawKing(ctx, sprites, k, v, time) {
  const r = rng(v * 4099 + 3);
  ctx.save();
  if (k.lean) ctx.rotate(k.lean);
  const bob = k.bob || 0;
  // far arm and its smaller hand, behind everything
  const farPts = kingArm(ctx, r, [0.3, -3.12 + bob], k.far, 0.3);
  const fe = farPts[farPts.length - 1], fp = farPts[farPts.length - 2];
  kingHand(ctx, r, k.far, Math.atan2(fp[1] - fe[1], fp[0] - fe[0]), 0.42, k.farOpen ?? 1);
  // long pencil legs on clawed feet — one leg hatched with a zigzag, like the drawing
  const ph = k.walk || 0;
  for (const s of [-1, 1]) {
    const lift = Math.max(0, Math.sin(ph + (s > 0 ? Math.PI : 0))) * 0.25;
    const ax = s * 0.85 + Math.sin(ph + (s > 0 ? Math.PI : 0)) * 0.25, ay = -0.18 - lift;
    const hip = [s * 0.32, -1.72 + bob], knee = [s * 0.62 + J(r, 0.01), -0.95 - lift * 0.5];
    const leg = [hip, knee, [ax, ay]];
    pencilTube(ctx, leg, 0.17);
    if (s > 0) {
      const zz = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8, x = lerpPt(leg, t);
        zz.push([x[0] + (i % 2 ? 0.05 : -0.05), x[1]]);
      }
      line(ctx, zz, PENCIL, 0.025, false, 0.8);
    }
    kingFoot(ctx, r, ax, ay, s);
  }
  // body: a thin pencil box with blue patches and a maroon sash
  const bx = box(r, -0.27, -3.3 + bob, 0.54, 1.62, 0.02);
  ctx.save();
  poly(ctx, bx);
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.clip();
  scribble(ctx, r, 0, -3.14 + bob, 0.32, C.cyan, { gap: 0.06, width: 0.05, angle: -0.3, alpha: 0.9 });
  ctx.save();
  ctx.beginPath();
  ctx.rect(-0.3, -2.45 + bob, 0.6, 0.3);
  ctx.clip();
  scribble(ctx, r, 0, -2.3 + bob, 0.35, C.cyan, { gap: 0.06, width: 0.05, angle: 0.4 });
  ctx.restore();
  const sash = [[0.02, -2.75 + bob], [0.36, -2.95 + bob], [0.12, -1.95 + bob]];
  poly(ctx, sash);
  ctx.save();
  ctx.clip();
  scribble(ctx, r, 0.17, -2.5 + bob, 0.5, C.maroon, { gap: 0.06, width: 0.05, angle: 1.1 });
  ctx.restore();
  ctx.restore();
  edges(ctx, r, bx, PENCIL, 0.04, 0.03, 0.9);
  // blue puffy shorts
  const sh = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, rr = i % 2 ? 0.85 : 1;
    sh.push([Math.cos(a) * 0.95 * rr + J(r, 0.02), -1.78 + bob + Math.sin(a) * 0.36 * rr + J(r, 0.02)]);
  }
  ctx.save();
  trace(ctx, sh, true);
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.clip();
  for (let i = 0; i < 9; i++) {
    const cx = -0.8 + i * 0.2 + J(r, 0.03), cy = -1.78 + bob + J(r, 0.18);
    stroke(ctx, ellipse(r, cx, cy, 0.09, 0.07, 7, 0.01), C.cyan, 0.045, 1, true);
  }
  ctx.restore();
  stroke(ctx, sh, C.cyan, 0.05, 1, true);
  // head: pencil circle, orange spiky hair, two black horns, dot eyes, an orange nose, little teeth
  const hy = -3.78 + bob;
  for (const s of [-1, 1]) {
    const horn = bezier([s * 0.3, hy - 0.2], [s * 0.78, hy - 0.35], [s * 0.72, hy - 1.0], 8);
    stroke(ctx, horn, C.black, 0.11);
    stroke(ctx, horn.slice(2, 6), C.paper, 0.025, 0.7);
  }
  const head = ellipse(r, 0, hy, 0.44, 0.42, 12, 0.015);
  ctx.save();
  trace(ctx, head, true);
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.restore();
  stroke(ctx, head, PENCIL, 0.045, 0.9, true);
  const hair = [[-0.38, hy - 0.22]];
  for (let i = 0; i <= 8; i++) hair.push([-0.36 + i * 0.09, hy - (i % 2 ? 0.44 : 0.66) + J(r, 0.03)]);
  hair.push([0.38, hy - 0.22]);
  ctx.save();
  poly(ctx, hair);
  ctx.clip();
  scribble(ctx, r, 0, hy - 0.42, 0.45, C.orange, { gap: 0.05, width: 0.05, angle: 1.3 });
  ctx.restore();
  line(ctx, hair, C.orange, 0.03, true, 0.9);
  dot(ctx, -0.15, hy - 0.06, 0.035, C.ink);
  dot(ctx, 0.12, hy - 0.06, 0.035, C.ink);
  blob(ctx, r, -0.02, hy + 0.06, 0.06, 0.05, C.orange, null, 0, { paper: false, n: 7 });
  const m = k.mouth || 0;
  if (m > 0.05) {
    const mp = ellipse(r, -0.02, hy + 0.24, 0.2, 0.05 + 0.12 * m, 10, 0.01);
    ctx.save();
    trace(ctx, mp, true);
    ctx.fillStyle = '#3b0a1c';
    ctx.fill();
    ctx.restore();
  }
  const teeth = [];
  for (let i = 0; i <= 6; i++) teeth.push([-0.2 + i * 0.066, hy + 0.2 + (i % 2 ? 0.08 : 0) - m * 0.08]);
  line(ctx, teeth, PENCIL, 0.025, false, 0.9);
  for (const cx of [-0.28, 0.24]) dot(ctx, cx, hy + 0.12, 0.018, PENCIL);
  // near arm and the big cloud hand, in front
  const nearPts = kingArm(ctx, r, [-0.3, -3.12 + bob], k.near, 0.34);
  const ne = nearPts[nearPts.length - 1], np = nearPts[nearPts.length - 2];
  kingHand(ctx, r, k.near, Math.atan2(np[1] - ne[1], np[0] - ne[0]), 0.62, k.nearOpen ?? 1);
  if (k.hurt > 0) {
    ctx.globalAlpha = k.hurt * 0.35;
    ctx.fillStyle = C.red;
    trace(ctx, head, true);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
function lerpPt(pts, t) {
  const n = pts.length - 1, f = Math.min(n - 1e-6, t * n), i = Math.floor(f), u = f - i;
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u];
}

// ---------- Towers, hearts, ground ----------
const BLOCK_BOX = [-0.12, -0.12, 1.24, 1.24];
function paintBlock(g, r) {
  edges(g, r, box(r, 0, 0, 1, 1, 0.03), C.tower, 0.085, 0.05, 0.88);
}
// t: { x, w, h, id, sq } — stacked green boxes; the joints come out darker where two boxes' lines overlap
export function drawTower(ctx, sprites, t, v) {
  ctx.save();
  ctx.translate(t.x, 0);
  if (t.sq) {
    ctx.translate(t.w / 2, 0);
    ctx.scale(1 + t.sq * 0.08, 1 - t.sq * 0.12);
    ctx.translate(-t.w / 2, 0);
  }
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0.02, -t.h + 0.02, t.w - 0.04, t.h - 0.02);
  ctx.globalAlpha = 1;
  for (let i = 0; i < t.h; i++) {
    const k = (t.id * 7 + i * 3) % 5;
    ctx.save();
    ctx.translate(0, -(i + 1));
    ctx.scale(t.w, 1);
    sprites.draw(ctx, `block:${k}:${v}`, BLOCK_BOX, (g) => paintBlock(g, rng(k * 101 + v * 17 + 5)));
    ctx.restore();
  }
  ctx.restore();
}
export function drawHeart(ctx, sprites, v) {
  sprites.draw(ctx, `heart:${v}`, PART.heart, (g) => paintHeart(g, rng(v * 41 + 13)));
}
// the ground: one thick pencil line, anchored to the world so its wobble scrolls with it
export function drawGround(ctx, x0, x1, v) {
  const pts = [];
  for (let x = Math.floor(x0) - 1; x <= x1 + 1; x += 1) pts.push([x, (hash(x, v) - 0.5) * 0.05]);
  stroke(ctx, pts, `rgb(${C.graphite})`, 0.07, 0.85);
  const pts2 = pts.map(([x, y], i) => [x + 0.3, y + 0.05 + (hash(i + x, v + 5) - 0.5) * 0.04]);
  stroke(ctx, pts2, `rgb(${C.graphite})`, 0.03, 0.5);
}

// ---------- The pencil-scribble background ----------
// Graphite hatching like drawings/jump-game-3-background.webp: bunches of long strokes that
// go back and forth with a loop at each turn, plus fans of sweeping arcs. The tile wraps
// seamlessly (every stroke is drawn at x - w, x and x + w).
export function scribbleTile(w, h, dpr, seed, { density = 1, flat = false, unit = h / 10 } = {}) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * dpr));
  c.height = Math.max(1, Math.ceil(h * dpr));
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const r = rng(seed);
  const paths = [];
  const n = Math.round(((w * h) / (unit * unit)) * 0.42 * density);
  for (let i = 0; i < n; i++) paths.push(hatch(r, r() * w, r() * h - unit * 0.5, unit, flat));
  if (!flat) {
    const fans = Math.max(1, Math.round((w / (unit * 8)) * density));
    for (let i = 0; i < fans; i++) paths.push(...fan(r, r() * w, r() * h * 0.5, unit));
  }
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const p of paths) {
    const a = 0.22 + r() * 0.45, lw = 0.9 + r() * 1.4;
    for (const dx of [-w, 0, w]) {
      g.save();
      g.translate(dx, 0);
      g.strokeStyle = `rgba(${C.graphite},${a})`;
      g.lineWidth = lw;
      trace(g, p);
      g.stroke();
      g.translate(0.7, 0.5);
      g.strokeStyle = `rgba(${C.graphite},${a * 0.45})`;
      g.lineWidth = lw * 0.5;
      trace(g, p);
      g.stroke();
      g.restore();
    }
  }
  return c;
}
function hatch(r, x, y, unit, flat) {
  const ang = flat ? J(r, 0.06) : r() < 0.75 ? J(r, 0.3) : J(r, 1.0);
  const L = unit * (flat ? 2 + r() * 5 : 1.5 + r() * 4.5);
  const passes = flat ? 2 + Math.floor(r() * 4) : 3 + Math.floor(r() * 6);
  const sp = unit * (0.07 + r() * 0.12);
  const bow = J(r, flat ? 0.04 : 0.18) * L;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const P = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca];
  const pts = [];
  for (let k = 0; k < passes; k++) {
    const fwd = k % 2 === 0;
    const u0 = J(r, L * 0.12), u1 = L * (0.8 + r() * 0.25);
    const v0 = k * sp;
    for (let i = 0; i <= 6; i++) {
      const t = fwd ? i / 6 : 1 - i / 6;
      pts.push(P(u0 + (u1 - u0) * t, v0 + bow * 4 * t * (1 - t) + J(r, sp * 0.15)));
    }
    // the loop at the turn: run past the end, curl up and come back down to the next pass
    const uE = fwd ? u1 : u0, dir = fwd ? 1 : -1;
    pts.push(P(uE + dir * sp * (1 + r()), v0 - sp * 0.5));
    pts.push(P(uE + dir * sp * (0.4 + r() * 0.6), v0 + sp * 1.05));
  }
  return pts;
}
function fan(r, x, y, unit) {
  const out = [];
  const n = 5 + Math.floor(r() * 9);
  const base = 0.2 + r() * 0.9, bend = 0.3 + r() * 0.7;
  for (let i = 0; i < n; i++) {
    const a = base + (i / n) * 0.8 + J(r, 0.05);
    const L = unit * (3 + r() * 4);
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 0.2) {
      const ang = a - bend * t;
      pts.push([x + Math.cos(ang) * L * t + J(r, 1), y + Math.sin(ang) * L * t + J(r, 1)]);
    }
    const last = pts[pts.length - 1];
    pts.push([last[0] - unit * 0.3, last[1] - unit * 0.12]);
    out.push(pts);
  }
  return out;
}
