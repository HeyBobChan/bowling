// The user's original rules and drawing: drawings/jaffa-dog-and-scooters.jpg.
// Design and tuning notes: design/jaffa.md. ?sim disables only the animation loop.
import * as THREE from 'three';
import './jaffa.css';
import { TILE, HALF_COLS, createDog, createRow, disposeRow } from './jaffa-world.js';
import { ensureAudio, beep, chord, noise, isMuted, toggleMute } from './kit/audio.js';
import { createJaffaMusic } from './jaffa-music.js';
import { loadSketchArtwork, faceDrawing, drawingCanvas } from './jaffa-sketch.js';
import { poseDog, rollWheels, disposeDrawingActor } from './jaffa-motion.js';

async function init() {
await loadSketchArtwork();

const SIM = new URLSearchParams(location.search).has('sim');
const HOP_DURATION = .24, INVULNERABLE_SECONDS = 1.05, RICE_SECONDS = 5;
const DOG_HALF_WIDTH = .8;
const $ = id => document.getElementById(id);
const music = createJaffaMusic();
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xffffff); scene.fog = new THREE.Fog(0xffffff, 34, 79);
const camera = new THREE.OrthographicCamera(-18, 18, 12, -12, .1, 130);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (error) { $('load-error').hidden = false; throw error; }
renderer.setClearColor(0xffffff); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = false; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
renderer.domElement.setAttribute('aria-label', 'Hop through the boulevard using arrow keys or swipe gestures');
$('world').appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0xffffff, 2.6));
const sunlight = new THREE.DirectionalLight(0xffffff, 3.3); sunlight.position.set(-14, 24, 13); sunlight.castShadow = true;
sunlight.shadow.mapSize.set(1024, 1024); sunlight.shadow.camera.left = -22; sunlight.shadow.camera.right = 22; sunlight.shadow.camera.top = 24; sunlight.shadow.camera.bottom = -24; sunlight.shadow.camera.far = 80; sunlight.shadow.normalBias = .04; sunlight.shadow.bias = -.0002;
scene.add(sunlight, sunlight.target);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshLambertMaterial({ color: 0xffffff })); floor.rotation.x = -Math.PI / 2; floor.position.y = -.42; floor.receiveShadow = true; scene.add(floor);
const dog = createDog(); scene.add(dog);
const ring = new THREE.Mesh(new THREE.RingGeometry(.49, .57, 32), new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: .85, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .012; scene.add(ring);
ring.scale.set(DOG_HALF_WIDTH / .57, .38 / .57, 1); ring.renderOrder = 19; ring.material.depthTest = false; ring.material.depthWrite = false;
const impact = new THREE.Group();
const impactMaterial = new THREE.LineBasicMaterial({ color: 0x111111, depthTest: false, transparent: true });
const impactPoints = [];
for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; for (const r of [1.02, 1.3]) impactPoints.push(new THREE.Vector3(Math.cos(a) * r, .65 + Math.sin(a) * r * .7, 0)); }
const impactLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(impactPoints), impactMaterial); impactLines.renderOrder = 21; impact.add(impactLines); impact.visible = false; scene.add(impact);
const bubble = new THREE.Mesh(new THREE.SphereGeometry(.87, 16, 12), new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: .16, wireframe: true })); bubble.visible = false; scene.add(bubble);
const particleGeometry = new THREE.BoxGeometry(.09, .09, .09);
const particleMaterials = [0x222222, 0x777777, 0xaaaaaa].map(color => new THREE.MeshBasicMaterial({ color }));
const particles = Array.from({ length: 30 }, (_, i) => { const mesh = new THREE.Mesh(particleGeometry, particleMaterials[i % 3]); mesh.visible = false; scene.add(mesh); return { mesh, life: 0, vx: 0, vy: 0, vz: 0 }; });
const rows = new Map();
const state = { phase: 'intro', col: 0, row: 0, maxRow: 0, score: 0, bones: 0, rice: 0, hearts: 3, time: 0, shield: 0, invulnerable: 0, hitFreeze: 0, hitFlash: 0, cameraRow: 0, hop: null, queued: null, seed: 7, angle: 0 };
let visualTime = 0, toastTime = 0, cameraX = -4, best = 0, lastWallTime = performance.now(), repeatAt = 0;
const heldKeys = new Map();
try { best = Number(localStorage.getItem('jaffa-best')) || 0; } catch { /* storage is optional */ }

