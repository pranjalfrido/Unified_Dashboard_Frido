import { useState } from 'react'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
import FilterSheet from '../responsive/FilterSheet.jsx'
import FilteredStrip from '../responsive/FilteredStrip.jsx'
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
      <button type="button" className="ov-filter-btn" onClick={() => setOpen(true)} aria-label={`Filters (${count} active)`}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, flexShrink: 0, borderRadius: 10,
          border: '1px solid rgba(255,255,255,.22)', background: 'rgba(255,255,255,.08)', color: '#fff', cursor: 'pointer' }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
        <b style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9, background: '#fff', color: '#0f2a1d', fontSize: 12, fontWeight: 800, lineHeight: '18px', textAlign: 'center' }}>{count}</b>
      </button>
      <FilterSheet open={open} onClose={() => setOpen(false)} title="Filters" rows={rows}
        onReset={() => { setFilters(clearAllSalesFilters); setOpen(false) }} />
    </>
  )
}

// Under the header: dark (continues the green header) on phones, light on tablets, none on desktop.
export function OverviewFilterStrip({ filters, setFilters }) {
  const bp = useBreakpoint()
  const phone = bp.width <= 768 || bp.isPhoneLandscape
  if (!phone && bp.width >= 1024) return null
  return (
    <FilteredStrip items={activeSalesFilters(filters)} tone={phone ? 'dark' : 'light'}
      onRemove={key => setFilters(setSalesFilter(key, []))} onClear={() => setFilters(clearAllSalesFilters)} />
  )
}
