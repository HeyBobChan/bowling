import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { migrateDatabase } from '../migrate.mjs';
import { createStore } from '../store.mjs';
import { quizApi } from '../chana-quiz-api.mjs';
import { steps, questionOf } from '../chana-quiz-game.mjs';

test('production uses a restricted role and cannot administer or destroy the database', async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw Error('TEST_DATABASE_URL must point to a disposable database.');
  await migrateDatabase(url);
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(await readFile(new URL('../permissions.sql', import.meta.url), 'utf8'));
  await admin.query("ALTER ROLE marker_games_web PASSWORD 'test-only-password'");
  const restricted = new URL(url); restricted.username = 'marker_games_web'; restricted.password = 'test-only-password';
  const prior = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(createStore(url), /restricted/);
    const store = await createStore(restricted.href);
    await store.check(); await store.top('main'); await store.close();
    const client = new pg.Client({ connectionString: restricted.href });
    await client.connect();
    try {
      for (const sql of ['DELETE FROM leaderboard_scores WHERE false', 'UPDATE leaderboard_scores SET score=0 WHERE false',
        'CREATE TABLE forbidden_test(id int)', 'CREATE ROLE forbidden_role', 'TRUNCATE leaderboard_scores']) {
        await assert.rejects(client.query(sql), (error) => error.code === '42501', sql);
      }
      await client.query('SELECT * FROM chana_rooms LIMIT 0');
      await client.query('UPDATE chana_players SET removed=0 WHERE false');
    } finally { await client.end(); }
  } finally {
    if (prior === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prior;
    await admin.end();
  }
});

// Runs after the test above, which created the role: the quiz needs no grant beyond the timeline's.
test('the restricted role can run a quiz question from start to reveal', async () => {
  const restricted = new URL(process.env.TEST_DATABASE_URL); restricted.username = 'marker_games_web'; restricted.password = 'test-only-password';
  const store = await createStore(restricted.href);
  const call = async (path, { method = 'GET', token, body } = {}) => {
    const r = await store.chanaTransaction('quiz:' + (path.match(/rooms\/(\d{7})/)?.[1] || 'create'), (db) => quizApi(new Request('http://localhost/quiz' + path,
      { method, headers: token ? { Authorization: 'Bearer ' + token } : {}, ...(body ? { body: JSON.stringify(body) } : {}) }), { DB: db }));
    return { status: r.status, ...await r.json() };
  };
  try {
    const host = crypto.randomUUID(), player = crypto.randomUUID();
    const code = (await call('/rooms', { method: 'POST', body: { hostToken: host } })).room.code;
    await call(`/rooms/${code}/join`, { method: 'POST', body: { playerToken: player, name: 'תמר' } });
    await call(`/rooms/${code}/start`, { method: 'POST', token: host, body: {} });
    await call(`/rooms/${code}/next`, { method: 'POST', token: host, body: { from: 0 } });
    const q = questionOf(steps[1]);
    assert.equal((await call(`/rooms/${code}/answer`, { method: 'POST', token: player, body: { questionId: q.id, value: q.answer } })).status, 200);
    const s = await call(`/rooms/${code}/next`, { method: 'POST', token: host, body: { from: 1 } });
    assert.equal(s.stage.kind, 'reveal'); assert.equal(s.gained[0].gained, 10);
  } finally { await store.close(); }
});
