// Many Dons, one service. Every keeper's Don is still their own Canon agent, registered under
// their own Canon number and approved by them in the app; this only starts and minds them.
// Each Don runs as his own process (main.mjs) with his own notes and Canon keys in his own
// directory, so one keeper's Don never touches another's.
//
//   <DON_DATA_DIR>/don.json, canon/   the first Don, set up by hand before there was a host
//   <DON_DATA_DIR>/dons/<id>/         every Don a keeper has asked for since
//   <DON_DATA_DIR>/dons.json          which Dons there are (and a keyed hash of each number)
//
// The game's server asks for Dons over a private network, with the shared DON_HOST_KEY:
//   POST /dons          { key, phone }  a Don for the pet behind this keeper code
//                       → 201 asked | 200 his status | 409 number-taken | 503 full
//   GET  /dons/<hash>   the status of the Don looking after the pet with this code hash
//   GET  /healthz       open to all, says nothing about anyone
// Statuses: none, asked (waiting for the keeper to approve him in Canon), here, declined, stopped.
//
// Settings (environment), besides what each Don reads (see main.mjs):
//   DON_HOST_KEY    shared with the game's server. Without it the Dons still run, but none can be asked for.
//   DON_HOST_PORT   default 8080, on every interface (Railway's private network is IPv6)
//   DON_MAX         how many Dons keepers may ask for, default 20 (the first Don does not count)
//   CANON_OWNER_PHONE  the first Don's keeper, as before
import { spawn } from 'node:child_process';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashKey, normalizeKey, normalizePhone } from '../server/api.mjs';
import { fileStore } from './store.mjs';

const FIRST = 'first';
const STALE_MS = 7 * 24 * 3600e3; // a request nobody approves is let go after a week

/** What a keeper is told, from what a Don has written in his notes. */
export function statusOf(notes) {
  if (!notes) return 'none';
  if (notes.phase === 'approved' || notes.phase === 'listening' || notes.greeted) return 'here';
  if (notes.phase === 'declined') return 'declined';
  if (notes.phase === 'refused') return 'stopped';
  return 'asked';
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}
function writePrivate(path, data) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
}
function same(a, b) {
  const x = createHash('sha256').update(String(a)).digest(), y = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x, y);
}

/**
 * @param {object} o
 * @param {string} o.data       where Dons keep their notes and keys
 * @param {string} o.main       the Don program
 * @param {string} [o.hostKey]  shared with the game's server
 * @param {number} [o.max]
 * @param {string} [o.firstPhone]  the first Don's keeper (CANON_OWNER_PHONE)
 * @param {object} [o.env]      passed to every Don
 * @param {function} [o.log]
 * @param {function} [o.now]
 */
