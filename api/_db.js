import pkg from 'pg'
const { Pool } = pkg

let pool
export function getPool() {
  const connStr = process.env.NEON_URL || process.env.SUPABASE_URL
  if (!connStr) throw new Error('No database URL configured')
  if (!pool) {
    pool = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      max: 10,
    })
    // node-postgres emits 'error' on the Pool when the server drops an IDLE client, and an
    // unhandled EventEmitter error takes the whole process down. Supabase's pooler drops
    // idle connections routinely, so without this the API server died with an unhandled
    // ECONNRESET whenever it sat idle — the other three pools in this codebase already
    // guard it; this one was missed.
    //
    // Logged rather than rethrown: the client is already gone and the pool discards it on
    // its own. The next query checks out a fresh one.
    pool.on('error', e => console.error('[_db pool] idle client error:', e.message))
  }
  return pool
}