function ensureRows() {
  const from = Math.max(-7, Math.floor(state.maxRow) -7), to = Math.floor(state.maxRow) + 19;
  for (const [index, row] of rows) if (index < from || index > to) {
    disposeRow(row.group); row.hazards.forEach(h => disposeDrawingActor(h.mesh)); row.pickup?.mesh.removeFromParent(); rows.delete(index);
  }
  for (let index = from; index <= to; index++) if (!rows.has(index)) {
    const row = createRow(index, state.seed); rows.set(index, row); scene.add(row.group);
    for (const h of row.hazards) { h.mesh.position.set(h.x, 0, -index * TILE); scene.add(h.mesh); }
    if (row.pickup) { row.pickup.mesh.position.set(row.pickup.col * TILE, .55, -index * TILE); scene.add(row.pickup.mesh); }
  }
}
function clearRows() {
  for (const row of rows.values()) { disposeRow(row.group); row.hazards.forEach(h => disposeDrawingActor(h.mesh)); row.pickup?.mesh.removeFromParent(); }
  rows.clear();
}
function notify(text, duration = 2) { $('toast').textContent = text; $('toast').classList.add('show'); toastTime = duration; }
function updateHud() {
  $('score').textContent = String(state.score).padStart(3, '0'); $('bones').textContent = state.bones; $('rice').textContent = state.rice;
  [...$('lives').children].forEach((heart, i) => heart.classList.toggle('lost', i >= state.hearts)); $('lives').setAttribute('aria-label', `${state.hearts} chances remaining`);
  $('lives').classList.toggle('hurt', state.hitFlash > 0);
  $('shield').hidden = state.shield <= 0; if (state.shield > 0) $('shield-time').textContent = `${Math.ceil(state.shield)}s`;
}
function paintSound() { $('sound').textContent = isMuted() ? '♪̸' : '♫'; $('sound').setAttribute('aria-pressed', String(isMuted())); $('sound').setAttribute('aria-label', isMuted() ? 'Enable sound' : 'Mute sound'); }
function burst(x, z) {
  let index = 0; for (const p of particles) {
    if (p.life > 0) continue;
    p.life = .55 + Math.random() * .25; p.mesh.visible = true; p.mesh.position.set(x, .6, z);
    const angle = index / 10 * Math.PI * 2; p.vx = Math.cos(angle) * 1.9; p.vz = Math.sin(angle) * 1.9; p.vy = 2.1 + Math.random();
    if (++index === 10) break;
  }
}
function collect() {
  const pickup = rows.get(state.row)?.pickup;
  if (!pickup || pickup.col !== state.col || pickup.collected) return;
  pickup.collected = true; pickup.mesh.visible = false; burst(state.col * TILE, -state.row * TILE);
  if (pickup.kind === 'rice') {
    state.rice++; state.score += 50; state.shield = RICE_SECONDS; notify('Rice power! +50 & 5 seconds of protection', 2.4);
    chord([293.66, 311.13, 369.99, 440, 587.33], .055, .16, 'triangle', .07);
  } else { state.bones++; state.score += 10; notify('Good dog! +10', 1.1); chord([587.33, 739.99, 880], .045, .12, 'sine', .08); }
}
function startGame() {
  clearRows();
  Object.assign(state, { phase: 'playing', col: 0, row: 0, maxRow: 0, score: 0, bones: 0, rice: 0, hearts: 3, time: 0, shield: 0, invulnerable: 0, hitFreeze: 0, hitFlash: 0, cameraRow: 0, hop: null, queued: null, angle: 0 });
  heldKeys.clear(); repeatAt = 0; dog.position.set(0, 0, 0); dog.rotation.set(0, 0, 0); dog.visible = true; dog.scale.setScalar(1);
  poseDog(dog); faceDrawing(dog, -1); impact.visible = false;
  particles.forEach(p => { p.life = 0; p.mesh.visible = false; });
  ensureRows(); $('intro').hidden = true; $('shade').hidden = true; $('modal').hidden = true; $('pause').disabled = false;
  document.body.classList.add('playing'); ensureAudio(); music.start(); updateHud(); notify('Follow the bones. Watch both ways!', 3);
  $('start').blur(); $('again').blur(); updateCamera();
}
function endGame() {
  state.phase = 'over'; state.queued = null; heldKeys.clear(); music.stop(); $('pause').disabled = true;
  best = Math.max(best, state.score); try { localStorage.setItem('jaffa-best', String(best)); } catch { /* optional */ }
  $('result-tag').textContent = 'GOOD RUN, LITTLE DOG'; $('result-title').textContent = 'One more hop?'; $('result-copy').textContent = `${state.maxRow} streets hopped. There are more bones around the corner.`;
  $('final-score').textContent = state.score; $('best-score').textContent = best; $('result-stats').hidden = false;
  $('again').innerHTML = 'LET’S GO AGAIN <span aria-hidden="true">↗</span>'; $('modal').hidden = false; $('again').focus({ preventScroll: true });
}
function hit() {
  if (state.phase !== 'playing' || state.invulnerable > 0 || state.shield > 0) return;
  state.hearts--; state.invulnerable = INVULNERABLE_SECONDS; state.hitFreeze = .12; state.hitFlash = .48; state.queued = null;
  impact.visible = true; impact.position.copy(dog.position); impactMaterial.opacity = 1;
  noise(.12, 450, .13); beep(150, 0, .15, 'triangle', .14, 65);
  if (state.hearts <= 0) endGame(); else notify(`Ouch! One heart lost. ${state.hearts} ${state.hearts === 1 ? 'chance' : 'chances'} left.`, 1.5);
  updateHud();
}
const directions = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };
function hop(direction) {
  if (state.phase !== 'playing' || !directions[direction]) return false;
  if (state.hop) { state.queued = direction; return false; }
  const [dx, dz] = directions[direction], col = state.col + dx, row = state.row + dz;
  if (Math.abs(col) > HALF_COLS || row < Math.max(0, state.maxRow -6)) return false;
  if (rows.get(row)?.blocked.has(col)) { if (toastTime < .2) notify('A shady spot — hop around the tree.', 1.2); return false; }
  state.hop = { fromCol: state.col, fromRow: state.row, col, row, t: 0 };
  state.angle = Math.atan2(-dx, dz); beep(250 + Math.random() * 35, 0, .05, 'sine', .028, 380); return true;
}
function pause() {
  if (state.phase !== 'playing') return;
  state.phase = 'paused'; state.queued = null; heldKeys.clear(); music.stop();
  $('result-tag').textContent = 'A MOMENT IN THE SHADE'; $('result-title').textContent = 'Take a breather.';
  $('result-copy').textContent = 'Your dog is waiting right here.'; $('result-stats').hidden = true;
  $('again').innerHTML = 'KEEP HOPPING <span aria-hidden="true">↗</span>'; $('modal').hidden = false; $('again').focus({ preventScroll: true });
  $('pause').setAttribute('aria-label', 'Resume game'); $('pause').textContent = '▷';
}
function resume() {
  if (state.phase !== 'paused') return;
  state.phase = 'playing'; $('modal').hidden = true; music.start(); $('pause').setAttribute('aria-label', 'Pause game'); $('pause').textContent = 'Ⅱ'; $('again').blur();
}
function advance(dt) {
  const live = state.phase === 'playing', ambient = state.phase === 'intro';
  if (!live && !ambient) return;
  if (live && state.hitFreeze > 0) { state.hitFreeze = Math.max(0, state.hitFreeze -dt); return; }
  visualTime += dt;
  if (live) {
    state.time += dt; state.shield = Math.max(0, state.shield -dt); state.invulnerable = Math.max(0, state.invulnerable -dt); state.hitFlash = Math.max(0, state.hitFlash -dt);
    if (heldKeys.size && state.time >= repeatAt) { hop([...heldKeys.values()].at(-1)); repeatAt = state.time + HOP_DURATION + .035; }
    const h = state.hop;
    if (h) {
      h.t += dt; const t = Math.min(h.t / HOP_DURATION, 1);
      const flight = THREE.MathUtils.clamp((t -.14) / .7, 0, 1), ease = flight * flight * (3 -2 * flight);
      dog.position.set(THREE.MathUtils.lerp(h.fromCol, h.col, ease) * TILE, Math.sin(flight * Math.PI) * .48, -THREE.MathUtils.lerp(h.fromRow, h.row, ease) * TILE);
      if (t === 1) {
        state.col = h.col; state.row = h.row; state.hop = null;
        if (state.row > state.maxRow) { state.score += state.row -state.maxRow; state.maxRow = state.row; ensureRows(); }
        collect();
        if (state.queued) { const next = state.queued; state.queued = null; hop(next); }
      }
    } else dog.position.set(state.col * TILE, Math.sin(visualTime * 3) * .012, -state.row * TILE);
    state.cameraRow += (state.row -state.cameraRow) * Math.min(1, dt * 5);
  }
  for (const row of rows.values()) {
    for (const hazard of row.hazards) {
      const travel = hazard.dir * hazard.speed * dt;
      hazard.previousX = hazard.x; hazard.x += travel;
      rollWheels(hazard.mesh, travel);
      if (hazard.x > 13) hazard.x = -13; if (hazard.x < -13) hazard.x = 13;
      hazard.mesh.position.x = hazard.x;
      if (live && Math.abs(dog.position.z + row.index * TILE) < .48 && Math.abs(dog.position.x -hazard.x) < hazard.halfWidth + DOG_HALF_WIDTH) hit();
    }
    if (row.pickup && !row.pickup.collected) { row.pickup.mesh.position.y = .64 + Math.sin(visualTime * 3 + row.index) * .1; row.pickup.mesh.rotation.y = Math.sin(visualTime * 1.5 + row.index) * .4; }
  }
  if (state.hop && state.hop.col !== state.hop.fromCol) faceDrawing(dog, state.hop.col -state.hop.fromCol);
  const progress = state.hop ? Math.min(state.hop.t / HOP_DURATION, 1) : 0;
  poseDog(dog, state.hop ? THREE.MathUtils.clamp((progress -.14) / .7, 0, 1) : 0);
  const crouch = state.hop ? progress < .14 ? Math.sin(progress / .14 * Math.PI) : progress > .84 ? Math.sin((progress -.84) / .16 * Math.PI) : 0 : 0;
  dog.scale.set(1 + crouch * .035, 1 -crouch * .08, 1);
  const lean = state.hop ? ((state.hop.col -state.hop.fromCol) || (state.hop.row -state.hop.fromRow) * dog.userData.facing) * Math.sin(progress * Math.PI) : 0;
  dog.userData.sprite.material.rotation = -.045 * lean + (state.hitFlash > 0 ? Math.sin(state.hitFlash * 45) * .045 : 0);
  // Keep the player visible throughout immunity; the outline and pulse explain it.
  dog.visible = true; dog.userData.sprite.material.opacity = state.invulnerable > 0 ? .65 + .35 * Math.abs(Math.cos(visualTime * 12)) : 1;
  impact.visible = state.hitFlash > 0; impact.position.copy(dog.position); impactMaterial.opacity = Math.min(1, state.hitFlash * 4);
  ring.position.set(dog.position.x, .014, dog.position.z); ring.material.color.setHex(state.shield > 0 ? 0x111111 : 0x777777);
  bubble.visible = state.shield > 0; bubble.position.copy(dog.position); bubble.position.y += .58; bubble.rotation.y += dt;
  for (const p of particles) if (p.life > 0) {
    p.life -= dt; p.mesh.visible = p.life > 0; p.vy -= dt * 7; p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt; p.mesh.rotation.x += dt * 5; p.mesh.scale.setScalar(Math.min(1, p.life * 4));
  }
  if (toastTime > 0) { toastTime -= dt; if (toastTime <= 0) $('toast').classList.remove('show'); }
}
function updateCamera(dt = 1) {
  if (state.phase === 'paused' || state.phase === 'over') return;
  const portrait = innerWidth < 700; const menu = state.phase === 'intro';
  const targetX = menu ? (portrait ? 0 : -5.5) : dog.position.x * (portrait ? .9 : .25);
  cameraX += (targetX -cameraX) * Math.min(1, dt * 6);
  const z = -state.cameraRow * TILE + (menu && portrait ? 2.4 : -3.2);
  const target = new THREE.Vector3(cameraX, 0, z);
  // A straight-on oblique view keeps each road horizontal, matching the drawing.
  camera.position.copy(target).add(new THREE.Vector3(0, 18, 21)); camera.lookAt(target);
  sunlight.position.set(-14, 24, -state.cameraRow * TILE + 13); sunlight.target.position.set(0, 0, -state.cameraRow * TILE);
  floor.position.z = -state.cameraRow * TILE;
}
function step(dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  let remaining = Math.min(dt, .25);
  while (remaining > .00001) { const tick = Math.min(remaining, 1 / 120); advance(tick); remaining -= tick; }
  updateCamera(dt); updateHud();
}
function render() { renderer.render(scene, camera); }
function resize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight);
  const aspect = innerWidth / innerHeight;
  const halfHeight = aspect < .85 ? 15.2 : 10.7;
  camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect; camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix(); updateCamera(); render();
}

