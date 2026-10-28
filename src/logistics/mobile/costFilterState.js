// Logistics → Cost slicer keys per sub-tab (the desktop sidebar's), for the phone filter sheet and badge.
export const LIST = {
  b2c: ['couriers', 'modes', 'zones', 'payments', 'accountTypes'],
  b2b: ['couriers', 'freightTypes', 'vehicleTypes'],
  tpl: ['tplPartners', 'tplSites', 'tplLocations'],
}
export const SINGLE = { b2c: ['band', 'exactSlab', 'originCity', 'destCity'], b2b: [], tpl: [] }

export function costFilterCount(scope, f) {
  if (!LIST[scope]) return 0
  return LIST[scope].reduce((n, k) => n + (f?.[k]?.length || 0), 0)
    + SINGLE[scope].reduce((n, k) => n + (f?.[k] != null ? 1 : 0), 0)
    + (scope === 'b2c' && f?.billing && f.billing !== 'all' ? 1 : 0)
}
export const costHasFilters = scope => !!LIST[scope]


const LABELS = {
  couriers: 'Courier', modes: 'Leg', zones: 'Zone', payments: 'Payment', accountTypes: 'Service', freightTypes: 'Freight', vehicleTypes: 'Vehicle',
  tplPartners: 'Partner', tplSites: 'Warehouse', tplLocations: 'Location', band: 'Slab', exactSlab: 'Exact slab', originCity: 'Pickup', destCity: 'Drop',
}
// "Filtered:" strip under the phone header (FilteredStrip items / remove / clear).
export function costStripItems(scope, f, { bands, slabLabelOf } = {}) {
  if (!LIST[scope]) return []
  const one = (k, v) => ({ key: k, label: `${scope === 'b2b' && k === 'couriers' ? 'Transporter' : LABELS[k]}: ${v}` })
  return [
    ...LIST[scope].filter(k => f?.[k]?.length).map(k => one(k, f[k].length > 1 ? `${f[k][0]} +${f[k].length - 1}` : f[k][0])),
    ...SINGLE[scope].filter(k => f?.[k] != null).map(k => one(k, k === 'band' ? (bands?.find(b => b.key === f.band)?.label ?? f.band) : k === 'exactSlab' ? slabLabelOf(f.exactSlab) : f[k])),
    ...(scope === 'b2c' && f?.billing && f.billing !== 'all' ? [{ key: 'billing', label: f.billing === 'over' ? 'Overbilled' : 'Clean' }] : []),
  ]
}
export const costRemove = key => p => ({ ...p, [key]: SINGLE.b2c.includes(key) ? null : key === 'billing' ? 'all' : [] })
export const costClear = scope => p => ({ ...p, ...Object.fromEntries((LIST[scope] || []).map(k => [k, []])), ...Object.fromEntries((SINGLE[scope] || []).map(k => [k, null])), ...(scope === 'b2c' ? { billing: 'all' } : {}) })
