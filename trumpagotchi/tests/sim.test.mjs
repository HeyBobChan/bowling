// Rules and balance of the simulation, run in plain Node: `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = globalThis;
await import('../js/content.js');
await import('../js/game.js');
const { game: G, content: C } = globalThis.TG;

const HOUR = 3600e3, DAY = 24 * HOUR;
const at = (y, m, d, h = 9, min = 0) => new Date(y, m - 1, d, h, min).getTime();
function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function hatched(t = at(2026, 3, 2)) {
  G.rng = seeded(7);
  const s = G.newState(t);
  G.catchUp(s, t);
  for (let i = 0; i < G.EGG_TAPS; i++) G.tapEgg(s, t);
  return s;
}
const types = (events) => events.map((e) => e.type);

test('levels: the curve only goes up and stages map to levels', () => {
  for (let L = 1; L < C.MAX_LEVEL; L++) assert.ok(G.cumXp(L + 1) > G.cumXp(L));
  assert.equal(G.levelFor(0), 1);
  assert.equal(G.levelFor(G.cumXp(5) - 1), 4);
  assert.equal(G.levelFor(G.cumXp(5)), 5);
  assert.equal(G.levelFor(1e12), C.MAX_LEVEL);
  assert.equal(G.stageFor(1).id, 'regular');
  assert.equal(G.stageFor(44).id, 'nominee');
  assert.equal(G.stageFor(45).id, 'p45');
  assert.equal(G.stageFor(47).id, 'p47');
  assert.equal(G.stageFor(50).id, 'gold');
  assert.deepEqual([1, 5, 17, 32, 45].map(C.tierForLevel), [0, 1, 2, 3, 4]);
});

test('the egg hatches after enough taps and comes with a small loan', () => {
  const t = at(2026, 3, 2);
  const s = G.newState(t);
  G.catchUp(s, t);
  for (let i = 0; i < G.EGG_TAPS - 1; i++) assert.equal(G.tapEgg(s, t).hatched, undefined);
  assert.equal(s.hatched, false);
  const r = G.tapEgg(s, t);
  assert.equal(r.hatched, true);
  assert.equal(s.cash, 1e6);
  assert.ok(s.ach.hatched);
  assert.equal(G.level(s), 1);
  assert.equal(G.tapEgg(s, t).ok, false);
});

test('feeding restores food, pays tremendousness, and stops when he is full', () => {
  const s = hatched();
  s.needs.food = 20;
  const xp0 = s.xp;
  const r = G.feed(s, 'hamberder', G.now());
  assert.ok(r.ok && r.say);
  assert.equal(Math.round(s.needs.food), 48);
  assert.ok(s.xp > xp0);
  s.needs.food = 99;
  const full = G.feed(s, 'hamberder', G.now());
  assert.equal(full.ok, false);
  assert.equal(full.reason, 'full');
});

test('salad: he eats it, resents it, and tariffs it', () => {
  const s = hatched();
  s.needs.food = 10; s.needs.ego = 50;
  const salad = C.FOODS.find((f) => f.id === 'salad');
  const price0 = G.foodCost(s, salad);
  const r = G.feed(s, 'salad', G.now());
  assert.ok(r.ok);
  assert.equal(s.tariff, 25);
  assert.equal(s.needs.ego, 40);
  assert.ok(G.foodCost(s, salad) > price0);
  assert.ok(s.ach.salad);
  for (let i = 0; i < 19; i++) { s.needs.food = 10; G.feed(s, 'salad', G.now()); }
  assert.equal(s.tariff, 500);
  assert.ok(s.ach.tariff);
});

test('flattery works; honesty gets you fired', () => {
  const s = hatched();
  s.needs.ego = 40;
  G.praise(s, { t: 'x', p: 3 }, G.now());
  assert.equal(s.needs.ego, 74);
  const r = G.praise(s, { t: 'x', p: 0 }, G.now());
  assert.equal(s.needs.ego, 56);
  assert.ok(s.ach.fired && r.ok);
  const opts = G.praiseOptions();
  assert.equal(opts.length, 3);
  assert.ok(opts.some((o) => o.p === 3) && opts.some((o) => o.p === 2));
});

