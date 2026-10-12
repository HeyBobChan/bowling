import * as THREE from 'three';
import { createApp } from './kit/app.js';
import { toonMat, flatMat, spriteMat, noOutline, blobShadow, canvasTex, paperTexture, clamp, smooth, angleDiff } from './kit/toon.js';
import { createTrack } from './track.js';
import { createInput } from './kit/input.js';
import { createHud } from './kit/hud.js';
import { beep, noise, chord } from './kit/audio.js';

// The drawings: drawings/bowling-lane-and-monsters.jpg (the lane, the pins, the ball,
// the purple loop on wheels, the green stalk-eyed zigzag, the yellow spoked wheel),
// drawings/bowling-monsters-2.jpg (the snake with the blue head and wheels on its tail,
// the spiral snail with a spiky crown, the dino with orange spikes down its back) and
// drawings/bowling-monsters-3-whiteboard.png (the lollipop, the peanut-head worm, the
// stick alien). The kid wrote: "a bowling ball runs from monsters that chase it, and if
// it hits the pins you get 10 points — always a strike."

// ---------- Marker palette (sampled from the drawings) ----------
const PAPER = 0xf8f5ec;
const MARKER_BLUE = 0x2b4bd7;
const MARKER_BLUE_DARK = 0x1d35a8;
const SCRIBBLE_RED_DARK = 0xb93007;
const MARKER_PURPLE = 0x8a3fd0;
const MARKER_PURPLE_DARK = 0x5f2496;
const MARKER_GREEN = 0x63a412;
const MARKER_GREEN_DARK = 0x3f7106;
const MARKER_YELLOW = 0xf2c414;
const MARKER_YELLOW_DARK = 0xc79a06;
const MARKER_ORANGE = 0xe07612;
const MARKER_ORANGE_DARK = 0xa9560a;
const SPOKE_RED = 0x9c3a24;
const SPOKE_RED_DARK = 0x6e2415;
const LINE_BROWN = 0xa08266;
const MARKER_GREY = 0x9aa0a6;
const MARKER_GREY_DARK = 0x686e73;
const MARKER_TEAL = 0x0f8f6d;
const MARKER_TEAL_DARK = 0x0a5f49;
const ALIEN_GREEN = 0x7fae3e;
const ALIEN_GREEN_DARK = 0x567a24;
const NAVY = 0x27408b;
const NAVY_DARK = 0x1a2b5e;
const INK_SOFT = 0x141414;

// ---------- Constants ----------
const LANE_HALF = 13;
const BALL_R = 1;
const BALL_MAX_SPEED = 19;
const BALL_ACCEL = 55;
const BALL_DRAG = 2.4;
const BALL_DRAG_STOP = 7.0;    // stronger brake with no input — stopping is the panic button
const BREAK_SPEED = 14;        // faster than this, the ball rips free from a grabber's grip
const GRAB_RADIUS = 0.95;      // grabber tip touching distance (each tip adds its own size on top)
const STRIKE_DIST = 2.6;
const RACKS_AHEAD = 3;
const MAX_MONSTERS = 16;
const SHOT_SPEED = 30;
const SHOT_COOLDOWN = 0.3;
const AMMO_START = 6;
const AMMO_MAX = 9;
const AMMO_PER_STRIKE = 3;
const MONSTERS_START = 3;      // the crowd grows with rolling time and strikes — that's the difficulty
const CROWD_EVERY_S = 12;      // one more monster on the lane every this many seconds of rolling
const CROWD_EVERY_STRIKES = 2; // ...and one more every this many strikes
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// ---------- App ----------
const app = createApp({ fov: 55, fog: { near: 40, far: 105 } });
const { scene, camera, juice } = app;
const input = createInput();
app.input = input;
const hud = createHud(app, { gameId: 'main', music: { seed: 1, bpm: 112 } });
if (input.touch) input.touch.setLabels({ a: '🔴', b: '' });

const toon = (color, dark) => toonMat(color, dark ? { outline: dark } : {});
const flat = flatMat;

// ---------- Hand-drawn textures ----------
const scribbleTex = canvasTex(256, (g) => {
  g.fillStyle = '#f3e3d3';
  g.fillRect(0, 0, 256, 256);
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = Math.random() < 0.5 ? '#e8481c' : '#d13a10';
    g.lineWidth = 5 + Math.random() * 8;
    const x = Math.random() * 256, y = Math.random() * 256, a = Math.random() * Math.PI;
    const len = 30 + Math.random() * 60;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(
      x + Math.cos(a) * len / 2 + (Math.random() * 20 - 10),
      y + Math.sin(a) * len / 2 + (Math.random() * 20 - 10),
      x + Math.cos(a) * len, y + Math.sin(a) * len,
    );
    g.stroke();
  }
}, { wrap: true });
const paperTex = paperTexture();
const zigzagTex = canvasTex(128, (g) => {
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = '#1c1c1c';
  g.lineWidth = 7;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(12, 76);
  for (let i = 1; i <= 5; i++) g.lineTo(12 + i * 21, i % 2 ? 50 : 76);
  g.stroke();
});
const spiralTex = canvasTex(256, (g) => {
  g.fillStyle = '#f8f5ec';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#e07612';
  g.lineWidth = 11;
  g.lineCap = 'round';
  g.beginPath();
  for (let a = 0; a <= Math.PI * 5.5; a += 0.05) {
    const r = 6 + a * 6.5;
    const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r;
    if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
});
const scribbleMat = toonMat(0xffffff, { map: scribbleTex, outline: SCRIBBLE_RED_DARK });
const spiralMat = toonMat(0xffffff, { map: spiralTex, outline: MARKER_ORANGE_DARK });

// ---------- The paper and the winding lane ----------
// The paper is one big sheet that rides along under the ball (the texture offset keeps
// its speckles still in the world). The lane itself — the drawing's two pairs of brown
// edge lines — is an endless path of straights and bends built by track.js; everything
// that lives on it keeps lane coordinates (s along the lane, d across it).
const PAPER_TILE = 9;
paperTex.repeat.set(360 / PAPER_TILE, 360 / PAPER_TILE);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(360, 360), noOutline(new THREE.MeshBasicMaterial({ map: paperTex })));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const track = createTrack({ scene, laneHalf: LANE_HALF, lineColor: LINE_BROWN });

// ---------- Ball ----------
const ball = new THREE.Group();
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 24), scribbleMat);
// the three finger holes: flat black discs lying on the surface, like the drawing —
// a sphere poking out would read as a bump, not a hole
const holeGeo = new THREE.CircleGeometry(0.165, 18);
[[-0.28, 0.16], [0.28, 0.16], [0, -0.26]].forEach(([hx, hy]) => {
  const hole = new THREE.Mesh(holeGeo, flat(INK_SOFT));
  const dir = new THREE.Vector3(hx, hy, 0.9).normalize();
  hole.position.copy(dir).multiplyScalar(BALL_R + 0.004);
  hole.lookAt(dir.multiplyScalar(3));
  ballMesh.add(hole);
});
ball.add(ballMesh);
ball.add(blobShadow(0.95, { y: -BALL_R + 0.03 }));
ball.position.y = BALL_R;
scene.add(ball);

// ---------- Pins ----------
const pinWhite = toonMat(0xffffff, { outline: false }); // no outline: white, shaded, with the red band
function makePin() {
  const pin = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.15, 0.55), pinWhite);
  body.position.y = 0.58;
  pin.add(body);
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.4, 0.59), scribbleMat);
  band.position.y = 0.5;
  pin.add(band);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.5, 0.32), pinWhite);
  neck.position.y = 1.4;
  pin.add(neck);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), pinWhite);
  knob.position.y = 1.72;
  pin.add(knob);
  return pin;
}

// ---------- Eyes ----------
function makeEye(size, outlineColor) {
  const eye = new THREE.Group();
  const white = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 10), flatMat(0xffffff, { outline: outlineColor }));
  eye.add(white);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(size * 0.42, 10, 8), flat(INK_SOFT));
  pupil.position.z = size * 0.72;
  eye.add(pupil);
  return eye;
}

