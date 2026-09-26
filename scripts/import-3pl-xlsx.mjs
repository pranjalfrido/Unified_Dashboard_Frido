// Imports a 3PL cost workbook straight into Supabase, bypassing the browser uploader.
//
// WHY THIS EXISTS: the browser path merges split invoice lines correctly, but the uploader
// runs client-side and a cached bundle kept executing the old code. This does the same work
// server-side so the result does not depend on what the browser happens to be holding.
//
// THE MERGE: a partner can bill one facility-month across several invoice lines — operations
// on one, rental on another, each with its own invoice number. Those share the upsert key
// (month_year, threepl_logistics_name, facility_pincode), so sending them as separate rows
// lets Postgres' ON CONFLICT keep only the last and silently discard the rest. In this file
// that is 10 pairs and roughly 65 lakh of spend. Money columns are additive, so duplicates
// are summed and the invoice numbers joined, which keeps the row traceable to every bill.
//
//   node scripts/import-3pl-xlsx.mjs "<path to .xlsx>" [--sheet "new "] [--dry-run]

import { config } from 'dotenv'
import pkg from 'pg'
import XLSX from 'xlsx'

config()
const { Pool } = pkg

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')
const file = argv.find(a => !a.startsWith('--'))
const sheetArg = argv.includes('--sheet') ? argv[argv.indexOf('--sheet') + 1] : null
if (!file) { console.error('usage: node scripts/import-3pl-xlsx.mjs "<file.xlsx>" [--sheet NAME] [--dry-run]'); process.exit(1) }

const connStr = process.env.SUPABASE_URL
if (!connStr) { console.error('SUPABASE_URL not set'); process.exit(1) }

// Header label -> column. Matches the ledger's field definitions; the trailing " *" marks a
// required column in the template and is not part of the name.
const COLS = {
  'month_year *': 'month_year',
  '3PL_Logistics_Name *': 'threepl_logistics_name',
  'Facility_Name': 'facility_name',
  'Facility_Location': 'facility_location',
  'Facility_Pincode': 'facility_pincode',
  'invoice_number': 'invoice_number',
  'operation_fee': 'operation_fee',
  'rental_fee': 'rental_fee',
  'other_fee': 'other_fee',
  'total_cost *': 'total_cost',
  'remarks': 'remarks',
}
const FEES = ['operation_fee', 'rental_fee', 'other_fee']
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }

const wb = XLSX.readFile(file)
const sheet = sheetArg || wb.SheetNames[0]
if (!wb.Sheets[sheet]) { console.error(`sheet "${sheet}" not found. sheets: ${wb.SheetNames.join(', ')}`); process.exit(1) }
const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: '' })
console.log(`reading "${sheet}" — ${raw.length} rows`)

const rows = []
const skipped = []
for (const [i, r] of raw.entries()) {
  const o = {}
  for (const [head, col] of Object.entries(COLS)) {
    const v = r[head]
    o[col] = FEES.includes(col) || col === 'total_cost' ? num(v) : String(v ?? '').trim()
  }
  // A row needs the three key fields to be addressable at all.
  if (!o.month_year || !o.threepl_logistics_name || !o.facility_pincode) {
    skipped.push({ line: i + 2, why: 'missing month / partner / pincode' })
    continue
  }
  rows.push(o)
}
if (skipped.length) {
  console.log(`\nskipped ${skipped.length} row(s):`)
  for (const s of skipped.slice(0, 10)) console.log(`  line ${s.line}: ${s.why}`)
}

// Merge rows sharing the upsert key.
const seen = new Map()
let mergedPairs = 0
for (const r of rows) {
  const k = [r.month_year, r.threepl_logistics_name.toLowerCase(), r.facility_pincode].join('|')
  const prev = seen.get(k)
  if (!prev) { seen.set(k, { ...r }); continue }
  mergedPairs++
  for (const f of FEES) prev[f] = num(prev[f]) + num(r[f])
  // Recompute from the parts rather than summing the stated totals: one row in this
  // workbook states a total that does not match its own fees, and the parts are the
  // figures the per-fee charts are built from.
  prev.total_cost = FEES.reduce((s, f) => s + num(prev[f]), 0)
  if (r.invoice_number && prev.invoice_number !== r.invoice_number) {
    prev.invoice_number = [prev.invoice_number, r.invoice_number].filter(Boolean).join(' + ')
  }
  for (const f of ['facility_name', 'facility_location', 'remarks']) {
    if (!prev[f] && r[f]) prev[f] = r[f]
  }
}
const merged = [...seen.values()]

const fileTotal = rows.reduce((s, r) => s + num(r.total_cost), 0)
const outTotal = merged.reduce((s, r) => s + num(r.total_cost), 0)
console.log(`\n${rows.length} rows -> ${merged.length} after merging ${mergedPairs} duplicate line(s)`)
console.log(`  stated file total : ${Math.round(fileTotal).toLocaleString('en-IN')}`)
console.log(`  sum of fee columns: ${Math.round(outTotal).toLocaleString('en-IN')}`)
if (Math.abs(fileTotal - outTotal) > 1) {
  console.log(`  NOTE: differs by ${Math.round(outTotal - fileTotal).toLocaleString('en-IN')} — at least one row's stated`)
  console.log(`        total_cost does not equal its own operation + rental + other.`)
}

const byMonth = {}
for (const r of merged) byMonth[r.month_year] = (byMonth[r.month_year] || 0) + num(r.total_cost)
console.log('\nby month:')
for (const m of Object.keys(byMonth).sort()) {
  console.log(`  ${m}  ${Math.round(byMonth[m]).toLocaleString('en-IN').padStart(12)}`)
}

if (DRY) { console.log('\nDRY RUN — nothing written'); process.exit(0) }

const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 120000 })
const c = await pool.connect()
try {
  await c.query('BEGIN')
  // Replace wholesale: this is a full-file import, and leaving old rows behind would mix
  // two uploads under one set of keys.
  await c.query('DELETE FROM public.logistics_costs_3pl')
  for (const r of merged) {
    await c.query(
      `INSERT INTO public.logistics_costs_3pl
         (month_year, threepl_logistics_name, facility_name, facility_location, facility_pincode,
          invoice_number, operation_fee, rental_fee, other_fee, total_cost, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [r.month_year, r.threepl_logistics_name, r.facility_name || null, r.facility_location || null,
       r.facility_pincode, r.invoice_number || null, r.operation_fee, r.rental_fee, r.other_fee,
       r.total_cost, r.remarks || null])
  }
  await c.query('COMMIT')
  const v = await c.query(`SELECT COUNT(*)::int n, SUM(total_cost)::float8 c FROM public.logistics_costs_3pl`)
  console.log(`\nwrote ${v.rows[0].n} rows, total ${Math.round(v.rows[0].c).toLocaleString('en-IN')}`)
} catch (e) {
  await c.query('ROLLBACK').catch(() => {})
  throw e
} finally {
  c.release()
  await pool.end()
}
