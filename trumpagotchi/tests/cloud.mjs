// Cloud save across two "devices" (separate browser profiles), end to end:
// `npm run test:browser`. Boots the real server with pets kept in memory.
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
const server = spawn(process.execPath, [resolve(root, 'server.mjs')], { env: { ...process.env, PORT: String(PORT), CLOUD_STORE: 'memory', NODE_ENV: 'test', DATABASE_URL: '' }, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + 'healthz')).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }

const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
let failed = false;
try {
  const problems = [];
  const ZONES = { A: 'Asia/Jerusalem', B: 'America/New_York' }; // two devices need not share a time zone
  const zone = (d) => d.p.evaluate(() => window.TG.ui.state().zone);
  const device = async (name) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: ZONES[name] });
    const p = await ctx.newPage();
    p.on('pageerror', e => problems.push(name + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push(name + ' console: ' + m.text()); });
    await p.goto(BASE);
    await p.waitForFunction(() => window.TG && window.TG.ui && window.TG.cloud.available !== null);
    return { ctx, p, name };
  };
  const st = (d) => d.p.evaluate(() => { const s = window.TG.ui.state(); return { hatched: s.hatched, name: s.name, burgers: s.stats.burgers, cokes: s.stats.cokes, xp: Math.round(s.xp), linked: window.TG.cloud.linked(), info: window.TG.cloud.info() }; });
  const sync = async (d) => { await d.p.evaluate(() => window.TG.ui.sync()); await d.p.waitForTimeout(700); };
  const settings = async (d) => { await d.p.click('#menuBtn'); await d.p.click('.tab >> nth=3'); await d.p.waitForSelector('#cloudCard'); };
  const feed = async (d, n) => { await d.p.evaluate(() => { window.TG.ui.state().needs.food = 20; window.TG.ui.state().needs.energy = 20; }); await d.p.click('#act-feed'); await d.p.click('#sheetBody .item >> nth=' + n); await d.p.click('#sheetClose'); };

  const A = await device('A');
  console.log('available:', await A.p.evaluate(() => window.TG.cloud.available));
  for (let i = 0; i < 8; i++) await A.p.click('#scene');
  await A.p.click('#modalCard button');
  await A.p.evaluate(() => { window.TG.ui.state().name = 'Donny'; });
  await settings(A);
  await A.p.click('#cloudOn');
  await A.p.waitForSelector('#keeperCode');
  const code = await A.p.textContent('#keeperCode');
  await A.p.click('#modalCard .btn.gold');
  await A.p.waitForSelector('#cloudStatus');
  await A.p.click('#sheetClose');
  console.log('1 enabled on A; code looks like', code.replace(/[0-9A-Z]/g, 'X'), JSON.stringify((await st(A)).info && { rev: (await st(A)).info.rev }));
  assert.match(code, /^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);

  // device B is a fresh egg; it links with the code typed in lower case
  const B = await device('B');
  assert.equal(await B.p.isVisible('#linkBtn'), true);
  await B.p.click('#linkBtn'); await B.p.waitForSelector('#keeperInput');
  await B.p.fill('#keeperInput', code.toLowerCase());
  await B.p.click('#cloudLink');
  await B.p.waitForFunction(() => window.TG.ui.state().hatched);
  let sb = await st(B);
  console.log('2 B linked:', JSON.stringify(sb));
  assert.equal(sb.name, 'Donny'); // the pet arrives exactly as device A had him
  assert.equal(sb.linked, true);
  await B.p.click('#sheetClose').catch(() => {});
  // each device knows where it is, and being somewhere else is not a change worth an upload
  assert.equal(await zone(A), ZONES.A); assert.equal(await zone(B), ZONES.B);
  await sync(B); await sync(A); await sync(B);
  assert.equal((await st(B)).info.dirty, false); assert.equal((await st(A)).info.dirty, false);
  assert.equal(await zone(A), ZONES.A);

  // B feeds; A picks it up
  await feed(B, 0); await sync(B);
  await sync(A);
  let sa = await st(A);
  console.log('3 after B fed -> A:', JSON.stringify({ burgers: sa.burgers, rev: sa.info.rev }));
  assert.equal(sa.burgers, 1);
  assert.equal(await zone(A), ZONES.A); assert.equal(sa.info.dirty, false); // picked up, and still where A is
  assert.equal(await A.p.isVisible('#keepMine'), false);

  // a pet saved before zones existed gets its zone sent up once, and nobody is asked anything
  const cloudZone = async () => (await (await fetch(BASE + 'api/pet', { headers: { authorization: 'Bearer ' + code.replace(/-/g, '') } })).json()).state.zone;
  assert.equal(await cloudZone(), ZONES.B); // B looked after him last
  await A.p.evaluate(() => { const s = window.TG.ui.state(); s.zone = ''; window.TG.game.save(s); window.TG.cloud.markDirty(); });
  await sync(A);
  assert.equal(await cloudZone(), '');
  await A.p.reload();
  await A.p.waitForFunction(() => window.TG && window.TG.ui && window.TG.cloud.available !== null);
  await sync(A); await A.p.waitForTimeout(1200); await sync(A);
  assert.equal(await cloudZone(), ZONES.A);
  assert.equal(await A.p.isVisible('#keepMine'), false);
  await sync(B);
  assert.equal(await B.p.isVisible('#keepMine'), false);
  console.log('3b a save without a zone got one:', await cloudZone());

  // both change him while A is offline: A must be asked which pet to keep
  await A.ctx.setOffline(true);
  await feed(A, 1); await sync(A);                      // A: a Diet Coke, cannot be sent
  await feed(B, 0); await sync(B);                      // B: a second hamberder, sent
  await A.ctx.setOffline(false);
  await sync(A);
  await A.p.waitForSelector('#keepMine');
  console.log('4 conflict shown on A:', (await A.p.textContent('#modalCard h2')));
  await A.p.click('#keepMine'); await A.p.waitForTimeout(800);
  await sync(B);
  sa = await st(A); sb = await st(B);
  console.log('5 kept A -> A', JSON.stringify({ burgers: sa.burgers, cokes: sa.cokes }), 'B', JSON.stringify({ burgers: sb.burgers, cokes: sb.cokes }));
  assert.deepEqual([sb.burgers, sb.cokes], [sa.burgers, sa.cokes]);
  assert.equal(sa.cokes, 1);

  // and the other way: choose the other device's pet
  await A.ctx.setOffline(true);
  await feed(A, 1); await sync(A);
  await feed(B, 0); await sync(B);
  await A.ctx.setOffline(false);
  await sync(A);
  await A.p.waitForSelector('#keepTheirs'); await A.p.click('#keepTheirs'); await A.p.waitForTimeout(500);
  sa = await st(A); sb = await st(B);
  console.log('6 took B -> A', JSON.stringify({ burgers: sa.burgers, cokes: sa.cokes }), 'B', JSON.stringify({ burgers: sb.burgers, cokes: sb.cokes }));
  assert.deepEqual([sa.burgers, sa.cokes], [sb.burgers, sb.cokes]);

  // settings stay with the device; the keeper code is not inside a save code
  await A.p.evaluate(() => { window.TG.ui.state().settings.sound = false; });
  await feed(A, 0); await sync(A); await sync(B);
  console.log('7 sound on B still:', await B.p.evaluate(() => window.TG.ui.state().settings.sound), '| save code carries the keeper code:', await A.p.evaluate((c) => atob(window.TG.game.exportCode(window.TG.ui.state()).slice(4)).includes(c.replace(/-/g, '')), code));

  // a new code on A locks B out; B keeps a local copy
  await settings(A); await A.p.click('#cloudRotate'); await A.p.click('#modalCard .btn.red');
  await A.p.waitForSelector('#keeperCode'); const code2 = await A.p.textContent('#keeperCode'); await A.p.click('#modalCard .btn.gold'); await A.p.click('#sheetClose');
  assert.notEqual(code2, code);
  await feed(B, 0); await sync(B);
  sb = await st(B);
  console.log('8 after new code -> B linked:', sb.linked, 'still hatched:', sb.hatched);
  assert.equal(sb.linked, false); assert.equal(sb.hatched, true);

  // a link (code in the URL fragment) relinks B after a confirmation, and the fragment is removed
  const link = await A.p.evaluate(() => window.TG.cloud.shareLink());
  await B.p.goto('about:blank'); await B.p.goto(link);
  await B.p.waitForSelector('#modalCard .btn.red');
  console.log('9 link confirm:', (await B.p.textContent('#modalCard h2')), '| fragment left in address:', (await B.p.evaluate(() => location.hash)) !== '');
  await B.p.click('#modalCard .btn.red'); await B.p.waitForTimeout(600);
  sb = await st(B); sa = await st(A);
  assert.equal(sb.linked, true); assert.equal(sb.burgers, sa.burgers);

  // deleting the cloud copy unlinks everyone and keeps the local pets
  await settings(A); await A.p.click('#cloudDelete'); await A.p.click('#modalCard .btn.red'); await A.p.waitForTimeout(600);
  await feed(B, 0); await sync(B);
  sa = await st(A); sb = await st(B);
  console.log('10 after delete -> A linked:', sa.linked, 'B linked:', sb.linked, 'both hatched:', sa.hatched && sb.hatched);
  assert.equal(sa.linked, false); assert.equal(sb.linked, false);
  assert.deepEqual(problems, []);
  console.log('ok   cloud save: two devices, one pet');
} catch (e) {
  failed = true;
  console.log('FAIL cloud save\n     ' + String(e.message).split('\n').slice(0, 8).join('\n     '));
} finally {
  await b.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
