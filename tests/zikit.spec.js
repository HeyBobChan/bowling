import { test, expect } from '@playwright/test';

// "הזיקית בורחת" — the balance rules in design/zikit.md, and the promise that everything on
// screen is cut out of the kid's drawing. `?sim` stops the page's own loop; the test steps time.

async function load(page, query = '') {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/zikit.html?sim${query}`);
  await page.waitForFunction(() => window.__zikit?.art.ready, null, { timeout: 30_000 });
  return errors;
}
// run a round until it ends or `seconds` pass; `setup` picks who is playing
const play = (page, seed, seconds, setup) => page.evaluate(({ seed, seconds, setup }) => {
  const Z = window.__zikit;
  Z.start(seed);
  Z.autopilot(setup.bot !== undefined, setup.bot ?? 0);
  Z.walk(setup.walk ?? 0);
  let t = 0;
  for (; t < seconds && Z.st.mode === 'play'; t += 1 / 60) Z.step(1 / 60);
  const out = { alive: Z.st.mode === 'play', t: Z.st.t, stomps: Z.M.n, metres: Z.st.maxX, eaten: Z.st.eaten, score: Z.st.score };
  Z.autopilot(false); Z.walk(0);
  return out;
}, { seed, seconds, setup });

test.describe('Chameleon Escape', () => {
  test('every character and tree is a piece of the drawing', async ({ page }) => {
    const errors = await load(page);
    await expect(page.getByRole('heading', { level: 1 }).first()).toContainText('הזיקית בורחת');
    await expect(page.locator('.game-home')).toHaveAttribute('href', '/');
    const r = await page.evaluate(() => {
      const Z = window.__zikit;
      const kinds = Z.ROWS.map((row) => {
        const seen = new Set();
        for (let i = -150; i < 150; i++) { const t = Z.treeAt(row, i); if (t) seen.add(t.kind); }
        return [...seen].sort();
      });
      const empty = (img, rect) => {          // a sprite whose rectangle has no ink in it was cut wrong
        const c = document.createElement('canvas'); c.width = rect[2]; c.height = rect[3];
        const g = c.getContext('2d'); g.drawImage(img, rect[0], rect[1], rect[2], rect[3], 0, 0, rect[2], rect[3]);
        const d = g.getImageData(0, 0, rect[2], rect[3]).data; let ink = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 128) ink++;
        return ink < rect[2] * rect[3] * 0.08;
      };
      const blank = [];
      for (const [who, img] of [['chameleon', Z.art.cham], ['monster', Z.art.mon]]) {
        for (const [name, p] of Object.entries(Z.rig[who].parts)) if (empty(img, p.rect)) blank.push(`${who}.${name}`);
      }
      for (const [name, p] of Object.entries(Z.rig.forest)) if (empty(Z.art.forest, p.rect)) blank.push(`forest.${name}`);
      return {
        chameleon: Object.keys(Z.rig.chameleon.parts).sort(), monster: Object.keys(Z.rig.monster.parts).sort(),
        forest: Object.keys(Z.rig.forest).sort(), kinds, blank,
      };
    });
    expect(r.chameleon).toEqual(['body', 'hair0', 'hair1', 'hair2', 'hair3', 'legBack', 'legFront', 'tail']);
    expect(r.monster).toEqual(['armHorn', 'armLow', 'clown', 'core', 'ear', 'legL', 'legR', 'poop', 'stick', 'tail']);
    expect(r.forest).toEqual(['bug', 'bush', 'treeA', 'treeB', 'treeC']);
    // "the four trees at the bottom, duplicated into a forest": every row uses all four and nothing else
    for (const row of r.kinds) expect(row).toEqual(['bush', 'treeA', 'treeB', 'treeC']);
    expect(r.blank).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('the chameleon has one heart: the first stomp that lands on it ends the round', async ({ page }) => {
    await load(page);
    await expect(page.locator('#heart')).toHaveText('❤️');
    const stood = await play(page, 1, 30, {});
    expect(stood.alive).toBe(false);
    expect(stood.stomps).toBe(1);
    expect(stood.t).toBeLessThan(6);
    await page.evaluate(() => { const Z = window.__zikit; for (let t = 0; t < 2; t += 1 / 60) Z.step(1 / 60); });
    await expect(page.locator('#heart')).toHaveText('💔');
    await expect(page.locator('#gameover')).toBeVisible();
    await expect(page.locator('#finalScore')).toHaveText('⭐ 0');
    // a jump does not save you, and neither does standing under her tail or her stick
    const r = await page.evaluate(() => {
      const Z = window.__zikit, out = {};
      const drop = (dx, jump) => {
        Z.start(3); Z.calm();
        Z.dropOn(Z.P.x + dx);
        if (jump) Z.press('jump');
        for (let t = 0; t < 1.2 && Z.M.n === 0; t += 1 / 120) Z.step(1 / 120);
        return Z.P.dead;
      };
      out.under = drop(0, false); out.jumping = drop(0.4, true);
      out.edge = drop(Z.knobs.KILL_HALF + Z.knobs.CHAM_HALF - 0.1, false);
      out.beside = drop(Z.knobs.KILL_HALF + Z.knobs.CHAM_HALF + 0.15, false);
      out.besideDodged = Z.st.dodged;
      return out;
    });
    expect(r).toEqual({ under: true, jumping: true, edge: true, beside: false, besideDodged: 1 });
    // Enter starts again with the heart back
    await page.evaluate(() => { const Z = window.__zikit; Z.start(1); Z.autopilot(false); for (let t = 0; t < 8 && !Z.st.overShown; t += 1 / 60) Z.step(1 / 60); });
    await expect(page.locator('#gameover')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('#gameover')).toBeHidden();
    await page.evaluate(() => window.__zikit.step(1 / 60));
    await expect(page.locator('#heart')).toHaveText('❤️');
    expect(await page.evaluate(() => window.__zikit.st.mode)).toBe('play');
  });

  test('every stomp can be dodged, none is free, and it gets harder', async ({ page }) => {
    await load(page);
    for (const seed of [11, 12, 13]) {
      // someone who answers every red scribble at once is never caught
      const sharp = await play(page, seed, 150, { bot: 0 });
      expect(sharp.alive).toBe(true);
      expect(sharp.stomps).toBeGreaterThan(25);
      expect(sharp.metres).toBeGreaterThan(400);
      expect(sharp.eaten).toBeGreaterThan(10);
      // just holding "run" works for the two easy stomps, then she lands where you are going
      const runner = await play(page, seed, 150, { walk: 1 });
      expect(runner.alive).toBe(false);
      expect(runner.stomps).toBeGreaterThanOrEqual(3);
      expect(runner.stomps).toBeLessThanOrEqual(9);
      // a slow reader of the scribble gets through the first minute but not the third
      const slow = await play(page, seed, 150, { bot: 0.8 });
      expect(slow.alive).toBe(false);
      expect(slow.t).toBeGreaterThan(40);
    }
    const ramp = await page.evaluate(() => { const Z = window.__zikit; return { w0: Z.warnOf(0), w30: Z.warnOf(30), r0: Z.waveOf(0), r3: Z.waveOf(3), r30: Z.waveOf(30) }; });
    expect(ramp.w0).toBeGreaterThan(1);
    expect(ramp.w30).toBeLessThan(0.7);
    expect(ramp.w30).toBeGreaterThan(0.5);
    expect(ramp.r0).toBe(0);
    expect(ramp.r30).toBeGreaterThan(ramp.r3);
  });

  test('the wave from her landing knocks you over unless you jump it; her poop is sticky, not deadly', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const Z = window.__zikit, out = {};
      const run = (s) => { for (let t = 0; t < s; t += 1 / 120) Z.step(1 / 120); };
      Z.start(4); Z.calm();
      Z.wave(Z.P.x - 2, 1);
      run(0.5);
      out.hit = { stunned: Z.P.stun > 0, dead: Z.P.dead, mode: Z.st.mode };
      run(1.6);
      out.recovered = Z.P.stun <= 0 && Z.P.ground;
      Z.wave(Z.P.x - 2, 1);
      let jumped = false;
      for (let t = 0; t < 1; t += 1 / 120) {
        if (!jumped && Math.abs(Z.waves[0]?.x - Z.P.x) < 1) { Z.press('jump'); jumped = true; }
        Z.step(1 / 120);
        if (Z.P.stun > 0) break;
      }
      out.jumped = { stunned: Z.P.stun > 0, cleared: jumped };
      Z.release();
      // the poop
      Z.start(4); Z.calm();
      Z.splat(Z.P.x + 3);
      Z.walk(1);
      let inPoop = 0, free = 0;
      for (let t = 0; t < 1.6; t += 1 / 120) {
        Z.step(1 / 120);
        const d = Math.abs(Z.P.x - Z.splats[0].x);
        if (d < 0.3) inPoop = Math.max(inPoop, Z.P.vx);
        if (Z.P.x > Z.splats[0].x + 2.5) free = Math.max(free, Z.P.vx);
      }
      out.poop = { inPoop, free, dead: Z.P.dead, top: Z.knobs.RUN_V, slow: Z.knobs.POOP_SLOW };
      Z.walk(0);
      return out;
    });
    expect(r.hit).toEqual({ stunned: true, dead: false, mode: 'play' });
    expect(r.recovered).toBe(true);
    expect(r.jumped).toEqual({ stunned: false, cleared: true });
    expect(r.poop.dead).toBe(false);
    expect(r.poop.inPoop).toBeGreaterThan(0);
    expect(r.poop.inPoop).toBeLessThan(r.poop.top * r.poop.slow + 0.6);
    expect(r.poop.free).toBeCloseTo(r.poop.top, 1);
  });

  test('the tongue catches the pencil bug, and her landing shakes more out of the nearest tree', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const Z = window.__zikit, out = {};
      const run = (s) => { for (let t = 0; t < s; t += 1 / 120) Z.step(1 / 120); };
      Z.start(5); Z.calm();
      Z.addBug(Z.P.x + 2.2, 1.7);
      Z.press('tongue'); run(0.5);
      out.caught = { eaten: Z.st.eaten, points: Z.st.points, left: Z.bugs.length };
      Z.press('tongue'); run(0.5);
      out.missed = { eaten: Z.st.eaten, points: Z.st.points };
      Z.addBug(Z.P.x + Z.knobs.TONGUE_R + 2, 1.7);
      Z.press('tongue'); run(0.5);
      out.tooFar = { eaten: Z.st.eaten, left: Z.bugs.length };
      // she lands beside a tree, far from the chameleon
      Z.start(5); Z.calm();
      const tree = Z.nearTrees(Z.P.x + 8, Z.P.x + 30)[0];
      Z.dropOn(tree.x + 1);
      for (let t = 0; t < 1.5 && Z.M.n === 0; t += 1 / 120) Z.step(1 / 120);
      out.shaken = { bugs: Z.bugs.length, near: Z.bugs.every((b) => Math.abs(b.x - tree.x) < 2.5), dodged: Z.st.dodged, alive: !Z.P.dead };
      return out;
    });
    expect(r.caught).toEqual({ eaten: 1, points: 10, left: 0 });
    expect(r.missed).toEqual({ eaten: 1, points: 10 });
    expect(r.tooFar).toEqual({ eaten: 1, left: 1 });
    expect(r.shaken.bugs).toBeGreaterThanOrEqual(2);
    expect(r.shaken).toMatchObject({ near: true, dodged: 1, alive: true });
  });

  test('real keys run, jump and shoot the tongue; a long run keeps the page small', async ({ page }) => {
    const errors = await load(page);
    const run = (s) => page.evaluate((s) => { const Z = window.__zikit; for (let t = 0; t < s; t += 1 / 120) Z.step(1 / 120); }, s);
    await page.keyboard.press('Space');                 // the start button
    expect(await page.evaluate(() => window.__zikit.st.mode)).toBe('play');
    await expect(page.locator('#intro')).toBeHidden();
    await page.evaluate(() => window.__zikit.calm());
    await page.keyboard.down('ArrowRight'); await run(0.6);
    expect(await page.evaluate(() => window.__zikit.P.x)).toBeGreaterThan(2);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.down('KeyA'); await run(0.4); await page.keyboard.up('KeyA');
    expect(await page.evaluate(() => window.__zikit.P.face)).toBe(-1);
    await run(0.4);
    await page.keyboard.down('Space'); await run(0.2);
    expect(await page.evaluate(() => window.__zikit.P.y)).toBeGreaterThan(0.8);
    await page.keyboard.up('Space'); await run(0.8);
    await page.keyboard.press('ArrowUp'); await run(0.15);
    expect(await page.evaluate(() => window.__zikit.P.y)).toBeGreaterThan(0.5);
    await run(0.8);
    await page.evaluate(() => { const Z = window.__zikit; Z.addBug(Z.P.x - 2, 1.5); });
    await page.keyboard.press('ShiftLeft'); await run(0.5);
    expect(await page.evaluate(() => window.__zikit.st.eaten)).toBe(1);
    // three minutes of the autopilot: nothing piles up
    const r = await page.evaluate(() => {
      const Z = window.__zikit; let most = { bugs: 0, waves: 0, splats: 0, dust: 0, pops: 0 };
      Z.start(21); Z.autopilot(true, 0);
      for (let t = 0; t < 180 && Z.st.mode === 'play'; t += 1 / 60) {
        Z.step(1 / 60);
        for (const k of Object.keys(most)) most[k] = Math.max(most[k], Z[k].length);
      }
      Z.render();
      Z.autopilot(false);
      return { most, max: Z.knobs.BUG_MAX, stomps: Z.M.n };
    });
    expect(r.stomps).toBeGreaterThan(30);
    expect(r.most.bugs).toBeLessThanOrEqual(r.max);
    expect(r.most.waves).toBeLessThanOrEqual(4);
    expect(r.most.splats).toBeLessThanOrEqual(3);
    expect(r.most.dust).toBeLessThan(120);
    expect(r.most.pops).toBeLessThan(12);
    expect(errors).toEqual([]);
  });

  test('on a phone the stick runs and the two buttons jump and shoot the tongue', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await load(page, '&touch');
    await expect(page.locator('#touch .tbtn.a')).toHaveText('⤒');
    await expect(page.locator('#touch .tbtn.b')).toHaveText('👅');
    await page.locator('#startBtn').tap();
    await page.evaluate(() => { const Z = window.__zikit; Z.calm(); Z.addBug(Z.P.x + 2, 1.5); });
    const heart = await page.locator('#heart').boundingBox(), tongue = await page.locator('#touch .tbtn.b').boundingBox();
    expect(heart.y + heart.height).toBeLessThan(tongue.y);          // the heart is not under the tongue button
    await page.locator('#touch .tbtn.b').dispatchEvent('pointerdown');
    await page.evaluate(() => { const Z = window.__zikit; for (let t = 0; t < 0.5; t += 1 / 120) Z.step(1 / 120); });
    expect(await page.evaluate(() => window.__zikit.st.eaten)).toBe(1);
    await page.locator('#touch .tbtn.a').dispatchEvent('pointerdown');
    await page.evaluate(() => { const Z = window.__zikit; for (let t = 0; t < 0.2; t += 1 / 120) Z.step(1 / 120); });
    expect(await page.evaluate(() => window.__zikit.P.y)).toBeGreaterThan(0.8);
    await context.close();
  });
});
