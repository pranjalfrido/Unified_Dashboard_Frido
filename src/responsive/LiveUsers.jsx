import { useEffect, useRef, useState } from 'react'
import { C } from '../utils.js'
import BottomSheet from './BottomSheet.jsx'
import { useLivePresence, useLiveCount, ago } from '../presence.js'

// Live users (admins only; every export renders nothing unless `isAdmin`).
//   LivePill        laptop header: "● N live", click → popover list
//   LiveSheet       phone: bottom sheet list (opened from the header ⋯ menu)
//   LiveCount       phone launcher profile row: "● N live"
const M = C.m
const DOT = '#1f8a4c'

function Dot({ size = 7 }) {
  return <i aria-hidden="true" style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: DOT, boxShadow: '0 0 0 2px rgba(31,138,76,.18)', flex: '0 0 auto' }} />
}

export function LiveList({ isAdmin, mobile = false }) {
  const p = useLivePresence(!!isAdmin)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])
  if (!isAdmin) return null
  const ink = mobile ? M.ink : C.t1, muted = mobile ? M.muted : C.t3, line = mobile ? M.line : C.border
  if (!p.loaded) return <div style={{ padding: '12px 4px', fontSize: 13, color: muted }}>Loading…</div>
  if (p.error) return <div style={{ padding: '12px 4px', fontSize: 13, color: muted }}>Couldn't load who's online. It will retry in a moment.</div>
  const others = p.live.filter(u => u.userId !== p.me)
  return (
    <div>
      {p.live.map((u, i) => (
        <div key={u.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: mobile ? 52 : 44, padding: '6px 2px', borderTop: i ? `1px solid ${line}` : 'none' }}>
          <Dot />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: mobile ? 14 : 13, fontWeight: 600, color: ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {u.name}{u.userId === p.me && <span style={{ fontWeight: 500, color: muted }}> (you)</span>}
            </div>
            <div style={{ fontSize: 12, color: muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.page}</div>
          </div>
          <div style={{ fontSize: 12, color: muted, whiteSpace: 'nowrap' }}>active {ago(u.since, now).replace('just now', '<1 min')}</div>
        </div>
      ))}
      {!others.length && <div style={{ padding: '10px 2px 4px', fontSize: 13, color: muted, borderTop: p.live.length ? `1px solid ${line}` : 'none' }}>Only you are online</div>}
    </div>
  )
}

export function LivePill({ isAdmin }) {
  const n = useLiveCount(isAdmin)
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null), popRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const out = e => { if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return; setOpen(false) }
    const esc = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', out); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc) }
  }, [open])
  if (!isAdmin) return null
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button ref={btnRef} type="button" className="live-pill" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-label={n == null ? 'Live users' : `${n} live users`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 11px', borderRadius: 9, border: `1px solid ${C.border}`, background: open ? C.bg : C.card, color: C.t1, fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        <Dot />{n == null ? '–' : n} live
      </button>
      {open && (
        <div ref={popRef} role="dialog" aria-label="Live users" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 500, width: 340, maxWidth: '90vw', maxHeight: 420, overflowY: 'auto', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 12px 32px -8px rgba(0,0,0,0.22)', padding: '8px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.t3, padding: '4px 2px 6px' }}>Live now · last 2 min</div>
          <LiveList isAdmin={isAdmin} />
        </div>
      )}
    </div>
  )
}

export function LiveSheet({ isAdmin, open, onClose }) {
  const n = useLiveCount(isAdmin)
  if (!isAdmin) return null
  return (
    <BottomSheet open={open} onClose={onClose} title={n == null ? 'Live users' : `Live users (${n})`} subtitle="Seen in the last 2 minutes">
      <LiveList isAdmin={isAdmin} mobile />
    </BottomSheet>
  )
}

export function LiveCount({ isAdmin, prefix = false }) {
  const n = useLiveCount(isAdmin)
  if (!isAdmin || n == null) return null
  return <>{prefix && ' · '}<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: M.up, fontWeight: 600, verticalAlign: 'baseline' }}><Dot size={6} />{n} live</span></>
}

export { Dot as LiveDot }
