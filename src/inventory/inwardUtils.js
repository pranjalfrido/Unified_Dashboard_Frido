// Pure helpers for the Inventory → Inward page (no React, no DOM) — unit-checked by
// scripts/inward-selfcheck.mjs.

// Same normalisation as api/_inventory_shared.js normSku (uppercase, no spaces/underscores), so a
// SKU from the Inward API matches Inventory Health's `skuKey`.
export const normKey = s => (s == null ? '' : String(s).trim().toUpperCase()).replace(/[\s_]+/g, '')

// 'Internal' (intra-company transfer, not a real inward receipt) is excluded from this page
// entirely, at the API/SQL layer (api/_inward_core.js) — never shown here, in any filter, chart,
// or table. Only 3rd-party (Domestic/Import) and Inhouse inward are in scope.
export const SOURCE_TYPES = ['Domestic', 'Import', 'Inhouse']
// Fixed categorical order (IC.categorical / dataviz validated set); Unmapped = neutral grey.
export const SOURCE_COLORS = { Domestic: '#3987e5', Import: '#199e70', Inhouse: '#c98500', Unmapped: '#6f7d75' }

const pad = n => String(n).padStart(2, '0')
const localIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
export const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000)

// Default range: 1st of this month → today (local calendar).
export function thisMonthRange(now = new Date()) {
  return { start: localIso(new Date(now.getFullYear(), now.getMonth(), 1)), end: localIso(now) }
}

// Trend grain: weekly above 90 days, monthly above 180 days (spec).
export function autoGrain(days) { return days > 180 ? 'monthly' : days > 90 ? 'weekly' : 'daily' }

const weekStart = d => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10) }
export function rollup(daily, grain) {
  if (grain === 'daily') return daily
  const keyOf = grain === 'weekly' ? weekStart : d => d.slice(0, 7)
  const m = new Map()
  for (const r of daily) {
    const k = keyOf(r.date)
    if (!m.has(k)) m.set(k, { date: k })
    const acc = m.get(k)
    for (const [f, v] of Object.entries(r)) if (f !== 'date' && typeof v === 'number') acc[f] = (acc[f] || 0) + v
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date))
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function fmtDay(d) { if (!d) return '—'; return `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}` }
export function fmtDayYear(d) { if (!d) return '—'; return `${fmtDay(d)} ${d.slice(2, 4)}` }
export function fmtBucket(d, grain) { return grain === 'monthly' ? `${MON[Number(d.slice(5, 7)) - 1]} ${d.slice(2, 4)}` : grain === 'weekly' ? `wk ${fmtDay(d)}` : fmtDay(d) }
export function fmtRange(a, b) {
  if (!a || !b) return ''
  if (a.slice(0, 7) === b.slice(0, 7)) return `${Number(a.slice(8))}–${Number(b.slice(8))} ${MON[Number(a.slice(5, 7)) - 1]} ${a.slice(0, 4)}`
  return `${fmtDay(a)} – ${fmtDay(b)} ${b.slice(0, 4)}`
}

// % change for ▲/▼; null when there is no comparable previous value.
export function pctChange(cur, prev) {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null
  return ((cur - prev) / Math.abs(prev)) * 100
}

// Inventory Health's default (and phone-only) "Regular" view shows a SKU's stock summed over Regular
// facilities only (InventoryHealthPage.jsx regularSkus), while Avg Sale and DOI stay the feed's own
// values (sales have no facility split; DOI is computed server-side on all facilities). Mirrored
// exactly here so the Inward page shows the same three numbers as the Health page.
export function regularStock(s) {
  if (Array.isArray(s.facilities) && s.facilities.length) return s.facilities.filter(f => f.facilityType === 'Regular').reduce((a, f) => a + (f.totalInvt || 0), 0)
  return (s.locations || []).reduce((a, l) => a + (l.totalInvt || 0), 0) // legacy feed without facilities[]
}

// Stock / Avg Sale / DOI per SKU from Inventory Health's own feed (same numbers as that page).
export function stockIndex(invData) {
  const m = new Map()
  for (const s of invData?.skus || []) m.set(s.skuKey || normKey(s.sku), { totalInvt: regularStock(s), avgSale: s.avgSale ?? 0, doi: s.doi ?? null, stockStatus: s.stockStatus || null })
  return m
}

