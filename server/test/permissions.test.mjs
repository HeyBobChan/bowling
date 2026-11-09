import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { migrateDatabase } from '../migrate.mjs';
import { createStore } from '../store.mjs';

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
