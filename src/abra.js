// אברא כדברא: write a word and it comes alive, made of its own letters.
// This file is the page around the world: the notebook lines you write on, the alphabet
// keyboard, the opening, the ending, what is remembered between visits. The world itself
// (src/abra/world.js) only ever hears "this was written".
import { loadFonts, buildAtlas, createRenderer, Batch, glyphOf, advance, BASELINE_DROP, HEB } from './abra/glyphs.js';
import { loadSprites } from './abra/sprites.js';
import { World } from './abra/world.js';
import { parse, clean, finalize, wordCount, SPECIALS, byWord, specialName } from './abra/lexicon.js';
import { sfx, wake } from './abra/sound.js';
import { isMuted, toggleMute } from './kit/audio.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SIM = params.has('sim'), CARD = params.has('card');
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 620;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = SIM || CARD ? seeded(20261111) : Math.random;

const store = {
  get(key, fallback) { if (SIM && !params.has('keep')) return fallback; try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { if (SIM && !params.has('keep')) return; try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
};

const INK = [52, 54, 92], PENCIL = [128, 132, 150], FRESH = [43, 75, 215];
const INTRO_FIRST = ['שלום. אני Claude.', 'את כל המשחקים כאן המציאו ילדים, בטושים ובעפרונות.', 'עכשיו ביקשו ממני להמציא משהו משלי.', 'אבל אין לי טושים. אין לי ידיים.', 'יש לי רק מילים.', 'אז הנה העולם, כמו שאני מכיר אותו:'];
const MINE = ['שמש', 'דשא', 'עץ', 'ציפורים'];
const STARTERS = ['כלב', 'חתול', 'ים', 'לילה', 'גשם', 'פרפר', 'פרח', 'דג', 'בית', 'מכונית', 'דינוזאור', 'מפלצת', 'קשת', 'שלג', 'ירח', 'כוכבים', 'הר', 'גלידה', 'כדור', 'רובוט', 'דרקון', 'מלך', 'פיל', 'ארנב', 'גזר', 'אש', 'לב', 'ענן', 'רוח', 'סירה', 'לוויתן', 'דבורה', 'תפוח', 'רכבת', 'חללית', 'נסיכה', 'ליצן', 'בלון', 'צפרדע', 'ינשוף'];
const MAGIC = ['לרקוד', 'בום', 'לקפוץ', 'מוזיקה', 'לעוף', 'שלום', 'כחול', 'ענק', 'שלושה חתולים', 'אברא כדברא', 'יום הולדת', 'חחח', 'לישון', 'בוקר טוב', 'צבעוני', 'באולינג', 'עוד', 'סערה'];
// What is worth remembering between visits: things that stay, not things that happen.
const LASTING = new Set(['sun', 'moon', 'star', 'stars', 'night', 'goodnight', 'day', 'morning', 'dusk', 'sky', 'cloud', 'sea', 'mountain', 'grass', 'soil', 'fire', 'love', 'monster', 'rocrok', 'claude']);

const canvas = $('page'), dock = $('dock'), bar = $('bar');
let renderer, world, batch, geo = null, phase = 'loading', time = 0;
let history = store.get('abra-page', []);
let found = new Set(store.get('abra-found', []));
let playerName = store.get('abra-name', '');
const seen = store.get('abra-seen', false);

// ---------- the notebook lines ----------
const SPACE = 0.34;
const LATIN = /[A-Za-z0-9]/;
const widthOf = (text, size) => { let w = 0; for (const ch of text) w += ch === ' ' ? SPACE * size : advance[glyphOf(ch)] * size; return w; };
// Lay text out right to left from (x, line), wrapping by word. Latin words keep their own direction.
function flow(text, g, start) {
  const out = [];
  let x = start.x, line = start.line, ci = 0;
  text.split(' ').forEach((word, wi) => {
    if (wi > 0) { x -= SPACE * g.size; ci++; }
    if (!word) return;
    const chars = [...word], w = widthOf(word, g.size);
    if (x - w < g.left && x < g.right - 1) { line++; x = g.right; }
    let lead = 0;
    while (lead < chars.length && LATIN.test(chars[lead])) lead++;
    if (lead) {
      const lw = widthOf(chars.slice(0, lead).join(''), g.size);
      let px = x - lw;
      for (let i = 0; i < lead; i++) { const a = advance[glyphOf(chars[i])] * g.size; out.push({ ch: chars[i], g: glyphOf(chars[i]), x: px + a / 2, line, i: ci + i }); px += a; }
      x -= lw;
    }
    for (let i = lead; i < chars.length; i++) { const a = advance[glyphOf(chars[i])] * g.size; out.push({ ch: chars[i], g: glyphOf(chars[i]), x: x - a / 2, line, i: ci + i }); x -= a; }
    ci += chars.length;
  });
  return { items: out, x, line };
}

const pen = { runs: [], fixed: [], typing: '', typed: [], cur: { x: 0, line: 0 }, end: { x: 0, line: 0 }, scroll: 0, ghost: '', wipe: 0 };
const penGeo = () => ({ right: geo.right, left: geo.left, size: geo.ts });
const lineY = (line) => geo.ground + (line - pen.scroll + 1) * geo.rule - geo.rule * 0.17;
function layTyping() {
  const f = flow(pen.typing, penGeo(), pen.cur);
  const old = pen.typed;
  pen.typed = f.items.map((it, k) => ({ ...it, born: old[k] && old[k].ch === it.ch ? old[k].born : time, color: FRESH }));
  pen.end = { x: f.x, line: f.line };
}
function inkRun(text, mine) {         // a finished word joins the page for good
  const f = flow(text, penGeo(), pen.cur);
  const items = f.items.map((it) => ({ ...it, born: time, color: mine ? PENCIL : INK, dry: time }));
  pen.fixed.push(...items);
  pen.cur = { x: f.x - SPACE * geo.ts * 1.5, line: f.line };
  if (pen.cur.x < geo.left + geo.ts * 2) pen.cur = { x: geo.right, line: f.line + 1 };
  pen.runs.push({ text, mine });
  if (pen.runs.length > 14) pen.runs.shift();
  const floor = pen.cur.line - geo.nLines - 1;
  pen.fixed = pen.fixed.filter((it) => it.line >= floor);
  layTyping();
  return items;
}
function relayPen() {                 // after a resize: write the last few runs again from the top
  const runs = pen.runs.slice(-8);
  pen.runs = []; pen.fixed = []; pen.cur = { x: geo.right, line: 0 }; pen.scroll = 0;
  for (const r of runs) inkRun(r.text, r.mine);
  for (const it of pen.fixed) it.born = -9;
  layTyping();
}
function drawPen() {
  const size = geo.ts;
  const wipe = pen.wipe > 0 ? clamp(1 - (time - pen.wipe) * 1.6, 0, 1) : 1;
  const put = (it) => {
    const row = it.line - pen.scroll;
    if (row < -0.9 || row > geo.nLines) return;
    const a = clamp(row + 0.9, 0, 1) * wipe;
    const pop = clamp((time - it.born) / 0.16, 0, 1), s = size * (0.5 + 0.5 * pop) * (1 + 0.25 * Math.sin(pop * Math.PI));
    batch.push(it.x, lineY(it.line) - BASELINE_DROP * size, s, 0, it.g, it.color[0], it.color[1], it.color[2], a);
  };
  for (const it of pen.fixed) put(it);
  if (phase !== 'play' && phase !== 'sign') return;
  for (const it of pen.typed) put(it);
  const cx = pen.end.x - size * 0.16, cy = lineY(pen.end.line) - size * 0.3;
  const blink = 0.5 + 0.5 * Math.sin(time * 5.2);
  batch.push(cx, cy, size * 1.25, 0.05, glyphOf('❘'), FRESH[0], FRESH[1], FRESH[2], 0.35 + 0.65 * blink);
  if (!pen.typing && pen.ghost) {
    const f = flow(pen.ghost, penGeo(), { x: pen.end.x - size * 0.6, line: pen.end.line });
    for (const it of f.items) batch.push(it.x, lineY(it.line) - BASELINE_DROP * size, size, 0, it.g, 150, 156, 182, 0.55 + 0.15 * blink);
  }
}
const sourcesOf = (items) => {
  const from = items.filter((it) => it.ch !== '.').map((it) => ({ x: it.x, y: lineY(it.line) - geo.ts * 0.3, g: it.g }));
  from.byGlyph = new Map();
  for (const s of from) (from.byGlyph.get(s.g) || from.byGlyph.set(s.g, []).get(s.g)).push(s);
  return from;
};

// ---------- geometry ----------
function measure() {
  const W = innerWidth, H = innerHeight;
  const dockH = CARD ? 0 : dock.offsetHeight;
  const ts = clamp(W / 27, 21, 33), rule = Math.round(ts * 1.62);
  const nLines = CARD ? 1 : H - dockH > 700 ? 3 : 2;
  const ground = Math.round(H - dockH - nLines * rule - 8);
  const top = CARD ? 24 : 56;
  const unit = clamp(Math.min((ground - top) * 0.25, W * 0.19), 48, 140);
  const margin = Math.round(W - Math.max(16, W * 0.04));
  geo = { W, H, dockH, ts, rule, nLines, ground, top, unit, margin, right: margin - ts * 0.5, left: Math.max(12, W * 0.035) };
  renderer.resize(W, H, Math.min(devicePixelRatio || 1, 2));
  world.resize(geo);
  Object.assign(world.env, { rule, ruleFrom: ground, margin });
}

// ---------- casting ----------
function announce(text) { $('live').textContent = text; }
function remember() { store.set('abra-page', history.slice(-48)); store.set('abra-found', [...found]); $('found-count').textContent = String(found.size); }
function castText(raw, { mine = false, from = null, quiet = false, replay = false } = {}) {
  const res = parse(raw);
  if (!res.actions.length) return null;
  const items = inkRun(res.shown + '.', mine);
  const src = replay && !from ? null : from || sourcesOf(items);
  let lasting = false, undo = false, wiped = false;
  for (const act of res.actions) {
    if (act.kind === 'special' && replay && !LASTING.has(act.id)) continue;
    world.lastWord = act.written || act.text || world.lastWord;
    world.run(act, src);
    if (act.kind === 'noun') { found.add(act.word); lasting = true; }
    else if (act.kind === 'name') { lasting = true; if (act.me) { playerName = act.text; store.set('abra-name', playerName); } }
    else if (act.kind === 'modify') lasting = true;
    else {
      found.add(specialName(act.id));
      if (LASTING.has(act.id)) lasting = true;
      if (act.id === 'no') undo = true;
      if (act.id === 'clear') wiped = true;
    }
  }
  if (!replay) {
    if (wiped) { history = []; pen.wipe = time; setTimeout(() => { pen.fixed = []; pen.runs = []; pen.cur = { x: geo.right, line: 0 }; pen.wipe = 0; layTyping(); }, 700); }
    else if (undo) history.pop();
    else if (lasting) history.push(res.shown);
    remember();
    if (!quiet) sfx.cast(res.shown);
    announce(res.shown);
  }
  return res;
}
function cast() {
  if (phase === 'sign') return sign();
  if (phase !== 'play') return;
  const text = clean(pen.typing);
  if (!text) { sfx.nope(); nudgeChips(); return; }
  pen.typing = ''; pen.typed = []; pen.ghost = '';
  $('key-cast').classList.remove('ready');
  castText(text);
  casts++;
  setTimeout(renderChips, 900);
}
let casts = 0, isDark = false;

// ---------- typing ----------
function type(ch) {
  if (phase !== 'play' && phase !== 'sign') return;
  wake();
  if (ch === ' ') { if (!pen.typing || pen.typing.endsWith(' ')) return; }
  if ([...pen.typing].length >= 22) { sfx.nope(); return; }
  pen.typing += ch;
  if (ch !== ' ') sfx.key(ch);
  layTyping();
  $('key-cast').classList.toggle('ready', !!clean(pen.typing));
  flashKey(ch);
}
function erase() {
  if (!pen.typing) return;
  pen.typing = [...pen.typing].slice(0, -1).join('');
  sfx.erase(); layTyping();
  $('key-cast').classList.toggle('ready', !!clean(pen.typing));
}
function flashKey(ch) {
  const el = dock.querySelector(`[data-ch="${ch}"]`);
  if (!el) return;
  el.classList.add('down'); setTimeout(() => el.classList.remove('down'), 110);
}
let typingTimer = 0;
function autoType(word, then = cast) {      // a suggestion writes itself, letter by letter, so the spelling is seen
  if (dock.classList.contains('busy')) return;
  wake();
  dock.classList.add('busy');
  pen.typing = ''; layTyping();
  const chars = [...word];
  let i = 0;
  const tick = () => {
    if (i < chars.length) { type(chars[i++]); typingTimer = setTimeout(tick, 95); }
    else typingTimer = setTimeout(() => { dock.classList.remove('busy'); then && then(); }, 260);
  };
  tick();
}

const CODE = { KeyT: 'א', KeyC: 'ב', KeyD: 'ג', KeyS: 'ד', KeyV: 'ה', KeyU: 'ו', KeyZ: 'ז', KeyJ: 'ח', KeyY: 'ט', KeyH: 'י', KeyF: 'כ', KeyK: 'ל', KeyN: 'מ', KeyB: 'נ', KeyX: 'ס', KeyG: 'ע', KeyP: 'פ', KeyM: 'צ', KeyE: 'ק', KeyR: 'ר', KeyA: 'ש', Comma: 'ת', KeyL: 'ך', KeyO: 'ם', KeyI: 'ן', Semicolon: 'ף', Period: 'ץ' };
function buildKeys() {
  const keys = $('keys');
  for (const ch of 'אבגדהוזחטיכלמנסעפצקרשתךםןףץ') {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'key' + ('ךםןףץ'.includes(ch) ? ' final' : ''); b.dataset.ch = ch; b.textContent = ch;
    b.setAttribute('aria-label', ch);
    keys.appendChild(b);
  }
  const press = (el, fn) => el.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
  keys.addEventListener('pointerdown', (e) => { const k = e.target.closest('[data-ch]'); if (k) { e.preventDefault(); type(k.dataset.ch); } });
  // keyboards and switches reach the keys through click (pointer presses are handled above)
  keys.addEventListener('click', (e) => { const k = e.target.closest('[data-ch]'); if (k && e.detail === 0) type(k.dataset.ch); });
  press($('key-space'), () => type(' ')); press($('key-erase'), erase); press($('key-cast'), cast);
  for (const [id, fn] of [['key-space', () => type(' ')], ['key-erase', erase], ['key-cast', cast]]) $(id).addEventListener('click', (e) => { if (e.detail === 0) fn(); });
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!$('panel').hidden) { if (e.key === 'Escape') closePanel(); return; }
    if (phase === 'intro') { if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); hurry(); } return; }
    if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ') && !e.target.closest('.dock')) return;
    if (e.key === 'Enter') { e.preventDefault(); cast(); }
    else if (e.key === 'Backspace') { e.preventDefault(); erase(); }
    else if (e.key === ' ') { e.preventDefault(); type(' '); }
    else if (e.key.length === 1 && HEB.includes(e.key)) { e.preventDefault(); type(e.key); }
    else if (CODE[e.code] && e.key.length === 1) { e.preventDefault(); type(CODE[e.code]); }
  });
}

