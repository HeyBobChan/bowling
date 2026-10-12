import manifest from '../../games.json';
import { ensureAudio, toggleMute, isMuted, music } from './audio.js';

// Set by vite.config.js: ARTIFACT=1 builds link to the published artifacts instead
// of local pages (the games are each published as a single-file artifact).
const useArtifactLinks = typeof __ARTIFACT__ !== 'undefined' && __ARTIFACT__;

// The DOM side of a game: badges, the centre flash, overlays, cross-links, mute.
// Every element is plain HTML in the page; this just knows how to drive it.
export function createHud(app, { gameId, music: musicOpts = null } = {}) {
  const game = manifest.games.find((g) => g.id === gameId);
  if (game) {
    document.documentElement.style.setProperty('--accent', game.accent);
    document.documentElement.style.setProperty('--accent-dark', game.accentDark);
  }
  const $ = (sel) => (typeof sel === 'string' ? document.querySelector(sel) : sel);
  let msgTimer = null;
  const popTimers = new Map();

  const hud = {
    game,
    flash(text, { bad = false, good = false, dur = 1000, el = '#msg' } = {}) {
      const m = $(el);
      if (!m) return;
      m.textContent = text;
      m.classList.toggle('bad', bad);
      m.classList.toggle('good', good);
      m.classList.add('show');
      clearTimeout(msgTimer);
      msgTimer = setTimeout(() => m.classList.remove('show'), dur);
    },
    set(sel, text) {
      const e = $(sel);
      if (e && e.textContent !== text) e.textContent = text;
    },
    pop(sel) {
      const e = $(sel);
      if (!e) return;
      e.classList.add('pop');
      clearTimeout(popTimers.get(e));
      popTimers.set(e, setTimeout(() => e.classList.remove('pop'), 140));
    },
    show(sel) { $(sel)?.classList.remove('hidden'); },
    hide(sel) { $(sel)?.classList.add('hidden'); },
    visible(sel) { const e = $(sel); return !!e && !e.classList.contains('hidden'); },
    overlayOpen() { return !!document.querySelector('.overlay:not(.hidden)'); },

    // Wire overlay buttons to actions. A button's action is its data-action, or
    // 'start' / 'restart' for the two classic ids. Enter and Space press the first
    // button of whichever overlay is open, so the keyboard alone runs the whole flow.
    bind(actions) {
      document.querySelectorAll('.overlay button').forEach((btn) => {
        const act = btn.dataset.action || (btn.id === 'startBtn' ? 'start' : btn.id === 'restartBtn' ? 'restart' : null);
        if (!act || !actions[act]) return;
        btn.addEventListener('click', () => { ensureAudio(); actions[act](btn); });
      });
      window.addEventListener('keydown', (e) => {
        if (e.code !== 'Enter' && e.code !== 'Space') return;
        if (e.target instanceof Element && e.target.closest('a')) return;
        const open = document.querySelector('.overlay:not(.hidden)');
        if (!open) return;
        e.preventDefault();
        if (e.repeat) return;
        open.querySelector('button')?.click();
      });
    },
    startMusic() { if (musicOpts) music.start(musicOpts); },
    stopMusic() { music.stop(); },

    // "more games" links come from games.json, never from hand-edited HTML; an artifact can
    // only link to the games that have been published as artifacts
    renderLinks() {
      const others = manifest.games.filter((g) => g.id !== gameId && (!useArtifactLinks || g.artifact));
      document.querySelectorAll('.other-game').forEach((el) => {
        el.innerHTML = 'עוד משחקים: ' + others
          .map((g) => `<a href="${useArtifactLinks ? g.artifact : g.path}" style="color:${g.accent}">${g.emoji} ${g.short}</a>`)
          .join(' · ');
      });
    },
    muteButton() {
      const b = document.createElement('div');
      b.id = 'mute';
      b.className = 'hud';
      b.title = 'קול';
      const paint = () => { b.textContent = isMuted() ? '🔇' : '🔊'; };
      paint();
      b.addEventListener('click', () => { ensureAudio(); toggleMute(); paint(); });
      document.body.appendChild(b);
      return b;
    },
    // remember the best score for this game; returns the new best
    best(key, value) {
      let best = value;
      try {
        best = Math.max(parseFloat(localStorage.getItem(key) || '0') || 0, value);
        localStorage.setItem(key, String(best));
      } catch { /* private mode */ }
      return best;
    },
  };
  hud.renderLinks();
  hud.muteButton();
  return hud;
}
