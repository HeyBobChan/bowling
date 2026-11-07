import { createInput } from './kit/input.js';
import './bowling.css';

// Bowling opts into flicks; the other games keep the shared floating stick.
export function createBowlingInput({ canRoll }) {
  const input = createInput({ touch: false });
  let pending = [];
  let gesture = null;
  const firePointers = new Set();
  const forceTouch = new URLSearchParams(location.search).has('touch');
  const hasTouch = forceTouch || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const movementKeys = ['up', 'down', 'left', 'right'].flatMap((action) => input.p1.map[action]);

  input.rolling = false;
  input.consumeRolls = () => { const rolls = pending; pending = []; return rolls; };
  input.resetRolling = () => { input.rolling = false; pending = []; };
  if (!hasTouch) return input;

  document.body.classList.add('bowling-swipe-controls');
  const root = document.createElement('div');
  root.id = 'bowling-touch';
  root.innerHTML = '<div class="roll-guide" aria-hidden="true"><div class="roll-arrow"></div></div>'
    + '<div class="roll-hint" dir="rtl">מחליקים כדי לגלגל · מחליקים הפוך כדי לבלום</div>'
    + '<button class="roll-fire" type="button" aria-label="ירי כדור">🔴</button>';
  document.body.appendChild(root);
  const guide = root.querySelector('.roll-guide');
  const arrow = root.querySelector('.roll-arrow');
  const fire = root.querySelector('.roll-fire');
  input.touch = { root };

  function cancelGesture() {
    const id = gesture?.id;
    gesture = null;
    guide.classList.remove('visible');
    if (id !== undefined && root.hasPointerCapture(id)) root.releasePointerCapture(id);
  }

  function cancelTouches() {
    pending = [];
    cancelGesture();
    input.p1.touchDown.a = false;
    input.p1.pressed.a = false;
    for (const id of firePointers) if (fire.hasPointerCapture(id)) fire.releasePointerCapture(id);
    firePointers.clear();
    fire.classList.remove('on');
  }
  input.resetRolling = () => {
    input.rolling = false;
    cancelTouches();
  };
  const endFrame = input.endFrame;
  input.endFrame = () => { endFrame(); pending = []; };

  root.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.roll-fire') || gesture || !canRoll()) return;
    if (!forceTouch && e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (movementKeys.some((code) => input.keys.has(code))) return;
    e.preventDefault();
    gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, time: e.timeStamp };
    guide.style.left = `${e.clientX}px`;
    guide.style.top = `${e.clientY}px`;
    arrow.style.width = '0px';
    guide.classList.add('visible');
    try { root.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  });

  root.addEventListener('pointermove', (e) => {
    if (e.pointerId !== gesture?.id) return;
    if (!canRoll()) { cancelGesture(); return; }
    const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
    arrow.style.width = `${Math.min(180, Math.hypot(dx, dy))}px`;
    arrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  });

  root.addEventListener('pointerup', (e) => {
    if (e.pointerId !== gesture?.id) return;
    const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
    const distance = Math.hypot(dx, dy);
    const duration = Math.max(40, e.timeStamp - gesture.time);
    if (canRoll() && distance >= 18 && !movementKeys.some((code) => input.keys.has(code))) {
      // CSS pixels keep power consistent across pixel densities. Scale the full
      // stroke to the smaller screen dimension so a phone needs only a thumb flick.
      const fullStroke = Math.max(90, Math.min(160, Math.min(innerWidth, innerHeight) * 0.3));
      const reach = Math.min(1, distance / fullStroke);
      const quickness = Math.min(1, distance / duration);
      const power = 4 + 15 * reach * (0.7 + 0.3 * quickness);
      pending.push({ x: dx / distance * power, z: dy / distance * power, canReverse: power >= 10 });
      input.rolling = true;
    }
    cancelGesture();
  });
  for (const type of ['pointercancel', 'lostpointercapture']) {
    root.addEventListener(type, (e) => { if (e.pointerId === gesture?.id) cancelGesture(); });
  }

  fire.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!canRoll()) return;
    firePointers.add(e.pointerId);
    input.p1.touchDown.a = true;
    input.p1.pressed.a = true;
    fire.classList.add('on');
    try { fire.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  });
  const releaseFire = (e) => {
    firePointers.delete(e.pointerId);
    input.p1.touchDown.a = firePointers.size > 0;
    fire.classList.toggle('on', input.p1.touchDown.a);
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) fire.addEventListener(type, releaseFire);
  // Assistive activation and keyboard clicks may have no pointer press at all.
  fire.addEventListener('click', (e) => {
    if (e.detail === 0 && canRoll()) input.p1.pressed.a = true;
  });

  // A hardware keyboard always returns to the original acceleration and braking.
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof Element && e.target.closest('a')) return;
    if (movementKeys.includes(e.code)) {
      input.rolling = false;
      pending = [];
      cancelGesture();
    }
  });
  window.addEventListener('blur', input.resetRolling);
  window.addEventListener('resize', cancelTouches);
  document.addEventListener('visibilitychange', () => { if (document.hidden) input.resetRolling(); });
  return input;
}
