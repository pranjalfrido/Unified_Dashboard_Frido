import { useState } from 'react'
import { C } from '../utils.js'

// Stacked bars per day (or any period): one stack per bar, one segment per series, Frido green shades.
//   bars    [{ key, label, segs: { [seriesKey]: number }, pending?: bool, tip?: string }]
//   series  [{ key, label, color }] (stack order, first = bottom)
//   fmt     value → string (axis + tooltip)
//   variant 'laptop': axis labels, hover shows every series for that bar
//           'mobile': no axes, tap a bar → onSelect(i); legend top 4 + "n more"
// A pending bar (e.g. revenue not loaded yet) draws as a dotted outline with ◌ under it.
const M = C.m

export default function StackedDailyBars({ bars = [], series = [], fmt = v => String(Math.round(v)), variant = 'laptop', height, onSelect, ariaLabel = 'Daily bars' }) {
  const [hover, setHover] = useState(null)
  const mobile = variant === 'mobile'
  const W = mobile ? 335 : 1140, H = height || (mobile ? 124 : 230)
  const l = mobile ? 2 : 58, r = 6, t = 8, b = mobile ? 4 : 24
  const totals = bars.map(bar => series.reduce((s, x) => s + Math.max(0, bar.segs[x.key] || 0), 0))
  const max = Math.max(1e-9, ...totals) * 1.08
  const bw = (W - l - r) / Math.max(1, bars.length)
  const y = v => t + (1 - v / max) * (H - t - b)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * max)
  const labelEvery = Math.max(1, Math.ceil(bars.length / (mobile ? 6 : 16)))
  const hb = hover != null ? bars[hover] : null
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio={mobile ? 'none' : 'xMidYMid meet'} role="img" aria-label={ariaLabel} style={{ display: 'block' }}
        onMouseLeave={() => setHover(null)}>
        {!mobile && ticks.map((v, i) => (
          <g key={i}>
            <line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke={M.line} strokeWidth="1" />
            <text x={l - 6} y={y(v) + 4} fontSize="11" fill={M.muted} textAnchor="end">{fmt(v)}</text>
          </g>
        ))}
        {bars.map((bar, i) => {
          let top = H - b
          const x = l + i * bw + bw * 0.16, w = bw * 0.68
          return (
            <g key={bar.key} style={{ cursor: onSelect || !mobile ? 'pointer' : 'default' }}
              onMouseEnter={() => !mobile && setHover(i)} onClick={() => onSelect?.(i)}>
              <rect x={l + i * bw} y={t} width={bw} height={H - t - b} fill="transparent" />
              {bar.pending && totals[i] === 0
                ? <rect x={x} y={H - b - 12} width={w} height={12} fill="none" stroke={M.g3} strokeDasharray="2 2" />
                : series.map(s => {
                  const v = Math.max(0, bar.segs[s.key] || 0)
                  const h = (v / max) * (H - t - b)
                  top -= h
                  return h > 0 ? <rect key={s.key} x={x} y={top} width={w} height={h} fill={s.color} stroke="#fff" strokeWidth="0.5" opacity={hover != null && hover !== i ? 0.55 : 1} /> : null
                })}
              {!mobile && i % labelEvery === 0 && <text x={l + i * bw + bw / 2} y={H - 7} fontSize="11" fill={M.muted} textAnchor="middle">{bar.label}</text>}
              {bar.pending && !mobile && <text x={l + i * bw + bw / 2} y={H - b - 16} fontSize="11" fill={M.g2} textAnchor="middle">◌</text>}
            </g>
          )
        })}
      </svg>
      {hb && !mobile && (
        <div role="tooltip" style={{ position: 'absolute', top: 4, left: `min(${(l + hover * bw + bw) / W * 100}%, calc(100% - 220px))`, width: 210, background: '#fff', border: `1px solid ${M.line}`, borderRadius: 10, boxShadow: '0 6px 18px rgba(0,0,0,.10)', padding: '8px 10px', fontSize: 12, pointerEvents: 'none', zIndex: 5 }}>
          <div style={{ fontWeight: 700, color: M.ink, marginBottom: 4 }}>{hb.label}{hb.pending ? ' · revenue pending' : ''}</div>
          {hb.tip
            ? <div style={{ color: M.ink, whiteSpace: 'pre-line', fontVariantNumeric: 'tabular-nums' }}>{hb.tip}</div>
            : series.map(s => (
              <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: M.muted }}><i style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />{s.label}</span>
                <b style={{ color: M.ink }}>{fmt(hb.segs[s.key] || 0)}</b>
              </div>
            ))}
        </div>
      )}
      <Legend series={series} mobile={mobile} />
    </div>
  )
}

function Legend({ series, mobile }) {
  const shown = mobile ? series.slice(0, 4) : series
  if (series.length < 2) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', justifyContent: mobile ? 'flex-start' : 'center', marginTop: 6, fontSize: 12, color: M.muted }}>
      {shown.map(s => <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: s.color, border: `1px solid ${M.g4}`, display: 'inline-block' }} />{s.label}</span>)}
      {mobile && series.length > 4 && <span>+{series.length - 4} more</span>}
    </div>
  )
}
