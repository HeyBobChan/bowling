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
  test('the slope, the skiing and the scoring behave as the design sheet says', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await load(page, '/ski.html', '__ski');
    await page.waitForFunction(() => window.__ski.state.ready, null, { timeout: 60_000 });
    const r = await page.evaluate(() => {
      const S = window.__ski, st = S.state, inp = S.input, dt = 1 / 60, out = {};
      out.slopeDrop = S.terrainH(0, 0) - S.terrainH(0, 100);
      S.start(); st.inv = 999;                                              // no accidental tree hits during the movement phases
      for (let i = 0; i < 12 * 60; i++) S.step(dt);                     // straight run
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
      const cs = [...S.chunks.values()].sort((a, b) => a.i - b.i);
      let gate = null;
      for (const c of cs) for (const g of c.gates) if (!g.done && g.z > st.z + 20 && !gate) gate = g;
      const settle = () => { st.heading = 0; st.lean = 0; st.leanVel = 0; st.kick = 0; st.prevTurn = 0; st.air = false; st.inv = 6; st.y = S.terrainH(st.x, st.z); };
      const gatesBefore = st.gates; st.x = gate.x; st.z = gate.z - 6; st.speed = 16; settle();
      for (let i = 0; i < 60; i++) S.step(dt);
      out.gatePassed = st.gates - gatesBefore;
      let tree = null;
      for (const c of cs) for (const t of c.trees) if (Math.abs(t.x) < 40 && t.z > st.z + 15 && !tree) tree = t;
      const lives = st.lives; st.x = tree.x; st.z = tree.z - 3; st.speed = 15; settle(); st.inv = 0;
      for (let i = 0; i < 40; i++) S.step(dt);
      out.livesLostOnTree = lives - st.lives; st.inv = 999;
      let kicker = null;                                                    // a kicker launches the dog at speed
      for (const c of cs) for (const k of c.ramps) if (k.z > st.z + 20 && !kicker) kicker = k;
      st.x = kicker.x; st.z = kicker.z - 12; st.speed = 21; settle(); st.inv = 999;
      let kickAir = 0;
      for (let i = 0; i < 120; i++) { S.step(dt); if (st.air) kickAir++; }
      out.kickerAirFrames = kickAir;
      for (let i = 0; i < 40 * 60; i++) { if (i % 90 === 0) { inp.left = Math.random() < 0.4; inp.right = !inp.left && Math.random() < 0.5; } S.step(dt); }
      out.finiteState = [st.x, st.y, st.z, st.speed, st.heading, st.score].every(Number.isFinite);
      out.livesNeverNegative = st.lives >= 0; out.chunkCount = S.chunks.size;
      return out;
    });
    expect(r.slopeDrop).toBeGreaterThan(20); expect(r.slopeDrop).toBeLessThan(30);
    expect(r.speedStraight * 3.6).toBeGreaterThan(55); expect(r.speedStraight * 3.6).toBeLessThan(100);
    expect(r.dist12).toBeGreaterThan(150);
    expect(r.carveDx).toBeGreaterThan(5);
    expect(r.headingStraightens).toBeLessThan(0.15);
    expect(r.airFrames).toBeGreaterThan(15); expect(r.maxAir).toBeGreaterThan(0.6); expect(r.airAtEnd).toBe(false);
    expect(r.trickGain).toBeGreaterThanOrEqual(100);
    expect(r.gatePassed).toBe(1);
    expect(r.livesLostOnTree).toBe(1);
    expect(r.kickerAirFrames).toBeGreaterThan(20);
    expect(r.finiteState).toBe(true);
    expect(r.livesNeverNegative).toBe(true);
    expect(r.chunkCount).toBeGreaterThanOrEqual(5); expect(r.chunkCount).toBeLessThanOrEqual(8);
    expect(errors).toEqual([]);
  });
});
