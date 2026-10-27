import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { C } from '../utils.js'

// Short confirmation with an Undo action (e.g. "Levers reset · Undo" after ⋯ → Reset in a P&L
// tool). Disappears after 5 s or on Undo.
//   toast { text, undo?, actionLabel? } or null (actionLabel defaults to "Undo", e.g. "Retry") · onDone: called when it should go away
export default function UndoToast({ toast, onDone }) {
  const M = C.m
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDone, 5000)
    return () => clearTimeout(t)
  }, [toast, onDone])
  if (!toast) return null
  return createPortal(
    <div role="status" aria-live="polite"
      style={{ position: 'fixed', left: 16, right: 16, bottom: 'calc(var(--bot) + var(--safe-bottom) + 68px)', zIndex: C.z.toast, display: 'flex', alignItems: 'center', gap: 12,
        minHeight: 48, padding: '0 8px 0 16px', borderRadius: 12, background: M.ink, color: '#fff', fontSize: 14, fontFamily: 'var(--font)', boxShadow: '0 6px 20px rgba(0,0,0,.2)' }}>
      <span style={{ flex: 1 }}>{toast.text}</span>
      {toast.undo && (
        <button type="button" onClick={() => { toast.undo(); onDone() }}
          style={{ minHeight: 40, padding: '0 12px', border: 'none', background: 'transparent', color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: 'var(--font)', cursor: 'pointer', textDecoration: 'underline' }}>{toast.actionLabel || 'Undo'}</button>
      )}
    </div>,
    document.body,
  )
}
