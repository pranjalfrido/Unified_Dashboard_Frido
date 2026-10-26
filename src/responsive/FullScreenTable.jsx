import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { C } from '../utils.js'

// Full-screen view for a wide table or heatmap on phones (MOBILE_DESIGN_SYSTEM.md §3 "wide table →
// sticky first column + horizontal scroll inside a dedicated full-screen view"). Slides over the page
// like FullScreenList (‹ back = Android / browser Back). The only place a phone page scrolls sideways.
//   head:  first-column header; cols: [label] (or { label, title })
//   rows:  [{ key, label, sub, strong, cells: [{ text, bg, color, strong, title }] }]
//   note:  optional line under the title (legend, data window)
// Heat colours come from the caller (heatBg / heatInk in heat.js), so cohort / cross-sell / contact heatmaps share one look.

export default function FullScreenTable({ open, onClose, title, note, head, cols, rows, firstWidth = 112 }) {
  const M = C.m
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  useEffect(() => {
    if (!open) return
    let poppedByBack = false
    window.history.pushState({ fullScreenTable: true }, '')
    const onPop = () => { if (window.history.state?.fullScreenTable) return; poppedByBack = true; closeRef.current() }
    window.addEventListener('popstate', onPop)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('popstate', onPop)
      document.body.style.overflow = prev
      if (!poppedByBack && window.history.state?.fullScreenTable) window.history.back()
    }
  }, [open])
  if (!open) return null
  const th = { position: 'sticky', top: 0, zIndex: 2, background: '#fff', padding: '8px 8px', fontSize: 12, fontWeight: 600, color: M.muted, textAlign: 'center', whiteSpace: 'nowrap', borderBottom: `1px solid ${M.line}` }
  const td = { padding: '8px 8px', fontSize: 12.5, textAlign: 'center', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', borderBottom: `1px solid ${M.line}` }
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fullscreen-list fullscreen-table"
      style={{ position: 'fixed', inset: 0, zIndex: C.z.modal, background: '#fff', display: 'flex', flexDirection: 'column', paddingTop: 'var(--safe-top)' }}>
      <div style={{ padding: '12px 14px 10px', borderBottom: `1px solid ${M.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={onClose} aria-label="Back"
            style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: M.soft, color: M.ink, fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>‹</button>
          <span style={{ fontSize: 16, fontWeight: 700, color: M.ink }}>{title}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: M.muted }}>{rows.length} rows</span>
        </div>
        {note && <div style={{ fontSize: 12, color: M.muted, marginTop: 6 }}>{note}</div>}
      </div>
      <div style={{ flex: 1, overflow: 'auto', overscrollBehavior: 'contain', paddingBottom: 'calc(20px + var(--safe-bottom))' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...th, left: 0, zIndex: 3, textAlign: 'left', minWidth: firstWidth, maxWidth: firstWidth * 1.6, paddingLeft: 14 }}>{head}</th>
              {cols.map((c, i) => <th key={i} title={c.title || undefined} style={th}>{c.label ?? c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key}>
                <td title={r.label} style={{ ...td, position: 'sticky', left: 0, zIndex: 1, background: '#fff', textAlign: 'left', paddingLeft: 14, fontWeight: r.strong ? 700 : 600, color: M.ink, minWidth: firstWidth, maxWidth: firstWidth * 1.6, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.label}{r.sub && <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: M.muted }}>{r.sub}</span>}
                </td>
                {r.cells.map((c, i) => (
                  <td key={i} title={c.title || undefined} style={{ ...td, background: c.bg || 'transparent', color: c.color || M.ink, fontWeight: c.strong || r.strong ? 700 : 400 }}>{c.text}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>,
    document.body,
  )
}
