/* Trumpagotchi — cloud save. Entirely optional: the game is complete without it, and on a
   copy with no server behind it (a static host, the single file) this quietly stays off.
   There are no accounts. Turning it on gives the pet a secret "keeper code"; any device
   that has the code plays the same pet. */
(function (root) {
  'use strict';
  const TG = (root.TG = root.TG || {});
  const K = (TG.cloud = {});
  const LINK_KEY = 'trumpagotchi.cloud.v1'; // kept apart from the save, so a save code never carries the keeper code
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  K.KEY_LENGTH = 20;
  K.available = null; // null until the server has been asked

  // People type codes by hand: ignore case, spaces and dashes, forgive O for 0 and I or L for 1.
  K.normalizeKey = function (input) {
    const key = String(input == null ? '' : input).toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    if (key.length !== K.KEY_LENGTH) return null;
    for (let i = 0; i < key.length; i++) if (ALPHABET.indexOf(key[i]) < 0) return null;
    return key;
  };
  K.formatKey = function (key) { return String(key).replace(/(.{5})(?=.)/g, '$1-'); };

  let link = null; // { key, rev, dirty, syncedAt }
  let gen = 0;     // bumps on every change, so a save in flight cannot hide a newer change
  function read() {
    try {
      const v = JSON.parse(root.localStorage.getItem(LINK_KEY) || 'null');
      const key = v && K.normalizeKey(v.key);
      if (key) return { key: key, rev: Math.max(0, Math.floor(Number(v.rev)) || 0), dirty: !!v.dirty, syncedAt: Number(v.syncedAt) || 0 };
    } catch (e) { /* no storage: no link */ }
    return null;
  }
  function write() {
    try { if (link) root.localStorage.setItem(LINK_KEY, JSON.stringify(link)); else root.localStorage.removeItem(LINK_KEY); }
    catch (e) { /* the link then lasts only for this visit */ }
  }
  link = read();
  K.reload = function () { const stored = read(); if (stored || !link) link = stored; }; // another tab may have saved
  K.linked = function () { return !!link; };
  K.key = function () { return link ? link.key : null; };
  K.info = function () { return link ? { rev: link.rev, dirty: link.dirty, syncedAt: link.syncedAt } : null; };
  K.markDirty = function () { gen++; if (link && !link.dirty) { link.dirty = true; write(); } };

  async function call(method, path, o) {
    o = o || {};
    const headers = {};
    if (o.body !== undefined) headers['content-type'] = 'application/json';
    if (o.key) headers.authorization = 'Bearer ' + o.key;
    let res;
    try {
      res = await fetch('api/' + path, { method: method, headers: headers, body: o.body === undefined ? undefined : JSON.stringify(o.body), cache: 'no-store', credentials: 'omit', keepalive: !!o.keepalive });
    } catch (e) { return { status: 0, data: null }; }
    let data = null;
    try { if ((res.headers.get('content-type') || '').indexOf('json') >= 0) data = await res.json(); } catch (e) { /* not JSON: treat as no answer */ }
    return { status: res.status, data: data };
  }
  const outcome = function (status) { return status === 401 ? 'gone' : status === 429 ? 'busy' : 'offline'; };

  K.check = async function () {
    const r = await call('GET', 'status');
    K.available = r.status === 200 && !!(r.data && r.data.sync);
    return K.available;
  };
  // Turn cloud save on for this pet. The server answers with a brand-new keeper code.
  K.enable = async function (state) {
    const r = await call('POST', 'pets', { body: { state: state } });
    const key = r.status === 201 && r.data && K.normalizeKey(r.data.key);
    if (!key) return { ok: false, status: outcome(r.status) };
    link = { key: key, rev: r.data.rev, dirty: false, syncedAt: Date.now() };
    write();
    return { ok: true, key: key };
  };
  // Look at the pet behind a code without linking to it yet.
  K.peek = async function (key) {
    const r = await call('GET', 'pet', { key: key });
    if (r.status === 200 && r.data && r.data.state) return { ok: true, rev: r.data.rev, state: r.data.state, updatedAt: r.data.updatedAt };
    return { ok: false, status: outcome(r.status) };
  };
  K.join = function (key, rev) { link = { key: key, rev: rev, dirty: false, syncedAt: Date.now() }; write(); };
  // The device now holds exactly what the server holds at `rev`.
  K.accept = function (rev) { if (!link) return; link.rev = rev; link.dirty = false; link.syncedAt = Date.now(); write(); };

  K.pull = async function () {
    if (!link) return { status: 'off' };
    const r = await call('GET', 'pet', { key: link.key });
    if (r.status !== 200 || !r.data) return { status: outcome(r.status) };
    if (!link) return { status: 'off' };
    if (r.data.rev === link.rev) { link.syncedAt = Date.now(); write(); return { status: 'same' }; }
    return { status: 'newer', rev: r.data.rev, state: r.data.state, updatedAt: r.data.updatedAt };
  };
  K.push = async function (state, o) {
    if (!link) return { status: 'off' };
    o = o || {};
    const sent = gen;
    const r = await call('PUT', 'pet', { key: link.key, body: { baseRev: o.baseRev != null ? o.baseRev : link.rev, state: state }, keepalive: o.keepalive });
    if (!link) return { status: 'off' };
    if (r.status === 200 && r.data) {
      link.rev = r.data.rev; link.dirty = gen !== sent; link.syncedAt = Date.now(); write();
      return { status: 'ok' };
    }
    if (r.status === 409 && r.data) return { status: 'conflict', rev: r.data.rev, state: r.data.state, updatedAt: r.data.updatedAt };
    return { status: outcome(r.status) };
  };
  // A new code: every other device is locked out until it is given the new one.
  K.rotate = async function () {
    if (!link) return { ok: false, status: 'off' };
    const r = await call('POST', 'pet/key', { key: link.key });
    const key = r.status === 200 && r.data && K.normalizeKey(r.data.key);
    if (!key) return { ok: false, status: outcome(r.status) };
    link.key = key; write();
    return { ok: true, key: key };
  };
  K.unlink = function () { link = null; write(); };
  K.remove = async function () {
    if (!link) return { ok: false, status: 'off' };
    const r = await call('DELETE', 'pet', { key: link.key });
    if (r.status !== 204 && r.status !== 401) return { ok: false, status: outcome(r.status) };
    link = null; write();
    return { ok: true };
  };

  // A link that carries the code in the part of the address browsers never send to servers.
  K.shareLink = function () { return link ? root.location.origin + root.location.pathname + '#link=' + K.formatKey(link.key) : ''; };
  K.takeLinkFromUrl = function () {
    const m = /[#&]link=([^&]+)/.exec(root.location.hash || '');
    if (!m) return null;
    try { root.history.replaceState(null, '', root.location.pathname + root.location.search); } catch (e) { /* the code stays in the bar */ }
    let raw = m[1];
    try { raw = decodeURIComponent(raw); } catch (e) { /* use it as typed */ }
    return K.normalizeKey(raw);
  };
})(typeof window !== 'undefined' ? window : globalThis);
