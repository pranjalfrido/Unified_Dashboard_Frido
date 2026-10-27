// Margin matrix quadrants and points (MarginMatrix.jsx, and the mobile quadrant lists).
export const QUADRANTS = [
  { id: 'stars', label: 'Stars', hint: 'High revenue, CM1 at or above the bar' },
  { id: 'fix', label: 'Fix', hint: 'High revenue, CM1 below the bar' },
  { id: 'grow', label: 'Grow', hint: 'Lower revenue, CM1 at or above the bar' },
  { id: 'review', label: 'Review', hint: 'Lower revenue, CM1 below the bar' },
]

export function matrixPoints(rows, bar) {
  const pts = rows.filter(r => r.cm1Pct != null && r.gross > 0).map(r => ({ key: `${r.cat}::${r.sc}`, row: r, x: r.gross, y: r.cm1Pct }))
  const xs = pts.map(p => p.x).sort((a, b) => a - b)
  const median = xs.length ? (xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2) : 0
  pts.forEach(p => { p.q = p.x >= median ? (p.y >= bar ? 'stars' : 'fix') : (p.y >= bar ? 'grow' : 'review') })
  return { pts, median }
}
