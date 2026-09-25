// Builds a claim-ready dispute sheet from a consolidated Delhivery workbook.
//
// Keeps ONLY rows where Delhivery billed more than the Frido rate card says, and tags each
// with why. Rows that agree, or where Frido's own rate is higher, are dropped - they are not
// part of a claim and only make the sheet harder to work through.
//
// Dispute reasons, in the order they are tested:
//   Weight + Zone   both the billed slab and the billed zone are wrong
//   Weight          billed slab exceeds ours (their weighing is heavy)
//   Zone            billed zone differs from ours on the same slab
//   RTO / COD rate  slab and zone agree, so the gap is a charge-rate issue - most often
//                   RTO billed at 100% of freight where the contract says 90%
//
// Usage: node scripts/build-dispute-sheet.mjs "<consolidated.xlsx>" ["<out.xlsx>"] ["<label>"]
import XLSX from 'xlsx'

const SRC = process.argv[2]
if (!SRC) { console.error('usage: node scripts/build-dispute-sheet.mjs <consolidated.xlsx>'); process.exit(1) }
const OUT = process.argv[3] || SRC.replace(/\.xlsx$/i, ' DISPUTES.xlsx')
const LABEL = process.argv[4] || ''

const N = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const R = n => Math.round(n * 100) / 100
// Heavy bills sub-zones (D1/D2/C1/C2/F); strip the digit so a D1-vs-D comparison is not
// reported as a zone dispute when it is really the same zone.
const baseZone = z => {
  const s = String(z ?? '').trim().toUpperCase().replace(/\d+$/, '')
  return s === 'F' ? 'E' : s
}

// PEAK and DPH are surcharges outside the four rate-carded lines, and they are claimed in
// FULL - on every shipment, not only disputed ones.
//
// The basis: PEAK is levied at a flat Rs2 (Express) / Rs1 (Surface) on 100% of rows, and
// DPH on 100% of Surface rows. A surcharge applied universally is not a peak-season or
// exception charge; it is an unagreed addition to the rate card, so the whole amount is
// contested regardless of whether that shipment's weight and zone were correct.
//
// Because these are claimed wholesale, a shipment can be disputed on surcharge alone - its
// freight, RTO, COD and DTO may all be priced exactly as billed.
const peakOf = r => N(r.charge_PEAK)
const dphOf = r => N(r.charge_DPH)

const wb = XLSX.readFile(SRC)
// A totals row may sit above the header (Excel users often add one), which would otherwise
// be read as the column names and yield a sheet of undefined values.
const grid = XLSX.utils.sheet_to_json(wb.Sheets['All Shipments'], { header: 1, defval: null })
const hdrRow = (grid[0] && grid[0].filter(x => typeof x === 'string' && x.trim()).length > 20) ? 0 : 1
const all = XLSX.utils.sheet_to_json(wb.Sheets['All Shipments'], { defval: null, range: hdrRow })
if (!all.length) throw new Error('no rows in All Shipments')

const disputes = []
let agreed = 0, inOurFavour = 0
for (const r of all) {
  const peak = peakOf(r), dph = dphOf(r)
  const sur = peak + dph
  // Frido side carries ZERO surcharge - the whole amount is claimed back.
  const billed = N(r.charge_DL) + N(r.charge_RTO) + N(r.charge_COD) + N(r.charge_DTO) + sur
  const frido = N(r.frido_charge_dl) + N(r.frido_charge_RTO) + N(r.frido_charge_COD) + N(r.frido_charge_DTO)
  const pricedVar = (billed - sur) - frido
  const variance = billed - frido
  // A row still belongs in the claim if it carries a surcharge, even when its priced lines
  // come out in Delhivery's favour - the surcharge is claimed on 100% of shipments, so
  // excluding those rows would leave part of it unclaimed.
  if (variance <= 0.01 && sur <= 0.01) { if (variance < -0.01) inOurFavour++; else agreed++; continue }
  if (variance <= 0.01) inOurFavour++

  const theirSlab = N(r['del. Slab wt']), ourSlab = N(r.Min)
  const slabDiff = theirSlab > ourSlab
  const theirZone = baseZone(r.zone), ourZone = baseZone(r['zone 2'])
  const zoneDiff = !!theirZone && !!ourZone && theirZone !== ourZone

  // A row whose priced lines all agree is disputed purely on the surcharge.
  let reason
  if (pricedVar <= 0.01) reason = 'Surcharge only'
  else if (slabDiff && zoneDiff) reason = 'Weight + Zone'
  else if (slabDiff) reason = 'Weight'
  else if (zoneDiff) reason = 'Zone'
  else reason = N(r.charge_RTO) > N(r.frido_charge_RTO) ? 'RTO rate'
    : N(r.charge_COD) > N(r.frido_charge_COD) ? 'COD rate'
    : N(r.charge_DTO) > N(r.frido_charge_DTO) ? 'DTO rate' : 'Charge rate'

  disputes.push({
    Month: LABEL,
    Service: r.Service,
    'Dispute reason': reason,
    waybill_num: r.waybill_num,
    order_id: r.order_id ?? null,
    SKU: r.SKU ?? null,
    Product: r.Sub_cat ?? null,
    status: r.status ?? null,
    package_type: r.package_type ?? null,
    destination_pin: r.destination_pin ?? null,
    'Their weight (g)': r.charged_weight == null ? null : N(r.charged_weight),
    'Our weight (g)': r['Frido wt'] == null ? null : N(r['Frido wt']),
    'Their slab (g)': theirSlab || null,
    'Our slab (g)': ourSlab || null,
    'Slab gap (g)': theirSlab && ourSlab ? R(theirSlab - ourSlab) : null,
    'Their zone': r.zone ?? null,
    'Our zone': r['zone 2'] ?? null,
    'Freight billed': R(N(r.charge_DL)), 'Freight Frido': R(N(r.frido_charge_dl)),
    'RTO billed': R(N(r.charge_RTO)), 'RTO Frido': R(N(r.frido_charge_RTO)),
    'COD billed': R(N(r.charge_COD)), 'COD Frido': R(N(r.frido_charge_COD)),
    'DTO billed': R(N(r.charge_DTO)), 'DTO Frido': R(N(r.frido_charge_DTO)),
    'PEAK surcharge': R(peak),
    'DPH charge': R(dph),
    'Variance - priced lines': R(pricedVar),
    'Variance - surcharge': R(sur),
    'Total billed': R(billed), 'Total Frido': R(frido),
    Variance: R(variance),
  })
}
disputes.sort((a, b) => b.Variance - a.Variance)