export function createHost({ data, main, hostKey = '', max = 20, firstPhone = '', env = process.env, log = console.log, now = Date.now }) {
  mkdirSync(join(data, 'dons'), { recursive: true, mode: 0o700 });
  chmodSync(data, 0o700);
  const registryPath = join(data, 'dons.json');
  // Numbers are compared, never kept: each is stored as a keyed hash, and the key stays here.
  const pepperPath = join(data, 'dons-pepper');
  if (!existsSync(pepperPath)) writeFileSync(pepperPath, randomBytes(32).toString('hex'), { mode: 0o600 });
  const pepper = readFileSync(pepperPath, 'utf8').trim();
  const numberHash = (phone) => createHmac('sha256', pepper).update(phone).digest('hex');

  let registry = readJson(registryPath) || { dons: [] };
  const save = () => writePrivate(registryPath, registry);
  const dirOf = (id) => (id === FIRST ? data : join(data, 'dons', id));
  const notesOf = (id) => readJson(join(dirOf(id), 'don.json'));
  const hasFirst = () => !!firstPhone || existsSync(join(data, 'don.json')) || existsSync(join(data, 'canon'));
  const ids = () => (hasFirst() ? [FIRST] : []).concat(registry.dons.map((d) => d.id));

  // ---------------------------------------------------------------- the Dons themselves
  const running = new Map(); // id → { child, fails, startedAt, timer }
  let stopping = false;
  function start(id) {
    if (stopping || running.get(id)?.child) return;
    const entry = running.get(id) || { fails: 0 };
    const childEnv = Object.assign({}, env, { DON_DATA_DIR: dirOf(id), DON_ID: id, CANON_OWNER_PHONE: id === FIRST ? firstPhone : '' });
    delete childEnv.DON_HOST_KEY; // a Don has no business with the host's key
    const child = spawn(process.execPath, [main], { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    entry.child = child; entry.startedAt = now(); entry.timer = null;
    running.set(id, entry);
    const tag = '[don ' + id + '] ';
    for (const stream of [child.stdout, child.stderr]) {
      let rest = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => { const lines = (rest + chunk).split('\n'); rest = lines.pop(); for (const l of lines) if (l.trim()) log(tag + l); });
    }
    child.on('exit', (code, signal) => {
      entry.child = null;
      if (stopping || !running.has(id)) return;
      if (statusOf(notesOf(id)) === 'stopped') { log(tag + 'Canon has stopped him. He stays down.'); return; }
      entry.fails = now() - entry.startedAt > 10 * 60e3 ? 1 : entry.fails + 1;
      const wait = Math.min(5 * 60e3, 5000 * 2 ** (entry.fails - 1));
      log(tag + 'Stopped (' + (signal || code) + '). Starting him again in ' + Math.round(wait / 1000) + ' s.');
      entry.timer = setTimeout(() => start(id), wait);
    });
  }
  function stop(id) {
    const entry = running.get(id);
    running.delete(id);
    if (!entry) return Promise.resolve();
    clearTimeout(entry.timer);
    if (!entry.child) return Promise.resolve();
    return new Promise((done) => {
      const kill = setTimeout(() => entry.child && entry.child.kill('SIGKILL'), 9000);
      entry.child.once('exit', () => { clearTimeout(kill); done(); });
      entry.child.kill('SIGTERM');
    });
  }
  async function remove(id) {
    await stop(id);
    registry.dons = registry.dons.filter((d) => d.id !== id);
    save();
    rmSync(dirOf(id), { recursive: true, force: true });
  }
  // Requests nobody approved, and Dons Canon stopped, make room after a week.
  async function tidy() {
    for (const d of registry.dons.slice()) {
      const status = statusOf(notesOf(d.id)); // none: his notes are gone, so he cannot run anyway
      if (status === 'none' || ((status === 'asked' || status === 'declined' || status === 'stopped') && now() - d.created > STALE_MS)) {
        log('[don ' + d.id + '] Never approved. Letting him go.');
        await remove(d.id);
      }
    }
  }

  // ---------------------------------------------------------------- who looks after which pet
  function donFor(hash) {
    for (const id of ids()) {
      const notes = notesOf(id);
      const key = notes && normalizeKey(notes.key);
      if (key && same(hashKey(key), hash)) return { id, notes };
    }
    return null;
  }
  function numberTaken(phone) {
    const mine = numberHash(phone);
    if (firstPhone && normalizePhone(firstPhone) === phone) return true;
    return registry.dons.some((d) => d.number === mine && statusOf(notesOf(d.id)) !== 'declined' && statusOf(notesOf(d.id)) !== 'stopped');
  }

  async function ask(key, phone) {
    const found = donFor(hashKey(key));
    if (found) {
      const status = statusOf(found.notes);
      if (found.id === FIRST || (status !== 'declined' && status !== 'stopped')) return { http: 200, status };
    }
    if (numberTaken(phone)) return { http: 409, status: 'number-taken' };
    const counted = registry.dons.filter((d) => { const st = statusOf(notesOf(d.id)); return st !== 'declined' && st !== 'stopped'; });
    if (counted.length >= max) return { http: 503, status: 'full' };
    if (found) await remove(found.id); // asked again after a no: start afresh
    const id = randomBytes(6).toString('hex');
    const dir = dirOf(id);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    // He starts knowing whose pet he looks after; the number is his until Canon approves him.
    fileStore(join(dir, 'don.json')).set({ key, ownerPhone: phone, phase: 'asking' });
    registry.dons.push({ id, number: numberHash(phone), created: now() });
    save();
    log('[don ' + id + '] A keeper asked for him.');
    start(id);
    return { http: 201, status: 'asked' };
  }

  // ---------------------------------------------------------------- the door for the game's server
  async function handle(req, res) {
    const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    const url = new URL(req.url, 'http://host');
    if (url.pathname === '/healthz') return reply(200, { ok: true });
    const given = req.headers['x-don-host-key'];
    if (!hostKey || typeof given !== 'string' || !same(given, hostKey)) return reply(401, { error: 'no' });
    const byHash = /^\/dons\/([0-9a-f]{64})$/.exec(url.pathname);
    if (req.method === 'GET' && byHash) {
      const found = donFor(byHash[1]);
      return reply(200, { status: found ? statusOf(found.notes) : 'none' });
    }
    if (req.method === 'POST' && url.pathname === '/dons') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 2048) return reply(413, { error: 'too large' }); }
      let input = null;
      try { input = JSON.parse(body); } catch { /* not JSON */ }
      const key = input && normalizeKey(input.key), phone = input && normalizePhone(input.phone);
      if (!key || !phone) return reply(400, { error: 'key and phone' });
      const out = await ask(key, phone);
      return reply(out.http, { status: out.status });
    }
    return reply(404, { error: 'not found' });
  }

  let server = null, tidyTimer = null;
  return {
    async start(port) {
      for (const id of ids()) start(id);
      await tidy();
      tidyTimer = setInterval(() => { tidy().catch((e) => log('Tidying failed: ' + e.message)); }, 3600e3);
      tidyTimer.unref();
      server = createServer((req, res) => { handle(req, res).catch((e) => { log('Request failed: ' + e.message); if (!res.headersSent) { res.writeHead(500); res.end(); } }); });
      const listen = (address) => new Promise((done, fail) => {
        server.once('error', fail);
        server.listen(port, address, () => { server.off('error', fail); done(); });
      });
      // Railway's private network is IPv6; '::' takes IPv4 too. Where IPv6 is off, IPv4 alone.
      try { await listen('::'); } catch (e) { if (e.code !== 'EAFNOSUPPORT' && e.code !== 'EADDRNOTAVAIL') throw e; await listen('0.0.0.0'); }
      return server.address().port;
    },
    async stop() {
      stopping = true;
      clearInterval(tidyTimer);
      if (server) server.close();
      await Promise.all([...running.keys()].map(stop));
    },
    status: (hash) => { const f = donFor(hash); return f ? statusOf(f.notes) : 'none'; },
    running: () => [...running.entries()].filter(([, e]) => e.child).map(([id]) => id),
    ask,
    tidy,
  };
}

// ---------------------------------------------------------------- run as the service
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = process.env;
  const phone = (env.CANON_OWNER_PHONE || '').trim();
  const hush = (text) => (phone ? String(text).split(phone).join('[owner phone]') : String(text));
  const log = (line) => console.log(new Date().toISOString() + ' ' + hush(line));
  const host = createHost({
    data: resolve(env.DON_DATA_DIR || '/data'),
    main: fileURLToPath(new URL('./main.mjs', import.meta.url)),
    hostKey: env.DON_HOST_KEY || '',
    max: /^\d+$/.test(String(env.DON_MAX ?? '')) ? Number(env.DON_MAX) : 20,
    firstPhone: phone,
    log,
  });
  if (!env.DON_HOST_KEY) log('DON_HOST_KEY is not set: the Dons run, but no new ones can be asked for.');
  const port = await host.start(Number(env.DON_HOST_PORT) || 8080);
  log('Hosting Dons. Listening for the game on port ' + port + '.');
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { log('Stopping every Don.'); host.stop().finally(() => process.exit(0)); });
}
