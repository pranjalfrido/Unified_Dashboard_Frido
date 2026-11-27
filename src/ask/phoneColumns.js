// Which columns of an answer table the phone shows, and an empty Total row filled (used by PulseTable).
const MAX_COLS = 4
const plain = s => (s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim()
const isTotal = r => /^total(\W|$)/i.test(plain(r[0]))
// A column showing a count of SKUs / items, or a text column, is the first to go when the phone has room for fewer columns.
const COUNTISH = /^(skus?|sku count|# ?skus?|products?|grns?|orders?|rows?|count|no\.?)( |$)|with stock/i
const KEYISH = [/value|worth|₹|revenue|gmv|gross|net/i, /units|qty|quantity/i, /inward|received/i]
const NOT_TOTALLED = /(asp|aov|price|mrp|avg|average|per[ _]|[ _]per|rate|ratio|doi|share|%|margin|days|cover|growth|change)/i
// Which columns the phone shows: the first (name) column, the key column (the metric asked), then at most 2 more number columns
// (SKU counts last, text columns never), in the table's own order. Everything else is in "View full table".
// keyHeader may also be { key, show: [header, ...] } (the connector's own choice for a table): the first column plus exactly
// those columns, in that order (the liquidation lists: sub-category, excess value, excess units, trend).
export function phoneColumns(headers, numCols, keyHeaderIn) {
  if (keyHeaderIn && typeof keyHeaderIn === 'object' && Array.isArray(keyHeaderIn.show)) {
    const idx = keyHeaderIn.show.map(w => headers.findIndex((h, j) => j > 0 && plain(h).toLowerCase() === plain(w).toLowerCase())).filter(j => j > 0)
    if (idx.length) return [0, ...new Set(idx)]
  }
  const keyHeader = keyHeaderIn && typeof keyHeaderIn === 'object' ? keyHeaderIn.key : keyHeaderIn
  const ncol = numCols.length
  const nums = Array.from({ length: ncol }, (_, j) => j).filter(j => j > 0 && numCols[j])
  let key = keyHeader ? nums.find(j => plain(headers[j]).toLowerCase() === plain(keyHeader).toLowerCase()) : undefined
  if (key === undefined) for (const re of KEYISH) { key = nums.find(j => re.test(plain(headers[j]))); if (key !== undefined) break }
  if (key === undefined) key = nums[0]
  const rest = nums.filter(j => j !== key)
  const sums = j => !NOT_TOTALLED.test(plain(headers[j]))
  // order of preference: numbers that add up, then counts (SKUs, orders), then averages / DOI / rates (they cannot be totalled)
  const strong = rest.filter(j => sums(j) && !COUNTISH.test(plain(headers[j])))
  const weak = rest.filter(j => sums(j) && COUNTISH.test(plain(headers[j])))
  const never = rest.filter(j => !sums(j))
  const picked = [0, ...(key === undefined ? [] : [key]), ...[...strong, ...(strong.length ? [] : weak), ...(strong.length || weak.length ? [] : never)].slice(0, MAX_COLS - 1 - (key === undefined ? 0 : 1))]
  return picked.sort((a, b) => a - b)
}

// An empty cell of the Total row: the sum of the table's rows, for columns that can be added up (never averages, prices, DOI, rates).
const UNITS = { Cr: 1e7, L: 1e5, K: 1e3, M: 1e6 }
function sumColumn(rows, j, header) {
  if (NOT_TOTALLED.test(plain(header))) return null
  const body = rows.filter(r => !isTotal(r) && !/^other/i.test(plain(r[0])))
  if (body.some(r => /^other/i.test(plain(r[0]))) || body.length < 2) return null
  let sum = 0, money = null
  for (const r of body) {
    const m = /^(₹)?\s?(-?[\d,]+(?:\.\d+)?)\s?(Cr|L|K|M)?$/.exec(plain(r[j]))
    if (!m) return null
    const isMoney = !!m[1] || !!m[3]
    if (money !== null && money !== isMoney) return null
    money = isMoney
    sum += parseFloat(m[2].replace(/,/g, '')) * (m[3] ? UNITS[m[3]] : 1)
  }
  if (!money) return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(sum)
  return sum >= 1e7 ? `₹${(sum / 1e7).toFixed(2)} Cr` : sum >= 1e5 ? `₹${(sum / 1e5).toFixed(2)} L` : `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(sum)}`
}
export function withTotals(rows, headers, numCols) {
  return rows.map(r => {
    if (!isTotal(r)) return r
    const out = Array.from({ length: Math.max(r.length, headers.length) }, (_, j) => r[j] ?? '')
    for (let j = 1; j < out.length; j++) {
      if (numCols[j] && plain(out[j]) === '') { const v = sumColumn(rows, j, headers[j]); if (v) out[j] = `**${v}**`; else if (NOT_TOTALLED.test(plain(headers[j]))) out[j] = '—' }
    }
    return out
  })
}

