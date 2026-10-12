import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { renderRoster } from './scripts/lobby.mjs';

// One page per game, declared once in games.json (the kit reads the same file for
// the cross-links between games). ONLY=<id> builds a single self-contained page —
// used by scripts/build-artifact.mjs; ARTIFACT=1 makes the cross-links point at
// the published artifact URLs instead of local paths.
const manifest = JSON.parse(readFileSync(resolve(__dirname, 'games.json'), 'utf8'));
const only = process.env.ONLY;
const games = manifest.games.filter((g) => !only || g.id === only);
if (only && games.length === 0) throw new Error(`ONLY=${only} is not a game id in games.json`);

const lobbyPlugin = () => ({
  name: 'game-roster',
  transformIndexHtml: {
    order: 'pre',
    handler(html, ctx) {
      if (ctx.filename === resolve(__dirname, 'index.html')) {
        const current = JSON.parse(readFileSync(resolve(__dirname, 'games.json'), 'utf8'));
        return html.replace('<!-- GAME_ROSTER -->', renderRoster(current.games));
      }
      if (process.env.ARTIFACT === '1') return html;
      return html.replace('<body>', '<body>\n  <a class="game-home" href="/">← כל המשחקים</a>');
    },
  },
});

const BABYLON_VERSION = '9.25.0';
// Artifact builds must stay small (the host rejects pages around 10 MB), so the ski game's
// Babylon import is redirected to a stub that reads window.BABYLON, and the pinned UMD scripts
// are injected into that page from jsdelivr (an allowed script host for artifacts).
const babylonCdnPlugin = () => ({
  name: 'babylon-cdn-for-artifacts',
  enforce: 'pre',   // before vite:resolve, or the relative import is resolved first
  resolveId(source, importer) {
    if (process.env.ARTIFACT === '1' && source.endsWith('kit/babylon.js') && importer) return resolve(__dirname, 'src/kit/babylon-cdn.js');
    return null;
  },
  transformIndexHtml(html, ctx) {
    if (process.env.ARTIFACT !== '1' || !/ski\.html$/.test(ctx.filename)) return html;
    const tags = `<script src="https://cdn.jsdelivr.net/npm/babylonjs@${BABYLON_VERSION}/babylon.js"></script>\n`
      + `<script src="https://cdn.jsdelivr.net/npm/babylonjs-loaders@${BABYLON_VERSION}/babylonjs.loaders.min.js"></script>\n`;
    return html.replace('</head>', `${tags}</head>`);
  },
});

export default defineConfig({
  plugins: [lobbyPlugin(), babylonCdnPlugin()],
  define: { __ARTIFACT__: JSON.stringify(process.env.ARTIFACT === '1') },
  // Babylon (ski game) must be pre-bundled in one pass: if the optimizer discovers it mid-session
  // the page ends up with two copies and the engine extensions land on the wrong class.
  optimizeDeps: { include: ['@babylonjs/core/Legacy/legacy', '@babylonjs/loaders/glTF'] },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    strictPort: false,
  },
  build: {
    outDir: process.env.OUT_DIR || 'dist',
    // the ski game's dog.glb (2.4 MB) rides inside the single-file artifact as a data URL
    assetsInlineLimit: process.env.ARTIFACT === '1' ? 16 * 1024 * 1024 : 4096,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        ...(!only ? { lobby: resolve(__dirname, 'index.html') } : {}),
        ...Object.fromEntries(games.map((g) => [g.id, resolve(__dirname, g.page)])),
      },
    },
  },
});
