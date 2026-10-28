import { C } from '../utils.js'
import { SHOW_PERIOD_DELTAS } from '../config/flags.js'
import Skeleton from './Skeleton.jsx'

// ▲/▼ x.x% coloured by meaning, not by direction: for lowerIsBetter metrics (Return %, RTO %,
// NDR %, SLA breach %) going up is bad (red).
//   loading → a small shimmer in the same spot (previous-period data still on its way)
//   delta null and not loading → grey "—" (no previous value exists)
//   hidden → nothing (the whole card has no ▲/▼: the "all or none per card" rule)
//   pts → the change is in percentage points ("▲0.6 pts", rates on Customer Support); neutral → grey (volumes)
export default function DeltaBadge({ delta, lowerIsBetter = false, loading = false, hidden = false, size = 12, pts = false, neutral = false }) {
  if (!SHOW_PERIOD_DELTAS || hidden) return null
  if (loading) {
    return <Skeleton className="delta-shimmer" label="Loading change vs previous period" width={size * 3.6} height={size * 0.95} radius={4} />
  }
  if (delta == null || !isFinite(delta)) {
    return <span aria-label="No previous-period value" style={{ fontSize: size, fontWeight: 600, color: C.m.muted, whiteSpace: 'nowrap', flexShrink: 0 }}>—</span>
  }
  // A change that rounds to 0.0% gets no arrow and no good/bad colour.
  if (Math.abs(delta) < 0.05) {
    return <span aria-label="No change vs previous period" style={{ fontSize: size, fontWeight: 600, color: C.m.muted, whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{pts ? '0.0 pts' : '0.0%'}</span>
  }
  const up = delta >= 0
  const good = lowerIsBetter ? !up : up
  return (
    <span aria-label={`${up ? 'up' : 'down'} ${Math.abs(delta).toFixed(1)} ${pts ? 'points' : 'percent'} vs previous period`}
      style={{ fontSize: size, fontWeight: 700, color: neutral ? C.m.muted : good ? C.m.up : C.m.down, whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
      {up ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}{pts ? ' pts' : '%'}
    </span>
  )
}
