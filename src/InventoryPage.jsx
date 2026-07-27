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

export default function InventoryPage({ onTopbarDateControl }) {
  const [tab, setTab] = useState('health')
  const [healthFilters, setHealthFilters] = useState({})
  const [salesFilters, setSalesFilters] = useState({})
  const [inwardFilters, setInwardFilters] = useState({})

  const csv = arr => (arr && arr.length ? arr.join(',') : undefined)
  const invFilterBody = {
    category: csv(healthFilters.category), subCategory: csv(healthFilters.subCategory),
    location: csv(healthFilters.location), facility: csv(healthFilters.facility),
    facilityType: csv(healthFilters.facilityType), stockStatus: csv(healthFilters.stockStatus),
    productId: csv(healthFilters.productId), rtdLevel: csv(healthFilters.rtdLevel),
    avgSaleWindowDays: healthFilters.avgSaleWindowDays || 7,
  }
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
  const inv = useEndpoint('/api/inventory', invFilterBody, tab === 'health')
  const sales = useEndpoint('/api/sales-allocation', salesFilterBody, true)
  const inward = useEndpoint('/api/inward', inwardFilterBody, tab === 'inward')
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
            {inv.data?.asOf
              ? `Snapshot updated ${new Date(inv.data.asOf).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
              : 'Loading snapshot time…'}
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

        {tab === 'health' && <InventoryHealthPage data={inv.data} filters={healthFilters} setFilters={setHealthFilters} sidebarTop={sidebarTop} />}
        {tab === 'sales' && <SalesAllocationPage data={sales.data} filters={salesFilters} setFilters={setSalesFilters} sidebarTop={sidebarTop} />}
        {tab === 'inward' && <InwardPage data={inward.data} filters={inwardFilters} setFilters={setInwardFilters} sidebarTop={sidebarTop} />}
      </div>
    </div>
  )
}
