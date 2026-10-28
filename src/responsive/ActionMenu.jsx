import { useState } from 'react'
import { C } from '../utils.js'
import BottomSheet from './BottomSheet.jsx'

// "⋯" page-actions menu (docs/responsive/MOBILE_DESIGN_SYSTEM.md §3: buttons such as Export,
// special views, Refresh). Opens a bottom sheet with one 48px row per action, grouped.
//   items: [{ id, label, onSelect, group?, strong? }]   (empty → renders nothing)
//   tone: 'dark' = in the phone page header (Ivory: borderless icon, index.css .mph-ib), 'light' on a card
//   dot: a small red dot on ⋯ (MobilePageHeader: unread notifications)
//   note: optional plain line at the top of the sheet (data source, last update), so it need not take
//         header space; with a note and no items the menu still shows
const MoreIcon = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>

export default function ActionMenu({ items, title = 'Actions', tone = 'dark', label = 'More actions', note, dot = false }) {
  const M = C.m
  const [open, setOpen] = useState(false)
  if (!items?.length && !note) return null
  const dark = tone === 'dark'
  const groups = [...new Set((items || []).map(i => i.group || ''))]
  return (
    <>
      {dark
        ? <button type="button" className="m-action-btn mph-ib" data-ctl="more" onClick={() => setOpen(true)} aria-label={label} aria-haspopup="dialog">{MoreIcon}{dot && <span className="mph-dot" aria-hidden="true" />}</button>
        : <button type="button" className="m-action-btn" onClick={() => setOpen(true)} aria-label={label} aria-haspopup="dialog"
            style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 20, lineHeight: 1,
              border: `1px solid ${M.line}`, background: '#fff', color: M.ink }}>⋯</button>}
      <BottomSheet open={open} onClose={() => setOpen(false)} title={title}>
        {note && <div style={{ fontSize: 13, color: M.muted, padding: '2px 0 10px' }}>{note}</div>}
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
