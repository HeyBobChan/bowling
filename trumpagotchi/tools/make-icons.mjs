// Renders the app icons and the link-preview image from the same pixel art the game uses.
// Needs Playwright with Chromium available (it is not a dependency of the app itself).
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const page = await browser.newPage();
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
for (const f of ['content', 'game', 'art']) await page.addScriptTag({ path: resolve(root, 'js', f + '.js') });

const out = await page.evaluate(() => {
  const A = window.TG.art;
  const icon = (size, pad) => { const c = document.createElement('canvas'); c.width = c.height = size; A.drawIcon(c, 47, pad); return c.toDataURL('image/png'); };

  // link preview: his office on the left, the name on the right
  const og = document.createElement('canvas'); og.width = 1200; og.height = 630;
  const x = og.getContext('2d');
  const grad = x.createLinearGradient(0, 0, 0, 630); grad.addColorStop(0, '#1d2f5f'); grad.addColorStop(1, '#070d1f');
  x.fillStyle = grad; x.fillRect(0, 0, 1200, 630);
  x.strokeStyle = '#e0b43c'; x.lineWidth = 8; x.strokeRect(16, 16, 1168, 598);
  const room = document.createElement('canvas'); room.width = A.W; room.height = A.H;
  const g = room.getContext('2d'); g.imageSmoothingEnabled = false;
  const decor = {}; ['magazine', 'trophy', 'tv', 'curtains', 'button', 'portrait', 'chandelier', 'eagle'].forEach((d) => { decor[d] = true; });
  A.drawRoom(g, { scene: 'oval', frame: 12, decor, hour: 11, season: null, bunting: false });
  A.drawDon(g, 78, A.FLOOR, A.look(47, {}), A.pose('thumbs', 3, { mood: 'happy' }), { face: 1 });
  x.fillStyle = '#e0b43c'; x.fillRect(52, 87, 616, 466);
  x.imageSmoothingEnabled = false; x.drawImage(room, 0, 0, A.W, A.H, 60, 95, 600, 450);
  x.textAlign = 'left';
  x.fillStyle = '#f7dc7a';
  let size = 64;
  do { size -= 2; x.font = '700 ' + size + 'px Georgia, "Times New Roman", serif'; } while (x.measureText('TRUMPAGOTCHI').width > 440);
  x.fillText('TRUMPAGOTCHI', 706, 250);
  x.fillStyle = '#fbf7ee'; x.font = '600 30px system-ui, Arial, sans-serif';
  ['The most tremendous', 'virtual pet. Everybody', 'says so.'].forEach((l, i) => x.fillText(l, 708, 310 + i * 40));
  x.fillStyle = '#a9b4d0'; x.font = '500 22px system-ui, Arial, sans-serif';
  x.fillText('Feed him. Flatter him.', 708, 460); x.fillText('Watch him become more himself.', 708, 490);
  x.fillStyle = '#6f7ba0'; x.font = '500 18px system-ui, Arial, sans-serif';
  x.fillText('A parody.', 708, 540);
  return { 'icon-192.png': icon(192, 0.06), 'icon-512.png': icon(512, 0.06), 'icon-maskable-512.png': icon(512, 0.17), 'og.png': og.toDataURL('image/png') };
});
await browser.close();

mkdirSync(resolve(root, 'icons'), { recursive: true });
for (const [name, url] of Object.entries(out)) {
  writeFileSync(resolve(root, 'icons', name), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote icons/' + name);
}
