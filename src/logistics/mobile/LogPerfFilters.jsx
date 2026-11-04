import { useMemo, useState } from 'react'
import FilterSheet from '../../responsive/FilterSheet.jsx'
import { HeaderFilterIcon } from './LogHeaderBits.jsx'
import { PERF_DEFAULTS, PERF_LABELS, WEIGHT_SLABS, perfFilterCount } from './logPerfFilterState.js'

// Logistics → Performance filter icon + sheet (LOGISTICS_MOBILE_REDESIGN_PROMPT.md §1): Courier (logos,
// search), Courier direction and Shipment type as inline toggles, then the desktop popover's lists.
// Writes the same lFilters keys the desktop popover writes; Reset returns to the app defaults.
const opt = v => ({ value: v })
const summary = sel => (sel?.length ? (sel.length > 1 ? `${sel[0]} +${sel.length - 1}` : sel[0]) : 'All')

export default function LogPerfFilterButton({ lFilters, setLFilters, opts, couriers, logos }) {
  const [open, setOpen] = useState(false)
  const f = lFilters || PERF_DEFAULTS
  const n = perfFilterCount(f)
  const rows = useMemo(() => {
    const o = opts || {}
    const row = (key, noun, options, extra = {}) => ({ key, label: PERF_LABELS[key], noun, options, selected: f[key] || [],
      onApply: v => setLFilters(p => ({ ...p, [key]: v, ...(key === 'category' ? { subCategory: [] } : {}) })), ...extra })
    return [
      row('couriers', 'couriers', couriers.map(c => ({ value: c, icon: logos?.[c] }))),
      { key: 'shipmentType', label: 'Courier direction', toggle: [{ id: 'all', label: 'All' }, { id: 'forward', label: 'Forward' }, { id: 'reverse', label: 'Reverse' }], value: f.shipmentType || 'all', onChange: v => setLFilters(p => ({ ...p, shipmentType: v })) },
      { key: 'sddNdd', label: 'Shipment type', toggle: [{ id: 'all', label: 'All' }, { id: 'Regular', label: 'Regular' }, { id: 'SDD/NDD', label: 'SDD/NDD' }], value: f.sddNdd || 'all', onChange: v => setLFilters(p => ({ ...p, sddNdd: v })) },
      row('pickupState', 'states', (o.pickup_states || []).map(opt)),
      row('dropState', 'states', (o.drop_states || []).map(opt)),
      row('dropCity', 'cities', (o.drop_cities || []).map(opt)),
      row('paymentMode', 'payment modes', ['COD', 'Prepaid'].map(opt)),
      row('category', 'categories', (o.categories || []).map(opt)),
      row('subCategory', 'sub-categories', (o.sub_categories || []).map(opt)),
      row('weightSlabs', 'slabs', WEIGHT_SLABS.map(opt)),
    ].map(r => (r.toggle ? r : { ...r, set: r.selected.length > 0, summary: summary(r.selected) }))
  }, [f, opts, couriers, logos, setLFilters])
  return (
    <>
      <HeaderFilterIcon count={n} onClick={() => setOpen(true)} />
      <FilterSheet open={open} onClose={() => setOpen(false)} title="Performance filters" rows={rows}
        onReset={() => setLFilters(p => ({ ...p, ...PERF_DEFAULTS }))} />
    </>
  )
}
