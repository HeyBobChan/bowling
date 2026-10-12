import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createApp } from './kit/app.js';
import { toonMat, noOutline, blobShadow, instancedHull, starTexture, clamp, smooth } from './kit/toon.js';
import { createInput } from './kit/input.js';
import { createHud } from './kit/hud.js';
import { beep, noise, chord } from './kit/audio.js';
import { PALETTE } from './characters/common.js';
import { buildCat } from './characters/cat.js';
import { buildKing } from './characters/king.js';
import { buildQueen } from './characters/queen.js';
import { buildEmperor } from './characters/emperor.js';
import { buildMohawk } from './characters/mohawk.js';

// The kid's spec: forest arena, five fighters, everyone punches everyone, space = punch,
// last one standing wins. We are the green cat head (drawings/punch-fighters-1.webp);
// the other four are on drawings/punch-fighters-2.webp. New since the review: the forest
// comes for YOU (you're the boss fight), a dash, waves, a score — and a second cat.

const ARENA_R = 20;          // where fighters can roam
const WALL_R = 22.5;         // invisible physics fence
const GRAVITY = -22;         // snappy cartoon gravity
const HIT_STUN = 0.38;
const HIT_INVULN = 0.75;
const HIT_INVULN_PLAYER = 1.05; // kids get a longer breather between hits
const PUNCH_ARC = 0.25;      // cos of the hit half-angle — generous, ~75°
const AIM_ASSIST = 0.8;      // extra reach when snapping a player toward a target
const STRETCH = 3.9;         // how far the cat's elastic arm extends (× arm length)
const TREE_BONK_SPEED = 9;   // fly this fast into a trunk => extra damage
const DASH_T = 0.18;
const DASH_SPEED = 24;
const DASH_SPEED_NPC = 15;
const DASH_CD = 1.1;
const DASH_INVULN = 0.32;
const WAVE_HEAL = 2;

const SPECS = {
  // the cats fight with STRETCH punches — their drawing's comically long arms shoot out like elastic
  cat:     { key: 'cat',     name: 'החתול הירוק', emoji: '🐱', fall: 'נפל',  hearts: 8, dmg: 1, speed: 7.5, reach: 4.3,  cd: 0.45, density: 1.15, style: 'stretch', build: () => buildCat() },
  cat2:    { key: 'cat2',    name: 'החתול הכחול', emoji: '🐈', fall: 'נפל',  hearts: 8, dmg: 1, speed: 7.5, reach: 4.3,  cd: 0.45, density: 1.15, style: 'stretch', build: () => buildCat({ fill: PALETTE.catBlue }) },
  king:    { key: 'king',    name: 'המלך',        emoji: '👑', fall: 'נפל',  hearts: 6, dmg: 1, speed: 4.6, reach: 1.7,  cd: 1.2,  density: 1.0,  build: buildKing },
  queen:   { key: 'queen',   name: 'המלכה',       emoji: '👸', fall: 'נפלה', hearts: 5, dmg: 1, speed: 5.8, reach: 1.65, cd: 1.6,  density: 0.95, build: buildQueen },
  emperor: { key: 'emperor', name: 'הקיסר',       emoji: '🟣', fall: 'נפל',  hearts: 8, dmg: 2, speed: 3.1, reach: 2.2,  cd: 2.3,  density: 1.1,  build: buildEmperor },
  mohawk:  { key: 'mohawk',  name: 'היצור',       emoji: '⚡', fall: 'נפל',  hearts: 5, dmg: 1, speed: 6.0, reach: 1.5,  cd: 0.85, density: 1.0,  build: buildMohawk },
};
const NPC_KEYS = ['king', 'queen', 'emperor', 'mohawk'];
const SPAWNS = { cat: [0, 8], cat2: [-9.5, 2], king: [-7, -6], queen: [7, -6], emperor: [0, -11], mohawk: [9.5, 2] };

// ---------- Deterministic hash noise (scenery placement) ----------
const SEED = 20260813;
function rnd(i, j = 0) {
  let h = Math.imul(i + 1, 0x27d4eb2d) ^ Math.imul(j + 13, 0x165667b1) ^ Math.imul(SEED, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------- App ----------
const app = createApp({
  background: 0xf3efe2, fog: { density: 0.02 }, fov: 50, far: 120,
  outline: { thickness: 0.0065, color: PALETTE.ink },
  hemi: { sky: 0xfff6e0, ground: 0xcfe0c0, intensity: 1.25 },
  sun: { color: 0xfff2d9, intensity: 1.0, position: [6, 14, 5] },
});
const { scene, camera, juice } = app;
camera.position.set(0, 9, 18);
const input = createInput();
app.input = input;
const hud = createHud(app, { gameId: 'punch', music: { seed: 4, bpm: 108, root: 57 } });
if (input.touch) input.touch.setLabels({ a: '🥊', b: '💨' });

// ---------- Forest floor ----------
scene.add(new THREE.Mesh(new THREE.CircleGeometry(30, 40).rotateX(-Math.PI / 2), noOutline(toonMat(0xe9eeda))));
for (let i = 0; i < 26; i++) {
  const r = 2 + rnd(i, 1) * 24;
  const a = rnd(i, 2) * Math.PI * 2;
  const patch = new THREE.Mesh(new THREE.CircleGeometry(0.8 + rnd(i, 3) * 2.2, 9).rotateX(-Math.PI / 2), noOutline(toonMat(i % 2 ? 0xdfe7cc : 0xe2e9d2)));
  patch.position.set(Math.cos(a) * r, 0.012 + i * 0.0004, Math.sin(a) * r);
  patch.rotation.y = rnd(i, 4) * Math.PI;
  patch.scale.x = 0.7 + rnd(i, 5) * 0.7;
  scene.add(patch);
}

// ---------- Swaying grass (the signature shader — marker strokes in the wind) ----------
const uTime = { value: 0 };
{
  const GRASS_N = 320;
  const blade = new THREE.ConeGeometry(0.055, 0.42, 5);
  blade.translate(0, 0.21, 0);
  const grassMat = noOutline(toonMat(PALETTE.grassGreen, { unique: true }));
  grassMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = ('uniform float uTime;\n' + sh.vertexShader).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = float(gl_InstanceID) * 1.73;
        transformed.x += sin(uTime * 2.1 + ph) * transformed.y * 0.38;
        transformed.z += cos(uTime * 1.7 + ph * 1.3) * transformed.y * 0.22;
      #endif`,
    );
  };
  const grass = new THREE.InstancedMesh(blade, grassMat, GRASS_N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  for (let i = 0; i < GRASS_N; i++) {
    const cluster = Math.floor(i / 3);
    const r = 2.5 + rnd(cluster, 10) * 20.5;
    const a = rnd(cluster, 11) * Math.PI * 2;
    const x = Math.cos(a) * r + (rnd(i, 12) - 0.5) * 0.5;
    const z = Math.sin(a) * r + (rnd(i, 13) - 0.5) * 0.5;
    e.set((rnd(i, 14) - 0.5) * 0.35, rnd(i, 15) * Math.PI, (rnd(i, 16) - 0.5) * 0.35);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 0.7 + rnd(i, 17) * 0.9, 1));
    grass.setMatrixAt(i, m);
    grass.setColorAt(i, c.setHex(i % 3 === 0 ? 0x2e8b3e : i % 3 === 1 ? 0x4ea24e : 0x62b04f));
  }
  scene.add(grass);
}

