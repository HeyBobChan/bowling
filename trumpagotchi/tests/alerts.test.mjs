// The keeper's time zone on a server, and when a pet nobody is watching speaks up: `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { G, open, inZone, wallIn, forCloud } from '../server/engine.mjs';
import { decide, freshMemory, RULES } from '../server/alerts.mjs';

const HOUR = 3600e3, DAY = 24 * HOUR;
const utc = (y, m, d, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min);
function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

// A hatched pet last looked after at `t`, in `zone`, with everything comfortable.
function petAt(t, zone = 'UTC', patch = {}) {
  G.rng = seeded(11);
  const s = G.newState(t);
  inZone(zone, () => { G.catchUp(s, t); for (let i = 0; i < G.EGG_TAPS; i++) G.tapEgg(s, t); });
  s.zone = zone;
  s.needs = { food: 90, ego: 90, fun: 90, glow: 90, energy: 90 };
  Object.assign(s.needs, patch.needs);
  delete patch.needs;
  return Object.assign(s, patch);
}

test('zones: the wall clock is the keeper’s, wherever the server is', () => {
  assert.deepEqual(wallIn('Asia/Jerusalem', utc(2026, 7, 1, 21, 30)), { y: 2026, m: 6, d: 2, h: 0 });
  assert.deepEqual(wallIn('America/New_York', utc(2026, 1, 15, 3)), { y: 2026, m: 0, d: 14, h: 22 });
  assert.deepEqual(wallIn('Asia/Kolkata', utc(2026, 12, 31, 18, 29)), { y: 2026, m: 11, d: 31, h: 23 });
  assert.deepEqual(wallIn('Asia/Kolkata', utc(2026, 12, 31, 18, 30)), { y: 2027, m: 0, d: 1, h: 0 });
  // no zone, or one this machine has never heard of, reads as UTC rather than failing
  for (const zone of ['', 'Mars/Olympus_Mons']) assert.deepEqual(wallIn(zone, utc(2026, 3, 9, 7)), { y: 2026, m: 2, d: 9, h: 7 });
  const device = G.wall;
  assert.equal(inZone('Pacific/Auckland', () => G.dayKey(utc(2026, 7, 1, 13))), '2026-07-02');
  assert.throws(() => inZone('UTC', () => { throw new Error('boom'); }));
  assert.equal(G.wall, device, 'the device clock is put back, even after an error');
});

test('zones: he sleeps through the keeper’s night, not the server’s', () => {
  // 10:00 UTC is 22:00 in Auckland (July). Four hours on it is 02:00 there, and midday-ish for the server.
  const start = utc(2026, 7, 1, 10);
  const there = open(forCloud(petAt(start, 'Pacific/Auckland', { needs: { energy: 60 } })), start + 4 * HOUR);
  assert.equal(there.s.asleep, true);
  const here = open(forCloud(petAt(start, 'UTC', { needs: { energy: 60 } })), start + 4 * HOUR);
  assert.equal(here.s.asleep, false);
  assert.equal(there.zone, 'Pacific/Auckland');
  assert.ok(Math.abs(there.idleMs - 4 * HOUR) < 1000);
});

test('zones: the streak counts the keeper’s days', () => {
  // Visits at 23:30 and 00:30 Jerusalem time are two days there and one day in UTC.
  const late = utc(2026, 7, 1, 20, 30);
  const s = petAt(late, 'Asia/Jerusalem');
  assert.equal(s.streak.n, 1);
  const next = open(forCloud(s), late + HOUR);
  assert.equal(next.s.streak.n, 2);
  assert.equal(next.s.daily.day, '2026-07-02');
  assert.deepEqual(next.seen, { day: '2026-07-01', streak: 1 });
  const utcPet = open(forCloud(petAt(late, 'UTC')), late + HOUR);
  assert.equal(utcPet.s.streak.n, 1);
});

test('zones: a save keeps a sane zone and drops anything else', () => {
  const t = utc(2026, 3, 2, 9);
  assert.equal(G.revive(Object.assign(forCloud(petAt(t)), { zone: 'America/Argentina/Buenos_Aires' }), t).zone, 'America/Argentina/Buenos_Aires');
  assert.equal(G.revive(Object.assign(forCloud(petAt(t)), { zone: 'Etc/GMT+5' }), t).zone, 'Etc/GMT+5');
  for (const bad of [42, null, 'x'.repeat(65), 'Europe/<script>', { a: 1 }]) assert.equal(G.revive(Object.assign(forCloud(petAt(t)), { zone: bad }), t).zone, '');
  const old = forCloud(petAt(t)); delete old.zone; // a save from before zones existed
  assert.equal(G.revive(old, t).zone, '');
  assert.equal(open({ not: 'a save' }, t), null);
});

