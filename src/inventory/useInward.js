// Hooks for the Inventory → Inward page (kept out of InwardPage.jsx so that file only exports a
// component — React fast refresh).
import { useState, useEffect, useRef, useCallback } from 'react'
import { authFetch } from '../authFetch.js'
import { useBreakpoint } from '../responsive/useBreakpoint.js'

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

// One SKU's drill-down (inward events + daily inward/sales, range start → today).
export function useSkuDetail(sku, start, end) {
  const reqKey = sku ? `${sku}|${start}|${end}` : null
  const [s, setS] = useState({ key: null, data: null, error: null })
  useEffect(() => {
    if (!reqKey) return
    let live = true
    authFetch(`${API}/api/inward`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'sku', sku, start, end }) })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `API error ${r.status}`); return j })
      .then(j => { if (live) setS({ key: reqKey, data: j, error: null }) })
      .catch(e => { if (live) setS({ key: reqKey, data: null, error: e.message }) })
    return () => { live = false }
  }, [reqKey]) // eslint-disable-line react-hooks/exhaustive-deps -- reqKey encodes sku/start/end
  const mine = s.key === reqKey
  return { data: mine ? s.data : null, error: mine ? s.error : null, loading: !!reqKey && !mine }
}
