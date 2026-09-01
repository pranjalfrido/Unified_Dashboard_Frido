import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { IC, PAGE_BACKGROUND, getDefaultDates, DateRangeControl } from './inventory/theme.jsx'
import InventoryHealthPage from './inventory/InventoryHealthPage.jsx'
import SalesAllocationPage from './inventory/SalesAllocationPage.jsx'
import InwardPage from './inventory/InwardPage.jsx'

// Inventory Health's Avg Sale/DOI always use useEndpoint's default trailing-7-day window
// (getDefaultDates()) — no visible date picker for that tab, so those numbers always read
// as "current state" rather than something a stale filter could quietly leave stuck on an old range.

function IconTab({ icon, label, active, onClick }) {
  const [hover, setHover] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)

  // Portaled to document.body instead of an absolutely-positioned sibling — this tab now
  // lives inside FilterSidebar, which needs overflow:hidden for its collapse/expand width
  // transition. A same-context tooltip gets clipped by that overflow (and can render behind
  // sidebar content); a portal escapes it entirely, same technique SearchableMultiSelect
  // uses for its dropdown panel.
  const showTooltip = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 6, left: r.left + r.width / 2 })
    setHover(true)
  }

  return (
    <div style={{ position: 'relative' }} onMouseEnter={showTooltip} onMouseLeave={() => setHover(false)}>
      <button ref={btnRef} onClick={onClick}
        style={{
          width: 34, height: 34, borderRadius: 7, cursor: 'pointer', fontSize: 15, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: active ? '#E8F0FE' : 'transparent',
          color: active ? '#1967D2' : IC.t3,
          border: active ? '1px solid #AECBFA' : '1px solid transparent',
        }}>
        {icon}
      </button>
      {hover && pos && createPortal(
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-50%)',
          background: IC.surfaceHi, border: `1px solid ${IC.border2}`, borderRadius: 6, padding: '4px 9px',
          fontSize: 11, color: IC.t1, whiteSpace: 'nowrap', zIndex: 500, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}>
          {label}
        </div>,
        document.body
      )}
    </div>
  )
}

