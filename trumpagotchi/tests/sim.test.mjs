// Rules and balance of the simulation, run in plain Node: `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = globalThis;
await import('../js/content.js');
await import('../js/game.js');
await import('../js/art.js'); // only what needs no canvas is used here: how he looks, where he is, where a tap lands
const { game: G, content: C, art: A } = globalThis.TG;

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

test('past the presidency: fifty more levels and seven more things to become', () => {
  assert.equal(C.MAX_LEVEL, 100);
  assert.deepEqual([54, 55, 61, 62, 70, 78, 86, 93, 99, 100].map((L) => G.stageFor(L).id), ['gold', 'plated', 'plated', 'hair', 'tie', 'giant', 'tower', 'planet', 'planet', 'all']);
  assert.deepEqual([61, 62, 100].map(C.tierForLevel), [4, 5, 5]);
  assert.equal(C.TIER_NAMES.length, 6);
  // the first fifty levels cost exactly what they always did, so nobody's pet moved
  assert.equal(G.cumXp(50), 22540);
  assert.equal(G.cumXp(17), 60 * 16 + 8 * 16 * 17);
  // beyond that, a level costs about the same from first to last
  for (let L = 50; L < 100; L++) { const cost = G.cumXp(L + 1) - G.cumXp(L); assert.ok(cost >= 700 && cost <= 910, L + ': ' + cost); }
  assert.equal(G.levelFor(G.cumXp(78) - 1), 77);
  assert.equal(G.levelFor(G.cumXp(78)), 78);
  // each form is announced, and has its trophy
  const s = hatched();
  const marks = { 55: 'plated', 62: 'hair', 70: 'tie', 78: 'giant', 86: 'tower', 93: 'planet', 100: 'all' };
  for (const L in marks) {
    s.xp = G.cumXp(Number(L)) - 1;
    const ev = [];
    G.addXp(s, 5, ev, G.now());
    assert.ok(ev.some((e) => e.type === 'evolve' && e.stage === marks[L]), 'evolves at ' + L);
    assert.ok(s.ach['lv' + L], 'trophy at ' + L);
  }
  assert.equal(G.level(s), 100);
  G.addXp(s, 1e9, [], G.now());
  assert.equal(G.level(s), 100, 'and there it stops');
  assert.equal(G.progress(s), 1);
});

test('past the presidency: he talks about what he has become, in a voice of its own', () => {
  const s = hatched();
  for (const id of ['plated', 'hair', 'tie', 'giant', 'tower', 'planet', 'all']) {
    assert.ok(C.STAGE_LINES[id].length >= 5, id);
    s.xp = G.cumXp(C.STAGES.find((x) => x.id === id).min);
    G.rng = seeded(3);
    const said = new Set();
    for (let i = 0; i < 60; i++) said.add(G.say(s, 'idleHappy'));
    assert.ok(C.STAGE_LINES[id].some((l) => said.has(l)), id + ': his own lines come up');
    assert.ok([...said].some((l) => !C.STAGE_LINES[id].includes(l)), id + ': and so do the general ones');
  }
  s.xp = G.cumXp(62);
  G.rng = () => 0.99;
  assert.ok(C.LINES.hungry[5].includes(G.say(s, 'hungry')));
  s.xp = G.cumXp(61);
  assert.ok(C.LINES.hungry[4].includes(G.say(s, 'hungry')));
  s.xp = G.cumXp(40); // below level 55 nothing changed, including how many random numbers are drawn
  let draws = 0; G.rng = () => { draws++; return 0.5; };
  G.say(s, 'idleHappy');
  assert.equal(draws, 1);
  // posts and crowds scale with him too
  G.rng = seeded(9);
  for (let i = 0; i < 40; i++) assert.ok(C.makePost(5, G.rng).text.length > 10);
  assert.match(C.likesFor(5, () => 0.9), /TRILLION/);
  s.xp = G.cumXp(70);
  assert.equal(G.crowdClaim(s, 100), 1e11);
  assert.equal(G.money(3.2e19), '$32.0Qi');
  G.rng = seeded(7);
});

