import { C } from '../../utils.js'

// Inventory stock statuses on mobile (docs/responsive/INVENTORY_MOBILE_REDESIGN_PROMPT.md §4, user
// decisions 2026-10-26). The statuses themselves come from the existing logic (api/_inventory_shared.js
// stockStatus / regStockStatus); this file only maps them to the mobile palette - dot + label, no
// pills, no blue. No Demand and Dead / No Sale share one light-grey "Other" segment in mix bars.
const M = C.m
export const STATUS_ORDER = ['Out of Stock', 'Critical', 'Low', 'Sufficient', 'Excess', 'No Demand', 'Dead / No Sale']
export const STATUS_COLOR = {
  'Out of Stock': M.downDark,
  Critical: M.down,
  Low: M.amber,
  Sufficient: M.up,
  Excess: M.muted,
  'No Demand': M.g4,
  'Dead / No Sale': M.g4,
}
export const statusColor = s => STATUS_COLOR[s] || M.g4

// Mix-bar segments, in order. `of` lists the statuses each segment counts.
export const MIX_SEGMENTS = [
  { key: 'oos', label: 'Out of stock', color: STATUS_COLOR['Out of Stock'], of: ['Out of Stock'] },
  { key: 'crit', label: 'Critical', color: STATUS_COLOR.Critical, of: ['Critical'] },
  { key: 'low', label: 'Low', color: STATUS_COLOR.Low, of: ['Low'] },
  { key: 'suff', label: 'Sufficient', color: STATUS_COLOR.Sufficient, of: ['Sufficient'] },
  { key: 'exc', label: 'Excess', color: STATUS_COLOR.Excess, of: ['Excess'] },
  { key: 'other', label: 'Other', color: M.g4, of: ['No Demand', 'Dead / No Sale'] },
]
// counts: { [status]: number } → MixBar parts
export const mixParts = counts => MIX_SEGMENTS.map(s => ({ key: s.key, label: s.label, color: s.color, value: s.of.reduce((a, st) => a + (counts[st] || 0), 0) }))

// Warehouse allocation % colour: same thresholds as desktop allocationColor (InventoryHealthPage):
// under 90% red, over 110% the Excess colour (grey on mobile), otherwise green.
export const allocColor = pct => (pct == null ? M.muted : pct < 90 ? M.down : pct > 110 ? M.muted : M.up)
