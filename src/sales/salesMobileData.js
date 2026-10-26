// Pure helpers shared by the desktop Sales tables and the mobile Sales view, so both show the very
// same numbers. No new metrics: everything here is the desktop calculation moved, not rewritten.

// ── Category Revenue Matrix rows (moved verbatim from FlatCategoryProductMatrix, src/App.jsx) ──
// mapRow: one Category / Product / SKU row → gross, net, units and the return components.
export function makeMapRow({ mobilityNetBySubCat = {}, netScale = 1 }) {
  return (d, scName, catName, fallbackGstRatio) => {
    const gross = d.rev || 0
    const excRev = d.excRev || 0
    const cancelRev = d.cancelRev || 0  // full cancellation deducted, COD included (confirmed 2026-08-19)
    const rtoRev = d.rtoRev || 0
    const cirRev = d.cirRev || 0
    const exchRev = d.exchRev || 0
    const returnRev = d.returnRev || 0
    // When excRev is missing (e.g. SKU-level rows that only carry gross+units), fall back to the
    // parent product row's gstRatio so net rev isn't zeroed out by a spurious 100% GST ratio.
    const gstRatio = excRev > 0 ? (gross > 0 ? (gross - excRev) / gross : 0) : (fallbackGstRatio ?? (gross > 0 ? (gross - excRev) / gross : 0))
    // Exchange is NOT deducted from Net Revenue (reverted 2026-08-19) — the customer keeps a
    // product either way, so an exchange isn't lost revenue. exchRev is still extracted above for
    // display (exchPct) only. The recreated '_EX...' OrderId that would otherwise double-count
    // this same sale is excluded entirely at the base BigQuery query (see api/_bq.js buildQuery).
    const grossAfterReturns = gross - cancelRev - rtoRev - cirRev - returnRev
    // netScale (confirmed 2026-10-22, same reconciliation pattern as pnlUtils.js's netRevenueOf):
    // this row-level GST ratio, summed across every row, lands a tiny bit apart from the KPI
    // card's single whole-channel blended GST ratio — two different, both-correct aggregation
    // orders. netScale = (KPI card's authoritative Net Revenue) / (this table's own raw total),
    // computed once by the caller and passed through every mapRow() call, so the table's Total row
    // always sums to EXACTLY the KPI card's number instead of a close-but-different one.
    const netStandard = grossAfterReturns * (1 - gstRatio) * netScale
    // Only use Mobility whitelist override for Mobility or Sparepart-category rows — the server
    // (api/bq.js's mobilityNetBySubCat) already excludes any other stray category, so anything
    // present here by the time it reaches this component legitimately belongs to one of these two.
    // Keyed 'Category::SubCategory' (see the reconciledMobilityNetBySubCat build site above) —
    // NOT bare SubCategory, since the same SubCategory name can exist under two Categories.
    const whitelistKey = `${catName}::${scName}`
    const net = ((catName === 'Mobility' || /^sparepart/i.test(catName || '')) && scName && mobilityNetBySubCat[whitelistKey] != null) ? mobilityNetBySubCat[whitelistKey] : netStandard
    return { gross, net, units: d.units || 0, cancelRev, rtoRev, cirRev, exchRev, returnRev }
  }
}
export const pctOf = (n, d) => d > 0 ? (n / d * 100) : 0

// One row per Category + Product (sub-category), as the desktop matrix lists them.
export function matrixRows({ subCatData, subCatPrevMap = {}, simpleReturns = false, mobilityNetBySubCat = {}, netScale = 1 }) {
  const mapRow = makeMapRow({ mobilityNetBySubCat, netScale })
  // Compute overall net shrink factor to approximate prevNet from prevGross
  const _totGross = Object.values(subCatData || {}).flatMap(m => Object.values(m)).reduce((s, d) => s + (d.rev || 0), 0)
  const _totNet = Object.entries(subCatData || {}).flatMap(([cat, m]) => Object.entries(m).map(([sc, d]) => mapRow(d, sc, cat).net)).reduce((s, n) => s + n, 0)
  const netShrink = _totGross > 0 ? _totNet / _totGross : 1
  // Flatten to one row per Category+Product (sub-category) — every product visible immediately.
  const allRows = []
  Object.entries(subCatData || {}).forEach(([cat, scMap]) => {
    Object.entries(scMap).forEach(([sc, d]) => {
      const r = mapRow(d, sc, cat)
      // Marketplaces report one combined return figure (d.returnRev) with no further breakdown;
      // D2C/EBO sum the four distinct statuses.
      const totalReturnRev = simpleReturns ? r.returnRev : r.cancelRev + r.rtoRev + r.cirRev + r.returnRev
      const prevGross = subCatPrevMap[`${cat}::${sc}`] || 0
      allRows.push({
        cat, sc, ...r, prevGross, prevNet: prevGross * netShrink,
        asp: r.units > 0 ? r.gross / r.units : 0,
        cancelPct: pctOf(r.cancelRev, r.gross), rtoPct: pctOf(r.rtoRev, r.gross), cirPct: pctOf(r.cirRev, r.gross), exchPct: pctOf(r.exchRev, r.gross),
        totalReturnPct: pctOf(totalReturnRev, r.gross),
      })
    })
  })
  return { mapRow, netShrink, allRows }
}

