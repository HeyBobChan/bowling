// "He needs you": when a pet that nobody is looking at should speak up, and what he says.
// Pure decisions, no sending: whoever carries the message (today the Canon agent) asks
// `decide` and remembers what it answered.
//
// The rules are written for a pet people keep for months. He speaks only in the keeper's
// daytime, never right after a visit, at most three times a day, and he goes quiet on his
// own when nobody comes: a toy that nags is a toy that gets muted.
import { G, C, inZone, wallIn } from './engine.mjs';

const HOUR = 3600e3, DAY = 24 * HOUR;

export const RULES = {
  dayStart: 8,              // keeper's local hours in which he may speak: 8:00 up to 22:00
  dayEnd: 22,
  afterVisit: 45 * 60e3,    // nothing for this long after anyone was with him
  gap: 3 * HOUR,            // between any two messages
  sameKindGap: 8 * HOUR,    // before he repeats himself about the same thing
  perDay: 3,
  fadeAfter: 3 * DAY,       // nobody for this long: once a day at most
  silentAfter: 10 * DAY,    // nobody for this long: nothing more, except that he has left
  leavingAt: 24,            // hours of neglect (he walks out at 36)
};

const LEAVING = [
  'I read a whole book today. Start to finish. I am starting to see both sides. Come quickly.',
  'I apologised to a waiter. And I meant it. Something is very wrong with me.',
  'Somebody talked for a full minute and I listened. I LISTENED. Please come.',
  'I said “I could be wrong” out loud today. Nobody was even there. Hurry.',
  'I looked in the mirror and thought: fine. Just fine. Not the best. This is an emergency.',
];
const GONE = [
  'I have gone to the golf course. Indefinitely. Nobody leaves better than me. You know where to find me.',
  'I waited. A long time. The longest. Then I stopped waiting. Come and say sorry and maybe, MAYBE, I come back.',
  'I left. Very dignified exit, people are calling it the best exit. Say sorry and we will see.',
];
const MORNING_STREAK = [
  'Day {n}. I showed up. Did you? The briefing is on the desk.',
  '{n} days in a row. A record, probably. Don’t be the one who breaks it.',
  'Good morning. Day {n}. Everybody is asking where you are. Everybody.',
  'Day {n} of the streak. I’m up. I’m ready. The briefing is waiting and so am I.',
];
const MORNING_POST = [
  'I posted at 3 AM. “{post}” {likes} likes. People are saying it is my best one.',
  'Couldn’t sleep. Posted. “{post}” {likes} likes already. You missed it.',
  'While you slept I was working. “{post}” {likes} likes. You’re welcome.',
];

const pick = (list) => list[Math.floor(G.rng() * list.length)];

export function freshMemory() {
  return { last: null, kinds: {}, day: '', count: 0, toldLeaving: false, toldGone: false };
}

/** What he would say about the state he is in, most pressing first; null when he is fine. */
function pressing(pet, memory, today, hour) {
  const { s, r, seen } = pet;
  if (s.sulking) return memory.toldGone ? null : { kind: 'gone', text: pick(GONE) };
  if (s.neglectH >= RULES.leavingAt && !memory.toldLeaving) return { kind: 'leaving', text: pick(LEAVING) };
  if (!s.asleep) {
    if (G.isHumble(s)) return { kind: 'humble', text: pick(C.HUMBLE_LINES) };
    const want = G.want(s);
    if (want) return { kind: 'want:' + want, text: G.say(s, want) };
  }
  // A morning word, only when there is something to say and the keeper has not been in today.
  if (hour < 12 && seen.day !== today) {
    const night = s.posts[0] && s.posts[0].night && r.events.some((e) => e.type === 'post3am') && s.last3am === today ? s.posts[0] : null;
    if (night) return { kind: 'morning', text: C.fill(pick(MORNING_POST), { post: night.t, likes: night.likes }) };
    if (s.streak.n >= 3 && s.streak.n > seen.streak) return { kind: 'morning', text: C.fill(pick(MORNING_STREAK), { n: s.streak.n }) };
  }
  return null;
}

/**
 * Should he speak now?
 * @param {object} pet     from engine.open(): the pet brought up to `now`, nothing saved
 * @param {number} now
 * @param {object} memory  what `decide` returned last time a message was really sent (or freshMemory())
 * @returns {{ alert: null | { kind: string, text: string }, memory: object }}
 *   `memory` is to be kept only once the message has gone out; when `alert` is null it is
 *   the old memory with its bookkeeping brought up to date, and is always safe to keep.
 */
export function decide(pet, now, memory) {
  const { s, zone, idleMs } = pet;
  const m = Object.assign(freshMemory(), memory, { kinds: Object.assign({}, memory && memory.kinds) });
  const quiet = { alert: null, memory: m };
  if (!s.hatched) return quiet;

  // Once he is back, or looked after again, the next episode may be announced afresh.
  if (!s.sulking) m.toldGone = false;
  if (s.neglectH < RULES.leavingAt / 2) m.toldLeaving = false;

  const wall = wallIn(zone, now);
  const today = inZone(zone, () => G.dayKey(now));
  if (m.day !== today) { m.day = today; m.count = 0; }

  if (wall.h < RULES.dayStart || wall.h >= RULES.dayEnd) return quiet;
  if (idleMs < RULES.afterVisit) return quiet;
  if (m.last && now - m.last.at < RULES.gap) return quiet;

  const found = inZone(zone, () => pressing(pet, m, today, wall.h));
  if (!found) return quiet;
  const final = found.kind === 'gone';
  if (!final) {
    if (idleMs >= RULES.silentAfter) return quiet;
    if (m.count >= (idleMs >= RULES.fadeAfter ? 1 : RULES.perDay)) return quiet;
    const before = m.kinds[found.kind];
    if (before && now - before < RULES.sameKindGap) return quiet;
  }

  const next = Object.assign({}, m, { kinds: Object.assign({}, m.kinds) });
  next.last = { at: now, kind: found.kind };
  next.kinds[found.kind] = now;
  next.count = m.count + 1;
  if (found.kind === 'gone') next.toldGone = true;
  if (found.kind === 'leaving') next.toldLeaving = true;
  for (const k of Object.keys(next.kinds)) if (now - next.kinds[k] > 2 * DAY) delete next.kinds[k];
  return { alert: found, memory: next };
}
