// Logistics → Performance filters on phones: labels, count, "Filtered:" strip items and removal.
// Same keys and store as the desktop filter popover (lFilters in App, LogisticsPage filterSidebarContent).
export const PERF_DEFAULTS = { couriers: [], shipmentType: 'forward', sddNdd: 'all', pickupState: [], dropState: [], dropCity: [], paymentMode: [], category: [], subCategory: [], weightSlabs: [] }
export const PERF_LABELS = { couriers: 'Courier', pickupState: 'Pickup state', dropState: 'Drop state', dropCity: 'Drop city', paymentMode: 'Payment', category: 'Category', subCategory: 'Sub-category', weightSlabs: 'Weight slab' }
export const WEIGHT_SLABS = ['0-500g', '500g-1kg', '1-2kg', '2-5kg', '5-10kg', '10-20kg', '20-50kg', '50kg+']
const LIST_KEYS = Object.keys(PERF_LABELS)

// Same count as the desktop badge (LogisticsPage lActiveCount): every selected value, direction and
// shipment type excluded.
export function perfFilterCount(f) {
  return Object.entries(f || {}).reduce((n, [k, v]) => (k === 'shipmentType' || k === 'sddNdd' ? n : n + (Array.isArray(v) ? v.length : v ? 1 : 0)), 0)
}
export const perfCaption = f => {
  const dir = f?.shipmentType === 'reverse' ? 'Reverse' : f?.shipmentType === 'forward' ? 'Forward' : 'Forward + Reverse'
  const type = f?.sddNdd === 'Regular' ? 'Regular shipments' : f?.sddNdd === 'SDD/NDD' ? 'SDD/NDD shipments' : 'All shipments'
  return `${dir} · ${type}`
}
export const perfStripItems = f => LIST_KEYS.filter(k => f?.[k]?.length).map(k => ({ key: k, label: `${PERF_LABELS[k]}: ${f[k].length > 1 ? `${f[k][0]} +${f[k].length - 1}` : f[k][0]}` }))
export const perfRemove = (set, key) => set(p => ({ ...p, [key]: [], ...(key === 'category' ? { subCategory: [] } : {}) }))
export const perfClear = set => set(p => ({ ...p, ...Object.fromEntries(LIST_KEYS.map(k => [k, []])) }))
