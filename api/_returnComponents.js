// Per-component, SKU-wise, day-wise Return Revenue resolution — confirmed design 2026-10-22,
// generalized to every channel 2026-10-22. Replaces the old single-blended-rate approach for any
// day inside the last 15 days of a selected range, with each component independently resolved
// (not one shared "Total Return%" rolling average applied across the board).
//
// Logic, per (SKU, day), per component:
//   MATURE day (older than 15 days from today):
//     revenue_resolved = that day's own REAL component revenue (from BigQuery)
//     pct_resolved      = revenue_resolved / that day's own real gross revenue
//   IMMATURE day (within the last 15 days from today):
//     pct_resolved      = this SKU's rolling 30-day-window rate for THIS component
//                        = (component revenue over [today-44d, today-14d]) / (gross revenue over
//                          that same window) — window convention matches buildReturnRateMature
//                          elsewhere in this codebase (rollingEnd = today-14d, rollingStart =
//                          rollingEnd-29d).
//     revenue_resolved  = pct_resolved * THIS DAY'S OWN real gross revenue (not the rolling
//                          window's gross) — so an immature day with an unusually high/low volume
//                          scales its estimated return revenue with its own real volume instead of
//                          inheriting a stale rolling-window ₹ amount.
//
// Total Return Revenue (sku, day) = sum of every component in that channel's RETURN_COMPONENTS
//   list — Exchange (where a channel has it) is tracked and returned separately, NEVER included
//   in Total Return Revenue/%, matching every existing Return% formula in this app (customer
//   keeps the product either way).
// Net Revenue (sku, day) = gross - Total Return Revenue (sku, day)
//
// Aggregation to any higher grain (SubCategory/Category/Channel/Overall) is a plain SUM of the
// resolved per-(sku,day) revenue amounts, divided by summed gross — never a second averaging step.
//
// Per-channel component mapping — confirmed live against real Order_Status values 2026-10-22, and
// cross-checked against the already-verified allTabReturnRateMature formula (api/bq.js) so this
// doesn't silently diverge from the one other place in this codebase that already enumerates every
// channel's return-status rules:
//   Shopify (D2C):    RTO, CIR, Cancelled are RETURN components; Exchange tracked separately.
//                      No 'Return' status exists for this channel at all.
//   Amazon, Flipkart,
//   Myntra, Retail
//   (EBO):             RTO, Return, CIR, Cancelled are ALL RETURN components (no Exchange status
//                      exists for Amazon/Flipkart/Myntra; Retail/EBO does have Exchange, tracked
//                      separately there).
//   CRED, Firstcry:    Return only.
//   offline_sales:     Credit Note only (its own vocabulary, no RTO/Return/CIR/Cancelled).
//   Blinkit, Instamart,
//   Zepto:             SKIPPED — confirmed live 2026-10-22 that Order_Status is always NULL for
//                      these three, so there is no per-order status data to resolve a rate from.
import { buildQuery } from './_bq.js'

export function rollingMatureWindow() {
  const today = new Date()
  const rollingEndD = new Date(today); rollingEndD.setDate(rollingEndD.getDate() - 14)
  const rollingStartD = new Date(rollingEndD); rollingStartD.setDate(rollingStartD.getDate() - 29)
  return { rollingStart: rollingStartD.toISOString().slice(0, 10), rollingEnd: rollingEndD.toISOString().slice(0, 10) }
}

// Same 15-day maturity cutoff used throughout the app (src/utils.js's rangeTouchesImmatureWindow),
// re-derived here since this module is server-side only and doesn't share that client module.
const IMMATURE_CUTOFF_DAYS = 15
export function isImmatureDay(dateStr) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - IMMATURE_CUTOFF_DAYS)
  return new Date(dateStr) > cutoff
}

