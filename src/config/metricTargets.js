import { C } from '../utils.js'

// Status targets for tile colour edges / value colours (green = on target, amber = watch, red = act).
//
// A metric with no target (null) is NEUTRAL: no colour edge, no status colour. Fill targets in here;
// nothing else needs to change. Shape: { lowerIsBetter, amber, red } - the value crosses into amber
// past `amber` and into red past `red` (in the bad direction).
//
// Only Return % is pre-filled: the thresholds the dashboard already used everywhere (red > 15%,
// amber > 8%), now kept in one place so every card applies the same rule.
export const METRIC_TARGETS = {
  returnPct: { lowerIsBetter: true, amber: 8, red: 15 },
  // Logistics & Ops
  delPct: null,
  rtoPct: null,
  zRtoPct: null,
  ndrPct: null,
  ndrResolvedPct: null,
  fasr: null,
  rasr: null,
  slaBreachPct: null,
  // Customers
  repeatRate: null,
  // Inventory
  stockoutRiskSkus: null,
  deadStockUnits: null,
}

// P&L margin watchlist bars per channel group (PNL_MASTER_PLAN.md Part B §1; D2C confirmed, the rest
// proposals — change them here, nothing else needs to change). Percent values; null = rule off for
// that group (EBO/Offline have no real CM2, so no "Below healthy ROAS").
//   cm1: CM1 % below → flag · cogs: COGS % above · gm: GM % below · ret: Returns % (of gross) above
//   cm2Target: the "healthy" CM2 % · aspDrop: ASP down more than this % vs the previous period
//   retUp: Returns % up more than this many points vs the previous period
// Suraj 27 Oct (DECISIONS P1/P2): no GM rule on D2C (GM = 100 − COGS there, so it repeated the COGS
// rule); ASP down > 10% everywhere; EBO/Offline COGS > 50% / GM < 40%; Flipkart COGS > 50% (override).
export const PNL_RULE_BARS = {
  d2c:         { label: 'D2C', cm1: 30, cogs: 50, gm: null, ret: 25, cm2Target: 15, aspDrop: 10, retUp: 3 },
  marketplace: { label: 'Amazon, Flipkart, Myntra', cm1: 20, cogs: 45, gm: 40, ret: 15, cm2Target: 10, aspDrop: 10, retUp: 3 },
  quick:       { label: 'Blinkit, Instamart, Zepto', cm1: 18, cogs: 45, gm: 35, ret: 5, cm2Target: 8, aspDrop: 10, retUp: 2 },
  smallMarket: { label: 'CRED, Firstcry', cm1: 20, cogs: 45, gm: 40, ret: 10, cm2Target: 10, aspDrop: 10, retUp: 3 },
  store:       { label: 'EBO, Offline', cm1: 30, cogs: 50, gm: 40, ret: 10, cm2Target: null, aspDrop: 10, retUp: 3 },
}
// One tab's bars that differ from its group's (merged over them; the label then names the tab).
// Suraj 27 Oct (P4 c): Offline COGS > 60%, Flipkart COGS > 55%, Amazon Returns > 20%, D2C Returns > 25%.
export const PNL_RULE_BAR_OVERRIDES = {
  flipkart: { label: 'Flipkart', cogs: 55 },
  amazon: { label: 'Amazon', ret: 20 },
  offline: { label: 'Offline', cogs: 60 },
}
export const PNL_CHANNEL_GROUP = {
  shopify: 'd2c', amazon: 'marketplace', flipkart: 'marketplace', myntra: 'marketplace',
  blinkit: 'quick', instamart: 'quick', zepto: 'quick', cred: 'smallMarket', firstcry: 'smallMarket',
  ebo: 'store', offline: 'store',
}
// A product is only checked if it has at least this share of the tab's gross revenue OR this many
// units in the period, so tiny products (e.g. Firstcry, 2–11 units each) don't flag every row.
export const PNL_MATERIALITY = { minShareOfGross: 0.02, minUnits: 100 }
// Rows left out of the watchlist / matrix but kept in the table with an ⓘ (DECISIONS P3): "Others" is
// not a product — it holds sales with no sub-category and ad spend not mapped to a product.
export const PNL_WATCHLIST_EXCLUDE = new Set(['Others'])
export const PNL_OTHERS_INFO = 'Not a product: sales with no sub-category, plus ad spend not mapped to a product. Left out of the margin watchlist.'

