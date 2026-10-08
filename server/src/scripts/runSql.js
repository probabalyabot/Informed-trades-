// Runs a .sql file and prints the server's NOTICE messages (psql not required).
// Usage: node src/scripts/runSql.js <path-to-file.sql>
import { readFileSync } from 'node:fs';
import { pool } from '../db.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node src/scripts/runSql.js <file.sql>');
  process.exit(1);
}

const client = await pool.connect();
client.on('notice', (n) => console.log(n.message));
try {
  await client.query(readFileSync(file, 'utf8'));
  console.log(`\nOK  ${file}`);
} catch (err) {
  console.error(`\n${err.message}`);
  process.exitCode = 1;
  await client.query('ROLLBACK').catch(() => {});
} finally {
  client.release();
  await pool.end();
}
