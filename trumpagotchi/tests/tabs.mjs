// Browser test: `npm run test:browser`. More than one copy of the game open on one device (two
// tabs, or a tab and the installed app) share one save. A copy that is behind must never write
// over what the keeper did in another, and buying while he sleeps must not make him talk.
// Needs Playwright with Chromium available (not a dependency of the app itself).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = 8900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}/`;

const server = spawn(process.execPath, [resolve(root, 'server.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
let failed = false;
const step = async (name, fn) => {
  try { await fn(); console.log('ok   ' + name); }
  catch (e) { failed = true; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// A device with a hatched pet, $1M in the bank, saved in its browser. Returns its first tab.
async function device(o = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await open(ctx);
  await page.evaluate((o) => { // the page's own pet, changed in place and saved as the page saves
    const G = window.TG.game, s = window.TG.ui.state();
    for (let i = 0; i < 20 && !s.hatched; i++) G.tapEgg(s, Date.now());
    s.cash = 1e6;
    if (o.asleep) { s.asleep = true; s.needs.energy = 20; }
    s.edits += 1;
    G.save(s);
  }, o);
  await page.reload();
  await ready(page);
  return { ctx, page };
}
async function open(ctx) {
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(BASE);
  await ready(page);
  return page;
}
async function ready(page) {
  await page.waitForFunction(() => window.TG && window.TG.ui && window.TG.ui.state());
  await wait(300);
  while (await page.isVisible('#modalCard button')) { await page.click('#modalCard button'); await wait(200); }
}
const pet = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.TG.ui.state())));
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem(window.TG.game.SAVE_KEY)));
async function buyTrophy(page) {
  await page.click('#cashBtn');
  await page.click('button.item:has-text("Club Championship Trophy")');
  await wait(300);
}

try {
  for (let i = 0; i < 40; i++) { // wait for the server
    try { if ((await fetch(BASE + 'healthz')).ok) break; } catch { /* not up yet */ }
    await wait(100);
  }

  await step('a purchase in one tab survives another tab that stayed open', async () => {
    const { ctx, page: first } = await device();
    const second = await open(ctx);
    await buyTrophy(second);
    assert.deepEqual((await pet(second)).decor, ['trophy']);
    await wait(6500); // the first tab saves on its own every few seconds
    assert.deepEqual((await saved(first)).decor, ['trophy']);
    assert.deepEqual((await pet(first)).decor, ['trophy'], 'the other tab follows');
    await second.close();
    await wait(6500);
    assert.deepEqual((await saved(first)).decor, ['trophy']);
    const again = await open(ctx);
    const s = await pet(again);
    assert.deepEqual(s.decor, ['trophy']);
    assert.ok(s.cash < 1e6 - 249e3, 'and the money stays spent');
    assert.deepEqual([...first.errors, ...again.errors], []);
    await ctx.close();
  });

  await step('a tab that missed the news still does not write over it', async () => {
    const { ctx, page } = await device();
    // Another copy's save, written without this tab hearing about it (as for a frozen tab).
    await page.evaluate(() => {
      const G = window.TG.game, s = JSON.parse(localStorage.getItem(G.SAVE_KEY));
      s.decor = ['trophy']; s.cash -= 250e3; s.edits += 1;
      localStorage.setItem(G.SAVE_KEY, JSON.stringify(s));
    });
    await wait(6500);
    assert.deepEqual((await saved(page)).decor, ['trophy']);
    assert.deepEqual((await pet(page)).decor, ['trophy']);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });

  await step('two open windows do not keep taking each other over', async () => {
    const { ctx, page: first } = await device();
    const second = await open(ctx);
    await second.click('#cashBtn');
    await wait(12000); // the first window saves twice meanwhile, with nothing new from the keeper
    assert.equal(await second.isVisible('#sheet'), true, 'the open shop stays open');
    await second.click('button.item:has-text("Club Championship Trophy")');
    await wait(500);
    assert.deepEqual((await pet(first)).decor, ['trophy']);
    assert.deepEqual([...first.errors, ...second.errors], []);
    await ctx.close();
  });

  await step('shopping while he sleeps: delivered, and not a word from him', async () => {
    const { ctx, page } = await device({ asleep: true });
    assert.equal((await pet(page)).asleep, true);
    await buyTrophy(page);
    const s = await pet(page);
    assert.deepEqual(s.decor, ['trophy']);
    assert.equal(s.asleep, true);
    assert.equal(await page.isVisible('#bubble'), false, 'no speech bubble');
    assert.match(await page.textContent('#toasts'), /Delivered quietly/);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
