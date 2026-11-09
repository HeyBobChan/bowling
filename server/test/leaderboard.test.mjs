import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { createStore } from '../store.mjs';
import { createServer } from '../app.mjs';

// Deliberately require a separate disposable database: never fall back to DATABASE_URL.
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database.');
let store, admin, server, base, staticDir;
const payload = (score = 100, name = 'ABC') => ({ submissionId: randomUUID(), name, score });
const post = (body, path = 'main') => fetch(`${base}/api/leaderboards/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const top = async () => (await fetch(`${base}/api/leaderboards/main`)).json();
const closeServer = (s) => new Promise((resolve) => s.close(resolve));
async function listen(app) {
  const s = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => s.once('listening', resolve));
  return s;
}
before(async () => {
  staticDir = await mkdtemp(join(tmpdir(), 'leaderboard-static-'));
  await mkdir(join(staticDir, 'assets'));
  await writeFile(join(staticDir, 'index.html'), '<h1>Games</h1>');
  await writeFile(join(staticDir, 'assets/test.js'), 'console.log("game");');
  store = await createStore(connectionString);
  admin = new pg.Pool({ connectionString });
  server = await listen(createServer({ store, staticDir, writeLimit: 1000 }));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => { await admin.query('TRUNCATE leaderboard_scores'); });
after(async () => {
  await closeServer(server); await store.close(); await admin.end();
  await rm(staticDir, { recursive: true });
});

test('persists normalized English and Hebrew names and returns a shared top ten', async () => {
  for (let i = 0; i < 12; i++) {
    const response = await post(payload(i * 10, i === 0 ? 'אבג' : 'abc'));
    assert.equal(response.status, 201);
  }
  const { entries } = await top();
  assert.equal(entries.length, 10);
  assert.deepEqual(entries.map((entry) => entry.score), [110, 100, 90, 80, 70, 60, 50, 40, 30, 20]);
  assert.equal(entries[0].name, 'ABC');
  assert.deepEqual(entries.map((entry) => entry.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const secondProcess = await createStore(connectionString);
  assert.deepEqual(await secondProcess.top('main'), await store.top('main'));
  await secondProcess.close();
  assert.equal((await admin.query('SELECT name FROM leaderboard_scores WHERE score = 0')).rows[0].name, 'אבג');
});

test('retries and concurrent requests create exactly one score and reject changed payloads', async () => {
  const body = payload();
  const responses = await Promise.all(Array.from({ length: 5 }, () => post(body)));
  assert.equal(responses.filter((response) => response.status === 201).length, 1);
  assert.equal(responses.filter((response) => response.status === 200).length, 4);
  assert.equal((await top()).entries.length, 1);
  assert.equal((await post({ ...body, score: 200 })).status, 409);
  assert.equal((await post({ ...body, name: 'DEF' })).status, 409);
  assert.equal((await top()).entries[0].score, 100);
});

test('equal scores rank deterministically by time, including outside the top ten', async () => {
  let last;
  for (let i = 0; i < 12; i++) last = await (await post(payload())).json();
  assert.equal(last.entry.rank, 12);
  assert.equal((await top()).entries.length, 10);
  const response = await (await post(payload(200))).json();
  assert.equal(response.entry.rank, 1);
});

test('rejects invalid names, scores, IDs, games and malformed or oversized requests', async () => {
  for (const name of ['', 'AB', 'ABCD', '<b>', 'AבC', '123', '💩💩💩']) assert.equal((await post(payload(100, name))).status, 400);
  for (const score of [-5, 1.5, 7, 1000005, '100', null]) assert.equal((await post(payload(score))).status, 400);
  assert.equal((await post({ ...payload(), submissionId: 'bad' })).status, 400);
  assert.equal((await post(payload(), 'missing')).status, 404);
  assert.equal((await post(payload(), 'toString')).status, 404);
  assert.equal((await post(payload(100, 'A'.repeat(3000)))).status, 413);
  const malformed = await fetch(`${base}/api/leaderboards/main`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  const plain = await fetch(`${base}/api/leaderboards/main`, { method: 'POST', body: 'hello' });
  assert.equal(plain.status, 415);
  assert.equal((await top()).entries.length, 0);
});

test('serves the static site with correct caches and real 404s', async () => {
  const index = await fetch(base);
  assert.match(await index.text(), /Games/);
  assert.equal(index.headers.get('cache-control'), 'no-cache');
  const asset = await fetch(`${base}/assets/test.js`);
  assert.match(asset.headers.get('cache-control'), /immutable/);
  assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404);
  assert.equal((await fetch(`${base}/server/schema.sql`)).status, 404);
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/api/leaderboards/main`)).headers.get('cache-control'), 'no-store');
});

test('limits repeated submissions and recovers from a database outage without leaking errors', async () => {
  const limited = await listen(createServer({ store, staticDir, writeLimit: 1 }));
  const url = `http://127.0.0.1:${limited.address().port}/api/leaderboards/main`;
  for (const expected of [201, 429]) {
    const result = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
    assert.equal(result.status, expected);
    if (expected === 429) assert.ok(result.headers.get('retry-after'));
  }
  await closeServer(limited);
  let offline = true;
  const broken = await listen(createServer({ staticDir, store: {
    check: async () => { if (offline) throw new Error('private database details'); },
    top: async () => { if (offline) throw new Error('private database details'); return []; },
  } }));
  const brokenBase = `http://127.0.0.1:${broken.address().port}`;
  assert.equal((await fetch(`${brokenBase}/healthz`)).status, 503);
  const response = await fetch(`${brokenBase}/api/leaderboards/main`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'unavailable' });
  assert.equal((await fetch(brokenBase)).status, 200);
  offline = false;
  assert.equal((await fetch(`${brokenBase}/healthz`)).status, 200);
  assert.equal((await fetch(`${brokenBase}/api/leaderboards/main`)).status, 200);
  await closeServer(broken);
});

test('allows configured website origins to preflight and save without exposing credentials', async () => {
  const app = await listen(createServer({ store, staticDir, allowedOrigins: ['https://matanbob.com'] }));
  const url = `http://127.0.0.1:${app.address().port}/api/leaderboards/main`;
  const headers = { Origin: 'https://matanbob.com', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' };
  const preflight = await fetch(url, { method: 'OPTIONS', headers });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), headers.Origin);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
  const saved = await fetch(url, { method: 'POST', headers: { Origin: headers.Origin, 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
  assert.equal(saved.status, 201);
  assert.equal(saved.headers.get('access-control-allow-origin'), headers.Origin);
  const rejected = await fetch(url, { method: 'OPTIONS', headers: { ...headers, Origin: 'https://unlisted.example' } });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
  await closeServer(app);
});
