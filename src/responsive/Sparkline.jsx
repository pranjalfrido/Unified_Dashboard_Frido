import { C } from '../utils.js'

// Tiny line chart for list rows (mockups/inventory_mobile_mockup.html "Daily sales by product"):
// no axes, one point per value, scaled to the row's own min..max. Display only.
export default function Sparkline({ values, width = 56, height = 18, color, label = 'Trend' }) {
  const v = (values || []).map(x => (x == null || !isFinite(x) ? null : x))
  const nums = v.filter(x => x != null)
  if (nums.length < 2) return <span aria-hidden="true" style={{ display: 'inline-block', width, height }} />
  const max = Math.max(...nums), min = Math.min(...nums)
  const n = v.length
  const pts = v.map((x, i) => (x == null ? null : `${((i / (n - 1)) * width).toFixed(1)},${(height - 2 - ((x - min) / ((max - min) || 1)) * (height - 4)).toFixed(1)}`)).filter(Boolean)
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} style={{ display: 'block', flexShrink: 0 }}>
      <polyline fill="none" stroke={color || C.m.green} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" points={pts.join(' ')} />
    </svg>
  )
}
