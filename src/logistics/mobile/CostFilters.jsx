import { useMemo } from 'react'
import FilterSheet from '../../responsive/FilterSheet.jsx'
import { LIST, SINGLE } from './costFilterState.js'

// Logistics → Cost filters on phones (LOGISTICS_MOBILE_REDESIGN_PROMPT.md §1): the desktop sidebar's
// slicers for the open sub-tab, same keys and store (LogisticsCostPage filters / setFilters). Months
// are not here: they are the header pill. Reset clears this tab's slicers and keeps its months.
const opt = v => ({ value: v })
const summary = sel => (sel?.length ? (sel.length > 1 ? `${sel[0]} +${sel.length - 1}` : sel[0]) : 'All')
export default function CostFilterSheet({ open, onClose, scope, filters, setFilters, opts, tplPartnerOpts, tplSiteOpts, tplLocationOpts, slabOptions, slabLabelOf, bands, logos }) {
  const rows = useMemo(() => {
    const f = filters || {}
    const list = (key, label, noun, options) => ({ key, label, noun, options, selected: f[key] || [], onApply: v => setFilters(p => ({ ...p, [key]: v })) })
    const single = (key, label, noun, options, toValue, fromValue) => ({
      key, label, noun, options, multi: false, selected: f[key] != null ? [fromValue(f[key])] : [],
      onApply: v => setFilters(p => ({ ...p, [key]: v.length ? toValue(v[0]) : null })),
    })
    let rs = []
    if (scope === 'tpl') {
      rs = [list('tplPartners', '3PL partner', 'partners', (tplPartnerOpts || []).map(opt)), list('tplSites', 'Warehouse', 'warehouses', (tplSiteOpts || []).map(opt)), list('tplLocations', 'Location', 'locations', (tplLocationOpts || []).map(opt))]
    } else if (scope === 'b2b') {
      rs = [list('couriers', 'Transporter', 'transporters', (opts?.transporters || []).map(opt)), list('freightTypes', 'Freight type', 'types', (opts?.freightTypes || []).map(opt)), list('vehicleTypes', 'Vehicle size', 'sizes', (opts?.vehicleTypes || []).map(opt))]
    } else if (scope === 'b2c') {
      const id = x => x
      rs = [
        list('couriers', 'Courier partner', 'couriers', (opts?.couriers || []).map(c => ({ value: c, icon: logos?.[c] }))),
        list('modes', 'Shipment leg', 'legs', (opts?.modes || []).map(opt)),
        { key: 'billing', label: 'Billing status', toggle: [{ id: 'all', label: 'All' }, { id: 'over', label: 'Overbilled' }, { id: 'ok', label: 'Clean' }], value: f.billing || 'all', onChange: v => setFilters(p => ({ ...p, billing: v })) },
        list('zones', 'Zone', 'zones', (opts?.zones || []).map(opt)),
        list('payments', 'Payment', 'payment modes', (opts?.payments || []).map(opt)),
        list('accountTypes', 'Service type', 'service types', (opts?.accountTypes || []).map(opt)),
        single('band', 'Weight slab', 'slabs', (bands || []).map(b => ({ value: b.label })), label => (bands.find(b => b.label === label)?.key ?? null), k => bands.find(b => b.key === k)?.label),
        single('exactSlab', 'Exact weight slab', 'slabs', (slabOptions || []).map(opt), label => ((opts?.slabs || []).find(s => slabLabelOf(s.slab) === label)?.slab ?? null), s => slabLabelOf(s)),
        single('originCity', 'Pickup city', 'cities', (opts?.originCities || []).map(opt), id, id),
        single('destCity', 'Drop city', 'cities', (opts?.cities || []).map(opt), id, id),
      ]
    }
    return rs.map(r => (r.toggle ? r : { ...r, set: r.selected.length > 0, summary: summary(r.selected) }))
  }, [scope, filters, setFilters, opts, tplPartnerOpts, tplSiteOpts, tplLocationOpts, slabOptions, slabLabelOf, bands, logos])
  const reset = () => setFilters(p => ({ ...p, ...Object.fromEntries((LIST[scope] || []).map(k => [k, []])), ...Object.fromEntries((SINGLE[scope] || []).map(k => [k, null])), ...(scope === 'b2c' ? { billing: 'all' } : {}) }))
  return <FilterSheet open={open} onClose={onClose} title="Cost filters" rows={rows} onReset={reset} />
}