// ---------- Grabbers: long bendy appendages drawn as smooth continuous tubes ----------
// Each monster grabs with a different body part — arms, a tongue, a tail, a stretching
// spoke, an uncoiling spiral, or a whole snake head. The tube vertices are recomputed
// each frame along a bezier into a fixed buffer; the outline comes from the renderer.
const TUBE_RINGS = 14;
const TUBE_SIDES = 8;
const _pts = Array.from({ length: TUBE_RINGS }, () => new THREE.Vector3());
const _tan = new THREE.Vector3(), _bin = new THREE.Vector3(), _nrmPT = new THREE.Vector3(), _dir = new THREE.Vector3();

function makeTubeGeometry() {
  const geo = new THREE.BufferGeometry();
  const vertCount = TUBE_RINGS * TUBE_SIDES;
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3));
  const idx = [];
  for (let i = 0; i < TUBE_RINGS - 1; i++) {
    for (let j = 0; j < TUBE_SIDES; j++) {
      const a = i * TUBE_SIDES + j;
      const b = i * TUBE_SIDES + ((j + 1) % TUBE_SIDES);
      const c = (i + 1) * TUBE_SIDES + j;
      const d = (i + 1) * TUBE_SIDES + ((j + 1) % TUBE_SIDES);
      idx.push(a, b, c, b, d, c);
    }
  }
  geo.setIndex(idx);
  return geo;
}

function fillTube(geo, r0, r1) {
  const pos = geo.attributes.position.array;
  const nor = geo.attributes.normal.array;
  _nrmPT.set(0, 1, 0);
  let k = 0;
  for (let i = 0; i < TUBE_RINGS; i++) {
    const p = _pts[i];
    _tan.subVectors(_pts[Math.min(TUBE_RINGS - 1, i + 1)], _pts[Math.max(0, i - 1)]);
    if (_tan.lengthSq() < 1e-10) _tan.set(0, 0, 1);
    else _tan.normalize();
    _nrmPT.addScaledVector(_tan, -_nrmPT.dot(_tan));
    if (_nrmPT.lengthSq() < 1e-6) _nrmPT.set(1, 0, 0).addScaledVector(_tan, -_tan.x);
    _nrmPT.normalize();
    _bin.crossVectors(_tan, _nrmPT);
    const r = r0 + (r1 - r0) * (i / (TUBE_RINGS - 1));
    for (let j = 0; j < TUBE_SIDES; j++) {
      const a = (j / TUBE_SIDES) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = _nrmPT.x * ca + _bin.x * sa;
      const ny = _nrmPT.y * ca + _bin.y * sa;
      const nz = _nrmPT.z * ca + _bin.z * sa;
      pos[k] = p.x + nx * r; pos[k + 1] = p.y + ny * r; pos[k + 2] = p.z + nz * r;
      nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
      k += 3;
    }
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.normal.needsUpdate = true;
}

function makeGrabber(m, opts) {
  const group = new THREE.Group();
  group.position.set(...opts.anchor);
  m.add(group);
  const mat = toon(opts.color, opts.dark);

  const balls = [];
  const n = opts.segments;
  for (let i = 0; i < n; i++) {
    const r = THREE.MathUtils.lerp(opts.baseR, opts.tipR, i / (n - 1));
    const loc = new THREE.Group();
    group.add(loc);
    balls.push(loc);
    if (opts.spikeEvery && i % opts.spikeEvery === 1) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, r * 1.7, 6), toon(opts.spikeColor, opts.spikeDark));
      spike.position.y = r * 1.1;
      loc.add(spike);
    }
  }

  const tube = new THREE.Mesh(makeTubeGeometry(), mat);
  tube.frustumCulled = false;
  group.add(tube);
  const baseCap = new THREE.Mesh(new THREE.SphereGeometry(opts.baseR, 10, 8), mat);
  group.add(baseCap);
  const tipCap = new THREE.Mesh(new THREE.SphereGeometry(opts.tipR, 10, 8), mat);
  group.add(tipCap);
  const tip = opts.buildTip ? opts.buildTip() : null;
  if (tip) group.add(tip);

  const grabber = {
    group, balls, tip, tube, tipCap,
    baseR: opts.baseR,
    tipR: opts.tipR,
    grabR: opts.grabR ?? opts.tipR,
    cur: new THREE.Vector3(0, 0.4, 0.8),
    reach: opts.reach,
    closeSpeed: opts.closeSpeed,
    wiggle: opts.wiggle ?? 1,
    rest: opts.rest,
    phase: Math.random() * 10,
    cooldown: 0,
    aim: new THREE.Vector3(),
    aimInit: false,
    aimOffset: opts.aimOffset ? new THREE.Vector3(...opts.aimOffset) : null,
    tipWorld: new THREE.Vector3(),
  };
  (m.userData.grabbers ??= []).push(grabber);
  return grabber;
}

const _p = new THREE.Vector3(), _mid = new THREE.Vector3();
function layoutGrabber(gr) {
  const end = gr.cur;
  _mid.copy(end).multiplyScalar(0.5);
  _mid.y += 0.45 + Math.sin(gr.phase * 1.7) * 0.4 * gr.wiggle;
  _mid.x += Math.sin(gr.phase) * 0.5 * gr.wiggle;
  for (let i = 0; i < TUBE_RINGS; i++) {
    const t = i / (TUBE_RINGS - 1);
    const w = 2 * (1 - t) * t;
    _pts[i].set(_mid.x * w + end.x * t * t, _mid.y * w + end.y * t * t, _mid.z * w + end.z * t * t);
  }
  fillTube(gr.tube.geometry, gr.baseR, gr.tipR);
  const n = gr.balls.length;
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / n;
    const w = 2 * (1 - t) * t;
    gr.balls[i].position.set(_mid.x * w + end.x * t * t, _mid.y * w + end.y * t * t, _mid.z * w + end.z * t * t);
  }
  gr.tipCap.position.copy(end);
  if (gr.tip) {
    gr.tip.position.copy(end);
    _dir.copy(end).sub(_pts[TUBE_RINGS - 2]);
    if (gr.tip.userData.upright) {
      gr.tip.position.y += gr.tip.userData.lift || 0;
      if (_dir.x * _dir.x + _dir.z * _dir.z > 1e-10) gr.tip.rotation.set(0, Math.atan2(_dir.x, _dir.z), 0);
    } else if (gr.tip.userData.flat && _dir.lengthSq() > 1e-10 && Math.hypot(_dir.x, _dir.y) > 1e-3) {
      // a flat fan (twig fingers): point it along the arm but keep its spread in the plane
      // the monster faces, so the fingers read as three lines instead of stacking up
      _dir.normalize();
      _fx.set(0, 0, 1).cross(_dir).normalize();
      _fy.crossVectors(_dir, _fx);
      gr.tip.quaternion.setFromRotationMatrix(_basis.makeBasis(_fx, _fy, _dir));
    } else if (_dir.lengthSq() > 1e-10) {
      gr.tip.quaternion.setFromUnitVectors(Z_AXIS, _dir.normalize());
    }
  }
}
const _fx = new THREE.Vector3(), _fy = new THREE.Vector3(), _basis = new THREE.Matrix4();

// the grabbers reach for the ball slowly and smoothly — no lunges, no tricks. their aim
// turns sluggishly and the tip crawls, so you can always see where they're heading.
function updateGrabbers(m, dist, sdt, aimWorld, cinematic = false) {
  for (const gr of m.userData.grabbers) {
    gr.phase += sdt * 6;
    gr.cooldown = Math.max(0, gr.cooldown - sdt);
    let desired, moveSpeed = gr.closeSpeed;
    if (cinematic) {
      desired = gr.group.worldToLocal(aimWorld.clone());
      moveSpeed = 10;
    } else if (dist < gr.reach + 5 && gr.cooldown === 0) {
      if (!gr.aimInit) {
        gr.group.getWorldPosition(gr.aim);
        gr.aimInit = true;
      }
      gr.aim.lerp(aimWorld, smooth(1.5, sdt));
      desired = gr.group.worldToLocal(gr.aim.clone());
      if (gr.aimOffset) desired.add(gr.aimOffset);
      if (desired.length() > gr.reach) desired.setLength(gr.reach);
    } else {
      desired = gr.rest(gr.phase);
    }
    desired.y = Math.max(desired.y, -gr.group.position.y + 0.25);
    const step = moveSpeed * sdt;
    _p.copy(desired).sub(gr.cur);
    if (_p.length() <= step) gr.cur.copy(desired);
    else gr.cur.addScaledVector(_p.normalize(), step);
    layoutGrabber(gr);
    gr.tipWorld.copy(gr.cur);
    if (gr.tip && gr.tip.userData.upright) gr.tipWorld.y += gr.tip.userData.lift || 0;
    gr.tipWorld.applyMatrix4(gr.group.matrixWorld);
  }
}

