import { C } from '../utils.js'

// Thin parts-of-a-whole bar (RTD / RAW / Blocked split, SKUs by status …) with an optional legend.
//   parts: [{ key, label, value, color }]  - zero parts are skipped
//   legend: show "■ label value" items under the bar; fmt(value) formats the legend values
export default function MixBar({ parts, height = 6, legend = false, fmt, label = 'Split', style }) {
  const M = C.m
  const total = parts.reduce((s, p) => s + (p.value > 0 ? p.value : 0), 0)
  return (
    <div style={style}>
      <div role="img" aria-label={`${label}: ${parts.filter(p => p.value > 0).map(p => `${p.label} ${fmt ? fmt(p.value) : p.value}`).join(', ')}`}
        style={{ display: 'flex', height, borderRadius: height / 2, overflow: 'hidden', background: M.line }}>
        {total > 0 && parts.filter(p => p.value > 0).map(p => <i key={p.key} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
      </div>
      {legend && <MixLegend parts={parts} fmt={fmt} style={{ marginTop: 6 }} />}
    </div>
  )
}

// "■ label value" legend, also used alone above lists ("Bar = SKUs by status: …").
export function MixLegend({ parts, fmt, prefix, style }) {
  const M = C.m
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', fontSize: 12, color: M.muted, ...style }}>
      {prefix && <span>{prefix}</span>}
      {parts.map(p => (
        <span key={p.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
          <i aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 2, background: p.color, display: 'inline-block' }} />
          {p.label}{fmt && p.value != null ? <b style={{ color: M.ink, fontWeight: 600 }}>{fmt(p.value)}</b> : null}
        </span>
      ))}
    </div>
  )
}
