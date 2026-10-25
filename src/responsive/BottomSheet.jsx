import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { C } from '../utils.js'

// Mobile bottom sheet: drag handle, safe-area padding, closes on backdrop tap, Esc, the close
// button, or the Android/browser back button (opening pushes a history entry). Focus moves into
// the sheet on open and back to the trigger on close.
export default function BottomSheet({ open, onClose, title, subtitle, children }) {
  const sheetRef = useRef(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })

  useEffect(() => {
    if (!open) return
    const prevFocus = document.activeElement
    let poppedByBack = false
    window.history.pushState({ bottomSheet: true }, '')
    const onPop = () => { poppedByBack = true; closeRef.current() }
    const onKey = e => { if (e.key === 'Escape') closeRef.current() }
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sheetRef.current?.focus()
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      // Closed some other way than Back: drop the history entry we pushed.
      if (!poppedByBack && window.history.state?.bottomSheet) window.history.back()
      prevFocus?.focus?.()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: C.z.modal }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)' }} />
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        className="bottom-sheet"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '85dvh', overflowY: 'auto', background: C.card, borderRadius: '20px 20px 0 0',
          padding: `10px max(18px, var(--safe-right)) calc(20px + var(--safe-bottom)) max(18px, var(--safe-left))`, outline: 'none', boxShadow: '0 -8px 30px rgba(0,0,0,.18)' }}>
        <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 3, background: C.border2, margin: '0 auto 12px' }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.t1, lineHeight: 1.3 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ flexShrink: 0, width: 36, height: 36, margin: '-4px -6px 0 0', borderRadius: 10, border: 'none', background: C.hov, color: C.t2, fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