// ---------------------------------------------------------------- when he speaks
const noon = utc(2026, 3, 4, 12);
const hungryAt = (now, idle = 2 * HOUR, zone = 'UTC', patch = {}) => open(forCloud(petAt(now - idle, zone, Object.assign({ needs: { food: 30 } }, patch))), now);

test('alerts: a hungry pet that has been alone a while says so, in his own words', () => {
  const pet = hungryAt(noon);
  assert.equal(G.want(pet.s), 'hungry');
  const { alert, memory } = decide(pet, noon, freshMemory());
  assert.equal(alert.kind, 'want:hungry');
  assert.ok(alert.text.length > 5);
  assert.deepEqual(memory.last, { at: noon, kind: 'want:hungry' });
  assert.equal(memory.count, 1);
  assert.equal(memory.day, '2026-03-04');
});

test('alerts: a pet that is fine says nothing, and neither does an egg', () => {
  assert.equal(decide(open(forCloud(petAt(noon - 2 * HOUR)), noon), noon, freshMemory()).alert, null);
  const egg = G.newState(noon - DAY);
  assert.equal(decide(open(egg, noon), noon, freshMemory()).alert, null);
});

test('alerts: not right after a visit', () => {
  assert.equal(decide(hungryAt(noon, 20 * 60e3), noon, freshMemory()).alert, null);
  assert.ok(decide(hungryAt(noon, RULES.afterVisit + 60e3), noon, freshMemory()).alert);
});

test('alerts: only in the keeper’s daytime', () => {
  // 20:00 UTC is 23:00 in Jerusalem (winter: 22:00). Use summer, and keep him awake by hand.
  const evening = utc(2026, 7, 1, 20);
  const awake = (zone) => { const p = hungryAt(evening, 2 * HOUR, zone); p.s.asleep = false; return p; };
  assert.equal(decide(awake('Asia/Jerusalem'), evening, freshMemory()).alert, null, '23:00 there');
  assert.ok(decide(awake('UTC'), evening, freshMemory()).alert, '20:00 there');
  const early = utc(2026, 7, 1, 7, 30);
  const up = hungryAt(early, 2 * HOUR, 'UTC'); up.s.asleep = false;
  assert.equal(decide(up, early, freshMemory()).alert, null, 'before 8');
  // asleep in the daytime: he does not talk in his sleep
  const napping = hungryAt(noon); napping.s.asleep = true;
  assert.equal(decide(napping, noon, freshMemory()).alert, null);
});

test('alerts: spaced out, never the same complaint twice in a row, three a day at most', () => {
  let memory = decide(hungryAt(noon), noon, freshMemory()).memory;
  const bored = (now) => open(forCloud(petAt(now - 2 * HOUR, 'UTC', { needs: { fun: 30 } })), now);
  assert.equal(decide(bored(noon + HOUR), noon + HOUR, memory).alert, null, 'too soon after the last one');
  assert.equal(decide(hungryAt(noon + 4 * HOUR), noon + 4 * HOUR, memory).alert, null, 'he said that already');
  const second = decide(bored(noon + 4 * HOUR), noon + 4 * HOUR, memory);
  assert.equal(second.alert.kind, 'want:bored');
  memory = second.memory;
  const third = decide(open(forCloud(petAt(noon + 5 * HOUR, 'UTC', { needs: { glow: 20 } })), noon + 8 * HOUR), noon + 8 * HOUR, memory);
  assert.equal(third.alert.kind, 'want:needGlow');
  assert.equal(third.memory.count, 3);
  // a fourth thing the same day waits for tomorrow
  const day2 = noon + 9.5 * HOUR;
  const fourth = open(forCloud(petAt(day2 - 2 * HOUR, 'UTC', { needs: { ego: 20 } })), day2); fourth.s.asleep = false;
  assert.equal(decide(fourth, day2, Object.assign({}, third.memory, { last: { at: noon, kind: 'x' } })).alert, null);
  const tomorrow = noon + DAY;
  const again = decide(hungryAt(tomorrow), tomorrow, third.memory);
  assert.equal(again.alert.kind, 'want:hungry');
  assert.equal(again.memory.count, 1);
  assert.equal(again.memory.day, '2026-03-05');
});