// Ads watchlist (ADS_MASTER_PLAN.md Part B §1.5). Products with less than minSpend in the period aren't
// flagged. ROAS here is total-sales ROAS (channel sales ex GST ÷ spend), the Ads page's own ROAS.
export const ADS_RULES = {
  minSpend: 10000,            // ₹ — materiality
  noSalesSpend: 10000,        // 'Spend, no sales': spend above this …
  noSalesRoas: 0.5,           // … and ROAS below this
  unattributedShare: 0.20,    // 'Unattributed spend': share of spend not linked to a product
  roasDropPct: 20,            // 'ROAS down': ▼ at least this % vs the previous period
  roasDropMinSpend: 50000,    // … and at least this ₹ spend in BOTH periods (D7, Suraj 27 Oct; was minSpend ₹10 K)
  cpcUpPct: 15,               // 'CPC up': ▲ at least this % vs the previous period
}

// Customer health watchlist (CUSTOMER_MASTER_PLAN.md Part B §B2.1).
export const CUSTOMER_RULES = {
  cacUpPct: 10,               // 'Acquisition getting expensive': CAC ▲ at least this % while ROAS ▼
  ltvCacMin: 3,               // 'LTV:CAC below 3x'
  m1DropPts: 0.5,             // 'M1 retention slipping': latest complete cohort below its 12-cohort average by this many pts
  m1MinCohort: 1000,          // … only cohorts with at least this many customers
  repeatRevDropPts: 2,        // 'Repeat revenue share down': ▼ at least this many pts vs the previous period
  discountGapPts: 5,          // 'Discount dependence': repeat rate of discounted − non-discounted orders
  winBackSegments: ['Hibernating', 'Cannot Lose Them'],
}

// Customer Support watchlist (CUSTOMER_MASTER_PLAN.md Part B §B2.4).
export const SUPPORT_RULES = {
  pendingDays: 8,             // 'Pending > 8 days': tickets in the 9-10, 11-15 and 15+ day buckets
  frtTargetSec: { Chat: 15 * 60, Email: 4 * 60 * 60, 'Social media': 30 * 60 }, // Suraj 27 Oct (C8): starting targets, to confirm with the CS head
  frtMinReplies: 20,          // a channel needs this many agent replies to be checked
  escalationUpPts: 0.3,       // 'Escalation rate up': ▲ at least this many pts
  per100UpPct: 10,            // 'Contacts per 100 orders up': ▲ at least this %
}

