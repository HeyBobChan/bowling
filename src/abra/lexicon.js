// What a child writes -> what the page should do. Pure functions and data, no DOM,
// so the spelling rules can be tested on their own (tests/unit/abra-lexicon.mjs).
import { WORDS } from './words-data.js';

const FINAL_TO_BASE = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const BASE_TO_FINAL = { 'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ' };

// Lookups ignore final forms entirely; a child who writes שלומ still means שלום.
export const skeleton = (s) => s.replace(/[ךםןףץ]/g, (c) => FINAL_TO_BASE[c]);
// What we write back on the line: final letters where Hebrew wants them.
export const finalize = (s) => s.split(' ').map((w) => {
  const base = skeleton(w);
  if (!base) return base;
  const last = base[base.length - 1];
  return base.length > 1 && BASE_TO_FINAL[last] ? base.slice(0, -1) + BASE_TO_FINAL[last] : base;
}).join(' ');

// Spelling is still new at seven. Two forgiving keys:
//  - "ktiv": the same word with or without its helper vav / yod (ציפור, צפור)
//  - "sound": letters that sound alike (ט/ת, ק/כ/ח, ע/א, ס/ש)
const ktivKey = (s) => s[0] + s.slice(1).replace(/[וי]/g, '');
const SOUND = { 'ט': 'ת', 'ק': 'כ', 'ח': 'כ', 'ע': 'א', 'ש': 'ס' };
const soundKey = (s) => ktivKey(s).replace(/[טקחעש]/g, (c) => SOUND[c]);