test('needs fade in real time, stay in range, and he sleeps at night on his own', () => {
  const t0 = at(2026, 3, 2, 9);
  const s = hatched(t0);
  for (const k of G.NEEDS) s.needs[k] = 100;
  const r = G.catchUp(s, t0 + 8 * HOUR);
  assert.ok(r.offline);
  assert.ok(Math.abs(s.needs.food - 60) < 1.5, 'food after 8h: ' + s.needs.food);
  assert.ok(Math.abs(s.needs.ego - 52) < 1.5, 'ego after 8h: ' + s.needs.ego);
  G.catchUp(s, t0 + 17 * HOUR); // 2 AM
  assert.equal(s.asleep, true);
  G.catchUp(s, t0 + 10 * DAY);
  for (const k of G.NEEDS) assert.ok(s.needs[k] >= 0 && s.needs[k] <= 100, k + ' in range');
});

test('a sleeping pet barely fades and wakes up rested', () => {
  const t0 = at(2026, 3, 2, 23, 30);
  const s = hatched(t0);
  for (const k of G.NEEDS) s.needs[k] = 80;
  s.needs.energy = 20;
  assert.ok(G.toggleSleep(s, t0).slept);
  G.catchUp(s, t0 + 7.5 * HOUR); // 7 AM
  assert.equal(s.asleep, false, 'woke up in the morning');
  assert.ok(s.needs.energy > 80);
  assert.ok(s.needs.ego > 70, 'ego held overnight: ' + s.needs.ego);
  assert.ok(s.needs.food > 65);
});

test('he refuses to sleep when he is not tired, and wakes on request', () => {
  const s = hatched();
  s.needs.energy = 95;
  assert.equal(G.toggleSleep(s, G.now()).ok, false);
  s.needs.energy = 40;
  assert.ok(G.toggleSleep(s, G.now()).slept);
  assert.equal(G.feed(s, 'hamberder', G.now()).reason, 'asleep');
  assert.ok(G.toggleSleep(s, G.now()).woke);
});

test('neglect makes him humble, then he leaves; progress never falls below his stage', () => {
  const t0 = at(2026, 3, 2, 9);
  const s = hatched(t0);
  s.xp = G.cumXp(19) + 5; // a Mogul (stage starts at 17)
  const r = G.catchUp(s, t0 + 2 * DAY);
  assert.ok(G.isHumble(s) || s.sulking);
  assert.ok(s.ach.humble);
  G.catchUp(s, t0 + 9 * DAY);
  assert.equal(s.sulking, true);
  assert.equal(G.mood(s), 'gone');
  assert.ok(s.xp >= G.cumXp(17), 'never de-evolves');
  assert.ok(G.level(s) >= 17);
  assert.equal(G.feed(s, 'hamberder', t0 + 9 * DAY).reason, 'gone');
  const back = G.winBack(s, t0 + 9 * DAY);
  assert.ok(back.ok && !s.sulking && s.ach.comeback);
  assert.equal(s.needs.food, 45);
  assert.ok(Array.isArray(r.events));
});

test('offline income is capped at twelve hours', () => {
  const t0 = at(2026, 3, 2, 9);
  const s = hatched(t0);
  s.cash = 0;
  const perHour = G.incomePerHour(s);
  G.catchUp(s, t0 + 3 * DAY);
  assert.ok(s.cash <= perHour * 12 * 1.4 + 1, 'at most 12h of income (plus daily bonus): ' + s.cash);
  assert.ok(s.cash >= perHour * 11);
});

test('a clock that jumps backwards does no harm', () => {
  const t0 = at(2026, 3, 2, 9);
  const s = hatched(t0);
  const before = JSON.stringify(s.needs);
  const r = G.catchUp(s, t0 - 5 * DAY);
  assert.equal(r.awayH, 0);
  assert.equal(JSON.stringify(s.needs), before);
});

