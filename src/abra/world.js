// The living page. Every thing here is an Ent: a set of letters (a layout from shapes.js)
// held together by springs, plus a small brain that decides where the whole set goes.
// Nothing in this file touches the DOM or the clock; main steps it and asks it to draw.
import { buildLayout, manualLayout } from './shapes.js';
import { glyphOf, advance } from './glyphs.js';
import { Motes, Fall, Sea, Grass, Stars, Rainbow } from './scenery.js';
import * as paint from './paint.js';
import { byWord } from './lexicon.js';

const INK = [35, 35, 59];
const WALK = 1, FLY = 2, SWIM = 3, SWAY = 4, STILL = 5, SUN = 6, FLAME = 7, NAME = 8, CLOUD = 9;
const KINDS = {
  walk: { layer: 7, where: 'ground', anim: WALK },
  person: { layer: 7, where: 'ground', anim: WALK },
  fly: { layer: 9, where: 'sky', anim: FLY },
  swim: { layer: 6.5, where: 'water', anim: SWIM },
  float: { layer: 6.6, where: 'surface', anim: STILL },
  drive: { layer: 7, where: 'ground', anim: STILL },
  plant: { layer: 5.6, where: 'ground', anim: SWAY },
  food: { layer: 7, where: 'ground', anim: STILL },
  thing: { layer: 7, where: 'ground', anim: STILL },
  building: { layer: 5, where: 'ground', anim: STILL },
  sky: { layer: 3, where: 'high', anim: CLOUD },
};
const bare = (s) => s.replace(/️/g, '');
// Fliers that hang in the air rather than beat wings.
const NO_FLAP = new Set(['✈', '🚁', '🎈', '🪁', '🛸', '👻', '🪂', '🚀', '🛩', '🫧', '🧚', '🧞', '🦸', '🦹', '🧙', '🛰', '☄', '🪶', '🍃', '🍂']);
// Twemoji art that faces right; everything else faces left.
const FACES_RIGHT = new Set(['🛒', '✈', '🚀', '🦥', '🐧', '🦚', '🏄']);
// A game of tag: who runs after whom.
const TAG = { 'כלב': ['חתול'], 'חתול': ['עכבר'], 'שוטר': ['גנב'], 'כריש': ['דג'], 'שועל': ['תרנגולת'], 'זאב': ['כבשה'] };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

let nextId = 1;
class Ent {
  constructor(L) {
    this.id = nextId++; this.L = L; const n = L.n;
    this.px = new Float32Array(n); this.py = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n);
    this.pa = new Float32Array(n); this.delay = new Float32Array(n);
    this.x = 0; this.y = 0; this.size = 100; this.grow = 1; this.growTo = 1; this.scale = 1;
    this.sq = 0; this.face = 1; this.dir = -1; this.art = -1; this.rot = 0; this.pivot = 0;
    this.jy = 0; this.vjy = 0; this.phase = 0; this.moving = 0; this.age = 0; this.alpha = 1;
    this.state = 'idle'; this.timer = 0; this.think = 1; this.cool = 0; this.seed = Math.random() * 100; this.settled = 0;
    this.flags = {}; this.dying = 0; this.fate = ''; this.k = 150;
  }
}

export class World {
  constructor({ sprites, rnd = Math.random, mobile = false, calm = false }) {
    this.sprites = sprites; this.rnd = rnd; this.mobile = mobile; this.calm = calm;
    this.ents = []; this.says = [];
    this.motes = new Motes(mobile ? 420 : 760);
    this.rain = new Fall(mobile ? 150 : 260, 'rain');
    this.snow = new Fall(mobile ? 120 : 200, 'snow');
    this.sea = new Sea(); this.grass = new Grass(); this.stars = new Stars(); this.rainbow = new Rainbow();
    this.W = 800; this.H = 600; this.top = 60; this.ground = 420; this.unit = 100;
    this.t = 0; this.night = 0; this.nightTo = 0; this.dusk = 0; this.duskTo = 0; this.sky = 0; this.skyTo = 0;
    this.wind = 0; this.windTo = 0; this.windT = 0; this.rainT = 0; this.snowT = 0; this.snowCover = 0;
    this.flash = 0; this.shake = 0; this.spell = 0; this.warm = 0; this.freeze = 0;
    this.stormT = 0; this.boltT = 0; this.runT = 0; this.floatT = 0; this.danceT = 0;
    this.maxEnts = mobile ? 10 : 20; this.maxGlyphs = mobile ? 8000 : 16000;
    this.layouts = new Map(); this.lastAct = null; this.held = null; this.wasRaining = false; this.undos = [];
    this.listeners = [];
    this.env = { time: 0, night: 0, dusk: 0, sky: 0, rule: 40, ruleFrom: 500, ruleAll: 0, margin: 700, sunX: 0, sunY: 0, sunGlow: 0, moonX: 0, moonY: 0, moonGlow: 0, flash: 0, warm: 0, shakeX: 0, shakeY: 0, zoom: 1, boil: calm ? 0 : 1, spell: 0 };
  }
  on(fn) { this.listeners.push(fn); }
  emit(name, data) { for (const fn of this.listeners) fn(name, data); }

  // ---------- geometry ----------
  resize({ W, H, top, ground, unit }) {
    const oldW = this.W, oldG = this.ground;
    Object.assign(this, { W, H, top, ground, unit });
    const oldT = this.oldTop ?? top, span = Math.max(1, oldG - oldT);
    const seat = (y) => top + ((y - oldT) / span) * (ground - top);
    for (const e of this.ents) {
      e.x *= W / oldW;
      e.size = e.sizeU * unit;
      if (e.where === 'ground') e.y = ground + (e.depth || 0);
      else if (e.kind === 'sun') { e.homeX = W * 0.8; e.homeY = top + e.size * 1.08; }
      else if (e.kind === 'moon') { e.homeX = W * 0.22; e.homeY = top + e.size * 1.2; }
      else { e.y = seat(e.y); if (e.homeX != null) { e.homeX *= W / oldW; e.homeY = seat(e.homeY); } if (e.tx != null) { e.tx *= W / oldW; e.ty = seat(e.ty); } }
    }
    this.oldTop = top;
    this.stars.place(W, top - 30, ground - unit * 1.2, this.rnd, this.mobile ? 34 : 60);
    this.rainbow.place(W, ground, top);
  }
  sizeFor(s, scale = 1) {
    const room = this.ground - this.top;
    return clamp(this.unit * Math.pow(s, 0.8) * scale, this.unit * 0.26, Math.min(room * 0.8, this.unit * 3));
  }
  rowsFor(px) { return clamp(Math.round(11.5 * Math.pow(px / this.unit, 0.62) * (this.mobile ? 0.92 : 1.08)), 6, 30); }
  groundSpot(width) {
    const lo = width / 2 + 10, hi = this.W - width / 2 - 10;
    if (hi <= lo) return this.W / 2;
    let best = lo, score = -1e9;
    for (let i = 0; i < 14; i++) {
      const x = lerp(lo, hi, this.rnd());
      let near = this.W * 0.3;
      for (const e of this.ents) if (e.where === 'ground' && !e.dying) near = Math.min(near, Math.abs(e.x - x));
      near -= Math.abs(x - this.W / 2) * 0.12;      // a slight pull to the middle of the page
      if (near > score) { score = near; best = x; }
    }
    return best;
  }
  skySpot(size) {
    const lo = this.top + size + 6, hi = Math.max(lo + 20, this.ground - this.unit * 1.35);
    return { x: lerp(size * 0.6, this.W - size * 0.6, this.rnd()), y: lerp(lo, hi, this.rnd()) };
  }
  get seaTop() { return this.sea.top(this.ground, this.unit); }
  get hasSea() { return this.sea.target > 0; }

  // ---------- making things ----------
  layout(key, make) {
    let L = this.layouts.get(key);
    if (!L) { L = make(); this.layouts.set(key, L); if (this.layouts.size > 260) this.layouts.delete(this.layouts.keys().next().value); }
    return L;
  }
  add(L, o) {
    const e = new Ent(L);
    Object.assign(e, o);
    e.scale = e.scale || 1; e.flags = e.flags || {};
    e.size = o.size ?? this.sizeFor(e.baseS ?? 1, e.scale);
    e.sizeU = e.size / this.unit;
    e.homeX = o.homeX ?? null; e.homeY = o.homeY ?? null;
    this.place(e, o.from, o.wait || 0);
    this.ents.push(e);
    this.trim();
    return e;
  }
  // Where each letter starts: lifted out of the word that was just written.
  place(e, from, wait) {
    const L = e.L, n = L.n, r = this.rnd;
    let tall = 0.001;
    for (let i = 0; i < n; i++) tall = Math.max(tall, -L.ly[i]);
    for (let i = 0; i < n; i++) {
      if (from && from.length) {
        let src = null;
        const same = from.byGlyph && from.byGlyph.get(L.gl[i]);
        src = same ? same[(r() * same.length) | 0] : from[(r() * from.length) | 0];
        e.px[i] = src.x + (r() - 0.5) * 8; e.py[i] = src.y + (r() - 0.5) * 8;
        e.vx[i] = (r() - 0.5) * 260; e.vy[i] = -140 - r() * 300;
        e.delay[i] = wait + (-L.ly[i] / tall) * 0.75 + r() * 0.2;
        e.pa[i] = 0; e.settled = wait + 2;
      } else {
        e.px[i] = e.x + L.lx[i] * e.size + (r() - 0.5) * 30; e.py[i] = e.y + L.ly[i] * e.size + (r() - 0.5) * 30;
        e.delay[i] = wait; e.pa[i] = wait > 0 ? 0 : 1;
      }
    }
  }
  // Too many letters on one page: the oldest wanderers say goodbye.
  trim() {
    const live = this.ents.filter((e) => !e.dying && !e.keep).sort((a, b) => a.id - b.id);
    let glyphs = 0;
    for (const e of this.ents) if (!e.dying) glyphs += e.L.n;
    let i = 0;
    while ((live.length - i > this.maxEnts || glyphs > this.maxGlyphs) && i < live.length - 1) {
      const e = live[i++];
      glyphs -= e.L.n;
      this.say(e, 'ביי!');
      this.remove(e, 'poof');
    }
  }
  remove(e, fate = 'poof') {
    if (e.dying) return;
    e.dying = 0.0001; e.fate = fate;
    if (this.held === e) this.held = null;
    const r = this.rnd;
    if (fate === 'poof') for (let i = 0; i < e.L.n; i++) { e.vx[i] += (r() - 0.5) * 260; e.vy[i] += (r() - 0.7) * 260; }
  }

