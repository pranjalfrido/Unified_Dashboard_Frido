// Same logic as sync-cogs-monthly.mjs, but loads via Supabase's REST API (PostgREST) instead
// of a direct Postgres connection -- the direct host (db.<ref>.supabase.co) is IPv6-only and
// unreachable from this environment, while the REST API works fine over regular HTTPS.
//
//   node scripts/sync-cogs-monthly-rest.mjs --dry-run
//   node scripts/sync-cogs-monthly-rest.mjs

import { config } from 'dotenv'
import XLSX from 'xlsx'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

config()
const DRY = process.argv.includes('--dry-run')

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'SKU_COGS_Monthly.xlsx')
if (!existsSync(SRC)) { console.error('SKU_COGS_Monthly.xlsx not found at', SRC); process.exit(1) }

const BASE = process.env.SUPABASE_PROJECT_URL
const KEY = process.env.SUPABASE_SECRET_KEY
if (!DRY && (!BASE || !KEY)) { console.error('SUPABASE_PROJECT_URL / SUPABASE_SECRET_KEY not set'); process.exit(1) }

// ── Read the source sheet ──────────────────────────────────────────────────
const wb = XLSX.readFile(SRC, { cellFormula: false })
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1).filter(r => r[0] && r[2])

const REAL_MONTHS = [
  { col: 3, label: '2026-06-01' },
  { col: 4, label: '2026-07-01' },
  { col: 5, label: '2026-08-01' },
  { col: 6, label: '2026-09-01' },
]
const FIRST_REAL_MONTH = REAL_MONTHS[0]

const EARLIEST_MONTH = new Date('2022-02-01T00:00:00Z')
const TODAY = new Date()
const CURRENT_MONTH_START = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), 1))

function monthRange(start, end) {
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
console.log(`Backfill (carry June backward): ${beforeJuneMonths.length} months`)
console.log(`Forward-fill (carry latest real month forward): ${afterSeptMonths.length} months`)

const outRows = []
let skippedNoCogs = 0
for (const r of rows) {
  const category = r[0] ?? null
  const subCategory = r[1] ?? null
  const sku = String(r[2]).trim()
  if (!sku) continue

  const realVals = {}
  for (const m of REAL_MONTHS) {
    const v = parseFloat(r[m.col])
    if (!isNaN(v) && v > 0) realVals[m.label] = v
  }
  if (!Object.keys(realVals).length) { skippedNoCogs++; continue }

  for (const m of REAL_MONTHS) {
    if (realVals[m.label] != null) {
      outRows.push({ sku, month: m.label, category, sub_category: subCategory, cogs: realVals[m.label], cogs_source: 'actual', carried_from_month: null })
    }
  }

  const juneVal = realVals[FIRST_REAL_MONTH.label] ?? Object.values(realVals)[0]
  const juneSrcMonth = realVals[FIRST_REAL_MONTH.label] != null ? FIRST_REAL_MONTH.label : REAL_MONTHS.find(m => realVals[m.label] != null).label
  for (const month of beforeJuneMonths) {
    outRows.push({ sku, month, category, sub_category: subCategory, cogs: juneVal, cogs_source: 'carried_forward', carried_from_month: juneSrcMonth })
  }

  const sortedRealMonths = REAL_MONTHS.filter(m => realVals[m.label] != null)
  const latestRealMonth = sortedRealMonths[sortedRealMonths.length - 1]
  const latestVal = realVals[latestRealMonth.label]
  for (const month of afterSeptMonths) {
    outRows.push({ sku, month, category, sub_category: subCategory, cogs: latestVal, cogs_source: 'carried_forward', carried_from_month: latestRealMonth.label })
  }
}

console.log(`SKUs with no usable COGS value: ${skippedNoCogs}`)
console.log(`Total (sku, month) rows to write: ${outRows.length}`)

if (DRY) {
  console.log('\nDRY RUN — nothing written. Sample:')
  outRows.slice(0, 3).forEach(r => console.log(' ', r))
  process.exit(0)
}

// ── Write via REST API (upsert, chunked) ────────────────────────────────────
const CHUNK = 1000
let written = 0
for (let i = 0; i < outRows.length; i += CHUNK) {
  const batch = outRows.slice(i, i + CHUNK)
  const res = await fetch(`${BASE}/rest/v1/product_cogs_monthly?on_conflict=sku,month`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(batch),
  })
  if (!res.ok) {
    const text = await res.text()
    console.error(`Batch ${i}-${i + batch.length} FAILED (${res.status}):`, text.slice(0, 500))
    process.exit(1)
  }
  written += batch.length
  console.log(`  ${written} / ${outRows.length} rows written...`)
}
console.log(`Done. ${written} rows written to public.product_cogs_monthly.`)
