import express from 'express';
import compression from 'compression';
import { chanaRouter } from './chana-router.mjs';
import { rateLimit } from 'express-rate-limit';
import { resolve } from 'node:path';
import { cachedQuery } from './cached.mjs';
import { UUID, TOKEN } from './score-rules.mjs';

// Enable other games here when their game-over screens integrate the shared kit.
const games = { main: { maxScore: 1000000, scoreStep: 5 } };
const initials = /^(?:[A-Z]{3}|[א-ת]{3})$/u;

export function createServer({ store, staticDir = resolve(import.meta.dirname, '../dist'), trustProxy = false, writeLimit = 30, globalLimit = 600, runLimit = 15, cacheMs = 2000, healthCacheMs = 5000, allowedOrigins = [] }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
  app.use(compression());
  const limiter = (limit, global = false) => rateLimit({ windowMs: 60000, limit, standardHeaders: 'draft-8',
    legacyHeaders: false, ...(global ? { keyGenerator: () => 'all' } : {}), message: { error: 'too_many_requests' } });
  // Fixed global buckets run before per-IP buckets, bounding their memory use.
  app.use('/api', limiter(12000, true));
  app.use('/api/leaderboards/main', limiter(globalLimit, true));
  const health = cachedQuery(() => store.check(), healthCacheMs);
  const boards = Object.fromEntries(Object.keys(games).map((game) => [game, cachedQuery(() => store.top(game), cacheMs)]));
  app.get('/healthz', limiter(120, true), async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try { await health.get(); res.json({ ok: true }); }
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
  app.use('/api', limiter(180));
  app.use('/api', express.json({ limit: '2kb', inflate: false }));
  app.param('game', (req, res, next, game) => {
    if (!Object.hasOwn(games, game)) return res.status(404).json({ error: 'unknown_game' });
    next();
  });
  app.get('/api/leaderboards/:game', async (req, res) => {
    res.json({ entries: await boards[req.params.game].get() });
  });
  app.post('/api/leaderboards/:game/runs', limiter(runLimit), async (req, res) => {
    if (!req.is('application/json')) return res.status(415).json({ error: 'json_required' });
    res.status(201).json({ run: await store.beginRun(req.params.game) });
  });
  app.post('/api/leaderboards/:game', limiter(writeLimit), async (req, res) => {
    if (!req.is('application/json')) return res.status(415).json({ error: 'json_required' });
    const { submissionId, name: rawName, score, runId, runToken, durationMs, strikes, knocked } = req.body || {};
    const name = typeof rawName === 'string' ? rawName.trim().normalize('NFKC').toUpperCase() : '';
    const game = req.params.game, rule = games[game];
    if (typeof submissionId !== 'string' || !UUID.test(submissionId) || !initials.test(name)
      || !Number.isSafeInteger(score) || score < 0 || score > rule.maxScore || score % rule.scoreStep !== 0) {
      return res.status(400).json({ error: 'invalid_score' });
    }
    if (typeof runId !== 'string' || !UUID.test(runId) || typeof runToken !== 'string' || !TOKEN.test(runToken)) {
      return res.status(403).json({ error: 'run_required' });
    }
    if (![durationMs, strikes, knocked].every(Number.isSafeInteger)) return res.status(400).json({ error: 'invalid_result' });
    const saved = await store.save({ submissionId, game, name, score, runId, runToken, durationMs, strikes, knocked });
    if (saved.conflict) return res.status(409).json({ error: 'submission_conflict' });
    boards[game].invalidate();
    res.status(saved.created ? 201 : 200).json({ entry: saved.entry });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
  // Preserve the static site's caching and real 404s; no SPA fallback.
  app.use('/assets', express.static(resolve(staticDir, 'assets'), { immutable: true, maxAge: '1y', index: false }));
  // Games are linked without a suffix (/chana); older /chana.html links keep working.
  app.use(express.static(staticDir, {
    extensions: ['html'],
    setHeaders(res, path) { if (path.endsWith('.html')) res.set('Cache-Control', 'no-cache'); },
  }));
  app.use((_req, res) => res.status(404).type('text').send('Not found'));
  app.use((error, _req, res, _next) => {
    const status = [400, 403, 409, 410, 429, 503].includes(error.status) ? error.status
      : error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : error.type === 'encoding.unsupported' ? 415 : 503;
    if (status === 429) res.set('Retry-After', '3600');
    if (status === 503) console.error('Leaderboard request failed.');
    res.status(status).json({ error: status === 503 ? 'unavailable' : 'invalid_request' });
  });
  return app;
}
