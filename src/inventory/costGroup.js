// Product roll-up for the phone "Inventory cost" card. Display only: it adds up rows InventoryCostTable already valued
// (same COGS rate, same sub-category-average rule); it never values anything itself.
//   Product = all SKUs with the same sub-category name (FR-UCBU-B1, -G1, -BG1 -> "Ultimate Car Backrest Cushion").
//   value / units / avg sale = sums of its variants; COGS per unit = value / units; DOI = units / avg sale (blank = no demand).

// Same DOI bands as api/_inventory_shared.js DOI_BANDS and InventoryHealthPage's REG_DOI_BANDS (browser copy: that file reads
// the disk and cannot be imported by the page).
const BANDS = { critical: 2, low: 15, sufficient: 45 }
export function statusFor(doi, avgSale, units) {
  if (!(units > 0)) return 'Out of Stock'
  if (!(avgSale > 0)) return 'No Demand'
  if (doi <= BANDS.critical) return 'Critical'
  if (doi <= BANDS.low) return 'Low'
  if (doi <= BANDS.sufficient) return 'Sufficient'
  return 'Excess'
}

export const hasStock = r => (r.totalInvt || 0) > 0

const byValue = (a, b) => (a.totalCost == null) - (b.totalCost == null) || (b.totalCost || 0) - (a.totalCost || 0)

export function groupProducts(rows) {
  const m = new Map()
  for (const r of rows) {
    const key = r.subCategory || r.sku
    let p = m.get(key)
    if (!p) { p = { key, name: key, variants: [], units: 0, avgSale: 0, value: 0, missingN: 0, avgN: 0, cats: {} }; m.set(key, p) }
    p.variants.push(r)
    p.units += r.totalInvt || 0
    p.avgSale += r.avgSale || 0
    p.value += r.totalCost || 0
    if (r.cogsMap === 'Missing') p.missingN += 1
    if (r.cogsMap === 'Sub-cat avg') p.avgN += 1
    if (r.category) p.cats[r.category] = (p.cats[r.category] || 0) + 1
  }
  return [...m.values()].map(p => {
    p.variants.sort(byValue)
    p.category = Object.entries(p.cats).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
    p.cogs = p.units > 0 && p.value > 0 ? p.value / p.units : null
    p.doi = p.avgSale > 0 ? Math.floor(p.units / p.avgSale) : null
    p.status = statusFor(p.doi, p.avgSale, p.units)
    return p
  })
}

export function totalsOf(list) {
  const t = { n: list.length, units: 0, avgSale: 0, value: 0, missing: 0, missingUnits: 0, avgMapped: 0, avgValue: 0 }
  for (const r of list) {
    t.units += r.totalInvt || 0
    t.avgSale += r.avgSale || 0
    t.value += r.totalCost || 0
    if (r.cogsMap === 'Missing') { t.missing += 1; t.missingUnits += r.totalInvt || 0 }
    if (r.cogsMap === 'Sub-cat avg') { t.avgMapped += 1; t.avgValue += r.totalCost || 0 }
  }
  return t
}

export { byValue }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthText = ym => `${MONTHS[Number(String(ym).slice(5, 7)) - 1]} ${String(ym).slice(0, 4)}`
// "COGS rates: Sep 2026, carried forward" (amber) when the current month reuses an older month's rates, else "COGS rates: Nov 2026".
export function cogsRateLabel(cogs) {
  const carried = !!cogs.srcMonth && cogs.srcMonth.slice(0, 7) !== cogs.month.slice(0, 7)
  return {
    carried,
    text: carried ? `COGS rates: ${monthText(cogs.srcMonth)}, carried forward` : `COGS rates: ${monthText(cogs.month)}`,
    why: carried ? `The unit costs come from the ${monthText(cogs.srcMonth)} COGS sheet. ${monthText(cogs.month)} has no COGS sheet yet, so ${monthText(cogs.srcMonth)}'s rates are reused.` : '',
  }
}