const keyDirections = { ArrowUp: 'up', KeyW: 'up', Space: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
window.addEventListener('keydown', e => {
  if (e.target instanceof Element && e.target.closest('a,input,textarea,select')) return;
  if (e.code === 'Tab' && !$('modal').hidden) { e.preventDefault(); $('again').focus(); return; }
  // Native keyboard activation belongs to focused buttons (sound, pause, start).
  if ((e.code === 'Space' || e.code === 'Enter') && e.target instanceof HTMLButtonElement) return;
  if (e.code === 'KeyM' && !e.repeat) { e.preventDefault(); $('sound').click(); return; }
  if (['KeyP', 'Escape'].includes(e.code) && !e.repeat) { e.preventDefault(); state.phase === 'paused' ? resume() : pause(); return; }
  if (['Space', 'Enter'].includes(e.code) && state.phase !== 'playing') {
    e.preventDefault(); if (e.repeat) return; state.phase === 'paused' ? resume() : startGame(); return;
  }
  const dir = keyDirections[e.code]; if (!dir) return; e.preventDefault();
  if (state.phase !== 'playing' || e.repeat) return;
  heldKeys.set(e.code, dir); hop(dir); repeatAt = state.time + .3;
});
window.addEventListener('keyup', e => heldKeys.delete(e.code));
window.addEventListener('blur', () => { heldKeys.clear(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('resize', resize);
$('start').addEventListener('click', startGame); $('again').addEventListener('click', () => state.phase === 'paused' ? resume() : startGame());
$('pause').addEventListener('click', () => state.phase === 'paused' ? resume() : pause());
$('sound').addEventListener('click', () => { ensureAudio(); toggleMute(); music.syncMute(); paintSound(); });
for (const button of document.querySelectorAll('[data-dir]')) button.addEventListener('pointerdown', e => { e.preventDefault(); hop(button.dataset.dir); });
let pointer = null;
renderer.domElement.addEventListener('pointerdown', e => { if (state.phase !== 'playing') return; pointer = { id: e.pointerId, x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointerup', e => {
  if (!pointer || pointer.id !== e.pointerId) return;
  const dx = e.clientX -pointer.x, dy = e.clientY -pointer.y; pointer = null;
  if (Math.hypot(dx, dy) < 18) hop('up'); else if (Math.abs(dx) > Math.abs(dy)) hop(dx > 0 ? 'right' : 'left'); else hop(dy > 0 ? 'down' : 'up');
});
renderer.domElement.addEventListener('pointercancel', () => { pointer = null; });
renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); pause(); $('load-error').hidden = false; });
renderer.domElement.addEventListener('webglcontextrestored', () => { $('load-error').hidden = true; render(); });
window.addEventListener('pagehide', () => music.stop());
for (const [kind, selector] of [['bone', '.bone-icon'], ['rice', '.rice-icon']]) {
  const art = drawingCanvas(kind);
  for (const element of document.querySelectorAll(selector)) {
    const icon = document.createElement('canvas'); icon.width = art.width; icon.height = art.height;
    icon.getContext('2d').drawImage(art, 0, 0); element.replaceChildren(icon);
  }
}
ensureRows(); paintSound(); updateHud(); resize();
window.__jaffa = { state, rows, step, render, startGame, hop, pause, resume, ensureRows, renderer, scene, dog, ring, impact, music, camera, constants: { HOP_DURATION, INVULNERABLE_SECONDS, RICE_SECONDS, TILE, DOG_HALF_WIDTH } };
if (!SIM) {
  const frame = now => { const dt = Math.min((now -lastWallTime) / 1000, .05); lastWallTime = now; step(dt); render(); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
}

}
init().catch(error => {
  const panel = document.getElementById('load-error'); panel.hidden = false;
  panel.querySelector('p').textContent = error.message;
  console.error(error);
});
