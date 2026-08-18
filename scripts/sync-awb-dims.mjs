// Syncs BigQuery `production.awb_wise_shipment_weight` -> Supabase `awb_shipment_dims`,
// restricted to the AWBs that actually appear in the B2C invoice ledger.
//
// WHY A SYNC AND NOT A LIVE JOIN: the cost tab reads Supabase, and the source table is
// 5.6M rows in BigQuery. Querying BigQuery per dashboard request would add a second data
// source and its latency to a page that already takes ~10s. Pulling only the ~660k AWBs
// we invoice keeps the table small and every aggregate still drills to AWB level, which
// the claim workflow requires.
//
// AWB KEYING — exact match first, trailing "R" stripped only on failure:
//   Swift reverse legs carry an "R" suffix the source table doesn't have, so stripping
//   is required there. But Bluedart/Shadowfax/ElasticRun have valid IDs that simply END
//   in R ("FR4C50240CA9YR"), and stripping those unconditionally would corrupt them.
//   Measured: exact 90.8% + R-fallback 8.8% = 99.6% hit rate.
//
// `total_weight` in the source is VOLUMETRIC (L*B*H/5000), verified on 5,095,097 of
// 5,409,405 dimensioned rows (94.2%) — NOT physical weight. Stored as volumetric_kg and
// must be labelled as such in the UI, or every claim built on it is misread.
//
//   node scripts/sync-awb-dims.mjs --dry-run
//   node scripts/sync-awb-dims.mjs

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
const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, max: 3 })
pool.on('error', e => console.error('[pool]', e.message))

const SRC = '`frido-429506.production.awb_wise_shipment_weight`'
const BQ_CHUNK = 5000        // AWBs per BigQuery IN UNNEST
const WRITE_CHUNK = 500

// ── 1. Which AWBs do we actually invoice? ──
console.log('Reading ledger AWBs…')
const { rows: ledger } = await pool.query(`
  SELECT DISTINCT awb_number FROM public.logistics_invoices_b2c
   WHERE awb_number IS NOT NULL AND awb_number <> ''
`)
// Map every lookup key back to the ledger's own AWB spelling, so the synced row keys on
// what the ledger uses and the join needs no runtime string surgery.
const keyToLedger = new Map()
for (const r of ledger) {
  const a = String(r.awb_number).trim()
  if (!keyToLedger.has(a)) keyToLedger.set(a, a)
  const s = a.replace(/R$/, '')
  // Only register the stripped form if nothing already claims it — an exact match on
  // another row's AWB must win over a speculative strip.
  if (s !== a && !keyToLedger.has(s)) keyToLedger.set(s, a)
}
const lookupKeys = [...keyToLedger.keys()]
console.log(`  ${ledger.length.toLocaleString('en-IN')} distinct ledger AWBs · ${lookupKeys.length.toLocaleString('en-IN')} lookup keys (incl. R-stripped)`)

// ── 2. Pull matching dimension rows from BigQuery ──
// One row per AWB: the source has duplicates (multiple legs / both Clickpost and Uniware
// sources), so collapse deterministically and prefer a row that actually has dimensions.
const SQL = `
  SELECT CAST(TrackingNumber AS STRING) AS awb,
         ANY_VALUE(Order_Id)      AS order_id,
         MIN(Order_Date)          AS order_date,
         ANY_VALUE(Channel)       AS channel,
         ANY_VALUE(Source)        AS source,
         ANY_VALUE(sku_list)      AS sku_list,
         ANY_VALUE(Category)      AS category,
         ANY_VALUE(Sub_Category)  AS sub_category,
         MAX(L)                   AS len_cm,
         MAX(B)                   AS bre_cm,
         MAX(H)                   AS hei_cm,
         MAX(item_count)          AS item_count,
         MAX(total_weight)        AS volumetric_kg
    FROM ${SRC}
   WHERE CAST(TrackingNumber AS STRING) IN UNNEST(@keys)
   GROUP BY 1
`

const stats = { fetched: 0, mapped: 0, exact: 0, viaStrip: 0, written: 0, noDims: 0, mixed: 0 }
const seenLedgerAwb = new Set()
const pending = []
const stamp = new Date().toISOString()

