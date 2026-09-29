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

// Shared per-unit D2C cost engine — used by both the Breakeven ROAS calculator and the Price
// Simulator so a hypothetical/simulated unit is costed with the EXACT same formula as a real one
// in shSkuCosts (PnLPage.jsx) / api/bq.js's D2C SnD queries: payment gateway = 1.1% of gross Inc
// GST, software fee = ₹15/unit (flat, both fixed-rate regardless of price), weight-slab logistics
// via rateForSlab (see PnLPage.jsx), blended across order outcomes by the caller-supplied
// probabilities. GST is applied only to derive Net Rev — COGS/logistics/fees are cost lines, not
// revenue, so they are untouched by gstRate directly (it only ever nets down `gross`).
//
// Blended logistics (mirrors shSkuCosts' per-order Order_Status branching, but expressed as
// expected value over the five mutually exclusive outcome probabilities instead of summing real
// per-order rows): a unit is exactly one of {delivered, rto, return/cir, exchange, cancelled}.
//   delivered  → forward
//   rto        → rto (STANDALONE cost, not forward+rto — see below)
//   return/cir → reverse (STANDALONE cost, not forward+reverse)
//   exchange   → forward (already counted below) + reverse + forward again — the sheet's own
//                Total_Logistics formula: `(1-Cancel%)*Fwd_Cost + RTO%*RTO_Cost + Exch%*Exch_Cost +
//                CIR%*CIR_Cost`, where Exch_Cost = Fwd_Cost+CIR_Cost. Confirmed 2026-09 against the
//                business's own reference spreadsheet (SKU_PnL_Detail) and against the business's
//                explicit confirmation of the operational logic: every non-cancelled order —
//                delivered, RTO, CIR, or Exchange alike — already incurs the forward shipment leg,
//                so `(1-Cancel%)*forward` is charged on ALL of them up front. RTO/CIR/Exchange each
//                then layer their OWN extra leg cost on top of that shared forward charge:
//                  - RTO      → + rto_leg      (rate.rto)
//                  - CIR      → + reverse_leg  (rate.reverse)
//                  - Exchange → + reverse_leg + a SECOND forward leg (the replacement shipment),
//                               i.e. + (rate.reverse + rate.forward)
//                An earlier version of this function treated rate.rto/rate.reverse as STANDALONE
//                full costs (matching a literal but incorrect reading of the sheet's R41=Q41*90%
//                formula) and used a shrinking `deliveredPct` base — that was wrong; the business
//                confirmed non-cancelled units already carry forward cost in every branch.
//   cancelled  → 0 logistics (order never shipped) — fulfilment still applies to every order
//                regardless of outcome, same as shSkuCosts.
// Weight-based stock-movement cost (₹4/kg, confirmed against the same reference spreadsheet's
// Rates!N3 = 4 and its Total_Logistics formula's `+(weightSlabGm/1000*4)` term) is added on top —
// same flat per-kg charge Amazon VC/SC's own SnD already uses (api/bq.js's
// STOCK_MOVEMENT_RATE_PER_KG), previously missing entirely from every D2C S&D calc that shares
// this function (Price Simulator, Breakeven ROAS) — confirmed via this same reference sheet.
export const PAYMENT_GATEWAY_RATE = 0.011
export const SOFTWARE_FEE_PER_UNIT = 15
export const STOCK_MOVEMENT_RATE_PER_KG = 4

export function blendedLogisticsPerUnit(rate, { rtoPct = 0, returnPct = 0, exchangePct = 0, cancelPct = 0 } = {}) {
  if (!rate) return { logistics: 0, fulfilment: 0 }
  const shippedPct = Math.max(0, 1 - cancelPct)
  const stockMovementCost = (rate.weightGm || 0) / 1000 * STOCK_MOVEMENT_RATE_PER_KG
  const logistics =
    shippedPct * rate.forward +
    rtoPct * rate.rto +
    returnPct * rate.reverse +
    exchangePct * (rate.reverse + rate.forward) +
    stockMovementCost
  return { logistics, fulfilment: rate.fulfilment }
}

// Same missing-weight fallback as shSkuCosts (PnLPage.jsx): a SKU with no weight on record is
// costed as if it were a 2kg (2000g) shipment rather than silently zeroing out logistics.
const FALLBACK_WEIGHT_GM = 2000