// ---------- suggestions ----------
let hints = [];
function renderChips() {
  const box = $('chips');
  if (!box) return;
  box.textContent = '';
  const picks = [];
  const fresh = (list) => list.filter((w) => !found.has(w) && !picks.includes(w));
  while (hints.length && picks.length < 2) picks.push(hints.shift());
  const pool = fresh(STARTERS), magic = fresh(MAGIC);
  if (casts === 0 && !history.length) picks.push(...['כלב', 'ים', 'לילה'].filter((w) => !picks.includes(w)));
  while (picks.length < 3) {
    const useMagic = casts >= 3 && magic.length && rnd() < 0.34;
    const list = useMagic ? magic : pool.length ? pool : MAGIC;
    const w = list.splice(Math.floor(rnd() * list.length), 1)[0];
    if (!w) break;
    if (!picks.includes(w)) picks.push(w);
  }
  for (const w of picks.slice(0, 3)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip' + (w === 'אני' ? ' hint' : ''); b.textContent = w === 'אני' ? 'אני + השם שלכם' : w;
    b.addEventListener('click', () => { if (w === 'אני') autoType('אני ', null); else autoType(w); });
    box.appendChild(b);
  }
  if (!playerName && casts >= 2 && !picks.includes('אני') && box.children.length === 3 && rnd() < 0.5) {
    const b = box.lastChild; b.className = 'chip hint'; b.textContent = 'אני + השם שלכם';
    b.replaceWith(b.cloneNode(true)); box.lastChild.addEventListener('click', () => autoType('אני ', null));
  }
}
function nudgeChips() { const box = $('chips'); box.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 300 }); }

