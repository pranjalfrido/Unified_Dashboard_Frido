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

// Approach-the-ceiling easing: each tick closes a fixed fraction of the remaining
// distance, so the number moves quickly at first and visibly slows near the top,
// which reads as "working" rather than "stuck" during a long query.
const CEILING = 90
const APPROACH = 0.085
const TICK_MS = 90

function useLoadingProgress(active) {
  const [pct, setPct] = useState(0)
  // `visible` outlives `active` by the exit animation, so the ring can finish at
  // 100% and fade instead of vanishing mid-count.
  const [visible, setVisible] = useState(false)
  const timerRef = useRef(null)
  const exitRef = useRef(null)

  useEffect(() => {
    clearInterval(timerRef.current)
    clearTimeout(exitRef.current)

    if (active) {
      // Intentional setState-in-effect: this component mirrors an external async
      // lifecycle (a prop that flips when a fetch starts and ends), which is exactly
      // the case the rule cannot express. The writes are guarded by the `active`
      // branch and the timers are cleared above, so this cannot loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true)
      setPct(0)
      timerRef.current = setInterval(() => {
        setPct(p => (p >= CEILING ? p : p + (CEILING - p) * APPROACH))
      }, TICK_MS)
    } else if (visible) {
      // Land on 100, hold long enough to be seen, then unmount.
      setPct(100)
      exitRef.current = setTimeout(() => setVisible(false), 420)
    }

    return () => { clearInterval(timerRef.current); clearTimeout(exitRef.current) }
    // `visible` is deliberately not a dependency: including it would re-run this
    // on the exit transition and cancel the very timeout that ends it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return { pct: Math.round(pct), visible }
}

// ── Glyphs ──────────────────────────────────────────────────────────────────
// Each takes the same `pct` and renders a different mark. They are pure
// presentation: the progress hook above is the single source of the number.

// ── The mark ────────────────────────────────────────────────────────────────
// The Navigator logo as the loader: a faint full ring as the track, a travelling
// arc whose length breathes as it spins, and the N mark pulsing with it.
//
// Colours come from the theme tokens rather than the supplied literals, so the
// same mark reads gold on the gold theme and indigo on indigo. The gradient id is
// unique per instance: two overlays mounted at once (page plus shell) would
// otherwise share one <defs> id and the second would take the first's stops.
let gradSeq = 0

function NavigatorMark({ pct }) {
  const [gid] = useState(() => `navRing${++gradSeq}`)

  const R = 20.5
  const CIRC = 2 * Math.PI * R

  return (
    <svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="4" y1="4" x2="44" y2="44">
          <stop offset="0" stopColor={C.acs} />
          <stop offset="1" stopColor={C.acd} />
        </linearGradient>
      </defs>

      {/* Track — always visible, so the ring reads as a whole even at 0%. */}
      <circle cx="24" cy="24" r={R} fill="none" stroke={`url(#${gid})`} strokeWidth="2.2" opacity="0.22" />

      {/* Determinate progress: the arc the percentage actually fills. */}
      <circle
        cx="24" cy="24" r={R} fill="none" stroke={`url(#${gid})`} strokeWidth="2.6" strokeLinecap="round"
        strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct / 100)}
        transform="rotate(-90 24 24)"
        style={{ transition: 'stroke-dashoffset .28s cubic-bezier(.4,0,.2,1)' }}
      />

      {/* Travelling highlight over the top, so the mark still reads as alive while
          the percentage sits at its ceiling waiting on the response. */}
      <circle className="nav-shimmer" cx="24" cy="24" r={R} fill="none" stroke={`url(#${gid})`} strokeWidth="2.6" strokeLinecap="round" />

      <g className="nav-mark">
        <path d="M15.5 33 L15.5 15 L32.5 30 L32.5 16.5" fill="none" stroke={C.t1} strokeWidth="5.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M32.5 10 L28.3 17.8 L32.5 15.6 L36.7 17.8 Z" fill={C.acc} />
      </g>
    </svg>
  )
}



export default function LoadingOverlay({ loading, label = 'Loading' }) {
  const { pct, visible } = useLoadingProgress(loading)
  if (!visible) return null
  const done = pct >= 100

  return (
    <div
      className={`load-veil${done ? ' is-done' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={`${label}, ${pct} percent`}
    >
      <div className="load-card">
        <NavigatorMark pct={pct} />
        <div className="load-meta">
          <span className="load-label">{label}</span>
          <span className="load-pct">{pct}%</span>
        </div>
      </div>
    </div>
  )
}