test('alerts: he gives up nagging someone who does not come', () => {
  const alone = (days) => { const p = hungryAt(noon, days * DAY); p.s.asleep = false; p.s.sulking = false; p.s.neglectH = 0; p.s.needs.food = 20; return p; };
  const once = decide(alone(4), noon, freshMemory());
  assert.ok(once.alert, 'after four days alone: still once a day');
  assert.equal(decide(alone(4), noon + 4 * HOUR, Object.assign({}, once.memory, { kinds: {} })).alert, null, 'but only once');
  assert.equal(decide(alone(11), noon, freshMemory()).alert, null, 'after eleven days: nothing');
});

test('alerts: before he leaves he warns once, and when he has left he says so once', () => {
  const worried = hungryAt(noon); worried.s.neglectH = 25; worried.s.asleep = false;
  const warn = decide(worried, noon, freshMemory());
  assert.equal(warn.alert.kind, 'leaving');
  assert.equal(warn.memory.toldLeaving, true);
  const later = hungryAt(noon + 9 * HOUR - 9 * HOUR + 4 * HOUR); later.s.neglectH = 30; later.s.asleep = false;
  const after = decide(later, noon + 4 * HOUR, warn.memory);
  assert.notEqual(after.alert && after.alert.kind, 'leaving');

  const gone = hungryAt(noon, 12 * DAY); gone.s.sulking = true;
  const bye = decide(gone, noon, freshMemory());
  assert.equal(bye.alert.kind, 'gone', 'even after a long silence');
  assert.equal(decide(gone, noon + DAY, bye.memory).alert, null, 'and never again for the same walkout');
  // won back, then lost again: a new walkout is a new message
  const back = hungryAt(noon + 2 * DAY, 2 * HOUR);
  const calm = decide(back, noon + 2 * DAY, Object.assign({}, bye.memory, { last: null, kinds: {} }));
  assert.equal(calm.memory.toldGone, false);
});

test('alerts: a morning word when there is a streak to keep, and not otherwise', () => {
  const nineAm = utc(2026, 3, 5, 9);
  const yesterday = petAt(nineAm - 14 * HOUR, 'UTC', { needs: { food: 100, ego: 100, fun: 100, glow: 100, energy: 100 } });
  yesterday.streak = { n: 4, last: '2026-03-04', best: 4 };
  const pet = open(forCloud(yesterday), nineAm);
  pet.s.asleep = false;
  for (const k of G.NEEDS) pet.s.needs[k] = 80;
  assert.equal(pet.s.streak.n, 5);
  const morning = decide(pet, nineAm, freshMemory());
  assert.equal(morning.alert.kind, 'morning');
  assert.match(morning.alert.text, /5/);
  assert.equal(decide(pet, nineAm + 4 * HOUR, freshMemory()).alert, null, 'not in the afternoon');

  const fresh = petAt(nineAm - 14 * HOUR, 'UTC', { needs: { food: 100, ego: 100, fun: 100, glow: 100, energy: 100 } });
  const newbie = open(forCloud(fresh), nineAm); newbie.s.asleep = false;
  for (const k of G.NEEDS) newbie.s.needs[k] = 80;
  assert.equal(decide(newbie, nineAm, freshMemory()).alert, null, 'a two-day streak is not worth a message');
});

test('alerts: he reports what he posted at 3 AM', () => {
  const evening = utc(2026, 3, 4, 21);
  const s = petAt(evening, 'UTC', { needs: { food: 100, ego: 100, fun: 100, glow: 100, energy: 50 } });
  s.xp = G.cumXp(30); // old enough to post at night
  const nineAm = utc(2026, 3, 5, 9);
  const pet = open(forCloud(s), nineAm);
  assert.ok(pet.r.events.some((e) => e.type === 'post3am'));
  pet.s.asleep = false;
  for (const k of G.NEEDS) pet.s.needs[k] = 80;
  const { alert } = decide(pet, nineAm, freshMemory());
  assert.equal(alert.kind, 'morning');
  assert.ok(alert.text.includes(pet.s.posts[0].t));
});

test('alerts: deciding never changes what was stored', () => {
  const stored = forCloud(petAt(noon - 2 * HOUR, 'UTC', { needs: { food: 30 } }));
  const copy = JSON.stringify(stored);
  decide(open(stored, noon), noon, freshMemory());
  assert.equal(JSON.stringify(stored), copy);
});
