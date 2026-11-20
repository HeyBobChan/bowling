// Browser smoke test: `npm run test:browser`. Boots the real server, plays through the
// first minutes in headless Chromium, and fails on any page error.
// Needs Playwright with Chromium available (not a dependency of the app itself).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = 8700 + Math.floor(Math.random() * 200);
const BASE = `http://localhost:${PORT}/`;

const server = spawn(process.execPath, [resolve(root, 'server.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const browser = await chromium.launch();
let failed = false;
const step = async (name, fn) => {
  try { await fn(); console.log('ok   ' + name); }
  catch (e) { failed = true; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); }
};

try {
  for (let i = 0; i < 40; i++) { // wait for the server
    try { if ((await fetch(BASE + 'healthz')).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.TG.ui.state())));
  const sheetOpen = () => page.evaluate(() => !document.getElementById('sheet').hidden);

  await step('serves the app and nothing else', async () => {
    for (const p of ['', 'js/ui.js', 'css/style.css', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png']) assert.equal((await fetch(BASE + p)).status, 200, p);
    for (const p of ['server.mjs', 'package.json', 'tests/sim.test.mjs', '..%2fpackage.json']) assert.equal((await fetch(BASE + p)).status, 404, p);
  });

  await step('starts as an egg', async () => {
    await page.goto(BASE + '?reset');
    await page.waitForSelector('#hatchBtn');
    assert.equal((await state()).hatched, false);
    assert.equal(await page.isVisible('#actions'), false);
  });

  await step('hatches after eight taps, with a small loan', async () => {
    for (let i = 0; i < 8; i++) await page.click('#scene');
    await page.waitForSelector('#modalCard button');
    const s = await state();
    assert.equal(s.hatched, true);
    assert.equal(s.cash, 1e6);
    await page.click('#modalCard button');
    assert.equal(await page.isVisible('#actions'), true);
    assert.match(await page.textContent('#stageLine'), /Regular Don/);
  });

  await step('feeding fills him up and he says something', async () => {
    await page.evaluate(() => { window.TG.ui.state().needs.food = 30; });
    await page.click('#act-feed');
    await page.click('#sheetBody .item');
    const s = await state();
    assert.equal(Math.round(s.needs.food), 58);
    assert.equal(s.stats.burgers, 1);
    assert.equal(await page.isVisible('#bubble'), true);
    await page.keyboard.press('Escape');
    assert.equal(await sheetOpen(), false);
  });

  await step('every sheet opens and renders', async () => {
    for (const id of ['praise', 'play', 'groom', 'post', 'brief', 'shop']) {
      await page.click('#act-' + id);
      assert.equal(await sheetOpen(), true, id);
      assert.ok((await page.locator('#sheetBody > *').count()) > 0, id + ' has content');
      await page.click('#sheetClose');
    }
    await page.click('#menuBtn');
    for (let i = 0; i < 4; i++) { await page.click('.tab >> nth=' + i); assert.ok((await page.locator('#sheetBody > *').count()) > 1); }
    await page.click('#sheetClose');
  });

  await step('a full round of golf pays out', async () => {
    const before = await state();
    await page.click('#act-play');
    await page.click('#sheetBody .item >> nth=0');
    for (let i = 0; i < 3; i++) { await page.waitForSelector('#gameBtn:not([disabled])', { timeout: 6000 }); await page.click('#gameBtn'); }
    await page.waitForFunction(() => window.TG.view.mode === 'room', null, { timeout: 8000 });
    const after = await state();
    assert.equal(after.stats.golf, 1);
    assert.ok(after.xp > before.xp);
    assert.equal(after.needs.energy < before.needs.energy, true);
    await page.click('#sheetClose');
  });

  await step('he is still there after a reload', async () => {
    await page.evaluate(() => window.TG.game.save(window.TG.ui.state()));
    await page.goto(BASE);
    await page.waitForFunction(() => window.TG && window.TG.ui);
    const s = await state();
    assert.equal(s.hatched, true);
    assert.equal(s.stats.burgers, 1);
    assert.equal(s.stats.golf, 1);
  });

  await step('time passes while you are away', async () => {
    await page.evaluate(() => { const s = window.TG.ui.state(); for (const k of window.TG.game.NEEDS) s.needs[k] = 100; window.TG.game.clockOffset += 6 * 3600e3; window.TG.ui.tick(true); });
    await page.waitForSelector('#modalCard button');
    assert.match(await page.textContent('#modalCard'), /While you were away/i);
    const s = await state();
    assert.ok(s.needs.food < 75 && s.needs.food > 60, 'food ' + s.needs.food);
    await page.click('#modalCard button');
  });

  await step('no page errors', async () => { assert.deepEqual(errors, []); });

  const single = resolve(root, 'dist', 'trumpagotchi.html');
  if (existsSync(single)) {
    await step('the single-file build runs from disk', async () => {
      const p2 = await ctx.newPage();
      const errs = [];
      p2.on('pageerror', (e) => errs.push(e.message));
      await p2.goto('file://' + single);
      await p2.waitForSelector('#hatchBtn');
      for (let i = 0; i < 8; i++) await p2.click('#scene');
      await p2.waitForSelector('#modalCard button');
      assert.equal(await p2.evaluate(() => window.TG.ui.state().hatched), true);
      assert.deepEqual(errs, []);
      await p2.close();
    });
  } else console.log('skip the single-file build (run `npm run build:single` first)');
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
