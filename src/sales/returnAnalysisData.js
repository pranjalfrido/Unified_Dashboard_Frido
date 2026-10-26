import { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import { rangeTouchesImmatureWindow, PROVISIONAL_MATURITY_CUTOFF_DAYS } from '../utils.js'

// Shared by the D2C Return Analysis page (desktop and mobile) and the Sales → D2C mobile entry
// card (docs/responsive/RETURN_ANALYSIS_PLAN.md). Display helpers only: every number still comes
// from /api/return-analysis exactly as the desktop page reads it.

// The page's one request, moved here unchanged from D2CReturnAnalysisTab so the entry card sends
// the identical body (and so hits the API's cache when the page opens).
const NO_AGE_MAP = {}
export function useReturnAnalysis({ filters, subCatFirstOrderMap = NO_AGE_MAP, topProductsPaymentType = '' }) {
  const API = import.meta.env.VITE_API_URL || ''
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const reqIdRef = useRef(0)
  useEffect(() => {
    if (!filters.start || !filters.end) return
    const reqId = ++reqIdRef.current
    let subCategoryList = filters.subCategory?.length ? [...filters.subCategory] : []
    if (filters.productAge && Object.keys(subCatFirstOrderMap).length) {
      const today = new Date()
      const ageSubs = Object.entries(subCatFirstOrderMap)
        .filter(([, d]) => { const days = (today - new Date(d)) / 86400000; return filters.productAge === 'new' ? days <= 90 : days > 90 })
        .map(([sc]) => sc)
      subCategoryList = ageSubs
    }
    const body = {
      start: filters.start, end: filters.end,
      subChannel: (filters.subChannel === 'MyFrido' || filters.subChannel === 'Mobility') ? filters.subChannel : '',
      category: filters.category?.length ? filters.category.join(',') : undefined,
      subCategory: subCategoryList.length ? subCategoryList.join(',') : undefined,
      topProductsPaymentType: topProductsPaymentType || undefined,
    }
    // Deferred to a microtask so the fetch kickoff (and its setLoading/setError) doesn't run
    // synchronously inside the effect body itself — same async-boundary shape React's
    // set-state-in-effect rule wants, without changing request/race-guard behavior.
    Promise.resolve().then(() => {
      if (reqId !== reqIdRef.current) return
      setLoading(true)
      setError(null)
      fetch(`${API}/api/return-analysis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(r => { if (!r.ok) throw new Error(`API error ${r.status}`); return r.json() })
        .then(json => { if (reqId === reqIdRef.current) setData(json) })
        .catch(e => { if (reqId === reqIdRef.current) setError(e.message) })
        .finally(() => { if (reqId === reqIdRef.current) setLoading(false) })
    })
  }, [API, filters.start, filters.end, filters.subChannel, filters.category, filters.subCategory, filters.productAge, subCatFirstOrderMap, topProductsPaymentType])
  return { data, loading, error }
}

// Return Metrics Trend grouping, moved here unchanged from ReturnTrendChart: weekly / monthly
// points are the plain average of the daily percentages and the sum of daily revenue.
export function groupReturnTrend(raw, groupBy) {
  if (groupBy === 'daily') return raw
  const buckets = {}
  raw.forEach(d => {
    const key = groupBy === 'weekly'
      ? (() => { const dt = new Date(d.date); const day = dt.getDay(); const diff = dt.getDate() - day + (day === 0 ? -6 : 1); return new Date(dt.setDate(diff)).toISOString().slice(0, 10) })()
      : d.date.slice(0, 7)
    if (!buckets[key]) buckets[key] = { date: key, revenue: 0, cancelPct: 0, rtoPct: 0, cirPct: 0, exchangePct: 0, totalReturnPct: 0, _n: 0 }
    buckets[key].revenue += d.revenue
    buckets[key].cancelPct += d.cancelPct; buckets[key].rtoPct += d.rtoPct; buckets[key].cirPct += d.cirPct
    buckets[key].exchangePct += d.exchangePct; buckets[key].totalReturnPct += d.totalReturnPct; buckets[key]._n += 1
  })
  return Object.values(buckets).map(b => ({ ...b, cancelPct: b.cancelPct / b._n, rtoPct: b.rtoPct / b._n, cirPct: b.cirPct / b._n, exchangePct: b.exchangePct / b._n, totalReturnPct: b.totalReturnPct / b._n })).sort((a, b) => a.date.localeCompare(b.date))
}

// The desktop tables' red rule (ReturnBreakdownTable / PaymentTypeTransposedTable RED_THRESH).
export const RED_THRESH = { cancelPct: 3, rtoPct: 9, cirPct: 9, exchangePct: 6, totalReturnPct: 20 }
export const isRed = (key, v) => RED_THRESH[key] != null && (v || 0) > RED_THRESH[key]
// Exchange deep dive's own rule: Exch % ≥ 15 red, ≥ 8 amber.
export const exchTone = v => (v >= 15 ? 'bad' : v >= 8 ? 'warn' : null)

// 4b size swap: the SKU's top exchanged-to SKU is the same product in another size when the two
// codes differ in exactly one dash-separated part and both parts are sizes (S/M/L/XL/…, or a
// 1–2 digit size), each with an optional trailing digit (FR-OPC-M1 → FR-OPC-L1,
// FR-CCASS-08-CB1 → FR-CCASS-07-CB1). Reads the existing top1 columns only; shown when most
// exchanges (≥ 50%) go there.
const SIZE_PART = /^(XXS|XS|S|M|L|XL|XXL|XXXL|[2-6]XL|\d{1,2})\d?$/i
export function isSizeSwap(fromSku, toSku) {
  if (!fromSku || !toSku || fromSku === toSku) return false
  const a = fromSku.split('-'), b = toSku.split('-')
  if (a.length !== b.length) return false
  const diff = a.map((p, i) => i).filter(i => a[i] !== b[i])
  return diff.length === 1 && SIZE_PART.test(a[diff[0]]) && SIZE_PART.test(b[diff[0]])
}
export const sizeSwapPct = r => (r.top1Pct != null && r.top1Pct >= 50 && isSizeSwap(r.sku, r.top1Sku) ? r.top1Pct : null)

// 4a maturity note: the existing Provisional Return% cutoff (utils.js, 14 days). Returns the
// cutoff date ("12 Oct") when the selected range ends inside the immature window, else null.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function immatureSince(end) {
  if (!rangeTouchesImmatureWindow(end)) return null
  const d = new Date()
  d.setDate(d.getDate() - PROVISIONAL_MATURITY_CUTOFF_DAYS)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}
export const maturityText = since => `Returns for orders after ${since} are still coming in; recent return % will rise.`

// Mobile: one page-wide Qty / Rev setting (the header "⋯" sets it, the header sub-line and the
// cards read it). Revenue by default, as on desktop.
let basis = 'revenue'
const listeners = new Set()
export function setRaBasis(v) { basis = v; listeners.forEach(l => l()) }
export function useRaBasis() {
  return useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l) }, () => basis)
}

// Where Sales → D2C was when Return Analysis opened from it (sub-tab + scroll), so the back arrow
// returns to the same spot.
let salesSpot = null
export function rememberSalesSpot(spot) { salesSpot = spot }
export function peekSalesSpot() { return salesSpot }
export function takeSalesSpot() { const s = salesSpot; salesSpot = null; return s }
