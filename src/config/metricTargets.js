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
export const PNL_RULE_BARS = {
  d2c:         { label: 'D2C', cm1: 30, cogs: 50, gm: 50, ret: 20, cm2Target: 15, aspDrop: 5, retUp: 3 },
  marketplace: { label: 'Amazon, Flipkart, Myntra', cm1: 20, cogs: 45, gm: 40, ret: 15, cm2Target: 10, aspDrop: 5, retUp: 3 },
  quick:       { label: 'Blinkit, Instamart, Zepto', cm1: 18, cogs: 45, gm: 35, ret: 5, cm2Target: 8, aspDrop: 5, retUp: 2 },
  smallMarket: { label: 'CRED, Firstcry', cm1: 20, cogs: 45, gm: 40, ret: 10, cm2Target: 10, aspDrop: 5, retUp: 3 },
  store:       { label: 'EBO, Offline', cm1: 30, cogs: 45, gm: 45, ret: 10, cm2Target: null, aspDrop: 5, retUp: 3 },
}
export const PNL_CHANNEL_GROUP = {
  shopify: 'd2c', amazon: 'marketplace', flipkart: 'marketplace', myntra: 'marketplace',
  blinkit: 'quick', instamart: 'quick', zepto: 'quick', cred: 'smallMarket', firstcry: 'smallMarket',
  ebo: 'store', offline: 'store',
}
// A product is only checked if it has at least this share of the tab's gross revenue OR this many
// units in the period, so tiny products (e.g. Firstcry, 2–11 units each) don't flag every row.
export const PNL_MATERIALITY = { minShareOfGross: 0.01, minUnits: 50 }

// Ads watchlist (ADS_MASTER_PLAN.md Part B §1.5). Products with less than minSpend in the period aren't
// flagged. ROAS here is total-sales ROAS (channel sales ex GST ÷ spend), the Ads page's own ROAS.
export const ADS_RULES = {
  minSpend: 10000,            // ₹ — materiality
  noSalesSpend: 10000,        // 'Spend, no sales': spend above this …
  noSalesRoas: 0.5,           // … and ROAS below this
  unattributedShare: 0.20,    // 'Unattributed spend': share of spend not linked to a product
  roasDropPct: 20,            // 'ROAS down': ▼ at least this % vs the previous period
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
