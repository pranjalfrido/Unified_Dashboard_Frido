// Compact Indian-format number display for small screens (chart axes, tight tiles).
// Display only: never feed these strings back into a calculation, and keep the full value
// available (tooltip / tap) wherever a compact one is shown.

const sign = v => (v < 0 ? '−' : '')
const trim = s => s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')

// ₹1.24 Cr · ₹42.3 L · ₹1.2K · ₹840
export function fmtCompact(v) {
  if (v == null || isNaN(v)) return '₹0'
  const a = Math.abs(v)
  if (a >= 1e7) return `${sign(v)}₹${trim((a / 1e7).toFixed(2))} Cr`
  if (a >= 1e5) return `${sign(v)}₹${trim((a / 1e5).toFixed(1))} L`
  if (a >= 1e3) return `${sign(v)}₹${trim((a / 1e3).toFixed(1))}K`
  return `${sign(v)}₹${Math.round(a).toLocaleString('en-IN')}`
}

// 1.2 Cr · 4.2 L · 12.5K · 840 (counts: orders, units, impressions)
export function fmtCountCompact(v) {
  if (v == null || isNaN(v)) return '0'
  const a = Math.abs(v)
  if (a >= 1e7) return `${sign(v)}${trim((a / 1e7).toFixed(2))} Cr`
  if (a >= 1e5) return `${sign(v)}${trim((a / 1e5).toFixed(1))} L`
  if (a >= 1e3) return `${sign(v)}${trim((a / 1e3).toFixed(1))}K`
  return `${sign(v)}${Math.round(a).toLocaleString('en-IN')}`
}

// Change vs the previous period, for the mobile Overview. Same formula the dashboard already uses
// for every ▲/▼ (revDelta, ordDelta, returnBadge): (cur − prev) / prev × 100.
export function pctChange(cur, prev) {
  if (cur == null || prev == null || !isFinite(cur) || !isFinite(prev) || prev === 0) return null
  return (cur - prev) / prev * 100
}
