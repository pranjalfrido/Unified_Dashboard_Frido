import { useId, useState } from 'react'
import { C } from '../utils.js'

// Section heading that expands/collapses its content. Reusable on any page.
//   - the whole heading row is one <button> (≥ 44px tall) with aria-expanded / aria-controls
//   - collapsed: shows `summary` (a one-line recap built from values already on the page) and does
//     NOT render its children at all, so heavy charts/tables mount only when opened
//   - each user's choice is remembered per section in localStorage (try/catch; falls back to
//     `defaultOpen` when storage is unavailable)
//   - `onToggle(open)` lets the page start lazy work (e.g. previous-period requests) on first open
const KEY = id => `ui.section.${id}`

function readOpen(id, fallback) {
  try {
    const v = localStorage.getItem(KEY(id))
    return v === '1' ? true : v === '0' ? false : fallback
  } catch { return fallback }
}

export default function CollapsibleSection({ id, title, summary, defaultOpen = true, children, onToggle, style }) {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen))
  const bodyId = useId()
  const toggle = () => {
    const next = !open
    setOpen(next)
    try { localStorage.setItem(KEY(id), next ? '1' : '0') } catch { /* storage unavailable */ }
    onToggle?.(next)
  }
  return (
    <section style={{ gridColumn: '1 / -1', ...style }}>
      <button type="button" onClick={toggle} aria-expanded={open} aria-controls={bodyId}
        style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', color: C.t1 }}>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{title}</span>
            <span aria-hidden="true" style={{ flex: 1, height: 2, background: `linear-gradient(90deg, ${C.acc}55, ${C.border} 40%)`, borderRadius: 2 }} />
          </span>
          {!open && summary && <span style={{ fontSize: 13, color: C.t2, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>}
        </span>
        <span aria-hidden="true" className="section-chevron" style={{ fontSize: 14, color: C.t2, width: 20, textAlign: 'center', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
      </button>
      <div id={bodyId} hidden={!open} className={open ? 'section-body-open' : undefined}>
        {open && children}
      </div>
    </section>
  )
}
