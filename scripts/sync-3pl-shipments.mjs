// Syncs BigQuery `production.aggregated_uniware_sales_report` -> Supabase
// `logistics_3pl_shipments`: units dispatched and their weight per facility per month.
//
// WHY: the 3PL ledger holds warehousing COST but carries no volume, so the tab could only
// show rupees. Cost per shipment and cost per kg need a denominator. This used to come from
// the Clickpost tracking report, but Clickpost only sees parcels booked through it (mostly
// Shopify) while a 3PL facility also dispatches marketplace, quick-commerce, B2B and
// FBA/FBF stock. Uniware records everything the facility dispatched, so it is the volume
// the 3PL is actually paid to handle.
//
// VOLUME = SUM(total_quantity), i.e. units, not parcels: the Uniware table is aggregated to
// SKU x day x facility x channel x status and carries no package id. Counted only for
//   - item statuses the facility processed (DISPATCHED, DELIVERED, SHIPPED, MANIFESTED,
//     RESHIPPED, REPLACED) — cancelled and not-yet-picked items are excluded;
//   - every channel except VAS (value-added-service jobs, not dispatches);
//   - real SKUs: coupon SKUs (COUP*) are not physical items.
// WEIGHT = units x the SKU's Weight_gms from the item master (grams -> kg here). Units whose
// SKU has no weight still count as volume; their share is logged as weighed_shipments.
//
// JOIN KEY: Uniware `Facility` = the 3PL ledger's facility_name (the ledger is billed under
// the Uniware facility codes, e.g. Hexalog_GGN2). Rows are then stored under that facility's
// pincode, which is what api/logistics-cost.js joins on, so the dashboard queries are
// unchanged. A ledger facility_name with no Uniware volume is reported below.
//
// KNOWN GAPS are reported on every run: any billed (facility, month) with no matching
// volume. Those months show a dash for per-parcel and per-kg cost rather than a fabricated
// rate — dividing by a missing denominator is worse than saying nothing.
//
// RUN THIS AFTER EACH 3PL UPLOAD (it also runs in the hourly precompute workflow):
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

// Statuses that mean the facility actually picked, packed and dispatched the item.
const SHIPPED_STATUSES = ['DISPATCHED', 'DELIVERED', 'SHIPPED', 'MANIFESTED', 'RESHIPPED', 'REPLACED']

const SQL = `
  WITH sku_wt AS (
    -- The item master has a few duplicate Product_Code rows; take one weight per SKU.
    SELECT UPPER(TRIM(Product_Code)) AS sku, MAX(SAFE_CAST(Weight_gms AS FLOAT64)) AS wt_g
      FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
     GROUP BY 1
  )
  SELECT
    TRIM(u.Facility) AS facility,
    u.year_month AS month_year,
    SUM(u.total_quantity) AS shipments,
    ROUND(SUM(u.total_quantity * IFNULL(w.wt_g, 0)) / 1000, 3) AS weight_kg,
    SUM(IF(IFNULL(w.wt_g, 0) > 0, u.total_quantity, 0)) AS weighed_shipments
  FROM \`frido-429506.production.aggregated_uniware_sales_report\` u
  LEFT JOIN sku_wt w ON w.sku = UPPER(TRIM(u.final_sku))
  WHERE u.Facility IS NOT NULL AND TRIM(u.Facility) <> ''
    AND u.year_month IS NOT NULL
    AND u.sale_order_item_status IN UNNEST(@statuses)
    AND IFNULL(UPPER(TRIM(u.channel)), '') <> 'VAS'
    AND NOT STARTS_WITH(UPPER(IFNULL(u.final_sku, '')), 'COUP')
  GROUP BY 1, 2
  ORDER BY 1, 2
`

console.log(DRY ? 'DRY RUN — nothing will be written\n' : '')
console.log('querying BigQuery (Uniware) for dispatched units and weight by facility…')
const t0 = Date.now()
const [uniRows] = await bq.query({ query: SQL, params: { statuses: SHIPPED_STATUSES } })
console.log(`  ${uniRows.length} facility-months in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

// Ledger facility_name (= Uniware Facility code) -> the pincode the ledger bills it under.
// Matched case-insensitively. If one name was uploaded under two pincodes, the pincode on
// most rows wins and the conflict is printed, so a typo can't split a site's volume.
const { rows: facRows } = await pool.query(`
  SELECT TRIM(facility_name) AS facility, TRIM(facility_pincode) AS pincode, COUNT(*)::int n
    FROM public.logistics_costs_3pl
   WHERE NULLIF(TRIM(facility_name), '') IS NOT NULL AND NULLIF(TRIM(facility_pincode), '') IS NOT NULL
   GROUP BY 1, 2 ORDER BY 1, 3 DESC`)
const pinOf = new Map()
for (const r of facRows) {
  const k = r.facility.toLowerCase()
  if (!pinOf.has(k)) pinOf.set(k, r.pincode)
  else if (pinOf.get(k) !== r.pincode) console.warn(`  ! ledger facility ${r.facility} also appears under pincode ${r.pincode}; using ${pinOf.get(k)}`)
}

// Roll Uniware facility-months up to (pincode, month). Unbilled facilities are skipped:
// they have no cost to divide, and no pincode to file them under.
const byKey = new Map()
const seenFac = new Set()
for (const r of uniRows) {
  const pin = pinOf.get(String(r.facility).toLowerCase())
  if (!pin) continue
  seenFac.add(String(r.facility).toLowerCase())
  const k = `${pin}|${r.month_year}`
  const cur = byKey.get(k) || { facility_pincode: pin, month_year: r.month_year, shipments: 0, weight_kg: 0, weighed_shipments: 0, names: new Set() }
  cur.shipments += Number(r.shipments) || 0
  cur.weight_kg += Number(r.weight_kg) || 0
  cur.weighed_shipments += Number(r.weighed_shipments) || 0
  cur.names.add(r.facility)
  byKey.set(k, cur)
}
const rows = [...byKey.values()].map(r => ({ ...r, weight_kg: Math.round(r.weight_kg * 1000) / 1000, pickup_names: [...r.names].sort().join(' | ') }))
console.log(`  ${rows.length} pincode-months match a billed facility\n`)
for (const [k, pin] of pinOf) if (!seenFac.has(k)) console.warn(`  ! ledger facility ${k} (${pin}) has no Uniware volume`)
for (const r of rows) {
  console.log(`  ${String(r.facility_pincode).padEnd(8)} ${r.month_year}  ${String(r.shipments).padStart(7)} units  ${String(r.weight_kg).padStart(11)} kg  ${r.pickup_names}`)
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
