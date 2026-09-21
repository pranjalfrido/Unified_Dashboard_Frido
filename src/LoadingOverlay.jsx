// ── Blurred loading overlay with a progress ring ────────────────────────────
//
// Replaces the thin indeterminate line that used to sit under the top bar.
//
// On the percentage: the data endpoints answer with a single response and expose
// no progress events, so a true completion figure does not exist. The number here
// is a deliberate approximation — it eases toward a ceiling and only reaches 100%
// once the response actually lands. That is the common convention (YouTube, GitHub
// do the same) and it stays honest in the one way that matters: it never shows
// 100% while the app is still waiting.
import { useEffect, useRef, useState } from 'react'
import { C } from './utils.js'

// A short delay before showing: most cached responses land in well under this, and
// flashing a loader for 80ms reads as a glitch rather than as feedback. Nothing is
// shown for a fetch that resolves quickly.
const SHOW_DELAY_MS = 180

function useLoadingVisible(active) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    clearTimeout(timerRef.current)
    if (active) {
      timerRef.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(v => (v ? false : v))
    }
    return () => clearTimeout(timerRef.current)
  }, [active])

  return visible
}

// ── The mark ────────────────────────────────────────────────────────────────
// The Navigator logo as the loader: a faint full ring as the track, a travelling
// arc whose length breathes as it spins, and the N mark pulsing with it.
//
// Colours come from the theme tokens rather than the supplied literals, so the
// same mark reads gold on the gold theme and indigo on indigo. The gradient id is
// unique per instance: two overlays mounted at once (page plus shell) would
// otherwise share one <defs> id and the second would take the first's stops.
let gradSeq = 0

function NavigatorMark() {
  const [gid] = useState(() => `navRing${++gradSeq}`)

  const R = 20.5

  return (
    <svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="4" y1="4" x2="44" y2="44">
          <stop offset="0" stopColor={C.acs} />
          <stop offset="1" stopColor={C.acd} />
        </linearGradient>
      </defs>

      {/* Faint full ring behind the travelling arc. */}
      <circle cx="24" cy="24" r={R} fill="none" stroke={`url(#${gid})`} strokeWidth="2.2" opacity="0.22" />

      {/* Travelling arc — the whole motion, since there is no determinate figure. */}
      <circle className="nav-shimmer" cx="24" cy="24" r={R} fill="none" stroke={`url(#${gid})`} strokeWidth="2.6" strokeLinecap="round" />

      <g className="nav-mark">
        <path d="M15.5 33 L15.5 15 L32.5 30 L32.5 16.5" fill="none" stroke={C.t1} strokeWidth="5.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M32.5 10 L28.3 17.8 L32.5 15.6 L36.7 17.8 Z" fill={C.acc} />
      </g>
    </svg>
  )
}



export default function LoadingOverlay({ loading, label = 'Loading' }) {
  const visible = useLoadingVisible(loading)
  if (!visible) return null

  return (
    <div className="load-veil" role="status" aria-live="polite" aria-label={label}>
      <NavigatorMark />
    </div>
  )
}
