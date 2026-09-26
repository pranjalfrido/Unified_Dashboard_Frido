// Syncs BigQuery `production.Clickpost_Shipment_Tracking_Report` -> Supabase
// `logistics_3pl_shipments`: shipment count and shipped weight per warehouse per month.
//
// WHY: the 3PL ledger holds warehousing COST but carries no volume, so the tab could only
// show rupees. Cost per shipment and cost per kg need a denominator, and the only place
// that records what each site actually shipped is the Clickpost tracking report, keyed by
// pickup_name. This pulls it to the same grain the ledger bills at (warehouse x month) so
// the two can be divided.
//
// JOIN KEY: facility_pincode. The 3PL ledger records the pincode it is billing for and
// Clickpost records pickup_pincode on every shipment, so the two join with no name mapping
// and no maintained lookup table.
//
// KNOWN GAPS are reported on every run: any billed (facility, month) with no matching
// pincode-month in the feed. Those months show a dash for per-parcel and per-kg cost rather
// than a fabricated rate — dividing by a missing denominator is worse than saying nothing.
//
// WEIGHT is stored in GRAMS in the source (verified: 27,274,464 over 11,137 Bhiwandi
// shipments = 2.45 kg each, which is plausible for this catalogue). Converted to kg here
// so the dashboard never has to know.
//
// RUN THIS AFTER EACH 3PL UPLOAD, alongside scripts/refresh-cost-aggregates.mjs:
//   node scripts/sync-3pl-shipments.mjs --dry-run
//   node scripts/sync-3pl-shipments.mjs

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

const connStr = process.env.SUPABASE_URL
if (!connStr) { console.error('SUPABASE_URL not set'); process.exit(1) }

const bq = new BigQuery({ keyFilename: KEY_PATH, projectId: 'frido-429506' })
const pool = new Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false },
  max: 2,
  statement_timeout: 600000,
  query_timeout: 600000,
  idleTimeoutMillis: 600000,
  connectionTimeoutMillis: 60000,
})
pool.on('error', e => console.error('[pool]', e.message))

// ledger warehouse  ->  the pickup_name values that site ships under.
// Kept here rather than in SQL so the mapping is reviewable in one place; a new site is
// one line, and an unmapped pickup_name is reported below rather than silently dropped.
// Volume is keyed on the FACILITY PINCODE, which is what the 3PL ledger now carries and
// what Clickpost records as pickup_pincode. No name mapping is needed any more: the ledger
// says which pincode it is billing for and the tracking feed says which pincode shipped, so
// the two join directly.
//
// This replaces a hand-maintained pickup_name -> warehouse table. That list had to be edited
// for every new site, matched on strings that differ between the invoice and the feed, and
// a first version using LIKE '%aaj%' silently matched customer names ("Kaajal", "Raaj
// chauhan") into Kolkata's parcel count.
//
// A pincode can host several pickup_name values (412106 Pune has five: myfrido-RTD,
// Vadgaon_OPS, Frido-Vadgaon-FC, myfrido-b2b, Finished_Goods). They are summed, which is
// correct: the 3PL bills for the facility at that pincode, whatever the courier calls the
// dock the parcel left from.

const SQL = `
  SELECT
    TRIM(pickup_pincode) AS facility_pincode,
    FORMAT_DATE('%Y-%m', DATE(created_at)) AS month_year,
    -- Forward only. Reverse shipments are collected FROM the customer, so their
    -- pickup_pincode is a customer address, not a facility — counting them would add
    -- thousands of spurious pincodes and inflate any facility that shares one.
    COUNT(*) AS shipments,
    -- Source stores grams as a string with stray units; strip to digits then convert.
    ROUND(SUM(SAFE_CAST(REGEXP_REPLACE(TRIM(shipment_weight), r'[^0-9.]', '') AS FLOAT64)) / 1000, 3) AS weight_kg,
    COUNTIF(SAFE_CAST(REGEXP_REPLACE(TRIM(shipment_weight), r'[^0-9.]', '') AS FLOAT64) > 0) AS weighed_shipments,
    -- Carried for the log and for spotting a pincode whose facilities have changed.
    STRING_AGG(DISTINCT COALESCE(NULLIF(TRIM(pickup_name), ''), '(unknown)'), ' | ' ORDER BY COALESCE(NULLIF(TRIM(pickup_name), ''), '(unknown)')) AS pickup_names
  FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\`
  WHERE created_at IS NOT NULL
    AND shipment_type = 'Forward'
    AND pickup_pincode IS NOT NULL AND TRIM(pickup_pincode) <> ''
  GROUP BY 1, 2
  ORDER BY 1, 2
`