// ---------- Monsters (drawing #1) ----------
function makePurpleMonster() {
  const m = new THREE.Group();
  const purple = toon(MARKER_PURPLE, MARKER_PURPLE_DARK);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.26, 12, 24), purple);
  loop.scale.y = 2.0;
  loop.position.y = 2.35;
  m.add(loop);
  const stroke = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.5, 4, 10), purple);
  stroke.position.y = 2.35;
  m.add(stroke);
  const wheels = [];
  [-1, 1].forEach((side) => {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.12, 10, 16), purple);
    wheel.position.set(side * 0.85, 0.42, 0);
    m.add(wheel);
    wheels.push(wheel);
  });
  [-1, 1].forEach((side) => {
    makeGrabber(m, {
      anchor: [side * 0.95, 2.6, 0.1],
      color: MARKER_PURPLE, dark: MARKER_PURPLE_DARK,
      segments: 8, baseR: 0.16, tipR: 0.11,
      reach: 4.5, closeSpeed: 4.5,
      aimOffset: [side * 0.5, 0, 0],
      rest: (t) => new THREE.Vector3(side * (0.9 + Math.sin(t * 0.9) * 0.35), -1.3 + Math.sin(t * 1.3) * 0.5, 0.5),
      buildTip: () => new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.09, 8, 14), purple),
    });
  });
  m.userData.wheels = wheels;
  m.userData.kind = 'purple';
  m.userData.holdHeight = 3.6;
  return m;
}

function makeGreenMonster() {
  const m = new THREE.Group();
  const green = toon(MARKER_GREEN, MARKER_GREEN_DARK);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 12), green);
  body.scale.y = 0.9;
  body.position.y = 1.05;
  m.add(body);
  const zig = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.47), spriteMat(zigzagTex));
  zig.position.set(0, 1.25, 0.68);
  m.add(zig);
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.9, 4), green);
  skirt.rotation.x = Math.PI;
  skirt.rotation.y = Math.PI / 4;
  skirt.position.y = 0.42;
  m.add(skirt);
  [-0.32, 0.32].forEach((x) => {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.95, 8), green);
    stalk.position.set(x, 2.0, 0);
    stalk.rotation.z = -x * 0.5;
    m.add(stalk);
    const eye = makeEye(0.27, MARKER_GREEN_DARK);
    eye.position.set(x * 1.75, 2.5, 0);
    m.add(eye);
  });
  // a long sticky tongue shoots out from under the zigzag mouth
  const tongue = toon(MARKER_GREEN_DARK, 0x2a4c04);
  makeGrabber(m, {
    anchor: [0, 0.95, 0.6],
    color: MARKER_GREEN_DARK, dark: 0x2a4c04,
    segments: 9, baseR: 0.13, tipR: 0.1,
    reach: 5, closeSpeed: 4.8, wiggle: 1.3,
    rest: (t) => new THREE.Vector3(Math.sin(t * 0.8) * 0.5, -0.3 + Math.sin(t * 1.4) * 0.25, 0.7),
    buildTip: () => {
      const paw = new THREE.Group();
      paw.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), tongue));
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), tongue);
        const a = (i / 3) * Math.PI * 2;
        f.position.set(Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0.14);
        paw.add(f);
      }
      return paw;
    },
  });
  m.userData.kind = 'green';
  m.userData.holdHeight = 2.5;
  return m;
}

function makeYellowWheel() {
  const m = new THREE.Group();
  const spinner = new THREE.Group();
  const yellow = toon(MARKER_YELLOW, MARKER_YELLOW_DARK);
  spinner.add(new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.2, 12, 24), yellow));
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.13, 2.1, 0.13), toon(SPOKE_RED, SPOKE_RED_DARK));
    spoke.rotation.z = (i * Math.PI) / 4;
    spinner.add(spoke);
  }
  spinner.position.y = 1.35;
  m.add(spinner);
  // a fifth spoke stretches right out of the hub to snatch the ball
  makeGrabber(m, {
    anchor: [0, 1.35, 0.25],
    color: SPOKE_RED, dark: SPOKE_RED_DARK,
    segments: 9, baseR: 0.12, tipR: 0.09,
    reach: 5.2, closeSpeed: 4.8,
    rest: (t) => new THREE.Vector3(Math.cos(t * 0.9) * 1.5, Math.sin(t * 0.9) * 1.5, 0.15),
    buildTip: () => new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.07, 8, 12, Math.PI * 1.4), yellow),
  });
  m.userData.spinner = spinner;
  m.userData.kind = 'wheel';
  m.userData.holdHeight = 2.8;
  return m;
}

// ---------- Monsters (drawing #2) ----------
function makeSnake() {
  const m = new THREE.Group();
  const green = toon(MARKER_GREEN, MARKER_GREEN_DARK);
  // the tail end, where the kid drew two little wheels — the rest of the body IS the grabber
  const stub = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), green);
  stub.position.y = 0.55;
  m.add(stub);
  const wheels = [];
  [-1, 1].forEach((side) => {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.09, 8, 14), toon(NAVY, NAVY_DARK));
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(side * 0.42, 0.28, -0.15);
    m.add(wheel);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), toon(SPOKE_RED, SPOKE_RED_DARK));
    hub.position.copy(wheel.position);
    m.add(hub);
    wheels.push(wheel);
  });
  makeGrabber(m, {
    anchor: [0, 0.55, 0],
    color: MARKER_GREEN, dark: MARKER_GREEN_DARK,
    segments: 13, baseR: 0.34, tipR: 0.21, grabR: 0.46,
    reach: 5.5, closeSpeed: 4.5, wiggle: 1.4,
    spikeEvery: 2, spikeColor: MARKER_PURPLE, spikeDark: MARKER_PURPLE_DARK,
    rest: (t) => new THREE.Vector3(Math.sin(t * 0.7) * 0.9, 2.1 + Math.sin(t * 1.1) * 0.5, 1.1),
    buildTip: () => {
      const head = new THREE.Group();
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), toon(MARKER_BLUE, MARKER_BLUE_DARK)));
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 6), toon(MARKER_PURPLE, MARKER_PURPLE_DARK));
      horn.position.set(0, 0.45, 0);
      head.add(horn);
      const e1 = makeEye(0.14, MARKER_BLUE_DARK); e1.position.set(-0.18, 0.15, 0.36); head.add(e1);
      const e2 = makeEye(0.14, MARKER_BLUE_DARK); e2.position.set(0.18, 0.15, 0.36); head.add(e2);
      return head;
    },
  });
  m.userData.wheels = wheels;
  m.userData.kind = 'snake';
  m.userData.holdHeight = 3.2;
  return m;
}

