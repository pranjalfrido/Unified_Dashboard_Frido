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