// ---------- Trees (instanced, shakeable, hull-outlined) ----------
const trees = [];
const treeParts = [];
const treeHulls = [];
{
  const positions = [];
  let attempts = 0, placed = 0;
  while (placed < 24 && attempts < 400) {
    attempts++;
    const r = 5 + rnd(attempts, 20) * 14;
    const a = rnd(attempts, 21) * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (positions.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 3.6 ** 2)) continue;
    if (Object.values(SPAWNS).some(([sx, sz]) => (sx - x) ** 2 + (sz - z) ** 2 < 3.2 ** 2)) continue;
    positions.push({ x, z, interior: true });
    placed++;
  }
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + rnd(i, 22) * 0.12;
    const r = 23.5 + rnd(i, 23) * 2.5;
    positions.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, interior: false });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.46, 3.4, 7);
  trunkGeo.translate(0, 1.7, 0);
  const canopyGeo = new THREE.IcosahedronGeometry(1.5, 1);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, toonMat(0x8a5a34, { unique: true }), positions.length);
  const canopyMesh = new THREE.InstancedMesh(canopyGeo, toonMat(0x4ea24e, { unique: true }), positions.length);
  const topMesh = new THREE.InstancedMesh(canopyGeo, toonMat(0x62b04f, { unique: true }), positions.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  const canopyColors = [0x3e9e4f, 0x4ea24e, 0x2e8b3e, 0x5cb85f];
  positions.forEach((p, i) => {
    const s = 0.85 + rnd(i, 24) * 0.5;
    const a1 = 1 + rnd(i, 25) * 0.3, a2 = 0.9 + rnd(i, 26) * 0.3;
    const bx = (rnd(i, 27) - 0.5) * 0.6;
    trees.push({ x: p.x, z: p.z, s, a1, a2, bx, shake: 0, duck: 0, want: 0, interior: p.interior });
    m.makeScale(s, s, s).setPosition(p.x, 0, p.z);
    trunkMesh.setMatrixAt(i, m);
    m.makeScale(s * a1, s * a2, s).setPosition(p.x, 3.6 * s, p.z);
    canopyMesh.setMatrixAt(i, m);
    canopyMesh.setColorAt(i, c.setHex(canopyColors[i % 4]));
    m.makeScale(s * 0.62, s * 0.6, s * 0.62).setPosition(p.x + bx, 4.7 * s, p.z);
    topMesh.setMatrixAt(i, m);
    topMesh.setColorAt(i, c.setHex(canopyColors[(i + 2) % 4]));
  });
  treeParts.push(trunkMesh, canopyMesh, topMesh);
  scene.add(trunkMesh, canopyMesh, topMesh);
  for (const part of treeParts) {
    const hull = instancedHull(part, { color: PALETTE.ink, thickness: 0.05 });
    treeHulls.push(hull);
    scene.add(hull);
  }
}
function shakeTree(idx) {
  trees[idx].shake = 0.7;
  for (let k = 0; k < 5; k++) spawnLeaf(trees[idx].x, 3.4 * trees[idx].s, trees[idx].z);
}
// Trees shake when someone is knocked into them — and DUCK (squash their canopy down)
// when they'd block the camera's view of any fighter, so the action never hides.
const _tm = new THREE.Matrix4(), _tq = new THREE.Quaternion(), _te = new THREE.Euler(), _tv = new THREE.Vector3(), _ts = new THREE.Vector3();
function updateTrees(dt) {
  const cx = camera.position.x, cz = camera.position.z;
  for (const t of trees) t.want = 0;
  for (const f of fighters) {
    if (f.removed) continue;
    const p = f.body.translation();
    const ax = p.x - cx, az = p.z - cz;
    const len2 = ax * ax + az * az || 1;
    for (const t of trees) {
      if (t.want) continue;
      const k = ((t.x - cx) * ax + (t.z - cz) * az) / len2;
      if (k < 0.15 || k > 0.96) continue;
      const px = cx + ax * k - t.x, pz = cz + az * k - t.z;
      const r = 2.0 * t.s;
      if (px * px + pz * pz < r * r) t.want = 1;
    }
  }
  let dirty = false;
  trees.forEach((t, i) => {
    const before = t.duck;
    t.duck += (t.want - t.duck) * Math.min(1, dt * 5);
    if (t.duck < 0.004 && !t.want) t.duck = 0;
    if (t.shake > 0) t.shake = Math.max(0, t.shake - dt);
    if (t.shake <= 0 && t.duck === 0 && before === 0) return;
    dirty = true;
    const w = t.shake > 0 ? Math.sin(uTime.value * 34 + i) * 0.05 * t.shake : 0;
    _te.set(w, 0, w * 0.8);
    _tq.setFromEuler(_te);
    const d = t.duck, s = t.s;
    _tm.compose(_tv.set(t.x, 0, t.z), _tq, _ts.set(s, s, s));
    treeParts[0].setMatrixAt(i, _tm);
    _tm.compose(_tv.set(t.x, (3.6 - 2.0 * d) * s, t.z), _tq, _ts.set(s * t.a1 * (1 - 0.2 * d), s * t.a2 * (1 - 0.72 * d), s * (1 - 0.2 * d)));
    treeParts[1].setMatrixAt(i, _tm);
    _tm.compose(_tv.set(t.x + t.bx, (4.7 - 3.0 * d) * s, t.z), _tq, _ts.set(s * 0.62 * (1 - 0.25 * d), s * 0.6 * (1 - 0.78 * d), s * 0.62 * (1 - 0.25 * d)));
    treeParts[2].setMatrixAt(i, _tm);
  });
  if (dirty) treeParts.forEach((p) => { p.instanceMatrix.needsUpdate = true; });
}