test('past the presidency: briefings and orders about a form wait until he is that form', () => {
  const gatedB = C.BRIEFINGS.filter((b) => b.min), gatedO = C.ORDERS.filter((o) => o.min);
  assert.ok(gatedB.length >= 14 && gatedO.length >= 14);
  for (const x of gatedB.concat(gatedO)) assert.ok([47, 55, 62, 70, 78, 86, 93, 100].includes(x.min), 'a stage starts at ' + x.min);
  for (const b of gatedB) for (const ch of b.choices) assert.ok(ch.fx.xp >= 38 && ch.fx.xp <= 52, b.id + ': later briefings pay a little more');
  // forty days as a first-term president: nothing from later turns up
  let t = at(2026, 3, 2, 9);
  const s = hatched(t);
  s.xp = G.cumXp(46);
  for (let i = 0; i < 40; i++) {
    for (const k of G.NEEDS) s.needs[k] = 80;
    s.asleep = false; s.xp = G.cumXp(46);
    const b = G.briefing(s);
    assert.ok(!b.min, b.id);
    const r = G.chooseBriefing(s, 0, t);
    if (r.order) assert.ok(!r.order.min, r.order.title);
    t += DAY; G.catchUp(s, t);
  }
  // as The Hair, the hair's own business is likely to come up soon
  s.xp = G.cumXp(62);
  const seen = [];
  for (let i = 0; i < 12; i++) {
    for (const k of G.NEEDS) s.needs[k] = 80;
    s.asleep = false; s.xp = G.cumXp(62);
    const b = G.briefing(s);
    assert.ok(!b.min || b.min <= 62, b.id);
    seen.push(b.id);
    const r = G.chooseBriefing(s, 0, t);
    if (r.order) assert.ok(!r.order.min || r.order.min <= 62, r.order.title);
    t += DAY; G.catchUp(s, t);
  }
  assert.ok(seen.includes('hairvote') || seen.includes('hairdoor'), seen.join(' '));
  // at the very end every order can be signed
  s.xp = G.cumXp(100);
  for (let i = 0; i < 400 && s.orders.length < C.ORDERS.length; i++) {
    for (const k of G.NEEDS) s.needs[k] = 80;
    s.asleep = false; s.xp = G.cumXp(100);
    G.chooseBriefing(s, 0, t);
    t += DAY; G.catchUp(s, t);
  }
  assert.equal(s.orders.length, C.ORDERS.length);
  assert.ok(s.ach.ordersall);
});

test('the comeback: the coin, the pool, the arch and the ballroom, each leaving something behind', () => {
  const ids = { coin: 'coin', pool: 'pool', arch: 'arch', wing: 'wing' };
  for (const id in ids) {
    const b = C.BRIEFINGS.find((x) => x.id === id);
    assert.equal(b.min, 47, id);
    for (const ch of b.choices) assert.equal(ch.fx.ach, ids[id], id + ': every choice leaves its trophy');
    assert.ok(C.ACHIEVEMENTS.some((a) => a.id === ids[id]));
  }
  assert.equal(C.ORDERS.filter((o) => o.min === 47).length, 4);
  // he gets to them soon after the comeback
  let t = at(2026, 3, 2, 9);
  const s = hatched(t);
  const seen = new Set();
  for (let i = 0; i < 20 && seen.size < 4; i++) {
    for (const k of G.NEEDS) s.needs[k] = 80;
    s.asleep = false; s.xp = G.cumXp(47);
    const b = G.briefing(s);
    if (ids[b.id]) seen.add(b.id);
    G.chooseBriefing(s, 0, t);
    t += DAY; G.catchUp(s, t);
  }
  assert.equal(seen.size, 4, [...seen].join(' '));
  for (const id in ids) assert.ok(s.ach[ids[id]], id);
});

