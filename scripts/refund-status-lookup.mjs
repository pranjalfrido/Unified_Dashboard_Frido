// Looks up the current refund status for a list of orders in Clickpost_Returns_Exchange_Report.
//
// Matching: the returns table keys on forward_order_id, which carries the Shopify order name
// (#MF...). Orders are matched on that, then on awb and forward_awb as fallbacks, because a
// few rows carry the AWB where the order id is blank.
//
// An order can have several return lines (multi-item, or a re-raised request), so the output
// has one row per return line plus a one-row-per-order rollup that takes the WORST status -
// if any line is unpaid the order is not settled, whatever the others say.
import XLSX from 'xlsx'
import { BigQuery } from '@google-cloud/bigquery'

const SRC = process.argv[2] || 'c:/Users/TusharGupta/OneDrive - Arcatron Mobility Pvt Ltd/return orders.xlsx'
const OUT = process.argv[3] || '../return_orders_refund_status.xlsx'

const bq = new BigQuery({ keyFilename: 'sa_key.json', projectId: 'frido-429506' })
const N = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const R = n => Math.round(n * 100) / 100

const wb = XLSX.readFile(SRC)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
const orders = [...new Set(rows.map(r => String(r.order_name ?? '').trim()).filter(Boolean))]
console.log(`input: ${rows.length} rows, ${orders.length} distinct orders`)

// Keep the source's own view so the output can be compared against it.
const srcByOrder = new Map()
for (const r of rows) {
  const k = String(r.order_name ?? '').trim()
  if (!k || srcByOrder.has(k)) continue
  srcByOrder.set(k, {
    order_date_ist: r.order_date_ist ?? null,
    shopify_refund_txn: r.refund_transaction_status ?? null,
    shopify_refunds_created_at: r.refunds_created_at ?? null,
    financial_status: r.financial_status ?? null,
    fulfillment_shipment_status: r.fulfillment_shipment_status ?? null,
    waybill: r.waybill ?? null,
  })
}

const SQL = `
WITH ids AS (SELECT o FROM UNNEST(@orders) o)
SELECT
  i.o AS order_name,
  r.awb, r.forward_awb, r.forward_order_id,
  r.Return_Type, r.order_type, r.courier_partner,
  r.return_status, r.refund_status,
  r.return_reason, r.sub_reason, r.return_sku, r.item_description,
  r.refund_method, r.requested_refund_mode, r.utr, r.payout_id,
  SAFE_CAST(r.refundable_amount AS FLOAT64) AS refundable_amount,
  SAFE_CAST(r.refunded_amount AS FLOAT64) AS refunded_amount,
  r.clickpost_unified_status AS shipment_status,
  r.request_created_on, r.approved_on, r.refund_initiated_on, r.refund_processed_on,
  r.closed_on, r.rejected_on, r.rejection_reason, r.comments,
  DATE_DIFF(CURRENT_DATE(),
    COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(r.refund_initiated_on,1,10)),
             SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(r.request_created_on,1,10)),
             SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(r.created_at,1,10))), DAY) AS age_days
FROM ids i
JOIN \`frido-429506.production.Clickpost_Returns_Exchange_Report\` r
  ON i.o = r.forward_order_id OR i.o = r.awb OR i.o = r.forward_awb`

const [found] = await bq.query({ query: SQL, params: { orders } })
console.log(`matched in returns table: ${found.length} return lines`)

// Plain-English status, so the sheet is readable without knowing the raw codes.
const verdict = r => {
  const rs = String(r.refund_status ?? '').trim()
  const st = String(r.return_status ?? '').trim()
  if (rs === 'Processed') return 'Refunded'
  if (rs === 'Failed') return 'Refund FAILED - retry needed'
  if (rs === 'Initiated') return 'Refund initiated, not completed'
  if (rs === 'Queued') return 'Refund queued'
  if (st === 'AUTO_REFUND_BLOCK') return 'Blocked - manual review'
  if (st === 'REFUND_PENDING') return 'Refund pending'
  if (String(r.Return_Type ?? '').toUpperCase() === 'EXCHANGE') return 'Exchange - no refund due'
  if (st === 'CLOSED' || st === 'SUCCESS') return 'Closed, no refund recorded'
  return st || 'Unknown'
}
// Worst-first, so an order's rollup reflects its least-settled line.
const SEVERITY = {
  'Refund FAILED - retry needed': 1, 'Blocked - manual review': 2,
  'Refund initiated, not completed': 3, 'Refund queued': 4, 'Refund pending': 5,
  'Closed, no refund recorded': 6, 'Unknown': 7,
  'Exchange - no refund due': 8, 'Refunded': 9,
}

