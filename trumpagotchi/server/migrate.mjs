// Prepares the database for cloud saves. Run it on its own, with an administrator's
// connection; the web process never holds one.
//
//   MIGRATION_DATABASE_URL  an administrator connection (creates the schema, table and login)
//   APP_DB_PASSWORD         optional: sets the password of the restricted `trumpagotchi_app` login
//   APP_DATABASE_URL        optional: the restricted login's connection; when given, the script
//                           proves that login can use its own schema and cannot read anything else
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const sql = (name) => readFile(new URL('./' + name, import.meta.url), 'utf8');

async function connect(connectionString, tries = 8) {
  for (let i = 1; ; i++) { // a private network can take a moment to come up
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    try { await client.connect(); return client; }
    catch (e) { await client.end().catch(() => {}); if (i >= tries) throw e; await new Promise((r) => setTimeout(r, 1500)); }
  }
}

export async function migrateDatabase(adminUrl, { appPassword } = {}) {
  const client = await connect(adminUrl);
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(847120655)');
    await client.query(await sql('schema.sql'));
    await client.query(await sql('permissions.sql'));
    if (appPassword) await client.query('ALTER ROLE trumpagotchi_app PASSWORD ' + client.escapeLiteral(appPassword));
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { await client.end(); }
}

// What can the restricted login actually do? Returns a plain report; throws nothing on "denied".
export async function inspectAppLogin(appUrl) {
  const client = await connect(appUrl);
  const tryQuery = async (text, values) => { try { await client.query(text, values); return 'allowed'; } catch (e) { return 'denied (' + e.code + ')'; } };
  try {
    const who = (await client.query('SELECT current_user AS u, current_database() AS d')).rows[0];
    const flags = (await client.query('SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolinherit FROM pg_roles WHERE rolname = current_user')).rows[0];
    // every table outside its own schema and the system catalogs that it may read or write
    const foreign = (await client.query(`
      SELECT n.nspname || '.' || c.relname AS name
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'trumpagotchi')
        AND (has_table_privilege(c.oid, 'SELECT') OR has_table_privilege(c.oid, 'INSERT') OR has_table_privilege(c.oid, 'UPDATE') OR has_table_privilege(c.oid, 'DELETE'))
      ORDER BY 1`)).rows.map((r) => r.name);
    const others = (await client.query(`
      SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'trumpagotchi')`)).rows[0].n;
    const createIn = (await client.query(`
      SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' AND has_schema_privilege(oid, 'CREATE') ORDER BY 1`)).rows.map((r) => r.nspname);
    const probe = 'f'.repeat(64);
    const own = {
      insert: await tryQuery('INSERT INTO trumpagotchi.pets (key_hash, state) VALUES ($1, $2::jsonb)', [probe, '{"v":1,"probe":true}']),
      select: await tryQuery('SELECT rev FROM trumpagotchi.pets WHERE key_hash = $1', [probe]),
      update: await tryQuery('UPDATE trumpagotchi.pets SET rev = rev + 1 WHERE key_hash = $1', [probe]),
      delete: await tryQuery('DELETE FROM trumpagotchi.pets WHERE key_hash = $1', [probe]),
      createTable: await tryQuery('CREATE TABLE trumpagotchi.should_not_exist (id int)'),
      dropTable: await tryQuery('DROP TABLE trumpagotchi.pets'),
    };
    return { user: who.u, database: who.d, flags, otherTablesInDatabase: others, otherTablesItCanTouch: foreign, schemasItCanCreateIn: createIn, ownSchema: own };
  } finally { await client.end(); }
}

export function isolated(report) {
  const f = report.flags, o = report.ownSchema;
  return report.user === 'trumpagotchi_app' && !f.rolsuper && !f.rolcreatedb && !f.rolcreaterole && !f.rolbypassrls &&
    report.otherTablesItCanTouch.length === 0 && report.schemasItCanCreateIn.length === 0 &&
    o.insert === 'allowed' && o.select === 'allowed' && o.update === 'allowed' && o.delete === 'allowed' &&
    o.createTable !== 'allowed' && o.dropTable !== 'allowed';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.MIGRATION_DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL is required.');
  try {
    await migrateDatabase(process.env.MIGRATION_DATABASE_URL, { appPassword: process.env.APP_DB_PASSWORD });
    console.log('MIGRATION OK: schema trumpagotchi, table trumpagotchi.pets and login trumpagotchi_app are ready.');
    if (process.env.APP_DATABASE_URL) {
      const report = await inspectAppLogin(process.env.APP_DATABASE_URL);
      console.log('LOGIN REPORT ' + JSON.stringify(report));
      console.log(isolated(report) ? 'ISOLATION OK: the app login works in its own schema and can touch nothing else.' : 'ISOLATION PROBLEM: see the report above.');
      if (!isolated(report)) process.exitCode = 2;
    }
  } catch (error) {
    // never print connection strings or passwords
    console.error('MIGRATION FAILED: ' + (error && error.code ? error.code + ' ' : '') + String(error && error.message).replace(/postgres(?:ql)?:\/\/\S+/g, '[connection]'));
    process.exitCode = 1;
  }
}
