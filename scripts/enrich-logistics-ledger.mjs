// Backfills true Frido weight + SKU/category detail onto logistics_invoices_b2c.
//
// WHY: the ledger's own declared_weight_frido is a rounded courier slab (2, 5, 7 kg),
// not real product weight. Comparing the courier's charged weight against an already
// inflated declared weight hides real overbilling — measured on a sample, true SKU
// weight surfaces ~1.6x more recoverable spend. The item master is the source of truth
// for weight/category, keyed by AWB via Clickpost + Uniware.
//
// AWB JOIN: Swift reverse AWBs carry a trailing "R" in the ledger that is absent from
// the source tables (match rate 11% -> 89% once stripped). We strip it for matching
// only; awb_number itself is never rewritten.
//
// SAFETY: only ever writes the frido_* / mapped_* columns added by the ALTER below.
// It never touches awb_number, any billed-cost column, or declared_weight_frido.
// Run with --dry-run first to see the match rate and a sample diff without writing.
//
//   node scripts/enrich-logistics-ledger.mjs --dry-run
//   node scripts/enrich-logistics-ledger.mjs
//   node scripts/enrich-logistics-ledger.mjs --from 2026-04-01 --to 2026-07-31
//
// Requires these columns to exist (nullable, so existing rows are unaffected):
//   ALTER TABLE public.logistics_invoices_b2c
//     ADD COLUMN IF NOT EXISTS frido_weight_kg  NUMERIC,
//     ADD COLUMN IF NOT EXISTS frido_sku_list   TEXT,
//     ADD COLUMN IF NOT EXISTS frido_units      INTEGER,
//     ADD COLUMN IF NOT EXISTS frido_category   TEXT,
//     ADD COLUMN IF NOT EXISTS frido_subcategory TEXT,
//     ADD COLUMN IF NOT EXISTS frido_mapped_at  TIMESTAMPTZ;

import { BigQuery } from '@google-cloud/bigquery'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

config()

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')
const arg = name => { const i = argv.indexOf(name); return i !== -1 ? argv[i + 1] : null }
const FROM = arg('--from') || '2024-11-01'
const TO = arg('--to') || '2026-12-31'
const LIMIT = parseInt(arg('--limit') || '0', 10)   // 0 = no cap; useful for testing

const KEY_PATH = ['/etc/secrets/sa_key.json', join(ROOT, 'sa_key.json'), join(ROOT, '..', 'sa_key.json')]
  .find(p => existsSync(p))
if (!KEY_PATH) { console.error('sa_key.json not found — cannot reach BigQuery.'); process.exit(1) }

const SUPA_URL = process.env.SUPABASE_PROJECT_URL
const READ_KEY = process.env.SUPABASE_ANON_KEY
// Writes need a service-role key. The SUPABASE_SECRET_KEY in .env is currently a
// restricted key that cannot even read this table, so a real --write run needs a
// service-role key supplied via SUPABASE_SERVICE_ROLE_KEY.
const WRITE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
if (!SUPA_URL || !READ_KEY) {
  console.error('SUPABASE_PROJECT_URL and SUPABASE_ANON_KEY must be set in .env.')
  process.exit(1)
}

const bq = new BigQuery({ keyFilename: KEY_PATH, projectId: 'frido-429506' })
const supa = createClient(SUPA_URL, DRY ? READ_KEY : WRITE_KEY, { auth: { persistSession: false } })
const supaRead = createClient(SUPA_URL, READ_KEY, { auth: { persistSession: false } })

const TABLE = 'logistics_invoices_b2c'
const PAGE = 1000
const WRITE_CHUNK = 500

// The ledger's Swift/Delhivery weights are stored in grams while Bluedart's are in
// kilograms; we only report the comparison here, so normalise for the sample diff.
const normKg = (v, courier) => {
  const n = parseFloat(v)
  if (!isFinite(n)) return null
  return courier === 'Bluedart' ? n : n / 1000
}

// Trailing R marks a reverse leg in the ledger; source tables omit it.
const joinKey = awb => String(awb || '').trim().replace(/R$/, '')