// ---------- FX pools ----------
const starTex = starTexture();
const stars = [];
for (let i = 0; i < 10; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false }));
  s.visible = false;
  scene.add(s);
  stars.push({ s, life: 0, big: false });
}
function spawnStar(pos, big = false) {
  const st = stars.find((x) => x.life <= 0);
  if (!st) return;
  st.life = 0.28;
  st.big = big;
  st.s.position.copy(pos);
  st.s.material.rotation = Math.random() * Math.PI;
  st.s.visible = true;
}
const arcs = [];
{
  const geo = new THREE.RingGeometry(0.55, 0.8, 14, 1, 0, 2.0);
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(geo, noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })));
    mesh.visible = false;
    scene.add(mesh);
    arcs.push({ mesh, life: 0 });
  }
}
function spawnArc(pos, yaw) {
  const a = arcs.find((x) => x.life <= 0);
  if (!a) return;
  a.life = 0.16;
  a.mesh.position.copy(pos);
  a.mesh.rotation.order = 'YXZ';
  a.mesh.rotation.set(-Math.PI / 2.6, yaw, -1.0);
  a.mesh.visible = true;
}
const leaves = [];
{
  const geo = new THREE.CircleGeometry(0.11, 3);
  for (let i = 0; i < 40; i++) {
    const mesh = new THREE.Mesh(geo, noOutline(new THREE.MeshBasicMaterial({ color: i % 2 ? 0x4ea24e : 0x2e8b3e, transparent: true, side: THREE.DoubleSide, depthWrite: false })));
    mesh.visible = false;
    scene.add(mesh);
    leaves.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0 });
  }
}
function spawnLeaf(x, y, z) {
  const l = leaves.find((v) => v.life <= 0);
  if (!l) return;
  l.life = 1.1 + Math.random() * 0.5;
  l.mesh.position.set(x + (Math.random() - 0.5) * 1.6, y + Math.random() * 1.2, z + (Math.random() - 0.5) * 1.6);
  l.vx = (Math.random() - 0.5) * 1.4; l.vy = -1.6 - Math.random(); l.vz = (Math.random() - 0.5) * 1.4;
  l.mesh.visible = true;
}
const poofTex = (() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 96;
  const ctx = cv.getContext('2d');
  ctx.beginPath(); ctx.arc(48, 48, 34, 0, Math.PI * 2);
  ctx.fillStyle = '#f6f1e4'; ctx.strokeStyle = '#2a2118'; ctx.lineWidth = 5;
  ctx.fill(); ctx.stroke();
  return new THREE.CanvasTexture(cv);
})();
const poofs = [];
for (let i = 0; i < 18; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: poofTex, transparent: true, depthWrite: false }));
  s.visible = false;
  scene.add(s);
  poofs.push({ s, life: 0, vx: 0, vy: 0, vz: 0 });
}
function spawnPoof(pos, n = 6) {
  for (let k = 0; k < n; k++) {
    const p = poofs.find((x) => x.life <= 0);
    if (!p) return;
    p.life = 0.55;
    p.s.position.copy(pos);
    const a = (k / n) * Math.PI * 2;
    p.vx = Math.cos(a) * 2.4; p.vy = 1.5 + Math.random(); p.vz = Math.sin(a) * 2.4;
    p.s.visible = true;
  }
}
function updateFX(dt) {
  stars.forEach((st) => {
    if (st.life <= 0) return;
    st.life -= dt;
    const k = 1 - st.life / 0.28;
    st.s.scale.setScalar((st.big ? 2.2 : 1.4) * (0.5 + k * 1.2));
    st.s.material.opacity = 1 - k;
    if (st.life <= 0) st.s.visible = false;
  });
  arcs.forEach((a) => {
    if (a.life <= 0) return;
    a.life -= dt;
    const k = 1 - a.life / 0.16;
    a.mesh.scale.setScalar(0.7 + k * 1.1);
    a.mesh.material.opacity = 0.9 * (1 - k);
    if (a.life <= 0) a.mesh.visible = false;
  });
  leaves.forEach((l) => {
    if (l.life <= 0) return;
    l.life -= dt;
    l.mesh.position.x += (l.vx + Math.sin(l.life * 9)) * dt;
    l.mesh.position.y += l.vy * dt;
    l.mesh.position.z += l.vz * dt;
    l.mesh.rotation.x += dt * 5; l.mesh.rotation.y += dt * 7;
    l.mesh.material.opacity = Math.min(1, l.life);
    if (l.life <= 0 || l.mesh.position.y < 0.05) { l.life = 0; l.mesh.visible = false; }
  });
  poofs.forEach((p) => {
    if (p.life <= 0) return;
    p.life -= dt;
    const k = 1 - p.life / 0.55;
    p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
    p.s.scale.setScalar(0.5 + k * 1.6);
    p.s.material.opacity = 0.95 * (1 - k);
    if (p.life <= 0) p.s.visible = false;
  });
}

