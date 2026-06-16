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
      max: 5,
    })
  }
  return pool
}