// Mobile tab button — icon + label text stacked, used inside the filter drawer
function MobileTab({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
      padding: '8px 4px', borderRadius: 10, cursor: 'pointer', border: 'none',
      background: active ? '#E8F0FE' : 'transparent',
      color: active ? '#1967D2' : IC.t3,
      fontWeight: active ? 700 : 500, fontSize: 10, lineHeight: 1.2, transition: 'background .15s',
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

// Sub-tab switcher (Health/Sales/Inward) — rendered at the top of each sub-page's own
// FilterSidebar instead of as a second horizontal bar above the page, so the Inventory tab
// matches Logistics's layout convention: one top bar (title + date), everything else lives
// in the left column.
function SubTabSwitcher({ tab, setTab, isMobile }) {
  if (isMobile) {
    return (
      <div style={{ display: 'flex', gap: 4, background: '#F4F6FB', borderRadius: 12, padding: 4, marginBottom: 14 }}>
        <MobileTab icon="📦" label="Health" active={tab === 'health'} onClick={() => setTab('health')} />
        <MobileTab icon="📊" label="Sales & Alloc" active={tab === 'sales'} onClick={() => setTab('sales')} />
        {/* <MobileTab icon="📥" label="Inward" active={tab === 'inward'} onClick={() => setTab('inward')} /> */}
      </div>
    )
  }
  return (
    <div style={{ display: 'inline-flex', gap: 2, background: IC.surface, border: `1px solid ${IC.border}`, borderRadius: 10, padding: 3, marginBottom: 12 }}>
      <IconTab icon="📦" label="Inventory Health" active={tab === 'health'} onClick={() => setTab('health')} />
      <IconTab icon="📊" label="Sales & Allocation" active={tab === 'sales'} onClick={() => setTab('sales')} />
      {/* <IconTab icon="📥" label="Inward" active={tab === 'inward'} onClick={() => setTab('inward')} /> */}
    </div>
  )
}

// `enabled` gates the auto-fetch effect so an inactive tab's endpoint doesn't hit BigQuery
// at all until the user actually switches to it — previously all 3 sub-tabs' endpoints
// fired on every page load regardless of which tab was visible, tripling query volume.
function useEndpoint(path, extraFilters, enabled = true) {
  const def = getDefaultDates()
  const [dateFilters, setDateFilters] = useState({ start: def.start, end: def.end })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const reqIdRef = useRef(0)
  // The initial range guesses `end = today`, since we don't know the pipeline's actual
  // latest complete sales date until the first response comes back. Once it does, snap
  // the range to end on lastSalesDateConsidered (today's data is usually partial) instead
  // — but only on that first auto-correction, so a user's own later date-picker edits or
  // Refresh clicks aren't silently overridden.
  const API = import.meta.env.VITE_API_URL || ''

  const fetchData = useCallback(async (body) => {
    const reqId = ++reqIdRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
      const json = await res.json()
      if (reqId !== reqIdRef.current) return
      setData(json)
    } catch (e) { if (reqId === reqIdRef.current) setError(e.message) }
    finally { if (reqId === reqIdRef.current) setLoading(false) }
  }, [API, path])

  useEffect(() => {
    if (!enabled) return
    fetchData({ ...dateFilters, ...extraFilters })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, dateFilters.start, dateFilters.end, JSON.stringify(extraFilters), fetchData])

  return { dateFilters, setDateFilters, data, loading, error, fetchData }
}

// Fetches a pre-computed static JSON from Vercel CDN (~100-200ms, no cold start).
// Falls back to live API POST when: file is stale/missing, user picks a different date
// range, OR any sidebar filter is active (static file holds unfiltered data only).
function useStatic(staticPath, fallbackApiPath, fallbackBody = {}, enabled = true) {
  const def = getDefaultDates()
  const [dateFilters, setDateFilters] = useState({ start: def.start, end: def.end })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const reqIdRef = useRef(0)
  const cachedRangeRef = useRef(null) // { start, end } of the static file's date range
  const cachedDataRef = useRef(null)  // the raw static JSON, so we can restore it when filters are cleared
  const fallbackBodyRef = useRef(fallbackBody)
  const API = import.meta.env.VITE_API_URL || ''

  // Always keep ref current so fetchFromAPI sees latest filters without stale closure
  fallbackBodyRef.current = fallbackBody

  // True when ANY sidebar filter value is non-empty. `alwaysPresentKeys` are structural
  // params (momentumWindow, topN, etc.) that are always sent regardless of user selection
  // and must not count as "active filters" that bypass the cache.
  const alwaysPresentKeys = new Set(['momentumWindow', 'topN'])
  const hasActiveFilters = (body) => Object.entries(body).some(([k, v]) => {
    if (alwaysPresentKeys.has(k)) return false
    return Array.isArray(v) ? v.length > 0 : v != null && v !== false && v !== ''
  })

  // Hits the live API directly with the current date range + all active filters
  const fetchFromAPI = useCallback(async (start, end) => {
    const reqId = ++reqIdRef.current
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API}${fallbackApiPath}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end, ...fallbackBodyRef.current }),
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const json = await res.json()
      if (reqId !== reqIdRef.current) return
      setData(json)
      setDateFilters({ start, end })
      if (json.lastSalesDateConsidered) {
        const correctedEnd = json.lastSalesDateConsidered
        const rangeDays = Math.round((new Date(end) - new Date(start)) / 86400000)
        const correctedStart = new Date(correctedEnd)
        correctedStart.setDate(correctedStart.getDate() - rangeDays)
        setDateFilters({ start: correctedStart.toISOString().slice(0, 10), end: correctedEnd })
      }
    } catch (e2) { if (reqId === reqIdRef.current) setError(e2.message) }
    finally { if (reqId === reqIdRef.current) setLoading(false) }
  }, [API, fallbackApiPath])

  // Initial load: try static file first
  const fetchData = useCallback(async () => {
    const reqId = ++reqIdRef.current
    setLoading(true); setError(null)
    try {
      const res = await fetch(staticPath)
      if (!res.ok) throw new Error(`static file missing (${res.status})`)
      const json = await res.json()
      if (reqId !== reqIdRef.current) return
      const ageMs = json.asOf ? Date.now() - new Date(json.asOf).getTime() : Infinity
      if (ageMs > 30 * 24 * 60 * 60 * 1000 || json._placeholder) throw new Error('static file stale or placeholder')
      cachedDataRef.current = json
      setData(json)
      // end = max(order_date) - 1 (last complete day), start = end - 6 → 7-day window
      const lastSales = json.lastSalesDate || getDefaultDates().end
      const endD = new Date(lastSales + 'T00:00:00Z')
      endD.setUTCDate(endD.getUTCDate() - 1) // subtract 1: partial day excluded
      const startD = new Date(endD); startD.setUTCDate(startD.getUTCDate() - 6)
      const toLocal = d => d.toISOString().slice(0, 10)
      cachedRangeRef.current = { start: toLocal(startD), end: toLocal(endD) }
      setDateFilters({ start: toLocal(startD), end: toLocal(endD) })
    } catch {
      if (cachedDataRef.current) return // static loaded fine already
      const { start, end } = getDefaultDates()
      if (reqId !== reqIdRef.current) return
      setLoading(false)
      fetchFromAPI(start, end)
      return
    }
    if (reqId === reqIdRef.current) setLoading(false)
  }, [staticPath, fetchFromAPI])

  const initialFetchedRef = useRef(false)
  useEffect(() => {
    if (!enabled) return
    if (initialFetchedRef.current) return
    initialFetchedRef.current = true
    fetchData()
  }, [enabled, fetchData])

  // When date range changes: restore cache if back to cached range (and no filters), else hit API
  const prevDateRef = useRef(null)
  useEffect(() => {
    if (!enabled || !initialFetchedRef.current) return
    const { start, end } = dateFilters
    const prev = prevDateRef.current
    if (prev && prev.start === start && prev.end === end) return
    prevDateRef.current = { start, end }
    const cached = cachedRangeRef.current
    if (!cached) return
    if (cached.start === start && cached.end === end && !hasActiveFilters(fallbackBodyRef.current)) {
      // Back to the cached range with no filters — restore static data instantly
      if (cachedDataRef.current) setData(cachedDataRef.current)
      return
    }
    fetchFromAPI(start, end)
  }, [enabled, dateFilters.start, dateFilters.end, fetchFromAPI]) // eslint-disable-line react-hooks/exhaustive-deps

  // When sidebar filters change: debounce 600ms so multi-select clicks batch into one API call
  const prevFiltersRef = useRef(null)
  const filterTimerRef = useRef(null)
  useEffect(() => {
    if (!enabled || !initialFetchedRef.current) return
    const bodyStr = JSON.stringify(fallbackBody)
    if (prevFiltersRef.current === bodyStr) return
    prevFiltersRef.current = bodyStr
    const cached = cachedRangeRef.current
    const { start, end } = dateFilters
    if (!hasActiveFilters(fallbackBody)) {
      // All filters cleared — restore static cache instantly if on the cached date range
      if (cached && cached.start === start && cached.end === end && cachedDataRef.current) {
        clearTimeout(filterTimerRef.current)
        setData(cachedDataRef.current)
        return
      }
    }
    if (!cached) return // still on initial load
    // If static file has rawRows, client-side filtering handles it instantly
    if (cachedDataRef.current?.rawRows) return
    clearTimeout(filterTimerRef.current)
    filterTimerRef.current = setTimeout(() => fetchFromAPI(start, end), 600)
    return () => clearTimeout(filterTimerRef.current)
  }, [enabled, JSON.stringify(fallbackBody), fetchFromAPI]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh button
  const refetch = useCallback(() => {
    fetchFromAPI(dateFilters.start, dateFilters.end)
  }, [dateFilters.start, dateFilters.end, fetchFromAPI])

  return { dateFilters, setDateFilters, data, loading, error, fetchData: refetch }
}

