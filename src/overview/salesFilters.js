// The Sales-tab filters held in Dashboard's `filters` state (the same keys buildBqExtra sends to
// /api/bq). Used by the mobile "Filtered:" strip and FilterSheet to show and clear what is active.
// Clearing a key resets it to the same empty value the desktop "✕ Clear" button uses.
const LAUNCH = { new: 'New (≤90 days)', established: 'Established (>90 days)' }
const list = v => Array.isArray(v) ? v : (v ? String(v).split(',').map(x => x.trim()).filter(Boolean) : [])

export const SALES_FILTERS = [
  { key: 'channelGroup', label: 'Channel group', multi: true },
  { key: 'subChannel', label: 'Sub-channel' },
  { key: 'category', label: 'Category', multi: true, also: { subCategory: [] } },
  { key: 'subCategory', label: 'Sub-category', multi: true },
  { key: 'sku', label: 'SKU', multi: true },
  { key: 'productAge', label: 'Launch', show: v => LAUNCH[v] || v, also: { subCategory: [] } },
  { key: 'paymentType', label: 'Payment', multi: true, csv: true },
  { key: 'voucher', label: 'Voucher', multi: true, csv: true },
  { key: 'region', label: 'Region', multi: true },
  { key: 'tier', label: 'Tier', multi: true },
  { key: 'state', label: 'State', multi: true },
  { key: 'city', label: 'City' },
  { key: 'country', label: 'Country' },
]

// [{ key, label, values, text }] for every filter that is set.
export function activeSalesFilters(filters) {
  if (!filters) return []
  return SALES_FILTERS.map(d => {
    const values = list(filters[d.key])
    if (!values.length) return null
    const shown = values.map(v => d.show ? d.show(v) : v)
    return { key: d.key, label: d.label, values, text: shown.length > 1 ? `${shown[0]} +${shown.length - 1}` : shown[0] }
  }).filter(Boolean)
}

const emptyOf = d => d.multi && !d.csv ? [] : ''

// setFilters updater that sets one filter to `values` (an empty array clears it).
export function setSalesFilter(key, values) {
  const d = SALES_FILTERS.find(x => x.key === key)
  return f => {
    const v = !values.length ? emptyOf(d) : d.csv ? values.join(',') : d.multi ? values : values[0]
    return { ...f, [key]: v, ...(d.also || {}) }
  }
}

export function clearAllSalesFilters(f) {
  const next = { ...f }
  for (const d of SALES_FILTERS) if (d.key in next) next[d.key] = emptyOf(d)
  return next
}

// Active-filter count for the Sales filter icon (same filters as the desktop Filters popover count).
export function salesFilterCount(filters) {
  return (filters.category?.length || 0) + (filters.subCategory?.length || 0) + (filters.sku?.length || 0)
    + list(filters.paymentType).length + list(filters.voucher).length + (filters.productAge ? 1 : 0)
}