export const COLORS = [
  { id: 'red', rgb: [214, 52, 44], forms: 'אדום אדומה אדומים אדומות' },
  { id: 'blue', rgb: [43, 75, 215], forms: 'כחול כחולה כחולים כחולות' },
  { id: 'yellow', rgb: [236, 184, 24], forms: 'צהוב צהובה צהובים צהובות' },
  { id: 'green', rgb: [47, 138, 37], forms: 'ירוק ירוקה ירוקים ירוקות' },
  { id: 'orange', rgb: [236, 126, 28], forms: 'כתום כתומה כתומים כתומות' },
  { id: 'purple', rgb: [122, 62, 184], forms: 'סגול סגולה סגולים סגולות' },
  { id: 'pink', rgb: [236, 100, 160], forms: 'ורוד ורודה ורודים ורודות' },
  { id: 'brown', rgb: [134, 84, 48], forms: 'חום חומה חומים חומות' },
  { id: 'black', rgb: [44, 42, 58], forms: 'שחור שחורה שחורים שחורות' },
  { id: 'white', rgb: [206, 216, 236], forms: 'לבן לבנה לבנים לבנות' },
  { id: 'gray', rgb: [128, 132, 146], forms: 'אפור אפורה אפורים אפורות' },
  { id: 'sky', rgb: [80, 170, 232], forms: 'תכלת' },
  { id: 'gold', rgb: [214, 164, 30], forms: 'זהב זהוב זהובה זהובים זהובות מוזהב' },
  { id: 'silver', rgb: [160, 170, 186], forms: 'כסף כסוף כסופה כסופים כסופות' },
  { id: 'rainbow', rainbow: true, forms: 'צבעוני צבעונית צבעוניים צבעוניות' },
];
const SIZES = [
  { scale: 1.55, forms: 'גדול גדולה גדולים גדולות' },
  { scale: 2.2, forms: 'ענק ענקי ענקית ענקיים ענקים' },
  { scale: 0.62, forms: 'קטן קטנה קטנים קטנות' },
  { scale: 0.42, forms: 'קטנטן קטנטנה קטנטנים קטנטנות זעיר זעירה' },
];
const NUMBERS = [
  [1, 'אחד אחת'], [2, 'שניים שתיים שני שתי זוג'], [3, 'שלוש שלושה'], [4, 'ארבע ארבעה'], [5, 'חמש חמישה'],
  [6, 'שש שישה'], [7, 'שבע שבעה'], [8, 'שמונה'], [9, 'תשע תשעה'], [10, 'עשר עשרה'],
  [8, 'הרבה המון'], [14, 'מאה'], [18, 'אלף'], [24, 'מיליון'],
];
// Words the page answers itself. `thing: true` ones take numbers, colours and sizes like nouns.
export const SPECIALS = [
  { id: 'sun', forms: 'שמש' },
  { id: 'moon', forms: 'ירח' },
  { id: 'star', forms: 'כוכב', thing: true },
  { id: 'stars', forms: 'כוכבים' },          // a whole sky of them, not three
  { id: 'night', forms: 'לילה חושך' },
  { id: 'goodnight', forms: 'לילה טוב|ליל מנוחה' },
  { id: 'day', forms: 'יום בוקר צהריים אור' },
  { id: 'morning', forms: 'בוקר טוב|בוקר אור' },
  { id: 'dusk', forms: 'ערב שקיעה' },
  { id: 'sky', forms: 'שמיים שמים' },
  { id: 'cloud', forms: 'ענן +עננים', thing: true },
  { id: 'rain', forms: 'גשם מבול' },
  { id: 'snow', forms: 'שלג' },
  { id: 'wind', forms: 'רוח' },
  { id: 'storm', forms: 'סערה' },
  { id: 'lightning', forms: 'ברק רעם' },
  { id: 'rainbow', forms: 'קשת|קשת בענן' },
  { id: 'sea', forms: 'ים מים אגם נהר גלים גל שלולית' },
  { id: 'mountain', forms: 'הר הרים גבעה גבעות רכס' },
  { id: 'grass', forms: 'דשא' },
  { id: 'soil', forms: 'אדמה' },
  { id: 'fire', forms: 'אש מדורה להבה', thing: true },
  { id: 'love', forms: 'לב אהבה +לבבות', thing: true },
  { id: 'music', forms: 'מוזיקה שיר שירים מנגינה לשיר שירו' },
  { id: 'monster', forms: 'מפלצת +מפלצות', thing: true },
  { id: 'bowling', forms: 'באולינג' },
  { id: 'rocrok', forms: 'רוקרוק', thing: true },
  { id: 'goal', forms: 'פנדל גול' },
  { id: 'claude', forms: 'קלוד' },
  { id: 'me', forms: 'אני' },
  { id: 'hello', forms: 'שלום היי הי אהלן' },
  { id: 'thanks', forms: 'תודה|תודה רבה' },
  { id: 'please', forms: 'בבקשה' },
  { id: 'sorry', forms: 'סליחה' },
  { id: 'bye', forms: 'ביי להתראות סוף' },
  { id: 'yes', forms: 'כן' },
  { id: 'no', forms: 'לא מחק' },
  { id: 'clear', forms: 'נקה|דף חדש' },
  { id: 'boom', forms: 'בום פיצוץ' },
  { id: 'laugh', forms: 'חח חחח חחחח חחחחח מצחיק לצחוק צחוק' },
  { id: 'hush', forms: 'שקט ששש' },
  { id: 'help', forms: 'עזרה' },
  { id: 'more', forms: 'עוד' },
  { id: 'birthday', forms: 'יום הולדת|מזל טוב|יומולדת' },
  { id: 'abra', forms: 'אברא כדברא|אברקדברא|אברה קדברה|אברא קדברא|קסם' },
  { id: 'happy', forms: 'שמח שמחה שמחים' },
  { id: 'sad', forms: 'עצוב עצובה' },
  { id: 'jump', forms: 'לקפוץ קפוץ קפצי קפצו קפיצה קופצים קופץ קופצת' },
  { id: 'dance', forms: 'לרקוד רקדו ריקוד רוקדים רוקד רוקדת' },
  { id: 'sleep', forms: 'לישון שינה ישנים ישן ישנה' },
  { id: 'flyup', forms: 'לעוף עופו עפים עף עפה' },
  { id: 'run', forms: 'לרוץ רוצו ריצה רצים רץ רצה' },
  { id: 'eat', forms: 'לאכול אוכלים אוכלת' },
];
// Forms are separated by spaces, or by `|` when a form is itself several words. A leading `+` marks a plural.
const formsOf = (s) => (s.includes('|') ? s.split('|') : s.split(' '));
// Names that only look like plurals.
const NOT_PLURAL = new Set(['חיימ', 'מרימ', 'אפרימ', 'מימ', 'שמימ', 'פנימ']);

const exact = new Map();     // skeleton -> { type, ... , form }
const ktiv = new Map();
const sound = new Map();
let maxWords = 1;
function add(form, item, { fuzzy = true } = {}) {
  const key = skeleton(form);
  if (exact.has(key)) return false;
  const rec = { ...item, form };
  exact.set(key, rec);
  maxWords = Math.max(maxWords, form.split(' ').length);
  if (fuzzy && !key.includes(' ')) {
    const k = ktivKey(key), s = soundKey(key);
    if (k.length >= 3 && !ktiv.has(k)) ktiv.set(k, rec);
    if (s.length >= 3 && key.length >= 4 && !sound.has(s)) sound.set(s, rec);
  }
  return true;
}
// Order matters: the page's own words first, then modifiers, then the big dictionary.
for (const sp of SPECIALS) for (const f of formsOf(sp.forms)) add(f.replace('+', ''), { type: 'special', special: sp, plural: f.startsWith('+') });
for (const c of COLORS) for (const f of c.forms.split(' ')) add(f, { type: 'color', color: c });
for (const z of SIZES) for (const f of z.forms.split(' ')) add(f, { type: 'size', scale: z.scale });
for (const [n, forms] of NUMBERS) for (const f of forms.split(' ')) add(f, { type: 'num', n }, { fuzzy: false });
export const collisions = [];
for (const entry of WORDS) {
  if (!add(entry.w, { type: 'noun', entry })) collisions.push(entry.w);
  for (const f of entry.alt || []) if (!add(f, { type: 'noun', entry })) collisions.push(f);
  if (entry.pl && !add(entry.pl, { type: 'noun', entry, plural: true })) collisions.push(entry.pl);
}
export const byWord = new Map(WORDS.map((e) => [e.w, e]));
// The word a special goes by in the child's own list of discoveries.
export const specialName = (id) => formsOf(SPECIALS.find((s) => s.id === id).forms)[0].replace('+', '');
export const wordCount = WORDS.length;

