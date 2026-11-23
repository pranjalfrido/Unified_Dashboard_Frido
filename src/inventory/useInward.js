// Hooks for the Inventory → Inward page (kept out of InwardPage.jsx so that file only exports a
// component — React fast refresh).
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { authFetch } from '../authFetch.js'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
import { cogsMonthlyMapOf, getCogsPerUnit } from '../pnl/pnlUtils.js'

const API = import.meta.env.VITE_API_URL || ''

// Phone layout = the same rule as App.jsx Topnav's green phone header.
export function usePhone() {
  const bp = useBreakpoint()
  return { isPhone: bp.width <= 768 || bp.isPhoneLandscape, width: bp.width }
}

export function inwardFilterCount(f = {}) {
  return ['warehouse', 'sourceType', 'vendor', 'category', 'subCategory'].reduce((a, k) => a + (f[k]?.length || 0), 0) + (f.sku ? 1 : 0)
}

// One POST /api/inward per (dates, filters) change, debounced so quick changes batch.
export function useInwardData(enabled, dates, filters) {
  const [state, setState] = useState({ data: null, loading: false, error: null, status: null })
  const reqId = useRef(0)
  const key = JSON.stringify({ start: dates.start, end: dates.end, ...filters })
  const run = useCallback(async bodyStr => {
    const id = ++reqId.current
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const res = await authFetch(`${API}/api/inward`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyStr })
      const json = await res.json().catch(() => ({}))
      if (id !== reqId.current) return
      if (!res.ok) { setState(s => ({ ...s, loading: false, error: json.error || `API error ${res.status}`, status: res.status })); return }
      setState({ data: json, loading: false, error: null, status: 200 })
    } catch (e) {
      if (id === reqId.current) setState(s => ({ ...s, loading: false, error: e.message, status: null }))
    }
  }, [])
  useEffect(() => {
    if (!enabled) return
    const t = setTimeout(() => run(key), 300)
    return () => clearTimeout(t)
  }, [enabled, key, run])
  return { ...state, refresh: () => run(key) }
}

// One SKU's, vendor's, or sub-category's last 10 distinct GRN days (full history, not range-bound).
// mode: 'sku' | 'vendor' | 'subcat'; id: the SKU code, unified vendor name, or sub-category name.
// range: the page's own selected { start, end } — vendor mode only, so the server can also return
// "SKUs supplied" units IN that range (the "last 10 GRN days" table itself stays full-history).
export function useLastGrnDays(mode, id, range) {
  const reqKey = id ? `${mode}|${id}|${mode === 'vendor' ? `${range?.start}|${range?.end}` : ''}` : null
  const [s, setS] = useState({ key: null, data: null, error: null })
  useEffect(() => {
    if (!reqKey) return
    let live = true
    const body = mode === 'sku' ? { mode: 'sku', sku: id } : mode === 'subcat' ? { mode: 'subcat', subCategory: id } : { mode: 'vendor', vendor: id, start: range?.start, end: range?.end }
    authFetch(`${API}/api/inward`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `API error ${r.status}`); return j })
      .then(j => { if (live) setS({ key: reqKey, data: j, error: null }) })
      .catch(e => { if (live) setS({ key: reqKey, data: null, error: e.message }) })
    return () => { live = false }
  }, [reqKey]) // eslint-disable-line react-hooks/exhaustive-deps -- reqKey encodes mode/id
  const mine = s.key === reqKey
  return { data: mine ? s.data : null, error: mine ? s.error : null, loading: !!reqKey && !mine }
}

