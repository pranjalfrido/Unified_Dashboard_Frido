import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { C } from '../utils.js'
import { useVisualViewport } from './useVisualViewport.js'

// Bottom sheet that always sits inside the visible area (above the keyboard): an overlay exactly as
// big as the visual viewport, the sheet anchored to its bottom, header fixed, the middle scrolls, and
// the footer (Cancel / Send) stays visible. Closes on backdrop tap, Esc, × and the browser Back button.
export default function KeyboardSheet({ title, onClose, footer, children }) {
  const vp = useVisualViewport()
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  useEffect(() => {
    let poppedByBack = false
    window.history.pushState({ bottomSheet: true }, '')
    const onPop = () => { if (window.history.state?.bottomSheet) return; poppedByBack = true; closeRef.current() }
    const onKey = e => { if (e.key === 'Escape') closeRef.current() }
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      if (!poppedByBack && window.history.state?.bottomSheet) window.history.back()
    }
  }, [])
  const M = C.m
  return createPortal(
    <div data-testid="fb-sheet-overlay" style={{ position: 'fixed', left: 0, right: 0, top: vp.top, height: vp.h, maxHeight: '100dvh', overflow: 'hidden', zIndex: C.z.modal, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)' }} />
      <div role="dialog" aria-modal="true" aria-label={title} className="bottom-sheet fb-sheet" data-testid="fb-sheet"
        style={{ position: 'relative', width: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column', background: M.card, borderRadius: vp.kb ? '14px 14px 0 0' : '20px 20px 0 0', boxShadow: '0 -8px 30px rgba(0,0,0,.18)', outline: 'none' }}>
        <div style={{ flexShrink: 0, padding: `${vp.kb ? 8 : 10}px max(18px, var(--safe-right)) 0 max(18px, var(--safe-left))` }}>
          {!vp.kb && <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 3, background: M.g4, margin: '0 auto 10px' }} />}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: M.ink, lineHeight: 1.3 }}>{title}</div>
            <button type="button" onClick={onClose} aria-label="Close"
              style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: 'none', background: M.soft, color: M.ink, fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>
        </div>
        <div className="fb-sheet-body" style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '10px max(18px, var(--safe-right)) 6px max(18px, var(--safe-left))' }}>
          {typeof children === 'function' ? children(vp) : children}
        </div>
        {footer && (
          <div style={{ flexShrink: 0, padding: `8px max(18px, var(--safe-right)) ${vp.kb ? '8px' : 'calc(14px + var(--safe-bottom))'} max(18px, var(--safe-left))`, borderTop: `1px solid ${M.line}`, background: M.card }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