async function flush(chunk) {
  const vals = []
  const params = []
  chunk.forEach((c, k) => {
    const b = k * 13
    vals.push(`($${b + 1},$${b + 2},$${b + 3}::date,$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9}::numeric,$${b + 10}::numeric,$${b + 11}::numeric,$${b + 12}::int,$${b + 13}::numeric)`)
    params.push(c.awb, c.order_id, c.order_date, c.channel, c.source, c.sku_list,
      c.category, c.sub_category, c.len_cm, c.bre_cm, c.hei_cm, c.item_count, c.volumetric_kg)
  })
  await pool.query(`
    INSERT INTO public.awb_shipment_dims
      (awb, order_id, order_date, channel, source, sku_list, category, sub_category,
       len_cm, bre_cm, hei_cm, item_count, volumetric_kg)
    VALUES ${vals.join(',')}
    ON CONFLICT (awb) DO UPDATE SET
      order_id = EXCLUDED.order_id, order_date = EXCLUDED.order_date,
      channel = EXCLUDED.channel, source = EXCLUDED.source, sku_list = EXCLUDED.sku_list,
      category = EXCLUDED.category, sub_category = EXCLUDED.sub_category,
      len_cm = EXCLUDED.len_cm, bre_cm = EXCLUDED.bre_cm, hei_cm = EXCLUDED.hei_cm,
      item_count = EXCLUDED.item_count, volumetric_kg = EXCLUDED.volumetric_kg,
      synced_at = '${stamp}'
  `, params)
}

console.log(DRY ? '\nDRY RUN — nothing will be written' : '\nSyncing…')

for (let i = 0; i < lookupKeys.length; i += BQ_CHUNK) {
  const slice = lookupKeys.slice(i, i + BQ_CHUNK)
  const [rows] = await bq.query({ query: SQL, params: { keys: slice } })
  stats.fetched += rows.length

  for (const r of rows) {
    const ledgerAwb = keyToLedger.get(r.awb)
    if (!ledgerAwb) continue
    // A ledger AWB can be reachable by both its exact and stripped form; keep the first.
    if (seenLedgerAwb.has(ledgerAwb)) continue
    seenLedgerAwb.add(ledgerAwb)
    stats.mapped++
    if (ledgerAwb === r.awb) stats.exact++; else stats.viaStrip++

    const L = Number(r.len_cm), B = Number(r.bre_cm), H = Number(r.hei_cm)
    const hasDims = L > 0.1 && B > 0.1 && H > 0.1
    if (!hasDims) stats.noDims++
    if (r.category === 'Mixed Shipments') stats.mixed++

    pending.push({
      awb: ledgerAwb,
      order_id: r.order_id ?? null,
      // BigQuery DATE arrives as {value:'YYYY-MM-DD'}.
      order_date: r.order_date?.value ?? r.order_date ?? null,
      channel: r.channel ?? null,
      source: r.source ?? null,
      sku_list: r.sku_list ?? null,
      category: r.category ?? null,
      sub_category: r.sub_category ?? null,
      len_cm: hasDims ? L : null,
      bre_cm: hasDims ? B : null,
      hei_cm: hasDims ? H : null,
      item_count: r.item_count != null ? Number(r.item_count) : null,
      // Null out placeholder/zero weights rather than storing a fake 0 kg parcel.
      volumetric_kg: Number(r.volumetric_kg) > 0 ? Number(r.volumetric_kg) : null,
    })
  }

  if (!DRY) {
    while (pending.length >= WRITE_CHUNK) {
      await flush(pending.splice(0, WRITE_CHUNK))
      stats.written += WRITE_CHUNK
    }
  } else {
    pending.length = 0
  }
  process.stdout.write(`\r  keys ${Math.min(i + BQ_CHUNK, lookupKeys.length).toLocaleString('en-IN')}/${lookupKeys.length.toLocaleString('en-IN')} · matched ${stats.mapped.toLocaleString('en-IN')}${DRY ? '' : ` · written ${stats.written.toLocaleString('en-IN')}`}`)
}

if (!DRY && pending.length) {
  for (let i = 0; i < pending.length; i += WRITE_CHUNK) {
    const chunk = pending.slice(i, i + WRITE_CHUNK)
    await flush(chunk)
    stats.written += chunk.length
  }
}
process.stdout.write('\n')

const hit = stats.mapped / ledger.length * 100
console.log(`\n${DRY ? '[DRY RUN]' : '[SYNCED]'}`)
console.log(`  ledger AWBs            ${ledger.length.toLocaleString('en-IN')}`)
console.log(`  matched in BigQuery    ${stats.mapped.toLocaleString('en-IN')}  (${hit.toFixed(1)}% join hit rate)`)
console.log(`    via exact match      ${stats.exact.toLocaleString('en-IN')}`)
console.log(`    via R-strip fallback ${stats.viaStrip.toLocaleString('en-IN')}`)
console.log(`  unmatched              ${(ledger.length - stats.mapped).toLocaleString('en-IN')}`)
if (!DRY) console.log(`  rows written           ${stats.written.toLocaleString('en-IN')}`)
console.log()
console.log(`  of matched: no usable dimensions ${stats.noDims.toLocaleString('en-IN')}`)
console.log(`  of matched: Mixed Shipments      ${stats.mixed.toLocaleString('en-IN')} (excluded from category analysis)`)
if (DRY) console.log('\n  Re-run without --dry-run to write awb_shipment_dims.')
await pool.end()