console.log(DRY ? 'DRY RUN — nothing will be written\n' : '')
console.log('querying BigQuery for Forward shipment volume by pickup pincode…')
const t0 = Date.now()
const [rows] = await bq.query({ query: SQL })
console.log(`  ${rows.length} warehouse-months in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

// Only pincodes the ledger actually bills for are worth printing — the feed carries every
// origin, including ones no 3PL invoices.
const billed = new Set((await pool.query(
  `SELECT DISTINCT facility_pincode FROM public.logistics_costs_3pl WHERE facility_pincode IS NOT NULL`
)).rows.map(r => String(r.facility_pincode).trim()))
const shown = rows.filter(r => billed.has(String(r.facility_pincode).trim()))
console.log(`  ${shown.length} of ${rows.length} pincode-months match a billed facility\n`)
for (const r of shown) {
  console.log(`  ${String(r.facility_pincode).padEnd(8)} ${r.month_year}  ${String(r.shipments).padStart(7)} shipments  ${String(r.weight_kg).padStart(11)} kg  ${r.pickup_names}`)
}

if (DRY) { await pool.end(); process.exit(0) }

const c = await pool.connect()
try {
  await c.query(`
    CREATE TABLE IF NOT EXISTS public.logistics_3pl_shipments (
      -- Keyed on the facility pincode, matching logistics_costs_3pl.facility_pincode.
      facility_pincode  text    NOT NULL,
      month_year        text    NOT NULL,
      shipments         integer NOT NULL DEFAULT 0,
      weight_kg         numeric NOT NULL DEFAULT 0,
      weighed_shipments integer NOT NULL DEFAULT 0,
      pickup_names      text,
      synced_at         timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (facility_pincode, month_year)
    )`)
  // Migrate a table created under the old (warehouse, partner) key. The columns are dropped
  // rather than kept: leaving them would let a stale warehouse value look authoritative
  // beside the pincode that now drives every join.
  await c.query(`ALTER TABLE public.logistics_3pl_shipments
                   ADD COLUMN IF NOT EXISTS facility_pincode text,
                   ADD COLUMN IF NOT EXISTS pickup_names text`)
  await c.query(`ALTER TABLE public.logistics_3pl_shipments
                   DROP CONSTRAINT IF EXISTS logistics_3pl_shipments_pkey`)
  await c.query(`DELETE FROM public.logistics_3pl_shipments WHERE facility_pincode IS NULL`)
  await c.query(`ALTER TABLE public.logistics_3pl_shipments
                   DROP COLUMN IF EXISTS warehouse,
                   DROP COLUMN IF EXISTS partner`)
  await c.query(`ALTER TABLE public.logistics_3pl_shipments
                   ALTER COLUMN facility_pincode SET NOT NULL`)
  await c.query(`ALTER TABLE public.logistics_3pl_shipments
                   ADD PRIMARY KEY (facility_pincode, month_year)`)
  // Read-only for the dashboard roles; this table is written by this script alone.
  await c.query(`GRANT SELECT ON public.logistics_3pl_shipments TO anon, authenticated`)

  await c.query('BEGIN')
  await c.query('TRUNCATE public.logistics_3pl_shipments')
  for (const r of rows) {
    await c.query(
      `INSERT INTO public.logistics_3pl_shipments
         (facility_pincode, month_year, shipments, weight_kg, weighed_shipments, pickup_names)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [String(r.facility_pincode).trim(), r.month_year, r.shipments, r.weight_kg ?? 0,
       r.weighed_shipments ?? 0, r.pickup_names ?? null])
  }
  await c.query('COMMIT')

  const { rows: chk } = await c.query(`
    SELECT COUNT(*)::int n, SUM(shipments)::int ship, ROUND(SUM(weight_kg))::int kg
      FROM public.logistics_3pl_shipments`)
  console.log(`\nwrote ${chk[0].n} rows — ${chk[0].ship.toLocaleString('en-IN')} shipments, ${chk[0].kg.toLocaleString('en-IN')} kg`)

  // Surface ledger months that have cost but no volume, so the gap is visible here rather
  // than discovered as a blank cell in the dashboard.
  const { rows: gaps } = await c.query(`
    SELECT COALESCE(l.facility_name, l.facility_location, '?') AS facility,
           l.facility_pincode, l.month_year, SUM(l.total_cost)::float8 cost
      FROM public.logistics_costs_3pl l
      LEFT JOIN public.logistics_3pl_shipments s
        ON s.facility_pincode = l.facility_pincode AND s.month_year = l.month_year
     WHERE s.facility_pincode IS NULL
     GROUP BY 1, 2, 3 ORDER BY 1, 3`)
  if (gaps.length) {
    console.log('\nbilled months with NO shipment data (per-unit costs will show as —):')
    for (const g of gaps) console.log(`  ${String(g.facility).padEnd(22)} ${String(g.facility_pincode ?? '(no pincode)').padEnd(12)} ${g.month_year}  ${Math.round(g.cost).toLocaleString('en-IN')}`)
  }
} catch (e) {
  await c.query('ROLLBACK').catch(() => {})
  throw e
} finally {
  c.release()
  await pool.end()
}