// ---------- Audio ----------
const whooshSound = () => { noise(0.09, 1600, 0.09); beep(320, 0, 0.05, 'triangle', 0.05, 190); };
const boingSound = () => { beep(190, 0, 0.16, 'triangle', 0.13, 820); noise(0.07, 1900, 0.05); };
const dashSound = () => { noise(0.14, 900, 0.12); beep(500, 0, 0.12, 'sine', 0.07, 1400); };
const thudSound = () => { beep(130, 0, 0.09, 'square', 0.18); beep(72, 0.03, 0.12, 'square', 0.15); noise(0.1, 420, 0.16); };
const bonkSound = () => { beep(95, 0, 0.16, 'square', 0.2, 58); noise(0.14, 260, 0.2); };
const koSound = () => { chord([430, 300, 200, 120], 0.09, 0.13, 'sawtooth', 0.13); noise(0.4, 500, 0.12, 0.1); };
const waveSound = () => chord([392, 494, 587, 784], 0.1, 0.2, 'triangle', 0.13);
const loseSound = () => chord([330, 262, 208, 156], 0.16, 0.3, 'sawtooth', 0.11);
const startSound = () => { beep(660, 0, 0.09, 'square', 0.12); beep(880, 0.12, 0.14, 'square', 0.12); };

// ---------- Match state ----------
const fighters = [];
let world = null;
const match = { state: 'intro', twoPlayer: false, wave: 1, score: 0, waveT: 0, kos: 0 };
const fightersEl = document.getElementById('fighters');
const V3 = new THREE.Vector3();
const _axis = { x: 0, z: 0 };

function setScore(delta = 0, at = null) {
  match.score += delta;
  hud.set('#score', `ניקוד: ${match.score}`);
  if (delta) {
    hud.pop('#score');
    if (at) juice.pop(at, `+${delta}`, { color: delta >= 100 ? '#b8321f' : '#4a3ab8', size: delta >= 100 ? 36 : 26 });
  }
}
function announce(text, good = false) { hud.flash(text, { good, bad: !good, dur: 1500 }); }

// ---------- Physics ----------
function setupPhysics() {
  world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.createCollider(RAPIER.ColliderDesc.cuboid(40, 0.5, 40).setTranslation(0, -0.5, 0).setFriction(0.6));
  const segs = 16;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const half = WALL_R * Math.tan(Math.PI / segs) + 0.6;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(half, 4, 0.4)
        .setTranslation(Math.cos(a) * WALL_R, 4, Math.sin(a) * WALL_R)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
    );
  }
  trees.forEach((t) => {
    if (!t.interior) return;
    world.createCollider(RAPIER.ColliderDesc.cylinder(1.9, 0.42 * t.s).setTranslation(t.x, 1.9, t.z));
  });
}

// ---------- Fighters ----------
// A wave contains at most one of each fighter, and its knockouts leave the scene
// before the next wave spawns. Keep those six render graphs for the page lifetime:
// rebuilding them leaked GPU geometry and grew OutlineEffect's per-mesh/material
// caches on every wave/restart. Physics bodies and match state are still fresh.
const fighterModels = new Map();
function getFighterModel(spec) {
  if (!fighterModels.has(spec.key)) {
    const built = spec.build();
    const centerY = Math.max(1.0, built.height * 0.82) / 2;
    const pivot = new THREE.Group();
    built.group.position.y = -centerY;
    pivot.add(built.group);
    const shadow = blobShadow(built.radius * 0.85, { color: 0x2a2118, opacity: 0.14 });
    const restPose = [];
    // Include inner idle-animation groups, stretched arms/fists, and the outer
    // knockout pivot so an interrupted punch or fall cannot survive a restart.
    pivot.traverse((object) => restPose.push({
      object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(),
    }));
    fighterModels.set(spec.key, { built, pivot, shadow, restPose });
  }
  const model = fighterModels.get(spec.key);
  for (const pose of model.restPose) {
    pose.object.position.copy(pose.position);
    pose.object.quaternion.copy(pose.quaternion);
    pose.object.scale.copy(pose.scale);
  }
  model.shadow.position.set(0, 0.02, 0);
  model.shadow.scale.setScalar(model.built.radius * 0.85);
  model.shadow.material.opacity = 0.14;
  return model;
}

function makeFighter(spec, { player = 0, wave = 1 } = {}) {
  const { built, pivot, shadow } = getFighterModel(spec);
  const capTotal = Math.max(1.0, built.height * 0.82);
  const capR = Math.min(built.radius * 0.8, capTotal * 0.32);
  const cylHalf = Math.max(0.05, capTotal / 2 - capR);
  const centerY = capTotal / 2;

  scene.add(pivot);
  scene.add(shadow);

  const [sx, sz] = SPAWNS[spec.key];
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(sx, centerY + 0.05, sz).lockRotations().setLinearDamping(1.0).setCcdEnabled(true),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(cylHalf, capR).setDensity(spec.density).setFriction(0.25).setRestitution(0.2),
    body,
  );

  const card = document.createElement('div');
  card.className = 'card' + (player === 1 ? ' me' : player === 2 ? ' me2' : '');
  card.innerHTML = `<div>${spec.emoji} ${spec.name}</div><div class="hearts"></div>`;
  fightersEl.appendChild(card);

  // waves make the forest tougher: more hearts, a bit faster
  const maxHearts = spec.hearts + (player ? 0 : wave - 1);
  const f = {
    spec, built, pivot, shadow, body, collider, centerY, card,
    maxHearts, hearts: maxHearts,
    speed: spec.speed * (player ? 1 : 1 + 0.08 * (wave - 1)),
    alive: true, removed: false,
    isPlayer: !!player, player,
    yaw: Math.atan2(-sx, -sz), targetYaw: undefined,
    hitstun: 0, invuln: 0, punchCd: 0, punch: null, punchArmToggle: false,
    dash: 0, dashCd: 0, dashDir: { x: 0, z: 1 },
    lastHitBy: null, koTimer: 0,
    ai: { target: null, think: rnd(spec.key.length, 40) * 0.5, dashThink: 2 + rnd(spec.key.length, 41) * 2 },
  };
  updateCard(f);
  spawnPoof(new THREE.Vector3(sx, centerY, sz), 5);
  return f;
}
function updateCard(f) {
  const el = f.card.querySelector('.hearts');
  el.textContent = '❤️'.repeat(Math.max(0, f.hearts)) + '🤍'.repeat(Math.max(0, f.maxHearts - Math.max(0, f.hearts)));
  if (!f.alive) f.card.classList.add('dead');
  else {
    f.card.classList.add('hit');
    setTimeout(() => f.card.classList.remove('hit'), 140);
  }
}
function removeFighter(f) {
  if (!f.removed && f.body) world.removeRigidBody(f.body);
  scene.remove(f.pivot);
  scene.remove(f.shadow);
  f.card.remove();
  f.removed = true;
}
const players = () => fighters.filter((f) => f.isPlayer);
const npcs = () => fighters.filter((f) => !f.isPlayer);

