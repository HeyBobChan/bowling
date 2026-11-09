import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Run separately with an administrative connection. The web process never needs
// schema ownership or an administrative credential.
export async function migrateDatabase(connectionString) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(728301901)');
    await client.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
    await client.query(await readFile(new URL('./security-schema.sql', import.meta.url), 'utf8'));
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.MIGRATION_DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL is required.');
  try { await migrateDatabase(process.env.MIGRATION_DATABASE_URL); console.log('Database schema ready.'); }
  catch { console.error('Database migration failed.'); process.exitCode = 1; }
}
