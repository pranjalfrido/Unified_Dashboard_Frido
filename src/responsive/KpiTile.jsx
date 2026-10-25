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
export default function KpiTile({ label, value, loading = false, delta, deltaLoading, deltaHidden, lowerIsBetter, selected, onSelect, def, status, onGradient = false, compact = false }) {
  const M = C.m
  const dot = status && !loading ? { good: M.up, warn: M.amber, bad: M.down }[status] : null
  const body = (
    <>
      {/* Tight gaps and letter-spacing so "RETURN % ● ▼16.8%" fits a 375px-wide phone's tile. */}
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, minWidth: 0 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: M.type.label, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.02em', color: M.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          {dot && <span aria-label={`status ${status}`} style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />}
        </span>
        <DeltaBadge delta={delta} loading={deltaLoading} hidden={deltaHidden} lowerIsBetter={lowerIsBetter} size={12} />
      </span>
      <span style={{ display: 'block', marginTop: 3, fontSize: compact ? 14.5 : M.type.tileValue, fontWeight: 700, color: M.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}>{loading ? <Skeleton width="55%" height={15} /> : value}</span>
    </>
  )
  const style = {
    display: 'block', width: '100%', minWidth: 0, height: 56, padding: '8px 8px', borderRadius: M.radius.tile, textAlign: 'left', fontFamily: 'var(--font)',
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
