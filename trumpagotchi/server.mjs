// A tiny static server so Trumpagotchi can run anywhere Node runs (Railway, Fly, a VPS).
// No dependencies. Any static host works just as well: the app is plain files.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const PUBLIC = new Set(['index.html', 'manifest.webmanifest', 'sw.js']);

// Link previews (chat apps, social sites) need absolute addresses. Set PUBLIC_URL to where
// visitors reach the page, e.g. https://example.com/trumpagotchi/, and the preview tags use it.
// Everything else in the page stays relative, so it keeps working under any path.
function publicUrl() {
  try {
    const u = new URL(process.env.PUBLIC_URL || '');
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return (u.origin + u.pathname).replace(/\/?$/, '/').replace(/["<>&]/g, '');
  } catch { return ''; }
}
const SITE = publicUrl();
function withPreviewTags(html) {
  if (!SITE) return html;
  return html
    .replace('content="icons/og.png"', 'content="' + SITE + 'icons/og.png"')
    .replace('<meta property="og:type"', '<meta property="og:url" content="' + SITE + '" />\n  <meta property="og:type"');
}
const PUBLIC_DIRS = ['css', 'js', 'icons'];

function allowed(rel) {
  return PUBLIC.has(rel) || PUBLIC_DIRS.some((d) => rel.startsWith(d + '/'));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }).end('tremendous'); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    let rel = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '').split(sep).join('/');
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = join(ROOT, rel);
    if (!file.startsWith(ROOT + sep) || !allowed(rel) || !(await stat(file)).isFile()) throw new Error('not found');
    let body = await readFile(file);
    if (rel === 'index.html') body = Buffer.from(withPreviewTags(body.toString('utf8')));
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      // the service worker and the page revalidate every time; everything else for an hour
      'cache-control': rel === 'sw.js' || rel === 'index.html' ? 'no-cache' : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found. Sad!');
  }
});
server.listen(PORT, () => console.log(`Trumpagotchi is live on http://localhost:${PORT}`));