test('streaks count consecutive days and reset after a gap', () => {
  const t0 = at(2026, 3, 2, 9);
  const s = hatched(t0);
  assert.equal(s.streak.n, 1);
  let r = G.catchUp(s, t0 + DAY);
  assert.equal(s.streak.n, 2);
  assert.ok(types(r.events).includes('newday'));
  G.catchUp(s, t0 + 2 * DAY);
  assert.equal(s.streak.n, 3);
  assert.ok(s.ach.streak3);
  G.catchUp(s, t0 + 2 * DAY + 2 * HOUR);
  assert.equal(s.streak.n, 3, 'same day does not count twice');
  G.catchUp(s, t0 + 5 * DAY);
  assert.equal(s.streak.n, 1);
  assert.equal(s.streak.best, 3);
});

test('the daily briefing: one a day, a choice, and an order to collect', () => {
  const t0 = at(2026, 3, 2, 9);
  const s = hatched(t0);
  const br = G.briefing(s);
  assert.ok(br && br.choices.length === 3);
  const r = G.chooseBriefing(s, 1, t0);
  assert.ok(r.ok && r.result && r.order);
  assert.equal(s.orders.length, 1);
  assert.equal(G.briefing(s), null);
  assert.equal(G.chooseBriefing(s, 0, t0).ok, false);
  G.catchUp(s, t0 + DAY);
  const next = G.briefing(s);
  assert.ok(next && next.id !== br.id, 'a different briefing the next day');
});

test('briefings do not repeat until every one has been seen', () => {
  let t = at(2026, 3, 2, 9);
  const s = hatched(t);
  const seen = [];
  for (let i = 0; i < C.BRIEFINGS.length; i++) {
    for (const k of G.NEEDS) s.needs[k] = 80;
    s.asleep = false; s.sulking = false;
    seen.push(G.briefing(s).id);
    G.chooseBriefing(s, 0, t);
    t += DAY; G.catchUp(s, t);
  }
  assert.equal(new Set(seen).size, C.BRIEFINGS.length);
});

test('seasons: Thanksgiving week brings the turkey pardon', () => {
  assert.equal(C.seasonFor(new Date(2026, 10, 20)), 'turkey');
  assert.equal(C.seasonFor(new Date(2026, 10, 26)), 'turkey');
  assert.equal(C.seasonFor(new Date(2026, 10, 27)), 'blackfriday');
  assert.equal(C.seasonFor(new Date(2026, 10, 28)), null);
  assert.equal(C.seasonFor(new Date(2027, 5, 14)), 'birthday');
  assert.equal(C.seasonFor(new Date(2027, 6, 4)), 'july4');
  assert.equal(C.seasonFor(new Date(2026, 11, 24)), 'christmas');
  assert.equal(C.seasonFor(new Date(2027, 1, 15)), 'presidents');
  assert.equal(C.seasonFor(new Date(2027, 3, 9)), null);
  const t = at(2026, 11, 20, 10);
  const s = hatched(t);
  const br = G.briefing(s);
  assert.equal(br.id, 'turkey');
  G.chooseBriefing(s, 0, t);
  assert.ok(s.ach.turkey);
  G.catchUp(s, t + DAY);
  assert.notEqual(G.briefing(s).id, 'turkey', 'only once per year');
});

test('the calendar: every special day is found, has a greeting and its own briefing', () => {
  const on = (y, m, d) => C.seasonFor(new Date(y, m - 1, d));
  assert.deepEqual([on(2026, 4, 5), on(2026, 4, 6), on(2026, 4, 7)], ['easter', 'easter', null]);
  assert.deepEqual([on(2027, 3, 28), on(2028, 4, 16), on(2030, 4, 21)], ['easter', 'easter', 'easter']);
  assert.equal(on(2026, 1, 1), 'newyear');
  assert.equal(on(2026, 2, 2), 'groundhog');
  assert.equal(on(2026, 2, 8), 'superbowl');
  assert.equal(on(2027, 2, 14), 'valentine', 'a fixed date wins over the big game');
  assert.equal(on(2028, 2, 29), 'leapday');
  assert.equal(on(2026, 3, 17), 'stpatrick');
  assert.equal(on(2026, 4, 1), 'aprilfools');
  assert.equal(on(2026, 5, 28), 'hamburger');
  assert.equal(on(2026, 9, 7), 'laborday');
  assert.equal(on(2026, 10, 31), 'halloween');
  assert.equal(on(2026, 12, 31), 'newyearseve');
  assert.equal(on(2026, 3, 13), 'friday13');
  assert.equal(on(2026, 3, 14), null);
  // every day of a year resolves to nothing or to a known special day, and they all get used
  const used = new Set();
  for (const y of [2026, 2027, 2028]) for (let d = new Date(y, 0, 1); d.getFullYear() === y; d.setDate(d.getDate() + 1)) {
    const s = C.seasonFor(d);
    if (s) { assert.ok(C.SEASONS[s], 'unknown special day: ' + s); used.add(s); }
  }
  assert.deepEqual([...used].sort(), Object.keys(C.SEASONS).sort());
  for (const id in C.SEASONS) {
    assert.ok(C.SEASONS[id].name && Array.isArray(C.SEASONS[id].greet) && C.SEASONS[id].greet.length > 0, id);
    assert.equal(C.SEASON_BRIEFINGS[id].id, id, id + ' has its own briefing');
  }
});

