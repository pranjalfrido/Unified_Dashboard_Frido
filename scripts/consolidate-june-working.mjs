// Consolidates the June-26 Delhivery working files into one workbook.
//
// Unlike July (which this repo generated), the June workings were built by hand and each
// file names its columns differently:
//
//   concept          Express              Surface              Heavy
//   frido weight     Frido wt             Frido_Charged_wt     Frido_charged_weight
//   frido slab       Frido Slab wt        Slab wt              Slab wt
//   billed slab      del. Slab wt         -                    -
//   min slab         Min                  Slab wt              MIN
//   our zone         zone 2               Zone                 Zone
//   freight          frido_charge_dl      Frido_Charge_DL      Frido_charge
//   rto              frido_charge_RTO     Frido_charge_RTO     Frido_charge_RTO
//   cod              frido_charge_COD     -                    Frido_charge_COD
//
// Surface has no Frido COD column at all, and none of the three carry a Frido DTO except
// Surface. Rather than invent values, missing measures stay null and the Summary notes
// what was absent - a blank is honest, a zero would understate the variance.
//
// Every file also has a title/totals row above the header, so rows are read with
// header:1 and the second row used as the header.
//
// Usage: node scripts/consolidate-june-working.mjs ["<folder>"] ["<out.xlsx>"]
import XLSX from 'xlsx'
import { existsSync, readdirSync } from 'fs'

const DIR = process.argv[2] ||
  "c:/Users/TusharGupta/OneDrive - Arcatron Mobility Pvt Ltd/Sachin Mariwala's files - Delhivery/Invoices/June 26"
const OUT = process.argv[3] || `${DIR}/Delhivery Jun-26 CONSOLIDATED.xlsx`

const NUM = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const R = n => Math.round(n * 100) / 100
const S = v => (v === null || v === undefined ? null : String(v).trim())

// Per-service column aliases. First name that exists in the sheet wins.
const ALIAS = {
  SKU: ['SKU'],
  Sub_cat: ['Sub_cat'],
  charged_weight: ['charged_weight'],
  frido_wt: ['Frido wt', 'Frido_Charged_wt', 'Frido_charged_weight'],
  del_slab: ['del. Slab wt', 'Delhivery wt'],
  frido_slab: ['Frido Slab wt', 'Slab wt'],
  min_slab: ['Min', 'MIN', 'Slab wt'],
  their_zone: ['zone'],
  our_zone: ['zone 2', 'Zone 2', 'Zone'],
  status: ['status'],
  package_type: ['package_type'],
  cod_amount: ['cod_amount'],
  charge_DL: ['charge_DL'],
  frido_DL: ['frido_charge_dl', 'Frido_Charge_DL', 'Frido_charge'],
  charge_RTO: ['charge_RTO'],
  frido_RTO: ['frido_charge_RTO', 'Frido_charge_RTO'],
  charge_COD: ['charge_COD'],
  frido_COD: ['frido_charge_COD', 'Frido_charge_COD'],
  charge_DTO: ['charge_DTO'],
  frido_DTO: ['Frido_charge_DTO', 'frido_charge_DTO'],
  // Each working file computes its own billed/Frido totals and the difference. These are
  // the authority: gross_amount carries FSC, FOV and other line items the individual
  // charge columns do not, so re-deriving the variance from charge_DL + RTO + COD alone
  // understates it (Surface June: 13,561 derived vs 72,192 actual).
  gross_amount: ['gross_amount'],
  frido_total: ['Frido_total', 'Frido_gross_total', 'Frido Total'],
  file_diff: ['Diff', 'Difference', 'diff'],
  waybill_num: ['waybill_num'],
  destination_pin: ['destination_pin'],
  order_id: ['order_id'],
}

function readWorking(path) {
  const wb = XLSX.readFile(path)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  // Header is whichever of the first two rows actually carries column names.
  const hdrRow = (grid[0] && grid[0].filter(Boolean).length > 20) ? 0 : 1
  const header = grid[hdrRow].map(h => (h === null ? '' : String(h).trim()))
  const rows = []
  for (const g of grid.slice(hdrRow + 1)) {
    if (!g || g.every(c => c === null || c === '')) continue
    const o = {}
    header.forEach((h, i) => { if (h) o[h] = g[i] ?? null })
    rows.push(o)
  }
  return { rows, header, rates: wb.Sheets.Rates || null }
}

