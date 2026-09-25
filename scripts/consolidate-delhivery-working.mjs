// Merges the three Delhivery working files (Express / Surface / Heavy) into one workbook.
//
// Output sheets:
//   All Shipments  every row from all three, with a leading Service column
//   Summary        billed vs Frido per service, and the variance that drives the claim
//   By SKU         variance rolled up per SKU, biggest gap first
//   Rates          the rate card, carried through so the file is self-contained
//
// The three invoices share 76 of 78 columns; Express alone carries "Pickup city" and
// "ZONE 2". The union is used and missing cells are left null rather than dropping the
// columns, so nothing from the source files is lost in the merge.
//
// Usage: node scripts/consolidate-delhivery-working.mjs "<folder>" ["<out.xlsx>"]
import XLSX from 'xlsx'
import { existsSync, readdirSync } from 'fs'

const DIR = process.argv[2] ||
  "c:/Users/TusharGupta/OneDrive - Arcatron Mobility Pvt Ltd/Sachin Mariwala's files - Delhivery/Invoices/July 26"
const OUT = process.argv[3] || `${DIR}/Delhivery Jul-26 CONSOLIDATED.xlsx`

const NUM = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const R = n => Math.round(n * 100) / 100

// Pick the newest _working file per service: a re-run may have written _v2 when the original
// was locked by Excel, and the v2 carries the corrected figures.
function pick(service) {
  const files = readdirSync(DIR)
    .filter(f => f.toLowerCase().includes(service.toLowerCase()) && /_working(_v\d+)?\.xlsx$/i.test(f))
    .sort()
  return files.length ? `${DIR}/${files[files.length - 1]}` : null
}

const SERVICES = ['Express', 'Surface', 'Heavy']
const sheets = {}
for (const s of SERVICES) {
  const p = pick(s)
  if (!p || !existsSync(p)) { console.log(`skip ${s}: no working file`); continue }
  sheets[s] = p
  console.log(`${s.padEnd(8)} ${p.split('/').pop()}`)
}
if (!Object.keys(sheets).length) throw new Error('no working files found in ' + DIR)

// ── read + merge ─────────────────────────────────────────────────────────────────
const allRows = []
const colOrder = []
const summary = []
for (const [service, path] of Object.entries(sheets)) {
  const wb = XLSX.readFile(path)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
  for (const c of Object.keys(rows[0] || {})) if (!colOrder.includes(c)) colOrder.push(c)

  let dl = 0, fdl = 0, rto = 0, frto = 0, cod = 0, fcod = 0, dto = 0, fdto = 0
  for (const r of rows) {
    dl += NUM(r.charge_DL); fdl += NUM(r.frido_charge_dl)
    rto += NUM(r.charge_RTO); frto += NUM(r.frido_charge_RTO)
    cod += NUM(r.charge_COD); fcod += NUM(r.frido_charge_COD)
    // DTO is the largest single charge on the Surface invoice - larger than freight - so
    // omitting it understated that service's variance by 1.05 L in July.
    dto += NUM(r.charge_DTO); fdto += NUM(r.frido_charge_DTO)
    allRows.push({ Service: service, ...r })
  }
  summary.push({
    Service: service, Shipments: rows.length,
    'Freight billed': R(dl), 'Freight Frido': R(fdl), 'Freight variance': R(dl - fdl),
    'RTO billed': R(rto), 'RTO Frido': R(frto), 'RTO variance': R(rto - frto),
    'COD billed': R(cod), 'COD Frido': R(fcod), 'COD variance': R(cod - fcod),
    'DTO billed': R(dto), 'DTO Frido': R(fdto), 'DTO variance': R(dto - fdto),
    'Total billed': R(dl + rto + cod + dto), 'Total Frido': R(fdl + frto + fcod + fdto),
    'Total variance': R((dl + rto + cod + dto) - (fdl + frto + fcod + fdto)),
  })
}
// Grand total row, so the claim figure is readable without summing by hand.
const T = k => R(summary.reduce((a, s) => a + s[k], 0))
summary.push({
  Service: 'TOTAL', Shipments: summary.reduce((a, s) => a + s.Shipments, 0),
  'Freight billed': T('Freight billed'), 'Freight Frido': T('Freight Frido'), 'Freight variance': T('Freight variance'),
  'RTO billed': T('RTO billed'), 'RTO Frido': T('RTO Frido'), 'RTO variance': T('RTO variance'),
  'COD billed': T('COD billed'), 'COD Frido': T('COD Frido'), 'COD variance': T('COD variance'),
  'DTO billed': T('DTO billed'), 'DTO Frido': T('DTO Frido'), 'DTO variance': T('DTO variance'),
  'Total billed': T('Total billed'), 'Total Frido': T('Total Frido'), 'Total variance': T('Total variance'),
})

// Normalise every row to the union of columns, Service first.
const header = ['Service', ...colOrder]
const norm = allRows.map(r => Object.fromEntries(header.map(h => [h, r[h] ?? null])))

// ── by SKU ───────────────────────────────────────────────────────────────────────
const bySku = new Map()
for (const r of allRows) {
  const k = r.SKU || '(no SKU)'
  if (!bySku.has(k)) bySku.set(k, { SKU: k, 'Sub category': r.Sub_cat || '', Shipments: 0, billed: 0, frido: 0 })
  const e = bySku.get(k)
  e.Shipments++
  e.billed += NUM(r.charge_DL) + NUM(r.charge_RTO) + NUM(r.charge_COD) + NUM(r.charge_DTO)
  e.frido += NUM(r.frido_charge_dl) + NUM(r.frido_charge_RTO) + NUM(r.frido_charge_COD) + NUM(r.frido_charge_DTO)
  if (!e['Sub category'] && r.Sub_cat) e['Sub category'] = r.Sub_cat
}
const skuRows = [...bySku.values()]
  .map(e => ({ ...e, billed: R(e.billed), frido: R(e.frido), Variance: R(e.billed - e.frido) }))
  .sort((a, b) => b.Variance - a.Variance)
  .map(e => ({ SKU: e.SKU, 'Sub category': e['Sub category'], Shipments: e.Shipments, Billed: e.billed, Frido: e.frido, Variance: e.Variance }))

// ── write ────────────────────────────────────────────────────────────────────────
const nb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(nb, XLSX.utils.json_to_sheet(summary), 'Summary')
XLSX.utils.book_append_sheet(nb, XLSX.utils.json_to_sheet(norm, { header }), 'All Shipments')
XLSX.utils.book_append_sheet(nb, XLSX.utils.json_to_sheet(skuRows), 'By SKU')
const firstWb = XLSX.readFile(Object.values(sheets)[0])
if (firstWb.Sheets.Rates) XLSX.utils.book_append_sheet(nb, firstWb.Sheets.Rates, 'Rates')
XLSX.writeFile(nb, OUT)

const F = n => '₹' + Math.round(n).toLocaleString('en-IN')
console.log('\n' + 'service'.padEnd(10) + 'rows'.padStart(8) + 'billed'.padStart(14) + 'frido'.padStart(14) + 'variance'.padStart(13))
for (const s of summary) {
  console.log(
    (s.Service === 'TOTAL' ? '─'.repeat(10) + '\nTOTAL' : s.Service).padEnd(10) +
    String(s.Shipments).padStart(8) +
    F(s['Total billed']).padStart(14) + F(s['Total Frido']).padStart(14) + F(s['Total variance']).padStart(13))
}
console.log('\nsheets: Summary · All Shipments (' + norm.length + ') · By SKU (' + skuRows.length + ')' + (firstWb.Sheets.Rates ? ' · Rates' : ''))
console.log('written: ' + OUT)