// the green dino: orange triangles down its BACK (the drawing's spikes), a spiky tail
// that whips over its head, and four stubby legs underneath
function makeDino() {
  const m = new THREE.Group();
  const green = toon(MARKER_GREEN, MARKER_GREEN_DARK);
  const orange = toon(MARKER_ORANGE, MARKER_ORANGE_DARK);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.3, 6, 12), green);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.95;
  m.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12), green);
  head.position.set(0, 1.3, 1.05);
  m.add(head);
  const snout = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.3, 4, 8), green);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 1.2, 1.45);
  m.add(snout);
  const e1 = makeEye(0.13, MARKER_GREEN_DARK); e1.position.set(-0.18, 1.5, 1.3); m.add(e1);
  const e2 = makeEye(0.13, MARKER_GREEN_DARK); e2.position.set(0.18, 1.5, 1.3); m.add(e2);
  for (let i = 0; i < 5; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.62, 5), orange);
    spike.position.set(0, 1.62, 0.6 - i * 0.38);
    spike.rotation.x = -0.25;
    m.add(spike);
  }
  [-0.14, 0.14].forEach((x) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 5), orange);
    ear.position.set(x, 1.77, 0.95);
    m.add(ear);
  });
  const legs = [];
  [-0.38, 0.38].forEach((x) => {
    [0.45, -0.45].forEach((z) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 8), green);
      leg.position.set(x, 0.25, z);
      m.add(leg);
      legs.push(leg);
    });
  });
  m.userData.legs = legs;
  makeGrabber(m, {
    anchor: [0, 1.1, -0.85],
    color: MARKER_GREEN, dark: MARKER_GREEN_DARK,
    segments: 10, baseR: 0.22, tipR: 0.12,
    reach: 5, closeSpeed: 4.5, wiggle: 1.2,
    spikeEvery: 3, spikeColor: MARKER_ORANGE, spikeDark: MARKER_ORANGE_DARK,
    rest: (t) => new THREE.Vector3(Math.sin(t) * 0.6, 1.5 + Math.sin(t * 1.3) * 0.45, -1.5),
    buildTip: () => {
      const spike = new THREE.Group();
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 6), orange);
      c1.rotation.x = Math.PI / 2;
      c1.position.z = 0.2;
      spike.add(c1);
      const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6), orange);
      c2.rotation.z = Math.PI / 2.5;
      c2.position.set(-0.15, 0.1, 0);
      spike.add(c2);
      return spike;
    },
  });
  m.userData.kind = 'dino';
  m.userData.holdHeight = 3.0;
  return m;
}

function makeSnail() {
  const m = new THREE.Group();
  const orange = toon(MARKER_ORANGE, MARKER_ORANGE_DARK);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.3, 24), [orange, spiralMat, spiralMat]);
  disc.rotation.x = Math.PI / 2;
  disc.position.y = 1.15;
  m.add(disc);
  for (let i = -1; i <= 1; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 6), orange);
    spike.position.set(i * 0.42, 2.35 - Math.abs(i) * 0.15, 0);
    spike.rotation.z = -i * 0.35;
    m.add(spike);
  }
  // the spiral uncoils into a long grabby arm — the snail is slow, but that arm is LONG
  makeGrabber(m, {
    anchor: [0.55, 1.15, 0.25],
    color: MARKER_ORANGE, dark: MARKER_ORANGE_DARK,
    segments: 10, baseR: 0.16, tipR: 0.1,
    reach: 7.5, closeSpeed: 6, wiggle: 1.1,
    rest: (t) => new THREE.Vector3(Math.cos(t * 0.8) * 0.9, Math.sin(t * 0.8) * 0.9 + 0.2, 0.3),
    buildTip: () => {
      const end = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), orange);
      end.scale.z = 0.55;
      return end;
    },
  });
  m.userData.kind = 'snail';
  m.userData.holdHeight = 2.9;
  return m;
}

// ---------- The Scribble Monster (from Claude's imagination): a living tangle of doodles ----------
function makeScribbleMonster() {
  const m = new THREE.Group();
  const tangle = new THREE.Group();
  [[MARKER_BLUE, MARKER_BLUE_DARK], [MARKER_PURPLE, MARKER_PURPLE_DARK], [MARKER_ORANGE, MARKER_ORANGE_DARK], [MARKER_GREEN, MARKER_GREEN_DARK], [MARKER_BLUE, MARKER_BLUE_DARK]]
    .forEach(([col, dark], i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55 + (i % 3) * 0.14, 0.09, 8, 20), toon(col, dark));
      ring.rotation.set(i * 1.1, i * 0.8, i * 1.7);
      tangle.add(ring);
    });
  tangle.position.y = 1.25;
  m.add(tangle);
  const e1 = makeEye(0.24, MARKER_BLUE_DARK); e1.position.set(-0.3, 1.9, 0.5); m.add(e1);
  const e2 = makeEye(0.3, MARKER_BLUE_DARK); e2.position.set(0.32, 2.0, 0.5); m.add(e2);
  makeGrabber(m, {
    anchor: [0, 1.25, 0.4],
    color: MARKER_BLUE, dark: MARKER_BLUE_DARK,
    segments: 10, baseR: 0.14, tipR: 0.1,
    reach: 5, closeSpeed: 4.8, wiggle: 1.6,
    rest: (t) => new THREE.Vector3(Math.sin(t * 1.3) * 1.1, 0.4 + Math.cos(t * 0.9) * 0.7, 0.6),
    buildTip: () => {
      const knot = new THREE.Group();
      [0, 1].forEach((i) => {
        const mini = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.06, 6, 12), i ? toon(MARKER_PURPLE, MARKER_PURPLE_DARK) : toon(MARKER_BLUE, MARKER_BLUE_DARK));
        mini.rotation.set(i * 1.3, 0.6, i * 0.9);
        knot.add(mini);
      });
      return knot;
    },
  });
  m.userData.tangle = tangle;
  m.userData.kind = 'scribble';
  m.userData.holdHeight = 3.1;
  return m;
}

// ---------- Monsters (drawing #3: the whiteboard) ----------
function makeAsterisk(size, thickness) {
  const star = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(thickness, size, thickness), toon(SPOKE_RED, SPOKE_RED_DARK));
    bar.rotation.z = (i * Math.PI) / 3;
    star.add(bar);
  }
  return star;
}

function makeLollipop() {
  const m = new THREE.Group();
  [-0.15, 0.15].forEach((x) => {
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.6, 8), toon(MARKER_TEAL, MARKER_TEAL_DARK));
    line.position.set(x, 1.8, 0);
    m.add(line);
  });
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 3.6, 8), toon(MARKER_GREY, MARKER_GREY_DARK));
  inner.position.set(0, 1.8, -0.05);
  m.add(inner);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), toon(MARKER_GREY, MARKER_GREY_DARK));
  head.position.y = 4.0;
  m.add(head);
  const star = makeAsterisk(0.62, 0.07);
  star.position.set(0, 4.0, 0.5);
  m.add(star);
  makeGrabber(m, {
    anchor: [0.4, 3.6, 0.2],
    color: MARKER_TEAL, dark: MARKER_TEAL_DARK,
    segments: 10, baseR: 0.12, tipR: 0.09,
    reach: 6, closeSpeed: 4.8, wiggle: 1.2,
    rest: (t) => new THREE.Vector3(Math.sin(t * 0.8) * 0.7, -2.3 + Math.sin(t * 1.2) * 0.4, 0.5),
    buildTip: () => {
      const tipStar = makeAsterisk(0.34, 0.05);
      tipStar.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), toon(MARKER_GREY, MARKER_GREY_DARK)));
      return tipStar;
    },
  });
  m.userData.kind = 'lollipop';
  m.userData.holdHeight = 4.5;
  return m;
}

function makePeanutHead() {
  const head = new THREE.Group();
  const grey = toon(MARKER_GREY, MARKER_GREY_DARK);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.26, 12, 28, 4.6), grey);
  band.rotation.z = 2.24;
  band.scale.set(1, 1.18, 1);
  head.add(band);
  [0, 4.6].forEach((a) => {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), grey);
    cap.position.set(Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0);
    band.add(cap);
  });
  [[-0.3, 0.3], [-0.08, 0.4]].forEach(([x, y]) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), flat(0x14141c));
    eye.position.set(x, y, 0.26);
    head.add(eye);
  });
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const tooth = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), toon(0x6f7478, MARKER_GREY_DARK));
      tooth.position.set((col - 1) * 0.15 + (row ? 0.05 : 0), -0.02 - row * 0.14, 0.22);
      head.add(tooth);
    }
  }
  head.userData.upright = true;
  head.userData.lift = 0.5;
  return head;
}