  spawnNoun(act, from) {
    const entry = act.entry, K = KINDS[entry.k] || KINDS.thing;
    let image = this.sprites.get(entry.e);
    if (!image) return this.spawnName({ text: entry.w }, from);
    const copies = clamp(act.count || 1, 1, this.mobile ? 8 : 14);
    const scale = (act.scale || 1) * (copies > 4 ? 0.7 : copies > 1 ? 0.85 : 1);
    const made = [];
    for (let c = 0; c < copies; c++) {
      const seed = paint.hashWord(entry.w) + c * 7919;
      let fit = scale;
      if (entry.k === 'swim') fit = Math.min(scale, (this.sea.height(this.unit) * 1.25) / (this.unit * Math.pow(entry.s, 0.8)));
      const px = this.sizeFor(entry.s, fit);
      const rows = this.rowsFor(px);
      const tintKey = act.rainbow ? 'rb' : act.tint ? act.tint.join(',') : '';
      const person = entry.k === 'person';
      const key = `${entry.e}|${entry.w}|${rows}|${tintKey}|${person ? seed : ''}`;
      const img = person ? paint.personMask(image, seed) : image;
      const L = this.layout(key, () => buildLayout(img, entry.w, { rows: person ? Math.round(rows * 1.25) : rows, tint: act.tint, rainbow: act.rainbow }));
      const e = this.add(L, {
        word: entry.w, entry, kind: entry.k, layer: K.layer, where: K.where, anim: K.anim,
        flags: entry, baseS: entry.s * (person ? 1.25 : 1), scale: fit * (0.94 + this.rnd() * 0.12),
        image: img, rows: person ? Math.round(rows * 1.25) : rows, tint: act.tint, rainbow: act.rainbow,
        art: FACES_RIGHT.has(bare(entry.e)) ? 1 : -1, from, wait: c * 0.12,
        flap: entry.k === 'fly' && !entry.lift && !NO_FLAP.has(bare(entry.e)),
      });
      this.settle(e, c, copies);
      made.push(e);
    }
    this.lastAct = { ...act, kind: 'noun', count: 1 };
    this.emit('spawn', { word: entry.w, count: copies, ents: made });
    return made;
  }
  // Put a new thing where its kind lives.
  settle(e, c = 0, copies = 1) {
    const w = e.L.width * e.size, r = this.rnd;
    e.speed = this.unit * (0.42 + r() * 0.3) / Math.sqrt(Math.max(0.5, e.baseS || 1));
    e.timer = 0.9 + r() * 1.5 + c * 0.2; e.think = 2 + r() * 3;
    // only things that go somewhere ever turn around; everything else keeps its word the right way round
    const turns = e.kind === 'walk' || e.kind === 'person' || e.kind === 'fly' || e.kind === 'swim' || e.kind === 'float' || e.kind === 'drive';
    e.dir = turns && r() < 0.5 ? -e.art : e.art;
    if (e.where === 'ground') {
      e.depth = e.kind === 'building' ? -4 : e.kind === 'plant' ? -2 : (r() - 0.3) * 9;
      e.x = this.groundSpot(w); e.y = this.ground + e.depth;
      if (e.kind === 'plant' || e.kind === 'building') { e.grow = 0.02; e.growTo = 1; }
      if (e.kind === 'drive') e.speed = this.unit * (0.9 + r() * 0.6);
    } else if (e.where === 'sky' || e.where === 'high') {
      const p = this.skySpot(e.size);
      e.x = p.x; e.y = e.where === 'high' ? this.top + e.size + r() * this.unit * 0.5 : p.y;
      e.tx = e.x; e.ty = e.y; e.vxf = 0; e.vyf = 0;
      e.speed = this.unit * (0.8 + r() * 0.7);
    } else {              // water creatures; they cope without water, badly
      e.x = lerp(w / 2 + 10, this.W - w / 2 - 10, r());
      e.y = this.hasSea ? this.ground - 2 : this.ground;
      e.tx = e.x; e.ty = e.y; e.vxf = 0; e.vyf = 0;
      e.speed = this.unit * (0.5 + r() * 0.4);
    }
    e.face = e.dir === e.art ? 1 : -1;
  }

  // A word the dictionary does not know still gets to live: it walks around as itself.
  nameLayout(text, color, { ltr = false, crown = false } = {}) {
    const chars = [...text.replace(/\s+/g, '')].slice(0, 12);
    const items = [], n = chars.length, step = 0.56, total = n * step;
    const dark = color.map((v) => v * 0.45 + INK[0] * 0.5);
    chars.forEach((ch, i) => {
      const slot = ltr ? i : n - 1 - i;                       // Hebrew starts on the right
      const x = -total / 2 + step * (slot + 0.5);
      const shade = 0.86 + ((i * 37) % 5) * 0.07;
      items.push({ ch, x, y: -0.62, size: 0.74, color: color.map((v) => Math.min(255, v * shade)), rot: ((i % 2) - 0.5) * 0.08 });
      for (const s of [-1, 1]) items.push({ ch: '❘', x: x + s * 0.13, y: -0.15, size: 0.34, color: dark, edge: 2, rot: s * 0.12 });
    });
    const head = -total / 2 + step * ((ltr ? 0 : n - 1) + 0.5);
    for (const s of [-1, 1]) {
      items.push({ ch: '●', x: head + s * 0.13, y: -1.04, size: 0.3, color: [250, 250, 252], edge: 3 });
      items.push({ ch: '○', x: head + s * 0.13, y: -1.04, size: 0.3, color: INK, edge: 3 });
      items.push({ ch: '●', x: head + s * 0.13 + 0.02, y: -1.03, size: 0.13, color: INK, edge: 3 });
    }
    if (crown) items.push({ ch: '★', x: head, y: -1.36, size: 0.34, color: [232, 178, 30], edge: 3 });
    return manualLayout(items, total);
  }
  nameFit(L) { return Math.min(1, (this.W * 0.42) / (L.width * this.unit * 0.68)); }
  spawnName(act, from) {
    const text = act.text, made = [];
    const copies = clamp(act.count || 1, 1, 6);
    for (let c = 0; c < copies; c++) {
      const color = act.tint || paint.MARKERS[(paint.hashWord(text) + c) % paint.MARKERS.length];
      const L = this.nameLayout(text, color, { crown: act.me });
      const e = this.add(L, {
        word: text, entry: { w: text, s: 0.9, say: text }, kind: 'name', layer: 7, where: 'ground', anim: NAME,
        flags: {}, baseS: 0.62, scale: (act.scale || 1) * this.nameFit(L), from, wait: c * 0.15, named: true, nameColor: color, me: act.me,
      });
      this.settle(e, c, copies);
      e.art = e.dir; e.face = 1;
      made.push(e);
    }
    this.lastAct = { ...act, kind: 'name', count: 1 };
    this.emit('spawn', { word: text, count: copies, ents: made, name: true });
    return made;
  }
  // One-off shapes the page paints itself.
  painted(word, image, o) {
    const px = o.size ?? this.sizeFor(o.baseS ?? 1, o.scale || 1);
    const rows = o.rows ?? this.rowsFor(px);
    const L = buildLayout(image, word, { rows, tint: o.tint, rainbow: o.rainbow, outline: o.outline });
    return this.add(L, { word, entry: { w: word, s: o.baseS ?? 1 }, flags: {}, image, rows, anim: STILL, layer: 7, where: 'ground', ...o, size: o.size });
  }

  // ---------- talking ----------
  say(e, text, o = {}) {
    if (!text) return;
    if (this.says.length > 9) this.says.shift();
    const size = o.size || clamp(this.unit * 0.2, 15, 24);
    const y = e ? e.y + e.jy - e.size * e.grow * (e.kind === 'name' ? 1.25 : 1) - size * 0.9 : o.y;
    this.says.push({ text: [...text], x: clamp(e ? e.x : o.x, 50, this.W - 50), y: Math.max(this.top + 4, y), t: 0, life: o.life || 1.9, size, color: o.color || INK });
  }
  shout(text, color = [201, 48, 44]) { this.say(null, text, { x: this.W / 2, y: lerp(this.top, this.ground, 0.32), size: clamp(this.unit * 0.46, 26, 60), life: 2.4, color }); }
  puff(x, y, ch, color, count = 6, o = {}) {
    const g = glyphOf(ch), r = this.rnd;
    for (let i = 0; i < count; i++) this.motes.spawn(x + (r() - 0.5) * (o.spread ?? 30), y + (r() - 0.5) * 16, g, color, { vx: (r() - 0.5) * (o.vx ?? 70), vy: -(o.up ?? 55) - r() * 40, size: (o.size ?? 15) * (0.8 + r() * 0.5), life: (o.life ?? 1.3) * (0.7 + r() * 0.6), vr: (r() - 0.5) * 2, grav: o.grav ?? -10, drag: 0.8 });
  }
  hearts(e, count = 3) { this.puff(e.x, e.y - e.size * e.grow - 6, '♥', [222, 60, 80], count, { size: 17, up: 40 }); }

