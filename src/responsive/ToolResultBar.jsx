import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { C } from '../utils.js'

// Sticky result bar for the phone tools (PNL_MASTER_PLAN.md Part C, PNL_REVIEW_FIXES.md §2): one
// 56px line pinned just above the bottom nav, so the answer stays visible while the inputs are
// edited. It hides while a typed field has focus (the keyboard is up and the bar would cover it);
// sliders keep it visible. The page leaves room at its end (.pnl-tool-phone padding) so it never
// covers the last card either.
//   children  the result line; tone 'bad' → red text (only for a bad result)
const isField = el => !!el && ((el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type)) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')

export default function ToolResultBar({ children, tone }) {
  const M = C.m
  // Starts from the current focus: the bar can mount while a field is already being typed in.
  const [typing, setTyping] = useState(() => isField(document.activeElement))
  useEffect(() => {
    const on = e => setTyping(isField(e.target))
    const off = () => setTimeout(() => setTyping(isField(document.activeElement)), 0)
    document.addEventListener('focusin', on)
    document.addEventListener('focusout', off)
    return () => { document.removeEventListener('focusin', on); document.removeEventListener('focusout', off) }
  }, [])
  if (typing || !children) return null
  return createPortal(
    <div role="status" aria-live="polite" className="tool-result-bar"
      style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--bot) + var(--safe-bottom))', zIndex: C.z.sticky, height: 56,
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', background: '#fff', borderTop: `1px solid ${M.line}`, boxShadow: '0 -4px 12px rgba(0,0,0,.06)',
        fontSize: 14, fontWeight: 700, color: tone === 'bad' ? M.down : M.ink, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font)' }}>
      <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</div>
    </div>,
    document.body,
  )
}