// key: the field name used throughout this module's output (e.g. 'rto', 'return', 'creditNote').
// status: the exact Order_Status string this component matches in BigQuery.
// isReturn: true if this component counts toward Total Return Revenue/%; false if it's tracked
//   separately (Exchange) and never deducted.
export const CHANNEL_COMPONENTS = {
  shopify: [
    { key: 'rto', status: 'RTO', isReturn: true },
    { key: 'cir', status: 'CIR', isReturn: true },
    { key: 'cancel', status: 'Cancelled', isReturn: true },
    { key: 'exchange', status: 'Exchange', isReturn: false },
  ],
  amazonSC: [
    { key: 'rto', status: 'RTO', isReturn: true },
    { key: 'return', status: 'Return', isReturn: true },
    { key: 'cir', status: 'CIR', isReturn: true },
    { key: 'cancel', status: 'Cancelled', isReturn: true },
  ],
  amazonVC: [{ key: 'return', status: 'Return', isReturn: true }],
  // Amazon SC has NO RTO status at all (confirmed live 2026-10-22 over a 2.5-month window — real
  // vocabulary is Delivered/Return/Cancelled/Dispatched/null only). Tracks Return + Cancelled;
  // 'rto' key kept at 0 contribution is NOT included here (unlike the SKU-grain amazonSC list,
  // left alone per explicit instruction since it causes no wrong numbers there).
  amazonSCGeo: [
    { key: 'return', status: 'Return', isReturn: true },
    { key: 'cancel', status: 'Cancelled', isReturn: true },
  ],
  // Flipkart also has NO RTO status at all (confirmed live 2026-10-22, same finding as Amazon SC).
  // Tracks Return + Cancelled.
  flipkartGeo: [
    { key: 'return', status: 'Return', isReturn: true },
    { key: 'cancel', status: 'Cancelled', isReturn: true },
  ],
  // Myntra genuinely has NO RTO or CIR status at all (confirmed live 2026-10-22 — its real
  // Order_Status vocabulary is Delivered/Dispatched/Return/Cancelled/null only; an earlier version
  // of this config incorrectly included RTO/CIR, which silently always resolved to 0 and made the
  // geography total disagree with the SKU-level total by exactly the missing Cancelled share).
  // Tracks Return + Cancelled, matching the full SKU-grain myntra list below.
  myntraGeo: [
    { key: 'return', status: 'Return', isReturn: true },
    { key: 'cancel', status: 'Cancelled', isReturn: true },
  ],
  // EBO has no RTO status either (confirmed live — Retail/Retail Store's real vocabulary is
  // Delivered/Exchange/CIR/Dispatched/Return/Cancelled/null). Tracks Return + CIR + Cancelled.
  eboGeo: [
    { key: 'return', status: 'Return', isReturn: true },
    { key: 'cir', status: 'CIR', isReturn: true },
    { key: 'cancel', status: 'Cancelled', isReturn: true },
  ],
  flipkart: [
    { key: 'rto', status: 'RTO', isReturn: true },
    { key: 'return', status: 'Return', isReturn: true },
    { key: 'cir', status: 'CIR', isReturn: true },
    { key: 'cancel', status: 'Cancelled', isReturn: true },
  ],
  myntra: [
    { key: 'rto', status: 'RTO', isReturn: true },
    { key: 'return', status: 'Return', isReturn: true },
    { key: 'cir', status: 'CIR', isReturn: true },
    { key: 'cancel', status: 'Cancelled', isReturn: true },
  ],
  ebo: [
    { key: 'rto', status: 'RTO', isReturn: true },
    { key: 'return', status: 'Return', isReturn: true },
    { key: 'cir', status: 'CIR', isReturn: true },
    { key: 'cancel', status: 'Cancelled', isReturn: true },
    { key: 'exchange', status: 'Exchange', isReturn: false },
  ],
  // CRED/Firstcry confirmed live 2026-10-21 to have BOTH Return and Cancelled statuses (not just
  // Return alone, as an earlier pass assumed) — both tracked as separate components now.
  cred: [
    { key: 'return', status: 'Return', isReturn: true },
    { key: 'cancel', status: 'Cancelled', isReturn: true },
  ],
  firstcry: [
    { key: 'return', status: 'Return', isReturn: true },
    { key: 'cancel', status: 'Cancelled', isReturn: true },
  ],
  offline: [{ key: 'creditNote', status: 'Credit Note', isReturn: true }],
}

