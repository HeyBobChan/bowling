/* Trumpagotchi — the three things he does for fun. Golf and the rally take over the
   pixel screen; the deal is pure negotiation and lives in the control sheet. */
(function (root) {
  'use strict';
  const TG = (root.TG = root.TG || {});
  const A = TG.art, G = TG.game, C = TG.content;
  const M = (TG.minigames = {});
  const R = A.R;

  // ---------------------------------------------------------------- golf
  const TEE = 46, RANGE = 104;
  function Golf(look, tier) {
    this.look = Object.assign({}, look, { suit: '#f1eee4', tie: '#f1eee4', tieLen: 3, cap: true, crown: false, pin: false });
    this.tier = tier;
    this.hole = 0; this.holed = 0; this.marks = [];
    this.next();
  }
  Golf.HOLES = 3;
  Golf.prototype.next = function () {
    this.hole++;
    this.holeX = 88 + Math.floor(G.rng() * 54);
    this.ballX = TEE; this.t = 0; this.phase = 'aim'; this.power = 0; this.msg = ''; this.sunk = false;
    this.speed = 0.55 + this.hole * 0.2;
  };
  Golf.prototype.need = function () { return (this.holeX - TEE) / RANGE; };
  Golf.prototype.swing = function () {
    if (this.phase !== 'aim') return false;
    this.target = TEE + this.power * RANGE;
    this.phase = 'roll'; this.t = 0;
    return true;
  };
  Golf.prototype.update = function (dt) {
    this.t += dt / 1000;
    if (this.phase === 'aim') {
      this.power = 0.5 - 0.5 * Math.cos(this.t * this.speed * Math.PI * 2);
    } else if (this.phase === 'roll') {
      const k = Math.min(1, this.t / 0.9), e = 1 - Math.pow(1 - k, 3);
      this.ballX = TEE + (this.target - TEE) * e;
      if (k >= 1) {
        const d = this.target - this.holeX;
        if (Math.abs(d) <= 3) { this.sunk = true; this.holed++; this.msg = 'IN THE HOLE!'; this.marks.push('in'); }
        else if (Math.abs(d) <= 9 && this.tier >= 2) { this.sunk = true; this.holed++; this.msg = 'HE TOOK A GIMME'; this.marks.push('gimme'); }
        else { this.msg = d < 0 ? 'SHORT!' : 'LONG!'; this.marks.push('miss'); }
        this.phase = 'result'; this.t = 0;
        return this.sunk ? 'sunk' : 'miss';
      }
    } else if (this.phase === 'result' && this.t > 1.4) {
      if (this.hole >= Golf.HOLES) { this.phase = 'done'; return 'done'; }
      this.next();
      return 'next';
    }
    return null;
  };
  Golf.prototype.draw = function (g, f) {
    for (let i = 0; i < 6; i++) R(g, 0, i * 12, 160, 13, A.mix('#5fb0ee', '#c9e9ff', i / 5));
    R(g, 20, 14, 16, 3, '#ffffff'); R(g, 24, 11, 9, 3, '#ffffff'); R(g, 112, 22, 20, 3, '#ffffff'); R(g, 117, 19, 10, 3, '#ffffff');
    A.ellipse(g, 40, 82, 60, 16, '#5aa84f'); A.ellipse(g, 130, 84, 55, 14, '#4f9c4a');
    R(g, 0, 78, 160, 42, '#3f9a45');
    for (let y = 80; y < 120; y += 5) for (let x = (y % 10 ? 3 : 8); x < 160; x += 11) R(g, x, y, 2, 1, '#57b257');
    R(g, 0, 100, 160, 9, '#62bd5a'); R(g, 0, 100, 160, 1, '#7fd26f');
    // clubhouse, gold, far away
    R(g, 126, 62, 26, 16, '#f6efd8'); R(g, 124, 58, 30, 4, A.GOLD); R(g, 136, 68, 6, 10, '#6e4322'); R(g, 129, 66, 4, 4, '#7ad1ff'); R(g, 145, 66, 4, 4, '#7ad1ff');
    // hole and flag
    const hx = this.holeX;
    A.ellipse(g, hx, 105, 4, 1, '#1b1524');
    const wig = this.sunk && f % 4 < 2 ? 1 : 0;
    R(g, hx, 78, 1, 27, '#f4f1e6'); R(g, hx + 1, 78 + wig, 8, 5, '#d0182e'); R(g, hx + 1, 83 + wig, 5, 1, '#a01224');
    // the meter
    R(g, 28, 6, 104, 9, '#1b1524'); R(g, 30, 8, 100, 5, '#2b3a66');
    const nx = 30 + Math.round(this.need() * 100);
    R(g, nx - 3, 8, 7, 5, '#3fa34a'); R(g, nx, 8, 1, 5, '#b9f2a6');
    if (this.phase === 'aim') R(g, 30 + Math.round(this.power * 99), 6, 2, 9, '#fff3b0');
    else R(g, 30 + Math.round(((this.target - TEE) / RANGE) * 99), 6, 2, 9, this.sunk ? '#b9f2a6' : '#ff8f8f');
    A.text(g, 'HOLE ' + this.hole + '/' + Golf.HOLES, 30, 17, '#1b1524');
    for (let i = 0; i < this.marks.length; i++) R(g, 122 + i * 4 - 8, 17, 3, 5, this.marks[i] === 'miss' ? '#d0182e' : '#2f8a3a');
    // him
    const anim = this.phase === 'aim' ? 'swing' : this.phase === 'roll' ? 'thumbs' : this.sunk ? 'dance' : this.tier >= 3 ? 'point' : 'sad';
    const pose = A.pose(anim, f, {});
    A.drawDon(g, 28, 104, this.look, pose, { face: 1 });
    if (this.phase === 'aim') { const sw = Math.round(this.power * 6); for (let i = 0; i < 12; i++) R(g, 33 + Math.round((i * (4 - sw)) / 6), 90 + i, 1, 1, '#c7ccd6'); R(g, 34 + Math.round(((4 - sw) * 11) / 6), 101, 4, 2, '#9aa1ab'); }
    // ball
    if (!(this.sunk && this.phase === 'result')) { R(g, Math.round(this.ballX) - 1, 103, 3, 2, '#ffffff'); R(g, Math.round(this.ballX) - 1, 105, 3, 1, 'rgba(0,0,0,0.25)'); }
    if (this.msg && this.phase === 'result') {
      const w = A.textW(this.msg, 2);
      R(g, 80 - w / 2 - 4, 34, w + 8, 16, '#1b1524'); A.textC(g, this.msg, 80, 37, this.sunk ? '#f7dc7a' : '#ff8f8f', 2);
    }
  };
  M.Golf = Golf;

  // ---------------------------------------------------------------- rally
  const SEATS = [];
  (function () { // a fixed, shuffled set of places for the crowd to appear
    let seed = 7;
    const rnd = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let y = 117; y >= 93; y -= 4) for (let x = 2 + (y % 8 ? 0 : 2); x < 158; x += 5) SEATS.push([x + Math.floor(rnd() * 2), y + Math.floor(rnd() * 2), rnd()]);
    for (let i = SEATS.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = SEATS[i]; SEATS[i] = SEATS[j]; SEATS[j] = t; }
  })();
  function Rally(look, tier) {
    this.look = Object.assign({}, look, { cap: !look.crown });
    this.tier = tier; this.phase = 'ready'; this.taps = 0; this.left = Rally.MS;
  }
  Rally.MS = 8000;
  Rally.prototype.tap = function () {
    if (this.phase === 'ready') this.phase = 'run';
    if (this.phase !== 'run') return false;
    this.taps++; return true;
  };
  Rally.prototype.update = function (dt) {
    if (this.phase !== 'run') return null;
    this.left -= dt;
    if (this.left <= 0) { this.left = 0; this.phase = 'done'; return 'done'; }
    return null;
  };
  Rally.prototype.draw = function (g, f) {
    R(g, 0, 0, 160, 120, '#101a3a');
    // the biggest flag anyone has ever seen
    for (let i = 0; i < 10; i++) R(g, 18, 8 + i * 6, 124, 6, i % 2 ? '#fbf7ee' : '#c8172c');
    R(g, 18, 8, 52, 30, '#22386b');
    for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) R(g, 23 + x * 8 + (y % 2 ? 4 : 0), 12 + y * 7, 2, 2, '#fbf7ee');
    R(g, 0, 68, 160, 6, A.GOLD); R(g, 0, 74, 160, 46, '#182449');
    // stage and podium
    R(g, 30, 84, 100, 10, '#5a3419'); R(g, 30, 84, 100, 2, '#8a5a30');
    const anim = this.phase === 'run' ? 'podium' : this.phase === 'done' ? 'dance' : 'idle';
    A.drawDon(g, 80, 88, this.look, A.pose(anim, f, { mood: 'happy' }), { face: 1, noShadow: true });
    R(g, 68, 66, 24, 24, '#6e4322'); R(g, 66, 64, 28, 3, '#8a5a30'); R(g, 74, 70, 12, 8, A.GOLD); A.text(g, '1', 79, 72, '#6e4322');
    R(g, 79, 58, 1, 6, '#9aa1ab'); R(g, 78, 56, 3, 3, '#2b2b33');
    // crowd
    const n = Math.min(SEATS.length, Math.round(this.taps * 3.2));
    const skins = ['#f2cfae', '#d9a47a', '#a8724a', '#f4c092', '#7a4e2b'];
    for (let i = 0; i < n; i++) {
      const s = SEATS[i], hop = this.phase !== 'ready' && (f + i) % 6 < 2 ? -1 : 0;
      R(g, s[0], s[1] + hop, 4, 4, skins[i % skins.length]);
      if (s[2] < 0.45) R(g, s[0], s[1] + hop - 1, 4, 2, '#d0182e'); else R(g, s[0], s[1] + hop - 1, 4, 1, ['#3a2a1a', '#d9b14c', '#1b1524'][i % 3]);
      if (s[2] > 0.9) { R(g, s[0] - 1, s[1] + hop - 8, 7, 5, '#fbf7ee'); R(g, s[0], s[1] + hop - 6, 5, 1, '#d0182e'); R(g, s[0] + 2, s[1] + hop - 3, 1, 3, '#8a5a30'); }
    }
    // timer and count
    R(g, 28, 2, 104, 5, '#1b1524'); R(g, 30, 3, Math.round((this.left / Rally.MS) * 100), 3, '#f7dc7a');
    if (this.phase === 'ready') { R(g, 34, 40, 92, 14, '#1b1524'); A.textC(g, 'CHEER TO START', 80, 45, '#f7dc7a'); }
    else { R(g, 2, 2, 24, 9, '#1b1524'); A.text(g, String(this.taps), 4, 4, '#f7dc7a'); }
  };
  M.Rally = Rally;

  // ---------------------------------------------------------------- the deal
  function Deal(s) {
    const pick = function (a) { return a[Math.floor(G.rng() * a.length)]; };
    this.buyer = pick(C.DEAL_BUYERS); this.item = pick(C.DEAL_ITEMS);
    this.offer = G.dealBase(s); this.first = this.offer;
    this.raises = 0;
    this.max = 3 + Math.floor(G.rng() * 3); this.patience = this.max;
    this.over = false; this.won = false;
  }
  Deal.prototype.demand = function () {
    if (this.over) return null;
    const r = G.rng();
    this.patience -= r < 0.18 ? 2 : r < 0.78 ? 1 : 0;
    this.raises++;
    if (this.patience <= 0) { this.patience = 0; this.over = true; this.won = false; return 'walk'; }
    this.offer *= 1.22 + G.rng() * 0.33;
    return 'raise';
  };
  Deal.prototype.take = function () { if (this.over) return; this.over = true; this.won = true; };
  M.Deal = Deal;
})(typeof window !== 'undefined' ? window : globalThis);
