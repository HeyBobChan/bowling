import pg from 'pg';
import { readFile } from 'node:fs/promises';

const fields = 'submission_id AS id, game_id AS game, name, score, created_at AS "createdAt"';
const order = 'score DESC, created_at ASC, submission_id ASC';

export async function createStore(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000, statement_timeout: 5000 });
  // Never log connection options: the URL contains the database password.
  pool.on('error', () => console.error('Leaderboard database connection interrupted.'));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize startup migrations during overlapping deployments.
    await client.query('SELECT pg_advisory_xact_lock(728301901)');
    await client.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    // Release before ending the pool; pool.end waits for checked-out clients.
    client.release();
    await pool.end();
    throw error;
  }
  client.release();

  return {
    async check() { await pool.query('SELECT 1'); },
    async top(game) {
      const result = await pool.query(`SELECT ${fields} FROM leaderboard_scores WHERE game_id = $1 ORDER BY ${order} LIMIT 10`, [game]);
      return result.rows.map((entry, index) => ({ ...entry, rank: index + 1 }));
    },
    async save({ submissionId, game, name, score }) {
      const inserted = await pool.query(`INSERT INTO leaderboard_scores (submission_id, game_id, name, score)
        VALUES ($1, $2, $3, $4) ON CONFLICT (submission_id) DO NOTHING RETURNING ${fields}`, [submissionId, game, name, score]);
      const entry = inserted.rows[0] || (await pool.query(`SELECT ${fields} FROM leaderboard_scores WHERE submission_id = $1`, [submissionId])).rows[0];
      if (entry.game !== game || entry.name !== name || entry.score !== score) return { conflict: true };
      // Compare database timestamps directly, avoiding loss of microseconds in JS dates.
      const rank = await pool.query(`SELECT (COUNT(*) + 1)::integer AS rank FROM leaderboard_scores s
        JOIN leaderboard_scores current ON current.submission_id = $1
        WHERE s.game_id = current.game_id AND (s.score > current.score OR
          (s.score = current.score AND (s.created_at, s.submission_id) < (current.created_at, current.submission_id)))`, [submissionId]);
      return { entry: { ...entry, rank: rank.rows[0].rank }, created: inserted.rowCount === 1 };
    },
    close: () => pool.end(),
  };
}
