// Verifies the Flipkart SnD ratecard is internally consistent AND that the live api/bq.js
// Flipkart block applies it correctly to real orders. Run manually after any change to
// generate-flipkart-snd-ratecard.mjs or the apply-time logic in api/_sndRates.js / api/bq.js:
//   node scripts/verify-flipkart-snd-ratecard.mjs
// Exits non-zero (and prints actual vs. expected) if either check misses tolerance.

import { readFileSync } from 'fs'

const TOLERANCE_PP = 0.75 // percentage-point tolerance vs. the manually-verified reference figures
let failed = false

function check(label, actual, expected, tolerance = TOLERANCE_PP) {
  const diff = Math.abs(actual - expected)
  const ok = diff <= tolerance
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: actual=${actual.toFixed(2)}  expected=${expected.toFixed(2)}  diff=${diff.toFixed(2)}pp (tolerance ${tolerance}pp)`)
  if (!ok) failed = true
}

console.log('=== Step 1: ratecard internal consistency vs. manually-verified reference (Mar-Jun 2026) ===')

const ratecard = JSON.parse(readFileSync('public/flipkart-snd-ratecard.json', 'utf8'))
const MAR_JUN = new Set(['2026-03', '2026-04', '2026-05', '2026-06'])

const measured = ratecard.cells.filter(c => MAR_JUN.has(c.month))
const measuredNetSales = measured.reduce((s, c) => s + c.netSales, 0)
const measuredCost = measured.reduce((s, c) => s + c.allInExpense, 0)
const measuredPct = measuredNetSales > 0 ? (measuredCost / measuredNetSales) * 100 : 0

check('Measured (profit_and_loss-covered) all-in SnD%, Mar-Jun 2026', measuredPct, 24.26)

console.log(`  (measured net sales: Rs ${measuredNetSales.toLocaleString('en-IN')}, cost: Rs ${measuredCost.toLocaleString('en-IN')})`)

console.log()
console.log('=== Step 2: live api/bq.js Flipkart block vs. the ratecard ===')

const { default: handler } = await import('../api/bq.js')

async function callHandler(start, end) {
  let body = null, status = 200
  const fakeReq = { method: 'POST', body: { start, end } }
  const fakeRes = {
    setHeader() { return this },
    status(c) { status = c; return this },
    json(b) { body = b; return this },
    end() { return this },
  }
  await handler(fakeReq, fakeRes)
  if (status !== 200) throw new Error(`Handler returned status ${status}: ${JSON.stringify(body)}`)
  return body
}

// Check month-by-month (the live handler takes one date range per call; Mar-Jun as a single
// range would double-count nothing since sndBySku sums are additive across the range, but
// comparing per-month lets us catch a month-specific regression rather than only an average).
let liveTotalSnd = 0, liveTotalNet = 0
for (const [start, end] of [
  ['2026-03-01', '2026-03-31'],
  ['2026-04-01', '2026-04-30'],
  ['2026-05-01', '2026-05-31'],
  ['2026-06-01', '2026-06-30'],
]) {
  const body = await callHandler(start, end)
  const fk = body?.flipkart
  if (!fk) { console.log(`  FAIL  no flipkart block returned for ${start}..${end}`); failed = true; continue }
  const snd = Object.values(fk.sndBySku || {}).reduce((a, b) => a + b, 0)
  const net = fk.netCalc?.netRev || 0
  liveTotalSnd += snd
  liveTotalNet += net
  console.log(`  ${start.slice(0, 7)}: live SnD=Rs ${Math.round(snd).toLocaleString('en-IN')}  netRev=Rs ${Math.round(net).toLocaleString('en-IN')}  pct=${net > 0 ? (snd / net * 100).toFixed(2) : 'n/a'}%`)
}

const livePct = liveTotalNet > 0 ? (liveTotalSnd / liveTotalNet) * 100 : 0
check('Live handler all-in SnD% (sndBySku / netCalc.netRev), Mar-Jun 2026', livePct, 24.26, 2.5)
// Wider tolerance here: netCalc.netRev uses a slightly different net-revenue convention
// (order-date windowed, GST-adjusted via computeNetRevenueMeasures) than the ratecard's own
// aggregated netSales denominator — some divergence is expected, this check is a sanity
// cross-check that the live number is in the right neighborhood, not a byte-for-byte match.

console.log()
if (failed) {
  console.log('VERIFICATION FAILED — see FAIL lines above.')
  process.exit(1)
} else {
  console.log('All checks passed.')
  process.exit(0)
}
