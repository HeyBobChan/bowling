// The dictionary's pictures: one sheet of small Twemoji drawings (see things.json and
// scripts/build-abra-sprites.mjs). They are never shown; shapes.js reads their pixels.
import sheetUrl from './things.png';
import meta from './things.json';

const bare = (s) => s.replace(/️/g, '');
const index = new Map();
for (const [emoji, cell] of Object.entries(meta.index)) { index.set(emoji, cell); index.set(bare(emoji), cell); }

export async function loadSprites() {
  const img = new Image();
  img.decoding = 'async';
  img.src = sheetUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const cache = new Map();
  return {
    count: meta.count,
    has: (emoji) => index.has(emoji) || index.has(bare(emoji)),
    get(emoji) {
      const cell = index.get(emoji) ?? index.get(bare(emoji));
      if (cell == null) return null;
      let data = cache.get(cell);
      if (!data) {
        data = ctx.getImageData((cell % meta.cols) * meta.cell, Math.floor(cell / meta.cols) * meta.cell, meta.cell, meta.cell);
        cache.set(cell, data);
        if (cache.size > 120) cache.delete(cache.keys().next().value);
      }
      return data;
    },
  };
}