// ---------- the opening ----------
const intro = { items: [], t: 0, total: 0, shown: 0, hold: 0 };
function layIntro(lines) {
  const size = geo.ts, g = { right: geo.right, left: geo.left, size };
  const flows = lines.map((text) => flow(text, g, { x: g.right, line: 0 }));
  const need = flows.reduce((n, f) => n + f.line + 1, 0);
  const room = Math.floor((geo.H - (CARD ? 0 : 20) - geo.top - geo.rule) / geo.rule);
  const gap = need + lines.length - 1 <= room ? 1 : 0;
  // which ruled line each row sits on, counted up from the ground line
  const first = Math.ceil((geo.ground - geo.top - geo.rule * 0.6) / geo.rule) - Math.max(0, Math.floor((room - need - gap * (lines.length - 1)) / 2));
  let row = 0, at = 0.5;
  intro.items = [];
  flows.forEach((f) => {
    for (const it of f.items) {
      intro.items.push({ ...it, y: geo.ground - (first - row - it.line) * geo.rule - geo.rule * 0.17 - BASELINE_DROP * size, at, size });
      at += 0.042;
    }
    row += f.line + 1 + gap; at += 0.62;
  });
  intro.total = at; intro.t = calm ? at : 0; intro.shown = 0; intro.hold = 0;
}
function hurry() {
  if (phase !== 'intro') return;
  wake();
  if (intro.t < intro.total) intro.t = intro.total; else beginReveal();
}
const reveal = { t: 0, queue: [], from: null, done: false };
function beginReveal() {
  phase = 'reveal'; reveal.t = 0; reveal.done = false;
  $('skip').hidden = true;
  const from = intro.items.map((it) => ({ x: it.x, y: it.y, g: it.g }));
  from.byGlyph = new Map();
  for (const s of from) (from.byGlyph.get(s.g) || from.byGlyph.set(s.g, []).get(s.g)).push(s);
  reveal.from = from;
  const saved = history.slice(-48);
  history = [];
  const list = saved.length ? saved.map((text) => ({ text, mine: false })) : MINE.map((text) => ({ text, mine: true }));
  const pace = list.length > 6 ? 2.6 / list.length : 0.55;
  reveal.queue = list.map((item, i) => ({ ...item, at: 0.35 + i * pace }));
  reveal.end = 0.35 + list.length * pace + 1.5;
  sfx.dawn();
  store.set('abra-seen', true);
}
function stepReveal(dt) {
  reveal.t += dt;
  world.env.ruleAll = 1 - smooth(reveal.t / 1.6);
  while (reveal.queue.length && reveal.queue[0].at <= reveal.t) {
    const item = reveal.queue.shift();
    castText(item.text, { mine: item.mine, from: reveal.from, quiet: true });
    sfx.tune(item.text, 0.05);
  }
  if (!reveal.done && reveal.t > reveal.end) { reveal.done = true; startPlay(); }
}
function startPlay() {
  phase = 'play'; world.env.ruleAll = 0;
  dock.removeAttribute('data-off'); bar.hidden = false;
  pen.ghost = history.length > MINE.length ? 'כתבו עוד מילה' : 'עכשיו אתם. כתבו מילה';
  remember(); renderChips();
}
function drawIntro() {
  const fade = phase === 'reveal' ? reveal.t : 0;
  let shown = 0;
  intro.items.forEach((it, i) => {
    if (it.at > intro.t) return;
    shown++;
    const a = phase === 'reveal' ? clamp(1 - (fade * 1.4 - (i / intro.items.length) * 0.9), 0, 1) : 1;
    if (a <= 0) return;
    const pop = clamp((intro.t - it.at) / 0.14, 0, 1);
    batch.push(it.x, it.y - (1 - a) * 22, it.size * (0.6 + 0.4 * pop), 0, it.g, INK[0], INK[1], INK[2], a);
  });
  if (shown > intro.shown) { if (shown % 2 === 0) sfx.scratch(); intro.shown = shown; }
  if (phase === 'intro' && intro.t < intro.total) {     // the pen tip, writing
    const it = intro.items[Math.min(intro.items.length - 1, shown)];
    if (it) batch.push(it.x - it.size * 0.3, it.y + it.size * 0.1, it.size * 1.2, 0.05, glyphOf('❘'), FRESH[0], FRESH[1], FRESH[2], 0.9);
  }
}

