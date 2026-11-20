// Cloud saves, over real HTTP: `npm test`. The same checks run against PostgreSQL when
// TEST_DATABASE_URL (the restricted app login, after migrate.mjs) is set.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApi, newKey, normalizeKey, hashKey, limiter, validState, KEY_LENGTH } from '../server/api.mjs';
import { createMemoryStore } from '../server/store-memory.mjs';

const save = (extra) => Object.assign({ v: 1, name: 'The Donald', xp: 120, cash: 1e6, needs: { food: 50, ego: 50, fun: 50, glow: 50, energy: 80 } }, extra);

async function listen(options) {
  const api = createApi(options);
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (!(await api(req, res, pathname))) { res.writeHead(404); res.end('static'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (method, path, { body, key, headers } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: Object.assign({}, body !== undefined ? { 'content-type': 'application/json' } : {}, key ? { authorization: 'Bearer ' + key } : {}, headers),
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, data: text && /json/.test(res.headers.get('content-type') || '') ? JSON.parse(text) : null };
  };
  return { call, close: () => new Promise((r) => server.close(r)) };
}

test('keeper codes: long, unambiguous, forgiving to type, and stored only as a hash', () => {
  const key = newKey();
  assert.equal(key.length, KEY_LENGTH);
  assert.match(key, /^[0-9A-HJKMNP-TV-Z]+$/);
  assert.notEqual(newKey(), key);
  const typed = key.toLowerCase().replace(/(.{5})(?=.)/g, '$1-').replace(/0/g, 'o').replace(/1/g, 'l');
  assert.equal(normalizeKey(' ' + typed + ' '), key);
  assert.equal(normalizeKey('short'), null);
  assert.equal(normalizeKey('U'.repeat(KEY_LENGTH)), null);
  assert.equal(normalizeKey(null), null);
  assert.match(hashKey(key), /^[0-9a-f]{64}$/);
  assert.ok(!hashKey(key).includes(key.toLowerCase()));
});

test('the limiter allows a burst, then says how long to wait, then recovers', () => {
  let t = 0;
  const l = limiter(2, 1000, () => t);
  assert.equal(l.take('a'), null);
  assert.equal(l.take('a'), null);
  assert.equal(l.take('a'), 1);
  assert.equal(l.take('b'), null);
  t = 1001;
  assert.equal(l.take('a'), null);
  l.sweep();
  assert.equal(l.size(), 1);
});

test('only game saves are accepted', () => {
  assert.equal(validState(save()), true);
  for (const bad of [null, [], 'x', {}, { v: 2, needs: {}, xp: 1 }, { v: 1, xp: 1 }, { v: 1, needs: {}, xp: 'lots' }, { v: 1, needs: {}, xp: Infinity }]) assert.equal(validState(bad), false);
});

function suite(name, makeStore) {
  test(name + ': turn it on, load it elsewhere, save, and see the other device', async (t) => {
    const store = await makeStore();
    const { call, close } = await listen({ store });
    t.after(async () => { await close(); await store.close(); });

    assert.deepEqual((await call('GET', '/api/status')).data, { sync: true });

    const made = await call('POST', '/api/pets', { body: { state: save() } });
    assert.equal(made.status, 201);
    assert.equal(made.headers.get('cache-control'), 'no-store');
    const key = made.data.key;
    assert.equal(normalizeKey(key), key);
    assert.equal(made.data.rev, 1);

    // a second device types the code, dashes and lower case and all
    const typed = key.toLowerCase().replace(/(.{5})(?=.)/g, '$1-');
    const loaded = await call('GET', '/api/pet', { key: typed });
    assert.equal(loaded.status, 200);
    assert.equal(loaded.data.rev, 1);
    assert.deepEqual(loaded.data.state, save());
    assert.ok(Date.parse(loaded.data.updatedAt) > 0);

    // it saves; the first device, still on revision 1, is told about the newer pet
    const second = await call('PUT', '/api/pet', { key, body: { baseRev: 1, state: save({ xp: 500, name: 'Dön 🍔' }) } });
    assert.deepEqual([second.status, second.data], [200, { rev: 2 }]);
    const stale = await call('PUT', '/api/pet', { key, body: { baseRev: 1, state: save({ xp: 130 }) } });
    assert.equal(stale.status, 409);
    assert.equal(stale.data.rev, 2);
    assert.equal(stale.data.state.xp, 500);
    assert.equal(stale.data.state.name, 'Dön 🍔');
    // having seen it, the first device may overwrite on purpose
    assert.deepEqual((await call('PUT', '/api/pet', { key, body: { baseRev: 2, state: save({ xp: 130 }) } })).data, { rev: 3 });
    assert.equal((await call('GET', '/api/pet', { key })).data.state.xp, 130);
    assert.equal((await call('DELETE', '/api/pet', { key })).status, 204);
  });

  test(name + ': a new code locks the old one out; deleting removes the pet', async (t) => {
    const store = await makeStore();
    const { call, close } = await listen({ store });
    t.after(async () => { await close(); await store.close(); });
    const key = (await call('POST', '/api/pets', { body: { state: save() } })).data.key;
    const other = (await call('POST', '/api/pets', { body: { state: save({ xp: 9 }) } })).data.key;

    const rotated = await call('POST', '/api/pet/key', { key });
    assert.equal(rotated.status, 200);
    assert.notEqual(rotated.data.key, key);
    assert.equal((await call('GET', '/api/pet', { key })).status, 401);
    assert.equal((await call('GET', '/api/pet', { key: rotated.data.key })).data.state.xp, 120);
    assert.equal((await call('GET', '/api/pet', { key: other })).data.state.xp, 9, 'other pets are untouched');

    assert.equal((await call('DELETE', '/api/pet', { key: rotated.data.key })).status, 204);
    assert.equal((await call('GET', '/api/pet', { key: rotated.data.key })).status, 401);
    assert.equal((await call('PUT', '/api/pet', { key: rotated.data.key, body: { baseRev: 1, state: save() } })).status, 401);
    assert.equal((await call('GET', '/api/pet', { key: other })).status, 200);
    await call('DELETE', '/api/pet', { key: other });
  });
}

suite('memory', async () => createMemoryStore());
if (process.env.TEST_DATABASE_URL) {
  const { createPgStore } = await import('../server/store-pg.mjs');
  suite('postgres', async () => createPgStore(process.env.TEST_DATABASE_URL));
  test('postgres: the pet count caps new pets, and old pets are pruned', async (t) => {
    const store = createPgStore(process.env.TEST_DATABASE_URL, { maxPets: 0 });
    t.after(() => store.close());
    assert.equal(await store.create('a'.repeat(64), save()), null, 'full');
    const roomy = createPgStore(process.env.TEST_DATABASE_URL);
    t.after(() => roomy.close());
    assert.deepEqual(await roomy.create('b'.repeat(64), save()), { rev: 1 });
    assert.equal(await roomy.create('b'.repeat(64), save()), null, 'a code cannot be claimed twice');
    assert.equal(await roomy.prune(1), 0, 'fresh pets stay');
    assert.equal(await roomy.remove('b'.repeat(64)), true);
  });
}

test('bad requests get clear answers and never reach the store', async (t) => {
  const store = createMemoryStore();
  const { call, close } = await listen({ store });
  t.after(close);
  assert.equal((await call('POST', '/api/pets', { body: { state: { hello: 'world' } } })).status, 400);
  assert.equal((await call('POST', '/api/pets', { body: '{not json' })).status, 400);
  assert.equal((await call('POST', '/api/pets', { body: { state: save({ posts: 'x'.repeat(50_000) }) } })).status, 413);
  assert.equal((await call('POST', '/api/pets', { body: { state: save({ posts: 'x'.repeat(70_000) }) } })).status, 413);
  assert.equal(await store.count(), 0);
  const key = (await call('POST', '/api/pets', { body: { state: save() } })).data.key;
  assert.equal((await call('PUT', '/api/pet', { key, body: { state: save() } })).status, 400, 'baseRev is required');
  assert.equal((await call('GET', '/api/pet')).status, 401);
  assert.equal((await call('GET', '/api/pet', { key: 'nope' })).status, 401);
  assert.equal((await call('GET', '/api/pet', { headers: { authorization: 'Basic abc' } })).status, 401);
  assert.equal((await call('PATCH', '/api/pet', { key, body: {} })).status, 405);
  assert.equal((await call('GET', '/api/pets')).status, 405);
  assert.equal((await call('GET', '/api/everything')).status, 404);
  assert.equal((await call('GET', '/elsewhere')).status, 404);
});

test('without a store the game still runs: status says so and saves are refused', async (t) => {
  const { call, close } = await listen({ store: null });
  t.after(close);
  assert.deepEqual((await call('GET', '/api/status')).data, { sync: false });
  assert.equal((await call('POST', '/api/pets', { body: { state: save() } })).status, 503);
});

test('limits: new pets per visitor, guessing codes, and saves per pet', async (t) => {
  const store = createMemoryStore();
  const { call, close } = await listen({ store, limits: { creates: 2, badKeys: 3, writes: 2 } });
  t.after(close);
  const key = (await call('POST', '/api/pets', { body: { state: save() } })).data.key;
  assert.equal((await call('POST', '/api/pets', { body: { state: save() } })).status, 201);
  const third = await call('POST', '/api/pets', { body: { state: save() } });
  assert.equal(third.status, 429);
  assert.ok(Number(third.headers.get('retry-after')) > 0);

  for (let i = 0; i < 3; i++) assert.equal((await call('GET', '/api/pet', { key: newKey() })).status, 401);
  assert.equal((await call('GET', '/api/pet', { key: newKey() })).status, 429, 'guessing is cut off');
  assert.equal((await call('GET', '/api/pet', { key })).status, 200, 'the real keeper is not locked out');

  assert.equal((await call('PUT', '/api/pet', { key, body: { baseRev: 1, state: save() } })).status, 200);
  assert.equal((await call('PUT', '/api/pet', { key, body: { baseRev: 2, state: save() } })).status, 200);
  assert.equal((await call('PUT', '/api/pet', { key, body: { baseRev: 3, state: save() } })).status, 429);
});

test('the visitor address is believed from a proxy only with the shared key', async (t) => {
  const store = createMemoryStore();
  const { call, close } = await listen({ store, proxyKey: 'shared-secret', limits: { creates: 1 } });
  t.after(close);
  const from = (ip, proxyKey) => call('POST', '/api/pets', { body: { state: save() }, headers: Object.assign({ 'x-tg-client-ip': ip }, proxyKey ? { 'x-tg-proxy-key': proxyKey } : {}) });
  // through the trusted proxy every visitor has their own allowance
  assert.equal((await from('203.0.113.1', 'shared-secret')).status, 201);
  assert.equal((await from('203.0.113.2', 'shared-secret')).status, 201);
  assert.equal((await from('203.0.113.1', 'shared-secret')).status, 429);
  // without the key the claimed address is ignored: these all count as the one real connection
  assert.equal((await from('198.51.100.1')).status, 201);
  assert.equal((await from('198.51.100.2')).status, 429);
  assert.equal((await from('198.51.100.3', 'wrong-key')).status, 429);
});

test('an edge header is used for the visitor address only when configured', async (t) => {
  const store = createMemoryStore();
  const edge = await listen({ store, ipHeader: 'x-real-ip', limits: { creates: 1 } });
  const plain = await listen({ store, limits: { creates: 1 } });
  t.after(async () => { await edge.close(); await plain.close(); });
  const post = (srv, ip) => srv.call('POST', '/api/pets', { body: { state: save() }, headers: { 'x-real-ip': ip } });
  assert.equal((await post(edge, '203.0.113.5')).status, 201);
  assert.equal((await post(edge, '203.0.113.6')).status, 201);
  assert.equal((await post(edge, '203.0.113.5')).status, 429);
  assert.equal((await post(plain, '203.0.113.7')).status, 201);
  assert.equal((await post(plain, '203.0.113.8')).status, 429, 'an unconfigured header is not trusted');
});
