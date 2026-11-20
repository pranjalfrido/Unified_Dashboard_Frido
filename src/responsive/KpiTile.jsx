import { C } from '../utils.js'
import DeltaBadge from './DeltaBadge.jsx'
import InfoPopover from './InfoPopover.jsx'
import Skeleton from './Skeleton.jsx'

// KPI tile (docs/responsive/MOBILE_DESIGN_SYSTEM.md §2): label + ▲/▼ on line 1, value on line 2.
// Fixed height, so nothing moves when a ▲/▼ arrives or a tile is selected.
//   onSelect   → the tile is a toggle (MasterTrendCard: switches hero + chart); selected = soft glow
//   otherwise  → tapping shows the metric's definition (InfoPopover)
//   status     → 'good' | 'warn' | 'bad' from config/metricTargets.js: a small dot after the label
//                (no target = no dot)
//   onGradient → the tile sits on the master card's gradient (translucent white background)
//   loading    → the value is still loading: a skeleton instead of a placeholder number
//   valueColor → the page's existing colour rule for the value (e.g. a negative momentum in red)
export default function KpiTile({ label, value, valueColor, loading = false, delta, deltaLoading, deltaHidden, deltaPts, deltaNeutral, lowerIsBetter, selected, onSelect, def, status, onGradient = false }) {
  const M = C.m
  const dot = status && !loading ? { good: M.up, warn: M.amber, bad: M.down }[status] : null
  const body = (
    <>
      {/* Label gets its own full-width line so it never truncates (e.g. "INWARD UNITS", "ACTIVE
          VENDORS", "REJECTION %"); the ▲/▼ delta moves to its own line below the value instead of
          sharing the label's line, where it used to steal width and force an ellipsis. */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: M.type.label, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0, color: M.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{label}</span>
        {dot && <span aria-label={`status ${status}`} style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />}
      </span>
      <span style={{ display: 'block', marginTop: 3, fontSize: M.type.tileValue, fontWeight: 700, color: valueColor || M.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}>{loading ? <Skeleton width="55%" height={15} /> : value}</span>
      {!deltaHidden && (
        <span style={{ display: 'block', marginTop: 2 }}>
          <DeltaBadge delta={delta} loading={deltaLoading} hidden={deltaHidden} lowerIsBetter={lowerIsBetter} pts={deltaPts} neutral={deltaNeutral} size={11.5} />
        </span>
      )}
    </>
  )
  const style = {
    display: 'block', width: '100%', minWidth: 0, minHeight: 56, padding: '8px 8px', borderRadius: M.radius.tile, textAlign: 'left', fontFamily: 'var(--font)',
    background: selected ? '#fff' : onGradient ? 'rgba(255,255,255,.9)' : M.soft,
    border: `1px solid ${selected ? M.glowBorder : M.tileBorder}`,
    boxShadow: selected ? M.glow : onGradient ? '0 1px 2px rgba(15,42,29,.04)' : 'none',
    transition: `box-shadow ${C.motion.base} ease, background ${C.motion.base} ease, border-color ${C.motion.base} ease`,
    cursor: 'pointer',
  }
  if (onSelect) {
    return <button type="button" aria-pressed={!!selected} onClick={onSelect} style={style}>{body}</button>
  }
  return <InfoPopover asChild title={label} text={def} style={style}>{body}</InfoPopover>
}