// Inventory Health uses 3 separate static files (one per avg-sale window).
// Falls back to POST /api/inventory if the file is missing or stale (>2h).
function useStaticInv(enabled = true, windowDays = 7) {
  const def = getDefaultDates()
  const [dateFilters, setDateFilters] = useState({ start: def.start, end: def.end })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const reqIdRef = useRef(0)
  const API = import.meta.env.VITE_API_URL || ''

  const fetchData = useCallback(async (windowDays = 7) => {
    const reqId = ++reqIdRef.current
    setLoading(true)
    setError(null)
    let staticOk = false
    try {
      const res = await fetch(`/inv-data-${windowDays}d.json`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`static file missing (${res.status})`)
      const json = await res.json()
      if (reqId !== reqIdRef.current) return
      const ageMs = json.asOf ? Date.now() - new Date(json.asOf).getTime() : Infinity
      if (ageMs > 30 * 24 * 60 * 60 * 1000) throw new Error('static file stale')
      staticOk = true
      setData(json)
      if (json.avgSaleWindow) setDateFilters({ start: json.avgSaleWindow.start, end: json.avgSaleWindow.end })
    } catch {
      if (staticOk) return // static loaded fine, no need to fallback
      // fallback: hit live API
      try {
        const { start, end } = getDefaultDates()
        const res2 = await fetch(`${API}/api/inventory`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start, end, avgSaleWindowDays: windowDays }),
        })
        if (!res2.ok) throw new Error(`API error ${res2.status}`)
        const json2 = await res2.json()
        if (reqId !== reqIdRef.current) return
        setData(json2)
        if (json2.avgSaleWindow) setDateFilters({ start: json2.avgSaleWindow.start, end: json2.avgSaleWindow.end })
      } catch (e2) { if (reqId === reqIdRef.current) setError(e2.message) }
    } finally { if (reqId === reqIdRef.current) setLoading(false) }
  }, [API])

  const windowDaysRef = useRef(null)
  useEffect(() => {
    if (!enabled) return
    const w = windowDays || 7
    if (data && windowDaysRef.current === w) return  // already loaded for this window
    windowDaysRef.current = w
    fetchData(w)
  }, [enabled, data, windowDays, fetchData])

  return { dateFilters, setDateFilters, data, loading, error, fetchData }
}