test('past the presidency: how he looks, where he is, and that neglect makes him a man again', () => {
  const forms = [50, 55, 62, 70, 78, 85, 86, 92, 93, 99, 100].map((L) => A.look(L, {}).form);
  assert.deepEqual(forms, ['man', 'man', 'man', 'man', 'man', 'man', 'tower', 'tower', 'planet', 'planet', 'all']);
  assert.deepEqual([44, 45, 77, 78, 92, 93, 99, 100].map((L) => A.sceneFor(L)), ['tower', 'oval', 'oval', 'skyline', 'skyline', 'space', 'space', 'all']);
  // levels 1 to 50 are untouched
  for (const L of [1, 10, 30, 47, 50]) {
    const k = A.look(L, {});
    assert.equal(k.plate, 0); assert.equal(k.mane, 0); assert.equal(k.hairEyes, false); assert.equal(k.tieOut, 0); assert.equal(k.fixed, false);
    for (const m of ['grot', 'lumps', 'tendrils', 'dangle']) assert.equal(k[m], 0, L + ' ' + m);
    for (const m of ['hairMouth', 'hairEyes2', 'tongue', 'tieWrap', 'kaiju']) assert.equal(k[m], false, L + ' ' + m);
  }
  // the monster comes on in order: the face, the gold, the hair's own mouth and eyes, the puppet, the tongue, the giant
  assert.ok(A.look(55, {}).grot > A.look(52, {}).grot && A.look(70, {}).grot === 1);
  assert.equal(A.look(56, {}).lumps, 1);
  assert.deepEqual([61, 62, 64, 66].map((L) => [A.look(L, {}).tendrils > 0, A.look(L, {}).hairMouth, A.look(L, {}).hairEyes2]), [[false, false, false], [true, false, false], [true, true, false], [true, true, true]]);
  assert.deepEqual([65, 69, 77, 78].map((L) => A.look(L, {}).dangle), [0, 3, 5, 0]);
  assert.deepEqual([69, 70, 72, 78].map((L) => [A.look(L, {}).tongue, A.look(L, {}).tieWrap, A.look(L, {}).kaiju]), [[false, false, false], [true, false, false], [true, true, false], [true, true, true]]);
  for (const m of ['grot', 'lumps', 'tendrils', 'dangle']) assert.equal(A.look(90, { humble: true })[m], 0, 'humble: ' + m);
  // in person (the minigames) he is gold and has the face, but none of the rest comes along
  const pv = A.look(80, { person: true });
  assert.equal(pv.dangle, 0); assert.equal(pv.tongue, false); assert.equal(pv.hairMouth, false); assert.equal(pv.kaiju, false); assert.ok(pv.grot > 0);
  // crumbs go where the eating happens
  assert.deepEqual(A.mouth(A.look(40, {}), 80), [80, A.FLOOR - 36]);
  assert.ok(A.mouth(A.look(68, {}), 80)[1] < A.FLOOR - 55, 'the hair eats first: ' + A.mouth(A.look(68, {}), 80));
  assert.equal(A.look(50, {}).hh, 7);
  // each change comes on gradually
  assert.ok(A.look(52, {}).plate > 0 && A.look(52, {}).plate < 1);
  assert.equal(A.look(55, {}).plate, 1);
  const manes = [55, 58, 62, 66, 70, 74, 77].map((L) => A.look(L, {}).hh);
  for (let i = 1; i < manes.length; i++) assert.ok(manes[i] > manes[i - 1], 'the hair keeps growing: ' + manes);
  assert.equal(A.look(61, {}).hairEyes, false);
  assert.equal(A.look(62, {}).hairEyes, true);
  assert.equal(A.look(69, {}).tieWindow, false);
  assert.equal(A.look(70, {}).tieWindow, true);
  assert.ok(A.look(90, {}).H > A.look(86, {}).H);
  assert.deepEqual([93, 95, 99].map((L) => A.look(L, {}).moons), [0, 2, 6]);
  // neglected, at any level: a man, in the office, with none of it
  for (const L of [60, 80, 90, 95, 100]) {
    const k = A.look(L, { humble: true });
    assert.equal(k.form, 'man'); assert.equal(k.plate, 0); assert.equal(k.mane, 0); assert.equal(k.fixed, false); assert.equal(k.crown, false);
    assert.equal(A.sceneFor(L, true), 'oval');
  }
  // he turns up to the minigames in person, with hair that fits on the screen
  for (const L of [80, 90, 95, 100]) { const k = A.look(L, { person: true }); assert.equal(k.form, 'man'); assert.ok(k.hh <= 24, 'hair ' + k.hh); assert.equal(k.tieOut, 0); }
  // taps: hair is hair and body is body on every form
  assert.equal(A.hit(A.look(30, {}), 80, 80, A.FLOOR - 20), 'body');
  assert.equal(A.hit(A.look(30, {}), 80, 80, A.FLOOR - 55), 'hair');
  assert.equal(A.hit(A.look(30, {}), 80, 120, A.FLOOR - 20), null);
  assert.equal(A.hit(A.look(77, {}), 80, 80, 20), 'hair', 'the big hair can be touched high up');
  assert.equal(A.hit(A.look(30, {}), 80, 80, 20), null);
  assert.equal(A.hit(A.look(88, {}), 80, 80, 60), 'body');
  assert.equal(A.hit(A.look(88, {}), 80, 80, A.FLOOR - A.look(88, {}).H - 4), 'hair');
  assert.equal(A.hit(A.look(95, {}), 80, 80, 66), 'body');
  assert.equal(A.hit(A.look(95, {}), 80, 80, 30), 'hair');
  assert.equal(A.hit(A.look(95, {}), 80, 10, 110), null);
  assert.equal(A.hit(A.look(100, {}), 80, 40, 70), 'body');
  assert.equal(A.hit(A.look(100, {}), 80, 40, 12), 'hair');
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
  // `level`: held there for the run. Early on only the briefings open to him count as "every one".
  const run = (level, days) => {
    let t = at(2026, 3, 2, 9);
    const s = hatched(t);
    const seen = [];
    for (let i = 0; i < days; i++) {
      for (const k of G.NEEDS) s.needs[k] = 80;
      s.asleep = false; s.sulking = false;
      if (level) s.xp = G.cumXp(level);
      seen.push(G.briefing(s).id);
      G.chooseBriefing(s, 0, t);
      t += DAY; G.catchUp(s, t);
    }
    return seen;
  };
  const open = C.BRIEFINGS.filter((b) => !b.min).length;
  assert.equal(new Set(run(0, open)).size, open);
  assert.equal(new Set(run(100, C.BRIEFINGS.length)).size, C.BRIEFINGS.length);
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
  for (const id of ['steak', 'chicken', 'tacobowl', 'cake', 'icecream']) assert.equal(C.LINES['ate_' + id].length, C.TIER_NAMES.length, id);
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
  s.xp = G.cumXp(50); // no longer the end: there is everything after the presidency still to be
  assert.equal(G.canRunAgain(s), false);
  s.xp = G.cumXp(99);
  assert.equal(G.runAgain(s, G.now()).ok, false);
  s.xp = G.cumXp(100);
  assert.ok(G.canRunAgain(s));
  const r = G.runAgain(s, G.now());
  assert.ok(r.ok && s.ach.term2);
  assert.ok(C.LINES.another[5].includes(r.say));
  assert.equal(s.term, 2);
  assert.equal(G.level(s), 1);
  assert.deepEqual(s.decor, ['tv']);
  assert.equal(G.termBonus(s), 1.25);
});