function spawnWave(wave) {
  for (const key of NPC_KEYS) fighters.push(makeFighter(SPECS[key], { wave }));
}

// ---------- Match flow ----------
function teardownMatch() {
  for (const f of fighters) removeFighter(f);
  fighters.length = 0;
  if (world) { world.free(); world = null; }
  [...stars, ...poofs].forEach((x) => { x.life = 0; x.s.visible = false; });
  [...arcs, ...leaves].forEach((x) => { x.life = 0; x.mesh.visible = false; });
}
function startMatch(twoPlayer = false) {
  teardownMatch();
  setupPhysics();
  match.twoPlayer = twoPlayer;
  match.wave = 1;
  match.score = 0;
  match.kos = 0;
  match.waveT = 0;
  match.pendingWave = undefined;
  match.pendingEnd = undefined;
  input.setTwoPlayer(twoPlayer);
  fighters.push(makeFighter(SPECS.cat, { player: 1 }));
  if (twoPlayer) fighters.push(makeFighter(SPECS.cat2, { player: 2 }));
  spawnWave(1);
  setScore();
  hud.set('#wave', '🌊 1');
  hud.hide('#intro');
  hud.hide('#gameover');
  hud.show('#hint');
  hud.set('#hint', twoPlayer ? '🐱 חצים · Enter · Shift ימני   |   🐈 WASD · רווח · Shift שמאלי' : '🏃 חצים · 🥊 רווח · 💨 Shift = זינוק');
  match.state = 'play';
  hud.startMusic();
  startSound();
  announce('🥊 פייט!', true);
}
function nextWave() {
  match.wave += 1;
  match.waveT = 0;
  hud.set('#wave', `🌊 ${match.wave}`);
  hud.pop('#wave');
  waveSound();
  setScore(200);
  announce(`🌊 סיבוב ${match.wave}!`, true);
  for (const f of players()) {
    if (!f.alive) continue;
    f.hearts = Math.min(f.maxHearts, f.hearts + WAVE_HEAL);
    updateCard(f);
    const p = f.body.translation();
    juice.pop(new THREE.Vector3(p.x, p.y + 1.2, p.z), '❤️+2', { color: '#b8321f', size: 26 });
  }
  match.state = 'wave';
}
function endGame() {
  if (match.state === 'over') return;
  match.state = 'over';
  hud.hide('#hint');
  hud.stopMusic();
  loseSound();
  const best = hud.best('punch-best', match.score);
  const alivePlayers = players().filter((f) => f.alive);
  hud.set('#goTitle', match.twoPlayer && alivePlayers.length ? `🏆 ${alivePlayers[0].spec.name} אחרון ביער!` : '💥 נפלתם!');
  hud.set('#finalScore', `${match.score} נקודות · הגעתם לסיבוב ${match.wave}`);
  hud.set('#goDetail', `${match.kos} לוחמים הופלו 🥊`);
  hud.set('#bestScore', `השיא שלכם: ${best} נקודות ⭐`);
  hud.show('#gameover');
}
hud.bind({
  start: () => startMatch(false),
  start2: () => startMatch(true),
  restart: () => startMatch(match.twoPlayer),
});

// ---------- Combat ----------
function startPunch(f) {
  if (!f.alive || f.punch || f.punchCd > 0 || f.hitstun > 0 || f.dash > 0) return;
  // aim assist: a player's punch snaps toward the nearest fighter in range
  if (f.isPlayer) {
    const p = f.body.translation();
    let best = null, bestD = Infinity;
    for (const v of fighters) {
      if (v === f || !v.alive) continue;
      const vp = v.body.translation();
      const d = Math.hypot(vp.x - p.x, vp.z - p.z);
      if (d < f.spec.reach + v.built.radius + AIM_ASSIST && d < bestD) { bestD = d; best = v; }
    }
    if (best) {
      const vp = best.body.translation();
      f.yaw = f.targetYaw = Math.atan2(vp.x - p.x, vp.z - p.z);
    }
  }
  f.punch = { t: 0, arm: (f.punchArmToggle = !f.punchArmToggle) ? 'right' : 'left', hit: false, hit2: false, landed: 0 };
  f.punchCd = f.spec.cd;
  if (f.spec.style === 'stretch') boingSound(); else whooshSound();
  const dir = V3.set(Math.sin(f.yaw), 0, Math.cos(f.yaw));
  f.body.applyImpulse({ x: dir.x * 1.4 * f.body.mass(), y: 0, z: dir.z * 1.4 * f.body.mass() }, true);
}
// a dash: a burst of speed with a moment of invulnerability — dodge a swing, or close the gap
function startDash(f, dx, dz) {
  if (!f.alive || f.dashCd > 0 || f.hitstun > 0 || f.dash > 0) return false;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) { dx = Math.sin(f.yaw); dz = Math.cos(f.yaw); } else { dx /= len; dz /= len; }
  f.dash = DASH_T;
  f.dashCd = DASH_CD;
  f.dashDir = { x: dx, z: dz };
  f.invuln = Math.max(f.invuln, DASH_INVULN);
  f.targetYaw = Math.atan2(dx, dz);
  f.punch = null;
  dashSound();
  const p = f.body.translation();
  spawnArc(new THREE.Vector3(p.x - dx * 0.6, p.y - 0.2, p.z - dz * 0.6), f.targetYaw + Math.PI);
  return true;
}