function makeWorm() {
  const m = new THREE.Group();
  const grey = toon(MARKER_GREY, MARKER_GREY_DARK);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.13, 10, 16), grey);
  loop.position.y = 0.45;
  m.add(loop);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), toon(SPOKE_RED, SPOKE_RED_DARK));
  dot.position.y = 0.45;
  m.add(dot);
  const gr = makeGrabber(m, {
    anchor: [0, 0.5, 0.2],
    color: MARKER_GREY, dark: MARKER_GREY_DARK,
    segments: 12, baseR: 0.3, tipR: 0.22, grabR: 0.6,
    reach: 6, closeSpeed: 4.5, wiggle: 1.2,
    rest: (t) => new THREE.Vector3(Math.sin(t * 0.7) * 0.8, 1.9 + Math.sin(t * 1.1) * 0.5, 1.0),
    buildTip: makePeanutHead,
  });
  const legs = [];
  [2, 4, 6, 8].forEach((i) => {
    const pivot = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), toon(SPOKE_RED, SPOKE_RED_DARK));
    leg.position.y = -0.42;
    pivot.add(leg);
    gr.balls[i].add(pivot);
    legs.push(pivot);
  });
  m.userData.legs = legs;
  m.userData.kind = 'worm';
  m.userData.holdHeight = 3.0;
  return m;
}

// the green stick alien, straight from the whiteboard: a paper-white TEARDROP head with
// a green marker outline and a pointed chin, two big black almond eyes, two nostril dots
// and a tiny mouth — then nothing but green lines: a stick body, both arms raised in a V
// ending in three-twig hands, and splayed stick legs with three-twig feet
function makeAlien() {
  const m = new THREE.Group();
  const green = toon(ALIEN_GREEN, ALIEN_GREEN_DARK);
  const ink = flat(0x14141c);
  // proportions from the drawing: the head is about a quarter of the height, the rest is lines
  const HEAD_Y = 2.85;      // where the head is widest
  const HEAD_R = 0.38;
  const HIP_Y = 0.95;
  // teardrop: a lathe profile from the chin up (bottom-to-top keeps the faces outward),
  // widest a third of the way down, rounded on top, pointed chin
  const profile = [];
  for (let i = 22; i >= 0; i--) {
    const t = i / 22;
    profile.push(new THREE.Vector2(HEAD_R * Math.sin(Math.PI * Math.pow(t, 0.7)) + 0.001, 0.35 - t * 0.95));
  }
  const head = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), toonMat(PAPER, { outline: ALIEN_GREEN, thickness: 0.011 }));
  head.scale.z = 0.85;
  head.position.y = HEAD_Y;
  m.add(head);
  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), ink);
    eye.scale.set(0.75, 1.55, 0.4);
    eye.rotation.z = side * 0.08;
    eye.position.set(side * 0.14, HEAD_Y + 0.05, 0.29);
    m.add(eye);
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), ink);
    nostril.position.set(side * 0.045, HEAD_Y - 0.22, 0.25);
    m.add(nostril);
  });
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.028, 0.02), ink);
  mouth.position.set(0, HEAD_Y - 0.36, 0.17);
  m.add(mouth);
  // one thin line from the chin down to the hips
  const chinY = HEAD_Y - 0.6;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, chinY - HIP_Y, 8), green);
  body.position.y = (chinY + HIP_Y) / 2;
  m.add(body);
  // three long twig prongs pointing along +Z, spread sideways (the fan lies in the local XZ plane)
  function twigFan(len) {
    const fan = new THREE.Group();
    [-0.6, 0, 0.6].forEach((a) => {
      const pivot = new THREE.Group();
      pivot.rotation.y = a;
      const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.014, len, 6), green);
      twig.rotation.x = Math.PI / 2;
      twig.position.z = len / 2;
      pivot.add(twig);
      fan.add(pivot);
    });
    return fan;
  }
  // legs splay OUTWARD from the hips (a Λ, not a V), one knee knob, three toes pointing down
  [-1, 1].forEach((side) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.044, 0.74, 8), green);
    leg.position.set(side * 0.215, 0.615, 0);
    leg.rotation.z = side * 0.53;
    m.add(leg);
    const foot = twigFan(0.32);
    foot.position.set(side * 0.4, 0.3, 0.02);
    foot.rotation.set(Math.PI / 2 - 0.3, side * 0.25, 0);
    m.add(foot);
  });
  const knee = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), green);
  knee.position.set(0.24, 0.55, 0);
  m.add(knee);
  // the arms are the grabbers: thin lines from the chest, resting raised in a V, three
  // twig fingers each — the fan is kept facing the way the alien faces (see layoutGrabber)
  [-1, 1].forEach((side) => {
    makeGrabber(m, {
      anchor: [side * 0.05, 1.75, 0.03],
      color: ALIEN_GREEN, dark: ALIEN_GREEN_DARK,
      segments: 8, baseR: 0.05, tipR: 0.04,
      reach: 4.8, closeSpeed: 4.8, wiggle: 0.9,
      aimOffset: [side * 0.55, 0.15, 0],
      rest: (t) => new THREE.Vector3(
        side * (0.95 + Math.sin(t * 0.9) * 0.12),
        (side > 0 ? 0.95 : 0.55) + Math.sin(t * 1.1 + side) * 0.2,
        0.15,
      ),
      buildTip: () => { const hand = twigFan(0.45); hand.userData.flat = true; return hand; },
    });
  });
  m.userData.kind = 'alien';
  m.userData.holdHeight = 3.7;
  return m;
}

const MONSTER_MAKERS = [
  makePurpleMonster, makeGreenMonster, makeYellowWheel,
  makeSnake, makeDino, makeSnail, makeScribbleMonster,
  makeLollipop, makeWorm, makeAlien,
];

// ---------- Monster brains: every drawing moves differently ----------
// speed / agility multiply the roll's base numbers; pattern is the signature move.
const BRAINS = {
  purple:   { speed: 1.2,  agility: 0.45, pattern: 'roll' },    // charges in long straight lines, turns wide
  wheel:    { speed: 1.35, agility: 0.4,  pattern: 'roll' },
  green:    { speed: 1.0,  agility: 1.0,  pattern: 'lunge' },   // waits… then lunges
  snake:    { speed: 1.0,  agility: 1.0,  pattern: 'slither' }, // weaves side to side
  worm:     { speed: 0.85, agility: 0.9,  pattern: 'slither' },
  dino:     { speed: 0.7,  agility: 0.9,  pattern: 'leap' },    // bounds forward in big hops
  snail:    { speed: 0.45, agility: 0.8,  pattern: 'ambush' },  // barely moves — its arm reaches far
  scribble: { speed: 0.95, agility: 1.2,  pattern: 'jitter' },  // tumbles about erratically, never in a straight line
  lollipop: { speed: 0.9,  agility: 0.5,  pattern: 'sway' },    // tall, slow to turn, fishes from above
  alien:    { speed: 0.8,  agility: 1.6,  pattern: 'mirror' },  // shadows your sideways moves
};

// ---------- Audio ----------
const strikeSound = () => chord([523, 659, 784, 1047], 0.08, 0.25);
const grabSound = () => { beep(340, 0, 0.1, 'square', 0.15); beep(190, 0.09, 0.22, 'square', 0.15); };
const knockSound = () => { beep(140, 0, 0.09, 'square', 0.16); beep(500, 0.06, 0.16, 'triangle', 0.14); beep(750, 0.14, 0.2, 'triangle', 0.1); };
const ripSound = () => { beep(320, 0, 0.08, 'sawtooth', 0.12); beep(520, 0.06, 0.12, 'sawtooth', 0.1); noise(0.08, 2400, 0.06); };
const shootSound = () => { beep(880, 0, 0.07, 'square', 0.1); beep(440, 0.05, 0.1, 'square', 0.08); };
const emptySound = () => beep(180, 0, 0.06, 'square', 0.08);
const gameOverSound = () => chord([400, 300, 220, 150], 0.18, 0.3, 'sawtooth');

// ---------- Game state ----------
const state = {
  phase: 'idle', // idle | play | caught | over
  score: 0,
  strikes: 0,
  time: 0,       // seconds played
  worldTime: 0,  // seconds the world was actually moving — the crowd grows on this
  knocked: 0,
  vel: new THREE.Vector3(),
  monsters: [],
  racks: [],
  flyingPins: [],
  flyingMonsters: [],
  shots: [],
  ammo: AMMO_START,
  shotCooldown: 0,
  lastAim: new THREE.Vector3(0, 0, -1),
  spawnTimer: 3,
  nextRackS: 40,
  s: 0,          // the ball in lane coordinates: metres along the centre line...
  d: 0,          // ...and sideways offset (positive = right)
  heading: 0,    // lane heading under the ball
  camYaw: 0,     // where the camera looks — it turns with the lane, and the stick follows it
};
// how many monsters the lane wants right now: a small crowd that keeps growing
const crowdCap = () => Math.min(
  MAX_MONSTERS,
  MONSTERS_START + Math.floor(state.worldTime / CROWD_EVERY_S) + Math.floor(state.strikes / CROWD_EVERY_STRIKES),
);
let catching = null;