// Full GRN-level detail (every raw line, not aggregated) for unresolved SKUs or vendors, for the
// Data quality panel's export — admins only (the server enforces this; a non-admin call 403s).
// kind: 'sku' | 'vendor'. Returns a one-shot fetch function, not a subscribed hook — call it from a
// click handler and await the rows, rather than holding thousands of detail rows in page state.
// "Inward value ₹" tile (small addition, laptop + phone): units × COGS/unit via the same monthly
// rate card the P&L page uses (api/cogs-monthly, product_cogs_monthly). No ASP fallback here —
// unlike P&L, an inward line has no selling price — so a SKU with no real monthly rate and no
// sub-category average for that month is simply counted in `skusWithoutCogs` and excluded from the
// ₹ total, never estimated.
// `lines`/`prevLines` here are the server's `skuMonthly`/`prevSkuMonthly`: [{ sku, month, units }],
// already grouped by resolved SKU + calendar month (current and previous period respectively) — a
// month is the COGS rate's own grain, so no per-GRN-line date is needed. `prevLines` is optional:
// pass it to also get `prevValue` for the tile's ▲/▼ vs the previous period.
export function useInwardCogsValue(lines, range, prevLines) {
  const [map, setMap] = useState(null)
  const skuKey = useMemo(() => [...new Set([...(lines || []), ...(prevLines || [])].map(l => l.sku))].sort().join(','), [lines, prevLines])
  const ready = !!(range?.start && range?.end && skuKey)
  useEffect(() => {
    if (!ready) return
    let live = true
    // Covers both periods' months in one call: prevStart's month → end's month.
    const startMonth = `${(range.prevStart || range.start).slice(0, 7)}-01`
    const endMonth = `${range.end.slice(0, 7)}-01`
    authFetch(`${API}/api/cogs-monthly`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skus: skuKey.split(','), startMonth, endMonth }) })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `API error ${r.status}`); return j })
      .then(j => { if (live) setMap(cogsMonthlyMapOf(j.rows || [])) })
      .catch(() => { if (live) setMap(null) })
    return () => { live = false }
  }, [ready, skuKey, range?.start, range?.end, range?.prevStart])

  const valueOf = useMemo(() => ls => {
    if (!map || !ls) return { value: null, skusWithoutCogs: 0 }
    let total = 0
    const noCogsSkus = new Set()
    for (const l of ls) {
      const rate = getRealCogsPerUnit({ sku: l.sku, month: l.month, cogsMonthlyMap: map })
      if (rate == null) { noCogsSkus.add(l.sku); continue }
      total += rate * l.units
    }
    return { value: total, skusWithoutCogs: noCogsSkus.size }
  }, [map])

  return useMemo(() => {
    const cur = valueOf(lines)
    const prev = prevLines ? valueOf(prevLines) : { value: null }
    return { value: cur.value, skusWithoutCogs: cur.skusWithoutCogs, prevValue: prev.value, loading: !!skuKey && !map }
  }, [valueOf, lines, prevLines, skuKey, map])
}

// Same tiering as getCogsPerUnit (real row, then sub-category average) but WITHOUT the ASP
// last-resort estimate — returns null instead, so the caller can count it as "without COGS".
function getRealCogsPerUnit({ sku, month, cogsMonthlyMap }) {
  const entry = cogsMonthlyMap?.[sku]?.[month]
  if (entry && entry.cogs != null) return entry.cogs
  const subCat = Object.values(cogsMonthlyMap?.[sku] || {})[0]?.subCategory
  const avgEntry = subCat ? cogsMonthlyMap?.__subCategoryAvg?.[subCat]?.[month] : null
  return avgEntry != null ? avgEntry : null
}
// getCogsPerUnit imported above is kept available for any future caller that does want the ASP
// fallback tier; this page intentionally doesn't use it (see useInwardCogsValue's comment).
void getCogsPerUnit

export function useDqExport() {
  const [loading, setLoading] = useState(false)
  const fetchRows = useCallback(async (kind, start, end) => {
    setLoading(true)
    try {
      const res = await authFetch(`${API}/api/inward`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'dq_export', kind, start, end }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `API error ${res.status}`)
      return json.rows || []
    } finally {
      setLoading(false)
    }
  }, [])
  return { fetchRows, loading }
}
