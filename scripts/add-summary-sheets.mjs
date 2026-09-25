// Adds the reporting sheets to the order-status workbook: a one-page Overview, an ageing
// profile of the unrefunded exposure, and a courier rollup of stuck shipments.
//
// These are derived from the sheets the analysis already wrote, so the file stays internally
// consistent - no second trip to BigQuery, no risk of the tabs disagreeing.
import XLSX from 'xlsx'

const FILE = process.argv[2] || '../order_status_analysis_aug_sep26.xlsx'
const N = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const R = n => Math.round(n * 100) / 100

const wb = XLSX.readFile(FILE)
const get = name => XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null })
const funnel = get('Funnel')
const unresolved = get('Unresolved Summary')
const stuck = get('Stuck In Flight')
const detail = get('Unresolved Detail')

const totValue = funnel.reduce((a, r) => a + N(r.order_value), 0)
const totLines = funnel.reduce((a, r) => a + N(r.line_items), 0)
const delivered = funnel.find(r => r.Final_status === 'Delivered')
const unrefTotal = unresolved.reduce((a, r) => a + N(r.unrefunded), 0)

// ── Funnel with share, which the raw sheet does not carry ──
const funnelOut = funnel
  .map(r => ({
    Status: r.Final_status,
    'Line items': N(r.line_items),
    Orders: N(r.orders),
    Units: N(r.units),
    'Order value': R(N(r.order_value)),
    'Share of value %': R((N(r.order_value) / totValue) * 100),
    Refunded: R(N(r.refunded)),
    'Avg age (days)': N(r.avg_age_days),
  }))
  .sort((a, b) => b['Order value'] - a['Order value'])
funnelOut.push({
  Status: 'TOTAL', 'Line items': totLines,
  Orders: null, Units: null,
  'Order value': R(totValue), 'Share of value %': 100,
  Refunded: R(funnel.reduce((a, r) => a + N(r.refunded), 0)), 'Avg age (days)': null,
})

// ── Ageing of the unrefunded exposure ──
// Bucketed from the row-level detail: the summary sheet only carries an average age, which
// hides whether the money is genuinely in-flight or long overdue.
const BUCKETS = [
  { k: '0-7 days (in flight)', lo: -1, hi: 7 },
  { k: '8-15 days', lo: 7, hi: 15 },
  { k: '16-30 days', lo: 15, hi: 30 },
  { k: '31-45 days', lo: 30, hi: 45 },
  { k: 'Over 45 days', lo: 45, hi: 1e9 },
]
const ageRows = BUCKETS.map(b => {
  const rows = detail.filter(r => N(r.age_days) > b.lo && N(r.age_days) <= b.hi)
  const v = rows.reduce((a, r) => a + N(r.unrefunded), 0)
  return {
    'Age bucket': b.k,
    'Line items': rows.length,
    Orders: new Set(rows.map(r => r.order_name)).size,
    Unrefunded: R(v),
    'Share %': 0,
    'Needs action': b.lo >= 7 ? 'Yes' : 'No',
  }
})
const ageTotal = ageRows.reduce((a, r) => a + r.Unrefunded, 0)
for (const r of ageRows) r['Share %'] = R((r.Unrefunded / (ageTotal || 1)) * 100)
ageRows.push({
  'Age bucket': 'TOTAL', 'Line items': ageRows.reduce((a, r) => a + r['Line items'], 0),
  Orders: null, Unrefunded: R(ageTotal), 'Share %': 100, 'Needs action': '',
})
ageRows.push({
  'Age bucket': 'Over 15 days (overdue)', 'Line items': null, Orders: null,
  Unrefunded: R(ageRows.filter(r => /16-30|31-45|Over 45/.test(r['Age bucket']))
    .reduce((a, r) => a + r.Unrefunded, 0)),
  'Share %': null, 'Needs action': 'Yes',
})

