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
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
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

  await step('code is revalidated on every visit and unchanged files cost a 304', async () => {
    for (const p of ['', 'js/ui.js', 'js/content.js', 'css/style.css', 'sw.js', 'manifest.webmanifest']) {
      const first = await fetch(BASE + p);
      assert.equal(first.headers.get('cache-control'), 'no-cache', p);
      const etag = first.headers.get('etag');
      assert.match(etag, /^"[\w-]{22}"$/, p);
      const again = await fetch(BASE + p, { headers: { 'if-none-match': etag } });
      assert.equal(again.status, 304, p);
      assert.equal((await again.text()).length, 0);
      assert.equal((await fetch(BASE + p, { headers: { 'if-none-match': '"something-else"' } })).status, 200);
    }
    assert.equal((await fetch(BASE + 'icons/icon-192.png')).headers.get('cache-control'), 'public, max-age=3600');
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
    assert.ok(s.cash >= 1e6 && s.cash < 1e6 + 1, 'the $1M loan, plus a second or two of income: ' + s.cash);
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

  await step('the shop sells the next acquisition, and there is always another', async () => {
    await page.evaluate(() => { const s = window.TG.ui.state(); s.cash = 1e6; for (const k of window.TG.game.NEEDS) s.needs[k] = 70; window.TG.ui.refresh(); });
    await page.click('#act-shop');
    assert.match(await page.textContent('#acqBuy'), /Gold Stapler.*\$150K/s);
    assert.equal(await page.locator('#sheetBody .item.then').count(), 2);
    await page.click('#acqBuy');
    const s = await state();
    assert.equal(s.holdings.term, 1);
    assert.ok(Math.abs(s.cash - 850e3) < 50, 'paid ' + (1e6 - s.cash));
    assert.match(await page.textContent('#acqBuy'), /Monogrammed Bathrobe/);
    assert.match(await page.textContent('#acqLine'), /He owns 1 thing, worth \$150K/);
    assert.equal(await page.isVisible('#bubble'), true, 'he has something to say about it');
    // he can only take on so much at once
    await page.evaluate(() => { const s = window.TG.ui.state(); s.cash = 1e12; s.holdings.term = window.TG.game.acqAllowed(s); window.TG.ui.refresh(); });
    await page.click('#sheetClose'); await page.click('#act-shop');
    assert.match(await page.textContent('#acqBuy'), /AT LEVEL \d+/);
    await page.click('#acqBuy');
    assert.match(await page.textContent('#toasts'), /more at level \d+/);
    await page.evaluate(() => { const s = window.TG.ui.state(); s.holdings.term = 1; s.cash = 1e6; window.TG.ui.refresh(); });
    await page.click('#sheetClose');
  });

  await step('settings link to Canon in both stores, outside the game', async () => {
    await page.click('#menuBtn');
    await page.click('.tab >> nth=3');
    const links = await page.$$eval('#canonCard a', (list) => list.map((a) => [a.textContent, a.getAttribute('aria-label'), a.href, a.target, a.rel]));
    assert.deepEqual(links, [
      ['App Store', 'Canon on the App Store (opens in a new tab)', 'https://apps.apple.com/app/id6761249945', '_blank', 'noopener noreferrer'],
      ['Google Play', 'Canon on Google Play (opens in a new tab)', 'https://play.google.com/store/apps/details?id=com.canon.app', '_blank', 'noopener noreferrer'],
    ]);
    const [ios, android] = await Promise.all(['#canonIos', '#canonAndroid'].map((id) => page.locator(id).boundingBox()));
    assert.ok(ios.height >= 44 && android.height >= 44, 'store links are full-size buttons');
    assert.equal(Math.round(ios.y), Math.round(android.y), 'side by side on a phone');
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

  await step('past level 50 he becomes other things, and each of them can be looked after', async () => {
    const forms = { 52: 'man', 58: 'man', 62: 'man', 66: 'man', 70: 'man', 75: 'man', 78: 'man', 82: 'man', 86: 'tower', 90: 'tower', 93: 'planet', 97: 'planet', 100: 'all' };
    const box = await (await page.$('#scene')).boundingBox();
    for (const level of Object.keys(forms).map(Number)) {
      await page.evaluate((level) => {
        const G = window.TG.game, s = window.TG.ui.state();
        s.xp = G.cumXp(level) + 5; for (const k of G.NEEDS) s.needs[k] = 60; s.asleep = false; s.sulking = false;
        window.TG.ui.tick(true);
      }, level);
      assert.equal(await page.evaluate(() => document.body.dataset.form), forms[level], 'level ' + level);
      assert.match(await page.textContent('#stageLine'), new RegExp(await page.evaluate(() => window.TG.game.stage(window.TG.ui.state()).name)));
      const before = await state();
      await page.click('#act-feed'); await page.click('#sheetBody .item'); await page.keyboard.press('Escape');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);   // a pat
      await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.22);  // the hair, wherever it now is
      await page.evaluate(() => { window.TG.ui.state().needs.energy = 40; });
      await page.click('#act-sleep');
      assert.equal((await state()).asleep, true, 'asleep at ' + level);
      await page.waitForTimeout(120); // a few frames of him asleep
      await page.click('#act-sleep');
      const after = await state();
      assert.equal(after.asleep, false);
      assert.ok(after.stats.feeds > before.stats.feeds && after.stats.pets + after.stats.hairTouches > before.stats.pets + before.stats.hairTouches, 'fed and patted at ' + level);
      assert.match(await page.getAttribute('#scene', 'aria-label') || '', new RegExp('level ' + level));
    }
    // neglected at the very top: a man again, in the office
    await page.evaluate(() => { const s = window.TG.ui.state(); for (const k of ['food', 'ego', 'fun', 'glow']) s.needs[k] = 2; window.TG.ui.refresh(); });
    assert.equal(await page.evaluate(() => document.body.dataset.form), 'man');
    await page.waitForTimeout(120);
    // the moment of becoming something: the card names it and says his voice has changed
    await page.evaluate(() => {
      const G = window.TG.game, s = window.TG.ui.state();
      s.xp = G.cumXp(62) - 1; for (const k of G.NEEDS) s.needs[k] = 60; s.needs.food = 30; s.asleep = false;
      window.TG.ui.refresh();
    });
    await page.click('#act-feed'); await page.click('#sheetBody .item');
    await page.waitForSelector('#modalCard .hero');
    const card = await page.textContent('#modalCard');
    assert.match(card, /The Hair/); assert.match(card, /BEYOND/);
    while (await page.isVisible('#modalCard button')) { await page.click('#modalCard button'); await page.waitForTimeout(80); }
    await page.keyboard.press('Escape');
    assert.equal(await sheetOpen(), false);
    // golf: he turns up in person, whatever he is
    await page.evaluate(() => { const G = window.TG.game, s = window.TG.ui.state(); s.xp = G.cumXp(95); for (const k of G.NEEDS) s.needs[k] = 80; window.TG.ui.refresh(); });
    await page.click('#act-play'); await page.click('#sheetBody .item >> nth=0');
    for (let i = 0; i < 3; i++) { await page.waitForSelector('#gameBtn:not([disabled])', { timeout: 6000 }); await page.click('#gameBtn'); }
    await page.waitForFunction(() => window.TG.view.mode === 'room', null, { timeout: 8000 });
    while (await page.isVisible('#modalCard button')) { await page.click('#modalCard button'); await page.waitForTimeout(80); }
    if (await sheetOpen()) await page.click('#sheetClose');
    // back to an ordinary pet for the steps that follow
    await page.evaluate(() => { const G = window.TG.game, s = window.TG.ui.state(); s.xp = G.cumXp(3); for (const k of G.NEEDS) s.needs[k] = 80; s.asleep = false; window.TG.ui.refresh(); window.TG.game.save(s); });
    assert.deepEqual(errors, []);
  });

  await step('the save records where its keeper is', async () => {
    const there = await browser.newContext({ timezoneId: 'Pacific/Auckland' });
    const p = await there.newPage();
    await p.goto(BASE);
    await p.waitForFunction(() => window.TG && window.TG.ui);
    assert.equal(await p.evaluate(() => window.TG.ui.state().zone), 'Pacific/Auckland');
    assert.equal(await p.evaluate(() => window.TG.game.stored(Date.now()).zone), 'Pacific/Auckland');
    await there.close();
  });

  await step('on a public address a ?reset link cannot erase the pet', async () => {
    // Serve the same app under a made-up public hostname.
    const pub = await ctx.newPage();
    await pub.route('http://pet.example/**', async (route) => {
      const u = new URL(route.request().url());
      route.fulfill({ response: await route.fetch({ url: BASE + u.pathname.slice(1) + u.search }) });
    });
    await pub.goto('http://pet.example/');
    await pub.waitForSelector('#hatchBtn');
    for (let i = 0; i < 8; i++) await pub.click('#scene');
    await pub.waitForSelector('#modalCard button');
    await pub.evaluate(() => window.TG.game.save(window.TG.ui.state()));
    await pub.goto('http://pet.example/?reset');
    await pub.waitForFunction(() => window.TG && window.TG.ui);
    assert.equal(await pub.evaluate(() => window.TG.ui.state().hatched), true);
    await pub.close();
  });

  await step('preview tags turn absolute when PUBLIC_URL is set', async () => {
    const port = PORT + 1;
    const second = spawn(process.execPath, [resolve(root, 'server.mjs')], { env: { ...process.env, PORT: String(port), PUBLIC_URL: 'https://example.com/pet' }, stdio: 'ignore' });
    try {
      let html = '';
      for (let i = 0; i < 40 && !html; i++) { try { html = await (await fetch(`http://localhost:${port}/`)).text(); } catch { await new Promise((r) => setTimeout(r, 100)); } }
      assert.match(html, /<meta property="og:image" content="https:\/\/example\.com\/pet\/icons\/og\.png" \/>/);
      assert.match(html, /<meta property="og:url" content="https:\/\/example\.com\/pet\/" \/>/);
      assert.match(await (await fetch(BASE)).text(), /<meta property="og:image" content="icons\/og\.png" \/>/);
    } finally { second.kill(); }
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
