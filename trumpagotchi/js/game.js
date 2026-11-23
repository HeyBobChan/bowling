/* Trumpagotchi — the simulation. No DOM in here: state in, state out, plus a list of
   events for the screen to react to. Runs the same in a browser and in Node tests. */
(function (root) {
  'use strict';
  const TG = (root.TG = root.TG || {});
  const C = TG.content;
  const G = (TG.game = {});

  const SAVE_KEY = 'trumpagotchi.save.v1';
  const HOUR = 3600e3;
  const STEP_H = 1 / 6;             // catch-up resolution: ten minutes
  const MAX_CATCHUP_H = 24 * 21;    // beyond three weeks away nothing more can happen to him
  const OFFLINE_INCOME_H = 12;      // "the accountants only work half days"
  const POST_REGEN = 40 * 60e3;
  const POST_MAX = 3;

  G.NEEDS = ['food', 'ego', 'fun', 'glow', 'energy'];
  G.COST = { golf: 12, deal: 8, rally: 15 };

  // The clock can be nudged for tests and the ?debug panel.
  G.clockOffset = 0;
  G.now = function () { return Date.now() + G.clockOffset; };
  G.rng = Math.random;

  // The keeper's wall clock at time `t`: the day and the hour, which decide his nights, his
  // streak and the calendar. In a browser that is the device's own clock. A server looking
  // after a pet for its keeper (the Canon agent) swaps this for one that reads the keeper's
  // time zone, which the page records in the save as `zone`.
  G.wall = function (t) { const d = new Date(t); return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), h: d.getHours() }; };
  const ymd = function (y, m, d) { return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'); };

  // ---------------------------------------------------------------- levels
  G.cumXp = function (L) { return 60 * (L - 1) + 8 * (L - 1) * L; };
  G.levelFor = function (xp) {
    let L = 1;
    while (L < C.MAX_LEVEL && xp >= G.cumXp(L + 1)) L++;
    return L;
  };
  G.level = function (s) { return s.hatched ? G.levelFor(s.xp) : 0; };
  G.stageFor = function (level) {
    let st = C.STAGES[0];
    for (const x of C.STAGES) if (level >= x.min) st = x;
    return st;
  };
  G.stage = function (s) { return G.stageFor(G.level(s)); };
  G.tier = function (s) { return C.tierForLevel(G.level(s)); };
  G.progress = function (s) { // 0..1 within the current level
    const L = G.level(s);
    if (L >= C.MAX_LEVEL) return 1;
    const a = G.cumXp(L), b = G.cumXp(L + 1);
    return Math.max(0, Math.min(1, (s.xp - a) / (b - a)));
  };

  // ---------------------------------------------------------------- state
  G.newState = function (now) {
    return {
      v: 1,
      name: 'The Donald',
      born: now, lastTick: now,
      hatched: false, eggTaps: 0,
      xp: 0, cash: 0, term: 1,
      edits: 0, // counts the keeper's changes, so open copies on one device know which save is newest
      needs: { food: 55, ego: 55, fun: 55, glow: 55, energy: 80 },
      asleep: false, sulking: false, neglectH: 0,
      tariff: 0, bronzeUntil: 0, lastPetAt: 0,
      decor: [], orders: [], ach: {},
      posts: [], postCharges: POST_MAX, postChargeAt: now, last3am: '',
      zone: '', // the keeper's time zone (an IANA name), so a server can tell his night from his day
      seenBriefings: [], seasonsDone: {},
      daily: { day: '', cokes: 0, briefing: null, briefingDone: false, seasonGreeted: false },
      streak: { n: 0, last: '', best: 0 },
      stats: {
        burgers: 0, cokes: 0, salads: 0, feeds: 0, praises: 0, grooms: 0, golf: 0, golfHoles: 0,
        deals: 0, dealsWalked: 0, rallies: 0, posts: 0, posts3am: 0, hairTouches: 0, pets: 0,
        fired: 0, days: 0, bestCrowd: 0, bestDeal: 0, earned: 0, briefings: 0,
      },
      settings: { sound: true, alerts: false },
    };
  };

  function merge(base, saved) { // fill in anything a newer version added
    for (const k in base) {
      if (!(k in saved) || saved[k] == null) saved[k] = base[k];
      else if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) merge(base[k], saved[k]);
    }
    return saved;
  }

  // Whatever comes out of storage or a pasted code gets its shape checked, so an odd save
  // can never leave the page unable to start.
  function sanitize(s) {
    const num = function (v, lo, hi, d) { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
    const base = G.newState(0);
    for (const k of G.NEEDS) s.needs[k] = num(s.needs[k], 0, 100, 50);
    s.xp = num(s.xp, 0, G.cumXp(C.MAX_LEVEL) + 1, 0);
    s.cash = num(s.cash, 0, 1e30, 0);
    s.term = Math.floor(num(s.term, 1, 999, 1));
    s.edits = Math.floor(num(s.edits, 0, 1e12, 0));
    s.tariff = num(s.tariff, 0, 1e6, 0);
    s.neglectH = num(s.neglectH, 0, 1e4, 0);
    s.eggTaps = num(s.eggTaps, 0, 99, 0);
    s.postCharges = Math.floor(num(s.postCharges, 0, POST_MAX, POST_MAX));
    for (const k of ['born', 'lastTick', 'postChargeAt', 'bronzeUntil', 'lastPetAt']) s[k] = num(s[k], 0, 8.64e15, 0);
    s.hatched = !!s.hatched; s.asleep = !!s.asleep; s.sulking = !!s.sulking;
    s.name = String(s.name || base.name).slice(0, 18);
    const ids = function (arr, known) { return Array.isArray(arr) ? arr.filter(function (x, i) { return known.indexOf(x) >= 0 && arr.indexOf(x) === i; }) : []; };
    s.decor = ids(s.decor, C.DECOR.map(function (d) { return d.id; }));
    s.orders = ids(s.orders, C.ORDERS.map(function (o) { return o.id; }));
    s.seenBriefings = ids(s.seenBriefings, C.BRIEFINGS.map(function (b) { return b.id; }));
    s.posts = (Array.isArray(s.posts) ? s.posts : []).filter(function (p) { return p && typeof p.t === 'string'; }).slice(0, 30)
      .map(function (p) { return { t: p.t.slice(0, 400), at: num(p.at, 0, 8.64e15, 0), likes: String(p.likes || '0').slice(0, 24), night: !!p.night }; });
    if (!s.ach || typeof s.ach !== 'object' || Array.isArray(s.ach)) s.ach = {};
    if (!s.seasonsDone || typeof s.seasonsDone !== 'object') s.seasonsDone = {};
    for (const k in base.stats) s.stats[k] = num(s.stats[k], 0, 1e30, 0);
    s.streak = { n: Math.floor(num(s.streak.n, 0, 1e6, 0)), last: String(s.streak.last || ''), best: Math.floor(num(s.streak.best, 0, 1e6, 0)) };
    s.daily = {
      day: String(s.daily.day || ''), cokes: Math.floor(num(s.daily.cokes, 0, 1e4, 0)),
      briefing: typeof s.daily.briefing === 'string' ? s.daily.briefing : null, briefingDone: !!s.daily.briefingDone, seasonGreeted: !!s.daily.seasonGreeted,
    };
    s.last3am = String(s.last3am || '');
    s.zone = typeof s.zone === 'string' && /^[A-Za-z0-9_+\-\/]{1,64}$/.test(s.zone) ? s.zone : '';
    s.settings = { sound: s.settings.sound !== false, alerts: !!s.settings.alerts };
    return s;
  }

  let memoryStore = null; // used when localStorage is unavailable (private mode, sandboxed frame)
  function storage() {
    try {
      const ls = root.localStorage;
      if (!ls) return null;
      ls.getItem(SAVE_KEY);
      return ls;
    } catch (e) { return null; }
  }
  function revive(s, now) {
    if (!s || typeof s !== 'object' || s.v !== 1 || !s.needs || typeof s.needs !== 'object') return null;
    return sanitize(merge(G.newState(now), s));
  }
  G.revive = revive; // also used for a pet that arrives from the cloud
  // The save as it sits in storage right now, or null (nothing saved, or unreadable).
  G.stored = function (now) {
    let raw = null;
    const ls = storage();
    try { raw = ls ? ls.getItem(SAVE_KEY) : memoryStore; } catch (e) { raw = memoryStore; }
    if (!raw) return null;
    try { return revive(JSON.parse(raw), now); } catch (e) { return null; } // a corrupt save starts a new egg
  };
  G.load = function (now) { return G.stored(now) || G.newState(now); };
  // The save exactly as stored, unparsed: lets the page tell whether another copy of the
  // game on this device (a second tab, the installed app) has saved since it last did.
  G.SAVE_KEY = SAVE_KEY;
  G.storedRaw = function () {
    const ls = storage();
    try { return ls ? ls.getItem(SAVE_KEY) : memoryStore; } catch (e) { return memoryStore; }
  };
  G.save = function (s) {
    const raw = JSON.stringify(s);
    memoryStore = raw;
    const ls = storage();
    try { if (ls) ls.setItem(SAVE_KEY, raw); } catch (e) { /* quota or blocked: memory copy still holds */ }
    return raw;
  };
  G.wipe = function () {
    memoryStore = null;
    const ls = storage();
    try { if (ls) ls.removeItem(SAVE_KEY); } catch (e) { /* nothing to remove */ }
  };
  G.exportCode = function (s) {
    const json = JSON.stringify(s);
    const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, 'utf8').toString('base64');
    return 'TG1.' + b64;
  };
  G.importCode = function (code, now) {
    const m = /^TG1\.([A-Za-z0-9+/=]+)$/.exec(String(code).trim());
    if (!m) return null;
    try {
      const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(m[1]))) : Buffer.from(m[1], 'base64').toString('utf8');
      const s = JSON.parse(json);
      if (!s || typeof s.xp !== 'number') return null;
      return revive(s, now);
    } catch (e) { return null; }
  };

  // ---------------------------------------------------------------- helpers
  const clamp = function (v) { return v < 0 ? 0 : v > 100 ? 100 : v; };
  G.dayKey = function (t) { const w = G.wall(t); return ymd(w.y, w.m, w.d); };
  G.money = function (n) {
    const neg = n < 0; n = Math.abs(n);
    const units = [[1e15, 'Q'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    for (const u of units) {
      if (n >= u[0]) {
        const v = n / u[0];
        return (neg ? '-$' : '$') + (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + u[1];
      }
    }
    return (neg ? '-$' : '$') + Math.floor(n);
  };
  G.perks = function (s) {
    const p = { ego: 0, fun: 0, glow: 0, income: 0, xp: 0, golf: 0, coke: 0 };
    for (const d of C.DECOR) if (s.decor.indexOf(d.id) >= 0) for (const k in p) if (d[k]) p[k] += d[k];
    return p;
  };
  G.termBonus = function (s) { return 1 + 0.25 * (s.term - 1); };
  G.xpMult = function (s) { return (1 + G.perks(s).xp) * G.termBonus(s); };
  G.incomePerHour = function (s) {
    return 2000 * Math.pow(1.3, G.level(s)) * (1 + G.perks(s).income) * G.termBonus(s);
  };
  G.careAvg = function (s) { const n = s.needs; return (n.food + n.ego + n.fun + n.glow) / 4; };
  G.careMin = function (s) { const n = s.needs; return Math.min(n.food, n.ego, n.fun, n.glow); };
  G.isHumble = function (s) { return s.hatched && !s.sulking && G.careAvg(s) < 15; };
  G.mood = function (s) {
    if (!s.hatched) return 'egg';
    if (s.sulking) return 'gone';
    if (s.asleep) return 'asleep';
    if (G.isHumble(s)) return 'humble';
    const m = G.careMin(s);
    if (m < 12) return 'angry';
    if (m < 28) return 'sad';
    if (m >= 60) return 'happy';
    return 'ok';
  };
  // The thing he most wants right now, as a LINES key (or null when he is fine).
  G.want = function (s) {
    const n = s.needs;
    const list = [['hungry', n.food], ['needEgo', n.ego], ['bored', n.fun], ['needGlow', n.glow], ['tired', n.energy + 10]];
    list.sort(function (a, b) { return a[1] - b[1]; });
    return list[0][1] < 35 ? list[0][0] : null;
  };
  G.say = function (s, key, vars) {
    return C.fill(C.line(key, G.tier(s), G.rng), vars);
  };

  function unlock(s, id, ev, now) {
    if (s.ach[id]) return;
    s.ach[id] = now || G.now();
    ev.push({ type: 'ach', id: id });
  }
  function stageFloorXp(s) { return G.cumXp(Math.max(1, G.stage(s).min)); }

  function addXp(s, amount, ev, now) {
    if (!amount) return 0;
    const before = G.level(s), stageBefore = G.stage(s).id;
    let gained;
    if (amount > 0) {
      gained = amount * G.xpMult(s);
      s.xp = Math.min(s.xp + gained, G.cumXp(C.MAX_LEVEL) + 1);
    } else {
      const floor = stageFloorXp(s);
      const next = Math.max(Math.min(s.xp, floor), s.xp + amount);
      gained = next - s.xp;
      s.xp = next;
    }
    const after = G.level(s);
    if (after > before) {
      ev.push({ type: 'levelup', level: after });
      const st = G.stage(s);
      if (st.id !== stageBefore) ev.push({ type: 'evolve', stage: st.id, level: after });
      if (after >= 45) unlock(s, 'lv45', ev, now);
      if (after >= 47) unlock(s, 'lv47', ev, now);
      if (after >= 50) unlock(s, 'lv50', ev, now);
    }
    return gained;
  }
  G.addXp = addXp;

  function addCash(s, amount, ev, now) {
    s.cash = Math.max(0, s.cash + amount);
    if (amount > 0) s.stats.earned += amount;
    if (s.cash >= 1e9) unlock(s, 'billion', ev, now);
  }

  // Apply need deltas; returns how many points were actually restored (the basis for care XP).
  function applyNeeds(s, fx) {
    let restored = 0;
    for (const k of G.NEEDS) {
      if (!fx[k]) continue;
      const before = s.needs[k];
      s.needs[k] = clamp(before + fx[k]);
      if (fx[k] > 0 && k !== 'energy') restored += s.needs[k] - before;
    }
    return restored;
  }

  // ---------------------------------------------------------------- time
  // One slice of time. `o.offline` softens long absences; `o.unattended` lets him put himself to bed.
  function step(s, dtH, t, o, ev) {
    if (!s.hatched || s.sulking || dtH <= 0) return;
    const n = s.needs;
    const hour = G.wall(t).h;
    const night = hour >= 23 || hour < 6;
    const p = G.perks(s);
    const soft = o.offline && o.awayH > 10 ? 0.4 : 1;

    if (s.asleep) {
      n.energy = clamp(n.energy + 14 * dtH);
      n.food = clamp(n.food - 1.5 * dtH);
      n.glow = clamp(n.glow - 0.8 * dtH);
      if (hour === 3 && G.level(s) >= 24 && s.last3am !== G.dayKey(t)) {
        s.last3am = G.dayKey(t);
        const post = C.makePost(G.tier(s), G.rng, true);
        s.posts.unshift({ t: post.text, at: t, likes: C.likesFor(G.tier(s), G.rng), night: true });
        s.posts.length = Math.min(s.posts.length, 30);
        s.stats.posts3am++;
        n.energy = clamp(n.energy - 4);
        unlock(s, 'post3am', ev, t);
        ev.push({ type: 'post3am' });
      }
      // he sleeps through the night; a daytime nap ends once he is rested
      if (!night && n.energy >= 85) { s.asleep = false; ev.push({ type: 'woke' }); }
    } else {
      n.food = clamp(n.food - 5 * soft * dtH);
      n.ego = clamp(n.ego - 6 * (1 - p.ego) * soft * dtH);
      n.fun = clamp(n.fun - 4.5 * (1 - p.fun) * soft * dtH);
      n.glow = clamp(n.glow - 3 * (1 - p.glow) * soft * dtH);
      n.energy = clamp(n.energy - 4.5 * dtH);
      if (n.energy <= 4 || (o.unattended && night && n.energy < 70)) { s.asleep = true; ev.push({ type: 'slept' }); }
    }

    if (!s.asleep && G.careMin(s) >= 50) addXp(s, 5 * dtH, ev, t);
    if (G.careAvg(s) < 15) {
      if (!s.asleep) { s.neglectH += dtH; addXp(s, -3 * dtH, ev, t); }
      if (!s.ach.humble) unlock(s, 'humble', ev, t);
    } else {
      s.neglectH = Math.max(0, s.neglectH - 2 * dtH);
    }
    if (s.neglectH >= 36) { s.sulking = true; s.asleep = false; ev.push({ type: 'sulk' }); }

    if (o.incomeH == null || o.incomeH > 0) {
      const h = o.incomeH == null ? dtH : Math.min(dtH, o.incomeH);
      addCash(s, G.incomePerHour(s) * h, ev, t);
      if (o.incomeH != null) o.incomeH -= h;
    }
    while (s.postCharges < POST_MAX && t - s.postChargeAt >= POST_REGEN) { s.postCharges++; s.postChargeAt += POST_REGEN; }
    if (s.postCharges >= POST_MAX) s.postChargeAt = t;
  }

  // A new calendar day: streak, the day's briefing, counters.
  function rollDay(s, now, ev) {
    const today = G.dayKey(now);
    if (s.daily.day === today) return;
    const w = G.wall(now);
    const d = new Date(w.y, w.m, w.d, 12); // the keeper's calendar day, for the seasons
    const y = new Date(Date.UTC(w.y, w.m, w.d - 1));
    const yesterday = ymd(y.getUTCFullYear(), y.getUTCMonth(), y.getUTCDate());
    s.streak.n = s.streak.last === yesterday ? s.streak.n + 1 : 1;
    s.streak.last = today;
    s.streak.best = Math.max(s.streak.best, s.streak.n);
    s.stats.days++;
    s.daily = { day: today, cokes: 0, briefing: null, briefingDone: false, seasonGreeted: false };

    const season = C.seasonFor(d);
    const seasonKey = season + '-' + w.y;
    if (season && C.SEASON_BRIEFINGS[season] && !s.seasonsDone[seasonKey]) {
      s.daily.briefing = 'season:' + season;
    } else {
      let pool = C.BRIEFINGS.filter(function (b) { return s.seenBriefings.indexOf(b.id) < 0; });
      if (!pool.length) { s.seenBriefings = []; pool = C.BRIEFINGS; }
      s.daily.briefing = pool[Math.floor(G.rng() * pool.length)].id;
    }
    if (!s.hatched) return;
    const k = Math.min(s.streak.n, 7);
    const bonusCash = G.incomePerHour(s) * 2 * k;
    const bonusXp = addXp(s, 10 * k, ev, now);
    addCash(s, bonusCash, ev, now);
    if (s.streak.n >= 3) unlock(s, 'streak3', ev, now);
    if (s.streak.n >= 7) unlock(s, 'streak7', ev, now);
    if (s.streak.n >= 30) unlock(s, 'streak30', ev, now);
    if (s.streak.n >= 100) unlock(s, 'streak100', ev, now);
    ev.push({ type: 'newday', streak: s.streak.n, cash: bonusCash, xp: bonusXp, season: season });
  }

  // Bring the save up to `now`. Returns what happened, for the "while you were away" card.
  G.catchUp = function (s, now) {
    const ev = [];
    let dt = now - s.lastTick;
    if (dt < 0) dt = 0; // the device clock moved backwards: nothing happened
    const awayH = dt / HOUR;
    const before = { xp: s.xp, cash: s.cash, needs: Object.assign({}, s.needs), level: G.level(s), asleep: s.asleep, sulking: s.sulking };
    const offline = awayH > 5 / 60;
    if (s.hatched) {
      const total = Math.min(awayH, MAX_CATCHUP_H);
      const o = { offline: offline, unattended: offline, awayH: awayH, incomeH: offline ? OFFLINE_INCOME_H : null };
      let done = 0;
      const start = now - total * HOUR;
      while (done < total) {
        const h = Math.min(offline ? STEP_H : total, total - done);
        o.awayH = done;
        step(s, h, start + (done + h) * HOUR, o, ev);
        done += h;
      }
    }
    s.lastTick = now;
    rollDay(s, now, ev);
    return { awayH: awayH, offline: offline, events: ev, before: before };
  };

  // Human-readable recap of an absence.
  G.recap = function (s, r) {
    const lines = [];
    const b = r.before;
    const has = function (type) { return r.events.some(function (e) { return e.type === type; }); };
    if (has('sulk')) lines.push('He waited. Then he stopped waiting.');
    const dCash = s.cash - b.cash;
    if (dCash > 0) lines.push('Licensing income: +' + G.money(dCash) + (r.awayH > OFFLINE_INCOME_H ? ' (the accountants only work half days)' : ''));
    const dXp = Math.round(s.xp - b.xp);
    if (dXp > 0) lines.push('Tremendousness: +' + dXp);
    if (dXp < 0) lines.push('Tremendousness: ' + dXp + '. He was getting reasonable.');
    if (b.needs.food >= 35 && s.needs.food < 35) lines.push('He got hungry.');
    if (b.needs.ego >= 35 && s.needs.ego < 35) lines.push('Nobody told him he was great.');
    if (b.needs.fun >= 35 && s.needs.fun < 35) lines.push('He got bored.');
    if (b.needs.glow >= 35 && s.needs.glow < 35) lines.push('The hair lost altitude.');
    const posts = r.events.filter(function (e) { return e.type === 'post3am'; }).length;
    if (posts) lines.push('He posted at 3 AM' + (posts > 1 ? ' (' + posts + ' nights running).' : '.'));
    if (!b.asleep && s.asleep) lines.push('He put himself to bed.');
    if (b.asleep && !s.asleep) lines.push('He woke up on his own.');
    if (r.awayH >= 1 && !s.sulking) {
      const n = 2 + Math.floor(G.rng() * 9);
      lines.push(C.fill(C.AWAY_EVENTS[Math.floor(G.rng() * C.AWAY_EVENTS.length)], { n: n }));
    }
    return lines;
  };

  // ---------------------------------------------------------------- actions
  // Every action returns { ok, say?, anim?, events[] }.
  function res(ok, extra) { return Object.assign({ ok: ok, events: [] }, extra || {}); }
  function blocked(s) {
    if (!s.hatched) return 'egg';
    if (s.sulking) return 'gone';
    if (s.asleep) return 'asleep';
    return null;
  }

  G.EGG_TAPS = 8;
  G.tapEgg = function (s, now) {
    const r = res(true);
    if (s.hatched) return res(false);
    s.eggTaps++;
    if (s.eggTaps >= G.EGG_TAPS) {
      s.hatched = true;
      s.born = now; s.lastTick = now;
      s.cash = 1e6; // a small loan
      s.postChargeAt = now;
      unlock(s, 'hatched', r.events, now);
      r.hatched = true;
      r.say = C.EVOLVE_LINES.regular;
      r.events.push({ type: 'hatch' });
    }
    return r;
  };

  G.foodCost = function (s, f) { return f.tariff ? Math.round(f.cost * (1 + s.tariff / 100)) : f.cost; };
  G.feed = function (s, id, now) {
    const b = blocked(s); if (b) return res(false, { reason: b });
    const f = C.FOODS.find(function (x) { return x.id === id; });
    const cost = G.foodCost(s, f);
    if (s.cash < cost) return res(false, { reason: 'cash', say: G.say(s, 'noCash') });
    const n = s.needs;
    if (id === 'coke' ? (n.food >= 96 && n.energy >= 96) : n.food >= 96) return res(false, { reason: 'full', say: G.say(s, 'full'), anim: 'no' });
    const r = res(true, { anim: 'eat', item: id });
    const fx = { food: f.food, ego: f.ego, fun: f.fun, glow: f.glow, energy: f.energy };
    if (id === 'coke') fx.energy = f.energy * (1 + G.perks(s).coke);
    const restored = applyNeeds(s, fx);
    addCash(s, -cost, r.events, now);
    r.xp = addXp(s, restored * 0.4 + (f.xp || 0), r.events, now);
    s.stats.feeds++;
    if (id === 'hamberder') {
      s.stats.burgers++;
      if (s.stats.burgers >= 10) unlock(s, 'burger10', r.events, now);
      if (s.stats.burgers >= 100) unlock(s, 'burger100', r.events, now);
      r.say = G.say(s, 'ate', { food: f.word });
    } else if (id === 'coke') {
      s.stats.cokes++; s.daily.cokes++;
      if (s.daily.cokes >= 12) unlock(s, 'coke12', r.events, now);
      r.say = G.say(s, 'ateCoke', { n: s.daily.cokes });
    } else if (id === 'salad') {
      s.stats.salads++;
      s.tariff += 25;
      unlock(s, 'salad', r.events, now);
      if (s.tariff >= 500) unlock(s, 'tariff', r.events, now);
      r.say = G.say(s, 'ateSalad', { tariff: s.tariff });
      r.anim = 'yuck';
    } else {
      // some foods have things said only about them; otherwise he speaks about food in general
      const own = 'ate_' + id;
      r.say = C.LINES[own] && G.rng() < 0.6 ? G.say(s, own) : G.say(s, 'ate', { food: f.word });
    }
    return r;
  };

  G.praiseOptions = function () {
    const by = function (p) { const a = C.COMPLIMENTS.filter(function (c) { return c.p === p; }); return a[Math.floor(G.rng() * a.length)]; };
    const opts = [by(3), by(2), G.rng() < 0.4 ? by(0) : by(1)];
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(G.rng() * (i + 1)); const t = opts[i]; opts[i] = opts[j]; opts[j] = t; }
    return opts;
  };
  G.praise = function (s, opt, now) {
    const b = blocked(s); if (b) return res(false, { reason: b });
    const r = res(true);
    s.stats.praises++;
    if (opt.p === 0) {
      applyNeeds(s, { ego: C.PRAISE_EGO[0] });
      s.stats.fired++;
      unlock(s, 'fired', r.events, now);
      r.say = G.say(s, 'insulted'); r.anim = G.tier(s) >= 2 ? 'point' : 'sad';
      return r;
    }
    if (s.needs.ego >= 97) return res(false, { reason: 'full', say: G.say(s, 'notNeeded'), anim: 'no' });
    const restored = applyNeeds(s, { ego: C.PRAISE_EGO[opt.p] });
    r.xp = addXp(s, restored * 0.4 + opt.p, r.events, now);
    r.say = G.say(s, 'praised'); r.anim = opt.p === 3 ? 'dance' : 'thumbs';
    return r;
  };

  G.groom = function (s, id, now) {
    const b = blocked(s); if (b) return res(false, { reason: b });
    const g = C.GROOM.find(function (x) { return x.id === id; });
    if (s.needs.glow >= 97) return res(false, { reason: 'full', say: G.say(s, 'notNeeded'), anim: 'no' });
    const r = res(true, { anim: 'groom', item: id });
    const restored = applyNeeds(s, { glow: g.glow, ego: g.ego });
    if (id === 'bronzer') s.bronzeUntil = now + 20 * 60e3;
    s.stats.grooms++;
    r.xp = addXp(s, restored * 0.4, r.events, now);
    r.say = G.say(s, g.line);
    return r;
  };

  G.toggleSleep = function (s, now) {
    if (!s.hatched) return res(false, { reason: 'egg' });
    if (s.sulking) return res(false, { reason: 'gone' });
    if (s.asleep) { s.asleep = false; return res(true, { say: G.say(s, 'wake'), woke: true }); }
    if (s.needs.energy > 80) return res(false, { reason: 'awake', say: G.say(s, 'notTired'), anim: 'no' });
    s.asleep = true;
    return res(true, { say: G.say(s, 'sleep'), slept: true });
  };

  G.pet = function (s, now, onHair) {
    const b = blocked(s); if (b) return res(false, { reason: b });
    const r = res(true);
    if (onHair) {
      s.stats.hairTouches++;
      if (s.stats.hairTouches >= 10) unlock(s, 'hair', r.events, now);
      r.say = G.say(s, 'hair'); r.anim = G.tier(s) >= 2 ? 'angry' : 'idle';
      return r;
    }
    s.stats.pets++;
    if (now - s.lastPetAt > 30e3) {
      s.lastPetAt = now;
      const restored = applyNeeds(s, { ego: 4 });
      r.xp = addXp(s, 1 + restored * 0.4, r.events, now);
    }
    r.say = G.say(s, 'petted'); r.anim = 'thumbs';
    return r;
  };

  G.draftPost = function (s) { return C.makePost(G.tier(s), G.rng); };
  G.nextPostIn = function (s, now) { return s.postCharges >= POST_MAX ? 0 : Math.max(0, POST_REGEN - (now - s.postChargeAt)); };
  G.publish = function (s, draft, now) {
    const b = blocked(s); if (b) return res(false, { reason: b });
    if (s.postCharges < 1) return res(false, { reason: 'charges' });
    const r = res(true, { anim: 'thumbs' });
    if (s.postCharges >= POST_MAX) s.postChargeAt = now;
    s.postCharges--;
    const restored = applyNeeds(s, { ego: 12, fun: 6 });
    r.xp = addXp(s, 8 + restored * 0.2, r.events, now);
    s.posts.unshift({ t: draft.text, at: now, likes: C.likesFor(G.tier(s), G.rng) });
    s.posts.length = Math.min(s.posts.length, 30);
    s.stats.posts++;
    unlock(s, 'post1', r.events, now);
    if (s.stats.posts >= 50) unlock(s, 'post50', r.events, now);
    if (draft.covfefe) unlock(s, 'covfefe', r.events, now);
    r.say = G.say(s, 'posted');
    return r;
  };

  G.buyDecor = function (s, id, now) {
    if (!s.hatched) return res(false, { reason: 'egg' });
    const d = C.DECOR.find(function (x) { return x.id === id; });
    if (!d || s.decor.indexOf(id) >= 0) return res(false, { reason: 'owned' });
    if (s.cash < d.cost) return res(false, { reason: 'cash', say: G.say(s, 'noCash') });
    // The shop stays open while he sleeps or is out golfing. The delivery then waits for him
    // quietly: no dance and no remark until he is there to make one.
    const away = s.asleep ? 'asleep' : s.sulking ? 'gone' : null;
    const r = res(true, away ? { quiet: away } : { anim: 'dance' });
    addCash(s, -d.cost, r.events, now);
    s.decor.push(id);
    r.xp = addXp(s, 20, r.events, now);
    unlock(s, 'decor1', r.events, now);
    if (s.decor.length >= 6) unlock(s, 'decor6', r.events, now);
    if (s.decor.length >= C.DECOR.length) unlock(s, 'decor12', r.events, now);
    if (!away) r.say = G.say(s, 'bought');
    return r;
  };

  // ---------------------------------------------------------------- games
  G.canPlay = function (s, game) {
    const b = blocked(s); if (b) return { ok: false, reason: b };
    if (s.needs.energy < G.COST[game]) return { ok: false, reason: 'tired', say: G.say(s, 'lowEnergy') };
    return { ok: true };
  };
  G.finishGolf = function (s, holed, now) {
    const r = res(true);
    applyNeeds(s, { energy: -G.COST.golf });
    const restored = applyNeeds(s, { fun: 22 + 4 * holed, ego: 4 * holed });
    r.xp = addXp(s, (8 + 6 * holed) * (1 + G.perks(s).golf) + restored * 0.3, r.events, now);
    r.cash = G.incomePerHour(s) * 0.5 * holed;
    addCash(s, r.cash, r.events, now);
    s.stats.golf++; s.stats.golfHoles += holed;
    if (holed >= 3) unlock(s, 'golfhio', r.events, now);
    if (s.stats.golf >= 10) unlock(s, 'golf10', r.events, now);
    r.say = G.say(s, holed > 0 ? 'golfWin' : 'golfLose'); r.anim = holed > 0 ? 'dance' : (G.tier(s) >= 3 ? 'dance' : 'sad');
    return r;
  };
  G.dealBase = function (s) { return G.incomePerHour(s) * 3 * (0.8 + G.rng() * 0.4); };
  G.finishDeal = function (s, won, raises, amount, now) {
    const r = res(true);
    applyNeeds(s, { energy: -G.COST.deal });
    const restored = applyNeeds(s, { fun: 16, ego: won ? 6 + 2 * raises : -6 });
    r.xp = addXp(s, (won ? 10 + 4 * raises : 6) + restored * 0.3, r.events, now);
    r.cash = won ? amount : 0;
    addCash(s, r.cash, r.events, now);
    s.stats.deals++;
    if (won) { s.stats.bestDeal = Math.max(s.stats.bestDeal, amount); if (raises >= 4) unlock(s, 'dealbig', r.events, now); }
    else { s.stats.dealsWalked++; unlock(s, 'dealwalk', r.events, now); }
    r.say = G.say(s, won ? 'dealWin' : 'dealLose'); r.anim = won ? 'dance' : (G.tier(s) >= 3 ? 'point' : 'sad');
    return r;
  };
  G.crowdClaim = function (s, real) { return real * [1, 2, 10, 100, 10000][G.tier(s)]; };
  G.finishRally = function (s, taps, now) {
    const r = res(true);
    applyNeeds(s, { energy: -G.COST.rally });
    const restored = applyNeeds(s, { ego: Math.min(40, 12 + taps * 0.5), fun: 14 });
    r.xp = addXp(s, 8 + Math.min(16, taps / 4) + restored * 0.3, r.events, now);
    r.cash = G.incomePerHour(s) * Math.min(2, taps / 40);
    addCash(s, r.cash, r.events, now);
    r.real = 212 + taps * 37;
    r.claimed = G.crowdClaim(s, r.real);
    s.stats.rallies++; s.stats.bestCrowd = Math.max(s.stats.bestCrowd, r.claimed);
    if (taps >= 60) unlock(s, 'rallybig', r.events, now);
    r.say = G.say(s, 'rally', { real: r.real.toLocaleString('en-US'), claimed: r.claimed.toLocaleString('en-US') });
    r.anim = 'dance';
    return r;
  };

  // ---------------------------------------------------------------- briefing
  G.briefing = function (s) {
    if (!s.hatched || s.daily.briefingDone || !s.daily.briefing) return null;
    const id = s.daily.briefing;
    if (id.indexOf('season:') === 0) return C.SEASON_BRIEFINGS[id.slice(7)] || null;
    return C.BRIEFINGS.find(function (b) { return b.id === id; }) || null;
  };
  G.chooseBriefing = function (s, index, now) {
    const b0 = blocked(s); if (b0) return res(false, { reason: b0 });
    const br = G.briefing(s);
    if (!br) return res(false, { reason: 'done' });
    const ch = br.choices[index];
    const r = res(true, { anim: 'sign', result: ch.r });
    const fx = ch.fx;
    applyNeeds(s, fx);
    r.xp = addXp(s, fx.xp || 0, r.events, now);
    if (fx.cashH) { r.cash = G.incomePerHour(s) * fx.cashH; addCash(s, r.cash, r.events, now); }
    if (fx.tariff) s.tariff += fx.tariff;
    if (fx.ach) unlock(s, fx.ach, r.events, now);
    s.daily.briefingDone = true;
    s.stats.briefings++;
    if (s.daily.briefing.indexOf('season:') === 0) {
      s.seasonsDone[s.daily.briefing.slice(7) + '-' + G.wall(now).y] = true;
      const kinds = new Set(Object.keys(s.seasonsDone).map(function (k) { return k.replace(/-\d+$/, ''); })).size;
      if (kinds >= 3) unlock(s, 'season3', r.events, now);
      if (kinds >= 10) unlock(s, 'season10', r.events, now);
    }
    else s.seenBriefings.push(br.id);
    // then he signs something
    const left = C.ORDERS.filter(function (o) { return s.orders.indexOf(o.id) < 0; });
    if (left.length) {
      const o = left[Math.floor(G.rng() * left.length)];
      s.orders.push(o.id);
      r.order = o;
      addXp(s, 15, r.events, now);
      if (s.orders.length >= 10) unlock(s, 'orders10', r.events, now);
      if (s.orders.length >= C.ORDERS.length) unlock(s, 'ordersall', r.events, now);
    } else {
      r.bonus = G.incomePerHour(s) * 4;
      addCash(s, r.bonus, r.events, now);
    }
    r.say = G.say(s, 'signed');
    return r;
  };

  // ---------------------------------------------------------------- the long game
  G.winBack = function (s, now) {
    if (!s.sulking) return res(false);
    const r = res(true, { anim: 'thumbs' });
    s.sulking = false; s.neglectH = 0; s.asleep = false;
    s.needs = { food: 45, ego: 45, fun: 45, glow: 45, energy: 70 };
    addXp(s, -(s.xp - stageFloorXp(s)) * 0.25, r.events, now);
    unlock(s, 'comeback', r.events, now);
    s.lastTick = now;
    r.say = G.say(s, 'comeback');
    return r;
  };
  G.canRunAgain = function (s) { return s.hatched && G.level(s) >= C.MAX_LEVEL; };
  G.runAgain = function (s, now) {
    if (!G.canRunAgain(s)) return res(false);
    const r = res(true, { anim: 'dance' });
    s.term++;
    s.xp = 0; s.tariff = 0; s.neglectH = 0; s.asleep = false;
    s.needs = { food: 70, ego: 70, fun: 70, glow: 70, energy: 90 };
    if (s.term >= 2) unlock(s, 'term2', r.events, now);
    if (s.term >= 3) unlock(s, 'term3', r.events, now);
    r.events.push({ type: 'term', term: s.term });
    r.say = C.fill(C.line('another', 4, G.rng));
    return r;
  };

  G.roman = function (n) {
    const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const m of map) while (n >= m[0]) { out += m[1]; n -= m[0]; }
    return out || 'I';
  };

  // When (ms from now) the first need will cross `mark`, for background alerts.
  G.nextAlert = function (s, mark) {
    if (!s.hatched || s.sulking || s.asleep) return null;
    const p = G.perks(s);
    const rates = { food: 5, ego: 6 * (1 - p.ego), fun: 4.5 * (1 - p.fun), glow: 3 * (1 - p.glow) };
    let best = null;
    for (const k in rates) {
      if (s.needs[k] <= mark) continue;
      const ms = ((s.needs[k] - mark) / rates[k]) * HOUR;
      if (!best || ms < best.ms) best = { need: k, ms: ms };
    }
    return best;
  };
})(typeof window !== 'undefined' ? window : globalThis);
