import { createStore } from './store.mjs';
import { createServer } from './app.mjs';

let store;
if (process.env.DATABASE_URL) {
  try { store = await createStore(process.env.DATABASE_URL); }
  catch { console.error('Unable to initialize the leaderboard database.'); process.exit(1); }
} else {
  if (process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL is required.');
  console.warn('No DATABASE_URL: games work, but shared scores are unavailable.');
  const unavailable = async () => { throw new Error('No database'); };
  store = { check: unavailable, top: unavailable, save: unavailable, close: async () => {} };
}
const app = createServer({ store, trustProxy: process.env.NODE_ENV === 'production' ? 1 : false });
const server = app.listen(Number(process.env.PORT || 5200), '0.0.0.0', () => console.log('Games server ready.'));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  const timeout = setTimeout(() => process.exit(1), 10000).unref();
  server.close(async () => { await store.close(); clearTimeout(timeout); process.exit(0); });
});
