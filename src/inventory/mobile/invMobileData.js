// Inventory Health mobile data (INVENTORY_MOBILE_REDESIGN_PROMPT.md §2). Display shaping only:
// every number comes from the desktop page's own memos (InventoryHealthPage regularSkus /
// filteredSkus / pivot / locations) - this file groups and sums them, nothing else.

// Category / sub-category DOI (user decision 2026-10-26): the row's total units ÷ its total avg
// sale per day, the same "units ÷ ceil(avg sale)" rounding as the location DOI; null (shown "—")
// when there is no avg sale.
export const groupDoi = (totalInvt, avgSale) => (avgSale > 0 ? Math.floor(totalInvt / Math.ceil(avgSale)) : null)

// Warehouse Health rows: the same Regular-only inventory swap as WhCarousel (InventoryHealthPage):
// locations with no Regular facility are dropped, inventory = the Regular facilities' sum; avg sale,
// DOI, status and allocation stay the location's own values.
export function warehouseRows(locations) {
  const hasByType = (locations || []).some(l => l.byFacilityType?.length > 0)
  if (!hasByType) return locations || []
  return locations
    .filter(l => (l.byFacilityType || []).some(f => f.facilityType === 'Regular' && f.totalInvt > 0))
    .map(l => {
      const reg = (l.byFacilityType || []).filter(f => f.facilityType === 'Regular')
      const sum = k => reg.reduce((a, f) => a + (f[k] || 0), 0)
      return { ...l, totalInvt: sum('totalInvt'), rtdInvt: sum('rtdInvt'), rawInvt: sum('rawInvt'), rawBlockedInvt: sum('rawBlockedInvt') }
    })
}

// Stock explorer leaf rows (one per SKU).
//   loc 'All' → the Inventory Detail rows (filteredSkus: Regular facilities, sidebar filters applied):
//               total units, avg sale (B2C), DOI and status exactly as the desktop table shows them.
//   loc 'PNQ'… → the Location-wise matrix cells (pivot rows, Regular share of the cell inventory,
//               the cell's avg sale) for the SKUs that pass the filters; DOI and status are the SKU's
//               own values at that location (regularLocations(s): the desktop row's location expand).
export function explorerSkus({ skus, pivot, loc, regularLocations }) {
  if (loc === 'All') {
    return skus.map(s => ({ key: s.skuKey || s.sku, sku: s.sku, category: s.category, subCategory: s.subCategory, totalInvt: s.totalInvt, avgSale: s.avgSale, doi: s.doi, status: s.stockStatus, s }))
  }
  const bySku = new Map(skus.map(s => [s.sku, s]))
  const out = []
  for (const r of pivot.rows) {
    const s = bySku.get(r.sku)
    if (!s) continue
    const cell = r.byLocation[loc]
    if (!cell) continue
    const totalInvt = cell.byFacilityType?.Regular || 0
    const avgSale = cell.avgSale || 0
    if (totalInvt <= 0 && avgSale <= 0) continue
    const at = regularLocations(s).find(l => l.location === loc)
    out.push({ key: s.skuKey || s.sku, sku: r.sku, category: r.category, subCategory: r.subCategory, totalInvt, avgSale, doi: at ? at.doi : null, status: at?.stockStatus || null, s })
  }
  return out
}

// Group leaf rows into category / sub-category rows: summed units and avg sale, SKU counts by status.
export function groupRows(items, field) {
  const m = new Map()
  for (const it of items) {
    const k = it[field]
    if (!m.has(k)) m.set(k, { key: k, name: k, totalInvt: 0, avgSale: 0, counts: {}, skuCount: 0 })
    const g = m.get(k)
    g.totalInvt += it.totalInvt || 0
    g.avgSale += it.avgSale || 0
    g.skuCount += 1
    if (it.status) g.counts[it.status] = (g.counts[it.status] || 0) + 1
  }
  return [...m.values()].map(g => ({ ...g, doi: groupDoi(g.totalInvt, g.avgSale) })).sort((a, b) => b.totalInvt - a.totalInvt)
}

// Ageing lists without Spare Parts (user decision: display filter, mobile and desktop).
export const withoutSpareParts = rows => (rows || []).filter(r => r.category !== 'Spare Parts')