function resolvePunchHit(f, quiet = false) {
  const myPos = f.body.translation();
  const dir = V3.set(Math.sin(f.yaw), 0, Math.cos(f.yaw)).clone();
  const stretch = f.spec.style === 'stretch';
  if (!quiet) {
    const arcD = stretch ? f.spec.reach * 0.5 : 0.7;
    spawnArc(new THREE.Vector3(myPos.x + dir.x * arcD, myPos.y + 0.15, myPos.z + dir.z * arcD), f.yaw);
  }
  let landed = 0;
  for (const v of fighters) {
    if (v === f || !v.alive || v.invuln > 0) continue;
    const vp = v.body.translation();
    const dx = vp.x - myPos.x, dz = vp.z - myPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > f.spec.reach + v.built.radius) continue;
    if (stretch) {
      const along = dx * dir.x + dz * dir.z;
      if (along < 0.2) continue;
      const perp = Math.abs(dx * dir.z - dz * dir.x);
      if (perp > 1.05 + v.built.radius * 0.5) continue;
    } else if ((dx * dir.x + dz * dir.z) / (dist || 1) < PUNCH_ARC) continue;
    hitFighter(v, f, dir, 1.0);
    landed++;
  }
  return landed;
}

function hitFighter(v, attacker, dir, power) {
  const dmg = attacker.spec.dmg;
  v.hearts -= dmg;
  v.hitstun = HIT_STUN;
  v.invuln = v.isPlayer ? HIT_INVULN_PLAYER : HIT_INVULN;
  v.lastHitBy = attacker;
  updateCard(v);
  const taken = v.maxHearts - v.hearts;
  const k = (6.2 + taken * 1.15) * power * (attacker.spec.key === 'emperor' ? 1.5 : 1);
  const m = v.body.mass();
  v.body.applyImpulse({ x: dir.x * k * m, y: 4.6 * m * power, z: dir.z * k * m }, true);
  const vp = v.body.translation();
  spawnStar(new THREE.Vector3(vp.x, vp.y + v.centerY * 0.6, vp.z), dmg > 1);
  thudSound();
  juice.shake((v.isPlayer ? 0.3 : 0.16) + dmg * 0.05);
  if (attacker.isPlayer && !v.isPlayer) setScore(10, new THREE.Vector3(vp.x, vp.y + 1.3, vp.z));
  if (v.hearts <= 0) koFighter(v, attacker, dir);
}

function koFighter(v, attacker, dir) {
  v.alive = false;
  v.koTimer = 2.2;
  updateCard(v);
  koSound();
  juice.hitstop(0.1, 0.1);
  juice.shake(0.35);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, v.yaw, 0));
  v.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
  v.body.setEnabledRotations(true, true, true, true);
  const m = v.body.mass();
  v.body.applyImpulse({ x: dir.x * 9 * m, y: 7.5 * m, z: dir.z * 9 * m }, true);
  v.body.applyTorqueImpulse({ x: dir.z * 3.5 * m, y: (rnd(v.spec.key.length, 50) - 0.5) * 2 * m, z: -dir.x * 3.5 * m }, true);
  announce(`${v.spec.emoji} ${v.spec.name} ${v.spec.fall}!`, !v.isPlayer);
  if (!v.isPlayer) {
    match.kos += 1;
    const vp = v.body.translation();
    if (attacker && attacker.isPlayer) setScore(100, new THREE.Vector3(vp.x, vp.y + 1.5, vp.z));
    if (npcs().every((x) => !x.alive)) match.pendingWave = 1.2;
  } else if (players().every((x) => !x.alive)) {
    match.pendingEnd = 1.4;
  }
}

// flying into a trunk hurts
function checkTreeBonks() {
  for (const f of fighters) {
    if (!f.alive || f.hitstun <= 0) continue;
    const vel = f.body.linvel();
    if (Math.hypot(vel.x, vel.z) < TREE_BONK_SPEED) continue;
    const p = f.body.translation();
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      if (!t.interior) continue;
      if (Math.hypot(t.x - p.x, t.z - p.z) < 0.45 * t.s + f.built.radius * 0.8 + 0.15) {
        f.hearts -= 1;
        f.invuln = Math.max(f.invuln, 0.4);
        updateCard(f);
        shakeTree(i);
        bonkSound();
        juice.shake(0.22);
        spawnStar(new THREE.Vector3(p.x, p.y + 0.4, p.z), false);
        if (f.lastHitBy && f.lastHitBy.isPlayer && !f.isPlayer) setScore(50, new THREE.Vector3(p.x, p.y + 1.4, p.z));
        if (f.hearts <= 0 && f.alive) {
          const dir = V3.set(p.x - t.x, 0, p.z - t.z).normalize().clone();
          koFighter(f, f.lastHitBy || f, dir);
        }
        break;
      }
    }
  }
}

