// Out-of-stock loss: data loading + the summaries shown on the page, shared by the desktop view
// (OosLossView.jsx) and the phone view (mobile/OosLossMobile.jsx) so both show the same numbers.
// Display only - every figure comes from POST /api/inventory-oos (api/inventory-oos.js); these
// helpers only filter, add up and group what it returns.
import { useEffect, useState } from 'react'
import { authFetch } from '../authFetch.js'

const API = import.meta.env?.VITE_API_URL || ''   // ?. so the helpers also load outside Vite (tests)

// One request per session: the desktop view, the phone view and the Inventory Health entry row
// all read the same promise (the API itself caches for an hour).
let pending = null
function loadOos() {
  if (!pending) {
    pending = authFetch(`${API}/api/inventory-oos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(r => r.json())
      .then(j => { if (j.error) throw new Error(j.error); return j })
      .catch(e => { pending = null; throw e })
  }
  return pending
}

export function useOosData(enabled = true) {
  const [state, setState] = useState({ data: null, error: null })
  useEffect(() => {
    if (!enabled) return
    let alive = true
    loadOos().then(d => alive && setState({ data: d, error: null }), e => alive && setState({ data: null, error: e.message }))
    return () => { alive = false }
  }, [enabled])
  return state
}

// SKUs with no stock in any live warehouse for all 180 days are left out: they kept selling, so
// they are made-to-order / vendor-shipped items (wheelchairs, scooter parts) or stock held only
// in non-live facilities - not stock-outs.
export const stockedSkus = data => (data?.skus || []).filter(r => !r.neverInStock)

// Stock-out ageing buckets (days out of stock).
export const AGE_BUCKETS = [
  { k: '1-7 d', lo: 0, hi: 7 }, { k: '8-15 d', lo: 8, hi: 15 }, { k: '16-30 d', lo: 16, hi: 30 },
  { k: '31-60 d', lo: 31, hi: 60 }, { k: '60+ d', lo: 61, hi: Infinity },
]
export const ageOf = d => AGE_BUCKETS.find(b => d >= b.lo && d <= b.hi)?.k

// The KPI tiles: totals and averages over the given rows.
export function oosSummary(rows) {
  const sum = f => rows.reduce((s, r) => s + (r[f] || 0), 0)
  const withAsp = rows.filter(r => r.asp != null)
  return {
    skus: rows.length,
    loss: sum('lossToDate'),
    daily: sum('dailyLoss'),
    avgDays: rows.length ? sum('daysOos') / rows.length : 0,
    maxDays: rows.length ? Math.max(...rows.map(r => r.daysOos)) : 0,
    // simple average of the SKUs' ASPs (SKUs without an ASP left out)
    avgAsp: withAsp.length ? withAsp.reduce((s, r) => s + r.asp, 0) / withAsp.length : null,
    aspSkus: withAsp.length,
  }
}

// Loss so far by category, largest first ([category, loss] pairs, top `limit`).
export function lossByCategory(rows, limit = 8) {
  const m = new Map()
  for (const r of rows) m.set(r.category, (m.get(r.category) || 0) + (r.lossToDate || 0))
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
}

// Loss so far and SKU count per ageing bucket, in bucket order.
export function lossByAge(rows) {
  const out = AGE_BUCKETS.map(b => ({ k: b.k, loss: 0, skus: 0 }))
  for (const r of rows) {
    const b = out.find(x => x.k === ageOf(r.daysOos))
    if (!b) continue
    b.skus++
    b.loss += r.lossToDate || 0
  }
  return out
}

// CSV columns (desktop "Export CSV" and the phone "⋯ > Export CSV").
export const OOS_EXPORT_COLS = [
  { label: 'SKU', key: 'sku' }, { label: 'Product name', key: 'name' }, { label: 'Category', key: 'category' }, { label: 'Sub-category', key: 'subCategory' },
  { label: 'No. of days OOS', key: 'daysOos' }, { label: 'OOS since', key: 'oosSince' }, { label: 'OOS since source', key: 'oosSource' },
  { label: 'Last D2C sale', key: 'd2cLastSale' }, { label: 'D2C sale days (30 d before)', key: 'd2cSaleDays30' }, { label: 'Stock-based OOS since', key: 'stockOosSince' },
  { label: 'Avg daily sale count', key: 'avgDailySale' },
  { label: 'ASP', key: 'asp' }, { label: 'Loss of sale opportunity', key: 'lossToDate' }, { label: 'Loss per day', key: 'dailyLoss' },
  { label: 'Avg basis', key: 'basis' }, { label: 'Window start', key: 'windowStart' },
  { label: 'Window end', key: 'windowEnd' }, { label: 'Window days', key: 'windowDays' }, { label: 'Window units', key: 'windowUnits' },
  { label: 'B2C units 180d', key: 'units180' }, { label: 'In-stock days 180d', key: 'inStockDays180' }, { label: 'Last sale', key: 'lastSale' },
  { label: 'ASP source', key: 'aspSource' },
]
