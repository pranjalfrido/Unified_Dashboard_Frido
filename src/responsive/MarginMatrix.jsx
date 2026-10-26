import { C } from '../utils.js'
import { fmtSigned } from '../pnl/pnlUtils.js'
import { QUADRANTS, matrixPoints } from './marginMatrixPoints.js'

// Margin matrix (PNL_MASTER_PLAN.md Part B §3.2 / §4): gross revenue (x) vs CM1 % (y) per product,
// the channel's CM1 bar (dashed) and the median revenue (dotted). Quadrants:
//   Stars  = revenue ≥ median and CM1 ≥ bar · Grow   = revenue < median and CM1 ≥ bar
//   Fix    = revenue ≥ median and CM1 < bar  · Review = revenue < median and CM1 < bar
// Dots: red below the bar, light green from the bar to 40%, dark green above 40%. Laptop: click a
// dot → onSelect(key). Mobile: mini chart + 4 quadrant tiles → onQuadrant(id).
// Products whose CM1 % isn't known (no SnD or below the table's revenue floor) aren't plotted.
// x is on a square-root scale: a few large products would otherwise squeeze everything else into
// the left edge.
const M = C.m
const dot = (y, bar) => (y < bar ? M.down : y < 40 ? M.g2 : M.green)

export default function MarginMatrix({ rows, bar, variant = 'laptop', onSelect, onQuadrant, height = 300 }) {
  const { pts, median } = matrixPoints(rows, bar)
  if (!pts.length) return null
  const maxX = Math.sqrt(Math.max(...pts.map(p => p.x)) * 1.05)
  const ys = pts.map(p => p.y)
  const minY = Math.min(bar - 10, Math.floor(Math.min(...ys) / 10) * 10)
  const maxY = Math.max(bar + 10, Math.ceil(Math.max(...ys) / 10) * 10)
  const W = 600, H = variant === 'mobile' ? 150 : height, padL = variant === 'mobile' ? 4 : 44, padB = variant === 'mobile' ? 4 : 26, padT = 8, padR = 8
  const sx = x => padL + (Math.sqrt(Math.max(0, x)) / maxX) * (W - padL - padR)
  const sy = y => padT + (1 - (y - minY) / (maxY - minY)) * (H - padT - padB)
  const ticks = []
  for (let t = Math.ceil(minY / 10) * 10; t <= maxY; t += 10) ticks.push(t)
  const svg = (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={variant === 'mobile' ? 150 : height} role="img" aria-label={`Margin matrix: ${pts.length} products, revenue against CM1 %`} style={{ display: 'block' }}>
      {variant !== 'mobile' && ticks.map(t => (
        <g key={t}><line x1={padL} x2={W - padR} y1={sy(t)} y2={sy(t)} stroke={C.border} strokeWidth="1" />
          <text x={padL - 6} y={sy(t) + 4} textAnchor="end" fontSize="11" fill={C.t3}>{t}%</text></g>
      ))}
      <line x1={padL} x2={W - padR} y1={sy(bar)} y2={sy(bar)} stroke={M.ink} strokeWidth="1.2" strokeDasharray="5 4" />
      <text x={W - padR - 4} y={sy(bar) - 4} textAnchor="end" fontSize="11" fill={M.muted}>{bar}% CM1</text>
      <line x1={sx(median)} x2={sx(median)} y1={padT} y2={H - padB} stroke={C.border2} strokeWidth="1" strokeDasharray="2 3" />
      {variant !== 'mobile' && (
        <>
          <text x={padL + 6} y={padT + 14} fontSize="11" fontWeight="700" fill={C.t3}>GROW</text>
          <text x={W - padR - 6} y={padT + 14} textAnchor="end" fontSize="11" fontWeight="700" fill={C.t3}>STARS</text>
          <text x={padL + 6} y={H - padB - 6} fontSize="11" fontWeight="700" fill={C.t3}>REVIEW</text>
          <text x={W - padR - 6} y={H - padB - 6} textAnchor="end" fontSize="11" fontWeight="700" fill={C.t3}>FIX</text>
          <text x={(W + padL) / 2} y={H - 4} textAnchor="middle" fontSize="11" fill={C.t3}>Gross revenue, square-root scale → (dotted line: median {fmtSigned(median)})</text>
        </>
      )}
      {pts.map(p => (
        <circle key={p.key} cx={sx(p.x)} cy={Math.max(padT, Math.min(H - padB, sy(p.y)))} r={variant === 'mobile' ? 4 : 6} fill={dot(p.y, bar)} fillOpacity="0.9"
          style={{ cursor: onSelect ? 'pointer' : 'default' }} onClick={onSelect ? () => onSelect(p.key) : undefined}>
          <title>{`${p.row.sc}: ${fmtSigned(p.x)} · CM1 ${p.y.toFixed(1)}%`}</title>
        </circle>
      ))}
    </svg>
  )
  if (variant !== 'mobile') return svg
  const byQ = Object.fromEntries(QUADRANTS.map(q => [q.id, pts.filter(p => p.q === q.id)]))
  return (
    <>
      {svg}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, marginTop: 10 }}>
        {QUADRANTS.map(q => (
          <button key={q.id} type="button" onClick={() => byQ[q.id].length && onQuadrant?.(q.id, byQ[q.id])} disabled={!byQ[q.id].length}
            style={{ textAlign: 'left', minHeight: 56, padding: '8px 10px', borderRadius: M.radius.tile, border: `1px solid ${M.tileBorder}`, background: '#fff', fontFamily: 'var(--font)', cursor: byQ[q.id].length ? 'pointer' : 'default', color: M.ink }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: M.muted }}>{q.label}</span>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{byQ[q.id].length} · {fmtSigned(byQ[q.id].reduce((s, p) => s + p.x, 0))}</span>
          </button>
        ))}
      </div>
    </>
  )
}
