// Cloud saves: a pet can be kept on the server so it follows its keeper between devices.
// There are no accounts. Turning it on mints a random "keeper code"; whoever holds the code
// can load and save that pet. Only a hash of the code is ever stored.
// This file is plain request handling; where pets are kept is the store's business.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O or U
export const KEY_LENGTH = 20;                          // 20 symbols of 5 bits: 100 bits
export const MAX_BODY = 64 * 1024;
export const MAX_STATE = 48 * 1024;

export function newKey() {
  let key = '';
  for (const byte of randomBytes(KEY_LENGTH)) key += ALPHABET[byte & 31];
  return key;
}
// People type codes by hand: ignore case, spaces and dashes, and forgive O for 0 and I or L for 1.
export function normalizeKey(input) {
  const key = String(input == null ? '' : input).toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (key.length !== KEY_LENGTH) return null;
  for (const ch of key) if (!ALPHABET.includes(ch)) return null;
  return key;
}
export const hashKey = (key) => createHash('sha256').update('trumpagotchi:' + key).digest('hex');

function sameSecret(a, b) {
  const x = createHash('sha256').update(String(a)).digest(), y = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x, y);
}

// A fixed-window counter. Small and in memory: limits are per server process.
export function limiter(max, windowMs, now = Date.now) {
  const hits = new Map();
  return {
    take(id) {
      const t = now();
      let h = hits.get(id);
      if (!h || t >= h.reset) { h = { n: 0, reset: t + windowMs }; hits.set(id, h); }
      h.n++;
      return h.n <= max ? null : Math.max(1, Math.ceil((h.reset - t) / 1000)); // seconds to wait, or null when allowed
    },
    sweep() { const t = now(); for (const [id, h] of hits) if (t >= h.reset) hits.delete(id); },
    size() { return hits.size; },
  };
}

class HttpError extends Error {
  constructor(status, message, headers) { super(message); this.status = status; this.headers = headers; }
}

export function validState(state) {
  return !!state && typeof state === 'object' && !Array.isArray(state) && state.v === 1 &&
    !!state.needs && typeof state.needs === 'object' && typeof state.xp === 'number' && Number.isFinite(state.xp);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'That is too large.');
    chunks.push(chunk);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'That is not valid JSON.'); }
}

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', // a save must never sit in a cache between the keeper and the server
    'x-content-type-options': 'nosniff',
  }, headers));
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

/**
 * @param {object} o
 * @param {object|null} o.store        where pets are kept; null when cloud saves are not set up
 * @param {string} [o.proxyKey]        shared with a trusted reverse proxy, which may then report the visitor's address
 * @param {string} [o.ipHeader]        a header a trusted edge sets to the visitor's address (Railway: x-real-ip)
 * @param {function} [o.now]
 * @param {object} [o.limits]
 */