  // ---------- commands ----------
  weather() { return { sea: this.sea.target, grass: this.grass.target, stars: this.stars.target, night: this.nightTo, dusk: this.duskTo, sky: this.skyTo, rainbow: this.rainbow.target }; }
  run(act, from) {
    const before = this.weather(), ids = new Set(this.ents.map((e) => e.id));
    let made;
    if (act.kind === 'noun') made = this.spawnNoun(act, from);
    else if (act.kind === 'name') made = this.spawnName(act, from);
    else if (act.kind === 'modify') made = this.modify(act, from);
    else made = this.special(act, from);
    if (!(act.kind === 'special' && (act.id === 'no' || act.id === 'clear'))) {
      this.undos.push({ before, ents: this.ents.filter((e) => !ids.has(e.id) && !e.passing) });
      if (this.undos.length > 40) this.undos.shift();
    }
    return made;
  }
  // "לא": the last thing written is unwritten.
  undo() {
    let u = this.undos.pop();
    while (u && !u.ents.some((e) => !e.dying && this.ents.includes(e)) && JSON.stringify(u.before) === JSON.stringify(this.weather())) u = this.undos.pop();
    if (!u) return null;
    let word = null;
    for (const e of u.ents) if (!e.dying) { word = e.word; this.remove(e, 'poof'); }
    const b = u.before;
    this.sea.target = b.sea; this.grass.target = b.grass; this.stars.target = b.stars; this.nightTo = b.night; this.duskTo = b.dusk; this.skyTo = b.sky;
    if (!b.rainbow) { this.rainbow.target = 0; this.rainbow.timer = 0; }
    this.rain.target = 0; this.rainT = 0; this.snow.target = 0; this.snowT = 0; this.stormT = 0;
    return word || 'מזג האוויר';
  }
  movers() { return this.ents.filter((e) => !e.dying && (e.where === 'ground' || e.where === 'sky' || e.where === 'water' || e.where === 'surface') && e.kind !== 'building' && e.kind !== 'plant'); }
  newest() { let best = null; for (const e of this.ents) if (!e.dying && !e.passing && (!best || e.id > best.id)) best = e; return best; }
  all(fn) { for (const e of this.ents) if (!e.dying) fn(e); }
  hop(e, power = 1) { if (e.jy === 0 && !e.held && e.where === 'ground') { e.vjy = -this.unit * 3.6 * power; e.jy = -0.01; } else if (e.where !== 'ground') e.sq = 0.25 * power; }

  modify(act, from) {
    const e = this.newest();
    if (!e) {
      if (act.tint || act.rainbow) {
        const word = act.colorWord || 'צבע';
        const blob = this.painted(word, paint.splatMask(paint.hashWord(word)), { baseS: 0.6, tint: act.tint, rainbow: act.rainbow, from, kind: 'thing' });
        this.settle(blob); this.emit('spawn', { word, count: 1, ents: [blob] });
        return [blob];
      }
      this.emit('nothing'); return [];
    }
    if (act.tint || act.rainbow) {
      e.tint = act.tint; e.rainbow = act.rainbow;
      if (e.named) { e.nameColor = act.tint || e.nameColor; e.L = this.nameLayout(e.word, e.nameColor, { crown: e.me, ltr: e.claude }); }
      else if (e.image) e.L = buildLayout(e.image, e.word, { rows: e.rows, tint: act.tint, rainbow: act.rainbow });
      this.puff(e.x, e.y - e.size * 0.5, '✦', act.tint || [232, 178, 30], 10, { spread: e.size * 0.7, size: 18 });
      e.sq = 0.3;
    }
    if (act.scale) { const k = clamp(e.sizeU * act.scale, 0.22, 3.2) / e.sizeU; e.sizeU *= k; e.size *= k; e.scale *= k; e.sq = -0.25; }
    if (act.count && act.count > 1 && this.lastAct) this.run({ ...this.lastAct, count: act.count - 1 }, from);
    this.emit('modify', { word: e.word });
    return [e];
  }