const lines = found.map(r => {
  const src = srcByOrder.get(r.order_name) || {}
  return {
    order_name: r.order_name,
    'Refund status': verdict(r),
    return_status: r.return_status,
    refund_status: r.refund_status ?? '(none)',
    Return_Type: r.Return_Type,
    order_type: r.order_type,
    refundable_amount: R(N(r.refundable_amount)),
    refunded_amount: R(N(r.refunded_amount)),
    outstanding: R(N(r.refundable_amount) - N(r.refunded_amount)),
    age_days: r.age_days,
    awb: r.awb,
    courier_partner: r.courier_partner,
    shipment_status: r.shipment_status,
    return_sku: r.return_sku,
    item_description: r.item_description,
    return_reason: r.return_reason,
    sub_reason: r.sub_reason,
    refund_method: r.refund_method,
    requested_refund_mode: r.requested_refund_mode,
    utr: r.utr,
    payout_id: r.payout_id,
    request_created_on: r.request_created_on,
    refund_initiated_on: r.refund_initiated_on,
    refund_processed_on: r.refund_processed_on,
    closed_on: r.closed_on,
    rejection_reason: r.rejection_reason,
    comments: r.comments,
    shopify_refund_txn: src.shopify_refund_txn ?? null,
    shopify_financial_status: src.financial_status ?? null,
  }
})

// One row per order, worst line wins.
const byOrder = new Map()
for (const l of lines) {
  const cur = byOrder.get(l.order_name)
  if (!cur || SEVERITY[l['Refund status']] < SEVERITY[cur['Refund status']]) {
    byOrder.set(l.order_name, { ...l })
  }
}
// Sum money across every line of the order, not just the worst one.
for (const [k, v] of byOrder) {
  const all = lines.filter(l => l.order_name === k)
  v.return_lines = all.length
  v.refundable_amount = R(all.reduce((a, l) => a + l.refundable_amount, 0))
  v.refunded_amount = R(all.reduce((a, l) => a + l.refunded_amount, 0))
  v.outstanding = R(v.refundable_amount - v.refunded_amount)
}

// Orders in the file with no return record at all.
const missing = orders.filter(o => !byOrder.has(o)).map(o => ({
  order_name: o, 'Refund status': 'No return record in Clickpost',
  ...(srcByOrder.get(o) || {}),
}))

const summary = (() => {
  const m = new Map()
  for (const v of byOrder.values()) {
    const k = v['Refund status']
    if (!m.has(k)) m.set(k, { 'Refund status': k, Orders: 0, Refundable: 0, Refunded: 0, Outstanding: 0, AvgAge: 0, n: 0 })
    const e = m.get(k)
    e.Orders++; e.Refundable += v.refundable_amount; e.Refunded += v.refunded_amount
    e.Outstanding += v.outstanding; e.AvgAge += N(v.age_days); e.n++
  }
  const out = [...m.values()].map(e => ({
    'Refund status': e['Refund status'], Orders: e.Orders,
    Refundable: R(e.Refundable), Refunded: R(e.Refunded), Outstanding: R(e.Outstanding),
    'Avg age (days)': e.n ? Math.round(e.AvgAge / e.n) : null,
  })).sort((a, b) => b.Outstanding - a.Outstanding || b.Orders - a.Orders)
  out.push({
    'Refund status': 'No return record in Clickpost', Orders: missing.length,
    Refundable: null, Refunded: null, Outstanding: null, 'Avg age (days)': null,
  })
  const tR = out.reduce((a, r) => a + N(r.Refundable), 0)
  const tD = out.reduce((a, r) => a + N(r.Refunded), 0)
  const tO = out.reduce((a, r) => a + N(r.Outstanding), 0)
  out.push({
    'Refund status': 'TOTAL', Orders: byOrder.size + missing.length,
    Refundable: R(tR), Refunded: R(tD), Outstanding: R(tO), 'Avg age (days)': null,
  })
  return out
})()

const out = XLSX.utils.book_new()
const add = (n, r) => XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(r.length ? r : [{ note: 'none' }]), n)
add('Summary', summary)
add('By Order', [...byOrder.values()].sort((a, b) => b.outstanding - a.outstanding))
add('All Return Lines', lines.sort((a, b) => b.outstanding - a.outstanding))
add('No Return Record', missing)
XLSX.writeFile(out, OUT)

const F = n => 'Rs' + Math.round(n).toLocaleString('en-IN')
console.log(`\norders matched: ${byOrder.size} · no return record: ${missing.length}`)
console.log('\nstatus'.padEnd(36) + 'orders'.padStart(8) + 'outstanding'.padStart(16) + 'avg age'.padStart(9))
for (const s of summary) {
  console.log(String(s['Refund status']).padEnd(35) + String(s.Orders).padStart(8) +
    (s.Outstanding === null ? '-' : F(s.Outstanding)).padStart(16) +
    (s['Avg age (days)'] === null ? '-' : String(s['Avg age (days)']) + 'd').padStart(9))
}
console.log('\nwritten: ' + OUT)
