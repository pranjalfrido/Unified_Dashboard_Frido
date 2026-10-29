// Financial MIS — a finance-facing report, structurally independent from every other tab in this
// app (confirmed 2026-10-20, explicit instruction). Two things make it genuinely different from
// the rest of the dashboard's PnL/Sales logic, not a variant of it:
//
// 1. Grain: Category_Finance / SubCategory_Finance (item-master's finance-facing taxonomy) and the
//    fact table's own Channel_Group column (D2C / EBO / Marketplace / Non - EBO), NOT the regular
//    Category/SubCategory fields or the hand-maintained CHANNEL_GROUPS mapping in _bq.js (a
//    DIFFERENT, unrelated grouping used by buildQuery's channelGroup filter — confirmed distinct,
//    do not conflate the two).
//
// 2. Return% / Net Revenue direction: every other Net Revenue figure in this app sums ACTUAL
//    return-transaction amounts for the exact selected range (netRevenueOf() in pnlUtils.js).
//    This page instead derives Net Revenue FROM a resolved return RATE: for any row whose range
//    touches the last 15 days, the live/immature return% for that recent slice is distrusted (too
//    few of those orders have had time to actually RTO/return/resolve yet) and replaced with a
//    rolling PRIOR-30-day return% for the same SKU (window ending 14 days before today — same
//    rollingStart/rollingEnd convention as buildReturnRateMature in _bq.js). That resolved rate is
//    then used to derive Net Revenue = Gross Revenue (Exc GST) × (1 − Return%), not from summing
//    real return amounts.
//
// Return-type Order_Status definitions, confirmed against live data per Channel_Group (verified
// 2026-10-20 — each group's status vocabulary genuinely differs, not a guess):
//   D2C:          RTO, CIR, Cancelled      (Exchange excluded — customer keeps the product)
//   EBO:          Return, CIR, Cancelled   (matches the already-fixed eboSKU/eboSubCategory convention)
//   Marketplace:  Return, Cancelled        (no separate RTO/CIR bucket at this grain)
//   Non - EBO:    Credit Note              (offline/B2B's own return vocabulary)
//
// Fallback chain when a SKU's own rolling rate can't be trusted for the immature slice:
//   SKU's own mature rate usable?
//     — NOT usable if: rate > 30% (likely a false signal), OR the SKU's mature-window unit volume
//       is too small relative to the CURRENT period's volume (a rate computed off 15 units
//       shouldn't be applied to a current period selling 1500 units of the same SKU — confirmed
//       explicitly with the user, NOT a flat volume floor alone). Ratio threshold VOLUME_RATIO_MIN
//       below, with the existing minMatureUnits=30 absolute floor as a second guard.
//   → fall back to the SKU's Sub-category's (Finance) average rolling return%
//   → fall back further to the SKU's Category's (Finance) average rolling return%
//
// Fetched ONLY on demand (POST /api/financial-mis, called from FinancialMISPage) — never as part
// of the Sales tab's own load, per explicit instruction that this must not affect Sales tab
// load time.
import { getBQ, buildQuery } from './_bq.js'

const RETURN_FLAG_SQL = `(
  (Channel_Group = 'D2C' AND Order_Status IN ('RTO','CIR','Cancelled'))
  OR (Channel_Group = 'EBO' AND Order_Status IN ('Return','CIR','Cancelled'))
  OR (Channel_Group = 'Marketplace' AND Order_Status IN ('Return','Cancelled'))
  OR (Channel_Group = 'Non - EBO' AND Order_Status = 'Credit Note')
)`

const MIN_MATURE_UNITS = 30
// A SKU's mature-window unit volume must be at least this fraction of the CURRENT period's units
// for that SKU before its own rate is trusted — guards against a rate computed off a thin sample
// (e.g. 15 historical units) being applied to a current period with a real volume surge (e.g. 1500
// units of the same SKU) — confirmed explicitly with the user as the real failure mode to guard
// against (not merely "rate > 30%" in isolation). 0.3 chosen deliberately over a stricter 0.5-1.0:
// strict enough to catch a genuine volume explosion (15→1500 = ratio 0.01, 1352→4970 = ratio 0.27,
// both correctly rejected in live verification 2026-10-20), loose enough not to reject an
// ordinarily/moderately growing SKU's perfectly good historical rate just for growing at all.
const VOLUME_RATIO_MIN = 0.3
const RETURN_RATE_CEILING = 0.30

