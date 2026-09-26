// Exports the RAW Clickpost_Returns_Exchange_Report rows for a supplied list of order ids.
//
// No derived columns, no verdicts, no filtering - every column exactly as BigQuery holds it,
// so the file can be audited independently of any interpretation this repo has applied.
//
// Matching is on forward_order_id first, then awb / forward_awb, because a handful of rows
// carry the AWB where the order id is blank.
import XLSX from 'xlsx'
import { BigQuery } from '@google-cloud/bigquery'

const SRC = process.argv[2] || 'c:/Users/TusharGupta/OneDrive - Arcatron Mobility Pvt Ltd/return orders.xlsx'
const OUT = process.argv[3] || '../clickpost_RnE_raw_for_shared_orders.xlsx'

const bq = new BigQuery({ keyFilename: 'sa_key.json', projectId: 'frido-429506' })

const wb = XLSX.readFile(SRC)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
const orders = [...new Set(rows.map(r => String(r.order_name ?? '').trim()).filter(Boolean))]
console.log(`input file: ${rows.length} rows, ${orders.length} distinct order ids`)

// SELECT * keeps every column, including ones this repo has never looked at.
const SQL = `
SELECT r.*
FROM \`frido-429506.production.Clickpost_Returns_Exchange_Report\` r
WHERE r.forward_order_id IN UNNEST(@orders)
   OR r.awb IN UNNEST(@orders)
   OR r.forward_awb IN UNNEST(@orders)`

const [found] = await bq.query({ query: SQL, params: { orders } })
console.log(`RnE rows returned: ${found.length}`)

// BigQuery hands back NUMERIC as a Big object and DATE as {value}; both serialise to null
// in xlsx. Flatten to primitives so every cell survives the write.
const flat = found.map(r => {
  const o = {}
  for (const [k, v] of Object.entries(r)) {
    if (v === null || v === undefined) { o[k] = null; continue }
    if (typeof v === 'object') {
      if ('value' in v) o[k] = v.value                 // DATE / TIMESTAMP wrapper
      else if (typeof v.toNumber === 'function') o[k] = v.toNumber()
      else o[k] = String(v)
    } else o[k] = v
  }
  return o
})

const matched = new Set()
for (const r of flat) {
  for (const k of ['forward_order_id', 'awb', 'forward_awb']) {
    const v = String(r[k] ?? '').trim()
    if (v && orders.includes(v)) matched.add(v)
  }
}
const missing = orders.filter(o => !matched.has(o)).map(o => ({ order_name: o }))

const out = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(flat), 'RnE Raw')
XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(
  missing.length ? missing : [{ order_name: '(all order ids matched)' }]), 'Not In RnE')
XLSX.writeFile(out, OUT)

console.log(`order ids matched : ${matched.size}`)
console.log(`order ids missing : ${missing.length}`)
console.log(`columns           : ${flat.length ? Object.keys(flat[0]).length : 0}`)
console.log('written: ' + OUT)
