import { useState, useEffect, useRef, useCallback } from 'react'
import { IC, PAGE_BACKGROUND, getDefaultDates, DateRangeControl } from './inventory/theme.jsx'
import InventoryHealthPage from './inventory/InventoryHealthPage.jsx'
import SalesAllocationPage from './inventory/SalesAllocationPage.jsx'

// Inventory Health's Avg Sale/DOI always use useEndpoint's default trailing-7-day window
// (getDefaultDates()) — no visible date picker for that tab, so those numbers always read
// as "current state" rather than something a stale filter could quietly leave stuck on an old range.

function IconTab({ icon, label, active, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <div style={{ position: 'relative' }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button onClick={onClick}
        style={{
          width: 34, height: 34, borderRadius: 7, cursor: 'pointer', fontSize: 15, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: active ? IC.accDim : 'transparent',
          color: active ? IC.acc : IC.t3,
          border: active ? `1px solid ${IC.accBorder}` : '1px solid transparent',
        }}>
        {icon}
      </button>
      {hover && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          background: IC.surfaceHi, border: `1px solid ${IC.border2}`, borderRadius: 6, padding: '4px 9px',
          fontSize: 11, color: IC.t1, whiteSpace: 'nowrap', zIndex: 50, boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
        }}>
          {label}
        </div>
      )}
    </div>
  )
}

function useEndpoint(path, extraFilters) {
  const def = getDefaultDates()
  const [dateFilters, setDateFilters] = useState({ start: def.start, end: def.end })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const reqIdRef = useRef(0)
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
    fetchData({ ...dateFilters, ...extraFilters })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilters.start, dateFilters.end, JSON.stringify(extraFilters), fetchData])

  return { dateFilters, setDateFilters, data, loading, error, fetchData }
}

export default function InventoryPage() {
  const [tab, setTab] = useState('health')
  const [healthFilters, setHealthFilters] = useState({})
  const [salesFilters, setSalesFilters] = useState({})

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
    channel: csv(salesFilters.channel), channelType: csv(salesFilters.channelType), facility: csv(salesFilters.facility),
    region: csv(salesFilters.region), comparePrevious: salesFilters.comparePrevious, momentumWindow: salesFilters.momentumWindow || 7,
    topN: salesFilters.topN || 10,
  }

  const inv = useEndpoint('/api/inventory', invFilterBody)
  const sales = useEndpoint('/api/sales-allocation', salesFilterBody)
  const active = tab === 'health' ? inv : sales

  return (
    <div style={{ background: PAGE_BACKGROUND, minHeight: '100%', color: IC.t1, fontFamily: 'Inter, sans-serif' }}>
      {/* Fixed header strip — stays put while the page scrolls, so the sidebar below
          (position: sticky) anchors consistently right under it instead of scrolling away. */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30, background: PAGE_BACKGROUND,
        padding: '20px 24px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        borderBottom: `1px solid ${IC.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'inline-flex', gap: 2, background: IC.surface, border: `1px solid ${IC.border}`, borderRadius: 10, padding: 3 }}>
            <IconTab icon="📦" label="Inventory Health" active={tab === 'health'} onClick={() => setTab('health')} />
            <IconTab icon="📊" label="Sales & Allocation" active={tab === 'sales'} onClick={() => setTab('sales')} />
          </div>
          {tab === 'health' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, color: IC.t3 }}>
                {inv.data?.asOf
                  ? `Inventory snapshot last updated ${new Date(inv.data.asOf).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                  : 'Loading snapshot time…'}
              </span>
              {inv.data?.avgSaleWindow?.end && (
                <span style={{ fontSize: 12, color: IC.t3 }}>
                  Latest sales date considered {new Date(inv.data.avgSaleWindow.end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </div>
          )}
          {tab === 'sales' && sales.data?.lastSalesDateConsidered && (
            <span style={{ fontSize: 12, color: IC.t3 }}>
              Latest sales date considered {new Date(sales.data.lastSalesDateConsidered).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
        {tab === 'sales' && (
          <DateRangeControl filters={active.dateFilters} setFilters={active.setDateFilters}
            onRefresh={() => active.fetchData({ ...active.dateFilters, ...salesFilterBody })} />
        )}
      </div>

      <div style={{ padding: '18px 24px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {active.loading && !active.data && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: IC.t3, fontSize: 13 }}>Loading…</div>
        )}
        {active.error && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(208,59,59,0.12)', border: '1px solid rgba(208,59,59,0.35)', color: '#ff8b8b', fontSize: 12.5 }}>
            ⚠ {active.error}
          </div>
        )}

        {tab === 'health' && <InventoryHealthPage data={inv.data} filters={healthFilters} setFilters={setHealthFilters} />}
        {tab === 'sales' && <SalesAllocationPage data={sales.data} filters={salesFilters} setFilters={setSalesFilters} />}
      </div>
    </div>
  )
}
