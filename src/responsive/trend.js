// Daily rows → daily / weekly / monthly rows for MasterTrendCard, for any page.
// Rows are { date: 'YYYY-MM-DD', ...numbers }. Every numeric field is summed per period, so ratio
// metrics should carry their numerator and denominator as separate fields and divide in point().
// A field that is null on every row of a period stays null (no data, not zero).
// Weekly buckets start on Monday (ISO), monthly on YYYY-MM - the same rule as the Overview card
// and the desktop trend charts.
export function weekStart(date) {
  const dt = new Date(`${date}T00:00:00`)
  const day = dt.getDay()
  dt.setDate(dt.getDate() - day + (day === 0 ? -6 : 1))
  const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, '0'), d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function groupSumTrend(rows, gran) {
  const sorted = [...(rows || [])].filter(r => r && r.date).sort((a, b) => a.date.localeCompare(b.date))
  if (gran === 'daily') return sorted
  const buckets = new Map()
  for (const r of sorted) {
    const key = gran === 'weekly' ? weekStart(r.date) : `${r.date.slice(0, 7)}-01`
    if (!buckets.has(key)) buckets.set(key, { date: key })
    const b = buckets.get(key)
    for (const [k, v] of Object.entries(r)) {
      if (k === 'date') continue
      if (typeof v === 'number' && isFinite(v)) b[k] = (b[k] ?? 0) + v
      else if (!(k in b)) b[k] = null
    }
  }
  return [...buckets.values()]
}