  special(act, from) {
    const id = act.id, r = this.rnd, word = (act.written || '').replace(/\s+/g, '');
    const one = (kind) => this.ents.find((e) => e.kind === kind && !e.dying);
    const done = (what) => { this.emit('special', { id, word: act.written, ...what }); return (what && what.ents) || []; };
    switch (id) {
      case 'sun': {
        this.nightTo = 0; this.duskTo = 0;
        let s = one('sun');
        if (!s) {
          const size = this.unit * 1.5;
          s = this.painted('שמש', paint.sunMask(), { size, kind: 'sun', where: 'fixed', layer: 1, anim: SUN, from, keep: true, scenery: true, rows: this.mobile ? 13 : 17 });
          s.homeX = this.W * 0.8; s.homeY = this.top + size * 1.08; s.x = s.homeX; s.y = this.ground + size * 1.2;
        } else { s.sq = 0.3; this.say(s, 'חם'); }
        return done({ ents: [s] });
      }
      case 'moon': {
        this.nightTo = 1; this.duskTo = 0; this.stars.target = 1;
        let m = one('moon');
        if (!m) {
          const size = this.unit * 1.15;
          m = this.painted('ירח', paint.moonMask(), { size, kind: 'moon', where: 'fixed', layer: 1, anim: STILL, from, keep: true, scenery: true });
          m.homeX = this.W * 0.22; m.homeY = this.top + size * 1.2; m.x = m.homeX; m.y = this.ground + size * 1.2;
        } else m.sq = 0.3;
        return done({ ents: [m] });
      }
      case 'night': case 'goodnight':
        this.nightTo = 1; this.duskTo = 0; this.stars.target = 1;
        if (id === 'goodnight') this.all((e) => { if (e.brain) e.forced = true; });
        return done();
      case 'day': case 'morning':
        this.nightTo = 0; this.duskTo = 0;
        this.all((e) => { e.forced = false; });
        if (id === 'morning') { this.all((e) => this.hop(e, 0.8 + r() * 0.4)); const cock = this.ents.find((e) => e.word === 'תרנגול' && !e.dying); if (cock) this.say(cock, 'קוקוריקו'); }
        return done();
      case 'dusk': this.duskTo = 1; this.nightTo = 0.2; return done();
      case 'sky': this.skyTo = 1; if (!one('cloud')) this.cloud(from, 2); return done();
      case 'star': {
        const made = [];
        const img = this.sprites.get('⭐');
        for (let c = 0; c < clamp(act.count || 1, 1, 12); c++) {
          const size = this.unit * 0.5 * (act.scale || 1) * (0.8 + r() * 0.5);
          const s = img ? this.painted('כוכב', img, { size, kind: 'star', where: 'fixed', layer: 0.5, from, wait: c * 0.1, tint: act.tint, rainbow: act.rainbow, flags: { glow: true } })
            : null;
          if (!s) break;
          const p = this.skySpot(size); s.x = p.x; s.y = Math.min(p.y, lerp(this.top + size, this.ground - this.unit * 2, r())); s.homeX = s.x; s.homeY = s.y;
          made.push(s);
        }
        this.stars.target = Math.max(this.stars.target, 0.5);
        this.lastAct = { ...act, count: 1 };
        return done({ ents: made });
      }
      case 'stars': this.stars.target = 1; if (this.night < 0.5) this.stars.on = Math.max(this.stars.on, 0.2); this.twinkle = 2; return done();
      case 'cloud': { const made = this.cloud(from, clamp(act.count || 1, 1, 8), act); this.lastAct = { ...act, count: 1 }; return done({ ents: made }); }
      case 'rain': this.rain.setWord(word); this.rain.target = act.written === 'מבול' ? 1 : 0.7; this.rainT = 13; if (!one('cloud')) this.cloud(from, 2); return done();
      case 'snow': this.snow.target = 0.9; this.snowT = 15; return done();
      case 'wind': this.windTo = (r() < 0.5 ? -1 : 1); this.windT = 6; return done();
      case 'storm': this.rain.setWord('גשם'); this.rain.target = 1; this.rainT = 12; this.windTo = -1; this.windT = 12; this.stormT = 11; this.boltT = 1.2; if (!one('cloud')) this.cloud(from, 3); return done();
      case 'lightning': this.bolt(); return done();
      case 'rainbow': this.rainbow.show(60); return done();
      case 'sea': this.sea.setWord(word); this.sea.target = 1; if (act.written === 'גלים' || act.written === 'גל') this.sea.swell = 1; return done();
      case 'mountain': {
        let m = one('mountain');
        if (!m) {
          const image = paint.mountainMask(11);
          const size = Math.min((this.ground - this.top) * 0.52, (this.W * 0.94) / 2.5);
          m = this.painted(word.length <= 3 ? 'הר' : word, image, { size, kind: 'mountain', where: 'ground', layer: 4, from, keep: true, scenery: true, rows: this.mobile ? 13 : 18 });
          m.x = this.W * 0.46; m.y = this.ground; m.grow = 0.02; m.growTo = 1; m.depth = 0;
        } else m.sq = -0.12;
        return done({ ents: [m] });
      }
      case 'grass': this.grass.setWord('דשא', [58, 150, 52]); this.grass.target = 1; this.grass.on = Math.min(this.grass.on, 0.3); return done();
      case 'soil': this.grass.setWord('אדמה', [134, 92, 54]); this.grass.target = 1; this.grass.on = Math.min(this.grass.on, 0.3); return done();
      case 'fire': {
        const made = [], img = this.sprites.get('🔥');
        for (let c = 0; c < clamp(act.count || 1, 1, 5) && img; c++) {
          const f = this.painted('אש', img, { baseS: 0.9, scale: act.scale || 1, kind: 'fire', anim: FLAME, from, wait: c * 0.1, tint: act.tint, rainbow: act.rainbow, flags: { glow: true }, entry: { w: 'אש', s: 0.9, say: 'חם' } });
          this.settle(f); made.push(f);
        }
        this.lastAct = { ...act, count: 1 };
        return done({ ents: made });
      }
      case 'love': {
        const made = [], img = this.sprites.get('❤️');
        for (let c = 0; c < clamp(act.count || 1, 1, 9) && img; c++) {
          const size = this.unit * 0.8 * (act.scale || 1);
          const h = this.painted('לב', img, { size, kind: 'heart', where: 'fixed', layer: 8.5, from, wait: c * 0.1, tint: act.tint, rainbow: act.rainbow });
          const p = this.skySpot(size); h.x = p.x; h.y = p.y; h.homeX = h.x; h.homeY = h.y; made.push(h);
        }
        this.all((e) => { if (e.brain) this.hearts(e, 2); });
        this.lastAct = { ...act, count: 1 };
        return done({ ents: made });
      }
      case 'music': this.danceT = 12; this.notes(14); return done();
      case 'monster': {
        const made = [];
        for (let c = 0; c < clamp(act.count || 1, 1, 6); c++) {
          const seed = Math.floor(r() * 1e9);
          const m = this.painted('מפלצת', paint.monsterMask(seed), { baseS: 1.25, scale: act.scale || 1, kind: 'walk', anim: WALK, from, wait: c * 0.12, tint: act.tint, rainbow: act.rainbow,
            entry: { w: 'מפלצת', s: 1.25, say: ['בו', 'גררר', 'אני רעב', 'רררר'][Math.floor(r() * 4)], scary: true }, flags: { scary: true } });
          this.settle(m); made.push(m);
        }
        this.lastAct = { ...act, count: 1 };
        return done({ ents: made });
      }
      case 'bowling': {
        const b = this.painted('באולינג', paint.ballMask(), { baseS: 0.85, kind: 'roller', from, passing: true, keep: true });
        b.x = this.W + b.size; b.y = this.ground + 4; b.pivot = -0.5; b.depth = 4;
        return done({ ents: [b] });
      }
      case 'rocrok': {
        const dog = byWord.get('כלב');
        if (!dog) return this.spawnName({ text: 'רוקרוק' }, from);
        const made = this.spawnNoun({ entry: { ...dog, w: 'רוקרוק', say: 'הב הב', likes: ['עצם'], s: 1.05 }, count: act.count, scale: act.scale, tint: act.tint || [92, 60, 38], rainbow: act.rainbow }, from);
        for (const e of made) e.speed *= 1.9;
        return done({ ents: made });
      }
      case 'goal': {
        const ball = byWord.get('כדורגל');
        const img = ball && this.sprites.get(ball.e);
        if (img) {
          const b = this.painted('גול', img, { baseS: 0.5, kind: 'shot', where: 'fixed', layer: 9, from, passing: true, keep: true });
          b.x = this.W + 30; b.y = this.ground - this.unit * 0.4; b.pivot = -0.5; b.vxf = -this.W * 0.75; b.vyf = -this.unit * 5;
        }
        this.shout('גוווול!'); this.all((e) => this.hop(e, 0.9 + r() * 0.5));
        return done();
      }
      case 'claude': {
        let c = this.ents.find((e) => e.claude && !e.dying);
        if (c) { this.hop(c); this.say(c, this.claudeLine()); return done({ ents: [c] }); }
        const L = this.nameLayout('Claude', [217, 119, 87], { ltr: true });
        c = this.add(L, { word: 'Claude', entry: { w: 'Claude', s: 0.9 }, kind: 'name', layer: 7, where: 'ground', anim: NAME, flags: {}, baseS: 0.62, scale: this.nameFit(L), from, named: true, claude: true, nameColor: [217, 119, 87] });
        this.settle(c); c.face = 1; c.sayAt = 1.6; c.line = 'אני פה';
        return done({ ents: [c] });
      }
      case 'me': this.shout('מי אתם?', INK); this.emit('hint', 'אני'); return done();
      case 'hello': {
        const m = this.movers().filter((e) => e.brain);
        this.all((e) => this.hop(e, 0.7 + r() * 0.5));
        m.slice(0, 3).forEach((e, i) => { e.sayAt = 0.2 + i * 0.35; e.line = 'שלום!'; });
        if (!m.length) this.say(null, 'שלום!', { x: this.W / 2, y: lerp(this.top, this.ground, 0.4), size: clamp(this.unit * 0.4, 24, 48) });
        const dove = byWord.get('יונה');
        if (dove) { const made = this.spawnNoun({ entry: dove, count: 1 }, from); for (const e of made) { e.passing = true; e.keep = true; e.x = this.W + e.size; e.y = this.top + this.unit; e.tx = -e.size * 2; e.ty = this.top + this.unit * 0.8; e.speed = this.unit * 1.4; } this.lastAct = null; }
        return done();
      }
      case 'thanks': this.shout('בבקשה!', [47, 138, 37]); this.all((e) => { if (e.brain) this.hearts(e, 1); }); return done();
      case 'please': this.shout('תודה!', [47, 138, 37]); return done();
      case 'sorry': this.shout('הכול בסדר', [43, 75, 215]); this.puff(this.W / 2, lerp(this.top, this.ground, 0.4), '♥', [222, 60, 80], 5); return done();
      case 'yes': this.all((e) => this.hop(e, 1)); return done();
      case 'no': return done({ undone: this.undo() });
      case 'clear': this.clear(); return done();
      case 'boom': this.boom(); return done();
      case 'laugh': this.all((e) => { e.giggle = 1.6; }); this.movers().slice(0, 4).forEach((e, i) => { e.sayAt = i * 0.25; e.line = 'חה חה'; }); return done();
      case 'hush': this.freeze = 2.6; this.danceT = 0; this.rain.target = 0; this.rainT = 0; this.windTo = 0; this.shout('ששש', INK); return done();
      case 'more': if (this.lastAct) return this.run({ ...this.lastAct, count: act.count || 1 }, from); this.emit('nothing'); return [];
      case 'birthday': {
        for (const [w, n] of [['עוגה', 1], ['בלון', 5]]) { const en = byWord.get(w); if (en) this.spawnNoun({ entry: en, count: n }, from); }
        this.confetti(110); this.shout('מזל טוב!', [236, 100, 160]);
        this.all((e) => this.hop(e, 0.8 + r() * 0.5));
        return done();
      }
      case 'abra': this.spell = 1; this.vortex(); return done();
      case 'happy': this.all((e) => { this.hop(e, 1); if (e.brain) this.hearts(e, 1); }); return done();
      case 'sad': this.rain.setWord('גשם'); this.rain.target = 0.35; this.rainT = 5; this.all((e) => { e.sq = 0.3; }); this.shout('חיבוק?', [43, 75, 215]); return done();
      case 'jump': this.all((e) => { e.hops = 3; }); return done();
      case 'dance': this.danceT = 12; this.notes(8); return done();
      case 'sleep': this.all((e) => { if (e.brain) e.forced = true; }); return done();
      case 'flyup': this.floatT = 7; return done();
      case 'run': this.runT = 9; return done();
      case 'eat': this.all((e) => { e.hungry = true; e.think = 0.2 + r(); }); return done();
      case 'help': case 'bye': this.emit('ui', id); return [];
      default: return done();
    }
  }
  claudeLine() { const lines = ['אני עשוי ממילים', 'תודה שכתבתם אותי', 'איזו מילה הכי יפה?', 'כל מילה כאן חיה', 'כתבו לי עוד!']; return lines[Math.floor(this.rnd() * lines.length)]; }
  cloud(from, count = 1, act = {}) {
    const made = [];
    for (let c = 0; c < count; c++) {
      const size = this.unit * (0.62 + this.rnd() * 0.3) * (act.scale || 1);
      const e = this.painted('ענן', paint.cloudMask(Math.floor(this.rnd() * 1e6)), { size, kind: 'cloud', where: 'fixed', layer: 3, anim: CLOUD, from, wait: c * 0.15, tint: act.tint, rainbow: act.rainbow, scenery: true });
      e.x = lerp(size, this.W - size, this.rnd()); e.y = this.top + size * 0.9 + this.rnd() * this.unit * 0.9;
      e.drift = 5 + this.rnd() * 7;
      made.push(e);
    }
    return made;
  }
  notes(count) { for (let i = 0; i < count; i++) this.motes.spawn(this.rnd() * this.W, this.ground - this.rnd() * this.unit * 2, glyphOf('♪'), paint.MARKERS[i % paint.MARKERS.length], { vy: -30 - this.rnd() * 40, vx: (this.rnd() - 0.5) * 30, size: 20 + this.rnd() * 10, life: 2.5 + this.rnd() * 2, vr: (this.rnd() - 0.5), drag: 0.2 }); }
  confetti(count) {
    const letters = [...'מזלטוב'].map(glyphOf).concat(glyphOf('✦'), glyphOf('★'));
    for (let i = 0; i < count; i++) this.motes.spawn(this.rnd() * this.W, -10 - this.rnd() * 200, letters[i % letters.length], paint.MARKERS[i % paint.MARKERS.length], { vy: 60 + this.rnd() * 90, vx: (this.rnd() - 0.5) * 60, size: 12 + this.rnd() * 10, life: 4 + this.rnd() * 3, vr: (this.rnd() - 0.5) * 6, grav: 30, drag: 0.6 });
  }
  bolt() {
    this.flash = 1; this.shake = Math.max(this.shake, 1);
    const letters = [...'ברק'].map(glyphOf);
    let x = lerp(this.W * 0.2, this.W * 0.8, this.rnd()), y = this.top - 20, i = 0;
    while (y < this.ground) {
      this.motes.spawn(x, y, letters[i++ % 3], [240, 196, 40], { size: 26, life: 0.55 + i * 0.01, a: 1, rot: (this.rnd() - 0.5) });
      x += (this.rnd() - 0.5) * 46; y += 15;
    }
    this.all((e) => this.hop(e, 0.7));
    this.emit('thunder');
  }
  boom() {
    this.shake = 1.4; const cx = this.W / 2, cy = lerp(this.top, this.ground, 0.6), r = this.rnd;
    this.all((e) => {
      for (let i = 0; i < e.L.n; i++) {
        const dx = e.px[i] - cx, dy = e.py[i] - cy, d = Math.hypot(dx, dy) + 30;
        const f = 52000 / d * (0.5 + r());
        e.vx[i] += (dx / d) * f; e.vy[i] += (dy / d) * f - 200;
      }
      this.hop(e, 1.2);
    });
    const letters = [...'בום'].map(glyphOf);
    for (let i = 0; i < 46; i++) { const a = r() * 6.28, sp = 180 + r() * 420; this.motes.spawn(cx, cy, letters[i % 3], paint.MARKERS[i % 4 + 2], { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: 18 + r() * 22, life: 0.9 + r() * 0.6, vr: (r() - 0.5) * 8, drag: 2.2 }); }
    this.emit('boom');
  }
  vortex() {
    const cx = this.W / 2, cy = lerp(this.top, this.ground, 0.5);
    this.all((e) => { for (let i = 0; i < e.L.n; i++) { const dx = e.px[i] - cx, dy = e.py[i] - cy; e.vx[i] += -dy * 5 - dx * 1.2; e.vy[i] += dx * 5 - dy * 1.2; } });
    for (let i = 0; i < 40; i++) { const a = this.rnd() * 6.28, d = this.rnd() * this.W * 0.4; this.motes.spawn(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.5, glyphOf('✦'), paint.MARKERS[i % paint.MARKERS.length], { vx: -Math.sin(a) * 160, vy: Math.cos(a) * 160, size: 14 + this.rnd() * 16, life: 1.4 + this.rnd(), drag: 1.2, vr: 3 }); }
  }
  clear() {
    for (const e of this.ents) this.remove(e, 'blow');
    this.sea.target = 0; this.grass.target = 0; this.stars.target = 0; this.rainbow.target = 0; this.rainbow.timer = 0;
    this.rain.target = 0; this.snow.target = 0; this.rainT = 0; this.snowT = 0; this.snowCover = 0;
    this.nightTo = 0; this.duskTo = 0; this.skyTo = 0; this.windTo = -1; this.windT = 1.4;
    this.danceT = 0; this.runT = 0; this.floatT = 0; this.stormT = 0; this.lastAct = null; this.undos = [];
  }
  // Hand every visible letter to whoever wants to fold the world back into a story.
  harvest() {
    const out = [];
    for (const e of this.ents) {
      if (e.dying) continue;
      const S = e.size * e.grow;
      for (let i = 0; i < e.L.n; i++) if (e.pa[i] > 0.5) out.push({ x: e.px[i], y: e.py[i], g: e.L.gl[i], size: e.L.sz[i] * S, r: e.L.col[i * 3], gc: e.L.col[i * 3 + 1], b: e.L.col[i * 3 + 2] });
    }
    this.ents = []; this.held = null; this.undos = [];
    this.rain.clear(); this.snow.clear();
    this.sea.target = 0; this.grass.target = 0; this.rainbow.target = 0; this.rain.target = 0; this.snow.target = 0; this.snowCover = 0;
    this.nightTo = 0; this.duskTo = 0; this.skyTo = 0; this.stars.target = 0; this.rainT = 0; this.snowT = 0; this.stormT = 0;
    return out;
  }