function lookup(key) {
  let hit = exact.get(key);
  if (hit) return { ...hit, shown: hit.form };
  if (key.includes(' ')) return null;
  // ה הידיעה, ו החיבור
  for (const p of ['וה', 'ה', 'ו']) {
    if (key.startsWith(p) && key.length - p.length >= 2) {
      hit = exact.get(key.slice(p.length));
      if (hit && hit.type !== 'num') return { ...hit, shown: null };
    }
  }
  // plurals the dictionary did not spell out
  const stems = [];
  if (NOT_PLURAL.has(key)) return null;
  if (key.endsWith('ימ') && key.length > 3) stems.push(key.slice(0, -2), key.slice(0, -2) + 'ה');
  if (key.endsWith('ות') && key.length > 3) stems.push(key.slice(0, -2), key.slice(0, -2) + 'ה', key.slice(0, -2) + 'ת');
  for (const s of stems) {
    hit = exact.get(s);
    if (hit && (hit.type === 'noun' || hit.special?.thing) && !hit.plural) return { ...hit, plural: true, shown: null };
  }
  const k = ktivKey(key);
  if (k.length >= 3) {
    hit = ktiv.get(k);
    if (hit) return { ...hit, shown: hit.form, corrected: true };
    if (key.length >= 4) {
      hit = sound.get(soundKey(key));
      if (hit) return { ...hit, shown: hit.form, corrected: true };
    }
  }
  return null;
}

const HEBREW_ONLY = /[^א-ת ]/g;
export const clean = (text) => text.replace(HEBREW_ONLY, ' ').replace(/\s+/g, ' ').trim();

/**
 * parse('שלושה כלבים כחולים') ->
 *   { shown: 'שלושה כלבים כחולים', actions: [{ kind: 'noun', entry, word: 'כלב', count: 3, color, ... }] }
 * Action kinds: noun | special | name | modify
 */
export function parse(text) {
  const tokens = clean(text).split(' ').filter(Boolean).map(skeleton);
  const actions = [], shown = [];
  let pending = {}, last = null, i = 0, iAm = false;
  const take = (target, mod) => Object.assign(target, mod);
  while (i < tokens.length) {
    let hit = null, used = 1;
    for (let len = Math.min(maxWords, tokens.length - i); len >= 1 && !hit; len--) {
      hit = lookup(tokens.slice(i, i + len).join(' '));
      if (hit) used = len;
    }
    const typed = finalize(tokens.slice(i, i + used).join(' '));
    i += used;
    if (iAm) {            // "אני ___": whatever follows is who you are, even if it is also a word
      iAm = false;
      const act = { kind: 'name', text: typed, me: true };
      actions.push(act); shown.push(typed); last = act;
      continue;
    }
    if (!hit) {
      const act = { kind: 'name', text: typed, ...pending };
      pending = {}; actions.push(act); shown.push(typed); last = act;
      continue;
    }
    shown.push(hit.shown || typed);
    if (hit.type === 'num') { pending.count = hit.n; continue; }
    if (hit.type === 'color') { take(last || pending, hit.color.rainbow ? { rainbow: true } : { tint: hit.color.rgb, colorId: hit.color.id }); continue; }
    if (hit.type === 'size') { const t = last || pending; t.scale = (t.scale || 1) * hit.scale; continue; }
    if (hit.type === 'noun') {
      const act = { kind: 'noun', entry: hit.entry, word: hit.entry.w, written: hit.shown || typed, plural: !!hit.plural, ...pending };
      if (act.count == null) act.count = hit.plural ? 3 : 1;
      pending = {}; actions.push(act); last = act;
      continue;
    }
    // specials
    const sp = hit.special;
    if (sp.id === 'me' && i < tokens.length) { iAm = true; continue; }
    const act = { kind: 'special', id: sp.id, written: hit.shown || typed, plural: !!hit.plural, ...pending };
    if (sp.thing && act.count == null) act.count = hit.plural ? 3 : 1;
    pending = {}; last = sp.thing ? act : null;
    actions.push(act);
  }
  if (Object.keys(pending).length) actions.push({ kind: 'modify', ...pending });
  return { shown: shown.join(' '), actions };
}

// Every word a child could discover: the dictionary plus the page's own magic words.
export const discoverable = WORDS.length + SPECIALS.length;