// ---------- the ending: the world folds back into the words it was ----------
const story = { items: [], t: 0, blob: null, pool: null, slots: [] };
function listWords() {
  const uniq = [...new Set(history.map((h) => h.replace(/\.$/, '')))];
  const shown = uniq.slice(-12);
  const extra = uniq.length - shown.length;
  if (!shown.length) return '';
  let text = shown.length > 1 ? `${shown.slice(0, -1).join(', ')} ו${shown[shown.length - 1]}` : shown[0];
  if (extra > 0) text += ` ועוד ${extra} מילים`;
  return text;
}
function snapshot() { render(); try { canvas.toBlob((b) => { story.blob = b; }, 'image/png'); } catch { story.blob = null; } }
function layStory(lines) {
  const size = geo.ts, g = { right: geo.right, left: geo.left, size };
  const flows = lines.map((text) => flow(text, g, { x: g.right, line: 0 }));
  const need = flows.reduce((n, f) => n + f.line + 1, 0);
  const room = Math.floor((geo.H - 90 - geo.top - geo.rule) / geo.rule);
  const first = Math.ceil((geo.ground - geo.top - geo.rule * 0.6) / geo.rule) - Math.max(0, Math.floor((room - need) / 2));
  const slots = [];
  let row = 0;
  for (const f of flows) {
    for (const it of f.items) slots.push({ g: it.g, x: it.x, y: geo.ground - (first - row - it.line) * geo.rule - geo.rule * 0.17 - BASELINE_DROP * size, size });
    row += f.line + 1;
  }
  return slots;
}
function fold(lines, pool) {
  const slots = layStory(lines);
  const byGlyph = new Map();
  for (const p of pool) (byGlyph.get(p.g) || byGlyph.set(p.g, []).get(p.g)).push(p);
  const used = new Set();
  story.items = slots.map((slot, i) => {
    const same = byGlyph.get(slot.g);
    let p = same && same.length ? same.splice(Math.floor(rnd() * same.length), 1)[0] : null;
    if (!p && pool.length) p = pool[Math.floor(rnd() * pool.length)];
    if (!p) p = { x: slot.x + (rnd() - 0.5) * 300, y: geo.H + 30, size: 10, r: INK[0], gc: INK[1], b: INK[2] };
    used.add(p);
    return { from: p, to: slot, delay: 0.25 + i * 0.016 + rnd() * 0.25 };
  });
  let spare = 0;
  for (const p of pool) {
    if (used.has(p) || spare++ > 520) continue;
    world.motes.spawn(p.x, p.y, p.g, [p.r, p.gc, p.b], { vx: (rnd() - 0.5) * 70, vy: -30 - rnd() * 90, size: p.size, life: 1 + rnd() * 1.6, drag: 0.5, vr: (rnd() - 0.5) * 2 });
  }
  story.slots = slots; story.t = 0;
}
function startStory() {
  if (phase !== 'play') return;
  clearTimeout(typingTimer); dock.classList.remove('busy');
  snapshot();
  const words = listWords();
  const pool = world.harvest();
  for (const it of pen.fixed) pool.push({ x: it.x, y: lineY(it.line), g: it.g, size: geo.ts, r: it.color[0], gc: it.color[1], b: it.color[2] });
  pen.fixed = []; pen.runs = []; pen.typing = ''; pen.typed = []; pen.cur = { x: geo.right, line: 0 }; pen.end = pen.cur;
  const lines = ['היה היה דף ריק.'];
  if (words) lines.push('ואז נכתבו בו המילים:', `${words}.`, 'וכל מילה קמה לחיים.'); else lines.push('הוא עוד מחכה למילה הראשונה.');
  if (playerName) lines.push(`נכתב על ידי ${playerName}.`);
  story.lines = lines;
  fold(lines, pool);
  phase = 'story';
  dock.setAttribute('data-off', ''); bar.hidden = true;
  sfx.harp(false);
  setTimeout(() => { if (phase === 'story') { $('ending').hidden = false; if (!playerName && words) askName(); } }, 2600);
  announce(lines.join(' '));
}
function askName() {                  // an unsigned page asks who wrote it
  phase = 'sign';
  $('ending').hidden = true;
  dock.removeAttribute('data-off');
  $('chips').textContent = '';
  $('key-cast').textContent = 'זה אני';
  pen.ghost = 'מי כתב את העולם הזה';
  pen.cur = { x: geo.right, line: 0 }; pen.scroll = 0; layTyping();
}
function sign() {
  const name = finalize(clean(pen.typing));
  $('key-cast').textContent = 'אברא כדברא';
  dock.setAttribute('data-off', '');
  const typed = pen.typed.map((it) => ({ x: it.x, y: lineY(it.line), g: it.g, size: geo.ts, r: FRESH[0], gc: FRESH[1], b: FRESH[2] }));
  pen.typing = ''; pen.typed = []; pen.ghost = '';
  phase = 'story';
  if (name) {              // the story makes room, and the name is written under it
    playerName = name; store.set('abra-name', name);
    const settled = story.items.map((s) => ({ x: s.to.x, y: s.to.y, g: s.to.g, size: s.to.size, r: INK[0], gc: INK[1], b: INK[2] }));
    story.lines.push(`נכתב על ידי ${name}.`);
    const slots = layStory(story.lines);
    story.items = slots.map((slot, i) => {
      if (i < settled.length) return { from: settled[i], to: slot, delay: 0 };
      const k = typed.findIndex((p) => p.g === slot.g);
      const p = k >= 0 ? typed.splice(k, 1)[0] : { x: slot.x, y: slot.y + 40, size: 4, r: FRESH[0], gc: FRESH[1], b: FRESH[2] };
      return { from: p, to: slot, delay: 0.2 + (i - settled.length) * 0.05 };
    });
    story.t = 0;
    sfx.cast(name);
  }
  setTimeout(() => { if (phase === 'story') $('ending').hidden = false; }, name ? 1500 : 100);
}
function drawStory() {
  for (const s of story.items) {
    const t = smooth((story.t - s.delay) / 1.25), p = s.from, to = s.to;
    const arc = Math.sin(t * Math.PI) * -46;
    batch.push(lerp(p.x, to.x, t), lerp(p.y, to.y, t) + arc, lerp(p.size, to.size, t), (1 - t) * 0.6, to.g, lerp(p.r, INK[0], t), lerp(p.gc, INK[1], t), lerp(p.b, INK[2], t), 1);
  }
}
function leaveStory(fresh) {
  $('ending').hidden = true;
  const from = story.items.map((s) => ({ x: s.to.x, y: s.to.y, g: s.to.g }));
  from.byGlyph = new Map();
  for (const s of from) (from.byGlyph.get(s.g) || from.byGlyph.set(s.g, []).get(s.g)).push(s);
  story.items = [];
  const saved = fresh ? [] : history.slice();
  history = [];
  phase = 'reveal'; reveal.t = 0.01; reveal.done = false; reveal.from = from;
  const pace = saved.length > 6 ? 2.4 / saved.length : 0.4;
  reveal.queue = saved.map((text, i) => ({ text, mine: false, at: 0.2 + i * pace }));
  reveal.end = 0.2 + saved.length * pace + 0.9;
  if (fresh) { remember(); casts = 0; }
  sfx.harp(true);
}
function saveImage() {
  const done = (blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'abra-kadabra.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  if (phase === 'story' && story.blob) done(story.blob);
  else { render(); canvas.toBlob(done, 'image/png'); }
}

// ---------- panels ----------
function openPanel(title, build) {
  $('panel-title').textContent = title;
  const body = $('panel-body'); body.textContent = '';
  build(body);
  $('panel').hidden = false;
  $('panel-close').focus();
}
function closePanel() { $('panel').hidden = true; }
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
function openBook() {
  openPanel('המילים שלי', (body) => {
    body.appendChild(el('p', '', found.size ? `כבר הקמתם לחיים ${found.size} מילים. הדף מכיר יותר מ־${Math.floor((wordCount + SPECIALS.length) / 50) * 50}, ויש בו גם מילים סודיות.` : 'עוד לא כתבתם מילה. כל מילה שתקום לחיים תישמר כאן.'));
    const box = el('div', 'words');
    for (const w of [...found].reverse()) {
      const b = el('button', 'chip', w); b.type = 'button';
      b.addEventListener('click', () => { closePanel(); if (phase === 'play') autoType(w); });
      box.appendChild(b);
    }
    body.appendChild(box);
    if (found.size) body.appendChild(el('p', 'small', 'נגיעה במילה כותבת אותה שוב.'));
  });
}
function openHelp() {
  openPanel('אברא כדברא', (body) => {
    body.appendChild(el('p', '', 'כותבים מילה בשורה, לוחצים ״אברא כדברא״, והמילה קמה לחיים: עשויה כולה מהאותיות של עצמה.'));
    const ul = el('ul');
    for (const t of [
      'אפשר לכתוב כמה מילים יחד: כלב כחול ענק, שלושה פרפרים.',
      'אפשר לגעת בכל דבר, להרים אותו ולהניח במקום אחר.',
      'יש מילים שמשנות את כל העולם: לילה, גשם, רוח, לרקוד. ויש גם מילים סודיות.',
      'מילה שהדף לא מכיר, למשל השם שלכם, תקום ותלך בעצמה. כתבו ״אני״ ואחריה את השם.',
      '״לא״ מוחקת את הדבר האחרון. ״דף חדש״ מתחיל מהתחלה. ״סוף״ הופך את העולם לסיפור.',
    ]) ul.appendChild(el('li', '', t));
    body.appendChild(ul);
    const row = el('div', 'row');
    const mk = (label, fn) => { const b = el('button', 'pill', label); b.type = 'button'; b.addEventListener('click', () => { closePanel(); fn(); }); row.appendChild(b); };
    mk('לשמור תמונה', saveImage);
    mk('דף חדש', () => { if (phase === 'play') castText('דף חדש'); });
    mk('לראות שוב את ההתחלה', () => { store.set('abra-seen', false); location.reload(); });
    body.appendChild(row);
    body.appendChild(el('p', 'small', 'יש אומרים ש״אברא כדברא״ באה מארמית: ״אברא כמו שאדבר״. בדף הזה זה באמת עובד כך.'));
    body.appendChild(el('p', 'small', 'את המשחק הזה המציא Claude, בינה מלאכותית, כשביקשו ממנו להמציא משהו משלו. הצורות שמתחת לאותיות: Twemoji (CC-BY 4.0). הכתב: Playpen Sans Hebrew ו־Fredoka (OFL).'));
  });
}

// ---------- world -> sound and hints ----------
function listen() {
  world.on((name, d) => {
    if (SIM) return;
    if (name === 'special') {
      const id = d.id;
      if (id === 'sun' || id === 'day' || id === 'morning') sfx.dawn();
      else if (id === 'night' || id === 'goodnight' || id === 'moon' || id === 'dusk') sfx.dusk();
      else if (id === 'abra' || id === 'stars' || id === 'star' || id === 'love') sfx.sparkle();
      else if (id === 'music' || id === 'dance') sfx.song(history.length ? history : ['מוזיקה']);
      else if (id === 'birthday') sfx.birthday();
      else if (id === 'laugh') sfx.laugh();
      else if (id === 'rainbow') sfx.harp(true);
      else if (id === 'hush') sfx.hush();
      else if (id === 'no') d.undone ? sfx.erase() : sfx.nope();
    } else if (name === 'eat') sfx.munch();
    else if (name === 'kick' || name === 'drop') sfx.thud();
    else if (name === 'poke') sfx.tune(d.word, 0.06);
    else if (name === 'thunder') sfx.thunder();
    else if (name === 'boom' || name === 'strike') sfx.boom();
    else if (name === 'rainbow') sfx.harp(true);
    else if (name === 'nothing') sfx.nope();
    else if (name === 'hint') { if (!hints.includes(d) && !found.has(d)) { hints.push(d); renderChips(); } }
    else if (name === 'ui') { if (d === 'help') openHelp(); else if (d === 'bye') setTimeout(startStory, 500); }
  });
}

// ---------- the loop ----------
function step(dt) {
  time += dt;
  if (phase === 'intro') {
    if (intro.t < intro.total) intro.t += dt;
    else { intro.hold += dt; if (intro.hold > 1.7) beginReveal(); }
    world.env.ruleAll = 1;
  } else if (phase === 'reveal') stepReveal(dt);
  else if (phase === 'story' || phase === 'sign') { story.t += dt; world.env.ruleAll = Math.min(1, world.env.ruleAll + dt * 1.2); }
  if (geo) {      // the lines scroll up as the page fills
    const target = Math.max(0, pen.end.line - (geo.nLines - 1));
    pen.scroll = Math.abs(target - pen.scroll) < 0.004 ? target : lerp(pen.scroll, target, Math.min(1, dt * 9));
  }
  world.update(dt);
  const dark = world.night > 0.5;
  if (dark !== isDark) { isDark = dark; document.body.classList.toggle('night', dark); }
  if (!SIM) sfx.weather({ rain: world.rain.level, wind: world.wind, sea: world.sea.level, night: world.night });
}
function render() {
  batch.clear();
  if (phase === 'intro' || phase === 'reveal') drawIntro();
  if (phase !== 'intro') drawPen();
  world.draw(batch);
  if (phase === 'story' || phase === 'sign') drawStory();
  renderer.draw(batch, world.env);
}
let last = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  step(dt); render();
  requestAnimationFrame(frame);
}

