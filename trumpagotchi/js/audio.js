/* Trumpagotchi — sound. A few square-wave blips; no audio files. */
(function (root) {
  'use strict';
  const TG = (root.TG = root.TG || {});
  const S = (TG.audio = { enabled: true });
  let ctx = null;

  function ac() {
    if (!S.enabled) return null;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) { try { ctx = new AC(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    return ctx;
  }
  S.unlock = function () { ac(); };

  function tone(freq, at, dur, type, vol) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, c.currentTime + at);
    g.gain.setValueAtTime(0, c.currentTime + at);
    g.gain.linearRampToValueAtTime(vol || 0.06, c.currentTime + at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + at + dur);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + at); o.stop(c.currentTime + at + dur + 0.02);
  }
  function seq(notes, step, type, vol) { notes.forEach(function (n, i) { if (n) tone(n, i * step, step * 1.6, type, vol); }); }
  function noise(at, dur, vol) {
    const c = ac(); if (!c) return;
    const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(), g = c.createGain();
    src.buffer = buf; g.gain.value = vol || 0.05;
    src.connect(g); g.connect(c.destination); src.start(c.currentTime + at);
  }

  const N = { C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, C6: 1047 };
  const SOUNDS = {
    blip: function (v) { tone(300 + (v || 0) * 40, 0, 0.035, 'square', 0.025); },
    tap: function () { tone(520, 0, 0.05, 'square', 0.04); },
    ok: function () { seq([N.E5, N.G5], 0.07, 'square', 0.05); },
    no: function () { seq([N.E4, N.C4], 0.1, 'sawtooth', 0.04); },
    eat: function () { seq([N.C5, 0, N.C5, 0, N.E5], 0.06, 'square', 0.04); },
    coin: function () { seq([N.B4, N.E5 * 1.5], 0.07, 'square', 0.05); },
    level: function () { seq([N.C5, N.E5, N.G5, N.C6], 0.08, 'square', 0.05); },
    ach: function () { seq([N.G4, N.C5, N.E5, N.G5, N.E5, N.G5], 0.07, 'triangle', 0.08); },
    evolve: function () { seq([N.C4, N.C4, N.G4, N.G4, N.C5, 0, N.E5, N.E5, N.G5, 0, N.C6, N.C6, N.C6], 0.11, 'square', 0.055); },
    sleep: function () { seq([N.G4, N.E4, N.C4], 0.16, 'triangle', 0.06); },
    wake: function () { seq([N.C4, N.E4, N.G4], 0.1, 'triangle', 0.06); },
    spray: function () { noise(0, 0.25, 0.04); },
    crack: function () { noise(0, 0.06, 0.08); tone(180, 0, 0.05, 'square', 0.04); },
    swing: function () { noise(0, 0.09, 0.05); tone(700, 0.05, 0.05, 'triangle', 0.05); },
    cheer: function () { noise(0, 0.12, 0.035); },
    sad: function () { seq([N.E4, N.D4, N.C4], 0.16, 'triangle', 0.05); },
  };
  S.play = function (name, v) {
    if (!S.enabled || !SOUNDS[name]) return;
    try { SOUNDS[name](v); } catch (e) { /* audio is decoration */ }
  };
})(typeof window !== 'undefined' ? window : globalThis);
