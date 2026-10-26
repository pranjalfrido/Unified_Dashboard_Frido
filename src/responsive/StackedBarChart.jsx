import { C } from '../utils.js'
import { MixLegend } from './MixBar.jsx'

// Small stacked bar chart for phones (a few bars, e.g. 6 months): no axes, the total above each
// bar, the label under it, a legend of the parts, fixed height. Tapping a bar calls onBar(bar)
// (the page opens a sheet with that bar's parts). Colours come from the caller (Frido greens).
//   bars:   [{ key, label, values: { [seriesKey]: number } }]
//   series: [{ key, label, color }]  (stack order: first at the bottom)
//   fmt:    value → text for the totals
export default function StackedBarChart({ bars, series, height = 150, fmt = v => String(v), onBar, label = 'Chart' }) {
  const M = C.m
  const totals = bars.map(b => series.reduce((s, x) => s + (b.values[x.key] || 0), 0))
  const max = Math.max(...totals, 0) || 1
  const plotH = height - 40 // 18px for the total above, 22px for the label below
  return (
    <div>
      <div role="group" aria-label={label} style={{ display: 'grid', gridTemplateColumns: `repeat(${bars.length || 1}, minmax(0,1fr))`, gap: 8, height }}>
        {bars.map((b, i) => {
          const h = (totals[i] / max) * plotH
          return (
            <button key={b.key} type="button" onClick={onBar ? () => onBar(b) : undefined} aria-label={`${b.label}: ${fmt(totals[i])}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-end', minWidth: 0, padding: 0, border: 'none', background: 'transparent', cursor: onBar ? 'pointer' : 'default', fontFamily: 'var(--font)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: M.ink, textAlign: 'center', lineHeight: '18px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(totals[i])}</span>
              <span style={{ display: 'flex', flexDirection: 'column-reverse', height: Math.max(h, totals[i] > 0 ? 2 : 0), margin: '0 auto', width: '70%', borderRadius: '4px 4px 0 0', overflow: 'hidden' }}>
                {series.map(s => {
                  const v = b.values[s.key] || 0
                  return v > 0 ? <i key={s.key} style={{ display: 'block', height: `${(v / (totals[i] || 1)) * 100}%`, background: s.color }} /> : null
                })}
              </span>
              <span style={{ fontSize: 12, color: M.muted, textAlign: 'center', lineHeight: '22px', borderTop: `1px solid ${M.line}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.label}</span>
            </button>
          )
        })}
      </div>
      <MixLegend parts={series.map(s => ({ key: s.key, label: s.label, color: s.color }))} style={{ marginTop: 8 }} />
    </div>
  )
}