// ---------- start ----------
async function start() {
  const [fontsOk, sprites] = await Promise.all([loadFonts(), loadSprites()]);
  renderer = createRenderer(canvas, buildAtlas());
  if (!renderer) { $('load-error').hidden = false; return; }
  world = new World({ sprites, rnd, mobile, calm });
  batch = new Batch(mobile ? 16000 : 30000);
  buildKeys(); listen();
  measure();
  pen.cur = { x: geo.right, line: 0 }; pen.end = pen.cur;
  let resizeTimer = 0;
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { measure(); relayPen(); if (phase === 'intro') layIntro(intro.lines); }, 80); });

  const point = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', (e) => {
    wake();
    if (phase === 'intro') { hurry(); return; }
    if (phase !== 'play') return;
    canvas.setPointerCapture(e.pointerId);
    world.pointerDown(...point(e));
  });
  canvas.addEventListener('pointermove', (e) => { if (phase === 'play') world.pointerMove(...point(e)); });
  const up = (e) => { if (phase === 'play') world.pointerUp(...point(e)); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  $('btn-sound').setAttribute('aria-pressed', String(isMuted()));
  $('btn-sound').addEventListener('click', () => { wake(); $('btn-sound').setAttribute('aria-pressed', String(toggleMute())); });
  $('btn-book').addEventListener('click', openBook);
  $('btn-help').addEventListener('click', openHelp);
  $('btn-done').addEventListener('click', startStory);
  $('panel-close').addEventListener('click', closePanel);
  $('panel').addEventListener('pointerdown', (e) => { if (e.target === $('panel')) closePanel(); });
  $('skip').addEventListener('click', () => { wake(); intro.t = intro.total; beginReveal(); });
  $('end-save').addEventListener('click', saveImage);
  $('end-back').addEventListener('click', () => leaveStory(false));
  $('end-new').addEventListener('click', () => leaveStory(true));
  $('found-count').textContent = String(found.size);

  if (SIM || CARD) {
    phase = 'play'; history = SIM && !params.has('keep') ? [] : history;
    if (!CARD) { dock.removeAttribute('data-off'); bar.hidden = false; measure(); pen.cur = { x: geo.right, line: 0 }; }
    else { dock.hidden = true; document.querySelector('.game-home')?.remove(); }
    for (const text of history.splice(0)) { castText(text, { replay: true }); history.push(text); }
    renderChips();
  } else {
    intro.lines = seen ? ['שלום שוב.', history.length ? 'הדף שלכם חיכה לכם:' : 'הנה דף חדש:'] : INTRO_FIRST;
    layIntro(intro.lines);
    phase = 'intro';
    $('skip').hidden = false;
  }
  window.__abra = {
    ready: true, fontsOk,
    step(dt = 1 / 60, n = 1) { for (let i = 0; i < n; i++) step(dt); },
    render,
    type(text) { for (const ch of text) type(ch); },
    cast(text) { if (text != null) { pen.typing = text; layTyping(); } cast(); },
    parse,
    state: () => ({ phase, time, typing: pen.typing, written: pen.runs.map((r) => r.text), history: history.slice(), found: [...found], name: playerName,
      ents: world.describe(), glyphs: world.glyphCount, drawn: batch.n, night: world.night, rain: world.rain.level, sea: world.sea.level, motes: world.motes.alive, layouts: world.layouts.size }),
    world: () => world, geo: () => geo, startStory, leaveStory, byWord,
  };
  if (!SIM) requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
  else render();
}
start().catch((err) => { console.error(err); $('load-error').hidden = false; });
