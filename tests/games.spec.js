import { test, expect } from '@playwright/test';

// Every game exposes window.__<game> with step(dt); `?sim` stops its own loop so the
// test owns time. These checks guard the balance rules written in design/*.md — the
// ones that were broken when the games were first reviewed.

async function load(page, path, hook) {
  await page.goto(`${path}?sim`);
  await page.waitForFunction((h) => !!window[h], hook, { timeout: 30_000 });
}

test.describe('Header Penalties', () => {
  test('the keeper covers his silhouette, not a fixed zone', async ({ page }) => {
    await load(page, '/pendel.html', '__pendel');
    const r = await page.evaluate(() => {
      const P = window.__pendel;
      Object.assign(P.keeper, { x: 0, y: 0, lean: 0 });
      const standing = { low: P.keeperSaves(0, 1.0), highCentre: P.keeperSaves(0, 4.2), corner: P.keeperSaves(5.2, 1.0) };
      P.keeper.y = 2.3;
      const jumping = { highCentre: P.keeperSaves(0, 4.2) };
      P.keeper.y = 0; P.keeper.x = 4.2; P.keeper.lean = -0.8;
      const diving = { corner: P.keeperSaves(5.2, 1.0) };
      return { standing, jumping, diving };
    });
    expect(r.standing.low).toBe(true);
    expect(r.standing.highCentre).toBe(false);
    expect(r.standing.corner).toBe(false);
    expect(r.jumping.highCentre).toBe(true);
    expect(r.diving.corner).toBe(true);
  });

  test('no free goals: dead-centre shots are sometimes saved, and a round ends after five kicks', async ({ page }) => {
    await load(page, '/pendel.html', '__pendel');
    const r = await page.evaluate(() => {
      const P = window.__pendel; const dt = 1 / 60;
      const headDist = () => Math.hypot(P.ball.position.x - P.player.position.x, P.ball.position.y - 2.92, P.ball.position.z - P.player.position.z);
      const rounds = (y, n) => {
        let goals = 0, kicks = 0, endedOver = 0;
        for (let r = 0; r < n; r++) {
          P.startGame('1p'); P.state.roundsPlayed = 0;
          for (let k = 0; k < 5; k++) {
            let g = 0; while (P.state.phase !== 'incoming' && g++ < 400) P.step(dt);
            P.reticle.position.x = 0; P.reticle.position.y = y;
            g = 0; while (P.state.phase === 'incoming' && g++ < 3000) { P.step(dt); if (headDist() < 0.9) { P.tryHeader(); break; } }
            g = 0; while ((P.state.phase === 'incoming' || P.state.phase === 'headed') && g++ < 3000) P.step(dt);
            kicks++;
          }
          goals += P.state.goals;
          let g = 0; while (P.state.phase === 'result' && g++ < 200) P.step(dt);
          if (P.state.phase === 'over') endedOver++;
        }
        return { goals, kicks, endedOver };
      };
      return { high: rounds(4.2, 3), low: rounds(1.0, 3) };
    });
    for (const k of ['high', 'low']) {
      expect(r[k].kicks).toBe(15);
      expect(r[k].goals).toBeGreaterThan(0);
      expect(r[k].goals).toBeLessThan(15);
      expect(r[k].endedOver).toBe(3);
    }
  });

  test('two-player mode swaps roles and reaches the final card on its own', async ({ page }) => {
    await load(page, '/pendel.html', '__pendel');
    const r = await page.evaluate(() => {
      const P = window.__pendel; const dt = 1 / 60;
      P.startGame('2p');
      let g = 0; while (P.state.phase !== 'over' && g++ < 60 * 120) P.step(dt);
      return { phase: P.state.phase, round: P.state.round, scores: P.state.scores, title: document.getElementById('goTitle').textContent };
    });
    expect(r.phase).toBe('over');
    expect(r.round).toBe(2);
    expect(r.scores).toEqual([0, 0]);
    expect(r.title).toContain('תיקו');
  });
});