export default function InventoryPage({ onTopbarDateControl, tab = 'health', setTab = () => {} }) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const [healthFilters, setHealthFilters] = useState({})
  const [salesFilters, setSalesFilters] = useState({})
  const [inwardFilters, setInwardFilters] = useState({})

  const csv = arr => (arr && arr.length ? arr.join(',') : undefined)
  const salesFilterBody = {
    category: csv(salesFilters.category), subCategory: csv(salesFilters.subCategory), sku: csv(salesFilters.sku),
    channel: csv(salesFilters.channel), salesType: csv(salesFilters.salesType), facility: csv(salesFilters.facility),
    region: csv(salesFilters.region), comparePrevious: salesFilters.comparePrevious, momentumWindow: salesFilters.momentumWindow || 7,
    topN: salesFilters.topN || 10,
    matrixChannel: csv(salesFilters.matrixChannel),
    drasticChannel: csv(salesFilters.drasticChannel),
  }
  const inwardFilterBody = {
    category: csv(inwardFilters.category), subCategory: csv(inwardFilters.subCategory), sku: csv(inwardFilters.sku),
    facility: csv(inwardFilters.facility), vendor: csv(inwardFilters.vendor),
    includeUnmapped: inwardFilters.includeUnmapped || false,
  }

  // Only the active tab's endpoint fetches from BigQuery — previously all 3 fired on every
  // page load regardless of which tab was visible, tripling query volume unnecessarily.
  // Sales & Allocation is the one exception: it must always be enabled even on other tabs
  // because Health's date-sync effect below needs its (possibly auto-corrected)
  // dateFilters to exist before Health can sync to them.
  const inv = useStaticInv(tab === 'health', healthFilters.avgSaleWindowDays || 7)
  const sales = useStatic('/sales-alloc-data.json', '/api/sales-allocation', salesFilterBody, true)
  const inward = useStatic('/inward-data.json', '/api/inward', inwardFilterBody, tab === 'inward')
  const active = tab === 'health' ? inv : tab === 'sales' ? sales : inward

  // Inventory Health's Warehouse Health cards (Avg Sale / Allocation %) previously always
  // used their own fixed trailing-window, independent of any date picker — which made those
  // numbers structurally impossible to compare against Sales & Allocation's own Fill %,
  // computed over whatever range is selected there. Keeping Health's fetch range in sync
  // with Sales & Allocation's selected range (rather than giving Health a second, separate
  // picker) makes the same-formula numbers on both tabs directly comparable. Only runs the
  // sync (and therefore Health's own re-fetch) once Health has actually been opened, since
  // inv.setDateFilters would otherwise queue up a fetch behind `enabled` for a tab the user
  // hasn't visited yet.
  useEffect(() => {
    if (tab !== 'health') return
    if (inv.dateFilters.start === sales.dateFilters.start && inv.dateFilters.end === sales.dateFilters.end) return
    inv.setDateFilters(sales.dateFilters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sales.dateFilters.start, sales.dateFilters.end])

  // Reports the Sales & Allocation date range up to App.jsx's Topnav, which renders it in
  // the actual top bar (same spot/style as the Sales Analytics page) instead of duplicating
  // a second date control inside this page's own sticky header. Health/Inward keep their own
  // in-page control since Health has no picker and Inward isn't in scope for this move.
  useEffect(() => {
    if (!onTopbarDateControl) return
    const extra = {
      invHealthFilters: healthFilters,
      setInvHealthFilters: setHealthFilters,
      invHealthOpts: inv.data?.filterOptions || null,
      invHealthAsOf: inv.data?.asOf || null,
      invHealthLastSales: inv.data?.lastSalesDateConsidered || null,
      invSalesFilters: salesFilters,
      setInvSalesFilters: setSalesFilters,
      invSalesOpts: sales.data?.filterOptions || null,
      invSalesAsOf: sales.data?.asOf || null,
      invSalesLastSales: sales.data?.lastSalesDateConsidered || null,
    }
    if (tab === 'sales') {
      onTopbarDateControl({
        filters: sales.dateFilters, setFilters: sales.setDateFilters,
        onRefresh: () => sales.fetchData({ ...sales.dateFilters, ...salesFilterBody }),
        loading: sales.loading,
        ...extra,
      })
    } else {
      onTopbarDateControl(extra)
    }
    return () => onTopbarDateControl(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sales.dateFilters, sales.setDateFilters, sales.fetchData, sales.loading, onTopbarDateControl, healthFilters, setHealthFilters, inv.data?.filterOptions, inv.data?.asOf, inv.data?.lastSalesDateConsidered, salesFilters, setSalesFilters, sales.data?.filterOptions, sales.data?.asOf, sales.data?.lastSalesDateConsidered])

  // Rendered at the top of each sub-page's own FilterSidebar (see SubTabSwitcher comment) —
  // holds the Health/Sales/Inward switcher plus whatever per-tab info/date-control used to
  // live in the old second top bar (snapshot timestamp, Inward's own date range — Sales'
  // date range now lives in App.jsx's actual top bar instead, see onTopbarDateControl above).
  const sidebarTop = (
    <div style={{ marginBottom: 4 }}>
      <SubTabSwitcher tab={tab} setTab={setTab} isMobile={isMobile} />
      {tab === 'health' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
          {!isMobile && (
            <span style={{ fontSize: 11, color: IC.t3 }}>
              {inv.data?.lastSnapshotUpdated
                ? `Snapshot updated ${new Date(inv.data.lastSnapshotUpdated.replace('Z','') + '+05:30').toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`
                : inv.loading ? 'Loading snapshot time…' : ''}
            </span>
          )}
          {isMobile && inv.data?.asOf && (
            <span style={{ fontSize: 11, color: IC.t3 }}>
              Updated {new Date(inv.data.asOf).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata', hour12: true })}
            </span>
          )}
          {inv.data?.lastSalesDateConsidered && (
            <span style={{ fontSize: 11, color: IC.t3 }}>
              Latest sales {inv.data.lastSalesDateConsidered.slice(8,10)} {new Date(inv.data.lastSalesDateConsidered + 'T12:00:00').toLocaleDateString('en-IN', { month: 'short' })}
            </span>
          )}
        </div>
      )}
      {tab === 'sales' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
          {isMobile && sales.data?.asOf && (
            <span style={{ fontSize: 11, color: IC.t3 }}>
              Updated {new Date(sales.data.asOf).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata', hour12: true })}
            </span>
          )}
          {sales.data?.lastSalesDateConsidered && (
            <span style={{ fontSize: 11, color: IC.t3 }}>
              Latest sales {sales.data.lastSalesDateConsidered.slice(8,10)} {new Date(sales.data.lastSalesDateConsidered + 'T12:00:00').toLocaleDateString('en-IN', { month: 'short' })}
            </span>
          )}
        </div>
      )}
      {/* tab === 'inward' && (
        <div style={{ marginBottom: 10 }}>
          <DateRangeControl filters={active.dateFilters} setFilters={active.setDateFilters}
            onRefresh={() => active.fetchData({ ...active.dateFilters, ...inwardFilterBody })} />
        </div>
      ) */}
    </div>
  )

  // Apply display-only filters client-side — no API call needed for these
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const invData = useMemo(() => {
    const raw = inv.data
    if (!raw) return raw
    const { category, subCategory, stockStatus: stockStatusF, rtdLevel: rtdLevelF, productId, location: locationF, facility: facilityF, facilityType: facilityTypeF } = healthFilters
    const matchCsv = (val, filterArr) => !filterArr?.length || filterArr.includes(val)

    // Location filter alone still narrows by the location-level `locations[]` breakdown
    // (a Location is never split by type, so this is exact either way).
    let effectiveLocations = locationF?.length ? [...locationF] : null

    // Facility/FacilityType filters narrow at true FACILITY grain via each SKU's `facilities[]`
    // array (added alongside `locations[]` specifically so this filter no longer has to
    // approximate "Regular" as "any location that contains at least one Regular facility" —
    // a Location can host more than one Facility Type, and the old location-level proxy
    // wrongly pulled in stock from non-matching facilities that merely share a city with a
    // matching one. Sales/allocation figures remain Location-grain (sales data has no
    // facility identity — same limitation the live API fallback has), only the INVENTORY
    // portion (totalInvt/rawInvt/rawBlockedInvt/rtdInvt) is now facility-exact.
    const hasFacilityFilter = facilityF?.length || facilityTypeF?.length
    const matchesFacility = f => (!facilityF?.length || facilityF.includes(f.facility)) && (!facilityTypeF?.length || facilityTypeF.includes(f.facilityType))

    let skus = raw.skus
    if (category?.length) skus = skus.filter(s => matchCsv(s.category, category))
    if (subCategory?.length) skus = skus.filter(s => matchCsv(s.subCategory, subCategory))
    if (stockStatusF?.length) skus = skus.filter(s => matchCsv(s.stockStatus, stockStatusF))
    if (rtdLevelF?.length) skus = skus.filter(s => matchCsv(s.rtdLevel, rtdLevelF))
    if (productId?.length) skus = skus.filter(s => matchCsv(s.sku, productId))
    if (hasFacilityFilter) {
      skus = skus
        .filter(s => s.facilities?.some(f => matchesFacility(f) && (!effectiveLocations?.length || effectiveLocations.includes(f.location))))
        .map(s => {
          const facs = (s.facilities || []).filter(f => matchesFacility(f) && (!effectiveLocations?.length || effectiveLocations.includes(f.location)))
          const totalInvt = facs.reduce((a, f) => a + (f.totalInvt || 0), 0)
          const rawInvt = facs.reduce((a, f) => a + (f.rawInvt || 0), 0)
          const rawBlockedInvt = facs.reduce((a, f) => a + (f.rawBlockedInvt || 0), 0)
          const rtdInvt = facs.reduce((a, f) => a + (f.rtdInvt || 0), 0)
          // Group matched facilities back to their Location so avgSale/doi/stockStatus (which
          // only exist at Location grain) can still be shown per remaining location — this
          // Location list is now the FILTERED inventory total against the SAME Location's
          // (unfiltered) avgSale, same approach api/inventory.js's true facility filter uses.
          const locKeys = [...new Set(facs.map(f => f.location))]
          const origLocs = (s.locations || []).filter(l => locKeys.includes(l.location))
          const locs = origLocs.map(origLoc => {
            const facsAtLoc = facs.filter(f => f.location === origLoc.location)
            const locTotalInvt = facsAtLoc.reduce((a, f) => a + (f.totalInvt || 0), 0)
            const locRawInvt = facsAtLoc.reduce((a, f) => a + (f.rawInvt || 0), 0)
            const locRawBlockedInvt = facsAtLoc.reduce((a, f) => a + (f.rawBlockedInvt || 0), 0)
            const locRtdInvt = facsAtLoc.reduce((a, f) => a + (f.rtdInvt || 0), 0)
            const doi = origLoc.avgSale > 0 ? Math.floor(locTotalInvt / origLoc.avgSale) : origLoc.doi
            return { ...origLoc, totalInvt: locTotalInvt, rawInvt: locRawInvt, rawBlockedInvt: locRawBlockedInvt, rtdInvt: locRtdInvt, doi }
          })
          const avgSale = locs.reduce((a, l) => a + (l.avgSale || 0), 0)
          const doi = locs.length === 1 ? locs[0].doi : (avgSale > 0 ? Math.floor(totalInvt / avgSale) : 0)
          const status = locs.length === 1 ? locs[0].stockStatus : s.stockStatus
          return { ...s, totalInvt, rawInvt, rawBlockedInvt, rtdInvt, avgSale, doi, stockStatus: status, locations: locs }
        })
    } else if (effectiveLocations?.length) {
      skus = skus
        .map(s => {
          let locs = (s.locations || [])
          // Apply location filter
          if (effectiveLocations?.length) locs = locs.filter(l => effectiveLocations.includes(l.location))
          if (!locs.length) return null
          const totalInvt = locs.reduce((a, l) => a + (l.totalInvt || 0), 0)
          const rawInvt = locs.reduce((a, l) => a + (l.rawInvt || 0), 0)
          const rawBlockedInvt = locs.reduce((a, l) => a + (l.rawBlockedInvt || 0), 0)
          const rtdInvt = locs.reduce((a, l) => a + (l.rtdInvt || 0), 0)
          const avgSale = locs.reduce((a, l) => a + (l.avgSale || 0), 0)
          const doi = locs.length === 1 ? locs[0].doi : (avgSale > 0 ? Math.floor(totalInvt / avgSale) : 0)
          const status = locs.length === 1 ? locs[0].stockStatus : s.stockStatus
          return { ...s, totalInvt, rawInvt, rawBlockedInvt, rtdInvt, avgSale, doi, stockStatus: status, locations: locs }
        })
        .filter(Boolean)
    }
    if (skus === raw.skus) return raw // nothing filtered, return as-is

    // Recompute summary KPIs from filtered skus
    const totalInvt = skus.reduce((s, r) => s + r.totalInvt, 0)
    const rawInvt = skus.reduce((s, r) => s + r.rawInvt, 0)
    const rawBlockedInvt = skus.reduce((s, r) => s + r.rawBlockedInvt, 0)
    const rtdInvt = skus.reduce((s, r) => s + r.rtdInvt, 0)
    const avgSale = skus.reduce((s, r) => s + r.avgSale, 0)
    const totalAvgSale = skus.reduce((s, r) => s + r.totalAvgSale, 0)
    const totalAlloc = skus.reduce((s, r) => s + r.orderAllocation, 0)
    const denom = Math.ceil(Math.max(avgSale, totalAlloc))
    const doi = denom > 0 ? Math.floor(totalInvt / denom) : 0
    const statusCounts = {}
    for (const s of skus) statusCounts[s.stockStatus] = (statusCounts[s.stockStatus] || 0) + 1
    let dominantStatus = null, dominantCount = -1
    for (const [st, cnt] of Object.entries(statusCounts)) { if (cnt > dominantCount) { dominantStatus = st; dominantCount = cnt } }

    // Recompute per-location totals from filtered skus
    const locMap = new Map()
    for (const s of skus) {
      for (const loc of (s.locations || [])) {
        if (!locMap.has(loc.location)) locMap.set(loc.location, { location: loc.location, totalInvt: 0, rawInvt: 0, rawBlockedInvt: 0, rtdInvt: 0, avgSale: 0, orderAllocation: 0 })
        const a = locMap.get(loc.location)
        a.totalInvt += loc.totalInvt; a.rawInvt += (loc.rawInvt || 0); a.rawBlockedInvt += (loc.rawBlockedInvt || 0)
        a.rtdInvt += (loc.rtdInvt || 0); a.avgSale += (loc.avgSale || 0); a.orderAllocation += (loc.orderAllocation || 0)
      }
    }
    const mapLoc = origLoc => {
      const l = locMap.get(origLoc.location)
      if (!l || l.totalInvt === 0) return null
      const locAvgSale = l.avgSale
      const locDoi = locAvgSale > 0 ? Math.floor(l.totalInvt / locAvgSale) : 0
      return { ...origLoc, totalInvt: l.totalInvt, rawInvt: l.rawInvt, rawBlockedInvt: l.rawBlockedInvt, rtdInvt: l.rtdInvt, avgSale: locAvgSale, doi: locDoi, orderAllocation: l.orderAllocation }
    }
    // allLocations — always all 7 warehouses from raw (never filtered), used for Warehouse Health cards
    const allLocations = (raw.locations || []).filter(l => l.totalInvt > 0 || l.avgSale > 0)
    const locations = (raw.locations || []).map(mapLoc).filter(Boolean)

    // Recompute pivot table from filtered skus
    const pivotLocations = locations.map(l => l.location)
    const pivotRows = skus.map(s => ({
      sku: s.sku, category: s.category, subCategory: s.subCategory,
      totalInvt: Math.round(s.totalInvt), avgSale: s.avgSale,
      byLocation: Object.fromEntries((s.locations || []).map(l => [l.location, { totalInvt: Math.round(l.totalInvt), avgSale: l.avgSale }])),
    }))

    // Recompute slow-moving and dead stock as sub-category rollups from filtered skus
    const DEAD_DOI = 200, SLOW_DOI = 45, SUBCAT_FLOOR = 50
    const subCatMap = new Map()
    for (const s of skus) {
      const key = `${s.category}|${s.subCategory}`
      if (!subCatMap.has(key)) subCatMap.set(key, { category: s.category, subCategory: s.subCategory, totalInvt: 0, avgSale: 0, skuList: [] })
      const acc = subCatMap.get(key)
      acc.totalInvt += s.totalInvt; acc.avgSale += s.avgSale; acc.skuList.push(s)
    }
    const subCatRows = [...subCatMap.values()]
      .filter(sc => sc.totalInvt > SUBCAT_FLOOR && !sc.subCategory?.toLowerCase().startsWith('sparepart'))
      .map(sc => {
        const notBeingSold = sc.avgSale <= 0
        const doi = notBeingSold ? Math.round(sc.totalInvt) : Math.floor(sc.totalInvt / sc.avgSale)
        return {
          category: sc.category, subCategory: sc.subCategory,
          totalInvt: Math.round(sc.totalInvt), avgSale: +sc.avgSale.toFixed(2), doi, notBeingSold,
          skus: sc.skuList.filter(s => s.totalInvt > 0)
            .map(s => ({ sku: s.sku, totalInvt: Math.round(s.totalInvt), avgSale: +s.avgSale.toFixed(2), doi: s.avgSale > 0 ? s.doi : Math.round(s.totalInvt) }))
            .sort((a, b) => b.totalInvt - a.totalInvt),
        }
      })
    const slowMoving = subCatRows.filter(sc => sc.notBeingSold || sc.doi > SLOW_DOI).sort((a, b) => b.totalInvt - a.totalInvt)
    const deadStock = subCatRows.filter(sc => (sc.notBeingSold && sc.totalInvt > DEAD_DOI) || sc.doi > DEAD_DOI).sort((a, b) => b.totalInvt - a.totalInvt)
    const leadTimeRisk = skus
      .filter(s => s.productSource && s.productSource !== 'Inhouse' && s.leadTime > 0 && s.doi != null && s.totalInvt > 0 && s.doi <= s.leadTime + 10)
      .map(s => ({ sku: s.sku, category: s.category, leadTime: s.leadTime, productSource: s.productSource, doi: s.doi, stockStatus: s.stockStatus, avgSale: s.avgSale }))
      .sort((a, b) => (a.doi - a.leadTime) - (b.doi - b.leadTime)).slice(0, 20)

    return {
      ...raw, skus,
      summary: { ...raw.summary, totalInvt: Math.round(totalInvt), rawInvt: Math.round(rawInvt), rawBlockedInvt: Math.round(rawBlockedInvt), rtdInvt: Math.round(rtdInvt), avgSale: Math.round(avgSale), avgSaleB2C: Math.round(avgSale), totalAvgSale: Math.round(totalAvgSale), doi, stockStatus: dominantStatus, skuCount: skus.length, criticalLowCount: skus.filter(s => s.stockStatus === 'Critical' || s.stockStatus === 'Low').length, deadStockCount: skus.filter(s => s.isDead).length, deadStockUnits: skus.filter(s => s.isDead).reduce((s, r) => s + r.totalInvt, 0) },
      statusBreakdown: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
      locations, allLocations, deadStock, slowMoving, leadTimeRisk,
      pivot: { locations: pivotLocations, rows: pivotRows },
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv.data, healthFilters])

  return (
    <div style={{ background: PAGE_BACKGROUND, height: '100%', display: 'flex', flexDirection: 'column', color: IC.t1, fontFamily: 'Inter, sans-serif' }}>
      {/* Mobile-only tab bar — the desktop tab switcher lives inside the FilterSidebar. On
          mobile the sidebar is hidden, so we surface the same tabs as a horizontal scroll row. */}
      <div className="inv-mobile-subtabs" style={{
        display: 'none', alignItems: 'center', gap: 0,
        borderBottom: `1px solid ${IC.border}`, background: IC.surface,
        padding: '0 12px', overflowX: 'auto', flexShrink: 0,
      }}>
        {[{ id: 'health', label: '📦 Health' }, { id: 'sales', label: '📊 Sales & Alloc' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '10px 14px', border: 'none', borderBottom: tab === t.id ? '3px solid #1967D2' : '3px solid transparent',
            background: 'none', fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? '#1967D2' : IC.t3, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}>{t.label}</button>
        ))}
      </div>

      {/* No horizontal padding here — each sub-page applies its own paddingLeft to content. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {active.loading && !active.data && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: IC.t3, fontSize: 13, margin: '0 24px' }}>Loading…</div>
        )}
        {active.error && !active.data && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(208,59,59,0.12)', border: '1px solid rgba(208,59,59,0.35)', color: '#ff8b8b', fontSize: 12.5, margin: '0 24px' }}>
            ⚠ {active.error}
          </div>
        )}

        <div style={{ display: tab === 'health' ? 'contents' : 'none' }}><InventoryHealthPage data={invData} filters={healthFilters} setFilters={setHealthFilters} sidebarTop={sidebarTop} /></div>
        <div style={{ display: tab === 'sales' ? 'contents' : 'none' }}><SalesAllocationPage data={sales.data} filters={salesFilters} setFilters={setSalesFilters} sidebarTop={sidebarTop} dateFilters={sales.dateFilters} /></div>
        {/* <div style={{ display: tab === 'inward' ? 'contents' : 'none' }}><InwardPage data={inward.data} filters={inwardFilters} setFilters={setInwardFilters} sidebarTop={sidebarTop} /></div> */}
      </div>
    </div>
  )
}
