// Checks for the 'fast' phase's <channel>.resolvedAgg (api/_resolvedAgg.js), which replaces the
// per-SKU-per-day resolvedDailySKU rows in fast. Used by replay-parity.mjs and live-parity.mjs.
//  1. every resolvedDailySKU row's gross / totalReturnRev is a finite number (so the Overview's
//     `x.gross || 0` and the tabs' `s + r.gross` accumulate the same values)
//  2. fast's resolvedAgg is byte-identical (JSON) to the reduction of the full response's rows
//  3. the Overview Return % the page shows from the reduction equals, exactly, what it shows from
//     the rows (the original resolvedReturnPct code, copied verbatim)
import { computeResolvedAgg, computeCombinedAgg, computeResolvedAggDetail } from '../../api/_resolvedAgg.js'

const resolvedReturnPct = (rows, subChFilterFn) => { // src/App.jsx OverviewPage, verbatim
  const filtered = subChFilterFn ? (rows || []).filter(subChFilterFn) : (rows || [])
  if (!filtered.length) return null
  const gross = filtered.reduce((s, x) => s + (x.gross || 0), 0)
  if (gross <= 0) return null
  const returnRev = filtered.reduce((s, x) => s + (x.totalReturnRev || 0), 0)
  return returnRev / gross * 100
}
const aggReturnPct = a => (!a || !a.n || a.gross <= 0) ? null : a.totalReturnRev / a.gross * 100 // src/App.jsx, verbatim

