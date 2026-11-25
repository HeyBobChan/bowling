/* Trumpagotchi — pixel art, drawn in code. One 160x120 screen, everything in fillRects.
   The pet is parametric: hair height, hair colour, glow and tie length all slide with level,
   and past level 50 so does what he is: a gold man, a building, a planet, everything. */
(function (root) {
  'use strict';
  const TG = (root.TG = root.TG || {});
  const A = (TG.art = {});
  A.W = 160; A.H = 120;
  A.FLOOR = 108; // where his feet go

  // ---------------------------------------------------------------- colour
  function rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hex(r, g, b) { return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1); }
  function mix(a, b, t) {
    const x = rgb(a), y = rgb(b);
    return hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
  }
  function shade(c, k) { return k < 0 ? mix(c, '#000000', -k) : mix(c, '#ffffff', k); }
  function ramp(stops, t) { // stops: [[t, colour], ...]
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i];
        return mix(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
      }
    }
    return stops[stops.length - 1][1];
  }
  A.mix = mix; A.shade = shade;

  const INK = '#1b1524', GOLD = '#e0b43c', GOLD_L = '#f7dc7a', GOLD_D = '#a87a1e';
  const RED = '#d0182e', NAVY = '#1c2a4f', WHITE = '#fbf7ee';
  A.GOLD = GOLD;

  function R(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }
  A.R = R;
  function ellipse(g, cx, cy, rx, ry, c) {
    g.fillStyle = c;
    for (let y = -ry; y <= ry; y++) {
      const w = Math.round(rx * Math.sqrt(1 - (y * y) / (ry * ry + 0.01)));
      if (w > 0) g.fillRect(cx - w, cy + y, w * 2, 1);
    }
  }
  A.ellipse = ellipse;

  // ---------------------------------------------------------------- 3x5 pixel font
  const FONT = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
    F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
    K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
    P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
    Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
    4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
    9: '111101111001110', '!': '010010010000010', '.': '000000000000010', ',': '000000000010100', "'": '010010000000000',
    '-': '000000111000000', ':': '000010000010000', '%': '101001010100101', '?': '110001010000010', '+': '000010111010000',
    '$': '011110010011110', '/': '001001010100100',
  };
  A.text = function (g, str, x, y, c, scale) {
    scale = scale || 1;
    g.fillStyle = c;
    str = String(str).toUpperCase();
    for (let i = 0; i < str.length; i++) {
      const gl = FONT[str[i]];
      if (gl) for (let k = 0; k < 15; k++) if (gl[k] === '1') g.fillRect(x + (i * 4 + (k % 3)) * scale, y + Math.floor(k / 3) * scale, scale, scale);
    }
  };
  A.textW = function (str, scale) { return (String(str).length * 4 - 1) * (scale || 1); };
  A.textC = function (g, str, cx, y, c, scale) { A.text(g, str, Math.round(cx - A.textW(str, scale) / 2), y, c, scale); };

  // ---------------------------------------------------------------- how he looks at a given level
  // Up to level 50 he is the same man, more so. Past it (see C.STAGES) he is plated in gold,
  // his hair outgrows him, his tie leaves the room, and then he stops being a man: `form`
  // says what he is. Neglected (humble), he is only a man again, at any level.
  // o.person: draw him as a man whatever he has become (he turns up to the minigames in person).
  A.look = function (level, o) {
    o = o || {};
    const t = Math.max(0, Math.min(1, (level - 1) / 46));
    let vol = 0.06 + 0.94 * t;
    let skinT = t + (o.bronze ? 0.18 : 0);
    if (o.humble) { vol *= 0.3; skinT *= 0.45; }
    if (o.wilt) vol *= 0.65; // glow is low: the hair sags
    const beyond = level > 50 && !o.humble;
    const span = function (a, b) { return beyond ? Math.max(0, Math.min(1, (level - a) / (b - a))) : 0; };
    const plate = span(50, 55);                                                    // orange turning to gold
    let mane = span(55, 62) * 0.4 + span(62, 70) * 0.25 + span(70, 77) * 0.35;      // the hair outgrowing him
    if (o.person) mane = Math.min(mane, 0.4);
    if (o.wilt) mane *= 0.8;
    const form = !beyond || o.person ? 'man' : level >= 100 ? 'all' : level >= 93 ? 'planet' : level >= 86 ? 'tower' : 'man';
    let hair = ramp([[0, '#6a4a2e'], [0.22, '#a07a3a'], [0.5, '#dcb14c'], [0.8, '#f6d055'], [1, '#ffe07a']], t);
    let skin = ramp([[0, '#f2cfae'], [0.3, '#f4c092'], [0.6, '#f3a868'], [1, '#f18d3c'], [1.3, '#ee7a22']], skinT);
    let suit = level < 8 ? '#7b8494' : level < 14 ? mix('#7b8494', NAVY, (level - 7) / 6) : NAVY;
    if (plate > 0) { skin = mix(skin, o.bronze ? '#e9a528' : '#efb83c', plate); suit = mix(suit, '#9a6d16', plate); hair = mix(hair, '#ffdf52', plate * 0.8); }
    return {
      level: level, t: t, vol: vol, hair: hair, skin: skin, suit: suit,
      tie: o.tie || (level < 5 ? '#6b7fa8' : RED),
      tieLen: level >= 50 ? 28 : 9 + Math.round(17 * t),
      ring: o.humble ? 0 : Math.max(0, (skinT - 0.45) * 1.8) * (1 - plate),
      squint: t > 0.35 && !o.humble,
      cap: level >= 32 && level < 45 && !o.humble,
      crown: level >= 50 && !o.humble,
      pin: level >= 32,
      term: o.term || 1,
      // past the presidency
      form: form, fixed: form !== 'man', plate: plate, mane: mane,
      hh: mane > 0 ? 7 + Math.round(mane * 37) : Math.round(1 + vol * 6),
      wide: Math.round(mane * 8), over: Math.round(4 + mane * 8), lean: Math.round(mane * 6),
      hairEyes: beyond && level >= 62,
      tieOut: o.person ? 0 : span(62, 70), tieWindow: beyond && level >= 70 && !o.person,
      windows: span(78, 86),
      H: 80 + Math.max(0, Math.min(6, level - 86)) * 2,   // the tower gains floors
      moons: Math.max(0, Math.min(6, level - 93)),          // the planet gains moons
    };
  };

  // ---------------------------------------------------------------- poses
  A.pose = function (anim, f, o) {
    o = o || {};
    const p = { f: f, bob: (f >> 3) & 1, blink: f % 46 < 2, mouth: 'pout', brows: 'flat', eyes: 'open', hl: [-15, -13], hr: [15, -13], leg: 0, flush: 0, sway: 0 };
    const mood = o.mood || 'ok';
    if (mood === 'happy') p.mouth = 'smile';
    if (mood === 'sad' || mood === 'humble') { p.brows = 'sad'; p.mouth = 'frown'; p.bob = (f >> 4) & 1; }
    if (mood === 'angry') { p.brows = 'angry'; p.mouth = 'frown'; p.flush = 0.6; }
    const a = f % 8 < 4;
    switch (anim) {
      case 'walk': p.leg = 1 + ((f >> 2) & 1); p.bob = (f >> 2) & 1; p.hl = [-15, -13 + (p.bob ? -1 : 1)]; p.hr = [15, -13 + (p.bob ? 1 : -1)]; break;
      case 'talk': { p.mouth = f % 6 < 3 ? 'open' : 'pout'; const k = f % 10 < 5 ? 0 : 4; p.hl = [-7 - k, -19]; p.hr = [7 + k, -19]; break; }
      case 'dance': p.mouth = 'smile'; p.eyes = 'happy'; p.brows = 'flat'; p.flush = 0; p.hl = [-11, a ? -25 : -19]; p.hr = [11, a ? -19 : -25]; p.bob = a ? 0 : 1; p.sway = a ? -1 : 1; break;
      case 'thumbs': p.mouth = 'smile'; p.brows = 'flat'; p.flush = 0; p.hr = [18, -31]; p.thumb = true; break;
      case 'point': p.mouth = f % 6 < 3 ? 'open' : 'frown'; p.brows = 'angry'; p.hr = [25, -25]; p.flush = 0.5; break;
      case 'angry': p.brows = 'angry'; p.mouth = 'frown'; p.flush = 0.9; p.hl = [-5, -17]; p.hr = [5, -18]; p.sway = f % 4 < 2 ? 0 : 1; break;
      case 'sad': p.brows = 'sad'; p.mouth = 'frown'; p.bob = (f >> 4) & 1; break;
      case 'no': p.mouth = 'flat'; p.sway = f % 6 < 3 ? -1 : 1; p.hl = [-10, -21]; p.hr = [10, -21]; break;
      case 'eat': p.mouth = f % 6 < 3 ? 'open' : 'flat'; p.brows = 'flat'; p.hr = [9, -29]; p.item = o.item; p.flush = 0; break;
      case 'yuck': p.mouth = 'frown'; p.brows = 'angry'; p.eyes = 'closed'; p.hr = [20, -24]; p.item = 'salad'; break;
      case 'groom': p.eyes = 'closed'; p.mouth = 'smile'; p.brows = 'flat'; p.hr = [15 + (a ? 0 : 2), -53]; p.item = o.item; p.flush = 0; break;
      case 'sign': p.mouth = 'smile'; p.brows = 'flat'; p.hl = [-10, -22]; p.hr = [10, -22]; p.folder = true; p.flush = 0; break;
      case 'sleep': p.eyes = 'closed'; p.mouth = 'flat'; p.brows = 'flat'; p.bob = 0; p.blink = false; p.flush = 0; p.hl = [-9, -14]; p.hr = [9, -14]; break;
      case 'swing': p.mouth = 'flat'; p.hl = [2, -14]; p.hr = [6, -14]; break;
      case 'podium': p.mouth = f % 6 < 3 ? 'open' : 'smile'; p.hl = [-18, a ? -30 : -26]; p.hr = [18, a ? -26 : -30]; break;
      default: break;
    }
    return p;
  };

  // ---------------------------------------------------------------- small items he holds
  A.item = function (g, id, x, y) {
    switch (id) {
      case 'hamberder':
        R(g, x - 4, y - 4, 8, 3, '#c98a3c'); R(g, x - 3, y - 5, 6, 1, '#d99b4a'); R(g, x - 5, y - 1, 10, 1, '#5fa83a');
        R(g, x - 4, y, 8, 2, '#5b3219'); R(g, x - 4, y + 2, 8, 1, '#f2c341'); R(g, x - 4, y + 3, 8, 2, '#c98a3c'); break;
      case 'coke':
        R(g, x - 2, y - 5, 5, 10, '#d9dde2'); R(g, x - 2, y - 2, 5, 3, RED); R(g, x - 2, y - 5, 5, 1, '#9aa1ab'); R(g, x + 2, y - 5, 1, 10, '#aeb4bd'); break;
      case 'tacobowl':
        R(g, x - 5, y - 1, 10, 4, '#d9a45a'); R(g, x - 4, y + 3, 8, 1, '#b98240'); R(g, x - 4, y - 3, 8, 2, '#6fb04a'); R(g, x - 2, y - 4, 2, 1, RED); R(g, x + 1, y - 3, 2, 1, '#f2c341'); break;
      case 'chicken':
        R(g, x - 4, y - 2, 8, 7, WHITE); R(g, x - 4, y - 2, 2, 7, RED); R(g, x, y - 2, 2, 7, RED); R(g, x - 5, y - 3, 10, 1, '#d7d2c6');
        R(g, x - 3, y - 6, 3, 3, '#c98a3c'); R(g, x + 1, y - 5, 3, 2, '#b9772c'); break;
      case 'steak':
        R(g, x - 6, y + 2, 12, 2, WHITE); R(g, x - 5, y - 2, 9, 4, '#4a2a1a'); R(g, x - 4, y - 3, 6, 1, '#4a2a1a'); R(g, x - 2, y - 2, 5, 2, RED); R(g, x + 3, y - 1, 2, 2, '#f1e3c8'); break;
      case 'cake':
        R(g, x - 5, y + 3, 10, 1, WHITE); R(g, x - 4, y - 3, 8, 6, '#4b2a17'); R(g, x - 4, y - 1, 8, 1, '#f1e3c8'); R(g, x - 4, y - 4, 8, 1, '#2f190d'); R(g, x - 1, y - 6, 2, 2, RED); break;
      case 'icecream':
        R(g, x - 2, y, 5, 2, '#d9a45a'); R(g, x - 1, y + 2, 3, 2, '#c98a3c'); R(g, x, y + 4, 1, 1, '#b9772c');
        R(g, x - 3, y - 3, 4, 3, '#f7c7d4'); R(g, x, y - 5, 4, 4, '#fff3d6'); break;
      case 'salad':
        R(g, x - 5, y, 10, 3, '#e8e4da'); R(g, x - 4, y + 3, 8, 1, '#c9c3b5'); R(g, x - 4, y - 3, 8, 3, '#57a53a'); R(g, x - 2, y - 4, 3, 1, '#7cc657'); R(g, x + 2, y - 2, 1, 1, RED); break;
      case 'comb':
        R(g, x - 5, y - 1, 10, 2, '#2b2b33'); for (let i = 0; i < 5; i++) R(g, x - 5 + i * 2, y + 1, 1, 3, '#2b2b33'); break;
      case 'spray':
        R(g, x - 2, y - 3, 5, 9, '#c7ccd6'); R(g, x - 2, y, 5, 3, GOLD); R(g, x - 1, y - 5, 3, 2, '#2b2b33'); R(g, x - 3, y - 5, 2, 1, '#2b2b33'); break;
      case 'bronzer':
        R(g, x - 4, y - 3, 8, 7, '#2b2b33'); R(g, x - 3, y - 2, 6, 5, '#e8842c'); R(g, x - 2, y - 1, 2, 1, '#f6a65a'); break;
      case 'club':
        R(g, x, y - 16, 1, 16, '#c7ccd6'); R(g, x, y, 4, 2, '#9aa1ab'); break;
      default: break;
    }
  };

  // ---------------------------------------------------------------- the pet
  const SW = 100, SH = 136, OX = 50, OY = 126;
  let spr = null, sil = null;
  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function arm(g, x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) R(g, x0 + ((x1 - x0) * i) / n - 2, y0 + ((y1 - y0) * i) / n - 2, 5, 5, c);
  }

  // His face, drawn where the man's face sits (eyes at y -43, mouth at y -36). The forms that
  // are not a man move and scale the canvas first, so it is the same face on a building and
  // on a planet. K: { skin, brow, dark, lip, ring, squint, plain } (plain: no nose, no tan lines).
  function face(g, p, K) {
    const skin = K.skin, skinD = shade(skin, -0.16);
    const fx = 1; // features sit a pixel toward the way he faces
    if (K.ring > 0.05) { const skinL = mix(skin, '#ffeede', Math.min(0.85, K.ring)); R(g, -10 + fx, -45, 7, 5, skinL); R(g, 4 + fx, -45, 7, 5, skinL); }
    if (p.flush) { const fl = mix(skin, '#e2331f', 0.45 * p.flush); R(g, -11 + fx, -39, 4, 2, fl); R(g, 7 + fx, -39, 4, 2, fl); }
    // brows
    const brow = K.brow;
    const lb = -9 + fx, rb = 5 + fx;
    if (p.brows === 'angry') { R(g, lb, -47, 2, 1, brow); R(g, lb + 2, -46, 3, 1, brow); R(g, rb, -46, 3, 1, brow); R(g, rb + 3, -47, 2, 1, brow); }
    else if (p.brows === 'sad') { R(g, lb, -46, 2, 1, brow); R(g, lb + 2, -47, 3, 1, brow); R(g, rb, -47, 3, 1, brow); R(g, rb + 3, -46, 2, 1, brow); }
    else { R(g, lb, -46, 5, 1, brow); R(g, rb, -46, 5, 1, brow); }
    // eyes
    const le = -8 + fx, re = 5 + fx;
    const eyes = p.blink && p.eyes === 'open' ? 'closed' : p.eyes;
    const line = K.line || INK;
    if (eyes === 'closed') { R(g, le, -42, 4, 1, line); R(g, re, -42, 4, 1, line); }
    else if (eyes === 'happy') { for (const e of [le, re]) { R(g, e, -42, 1, 1, line); R(g, e + 1, -43, 2, 1, line); R(g, e + 3, -42, 1, 1, line); } }
    else {
      const top = K.squint || p.brows === 'angry' ? -42 : -43, eh = K.squint || p.brows === 'angry' ? 1 : 2;
      for (const e of [le, re]) { R(g, e, top, 4, eh, '#ffffff'); R(g, e + 2, top, 2, eh, '#274a8a'); R(g, e + 2, top, 1, eh, INK); if (!K.plain) R(g, e, top - 1, 4, 1, skinD); }
    }
    if (!K.plain) { R(g, -1 + fx, -41, 2, 3, skinD); R(g, fx, -39, 2, 1, shade(skin, -0.26)); }
    // mouth
    const mx = fx, lip = K.lip || mix(skin, '#b8433a', 0.55), dark = K.dark || '#5a1818';
    switch (p.mouth) {
      case 'open': R(g, mx - 3, -37, 6, 4, dark); R(g, mx - 2, -37, 4, 1, '#ffffff'); R(g, mx - 1, -34, 2, 1, '#d8646b'); break;
      case 'smile': R(g, mx - 4, -36, 8, 1, dark); R(g, mx - 5, -37, 1, 1, dark); R(g, mx + 4, -37, 1, 1, dark); R(g, mx - 3, -35, 6, 1, '#ffffff'); break;
      case 'frown': R(g, mx - 3, -36, 6, 1, dark); R(g, mx - 4, -35, 1, 1, dark); R(g, mx + 3, -35, 1, 1, dark); break;
      case 'flat': R(g, mx - 3, -36, 6, 1, dark); break;
      default: R(g, mx - 2, -37, 4, 2, lip); R(g, mx - 1, -36, 2, 1, dark); if (!K.plain) { R(g, mx - 3, -36, 1, 1, shade(skin, -0.2)); R(g, mx + 2, -36, 1, 1, shade(skin, -0.2)); } break; // the pout
    }
  }

  // The hair once it has outgrown him: a mass that leans into its own swoop. From The Hair
  // on it has eyes of its own, which look about and do not blink when his do.
  function bigHair(g, L, p, hair, hairL, hairD) {
    const top = -52, hh = L.hh, wide = L.wide, over = L.over, f = p.f || 0;
    R(g, -14, top + 3, 2, 8, hair); R(g, 12, top + 3, 2, 4, hair); R(g, -16, top + 8, 2, 3, hair); R(g, -17, top + 10, 1, 2, hairD);
    const dome = Math.max(4, hh * 0.45);
    for (let y = top - hh; y < top + 4; y++) {
      const i = y - (top - hh); // 0 at the crest
      const r = Math.min(1, (i + 1) / dome);
      const half = Math.round((14 + wide) * Math.sqrt(1 - (1 - r) * (1 - r)));
      const lean = Math.round((1 - i / (hh + 4)) * L.lean);
      const tail = Math.round(over * Math.min(1, i / (hh * 0.6)));
      R(g, -half + lean, y, half * 2 + tail, 1, hair);
      if (i > 2 && i % 2 === 0) R(g, half + lean + tail - 1, y, 1, 1, hairD); // a ragged edge where the swoop ends
    }
    // the fringe over his forehead, and the curl at the end of the swoop
    R(g, -13, top + 4, 27 + over, 1, hair); R(g, 0, top + 5, 14 + over, 1, hair); R(g, 7, top + 6, 7 + over, 1, hairD);
    R(g, 13 + wide + over, top, 3, 5, hair); R(g, 14 + wide + over, top + 5, 2, 2, hairD);
    // light along the wave, shadow where it sits on his head
    const gap = Math.max(3, Math.round(hh / 6));
    for (let k = 0, y = top - hh + 2; y < top; k++, y += gap) {
      const x = -9 - wide + k * 3 + Math.round(L.lean * (1 - k / 6));
      R(g, x, y, 12 + wide + k, 1, hairL);
      if (y + 2 < top) { R(g, x + 7, y + 2, 9 + wide + k * 2, 1, hairD); R(g, x - 3, y + 1, 4, 1, hairL); }
    }
    R(g, -11, top - 1, 9, 1, hairD); R(g, -13 - wide + 2, top - 3, 5, 1, hairD);
    if (!L.hairEyes) return;
    const ey = top - Math.round(hh * 0.52), cx = Math.round(L.lean * 0.5);
    const gaze = [0, 1, 0, -1, 0, 0][Math.floor(f / 22) % 6];
    const shut = p.eyes === 'closed' || f % 61 < 2;
    for (const ex of [cx - 9, cx + 4]) {
      if (shut) { R(g, ex, ey + 2, 6, 1, INK); continue; }
      R(g, ex - 1, ey - 1, 8, 6, hairD); R(g, ex, ey, 6, 4, '#ffffff');
      R(g, ex + 2 + gaze, ey + 1, 3, 3, '#274a8a'); R(g, ex + 3 + gaze, ey + 1, 1, 2, INK); R(g, ex + 2 + gaze, ey + 1, 1, 1, '#ffffff');
    }
    // its brows say what it thinks of you
    const by = ey - 3, bl = cx - 9, br = cx + 4;
    if (p.brows === 'angry') { R(g, bl, by, 3, 1, hairD); R(g, bl + 3, by + 1, 3, 1, hairD); R(g, br, by + 1, 3, 1, hairD); R(g, br + 3, by, 3, 1, hairD); }
    else if (p.brows === 'sad') { R(g, bl, by + 1, 3, 1, hairD); R(g, bl + 3, by, 3, 1, hairD); R(g, br, by, 3, 1, hairD); R(g, br + 3, by + 1, 3, 1, hairD); }
    else { R(g, bl, by, 6, 1, hairD); R(g, br, by, 6, 1, hairD); }
  }

  function crown(g, x, y) {
    R(g, x - 8, y + 2, 16, 3, GOLD); R(g, x - 8, y + 4, 16, 1, GOLD_D);
    for (const dx of [-8, -1, 6]) { R(g, x + dx, y - 1, 2, 3, GOLD); R(g, x + dx, y - 2, 2, 1, GOLD_L); }
    R(g, x - 4, y + 3, 2, 1, RED); R(g, x + 2, y + 3, 2, 1, '#3558b8');
  }

  // A band of light crossing whatever has been painted so far: he is plated now.
  function sheen(g, L, p) {
    const k = (((p.f || 0) * 3) % 260) - 70;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255,252,225,' + (0.55 * L.plate).toFixed(2) + ')';
    for (let y = -126; y <= 6; y++) g.fillRect(Math.round(k + y * 0.5), y, 4, 1);
    g.fillStyle = 'rgba(255,252,225,' + (0.28 * L.plate).toFixed(2) + ')';
    for (let y = -126; y <= 6; y++) g.fillRect(Math.round(k + y * 0.5) + 6, y, 2, 1);
    g.restore();
  }

  function hands(g, L, p, hl, hr, skin) {
    const skinD = shade(skin, -0.16);
    R(g, hl[0] - 2, hl[1] - 2, 4, 4, skin); R(g, hl[0] - 2, hl[1] + 1, 4, 1, skinD);
    R(g, hr[0] - 2, hr[1] - 2, 4, 4, skin); R(g, hr[0] - 2, hr[1] + 1, 4, 1, skinD);
    if (p.thumb) R(g, hr[0] - 1, hr[1] - 5, 2, 3, skin);
    if (p.item) A.item(g, p.item, hr[0] + (p.item === 'club' ? 0 : 1), hr[1] - (p.item === 'club' ? -18 : 6));
  }
  function folder(g, y) {
    R(g, -11, y, 22, 15, '#16161c'); R(g, -10, y + 1, 9, 13, WHITE); R(g, 1, y + 1, 9, 13, WHITE);
    for (let i = 0; i < 4; i++) R(g, -9, y + 3 + i * 3, 7, 1, '#b9b4a8');
    R(g, 2, y + 5, 2, 1, INK); R(g, 3, y + 4, 1, 3, INK); R(g, 4, y + 6, 2, 1, INK); R(g, 5, y + 3, 1, 4, INK); R(g, 6, y + 5, 3, 1, INK); R(g, 8, y + 4, 1, 2, INK);
  }

  function paintDon(g, L, p) {
    const skin = L.skin, skinD = shade(skin, -0.16);
    const suit = L.suit, suitD = shade(suit, -0.28), suitA = shade(suit, 0.1);
    const pants = shade(suit, -0.15);
    const hair = L.hair, hairL = shade(hair, 0.28), hairD = shade(hair, -0.22);
    const sway = p.sway || 0;

    // legs and shoes stay planted; everything above them bobs
    const l1 = p.leg === 1 ? 1 : 0, l2 = p.leg === 2 ? 1 : 0;
    R(g, -9, -10, 8, 8 - l1, pants); R(g, 1, -10, 8, 8 - l2, pants);
    const shoe = L.term >= 3 || L.plate >= 1 ? GOLD : '#16121c';
    R(g, -10, -2 - l1, 9, 2, shoe); R(g, 1, -2 - l2, 9, 2, shoe);

    g.save();
    g.translate(sway, p.bob || 0);

    // jacket
    R(g, -12, -30, 24, 21, suit); R(g, -13, -23, 26, 12, suit);
    R(g, -13, -11, 26, 1, suitD);
    // lit windows, as he starts to become a building
    if (L.windows > 0) {
      const cells = [[-10, -26], [8, -26], [-6, -22], [5, -22], [-10, -18], [9, -18], [-6, -14], [5, -14], [-11, -22], [9, -14], [-10, -14], [8, -22]];
      const n = Math.round(L.windows * cells.length);
      for (let i = 0; i < n; i++) R(g, cells[i][0], cells[i][1], 2, 2, ((p.f || 0) >> 5) % cells.length === i ? '#d9b24a' : '#fff3b0');
    }
    // shirt, lapels
    for (let i = 0; i < 9; i++) {
      const hw = Math.max(1, 4 - (i >> 1));
      R(g, -hw, -30 + i, hw * 2, 1, WHITE);
      R(g, -hw - 1, -30 + i, 1, 1, suitD); R(g, hw, -30 + i, 1, 1, suitD);
    }
    R(g, -1, -21, 2, 10, suitD);
    if (L.pin) { R(g, -9, -25, 2, 1, RED); R(g, -9, -24, 2, 1, '#3558b8'); }
    // tie: longer every level, eventually to the floor (and then out of the room: see the trail)
    const tl = L.tieLen;
    R(g, -1, -29, 2, 2, shade(L.tie, -0.25));
    R(g, -2, -27, 4, Math.max(1, tl - 2), L.tie); R(g, -2, -27, 1, Math.max(1, tl - 2), shade(L.tie, 0.18));
    R(g, -1, -27 + tl - 2, 2, 2, L.tie);
    if (L.term >= 2) R(g, -3, -21, 6, 1, GOLD_L);

    // arms
    arm(g, -12, -26, p.hl[0], p.hl[1] - 3, suitA);
    arm(g, 12, -26, p.hr[0], p.hr[1] - 3, suitA);

    // head
    for (let i = 0; i < 23; i++) {
      const inset = i === 0 ? 3 : i === 1 ? 1 : i >= 22 ? 5 : i >= 21 ? 3 : i >= 20 ? 1 : 0;
      R(g, -13 + inset, -52 + i, 26 - inset * 2, 1, skin);
    }
    R(g, -15, -43, 2, 5, skinD); R(g, 13, -43, 2, 5, skinD);
    R(g, -13, -36, 1, 4, skinD); R(g, 12, -36, 1, 4, skinD); R(g, -5, -31, 10, 1, skinD);
    face(g, p, { skin: skin, brow: mix(hair, '#f7e3a1', 0.25), ring: L.ring, squint: L.squint });

    // hair
    const top = -52, hh = L.hh, over = Math.round(L.vol * 4);
    if (L.cap) {
      R(g, -14, top + 3, 2, L.vol > 0.3 ? 8 : 5, hair); R(g, 12, top + 3, 2, 4, hair);
      if (L.vol > 0.5) { R(g, -16, top + 8, 2, 3, hair); R(g, -17, top + 10, 1, 2, hairD); }
      const cap = RED, capD = shade(RED, -0.25);
      R(g, -11, top - 4, 22, 1, cap); R(g, -13, top - 3, 26, 2, cap); R(g, -14, top - 1, 28, 5, cap);
      R(g, -14, top + 3, 28, 1, capD); R(g, 6, top + 3, 13, 2, cap); R(g, 6, top + 5, 13, 1, capD);
      R(g, 1, top - 1, 9, 3, WHITE); R(g, 2, top, 7, 1, capD);
    } else if (L.mane > 0) {
      bigHair(g, L, p, hair, hairL, hairD);
      if (L.crown) crown(g, Math.round(L.lean), top - hh - 4);
    } else {
      R(g, -14, top + 3, 2, L.vol > 0.3 ? 8 : 5, hair); R(g, 12, top + 3, 2, 4, hair);
      if (L.vol > 0.5) { R(g, -16, top + 8, 2, 3, hair); R(g, -17, top + 10, 1, 2, hairD); }
      for (let y = top - hh; y < top + 4; y++) {
        const i = y - (top - hh);
        const inset = i === 0 ? 4 : i === 1 ? 2 : i === 2 ? 1 : 0;
        R(g, -14 + inset, y, 28 - inset * 2 + (i > 0 ? over : 0) - (i === 1 ? 1 : 0), 1, hair);
      }
      R(g, -13, top + 4, 27 + over, 1, hair);
      if (L.vol > 0.25) R(g, 0, top + 5, 14 + over, 1, hair);
      if (L.vol > 0.55) R(g, 7, top + 6, 7 + over, 1, hairD);
      else if (L.vol > 0.25) R(g, 0, top + 5, 14 + over, 1, hairD);
      else R(g, -13, top + 4, 27 + over, 1, hairD);
      // sheen
      if (hh >= 2) R(g, -8, top - hh + 1, 13, 1, hairL);
      if (hh >= 4) { R(g, -3, top - hh + 3, 14 + over, 1, hairL); R(g, -11, top - 1, 9, 1, hairD); }
      if (hh >= 6) R(g, -10, top - hh + 5, 8, 1, hairL);
      if (L.crown) crown(g, 0, top - hh - 4);
    }

    // hands, and whatever is in them
    if (p.folder) folder(g, -35);
    hands(g, L, p, p.hl, p.hr, skin);
    g.restore();
    if (L.plate > 0) sheen(g, L, p);
  }

  // The Tower: he and the building are one. The face is on the top floors, the hair is the
  // roof, the tie runs down the front to the nameplate, and the lobby is where his shoes were.
  function paintTower(g, L, p) {
    const H = L.H, f = p.f || 0, gold = '#dcae3a', goldL = '#f6dc7c', goldD = '#a17518', glass = '#8a6a1c';
    const sway = p.sway || 0, bob = p.bob || 0, dy = 53 - H; // where the man's face lands on the facade
    // plinth and lobby
    R(g, -18, -12, 36, 12, goldD); R(g, -18, -12, 36, 1, goldL); R(g, -17, -1, 34, 1, '#6e4f10');
    R(g, -5, -9, 10, 9, '#20160a'); R(g, -4, -8, 3, 8, '#3a2a10'); R(g, 1, -8, 3, 8, '#3a2a10');
    R(g, -8, -11, 16, 2, RED); R(g, -8, -9, 16, 1, shade(RED, -0.3));
    R(g, -3, -1, 6, 2, RED); // the carpet: the last of the tie
    for (const x of [-15, -11, 10, 14]) R(g, x, -8, 2, 5, '#fff3b0');
    // shaft
    R(g, -15, -H, 30, H - 12, gold); R(g, -15, -H, 2, H - 12, goldL); R(g, 13, -H, 2, H - 12, goldD);
    R(g, -17, -H + 27, 34, 2, goldD); R(g, -17, -H + 27, 34, 1, goldL); // the ledge where his shoulders were
    for (let y = -H + 32; y < -20; y += 4) {
      for (const x of [-11, -7, 5, 9]) {
        const on = ((x * 7 + y * 13 + (f >> 6)) & 7) !== 0 && !(p.eyes === 'closed' && ((x + y) & 3));
        R(g, x, y, 2, 2, on ? '#fff3b0' : glass);
      }
    }
    // the tie, down the front, to his name
    R(g, -2, -H + 29, 4, H - 46, L.tie); R(g, -2, -H + 29, 1, H - 46, shade(L.tie, 0.18)); R(g, -1, -H + 27, 2, 2, shade(L.tie, -0.25));
    R(g, -8, -19, 16, 7, '#20160a'); R(g, -8, -19, 16, 1, goldL); A.text(g, 'DON', -5, -18, '#fff3b0');
    // arms come out at the ledge
    const hl = [p.hl[0] - 3, p.hl[1] + dy + (p.hl[1] > -16 ? 12 : 0)], hr = [p.hr[0] + 3, p.hr[1] + dy + (p.hr[1] > -16 ? 12 : 0)];
    const beam = function (x0, y0, x1, y1) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) R(g, x0 + ((x1 - x0) * i) / n - 1, y0 + ((y1 - y0) * i) / n - 1, 3, 3, goldD); };
    beam(-16, -H + 31, hl[0], hl[1] - 2); beam(16, -H + 31, hr[0], hr[1] - 2);
    g.save();
    g.translate(sway, bob);
    // the face, on the top floors
    R(g, -13, -H + 1, 26, 24, goldL); R(g, -13, -H + 1, 26, 1, '#fff6cf');
    g.save(); g.translate(0, dy); face(g, p, { skin: goldL, brow: goldD, ring: 0, squint: true, plain: false }); g.restore();
    // the roof: the swoop, and a mast where the crown was
    const hair = L.hair, hairL = shade(hair, 0.3), hairD = shade(hair, -0.22);
    for (let i = 0; i < 9; i++) {
      const inset = i === 0 ? 6 : i === 1 ? 3 : i === 2 ? 1 : 0;
      R(g, -17 + inset, -H - 8 + i, 34 - inset * 2 + (i > 2 ? 6 : 0), 1, hair);
    }
    R(g, -10, -H - 6, 16, 1, hairL); R(g, -4, -H - 3, 20, 1, hairL); R(g, 8, -H + 1, 15, 1, hairD); R(g, 20, -H - 1, 3, 4, hair);
    R(g, -1, -H - 15, 2, 7, goldD); R(g, -2, -H - 9, 4, 1, goldL); R(g, -1, -H - 17, 2, 2, f % 20 < 10 ? '#ff5a4a' : '#7a1d16');
    g.restore();
    if (p.folder) folder(g, -H + 18);
    hands(g, L, p, hl, hr, goldL);
    sheen(g, { plate: 0.7 }, p);
  }

  // The Orange Giant: a planet with his face, a flare of hair and a red tail. r is its radius
  // (30 on the screen, 15 for a portrait); the face is drawn at r / 15.
  function drawPlanet(g, cx, cy, L, p, r) {
    const f = p.f || 0, k = r / 15, base = '#f39b3c';
    const moons = [[1.25, 0.11, 2, '#d9d4c7', 0.0], [1.5, 0.07, 3, GOLD, 2.1], [1.72, 0.05, 2, '#c9a7ff', 4.0], [1.4, 0.09, 1, '#ffffff', 1.0], [1.9, 0.04, 3, '#b7c7d9', 5.2], [1.6, 0.06, 2, '#f7dc7a', 3.1]];
    const orbit = function (front) {
      for (let i = 0; i < Math.min(L.moons, moons.length); i++) {
        const m = moons[i], a = f * m[1] * 0.35 + m[4];
        if ((Math.sin(a) > 0) !== front) continue;
        ellipse(g, Math.round(cx + Math.cos(a) * r * m[0]), Math.round(cy + 2 * k + Math.sin(a) * r * 0.28), Math.max(1, Math.round(m[2] * k * 0.5)), Math.max(1, Math.round(m[2] * k * 0.5)), m[3]);
      }
    };
    const ring = function (front) {
      if (L.moons < 2) return;
      for (let a = 0; a < 6.283; a += 0.035) {
        if ((Math.sin(a) > 0) !== front) continue;
        const x = Math.round(cx + Math.cos(a) * r * 1.45), y = Math.round(cy + r * 0.62 + Math.sin(a) * r * 0.22);
        R(g, x, y, k > 1 ? 2 : 1, 1, Math.cos(a * 9) > 0 ? GOLD_L : GOLD);
      }
    };
    orbit(false); ring(false);
    // the tail: all that is left of the tie
    for (let i = 0; i < r * 0.95; i++) {
      const w = Math.max(1, Math.round((5 - i / (r * 0.2)) * k * 0.6));
      R(g, Math.round(cx + i * 0.55 + Math.sin((i + f / 2) / (3 * k)) * 1.6 * k) - (w >> 1), cy + r - 2 + i, w, 1, i % 5 === 4 ? shade(L.tie, 0.25) : L.tie);
    }
    // the globe, in bands
    ellipse(g, cx, cy, r + 1, r + 1, '#7a3d12');
    for (let y = -r; y <= r; y++) {
      const w = Math.round(r * Math.sqrt(1 - (y * y) / (r * r + 0.01)));
      if (w <= 0) continue;
      const band = Math.sin((y / r) * 5.2 + 0.6) + 0.35 * Math.sin((y / r) * 13);
      const c = band > 0.75 ? '#f8bd68' : band > 0.15 ? '#f5a94c' : band > -0.5 ? base : '#e2832a';
      R(g, cx - w, cy + y, w * 2, 1, c);
      const sh = Math.max(1, Math.round(w * 0.22));
      R(g, cx + w - sh, cy + y, sh, 1, shade(c, -0.2)); R(g, cx + w - sh * 2, cy + y, sh, 1, shade(c, -0.09));
      R(g, cx - w, cy + y, Math.max(1, Math.round(w * 0.1)), 1, shade(c, 0.14));
    }
    // a storm, which waves for him
    ellipse(g, Math.round(cx - r * 0.5 + Math.sin(f / 40) * 2), Math.round(cy + r * 0.52), Math.round(r * 0.16), Math.max(1, Math.round(r * 0.07)), '#d9731f');
    // the flare where the hair was
    const hair = '#ffe07a', hairL = '#fff6cf', hairD = '#f0b33a', fl = (f >> 2) % 3;
    ellipse(g, Math.round(cx - r * 0.12), Math.round(cy - r * 0.98), Math.round(r * 0.92), Math.round(r * 0.34), hairD);
    ellipse(g, Math.round(cx - r * 0.16), Math.round(cy - r * 1.04), Math.round(r * 0.86), Math.round(r * 0.3), hair);
    ellipse(g, Math.round(cx + r * 0.66), Math.round(cy - r * 0.86), Math.round(r * 0.5), Math.round(r * 0.22), hair);
    ellipse(g, Math.round(cx + r * 1.02), Math.round(cy - r * 0.7), Math.round(r * 0.2), Math.round(r * 0.16), hairD);
    ellipse(g, Math.round(cx - r * 0.3), Math.round(cy - r * 1.14), Math.round(r * 0.5), Math.max(1, Math.round(r * 0.1)), hairL);
    for (let i = 0; i < 5; i++) { const x = Math.round(cx - r * 0.8 + i * r * 0.38), h = 2 + ((i + fl) % 3) * Math.max(1, Math.round(k)); R(g, x, Math.round(cy - r * 1.3) - h, Math.max(1, Math.round(k)), h, i % 2 ? hair : hairL); }
    // his face
    g.save(); g.translate(cx, Math.round(cy - 1 * k) + Math.round(41 * k) + (p.bob || 0)); g.scale(k, k);
    face(g, p, { skin: base, brow: '#fff1b8', ring: 0.5, squint: true, dark: '#5a1818' });
    g.restore();
    ring(true); orbit(true);
    // two small moons do what his hands did
    const hand = function (h) { return [Math.round(cx + h[0] * 2.4 * k * 0.5), Math.round(cy - k + (h[1] + 41) * 1.4 * k * 0.5)]; };
    const hl = hand(p.hl), hr = hand(p.hr);
    if (r >= 24) {
      ellipse(g, hl[0], hl[1], 3, 3, GOLD); R(g, hl[0] - 1, hl[1] - 2, 2, 1, GOLD_L);
      ellipse(g, hr[0], hr[1], 3, 3, GOLD); R(g, hr[0] - 1, hr[1] - 2, 2, 1, GOLD_L);
      if (p.thumb) R(g, hr[0] - 1, hr[1] - 6, 2, 3, GOLD);
      if (p.item) A.item(g, p.item, hr[0] + 1, hr[1] - 7);
      if (p.folder) { g.save(); g.translate(cx, cy + r * 0.5); folder(g, 0); g.restore(); }
    }
  }

  // The Everything: no body at all. A face in the sky, hair for a nebula, a tie of red stars.
  // The scene behind it is `all` (see drawRoom); this is only him.
  function drawAll(g, L, p) {
    const f = p.f || 0, bob = p.bob || 0, tw = function (i) { return (f + i * 7) % 23 < 3; };
    // the hair: a golden cloud across the top of everything, sweeping right and down
    ellipse(g, 80, 60 + bob, 66, 46, 'rgba(244,150,60,0.07)'); ellipse(g, 80, 60 + bob, 54, 38, 'rgba(244,170,80,0.07)'); // where a head would be
    const cloud = [[56, 16, 64, 12, 'rgba(240,179,58,0.5)'], [76, 12, 68, 9, 'rgba(255,214,90,0.62)'], [118, 23, 42, 10, 'rgba(240,179,58,0.55)'], [144, 36, 15, 9, 'rgba(255,214,90,0.55)'], [62, 9, 46, 4, 'rgba(255,246,207,0.72)'], [106, 16, 36, 3, 'rgba(255,246,207,0.6)'], [40, 21, 30, 3, 'rgba(200,140,40,0.5)'], [124, 29, 26, 2, 'rgba(200,140,40,0.5)']];
    for (const c of cloud) ellipse(g, c[0], c[1], c[2], c[3], c[4]);
    for (let i = 0; i < 26; i++) { const x = 8 + ((i * 37) % 146), y = 4 + ((i * 11) % 24) + (x > 110 ? 10 : 0); R(g, x, y, 1, 1, tw(i) ? '#ffffff' : '#fff1b8'); }
    // brows and eyes
    const ey = 51 + bob, brow = '#ffd84a';
    for (const s of [-1, 1]) {
      const ex = 80 + s * 25;
      if (p.brows === 'angry') { for (let i = 0; i < 26; i++) R(g, ex - 13 + i, ey - 13 + Math.round(((s < 0 ? i : 25 - i) / 25) * 5) - 2, 1, 3, brow); }
      else if (p.brows === 'sad') { for (let i = 0; i < 26; i++) R(g, ex - 13 + i, ey - 13 + Math.round(((s < 0 ? 25 - i : i) / 25) * 5) - 2, 1, 3, brow); }
      else { R(g, ex - 13, ey - 13, 26, 3, brow); R(g, ex - 11, ey - 14, 20, 1, '#fff1b8'); }
      const eyes = p.blink && p.eyes === 'open' ? 'closed' : p.eyes;
      if (eyes === 'closed') { R(g, ex - 11, ey, 22, 2, '#ffffff'); R(g, ex - 8, ey + 2, 16, 1, 'rgba(255,255,255,0.5)'); }
      else if (eyes === 'happy') { R(g, ex - 11, ey + 1, 4, 2, '#ffffff'); R(g, ex - 7, ey - 1, 14, 2, '#ffffff'); R(g, ex + 7, ey + 1, 4, 2, '#ffffff'); }
      else {
        ellipse(g, ex, ey, 16, 8, 'rgba(180,210,255,0.16)'); ellipse(g, ex, ey, 13, 6, '#ffffff'); R(g, ex - 13, ey - 6, 26, 2, 'rgba(9,10,34,0.9)'); // heavy lids
        const gz = [0, 1, 0, -1][Math.floor(f / 34) % 4] * 2;
        ellipse(g, ex + 2 + gz, ey + 1, 5, 5, '#274a8a'); R(g, ex + gz, ey - 2, 4, 6, INK); R(g, ex + gz, ey - 2, 2, 2, '#ffffff');
      }
    }
    // a nose, barely: three faint stars
    R(g, 80, 60 + bob, 3, 1, '#ffd9a0'); R(g, 81, 59 + bob, 1, 3, '#ffd9a0'); R(g, 77, 66 + bob, 2, 1, '#ffb070'); R(g, 84, 66 + bob, 2, 1, '#ffb070');
    // the mouth
    const mx = 81, my = 77 + bob, lip = '#f08a9a', dark = '#3a0f2a';
    switch (p.mouth) {
      case 'open': ellipse(g, mx, my, 12, 8, lip); ellipse(g, mx, my, 10, 6, dark); R(g, mx - 7, my - 5, 14, 2, '#ffffff'); R(g, mx - 3, my + 3, 6, 2, '#d8646b'); break;
      case 'smile': for (let i = -17; i <= 17; i++) R(g, mx + i, my - 3 + Math.round((1 - (i * i) / 289) * 6), 1, 3, lip); R(g, mx - 11, my + 1, 22, 2, '#ffffff'); break;
      case 'frown': for (let i = -14; i <= 14; i++) R(g, mx + i, my + 3 - Math.round((1 - (i * i) / 196) * 5), 1, 3, lip); break;
      case 'flat': R(g, mx - 13, my, 26, 3, lip); break;
      default: ellipse(g, mx, my, 11, 5, lip); R(g, mx - 7, my, 14, 2, dark); R(g, mx - 5, my - 4, 10, 1, '#ffc2cc'); R(g, mx - 13, my, 2, 2, lip); R(g, mx + 11, my, 2, 2, lip); break; // the pout
    }
    // the tie: a river of red stars, running off the bottom of everything
    const tie = L.tie;
    R(g, mx - 3, 90, 6, 4, shade(tie, -0.2));
    for (let y = 94; y < 120; y++) {
      const w = 5 + Math.round((y - 94) * 0.36), x = mx + Math.round(Math.sin((y + f / 3) / 6) * 1.5);
      R(g, x - (w >> 1), y, w, 1, y % 4 === 0 ? shade(tie, 0.2) : tie);
      if ((y * 5 + (f >> 2)) % 9 === 0) R(g, x - (w >> 1) + ((y * 3) % w), y, 1, 1, '#ffffff');
    }
    // what he is given simply arrives
    if (p.item) { if (p.hr[1] < -45) A.item(g, p.item, 122 + (f % 8 < 4 ? 0 : 3), 34); else A.item(g, p.item, mx + 20, my - 2 + bob); }
    if (p.folder) { g.save(); g.translate(mx, 94); folder(g, 0); g.restore(); }
  }

  A.drawDon = function (ctx, cx, footY, look, pose, o) {
    o = o || {};
    if (look.form === 'all') { drawAll(ctx, look, pose); return; }
    if (look.form === 'planet') { drawPlanet(ctx, Math.round(cx), Math.round(footY) - 46, look, pose, 30); return; }
    if (!spr) { spr = mk(SW, SH); sil = mk(SW, SH); }
    const g = spr.getContext('2d');
    g.clearRect(0, 0, SW, SH);
    g.save(); g.translate(OX, OY); (look.form === 'tower' ? paintTower : paintDon)(g, look, pose); g.restore();
    const s = sil.getContext('2d');
    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, SW, SH); s.drawImage(spr, 0, 0);
    s.globalCompositeOperation = 'source-in'; s.fillStyle = INK; s.fillRect(0, 0, SW, SH);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(cx), Math.round(footY));
    if (o.lying) ctx.rotate(-Math.PI / 2);
    else if (!o.noShadow) { ctx.fillStyle = 'rgba(10,8,20,0.28)'; ctx.fillRect(-12, -1, 24, 3); ctx.fillRect(-9, 2, 18, 1); }
    if (o.face < 0 && look.form === 'man') ctx.scale(-1, 1);
    for (const d of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(sil, -OX + d[0], -OY + d[1]);
    ctx.drawImage(spr, -OX, -OY);
    ctx.restore();
  };

  // A portrait for cards, icons and the share picture: his face, whatever it is on. `y` is
  // where a man's feet would be, so his face is 41 above it in every form.
  A.drawBust = function (ctx, cx, y, look, mouth) {
    const p = A.pose('idle', 10, {}); p.mouth = mouth || 'pout'; p.bob = 0; p.blink = false;
    if (look.form === 'all') {
      const fy = y - 41;
      ellipse(ctx, cx, fy - 15, 20, 6, 'rgba(255,224,122,0.55)'); ellipse(ctx, cx + 9, fy - 12, 13, 4, 'rgba(240,179,58,0.6)'); R(ctx, cx - 9, fy - 17, 14, 1, '#fff6cf');
      for (const s of [-1, 1]) { const ex = cx + s * 9; R(ctx, ex - 4, fy - 6, 8, 1, '#ffe07a'); ellipse(ctx, ex, fy - 1, 4, 2, '#ffffff'); R(ctx, ex, fy - 2, 2, 3, '#274a8a'); R(ctx, ex, fy - 2, 1, 2, INK); }
      if (p.mouth === 'smile') { R(ctx, cx - 5, fy + 8, 10, 1, '#f08a9a'); R(ctx, cx - 6, fy + 7, 1, 1, '#f08a9a'); R(ctx, cx + 5, fy + 7, 1, 1, '#f08a9a'); R(ctx, cx - 4, fy + 9, 8, 1, '#ffffff'); }
      else { ellipse(ctx, cx, fy + 8, 4, 2, '#f08a9a'); R(ctx, cx - 2, fy + 8, 4, 1, '#3a0f2a'); }
      for (let i = 0; i < 9; i++) R(ctx, cx - 2 - (i >> 2), fy + 13 + i, 4 + (i >> 1), 1, look.tie);
      return;
    }
    if (look.form === 'planet') { drawPlanet(ctx, cx, y - 41, look, p, 15); return; }
    if (look.form === 'tower') { A.drawDon(ctx, cx, y + look.H - 53, look, p, { noShadow: true }); return; }
    // a man: with the hair grown, step back far enough to see who is in charge
    A.drawDon(ctx, cx, y + (look.mane > 0 ? Math.round(Math.min(look.hh, 34) * 0.5) : 0), look, p, { noShadow: true });
  };

  // Where his mouth is on the screen, for crumbs and the like.
  A.mouth = function (look, at) {
    if (look.form === 'all') return [81, 77];
    if (look.form === 'planet') return [at, A.FLOOR - 38];
    if (look.form === 'tower') return [at, A.FLOOR + 17 - look.H];
    return [at, A.FLOOR - 36];
  };

  // Where a tap lands on him: 'hair', 'body' or null. x, y in screen pixels; at is where he stands.
  A.hit = function (look, at, x, y) {
    if (look.form === 'all') return y < 34 ? 'hair' : 'body';
    if (look.form === 'planet') {
      const dx = x - at, dy = y - (A.FLOOR - 46);
      if (dx * dx + dy * dy > 34 * 34 && !(dy < -22 && Math.abs(dx) < 40 && dy > -46)) return null;
      return dy < -22 ? 'hair' : 'body';
    }
    if (look.form === 'tower') {
      if (Math.abs(x - at) > 19 || y > A.FLOOR + 2 || y < A.FLOOR - look.H - 18) return null;
      return y < A.FLOOR - look.H ? 'hair' : 'body';
    }
    const top = A.FLOOR - 52 - look.hh - (look.crown ? 6 : 0), half = 17 + (look.mane > 0 ? look.wide + (look.over >> 1) : 0);
    if (y > A.FLOOR + 2 || y < top) return null;
    if (y < A.FLOOR - 45) return Math.abs(x - at - (look.mane > 0 ? look.lean : 0)) < half ? 'hair' : null;
    return Math.abs(x - at) < 17 ? 'body' : null;
  };

  // ---------------------------------------------------------------- the egg
  A.drawEgg = function (ctx, cx, footY, taps, f) {
    const wob = taps > 0 && f % 20 < 6 ? (f % 4 < 2 ? -1 : 1) : 0;
    const x = cx + wob, cy = footY - 17;
    R(ctx, cx - 20, footY - 4, 40, 6, '#8f1d2c'); R(ctx, cx - 18, footY - 6, 36, 2, '#a82a3a'); R(ctx, cx - 20, footY + 1, 40, 1, GOLD);
    ellipse(ctx, x, cy + 1, 13, 16, INK);
    ellipse(ctx, x, cy, 12, 15, GOLD);
    ellipse(ctx, x - 3, cy - 4, 6, 8, GOLD_L);
    ellipse(ctx, x + 2, cy + 4, 8, 9, GOLD);
    R(ctx, x - 6, cy - 9, 2, 4, '#fff6cf'); R(ctx, x - 7, cy - 4, 1, 2, '#fff6cf');
    A.text(ctx, '$', x - 1, cy + 3, GOLD_D);
    const cracks = [[-2, -12, 3, 1], [1, -11, 1, 3], [1, -8, 3, 1], [4, -8, 1, 3], [-5, -9, 1, 3], [-7, -6, 3, 1], [4, -5, 3, 1], [-3, -6, 1, 4], [7, -4, 1, 3], [-8, -3, 1, 3]];
    for (let i = 0; i < Math.min(cracks.length, Math.round(taps * 1.4)); i++) R(ctx, x + cracks[i][0], cy + cracks[i][1], cracks[i][2], cracks[i][3], INK);
    if (taps >= 5) { R(ctx, x - 3, cy - 17, 7, 2, '#a07a3a'); R(ctx, x - 1, cy - 18, 5, 1, '#b98f47'); } // a tuft of hair is already out
    if (f % 30 < 4) { R(ctx, x + 9, cy - 13, 1, 3, '#ffffff'); R(ctx, x + 8, cy - 12, 3, 1, '#ffffff'); }
  };

  // ---------------------------------------------------------------- the room
  // Where he is. Past level 77 no room holds him; brought low (humble, or gone), he is back in the office.
  A.sceneFor = function (level, low) {
    if (!low) { if (level >= 100) return 'all'; if (level >= 93) return 'space'; if (level >= 78) return 'skyline'; }
    return level >= 45 ? 'oval' : level >= 10 ? 'tower' : 'apt';
  };

  function sky(g, x, y, w, h, hour) {
    let top, bot, night = false;
    if (hour >= 7.5 && hour < 17) { top = '#5fb0ee'; bot = '#c4e6ff'; }
    else if ((hour >= 5.5 && hour < 7.5) || (hour >= 17 && hour < 19.5)) { top = '#6f63b0'; bot = '#f8ac62'; }
    else { top = '#0b1230'; bot = '#22306a'; night = true; }
    const bands = 6;
    for (let i = 0; i < bands; i++) R(g, x, y + Math.floor((h * i) / bands), w, Math.ceil(h / bands) + 1, mix(top, bot, i / (bands - 1)));
    if (night) {
      const stars = [[5, 4], [14, 9], [23, 3], [31, 12], [40, 6], [46, 15], [9, 17], [36, 20], [19, 14]];
      for (const s of stars) if (s[0] < w && s[1] < h) R(g, x + s[0], y + s[1], 1, 1, '#f4f0d8');
      ellipse(g, x + w - 9, y + 8, 4, 4, '#f6f0c9'); ellipse(g, x + w - 7, y + 7, 3, 3, top);
    } else if (hour >= 7.5 && hour < 17) {
      R(g, x + 6, y + 6, 10, 2, '#ffffff'); R(g, x + 8, y + 4, 6, 2, '#ffffff'); R(g, x + 30, y + 10, 12, 2, '#ffffff'); R(g, x + 33, y + 8, 6, 2, '#ffffff');
    }
    return night;
  }

  function skyline(g, x, y, w, h, scene, night, env) {
    const base = y + h;
    const lit = night ? '#f6d86a' : '#dfe9f5';
    if (scene === 'apt') {
      const c = night ? '#2a2540' : '#8b7f8f';
      const hs = [[0, 10], [9, 14], [17, 9], [26, 16], [36, 11], [44, 13]];
      for (const b of hs) { R(g, x + b[0], base - b[1], 9, b[1], c); R(g, x + b[0] + 2, base - b[1] + 3, 2, 2, lit); R(g, x + b[0] + 5, base - b[1] + 7, 2, 2, lit); }
      R(g, x + 29, base - 21, 4, 5, night ? '#3a3450' : '#6f5a4a'); R(g, x + 30, base - 16, 1, 3, INK); R(g, x + 32, base - 16, 1, 3, INK);
    } else if (scene === 'tower') {
      const c = night ? '#1c2244' : '#7d93b3', c2 = night ? '#252c55' : '#93a8c6';
      const hs = [[0, 18, 8], [8, 26, 7], [15, 14, 9], [34, 22, 8], [42, 30, 10]];
      for (const b of hs) { R(g, x + b[0], base - b[1], b[2], b[1], b[0] % 2 ? c : c2); for (let yy = base - b[1] + 2; yy < base - 1; yy += 4) R(g, x + b[0] + 2, yy, b[2] - 4, 1, lit); }
      R(g, x + 24, base - 34, 10, 34, GOLD); R(g, x + 24, base - 34, 2, 34, GOLD_L); R(g, x + 32, base - 34, 2, 34, GOLD_D);
      for (let yy = base - 31; yy < base - 1; yy += 3) R(g, x + 27, yy, 4, 1, night ? '#fff3b0' : GOLD_D);
      R(g, x + 28, base - 37, 2, 3, GOLD_D);
    } else {
      R(g, x, base - 9, w, 9, night ? '#17402a' : '#4f9c4a'); R(g, x, base - 10, w, 1, night ? '#205236' : '#6cb85e');
      R(g, x + 12, base - 30, 4, 22, night ? '#b9bdd0' : '#f4f1e6'); R(g, x + 13, base - 32, 2, 2, night ? '#b9bdd0' : '#f4f1e6');
      for (const tx of [2, 30, 43]) { ellipse(g, x + tx + 3, base - 13, 4, 4, night ? '#12331f' : '#2f7a3a'); R(g, x + tx + 3, base - 9, 1, 3, '#4a3320'); }
    }
    if (env.decor.ballroom) {
      const bx = x + w - 20;
      R(g, bx, base - 16, 20, 16, GOLD_L); R(g, bx - 1, base - 18, 22, 2, GOLD); R(g, bx + 3, base - 22, 14, 4, GOLD); R(g, bx + 7, base - 24, 6, 2, GOLD_L);
      for (let i = 0; i < 5; i++) R(g, bx + 1 + i * 4, base - 15, 2, 15, '#fff6cf');
      R(g, bx, base - 1, 20, 1, GOLD_D);
    }
  }

  function fireworks(g, x, y, w, h, f) {
    const bursts = [[10, 10, '#ff6b6b'], [30, 7, '#fff07a'], [43, 15, '#7ad1ff']];
    bursts.forEach(function (b, i) {
      const ph = (f + i * 13) % 40;
      if (ph > 22) return;
      const r = 1 + Math.floor(ph / 4);
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        const px = x + b[0] + Math.round(Math.cos(ang) * r), py = y + b[1] + Math.round(Math.sin(ang) * r);
        if (px >= x && px < x + w && py >= y && py < y + h) R(g, px, py, 1, 1, b[2]);
      }
    });
  }

  function miniDon(g, x, y, s) { // tiny him, for TVs, magazines and portraits. s = scale
    R(g, x - 3 * s, y, 6 * s, 5 * s, '#f39a4a');
    R(g, x - 4 * s, y - 2 * s, 8 * s, 3 * s, '#f6d055'); R(g, x + 1 * s, y + s, 4 * s, s, '#f6d055');
    R(g, x - 2 * s, y + 2 * s, s, s, INK); R(g, x + s, y + 2 * s, s, s, INK);
    R(g, x - s, y + 4 * s, 2 * s, s, '#b8433a');
    R(g, x - 5 * s, y + 5 * s, 10 * s, 4 * s, NAVY); R(g, x - s, y + 5 * s, 2 * s, 4 * s, RED); R(g, x - 2 * s, y + 5 * s, s, s, WHITE); R(g, x + s, y + 5 * s, s, s, WHITE);
  }

  function frame(g, x, y, w, h, thick) {
    R(g, x, y, w, h, GOLD_D); R(g, x, y, w - 1, h - 1, GOLD); R(g, x, y, w, 1, GOLD_L); R(g, x, y, 1, h, GOLD_L);
    R(g, x + thick, y + thick, w - thick * 2, h - thick * 2, '#2a2320');
  }

  function room(g, env) {
    const sc = env.scene, f = env.frame || 0, D = env.decor;
    const gold = !!D.walls;
    // --- wall
    let wall, wall2, trim, floor, floor2;
    if (sc === 'apt') { wall = '#d8c6a2'; wall2 = '#d0bd97'; trim = '#7a5533'; floor = '#9c6c40'; floor2 = '#8a5d35'; }
    else if (sc === 'tower') { wall = '#efe2c0'; wall2 = '#e6d7b0'; trim = GOLD; floor = '#8f1d2c'; floor2 = '#7c1726'; }
    else { wall = '#f4ecd2'; wall2 = '#ece2c4'; trim = '#ffffff'; floor = '#22386b'; floor2 = '#1c2f5c'; }
    if (gold) { wall = '#e3bd4e'; wall2 = '#d6ae3f'; trim = GOLD_L; }
    R(g, 0, 0, 160, 88, wall);
    for (let x = 0; x < 160; x += 16) R(g, x, 0, 8, 88, wall2);
    if (gold) for (let y = 6; y < 84; y += 10) for (let x = (y % 20 ? 4 : 12); x < 160; x += 16) { R(g, x, y, 2, 2, GOLD_L); R(g, x - 1, y + 1, 4, 1, '#f1d267'); }
    if (sc !== 'apt') {
      R(g, 0, 62, 160, 1, shade(trim, -0.15)); R(g, 0, 63, 160, 22, sc === 'oval' && !gold ? '#fbf8ee' : shade(wall, 0.08));
      for (let x = 4; x < 160; x += 26) { R(g, x, 67, 20, 14, shade(wall, sc === 'oval' && !gold ? 0.5 : -0.05)); R(g, x, 67, 20, 1, shade(trim, -0.1)); R(g, x, 67, 1, 14, shade(trim, -0.1)); }
    }
    R(g, 0, 84, 160, 4, shade(trim, sc === 'apt' ? 0 : -0.1)); R(g, 0, 84, 160, 1, shade(trim, 0.25));
    // --- floor
    R(g, 0, 88, 160, 32, floor);
    if (sc === 'apt') { for (let y = 94; y < 120; y += 7) R(g, 0, y, 160, 1, floor2); for (let x = 12; x < 160; x += 34) R(g, x, 88, 1, 6, floor2); }
    else { for (let y = 90; y < 120; y += 4) for (let x = (y % 8 ? 2 : 6); x < 160; x += 8) R(g, x, y, 1, 1, floor2); }
    if (sc === 'oval') {
      ellipse(g, 80, 106, 54, 11, '#e9dfc0'); ellipse(g, 80, 106, 51, 9, '#f6efd8'); ellipse(g, 80, 106, 17, 6, GOLD); ellipse(g, 80, 106, 15, 5, '#f6efd8');
      ellipse(g, 80, 106, 6, 3, '#3558b8'); for (let k = 0; k < 12; k++) R(g, 80 + Math.round(Math.cos(k * 0.5236) * 11), 106 + Math.round(Math.sin(k * 0.5236) * 4), 1, 1, GOLD_D);
    } else if (sc === 'tower') {
      ellipse(g, 80, 106, 46, 9, '#6a1220'); ellipse(g, 80, 106, 44, 8, '#a02a3a'); ellipse(g, 80, 106, 38, 6, '#8f1d2c');
    } else {
      ellipse(g, 80, 106, 36, 7, '#5f7f6a'); ellipse(g, 80, 106, 33, 6, '#70927b');
    }

    // --- window
    const wx = 54, wy = 18, ww = 52, wh = 40;
    R(g, wx - 3, wy - 3, ww + 6, wh + 7, sc === 'apt' ? '#7a5533' : gold || sc === 'oval' ? GOLD : '#f7f2e4');
    R(g, wx - 2, wy - 2, ww + 4, wh + 4, sc === 'apt' ? '#95683f' : '#fbf8ee');
    const night = sky(g, wx, wy, ww, wh, env.hour);
    skyline(g, wx, wy, ww, wh, sc, night, env);
    if (env.season === 'july4' || env.season === 'newyear' || env.season === 'newyearseve') fireworks(g, wx, wy, ww, wh, f);
    if (env.season === 'christmas') for (let i = 0; i < 9; i++) R(g, wx + ((i * 17 + f) % ww), wy + ((i * 11 + Math.floor(f / 2)) % wh), 1, 1, '#ffffff');
    R(g, wx + ww / 2 - 1, wy, 2, wh, sc === 'apt' ? '#95683f' : '#fbf8ee'); R(g, wx, wy + 19, ww, 2, sc === 'apt' ? '#95683f' : '#fbf8ee');
    R(g, wx - 4, wy + wh + 2, ww + 8, 3, sc === 'apt' ? '#7a5533' : shade(trim, -0.1));
    if (D.curtains || sc === 'oval') {
      const c1 = '#d9a92e', c2 = '#f0cd5c', c3 = '#b88a1e';
      for (const dx of [wx - 8, wx + ww]) { R(g, dx, wy - 4, 8, wh + 12, c1); R(g, dx + 1, wy - 4, 1, wh + 12, c2); R(g, dx + 4, wy - 4, 1, wh + 12, c3); R(g, dx + 6, wy - 4, 1, wh + 12, c2); R(g, dx, wy + wh + 6, 8, 2, c3); }
      R(g, wx - 9, wy - 8, ww + 18, 6, c1); R(g, wx - 9, wy - 8, ww + 18, 1, c2); R(g, wx - 9, wy - 3, ww + 18, 1, c3);
      for (let x = wx - 7; x < wx + ww + 8; x += 6) R(g, x, wy - 2, 3, 2, c1);
    }

    // --- bunting for campaign season
    if (env.bunting || env.festive) {
      for (let i = 0; i < 16; i++) { const c = [RED, WHITE, '#3558b8'][i % 3]; ellipse(g, 5 + i * 10, 2, 5, 5, c); R(g, i * 10, 0, 10, 2, c); }
    }

    // --- left wall: tv, magazine
    if (D.tv) {
      R(g, 5, 19, 34, 24, '#101016'); R(g, 6, 20, 32, 22, '#1f2030');
      const b = f % 60 < 34;
      R(g, 7, 21, 30, 20, b ? '#24468f' : '#8f1d2c');
      miniDon(g, b ? 17 : 27, 25, 1);
      R(g, 7, 37, 30, 4, b ? RED : '#f4f1e6');
      A.text(g, b ? 'NEWS' : 'WOW', b ? 22 : 9, 28, '#ffffff');
      for (let i = 0; i < 6; i++) R(g, 8 + ((i * 6 + Math.floor(f / 3)) % 28), 38, 3, 1, b ? '#ffffff' : RED);
      if (f % 9 === 0) R(g, 7, 21 + (f % 20), 30, 1, 'rgba(255,255,255,0.18)');
    }
    if (D.magazine) {
      frame(g, 26, 46, 12, 16, 1); R(g, 27, 47, 10, 14, RED); R(g, 28, 48, 8, 2, WHITE); miniDon(g, 32, 52, 1);
    }
    // --- right wall: portraits
    if (D.bigportrait) {
      frame(g, 114, 6, 44, 50, 3);
      R(g, 117, 9, 38, 44, '#3b2f4a'); R(g, 117, 9, 38, 14, '#4a3b5c');
      miniDon(g, 131, 22, 2);
      frame(g, 142, 13, 12, 14, 1); R(g, 143, 14, 10, 12, '#6b5a3a'); miniDon(g, 148, 16, 1);
      R(g, 114, 6, 3, 3, GOLD_L); R(g, 155, 6, 3, 3, GOLD_L); R(g, 114, 53, 3, 3, GOLD_L); R(g, 155, 53, 3, 3, GOLD_L);
    } else if (D.portrait) {
      frame(g, 122, 14, 26, 32, 2); R(g, 124, 16, 22, 28, '#3b2f4a'); miniDon(g, 135, 21, 2);
    }
    // --- chandelier
    if (D.chandelier) {
      R(g, 79, 0, 2, 5, GOLD_D); R(g, 72, 5, 16, 2, GOLD); R(g, 68, 7, 24, 2, GOLD); R(g, 70, 9, 20, 1, GOLD_D);
      for (let i = 0; i < 7; i++) { const tw = (f + i * 5) % 24 < 3; R(g, 69 + i * 4 - 1 + 0, 10, 1, 2 + (i % 2), tw ? '#ffffff' : '#bfe6ff'); }
      R(g, 79, 10, 2, 5, '#dff3ff'); R(g, 79, 15, 2, 1, '#ffffff');
    }

    // --- floor pieces on the left: eagle, gold toilet
    if (D.eagle) {
      R(g, 7, 76, 14, 12, '#e8e4da'); R(g, 6, 75, 16, 2, '#f7f4ec'); R(g, 6, 86, 16, 2, '#cfc9bb');
      R(g, 11, 64, 7, 11, GOLD); R(g, 5, 66, 6, 3, GOLD); R(g, 4, 69, 5, 3, GOLD_D); R(g, 18, 66, 6, 3, GOLD); R(g, 20, 69, 5, 3, GOLD_D);
      R(g, 12, 59, 5, 5, GOLD_L); R(g, 17, 61, 2, 1, GOLD_D); R(g, 14, 60, 1, 1, INK); R(g, 12, 66, 1, 8, GOLD_L);
    }
    if (D.toilet) {
      R(g, 28, 64, 12, 12, GOLD); R(g, 28, 64, 12, 2, GOLD_L); R(g, 37, 66, 2, 1, GOLD_D);
      R(g, 26, 76, 16, 3, GOLD_L); R(g, 27, 79, 14, 4, GOLD); R(g, 30, 83, 8, 5, GOLD_D); R(g, 28, 79, 2, 3, GOLD_L);
      if (f % 36 < 4) { R(g, 41, 66, 1, 3, '#ffffff'); R(g, 40, 67, 3, 1, '#ffffff'); }
    }

    // --- flags
    if (sc === 'oval') {
      R(g, 46, 26, 1, 62, GOLD); R(g, 45, 25, 3, 2, GOLD_L);
      for (let i = 0; i < 12; i++) R(g, 47, 28 + i * 2, 6, 2, i % 2 ? WHITE : RED);
      R(g, 47, 28, 4, 8, '#2a4b9b'); R(g, 48, 30, 1, 1, WHITE); R(g, 49, 33, 1, 1, WHITE);
      R(g, 113, 26, 1, 62, GOLD); R(g, 112, 25, 3, 2, GOLD_L);
      R(g, 107, 28, 6, 24, '#22386b'); R(g, 109, 37, 2, 3, GOLD); R(g, 107, 51, 6, 1, GOLD);
      R(g, 44, 86, 5, 2, GOLD_D); R(g, 111, 86, 5, 2, GOLD_D);
    }

    // --- desk
    if (sc === 'apt') {
      R(g, 106, 66, 50, 4, '#8a5a33'); R(g, 106, 66, 50, 1, '#a36c40'); R(g, 109, 70, 4, 18, '#6e4525'); R(g, 149, 70, 4, 18, '#6e4525'); R(g, 113, 70, 36, 9, '#7a4e2b');
      R(g, 126, 63, 9, 3, WHITE); R(g, 127, 62, 9, 1, '#e7e1d2');
    } else if (sc === 'tower') {
      R(g, 106, 68, 50, 20, '#2a2320'); R(g, 104, 64, 54, 4, '#3a302b'); R(g, 104, 67, 54, 1, GOLD); R(g, 110, 72, 42, 12, '#211b19'); R(g, 110, 72, 42, 1, GOLD_D);
      R(g, 138, 60, 9, 4, '#16161c'); R(g, 139, 59, 7, 1, '#2b2b33'); R(g, 124, 62, 9, 2, WHITE);
    } else {
      R(g, 104, 68, 54, 20, '#6e4322'); R(g, 102, 64, 58, 4, '#8a5a30'); R(g, 102, 64, 58, 1, '#a8733f'); R(g, 102, 67, 58, 1, '#4f2d15');
      R(g, 108, 71, 12, 14, '#5a3419'); R(g, 142, 71, 12, 14, '#5a3419'); R(g, 123, 71, 16, 14, '#5a3419'); R(g, 129, 75, 4, 4, GOLD); R(g, 127, 76, 8, 1, GOLD);
      R(g, 138, 60, 9, 4, '#16161c'); R(g, 139, 59, 7, 1, '#2b2b33'); R(g, 124, 62, 9, 2, WHITE); R(g, 125, 61, 9, 1, '#e7e1d2');
    }
    if (D.button) { R(g, 109, 60, 9, 4, '#6e4322'); R(g, 109, 60, 9, 1, '#8a5a30'); R(g, 111, 58, 5, 2, env.buttonLit ? '#ff6b6b' : RED); R(g, 112, 57, 3, 1, '#ff8f8f'); }
    if (D.trophy) { R(g, 149, 55, 6, 5, GOLD); R(g, 148, 55, 8, 1, GOLD_L); R(g, 147, 56, 1, 3, GOLD); R(g, 156, 56, 1, 3, GOLD); R(g, 151, 60, 2, 2, GOLD_D); R(g, 149, 62, 6, 2, '#2a2320'); }
    if (env.bunting) { R(g, 110, 73, 22, 11, NAVY); R(g, 110, 73, 22, 1, WHITE); R(g, 110, 81, 22, 3, RED); A.text(g, 'DON!', 113, 75, WHITE); }

    // --- seasons
    if (env.season === 'christmas') {
      const tx = 22; R(g, tx - 1, 104, 3, 5, '#4a3320');
      for (let i = 0; i < 4; i++) { const w = 4 + i * 3; R(g, tx - w, 78 + i * 7, w * 2 + 1, 7, i % 2 ? '#1f6b3a' : '#267a44'); }
      R(g, tx - 1, 73, 3, 3, GOLD_L); R(g, tx, 72, 1, 5, GOLD_L); R(g, tx - 2, 74, 5, 1, GOLD_L);
      const lights = [[-3, 82, RED], [2, 86, GOLD_L], [-6, 91, '#7ad1ff'], [4, 94, RED], [-8, 99, GOLD_L], [1, 100, '#7ad1ff'], [8, 101, RED]];
      lights.forEach(function (l, i) { if ((f + i * 7) % 20 < 14) R(g, tx + l[0], l[1], 2, 2, l[2]); });
    }
    if (env.season === 'halloween') { ellipse(g, 24, 104, 7, 5, '#e8742c'); R(g, 23, 97, 2, 3, '#2f7a3a'); R(g, 20, 102, 2, 2, INK); R(g, 26, 102, 2, 2, INK); R(g, 21, 106, 6, 1, INK); }
    if (env.season === 'birthday') {
      R(g, 118, 58, 10, 6, '#f7c7d4'); R(g, 118, 58, 10, 2, WHITE); for (let i = 0; i < 4; i++) { R(g, 119 + i * 2, 55, 1, 3, '#7ad1ff'); if (f % 6 < 4) R(g, 119 + i * 2, 54, 1, 1, GOLD_L); }
      for (const b of [[20, 30, RED], [28, 24, '#3558b8'], [140, 14, GOLD]]) { ellipse(g, b[0], b[1] + ((f >> 3) & 1), 4, 5, b[2]); R(g, b[0], b[1] + 6, 1, 14, '#6b6b6b'); }
    }
    if (env.season === 'easter') { // eggs left over from the roll
      [[16, 106, '#7ad1ff'], [26, 111, '#ff9ec4'], [36, 104, GOLD_L], [137, 112, '#b9f2a6'], [146, 107, '#c9a7ff']].forEach(function (e) {
        ellipse(g, e[0], e[1], 3, 4, e[2]); R(g, e[0] - 2, e[1], 5, 1, WHITE);
      });
    }
    if (env.season === 'superbowl') { ellipse(g, 131, 60, 5, 3, '#7a4a22'); R(g, 129, 59, 5, 1, WHITE); R(g, 131, 58, 1, 3, WHITE); }
    if (env.season === 'hamburger') { A.item(g, 'hamberder', 120, 59); A.item(g, 'hamberder', 131, 59); A.item(g, 'hamberder', 126, 52); }
    if (env.season === 'blackfriday') { R(g, 118, 52, 22, 11, RED); R(g, 119, 53, 20, 9, WHITE); A.text(g, 'SALE', 122, 55, RED); R(g, 128, 63, 2, 2, '#6b6b6b'); }
    if (env.season === 'groundhog') { // he is on the windowsill, checking for his shadow
      ellipse(g, 66, 54, 4, 5, '#7a5533'); R(g, 63, 48, 6, 4, '#8a6540'); R(g, 64, 49, 1, 1, INK); R(g, 67, 49, 1, 1, INK); R(g, 65, 51, 2, 1, WHITE); R(g, 70, 58, 6, 1, 'rgba(0,0,0,0.25)');
    }
    if (env.season === 'friday13') { // a black cat has taken the desk
      R(g, 118, 58, 9, 6, INK); R(g, 125, 54, 5, 5, INK); R(g, 125, 53, 1, 1, INK); R(g, 129, 53, 1, 1, INK); R(g, 126, 56, 1, 1, GOLD_L); R(g, 128, 56, 1, 1, GOLD_L); R(g, 115, 55, 3, 2, INK); R(g, 114, 53, 2, 3, INK);
    }
    if (env.season === 'stpatrick') [[18, 30], [146, 60], [40, 70]].forEach(function (c) { R(g, c[0], c[1], 2, 2, '#1f9d55'); R(g, c[0] + 3, c[1], 2, 2, '#1f9d55'); R(g, c[0] + 1, c[1] + 2, 3, 2, '#1f9d55'); R(g, c[0] + 2, c[1] + 4, 1, 3, '#157a41'); });
    if (env.season === 'valentine') for (let i = 0; i < 4; i++) { const hx = 14 + i * 40, hy = 20 + ((f + i * 9) % 30); R(g, hx, hy, 2, 2, '#ff6b9a'); R(g, hx + 3, hy, 2, 2, '#ff6b9a'); R(g, hx, hy + 2, 5, 2, '#ff6b9a'); R(g, hx + 1, hy + 4, 3, 1, '#ff6b9a'); R(g, hx + 2, hy + 5, 1, 1, '#ff6b9a'); }
  };

  // ---------------------------------------------------------------- where he is once no room holds him
  A.hasRoom = function (scene) { return scene === 'apt' || scene === 'tower' || scene === 'oval'; };
  function hash(i) { const x = Math.sin(i * 127.1 + 11.7) * 43758.5453; return x - Math.floor(x); }
  function isNight(hour) { return !((hour >= 5.5 && hour < 19.5)); }

  function bigSky(g, hour, f, h) {
    let top, bot;
    const night = isNight(hour), day = hour >= 7.5 && hour < 17;
    if (day) { top = '#4f9fe6'; bot = '#cfeaff'; } else if (!night) { top = '#5b4f9f'; bot = '#f8ac62'; } else { top = '#070c26'; bot = '#232f6a'; }
    const bands = 12;
    for (let i = 0; i < bands; i++) R(g, 0, Math.floor((h * i) / bands), A.W, Math.ceil(h / bands) + 1, mix(top, bot, i / (bands - 1)));
    if (night) {
      for (let i = 0; i < 46; i++) R(g, Math.floor(hash(i) * A.W), Math.floor(hash(i + 50) * h * 0.8), 1, 1, (f + i * 5) % 31 < 3 ? '#ffffff' : '#c3cbea');
      ellipse(g, 22, 18, 7, 7, '#f6f0c9'); ellipse(g, 25, 16, 6, 6, top);
    } else if (day) { ellipse(g, 24, 18, 9, 9, '#fff6cf'); ellipse(g, 24, 18, 7, 7, '#ffe680'); }
    else { ellipse(g, 26, h - 24, 10, 10, '#ffd98a'); ellipse(g, 26, h - 24, 8, 8, '#ffbe5c'); }
    return night;
  }

  // The city, seen from his height: the tallest building comes up to his knee.
  function skylineScene(g, env) {
    const f = env.frame || 0, L = env.look || {}, night = bigSky(g, env.hour, f, 108);
    const far = night ? '#171d42' : '#9fb2cf', near = night ? '#0f1330' : '#5d6f8f', near2 = night ? '#151a3c' : '#6c7fa1', lit = night ? '#f6d86a' : '#e6eef8';
    for (let i = 0; i < 32; i++) { const h = 6 + Math.floor(hash(i + 3) * 16); R(g, i * 5, 104 - h, 5, h + 4, far); }
    for (let x = 0, i = 0; x < A.W; i++) {
      const w = 6 + Math.floor(hash(i + 20) * 7), h = 8 + Math.floor(hash(i + 40) * 17);
      R(g, x, 108 - h, w, h, i % 2 ? near : near2); R(g, x, 108 - h, 1, h, shade(i % 2 ? near : near2, 0.12));
      for (let yy = 108 - h + 2; yy < 106; yy += 3) for (let xx = x + 2; xx < x + w - 1; xx += 2) if (hash(i * 31 + yy * 7 + xx) > (night ? 0.45 : 0.78)) R(g, xx, yy, 1, 1, lit);
      x += w + (hash(i + 60) > 0.7 ? 2 : 0);
    }
    if (L.form !== 'tower') { // his tower, while it is still a different thing from him
      R(g, 128, 60, 13, 48, GOLD); R(g, 128, 60, 2, 48, GOLD_L); R(g, 139, 60, 2, 48, GOLD_D); R(g, 130, 57, 9, 3, GOLD); R(g, 134, 51, 1, 6, GOLD_D);
      for (let yy = 63; yy < 106; yy += 3) R(g, 131, yy, 7, 1, night ? '#fff3b0' : GOLD_D);
      R(g, 134, 50, 1, 1, f % 20 < 10 ? '#ff5a4a' : '#7a1d16');
    }
    R(g, 0, 108, A.W, 12, night ? '#0b0d1a' : '#3d4352'); R(g, 0, 108, A.W, 1, night ? '#2a3050' : '#5a6274');
    for (let x = 4; x < A.W; x += 14) R(g, x, 114, 6, 1, night ? '#6b6238' : '#d9c56a');
    for (let c = 0; c < 4; c++) {
      const dir = c % 2 ? 1 : -1, x = Math.round(((((f * dir * 0.6 + c * 47) % 180) + 180) % 180) - 10), y = c % 2 ? 111 : 116;
      R(g, x, y, 4, 2, ['#d0182e', '#f6d86a', '#7ad1ff', '#ffffff'][c]); if (night) R(g, x + (dir > 0 ? 4 : -1), y + 1, 1, 1, '#fff3b0');
    }
  }

  function spaceScene(g, env) {
    const f = env.frame || 0;
    for (let i = 0; i < 6; i++) R(g, 0, i * 20, A.W, 20, mix('#050817', '#131a3e', i / 5));
    for (let i = 0; i < 80; i++) R(g, Math.floor(hash(i) * A.W), Math.floor(hash(i + 100) * A.H), 1, 1, (f + i * 5) % 37 < 3 ? '#ffffff' : hash(i + 200) > 0.8 ? '#ffe9a8' : '#9aa5d2');
    for (let i = 0; i < 5; i++) { const x = 6 + Math.floor(hash(i + 400) * 148), y = 6 + Math.floor(hash(i + 420) * 108), c = (f + i * 9) % 41 < 6 ? '#ffffff' : '#dfe6ff'; R(g, x - 1, y, 3, 1, c); R(g, x, y - 1, 1, 3, c); }
    // the old planet, small and far, with something gold still standing on it
    ellipse(g, 17, 103, 6, 6, '#1d4f9c'); ellipse(g, 16, 102, 5, 5, '#2f6fd0'); R(g, 13, 100, 3, 2, '#3fa35a'); R(g, 17, 103, 3, 2, '#3fa35a'); R(g, 14, 105, 4, 1, '#3fa35a'); R(g, 18, 96, 1, 2, GOLD_L);
  }

  function allScene(g, env) {
    const f = env.frame || 0;
    for (let i = 0; i < 12; i++) R(g, 0, i * 10, A.W, 10, mix('#090a22', '#2b1642', i / 11));
    // every star has his colouring now
    for (let i = 0; i < 120; i++) {
      const c = hash(i + 500) > 0.5 ? '#ffe07a' : hash(i + 500) > 0.25 ? '#f0b33a' : '#e8ecff';
      R(g, Math.floor(hash(i + 7) * A.W), Math.floor(hash(i + 300) * A.H), 1, 1, (f + i * 3) % 29 < 3 ? '#ffffff' : c);
    }
    for (let i = 0; i < 9; i++) { const x = 5 + Math.floor(hash(i + 440) * 150), y = 30 + Math.floor(hash(i + 460) * 86), c = (f + i * 9) % 41 < 6 ? '#ffffff' : '#ffe9a8'; R(g, x - 1, y, 3, 1, c); R(g, x, y - 1, 1, 3, c); }
    ellipse(g, 13, 109, 3, 3, '#2f6fd0'); R(g, 12, 108, 2, 1, '#3fa35a');
  }

  // The office is starting to give: his hair has reached the ceiling.
  function cracks(g, L) {
    const n = Math.max(0, Math.min(8, L.level - 69)), at = [80, 52, 108, 30, 130, 66, 96, 14], c = '#5c4c30';
    for (let i = 0; i < n; i++) {
      let x = at[i], y = 0;
      R(g, x - 1, 0, 3, 1, c);
      for (let k = 0; k < 4 + (i % 3) * 2; k++) { R(g, x, y, 1, 2, c); y += 2; x += ((k + i) % 2 ? 1 : -1) * (1 + (k % 2)); }
    }
  }

  // The tie, once it is longer than he is tall. It runs off along the floor to the right;
  // from The Long Tie on it has been all the way round, and its end comes back in from the
  // left, a little further every level, wagging.
  function trail(g, L, env) {
    const f = env.frame || 0, c = L.tie, c2 = shade(c, 0.22), x0 = Math.round(env.x == null ? 80 : env.x);
    const end = L.tieWindow ? A.W : Math.min(A.W, x0 + Math.round(8 + L.tieOut * (A.W - x0)));
    const wave = function (x) { return A.FLOOR + 3 + Math.round(Math.sin((x + f / 2) / 7)); };
    R(g, x0 - 2, A.FLOOR - 2, 4, 6, c);
    for (let x = x0; x < end; x++) { R(g, x, wave(x), 1, 3, c); if (x % 6 === 0) R(g, x, wave(x), 1, 1, c2); }
    if (!L.tieWindow) { R(g, end, wave(end) + 1, 2, 1, c); return; }
    const tip = Math.max(6, Math.min(x0 - 20, 24 + (L.level - 70) * 5)), wag = Math.round(Math.sin(f / 5) * 2);
    for (let x = 0; x < tip; x++) { const y = wave(x + 40) + 5 + Math.round((wag * x) / Math.max(1, tip)); R(g, x, y, 1, 3, c); if (x % 6 === 3) R(g, x, y, 1, 1, c2); }
    const ty = wave(tip + 40) + 5 + wag;
    R(g, tip, ty - 1, 2, 5, c); R(g, tip + 2, ty, 2, 3, c); R(g, tip + 4, ty + 1, 1, 1, c); // the point
  }

  // Everything that goes in front of him: called after he is drawn.
  A.drawOver = function (g, env) {
    if (env.scene !== 'skyline') return;
    const f = env.frame || 0, night = isNight(env.hour), lit = night ? '#f6d86a' : '#e6eef8', at = env.x == null ? 80 : env.x;
    for (let i = 0, x = -3; x < A.W; i++) { // rooftops in front of his shoes
      const w = 7 + Math.floor(hash(i + 80) * 8), h = 3 + Math.floor(hash(i + 90) * 6);
      R(g, x, A.H - h, w, h, night ? '#070913' : '#2c3342'); if (hash(i + 95) > 0.5) R(g, x + 2, A.H - h + 1, 1, 1, lit);
      x += w + 1;
    }
    for (let c = 0; c < 3; c++) { // clouds at his chest
      const x = Math.round(((f * (0.12 + c * 0.05) + c * 75) % 210) - 30), y = 64 + c * 9, col = night ? 'rgba(170,180,220,0.55)' : 'rgba(255,255,255,0.78)';
      R(g, x, y, 18, 3, col); R(g, x + 3, y - 2, 10, 2, col); R(g, x + 6, y + 3, 8, 1, col);
    }
    for (let k = 0; k < 2; k++) { // helicopters, for the pictures
      const a = f / 18 + k * 3.1, x = Math.round(at + Math.cos(a) * 46), y = Math.round(28 + k * 18 + Math.sin(a * 2) * 3), fwd = Math.sin(a) < 0;
      R(g, x - 2, y, 5, 2, '#20242e'); R(g, x + (fwd ? -4 : 3), y, 2, 1, '#20242e'); R(g, x - 3, y - 1, 7, 1, f % 2 ? '#9aa1ab' : '#cfd4dc');
      if (f % 10 < 5) R(g, x, y + 2, 1, 1, '#ff5a4a');
    }
  };

  A.drawRoom = function (g, env) {
    const L = env.look;
    if (env.scene === 'skyline') { skylineScene(g, env); if (L && L.form === 'man' && L.tieOut > 0 && !env.resting) trail(g, L, env); return; }
    if (env.scene === 'space') { spaceScene(g, env); return; }
    if (env.scene === 'all') { allScene(g, env); return; }
    room(g, env);
    if (L && L.form === 'man' && !env.resting) { if (L.level >= 70 && L.mane > 0) cracks(g, L); if (L.tieOut > 0) trail(g, L, env); }
  };

  A.drawTurkey = function (g, x, y, f) {
    const b = (f >> 3) & 1;
    for (let i = -2; i <= 2; i++) R(g, x - 6 + i, y - 12 - (2 - Math.abs(i)) * 2 + b, 2, 8, i % 2 ? '#c9742c' : '#8a4a22');
    ellipse(g, x, y - 5 + b, 6, 5, '#6e4322'); ellipse(g, x + 1, y - 4 + b, 4, 3, '#8a5a30');
    R(g, x + 4, y - 12 + b, 3, 6, '#6e4322'); R(g, x + 4, y - 14 + b, 4, 3, '#8a5a30'); R(g, x + 8, y - 13 + b, 2, 1, GOLD); R(g, x + 6, y - 11 + b, 2, 3, RED); R(g, x + 6, y - 14 + b, 1, 1, INK);
    R(g, x - 2, y, 1, 3, GOLD_D); R(g, x + 2, y, 1, 3, GOLD_D); R(g, x - 3, y + 2, 3, 1, GOLD_D); R(g, x + 1, y + 2, 3, 1, GOLD_D);
  };

  // He sleeps seen from above, like every pixel hero. The pet is drawn between these two.
  A.BED = { x: 120, y: 96 }; // where his feet go when lying down
  A.drawBed = function (g) {
    R(g, 44, 78, 88, 36, '#3b2210'); R(g, 46, 78, 84, 34, '#5a3419');
    R(g, 44, 76, 7, 38, GOLD); R(g, 44, 76, 7, 2, GOLD_L); R(g, 46, 82, 3, 26, GOLD_D);
    R(g, 51, 80, 78, 30, '#f4f1e6'); R(g, 51, 109, 78, 1, '#d7d2c6');
    R(g, 54, 82, 34, 26, '#ffffff'); R(g, 54, 107, 34, 1, '#d7d2c6'); R(g, 87, 82, 1, 26, '#d7d2c6');
  };
  A.drawBlanket = function (g) {
    R(g, 91, 79, 39, 32, '#a02a3a'); R(g, 91, 79, 3, 32, GOLD); R(g, 94, 79, 1, 32, GOLD_D); R(g, 91, 109, 39, 2, '#7c1726');
    for (let y = 84; y < 108; y += 8) for (let x = 100 + (y % 16 ? 0 : 5); x < 128; x += 10) R(g, x, y, 2, 2, GOLD);
  };

  A.drawGone = function (g, f) {
    R(g, 58, 70, 44, 26, WHITE); R(g, 58, 70, 44, 1, '#d7d2c6'); R(g, 58, 95, 44, 1, '#b9b4a8');
    R(g, 78, 67, 4, 5, RED);
    A.textC(g, 'GONE', 80, 75, INK); A.textC(g, 'GOLFING', 80, 82, INK); A.textC(g, 'SAD!', 80, 89, RED);
    // the golf bag is missing; a single tee remains
    R(g, 120, 104, 1, 4, WHITE); R(g, 119, 103, 3, 1, WHITE);
    if (f % 50 < 25) A.textC(g, 'VERY UNFAIR', 80, 110, GOLD_L);
  };

  // ---------------------------------------------------------------- particles
  A.drawParticle = function (g, p) {
    const x = Math.round(p.x), y = Math.round(p.y);
    switch (p.type) {
      case 'heart': R(g, x, y, 2, 2, '#ff5f8f'); R(g, x + 3, y, 2, 2, '#ff5f8f'); R(g, x, y + 2, 5, 1, '#ff5f8f'); R(g, x + 1, y + 3, 3, 1, '#ff5f8f'); R(g, x + 2, y + 4, 1, 1, '#ff5f8f'); break;
      case 'spark': R(g, x, y - 1, 1, 3, p.c || GOLD_L); R(g, x - 1, y, 3, 1, p.c || GOLD_L); break;
      case 'z': A.text(g, 'Z', x, y, '#cfe0ff'); break;
      case 'note': R(g, x + 2, y, 1, 5, INK); R(g, x, y + 4, 3, 2, INK); R(g, x + 2, y, 3, 1, INK); break;
      case 'coin': ellipse(g, x, y, 2, 2, GOLD); R(g, x, y - 1, 1, 3, GOLD_D); break;
      case 'puff': R(g, x, y, 3, 2, 'rgba(240,240,240,0.8)'); R(g, x + 1, y - 1, 2, 1, 'rgba(240,240,240,0.8)'); break;
      case 'mist': R(g, x, y, 1, 1, '#eaf6ff'); R(g, x + 2, y + 1, 1, 1, '#eaf6ff'); break;
      case 'crumb': R(g, x, y, 1, 1, p.c || '#c98a3c'); break;
      case 'confetti': R(g, x, y, 2, 1, p.c || RED); break;
      case 'anger': R(g, x, y, 1, 3, RED); R(g, x + 2, y, 1, 3, RED); R(g, x - 1, y + 1, 5, 1, RED); break;
      default: break;
    }
  };

  // App icon / favicon: his head on gold. Draws into a square canvas of any size.
  A.drawIcon = function (canvas, level, pad) {
    const g = canvas.getContext('2d');
    const S = canvas.width, unit = 44;
    const tmp = mk(unit, unit), t = tmp.getContext('2d');
    t.imageSmoothingEnabled = false;
    R(t, 0, 0, unit, unit, NAVY);
    for (let y = 0; y < unit; y += 4) for (let x = (y % 8 ? 0 : 2); x < unit; x += 4) R(t, x, y, 1, 1, '#243661');
    A.drawBust(t, 21, 66, A.look(level || 47, {}), 'pout');
    g.imageSmoothingEnabled = false;
    g.fillStyle = GOLD; g.fillRect(0, 0, S, S);
    const m = Math.round(S * (pad == null ? 0.06 : pad));
    g.drawImage(tmp, 0, 0, unit, unit, m, m, S - m * 2, S - m * 2);
  };
})(typeof window !== 'undefined' ? window : globalThis);
