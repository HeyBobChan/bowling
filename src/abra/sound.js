// Every letter has a note, so every word has a tune: typing is playing, and a child's
// name sounds like nothing else. Weather is filtered noise. Built on the kit's audio
// (same context, same mute switch as every other game on the site).
import { ensureAudio, audioReady, output, isMuted } from '../kit/audio.js';

const ORDER = 'אבגדהוזחטיכלמנסעפצקרשת';
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];      // two octaves of a major pentatonic
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
export function noteOf(ch) {
  const i = ORDER.indexOf(FINALS[ch] || ch);
  if (i < 0) { const c = ch.toLowerCase().charCodeAt(0); return midi(60 + SCALE[(c || 0) % SCALE.length]); }
  return midi(57 + SCALE[i % SCALE.length] + (i >= 11 ? 0 : 0));
}

let ctx = null, bus = null, noiseBuf = null;
const beds = {};
function ready() {
  if (!audioReady()) return false;
  if (!ctx) {
    ctx = ensureAudio(); if (!ctx) return false;
    bus = ctx.createGain(); bus.gain.value = 0.9; bus.connect(output());
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return true;
}
export const wake = () => { ensureAudio(); ready(); };

// A soft plucked tone: a triangle with a quiet octave on top, like a thumb piano.
function pluck(freq, when = 0, vol = 0.1, dur = 0.5) {
  if (!ready()) return;
  const at = ctx.currentTime + when;
  for (const [mult, v, type] of [[1, vol, 'triangle'], [2, vol * 0.28, 'sine']]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq * mult;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(bus); o.start(at); o.stop(at + dur + 0.05);
  }
}
function hiss(freq, when, dur, vol, q = 1, type = 'bandpass') {
  if (!ready()) return;
  const at = ctx.currentTime + when;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + Math.min(0.03, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(bus); src.start(at, Math.random()); src.stop(at + dur + 0.05);
}
// A continuous bed of noise whose loudness follows the weather.
function bed(name, freq, q, type) {
  if (!ready()) return null;
  if (!beds[name]) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(bus); src.start();
    beds[name] = { g, f };
  }
  return beds[name];
}

export const sfx = {
  key(ch) { pluck(noteOf(ch), 0, 0.09, 0.42); },
  erase() { hiss(1800, 0, 0.06, 0.03, 2); },
  scratch() { hiss(3200 + Math.random() * 1500, 0, 0.035, 0.012, 3); },
  // the word's own tune, quick, then a shimmer as the letters land
  cast(word) {
    const letters = [...word.replace(/\s+/g, '')].slice(0, 12);
    letters.forEach((ch, i) => pluck(noteOf(ch), i * 0.075, 0.1, 0.5));
    const end = letters.length * 0.075;
    for (let i = 0; i < 5; i++) pluck(midi(84 + SCALE[(i * 2) % 5]), end + 0.25 + i * 0.07, 0.035, 0.5);
  },
  tune(word, vol = 0.07) { [...word.replace(/\s+/g, '')].slice(0, 10).forEach((ch, i) => pluck(noteOf(ch), i * 0.085, vol, 0.4)); },
  pop() { pluck(midi(76 + Math.floor(Math.random() * 5) * 2), 0, 0.05, 0.18); },
  thud() { if (!ready()) return; hiss(140, 0, 0.12, 0.08, 1, 'lowpass'); },
  nope() { pluck(midi(52), 0, 0.08, 0.25); pluck(midi(50), 0.12, 0.08, 0.3); },
  munch() { for (let i = 0; i < 3; i++) hiss(900, i * 0.11, 0.07, 0.07, 2); },
  boom() { hiss(90, 0, 0.9, 0.4, 0.7, 'lowpass'); hiss(600, 0, 0.25, 0.12, 0.6); },
  thunder() { hiss(70, 0.05, 1.8, 0.4, 0.5, 'lowpass'); hiss(300, 0, 0.2, 0.1, 0.5); },
  sparkle() { for (let i = 0; i < 9; i++) pluck(midi(72 + SCALE[i % SCALE.length]), i * 0.06, 0.045, 0.7); },
  harp(up = true) { for (let i = 0; i < 12; i++) pluck(midi(55 + SCALE[up ? i % 11 : 10 - (i % 11)] + (i > 10 ? 12 : 0)), i * 0.075, 0.06, 1.2); },
  dawn() { [48, 55, 60, 64, 67, 72].forEach((n, i) => pluck(midi(n), i * 0.16, 0.08, 3.2)); },
  dusk() { [69, 64, 60, 57, 52, 45].forEach((n, i) => pluck(midi(n), i * 0.2, 0.06, 2.6)); },
  birthday() { const m = [60, 60, 62, 60, 65, 64, 60, 60, 62, 60, 67, 65]; const d = [0.3, 0.15, 0.45, 0.45, 0.45, 0.8, 0.3, 0.15, 0.45, 0.45, 0.45, 0.8]; let t = 0; m.forEach((n, i) => { pluck(midi(n + 12), t, 0.09, d[i] + 0.25); t += d[i]; }); },
  song(words) { let t = 0; for (const w of words.slice(-8)) { [...w.replace(/\s+/g, '')].slice(0, 6).forEach((ch) => { pluck(noteOf(ch), t, 0.07, 0.5); t += 0.19; }); t += 0.19; } },
  laugh() { for (let i = 0; i < 6; i++) pluck(midi(79 - i * 2 + (i % 2) * 5), i * 0.09, 0.05, 0.15); },
  // weather beds: call every frame with the current strengths
  weather({ rain = 0, wind = 0, sea = 0, night = 0 }) {
    if (!ready() || isMuted()) return;
    const t = ctx.currentTime;
    const set = (name, freq, q, type, level) => { if (level < 0.005 && !beds[name]) return; const b = bed(name, freq, q, type); if (b) b.g.gain.setTargetAtTime(level, t, 0.25); };
    set('rain', 5200, 0.6, 'highpass', rain * 0.05);
    set('wind', 420, 1.2, 'bandpass', Math.abs(wind) * 0.12);
    set('sea', 520, 0.5, 'lowpass', sea * (0.035 + 0.02 * Math.sin(t * 0.7)));
    if (night > 0.6 && Math.random() < 0.012) { const base = 4300 + Math.random() * 500; for (let i = 0; i < 3; i++) hiss(base, i * 0.07, 0.05, 0.012 * night, 28); }
  },
  hush() { if (!ctx) return; for (const b of Object.values(beds)) b.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1); },
};
