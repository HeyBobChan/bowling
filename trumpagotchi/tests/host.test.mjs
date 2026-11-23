// Hosting a Don for every keeper who asks (don/host.mjs): `npm test`. The Dons here are a
// stand-in (fixtures/fake-don.mjs) that Canon "approves" a moment after he starts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHost, statusOf } from '../don/host.mjs';
import { hashKey, newKey } from '../server/api.mjs';

const FAKE = fileURLToPath(new URL('./fixtures/fake-don.mjs', import.meta.url));
const HOST_KEY = 'test-host-key';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) { const v = await check(); if (v) return v; if (Date.now() > end) throw new Error('timed out'); await wait(50); }
}

async function hosting(t, o = {}) {
  const data = mkdtempSync(join(tmpdir(), 'don-host-'));
  if (o.before) o.before(data);
  const lines = [];
  const host = createHost(Object.assign({ data, main: FAKE, hostKey: HOST_KEY, max: 3, log: (l) => lines.push(l), env: Object.assign({}, process.env, { DON_HOST_KEY: HOST_KEY }) }, o.options));
  const port = await host.start(0);
  const base = 'http://127.0.0.1:' + port;
  const call = async (method, path, body, key = HOST_KEY) => {
    const res = await fetch(base + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, key ? { 'x-don-host-key': key } : {}), body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  };
  t.after(async () => { await host.stop(); rmSync(data, { recursive: true, force: true }); });
  return { host, data, call, lines };
}
const donDirs = (data) => (existsSync(join(data, 'dons')) ? readdirSync(join(data, 'dons')) : []);
const notes = (data, id) => JSON.parse(readFileSync(join(data, 'dons', id, 'don.json'), 'utf8'));

test('what a keeper is told follows what the Don wrote in his notes', () => {
  assert.equal(statusOf(null), 'none');
  assert.equal(statusOf({ phase: 'asking' }), 'asked');
  assert.equal(statusOf({ key: 'x' }), 'asked');
  assert.equal(statusOf({ phase: 'approved' }), 'here');
  assert.equal(statusOf({ phase: 'listening' }), 'here');
  assert.equal(statusOf({ greeted: true }), 'here'); // the first Don, from before phases were written
  assert.equal(statusOf({ phase: 'declined' }), 'declined');
  assert.equal(statusOf({ phase: 'refused' }), 'stopped');
});

test('a keeper asks: he gets his own Don, with their code, in a private directory, and is let in', async (t) => {
  const { data, call } = await hosting(t);
  const key = newKey();
  const asked = await call('POST', '/dons', { key: key.toLowerCase().replace(/(.{5})(?=.)/g, '$1-'), phone: '+1 (555) 123-4567' });
  assert.deepEqual(asked, { status: 201, data: { status: 'asked' } });
  const [id] = donDirs(data);
  assert.match(id, /^[0-9a-f]{12}$/);
  assert.equal(statSync(join(data, 'dons', id)).mode & 0o777, 0o700);
  assert.equal(statSync(join(data, 'dons', id, 'don.json')).mode & 0o777, 0o600);
  await until(() => existsSync(join(data, 'dons', id, 'starts.log')));
  const start = JSON.parse(readFileSync(join(data, 'dons', id, 'starts.log'), 'utf8').trim());
  assert.equal(start.id, id);
  assert.equal(start.hostKey, '', 'a Don never sees the host key');
  assert.equal(start.phone, '', 'his number is in his notes, not his environment');
  assert.equal(notes(data, id).key, key);
  assert.equal((await call('GET', '/dons/' + hashKey(key))).data.status !== 'none', true);
  await until(() => existsSync(join(data, 'dons', id, 'starts.log')));
  await until(async () => (await call('GET', '/dons/' + hashKey(key))).data.status === 'here');
  assert.equal(notes(data, id).ownerPhone, null, 'once he is in, the number is Canon’s business');
  assert.ok(!readFileSync(join(data, 'dons.json'), 'utf8').includes('5551234567'), 'numbers are never kept in the open');
  assert.equal((await call('GET', '/dons/' + hashKey(newKey()))).data.status, 'none');
});

test('one Don per pet and per number, and full is full', async (t) => {
  const { data, call } = await hosting(t);
  const a = newKey(), b = newKey(), c = newKey(), d = newKey(), e = newKey();
  assert.equal((await call('POST', '/dons', { key: a, phone: '+15550000001' })).status, 201);
  const again = await call('POST', '/dons', { key: a, phone: '+15550000002' });
  assert.equal(again.status, 200, 'the same pet already has a Don');
  assert.notEqual(again.data.status, 'none');
  assert.deepEqual(await call('POST', '/dons', { key: b, phone: '+1 555 000 0001' }), { status: 409, data: { status: 'number-taken' } });
  assert.equal((await call('POST', '/dons', { key: b, phone: '+15550000002' })).status, 201);
  assert.equal((await call('POST', '/dons', { key: c, phone: '+15559990000' })).status, 201); // declined: ends in 0000
  await until(async () => (await call('GET', '/dons/' + hashKey(c))).data.status === 'declined');
  assert.equal((await call('POST', '/dons', { key: d, phone: '+15550000004' })).status, 201, 'a declined Don does not count against the limit');
  assert.deepEqual(await call('POST', '/dons', { key: e, phone: '+15550000005' }), { status: 503, data: { status: 'full' } });
  assert.deepEqual(await call('POST', '/dons', { key: c, phone: '+15559990001' }), { status: 503, data: { status: 'full' } });
  assert.equal((await call('GET', '/dons/' + hashKey(c))).data.status, 'declined', 'a full house leaves the old request as it was');
  assert.equal(donDirs(data).length, 4);
});

