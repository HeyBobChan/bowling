// Packs the whole game into one self-contained HTML file: dist/trumpagotchi.html.
// Double-click it, email it, or drop it on any host. (No service worker or manifest in
// this form, so it cannot be installed as an app; the multi-file site can.)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const dataUri = (p) => 'data:image/png;base64,' + readFileSync(resolve(root, p)).toString('base64');

let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="([^"]+)" \/>/, (m, href) => '<style>\n' + read(href) + '</style>');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => '<script>\n' + read(src).replace(/<\/script/g, '<\\/script') + '</script>');
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
html = html.replace(/\s*<meta property="og:image"[^>]*>/, '');
const icon = dataUri('icons/icon-192.png');
html = html.replace(/href="icons\/icon-192\.png"/g, 'href="' + icon + '"');
html = html.replace(/icons\/icon-192\.png/g, icon); // notification icon inside the script

if (/(?:src|href)="(?!data:|#)[^"]*\.(?:js|css|png)"/.test(html)) throw new Error('something was left un-inlined');
mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist', 'trumpagotchi.html'), html);
console.log('wrote dist/trumpagotchi.html (' + Math.round(html.length / 1024) + ' KB)');
