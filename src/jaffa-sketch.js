// Render the actual pencil strokes from the supplied photograph as paper cutouts.
// The photograph is retained unmodified. These crop rectangles are in its original
// 960 × 1280 coordinates; no character is regenerated or replaced with a model.
import * as THREE from 'three';
import referenceUrl from '../drawings/jaffa-dog-and-scooters.jpg';
import { rigDrawing } from './jaffa-motion.js';

export const DRAWING_REGIONS = {
  dog: { crop: [190, 916, 371, 222], width: 2.2 },
  delivery: { crop: [585, 805, 374, 334], width: 2.18 },
  scooter: { crop: [629, 287, 173, 260], width: 1.43 },
  bone: { crop: [650, 642, 98, 55], width: .65 },
  rice: { crop: [796, 607, 82, 104], width: .53 },
};
const textures = new Map();
let loading;

// Local paper normalization removes the photographed page's uneven lighting.
// Flood fill makes only the outside transparent, keeping white paper inside the
// original silhouettes and retaining the original grayscale pencil strokes.
function cutout(image, [sx, sy, w, h]) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, sx, sy, w, h, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h), luma = new Float32Array(w * h);
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, p = i * 4;
      const value = pixels.data[p] * .299 + pixels.data[p + 1] * .587 + pixels.data[p + 2] * .114;
      luma[i] = value; row += value; sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  const ink = new Float32Array(w * h), barrier = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x -28), y0 = Math.max(0, y -28), x1 = Math.min(w, x +29), y1 = Math.min(h, y +29);
    const paper = (sum[y1 * (w + 1) + x1] -sum[y0 * (w + 1) + x1] -sum[y1 * (w + 1) + x0] +sum[y0 * (w + 1) + x0]) / ((x1 -x0) * (y1 -y0));
    const strength = Math.max(0, Math.min(1, (paper -luma[y * w + x] -5) / 32));
    ink[y * w + x] = strength;
    if (strength > .22) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < w && yy >= 0 && yy < h) barrier[yy * w + xx] = 1;
    }
  }
  const outside = new Uint8Array(w * h), queue = new Int32Array(w * h); let head = 0, tail = 0;
  const add = i => { if (!barrier[i] && !outside[i]) { outside[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < w; x++) { add(x); add((h -1) * w + x); }
  for (let y = 0; y < h; y++) { add(y * w); add(y * w + w -1); }
  while (head < tail) {
    const i = queue[head++], x = i % w, y = Math.floor(i / w);
    if (x > 0) add(i -1); if (x +1 < w) add(i +1); if (y > 0) add(i -w); if (y +1 < h) add(i +w);
  }
  for (let i = 0; i < w * h; i++) {
    const p = i * 4, value = outside[i] ? 255 : Math.round(255 * (1 -ink[i]));
    pixels.data[p] = pixels.data[p +1] = pixels.data[p +2] = value;
    // Photograph noise outside the silhouette is not part of the drawing.
    // White transparent texels also avoid dark fringes when the art is filtered.
    pixels.data[p +3] = outside[i] ? 0 : 255;
  }
  ctx.putImageData(pixels, 0, 0); return canvas;
}
export function loadSketchArtwork() {
  if (!loading) loading = new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => {
      for (const [kind, region] of Object.entries(DRAWING_REGIONS)) {
        const map = new THREE.CanvasTexture(cutout(image, region.crop));
        map.colorSpace = THREE.SRGBColorSpace; map.name = `original-drawing:${kind}`;
        textures.set(kind, map);
      }
      resolve();
    };
    image.onerror = () => reject(new Error('The original character drawing could not be loaded.'));
    image.src = referenceUrl;
  });
  return loading;
}
const spriteMaterials = new Map();
let normalGeometry, mirroredGeometry;
export function drawingActor(kind) {
  const region = DRAWING_REGIONS[kind];
  if (!spriteMaterials.has(kind)) spriteMaterials.set(kind, new THREE.SpriteMaterial({ map: textures.get(kind), color: 0xffffff, alphaTest: .06, transparent: true, depthWrite: true, toneMapped: false }));
  const animated = kind === 'dog' || kind === 'delivery' || kind === 'scooter';
  const material = animated ? spriteMaterials.get(kind).clone() : spriteMaterials.get(kind);
  const motion = animated ? rigDrawing(material, kind, region) : null;
  const group = new THREE.Group(), sprite = new THREE.Sprite(material);
  if (!normalGeometry) {
    normalGeometry = sprite.geometry; mirroredGeometry = normalGeometry.clone();
    const uv = mirroredGeometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 -uv.getX(i));
  }
  const contact = { dog: 215, delivery: 311.5, scooter: 248 }[kind] ?? region.crop[3];
  const contactAngle = { delivery: Math.atan2(5, 222), scooter: -Math.atan2(16, 129) }[kind] ?? 0;
  sprite.center.set(.5, 1 -contact / region.crop[3]); sprite.scale.set(region.width, region.width * region.crop[3] / region.crop[2], 1);
  sprite.position.y = .025; sprite.material.rotation = contactAngle; group.add(sprite);
  if (kind === 'dog') { sprite.renderOrder = 20; sprite.material.depthTest = false; sprite.material.depthWrite = false; }
  group.userData = { art: 'original-drawing', kind, sprite, width: region.width, sourceCrop: [...region.crop], motion, contactAngle, facing: -1 };
  return group;
}
export function faceDrawing(actor, direction) {
  const { sprite, width, contactAngle } = actor.userData;
  // All three characters face left in the original drawing.
  if (sprite) { sprite.geometry = direction > 0 ? mirroredGeometry : normalGeometry; sprite.scale.x = width; sprite.material.rotation = direction > 0 ? -contactAngle : contactAngle; actor.userData.facing = Math.sign(direction); }
}
export function drawingCanvas(kind) { return textures.get(kind)?.image; }

