import { useMemo, useState } from 'react'
import { C } from '../../utils.js'
import FilterSheet from '../../responsive/FilterSheet.jsx'
import { STATUS_ORDER } from './invStatus.js'
import { LABELS, invFilterCount, invClearFilters } from './invFilterState.js'

// Inventory filters on phones and tablets (INVENTORY_MOBILE_REDESIGN_PROMPT.md §1): the filter icon
// opens FilterSheet. Same filter keys and stores as the desktop sidebars (InventoryHealthPage /
// SalesAllocationPage FilterSidebar) - healthFilters / salesFilters in InventoryPage, reached through
// the topbar control object (`ctrl`). Mobile is locked to Regular facilities, so the Facility list
// only offers Regular facilities (as the desktop sidebar does on its Regular view) and there is no
// Facility type row. The desktop per-card Channel dropdowns for Top products and the Matrix live
// here too (topChannel is the mobile twin of the card's local top20Channel). Drastic change's
// Channel is left out: it only takes effect on an API fetch, not on the static cache (BACKLOG).
const opt = v => ({ value: v })
const summary = sel => (sel?.length ? (sel.length > 1 ? `${sel[0]} +${sel.length - 1}` : sel[0]) : 'All')

export function InvFilterButton({ tab, ctrl, tone = 'dark' }) {
  const M = C.m
  const [open, setOpen] = useState(false)
  const n = invFilterCount(tab, ctrl)
  const rows = useMemo(() => {
    if (tab === 'sales') {
      const f = ctrl?.invSalesFilters || {}, set = ctrl?.setInvSalesFilters, o = ctrl?.invSalesOpts
      if (!o || !set) return []
      const row = (key, noun, options, extra = {}) => ({ key, label: LABELS[key], noun, options, selected: f[key] || [], onApply: v => set(p => ({ ...p, [key]: v })), ...extra })
      // The desktop cards' Channel dropdowns list unifiedChannels2; the sidebar's Channel lists channels.
      const cardChannels = (o.unifiedChannels2 || []).map(opt)
      return [
        row('category', 'categories', (o.categories || []).map(opt)),
        row('subCategory', 'sub-categories', (o.subCategories || []).map(opt)),
        row('sku', 'SKUs', (o.skus || []).map(opt)),
        row('channel', 'channels', (o.channels || []).map(opt)),
        row('salesType', 'sales types', (o.salesTypes || []).map(opt)),
        row('facility', 'facilities', (o.facilities || []).map(x => ({ value: x.facility, sub: x.displayName !== x.facility ? x.displayName : undefined }))),
        row('region', 'regions', (o.regions || []).map(opt)),
        row('topChannel', 'channels', cardChannels),
        row('matrixChannel', 'channels', cardChannels),
      ].map(r => ({ ...r, set: r.selected.length > 0, summary: summary(r.selected) }))
    }
    const f = ctrl?.invHealthFilters || {}, set = ctrl?.setInvHealthFilters, o = ctrl?.invHealthOpts
    if (!o || !set) return []
    const row = (key, noun, options, extra = {}) => ({ key, label: LABELS[key], noun, options, selected: f[key] || [], onApply: v => set(p => ({ ...p, [key]: v })), ...extra })
    const statuses = [...(o.stockStatuses || [])].sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b))
    return [
      row('location', 'locations', (o.locations || []).map(opt)),
      row('stockStatus', 'statuses', statuses.map(opt)),
      row('websiteStatus', 'statuses', ['Live', 'Stock Out'].map(opt)),
      { key: 'avgSaleWindowDays', label: 'Avg sale window', toggle: [7, 15, 30].map(d => ({ id: d, label: `${d}d` })), value: f.avgSaleWindowDays || 7, onChange: d => set(p => ({ ...p, avgSaleWindowDays: d })) },
      row('facility', 'facilities', (o.facilities || []).filter(x => x.facilityType === 'Regular').map(x => ({ value: x.facility, sub: x.location }))),
      row('category', 'categories', (o.categories || []).map(opt)),
      row('subCategory', 'sub-categories', (o.subCategories || []).map(opt)),
      row('productId', 'SKUs', (o.productIds || []).map(x => ({ value: x.sku, sub: x.category }))),
      row('rtdLevel', 'levels', (o.rtdLevels || []).map(opt)),
    ].map(r => (r.toggle ? r : { ...r, set: r.selected.length > 0, summary: summary(r.selected) }))
  }, [tab, ctrl])

  const dark = tone === 'dark'
  return (
    <>
      <button type="button" className="inv-filter-btn" onClick={() => setOpen(true)} aria-label={n ? `Filters (${n} active)` : 'Filters'} disabled={!rows.length}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 34, flexShrink: 0, borderRadius: 10, cursor: rows.length ? 'pointer' : 'default', opacity: rows.length ? 1 : 0.5,
          border: `1px solid ${dark ? 'rgba(255,255,255,.22)' : M.line}`, background: dark ? 'rgba(255,255,255,.08)' : '#fff', color: dark ? '#fff' : M.ink }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
        {n > 0 && <b style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9, background: dark ? '#fff' : M.green, color: dark ? '#0f2a1d' : '#fff', fontSize: 12, fontWeight: 800, lineHeight: '18px', textAlign: 'center' }}>{n}</b>}
      </button>
      <FilterSheet open={open} onClose={() => setOpen(false)} title={tab === 'sales' ? 'Sales & Allocation filters' : 'Inventory Health filters'} rows={rows} resetLabel="Reset all" doneLabel="Show results"
        onReset={() => { invClearFilters(tab, ctrl); setOpen(false) }} />
    </>
  )
}
