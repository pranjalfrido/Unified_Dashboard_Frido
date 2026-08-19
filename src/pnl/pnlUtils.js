// Shared PnL row-level math — the SINGLE canonical place Net Revenue (and its supporting
// per-row fields) and the COGS ASP-fallback estimate are computed for the PnL tab, so
// PnLPage.jsx's netOf()/amzDailyPnL/kpiSummary and PnLFinancialTable.jsx's mapRow()/
// costsForSkus() can never silently drift apart from each other again (they were previously two
// copy-pasted implementations of the same formula, including an identical COD-cancellation
// special case — see feature/centralize-revenue-metrics audit).
//
// Formula (per row d = {rev, excRev, units, returnUnits, cancelRev, codCancelRev, rtoRev,
// cirRev, exchRev, returnRev, returnedUnits?}):
//   totalReturnRev = cancelRev + rtoRev + cirRev + returnRev
//     — FULL cancellation is deducted, COD included (confirmed 2026-08-19, supersedes the old
//       COD-cancel carve-out). Matches api/_bq.js's computeNetRevenueMeasures exactly — codCancelRev
//       is still read into this function (kept for the Overall Return% metric elsewhere) but no
//       longer subtracted out of the Net Revenue deduction itself. Exchange is NOT deducted
//       (reverted 2026-08-19): the customer keeps a product either way, so an exchange isn't lost
//       revenue. The recreated '_EX...' OrderId Frido's ops team creates when reshipping an
//       exchange (which would otherwise double-count the same sale, since it also carries
//       Order_Status='Exchange') is excluded entirely at the base BigQuery query instead — see
//       buildQuery in api/_bq.js — so this function no longer needs to special-case Exchange.
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
// netScale (confirmed 2026-08-19): PnL's row-level blended-GST-ratio Net Revenue and the Sales
// tab's whole-range real-per-line-item-GST Net Revenue (api/_bq.js's computeNetRevenueMeasures)
// are two different, both-correct formulas that land a small % apart (Sales is more precise but
// can't be broken into per-Category/SubCategory/SKU rows; PnL's row-level breakdown is what the
// Financial Table's COGS%/GM%/CM1%/CM2% columns need). User asked for the two tabs' Net Revenue
// to tie out exactly rather than leave that gap — netScale = (Sales tab's authoritative netRev） ÷
// (this same row set's raw netStandard sum), computed once in PnLPage.jsx and passed through
// every netRevenueOf() call for a given channel/sub-channel so every row, the KPI card, and the
// Financial Table Total all rescale by the identical factor and still sum consistently with each
// other — only `net` is rescaled, gross/excRev/units stay the real, unscaled figures. Does NOT
// apply to the Mobility whitelist override below, which is its own manager-defined source of
// truth and must stay exact.
export function netRevenueOf(d, scName, mobilityNetBySubCat = {}, catName, netScale = 1) {
  const gross = d.rev || 0
  const excRev = d.excRev || 0
  const returnUnits = d.returnUnits || 0
  const cancelRev = d.cancelRev || 0
  const rtoRev = d.rtoRev || 0
  const cirRev = d.cirRev || 0
  const returnRev = d.returnRev || 0
  const totalReturnRev = cancelRev + rtoRev + cirRev + returnRev
  const gstRatio = gross > 0 ? (gross - excRev) / gross : 0
  const netStandard = (gross - totalReturnRev) * (1 - gstRatio) * netScale
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