// offline_sales uses 'credit_note_rev'/'creditNote', not a generic status-matched column (its
// query groups Sales vs Credit Note directly, not via the status-driven column-builder helpers
// below) — buildRollingRateMap/resolveDailySkuComponents both key off `${c.key}_rev`, so this
// mapping's key 'creditNote' expects a 'creditNote_rev' field. The offline queries above instead
// emit 'credit_note_rev', so callers remap that field name before calling these functions (see
// api/bq.js's offline wiring).

// Builds the day-wise, SKU-wise component query for a given channel config. whereClause supplies
// the Channel/SubChannel scoping (varies per caller — e.g. Flipkart's base query already scopes
// to Channel='Flipkart' via its own WHERE, Amazon SC needs SubChannel='Amazon Seller Central',
// etc.) so this function stays channel-agnostic.
export function dailySkuComponentsQuery(start, end, whereClause, components) {
  const base = buildQuery(start, end, {})
  const cols = components.map(c => `SUM(CASE WHEN Order_Status = '${c.status.replace(/'/g, "''")}' THEN SellingPrice_Inc_GST ELSE 0 END) AS ${c.key}_rev`).join(',\n      ')
  return `WITH q AS (${base}) SELECT
      MasterSKU AS sku, CAST(OrderDate AS STRING) AS order_date,
      SUM(SellingPrice_Inc_GST) AS gross_inc_gst,
      ${cols}
    FROM q
    WHERE ${whereClause} AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != ''
    GROUP BY sku, order_date`
}

// Same shape, no day dimension — one rolling-window total per SKU, used to derive each SKU's own
// rolling rate per component.
export function rollingSkuComponentsQuery(rollingStart, rollingEnd, whereClause, components) {
  const base = buildQuery(rollingStart, rollingEnd, {})
  const cols = components.map(c => `SUM(CASE WHEN Order_Status = '${c.status.replace(/'/g, "''")}' THEN SellingPrice_Inc_GST ELSE 0 END) AS ${c.key}_rev`).join(',\n      ')
  return `WITH q AS (${base}) SELECT
      MasterSKU AS sku,
      SUM(SellingPrice_Inc_GST) AS gross_inc_gst,
      ${cols}
    FROM q
    WHERE ${whereClause} AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != ''
    GROUP BY sku`
}

// Builds { [sku]: { [componentKey]: rate } } rolling RATES (0-1) from the rolling-window query's
// rows, for the given component list. entityKeyFn defaults to r.sku (every existing caller is
// SKU-grain); geography-grain callers (Top States/Top Cities, confirmed 2026-10-22) pass a
// different key, e.g. r => r.state or r => `${r.city}::${r.state}`.
export function buildRollingRateMap(rollingRows, components, entityKeyFn = r => r.sku) {
  const map = {}
  rollingRows.forEach(r => {
    const gross = parseFloat(r.gross_inc_gst) || 0
    if (gross <= 0) return
    const rates = {}
    components.forEach(c => { rates[c.key] = (parseFloat(r[`${c.key}_rev`]) || 0) / gross })
    map[entityKeyFn(r)] = rates
  })
  return map
}

