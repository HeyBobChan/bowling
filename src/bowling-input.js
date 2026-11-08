import { createInput } from './kit/input.js';
import './bowling.css';

// Bowling follows each part of a finger stroke; the other games keep their stick.
export function createBowlingInput({ canRoll }) {
  const input = createInput({ touch: false });
  let pending = [];
  let gesture = null;
  let nextStroke = 0;
  const firePointers = new Set();
  const forceTouch = new URLSearchParams(location.search).has('touch');
  const hasTouch = forceTouch || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const movementKeys = ['up', 'down', 'left', 'right'].flatMap((action) => input.p1.map[action]);

  input.rolling = false;
  input.contactId = null;
  input.consumeRolls = () => { const rolls = pending; pending = []; return rolls; };
  input.resetRolling = () => { input.rolling = false; pending = []; };
  if (!hasTouch) return input;

  document.body.classList.add('bowling-swipe-controls');
  const root = document.createElement('div');
  root.id = 'bowling-touch';
  root.innerHTML = '<div class="roll-guide" aria-hidden="true"><div class="roll-arrow"></div></div>'
    + '<div class="roll-hint" dir="rtl">מזיזים כדי לגלגל · עוצרים אצבע כדי לבלום · מרימים כדי לשחרר</div>'
    + '<button class="roll-fire" type="button" aria-label="ירי כדור">🔴</button>';
  document.body.appendChild(root);
  const guide = root.querySelector('.roll-guide');
  const arrow = root.querySelector('.roll-arrow');
  const fire = root.querySelector('.roll-fire');
  input.touch = { root };

  function cancelGesture(discardPending = false) {
    const id = gesture?.id;
    if (discardPending && gesture) pending = pending.filter((roll) => roll.stroke !== gesture.stroke);
    gesture = null;
    input.contactId = null;
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
    gesture = { id: e.pointerId, stroke: ++nextStroke, x: e.clientX, y: e.clientY, time: e.timeStamp, active: false, direction: null, directionDistance: 0 };
    input.contactId = gesture.stroke;
    guide.style.left = `${e.clientX}px`;
    guide.style.top = `${e.clientY}px`;
    arrow.style.width = '0px';
    arrow.hidden = true;
    guide.classList.add('visible');
    try { root.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  });

  function moveFinger(e) {
    if (e.pointerId !== gesture?.id) return;
    if (!canRoll()) { cancelGesture(true); return; }
    const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
    const distance = Math.hypot(dx, dy);
    // A small starting threshold rejects taps/jitter. After that, accumulate
    // tiny samples until they form a useful movement instead of losing them.
    if (distance < (gesture.active ? 2 : 8)) return;
    const duration = Math.max(1, e.timeStamp - gesture.time);
    const direction = { x: dx / distance, y: dy / distance };
    if (!gesture.direction || direction.x * gesture.direction.x + direction.y * gesture.direction.y < 0.5) {
      gesture.direction = direction;
      gesture.directionDistance = 0;
    }
    gesture.directionDistance += distance;
    const fullStroke = Math.max(90, Math.min(160, Math.min(innerWidth, innerHeight) * 0.3));
    const quickness = Math.min(1, distance / duration);
    // Power is proportional to NEW travel, with no per-event minimum bonus:
    // the same movement stays consistent across touch sampling rates.
    const power = distance / fullStroke * 15 * (0.7 + 0.3 * quickness);
    pending.push({
      x: direction.x * power, z: direction.y * power, stroke: gesture.stroke,
      canReverse: gesture.directionDistance >= fullStroke * 0.45 && quickness >= 0.35,
    });
    input.rolling = true;
    gesture.x = e.clientX; gesture.y = e.clientY; gesture.time = e.timeStamp;
    gesture.active = true;
    guide.style.left = `${e.clientX}px`;
    guide.style.top = `${e.clientY}px`;
    arrow.hidden = false;
    arrow.style.width = `${20 + quickness * 55}px`;
    arrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  }
  root.addEventListener('pointermove', moveFinger);
  root.addEventListener('pointerup', (e) => {
    if (e.pointerId !== gesture?.id) return;
    moveFinger(e); // include only a final, previously unseen movement, never a launch
    cancelGesture();
  });
  for (const type of ['pointercancel', 'lostpointercapture']) {
    root.addEventListener(type, (e) => { if (e.pointerId === gesture?.id) cancelGesture(true); });
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