function setScore(s) {
  state.score = s;
  hud.set('#score', `נקודות: ${s}`);
}
function setAmmo(n) {
  state.ammo = clamp(n, 0, AMMO_MAX);
  hud.set('#ammo', `🔴 ${state.ammo}`);
}
function setStrikes() {
  hud.set('#strikes', `🎳 ${state.strikes}`);
}

// ---------- Racks ----------
function spawnRack(s) {
  track.extendTo(s + 8);
  const group = new THREE.Group();
  const d = (Math.random() * 2 - 1) * (LANE_HALF - 4);
  const th = track.heading(s);
  const center = track.point(s, d);
  track.tangent(th, _T);
  track.right(th, _R);
  // the triangle points down the lane: the head pin nearest the ball, two rows behind it
  const layout = [[0, 0], [-0.9, 1.6], [0.9, 1.6], [-1.8, 3.2], [0, 3.2], [1.8, 3.2]];
  const pins = layout.map(([across, ahead]) => {
    const p = makePin();
    p.position.copy(center).addScaledVector(_R, across).addScaledVector(_T, ahead);
    p.rotation.y = th + (Math.random() - 0.5) * 0.3;
    group.add(p);
    return p;
  });
  scene.add(group);
  state.racks.push({ center, pins, group, s, d });
}
function ensureRacks() {
  while (state.racks.length < RACKS_AHEAD) {
    spawnRack(state.nextRackS);
    state.nextRackS += 45 + Math.random() * 45;
  }
}

const _pop = new THREE.Vector3();
function doStrike(rack) {
  setScore(state.score + 10);
  setAmmo(state.ammo + AMMO_PER_STRIKE);
  strikeSound();
  hud.flash('סטרייק! ‎+10');
  hud.pop('#score');
  juice.hitstop(0.08);
  juice.shake(0.3);
  juice.pop(_pop.set(rack.center.x, 2.4, rack.center.z), '+10', { color: '#2b4bd7', size: 36 });
  for (const pin of rack.pins) {
    const dir = pin.position.clone().sub(ball.position);
    dir.y = 0;
    dir.normalize();
    state.flyingPins.push({
      mesh: pin,
      vel: new THREE.Vector3(dir.x * (6 + Math.random() * 5), 9 + Math.random() * 6, dir.z * (6 + Math.random() * 5)),
      spin: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4),
      life: 2.5,
    });
    scene.attach(pin);
  }
  scene.remove(rack.group);
  state.racks.splice(state.racks.indexOf(rack), 1);
  state.strikes += 1;
  setStrikes();
  hud.pop('#strikes');
}

// ---------- Monster spawning: always far away, never popping into view ----------
function spawnMonster() {
  if (state.monsters.length >= MAX_MONSTERS) return;
  const make = MONSTER_MAKERS[Math.floor(Math.random() * MONSTER_MAKERS.length)];
  const m = make();
  const ud = m.userData;
  const d = (Math.random() * 2 - 1) * LANE_HALF;
  let s;
  if (Math.random() < 0.8) {
    // most of the crowd waits ahead in the fog, right in your path — "ahead" is measured
    // along the lane, and pushed further round the bend until the spot is really out of
    // the camera's sight
    s = state.s + 95 + Math.random() * 30;
    for (let i = 0; i < 20; i++) {
      track.extendTo(s + 8);
      if (track.point(s, d, _spawn).distanceTo(camera.position) >= 105) break;
      s += 8;
    }
  } else {
    s = state.s - 45 - Math.random() * 15; // ...and a few come from behind
  }
  track.point(s, d, m.position);
  ud.s = s; ud.d = d; ud.th = track.heading(s);
  m.add(blobShadow(1.15));
  // the crowd is the difficulty; speed only creeps up so the lane stays readable
  ud.speed = Math.min(10.5, 6.5 + state.strikes * 0.12 + Math.random() * 1.2);
  ud.vel = new THREE.Vector3();
  ud.agility = 7.5 + Math.random() * 3;
  ud.bob = Math.random() * Math.PI * 2;
  ud.tick = Math.random() * 2;
  ud.grow = 0;
  scene.add(m);
  state.monsters.push(m);
}

// remove an object tree and free its own GPU buffers (materials and textures are shared)
function disposeObject(obj) {
  scene.remove(obj);
  obj.traverse((o) => { if (o.geometry && o.isMesh) o.geometry.dispose(); });
}

function caught(m) {
  if (catching) return;
  state.phase = 'caught';
  grabSound();
  juice.shake(0.5);
  juice.hitstop(0.1, 0.15);
  catching = { m, t: 0, from: ball.position.clone(), baseY: m.position.y };
}

// ---------- Reset / start ----------
function resetGame() {
  for (const m of state.monsters) disposeObject(m);
  for (const r of state.racks) disposeObject(r.group);
  for (const fp of state.flyingPins) disposeObject(fp.mesh);
  for (const fm of state.flyingMonsters) disposeObject(fm.mesh);
  for (const s of state.shots) disposeObject(s.mesh);
  state.monsters = [];
  state.racks = [];
  state.flyingPins = [];
  state.flyingMonsters = [];
  state.shots = [];
  state.vel.set(0, 0, 0);
  state.lastAim.set(0, 0, -1);
  state.shotCooldown = 0;
  state.spawnTimer = 2.5;
  state.nextRackS = 35;
  state.strikes = 0;
  state.time = 0;
  state.worldTime = 0;
  state.knocked = 0;
  catching = null;
  track.reset();
  state.s = 0; state.d = 0; state.heading = 0; state.camYaw = 0;
  ball.position.set(0, BALL_R, 0);
  ballMesh.rotation.set(0, 0, 0);
  camera.position.set(0, 8, 12); // before the spawns: the crowd hides from THIS camera
  camera.lookAt(0, 0, -5);
  setScore(0);
  setAmmo(AMMO_START);
  setStrikes();
  ensureRacks();
  for (let i = 0; i < MONSTERS_START; i++) spawnMonster();
}

function startGame() {
  resetGame();
  hud.hide('#intro');
  hud.hide('#gameover');
  hud.startMusic();
  state.phase = 'play';
}

function showGameOver() {
  state.phase = 'over';
  hud.stopMusic();
  const best = hud.best('bowling-best', state.score);
  gameOverSound();
  hud.set('#finalScore', `הבאתם ${state.score} נקודות! 🎳`);
  hud.set('#finalDetail', `${state.strikes} סטרייקים · ${state.knocked} מפלצות הועפו · ${state.time.toFixed(0)} שניות`);
  hud.set('#bestScore', `השיא שלכם: ${best} נקודות ⭐`);
  hud.show('#gameover');
}

hud.bind({ start: startGame, restart: startGame });

// ---------- Main loop ----------
const camTarget = new THREE.Vector3(), camAnchor = new THREE.Vector3(), camLook = new THREE.Vector3();
const _axis = { x: 0, z: 0 };
const _input = new THREE.Vector3(), _camFwd = new THREE.Vector3(), _spawn = new THREE.Vector3();
const _T = new THREE.Vector3(), _R = new THREE.Vector3(), _mT = new THREE.Vector3(), _mR = new THREE.Vector3();
const _lane = { s: 0, d: 0, th: 0, x: 0, z: 0 };

