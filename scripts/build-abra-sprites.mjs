#!/usr/bin/env node
// Packs every picture the "abra" typing toy can conjure into one sprite sheet:
//   src/abra/things.png   72px cells, 24 per row, each emoji drawn 64x64 in the middle of its cell
//   src/abra/things.json  { cell, cols, count, index: { "<emoji as written in words-data.js>": cell number } }
// The engine reads the cells as silhouettes and colours; nothing else on the site uses them.
//
// The graphics are Twemoji, (c) Twitter / X Corp and contributors, licensed CC-BY 4.0
// (https://github.com/twitter/twemoji). They are not vendored; fetch them once somewhere outside the repo:
//   mkdir /tmp/twemoji && cd /tmp/twemoji && npm init -y && npm install @twemoji/svg@15.0.0
// and re-run this after changing any `e` in src/abra/words-data.js or the EXTRA_EMOJI list there:
//   node scripts/build-abra-sprites.mjs /tmp/twemoji/node_modules/@twemoji/svg
// It draws with the Chromium that Playwright already has (set CHROMIUM_PATH to use another binary).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const CELL = 72;      // one cell of the sheet, px
const ART = 64;       // the emoji inside it, px (so a 4px transparent margin all round)
const COLS = 24;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outPng = join(root, 'src/abra/things.png');
const outJson = join(root, 'src/abra/things.json');

const svgDir = process.argv[2] && resolve(process.argv[2]);
if (!svgDir) {
  console.error('usage: node scripts/build-abra-sprites.mjs <path-to-@twemoji/svg-package-dir>');
  process.exit(1);
}

// Twemoji names a file after the emoji's code points (lowercase hex joined with "-"). It drops the
// U+FE0F variation selector from plain emoji (2764.svg) but keeps it inside joined sequences
// (1f9dc-200d-2640-fe0f.svg), and people type emoji both ways. So compare with FE0F removed on both sides.
const bare = (parts) => parts.filter((p) => p !== 'fe0f').join('-');
const files = new Map();
for (const name of readdirSync(svgDir)) {
  if (name.endsWith('.svg')) files.set(bare(name.slice(0, -4).split('-')), name);
}
if (!files.size) {
  console.error(`no .svg files in ${svgDir}`);
  process.exit(1);
}
const fileOf = (emoji) => files.get(bare([...emoji].map((ch) => ch.codePointAt(0).toString(16))));

const data = await import('../src/abra/words-data.js');
const wanted = [...data.WORDS.map((entry) => entry.e), ...(data.EXTRA_EMOJI || [])];

// One cell per picture, in order of first appearance. Two spellings of the same emoji (with and
// without FE0F) share a cell, and each keeps its own key in the index.
const cells = [];               // svg file names, by cell number
const cellOfFile = new Map();
const index = {};
const missing = [];
for (const emoji of wanted) {
  if (typeof emoji !== 'string' || !emoji) { missing.push(String(emoji)); continue; }
  if (emoji in index) continue;
  const file = fileOf(emoji);
  if (!file) { missing.push(emoji); continue; }
  if (!cellOfFile.has(file)) { cellOfFile.set(file, cells.length); cells.push(file); }
  index[emoji] = cellOfFile.get(file);
}
if (missing.length) {
  const list = [...new Set(missing)].map((e) => `${e} (${[...e].map((ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase()).join(' ')})`);
  console.error(`${list.length} emoji have no SVG in ${svgDir}:\n  ${list.join('\n  ')}`);
  process.exit(1);
}

const count = cells.length;
const rows = Math.ceil(count / COLS);
const width = COLS * CELL, height = rows * CELL;
// Give every SVG an explicit size so the browser rasterizes it at exactly ART px, never scaling a bitmap.
const svgs = cells.map((file) => readFileSync(join(svgDir, file), 'utf8').replace('<svg ', `<svg width="${ART}" height="${ART}" `));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let rgba;
try {
  const page = await browser.newPage();
  const base64 = await page.evaluate(async ({ svgs, CELL, ART, COLS, width, height }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');          // starts fully transparent
    const pad = (CELL - ART) / 2;
    for (let i = 0; i < svgs.length; i++) {
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgs[i]);
      await img.decode();
      ctx.drawImage(img, (i % COLS) * CELL + pad, Math.floor(i / COLS) * CELL + pad, ART, ART);
    }
    // Hand the raw pixels back; Node packs them far tighter than the browser's own PNG encoder.
    const { data } = ctx.getImageData(0, 0, width, height);
    let binary = '';
    for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
    return btoa(binary);
  }, { svgs, CELL, ART, COLS, width, height });
  rgba = Buffer.from(base64, 'base64');
} finally {
  await browser.close();
}
if (rgba.length !== width * height * 4) throw new Error(`expected ${width * height * 4} bytes of pixels, got ${rgba.length}`);

// ---- a small lossless PNG writer (8-bit RGBA): every row filter is tried, the smallest file wins ----
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const out = Buffer.alloc(body.length + 12);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'latin1');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, body.length + 8)), body.length + 8);
  return out;
}
// PNG row filters 0-4 (none, sub, up, average, paeth); `choice` is one of them, or 'best' = pick per row.
function filtered(pixels, w, h, choice) {
  const stride = w * 4;
  const out = Buffer.alloc((stride + 1) * h);
  const tries = choice === 'best' ? [0, 1, 2, 3, 4] : [choice];
  const rowsTried = tries.map(() => Buffer.alloc(stride));
  for (let y = 0; y < h; y++) {
    const row = y * stride;
    let best = 0, bestCost = Infinity;
    tries.forEach((type, t) => {
      const line = rowsTried[t];
      let cost = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? pixels[row + x - 4] : 0;
        const b = y > 0 ? pixels[row + x - stride] : 0;
        const c = x >= 4 && y > 0 ? pixels[row + x - stride - 4] : 0;
        let predicted = 0;
        if (type === 1) predicted = a;
        else if (type === 2) predicted = b;
        else if (type === 3) predicted = (a + b) >> 1;
        else if (type === 4) {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const v = (pixels[row + x] - predicted) & 0xff;
        line[x] = v;
        cost += v < 128 ? v : 256 - v;
      }
      if (cost < bestCost) { bestCost = cost; best = t; }
    });
    out[y * (stride + 1)] = tries[best];
    rowsTried[best].copy(out, y * (stride + 1) + 1);
  }
  return out;
}
function encodePng(pixels, w, h) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header.set([8, 6, 0, 0, 0], 8);               // 8 bits per channel, RGBA, no interlace
  let idat = null;
  for (const choice of [0, 1, 2, 3, 4, 'best']) {
    const packed = deflateSync(filtered(pixels, w, h, choice), { level: 9, memLevel: 9 });
    if (!idat || packed.length < idat.length) idat = packed;
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const png = encodePng(rgba, width, height);
writeFileSync(outPng, png);
writeFileSync(outJson, JSON.stringify({ cell: CELL, cols: COLS, count, index }) + '\n');

const kb = (png.length / 1024).toFixed(1);
console.log(`things.png  ${width}x${height}px, ${count} pictures in ${rows} rows of ${COLS}, ${kb} KB`);
console.log(`things.json ${Object.keys(index).length} emoji keys -> ${count} cells`);