test.describe('Bowling Escape', () => {
  test('a dodging ball rolls, strikes and stays finite; the crowd grows with rolling and strikes; no ending but a catch', async ({ page }) => {
    await load(page, '/bowling.html', '__game');
    const r = await page.evaluate(() => {
      const G = window.__game; const dt = 1 / 60;
      const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
      const held = {}; const set = (c, on) => { if (!!held[c] !== on) { held[c] = on; key(c, on); } };
      const release = () => ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'Space'].forEach((c) => set(c, false));
      // the lane winds, so the controller thinks in lane coordinates: s along it, d across it.
      // "up" is read relative to the camera, which follows the lane, so holding it rolls on.
      const controller = () => {
        const bs = G.state.s, bd = G.state.d;
        let threat = null, td = 1e9;
        for (const m of G.state.monsters) { const ds = m.userData.s - bs, dd = m.userData.d - bd; if (ds > -3 && ds < 16 && Math.abs(dd) < 5) { const d = Math.hypot(dd, ds); if (d < td) { td = d; threat = m; } } }
        let tx = 0, best = 1e9; for (const rk of G.state.racks) { const ds = rk.s - bs; if (ds > 0 && ds < best) { best = ds; tx = rk.d; } }
        let steer = Math.abs(tx - bd) > 0.8 ? Math.sign(tx - bd) : 0;
        if (threat) { steer = threat.userData.d - bd > 0 ? -1 : 1; if (Math.abs(bd) > 10) steer = -Math.sign(bd); }
        set('ArrowUp', true); set('ArrowLeft', steer < 0); set('ArrowRight', steer > 0); set('Space', !!threat);
      };
      G.startGame();
      let steps = 0, finite = true, maxTurn = 0, maxD = 0, offLane = 0;
      while (G.state.phase !== 'over' && steps < 60 * 45) {
        controller(); G.step(dt); steps++;
        if (!Number.isFinite(G.ball.position.x + G.ball.position.z)) { finite = false; break; }
        maxTurn = Math.max(maxTurn, Math.abs(G.state.heading));
        maxD = Math.max(maxD, Math.abs(G.state.d));
        for (const m of G.state.monsters) if (Math.abs(m.userData.d) > G.LANE_HALF + 1.01) offLane++;
      }
      release();
      const run = { secs: steps / 60, strikes: G.state.strikes, finite, maxTurn, maxD, offLane, dist: G.state.s, kinds: new Set(G.state.monsters.map((m) => m.userData.kind)).size };
      // lane coordinates must round-trip through the world, far round the bends ahead too
      const s0 = G.state.s;
      const roundTrip = [[50, 0], [120, 8], [205, -11.5], [300, 4]].map(([ds, d]) => { const L = G.lane(G.track.point(s0 + ds, d)); return Math.max(Math.abs(L.s - s0 - ds), Math.abs(L.d - d)); });
      const bends = G.track.segments.filter((g) => g.k !== 0).length;
      // the crowd cap: starts small, grows with rolling time and with strikes, never ends the game
      G.startGame();
      const capStart = G.crowdCap();
      G.state.worldTime = 60;
      const capAfterRolling = G.crowdCap();
      let guard = 0; while (G.state.strikes < 12 && guard++ < 900) { if (G.state.racks.length) G.doStrike(G.state.racks[0]); G.step(dt); }
      const capAfterStrikes = G.crowdCap();
      for (let i = 0; i < 60 * 3; i++) G.step(dt);
      return { run, roundTrip, bends, capStart, capAfterRolling, capAfterStrikes, strikes: G.state.strikes, phase: G.state.phase, monsters: G.state.monsters.length };
    });
    expect(r.run.finite).toBe(true);
    expect(r.run.strikes).toBeGreaterThanOrEqual(2);
    // the lane twists and turns: the run met real bends, and nothing left the lane
    expect(r.run.dist).toBeGreaterThan(200);
    expect(r.run.maxTurn).toBeGreaterThan(0.3);
    expect(r.run.maxD).toBeLessThanOrEqual(12.001);
    expect(r.run.offLane).toBe(0);
    expect(r.bends).toBeGreaterThan(0);
    for (const err of r.roundTrip) expect(err).toBeLessThan(0.05);
    expect(r.capStart).toBe(3);
    expect(r.capAfterRolling).toBeGreaterThan(r.capStart);
    expect(r.capAfterStrikes).toBeGreaterThan(r.capAfterRolling);
    expect(r.strikes).toBeGreaterThanOrEqual(12);
    expect(r.phase).toBe('play');
  });
});

