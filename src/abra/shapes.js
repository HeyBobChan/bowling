// Turn a small picture (a silhouette with colours) into a calligram: the word written
// along the outline, like a marker tracing the shape, and the same word filling the
// inside row after row. The result is a "layout": where each letter of a thing rests.
import { glyphOf } from './glyphs.js';

const INK = [35, 35, 59];

// ---- outline: marching squares over the alpha channel, chained into smooth loops ----
function traceLoops(alpha, w, h, level) {
  // pad by one transparent pixel so every contour closes
  const W = w + 2, H = h + 2;
  const a = new Float32Array(W * H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[(y + 1) * W + x + 1] = alpha[y * w + x];
  const inside = (x, y) => a[y * W + x] >= level;
  // An edge crossing is identified by the grid edge it sits on.
  const hKey = (x, y) => (y * W + x) * 2;       // between (x,y) and (x+1,y)
  const vKey = (x, y) => (y * W + x) * 2 + 1;   // between (x,y) and (x,y+1)
  const lerp = (v0, v1) => (v0 === v1 ? 0.5 : Math.min(1, Math.max(0, (level - v0) / (v1 - v0))));
  const point = (key) => {
    const cell = key >> 1, x = cell % W, y = (cell / W) | 0;
    // samples sit at pixel centres; the -0.5 undoes the one-pixel padding and recentres
    if (key & 1) return [x - 0.5, y + lerp(a[y * W + x], a[(y + 1) * W + x]) - 0.5];
    return [x + lerp(a[y * W + x], a[y * W + x + 1]) - 0.5, y - 0.5];
  };
  const next = new Map();   // edge key -> the up to two edge keys it connects to
  const link = (k1, k2) => {
    (next.get(k1) || next.set(k1, []).get(k1)).push(k2);
    (next.get(k2) || next.set(k2, []).get(k2)).push(k1);
  };
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = inside(x, y), tr = inside(x + 1, y), br = inside(x + 1, y + 1), bl = inside(x, y + 1);
      const code = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const T = hKey(x, y), B = hKey(x, y + 1), L = vKey(x, y), R = vKey(x + 1, y);
      switch (code) {
        case 1: case 14: link(L, B); break;
        case 2: case 13: link(B, R); break;
        case 3: case 12: link(L, R); break;
        case 4: case 11: link(T, R); break;
        case 6: case 9: link(T, B); break;
        case 7: case 8: link(L, T); break;
        case 5: link(L, T); link(B, R); break;
        case 10: link(T, R); link(L, B); break;
        default: break;
      }
    }
  }
  const seen = new Set(), loops = [];
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const pts = [];
    let prev = -1, cur = start;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur); pts.push(point(cur));
      const nb = next.get(cur);
      const go = nb[0] !== prev ? nb[0] : nb[1];
      prev = cur; cur = go;
    }
    if (pts.length >= 8) loops.push(pts);
  }
  return loops;
}

function smooth(loop, passes) {
  let pts = loop;
  for (let p = 0; p < passes; p++) {
    const n = pts.length, out = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n];
      out[i] = [(a[0] + b[0] * 2 + c[0]) / 4, (a[1] + b[1] * 2 + c[1]) / 4];
    }
    pts = out;
  }
  return pts;
}

const signedArea = (pts) => {
  let s = 0;
  for (let i = 0, n = pts.length; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
};
const perimeter = (pts) => {
  let s = 0;
  for (let i = 0, n = pts.length; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; s += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  return s;
};

// Walk a closed loop and drop a point every `step`, with the direction of travel.
function resample(pts, step) {
  const total = perimeter(pts);
  const count = Math.max(3, Math.round(total / step));
  const gap = total / count;
  const out = [];
  let want = gap * 0.5, walked = 0;
  for (let i = 0, n = pts.length; i < n && out.length < count; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (len > 0 && want <= walked + len && out.length < count) {
      const t = (want - walked) / len;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])]);
      want += gap;
    }
    walked += len;
  }
  return out;
}