test('acquisitions: always something more to buy, each a little dearer and a little bigger', () => {
  const s = hatched();
  s.cash = 1e30; s.xp = G.cumXp(100);
  const names = new Set(), seen = [];
  let last = 0;
  for (let i = 0; i < G.acqAllowed(s); i++) {
    const next = G.acqNext(s, 3);
    assert.equal(next.length, 3);
    const it = next[0];
    assert.ok(it.cost > last, 'dearer every time');
    assert.ok(it.name && it.note && it.icon && it.kind, i);
    assert.ok(!names.has(it.name), 'never the same name twice: ' + it.name);
    names.add(it.name); seen.push(it.band);
    last = it.cost;
    const r = G.buyNext(s, G.now());
    assert.ok(r.ok, i + ' ' + it.name);
    assert.equal(r.bought.name, it.name);
    assert.ok(r.say.includes(it.name), r.say);
  }
  // the bands come in order, from small luxuries to the sky
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1]);
  assert.ok(seen[seen.length - 1] >= 4, 'by the end of a term he is buying things in the sky');
  assert.equal(G.owned(s), G.acqAllowed(s));
  assert.ok(Math.abs(G.perks(s).income - G.owned(s) * 0.01) < 1e-9, 'each pays 1% more income');
  for (const id of ['acq1', 'acq25', 'acq100', 'acq250']) assert.ok(s.ach[id], id);
  // a band used up comes round again, with numbers
  const small = C.ACQ_BANDS[0];
  const t = hatched(); t.cash = 1e30; t.xp = G.cumXp(100); t.holdings.bands[0] = small.items.length;
  const again = G.acqNext(t, 1)[0];
  assert.equal(again.name, small.items[0][0] + ' No. 2');
  assert.ok(C.ACQ_AGAIN.includes(again.note));
  // far, far on, there is still something: the last band never ends
  t.holdings.term = 400; t.holdings.bands = C.ACQ_BANDS.map(() => 5000);
  const far = G.acqNext(t, 2);
  assert.equal(far[0].band, C.ACQ_BANDS.length - 1);
  assert.match(far[1].name, /No\. \d+$/);
  assert.ok(isFinite(far[1].cost) && far[1].cost < 1e30);
});