test('special days are collected across the year', () => {
  const s = hatched(at(2026, 1, 1, 10));
  const take = (y, m, d) => {
    const t = at(y, m, d, 10);
    G.catchUp(s, t);
    for (const k of G.NEEDS) s.needs[k] = 80;
    s.asleep = false; s.sulking = false;
    const b = G.briefing(s);
    G.chooseBriefing(s, 0, t);
    return b.id;
  };
  assert.equal(take(2026, 1, 1), 'newyear');
  assert.equal(take(2026, 1, 20), 'inaug');
  assert.equal(s.ach.season3, undefined);
  assert.equal(take(2026, 2, 2), 'groundhog');
  assert.ok(s.ach.season3);
  assert.notEqual(take(2026, 2, 3), 'groundhog', 'an ordinary day gets an ordinary briefing');
  const rest = [[2, 8, 'superbowl'], [2, 14, 'valentine'], [2, 16, 'presidents'], [3, 17, 'stpatrick'], [4, 1, 'aprilfools'], [4, 5, 'easter'], [5, 28, 'hamburger']];
  for (const [m, d, id] of rest) assert.equal(take(2026, m, d), id);
  assert.ok(s.ach.season10);
  assert.notEqual(take(2026, 4, 6), 'easter', 'once a year, even on a two-day occasion');
  assert.equal(take(2027, 1, 1), 'newyear', 'and again the next year');
});

test('some foods get remarks of their own, in every register', () => {
  for (const id of ['steak', 'chicken', 'tacobowl', 'cake', 'icecream']) assert.equal(C.LINES['ate_' + id].length, 5, id);
  const s = hatched();
  G.rng = () => 0.1; // below the chance threshold: he uses the food's own lines
  s.needs.food = 10; s.xp = G.cumXp(47);
  const said = G.feed(s, 'steak', G.now()).say;
  assert.ok(C.LINES.ate_steak[4].includes(said), said);
  G.rng = seeded(7);
});

test('3 AM posts can draw on their own lines', () => {
  let n = 0;
  G.rng = seeded(11);
  for (let i = 0; i < 200; i++) if (/3 AM|sleep|awake/i.test(C.makePost(3, G.rng, true).text)) n++;
  assert.ok(n > 60, 'night lines show up: ' + n);
  for (let i = 0; i < 50; i++) assert.ok(C.makePost(0, G.rng, true).text.length > 5, 'registers without night lines still post');
});

test('posts use charges that come back over time', () => {
  const t0 = at(2026, 3, 2, 9);
  const s = hatched(t0);
  for (let i = 0; i < 3; i++) assert.ok(G.publish(s, G.draftPost(s), t0).ok);
  assert.equal(G.publish(s, G.draftPost(s), t0).reason, 'charges');
  assert.equal(s.posts.length, 3);
  assert.ok(G.nextPostIn(s, t0) > 0);
  G.catchUp(s, t0 + 45 * 60e3);
  assert.equal(s.postCharges, 1);
  G.catchUp(s, t0 + 5 * HOUR);
  assert.equal(s.postCharges, 3);
});

test('posts get louder with level', () => {
  G.rng = seeded(3);
  const caps = (tier) => { let n = 0; for (let i = 0; i < 60; i++) n += (C.makePost(tier, G.rng).text.match(/[A-Z]{4,}/g) || []).length; return n; };
  assert.ok(caps(4) > caps(2) * 3);
  assert.equal(caps(0), 0);
});

