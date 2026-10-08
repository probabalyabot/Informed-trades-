import pg from 'pg';
import { requireConfig } from './config.js';

// DATE columns stay as 'YYYY-MM-DD' strings; converting them to JS Dates
// shifts them by the local timezone offset.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);
// NUMERIC and BIGINT arrive as strings by default; our values fit in a double.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, Number);
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

export const pool = new pg.Pool({ connectionString: requireConfig('databaseUrl') });

export const query = (text, params) => pool.query(text, params);

// Runs fn(client) inside a transaction: COMMIT if it resolves, ROLLBACK if it throws.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
