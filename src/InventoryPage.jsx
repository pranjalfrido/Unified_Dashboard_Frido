import { useState, useEffect, useRef, useCallback } from 'react'
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
          background: active ? IC.accDim : 'transparent',
          color: active ? IC.t1 : IC.t3,
          border: active ? `1px solid ${IC.accBorder}` : '1px solid transparent',
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

// Sub-tab switcher (Health/Sales/Inward) — rendered at the top of each sub-page's own
// FilterSidebar instead of as a second horizontal bar above the page, so the Inventory tab
// matches Logistics's layout convention: one top bar (title + date), everything else lives
// in the left column.
function SubTabSwitcher({ tab, setTab }) {
  return (
    <div style={{ display: 'inline-flex', gap: 2, background: IC.surface, border: `1px solid ${IC.border}`, borderRadius: 10, padding: 3, marginBottom: 12 }}>
      <IconTab icon="📦" label="Inventory Health" active={tab === 'health'} onClick={() => setTab('health')} />
      <IconTab icon="📊" label="Sales & Allocation" active={tab === 'sales'} onClick={() => setTab('sales')} />
      <IconTab icon="📥" label="Inward" active={tab === 'inward'} onClick={() => setTab('inward')} />
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
  const autoCorrectedRef = useRef(false)
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
      if (!autoCorrectedRef.current && json.lastSalesDateConsidered && json.lastSalesDateConsidered < body.end) {
        autoCorrectedRef.current = true
        const rangeDays = Math.round((new Date(body.end) - new Date(body.start)) / 86400000)
        const newEnd = new Date(json.lastSalesDateConsidered)
        const newStart = new Date(newEnd); newStart.setDate(newStart.getDate() - rangeDays)
        setDateFilters({ start: newStart.toISOString().slice(0, 10), end: json.lastSalesDateConsidered })
      }
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
// Falls back to live API POST when: file is stale/missing, OR user picks a date
// range that doesn't match the cached 30-day window.
function useStatic(staticPath, fallbackApiPath, fallbackBody = {}, enabled = true) {
  const def = getDefaultDates()
  const [dateFilters, setDateFilters] = useState({ start: def.start, end: def.end })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const reqIdRef = useRef(0)
  const cachedRangeRef = useRef(null) // { start, end } of the static file's date range
  const API = import.meta.env.VITE_API_URL || ''

  // Hits the live API directly with whatever date range is provided
  const fetchFromAPI = useCallback(async (start, end, extraBody = {}) => {
    const reqId = ++reqIdRef.current
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API}${fallbackApiPath}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end, ...fallbackBody, ...extraBody }),
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const json = await res.json()
      if (reqId !== reqIdRef.current) return
      setData(json)
      setDateFilters({ start, end })
      if (json.lastSalesDateConsidered) {
        // auto-correct end to last complete day, same as useEndpoint
        const correctedEnd = json.lastSalesDateConsidered
        const rangeDays = Math.round((new Date(end) - new Date(start)) / 86400000)
        const correctedStart = new Date(correctedEnd)
        correctedStart.setDate(correctedStart.getDate() - rangeDays)
        setDateFilters({ start: correctedStart.toISOString().slice(0, 10), end: correctedEnd })
      }
    } catch (e2) { if (reqId === reqIdRef.current) setError(e2.message) }
    finally { if (reqId === reqIdRef.current) setLoading(false) }
  }, [API, fallbackApiPath]) // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load: try static file first
  const fetchData = useCallback(async (body = {}) => {
    const reqId = ++reqIdRef.current
    setLoading(true); setError(null)
    try {
      const res = await fetch(staticPath)
      if (!res.ok) throw new Error(`static file missing (${res.status})`)
      const json = await res.json()
      if (reqId !== reqIdRef.current) return
      const ageMs = json.asOf ? Date.now() - new Date(json.asOf).getTime() : Infinity
      if (ageMs > 2 * 60 * 60 * 1000 || json._placeholder) throw new Error('static file stale or placeholder')
      setData(json)
      const range = json.dateRange || null
      if (range) {
        cachedRangeRef.current = { start: range.start, end: range.end }
        setDateFilters({ start: range.start, end: range.end })
      }
    } catch {
      // Static unavailable — fall back to live API with default 30d range
      const { start, end } = getDefaultDates()
      if (reqId !== reqIdRef.current) return
      setLoading(false)
      fetchFromAPI(start, end, body)
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

  // When user changes date range via picker: serve from cache if it matches, else hit live API
  const prevDateRef = useRef(null)
  useEffect(() => {
    if (!enabled || !initialFetchedRef.current) return
    const { start, end } = dateFilters
    const prev = prevDateRef.current
    if (prev && prev.start === start && prev.end === end) return
    prevDateRef.current = { start, end }
    const cached = cachedRangeRef.current
    if (!cached) return // still on initial load
    if (cached.start === start && cached.end === end) return // already showing cached range
    fetchFromAPI(start, end)
  }, [enabled, dateFilters.start, dateFilters.end, fetchFromAPI]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh button: re-fetch current date range from API
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
    try {
      const res = await fetch(`/inv-data-${windowDays}d.json`)
      if (!res.ok) throw new Error(`static file missing (${res.status})`)
      const json = await res.json()
      if (reqId !== reqIdRef.current) return
      const ageMs = json.asOf ? Date.now() - new Date(json.asOf).getTime() : Infinity
      if (ageMs > 2 * 60 * 60 * 1000) throw new Error('static file stale')
      setData(json)
      if (json.avgSaleWindow) setDateFilters({ start: json.avgSaleWindow.start, end: json.avgSaleWindow.end })
    } catch {
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

export default function InventoryPage({ onTopbarDateControl }) {
  const [tab, setTab] = useState('health')
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
    if (tab !== 'sales') { onTopbarDateControl(null); return }
    onTopbarDateControl({
      filters: sales.dateFilters, setFilters: sales.setDateFilters,
      onRefresh: () => sales.fetchData({ ...sales.dateFilters, ...salesFilterBody }),
    })
    return () => onTopbarDateControl(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sales.dateFilters, sales.setDateFilters, sales.fetchData, onTopbarDateControl])

  // Rendered at the top of each sub-page's own FilterSidebar (see SubTabSwitcher comment) —
  // holds the Health/Sales/Inward switcher plus whatever per-tab info/date-control used to
  // live in the old second top bar (snapshot timestamp, Inward's own date range — Sales'
  // date range now lives in App.jsx's actual top bar instead, see onTopbarDateControl above).
  const sidebarTop = (
    <div style={{ marginBottom: 4 }}>
      <SubTabSwitcher tab={tab} setTab={setTab} />
      {tab === 'health' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: IC.t3 }}>
            {inv.data?.lastSnapshotUpdated
              ? `Snapshot updated ${new Date(inv.data.lastSnapshotUpdated).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
              : inv.loading ? 'Loading snapshot time…' : ''}
          </span>
          {inv.data?.avgSaleWindow?.end && (
            <span style={{ fontSize: 11, color: IC.t3 }}>
              Latest sales {new Date(inv.data.avgSaleWindow.end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      )}
      {tab === 'sales' && sales.data?.lastSalesDateConsidered && (
        <div style={{ fontSize: 11, color: IC.t3, marginBottom: 10 }}>
          Latest sales {new Date(sales.data.lastSalesDateConsidered).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </div>
      )}
      {tab === 'inward' && (
        <div style={{ marginBottom: 10 }}>
          <DateRangeControl filters={active.dateFilters} setFilters={active.setDateFilters}
            onRefresh={() => active.fetchData({ ...active.dateFilters, ...inwardFilterBody })} />
        </div>
      )}
    </div>
  )

  // Apply display-only filters client-side — no API call needed for these
  const invData = (() => {
    const raw = inv.data
    if (!raw) return raw
    const { category, subCategory, stockStatus: stockStatusF, rtdLevel: rtdLevelF, productId, location: locationF, facility: facilityF, facilityType: facilityTypeF } = healthFilters
    const matchCsv = (val, filterArr) => !filterArr?.length || filterArr.includes(val)

    // Resolve facility/facilityType filters → effective location set
    const facilitiesLookup = raw.filterOptions?.facilities || []
    let effectiveLocations = locationF?.length ? [...locationF] : null
    if (facilityF?.length) {
      const locsFromFacility = [...new Set(facilitiesLookup.filter(f => facilityF.includes(f.facility)).map(f => f.location))]
      effectiveLocations = effectiveLocations ? effectiveLocations.filter(l => locsFromFacility.includes(l)) : locsFromFacility
    }
    if (facilityTypeF?.length) {
      const locsFromType = [...new Set(facilitiesLookup.filter(f => facilityTypeF.includes(f.facilityType)).map(f => f.location))]
      effectiveLocations = effectiveLocations ? effectiveLocations.filter(l => locsFromType.includes(l)) : locsFromType
    }

    let skus = raw.skus
    if (category?.length) skus = skus.filter(s => matchCsv(s.category, category))
    if (subCategory?.length) skus = skus.filter(s => matchCsv(s.subCategory, subCategory))
    if (stockStatusF?.length) skus = skus.filter(s => matchCsv(s.stockStatus, stockStatusF))
    if (rtdLevelF?.length) skus = skus.filter(s => matchCsv(s.rtdLevel, rtdLevelF))
    if (productId?.length) skus = skus.filter(s => matchCsv(s.sku, productId))
    if (effectiveLocations?.length) {
      skus = skus
        .filter(s => s.locations?.some(l => effectiveLocations.includes(l.location)))
        .map(s => {
          // Restrict each SKU's numbers to only the selected location(s)
          const locs = (s.locations || []).filter(l => effectiveLocations.includes(l.location))
          const totalInvt = locs.reduce((a, l) => a + (l.totalInvt || 0), 0)
          const rawInvt = locs.reduce((a, l) => a + (l.rawInvt || 0), 0)
          const rawBlockedInvt = locs.reduce((a, l) => a + (l.rawBlockedInvt || 0), 0)
          const rtdInvt = locs.reduce((a, l) => a + (l.rtdInvt || 0), 0)
          const avgSale = locs.reduce((a, l) => a + (l.avgSale || 0), 0)
          const doi = locs.length === 1 ? locs[0].doi : (avgSale > 0 ? Math.floor(totalInvt / avgSale) : 0)
          const status = locs.length === 1 ? locs[0].stockStatus : s.stockStatus
          return { ...s, totalInvt, rawInvt, rawBlockedInvt, rtdInvt, avgSale, doi, stockStatus: status, locations: locs }
        })
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
    const locations = (raw.locations || [])
      .filter(origLoc => !effectiveLocations?.length || effectiveLocations.includes(origLoc.location))
      .map(origLoc => {
        const l = locMap.get(origLoc.location)
        if (!l || l.totalInvt === 0) return null
        const locAvgSale = l.avgSale
        const locDoi = locAvgSale > 0 ? Math.floor(l.totalInvt / locAvgSale) : 0
        return { ...origLoc, totalInvt: l.totalInvt, rawInvt: l.rawInvt, rawBlockedInvt: l.rawBlockedInvt, rtdInvt: l.rtdInvt, avgSale: locAvgSale, doi: locDoi, orderAllocation: l.orderAllocation }
      }).filter(Boolean)

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
      locations, deadStock, slowMoving, leadTimeRisk,
      pivot: { locations: pivotLocations, rows: pivotRows },
    }
  })()

  return (
    <div style={{ background: PAGE_BACKGROUND, minHeight: '100%', color: IC.t1, fontFamily: 'Inter, sans-serif' }}>
      {/* No horizontal padding here — each sub-page's own FilterSidebar needs to sit flush
          against the viewport's left edge (it's position:fixed, positioned independent of
          this wrapper's padding) or a gap of the page's own background shows between the
          left nav rail and the sidebar's white panel. Each sub-page applies its own left
          padding to its actual content (KPIs/tables) instead, via paddingLeft on the content
          column next to the sidebar. */}
      <div style={{ padding: '18px 0 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {active.loading && !active.data && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: IC.t3, fontSize: 13, margin: '0 24px' }}>Loading…</div>
        )}
        {active.error && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(208,59,59,0.12)', border: '1px solid rgba(208,59,59,0.35)', color: '#ff8b8b', fontSize: 12.5, margin: '0 24px' }}>
            ⚠ {active.error}
          </div>
        )}

        {tab === 'health' && <InventoryHealthPage data={invData} filters={healthFilters} setFilters={setHealthFilters} sidebarTop={sidebarTop} />}
        {tab === 'sales' && <SalesAllocationPage data={sales.data} filters={salesFilters} setFilters={setSalesFilters} sidebarTop={sidebarTop} />}
        {tab === 'inward' && <InwardPage data={inward.data} filters={inwardFilters} setFilters={setInwardFilters} sidebarTop={sidebarTop} />}
      </div>
    </div>
  )
}
