// Tiny WebAudio kit: beeps, noise bursts, a master mute that survives reloads, and a
// gentle generative music box. Nothing here loads an asset — kids' games shouldn't
// wait on downloads, and every sound is a few lines the next game can reuse.

let ctx = null;
let master = null;
let muted = false;
try { muted = localStorage.getItem('marker-muted') === '1'; } catch { /* private mode */ }

// Call from a user gesture (the start button). Safe to call repeatedly.
export function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
export const audioReady = () => !!ctx;
// The master gain, for pages that build their own sounds but must obey the same mute.
export const output = () => master;
export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('marker-muted', m ? '1' : '0'); } catch { /* ignore */ }
  if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
  return muted;
}
export const toggleMute = () => setMuted(!muted);

export function beep(freq, t0 = 0, dur = 0.1, type = 'square', vol = 0.12, slideTo = 0) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const at = ctx.currentTime + t0;
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  o.connect(g).connect(master);
  o.start(at);
  o.stop(at + dur + 0.05);
}

let noiseBuf = null;
export function noise(dur = 0.1, freq = 1000, vol = 0.1, t0 = 0, q = 1) {
  if (!ctx) return;
  if (!noiseBuf) { // one second of white noise, reused by every burst
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ctx.createGain();
  const at = ctx.currentTime + t0;
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(at);
  src.stop(at + dur + 0.05);
}

// A quick arpeggio: fanfares, jingles.
export function chord(freqs, gap = 0.08, dur = 0.22, type = 'square', vol = 0.12) {
  freqs.forEach((f, i) => beep(f, i * gap, dur, type, vol));
}

// ---------- Generative music: a soft pentatonic music box over a two-note bass ----------
// `music.start({ seed, bpm })` gives each game its own tune from the same tiny sequencer.
const PENTA = [0, 2, 4, 7, 9];
const hashf = (i, s) => {
  let h = Math.imul(i + 1, 0x27d4eb2d) ^ Math.imul(s + 11, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const ms = { timer: null, step: 0, nextT: 0, seed: 1, bpm: 100, vol: 0.045, root: 60, melodyIx: 7, gain: null };

function note(freq, at, dur, type, vol) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(ms.gain);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function schedule() {
  if (!ctx || !ms.gain) return;
  const stepDur = 60 / ms.bpm / 4; // sixteenth notes
  while (ms.nextT < ctx.currentTime + 0.25) {
    const s = ms.step;
    const bar = Math.floor(s / 16) % 4;
    const chordRoot = [0, 9, 5, 7][bar]; // I  vi  IV  V
    const beat = s % 16;
    if (beat === 0) note(midi(ms.root - 24 + chordRoot), ms.nextT, stepDur * 3.5, 'triangle', ms.vol * 1.3);
    if (beat === 8) note(midi(ms.root - 24 + chordRoot + 7), ms.nextT, stepDur * 3.5, 'triangle', ms.vol * 1.1);
    // melody: a random walk on the pentatonic scale, always landing on the downbeats
    if (hashf(s, ms.seed) < 0.5 || beat % 4 === 0) {
      const dir = hashf(s * 7 + 3, ms.seed) < 0.5 ? -1 : 1;
      const jump = hashf(s * 13 + 5, ms.seed) < 0.15 ? 2 : 1;
      ms.melodyIx = Math.max(0, Math.min(PENTA.length * 2 - 1, ms.melodyIx + dir * jump));
      const deg = PENTA[ms.melodyIx % PENTA.length] + 12 * Math.floor(ms.melodyIx / PENTA.length);
      note(midi(ms.root + deg), ms.nextT, stepDur * 1.8, 'sine', ms.vol);
    }
    if (beat % 4 === 2) noise(0.03, 6000, ms.vol * 0.5, ms.nextT - ctx.currentTime, 2); // soft tick
    ms.nextT += stepDur;
    ms.step++;
  }
}

export const music = {
  get playing() { return !!ms.timer; },
  start({ seed = 1, bpm = 100, vol = 0.045, root = 60 } = {}) {
    if (!ensureAudio()) return;
    music.stop(0.05);
    Object.assign(ms, { seed, bpm, vol, root, step: 0, melodyIx: 7, nextT: ctx.currentTime + 0.1 });
    ms.gain = ctx.createGain();
    ms.gain.gain.value = 1;
    ms.gain.connect(master);
    ms.timer = setInterval(schedule, 90);
    schedule();
  },
  stop(fade = 0.5) {
    if (ms.timer) clearInterval(ms.timer);
    ms.timer = null;
    if (ms.gain && ctx) {
      const g = ms.gain;
      g.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      setTimeout(() => g.disconnect(), fade * 1000 + 150);
      ms.gain = null;
    }
  },
};
