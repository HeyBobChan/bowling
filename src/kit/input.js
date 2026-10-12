// Keyboard + touch input for one or two players, with edge-triggered actions.
//
//   1 player:   move = arrows or WASD · A = Space / Enter · B = Shift
//   2 players:  P1 = arrows, A = Enter, B = right Shift
//               P2 = WASD,   A = Space, B = left Shift
//   touch:      left half of the screen = floating stick, right side = A / B buttons
//
// Games read `axis()` every frame and `consume('a')` for one-shot actions (jump, punch);
// `down('a')` is for held actions (auto-fire). Presses made while an overlay is open are
// swallowed so Space/Enter can start the game without also firing the first shot.

const MAPS = {
  solo: { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], a: ['Space', 'Enter'], b: ['ShiftLeft', 'ShiftRight'] },
  p1: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], a: ['Enter'], b: ['ShiftRight'] },
  p2: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], a: ['Space'], b: ['ShiftLeft'] },
};
const GAME_KEYS = new Set(Object.values(MAPS).flatMap((m) => Object.values(m).flat()));
const overlayOpen = () => !!document.querySelector('.overlay:not(.hidden)');

export function createInput({ twoPlayer = false, touch = 'auto' } = {}) {
  const keys = new Set();
  const has = (codes) => codes.some((c) => keys.has(c));

  function makePlayer(map, enabled) {
    const p = {
      map, enabled,
      pressed: { a: false, b: false },
      touchAxis: null,
      touchDown: { a: false, b: false },
      axis(out = { x: 0, z: 0 }) {
        let x = (has(p.map.right) ? 1 : 0) - (has(p.map.left) ? 1 : 0);
        let z = (has(p.map.down) ? 1 : 0) - (has(p.map.up) ? 1 : 0);
        if (x === 0 && z === 0 && p.touchAxis) { x = p.touchAxis.x; z = p.touchAxis.z; }
        const len = Math.hypot(x, z);
        if (len > 1) { x /= len; z /= len; }
        out.x = x; out.z = z;
        return out;
      },
      down(action) { return has(p.map[action]) || p.touchDown[action]; },
      consume(action) { const v = p.pressed[action]; p.pressed[action] = false; return v; },
    };
    return p;
  }
  const players = [makePlayer(twoPlayer ? MAPS.p1 : MAPS.solo, true), makePlayer(MAPS.p2, twoPlayer)];

  window.addEventListener('keydown', (e) => {
    // Let navigation links keep their native keyboard behavior.
    if (e.target instanceof Element && e.target.closest('a')) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (overlayOpen()) return; // overlays own Enter / Space
    for (const p of players) {
      if (!p.enabled) continue;
      for (const act of ['a', 'b']) if (p.map[act].includes(e.code)) p.pressed[act] = true;
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    for (const p of players) { p.pressed.a = p.pressed.b = false; p.touchDown.a = p.touchDown.b = false; }
  });

  const input = {
    keys,
    players,
    p(n) { return players[n - 1]; },
    get p1() { return players[0]; },
    get p2() { return players[1]; },
    get twoPlayer() { return players[1].enabled; },
    setTwoPlayer(on) {
      players[0].map = on ? MAPS.p1 : MAPS.solo;
      players[1].enabled = on;
    },
    // called by the app loop after update(): one-shot presses live for exactly one frame
    endFrame() { for (const p of players) { p.pressed.a = false; p.pressed.b = false; } },
    touch: null,
  };

  const q = new URLSearchParams(location.search);
  const wantsTouch = touch === true
    || (touch === 'auto' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0 || q.has('touch')));
  if (wantsTouch) input.touch = buildTouch(players[0]);
  return input;
}

function buildTouch(p) {
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = '<div class="stick"><div class="knob"></div></div><div class="tbtn a">A</div><div class="tbtn b">B</div>';
  document.body.appendChild(root);
  const stick = root.querySelector('.stick');
  const knob = root.querySelector('.knob');
  const btnA = root.querySelector('.tbtn.a');
  const btnB = root.querySelector('.tbtn.b');
  const R = 55;
  let stickId = null;
  let origin = null;

  root.addEventListener('pointerdown', (e) => {
    if (e.target === btnA || e.target === btnB || stickId !== null) return;
    stickId = e.pointerId;
    origin = { x: e.clientX, y: e.clientY };
    stick.style.display = 'block';
    stick.style.left = origin.x + 'px';
    stick.style.top = origin.y + 'px';
    knob.style.transform = 'translate(-50%, -50%)';
    p.touchAxis = { x: 0, z: 0 };
    try { root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  root.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId || !p.touchAxis) return;
    let dx = e.clientX - origin.x, dy = e.clientY - origin.y;
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, len / R);
    dx = (dx / len) * k; dy = (dy / len) * k;
    p.touchAxis.x = dx; p.touchAxis.z = dy; // screen-down is +z (toward the camera), like ArrowDown
    knob.style.transform = `translate(calc(-50% + ${dx * R}px), calc(-50% + ${dy * R}px))`;
  });
  const endStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    p.touchAxis = null;
    stick.style.display = 'none';
  };
  root.addEventListener('pointerup', endStick);
  root.addEventListener('pointercancel', endStick);

  for (const [btn, act] of [[btnA, 'a'], [btnB, 'b']]) {
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      btn.classList.add('on');
      p.touchDown[act] = true;
      if (!overlayOpen()) p.pressed[act] = true;
    });
    const up = () => { btn.classList.remove('on'); p.touchDown[act] = false; };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }

  return {
    root,
    // per-game glyphs; pass b: '' to hide the second button
    setLabels({ a, b } = {}) {
      if (a !== undefined) btnA.textContent = a;
      if (b !== undefined) { btnB.textContent = b; btnB.style.display = b ? '' : 'none'; }
    },
  };
}
