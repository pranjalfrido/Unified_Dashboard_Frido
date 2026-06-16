import pkg from 'pg'
const { Pool } = pkg

let pool
export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.NEON_URL || process.env.SUPABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
    })
  }
  return pool
}
