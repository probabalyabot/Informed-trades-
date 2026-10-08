// Applies db/migrations/*.sql once each (tracked in schema_migration), then
// runs db/seed/*.sql, which are written to be safe to re-run.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rootDir } from '../config.js';
import { pool, withTransaction } from '../db.js';

const sqlFiles = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ name: f, sql: readFileSync(join(dir, f), 'utf8') }));

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  const { rows } = await pool.query('SELECT filename FROM schema_migration');
  const applied = new Set(rows.map((r) => r.filename));

  for (const { name, sql } of sqlFiles(join(rootDir, 'db', 'migrations'))) {
    if (applied.has(name)) continue;
    // Schema change and its bookkeeping row commit together or not at all.
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migration (filename) VALUES ($1)', [name]);
    });
    console.log(`applied  ${name}`);
  }

  for (const { name, sql } of sqlFiles(join(rootDir, 'db', 'seed'))) {
    await withTransaction((client) => client.query(sql));
    console.log(`seeded   ${name}`);
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