// ── 1. Build the AWB → true weight / SKU map from BigQuery ──────────────────
// Mirrors the analyst query: Clickpost expands multi-qty SKUs, Uniware covers AWBs
// Clickpost lacks. Clickpost wins on conflict (it is the shipping system of record).
const SQL = `
WITH item_master_deduped AS (
  SELECT DISTINCT
    Product_Code,
    SAFE_CAST(ANY_VALUE(Weight_gms) AS FLOAT64) / 1000 AS Weight_Kg,
    ANY_VALUE(Category_Name) AS Category_Name,
    ANY_VALUE(Sub_category)  AS Sub_category
  FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
  GROUP BY Product_Code
),

-- ---------- Clickpost ----------
clickpost_deduped AS (
  SELECT * FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY awb ORDER BY updated_at DESC) AS rn
    FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\`
    WHERE DATE(created_at) BETWEEN @from AND @to
  ) WHERE rn = 1
),
sku_correction AS (
  SELECT awb,
    CASE
      WHEN SAFE_CAST(items_quantity AS INT64) > 1
           AND ARRAY_LENGTH(SPLIT(product_sku_code, ', ')) = 1
        THEN TRIM(REGEXP_REPLACE(
               REPEAT(CONCAT(TRIM(product_sku_code), ', '), SAFE_CAST(items_quantity AS INT64)),
               r',\\s*$', ''))
      WHEN ARRAY_LENGTH(SPLIT(product_sku_code, ', ')) = SAFE_CAST(items_quantity AS INT64)
        THEN product_sku_code
      WHEN SAFE_CAST(items_quantity AS INT64) = 1
        THEN TRIM(product_sku_code)
    END AS updated_sku
  FROM clickpost_deduped
  WHERE product_sku_code IS NOT NULL AND TRIM(product_sku_code) != ''
    AND SAFE_CAST(items_quantity AS INT64) IS NOT NULL
),
clickpost_expanded AS (
  SELECT awb, TRIM(sku) AS product_sku_code
  FROM sku_correction, UNNEST(SPLIT(updated_sku, ', ')) AS sku
  WHERE updated_sku IS NOT NULL
),
clickpost_final AS (
  SELECT
    CAST(s.awb AS STRING) AS awb,
    STRING_AGG(s.product_sku_code, ', ' ORDER BY s.product_sku_code) AS sku_list,
    SUM(im.Weight_Kg)   AS total_weight,
    COUNT(s.product_sku_code) AS total_units,
    ANY_VALUE(im.Category_Name) AS category,
    ANY_VALUE(im.Sub_category)  AS sub_category,
    COUNTIF(im.Product_Code IS NULL) AS unmatched_skus
  FROM clickpost_expanded s
  LEFT JOIN item_master_deduped im ON s.product_sku_code = im.Product_Code
  GROUP BY s.awb
),

-- ---------- Uniware ----------
uniware_raw AS (
  SELECT DISTINCT
    CAST(t1.TrackingNumber AS STRING) AS awb,
    t1.ItemSKUCode,
    im.Weight_Kg, im.Category_Name, im.Sub_category
  FROM \`frido-429506.production.Unicommerce_Sale_Orders_Report\` t1
  LEFT JOIN item_master_deduped im ON t1.ItemSKUCode = im.Product_Code
  WHERE DATE(TIMESTAMP(t1.InvoiceCreated_dtm)) BETWEEN @from AND @to
    AND t1.TrackingNumber IS NOT NULL
    AND TRIM(t1.TrackingNumber) != ''
    AND NOT REGEXP_CONTAINS(t1.TrackingNumber, r'_')
),
uniware_final AS (
  SELECT
    awb,
    STRING_AGG(ItemSKUCode, ', ' ORDER BY ItemSKUCode) AS sku_list,
    SUM(Weight_Kg) AS total_weight,
    COUNT(ItemSKUCode) AS total_units,
    ANY_VALUE(Category_Name) AS category,
    ANY_VALUE(Sub_category)  AS sub_category,
    COUNTIF(Weight_Kg IS NULL) AS unmatched_skus
  FROM uniware_raw
  GROUP BY awb
)

SELECT
  COALESCE(c.awb, u.awb) AS awb,
  COALESCE(c.sku_list,     u.sku_list)     AS sku_list,
  COALESCE(c.total_weight, u.total_weight) AS total_weight,
  COALESCE(c.total_units,  u.total_units)  AS total_units,
  COALESCE(c.category,     u.category)     AS category,
  COALESCE(c.sub_category, u.sub_category) AS sub_category,
  COALESCE(c.unmatched_skus, u.unmatched_skus) AS unmatched_skus,
  IF(c.awb IS NOT NULL, 'CLICKPOST', 'UNIWARE') AS source
FROM clickpost_final c
FULL OUTER JOIN uniware_final u ON c.awb = u.awb
`

console.log(`Building AWB weight map from BigQuery (${FROM} → ${TO})…`)
const [bqRows] = await bq.query({ query: SQL, params: { from: FROM, to: TO } })

