// The parts of the world that are not creatures: loose letters in the air (rain, snow,
// sparks, hearts), the sea, the grass, the stars and the rainbow. All of it is still
// only letters; each piece knows how to place its own glyphs into the frame's batch.
import { glyphOf } from './glyphs.js';

const glyphsOf = (word) => [...word.replace(/\s+/g, '')].map(glyphOf);

// A pool of free-floating glyphs with a lifetime.
export class Motes {
  constructor(cap) {
    this.cap = cap; this.next = 0;
    for (const k of ['x', 'y', 'vx', 'vy', 'size', 'rot', 'vr', 'a', 't', 'life', 'grav', 'drag', 'grow']) this[k] = new Float32Array(cap);
    this.g = new Uint16Array(cap); this.c = new Uint8Array(cap * 3);
    this.life.fill(0); this.t.fill(1);
  }
  spawn(x, y, glyph, color, { vx = 0, vy = 0, size = 16, rot = 0, vr = 0, life = 1.2, grav = 0, drag = 0, a = 1, grow = 0 } = {}) {
    const i = this.next; this.next = (i + 1) % this.cap;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy; this.size[i] = size; this.rot[i] = rot; this.vr[i] = vr;
    this.a[i] = a; this.t[i] = 0; this.life[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
    this.g[i] = glyph; this.c[i * 3] = color[0]; this.c[i * 3 + 1] = color[1]; this.c[i * 3 + 2] = color[2];
  }
  update(dt, wind = 0) {
    for (let i = 0; i < this.cap; i++) {
      if (this.t[i] >= this.life[i]) continue;
      this.t[i] += dt;
      this.vy[i] += this.grav[i] * dt;
      this.vx[i] += wind * 60 * dt;
      if (this.drag[i]) { const k = Math.exp(-this.drag[i] * dt); this.vx[i] *= k; this.vy[i] *= k; }
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.rot[i] += this.vr[i] * dt;
      this.size[i] += this.grow[i] * dt;
    }
  }
  draw(batch) {
    for (let i = 0; i < this.cap; i++) {
      const life = this.life[i], t = this.t[i];
      if (t >= life) continue;
      const fade = Math.min(1, t * 8) * Math.min(1, (life - t) * 2.5);
      batch.push(this.x[i], this.y[i], this.size[i], this.rot[i], this.g[i], this.c[i * 3], this.c[i * 3 + 1], this.c[i * 3 + 2], this.a[i] * fade);
    }
  }
  clear() { this.t.set(this.life); }
  get alive() { let n = 0; for (let i = 0; i < this.cap; i++) if (this.t[i] < this.life[i]) n++; return n; }
}

// Rain and snow: letters that fall for as long as the weather lasts.
export class Fall {
  constructor(cap, kind) {
    this.cap = cap; this.kind = kind; this.level = 0; this.target = 0; this.word = glyphsOf(kind === 'snow' ? 'שלג' : 'גשם');
    this.x = new Float32Array(cap); this.y = new Float32Array(cap); this.s = new Float32Array(cap); this.p = new Float32Array(cap);
    this.live = new Uint8Array(cap);
  }
  setWord(word) { this.word = glyphsOf(word); }
  update(dt, w, ground, wind, rnd, onLand) {
    this.level += (this.target - this.level) * Math.min(1, dt * 1.2);
    const want = Math.floor(this.cap * Math.min(1, this.level));
    const snow = this.kind === 'snow';
    for (let i = 0; i < this.cap; i++) {
      if (!this.live[i]) {
        if (i < want && rnd() < dt * 3) { this.live[i] = 1; this.x[i] = (rnd() * 1.3 - 0.15) * w; this.y[i] = -20 - rnd() * 60; this.s[i] = 0.7 + rnd() * 0.6; this.p[i] = rnd() * 6.28; }
        continue;
      }
      const speed = (snow ? 62 : 520) * this.s[i];
      this.y[i] += speed * dt; this.p[i] += dt * 2;
      this.x[i] += (wind * (snow ? 90 : 190) + (snow ? Math.sin(this.p[i]) * 22 : 0)) * dt;
      if (this.y[i] > ground) { this.live[i] = 0; onLand && onLand(this.x[i], i); }
    }
  }
  draw(batch, wind) {
    const snow = this.kind === 'snow', L = this.word.length;
    for (let i = 0; i < this.cap; i++) {
      if (!this.live[i]) continue;
      if (snow) batch.push(this.x[i], this.y[i], 13 * this.s[i] + 3, Math.sin(this.p[i]) * 0.5, this.word[i % L], 150, 172, 226, 0.95);
      else batch.push(this.x[i], this.y[i], 15 * this.s[i], -wind * 0.4, this.word[i % L], 62, 116, 222, 0.85);
    }
  }
  clear() { this.live.fill(0); this.level = 0; this.target = 0; }
  get falling() { let n = 0; for (let i = 0; i < this.cap; i++) n += this.live[i]; return n; }
}

// A band of water: rows of the word, rolling.
export class Sea {
  constructor() { this.level = 0; this.target = 0; this.word = glyphsOf('ים'); this.swell = 0; }
  setWord(word) { this.word = glyphsOf(word); }
  height(unit) { return unit * 0.78; }
  top(ground, unit) { return ground - this.height(unit) * this.level; }
  update(dt) {
    this.level += (this.target - this.level) * Math.min(1, dt * 0.9);
    if (this.target === 0 && this.level < 0.01) this.level = 0;
    this.swell = Math.max(0, this.swell - dt * 0.12);
  }
  surface(x, t) { return Math.sin(x * 0.021 + t * 1.5) * (3 + this.swell * 7) + Math.sin(x * 0.008 - t * 0.9) * (2.5 + this.swell * 6); }
  draw(batch, w, ground, unit, t) {
    if (this.level <= 0) return;
    const top = this.top(ground, unit), L = this.word.length;
    const rows = 5, gap = 17, rowH = (ground - top + 4) / rows;
    let k = 0;
    for (let r = 0; r < rows; r++) {
      const depth = r / (rows - 1);
      const cr = 96 - depth * 50, cg = 176 - depth * 70, cb = 232 - depth * 28;
      const size = 17 + depth * 3;
      for (let x = w + 10 - (r % 2) * gap * 0.5; x > -gap; x -= gap) {
        const wave = this.surface(x + r * 37, t + r * 0.4) * (1 - depth * 0.55);
        const y = top + r * rowH + 6 + wave;
        if (y > ground + 3) continue;
        batch.push(x + Math.sin(t * 0.7 + r) * 5, y, size, Math.cos(x * 0.021 + t * 1.5 + r) * 0.25, this.word[k++ % L], cr, cg, cb, r === 0 ? 0.95 : 0.8);
      }
    }
  }
}

// Blades along the ground line.
export class Grass {
  constructor() { this.on = 0; this.target = 0; this.tall = 1; this.word = glyphsOf('דשא'); this.color = [58, 150, 52]; }
  setWord(word, color) { this.word = glyphsOf(word); this.color = color; }
  update(dt) { this.on += (this.target - this.on) * Math.min(1, dt * 1.1); }
  draw(batch, w, ground, t, wind) {
    if (this.on < 0.01) return;
    const L = this.word.length, c = this.color;
    let k = 0;
    for (let row = 0; row < 2; row++) {
      const gap = row ? 19 : 13;
      for (let x = w - 6 - row * 7; x > 0; x -= gap) {
        const h = Math.sin(x * 12.9898 + row * 78.233) * 43758.5453, rr = h - Math.floor(h);
        // the grass rolls in from the right, the way the word was written
        const reveal = Math.max(0, Math.min(1, this.on * 1.6 - (1 - x / w) * 0.6));
        if (reveal <= 0) continue;
        const size = (13 + rr * 8 + row * 3) * this.tall * reveal;
        const sway = Math.sin(t * 1.6 + x * 0.03) * 0.12 + wind * 0.5;
        const shade = 0.82 + rr * 0.36;
        batch.push(x + sway * size * 0.4, ground - size * 0.3 + row * 3, size, sway + (rr - 0.5) * 0.5, this.word[k++ % L], c[0] * shade, c[1] * shade, c[2] * shade, 0.95);
      }
    }
  }
}

// A sky of small letters that only really shows at night.
export class Stars {
  constructor() { this.list = []; this.on = 0; this.target = 0; this.word = glyphsOf('כוכב'); }
  place(w, top, bottom, rnd, count) {
    this.list = [];
    for (let i = 0; i < count; i++) this.list.push({ x: rnd() * w, y: top + rnd() * rnd() * (bottom - top), s: 9 + rnd() * 12, p: rnd() * 6.28, f: 0.6 + rnd() * 1.6, g: rnd() < 0.2 ? glyphOf('✦') : this.word[i % this.word.length] });
  }
  update(dt) { this.on += (this.target - this.on) * Math.min(1, dt * 0.8); }
  draw(batch, t, night) {
    const vis = this.on * (0.16 + 0.84 * night);
    if (vis < 0.01) return;
    for (const s of this.list) {
      const tw = 0.55 + 0.45 * Math.sin(t * s.f + s.p);
      batch.push(s.x, s.y, s.s * (0.85 + 0.15 * tw), Math.sin(s.p) * 0.4, s.g, 226, 190, 70, vis * (0.35 + 0.65 * tw));
    }
  }
}

const BANDS = [
  ['אדום', [222, 58, 48]], ['כתום', [240, 138, 36]], ['צהוב', [238, 196, 36]],
  ['ירוק', [64, 168, 78]], ['כחול', [58, 118, 222]], ['סגול', [132, 80, 204]],
];
// Six arcs, each written in the name of its own colour.
export class Rainbow {
  constructor() { this.on = 0; this.target = 0; this.items = []; this.timer = 0; }
  place(w, ground, top) {
    const cx = w / 2, cy = ground + 6;
    const R = Math.min(w * 0.46, (ground - top) * 0.94);
    this.items = [];
    BANDS.forEach(([word, color], b) => {
      const r = R - b * 15, letters = glyphsOf(word);
      const count = Math.floor((Math.PI * r) / 13.5);
      for (let i = 0; i < count; i++) {
        const a = (i + 0.5) / count * Math.PI;         // 0 at the right foot, π at the left: written right to left
        this.items.push({ x: cx + Math.cos(a) * r, y: cy - Math.sin(a) * r, rot: Math.PI / 2 - a, g: letters[i % letters.length], c: color, at: a / Math.PI });
      }
    });
  }
  show(seconds = 40) { this.target = 1; this.timer = seconds; }
  update(dt) {
    if (this.timer > 0) { this.timer -= dt; if (this.timer <= 0) this.target = 0; }
    this.on += (this.target - this.on) * Math.min(1, dt * (this.target ? 0.5 : 0.8));
  }
  draw(batch, night) {
    if (this.on < 0.01) return;
    const sweep = this.on * 1.25, dim = 1 - night * 0.6;
    for (const it of this.items) {
      const a = Math.max(0, Math.min(1, (sweep - it.at) * 5));
      if (a > 0) batch.push(it.x, it.y, 15, it.rot, it.g, it.c[0], it.c[1], it.c[2], a * 0.9 * dim);
    }
  }
}
