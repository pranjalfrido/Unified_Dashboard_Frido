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

// Bar-chart build. Columns fill left to right in sequence against a faint track,
// with uneven target heights so it reads as a chart rather than a meter. The last
// column is the tallest, so completion lands on a peak.
const BARS = [0.42, 0.66, 0.52, 0.86, 0.61, 0.94, 0.74, 1.0]

function BarGlyph({ pct }) {
  const W = 132, H = 58, GAP = 5
  const bw = (W - GAP * (BARS.length - 1)) / BARS.length
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="lg-bar" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={C.acm} />
          <stop offset="100%" stopColor={C.acc} />
        </linearGradient>
      </defs>
      {BARS.map((t, i) => {
        const x = i * (bw + GAP)
        const full = t * H
        // Each column owns an equal slice of the run; within its slice it fills 0→1.
        const share = 100 / BARS.length
        const f = Math.max(0, Math.min(1, (pct - i * share) / share))
        return (
          <g key={i}>
            <rect x={x} y={H - full} width={bw} height={full} rx={2.5} fill={C.acs} opacity={0.32} />
            <rect
              x={x} y={H - full} width={bw} height={full} rx={2.5} fill="url(#lg-bar)"
              // scaleY from the baseline keeps this on the compositor; animating the
              // height attribute would re-lay-out the shape on every tick.
              style={{
                transformOrigin: `${x + bw / 2}px ${H}px`,
                transform: `scaleY(${f})`,
                transition: 'transform .28s cubic-bezier(.4,0,.2,1)',
              }}
            />
          </g>
        )
      })}
    </svg>
  )
}

// Sparkline draw-on. A trend line traces itself over a ghost of its own path, with
// a dot riding the leading edge and a soft area filling in behind it.
const SPARK = 'M2,38 L18,31 L34,35 L50,22 L66,27 L82,14 L98,18 L114,7 L130,10'
const SPARK_AREA = SPARK + ' L130,46 L2,46 Z'

function SparkGlyph({ pct }) {
  const W = 132, H = 50
  const ref = useRef(null)
  const [tip, setTip] = useState(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // getPointAtLength gives the exact tip position for any pct, so the dot tracks
    // the drawn line rather than approximating it.
    const p = el.getPointAtLength(el.getTotalLength() * (pct / 100))
    setTip({ x: p.x, y: p.y })
  }, [pct])

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="lg-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.acc} stopOpacity="0.26" />
          <stop offset="100%" stopColor={C.acc} stopOpacity="0" />
        </linearGradient>
        <clipPath id="cp-spark">
          {/* Reveals the area fill in step with the line. */}
          <rect x="0" y="0" width={W * (pct / 100)} height={H} />
        </clipPath>
      </defs>
      {/* Where the line is heading — reads as the chart's own faint guide. */}
      <path d={SPARK} fill="none" stroke={C.acs} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={0.42} />
      <path d={SPARK_AREA} fill="url(#lg-spark)" clipPath="url(#cp-spark)" />
      {/* pathLength=100 normalises the path so the dash offset IS the percentage,
          with no circumference or path-length math. */}
      <path
        ref={ref} d={SPARK} fill="none" stroke={C.acc} strokeWidth="2.25"
        strokeLinecap="round" strokeLinejoin="round"
        pathLength="100" strokeDasharray="100" strokeDashoffset={100 - pct}
        style={{ transition: 'stroke-dashoffset .28s cubic-bezier(.4,0,.2,1)' }}
      />
      {tip && (
        <circle cx={tip.x} cy={tip.y} r="3.4" fill={C.acc} stroke={C.card} strokeWidth="1.8"
          style={{ transition: 'cx .28s cubic-bezier(.4,0,.2,1), cy .28s cubic-bezier(.4,0,.2,1)' }} />
      )}
    </svg>
  )
}

// Ring — the previous glyph, kept so the two can be compared directly.
function RingGlyph({ pct }) {
  const R = 34, STROKE = 5
  const circ = 2 * Math.PI * R
  return (
    <svg width={(R + STROKE) * 2} height={(R + STROKE) * 2} aria-hidden="true" style={{ display: 'block' }}>
      <circle cx={R + STROKE} cy={R + STROKE} r={R} fill="none" stroke={C.acs} strokeWidth={STROKE} opacity={0.5} />
      <circle
        cx={R + STROKE} cy={R + STROKE} r={R} fill="none" stroke={C.acc} strokeWidth={STROKE}
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
        transform={`rotate(-90 ${R + STROKE} ${R + STROKE})`}
        style={{ transition: 'stroke-dashoffset .22s ease-out' }}
      />
    </svg>
  )
}

const GLYPHS = { bars: BarGlyph, spark: SparkGlyph, ring: RingGlyph }

export default function LoadingOverlay({ loading, label = 'Loading', variant = 'bars' }) {
  const { pct, visible } = useLoadingProgress(loading)
  if (!visible) return null
  const Glyph = GLYPHS[variant] || BarGlyph
  const done = pct >= 100

  return (
    <div
      className={`load-veil${done ? ' is-done' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={`${label}, ${pct} percent`}
    >
      <div className="load-card">
        <Glyph pct={pct} />
        <div className="load-meta">
          <span className="load-label">{label}</span>
          <span className="load-pct">{pct}%</span>
        </div>
      </div>
    </div>
  )
}