// Real per-order weights always land exactly on a slab boundary (BQ-side aggregation already
// rounds them — see rateForSlab's exact-match design in PnLPage.jsx). A hypothetical/user-entered
// weight (Breakeven ROAS's "enter this new product's weight in grams") won't necessarily match
// one, so round UP to the next real slab first — same courier-billing convention as api/
// _sndRates.js's rateForWeight() (a courier bills the slab a shipment falls into, not its exact
// weight) — before doing the exact-match lookup rateForSlab expects.
export function rateForWeightGm(slabs, weightGm) {
  if (!slabs || !slabs.length || weightGm == null) return null
  const slab = slabs.find(s => s.weightGm >= weightGm) || slabs[slabs.length - 1]
  return slab
}

// Full per-unit waterfall for a hypothetical/simulated unit at a given selling price (Inc GST).
// gstRate is a fraction (e.g. 0.18), not a percentage. Both fallback rules from the real PnL
// formula are preserved here so a SKU with incomplete data never silently costs less than it
// should — see estimateCogsPerUnit above (COGS fallback) and FALLBACK_WEIGHT_GM (weight
// fallback): callers should pass `cogsPerUnit: null` / `weightGm: null` when the real value is
// unknown, NOT 0, so this function can apply the correct fallback instead of costing it as free.
// Returns every line so callers (Breakeven ROAS, Price Simulator) can display the full
// breakdown, not just the final CM figures.
export function perUnitWaterfall({ sellingPriceIncGst, gstRate, cogsPerUnit, weightGm, slabs, outcomePcts }) {
  const grossIncGst = sellingPriceIncGst
  const excGst = grossIncGst / (1 + (gstRate || 0))
  // Net Revenue DOES deduct expected revenue loss from Cancellation + RTO + CIR/Return — a
  // cancelled/RTO'd/returned order genuinely reverses the sale — matching the same convention the
  // Price Simulator's own baseline uses (net = excRev × (1 − matureReturnRevRate)) and the real
  // Net Revenue formula in api/_bq.js's computeNetRevenueMeasures (retainedShare subtracts
  // RTO+CIR+Return+Cancellation). Exchange is deliberately EXCLUDED from this deduction — the
  // customer keeps a product either way, an exchange isn't lost revenue, same as everywhere else
  // in this app; it still fully participates in the logistics COST below via blendedLogisticsPerUnit's
  // own exchangePct term. (Previously this function left netRev completely unaffected by
  // outcomePcts, silently making it identical to Gross Ex GST regardless of expected returns —
  // confirmed this made Net Revenue never visibly respond to changing Cancellation/RTO/CIR/Exchange
  // in the Breakeven ROAS calculator, which the real numbers should never do.)
  const revenueLossPct = Math.max(0, Math.min(1,
    (outcomePcts?.rtoPct || 0) + (outcomePcts?.returnPct || 0) + (outcomePcts?.cancelPct || 0)
  ))
  const netRev = excGst * (1 - revenueLossPct)
  // COGS is charged only on the share of the unit that stayed sold (1 − revenueLossPct) — same
  // "net units" convention the real D2C PnL table already uses (pnlUtils.js's netRevenueOf:
  // netUnits = units − cancelled/RTO/returned/CIR units, so COGS never prices units that didn't
  // stay sold). A Cancelled/RTO'd/CIR'd unit's COGS isn't fully sunk (goods come back to
  // inventory); Exchange is excluded from this reduction (revenueLossPct already excludes it)
  // since an exchanged unit's COGS was never actually lost — the customer keeps a product.
  const grossCogs = cogsPerUnit != null ? cogsPerUnit : estimateCogsPerUnit(grossIncGst)
  const cogs = grossCogs * (1 - revenueLossPct)
  const gm = netRev - cogs
  const effectiveWeightGm = weightGm != null ? weightGm : FALLBACK_WEIGHT_GM
  const weightRate = rateForWeightGm(slabs, effectiveWeightGm)
  const { logistics, fulfilment } = blendedLogisticsPerUnit(weightRate, outcomePcts)
  const paymentGw = grossIncGst * PAYMENT_GATEWAY_RATE
  const softwareFee = SOFTWARE_FEE_PER_UNIT
  const snd = logistics + fulfilment + paymentGw + softwareFee
  const cm1 = gm - snd
  return { grossIncGst, excGst, netRev, cogs, gm, logistics, fulfilment, paymentGw, softwareFee, snd, cm1 }
}
