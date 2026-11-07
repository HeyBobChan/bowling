// Original Arabic-inspired music: D Hijaz pitch collection, plucked harmonics,
// a D/A drone and a sixteen-step darbuka-inspired rhythm. No sampled recording.
import { ensureAudio, isMuted } from './kit/audio.js';
const MELODY = [0, null, 1, 4, 5, null, 4, 1, 0, null, -5, null, 0, 1, 4, null,
  7, null, 8, 7, 5, 4, 1, null, 4, 5, 4, 1, 0, null, null, null,
  12, null, 10, 8, 7, null, 5, 4, 5, null, 7, 5, 4, 1, 0, null,
  -5, null, 0, 1, 4, null, 5, 4, 1, null, 4, 1, 0, null, null, null];
const frequency = n => 440 * 2 ** ((n - 69) / 12);
export function createJaffaMusic() {
  let ctx, gain, buffer, timer = null, next = 0, step = 0;
  const active = new Set();
  function track(source, nodes) {
    active.add(source); source.onended = () => { active.delete(source); source.disconnect(); nodes.forEach(n => n.disconnect()); };
  }
  function pluck(midi, at, volume = .065, duration = .48) {
    for (const [partial, level] of [[1, 1], [2, .4], [3, .18], [4, .08]]) {
      const osc = ctx.createOscillator(), env = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = frequency(midi) * partial;
      env.gain.setValueAtTime(.0001, at); env.gain.exponentialRampToValueAtTime(volume * level, at + .004);
      env.gain.exponentialRampToValueAtTime(.0001, at + duration / Math.sqrt(partial));
      osc.connect(env).connect(gain); track(osc, [env]); osc.start(at); osc.stop(at + duration + .01);
    }
  }
  function drum(at, low) {
    if (low) {
      const osc = ctx.createOscillator(), env = ctx.createGain(); osc.frequency.setValueAtTime(145, at); osc.frequency.exponentialRampToValueAtTime(55, at + .16);
      env.gain.setValueAtTime(.12, at); env.gain.exponentialRampToValueAtTime(.0001, at + .22);
      osc.connect(env).connect(gain); track(osc, [env]); osc.start(at); osc.stop(at + .24);
    } else {
      const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), env = ctx.createGain(); src.buffer = buffer;
      filter.type = 'bandpass'; filter.frequency.value = 1900; filter.Q.value = 2.2;
      env.gain.setValueAtTime(.075, at); env.gain.exponentialRampToValueAtTime(.0001, at + .07);
      src.connect(filter).connect(env).connect(gain); track(src, [filter, env]); src.start(at); src.stop(at + .08);
    }
  }
  function schedule() {
    if (ctx.state !== 'running') { next = ctx.currentTime + .03; return; }
    while (next < ctx.currentTime + .12) {
      const beat = step % 16;
      if ([0, 8].includes(beat)) drum(next, true);
      if ([2, 6, 10, 14].includes(beat)) drum(next, false);
      if (step % 2 === 0) {
        const note = MELODY[Math.floor(step / 2) % MELODY.length];
        if (note !== null) pluck(62 + note, next);
      }
      if (beat === 0 || beat === 8) pluck(beat === 0 ? 38 : 45, next, .045, .8);
      if (beat === 15 && step % 32 === 31) pluck(63, next, .035, .14);
      step++; next += 60 / 108 / 4;
    }
  }
  return {
    get playing() { return timer !== null; },
    get activeVoices() { return active.size; },
    start() {
      if (timer !== null) return;
      ctx = ensureAudio(); if (!ctx) return;
      if (!gain) {
        gain = ctx.createGain(); gain.connect(ctx.destination);
        buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .1), ctx.sampleRate);
        const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 -1;
      }
      gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setTargetAtTime(isMuted() ? 0 : .7, ctx.currentTime, .03);
      next = ctx.currentTime + .03; step = 0; timer = setInterval(schedule, 50); schedule();
    },
    syncMute() { if (gain) gain.gain.setTargetAtTime(isMuted() ? 0 : .7, ctx.currentTime, .025); },
    stop() {
      if (timer !== null) clearInterval(timer); timer = null;
      if (gain) { gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setTargetAtTime(0, ctx.currentTime, .015); }
      for (const source of active) { try { source.stop(ctx.currentTime + .06); } catch { /* already ended */ } }
    },
  };
}
