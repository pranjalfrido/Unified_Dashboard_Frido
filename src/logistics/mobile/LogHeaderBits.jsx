import { C } from '../../utils.js'

// Small controls for the Logistics phone header (dark green): filter icon with a count badge, and the
// Cost month pill ("📅 Apr – Jul 26") that opens the MonthRangePicker sheet.
export function HeaderFilterIcon({ count = 0, onClick, label = 'Filters' }) {
  return (
    <button type="button" className="log-filter-btn" aria-label={`${label}${count ? ` (${count} active)` : ''}`} onClick={onClick}
      style={{ position: 'relative', width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(255,255,255,.22)', background: 'rgba(255,255,255,.08)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4-2v-4z" /></svg>
      {count > 0 && <b style={{ position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: '#fff', color: C.m.green, fontSize: 11, lineHeight: '18px', textAlign: 'center' }}>{count}</b>}
    </button>
  )
}

export function HeaderMonthPill({ label, onClick }) {
  return (
    <button type="button" className="mrp-pill" aria-haspopup="dialog" aria-label={`Billing months: ${label}`} onClick={onClick}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 11px', borderRadius: 10, border: '1px solid rgba(255,255,255,.22)', background: 'rgba(255,255,255,.08)', color: '#fff',
        fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0 }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /></svg>
      {label}
    </button>
  )
}
