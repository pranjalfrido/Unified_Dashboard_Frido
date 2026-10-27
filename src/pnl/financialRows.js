import { netRevenueOf, getCogsForRange } from './pnlUtils.js'

// Financial View rows — one per Category × Product (SubCategory), moved unchanged out of
// PnLFinancialTable.jsx (feature/responsive-pnl) so the table, the margin watchlist / matrix /
// biggest fixes and the mobile product list all read the identical numbers.
export const MIN_REV_FOR_RATIOS = 100

export function buildFinancialRows({ subCatData, skuData, adSpendMap = {}, sndBySku, mobilityNetBySubCat = {}, netScale = 1, cogsMonthlyMap, startDate, endDate }) {
  // Net Revenue / netUnits / totalReturnRev — single canonical formula, shared with
  // PnLPage.jsx's netOf()/amzDailyPnL/kpiSummary via ./pnlUtils.js (see that file's header
  // comment for the exact formula and the mobility-override behavior).
  const mapRow = (d, scName, catName) => netRevenueOf(d, scName, mobilityNetBySubCat, catName, netScale)
  const pctOf = (n, d) => d > 0 ? (n / d * 100) : 0
  // A handful of rows have genuinely non-zero but negligible revenue (e.g. a ₹1 leftover-cent
  // transaction) — pctOf's `d > 0` guard lets these through and produces million-percent ratios
  // (COGS%/GM%/SnD%/CM1%/CM2%/Spend%/ROAS) that are technically correct arithmetic but visually
  // meaningless and alarming. Below this floor, treat the denominator as "not meaningfully
  // covered" the same way a true-zero row already renders as "—", rather than fabricating a
  // finite-but-absurd percentage.
  const pctOfFloored = (n, d) => d > MIN_REV_FOR_RATIOS ? (n / d * 100) : 0

  // Per-SKU COGS × units and SnD. Every SKU gets a COGS figure — real (cogsMonthlyMap, blended
  // across the months this range touches) where available, else the ASP-based estimate above —
  // so anyCosted is always true and no product is ever
  // excluded from GM%/CM1%/CM2% for lack of a cost sheet entry. netCovered/sndNetCovered track
  // how much of this row's Net Revenue is backed by an SnD entry (SnD has no fallback estimate).
  const costsForSkus = (cat, sc) => {
    const skus = skuData?.[cat]?.[sc] || {}
    let cogs = 0, netCovered = 0, anyCosted = false
    let snd = 0, sndNetCovered = 0, anySnd = false
    // For Mobility subcategories: distribute the manager-defined whitelist net revenue
    // proportionally across SKUs by each SKU's standard-formula net share, so per-SKU COGS%/GM%/
    // SnD%/CM1% denominators stay consistent with the subcategory-level override applied in
    // mapRow() above, instead of silently reverting to the standard (non-whitelist) net per SKU.
    // Keyed 'Category::SubCategory' — see pnlUtils.js's netRevenueOf() header comment for why a
    // bare SubCategory key would double-apply this whitelist value when the same SubCategory name
    // exists under two different Categories (e.g. 'Sparepart' under both Mobility and 'Sparepart
    // (Chair & Mobility)').
    const whitelistNet = mobilityNetBySubCat[`${cat}::${sc}`] != null ? mobilityNetBySubCat[`${cat}::${sc}`] : null
    const skuEntries = Object.entries(skus)
    const standardNetTotal = whitelistNet != null ? skuEntries.reduce((s, [, d]) => s + mapRow(d).net, 0) : 0
    skuEntries.forEach(([sku, d]) => {
      const rStandard = mapRow(d)
      const r = whitelistNet != null && standardNetTotal > 0
        ? { ...rStandard, net: whitelistNet * (rStandard.net / standardNetTotal) }
        : rStandard
      const asp = r.units > 0 ? r.gross / r.units : 0
      const { perUnitBlended: perUnitCogs } = getCogsForRange({ sku, units: r.units, startDate, endDate, cogsMonthlyMap, asp })
      if (perUnitCogs > 0 || r.netUnits > 0) {
        cogs += perUnitCogs * r.netUnits
        netCovered += r.net
        anyCosted = true
      }
      if (sndBySku && sndBySku[sku] != null) {
        snd += sndBySku[sku]
        sndNetCovered += r.net
        anySnd = true
      }
    })
    return { cogs, netCovered, anyCosted, snd, sndNetCovered, anySnd }
  }

  const allRows = []
  Object.entries(subCatData || {}).forEach(([cat, scMap]) => {
    Object.entries(scMap).forEach(([sc, d]) => {
      const r = mapRow(d, sc, cat)
      const spend = adSpendMap != null ? (adSpendMap[sc] || 0) : null
      const { cogs, netCovered, anyCosted, snd, sndNetCovered, anySnd } = (cogsMonthlyMap || sndBySku) ? costsForSkus(cat, sc) : { cogs: 0, netCovered: 0, anyCosted: false, snd: 0, sndNetCovered: 0, anySnd: false }
      const gm = anyCosted ? netCovered - cogs : null
      // CM1 = GM − SnD, only meaningful where BOTH costs are known for the same covered revenue —
      // a row costed for GM but not SnD (or vice versa) can't produce an honest CM1.
      const cm1Covered = anyCosted && anySnd
      const cm1 = cm1Covered ? gm - snd : null
      // CM2 = CM1 − Marketing Spend — only meaningful where CM1 itself is covered (spend with no
      // known CM1 can't produce an honest CM2 either; a row with zero real ad spend still gets a
      // valid CM2 of cm1 - 0, since "no ad spend" is a known fact, not a missing cost).
      const cm2Covered = cm1Covered
      const cm2 = cm2Covered ? cm1 - spend : null
      // Rows with negligible-but-nonzero revenue (e.g. a genuine ₹1 leftover transaction) would
      // otherwise pass every `> 0` guard below and produce finite-but-meaningless million-percent
      // ratios (COGS 2,104,545%, CM1 -2,161,006% observed on a real ₹1 row) — floor them to "not
      // meaningfully covered" instead, same treatment a true-zero-revenue row already gets.
      const belowFloor = r.net <= MIN_REV_FOR_RATIOS
      allRows.push({
        cat, sc, ...r, spend, cogs, netCovered, anyCosted, gm, snd, sndNetCovered, anySnd, cm1, cm1Covered, cm2, cm2Covered,
        returnPct: pctOf(r.totalReturnRev, r.gross),
        spendPct: belowFloor ? 0 : (r.net > 0 ? (spend / r.net * 100) : 0),
        roas: belowFloor ? null : (spend > 0 ? r.excRev / spend : null),
        netRoas: belowFloor ? null : (spend > 0 ? r.net / spend : null),
        asp: r.units > 0 ? r.gross / r.units : 0,
        cogsPct: !belowFloor && netCovered > MIN_REV_FOR_RATIOS ? pctOfFloored(cogs, netCovered) : null,
        gmPct: !belowFloor && gm != null && netCovered > MIN_REV_FOR_RATIOS ? pctOfFloored(gm, netCovered) : null,
        sndPct: !belowFloor && sndNetCovered > MIN_REV_FOR_RATIOS ? pctOfFloored(snd, sndNetCovered) : null,
        // CM1%/CM2% denominator: "covered net" (sndNetCovered, since cm1Covered = anyCosted &&
        // anySnd and COGS's ASP-fallback means anyCosted is ~always true — so sndNetCovered is
        // effectively cm1/cm2's own covered-net) — NOT the row's full r.net. Using r.net here
        // previously disagreed with this exact row's own COGS%/GM%/SnD% cells (which correctly use
        // netCovered/sndNetCovered) whenever a row had partial SnD coverage across its SKUs, AND
        // disagreed with the Total row (totCm1Pct/totCm2Pct below, which already use
        // tot.cm1NetCovered) and the KPI card (PnLPage.jsx's kpiSummary.cm1Pct/cm2Pct, which use
        // cm1NetCovered) for the identical date range — three different denominators for what
        // should be one number.
        cm1Pct: !belowFloor && cm1 != null && sndNetCovered > MIN_REV_FOR_RATIOS ? pctOfFloored(cm1, sndNetCovered) : null,
        cm2Pct: !belowFloor && cm2 != null && sndNetCovered > MIN_REV_FOR_RATIOS ? pctOfFloored(cm2, sndNetCovered) : null,
      })
    })
  })
  return { allRows, mapRow, pctOf }
}