// ── rollups ──
const roll = (key) => {
  const m = new Map()
  for (const d of disputes) {
    const k = d[key] || '(blank)'
    if (!m.has(k)) m.set(k, { k, n: 0, v: 0 })
    const e = m.get(k); e.n++; e.v += d.Variance
  }
  return [...m.values()].sort((a, b) => b.v - a.v)
}
const rollSplit = key => {
  const m = new Map()
  for (const d of disputes) {
    const k = d[key] || '(blank)'
    if (!m.has(k)) m.set(k, { k, n: 0, priced: 0, peak: 0, dph: 0, v: 0 })
    const e = m.get(k)
    e.n++; e.priced += d['Variance - priced lines']; e.peak += d['PEAK surcharge']
    e.dph += d['DPH charge']; e.v += d.Variance
  }
  return [...m.values()].sort((a, b) => b.v - a.v)
}
const byReason = rollSplit('Dispute reason').map(e => ({
  'Dispute reason': e.k, Shipments: e.n,
  'Priced lines': R(e.priced), PEAK: R(e.peak), DPH: R(e.dph), Variance: R(e.v),
}))
const byService = rollSplit('Service').map(e => ({
  Service: e.k, Shipments: e.n,
  'Priced lines': R(e.priced), PEAK: R(e.peak), DPH: R(e.dph), Variance: R(e.v),
}))
const byProduct = roll('Product').map(e => ({ Product: e.k, Shipments: e.n, Variance: R(e.v) }))

const totalVar = disputes.reduce((a, d) => a + d.Variance, 0)
const totalPriced = disputes.reduce((a, d) => a + d['Variance - priced lines'], 0)
const totalPeak = disputes.reduce((a, d) => a + d['PEAK surcharge'], 0)
const totalDph = disputes.reduce((a, d) => a + d['DPH charge'], 0)
const summary = [
  { Metric: 'Rows in invoice', Value: all.length },
  { Metric: 'Disputed rows', Value: disputes.length },
  { Metric: 'Disputed %', Value: R((disputes.length / all.length) * 100) },
  { Metric: 'Rows priced as billed (no claim)', Value: agreed },
  { Metric: 'Rows where Frido rate is higher (not claimed)', Value: inOurFavour },
  { Metric: '', Value: '' },
  { Metric: 'Total billed on disputed rows', Value: R(disputes.reduce((a, d) => a + d['Total billed'], 0)) },
  { Metric: 'Frido rate on disputed rows', Value: R(disputes.reduce((a, d) => a + d['Total Frido'], 0)) },
  { Metric: '', Value: '' },
  { Metric: 'Claim - freight/RTO/COD/DTO', Value: R(totalPriced) },
  { Metric: 'Claim - PEAK surcharge', Value: R(totalPeak) },
  { Metric: 'Claim - DPH charge', Value: R(totalDph) },
  { Metric: 'CLAIM AMOUNT (ex-GST)', Value: R(totalVar) },
  { Metric: 'CLAIM incl GST @18%', Value: R(totalVar * 1.18) },
]

const nb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(nb, XLSX.utils.json_to_sheet(summary), 'Summary')
XLSX.utils.book_append_sheet(nb, XLSX.utils.json_to_sheet(byReason), 'By Reason')
XLSX.utils.book_append_sheet(nb, XLSX.utils.json_to_sheet(byService), 'By Service')
XLSX.utils.book_append_sheet(nb, XLSX.utils.json_to_sheet(byProduct), 'By Product')
XLSX.utils.book_append_sheet(nb, XLSX.utils.json_to_sheet(disputes), 'Disputed Shipments')
XLSX.writeFile(nb, OUT)

const F = n => '₹' + Math.round(n).toLocaleString('en-IN')
console.log(`rows ${all.length} -> disputed ${disputes.length} (${((disputes.length / all.length) * 100).toFixed(1)}%)`)
console.log(`dropped: ${agreed} agreed, ${inOurFavour} where our rate is higher`)
console.log('\nby reason:')
for (const b of byReason) console.log('  ' + b['Dispute reason'].padEnd(16) + String(b.Shipments).padStart(7) + F(b['Priced lines']).padStart(13) + F(b.PEAK + b.DPH).padStart(11) + F(b.Variance).padStart(13))
console.log('\nby service:')
for (const b of byService) console.log('  ' + b.Service.padEnd(16) + String(b.Shipments).padStart(7) + F(b['Priced lines']).padStart(13) + F(b.PEAK + b.DPH).padStart(11) + F(b.Variance).padStart(13))
console.log('\nCLAIM: ' + F(totalVar))
console.log('written: ' + OUT)
