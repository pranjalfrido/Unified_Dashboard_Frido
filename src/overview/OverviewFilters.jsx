import { useState } from 'react'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
import FilterSheet from '../responsive/FilterSheet.jsx'
import FilteredStrip from '../responsive/FilteredStrip.jsx'
import HeaderFilterButton from '../responsive/HeaderFilterButton.jsx'
import { activeSalesFilters, setSalesFilter, clearAllSalesFilters } from './salesFilters.js'

// Overview has no slicers of its own, but its numbers follow the Sales-tab filters. On mobile these
// show only while such a filter is set: a filter icon in the phone header (opens FilterSheet with
// the active filters; untick to remove) and a "Filtered:" strip under the header (✕ / Clear).
// The full slicer set arrives with the Sales page redesign.

export function OverviewFilterButton({ filters, setFilters }) {
  const [open, setOpen] = useState(false)
  const active = activeSalesFilters(filters)
  if (!active.length) return null
  const count = active.reduce((n, a) => n + a.values.length, 0)
  const rows = active.map(a => ({
    key: a.key, label: a.label, summary: a.text, set: true, noun: 'values',
    options: a.values.map(v => ({ value: v })), selected: a.values,
    onApply: v => setFilters(setSalesFilter(a.key, v)),
  }))
  return (
    <>
      <HeaderFilterButton className="ov-filter-btn" count={count} onClick={() => setOpen(true)} />
      <FilterSheet open={open} onClose={() => setOpen(false)} title="Filters" rows={rows}
        onReset={() => { setFilters(clearAllSalesFilters); setOpen(false) }} />
    </>
  )
}

// Under the top bar on tablets only (phones: in the MobilePageHeader strip; none on desktop).
export function OverviewFilterStrip({ filters, setFilters }) {
  const bp = useBreakpoint()
  const phone = bp.width <= 768 || bp.isPhoneLandscape
  if (phone || bp.width >= 1024) return null // phones: in the header (MobilePageHeader strip)
  return (
    <FilteredStrip items={activeSalesFilters(filters)} tone={phone ? 'dark' : 'light'}
      onRemove={key => setFilters(setSalesFilter(key, []))} onClear={() => setFilters(clearAllSalesFilters)} />
  )
}
