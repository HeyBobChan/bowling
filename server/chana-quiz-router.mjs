import express from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { createHash } from 'node:crypto';
import { quizApi } from './chana-quiz-api.mjs';

// Mounted ahead of the timeline router, under the same /api/leaderboards/chana prefix
// that the /kids/ Content Security Policy and the birthday CORS rules already allow.
export function chanaQuizRouter({ store, allowedOrigins = [] }) {
  const router = express.Router();
  router.post('/rooms', rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }));
  // Guests share one Wi-Fi address, so authenticated requests are limited per capability.
  router.use(rateLimit({ windowMs: 60000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: (req) => /^Bearer [0-9a-f-]{36}$/i.test(req.get('Authorization') || '')
      ? createHash('sha256').update('quiz' + req.get('Authorization')).digest('hex') : ipKeyGenerator(req.ip),
    message: { error: 'יותר מדי בקשות. המתינו רגע ונסו שוב.' } }));
  router.use(express.text({ type: '*/*', limit: '4kb' }));
  router.use(async (req, res, next) => {
    try {
      if (!store.chanaTransaction) return res.status(503).json({ error: 'המשחק אינו מחובר כרגע. נסו שוב בעוד רגע.' });
      const headers = new Headers();
      for (const key of ['authorization', 'origin', 'sec-fetch-site', 'content-type']) if (req.get(key)) headers.set(key, req.get(key));
      const request = new Request(`${req.protocol}://${req.get('host')}/quiz${req.url}`, { method: req.method, headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: req.body || '' } : {}) });
      const code = req.path.match(/^\/rooms\/(\d{7})/)?.[1];
      const response = await store.chanaTransaction('quiz:' + (code || 'create'), (db) => quizApi(request, { DB: db, ALLOWED_ORIGINS: allowedOrigins }));
      res.status(response.status);
      for (const [key, value] of response.headers) res.set(key, value);
      res.send(Buffer.from(await response.arrayBuffer()));
    } catch (error) { next(error); }
  });
  return router;
}