// ---------- AI ----------
function distTo(a, b) {
  const pa = a.body.translation(), pb = b.body.translation();
  return Math.hypot(pb.x - pa.x, pb.z - pa.z);
}
// who to go after: the cats are the bosses of this forest, grudges count, and each
// character keeps its personality (the queen picks on the weak, the king on the near).
// Only one hunter chases the cats at a time (plus anyone holding a grudge against them)
// — the rest brawl among themselves, so a kid faces a duel, not a four-way pile-on.
function pickTarget(f, alive) {
  const hunters = fighters.filter((x) => !x.isPlayer && x !== f && x.alive && x.ai.target && x.ai.target.isPlayer && x.ai.target.alive).length;
  const playerBonus = hunters >= 1 ? -3 : 6;
  let best = null, bs = -Infinity;
  for (const c of alive) {
    const d = distTo(f, c);
    let s = -d * 0.35;
    if (c.isPlayer) s += playerBonus;
    if (f.lastHitBy === c) s += 5;
    if (f.spec.key === 'queen') s += (c.maxHearts - c.hearts) * 1.2;
    if (f.spec.key === 'king') s -= d * 0.4;
    if (f.spec.key === 'mohawk') s += rnd(Math.floor(app.time * 3), c.spec.key.length) * 7;
    if (s > bs) { bs = s; best = c; }
  }
  return best;
}
function aiTick(f, dt, t) {
  const ai = f.ai;
  ai.think -= dt;
  ai.dashThink -= dt;
  const alive = fighters.filter((x) => x.alive && x !== f);
  if (!alive.length) return { mx: 0, mz: 0, punch: false };
  if (ai.think <= 0 || !ai.target || !ai.target.alive) {
    ai.think = f.spec.key === 'mohawk' ? 1.2 : 2.0;
    ai.target = pickTarget(f, alive);
  }
  const target = ai.target;
  const p = f.body.translation();
  const tp = target.body.translation();
  let dx = tp.x - p.x, dz = tp.z - p.z;
  const dist = Math.hypot(dx, dz) || 1;
  dx /= dist; dz /= dist;
  const inRange = dist < f.spec.reach + target.built.radius * 0.9;
  let mx = dx, mz = dz, wantPunch = false;

  if (f.spec.key === 'queen') {
    if (ai.retreat > 0) { ai.retreat -= dt; mx = -dx; mz = -dz; }
    else if (f.punchCd <= 0 || dist < 3.5) { /* dash in */ }
    else { mx = dz * 0.8 - dx * 0.2; mz = -dx * 0.8 - dz * 0.2; }
    if (inRange && f.punchCd <= 0) { wantPunch = true; ai.retreat = 1.1; }
    if (ai.retreat > 0.9 && ai.retreat < 1.05) startDash(f, -dx, -dz); // skates away after a hit
  } else if (f.spec.key === 'mohawk') {
    const zig = Math.sin(t * 3.6 + 1.7);
    mx = dx + dz * zig * 0.9; mz = dz - dx * zig * 0.9;
    wantPunch = inRange && f.punchCd <= 0;
    if (ai.dashThink <= 0 && dist > 6.5 && dist < 11) { ai.dashThink = 4 + rnd(Math.floor(t * 7), 3) * 3; startDash(f, dx, dz); }
  } else if (f.spec.key === 'emperor') {
    wantPunch = inRange && f.punchCd <= 0;
  } else {
    const circ = Math.sin(t * 1.3) * 0.35;
    mx = dx + dz * circ; mz = dz - dx * circ;
    wantPunch = inRange && f.punchCd <= 0;
  }
  if (inRange) { mx *= 0.15; mz *= 0.15; }

  // don't walk into trunks
  for (const tr of trees) {
    if (!tr.interior) continue;
    const ax = p.x - tr.x, az = p.z - tr.z;
    const d = Math.hypot(ax, az);
    if (d < 2.4 && d > 0.01) { const k = ((2.4 - d) / 2.4) * 1.6; mx += (ax / d) * k; mz += (az / d) * k; }
  }
  // stay off the fence
  const r = Math.hypot(p.x, p.z);
  if (r > ARENA_R) { mx -= (p.x / r) * 1.2; mz -= (p.z / r) * 1.2; }
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  f.targetYaw = dist < 4.5 ? Math.atan2(dx, dz) : Math.atan2(mx, mz);
  return { mx, mz, punch: wantPunch };
}