test('asking again after a no starts afresh, with a new Don', async (t) => {
  const { data, call } = await hosting(t);
  const key = newKey();
  assert.equal((await call('POST', '/dons', { key, phone: '+15559990000' })).status, 201);
  await until(async () => (await call('GET', '/dons/' + hashKey(key))).data.status === 'declined');
  const [before] = donDirs(data);
  assert.equal((await call('POST', '/dons', { key, phone: '+15559990001' })).status, 201);
  const after = donDirs(data);
  assert.equal(after.length, 1);
  assert.notEqual(after[0], before);
  await until(async () => (await call('GET', '/dons/' + hashKey(key))).data.status === 'here');
});

test('the door is shut without the key, and bad requests are refused', async (t) => {
  const { call } = await hosting(t);
  assert.deepEqual(await call('GET', '/healthz', null, null), { status: 200, data: { ok: true } });
  assert.equal((await call('POST', '/dons', { key: newKey(), phone: '+15551234567' }, null)).status, 401);
  assert.equal((await call('POST', '/dons', { key: newKey(), phone: '+15551234567' }, 'wrong')).status, 401);
  assert.equal((await call('GET', '/dons/' + hashKey(newKey()), null, 'wrong')).status, 401);
  assert.equal((await call('POST', '/dons', { key: 'nope', phone: '+15551234567' })).status, 400);
  assert.equal((await call('POST', '/dons', { key: newKey(), phone: '555 1234' })).status, 400);
  assert.equal((await call('GET', '/dons/abc')).status, 404);
});

test('without a host key nothing can be asked for, but Dons still run', async (t) => {
  const key = newKey();
  const { host, call } = await hosting(t, { options: { hostKey: '' }, before: (data) => writeFileSync(join(data, 'don.json'), JSON.stringify({ key })) });
  assert.equal((await call('POST', '/dons', { key: newKey(), phone: '+15551234567' })).status, 401);
  await until(() => host.running().includes('first'));
});

test('the first Don, set up by hand, keeps his home, his number and his pet', async (t) => {
  const key = newKey();
  const { data, host, call } = await hosting(t, {
    options: { firstPhone: '+972501234567' },
    before: (dir) => { mkdirSync(join(dir, 'canon'), { recursive: true }); writeFileSync(join(dir, 'don.json'), JSON.stringify({ key, greeted: true })); },
  });
  await until(() => existsSync(join(data, 'starts.log')));
  const start = JSON.parse(readFileSync(join(data, 'starts.log'), 'utf8').trim());
  assert.deepEqual([start.id, start.phone], ['first', '+972501234567']);
  assert.equal((await call('GET', '/dons/' + hashKey(key))).data.status, 'here');
  assert.deepEqual(await call('POST', '/dons', { key: newKey(), phone: '+972 50-123-4567' }), { status: 409, data: { status: 'number-taken' } });
  assert.equal((await call('POST', '/dons', { key, phone: '+15551234567' })).data.status, 'here', 'his pet already has him');
  assert.deepEqual(host.running(), ['first']);
});

test('a Don who stops is started again', async (t) => {
  const key = newKey();
  const { data, host, lines } = await hosting(t, { before: (dir) => writeFileSync(join(dir, 'don.json'), JSON.stringify({ key, crashOnce: true })) });
  await until(() => lines.some((l) => /Starting him again/.test(l)));
  await until(() => readFileSync(join(data, 'starts.log'), 'utf8').trim().split('\n').length === 2, 8000);
  assert.deepEqual(host.running(), ['first']);
});

test('requests nobody approves are let go after a week', async (t) => {
  let clock = Date.now();
  const env = Object.assign({}, process.env, { FAKE_APPROVE_MS: '600000' }); // nobody approves him
  const { data, call, host } = await hosting(t, { options: { now: () => clock, env } });
  const key = newKey();
  assert.equal((await call('POST', '/dons', { key, phone: '+15557770001' })).status, 201);
  assert.equal(donDirs(data).length, 1);
  await host.tidy();
  assert.equal(donDirs(data).length, 1, 'a fresh request stays');
  clock += 8 * 24 * 3600e3;
  await host.tidy();
  assert.equal(donDirs(data).length, 0);
  assert.equal((await call('GET', '/dons/' + hashKey(key))).data.status, 'none');
});