test.describe('Dino Maze', () => {
  test('eating opens the exit and calls the second dragon; the exit wins; the clock brings overtime', async ({ page }) => {
    await load(page, '/dino.html', '__dino');
    const r = await page.evaluate(() => {
      const D = window.__dino; const dt = 1 / 60;
      const P = D.player.group.position;
      D.startGame();
      for (let k = 0; k < 15; k++) { D.dinos[0].group.position.set(P.x, 0, P.z); D.step(dt); }
      const fed = { eaten: D.state.eaten, combo: D.state.combo, dragons: D.dragons.length, exitOpen: D.exit.active };
      P.set(D.exit.group.position.x, 0, D.exit.group.position.z);
      for (let i = 0; i < 60 * 3; i++) D.step(dt);
      const won = { phase: D.state.phase, title: document.getElementById('goTitle').textContent };
      D.startGame(); D.state.t = 149.6; for (let i = 0; i < 90; i++) D.step(dt);
      return { fed, won, overtime: D.state.overtime, finite: Number.isFinite(P.x + P.z) };
    });
    expect(r.fed).toEqual({ eaten: 15, combo: 15, dragons: 2, exitOpen: true });
    expect(r.won.phase).toBe('over');
    expect(r.won.title).toContain('🏆');
    expect(r.overtime).toBe(true);
    expect(r.finite).toBe(true);
  });
});

test.describe('Punch Game', () => {
  test('the forest does not wipe itself out while the cat runs away; restart and two-player work', async ({ page }) => {
    await load(page, '/punch.html', '__punch');
    const r = await page.evaluate(() => {
      const G = window.__punch; const dt = 1 / 60;
      const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
      const held = {}; const set = (c, on) => { if (!!held[c] !== on) { held[c] = on; key(c, on); } };
      const pos = (f) => (f.removed ? null : f.body.translation());
      const npcsAlive = () => G.fighters.filter((f) => !f.isPlayer && f.alive && !f.removed).length;
      G.startMatch(false);
      const cat = G.fighters[0];
      let aliveAt15 = null, hunted = false;
      for (let i = 0; i < 60 * 20; i++) {
        const p = pos(cat);
        if (p) {
          let best = null, bd = 1e9;
          for (const f of G.fighters) { if (f.isPlayer || !f.alive || f.removed) continue; const q = pos(f); const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q; } }
          if (best) { let dx = p.x - best.x, dz = p.z - best.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; const rr = Math.hypot(p.x, p.z); if (rr > 15) { dx += (-p.x / rr) * 1.1; dz += (-p.z / rr) * 1.1; } set('ArrowRight', dx > 0.35); set('ArrowLeft', dx < -0.35); set('ArrowDown', dz > 0.35); set('ArrowUp', dz < -0.35); }
        }
        G.step(dt);
        if (G.fighters.some((f) => !f.isPlayer && f.alive && f.ai.target && f.ai.target.isPlayer)) hunted = true;
        if (i === 60 * 15) aliveAt15 = npcsAlive();
        if (!cat.alive) break;
      }
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].forEach((c) => set(c, false));
      if (aliveAt15 === null) aliveAt15 = npcsAlive();
      G.startMatch(true); for (let i = 0; i < 120; i++) G.step(dt);
      const twoP = { fighters: G.fighters.length, cards: document.querySelectorAll('.card').length, second: G.fighters[1].spec.key };
      G.startMatch(false); for (let i = 0; i < 60; i++) G.step(dt);
      const oneP = { fighters: G.fighters.length, cards: document.querySelectorAll('.card').length, state: G.state };
      return { aliveAt15, hunted, twoP, oneP };
    });
    expect(r.aliveAt15).toBeGreaterThanOrEqual(2);
    expect(r.hunted).toBe(true);
    expect(r.twoP).toEqual({ fighters: 6, cards: 6, second: 'cat2' });
    expect(r.oneP).toEqual({ fighters: 5, cards: 5, state: 'play' });
  });
});

