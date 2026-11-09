import pg from 'pg';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { RUN_LIFETIME_MS, validBowlingResult } from './score-rules.mjs';
import { chanaDatabase } from './chana-db.mjs';

const fields = 'submission_id AS id, game_id AS game, name, score, created_at AS "createdAt"';
const order = 'score DESC, created_at ASC, submission_id ASC';

export async function createStore(connectionString, { dailyRuns = 5000, dailyScores = 2000, maxPending = 64 } = {}) {
  const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000, statement_timeout: 5000 });
  // Never log connection options: the URL contains the database password.
  pool.on('error', () => console.error('Leaderboard database connection interrupted.'));
  try {
    if (process.env.NODE_ENV === 'production') {
      const { rows } = await pool.query('SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = current_user');
      if (Object.values(rows[0]).some(Boolean)) throw new Error('Web database role must be restricted.');
    }
    await pool.query('SELECT submission_id FROM leaderboard_scores LIMIT 0');
  } catch (error) {
    await pool.end();
    throw error;
  }

  let pending = 0;
  const problem = (status, code) => Object.assign(new Error(code), { status, code });
  async function transaction(callback) {
    if (pending >= maxPending) throw problem(503, 'busy');
    pending++;
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      if (client) await client.query('ROLLBACK');
      throw error;
    } finally { client?.release(); pending--; }
  }
  async function budget(client, kind, maximum) {
    // kind is an internal constant, never request input. One fixed row persists
    // quotas across restarts and serializes concurrent submissions across replicas.
    const result = await client.query(`UPDATE leaderboard_budget SET
      ${kind} = CASE WHEN day = (now() AT TIME ZONE 'UTC')::date THEN ${kind} + 1 ELSE 1 END,
      ${kind === 'runs' ? 'scores' : 'runs'} = CASE WHEN day = (now() AT TIME ZONE 'UTC')::date THEN ${kind === 'runs' ? 'scores' : 'runs'} ELSE 0 END,
      day = (now() AT TIME ZONE 'UTC')::date
      WHERE id = 1 AND (day <> (now() AT TIME ZONE 'UTC')::date OR ${kind} < $1) RETURNING id`, [maximum]);
    if (!result.rowCount) throw problem(429, 'daily_limit');
  }

  return {
    async chanaTransaction(key, callback) {
      return transaction(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['chana:' + key]);
        return callback(chanaDatabase(client));
      });
    },
    async check() { await pool.query('SELECT 1'); },
    async top(game) {
      const result = await pool.query(`SELECT ${fields} FROM leaderboard_scores WHERE game_id = $1 ORDER BY ${order} LIMIT 10`, [game]);
      return result.rows.map((entry, index) => ({ ...entry, rank: index + 1 }));
    },
    async beginRun(game) {
      return transaction(async (client) => {
        await budget(client, 'runs', dailyRuns);
        await client.query('DELETE FROM leaderboard_runs WHERE expires_at < now()');
        const id = randomUUID(), token = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const result = await client.query(`INSERT INTO leaderboard_runs(id,game_id,token_hash,expires_at)
          VALUES ($1,$2,$3,now() + $4 * interval '1 millisecond') RETURNING expires_at AS "expiresAt"`, [id, game, tokenHash, RUN_LIFETIME_MS]);
        return { id, token, expiresAt: result.rows[0].expiresAt };
      });
    },
    async save({ submissionId, game, name, score, runId, runToken, durationMs, strikes, knocked }) {
      return transaction(async (client) => {
        const { rows } = await client.query(`SELECT *, extract(epoch FROM (clock_timestamp()-started_at))*1000 AS elapsed
          FROM leaderboard_runs WHERE id=$1 AND game_id=$2 FOR UPDATE`, [runId, game]);
        const run = rows[0], hash = createHash('sha256').update(runToken).digest();
        if (!run || !timingSafeEqual(Buffer.from(run.token_hash, 'hex'), hash)) throw problem(403, 'invalid_run');
        if (run.expires_at.getTime() < Date.now()) throw problem(410, 'run_expired');
        if (!validBowlingResult({ score, durationMs, strikes, knocked }, Number(run.elapsed))) throw problem(400, 'impossible_score');
        let entry, created = false;
        if (run.submission_id) {
          if (run.submission_id !== submissionId) return { conflict: true };
          entry = (await client.query(`SELECT ${fields} FROM leaderboard_scores WHERE submission_id=$1`, [submissionId])).rows[0];
          if (entry.game !== game || entry.name !== name || entry.score !== score) return { conflict: true };
        } else {
          // A public score ID cannot be claimed by a different run.
          if ((await client.query('SELECT 1 FROM leaderboard_scores WHERE submission_id=$1', [submissionId])).rowCount) return { conflict: true };
          await budget(client, 'scores', dailyScores);
          const inserted = await client.query(`INSERT INTO leaderboard_scores(submission_id,game_id,name,score)
            VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING ${fields}`, [submissionId,game,name,score]);
          if (!inserted.rowCount) throw problem(409, 'submission_conflict');
          entry = inserted.rows[0]; created = true;
          await client.query('UPDATE leaderboard_runs SET submission_id=$2 WHERE id=$1', [runId, submissionId]);
        }
        const rank = await client.query(`SELECT (COUNT(*) + 1)::integer AS rank FROM leaderboard_scores s
          JOIN leaderboard_scores current ON current.submission_id=$1
          WHERE s.game_id=current.game_id AND (s.score>current.score OR
          (s.score=current.score AND (s.created_at,s.submission_id)<(current.created_at,current.submission_id)))`, [submissionId]);
        return { entry: { ...entry, rank: rank.rows[0].rank }, created };
      });
    },
    close: () => pool.end(),
  };
}