// Alerts Phase 1 bell rules — approved 2026-10-31 (docs/ALERTS_PHASE1_PROMPT.md + the 90-day
// backtest in docs/ALERTS_BACKTEST.md). One block, one source of truth for every bell threshold;
// computeCombinedAlerts (src/utils.js) reads these, nothing else needs to change to retune a bar.
// #8 (D2C CM1%/COGS%) and #12 (D2C SnD%) are explicitly OUT of Phase 1 — left as comments only in
// computeCombinedAlerts, not built, per the task brief.
export const ALERT_RULES = {
  // #1 Top-20 SKU stockout risk (inventory) — backtest: not backtestable (no historical inventory
  // snapshot series in BQ); keep the existing in-app rule as-is. approved 2026-10-31.
  top20StockoutMinAtRisk: 1,
  // #2 Fleet-wide stockout risk (inventory) — backtest: not backtestable from history either; keep
  // the existing "> 250 SKUs" threshold as-is (this is NOT the >50 number, which is Alert #5's
  // candidate). approved 2026-10-31.
  fleetStockoutSkus: 250,
  // #3 Forward delivery % below threshold (logistics) — backtest recommends tightening the naive
  // <90% bar (17.3% of mature days) to <88% (true floor, 0/75 fired in the 90-day window), evaluated
  // over the latest mature 7 order-days. approved 2026-10-31.
  deliveryPctMin: 88,
  // #4 Forward RTO % above threshold (logistics, Clickpost) — backtest: >8% over-fires (41.3% of
  // days); tighten to >9.5% (between real p90 9.05% and max 10.36%, 3/75 fired). approved 2026-10-31.
  rtoPctMax: 9.5,
  // #5 Stuck shipments above N (logistics) — backtest: proxy methodology not directly comparable to
  // the live snapshot tile; keep N=50 (the brief's number, inside the backtest's own >50 candidate
  // band of 10/85 fired = 11.8%). approved 2026-10-31.
  stuckShipmentsMax: 50,
  // #6 D2C return-rate red lines, bell-only (sales:shopify) — backtest: the live page's own
  // RED_THRESH (cancel 3/rto 9/cir 9/exchange 6/total 20) is badly miscalibrated loose-to-tight
  // drift; tighten each to ~p90 of the real 90-day distribution for the BELL condition only — the
  // live Return Analysis page's own RED_THRESH/colors (src/sales/returnAnalysisData.js) are
  // untouched. approved 2026-10-31.
  d2cRedLines: { cancelPct: 6.5, rtoPct: 10, cirPct: 9, exchangePct: 8, totalReturnPct: 28 },
  // #7 Channel with 0 orders (sales per channel) — backtest: CRED (5/90 true-zero days, 5.6%) and
  // Firstcry (11/90, 12.2%) are naturally thin/intermittent channels, excluded per the backtest's
  // recommendation; all other Sales channels checked for a true 0-orders day. approved 2026-10-31.
  zeroOrderExcludeChannels: ['CRED', 'Firstcry'],
  // #9 Ads: spend with no sales (ads:<channel>) — backtest: already well-calibrated (1/~90
  // channel-days fired); keep ADS_RULES.noSalesSpend/noSalesRoas as-is, reused directly, no new
  // constant needed here. approved 2026-10-31.
  // #10 Inventory data stale > 2h (admin) — backtest: not backtestable (file-timestamp check, not
  // historical data); keep the existing 2h fallback convention from api/inventory.js. approved 2026-10-31.
  inventoryStaleHours: 2,
  // #11 TAT/EDD breach % (SLA-breach share of delivered-with-EDD), forward (logistics) — backtest:
  // flat >15% bar sits at the real p90/p95 boundary (7/75 fired, 9.3%); >10% over-fires at 70.7%.
  // approved 2026-10-31.
  slaBreachPctMax: 15,
  // #13 Customers: CAC up WoW (customer) — backtest: existing CUSTOMER_RULES.cacUpPct=10 backtests
  // acceptably (3/11 weeks, 27.3%, under the 1-in-3 ceiling) but brief asks for >=15%; using a
  // bell-specific constant here (NOT overwriting CUSTOMER_RULES.cacUpPct, which also drives the
  // Customer Intelligence page's own in-page tile coloring at 10% — changing that shared constant
  // would silently recolor an unrelated in-page tile). approved 2026-10-31.
  cacUpPctBell: 15,
  // Logistics alerts (#3/#4/#11) evaluate the latest mature 7 order-days — forward shipments only,
  // excluding the last 15 immature order-days per getMaturityAdjustedRange's own convention (same
  // 15-day boundary the backtest itself used for Alerts 3/4/11).
  logisticsLookbackDays: 7,
}

// 'good' | 'warn' | 'bad' | null (null = no target, show neutral)
export function metricStatus(key, value) {
  const t = METRIC_TARGETS[key]
  if (!t || value == null || !isFinite(value)) return null
  if (t.lowerIsBetter) return value > t.red ? 'bad' : value > t.amber ? 'warn' : 'good'
  return value < t.red ? 'bad' : value < t.amber ? 'warn' : 'good'
}

// Text colour for a status (null = default ink).
export function statusColor(status) {
  return status === 'bad' ? C.red.tx : status === 'warn' ? C.amber.tx : status === 'good' ? C.green.tx : null
}
