import { useState } from 'react'
import { C } from '../utils.js'
import BottomSheet from './BottomSheet.jsx'

// "⋯" page-actions menu (docs/responsive/MOBILE_DESIGN_SYSTEM.md §3: buttons such as Export,
// special views, Refresh). Opens a bottom sheet with one 48px row per action, grouped.
//   items: [{ id, label, onSelect, group?, strong? }]   (empty → renders nothing)
//   tone: 'dark' on the green header, 'light' on a card
export default function ActionMenu({ items, title = 'Actions', tone = 'dark', label = 'More actions' }) {
  const M = C.m
  const [open, setOpen] = useState(false)
  if (!items?.length) return null
  const dark = tone === 'dark'
  const groups = [...new Set(items.map(i => i.group || ''))]
  return (
    <>
      <button type="button" className="m-action-btn" onClick={() => setOpen(true)} aria-label={label} aria-haspopup="dialog"
        style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 20, lineHeight: 1,
          border: `1px solid ${dark ? 'rgba(255,255,255,.22)' : M.line}`, background: dark ? 'rgba(255,255,255,.08)' : '#fff', color: dark ? '#fff' : M.ink }}>⋯</button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={title}>
        {groups.map(g => (
          <div key={g || '_'}>
            {g && <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: M.muted, padding: '10px 0 4px' }}>{g}</div>}
            {items.filter(i => (i.group || '') === g).map(i => (
              <button key={i.id} type="button" onClick={() => { setOpen(false); i.onSelect() }}
                style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 48, padding: '0 2px', border: 'none', borderTop: `1px solid ${M.line}`, background: 'none',
                  color: M.ink, fontSize: 14, fontWeight: i.strong ? 700 : 500, fontFamily: 'var(--font)', textAlign: 'left', cursor: 'pointer' }}>{i.label}</button>
            ))}
          </div>
        ))}
      </BottomSheet>
    </>
  )
}
