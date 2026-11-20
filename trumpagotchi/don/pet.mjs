// Don reaches his pet the way any of the keeper's devices does: through the game's cloud-save
// API, holding the keeper code. He has no other door into the game and none into its database.

/**
 * @param {object} o
 * @param {string} o.baseUrl     where the game is served, e.g. https://example.com/trumpagotchi/
 * @param {string} [o.proxyKey]  the game server's shared key: lets it count this Don as one caller
 * @param {string} [o.caller]    a name for this Don in the server's rate limits
 * @param {function} [o.fetch]
 */
export function petClient({ baseUrl, proxyKey = '', caller = 'don', fetch = globalThis.fetch }) {
  const api = new URL('api/', baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  async function call(method, path, key, body) {
    const headers = { authorization: 'Bearer ' + key };
    if (proxyKey) { headers['x-tg-proxy-key'] = proxyKey; headers['x-tg-client-ip'] = caller; }
    if (body) headers['content-type'] = 'application/json';
    let res;
    try { res = await fetch(new URL(path, api), { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) }); }
    catch { return { status: 'offline' }; }
    let data = null;
    try { data = await res.json(); } catch { /* an empty or odd body */ }
    return { http: res.status, data };
  }
  const shaped = (d) => ({ rev: d.rev, state: d.state, updatedAt: d.updatedAt });
  return {
    /** → { status: 'ok', rev, state, updatedAt } | { status: 'gone' | 'busy' | 'offline' } */
    async get(key) {
      const r = await call('GET', 'pet', key);
      if (r.status) return r;
      if (r.http === 200 && r.data && r.data.state) return Object.assign({ status: 'ok' }, shaped(r.data));
      return { status: r.http === 401 ? 'gone' : 'busy' };
    },
    /** → { status: 'ok', rev } | { status: 'conflict', rev, state, updatedAt } | { status: 'gone' | 'busy' | 'offline' } */
    async put(key, baseRev, state) {
      const r = await call('PUT', 'pet', key, { baseRev, state });
      if (r.status) return r;
      if (r.http === 200 && r.data) return { status: 'ok', rev: r.data.rev };
      if (r.http === 409 && r.data && r.data.state) return Object.assign({ status: 'conflict' }, shaped(r.data));
      return { status: r.http === 401 ? 'gone' : 'busy' };
    },
  };
}
