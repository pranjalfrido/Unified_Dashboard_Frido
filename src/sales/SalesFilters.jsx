import { useMemo, useState } from 'react'
import { fmt } from '../utils.js'
import FilterSheet from '../responsive/FilterSheet.jsx'
import HeaderFilterButton from '../responsive/HeaderFilterButton.jsx'
import { setSalesFilter, clearAllSalesFilters, salesFilterCount } from '../overview/salesFilters.js'

// Sales filters on phones (SALES_MOBILE_REDESIGN_PROMPT.md §C): the filter icon in the header
// opens FilterSheet. Same filter keys and the same rules as the desktop Filters popover:
//   Category → clears Sub-category; Launch → clears Sub-category; Payment type + Voucher on D2C only.
// Options carry revenue (Top by revenue sort). Sub-category is limited to the chosen Category; SKU
// lists the SKUs sold in the period (limited to the chosen Sub-category, else Category) with their
// revenue, and search also reaches every SKU in the item master (approved 2026-10-26).
const list = v => Array.isArray(v) ? v : (v ? String(v).split(',').map(x => x.trim()).filter(Boolean) : [])
const LAUNCH = [{ id: '', label: 'All' }, { id: 'new', label: 'New ≤90d' }, { id: 'established', label: 'Existing' }]

export function SalesFilterButton({ data, filters, setFilters, activeTab, subCatFirstOrderMap = {} }) {
  const [open, setOpen] = useState(false)
  const count = salesFilterCount(filters)
  const rows = useMemo(() => {
    if (!data) return []
    const selCats = filters.category || []
    const selSubs = filters.subCategory || []
    const catOpts = Object.entries(data.catMap || {}).filter(([k]) => k).map(([k, v]) => ({ value: k, rank: v.rev || 0 }))
    const subOpts = Object.entries(data.subCatMap || {})
      .map(([k, v]) => { const [cat, sc] = k.split('::'); return { value: sc, sub: cat, cat, rank: v.rev || 0 } })
      .filter(o => o.value && (!selCats.length || selCats.includes(o.cat)))
    // Same product can sit under two categories: one option per name, revenue summed.
    const subMerged = Object.values(subOpts.reduce((m, o) => { const e = m[o.value]; m[o.value] = e ? { ...e, rank: e.rank + o.rank, sub: e.sub === o.sub ? e.sub : `${e.sub}, ${o.sub}` } : o; return m }, {}))
    const skuSold = {}
    for (const r of data.skuRows || []) {
      if (!r.sku) continue
      if (selSubs.length && !selSubs.includes(r.subCategory)) continue
      if (!selSubs.length && selCats.length && !selCats.includes(r.category)) continue
      const e = skuSold[r.sku] || (skuSold[r.sku] = { value: r.sku, sub: r.subCategory || r.category || '', rank: 0 })
      e.rank += r.rev || 0
    }
    const out = [
      { key: 'category', label: 'Category', noun: 'categories', options: catOpts, selected: selCats,
        onApply: v => setFilters(setSalesFilter('category', v)) },
      { key: 'subCategory', label: 'Sub-category', noun: 'sub-categories', options: subMerged, selected: selSubs,
        onApply: v => setFilters(setSalesFilter('subCategory', v)) },
      { key: 'sku', label: 'SKU', noun: 'SKUs', options: Object.values(skuSold), selected: filters.sku || [],
        searchAll: data.masterSkuList || [], searchAllNote: 'No sales in this period', onApply: v => setFilters(setSalesFilter('sku', v)) },
    ]
    if (activeTab === 'shopify') {
      const pt = (data.shopify?.paymentTypes || []).filter(p => p.paymentType)
      if (pt.length) out.push({ key: 'paymentType', label: 'Payment type', noun: 'payment types', options: pt.map(p => ({ value: p.paymentType, rank: p.rev ?? null })), selected: list(filters.paymentType),
        onApply: v => setFilters(setSalesFilter('paymentType', v)) })
      const vl = (data.voucherList || []).map(v => (typeof v === 'string' ? { code: v } : v)).filter(v => v.code)
      if (vl.length) out.push({ key: 'voucher', label: 'Voucher', noun: 'vouchers', options: vl.map(v => ({ value: v.code, rank: v.rev ?? v.orders ?? null })), selected: list(filters.voucher),
        onApply: v => setFilters(setSalesFilter('voucher', v)) })
    }
    if (Object.keys(subCatFirstOrderMap).length) {
      out.push({ key: 'productAge', label: 'Product launch', toggle: LAUNCH, value: filters.productAge || '',
        onChange: id => setFilters(f => ({ ...f, productAge: id, subCategory: [] })) })
    }
    return out.map(r => r.toggle ? r : { ...r, set: r.selected.length > 0, summary: r.selected.length ? (r.selected.length > 1 ? `${r.selected[0]} +${r.selected.length - 1}` : r.selected[0]) : 'All', fmtRank: v => fmt(v) })
  }, [data, filters, setFilters, activeTab, subCatFirstOrderMap])

  return (
    <>
      <HeaderFilterButton className="ov-filter-btn" count={count} onClick={() => setOpen(true)} />
      <FilterSheet open={open} onClose={() => setOpen(false)} title="Filters" rows={rows} resetLabel="Reset all" doneLabel="Show results"
        onReset={() => { setFilters(clearAllSalesFilters); setOpen(false) }} />
    </>
  )
}
