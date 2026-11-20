// The game's own rules, on a server. These are the same content.js and game.js the page
// runs, so a pet looked after from elsewhere (the Canon agent) lives by exactly the rules
// it lives by on its keeper's phone. The one thing a server lacks is the keeper's clock:
// the page records their time zone in the save, and everything here reads it.
await import('../js/content.js');
await import('../js/game.js');

export const G = globalThis.TG.game;
export const C = globalThis.TG.content;

const clocks = new Map();
function clockFor(zone) {
  if (clocks.has(zone)) return clocks.get(zone);
  let clock = null;
  try {
    clock = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric' });
  } catch { /* not a zone this machine knows: UTC it is */ }
  if (clocks.size > 600) clocks.clear();
  clocks.set(zone, clock);
  return clock;
}

/** The wall clock in `zone` at time `t`, in the shape of the game's own `G.wall`. Unknown zones read as UTC. */
export function wallIn(zone, t) {
  const clock = zone ? clockFor(zone) : null;
  const d = new Date(t);
  if (!clock) return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours() };
  const p = {};
  for (const part of clock.formatToParts(d)) p[part.type] = Number(part.value);
  return { y: p.year, m: p.month - 1, d: p.day, h: p.hour % 24 };
}

/** Run the game's rules for a keeper in `zone`. Whatever `fn` does must be synchronous. */
export function inZone(zone, fn) {
  const device = G.wall;
  G.wall = (t) => wallIn(zone, t);
  try { return fn(); } finally { G.wall = device; }
}

/**
 * A stored pet brought up to `now`, as the keeper's own device would do on opening the page.
 * Nothing is saved: the caller decides whether what comes back is kept.
 * @returns {null | { s: object, r: object, zone: string, idleMs: number, seen: object }}
 *   `s` the pet now; `r` what happened meanwhile (see G.catchUp); `idleMs` how long since anyone
 *   was with him; `seen` the day and streak as they stood at that last visit.
 */
export function open(state, now) {
  let s = null;
  try { s = G.revive(JSON.parse(JSON.stringify(state)), now); } catch { /* not a save */ }
  if (!s) return null;
  const idleMs = Math.max(0, now - s.lastTick);
  const seen = { day: s.daily.day, streak: s.streak.n };
  const r = inZone(s.zone, () => G.catchUp(s, now));
  return { s, r, zone: s.zone, idleMs, seen };
}

/** The pet as the cloud keeps it: sound and alert switches stay with each device. */
export function forCloud(s) {
  const c = JSON.parse(JSON.stringify(s));
  delete c.settings;
  return c;
}