test('decor costs money, lasts forever and changes the numbers', () => {
  const s = hatched();
  const income0 = G.incomePerHour(s);
  assert.equal(G.buyDecor(s, 'ballroom', G.now()).reason, 'cash');
  s.cash = 1e12;
  assert.ok(G.buyDecor(s, 'curtains', G.now()).ok);
  assert.equal(G.buyDecor(s, 'curtains', G.now()).ok, false);
  assert.ok(G.incomePerHour(s) > income0 * 1.09);
  for (const d of C.DECOR) G.buyDecor(s, d.id, G.now());
  assert.equal(s.decor.length, C.DECOR.length);
  assert.ok(s.ach.decor12);
  const p = G.perks(s);
  assert.ok(p.ego > 0 && p.ego < 0.5 && p.income > 0.4);
});

test('the shop delivers while he sleeps or is out golfing, without him saying a word', () => {
  const s = hatched();
  s.cash = 1e12;
  const awake = G.buyDecor(s, 'magazine', G.now());
  assert.ok(awake.ok && awake.say && awake.anim === 'dance' && !awake.quiet);
  s.needs.energy = 20;
  assert.ok(G.toggleSleep(s, G.now()).ok && s.asleep);
  const night = G.buyDecor(s, 'trophy', G.now());
  assert.ok(night.ok);
  assert.equal(night.quiet, 'asleep');
  assert.equal(night.say, undefined);
  assert.equal(night.anim, undefined);
  assert.ok(s.asleep, 'buying does not wake him');
  assert.ok(s.decor.includes('trophy'));
  s.asleep = false; s.sulking = true;
  const away = G.buyDecor(s, 'tv', G.now());
  assert.ok(away.ok && away.quiet === 'gone' && !away.say && s.decor.includes('tv'));
});

test('saves count the keeper’s changes, and older saves start the count at zero', () => {
  const s = hatched();
  assert.equal(s.edits, 0);
  s.edits = 7;
  assert.equal(G.importCode(G.exportCode(s), G.now()).edits, 7);
  delete s.edits;
  assert.equal(G.importCode(G.exportCode(s), G.now()).edits, 0);
  s.edits = -3;
  assert.equal(G.importCode(G.exportCode(s), G.now()).edits, 0);
});

test('games cost energy and pay out', () => {
  const s = hatched();
  s.needs.energy = 100; s.needs.fun = 10;
  const cash0 = s.cash, xp0 = s.xp;
  const r = G.finishGolf(s, 3, G.now());
  assert.ok(s.ach.golfhio && r.cash > 0);
  assert.equal(s.needs.energy, 100 - G.COST.golf);
  assert.ok(s.needs.fun > 40 && s.xp > xp0 && s.cash > cash0);
  const walked = G.finishDeal(s, false, 3, 0, G.now());
  assert.ok(s.ach.dealwalk && walked.cash === 0);
  const rally = G.finishRally(s, 62, G.now());
  assert.ok(s.ach.rallybig);
  assert.equal(rally.claimed, rally.real, 'a humble pet reports the real crowd');
  s.needs.energy = 5;
  assert.equal(G.canPlay(s, 'golf').reason, 'tired');
});

test('the crowd claim inflates with level', () => {
  const s = hatched();
  s.xp = G.cumXp(47);
  assert.equal(G.crowdClaim(s, 1000), 1000 * 10000);
});

test('level-ups and evolutions are reported once', () => {
  const s = hatched();
  const ev = [];
  G.addXp(s, G.cumXp(5) - s.xp + 1, ev, G.now());
  assert.deepEqual(types(ev), ['levelup', 'evolve']);
  assert.equal(ev[1].stage, 'kid');
  const ev2 = [];
  G.addXp(s, 5, ev2, G.now());
  assert.deepEqual(ev2, []);
});

test('another term: back to level 1, keep everything, earn more', () => {
  const s = hatched();
  s.cash = 1e12; G.buyDecor(s, 'tv', G.now());
  assert.equal(G.runAgain(s, G.now()).ok, false);
  s.xp = G.cumXp(50);
  assert.ok(G.canRunAgain(s));
  const r = G.runAgain(s, G.now());
  assert.ok(r.ok && s.ach.term2);
  assert.equal(s.term, 2);
  assert.equal(G.level(s), 1);
  assert.deepEqual(s.decor, ['tv']);
  assert.equal(G.termBonus(s), 1.25);
});