// Resolves each (entity, day) row from the daily query into its final component revenues, per the
// logic documented at the top of this file. Returns one row per (entity, day) with the resolved ₹
// revenue AND resolved % for every component in `components`, plus totalReturnRev/totalReturnPct
// (sum of only the isReturn:true components) /netRevenue. entityKeyFn must match the one passed to
// buildRollingRateMap above.
export function resolveDailySkuComponents(dailyRows, rollingRateMap, components, entityKeyFn = r => r.sku) {
  return dailyRows.map(r => {
    // rateLookupKey finds this row's rolling rate (may be a composite key, e.g. 'sku::subchannel'
    // or 'state'); sku is always the row's OWN identifying field for display/grouping downstream —
    // these are deliberately kept separate so a composite rate-lookup key never leaks into the
    // output as if it were a real SKU/state/city name.
    const rateLookupKey = entityKeyFn(r)
    const sku = r.sku ?? rateLookupKey
    const date = r.order_date
    const gross = parseFloat(r.gross_inc_gst) || 0
    const units = parseFloat(r.units) || 0
    const immature = isImmatureDay(date)
    const rolling = rollingRateMap[rateLookupKey]

    const resolved = {}
    components.forEach(c => {
      if (!immature) {
        const rev = parseFloat(r[`${c.key}_rev`]) || 0
        const pct = gross > 0 ? rev / gross : 0
        resolved[c.key] = { rev, pct, units: pct * units, source: 'live' }
      } else {
        const pct = rolling ? rolling[c.key] : 0
        resolved[c.key] = { rev: pct * gross, pct, units: pct * units, source: rolling ? 'rolling_30d' : 'no_rolling_data' }
      }
    })

    let totalReturnRev = components.filter(c => c.isReturn).reduce((s, c) => s + resolved[c.key].rev, 0)
    // Guardrail (confirmed 2026-10-22): an IMMATURE day's rolling-rate estimate is capped at that
    // day's own gross, so Net Revenue never goes negative purely from an estimation artifact.
    // Mature/live days are NEVER capped — if a real day genuinely had more returns than gross,
    // that's true data and must be shown as-is, not smoothed away. This matters most for lumpy,
    // low-and-irregular-volume channels (confirmed live for offline_sales/B2B: a day's real Credit
    // Note volume doesn't track that SAME day's Sales volume the way online-channel returns do a
    // few days after the original sale, so a rolling rate x a small/zero-gross immature day can
    // overshoot 100% of that day's gross).
    if (immature && gross > 0 && totalReturnRev > gross) {
      const scale = gross / totalReturnRev
      components.filter(c => c.isReturn).forEach(c => { resolved[c.key].rev *= scale; resolved[c.key].pct *= scale; resolved[c.key].units *= scale })
      totalReturnRev = gross
    }
    const totalReturnPct = gross > 0 ? totalReturnRev / gross : 0
    const netRevenue = gross - totalReturnRev
    // resolvedReturnUnits/netUnits (confirmed 2026-10-22: "net qty now should be calculated based
    // on the revised return%... units*(1-return%), done sku/product/subcat/category/date-wise, AND
    // per-component — cir_units = resolved_cir%*units, rto_units = resolved_rto%*units, etc.") —
    // units follow the EXACT SAME live-vs-rolling-30d resolution as revenue, broken out per
    // component (resolved[c.key].units above) the same way revenue already is, not one blended
    // returned-unit count. Previously, an immature day's Net Revenue already assumed a rolling-rate
    // share of that day's gross would come back, but netUnits (pnlUtils.js's netRevenueOf) still
    // used that day's raw, near-zero actual returned-unit count (the real return hasn't posted yet
    // operationally) — so COGS/GM on a recent day was priced on ~all units sold while revenue
    // already discounted a chunk of them. resolvedReturnUnits (the isReturn-only components summed)
    // keeps netUnits consistent with totalReturnRev/totalReturnPct on every day, mature or immature.
    const resolvedReturnUnits = components.filter(c => c.isReturn).reduce((s, c) => s + resolved[c.key].units, 0)
    const netUnits = Math.max(units - resolvedReturnUnits, 0)

    // r.subChannel (D2C's MyFrido/Mobility split) and r.category/r.subCategory (Flipkart's
    // Category/SubCategory filter, added 2026-10-22) pass through untouched when present — lets
    // callers filter the resolved array by sub-channel/category without a fragile positional
    // re-join against the original input array.
    return {
      sku, date, gross, units,
      ...(r.subChannel !== undefined ? { subChannel: r.subChannel } : {}),
      ...(r.category !== undefined ? { category: r.category } : {}),
      ...(r.subCategory !== undefined ? { subCategory: r.subCategory } : {}),
      components: resolved,
      totalReturnRev, totalReturnPct, netRevenue,
      resolvedReturnUnits, netUnits,
      immature,
    }
  })
}
