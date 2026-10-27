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
  d2c:         { label: 'D2C', cm1: 30, cogs: 50, gm: null, ret: 20, cm2Target: 15, aspDrop: 10, retUp: 3 },
  marketplace: { label: 'Amazon, Flipkart, Myntra', cm1: 20, cogs: 45, gm: 40, ret: 15, cm2Target: 10, aspDrop: 10, retUp: 3 },
  quick:       { label: 'Blinkit, Instamart, Zepto', cm1: 18, cogs: 45, gm: 35, ret: 5, cm2Target: 8, aspDrop: 10, retUp: 2 },
  smallMarket: { label: 'CRED, Firstcry', cm1: 20, cogs: 45, gm: 40, ret: 10, cm2Target: 10, aspDrop: 10, retUp: 3 },
  store:       { label: 'EBO, Offline', cm1: 30, cogs: 50, gm: 40, ret: 10, cm2Target: null, aspDrop: 10, retUp: 3 },
}
// One tab's bars that differ from its group's (merged over them; the label then names the tab).
export const PNL_RULE_BAR_OVERRIDES = {
  flipkart: { label: 'Flipkart', cogs: 50 },
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
