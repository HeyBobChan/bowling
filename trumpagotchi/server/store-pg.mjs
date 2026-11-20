// Pets kept in PostgreSQL. Everything lives in the `trumpagotchi` schema and every query
// names it, so this app never depends on, or touches, anything else in the database.
// Connect with the restricted `trumpagotchi_app` login (see permissions.sql), not an administrator.
import pg from 'pg';

export function createPgStore(connectionString, { maxPets = 250000 } = {}) {
  const pool = new pg.Pool({
    connectionString, max: 5, idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5000, query_timeout: 8000, statement_timeout: 8000,
  });
  pool.on('error', (e) => console.error('Database connection error:', e.message)); // an idle connection dropping must not stop the server
  let known = { n: 0, at: 0 }; // the pet count, refreshed at most once a minute
  async function count() {
    if (Date.now() - known.at > 60_000) {
      const r = await pool.query('SELECT count(*)::int AS n FROM trumpagotchi.pets');
      known = { n: r.rows[0].n, at: Date.now() };
    }
    return known.n;
  }
  const row = (r) => ({ rev: r.rev, state: r.state, updatedAt: r.updated_at.getTime() });
  return {
    kind: 'postgres',
    async create(hash, state) {
      if ((await count()) >= maxPets) return null;
      const r = await pool.query(
        'INSERT INTO trumpagotchi.pets (key_hash, state) VALUES ($1, $2::jsonb) ON CONFLICT (key_hash) DO NOTHING RETURNING rev',
        [hash, JSON.stringify(state)]);
      if (!r.rowCount) return null;
      known.n++;
      return { rev: r.rows[0].rev };
    },
    async get(hash) {
      const r = await pool.query('SELECT rev, state, updated_at FROM trumpagotchi.pets WHERE key_hash = $1', [hash]);
      return r.rowCount ? row(r.rows[0]) : null;
    },
    // Saves only land on the revision the device last saw; otherwise the caller gets the newer pet back.
    async put(hash, baseRev, state) {
      const r = await pool.query(
        'UPDATE trumpagotchi.pets SET state = $3::jsonb, rev = rev + 1, updated_at = now() WHERE key_hash = $1 AND rev = $2 RETURNING rev',
        [hash, baseRev, JSON.stringify(state)]);
      if (r.rowCount) return { ok: true, rev: r.rows[0].rev };
      const current = await this.get(hash);
      return current ? Object.assign({ ok: false }, current) : null;
    },
    async rotate(hash, newHash) {
      const r = await pool.query('UPDATE trumpagotchi.pets SET key_hash = $2 WHERE key_hash = $1', [hash, newHash]);
      return r.rowCount === 1;
    },
    async remove(hash) {
      const r = await pool.query('DELETE FROM trumpagotchi.pets WHERE key_hash = $1', [hash]);
      if (r.rowCount) known.n = Math.max(0, known.n - 1);
      return r.rowCount === 1;
    },
    count,
    // Pets nobody has saved for a very long time are let go.
    async prune(days) {
      const r = await pool.query('DELETE FROM trumpagotchi.pets WHERE updated_at < now() - make_interval(days => $1::int)', [days]);
      return r.rowCount;
    },
    async close() { await pool.end(); },
  };
}
