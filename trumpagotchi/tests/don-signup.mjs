// Browser test: `npm run test:browser`. A keeper asks for their own Don from Settings: the real
// page, the real game server and the real Don host, with a stand-in Don whom Canon "approves"
// a couple of seconds later (fixtures/fake-don.mjs). Canon itself is not involved.
// Needs Playwright with Chromium available (not a dependency of the app itself).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHost } from '../don/host.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = 9100 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}/`;
const KEY = 'browser-test-host-key';

const data = mkdtempSync(join(tmpdir(), 'don-signup-'));
const host = createHost({ data, main: resolve(root, 'tests/fixtures/fake-don.mjs'), hostKey: KEY, log: () => {}, env: Object.assign({}, process.env, { FAKE_APPROVE_MS: '2500' }) });
const hostPort = await host.start(0);
const server = spawn(process.execPath, [resolve(root, 'server.mjs')], {
  env: { ...process.env, PORT: String(PORT), CLOUD_STORE: 'memory', NODE_ENV: 'test', DATABASE_URL: '', DON_HOST_URL: `http://127.0.0.1:${hostPort}/`, DON_HOST_KEY: KEY },
  stdio: 'ignore',
});
for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + 'healthz')).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
let failed = false;
const step = async (name, fn) => {
  try { await fn(); console.log('ok   ' + name); }
  catch (e) { failed = true; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); }
};
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const settings = async () => { await page.click('#menuBtn'); await page.click('.tab >> nth=3'); await page.waitForSelector('#canonCard'); };
  const donText = () => page.textContent('#canonCard');

  await page.goto(BASE);
  await page.waitForFunction(() => window.TG && window.TG.cloud.available !== null);
  for (let i = 0; i < 8; i++) await page.click('#scene');
  await page.click('#modalCard button');

  await step('the game offers Dons, but asks for cloud save first', async () => {
    assert.equal(await page.evaluate(() => window.TG.cloud.don), true);
    await settings();
    assert.match(await donText(), /Turn on cloud save above/);
    assert.equal(await page.isVisible('#donPhone'), false);
  });

  await step('with cloud save on, Settings asks for the keeper’s Canon number', async () => {
    await page.click('#cloudOn');
    await page.waitForSelector('#keeperCode');
    await page.click('#modalCard .btn.gold');
    await page.waitForSelector('#donPhone');
    assert.doesNotMatch(await donText(), /set up by hand/);
  });

  await step('a number without its country code is turned back', async () => {
    await page.fill('#donPhone', '555 123 4567');
    await page.click('#donAsk');
    await page.waitForSelector('.toast:has-text("country code")');
    assert.equal(readdirSync(join(data, 'dons')).length, 0);
  });

  await step('a real number sends him: approve him in Canon, then he is there', async () => {
    await page.fill('#donPhone', '+1 (555) 123-4567');
    await page.click('#donAsk');
    await page.waitForSelector('#donStatus:has-text("approve Don")');
    const [id] = readdirSync(join(data, 'dons'));
    const notes = JSON.parse(readFileSync(join(data, 'dons', id, 'don.json'), 'utf8'));
    assert.equal(notes.key, await page.evaluate(() => window.TG.cloud.key()), 'he already knows whose pet he looks after');
    await page.waitForSelector('#donStatus:has-text("Don is on Canon")', { timeout: 20000 });
  });

  await step('he is still there after a reload', async () => {
    await page.reload();
    await page.waitForFunction(() => window.TG && window.TG.cloud.available !== null);
    await settings();
    await page.waitForSelector('#donStatus:has-text("Don is on Canon")');
  });

  await step('no page errors', async () => { assert.deepEqual(errors, []); });
} finally {
  await browser.close();
  server.kill();
  await host.stop();
  rmSync(data, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