const lum = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

// Keep an ink visible on cream paper: near-whites become a cool pencil grey.
function paperSafe(r, g, b) {
  const l = lum(r, g, b);
  if (l > 0.86) {
    const k = Math.min(1, (l - 0.86) / 0.14);
    return [r + (176 - r) * k * 0.9, g + (188 - g) * k * 0.9, b + (214 - b) * k * 0.9];
  }
  return [r, g, b];
}

/**
 * image: { data (RGBA bytes), width, height }
 * word:  the letters to write with (spaces are dropped)
 * opt.rows     how many rows of letters fill the height
 * opt.outline  write the word around the edge too (default true)
 * opt.tint     [r,g,b] to repaint the whole thing in one marker colour
 * opt.rainbow  paint row by row in rainbow inks
 */
export function buildLayout(image, word, opt = {}) {
  const { data, width: w, height: h } = image;
  const letters = [...word.replace(/\s+/g, '')].map(glyphOf);
  const rows = Math.max(4, opt.rows || 14);
  const alpha = new Float32Array(w * h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = data[(y * w + x) * 4 + 3];
    alpha[y * w + x] = a;
    if (a > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const unit = 1 / bh;                          // one mask pixel in layout units (height = 1)
  const cx = (x0 + x1 + 1) / 2, bottom = y1 + 1;
  const ch = bh / rows, cw = ch * 0.8;          // a letter's row height and column width, px
  const out = { lx: [], ly: [], sz: [], rot: [], col: [], gl: [], edge: [] };
  const spans = [];     // runs of letters that are read together: one per outline loop, one per row
  const sample = (x, y) => {
    const xi = Math.min(w - 1, Math.max(0, x | 0)), yi = Math.min(h - 1, Math.max(0, y | 0));
    return (yi * w + xi) * 4;
  };
  const RAINBOW = [[226, 60, 50], [240, 140, 40], [240, 196, 40], [70, 170, 80], [60, 120, 220], [130, 80, 200]];
  const paint = (r, g, b, row) => {
    if (opt.rainbow) { const c = RAINBOW[((row % 6) + 6) % 6], l = 0.75 + 0.5 * lum(r, g, b); return [c[0] * l, c[1] * l, c[2] * l].map((v) => Math.min(255, v)); }
    if (opt.tint) { const l = 0.5 + 0.75 * lum(r, g, b); return opt.tint.map((v) => Math.min(255, v * l)); }
    return paperSafe(r, g, b);
  };

  // ---- the outline, written first so it reads on top ----
  const edgePts = [];
  if (opt.outline !== false) {
    let loops = traceLoops(alpha, w, h, 110).map((l) => smooth(l, 3));
    const longest = Math.max(0, ...loops.map(perimeter));
    loops = loops.filter((l) => perimeter(l) > Math.max(ch * 4, longest * 0.16));
    let k = 0;
    for (let loop of loops) {
      if (signedArea(loop) > 0) loop = loop.slice().reverse();   // travel leftwards along the top, as Hebrew is written
      const spanStart = out.lx.length;
      for (const [x, y, dir] of resample(loop, cw * 1.12)) {
        // (nx, ny) points into the shape; nudge inward so the letters sit on the edge, not outside it
        const nx = Math.sin(dir), ny = -Math.cos(dir);
        const ix = x + nx * ch * 0.18, iy = y + ny * ch * 0.18;
        const si = sample(x + nx * ch * 0.6, y + ny * ch * 0.6);
        const base = data[si + 3] > 40 ? paint(data[si], data[si + 1], data[si + 2], Math.floor((y - y0) / ch)) : [90, 90, 110];
        let rot = dir - Math.PI;                       // upright when moving left
        while (rot > Math.PI / 2) rot -= Math.PI;
        while (rot < -Math.PI / 2) rot += Math.PI;
        out.lx.push((ix - cx) * unit); out.ly.push((iy - bottom) * unit);
        out.sz.push(ch * unit * 1.28); out.rot.push(rot * 0.85);
        out.col.push(base[0] * 0.3 + INK[0] * 0.7, base[1] * 0.3 + INK[1] * 0.7, base[2] * 0.3 + INK[2] * 0.7);
        out.gl.push(letters[k++ % letters.length]); out.edge.push(1);
        edgePts.push(ix, iy);
      }
      spans.push([spanStart, out.lx.length]);
    }
  }

  // ---- the filling: row after row, right to left ----
  let k = 0, seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const keepOut = (ch * 0.62) ** 2;
  for (let r = 0; r < rows; r++) {
    const y = y0 + (r + 0.5) * ch;
    const shift = r % 2 ? cw * 0.5 : 0;
    const spanStart = out.lx.length;
    for (let x = x1 + 1 - cw * 0.5 - shift; x > x0 - cw; x -= cw) {
      const jx = x + (rnd() - 0.5) * cw * 0.22, jy = y + (rnd() - 0.5) * ch * 0.2;
      let cover = 0, cr = 0, cg = 0, cb = 0;
      for (const [ox, oy] of [[0, 0], [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
        const si = sample(jx + ox * cw, jy + oy * ch);
        if (data[si + 3] > 110) { cover++; cr += data[si]; cg += data[si + 1]; cb += data[si + 2]; }
      }
      if (cover < 3) continue;
      let crowded = false;
      for (let e = 0; e < edgePts.length; e += 2) {
        const dx = edgePts[e] - jx, dy = edgePts[e + 1] - jy;
        if (dx * dx + dy * dy < keepOut) { crowded = true; break; }
      }
      if (crowded) continue;
      const c = paint(cr / cover, cg / cover, cb / cover, r);
      out.lx.push((jx - cx) * unit); out.ly.push((jy - bottom) * unit);
      out.sz.push(ch * unit * (1.1 + rnd() * 0.16)); out.rot.push((rnd() - 0.5) * 0.3);
      out.col.push(c[0], c[1], c[2]);
      out.gl.push(letters[k++ % letters.length]); out.edge.push(0);
    }
    spans.push([spanStart, out.lx.length]);
  }
  const n = out.lx.length;
  // When the shape is mirrored (a creature turning to walk the other way) each run of
  // letters must be dealt out in the opposite order, or the word would read backwards.
  const glFlip = Uint16Array.from(out.gl);
  for (const [a, b] of spans) for (let i = a; i < b; i++) glFlip[i] = out.gl[a + b - 1 - i];
  return {
    n, width: bw * unit, glFlip,
    lx: Float32Array.from(out.lx), ly: Float32Array.from(out.ly),
    sz: Float32Array.from(out.sz), rot: Float32Array.from(out.rot),
    col: Uint8ClampedArray.from(out.col), gl: Uint16Array.from(out.gl), edge: Uint8Array.from(out.edge),
  };
}

// A layout made by hand: points with explicit letters. Used for word-creatures, rain, rainbows.
export function manualLayout(items, width = 1) {
  const n = items.length;
  const L = { n, width, glFlip: null, lx: new Float32Array(n), ly: new Float32Array(n), sz: new Float32Array(n), rot: new Float32Array(n),
    col: new Uint8ClampedArray(n * 3), gl: new Uint16Array(n), edge: new Uint8Array(n) };
  items.forEach((it, i) => {
    L.lx[i] = it.x; L.ly[i] = it.y; L.sz[i] = it.size; L.rot[i] = it.rot || 0;
    L.col[i * 3] = it.color[0]; L.col[i * 3 + 1] = it.color[1]; L.col[i * 3 + 2] = it.color[2];
    L.gl[i] = glyphOf(it.ch); L.edge[i] = it.edge || 0;
  });
  L.glFlip = L.gl;
  return L;
}

// Draw a picture with canvas calls and hand back its pixels, for shapes made in code.
export function paintMask(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  draw(ctx, w, h);
  return ctx.getImageData(0, 0, w, h);
}