// Mobile list rows: products and SKUs with share, DRR (units per day, as the desktop column) and the
// desktop's SKU-level vs-prev (prevGross × the table's net shrink).
export function mobileMatrix({ subCatData, skuData, subCatPrevMap, skuPrevMap = {}, simpleReturns, mobilityNetBySubCat, netScale, drrDays }) {
  const { mapRow, netShrink, allRows } = matrixRows({ subCatData, subCatPrevMap, simpleReturns, mobilityNetBySubCat, netScale })
  const totGross = allRows.reduce((s, r) => s + r.gross, 0)
  const drr = units => (drrDays > 0 && units ? units / drrDays : null)
  const products = allRows.map(r => ({ ...r, sharePct: totGross > 0 ? r.gross / totGross * 100 : 0, drr: drr(r.units) }))
  const skus = []
  for (const r of allRows) {
    for (const [sku, d] of Object.entries(skuData?.[r.cat]?.[r.sc] || {})) {
      const sk = mapRow(d)
      const skTotalReturnRev = simpleReturns ? sk.returnRev : sk.cancelRev + sk.rtoRev + sk.cirRev + sk.returnRev
      const prevGross = skuPrevMap?.[r.cat]?.[r.sc]?.[sku] || 0
      skus.push({
        sku, cat: r.cat, sc: r.sc, ...sk, prevGross, prevNet: prevGross * netShrink,
        sharePct: totGross > 0 ? sk.gross / totGross * 100 : 0, drr: drr(sk.units),
        asp: sk.units > 0 ? sk.gross / sk.units : 0,
        cancelPct: pctOf(sk.cancelRev, sk.gross), rtoPct: pctOf(sk.rtoRev, sk.gross), cirPct: pctOf(sk.cirRev, sk.gross), exchPct: pctOf(sk.exchRev, sk.gross),
        totalReturnPct: pctOf(skTotalReturnRev, sk.gross),
      })
    }
  }
  return { products, skus }
}

// ▲/▼ for a tile: the same % the desktop badge shows, or null where the desktop shows no badge.
//   minPrev: desktop hides the badge when |prev| < minPrev; maxAbs: when |change| > maxAbs
export function chg(cur, prev, { minPrev = 0, maxAbs = Infinity } = {}) {
  if (!prev || Math.abs(prev) < minPrev) return null
  const p = (cur - prev) / prev * 100
  if (!isFinite(p) || Math.abs(p) > maxAbs) return null
  return p
}

// Geography rows (the desktop "enriched" state / city rows) → mobile rows.
export const geoRows = (rows, key) => (rows || []).map(r => ({ ...r, name: r[key], rev: r.rev, orders: r.orders, sharePct: r.sharePct, mom: r.mom ?? null }))

// Desktop money formats used on the tiles.
export const rupees = v => `₹${Math.round(v || 0).toLocaleString('en-IN')}`

// Region / city-tier rows, named and ordered as GeoToggleDonutCard does.
const TIER_NAMES = { '1': 'Tier I', '2': 'Tier II', '3': 'Tier III', 'I': 'Tier I', 'II': 'Tier II', 'III': 'Tier III' }
export const regionList = rows => (rows || []).map(r => ({ name: r.region, rev: r.rev }))
export const tierList = rows => (rows || []).map(r => {
  const key = String(r.tier).replace(/^tier\s*/i, '').trim()
  return { name: TIER_NAMES[key] || r.label || `Tier ${key}`, rev: r.rev }
})
