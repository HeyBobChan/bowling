// Pencil streets and original-drawing cutouts from drawings/jaffa-dog-and-scooters.jpg.
// Shared template geometry and per-row batches keep the endless street bounded.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { drawingActor, faceDrawing, ficusDrawing } from './jaffa-sketch.js';

export const TILE = 1.6;
export const HALF_COLS = 5;
const BOX = new THREE.BoxGeometry(1, 1, 1);
const PENCIL = new THREE.LineBasicMaterial({ color: 0x555555, transparent: true, opacity: .8, toneMapped: false });
const BOX_EDGES = new THREE.EdgesGeometry(BOX);
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 8);
const CYLINDER_EDGES = new THREE.EdgesGeometry(CYLINDER);
const materials = new Map();
const labels = new Map();
const palette = { cream: 0xfdfdfd, stone: 0xfbfbfb, asphalt: 0xf4f4f4, curb: 0xfdfdfd, teal: 0xf5f5f5, leaf: 0xf5f5f5, darkLeaf: 0xf3f3f3, lime: 0xf7f7f7, trunk: 0xf5f5f5, ink: 0xefefef, white: 0xfefefe, orange: 0xf6f6f6 };
export const rand = (n, s = 0) => { let h = Math.imul(n + 8359, 374761393) ^ Math.imul(s + 1, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function mat(color) { if (!materials.has(color)) materials.set(color, new THREE.MeshBasicMaterial({ color, toneMapped: false })); return materials.get(color); }
function block(parent, color, x, y, z, w, h, d, rz = 0) {
  const mesh = new THREE.Mesh(BOX, mat(color));
  mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.rotation.z = rz;
  mesh.add(new THREE.LineSegments(BOX_EDGES, PENCIL)); parent.add(mesh); return mesh;
}
function cylinder(parent, color, x, y, z, radius, height, rz = 0) {
  const mesh = new THREE.Mesh(CYLINDER, mat(color)); mesh.position.set(x, y, z); mesh.scale.set(radius, height, radius); mesh.rotation.z = rz;
  mesh.add(new THREE.LineSegments(CYLINDER_EDGES, PENCIL)); parent.add(mesh); return mesh;
}
function labelMaterial(text, bg = '#ffffff', fg = '#333333') {
  const key = `${text}|${bg}|${fg}`;
  if (!labels.has(key)) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const ctx = c.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = fg; ctx.lineWidth = 3; ctx.strokeRect(9, 9, 494, 142);
    ctx.fillStyle = fg; ctx.font = 'bold 52px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 82, 460);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    labels.set(key, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  }
  return labels.get(key);
}
function sign(parent, text, bg, x, y, z, w, h, ry = 0) {
  const mesh = new THREE.Mesh(BOX, labelMaterial(text, bg)); mesh.position.set(x, y, z); mesh.scale.set(w, h, .055); mesh.rotation.y = ry; parent.add(mesh); return mesh;
}
// Bake boxes/cylinders by material. Dispose only geometry owned by a removed row.
function bake(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map(), strokes = [], sprites = [];
  group.traverse(m => {
    if (!m.visible) return;
    if (m.isSprite) { sprites.push(m); return; }
    if (m.isLineSegments) { strokes.push(m.geometry.clone().applyMatrix4(m.matrixWorld)); return; }
    if (!m.isMesh) return;
    const geometry = m.geometry.clone().applyMatrix4(m.matrixWorld);
    if (!buckets.has(m.material)) buckets.set(m.material, []);
    buckets.get(m.material).push(geometry);
  });
  group.clear();
  for (const [material, geometries] of buckets) {
    const merged = mergeGeometries(geometries); geometries.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(merged, material); mesh.userData.ownedGeometry = true; group.add(mesh);
  }
  if (strokes.length) {
    const geometry = mergeGeometries(strokes); strokes.forEach(g => g.dispose());
    const lines = new THREE.LineSegments(geometry, PENCIL); lines.userData.ownedGeometry = true; group.add(lines);
  }
  sprites.forEach(sprite => group.add(sprite));
  return group;
}
export function disposeRow(group) { group.traverse(m => { if (m.userData.ownedGeometry) m.geometry.dispose(); }); group.removeFromParent(); }

export const createDog = () => drawingActor('dog');
export const createRider = type => drawingActor(type);

function ficus(group, x, z) {
  const tree = ficusDrawing(); tree.position.set(x, .04, z); group.add(tree);
}
function bench(group, x, z) {
  for (const px of [-.55, .55]) block(group, palette.ink, x + px, .35, z, .09, .5, .4);
  for (let i = 0; i < 3; i++) block(group, 0xf6f6f6, x, .62, z + (i - 1) * .16, 1.5, .11, .12);
  block(group, 0xf6f6f6, x, .95, z + .25, 1.5, .3, .08);
}
function building(group, side, row) {
  const x = side * 12.2; const h = 3 + rand(row, side + 2) * 3;
  const color = [0xfbfbfb, 0xfcfcfc, 0xfbfbfb, 0xfafafa][Math.abs(row) % 4];
  block(group, color, x, h / 2 -.12, 0, 4, h, TILE * 3.8);
  block(group, 0xfdfdfd, x, h, 0, 4.16, .19, TILE * 3.9);
  block(group, 0xfafafa, x, h + .12, -2.95, 4.16, .27, .15);
  for (let f = 0; f < (h > 4.2 ? 2 : 1); f++) for (const z of [-1.65, 0, 1.65]) {
    block(group, 0xfdfdfd, x - side * 2.02, 2.05 + f * 1.5, z, .09, 1.12, .88);
    block(group, [0xf3f3f3, 0xf3f3f3, 0xf5f5f5][Math.abs(row) % 3], x - side * 2.085, 2.05 + f * 1.5, z, .05, .91, .66);
    block(group, 0xfafafa, x - side * 2.13, 2.05 + f * 1.5, z, .03, .95, .04);
    block(group, 0xfafafa, x - side * 2.13, 2.05 + f * 1.5, z, .03, .04, .7);
  }
  block(group, 0xf2f2f2, x - side * 2.03, .55, .4, .07, 1.3, 2.7);
  block(group, 0xfcfcfc, x - side * 2.1, .55, .4, .07, 1.3, .07);
  const awningColors = Math.abs(row) % 2 ? [0xf6f6f6, 0xfdfdfd] : [0xf4f4f4, 0xfdfdfd];
  for (let i = 0; i < 8; i++) block(group, awningColors[i % 2], x - side * 2.44, 1.52, -1.1 + i * .42, .94, .14, .42);
  const shop = ['قهوة يافا', 'مخبز البلد', 'بقالة', 'يافا · יפו'][Math.abs(Math.floor(row / 4)) % 4];
  sign(group, shop, Math.abs(row) % 2 ? '#ffffff' : '#ffffff', x - side * 2.09, 1.87, .4, 2.4, .45, -side * Math.PI / 2);
  cylinder(group, 0xfdfdfd, x + .1, h + .4, 1.4, .43, .7);
  block(group, 0xf3f3f3, x -.6, h + .3, -.7, 1.2, .08, 1.5, .1);
}
function streetLamp(group, x, z) {
  block(group, 0xf2f2f2, x, 1.65, z, .065, 3.3, .065);
  block(group, 0xf2f2f2, x -.18, 3.28, z, .45, .07, .08);
  block(group, 0xfefefe, x -.36, 3.18, z, .23, .2, .23);
}

export const createPickup = kind => drawingActor(kind);

export function laneKind(index) {
  if (index < 2) return 'plaza';
  const pattern = ['plaza', 'plaza', 'delivery', 'delivery', 'plaza', 'scooter', 'plaza', 'delivery', 'delivery', 'delivery', 'plaza', 'scooter'];
  return pattern[((index % pattern.length) + pattern.length) % pattern.length];
}
export function createRow(index, seed = 1) {
  const kind = laneKind(index); const group = new THREE.Group();
  const safe = kind === 'plaza'; const ground = kind === 'delivery' ? palette.asphalt : kind === 'scooter' ? 0xf9f9f9 : 0xfbfbfb;
  block(group, ground, 0, -.22, 0, 22.4, .34, TILE);
  // Outlined paving distinguishes sidewalks from the outlined road.
  if (kind !== 'delivery') {
    block(group, 0xfafafa, 0, -.037, TILE / 2 -.025, 22.4, .025, .035);
    for (let x = -7; x <= 7; x++) block(group, 0xfafafa, x * TILE + (index % 2) * .8, -.035, 0, .026, .024, TILE);
    for (const z of [-.73, .73]) block(group, palette.curb, 0, -.04, z, 22.4, .18, .14);
  } else {
    for (let x = -6; x <= 6; x++) {
      block(group, 0x888888, x * TILE, -.04, .69, .57, .025, .045);
      if (index % 12 === 2 || index % 12 === 7) block(group, 0xfcfcfc, x * .34 - 6.2, -.037, 0, .19, .025, 1.1);
    }
  }
  const dir = index % 2 ? -1 : 1;
  if (kind === 'scooter') {
    // Paired ink borders and repeated chevrons distinguish moving sidewalks
    // from safe paving without relying on color.
    for (const z of [-.64, .64]) block(group, 0x777777, 0, -.008, z, 22.4, .014, .035);
    for (let x = -8; x <= 8; x += 2) for (const z of [-.12, .12]) {
      const mark = block(group, 0x777777, x, -.004, z, .38, .014, .065);
      mark.rotation.y = z > 0 ? dir * Math.PI / 4 : -dir * Math.PI / 4;
    }
  }
  for (const x of [-9.5, 9.5]) {
    const arrow = block(group, kind === 'scooter' ? 0xf4f4f4 : 0xfbfbfb, x, -.013, 0, .36, .02, .08);
    if (!safe) for (const z of [-.11, .11]) block(group, kind === 'scooter' ? 0xf4f4f4 : 0xfbfbfb, x + .14 * dir, -.012, z, .18, .02, .065).rotation.y = z > 0 ? dir * Math.PI / 4 : -dir * Math.PI / 4;
    if (safe) arrow.visible = false;
  }
  const blocked = new Set();
  if (safe && index > 0 && index % 3 !== 1) {
    const treeCols = index >= 12 && index % 12 === 0 ? [0, index % 24 ? -4 : 4] : index % 2 ? [-4, 3] : [-3, 4];
    for (const col of treeCols) { ficus(group, col * TILE, 0, index + col + seed); blocked.add(col); }
    if (index % 4 === 0) { bench(group, -1.6, 0); blocked.add(-1); }
  }
  if (index % 4 === 0) {
    building(group, 1, index); building(group, -1, index);
    ficus(group, 9.2, 0, index + 90); ficus(group, -9.2, 0, index + 95);
    streetLamp(group, 8.6, -1); streetLamp(group, -8.6, 1);
  }
  if (index === 0 || index % 24 === 12) {
    block(group, 0xf2f2f2, 7.8, 1.25, 0, .07, 2.5, .07);
    sign(group, 'שד׳ ירושלים · شارع القدس', '#ffffff', 7.8, 2.38, .05, 2.1, .48);
    sign(group, 'JAFFA · يافا', '#ffffff', 7.8, 1.94, .05, 1.35, .32);
  }
  bake(group); group.position.z = -index * TILE;
  const speed = (kind === 'delivery' ? 2.65 : 1.65) + Math.min(Math.max(index, 0), 120) * .013;
  const spacing = kind === 'delivery' ? 7.8 : 9.5;
  const hazards = [];
  if (!safe) {
    for (let i = 0; i < 3; i++) {
      const mesh = createRider(kind, (index + i) % 3); faceDrawing(mesh, dir);
      const phase = (rand(index, seed) -.5) * spacing;
      const x = -spacing + i * spacing + phase;
      hazards.push({ x, previousX: x, dir, speed, mesh, halfWidth: kind === 'delivery' ? .85 : .73 });
    }
  }
  let pickup = null;
  if (index > 0 && (safe || index % 3 === 0)) {
    let col = index <= 1 ? 0 : Math.floor(rand(index, seed + 4) * 9) -4;
    while (blocked.has(col)) col = col >= 4 ? -4 : col + 1;
    const pickupKind = index % 12 === 4 ? 'rice' : 'bone';
    // Protection is an optional side trip, never an automatic center reward.
    if (pickupKind === 'rice') col = rand(index, seed + 8) > .5 ? 3 : -3;
    while (blocked.has(col)) col += col > 0 ? -1 : 1;
    pickup = { col, kind: pickupKind, collected: false, mesh: createPickup(pickupKind) };
  }
  return { index, kind, group, blocked, hazards, pickup };
}