// The setting uses the same uncolored pencil vocabulary: irregular contours,
// sparse leaf strokes and hanging ficus roots, drawn as native canvas geometry.
let ficusMaterial;
export function ficusDrawing() {
  if (!ficusMaterial) {
    const c = document.createElement('canvas'); c.width = 440; c.height = 520;
    const g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
    const stroke = (path, width = 2.2) => { g.strokeStyle = '#333'; g.lineWidth = width; g.stroke(new Path2D(path)); };
    const fill = path => { const p = new Path2D(path); g.fillStyle = '#fff'; g.fill(p); g.strokeStyle = '#333'; g.lineWidth = 2.7; g.stroke(p); };
    fill('M191 230 Q188 350 173 462 L151 489 Q204 481 216 478 Q238 485 278 489 L250 465 Q227 368 240 228 Z');
    stroke('M216 470 Q202 385 215 310 M239 458 Q215 353 233 290 M183 463 L197 444 M252 473 L232 451 M210 372 Q170 317 137 270 M228 339 Q263 276 291 258');
    const crown = 'M50 285 C16 288 5 261 27 241 C0 223 13 192 35 180 C18 151 40 127 64 123 C62 92 94 71 119 82 C134 51 169 48 189 62 C208 26 253 34 271 58 C306 42 338 62 344 91 C381 85 409 111 399 137 C439 148 439 185 416 202 C445 231 424 256 403 260 C415 292 380 312 356 300 C337 330 304 325 286 310 C262 339 233 324 211 313 C185 337 151 320 143 306 C113 327 81 313 78 293 C63 304 48 298 50 285 Z';
    fill(crown);
    for (let i = 0; i < 64; i++) {
      const x = 47 + ((i * 71) % 340), y = 91 + ((i * 53) % 190);
      stroke(`M${x} ${y} q-13 -14 -22 0 q6 14 17 8 m6 -9 q10 -16 21 -4`, i % 3 === 0 ? 1.9 : 1.1);
    }
    for (let i = 0; i < 9; i++) { const x = 106 + i * 27; stroke(`M${x} ${285 +(i % 3) * 7} q-8 45 -3 ${65 +(i % 4) * 15}`, 1.3); }
    stroke('M35 500 Q105 489 151 495 M274 495 Q315 486 382 496', 1.2);
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
    ficusMaterial = new THREE.SpriteMaterial({ map, color: 0xffffff, alphaTest: .06, transparent: true, depthWrite: true, toneMapped: false });
  }
  const sprite = new THREE.Sprite(ficusMaterial); sprite.center.set(.5, 0); sprite.scale.set(2.8, 3.3, 1); sprite.position.y = .04; return sprite;
}