const SERVICES = ['Express', 'Surface', 'Heavy']
const files = {}
for (const s of SERVICES) {
  const f = readdirSync(DIR).find(x => x.toLowerCase().includes(s.toLowerCase()) && /\.xlsx$/i.test(x) && !/consolidat/i.test(x))
  if (f && existsSync(`${DIR}/${f}`)) { files[s] = `${DIR}/${f}`; console.log(`${s.padEnd(8)} ${f}`) }
  else console.log(`skip ${s}: not found`)
}
if (!Object.keys(files).length) throw new Error('no June working files found in ' + DIR)

const allRows = []
const summary = []
const gaps = []
let ratesSheet = null

for (const [service, path] of Object.entries(files)) {
  const { rows, header, rates } = readWorking(path)
  if (rates && !ratesSheet) ratesSheet = rates
  // Resolve this file's actual column name for each concept.
  const pick = {}
  for (const [k, names] of Object.entries(ALIAS)) pick[k] = names.find(n => header.includes(n)) || null
  const missing = Object.entries(pick).filter(([, v]) => !v).map(([k]) => k)
  if (missing.length) gaps.push(`${service}: no ${missing.join(', ')}`)

  let dl = 0, fdl = 0, rto = 0, frto = 0, cod = 0, fcod = 0
  let dto = 0, fdto = 0, gross = 0, ftot = 0, fdiff = 0
  let hasFCOD = !!pick.frido_COD
  const hasTotals = !!(pick.gross_amount && pick.frido_total)

  for (const r of rows) {
    const get = k => (pick[k] ? r[pick[k]] : null)
    dl += NUM(get('charge_DL')); fdl += NUM(get('frido_DL'))
    rto += NUM(get('charge_RTO')); frto += NUM(get('frido_RTO'))
    cod += NUM(get('charge_COD')); fcod += NUM(get('frido_COD'))
    dto += NUM(get('charge_DTO')); fdto += NUM(get('frido_DTO'))
    gross += NUM(get('gross_amount')); ftot += NUM(get('frido_total'))
    fdiff += NUM(get('file_diff'))
    allRows.push({
      Service: service,
      waybill_num: S(get('waybill_num')),
      order_id: S(get('order_id')),
      SKU: S(get('SKU')),
      Sub_cat: S(get('Sub_cat')),
      destination_pin: S(get('destination_pin')),
      charged_weight: get('charged_weight') === null ? null : NUM(get('charged_weight')),
      'Frido wt': get('frido_wt') === null ? null : NUM(get('frido_wt')),
      'del. Slab wt': get('del_slab') === null ? null : NUM(get('del_slab')),
      'Frido Slab wt': get('frido_slab') === null ? null : NUM(get('frido_slab')),
      Min: get('min_slab') === null ? null : NUM(get('min_slab')),
      zone: S(get('their_zone')),
      'zone 2': S(get('our_zone')),
      status: S(get('status')),
      package_type: S(get('package_type')),
      cod_amount: get('cod_amount') === null ? null : NUM(get('cod_amount')),
      charge_DL: NUM(get('charge_DL')),
      frido_charge_dl: NUM(get('frido_DL')),
      charge_RTO: NUM(get('charge_RTO')),
      frido_charge_RTO: NUM(get('frido_RTO')),
      charge_COD: NUM(get('charge_COD')),
      // Surface has no Frido COD column - leave blank rather than implying zero.
      frido_charge_COD: hasFCOD ? NUM(get('frido_COD')) : null,
      charge_DTO: NUM(get('charge_DTO')),
      frido_charge_DTO: pick.frido_DTO ? NUM(get('frido_DTO')) : null,
      gross_amount: pick.gross_amount ? NUM(get('gross_amount')) : null,
      Frido_total: pick.frido_total ? NUM(get('frido_total')) : null,
      Variance: pick.file_diff ? NUM(get('file_diff'))
        : (pick.gross_amount && pick.frido_total ? R(NUM(get('gross_amount')) - NUM(get('frido_total'))) : null),
    })
  }

  summary.push({
    Service: service, Shipments: rows.length,
    'Freight billed': R(dl), 'Freight Frido': R(fdl), 'Freight variance': R(dl - fdl),
    'RTO billed': R(rto), 'RTO Frido': R(frto), 'RTO variance': R(rto - frto),
    'COD billed': R(cod), 'COD Frido': hasFCOD ? R(fcod) : null,
    'COD variance': hasFCOD ? R(cod - fcod) : null,
    'DTO billed': R(dto), 'DTO Frido': R(fdto), 'DTO variance': R(dto - fdto),
    // Headline totals come from the file's own gross_amount / Frido_total, which include
    // FSC and every other line item. The per-charge columns above are the breakdown only
    // and will not sum to these.
    'Total billed': hasTotals ? R(gross) : R(dl + rto + cod + dto),
    'Total Frido': hasTotals ? R(ftot) : R(fdl + frto + fdto + (hasFCOD ? fcod : cod)),
    'Total variance': hasTotals ? R(gross - ftot) : R((dl + rto + cod + dto) - (fdl + frto + fdto + (hasFCOD ? fcod : cod))),
    "File's own Diff": pick.file_diff ? R(fdiff) : null,
    Note: hasTotals ? '' : 'no gross/Frido_total - variance derived from charge columns',
  })
}