test('saves survive export and import; junk is rejected', () => {
  const s = hatched();
  s.name = 'Dönny 🍔'; s.xp = 1234; s.decor = ['tv'];
  const code = G.exportCode(s);
  assert.match(code, /^TG1\./);
  const back = G.importCode(code, G.now());
  assert.equal(back.name, s.name);
  assert.equal(back.xp, 1234);
  assert.deepEqual(back.decor, ['tv']);
  assert.equal(G.importCode('TG1.not-base64!', G.now()), null);
  assert.equal(G.importCode('hello', G.now()), null);
  assert.equal(G.importCode('TG1.' + Buffer.from('{"v":2}').toString('base64'), G.now()), null);
});

test('older saves gain any fields added later', () => {
  const s = hatched();
  delete s.stats.briefings; delete s.seasonsDone; delete s.settings;
  const back = G.importCode(G.exportCode(s), G.now());
  assert.equal(back.stats.briefings, 0);
  assert.deepEqual(back.seasonsDone, {});
  assert.equal(back.settings.sound, true);
});

test('a mangled save is repaired instead of breaking the page', () => {
  const s = hatched();
  Object.assign(s, { xp: 'lots', cash: -5, term: 0, decor: ['tv', 'tv', 'yacht'], orders: 'all', posts: [{ t: 7 }, { t: 'ok', likes: 12 }], name: 'x'.repeat(80), ach: null });
  s.needs = { food: 900, ego: 'hungry', fun: -3 };
  s.streak = { n: 'many' };
  const back = G.importCode(G.exportCode(s).replace('lots', 'lots'), G.now());
  assert.equal(back, null, 'a non-numeric xp is not a save code');
  s.xp = 5e9;
  const fixed = G.importCode(G.exportCode(s), G.now());
  assert.equal(G.level(fixed), C.MAX_LEVEL);
  assert.equal(fixed.cash, 0);
  assert.equal(fixed.term, 1);
  assert.deepEqual(fixed.decor, ['tv']);
  assert.deepEqual(fixed.orders, []);
  assert.deepEqual(fixed.posts.map((p) => p.t), ['ok']);
  assert.equal(fixed.name.length, 18);
  assert.deepEqual(fixed.ach, {});
  assert.deepEqual(fixed.needs, { food: 100, ego: 50, fun: 0, glow: 55, energy: 80 });
  assert.equal(fixed.streak.n, 0);
  G.catchUp(fixed, G.now());
  assert.ok(G.mood(fixed));
});

test('money reads well at every size', () => {
  assert.equal(G.money(0), '$0');
  assert.equal(G.money(999), '$999');
  assert.equal(G.money(1e6), '$1.00M');
  assert.equal(G.money(42.04e6), '$42.0M');
  assert.equal(G.money(3.2e11), '$320B');
  assert.equal(G.money(1.5e12), '$1.50T');
});