export function createApi({ store, proxyKey = '', ipHeader = '', now = Date.now, limits = {} }) {
  const L = Object.assign({ requests: 240, creates: 10, createsEverywhere: 600, badKeys: 20, writes: 30 }, limits);
  const perIp = limiter(L.requests, 60e3, now);            // everything, per visitor, per minute
  const creates = limiter(L.creates, 3600e3, now);          // new pets, per visitor, per hour
  const createsAll = limiter(L.createsEverywhere, 3600e3, now); // new pets, everyone together, per hour
  const badKeys = limiter(L.badKeys, 600e3, now);           // wrong codes, per visitor, per ten minutes
  const writes = limiter(L.writes, 60e3, now);              // saves, per pet, per minute
  const all = [perIp, creates, createsAll, badKeys, writes];

  function visitor(req) {
    const key = req.headers['x-tg-proxy-key'];
    if (proxyKey && typeof key === 'string' && sameSecret(key, proxyKey)) {
      const ip = String(req.headers['x-tg-client-ip'] || '').slice(0, 64);
      if (ip) return ip;
    }
    const fromEdge = ipHeader ? String(req.headers[ipHeader] || '').split(',')[0].trim().slice(0, 64) : '';
    return fromEdge || req.socket.remoteAddress || 'unknown';
  }
  function limit(counter, id) {
    const wait = counter.take(id);
    if (wait) throw new HttpError(429, 'Slow down. Try again shortly.', { 'retry-after': String(wait) });
  }
  // The keeper's code arrives as a bearer token. A wrong one counts against the visitor.
  async function keeper(req, ip) {
    const m = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
    const key = m ? normalizeKey(m[1]) : null;
    const hash = key ? hashKey(key) : null;
    const pet = hash ? await store.get(hash) : null;
    if (!pet) { limit(badKeys, ip); throw new HttpError(401, 'That keeper code is not recognised.'); }
    return { hash, pet };
  }
  function stateFrom(body) {
    const state = body && body.state;
    if (!validState(state)) throw new HttpError(400, 'That is not a Trumpagotchi save.');
    if (JSON.stringify(state).length > MAX_STATE) throw new HttpError(413, 'That save is too large.');
    return state;
  }
  const shape = (pet) => ({ rev: pet.rev, state: pet.state, updatedAt: new Date(pet.updatedAt).toISOString() });

  // Returns true when the request was for the API (and has been answered).
  async function api(req, res, pathname) {
    const at = pathname.indexOf('/api/');
    if (at !== 0) return false;
    const route = req.method + ' ' + pathname.slice(4);
    try {
      if (route === 'GET /status' || route === 'HEAD /status') { send(res, 200, req.method === 'HEAD' ? undefined : { sync: !!store }); return true; }
      if (!store) throw new HttpError(503, 'Cloud saves are not set up on this copy.');
      const ip = visitor(req);
      limit(perIp, ip);
      switch (route) {
        case 'POST /pets': {
          const state = stateFrom(await readJson(req));
          limit(creates, ip); limit(createsAll, 'all');
          const key = newKey();
          const made = await store.create(hashKey(key), state);
          if (!made) throw new HttpError(503, 'The cloud is full right now. He is still safe on this device.');
          send(res, 201, { key, rev: made.rev });
          return true;
        }
        case 'GET /pet': { const { pet } = await keeper(req, ip); send(res, 200, shape(pet)); return true; }
        case 'PUT /pet': {
          const { hash } = await keeper(req, ip);
          const body = await readJson(req);
          const state = stateFrom(body);
          if (!Number.isInteger(body.baseRev)) throw new HttpError(400, 'baseRev is required.');
          limit(writes, hash);
          const out = await store.put(hash, body.baseRev, state);
          if (!out) throw new HttpError(401, 'That keeper code is not recognised.');
          if (out.ok) send(res, 200, { rev: out.rev });
          else send(res, 409, shape(out)); // someone else saved first: here is theirs
          return true;
        }
        case 'POST /pet/key': { // a new code: every other device is locked out
          const { hash } = await keeper(req, ip);
          limit(writes, hash);
          const key = newKey();
          if (!(await store.rotate(hash, hashKey(key)))) throw new HttpError(401, 'That keeper code is not recognised.');
          send(res, 200, { key });
          return true;
        }
        case 'DELETE /pet': { const { hash } = await keeper(req, ip); await store.remove(hash); send(res, 204); return true; }
        default: {
          const known = ['/pets', '/pet', '/pet/key', '/status'].includes(pathname.slice(4));
          throw new HttpError(known ? 405 : 404, known ? 'Method not allowed.' : 'Not found.');
        }
      }
    } catch (e) {
      if (e instanceof HttpError) send(res, e.status, { error: e.message }, e.headers);
      else { console.error('Cloud save error:', e && e.message); send(res, 503, { error: 'The cloud is having a moment. He is still safe on this device.' }); }
      // An oversized upload is cut off rather than read to the end; anything else is drained
      // so the connection can be reused.
      if (e instanceof HttpError && e.status === 413) res.once('finish', () => req.destroy());
      else if (!req.complete) req.resume();
      return true;
    }
  }
  api.sweep = () => { for (const c of all) c.sweep(); };
  return api;
}