test('acquisitions: two and a half more every level, delivered quietly if he is out, kept across terms', () => {
  const s = hatched();
  s.cash = 1e30;
  assert.equal(G.level(s), 1);
  for (let i = 0; i < 6; i++) assert.ok(G.buyNext(s, G.now()).ok, i);
  const r = G.buyNext(s, G.now());
  assert.equal(r.ok, false); assert.equal(r.reason, 'later'); assert.equal(r.level, 2);
  assert.equal(G.acqLevel(s), 2); assert.equal(G.acqLevel(s, 2), 2); assert.equal(G.acqLevel(s, 3), 3);
  s.xp = G.cumXp(2);
  for (let i = 0; i < 3; i++) assert.ok(G.buyNext(s, G.now()).ok);
  assert.equal(G.buyNext(s, G.now()).reason, 'later');
  // money first
  const poor = hatched(); poor.cash = 1000;
  const no = G.buyNext(poor, G.now());
  assert.equal(no.reason, 'cash'); assert.ok(no.say);
  assert.equal(G.buyNext(G.newState(G.now()), G.now()).reason, 'egg');
  // asleep or away: it arrives without a word, and he gets nothing out of it until he is back
  const away = hatched(); away.cash = 1e9; away.needs.energy = 40; G.toggleSleep(away, G.now());
  const ego = away.needs.ego;
  const q = G.buyNext(away, G.now());
  assert.ok(q.ok); assert.equal(q.quiet, 'asleep'); assert.equal(q.say, undefined); assert.equal(q.anim, undefined);
  assert.equal(away.needs.ego, ego);
  const here = hatched(); here.cash = 1e9; here.needs.ego = 50;
  assert.equal(G.buyNext(here, G.now()).anim, 'dance');
  assert.equal(here.needs.ego, 56);
  assert.equal(here.stats.acqSpent, G.ACQ.base);
  // another term: everything he owns stays, prices start again from the bottom, names carry on
  const big = hatched(); big.cash = 1e30; big.xp = G.cumXp(100);
  for (let i = 0; i < 30; i++) G.buyNext(big, G.now());
  const owned = G.owned(big), firstAgain = G.acqNext(big, 1)[0];
  G.runAgain(big, G.now());
  assert.equal(G.owned(big), owned);
  assert.equal(big.holdings.term, 0);
  const next = G.acqNext(big, 1)[0];
  assert.equal(next.cost, G.ACQ.base);
  assert.notEqual(next.name, C.ACQ_BANDS[0].items[0][0]);
  assert.ok(firstAgain.cost > next.cost);
  assert.ok(G.incomePerHour(big) > G.incomePerHour(hatched()) * 1.25, 'what he owns keeps paying');
});