test.describe('Kelpie Downhill', () => {
  // helpers that run in the page: teleporting, finding things ahead, a course-following skier and a
  // line-of-sight check against the pines as they are drawn (a ducked tree is drawn smaller)
  const installHelpers = () => {
    const S = window.__ski, st = S.state, inp = S.input, dt = 1 / 60, L = S.T.chunkLen;
    const H = {};
    H.settle = (x, z, speed) => { Object.assign(st, { x, z, speed, heading: 0, lean: 0, leanVel: 0, kick: 0, prevTurn: 0, air: false, jumpBuf: 0 }); st.y = S.terrainH(x, z); };
    H.next = (kind, dz) => () => {
      for (const c of [...S.chunks.values()].sort((a, b) => a.i - b.i)) {
        for (const o of (kind === 'gold' ? [c.gold].filter(Boolean) : c[kind])) if (o.z > st.z + dz && !o.done && !o.taken) return o;
      }
      return null;
    };
    H.seek = (pick) => {                                                    // teleport down the line until one turns up
      for (let guard = 0; guard < 30; guard++) { const o = pick(); if (o) return o; H.settle(S.courseX(st.z + 100), st.z + 100, 14); S.step(dt); }
      return null;
    };
    H.occluded = (a, b, drawn) => {
      for (const c of S.chunks.values()) for (const t of c.trees) {
        const s = t.s * (drawn ? t.vis : 1), w = t.w;
        if (s < 0.05 || t.x < Math.min(a.x, b.x) - 3 || t.x > Math.max(a.x, b.x) + 3 || t.z < Math.min(a.z, b.z) - 3 || t.z > Math.max(a.z, b.z) + 3) continue;
        const gy = S.terrainH(t.x, t.z) - 0.15;
        for (let k = 1; k < 24; k++) {                                      // the canopy as one cone, 2.6 s wide at 1.2 s, tip at 8.7 s
          const u = k / 24, px = a.x + (b.x - a.x) * u, py = a.y + (b.y - a.y) * u, pz = a.z + (b.z - a.z) * u, h = py - gy;
          if (h < 1.2 * s || h > 8.7 * s) continue;
          const r = (2.6 * s * w * (8.7 * s - h)) / (7.5 * s);
          if ((px - t.x) ** 2 + (pz - t.z) ** 2 < r * r) return true;
        }
      }
      return false;
    };
    // a skier who aims a little down the course line, reacts `delay` frames late and jumps the logs
    H.ski = ({ delay = 0, gain = 3, maxT = 300, toZ = 1e9, watch = false } = {}) => {
      S.start();
      const queue = [], jumped = new Set(), zoneAt = {}, out = { hits: [], dogHidden: 0, gateHidden: 0, looks: 0, gateLooks: 0 };
      let t = 0, lives = st.lives, n = 0;
      while (t < maxT && !st.over && st.z < toZ) {
        const look = Math.max(5, Math.min(12, st.speed * 0.5));
        queue.push(Math.max(-1, Math.min(1, (Math.atan2(S.courseX(st.z + look) - st.x, look) - st.heading) * gain)));
        inp.steer = queue.length > delay ? queue.shift() : 0;
        const ci = Math.floor(st.z / L);
        for (const c of [S.chunks.get(ci), S.chunks.get(ci + 1)]) if (c) for (const lg of c.logs) {
          const d = lg.z - st.z;
          if (!jumped.has(lg) && d > 1 && d < st.speed * 0.45 && Math.abs(st.x - lg.x) < lg.half + 0.5) { jumped.add(lg); inp.jumpQueued = true; }
        }
        S.step(dt); t += dt; n++;
        if (watch) S.syncVisuals(dt);
        if (!(st.zone in zoneAt)) zoneAt[st.zone] = t;
        if (st.lives < lives) out.hits.push({ t, z: st.z });
        lives = st.lives;
        if (watch && n % 5 === 0) {
          const cam = S.camera.position;
          out.looks++; if (H.occluded(cam, { x: st.x, y: st.y + 0.45, z: st.z }, true)) out.dogHidden++;
          const g = H.next('gates', 5)();
          if (g && g.z - st.z < 45) { out.gateLooks++; if (H.occluded(cam, { x: g.x, y: S.terrainH(g.x, g.z) + 2.2, z: g.z }, true)) out.gateHidden++; }
        }
      }
      inp.steer = 0;
      return { ...out, t, z: st.z, over: st.over, lives: st.lives, gates: st.gates, bestStreak: st.bestStreak, logs: st.logs, zoneAt };
    };
    window.__skiTest = H;
  };
  const open = async (page) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await load(page, '/ski.html', '__ski');
    await page.waitForFunction(() => window.__ski.state.ready, null, { timeout: 60_000 });
    await page.evaluate(installHelpers);
    return errors;
  };

  test('the slope, the skiing and the scoring behave as the design sheet says', async ({ page }) => {
    const errors = await open(page);
    const r = await page.evaluate(() => {
      const S = window.__ski, H = window.__skiTest, st = S.state, inp = S.input, dt = 1 / 60, out = {};
      out.slopeDrop = S.terrainH(0, 0) - S.terrainH(0, 100);
      S.start(); st.inv = 999;                                              // no accidental hits during the movement phases
      for (let i = 0; i < 12 * 60; i++) S.step(dt);                     // straight run on the open slope
      out.speedStraight = st.speed; out.dist12 = st.dist;
      const x0 = st.x; inp.right = true;                                   // carve
      for (let i = 0; i < 3 * 60; i++) S.step(dt);
      inp.right = false; out.carveDx = st.x - x0;
      for (let i = 0; i < 4 * 60; i++) S.step(dt);                          // release: the body leans back and finishes the turn
      out.headingStraightens = Math.abs(st.heading);
      inp.jumpQueued = true; let airFrames = 0, maxAir = 0;               // jump
      for (let i = 0; i < 3 * 60; i++) { S.step(dt); if (st.air) { airFrames++; maxAir = Math.max(maxAir, st.y - S.terrainH(st.x, st.z)); } }
      out.airFrames = airFrames; out.maxAir = maxAir; out.airAtEnd = st.air;
      const scoreBefore = st.score; inp.jumpQueued = true; inp.right = true;   // spin trick
      for (let i = 0; i < 3 * 60; i++) S.step(dt);
      inp.right = false; out.trickGain = st.score - scoreBefore;
      // three gates in a row: the streak multiplies them (50 + 100 + 150)
      const gatesBefore = st.gates, gateScore = st.score; st.streak = 0;
      for (let k = 0; k < 3; k++) { const g = H.seek(H.next('gates', 12)); H.settle(g.x, g.z - 6, 16); st.inv = 6; for (let i = 0; i < 40; i++) S.step(dt); }
      out.gatesPassed = st.gates - gatesBefore; out.gateStreak = st.streak; out.gatePoints = st.score - gateScore;
      // a tree costs one bone and ends the streak
      let tree = null;
      for (const c of S.chunks.values()) for (const t of c.trees) if (!tree && Math.abs(t.x) < 40 && t.z > st.z + 15) tree = t;
      const lives = st.lives; H.settle(tree.x, tree.z - 3, 15); st.inv = 0;
      for (let i = 0; i < 40; i++) S.step(dt);
      out.livesLostOnTree = lives - st.lives; out.streakAfterHit = st.streak; st.inv = 999;
      // into the forest: kickers, logs and golden bones on the line
      H.settle(S.courseX(1400), 1400, 18); S.step(dt);
      out.zoneAt1400 = st.zone;
      const kicker = H.seek(H.next('ramps', 20));                           // a kicker launches the dog at speed
      H.settle(kicker.x, kicker.z - 12, 21);
      let kickAir = 0; for (let i = 0; i < 120; i++) { S.step(dt); if (st.air) kickAir++; }
      out.kickerAirFrames = kickAir;
      let log = H.seek(H.next('logs', 12));                                 // skiing into a log costs a bone…
      H.settle(log.x, log.z - 5, 16); st.inv = 0; st.lives = 3;
      for (let i = 0; i < 40; i++) S.step(dt);
      out.livesLostOnLog = 3 - st.lives; st.inv = 999;
      log = H.seek(H.next('logs', 12));                                     // …jumping it scores
      H.settle(log.x, log.z - 8, 16); st.inv = 0; st.lives = 3;
      const logScore = st.score, logsBefore = st.logs;
      inp.jumpQueued = true; for (let i = 0; i < 60; i++) S.step(dt);
      out.logJump = { lost: 3 - st.lives, cleared: st.logs - logsBefore, points: st.score - logScore }; st.inv = 999;
      const gold = H.seek(H.next('gold', 5));                               // a golden bone gives a lost bone back
      H.settle(gold.x, gold.z - 4, 10); st.lives = 2;
      for (let i = 0; i < 40; i++) S.step(dt);
      out.livesAfterGold = st.lives;
      // the zones: a gentle open slope, then faster, narrower, busier
      out.zones = [0, 600, 1400, 2700, 4300].map((z) => { const lv = S.level(z); return { zone: lv.zone, vTerm: lv.vTerm, corridor: lv.corridor, trees: lv.trees, logs: lv.logs }; });
      for (let i = 0; i < 40 * 60; i++) { if (i % 90 === 0) { inp.left = Math.random() < 0.4; inp.right = !inp.left && Math.random() < 0.5; } S.step(dt); }
      out.finiteState = [st.x, st.y, st.z, st.speed, st.heading, st.score].every(Number.isFinite);
      out.livesNeverNegative = st.lives >= 0; out.chunkCount = S.chunks.size;
      return out;
    });
    expect(r.slopeDrop).toBeGreaterThan(20); expect(r.slopeDrop).toBeLessThan(30);
    // the open slope is slower than the forest: ~55 km/h, not the old 80 straight away
    expect(r.speedStraight * 3.6).toBeGreaterThan(45); expect(r.speedStraight * 3.6).toBeLessThan(65);
    expect(r.dist12).toBeGreaterThan(120);
    expect(r.carveDx).toBeGreaterThan(5);
    expect(r.headingStraightens).toBeLessThan(0.15);
    expect(r.airFrames).toBeGreaterThan(15); expect(r.maxAir).toBeGreaterThan(0.6); expect(r.airAtEnd).toBe(false);
    expect(r.trickGain).toBeGreaterThanOrEqual(100);
    expect(r.gatesPassed).toBe(3); expect(r.gateStreak).toBe(3); expect(r.gatePoints).toBeGreaterThanOrEqual(300);
    expect(r.livesLostOnTree).toBe(1); expect(r.streakAfterHit).toBe(0);
    expect(r.zoneAt1400).toBe(2);
    expect(r.kickerAirFrames).toBeGreaterThan(20);
    expect(r.livesLostOnLog).toBe(1);
    expect(r.logJump.lost).toBe(0); expect(r.logJump.cleared).toBe(1); expect(r.logJump.points).toBeGreaterThanOrEqual(25);
    expect(r.livesAfterGold).toBe(3);
    expect(r.zones.map((z) => z.zone)).toEqual([0, 1, 2, 3, 4]);
    for (let k = 1; k < r.zones.length; k++) {
      expect(r.zones[k].vTerm).toBeGreaterThan(r.zones[k - 1].vTerm);
      expect(r.zones[k].corridor).toBeLessThan(r.zones[k - 1].corridor);
      expect(r.zones[k].trees).toBeGreaterThan(r.zones[k - 1].trees);
    }
    expect(r.zones[0].logs).toBe(0);
    expect(r.finiteState).toBe(true);
    expect(r.livesNeverNegative).toBe(true);
    expect(r.chunkCount).toBeGreaterThanOrEqual(5); expect(r.chunkCount).toBeLessThanOrEqual(8);
    expect(errors).toEqual([]);
  });

  test('the forest follows the course: its line is always clear, a straight line is not', async ({ page }) => {
    const errors = await open(page);
    const r = await page.evaluate(() => {
      const S = window.__ski, H = window.__skiTest, st = S.state, T = S.T, dt = 1 / 60, L = T.chunkLen, out = {};
      // walk 4.5 km of course: no tree or rock on the line, no tree in the lane, nothing in the lane on the open slope
      S.start(); st.inv = 1e9;
      let worst = 99, treesInLane = 0, openSlopeHazards = 0;
      for (let ci = 0; ci < 75; ci++) {
        H.settle(S.courseX(ci * L + 1), ci * L + 1, 10); S.step(dt);
        const c = S.chunks.get(ci), near = [ci - 1, ci, ci + 1].map((k) => S.chunks.get(k)).filter(Boolean);
        const trees = near.flatMap((k) => k.trees), rocks = near.flatMap((k) => k.rocks);
        for (let z = ci * L; z < (ci + 1) * L; z += 0.5) {
          const x = S.courseX(z);
          for (const o of trees) worst = Math.min(worst, Math.hypot(o.x - x, o.z - z) - (T.treeR * o.s + T.dogR));
          for (const o of rocks) worst = Math.min(worst, Math.hypot(o.x - x, o.z - z) - (T.rockR * o.s + T.dogR));
        }
        treesInLane += c.trees.filter((t) => Math.abs(t.x - S.courseX(t.z)) < S.laneAt(t.z) - 0.01).length;
        if (S.level(ci * L + L).zone === 0) openSlopeHazards += c.logs.length + c.ramps.length + c.rocks.length;
      }
      out.worstClearance = worst; out.treesInLane = treesInLane; out.openSlopeHazards = openSlopeHazards;
      // hands off from the top: fine on the open slope, into the trees once the forest starts
      S.start();
      let t = 0, lives = st.lives; out.handsOffHits = [];
      while (t < 240 && !st.over) { S.step(dt); t += dt; if (st.lives < lives) out.handsOffHits.push(t); lives = st.lives; }
      out.handsOffOver = st.over; out.handsOffEnd = t;
      return out;
    });
    expect(r.worstClearance).toBeGreaterThan(0.3);
    expect(r.treesInLane).toBe(0);
    expect(r.openSlopeHazards).toBe(0);
    expect(r.handsOffHits.length).toBeGreaterThan(0);
    expect(r.handsOffHits[0]).toBeGreaterThan(25);                        // the open slope is safe…
    expect(r.handsOffHits[0]).toBeLessThan(60);                           // …the forest is not
    expect(r.handsOffOver).toBe(true); expect(r.handsOffEnd).toBeLessThan(120);
    expect(errors).toEqual([]);
  });

  test('a skier who follows the course climbs through the zones and keeps the dog in view', async ({ page }) => {
    const errors = await open(page);
    const r = await page.evaluate(() => {
      const S = window.__ski, H = window.__skiTest, st = S.state, inp = S.input, dt = 1 / 60, out = {};
      out.clean = H.ski({ maxT: 260, watch: true });                        // on the line, no reaction delay
      out.kid = H.ski({ delay: 12, gain: 2.2, maxT: 260 });                 // 0.2 s late and a softer hand
      // a wanderer who ignores the lane: the pines it passes must get out of the camera's way
      S.start();
      let n = 0, looks = 0, hidden = 0, hiddenUndrawn = 0;
      while (st.z < 2400 && n++ < 60 * 300) {
        inp.steer = Math.sin(st.t * 0.45) * 0.55 + Math.sin(st.t * 1.3) * 0.25; st.inv = 999;
        S.step(dt); S.syncVisuals(dt);
        if (n % 6) continue;
        const cam = S.camera.position, dog = { x: st.x, y: st.y + 0.45, z: st.z };
        looks++; if (H.occluded(cam, dog, true)) hidden++; if (H.occluded(cam, dog, false)) hiddenUndrawn++;
      }
      inp.steer = 0;
      out.wander = { hidden: hidden / looks, withoutDucking: hiddenUndrawn / looks };
      return out;
    });
    // the climb is gradual: the forest edge after ~35 s, the forest after ~1.5 min, the deep forest after ~3
    expect(r.clean.zoneAt[1]).toBeGreaterThan(25); expect(r.clean.zoneAt[1]).toBeLessThan(50);
    expect(r.clean.zoneAt[2]).toBeGreaterThan(70); expect(r.clean.zoneAt[2]).toBeLessThan(120);
    expect(r.clean.zoneAt[3]).toBeGreaterThan(150);
    // following the line is safe and pays: no hits, a long streak, every log cleared
    expect(r.clean.hits.length).toBe(0); expect(r.clean.over).toBe(false);
    expect(r.clean.bestStreak).toBeGreaterThan(10); expect(r.clean.logs).toBeGreaterThan(5);
    // a slower, sloppier skier still reaches the deep forest
    expect(r.kid.over).toBe(false); expect(r.kid.z).toBeGreaterThan(2600);
    // the dog and the next gate stay in view
    expect(r.clean.dogHidden / r.clean.looks).toBeLessThan(0.02);
    expect(r.clean.gateHidden / r.clean.gateLooks).toBeLessThan(0.05);
    expect(r.wander.hidden).toBeLessThan(0.08);
    expect(r.wander.hidden).toBeLessThan(r.wander.withoutDucking / 2);
    expect(errors).toEqual([]);
  });
});

