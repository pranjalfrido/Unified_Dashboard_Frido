// Loads the pincode → zone mapping into public.pincode_zone_map.
//
// Why this table exists: Clickpost's own `zone` column is 100% NULL across all 745k rows in
// the last 90 days (verified), so every zone-aware figure on the Courier Allocation page has
// to come from this mapping instead. `uploaded_pincode_zone` is NULL too.
//
// The source is a pickup×drop pair list, because zone is a function of the LANE, not the
// destination alone — the same drop pincode is zone A from a local warehouse and zone D from
// across the country. Two lookups are stored:
//   - pair  (pickup, drop) -> zone : exact, covers 84.9% of shipments
//   - drop  (drop)         -> zone : majority vote, covers a further 15.0%
// Together 99.9%; the remaining 0.1% is reported as "unzoned" rather than guessed.
//
// Usage:  node scripts/load-pincode-zones.mjs "<path to zone_mapped_strict.csv>"
import pkg from 'pg'
import { readFileSync } from 'fs'
import { config } from 'dotenv'
config()
const { Pool } = pkg

const SRC = process.argv[2] || 'c:/Users/TusharGupta/Downloads/zone_mapped_strict.csv'
const VALID = new Set(['A', 'B', 'C', 'D', 'E'])

// RFC4180 parse. A naive split(',') is wrong here and silently corrupts the file: ~2,850 rows
// carry quoted address fragments containing commas, which shifts every later column and lands
// state names like "Maharashtra" in the Zone column. Parsed properly, all 194,290 rows are
// valid A-E with zero unmapped.
function parseLine(line) {
  const out = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += c
    } else {
      if (c === '"') q = true
      else if (c === ',') { out.push(cur); cur = '' }
      else cur += c
    }
  }
  out.push(cur)
  return out
}

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
  connectionTimeoutMillis: 45000,
  statement_timeout: 300000,
})
// Mandatory: node-postgres emits 'error' on the Pool when the server drops an IDLE
// connection, and unhandled that kills the process mid-load.
pool.on('error', e => console.error('[pool]', e.message))

async function main() {
  const raw = readFileSync(SRC, 'utf8').split(/\r?\n/).filter(Boolean)
  const H = parseLine(raw[0]).map(h => h.trim())
  const ix = Object.fromEntries(H.map((h, i) => [h, i]))
  for (const need of ['pickup_pincode', 'drop_pincode', 'Zone']) {
    if (ix[need] === undefined) throw new Error(`missing column: ${need}`)
  }

  const pairs = new Map()      // "pk|dp" -> zone
  const dropVotes = new Map()  // dp -> {zone: count}
  let skipped = 0

  for (const line of raw.slice(1)) {
    const c = parseLine(line)
    const pk = (c[ix.pickup_pincode] || '').trim()
    const dp = (c[ix.drop_pincode] || '').trim()
    const z = (c[ix.Zone] || '').trim().toUpperCase()
    if (!VALID.has(z) || !/^\d{6}$/.test(dp)) { skipped++; continue }
    if (/^\d{6}$/.test(pk)) pairs.set(`${pk}|${dp}`, z)
    if (!dropVotes.has(dp)) dropVotes.set(dp, {})
    const v = dropVotes.get(dp)
    v[z] = (v[z] || 0) + 1
  }

  // Majority zone per drop pincode, for lanes whose exact pair is absent.
  const drops = new Map()
  for (const [dp, v] of dropVotes) {
    drops.set(dp, Object.entries(v).sort((a, b) => b[1] - a[1])[0][0])
  }

  console.log(`parsed ${raw.length - 1} rows | pairs ${pairs.size} | drop pins ${drops.size} | skipped ${skipped}`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.pincode_zone_map (
      pickup_pincode text NOT NULL DEFAULT '',
      drop_pincode   text NOT NULL,
      zone           text NOT NULL,
      kind           text NOT NULL,
      PRIMARY KEY (pickup_pincode, drop_pincode)
    )`)
  await pool.query(`CREATE INDEX IF NOT EXISTS pincode_zone_map_drop_idx ON public.pincode_zone_map (drop_pincode)`)
  await pool.query('TRUNCATE public.pincode_zone_map')

  const rows = []
  for (const [k, z] of pairs) { const [pk, dp] = k.split('|'); rows.push([pk, dp, z, 'pair']) }
  for (const [dp, z] of drops) rows.push(['', dp, z, 'drop'])

  // 500-row batches: larger statements hit Postgres 57014 on this pooler.
  const B = 500
  let done = 0
  for (let i = 0; i < rows.length; i += B) {
    const chunk = rows.slice(i, i + B)
    const vals = [], params = []
    chunk.forEach((r, j) => {
      const o = j * 4
      vals.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4})`)
      params.push(r[0], r[1], r[2], r[3])
    })
    await pool.query(
      `INSERT INTO public.pincode_zone_map (pickup_pincode, drop_pincode, zone, kind)
       VALUES ${vals.join(',')}
       ON CONFLICT (pickup_pincode, drop_pincode) DO UPDATE SET zone = EXCLUDED.zone, kind = EXCLUDED.kind`,
      params,
    )
    done += chunk.length
    if (done % 20000 === 0 || done === rows.length) console.log(`  inserted ${done}/${rows.length}`)
  }

  const chk = await pool.query(`
    SELECT kind, zone, COUNT(*)::int n FROM public.pincode_zone_map GROUP BY 1,2 ORDER BY 1,2`)
  console.log('\nloaded:')
  for (const r of chk.rows) console.log(`  ${r.kind.padEnd(5)} ${r.zone}  ${r.n}`)
  await pool.end()
}

main().catch(async e => { console.error('FAILED:', e.message); try { await pool.end() } catch {} process.exit(1) })
