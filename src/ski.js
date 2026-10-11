// 🎿 רוקרוק בשלג — Kelpie Downhill. Design sheet: design/ski.md (asked for in chat, no drawing).
//
// The black-and-tan kelpie (a real photo turned into a 3D model, see design/ski.md) skis an
// endless 14° snow slope: follow the groomed lane through slalom gates, collect bones, jump the
// fallen logs, launch off kickers and spin in the air; trees, rocks and logs cost one of three
// bones, a golden bone gives one back. The mountain gets harder in named zones (open slope →
// forest edge → forest → deep forest) over about three minutes. Babylon.js instead of three.js —
// the model was exported for Babylon/Godot — but the page is a normal marker-games page: kit HUD,
// kit input, kit audio, `?sim` + window.__ski for the balance test.
import BABYLON from './kit/babylon.js';
import './kit/shell.css';
import { createHud } from './kit/hud.js';
import { createInput } from './kit/input.js';
import { ensureAudio, beep, noise, chord, isMuted } from './kit/audio.js';
import dogGlb from './assets/dog.glb?url';

const SIM = new URLSearchParams(location.search).has('sim');
const V3 = BABYLON.Vector3;

// ------------------------------------------------------------------ knobs
const T = {
  slopeDeg: 14, halfWidth: 48, chunkLen: 60, chunkHalfW: 68, gridX: 92, gridZ: 40, ahead: 5, behind: 1,
  g: 9.81, tuckDrag: 0.64, carveDrag: 0.32, startSpeed: 7, minSpeed: 3,
  maxHeading: 1.15, leanSpring: 95, leanDamp: 13, leanBase: 0.45, leanPerSpeed: 0.03, leanMax: 1.05, grip: 1.7,
  kickTime: 0.11, kickLean: 0.14, recentre: 1.1, skidSteer: 1.1, jumpV: 4.6, lives: 3, kneeDrop: 0.09,
  treeR: 0.55, rockR: 0.95, dogR: 0.34, boneR: 1.3, goldR: 1.7, logR: 0.3, logTop: 0.5, logMaxHalf: 7,
  streakMax: 5, goldEvery: 8, camBack: 5.0, camHeight: 2.7, camLook: 10,
};
const SLOPE = (T.slopeDeg * Math.PI) / 180;
const TAN_SLOPE = Math.tan(SLOPE);
const G_SLOPE = T.g * Math.sin(SLOPE);
const L = T.chunkLen;

// ------------------------------------------------------------------ the climb: named zones by distance
// Each zone starts at `z` (metres down the mountain) with these values and blends into the next
// zone's; the black run keeps climbing slowly to the last key, then the mountain holds. The open slope has nothing in the lane — rocks, logs
// and kickers start at the forest edge. corridor = half-width of the groomed lane kept clear of trees
// around the course line; trees / rocks (in the lane) / logs / kickers are per 60 m chunk; vTerm = the
// straight-run top speed in m/s (tucking adds a quarter); amp = how far the gates swing to each side.
const ZONES = [
  { z: 0, name: '🏔️ המדרון הפתוח', corridor: 20, trees: 10, rocks: 0, logs: 0, kickers: 0, vTerm: 15.5, gateHalf: 3.3, amp: 3, twoGates: 0 },
  { z: 500, name: '🌲 שולי היער', corridor: 13, trees: 34, rocks: 0.6, logs: 0.6, kickers: 0.5, vTerm: 17.5, gateHalf: 3.0, amp: 6, twoGates: 0.25 },
  { z: 1300, name: '🌲🌲 היער', corridor: 8.5, trees: 52, rocks: 1.4, logs: 0.85, kickers: 0.6, vTerm: 20, gateHalf: 2.7, amp: 8.5, twoGates: 0.4 },
  { z: 2600, name: '🌲🌲🌲 היער העבות', corridor: 6, trees: 64, rocks: 2.2, logs: 1.0, kickers: 0.7, vTerm: 22, gateHalf: 2.5, amp: 10, twoGates: 0.5 },
  { z: 4200, name: '⚫ המסלול השחור', corridor: 5.5, trees: 70, rocks: 2.6, logs: 1.1, kickers: 0.7, vTerm: 22.5, gateHalf: 2.4, amp: 11, twoGates: 0.5 },
  { z: 7000, corridor: 4.8, trees: 74, rocks: 3.2, logs: 1.2, kickers: 0.7, vTerm: 24, gateHalf: 2.3, amp: 12, twoGates: 0.55 },
];
const LEVEL_KEYS = ['corridor', 'trees', 'rocks', 'logs', 'kickers', 'vTerm', 'gateHalf', 'amp', 'twoGates'];
function level(z, out = {}) {
  let k = 0;
  while (k < ZONES.length - 2 && z >= ZONES[k + 1].z) k++;
  const a = ZONES[k], b = ZONES[k + 1], u = clamp((z - a.z) / (b.z - a.z), 0, 1);
  for (const key of LEVEL_KEYS) out[key] = lerp(a[key], b[key], u);
  if (k === 0) out.rocks = out.logs = out.kickers = 0;
  out.zone = k;
  return out;
}

// ------------------------------------------------------------------ state
const state = {
  ready: false, running: false, over: false, t: 0,
  x: 0, z: 0, y: 0, vy: 0, heading: 0, speed: 0, air: false, airTime: 0, spin: 0,
  lives: T.lives, score: 0, dist: 0, bones: 0, gates: 0, tuck: false, inv: 0, shake: 0, landBounce: 0,
  crouch: 0, overTimer: 0,
  lean: 0, leanVel: 0, kick: 0, kickSign: 0, prevTurn: 0, aLat: 0, skid: 0,
  zone: -1, streak: 0, bestStreak: 0, logs: 0, golds: 0, logHint: false, goldHint: false, jumpBuf: 0,
};
// the test hook drives these directly; play reads them from the kit input every frame
// (`steer` is an analog turn in -1..1 for the test bot, added to the keys)
const ctrl = { left: false, right: false, tuck: false, jumpQueued: false, turn: 0, steer: 0 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ terrain
const chunks = new Map();
const chunkIndexAt = (z) => Math.floor(z / L);
const rampsAt = (z) => { const c = chunks.get(chunkIndexAt(z)); return c ? c.ramps : []; };
function baseHeight(x, z) {
  let h = -TAN_SLOPE * z;
  h += 1.4 * Math.sin(z * 0.045 + 1.7 * Math.sin(x * 0.021));
  h += 0.7 * Math.sin(x * 0.09 + z * 0.017) * Math.cos(z * 0.031);
  h += 0.12 * Math.sin(x * 0.21 + z * 0.17) * Math.sin(z * 0.29 + x * 0.07);
  const ax = Math.abs(x);
  if (ax > T.halfWidth) { const d = ax - T.halfWidth; h += d * d * 0.03; }
  return h;
}
function terrainH(x, z, ramps) {
  let h = baseHeight(x, z);
  const rs = ramps || rampsAt(z);
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i], dx = (x - r.x) / r.rx, dz = (z - r.z) / r.rz, d2 = dx * dx + dz * dz;
    if (d2 < 9) h += r.h * Math.exp(-d2 * 0.9);
  }
  return h;
}
function terrainNormal(x, z, out) {
  const e = 0.35;
  const hx = terrainH(x + e, z) - terrainH(x - e, z);
  const hz = terrainH(x, z + e) - terrainH(x, z - e);
  out.set(-hx / (2 * e), 1, -hz / (2 * e));
  return out.normalize();
}
function crestLaunch(x, z, heading, v) {
  // convex snow needs v² · curvature of downward acceleration to stay in contact; more than g = take-off
  const d = 0.6, sx = Math.sin(heading) * d, sz = Math.cos(heading) * d;
  const h0 = terrainH(x, z), hp = terrainH(x + sx, z + sz), hm = terrainH(x - sx, z - sz);
  const h2 = (hp - 2 * h0 + hm) / (d * d);
  return h2 < 0 && v * v * -h2 > T.g * 1.15;
}

// ------------------------------------------------------------------ scene
const app = document.getElementById('app');
const canvas = document.createElement('canvas');
canvas.tabIndex = 0;
app.appendChild(canvas);
const engine = SIM ? new BABYLON.NullEngine() : new BABYLON.Engine(canvas, true, { stencil: false, antialias: true, adaptToDeviceRatio: true });
const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.80, 0.87, 0.95, 1);
scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
scene.fogDensity = 0.0042;
scene.fogColor = new BABYLON.Color3(0.82, 0.88, 0.95);
scene.ambientColor = new BABYLON.Color3(0.3, 0.34, 0.4);

const camera = new BABYLON.UniversalCamera('cam', new V3(0, 3, -7), scene);
camera.fov = 1.02; camera.minZ = 0.15; camera.maxZ = 2000;
camera.inputs.clear();

const hemi = new BABYLON.HemisphericLight('hemi', new V3(0, 1, 0), scene);
hemi.diffuse = new BABYLON.Color3(0.62, 0.72, 0.90);
hemi.groundColor = new BABYLON.Color3(0.85, 0.86, 0.9);
hemi.intensity = 0.75;
const sun = new BABYLON.DirectionalLight('sun', new V3(0.42, -0.62, 0.66).normalize(), scene);
sun.diffuse = new BABYLON.Color3(1.0, 0.94, 0.84);
sun.specular = new BABYLON.Color3(0.6, 0.6, 0.6);
sun.intensity = 1.55;
sun.shadowMinZ = 1; sun.shadowMaxZ = 260;
const shadows = new BABYLON.ShadowGenerator(2048, sun);
shadows.useBlurExponentialShadowMap = true;
shadows.blurKernel = 24;
shadows.darkness = 0.35;
shadows.bias = 0.0015;

const snowMat = new BABYLON.StandardMaterial('snow', scene);
snowMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
snowMat.specularColor = new BABYLON.Color3(0.22, 0.24, 0.28);
snowMat.specularPower = 48;
snowMat.ambientColor = new BABYLON.Color3(0.9, 0.93, 1.0);
{
  const size = 256, dt = new BABYLON.DynamicTexture('grain', size, scene, true);
  const ctx = dt.getContext(), img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) { const v = 236 + Math.random() * 19; img.data[i * 4] = v; img.data[i * 4 + 1] = v + 2; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0); dt.update();
  dt.wrapU = dt.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; dt.uScale = 40; dt.vScale = 40;
  snowMat.diffuseTexture = dt;
}
const propMat = new BABYLON.StandardMaterial('prop', scene);
propMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
propMat.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
propMat.ambientColor = new BABYLON.Color3(0.7, 0.75, 0.85);