export function attachStock(skus, idx) {
  return (skus || []).map(s => {
    const h = idx?.get(s.skuKey || normKey(s.sku))
    return { ...s, stock: h ? h.totalInvt : null, avgSale: h ? h.avgSale : null, doi: h ? h.doi : null, stockStatus: h?.stockStatus || null, inHealth: !!h }
  })
}

const searchHit = (q, s) => {
  if (!q) return true
  const n = q.toUpperCase()
  return [s.sku, s.subCategory].some(v => String(v || '').toUpperCase().includes(n))
}

// Current stock + DOI per warehouse, as Inventory Health's Warehouse Health cards show them: stock =
// the location's Regular facilities (loc.byFacilityType), Avg Sale and DOI = the location's own values.
// With a category / sub-category / SKU filter: Regular stock of the matching SKUs at that location,
// Avg Sale = their summed location Avg Sale, DOI = floor(all-facility stock ÷ Avg Sale) — the formula
// InventoryPage.jsx uses for Health's filtered warehouse rows.
export function warehouseStock(invData, filters = {}) {
  const out = new Map()
  if (!invData) return out
  const cats = filters.category || [], subs = filters.subCategory || [], q = filters.sku || ''
  if (!cats.length && !subs.length && !q) {
    for (const l of invData.locations || []) {
      const reg = (l.byFacilityType || []).filter(f => f.facilityType === 'Regular')
      const stock = reg.length ? reg.reduce((a, f) => a + (f.totalInvt || 0), 0) : (l.totalInvt ?? 0)
      out.set(l.location, { stock, avgSale: l.avgSale ?? 0, doi: l.doi ?? null })
    }
    return out
  }
  for (const s of invData.skus || []) {
    if (cats.length && !cats.includes(s.category)) continue
    if (subs.length && !subs.includes(s.subCategory)) continue
    if (!searchHit(q, s)) continue
    const hasFac = Array.isArray(s.facilities) && s.facilities.length
    for (const l of s.locations || []) {
      const a = out.get(l.location) || { stock: 0, allStock: 0, avgSale: 0 }
      a.allStock += l.totalInvt || 0
      a.stock += hasFac ? s.facilities.filter(f => f.facilityType === 'Regular' && f.location === l.location).reduce((x, f) => x + (f.totalInvt || 0), 0) : (l.totalInvt || 0)
      a.avgSale += l.avgSale || 0
      out.set(l.location, a)
    }
  }
  for (const a of out.values()) a.doi = a.avgSale > 0 ? Math.floor(a.allStock / a.avgSale) : null
  return out
}

// Estimated stock at the END of each day, rebuilt backwards from today's stock:
//   stock(day) = stockToday − inward after day + sales after day
export function estimateStock(daily, stockToday) {
  if (stockToday == null) return daily.map(r => ({ ...r, estStock: null }))
  const out = new Array(daily.length)
  let inAfter = 0, salesAfter = 0
  for (let i = daily.length - 1; i >= 0; i--) {
    out[i] = { ...daily[i], estStock: Math.round(stockToday - inAfter + salesAfter) }
    inAfter += daily[i].inward || 0
    salesAfter += daily[i].sales || 0
  }
  return out
}

// Tab-separated text / CSV for the table Copy and CSV buttons. columns: [{ label, csv(row) | key }]
const cell = (c, r) => { const v = c.csv ? c.csv(r) : r[c.key]; return v == null ? '' : String(v) }
export function toTsv(columns, rows) {
  return [columns.map(c => c.label).join('\t'), ...rows.map(r => columns.map(c => cell(c, r).replace(/[\t\n]/g, ' ')).join('\t'))].join('\n')
}
export function toCsv(columns, rows) {
  const esc = s => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return [columns.map(c => esc(c.label)).join(','), ...rows.map(r => columns.map(c => esc(cell(c, r))).join(','))].join('\n')
}

// Number formats (Indian): units 12,345 / 1.23L; ₹ via utils.js fmt.
export const fmtUnits = v => (v == null || Number.isNaN(v) ? '—' : Math.round(v).toLocaleString('en-IN'))
export const fmtRatio = v => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(2)}×`)
export const fmtPct = (v, dp = 1) => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(dp)}%`)
