import { useId } from 'react'
import { C } from '../utils.js'

// Section heading that expands/collapses its content. Reusable on any page; pair it with
// useCollapsible(id, defaultOpen) from ./useCollapsible.js, which remembers each user's choice.
//   <CollapsibleSection title="Logistics & Ops" summary="2,54,115 shipments · 90.0% delivered" open={open} onToggle={toggle}>…</CollapsibleSection>
//   - the whole heading row is one <button> (≥ 44px tall) with aria-expanded / aria-controls,
//     keyboard operable (it is a real button)
//   - collapsed: shows `summary` (a one-line recap built from values already on the page) and does
//     NOT render its children, so heavy charts/tables mount only when the section is opened
//   - opening animates in (200ms; none with prefers-reduced-motion - see index.css)
export default function CollapsibleSection({ title, summary, open, onToggle, children, style }) {
  const bodyId = useId()
  return (
    <section style={style}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={bodyId}
        style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', color: C.t1 }}>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{title}</span>
            <span aria-hidden="true" style={{ flex: 1, height: 2, background: `linear-gradient(90deg, ${C.acc}55, ${C.border} 40%)`, borderRadius: 2 }} />
          </span>
          {!open && summary && <span style={{ fontSize: 13, color: C.t2, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{summary}</span>}
        </span>
        <span aria-hidden="true" className="section-chevron" style={{ fontSize: 14, color: C.t2, width: 20, textAlign: 'center', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
      </button>
      <div id={bodyId} hidden={!open} className={open ? 'section-body-open' : undefined} style={{ marginTop: open ? 6 : 0 }}>
        {open && children}
      </div>
    </section>
  )
}