test('content is complete and consistent', () => {
  for (const key in C.LINES) {
    assert.equal(C.LINES[key].length, 5, key + ' has five registers');
    for (const tier of C.LINES[key]) assert.ok(tier.length > 0 && tier.every((l) => typeof l === 'string' && l.length > 3), key);
  }
  for (const b of C.BRIEFINGS.concat(Object.values(C.SEASON_BRIEFINGS))) {
    assert.equal(b.choices.length, 3, b.id);
    for (const ch of b.choices) assert.ok(ch.t && ch.r && ch.fx && ch.fx.xp > 0, b.id);
  }
  const uniq = (arr) => new Set(arr).size === arr.length;
  assert.ok(uniq(C.BRIEFINGS.map((b) => b.id)));
  assert.ok(C.BRIEFINGS.length >= 60 && C.ORDERS.length >= C.BRIEFINGS.length, 'an order for every daily briefing');
  for (const b of C.BRIEFINGS) for (const ch of b.choices) assert.ok(ch.fx.xp >= 24 && ch.fx.xp <= 40, b.id + ': ordinary briefings pay alike');
  // a line with a placeholder must be handed that value by the game
  const allowed = { ate: ['food'], ateCoke: ['n'], ateSalad: ['tariff'], greetLong: ['hours'], rally: ['real', 'claimed'] };
  for (const key in C.LINES) for (const tier of C.LINES[key]) for (const line of tier) for (const m of line.matchAll(/\{(\w+)\}/g)) assert.ok((allowed[key] || []).includes(m[1]), key + ' uses {' + m[1] + '}');
  for (const key of ['want', 'tier']) assert.ok(C.NEWS[key]);
  for (const t of C.NEWS.tier) assert.ok(t.length >= 6);
  assert.equal(C.POST.templates.length, 5);
  for (const t of C.POST.templates) assert.ok(t.length >= 12);
  assert.ok(uniq(C.ORDERS.map((o) => o.no)) && uniq(C.ORDERS.map((o) => o.title)));
  assert.ok(uniq(C.ACHIEVEMENTS.map((a) => a.id)));
  assert.ok(uniq(C.DECOR.map((d) => d.id)));
  for (const st of C.STAGES) if (st.id !== 'egg') assert.ok(C.EVOLVE_LINES[st.id], st.id);
  // every trophy the simulation can award exists, and every trophy can be awarded
  const src = readFileSync(new URL('../js/game.js', import.meta.url), 'utf8') + readFileSync(new URL('../js/content.js', import.meta.url), 'utf8');
  const awarded = new Set([...src.matchAll(/unlock\(s, '(\w+)'/g)].map((m) => m[1]).concat([...src.matchAll(/ach: '(\w+)'/g)].map((m) => m[1])));
  const defined = new Set(C.ACHIEVEMENTS.map((a) => a.id));
  for (const id of awarded) assert.ok(defined.has(id), 'undefined trophy: ' + id);
  for (const id of defined) assert.ok(awarded.has(id), 'trophy can never be earned: ' + id);
});

test('pacing: a devoted caretaker sees him evolve on day one and peak in about a month', () => {
  G.rng = seeded(42);
  let t = at(2026, 1, 5, 8);
  const s = G.newState(t); G.catchUp(s, t);
  for (let i = 0; i < G.EGG_TAPS; i++) G.tapEgg(s, t);
  const reached = {};
  for (let day = 0; day < 90 && G.level(s) < 50; day++) {
    for (const h of [8, 13, 18, 22.5]) {
      t = at(2026, 1, 5 + day, 0) + h * HOUR;
      G.catchUp(s, t);
      if (s.sulking) G.winBack(s, t);
      if (s.asleep) G.toggleSleep(s, t);
      if (G.briefing(s)) G.chooseBriefing(s, 0, t);
      for (let i = 0; i < 6 && s.needs.food < 80; i++) G.feed(s, 'hamberder', t);
      for (let i = 0; i < 6 && s.needs.ego < 85; i++) G.praise(s, { t: 'x', p: 3 }, t);
      for (let i = 0; i < 4 && s.needs.glow < 80; i++) G.groom(s, 'spray', t);
      while (s.postCharges > 0) G.publish(s, G.draftPost(s), t);
      for (let i = 0; i < 3 && s.needs.energy >= 35; i++) G.finishGolf(s, 2, t);
      for (const d of C.DECOR) if (s.decor.indexOf(d.id) < 0 && s.cash >= d.cost) G.buyDecor(s, d.id, t);
      if (h > 22 && s.needs.energy <= 80) G.toggleSleep(s, t);
    }
    for (const m of [5, 17, 45, 50]) if (G.level(s) >= m && !reached[m]) reached[m] = day + 1;
  }
  assert.ok(reached[5] <= 2, 'first evolution by day 2: ' + reached[5]);
  assert.ok(reached[17] >= 3 && reached[17] <= 10, 'Mogul within the first week or so: ' + reached[17]);
  assert.ok(reached[45] >= 15 && reached[45] <= 45, 'the presidency takes weeks: ' + reached[45]);
  assert.ok(reached[50] >= 20 && reached[50] <= 60, 'peak in about a month: ' + reached[50]);
  assert.equal(s.ach.comeback, undefined, 'a cared-for pet never storms off');
});
