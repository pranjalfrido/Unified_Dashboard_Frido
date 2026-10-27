import { C } from '../utils.js'

// Small bars for a short series (Customer Support Detailed KPIs: the 7 days / 4 weeks / 3 months of a
// metric). values: numbers or null (null = no data / closed: the slot stays empty, never a zero bar);
// the last bar (today / latest period) is darkest. labels: optional per-bar title (tap-and-hold / hover).
export default function MiniBars({ values, labels, width = 84, height = 26, label = 'Recent values' }) {
  const M = C.m
  const n = values.length || 1
  const max = Math.max(...values.map(v => (v != null && isFinite(v) ? Math.abs(v) : 0)), 0) || 1
  const gap = 3, w = (width - gap * (n - 1)) / n
  return (
    <svg width={width} height={height} role="img" aria-label={`${label}: ${values.map(v => (v == null ? 'no data' : v)).join(', ')}`} style={{ display: 'block', flexShrink: 0 }}>
      {values.map((v, i) => {
        const has = v != null && isFinite(v)
        const h = has ? Math.max(2, Math.abs(v) / max * (height - 2)) : 0
        return (
          <g key={i}>
            {labels?.[i] && <title>{labels[i]}</title>}
            {has
              ? <rect x={i * (w + gap)} y={height - h} width={w} height={h} rx={1.5} fill={i === n - 1 ? M.green : M.g3} />
              : <rect x={i * (w + gap)} y={height - 2} width={w} height={2} rx={1} fill={M.line} />}
          </g>
        )
      })}
    </svg>
  )
}