function colorMesh(mesh, r, g, b, fn) {
  const pos = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
  const n = pos.length / 3, cols = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    let c = [r, g, b];
    if (fn) c = fn(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], c);
    cols[i * 4] = c[0]; cols[i * 4 + 1] = c[1]; cols[i * 4 + 2] = c[2]; cols[i * 4 + 3] = 1;
  }
  mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, cols);
  return mesh;
}
function merge(meshes, name) {
  const m = BABYLON.Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
  m.name = name; m.material = propMat; m.setEnabled(false); m.isPickable = false;
  return m;
}
function makeTree() {
  const trunk = colorMesh(BABYLON.MeshBuilder.CreateCylinder('t', { height: 1.6, diameter: 0.5, tessellation: 7 }, scene), 0.30, 0.20, 0.13);
  trunk.position.y = 0.8;
  const tiers = [];
  for (const [y, h, rad] of [[0, 3.4, 2.6], [1.9, 3.1, 2.1], [3.6, 2.8, 1.6], [5.1, 2.4, 1.1]]) {
    const cone = BABYLON.MeshBuilder.CreateCylinder('c', { height: h, diameterTop: 0, diameterBottom: rad * 2, tessellation: 8 }, scene);
    cone.position.y = 1.2 + y + h / 2;
    const top = 1.2 + y + h;
    colorMesh(cone, 0, 0, 0, (px, py) => {
      const s = smooth(top - 1.1, top - 0.15, py);
      const pine = [0.10 + 0.04 * Math.random(), 0.30 + 0.05 * Math.random(), 0.20];
      return [lerp(pine[0], 0.94, s), lerp(pine[1], 0.96, s), lerp(pine[2], 1.0, s)];
    });
    tiers.push(cone);
  }
  return merge([trunk, ...tiers], 'tree');
}
function makeRock() {
  const r = BABYLON.MeshBuilder.CreateIcoSphere('r', { radius: 1, subdivisions: 1, flat: true }, scene);
  r.scaling.set(1.15, 0.7, 0.95);
  r.bakeCurrentTransformIntoVertices();
  colorMesh(r, 0, 0, 0, (px, py) => { const s = smooth(0.25, 0.6, py); return [lerp(0.36, 0.95, s), lerp(0.37, 0.96, s), lerp(0.40, 1.0, s)]; });
  return merge([r], 'rock');
}
function makeBone(name, col) {
  const shaft = colorMesh(BABYLON.MeshBuilder.CreateCylinder('s', { height: 0.7, diameter: 0.16, tessellation: 8 }, scene), ...col);
  shaft.rotation.z = Math.PI / 2;
  const knobs = [];
  for (const [x, y] of [[-0.36, 0.09], [-0.36, -0.09], [0.36, 0.09], [0.36, -0.09]]) {
    const k = colorMesh(BABYLON.MeshBuilder.CreateSphere('k', { diameter: 0.24, segments: 6 }, scene), ...col);
    k.position.set(x, y, 0); knobs.push(k);
  }
  return merge([shaft, ...knobs], name);
}
function makeGate(red) {
  const pole = colorMesh(BABYLON.MeshBuilder.CreateCylinder('p', { height: 2.6, diameter: 0.09, tessellation: 6 }, scene), 0.2, 0.2, 0.22);
  pole.position.y = 1.3;
  const flag = BABYLON.MeshBuilder.CreatePlane('f', { width: 0.9, height: 0.7, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
  flag.position.set(0.5, 2.2, 0);
  colorMesh(flag, ...(red ? [0.84, 0.27, 0.25] : [0.18, 0.42, 0.84]));
  return merge([pole, flag], red ? 'gateRed' : 'gateBlue');
}
function makeLog() {
  // one metre of fallen trunk along x with snow on top; instances stretch it across the lane
  const log = BABYLON.MeshBuilder.CreateCylinder('lg', { height: 1, diameter: T.logR * 2, tessellation: 12 }, scene);
  log.rotation.z = Math.PI / 2;
  log.bakeCurrentTransformIntoVertices();
  colorMesh(log, 0, 0, 0, (px, py) => (py > T.logR * 0.8 ? [0.96, 0.97, 1.0] : [0.36 + 0.06 * Math.random(), 0.22, 0.12]));
  return merge([log], 'log');
}
function makeMarker() {
  // the orange poles either side of a kicker's lip
  const pole = colorMesh(BABYLON.MeshBuilder.CreateCylinder('mp', { height: 1.8, diameter: 0.09, tessellation: 6 }, scene), 0.96, 0.44, 0.10);
  pole.position.y = 0.9;
  const pennant = BABYLON.MeshBuilder.CreateDisc('pn', { radius: 0.36, tessellation: 3, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
  pennant.position.set(0.28, 1.55, 0);
  colorMesh(pennant, 1.0, 0.62, 0.12);
  return merge([pole, pennant], 'marker');
}
const goldMat = new BABYLON.StandardMaterial('gold', scene);
goldMat.diffuseColor = new BABYLON.Color3(1.0, 0.78, 0.22); goldMat.emissiveColor = new BABYLON.Color3(0.42, 0.28, 0.04);
goldMat.specularColor = new BABYLON.Color3(1.0, 0.9, 0.6); goldMat.specularPower = 24;
const lipMat = new BABYLON.StandardMaterial('lip', scene);
lipMat.diffuseColor = new BABYLON.Color3(1.0, 0.45, 0.12); lipMat.emissiveColor = new BABYLON.Color3(0.45, 0.16, 0.03);
lipMat.specularColor = BABYLON.Color3.Black(); lipMat.backFaceCulling = false;
const baseTree = makeTree(), baseRock = makeRock(), baseRed = makeGate(true), baseBlue = makeGate(false);
const baseBone = makeBone('bone', [0.98, 0.88, 0.66]), baseGold = makeBone('goldBone', [1, 1, 1]);
baseGold.material = goldMat;
const baseLog = makeLog(), baseMarker = makeMarker();

// sky dome, sun disc, far peaks
const sky = BABYLON.MeshBuilder.CreateSphere('sky', { diameter: 1700, segments: 10, sideOrientation: BABYLON.Mesh.BACKSIDE }, scene);
colorMesh(sky, 0, 0, 0, (px, py) => { const t = smooth(-80, 600, py); return [lerp(0.88, 0.30, t), lerp(0.92, 0.50, t), lerp(0.97, 0.86, t)]; });
const skyMat = new BABYLON.StandardMaterial('skyMat', scene);
skyMat.disableLighting = true; skyMat.emissiveColor = new BABYLON.Color3(1, 1, 1); skyMat.fogEnabled = false;
sky.material = skyMat; sky.infiniteDistance = true; sky.isPickable = false;
const sunDisc = BABYLON.MeshBuilder.CreateDisc('sunDisc', { radius: 34, tessellation: 40 }, scene);
const sunMat = new BABYLON.StandardMaterial('sunMat', scene);
sunMat.disableLighting = true; sunMat.emissiveColor = new BABYLON.Color3(1.0, 0.95, 0.8); sunMat.fogEnabled = false;
sunDisc.material = sunMat; sunDisc.infiniteDistance = true; sunDisc.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
sunDisc.position = sun.direction.scale(-780);
const peaks = new BABYLON.TransformNode('peaks', scene);
{
  const rng = mulberry32(99);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rng() * 0.2, dist = 520 + rng() * 260, h = 90 + rng() * 210, r = 60 + rng() * 120;
    const cone = BABYLON.MeshBuilder.CreateCylinder('peak', { height: h, diameterTop: 0, diameterBottom: r * 2, tessellation: 5 }, scene);
    colorMesh(cone, 0, 0, 0, (px, py) => { const s = smooth(h * 0.05, h * 0.42, py); return [lerp(0.42, 0.93, s), lerp(0.46, 0.95, s), lerp(0.54, 1.0, s)]; });
    cone.position.set(Math.sin(a) * dist, -40 + h / 2, Math.cos(a) * dist);
    cone.rotation.y = rng() * Math.PI;
    cone.material = propMat; cone.parent = peaks; cone.isPickable = false;
  }
}

// particles (textures drawn on a canvas — nothing is downloaded)
function softDot(size) {
  const dt = new BABYLON.DynamicTexture('dot', size, scene, false);
  const ctx = dt.getContext();
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  dt.update(); dt.hasAlpha = true;
  return dt;
}
const dotTex = softDot(64);
const snowEmitter = new BABYLON.TransformNode('snowEmitter', scene);
const snowfall = new BABYLON.ParticleSystem('snowfall', 900, scene);
snowfall.particleTexture = dotTex; snowfall.emitter = snowEmitter;
snowfall.minEmitBox = new V3(-30, -4, -10); snowfall.maxEmitBox = new V3(30, 16, 45);
snowfall.color1 = new BABYLON.Color4(1, 1, 1, 0.85); snowfall.color2 = new BABYLON.Color4(0.9, 0.95, 1, 0.6); snowfall.colorDead = new BABYLON.Color4(1, 1, 1, 0);
snowfall.minSize = 0.05; snowfall.maxSize = 0.14; snowfall.minLifeTime = 5; snowfall.maxLifeTime = 8;
snowfall.emitRate = 140; snowfall.gravity = new V3(0, -1.6, 0);
snowfall.direction1 = new V3(-0.6, -0.4, -0.2); snowfall.direction2 = new V3(0.6, -0.1, 0.2);
snowfall.minEmitPower = 0.3; snowfall.maxEmitPower = 0.9; snowfall.updateSpeed = 0.02;
snowfall.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
const sprayEmitter = new BABYLON.TransformNode('sprayEmitter', scene);
const spray = new BABYLON.ParticleSystem('spray', 700, scene);
spray.particleTexture = dotTex; spray.emitter = sprayEmitter;
spray.minEmitBox = new V3(-0.15, 0, -0.2); spray.maxEmitBox = new V3(0.15, 0.05, 0.2);
spray.color1 = new BABYLON.Color4(1, 1, 1, 0.9); spray.color2 = new BABYLON.Color4(0.92, 0.96, 1, 0.7); spray.colorDead = new BABYLON.Color4(1, 1, 1, 0);
spray.minSize = 0.08; spray.maxSize = 0.4; spray.minLifeTime = 0.35; spray.maxLifeTime = 0.8;
spray.emitRate = 0; spray.gravity = new V3(0, -9, 0);
spray.minEmitPower = 2; spray.maxEmitPower = 6; spray.updateSpeed = 0.016;
spray.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
const puff = new BABYLON.ParticleSystem('puff', 300, scene);
puff.particleTexture = dotTex; puff.emitter = new V3(0, 0, 0);
puff.minEmitBox = new V3(-0.4, 0, -0.4); puff.maxEmitBox = new V3(0.4, 0.1, 0.4);
puff.color1 = new BABYLON.Color4(1, 1, 1, 0.95); puff.color2 = new BABYLON.Color4(0.95, 0.97, 1, 0.8); puff.colorDead = new BABYLON.Color4(1, 1, 1, 0);
puff.minSize = 0.2; puff.maxSize = 0.9; puff.minLifeTime = 0.4; puff.maxLifeTime = 1.0;
puff.emitRate = 0; puff.manualEmitCount = 0; puff.gravity = new V3(0, -4, 0);
puff.direction1 = new V3(-2, 2, -2); puff.direction2 = new V3(2, 5, 2);
puff.minEmitPower = 1; puff.maxEmitPower = 3; puff.updateSpeed = 0.016;
puff.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
if (!SIM) { snowfall.start(); spray.start(); puff.start(); }

// ------------------------------------------------------------------ the course
// The course line runs from gate to gate (a smoothstep from each gate's predecessor into it). The
// forest keeps a groomed lane of `corridor` metres either side of that line, so the line is always
// skiable and skiing straight down the middle is not: once the forest starts, the lane wanders off.
const courseCache = new Map();
// the slalom swings around a centre line that starts drifting across the slope at the forest edge
const courseCentre = (z) => 17 * smooth(450, 800, z) * Math.sin((z - 450) / 380);
// the gates of chunk i (none in chunk 0): deterministic, alternating sides of the centre line, each
// within reach of the previous gate so the course stays skiable; `prev` is where the line comes from
function gatesFor(i) {
  if (i <= 0) return [];
  if (courseCache.has(i)) return courseCache.get(i);
  const rng = mulberry32(0x51ED270B ^ (i * 104729 + 3));
  const z0 = i * L, nG = rng() < level(z0 + L / 2).twoGates ? 2 : 1, out = [];
  let prev = gatesFor(i - 1).at(-1) || { x: 0, z: L - 30, side: 1 };          // the run starts at x = 0
  for (let k = 0; k < nG; k++) {
    const z = z0 + 6 + (k + 0.2 + rng() * 0.6) * ((L - 10) / nG), lv = level(z), side = -prev.side;
    const reach = Math.min(18, 0.45 * (z - prev.z)), lim = T.halfWidth - lv.corridor - 4;
    const want = courseCentre(z) + side * lv.amp * (0.65 + 0.35 * rng());
    const g = { x: clamp(clamp(want, prev.x - reach, prev.x + reach), -lim, lim), z, side, half: lv.gateHalf, red: side > 0, prev: { x: prev.x, z: prev.z } };
    out.push(g); prev = g;
  }
  courseCache.set(i, out);
  return out;
}
function nextGate(z) {
  const ci = chunkIndexAt(z);
  for (let i = Math.max(1, ci); i <= ci + 2; i++) for (const g of gatesFor(i)) if (g.z >= z) return g;
  return null;
}
// x of the course line at z
function courseX(z) {
  const g = nextGate(z);
  if (!g || z <= g.prev.z) return g ? g.prev.x : 0;
  const u = (z - g.prev.z) / (g.z - g.prev.z);
  return g.prev.x + (g.x - g.prev.x) * u * u * (3 - 2 * u);
}
// how far the line bends away from its own tangent over the next `ahead` metres (a kicker's flight)
function courseBend(z, ahead) {
  const x0 = courseX(z), slope = courseX(z + 0.5) - courseX(z - 0.5);
  let dev = 0;
  for (let s = 3; s <= ahead; s += 3) dev = Math.max(dev, Math.abs(courseX(z + s) - (x0 + slope * s)));
  return dev;
}
// half-width of the groomed lane at z (the top of the run opens wider still)
function laneAt(z) {
  const c = level(z).corridor;
  return z < L ? lerp(34, c, clamp((z - 6) / (L - 6), 0, 1)) : c;
}
// Kickers and logs are planned per chunk like the gates (deterministic, memoised) so a chunk can see
// its neighbours' and keep every jump's landing clear across chunk borders. Both sit where the line
// bends little over the flight: nobody can steer in the air, so the dog lands where the line was
// heading — still well inside the lane, and nothing is allowed in the landing zone.
const kickerCache = new Map(), logCache = new Map();
const plannedCount = (v, rng) => Math.floor(v + rng());                          // 0.6 → 0 or 1, 0.6 on average
function kickersFor(i) {
  if (i < 0) return [];
  if (kickerCache.has(i)) return kickerCache.get(i);
  const rng = mulberry32(0x6B1C4E2D ^ (i * 15485863 + 7)), z0 = i * L, out = [];
  const prev = kickersFor(i - 1), gates = gatesFor(i);
  for (let k = plannedCount(level(z0 + L / 2).kickers, rng), tries = 0; k > 0 && tries < 24; tries++) {
    const z = z0 + 14 + rng() * (L - 28);                                        // the bump stays inside its chunk's ground
    if (gates.some((g) => Math.abs(g.z - z) < 6) || [...prev, ...out].some((r) => Math.abs(r.z - z) < 36) || courseBend(z, 27) > 3) continue;
    out.push({ x: courseX(z), z, rx: 2.8, rz: 4.6, h: 1.3 + rng() * 0.5 }); k--;
  }
  kickerCache.set(i, out);
  return out;
}
function logsFor(i) {
  if (i < 0) return [];
  if (logCache.has(i)) return logCache.get(i);
  const rng = mulberry32(0x2F6E2B17 ^ (i * 32452843 + 11)), z0 = i * L, out = [];
  const prev = logsFor(i - 1), gates = gatesFor(i), kicks = [...kickersFor(i - 1), ...kickersFor(i), ...kickersFor(i + 1)];
  for (let k = plannedCount(level(z0 + L / 2).logs, rng), tries = 0; k > 0 && tries < 24; tries++) {
    const z = z0 + 5 + rng() * (L - 10);
    if (gates.some((g) => Math.abs(g.z - z) < 7) || kicks.some((r) => z > r.z - 20 && z < r.z + 32)) continue;
    if ([...prev, ...out].some((o) => Math.abs(o.z - z) < 30) || courseBend(z - 8, 30) > 3.5) continue;
    out.push({ x: courseX(z), z, half: Math.min(T.logMaxHalf, laneAt(z) + 1.2) }); k--;
  }
  logCache.set(i, out);
  return out;
}
// the stretch a jump or a kicker needs clear of rocks: its run-up and where it comes down
const inFlightZone = (i, z) => [i - 1, i, i + 1].some((k) => kickersFor(k).some((r) => z > r.z - 12 && z < r.z + 34) || logsFor(k).some((o) => z > o.z - 8 && z < o.z + 28));

// ------------------------------------------------------------------ chunks
const haloMat = new BABYLON.StandardMaterial('halo', scene);
haloMat.diffuseTexture = dotTex; haloMat.opacityTexture = dotTex; haloMat.diffuseColor = new BABYLON.Color3(1, 0.86, 0.4);
haloMat.disableLighting = true; haloMat.alpha = 0.7; haloMat.backFaceCulling = false; haloMat.fogEnabled = false;   // blended, not added: added light vanishes on white snow
const zeroMat = BABYLON.Matrix.Zero();
function makeChunk(i) {
  const rng = mulberry32(0x9E3779B1 ^ (i * 7919 + 17));
  const z0 = i * L, lv = level(z0 + L / 2);
  const c = { i, z0, trees: [], rocks: [], gates: [], bones: [], ramps: [], logs: [], gold: null, meshes: [], casters: [] };
  const rr = (a, b) => a + rng() * (b - a);
  const count = (v) => plannedCount(v, rng);
  const far = (x, z, list, d) => list.every((o) => (o.x - x) * (o.x - x) + (o.z - z) * (o.z - z) > d * d);
  const farZ = (z, list, d) => list.every((o) => Math.abs(o.z - z) > d);
  for (const g of gatesFor(i)) c.gates.push({ x: g.x, z: g.z, half: g.half, red: g.red, done: false });
  // kickers on the line; fallen logs across the lane: jump them (a wide lane leaves room to go round)
  c.ramps = kickersFor(i);
  for (const lg of logsFor(i)) c.logs.push({ ...lg, done: false });
  // a golden bone on the line every few hundred metres gives a lost bone back
  if (i >= 6 && (i - 6) % T.goldEvery === 0) {
    for (let tries = 0; tries < 14 && !c.gold; tries++) {
      const z = rr(z0 + 8, z0 + L - 8);
      if (farZ(z, c.gates, 5) && farZ(z, c.logs, 6) && !c.ramps.some((r) => Math.abs(r.z - z) < 8)) c.gold = { x: courseX(z), z, taken: false };
    }
  }
  // bones: a trail along the line into each gate (the trail of the next chunk's first gate spills
  // into this one); none on a log or under the golden bone
  for (const g of [...gatesFor(i), ...gatesFor(i + 1).slice(0, 1)]) {
    const n = Math.min(9, Math.floor((g.z - g.prev.z - 8) / 3));
    for (let k = 0; k < n; k++) {
      const z = g.z - 2.5 - k * 3;
      if (z < z0 || z >= z0 + L || !farZ(z, c.logs, 2.5) || (c.gold && Math.abs(z - c.gold.z) < 2.5)) continue;
      c.bones.push({ x: courseX(z), z, taken: false, phase: rng() * 6.28 });
    }
  }
  // rocks inside the lane but never on the line: skiing the line is safe, wandering is not
  for (let k = count(lv.rocks), tries = 0; k > 0 && tries < 30; tries++) {
    const z = rr(z0 + 3, z0 + L - 3), s = rr(0.6, 1.15);
    const minOff = T.rockR * s + T.dogR + 1.3, maxOff = laneAt(z) - 0.6;
    if (maxOff <= minOff) continue;
    const x = courseX(z) + (rng() < 0.5 ? -1 : 1) * rr(minOff, maxOff);
    if (!far(x, z, c.gates, 5) || inFlightZone(i, z) || !far(x, z, c.rocks, 5) || (c.gold && !far(x, z, [c.gold], 4))) continue;
    c.rocks.push({ x, z, s, rot: rng() * Math.PI * 2 }); k--;
  }
  // the forest: half of it crowds the edge of the lane (a tree line you can read from far away), the
  // rest is spread over the slope; nothing grows inside the lane
  const nTrees = Math.round(lv.trees);
  let tries = 0;
  while (c.trees.length < nTrees && tries++ < nTrees * 14 + 40) {
    const z = z0 + rr(0, L), cx = courseX(z), lane = laneAt(z);
    const x = rng() < 0.5 ? cx + (rng() < 0.5 ? -1 : 1) * (lane + rr(0.4, 7)) : rr(-(T.halfWidth + 14), T.halfWidth + 14);
    const d = Math.abs(x - cx);
    if (d < lane || !far(x, z, c.ramps, 7) || !far(x, z, c.trees, 2.4)) continue;
    // pines along the lane are slimmer, so their branches don't hang over it (the hit is the trunk)
    c.trees.push({ x, z, s: rr(0.55, 0.95), w: lerp(0.62, 1, smooth(lane, lane + 6, d)), rot: rng() * Math.PI * 2 });
  }
  for (let k = 0; k < 34; k++) {
    const side = rng() < 0.5 ? -1 : 1;
    c.trees.push({ x: side * rr(T.halfWidth + 1, T.halfWidth + 18), z: z0 + rr(0, L), s: rr(0.7, 1.2), w: 1, rot: rng() * Math.PI * 2 });
  }
  // a few boulders out in the forest
  for (let k = lv.zone >= 1 ? 3 : 0, n = 0; k > 0 && n < 40; n++) {
    const x = rr(-T.halfWidth, T.halfWidth), z = z0 + rr(0, L), s = rr(0.6, 1.4);
    if (Math.abs(x - courseX(z)) < laneAt(z) + 1 || !far(x, z, c.trees, 2.2) || !far(x, z, c.rocks, 4) || !far(x, z, c.ramps, 7)) continue;
    c.rocks.push({ x, z, s, rot: rng() * Math.PI * 2 }); k--;
  }
  chunks.set(i, c);
  buildChunkMeshes(c);
  return c;
}

// height of the rendered ground mesh (its triangles, not the exact terrain) for things laid on the snow
function meshH(c, x, z) {
  const nx = T.gridX, nz = T.gridZ, W = T.chunkHalfW;
  const gx = ((x + W) / (2 * W)) * nx, gz = ((z - c.z0) / L) * nz;
  const i0 = clamp(Math.floor(gx), 0, nx - 1), j0 = clamp(Math.floor(gz), 0, nz - 1), fx = gx - i0, fz = gz - j0;
  const X = (i) => -W + (2 * W * i) / nx, Z = (j) => c.z0 + (L * j) / nz;
  const ha = terrainH(X(i0), Z(j0), c.ramps), hb = terrainH(X(i0 + 1), Z(j0), c.ramps), hd = terrainH(X(i0), Z(j0 + 1), c.ramps);
  if (fx + fz <= 1) return ha + (hb - ha) * fx + (hd - ha) * fz;
  const he = terrainH(X(i0 + 1), Z(j0 + 1), c.ramps);
  return he + (hd - he) * (1 - fx) + (hb - he) * (1 - fz);
}
function buildChunkMeshes(c) {
  const nx = T.gridX, nz = T.gridZ, W = T.chunkHalfW;
  const positions = new Float32Array((nx + 1) * (nz + 1) * 3), colors = new Float32Array((nx + 1) * (nz + 1) * 4);
  const uvs = new Float32Array((nx + 1) * (nz + 1) * 2);
  const indices = new Uint32Array(nx * nz * 6);
  const n = new V3();
  let p = 0, q = 0;
  for (let j = 0; j <= nz; j++) {
    const z = c.z0 + (L * j) / nz, cx = courseX(z), lane = laneAt(z);
    for (let i = 0; i <= nx; i++) {
      const x = -W + (2 * W * i) / nx;
      positions[p++] = x; positions[p++] = terrainH(x, z, c.ramps); positions[p++] = z;
      uvs[(j * (nx + 1) + i) * 2] = x / (2 * W); uvs[(j * (nx + 1) + i) * 2 + 1] = z / (2 * W);
      terrainNormal(x, z, n);
      const flat = Math.pow(clamp(n.y, 0, 1), 6);
      // the groomed lane is a touch bluer than the powder around it, with a soft line along its edge
      const d = Math.abs(x - cx), piste = 1 - smooth(lane - 1.2, lane + 1.2, d), shade = 1 - 0.06 * Math.exp(-((d - lane) * (d - lane)) / 0.8);
      colors[q++] = lerp(0.78, 0.98, flat) * lerp(1, 0.9, piste) * shade;
      colors[q++] = lerp(0.84, 0.985, flat) * lerp(1, 0.94, piste) * shade;
      colors[q++] = lerp(0.95, 1.0, flat) * shade;
      colors[q++] = 1;
    }
  }
  let k = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
    indices[k++] = a; indices[k++] = d; indices[k++] = b; indices[k++] = b; indices[k++] = d; indices[k++] = e;
  }
  const normals = [];
  BABYLON.VertexData.ComputeNormals(positions, indices, normals);
  const ground = new BABYLON.Mesh('ground' + c.i, scene);
  const vd = new BABYLON.VertexData();
  vd.positions = positions; vd.indices = indices; vd.normals = normals; vd.colors = colors; vd.uvs = uvs;
  vd.applyToMesh(ground);
  ground.material = snowMat; ground.receiveShadows = true; ground.isPickable = false;
  c.meshes.push(ground);

  // thin instances of a base mesh, one per object; returns the mesh and its matrix buffer
  const place = (base, list, name, yOff, scaleOf) => {
    if (!list.length) return null;
    const m = base.clone(name + c.i); m.setEnabled(true); m.isPickable = false;
    m.makeGeometryUnique();   // thin instances on a clone that shares geometry render nothing
    const buf = new Float32Array(list.length * 16);
    const mat = new BABYLON.Matrix(), sc = new V3();
    list.forEach((o, idx) => {
      o.instance = idx;
      o.y = terrainH(o.x, o.z, c.ramps) + (yOff || 0);
      if (scaleOf) scaleOf(o, sc); else sc.setAll(o.s || 1);
      BABYLON.Matrix.ComposeToRef(sc, BABYLON.Quaternion.FromEulerAngles(0, o.rot || 0, 0), new V3(o.x, o.y, o.z), mat);
      mat.copyToArray(buf, idx * 16);
    });
    m.thinInstanceSetBuffer('matrix', buf, 16, false);
    c.meshes.push(m);
    return { mesh: m, buf };
  };
  const trees = place(baseTree, c.trees, 'trees', -0.15, (o, sc) => sc.set(o.s * o.w, o.s, o.s * o.w));
  if (trees) { c.treeMesh = trees.mesh; c.treeBuf = trees.buf; for (const t of c.trees) { t.duck = 0; t.vis = 1; } }
  const rocks = place(baseRock, c.rocks, 'rocks', -0.25);
  const bones = place(baseBone, c.bones, 'bones', 0.7, (o, sc) => sc.setAll(1.35));
  if (bones) {
    c.boneMesh = bones.mesh; c.boneBuf = bones.buf;
    bones.mesh.renderOutline = true; bones.mesh.outlineWidth = 0.02; bones.mesh.outlineColor = new BABYLON.Color3(0.36, 0.24, 0.12);
  }
  const poles = [];
  for (const g of c.gates) poles.push({ x: g.x - g.half, z: g.z, rot: 0, red: g.red }, { x: g.x + g.half, z: g.z, rot: Math.PI, red: g.red });
  place(baseRed, poles.filter((o) => o.red), 'gatesRed', 0, (o, sc) => sc.setAll(1));
  place(baseBlue, poles.filter((o) => !o.red), 'gatesBlue', 0, (o, sc) => sc.setAll(1));
  // logs: short segments that follow the snow across the lane
  const segs = [];
  for (const lg of c.logs) {
    const n = Math.max(2, Math.ceil((2 * lg.half) / 2.8)), len = (2 * lg.half) / n;
    for (let s = 0; s < n; s++) {
      const xa = lg.x - lg.half + s * len, xb = xa + len, ha = terrainH(xa, lg.z, c.ramps), hb = terrainH(xb, lg.z, c.ramps);
      segs.push({ x: (xa + xb) / 2, z: lg.z, y: (ha + hb) / 2 + T.logR - 0.08, len: len + 0.1, roll: Math.atan2(hb - ha, len) });
    }
  }
  let logs = null;
  if (segs.length) {
    const m = baseLog.clone('logs' + c.i); m.setEnabled(true); m.isPickable = false; m.makeGeometryUnique();
    const buf = new Float32Array(segs.length * 16), mat = new BABYLON.Matrix();
    segs.forEach((sg, idx) => {
      BABYLON.Matrix.ComposeToRef(new V3(sg.len, 1, 1), BABYLON.Quaternion.FromEulerAngles(0, 0, sg.roll), new V3(sg.x, sg.y, sg.z), mat);
      mat.copyToArray(buf, idx * 16);
    });
    m.thinInstanceSetBuffer('matrix', buf, 16, false);
    c.meshes.push(m); logs = m;
  }
  // kickers: an orange lip across the crest and a marker pole either side, readable from far away
  if (c.ramps.length) {
    const pos = [], idx = [], segN = 16;
    for (const r of c.ramps) {
      const base = pos.length / 3;
      for (let s = 0; s <= segN; s++) {
        const x = r.x + lerp(-1.7, 1.7, s / segN) * r.rx;
        for (const dz of [-0.6, 0.3]) pos.push(x, meshH(c, x, r.z + dz) + 0.04, r.z + dz);
      }
      for (let s = 0; s < segN; s++) { const a = base + s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const lip = new BABYLON.Mesh('lip' + c.i, scene), lvd = new BABYLON.VertexData(), nrm = [];
    BABYLON.VertexData.ComputeNormals(pos, idx, nrm);
    lvd.positions = pos; lvd.indices = idx; lvd.normals = nrm; lvd.applyToMesh(lip);
    lip.material = lipMat; lip.isPickable = false;
    c.meshes.push(lip);
    const marks = [];
    for (const r of c.ramps) marks.push({ x: r.x - 1.9 * r.rx, z: r.z, rot: 0 }, { x: r.x + 1.9 * r.rx, z: r.z, rot: Math.PI });
    place(baseMarker, marks, 'markers', 0, (o, sc) => sc.setAll(1));
  }
  // the golden bone floats in a glow on the line
  if (c.gold) {
    const g = c.gold;
    g.y = terrainH(g.x, g.z, c.ramps) + 0.95;
    g.mesh = baseGold.clone('gold' + c.i); g.mesh.setEnabled(true); g.mesh.isPickable = false;
    g.mesh.position.set(g.x, g.y, g.z); g.mesh.scaling.setAll(1.9);
    g.mesh.renderOutline = true; g.mesh.outlineWidth = 0.02; g.mesh.outlineColor = new BABYLON.Color3(0.45, 0.28, 0.02);
    g.halo = BABYLON.MeshBuilder.CreatePlane('halo' + c.i, { size: 2.8 }, scene);
    g.halo.material = haloMat; g.halo.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; g.halo.isPickable = false;
    g.halo.position.set(g.x, g.y, g.z);
    c.meshes.push(g.mesh, g.halo);
  }
  c.casters = [trees, rocks, bones].filter(Boolean).map((o) => o.mesh).concat(logs ? [logs] : [], c.gold ? [c.gold.mesh] : []);
}
function disposeChunk(c) {
  for (const m of c.casters) shadows.removeShadowCaster(m);
  for (const m of c.meshes) m.dispose(false, false);
  chunks.delete(c.i);
}
function ensureChunks(z) {
  const ci = chunkIndexAt(z);
  for (let i = Math.max(0, ci - T.behind); i <= ci + T.ahead; i++) if (!chunks.has(i)) makeChunk(i);
  for (const c of [...chunks.values()]) if (c.i < ci - T.behind || c.i > ci + T.ahead) disposeChunk(c);
  for (const c of chunks.values()) {
    const near = c.i === ci || c.i === ci + 1;
    for (const m of c.casters) { if (near) shadows.addShadowCaster(m, false); else shadows.removeShadowCaster(m); }
  }
}

// ------------------------------------------------------------------ the dog
const dogRoot = new BABYLON.TransformNode('dogRoot', scene);     // on the snow, heading
const dogPivot = new BABYLON.TransformNode('dogPivot', scene);   // model orientation fix + crouch
dogPivot.parent = dogRoot;
dogRoot.rotationQuaternion = BABYLON.Quaternion.Identity();
let dogMeshes = [];
let kneeTarget = null, accNode = null, rig = null;
const skiMat = new BABYLON.StandardMaterial('ski', scene);
skiMat.diffuseColor = new BABYLON.Color3(0.80, 0.22, 0.20); skiMat.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5); skiMat.specularPower = 64;
const tipMat = new BABYLON.StandardMaterial('tip', scene);
tipMat.diffuseColor = new BABYLON.Color3(0.95, 0.95, 0.92); tipMat.specularColor = new BABYLON.Color3(0.4, 0.4, 0.4);
const bindMat = new BABYLON.StandardMaterial('bind', scene);
bindMat.diffuseColor = new BABYLON.Color3(0.12, 0.13, 0.15); bindMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
const trailMat = new BABYLON.StandardMaterial('trail', scene);
trailMat.diffuseColor = new BABYLON.Color3(0.70, 0.80, 0.94); trailMat.emissiveColor = new BABYLON.Color3(0.05, 0.08, 0.14);
trailMat.specularColor = BABYLON.Color3.Black(); trailMat.alpha = 0.42; trailMat.backFaceCulling = false;
const skiTails = [], trails = [];
function buildSkis(pawsZ, lateral) {
  const skiLen = 1.55, mid = (pawsZ[0] + pawsZ[1]) / 2;
  for (const side of [-1, 1]) {
    const ski = BABYLON.MeshBuilder.CreateBox('ski', { width: 0.11, height: 0.028, depth: skiLen }, scene);
    ski.material = skiMat; ski.parent = dogRoot; ski.position.set(side * lateral, 0.014, mid + 0.1); ski.isPickable = false;
    const tip = BABYLON.MeshBuilder.CreateBox('tip', { width: 0.11, height: 0.028, depth: 0.22 }, scene);
    tip.material = tipMat; tip.parent = dogRoot; tip.position.set(side * lateral, 0.06, mid + 0.1 + skiLen / 2 + 0.06); tip.rotation.x = -0.55; tip.isPickable = false;
    for (const pz of pawsZ) {
      const b = BABYLON.MeshBuilder.CreateBox('bind', { width: 0.12, height: 0.05, depth: 0.16 }, scene);
      b.material = bindMat; b.parent = dogRoot; b.position.set(side * lateral, 0.04, pz); b.isPickable = false;
    }
    shadows.addShadowCaster(ski, false);
    const tail = new BABYLON.TransformNode('skiTail', scene);
    tail.parent = dogRoot; tail.position.set(side * lateral, 0.02, mid + 0.1 - skiLen / 2);
    skiTails.push(tail);
    if (!SIM) {
      const trail = new BABYLON.TrailMesh('trail', tail, scene, 0.07, 70, true);
      trail.material = trailMat; trail.isPickable = false; trails.push(trail);
    }
  }
}
let scarf = null, scarfBase = null;
function buildScarf(anchor) {
  const segs = 12, w = 0.10;
  const pos = new Float32Array((segs + 1) * 2 * 3), idx = [];
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  scarf = new BABYLON.Mesh('scarf', scene);
  const vd = new BABYLON.VertexData(); vd.positions = pos; vd.indices = idx; vd.uvs = new Float32Array((segs + 1) * 2 * 2);
  vd.applyToMesh(scarf, true);
  const m = new BABYLON.StandardMaterial('scarfMat', scene);
  m.diffuseColor = new BABYLON.Color3(0.82, 0.2, 0.18); m.backFaceCulling = false; m.specularColor = BABYLON.Color3.Black();
  scarf.material = m; scarf.parent = dogRoot; scarf.isPickable = false;
  scarfBase = anchor.clone();
  scarf.userData = { segs, w, pos };
}
function updateScarf(t, speed, air) {
  if (!scarf) return;
  const { segs, w, pos } = scarf.userData;
  const len = 0.55 + Math.min(0.35, speed * 0.012);
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const wave = Math.sin(t * 9 - u * 6) * 0.05 * u + Math.sin(t * 13 - u * 9) * 0.02 * u;
    const drop = u * u * (0.18 - Math.min(0.15, speed * 0.006)) + (air ? -0.08 * u : 0);
    const x = scarfBase.x + wave, y = scarfBase.y + 0.06 - drop - T.kneeDrop * state.crouch * 0.8, z = scarfBase.z - 0.05 - u * len;
    const k = i * 6;
    pos[k] = x - w / 2; pos[k + 1] = y; pos[k + 2] = z;
    pos[k + 3] = x + w / 2; pos[k + 4] = y + wave * 0.5; pos[k + 5] = z;
  }
  scarf.updateVerticesData(BABYLON.VertexBuffer.PositionKind, pos, false, false);
}

function decodeDataUrl(url) {
  const b = atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
  return new File([bytes], 'dog.glb', { type: 'model/gltf-binary' });
}
async function loadDog() {
  // Vite gives a URL in dev and a data: URL in the single-file artifact build
  const source = dogGlb.startsWith('data:') ? decodeDataUrl(dogGlb) : dogGlb;
  const result = await BABYLON.ImportMeshAsync(source, scene, { pluginExtension: '.glb' });
  dogMeshes = result.meshes;
  const root = dogMeshes.find((m) => !m.parent) || dogMeshes[0];
  root.parent = dogPivot;
  dogRoot.position.setAll(0); dogRoot.rotationQuaternion = BABYLON.Quaternion.Identity();
  dogRoot.computeWorldMatrix(true); dogPivot.computeWorldMatrix(true);
  scene.updateTransformMatrix(); root.computeWorldMatrix(true);
  let min = new V3(1e9, 1e9, 1e9), max = new V3(-1e9, -1e9, -1e9);
  for (const m of dogMeshes) {
    if (!m.getTotalVertices || !m.getTotalVertices()) continue;
    m.computeWorldMatrix(true);
    const bb = m.getBoundingInfo().boundingBox;
    min = V3.Minimize(min, bb.minimumWorld); max = V3.Maximize(max, bb.maximumWorld);
    m.receiveShadows = false; m.isPickable = false;
  }
  const center = min.add(max).scale(0.5);
  const nose = dogMeshes.find((m) => /nose/i.test(m.name));
  const noseP = nose ? nose.getBoundingInfo().boundingBox.centerWorld : center.add(new V3(1, 0, 0));
  const dir = noseP.subtract(center); dir.y = 0;
  // Babylon's rotation.y turns +X toward -Z, so the yaw that brings the nose to +Z is -atan2(x, z)
  dogPivot.rotation.y = -Math.atan2(dir.x, dir.z);
  dogPivot.position.y = -min.y + 0.03;
  dogPivot.computeWorldMatrix(true); scene.updateTransformMatrix();
  for (const m of dogMeshes) m.computeWorldMatrix(true);
  buildSkis([0.29, -0.25], 0.085);   // paws sit 0.29 m ahead / 0.25 m behind the model origin
  // knee bend without a skeleton: a morph target that shortens the legs (below the belly line) by
  // 30% and drops the body by the same amount; eyes, nose and collar ride along on a helper node
  const body = dogMeshes.find((m) => m.name === 'Dog');
  if (body && !(result.skeletons && result.skeletons.length)) {
    const src = body.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const B = T.kneeDrop / 0.3, bent = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 3) {
      const y = src[i + 1];
      bent[i] = src[i]; bent[i + 1] = y < B ? y * 0.7 : y - 0.3 * B; bent[i + 2] = src[i + 2];
    }
    kneeTarget = new BABYLON.MorphTarget('knees', 0, scene);
    kneeTarget.setPositions(bent);
    const mtm = new BABYLON.MorphTargetManager(scene);
    mtm.addTarget(kneeTarget);
    body.morphTargetManager = mtm;
    accNode = new BABYLON.TransformNode('accessories', scene);
    accNode.parent = root;
    for (const m of dogMeshes) if (/eye|nose|collar|buckle|rivet/i.test(m.name)) m.setParent(accNode);
  }
  const collar = dogMeshes.find((m) => /collar/i.test(m.name));
  if (collar) {
    const local = collar.getBoundingInfo().boundingBox.centerWorld.clone();
    local.z -= 0.05;
    buildScarf(local);
  }
  for (const m of dogMeshes) if (m.getTotalVertices && m.getTotalVertices()) shadows.addShadowCaster(m, false);
  if (result.skeletons && result.skeletons.length) setupRig(result.skeletons[0]);
  state.ready = true;
}

// ------------------------------------------------------------------ skeleton animation
// The GLB carries a small rig (hips/spine/chest/neck/head, ears, tail, four 3-bone legs). Bones are
// driven every frame in "dog space" (dogRoot local: +Z forward, +Y up, +X the dog's right) with
// matrices: each bone starts from its rest local transform under its (already animated) parent, is
// rotated about its own joint by a dog-space rotation and/or translated, then written back as a local
// transform. Matrices, not quaternions, because the glTF root is mirrored (scale 1,1,-1).
const M4 = BABYLON.Matrix;
const tmpM = { base: new M4(), a: new M4(), b: new M4(), c: new M4(), inv: new M4(), R: new M4() };
const tmpS = new V3(), tmpQ = new BABYLON.Quaternion(), tmpP = new V3();
function setupRig(skeleton) {
  const nodes = new Map();
  for (const b of skeleton.bones) { const n = b.getTransformNode ? b.getTransformNode() : null; if (n) nodes.set(b.name, n); }
  if (!nodes.has('hips') || !nodes.has('head')) { console.warn('rig: expected bones missing', [...nodes.keys()]); return; }
  dogPivot.scaling.set(1, 1, 1);                                            // the unrigged squash may have run before the model arrived
  dogPivot.computeWorldMatrix(true);
  scene.updateTransformMatrix();
  for (const n of nodes.values()) { n.computeWorldMatrix(true); if (!n.rotationQuaternion) n.rotationQuaternion = BABYLON.Quaternion.FromEulerVector(n.rotation); }
  const rest = new Map(), parent = new Map(), order = [];
  const byNode = new Map([...nodes.entries()].map(([k, v]) => [v, k]));
  const visit = (name) => { if (order.includes(name)) return; const n = nodes.get(name); const pn = byNode.get(n.parent); if (pn) { visit(pn); parent.set(name, pn); } order.push(name); };
  for (const name of nodes.keys()) visit(name);
  for (const [name, n] of nodes) {
    rest.set(name, {
      local: M4.Compose(n.scaling, n.rotationQuaternion, n.position),   // rest local transform
      world: n.getWorldMatrix().clone(),                                   // rest transform in dog space
      parentWorld: n.parent ? n.parent.getWorldMatrix().clone() : M4.Identity(),
      pos: n.getAbsolutePosition().clone(),
    });
  }
  const legs = [];
  for (const [u, l, pw] of [['shoulder.L', 'forearm.L', 'fpaw.L'], ['shoulder.R', 'forearm.R', 'fpaw.R'], ['thigh.L', 'shin.L', 'hpaw.L'], ['thigh.R', 'shin.R', 'hpaw.R']]) {
    if (!nodes.has(u) || !nodes.has(l) || !nodes.has(pw)) continue;
    const H = rest.get(u).pos, K = rest.get(l).pos, A = rest.get(pw).pos;
    const hk = K.subtract(H), ka = A.subtract(K), ha = A.subtract(H);
    const side = u.startsWith('shoulder') ? 1 : -1;                          // elbow bends back, knee forward
    legs.push({ u, l, pw, H, K, A, a: hk.length(), b: ka.length(), side, u0: hk.normalizeToNew(), l0: ka.normalizeToNew() });
  }
  rig = { nodes, rest, parent, order, legs, tailPhase: 0, world: new Map() };
  if (kneeTarget) kneeTarget.influence = 0;
}
// pose one bone: rest local under the current parent, optional dog-space rotation about its joint,
// optional dog-space translation, optional fixed dog-space orientation; writes the node's local transform
function poseBone(name, opts) {
  const n = rig.nodes.get(name), r = rig.rest.get(name);
  const Pw = rig.parent.has(name) ? rig.world.get(rig.parent.get(name)) : r.parentWorld;
  const W = tmpM.base;
  r.local.multiplyToRef(Pw, W);                                             // base = local * parent (row-vector convention)
  if (opts && opts.rotations) {
    for (const [axis, angle] of opts.rotations) {
      if (!angle) continue;
      W.getTranslationToRef(tmpP);
      M4.TranslationToRef(-tmpP.x, -tmpP.y, -tmpP.z, tmpM.a);
      M4.RotationAxisToRef(axis, angle, tmpM.R);
      M4.TranslationToRef(tmpP.x, tmpP.y, tmpP.z, tmpM.b);
      W.multiplyToRef(tmpM.a, tmpM.c); tmpM.c.multiplyToRef(tmpM.R, tmpM.a); tmpM.a.multiplyToRef(tmpM.b, W);
    }
  }
  if (opts && (opts.orient || opts.keepRestOrientation)) {
    // absolute orientation in dog space: the rest orientation (optionally rotated about the joint by the
    // rotation taking `from` to `to`) at the joint's current position; ignores the parent's rotation
    W.getTranslationToRef(tmpP);
    tmpM.a.copyFrom(r.world);
    if (opts.orient) {
      const [from, to] = opts.orient;
      BABYLON.Quaternion.FromUnitVectorsToRef(from, to, tmpQ);
      M4.FromQuaternionToRef(tmpQ, tmpM.R);
      M4.TranslationToRef(-r.pos.x, -r.pos.y, -r.pos.z, tmpM.b);
      M4.TranslationToRef(r.pos.x, r.pos.y, r.pos.z, tmpM.c);
      tmpM.a.multiplyToRef(tmpM.b, tmpM.inv); tmpM.inv.multiplyToRef(tmpM.R, tmpM.b); tmpM.b.multiplyToRef(tmpM.c, tmpM.a);
    }
    tmpM.a.setTranslation(tmpP);
    W.copyFrom(tmpM.a);
  }
  if (opts && opts.translate) { W.getTranslationToRef(tmpP); W.setTranslation(tmpP.addInPlace(opts.translate)); }
  rig.world.set(name, W.clone());
  Pw.invertToRef(tmpM.inv);
  W.multiplyToRef(tmpM.inv, tmpM.c);                                        // new local = world * parent^-1
  tmpM.c.decompose(tmpS, n.rotationQuaternion, n.position);
  n.scaling.copyFrom(tmpS);
  return rig.world.get(name);
}
const AX = new V3(1, 0, 0), AY = new V3(0, 1, 0), AZ = new V3(0, 0, 1);
function animateRig(dt) {
  const st = state, t = st.t, v = st.speed;
  const edge = Math.min(1, Math.abs(st.aLat) / T.g);
  const drop = T.kneeDrop * st.crouch;
  const roll = ROLL_SIGN * st.lean;
  const pitchTuck = 0.18 * (st.tuck ? 1 : 0) + 0.10 * st.crouch;
  rig.tailPhase += dt * (6 + 6 * edge + (st.landBounce > 0 ? 8 : 0));
  const wagAmp = 0.12 + 0.3 * edge + 0.35 * st.landBounce + (st.running ? 0 : 0.15);
  const look = clamp(0.9 * st.lean + 0.15 * st.heading, -0.5, 0.5);
  for (const name of rig.order) {
    if (name === 'hips') { poseBone(name, { rotations: [[AZ, -0.08 * roll]], translate: new V3(0, -drop, 0) }); continue; }
    if (name === 'spine') { poseBone(name, { rotations: [[AZ, -0.12 * roll]] }); continue; }
    if (name === 'chest') { poseBone(name, { rotations: [[AZ, -0.14 * roll]] }); continue; }
    if (name === 'neck') { poseBone(name, { rotations: [[AZ, -0.12 * roll], [AX, -0.6 * pitchTuck]] }); continue; }
    if (name === 'head') { poseBone(name, { rotations: [[AZ, -0.2 * roll], [AY, look], [AX, -pitchTuck + (st.air ? -0.15 : 0)]] }); continue; }
    if (name.startsWith('ear.')) {
      const sgn = name.endsWith('L') ? 1 : -1;
      const flap = Math.sin(t * 13 + sgn * 1.3) * 0.10 * Math.min(1, v / 15) + st.landBounce * 0.45 - (st.air ? 0.25 : 0);
      poseBone(name, { rotations: [[AX, flap]] }); continue;
    }
    if (name.startsWith('tail.')) {
      const k = Number(name.slice(5));                                      // 1..3: whip lag along the tail
      const swing = Math.sin(rig.tailPhase - k * 0.9) * wagAmp * (0.6 + 0.4 * k) - 0.18 * st.lean * k;
      const lift = 0.35 * Math.min(1, v / 20) * (k === 1 ? 1 : 0.5) + (st.air ? 0.5 : 0) - 0.25 * st.crouch;
      poseBone(name, { rotations: [[AY, swing], [AX, -lift]] }); continue;
    }
    const leg = rig.legs.find((L) => L.u === name);
    if (leg) {                                                              // two-bone IK: the joint dropped with the body, the paw stays on the ski
      const Wu = poseBone(leg.u, null);                                     // where the shoulder/hip joint is now
      const Hn = Wu.getTranslation();
      const ha = leg.A.subtract(Hn);
      const d = clamp(ha.length(), Math.abs(leg.a - leg.b) + 0.002, leg.a + leg.b - 0.002);
      const dir = ha.normalizeToNew();
      const alpha = Math.acos(clamp((leg.a * leg.a + d * d - leg.b * leg.b) / (2 * leg.a * d), -1, 1));
      const un = V3.TransformCoordinates(dir, M4.RotationAxis(AX, leg.side * alpha)).normalize();
      const Kn = Hn.add(un.scale(leg.a));
      const ln = leg.A.subtract(Kn).normalize();
      poseBone(leg.u, { orient: [leg.u0, un] });
      poseBone(leg.l, { orient: [leg.l0, ln] });
      poseBone(leg.pw, { keepRestOrientation: true });
      continue;
    }
    if (rig.legs.some((L) => L.l === name || L.pw === name)) continue;      // handled with their upper bone
    poseBone(name, null);
  }
}
// ------------------------------------------------------------------ kit: hud, input, sound
const hud = createHud(null, { gameId: 'ski', music: { seed: 11, bpm: 128, root: 67 } });
const input = createInput({ touch: 'auto' });
input.touch?.setLabels({ a: '⬆️', b: '⬇️' });
const JUMP_KEY = input.touch ? '⬆️' : 'רווח';
let wind = null;
function windSetup() {
  const ctx = ensureAudio();
  if (!ctx || wind) return;
  const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 500; filter.Q.value = 0.7;
  const gain = ctx.createGain(); gain.gain.value = 0;
  src.connect(filter).connect(gain).connect(ctx.destination); src.start();
  wind = { filter, gain };
}
const sfx = {
  pickup() { beep(880, 0, 0.12, 'sine', 0.16, 1320); },
  gate(mult = 1) { const f = Math.pow(2, (Math.min(mult, T.streakMax) - 1) / 6); chord([659 * f, 988 * f], 0.09, 0.2, 'triangle', 0.16); },
  log() { beep(587, 0, 0.1, 'triangle', 0.14, 880); beep(880, 0.08, 0.14, 'triangle', 0.12, 1175); },
  gold() { chord([784, 988, 1175, 1568], 0.07, 0.3, 'sine', 0.16); },
  zone() { chord([523, 659, 784, 1046], 0.11, 0.35, 'triangle', 0.13); },
  jump() { noise(0.25, 1800, 0.12); },
  land() { noise(0.18, 400, 0.25); },
  trick() { beep(523, 0, 0.1, 'square', 0.1, 1046); beep(784, 0.1, 0.18, 'square', 0.1, 1568); },
  crash() { noise(0.4, 500, 0.5); beep(190, 0.06, 0.22, 'sawtooth', 0.3, 95); },
  over() { beep(392, 0, 0.3, 'triangle', 0.18, 196); },
};
function drawLives() {
  hud.set('#lives', '🦴'.repeat(Math.max(0, state.lives)) + '◽'.repeat(Math.max(0, T.lives - state.lives)));
}
function drawStreak(pop) {
  const m = Math.min(T.streakMax, state.streak);
  if (m < 2) { hud.hide('#streak'); return; }
  hud.set('#streak', `🔥 ‎×${m}`);
  hud.show('#streak');
  if (pop) hud.pop('#streak');
}
// zone names and first-time hints: a card under the badges with its own timer (the centre flash
// belongs to gates and bones, which would cut a zone name short)
const bannerEl = document.getElementById('banner');
let bannerTime = 0;
function banner(text, dur) {
  if (!bannerEl) return;
  bannerEl.textContent = text; bannerEl.classList.add('show'); bannerTime = dur;
}
let hudTick = 0;
function updateHUD(force) {
  if (!force && (hudTick++ % 4)) return;
  hud.set('#score', `⭐ ${Math.round(state.score)}`);
  hud.set('#speed', `${Math.round(state.speed * 3.6)} קמ״ש`);
}

// ------------------------------------------------------------------ game flow
function resetRun() {
  for (const c of [...chunks.values()]) disposeChunk(c);
  Object.assign(state, { running: false, over: false, t: 0, x: 0, z: 4, heading: 0, speed: T.startSpeed, air: false, airTime: 0, spin: 0,
    lives: T.lives, score: 0, dist: 0, bones: 0, gates: 0, tuck: false, inv: 0, shake: 0, landBounce: 0, crouch: 0, overTimer: 0,
    lean: 0, leanVel: 0, kick: 0, kickSign: 0, prevTurn: 0, aLat: 0, skid: 0,
    zone: -1, streak: 0, bestStreak: 0, logs: 0, golds: 0, logHint: false, goldHint: false, jumpBuf: 0 });
  ensureChunks(state.z);
  state.y = terrainH(state.x, state.z); state.vy = 0;
  bannerTime = 0; bannerEl?.classList.remove('show');
  drawLives(); drawStreak(); updateHUD(true);
  syncVisuals(0);
  for (const tr of trails) tr.reset();
}
function startRun() {
  windSetup();
  hud.hide('#intro'); hud.hide('#gameover');
  resetRun();
  state.running = true;
  hud.startMusic();
  canvas.focus();
}
function endRun() {
  state.running = false; state.over = true;
  hud.stopMusic();
  const best = hud.best('ski-best', Math.round(state.score));
  hud.set('#finalScore', `${Math.round(state.score)} נקודות!`);
  hud.set('#finalDetail', `גלשתם ${Math.round(state.dist)} מטר 🎿 · ${state.gates} שערים 🚩 · ${state.bones} עצמות 🦴`);
  hud.set('#finalZone', `הגעתם עד ${ZONES[Math.max(0, state.zone)].name}` + (state.bestStreak >= 2 ? ` · רצף שיא ‎×${Math.min(T.streakMax, state.bestStreak)} 🔥` : ''));
  hud.set('#bestScore', Math.round(state.score) >= best && state.score > 0 ? `שיא חדש! ${best} נקודות ⭐` : `השיא שלכם: ${best} נקודות ⭐`);
  hud.show('#gameover');
  sfx.over();
  updateHUD(true);
}
function hit(what) {
  if (state.inv > 0) return;
  state.lives -= 1; drawLives(); hud.pop('#lives');
  state.streak = 0; drawStreak();
  state.speed = Math.max(T.minSpeed, state.speed * 0.25); state.heading *= 0.3; state.inv = 2.2; state.shake = 1;
  puff.emitter = new V3(state.x, state.y + 0.2, state.z); puff.manualEmitCount = 60;
  sfx.crash();
  if (state.lives <= 0) { hud.flash('נפלתם בשלג! 🌨️', { bad: true, dur: 1400 }); state.running = false; state.over = true; state.overTimer = 1.2; }
  else hud.flash({ rock: 'אאוץ׳! סלע 🪨', log: 'אופס! גזע 🪵' }[what] || 'הב! עץ 🌲', { bad: true, dur: 900 });
}
function passGate() {
  state.gates++; state.streak++; state.bestStreak = Math.max(state.bestStreak, state.streak);
  const mult = Math.min(T.streakMax, state.streak), pts = 50 * mult;
  state.score += pts;
  hud.flash(mult > 1 ? `שער! ‎×${mult} ‎+${pts} 🚩` : 'שער! ‎+50 🚩', { good: true, dur: 900 });
  sfx.gate(mult); hud.pop('#score'); drawStreak(true);
}
function missGate() {
  hud.flash(state.streak >= 2 ? 'פספסתם שער — הרצף נגמר' : 'פספסתם את השער', { dur: 800 });
  state.streak = 0; drawStreak();
}
function clearLog() {
  state.logs++; state.score += 25;
  hud.flash('קפיצה מעל הגזע! ‎+25 🪵', { good: true, dur: 900 }); sfx.log(); hud.pop('#score');
}
function takeGold(g) {
  g.taken = true; state.golds++;
  g.mesh.setEnabled(false); g.halo.setEnabled(false);
  if (state.lives < T.lives) { state.lives++; drawLives(); hud.pop('#lives'); hud.flash('עצם זהב! עוד חיים ✨', { good: true, dur: 1300 }); }
  else { state.score += 100; hud.pop('#score'); hud.flash('עצם זהב! ‎+100 ✨', { good: true, dur: 1100 }); }
  sfx.gold();
}
function enterZone(k) {
  const first = state.zone < 0;
  state.zone = k;
  banner(ZONES[k].name, first ? 2.0 : 2.8);
  if (!first) sfx.zone();
}
// the first log and the first golden bone of a run are announced before they arrive
function hints() {
  if (state.logHint && state.goldHint) return;
  const ci = chunkIndexAt(state.z);
  for (const c of [chunks.get(ci), chunks.get(ci + 1)]) {
    if (!c) continue;
    if (!state.logHint && c.logs.some((lg) => lg.z > state.z && lg.z - state.z < 40)) { state.logHint = true; banner(`🪵 גזע על המסלול! ${JUMP_KEY} = קפיצה`, 2.6); }
    if (!state.goldHint && c.gold && !c.gold.taken && c.gold.z > state.z && c.gold.z - state.z < 50) { state.goldHint = true; banner('✨ עצם זהב מחזירה חיים!', 2.4); }
  }
}

// ------------------------------------------------------------------ physics step
const tmpN = new V3(), lvNow = {};
function readInput() {
  const ax = input.p1.axis();
  ctrl.turn = clamp(ax.x + (ctrl.right ? 1 : 0) - (ctrl.left ? 1 : 0) + ctrl.steer, -1, 1);
  if (input.p1.consume('a')) ctrl.jumpQueued = true;
  return { turn: ctrl.turn, tuck: ctrl.tuck || ax.z > 0.5 || input.p1.down('b') };
}
function step(dt) {
  dt = Math.min(dt, 0.05);
  state.t += dt;
  if (bannerTime > 0 && (bannerTime -= dt) <= 0) bannerEl?.classList.remove('show');
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 1.6);
  if (state.landBounce > 0) state.landBounce = Math.max(0, state.landBounce - dt * 3);
  if (!state.running) {
    if (state.over && state.overTimer > 0) {   // slide to a stop, then the card
      state.overTimer -= dt;
      state.speed = Math.max(0, state.speed - 14 * dt);
      state.x += state.speed * Math.sin(state.heading) * dt; state.z += state.speed * Math.cos(state.heading) * dt;
      state.y = terrainH(state.x, state.z); state.air = false;
      if (state.overTimer <= 0) endRun();
    }
    return;
  }
  if (state.inv > 0) state.inv -= dt;
  const { turn, tuck } = readInput();
  if (ctrl.jumpQueued) { ctrl.jumpQueued = false; state.jumpBuf = 0.25; }             // a press made just before landing still jumps
  state.tuck = tuck && !state.air;
  // Skiing like a bike: the input asks for a LEAN, not a turn. Starting a turn first sways the body
  // the other way (the counter-steer kick), then the body falls into the turn; a balanced carve on
  // that edge turns at g·tan(lean)/v, so the skis follow the lean with a lag and a wider arc at speed.
  if (turn !== 0 && (state.prevTurn === 0 || Math.sign(turn) !== Math.sign(state.prevTurn))) { state.kick = T.kickTime; state.kickSign = -Math.sign(turn); }
  state.prevTurn = turn;
  if (state.kick > 0) state.kick -= dt;
  const v = Math.max(state.speed, 3);
  if (!state.air) {
    const leanMax = clamp(T.leanBase + T.leanPerSpeed * state.speed, T.leanBase, T.leanMax);
    let target = turn * leanMax;
    if (turn === 0) target = clamp(-state.heading * T.recentre, -0.6, 0.6);        // finishing the turn back to the fall line
    if (state.kick > 0) target += state.kickSign * T.kickLean * (state.kick / T.kickTime);
    state.leanVel += (T.leanSpring * (target - state.lean) - T.leanDamp * state.leanVel) * dt;
    state.lean = clamp(state.lean + state.leanVel * dt, -1.1, 1.1);
    let omega = T.g * Math.tan(state.lean) / v;                                        // the carve
    const gripMax = T.g * T.grip;
    state.skid = Math.max(0, Math.abs(omega * v) - gripMax) / T.g;                    // the edge lets go
    if (Math.abs(omega * v) > gripMax) omega = Math.sign(omega) * gripMax / v;
    state.aLat = omega * v;
    // skidded steering: pivoting the skis works right away (more at low speed) and throws snow
    const pivot = turn * T.skidSteer / (1 + v / 12);
    omega += pivot;
    state.skid += Math.abs(pivot) * 0.25;
    const fallLine = G_SLOPE * Math.sin(state.heading) / v;                           // gravity bends the line downhill
    state.heading = clamp(state.heading + (omega - fallLine) * dt, -T.maxHeading, T.maxHeading);
  } else {
    state.leanVel += (T.leanSpring * 0.4 * (0 - state.lean) - T.leanDamp * state.leanVel) * dt;
    state.lean += state.leanVel * dt;
    state.aLat = 0; state.skid = 0;
    state.spin += turn * 7.2 * dt;
    state.airTime += dt;
  }
  // the zone sets the top speed: slow fresh snow on the open slope, fast packed snow in the forest
  const lv = level(state.z, lvNow);
  if (lv.zone !== state.zone) enterZone(lv.zone);
  const k = (G_SLOPE / (lv.vTerm * lv.vTerm)) * (state.tuck ? T.tuckDrag : 1);
  let a = G_SLOPE * Math.cos(state.heading) - k * state.speed * state.speed;
  if (!state.air) a -= (T.carveDrag * 0.5 * (Math.abs(state.aLat) / T.g) + 0.8 * state.skid) * state.speed;   // edging and skidding cost speed
  state.speed = Math.max(T.minSpeed, state.speed + a * dt);
  const dx = state.speed * Math.sin(state.heading) * dt, dz = state.speed * Math.cos(state.heading) * dt;
  state.x += dx; state.z += dz; state.dist += dz;
  const lim = T.halfWidth + 9;
  if (Math.abs(state.x) > lim) { state.x = Math.sign(state.x) * lim; state.heading *= 0.4; state.speed *= 0.96; }
  ensureChunks(state.z);
  const h = terrainH(state.x, state.z);
  let launched = false;
  if (!state.air) {
    const vyGround = (h - state.y) / dt;
    if (state.jumpBuf > 0) {
      state.jumpBuf = 0;
      state.air = true; state.airTime = 0; state.spin = 0; state.vy = vyGround + T.jumpV + state.speed * 0.04;
      state.crouch = 0; sfx.jump(); launched = true;
      for (const tr of trails) tr.reset();
    } else if (crestLaunch(state.x, state.z, state.heading, state.speed)) {
      state.air = true; state.airTime = 0; state.spin = 0; state.vy = vyGround; state.y = h; launched = true;
      for (const tr of trails) tr.reset();
    } else {
      state.vy = vyGround; state.y = h;
    }
  }
  if (state.jumpBuf > 0) state.jumpBuf -= dt;
  if (state.air && !launched) {
    state.vy -= T.g * dt; state.y += state.vy * dt;
    for (const tr of trails) tr.reset();
    if (state.y <= h) {
      state.y = h; state.air = false;
      const spins = Math.abs(state.spin) / (Math.PI * 2);
      if (spins >= 0.85) { const pts = 100 * Math.round(spins); state.score += pts; hud.flash(`סיבוב ${Math.round(spins) * 360}°! ‎+${pts}`, { good: true, dur: 1200 }); sfx.trick(); }
      else if (state.airTime > 0.55) { state.score += 20; hud.flash('באוויר! ‎+20', { good: true, dur: 900 }); }
      state.spin = 0;
      state.landBounce = 1; state.vy = (h - state.y) / dt;
      if (state.airTime > 0.3) { puff.emitter = new V3(state.x, h, state.z); puff.manualEmitCount = 30; sfx.land(); }
    }
  }
  state.score += dz * 0.1;                                                              // the points are in the gates now
  const yRel = state.y - h;
  const ci = chunkIndexAt(state.z);
  for (const idx of [ci - 1, ci, ci + 1]) {
    const c = chunks.get(idx); if (!c) continue;
    for (const t of c.trees) {                                                          // trunks are taller than any jump
      const ddz = t.z - state.z; if (ddz > 2 || ddz < -2) continue;
      const ddx = t.x - state.x, r = T.treeR * t.s + T.dogR;
      if (ddx * ddx + ddz * ddz < r * r) { hit('tree'); break; }
    }
    for (const rk of c.rocks) {                                                         // rocks are low: a jump clears them
      const ddz = rk.z - state.z; if (ddz > 2.5 || ddz < -2.5) continue;
      const ddx = rk.x - state.x, r = T.rockR * rk.s + T.dogR;
      if (ddx * ddx + ddz * ddz < r * r && yRel < 0.7 * rk.s - 0.15) { hit('rock'); break; }
    }
    for (const lg of c.logs) {                                                          // crossed a log this frame: over it or into it
      if (lg.done || state.z < lg.z || state.z - dz >= lg.z) continue;
      lg.done = true;
      if (Math.abs(state.x - lg.x) > lg.half + T.dogR) continue;                        // went round the end
      if (state.y - terrainH(state.x, lg.z) > T.logTop - 0.1) clearLog(); else hit('log');
    }
    for (const b of c.bones) {
      if (b.taken) continue;
      const ddz = b.z - state.z, ddx = b.x - state.x;
      if (ddx * ddx + ddz * ddz < T.boneR * T.boneR && Math.abs(state.y - terrainH(b.x, b.z)) < 2.2) {
        b.taken = true; state.bones++; state.score += 10; sfx.pickup(); hud.pop('#score');
        if (c.boneMesh) { c.boneBuf.fill(0, b.instance * 16, b.instance * 16 + 16); c.boneMesh.thinInstanceBufferUpdated('matrix'); }
        if (state.bones % 5 === 0) hud.flash(`${state.bones} עצמות! 🦴`, { good: true, dur: 800 });
      }
    }
    const gd = c.gold;
    if (gd && !gd.taken && (gd.x - state.x) ** 2 + (gd.z - state.z) ** 2 < T.goldR * T.goldR && yRel < 2.6) takeGold(gd);
    for (const g of c.gates) {
      if (g.done || state.z - dz >= g.z || state.z < g.z) continue;
      g.done = true;
      if (Math.abs(state.x - g.x) < g.half - 0.15) passGate(); else missGate();
    }
  }
  hints();
  updateHUD(false);
}

