import { C } from '../utils.js'
import { SHOW_PERIOD_DELTAS } from '../config/flags.js'

// ▲/▼ x.x% coloured by meaning, not by direction: for lowerIsBetter metrics (Return %, RTO %,
// NDR %, SLA breach %) going up is bad (red).
//   loading → a small shimmer in the same spot (previous-period data still on its way)
//   delta null and not loading → grey "—" (no previous value exists)
//   hidden → nothing (the whole card has no ▲/▼: the "all or none per card" rule)
export default function DeltaBadge({ delta, lowerIsBetter = false, loading = false, hidden = false, size = 12 }) {
  if (!SHOW_PERIOD_DELTAS || hidden) return null
  if (loading) {
    return <span className="delta-shimmer" aria-label="Loading change vs previous period" style={{ display: 'inline-block', width: size * 3.6, height: size * 0.95, borderRadius: 4, verticalAlign: 'middle', flexShrink: 0 }} />
  }
  if (delta == null || !isFinite(delta)) {
    return <span aria-label="No previous-period value" style={{ fontSize: size, fontWeight: 600, color: C.t3, whiteSpace: 'nowrap', flexShrink: 0 }}>—</span>
  }
  const up = delta >= 0
  const good = lowerIsBetter ? !up : up
  return (
    <span aria-label={`${up ? 'up' : 'down'} ${Math.abs(delta).toFixed(1)} percent vs previous period`}
      style={{ fontSize: size, fontWeight: 700, color: good ? C.green.tx : C.red.tx, whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
      {up ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}%
    </span>
  )
}
