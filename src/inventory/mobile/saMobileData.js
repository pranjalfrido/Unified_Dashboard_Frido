// Sales & Allocation shared calculations (lifted unchanged from SalesAllocationPage so the desktop
// cards and the mobile view use one copy). No new metrics.

// Top Products: one row per SKU / sub-category / category with units and revenue. With a channel
// selection, re-aggregates the raw rows for those channels (unified_channel2 or unified_channel).
export function topProductsFrom(filteredData, level, metric, channels) {
  if (!filteredData) return []
  let source
  if (channels?.length > 0) {
    const chRows = filteredData.rawRows.filter(r => channels.includes(r.channel2) || channels.includes(r.channel))
    const m = new Map()
    for (const r of chRows) {
      const key = level === 'sku' ? r.sku : level === 'subCategory' ? r.subCategory : r.category
      if (!key) continue
      const ex = m.get(key)
      if (ex) { ex.qty += r.qty; ex.rev += r.rev }
      else m.set(key, { name: key, qty: r.qty, rev: r.rev })
    }
    source = [...m.values()]
  } else {
    const raw = level === 'sku' ? filteredData.productSales.map(r => ({ name: r.sku, qty: r.qty, rev: r.rev }))
      : level === 'subCategory' ? filteredData.subCategorySales.map(r => ({ name: r.subCategory, qty: r.qty, rev: r.rev }))
      : filteredData.categorySales.map(r => ({ name: r.category, qty: r.qty, rev: r.rev }))
    const m = new Map()
    for (const r of raw) {
      if (!r.name) continue
      const ex = m.get(r.name)
      if (ex) { ex.qty = (ex.qty || 0) + (r.qty || 0); ex.rev = (ex.rev || 0) + (r.rev || 0) }
      else m.set(r.name, { ...r })
    }
    source = [...m.values()]
  }
  return source
    .filter(r => (r.rev || 0) > 0 || (r.qty || 0) > 0)
    .sort((a, b) => (b[metric] || 0) - (a[metric] || 0))
}

// Product-Wise Sales Matrix: the server sends day cells; week / month / quarter / year are
// re-bucketed on the client. MSEP must match the server's cell-key delimiter.
export const MSEP = '\x1f'
export function matrixBucketKeyFor(granularity, dateStr) {
  if (granularity === 'date') return dateStr
  const d = new Date(dateStr + 'T00:00:00Z')
  if (granularity === 'week') {
    const day = (d.getUTCDay() + 6) % 7
    d.setUTCDate(d.getUTCDate() - day)
    return d.toISOString().slice(0, 10)
  }
  if (granularity === 'month') return dateStr.slice(0, 7)
  if (granularity === 'quarter') { const [y, m] = dateStr.split('-'); return `${y}-Q${Math.ceil(Number(m) / 3)}` }
  return dateStr.slice(0, 4) // year
}
// path ("cat␟sub␟skuKey") → Map(bucketKey → { qty, rev })
export function matrixCellsFor(matrixCellRows, granularity) {
  const m = new Map()
  for (const c of matrixCellRows || []) {
    const bucketKey = matrixBucketKeyFor(granularity, c.date)
    if (!m.has(c.path)) m.set(c.path, new Map())
    const perBucket = m.get(c.path)
    if (!perBucket.has(bucketKey)) perBucket.set(bucketKey, { qty: 0, rev: 0 })
    const cell = perBucket.get(bucketKey)
    cell.qty += c.qty
    cell.rev += c.rev
  }
  return m
}

// Matrix CSV: one row per date × category × sub-category × SKU × channel (the desktop Export).
export function salesMatrixExport({ filteredData, data, dateFilters, filters }) {
  const raw = filteredData?.rawRows || data?.rawRows || []
  const ds = dateFilters?.start, de = dateFilters?.end
  const mch = filters.matrixChannel || []
  const subset = raw.filter(r => {
    if (ds && r.date < ds) return false
    if (de && r.date > de) return false
    if (mch.length && !mch.includes(r.channel) && !mch.includes(r.channel2)) return false
    return true
  })
  const map = new Map()
  for (const r of subset) {
    const k = `${r.date}||${r.category}||${r.subCategory}||${r.sku}||${r.channel2 || r.channel || ''}`
    if (!map.has(k)) map.set(k, { date: r.date, category: r.category, subCategory: r.subCategory, sku: r.sku, channel: r.channel2 || r.channel || '', qty: 0, rev: 0 })
    const e = map.get(k); e.qty += r.qty; e.rev += r.rev
  }
  const rows = [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.category.localeCompare(b.category) || a.subCategory.localeCompare(b.subCategory) || a.sku.localeCompare(b.sku))
  return {
    filename: `sales_matrix_${dateFilters?.start || 'all'}_${dateFilters?.end || 'all'}.csv`,
    columns: [
      { label: 'Date', key: 'date' },
      { label: 'Category', key: 'category' },
      { label: 'Sub-Category', key: 'subCategory' },
      { label: 'SKU', key: 'sku' },
      { label: 'Channel', key: 'channel' },
      { label: 'Units', key: 'qty' },
      { label: 'Revenue', key: 'rev' },
    ],
    rows,
  }
}