// ------------------------------------------------------------------ visuals
const camPos = new V3(0, 3, -7), camTarget = new V3(0, 0, 5);
const fwd = new V3(), up = new V3(), right = new V3(), q = new BABYLON.Quaternion(), qRoll = new BABYLON.Quaternion();
const rotMat = new BABYLON.Matrix();
const ROLL_SIGN = -1;   // positive lean = right turn = body tilts toward +x
// Trees the dog has already passed that stand between it and the camera (or crowd the camera) sink
// into the snow, so the dog and the lane stay in view; nothing ahead of the dog ever hides, since a
// hidden trunk would be an unfair hit.
const duckM = new BABYLON.Matrix(), duckS = new V3(), duckP = new V3(), duckQ = new BABYLON.Quaternion();
function writeTree(c, t) {
  duckS.set(t.s * t.w * t.vis, t.s * t.vis, t.s * t.w * t.vis);
  BABYLON.Quaternion.RotationYawPitchRollToRef(t.rot, 0, 0, duckQ);
  duckP.set(t.x, t.y, t.z);
  BABYLON.Matrix.ComposeToRef(duckS, duckQ, duckP, duckM);
  duckM.copyToArray(c.treeBuf, t.instance * 16);
}
function duckTrees(dt) {
  const cx = camPos.x, cz = camPos.z, dx = state.x - cx, dz = state.z - cz, len2 = dx * dx + dz * dz || 1;
  const ci = chunkIndexAt(state.z);
  for (const c of [chunks.get(ci - 1), chunks.get(ci)]) {
    if (!c || !c.treeMesh) continue;
    let dirty = false;
    for (const t of c.trees) {
      let want = 0;
      if (t.z < state.z - 0.9 && t.z > cz - 3) {
        const u = clamp(((t.x - cx) * dx + (t.z - cz) * dz) / len2, 0, 1);
        const ex = t.x - cx - dx * u, ez = t.z - cz - dz * u, reach = 2.6 * t.s * t.w * 0.85 + 0.6;
        if (ex * ex + ez * ez < reach * reach) want = 1;
      }
      if (t.duck === want) continue;
      t.duck = !dt ? want : want > t.duck ? Math.min(1, t.duck + dt * 10) : Math.max(0, t.duck - dt * 2.5);  // quick down, slow back up
      t.vis = 1 - 0.96 * smooth(0, 1, t.duck);
      writeTree(c, t); dirty = true;
    }
    if (dirty) c.treeMesh.thinInstanceBufferUpdated('matrix');
  }
}
// bones turn and bob so they read against the snow; the golden bone spins in its glow
const boneM = new BABYLON.Matrix(), boneQ = new BABYLON.Quaternion(), boneP = new V3(), boneS = new V3(1.35, 1.35, 1.35);
function spinBones(t) {
  const ci = chunkIndexAt(state.z);
  for (let idx = ci - 1; idx <= ci + 3; idx++) {
    const c = chunks.get(idx);
    if (!c) continue;
    if (c.boneMesh) {
      for (const b of c.bones) {
        if (b.taken) continue;
        BABYLON.Quaternion.RotationYawPitchRollToRef(t * 2.4 + b.phase, 0, 0.35, boneQ);
        boneP.set(b.x, b.y + 0.08 * Math.sin(t * 3 + b.phase), b.z);
        BABYLON.Matrix.ComposeToRef(boneS, boneQ, boneP, boneM);
        boneM.copyToArray(c.boneBuf, b.instance * 16);
      }
      c.boneMesh.thinInstanceBufferUpdated('matrix');
    }
    const g = c.gold;
    if (g && !g.taken) {
      g.mesh.rotation.set(0.3, t * 3.2, 0.25);
      g.mesh.position.y = g.halo.position.y = g.y + 0.14 * Math.sin(t * 2.6);
      g.halo.scaling.setAll(1 + 0.12 * Math.sin(t * 5));
    }
  }
}
function syncVisuals(dt) {
  terrainNormal(state.x, state.z, tmpN);
  const yawVis = state.heading + state.spin;
  fwd.set(Math.sin(yawVis), 0, Math.cos(yawVis));
  if (state.air) up.set(tmpN.x * 0.3, 1, tmpN.z * 0.3).normalize(); else up.copyFrom(tmpN);
  fwd.subtractInPlace(up.scale(V3.Dot(fwd, up))).normalize();
  // object axes: +Z along the skis, +Y the snow normal (FromLookDirectionLH would face the dog backwards)
  V3.CrossToRef(up, fwd, right); right.normalize();
  BABYLON.Matrix.FromXYZAxesToRef(right, up, fwd, rotMat);
  BABYLON.Quaternion.FromRotationMatrixToRef(rotMat, q);
  // incline into the turn about the ski line on the snow (plus the crash wobble)
  const roll = ROLL_SIGN * state.lean + Math.sin(state.t * 32) * 0.25 * state.shake;
  BABYLON.Quaternion.RotationAxisToRef(fwd, roll, qRoll);
  qRoll.multiplyToRef(q, dogRoot.rotationQuaternion);
  const bob = Math.sin(state.t * 12) * 0.006 * Math.min(1, state.speed / 10);
  dogRoot.position.set(state.x, state.y + bob - 0.085 * Math.abs(Math.sin(state.lean)) * 0.5, state.z);   // keep the edged skis in the snow
  // knees: bend under edge force, in a tuck and on landing; extend for the up-unweighting kick
  const edge = Math.min(1, Math.abs(state.aLat) / T.g);
  const targetCrouch = state.air ? 0.35 : clamp(0.12 + 0.55 * edge + (state.tuck ? 0.6 : 0) + state.landBounce * 0.7 - (state.kick > 0 ? 0.3 : 0), 0, 1);
  state.crouch = lerp(state.crouch, targetCrouch, dt ? 1 - Math.exp(-dt * 10) : 1);
  if (rig) animateRig(dt);
  else {
    if (kneeTarget) kneeTarget.influence = state.crouch;
    if (accNode) accNode.position.y = -T.kneeDrop * state.crouch;
  }
  if (!rig) dogPivot.scaling.set(1 + state.crouch * 0.04, 1, 1 + state.crouch * 0.03);
  updateScarf(state.t, state.speed, state.air);
  // spray off the outside (weighted) ski, in proportion to edge force and skid
  spray.emitRate = state.air || !state.running ? 0 : clamp((edge * 0.9 + state.skid * 2.5) * state.speed * 28, 0, 650);
  const outer = skiTails[state.lean > 0 ? 0 : 1];
  if (outer) { outer.computeWorldMatrix(true); sprayEmitter.position.copyFrom(outer.getAbsolutePosition()); }
  const out = -Math.sign(state.lean || 1);
  spray.direction1.set(out * 2 - 1, 1.2, -2); spray.direction2.set(out * 4 + 1, 3.5, -4);
  // the camera rides a little higher than the dog's shoulder and looks well down the lane
  const back = T.camBack + Math.min(1.8, state.speed * 0.05), height = T.camHeight + Math.min(1.0, state.speed * 0.03);
  const cy = state.heading * 0.35;
  const wantPos = new V3(state.x - Math.sin(cy) * back, terrainH(state.x - Math.sin(cy) * back, state.z - Math.cos(cy) * back) + height, state.z - Math.cos(cy) * back);
  const wantTarget = new V3(state.x + Math.sin(cy) * T.camLook, state.y + 0.55 - T.camLook * TAN_SLOPE * 0.55, state.z + Math.cos(cy) * T.camLook);
  const kPos = dt ? 1 - Math.exp(-dt * 5.5) : 1, kTar = dt ? 1 - Math.exp(-dt * 8) : 1;
  camPos.set(lerp(camPos.x, wantPos.x, kPos), lerp(camPos.y, wantPos.y, kPos), lerp(camPos.z, wantPos.z, kPos));
  camTarget.set(lerp(camTarget.x, wantTarget.x, kTar), lerp(camTarget.y, wantTarget.y, kTar), lerp(camTarget.z, wantTarget.z, kTar));
  const sh = state.shake * 0.25;
  camera.position.set(camPos.x + (Math.random() - 0.5) * sh, camPos.y + (Math.random() - 0.5) * sh, camPos.z);
  camera.setTarget(camTarget);
  camera.rotation.z = lerp(camera.rotation.z, ROLL_SIGN * state.lean * 0.16, dt ? 1 - Math.exp(-dt * 4) : 1);   // the camera leans a little with the dog
  duckTrees(dt);
  spinBones(state.t);
  snowEmitter.position.set(camPos.x, camPos.y, camPos.z);
  peaks.position.set(camPos.x, camPos.y - 60, camPos.z);
  sun.position.set(state.x - sun.direction.x * 90, state.y - sun.direction.y * 90, state.z - sun.direction.z * 90);
  if (wind) {
    const w = clamp((state.speed - 4) / 26, 0, 1) * (state.running && !isMuted() ? 1 : 0);
    wind.gain.gain.value = w * 0.3 * (state.tuck ? 1.2 : 1);
    wind.filter.frequency.value = 350 + w * 900;
  }
}

// ------------------------------------------------------------------ boot
hud.bind({ start: startRun, restart: startRun });
window.addEventListener('resize', () => engine.resize());
resetRun();
loadDog().catch((err) => {
  console.error('dog failed to load', err);
  const box = BABYLON.MeshBuilder.CreateBox('placeholder', { width: 0.3, height: 0.6, depth: 1.0 }, scene);
  box.material = skiMat; box.parent = dogPivot; box.position.y = 0.3;
  buildSkis([0.3, -0.25], 0.1);
  state.ready = true;
});
if (!SIM) {
  let last = performance.now();
  engine.runRenderLoop(() => {
    const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(dt); syncVisuals(dt); input.endFrame(); scene.render();
  });
}
window.__ski = {
  state, input: ctrl, T, ZONES, step, syncVisuals, start: startRun, reset: resetRun, terrainH, chunks, scene, engine, camera, sim: SIM,
  courseX, laneAt, level, gatesFor, get rig() { return rig; },
};