function rollingMatureWindow() {
  const today = new Date()
  const rollingEndD = new Date(today); rollingEndD.setDate(rollingEndD.getDate() - 14)
  const rollingStartD = new Date(rollingEndD); rollingStartD.setDate(rollingStartD.getDate() - 29)
  return { rollingStart: rollingStartD.toISOString().slice(0, 10), rollingEnd: rollingEndD.toISOString().slice(0, 10) }
}

// Does the selected [start, end] range touch the immature window (last 14 days)? Same cutoff
// convention as src/utils.js's rangeTouchesImmatureWindow, re-derived server-side here since this
// endpoint doesn't share that client-side module.
function rangeTouchesImmatureWindow(end) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14)
  return new Date(end) > cutoff
}

function addDays(dateStr, n) {
  const d = new Date(dateStr); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// Amazon Vendor Central, Flipkart (both sub-channels) and Myntra specifically post their last
// 1-3 days of data late (confirmed live 2026-10-21), not because sales didn't happen but because
// that channel's feed hasn't landed in BigQuery yet. Every OTHER channel's own trailing day gap
// (including yesterday's, across the board) is just the normal ~11am daily sync not having run
// yet — a real, expected lag, not a reporting problem — and is deliberately left alone, showing
// its true (possibly lower or zero) number rather than a synthetic one. This back-fills ONLY
// the gap on the named channels — any day after that channel's own last real date, up to the
// selected range's end — with that channel's own trailing 7-real-day average, scoped to
// Financial MIS only (not touching the separate, already-shipped Flipkart estimate logic in
// api/bq.js, which serves a different tab).
const BACKFILL_CHANNEL_KEYS = new Set([
  'Amazon::Amazon Vendor Central',
  'Flipkart::Flipkart FBF',
  'Flipkart::Flipkart NON-FBF',
  'Myntra::Myntra',
])
function backfillChannelGaps(rowsByChannel, rangeEnd) {
  // rowsByChannel: { [channel::subchannel]: [{date, gross_inc_gst, gross_exc_gst, return_rev, orders}, ...] }
  const filled = []
  for (const key of Object.keys(rowsByChannel)) {
    if (!BACKFILL_CHANNEL_KEYS.has(key)) { rowsByChannel[key].forEach(r => filled.push({ ...r, estimated: false })); continue }
    const real = rowsByChannel[key].slice().sort((a, b) => a.date < b.date ? -1 : 1)
    real.forEach(r => filled.push({ ...r, estimated: false }))
    const latest = real[real.length - 1]?.date
    if (!latest || latest >= rangeEnd) continue
    const last7 = real.slice(-7)
    if (last7.length === 0) continue
    const avg = last7.reduce((acc, r) => {
      acc.gross_inc_gst += r.gross_inc_gst; acc.gross_exc_gst += r.gross_exc_gst
      acc.return_rev += r.return_rev; acc.orders += r.orders
      return acc
    }, { gross_inc_gst: 0, gross_exc_gst: 0, return_rev: 0, orders: 0 })
    const n = last7.length
    let d = addDays(latest, 1)
    while (d <= rangeEnd) {
      filled.push({
        date: d,
        gross_inc_gst: avg.gross_inc_gst / n, gross_exc_gst: avg.gross_exc_gst / n,
        return_rev: avg.return_rev / n, orders: Math.round(avg.orders / n),
        estimated: true,
      })
      d = addDays(d, 1)
    }
  }
  return filled
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  try {
    const { start, end } = req.body || {}
    if (!start || !end) return res.status(400).json({ error: 'start and end (YYYY-MM-DD) required' })

    const bq = getBQ()
    const base = buildQuery(start, end, {})
    const needsMatureRate = rangeTouchesImmatureWindow(end)
    const { rollingStart, rollingEnd } = rollingMatureWindow()

    // Current-period units per SKU — needed for the volume-reliability check regardless of
    // whether the mature rate ends up used (cheap to always compute; avoids a second round trip
    // if a later request needs it, and keeps the "is this rate trustworthy" decision entirely
    // server-side rather than leaking the threshold logic to the client).
    const queries = {
      // Whole-range, India-only aggregates — Gross Inc/Exc GST, units, LIVE return rev (used
      // as-is for any range that doesn't touch the last 14 days; see needsMatureRate above).
      skuTotals: `WITH q AS (${base}) SELECT
          MasterSKU AS sku, ANY_VALUE(Category_Finance) AS cat, ANY_VALUE(SubCategory_Finance) AS subcat,
          ANY_VALUE(Channel_Group) AS chgroup, ANY_VALUE(Category) AS cat_raw, ANY_VALUE(SubCategory) AS subcat_raw,
          COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units,
          SUM(SellingPrice_Inc_GST) AS gross_inc_gst, SUM(SellingPrice_Exc_GST) AS gross_exc_gst,
          SUM(CASE WHEN ${RETURN_FLAG_SQL} THEN SellingPrice_Inc_GST ELSE 0 END) AS live_return_rev
        FROM q
        WHERE Country = 'India' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != ''
        GROUP BY sku`,

      // Rolling mature-window per-SKU rate (only needed/used when needsMatureRate) — same window
      // every other *ReturnRateMature query in api/bq.js already uses.
      skuMatureRate: needsMatureRate ? `WITH q AS (${buildQuery(rollingStart, rollingEnd, {})}) SELECT
          MasterSKU AS sku, SUM(ItemQty) AS mature_units,
          SUM(SellingPrice_Inc_GST) AS mature_rev,
          SUM(CASE WHEN ${RETURN_FLAG_SQL} THEN SellingPrice_Inc_GST ELSE 0 END) AS mature_return_rev
        FROM q
        WHERE Country = 'India' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != ''
        GROUP BY sku` : `SELECT '' AS sku, 0 AS mature_units, 0 AS mature_rev, 0 AS mature_return_rev LIMIT 0`,

      // Sub-category and Category level mature rates (fallback tiers 2 and 3) — same rolling
      // window, grouped at each broader grain, scoped by Channel_Group since the same
      // Category_Finance can legitimately carry a different return profile per channel group
      // (e.g. Orthotics on D2C vs. Orthotics on Marketplace, confirmed different rates in
      // live verification 2026-10-20).
      subcatMatureRate: `WITH q AS (${buildQuery(rollingStart, rollingEnd, {})}) SELECT
          COALESCE(NULLIF(TRIM(Category_Finance),''), 'Unmapped') AS cat,
          COALESCE(NULLIF(TRIM(SubCategory_Finance),''), 'Unmapped') AS subcat,
          Channel_Group AS chgroup,
          SUM(SellingPrice_Inc_GST) AS mature_rev,
          SUM(CASE WHEN ${RETURN_FLAG_SQL} THEN SellingPrice_Inc_GST ELSE 0 END) AS mature_return_rev
        FROM q
        WHERE Country = 'India'
        GROUP BY cat, subcat, chgroup`,

      catMatureRate: `WITH q AS (${buildQuery(rollingStart, rollingEnd, {})}) SELECT
          COALESCE(NULLIF(TRIM(Category_Finance),''), 'Unmapped') AS cat,
          Channel_Group AS chgroup,
          SUM(SellingPrice_Inc_GST) AS mature_rev,
          SUM(CASE WHEN ${RETURN_FLAG_SQL} THEN SellingPrice_Inc_GST ELSE 0 END) AS mature_return_rev
        FROM q
        WHERE Country = 'India'
        GROUP BY cat, chgroup`,

      // Current-period units per SKU — the OTHER side of the volume-reliability ratio check
      // (skuTotals above already has whole-range units for the selected range, which IS the
      // current period here since this endpoint takes exactly one range, not two).

      // Geographic rollup — Region/Tier (primary chart) + State (detail table), India only,
      // whole-selected-range (not return-rate-adjusted — geography is a revenue-distribution
      // view, not a margin view; keeping it as real/live gross keeps it simple and honest about
      // what it shows).
      geoRegionTier: `WITH q AS (${base}) SELECT Region, City_Tier, Tier_Label,
          SUM(SellingPrice_Inc_GST) AS gross_inc_gst, SUM(SellingPrice_Exc_GST) AS gross_exc_gst,
          SUM(ItemQty) AS units, COUNT(DISTINCT OrderId) AS orders
        FROM q
        WHERE Country = 'India' AND Region IS NOT NULL
        GROUP BY Region, City_Tier, Tier_Label
        ORDER BY gross_inc_gst DESC`,

      geoState: `WITH q AS (${base}) SELECT
          CASE WHEN TRIM(State) IS NULL OR TRIM(State) IN ('','-') THEN 'OTHERS' ELSE UPPER(TRIM(State)) END AS state,
          SUM(SellingPrice_Inc_GST) AS gross_inc_gst, SUM(SellingPrice_Exc_GST) AS gross_exc_gst,
          SUM(ItemQty) AS units, COUNT(DISTINCT OrderId) AS orders
        FROM q
        WHERE Country = 'India'
        GROUP BY state
        ORDER BY gross_inc_gst DESC
        LIMIT 40`,

      // Daily trend — raw Gross Revenue and live return-revenue per day, PER CHANNEL + sub-channel
      // (not just per day) — needed so a reporting-lag gap in one specific channel (Amazon Vendor
      // Central, Flipkart, Myntra — all known to post their last 1-2 days late) can be backfilled
      // with THAT channel's own 7-day trailing average, rather than just leaving a dip in the
      // combined total. The live per-day rate computed from this is only used as-is for MATURE
      // days; immature-window days are overridden below (after this query runs) with the same
      // overall resolved return% used for the headline KPI cards, so the trend line doesn't show
      // an artificially low Return% just because those orders haven't had time to RTO/return yet.
      // Same MasterSKU filter as skuTotals above (WHERE Country = 'India' AND MasterSKU IS NOT
      // NULL/blank) so the trend line's totals reconcile with the KPI cards/channel-group table
      // built from rows — without this, a null/blank-MasterSKU row counted here but excluded from
      // rows/channelGroups silently made the two disagree (confirmed live 2026-10-21, a ~1 Cr
      // gap on a 20-day range).
      dailyTrendByChannel: `WITH q AS (${base}) SELECT
          CAST(OrderDate AS STRING) AS order_date, Channel, SubChannel, Channel_Group,
          SUM(SellingPrice_Inc_GST) AS gross_inc_gst, SUM(SellingPrice_Exc_GST) AS gross_exc_gst,
          SUM(CASE WHEN ${RETURN_FLAG_SQL} THEN SellingPrice_Inc_GST ELSE 0 END) AS return_rev,
          COUNT(DISTINCT OrderId) AS orders
        FROM q
        WHERE Country = 'India' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != ''
        GROUP BY order_date, Channel, SubChannel, Channel_Group
        ORDER BY order_date`,
    }

    const entries = Object.entries(queries)
    const results = {}
    for (const [key, sql] of entries) {
      const [rows] = await bq.query({ query: sql })
      results[key] = rows
    }

    // ── Build the mature-rate lookup maps (Sub-category and Category tiers) ──
    const subcatRateMap = {} // { [chgroup::cat::subcat]: pct }
    results.subcatMatureRate.forEach(r => {
      const rev = parseFloat(r.mature_rev) || 0
      if (rev <= 0) return
      subcatRateMap[`${r.chgroup}::${r.cat}::${r.subcat}`] = (parseFloat(r.mature_return_rev) || 0) / rev
    })
    const catRateMap = {} // { [chgroup::cat]: pct }
    results.catMatureRate.forEach(r => {
      const rev = parseFloat(r.mature_rev) || 0
      if (rev <= 0) return
      catRateMap[`${r.chgroup}::${r.cat}`] = (parseFloat(r.mature_return_rev) || 0) / rev
    })

    // ── Per-SKU mature rate (tier 1), with the reliability gate ──
    const skuMatureMap = {} // { [sku]: { rate, units } }
    results.skuMatureRate.forEach(r => {
      const rev = parseFloat(r.mature_rev) || 0
      if (rev <= 0) return
      skuMatureMap[r.sku] = {
        rate: (parseFloat(r.mature_return_rev) || 0) / rev,
        units: parseInt(r.mature_units) || 0,
      }
    })

    // ── Resolve each SKU row's final Return% + derived Net Revenue ──
    const rows = results.skuTotals.map(r => {
      const sku = r.sku
      const cat = r.cat || 'Unmapped'
      const subcat = r.subcat || 'Unmapped'
      const chgroup = r.chgroup
      const grossIncGst = parseFloat(r.gross_inc_gst) || 0
      const grossExcGst = parseFloat(r.gross_exc_gst) || 0
      const units = parseInt(r.units) || 0
      const liveReturnRev = parseFloat(r.live_return_rev) || 0
      const liveReturnPct = grossIncGst > 0 ? liveReturnRev / grossIncGst : 0

      let returnPct = liveReturnPct
      let returnPctSource = 'live'

      if (needsMatureRate) {
        const mature = skuMatureMap[sku]
        const volumeOk = mature && mature.units >= MIN_MATURE_UNITS && (units > 0 ? (mature.units / units) >= VOLUME_RATIO_MIN : true)
        const rateOk = mature && mature.rate <= RETURN_RATE_CEILING
        if (mature && volumeOk && rateOk) {
          returnPct = mature.rate
          returnPctSource = 'sku_mature'
        } else {
          const subcatRate = subcatRateMap[`${chgroup}::${cat}::${subcat}`]
          const catRate = catRateMap[`${chgroup}::${cat}`]
          if (subcatRate != null) { returnPct = subcatRate; returnPctSource = 'subcat_mature' }
          else if (catRate != null) { returnPct = catRate; returnPctSource = 'cat_mature' }
          else { returnPctSource = 'live_fallback' } // no mature data anywhere — live is all we have
        }
      }

      // Net Revenue (Exc GST) derived FROM the resolved return% — NOT summed from real return
      // transactions (that's the deliberate, documented difference from netRevenueOf() elsewhere
      // in this app — see file header comment).
      const netRevenueExcGst = grossExcGst * (1 - returnPct)

      return {
        sku, category: cat, subCategory: subcat, channelGroup: chgroup,
        categoryRaw: r.cat_raw, subCategoryRaw: r.subcat_raw,
        orders: parseInt(r.orders) || 0, units,
        grossIncGst, grossExcGst, netRevenueExcGst,
        returnPct, returnPctSource,
      }
    })

    // ── Reporting-lag backfill (Amazon Vendor Central / Flipkart / Myntra confirmed live
    // 2026-10-21) — computed here, before the Channel-Group rollup and overall totals, so both
    // can be topped up with each lagging channel's own 7-day trailing average for the days its
    // feed hasn't posted yet. rows/topProducts (SKU and Sub-category grain) are deliberately NOT
    // topped up — there's no sound way to attribute an estimated gap-fill amount down to which
    // SKUs would have made it up, so that risk is left out; only the coarser Channel-Group and
    // overall totals (and the Revenue Trend chart) carry the estimate.
    const byChannelKeyForBackfill = {}
    results.dailyTrendByChannel.forEach(r => {
      const key = `${r.Channel}::${r.SubChannel || ''}`
      ;(byChannelKeyForBackfill[key] || (byChannelKeyForBackfill[key] = { chgroup: r.Channel_Group, days: [] })).days.push({
        date: r.order_date,
        gross_inc_gst: parseFloat(r.gross_inc_gst) || 0,
        gross_exc_gst: parseFloat(r.gross_exc_gst) || 0,
        return_rev: parseFloat(r.return_rev) || 0,
        orders: parseInt(r.orders) || 0,
      })
    })
    const chgroupByKey = {}
    const daysOnlyByKey = {}
    Object.entries(byChannelKeyForBackfill).forEach(([key, v]) => { chgroupByKey[key] = v.chgroup; daysOnlyByKey[key] = v.days })
    // Sum just the estimated (gap-filled) top-up per Channel_Group, keyed back via chgroupByKey.
    // backfillChannelGaps doesn't know the channel key per row any more once flattened, so re-walk
    // per-key here instead of using the flattened list for this part.
    const chgroupTopUp = {}
    Object.entries(daysOnlyByKey).forEach(([key, days]) => {
      const filled = backfillChannelGaps({ [key]: days }, end)
      const estRows = filled.filter(r => r.estimated)
      if (!estRows.length) return
      const chgroup = chgroupByKey[key]
      const t = chgroupTopUp[chgroup] || (chgroupTopUp[chgroup] = { grossIncGst: 0, grossExcGst: 0, orders: 0 })
      estRows.forEach(r => { t.grossIncGst += r.gross_inc_gst; t.grossExcGst += r.gross_exc_gst; t.orders += r.orders })
    })

    // ── Channel-Group rollup (per original spec: "channel group wise u need to show") ──
    const chgroupMap = {}
    rows.forEach(r => {
      const g = chgroupMap[r.channelGroup] || (chgroupMap[r.channelGroup] = {
        channelGroup: r.channelGroup, orders: 0, units: 0, grossIncGst: 0, grossExcGst: 0, netRevenueExcGst: 0,
      })
      g.orders += r.orders; g.units += r.units
      g.grossIncGst += r.grossIncGst; g.grossExcGst += r.grossExcGst; g.netRevenueExcGst += r.netRevenueExcGst
    })
    // Fold in the reporting-lag top-up — Net Revenue for the estimated slice uses the same
    // resolved rate this Channel-Group's own real rows already carry, not a fresh live rate
    // (there's no live return data for a day that hasn't posted yet).
    Object.entries(chgroupTopUp).forEach(([chgroup, t]) => {
      const g = chgroupMap[chgroup]
      if (!g) return
      const priorRate = g.grossExcGst > 0 ? 1 - g.netRevenueExcGst / g.grossExcGst : 0
      g.orders += t.orders
      g.grossIncGst += t.grossIncGst; g.grossExcGst += t.grossExcGst
      g.netRevenueExcGst += t.grossExcGst * (1 - priorRate)
      g.estimatedGrossIncGst = t.grossIncGst
    })
    const channelGroups = Object.values(chgroupMap)
      .map(g => ({ ...g, returnPct: g.grossExcGst > 0 ? 1 - g.netRevenueExcGst / g.grossExcGst : 0 }))
      .sort((a, b) => b.grossIncGst - a.grossIncGst)

    // ── Top Products, rolled up to Sub-category (Finance) × Channel Group — per explicit
    // instruction (2026-10-21) this is a Sub-category view, not a per-SKU one. Net Revenue here
    // is the SUM of each underlying SKU's already-resolved Net Revenue (not re-derived from a
    // blended rate), so it stays consistent with the SKU-level numbers feeding every other view.
    const topProductsMap = {}
    rows.forEach(r => {
      const key = `${r.channelGroup}::${r.category}::${r.subCategory}`
      const g = topProductsMap[key] || (topProductsMap[key] = {
        category: r.category, subCategory: r.subCategory, channelGroup: r.channelGroup,
        orders: 0, units: 0, grossIncGst: 0, grossExcGst: 0, netRevenueExcGst: 0, skuCount: 0,
      })
      g.orders += r.orders; g.units += r.units
      g.grossIncGst += r.grossIncGst; g.grossExcGst += r.grossExcGst; g.netRevenueExcGst += r.netRevenueExcGst
      g.skuCount += 1
    })
    const topProducts = Object.values(topProductsMap)
      .map(g => ({ ...g, returnPct: g.grossExcGst > 0 ? 1 - g.netRevenueExcGst / g.grossExcGst : 0 }))
      .sort((a, b) => b.grossIncGst - a.grossIncGst)
      .slice(0, 50)

    // ── Daily trend ──
    // Overall resolved return% across all rows (already run through the SKU -> Sub-category ->
    // Category mature-rate fallback chain above) — applied to any day inside the immature window
    // instead of that day's own raw live rate, which would otherwise show an artificially low
    // Return% for the most recent days simply because those orders haven't had time to RTO/return
    // yet (confirmed 2026-10-21 — "should be as per the calculated return", not the live one).
    // Mature days keep their own real day-level rate, which is already trustworthy there.
    // Totals are summed from channelGroups (not re-derived from rows + a separately-computed
    // top-up) so they reconcile exactly with the Channel-Group table — channelGroups already
    // applies each group's OWN resolved rate to its own top-up (see the "Fold in the
    // reporting-lag top-up" block above); re-deriving totals with a single blended overall rate
    // instead would silently disagree with channelGroups by the gap between Marketplace's own
    // rate and the all-channel blended rate (confirmed live 2026-10-21, ~₹41k on a 20-day range).
    const overallGrossIncGst = channelGroups.reduce((s, g) => s + g.grossIncGst, 0)
    const overallGrossExcGst = channelGroups.reduce((s, g) => s + g.grossExcGst, 0)
    const overallNetRevenueExcGst = channelGroups.reduce((s, g) => s + g.netRevenueExcGst, 0)
    const overallResolvedReturnPct = overallGrossExcGst > 0 ? 1 - overallNetRevenueExcGst / overallGrossExcGst : 0
    const overallOrders = channelGroups.reduce((s, g) => s + g.orders, 0)
    const totalTopUpGrossIncGst = Object.values(chgroupTopUp).reduce((s, t) => s + t.grossIncGst, 0)

    // Re-use the per-channel daily rows already grouped above (daysOnlyByKey) and back-fill the
    // same reporting-lag gap for the trend line specifically — one combined daily series, so a
    // channel's late feed doesn't show up as a dip in Gross Revenue for the most recent day(s).
    const backfilledByChannel = backfillChannelGaps(daysOnlyByKey, end)
    const dailyAgg = {}
    backfilledByChannel.forEach(r => {
      const d = dailyAgg[r.date] || (dailyAgg[r.date] = { gross_inc_gst: 0, gross_exc_gst: 0, return_rev: 0, orders: 0, hasEstimate: false })
      d.gross_inc_gst += r.gross_inc_gst; d.gross_exc_gst += r.gross_exc_gst
      d.return_rev += r.return_rev; d.orders += r.orders
      if (r.estimated) d.hasEstimate = true
    })

    const dailyTrend = Object.keys(dailyAgg).sort().map(date => {
      const r = dailyAgg[date]
      const grossIncGst = r.gross_inc_gst
      const grossExcGst = r.gross_exc_gst
      const returnRev = r.return_rev
      const liveReturnPct = grossIncGst > 0 ? returnRev / grossIncGst : 0
      const dayIsImmature = needsMatureRate && rangeTouchesImmatureWindow(date)
      const returnPct = dayIsImmature ? overallResolvedReturnPct : liveReturnPct
      return {
        date,
        grossIncGst, grossExcGst,
        netRevenueExcGst: grossExcGst * (1 - returnPct),
        returnPct,
        orders: Math.round(r.orders),
        hasEstimate: r.hasEstimate,
      }
    })

    res.status(200).json({
      rows,
      channelGroups,
      topProducts,
      dailyTrend,
      totals: {
        grossIncGst: overallGrossIncGst, grossExcGst: overallGrossExcGst,
        netRevenueExcGst: overallNetRevenueExcGst, returnPct: overallResolvedReturnPct,
        orders: overallOrders, units: rows.reduce((s, r) => s + r.units, 0),
        hasEstimate: totalTopUpGrossIncGst > 0,
      },
      geo: { regionTier: results.geoRegionTier, state: results.geoState },
      meta: { needsMatureRate, rollingStart, rollingEnd, minMatureUnits: MIN_MATURE_UNITS, volumeRatioMin: VOLUME_RATIO_MIN, returnRateCeiling: RETURN_RATE_CEILING },
    })
  } catch (err) {
    console.error('[api/financial-mis]', err.message)
    res.status(500).json({ error: err.message })
  }
}
