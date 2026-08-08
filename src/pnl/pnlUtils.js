// Shared PnL row-level math — the SINGLE canonical place Net Revenue (and its supporting
// per-row fields) and the COGS ASP-fallback estimate are computed for the PnL tab, so
// PnLPage.jsx's netOf()/amzDailyPnL/kpiSummary and PnLFinancialTable.jsx's mapRow()/
// costsForSkus() can never silently drift apart from each other again (they were previously two
// copy-pasted implementations of the same formula, including an identical COD-cancellation
// special case — see feature/centralize-revenue-metrics audit).
//
// Formula (per row d = {rev, excRev, units, returnUnits, cancelRev, codCancelRev, rtoRev,
// cirRev, exchRev, returnRev, returnedUnits?}):
//   totalReturnRev = (cancelRev − codCancelRev) + rtoRev + cirRev + returnRev
//     — COD cancellations are excluded from the deduction: COD cancels are pre-dispatch drops,
//       not true returns (same convention as api/_bq.js's computeNetRevenueMeasures).
//   gstRatio        = rev > 0 ? (rev − excRev) / rev : 0
//   net             = (rev − totalReturnRev) × (1 − gstRatio)
// Mobility sub-channel override: some D2C SubCategories have a manager-defined whitelist net
// revenue that REPLACES the standard formula's `net` for that one row — every other field
// (gross/excRev/units/etc.) stays as computed. mobilityNetBySubCat is keyed by 'Category::
// SubCategory' (NOT bare SubCategory) — the same SubCategory name can legitimately exist under
// two different Categories (observed: 'Sparepart' exists under both Category='Mobility' and
// Category='Sparepart (Chair & Mobility)'), and the raw whitelist figure from api/bq.js's
// mobilityNetCalc query has no Category dimension at all, so a bare-SubCategory-keyed map would
// apply that ONE whitelist value to BOTH colliding rows independently, double-counting it in any
// sum across rows (confirmed: this silently inflated the Financial Table's Mobility Total by
// exactly one Sparepart-value versus the KPI card's true whole-range total). PnLPage.jsx's
// reconciledMobilityNetBySubCat builds this composite-keyed map (splitting proportionally by
// gross revenue on the rare case of a genuine collision) before it ever reaches this function.
// Restricted to catName being 'Mobility' or a Sparepart category (or omitted, for callers that
// don't pass it) — SubChannel='Mobility' is an ORDER-level tag that can legitimately carry a
// non-Mobility PRODUCT category (e.g. a Mobility-storefront customer buying a pillow);
// api/bq.js's pnlSalesRows/mobilityNetCalc/mobilityNetBySubCat all already exclude those stray
// rows/keys at the source (folding them into MyFrido). Matches src/App.jsx's
// FlatCategoryProductMatrix.mapRow()'s equivalent guard so the two implementations can't silently
// diverge again.
const isMobilityWhitelistCategory = catName => catName === undefined || catName === 'Mobility' || /^sparepart/i.test(catName || '')
export function netRevenueOf(d, scName, mobilityNetBySubCat = {}, catName) {
  const gross = d.rev || 0
  const excRev = d.excRev || 0
  const returnUnits = d.returnUnits || 0
  const cancelRev = d.cancelRev || 0
  const codCancelRev = d.codCancelRev || 0
  const rtoRev = d.rtoRev || 0
  const cirRev = d.cirRev || 0
  const returnRev = d.returnRev || 0
  const totalReturnRev = (cancelRev - codCancelRev) + rtoRev + cirRev + returnRev
  const gstRatio = gross > 0 ? (gross - excRev) / gross : 0
  const netStandard = (gross - totalReturnRev) * (1 - gstRatio)
  const whitelistKey = catName != null ? `${catName}::${scName}` : scName
  const net = (isMobilityWhitelistCategory(catName) && scName && mobilityNetBySubCat[whitelistKey] != null) ? mobilityNetBySubCat[whitelistKey] : netStandard
  // netUnits = gross units minus cancelled/RTO/returned/CIR units — COGS should only price units
  // that stayed sold, not gross units before returns are netted out. Prefers the explicit
  // per-row returnUnits (Shopify/D2C) when present, else falls back to Amazon SC/VC's
  // returnedUnits, else gross units where neither is tracked yet.
  const units = d.units || 0
  const netUnits = returnUnits > 0 ? Math.max(units - returnUnits, 0) : (d.returnedUnits != null ? Math.max(units - d.returnedUnits, 0) : units)
  return { gross, excRev, net, units, netUnits, totalReturnRev }
}

// Fallback COGS-per-unit estimate for any SKU missing a real cogs-data.json entry, so no product
// silently drops out of COGS/GM/CM1/CM2 for lack of a cost sheet row. Rate is applied to ASP Inc
// GST (gross ÷ units): below ₹5,000 ASP → 40% of ASP is COGS, ₹5,000 and above → 50% of ASP is
// COGS (confirmed with user — these are the two flat slabs to use). Shared so the PnL trend
// chart (PnLPage.jsx's amzDailyPnL) and the whole-range Financial View table
// (PnLFinancialTable.jsx) apply the identical fallback instead of the table having it while the
// trend silently read cogsMap[sku].cogs with no fallback (previously caused the two to show
// different COGS%/GM%/CM1%/CM2% for the same date range, inside the same tab).
export const estimateCogsPerUnit = asp => asp > 0 ? asp * (asp < 5000 ? 0.4 : 0.5) : 0
