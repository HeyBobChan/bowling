import express from 'express';
import compression from 'compression';
import { chanaRouter } from './chana-router.mjs';
import { rateLimit } from 'express-rate-limit';
import { resolve } from 'node:path';

// Enable other games here when their game-over screens integrate the shared kit.
const games = { main: { maxScore: 1000000, scoreStep: 5 } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const initials = /^(?:[A-Z]{3}|[א-ת]{3})$/u;

export function createServer({ store, staticDir = resolve(import.meta.dirname, '../dist'), trustProxy = false, writeLimit = 30, allowedOrigins = [] }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
  app.use(compression());
  app.get('/healthz', async (_req, res) => {
    try { await store.check(); res.json({ ok: true }); }
    catch { res.status(503).json({ ok: false }); }
  });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.vary('Origin');
    const allowed = allowedOrigins.includes(req.get('Origin'));
    const birthday = req.path.startsWith('/chana/') || req.path.startsWith('/leaderboards/chana/');
    if (allowed) {
      res.set('Access-Control-Allow-Origin', req.get('Origin'));
      res.set('Access-Control-Allow-Methods', birthday ? 'GET, POST, PUT, OPTIONS' : 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', birthday ? 'Content-Type, Authorization' : 'Content-Type');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(allowed ? 204 : 403);
    next();
  });
  // The /kids/ proxy CSP permits the leaderboard prefix for cross-origin requests.
  app.use(['/api/leaderboards/chana', '/api/chana'], chanaRouter({ store, allowedOrigins }));
  const limiter = (limit) => rateLimit({ windowMs: 60000, limit, standardHeaders: 'draft-8',
    legacyHeaders: false, message: { error: 'too_many_requests' } });
  app.use('/api', limiter(180));
  app.use('/api', express.json({ limit: '2kb' }));
  app.param('game', (req, res, next, game) => {
    if (!Object.hasOwn(games, game)) return res.status(404).json({ error: 'unknown_game' });
    next();
  });
  app.get('/api/leaderboards/:game', async (req, res) => {
    res.json({ entries: await store.top(req.params.game) });
  });
  app.post('/api/leaderboards/:game', limiter(writeLimit), async (req, res) => {
    if (!req.is('application/json')) return res.status(415).json({ error: 'json_required' });
    const { submissionId, name: rawName, score } = req.body || {};
    const name = typeof rawName === 'string' ? rawName.trim().normalize('NFKC').toUpperCase() : '';
    const game = req.params.game, rule = games[game];
    if (typeof submissionId !== 'string' || !uuid.test(submissionId) || !initials.test(name)
      || !Number.isSafeInteger(score) || score < 0 || score > rule.maxScore || score % rule.scoreStep !== 0) {
      return res.status(400).json({ error: 'invalid_score' });
    }
    const saved = await store.save({ submissionId, game, name, score });
    if (saved.conflict) return res.status(409).json({ error: 'submission_conflict' });
    res.status(saved.created ? 201 : 200).json({ entry: saved.entry });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
  // Preserve the static site's caching and real 404s; no SPA fallback.
  app.use('/assets', express.static(resolve(staticDir, 'assets'), { immutable: true, maxAge: '1y', index: false }));
  app.use(express.static(staticDir, {
    setHeaders(res, path) { if (path.endsWith('.html')) res.set('Cache-Control', 'no-cache'); },
  }));
  app.use((_req, res) => res.status(404).type('text').send('Not found'));
  app.use((error, _req, res, _next) => {
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 503;
    if (status === 503) console.error('Leaderboard request failed.');
    res.status(status).json({ error: status === 503 ? 'unavailable' : 'invalid_request' });
  });
  return app;
}