test('acquisitions: old saves have none, and odd ones are made safe', () => {
  const t = G.now();
  const old = JSON.parse(JSON.stringify(hatched(t))); delete old.holdings; delete old.stats.acqSpent;
  const back = G.revive(old, t);
  assert.deepEqual(back.holdings, { term: 0, bands: C.ACQ_BANDS.map(() => 0) });
  assert.equal(back.stats.acqSpent, 0);
  assert.equal(G.owned(back), 0);
  for (const junk of [null, 5, 'x', [], { term: -3, bands: 'no' }, { term: 1e99, bands: [1, -1, 'a', 2.7, null, 9, 99] }]) {
    const s = G.revive(Object.assign(JSON.parse(JSON.stringify(hatched(t))), { holdings: junk }), t);
    assert.ok(Number.isInteger(s.holdings.term) && s.holdings.term >= 0 && s.holdings.term <= 1e6, JSON.stringify(junk));
    assert.equal(s.holdings.bands.length, C.ACQ_BANDS.length);
    for (const b of s.holdings.bands) assert.ok(Number.isInteger(b) && b >= 0);
    assert.ok(G.acqNext(s, 1)[0].name);
  }
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
    assert.equal(C.LINES[key].length, C.TIER_NAMES.length, key + ' has every register');
    for (const tier of C.LINES[key]) assert.ok(tier.length > 0 && tier.every((l) => typeof l === 'string' && l.length > 3), key);
  }
  for (const b of C.BRIEFINGS.concat(Object.values(C.SEASON_BRIEFINGS))) {
    assert.equal(b.choices.length, 3, b.id);
    for (const ch of b.choices) assert.ok(ch.t && ch.r && ch.fx && ch.fx.xp > 0, b.id);
  }
  const uniq = (arr) => new Set(arr).size === arr.length;
  assert.ok(uniq(C.BRIEFINGS.map((b) => b.id)));
  assert.ok(C.BRIEFINGS.length >= 60 && C.ORDERS.length >= C.BRIEFINGS.length, 'an order for every daily briefing');
  for (const b of C.BRIEFINGS) if (!b.min) for (const ch of b.choices) assert.ok(ch.fx.xp >= 24 && ch.fx.xp <= 40, b.id + ': ordinary briefings pay alike');
  // a line with a placeholder must be handed that value by the game
  const allowed = { ate: ['food'], ateCoke: ['n'], ateSalad: ['tariff'], greetLong: ['hours'], rally: ['real', 'claimed'], acquired: ['thing'] };
  for (const key in C.LINES) for (const tier of C.LINES[key]) for (const line of tier) for (const m of line.matchAll(/\{(\w+)\}/g)) assert.ok((allowed[key] || []).includes(m[1]), key + ' uses {' + m[1] + '}');
  for (const key of ['want', 'tier']) assert.ok(C.NEWS[key]);
  for (const t of C.NEWS.tier) assert.ok(t.length >= 6);
  assert.equal(C.POST.templates.length, C.TIER_NAMES.length);
  assert.equal(C.POST.night.length, C.TIER_NAMES.length);
  assert.equal(C.NEWS.tier.length, C.TIER_NAMES.length);
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

// One visit from a caretaker who does everything on offer.
function lookAfter(s, t, bedtime) {
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
  if (bedtime && s.needs.energy <= 80) G.toggleSleep(s, t);
}
// Days (from the first) on which he first reached each of `marks`, visiting at `hours` every day.
function daysTo(marks, hours, s, limit) {
  const reached = {}, top = marks[marks.length - 1];
  const day0 = at(2026, 1, 5, 0);
  if (!s) { s = G.newState(day0 + 8 * HOUR); G.catchUp(s, day0 + 8 * HOUR); for (let i = 0; i < G.EGG_TAPS; i++) G.tapEgg(s, day0 + 8 * HOUR); }
  for (let day = 0; day < limit && G.level(s) < top; day++) {
    for (const h of hours) lookAfter(s, at(2026, 1, 5 + day, 0) + h * HOUR, h > 22);
    for (const m of marks) if (G.level(s) >= m && !reached[m]) reached[m] = day + 1;
  }
  return { reached, s };
}

test('pacing: a devoted caretaker sees him evolve on day one and peak in about a month', () => {
  G.rng = seeded(42);
  const { reached, s } = daysTo([5, 17, 45, 50], [8, 13, 18, 22.5], null, 90);
  assert.ok(reached[5] <= 2, 'first evolution by day 2: ' + reached[5]);
  assert.ok(reached[17] >= 3 && reached[17] <= 10, 'Mogul within the first week or so: ' + reached[17]);
  assert.ok(reached[45] >= 15 && reached[45] <= 45, 'the presidency takes weeks: ' + reached[45]);
  assert.ok(reached[50] >= 20 && reached[50] <= 60, 'peak in about a month: ' + reached[50]);
  assert.equal(s.ach.comeback, undefined, 'a cared-for pet never storms off');
});

test('pacing: past the presidency there is a new form every week or two, for months', () => {
  const forms = [55, 62, 70, 78, 86, 93, 100];
  const gaps = (hours) => {
    G.rng = seeded(42);
    const r = daysTo([50].concat(forms), hours, null, 400).reached;
    return { days: forms.map((m, i) => r[m] - r[i ? forms[i - 1] : 50]), total: r[100] - r[50] };
  };
  const keen = gaps([8, 13, 18, 22.5]);
  for (const d of keen.days) assert.ok(d >= 4 && d <= 12, 'four visits a day: ' + keen.days);
  assert.ok(keen.total >= 45 && keen.total <= 80, 'about two months more: ' + keen.total);
  const daily = gaps([19]);
  for (const d of daily.days) assert.ok(d >= 8 && d <= 24, 'one visit a day: ' + daily.days);
  assert.ok(daily.total >= 90 && daily.total <= 150, 'about four months more: ' + daily.total);
  G.rng = seeded(7);
});

test('a pet saved at the old top of the game simply carries on', () => {
  const t = at(2026, 3, 2, 9);
  const s = hatched(t);
  s.xp = 22541; // where the game used to stop: level 50, plus the one point it allowed
  const back = G.revive(JSON.parse(JSON.stringify(s)), t);
  assert.equal(back.xp, 22541);
  assert.equal(G.level(back), 50);
  assert.equal(G.stage(back).id, 'gold');
  assert.equal(G.canRunAgain(back), false, 'the way on is up, not round again');
  assert.ok(G.progress(back) < 0.01);
  for (const k of G.NEEDS) back.needs[k] = 90;
  G.catchUp(back, t + 2 * HOUR);
  assert.ok(back.xp > 22541, 'and he gains again');
  // a save from far past the end is brought back to the end, not thrown away
  const wild = G.revive(Object.assign(JSON.parse(JSON.stringify(s)), { xp: 1e12 }), t);
  assert.equal(G.level(wild), 100);
});

test('pacing: the shop never runs dry, in the first term or the next', () => {
  // A caretaker who buys the next acquisition whenever there is money for it.
  const shopper = (hours, terms) => {
    G.rng = seeded(42);
    const day0 = at(2026, 1, 5, 0);
    const s = G.newState(day0 + 8 * HOUR); G.catchUp(s, day0 + 8 * HOUR);
    for (let i = 0; i < G.EGG_TAPS; i++) G.tapEgg(s, day0 + 8 * HOUR);
    const perDay = [], terms1 = [], at50 = {};
    for (let day = 0, term = 1; day < 400; day++) {
      let n = 0;
      for (const h of hours) {
        const t = at(2026, 1, 5 + day, 0) + h * HOUR;
        lookAfter(s, t, h > 22);
        while (G.buyNext(s, t).ok) n++;
      }
      perDay.push(n); terms1.push(term === 1);
      if (G.level(s) >= 50 && !at50[term]) at50[term] = G.owned(s);
      if (G.level(s) >= 100) { if (term >= terms) break; G.runAgain(s, at(2026, 1, 5 + day, 23)); term++; }
    }
    let dry = 0, run = 0;
    for (const n of perDay.slice(2)) { run = n ? 0 : run + 1; dry = Math.max(dry, run); }
    const avg = perDay.slice(3).reduce((a, b) => a + b, 0) / (perDay.length - 3);
    const most = Math.max(...perDay.slice(3).filter((n, i) => terms1[i + 3])); // a new term may open with a spree: he has a fortune and the prices start again
    return { dry, avg, most, mostEver: Math.max(...perDay.slice(3)), owned: G.owned(s), at50, s };
  };
  const keen = shopper([8, 13, 18, 22.5], 2);
  assert.ok(keen.dry <= 5, 'never more than a few days without something to buy: ' + keen.dry);
  assert.ok(keen.avg >= 1.5 && keen.avg <= 4, 'a couple of purchases a day: ' + keen.avg.toFixed(2));
  assert.ok(keen.most <= 8, 'and no sprees in the first term: ' + keen.most);
  assert.ok(keen.mostEver <= 32, 'not even when a new term starts: ' + keen.mostEver);
  assert.ok(keen.at50[1] >= 70 && keen.at50[1] <= 160, 'about a hundred things by level 50: ' + keen.at50[1]);
  const daily = shopper([19], 1);
  assert.ok(daily.dry <= 5, 'once a day, too: ' + daily.dry);
  assert.ok(daily.avg >= 0.8, 'about one a day: ' + daily.avg.toFixed(2));
  G.rng = seeded(7);
});
