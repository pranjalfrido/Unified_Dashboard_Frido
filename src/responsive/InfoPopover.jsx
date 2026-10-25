import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { C } from '../utils.js'

// Tap-to-open definition popover (works the same with touch, mouse and keyboard - no hover-only
// tooltips). Two ways to use it:
//   <InfoPopover text="…" />                          a small ⓘ button
//   <InfoPopover text="…" asChild>{tile}</InfoPopover>  the whole tile is the tap target
// Closes on a tap outside, Esc, or scroll.
export default function InfoPopover({ text, title, asChild = false, children, label = 'Show definition', style }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const popRef = useRef(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const width = Math.min(280, window.innerWidth - 24)
    const left = Math.min(Math.max(12, r.left + r.width / 2 - width / 2), window.innerWidth - width - 12)
    const below = r.bottom + 8
    setPos({ left, width, top: below, flipUp: below + 120 > window.innerHeight, anchorTop: r.top })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = e => { if (!popRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false) }
    const key = e => { if (e.key === 'Escape') setOpen(false) }
    const scroll = () => setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', scroll, true)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); window.removeEventListener('scroll', scroll, true) }
  }, [open])

  const trigger = asChild
    ? <div ref={btnRef} role="button" tabIndex={0} aria-expanded={open} aria-label={title ? `${title}: show definition` : label}
        onClick={() => setOpen(o => !o)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) } }}
        style={{ cursor: 'pointer', ...style }}>{children}</div>
    : <button ref={btnRef} type="button" aria-expanded={open} aria-label={title ? `${title}: show definition` : label} onClick={() => setOpen(o => !o)}
        style={{ width: 28, height: 28, margin: -3, borderRadius: '50%', border: 'none', background: 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, ...style }}>
        <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', border: `1px solid ${C.border2}`, color: C.t3, fontSize: 12, fontWeight: 700, fontStyle: 'italic', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>i</span>
      </button>

  return (
    <>
      {trigger}
      {open && pos && createPortal(
        <div ref={popRef} role="dialog" aria-label={title || 'Definition'}
          style={{ position: 'fixed', left: pos.left, width: pos.width, zIndex: C.z.modal,
            ...(pos.flipUp ? { bottom: window.innerHeight - pos.anchorTop + 8 } : { top: pos.top }),
            background: C.t1, color: '#fff', borderRadius: 12, padding: '10px 12px', fontSize: 13, lineHeight: 1.45, boxShadow: C.sh3 }}>
          {title && <div style={{ fontWeight: 700, marginBottom: 3 }}>{title}</div>}
          {text}
        </div>,
        document.body,
      )}
    </>
  )
}