const T = k => R(summary.reduce((a, s) => a + NUM(s[k]), 0))
summary.push({
  Service: 'TOTAL', Shipments: summary.reduce((a, s) => a + s.Shipments, 0),
  'Freight billed': T('Freight billed'), 'Freight Frido': T('Freight Frido'), 'Freight variance': T('Freight variance'),
  'RTO billed': T('RTO billed'), 'RTO Frido': T('RTO Frido'), 'RTO variance': T('RTO variance'),
  'COD billed': T('COD billed'), 'COD Frido': T('COD Frido'), 'COD variance': T('COD variance'),
  'DTO billed': T('DTO billed'), 'DTO Frido': T('DTO Frido'), 'DTO variance': T('DTO variance'),
  "File's own Diff": T("File's own Diff"),
  'Total billed': T('Total billed'), 'Total Frido': T('Total Frido'), 'Total variance': T('Total variance'),
  Note: '',
})

// ── by product ───────────────────────────────────────────────────────────────────
const byProd = new Map()
for (const r of allRows) {
  const k = r.Sub_cat || '(no product)'
  if (!byProd.has(k)) byProd.set(k, { p: k, n: 0, ds: 0, fs: 0, dsN: 0, fsN: 0, billed: 0, frido: 0 })
  const e = byProd.get(k)
  e.n++
  if (r['del. Slab wt'] != null) { e.ds += r['del. Slab wt']; e.dsN++ }
  if (r.Min != null) { e.fs += r.Min; e.fsN++ }
  // Prefer the file's own gross/Frido totals; fall back to the charge columns only when
  // the source file has none.
  if (r.gross_amount != null && r.Frido_total != null) { e.billed += r.gross_amount; e.frido += r.Frido_total }
  else {
    e.billed += r.charge_DL + r.charge_RTO + r.charge_COD + r.charge_DTO
    e.frido += r.frido_charge_dl + r.frido_charge_RTO + (r.frido_charge_DTO ?? r.charge_DTO) + (r.frido_charge_COD ?? r.charge_COD)
  }
}
const prodRows = [...byProd.values()]
  .map(e => ({
    Product: e.p, Shipments: e.n,
    'Their avg slab kg': e.dsN ? R(e.ds / e.dsN / 1000) : null,
    'Our avg slab kg': e.fsN ? R(e.fs / e.fsN / 1000) : null,
    Billed: R(e.billed), Frido: R(e.frido), Variance: R(e.billed - e.frido),
  }))
  .sort((a, b) => b.Variance - a.Variance)

const nb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(nb, XLSX.utils.json_to_sheet(summary), 'Summary')
XLSX.utils.book_append_sheet(nb, XLSX.utils.json_to_sheet(allRows), 'All Shipments')
XLSX.utils.book_append_sheet(nb, XLSX.utils.json_to_sheet(prodRows), 'By Product')
if (ratesSheet) XLSX.utils.book_append_sheet(nb, ratesSheet, 'Rates')
XLSX.writeFile(nb, OUT)

const F = n => '₹' + Math.round(NUM(n)).toLocaleString('en-IN')
console.log('\n' + 'service'.padEnd(10) + 'rows'.padStart(8) + 'billed'.padStart(14) + 'frido'.padStart(14) + 'variance'.padStart(13))
for (const s of summary) {
  console.log((s.Service === 'TOTAL' ? '─'.repeat(10) + '\nTOTAL' : s.Service).padEnd(10) +
    String(s.Shipments).padStart(8) + F(s['Total billed']).padStart(14) +
    F(s['Total Frido']).padStart(14) + F(s['Total variance']).padStart(13))
}
if (gaps.length) { console.log('\ncolumn gaps:'); for (const g of gaps) console.log('  ' + g) }
console.log('\nsheets: Summary · All Shipments (' + allRows.length + ') · By Product (' + prodRows.length + ')' + (ratesSheet ? ' · Rates' : ''))
console.log('written: ' + OUT)