export function checkAggs(fast, full) {
  const problems = []
  let channels = 0
  for (const [ch, obj] of Object.entries(full)) {
    const rows = obj?.resolvedDailySKU
    if (!Array.isArray(rows)) continue
    channels++
    const bad = rows.filter(r => !Number.isFinite(r.gross) || !Number.isFinite(r.totalReturnRev)).length
    if (bad) problems.push(`${ch}: ${bad} rows with non-finite gross/totalReturnRev`)
    const want = computeResolvedAgg(rows, { notIntl: ch === 'shopify' })
    const got = { ...(fast[ch]?.resolvedAgg || {}) }
    const gotPlusVC = got.plusVC; delete got.plusVC
    if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${ch}.resolvedAgg != reduction of full rows`)
    if (Array.isArray(fast[ch]?.resolvedDailySKU) && fast[ch].resolvedDailySKU.length) problems.push(`${ch}.resolvedDailySKU rows still shipped in fast`)
    const fromRows = ch === 'shopify' ? resolvedReturnPct(rows, x => x.subChannel !== 'shopify international') : ch === 'amzSC' ? resolvedReturnPct(rows.concat(full.amzVC?.resolvedDailySKU || [])) : resolvedReturnPct(rows)
    const fromAgg = aggReturnPct(ch === 'shopify' ? fast[ch]?.resolvedAgg?.notIntl : ch === 'amzSC' ? gotPlusVC : fast[ch]?.resolvedAgg)
    if (fromRows !== fromAgg && !(fromRows == null && fromAgg == null)) problems.push(`${ch}: Overview Return % rows=${fromRows} agg=${fromAgg}`)
    if (ch === 'amzSC' && JSON.stringify(gotPlusVC) !== JSON.stringify(computeCombinedAgg(rows, full.amzVC?.resolvedDailySKU))) problems.push('amzSC.resolvedAgg.plusVC mismatch')
  }
  return { channels, problems }
}

// resolvedAgg / resolvedAggDetail are phase-only (not part of the full response): leave it out of field-by-field comparisons
export const isAggUnit = k => k.endsWith('.resolvedAgg') || k.endsWith('.resolvedAggDetail')

// sales_detail's <channel>.resolvedAggDetail must be byte-identical to the reduction of the full rows,
// and sales_detail must not ship the rows themselves.
export function checkAggDetails(sales, full) {
  const problems = []
  let channels = 0
  for (const [ch, obj] of Object.entries(full)) {
    const rows = obj?.resolvedDailySKU
    if (!Array.isArray(rows)) continue
    channels++
    if (JSON.stringify(sales?.[ch]?.resolvedAggDetail) !== JSON.stringify(computeResolvedAggDetail(ch, rows))) problems.push(`${ch}.resolvedAggDetail != reduction of full rows`)
    if (sales?.[ch]?.resolvedDailySKU) problems.push(`${ch}.resolvedDailySKU rows shipped in sales_detail`)
  }
  return { channels, problems }
}

// The frontend's ORIGINAL row-based expressions (copied from src/App.jsx before this change) vs the
// values the new code reads from the shipped reductions — must be identical (===), not close.
export function checkFrontendEquivalence(fast, sales, full) {
  const problems = []
  const eq = (label, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) problems.push(`${label}: rows=${JSON.stringify(a)?.slice(0, 80)} agg=${JSON.stringify(b)?.slice(0, 80)}`) }
  const c = (r, k) => r.components?.[k]?.rev || 0
  const sums = rows => ({ gross: rows.reduce((s, r) => s + r.gross, 0), ret: rows.reduce((s, r) => s + r.totalReturnRev, 0), rto: rows.reduce((s, r) => s + (r.components?.rto?.rev || 0), 0), cir: rows.reduce((s, r) => s + (r.components?.cir?.rev || 0), 0), cancel: rows.reduce((s, r) => s + (r.components?.cancel?.rev || 0), 0), exch: rows.reduce((s, r) => s + (r.components?.exchange?.rev || 0), 0), retc: rows.reduce((s, r) => s + (r.components?.return?.rev || 0), 0) })
  const fromAgg = a => ({ gross: a.gross, ret: a.totalReturnRev, rto: a.rto, cir: a.cir, cancel: a.cancel, exch: a.exchange, retc: a.return })
  const trend = (rows, rtoWithReturn) => { const byDate = {}; rows.forEach(r => { const d = byDate[r.date] || (byDate[r.date] = { gross: 0, rtoRev: 0, cirRev: 0, cancelRev: 0, exchRev: 0 }); d.gross += r.gross; d.rtoRev += rtoWithReturn ? (c(r, 'rto') + c(r, 'return')) : c(r, 'rto'); d.cirRev += c(r, 'cir'); d.cancelRev += c(r, 'cancel'); d.exchRev += c(r, 'exchange') }); return byDate }
  const trendAgg = (a, rtoWithReturn) => Object.fromEntries(Object.entries(a.byDate).map(([d, v]) => [d, { gross: v.gross, rtoRev: rtoWithReturn ? v.rtoRetRev : v.rtoRev, cirRev: v.cirRev, cancelRev: v.cancelRev, exchRev: v.exchRev }]))
  const skuTotal = rows => { const m = {}; rows.forEach(r => { m[r.sku] = (m[r.sku] || 0) + r.totalReturnRev }); return m }
  const skuTotalAgg = bySku => Object.fromEntries(Object.entries(bySku || {}).map(([k, v]) => [k, v.totalReturnRev]))
  for (const ch of ['shopify', 'ebo', 'amzSC', 'amzVC', 'flipkart', 'cred', 'firstcry', 'myntra']) {
    const rows = full[ch]?.resolvedDailySKU
    if (!Array.isArray(rows)) continue
    eq(`${ch} sums`, sums(rows), fromAgg(fast[ch].resolvedAgg))
    eq(`${ch} per-SKU return`, skuTotal(rows), skuTotalAgg(sales[ch]?.resolvedAggDetail?.bySku))
  }
  const sh = full.shopify?.resolvedDailySKU || []
  eq('shopify trend', trend(sh, false), trendAgg(fast.shopify.resolvedAgg, false))
  for (const sc of ['myfrido', 'mobility']) {
    const rs = sh.filter(r => r.subChannel === sc)
    const g = sales.shopify?.resolvedAggDetail?.bySubChannel?.[sc] || computeResolvedAgg([])
    eq(`shopify ${sc} sums`, sums(rs), fromAgg(g)); eq(`shopify ${sc} trend`, trend(rs, false), trendAgg(g, false))
  }
  const eb = full.ebo?.resolvedDailySKU || []
  eq('ebo trend', trend(eb, true), trendAgg(fast.ebo.resolvedAgg, true))
  const eboSku = {}; eb.forEach(r => { const s = eboSku[r.sku] || (eboSku[r.sku] = { rtoRev: 0, cirRev: 0, cancelRev: 0, exchRev: 0 }); s.rtoRev += c(r, 'rto') + c(r, 'return'); s.cirRev += c(r, 'cir'); s.cancelRev += c(r, 'cancel'); s.exchRev += c(r, 'exchange') })
  eq('ebo per-SKU', eboSku, Object.fromEntries(Object.entries(sales.ebo?.resolvedAggDetail?.bySku || {}).map(([k, v]) => [k, { rtoRev: v.rtoRetRev, cirRev: v.cirRev, cancelRev: v.cancelRev, exchRev: v.exchRev }])))
  const sc = full.amzSC?.resolvedDailySKU || []
  const scSku = {}; sc.forEach(r => { const s = scSku[r.sku] || (scSku[r.sku] = { rtoRev: 0, cirRev: 0, cancelRev: 0, returnRev: 0 }); s.rtoRev += c(r, 'rto'); s.cirRev += c(r, 'cir'); s.cancelRev += c(r, 'cancel'); s.returnRev += c(r, 'return') })
  eq('amzSC per-SKU', scSku, Object.fromEntries(Object.entries(sales.amzSC?.resolvedAggDetail?.bySku || {}).map(([k, v]) => [k, { rtoRev: v.rtoRev, cirRev: v.cirRev, cancelRev: v.cancelRev, returnRev: v.returnRev }])))
  const fk = full.flipkart?.resolvedDailySKU || []
  const fkByDate = {}; fk.forEach(r => { fkByDate[r.date] = (fkByDate[r.date] || 0) + r.totalReturnRev })
  eq('flipkart by-date return', fkByDate, Object.fromEntries(Object.entries(fast.flipkart.resolvedAgg.byDate).map(([d, v]) => [d, v.totalReturnRev])))
  const cats = [...new Set(fk.map(r => r.category))].slice(0, 3)
  for (const cat of cats) {
    const rs = fk.filter(r => r.category === cat), g = sales.flipkart?.resolvedAggDetail?.byCat?.[cat]
    eq(`flipkart cat ${cat}`, [sums(rs), skuTotal(rs)], [fromAgg(g), skuTotalAgg(g?.bySku)])
    const sub = rs[0]?.subCategory, rs2 = rs.filter(r => r.subCategory === sub), g2 = sales.flipkart?.resolvedAggDetail?.bySubCat?.[`${cat}::${sub}`]
    eq(`flipkart sub ${cat}::${sub}`, [sums(rs2), skuTotal(rs2)], [fromAgg(g2), skuTotalAgg(g2?.bySku)])
  }
  return problems
}
