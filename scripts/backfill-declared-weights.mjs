// Backfill declared_weight_frido where the courier upload left it empty.
//
// 17,507 Delhivery rows (1.2% of the ledger) carry no declared weight — all NULL, confined
// to May and June 2026; every other courier and every other month is at 100% coverage, and
// the upload itself was fixed from July onward. This is a one-off repair of that window,
// not an ongoing sync.
//
// Why it matters: declared weight is one half of every weight-claim figure. With it missing
// the charged-vs-declared gap for those rows is either silently dropped or — on the filtered
// code path — counted as a gap equal to the FULL charged weight, which overstates the claim
// on exactly the two months involved.
//
// Source: BigQuery `production.awb_wise_shipment_weight`, joined on TrackingNumber = awb.
// Verified before writing: 17,425 of 17,507 AWBs match (99.5%), and the weights are
// KILOGRAMS — median total_weight / charged_weight_courier = 0.944 across 3,985 compared
// rows, exactly the slightly-under-billed shape a real declared weight has. (A grams column
// would have landed near 1000; the 3PL sync reads a DIFFERENT column, shipment_weight, which
// IS in grams, so this was worth checking rather than assuming.)
//
// Fallback, per the brief: where no BQ row matches, or the matched weight is <= 0, use the
// courier's charged weight. That yields a zero gap for those rows, which is the honest
// answer — with nothing of our own to compare against there is no discrepancy to claim.
//
// Idempotent: only ever touches rows whose declared weight is still missing, so re-running
// is a no-op. --dry-run reports what would change without writing.

import { BigQuery } from '@google-cloud/bigquery'
import pkg from 'pg'
import { config } from 'dotenv'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

config()
const { Pool } = pkg

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const KEY_PATH = ['/etc/secrets/sa_key.json', join(ROOT, 'sa_key.json'), join(ROOT, '..', 'sa_key.json')]
  .find(p => existsSync(p))
if (!KEY_PATH) { console.error('sa_key.json not found — cannot reach BigQuery.'); process.exit(1) }

const connStr = process.env.SUPABASE_DB_URL
  || (process.env.SUPABASE_URL || '').replace(':6543/', ':5432/')
if (!connStr) { console.error('SUPABASE_DB_URL / SUPABASE_URL not set'); process.exit(1) }

const bq = new BigQuery({ keyFilename: KEY_PATH, projectId: 'frido-429506' })
const pool = new Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false },
  max: 2,
  statement_timeout: 600000,
  query_timeout: 600000,
})
pool.on('error', e => console.error('[pool] non-fatal:', e.message))

// A parcel heavier than this is a unit error, not a shipment — the same guard the API uses.
// Without it one bad BQ row could write a 139,840 kg declared weight and wreck every ₹/kg
// figure on the page, which is a failure mode this ledger has actually seen.
const MAX_PLAUSIBLE_KG = 500

const main = async () => {
  const { rows: targets } = await pool.query(`
    SELECT id, awb_number, charged_weight_courier::float8 AS cw
      FROM public.logistics_invoices_b2c
     WHERE COALESCE(declared_weight_frido, 0) <= 0
       AND total_cost IS NOT NULL
  `)
  console.log(`rows with no declared weight: ${targets.length}`)
  if (!targets.length) { console.log('nothing to do.'); return }

  const awbs = [...new Set(targets.map(r => String(r.awb_number ?? '').trim()).filter(Boolean))]
  console.log(`distinct AWBs to look up: ${awbs.length}`)

  // MAX, not ANY_VALUE: an AWB can appear on several BQ rows (one per SKU in the parcel).
  // The parcel's weight is the heaviest recorded figure for it, not an arbitrary pick.
  // Chunked because IN UNNEST on a very large array can blow the query size limit.
  const CHUNK = 10000
  const wt = new Map()
  for (let i = 0; i < awbs.length; i += CHUNK) {
    const slice = awbs.slice(i, i + CHUNK)
    const [rows] = await bq.query({
      query: `SELECT TrackingNumber AS awb, MAX(total_weight) AS wt
                FROM \`frido-429506.production.awb_wise_shipment_weight\`
               WHERE TrackingNumber IN UNNEST(@a)
               GROUP BY 1`,
      params: { a: slice },
    })
    for (const r of rows) if (r.awb != null) wt.set(String(r.awb).trim(), Number(r.wt))
    console.log(`  BQ ${Math.min(i + CHUNK, awbs.length)}/${awbs.length} …`)
  }
  console.log(`BQ matched ${wt.size} of ${awbs.length} AWBs (${(wt.size / awbs.length * 100).toFixed(1)}%)`)

  const updates = []
  const tally = { bq: 0, fallback: 0, skipped: 0 }
  for (const r of targets) {
    const key = String(r.awb_number ?? '').trim()
    const w = wt.get(key)
    let val = null
    if (w > 0 && w <= MAX_PLAUSIBLE_KG) { val = w; tally.bq++ }
    else if (r.cw > 0 && r.cw <= MAX_PLAUSIBLE_KG) { val = r.cw; tally.fallback++ }
    else { tally.skipped++; continue }
    updates.push([r.id, val])
  }
  console.log(`from BQ: ${tally.bq} · fallback to charged: ${tally.fallback} · skipped (no usable weight): ${tally.skipped}`)

  if (DRY) {
    console.log('--dry-run: nothing written.')
    console.log('sample:', updates.slice(0, 5))
    return
  }

  // One UPDATE … FROM per batch rather than a statement per row: 17k round trips would take
  // minutes and hold the pool open for all of them.
  const BATCH = 2000
  let done = 0
  for (let i = 0; i < updates.length; i += BATCH) {
    const b = updates.slice(i, i + BATCH)
    await pool.query(`
      UPDATE public.logistics_invoices_b2c t
         SET declared_weight_frido = v.wt
        FROM (SELECT * FROM UNNEST($1::bigint[], $2::float8[]) AS x(id, wt)) v
       WHERE t.id = v.id
         -- Re-checked here, not just in the SELECT above: makes the write idempotent even
         -- if the table changed between the read and this statement.
         AND COALESCE(t.declared_weight_frido, 0) <= 0
    `, [b.map(x => x[0]), b.map(x => x[1])])
    done += b.length
    console.log(`  updated ${done}/${updates.length}`)
  }

  const { rows: after } = await pool.query(`
    SELECT COUNT(*) FILTER (WHERE COALESCE(declared_weight_frido, 0) <= 0)::int AS still_missing,
           COUNT(*)::int AS total
      FROM public.logistics_invoices_b2c
     WHERE total_cost IS NOT NULL
  `)
  console.log(`done. still missing: ${after[0].still_missing} of ${after[0].total}`)
  console.log('NOTE: run scripts/refresh-cost-aggregates.mjs next — the cube and lc_slab_costs')
  console.log('      still hold the pre-backfill weights.')
}

main()
  .catch(e => { console.error(e); process.exitCode = 1 })
  .finally(() => pool.end())