// ── Stuck shipments by courier ──
const byCourier = new Map()
for (const r of stuck) {
  const k = r.courier || '(no courier assigned)'
  if (!byCourier.has(k)) byCourier.set(k, { k, lines: 0, orders: 0, v: 0, age: 0, n: 0 })
  const e = byCourier.get(k)
  e.lines += N(r.line_items); e.orders += N(r.orders); e.v += N(r.order_value)
  e.age += N(r.avg_age_days) * N(r.line_items); e.n += N(r.line_items)
}
const courierRows = [...byCourier.values()]
  .map(e => ({
    Courier: e.k, 'Line items': e.lines, Orders: e.orders,
    'Order value': R(e.v),
    'Avg age (days)': e.n ? Math.round(e.age / e.n) : null,
  }))
  .sort((a, b) => b['Order value'] - a['Order value'])
courierRows.push({
  Courier: 'TOTAL',
  'Line items': courierRows.reduce((a, r) => a + r['Line items'], 0),
  Orders: courierRows.reduce((a, r) => a + r.Orders, 0),
  'Order value': R(courierRows.reduce((a, r) => a + r['Order value'], 0)),
  'Avg age (days)': null,
})

// ── Overview ──
const overdue = ageRows.find(r => r['Age bucket'] === 'Over 15 days (overdue)').Unrefunded
const noStatus = funnel.find(r => r.Final_status === 'No Status Found')
const cancelled = funnel.find(r => r.Final_status === 'Cancelled')
const overview = [
  { Metric: 'Period', Value: 'Aug 1 - Sep 13 2026' },
  { Metric: 'Source', Value: 'Shopify orders + Uniware + Clickpost (forward & reverse)' },
  { Metric: '', Value: '' },
  { Metric: 'ORDER FUNNEL', Value: '' },
  { Metric: 'Total line items', Value: totLines },
  { Metric: 'Total order value', Value: R(totValue) },
  { Metric: 'Delivered value', Value: R(N(delivered?.order_value)) },
  { Metric: 'Delivered share %', Value: R((N(delivered?.order_value) / totValue) * 100) },
  { Metric: 'Not delivered value', Value: R(totValue - N(delivered?.order_value)) },
  { Metric: '', Value: '' },
  { Metric: 'EXPOSURE', Value: '' },
  { Metric: 'Not delivered and not refunded', Value: R(unrefTotal) },
  { Metric: 'Of which over 15 days old', Value: R(overdue) },
  { Metric: 'Refunds actually initiated', Value: 'None - refund_transaction_status is empty on every row' },
  { Metric: '', Value: '' },
  { Metric: 'ONLY VISIBLE IN THIS VIEW (no courier record exists)', Value: '' },
  { Metric: 'No Status Found - value', Value: R(N(noStatus?.order_value)) },
  { Metric: 'Cancelled - value', Value: R(N(cancelled?.order_value)) },
  { Metric: 'Stuck with no courier assigned', Value: R(N(courierRows.find(r => /no courier/.test(r.Courier))?.['Order value'])) },
]

// Overview first, then the two new tables after Funnel; existing sheets keep their data.
const out = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(overview), 'Overview')
XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(funnelOut), 'Funnel')
XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(ageRows), 'Ageing')
XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(courierRows), 'By Courier')
for (const s of ['Unresolved Summary', 'Stuck In Flight', 'By Product', 'Unresolved Detail']) {
  XLSX.utils.book_append_sheet(out, wb.Sheets[s], s)
}
XLSX.writeFile(out, FILE)

const F = n => 'Rs' + Math.round(n).toLocaleString('en-IN')
console.log('sheets: ' + out.SheetNames.join(' · '))
console.log('\nfunnel total      ' + F(totValue))
console.log('unrefunded        ' + F(unrefTotal))
console.log('overdue (>15d)    ' + F(overdue))
console.log('\nageing:')
for (const r of ageRows) console.log('  ' + String(r['Age bucket']).padEnd(24) + F(r.Unrefunded).padStart(16))
console.log('\nwritten: ' + FILE)