  // ---------- touch ----------
  pick(x, y) {
    let best = null, bestKey = -1;
    for (const e of this.ents) {
      if (e.dying || e.kind === 'mountain') continue;
      const S = e.size * e.grow, w = Math.max(S * e.L.width, 34), top = e.y + e.jy - S * (e.kind === 'name' ? 1.3 : 1);
      if (x > e.x - w / 2 - 8 && x < e.x + w / 2 + 8 && y > top - 8 && y < e.y + e.jy + 10) {
        const key = e.layer * 10000 + e.y;
        if (key > bestKey) { bestKey = key; best = e; }
      }
    }
    return best;
  }
  pointerDown(x, y) {
    const e = this.pick(x, y);
    this.grab = e ? { e, x, y, ox: e.x - x, oy: e.y - y, moved: false } : null;
    return !!e;
  }
  pointerMove(x, y) {
    const g = this.grab;
    if (!g) return;
    if (!g.moved && Math.hypot(x - g.x, y - g.y) > 9) { g.moved = true; this.held = g.e; g.e.held = true; g.e.asleep = false; g.e.forced = false; this.emit('lift', { word: g.e.word }); }
    if (g.moved) { g.e.x = clamp(x + g.ox, 10, this.W - 10); g.e.y = Math.min(y + g.oy, this.ground + 12); g.e.jy = 0; g.e.vjy = 0; }
  }
  pointerUp(x, y) {
    const g = this.grab; this.grab = null;
    if (!g) { this.puff(x, y, '✦', [232, 178, 30], 3, { size: 13, up: 20, vx: 50, life: 0.7 }); return null; }
    const e = g.e;
    if (g.moved) {
      e.held = false; this.held = null;
      if (e.where === 'ground') { e.drop = e.y; e.y = this.ground + (e.depth || 0); e.jy = e.drop - e.y; e.vjy = 0; if (e.jy >= 0) e.jy = 0; else e.jy = Math.min(e.jy, -0.01); }
      else { e.homeX = e.x; e.homeY = e.y; e.tx = e.x; e.ty = e.y; }
      e.state = 'idle'; e.timer = 0.6;
      this.emit('drop', { word: e.word });
      return e;
    }
    this.poke(e, x, y);
    return e;
  }
  poke(e, x, y) {
    const R = Math.max(46, e.size * 0.5), r = this.rnd;
    for (let i = 0; i < e.L.n; i++) {
      const dx = e.px[i] - x, dy = e.py[i] - y, d = Math.hypot(dx, dy);
      if (d < R) { const f = (1 - d / R) * 520; e.vx[i] += (dx / (d + 1)) * f + (r() - 0.5) * 60; e.vy[i] += (dy / (d + 1)) * f - 40; }
    }
    if (e.asleep) { e.asleep = false; e.forced = false; e.awake = 6; this.say(e, 'מה?'); }
    else if (e.kind === 'cloud') { for (let i = 0; i < 16; i++) this.motes.spawn(e.x + (r() - 0.5) * e.size * e.L.width * 0.8, e.y - 6, this.rain.word[i % this.rain.word.length], [62, 116, 222], { vy: 240 + r() * 120, size: 14, life: 0.9 + r() * 0.5, grav: 300 }); }
    else if (e.kind === 'sun') { e.sq = 0.35; this.say(e, 'חם'); this.warm = 1; }
    else if (e.kind === 'heart' || e.kind === 'star') { e.sq = 0.4; this.puff(e.x, e.y - e.size * 0.5, e.kind === 'star' ? '✦' : '♥', e.kind === 'star' ? [232, 178, 30] : [222, 60, 80], 6); }
    else if (e.claude) this.say(e, this.claudeLine());
    else if (e.kind === 'name') this.say(e, e.word);
    else if (e.entry && e.entry.w === 'תוכי' && this.lastWord) this.say(e, this.lastWord);
    else if (e.entry && e.entry.say) this.say(e, e.entry.say);
    if (e.flags && e.flags.scary) this.scare(e);
    this.hop(e, 0.9);
    this.emit('poke', { word: e.word, ent: e });
  }
  scare(e) {
    this.shake = Math.max(this.shake, 0.5);
    let cried = false;
    for (const o of this.ents) {
      if (o === e || o.dying || !o.brain || (o.flags && o.flags.scary) || Math.abs(o.x - e.x) > this.unit * 4.5) continue;
      o.flee = 1.7; o.fleeDir = o.x < e.x ? -1 : 1; o.asleep = false; this.hop(o, 0.8);
      if (!cried && o.kind !== 'name') { cried = true; o.sayAt = 0.25; o.line = 'אמאלה!'; }
    }
  }

