// Small reductions of a channel's resolvedDailySKU rows (the resolved return engine's per-SKU,
// per-day rows — tens of MB per channel for long ranges) holding exactly the figures the Overview
// and Sales pages read: Return % / Net Revenue / RTO / CIR / Cancel / Exchange KPI tiles, per-day
// return trend lines, and the per-SKU resolved revenue the category matrices use.
//
// Shared by both sides so the numbers are bit-identical:
//   * api/_bqPhases.js ships computeResolvedAgg(rows) as <channel>.resolvedAgg in /api/bq's 'fast'
//     phase and computeResolvedAggDetail(...) as <channel>.resolvedAggDetail in 'sales_detail',
//     instead of the rows themselves (the rows ship only with pnl_detail, which needs them).
//   * the frontend uses the rows whenever they are loaded (same functions, same row order) and the
//     shipped reductions otherwise.
// Every accumulator adds in row order starting from 0, with the same expressions the frontend code
// it replaced used (`s + r.gross`, `s + (r.components?.rto?.rev || 0)`, per-day / per-SKU maps built
// with forEach), so a value from a reduction equals the value from the rows exactly.

const comp = (r, k) => r.components?.[k]?.rev || 0

export function computeResolvedAgg(rows, { notIntl = false, bySku = false } = {}) {
  const a = { n: 0, gross: 0, totalReturnRev: 0, rto: 0, cir: 0, cancel: 0, exchange: 0, return: 0, byDate: {} }
  const ni = notIntl ? { n: 0, gross: 0, totalReturnRev: 0 } : null
  const sk = bySku ? {} : null
  for (const r of rows || []) {
    a.n++
    a.gross += r.gross
    a.totalReturnRev += r.totalReturnRev
    a.rto += comp(r, 'rto')
    a.cir += comp(r, 'cir')
    a.cancel += comp(r, 'cancel')
    a.exchange += comp(r, 'exchange')
    a.return += comp(r, 'return')
    const d = a.byDate[r.date] || (a.byDate[r.date] = { gross: 0, totalReturnRev: 0, rtoRev: 0, rtoRetRev: 0, cirRev: 0, cancelRev: 0, exchRev: 0 })
    d.gross += r.gross
    d.totalReturnRev += r.totalReturnRev
    d.rtoRev += comp(r, 'rto')
    d.rtoRetRev += comp(r, 'rto') + comp(r, 'return')
    d.cirRev += comp(r, 'cir')
    d.cancelRev += comp(r, 'cancel')
    d.exchRev += comp(r, 'exchange')
    if (ni && r.subChannel !== 'shopify international') { ni.n++; ni.gross += r.gross || 0; ni.totalReturnRev += r.totalReturnRev || 0 }
    if (sk) {
      const s = sk[r.sku] || (sk[r.sku] = { totalReturnRev: 0, rtoRev: 0, rtoRetRev: 0, cirRev: 0, cancelRev: 0, exchRev: 0, returnRev: 0 })
      s.totalReturnRev += r.totalReturnRev
      s.rtoRev += comp(r, 'rto')
      s.rtoRetRev += comp(r, 'rto') + comp(r, 'return')
      s.cirRev += comp(r, 'cir')
      s.cancelRev += comp(r, 'cancel')
      s.exchRev += comp(r, 'exchange')
      s.returnRev += comp(r, 'return')
    }
  }
  if (ni) a.notIntl = ni
  if (sk) a.bySku = sk
  return a
}

// Overview's Amazon Return %: SC rows followed by VC rows, summed as one sequence.
export function computeCombinedAgg(rowsA, rowsB) {
  const a = { n: 0, gross: 0, totalReturnRev: 0 }
  for (const r of [...(rowsA || []), ...(rowsB || [])]) { a.n++; a.gross += r.gross || 0; a.totalReturnRev += r.totalReturnRev || 0 }
  return a
}

// Rows split by a key, each group in original row order (= the frontend's .filter() result).
function groupRows(rows, keyOf) {
  const g = {}
  for (const r of rows || []) (g[keyOf(r)] ||= []).push(r)
  return g
}

// sales_detail: per-SKU sums for the matrices; Shopify per sub-channel (MyFrido / Mobility view);
// Flipkart per category and per category::sub-category (its category / product filter).
export function computeResolvedAggDetail(ch, rows) {
  const out = { bySku: computeResolvedAgg(rows, { bySku: true }).bySku }
  if (ch === 'shopify') out.bySubChannel = Object.fromEntries(Object.entries(groupRows(rows, r => r.subChannel)).map(([k, rs]) => [k, computeResolvedAgg(rs)]))
  if (ch === 'flipkart') {
    out.byCat = Object.fromEntries(Object.entries(groupRows(rows, r => r.category)).map(([k, rs]) => [k, computeResolvedAgg(rs, { bySku: true })]))
    out.bySubCat = Object.fromEntries(Object.entries(groupRows(rows, r => `${r.category}::${r.subCategory}`)).map(([k, rs]) => [k, computeResolvedAgg(rs, { bySku: true })]))
  }
  return out
}

// ── frontend helpers ─────────────────────────────────────────────────────────────────────────────
const hasRows = ch => !!ch?.resolvedDailySKU?.length

// Totals + per-day sums for a channel: from its rows when loaded, else the shipped reduction.
export function resolvedAggOf(ch, opts) {
  if (hasRows(ch)) return computeResolvedAgg(ch.resolvedDailySKU, opts)
  return ch?.resolvedAgg || computeResolvedAgg([], opts)
}

// The same, restricted to rows matching `filter` (rows loaded), else the matching group of the
// shipped detail reduction (`group` = ['bySubChannel', key] / ['byCat', key] / ['bySubCat', key]).
export function resolvedAggWhere(ch, filter, group, opts) {
  if (hasRows(ch)) return computeResolvedAgg(ch.resolvedDailySKU.filter(filter), opts)
  return ch?.resolvedAggDetail?.[group[0]]?.[group[1]] || computeResolvedAgg([], opts)
}

// Per-SKU resolved sums ({ sku: { totalReturnRev, rtoRev, rtoRetRev, cirRev, cancelRev, exchRev, returnRev } }).
export function resolvedBySkuOf(ch) {
  if (hasRows(ch)) return computeResolvedAgg(ch.resolvedDailySKU, { bySku: true }).bySku
  return ch?.resolvedAggDetail?.bySku || {}
}
