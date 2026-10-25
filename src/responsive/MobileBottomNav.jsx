import { useState } from 'react'
import { C } from '../utils.js'
import BottomSheet from './BottomSheet.jsx'

// Phone bottom navigation (docs/responsive/MOBILE_DESIGN_SYSTEM.md §2): up to 4 labelled primary
// items + "More", which opens a sheet with the rest. Shared by every page - the caller passes only
// the pages this user may open (same permission rules as the sidebar).
//   primary / more: [{ id, label, icon }]; active: current page id; onSelect(id)
export default function MobileBottomNav({ primary, more, active, onSelect }) {
  const M = C.m
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = more.some(i => i.id === active)
  const item = (id, label, icon, on, onClick) => (
    <button key={id} type="button" onClick={onClick} aria-current={on ? 'page' : undefined}
      style={{ flex: 1, minWidth: 0, minHeight: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, border: 'none', background: 'transparent',
        color: on ? M.green : M.muted, fontFamily: 'var(--font)', fontSize: 12, fontWeight: on ? 700 : 500, cursor: 'pointer' }}>
      <span aria-hidden="true" style={{ height: 22, display: 'flex', alignItems: 'center' }}>{icon}</span>
      <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
  return (
    <>
      {/* .bottom-nav (index.css) shows it on phones only and reserves --bot + the home-indicator inset. */}
      <nav className="bottom-nav" aria-label="Main" style={{ background: M.card, borderTop: `1px solid ${M.line}` }}>
        <div style={{ display: 'flex', alignItems: 'stretch', height: 'var(--bot)', padding: '0 4px' }}>
          {primary.map(i => item(i.id, i.label, i.icon, i.id === active, () => onSelect(i.id)))}
          {more.length > 0 && item('__more', 'More', <span style={{ fontSize: 20, lineHeight: 1 }}>⋯</span>, moreActive || moreOpen, () => setMoreOpen(true))}
        </div>
      </nav>
      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
          {more.map(i => (
            <button key={i.id} type="button" aria-current={i.id === active ? 'page' : undefined}
              onClick={() => { setMoreOpen(false); onSelect(i.id) }}
              style={{ minHeight: 72, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: M.radius.tile,
                border: `1px solid ${i.id === active ? M.glowBorder : M.tileBorder}`, background: i.id === active ? '#fff' : M.soft, boxShadow: i.id === active ? M.glow : 'none',
                color: i.id === active ? M.green : M.ink, fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <span aria-hidden="true" style={{ height: 22, display: 'flex', alignItems: 'center' }}>{i.icon}</span>
              {i.label}
            </button>
          ))}
        </div>
      </BottomSheet>
    </>
  )
}