  // ---------- brains ----------
  stride(e, dir, speed, dt) {
    e.dir = dir; e.x += dir * speed * dt; e.moving = Math.min(1, e.moving + dt * 6);
    e.phase += dt * (7 + (speed / this.unit) * 5);
    if (e.kind !== 'name') e.face = e.dir === e.art ? 1 : -1;
    const m = e.L.width * e.size * 0.5 + 6;
    if (e.x < m) { e.x = m; return true; }
    if (e.x > this.W - m) { e.x = this.W - m; return true; }
    return false;
  }
  interest(e) {
    const en = e.entry || {};
    const near = (pred) => { let best = null, d = 1e9; for (const o of this.ents) { if (o === e || o.dying || o.held || !pred(o)) continue; const dd = Math.abs(o.x - e.x); if (dd < d) { d = dd; best = o; } } return best; };
    if (en.likes) { const t = near((o) => o.where === 'ground' && en.likes.includes(o.word)); if (t) return t; }
    if (e.hungry) { const t = near((o) => o.kind === 'food'); e.hungry = false; if (t) return t; }
    const tag = TAG[e.word];
    if (tag && e.cool <= 0) { const t = near((o) => tag.includes(o.word) && o.where === 'ground'); if (t) return t; }
    if (this.rnd() < 0.25) { const t = near((o) => o.flags && o.flags.bounce && o.where === 'ground' && Math.abs(o.x - e.x) < this.unit * 5); if (t) return t; }
    if (this.night > 0.6 && this.rnd() < 0.6) { const f = near((o) => o.kind === 'fire'); if (f && Math.abs(f.x - e.x) > this.unit * 1.6) return { x: f.x + (e.x < f.x ? -1 : 1) * this.unit * (0.9 + this.rnd() * 0.6), spot: true }; }
    return null;
  }
  meet(e, t) {
    if (t.kind === 'food') {
      this.remove(t, 'eaten'); t.eater = e;
      e.growTo = Math.min(1.6, e.growTo * 1.08); e.sq = 0.3; e.cool = 3;
      this.hearts(e, 1);
      if (this.rnd() < 0.6) this.say(e, this.rnd() < 0.5 ? 'טעים!' : 'מממ');
      this.emit('eat', { who: e.word, what: t.word });
    } else if (t.flags && t.flags.bounce) {
      t.roll = (t.x < e.x ? -1 : 1) * this.unit * (3 + this.rnd() * 2); this.hop(t, 0.7); e.cool = 1.5;
      this.emit('kick');
    } else if (TAG[e.word] && TAG[e.word].includes(t.word)) {
      this.say(e, 'תפסתי!'); this.hop(e, 1); this.hop(t, 1); e.cool = 12; t.flee = 2; t.fleeDir = t.x < e.x ? -1 : 1;
    } else { this.hearts(e, 2); this.hop(e, 0.8); e.cool = 9; }
  }
  walker(e, dt) {
    e.cool -= dt;
    const run = this.runT > 0 ? 2.4 : 1;
    if (e.flee > 0) { e.flee -= dt; this.stride(e, e.fleeDir, e.speed * 2.6, dt); return; }
    if (this.danceT > 0 || e.giggle > 0) { e.moving *= 0.9; e.rot = Math.sin(this.t * 7 + e.seed) * 0.16; if (e.jy === 0 && Math.sin(this.t * 7 + e.seed) > 0.96) this.hop(e, 0.5); return; }
    e.rot *= 0.85;
    if (e.state === 'idle') {
      e.moving = Math.max(0, e.moving - dt * 4);
      e.timer -= dt * run; e.think -= dt;
      if (e.think <= 0) {
        e.think = 2.5 + this.rnd() * 3;
        const t = e.cool <= 0 || e.hungry ? this.interest(e) : null;
        if (t) { e.state = 'seek'; e.target = t; return; }
      }
      if (e.timer <= 0) { e.state = 'walk'; e.tx = clamp(e.x + (this.rnd() - 0.5) * this.unit * 7, 30, this.W - 30); }
    } else if (e.state === 'walk') {
      const dx = e.tx - e.x;
      if (Math.abs(dx) < 4 || this.stride(e, Math.sign(dx), e.speed * run, dt)) { e.state = 'idle'; e.timer = 0.5 + this.rnd() * 2.6; }
      // bump into a ball and it rolls
      for (const o of this.ents) if (o.flags && o.flags.bounce && !o.dying && o.where === 'ground' && Math.abs(o.x - e.x) < (o.size + e.size * e.L.width) * 0.3 && Math.abs(o.roll || 0) < 20) { o.roll = e.dir * this.unit * 2.6; this.hop(o, 0.5); this.emit('kick'); }
    } else if (e.state === 'seek') {
      const t = e.target;
      if (!t || t.dying || (!t.spot && !this.ents.includes(t))) { e.state = 'idle'; e.timer = 0.4; return; }
      const dx = t.x - e.x, reach = t.spot ? 6 : (e.size * e.L.width + (t.size || 0) * (t.L ? t.L.width : 0)) * 0.36 + 6;
      if (Math.abs(dx) <= reach) { if (!t.spot) this.meet(e, t); e.state = 'idle'; e.timer = 0.8 + this.rnd() * 1.5; e.target = null; return; }
      this.stride(e, Math.sign(dx), e.speed * 1.7 * run, dt);
      if (!t.spot && t.brain && TAG[e.word] && Math.abs(dx) < this.unit * 1.5 && !(t.flee > 0)) { t.flee = 1.2; t.fleeDir = Math.sign(-dx) || 1; }
    }
  }
  flier(e, dt) {
    const resting = e.asleep;
    if (e.passing) { e.tx = -e.size * 2; }
    else if (resting) { e.tx = e.x; e.ty = this.ground + (e.depth || 0); }
    else {
      e.timer -= dt;
      const d = Math.hypot(e.tx - e.x, e.ty - e.y);
      if (d < 24 || e.timer <= 0) { const p = this.skySpot(e.size); e.tx = e.flags.lift ? clamp(e.x + (this.rnd() - 0.5) * 200, 30, this.W - 30) : p.x; e.ty = e.flags.lift ? Math.min(p.y, this.top + e.size + this.unit * 0.8) : p.y; e.timer = 4 + this.rnd() * 5; }
    }
    const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy) + 0.001;
    const sp = e.speed * (resting ? 0.9 : e.flags.lift ? 0.25 : 1) * (this.runT > 0 ? 1.8 : 1);
    const want = Math.min(1, d / 40);
    e.vxf += ((dx / d) * sp * want - e.vxf) * Math.min(1, dt * 1.6);
    e.vyf += ((dy / d) * sp * want - e.vyf) * Math.min(1, dt * 1.6);
    e.x += (e.vxf + this.wind * (e.flags.lift ? 120 : 30)) * dt; e.y += e.vyf * dt;
    if (!e.passing) e.x = clamp(e.x, 12, this.W - 12);
    if (Math.abs(e.vxf) > 8) { e.dir = e.vxf < 0 ? -1 : 1; e.face = e.dir === e.art ? 1 : -1; }
    e.moving = resting && d < 6 ? 0 : 1;
    e.phase += dt * (e.flap ? 13 : 2);
    e.rot = e.flap ? 0 : Math.sin(this.t * 1.4 + e.seed) * 0.08;
    if (e.passing && e.x < -e.size * 1.5) this.remove(e, 'gone');
  }
  swimmer(e, dt) {
    if (this.hasSea && this.sea.level > 0.6) {
      const top = this.seaTop + Math.min(e.size * 0.9, this.sea.height(this.unit) * 0.7), bot = this.ground + 2;
      e.timer -= dt;
      if (Math.hypot(e.tx - e.x, e.ty - e.y) < 20 || e.timer <= 0) { e.tx = lerp(e.size, this.W - e.size, this.rnd()); e.ty = lerp(Math.min(top, bot), bot, this.rnd()); e.timer = 3 + this.rnd() * 4; }
      const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy) + 0.001, sp = e.asleep ? e.speed * 0.2 : e.speed;
      e.vxf += ((dx / d) * sp - e.vxf) * Math.min(1, dt * 1.2); e.vyf += ((dy / d) * sp * 0.5 - e.vyf) * Math.min(1, dt * 1.2);
      e.x += e.vxf * dt; e.y = clamp(e.y + e.vyf * dt, Math.min(top, bot), bot);
      if (Math.abs(e.vxf) > 6) { e.dir = e.vxf < 0 ? -1 : 1; e.face = e.dir === e.art ? 1 : -1; }
      e.phase += dt * 7; e.rot *= 0.9; e.moving = 1; e.beached = false;
    } else {                      // a fish out of water
      e.y = this.ground + (e.depth || 0); e.moving = 0.4; e.phase += dt * 16;
      e.rot = Math.sin(this.t * 9 + e.seed) * 0.28;
      if (e.jy === 0 && this.rnd() < dt * 0.9) this.hop(e, 0.45);
      if (!e.beached && e.age > 2.2) { e.beached = true; this.say(e, 'מים!'); this.emit('hint', 'ים'); }
    }
  }
  floater(e, dt) {
    if (this.hasSea && this.sea.level > 0.6) {
      const m = e.size * e.L.width * 0.5;
      e.x += (e.dir * e.speed * 0.25 + this.wind * 40) * dt;
      if (e.x < m) { e.x = m; e.dir = 1; } else if (e.x > this.W - m) { e.x = this.W - m; e.dir = -1; }
      e.face = e.dir === e.art ? 1 : -1;
      const s0 = this.sea.surface(e.x - 12, this.t), s1 = this.sea.surface(e.x + 12, this.t);
      e.y = this.seaTop + e.size * 0.2 + (s0 + s1) / 2; e.rot = (s1 - s0) * 0.02;
    } else { e.y = this.ground + (e.depth || 0); e.rot *= 0.9; }
  }
  driver(e, dt) {
    if (e.asleep) { e.moving = 0; return; }
    if (this.stride(e, e.dir, e.speed * (this.runT > 0 ? 1.8 : 1), dt)) { e.dir = -e.dir; e.face = e.dir === e.art ? 1 : -1; }
    e.rot = Math.sin(this.t * 31 + e.seed) * 0.012;
  }

  // ---------- one step of time ----------
  update(dt) {
    dt = Math.min(dt, 0.05);
    const r = this.rnd;
    this.t += dt;
    const ease = (k) => Math.min(1, dt * k);
    this.night += (this.nightTo - this.night) * ease(0.7);
    this.dusk += (this.duskTo - this.dusk) * ease(0.7);
    this.sky += (this.skyTo - this.sky) * ease(0.6);
    if (this.windT > 0) { this.windT -= dt; if (this.windT <= 0) this.windTo = 0; }
    this.wind += (this.windTo - this.wind) * ease(1.4);
    if (this.rainT > 0) { this.rainT -= dt; if (this.rainT <= 0) this.rain.target = 0; }
    if (this.snowT > 0) { this.snowT -= dt; if (this.snowT <= 0) this.snow.target = 0; }
    if (this.stormT > 0) { this.stormT -= dt; this.boltT -= dt; if (this.boltT <= 0) { this.bolt(); this.boltT = 2.2 + r() * 2.5; } }
    for (const k of ['runT', 'floatT', 'danceT', 'freeze', 'twinkle']) if (this[k] > 0) this[k] -= dt;
    this.flash = Math.max(0, this.flash - dt * 3.5);
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.spell = Math.max(0, this.spell - dt / 9);
    this.warm = Math.max(0, this.warm - dt * 0.6);

    const frozen = this.freeze > 0;
    const sun = this.ents.find((e) => e.kind === 'sun' && !e.dying);
    const sunUp = sun && this.night < 0.4;
    const raining = this.rain.level > 0.25;
    // sunshine right after rain is how rainbows happen
    if (this.wasRaining && this.rain.target === 0 && this.rain.level < 0.3 && sunUp) { this.rainbow.show(36); this.emit('rainbow'); this.wasRaining = false; }
    if (raining) this.wasRaining = true; else if (this.rain.level < 0.05) this.wasRaining = false;
    if (this.snow.level > 0.2) this.snowCover = Math.min(1, this.snowCover + dt / 11);
    else if (sunUp) this.snowCover = Math.max(0, this.snowCover - dt / 16);
    if (raining) this.grass.tall = Math.min(1.7, this.grass.tall + dt * 0.03);

    let fireGlow = 0;
    for (const e of this.ents) {
      e.age += dt;
      if (e.dying) { e.dying += dt; this.fade(e, dt); continue; }
      if (frozen && e.brain !== false) { this.step(e, dt); continue; }
      e.brain = e.kind === 'walk' || e.kind === 'person' || e.kind === 'name' || e.kind === 'fly' || e.kind === 'swim' || e.kind === 'drive';
      // sleep and waking
      if (e.awake > 0) e.awake -= dt;
      if (e.brain && !e.held) {
        const sleepy = (this.night > 0.62 && !e.flags.night && !e.claude) || e.forced;
        if (sleepy && !e.asleep && !(e.awake > 0) && !(e.flee > 0)) { e.asleep = true; e.zz = 0.5 + r(); }
        else if (!sleepy && e.asleep) { e.asleep = false; this.hop(e, 0.5); }
      }
      if (e.sayAt > 0) { e.sayAt -= dt; if (e.sayAt <= 0) this.say(e, e.line); }
      if (e.hops > 0 && e.jy === 0 && !e.held) { e.hops--; this.hop(e, 0.9 + r() * 0.3); }
      if (e.giggle > 0) e.giggle -= dt;
      e.grow += (e.growTo - e.grow) * ease(e.kind === 'plant' || e.kind === 'building' || e.kind === 'mountain' ? 1.6 : 3);
      e.sq *= Math.exp(-dt * 6);

      if (!e.held) {
        if (e.asleep && e.kind !== 'fly') {
          e.moving = Math.max(0, e.moving - dt * 4); e.rot *= 0.9;
          e.zz -= dt;
          if (e.zz <= 0) { e.zz = 1.7 + r(); this.motes.spawn(e.x + e.size * 0.2, e.y - e.size * e.grow * 0.9, glyphOf('ז'), [110, 120, 190], { vx: 12, vy: -22, size: 13, grow: 6, life: 2.2, drag: 0.1 }); }
        } else if (e.kind === 'walk' || e.kind === 'person' || e.kind === 'name') this.walker(e, dt);
        else if (e.kind === 'fly') this.flier(e, dt);
        else if (e.kind === 'swim') this.swimmer(e, dt);
        else if (e.kind === 'float') this.floater(e, dt);
        else if (e.kind === 'drive') this.driver(e, dt);
        else this.thing(e, dt, sun, sunUp, raining);
        // everything on the ground can be lifted by the flying spell
        if (this.floatT > 0 && e.where === 'ground' && e.kind !== 'building' && e.kind !== 'plant' && e.kind !== 'mountain') { e.vjy = 0; e.jy = lerp(e.jy, -this.unit * (1.2 + Math.sin(e.seed) * 0.6) + Math.sin(this.t * 2 + e.seed) * 12, ease(1.5)); }
        else if (e.jy < 0 || e.vjy !== 0) {
          e.vjy += this.unit * 16 * dt; e.jy += e.vjy * dt;
          if (e.jy >= 0) { e.jy = 0; e.vjy = 0; e.sq = 0.22; if (e.where === 'ground') this.emit('land'); }
        }
      }
      if (e.flags && e.flags.glow) fireGlow = Math.max(fireGlow, 0.5);
      if (e.kind === 'fire') fireGlow = 1;
      this.step(e, dt);
    }
    this.ents = this.ents.filter((e) => !(e.dying > (e.fate === 'gone' ? 0.01 : 1.3)));
    this.ents.sort((a, b) => (a.layer - b.layer) || (a.y - b.y) || (a.id - b.id));

    for (const s of this.says) s.t += dt;
    this.says = this.says.filter((s) => s.t < s.life);
    this.motes.update(dt, this.wind);
    this.rain.update(dt, this.W, this.ground, this.wind, r, (x) => { if (r() < 0.35) this.motes.spawn(x, this.ground - 2, glyphOf('●'), [62, 116, 222], { vx: (r() - 0.5) * 60, vy: -50 - r() * 40, size: 4, life: 0.35, grav: 400 }); });
    this.snow.update(dt, this.W, this.ground, this.wind, r);
    this.sea.update(dt); this.grass.update(dt); this.stars.update(dt); this.rainbow.update(dt);

    const env = this.env;
    env.time = this.t; env.night = this.night; env.dusk = this.dusk * (1 - this.night); env.sky = this.sky;
    env.flash = this.flash; env.spell = this.spell;
    env.warm = Math.max(this.warm, fireGlow * this.night * 0.9);
    const sh = this.calm ? 0 : this.shake * this.shake * 9;
    env.shakeX = (r() - 0.5) * sh; env.shakeY = (r() - 0.5) * sh;
    if (sun) { env.sunX = sun.x; env.sunY = sun.y - sun.size * 0.5; env.sunGlow = clamp(1 - this.night * 1.6, 0, 1) * clamp((this.ground + sun.size * 0.4 - sun.y) / sun.size, 0, 1) * sun.alpha; } else env.sunGlow = 0;
    const moon = this.ents.find((e) => e.kind === 'moon' && !e.dying);
    if (moon) { env.moonX = moon.x; env.moonY = moon.y - moon.size * 0.5; env.moonGlow = this.night * moon.alpha; } else env.moonGlow = 0;
  }
  // Things that stay put, more or less.
  thing(e, dt, sun, sunUp, raining) {
    const r = this.rnd;
    switch (e.kind) {
      case 'sun': { const up = this.night < 0.5; const ty = up ? e.homeY + this.dusk * (this.ground - e.homeY) * 0.72 : this.ground + e.size * 1.25; e.x = lerp(e.x, e.homeX, Math.min(1, dt * 2)); e.y = lerp(e.y, ty, Math.min(1, dt * 0.9)); e.alpha = clamp((this.ground + e.size * 1.1 - e.y) / (e.size * 0.5), 0, 1); break; }
      case 'moon': { const up = this.night > 0.4; e.x = lerp(e.x, e.homeX, Math.min(1, dt * 2)); e.y = lerp(e.y, up ? e.homeY : this.ground + e.size * 1.25, Math.min(1, dt * 0.9)); e.alpha = clamp((this.ground + e.size * 1.1 - e.y) / (e.size * 0.5), 0, 1); break; }
      case 'star': e.sq = Math.max(e.sq, 0) + Math.sin(this.t * 2.2 + e.seed) * 0.012; e.alpha = 0.5 + 0.5 * this.night; e.rot = Math.sin(this.t * 0.7 + e.seed) * 0.12; e.pivot = -0.5; break;
      case 'heart': { const b = Math.pow(Math.max(0, Math.sin(this.t * 4.2 + e.seed)), 8); e.sq = -b * 0.12; e.y = e.homeY + Math.sin(this.t * 1.1 + e.seed) * 6; break; }
      case 'cloud': { e.x -= (e.drift + 0) * dt - this.wind * 110 * dt; const w = e.size * e.L.width; if (e.x < -w * 0.6) e.x = this.W + w * 0.5; if (e.x > this.W + w * 0.6) e.x = -w * 0.5; break; }
      case 'fire': {
        if (raining) { this.say(e, 'ששש'); for (let i = 0; i < 12; i++) this.motes.spawn(e.x + (r() - 0.5) * 30, e.y - e.size * 0.5, glyphOf('●'), [150, 150, 160], { vy: -40 - r() * 40, vx: (r() - 0.5) * 30, size: 8 + r() * 10, life: 1.6, drag: 0.4, a: 0.6 }); this.remove(e, 'poof'); break; }
        if (r() < dt * 7) this.motes.spawn(e.x + (r() - 0.5) * e.size * 0.4, e.y - e.size * 0.6, e.L.gl[(r() * e.L.n) | 0], [240, 140 + r() * 60, 30], { vy: -70 - r() * 60, vx: (r() - 0.5) * 30, size: 9 + r() * 6, life: 0.9 + r() * 0.6, drag: 0.3 });
        break;
      }
      case 'roller': { e.x -= this.unit * 7 * dt; e.rot -= dt * 9; for (const o of this.ents) { if (o === e || o.dying || o.struck || o.where !== 'ground' || o.kind === 'mountain' || Math.abs(o.x - e.x) > e.size * 0.6) continue; o.struck = true; this.shake = Math.max(this.shake, 0.6); for (let i = 0; i < o.L.n; i++) { o.vx[i] -= 500 + r() * 700; o.vy[i] -= 300 + r() * 900; } this.hop(o, 1.3); this.emit('strike'); } if (e.x < -e.size) { this.remove(e, 'gone'); this.shout('סטרייק!'); this.all((o) => { o.struck = false; }); } break; }
      case 'shot': { e.vyf += this.unit * 6 * dt; e.x += e.vxf * dt; e.y += e.vyf * dt; e.rot -= dt * 8; if (e.x < -e.size || e.y > this.ground + e.size * 2) this.remove(e, 'gone'); break; }
      case 'plant': if (raining) e.growTo = Math.min(1.75, e.growTo + dt * 0.035); break;
      default: {
        if (e.flags.bounce && e.roll) {       // a ball that was kicked
          e.x += e.roll * dt; e.rot += (e.roll / (e.size * 0.5)) * dt; e.pivot = -0.5; e.roll *= Math.exp(-dt * 1.1);
          const m = e.size * 0.5;
          if (e.x < m) { e.x = m; e.roll = Math.abs(e.roll) * 0.7; } else if (e.x > this.W - m) { e.x = this.W - m; e.roll = -Math.abs(e.roll) * 0.7; }
          if (Math.abs(e.roll) < 8) e.roll = 0;
        }
        if (e.flags.melts && sunUp) { e.melt = Math.min(1, (e.melt || 0) + dt / 26); if (!e.dripped && e.melt > 0.5) { e.dripped = true; this.say(e, 'אוי'); } }
        if (e.flags.melts && this.snow.level > 0.3) e.melt = Math.max(0, (e.melt || 0) - dt / 8);
      }
    }
  }
  // Pull every letter toward its place in the (moving, bending) shape.
  step(e, dt) {
    const L = e.L, n = L.n, S = e.size * e.grow, t = this.t;
    const melt = e.melt || 0;
    const sx = S * (1 + e.sq + melt * 0.45) * e.face, sy = S * (1 - e.sq) * (1 - melt * 0.68);
    const rot = e.rot, cs = Math.cos(rot), sn = Math.sin(rot), pv = e.pivot * sy, hasRot = rot !== 0;
    const ex = e.x, ey = e.y + e.jy, damp = Math.exp(-17 * dt), k = e.k, age = e.age;
    const anim = e.anim, ph = e.phase, mv = e.moving, seed = e.seed, wind = this.wind;
    const half = Math.max(0.1, L.width * 0.5), flap = e.flap ? 1 : 0;
    const lx = L.lx, ly = L.ly, edge = L.edge, px = e.px, py = e.py, vx = e.vx, vy = e.vy, pa = e.pa, delay = e.delay;
    const sleeping = e.asleep && e.kind !== 'fly' ? 0.86 : 1;
    for (let i = 0; i < n; i++) {
      const since = age - delay[i];
      if (since < 0) continue;
      let x = lx[i], y = ly[i] * sleeping;
      if (anim === WALK) {
        const legs = y > -0.3 ? (y + 0.3) / 0.3 : 0;
        x += Math.sin(ph * 2 + x * 9) * 0.05 * legs * mv; y -= Math.abs(Math.sin(ph)) * 0.035 * mv;
      } else if (anim === FLY) {
        const wing = Math.min(1, Math.abs(x) / half);
        y += flap ? -wing * wing * Math.sin(ph) * 0.24 * mv : Math.sin(t * 2 + seed + x * 2) * 0.012;
      } else if (anim === SWIM) y += Math.sin(ph + x * 6) * 0.05 * mv;
      else if (anim === SWAY) x += Math.pow(Math.max(0, -y), 1.5) * (Math.sin(t * 1.3 + seed) * 0.035 + wind * 0.2);
      else if (anim === SUN) {
        const cy = y + 0.5, rr = Math.hypot(x, cy);
        if (rr > 0.3) { const kk = 1 + 0.08 * Math.sin(t * 2.4 + Math.atan2(cy, x) * 6); x *= kk; y = cy * kk - 0.5; }
      } else if (anim === FLAME) { x += Math.sin(t * 9 + y * 13 + seed) * 0.07 * -y; y -= Math.max(0, Math.sin(t * 6.3 + x * 9 + seed)) * 0.09 * -y; }
      else if (anim === NAME) {
        if (edge[i] === 2) x += Math.sin(ph * 2 + x * 8) * 0.07 * mv;
        y += Math.sin(ph - x * 5) * 0.05 * mv - (edge[i] === 3 ? Math.sin(ph - x * 5) * 0.0 : 0);
      } else if (anim === CLOUD) y += Math.sin(t * 0.8 + x * 3 + seed) * 0.02;
      let X = x * sx, Y = y * sy;
      if (hasRot) { const yy = Y - pv, rx = X * cs - yy * sn; Y = X * sn + yy * cs + pv; X = rx; }
      const kk = since < 0.6 ? k * (0.22 + 1.3 * since) : k;
      vx[i] = (vx[i] + (ex + X - px[i]) * kk * dt) * damp;
      vy[i] = (vy[i] + (ey + Y - py[i]) * kk * dt) * damp;
      px[i] += vx[i] * dt; py[i] += vy[i] * dt;
      if (pa[i] < 1) pa[i] = Math.min(1, pa[i] + dt * 5);
    }
  }
  fade(e, dt) {
    const n = e.L.n, fate = e.fate;
    const tx = e.eater ? e.eater.x : 0, ty = e.eater ? e.eater.y - e.eater.size * 0.5 : 0;
    for (let i = 0; i < n; i++) {
      if (fate === 'eaten') { e.vx[i] = (e.vx[i] + (tx - e.px[i]) * 70 * dt) * 0.9; e.vy[i] = (e.vy[i] + (ty - e.py[i]) * 70 * dt) * 0.9; }
      else if (fate === 'blow') { e.vx[i] += (this.wind || -1) * (700 + (i % 7) * 120) * dt; e.vy[i] -= (40 + (i % 5) * 30) * dt; }
      else { e.vy[i] -= 60 * dt; e.vx[i] *= 0.97; e.vy[i] *= 0.97; }
      e.px[i] += e.vx[i] * dt; e.py[i] += e.vy[i] * dt;
      e.pa[i] = Math.max(0, e.pa[i] - dt * (fate === 'eaten' ? 1.5 : 1.1));
    }
  }

  // ---------- drawing ----------
  drawEnt(e, batch) {
    const L = e.L, n = L.n, S = e.size * e.grow, a = e.alpha;
    const face = e.face, col = L.col, gl = face < 0 ? L.glFlip : L.gl, sz = L.sz, rot = L.rot, px = e.px, py = e.py, pa = e.pa, er = e.rot;
    const grow = e.kind === 'star' ? 1 + e.sq : 1;
    const fresh = e.age < e.settled, age = e.age, delay = e.delay;
    for (let i = 0; i < n; i++) {
      if (pa[i] <= 0) continue;
      let s = sz[i] * S * grow;
      // letters still in flight are written large, then shrink into their place
      if (fresh) { const since = age - delay[i]; if (since < 0.9) s = Math.max(s, lerp(Math.min(22, S * 0.3), s, since / 0.9)); }
      batch.push(px[i], py[i], s, rot[i] * face + er, gl[i], col[i * 3], col[i * 3 + 1], col[i * 3 + 2], pa[i] * a);
    }
  }
  drawSay(s, batch) {
    const k = Math.min(1, s.t * 7), out = Math.min(1, (s.life - s.t) * 2.2);
    const size = s.size * (0.6 + 0.4 * k);
    let w = 0;
    for (const ch of s.text) w += ch === ' ' ? 0.36 * size : advance[glyphOf(ch)] * size;
    let x = s.x + w / 2;
    const y = s.y - s.t * 16;
    s.text.forEach((ch, i) => {
      if (ch === ' ') { x -= 0.36 * size; return; }
      const g = glyphOf(ch), aw = advance[g] * size;
      batch.push(x - aw / 2, y + Math.sin(s.t * 6 + i * 0.7) * 2, size, Math.sin(s.t * 5 + i) * 0.06, g, s.color[0], s.color[1], s.color[2], k * out);
      x -= aw;
    });
  }
  draw(batch) {
    this.stars.draw(batch, this.t, this.night);
    let i = 0;
    const ents = this.ents, n = ents.length;
    for (; i < n && ents[i].layer < 2; i++) this.drawEnt(ents[i], batch);       // sun, moon, big stars
    this.rainbow.draw(batch, this.night);
    for (; i < n && ents[i].layer < 6; i++) this.drawEnt(ents[i], batch);       // clouds, mountains, buildings, plants
    this.sea.draw(batch, this.W, this.ground, this.unit, this.t);
    for (; i < n && ents[i].layer < 7; i++) this.drawEnt(ents[i], batch);       // swimmers and boats
    this.grass.draw(batch, this.W, this.ground, this.t, this.wind);
    if (this.snowCover > 0.02) this.drawSnow(batch);
    for (; i < n; i++) this.drawEnt(ents[i], batch);
    this.rain.draw(batch, this.wind); this.snow.draw(batch, this.wind);
    this.motes.draw(batch);
    for (const s of this.says) this.drawSay(s, batch);
  }
  drawSnow(batch) {
    const letters = this.snow.word, c = this.snowCover;
    let k = 0;
    for (let row = 0; row < 3; row++) {
      const a = clamp(c * 3 - row, 0, 1);
      if (a <= 0) break;
      for (let x = this.W - 4 - row * 5; x > 0; x -= 14) {
        const h = Math.sin(x * 9.17 + row * 3.3) * 0.5 + 0.5;
        batch.push(x, this.ground - 4 - row * 8 - h * 3, 15 + h * 4, (h - 0.5) * 0.6, letters[k++ % letters.length], 176, 194, 232, a * 0.95);
      }
    }
  }

  // ---------- for tests and screen readers ----------
  describe() { return this.ents.filter((e) => !e.dying).map((e) => ({ word: e.word, kind: e.kind, n: e.L.n, x: e.x, y: e.y, asleep: !!e.asleep, size: e.size * e.grow })); }
  get glyphCount() { let n = 0; for (const e of this.ents) n += e.L.n; return n; }
}
