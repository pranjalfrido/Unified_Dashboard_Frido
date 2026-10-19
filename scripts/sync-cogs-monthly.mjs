// Syncs the month-wise COGS sheet (SKU_COGS_Monthly.xlsx: sku x Jun/Jul/Aug/Sep 2026) into
// Supabase as one row per (sku, month), covering the FULL sales-data history (Feb 2022 ->
// present) per explicit confirmation:
//   - Before June 2026: carry June's value backward (cogs_source='carried_forward').
//   - Jun/Jul/Aug/Sep 2026: the real uploaded value (cogs_source='actual').
//   - After September 2026 (until a newer month's file replaces this one): carry September's
//     value forward (cogs_source='carried_forward').
//
// This is step 1 only (per explicit instruction) -- get a correct table into Supabase. Wiring
// the dashboard (api/bq.js, PnLPage.jsx) to read from this table instead of the flat
// public/cogs-data.json is a separate, later step.
//
//   node scripts/sync-cogs-monthly.mjs --dry-run
//   node scripts/sync-cogs-monthly.mjs

import pkg from 'pg'
import { config } from 'dotenv'
import XLSX from 'xlsx'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

config()
const { Pool } = pkg
const DRY = process.argv.includes('--dry-run')

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'SKU_COGS_Monthly.xlsx')
if (!existsSync(SRC)) { console.error('SKU_COGS_Monthly.xlsx not found at', SRC); process.exit(1) }
if (!DRY && !process.env.SUPABASE_URL) { console.error('SUPABASE_URL not set'); process.exit(1) }

// ── Read the source sheet ──────────────────────────────────────────────────
const wb = XLSX.readFile(SRC, { cellFormula: false }) // cellFormula:false -> resolved values only
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1).filter(r => r[0] && r[2])

const REAL_MONTHS = [
  { col: 3, label: '2026-06-01', key: 'June' },
  { col: 4, label: '2026-07-01', key: 'July' },
  { col: 5, label: '2026-08-01', key: 'August' },
  { col: 6, label: '2026-09-01', key: 'September' },
]
const FIRST_REAL_MONTH = REAL_MONTHS[0] // June — carried backward
const LAST_REAL_MONTH = REAL_MONTHS[REAL_MONTHS.length - 1] // September — carried forward

// Full backfill range: Feb 2022 -> present, per explicit confirmation.
const EARLIEST_MONTH = new Date('2022-02-01T00:00:00Z')
const TODAY = new Date()
const CURRENT_MONTH_START = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), 1))

function monthRange(start, end) {
  // inclusive of start, inclusive of end, stepping by 1 month
  const out = []
  let d = new Date(start)
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10))
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  }
  return out
}

const beforeJuneMonths = monthRange(EARLIEST_MONTH, new Date('2026-05-01T00:00:00Z'))
const afterSeptMonths = monthRange(new Date('2026-10-01T00:00:00Z'), CURRENT_MONTH_START)

console.log(`Source rows: ${rows.length}`)
console.log(`Backfill (carry June backward): ${beforeJuneMonths.length} months — ${beforeJuneMonths[0]} to ${beforeJuneMonths[beforeJuneMonths.length - 1]}`)
console.log(`Forward-fill (carry September forward): ${afterSeptMonths.length} months — ${afterSeptMonths.length ? afterSeptMonths[0] + ' to ' + afterSeptMonths[afterSeptMonths.length - 1] : '(none — current month is September or earlier)'}`)

// ── Build the full (sku, month) row set ─────────────────────────────────────
const outRows = []
let skippedNoCogs = 0
for (const r of rows) {
  const category = r[0] ?? null
  const subCategory = r[1] ?? null
  const sku = String(r[2]).trim()
  if (!sku) continue

  // Real months
  const realVals = {}
  let anyReal = false
  for (const m of REAL_MONTHS) {
    const v = parseFloat(r[m.col])
    if (!isNaN(v) && v > 0) { realVals[m.label] = v; anyReal = true }
  }
  if (!anyReal) { skippedNoCogs++; continue }

  for (const m of REAL_MONTHS) {
    if (realVals[m.label] != null) {
      outRows.push({ sku, month: m.label, category, subCategory, cogs: realVals[m.label], source: 'actual', carriedFrom: null })
    }
  }

  // Backfill before June with June's value (fallback to earliest available real month if June itself is missing for this SKU)
  const juneVal = realVals[FIRST_REAL_MONTH.label] ?? Object.values(realVals)[0]
  const juneSrcMonth = realVals[FIRST_REAL_MONTH.label] != null ? FIRST_REAL_MONTH.label : REAL_MONTHS.find(m => realVals[m.label] != null).label
  for (const month of beforeJuneMonths) {
    outRows.push({ sku, month, category, subCategory, cogs: juneVal, source: 'carried_forward', carriedFrom: juneSrcMonth })
  }

  // Forward-fill after September with September's value (fallback to latest available real month if September itself is missing)
  const sortedRealMonths = REAL_MONTHS.filter(m => realVals[m.label] != null)
  const latestRealMonth = sortedRealMonths[sortedRealMonths.length - 1]
  const septVal = realVals[latestRealMonth.label]
  for (const month of afterSeptMonths) {
    outRows.push({ sku, month, category, subCategory, cogs: septVal, source: 'carried_forward', carriedFrom: latestRealMonth.label })
  }
}

console.log(`SKUs with no usable COGS value in any month: ${skippedNoCogs}`)
console.log(`Total (sku, month) rows to write: ${outRows.length}`)

if (DRY) {
  console.log('\nDRY RUN — nothing written. Sample rows:')
  outRows.slice(0, 5).forEach(r => console.log(' ', r))
  const sample = outRows.filter(r => r.sku === outRows[0].sku)
  console.log(`\nFull month coverage for SKU ${outRows[0].sku}: ${sample.length} rows (expect ${beforeJuneMonths.length + REAL_MONTHS.length + afterSeptMonths.length})`)
  process.exit(0)
}

// ── Write to Supabase ────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.SUPABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 })

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.product_cogs_monthly (
    sku                 text NOT NULL,
    month               date NOT NULL,
    category            text,
    sub_category        text,
    cogs                numeric NOT NULL,
    cogs_source         text NOT NULL,
    carried_from_month  date,
    synced_at           timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (sku, month)
  )
`)
console.log('Table ready: public.product_cogs_monthly')

const CHUNK = 500
let written = 0
for (let i = 0; i < outRows.length; i += CHUNK) {
  const batch = outRows.slice(i, i + CHUNK)
  const vals = [], params = []
  batch.forEach((r, k) => {
    const b = k * 7
    vals.push(`($${b+1},$${b+2}::date,$${b+3},$${b+4},$${b+5}::numeric,$${b+6},$${b+7}::date)`)
    params.push(r.sku, r.month, r.category, r.subCategory, r.cogs, r.source, r.carriedFrom)
  })
  await pool.query(`
    INSERT INTO public.product_cogs_monthly
      (sku, month, category, sub_category, cogs, cogs_source, carried_from_month)
    VALUES ${vals.join(',')}
    ON CONFLICT (sku, month) DO UPDATE SET
      category = EXCLUDED.category, sub_category = EXCLUDED.sub_category,
      cogs = EXCLUDED.cogs, cogs_source = EXCLUDED.cogs_source,
      carried_from_month = EXCLUDED.carried_from_month, synced_at = now()
  `, params)
  written += batch.length
  if (written % 10000 < CHUNK) console.log(`  ${written} / ${outRows.length} rows written...`)
}
console.log(`Done. ${written} rows written to public.product_cogs_monthly.`)
await pool.end()
