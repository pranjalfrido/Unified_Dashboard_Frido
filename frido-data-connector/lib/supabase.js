import pg from 'pg';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// The Supabase pooler presents a chain signed by "Supabase Root 2021 CA", which is not in Node's public CA store.
// We keep certificate verification ON and trust exactly that CA (intermediate + root, public certificates).
const here = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_CA = readFileSync(path.join(here, '..', 'knowledge', 'supabase-ca.crt'), 'utf8');

let _pool;
function getPool() {
  if (_pool) return _pool;
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('Missing SUPABASE_DB_URL env var');
  _pool = new pg.Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 30000,
    ssl: { rejectUnauthorized: true, ca: SUPABASE_CA },
  });
  return _pool;
}

export async function runSupabase(sql) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query('SET statement_timeout = 30000'); // 30s
    const result = await client.query(sql);
    await client.query('COMMIT');
    const { rows } = result;
    if (rows.length === 0) return 'No rows returned.';
    const capped = rows.slice(0, 500);
    const headers = Object.keys(capped[0]);
    const lines = [
      headers.join('\t'),
      ...capped.map(r => headers.map(h => {
        const v = r[h];
        return v === null || v === undefined ? 'NULL' : String(v);
      }).join('\t')),
    ];
    if (rows.length > 500) lines.push(`\n[Showing 500 of ${rows.length} rows]`);
    return lines.join('\n');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
