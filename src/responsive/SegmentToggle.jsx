import { C } from '../utils.js'

// 2–3 option toggle inside a card (Gross/Net, Region/City tier, Forward/RTO/Reverse …).
// options: [{ id, label }]. Renders as a tablist so screen readers announce the selection.
export default function SegmentToggle({ options, value, onChange, label, full = false, style }) {
  const M = C.m
  return (
    <div role="tablist" aria-label={label} style={{ display: full ? 'flex' : 'inline-flex', background: M.soft, borderRadius: 9, padding: 2, ...style }}>
      {options.map(o => {
        const on = o.id === value
        return (
          <button key={o.id} type="button" role="tab" aria-selected={on} onClick={() => onChange(o.id)}
            style={{ flex: full ? 1 : '0 0 auto', minHeight: 32, border: 'none', borderRadius: 7, padding: '0 10px', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer',
              background: on ? '#fff' : 'transparent', color: on ? M.ink : M.muted, boxShadow: on ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