function update(dt) {
  if (state.phase === 'play') {
    state.time += dt;

    // --- ball input ---
    // the stick is read relative to the camera, which turns with the lane: "up" is
    // always "away from us", down the lane
    const ax = input.p1.axis(_axis);
    camera.getWorldDirection(_camFwd);
    const camYaw = Math.atan2(-_camFwd.x, -_camFwd.z);
    track.tangent(camYaw, _T);
    track.right(camYaw, _R);
    _input.set(0, 0, 0).addScaledVector(_R, ax.x).addScaledVector(_T, -ax.z);
    const hasInput = _input.lengthSq() > 0;
    state.vel.addScaledVector(_input, BALL_ACCEL * dt);
    state.vel.addScaledVector(state.vel, -(hasInput ? BALL_DRAG : BALL_DRAG_STOP) * dt);
    if (state.vel.length() > BALL_MAX_SPEED) state.vel.setLength(BALL_MAX_SPEED);
    if (!hasInput && state.vel.length() < 0.7) state.vel.set(0, 0, 0);

    ball.position.addScaledVector(state.vel, dt);
    // keep the ball between the edge lines: clamp its sideways offset and drop the part of
    // its speed that pushes into the line — the world only moves when the ball really moves
    const lp = track.project(ball.position.x, ball.position.z, state.s, _lane);
    const dMax = LANE_HALF - BALL_R;
    if (Math.abs(lp.d) > dMax) {
      const d = clamp(lp.d, -dMax, dMax);
      track.right(lp.th, _R);
      const vr = state.vel.dot(_R);
      if (vr * lp.d > 0) state.vel.addScaledVector(_R, -vr);
      ball.position.set(lp.x + _R.x * d, BALL_R, lp.z + _R.z * d);
      lp.d = d;
    }
    state.s = lp.s;
    state.d = lp.d;
    state.heading = lp.th;
    track.extendTo(state.s + 330);
    track.trim(state.s - 150);

    const speed = state.vel.length();
    if (speed > 0.01) {
      const axis = _p.set(0, 1, 0).cross(state.vel).normalize();
      ballMesh.rotateOnWorldAxis(axis, (speed * dt) / BALL_R);
    }
    if (speed > 0.5) state.lastAim.copy(state.vel).normalize();

    // === THE RULE: the world only moves when the ball moves ===
    const worldScale = Math.pow(clamp((speed - 1.0) / (BALL_MAX_SPEED * 0.55 - 1.0), 0, 1), 1.35);
    const sdt = dt * worldScale;
    state.worldTime += sdt;

    // --- monsters chase, each in its own way; their grabby parts do the catching ---
    for (const m of state.monsters) {
      const ud = m.userData;
      const br = BRAINS[ud.kind];
      const dir = _p.copy(ball.position).sub(m.position);
      dir.y = 0;
      const dist = dir.length();
      dir.normalize();
      // far down the lane the crowd follows the bends toward you instead of ramming the
      // edge lines; up close every monster runs straight at the ball, its own way
      const ds = ud.s - state.s;
      const follow = clamp((Math.abs(ds) - 20) / 25, 0, 1);
      if (follow > 0) {
        track.tangent(ud.th, _mT).multiplyScalar(ds > 0 ? -1 : 1);
        dir.lerp(_mT, follow).normalize();
      }
      ud.tick += sdt;

      let want = ud.speed * br.speed;
      const steer = ud.agility * br.agility;
      switch (br.pattern) {
        case 'lunge': { const ph = ud.tick % 1.4; want *= ph < 0.75 ? 0.15 : 1.9; break; }
        case 'leap': {
          const ph = ud.tick % 1.7;
          const leaping = ph < 0.7;
          want *= leaping ? 1.7 : 0.45;
          m.position.y = leaping ? Math.sin((ph / 0.7) * Math.PI) * 1.3 : 0;
          break;
        }
        case 'ambush': if (dist > 9) want *= 0.35; break;
        case 'jitter': {
          // a scribble never travels straight: quick sidesteps and speed hiccups
          const j = Math.sin(ud.bob * 2.9) + Math.sin(ud.bob * 4.3) * 0.5;
          m.position.addScaledVector(track.right(ud.th, _mR), j * 2.2 * sdt);
          want *= 0.9 + 0.45 * Math.sin(ud.bob * 1.7);
          break;
        }
        case 'mirror': ud.vel.addScaledVector(track.right(ud.th, _mR), clamp(state.d - ud.d, -1, 1) * 14 * sdt); break;
        default: break;
      }
      // close in, but slow down while the grabber is reaching — the arm does the work
      const moveSpeed = dist < 2.8 ? want * 0.35 : dist < 8 ? want * 0.55 : want;
      _mid.copy(dir).multiplyScalar(moveSpeed).sub(ud.vel);
      const steerStep = steer * sdt;
      if (_mid.length() > steerStep) _mid.setLength(steerStep);
      ud.vel.add(_mid);
      m.position.addScaledVector(ud.vel, sdt);
      if (br.pattern === 'slither') {
        m.position.x += dir.z * Math.sin(ud.bob * 1.7) * 2.0 * sdt;
        m.position.z += -dir.x * Math.sin(ud.bob * 1.7) * 2.0 * sdt;
      }
      if (br.pattern === 'mirror') m.position.addScaledVector(track.right(ud.th, _mR), Math.sin(ud.bob * 2.3) * 1.5 * sdt);
      // monsters may lean on the edge lines but never leave the lane
      const lm = track.project(m.position.x, m.position.z, ud.s, _lane);
      ud.s = lm.s; ud.th = lm.th; ud.d = lm.d;
      if (Math.abs(lm.d) > LANE_HALF + 1) {
        ud.d = clamp(lm.d, -LANE_HALF - 1, LANE_HALF + 1);
        track.right(lm.th, _mR);
        m.position.x = lm.x + _mR.x * ud.d;
        m.position.z = lm.z + _mR.z * ud.d;
      }

      const facing = ud.vel.lengthSq() > 0.5 ? ud.vel : dir;
      const targetYaw = Math.atan2(facing.x, facing.z);
      let dYaw = targetYaw - m.rotation.y;
      dYaw = ((dYaw % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      m.rotation.y += clamp(dYaw, -1.8 * steer / 8 * sdt, 1.8 * steer / 8 * sdt);

      ud.grow = Math.min(1, ud.grow + sdt * 2.2);
      m.scale.setScalar(0.05 + 0.95 * ud.grow);

      ud.bob += sdt * 8;
      if (ud.kind === 'green') m.position.y = Math.abs(Math.sin(ud.bob)) * 0.4;
      if (ud.wheels) for (const w of ud.wheels) w.rotation.z -= ud.speed * sdt;
      if (ud.kind === 'wheel') ud.spinner.rotation.z -= ud.speed * sdt * 0.9;
      if (ud.legs) ud.legs.forEach((l, i) => { l.rotation.z = Math.sin(ud.bob * 1.6 + i * 2.1) * 0.35; });
      if (ud.kind === 'scribble') { ud.tangle.rotation.y += sdt * 1.6; ud.tangle.rotation.x += sdt * 0.9; }
      if (ud.kind === 'lollipop') m.rotation.z = Math.sin(ud.bob * 0.7) * 0.05;

      m.updateMatrixWorld();
      updateGrabbers(m, dist, sdt, ball.position);

      const tipTouch = ud.grabbers.some((gr) => {
        if (gr.cooldown !== 0) return false;
        if (gr.tipWorld.distanceTo(ball.position) < GRAB_RADIUS + gr.grabR * m.scale.x) return true;
        if (gr.baseR >= 0.25) {
          const nLoc = gr.balls.length;
          for (let i = 3; i < nLoc - 1; i += 4) {
            const r = THREE.MathUtils.lerp(gr.baseR, gr.tipR, i / (nLoc - 1));
            _mid.copy(gr.balls[i].position).applyMatrix4(gr.group.matrixWorld);
            if (_mid.distanceTo(ball.position) < BALL_R + r * m.scale.x) return true;
          }
        }
        return false;
      });
      if (tipTouch && speed < BREAK_SPEED) { caught(m); break; }
      if (tipTouch) {
        for (const gr of ud.grabbers) gr.cooldown = 1.2;
        ripSound();
        juice.shake(0.15);
      }
      if (dist < 1.6) { caught(m); break; }
    }
  }

  if (state.phase === 'play') {
    const speed = state.vel.length();
    const worldScale = Math.pow(clamp((speed - 1.0) / (BALL_MAX_SPEED * 0.55 - 1.0), 0, 1), 1.35);
    const sdt = dt * worldScale;

    // --- shooting: space fires a mini scribble-ball at the monsters ---
    state.shotCooldown -= dt;
    if (input.p1.down('a') && state.shotCooldown <= 0) {
      state.shotCooldown = SHOT_COOLDOWN;
      if (state.ammo <= 0) {
        emptySound();
      } else {
        setAmmo(state.ammo - 1);
        const aim = state.lastAim.clone();
        let best = null, bestAngle = 0.6;
        for (const m of state.monsters) {
          const to = m.position.clone().sub(ball.position);
          to.y = 0;
          if (to.length() > 30) continue;
          const angle = aim.angleTo(to.normalize());
          if (angle < bestAngle) { bestAngle = angle; best = to; }
        }
        if (best) aim.copy(best);
        const shot = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), scribbleMat);
        shot.position.copy(ball.position).addScaledVector(aim, 1.4);
        scene.add(shot);
        state.shots.push({ mesh: shot, vel: aim.clone().multiplyScalar(SHOT_SPEED), life: 1.3 });
        shootSound();
      }
    }

    // shots obey THE RULE too — they only fly while the ball moves. stand frozen, fire a
    // volley into the air, then roll: they all launch at once!
    state.shots = state.shots.filter((s) => {
      s.mesh.position.addScaledVector(s.vel, sdt);
      s.mesh.rotation.x += sdt * 12;
      s.life -= sdt;
      let spent = s.life <= 0;
      for (const m of state.monsters) {
        const dx = m.position.x - s.mesh.position.x;
        const dz = m.position.z - s.mesh.position.z;
        if (dx * dx + dz * dz < 1.7 * 1.7) {
          m.userData.knocked = true;
          m.userData.knockDir = s.vel.clone().normalize();
          spent = true;
          break;
        }
      }
      if (!spent) {
        for (const rack of [...state.racks]) {
          const hit = rack.pins.some((p) => {
            const dx = p.position.x - s.mesh.position.x;
            const dz = p.position.z - s.mesh.position.z;
            return dx * dx + dz * dz < 1.2 * 1.2;
          });
          if (hit) { doStrike(rack); spent = true; break; }
        }
      }
      if (spent) disposeObject(s.mesh);
      return !spent;
    });

    // monsters hit by a shot fly off like pins
    for (const m of state.monsters) {
      if (!m.userData.knocked) continue;
      knockSound();
      state.knocked += 1;
      setScore(state.score + 5);
      juice.pop(_pop.set(m.position.x, 3, m.position.z), '+5', { color: '#b93007', size: 28 });
      const dir = m.userData.knockDir;
      state.flyingMonsters.push({
        mesh: m,
        vel: new THREE.Vector3(dir.x * 11, 10 + Math.random() * 4, dir.z * 11),
        spin: new THREE.Vector3(Math.random() * 10 - 5, Math.random() * 6 - 3, Math.random() * 10 - 5),
        life: 1.7,
      });
    }
    if (state.flyingMonsters.length) state.monsters = state.monsters.filter((m) => !m.userData.knocked);

    state.monsters = state.monsters.filter((m) => {
      if (state.s - m.userData.s > 70) { disposeObject(m); return false; }
      return true;
    });

    // the crowd: top the lane up to today's cap, two at a time when it's far below it
    state.spawnTimer -= sdt;
    if (state.spawnTimer <= 0) {
      const deficit = crowdCap() - state.monsters.length;
      if (deficit > 0) spawnMonster();
      if (deficit >= 3) spawnMonster();
      state.spawnTimer = deficit >= 3 ? 0.9 : 2.2;
    }

    // --- strikes ---
    for (const rack of [...state.racks]) {
      const hit = rack.pins.some((p) => {
        const dx = p.position.x - ball.position.x;
        const dz = p.position.z - ball.position.z;
        return dx * dx + dz * dz < STRIKE_DIST * STRIKE_DIST;
      });
      if (hit && speed > 1) doStrike(rack);
    }
    state.racks = state.racks.filter((r) => {
      if (state.s - r.s > 30) { disposeObject(r.group); return false; }
      return true;
    });
    ensureRacks();

    state.flyingMonsters = state.flyingMonsters.filter((fm) => {
      fm.vel.y -= 25 * sdt;
      fm.mesh.position.addScaledVector(fm.vel, sdt);
      fm.mesh.rotation.x += fm.spin.x * sdt;
      fm.mesh.rotation.z += fm.spin.z * sdt;
      fm.life -= sdt;
      if (fm.life < 0.4) fm.mesh.scale.multiplyScalar(Math.max(0.01, 1 - sdt * 3));
      if (fm.life <= 0 || fm.mesh.position.y < -6) { disposeObject(fm.mesh); return false; }
      return true;
    });
    state.flyingPins = state.flyingPins.filter((fp) => {
      fp.vel.y -= 25 * sdt;
      fp.mesh.position.addScaledVector(fp.vel, sdt);
      fp.mesh.rotation.x += fp.spin.x * sdt;
      fp.mesh.rotation.y += fp.spin.y * sdt;
      fp.mesh.rotation.z += fp.spin.z * sdt;
      fp.life -= sdt;
      if (fp.life <= 0 || fp.mesh.position.y < -6) { disposeObject(fp.mesh); return false; }
      return true;
    });

    // the paper rides along under the ball; the texture offset keeps its speckles still
    ground.position.set(ball.position.x, 0, ball.position.z);
    paperTex.offset.set(ball.position.x / PAPER_TILE, -ball.position.z / PAPER_TILE);
  }

  // --- the "gotcha" cinematic: grabbers wrap the ball and hold it up ---
  if (catching) {
    catching.t += dt;
    const m = catching.m;
    m.updateMatrixWorld();
    const holdPos = m.localToWorld(new THREE.Vector3(0, m.userData.holdHeight, 0.85));
    updateGrabbers(m, 0, dt, holdPos, true);
    ball.position.lerp(holdPos, Math.min(1, catching.t / 0.45));
    m.position.y = catching.baseY + (catching.t < 1.1 ? Math.abs(Math.sin(catching.t * 7)) * 0.45 : 0);
    ballMesh.rotation.y += dt * 3;
    if (catching.t > 1.2 && !catching.shown) {
      catching.shown = true;
      showGameOver();
    }
  }

  // --- camera follows, and turns with the lane: it looks where the lane heads a few
  // metres further on, so it starts swinging into a bend just before the ball gets there
  state.camYaw += angleDiff(track.heading(state.s + 8), state.camYaw) * smooth(3.5, dt);
  track.tangent(state.camYaw, _T);
  track.point(state.s, state.d * 0.6, camAnchor);
  camTarget.copy(camAnchor).addScaledVector(_T, -12);
  camTarget.y = 8;
  camera.position.lerp(camTarget, smooth(4, dt));
  camLook.copy(camAnchor).addScaledVector(_T, 6);
  camLook.y = 1;
  camera.lookAt(camLook);
}