const map = new Map()
let bqSkipped = 0
for (const r of bqRows) {
  const w = parseFloat(r.total_weight)
  // A null/zero weight means no SKU in the shipment matched the item master — writing
  // it would look like a real 0 kg parcel, so leave those rows untouched.
  if (!isFinite(w) || w <= 0) { bqSkipped++; continue }
  map.set(joinKey(r.awb), {
    weight: w,
    sku_list: r.sku_list || null,
    units: r.total_units != null ? Number(r.total_units) : null,
    category: r.category || null,
    sub_category: r.sub_category || null,
    source: r.source,
  })
}
console.log(`  ${bqRows.length.toLocaleString('en-IN')} AWBs from BigQuery, ${map.size.toLocaleString('en-IN')} usable (${bqSkipped.toLocaleString('en-IN')} had no resolvable weight)`)

// ── 2. Walk the ledger and match ────────────────────────────────────────────
let scanned = 0, matched = 0, unmatched = 0, written = 0, rStripped = 0
const pending = []
const sample = []
const stamp = new Date().toISOString()

for (let offset = 0; ; offset += PAGE) {
  const { data, error } = await supaRead
    .from(TABLE)
    .select('id,awb_number,courier_name,declared_weight_frido,charged_weight_courier')
    .order('id', { ascending: true })
    .range(offset, offset + PAGE - 1)
  if (error) { console.error('read failed:', error.message); process.exit(1) }
  if (!data.length) break

  for (const row of data) {
    scanned++
    const rawAwb = String(row.awb_number || '').trim()
    const key = joinKey(rawAwb)
    if (key !== rawAwb) rStripped++
    const hit = map.get(key)
    if (!hit) { unmatched++; continue }
    matched++

    if (sample.length < 15) {
      sample.push({
        awb: rawAwb,
        courier: row.courier_name,
        ledgerDeclared: normKg(row.declared_weight_frido, row.courier_name),
        trueWeight: hit.weight,
        charged: normKg(row.charged_weight_courier, row.courier_name),
        cat: hit.category,
        src: hit.source,
      })
    }

    pending.push({
      id: row.id,
      frido_weight_kg: Number(hit.weight.toFixed(3)),
      frido_sku_list: hit.sku_list,
      frido_units: hit.units,
      frido_category: hit.category,
      frido_subcategory: hit.sub_category,
      frido_mapped_at: stamp,
    })
  }

  if (!DRY) {
    while (pending.length >= WRITE_CHUNK) {
      const chunk = pending.splice(0, WRITE_CHUNK)
      const { error: upErr } = await supa.from(TABLE).upsert(chunk, { onConflict: 'id' })
      if (upErr) { console.error('write failed:', upErr.message); process.exit(1) }
      written += chunk.length
      process.stdout.write(`\r  scanned ${scanned.toLocaleString('en-IN')} · matched ${matched.toLocaleString('en-IN')} · written ${written.toLocaleString('en-IN')}`)
    }
  }

  if (data.length < PAGE) break
  if (LIMIT && scanned >= LIMIT) break
}

if (!DRY && pending.length) {
  for (let i = 0; i < pending.length; i += WRITE_CHUNK) {
    const chunk = pending.slice(i, i + WRITE_CHUNK)
    const { error: upErr } = await supa.from(TABLE).upsert(chunk, { onConflict: 'id' })
    if (upErr) { console.error('write failed:', upErr.message); process.exit(1) }
    written += chunk.length
  }
}
if (!DRY) process.stdout.write('\n')

// ── 3. Report ───────────────────────────────────────────────────────────────
console.log(`\n${DRY ? '[DRY RUN — nothing written]' : '[WRITE COMPLETE]'}`)
console.log(`  ledger rows scanned : ${scanned.toLocaleString('en-IN')}`)
console.log(`  matched to a weight : ${matched.toLocaleString('en-IN')} (${(matched / scanned * 100).toFixed(1)}%)`)
console.log(`  unmatched           : ${unmatched.toLocaleString('en-IN')}`)
console.log(`  trailing "R" fixed  : ${rStripped.toLocaleString('en-IN')}`)
if (!DRY) console.log(`  rows updated        : ${written.toLocaleString('en-IN')}`)

if (sample.length) {
  console.log('\n  sample (kg, units normalised for display):')
  console.log('  awb                 courier    ledger_decl  true_wt   charged   category')
  for (const s of sample) {
    console.log('  ' + String(s.awb).padEnd(20) + String(s.courier).padEnd(11) +
      String(s.ledgerDeclared ?? '—').padEnd(13) + String(s.trueWeight).padEnd(10) +
      String(s.charged ?? '—').padEnd(10) + (s.cat || '—'))
  }
}

if (DRY) {
  console.log('\n  Re-run without --dry-run to write. Only frido_* columns are modified.')
}