// ---------- Per-frame fighter update ----------
function updateFighter(f, dt, t) {
  if (f.removed) return;
  f.punchCd = Math.max(0, f.punchCd - dt);
  f.hitstun = Math.max(0, f.hitstun - dt);
  f.invuln = Math.max(0, f.invuln - dt);
  f.dashCd = Math.max(0, f.dashCd - dt);
  const p = f.body.translation();

  if (f.alive) {
    if (f.dash > 0) {
      f.dash -= dt;
      const vel = f.body.linvel();
      const ds = f.isPlayer ? DASH_SPEED : DASH_SPEED_NPC;
      f.body.setLinvel({ x: f.dashDir.x * ds, y: vel.y, z: f.dashDir.z * ds }, true);
    } else if (f.hitstun <= 0) {
      let mx = 0, mz = 0, wantPunch = false;
      if (match.state === 'play' || match.state === 'wave') {
        if (f.isPlayer) {
          const pi = input.p(f.player);
          const ax = pi.axis(_axis);
          mx = ax.x; mz = ax.z;
          // a punch goes where it was aimed: steering doesn't turn you while the arm is out
          if ((mx || mz) && !(f.punch && f.punch.t < 0.24)) f.targetYaw = Math.atan2(mx, mz);
          if (pi.consume('b')) startDash(f, mx, mz);
          if (pi.consume('a')) wantPunch = true;
        } else {
          const cmd = aiTick(f, dt, t);
          mx = cmd.mx; mz = cmd.mz;
          wantPunch = cmd.punch;
        }
      }
      if (f.dash <= 0) {
        const vel = f.body.linvel();
        const sp = f.speed * (f.punch ? 0.35 : 1);
        f.body.setLinvel({ x: mx * sp, y: vel.y, z: mz * sp }, true);
        if (wantPunch) startPunch(f);
      }
    }
    if (f.targetYaw !== undefined) {
      let d = f.targetYaw - f.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      f.yaw += d * Math.min(1, dt * 10);
    }
    f.pivot.position.set(p.x, p.y, p.z);
    f.pivot.rotation.set(0, f.yaw, 0);
  } else {
    f.pivot.position.set(p.x, p.y, p.z);
    const q = f.body.rotation();
    f.pivot.quaternion.set(q.x, q.y, q.z, q.w);
    f.koTimer -= dt;
    if (f.koTimer <= 0) {
      spawnPoof(new THREE.Vector3(p.x, p.y, p.z), 7);
      removeFighter(f);
      f.card.remove();
      if (!f.isPlayer) fighters.splice(fighters.indexOf(f), 1);
      return;
    }
  }

  // punch animation
  if (f.punch) {
    f.punch.t += dt;
    const pt = f.punch.t;
    const arm = f.built.arms[f.punch.arm];
    if (f.spec.style === 'stretch') {
      const side = f.punch.arm === 'right' ? 1 : -1;
      const aimRot = -side * Math.PI / 2;
      if (arm && arm.pivot && arm.arm) {
        if (arm.fistRestX === undefined) arm.fistRestX = arm.fist.position.x;
        let s = 1;
        if (pt < 0.06) s = 1 - 0.3 * (pt / 0.06);
        else if (pt < 0.14) s = 0.7 + (STRETCH - 0.7) * ((pt - 0.06) / 0.08);
        else if (pt < 0.22) s = STRETCH;
        else s = STRETCH + (1 - STRETCH) * Math.min(1, (pt - 0.22) / 0.2);
        const aim = Math.min(1, pt / 0.06);
        const back = pt > 0.22 ? 1 - Math.min(1, (pt - 0.22) / 0.2) : 1;
        arm.pivot.rotation.y = aimRot * aim * back;
        arm.arm.scale.x = side * s;
        const fat = 1 + 1.5 * Math.max(0, (s - 1) / (STRETCH - 1));
        arm.arm.scale.y = fat;
        arm.arm.scale.z = fat;
        arm.fist.position.x = arm.fistRestX + side * (s - 1);
        arm.fist.scale.setScalar(pt > 0.06 && pt < 0.26 ? 1.6 : 1);
      }
      if (!f.punch.hit && pt >= 0.12) { f.punch.hit = true; if (f.alive) f.punch.landed = resolvePunchHit(f); }
      if (f.punch.hit && !f.punch.hit2 && pt >= 0.21) { f.punch.hit2 = true; if (f.alive && !f.punch.landed) f.punch.landed = resolvePunchHit(f, true); }
      if (pt > 0.44) {
        if (arm && arm.pivot && arm.arm) {
          arm.pivot.rotation.y = 0;
          arm.arm.scale.set(side, 1, 1);
          arm.fist.position.x = arm.fistRestX;
          arm.fist.scale.setScalar(1);
        }
        f.punch = null;
      }
    } else {
      const sign = f.punch.arm === 'right' ? -1 : 1;
      if (arm && arm.pivot) {
        let ang = 0;
        if (pt < 0.07) ang = -sign * 0.5 * (pt / 0.07);
        else if (pt < 0.19) ang = sign * 1.5 * ((pt - 0.07) / 0.12) - sign * 0.5;
        else ang = sign * 1.0 * (1 - Math.min(1, (pt - 0.19) / 0.26));
        arm.pivot.rotation.y = ang;
        if (arm.fist) arm.fist.scale.setScalar(pt > 0.07 && pt < 0.22 ? 1.35 : 1);
      }
      if (!f.punch.hit && pt >= 0.11) { f.punch.hit = true; if (f.alive) f.punch.landed = resolvePunchHit(f); }
      if (f.punch.hit && !f.punch.hit2 && pt >= 0.2) { f.punch.hit2 = true; if (f.alive && !f.punch.landed) f.punch.landed = resolvePunchHit(f, true); }
      if (pt > 0.45) {
        if (arm && arm.pivot) arm.pivot.rotation.y = 0;
        if (arm && arm.fist) arm.fist.scale.setScalar(1);
        f.punch = null;
      }
    }
  }

  if (f.alive) {
    if (f.built.idle) f.built.idle(t);
    f.built.group.rotation.z = f.hitstun > 0 ? Math.sin(t * 40) * 0.06 * (f.hitstun / HIT_STUN) : 0;
    if (f.dash > 0) f.built.group.rotation.z = 0.25 * Math.sin(f.dash / DASH_T * Math.PI);
  }
  const h = Math.max(0, p.y - f.centerY);
  f.shadow.position.set(p.x, 0.02, p.z);
  const sc = Math.max(0.45, 1 - h * 0.12);
  f.shadow.scale.setScalar(f.built.radius * 0.85 * sc);
  f.shadow.material.opacity = 0.14 * sc;
}

// ---------- Camera: follows the cats, backs off when they split up ----------
const camTarget = new THREE.Vector3();
const camWant = new THREE.Vector3();
function updateCamera(dt) {
  const alive = players().filter((f) => !f.removed);
  let sep = 0;
  if (alive.length) {
    let x = 0, z = 0;
    for (const f of alive) { const p = f.body.translation(); x += p.x; z += p.z; }
    x /= alive.length; z /= alive.length;
    if (alive.length > 1) {
      const a = alive[0].body.translation(), b = alive[1].body.translation();
      sep = Math.hypot(a.x - b.x, a.z - b.z);
    }
    camTarget.lerp(camWant.set(x, 0, z), Math.min(1, dt * 5));
  }
  camWant.set(camTarget.x, 8.6 + sep * 0.35, camTarget.z + 11.2 + sep * 0.45);
  camera.position.lerp(camWant, Math.min(1, dt * 4));
  camera.lookAt(camTarget.x, 1.2, camTarget.z);
}

// ---------- Boot ----------
let acc = 0;
function update(dt) {
  uTime.value = app.time;
  if (match.state === 'play' || match.state === 'wave') {
    acc += dt;
    let steps = 0;
    while (acc >= 1 / 60 && steps < 3) { world.step(); acc -= 1 / 60; steps++; }
    checkTreeBonks();
    if (match.pendingWave !== undefined) {
      match.pendingWave -= dt;
      if (match.pendingWave <= 0) { match.pendingWave = undefined; nextWave(); }
    }
    if (match.pendingEnd !== undefined) {
      match.pendingEnd -= dt;
      if (match.pendingEnd <= 0) { match.pendingEnd = undefined; endGame(); }
    }
    if (match.state === 'wave') {
      match.waveT += dt;
      if (match.waveT > 1.3) { spawnWave(match.wave); match.state = 'play'; }
    }
  }
  for (const f of [...fighters]) updateFighter(f, dt, app.time);
  updateTrees(dt);
  updateFX(dt);
  updateCamera(dt);
}

RAPIER.init().then(() => {
  app.start(update);
  // debug / test hook (rAF pauses while the Browser pane is hidden — step by hand)
  window.__punch = {
    app, fighters, match, trees, treeParts, treeHulls, startMatch, teardownMatch,
    get state() { return match.state; },
    get world() { return world; },
    step: (dt) => app.step(dt),
    render: () => app.frame(0),
  };
});
