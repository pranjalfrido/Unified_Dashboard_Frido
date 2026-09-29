// Syncs master product weight per sub-category from the BigQuery item master into Supabase.
//
// WHY: the Cost by Product table showed an AVERAGE of billed slabs (Footwear 1.72 kg), which
// is not a slab anyone is charged and read as confusing. The item master holds the actual
// product weight, so the slab can be derived from what the product WEIGHS rather than
// inferred from what couriers billed.
//
// Weight_gms is in GRAMS — divided by 1000 here so everything downstream is kilograms.
//
// MEDIAN across SKUs, not mean: most sub-categories have one weight for every SKU (min =
// max), but a few are mixed bags — Sparepart spans 0 to 17.464 kg across 272 SKUs — where a
// mean would be dragged by outliers. min/max are stored alongside so a spread is visible
// rather than hidden behind a single number.
//
// Coverage measured before writing: 3,582 of 3,582 SKUs carry a weight, and 216 of 217
// ledger sub-categories match. The one miss is "Mixed Shipments", which is a multi-SKU
// parcel rather than a product and correctly has no single weight.
//
//   node scripts/sync-subcat-weights.mjs --dry-run
//   node scripts/sync-subcat-weights.mjs

import { BigQuery } from '@google-cloud/bigquery'
import pkg from 'pg'
import { config } from 'dotenv'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

config()
const { Pool } = pkg
const DRY = process.argv.includes('--dry-run')

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const KEY = ['/etc/secrets/sa_key.json', join(ROOT, 'sa_key.json'), join(ROOT, '..', 'sa_key.json')]
  .find(p => existsSync(p))
if (!KEY) { console.error('sa_key.json not found'); process.exit(1) }
if (!process.env.SUPABASE_URL) { console.error('SUPABASE_URL not set'); process.exit(1) }

const bq = new BigQuery({ keyFilename: KEY, projectId: 'frido-429506' })
const pool = new Pool({ connectionString: process.env.SUPABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 })

const [rows] = await bq.query(`
  SELECT Sub_category AS sub,
         ANY_VALUE(Category_Name) AS cat,
         COUNT(*) AS skus,
         APPROX_QUANTILES(SAFE_CAST(Weight_gms AS FLOAT64), 2)[OFFSET(1)] / 1000 AS med_kg,
         MIN(SAFE_CAST(Weight_gms AS FLOAT64)) / 1000 AS min_kg,
         MAX(SAFE_CAST(Weight_gms AS FLOAT64)) / 1000 AS max_kg,
         APPROX_QUANTILES(SAFE_CAST(Length_mm AS FLOAT64), 2)[OFFSET(1)] / 10 AS len_cm,
         APPROX_QUANTILES(SAFE_CAST(Width_mm  AS FLOAT64), 2)[OFFSET(1)] / 10 AS bre_cm,
         APPROX_QUANTILES(SAFE_CAST(Height_mm AS FLOAT64), 2)[OFFSET(1)] / 10 AS hei_cm
    FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
   WHERE SAFE_CAST(Weight_gms AS FLOAT64) > 0
     AND Sub_category IS NOT NULL AND TRIM(Sub_category) != ''
   GROUP BY 1
`)
console.log(`item master: ${rows.length} sub-categories with a weight`)

// Billable slab, same rule the rest of the app uses: <= 0.5 floors at 0.5, else round up.
// <= not <, because 173,220 Bluedart rows sit at exactly 0.5 kg and are billed the 0.5 rate.
const slab = w => (w > 0 ? (w <= 0.5 ? 0.5 : Math.ceil(w)) : null)

if (DRY) {
  console.log('\nDRY RUN — nothing written. Sample:')
  for (const r of rows.slice(0, 12)) {
    console.log(`  ${String(r.sub).slice(0, 34).padEnd(35)}${Number(r.med_kg).toFixed(3)} kg -> slab ${slab(Number(r.med_kg))}`)
  }
  await pool.end()
  process.exit(0)
}

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.product_master_weight (
    sub_category  text PRIMARY KEY,
    category      text,
    skus          integer,
    weight_kg     numeric,      -- median across SKUs, kilograms
    weight_min_kg numeric,
    weight_max_kg numeric,
    slab_kg       numeric,      -- billable slab derived from weight_kg
    len_cm        numeric,
    bre_cm        numeric,
    hei_cm        numeric,
    synced_at     timestamptz NOT NULL DEFAULT now()
  )
`)

const CHUNK = 200
let written = 0
for (let i = 0; i < rows.length; i += CHUNK) {
  const batch = rows.slice(i, i + CHUNK)
  const vals = [], params = []
  batch.forEach((r, k) => {
    const b = k * 10
    vals.push(`($${b+1},$${b+2},$${b+3}::int,$${b+4}::numeric,$${b+5}::numeric,$${b+6}::numeric,$${b+7}::numeric,$${b+8}::numeric,$${b+9}::numeric,$${b+10}::numeric)`)
    const w = Number(r.med_kg)
    params.push(String(r.sub).trim(), r.cat ?? null, Number(r.skus), w,
      Number(r.min_kg), Number(r.max_kg), slab(w),
      Number(r.len_cm) || null, Number(r.bre_cm) || null, Number(r.hei_cm) || null)
  })
  await pool.query(`
    INSERT INTO public.product_master_weight
      (sub_category, category, skus, weight_kg, weight_min_kg, weight_max_kg, slab_kg,
       len_cm, bre_cm, hei_cm)
    VALUES ${vals.join(',')}
    ON CONFLICT (sub_category) DO UPDATE SET
      category = EXCLUDED.category, skus = EXCLUDED.skus,
      weight_kg = EXCLUDED.weight_kg, weight_min_kg = EXCLUDED.weight_min_kg,
      weight_max_kg = EXCLUDED.weight_max_kg, slab_kg = EXCLUDED.slab_kg,
      len_cm = EXCLUDED.len_cm, bre_cm = EXCLUDED.bre_cm, hei_cm = EXCLUDED.hei_cm,
      synced_at = now()
  `, params)
  written += batch.length
}
console.log(`written ${written}`)

const { rows: cov } = await pool.query(`
  SELECT COUNT(DISTINCT d.sub_category)::int total,
         COUNT(DISTINCT d.sub_category) FILTER (WHERE w.sub_category IS NOT NULL)::int matched
    FROM public.awb_shipment_dims d
    LEFT JOIN public.product_master_weight w
           ON lower(trim(w.sub_category)) = lower(trim(d.sub_category))
   WHERE d.sub_category IS NOT NULL
`)
console.log(`ledger sub-categories ${cov[0].total} · matched ${cov[0].matched} (${(cov[0].matched / cov[0].total * 100).toFixed(1)}%)`)
await pool.end()
