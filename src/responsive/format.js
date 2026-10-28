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

// Human-readable dates for mobile (no ISO dates, no seconds).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ymd = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return { y, m, d } }

// '2026-09-10', '2026-10-10' → "10 Sep – 10 Oct"; adds the year when it differs from this year or
// between the two ends ("20 Dec 2025 – 5 Jan 2026").
export function fmtDateRange(start, end) {
  if (!start || !end) return ''
  const a = ymd(start), b = ymd(end), thisYear = new Date().getFullYear()
  const showYear = a.y !== b.y || b.y !== thisYear
  return `${a.d} ${MONTHS[a.m - 1]}${a.y !== b.y ? ` ${a.y}` : ''} – ${b.d} ${MONTHS[b.m - 1]}${showYear ? ` ${b.y}` : ''}`
}

// ISO timestamp → "25 Oct, 2:33 pm" (local time).
export function fmtUpdated(ts) {
  const d = new Date(ts)
  if (isNaN(d)) return ''
  const h = d.getHours(), mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${h % 12 || 12}:${mm} ${h < 12 ? 'am' : 'pm'}`
}