resetGame();
state.phase = 'idle';
app.start(update);

// debugging / test hook. showcase('alien') parks one monster of that kind in front of
// the ball with the world frozen — handy for comparing a monster with its drawing.
window.__game = {
  app, state, ball, camera, crowdCap, track, LANE_HALF,
  startGame, spawnMonster, doStrike,
  // lane coordinates of a world point (s along the lane, d across it)
  lane: (pos) => track.project(pos.x, pos.z, state.s, {}, 16),
  showcase(kind, dist = 7) {
    for (const m of state.monsters) disposeObject(m);
    state.monsters = [];
    for (const make of MONSTER_MAKERS) {
      const m = make();
      if (m.userData.kind !== kind) { disposeObject(m); continue; }
      const s = state.s + dist;
      track.point(s, 0, m.position);
      m.rotation.y = track.heading(s); // facing back down the lane, at the ball
      m.add(blobShadow(1.15));
      Object.assign(m.userData, { speed: 0, vel: new THREE.Vector3(), agility: 0, bob: 0, tick: 0, grow: 1, s, d: 0, th: m.rotation.y });
      m.updateMatrixWorld();
      for (const gr of m.userData.grabbers) { gr.cur.copy(gr.rest(gr.phase)); layoutGrabber(gr); }
      scene.add(m);
      state.monsters.push(m);
      return m;
    }
    return null;
  },
  step: (dt) => app.step(dt),
  render: () => app.frame(0),
};
