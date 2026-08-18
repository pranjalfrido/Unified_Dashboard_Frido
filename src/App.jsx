import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react'
import { C, fmt, fmtN, fmtBig, pct, processData, detectAlerts, exportCSV, getDefaultDates, COURIER_COLORS, COURIER_LOGOS } from './utils.js'
import { KPICard, AlertCard, DataTable, Card, Badge, CategoryRevenueCard, RevTrendChart, AreaTrendChart, MultiLineChart, useSortableTable, useReorderableColumns, GROUP_OPTS, getGroupKey, TrendAnalysisCard, BarChart, Bar, LineChart, Line, AreaChart, Area, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, Treemap } from './components.jsx'
import InventoryPage from './InventoryPage.jsx'
import { IC } from './inventory/theme.jsx'
import LoginPage from './LoginPage.jsx'
import ResetPasswordPage from './ResetPasswordPage.jsx'
import ProfilePage from './ProfilePage.jsx'
import CogsPage from './CogsPage.jsx'
import LogisticsLedgerPage from './LogisticsLedgerPage.jsx'
import LogisticsCostPage from './LogisticsCostPage.jsx'
import { supabase } from './supabase.js'
import PnLPage from './pnl/PnLPage.jsx'

// Maps the Inventory dashboard's dark IC palette onto the {t1,t2,t3,acc,acl,border,border2,
// bg,card} shape DateRangePicker expects (that shape mirrors the light C theme it was built
// for) — lets the calendar dropdown render in dark colors without forking its ~200 lines of
// layout/behavior.
const INVENTORY_DATE_THEME = {
  acc: IC.acc, acl: IC.accDim, acm: IC.accBorder,
  bg: IC.page, card: IC.surfaceHi, border: IC.border, border2: IC.border2,
  t1: IC.t1, t2: IC.t2, t3: IC.t3,
}
import { ReferenceLine, LabelList, ScatterChart, Scatter } from 'recharts'

// ── Logistics Page ────────────────────────────────────────────
const COURIERS = ['Bluedart','Delhivery','Delhivery NDD','Ekart','ElasticRun','Safexpress','Shadowfax','Shiprocket','Skye Air','Swift','Urbane Bolt']
// COURIER_COLORS / COURIER_LOGOS now live in utils.js — shared with the cost page.

function LogisticsKPI({ label, value, sub, color, badge }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 10.5, color: C.t3, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || C.t1, letterSpacing: '-0.5px', lineHeight: 1.1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 11, color: C.t3 }}>{sub}</div>}
    </div>
  )
}

function LogisticsChip({ label, logo, active, onClick, grow, sidebar }) {
  const [imgErr, setImgErr] = useState(false)
  if (sidebar) return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 8px', borderRadius: 7, border: 'none',
      background: active ? '#EFEFEF' : 'transparent',
      color: active ? '#1a1a1a' : C.t2,
      fontSize: 12, fontWeight: active ? 700 : 500,
      cursor: 'pointer', fontFamily: 'var(--font)',
      width: '100%', textAlign: 'left', transition: 'all .15s',
      borderLeft: active ? '3px solid #888' : '3px solid transparent',
    }}>
      {logo && !imgErr
        ? <img src={logo} alt="" style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 4, flexShrink: 0, background: '#fff', padding: 1 }} onError={() => setImgErr(true)} />
        : <span style={{ width: 22, height: 22, borderRadius: 4, background: COURIER_COLORS[label] || '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{label.charAt(0)}</span>
      }
      {label}
    </button>
  )
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      padding: '0 8px', height: 34, borderRadius: 8,
      border: `1.5px solid ${active ? '#FFD600' : C.border}`,
      background: active ? '#FEFDF0' : C.card,
      color: active ? '#1a1400' : C.t2,
      fontSize: 11.5, fontWeight: active ? 700 : 500,
      cursor: 'pointer', fontFamily: 'var(--font)',
      whiteSpace: 'nowrap', transition: 'all .15s',
      boxShadow: active ? '0 0 0 1px #FFD60066' : 'none',
      flex: grow ? 1 : '0 0 auto',
    }}>
      {logo && !imgErr
        ? <img src={logo} alt="" style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 3, flexShrink: 0, background: '#fff' }} onError={() => setImgErr(true)} />
        : <span style={{ width: 22, height: 22, borderRadius: 3, background: COURIER_COLORS[label] || '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{label.charAt(0)}</span>
      }
      {label}
    </button>
  )
}

function LogisticsToggle({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', border: `1.5px solid ${C.border2}`, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: C.card }}>
      {options.map((opt, i) => (
        <button key={opt} onClick={() => onChange(opt === value ? 'all' : opt)} style={{
          padding: '6px 16px', border: 'none', borderLeft: i > 0 ? `1.5px solid ${C.border2}` : 'none',
          background: value === opt ? C.t1 : 'transparent', color: value === opt ? '#fff' : C.t2,
          fontSize: 11.5, fontWeight: value === opt ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--font)',
          transition: 'all .15s'
        }}>{opt}</button>
      ))}
    </div>
  )
}

function LDropdown({ label, options, value, onChange, flex }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch('') } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const filtered = (options || []).filter(o => o.toLowerCase().includes(search.toLowerCase()))
  return (
    <div ref={ref} style={{ position: 'relative', flex: flex ? 1 : '0 0 auto', minWidth: 0 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
        border: `1.5px solid ${value ? C.acm : C.border2}`, borderRadius: 8,
        background: value ? C.acl : C.card, cursor: 'pointer', fontFamily: 'var(--font)',
        fontSize: 11.5, color: value ? C.t1 : C.t2, fontWeight: value ? 600 : 400,
        width: '100%', whiteSpace: 'nowrap'
      }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>{value || label}</span>
        <span style={{ fontSize: 8, color: C.t3, flexShrink: 0, marginLeft: 2 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 400, background: C.card, border: `1px solid ${C.border2}`, borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,.14)', minWidth: 180, maxHeight: 280, display: 'flex', flexDirection: 'column' }}>
          {(options || []).length > 6 && (
            <div style={{ padding: '7px 8px', borderBottom: `1px solid ${C.border}` }}>
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ width: '100%', fontSize: 11.5, padding: '4px 8px', border: `1px solid ${C.border2}`, borderRadius: 6, outline: 'none', fontFamily: 'var(--font)', background: C.bg }} />
            </div>
          )}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div onClick={() => { onChange(null); setOpen(false); setSearch('') }} style={{ padding: '8px 12px', fontSize: 11.5, cursor: 'pointer', color: C.t3, borderBottom: `1px solid ${C.border}` }}>All {label}</div>
            {filtered.map(opt => (
              <div key={opt} onClick={() => { onChange(opt); setOpen(false); setSearch('') }}
                style={{ padding: '8px 12px', fontSize: 11.5, cursor: 'pointer', background: value === opt ? C.acl : undefined, color: value === opt ? C.t1 : C.t2, fontWeight: value === opt ? 600 : 400 }}>
                {opt}
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding: '10px 12px', fontSize: 11.5, color: C.t3 }}>No results</div>}
          </div>
        </div>
      )}
    </div>
  )
}

function LKpiCard({ label, value, badgeText, badgeVariant, subValue, cur, prev, hideSubValue, compact, tight }) {
  const bv = badgeVariant || 'N'
  const chg = (cur != null && prev != null && prev !== 0) ? ((cur - prev) / prev * 100) : null
  const chgBadge = chg != null && Math.abs(chg) < 999
    ? <span style={{ fontSize: tight ? 9 : 10, fontWeight: 700, padding: tight ? '1px 4px' : '2px 6px', borderRadius: 4, background: chg >= 0 ? C.green.bg : C.red.bg, color: chg >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{chg >= 0 ? '▲' : '▼'} {Math.abs(chg).toFixed(1)}%</span>
    : badgeText ? <span className={`bdg bdg-${bv}`} style={{ fontSize: tight ? 9 : 10, flexShrink: 0 }}>{badgeText}</span> : null
  return (
    <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: tight ? '5px 6px' : '7px 10px' }}>
      <div className="kpi-label" style={{ marginBottom: 2 }}>{label}</div>
      {compact ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, minWidth: 0 }}>
            <div className="kpi-value" style={{ fontSize: tight ? 14 : 16, whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value ?? '—'}</div>
            {chgBadge}
          </div>
          {subValue && <div style={{ fontSize: 11, fontWeight: 500, color: C.t3, marginTop: 1 }}>{subValue} of total</div>}
        </>
      ) : (
        <>
          <div className="kpi-value" style={{ fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value ?? '—'}</div>
          {chgBadge && <div style={{ marginTop: 2 }}>{chgBadge}</div>}
          {subValue && !hideSubValue && <div style={{ fontSize: 11, fontWeight: 500, color: C.t3, marginTop: 2 }}>{subValue}</div>}
        </>
      )}
    </div>
  )
}

function LSectionTitle({ title, collapsed, onToggle }) {
  const clickable = typeof onToggle === 'function'
  return (
    <div onClick={clickable ? onToggle : undefined} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 2px', cursor: clickable ? 'pointer' : 'default', userSelect: 'none' }}>
      {clickable && <span style={{ fontSize: 9, color: C.t3, display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform .2s' }}>▼</span>}
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: C.t1 }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  )
}

function LogisticsSkeleton() {
  const sk = (w, h, r = 8) => ({ width: w, height: h, borderRadius: r, background: C.border, animation: 'pulse 1.5s ease infinite', flexShrink: 0 })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        {[...Array(5)].map((_, i) => <div key={i} style={sk('100%', 88)} />)}
      </div>
      {/* Trend chart */}
      <div style={sk('100%', 220)} />
      {/* Two side-by-side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={sk('100%', 200)} />
        <div style={sk('100%', 200)} />
      </div>
      {/* Table */}
      <div style={sk('100%', 180)} />
    </div>
  )
}

function LogisticsPage({ filters }) {
  const API = import.meta.env.VITE_API_URL || ''
  const [logisticsView, setLogisticsView] = useState('Logistics')
  const [lopsTab, setLopsTab] = useState('overview') // kept for compat but toggle removed
  const [tatCourierView, setTatCourierView] = useState('courier') // 'courier' | 'month'
  const [secCollapsed, setSecCollapsed] = useState({})
  const [wMetric, setWMetric] = useState('qty')
  const toggleSec = key => setSecCollapsed(p => ({ ...p, [key]: !p[key] }))
  const [lFilters, setLFilters] = useState({ couriers: [], shipmentType: 'forward', sddNdd: 'all', paymentMode: null, zone: null, pickupState: null, dropState: null, dropCity: null, category: null, subCategory: null })
  const [trendGranularity, setTrendGranularity] = useState('Daily')
  const [trendMetric, setTrendMetric] = useState('Qty')
  const [courierTatGran, setCourierTatGran] = useState('Daily')
  const [cSort, setCSort] = useState({ col: 'total', dir: 'desc' })
  const [cView, setCView] = useState('courier') // 'courier' | 'month'
  const [payTrendGran, setPayTrendGran] = useState('Daily')
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const [filterSidebarOpen, setFilterSidebarOpen] = useState(() => window.innerWidth > 768)
  const [cExpanded, setCExpanded] = useState({})
  const [rawData, setRawData] = useState(null)
  const [rawPrevData, setRawPrevData] = useState(null)
  const [data, setData] = useState(null)
  const [prevData, setPrevData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [staleData, setStaleData] = useState(() => {
    try { const s = localStorage.getItem('logistics_stale'); return s ? JSON.parse(s) : null } catch { return null }
  })
  const [retData, setRetData] = useState(null)
  const [retTrendGran, setRetTrendGran] = useState('Daily')
  const [retReasonView, setRetReasonView] = useState('reason') // 'reason' | 'sub'

  // tries static CDN file first if date range matches, falls back to live BQ API
  const fetchLogistics = useCallback(async () => {
    if (!filters.start || !filters.end) return
    setLoading(true); setError(null)
    try {
      // Try static file first — served from Vercel CDN in ~14ms
      let usedStatic = false
      try {
        const res = await fetch('/logistics-data.json')
        if (res.ok) {
          const json = await res.json()
          const ageMs = json.asOf ? Date.now() - new Date(json.asOf).getTime() : Infinity
          const dateMatches = json.dateRange && json.dateRange.start === filters.start && json.dateRange.end === filters.end
          const noExtraFilters = !lFilters.category && !lFilters.subCategory && (!lFilters.shipmentType || lFilters.shipmentType === 'forward')
          if (ageMs <= 2 * 60 * 60 * 1000 && !json._placeholder && json.current && dateMatches && noExtraFilters) {
            setRawData(json.current)
            setRawPrevData(json.previous || null)
            try { localStorage.setItem('logistics_stale', JSON.stringify({ current: json.current, previous: json.previous || null, dateRange: json.dateRange, savedAt: Date.now() })) } catch {}
            usedStatic = true
          }
        }
      } catch { /* fall through to live API */ }

      if (!usedStatic) {
        const body = { start: filters.start, end: filters.end }
        if (lFilters.category) body.category = [lFilters.category]
        if (lFilters.subCategory) body.subCategory = [lFilters.subCategory]
        if (lFilters.shipmentType && lFilters.shipmentType !== 'all') body.shipmentType = lFilters.shipmentType
        const s = new Date(filters.start), e = new Date(filters.end)
        const days = Math.round((e - s) / 86400000) + 1
        const prevEnd = new Date(s); prevEnd.setDate(prevEnd.getDate() - 1)
        const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - days + 1)
        const fmt = d => d.toISOString().slice(0, 10)
        const prevBody = { ...body, start: fmt(prevStart), end: fmt(prevEnd) }
        const [r, rPrev] = await Promise.all([
          fetch(`${API}/api/logistics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
          fetch(`${API}/api/logistics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prevBody) }),
        ])
        if (!r.ok) throw new Error(await r.text())
        const [cur, prev] = await Promise.all([r.json(), rPrev.ok ? rPrev.json() : Promise.resolve(null)])
        setRawData(cur)
        setRawPrevData(prev)
        try { localStorage.setItem('logistics_stale', JSON.stringify({ current: cur, previous: prev, dateRange: { start: filters.start, end: filters.end }, savedAt: Date.now() })) } catch {}
      }
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [filters.start, filters.end, lFilters.category, lFilters.subCategory, lFilters.shipmentType])

  useEffect(() => { fetchLogistics() }, [fetchLogistics])

  // instant client-side filter — runs on every slicer change, no BQ call
  useEffect(() => {
    const applyFilters = (raw) => {
      if (!raw) return null
      const { couriers, zone, paymentMode, pickupState, dropState, dropCity, category, subCategory, sddNdd, shipmentType } = lFilters
      const hasCourier = couriers.length > 0
      const NDD_COURIERS = ['Delhivery NDD', 'Skye Air', 'Urbane Bolt', 'ElasticRun']
      const isNdd = cg => NDD_COURIERS.includes(cg)
      const hasSddNdd = sddNdd && sddNdd !== 'all'
      const sddNddFilter = hasSddNdd
        ? (sddNdd === 'SDD/NDD' ? cg => isNdd(cg) : cg => !isNdd(cg))
        : () => true
      const hasShipmentType = false // handled by BQ refetch, not client-side
      const shipmentTypeFilter = () => true
      const courierFilter = x => (!hasCourier || couriers.includes(x.courier_group)) && sddNddFilter(x.courier_group) && shipmentTypeFilter(x)

      // build filtered byCourier rows
      const filteredCouriers = (raw.byCourier || []).filter(courierFilter)

      // derive kpis from byCourier rows (all fields now present in each courier row)
      const kpis = hasCourier
        ? filteredCouriers.reduce((acc, x) => {
            const n = k => typeof x[k] === 'number' ? x[k] : 0
            acc.total_shipments = (acc.total_shipments || 0) + n('total')
            acc.total_value = (acc.total_value || 0) + n('total_value')
            acc.delivered = (acc.delivered || 0) + n('delivered')
            acc.rto = (acc.rto || 0) + n('rto')
            acc.in_transit = (acc.in_transit || 0) + n('in_transit')
            acc.pickup_pending = (acc.pickup_pending || 0) + n('pickup_pending')
            acc.cancelled = (acc.cancelled || 0) + n('cancelled')
            acc.lost_damaged = (acc.lost_damaged || 0) + n('lost_damaged')
            acc.z_rto = (acc.z_rto || 0) + n('z_rto')
            acc.delivered_1attempt = (acc.delivered_1attempt || 0) + n('delivered_1attempt')
            acc.delivered_multi = (acc.delivered_multi || 0) + n('delivered_multi')
            acc.total_ofd_attempts = (acc.total_ofd_attempts || 0) + n('total_ofd_attempts')
            acc.rto_undelivered = (acc.rto_undelivered || 0) + n('rto_undelivered')
            acc.delivered_2attempt_rto = (acc.delivered_2attempt_rto || 0) + n('delivered_2attempt_rto')
            acc.on_time = (acc.on_time || 0) + n('on_time')
            acc.sla_breach = (acc.sla_breach || 0) + n('sla_breach')
            acc.critical_stuck = (acc.critical_stuck || 0) + n('critical_stuck')
            acc.rto_10plus = (acc.rto_10plus || 0) + n('rto_10plus')
            acc.edd_breached = (acc.edd_breached || 0) + n('edd_breached')
            // weighted avg for TAT metrics
            acc._wt = (acc._wt || 0) + n('total')
            acc._avg_intransit = (acc._avg_intransit || 0) + n('avg_intransit') * n('delivered')
            acc._avg_fulfilment = (acc._avg_fulfilment || 0) + n('avg_fulfilment') * n('delivered')
            acc._avg_pickup = (acc._avg_pickup || 0) + n('avg_pickup') * n('total')
            acc._avg_processing = (acc._avg_processing || 0) + n('avg_processing') * n('total')
            acc._avg_s2a = (acc._avg_s2a || 0) + n('avg_s2a') * n('total')
            acc._avg_rto_tat = (acc._avg_rto_tat || 0) + n('avg_rto_tat') * n('rto')
            return acc
          }, {})
        : raw.kpis

      if (hasCourier && kpis._wt) {
        kpis.avg_intransit = +(kpis._avg_intransit / Math.max(kpis.delivered, 1)).toFixed(2)
        kpis.avg_fulfilment = +(kpis._avg_fulfilment / Math.max(kpis.delivered, 1)).toFixed(1)
        kpis.avg_pickup = +(kpis._avg_pickup / Math.max(kpis._wt, 1)).toFixed(2)
        kpis.avg_processing = +(kpis._avg_processing / Math.max(kpis._wt, 1)).toFixed(1)
        kpis.avg_s2a = +(kpis._avg_s2a / Math.max(kpis._wt, 1)).toFixed(1)
        kpis.avg_rto_tat = +(kpis._avg_rto_tat / Math.max(kpis.rto, 1)).toFixed(1)
      }

      return {
        ...raw,
        kpis,
        byCourier: filteredCouriers,
        byCourierDay: (raw.byCourierDay || []).filter(courierFilter),
        byCourierWeek: (raw.byCourierWeek || []).filter(courierFilter),
        byCourierMonth: (raw.byCourierMonth || []).filter(courierFilter),
        tatByCourier: (raw.tatByCourier || []).filter(courierFilter),
        byZone: zone ? (raw.byZone || []).filter(x => x.zone === zone) : raw.byZone,
        byZoneDetail: zone ? (raw.byZoneDetail || []).filter(x => x.zone === zone) : raw.byZoneDetail,
        byPayment: paymentMode ? (raw.byPayment || []).filter(x => x.payment_mode?.toLowerCase() === paymentMode.toLowerCase()) : raw.byPayment,
        byPaymentDetail: paymentMode ? (raw.byPaymentDetail || []).filter(x => x.payment_mode?.toLowerCase() === paymentMode.toLowerCase()) : raw.byPaymentDetail,
        byPaymentDay: paymentMode ? (raw.byPaymentDay || []).filter(x => x.payment_mode?.toLowerCase() === paymentMode.toLowerCase()) : raw.byPaymentDay,
        byPaymentWeek: paymentMode ? (raw.byPaymentWeek || []).filter(x => x.payment_mode?.toLowerCase() === paymentMode.toLowerCase()) : raw.byPaymentWeek,
        byPaymentMonth: paymentMode ? (raw.byPaymentMonth || []).filter(x => x.payment_mode?.toLowerCase() === paymentMode.toLowerCase()) : raw.byPaymentMonth,
        topDropStates: dropState ? (raw.topDropStates || []).filter(x => x.state?.toLowerCase() === dropState.toLowerCase()) : raw.topDropStates,
        topDropCities: dropCity ? (raw.topDropCities || []).filter(x => x.city?.toLowerCase() === dropCity.toLowerCase()) : raw.topDropCities,
        topPickupCities: pickupState ? (raw.topPickupCities || []).filter(x => x.pickup_state?.toLowerCase() === pickupState.toLowerCase()) : raw.topPickupCities,
        byChannel: hasCourier ? (raw.byChannel || []).filter(x => couriers.some(c => x.channel?.toLowerCase().includes(c.toLowerCase()))) : raw.byChannel,
        byStatus: (hasCourier || hasSddNdd || hasShipmentType)
          ? (() => {
              const statusMap = {}
              filteredCouriers.forEach(x => {
                const add = (k, v) => { statusMap[k] = (statusMap[k] || 0) + (x[v] || 0) }
                add('Delivered', 'delivered'); add('RTO', 'rto')
                add('Intransit', 'in_transit'); add('Pickup Pending', 'pickup_pending')
                add('Cancelled', 'cancelled')
              })
              return Object.entries(statusMap).map(([unified_status, total]) => ({ unified_status, total }))
            })()
          : raw.byStatus,
        byDay: (hasCourier || hasSddNdd || hasShipmentType) ? Object.values(
            (raw.byCourierDay || []).filter(courierFilter)
              .reduce((acc, x) => {
                const key = x.period_label
                if (!acc[key]) acc[key] = { label: x.period_label, dt: x.period_dt, total: 0, delivered: 0, rto: 0 }
                acc[key].total += x.total || 0; acc[key].delivered += x.delivered || 0; acc[key].rto += x.rto || 0
                return acc
              }, {})
          ).sort((a, b) => a.dt < b.dt ? -1 : 1) : raw.byDay,
        byWeek: (hasCourier || hasSddNdd || hasShipmentType) ? Object.values(
            (raw.byCourierWeek || []).filter(courierFilter)
              .reduce((acc, x) => {
                const key = x.period_label
                if (!acc[key]) acc[key] = { label: x.period_label, dt: x.period_dt, total: 0, delivered: 0, rto: 0 }
                acc[key].total += x.total || 0; acc[key].delivered += x.delivered || 0; acc[key].rto += x.rto || 0
                return acc
              }, {})
          ).sort((a, b) => a.dt < b.dt ? -1 : 1) : raw.byWeek,
        byMonth: (hasCourier || hasSddNdd || hasShipmentType) ? Object.values(
            (raw.byCourierMonth || []).filter(courierFilter)
              .reduce((acc, x) => {
                const key = x.month_label
                if (!acc[key]) acc[key] = { label: x.month_label, dt: x.month_dt, total: 0, delivered: 0, rto: 0 }
                acc[key].total += x.total || 0; acc[key].delivered += x.delivered || 0; acc[key].rto += x.rto || 0
                return acc
              }, {})
          ).sort((a, b) => a.dt < b.dt ? -1 : 1) : raw.byMonth,
        byWeightSlab: (() => {
            const m = {}
            const rows = (raw.byWeightSlab || []).filter(courierFilter)
            rows.forEach(x => {
              if (!m[x.slab]) m[x.slab] = { slab: x.slab, slab_order: x.slab_order, total: 0, delivered: 0, rto: 0, in_transit: 0, total_value: 0, _tat_w: 0, _tat_sum: 0 }
              m[x.slab].total += x.total || 0; m[x.slab].delivered += x.delivered || 0
              m[x.slab].rto += x.rto || 0; m[x.slab].in_transit += x.in_transit || 0
              m[x.slab].total_value += x.total_value || 0
              m[x.slab]._tat_w += x.total || 0; m[x.slab]._tat_sum += (x.avg_tat || 0) * (x.total || 0)
            })
            return Object.values(m).map(x => ({ ...x, del_pct: +((x.delivered / Math.max(x.total,1)) * 100).toFixed(1), rto_pct: +((x.rto / Math.max(x.total,1)) * 100).toFixed(1), avg_tat: +(x._tat_sum / Math.max(x._tat_w,1)).toFixed(2) })).sort((a,b) => a.slab_order - b.slab_order)
          })(),
        tatByFacility: (() => {
            const m = {}
            const rows = (raw.tatByFacility || []).filter(courierFilter)
            rows.forEach(x => {
              if (!m[x.facility]) m[x.facility] = { facility: x.facility, total: 0, delivered: 0, proc_0_12h: 0, proc_12_24h: 0, proc_24_48h: 0, proc_48plus: 0, ord_0_1: 0, ord_2_3: 0, ord_4_5: 0, ord_5plus: 0 }
              const f = m[x.facility]
              ;['total','delivered','proc_0_12h','proc_12_24h','proc_24_48h','proc_48plus','ord_0_1','ord_2_3','ord_4_5','ord_5plus'].forEach(k => f[k] += x[k] || 0)
            })
            return Object.values(m).sort((a,b) => b.total - a.total)
          })(),
        rtoReasons: (() => {
            const rows = (raw.rtoReasons || []).filter(courierFilter)
            const m = {}; rows.forEach(x => { m[x.reason] = (m[x.reason] || 0) + (x.total || 0) })
            return Object.entries(m).map(([reason, total]) => ({ reason, total })).sort((a,b) => b.total - a.total)
          })(),
        failedDeliveryReasons: (() => {
            const rows = (raw.failedDeliveryReasons || []).filter(courierFilter)
            const m = {}; rows.forEach(x => { m[x.reason] = (m[x.reason] || 0) + (x.total || 0) })
            return Object.entries(m).map(([reason, total]) => ({ reason, total })).sort((a,b) => b.total - a.total)
          })(),
        topDropStates: (() => {
          const rows = hasCourier ? (raw.topDropStates || []).filter(x => couriers.includes(x.courier_group)) : (raw.topDropStates || [])
          const f2 = dropState ? rows.filter(x => x.state?.toLowerCase() === dropState.toLowerCase()) : rows
          const m = {}; f2.forEach(x => { m[x.state] = (m[x.state] || 0) + (x.total || 0) })
          return Object.entries(m).map(([state, total]) => ({ state, total })).sort((a,b) => b.total - a.total).slice(0, 10)
        })(),
        topDropCities: (() => {
          const rows = hasCourier ? (raw.topDropCities || []).filter(x => couriers.includes(x.courier_group)) : (raw.topDropCities || [])
          const f2 = dropCity ? rows.filter(x => x.city?.toLowerCase() === dropCity.toLowerCase()) : rows
          const m = {}; f2.forEach(x => { m[x.city] = (m[x.city] || 0) + (x.total || 0) })
          return Object.entries(m).map(([city, total]) => ({ city, total })).sort((a,b) => b.total - a.total).slice(0, 10)
        })(),
        topPickupCities: (() => {
          const rows = hasCourier ? (raw.topPickupCities || []).filter(x => couriers.includes(x.courier_group)) : (raw.topPickupCities || [])
          const f2 = pickupState ? rows.filter(x => x.pickup_state?.toLowerCase() === pickupState.toLowerCase()) : rows
          const m = {}; f2.forEach(x => { m[x.city] = (m[x.city] || 0) + (x.total || 0) })
          return Object.entries(m).map(([city, total]) => ({ city, total })).sort((a,b) => b.total - a.total).slice(0, 10)
        })(),
      }
    }
    const effectiveRaw = rawData || (staleData?.current ?? null)
    const effectivePrev = rawPrevData || (staleData?.previous ?? null)
    setData(applyFilters(effectiveRaw))
    setPrevData(applyFilters(effectivePrev))
  }, [rawData, rawPrevData, staleData, lFilters])

  const fetchReturns = useCallback(async () => {
    if (!filters.start || !filters.end) return
    try {
      const r = await fetch(`${API}/api/returns`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start: filters.start, end: filters.end }) })
      if (r.ok) setRetData(await r.json())
    } catch (e) { console.error('[returns]', e.message) }
  }, [filters.start, filters.end])

  useEffect(() => { fetchReturns() }, [fetchReturns])

  const k = data?.kpis || {}
  const pk = prevData?.kpis || {}
  const pct2 = (a, b) => b ? ((a / b) * 100).toFixed(1) + '%' : '—'
  const n = v => (v || 0).toLocaleString('en-IN')
  const d1 = v => v != null ? (+v).toFixed(1) + 'd' : '—'
  const fmtGMV = v => v == null ? '—' : v >= 1e7 ? (v/1e7).toFixed(2)+' Cr' : v >= 1e5 ? (v/1e5).toFixed(1)+' L' : v.toLocaleString('en-IN')

  // ── Smart Alerts ──
  const alerts = useMemo(() => {
    if (!data) return []
    const flags = []
    const total = k.total_shipments || 1
    const rtoPct = k.rto ? (k.rto / total) * 100 : 0
    const delPct = k.delivered ? (k.delivered / total) * 100 : 0
    const slaPct = (k.on_time && k.sla_breach) ? (k.sla_breach / (k.on_time + k.sla_breach)) * 100 : 0
    const ppPct = k.pickup_pending ? (k.pickup_pending / total) * 100 : 0
    const zrtoPct = k.z_rto ? (k.z_rto / total) * 100 : 0
    const couriers = data.byCourier || []

    if (rtoPct > 15) flags.push({ level: 'critical', icon: '🔴', title: 'High RTO Rate', msg: `RTO is at ${rtoPct.toFixed(1)}% — above 15% threshold. Immediate action needed.` })
    else if (rtoPct > 10) flags.push({ level: 'warning', icon: '🟡', title: 'Elevated RTO Rate', msg: `RTO at ${rtoPct.toFixed(1)}% — approaching critical threshold of 15%.` })

    if (zrtoPct > 3) flags.push({ level: 'warning', icon: '🟡', title: 'Zero-Attempt RTOs', msg: `${n(k.z_rto)} shipments (${zrtoPct.toFixed(1)}%) returned without any delivery attempt.` })

    if (delPct < 60) flags.push({ level: 'critical', icon: '🔴', title: 'Low Delivery Rate', msg: `Delivery rate is ${delPct.toFixed(1)}% — well below 75% benchmark.` })
    else if (delPct < 70) flags.push({ level: 'warning', icon: '🟡', title: 'Below-target Delivery Rate', msg: `Delivery rate ${delPct.toFixed(1)}% is below the 75% target.` })

    if (slaPct > 20) flags.push({ level: 'warning', icon: '🟡', title: 'SLA Breaches', msg: `${n(k.sla_breach)} shipments (${slaPct.toFixed(1)}%) breached committed SLA.` })

    if (ppPct > 10) flags.push({ level: 'warning', icon: '🟡', title: 'High Pickup Pending', msg: `${n(k.pickup_pending)} shipments (${ppPct.toFixed(1)}%) are still pending pickup.` })

    if (k.critical_stuck > 0) flags.push({ level: 'critical', icon: '🔴', title: 'Critical Stuck Shipments', msg: `${n(k.critical_stuck)} shipments are past EDD with no delivery — risk of customer escalation.` })

    if (k.lost_damaged > 0) flags.push({ level: 'info', icon: '🔵', title: 'Lost / Damaged', msg: `${n(k.lost_damaged)} shipments marked Lost or Damaged in the period.` })

    // Courier-level alerts
    couriers.forEach(c => {
      const cRtoPct = c.total ? (c.rto / c.total) * 100 : 0
      const cDelPct = c.total ? (c.delivered / c.total) * 100 : 0
      if (c.total > 100 && cRtoPct > 20) flags.push({ level: 'warning', icon: '🟡', title: `${c.courier_group} — High RTO`, msg: `RTO at ${cRtoPct.toFixed(1)}% for ${n(c.total)} shipments.` })
      if (c.total > 100 && cDelPct < 50) flags.push({ level: 'critical', icon: '🔴', title: `${c.courier_group} — Low Delivery`, msg: `Delivery rate only ${cDelPct.toFixed(1)}% — consider volume reallocation.` })
    })

    if (flags.length === 0) flags.push({ level: 'ok', icon: '🟢', title: 'All metrics within range', msg: 'No critical issues detected for the selected period.' })
    return flags
  }, [data, k])
  const opts = data?.filterOpts || {}
  const toggleCourier = c => setLFilters(f => ({ ...f, couriers: f.couriers.includes(c) ? f.couriers.filter(x => x !== c) : [...f.couriers, c] }))

  const STATUS_COLORS = { Delivered: '#FFD600', RTO: '#F87171', Intransit: '#60A5FA', 'Pickup Pending': '#FBBF24', Cancelled: '#C084FC', Lost: '#FB923C', Damaged: '#94A3B8' }
  const STATUS_BG = { Delivered: C.green.bg, RTO: C.red.bg, Intransit: C.blue.bg, 'Pickup Pending': '#f59e0b22', Cancelled: '#a855f722', Lost: '#f9731622', Damaged: '#64748b22' }

  const trendRaw = trendGranularity === 'Daily' ? (data?.byDay || []) : trendGranularity === 'Weekly' ? (data?.byWeek || []) : (data?.byMonth || [])
  const trendDeduped = Object.values(trendRaw.reduce((acc, d) => {
    if (!acc[d.label]) { acc[d.label] = { ...d, _n: 1 } }
    else {
      acc[d.label].total = (acc[d.label].total || 0) + (d.total || 0)
      acc[d.label].delivered = (acc[d.label].delivered || 0) + (d.delivered || 0)
      acc[d.label].rto = (acc[d.label].rto || 0) + (d.rto || 0)
      acc[d.label]._n++
    }
    return acc
  }, {}))
  const trendData = trendDeduped.map(d => ({ ...d, rto_pct: d.total ? +((d.rto / d.total) * 100).toFixed(1) : 0, del_pct: d.total ? +((d.delivered / d.total) * 100).toFixed(1) : 0 }))
  const byCourierData = (data?.byCourier || []).map(d => ({ ...d, del_pct: d.total ? +((d.delivered / d.total) * 100).toFixed(1) : 0, rto_pct: d.total ? +((d.rto / d.total) * 100).toFixed(1) : 0 }))
  const maxCourierTotal = byCourierData[0]?.total || 1

  const statusDonutData = [...(data?.byStatus || [])].sort((a, b) => b.total - a.total)
  const paymentDonutData = data?.byPayment || []

  const cardStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }
  const chartTitle = { fontSize: 11, fontWeight: 700, color: C.t2, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 14 }

  const filterSidebarContent = (
    <div style={{ width: 220, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', height: '100%' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.t3, letterSpacing: '.06em', textTransform: 'uppercase' }}>Courier Partner</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {COURIERS.map(c => (
              <LogisticsChip key={c} label={c} logo={COURIER_LOGOS[c]} active={lFilters.couriers.includes(c)} onClick={() => toggleCourier(c)} sidebar />
            ))}
            {lFilters.couriers.length > 0 && (
              <button onClick={() => setLFilters(f => ({ ...f, couriers: [] }))} style={{ fontSize: 11, color: C.t3, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font)' }}>✕ Clear</button>
            )}
          </div>
          <div style={{ height: 1, background: C.border, margin: '4px 0' }} />
          <div style={{ fontSize: 10, fontWeight: 800, color: C.t3, letterSpacing: '.06em', textTransform: 'uppercase' }}>Courier Direction</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[['Forward','Reverse'],['Regular','SDD/NDD']].map((opts, gi) => {
              const val = gi === 0 ? lFilters.shipmentType : lFilters.sddNdd
              const onChange = v => gi === 0 ? setLFilters(f => ({ ...f, shipmentType: v })) : setLFilters(f => ({ ...f, sddNdd: v }))
              return (
                <div key={gi} style={{ display: 'flex', border: `1.5px solid ${C.border2}`, borderRadius: 8, overflow: 'hidden', background: C.card }}>
                  {opts.map((opt, i) => (
                    <button key={opt} onClick={() => { const v = gi === 0 ? opt.toLowerCase() : opt; onChange(v === val ? 'all' : v) }} style={{
                      flex: 1, padding: '6px 0', border: 'none', borderLeft: i > 0 ? `1.5px solid ${C.border2}` : 'none',
                      background: val === (gi === 0 ? opt.toLowerCase() : opt) ? C.t1 : 'transparent',
                      color: val === (gi === 0 ? opt.toLowerCase() : opt) ? '#fff' : C.t2,
                      fontSize: 11.5, fontWeight: val === (gi === 0 ? opt.toLowerCase() : opt) ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--font)',
                      textAlign: 'center', transition: 'all .15s'
                    }}>{opt}</button>
                  ))}
                </div>
              )
            })}
          </div>
          <div style={{ height: 1, background: C.border, margin: '4px 0' }} />
          <div style={{ fontSize: 10, fontWeight: 800, color: C.t3, letterSpacing: '.06em', textTransform: 'uppercase' }}>Filters</div>
          <LDropdown label="Zone" options={opts.zones} value={lFilters.zone} onChange={v => setLFilters(f => ({ ...f, zone: v }))} />
          <LDropdown label="Pickup State" options={opts.pickup_states} value={lFilters.pickupState} onChange={v => setLFilters(f => ({ ...f, pickupState: v }))} />
          <LDropdown label="Drop State" options={opts.drop_states} value={lFilters.dropState} onChange={v => setLFilters(f => ({ ...f, dropState: v }))} />
          <LDropdown label="Drop City" options={opts.drop_cities} value={lFilters.dropCity} onChange={v => setLFilters(f => ({ ...f, dropCity: v }))} />
          <LDropdown label="Payment" options={['COD','Prepaid']} value={lFilters.paymentMode} onChange={v => setLFilters(f => ({ ...f, paymentMode: v }))} />
          <LDropdown label="Category" options={opts.categories} value={lFilters.category} onChange={v => setLFilters(f => ({ ...f, category: v, subCategory: null }))} />
          <LDropdown label="Sub-category" options={opts.sub_categories} value={lFilters.subCategory} onChange={v => setLFilters(f => ({ ...f, subCategory: v }))} />
          {(lFilters.zone || lFilters.pickupState || lFilters.dropState || lFilters.dropCity || lFilters.paymentMode || lFilters.category || lFilters.subCategory) && (
            <button onClick={() => setLFilters(f => ({ ...f, zone: null, pickupState: null, dropState: null, dropCity: null, paymentMode: null, category: null, subCategory: null }))}
              style={{ fontSize: 11, color: C.t3, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font)' }}>✕ Clear All</button>
          )}
        </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {loading && (
        <div style={{ height: 2, background: C.border, flexShrink: 0 }}>
          <div className="progress-bar" style={{ height: '100%', background: C.acc }} />
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Filter Sidebar: overlay drawer on mobile, inline panel on desktop ── */}
        {isMobile ? (
          filterSidebarOpen && <>
            <div onClick={() => setFilterSidebarOpen(false)} style={{ position: 'fixed', inset: 0, top: 'var(--nav)', background: 'rgba(0,0,0,0.35)', zIndex: 199 }} />
            <div style={{ position: 'fixed', top: 'var(--nav)', left: 0, width: 260, maxWidth: '85vw', height: 'calc(100vh - var(--nav) - var(--bot))', background: C.card, zIndex: 200, boxShadow: '4px 0 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 8px', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>Filters</span>
                <button onClick={() => setFilterSidebarOpen(false)} style={{ background: 'none', border: 'none', color: C.t3, fontSize: 18, cursor: 'pointer', padding: '2px 6px', lineHeight: 1 }}>✕</button>
              </div>
              {filterSidebarContent}
            </div>
          </>
        ) : (
          <div style={{ width: filterSidebarOpen ? 220 : 0, minWidth: filterSidebarOpen ? 220 : 0, transition: 'width 0.25s ease, min-width 0.25s ease', overflow: 'hidden', borderRight: `1px solid ${C.border}`, background: C.card, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            {filterSidebarContent}
          </div>
        )}

        {/* ── Sidebar Toggle Button (desktop only) ── */}
        {!isMobile && (
          <button onClick={() => setFilterSidebarOpen(o => !o)} style={{ width: 16, alignSelf: 'flex-start', marginTop: 20, height: 48, border: `1px solid ${C.border}`, borderLeft: 'none', background: C.card, cursor: 'pointer', borderRadius: '0 6px 6px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.t3, fontSize: 12, flexShrink: 0, boxShadow: '2px 0 4px rgba(0,0,0,0.06)', padding: 0 }}>
            {filterSidebarOpen ? '‹' : '›'}
          </button>
        )}

        {/* ── Main Content ── */}
        <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '8px 12px 16px' : '16px 20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Mobile filter button */}
          {isMobile && (
            <button onClick={() => setFilterSidebarOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: C.card, border: `1px solid ${C.border2}`, color: C.t2, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start', fontFamily: 'var(--font)' }}>
              ☰ Filters{(lFilters.couriers.length || lFilters.zone || lFilters.paymentMode || lFilters.category) ? ' •' : ''}
            </button>
          )}

      {error && <div style={{ padding: '10px 14px', borderRadius: 9, background: C.red.bg, border: `1px solid ${C.red.bd}`, color: C.red.tx, fontSize: 12 }}>⚠ {error}</div>}
      {loading && !rawData && !staleData && (
        <LogisticsSkeleton />
      )}
      {loading && !rawData && staleData && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderRadius: 8, background: C.acl, border: `1px solid ${C.acc}44`, alignSelf: 'flex-start', fontSize: 11.5, color: C.t2, fontWeight: 500 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.acc, display: 'inline-block', animation: 'pulse 1.2s ease infinite', flexShrink: 0 }} />
          Refreshing data…
        </div>
      )}

      {data && <>

        {/* ── KPI Hero + Grid ── */}
        {isMobile ? (
          // Mobile: stacked rows
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {/* Hero summary card */}
            <div className="kpi-card" style={{ padding: '12px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div className="kpi-label">Total Shipments</div>
                  <div className="kpi-value" style={{ fontSize: 22 }}>{n(k.total_shipments)}</div>
                  {(() => { const chg = k.total_shipments && pk.total_shipments ? (k.total_shipments - pk.total_shipments) / pk.total_shipments * 100 : null; return chg != null ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: chg >= 0 ? C.green.bg : C.red.bg, color: chg >= 0 ? C.green.tx : C.red.tx }}>{chg >= 0 ? '▲' : '▼'} {Math.abs(chg).toFixed(1)}%</span> : null })()}
                </div>
                <div>
                  <div className="kpi-label">Total GMV</div>
                  <div className="kpi-value" style={{ fontSize: 22 }}>{fmtGMV(k.total_value)}</div>
                  {(() => { const chg = k.total_value && pk.total_value ? (k.total_value - pk.total_value) / pk.total_value * 100 : null; return chg != null ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: chg >= 0 ? C.green.bg : C.red.bg, color: chg >= 0 ? C.green.tx : C.red.tx }}>{chg >= 0 ? '▲' : '▼'} {Math.abs(chg).toFixed(1)}%</span> : null })()}
                </div>
                <div>
                  <div className="kpi-label">Delivered %</div>
                  <div className="kpi-value" style={{ fontSize: 22 }}>{pct2(k.delivered, k.total_shipments)}</div>
                </div>
                <div>
                  <div className="kpi-label">RTO %</div>
                  <div className="kpi-value" style={{ fontSize: 22, color: (k.rto / (k.total_shipments || 1) * 100) > 15 ? C.red.tx : undefined }}>{pct2(k.rto, k.total_shipments)}</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7 }}>
              <LKpiCard label="On Time Del" value={n(k.on_time)} badgeText={pct2(k.on_time, k.delivered)} badgeVariant="G" cur={k.on_time} prev={pk.on_time} compact />
              <LKpiCard label="SLA Breach" value={n(k.sla_breach)} badgeVariant="R" cur={k.sla_breach} prev={pk.sla_breach} compact />
              <LKpiCard label="RTO 10+ Days" value={n(k.rto_10plus)} badgeVariant="R" cur={k.rto_10plus} prev={pk.rto_10plus} compact />
              <LKpiCard label="Z-RTO" value={n(k.z_rto)} badgeText={pct2(k.z_rto, k.total_shipments)} badgeVariant="A" cur={k.z_rto} prev={pk.z_rto} compact />
              <LKpiCard label="FASR %" value={pct2(k.delivered_1attempt, k.total_ofd_attempts)} badgeVariant="G" cur={k.delivered_1attempt} prev={pk.delivered_1attempt} compact />
              <LKpiCard label="RASR %" value={pct2(k.delivered_multi, k.total_ofd_attempts)} badgeVariant="B" cur={k.delivered_multi} prev={pk.delivered_multi} compact />
              <LKpiCard label="Multi-Att Del" value={n(k.delivered_multi)} badgeVariant="B" cur={k.delivered_multi} prev={pk.delivered_multi} compact />
              <LKpiCard label="Avg Processing" value={d1(k.avg_processing)} badgeText="Cr→1st OFD" badgeVariant="N" cur={k.avg_processing} prev={pk.avg_processing} compact />
              <LKpiCard label="Avg Pickup TAT" value={d1(k.avg_pickup)} badgeText="Cr→Pick" badgeVariant="B" cur={k.avg_pickup} prev={pk.avg_pickup} compact />
              <LKpiCard label="Avg In-Transit" value={d1(k.avg_intransit)} badgeText="Pick→Del" badgeVariant="N" cur={k.avg_intransit} prev={pk.avg_intransit} compact />
              <LKpiCard label="Avg Fulfilment" value={d1(k.avg_fulfilment)} badgeText="Cr→Del" badgeVariant="G" cur={k.avg_fulfilment} prev={pk.avg_fulfilment} compact />
              <LKpiCard label="Avg RTO TAT" value={d1(k.avg_rto_tat)} badgeText="RTO days" badgeVariant="R" cur={k.avg_rto_tat} prev={pk.avg_rto_tat} compact />
            </div>
          </div>
        ) : (
          // Desktop: hero card left + 2×6 grid right
          <div style={{ display: 'grid', gridTemplateColumns: filterSidebarOpen ? '200px 1fr' : '230px 1fr', gap: 10, alignItems: 'stretch' }}>
            {/* Hero card */}
            <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: filterSidebarOpen ? 4 : 8, padding: filterSidebarOpen ? '10px 14px' : '16px 18px' }}>
              <div className="kpi-label" style={{ fontSize: 10 }}>Total Shipments</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <div className="kpi-value" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px' }}>{n(k.total_shipments)}</div>
                {(() => { const chg = k.total_shipments && pk.total_shipments ? (k.total_shipments - pk.total_shipments) / pk.total_shipments * 100 : null; return chg != null ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: chg >= 0 ? C.green.bg : C.red.bg, color: chg >= 0 ? C.green.tx : C.red.tx }}>{chg >= 0 ? '▲' : '▼'} {Math.abs(chg).toFixed(1)}%</span> : null })()}
              </div>
              <div className="kpi-sub" style={{ fontSize: 12 }}>GMV: <strong>{fmtGMV(k.total_value)}</strong></div>
              <div className="kpi-sub" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ color: C.green.tx, fontWeight: 700 }}>{pct2(k.delivered, k.total_shipments)}</span> Delivered · <span style={{ color: (k.rto / (k.total_shipments || 1) * 100) > 15 ? C.red.tx : C.t2, fontWeight: 700 }}>{pct2(k.rto, k.total_shipments)}</span> RTO
              </div>
            </div>
            {/* Right: 2 rows × 6 cols */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: filterSidebarOpen ? 5 : 7, alignItems: 'stretch' }}>
              <LKpiCard label="Total Attempted" value={n(k.total_ofd_attempts)} badgeVariant="N" cur={k.total_ofd_attempts} prev={pk.total_ofd_attempts} compact tight={filterSidebarOpen} />
              <LKpiCard label="Z-RTO" value={n(k.z_rto)} badgeText={pct2(k.z_rto, k.total_shipments)} badgeVariant="A" cur={k.z_rto} prev={pk.z_rto} compact tight={filterSidebarOpen} />
              <LKpiCard label="FASR % (of attempted)" value={pct2(k.delivered_1attempt, k.total_ofd_attempts)} badgeVariant="G" cur={k.delivered_1attempt} prev={pk.delivered_1attempt} compact tight={filterSidebarOpen} />
              <LKpiCard label="RASR % (of attempted)" value={pct2(k.delivered_multi, k.total_ofd_attempts)} badgeVariant="B" cur={k.delivered_multi} prev={pk.delivered_multi} compact tight={filterSidebarOpen} />
              <LKpiCard label="Multi-Att Del" value={n(k.delivered_multi)} badgeVariant="B" cur={k.delivered_multi} prev={pk.delivered_multi} compact tight={filterSidebarOpen} />
              <LKpiCard label="Avg Processing" value={d1(k.avg_processing)} badgeText="Cr→1st OFD" badgeVariant="N" cur={k.avg_processing} prev={pk.avg_processing} compact tight={filterSidebarOpen} />
              <LKpiCard label="Avg Pickup TAT" value={d1(k.avg_pickup)} badgeText="Cr→Pick" badgeVariant="B" cur={k.avg_pickup} prev={pk.avg_pickup} compact tight={filterSidebarOpen} />
              <LKpiCard label="Avg In-Transit" value={d1(k.avg_intransit)} badgeText="Pick→Del" badgeVariant="N" cur={k.avg_intransit} prev={pk.avg_intransit} compact tight={filterSidebarOpen} />
              <LKpiCard label="Avg Fulfilment" value={d1(k.avg_fulfilment)} badgeText="Cr→Del" badgeVariant="G" cur={k.avg_fulfilment} prev={pk.avg_fulfilment} compact tight={filterSidebarOpen} />
              <LKpiCard label="Avg RTO TAT" value={d1(k.avg_rto_tat)} badgeText="RTO days" badgeVariant="R" cur={k.avg_rto_tat} prev={pk.avg_rto_tat} compact tight={filterSidebarOpen} />
            </div>
          </div>
        )}

        {/* ── Monthly Trend + Courier TAT ── */}
        <LSectionTitle title="Monthly Trend" collapsed={secCollapsed['trend']} onToggle={() => toggleSec('trend')} />
        <div style={{ display: secCollapsed['trend'] ? 'none' : 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
              <div>
                <div style={chartTitle}>Shipment Trend</div>
                <div style={{ fontSize: 10, color: C.t3, marginTop: -8 }}>
                  {trendMetric === 'Qty' ? 'Total = all AWBs created on that date · Raw order volume per day' : 'Invoice value of all AWBs · RTO% by value'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ display: 'flex', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: 3, gap: 0 }}>
                  {['Qty','Value'].map(m => (
                    <button key={m} onClick={() => setTrendMetric(m)} style={{ fontSize: 10, padding: '2px 10px', borderRadius: 5, border: 'none', background: trendMetric === m ? C.acc : 'transparent', color: trendMetric === m ? '#000' : C.t3, cursor: 'pointer', fontWeight: trendMetric === m ? 700 : 500, fontFamily: 'var(--font)' }}>{m}</button>
                  ))}
                </div>
                <select value={trendGranularity} onChange={e => setTrendGranularity(e.target.value)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}>
                  {['Daily','Weekly','Monthly'].map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={trendData} margin={{ top: 4, right: -20, left: -30, bottom: 0 }}>
                <defs>
                  <linearGradient id="lgDel" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFD600" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#FFD600" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="lgRto" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.red.tx} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={C.red.tx} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.t3 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => trendMetric === 'Value' ? (v >= 100000 ? '₹'+(v/100000).toFixed(1)+'L' : v >= 1000 ? '₹'+(v/1000).toFixed(0)+'K' : '₹'+v) : (v >= 1000 ? (v/1000).toFixed(0)+'K' : v)} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={v => v + '%'} tick={{ fontSize: 10, fill: C.t3 }} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const get = key => payload.find(p => p.dataKey === key)?.value
                  return (
                    <div style={{ background: C.card, border: `1px solid ${C.border2}`, borderRadius: 8, padding: '6px 10px', fontSize: 11, color: C.t1, minWidth: 120 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
                      {trendMetric === 'Qty' ? <>
                          <div style={{ color: C.t1, fontWeight: 600 }}>Del % : {get('del_pct') ?? '—'}%</div>
                          <div style={{ color: C.t1, fontWeight: 600 }}>RTO % : {get('rto_pct') ?? '—'}%</div>
                          <div style={{ color: C.t2 }}>Total : {Number(get('total') ?? 0).toLocaleString('en-IN')}</div>
                        </> : <>
                        <div style={{ color: C.t1, fontWeight: 600 }}>Del % : {get('del_value_pct') ?? '—'}%</div>
                        <div style={{ color: C.t1, fontWeight: 600 }}>RTO % : {get('rto_value_pct') ?? '—'}%</div>
                        <div style={{ color: C.t2 }}>Total Value : ₹{Number(get('total_value') ?? 0).toLocaleString('en-IN')}</div>
                      </>}
                    </div>
                  )
                }} />
                {trendMetric === 'Qty' ? <>
                  <Line yAxisId="left" type="monotone" dataKey="total" name="Total" stroke={C.t3} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="del_pct" name="Del %" stroke="#E6A800" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="rto_pct" name="RTO %" stroke="#b91c1c" strokeWidth={1.5} strokeDasharray="3 2" dot={false} />
                </> : <>
                  <Area yAxisId="left" type="monotone" dataKey="total_value" name="Total Value" stroke="#E6A800" strokeWidth={2.5} fill="url(#lgDel)" dot={false} activeDot={{ r: 5 }} />
                  <Area yAxisId="left" type="monotone" dataKey="rto_value" name="RTO Value" stroke={C.red.tx} strokeWidth={2} fill="url(#lgRto)" dot={false} activeDot={{ r: 4 }} />
                  <Line yAxisId="right" type="monotone" dataKey="del_value_pct" name="Del %" stroke="#E6A800" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="rto_value_pct" name="RTO %" stroke="#b91c1c" strokeWidth={1.5} strokeDasharray="3 2" dot={false} />
                </>}
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, flexShrink: 0 }}>
              {trendMetric === 'Qty'
                ? [['#94939F','Total'],['#E6A800','Del %'],['#b91c1c','RTO %']].map(([color, label]) => (
                    <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: C.t2 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />{label}
                    </span>
                  ))
                : [['#E6A800','Total Value'],['#7A1A1A','RTO Value'],['#E6A800','Del %'],['#b91c1c','RTO %']].map(([color, label]) => (
                    <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: C.t2 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />{label}
                    </span>
                  ))
              }
            </div>
          </div>

          {/* Courier TAT */}
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, marginBottom: 6 }}>
              <div style={chartTitle}>Shipment Volume & TAT Trend</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['Daily','Weekly','Monthly'].map(g => (
                  <button key={g} onClick={() => setCourierTatGran(g)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: `1px solid ${courierTatGran === g ? C.acc : C.border}`, background: courierTatGran === g ? C.acc : C.card, color: courierTatGran === g ? '#000' : C.t2, cursor: 'pointer', fontWeight: courierTatGran === g ? 700 : 500, fontFamily: 'var(--font)' }}>{g}</button>
                ))}
              </div>
            </div>
            {(() => {
              // use byDay/byWeek/byMonth (overall, not per courier) for date-based X-axis
              const src = courierTatGran === 'Daily' ? (data?.byDay || []) : courierTatGran === 'Weekly' ? (data?.byWeek || []) : (data?.byMonth || [])
              // dedupe by label (week boundary issues can produce duplicate week labels)
              const deduped = Object.values(src.reduce((acc, d) => {
                if (!acc[d.label]) { acc[d.label] = { ...d, _count: 1 } }
                else {
                  acc[d.label].total = (acc[d.label].total || 0) + (d.total || 0)
                  ;['avg_processing_days','avg_pickup_days','avg_intransit_days','avg_fulfilment_days'].forEach(k => {
                    if (d[k] != null) { acc[d.label][k] = ((acc[d.label][k] || 0) * acc[d.label]._count + d[k]) / (acc[d.label]._count + 1) }
                  })
                  acc[d.label]._count++
                }
                return acc
              }, {}))
              const tatData = deduped.map(d => ({
                label: d.label,
                total: d.total || 0,
                avg_processing_days: d.avg_processing_days != null ? Math.round(d.avg_processing_days * 100) / 100 : null,
                avg_pickup_days: d.avg_pickup_days != null ? Math.round(d.avg_pickup_days * 100) / 100 : null,
                avg_intransit_days: d.avg_intransit_days != null ? Math.round(d.avg_intransit_days * 100) / 100 : null,
                avg_fulfilment_days: d.avg_fulfilment_days != null ? Math.round(d.avg_fulfilment_days * 100) / 100 : null,
              }))
              return (<>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={tatData} margin={{ top: 10, right: -20, left: -30, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.t3 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 9, fill: C.t3 }} tickFormatter={v => v >= 1000 ? (v/1000).toFixed(0)+'K' : v} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: C.t2 }} tickFormatter={v => v + 'd'} />
                <Tooltip
                  contentStyle={{ fontSize: 11, padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.t1 }}
                  itemStyle={{ color: C.t1, padding: '1px 0' }}
                  labelStyle={{ color: C.t1, fontWeight: 700, marginBottom: 3, fontSize: 11 }}
                  formatter={(value, name) => name.includes('Days') ? [value != null ? value + 'd' : '—', name] : [Number(value).toLocaleString('en-IN'), name]}
                />
                <Bar yAxisId="left" dataKey="total" name="Total Shipments" fill="#FFC107" opacity={0.85} radius={[3,3,0,0]} />
                <Line yAxisId="right" type="monotone" dataKey="avg_processing_days" name="Avg Processing Days" stroke="#333" strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="avg_pickup_days" name="Avg Pickup Days" stroke="#333" strokeWidth={1.5} strokeDasharray="2 3" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="avg_intransit_days" name="Avg Intransit Days" stroke="#333" strokeWidth={1.5} strokeDasharray="10 3" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="avg_fulfilment_days" name="Avg Fulfilment Days" stroke="#333" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap', flexShrink: 0 }}>
              {[['#FFC107','Total Shipments'],['#333','Avg Processing Days'],['#333','Avg Pickup Days'],['#333','Avg Intransit Days'],['#333','Avg Fulfilment Days']].map(([color, label]) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: C.t2 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />{label}
                </span>
              ))}
            </div>
              </>)
            })()}
          </div>
        </div>

        {/* ── Courier Performance Table ── */}
        <LSectionTitle title="Courier Performance" collapsed={secCollapsed['courier']} onToggle={() => toggleSec('courier')} />

<div style={{ display: secCollapsed['courier'] ? 'none' : 'grid', gridTemplateColumns: '1fr', gap: 14, minWidth: 0 }}>
          <div style={{ ...cardStyle, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={chartTitle}>Courier-wise Breakdown</div>
            <div style={{ display: 'inline-flex', border: `1.5px solid ${C.border2}`, borderRadius: 7, overflow: 'hidden' }}>
              {['Courier','Month'].map((v,i) => (
                <button key={v} onClick={() => setCView(v.toLowerCase())} style={{
                  padding: '4px 14px', border: 'none', borderLeft: i>0 ? `1.5px solid ${C.border2}` : 'none',
                  background: cView===v.toLowerCase() ? C.t1 : 'transparent', color: cView===v.toLowerCase() ? '#fff' : C.t2,
                  fontSize: 11.5, fontWeight: cView===v.toLowerCase() ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .15s'
                }}>{v}</button>
              ))}
            </div>
          </div>
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 420 }}>
            {(() => {
              const totalAll = byCourierData.reduce((s, r) => s + (r.total || 0), 0) || 1
              const COLS = [
                { key: 'courier_group', label: 'Courier', left: true, str: true },
                { key: '_volPct', label: 'Vol %' },
                { key: 'total', label: 'Total' },
                { key: '_delPct', label: 'Del %' },
                { key: '_rtoPct', label: 'RTO %' },
                { key: '_zrtoPct', label: 'Z-RTO %' },
                { key: '_cancPct', label: 'Canc %' },
                { key: '_fasrPct', label: 'FASR %' },
                { key: '_rasrPct', label: 'RASR %' },
                { key: 'avg_processing_days', label: 'Avg Processing', center: true },
                { key: 'avg_pickup_days', label: 'Avg Pickup', center: true },
                { key: 'avg_intransit_days', label: 'Avg S2D', center: true },
                { key: 'avg_fulfilment_days', label: 'Avg O2D', center: true },
                { key: 'avg_rto_tat_days', label: 'Avg RTO TAT', center: true },
                { key: 'avg_s2a_days', label: 'Avg S2A', center: true },
              ]
              const enriched = byCourierData.map(r => ({
                ...r,
                _volPct: +((r.total / totalAll) * 100).toFixed(2),
                _delPct: r.total ? +((r.delivered / r.total) * 100).toFixed(2) : 0,
                _rtoPct: r.total ? +((r.rto / r.total) * 100).toFixed(2) : 0,
                _zrtoPct: r.total ? +(((r.z_rto || 0) / r.total) * 100).toFixed(2) : 0,
                _cancPct: r.total ? +(((r.cancelled || 0) / r.total) * 100).toFixed(2) : 0,
                _fasrPct: r.ofd_total ? +((r.d1 / r.ofd_total) * 100).toFixed(2) : null,
                _rasrPct: r.ofd_total ? +(((r.rasr_num || 0) / r.ofd_total) * 100).toFixed(2) : null,
              }))
              const [sortCol, setSortCol] = [cSort?.col, (col) => setCSort(s => ({ col, dir: s?.col === col && s?.dir === 'desc' ? 'asc' : 'desc' }))]
              const sortDir = cSort?.dir || 'desc'
              const sorted = sortCol ? [...enriched].sort((a, b) => {
                const av = a[sortCol], bv = b[sortCol]
                if (av == null) return 1; if (bv == null) return -1
                if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
                return sortDir === 'asc' ? av - bv : bv - av
              }) : enriched
              const d = (v) => v != null ? (+v).toFixed(2) + 'd' : '—'
              // ── Month view ──────────────────────────────────
              const byMonthAll = (data?.byMonthAll || [])
              const monthTotalAll = byMonthAll.reduce((s,r) => s + (r.total||0), 0) || 1
              const enrichMonth = byMonthAll.map(r => ({
                ...r,
                _volPct: +((r.total / monthTotalAll) * 100).toFixed(2),
                _delPct: r.total ? +((r.delivered / r.total) * 100).toFixed(2) : 0,
                _rtoPct: r.total ? +((r.rto / r.total) * 100).toFixed(2) : 0,
                _zrtoPct: r.total ? +(((r.z_rto||0) / r.total) * 100).toFixed(2) : 0,
                _cancPct: r.total ? +(((r.cancelled||0) / r.total) * 100).toFixed(2) : 0,
                _fasrPct: r.ofd_total ? +((r.d1 / r.ofd_total) * 100).toFixed(2) : null,
                _rasrPct: r.ofd_total ? +(((r.rasr_num||0) / r.ofd_total) * 100).toFixed(2) : null,
              }))
              const byCourierMonth = (data?.byCourierMonth || [])
              const byCourierDay = (data?.byCourierDay || [])
              const byCourierWeek = (data?.byCourierWeek || [])
              // helper to build period breakdown table for daily/weekly/monthly courier views
              const periodRows = cView === 'daily' ? byCourierDay : cView === 'weekly' ? byCourierWeek : byCourierMonth
              const periodLabelKey = cView === 'monthly' ? 'month_label' : 'period_label'
              if (cView === 'daily' || cView === 'weekly' || cView === 'monthly') {
                const periods = [...new Set(periodRows.map(r => r[periodLabelKey]))].sort()
                const periodTotal = periodRows.reduce((s,r) => s+(r.total||0), 0) || 1
                return (
                  <div style={{ overflowX: 'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr style={{ borderBottom:`1.5px solid ${C.border}` }}>
                        <th style={{ padding:'9px 10px', textAlign:'left', color:C.t3, fontWeight:700, fontSize:9.5, letterSpacing:'.05em', textTransform:'uppercase', whiteSpace:'nowrap' }}>Courier</th>
                        {periods.map(p => (
                          <th key={p} colSpan={3} style={{ padding:'9px 10px', textAlign:'center', color:C.t3, fontWeight:700, fontSize:9.5, letterSpacing:'.05em', textTransform:'uppercase', whiteSpace:'nowrap', borderLeft:`1px solid ${C.border}` }}>{p}</th>
                        ))}
                      </tr>
                      <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                        <th style={{ padding:'4px 10px' }}></th>
                        {periods.map(p => (
                          ['Total','Del %','RTO %'].map(h => (
                            <th key={p+h} style={{ padding:'4px 8px', textAlign:'right', color:C.t3, fontWeight:600, fontSize:9, whiteSpace:'nowrap', borderLeft: h==='Total' ? `1px solid ${C.border}` : 'none' }}>{h}</th>
                          ))
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...new Set(periodRows.map(r => r.courier_group))].sort().map(cg => (
                        <tr key={cg} style={{ borderBottom:`1px solid ${C.border}` }}>
                          <td style={{ padding:'8px 10px', fontWeight:600, fontSize:11, whiteSpace:'nowrap' }}>{cg}</td>
                          {periods.map(p => {
                            const row = periodRows.find(r => r.courier_group === cg && r[periodLabelKey] === p)
                            const delPct = row?.total ? ((row.delivered/row.total)*100).toFixed(1)+'%' : '—'
                            const rtoPct = row?.total ? ((row.rto/row.total)*100).toFixed(1)+'%' : '—'
                            return ['total','del','rto'].map((f,fi) => (
                              <td key={p+f} style={{ padding:'8px 8px', textAlign:'right', fontSize:11, color: fi===1?C.green.tx:fi===2?C.red.tx:C.t1, borderLeft: fi===0?`1px solid ${C.border}`:'none' }}>
                                {fi===0 ? (row?.total||'—') : fi===1 ? delPct : rtoPct}
                              </td>
                            ))
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )
              }
              if (cView === 'month') {
                const tot = monthTotalAll
                const sumD = enrichMonth.reduce((s,r)=>s+(r.delivered||0),0)
                const sumR = enrichMonth.reduce((s,r)=>s+(r.rto||0),0)
                const sumZ = enrichMonth.reduce((s,r)=>s+(r.z_rto||0),0)
                const sumC = enrichMonth.reduce((s,r)=>s+(r.cancelled||0),0)
                const sumD1 = enrichMonth.reduce((s,r)=>s+(r.d1||0),0)
                const sumRN = enrichMonth.reduce((s,r)=>s+(r.rasr_num||0),0)
                const sumOfd = enrichMonth.reduce((s,r)=>s+(r.ofd_total||0),0)
                const wavgM = (key) => { const w = enrichMonth.reduce((s,r)=>s+(r[key]!=null?r[key]*r.total:0),0); return w/tot }
                return (
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr style={{ borderBottom:`1.5px solid ${C.border}` }}>
                        {['Month','Vol %','Total','Del %','RTO %','Z-RTO %','Canc %','FASR %','RASR %','Avg Processing','Avg Pickup','Avg S2D','Avg O2D','Avg RTO TAT','Avg S2A'].map((h,i) => (
                          <th key={h} style={{ padding:'9px 10px', textAlign:i===0?'left':'right', color:C.t3, fontWeight:700, fontSize:9.5, letterSpacing:'.05em', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {enrichMonth.map(r => {
                        const delColor = r._delPct>=80?'#16a34a':r._delPct>=60?'#d97706':'#dc2626'
                        const rtoColor = r._rtoPct<=3?'#16a34a':r._rtoPct<=7?'#d97706':'#dc2626'
                        const tatColor = (v,hi,lo) => v==null?C.t3:+v<=lo?'#16a34a':+v<=hi?'#d97706':'#dc2626'
                        return (
                          <tr key={r.month_label} style={{ borderBottom:`1px solid ${C.border}` }}>
                            <td style={{ padding:'9px 10px', color:C.t1, fontWeight:600, whiteSpace:'nowrap' }}>{r.month_label}</td>
                            <td style={{ padding:'9px 10px', textAlign:'right', color:C.t2, fontSize:11 }}>{r._volPct.toFixed(2)}%</td>
                            <td style={{ padding:'9px 10px', textAlign:'right', color:C.t1, fontWeight:600 }}>{n(r.total)}</td>
                            <td style={{ padding:'9px 10px', textAlign:'right', fontWeight:700, color:delColor, fontSize:11 }}>{r._delPct.toFixed(2)}%</td>
                            <td style={{ padding:'9px 10px', textAlign:'right', fontWeight:700, color:rtoColor, fontSize:11 }}>{r._rtoPct.toFixed(2)}%</td>
                            <td style={{ padding:'9px 10px', textAlign:'right', color:C.t2, fontSize:11 }}>{r._zrtoPct.toFixed(2)}%</td>
                            <td style={{ padding:'9px 10px', textAlign:'right', color:C.t2, fontSize:11 }}>{r._cancPct.toFixed(2)}%</td>
                            <td style={{ padding:'9px 10px', textAlign:'right', fontWeight:700, color:'#2563eb', fontSize:11 }}>{r._fasrPct!=null?r._fasrPct.toFixed(2)+'%':'—'}</td>
                            <td style={{ padding:'9px 10px', textAlign:'right', fontWeight:700, color:'#7c3aed', fontSize:11 }}>{r._rasrPct!=null?r._rasrPct.toFixed(2)+'%':'—'}</td>
                            <td style={{ padding:'9px 10px', textAlign:'right', color:tatColor(r.avg_processing_days,2,1), fontSize:11 }}>{d(r.avg_processing_days)}</td>
                            <td style={{ padding:'9px 10px', textAlign:'right', color:tatColor(r.avg_pickup_days,1,0.5), fontSize:11 }}>{d(r.avg_pickup_days)}</td>
                            <td style={{ padding:'9px 10px', textAlign:'right', color:tatColor(r.avg_intransit_days,4,2), fontSize:11 }}>{d(r.avg_intransit_days)}</td>
                            <td style={{ padding:'9px 10px', textAlign:'right', color:tatColor(r.avg_fulfilment_days,6,4), fontSize:11 }}>{d(r.avg_fulfilment_days)}</td>
                            <td style={{ padding:'9px 10px', textAlign:'right', color:tatColor(r.avg_rto_tat_days,10,5), fontSize:11 }}>{d(r.avg_rto_tat_days)}</td>
                            <td style={{ padding:'9px 10px', textAlign:'right', color:tatColor(r.avg_s2a_days,3,1.5), fontSize:11 }}>{d(r.avg_s2a_days)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop:`2px solid ${C.border}`, background:C.bg, fontWeight:700 }}>
                        <td style={{ padding:'9px 10px', color:C.t1, fontWeight:700 }}>Total</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:C.t2, fontSize:11 }}>100.00%</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:C.t1, fontWeight:700 }}>{n(tot)}</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:'#16a34a', fontWeight:700, fontSize:11 }}>{(sumD/tot*100).toFixed(2)}%</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:'#dc2626', fontWeight:700, fontSize:11 }}>{(sumR/tot*100).toFixed(2)}%</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:C.t2, fontSize:11 }}>{(sumZ/tot*100).toFixed(2)}%</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:C.t2, fontSize:11 }}>{(sumC/tot*100).toFixed(2)}%</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:'#2563eb', fontWeight:700, fontSize:11 }}>{sumOfd?(sumD1/sumOfd*100).toFixed(2)+'%':'—'}</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:'#7c3aed', fontWeight:700, fontSize:11 }}>{sumOfd?(sumRN/sumOfd*100).toFixed(2)+'%':'—'}</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:C.t2, fontSize:11 }}>{wavgM('avg_processing_days').toFixed(2)}d</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:C.t2, fontSize:11 }}>{wavgM('avg_pickup_days').toFixed(2)}d</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:C.t2, fontSize:11 }}>{wavgM('avg_intransit_days').toFixed(2)}d</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:C.t2, fontSize:11 }}>{wavgM('avg_fulfilment_days').toFixed(2)}d</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:C.t2, fontSize:11 }}>{wavgM('avg_rto_tat_days').toFixed(2)}d</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:C.t2, fontSize:11 }}>{wavgM('avg_s2a_days').toFixed(2)}d</td>
                      </tr>
                    </tfoot>
                  </table>
                )
              }
              return (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 4 }}>
                    <tr style={{ borderBottom: `1.5px solid ${C.border}`, background: C.bg }}>
                      {COLS.map((col, ci) => (
                        <th key={col.key} onClick={() => setSortCol(col.key)} style={{ padding: '6px 7px', textAlign: col.left ? 'left' : col.center ? 'center' : 'right', color: C.t1, fontWeight: 700, fontSize: 9.5, letterSpacing: 0.4, textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', borderBottom: `1.5px solid ${C.border}`, background: C.bg, ...(ci === 0 ? { position: 'sticky', left: 0, zIndex: 5 } : {}) }}>
                          {col.label}{sortCol === col.key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r) => {
                      const _totAll = enriched.reduce((s,r) => s + r.total, 0) || 1
                      const _sumR = enriched.reduce((s,r) => s + (r.rto||0), 0)
                      const avgRtoPct = _sumR / _totAll * 100
                      const logo = COURIER_LOGOS[r.courier_group]
                      const color = COURIER_COLORS[r.courier_group] || C.t3
                      const rtoColor = r._rtoPct > avgRtoPct ? '#dc2626' : C.t1
                      const tatColor = () => C.t1
                      return (
                        <Fragment key={r.courier_group}>
                        <tr style={{ borderBottom: cExpanded[r.courier_group] ? 'none' : `1px solid ${C.border}` }}>
                          <td style={{ padding: '6px 7px', minWidth: 160, position: 'sticky', left: 0, background: C.card, zIndex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <span onClick={() => setCExpanded(e => ({ ...e, [r.courier_group]: !e[r.courier_group] }))} style={{ fontSize:9, color:C.t3, display:'inline-block', transform:cExpanded[r.courier_group]?'rotate(90deg)':'rotate(0deg)', transition:'transform .15s', cursor:'pointer', flexShrink:0 }}>▶</span>
                              {logo
                                ? <img src={logo} alt="" style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 4, flexShrink: 0, background: '#fff', border: `1px solid ${C.border}` }} onError={e => { e.currentTarget.style.display = 'none' }} />
                                : <span style={{ width: 28, height: 28, borderRadius: 4, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{r.courier_group.charAt(0)}</span>
                              }
                              <span style={{ color: C.t1, fontWeight: 600 }}>{r.courier_group}</span>
                            </div>
                          </td>
                          <td style={{ padding: '6px 7px', textAlign: 'right', color: C.t1, fontSize: 11 }}>{r._volPct.toFixed(2)}%</td>
                          <td style={{ padding: '6px 7px', textAlign: 'right', color: C.t1 }}>{n(r.total)}</td>
                          <td style={{ padding: '6px 7px', textAlign: 'right', color: C.t1, fontSize: 11 }}>{r._delPct.toFixed(2)}%</td>
                          <td style={{ padding: '6px 7px', textAlign: 'right', color: rtoColor, fontSize: 11 }}>{r._rtoPct.toFixed(2)}%</td>
                          <td style={{ padding: '6px 7px', textAlign: 'right', color: C.t1, fontSize: 11 }}>{r._zrtoPct.toFixed(2)}%</td>
                          <td style={{ padding: '6px 7px', textAlign: 'right', color: C.t1, fontSize: 11 }}>{r._cancPct.toFixed(2)}%</td>
                          <td style={{ padding: '6px 7px', textAlign: 'right', color: C.t1, fontSize: 11 }}>{r._fasrPct != null ? r._fasrPct.toFixed(2) + '%' : '—'}</td>
                          <td style={{ padding: '6px 7px', textAlign: 'right', color: C.t1, fontSize: 11 }}>{r._rasrPct != null ? r._rasrPct.toFixed(2) + '%' : '—'}</td>
                          <td style={{ padding: '6px 7px', textAlign: 'center', color: C.t1, fontSize: 11 }}>{d(r.avg_processing_days)}</td>
                          <td style={{ padding: '6px 7px', textAlign: 'center', color: C.t1, fontSize: 11 }}>{d(r.avg_pickup_days)}</td>
                          <td style={{ padding: '6px 7px', textAlign: 'center', color: C.t1, fontSize: 11 }}>{d(r.avg_intransit_days)}</td>
                          <td style={{ padding: '6px 7px', textAlign: 'center', color: C.t1, fontSize: 11 }}>{d(r.avg_fulfilment_days)}</td>
                          <td style={{ padding: '6px 7px', textAlign: 'center', color: C.t1, fontSize: 11 }}>{d(r.avg_rto_tat_days)}</td>
                          <td style={{ padding: '6px 7px', textAlign: 'center', color: C.t1, fontSize: 11 }}>{d(r.avg_s2a_days)}</td>
                        </tr>
                        {cExpanded[r.courier_group] && byCourierMonth.filter(m => m.courier_group === r.courier_group).sort((a,b) => a.month_dt < b.month_dt ? -1 : 1).map(m => {
                          const _delPct = m.total ? +((m.delivered/m.total)*100).toFixed(2) : 0
                          const _rtoPct = m.total ? +((m.rto/m.total)*100).toFixed(2) : 0
                          const _zrtoPct = m.total ? +(((m.z_rto||0)/m.total)*100).toFixed(2) : 0
                          const _cancPct = m.total ? +(((m.cancelled||0)/m.total)*100).toFixed(2) : 0
                          const _fasrPct = m.ofd_total ? +((m.d1/m.ofd_total)*100).toFixed(2) : null
                          const _rasrPct = m.ofd_total ? +(((m.rasr_num||0)/m.ofd_total)*100).toFixed(2) : null
                          const mVolPct = +((m.total/totalAll)*100).toFixed(2)
                          const mRtoColor = _rtoPct > avgRtoPct ? '#dc2626' : C.t1
                          return (
                            <tr key={m.month_label} style={{ borderBottom:`1px solid ${C.border}`, background:'#FAFAF8' }}>
                              <td style={{ padding:'4px 7px 4px 46px', color:C.t2, fontSize:11, whiteSpace:'nowrap', position:'sticky', left:0, background:'#FAFAF8', zIndex:1 }}>{m.month_label}</td>
                              <td style={{ padding:'4px 7px', textAlign:'right', color:C.t1, fontSize:11 }}>{mVolPct.toFixed(2)}%</td>
                              <td style={{ padding:'4px 7px', textAlign:'right', color:C.t1, fontSize:11 }}>{n(m.total)}</td>
                              <td style={{ padding:'4px 7px', textAlign:'right', color:C.t1, fontSize:11 }}>{_delPct.toFixed(2)}%</td>
                              <td style={{ padding:'4px 7px', textAlign:'right', color:mRtoColor, fontSize:11 }}>{_rtoPct.toFixed(2)}%</td>
                              <td style={{ padding:'4px 7px', textAlign:'right', color:C.t1, fontSize:11 }}>{_zrtoPct.toFixed(2)}%</td>
                              <td style={{ padding:'4px 7px', textAlign:'right', color:C.t1, fontSize:11 }}>{_cancPct.toFixed(2)}%</td>
                              <td style={{ padding:'4px 7px', textAlign:'right', color:C.t1, fontSize:11 }}>{_fasrPct!=null?_fasrPct.toFixed(2)+'%':'—'}</td>
                              <td style={{ padding:'4px 7px', textAlign:'right', color:C.t1, fontSize:11 }}>{_rasrPct!=null?_rasrPct.toFixed(2)+'%':'—'}</td>
                              <td style={{ padding:'4px 7px', textAlign:'center', color:C.t1, fontSize:11 }}>{d(m.avg_processing_days)}</td>
                              <td style={{ padding:'4px 7px', textAlign:'center', color:C.t1, fontSize:11 }}>{d(m.avg_pickup_days)}</td>
                              <td style={{ padding:'4px 7px', textAlign:'center', color:C.t1, fontSize:11 }}>{d(m.avg_intransit_days)}</td>
                              <td style={{ padding:'4px 7px', textAlign:'center', color:C.t1, fontSize:11 }}>{d(m.avg_fulfilment_days)}</td>
                              <td style={{ padding:'4px 7px', textAlign:'center', color:C.t1, fontSize:11 }}>{d(m.avg_rto_tat_days)}</td>
                              <td style={{ padding:'4px 7px', textAlign:'center', color:C.t1, fontSize:11 }}>{d(m.avg_s2a_days)}</td>
                            </tr>
                          )
                        })}
                        </Fragment>
                      )
                    })}
                    </tbody>
                  <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 4 }}>
                    {(() => {
                      const tot = enriched.reduce((s,r) => s + r.total, 0) || 1
                      const sumD = enriched.reduce((s,r) => s + (r.delivered||0), 0)
                      const sumR = enriched.reduce((s,r) => s + (r.rto||0), 0)
                      const sumZ = enriched.reduce((s,r) => s + (r.z_rto||0), 0)
                      const sumC = enriched.reduce((s,r) => s + (r.cancelled||0), 0)
                      const sumD1 = enriched.reduce((s,r) => s + (r.d1||0), 0)
                      const sumRN = enriched.reduce((s,r) => s + (r.rasr_num||0), 0)
                      const sumOfd = enriched.reduce((s,r) => s + (r.ofd_total||0), 0)
                      const wavg = (key) => { const w = enriched.reduce((s,r) => s + (r[key]!=null ? r[key]*r.total : 0),0); return w/tot }
                      return (
                        <tr style={{ borderTop: `2px solid ${C.border}`, background: C.bg, fontWeight: 700 }}>
                          <td style={{ padding: '6px 7px', color: C.t1, fontWeight: 700, position: 'sticky', left: 0, background: C.bg, zIndex: 1 }}>Total</td>
                          <td style={{ padding: '6px 7px', textAlign: 'right', color: C.t1, fontSize: 11 }}>100.00%</td>
                          <td style={{ padding: '6px 7px', textAlign: 'right', color: C.t1 }}>{n(tot)}</td>
                          <td style={{ padding: '6px 7px', textAlign: 'right', color: C.t1, fontSize: 11 }}>{(sumD/tot*100).toFixed(2)}%</td>
                          <td style={{ padding: '6px 7px', textAlign: 'right', color: C.t1, fontSize: 11 }}>{(sumR/tot*100).toFixed(2)}%</td>
                          <td style={{ padding: '6px 7px', textAlign: 'right', color: C.t1, fontSize: 11 }}>{(sumZ/tot*100).toFixed(2)}%</td>
                          <td style={{ padding: '6px 7px', textAlign: 'right', color: C.t1, fontSize: 11 }}>{(sumC/tot*100).toFixed(2)}%</td>
                          <td style={{ padding: '6px 7px', textAlign: 'right', color: C.t1, fontSize: 11 }}>{sumOfd ? (sumD1/sumOfd*100).toFixed(2)+'%' : '—'}</td>
                          <td style={{ padding: '6px 7px', textAlign: 'right', color: C.t1, fontSize: 11 }}>{sumOfd ? (sumRN/sumOfd*100).toFixed(2)+'%' : '—'}</td>
                          <td style={{ padding: '6px 7px', textAlign: 'center', color: C.t1, fontSize: 11 }}>{wavg('avg_processing_days').toFixed(2)}d</td>
                          <td style={{ padding: '6px 7px', textAlign: 'center', color: C.t1, fontSize: 11 }}>{wavg('avg_pickup_days').toFixed(2)}d</td>
                          <td style={{ padding: '6px 7px', textAlign: 'center', color: C.t1, fontSize: 11 }}>{wavg('avg_intransit_days').toFixed(2)}d</td>
                          <td style={{ padding: '6px 7px', textAlign: 'center', color: C.t1, fontSize: 11 }}>{wavg('avg_fulfilment_days').toFixed(2)}d</td>
                          <td style={{ padding: '6px 7px', textAlign: 'center', color: C.t1, fontSize: 11 }}>{wavg('avg_rto_tat_days').toFixed(2)}d</td>
                          <td style={{ padding: '6px 7px', textAlign: 'center', color: C.t1, fontSize: 11 }}>{wavg('avg_s2a_days').toFixed(2)}d</td>
                        </tr>
                      )
                    })()}
                  </tfoot>
                </table>
              )
            })()}
          </div>
        </div>
        </div>

        {/* ── Payment Analytics — removed ── */}
        {(() => { return null;
          const pd = (data?.byPaymentDetail || [])
          const PREPAID = pd.find(r => r.payment_mode === 'PREPAID') || {}
          const COD = pd.find(r => r.payment_mode === 'COD') || {}
          const totalAll = pd.reduce((s,r) => s+(r.total||0),0) || 1

          const pmRaw = payTrendGran === 'Daily' ? (data?.byPaymentDay || []) : payTrendGran === 'Weekly' ? (data?.byPaymentWeek || []) : (data?.byPaymentMonth || [])
          const periods = [...new Set(pmRaw.map(r => r.period_label))]
          const trendData = periods.map(m => {
            const p = pmRaw.find(r => r.period_label===m && r.payment_mode==='PREPAID') || {}
            const c = pmRaw.find(r => r.period_label===m && r.payment_mode==='COD') || {}
            return {
              label: m,
              PREPAID_total: p.total||0, COD_total: c.total||0,
              PREPAID_del: p.del_pct||0, COD_del: c.del_pct||0,
              PREPAID_rto: p.rto_pct||0, COD_rto: c.rto_pct||0,
              PREPAID_o2d: p.avg_fulfilment_days||null, COD_o2d: c.avg_fulfilment_days||null,
              PREPAID_proc: p.avg_processing_days||null, COD_proc: c.avg_processing_days||null,
            }
          })

          const prepaidDelPct = PREPAID.total ? +((PREPAID.delivered/PREPAID.total)*100).toFixed(1) : 0
          const codDelPct = COD.total ? +((COD.delivered/COD.total)*100).toFixed(1) : 0
          const prepaidRtoPct = PREPAID.total ? +((PREPAID.rto/PREPAID.total)*100).toFixed(1) : 0
          const codRtoPct = COD.total ? +((COD.rto/COD.total)*100).toFixed(1) : 0
          const prepaidVolPct = +((PREPAID.total||0)/totalAll*100).toFixed(1)
          const codVolPct = +((COD.total||0)/totalAll*100).toFixed(1)

          const donutData = [
            { name: 'PREPAID', value: PREPAID.total||0, color: '#2563eb' },
            { name: 'COD', value: COD.total||0, color: '#F59E0B' },
          ]

          return (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '280px 1fr', gap: 14, alignItems: 'stretch' }}>

              {/* Left: Donut + 3 KPIs beside it */}
              <div style={cardStyle}>
                <div style={chartTitle}>Payment Split</div>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={44} outerRadius={68} dataKey="value" paddingAngle={3}>
                      {donutData.map((d,i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v,n) => [v.toLocaleString('en-IN'), n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 12 }}>
                  {donutData.map(d => (
                    <span key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: C.t2, fontWeight: 700 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: d.color, display: 'inline-block' }} />{d.name}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: '#2563eb', fontWeight: 700, minWidth: 52, textAlign: 'right' }}>PREPAID</span>
                  <span style={{ fontSize: 10, color: '#F59E0B', fontWeight: 700, minWidth: 52, textAlign: 'right' }}>COD</span>
                </div>
                {[
                  { label: 'Shipments', prepaid: (PREPAID.total||0).toLocaleString('en-IN'), cod: (COD.total||0).toLocaleString('en-IN') },
                  { label: 'Delivered %', prepaid: prepaidDelPct+'%', cod: codDelPct+'%', pColor: '#16a34a', cColor: '#d97706' },
                  { label: 'RTO %', prepaid: prepaidRtoPct+'%', cod: codRtoPct+'%', pColor: '#16a34a', cColor: '#dc2626' },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: C.t3, fontWeight: 600 }}>{row.label}</span>
                    <div style={{ display: 'flex', gap: 14 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: row.pColor||C.t1, minWidth: 52, textAlign: 'right' }}>{row.prepaid}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: row.cColor||C.t1, minWidth: 52, textAlign: 'right' }}>{row.cod}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Right: Rich trend chart */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={chartTitle}>PREPAID vs COD Trend</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {['Daily','Weekly','Monthly'].map(g => (
                      <button key={g} onClick={() => setPayTrendGran(g)} style={{ fontSize: 10.5, padding: '3px 10px', borderRadius: 6, border: `1px solid ${payTrendGran===g ? C.acc : C.border}`, background: payTrendGran===g ? C.acl : 'transparent', color: payTrendGran===g ? C.t1 : C.t2, cursor: 'pointer', fontWeight: payTrendGran===g ? 700 : 500, fontFamily: 'var(--font)', transition: 'all .15s' }}>{g}</button>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.t3, marginBottom: 8 }}>Del % & RTO % by payment mode · Shipments (bars)</div>
                <ResponsiveContainer width="100%" height={340}>
                  <ComposedChart data={trendData} margin={{ top: 4, right: 44, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="pmPrepaidGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.12}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="pmCodGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.12}/>
                        <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.t3 }} />
                    <YAxis yAxisId="cnt" tick={{ fontSize: 9, fill: C.t3 }} tickFormatter={v => v>=1000?(v/1000).toFixed(0)+'K':v} />
                    <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 9, fill: C.t3 }} tickFormatter={v => v+'%'} />
                    <YAxis yAxisId="days" orientation="right" hide />
                    <Tooltip content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const get = key => payload.find(p => p.dataKey===key)?.value
                      const d = v => v != null ? (+v).toFixed(2)+'d' : '—'
                      return (
                        <div style={{ background: C.card, border: `1px solid ${C.border2}`, borderRadius: 8, padding: '10px 14px', fontSize: 11.5, minWidth: 200 }}>
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div style={{ color: '#2563eb', fontWeight: 600 }}>PREPAID · {(get('PREPAID_total')||0).toLocaleString('en-IN')} ships</div>
                            <div style={{ color: '#16a34a', marginLeft: 8 }}>Del %: {get('PREPAID_del')}%</div>
                            <div style={{ color: '#dc2626', marginLeft: 8 }}>RTO %: {get('PREPAID_rto')}%</div>
                            <div style={{ color: '#7c3aed', marginLeft: 8 }}>Avg O2D: {d(get('PREPAID_o2d'))}</div>
                            <div style={{ color: '#0891b2', marginLeft: 8 }}>Avg Processing: {d(get('PREPAID_proc'))}</div>
                            <div style={{ color: '#F59E0B', fontWeight: 600, marginTop: 4 }}>COD · {(get('COD_total')||0).toLocaleString('en-IN')} ships</div>
                            <div style={{ color: '#16a34a', marginLeft: 8 }}>Del %: {get('COD_del')}%</div>
                            <div style={{ color: '#dc2626', marginLeft: 8 }}>RTO %: {get('COD_rto')}%</div>
                            <div style={{ color: '#a78bfa', marginLeft: 8 }}>Avg O2D: {d(get('COD_o2d'))}</div>
                            <div style={{ color: '#67e8f9', marginLeft: 8 }}>Avg Processing: {d(get('COD_proc'))}</div>
                          </div>
                        </div>
                      )
                    }} />
                    <Bar yAxisId="cnt" dataKey="PREPAID_total" name="PREPAID Ships" fill="#2563eb" opacity={0.25} radius={[2,2,0,0]} barSize={12} />
                    <Bar yAxisId="cnt" dataKey="COD_total" name="COD Ships" fill="#F59E0B" opacity={0.35} radius={[2,2,0,0]} barSize={12} />
                    <Line yAxisId="pct" type="monotone" dataKey="PREPAID_del" name="PREPAID Del%" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3, fill: '#2563eb' }} activeDot={{ r: 5 }} />
                    <Line yAxisId="pct" type="monotone" dataKey="COD_del" name="COD Del%" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 3, fill: '#F59E0B' }} activeDot={{ r: 5 }} />
                    <Line yAxisId="pct" type="monotone" dataKey="PREPAID_rto" name="PREPAID RTO%" stroke="#93c5fd" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} />
                    <Line yAxisId="pct" type="monotone" dataKey="COD_rto" name="COD RTO%" stroke="#fca5a5" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} />
                    <Line yAxisId="days" type="monotone" dataKey="PREPAID_o2d" name="PREPAID Avg O2D" stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="6 2" dot={{ r: 2 }} />
                    <Line yAxisId="days" type="monotone" dataKey="COD_o2d" name="COD Avg O2D" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="6 2" dot={{ r: 2 }} />
                    <Line yAxisId="days" type="monotone" dataKey="PREPAID_proc" name="PREPAID Avg Processing" stroke="#0891b2" strokeWidth={1.5} strokeDasharray="2 3" dot={{ r: 2 }} />
                    <Line yAxisId="days" type="monotone" dataKey="COD_proc" name="COD Avg Processing" stroke="#67e8f9" strokeWidth={1.5} strokeDasharray="2 3" dot={{ r: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  {[['#2563eb','PREPAID Del%'],['#F59E0B','COD Del%'],['#93c5fd','PREPAID RTO%'],['#fca5a5','COD RTO%'],['#7c3aed','PREPAID O2D'],['#a78bfa','COD O2D'],['#0891b2','PREPAID Proc'],['#67e8f9','COD Proc']].map(([color,label]) => (
                    <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: C.t2 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />{label}
                    </span>
                  ))}
                </div>
              </div>

            </div>
          )
        })()}

        {/* ── Operations Sections ── */}
        {(() => {
        const pct1 = (a, b) => b ? ((a / b) * 100).toFixed(1) + '%' : '—'
        const d1 = v => v != null ? v.toFixed(1) + 'd' : '—'

        const pickupPending5 = k.pickup_pending || 0
        const rto10plus = k.rto_10plus || 0
        const eddBreached = k.edd_breached || 0

        const byCourier = data.byCourier || []

        const tatKpis = [
          { label: 'Avg Processing Time', value: d1(k.avg_processing), sub: 'Order → Pickup Scan' },
          { label: 'Avg Pickup TAT', value: d1(k.avg_pickup), sub: 'Order → Picked Up' },
          { label: 'Avg In-Transit', value: d1(k.avg_intransit), sub: 'Pickup → Delivery' },
          { label: 'Avg Fulfillment', value: d1(k.avg_fulfilment), sub: 'Order → Delivered' },
          { label: 'Avg RTO TAT', value: d1(k.avg_rto_tat), sub: 'RTO Mark → RTO Delivered' },
          { label: 'Avg Scan to Attempt', value: d1(k.avg_s2a), sub: 'Pickup → 1st OFD' },
          { label: 'Avg Committed SLA', value: d1(k.avg_sla), sub: 'Promised delivery days' },
        ]

        const qKpis = [
          // "of delivered" — a different base than the "FASR %" card above (delivered_1attempt /
          // total_ofd_attempts), so the two cards will show different %s for the same numerator.
          // Labeled explicitly here to avoid reading as a contradiction.
          { label: '1st Attempt Delivery', value: pct1(k.delivered_1attempt, k.delivered), sub: `${(k.delivered_1attempt||0).toLocaleString('en-IN')} shipments · % of delivered` },
          { label: 'Multi Attempt Delivery', value: pct1(k.delivered_multi, k.delivered), sub: `${(k.delivered_multi||0).toLocaleString('en-IN')} shipments` },
          { label: 'Zero Attempt RTO', value: pct1(k.z_rto, k.rto), sub: `${(k.z_rto||0).toLocaleString('en-IN')} shipments` },
          { label: 'On-Time Delivery', value: k.avg_sla == null ? '—' : pct1(k.on_time, k.delivered), sub: k.avg_sla == null ? 'No SLA data for this range' : `${(k.on_time||0).toLocaleString('en-IN')} on time` },
          { label: 'SLA Breach', value: k.avg_sla == null ? '—' : pct1(k.sla_breach, k.total_shipments), sub: k.avg_sla == null ? 'No SLA data for this range' : `${(k.sla_breach||0).toLocaleString('en-IN')} breached` },
          { label: 'Lost & Damaged', value: (k.lost_damaged||0).toLocaleString('en-IN'), sub: 'Total count' },
        ]

        const ageingKpis = [
          { label: 'Pickup Pending', value: (pickupPending5||0).toLocaleString('en-IN'), sub: 'Currently pending pickup' },
          { label: 'EDD Breached', value: (eddBreached||0).toLocaleString('en-IN'), sub: 'Past EDD, not delivered' },
          { label: 'RTO Undelivered 10d+', value: (rto10plus||0).toLocaleString('en-IN'), sub: 'RTO pending > 10 days' },
          { label: 'Critical Stuck', value: (k.critical_stuck||0).toLocaleString('en-IN'), sub: 'In-transit > EDD+5d' },
        ]

        const opsCardStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 3 }
        const opsLabelStyle = { fontSize: 9.5, color: C.t3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
        const opsValStyle = { fontSize: 20, fontWeight: 700, color: C.t1, letterSpacing: '-0.5px', lineHeight: 1.1 }
        const opsSubStyle = { fontSize: 10.5, color: C.t3 }

        const thStyle2 = { fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.04em', padding: '7px 10px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', textAlign: 'right' }
        const thL2 = { ...thStyle2, textAlign: 'left' }
        const tdStyle2 = { fontSize: 11.5, color: C.t1, padding: '6px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', whiteSpace: 'nowrap' }
        const tdL2 = { ...tdStyle2, textAlign: 'left', fontWeight: 600 }
        const tableCard2 = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }
        const tableTitle2 = { fontSize: 13, fontWeight: 700, color: C.t1, padding: '12px 14px 10px', borderBottom: `1px solid ${C.border}` }

        const byZone2 = data.byZoneDetail || []

        return (
          <>
            {/* TAT Bucket Analysis */}
            {(() => {
              const tatByCourier = data.tatByCourier || []
              const tatByFacility = (data.tatByFacility || []).filter(r => r.facility && r.facility.trim())
              const pctB = (v, total) => total ? ((v/total)*100).toFixed(1)+'%' : '—'

              // totals rows
              const facTotals = tatByFacility.reduce((acc, r) => {
                acc.total += r.total||0; acc.proc_0_12h += r.proc_0_12h||0; acc.proc_12_24h += r.proc_12_24h||0; acc.proc_24_48h += r.proc_24_48h||0; acc.proc_48plus += r.proc_48plus||0
                acc.ord_0_1 += r.ord_0_1||0; acc.ord_2_3 += r.ord_2_3||0; acc.ord_4_5 += r.ord_4_5||0; acc.ord_5plus += r.ord_5plus||0
                return acc
              }, { total:0, proc_0_12h:0, proc_12_24h:0, proc_24_48h:0, proc_48plus:0, ord_0_1:0, ord_2_3:0, ord_4_5:0, ord_5plus:0 })
              const courierTotals = tatByCourier.reduce((acc, r) => {
                acc.total += r.total||0; acc.delivered += r.delivered||0; acc.bucket_0_1 += r.bucket_0_1||0; acc.bucket_2_3 += r.bucket_2_3||0; acc.bucket_4_5 += r.bucket_4_5||0; acc.bucket_5plus += r.bucket_5plus||0
                return acc
              }, { total:0, delivered:0, bucket_0_1:0, bucket_2_3:0, bucket_4_5:0, bucket_5plus:0 })

              const BOX_H = 320
              const thS = { fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.05em', padding: '8px 10px', borderBottom: `1.5px solid ${C.border}`, whiteSpace: 'nowrap', textAlign: 'right', background: C.card }
              const thL = { ...thS, textAlign: 'left' }
              const tdS = { fontSize: 12, color: C.t2, padding: '7px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', whiteSpace: 'nowrap' }
              const tdL = { ...tdS, textAlign: 'left', fontWeight: 600, color: C.t1 }
              const totalRowS = { fontSize: 12, fontWeight: 700, color: C.t1, padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', background: C.bg }
              const totalRowL = { ...totalRowS, textAlign: 'left' }

              return (
                <>
                  <LSectionTitle title="TAT Bucket Analysis" collapsed={secCollapsed['tatbucket']} onToggle={() => toggleSec('tatbucket')} />
                  <div style={{ display: secCollapsed['tatbucket'] ? 'none' : 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 14 }}>

                    {/* Table 1: Order → Pickup by Facility */}
                    {(() => { const cw = ['40%','15%','15%','15%','15%']; const t1=(facTotals.proc_0_12h+facTotals.proc_12_24h+facTotals.proc_24_48h+facTotals.proc_48plus); return (
                    <div style={{ ...tableCard2, height: 340 }}>
                      <div style={tableTitle2}>Order → Pickup <span style={{ fontWeight: 500, color: C.t3, fontSize: 12 }}>(by Facility)</span></div>
                      <div style={{ flex: 1, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                          <colgroup>{cw.map((w,i)=><col key={i} style={{width:w}}/>)}</colgroup>
                          <thead><tr style={{ background: C.bg }}>
                            <th style={{ ...thL, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}>Facility</th>
                            <th style={{ ...thS, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}>0-12h</th>
                            <th style={{ ...thS, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}>12-24h</th>
                            <th style={{ ...thS, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}>24-48h</th>
                            <th style={{ ...thS, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}>48h+</th>
                          </tr></thead>
                          <tbody>
                            {tatByFacility.map((row, ri, arr) => {
                              const tot = (row.proc_0_12h||0)+(row.proc_12_24h||0)+(row.proc_24_48h||0)+(row.proc_48plus||0)
                              const isLast = ri === arr.length - 1
                              return (
                                <tr key={row.facility}>
                                  <td style={{ ...tdL, ...(isLast ? { borderBottom: 'none' } : {}) }}>{row.facility}</td>
                                  {[row.proc_0_12h, row.proc_12_24h, row.proc_24_48h, row.proc_48plus].map((v, ci) => (
                                    <td key={ci} style={{ ...tdS, color: (v/tot)>0.2?'#dc2626':C.t2, fontWeight: (v/tot)>0.2?700:400, ...(isLast ? { borderBottom: 'none' } : {}) }}>{pctB(v, tot)}</td>
                                  ))}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', borderTop: `1.5px solid ${C.border}`, background: C.bg }}>
                        <colgroup>{cw.map((w,i)=><col key={i} style={{width:w}}/>)}</colgroup>
                        <tbody><tr>
                          <td style={totalRowL}>Total</td>
                          <td style={totalRowS}>{pctB(facTotals.proc_0_12h,t1)}</td>
                          <td style={totalRowS}>{pctB(facTotals.proc_12_24h,t1)}</td>
                          <td style={totalRowS}>{pctB(facTotals.proc_24_48h,t1)}</td>
                          <td style={totalRowS}>{pctB(facTotals.proc_48plus,t1)}</td>
                        </tr></tbody>
                      </table>
                    </div>
                    ) })()}

                    {/* Table 2: Pickup → Delivery by Courier (scrollable tbody, sticky tfoot) */}
                    <div style={{ ...tableCard2, height: 340 }}>
                      <div style={tableTitle2}>Pickup → Delivery <span style={{ fontWeight: 500, color: C.t3, fontSize: 12 }}>(by Courier)</span></div>
                      <div style={{ flex: 1, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                          <colgroup><col style={{ width: '30%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} /></colgroup>
                          <thead><tr style={{ background: C.bg }}>
                            <th style={{ ...thL, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}>Courier</th>
                            <th style={{ ...thS, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}>Del</th>
                            <th style={{ ...thS, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}>0-1d</th>
                            <th style={{ ...thS, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}>2-3d</th>
                            <th style={{ ...thS, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}>4-5d</th>
                            <th style={{ ...thS, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}>5+d</th>
                          </tr></thead>
                          <tbody>
                            {tatByCourier.map((row) => {
                              const tot = row.delivered || 0
                              return (
                                <tr key={row.courier_group}>
                                  <td style={tdL}>{row.courier_group}</td>
                                  <td style={tdS}>{tot.toLocaleString('en-IN')}</td>
                                  {[row.bucket_0_1, row.bucket_2_3, row.bucket_4_5, row.bucket_5plus].map((v, ci) => (
                                    <td key={ci} style={{ ...tdS, color: (v/tot)>0.2?'#dc2626':C.t2, fontWeight: (v/tot)>0.2?700:400 }}>{pctB(v, tot)}</td>
                                  ))}
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ borderTop: `1.5px solid ${C.border}`, background: C.bg }}>
                              <td style={{ ...totalRowL, position: 'sticky', bottom: 0, background: C.bg }}>Total</td>
                              <td style={{ ...totalRowS, position: 'sticky', bottom: 0, background: C.bg }}>{courierTotals.delivered.toLocaleString('en-IN')}</td>
                              <td style={{ ...totalRowS, position: 'sticky', bottom: 0, background: C.bg }}>{pctB(courierTotals.bucket_0_1, courierTotals.delivered)}</td>
                              <td style={{ ...totalRowS, position: 'sticky', bottom: 0, background: C.bg }}>{pctB(courierTotals.bucket_2_3, courierTotals.delivered)}</td>
                              <td style={{ ...totalRowS, position: 'sticky', bottom: 0, background: C.bg }}>{pctB(courierTotals.bucket_4_5, courierTotals.delivered)}</td>
                              <td style={{ ...totalRowS, position: 'sticky', bottom: 0, background: C.bg }}>{pctB(courierTotals.bucket_5plus, courierTotals.delivered)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>

                    {/* Table 3: Processing → Pickup by Facility */}
                    {(() => { const cw = ['40%','15%','15%','15%','15%']; const t3=(facTotals.ord_0_1+facTotals.ord_2_3+facTotals.ord_4_5+facTotals.ord_5plus); return (
                    <div style={{ ...tableCard2, height: 340 }}>
                      <div style={tableTitle2}>Processing → Pickup <span style={{ fontWeight: 400, color: C.t3 }}>(by Facility)</span></div>
                      <div style={{ flex: 1, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                          <colgroup>{cw.map((w,i)=><col key={i} style={{width:w}}/>)}</colgroup>
                          <thead><tr style={{ background: C.bg }}>
                            <th style={{ ...thL, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}>Facility</th>
                            <th style={{ ...thS, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}>0-1d</th>
                            <th style={{ ...thS, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}>2-3d</th>
                            <th style={{ ...thS, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}>4-5d</th>
                            <th style={{ ...thS, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}>5+d</th>
                          </tr></thead>
                          <tbody>
                            {tatByFacility.map((row, ri, arr) => {
                              const tot = (row.ord_0_1||0)+(row.ord_2_3||0)+(row.ord_4_5||0)+(row.ord_5plus||0)
                              const isLast = ri === arr.length - 1
                              return (
                                <tr key={row.facility}>
                                  <td style={{ ...tdL, ...(isLast ? { borderBottom: 'none' } : {}) }}>{row.facility}</td>
                                  {[row.ord_0_1, row.ord_2_3, row.ord_4_5, row.ord_5plus].map((v, ci) => (
                                    <td key={ci} style={{ ...tdS, color: (v/tot)>0.2?'#dc2626':C.t2, fontWeight: (v/tot)>0.2?700:400, ...(isLast ? { borderBottom: 'none' } : {}) }}>{pctB(v, tot)}</td>
                                  ))}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', borderTop: `1.5px solid ${C.border}`, background: C.bg }}>
                        <colgroup>{cw.map((w,i)=><col key={i} style={{width:w}}/>)}</colgroup>
                        <tbody><tr>
                          <td style={totalRowL}>Total</td>
                          <td style={totalRowS}>{pctB(facTotals.ord_0_1,t3)}</td>
                          <td style={totalRowS}>{pctB(facTotals.ord_2_3,t3)}</td>
                          <td style={totalRowS}>{pctB(facTotals.ord_4_5,t3)}</td>
                          <td style={totalRowS}>{pctB(facTotals.ord_5plus,t3)}</td>
                        </tr></tbody>
                      </table>
                    </div>
                    ) })()}

                  </div>
                </>
              )
            })()}

          </>
        )
        })()}


        {/* ── Weight Based Analysis ── */}
        <LSectionTitle title="Weight Based Analysis" collapsed={secCollapsed['weight']} onToggle={() => toggleSec('weight')} />
        {(() => {
          const wData = (data.byWeightSlab || []).filter(r => r.slab !== 'Unknown')
          if (!wData.length) return null
          const SLABS = ['0-500g','500g-1kg','1-2kg','2-5kg','5-10kg','10-20kg','20-50kg','50kg+']
          const SLAB_COLORS = ['#60A5FA','#38BDF8','#93C5FD','#34D399','#FBBF24','#F87171','#A78BFA','#FB923C']
          const ordered = SLABS.map((s,i) => { const r = wData.find(x => x.slab === s); return r ? { ...r, color: SLAB_COLORS[i] } : null }).filter(Boolean)
          const grandTotal = ordered.reduce((s,r) => s + (r.total||0), 0) || 1
          const grandValue = ordered.reduce((s,r) => s + (r.total_value||0), 0) || 1
          const donutData = ordered.map(r => ({
            name: r.slab,
            value: wMetric === 'qty' ? (r.total||0) : (r.total_value||0),
            color: r.color,
            pct: wMetric === 'qty' ? +((r.total||0)/grandTotal*100).toFixed(1) : +((r.total_value||0)/grandValue*100).toFixed(1),
            raw: r,
          }))
          const fmtVal = v => v >= 10000000 ? '₹'+(v/10000000).toFixed(1)+'Cr' : v >= 100000 ? '₹'+(v/100000).toFixed(1)+'L' : v >= 1000 ? '₹'+(v/1000).toFixed(0)+'K' : '₹'+v
          return (
            <div style={{ display: secCollapsed['weight'] ? 'none' : 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              {/* Left: Donut with toggle */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={chartTitle}>Shipment Allocation by Weight</div>
                  <div style={{ display: 'flex', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: 2 }}>
                    {[['qty','Qty'],['value','Value']].map(([id,lbl]) => (
                      <button key={id} onClick={() => setWMetric(id)} style={{ fontSize: 10, padding: '2px 10px', borderRadius: 5, border: 'none', background: wMetric === id ? C.acc : 'transparent', color: wMetric === id ? '#000' : C.t3, cursor: 'pointer', fontWeight: wMetric === id ? 700 : 500, fontFamily: 'var(--font)' }}>{lbl}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <ResponsiveContainer width={180} height={200}>
                    <PieChart>
                      <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={2}>
                        {donutData.map((d,i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0].payload
                        return (
                          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 11, color: C.t1 }}>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
                            <div>{wMetric === 'qty' ? (d.value||0).toLocaleString('en-IN')+' shipments' : fmtVal(d.value||0)}</div>
                            <div style={{ color: C.t3 }}>Allocation: <strong>{d.pct}%</strong></div>
                          </div>
                        )
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    {donutData.map(d => (
                      <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                        <div style={{ fontSize: 12, color: C.t2, flex: 1 }}>{d.name}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>{wMetric === 'qty' ? (d.value||0).toLocaleString('en-IN') : fmtVal(d.value||0)}</div>
                        <div style={{ fontSize: 12, color: C.t3, minWidth: 36, textAlign: 'right' }}>{d.pct}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Right: Shipment Qty bars + RTO% & Intrasit TAT lines */}
              <div style={cardStyle}>
                <div style={chartTitle}>Delivery Performance by Weight Slab</div>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={ordered} margin={{ top: 4, right: 40, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                    <XAxis dataKey="slab" tick={{ fontSize: 10, fill: C.t2 }} />
                    <YAxis yAxisId="qty" tick={{ fontSize: 10, fill: C.t2 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                    <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: C.t2 }} unit="%" domain={[0, 'dataMax + 5']} />
                    <Tooltip content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const row = ordered.find(r => r.slab === label) || {}
                      return (
                        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 11, color: C.t1 }}>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
                          <div style={{ color: '#5BA4CF' }}>Shipments: <strong>{(row.total||0).toLocaleString('en-IN')}</strong></div>
                          <div style={{ color: C.red.tx }}>RTO %: <strong>{row.rto_pct??'—'}%</strong></div>
                          <div style={{ color: '#60A5FA' }}>Intrasit TAT: <strong>{row.avg_tat??'—'}d</strong></div>
                        </div>
                      )
                    }} />
                    <Bar yAxisId="qty" dataKey="total" name="Shipments" fill="#5BA4CF" radius={[3,3,0,0]} barSize={20} />
                    <Line yAxisId="pct" type="monotone" dataKey="rto_pct" name="RTO %" stroke={C.red.tx} strokeWidth={2} dot={{ r: 3, fill: C.red.tx }} />
                    <Line yAxisId="pct" type="monotone" dataKey="avg_tat" name="Intrasit TAT" stroke="#60A5FA" strokeWidth={2} dot={{ r: 3, fill: '#60A5FA' }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        })()}


        {/* ── Geographic ── */}
        <LSectionTitle title="Geographic" collapsed={secCollapsed['geo']} onToggle={() => toggleSec('geo')} />
        {(() => {
          const geoBar = (rows, labelKey, color) => {
            const grandTotal = rows.reduce((s,r) => s + (r.total||0), 0) || 1
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rows.map(r => {
                  const pct = ((r.total / grandTotal) * 100).toFixed(1)
                  const w = ((r.total / rows[0].total) * 100).toFixed(1)
                  return (
                    <div key={r[labelKey]}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: C.t2, maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r[labelKey]}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.t1 }}>{r.total.toLocaleString('en-IN')} <span style={{ color: C.t3, fontWeight: 400 }}>({pct}%)</span></span>
                      </div>
                      <div style={{ height: 7, borderRadius: 4, background: C.border, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: w + '%', background: color, borderRadius: 4, transition: 'width .4s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
          return (
            <div style={{ display: secCollapsed['geo'] ? 'none' : 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 14 }}>
              {[
                { title: 'Total Shipments by Drop City', sub: 'Top 10 destination cities', rows: data.topDropCities || [], key: 'city', color: '#2563eb', h: 340 },
                { title: 'Total Shipments by Pickup City', sub: 'Top 10 origin cities', rows: data.topPickupCities || [], key: 'city', color: '#FFD600', h: 343 },
                { title: 'Total Shipments by Drop State', sub: 'Top 10 destination states', rows: data.topDropStates || [], key: 'state', color: '#2563eb', h: 340 },
              ].map(({ title, sub, rows, key, color, h }) => (
                <div key={title} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', height: h }}>
                  <div style={chartTitle}>{title}</div>
                  <div style={{ fontSize: 11, color: C.t3, marginBottom: 12, marginTop: 2 }}>{sub}</div>
                  <div style={{ overflowY: 'auto', flex: 1 }}>{geoBar(rows, key, color)}</div>
                </div>
              ))}
            </div>
          )
        })()}

        {/* ── RTO Reasons ── */}
        <LSectionTitle title="RTO Reasons" collapsed={secCollapsed['rto']} onToggle={() => toggleSec('rto')} />
        {(() => {
          const reasons = (data.rtoReasons || []).filter(r => r.reason && r.total > 0).sort((a, b) => b.total - a.total)
          const totalRto = reasons.reduce((s, r) => s + r.total, 0) || 1
          if (!reasons.length) return <div style={{ color: C.t3, fontSize: 12 }}>No RTO reason data available.</div>
          return (
            <div style={{ ...cardStyle, padding: '16px 18px', display: secCollapsed['rto'] ? 'none' : undefined }}>
              <div style={{ ...chartTitle, marginBottom: 16 }}>RTO Reasons — Shipment Count & % of Total RTO</div>
              <ResponsiveContainer width="100%" height={isMobile ? 320 : 280}>
                <BarChart data={reasons} margin={{ top: 20, right: 10, left: 0, bottom: isMobile ? 120 : 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="reason" tick={{ fontSize: isMobile ? 9 : 10, fill: C.t1, fontWeight: 600 }} angle={-55} textAnchor="end" interval={0} tickFormatter={v => isMobile && v.length > 18 ? v.slice(0, 18) + '…' : v} />
                  <YAxis tick={{ fontSize: 10, fill: C.t3 }} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload
                    return (
                      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4, color: C.t1 }}>{d.reason}</div>
                        <div style={{ color: C.t2 }}>Shipments: <b>{d.total.toLocaleString('en-IN')}</b></div>
                        <div style={{ color: C.t2 }}>% of RTO: <b>{((d.total / totalRto) * 100).toFixed(1)}%</b></div>
                      </div>
                    )
                  }} />
                  <Bar dataKey="total" fill="#3B82F6" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="total" position="top" formatter={v => ((v / totalRto) * 100).toFixed(1) + '%'} style={{ fontSize: 9, fill: C.t3 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        })()}

        {/* ── Returns & Exchange Analytics (hidden) ── */}
        {false && (() => {
          const rk = retData?.kpis || {}
          const totalReq = rk.total_requests || 1
          const pickupSuccessPct = rk.pickup_success ? ((rk.pickup_success / totalReq) * 100).toFixed(1) : '—'
          const refundPct = rk.refund_processed ? ((rk.refund_processed / totalReq) * 100).toFixed(1) : '—'

          // Trend data
          const retTrendRaw = retTrendGran === 'Daily' ? (retData?.byDay || []) : retTrendGran === 'Weekly' ? (retData?.byWeek || []) : (retData?.byMonth || [])
          const retTrendTitle = retTrendGran === 'Daily' ? 'Daily Trend' : retTrendGran === 'Weekly' ? 'Weekly Trend' : 'Monthly Trend'

          // Reason bars
          const reasonRows = retReasonView === 'reason' ? (retData?.byReason || []) : (retData?.bySubReason || [])
          const maxReasonTotal = reasonRows[0]?.total || 1

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 14 }}>
                {[
                  { label: 'Total Requests', value: (rk.total_requests||0).toLocaleString('en-IN'), sub: `Returns: ${(rk.total_returns||0).toLocaleString('en-IN')} · Exchange: ${(rk.total_exchanges||0).toLocaleString('en-IN')}`, color: '#2563eb', bg: '#EFF6FF', border: '#BFDBFE' },
                  { label: 'Pickup Success %', value: pickupSuccessPct+'%', sub: `${(rk.pickup_success||0).toLocaleString('en-IN')} picked up`, color: '#16a34a', bg: '#F0FDF4', border: '#BBF7D0' },
                  { label: 'Refund Processed %', value: refundPct+'%', sub: `${(rk.refund_processed||0).toLocaleString('en-IN')} processed`, color: '#d97706', bg: '#FFFBEB', border: '#FDE68A' },
                  { label: 'Avg Refund ₹', value: rk.avg_refund_amount ? '₹'+(rk.avg_refund_amount).toLocaleString('en-IN') : '—', sub: `Total: ₹${((rk.total_refunded||0)/100000).toFixed(1)}L`, color: '#7c3aed', bg: '#F5F3FF', border: '#DDD6FE' },
                ].map(m => (
                  <div key={m.label} style={{ background: m.bg, border: `1.5px solid ${m.border}`, borderRadius: 14, padding: '16px 18px' }}>
                    <div style={{ fontSize: 9.5, color: '#94939F', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{m.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: m.color, letterSpacing: '-0.5px', marginBottom: 4 }}>{m.value}</div>
                    <div style={{ fontSize: 10, color: '#94939F' }}>{m.sub}</div>
                  </div>
                ))}
              </div>

              {/* Row: Reasons (full width) */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div>
                    <div style={chartTitle}>Return Reasons</div>
                    <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>Why customers are returning — {reasonRows.length} reasons</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[['reason','Main Reason'],['sub','Sub Reason']].map(([v,l]) => (
                      <button key={v} onClick={() => setRetReasonView(v)} style={{ fontSize: 10.5, padding: '3px 12px', borderRadius: 6, border: `1px solid ${retReasonView===v ? C.acc : C.border}`, background: retReasonView===v ? C.acl : 'transparent', color: retReasonView===v ? C.t1 : C.t2, cursor: 'pointer', fontWeight: retReasonView===v ? 700 : 500, fontFamily: 'var(--font)', transition: 'all .15s' }}>{l}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto', paddingRight: 6 }}>
                  {reasonRows.map((r, i) => {
                    const barW = ((r.total / maxReasonTotal) * 100).toFixed(1)
                    const barColor = '#FFD600'
                    return (
                      <div key={r.reason} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div title={r.reason} style={{ width: 200, minWidth: 200, fontSize: 11, color: C.t2, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'default' }}>{r.reason}</div>
                        <div style={{ flex: 1, height: 22, borderRadius: 4, background: C.border, overflow: 'hidden', position: 'relative' }}>
                          <div style={{ height: '100%', width: barW + '%', background: barColor, borderRadius: 4, transition: 'width .5s ease', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8 }}>
                            {parseFloat(barW) > 15 && <span style={{ fontSize: 10, fontWeight: 700, color: '#13121A' }}>{r.pct}%</span>}
                          </div>
                          {parseFloat(barW) <= 15 && <span style={{ position: 'absolute', left: barW+'%', top: '50%', transform: 'translateY(-50%)', marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.t1 }}>{r.pct}%</span>}
                        </div>
                        <div style={{ width: 70, minWidth: 70, fontSize: 11, fontWeight: 700, color: C.t1, textAlign: 'right' }}>{r.total.toLocaleString('en-IN')}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Row: Trend + Products side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>

                {/* Trend chart */}
                <div style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <div style={chartTitle}>{retTrendTitle} — Returns & Pickup %</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {['Daily','Weekly','Monthly'].map(g => (
                        <button key={g} onClick={() => setRetTrendGran(g)} style={{ fontSize: 10.5, padding: '3px 10px', borderRadius: 6, border: `1px solid ${retTrendGran===g ? C.acc : C.border}`, background: retTrendGran===g ? C.acl : 'transparent', color: retTrendGran===g ? C.t1 : C.t2, cursor: 'pointer', fontWeight: retTrendGran===g ? 700 : 500, fontFamily: 'var(--font)', transition: 'all .15s' }}>{g}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: C.t3, marginBottom: 12, marginTop: 2 }}>Returns · Exchanges · Pickup Success % (dashed)</div>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={retTrendRaw} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} strokeOpacity={0.5} />
                      <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: C.t3 }} />
                      <YAxis yAxisId="vol" tick={{ fontSize: 9, fill: C.t3 }} />
                      <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 9, fill: C.t3 }} tickFormatter={v => v+'%'} domain={[0,100]} />
                      <Tooltip formatter={(v, n) => n.includes('%') ? [v.toFixed(1)+'%', n] : [v.toLocaleString('en-IN'), n]} />
                      <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                      <Line yAxisId="vol" type="monotone" dataKey="returns" name="Returns" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 2.5, fill: '#2563eb', strokeWidth: 0 }} activeDot={{ r: 4 }} />
                      <Line yAxisId="vol" type="monotone" dataKey="exchanges" name="Exchanges" stroke="#FFD600" strokeWidth={2.5} dot={{ r: 2.5, fill: '#FFD600', strokeWidth: 0 }} activeDot={{ r: 4 }} />
                      <Line yAxisId="pct" type="monotone" dataKey="pickup_pct" name="Pickup %" stroke="#16a34a" strokeWidth={2} dot={{ r: 2.5, fill: '#16a34a', strokeWidth: 0 }} strokeDasharray="4 3" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Top Products */}
                <div style={cardStyle}>
                  <div style={chartTitle}>Returned Products</div>
                  <div style={{ fontSize: 11, color: C.t3, marginBottom: 14, marginTop: 2 }}>{(retData?.byProduct || []).length} products · % share of total returns</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 310, overflowY: 'auto', paddingRight: 4 }}>
                    {(retData?.byProduct || []).map((r, i) => {
                      const maxP = retData.byProduct[0]?.total || 1
                      const w = ((r.total / maxP) * 100).toFixed(1)
                      return (
                        <div key={r.product}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: C.t2, maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.product}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.t1 }}>{r.total.toLocaleString('en-IN')} <span style={{ color: C.t3, fontWeight: 400 }}>({r.pct}%)</span></span>
                          </div>
                          <div style={{ height: 7, borderRadius: 4, background: C.border, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: w+'%', background: '#FFD600', borderRadius: 4, transition: 'width .4s ease' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

              </div>
            </div>
          )
        })()}

      </>}


      </div>
    </div>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────
const SvgIcon = ({ d, size = 18, stroke = 'currentColor', fill = 'none', strokeWidth = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
)

function Sidebar({ page, setPage, invTab, setInvTab, allowedTabs, profile }) {
  const [invHover, setInvHover] = useState(false)
  const [logHover, setLogHover] = useState(false)
  const hoverTimerRef = useRef(null)
  const logHoverTimerRef = useRef(null)
  const allItems = [
    { id: 'overview', label: 'Overview', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg> },
    { id: 'sales', label: 'Sales', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="12" width="4" height="10" rx="1"/><rect x="10" y="6" width="4" height="16" rx="1"/><rect x="18" y="2" width="4" height="20" rx="1"/></svg> },
    { id: 'pnl', label: 'PnL', icon: <img src="/graph.png" alt="PnL" width={18} height={18} style={{ objectFit: 'contain', opacity: 0.7 }} /> },
    { id: 'ads', label: 'Ads', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg> },
    { id: 'logistics', label: 'Logistics', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><path d="M1 3h14a1 1 0 011 1v9H1V3zm15 4h4.5L23 10.5V16h-7V7zM5.5 20a2 2 0 100-4 2 2 0 000 4zm13 0a2 2 0 100-4 2 2 0 000 4z"/></svg> },
    { id: 'inventory', label: 'Inventory', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.24L20 8.5l-8 4-8-4 8-4.26zM3 9.74l8 4V21l-8-4V9.74zm10 11.26v-7.5l8-4V17l-8 4z"/></svg> },
    { id: 'customer', label: 'Customer', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><path d="M9 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4.42 0-8 1.79-8 4v1h16v-1c0-2.21-3.58-4-8-4zm7-8a3 3 0 000 6 3 3 0 000-6zm0 8c-1.04 0-2.02.2-2.88.53C14.32 15.2 15.5 16.5 15.5 18H23v-1c0-2.21-3.13-4-7-4z"/></svg> },
    { id: 'documents', label: 'Documents', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8 13h8v1.5H8V13zm0 3h8v1.5H8V16zm0-6h3v1.5H8V10z"/></svg> },
  ]
  const items = allowedTabs ? allItems.filter(i => allowedTabs.includes(i.id)) : allItems
  const dims = [
    { label: 'Courier', icon: <SvgIcon d={['M1 3h15v13H1z','M16 8h4l3 3v5h-7V8z','M5.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z','M18.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z']} /> },
    { label: 'Marketing', icon: <SvgIcon d={['M22 12h-4l-3 9L9 3l-3 9H2']} /> },
  ]
  return (
    <nav className="sidebar">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 14, gap: 2 }}>
        <img src="/frido-logo.png" alt="Frido" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} />
        <span style={{ fontSize: 7.5, fontWeight: 600, color: C.t3, letterSpacing: '.04em', textTransform: 'uppercase', lineHeight: 1, textAlign: 'center' }}>Analytics</span>
      </div>
      {items.map(item => {
        if (item.id === 'inventory') {
          const subTabs = [
            { id: 'health', label: 'Inventory Health' },
            { id: 'sales', label: 'Sales & Allocation' },
            // { id: 'inward', label: 'Inward' },
          ]
          return (
            <div key="inventory" style={{ position: 'relative' }}
              onMouseEnter={() => { clearTimeout(hoverTimerRef.current); setInvHover(true) }}
              onMouseLeave={() => { hoverTimerRef.current = setTimeout(() => setInvHover(false), 200) }}>
              <div onClick={() => setPage('inventory')}
                className={`sb-item${page === 'inventory' ? ' active' : ''}`}>
                <span className="sb-icon">{item.icon}</span>
                <span className="sb-label">{item.label}</span>
              </div>
              {invHover && (
                <div style={{
                  position: 'absolute', left: '100%', top: 0, marginLeft: 6, zIndex: 999,
                  background: C.card, border: `1px solid ${C.border2}`, borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: '6px', minWidth: 170,
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  {subTabs.map(sub => (
                    <div key={sub.id} onClick={() => { setPage('inventory'); setInvTab(sub.id); setInvHover(false) }}
                      style={{
                        padding: '8px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: invTab === sub.id && page === 'inventory' ? 700 : 500,
                        color: invTab === sub.id && page === 'inventory' ? C.t1 : C.t2,
                        background: invTab === sub.id && page === 'inventory' ? C.acl : 'transparent',
                      }}
                      onMouseEnter={e => { if (!(invTab === sub.id && page === 'inventory')) e.currentTarget.style.background = C.bg }}
                      onMouseLeave={e => { if (!(invTab === sub.id && page === 'inventory')) e.currentTarget.style.background = 'transparent' }}>
                      {sub.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        }
        if (item.id === 'logistics') {
          const logSubTabs = [
            { id: 'logistics', label: 'Logistics Performance' },
            { id: 'logistics-cost', label: 'Logistics Cost Analytics' },
          ]
          const logActive = page === 'logistics' || page === 'logistics-cost'
          return (
            <div key="logistics" style={{ position: 'relative' }}
              onMouseEnter={() => { clearTimeout(logHoverTimerRef.current); setLogHover(true) }}
              onMouseLeave={() => { logHoverTimerRef.current = setTimeout(() => setLogHover(false), 200) }}>
              <div onClick={() => setPage('logistics')}
                className={`sb-item${logActive ? ' active' : ''}`}>
                <span className="sb-icon">{item.icon}</span>
                <span className="sb-label">{item.label}</span>
              </div>
              {logHover && (
                <div style={{
                  position: 'absolute', left: '100%', top: 0, marginLeft: 6, zIndex: 999,
                  background: C.card, border: `1px solid ${C.border2}`, borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: '6px', minWidth: 200,
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  {logSubTabs.map(sub => (
                    <div key={sub.id} onClick={() => { setPage(sub.id); setLogHover(false) }}
                      style={{
                        padding: '8px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12,
                        fontWeight: page === sub.id ? 700 : 500,
                        color: page === sub.id ? C.t1 : C.t2,
                        background: page === sub.id ? C.acl : 'transparent',
                        whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => { if (page !== sub.id) e.currentTarget.style.background = C.bg }}
                      onMouseLeave={e => { if (page !== sub.id) e.currentTarget.style.background = 'transparent' }}>
                      {sub.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        }
        return (
          <div key={item.id} onClick={() => setPage(item.id)}
            className={`sb-item${page === item.id ? ' active' : ''}`}>
            <span className="sb-icon">{item.icon}</span>
            <span className="sb-label">{item.label}</span>
          </div>
        )
      })}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <div className="sb-div" />
        <div onClick={() => setPage('profile')} className={`sb-item${page === 'profile' ? ' active' : ''}`}
          style={{ position: 'relative' }}>
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
            : <SvgIcon d={['M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2', 'M12 11a4 4 0 100-8 4 4 0 000 8z']} />
          }
          <span className="sb-label">{profile?.name?.split(' ')[0] || 'Profile'}</span>
        </div>
      </div>
    </nav>
  )
}

// ── Bottom Nav (mobile) ───────────────────────────────────────
function BottomNav({ page, setPage, allowedTabs, profile }) {
  const allItems = [
    { id: 'overview', label: 'Overview', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg> },
    { id: 'sales', label: 'Sales', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="12" width="4" height="10" rx="1"/><rect x="10" y="6" width="4" height="16" rx="1"/><rect x="18" y="2" width="4" height="20" rx="1"/></svg> },
    { id: 'pnl', label: 'PnL', icon: <img src="/graph.png" alt="PnL" width={18} height={18} style={{ objectFit: 'contain', opacity: 0.7 }} /> },
    { id: 'inventory', label: 'Inventory', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.24L20 8.5l-8 4-8-4 8-4.26zM3 9.74l8 4V21l-8-4V9.74zm10 11.26v-7.5l8-4V17l-8 4z"/></svg> },
    { id: 'logistics', label: 'Logistics', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><path d="M1 3h14a1 1 0 011 1v9H1V3zm15 4h4.5L23 10.5V16h-7V7zM5.5 20a2 2 0 100-4 2 2 0 000 4zm13 0a2 2 0 100-4 2 2 0 000 4z"/></svg> },
    { id: 'ads', label: 'Ads', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg> },
    { id: 'customer', label: 'Customer', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><path d="M9 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4.42 0-8 1.79-8 4v1h16v-1c0-2.21-3.58-4-8-4zm7-8a3 3 0 000 6 3 3 0 000-6zm0 8c-1.04 0-2.02.2-2.88.53C14.32 15.2 15.5 16.5 15.5 18H23v-1c0-2.21-3.13-4-7-4z"/></svg> },
  ]
  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {allItems.map(item => {
          const allowed = !allowedTabs || allowedTabs.includes(item.id)
          const isActive = page === item.id
          return (
            <div key={item.id}
              onClick={() => allowed && setPage(item.id)}
              className={`bn-item${isActive ? ' active' : ''}`}
              style={{ opacity: allowed ? 1 : 0.3, cursor: allowed ? 'pointer' : 'default' }}>
              <span className="bn-icon">{item.icon}</span>
              <span className="bn-label">{item.label}</span>
            </div>
          )
        })}
        <div onClick={() => setPage('profile')} className={`bn-item${page === 'profile' ? ' active' : ''}`}>
          <span className="bn-icon">
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
              : <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            }
          </span>
          <span className="bn-label">Profile</span>
        </div>
      </div>
    </nav>
  )
}

// ── Topnav ─────────────────────────────────────────────────────
// `theme` lets callers outside the light-themed app shell (e.g. the dark Inventory
// dashboard) reuse this same calendar UI with their own palette instead of forking it —
// only colors are parameterized, all layout/behavior stays identical. Defaults to the
// app shell's own light theme so every existing call site is unaffected.
function DateRangePicker({ filters, setFilters, theme: T = C, onRefresh, loading }) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ start: filters?.start ?? '', end: filters?.end ?? '' })
  const [selecting, setSelecting] = useState('start')
  const [hover, setHover] = useState(null)
  const [dropPos, setDropPos] = useState({ top: 0, right: 0 })
  const ref = useRef(null)
  const btnRef = useRef(null)

  const today = new Date(); today.setHours(0,0,0,0)
  const fmt0 = d => { const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}` }
  const parseD = s => { const d = new Date(s + 'T00:00:00'); return isNaN(d) ? null : d }

  const [leftMonth, setLeftMonth] = useState(() => { const d = parseD(filters?.start) || today; return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [rightMonth, setRightMonth] = useState(() => { const d = parseD(filters?.start) || today; return new Date(d.getFullYear(), d.getMonth() + 1, 1) })
  const [monthPickerSide, setMonthPickerSide] = useState(null) // 'left' | 'right' | null
  const monthPickerOpen = monthPickerSide !== null
  const [yearInput, setYearInput] = useState(() => (parseD(filters?.start) || today).getFullYear())

  const PRESETS = [
    { label: 'Today', fn: () => { const d = fmt0(today); return { start: d, end: d } } },
    { label: 'Yesterday', fn: () => { const d = new Date(today); d.setDate(d.getDate()-1); const s = fmt0(d); return { start: s, end: s } } },
    { label: 'Last 7 Days', fn: () => { const s = new Date(today); s.setDate(s.getDate()-6); return { start: fmt0(s), end: fmt0(today) } } },
    { label: 'Last 15 Days', fn: () => { const s = new Date(today); s.setDate(s.getDate()-14); return { start: fmt0(s), end: fmt0(today) } } },
    { label: 'Last Month', fn: () => { const s = new Date(today.getFullYear(), today.getMonth()-1, 1); const e = new Date(today.getFullYear(), today.getMonth(), 0); return { start: fmt0(s), end: fmt0(e) } } },
    { label: 'Last Quarter', fn: () => {
      // Indian FY quarters: Q1=Apr-Jun(3-5), Q2=Jul-Sep(6-8), Q3=Oct-Dec(9-11), Q4=Jan-Mar(0-2)
      const m = today.getMonth()
      const fyStart = m >= 3 ? today.getFullYear() : today.getFullYear() - 1
      const qStarts = [3,6,9,0] // Apr,Jul,Oct,Jan
      const qYears  = [fyStart, fyStart, fyStart, fyStart+1]
      const curQ = m >= 3 ? Math.floor((m-3)/3) : 3
      const prevQ = (curQ + 3) % 4
      const s = new Date(qYears[prevQ], qStarts[prevQ], 1)
      const eMonth = qStarts[(prevQ+1)%4]; const eYear = prevQ === 3 ? qYears[prevQ]+1 : qYears[prevQ]
      const e = new Date(eYear, eMonth === 0 ? 0 : eMonth, 0)
      return { start: fmt0(s), end: fmt0(e) }
    } },
    ...(() => {
      const fyStart = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
      return [0, 1].map(offset => {
        const fy = fyStart - offset
        const label = offset === 0 ? 'YTD' : 'Last FY'
        return { label, fn: () => ({ start: fmt0(new Date(fy, 3, 1)), end: offset === 0 ? fmt0(today) : fmt0(new Date(fy+1, 2, 31)) }) }
      })
    })(),
  ]

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const apply = (s, e) => {
    const start = s || draft.start, end = e || draft.end
    if (start && end) { setFilters(f => ({ ...f, start, end })); setOpen(false) }
  }

  const getDays = (monthStart) => {
    const days = []
    const first = new Date(monthStart)
    const startDow = first.getDay()
    for (let i = 0; i < startDow; i++) days.push(null)
    const m = monthStart.getMonth()
    const d = new Date(monthStart)
    while (d.getMonth() === m) { days.push(new Date(d)); d.setDate(d.getDate()+1) }
    return days
  }

  const inRange = (day) => {
    if (!day) return false
    const ds = parseD(draft.start), de = parseD(draft.end)
    const hd = hover ? parseD(hover) : null
    if (ds && selecting === 'end' && hd) return day >= Math.min(ds, hd) && day <= Math.max(ds, hd)
    if (ds && de) return day >= ds && day <= de
    return false
  }
  const isStart = day => day && fmt0(day) === draft.start
  const isEnd = day => day && fmt0(day) === draft.end

  const fmtDisplay = s => { if (!s) return '—'; const d = parseD(s); if (!d) return s; return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  const renderMonth = (monthStart) => {
    const days = getDays(monthStart)
    return (
      <div style={{ flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} style={{ fontSize: 10, fontWeight: 600, color: T.t3, textAlign: 'center', padding: '2px 0' }}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
          {days.map((day, i) => {
            if (!day) return <div key={i} />
            const ds = fmt0(day)
            const sel = isStart(day) || isEnd(day)
            const inR = inRange(day)
            const isToday = fmt0(day) === fmt0(today)
            return (
              <div key={i} onClick={() => {
                if (selecting === 'start') { setDraft({ start: ds, end: '' }); setSelecting('end') }
                else {
                  const s = parseD(draft.start)
                  if (day < s) { setDraft({ start: ds, end: draft.start }); setSelecting('start') }
                  else { setDraft(d => ({ ...d, end: ds })); setSelecting('start') }
                }
              }}
              onMouseEnter={() => selecting === 'end' && setHover(ds)}
              onMouseLeave={() => setHover(null)}
              style={{ textAlign: 'center', padding: '4px 1px', borderRadius: 5, fontSize: 12, cursor: 'pointer', fontWeight: sel ? 700 : isToday ? 600 : 400, background: sel ? T.acc : inR ? '#FFF9CC' : 'transparent', color: sel ? '#13121A' : isToday ? T.acc : T.t1, border: isToday && !sel ? `1px solid ${T.acc}` : '1px solid transparent' }}>
                {day.getDate()}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const fmtShort = s => { if (!s) return '—'; const d = parseD(s); if (!d) return s; return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }
  const displayLabel = filters.start && filters.end
    ? (isMobile ? `${fmtShort(filters.start)} – ${fmtShort(filters.end)}` : `${fmtDisplay(filters.start)}  →  ${fmtDisplay(filters.end)}`)
    : 'Date range'

  const calIcon = (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1" y="2.5" width="14" height="12.5" rx="2" stroke={T.t2} strokeWidth="1.4" fill="none"/>
      <path d="M1 6h14" stroke={T.t2} strokeWidth="1.4"/>
      <path d="M5 1v3M11 1v3" stroke={T.t2} strokeWidth="1.4" strokeLinecap="round"/>
      <rect x="4" y="8.5" width="2" height="2" rx=".4" fill={T.t2}/>
      <rect x="7.5" y="8.5" width="2" height="2" rx=".4" fill={T.t2}/>
      <rect x="11" y="8.5" width="2" height="2" rx=".4" fill={T.t2}/>
      <rect x="4" y="11.5" width="2" height="2" rx=".4" fill={T.t2}/>
      <rect x="7.5" y="11.5" width="2" height="2" rx=".4" fill={T.t2}/>
    </svg>
  )

  const openPicker = () => {
    if (!isMobile) {
      const r = btnRef.current?.getBoundingClientRect()
      if (r) setDropPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
    setDraft({ start: filters.start, end: filters.end })
    setSelecting('start')
    setOpen(o => !o)
  }

  /* ── shared calendar body (used in both desktop dropdown and mobile sheet) ── */
  const calendarBody = (
    <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Selected range display */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, padding: '6px 10px', border: `1.5px solid ${selecting === 'start' ? T.acc : T.border}`, borderRadius: 7, fontSize: 12, color: draft.start ? T.t1 : T.t3 }}>{draft.start ? fmtDisplay(draft.start) : 'Start date'}</div>
        <span style={{ color: T.t3, fontSize: 13 }}>→</span>
        <div style={{ flex: 1, padding: '6px 10px', border: `1.5px solid ${selecting === 'end' ? T.acc : T.border}`, borderRadius: 7, fontSize: 12, color: draft.end ? T.t1 : T.t3 }}>{draft.end ? fmtDisplay(draft.end) : 'End date'}</div>
      </div>
      {monthPickerOpen ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <button onClick={() => setYearInput(y => y - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: T.t2, padding: '2px 8px', fontFamily: 'var(--font)' }}>‹</button>
            <span style={{ fontSize: 15, fontWeight: 700, color: T.t1, minWidth: 48, textAlign: 'center' }}>{yearInput}</span>
            <button onClick={() => setYearInput(y => y + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: T.t2, padding: '2px 8px', fontFamily: 'var(--font)' }}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5 }}>
            {MONTH_NAMES.map((mn, i) => {
              const refMonth = monthPickerSide === 'right' ? rightMonth : leftMonth
              const isCurrent = refMonth.getFullYear() === yearInput && refMonth.getMonth() === i
              return (
                <button key={mn} onClick={() => {
                  const picked = new Date(yearInput, i, 1)
                  if (monthPickerSide === 'right') setRightMonth(picked)
                  else setLeftMonth(picked)
                  setMonthPickerSide(null)
                }}
                  style={{ padding: '6px 4px', borderRadius: 6, border: isCurrent ? `2px solid ${T.acc}` : `1px solid ${T.border}`, background: isCurrent ? T.acl : 'transparent', color: T.t1, cursor: 'pointer', fontSize: 12, fontWeight: isCurrent ? 700 : 400, fontFamily: 'var(--font)' }}>
                  {mn}
                </button>
              )
            })}
          </div>
          <div style={{ textAlign: 'center', marginTop: 2 }}>
            <button onClick={() => setMonthPickerSide(null)} style={{ padding: '3px 14px', borderRadius: 6, border: `1px solid ${T.border}`, background: 'transparent', color: T.t3, cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font)' }}>← back</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: -4 }}>
            <button onClick={() => { setLeftMonth(m => new Date(m.getFullYear(), m.getMonth()-1, 1)); if (!isMobile) setRightMonth(m => new Date(m.getFullYear(), m.getMonth()-1, 1)) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: T.t2, padding: '2px 8px' }}>‹</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setYearInput(leftMonth.getFullYear()); setMonthPickerSide('left') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: T.t1, padding: '2px 6px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 3 }}>
                {leftMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} <span style={{ fontSize: 10, color: T.t3 }}>▾</span>
              </button>
              {!isMobile && <>
                <span style={{ color: T.border2, fontSize: 16 }}>|</span>
                <button onClick={() => { setYearInput(rightMonth.getFullYear()); setMonthPickerSide('right') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: T.t1, padding: '2px 6px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 3 }}>
                  {rightMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} <span style={{ fontSize: 10, color: T.t3 }}>▾</span>
                </button>
              </>}
            </div>
            <button onClick={() => { setLeftMonth(m => new Date(m.getFullYear(), m.getMonth()+1, 1)); if (!isMobile) setRightMonth(m => new Date(m.getFullYear(), m.getMonth()+1, 1)) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: T.t2, padding: '2px 8px' }}>›</button>
          </div>
          {isMobile ? (
            renderMonth(leftMonth)
          ) : (
            <div style={{ display: 'flex', gap: 24 }}>
              {renderMonth(leftMonth)}
              <div style={{ width: 1, background: T.border }} />
              {renderMonth(rightMonth)}
            </div>
          )}
        </>
      )}
      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 6, borderTop: `1px solid ${T.border}`, marginTop: 'auto' }}>
        <button onClick={() => setOpen(false)} style={{ padding: '6px 16px', borderRadius: 7, border: `1px solid ${T.border2}`, background: 'transparent', color: T.t2, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font)' }}>Cancel</button>
        <button onClick={() => apply()} disabled={!draft.start || !draft.end} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: draft.start && draft.end ? T.acc : T.border, color: '#13121A', cursor: draft.start && draft.end ? 'pointer' : 'default', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)' }}>Apply</button>
      </div>
    </div>
  )

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* Trigger button */}
      <button ref={btnRef} onClick={openPicker}
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 8, border: `1px solid ${T.border2}`, background: T.card, color: T.t1, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>
        {calIcon}
        {displayLabel}
      </button>
      {/* Refresh button — shown inline on desktop, inside trigger row on mobile */}
      {onRefresh && !isMobile && (
        <button onClick={onRefresh} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.border2}`, background: T.card, color: T.t2, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>
          <span style={{ display: 'inline-block', animation: loading ? 'spin 1s linear infinite' : 'none', fontSize: 14 }}>↻</span>
          Refresh
        </button>
      )}

      {open && isMobile ? (
        /* ── Mobile: bottom sheet ── */
        <>
          {/* Backdrop */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9998 }} />
          <div style={{
            position: 'fixed', bottom: 'var(--bot)', left: 0, right: 0, zIndex: 9999,
            background: T.card, borderRadius: '16px 16px 0 0',
            boxShadow: '0 -8px 32px rgba(0,0,0,0.18)',
            maxHeight: '90vh', overflowY: 'auto',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Handle + header */}
            <div style={{ padding: '10px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border2, margin: '0 auto 8px' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.t1 }}>Date Range</span>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: T.t3, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            {/* Quick presets as horizontal chips */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 14px', flexShrink: 0, scrollbarWidth: 'none' }}>
              {PRESETS.map(p => (
                <button key={p.label} onClick={() => { const r = p.fn(); setDraft(r); apply(r.start, r.end) }}
                  style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${T.border2}`, background: T.bg, color: T.t2, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font)', flexShrink: 0 }}>
                  {p.label}
                </button>
              ))}
            </div>
            {/* Calendar */}
            {calendarBody}
          </div>
        </>
      ) : open ? (
        /* ── Desktop: dropdown ── */
        <div style={{ position: 'fixed', top: dropPos.top, right: dropPos.right, zIndex: 9999, background: T.card, border: `1px solid ${T.border2}`, borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.15)', display: 'flex', minWidth: 680 }}>
          {/* Preset list */}
          <div style={{ width: 140, borderRight: `1px solid ${T.border}`, padding: '8px 0', flexShrink: 0 }}>
            {PRESETS.map(p => (
              <div key={p.label} onClick={() => { const r = p.fn(); setDraft(r); apply(r.start, r.end) }}
                style={{ padding: '5px 14px', fontSize: 12, color: T.t2, cursor: 'pointer', whiteSpace: 'nowrap' }}
                onMouseEnter={e => e.currentTarget.style.background = T.bg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {p.label}
              </div>
            ))}
          </div>
          {calendarBody}
        </div>
      ) : null}
    </div>
  )
}

function MobileKpiCarousel({ cards }) {
  const [active, setActive] = useState(0)
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onScroll = () => {
      const idx = Math.round(el.scrollLeft / el.offsetWidth)
      setActive(idx)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div ref={ref} style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollBehavior: 'smooth', gap: 10, paddingBottom: 2, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
        {cards.map((card, i) => (
          <div key={i} style={{ flexShrink: 0, width: '80vw', maxWidth: 280, scrollSnapAlign: 'start' }}>
            {card}
          </div>
        ))}
      </div>
      {cards.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 5 }}>
          {cards.map((_, i) => (
            <div key={i} onClick={() => { if (ref.current) ref.current.scrollTo({ left: i * ref.current.offsetWidth, behavior: 'smooth' }) }} style={{ width: i === active ? 16 : 6, height: 6, borderRadius: 3, background: i === active ? '#1967D2' : '#CBD5E1', cursor: 'pointer', transition: 'all .2s' }} />
          ))}
        </div>
      )}
    </div>
  )
}

function MobileSalesFilterPanel({ activeTab, setActiveTab, filters, setFilters, salesData, channelView, setChannelView, offlineSub, setOfflineSub, onClose }) {
  const [expandedKey, setExpandedKey] = useState(null)

  const data = salesData || {}
  const cats = useMemo(() => Object.keys(data?.catMap || {}).filter(Boolean).sort(), [data])
  const subCats = useMemo(() => {
    const all = Object.entries(data?.subCatMap || {})
    const selCats = filters.category?.length > 0 ? filters.category : null
    const filtered = selCats ? all.filter(([k]) => selCats.includes(k.split('::')[0])) : all
    return [...new Set(filtered.map(([k]) => k.split('::')[1]).filter(Boolean))].sort()
  }, [data, filters.category])
  const skuOpts = useMemo(() => data?.masterSkuList || [], [data])
  const paymentTypeOpts = useMemo(() => (data?.shopify?.paymentTypes || []).map(p => p.paymentType).filter(Boolean), [data])

  // D2C sub-channels (MyFrido, Mobility etc.)
  const subChannelMap = data.subChannelMap || {}
  const indiaSubChKeys = data.allSubChannels?.length ? data.allSubChannels
    : Object.keys(Object.fromEntries(Object.entries(subChannelMap).filter(([k]) => k !== 'International' && k !== 'Shopify B2B' && k !== 'Shopify International' && k !== 'Unknown' && k !== 'Retail Store')))
  const d2cSubSel = filters.subChannel ? filters.subChannel.split(',').map(x => x.trim()).filter(v => v && v !== 'ShopifyIndia' && v !== 'International') : []
  const d2cActive = d2cSubSel[0] || null

  const PV = { bg: '#FFFFFF', canvas: '#F5F6F8', border: '#E7E8EC', ink: '#1F2430', sub: '#6B7280', accent: '#F2C230', accentDark: '#8A6D00' }

  const switchTab = (id) => {
    setActiveTab(id)
    setChannelView('all')
    setOfflineSub('all')
    setFilters(f => ({ ...f, subChannel: '', voucher: '', channelGroup: [], category: [], subCategory: [], sku: [], paymentType: '' }))
    setExpandedKey(null)
  }

  // Slicers for filters section
  const filterSlicers = [
    { key: 'category', label: 'Category', options: cats, selected: filters.category || [], onChange: v => setFilters(f => ({ ...f, category: v, subCategory: [] })) },
    { key: 'subCategory', label: 'Sub-category', options: subCats, selected: filters.subCategory || [], onChange: v => setFilters(f => ({ ...f, subCategory: v })) },
    { key: 'sku', label: 'SKU', options: skuOpts, selected: filters.sku || [], onChange: v => setFilters(f => ({ ...f, sku: v })) },
    ...(activeTab === 'shopify' && paymentTypeOpts.length > 0 ? [{
      key: 'paymentType', label: 'Payment Type',
      options: paymentTypeOpts,
      selected: filters.paymentType ? filters.paymentType.split(',').filter(Boolean) : [],
      onChange: v => setFilters(f => ({ ...f, paymentType: v.join(',') })),
    }] : []),
  ]

  const totalActive = filterSlicers.reduce((sum, s) => sum + (Array.isArray(s.selected) ? s.selected.length : 0), 0)

  const handleClearAll = () => {
    setFilters(f => ({ ...f, category: [], subCategory: [], sku: [], paymentType: '', voucher: '' }))
    setExpandedKey(null)
  }

  const toggleExpand = (key) => setExpandedKey(k => k === key ? null : key)

  // Sub-channel section for D2C
  const renderSubChannels = () => {
    if (activeTab !== 'shopify' || indiaSubChKeys.length === 0) return null
    const opts = [{ id: null, label: 'Overall' }, ...indiaSubChKeys.map(k => ({ id: k, label: k }))]
    return (
      <div style={{ padding: '10px 16px 12px', borderBottom: `1px solid ${PV.border}` }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: PV.sub, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 8 }}>Sub-channel</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {opts.map(opt => {
            const isActive = opt.id == null ? !d2cActive : d2cActive === opt.id
            return (
              <button key={opt.label} onClick={() => setFilters(f => ({ ...f, subChannel: opt.id == null ? 'ShopifyIndia' : (d2cActive === opt.id ? 'ShopifyIndia' : opt.id) }))}
                style={{ padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: isActive ? 700 : 500, border: `1px solid ${isActive ? PV.accent : PV.border}`, background: isActive ? PV.accent : 'transparent', color: isActive ? PV.accentDark : PV.ink, cursor: 'pointer' }}>
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // Sub-toggle for Amazon
  const renderAmazonToggle = () => {
    if (activeTab !== 'amazon') return null
    const opts = [{ id: 'all', label: 'Overall' }, { id: 'sc', label: 'Seller Central' }, { id: 'vc', label: 'Vendor Central' }]
    return (
      <div style={{ padding: '10px 16px 12px', borderBottom: `1px solid ${PV.border}` }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: PV.sub, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 8 }}>View</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {opts.map(opt => (
            <button key={opt.id} onClick={() => setChannelView(opt.id)}
              style={{ padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: channelView === opt.id ? 700 : 500, border: `1px solid ${channelView === opt.id ? PV.accent : PV.border}`, background: channelView === opt.id ? PV.accent : 'transparent', color: channelView === opt.id ? PV.accentDark : PV.ink, cursor: 'pointer' }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Sub-toggle for Offline
  const renderOfflineToggle = () => {
    if (activeTab !== 'offline') return null
    const opts = OFFLINE_SUB_OPTIONS
    return (
      <div style={{ padding: '10px 16px 12px', borderBottom: `1px solid ${PV.border}` }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: PV.sub, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 8 }}>Sub-channel</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {opts.map(opt => (
            <button key={opt.id} onClick={() => setOfflineSub(opt.id)}
              style={{ padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: offlineSub === opt.id ? 700 : 500, border: `1px solid ${offlineSub === opt.id ? PV.accent : PV.border}`, background: offlineSub === opt.id ? PV.accent : 'transparent', color: offlineSub === opt.id ? PV.accentDark : PV.ink, cursor: 'pointer' }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '78vh', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: PV.ink, letterSpacing: '-0.01em' }}>Channel & Filters</span>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: PV.canvas, color: PV.sub, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Channel tabs — 2-row grid */}
        <div style={{ padding: '4px 14px 12px', borderBottom: `1px solid ${PV.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: PV.sub, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 8 }}>Channel</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.id
              return (
                <button key={tab.id} onClick={() => switchTab(tab.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: isActive ? 700 : 500, border: `1px solid ${isActive ? PV.ink : PV.border}`, background: isActive ? PV.ink : 'transparent', color: isActive ? '#fff' : PV.ink, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {tab.logo && <img src={tab.logo} alt="" style={{ width: 13, height: 13, borderRadius: 2, objectFit: 'contain', filter: isActive || tab.id === 'cred' ? 'invert(1)' : 'none' }} />}
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Sub-channel / sub-toggle (D2C / Amazon / Offline) */}
        {renderSubChannels()}
        {renderAmazonToggle()}
        {renderOfflineToggle()}

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 6px' }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: PV.sub, letterSpacing: '.07em', textTransform: 'uppercase' }}>
            Filters{totalActive > 0 ? ` · ${totalActive} active` : ''}
          </span>
          {totalActive > 0 && (
            <button onClick={handleClearAll} style={{ fontSize: 11, color: '#D93025', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>↺ Reset</button>
          )}
        </div>
        <div style={{ borderTop: `1px solid ${PV.border}` }}>
          {filterSlicers.map((slicer, si) => {
            const isExpanded = expandedKey === slicer.key
            const selCount = Array.isArray(slicer.selected) ? slicer.selected.length : 0
            const isLast = si === filterSlicers.length - 1
            return (
              <div key={slicer.key} style={{ borderBottom: isLast ? 'none' : `1px solid ${PV.border}` }}>
                <div onClick={() => toggleExpand(slicer.key)}
                  style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', gap: 8, userSelect: 'none' }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: PV.ink }}>{slicer.label}</span>
                  {selCount > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: '#FFF3CD', color: '#8A6D00', border: '1px solid #F2C230', borderRadius: 10, padding: '1px 7px' }}>{selCount}</span>
                  )}
                  {selCount > 0 && (
                    <button onClick={e => { e.stopPropagation(); slicer.onChange([]) }}
                      style={{ background: 'none', border: 'none', color: PV.sub, fontSize: 13, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
                  )}
                  <span style={{ fontSize: 13, color: PV.sub, transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform .18s', lineHeight: 1 }}>›</span>
                </div>
                {isExpanded && (
                  <div style={{ background: PV.canvas, borderTop: `1px solid ${PV.border}`, padding: '4px 0 8px' }}>
                    {slicer.options.length === 0 && <div style={{ padding: '10px 16px', fontSize: 12, color: PV.sub }}>No options</div>}
                    {slicer.options.map((opt, oi) => {
                      const checked = Array.isArray(slicer.selected) && slicer.selected.includes(opt)
                      return (
                        <label key={`${oi}-${opt}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', cursor: 'pointer', userSelect: 'none' }}>
                          <div style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, border: `2px solid ${checked ? PV.accent : PV.border}`, background: checked ? PV.accent : PV.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .12s' }}
                            onClick={() => slicer.onChange(checked ? slicer.selected.filter(x => x !== opt) : [...slicer.selected, opt])}>
                            {checked && <span style={{ fontSize: 10, color: PV.accentDark, lineHeight: 1 }}>✓</span>}
                          </div>
                          <span style={{ fontSize: 12.5, color: checked ? PV.ink : PV.sub, fontWeight: checked ? 600 : 400 }}
                            onClick={() => slicer.onChange(checked ? slicer.selected.filter(x => x !== opt) : [...slicer.selected, opt])}>
                            {opt}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 14px', borderTop: `1px solid ${PV.border}`, flexShrink: 0 }}>
        <button onClick={handleClearAll} disabled={totalActive === 0}
          style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${PV.border}`, background: 'transparent', color: totalActive > 0 ? PV.ink : PV.sub, fontSize: 13, cursor: totalActive > 0 ? 'pointer' : 'default', fontFamily: 'inherit', opacity: totalActive > 0 ? 1 : 0.5 }}>
          Reset
        </button>
        <button onClick={onClose}
          style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', background: PV.ink, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {totalActive > 0 ? `Apply (${totalActive})` : 'Done'}
        </button>
      </div>
    </div>
  )
}

function MobileInvFilterPanel({ invTab, setInvTab, inventoryDateControl, onClose }) {
  const [expandedKey, setExpandedKey] = useState(null)

  const idc = inventoryDateControl || {}
  const hf = idc.invHealthFilters || {}
  const setHf = idc.setInvHealthFilters || (() => {})
  const hOpts = idc.invHealthOpts || {}
  const sf = idc.invSalesFilters || {}
  const setSf = idc.setInvSalesFilters || (() => {})
  const sOpts = idc.invSalesOpts || {}

  const TABS = [
    { id: 'health', label: 'Inventory Health' },
    { id: 'sales', label: 'Sales & Allocation' },
    // { id: 'inward', label: 'Inward' },
  ]

  const STOCK_STATUSES = ['Out of Stock', 'Critical', 'Low', 'Sufficient', 'Excess', 'Dead / No Sale', 'No Demand']
  const AVG_WINDOWS = [{ label: '7d', value: 7 }, { label: '15d', value: 15 }, { label: '30d', value: 30 }]

  const healthSlicers = [
    { key: 'location', label: 'Location', options: hOpts.locations || [], selected: hf.location || [], onChange: v => setHf(p => ({ ...p, location: v })) },
    { key: 'stockStatus', label: 'Stock Status', options: STOCK_STATUSES, selected: hf.stockStatus || [], onChange: v => setHf(p => ({ ...p, stockStatus: v })) },
    { key: 'avgSaleWindowDays', label: 'Avg Sale Window', options: AVG_WINDOWS, selected: hf.avgSaleWindowDays || 7, onChange: v => setHf(p => ({ ...p, avgSaleWindowDays: v })), isRadio: true, getKey: o => o.value, getLabel: o => o.label },
    { key: 'facilityType', label: 'Facility Type', options: hOpts.facilityTypes || [], selected: hf.facilityType || [], onChange: v => setHf(p => ({ ...p, facilityType: v })) },
    { key: 'facility', label: 'Facility', options: hOpts.facilities || [], selected: hf.facility || [], onChange: v => setHf(p => ({ ...p, facility: v })), getKey: o => o?.facility ?? o, getLabel: o => o?.facility ?? o },
    { key: 'category', label: 'Category', options: hOpts.categories || [], selected: hf.category || [], onChange: v => setHf(p => ({ ...p, category: v })) },
    { key: 'subCategory', label: 'Sub-category', options: hOpts.subCategories || [], selected: hf.subCategory || [], onChange: v => setHf(p => ({ ...p, subCategory: v })) },
    { key: 'productId', label: 'Product ID', options: hOpts.productIds || [], selected: hf.productId || [], onChange: v => setHf(p => ({ ...p, productId: v })), getKey: o => o?.sku ?? o, getLabel: o => o?.sku ?? o },
  ]

  const salesSlicers = [
    { key: 'category', label: 'Category', options: sOpts.categories || [], selected: sf.category || [], onChange: v => setSf(p => ({ ...p, category: v })) },
    { key: 'subCategory', label: 'Sub-category', options: sOpts.subCategories || [], selected: sf.subCategory || [], onChange: v => setSf(p => ({ ...p, subCategory: v })) },
    { key: 'sku', label: 'Product ID / SKU', options: sOpts.skus || [], selected: sf.sku || [], onChange: v => setSf(p => ({ ...p, sku: v })) },
    { key: 'channel', label: 'Channel', options: sOpts.channels || [], selected: sf.channel || [], onChange: v => setSf(p => ({ ...p, channel: v })) },
    { key: 'salesType', label: 'Sales Type', options: sOpts.salesTypes || [], selected: sf.salesType || [], onChange: v => setSf(p => ({ ...p, salesType: v })) },
    { key: 'facility', label: 'Facility', options: sOpts.facilities || [], selected: sf.facility || [], onChange: v => setSf(p => ({ ...p, facility: v })), getKey: o => o?.facility ?? o, getLabel: o => o?.facility ?? o },
    { key: 'region', label: 'Region', options: sOpts.regions || [], selected: sf.region || [], onChange: v => setSf(p => ({ ...p, region: v })) },
  ]

  const currentSlicers = invTab === 'health' ? healthSlicers : invTab === 'sales' ? salesSlicers : []

  const keyOf = (slicer, o) => slicer.getKey ? slicer.getKey(o) : o
  const labelOf = (slicer, o) => slicer.getLabel ? slicer.getLabel(o) : o

  const totalActive = currentSlicers.reduce((sum, s) => {
    if (s.isRadio) return sum
    return sum + (Array.isArray(s.selected) ? s.selected.length : 0)
  }, 0)

  const handleClearAll = () => {
    if (invTab === 'health') setHf({})
    else if (invTab === 'sales') setSf({})
    setExpandedKey(null)
  }

  const toggleExpand = (key) => setExpandedKey(k => k === key ? null : key)

  // color tokens
  const PV = { bg: '#FFFFFF', canvas: '#F5F6F8', border: '#E7E8EC', ink: '#1F2430', sub: '#6B7280', accent: '#F2C230', accentDark: '#8A6D00', blue: '#1967D2', blueBg: '#E8F0FE', blueBorder: '#AECBFA' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '72vh', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: PV.ink, letterSpacing: '-0.01em' }}>Menu & Filters</span>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: PV.canvas, color: PV.sub, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>✕</button>
      </div>

      {/* Page segmented control */}
      <div style={{ display: 'flex', margin: '0 14px 12px', background: PV.canvas, borderRadius: 10, padding: 3, gap: 2, flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setInvTab(t.id); setExpandedKey(null) }}
            style={{
              flex: 1, padding: '7px 4px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: invTab === t.id ? 700 : 500,
              background: invTab === t.id ? PV.bg : 'transparent',
              color: invTab === t.id ? PV.ink : PV.sub,
              cursor: 'pointer', whiteSpace: 'nowrap',
              boxShadow: invTab === t.id ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
              transition: 'all .15s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Divider + filters label */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 8px', flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: PV.sub, letterSpacing: '.07em', textTransform: 'uppercase' }}>
          Filters{totalActive > 0 ? ` · ${totalActive} active` : ''}
        </span>
        {totalActive > 0 && (
          <button onClick={handleClearAll} style={{ fontSize: 11, color: '#D93025', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
            ↺ Reset
          </button>
        )}
      </div>

      {/* Scrollable filter list */}
      <div style={{ flex: 1, overflowY: 'auto', borderTop: `1px solid ${PV.border}` }}>
        {invTab === 'inward' ? (
          <div style={{ padding: 24, fontSize: 13, color: PV.sub, textAlign: 'center' }}>No filters for Inward</div>
        ) : currentSlicers.length === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: PV.sub, textAlign: 'center' }}>Loading…</div>
        ) : currentSlicers.map((slicer, si) => {
          const isExpanded = expandedKey === slicer.key
          const selCount = slicer.isRadio ? 0 : (Array.isArray(slicer.selected) ? slicer.selected.length : 0)
          const isLast = si === currentSlicers.length - 1

          return (
            <div key={slicer.key} style={{ borderBottom: isLast ? 'none' : `1px solid ${PV.border}` }}>
              {/* Row header */}
              <div onClick={() => toggleExpand(slicer.key)}
                style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', gap: 8, userSelect: 'none' }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: selCount > 0 ? PV.ink : PV.ink }}>{slicer.label}</span>
                {selCount > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: '#FFF3CD', color: '#8A6D00', border: '1px solid #F2C230', borderRadius: 10, padding: '1px 7px', lineHeight: '16px' }}>
                    {selCount}
                  </span>
                )}
                {selCount > 0 && (
                  <button onClick={e => { e.stopPropagation(); slicer.onChange([]) }}
                    style={{ background: 'none', border: 'none', color: PV.sub, fontSize: 13, cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>✕</button>
                )}
                <span style={{ fontSize: 13, color: PV.sub, transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform .18s', lineHeight: 1, flexShrink: 0 }}>›</span>
              </div>

              {/* Expanded options */}
              {isExpanded && (
                <div style={{ background: PV.canvas, borderTop: `1px solid ${PV.border}`, padding: '4px 0 8px' }}>
                  {slicer.options.length === 0 && (
                    <div style={{ padding: '10px 16px', fontSize: 12, color: PV.sub }}>No options available</div>
                  )}
                  {slicer.options.map((opt, oi) => {
                    const k = keyOf(slicer, opt)
                    const lbl = labelOf(slicer, opt)
                    const checked = slicer.isRadio ? slicer.selected === k : (Array.isArray(slicer.selected) && slicer.selected.includes(k))
                    return (
                      <label key={`${oi}-${k}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', cursor: 'pointer', userSelect: 'none' }}>
                        {/* Custom checkbox / radio */}
                        <div style={{
                          width: 17, height: 17, borderRadius: slicer.isRadio ? '50%' : 5, flexShrink: 0,
                          border: `2px solid ${checked ? PV.accent : PV.border}`,
                          background: checked ? PV.accent : PV.bg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all .12s',
                        }}
                          onClick={() => {
                            if (slicer.isRadio) { slicer.onChange(k) }
                            else {
                              const sel = Array.isArray(slicer.selected) ? slicer.selected : []
                              slicer.onChange(checked ? sel.filter(x => x !== k) : [...sel, k])
                            }
                          }}>
                          {checked && <span style={{ fontSize: slicer.isRadio ? 7 : 10, color: PV.accentDark, lineHeight: 1 }}>{slicer.isRadio ? '●' : '✓'}</span>}
                        </div>
                        <span style={{ fontSize: 12.5, color: checked ? PV.ink : PV.sub, fontWeight: checked ? 600 : 400 }}
                          onClick={() => {
                            if (slicer.isRadio) { slicer.onChange(k) }
                            else {
                              const sel = Array.isArray(slicer.selected) ? slicer.selected : []
                              slicer.onChange(checked ? sel.filter(x => x !== k) : [...sel, k])
                            }
                          }}>
                          {lbl}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      {invTab !== 'inward' && (
        <div style={{ display: 'flex', gap: 8, padding: '12px 14px', borderTop: `1px solid ${PV.border}`, flexShrink: 0 }}>
          <button onClick={handleClearAll} disabled={totalActive === 0}
            style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${PV.border}`, background: 'transparent', color: totalActive > 0 ? PV.ink : PV.sub, fontSize: 13, cursor: totalActive > 0 ? 'pointer' : 'default', fontFamily: 'inherit', opacity: totalActive > 0 ? 1 : 0.5 }}>
            Reset
          </button>
          <button onClick={onClose}
            style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', background: PV.ink, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {totalActive > 0 ? `Apply (${totalActive})` : 'Done'}
          </button>
        </div>
      )}
    </div>
  )
}

function Topnav({ page, customerTab, invTab, setInvTab, alerts, onRefresh, loading, filters, setFilters, rawRows, inventoryDateControl, salesActiveTab, setSalesActiveTab, salesData, salesChannelView, setSalesChannelView, salesOfflineSub, setSalesOfflineSub }) {
  const [mobFilterOpen, setMobFilterOpen] = useState(false)
  const titles = { overview: 'Overview', sales: 'Sales Analytics', pnl: 'P&L Analytics', ads: 'Ads Analytics', intelligence: 'Intelligence', logistics: 'Logistics Performance Analytics', 'logistics-cost': 'Logistics Cost Analytics', inventory: 'Inventory, Sales & Allocation', customer: 'Customer Intelligence', documents: 'Documents', cogs: 'COGS Ledger', 'logistics-ledger': 'Logistics Bill Ledger' }
  const invTitles = { health: 'Inventory Health', sales: 'Sales & Allocation' }
  const salesChannelLabel = TABS.find(t => t.id === salesActiveTab)?.label || 'Sales Analytics'
  const pageTitle = page === 'inventory' ? (invTitles[invTab] || titles.inventory) : page === 'sales' ? salesChannelLabel : titles[page]
  const critical = alerts.filter(a => a.type === 'red').length
  const dateBlurred = page === 'customer' && customerTab === 'rfm'
  return (
    <div className="topnav">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
        {(page === 'inventory' || page === 'sales') && (
          <>
            <button className="tnav-mob-only" onClick={() => setMobFilterOpen(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: C.t2, fontSize: 16, lineHeight: 1, alignItems: 'center' }}>☰</button>
            {mobFilterOpen && (
              <>
                <div onClick={() => setMobFilterOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 499, background: 'rgba(0,0,0,0.40)' }} />
                <div style={{
                  position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  zIndex: 500, width: 'min(340px, 92vw)',
                  background: '#fff', borderRadius: 16, overflow: 'hidden',
                  boxShadow: '0 8px 40px rgba(0,0,0,0.22)',
                  display: 'flex', flexDirection: 'column',
                }}>
                  {page === 'inventory'
                    ? <MobileInvFilterPanel invTab={invTab} setInvTab={setInvTab} inventoryDateControl={inventoryDateControl} onClose={() => setMobFilterOpen(false)} />
                    : <MobileSalesFilterPanel activeTab={salesActiveTab} setActiveTab={setSalesActiveTab} filters={filters} setFilters={setFilters} salesData={salesData} channelView={salesChannelView} setChannelView={setSalesChannelView} offlineSub={salesOfflineSub} setOfflineSub={setSalesOfflineSub} onClose={() => setMobFilterOpen(false)} />
                  }
                </div>
              </>
            )}
          </>
        )}
        <span className="tnav-title">{pageTitle}</span>
      </div>
      {page !== 'inventory' && page !== 'cogs' && page !== 'documents' && page !== 'profile' && page !== 'logistics-ledger' && page !== 'logistics-cost' && (
        <div className="tnav-right">
          <div style={{ opacity: dateBlurred ? 0.35 : 1, pointerEvents: dateBlurred ? 'none' : 'auto', transition: 'opacity 0.2s', position: 'relative' }} title={dateBlurred ? 'Segments & RFM is all-time — date range not applied' : undefined}>
            <DateRangePicker filters={filters} setFilters={setFilters} onRefresh={onRefresh} loading={loading} />
          </div>
        </div>
      )}
      {page === 'inventory' && inventoryDateControl?.filters && (
        <div className="tnav-right">
          <DateRangePicker filters={inventoryDateControl.filters} setFilters={inventoryDateControl.setFilters} theme={INVENTORY_DATE_THEME} onRefresh={inventoryDateControl.onRefresh} />
        </div>
      )}
    </div>
  )
}

// ── HeroKPICard ───────────────────────────────────────────────
function HeroKPICard({ label, value, sub, chg, sparkData, dataKey = 'cur', color, gradId }) {
  return (
    <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="kpi-label">{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="kpi-value">{value}</div>
        {chg !== null && chg !== undefined && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: chg >= 0 ? '#E6F4E0' : '#FDE8E8', color: chg >= 0 ? '#286010' : '#7A1A1A' }}>{chg >= 0 ? '▲' : '▼'} {Math.abs(chg).toFixed(1)}%</span>}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {sparkData?.length > 0 && (
        <ResponsiveContainer width="100%" height={32}>
          <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={color} stopOpacity={0.25} /><stop offset="95%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
            <Area type="monotone" dataKey={dataKey} name="Current" stroke={color} strokeWidth={1.5} fill={`url(#${gradId})`} dot={false} connectNulls />
            <Area type="monotone" dataKey="prev" name="Prev" stroke="#94939F" strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
            <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: '#fff', border: '1px solid #E8E6DC', borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? '#13121A' : '#94939F' }}>{p.name}: {p.value != null ? `₹${(p.value >= 1e7 ? (p.value/1e7).toFixed(2)+' Cr' : p.value >= 1e5 ? (p.value/1e5).toFixed(1)+' L' : Math.round(p.value).toLocaleString('en-IN'))}` : '—'}</div>)}</div> : null} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Overview Page ─────────────────────────────────────────────
function OverviewPage({ data, alerts, logisticsData, filters }) {
  const { totalRev, totalExcRev, nOrders, totalQty, blendedAOV, nDays, chMap, catMap, subCatMap, stateMap, nCusts, repeatCusts, dailyArr, prevRev, prevOrders, orderStatusRevMap = {}, rtoRevDirect, returnRev, cirRev, exchangeRev, netRevenueCalc = 0 } = data
  const sh = data.shopify || {}
  const ads = data.ads || {}

  // ── Revenue deltas ──
  const revDelta = prevRev > 0 ? ((totalRev - prevRev) / prevRev * 100) : null
  const ordDelta = (data.prevOrders || 0) > 0 ? ((nOrders - data.prevOrders) / data.prevOrders * 100) : null

  // ── Channel calcs ──
  const shopifyRev = chMap['Shopify']?.rev || 0
  const qcChs = ['Blinkit', 'Instamart', 'Zepto']
  const qcRev = qcChs.reduce((s, c) => s + (chMap[c]?.rev || 0), 0)
  const amzRev = chMap['Amazon']?.rev || 0
  const fkRev = chMap['Flipkart']?.rev || 0
  const sortedCh = Object.entries(chMap).filter(([, v]) => v.rev > 0).sort((a, b) => b[1].rev - a[1].rev)

  // ── Returns health ──
  const cancelRev = orderStatusRevMap['Cancelled'] || 0
  const cancelPct = totalRev > 0 ? cancelRev / totalRev * 100 : 0
  const rtoPct = totalRev > 0 ? ((rtoRevDirect || 0) + (returnRev || 0)) / totalRev * 100 : 0
  const cirPct = totalRev > 0 ? (cirRev || 0) / totalRev * 100 : 0
  const exchPct = totalRev > 0 ? (exchangeRev || 0) / totalRev * 100 : 0
  const totalReturnPct = cancelPct + rtoPct + cirPct

  // ── Ads ──
  const adsTotals = ads.totals || []
  const totalAdSpend = adsTotals.reduce((s, x) => s + (x.spend || 0), 0)
  const shopifyExcRev = chMap['Shopify']?.excRev || 0
  const allNetRev = shopifyExcRev + (chMap['Amazon']?.excRev || 0) + (chMap['Blinkit']?.excRev || 0) + (chMap['Zepto']?.excRev || 0) + (chMap['Instamart']?.excRev || 0) + (chMap['Myntra']?.excRev || 0) + (chMap['Flipkart']?.excRev || 0)
  const overallRoas = totalAdSpend > 0 ? allNetRev / totalAdSpend : 0
  const platformsWithSpend = adsTotals.filter(t => t.spend > 0).sort((a, b) => b.spend - a.spend)

  // ── Categories ──
  const allCats = Object.entries(catMap).map(([k, v]) => {
    const shCat = sh.catMap?.[k] || {}
    const effectiveCancelRev = (shCat.cancelRev || 0) - (shCat.codCancelRev || 0)
    return { name: k, rev: v.rev, orders: (v.orders?.size ?? v.orders) || 0, cancelRev: effectiveCancelRev, rtoRev: shCat.rtoRev || 0, cirRev: shCat.cirRev || 0 }
  }).sort((a, b) => b.rev - a.rev)

  // ── Logistics ──
  const lkpi = logisticsData?.kpis || {}
  const lTotal = parseInt(lkpi.total_shipments) || 0
  const lDelivered = parseInt(lkpi.delivered) || 0
  const lRto = parseInt(lkpi.rto) || 0
  const lZRto = parseInt(lkpi.z_rto) || 0
  const lSla = parseInt(lkpi.sla_breach) || 0
  const lDelPct = lTotal > 0 ? lDelivered / lTotal * 100 : 0
  const lRtoPct = lTotal > 0 ? lRto / lTotal * 100 : 0
  const lZRtoPct = lTotal > 0 ? lZRto / lTotal * 100 : 0
  const lSlaPct = lTotal > 0 ? lSla / lTotal * 100 : 0
  const lFasr = lkpi.delivered_1attempt && lkpi.total_ofd_attempts ? (parseInt(lkpi.delivered_1attempt) / (parseInt(lkpi.total_ofd_attempts) || 1) * 100) : null
  const lAvgFul = parseFloat(lkpi.avg_fulfilment) || null
  const couriers = (logisticsData?.byCourier || []).filter(c => parseInt(c.total) > 0).sort((a, b) => parseInt(b.total) - parseInt(a.total)).slice(0, 5)

  // ── Geography ──
  const topStates = Object.entries(stateMap).sort((a, b) => b[1].rev - a[1].rev).slice(0, 5)
  const stateTotal = topStates.reduce((s, [, v]) => s + v.rev, 0) || 1

  // ── Helpers ──
  const delta = (v, color = true) => {
    if (v === null || v === undefined) return null
    const pos = v >= 0
    const col = color ? (pos ? '#0D9E68' : '#B91C1C') : C.t3
    return <span style={{ fontSize: 10, fontWeight: 700, color: col, marginLeft: 4 }}>{pos ? '▲' : '▼'}{Math.abs(v).toFixed(1)}%</span>
  }
  const secHdr = (title, note) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{title}</span>
      {note && <span style={{ fontSize: 11, color: C.t3 }}>{note}</span>}
    </div>
  )
  const pill = (label, value, color = C.t1, bg = C.bg) => (
    <div style={{ background: bg, borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'var(--mono)' }}>{value}</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 24 }}>

      {/* ── SECTION 1: Revenue Hero ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 12 }}>
        <div className="hero-grad" style={{ borderRadius: 14, padding: '20px 22px', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(0,0,0,.45)', marginBottom: 6 }}>Gross Revenue Inc GST</div>
            <div style={{ fontSize: 38, fontWeight: 700, color: '#13121A', letterSpacing: '-.04em', lineHeight: 1, marginBottom: 4 }}>{totalRev >= 1e7 ? `₹${(totalRev / 1e7).toFixed(2)} Cr` : `₹${(totalRev / 1e5).toFixed(1)} L`}</div>
            <div style={{ fontSize: 11.5, color: 'rgba(0,0,0,.5)' }}>Net {fmt(netRevenueCalc)} · {nDays}d · {fmtN(nOrders)} orders</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 5, background: 'rgba(0,0,0,.1)', color: '#13121A' }}>Daily avg {fmt(totalRev / nDays)}</span>
            {delta(revDelta)}
          </div>
          <div style={{ position: 'absolute', right: -8, bottom: -16, fontSize: 90, color: 'rgba(0,0,0,.04)', pointerEvents: 'none' }}>₹</div>
        </div>
        <KPICard center label="Orders" value={fmtN(nOrders)} sub={<>{fmtN(totalQty)} units{delta(ordDelta)}</>} />
        <KPICard center label="Blended AOV" value={`₹${Math.round(blendedAOV).toLocaleString('en-IN')}`} sub={`${nDays} day period`} />
        <KPICard center label="D2C Customers" value={fmtN(nCusts)} sub={`${nCusts ? (repeatCusts / nCusts * 100).toFixed(1) : 0}% repeat`} />
        <KPICard center label="Net Revenue" value={fmt(netRevenueCalc)} sub="After returns & cancel, exc. GST" />
      </div>

      {/* ── SECTION 2: Channel Scorecard ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, padding: '16px 18px' }}>
        {secHdr('Channel Scorecard', `${sortedCh.length} active channels`)}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead>
              <tr>{['Channel','Revenue','Share','Orders','AOV','vs Prev'].map((h, i) => (
                <th key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: i === 0 ? 'left' : 'right', padding: '3px 8px 7px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {sortedCh.map(([ch, v], i) => {
                const aov = v.orders ? v.rev / v.orders : 0
                const sharePct = totalRev > 0 ? v.rev / totalRev * 100 : 0
                const prevChRev = data.prevChMap?.[ch] || 0
                const chDelta = prevChRev > 0 ? (v.rev - prevChRev) / prevChRev * 100 : null
                return (
                  <tr key={ch} style={{ borderBottom: i < sortedCh.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <td style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 7 }}>
                      {CHANNEL_LOGOS[ch]
                        ? <img src={CHANNEL_LOGOS[ch]} alt={ch} style={{ width: ch === 'offline_sales' ? 22 : 18, height: ch === 'offline_sales' ? 22 : 18, objectFit: 'contain', borderRadius: 4, flexShrink: 0, background: ch === 'CRED' ? '#1a1a1a' : '#f5f5f5', padding: ch === 'CRED' ? 2 : 0 }} />
                        : <span style={{ width: 18, height: 18, borderRadius: 4, background: C.ch[ch] || C.acc, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff' }}>{ch.charAt(0)}</span>}
                      <span style={{ fontWeight: 600, color: C.t1 }}>{ch === 'offline_sales' ? 'Offline Sales' : ch === 'Shopify' ? 'D2C' : ch}</span>
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: C.t1 }}>{fmt(v.rev)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: C.t3 }}>{sharePct.toFixed(1)}%</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: C.t2 }}>{fmtN(v.orders)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: C.t2 }}>₹{Math.round(aov).toLocaleString('en-IN')}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{chDelta !== null ? delta(chDelta) : <span style={{ color: C.t3, fontSize: 10 }}>—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {/* D2C / QC / Mkt split bar */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: C.t3, marginBottom: 5 }}>Revenue Mix</div>
          {(() => {
            const d2cP = totalRev ? shopifyRev / totalRev * 100 : 0
            const qcP = totalRev ? qcRev / totalRev * 100 : 0
            const amzP = totalRev ? amzRev / totalRev * 100 : 0
            const fkP = totalRev ? fkRev / totalRev * 100 : 0
            const othP = Math.max(0, 100 - d2cP - qcP - amzP - fkP)
            const segs = [
              { pct: d2cP, bg: C.ch.Shopify, label: `D2C ${d2cP.toFixed(0)}%` },
              { pct: amzP, bg: C.ch.Amazon, label: `Amazon ${amzP.toFixed(0)}%` },
              { pct: fkP, bg: C.ch.Flipkart, label: `Flipkart ${fkP.toFixed(0)}%` },
              { pct: qcP, bg: '#0D9E68', label: `QC ${qcP.toFixed(0)}%` },
              { pct: othP, bg: '#B0ADB8', label: `Other ${othP.toFixed(0)}%` },
            ].filter(s => s.pct > 0)
            return (
              <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', gap: 1 }}>
                {segs.map((s, i) => (
                  <div key={i} style={{ width: `${s.pct}%`, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700, color: '#fff', overflow: 'hidden', whiteSpace: 'nowrap', minWidth: s.pct > 5 ? 4 : 0 }}>
                    {s.pct >= 8 ? s.label : ''}
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── SECTION 3 + 4: Returns Health & Ads — side by side ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        {/* Returns Health */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, padding: '16px 18px' }}>
          {secHdr('Returns & Cancellation Health', 'Revenue-based')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Cancel %', val: cancelPct, rev: cancelRev, color: '#B91C1C', bg: '#FDE8E8' },
              { label: 'RTO %', val: rtoPct, rev: (rtoRevDirect||0)+(returnRev||0), color: '#E24B4A', bg: '#FDE8E8' },
              { label: 'CIR %', val: cirPct, rev: cirRev||0, color: '#2E74CC', bg: '#E1EFFD' },
              { label: 'Exchange %', val: exchPct, rev: exchangeRev||0, color: '#9B59B6', bg: '#F3E8FF' },
            ].map(({ label, val, rev, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 9, padding: '10px 12px' }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: 'var(--mono)' }}>{val.toFixed(1)}%</div>
                <div style={{ fontSize: 10, color, opacity: 0.7, marginTop: 2 }}>{fmt(rev)}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, marginBottom: 8 }}>D2C Category · Cancel & RTO %</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead><tr>
                {['Category','Revenue','Cancel %','RTO %'].map((h, i) => <th key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: C.t3, textAlign: i === 0 ? 'left' : 'right', padding: '2px 4px 6px', borderBottom: `1px solid ${C.border}` }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {allCats.slice(0, 6).map((r, i) => (
                  <tr key={r.name} style={{ borderBottom: i < 5 ? `1px solid ${C.border}` : 'none' }}>
                    <td style={{ padding: '4px 4px', color: C.t2 }}>{r.name}</td>
                    <td style={{ padding: '4px 4px', textAlign: 'right', fontFamily: 'var(--mono)', color: C.t1 }}>{fmt(r.rev)}</td>
                    <td style={{ padding: '4px 4px', textAlign: 'right', color: r.cancelRev/r.rev > 0.05 ? '#B91C1C' : C.t2 }}>{r.rev > 0 ? (r.cancelRev/r.rev*100).toFixed(1) : '—'}%</td>
                    <td style={{ padding: '4px 4px', textAlign: 'right', color: (r.rtoRev+r.cirRev)/r.rev > 0.1 ? '#E24B4A' : C.t2 }}>{r.rev > 0 ? ((r.rtoRev+r.cirRev)/r.rev*100).toFixed(1) : '—'}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ads Summary */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, padding: '16px 18px' }}>
          {secHdr('Ads Performance', totalAdSpend > 0 ? `${fmt(totalAdSpend)} total spend` : 'No ad data')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Total Spend', val: fmt(totalAdSpend) },
              { label: 'Overall ROAS', val: totalAdSpend > 0 ? `${overallRoas.toFixed(2)}x` : '—', color: overallRoas >= 2 ? '#0D9E68' : overallRoas >= 1 ? '#D97706' : '#B91C1C' },
              { label: 'Net Rev / Ad', val: totalAdSpend > 0 ? fmt(allNetRev) : '—' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: C.bg, borderRadius: 9, padding: '10px 12px' }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: color || C.t1, fontFamily: 'var(--mono)' }}>{val}</div>
              </div>
            ))}
          </div>
          {platformsWithSpend.length > 0 && (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, marginBottom: 8 }}>Platform Breakdown</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr>
                  {['Platform','Spend','ROAS','Clicks','CTR'].map((h, i) => <th key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: C.t3, textAlign: i === 0 ? 'left' : 'right', padding: '2px 4px 6px', borderBottom: `1px solid ${C.border}` }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {platformsWithSpend.slice(0, 6).map((t, i) => {
                    const platRev = (['Meta','Google'].includes(t.platform) ? shopifyExcRev * (t.spend / (platformsWithSpend.filter(x => ['Meta','Google'].includes(x.platform)).reduce((s,x)=>s+x.spend,0)||1)) : chMap[t.platform]?.excRev || 0)
                    const roas = t.spend > 0 ? platRev / t.spend : 0
                    const ctr = t.impressions > 0 ? t.clicks / t.impressions * 100 : 0
                    return (
                      <tr key={t.platform} style={{ borderBottom: i < platformsWithSpend.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                        <td style={{ padding: '4px 4px', color: C.t2, fontWeight: 600 }}>{t.platform}</td>
                        <td style={{ padding: '4px 4px', textAlign: 'right', fontFamily: 'var(--mono)', color: C.t1 }}>{fmt(t.spend)}</td>
                        <td style={{ padding: '4px 4px', textAlign: 'right', color: roas >= 2 ? '#0D9E68' : roas >= 1 ? '#D97706' : '#B91C1C' }}>{t.spend > 0 ? `${roas.toFixed(2)}x` : '—'}</td>
                        <td style={{ padding: '4px 4px', textAlign: 'right', color: C.t2 }}>{fmtN(t.clicks)}</td>
                        <td style={{ padding: '4px 4px', textAlign: 'right', color: C.t2 }}>{ctr.toFixed(2)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 5: Logistics Health ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, padding: '16px 18px' }}>
        {secHdr('Logistics Health', logisticsData ? `${fmtN(lTotal)} shipments` : 'Loading...')}
        {logisticsData ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Delivery %', val: `${lDelPct.toFixed(1)}%`, color: lDelPct >= 80 ? '#0D9E68' : lDelPct >= 60 ? '#D97706' : '#B91C1C', bg: lDelPct >= 80 ? '#E6F4E0' : lDelPct >= 60 ? '#FEF2DC' : '#FDE8E8' },
                { label: 'RTO %', val: `${lRtoPct.toFixed(1)}%`, color: lRtoPct <= 10 ? '#0D9E68' : lRtoPct <= 20 ? '#D97706' : '#B91C1C', bg: lRtoPct <= 10 ? '#E6F4E0' : lRtoPct <= 20 ? '#FEF2DC' : '#FDE8E8' },
                { label: 'SLA Breach %', val: `${lSlaPct.toFixed(1)}%`, color: lSlaPct <= 5 ? '#0D9E68' : lSlaPct <= 15 ? '#D97706' : '#B91C1C', bg: lSlaPct <= 5 ? '#E6F4E0' : lSlaPct <= 15 ? '#FEF2DC' : '#FDE8E8' },
                { label: 'Z-RTO %', val: `${lZRtoPct.toFixed(1)}%`, color: lZRtoPct <= 3 ? '#0D9E68' : lZRtoPct <= 8 ? '#D97706' : '#B91C1C', bg: lZRtoPct <= 3 ? '#E6F4E0' : lZRtoPct <= 8 ? '#FEF2DC' : '#FDE8E8' },
                { label: 'FASR %', val: lFasr !== null ? `${lFasr.toFixed(1)}%` : '—', color: C.t1, bg: C.bg },
                { label: 'Avg Fulfilment', val: lAvgFul !== null ? `${lAvgFul.toFixed(1)}d` : '—', color: lAvgFul <= 3 ? '#0D9E68' : lAvgFul <= 5 ? '#D97706' : '#B91C1C', bg: lAvgFul <= 3 ? '#E6F4E0' : lAvgFul <= 5 ? '#FEF2DC' : '#FDE8E8' },
              ].map(({ label, val, color, bg }) => (
                <div key={label} style={{ background: bg, borderRadius: 9, padding: '10px 12px' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: 'var(--mono)' }}>{val}</div>
                </div>
              ))}
            </div>
            {couriers.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, marginBottom: 8 }}>Courier Partner Performance</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead><tr>
                    {['Courier','Shipments','Delivered %','RTO %','Z-RTO %','Avg Fulfilment'].map((h, i) => <th key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: C.t3, textAlign: i === 0 ? 'left' : 'right', padding: '2px 6px 6px', borderBottom: `1px solid ${C.border}` }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {couriers.map((c, i) => {
                      const tot = parseInt(c.total) || 1
                      const del = parseInt(c.delivered) || 0
                      const rto = parseInt(c.rto) || 0
                      const zrto = parseInt(c.z_rto) || 0
                      const delP = del / tot * 100
                      const rtoP = rto / tot * 100
                      const zrtoP = zrto / tot * 100
                      const avgFul = parseFloat(c.avg_fulfilment_days) || null
                      return (
                        <tr key={c.courier_group} style={{ borderBottom: i < couriers.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                          <td style={{ padding: '5px 6px', fontWeight: 600, color: C.t1 }}>{c.courier_group}</td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', color: C.t2 }}>{fmtN(tot)}</td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', color: delP >= 80 ? '#0D9E68' : delP >= 60 ? '#D97706' : '#B91C1C' }}>{delP.toFixed(1)}%</td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', color: rtoP <= 10 ? '#0D9E68' : rtoP <= 20 ? '#D97706' : '#B91C1C' }}>{rtoP.toFixed(1)}%</td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', color: C.t2 }}>{zrtoP.toFixed(1)}%</td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', color: avgFul ? (avgFul <= 3 ? '#0D9E68' : avgFul <= 5 ? '#D97706' : '#B91C1C') : C.t3 }}>{avgFul ? `${avgFul.toFixed(1)}d` : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            )}
          </>
        ) : (
          <div style={{ color: C.t3, fontSize: 12, padding: '12px 0' }}>Logistics data loading...</div>
        )}
      </div>

      {/* ── SECTION 6: Category Matrix + Geography ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, padding: '16px 18px' }}>
          {secHdr('Category Performance', 'All channels')}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead><tr>
              {['Category','Revenue','Share','Orders','AOV'].map((h, i) => <th key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: C.t3, textAlign: i === 0 ? 'left' : 'right', padding: '2px 6px 6px', borderBottom: `1px solid ${C.border}` }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {allCats.map((r, i) => {
                const share = totalRev > 0 ? r.rev / totalRev * 100 : 0
                const aov = r.orders > 0 ? r.rev / r.orders : 0
                return (
                  <tr key={r.name} style={{ borderBottom: i < allCats.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <td style={{ padding: '5px 6px', color: C.t2, fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1 }}>{r.name}</div>
                        <div style={{ height: 4, width: 60, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${share}%`, background: C.acc, borderRadius: 2 }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'var(--mono)', color: C.t1 }}>{fmt(r.rev)}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: C.t3 }}>{share.toFixed(1)}%</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: C.t2 }}>{fmtN(r.orders)}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'var(--mono)', color: C.t2 }}>₹{Math.round(aov).toLocaleString('en-IN')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, padding: '16px 18px' }}>
          {secHdr('Top States', 'By revenue')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topStates.map(([state, v]) => {
              const share = totalRev > 0 ? v.rev / totalRev * 100 : 0
              return (
                <div key={state}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t1 }}>{state.charAt(0) + state.slice(1).toLowerCase()}</span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: C.t1 }}>{fmt(v.rev)} <span style={{ color: C.t3, fontFamily: 'var(--font)' }}>· {share.toFixed(1)}%</span></span>
                  </div>
                  <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${share}%`, background: C.acc, borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>{fmtN(v.orders)} orders · {v.cities?.size || 0} cities</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

    </div>
  )
}

// ── Sales sub-tabs ────────────────────────────────────────────
const TABS = [
  { id: 'all', label: 'Overall' },
  { id: 'shopify', label: 'D2C', ch: 'Shopify', logo: '/logo-shopify.png' },
  { id: 'ebo', label: 'EBO', ch: 'EBO', logo: '/ebo.png' },
  { id: 'amazon', label: 'Amazon', ch: 'Amazon', logo: '/logo-amazon.png' },
  { id: 'flipkart', label: 'Flipkart', ch: 'Flipkart', logo: '/logo-flipkart.png' },
  { id: 'blinkit', label: 'Blinkit', ch: 'Blinkit', logo: '/logo-blinkit.png' },
  { id: 'cred', label: 'CRED', ch: 'CRED', logo: '/logo-cred.png' },
  { id: 'firstcry', label: 'Firstcry', ch: 'Firstcry', logo: '/logo-firstcry.png' },
  { id: 'instamart', label: 'Instamart', ch: 'Instamart', logo: '/logo-instamart.png' },
  { id: 'zepto', label: 'Zepto', ch: 'Zepto', logo: '/logo-zepto.png' },
  { id: 'myntra', label: 'Myntra', ch: 'Myntra', logo: '/logo-myntra.png' },
  // Placeholder tab — International orders (Channel='International', both Amazon International
  // and Shopify International sub-brands) now have their own top-level Channel post-schema-change
  // (2026-08). Sales-tab breakdown is not yet built; see PnL tab's "International" tab for the
  // real KPI/Financial View treatment.
  { id: 'international', label: 'International', ch: 'International' },
  { id: 'offline', label: 'Offline Sales', ch: 'offline_sales', logo: '/offline-sales.png' },
]
const CHANNEL_LOGOS = Object.fromEntries(TABS.filter(t => t.logo).map(t => [t.ch, t.logo]))
const OFFLINE_SUB_OPTIONS = [
  { id: 'all', label: 'Overall' },
  { id: 'b2b', label: 'B2B' },
  { id: 'Stockist', label: 'Stockist' },
  { id: 'MTGT', label: 'MT GT' },
]

function PaginatedCard({ title, rows, columns, pageSize = 10 }) {
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [rows])
  const totalPages = Math.ceil(rows.length / pageSize)
  const visible = rows.slice(page * pageSize, (page + 1) * pageSize)
  return (
    <Card title={title} style={{ display: 'flex', flexDirection: 'column' }}>
      <DataTable columns={columns} rows={visible} storageKey={`datatable-cols:${title}`} />
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 11, color: C.t3 }}>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, rows.length)} of {rows.length}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: `1px solid ${C.border2}`, background: page === 0 ? C.bg : C.card, color: page === 0 ? C.t3 : C.t1, cursor: page === 0 ? 'default' : 'pointer', fontFamily: 'var(--font)' }}>← Prev</button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: `1px solid ${C.border2}`, background: page === totalPages - 1 ? C.bg : C.card, color: page === totalPages - 1 ? C.t3 : C.t1, cursor: page === totalPages - 1 ? 'default' : 'pointer', fontFamily: 'var(--font)' }}>Next →</button>
          </div>
        </div>
      )}
    </Card>
  )
}


// ── Multi-select Voucher Dropdown ────────────────────────────
function VoucherDropdown({ voucherList, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState(null)
  const ref = useRef(null)
  const searchInputRef = useRef(null)
  const selectedArr = selected ? selected.split(',').map(s => s.trim()).filter(Boolean) : []
  const staged = pending !== null ? pending : selectedArr
  const filtered = (voucherList || []).filter(({ code }) => code.toLowerCase().includes(search.toLowerCase()))

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setPending(null); setSearch('') } }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // See SearchableSelect's identical fix — avoids the browser's native scroll-into-view on focus
  // shifting the page/popover when this is nested inside the scrollable Filters popover.
  useEffect(() => {
    if (open) searchInputRef.current?.focus({ preventScroll: true })
  }, [open])

  const toggle = code => {
    const next = staged.includes(code) ? staged.filter(v => v !== code) : [...staged, code]
    setPending(next)
  }

  const apply = () => { onChange((pending !== null ? pending : staged).join(',')); setPending(null); setOpen(false); setSearch('') }
  const clear = () => { setPending([]) }

  const label = selectedArr.length === 0 ? 'All Vouchers' : selectedArr.length === 1 ? selectedArr[0] : `${selectedArr.length} vouchers selected`

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <div onClick={() => { setPending(null); setOpen(o => !o) }} className="fsel" style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', minWidth: 160, maxWidth: 200, background: selectedArr.length ? '#FFF9CC' : undefined, borderColor: selectedArr.length ? C.acm : undefined }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5 }}>{label}</span>
        <span style={{ fontSize: 8, color: C.t3, flexShrink: 0 }}>▼</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 200, background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, boxShadow: '0 8px 28px rgba(0,0,0,.14)', width: 240 }}>
          <div style={{ padding: '7px 8px', borderBottom: `1px solid ${C.border}` }}>
            <input ref={searchInputRef} value={search} onChange={e => setSearch(e.target.value)} onMouseDown={e => e.stopPropagation()} placeholder="Search voucher…" style={{ width: '100%', fontSize: 11.5, padding: '4px 8px', border: `1px solid ${C.border2}`, borderRadius: 6, outline: 'none', fontFamily: 'var(--font)', background: C.bg }} />
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {filtered.map(({ code }) => {
              const checked = staged.includes(code)
              return (
                <div key={code} onClick={() => toggle(code)} style={{ padding: '5px 10px', fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, background: checked ? C.acl : undefined }}>
                  <span style={{ width: 13, height: 13, borderRadius: 3, border: `1.5px solid ${checked ? C.acm : C.border2}`, background: checked ? C.acc : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 8, fontWeight: 700 }}>{checked ? '✓' : ''}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{code}</span>
                </div>
              )
            })}
            {filtered.length === 0 && <div style={{ padding: '10px', fontSize: 11.5, color: C.t3, textAlign: 'center' }}>No results</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '8px', borderTop: `1px solid ${C.border}` }}>
            <button onMouseDown={e => e.stopPropagation()} onClick={clear} style={{ flex: 1, fontSize: 11.5, fontWeight: 600, padding: '5px 0', borderRadius: 6, border: `1.5px solid ${C.border2}`, background: 'transparent', color: C.t2, cursor: 'pointer', fontFamily: 'var(--font)' }}>Clear</button>
            <button onMouseDown={e => e.stopPropagation()} onClick={apply} style={{ flex: 1, fontSize: 11.5, fontWeight: 700, padding: '5px 0', borderRadius: 6, border: 'none', background: C.t1, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)' }}>Apply</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Searchable single-select dropdown ────────────────────────
function SearchableSelect({ options, value, onChange, placeholder, dropdownWidth, multi }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState(null) // staged selection before Apply (multi only)
  const ref = useRef(null)
  const searchInputRef = useRef(null)
  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
  const selected = multi ? (value || []) : value
  // while dropdown is open, work on pending; on close without apply, discard
  const staged = multi ? (pending !== null ? pending : selected) : selected

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setPending(null); setSearch('') } }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // preventScroll avoids the browser's native "scroll focused element into view" behavior —
  // when this dropdown is nested inside a scrollable ancestor (e.g. the Filters popover, which
  // has its own overflowY:auto for long option lists), plain autoFocus made the WHOLE popover
  // (and sometimes the page behind it) visibly jump/scroll the instant the dropdown opened.
  useEffect(() => {
    if (open) searchInputRef.current?.focus({ preventScroll: true })
  }, [open])

  const openDropdown = () => { setPending(null); setOpen(o => !o) }

  const toggle = v => {
    if (!multi) { onChange(v); setSearch(''); setOpen(false); return }
    const arr = staged.includes(v) ? staged.filter(x => x !== v) : [...staged, v]
    setPending(arr)
  }

  const apply = () => { onChange(pending !== null ? pending : staged); setPending(null); setOpen(false); setSearch('') }
  const clear = () => { if (multi) { setPending([]) } else { onChange(''); setOpen(false) } }

  const hasValue = multi ? selected.length > 0 : !!selected
  const label = multi
    ? (selected.length === 0 ? placeholder : selected.length === 1 ? selected[0] : `${selected[0]} +${selected.length - 1}`)
    : (selected || placeholder)

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <div onClick={openDropdown} className="fsel" style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', minWidth: 140, background: hasValue ? '#FFF9CC' : undefined, borderColor: hasValue ? C.acm : undefined }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5 }}>{label}</span>
        <span style={{ fontSize: 8, color: C.t3, flexShrink: 0 }}>▼</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 200, background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, boxShadow: '0 8px 28px rgba(0,0,0,.14)', width: dropdownWidth || 220 }}>
          <div style={{ padding: '7px 8px', borderBottom: `1px solid ${C.border}` }}>
            <input ref={searchInputRef} value={search} onChange={e => setSearch(e.target.value)} onMouseDown={e => e.stopPropagation()} placeholder={`Search ${placeholder?.toLowerCase() || ''}…`} style={{ width: '100%', fontSize: 11.5, padding: '4px 8px', border: `1px solid ${C.border2}`, borderRadius: 6, outline: 'none', fontFamily: 'var(--font)', background: C.bg }} />
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtered.map(opt => {
              const active = multi ? staged.includes(opt) : staged === opt
              return (
                <div key={opt} onClick={() => toggle(opt)} style={{ padding: '5px 10px', fontSize: 11.5, cursor: 'pointer', background: active ? C.acl : undefined, color: active ? C.t1 : C.t2, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 7 }}>
                  {multi && <span style={{ width: 13, height: 13, borderRadius: 3, border: `1.5px solid ${active ? C.acm : C.border2}`, background: active ? C.acm : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{active && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1 }}>✓</span>}</span>}
                  {opt}
                </div>
              )
            })}
            {filtered.length === 0 && <div style={{ padding: '10px', fontSize: 11.5, color: C.t3, textAlign: 'center' }}>No results</div>}
          </div>
          {multi && (
            <div style={{ display: 'flex', gap: 6, padding: '8px', borderTop: `1px solid ${C.border}` }}>
              <button onMouseDown={e => e.stopPropagation()} onClick={clear} style={{ flex: 1, fontSize: 11.5, fontWeight: 600, padding: '5px 0', borderRadius: 6, border: `1.5px solid ${C.border2}`, background: 'transparent', color: C.t2, cursor: 'pointer', fontFamily: 'var(--font)' }}>Clear</button>
              <button onMouseDown={e => e.stopPropagation()} onClick={() => setPending(filtered)} style={{ flex: 1, fontSize: 11.5, fontWeight: 600, padding: '5px 0', borderRadius: 6, border: `1.5px solid ${C.border2}`, background: 'transparent', color: C.t2, cursor: 'pointer', fontFamily: 'var(--font)' }}>Select All</button>
              <button onMouseDown={e => e.stopPropagation()} onClick={apply} style={{ flex: 1, fontSize: 11.5, fontWeight: 700, padding: '5px 0', borderRadius: 6, border: 'none', background: C.t1, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)' }}>Apply</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const CHART_METRICS = [
  { id: 'net_rev', label: 'Net Revenue', key: ch => ch + '_net' },
  { id: 'rev', label: 'Gross Revenue Inc GST', key: ch => ch },
  { id: 'units', label: 'Units', key: ch => ch + '_u' },
]
const CHART_TYPES = [
  { id: 'line', label: 'Line' },
  { id: 'bar', label: 'Bar' },
  { id: 'area', label: 'Area' },
]

function ChannelTrendCard({ dailyArr, channels, rangeStart, rangeEnd }) {
  const [metric, setMetric] = useState('net_rev')
  const chartType = 'line'
  const m = CHART_METRICS.find(x => x.id === metric)
  const dataKey = m.key
  const fmtTick = v => v >= 1e5 ? `${(v / 1e5).toFixed(0)}L` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v
  const selStyle = { fontSize: 11.5, padding: '4px 8px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer' }

  const nDays = dailyArr.length
  const autoGroup = nDays <= 14 ? 'daily' : nDays <= 90 ? 'weekly' : 'monthly'
  const [groupBy, setGroupBy] = useState(autoGroup)

  const grouped = groupDailyArr(dailyArr, channels, groupBy, rangeStart, rangeEnd)
  const enrichedDaily = grouped.map(row => {
    const total = channels.reduce((s, ch) => s + (row[dataKey(ch)] || 0), 0)
    return { ...row, _total: total }
  })

  const totalTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const row = payload[0]?.payload || {}
    const total = row._total || 0
    const chEntries = channels.map(ch => ({ ch, val: row[dataKey(ch)] || 0 })).filter(x => x.val > 0).sort((a, b) => b.val - a.val)
    const fmtV = v => metric === 'units' ? fmtN(v) : fmt(v)
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 11, minWidth: 160, boxShadow: '0 2px 8px rgba(0,0,0,.12)' }}>
        <div style={{ fontWeight: 700, color: C.t2, marginBottom: 5 }}>{label?.slice(5) || label}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontWeight: 700, color: C.t1, marginBottom: 5, paddingBottom: 5, borderBottom: `1px solid ${C.border}` }}>
          <span>Total</span><span style={{ fontFamily: 'var(--mono)' }}>{fmtV(total)}</span>
        </div>
        {chEntries.map(({ ch, val }) => (
          <div key={ch} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: C.t2, marginBottom: 2 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: C.ch[ch] || C.acc, display: 'inline-block', flexShrink: 0 }} />{ch === 'offline_sales' ? 'Offline Sales' : ch === 'Shopify' ? 'D2C' : ch}</span>
            <span style={{ fontFamily: 'var(--mono)', color: C.t1 }}>{fmtV(val)}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{GROUP_OPTS.find(x => x.id === groupBy)?.label} {m.label} by Channel</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={selStyle}>
            {GROUP_OPTS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          <select value={metric} onChange={e => setMetric(e.target.value)} style={selStyle}>
            {CHART_METRICS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={enrichedDaily} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="chTotalGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={C.acm} stopOpacity={0.18} />
              <stop offset="95%" stopColor={C.acm} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => {
            if (groupBy === 'daily') return d?.slice(5)
            if (groupBy === 'monthly' && d?.match(/^\d{4}-\d{2}$/)) {
              const [y, m] = d.split('-')
              return new Date(+y, +m - 1).toLocaleString('en-US', { month: 'short' }) + " '" + y.slice(2)
            }
            return d
          }} />
          <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={fmtTick} width={40} />
          <Tooltip content={totalTooltip} />
          <Area type="monotone" dataKey="_total" name="Total" stroke={C.acm} strokeWidth={2.5} fill="url(#chTotalGrad)" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  )
}

const DAILY_METRICS = [
  { id: 'net_rev', label: 'Net Revenue' },
  { id: 'rev', label: 'Gross Revenue Inc GST' },
  { id: 'units', label: 'Units' },
]

function ordSuffix(n) {
  const s = ['th','st','nd','rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function getWeekBucketKey(date, rangeStart) {
  const d = new Date(date + 'T00:00:00')
  const rs = new Date(rangeStart + 'T00:00:00')
  const diffDays = Math.floor((d - rs) / 86400000)
  const bucketIdx = Math.floor(diffDays / 7)
  const bucketStart = new Date(rs); bucketStart.setDate(rs.getDate() + bucketIdx * 7)
  const bucketEnd = new Date(bucketStart); bucketEnd.setDate(bucketStart.getDate() + 6)
  const mon = bucketStart.toLocaleString('en-US', { month: 'short' })
  const yr = String(bucketStart.getFullYear()).slice(2)
  const endMon = bucketEnd.toLocaleString('en-US', { month: 'short' })
  const endLabel = bucketStart.getMonth() !== bucketEnd.getMonth()
    ? `${ordSuffix(bucketEnd.getDate())} ${endMon}`
    : ordSuffix(bucketEnd.getDate())
  return { key: `${bucketIdx}`, label: `${mon} '${yr} ${ordSuffix(bucketStart.getDate())}–${endLabel}`, sortKey: bucketStart.toISOString().slice(0, 10) }
}

function groupDailyArr(dailyArr, channels, groupBy, rangeStart, rangeEnd) {
  if (groupBy === 'daily') {
    if (!rangeStart || dailyArr.length === 0) return dailyArr
    const endDate = rangeEnd || dailyArr[dailyArr.length - 1]?.date
    if (!endDate) return dailyArr
    const map = Object.fromEntries(dailyArr.map(d => [d.date, d]))
    const result = []
    const cur = new Date(rangeStart + 'T00:00:00')
    const end = new Date(endDate + 'T00:00:00')
    while (cur <= end) {
      const key = cur.toISOString().slice(0, 10)
      const empty = { date: key }
      channels.forEach(ch => { empty[ch] = 0; empty[ch + '_net'] = 0; empty[ch + '_o'] = 0; empty[ch + '_u'] = 0 })
      result.push(map[key] || empty)
      cur.setDate(cur.getDate() + 1)
    }
    return result
  }
  const map = {}, labelMap = {}, sortMap = {}
  dailyArr.forEach(d => {
    let key
    if (groupBy === 'weekly' && rangeStart) {
      const { key: k, label, sortKey } = getWeekBucketKey(d.date, rangeStart)
      key = k; labelMap[k] = label; sortMap[k] = sortKey
    } else {
      key = getGroupKey(d.date, groupBy)
    }
    if (!map[key]) { map[key] = { date: labelMap[key] || key, _sort: sortMap[key] || key }; channels.forEach(ch => { map[key][ch] = 0; map[key][ch + '_net'] = 0; map[key][ch + '_o'] = 0; map[key][ch + '_u'] = 0 }) }
    channels.forEach(ch => {
      map[key][ch] = (map[key][ch] || 0) + (d[ch] || 0)
      map[key][ch + '_net'] = (map[key][ch + '_net'] || 0) + (d[ch + '_net'] ?? d[ch] ?? 0)
      map[key][ch + '_o'] = (map[key][ch + '_o'] || 0) + (d[ch + '_o'] || 0)
      map[key][ch + '_u'] = (map[key][ch + '_u'] || 0) + (d[ch + '_u'] || 0)
    })
  })
  return Object.values(map).sort((a, b) => a._sort.localeCompare(b._sort))
}

function DailyChannelTable({ dailyArr, channels, nDays = 7, rangeStart, rangeEnd }) {
  const autoGroup = nDays <= 14 ? 'daily' : nDays <= 90 ? 'weekly' : 'monthly'
  const [metric, setMetric] = useState('net_rev')
  const [groupBy, setGroupBy] = useState(autoGroup)
  const m = DAILY_METRICS.find(x => x.id === metric)
  const grouped = groupDailyArr(dailyArr, channels, groupBy, rangeStart, rangeEnd)
  const table = useSortableTable('date', 'desc')
  const channelReorder = useReorderableColumns('datatable-cols:revenue-by-channel', channels.map(ch => ({ id: ch })))
  const orderedChannels = channelReorder.orderedColumns.map(c => c.id)

  const getVal = (d, ch) => {
    if (metric === 'net_rev') return d[ch + '_net'] ?? d[ch] ?? 0
    if (metric === 'rev') return d[ch] || 0
    if (metric === 'orders') return d[ch + '_o'] || 0
    if (metric === 'units') return d[ch + '_u'] || 0
    if (metric === 'aov') { const o = d[ch + '_o'] || 0; return o ? (d[ch] || 0) / o : 0 }
    if (metric === 'asp') { const u = d[ch + '_u'] || 0; return u ? (d[ch] || 0) / u : 0 }
    return 0
  }
  const fmtVal = v => {
    if (metric === 'net_rev' || metric === 'rev') return fmt(v)
    if (metric === 'aov' || metric === 'asp') return v > 0 ? `₹${Math.round(v).toLocaleString('en-IN')}` : '—'
    return fmtN(v)
  }
  const getTotalVal = d => {
    if (metric === 'net_rev') return channels.reduce((s, ch) => s + (d[ch + '_net'] ?? d[ch] ?? 0), 0)
    if (metric === 'rev') return channels.reduce((s, ch) => s + (d[ch] || 0), 0)
    if (metric === 'orders') return channels.reduce((s, ch) => s + (d[ch + '_o'] || 0), 0)
    if (metric === 'units') return channels.reduce((s, ch) => s + (d[ch + '_u'] || 0), 0)
    if (metric === 'aov') { const o = channels.reduce((s, ch) => s + (d[ch + '_o'] || 0), 0); const r = channels.reduce((s, ch) => s + (d[ch] || 0), 0); return o ? r / o : 0 }
    if (metric === 'asp') { const u = channels.reduce((s, ch) => s + (d[ch + '_u'] || 0), 0); const r = channels.reduce((s, ch) => s + (d[ch] || 0), 0); return u ? r / u : 0 }
    return 0
  }

  const selStyle = { fontSize: 11.5, padding: '4px 8px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer' }

  // Column totals
  const colTotals = {}
  channels.forEach(ch => { colTotals[ch] = grouped.reduce((s, d) => s + getVal(d, ch), 0) })
  const grandTotal = channels.reduce((s, ch) => s + colTotals[ch], 0)

  const fmtDate = d => {
    if (!d || d.length < 8) return d
    if (groupBy !== 'daily') return d
    const dt = new Date(d + 'T00:00:00')
    return dt.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const getters = { date: d => d.date, total: d => getTotalVal(d) }
  channels.forEach(ch => { getters[ch] = d => getVal(d, ch) })
  const sortedRows = table.sortRows(grouped, getters)
  const { Th } = table

  // Same visual language as the Category Revenue Matrix: C.bg sticky header band, sortable
  // columns, hover-highlighted rows, bold sticky-bottom Total row. Numbers only — no per-cell
  // share % (that's what Channel Share is for).
  const thStyle = { fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4, padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: `1.5px solid ${C.border}` }
  const thStyleL = { ...thStyle, textAlign: 'left' }
  const tdStyle = { fontSize: 12, padding: '5px 10px', textAlign: 'right', color: C.t1, borderBottom: `1px solid ${C.border}`, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const tdStyleL = { ...tdStyle, textAlign: 'left', fontFamily: 'inherit' }
  const totalTdStyle = { ...tdStyle, padding: '7px 10px', fontWeight: 700, color: C.t1, borderBottom: 'none' }

  const handleExport = () => {
    const csvRows = sortedRows.map(d => {
      const row = { Period: fmtDate(d.date) }
      channels.forEach(ch => { row[ch === 'offline_sales' ? 'Offline Sales' : ch === 'Shopify' ? 'D2C' : ch] = Math.round(getVal(d, ch)) })
      row.Total = Math.round(getTotalVal(d))
      return row
    })
    exportCSV(csvRows, `revenue_by_channel_${metric}.csv`)
  }

  return (
    <div className="kpi-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: C.t1 }}>Revenue by Channel</span>
          <span style={{ fontSize: 11.5, color: C.t3 }}>{grouped.length} {groupBy === 'daily' ? 'days' : groupBy === 'weekly' ? 'weeks' : 'periods'}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={selStyle}>
            {GROUP_OPTS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          <select value={metric} onChange={e => setMetric(e.target.value)} style={selStyle}>
            {DAILY_METRICS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          {!channelReorder.isDefaultOrder && (
            <button onClick={channelReorder.resetOrder} title="Reset column order to default"
              style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
              ↺ Reset columns
            </button>
          )}
          <button onClick={handleExport} style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>⭳ Export</button>
        </div>
      </div>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 420 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 700 }}>
          <colgroup>
            <col style={{ width: `${Math.max(14, 100 - channels.length * 9 - 10)}%` }} />
            {orderedChannels.map(ch => <col key={ch} style={{ width: `${Math.min(12, 80 / channels.length)}%` }} />)}
            <col style={{ width: '10%' }} />
          </colgroup>
          <thead>
            <tr style={{ background: C.bg }}>
              <Th label="Period" sortKey="date" style={{ ...thStyleL, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }} align="left" />
              {orderedChannels.map(ch => (
                <Th key={ch} label={ch === 'offline_sales' ? 'Offline Sales' : ch === 'Shopify' ? 'D2C' : ch} sortKey={ch} style={{ ...thStyle, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}
                  dragProps={{ onDragStart: channelReorder.onDragStart(ch), onDragOver: channelReorder.onDragOver, onDrop: channelReorder.onDrop(ch) }} />
              ))}
              <Th label="Total" sortKey="total" style={{ ...thStyle, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((d, i) => (
              <tr key={i} onMouseEnter={e => e.currentTarget.style.background = '#FFFBE6'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={tdStyleL}>{fmtDate(d.date)}</td>
                {orderedChannels.map(ch => {
                  const v = getVal(d, ch)
                  return <td key={ch} style={{ ...tdStyle, color: v ? C.t1 : C.t3 }}>{v ? fmtVal(v) : '—'}</td>
                })}
                <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtVal(getTotalVal(d))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: C.bg, borderTop: `1.5px solid ${C.border}` }}>
              <td style={{ ...totalTdStyle, textAlign: 'left' }}>Total</td>
              {orderedChannels.map(ch => <td key={ch} style={totalTdStyle}>{fmtVal(colTotals[ch])}</td>)}
              <td style={totalTdStyle}>{fmtVal(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function CategoryChannelMatrix({ heatData, channels, maxHeat, subCatChannelMap = {}, skuChannelMap = {} }) {
  const [expanded, setExpanded] = useState({})
  const [expandedSC, setExpandedSC] = useState({})
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()

  // Compute which cats/subCats should auto-open due to search match
  const autoOpenCats = q ? new Set(heatData.filter(row => {
    if (row.cat.toLowerCase().includes(q)) return true
    const subCats = subCatChannelMap[row.cat] || {}
    for (const sc of Object.keys(subCats)) {
      if (sc.toLowerCase().includes(q)) return true
      const skus = skuChannelMap[row.cat]?.[sc] || {}
      for (const sku of Object.keys(skus)) { if (sku.toLowerCase().includes(q)) return true }
    }
    return false
  }).map(r => r.cat)) : null

  const autoOpenSCs = q ? new Set(heatData.flatMap(row =>
    Object.keys(subCatChannelMap[row.cat] || {}).filter(sc => {
      if (sc.toLowerCase().includes(q)) return true
      return Object.keys(skuChannelMap[row.cat]?.[sc] || {}).some(sku => sku.toLowerCase().includes(q))
    }).map(sc => `${row.cat}::${sc}`)
  )) : null

  // expanded[cat]: undefined = follow auto, true = forced open, false = forced closed
  const isOpen = cat => {
    if (expanded[cat] === true) return true
    if (expanded[cat] === false) return false
    return q ? autoOpenCats?.has(cat) : false
  }
  const isScOpen = key => {
    if (expandedSC[key] === true) return true
    if (expandedSC[key] === false) return false
    return q ? autoOpenSCs?.has(key) : false
  }

  const toggle = cat => setExpanded(prev => ({ ...prev, [cat]: !isOpen(cat) }))
  const toggleSC = key => setExpandedSC(prev => ({ ...prev, [key]: !isScOpen(key) }))

  const highlight = text => {
    if (!q) return text
    const idx = String(text).toLowerCase().indexOf(q)
    if (idx === -1) return text
    const s = String(text)
    return <>{s.slice(0, idx)}<mark style={{ background: '#FFF176', padding: 0, borderRadius: 2 }}>{s.slice(idx, idx + q.length)}</mark>{s.slice(idx + q.length)}</>
  }

  const filteredHeatData = q ? heatData.filter(row => {
    if (row.cat.toLowerCase().includes(q)) return true
    const subCats = subCatChannelMap[row.cat] || {}
    for (const sc of Object.keys(subCats)) {
      if (sc.toLowerCase().includes(q)) return true
      const skus = skuChannelMap[row.cat]?.[sc] || {}
      for (const sku of Object.keys(skus)) {
        if (sku.toLowerCase().includes(q)) return true
      }
    }
    return false
  }) : heatData

  const renderCell = (v, rowTotal) => {
    const intensity = rowTotal > 0 ? v / rowTotal : 0
    const share = rowTotal > 0 ? (v / rowTotal * 100).toFixed(2) : 0
    const cls = intensity === 0 ? 'h0' : intensity < 0.1 ? 'h1' : intensity < 0.3 ? 'h2' : intensity < 0.6 ? 'h3' : 'h4'
    return { cls, content: v > 0 ? <>{fmt(v)}<span style={{ fontSize: 9, fontWeight: 500, color: 'rgba(0,0,0,0.38)', marginLeft: 3 }}>{share}%</span></> : '—' }
  }

  return (
    <Card title="Category × Channel Revenue Matrix" action={
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search category, sub-category or SKU…"
        style={{ width: 260, padding: '4px 10px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11.5, color: C.t1, background: C.bg, outline: 'none' }}
      />
    }>
      <div className="tbl-wrap">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 700 }}>
          <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}>
            <tr>
              <th style={{ textAlign: 'left', padding: '5px 8px 7px', borderBottom: `2px solid ${C.border}`, color: C.t1, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em' }}>Category</th>
              {channels.map(ch => <th key={ch} style={{ textAlign: 'right', padding: '5px 8px 7px', borderBottom: `2px solid ${C.border}`, borderLeft: `1px solid ${C.border}`, color: C.t1, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch === 'offline_sales' ? 'Offline Sales' : ch === 'Shopify' ? 'D2C' : ch}</th>)}
              <th style={{ textAlign: 'right', padding: '5px 8px 7px', borderBottom: `2px solid ${C.border}`, borderLeft: `1px solid ${C.border}`, color: C.t1, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filteredHeatData.map((row, i) => {
              const rowTotal = channels.reduce((s, ch) => s + (row[ch] || 0), 0)
              const catOpen = isOpen(row.cat)
              const subCats = Object.entries(subCatChannelMap[row.cat] || {}).filter(([sc]) => {
                if (!q) return true
                if (row.cat.toLowerCase().includes(q)) return true
                if (sc.toLowerCase().includes(q)) return true
                const skus = skuChannelMap[row.cat]?.[sc] || {}
                return Object.keys(skus).some(sku => sku.toLowerCase().includes(q))
              }).sort((a, b) => {
                const ta = channels.reduce((s, ch) => s + (b[1][ch] || 0), 0)
                const tb = channels.reduce((s, ch) => s + (a[1][ch] || 0), 0)
                return ta - tb
              })
              const hasSubCats = subCats.length > 0
              return (
                <Fragment key={i}>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }} onMouseEnter={e => e.currentTarget.style.background = '#FFFDF0'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '6px 8px', fontWeight: 600, color: C.t2, overflow: 'hidden' }}>
                      <span
                        onClick={() => hasSubCats && !q && toggle(row.cat)}
                        title={row.cat}
                        style={{ cursor: hasSubCats && !q ? 'pointer' : 'default', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}
                      >
                        {hasSubCats && <span style={{ fontSize: 9, color: C.t3, flexShrink: 0, display: 'inline-block', transform: catOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{highlight(row.cat)}</span>
                      </span>
                    </td>
                    {channels.map(ch => {
                      const v = row[ch] || 0
                      const { cls, content } = renderCell(v, rowTotal)
                      return <td key={ch} className={cls} style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11.5, borderLeft: `1px solid ${C.border}` }}>{content}</td>
                    })}
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)', fontSize: 11.5, borderLeft: `1px solid ${C.border}` }}>{fmt(rowTotal)}</td>
                  </tr>
                  {catOpen && subCats.map(([sc, chData]) => {
                    const scTotal = channels.reduce((s, ch) => s + (chData[ch] || 0), 0)
                    const scKey = `${row.cat}::${sc}`
                    const skus = Object.entries(skuChannelMap[row.cat]?.[sc] || {}).filter(([sku]) => {
                      if (!q) return true
                      if (row.cat.toLowerCase().includes(q) || sc.toLowerCase().includes(q)) return true
                      return sku.toLowerCase().includes(q)
                    }).sort((a, b) => {
                      const ta = channels.reduce((s, ch) => s + (b[1][ch] || 0), 0)
                      const tb = channels.reduce((s, ch) => s + (a[1][ch] || 0), 0)
                      return ta - tb
                    })
                    const hasSkus = skus.length > 0
                    const scOpen = isScOpen(scKey)
                    return (
                      <Fragment key={sc}>
                        <tr style={{ borderBottom: `1px solid ${C.border}`, background: '#FAFAF7' }}>
                          <td style={{ padding: '3px 4px 3px 18px', color: C.t2, fontSize: 10, overflow: 'hidden' }}>
                            <span onClick={() => hasSkus && !q && toggleSC(scKey)} title={sc} style={{ cursor: hasSkus && !q ? 'pointer' : 'default', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                              {hasSkus && <span style={{ fontSize: 8, color: C.t3, flexShrink: 0, display: 'inline-block', transform: scOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>}
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>└ {highlight(sc)}</span>
                            </span>
                          </td>
                          {channels.map(ch => {
                            const v = chData[ch] || 0
                            const { cls, content } = renderCell(v, scTotal)
                            return <td key={ch} className={cls} style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10.5, borderLeft: `1px solid ${C.border}` }}>{content}</td>
                          })}
                          <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, color: C.t2, fontFamily: 'var(--mono)', fontSize: 10.5, borderLeft: `1px solid ${C.border}` }}>{fmt(scTotal)}</td>
                        </tr>
                        {scOpen && skus.map(([sku, skuChData]) => {
                          const skuTotal = channels.reduce((s, ch) => s + (skuChData[ch] || 0), 0)
                          return (
                            <tr key={sku} style={{ borderBottom: `1px solid ${C.border}`, background: '#F5F5F0' }}>
                              <td style={{ padding: '2px 4px 2px 32px', color: C.t3, fontSize: 9.5, fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sku}>└ {highlight(sku)}</td>
                              {channels.map(ch => {
                                const v = skuChData[ch] || 0
                                const { cls, content } = renderCell(v, skuTotal)
                                return <td key={ch} className={cls} style={{ padding: '3px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10, borderLeft: `1px solid ${C.border}` }}>{content}</td>
                              })}
                              <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 500, color: C.t3, fontFamily: 'var(--mono)', fontSize: 10, borderLeft: `1px solid ${C.border}` }}>{fmt(skuTotal)}</td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function AmazonCategoryMatrix({ channels, catChannel, subCatChannel, skuChannel, title }) {
  const [expanded, setExpanded] = useState({})
  const [expandedSC, setExpandedSC] = useState({})
  const [metric, setMetric] = useState('rev')
  const [search, setSearch] = useState('')
  const toggle = cat => setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }))
  const toggleSC = key => setExpandedSC(prev => ({ ...prev, [key]: !prev[key] }))

  const fmtVal = v => metric === 'rev' ? fmt(v) : fmtN(v)
  const getVal = obj => obj ? (metric === 'rev' ? obj.rev : metric === 'units' ? obj.units : obj.orders) : 0

  const q = search.trim().toLowerCase()
  const hlAm = text => {
    if (!q) return text
    const idx = String(text).toLowerCase().indexOf(q)
    if (idx === -1) return text
    const s = String(text)
    return <>{s.slice(0, idx)}<mark style={{ background: '#FFF176', padding: 0, borderRadius: 2 }}>{s.slice(idx, idx + q.length)}</mark>{s.slice(idx + q.length)}</>
  }

  // Build sorted category list
  const cats = Object.entries(catChannel || {}).map(([cat, chData]) => {
    const total = channels.reduce((s, ch) => s + getVal(chData[ch]), 0)
    return { cat, chData, total }
  }).sort((a, b) => b.total - a.total)

  const colTotals = {}
  channels.forEach(ch => { colTotals[ch] = cats.reduce((s, r) => s + getVal(r.chData[ch]), 0) })
  const grandTotal = channels.reduce((s, ch) => s + (colTotals[ch] || 0), 0)

  const filteredCatsAm = q ? cats.filter(row => {
    if (row.cat.toLowerCase().includes(q)) return true
    const subCats = subCatChannel?.[row.cat] || {}
    for (const sc of Object.keys(subCats)) {
      if (sc.toLowerCase().includes(q)) return true
      const skus = skuChannel?.[row.cat]?.[sc] || {}
      if (Object.keys(skus).some(sku => sku.toLowerCase().includes(q))) return true
    }
    return false
  }) : cats
  const amAutoExp = q ? new Set(filteredCatsAm.map(r => r.cat)) : null
  const amAutoExpSC = q ? new Set(filteredCatsAm.flatMap(row =>
    Object.keys(subCatChannel?.[row.cat] || {}).filter(sc => {
      if (sc.toLowerCase().includes(q)) return true
      return Object.keys(skuChannel?.[row.cat]?.[sc] || {}).some(sku => sku.toLowerCase().includes(q))
    }).map(sc => `${row.cat}::${sc}`)
  )) : null
  const amIsOpen = cat => q ? amAutoExp?.has(cat) : expanded[cat]
  const amIsScOpen = key => q ? amAutoExpSC?.has(key) : expandedSC[key]

  const renderCell = (v, rowTotal) => {
    const intensity = rowTotal > 0 ? v / rowTotal : 0
    const share = rowTotal > 0 ? (v / rowTotal * 100).toFixed(2) : 0
    const cls = intensity === 0 ? 'h0' : intensity < 0.1 ? 'h1' : intensity < 0.3 ? 'h2' : intensity < 0.6 ? 'h3' : 'h4'
    return { cls, content: v > 0 ? <>{fmtVal(v)}<span style={{ fontSize: 9, fontWeight: 500, color: 'rgba(0,0,0,0.38)', marginLeft: 3 }}>{share}%</span></> : '—' }
  }

  const CH_COLORS = { FBA: '#E8930A', MFN: '#2E74CC', 'Seller Central': '#E8930A', 'Vendor Central': '#2E74CC' }

  return (
    <Card title={title || 'Category × Channel Revenue Matrix'} action={
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ width: 180, padding: '3px 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, color: C.t1, background: C.bg, outline: 'none' }} />
        <div style={{ display: 'flex', gap: 3 }}>
          {[['rev','Revenue'],['units','Units'],['orders','Orders']].map(([k,l]) => (
            <button key={k} onClick={() => setMetric(k)} style={{ fontSize: 10, fontWeight: metric===k?700:500, padding: '2px 8px', borderRadius: 4, border: `1px solid ${metric===k?C.acm:C.border}`, background: metric===k?C.acc:'transparent', color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)' }}>{l}</button>
          ))}
        </div>
      </div>
    }>
      <div className="tbl-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 500, fontWeight: 400 }}>
          <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}>
            <tr>
              <th style={{ textAlign: 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: C.t3, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Category</th>
              {channels.map(ch => <th key={ch} style={{ textAlign: 'right', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: C.t1, fontSize: 10, fontWeight: 700 }}>{ch}</th>)}
              <th style={{ textAlign: 'right', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: C.t1, fontSize: 10, fontWeight: 700 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filteredCatsAm.map((row, i) => {
              const catOpen = amIsOpen(row.cat)
              const subCats = Object.entries(subCatChannel?.[row.cat] || {}).map(([sc, chData]) => ({
                sc, chData, total: channels.reduce((s, ch) => s + getVal(chData[ch]), 0)
              })).filter(({ sc }) => {
                if (!q || row.cat.toLowerCase().includes(q)) return true
                if (sc.toLowerCase().includes(q)) return true
                return Object.keys(skuChannel?.[row.cat]?.[sc] || {}).some(sku => sku.toLowerCase().includes(q))
              }).sort((a, b) => b.total - a.total)
              const hasSubCats = Object.keys(subCatChannel?.[row.cat] || {}).length > 0
              return (
                <Fragment key={row.cat}>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '5px', color: C.t1 }}>
                      <span onClick={() => hasSubCats && !q && toggle(row.cat)} style={{ cursor: hasSubCats && !q ? 'pointer' : 'default', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {hasSubCats && <span style={{ fontSize: 9, color: C.t3, display: 'inline-block', transform: catOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>}
                        {hlAm(row.cat)}
                      </span>
                    </td>
                    {channels.map(ch => {
                      const v = getVal(row.chData[ch])
                      const { cls, content } = renderCell(v, row.total)
                      return <td key={ch} className={cls} style={{ padding: '5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 400 }}>{content}</td>
                    })}
                    <td style={{ padding: '5px', textAlign: 'right', fontWeight: 600, color: C.t1, fontFamily: 'var(--mono)', fontSize: 11 }}>{fmtVal(row.total)}</td>
                  </tr>
                  {catOpen && subCats.map(({ sc, chData, total: scTotal }) => {
                    const scKey = `${row.cat}::${sc}`
                    const skus = Object.entries(skuChannel?.[row.cat]?.[sc] || {}).map(([sku, chD]) => ({
                      sku, chD, total: channels.reduce((s, ch) => s + getVal(chD[ch]), 0)
                    })).filter(({ sku }) => {
                      if (!q || row.cat.toLowerCase().includes(q) || sc.toLowerCase().includes(q)) return true
                      return sku.toLowerCase().includes(q)
                    }).sort((a, b) => b.total - a.total)
                    const hasSkus = Object.keys(skuChannel?.[row.cat]?.[sc] || {}).length > 0
                    const scOpen = amIsScOpen(scKey)
                    return (
                      <Fragment key={sc}>
                        <tr style={{ borderBottom: `1px solid ${C.border}`, background: '#FAFAF7' }}>
                          <td style={{ padding: '3px 4px 3px 18px', color: C.t2, fontSize: 10, overflow: 'hidden' }}>
                            <span onClick={() => hasSkus && !q && toggleSC(scKey)} title={sc} style={{ cursor: hasSkus && !q ? 'pointer' : 'default', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                              {hasSkus && <span style={{ fontSize: 8, color: C.t3, flexShrink: 0, display: 'inline-block', transform: scOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>}
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>└ {hlAm(sc)}</span>
                            </span>
                          </td>
                          {channels.map(ch => {
                            const v = getVal(chData[ch])
                            const { cls, content } = renderCell(v, scTotal)
                            return <td key={ch} className={cls} style={{ padding: '4px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 400 }}>{content}</td>
                          })}
                          <td style={{ padding: '4px 5px', textAlign: 'right', fontWeight: 500, color: C.t2, fontFamily: 'var(--mono)', fontSize: 10.5 }}>{fmtVal(scTotal)}</td>
                        </tr>
                        {scOpen && skus.map(({ sku, chD, total: skuTotal }) => (
                          <tr key={sku} style={{ borderBottom: `1px solid ${C.border}`, background: '#F5F5F0' }}>
                            <td style={{ padding: '2px 4px 2px 32px', color: C.t3, fontSize: 9.5, fontFamily: 'var(--mono)' }}>└ {hlAm(sku)}</td>
                            {channels.map(ch => {
                              const v = getVal(chD[ch])
                              const { cls, content } = renderCell(v, skuTotal)
                              return <td key={ch} className={cls} style={{ padding: '3px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 400 }}>{content}</td>
                            })}
                            <td style={{ padding: '3px 5px', textAlign: 'right', fontWeight: 400, color: C.t3, fontFamily: 'var(--mono)', fontSize: 10 }}>{fmtVal(skuTotal)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.border}`, background: C.bg }}>
              <td style={{ padding: '5px 6px', fontSize: 10.5, fontWeight: 700, color: C.t1 }}>Total</td>
              {channels.map(ch => (
                <td key={ch} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1, borderLeft: `1px solid ${C.border}` }}>
                  {fmtVal(colTotals[ch])}
                  {metric === 'rev' && grandTotal ? <span style={{ fontSize: 10, fontWeight: 400, color: C.t3, marginLeft: 4 }}>{(colTotals[ch] / grandTotal * 100).toFixed(1)}%</span> : null}
                </td>
              ))}
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1, borderLeft: `1px solid ${C.border}` }}>{fmtVal(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}

// FinancialCategoryMatrix: Gross Rev, Units, ASP, GST, Cancel, RTO, CIR, Exch, Returns, Net Rev
// With optional extras when neutral=true: Prev Rev, MoM %, Cum %, Cancel/RTO/CIR/Exch % chips
// Flat Category + Product table (every row visible without expanding the category) — click a
// product's name to expand its SKU-level variants below it, same interaction as the Inventory
// Detail table. Contrast with FinancialCategoryMatrix's pivot (Category → expand → Sub-cat →
// expand → SKU), which stays unchanged for the other tabs still using it.
// simpleReturns: marketplaces (Amazon/Flipkart/Myntra) only report one combined Return %, with
// no Cancel/RTO/CIR/Exch breakdown like D2C/EBO have — pass true to collapse to a single column.
// detailedReturns: shows the full Cancel %/RTO %/CIR %/Exchange %/Total Return % breakdown
// (D2C, EBO — channels with real per-status return data) instead of just a single combined
// "Total Return %" column (All Channels, Amazon/Flipkart/CRED/Firstcry/Myntra via
// simpleReturns) — explicitly separate from `simpleReturns` since a channel can have
// showReturnPct=true with neither simpleReturns nor detailedReturns meaning "no return columns
// wired up yet" is no longer a valid state once showReturnPct is true; every showReturnPct
// caller must pick exactly one of simpleReturns/detailedReturns.
function FlatCategoryProductMatrix({ catData, subCatData, skuData, title, catPrevMap = {}, subCatPrevMap = {}, simpleReturns = false, detailedReturns = false, noReturns = false, showReturnPct = false, mobilityNetBySubCat = {} }) {
  const [expandedSku, setExpandedSku] = useState({})
  const [search, setSearch] = useState('')
  const toggleSku = key => setExpandedSku(prev => ({ ...prev, [key]: !prev[key] }))
  const table = useSortableTable('gross')

  const q = search.trim().toLowerCase()

  const mapRow = (d, scName, catName) => {
    const gross = d.rev || 0
    const excRev = d.excRev || 0
    const cancelRev = (d.cancelRev || 0) - (d.codCancelRev || 0)  // exclude COD cancels for D2C
    const rtoRev = d.rtoRev || 0
    const cirRev = d.cirRev || 0
    const exchRev = d.exchRev || 0
    const returnRev = d.returnRev || 0
    const gstRatio = gross > 0 ? (gross - excRev) / gross : 0
    const grossAfterReturns = gross - cancelRev - rtoRev - cirRev - returnRev
    const netStandard = grossAfterReturns * (1 - gstRatio)
    // Only use Mobility whitelist override for Mobility or Sparepart-category rows — the server
    // (api/bq.js's mobilityNetBySubCat) already excludes any other stray category, so anything
    // present here by the time it reaches this component legitimately belongs to one of these two.
    // Keyed 'Category::SubCategory' (see the reconciledMobilityNetBySubCat build site above) —
    // NOT bare SubCategory, since the same SubCategory name can exist under two Categories.
    const whitelistKey = `${catName}::${scName}`
    const net = ((catName === 'Mobility' || /^sparepart/i.test(catName || '')) && scName && mobilityNetBySubCat[whitelistKey] != null) ? mobilityNetBySubCat[whitelistKey] : netStandard
    return { gross, net, units: d.units || 0, cancelRev, rtoRev, cirRev, exchRev, returnRev }
  }
  const pctOf = (n, d) => d > 0 ? (n / d * 100) : 0

  // Flatten to one row per Category+Product (sub-category) — every product visible immediately.
  const allRows = []
  Object.entries(subCatData || {}).forEach(([cat, scMap]) => {
    Object.entries(scMap).forEach(([sc, d]) => {
      const r = mapRow(d, sc, cat)
      // Marketplaces report one combined return figure (d.returnRev) with no further breakdown;
      // D2C/EBO sum the four distinct statuses.
      const totalReturnRev = simpleReturns ? r.returnRev : r.cancelRev + r.rtoRev + r.cirRev + r.returnRev
      allRows.push({
        cat, sc, ...r, prevGross: subCatPrevMap[`${cat}::${sc}`] || 0,
        asp: r.units > 0 ? r.gross / r.units : 0,
        cancelPct: pctOf(r.cancelRev, r.gross), rtoPct: pctOf(r.rtoRev, r.gross), cirPct: pctOf(r.cirRev, r.gross), exchPct: pctOf(r.exchRev, r.gross),
        totalReturnPct: pctOf(totalReturnRev, r.gross),
      })
    })
  })
  const filteredRows = q ? allRows.filter(r => r.cat.toLowerCase().includes(q) || r.sc.toLowerCase().includes(q) || Object.keys(skuData?.[r.cat]?.[r.sc] || {}).some(sku => sku.toLowerCase().includes(q))) : allRows
  const getters = {
    cat: r => r.cat, sc: r => r.sc, gross: r => r.gross, units: r => r.units, asp: r => r.asp,
    prevGross: r => r.prevGross > 0 ? (r.gross - r.prevGross) / r.prevGross : -Infinity,
    cancelPct: r => r.cancelPct, rtoPct: r => r.rtoPct, cirPct: r => r.cirPct, exchPct: r => r.exchPct, totalReturnPct: r => r.totalReturnPct, net: r => r.net,
  }
  const rows = table.sortRows(filteredRows, getters)

  const tot = filteredRows.reduce((s, r) => ({
    gross: s.gross + r.gross, prevGross: s.prevGross + r.prevGross, net: s.net + r.net, units: s.units + r.units,
    cancelRev: s.cancelRev + r.cancelRev, rtoRev: s.rtoRev + r.rtoRev, cirRev: s.cirRev + r.cirRev, exchRev: s.exchRev + r.exchRev, returnRev: s.returnRev + r.returnRev,
  }), { gross: 0, prevGross: 0, net: 0, units: 0, cancelRev: 0, rtoRev: 0, cirRev: 0, exchRev: 0, returnRev: 0 })

  // Same visual language as the Ads tab's Platform Overview / By Category tables: C.bg sticky
  // header band, hover-highlighted rows, bold sticky-bottom Total row.
  const thStyle = { fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4, padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: `1.5px solid ${C.border}` }
  const thStyleL = { ...thStyle, textAlign: 'left' }
  const tdStyle = { fontSize: 12, padding: '5px 10px', textAlign: 'right', color: C.t1, borderBottom: `1px solid ${C.border}`, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const tdStyleL = { ...tdStyle, textAlign: 'left', fontFamily: 'inherit' }
  const totalTdStyle = { ...tdStyle, padding: '7px 10px', fontWeight: 700, color: C.t1, borderBottom: 'none' }
  // Flag in red only past the agreed threshold per metric — Cancel >3%, RTO >9%, CIR >9%,
  // Exch >6%, Total Return >20%. Normal text color otherwise (no gradient/amber tier).
  const pctCell = (n, d, threshold) => {
    if (d <= 0) return <span style={{ color: C.t3 }}>—</span>
    const v = pctOf(n, d)
    const isHigh = threshold != null && v > threshold
    return <span style={{ color: v <= 0 ? C.t3 : isHigh ? '#B91C1C' : 'inherit' }}>{v.toFixed(2)}%</span>
  }
  const vsPrevCell = (cur, prev) => {
    if (!prev || Math.abs(prev) < 1) return <span style={{ color: C.t3 }}>—</span>
    const p = (cur - prev) / prev * 100
    const positive = p >= 0
    return <span style={{ fontSize: 10.5, fontWeight: 700, color: positive ? '#0D9E68' : '#B91C1C' }}>{positive ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span>
  }
  const { Th } = table

  // Column registry. The detailed-returns breakdown (Cancel/RTO/CIR/Exchange/Total Return%) is
  // treated as 5 separate reorderable columns when detailedReturns is on; the simple variant is
  // just 1 column (Total Return%) — both keyed 'totalReturnPct' plus the extra 4 when detailed,
  // so a saved order from one variant degrades gracefully if the variant later changes for this
  // exact title (falls back to default per useReorderableColumns' validation).
  const ALL_COLUMNS = [
    { id: 'gross', label: 'Gross Rev / Share', sortKey: 'gross', width: 13,
      row: r => <td style={tdStyle}>{fmt(r.gross)}{tot.gross > 0 && <span style={{ fontSize: 10, color: C.t3, marginLeft: 4 }}>({(r.gross / tot.gross * 100).toFixed(1)}%)</span>}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{fmt(sk.gross)}{tot.gross > 0 && <span style={{ fontSize: 9, color: C.t3, marginLeft: 4 }}>({(sk.gross / tot.gross * 100).toFixed(1)}%)</span>}</td>,
      total: () => <td style={totalTdStyle}>{fmt(tot.gross)} <span style={{ color: C.t3, fontWeight: 400 }}>(100%)</span></td> },
    { id: 'prevGross', label: 'vs Prev', sortKey: 'prevGross', width: 9,
      row: r => <td style={tdStyle}>{vsPrevCell(r.gross, r.prevGross)}</td>,
      sku: () => <td style={{ ...tdStyle, fontSize: 11 }}><span style={{ color: C.t3 }}>—</span></td>,
      total: () => <td style={totalTdStyle}>{vsPrevCell(tot.gross, tot.prevGross)}</td> },
    { id: 'units', label: 'Units', sortKey: 'units', width: 8,
      row: r => <td style={tdStyle}>{fmtN(r.units)}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{fmtN(sk.units)}</td>,
      total: () => <td style={totalTdStyle}>{fmtN(tot.units)}</td> },
    { id: 'asp', label: 'ASP', sortKey: 'asp', width: showReturnPct && detailedReturns ? 8 : 10,
      row: r => <td style={tdStyle}>₹{Math.round(r.asp).toLocaleString('en-IN')}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>₹{(sk.units > 0 ? Math.round(sk.gross / sk.units) : 0).toLocaleString('en-IN')}</td>,
      total: () => <td style={totalTdStyle}>₹{tot.units > 0 ? Math.round(tot.gross / tot.units).toLocaleString('en-IN') : '—'}</td> },
    ...(showReturnPct && detailedReturns ? [
      { id: 'cancelPct', label: 'Cancel %', sortKey: 'cancelPct', width: 7,
        row: r => <td style={tdStyle}>{r.cancelPct > 0 ? `${r.cancelPct.toFixed(2)}%` : <span style={{ color: C.t3 }}>—</span>}</td>,
        sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{sk.cancelRev > 0 ? `${pctOf(sk.cancelRev, sk.gross).toFixed(2)}%` : <span style={{ color: C.t3 }}>—</span>}</td>,
        total: () => <td style={totalTdStyle}>{tot.gross > 0 ? `${pctOf(tot.cancelRev, tot.gross).toFixed(2)}%` : '—'}</td> },
      { id: 'rtoPct', label: 'RTO %', sortKey: 'rtoPct', width: 7,
        row: r => <td style={tdStyle}>{r.rtoPct > 0 ? `${r.rtoPct.toFixed(2)}%` : <span style={{ color: C.t3 }}>—</span>}</td>,
        sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{sk.rtoRev > 0 ? `${pctOf(sk.rtoRev, sk.gross).toFixed(2)}%` : <span style={{ color: C.t3 }}>—</span>}</td>,
        total: () => <td style={totalTdStyle}>{tot.gross > 0 ? `${pctOf(tot.rtoRev, tot.gross).toFixed(2)}%` : '—'}</td> },
      { id: 'cirPct', label: 'CIR %', sortKey: 'cirPct', width: 7,
        row: r => <td style={tdStyle}>{r.cirPct > 0 ? `${r.cirPct.toFixed(2)}%` : <span style={{ color: C.t3 }}>—</span>}</td>,
        sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{sk.cirRev > 0 ? `${pctOf(sk.cirRev, sk.gross).toFixed(2)}%` : <span style={{ color: C.t3 }}>—</span>}</td>,
        total: () => <td style={totalTdStyle}>{tot.gross > 0 ? `${pctOf(tot.cirRev, tot.gross).toFixed(2)}%` : '—'}</td> },
      { id: 'exchPct', label: 'Exchange %', sortKey: 'exchPct', width: 7,
        row: r => <td style={tdStyle}>{r.exchPct > 0 ? `${r.exchPct.toFixed(2)}%` : <span style={{ color: C.t3 }}>—</span>}</td>,
        sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{sk.exchRev > 0 ? `${pctOf(sk.exchRev, sk.gross).toFixed(2)}%` : <span style={{ color: C.t3 }}>—</span>}</td>,
        total: () => <td style={totalTdStyle}>{tot.gross > 0 ? `${pctOf(tot.exchRev, tot.gross).toFixed(2)}%` : '—'}</td> },
      { id: 'totalReturnPct', label: 'Total Return %', sortKey: 'totalReturnPct', width: 7,
        row: r => <td style={tdStyle}>{r.totalReturnPct > 0 ? <span style={{ color: r.totalReturnPct > 20 ? '#B91C1C' : 'inherit' }}>{r.totalReturnPct.toFixed(2)}%</span> : <span style={{ color: C.t3 }}>—</span>}</td>,
        sku: sk => { const skTotalReturnRev = simpleReturns ? sk.returnRev : sk.cancelRev + sk.rtoRev + sk.cirRev + sk.returnRev; return <td style={{ ...tdStyle, fontSize: 11 }}>{skTotalReturnRev > 0 ? <span style={{ color: pctOf(skTotalReturnRev, sk.gross) > 20 ? '#B91C1C' : 'inherit' }}>{pctOf(skTotalReturnRev, sk.gross).toFixed(2)}%</span> : <span style={{ color: C.t3 }}>—</span>}</td> },
        total: () => <td style={totalTdStyle}>{tot.gross > 0 ? <span style={{ color: pctOf(tot.cancelRev + tot.rtoRev + tot.cirRev + tot.returnRev, tot.gross) > 20 ? '#B91C1C' : 'inherit' }}>{pctOf(tot.cancelRev + tot.rtoRev + tot.cirRev + tot.returnRev, tot.gross).toFixed(2)}%</span> : '—'}</td> },
    ] : showReturnPct ? [
      { id: 'totalReturnPct', label: 'Total Return %', sortKey: 'totalReturnPct', width: 11,
        row: r => <td style={tdStyle}>{r.totalReturnPct > 0 ? <span style={{ color: r.totalReturnPct > 20 ? '#B91C1C' : 'inherit' }}>{r.totalReturnPct.toFixed(2)}%</span> : <span style={{ color: C.t3 }}>—</span>}</td>,
        sku: sk => { const skTotalReturnRev = simpleReturns ? sk.returnRev : sk.cancelRev + sk.rtoRev + sk.cirRev + sk.returnRev; return <td style={{ ...tdStyle, fontSize: 11 }}>{skTotalReturnRev > 0 ? <span style={{ color: pctOf(skTotalReturnRev, sk.gross) > 20 ? '#B91C1C' : 'inherit' }}>{pctOf(skTotalReturnRev, sk.gross).toFixed(2)}%</span> : <span style={{ color: C.t3 }}>—</span>}</td> },
        total: () => <td style={totalTdStyle}>{tot.gross > 0 ? <span style={{ color: pctOf(tot.cancelRev + tot.rtoRev + tot.cirRev + tot.returnRev, tot.gross) > 20 ? '#B91C1C' : 'inherit' }}>{pctOf(tot.cancelRev + tot.rtoRev + tot.cirRev + tot.returnRev, tot.gross).toFixed(2)}%</span> : '—'}</td> },
    ] : []),
    { id: 'net', label: 'Net Rev', sortKey: 'net', width: 9,
      row: r => <td style={tdStyle}>{fmt(r.net)}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{fmt(sk.net)}</td>,
      total: () => <td style={totalTdStyle}>{fmt(tot.net)}</td> },
  ]
  const reorder = useReorderableColumns(`datatable-cols:${title || 'category-revenue-matrix'}`, ALL_COLUMNS)

  const handleExport = () => {
    const csvRows = rows.flatMap(r => {
      const main = {
        Category: r.cat, Product: r.sc,
        'Gross Rev': Math.round(r.gross), 'Share %': tot.gross > 0 ? +(r.gross / tot.gross * 100).toFixed(1) : 0,
        'vs Prev %': r.prevGross > 0 ? +((r.gross - r.prevGross) / r.prevGross * 100).toFixed(1) : null,
        Units: r.units, ASP: Math.round(r.asp),
        'Net Rev': Math.round(r.net),
      }
      const skuRows = Object.entries(skuData?.[r.cat]?.[r.sc] || {}).map(([sku, d]) => {
        const sk = mapRow(d)
        const skTotalReturnRev = simpleReturns ? sk.returnRev : sk.cancelRev + sk.rtoRev + sk.cirRev + sk.returnRev
        return {
          Category: r.cat, Product: `↳ ${sku}`,
          'Gross Rev': Math.round(sk.gross), 'Share %': tot.gross > 0 ? +(sk.gross / tot.gross * 100).toFixed(1) : 0,
          Units: sk.units, ASP: sk.units > 0 ? Math.round(sk.gross / sk.units) : 0,
          'Net Rev': Math.round(sk.net),
        }
      })
      return [main, ...skuRows]
    })
    exportCSV(csvRows, `${(title || 'category_revenue_matrix').toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`)
  }

  return (
    <div className="kpi-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: C.t1 }}>{title || 'Category Revenue Matrix'}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search category / product…"
            style={{ fontSize: 11.5, padding: '4px 9px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.t1, width: 200, outline: 'none' }} />
          {!reorder.isDefaultOrder && <button onClick={reorder.resetOrder} title="Reset column order to default" style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>↺ Reset</button>}
          <button onClick={handleExport} style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>⭳ Export</button>
        </div>
      </div>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 560 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 760 }}>
          <colgroup>
            <col style={{ width: '16%' }} /><col style={{ width: '20%' }} />
            {reorder.orderedColumns.map(c => <col key={c.id} style={{ width: `${c.width}%` }} />)}
          </colgroup>
          <thead>
            <tr style={{ background: C.bg }}>
              <Th label="Category" sortKey="cat" style={{ ...thStyleL, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }} align="left" />
              <Th label="Product" sortKey="sc" style={{ ...thStyleL, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }} align="left" />
              {reorder.orderedColumns.map(c => (
                <Th key={c.id} label={c.label} sortKey={c.sortKey} style={{ ...thStyle, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}
                  dragProps={{ onDragStart: reorder.onDragStart(c.id), onDragOver: reorder.onDragOver, onDrop: reorder.onDrop(c.id) }} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const skuKey = `${r.cat}::${r.sc}`
              const isOpen = expandedSku[skuKey]
              const allSkus = Object.entries(skuData?.[r.cat]?.[r.sc] || {}).map(([sku, d]) => ({ sku, ...mapRow(d) })).sort((a, b) => b.gross - a.gross)
              const skus = q ? allSkus.filter(sk => r.cat.toLowerCase().includes(q) || r.sc.toLowerCase().includes(q) || sk.sku.toLowerCase().includes(q)) : allSkus
              const hasSkus = allSkus.length > 0
              return (
                <Fragment key={skuKey}>
                  <tr style={{ cursor: 'default' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FFFBE6'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={tdStyleL}>{r.cat}</td>
                    <td style={{ ...tdStyleL, fontWeight: 600 }}>
                      <span onClick={() => hasSkus && toggleSku(skuKey)} style={{ cursor: hasSkus ? 'pointer' : 'default', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {hasSkus && <span style={{ fontSize: 9, color: C.t3, display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>}
                        {r.sc}
                      </span>
                    </td>
                    {reorder.orderedColumns.map(c => <Fragment key={c.id}>{c.row(r)}</Fragment>)}
                  </tr>
                  {isOpen && skus.map(sk => (
                    <tr key={sk.sku} style={{ background: C.bg, cursor: 'default' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#FFFBE6'}
                      onMouseLeave={e => e.currentTarget.style.background = C.bg}>
                      <td style={{ ...tdStyleL, borderBottom: `1px solid ${C.border}` }}></td>
                      <td style={{ ...tdStyleL, borderBottom: `1px solid ${C.border}`, fontFamily: 'var(--mono)', fontSize: 11, color: C.t2, paddingLeft: 22 }}>└ {sk.sku}</td>
                      {reorder.orderedColumns.map(c => <Fragment key={c.id}>{c.sku(sk)}</Fragment>)}
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: C.bg, borderTop: `1.5px solid ${C.border}`, position: 'sticky', bottom: 0 }}>
              <td style={{ ...totalTdStyle, textAlign: 'left' }} colSpan={2}>Total</td>
              {reorder.orderedColumns.map(c => <Fragment key={c.id}>{c.total()}</Fragment>)}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function FinancialCategoryMatrix({ catData, subCatData, skuData, title, showReturns = true, neutral = false, showShare = false, showMoM = false, catPrevMap = {}, subCatPrevMap = {}, skuPrevMap = {} }) {
  const grossColor = C.t1
  const netColor = C.t1
  const cancelColor = C.t2
  const rtoColor = C.t2
  const cirColor = C.t2
  const exchColor = C.t2
  const returnColor = C.t2
  const [expanded, setExpanded] = useState({})
  const [expandedSC, setExpandedSC] = useState({})
  const [search, setSearch] = useState('')
  const toggle = cat => setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }))
  const toggleSC = key => setExpandedSC(prev => ({ ...prev, [key]: !prev[key] }))

  const q = search.trim().toLowerCase()
  const hlFin = text => {
    if (!q) return text
    const idx = String(text).toLowerCase().indexOf(q)
    if (idx === -1) return text
    const s = String(text)
    return <>{s.slice(0, idx)}<mark style={{ background: '#FFF176', padding: 0, borderRadius: 2 }}>{s.slice(idx, idx + q.length)}</mark>{s.slice(idx + q.length)}</>
  }

  const mapRow = (d) => {
    const gross = d.rev || 0
    const excRev = d.excRev || 0
    const cancelRev = d.cancelRev || 0
    const rtoRev = d.rtoRev || 0
    const cirRev = d.cirRev || 0
    // Effective GST ratio observed for this row's gross vs exc-GST revenue
    const gstRatio = gross > 0 ? (gross - excRev) / gross : 0
    // Net Rev = (Gross − Cancel − RTO − CIR) with GST stripped out at the same effective ratio
    const grossAfterReturns = gross - cancelRev - rtoRev - cirRev
    const net = grossAfterReturns * (1 - gstRatio)
    const gst = grossAfterReturns - net
    return {
      gross,
      net,
      gst,
      units: d.units || 0,
      orders: (d.orders?.size ?? d.orders) || 0,
      cancelled: d.cancelled || 0,
      rto: d.rto || 0,
      cir: d.cir || 0,
      exch: d.exch || 0,
      cancelRev,
      rtoRev,
      cirRev,
      exchRev: d.exchRev || 0,
      returnRev: d.returnRev || 0,
    }
  }

  const allCats = Object.entries(catData || {}).map(([cat, d]) => ({ cat, prevGross: catPrevMap[cat] || 0, ...mapRow(d) })).sort((a, b) => b.gross - a.gross)
  const cats = q ? allCats.filter(row => {
    if (row.cat.toLowerCase().includes(q)) return true
    const subCats = subCatData?.[row.cat] || {}
    for (const sc of Object.keys(subCats)) {
      if (sc.toLowerCase().includes(q)) return true
      if (Object.keys(skuData?.[row.cat]?.[sc] || {}).some(sku => sku.toLowerCase().includes(q))) return true
    }
    return false
  }) : allCats
  const finAutoExp = q ? new Set(cats.map(r => r.cat)) : null
  const finAutoExpSC = q ? new Set(cats.flatMap(row =>
    Object.keys(subCatData?.[row.cat] || {}).filter(sc => {
      if (sc.toLowerCase().includes(q)) return true
      return Object.keys(skuData?.[row.cat]?.[sc] || {}).some(sku => sku.toLowerCase().includes(q))
    }).map(sc => `${row.cat}::${sc}`)
  )) : null
  const finIsOpen = cat => q ? finAutoExp?.has(cat) : expanded[cat]
  const finIsScOpen = key => q ? finAutoExpSC?.has(key) : expandedSC[key]

  const tot = cats.reduce((s, r) => ({
    gross: s.gross + r.gross, prevGross: s.prevGross + r.prevGross, net: s.net + r.net, gst: s.gst + r.gst,
    units: s.units + r.units, orders: s.orders + r.orders,
    cancelled: s.cancelled + r.cancelled, rto: s.rto + r.rto, cir: s.cir + r.cir, exch: s.exch + r.exch,
    cancelRev: s.cancelRev + (r.cancelRev || 0), rtoRev: s.rtoRev + (r.rtoRev || 0), cirRev: s.cirRev + (r.cirRev || 0), exchRev: s.exchRev + (r.exchRev || 0), returnRev: s.returnRev + (r.returnRev || 0),
  }), { gross: 0, prevGross: 0, net: 0, gst: 0, units: 0, orders: 0, cancelled: 0, rto: 0, cir: 0, exch: 0, cancelRev: 0, rtoRev: 0, cirRev: 0, exchRev: 0, returnRev: 0 })

  // Cumulative % share, top to bottom
  let cumAcc = 0
  cats.forEach(r => { r.sharePct = tot.gross > 0 ? (r.gross / tot.gross * 100) : 0; cumAcc += r.sharePct; r.cumPct = cumAcc })

  // When neutral (Shopify), always show Cancel/RTO/CIR/Exch/Returns columns even if all zeros,
  // so India and International tabs stay visually consistent.
  const hasCancelData = neutral || cats.some(r => r.cancelled > 0 || r.rto > 0 || r.cir > 0 || r.exch > 0 || r.cancelRev > 0 || r.rtoRev > 0 || r.cirRev > 0 || r.exchRev > 0 || r.returnRev > 0)
  const showExtras = neutral || showMoM

  const colHdr = { textAlign: 'right', padding: '5px 8px 7px', borderBottom: `2px solid ${C.border}`, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap', letterSpacing: '.05em' }
  const cell = (fs = 11.5) => ({ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: fs, fontWeight: 400, whiteSpace: 'nowrap' })
  const pctSpan = (n, d) => { if (!d || !n) return null; const p = (n / d * 100).toFixed(2); return <span style={{ fontSize: 8, color: C.t3, marginLeft: 2 }}>({p}%)</span> }
  const momCell = (cur, prev) => {
    if (!prev || prev === 0) return <span style={{ color: C.t3 }}>—</span>
    const p = ((cur - prev) / prev) * 100
    const positive = p >= 0
    return <span style={{ fontWeight: 400, color: positive ? '#0D9E68' : '#B91C1C' }}>{positive ? '↗' : '↘'} {Math.abs(p).toFixed(1)}%</span>
  }
  const returnsRevCell = (rtoRev, cirRev, exchRev, gross, returnRev) => {
    const total = (returnRev || 0) + (rtoRev || 0) + (cirRev || 0)
    if (total <= 0) return <span style={{ color: C.t3 }}>—</span>
    const pct = gross > 0 ? (total / gross * 100).toFixed(2) : null
    return pct !== null ? <>{pct}%</> : <span style={{ color: C.t3 }}>—</span>
  }
  const revPctCell = (val, gross) => {
    if (!val || val <= 0) return <span style={{ color: C.t3 }}>—</span>
    const pct = gross > 0 ? (val / gross * 100).toFixed(2) : null
    return pct !== null ? <>{pct}%</> : <span style={{ color: C.t3 }}>—</span>
  }

  return (
    <Card title={title || 'Category Revenue Matrix'} action={
      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ width: 200, padding: '3px 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, color: C.t1, background: C.bg, outline: 'none' }} />
    }>
      <div className="tbl-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontWeight: 400, tableLayout: 'auto' }}>
          <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}>
            <tr>
              <th style={{ textAlign: 'left', padding: '5px 8px 7px', borderBottom: `2px solid ${C.border}`, color: C.t1, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em' }}>Category</th>
              <th style={{ ...colHdr, color: grossColor }}>Gross Rev{showShare ? ' / Share' : ''}</th>
              <th style={{ ...colHdr, color: C.t2 }}>Units</th>
              {showExtras && <th style={{ ...colHdr, color: C.t3 }}>MoM</th>}
              <th style={{ ...colHdr, color: C.t3 }}>ASP</th>
              {hasCancelData && <>
                {neutral && <th style={{ ...colHdr, color: cancelColor }}>Cancel</th>}
                {neutral && <th style={{ ...colHdr, color: rtoColor }}>RTO</th>}
                {neutral && <th style={{ ...colHdr, color: cirColor }}>CIR</th>}
                {neutral && <th style={{ ...colHdr, color: exchColor }}>Exch</th>}
                <th style={{ ...colHdr, color: returnColor }}>Returns</th>
              </>}
              <th style={{ ...colHdr, color: netColor }}>Net Rev</th>
            </tr>
          </thead>
          <tbody>
            {cats.map(row => {
              const catOpen = finIsOpen(row.cat)
              const allSubCats = Object.entries(subCatData?.[row.cat] || {}).map(([sc, d]) => ({ sc, ...mapRow(d) })).sort((a, b) => b.gross - a.gross)
              const subCats = q ? allSubCats.filter(({ sc }) => {
                if (row.cat.toLowerCase().includes(q)) return true
                if (sc.toLowerCase().includes(q)) return true
                return Object.keys(skuData?.[row.cat]?.[sc] || {}).some(sku => sku.toLowerCase().includes(q))
              }) : allSubCats
              const hasSubs = allSubCats.length > 0
              return (
                <Fragment key={row.cat}>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '6px 8px', color: C.t2, fontSize: 12, fontWeight: 600 }}>
                      <span onClick={() => hasSubs && !q && toggle(row.cat)} style={{ cursor: hasSubs && !q ? 'pointer' : 'default', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {hasSubs && <span style={{ fontSize: 9, color: C.t3, display: 'inline-block', transform: catOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>}
                        {hlFin(row.cat)}
                      </span>
                    </td>
                    <td style={{ ...cell() }}>{fmt(row.gross)}{showShare && tot.gross > 0 ? <span style={{ color: C.t3, marginLeft: 6 }}>({(row.gross / tot.gross * 100).toFixed(1)}%)</span> : null}</td>
                    <td style={{ ...cell() }}>{fmtN(row.units)}</td>
                    {showExtras && <td style={{ ...cell() }}>{momCell(row.gross, row.prevGross)}</td>}
                    <td style={{ ...cell() }}>₹{(row.units > 0 ? Math.round(row.gross / row.units) : 0).toLocaleString('en-IN')}</td>
                    {hasCancelData && <>
                      {neutral && <td style={{ ...cell() }}>{revPctCell(row.cancelRev, row.gross)}</td>}
                      {neutral && <td style={{ ...cell() }}>{revPctCell(row.rtoRev, row.gross)}</td>}
                      {neutral && <td style={{ ...cell() }}>{revPctCell(row.cirRev, row.gross)}</td>}
                      {neutral && <td style={{ ...cell() }}>{revPctCell(row.exchRev, row.gross)}</td>}
                      <td style={{ ...cell() }}>{returnsRevCell(row.rtoRev, row.cirRev, row.exchRev, row.gross, row.returnRev)}</td>
                    </>}
                    <td style={{ ...cell() }}>{fmt(row.net)}</td>
                  </tr>
                  {catOpen && (() => {
                    // Compute per-sub-cat cum % within this parent category
                    let scCum = 0
                    subCats.forEach(sr => { sr.sharePct = row.gross > 0 ? (sr.gross / row.gross * 100) : 0; scCum += sr.sharePct; sr.cumPct = scCum })
                    return null
                  })()}
                  {catOpen && subCats.map(sr => {
                    const scKey = `${row.cat}::${sr.sc}`
                    const scOpen = finIsScOpen(scKey)
                    const allSkus = Object.entries(skuData?.[row.cat]?.[sr.sc] || {}).map(([sku, d]) => ({ sku, ...mapRow(d), prevGross: skuPrevMap?.[row.cat]?.[sr.sc]?.[sku] || 0 })).sort((a, b) => b.gross - a.gross)
                    const skus = q ? allSkus.filter(({ sku }) => {
                      if (row.cat.toLowerCase().includes(q) || sr.sc.toLowerCase().includes(q)) return true
                      return sku.toLowerCase().includes(q)
                    }) : allSkus
                    // Compute SKU cum% within this sub-cat
                    let skuCum = 0
                    skus.forEach(sk => { sk.sharePct = sr.gross > 0 ? (sk.gross / sr.gross * 100) : 0; skuCum += sk.sharePct; sk.cumPct = skuCum })
                    const hasSkus = allSkus.length > 0
                    const srPrev = subCatPrevMap[`${row.cat}::${sr.sc}`] || 0
                    return (
                      <Fragment key={sr.sc}>
                        <tr style={{ borderBottom: `1px solid ${C.border}`, background: '#FAFAF7' }}>
                          <td style={{ padding: '3px 4px 3px 18px', color: C.t2, fontSize: 10 }}>
                            <span onClick={() => hasSkus && !q && toggleSC(scKey)} style={{ cursor: hasSkus && !q ? 'pointer' : 'default', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {hasSkus && <span style={{ fontSize: 8, color: C.t3, display: 'inline-block', transform: scOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>}
                              └ {hlFin(sr.sc)}
                            </span>
                          </td>
                          <td style={{ ...cell(10.5) }}>{fmt(sr.gross)}{showShare && tot.gross > 0 ? <span style={{ color: C.t3, marginLeft: 5 }}>({(sr.gross / tot.gross * 100).toFixed(1)}%)</span> : null}</td>
                          <td style={{ ...cell(10.5) }}>{fmtN(sr.units)}</td>
                          {showExtras && <td style={{ ...cell(10.5) }}>{momCell(sr.gross, srPrev)}</td>}
                          <td style={{ ...cell(10.5) }}>₹{(sr.units > 0 ? Math.round(sr.gross / sr.units) : 0).toLocaleString('en-IN')}</td>
                          {hasCancelData && <>
                            {neutral && <td style={{ ...cell(10.5) }}>{revPctCell(sr.cancelRev, sr.gross)}</td>}
                            {neutral && <td style={{ ...cell(10.5) }}>{revPctCell(sr.rtoRev, sr.gross)}</td>}
                            {neutral && <td style={{ ...cell(10.5) }}>{revPctCell(sr.cirRev, sr.gross)}</td>}
                            {neutral && <td style={{ ...cell(10.5) }}>{revPctCell(sr.exchRev, sr.gross)}</td>}
                            <td style={{ ...cell(10.5) }}>{returnsRevCell(sr.rtoRev, sr.cirRev, sr.exchRev, sr.gross, sr.returnRev)}</td>
                          </>}
                          <td style={{ ...cell(10.5) }}>{fmt(sr.net)}</td>
                        </tr>
                        {scOpen && skus.map(sk => (
                          <tr key={sk.sku} style={{ borderBottom: `1px solid ${C.border}`, background: '#F5F5F0' }}>
                            <td style={{ padding: '2px 4px 2px 32px', color: C.t3, fontSize: 9.5, fontFamily: 'var(--mono)' }}>└ {hlFin(sk.sku)}</td>
                            <td style={{ ...cell(10) }}>{fmt(sk.gross)}{showShare && tot.gross > 0 ? <span style={{ color: C.t3, marginLeft: 5 }}>({(sk.gross / tot.gross * 100).toFixed(1)}%)</span> : null}</td>
                            <td style={{ ...cell(10) }}>{fmtN(sk.units)}</td>
                            {showExtras && <td style={{ ...cell(10) }}>{momCell(sk.gross, sk.prevGross)}</td>}
                            <td style={{ ...cell(10) }}>₹{(sk.units > 0 ? Math.round(sk.gross / sk.units) : 0).toLocaleString('en-IN')}</td>
                            {hasCancelData && <>
                              {neutral && <td style={{ ...cell(10) }}>{revPctCell(sk.cancelRev, sk.gross)}</td>}
                              {neutral && <td style={{ ...cell(10) }}>{revPctCell(sk.rtoRev, sk.gross)}</td>}
                              {neutral && <td style={{ ...cell(10) }}>{revPctCell(sk.cirRev, sk.gross)}</td>}
                              {neutral && <td style={{ ...cell(10) }}>{revPctCell(sk.exchRev, sk.gross)}</td>}
                              <td style={{ ...cell(10) }}>{returnsRevCell(sk.rtoRev, sk.cirRev, sk.exchRev, sk.gross, sk.returnRev)}</td>
                            </>}
                            <td style={{ ...cell(10) }}>{fmt(sk.net)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.border}`, background: C.bg }}>
              <td style={{ padding: '6px 8px', fontSize: 11.5, fontWeight: 700, color: C.t1 }}>Total</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5 }}>{fmt(tot.gross)}{showShare ? <span style={{ color: C.t3, marginLeft: 6, fontWeight: 400 }}>(100%)</span> : null}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5 }}>{fmtN(tot.units)}</td>
              {showExtras && <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5 }}>{momCell(tot.gross, tot.prevGross)}</td>}
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5 }}>₹{tot.units > 0 ? Math.round(tot.gross / tot.units).toLocaleString('en-IN') : '—'}</td>
              {hasCancelData && <>
                {neutral && <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5 }}>{revPctCell(tot.cancelRev, tot.gross)}</td>}
                {neutral && <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5 }}>{revPctCell(tot.rtoRev, tot.gross)}</td>}
                {neutral && <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5 }}>{revPctCell(tot.cirRev, tot.gross)}</td>}
                {neutral && <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5 }}>{revPctCell(tot.exchRev, tot.gross)}</td>}
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5 }}>{returnsRevCell(tot.rtoRev, tot.cirRev, tot.exchRev, tot.gross, tot.returnRev)}</td>
              </>}
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5 }}>{fmt(tot.net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}

function VCCategoryMatrix({ catData, subCatData, skuData, title }) {
  const [expanded, setExpanded] = useState({})
  const [expandedSC, setExpandedSC] = useState({})
  const [search, setSearch] = useState('')
  const toggle = cat => setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }))
  const toggleSC = key => setExpandedSC(prev => ({ ...prev, [key]: !prev[key] }))

  const q = search.trim().toLowerCase()
  const hlVC = text => {
    if (!q) return text
    const idx = String(text).toLowerCase().indexOf(q)
    if (idx === -1) return text
    const s = String(text)
    return <>{s.slice(0, idx)}<mark style={{ background: '#FFF176', padding: 0, borderRadius: 2 }}>{s.slice(idx, idx + q.length)}</mark>{s.slice(idx + q.length)}</>
  }

  const allCatsVC = Object.entries(catData || {}).map(([cat, d]) => ({ cat, d, total: d.rev || 0 })).sort((a, b) => b.total - a.total)
  const cats = q ? allCatsVC.filter(({ cat, d }) => {
    if (cat.toLowerCase().includes(q)) return true
    const subCats = subCatData?.[cat] || {}
    for (const sc of Object.keys(subCats)) {
      if (sc.toLowerCase().includes(q)) return true
      if (Object.keys(skuData?.[cat]?.[sc] || {}).some(sku => sku.toLowerCase().includes(q))) return true
    }
    return false
  }) : allCatsVC
  const vcAutoExp = q ? new Set(cats.map(r => r.cat)) : null
  const vcAutoExpSC = q ? new Set(cats.flatMap(({ cat }) =>
    Object.keys(subCatData?.[cat] || {}).filter(sc => {
      if (sc.toLowerCase().includes(q)) return true
      return Object.keys(skuData?.[cat]?.[sc] || {}).some(sku => sku.toLowerCase().includes(q))
    }).map(sc => `${cat}::${sc}`)
  )) : null
  const vcIsOpen = cat => q ? vcAutoExp?.has(cat) : expanded[cat]
  const vcIsScOpen = key => q ? vcAutoExpSC?.has(key) : expandedSC[key]
  const totUnits = cats.reduce((s, r) => s + (r.d.units || 0), 0)
  const totRev = cats.reduce((s, r) => s + (r.d.rev || 0), 0)

  const intensity = (v, tot) => { if (!tot || !v) return 'h0'; const r = v / tot; return r < 0.1 ? 'h1' : r < 0.3 ? 'h2' : r < 0.6 ? 'h3' : 'h4' }

  return (
    <Card title={title || 'Category Revenue Matrix · Vendor Central'} action={
      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ width: 200, padding: '3px 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, color: C.t1, background: C.bg, outline: 'none' }} />
    }>
      <div className="tbl-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontWeight: 400 }}>
          <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}>
            <tr>
              <th style={{ textAlign: 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: C.t3, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Category</th>
              <th style={{ textAlign: 'right', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: '#2E74CC', fontSize: 10, fontWeight: 700 }}>Ordered Qty</th>
              <th style={{ textAlign: 'right', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: '#2E74CC', fontSize: 10, fontWeight: 700 }}>Ordered Rev</th>
            </tr>
          </thead>
          <tbody>
            {cats.map(({ cat, d }) => {
              const catOpen = vcIsOpen(cat)
              const allSCs = Object.entries(subCatData?.[cat] || {}).map(([sc, sd]) => ({ sc, sd })).sort((a, b) => (b.sd.rev||0) - (a.sd.rev||0))
              const scs = q ? allSCs.filter(({ sc }) => {
                if (cat.toLowerCase().includes(q)) return true
                if (sc.toLowerCase().includes(q)) return true
                return Object.keys(skuData?.[cat]?.[sc] || {}).some(sku => sku.toLowerCase().includes(q))
              }) : allSCs
              const hasSC = allSCs.length > 0
              return (
                <Fragment key={cat}>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '5px', color: C.t1 }}>
                      <span onClick={() => hasSC && !q && toggle(cat)} style={{ cursor: hasSC && !q ? 'pointer' : 'default', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {hasSC && <span style={{ fontSize: 9, color: C.t3, display: 'inline-block', transform: catOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>}
                        {hlVC(cat)}
                      </span>
                    </td>
                    <td className={intensity(d.units, totUnits)} style={{ padding: '5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 400 }}>{d.units > 0 ? fmtN(d.units) : '—'}</td>
                    <td className={intensity(d.rev, totRev)} style={{ padding: '5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 400 }}>{d.rev > 0 ? fmt(d.rev) : '—'}</td>
                  </tr>
                  {catOpen && scs.map(({ sc, sd }) => {
                    const scKey = `${cat}::${sc}`
                    const allSkusVC = Object.entries(skuData?.[cat]?.[sc] || {}).map(([sku, kd]) => ({ sku, kd })).sort((a, b) => (b.kd.rev||0) - (a.kd.rev||0))
                    const skus = q ? allSkusVC.filter(({ sku }) => {
                      if (cat.toLowerCase().includes(q) || sc.toLowerCase().includes(q)) return true
                      return sku.toLowerCase().includes(q)
                    }) : allSkusVC
                    const hasSkus = allSkusVC.length > 0
                    const scOpen = vcIsScOpen(scKey)
                    return (
                      <Fragment key={sc}>
                        <tr style={{ borderBottom: `1px solid ${C.border}`, background: '#FAFAF7' }}>
                          <td style={{ padding: '3px 4px 3px 18px', color: C.t2, fontSize: 10, overflow: 'hidden' }}>
                            <span onClick={() => hasSkus && !q && toggleSC(scKey)} title={sc} style={{ cursor: hasSkus && !q ? 'pointer' : 'default', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                              {hasSkus && <span style={{ fontSize: 8, color: C.t3, flexShrink: 0, display: 'inline-block', transform: scOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>}
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>└ {hlVC(sc)}</span>
                            </span>
                          </td>
                          <td style={{ padding: '4px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 400 }}>{sd.units > 0 ? fmtN(sd.units) : '—'}</td>
                          <td style={{ padding: '4px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 400 }}>{sd.rev > 0 ? fmt(sd.rev) : '—'}</td>
                        </tr>
                        {scOpen && skus.map(({ sku, kd }) => (
                          <tr key={sku} style={{ borderBottom: `1px solid ${C.border}`, background: '#F5F5F0' }}>
                            <td style={{ padding: '2px 4px 2px 32px', color: C.t3, fontSize: 9.5, fontFamily: 'var(--mono)' }}>└ {hlVC(sku)}</td>
                            <td style={{ padding: '3px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 400 }}>{kd.units > 0 ? fmtN(kd.units) : '—'}</td>
                            <td style={{ padding: '3px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 400 }}>{kd.rev > 0 ? fmt(kd.rev) : '—'}</td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.border}`, background: C.bg }}>
              <td style={{ padding: '5px 6px', fontSize: 10.5, fontWeight: 700, color: C.t1 }}>Total</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1, borderLeft: `1px solid ${C.border}` }}>{fmtN(totUnits)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1, borderLeft: `1px solid ${C.border}` }}>{fmt(totRev)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}

const REGION_COLORS = ['#534AB7','#0D9E68','#E8930A','#CC4078','#2E74CC','#CC8A00']
const TIER_COLORS = ['#FFD600','#7AB4EE','#9DD470']

function RegionTierDonutRow({ regionRows, tierRows }) {
  const [regionMetric, setRegionMetric] = useState('rev')
  const [tierMetric, setTierMetric] = useState('rev')

  const metricVal = (r, m) => m === 'rev' ? r.rev : m === 'orders' ? r.orders : m === 'units' ? r.units : (r.orders ? Math.round(r.rev / r.orders) : 0)
  const fmtK = v => v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : fmtN(v)
  const metricFmt = (v, m) => m === 'aov' ? `₹${v.toLocaleString('en-IN')}` : m === 'rev' ? fmt(v) : fmtK(v)

  const selStyle = active => ({ fontSize: 11, fontWeight: active ? 700 : 500, padding: '3px 9px', borderRadius: 5, border: `1px solid ${active ? C.acm : C.border}`, background: active ? C.acc : 'transparent', color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)' })

  const regionData = regionRows.map((r, i) => ({ name: r.region, value: metricVal(r, regionMetric), color: REGION_COLORS[i % REGION_COLORS.length], raw: r }))
  const TIER_NAMES = { '1': 'Tier I', '2': 'Tier II', '3': 'Tier III', 'I': 'Tier I', 'II': 'Tier II', 'III': 'Tier III' }
  const TIER_ORDER = { 'Tier I': 0, 'Tier II': 1, 'Tier III': 2 }
  const tierData = tierRows.map(r => {
    const key = String(r.tier).replace(/^tier\s*/i, '').trim()
    const name = TIER_NAMES[key] || r.label || `Tier ${key}`
    return { name, value: metricVal(r, tierMetric), raw: r }
  }).sort((a, b) => (TIER_ORDER[a.name] ?? 9) - (TIER_ORDER[b.name] ?? 9))
    .map((d, i) => ({ ...d, color: TIER_COLORS[i % TIER_COLORS.length] }))

  const DonutCard = ({ title, data, metric, setMetric }) => {
    const total = data.reduce((s, d) => s + d.value, 0)
    return (
      <Card title={title} action={
        <div style={{ display: 'flex', gap: 3 }}>
          {[['rev','Revenue'],['orders','Orders'],['units','Units']].map(([k,l]) => (
            <button key={k} onClick={() => setMetric(k)} style={selStyle(metric === k)}>{l}</button>
          ))}
        </div>
      }>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <ResponsiveContainer width={180} height={180}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={52} outerRadius={80} dataKey="value" paddingAngle={2}>
                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', fontSize: 12, color: '#111', fontWeight: 600 }}>{payload[0].name} : {metricFmt(payload[0].value, metric)}</div> : null} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {data.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '1px 0' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                <span style={{ fontSize: 10.5, color: C.t2, flex: 1 }}>{d.name}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)' }}>{metricFmt(d.value, metric)}</span>
                <span style={{ fontSize: 9.5, color: C.t3, minWidth: 32, textAlign: 'right' }}>{total ? (d.value / total * 100).toFixed(1) : 0}%</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="g-2" style={{ alignItems: 'stretch' }}>
      {regionRows.length > 0 && <DonutCard title={`${regionMetric === 'rev' ? 'Revenue' : regionMetric === 'orders' ? 'Orders' : regionMetric === 'units' ? 'Units' : 'AOV'} by Region`} data={regionData} metric={regionMetric} setMetric={setRegionMetric} />}
      {tierRows.length > 0 && <DonutCard title={`${tierMetric === 'rev' ? 'Revenue' : tierMetric === 'orders' ? 'Orders' : tierMetric === 'units' ? 'Units' : 'AOV'} by City Tier`} data={tierData} metric={tierMetric} setMetric={setTierMetric} />}
    </div>
  )
}

function ChannelShareTable({ sortedCh, prevChMap = {}, boxHeight }) {
  const [metric, setMetric] = useState('gross')
  const btnStyle = active => ({ fontSize: 11, fontWeight: active ? 700 : 500, padding: '3px 10px', borderRadius: 5, border: `1px solid ${active ? C.acm : C.border}`, background: active ? C.acc : 'transparent', color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)' })
  const chLabel = ch => ch === 'offline_sales' ? 'Offline Sales' : ch === 'Shopify' ? 'D2C' : ch

  const rows = sortedCh.map(([ch, v]) => {
    const rev = metric === 'gross' ? (v.rev ?? v.netRev ?? 0) : (v.netRev ?? v.excRev ?? 0)
    const prevCh = prevChMap[ch]
    const prevRev = metric === 'gross' ? (prevCh?.rev ?? prevCh ?? 0) : (prevCh?.netRev ?? prevCh?.excRev ?? prevCh ?? 0)
    return { ch, rev, prevRev }
  })
  const maxRev = Math.max(...rows.map(r => r.rev), 1)
  const totalRev = rows.reduce((s, r) => s + r.rev, 0) || 1

  return (
    <Card fill title="Channel Share" style={boxHeight ? { height: boxHeight, alignSelf: 'start' } : undefined} action={
      <div style={{ display: 'flex', gap: 4 }}>
        <button style={btnStyle(metric === 'gross')} onClick={() => setMetric('gross')}>Gross Rev</button>
        <button style={btnStyle(metric === 'net')} onClick={() => setMetric('net')}>Net Rev</button>
      </div>
    }>
      <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {rows.map(r => {
          const chg = r.prevRev > 1 ? ((r.rev - r.prevRev) / r.prevRev * 100) : null
          return (
            <div key={r.ch} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: `1px solid ${C.border}`, flex: '1 1 auto', minHeight: 30 }}>
              {CHANNEL_LOGOS[r.ch]
                ? <img src={CHANNEL_LOGOS[r.ch]} alt={r.ch} style={{ width: r.ch === 'offline_sales' ? 22 : 18, height: r.ch === 'offline_sales' ? 22 : 18, objectFit: 'contain', borderRadius: 4, flexShrink: 0, background: r.ch === 'CRED' ? '#1a1a1a' : '#f5f5f5', padding: r.ch === 'CRED' ? 2 : 0 }} />
                : <span style={{ width: 18, height: 18, borderRadius: 4, background: C.ch[r.ch] || C.acm, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff' }}>{r.ch.charAt(0)}</span>}
              <span style={{ fontSize: 12, color: C.t2, width: 90, flexShrink: 0 }}>{chLabel(r.ch)}</span>
              <div style={{ flex: 1, height: 5, background: C.bg, borderRadius: 3 }}>
                <div style={{ height: '100%', borderRadius: 3, background: C.ch[r.ch] || C.acm, width: `${(r.rev / maxRev) * 100}%`, transition: 'width .5s' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.t1, minWidth: 72, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(r.rev)}</span>
              <span style={{ fontSize: 11, color: C.t3, minWidth: 36, textAlign: 'right' }}>{(r.rev / totalRev * 100).toFixed(1)}%</span>
              {chg !== null
                ? <span style={{ fontSize: 10.5, fontWeight: 700, width: 76, flexShrink: 0, textAlign: 'center', padding: '2px 0', borderRadius: 4, background: chg >= 0 ? '#E6F4E0' : '#FDE8E8', color: chg >= 0 ? '#286010' : '#7A1A1A', display: 'inline-block' }}>{chg >= 0 ? '▲' : '▼'} {Math.abs(chg).toFixed(1)}%</span>
                : <span style={{ width: 76, flexShrink: 0 }} />}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function AllTab({ data, rangeStart, rangeEnd }) {
  const { totalRev, totalExcRev, gstCollected, nOrders, totalQty, blendedAOV, scopedAOV = 0, scopedASP = 0, prevScopedAOV = 0, prevScopedASP = 0, nDays, dailyArr, chMap, catMap, subCatMap, catPrevMap = {}, subCatPrevMap = {}, stateMap, statePrevMap = {}, stateTotal = 0, cityRows = [], cityPrevMap = {}, cityTotal = 0, regionRows = [], tierRows = [], buckets, bucketRev, rows, orders, orderStatusRevMap = {}, orderStatusMap = {}, catChannelMap = {}, subCatChannelMap: serverSubCatChannelMap = {}, skuRows: allSkuRows = [], prevRev = 0, prevExcRev = 0, prevOrders = 0, prevQty = 0, prevDailyArr = [], prevChMap = {}, nCusts = 0, repeatCusts = 0, rtoRev = 0, cirRev = 0, cancellRev = 0, momRev = 0, yoyRev = 0, momPeriod = '', yoyPeriod = '', prevRtoOrders = 0, prevCirOrders = 0, netRevenueCalc = 0 } = data
  const channels = Object.keys(chMap).filter(ch => chMap[ch]?.rev > 0).sort((a, b) => {
    if (a === 'offline_sales') return 1
    if (b === 'offline_sales') return -1
    return chMap[b].rev - chMap[a].rev
  })
  const sortedCh = Object.entries(chMap).filter(([, v]) => v.rev > 0).sort((a, b) => b[1].rev - a[1].rev)
  const maxChRev = sortedCh[0]?.[1].rev || 1
  const [selectedCat, setSelectedCat] = useState(null)
  const [catView, setCatView] = useState('table')
  const [subCatView, setSubCatView] = useState('table')
  const [catSearch, setCatSearch] = useState('')
  const [subCatSearch, setSubCatSearch] = useState('')
  const allCatRows = Object.entries(catMap).map(([k, v]) => { const orders = v.orders?.size ?? v.orders ?? 0; const prev = catPrevMap[k] || 0; const aspU = v.aspUnits || v.units || 0; return { name: k, rev: v.rev, excRev: v.excRev || 0, orders, units: aspU, aov: orders ? v.rev / orders : 0, asp: aspU ? v.rev / aspU : 0, mom: prev > 0 ? (v.rev - prev) / prev * 100 : null } }).sort((a, b) => b.rev - a.rev)
  const catRows = catSearch ? allCatRows.filter(r => r.name.toLowerCase().includes(catSearch.toLowerCase())) : allCatRows
  const allSubCatRowsRaw = Object.entries(subCatMap).map(([k, v]) => { const orders = v.orders?.size ?? v.orders ?? 0; const prev = subCatPrevMap[k] || 0; const aspU = v.aspUnits || v.units || 0; return { name: k.split('::')[1] || k, category: k.split('::')[0] || '', rev: v.rev, orders, units: aspU, aov: orders ? v.rev / orders : 0, asp: aspU ? v.rev / aspU : 0, mom: prev > 0 ? (v.rev - prev) / prev * 100 : null } }).sort((a, b) => b.rev - a.rev)
  const allSubCatRows = selectedCat ? allSubCatRowsRaw.filter(r => r.category === selectedCat) : allSubCatRowsRaw
  const subCatRows = subCatSearch ? allSubCatRows.filter(r => r.name.toLowerCase().includes(subCatSearch.toLowerCase())) : allSubCatRows
  const stateRows = Object.entries(stateMap).map(([k, v]) => ({ state: k, rev: v.rev, orders: v.orders, aov: v.orders ? v.rev / v.orders : 0, cities: v.cities.size, prevRev: statePrevMap[k] || 0 })).sort((a, b) => b.rev - a.rev)
  const bucketData = Object.entries(buckets).map(([k, v]) => ({ name: k, orders: v, rev: bucketRev[k] }))
  const allCats = allCatRows.map(r => r.name)
  const heatData = allCats.map(cat => {
    const row = { cat }
    channels.forEach(ch => { row[ch] = catChannelMap[cat]?.[ch] || 0 })
    return row
  })
  const maxHeat = Math.max(...heatData.flatMap(r => channels.map(ch => r[ch] || 0)), 1)
  const subCatChannelMap = serverSubCatChannelMap
  const skuChannelMap = {}
  allSkuRows.forEach(x => {
    const cat = x.category || 'Others'
    const sc = x.subCategory || 'Others'
    const sku = x.sku
    const ch = x.channel
    if (!sku || !ch) return
    if (!skuChannelMap[cat]) skuChannelMap[cat] = {}
    if (!skuChannelMap[cat][sc]) skuChannelMap[cat][sc] = {}
    if (!skuChannelMap[cat][sc][sku]) skuChannelMap[cat][sc][sku] = {}
    skuChannelMap[cat][sc][sku][ch] = (skuChannelMap[cat][sc][sku][ch] || 0) + x.rev
  })
  // Flat Category→Product→SKU rev map for CategoryRevenueCard / FlatCategoryProductMatrix —
  // summed across channels (unlike skuChannelMap above, which keeps the per-channel split).
  const skuChannelMapBySku = {}
  allSkuRows.forEach(x => {
    const cat = x.category || 'Others'
    const sc = x.subCategory || 'Others'
    const sku = x.sku
    if (!sku) return
    if (!skuChannelMapBySku[cat]) skuChannelMapBySku[cat] = {}
    if (!skuChannelMapBySku[cat][sc]) skuChannelMapBySku[cat][sc] = {}
    if (!skuChannelMapBySku[cat][sc][sku]) skuChannelMapBySku[cat][sc][sku] = { rev: 0, units: 0 }
    skuChannelMapBySku[cat][sc][sku].rev += x.rev || 0
    skuChannelMapBySku[cat][sc][sku].units += x.units || 0
  })
  const catMatrixDataAll = {}
  Object.entries(catMap).forEach(([k, v]) => { catMatrixDataAll[k] = { rev: v.rev, excRev: v.excRev || 0, units: v.aspUnits || v.units || 0, orders: v.orders?.size ?? v.orders ?? 0, cancelRev: 0, rtoRev: 0, cirRev: 0, returnRev: 0 } })
  Object.entries(subCatMap).forEach(([k, v]) => {
    const [cat] = k.split('::')
    if (catMatrixDataAll[cat]) {
      catMatrixDataAll[cat].cancelRev += v.cancelRev || 0
      catMatrixDataAll[cat].rtoRev += v.rtoRev || 0
      catMatrixDataAll[cat].cirRev += v.cirRev || 0
      catMatrixDataAll[cat].returnRev += v.returnRev || 0
    }
  })
  const subCatMatrixDataAll = {}
  Object.entries(subCatMap).forEach(([k, v]) => {
    const [cat, sc] = k.split('::')
    if (!subCatMatrixDataAll[cat]) subCatMatrixDataAll[cat] = {}
    subCatMatrixDataAll[cat][sc || 'Others'] = { rev: v.rev, excRev: v.excRev || 0, cancelRev: v.cancelRev || 0, rtoRev: v.rtoRev || 0, cirRev: v.cirRev || 0, returnRev: v.returnRev || 0, units: v.aspUnits || v.units || 0, orders: v.orders?.size ?? v.orders ?? 0 }
  })

  const grossMarginPct = totalRev > 0 ? ((totalRev - totalExcRev) / totalRev * 100) : 0
  const revPerUnit = totalQty > 0 ? totalExcRev / totalQty : 0
  const shopifyOrders = orders.filter(o => o.channel === 'Shopify')
  const atRiskRev = (orderStatusRevMap['RTO'] || 0) + (orderStatusRevMap['Return'] || 0) + (orderStatusRevMap['Cancelled'] || 0) + (cirRev || 0)
  const deliveredCount = orders.filter(o => o.orderStatus === 'Delivered').length
  const rtoCount = orders.filter(o => o.orderStatus === 'RTO' || o.isRTO).length
  const cancelCount = orders.filter(o => o.orderStatus === 'Cancelled' || o.isCancelled).length
  const fulfilmentBase = deliveredCount + rtoCount + cancelCount
  const fulfilmentRate = fulfilmentBase > 0 ? (deliveredCount / fulfilmentBase * 100) : 0
  const aspQtyAll = (typeof data.aspQty === 'number' && data.aspQty > 0) ? data.aspQty : totalQty
  const unitsPerOrder = nOrders > 0 ? aspQtyAll / nOrders : 0
  const rtoOrders = (orderStatusMap['RTO'] || 0) + (orderStatusMap['Return'] || 0)
  const cirOrderCount = orderStatusMap['CIR'] || 0
  const returnRevAll = data.returnRev || 0
  const returnNumeratorRev = data.returnTrackableRev || 0
  const returnPct = totalRev > 0 ? (returnNumeratorRev / totalRev * 100) : 0
  const aspUnits = (typeof data.aspQty === 'number' && data.aspQty > 1000) ? data.aspQty : totalQty
  const asp = aspUnits > 0 ? totalRev / aspUnits : 0
  const deliveredOrders = orderStatusMap['Delivered'] || 0
  const fulfilmentPct = nOrders > 0 ? (deliveredOrders / nOrders * 100) : 0
  const repeatRate = nCusts ? (repeatCusts / nCusts * 100).toFixed(1) : '0'

  // prev period derived values
  const prevAOV = prevOrders > 0 ? prevRev / prevOrders : 0
  const prevDailyAvg = prevRev > 0 ? prevRev / nDays : 0
  const prevASP = prevQty > 0 ? prevRev / prevQty : 0
  const prevGST = prevRev - prevExcRev
  const prevUPO = prevOrders > 0 && prevQty > 0 ? prevQty / prevOrders : 0
  const prevAtRisk = 0 // not tracked in prev period
  const chgBadge = (cur, prev) => {
    if (!prev || Math.abs(prev) < 1) return null
    const pct = (cur - prev) / prev * 100
    if (Math.abs(pct) > 999) return null
    return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: pct >= 0 ? C.green.bg : C.red.bg, color: pct >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%</span>
  }

  const revChg = prevRev > 0 ? ((totalRev - prevRev) / prevRev * 100) : null
  const ordChg = prevOrders > 0 ? ((nOrders - prevOrders) / prevOrders * 100) : null
  // Sparkline: normalise both periods to index 0..n-1 for comparison
  const sparkData = Array.from({ length: Math.max(dailyArr.length, prevDailyArr.length) }, (_, i) => {
    const cur = dailyArr[i]
    const pre = prevDailyArr[i]
    const curRev = cur ? Object.entries(cur).filter(([k]) => k !== 'date' && !k.endsWith('_o')).reduce((s, [, v]) => s + (v || 0), 0) : null
    return { i, cur: curRev, prev: pre?.rev ?? null }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="sales-kpi-section" style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        {/* Gross Revenue hero — tall left column */}
        <div className="kpi-card sales-kpi-hero" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue Inc GST</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(totalRev)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              {revChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: revChg >= 0 ? C.green.bg : C.red.bg, color: revChg >= 0 ? C.green.tx : C.red.tx }}>{revChg >= 0 ? '▲' : '▼'} {Math.abs(revChg).toFixed(1)}% <span style={{ fontWeight: 400, opacity: 0.7 }}>WoW</span></span>}
              {momRev > 0 && (() => { const p = (totalRev - momRev) / momRev * 100; return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}% <span style={{ fontWeight: 400, opacity: 0.7 }}>MoM</span></span> })()}
              {yoyRev > 0 && (() => { const p = (totalRev - yoyRev) / yoyRev * 100; return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}% <span style={{ fontWeight: 400, opacity: 0.7 }}>YoY</span></span> })()}
            </div>
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{nOrders >= 1000 ? (nOrders/1000).toFixed(1).replace(/\.0$/,'')+'k' : fmtN(nOrders)} orders · {aspQtyAll >= 1000 ? (aspQtyAll/1000).toFixed(1).replace(/\.0$/,'')+'k' : fmtN(aspQtyAll)} units</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="curGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.acc} stopOpacity={0.25} /><stop offset="95%" stopColor={C.acc} stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke={C.acc} strokeWidth={2} fill="url(#curGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? C.t1 : C.t3 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        {/* Right: 2 rows of 4 KPIs each — single grid so all 8 cards share equal height */}
        <div className="sales-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 10, alignItems: 'stretch' }}>
          {[
            { label: 'Net Revenue', value: fmt(netRevenueCalc), sub: `Ex GST, after returns · ${totalRev > 0 ? (netRevenueCalc / totalRev * 100).toFixed(1) : 0}% of gross`, badge: (() => { const excChg = prevExcRev > 0 ? ((netRevenueCalc - prevExcRev) / prevExcRev * 100) : null; if (excChg === null) return null; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: excChg >= 0 ? C.green.bg : C.red.bg, color: excChg >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{excChg >= 0 ? '▲' : '▼'} {Math.abs(excChg).toFixed(1)}%</span> })() },
            { label: 'Revenue at Risk', value: fmt(atRiskRev), sub: `${totalRev > 0 ? (atRiskRev / totalRev * 100).toFixed(1) : 0}% of gross`, accent: atRiskRev > 0 ? '#7A4000' : undefined, badge: (() => { const prevAtRiskEst = prevOrders > 0 ? (prevRtoOrders + prevCirOrders) / prevOrders * prevRev : 0; if (!prevAtRiskEst) return null; const p = (atRiskRev - prevAtRiskEst) / prevAtRiskEst * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p > 0 ? C.red.bg : C.green.bg, color: p > 0 ? C.red.tx : C.green.tx, flexShrink: 0 }}>{p > 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> })() },
            { label: 'AOV', value: `₹${Math.round(scopedAOV).toLocaleString('en-IN')}`, sub: 'Select channels only', subTitle: 'D2C, Amazon SC, Myntra, Flipkart, Firstcry, CRED only', badge: chgBadge(scopedAOV, prevScopedAOV) },
            { label: 'Daily Avg Rev', value: fmt(totalRev / nDays), sub: `over ${nDays} days`, badge: chgBadge(totalRev / nDays, prevDailyAvg) },
            { label: 'ASP', value: `₹${Math.round(scopedASP).toLocaleString('en-IN')}`, sub: 'Select channels only', subTitle: 'D2C, Amazon SC, Myntra, Flipkart, Firstcry, CRED only', badge: chgBadge(scopedASP, prevScopedASP) },
            { label: 'GST', value: fmt(gstCollected), sub: `${totalRev > 0 ? ((gstCollected / totalRev) * 100).toFixed(1) : 0}% of gross rev`, badge: chgBadge(gstCollected, prevGST) },
            { label: 'Repeat Customer Rate', value: `${repeatRate}%`, sub: `${fmtN(repeatCusts)} of ${fmtN(nCusts)} customers`, accent: undefined },
            { label: 'Returns %', value: `${returnPct.toFixed(1)}%`, sub: `${fmt(returnNumeratorRev)} returns · ${fmt(totalRev)} gross`, accent: returnPct > 10 ? '#7A1A1A' : undefined, badge: (() => { if (!prevRev) return null; const prevRtoCirRev = (data.prevRtoRev || 0) + (data.prevCirRev || 0); const prev = prevRev > 0 ? prevRtoCirRev / prevRev * 100 : 0; if (!prev) return null; const p = (returnPct - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.red.bg : C.green.bg, color: p >= 0 ? C.red.tx : C.green.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> })() },
          ].map(k => (
            <div key={k.label} className="kpi-card" style={{ padding: '10px 13px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="kpi-label">{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <div className="kpi-value" style={{ fontSize: 17, ...(k.accent ? { color: k.accent } : {}) }}>{k.value}</div>
                {k.badge}
              </div>
              {k.sub && <div className="kpi-sub" title={k.subTitle}>{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>
      <ChannelTrendCard dailyArr={dailyArr} channels={channels} rangeStart={rangeStart} rangeEnd={rangeEnd} />
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 1fr', gap: 14, alignItems: 'start' }}>
        <ChannelShareTable sortedCh={sortedCh} prevChMap={prevChMap} boxHeight={360} />
        <CategoryRevenueCard
          catRows={catRows}
          subCatRows={allSubCatRowsRaw}
          skuMap={skuChannelMapBySku}
          totalRev={totalRev}
          view={catView === 'bar' ? 'subcategory' : 'category'}
          setView={v => setCatView(v === 'subcategory' ? 'bar' : 'table')}
          selectedName={selectedCat}
          onSelectCategory={v => setSelectedCat(prev => prev === v ? null : v)}
          height={360}
        />
        <GeoToggleDonutCard regionRows={regionRows} tierRows={tierRows} boxHeight={360} />
      </div>
      <DailyChannelTable dailyArr={dailyArr} channels={channels} nDays={nDays} rangeStart={rangeStart} rangeEnd={rangeEnd} />
      <FlatCategoryProductMatrix catData={catMatrixDataAll} subCatData={subCatMatrixDataAll} skuData={skuChannelMapBySku} title="Category Revenue Matrix · All Channels" catPrevMap={catPrevMap} subCatPrevMap={subCatPrevMap} showReturnPct={true} />
      {(() => {
        const totalStateRevBQ = stateTotal || stateRows.reduce((s, r) => s + r.rev, 0)
        let cumS = 0
        const enrichedStates = stateRows.map(s => {
          const prev = statePrevMap[s.state] || 0
          const sharePct = totalStateRevBQ > 0 ? s.rev / totalStateRevBQ * 100 : 0
          cumS += sharePct
          return { ...s, aov: s.orders ? s.rev / s.orders : 0, rtoPct: 0, mom: prev > 0 ? (s.rev - prev) / prev * 100 : null, sharePct, cumPct: cumS }
        })
        const totalCityRevBQ = cityTotal || cityRows.reduce((s, r) => s + r.rev, 0)
        let cumC = 0
        const enrichedCities = cityRows.map(c => {
          const prev = cityPrevMap[c.city] || 0
          const sharePct = totalCityRevBQ > 0 ? c.rev / totalCityRevBQ * 100 : 0
          cumC += sharePct
          return { ...c, aov: c.orders ? c.rev / c.orders : 0, rtoPct: 0, mom: prev > 0 ? (c.rev - prev) / prev * 100 : null, sharePct, cumPct: cumC }
        })
        return (
          <div className="g-2" style={{ alignItems: 'stretch' }}>
            <ShopifyGeoRichTable title="Top States" rows={enrichedStates} firstKey="state" firstLabel="State" formatFirst={v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v} showRTO={false} showAOV={true} showASP={false} />
            <ShopifyGeoRichTable title="Top Cities" rows={enrichedCities} firstKey="city" firstLabel="City" formatFirst={v => v ? v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : v} showRTO={false} showAOV={true} showASP={false} />
          </div>
        )
      })()}
    </div>
  )
}

const PIE_COLORS = ['#534AB7','#0D9E68','#2E74CC','#CC8A00','#CC4078','#E24B4A','#9B59B6']
const BUCKET_ORDER = ['<₹500','₹500-1K','₹1K-2.5K','₹2.5K-5K','₹5K-10K','₹10K-25K','₹25K+']

function OrderValuePieCard({ buckets, bucketRev }) {
  const [metric, setMetric] = useState('orders')
  const data = BUCKET_ORDER.filter(k => buckets[k] !== undefined).map((k, i) => ({
    name: k,
    value: metric === 'orders' ? (buckets[k] || 0) : (bucketRev[k] || 0),
    color: PIE_COLORS[i % PIE_COLORS.length]
  })).filter(d => d.value > 0)
  const total = data.reduce((s, d) => s + d.value, 0)
  const selStyle = { fontSize: 11.5, padding: '3px 8px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer' }
  return (
    <Card title="Order Value Distribution" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8, marginTop: -4 }}>
        <select style={selStyle} value={metric} onChange={e => setMetric(e.target.value)}>
          <option value="orders">By Orders</option>
          <option value="revenue">By Revenue</option>
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
              {data.map((d, i) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip formatter={(v) => metric === 'orders' ? fmtN(v) : fmt(v)} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {data.map(d => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: C.t2 }}>{d.name}</span>
              <span style={{ fontFamily: 'var(--mono)', color: C.t1, fontSize: 11 }}>{metric === 'orders' ? fmtN(d.value) : fmt(d.value)}</span>
              <span style={{ color: C.t3, fontSize: 10, minWidth: 34, textAlign: 'right' }}>{total ? ((d.value / total) * 100).toFixed(1) : 0}%</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

const CAT_PALETTE = ['#534AB7','#0D9E68','#2E74CC','#CC8A00','#CC4078','#E24B4A','#9B59B6','#FF6B35','#00B4D8','#06D6A0','#E8930A','#FFD600']
const colorOf = (name, rows) => { const idx = rows.findIndex(r => r.name === name); return CAT_PALETTE[idx >= 0 ? idx % CAT_PALETTE.length : 0] }

function CatSubCatRow({ catRows, subCatRows, title = 'Category Revenue', selectedCat: externalSelectedCat, onSelectCat, selectedSubCat: externalSelectedSubCat, onSelectSubCat }) {
  return null
  // eslint-disable-next-line no-unreachable
  const [catView, setCatView] = useState('table')
  const [subCatView, setSubCatView] = useState('table')
  const [internalSelectedCat, setInternalSelectedCat] = useState(null)
  const [internalSelectedSubCat, setInternalSelectedSubCat] = useState(null)
  const isControlled = onSelectCat !== undefined
  const selectedCat = isControlled ? externalSelectedCat : internalSelectedCat
  const selectedSubCat = isControlled ? externalSelectedSubCat : internalSelectedSubCat
  const setSelectedCat = isControlled ? onSelectCat : v => { setInternalSelectedCat(v); setInternalSelectedSubCat(null) }
  const setSelectedSubCat = isControlled ? onSelectSubCat : setInternalSelectedSubCat
  const filteredSubCat = selectedCat ? subCatRows.filter(r => r.category === selectedCat) : subCatRows
  const btnStyle = v => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${v === catView ? C.t1 : C.border}`, background: v === catView ? C.t1 : 'transparent', color: v === catView ? '#fff' : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' })
  const scBtnStyle = v => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${v === subCatView ? C.t1 : C.border}`, background: v === subCatView ? C.t1 : 'transparent', color: v === subCatView ? '#fff' : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' })
  const FIXED_H = 420
  const totalCatRev = catRows.reduce((s, r) => s + r.rev, 0)
  const totalSubRev = filteredSubCat.reduce((s, r) => s + r.rev, 0)
  if (!catRows.length) return null
  return (
    <div className="g-2" style={{ alignItems: 'stretch' }}>
      <Card title={title} note={selectedCat ? <span style={{ cursor: 'pointer', color: C.acc, fontWeight: 600 }} onClick={() => setSelectedCat(null)}>✕ Clear</span> : `${catRows.length} total`}
        action={<div style={{ display: 'flex', gap: 4 }}><button style={btnStyle('table')} onClick={() => setCatView('table')}>Table</button><button style={btnStyle('bar')} onClick={() => setCatView('bar')}>Chart</button></div>}>
        {catView === 'table' && (
          <div style={{ overflowY: 'auto', maxHeight: FIXED_H }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}><tr>{[{ label: 'Category' }, { label: 'Revenue / % Share', align: 'right' }, { label: 'Orders', align: 'right' }, { label: 'Units', align: 'right' }, { label: 'ASP', align: 'right' }].map(c => <th key={c.label} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: c.align || 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{c.label}</th>)}</tr></thead>
              <tbody>{catRows.map((r, i) => { const isSelected = selectedCat === r.name; const share = totalCatRev ? (r.rev / totalCatRev * 100).toFixed(1) + '%' : '—'; return <tr key={r.name} onClick={() => setSelectedCat(isSelected ? null : r.name)} style={{ borderBottom: i < catRows.length - 1 ? `1px solid ${C.border}` : 'none', background: isSelected ? C.acl : '', cursor: 'pointer' }} onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#FFFBE6' }} onMouseLeave={e => { e.currentTarget.style.background = isSelected ? C.acl : '' }}><td style={{ padding: '5.5px 5px', color: C.t2 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#FFD600', marginRight: 6 }} />{isSelected ? <strong>{r.name}</strong> : r.name}</td><td style={{ padding: '5.5px 5px', textAlign: 'right' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1 }}>{fmt(r.rev)}</span><span style={{ fontSize: 10, color: C.t3, marginLeft: 5 }}>({share})</span></td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.orders)}</td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.units)}</td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>₹{Math.round(r.rev / Math.max(r.units, 1)).toLocaleString('en-IN')}</td></tr> })}</tbody>
            </table>
          </div>
        )}
        {catView === 'bar' && (
          <ResponsiveContainer width="100%" height={FIXED_H}>
            <BarChart data={catRows} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 100 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => v >= 1e7 ? `${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v/1e5).toFixed(0)}L` : fmt(v)} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.t2 }} width={95} />
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
              <Tooltip formatter={v => fmt(v)} cursor={{ fill: 'transparent' }} />
              <Bar dataKey="rev" name="Revenue" radius={[0,4,4,0]} onClick={r => setSelectedCat(selectedCat === r.name ? null : r.name)}>
                {catRows.map(r => <Cell key={r.name} fill="#FFD600" opacity={selectedCat && selectedCat !== r.name ? 0.35 : 1} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
      <Card title={selectedCat ? `Sub-categories · ${selectedCat}` : 'Sub-categories'} note={selectedSubCat ? <span style={{ cursor: 'pointer', color: C.acc, fontWeight: 600 }} onClick={() => setSelectedSubCat(null)}>✕ Clear</span> : `${filteredSubCat.length} total`}
        action={<div style={{ display: 'flex', gap: 4 }}><button style={scBtnStyle('table')} onClick={() => setSubCatView('table')}>Table</button><button style={scBtnStyle('bar')} onClick={() => setSubCatView('bar')}>Chart</button></div>}>
        {subCatView === 'table' && (
          <div style={{ overflowY: 'auto', maxHeight: FIXED_H }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}><tr>{[{ label: 'Sub-category' }, { label: 'Revenue / % Share', align: 'right' }, { label: 'Orders', align: 'right' }, { label: 'Units', align: 'right' }, { label: 'ASP', align: 'right' }].map(c => <th key={c.label} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: c.align || 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{c.label}</th>)}</tr></thead>
              <tbody>{filteredSubCat.map((r, i) => { const isScSelected = selectedSubCat === r.name && selectedCat === r.category; const share = totalSubRev ? (r.rev / totalSubRev * 100).toFixed(1) + '%' : '—'; return <tr key={r.name + r.category} onClick={() => { if (setSelectedSubCat) { if (!selectedCat || selectedCat !== r.category) setSelectedCat(r.category); setSelectedSubCat(isScSelected ? null : r.name) } }} style={{ borderBottom: i < filteredSubCat.length - 1 ? `1px solid ${C.border}` : 'none', background: isScSelected ? C.acl : '', cursor: setSelectedSubCat ? 'pointer' : 'default' }} onMouseEnter={e => { if (!isScSelected) e.currentTarget.style.background = '#FFFBE6' }} onMouseLeave={e => { e.currentTarget.style.background = isScSelected ? C.acl : '' }}><td style={{ padding: '5.5px 5px', color: C.t2 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#FFD600', marginRight: 6 }} />{isScSelected ? <strong>{r.name}</strong> : r.name}</td><td style={{ padding: '5.5px 5px', textAlign: 'right' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1 }}>{fmt(r.rev)}</span><span style={{ fontSize: 10, color: C.t3, marginLeft: 5 }}>({share})</span></td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.orders)}</td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.units)}</td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>₹{Math.round(r.rev / Math.max(r.units, 1)).toLocaleString('en-IN')}</td></tr> })}</tbody>
            </table>
          </div>
        )}
        {subCatView === 'bar' && (
          <div style={{ overflowY: 'auto', maxHeight: FIXED_H }}>
            <ResponsiveContainer width="100%" height={Math.max(FIXED_H, filteredSubCat.length * 26)}>
              <BarChart data={filteredSubCat} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 140 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => v >= 1e7 ? `${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v/1e5).toFixed(0)}L` : fmt(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: C.t2 }} width={135} />
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                <Tooltip formatter={v => fmt(v)} />
                <Bar dataKey="rev" name="Revenue" radius={[0,4,4,0]}>{filteredSubCat.map((r, i) => <Cell key={r.name + r.category} fill="#FFD600" />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  )
}

function ShopifyGeoDonutRow({ regionRows, tierRows, topStates, allStateRows, useUnits = false }) {
  const [metric, setMetric] = useState(useUnits ? 'units' : 'rev')
  const REGION_COLORS = ['#534AB7','#0D9E68','#2E74CC','#CC8A00','#CC4078','#E24B4A']
  const TIER_COLORS = ['#FFD600','#FF6B35','#9B59B6']
  const STATE_COLORS = ['#0D9E68','#2E74CC','#534AB7','#CC8A00','#E24B4A','#9B59B6']
  const metricVal = (r, m) => m === 'rev' ? r.rev : m === 'units' ? (r.units || 0) : m === 'orders' ? r.orders : (r.orders ? Math.round(r.rev / r.orders) : 0)
  const metricFmt = v => metric === 'rev' ? fmt(v) : metric === 'aov' ? `₹${v.toLocaleString('en-IN')}` : fmtN(v)
  const selStyle = active => ({ fontSize: 10, fontWeight: active ? 700 : 500, padding: '2px 8px', borderRadius: 4, border: `1px solid ${active ? C.acm : C.border}`, background: active ? C.acc : 'transparent', color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)' })

  // Horizontal-bar breakdown: label on left, colored bar in middle, value + % on right.
  const HBarBreakdown = ({ title, data, colors, grandTotal, noSort }) => {
    const total = grandTotal || data.reduce((s, d) => s + d.value, 0)
    const sorted = noSort ? [...data] : [...data].sort((a, b) => b.value - a.value)
    const maxVal = Math.max(...sorted.map(d => d.value), 1)
    const labelWidth = 72
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.t2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>{title}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map((d, i) => {
            const barPct = (d.value / maxVal) * 100
            const sharePct = total > 0 ? (d.value / total * 100) : 0
            const color = colors[i % colors.length]
            return (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: labelWidth, fontSize: 11.5, color: C.t2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }} title={d.name}>{d.name}</div>
                <div style={{ flex: 1, minWidth: 40, position: 'relative', height: 14 }}>
                  <div style={{ width: `${barPct}%`, background: color, height: '100%', borderRadius: 3, transition: 'width .3s' }} title={metricFmt(d.value)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, minWidth: 118, justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 11.5, fontFamily: 'var(--mono)', fontWeight: 600, color: C.t1 }}>{metricFmt(d.value)}</span>
                  <span style={{ fontSize: 11, color: C.t3, minWidth: 30, textAlign: 'right' }}>{sharePct.toFixed(0)}%</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const TIER_NAMES = { '1': 'Tier I', '2': 'Tier II', '3': 'Tier III', 'I': 'Tier I', 'II': 'Tier II', 'III': 'Tier III' }
  const TIER_ORDER2 = { 'Tier I': 0, 'Tier II': 1, 'Tier III': 2 }
  const regionData = regionRows.map((r, i) => ({ name: r.region, value: metricVal(r, metric) }))
  const tierData = tierRows.map(r => { const key = String(r.tier).replace(/^tier\s*/i, '').trim(); return { name: TIER_NAMES[key] || r.label || `Tier ${key}`, value: metricVal(r, metric) } }).sort((a, b) => (TIER_ORDER2[a.name] ?? 9) - (TIER_ORDER2[b.name] ?? 9))
  const stateData = topStates.map(r => ({ name: r.name ? r.name.charAt(0).toUpperCase() + r.name.slice(1).toLowerCase() : r.name, value: metricVal(r, metric) }))
  const allStateGrandTotal = (allStateRows || []).reduce((s, r) => s + metricVal(r, metric), 0) || null

  if (!regionData.length && !tierData.length) return null

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <Card title="Geography Breakdown" action={
        <div style={{ display: 'flex', gap: 3 }}>
          {(useUnits ? [['rev','Revenue'],['units','Units']] : [['rev','Revenue'],['orders','Orders']]).map(([k,l]) => <button key={k} onClick={() => setMetric(k)} style={selStyle(metric === k)}>{l}</button>)}
        </div>
      }>
        <div style={{ display: 'flex', gap: 24 }}>
          {regionData.length > 0 && <HBarBreakdown title="By Region" data={regionData} colors={REGION_COLORS} />}
          {tierData.length > 0 && <HBarBreakdown title="By City Tier" data={tierData} colors={TIER_COLORS} noSort />}
        </div>
      </Card>
    </div>
  )
}


// Compact Geography Breakdown card: a Region / City Tier toggle switching a single donut chart,
// instead of two side-by-side breakdowns — meant to sit alongside Trend + Category Revenue.
function GeoToggleDonutCard({ regionRows, tierRows, note, boxHeight }) {
  const [geoView, setGeoView] = useState('region')
  const REGION_COLORS = ['#534AB7','#0D9E68','#2E74CC','#CC8A00','#CC4078','#E24B4A']
  const TIER_COLORS = ['#FFD600','#FF6B35','#9B59B6']
  const TIER_NAMES = { '1': 'Tier I', '2': 'Tier II', '3': 'Tier III', 'I': 'Tier I', 'II': 'Tier II', 'III': 'Tier III' }
  const TIER_ORDER = { 'Tier I': 0, 'Tier II': 1, 'Tier III': 2 }

  const regionData = (regionRows || []).map((r, i) => ({ name: r.region, value: r.rev, color: REGION_COLORS[i % REGION_COLORS.length] }))
  const tierData = (tierRows || []).map(r => {
    const key = String(r.tier).replace(/^tier\s*/i, '').trim()
    return { name: TIER_NAMES[key] || r.label || `Tier ${key}`, value: r.rev }
  }).sort((a, b) => (TIER_ORDER[a.name] ?? 9) - (TIER_ORDER[b.name] ?? 9)).map((d, i) => ({ ...d, color: TIER_COLORS[i % TIER_COLORS.length] }))

  const data = geoView === 'region' ? regionData : tierData
  const total = data.reduce((s, d) => s + d.value, 0)
  const btnStyle = active => ({ fontSize: 11, fontWeight: active ? 700 : 500, padding: '3px 9px', borderRadius: 5, border: `1px solid ${active ? C.acm : C.border}`, background: active ? C.acc : 'transparent', color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)' })

  if (!regionData.length && !tierData.length) return null

  // Fixed content height derived from the "By Region" row count (the taller view) so toggling
  // to "By City Tier" (fewer rows) never shrinks the box — it just leaves the list vertically centered.
  // If boxHeight is supplied (to match a sibling card like CategoryRevenueCard), it wins.
  const ROW_H = 17
  const naturalContentH = 130 + 10 + Math.max(regionData.length, 1) * ROW_H + 20
  const HEADER_CHROME = 34 + 38 // Card title row + toggle-button row incl. margins
  const fixedContentH = boxHeight ? boxHeight - HEADER_CHROME : naturalContentH

  return (
    <Card title="Geography Breakdown" note={note} style={boxHeight ? { height: boxHeight, alignSelf: 'start' } : undefined}>
      <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
        <button onClick={() => setGeoView('region')} style={{ ...btnStyle(geoView === 'region'), flex: 1 }}>By Region</button>
        <button onClick={() => setGeoView('tier')} style={{ ...btnStyle(geoView === 'tier'), flex: 1 }}>By City Tier</button>
      </div>
      {data.length === 0 ? (
        <div style={{ fontSize: 12, color: C.t3, textAlign: 'center', padding: '30px 0', height: fixedContentH, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>City-tier detail not available{geoView === 'tier' ? '' : ' for this channel'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, height: fixedContentH, boxSizing: 'border-box' }}>
          <ResponsiveContainer width={130} height={130} style={{ flexShrink: 0 }}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={38} outerRadius={60} dataKey="value" paddingAngle={2}>
                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', fontSize: 12, color: '#111', fontWeight: 600 }}>{payload[0].name} : {fmt(payload[0].value)}</div> : null} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minHeight: 0, justifyContent: 'center' }}>
            {data.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: C.t2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)' }}>{fmt(d.value)}</span>
                <span style={{ fontSize: 10, color: C.t3, minWidth: 32, textAlign: 'right' }}>{total ? (d.value / total * 100).toFixed(1) : 0}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

function TopSubCatBar({ subCatRows }) {
  const top10 = (subCatRows || []).slice(0, 10)
  const BAR_COLORS = ['#534AB7','#0D9E68','#2E74CC','#CC8A00','#CC4078','#E24B4A','#9B59B6','#FF6B35','#00B4D8','#06D6A0']
  const chartData = top10.map((r, i) => ({ name: r.name, rev: r.rev, color: BAR_COLORS[i % BAR_COLORS.length] }))
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <Card title="Top 10 Products · Revenue">
        {top10.length === 0
          ? <div style={{ fontSize: 12, color: C.t3, textAlign: 'center', padding: '12px 0' }}>No data</div>
          : <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 90, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={true} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: C.t2 }} interval={0} angle={-45} textAnchor="end" />
                <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => v >= 1e5 ? `${(v/1e5).toFixed(0)}L` : fmt(v)} width={48} />
                <Tooltip content={({ active, payload }) => active && payload?.length ? (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 10px', fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: C.t1, marginBottom: 2 }}>{payload[0].payload.name}</div>
                    <div style={{ color: payload[0].payload.color }}>{fmt(payload[0].value)}</div>
                  </div>
                ) : null} />
                <Bar dataKey="rev" radius={[4, 4, 0, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
        }
      </Card>
    </div>
  )
}

function ShopifyGeoRichTable({ title, rows, firstKey, firstLabel, formatFirst, rtoLabel = 'RTO %', showAOV = true, showRTO = true, showASP = false, note }) {
  const table = useSortableTable('rev')
  const getters = {
    [firstKey]: r => r[firstKey], rev: r => r.rev, sharePct: r => r.sharePct, cumPct: r => r.cumPct, orders: r => r.orders,
    aov: r => r.aov || 0, asp: r => r.asp || 0, mom: r => r.mom ?? -Infinity, rtoPct: r => r.rtoPct || 0,
  }
  const sortedRows = table.sortRows(rows, getters)
  const { Th } = table

  // Same visual language as the Category Revenue Matrix / Ads-tab tables: C.bg sticky header
  // band, sortable columns, hover-highlighted rows, bold sticky-bottom Total row, fixed column
  // widths via colgroup so sorting never reflows the layout.
  const thStyle = { fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4, padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: `1.5px solid ${C.border}` }
  const thStyleL = { ...thStyle, textAlign: 'left' }
  const tdStyle = { fontSize: 12, padding: '5px 10px', textAlign: 'right', color: C.t1, borderBottom: `1px solid ${C.border}`, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const tdStyleL = { ...tdStyle, textAlign: 'left', fontFamily: 'inherit' }
  const totalTdStyle = { ...tdStyle, padding: '7px 10px', fontWeight: 700, color: C.t1, borderBottom: 'none' }

  const momCell = m => {
    if (m === null || m === undefined) return <span style={{ color: C.t3 }}>—</span>
    const positive = m >= 0
    return <span style={{ fontSize: 10, fontWeight: 700, color: positive ? '#0D9E68' : '#B91C1C' }}>{positive ? '↗' : '↘'} {Math.abs(m).toFixed(1)}%</span>
  }
  const rtoChip = pct => {
    let bg = '#E6F4EA', tx = '#0A6E4A'
    if (pct >= 25) { bg = '#FDE8E8'; tx = '#B91C1C' }
    else if (pct >= 15) { bg = '#FFF4E0'; tx = '#A66608' }
    return <span style={{ fontSize: 10, fontWeight: 700, background: bg, color: tx, padding: '2px 7px', borderRadius: 10 }}>{pct.toFixed(0)}%</span>
  }

  const tot = rows.reduce((s, r) => ({ rev: s.rev + (r.rev || 0), orders: s.orders + (r.orders || 0) }), { rev: 0, orders: 0 })
  const totAov = tot.orders > 0 ? tot.rev / tot.orders : 0
  const totAsp = rows.reduce((s, r) => s + (r.asp || 0) * (r.orders || 0), 0) / (tot.orders || 1)
  const totRtoPct = tot.rev > 0 ? rows.reduce((s, r) => s + (r.rtoPct || 0) * (r.rev || 0), 0) / tot.rev : 0

  const handleExport = () => {
    const csvRows = sortedRows.map(r => ({
      [firstLabel]: formatFirst ? formatFirst(r[firstKey]) : r[firstKey],
      Revenue: Math.round(r.rev), 'Share %': +r.sharePct.toFixed(1), 'Cum %': +r.cumPct.toFixed(1), Orders: r.orders,
      ...(showAOV ? { AOV: Math.round(r.aov || 0) } : {}),
      ...(showASP ? { ASP: Math.round(r.asp || 0) } : {}),
      'vs Prev %': r.mom != null ? +r.mom.toFixed(1) : '',
      ...(showRTO ? { [rtoLabel]: +(r.rtoPct || 0).toFixed(1) } : {}),
    }))
    exportCSV(csvRows, `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`)
  }

  const ALL_COLUMNS = [
    { id: 'rev', label: 'Revenue', sortKey: 'rev', width: 9,
      row: r => <td style={tdStyle}>{fmt(r.rev)}</td>, total: () => <td style={totalTdStyle}>{fmt(tot.rev)}</td> },
    { id: 'sharePct', label: '% Share', sortKey: 'sharePct', width: 9,
      row: r => <td style={tdStyle}>{r.sharePct.toFixed(1)}%</td>, total: () => <td style={totalTdStyle}>100%</td> },
    { id: 'cumPct', label: 'Cum %', sortKey: 'cumPct', width: 9,
      row: r => <td style={tdStyle}>{r.cumPct.toFixed(1)}%</td>, total: () => <td style={totalTdStyle}>—</td> },
    { id: 'orders', label: 'Orders', sortKey: 'orders', width: 9,
      row: r => <td style={tdStyle}>{fmtN(r.orders)}</td>, total: () => <td style={totalTdStyle}>{fmtN(tot.orders)}</td> },
    ...(showAOV ? [{ id: 'aov', label: 'AOV', sortKey: 'aov', width: 9,
      row: r => <td style={tdStyle}>₹{Math.round(r.aov || 0).toLocaleString('en-IN')}</td>, total: () => <td style={totalTdStyle}>₹{Math.round(totAov).toLocaleString('en-IN')}</td> }] : []),
    ...(showASP ? [{ id: 'asp', label: 'ASP', sortKey: 'asp', width: 9,
      row: r => <td style={tdStyle}>₹{Math.round(r.asp || 0).toLocaleString('en-IN')}</td>, total: () => <td style={totalTdStyle}>₹{Math.round(totAsp).toLocaleString('en-IN')}</td> }] : []),
    { id: 'mom', label: 'vs Prev', sortKey: 'mom', width: 9,
      row: r => <td style={{ ...tdStyle, fontFamily: 'inherit' }}>{momCell(r.mom)}</td>, total: () => <td style={{ ...totalTdStyle, fontFamily: 'inherit' }}>—</td> },
    ...(showRTO ? [{ id: 'rtoPct', label: rtoLabel, sortKey: 'rtoPct', width: 9,
      row: r => <td style={{ ...tdStyle, fontFamily: 'inherit' }}>{rtoChip(r.rtoPct || 0)}</td>, total: () => <td style={{ ...totalTdStyle, fontFamily: 'inherit' }}>{rtoChip(totRtoPct)}</td> }] : []),
  ]
  const reorder = useReorderableColumns(`datatable-cols:${title}`, ALL_COLUMNS)

  return (
    <div className="kpi-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: C.t1 }}>{title} <span style={{ fontWeight: 400, fontSize: 11.5, color: C.t3 }}>{rows.length} total{note ? ` · ${note}` : ''}</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!reorder.isDefaultOrder && <button onClick={reorder.resetOrder} title="Reset column order to default" style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>↺ Reset</button>}
          <button onClick={handleExport} style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>⭳ Export</button>
        </div>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, maxHeight: 560, minWidth: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '12%' }} />
            {reorder.orderedColumns.map(c => <col key={c.id} style={{ width: `${c.width}%` }} />)}
          </colgroup>
          <thead>
            <tr style={{ background: C.bg }}>
              <Th label={firstLabel} sortKey={firstKey} style={{ ...thStyleL, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }} align="left" />
              {reorder.orderedColumns.map(c => (
                <Th key={c.id} label={c.label} sortKey={c.sortKey} style={{ ...thStyle, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}
                  dragProps={{ onDragStart: reorder.onDragStart(c.id), onDragOver: reorder.onDragOver, onDrop: reorder.onDrop(c.id) }} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r, i) => {
              return (
                <tr key={r[firstKey] + '|' + i} style={{ cursor: 'default' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FFFBE6'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={tdStyleL}>{formatFirst ? formatFirst(r[firstKey]) : r[firstKey]}</td>
                  {reorder.orderedColumns.map(c => <Fragment key={c.id}>{c.row(r)}</Fragment>)}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: C.bg, borderTop: `1.5px solid ${C.border}`, position: 'sticky', bottom: 0 }}>
              <td style={{ ...totalTdStyle, textAlign: 'left' }}>Total</td>
              {reorder.orderedColumns.map(c => <Fragment key={c.id}>{c.total()}</Fragment>)}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function ShopifyReturnReasonsTable({ reasons = [] }) {
  const [expandedReason, setExpandedReason] = useState({})

  if (!reasons || reasons.length === 0) return null

  // Derive all unique categories (columns), sorted by total orders desc
  const catTotals = {}
  reasons.forEach(r => { catTotals[r.category] = (catTotals[r.category] || 0) + r.orders })
  const cats = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a])

  // Group: reason → { orders per cat, subReasons: { subReason → orders per cat } }
  const grouped = {}
  reasons.forEach(r => {
    if (!grouped[r.reason]) { grouped[r.reason] = { catOrders: {}, subReasons: {} } }
    grouped[r.reason].catOrders[r.category] = (grouped[r.reason].catOrders[r.category] || 0) + r.orders
    if (!grouped[r.reason].subReasons[r.subReason]) grouped[r.reason].subReasons[r.subReason] = { catOrders: {} }
    const sr = grouped[r.reason].subReasons[r.subReason]
    sr.catOrders[r.category] = (sr.catOrders[r.category] || 0) + r.orders
  })

  const reasonTotal = reason => Object.values(grouped[reason].catOrders).reduce((s, v) => s + v, 0)
  const grandTotal = Object.keys(grouped).reduce((s, r) => s + reasonTotal(r), 0)

  const sortedReasons = Object.keys(grouped).sort((a, b) => reasonTotal(b) - reasonTotal(a))

  // Column totals for column-wise % on reason rows
  const colTotals = {}
  cats.forEach(cat => { colTotals[cat] = Object.keys(grouped).reduce((s, r) => s + (grouped[r].catOrders[cat] || 0), 0) })

  const thStyle = { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: C.t3, padding: '4px 8px 6px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', whiteSpace: 'nowrap', background: C.card }
  const thL = { ...thStyle, textAlign: 'left', minWidth: 180 }
  const pctCell = (v, base) => {
    if (!v || !base) return <span style={{ color: C.t3, fontSize: 10 }}>—</span>
    return <span>{(v / base * 100).toFixed(1)}%</span>
  }

  return (
    <Card title="Return Reasons · D2C" note={`${sortedReasons.length} reasons · ${grandTotal.toLocaleString('en-IN')} orders`}>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 500 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              <th style={thL}>Reason / Sub-reason</th>
              {cats.map(cat => <th key={cat} style={thStyle}>{cat}</th>)}
            </tr>
          </thead>
          <tbody>
            {sortedReasons.map((reason, ri) => {
              const rd = grouped[reason]
              const rTotal = reasonTotal(reason)
              const isExp = expandedReason[reason]
              const sortedSubs = Object.entries(rd.subReasons).sort((a, b) => {
                const ta = Object.values(a[1].catOrders).reduce((s, v) => s + v, 0)
                const tb = Object.values(b[1].catOrders).reduce((s, v) => s + v, 0)
                return tb - ta
              })
              return [
                <tr key={`r-${reason}`} style={{ borderBottom: `1px solid ${C.border}`, background: ri % 2 === 0 ? C.card : C.bg, cursor: 'pointer' }}
                  onClick={() => setExpandedReason(p => ({ ...p, [reason]: !p[reason] }))}>
                  <td style={{ padding: '5px 8px', fontWeight: 600, color: C.t1, whiteSpace: 'nowrap' }}>
                    <span style={{ marginRight: 6, fontSize: 10, color: C.t3 }}>{isExp ? '▼' : '▶'}</span>
                    {reason}
                    <span style={{ marginLeft: 8, fontSize: 9, color: C.t3, fontWeight: 400 }}>{rTotal.toLocaleString('en-IN')} · {grandTotal > 0 ? (rTotal / grandTotal * 100).toFixed(1) : 0}%</span>
                  </td>
                  {cats.map(cat => <td key={cat} style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: C.t1 }}>{pctCell(rd.catOrders[cat], colTotals[cat])}</td>)}
                </tr>,
                ...(isExp ? sortedSubs.map(([subReason, sd]) => {
                  const srTotal = Object.values(sd.catOrders).reduce((s, v) => s + v, 0)
                  return (
                    <tr key={`sr-${reason}-${subReason}`} style={{ borderBottom: `1px solid ${C.border}`, background: C.acl }}>
                      <td style={{ padding: '4px 8px 4px 28px', color: C.t2, whiteSpace: 'nowrap' }}>
                        ↳ {subReason}
                        <span style={{ marginLeft: 8, fontSize: 9, color: C.t3 }}>{srTotal.toLocaleString('en-IN')} · {rTotal > 0 ? (srTotal / rTotal * 100).toFixed(1) : 0}% of reason</span>
                      </td>
                      {cats.map(cat => <td key={cat} style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: C.t2 }}>{pctCell(sd.catOrders[cat], rTotal > 0 ? rd.catOrders[cat] : null)}</td>)}
                    </tr>
                  )
                }) : [])
              ]
            }).flat()}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// D2C's All/MyFrido/Mobility toggle — extracted so SalesPage can render it on the shared
// filter-bar row (next to the filter icon) instead of nested inside ShopifyTab's own content.
// Reads/writes filters.subChannel directly, same as before — no new state introduced.
function D2CSubChannelToggle({ data, filters, setFilters }) {
  const subChannelMap = data.subChannelMap || {}
  const indiaSubChMap = Object.fromEntries(Object.entries(subChannelMap).filter(([k]) => k !== 'International' && k !== 'Shopify B2B' && k !== 'Shopify International' && k !== 'Unknown' && k !== 'Retail Store'))
  const indiaSubChKeys = data.allSubChannels?.length ? data.allSubChannels : Object.keys(indiaSubChMap)
  if (indiaSubChKeys.length === 0) return null
  const sel = filters.subChannel ? filters.subChannel.split(',').map(x => x.trim()).filter(v => v && v !== 'ShopifyIndia' && v !== 'International') : []
  const active = sel[0] || null
  const opts = [{ id: null, label: 'Overall' }, ...indiaSubChKeys.map(k => ({ id: k, label: k }))]
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {opts.map((opt, i) => (
        <div key={opt.label} style={{ display: 'flex', alignItems: 'center' }}>
          {i > 0 && <div style={{ width: 1, height: 14, background: '#E3E0D8', margin: '0 2px' }} />}
          <button onClick={() => setFilters(f => ({ ...f, subChannel: opt.id == null ? 'ShopifyIndia' : (active === opt.id ? 'ShopifyIndia' : opt.id) }))} style={{ fontSize: 12, fontWeight: (opt.id == null ? !active : active === opt.id) ? 700 : 500, padding: '5px 14px', borderRadius: 7, border: 'none', background: (opt.id == null ? !active : active === opt.id) ? '#FFD600' : 'transparent', color: '#13121A', cursor: 'pointer' }}>{opt.label}</button>
        </div>
      ))}
    </div>
  )
}

function ShopifyTab({ data, filters, setFilters }) {
  const [catRevView, setCatRevView] = useState('category') // 'category' | 'product'
  // D2C is India-only permanently (International orders now live under their own top-level
  // Channel='International' tab) — no region toggle, no filters.subChannel default needed.
  const isIntl = false

  const subChannelMap = data.subChannelMap || {}
  const paymentModeMap = data.paymentModeMap || {}
  const { orderStatusMap = {}, orderStatusRevMap = {}, nOrders, nCusts, repeatCusts, dailyArr, cityRows = [], voucherMap = {}, financialStatusMap = {}, fulfilmentStatusMap = {}, refundTrend = [] } = data

  // Shopify-only category/state maps from server-side queries
  const sh = data.shopify || {}
  const catMap = sh.catMap || {}
  const subCatMap = sh.subCatMap || {}
  const stateMap = sh.stateMap || {}
  const shCityRows = sh.cityRows || []
  const statePrevMap = sh.statePrevMap || {}
  const cityPrevMap = sh.cityPrevMap || {}
  const paymentTypes = sh.paymentTypes || []

  // sh.totals (and catMap/subCatMap below) are filtered server-side by the raw, ORDER-level
  // SubChannel column alone — they still include any stray non-Mobility-category row's revenue
  // when filters.subChannel='Mobility' is active, since (unlike pnlSalesRows/skuMap/
  // subChannelMap, which now all apply the Category-based reassignment) these come straight from
  // buildQuery()'s base filter with no item-master category join. subChannelMap (built from the
  // already-reconciled pnlSalesRows — see api/bq.js) IS category-correct, so use it in place of
  // sh.totals whenever a MyFrido/Mobility sub-channel filter is active.
  const isD2CSubChFiltered = filters.subChannel === 'Mobility' || filters.subChannel === 'MyFrido'
  const shCh = isD2CSubChFiltered ? (subChannelMap[filters.subChannel] || {}) : (sh.totals || {})
  const totalRev = shCh.rev || 0
  const totalExcRevRaw = shCh.excRev || 0
  const totalQty = shCh.qty || 0
  const shAspQty = shCh.aspQty || totalQty
  // Use shNetCalc (Shopify-only deductions) — same formula, correct channel scope.
  // Net Revenue (Inc GST) = Gross − Cancel − RTO − Return − CIR. GST is summed product-wise
  // (item master GST rate per SKU) over completed orders only, not a blended ratio over all
  // orders — see netCalc in api/bq.js. Net Revenue (Exc GST) = Net Rev (Inc GST) − that GST.
  const cancelledRev = (sh.netCalc?.cancelRev || 0) - (sh.netCalc?.codCancelRev || 0)
  const rtoRev = sh.netCalc?.rtoRev || 0
  const returnStatusRev = sh.netCalc?.returnRev || 0
  const cirRev = sh.netCalc?.cirRev || 0
  const grossAfterReturns = sh.netCalc?.netRevIncGst ?? (totalRev - cancelledRev - rtoRev - returnStatusRev - cirRev)
  const gst = sh.netCalc?.gstCompleted || 0
  const mobilityNetRevOverride = filters.subChannel === 'Mobility' ? (subChannelMap['Mobility']?.netRev ?? null) : null
  const netRev = mobilityNetRevOverride ?? sh.netCalc?.netRev ?? (grossAfterReturns - gst)
  const totalExcRev = netRev

  const prevRev = sh.prevRev || 0
  const prevExcRevRaw = sh.prevExcRev || 0
  const prevOrders = sh.prevOrders || 0
  const prevUnits = sh.prevUnits || 0
  const prevRtoOrders = sh.prevRtoOrders || 0
  const prevCirOrders = sh.prevCirOrders || 0
  const prevExchangeOrders = sh.prevExchangeOrders || 0
  const prevCancelledOrders = sh.prevCancelledOrders || 0
  const prevDailyArr = sh.prevDaily || []
  // Same completed-orders-GST formula as the current period, applied to the previous period's own
  // gross/cancel/RTO/return/CIR/GST figures (sh.prevNetCalc, from prevShNetCalc) — not a shrink
  // ratio estimated off the current period — so the WoW/MoM comparison is apples-to-apples.
  const prevGrossAfterReturns = sh.prevNetCalc?.netRevIncGst ?? prevRev
  const prevNetRev = sh.prevNetCalc?.netRev ?? prevGrossAfterReturns
  const prevExcRev = prevNetRev  // alias for backward-compat

  const shRevChg = prevRev > 0 ? ((totalRev - prevRev) / prevRev * 100) : null
  const shNOrders = shCh.orders || 0
  const shOrdChg = prevOrders > 0 ? ((shNOrders - prevOrders) / prevOrders * 100) : null
  const shExcChg = prevNetRev > 0 ? ((netRev - prevNetRev) / prevNetRev * 100) : null
  const shChgBadge = (cur, prev) => {
    if (!prev) return null
    const p = (cur - prev) / prev * 100
    return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span>
  }
  // For return/cancel metrics: higher is worse, so invert colors
  const shReturnBadge = (curPct, prevPct) => {
    if (!prevPct) return null
    const p = (curPct - prevPct) / prevPct * 100
    return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p > 0 ? C.red.bg : C.green.bg, color: p > 0 ? C.red.tx : C.green.tx, flexShrink: 0 }}>{p > 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span>
  }
  const shDailyArr = sh.daily || []
  const shSparkData = Array.from({ length: Math.max(shDailyArr.length, prevDailyArr.length) }, (_, i) => {
    const cur = shDailyArr[i]
    const pre = prevDailyArr[i]
    return { i, cur: cur ? cur.rev : null, prev: pre?.rev ?? null }
  })
  const nDays = sh.nDays || data.nDays || 1
  const dailyAvg = nDays ? totalRev / nDays : 0
  const aov = shNOrders ? totalRev / shNOrders : 0
  const asp = (shAspQty || totalQty) > 0 ? totalRev / (shAspQty || totalQty) : 0
  const deliveredOrders = orderStatusMap['Delivered'] || 0
  const rtoOrders = (orderStatusMap['RTO'] || 0) + (orderStatusMap['Return'] || 0)
  const fulfilmentPct = shNOrders ? (deliveredOrders / shNOrders * 100) : 0
  const shRtoRev = sh.netCalc?.rtoRev || 0
  const shReturnRev = sh.netCalc?.returnRev || 0
  const shCirRev = sh.netCalc?.cirRev || 0
  const shCancelRevRaw = sh.netCalc?.cancelRev || 0
  const shCodCancelRev = sh.netCalc?.codCancelRev || 0
  const shCancelRev = shCancelRevRaw - shCodCancelRev  // exclude COD cancels from return %
  const rtoPct = totalRev > 0 ? (shRtoRev + shReturnRev) / totalRev * 100 : 0
  const atRiskRev = shRtoRev + shReturnRev + shCirRev + shCancelRev
  const returnRevPct = totalRev > 0 ? ((shRtoRev + shReturnRev + shCirRev) / totalRev * 100) : 0
  const repeatRate = nCusts ? (repeatCusts / nCusts * 100).toFixed(1) : '0'

  // Sub-channel breakdown — D2C is India-only, so this is just every non-International sub-channel.
  const indiaSubChMap = Object.fromEntries(Object.entries(subChannelMap).filter(([k]) => k !== 'International' && k !== 'Shopify B2B' && k !== 'Shopify International' && k !== 'Unknown' && k !== 'Retail Store'))
  const activeSubChMap = indiaSubChMap
  const activeSubChKeys = Object.keys(activeSubChMap).sort((a, b) => activeSubChMap[b].rev - activeSubChMap[a].rev)
  const maxSubChRev = Math.max(...Object.values(activeSubChMap).map(v => v.rev), 1)

  const [selectedCat, setSelectedCat] = useState(null)
  const [shTrendGroup, setShTrendGroup] = useState('daily')
  const [shCatView, setShCatView] = useState('table')
  const [shSubCatView, setShSubCatView] = useState('table')
  // Same category-leak problem as sh.totals above — catMap/subCatMap come straight from
  // buildQuery()'s raw SubChannel filter (no item-master category correction), so they still
  // include stray non-Mobility-category revenue under the Mobility filter. Rebuild both from the
  // already-reconciled pnlSalesRows (api/bq.js) when a D2C sub-channel filter is active — orders
  // is a per-(category,sub_category) COUNT(DISTINCT OrderId) in pnlSalesRows and can't be summed
  // across sub_category rows to get a Category total without risking double-counting an order
  // that spans multiple sub-categories, so catRows' `orders` uses the sum here as a reasonable
  // approximation (same caveat already accepted for subChannelMap.orders in api/bq.js).
  const filteredCatMap = isD2CSubChFiltered ? (() => {
    const m = {}
    ;(data.pnlSalesRows || []).filter(r => r.platform === 'Shopify' && r.sub_channel === filters.subChannel).forEach(x => {
      const cat = x.category || 'Others'
      if (!m[cat]) m[cat] = { rev: 0, excRev: 0, orders: 0, units: 0 }
      m[cat].rev += parseFloat(x.gross_revenue) || 0
      m[cat].excRev += parseFloat(x.revenue) || 0
      m[cat].orders += parseInt(x.orders) || 0
      m[cat].units += parseInt(x.units) || 0
    })
    return m
  })() : catMap
  const filteredSubCatMap = isD2CSubChFiltered ? (() => {
    const m = {}
    ;(data.pnlSalesRows || []).filter(r => r.platform === 'Shopify' && r.sub_channel === filters.subChannel).forEach(x => {
      const key = `${x.category || 'Others'}::${x.sub_category || 'Others'}`
      if (!m[key]) m[key] = { rev: 0, excRev: 0, orders: 0, units: 0 }
      m[key].rev += parseFloat(x.gross_revenue) || 0
      m[key].excRev += parseFloat(x.revenue) || 0
      m[key].orders += parseInt(x.orders) || 0
      m[key].units += parseInt(x.units) || 0
    })
    return m
  })() : subCatMap
  const catRows = Object.entries(filteredCatMap).map(([k, v]) => { const orders = v.orders?.size ?? v.orders ?? 0; const aspU = v.aspUnits || v.units || 0; return { name: k, rev: v.rev, excRev: v.excRev || 0, orders, units: aspU, aov: orders ? v.rev / orders : 0, asp: aspU ? v.rev / aspU : 0 } }).sort((a, b) => b.rev - a.rev)
  const allSubCatRows = Object.entries(filteredSubCatMap).map(([k, v]) => { const orders = v.orders?.size ?? v.orders ?? 0; const aspU = v.aspUnits || v.units || 0; return { name: k.split('::')[1] || k, category: k.split('::')[0] || '', rev: v.rev, orders, units: aspU, aov: orders ? v.rev / orders : 0, asp: aspU ? v.rev / aspU : 0 } }).sort((a, b) => b.rev - a.rev)
  const subCatRows = selectedCat ? allSubCatRows.filter(r => r.category === selectedCat) : allSubCatRows
  const stateRows = (() => {
    const totalRevAll = sh.stateTotal?.rev || Object.values(stateMap).reduce((s, v) => s + (v.rev || 0), 0)
    const sorted = Object.entries(stateMap).map(([k, v]) => {
      const ord = v.orders instanceof Set ? v.orders.size : v.orders
      const prev = statePrevMap[k] || { rev: 0, orders: 0 }
      return {
        state: k,
        rev: v.rev,
        orders: ord,
        aov: ord ? v.rev / ord : 0,
        cities: v.cities?.size || 0,
        rtoOrders: v.rtoOrders || 0,
        // Return % = (RTO + Return + CIR) revenue ÷ Gross revenue — same "Total Return %"
        // definition used in the Category Revenue Matrix, kept consistent across the D2C tab.
        returnRev: v.returnRev || 0,
        rtoPct: v.rev > 0 ? ((v.returnRev || 0) / v.rev * 100) : 0,
        prevRev: prev.rev,
        prevOrders: prev.orders,
        mom: prev.rev > 0 ? ((v.rev - prev.rev) / prev.rev * 100) : null,
        sharePct: totalRevAll > 0 ? (v.rev / totalRevAll * 100) : 0,
      }
    }).sort((a, b) => b.rev - a.rev)
    // cumulative share
    let cum = 0
    sorted.forEach(r => { cum += r.sharePct; r.cumPct = cum })
    return sorted
  })()
  const enrichedCityRows = (() => {
    const totalRevAll = sh.cityTotal?.rev || shCityRows.reduce((s, c) => s + (c.rev || 0), 0)
    const sorted = shCityRows.map(c => {
      const key = `${c.city}|${c.state || ''}`
      const prev = cityPrevMap[key] || { rev: 0, orders: 0 }
      return {
        ...c,
        aov: c.orders ? c.rev / c.orders : 0,
        rtoPct: c.rev > 0 ? ((c.returnRev || 0) / c.rev * 100) : 0,
        prevRev: prev.rev,
        prevOrders: prev.orders,
        mom: prev.rev > 0 ? ((c.rev - prev.rev) / prev.rev * 100) : null,
        sharePct: totalRevAll > 0 ? (c.rev / totalRevAll * 100) : 0,
      }
    }).sort((a, b) => b.rev - a.rev)
    let cum = 0
    sorted.forEach(r => { cum += r.sharePct; r.cumPct = cum })
    return sorted
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {(filters.category?.length > 0 || filters.subCategory?.length > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: C.acl, borderRadius: 8, border: `1px solid ${C.acm}`, fontSize: 12 }}>
          <span style={{ color: C.t3, fontWeight: 600 }}>Filtered by:</span>
          {filters.category?.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: C.acc, border: `1px solid ${C.acm}`, borderRadius: 5, padding: '2px 8px', fontWeight: 700, color: C.t1 }}>
              Category: {filters.category.join(', ')}
              <span style={{ cursor: 'pointer', color: C.t2, marginLeft: 2 }} onClick={() => { setSelectedCat(null); setFilters(f => ({ ...f, category: [], subCategory: [] })) }}>✕</span>
            </span>
          )}
          {filters.subCategory?.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: C.acc, border: `1px solid ${C.acm}`, borderRadius: 5, padding: '2px 8px', fontWeight: 700, color: C.t1 }}>
              Sub-cat: {filters.subCategory.join(', ')}
              <span style={{ cursor: 'pointer', color: C.t2, marginLeft: 2 }} onClick={() => setFilters(f => ({ ...f, subCategory: [] }))}>✕</span>
            </span>
          )}
          <span style={{ marginLeft: 'auto', color: C.t3, fontSize: 11 }}>All KPIs & charts reflect this filter</span>
        </div>
      )}
      <div className="sales-kpi-section" style={{ display: 'grid', gridTemplateColumns: '1.2fr 5fr', gap: 10, alignItems: 'stretch' }}>
        {/* Hero card */}
        <div className="kpi-card sales-kpi-hero" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue Inc GST</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(totalRev)}</div>
            {shRevChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: shRevChg >= 0 ? C.green.bg : C.red.bg, color: shRevChg >= 0 ? C.green.tx : C.red.tx }}>{shRevChg >= 0 ? '▲' : '▼'} {Math.abs(shRevChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{shNOrders >= 1000 ? (shNOrders/1000).toFixed(1).replace(/\.0$/,'')+'k' : fmtN(shNOrders)} orders · {shAspQty >= 1000 ? (shAspQty/1000).toFixed(1).replace(/\.0$/,'')+'k' : fmtN(shAspQty)} units</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={shSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="shGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FFD600" stopOpacity={0.25} /><stop offset="95%" stopColor="#FFD600" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke="#FFD600" strokeWidth={2} fill="url(#shGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? C.t1 : C.t3 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        {/* Right: 2 rows of 5 KPIs */}
        {(() => {
          const cirOrders = data.cirOrders || 0
          const exchangeOrders = sh.netCalc?.exchOrders ?? data.exchangeOrders ?? 0
          const exchangeRev = sh.netCalc?.exchRev ?? data.exchangeRev ?? 0
          const cancelledOrders = orderStatusMap['Cancelled'] || 0
          const cancelPct = totalRev > 0 ? (cancelledRev / totalRev * 100) : 0
          const cirPct = totalRev > 0 ? shCirRev / totalRev * 100 : 0
          const exchangePct = totalRev > 0 ? (exchangeRev / totalRev * 100) : 0
          const excChg = prevExcRev > 0 ? ((totalExcRev - prevExcRev) / prevExcRev * 100) : null
          const prevGst = prevGrossAfterReturns - prevNetRev
          const row1 = [
            {
              label: 'Net Revenue',
              value: fmt(netRev),
              sub: 'Ex. return & cancellation',
              badge: excChg !== null ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: excChg >= 0 ? C.green.bg : C.red.bg, color: excChg >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{excChg >= 0 ? '▲' : '▼'} {Math.abs(excChg).toFixed(1)}%</span> : null,
            },
            { label: 'GST', value: fmt(gst), sub: grossAfterReturns > 0 ? `${((gst / grossAfterReturns) * 100).toFixed(1)}% of net sales` : '—', badge: shChgBadge(gst, prevGst) },
            { label: 'Daily Avg Rev', value: fmt(dailyAvg), sub: `over ${nDays} days`, badge: shChgBadge(dailyAvg, prevRev > 0 ? prevRev / nDays : 0) },
            { label: 'AOV', value: `₹${Math.round(aov).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ orders', badge: shChgBadge(aov, prevOrders > 0 ? prevRev / prevOrders : 0) },
            { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ units sold', badge: shChgBadge(asp, prevUnits > 0 ? prevRev / prevUnits : 0) },
          ]
          const cancelRevPerOrder = cancelledOrders > 0 ? cancelledRev / cancelledOrders : 0
          const prevCancelPct = prevRev > 0 ? (prevCancelledOrders * cancelRevPerOrder) / prevRev * 100 : 0
          const exchRevPerOrder = exchangeOrders > 0 ? exchangeRev / exchangeOrders : 0
          const prevExchangePct = prevRev > 0 ? (prevExchangeOrders * exchRevPerOrder) / prevRev * 100 : 0
          const prevReturnOrderPct = prevOrders > 0 ? (prevRtoOrders + prevCirOrders) / prevOrders * 100 : 0
          const prevReturnRevPct = prevRev > 0 ? ((prevRtoOrders + prevCirOrders) / prevOrders * 100) : 0
          const returnOrderPct = shNOrders ? ((rtoOrders + cirOrders) / shNOrders * 100) : 0
          const row2 = [
            { label: 'Cancellation %', value: `${cancelPct.toFixed(1)}%`, sub: `${fmt(cancelledRev)} cancelled rev`, accent: cancelPct > 5 ? '#7A1A1A' : undefined, badge: shReturnBadge(cancelPct, prevCancelPct) },
            { label: 'Returns %', value: `${returnRevPct.toFixed(1)}%`, sub: `${fmt(shRtoRev + shReturnRev + shCirRev)} RTO+CIR rev`, accent: returnRevPct > 5 ? '#7A1A1A' : undefined, badge: shReturnBadge(returnRevPct, prevReturnRevPct) },
            { label: 'Exchange %', value: `${exchangePct.toFixed(1)}%`, sub: `${fmt(exchangeRev)} exchange rev`, badge: shReturnBadge(exchangePct, prevExchangePct) },
            { label: 'RTO %', value: `${rtoPct.toFixed(1)}%`, sub: `${fmt(shRtoRev + shReturnRev)} RTO rev`, accent: rtoPct > 10 ? '#7A1A1A' : undefined, badge: shReturnBadge(rtoPct, prevOrders > 0 ? prevRtoOrders / prevOrders * 100 : 0) },
            { label: 'CIR %', value: `${cirPct.toFixed(1)}%`, sub: `${fmt(shCirRev)} CIR rev`, badge: shReturnBadge(cirPct, prevOrders > 0 ? prevCirOrders / prevOrders * 100 : 0) },
          ]
          return (
            <div className="sales-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 10, alignItems: 'stretch' }}>
              {[...row1, ...row2].map(k => (
                <div key={k.label} className="kpi-card" style={{ padding: '10px 13px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div className="kpi-label">{k.label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                    <div className="kpi-value" style={{ fontSize: 17, ...(k.accent ? { color: k.accent } : {}) }}>{k.value}</div>
                    {k.badge}
                  </div>
                  {k.sub && <div className="kpi-sub">{k.sub}</div>}
                </div>
              ))}
            </div>
          )
        })()}
      </div>
      <div className="g-2" style={{ gridTemplateColumns: '1.7fr 1fr 0.65fr', alignItems: 'start' }}>
        {(() => {
          const returnTrendMap = {}
          ;(data.dailyReturnTrend || []).forEach(x => { returnTrendMap[x.date] = x })
          // Net Revenue line: apply the same period-level shrink as the KPI card
          // (netRev / totalRev — Gross minus Cancel/RTO/Return/CIR, then GST removed on
          // completed orders only) since per-day CIR/RTO/Return/Cancel splits aren't available.
          const netShrinkFactor = totalRev > 0 ? netRev / totalRev : 0
          // Use Shopify-specific daily (EXCLUDES Shopify B2B)
          const rawDaily = (sh.daily || []).map(d => {
            const grossRev = d.rev || 0
            const rt = returnTrendMap[d.date] || {}
            return { date: d.date, grossRev, netRev: grossRev > 0 ? grossRev * netShrinkFactor : 0, returnPct: (rt.rtoPct || 0) + (rt.cirPct || 0), exchPct: rt.exchPct || 0, cancelPct: rt.cancelPct || 0 }
          }).filter(d => d.grossRev > 0)

          const grouped = (() => {
            if (shTrendGroup === 'daily') return rawDaily
            const buckets = {}
            rawDaily.forEach(d => {
              const dt = new Date(d.date)
              let key
              if (shTrendGroup === 'weekly') {
                const day = dt.getDay(), diff = dt.getDate() - day + (day === 0 ? -6 : 1)
                key = new Date(dt.setDate(diff)).toISOString().slice(0, 10)
              } else if (shTrendGroup === 'monthly') {
                key = d.date.slice(0, 7)
              } else {
                const m = parseInt(d.date.slice(5, 7))
                const q = Math.ceil(m / 3)
                key = `${d.date.slice(0, 4)}-Q${q}`
              }
              if (!buckets[key]) buckets[key] = { date: key, grossRev: 0, netRev: 0, returnPct: 0, exchPct: 0, cancelPct: 0, _n: 0 }
              buckets[key].grossRev += d.grossRev
              buckets[key].netRev += d.netRev
              buckets[key].returnPct += d.returnPct
              buckets[key].exchPct += d.exchPct
              buckets[key].cancelPct += d.cancelPct
              buckets[key]._n += 1
            })
            return Object.values(buckets).map(b => ({ ...b, returnPct: b._n ? b.returnPct / b._n : 0, exchPct: b._n ? b.exchPct / b._n : 0, cancelPct: b._n ? b.cancelPct / b._n : 0 })).sort((a, b) => a.date.localeCompare(b.date))
          })()

          const xFmt = d => shTrendGroup === 'daily' ? d?.slice(5) : shTrendGroup === 'monthly' ? d?.slice(0, 7) : d
          const tooltipFmt = d => {
            if (shTrendGroup === 'daily' || shTrendGroup === 'weekly') {
              const dt = new Date(d)
              return isNaN(dt) ? d : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
            }
            return xFmt(d)
          }
          return (
            <Card fill title="Revenue & Returns Trend" style={{ height: 360, alignSelf: 'start' }} action={
              <select value={shTrendGroup} onChange={e => setShTrendGroup(e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
                {['daily','weekly','monthly','quarterly'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
              </select>
            }>
              <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                <ComposedChart data={grouped} margin={{ top: 4, right: 50, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="shGrossGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FFD600" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#FFD600" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="shNetGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0D9E68" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#0D9E68" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={xFmt} />
                  <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => fmt(v)} width={60} />
                  <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => `${v.toFixed(1)}%`} width={40} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, color: C.t1 }}>{tooltipFmt(label)}</div>
                      {payload.map(p => (
                        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ color: C.t2 }}>{p.name}: {(p.yAxisId === 'pct' || p.name.endsWith('%') || ['returnPct','exchPct','cancelPct'].includes(p.dataKey)) ? `${Number(p.value).toFixed(1)}%` : fmt(p.value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area yAxisId="rev" type="monotone" dataKey="grossRev" name="Gross Revenue" stroke="#E0B800" fill="url(#shGrossGrad)" strokeWidth={2.5} dot={false} />
                  <Area yAxisId="rev" type="monotone" dataKey="netRev" name="Net Revenue" stroke="#0D9E68" fill="url(#shNetGrad)" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                  <Line yAxisId="pct" type="monotone" dataKey="returnPct" name="Return % (RTO+CIR)" stroke="#E24B4A" strokeWidth={1.5} dot={false} />
                  <Line yAxisId="pct" type="monotone" dataKey="exchPct" name="Exchange %" stroke="#9B59B6" strokeWidth={1.5} dot={false} strokeDasharray="3 2" />
                  <Line yAxisId="pct" type="monotone" dataKey="cancelPct" name="Cancellation %" stroke="#B91C1C" strokeWidth={1.5} dot={false} strokeDasharray="6 2" />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          )
        })()}
        {isIntl
          ? <Card title="Category Revenue"><div style={{ fontSize: 12, color: C.t3, padding: '10px 0', textAlign: 'center' }}>Category data not available for International orders</div></Card>
          : <CategoryRevenueCard
              catRows={catRows}
              subCatRows={allSubCatRows}
              skuMap={sh.skuMap || {}}
              totalRev={totalRev}
              view={catRevView}
              setView={setCatRevView}
              onSelectCategory={name => { const isSelected = (filters.category || []).includes(name); const next = isSelected ? [] : [name]; setSelectedCat(next[0] || null); setFilters(f => ({ ...f, category: next, subCategory: [] })) }}
              onSelectSubCategory={name => { const isSelected = (filters.subCategory || []).includes(name); setFilters(f => ({ ...f, subCategory: isSelected ? [] : [name] })) }}
              onSelectSku={name => { const isSelected = (filters.sku || []).includes(name); setFilters(f => ({ ...f, sku: isSelected ? [] : [name] })) }}
              height={360}
            />}
        {isIntl
          ? <Card title="Geography Breakdown"><div style={{ fontSize: 12, color: C.t3, padding: '10px 0', textAlign: 'center' }}>Geographic data not available for International orders</div></Card>
          : <GeoToggleDonutCard regionRows={sh.regionRows || []} tierRows={sh.tierRows || []} boxHeight={360} />}
      </div>
      {/* Category Revenue Matrix · Shopify */}
      {isIntl
        ? <Card title="Category Revenue Matrix · D2C International"><div style={{ fontSize: 12, color: C.t3, padding: '10px 0', textAlign: 'center' }}>Category breakdown not available for International orders</div></Card>
        : (() => {
        const pick = v => ({ rev: v.rev || 0, excRev: v.excRev || 0, units: v.units || 0, orders: v.orders, cancelled: v.cancelled || 0, rto: v.rto || 0, cir: v.cir || 0, exch: v.exch || 0, cancelRev: v.cancelRev || 0, codCancelRev: v.codCancelRev || 0, rtoRev: v.rtoRev || 0, cirRev: v.cirRev || 0, exchRev: v.exchRev || 0 })
        // When MyFrido or Mobility subchannel is selected, filter matrix data to that subchannel only
        const matrixSubCh = (filters.subChannel === 'MyFrido' || filters.subChannel === 'Mobility') ? filters.subChannel.toLowerCase() : null
        const catData = {}
        const subCatData = {}
        const skuData = {}
        Object.entries(sh.skuMap || {}).forEach(([cat, scMap]) => {
          skuData[cat] = {}
          Object.entries(scMap).forEach(([sc, skuMap_]) => {
            skuData[cat][sc] = {}
            Object.entries(skuMap_).forEach(([sku, v]) => {
              const rows = v.subChannelRows || {}
              const keys = matrixSubCh ? (rows[matrixSubCh] ? [matrixSubCh] : []) : Object.keys(rows).filter(k => k !== 'shopify international')
              if (keys.length === 0) return
              const agg = keys.reduce((a, k) => { const r = rows[k]; return { rev: a.rev+(r.rev||0), excRev: a.excRev+(r.excRev||0), units: a.units+(r.units||0), cancelRev: a.cancelRev+(r.cancelRev||0), codCancelRev: a.codCancelRev+(r.codCancelRev||0), rtoRev: a.rtoRev+(r.rtoRev||0), cirRev: a.cirRev+(r.cirRev||0), exchRev: a.exchRev+(r.exchRev||0), returnUnits: a.returnUnits+(r.returnUnits||0) } }, { rev:0, excRev:0, units:0, cancelRev:0, codCancelRev:0, rtoRev:0, cirRev:0, exchRev:0, returnUnits:0 })
              skuData[cat][sc][sku] = agg
              // accumulate into subCatData and catData
              if (!subCatData[cat]) subCatData[cat] = {}
              if (!subCatData[cat][sc]) subCatData[cat][sc] = { rev:0, excRev:0, units:0, cancelRev:0, codCancelRev:0, rtoRev:0, cirRev:0, exchRev:0 }
              Object.keys(agg).forEach(f => { if (f !== 'returnUnits') subCatData[cat][sc][f] = (subCatData[cat][sc][f]||0) + agg[f] })
              if (!catData[cat]) catData[cat] = { rev:0, excRev:0, units:0, cancelRev:0, codCancelRev:0, rtoRev:0, cirRev:0, exchRev:0 }
              Object.keys(agg).forEach(f => { if (f !== 'returnUnits') catData[cat][f] = (catData[cat][f]||0) + agg[f] })
            })
          })
        })
        // When no subchannel filter, use pre-aggregated maps (faster, already correct)
        if (!matrixSubCh) {
          Object.keys(catData).forEach(k => delete catData[k])
          Object.keys(subCatData).forEach(k => delete subCatData[k])
          Object.entries(sh.catMap || {}).forEach(([cat, v]) => { catData[cat] = pick(v) })
          Object.entries(sh.subCatMap || {}).forEach(([key, v]) => {
            const [cat, sc] = key.split('::')
            if (!subCatData[cat]) subCatData[cat] = {}
            subCatData[cat][sc] = pick(v)
          })
        }
        // Reconcile sh.mobilityNetBySubCat (raw, keyed by bare SubCategory — no Category
        // dimension) into a 'Category::SubCategory' composite-keyed map before passing it down —
        // the same SubCategory name can exist under 2 different Categories (e.g. 'Sparepart'
        // under both 'Mobility' and 'Sparepart (Chair & Mobility)'), and FlatCategoryProductMatrix.
        // mapRow() looks up by composite key (see its Mobility-override comment), so a bare-keyed
        // map would apply that one whitelist value to BOTH rows independently, double-counting it
        // in the table's Total. Mirrors PnLPage.jsx's reconciledMobilityNetBySubCat exactly.
        let reconciledMobilityNetBySubCat = {}
        if (filters.subChannel === 'Mobility' && sh.mobilityNetBySubCat) {
          const scToCats = new Map()
          Object.entries(subCatData).forEach(([cat, scMap]) => Object.keys(scMap).forEach(sc => {
            if (!scToCats.has(sc)) scToCats.set(sc, [])
            scToCats.get(sc).push(cat)
          }))
          Object.entries(sh.mobilityNetBySubCat).forEach(([sc, val]) => {
            const cats = scToCats.get(sc) || []
            if (cats.length <= 1) {
              const cat = cats[0] || 'Others'
              reconciledMobilityNetBySubCat[`${cat}::${sc}`] = (reconciledMobilityNetBySubCat[`${cat}::${sc}`] || 0) + val
            } else {
              const grossByCat = cats.map(cat => subCatData[cat]?.[sc]?.rev || 0)
              const totalGross = grossByCat.reduce((s, g) => s + g, 0)
              cats.forEach((cat, i) => {
                const share = totalGross > 0 ? val * (grossByCat[i] / totalGross) : val / cats.length
                reconciledMobilityNetBySubCat[`${cat}::${sc}`] = (reconciledMobilityNetBySubCat[`${cat}::${sc}`] || 0) + share
              })
            }
          })
        }
        return <FlatCategoryProductMatrix catData={catData} subCatData={subCatData} skuData={skuData} title="Category Revenue Matrix · D2C India" catPrevMap={sh.catPrevMap || {}} subCatPrevMap={sh.subCatPrevMap || {}} mobilityNetBySubCat={reconciledMobilityNetBySubCat} showReturnPct={true} detailedReturns />
      })()}
      {false && <div className="g-2" style={{ alignItems: 'stretch' }}>
        {(() => {
          const FIXED_H = 420
          const CAT_COLORS = ['#534AB7','#0D9E68','#2E74CC','#CC8A00','#CC4078','#E24B4A','#9B59B6','#FF6B35','#00B4D8','#06D6A0']
          const colorOf = name => { const idx = catRows.findIndex(r => r.name === name); return CAT_COLORS[idx >= 0 ? idx % CAT_COLORS.length : 0] }
          const btnStyle = v => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${shCatView === v ? C.acm : C.border}`, background: shCatView === v ? C.acc : 'transparent', color: shCatView === v ? C.t1 : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' })
          const totalCatRev = catRows.reduce((s, r) => s + r.rev, 0)
          return (
            <Card title="Category Revenue" note={selectedCat ? <span style={{ cursor: 'pointer', color: C.acc, fontWeight: 600 }} onClick={() => { setSelectedCat(null); setFilters(f => ({ ...f, category: [], subCategory: [] })) }}>✕ Clear</span> : `${catRows.length} total`}
              action={<div style={{ display: 'flex', gap: 4 }}>
                <button style={btnStyle('table')} onClick={() => setShCatView('table')}>Table</button>
                <button style={btnStyle('bar')} onClick={() => setShCatView('bar')}>Chart</button>
              </div>}>
              {shCatView === 'table' && (
                <div style={{ overflowY: 'auto', maxHeight: FIXED_H }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}><tr>{[{ label: 'Category' }, { label: 'Revenue / % Share', align: 'right' }, { label: 'Orders', align: 'right' }, { label: 'Units', align: 'right' }, { label: 'ASP', align: 'right' }].map(c => <th key={c.label} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: c.align || 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{c.label}</th>)}</tr></thead>
                    <tbody>{catRows.map((r, i) => { const isSelected = selectedCat === r.name; const share = totalCatRev ? (r.rev / totalCatRev * 100).toFixed(1) + '%' : '—'; return <tr key={r.name} onClick={() => { const next = isSelected ? null : r.name; setSelectedCat(next); setFilters(f => ({ ...f, category: next ? [next] : [], subCategory: [] })) }} style={{ borderBottom: i < catRows.length - 1 ? `1px solid ${C.border}` : 'none', background: isSelected ? C.acl : '', cursor: 'pointer' }} onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#FFFBE6' }} onMouseLeave={e => { e.currentTarget.style.background = isSelected ? C.acl : '' }}><td style={{ padding: '5.5px 5px', color: C.t2 }}>{isSelected ? <strong>{r.name}</strong> : r.name}</td><td style={{ padding: '5.5px 5px', textAlign: 'right' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1 }}>{fmt(r.rev)}</span><span style={{ fontSize: 10, color: C.t3, marginLeft: 5 }}>({share})</span></td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.orders)}</td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.units)}</td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>₹{Math.round(r.asp).toLocaleString('en-IN')}</td></tr> })}</tbody>
                  </table>
                </div>
              )}
              {shCatView === 'bar' && (
                <ResponsiveContainer width="100%" height={FIXED_H}>
                  <BarChart data={catRows} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 100 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => v >= 1e7 ? `${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v/1e5).toFixed(0)}L` : fmt(v)} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.t2 }} width={95} />
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                    <Tooltip formatter={v => fmt(v)} />
                    <Bar dataKey="rev" name="Revenue" radius={[0,4,4,0]} onClick={r => { const next = selectedCat === r.name ? null : r.name; setSelectedCat(next); setFilters(f => ({ ...f, category: next ? [next] : [], subCategory: [] })) }}>
                      {catRows.map(r => <Cell key={r.name} fill="#FFD600" opacity={selectedCat && selectedCat !== r.name ? 0.35 : 1} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          )
        })()}
        {(() => {
          const FIXED_H = 420
          const scColorOf = () => '#FFD600'
          const btnStyle = v => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${shSubCatView === v ? C.acm : C.border}`, background: shSubCatView === v ? C.acc : 'transparent', color: shSubCatView === v ? C.t1 : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' })
          const totalSubRev = subCatRows.reduce((s, r) => s + r.rev, 0)
          return (
            <Card title={selectedCat ? `Sub-categories · ${selectedCat}` : 'Sub-categories'} note={`${subCatRows.length} total`}
              action={<div style={{ display: 'flex', gap: 4 }}>
                <button style={btnStyle('table')} onClick={() => setShSubCatView('table')}>Table</button>
                <button style={btnStyle('bar')} onClick={() => setShSubCatView('bar')}>Chart</button>
              </div>}>
              {shSubCatView === 'table' && (
                <div style={{ overflowY: 'auto', maxHeight: FIXED_H }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}><tr>{[{ label: 'Sub-category' }, { label: 'Revenue / % Share', align: 'right' }, { label: 'Orders', align: 'right' }, { label: 'Units', align: 'right' }, { label: 'ASP', align: 'right' }].map(c => <th key={c.label} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: c.align || 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{c.label}</th>)}</tr></thead>
                    <tbody>{subCatRows.map((r, i) => { const isSelSub = (filters.subCategory || []).includes(r.name); const share = totalSubRev ? (r.rev / totalSubRev * 100).toFixed(1) + '%' : '—'; return <tr key={r.name} onClick={() => { const next = isSelSub ? [] : [r.name]; setFilters(f => ({ ...f, subCategory: next })) }} style={{ borderBottom: i < subCatRows.length - 1 ? `1px solid ${C.border}` : 'none', background: isSelSub ? C.acl : '', cursor: 'pointer' }} onMouseEnter={e => { if (!isSelSub) e.currentTarget.style.background = '#FFFBE6' }} onMouseLeave={e => { e.currentTarget.style.background = isSelSub ? C.acl : '' }}><td style={{ padding: '5.5px 5px', color: C.t2 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: scColorOf(), marginRight: 6 }} />{isSelSub ? <strong>{r.name}</strong> : r.name}</td><td style={{ padding: '5.5px 5px', textAlign: 'right' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1 }}>{fmt(r.rev)}</span><span style={{ fontSize: 10, color: C.t3, marginLeft: 5 }}>({share})</span></td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.orders)}</td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.units)}</td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>₹{Math.round(r.asp).toLocaleString('en-IN')}</td></tr> })}</tbody>
                  </table>
                </div>
              )}
              {shSubCatView === 'bar' && (
                <div style={{ overflowY: 'auto', maxHeight: FIXED_H }}>
                  <ResponsiveContainer width="100%" height={Math.max(FIXED_H, subCatRows.length * 26)}>
                    <BarChart data={subCatRows} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 200 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => v >= 1e7 ? `${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v/1e5).toFixed(0)}L` : fmt(v)} />
                      <YAxis type="category" dataKey="name" width={195} tick={({ x, y, payload }) => <text x={x} y={y} dy={4} textAnchor="end" fill={C.t2} fontSize={10}>{payload.value.length > 28 ? payload.value.slice(0, 27) + '…' : payload.value}</text>} />
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                      <Tooltip formatter={v => fmt(v)} />
                      <Bar dataKey="rev" name="Revenue" radius={[0,4,4,0]}>{subCatRows.map((r, i) => <Cell key={r.name} fill={scColorOf(r.name, i)} />)}</Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          )
        })()}
      </div>}
      {!isIntl && <div className="g-2" style={{ alignItems: 'stretch' }}>
        <ShopifyGeoRichTable title="Top States" rows={stateRows} firstKey="state" firstLabel="State" formatFirst={v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v} rtoLabel="Return %" />
        <ShopifyGeoRichTable title="Top Cities" rows={enrichedCityRows} firstKey="city" firstLabel="City" formatFirst={v => v ? v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : v} rtoLabel="Return %" />
      </div>}
      <ShopifyReturnReasonsTable reasons={sh.returnReasons || []} />
    </div>
  )
}

function EBOTab({ data, rangeStart, rangeEnd }) {
  const EBO_ACCENT = '#8B5E3C'
  const ebo = data.ebo || {}
  const catMap = ebo.catMap || {}
  const subCatMap = ebo.subCatMap || {}
  const skuMap = ebo.skuMap || {}
  const stateMap = ebo.stateMap || {}
  const statePrevMap = ebo.statePrevMap || {}
  const cityRows = ebo.cityRows || []
  const cityPrevMap = ebo.cityPrevMap || {}
  const regionRows = ebo.regionRows || []
  const tierRows = ebo.tierRows || []

  const totals = ebo.totals || {}
  const totalRev = totals.rev || 0
  const totalQty = totals.qty || 0
  const nOrders = totals.orders || 0

  const cancelRev = ebo.netCalc?.cancelRev || 0
  const rtoRev = ebo.netCalc?.rtoRev || 0
  const returnRev = ebo.netCalc?.returnRev || 0
  const cirRev = ebo.netCalc?.cirRev || 0
  const grossAfterReturns = totalRev - cancelRev - rtoRev - returnRev - cirRev
  const ncGross = ebo.netCalc?.gross || totalRev
  const ncExcRev = ebo.netCalc?.excRev || totals.excRev || 0
  const gstRatio = ncGross > 0 ? (ncGross - ncExcRev) / ncGross : 0
  const netRev = ebo.netCalc?.netRev ?? (grossAfterReturns * (1 - gstRatio))
  const gstCollected = ebo.netCalc?.gstCollected ?? (grossAfterReturns - netRev)

  const prevRev = ebo.prevRev || 0
  const prevExcRev = ebo.prevExcRev || 0
  const prevOrders = ebo.prevOrders || 0
  const prevUnits = ebo.prevUnits || 0
  const prevDailyArr = ebo.prevDaily || []
  const prevRtoOrders = ebo.prevRtoOrders || 0
  const prevCirOrders = ebo.prevCirOrders || 0
  const prevExchangeOrders = ebo.prevExchangeOrders || 0

  const prevGstRatio = prevRev > 0 ? (prevRev - prevExcRev) / prevRev : gstRatio
  const prevReturnsShrink = totalRev > 0 ? (cancelRev + rtoRev + cirRev) / totalRev : 0
  const prevGrossAfterReturns = prevRev * (1 - prevReturnsShrink)
  const prevNetRev = prevGrossAfterReturns * (1 - prevGstRatio)

  const shDailyArr = ebo.daily || []
  const nDays = shDailyArr.length || 1
  const dailyAvg = nDays ? totalRev / nDays : 0
  const aov = nOrders ? totalRev / nOrders : 0
  const asp = totalQty > 0 ? totalRev / totalQty : 0

  const exchangeOrders = ebo.exchange?.exchangeOrders || 0
  const exchangeRev = ebo.exchange?.exchangeRev || 0
  const cancelPct = totalRev > 0 ? (cancelRev / totalRev * 100) : 0
  const returnRevPct = totalRev > 0 ? ((rtoRev + returnRev + cirRev) / totalRev * 100) : 0
  const rtoPct = totalRev > 0 ? ((rtoRev + returnRev) / totalRev * 100) : 0
  const cirPct = totalRev > 0 ? (cirRev / totalRev * 100) : 0
  const exchangePct = totalRev > 0 ? (exchangeRev / totalRev * 100) : 0

  const shRevChg = prevRev > 0 ? ((totalRev - prevRev) / prevRev * 100) : null
  const excChg = prevNetRev > 0 ? ((netRev - prevNetRev) / prevNetRev * 100) : null

  const shSparkData = Array.from({ length: Math.max(shDailyArr.length, prevDailyArr.length) }, (_, i) => {
    const cur = shDailyArr[i]; const pre = prevDailyArr[i]
    return { i, cur: cur ? cur.rev : null, prev: pre?.rev ?? null }
  })

  const chgBadge = (cur, prev) => {
    if (!prev) return null
    const p = (cur - prev) / prev * 100
    if (Math.abs(p) > 500) return null
    return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span>
  }
  const retBadge = (curPct, prevPct) => {
    if (!prevPct) return null
    const p = (curPct - prevPct) / prevPct * 100
    if (Math.abs(p) > 500) return null
    return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p > 0 ? C.red.bg : C.green.bg, color: p > 0 ? C.red.tx : C.green.tx, flexShrink: 0 }}>{p > 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span>
  }

  const [selectedCat, setSelectedCat] = useState(null)
  const [trendGroup, setTrendGroup] = useState('daily')
  const [catRevView, setCatRevView] = useState('category')

  const catRows = Object.entries(catMap).map(([k, v]) => {
    const orders = v.orders?.size ?? v.orders ?? 0
    const aspU = v.aspUnits || v.units || 0
    return { name: k, rev: v.rev, excRev: v.excRev || 0, orders, units: aspU, aov: orders ? v.rev / orders : 0, asp: aspU ? v.rev / aspU : 0 }
  }).sort((a, b) => b.rev - a.rev)

  const allSubCatRows = Object.entries(subCatMap).map(([k, v]) => {
    const orders = v.orders?.size ?? v.orders ?? 0
    const aspU = v.aspUnits || v.units || 0
    return { name: k.split('::')[1] || k, category: k.split('::')[0] || '', rev: v.rev, orders, units: aspU, aov: orders ? v.rev / orders : 0, asp: aspU ? v.rev / aspU : 0 }
  }).sort((a, b) => b.rev - a.rev)
  const subCatRows = selectedCat ? allSubCatRows.filter(r => r.category === selectedCat) : allSubCatRows

  const stateRows = (() => {
    const totalRevAll = ebo.stateTotal?.rev || Object.values(stateMap).reduce((s, v) => s + (v.rev || 0), 0)
    const sorted = Object.entries(stateMap).map(([k, v]) => {
      const ord = v.orders instanceof Set ? v.orders.size : v.orders
      const prev = statePrevMap[k] || { rev: 0, orders: 0 }
      // Return % = (RTO + Return + CIR) revenue ÷ Gross revenue — same "Total Return %"
      // definition used in the Category Revenue Matrix, kept consistent across the EBO tab.
      return { state: k, rev: v.rev, orders: ord, aov: ord ? v.rev / ord : 0, cities: v.cities?.size || 0, rtoOrders: v.rtoOrders || 0, returnRev: v.returnRev || 0, rtoPct: v.rev > 0 ? ((v.returnRev || 0) / v.rev * 100) : 0, prevRev: prev.rev, prevOrders: prev.orders, mom: prev.rev > 0 ? ((v.rev - prev.rev) / prev.rev * 100) : null, sharePct: totalRevAll > 0 ? (v.rev / totalRevAll * 100) : 0 }
    }).sort((a, b) => b.rev - a.rev)
    let cum = 0; sorted.forEach(r => { cum += r.sharePct; r.cumPct = cum }); return sorted
  })()

  const enrichedCityRows = (() => {
    const totalRevAll = ebo.cityTotal?.rev || cityRows.reduce((s, c) => s + (c.rev || 0), 0)
    const sorted = cityRows.map(c => {
      const key = `${c.city}|${c.state || ''}`
      const prev = cityPrevMap[key] || { rev: 0, orders: 0 }
      return { ...c, aov: c.orders ? c.rev / c.orders : 0, rtoPct: c.rev > 0 ? ((c.returnRev || 0) / c.rev * 100) : 0, prevRev: prev.rev, prevOrders: prev.orders, mom: prev.rev > 0 ? ((c.rev - prev.rev) / prev.rev * 100) : null, sharePct: totalRevAll > 0 ? (c.rev / totalRevAll * 100) : 0 }
    }).sort((a, b) => b.rev - a.rev)
    let cum = 0; sorted.forEach(r => { cum += r.sharePct; r.cumPct = cum }); return sorted
  })()

  const returnTrendMap = {}
  ;(ebo.dailyReturnTrend || []).forEach(x => { returnTrendMap[x.date] = x })
  const netShrinkFactor = totalRev > 0 ? (grossAfterReturns / totalRev) * (1 - gstRatio) : (1 - gstRatio)
  const rawDaily = shDailyArr.map(d => {
    const grossR = d.rev || 0
    const rt = returnTrendMap[d.date] || {}
    const rtoPct = rt.rtoPct || 0
    const cirPct = rt.cirPct || 0
    const exchPct = rt.exchPct || 0
    const cancelPct = rt.cancelPct || 0
    return { date: d.date, grossRev: grossR, netRev: grossR > 0 ? grossR * netShrinkFactor : 0, returnPct: rtoPct + cirPct, exchPct, cancelPct }
  }).filter(d => d.grossRev > 0)

  const groupedDaily = (() => {
    if (trendGroup === 'daily') return rawDaily
    const buckets = {}
    rawDaily.forEach(d => {
      const dt = new Date(d.date); let key
      if (trendGroup === 'weekly') { const day = dt.getDay(), diff = dt.getDate() - day + (day === 0 ? -6 : 1); key = new Date(dt.setDate(diff)).toISOString().slice(0, 10) }
      else { key = d.date.slice(0, 7) }
      if (!buckets[key]) buckets[key] = { date: key, grossRev: 0, netRev: 0, returnPct: 0, exchPct: 0, cancelPct: 0, _n: 0 }
      buckets[key].grossRev += d.grossRev; buckets[key].netRev += d.netRev
      buckets[key].returnPct += d.returnPct; buckets[key].exchPct += d.exchPct; buckets[key].cancelPct += d.cancelPct; buckets[key]._n++
    })
    return Object.values(buckets).map(b => ({ ...b, returnPct: b._n ? b.returnPct / b._n : 0, exchPct: b._n ? b.exchPct / b._n : 0, cancelPct: b._n ? b.cancelPct / b._n : 0 })).sort((a, b) => a.date.localeCompare(b.date))
  })()

  const pick = v => ({ rev: v.rev || 0, excRev: v.excRev || 0, units: v.aspUnits || v.units || 0, orders: v.orders, cancelled: v.cancelled || 0, rto: v.rto || 0, cir: v.cir || 0, exch: v.exch || 0, cancelRev: v.cancelRev || 0, rtoRev: v.rtoRev || 0, cirRev: v.cirRev || 0, exchRev: v.exchRev || 0 })
  const catDataForMatrix = {}
  Object.entries(catMap).forEach(([cat, v]) => { catDataForMatrix[cat] = pick(v) })
  const subCatDataForMatrix = {}
  Object.entries(subCatMap).forEach(([key, v]) => {
    const [cat, sc] = key.split('::')
    if (!subCatDataForMatrix[cat]) subCatDataForMatrix[cat] = {}
    subCatDataForMatrix[cat][sc] = pick(v)
  })
  const skuDataForMatrix = {}
  Object.entries(skuMap).forEach(([cat, scMap]) => {
    skuDataForMatrix[cat] = {}
    Object.entries(scMap).forEach(([sc, skuMap_]) => {
      skuDataForMatrix[cat][sc] = {}
      Object.entries(skuMap_).forEach(([sku, v]) => { skuDataForMatrix[cat][sc][sku] = pick(v) })
    })
  })

  const toggleStyle = active => ({ fontSize: 12, fontWeight: active ? 700 : 500, padding: '4px 14px', borderRadius: 6, border: `1.5px solid ${active ? EBO_ACCENT : C.border2}`, background: active ? EBO_ACCENT : C.card, color: active ? '#fff' : C.t1, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .12s' })

  const prevCancelPct = prevOrders > 0 ? (prevOrders * (cancelPct / 100) * (nOrders > 0 ? cancelRev / nOrders : 0)) / prevRev * 100 : 0
  const prevReturnRevPct = prevRev > 0 ? ((prevRtoOrders + prevCirOrders) / Math.max(prevOrders, 1) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPI Grid */}
      <div className="sales-kpi-section" style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        {/* Hero card */}
        <div className="kpi-card sales-kpi-hero" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue Inc GST</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(totalRev)}</div>
            {shRevChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: shRevChg >= 0 ? C.green.bg : C.red.bg, color: shRevChg >= 0 ? C.green.tx : C.red.tx }}>{shRevChg >= 0 ? '▲' : '▼'} {Math.abs(shRevChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{fmtN(nOrders)} orders · {fmtN(totalQty)} units</div>
          <div style={{ flex: 1, minHeight: 60 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={shSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="eboGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={EBO_ACCENT} stopOpacity={0.25} /><stop offset="95%" stopColor={EBO_ACCENT} stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" stroke={EBO_ACCENT} strokeWidth={2} fill="url(#eboGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: C.t1 }}>{fmt(p.value)}</div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        {/* Right KPI grid */}
        <div className="sales-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 10 }}>
          {[
            { label: 'Net Revenue', value: fmt(netRev), sub: 'Gross − Cancel − RTO − Return − CIR − GST', badge: chgBadge(netRev, prevNetRev) },
            { label: 'GST', value: fmt(gstCollected), sub: grossAfterReturns > 0 ? `${((gstCollected / grossAfterReturns) * 100).toFixed(1)}% of net sales` : '—', badge: null },
            { label: 'Daily Avg Rev', value: fmt(dailyAvg), sub: `over ${nDays} days`, badge: chgBadge(dailyAvg, prevRev > 0 ? prevRev / nDays : 0) },
            { label: 'AOV', value: `₹${Math.round(aov).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ orders', badge: chgBadge(aov, prevOrders > 0 ? prevRev / prevOrders : 0) },
            { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ units', badge: chgBadge(asp, prevUnits > 0 ? prevRev / prevUnits : 0) },
            { label: 'Cancellation %', value: `${cancelPct.toFixed(1)}%`, sub: `${fmt(cancelRev)} cancelled rev`, accent: cancelPct > 5 ? '#7A1A1A' : undefined, badge: retBadge(cancelPct, prevCancelPct) },
            { label: 'Returns %', value: `${returnRevPct.toFixed(1)}%`, sub: `${fmt(rtoRev + returnRev + cirRev)} RTO+CIR rev`, accent: returnRevPct > 5 ? '#7A1A1A' : undefined, badge: retBadge(returnRevPct, prevReturnRevPct) },
            { label: 'Exchange %', value: `${exchangePct.toFixed(1)}%`, sub: `${fmt(exchangeRev)} exchange rev`, badge: retBadge(exchangePct, prevOrders > 0 ? prevExchangeOrders / prevOrders * 100 : 0) },
            { label: 'RTO %', value: `${rtoPct.toFixed(1)}%`, sub: `${fmt(rtoRev + returnRev)} RTO rev`, accent: rtoPct > 10 ? '#7A1A1A' : undefined, badge: retBadge(rtoPct, prevOrders > 0 ? prevRtoOrders / prevOrders * 100 : 0) },
            { label: 'CIR %', value: `${cirPct.toFixed(1)}%`, sub: `${fmt(cirRev)} CIR rev`, badge: retBadge(cirPct, prevOrders > 0 ? prevCirOrders / prevOrders * 100 : 0) },
          ].map(k => (
            <div key={k.label} className="kpi-card" style={{ padding: '10px 13px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="kpi-label">{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <div className="kpi-value" style={{ fontSize: 17, ...(k.accent ? { color: k.accent } : {}) }}>{k.value}</div>
                {k.badge}
              </div>
              {k.sub && <div className="kpi-sub">{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>
      {/* Revenue & Returns Trend + Category Revenue + Geography Breakdown side by side */}
      <div className="g-2" style={{ gridTemplateColumns: '1.5fr 1fr 0.65fr', alignItems: 'start' }}>
        <div className="card" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', height: 360, alignSelf: 'start', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>Revenue &amp; Returns Trend</span>
            <select value={trendGroup} onChange={e => setTrendGroup(e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
              {['daily','weekly','monthly'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%" minHeight={240}>
            <ComposedChart data={groupedDaily} margin={{ top: 4, right: 50, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="eboGrossGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FFD600" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#FFD600" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="eboNetGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0D9E68" stopOpacity={0.32} />
                  <stop offset="95%" stopColor="#0D9E68" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => v?.slice(5)} />
              <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => fmt(v)} width={60} />
              <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => `${v.toFixed(1)}%`} width={40} />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4, color: C.t2 }}>{label?.slice(5)}</div>
                  {payload.map(p => (
                    <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ color: C.t2 }}>{p.name}: {(p.yAxisId === 'pct' || ['returnPct','exchPct','cancelPct'].includes(p.dataKey)) ? `${Number(p.value).toFixed(1)}%` : fmt(p.value)}</span>
                    </div>
                  ))}
                </div>
              ) : null} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area yAxisId="rev" type="monotone" dataKey="grossRev" name="Gross Revenue" stroke="#E0B800" fill="url(#eboGrossGrad)" strokeWidth={2.5} dot={false} />
              <Area yAxisId="rev" type="monotone" dataKey="netRev" name="Net Revenue" stroke="#0D9E68" fill="url(#eboNetGrad)" strokeWidth={2} dot={false} strokeDasharray="4 2" />
              <Line yAxisId="pct" type="monotone" dataKey="returnPct" name="Return % (RTO+CIR)" stroke="#E24B4A" strokeWidth={1.5} dot={false} />
              <Line yAxisId="pct" type="monotone" dataKey="exchPct" name="Exchange %" stroke="#9B59B6" strokeWidth={1.5} dot={false} strokeDasharray="3 2" />
              <Line yAxisId="pct" type="monotone" dataKey="cancelPct" name="Cancellation %" stroke="#B91C1C" strokeWidth={1.5} dot={false} strokeDasharray="6 2" />
            </ComposedChart>
          </ResponsiveContainer>
          </div>
        </div>
        <CategoryRevenueCard
          catRows={catRows}
          subCatRows={allSubCatRows}
          skuMap={skuMap}
          totalRev={totalRev}
          view={catRevView}
          setView={setCatRevView}
          selectedName={selectedCat}
          onSelectCategory={name => setSelectedCat(prev => prev === name ? null : name)}
          height={360}
        />
        <GeoToggleDonutCard regionRows={regionRows} tierRows={tierRows} boxHeight={360} />
      </div>
      <FlatCategoryProductMatrix catData={catDataForMatrix} subCatData={subCatDataForMatrix} skuData={skuDataForMatrix} title="Category Revenue Matrix · EBO" catPrevMap={ebo.catPrevMap || {}} subCatPrevMap={ebo.subCatPrevMap || {}} showReturnPct={true} detailedReturns />
      {/* Geo tables */}
      <div className="g-2" style={{ alignItems: 'stretch' }}>
        <ShopifyGeoRichTable title="Top States" rows={stateRows} firstKey="state" firstLabel="State" formatFirst={v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v} rtoLabel="Return %" />
        <ShopifyGeoRichTable title="Top Cities" rows={enrichedCityRows} firstKey="city" firstLabel="City" formatFirst={v => v ? v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : v} rtoLabel="Return %" />
      </div>
      {/* Return reasons */}
      <ShopifyReturnReasonsTable reasons={ebo.returnReasons || []} />
    </div>
  )
}

// Amazon SC/VC is India-only permanently — International orders (SubChannel='Amazon
// International') now live under their own top-level Channel='International' tab. No region
// toggle/state here anymore.
// Amazon's Overall/Seller Central/Vendor Central toggle — extracted so SalesPage can render it on
// the shared filter-bar row, same pattern as D2CSubChannelToggle. channelView/setChannelView are
// now lifted to SalesPage (was local useState here before) so both the toggle and AmazonTab's
// content stay in sync from a single source of truth.
function AmazonChannelViewToggle({ channelView, setChannelView }) {
  const opts = [{ id: 'all', label: 'Overall' }, { id: 'sc', label: 'Seller Central' }, { id: 'vc', label: 'Vendor Central' }]
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {opts.map((opt, i) => (
        <div key={opt.id} style={{ display: 'flex', alignItems: 'center' }}>
          {i > 0 && <div style={{ width: 1, height: 14, background: '#E3E0D8', margin: '0 2px' }} />}
          <button onClick={() => setChannelView(opt.id)} style={{ fontSize: 12, fontWeight: channelView === opt.id ? 700 : 500, padding: '5px 14px', borderRadius: 7, border: 'none', background: channelView === opt.id ? '#FFD600' : 'transparent', color: '#13121A', cursor: 'pointer' }}>{opt.label}</button>
        </div>
      ))}
    </div>
  )
}

function AmazonTab({ data, channelView, setChannelView }) {
  const [selectedCat, setSelectedCat] = useState(null)
  const [selectedSubCat, setSelectedSubCat] = useState(null)
  const [catRevView, setCatRevView] = useState('category')
  const amzSC = data.amzSC || {}
  const amzVC = data.amzVC || {}
  const amzVCMatrix = data.amzVCMatrix || {}

  const returnRateReliable = (amzSC.returnRate?.rollOrders || 0) > 0
  // Combined SC+VC Returns % for the "All" toggle — SC's own returnRate card (rollOrders/
  // rollReturned — despite the "rollOrders" name, both are REVENUE figures: total_rev_inc/
  // returned_rev from amzSCReturnRate, see api/bq.js) is Seller-Central-only, so on the combined
  // view this must also fold in VC's orderedRev/returnRev rather than silently showing SC-only
  // figures under an "All"-scoped label.
  const amzCombinedReturnedRev = (amzSC.returnRate?.rollReturned || 0) + (amzVC.accounts?.reduce((s, a) => s + (a.returnRev || 0), 0) || 0)
  const amzCombinedGrossRev = (amzSC.returnRate?.rollOrders || 0) + (amzVC.accounts?.reduce((s, a) => s + (a.orderedRev || 0), 0) || 0)
  const amzCombinedReturnPct = amzCombinedGrossRev > 0 ? (amzCombinedReturnedRev / amzCombinedGrossRev * 100) : 0

  // ── Seller Central calcs ──
  const scFBA = amzSC.fulfillment?.find(f => f.type === 'FBA') || { orders: 0, rev: 0, excRev: 0, units: 0 }
  const scMFN = amzSC.fulfillment?.find(f => f.type === 'MFN') || { orders: 0, rev: 0, excRev: 0, units: 0 }
  const scTotalRev = scFBA.rev + scMFN.rev
  const scTotalExcRevRaw = (scFBA.excRev || 0) + (scMFN.excRev || 0)
  // Net Revenue: same row-level (Category/SubCategory, gross − returns, × blended GST ratio)
  // formula PnL's netOf()/netRevenueOf() uses — NOT amzSC.netCalc.netRev's precise per-order
  // formula. Confirmed with the user: the Sales tab should match PnL's number exactly here,
  // rather than each tab showing a different (if individually more/less precise) Net Revenue for
  // the same Amazon SC data — same fix direction as the D2C tab already uses.
  const scNetRevRowLevel = (() => {
    let net = 0
    Object.values(amzSC.subCatChannel || {}).forEach(scMap => {
      Object.values(scMap).forEach(d => {
        const gross = (d.FBA?.rev || 0) + (d.MFN?.rev || 0)
        const excRev = (d.FBA?.excRev || 0) + (d.MFN?.excRev || 0)
        const cancelRev = (d.FBA?.cancelRev || 0) + (d.MFN?.cancelRev || 0)
        const rtoRev = (d.FBA?.rtoRev || 0) + (d.MFN?.rtoRev || 0)
        const cirRev = (d.FBA?.cirRev || 0) + (d.MFN?.cirRev || 0)
        const returnRev = (d.FBA?.returnRev || 0) + (d.MFN?.returnRev || 0)
        const totalReturnRev = cancelRev + rtoRev + cirRev + returnRev
        const gstRatio = gross > 0 ? (gross - excRev) / gross : 0
        net += (gross - totalReturnRev) * (1 - gstRatio)
      })
    })
    return net
  })()
  const scNetRev = scNetRevRowLevel
  const scTotalExcRev = scNetRev
  const scTotalOrders = scFBA.orders + scMFN.orders
  const scAOV = scTotalOrders ? scTotalRev / scTotalOrders : 0
  const scTotalUnits = scFBA.units + scMFN.units
  const scCancelOrders = amzSC.status?.find(s => s.status === 'Cancelled')?.orders || 0
  const scStatusTotal = (amzSC.status || []).reduce((s, x) => s + x.orders, 0)
  const scCancelRate = scStatusTotal ? (scCancelOrders / scStatusTotal * 100) : 0
  // Daily SC - pivot FBA/MFN into single daily array
  const [ovTrendMetric, setOvTrendMetric] = useState('rev')
  const [ovTrendGroup, setOvTrendGroup] = useState('daily')
  const scDailyMap = {}
  ;(amzSC.daily || []).forEach(d => {
    if (!scDailyMap[d.date]) scDailyMap[d.date] = { date: d.date, FBA: 0, MFN: 0, FBA_orders: 0, MFN_orders: 0, FBA_units: 0, MFN_units: 0 }
    scDailyMap[d.date][d.type] = d.rev
    scDailyMap[d.date][d.type + '_orders'] = d.orders
    scDailyMap[d.date][d.type + '_units'] = d.units || 0
  })
  const scDailyArr = Object.values(scDailyMap).sort((a, b) => a.date.localeCompare(b.date))
  const maxStateRev = Math.max(...(amzSC.states || []).map(s => s.rev), 1)

  // ── Vendor Central calcs ──
  const vcTotalOrdered = amzVC.accounts?.reduce((s, a) => s + a.orderedRev, 0) || 0
  const vcTotalOrderedExcRev = amzVC.accounts?.reduce((s, a) => s + (a.orderedExcRev || 0), 0) || 0
  const vcTotalShipped = amzVC.accounts?.reduce((s, a) => s + a.shippedRev, 0) || 0
  const vcTotalOrderedUnits = amzVC.accounts?.reduce((s, a) => s + a.orderedUnits, 0) || 0
  // Returns% = return_rev ÷ gross_rev (revenue ÷ revenue) — same canonical ratio PnL's netOf()
  // uses for VC (totalReturnRev/gross, where VC's totalReturnRev is just returnRev). Previously
  // this divided a COUNT(DISTINCT OrderId) line-item count (amzVCAccounts.returns) by an
  // unfiltered gross unit SUM (shippedUnits) — a dimensionally wrong count÷units ratio that
  // showed ~5% here vs PnL's correct ~19% for the same July VC data.
  const vcTotalReturnRev = amzVC.accounts?.reduce((s, a) => s + (a.returnRev || 0), 0) || 0
  const vcReturnRate = vcTotalOrdered ? (vcTotalReturnRev / vcTotalOrdered * 100) : 0
  // Net Revenue (Ex GST, after returns) — vcTotalOrderedExcRev above is gross Ex-GST with no
  // returns deduction (correct to keep using it for GST/ASP/other cards where "gross" is what's
  // wanted), but a "Net Revenue" card must actually net out returns like every other channel.
  // Same (gross − returnRev) × (1 − gstRatio) formula api/bq.js's chMap['Amazon'] override and
  // PnL's Amazon tab already use for VC — kept in sync so this card can never drift from either.
  const vcGstRatio = vcTotalOrdered > 0 ? Math.max(0, (vcTotalOrdered - vcTotalOrderedExcRev) / vcTotalOrdered) : 0
  const vcNetRevenue = Math.max(vcTotalOrdered - vcTotalReturnRev, 0) * (1 - vcGstRatio)
  const vcMaxRev = Math.max(...(amzVC.accounts || []).map(a => a.orderedRev), 1)

  // ── Category filter overrides ──
  const scDailyCatFiltered = selectedCat ? (amzSC.dailyCat || []).filter(x => selectedSubCat ? x.category === selectedCat && x.subcategory === selectedSubCat : x.category === selectedCat) : null
  const vcDailyCatFiltered = selectedCat ? (amzVCMatrix.dailyCat || []).filter(x => selectedSubCat ? x.category === selectedCat && x.subcategory === selectedSubCat : x.category === selectedCat) : null
  const scCatRev = scDailyCatFiltered ? scDailyCatFiltered.reduce((s, x) => s + x.rev, 0) : scTotalRev
  const scCatExcRev = scDailyCatFiltered ? scDailyCatFiltered.reduce((s, x) => s + x.excRev, 0) : scTotalExcRev
  const scCatOrders = scDailyCatFiltered ? scDailyCatFiltered.reduce((s, x) => s + x.orders, 0) : scTotalOrders
  const scCatUnits = scDailyCatFiltered ? scDailyCatFiltered.reduce((s, x) => s + x.units, 0) : scTotalUnits
  const vcCatRev = vcDailyCatFiltered ? vcDailyCatFiltered.reduce((s, x) => s + x.rev, 0) : vcTotalOrdered
  const vcCatExcRev = vcDailyCatFiltered ? vcDailyCatFiltered.reduce((s, x) => s + x.excRev, 0) : vcTotalOrderedExcRev
  const vcCatOrders = vcDailyCatFiltered ? vcDailyCatFiltered.reduce((s, x) => s + x.orders, 0) : 0
  const vcCatUnits = vcDailyCatFiltered ? vcDailyCatFiltered.reduce((s, x) => s + x.units, 0) : vcTotalOrderedUnits
  const scDailyCatArr = scDailyCatFiltered
    ? (() => { const m = {}; scDailyCatFiltered.forEach(x => { if (!m[x.date]) m[x.date] = { date: x.date, FBA: 0, MFN: 0, FBA_orders: 0, MFN_orders: 0, FBA_units: 0, MFN_units: 0 }; m[x.date][(x.ch||'FBA')] = (m[x.date][(x.ch||'FBA')]||0) + x.rev; m[x.date][(x.ch||'FBA')+'_orders'] = (m[x.date][(x.ch||'FBA')+'_orders']||0) + x.orders; m[x.date][(x.ch||'FBA')+'_units'] = (m[x.date][(x.ch||'FBA')+'_units']||0) + x.units }); return Object.values(m).sort((a,b) => a.date.localeCompare(b.date)) })()
    : scDailyArr

  // ── Amazon prev-period for HeroKPICard ──
  const amzPrevSCRev = amzSC.prevRev || 0
  const amzPrevVCRev = amzVC.prevRev || 0
  const amzPrevTotalRev = amzPrevSCRev + amzPrevVCRev
  const amzTotalRev = scTotalRev + vcTotalOrdered
  const amzTotalChg = amzPrevTotalRev > 0 ? ((amzTotalRev - amzPrevTotalRev) / amzPrevTotalRev * 100) : null
  const amzSCChg = amzPrevSCRev > 0 ? ((scTotalRev - amzPrevSCRev) / amzPrevSCRev * 100) : null
  const amzVCChg = amzPrevVCRev > 0 ? ((vcTotalOrdered - amzPrevVCRev) / amzPrevVCRev * 100) : null
  const amzPrevDailyArr = amzSC.prevDaily || []
  const amzSparkData = Array.from({ length: Math.max(scDailyCatArr.length, amzPrevDailyArr.length) }, (_, i) => {
    const cur = scDailyCatArr[i]
    const pre = amzPrevDailyArr[i]
    return { i, cur: cur ? (cur.FBA || 0) + (cur.MFN || 0) : null, prev: pre?.rev ?? null }
  })

  // ── channelView filter: zero out the excluded channel's contribution to every combined figure ──
  // VC has no state/city/region/tier granularity or per-status (Return/RTO/CIR/Cancel) breakdown,
  // so when channelView === 'vc' those views fall back to an explicit "not available" state instead
  // of silently showing zeros.
  const showSC = channelView !== 'vc'
  const showVC = channelView !== 'sc'
  const chScCatRev = showSC ? scCatRev : 0
  const chVcCatRev = showVC ? vcCatRev : 0
  const chScCatExcRev = showSC ? scCatExcRev : 0
  const chVcCatExcRev = showVC ? vcCatExcRev : 0
  const chVcNetRevenue = showVC ? vcNetRevenue : 0
  const chScCatOrders = showSC ? scCatOrders : 0
  const chVcCatOrders = showVC ? vcCatOrders : 0
  const chScCatUnits = showSC ? scCatUnits : 0
  const chVcCatUnits = showVC ? vcCatUnits : 0
  const chScTotalRev = showSC ? scTotalRev : 0
  const chVcTotalOrdered = showVC ? vcTotalOrdered : 0
  const chScTotalExcRevRaw = showSC ? scTotalExcRevRaw : 0
  const chVcCatExcRevTotal = showVC ? vcTotalOrderedExcRev : 0
  const chScTotalUnits = showSC ? scTotalUnits : 0
  const chVcTotalOrderedUnits = showVC ? vcTotalOrderedUnits : 0
  const chAmzPrevSCRev = showSC ? amzPrevSCRev : 0
  const chAmzPrevVCRev = showVC ? amzPrevVCRev : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── OVERVIEW (SC + VC combined, filterable by channelView) ── */}
      {(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* KPI layout: hero + 2 rows of 4 */}
          {(() => {
            const amzChgBadge = (cur, prev) => { if (!prev || Math.abs(prev) < 1) return null; const p = (cur - prev) / prev * 100; if (Math.abs(p) > 999) return null; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }
            const amzPrevOrders = amzSC.prevOrders || 0
            const amzPrevUnits = amzSC.prevUnits || 0
            const amzPrevFbaRev = amzSC.prevFbaRev || 0
            const amzPrevCancelledOrders = amzSC.prevCancelledOrders || 0
            const amzPrevAOV = amzPrevOrders > 0 ? amzPrevSCRev / amzPrevOrders : 0
            const amzPrevASP = amzPrevUnits > 0 ? amzPrevSCRev / amzPrevUnits : 0
            const amzPrevDailyAvg = amzPrevTotalRev > 0 ? amzPrevTotalRev / (data.nDays || 1) : 0
            const amzPrevFbaShare = amzPrevSCRev > 0 ? (amzPrevFbaRev / amzPrevSCRev * 100) : 0
            const amzPrevCancelRate = amzPrevOrders > 0 ? (amzPrevCancelledOrders / amzPrevOrders * 100) : 0
            return (
              <div className="sales-kpi-section" style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
                <div className="kpi-card sales-kpi-hero" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
                  <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue Inc GST · {channelView === 'all' ? 'SC + VC' : channelView === 'sc' ? 'Seller Central' : 'Vendor Central'}{selectedCat ? ` · ${selectedSubCat || selectedCat}` : ''}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(chScCatRev + chVcCatRev)}</div>
                    {amzTotalChg !== null && !selectedCat && channelView === 'all' && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: amzTotalChg >= 0 ? C.green.bg : C.red.bg, color: amzTotalChg >= 0 ? C.green.tx : C.red.tx }}>{amzTotalChg >= 0 ? '▲' : '▼'} {Math.abs(amzTotalChg).toFixed(1)}%</span>}
                  </div>
                  <div className="kpi-sub" style={{ fontSize: 13 }}>{fmtN(chScCatOrders + chVcCatOrders)} orders · {fmtN(chScCatUnits + chVcCatUnits)} units</div>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={amzSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                        <defs><linearGradient id="amzGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FFD600" stopOpacity={0.25} /><stop offset="95%" stopColor="#FFD600" stopOpacity={0} /></linearGradient></defs>
                        <Area type="monotone" dataKey="cur" name="Current" stroke="#FFD600" strokeWidth={2} fill="url(#amzGrad)" dot={false} connectNulls />
                        <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                        <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? C.t1 : C.t3 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="sales-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 10, alignItems: 'stretch' }}>
                  {[
                    ...(channelView === 'all' ? [{ label: 'Gross Rev · Seller Central', value: fmt(chScCatRev), sub: (chScCatRev + chVcCatRev) > 0 ? `${(chScCatRev / (chScCatRev + chVcCatRev) * 100).toFixed(1)}% of total` : undefined, badge: selectedCat ? null : amzChgBadge(chScTotalRev, chAmzPrevSCRev) }] : []),
                    ...(channelView === 'all' ? [{ label: 'Gross Rev · Vendor Central', value: fmt(chVcCatRev), sub: (chScCatRev + chVcCatRev) > 0 ? `${(chVcCatRev / (chScCatRev + chVcCatRev) * 100).toFixed(1)}% of total` : undefined, badge: selectedCat ? null : amzChgBadge(chVcTotalOrdered, chAmzPrevVCRev) }] : []),
                    { label: 'Net Revenue', value: fmt(chScCatExcRev + chVcNetRevenue), sub: 'Ex GST, after returns/cancellation', subTitle: channelView === 'all' ? 'SC (Gross−Cancel−Returns−GST) + VC (Gross−Returns−GST)' : channelView === 'sc' ? 'Gross−Cancel−Returns−GST' : 'Gross−Returns−GST', badge: selectedCat || channelView !== 'all' ? null : amzChgBadge(scTotalExcRev + vcNetRevenue, (amzSC.prevExcRev || 0) + (amzVC.prevExcRev || 0)) },
                    { label: 'GST', value: fmt((chScCatRev - chScTotalExcRevRaw) + (chVcCatRev - chVcCatExcRev)), sub: channelView === 'all' ? 'SC + VC GST' : channelView === 'sc' ? 'SC GST' : 'VC GST', badge: selectedCat || channelView !== 'all' ? null : amzChgBadge((scTotalRev - scTotalExcRevRaw) + (vcTotalOrdered - vcTotalOrderedExcRev), ((amzSC.prevRev || 0) - (amzSC.prevExcRev || 0)) + ((amzVC.prevRev || 0) - (amzVC.prevExcRev || 0))) },
                    { label: 'Daily Avg Rev', value: fmt((chScCatRev + chVcCatRev) / (data.nDays || 1)), sub: channelView === 'all' ? 'SC + VC per day' : 'Per day', badge: selectedCat || channelView !== 'all' ? null : amzChgBadge((scTotalRev + vcTotalOrdered) / (data.nDays || 1), amzPrevDailyAvg) },
                    { label: 'ASP', value: `₹${(chScCatUnits + chVcCatUnits) ? Math.round((chScCatRev + chVcCatRev) / (chScCatUnits + chVcCatUnits)).toLocaleString('en-IN') : 0}`, sub: channelView === 'all' ? 'Gross rev ÷ units (SC+VC)' : 'Gross rev ÷ units', badge: selectedCat || channelView !== 'all' ? null : amzChgBadge((scTotalUnits + vcTotalOrderedUnits) ? (scTotalRev + vcTotalOrdered) / (scTotalUnits + vcTotalOrderedUnits) : 0, amzPrevASP) },
                    ...(channelView !== 'vc' ? [{ label: 'AOV', value: `₹${chScCatOrders ? Math.round(chScCatRev / chScCatOrders).toLocaleString('en-IN') : 0}`, sub: 'SC gross rev ÷ orders (VC has no order count)', badge: selectedCat ? null : amzChgBadge(scAOV, amzPrevAOV) }] : []),
                    ...(channelView === 'sc' ? [{ label: 'Cancellation Rate', value: `${scCancelRate.toFixed(1)}%`, sub: `${fmtN(scCancelOrders)} cancelled (SC)`, accent: scCancelRate > 10 ? '#7A1A1A' : undefined, badge: amzPrevCancelRate ? (() => { const p = (scCancelRate - amzPrevCancelRate) / amzPrevCancelRate * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p > 0 ? C.red.bg : C.green.bg, color: p > 0 ? C.red.tx : C.green.tx, flexShrink: 0 }}>{p > 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> })() : null }] : []),
                    ...(channelView === 'all' ? [{ label: 'Returns %', value: returnRateReliable ? `${amzCombinedReturnPct.toFixed(1)}%` : 'N/A', sub: returnRateReliable ? `${fmt(amzCombinedReturnedRev)} returned of ${fmt(amzCombinedGrossRev)} SC+VC rev` : 'No reliable data', accent: returnRateReliable && amzCombinedReturnPct > 18 ? '#7A1A1A' : undefined }] : []),
                    ...(channelView === 'sc' ? [{ label: 'Returns % (SC)', value: returnRateReliable ? `${(amzSC.returnRate?.pct || 0).toFixed(1)}%` : 'N/A', sub: returnRateReliable ? `${fmt(amzSC.returnRate?.rollReturned || 0)} returned of ${fmt(amzSC.returnRate?.rollOrders || 0)} SC rev` : 'No reliable data', accent: returnRateReliable && (amzSC.returnRate?.pct || 0) > 18 ? '#7A1A1A' : undefined }] : []),
                    ...(channelView === 'vc' ? [{ label: 'Returns % (VC)', value: `${vcReturnRate.toFixed(1)}%`, sub: `${fmt(vcTotalReturnRev)} returned of ${fmt(vcTotalOrdered)} gross rev` }] : []),
                  ].map(k => (
                    <div key={k.label} className="kpi-card" style={{ padding: '10px 13px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="kpi-label">{k.label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                        <div className="kpi-value" style={{ fontSize: 17, ...(k.accent ? { color: k.accent } : {}) }}>{k.value}</div>
                        {k.badge}
                      </div>
                      {k.sub && <div className="kpi-sub" title={k.subTitle}>{k.sub}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
          {/* Overview Trend Analysis: SC + VC combined */}
          {(() => {
            const vcDailyMap = {}
            if (selectedCat) {
              vcDailyCatFiltered?.forEach(d => { if (!vcDailyMap[d.date]) vcDailyMap[d.date] = { orderedRev: 0, orderedUnits: 0 }; vcDailyMap[d.date].orderedRev += d.rev; vcDailyMap[d.date].orderedUnits += d.units })
            } else {
              ;(amzVC.daily || []).forEach(d => { vcDailyMap[d.date] = { orderedRev: d.orderedRev || 0, orderedUnits: d.orderedUnits || 0 } })
            }
            const gstRate = scTotalRev > 0 ? (scTotalRev - scTotalExcRevRaw) / scTotalRev : 0
            const returnRate = scTotalRev > 0 ? (amzSC.netCalc?.returnRev || 0) / scTotalRev : 0
            const cancelRate2 = scTotalRev > 0 ? (amzSC.netCalc?.cancelRev || 0) / scTotalRev : 0
            const allDates = [...new Set([...scDailyCatArr.map(d => d.date), ...Object.keys(vcDailyMap)])].sort()
            const rawDaily = allDates.map(date => {
              const sc = scDailyCatArr.find(d => d.date === date) || {}
              const vc = vcDailyMap[date] || { orderedRev: 0, orderedUnits: 0 }
              const scRev = showSC ? (sc.FBA || 0) + (sc.MFN || 0) : 0
              const vcRev = showVC ? vc.orderedRev : 0
              const gross = scRev + vcRev
              const scO = showSC ? (sc.FBA_orders || 0) + (sc.MFN_orders || 0) : 0
              const scU = showSC ? (sc.FBA_units || 0) + (sc.MFN_units || 0) : 0
              const vcU = showVC ? vc.orderedUnits : 0
              const scNetDaily = scRev * (1 - cancelRate2 - returnRate) * (1 - gstRate)
              const vcNetDaily = vcRev * (1 - gstRate)
              return {
                date,
                grossRev: gross, netRev: scNetDaily + vcNetDaily,
                scRev, vcRev,
                scShare: gross > 0 ? scRev / gross * 100 : null,
                scOrders: scO, vcOrders: vcU,
                totalOrders: scO + vcU,
                scOrderShare: (scO + vcU) > 0 ? scO / (scO + vcU) * 100 : null,
                scUnits: scU, vcUnits: vcU,
                totalUnits: scU + vcU,
                scUnitShare: (scU + vcU) > 0 ? scU / (scU + vcU) * 100 : null,
              }
            })
            const grouped = (() => {
              if (ovTrendGroup === 'daily') return rawDaily
              const buckets = {}
              rawDaily.forEach(d => {
                const dt = new Date(d.date)
                let key
                if (ovTrendGroup === 'weekly') {
                  const day = dt.getDay(), diff = dt.getDate() - day + (day === 0 ? -6 : 1)
                  key = new Date(new Date(d.date).setDate(diff)).toISOString().slice(0, 10)
                } else if (ovTrendGroup === 'monthly') {
                  key = d.date.slice(0, 7)
                } else {
                  key = `${d.date.slice(0, 4)}-Q${Math.ceil(parseInt(d.date.slice(5, 7)) / 3)}`
                }
                if (!buckets[key]) buckets[key] = { date: key, grossRev: 0, netRev: 0, scRev: 0, vcRev: 0, scOrders: 0, vcOrders: 0, totalOrders: 0, scUnits: 0, vcUnits: 0, totalUnits: 0 }
                buckets[key].grossRev += d.grossRev; buckets[key].netRev += d.netRev
                buckets[key].scRev += d.scRev; buckets[key].vcRev += d.vcRev
                buckets[key].scOrders += d.scOrders; buckets[key].vcOrders += d.vcOrders; buckets[key].totalOrders += d.totalOrders
                buckets[key].scUnits += d.scUnits; buckets[key].vcUnits += d.vcUnits; buckets[key].totalUnits += d.totalUnits
              })
              return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date)).map(b => ({
                ...b,
                scShare: b.grossRev > 0 ? b.scRev / b.grossRev * 100 : null,
                scOrderShare: b.totalOrders > 0 ? b.scOrders / b.totalOrders * 100 : null,
                scUnitShare: b.totalUnits > 0 ? b.scUnits / b.totalUnits * 100 : null,
              }))
            })()
            const groupedWithRet = grouped.map(d => ({ ...d }))
            const xFmt = d => ovTrendGroup === 'daily' ? d?.slice(5) : ovTrendGroup === 'monthly' ? d?.slice(0, 7) : d
            const isRev = ovTrendMetric === 'rev', isOrders = ovTrendMetric === 'orders'
            const mainFmt = isRev ? (v => v >= 1e5 ? `${(v/1e5).toFixed(1)}L` : fmt(v)) : (v => fmtN(v))
            const ttFmt = isRev ? fmt : fmtN
            const dk = isRev
              ? { total: 'grossRev', totalName: 'Gross Revenue', sub: 'netRev', subName: 'Net Revenue', a: 'scRev', aName: 'SC Rev', b: 'vcRev', bName: 'VC Rev', share: 'scShare', shareName: 'SC Share %' }
              : isOrders
              ? { total: 'totalOrders', totalName: 'Total Orders', sub: null, a: 'scOrders', aName: 'SC Orders', b: 'vcOrders', bName: 'VC Orders', share: 'scOrderShare', shareName: 'SC Share %' }
              : { total: 'totalUnits', totalName: 'Total Units', sub: null, a: 'scUnits', aName: 'SC Units', b: 'vcUnits', bName: 'VC Units', share: 'scUnitShare', shareName: 'SC Share %' }
            const scRevTotal = grouped.reduce((s, d) => s + (d.scRev || 0), 0)
            const vcRevTotal = grouped.reduce((s, d) => s + (d.vcRev || 0), 0)
            const splitData = [
              { name: 'Seller Central', value: scRevTotal, color: '#E8930A' },
              { name: 'Vendor Central', value: vcRevTotal, color: '#2E74CC' },
            ]
            const statusColors = { Shipped: '#2E74CC', Pending: '#E8930A', Cancelled: '#E24B4A', Shipping: '#9B59B6' }
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.65fr', gap: 14, alignItems: 'start' }}>
                <Card fill title="Revenue & Returns Trend" style={{ height: 360, alignSelf: 'start' }} note={channelView !== 'all' ? (channelView === 'sc' ? 'Seller Central' : 'Vendor Central') : undefined} action={
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[{ v: 'rev', label: 'Revenue' }, { v: 'orders', label: 'Orders' }, { v: 'units', label: 'Units' }].map(opt => (
                        <button key={opt.v} onClick={() => setOvTrendMetric(opt.v)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${ovTrendMetric === opt.v ? C.t1 : C.border}`, background: ovTrendMetric === opt.v ? C.t1 : 'transparent', color: ovTrendMetric === opt.v ? '#fff' : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' }}>{opt.label}</button>
                      ))}
                    </div>
                    <select value={ovTrendGroup} onChange={e => setOvTrendGroup(e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
                      {['daily','weekly','monthly','quarterly'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
                    </select>
                  </div>
                }>
                  <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                    <ComposedChart data={groupedWithRet} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={xFmt} />
                      <YAxis yAxisId="main" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={mainFmt} width={58} />
                      <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
                          <div style={{ fontWeight: 700, marginBottom: 4, color: C.t2 }}>{xFmt(label)}</div>
                          {payload.map(p => (
                            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                              <span style={{ color: C.t2 }}>{p.name}: {ttFmt(p.value)}</span>
                            </div>
                          ))}
                        </div>
                      ) : null} />
                      <Legend wrapperStyle={{ fontSize: 10 }} formatter={v => v} />
                      <Area yAxisId="main" type="monotone" dataKey={dk.total} name={dk.totalName} stroke="#FFD600" fill="#FFD60022" strokeWidth={2} dot={false} />
                      {isRev && <Area yAxisId="main" type="monotone" dataKey={dk.sub} name={dk.subName} stroke="#0D9E68" fill="#0D9E6811" strokeWidth={2} dot={false} strokeDasharray="4 2" />}
                      {channelView === 'all' && <Line yAxisId="main" type="monotone" dataKey={dk.a} name={dk.aName} stroke="#E8930A" strokeWidth={1.5} dot={false} />}
                      {channelView === 'all' && <Line yAxisId="main" type="monotone" dataKey={dk.b} name={dk.bName} stroke="#2E74CC" strokeWidth={1.5} dot={false} strokeDasharray="3 2" />}
                    </ComposedChart>
                  </ResponsiveContainer>
                </Card>
                {(() => {
                  const catRows = Array.from(new Set([...Object.keys(amzSC.catChannel || {}), ...Object.keys(amzVCMatrix.catData || {})])).map(cat => {
                    const scD = showSC ? (amzSC.catChannel?.[cat] || {}) : {}; const vc = showVC ? (amzVCMatrix.catData?.[cat] || {}) : {}
                    const rev = (scD.FBA?.rev||0)+(scD.MFN?.rev||0)+(vc.rev||0); const units = (scD.FBA?.units||0)+(scD.MFN?.units||0)+(vc.units||0); const orders = (scD.FBA?.orders||0)+(scD.MFN?.orders||0)+(vc.orders||0)
                    return { name: cat, rev, units, orders }
                  }).filter(r => r.rev > 0).sort((a,b) => b.rev - a.rev)
                  const allScSub = amzSC.subCatChannel || {}; const allVcSub = amzVCMatrix.subCatData || {}
                  const subCatSet = new Set([...Object.keys(allScSub).flatMap(cat => Object.keys(allScSub[cat]||{}).map(sc => cat+'::'+sc)), ...Object.keys(allVcSub).flatMap(cat => Object.keys(allVcSub[cat]||{}).map(sc => cat+'::'+sc))])
                  const subCatRows = Array.from(subCatSet).map(key => {
                    const [cat, sc] = key.split('::'); const scD = showSC ? (allScSub[cat]?.[sc] || {}) : {}; const vc = showVC ? (allVcSub[cat]?.[sc] || {}) : {}
                    const rev = (scD.FBA?.rev||0)+(scD.MFN?.rev||0)+(vc.rev||0); const units = (scD.FBA?.units||0)+(scD.MFN?.units||0)+(vc.units||0); const orders = (scD.FBA?.orders||0)+(scD.MFN?.orders||0)+(vc.orders||0)
                    return { name: sc, category: cat, rev, units, orders }
                  }).filter(r => r.rev > 0).sort((a,b) => b.rev - a.rev)
                  const allScSku = amzSC.skuChannel || {}; const allVcSku = amzVCMatrix.skuData || {}
                  const skuMap = {}
                  new Set([...Object.keys(allScSku), ...Object.keys(allVcSku)]).forEach(cat => {
                    skuMap[cat] = {}
                    new Set([...Object.keys(allScSku[cat]||{}), ...Object.keys(allVcSku[cat]||{})]).forEach(sc => {
                      skuMap[cat][sc] = {}
                      new Set([...Object.keys(allScSku[cat]?.[sc]||{}), ...Object.keys(allVcSku[cat]?.[sc]||{})]).forEach(sku => {
                        const scD = showSC ? (allScSku[cat]?.[sc]?.[sku] || {}) : {}; const vc = showVC ? (allVcSku[cat]?.[sc]?.[sku] || {}) : {}
                        skuMap[cat][sc][sku] = { rev: (scD.FBA?.rev||0)+(scD.MFN?.rev||0)+(vc.rev||0) }
                      })
                    })
                  })
                  return <CategoryRevenueCard
                    catRows={catRows} subCatRows={subCatRows} skuMap={skuMap} totalRev={chScCatRev + chVcCatRev}
                    view={catRevView} setView={setCatRevView} selectedName={selectedCat}
                    onSelectCategory={v => { setSelectedCat(prev => prev === v ? null : v); setSelectedSubCat(null) }}
                    height={360}
                  />
                })()}
                {channelView !== 'vc'
                  ? <GeoToggleDonutCard regionRows={amzSC.regionRows || []} tierRows={amzSC.tierRows || []} note="Seller Central only" boxHeight={360} />
                  : <Card title="Geography Breakdown" note="Not available for Vendor Central"><div style={{ fontSize: 12, color: C.t3, padding: '30px 0', textAlign: 'center' }}>VC data has no state/city/region granularity</div></Card>}
              </div>
            )
          })()}
          {(() => {
            const pickAmz = (scChData, vc) => { const r = {}; ['rev','excRev','units','cancelRev','rtoRev','cirRev','exchRev','returnRev'].forEach(k => { r[k] = (showSC ? (scChData?.FBA?.[k]||0)+(scChData?.MFN?.[k]||0) : 0)+(showVC ? (vc?.[k]||0) : 0) }); return r }
            const allCats = new Set([...Object.keys(amzSC.catChannel || {}), ...Object.keys(amzVCMatrix.catData || {})])
            const catData = {}
            allCats.forEach(cat => {
              catData[cat] = pickAmz(amzSC.catChannel?.[cat], amzVCMatrix.catData?.[cat])
            })
            const allScSub = amzSC.subCatChannel || {}
            const allVcSub = amzVCMatrix.subCatData || {}
            const subCatData = {}
            const allCatsForSub = new Set([...Object.keys(allScSub), ...Object.keys(allVcSub)])
            allCatsForSub.forEach(cat => {
              subCatData[cat] = {}
              const allSubs = new Set([...Object.keys(allScSub[cat]||{}), ...Object.keys(allVcSub[cat]||{})])
              allSubs.forEach(sc => {
                subCatData[cat][sc] = pickAmz(allScSub[cat]?.[sc], allVcSub[cat]?.[sc])
              })
            })
            const allScSku = amzSC.skuChannel || {}
            const allVcSku = amzVCMatrix.skuData || {}
            const skuData = {}
            const allCatsForSku = new Set([...Object.keys(allScSku), ...Object.keys(allVcSku)])
            allCatsForSku.forEach(cat => {
              skuData[cat] = {}
              const allSubs = new Set([...Object.keys(allScSku[cat]||{}), ...Object.keys(allVcSku[cat]||{})])
              allSubs.forEach(sc => {
                skuData[cat][sc] = {}
                const allSkus = new Set([...Object.keys(allScSku[cat]?.[sc]||{}), ...Object.keys(allVcSku[cat]?.[sc]||{})])
                allSkus.forEach(sku => {
                  skuData[cat][sc][sku] = pickAmz(allScSku[cat]?.[sc]?.[sku], allVcSku[cat]?.[sc]?.[sku])
                })
              })
            })
            // MoM prev maps: SC prev + VC prev combined (filtered by channelView)
            const scCatPrev = showSC ? (amzSC.catPrevMap || {}) : {}; const vcCatPrev = showVC ? (amzVCMatrix.catPrevMap || {}) : {}
            const allPrevCats = new Set([...Object.keys(scCatPrev), ...Object.keys(vcCatPrev)])
            const catPrevMap = {}; allPrevCats.forEach(c => { catPrevMap[c] = (scCatPrev[c]||0) + (vcCatPrev[c]||0) })
            const scSubPrev = showSC ? (amzSC.subCatPrevMap || {}) : {}; const vcSubPrev = showVC ? (amzVCMatrix.subCatPrevMap || {}) : {}
            const subCatPrevMap = {}
            new Set([...Object.keys(scSubPrev), ...Object.keys(vcSubPrev)]).forEach(k => { subCatPrevMap[k] = (scSubPrev[k]||0) + (vcSubPrev[k]||0) })
            const scSkuPrev = amzSC.skuPrevMap || {}; const vcSkuPrev = amzVCMatrix.skuPrevMap || {}
            const skuPrevMap = {}
            const skuCats = new Set([...Object.keys(scSkuPrev), ...Object.keys(vcSkuPrev)])
            skuCats.forEach(cat => { skuPrevMap[cat] = {}; const allScs = new Set([...Object.keys(scSkuPrev[cat]||{}), ...Object.keys(vcSkuPrev[cat]||{})]); allScs.forEach(sc => { skuPrevMap[cat][sc] = {}; const allSkus = new Set([...Object.keys(scSkuPrev[cat]?.[sc]||{}), ...Object.keys(vcSkuPrev[cat]?.[sc]||{})]); allSkus.forEach(sku => { skuPrevMap[cat][sc][sku] = (scSkuPrev[cat]?.[sc]?.[sku]||0) + (vcSkuPrev[cat]?.[sc]?.[sku]||0) }) }) })
            return <FlatCategoryProductMatrix catData={catData} subCatData={subCatData} skuData={skuData} title={`Category Revenue Matrix · Amazon India${channelView !== 'all' ? ` · ${channelView === 'sc' ? 'Seller Central' : 'Vendor Central'}` : ''}`} catPrevMap={catPrevMap} subCatPrevMap={subCatPrevMap} simpleReturns showReturnPct />
          })()}
          {(() => {
            const statePrevMap = amzSC.statePrevMap || {}
            const totalStateRev = amzSC.stateTotal || (amzSC.states||[]).reduce((s,x) => s+x.rev, 0)
            let cum = 0
            const enrichedStates = (amzSC.states||[]).map(s => {
              const prev = statePrevMap[s.state] || 0
              const sharePct = totalStateRev > 0 ? s.rev / totalStateRev * 100 : 0
              cum += sharePct
              return { ...s, aov: s.orders ? s.rev / s.orders : 0, rtoPct: s.rev > 0 ? (s.returnRev||0) / s.rev * 100 : 0, mom: prev > 0 ? (s.rev - prev) / prev * 100 : null, sharePct, cumPct: cum }
            })
            const cityPrevMap = amzSC.cityPrevMap || {}
            const totalCityRev = amzSC.cityTotal || (amzSC.cities||[]).reduce((s,x) => s+x.rev, 0)
            let cumC = 0
            const enrichedCities = (amzSC.cities||[]).map(c => {
              const prev = cityPrevMap[c.city] || 0
              const sharePct = totalCityRev > 0 ? c.rev / totalCityRev * 100 : 0
              cumC += sharePct
              return { ...c, aov: c.orders ? c.rev / c.orders : 0, rtoPct: c.rev > 0 ? (c.returnRev||0) / c.rev * 100 : 0, mom: prev > 0 ? (c.rev - prev) / prev * 100 : null, sharePct, cumPct: cumC }
            })
            if (channelView === 'vc') return (
              <div className="g-2" style={{ alignItems: 'stretch' }}>
                <Card title="Top States" note="Not available for Vendor Central"><div style={{ fontSize: 12, color: C.t3, padding: '30px 0', textAlign: 'center' }}>VC data has no state-level granularity</div></Card>
                <Card title="Top Cities" note="Not available for Vendor Central"><div style={{ fontSize: 12, color: C.t3, padding: '30px 0', textAlign: 'center' }}>VC data has no city-level granularity</div></Card>
              </div>
            )
            return (
              <div className="g-2" style={{ alignItems: 'stretch' }}>
                <ShopifyGeoRichTable title="Top States" rows={enrichedStates} firstKey="state" firstLabel="State" formatFirst={v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v} rtoLabel="Return %" note="Seller Central only" />
                <ShopifyGeoRichTable title="Top Cities" rows={enrichedCities} firstKey="city" firstLabel="City" formatFirst={v => v ? v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : v} rtoLabel="Return %" note="Seller Central only" />
              </div>
            )
          })()}
        </div>
      )}

    </div>
  )
}

function FlipkartTab({ data }) {
  const [fkTrendGroup, setFkTrendGroup] = useState('daily')
  const [fkTrendMetric, setFkTrendMetric] = useState('rev')
  const [selectedCat, setSelectedCat] = useState(null)
  const [selectedSubCat, setSelectedSubCat] = useState(null)
  const [catRevView, setCatRevView] = useState('category')

  const fk = data.flipkart || {}
  const nDays = data.nDays || 1

  // When cat/subcat selected, derive totals+daily from dailyCat (FBF+Non-FBF combined — no split)
  const dailyCat = fk.dailyCat || []
  const filtDailyCat = selectedSubCat
    ? dailyCat.filter(x => x.category === selectedCat && x.subcategory === selectedSubCat)
    : selectedCat
    ? dailyCat.filter(x => x.category === selectedCat)
    : null

  const totals = filtDailyCat
    ? (() => { const agg = { rev: 0, excRev: 0, orders: 0, units: 0 }; filtDailyCat.forEach(x => { agg.rev += x.rev; agg.excRev += x.excRev; agg.orders += x.orders; agg.units += x.units }); return [agg] })()
    : (fk.totals || [])
  const rev = totals.reduce((s, x) => s + x.rev, 0)
  const nOrders = totals.reduce((s, x) => s + x.orders, 0)
  const qty = totals.reduce((s, x) => s + x.units, 0)
  const excRev = totals.reduce((s, x) => s + x.excRev, 0)
  const cancelRev = totals.reduce((s, x) => s + (x.cancelRev || 0), 0)
  const cancelOrders = totals.reduce((s, x) => s + (x.cancelOrders || 0), 0)
  const fkTotalReturnRev = totals.reduce((s, x) => s + (x.totalReturnRev || 0), 0)
  const gstRatioFk = rev > 0 ? (rev - excRev) / rev : 0
  const fkNetRev = Math.max(rev - cancelRev - fkTotalReturnRev, 0) * (1 - gstRatioFk)
  const aov = nOrders ? rev / nOrders : 0
  const asp = qty ? rev / qty : 0

  const fkPrevRev = fk.prevRev || data.prevRev || 0
  const fkPrevExcRev = fk.prevExcRev || data.prevExcRev || 0
  const fkPrevOrders = fk.prevOrders || 0
  const fkPrevUnits = fk.prevUnits || 0
  const fkPrevCancelOrders = fk.prevCancelOrders || 0
  const fkPrevReturnRev = fk.prevReturnRev || 0
  const fkPrevDeliveredRev = fk.prevDeliveredRev || 0
  const fkPrevCancelPct = fkPrevOrders > 0 ? fkPrevCancelOrders / fkPrevOrders * 100 : 0
  const fkPrevReturnPct = fkPrevDeliveredRev > 0 ? fkPrevReturnRev / fkPrevDeliveredRev * 100 : 0
  const fkPrevGST = fkPrevRev - fkPrevExcRev
  const fkPrevDailyArr = fk.prevDaily || data.prevDailyArr || []
  const fkRevChg = fkPrevRev > 0 ? ((rev - fkPrevRev) / fkPrevRev * 100) : null
  const fkChgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }

  // Return rate — combined FBF+Non-FBF
  const fkReturnCur = fk.returnRate?.all || { pct: 0, deliveredRev: 0, returnRev: 0 }

  // Delivered %
  const fkDeliveredPct = (() => {
    const statusRows = fk.status || []
    const deliveredOrders = statusRows.filter(x => x.status === 'Delivered').reduce((s, x) => s + x.orders, 0)
    const nonCancelledOrders = statusRows.filter(x => x.status !== 'Cancelled').reduce((s, x) => s + x.orders, 0)
    return { deliveredOrders, nonCancelledOrders, pct: nonCancelledOrders > 0 ? deliveredOrders / nonCancelledOrders * 100 : 0 }
  })()

  // Daily chart — FBF + Non-FBF combined into single daily series
  const fkEstimatedDays = fk.estimatedDays || 0
  const fkLatestReal = fk.latestRealDate || null
  const dailyMap = {}
  ;(fk.daily || []).forEach(x => {
    if (!dailyMap[x.date]) dailyMap[x.date] = { date: x.date, rev: 0, orders: 0, units: 0, returns: 0, returnRev: 0, estimated: x.estimated || false }
    dailyMap[x.date].rev += x.rev; dailyMap[x.date].orders += x.orders; dailyMap[x.date].units += x.units || 0
    dailyMap[x.date].returns += x.returns || 0; dailyMap[x.date].returnRev += x.returnRev || 0
    if (x.estimated) dailyMap[x.date].estimated = true
  })
  const dailyArr = Object.values(dailyMap).sort((a, b) => a.date?.localeCompare(b.date))
  const subDailyArr = (filtDailyCat
    ? filtDailyCat.map(x => ({ date: x.date, rev: x.rev, orders: x.orders, returns: 0, returnRev: 0 }))
        .reduce((acc, x) => { const e = acc.find(a => a.date === x.date); if (e) { e.rev += x.rev; e.orders += x.orders } else acc.push({ ...x }); return acc }, [])
    : dailyArr
  ).sort((a, b) => a.date?.localeCompare(b.date))
  const fkSparkData = Array.from({ length: Math.max(subDailyArr.length, fkPrevDailyArr.length) }, (_, i) => {
    const cur = subDailyArr[i]
    const pre = fkPrevDailyArr[i]
    return { i, cur: cur?.rev ?? null, prev: pre?.rev ?? null }
  })

  // Returns total (combined)
  const totalReturns = (fk.categories || []).reduce((s, x) => s + (x.returns || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPI layout: hero + 2 rows of 4 */}
      <div className="sales-kpi-section" style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        <div className="kpi-card sales-kpi-hero" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue Inc GST{selectedCat ? ` · ${selectedSubCat || selectedCat}` : ''}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(rev)}</div>
            {fkRevChg !== null && !selectedCat && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: fkRevChg >= 0 ? C.green.bg : C.red.bg, color: fkRevChg >= 0 ? C.green.tx : C.red.tx }}>{fkRevChg >= 0 ? '▲' : '▼'} {Math.abs(fkRevChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{fmtN(nOrders)} orders · {fmtN(qty)} units</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fkSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="fkGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FFD600" stopOpacity={0.25} /><stop offset="95%" stopColor="#FFD600" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke="#FFD600" strokeWidth={2} fill="url(#fkGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} /><span style={{ color: C.t2 }}>{p.name}: {fmt(p.value)}</span></div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="sales-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 10, alignItems: 'stretch' }}>
          {[
            { label: 'Net Revenue', value: fmt(fkNetRev), sub: 'Ex. return & cancellation', badge: selectedCat ? null : fkChgBadge(fkNetRev, fkPrevExcRev) },
            { label: 'Daily Avg Rev', value: fmt(rev / nDays), sub: `over ${nDays} days`, badge: selectedCat ? null : fkChgBadge(rev / nDays, fkPrevRev > 0 ? fkPrevRev / nDays : 0) },
            { label: 'AOV', value: `₹${Math.round(aov).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ orders', badge: selectedCat ? null : fkChgBadge(aov, fkPrevOrders > 0 ? fkPrevRev / fkPrevOrders : 0) },
            { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ units', badge: selectedCat ? null : fkChgBadge(asp, fkPrevUnits > 0 ? fkPrevRev / fkPrevUnits : 0) },
            { label: 'Delivered %', value: `${fkDeliveredPct.pct.toFixed(1)}%`, sub: `${fmtN(fkDeliveredPct.deliveredOrders)} del · ${fmtN(fkDeliveredPct.nonCancelledOrders)} non-cancel`, accent: fkDeliveredPct.pct < 50 ? '#7A1A1A' : undefined },
            { label: 'GST', value: fmt(rev - excRev), sub: 'Inc GST − Exc GST', badge: selectedCat ? null : fkChgBadge(rev - excRev, fkPrevGST) },
            { label: 'Cancellation %', value: `${nOrders > 0 ? (cancelOrders / nOrders * 100).toFixed(1) : 0}%`, sub: `${fmtN(cancelOrders)} cancelled · ${fmt(cancelRev)} rev`, accent: nOrders > 0 && cancelOrders / nOrders > 0.1 ? '#7A1A1A' : undefined, badge: fkPrevCancelPct > 0 ? (() => { const cur = nOrders > 0 ? cancelOrders / nOrders * 100 : 0; const p = (cur - fkPrevCancelPct) / fkPrevCancelPct * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p > 0 ? C.red.bg : C.green.bg, color: p > 0 ? C.red.tx : C.green.tx, flexShrink: 0 }}>{p > 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> })() : null },
            { label: 'Returns %', value: `${fkReturnCur.pct.toFixed(1)}%`, sub: `${fmt(fkReturnCur.returnRev)} ret · ${fmt(fkReturnCur.deliveredRev)} gross`, accent: fkReturnCur.pct > 20 ? '#7A1A1A' : undefined, badge: fkPrevReturnPct > 0 ? (() => { const p = (fkReturnCur.pct - fkPrevReturnPct) / fkPrevReturnPct * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p > 0 ? C.red.bg : C.green.bg, color: p > 0 ? C.red.tx : C.green.tx, flexShrink: 0 }}>{p > 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> })() : null },
          ].map(k => (
            <div key={k.label} className="kpi-card" style={{ padding: '10px 13px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="kpi-label">{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <div className="kpi-value" style={{ fontSize: 17, ...(k.accent ? { color: k.accent } : {}) }}>{k.value}</div>
                {k.badge}
              </div>
              {k.sub && <div className="kpi-sub">{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Revenue & Returns Trend + Category Revenue + Geography Breakdown side by side */}
      {(() => {
        const gstRatio = rev > 0 ? (rev - excRev) / rev : 0
        const rawDaily = subDailyArr.map(d => {
          const gr = d.rev
          const retRev = d.returnRev || 0
          return { date: d.date, grossRev: gr, netRev: Math.max(gr - retRev, 0) * (1 - gstRatio), orders: d.orders, units: d.units || 0, returns: d.returns || 0, returnRev: retRev, returnPct: gr > 0 ? retRev / gr * 100 : 0, estimated: d.estimated }
        })
        const grouped = (() => {
          if (fkTrendGroup === 'daily') return rawDaily
          const buckets = {}
          rawDaily.forEach(d => {
            const dt = new Date(d.date)
            let key
            if (fkTrendGroup === 'weekly') { const day = dt.getDay(), diff = dt.getDate() - day + (day === 0 ? -6 : 1); key = new Date(new Date(d.date).setDate(diff)).toISOString().slice(0, 10) }
            else if (fkTrendGroup === 'monthly') { key = d.date.slice(0, 7) }
            else { key = `${d.date.slice(0, 4)}-Q${Math.ceil(parseInt(d.date.slice(5, 7)) / 3)}` }
            if (!buckets[key]) buckets[key] = { date: key, grossRev: 0, netRev: 0, orders: 0, units: 0, returns: 0, returnRev: 0 }
            buckets[key].grossRev += d.grossRev; buckets[key].netRev += d.netRev
            buckets[key].orders += d.orders; buckets[key].units += d.units; buckets[key].returns += d.returns || 0; buckets[key].returnRev += d.returnRev || 0
          })
          return Object.values(buckets).map(b => ({ ...b, returnPct: b.grossRev > 0 ? b.returnRev / b.grossRev * 100 : 0 })).sort((a, b) => a.date.localeCompare(b.date))
        })()
        const isRev = fkTrendMetric === 'rev'
        const xFmt = d => fkTrendGroup === 'daily' ? d?.slice(5) : fkTrendGroup === 'monthly' ? d?.slice(0, 7) : d
        const yFmt = v => isRev ? (v >= 1e5 ? `${(v/1e5).toFixed(1)}L` : fmt(v)) : fmtN(v)
        const btnSt = k => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${fkTrendMetric===k?C.t1:C.border}`, background: fkTrendMetric===k?C.t1:'transparent', color: fkTrendMetric===k?'#fff':C.t2, cursor: 'pointer', fontFamily: 'var(--font)' })
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.65fr', gap: 14, alignItems: 'start' }}>
            <Card fill title="Revenue & Returns Trend" style={{ height: 360, alignSelf: 'start' }} action={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['rev','Revenue'],['orders','Orders'],['units','Units']].map(([k,l]) => <button key={k} style={btnSt(k)} onClick={() => setFkTrendMetric(k)}>{l}</button>)}
                </div>
                <select value={fkTrendGroup} onChange={e => setFkTrendGroup(e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
                  {['daily','weekly','monthly','quarterly'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
                </select>
              </div>
            }>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                {fkEstimatedDays > 0 && fkTrendGroup === 'daily' && (
                  <div style={{ fontSize: 11, color: '#92600A', background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 6, padding: '5px 10px' }}>
                    ⏳ Data available till {fkLatestReal} · Last {fkEstimatedDays} day{fkEstimatedDays > 1 ? 's' : ''} shown as 7-day rolling avg estimate
                  </div>
                )}
                {totalReturns > 0 && !selectedCat && (
                  <div style={{ fontSize: 11, color: C.t2, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    Returns: <strong style={{ color: '#E24B4A' }}>{fmtN(totalReturns)}</strong>
                    {nOrders > 0 && <span style={{ color: C.t3, fontSize: 10 }}>{(totalReturns / nOrders * 100).toFixed(1)}%</span>}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                <ComposedChart data={grouped} margin={{ top: 4, right: 50, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={xFmt} />
                  <YAxis yAxisId="main" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={yFmt} width={60} />
                  <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => `${v.toFixed(1)}%`} width={40} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    return (
                      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4, color: C.t2 }}>{xFmt(label)}</div>
                        {payload.filter(p => p.name !== 'Return %').map(p => (
                          <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ color: C.t2 }}>{p.name}: {isRev ? fmt(p.value) : fmtN(p.value)}</span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#E24B4A', display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ color: C.t2 }}>Return %: <strong>{(d?.returnPct || 0).toFixed(1)}%</strong> ({fmt(d?.returnRev || 0)})</span>
                        </div>
                      </div>
                    )
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {isRev ? (<>
                    <Area yAxisId="main" type="monotone" dataKey="grossRev" name="Gross Revenue" stroke="#E8930A" fill="#E8930A22" strokeWidth={2} dot={grouped.length <= 3} />
                    <Area yAxisId="main" type="monotone" dataKey="netRev" name="Net Revenue" stroke="#0D9E68" fill="#0D9E6811" strokeWidth={2} dot={grouped.length <= 3} strokeDasharray="4 2" />
                  </>) : fkTrendMetric === 'orders' ? (
                    <Area yAxisId="main" type="monotone" dataKey="orders" name="Orders" stroke="#E8930A" fill="#E8930A22" strokeWidth={2} dot={grouped.length <= 3} />
                  ) : (
                    <Area yAxisId="main" type="monotone" dataKey="units" name="Units" stroke="#E8930A" fill="#E8930A22" strokeWidth={2} dot={grouped.length <= 3} />
                  )}
                  <Line yAxisId="pct" type="monotone" dataKey="returnPct" name="Return %" stroke="#E24B4A" strokeWidth={1.5} dot={grouped.length <= 3} />
                  {fkReturnCur.pct > 0 && <ReferenceLine yAxisId="pct" y={fkReturnCur.pct} stroke="#E24B4A" strokeWidth={1} strokeDasharray="5 3" label={{ value: `Avg ${fkReturnCur.pct.toFixed(1)}%`, position: 'insideTopRight', fontSize: 10, fill: '#E24B4A' }} />}
                </ComposedChart>
              </ResponsiveContainer>
              </div>
            </Card>
            {(() => {
              const catRows = Object.entries((() => { const m = {}; (fk.categories || []).forEach(x => { if (!m[x.category]) m[x.category] = { rev: 0, units: 0, orders: 0 }; m[x.category].rev += x.rev; m[x.category].units += x.units; m[x.category].orders += x.orders }); return m })()||{}).map(([cat, v]) => ({ name: cat, rev: v.rev, units: v.units, orders: v.orders })).sort((a,b) => b.rev-a.rev)
              const subCatRows = (() => { const m = {}; (fk.subCategories || []).forEach(x => { const k = x.category+'::'+x.subcategory; if (!m[k]) m[k] = { name: x.subcategory, category: x.category, rev: 0, units: 0, orders: 0 }; m[k].rev += x.rev; m[k].units += x.units; m[k].orders += x.orders }); return Object.values(m).sort((a,b) => b.rev-a.rev) })()
              const skuMap = {}
              Object.entries(fk.skuMatrix || {}).forEach(([cat, scMap]) => {
                skuMap[cat] = {}
                Object.entries(scMap).forEach(([sc, skMap]) => {
                  skuMap[cat][sc] = {}
                  Object.entries(skMap).forEach(([sku, v]) => { skuMap[cat][sc][sku] = { rev: v.rev || 0 } })
                })
              })
              return <CategoryRevenueCard
                catRows={catRows} subCatRows={subCatRows} skuMap={skuMap} totalRev={rev}
                view={catRevView} setView={setCatRevView} selectedName={selectedCat}
                onSelectCategory={v => { setSelectedCat(prev => prev === v ? null : v); setSelectedSubCat(null) }}
                height={360}
              />
            })()}
            {(() => {
              const regionAgg = {}
              ;(fk.regions || []).forEach(x => { if (!regionAgg[x.region]) regionAgg[x.region] = { region: x.region, rev: 0, orders: 0 }; regionAgg[x.region].rev += x.rev; regionAgg[x.region].orders += x.orders })
              const regionRows = Object.values(regionAgg).sort((a, b) => b.rev - a.rev)
              return <GeoToggleDonutCard regionRows={regionRows} tierRows={[]} boxHeight={360} />
            })()}
          </div>
        )
      })()}

      {/* Category Revenue Matrix */}
      {(() => {
        const catAggMatrix = {}
        ;(fk.categories || []).forEach(x => {
          if (!catAggMatrix[x.category]) catAggMatrix[x.category] = { rev: 0, excRev: 0, units: 0, orders: 0, returnRev: 0, rtoRev: 0, cirRev: 0, exchRev: 0, cancelRev: 0 }
          catAggMatrix[x.category].rev += x.rev; catAggMatrix[x.category].excRev += x.excRev || 0; catAggMatrix[x.category].units += x.units
          catAggMatrix[x.category].orders += x.orders || 0; catAggMatrix[x.category].returnRev += x.returnRev || 0
        })
        const subCatData = {}
        ;(fk.subCategories || []).forEach(x => {
          if (!subCatData[x.category]) subCatData[x.category] = {}
          if (!subCatData[x.category][x.subcategory]) subCatData[x.category][x.subcategory] = { rev: 0, excRev: 0, units: 0, orders: 0, returnRev: 0, rtoRev: 0, cirRev: 0, exchRev: 0, cancelRev: 0 }
          subCatData[x.category][x.subcategory].rev += x.rev; subCatData[x.category][x.subcategory].excRev += x.excRev || 0; subCatData[x.category][x.subcategory].units += x.units
          subCatData[x.category][x.subcategory].orders += x.orders || 0; subCatData[x.category][x.subcategory].returnRev += x.returnRev || 0
        })
        const skuData = {}
        Object.entries(fk.skuMatrix || {}).forEach(([cat, scMap]) => {
          skuData[cat] = {}
          Object.entries(scMap).forEach(([sc, skuMap]) => {
            skuData[cat][sc] = {}
            Object.entries(skuMap).forEach(([sku, v]) => {
              skuData[cat][sc][sku] = { rev: v.rev, excRev: v.excRev, units: v.units }
            })
          })
        })
        const catPrevMap = {}
        ;(fk.catPrevMap ? Object.entries(fk.catPrevMap) : []).forEach(([k, v]) => {
          const [cat] = k.split('::')
          catPrevMap[cat] = (catPrevMap[cat] || 0) + v
        })
        const subCatPrevMap = {}
        ;(fk.subCatPrevMap ? Object.entries(fk.subCatPrevMap) : []).forEach(([k, v]) => {
          const parts = k.split('::')
          const key = `${parts[0]}::${parts[1]}`; subCatPrevMap[key] = (subCatPrevMap[key] || 0) + v
        })
        return <FlatCategoryProductMatrix catData={catAggMatrix} subCatData={subCatData} skuData={skuData} title="Category Revenue Matrix · Flipkart" catPrevMap={catPrevMap} subCatPrevMap={subCatPrevMap} simpleReturns showReturnPct />
      })()}

      {/* Top States + Cities rich tables */}
      {(() => {
        const statePrevMap = fk.statePrevMap || {}
        const cityPrevMap = fk.cityPrevMap || {}
        const stateTotalMap = fk.stateTotalMap || {}
        const cityTotalMap = fk.cityTotalMap || {}
        const stateMap = {}
        ;(fk.states||[]).forEach(x => {
          if (!stateMap[x.state]) stateMap[x.state] = { state: x.state, rev: 0, orders: 0, returnRev: 0, deliveredRev: 0 }
          stateMap[x.state].rev += x.rev; stateMap[x.state].orders += x.orders
          stateMap[x.state].returnRev += (x.returnRev||0); stateMap[x.state].deliveredRev += (x.deliveredRev||0)
        })
        const fkStateTotalBQ = (stateTotalMap['FBF']||0) + (stateTotalMap['NON-FBF']||0)
        const totalStateRev = fkStateTotalBQ || Object.values(stateMap).reduce((s, v) => s + v.rev, 0)
        let cum = 0
        const enrichedStates = Object.values(stateMap).sort((a,b) => b.rev-a.rev).map(s => {
          const prev = (statePrevMap[`${s.state}::FBF`]||0) + (statePrevMap[`${s.state}::NON-FBF`]||0)
          const sharePct = totalStateRev > 0 ? s.rev / totalStateRev * 100 : 0
          cum += sharePct
          const rtoPct = s.rev > 0 ? s.returnRev / s.rev * 100 : 0
          return { ...s, aov: s.orders ? s.rev / s.orders : 0, rtoPct, mom: prev > 0 ? (s.rev - prev) / prev * 100 : null, sharePct, cumPct: cum }
        })
        const cityMap = {}
        ;(fk.cities||[]).forEach(x => {
          if (!cityMap[x.city]) cityMap[x.city] = { city: x.city, rev: 0, orders: 0, returnRev: 0, deliveredRev: 0 }
          cityMap[x.city].rev += x.rev; cityMap[x.city].orders += x.orders
          cityMap[x.city].returnRev += (x.returnRev||0); cityMap[x.city].deliveredRev += (x.deliveredRev||0)
        })
        const fkCityTotalBQ = (cityTotalMap['FBF']||0) + (cityTotalMap['NON-FBF']||0)
        const totalCityRev = fkCityTotalBQ || Object.values(cityMap).reduce((s, v) => s + v.rev, 0)
        let cumC = 0
        const enrichedCities = Object.values(cityMap).sort((a,b) => b.rev-a.rev).map(c => {
          const prev = (cityPrevMap[`${c.city}::FBF`]||0) + (cityPrevMap[`${c.city}::NON-FBF`]||0)
          const sharePct = totalCityRev > 0 ? c.rev / totalCityRev * 100 : 0
          cumC += sharePct
          const rtoPct = c.rev > 0 ? c.returnRev / c.rev * 100 : 0
          return { ...c, aov: c.orders ? c.rev / c.orders : 0, rtoPct, mom: prev > 0 ? (c.rev - prev) / prev * 100 : null, sharePct, cumPct: cumC }
        })
        return (
          <div className="g-2" style={{ alignItems: 'stretch' }}>
            <ShopifyGeoRichTable title="Top States" rows={enrichedStates} firstKey="state" firstLabel="State" formatFirst={v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v} rtoLabel="Return %" />
            <ShopifyGeoRichTable title="Top Cities" rows={enrichedCities} firstKey="city" firstLabel="City" formatFirst={v => v ? v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : v} rtoLabel="Return %" />
          </div>
        )
      })()}
    </div>
  )
}

const PLATFORM_COLORS = { Meta: '#1877F2', Google: '#EA4335', Amazon: '#FF9900', Blinkit: '#FFD600', Zepto: '#8B5CF6', Instamart: '#FF6B35', Flipkart: '#2E74CC', Myntra: '#FF3F6C' }
const ADS_CHART_ROW_H = 340
const ADS_SPEND_TABLE_H = 460
const ADS_PLATFORMS = [
  { id: 'All', label: 'Overall' },
  { id: 'D2C', label: 'D2C' },
  { id: 'Amazon', label: 'Amazon', logo: '/logo-amazon.png' },
  { id: 'Blinkit', label: 'Blinkit', logo: '/logo-blinkit.png' },
  { id: 'Zepto', label: 'Zepto', logo: '/logo-zepto.png' },
  { id: 'Instamart', label: 'Instamart', logo: '/logo-instamart.png' },
  { id: 'Flipkart', label: 'Flipkart', logo: '/logo-flipkart.png' },
  { id: 'Myntra', label: 'Myntra', logo: '/logo-myntra.png' },
  { id: 'CRED', label: 'CRED' },
]

// Generic click-to-sort table header hook — sortKey/dir state plus a Th renderer and a
// sortRows helper, so any table (Ads or future ones) can get sorting by wiring in a
// {key, get} spec per column instead of a bespoke sort implementation each time.
// Compact checkbox-dropdown slicer — local to Ads tab, matches the Clear/Apply pattern used
// by the Sales tab's own dropdown filters (subChannel/paymentType) elsewhere in this file.
function AdsSlicerDropdown({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(selected)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  const qLower = q.trim().toLowerCase()
  const filteredOptions = qLower ? options.filter(o => o.toLowerCase().includes(qLower)) : options
  const allFilteredSelected = filteredOptions.length > 0 && filteredOptions.every(o => pending.includes(o))
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => { setPending(selected); setQ(''); setOpen(o => !o) }}
        style={{ fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: 7, border: `1.5px solid ${selected.length ? C.acc : C.border}`, background: C.card, color: selected.length ? C.t1 : C.t2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
        {label}{selected.length > 0 ? ` (${selected.length})` : ''}
        <span style={{ fontSize: 9 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 200, background: C.card, border: `1px solid ${C.border2}`, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)', width: 230, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 10px 6px' }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} autoFocus
              style={{ width: '100%', fontSize: 12, padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.t1, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {options.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px 7px', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.t1, borderBottom: `1px solid ${C.border}` }}>
              <input type="checkbox" checked={allFilteredSelected} onChange={e => {
                setPending(prev => e.target.checked
                  ? [...new Set([...prev, ...filteredOptions])]
                  : prev.filter(v => !filteredOptions.includes(v)))
              }} style={{ accentColor: C.acm }} />
              <span>Select all</span>
            </label>
          )}
          <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 0' }}>
            {filteredOptions.length === 0 && <div style={{ padding: '8px 14px', fontSize: 11.5, color: C.t3 }}>No options</div>}
            {filteredOptions.map(o => (
              <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', cursor: 'pointer', fontSize: 12, color: C.t1 }}>
                <input type="checkbox" checked={pending.includes(o)} onChange={e => setPending(prev => e.target.checked ? [...prev, o] : prev.filter(v => v !== o))} style={{ accentColor: C.acm }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o}</span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderTop: `1px solid ${C.border}` }}>
            <button style={{ flex: 1, fontSize: 11, padding: '5px 0', borderRadius: 5, border: `1px solid ${C.border2}`, background: C.card, color: C.t2, cursor: 'pointer' }} onClick={() => { onChange([]); setPending([]); setOpen(false) }}>Clear</button>
            <button style={{ flex: 1, fontSize: 11, padding: '5px 0', borderRadius: 5, border: 'none', background: C.acm, color: '#1a1a1a', cursor: 'pointer', fontWeight: 700 }} onClick={() => { onChange(pending); setOpen(false) }}>Apply</button>
          </div>
        </div>
      )}
    </div>
  )
}

function AdsTab({ data, filters = {} }) {
  const ads = data.ads || {}
  const totals = ads.totals || []
  const daily = ads.daily || []
  const byAdType = ads.byAdType || []
  const campaigns = ads.campaigns || []
  const byCategory = ads.byCategory || []
  const bySku = ads.bySku || []
  const categoryBreakdown = ads.categoryBreakdown || { categoryRows: [], productRows: [] }
  const allSpendDetail = ads.allSpendDetail || { categoryRows: [], subCategoryRows: [] }
  const spendDetailByPlatform = ads.spendDetailByPlatform || {}
  const channelSalesOrders = ads.channelSalesOrders || {}
  const prevTotals = ads.prevTotals || {}
  const flipkartEstRev = ads.flipkartEstRev || 0
  const additionalSpend = ads.additionalSpend ?? null
  const additionalSpendByProduct = ads.additionalSpendByProduct || {}

  const [selPlatform, setSelPlatform] = useState(null)
  const [catView, setCatView] = useState('category')
  const [trendGran, setTrendGran] = useState('daily')
  const [selCat, setSelCat] = useState([])
  const [selSubCat, setSelSubCat] = useState([])
  // Category/sub-category options differ per platform tab — clear stale selections on switch
  // rather than silently filtering to an empty/wrong result set.
  useEffect(() => { setSelCat([]); setSelSubCat([]) }, [selPlatform])
  const platformTable = useSortableTable('spend')
  const catTable = useSortableTable('spend')
  const prodTable = useSortableTable('spend')
  // Called unconditionally at the top level (Rules of Hooks) — the Platform Overview table
  // renders conditionally (!selPlatform) further down, so its column definitions (which close
  // over render-local totals) are built there and just looked up by id against this order.
  const platformColumnOrder = useReorderableColumns('datatable-cols:ads-platform-overview', [{ id: 'spend' }, { id: 'rev' }, { id: 'roas' }])
  const adsCatColumnOrder = useReorderableColumns('datatable-cols:ads-by-category', [{ id: 'spend' }, { id: 'revenue' }, { id: 'roas' }])
  const adsProdColumnOrder = useReorderableColumns('datatable-cols:ads-by-product', [{ id: 'spend' }, { id: 'revenue' }, { id: 'roas' }])
  const [selAdType, setSelAdType] = useState({})
  const [allCatSearch, setAllCatSearch] = useState('')
  const [allProdSearch, setAllProdSearch] = useState('')

  const roasColor = r => r >= 2 ? C.green.tx : r >= 1 ? '#D97706' : r > 0 ? C.red.tx : C.t3
  const roasBg = r => r >= 2 ? C.green.bg : r >= 1 ? '#FEF3C7' : r > 0 ? C.red.bg : C.bg

  const chgBadge = (cur, prev) => {
    if (!prev || isNaN(prev) || isNaN(cur)) return null
    const p = (cur - prev) / prev * 100
    return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span>
  }

  const isD2C = selPlatform === 'D2C'
  const d2cPlatforms = ['Meta', 'Google']

  const _addlStart = filters.start || ''
  const _addlEnd = filters.end || ''
  const getProductAddlSpend = (subCategory) => {
    const dayMap = additionalSpendByProduct[subCategory]
    if (!dayMap || !isD2C || !_addlStart) return null
    let total = 0
    for (const [date, spend] of Object.entries(dayMap)) {
      if (date >= _addlStart && date <= _addlEnd) total += spend
    }
    return total
  }
  const hasAddlSpendData = isD2C && Object.keys(additionalSpendByProduct).length > 0
  const filtTotals = selPlatform ? totals.filter(t => isD2C ? d2cPlatforms.includes(t.platform) : t.platform === selPlatform) : totals
  const filtDaily = selPlatform ? daily.filter(d => isD2C ? d2cPlatforms.includes(d.platform) : d.platform === selPlatform) : daily
  const filtCampaigns = selPlatform ? campaigns.filter(c => isD2C ? d2cPlatforms.includes(c.platform) : c.platform === selPlatform) : campaigns
  const filtAdTypes = selPlatform ? byAdType.filter(x => isD2C ? d2cPlatforms.includes(x.platform) : x.platform === selPlatform) : byAdType
  const filtByCategory = selPlatform ? byCategory.filter(x => isD2C ? d2cPlatforms.includes(x.platform) : x.platform === selPlatform) : byCategory
  const filtBySku = selPlatform ? bySku.filter(x => isD2C ? d2cPlatforms.includes(x.platform) : x.platform === selPlatform) : bySku

  const chMap = data.chMap || {}

  // Shopify revenue split between Meta & Google proportionally by their ad spend (use filtTotals for correct period)
  const shopifyExcRev = chMap['Shopify']?.excRev || 0

  // Net revenue (exc GST) from sales data per platform
  const _filtMetaSpend = filtTotals.find(t => t.platform === 'Meta')?.spend || 0
  const _filtGoogleSpend = filtTotals.find(t => t.platform === 'Google')?.spend || 0
  const _filtD2CSpend = _filtMetaSpend + _filtGoogleSpend
  const metaShopifyRev = _filtD2CSpend > 0 ? shopifyExcRev * (_filtMetaSpend / _filtD2CSpend) : shopifyExcRev
  const googleShopifyRev = _filtD2CSpend > 0 ? shopifyExcRev * (_filtGoogleSpend / _filtD2CSpend) : 0
  const credAdditionalSpend = data.cred?.additionalSpend || 0
  const platformNetRev = {
    D2C:       shopifyExcRev,
    Meta:      metaShopifyRev,
    Google:    googleShopifyRev,
    Amazon:    chMap['Amazon']?.excRev    || 0,
    Blinkit:   chMap['Blinkit']?.excRev   || 0,
    Zepto:     chMap['Zepto']?.excRev     || 0,
    Instamart: chMap['Instamart']?.excRev || 0,
    Myntra:    chMap['Myntra']?.excRev    || 0,
    Flipkart:  chMap['Flipkart']?.excRev  || 0,
    CRED:      chMap['CRED']?.excRev      || 0,
  }
  // For "All" tab, sum unique channels (Shopify counted once)
  const allNetRev = shopifyExcRev + (chMap['Amazon']?.excRev || 0) +
    (chMap['Blinkit']?.excRev || 0) + (chMap['Zepto']?.excRev || 0) +
    (chMap['Instamart']?.excRev || 0) + (chMap['Myntra']?.excRev || 0) +
    (chMap['Flipkart']?.excRev || 0) + (chMap['CRED']?.excRev || 0)

  const totalSpend = filtTotals.reduce((s, x) => s + x.spend, 0) + (!selPlatform ? credAdditionalSpend : 0)
  const adAttributedRevenue = filtTotals.reduce((s, x) => s + x.revenue, 0)
  const totalRevenue = selPlatform ? (platformNetRev[selPlatform] || 0) : allNetRev
  const totalImpressions = filtTotals.reduce((s, x) => s + x.impressions, 0)
  const totalClicks = filtTotals.reduce((s, x) => s + x.clicks, 0)
  const totalOrders = filtTotals.reduce((s, x) => s + x.orders, 0)
  // ROAS = net channel revenue (exc GST) / spend (D2C includes additional spend in denominator)
  const _roasSpend = isD2C ? totalSpend + (additionalSpend || 0) : totalSpend
  const overallRoas = _roasSpend > 0 ? totalRevenue / _roasSpend : 0
  const overallCtr = totalImpressions > 0 ? totalClicks / totalImpressions * 100 : 0
  const overallCpc = totalClicks > 0 ? totalSpend / totalClicks : 0
  const overallCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0

  const prevSpend = isD2C ? d2cPlatforms.reduce((s, p) => s + (prevTotals[p]?.spend || 0), 0) : selPlatform ? (prevTotals[selPlatform]?.spend || 0) : Object.values(prevTotals).reduce((s, x) => s + x.spend, 0)
  const prevClicks = isD2C ? d2cPlatforms.reduce((s, p) => s + (prevTotals[p]?.clicks || 0), 0) : selPlatform ? (prevTotals[selPlatform]?.clicks || 0) : Object.values(prevTotals).reduce((s, x) => s + x.clicks, 0)
  const prevImpressions = isD2C ? d2cPlatforms.reduce((s, p) => s + (prevTotals[p]?.impressions || 0), 0) : selPlatform ? (prevTotals[selPlatform]?.impressions || 0) : Object.values(prevTotals).reduce((s, x) => s + x.impressions, 0)

  // Prev net revenue from sales data (same source as totalRevenue)
  const prevChMap = data.prevChMap || {}
  const prevShopifyExcRev = data.shopify?.prevExcRev || 0
  const prevMetaSpend = prevTotals['Meta']?.spend || 0
  const prevGoogleSpend = prevTotals['Google']?.spend || 0
  const prevShopifyAdSpendTotal = prevMetaSpend + prevGoogleSpend
  const prevMetaShopifyRev = prevShopifyAdSpendTotal > 0 ? prevShopifyExcRev * (prevMetaSpend / prevShopifyAdSpendTotal) : prevShopifyExcRev
  const prevGoogleShopifyRev = prevShopifyAdSpendTotal > 0 ? prevShopifyExcRev * (prevGoogleSpend / prevShopifyAdSpendTotal) : 0
  const prevPlatformNetRev = {
    D2C:       prevShopifyExcRev,
    Meta:      prevMetaShopifyRev,
    Google:    prevGoogleShopifyRev,
    Amazon:    prevChMap['Amazon']?.excRev || data.amzSC?.prevExcRev || 0,
    Blinkit:   prevChMap['Blinkit']?.excRev || 0,
    Zepto:     prevChMap['Zepto']?.excRev || 0,
    Instamart: prevChMap['Instamart']?.excRev || 0,
    Myntra:    prevChMap['Myntra']?.excRev || 0,
    Flipkart:  prevChMap['Flipkart']?.excRev || data.flipkart?.prevExcRev || 0,
  }
  const prevAllNetRev = prevShopifyExcRev + (prevChMap['Amazon']?.excRev || 0) + (prevChMap['Blinkit']?.excRev || 0) +
    (prevChMap['Zepto']?.excRev || 0) + (prevChMap['Instamart']?.excRev || 0) + (prevChMap['Myntra']?.excRev || 0) + (prevChMap['Flipkart']?.excRev || 0)
  const prevRevenue = selPlatform ? (prevPlatformNetRev[selPlatform] || 0) : prevAllNetRev
  const prevRoas = prevSpend > 0 ? prevRevenue / prevSpend : 0
  const prevCtr = prevImpressions > 0 ? prevClicks / prevImpressions * 100 : 0
  const prevCpc = prevClicks > 0 ? prevSpend / prevClicks : 0
  const prevCpm = prevImpressions > 0 ? (prevSpend / prevImpressions) * 1000 : 0
  const prevOrders = (() => {
    if (isD2C) return data.shopify?.prevOrders || 0
    if (!selPlatform) return data.prevOrders || 0
    if (selPlatform === 'Amazon') return data.amzSC?.prevOrders || 0
    if (selPlatform === 'Flipkart') return data.flipkart?.prevOrders || 0
    if (selPlatform === 'Myntra') return data.myntra?.prevOrders || 0
    if (selPlatform === 'Zepto') return data.zepto?.prevOrders || 0
    if (selPlatform === 'Instamart') return data.instamart?.prevOrders || 0
    if (selPlatform === 'Blinkit') return data.blinkit?.prevOrders || 0
    if (selPlatform === 'Meta' || selPlatform === 'Google') return data.shopify?.prevOrders || 0
    return 0
  })()
  const currentOrders = (() => {
    if (isD2C) return data.shopify?.totals?.orders || 0
    if (!selPlatform) return data.nOrders || 0
    if (selPlatform === 'Amazon') return data.amzSC?.totalOrders || 0
    if (selPlatform === 'Flipkart') return (data.flipkart?.totals || []).reduce((s, t) => s + (t.orders || 0), 0)
    if (selPlatform === 'Myntra') return data.myntra?.totals?.orders || 0
    if (selPlatform === 'Zepto') return data.chMap?.['Zepto']?.orders || data.zepto?.totals?.orders || 0
    if (selPlatform === 'Instamart') return data.chMap?.['Instamart']?.orders || data.instamart?.totals?.orders || 0
    if (selPlatform === 'Blinkit') return data.chMap?.['Blinkit']?.orders || data.blinkit?.totals?.orders || 0
    if (selPlatform === 'Meta' || selPlatform === 'Google') return data.shopify?.totals?.orders || 0
    return 0
  })()

  const prevCpo = prevOrders > 0 ? prevSpend / prevOrders : 0
  const costPerOrder = currentOrders > 0 ? totalSpend / currentOrders : 0
  const shopifyNewCustomers = (ads.nCusts || data.nCusts || 0) - (ads.repeatCusts || data.repeatCusts || 0)
  const shopifyAdSpend = _filtMetaSpend + _filtGoogleSpend
  const cac = (() => {
    if (!selPlatform || isD2C) return shopifyNewCustomers > 0 ? shopifyAdSpend / shopifyNewCustomers : 0
    if (selPlatform === 'Meta') return shopifyNewCustomers > 0 ? _filtMetaSpend / shopifyNewCustomers : 0
    if (selPlatform === 'Google') return shopifyNewCustomers > 0 ? _filtGoogleSpend / shopifyNewCustomers : 0
    return null
  })()
  const prevCac = (() => {
    if (!selPlatform || isD2C) return shopifyNewCustomers > 0 ? ((prevTotals['Meta']?.spend || 0) + (prevTotals['Google']?.spend || 0)) / shopifyNewCustomers : 0
    if (selPlatform === 'Meta') return shopifyNewCustomers > 0 && prevTotals['Meta']?.spend ? prevTotals['Meta'].spend / shopifyNewCustomers : 0
    if (selPlatform === 'Google') return shopifyNewCustomers > 0 && prevTotals['Google']?.spend ? prevTotals['Google'].spend / shopifyNewCustomers : 0
    return 0
  })()

  // Build daily spend by date, and for D2C/Meta/Google use Shopify daily excRev split by spend share
  const shopifyDailyMap = {}
  ;(data.shopify?.daily || []).forEach(d => { shopifyDailyMap[d.date] = d.excRev || 0 })

  // Daily excRev maps for marketplace channels from sales table (channel-level)
  const channelDailyMaps = ads.channelDailyExcRev || {}

  const dailyByDate = {}
  filtDaily.forEach(d => {
    if (!dailyByDate[d.date]) dailyByDate[d.date] = { date: d.date, spend: 0, revenue: 0, metaSpend: 0, googleSpend: 0 }
    dailyByDate[d.date].spend += d.spend
    if (d.platform === 'Meta') dailyByDate[d.date].metaSpend += d.spend
    if (d.platform === 'Google') dailyByDate[d.date].googleSpend += d.spend
  })
  // For D2C/Meta/Google: revenue = Shopify daily excRev split by spend share per day
  // For marketplace channels: revenue = channel sales daily excRev
  Object.values(dailyByDate).forEach(d => {
    if (isD2C || selPlatform === 'Meta' || selPlatform === 'Google') {
      const shopifyExcRevDay = shopifyDailyMap[d.date] || 0
      const dayShopifySpend = d.metaSpend + d.googleSpend
      d.metaRevenue = dayShopifySpend > 0 ? shopifyExcRevDay * (d.metaSpend / dayShopifySpend) : 0
      d.googleRevenue = dayShopifySpend > 0 ? shopifyExcRevDay * (d.googleSpend / dayShopifySpend) : 0
      if (selPlatform === 'Meta') {
        d.revenue = d.metaRevenue
      } else if (selPlatform === 'Google') {
        d.revenue = d.googleRevenue
      } else {
        d.revenue = shopifyExcRevDay
      }
    } else if (selPlatform && channelDailyMaps[selPlatform]) {
      d.revenue = channelDailyMaps[selPlatform][d.date] || 0
    } else if (!selPlatform) {
      // All tab: Shopify + all marketplace channels
      const shopifyDay = shopifyDailyMap[d.date] || 0
      const marketplaceDay = Object.values(channelDailyMaps).reduce((s, m) => s + (m[d.date] || 0), 0)
      d.revenue = shopifyDay + marketplaceDay
    }
  })
  const dailyArrRaw = Object.values(dailyByDate).sort((a, b) => a.date.localeCompare(b.date))

  // For D2C, add day-wise additional spend (prorated from additionalSpendByProduct) to each day's spend
  const addlDailySpendMap = (() => {
    if (!isD2C || !Object.keys(additionalSpendByProduct).length) return {}
    const map = {}
    for (const dayMap of Object.values(additionalSpendByProduct)) {
      for (const [date, spend] of Object.entries(dayMap)) {
        map[date] = (map[date] || 0) + spend
      }
    }
    return map
  })()
  const dailyArr = isD2C && Object.keys(addlDailySpendMap).length
    ? dailyArrRaw.map(d => ({ ...d, spend: d.spend + (addlDailySpendMap[d.date] || 0) }))
    : dailyArrRaw

  const maxSpend = Math.max(...totals.map(t => t.spend), 1)
  const platformLogo = p => {
    const found = ADS_PLATFORMS.find(x => x.id === p)
    return found?.logo || null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="sales-tabs">
        {ADS_PLATFORMS.map(p => (
          <button key={p.id} onClick={() => setSelPlatform(p.id === 'All' ? null : p.id)}
            className={`stab${(p.id === 'All' ? !selPlatform : selPlatform === p.id) ? ' active' : ''}`}
            style={p.id === 'All' ? { fontWeight: !selPlatform ? 800 : 700, fontSize: 13 } : {}}>
            {p.logo && <img src={p.logo} alt="" style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, objectFit: 'contain' }} />}
            {p.logo2 && <img src={p.logo2} alt="" style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, objectFit: 'contain', marginLeft: -4 }} />}
            {p.label}
          </button>
        ))}
      </div>

      {selPlatform === 'CRED' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 16px', flex: 1, overflowY: 'auto' }}>
          <AdsCredView data={data} filters={filters} />
        </div>
      )}

      {selPlatform !== 'CRED' && <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 16px', flex: 1, overflowY: 'auto' }}>

        {(() => {
          const d2cMetaSpend = isD2C ? (filtTotals.find(t => t.platform === 'Meta')?.spend || 0) : 0
          const d2cGoogleSpend = isD2C ? (filtTotals.find(t => t.platform === 'Google')?.spend || 0) : 0
          const d2cPrevMetaSpend = isD2C ? (prevTotals['Meta']?.spend || 0) : 0
          const d2cPrevGoogleSpend = isD2C ? (prevTotals['Google']?.spend || 0) : 0
          // D2C has 13 KPI cards (8+5) — 7 columns fits them into exactly 2 rows (7+6) instead of
          // spilling a lone 13th card onto a 3rd row at 6 columns.
          const cols = isD2C ? 7 : 5
          const hasAdditionalSpend = isD2C && additionalSpend != null
          const d2cTotalSpend = isD2C ? totalSpend + (additionalSpend || 0) : totalSpend
          const row1Items = isD2C ? [
            // D2C tab: Orders sits right after ROAS in row 1 per request.
            { label: 'Total Spend', value: fmt(d2cTotalSpend), badge: chgBadge(d2cTotalSpend, prevSpend), sub: hasAdditionalSpend ? 'D2C spend + additional spend' : 'Ad spend incl. all platforms' },
            { label: 'Meta Spend', value: fmt(d2cMetaSpend), badge: chgBadge(d2cMetaSpend, d2cPrevMetaSpend), sub: 'Meta ad spend', accentColor: '#1877F2' },
            { label: 'Google Spend', value: fmt(d2cGoogleSpend), badge: chgBadge(d2cGoogleSpend, d2cPrevGoogleSpend), sub: 'Google ad spend', accentColor: '#34A853' },
            { label: 'Additional Spend', value: fmt(additionalSpend || 0), sub: 'D2C additional mktg spend' },
            { label: 'Gross Revenue Ex GST', value: fmt(totalRevenue), badge: chgBadge(totalRevenue, prevRevenue), sub: 'D2C exc. GST (Meta+Google)' },
            { label: 'Overall ROAS', value: `${overallRoas.toFixed(2)}x`, badge: chgBadge(overallRoas, prevRoas), sub: 'Gross Revenue (Ex GST) / Spend', roasVal: overallRoas },
            { label: 'Orders', value: fmtN(currentOrders), sub: 'Distinct orders', badge: chgBadge(currentOrders, prevOrders) },
            { label: 'Total Clicks', value: fmtBig(totalClicks), badge: chgBadge(totalClicks, prevClicks), sub: 'Across all platforms' },
          ] : [
            { label: 'Total Spend', value: fmt(totalSpend), badge: chgBadge(totalSpend, prevSpend), sub: 'Ad spend incl. all platforms' },
            { label: 'Gross Revenue Ex GST', value: fmt(totalRevenue), badge: chgBadge(totalRevenue, prevRevenue), sub: selPlatform ? `${selPlatform === 'Meta' || selPlatform === 'Google' ? 'D2C (spend-split)' : selPlatform} exc. GST` : 'All channels exc. GST' },
            { label: 'Overall ROAS', value: `${overallRoas.toFixed(2)}x`, badge: chgBadge(overallRoas, prevRoas), sub: 'Gross Revenue (Ex GST) / Spend', roasVal: overallRoas },
            { label: 'Total Clicks', value: fmtBig(totalClicks), badge: chgBadge(totalClicks, prevClicks), sub: 'Across all platforms' },
            { label: 'Impressions', value: fmtBig(totalImpressions), badge: chgBadge(totalImpressions, prevImpressions), sub: 'Total ad impressions' },
          ]
          const row2Items = isD2C ? [
            // D2C tab: Orders already moved to row 1, and Cost Per Order sits right before CAC.
            { label: 'Impressions', value: fmtBig(totalImpressions), badge: chgBadge(totalImpressions, prevImpressions), sub: 'Total ad impressions' },
            { label: 'CTR', value: overallCtr.toFixed(2) + '%', badge: chgBadge(overallCtr, prevCtr), sub: 'Clicks / Impressions' },
            { label: 'CPC', value: `₹${overallCpc.toFixed(2)}`, badge: chgBadge(overallCpc, prevCpc), sub: 'Spend / Clicks' },
            { label: 'Cost Per Order', value: costPerOrder > 0 ? `₹${Math.round(costPerOrder).toLocaleString('en-IN')}` : '—', sub: 'Spend / Orders', badge: chgBadge(costPerOrder, prevCpo) },
            { label: 'CAC (D2C)', value: cac > 0 ? `₹${Math.round(cac).toLocaleString('en-IN')}` : '—', sub: `Spend / ${fmtN(shopifyNewCustomers)} new custs`, badge: chgBadge(cac, prevCac) },
          ] : [
            { label: 'CTR', value: overallCtr.toFixed(2) + '%', badge: chgBadge(overallCtr, prevCtr), sub: 'Clicks / Impressions' },
            { label: 'CPC', value: `₹${overallCpc.toFixed(2)}`, badge: chgBadge(overallCpc, prevCpc), sub: 'Spend / Clicks' },
            { label: 'Orders', value: fmtN(currentOrders), sub: 'Distinct orders', badge: chgBadge(currentOrders, prevOrders) },
            { label: 'Cost Per Order', value: costPerOrder > 0 ? `₹${Math.round(costPerOrder).toLocaleString('en-IN')}` : '—', sub: 'Spend / Orders', badge: chgBadge(costPerOrder, prevCpo) },
            ...(selPlatform === 'Meta' || selPlatform === 'Google'
              ? [{ label: 'CAC (D2C)', value: cac > 0 ? `₹${Math.round(cac).toLocaleString('en-IN')}` : '—', sub: `Spend / ${fmtN(shopifyNewCustomers)} new custs`, badge: chgBadge(cac, prevCac) }]
              : [{ label: 'CPM', value: overallCpm > 0 ? `₹${Math.round(overallCpm).toLocaleString('en-IN')}` : '—', sub: 'Cost per 1K impressions', badge: chgBadge(overallCpm, prevCpm) }]),
          ]
          return (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
              {[...row1Items, ...row2Items].map(k => (
                <div key={k.label} className="kpi-card" style={{ padding: '12px 14px', ...(k.accentColor ? { borderLeft: `3px solid ${k.accentColor}` } : {}) }}>
                  <div className="kpi-label">{k.label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 4 }}>
                    <div className="kpi-value" style={{ fontSize: 18, color: k.roasVal != null ? roasColor(k.roasVal) : C.t1 }}>{k.value}</div>
                    {k.badge}
                  </div>
                  {k.sub && <div className="kpi-sub" style={{ marginTop: 3 }}>{k.sub}</div>}
                </div>
              ))}
            </div>
          )
        })()}

        {/* Spend by Platform Table + Daily Chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Trend + Platform Overview — one row, equal fixed height */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>

          {/* Spend, Revenue & ROAS Trend */}
          {(() => {
            // Ad spend is tagged by ad platform (Meta/Google), but the sales revenue it drives is
            // tagged by sales channel (Shopify) — D2C needs one filter per side, or the revenue
            // side never matches anything and always computes to 0.
            const trendAdsPlatFilter = !selPlatform ? (() => true) : isD2C ? (r => r.platform === 'Meta' || r.platform === 'Google') : (r => r.platform === selPlatform)
            const trendSalesPlatFilter = !selPlatform ? (() => true) : isD2C ? (r => r.platform === 'Shopify') : (r => r.platform === selPlatform)
            const trendCatActive = selCat.length > 0 || selSubCat.length > 0
            const trendCatMatches = r => (!selCat.length || selCat.includes(r.category)) && (!selSubCat.length || selSubCat.includes(r.subCategory))
            // When a category/sub-category slicer is active, rebuild the daily series from the
            // category-level ads spend + sales revenue feeds instead of the richer platform-split
            // dailyByDate (which has no category dimension) — this is the only way the trend can
            // honor the slicer, at the cost of losing the Shopify-spend-share revenue-split logic
            // used elsewhere (acceptable since it's a coarser, category-scoped view by design).
            const filteredDailyArr = (() => {
              if (!trendCatActive) return dailyArr
              const map = {}
              ;(ads.adsDailyByCategory || []).filter(r => trendAdsPlatFilter(r) && trendCatMatches(r)).forEach(r => {
                if (!map[r.date]) map[r.date] = { date: r.date, spend: 0, revenue: 0 }
                map[r.date].spend += r.spend
              })
              ;(ads.salesDailyByCategory || []).filter(r => trendSalesPlatFilter(r) && trendCatMatches(r)).forEach(r => {
                if (!map[r.date]) map[r.date] = { date: r.date, spend: 0, revenue: 0 }
                map[r.date].revenue += r.revenue
              })
              // Add additional spend sliced to matching sub-categories
              if (isD2C) {
                const matchedScs = new Set(
                  (ads.adsDailyByCategory || []).filter(r => trendAdsPlatFilter(r) && trendCatMatches(r)).map(r => r.subCategory).filter(Boolean)
                )
                for (const [sc, dayMap] of Object.entries(additionalSpendByProduct)) {
                  if (!matchedScs.size || matchedScs.has(sc)) {
                    for (const [date, spend] of Object.entries(dayMap)) {
                      if (!map[date]) map[date] = { date, spend: 0, revenue: 0 }
                      map[date].spend += spend
                    }
                  }
                }
              }
              return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
            })()

            const aggTrend = (rows, gran) => {
              const map = {}
              rows.forEach(r => {
                let key
                if (gran === 'weekly') {
                  const d = new Date(r.date); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1)
                  const mon = new Date(d.setDate(diff)); key = mon.toISOString().slice(0, 10)
                } else if (gran === 'monthly') {
                  key = r.date.slice(0, 7)
                } else if (gran === 'quarterly') {
                  const mo = parseInt(r.date.slice(5, 7)); const y = parseInt(r.date.slice(0, 4))
                  const q = mo >= 4 ? Math.floor((mo - 4) / 3) + 1 : 4
                  const fy = mo >= 4 ? y : y - 1
                  key = `FY${fy}-${String(fy+1).slice(2)} Q${q}`
                } else {
                  key = r.date
                }
                if (!map[key]) map[key] = { date: key, spend: 0, revenue: 0 }
                map[key].spend += r.spend
                map[key].revenue += r.revenue
              })
              return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).map(r => ({
                ...r, roas: r.spend > 0 ? +(r.revenue / r.spend).toFixed(2) : 0
              }))
            }
            const trendData = aggTrend(filteredDailyArr, trendGran)
            const xFmt = d => {
              if (trendGran === 'monthly') return d
              if (trendGran === 'quarterly') return d
              return d?.slice(5)
            }
            // Slicer options are drawn from the ads-spend category feed, scoped to the current
            // platform tab — same convention as the Spend Breakdown slicers further down.
            const trendCatOptions = [...new Set((ads.adsDailyByCategory || []).filter(trendAdsPlatFilter).map(r => r.category).filter(Boolean))].sort()
            const trendSubCatOptions = [...new Set((ads.adsDailyByCategory || []).filter(trendAdsPlatFilter)
              .filter(r => !selCat.length || selCat.includes(r.category))
              .map(r => r.subCategory).filter(Boolean))].sort()
            const filterSummary = selSubCat.length
              ? selSubCat.join(', ')
              : selCat.length ? selCat.join(', ') : null
            const trendTooltip = ({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, padding: '8px 10px', color: C.t1 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: C.t1 }}>{label}</div>
                  {['Spend', 'Revenue', 'ROAS'].map(name => {
                    const p = payload.find(x => x.name === name)
                    if (!p) return null
                    return (
                      <div key={name} style={{ color: C.t1, fontWeight: 400 }}>
                        {name}: {name === 'ROAS' ? `${p.value}x` : fmt(p.value)}
                      </div>
                    )
                  })}
                </div>
              )
            }
            return (
              <div className="kpi-card" style={{ padding: '14px 16px', flex: selPlatform === 'Amazon' ? 4 : 3, minWidth: 0, height: ADS_CHART_ROW_H, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.t1, flexShrink: 0 }}>Spend, Revenue & ROAS Trend</div>
                    {filterSummary && (
                      <div style={{ fontSize: 11, color: C.t3, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        — {filterSummary}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <AdsSlicerDropdown label="Category" options={trendCatOptions} selected={selCat} onChange={setSelCat} />
                    <AdsSlicerDropdown label="Sub-category" options={trendSubCatOptions} selected={selSubCat} onChange={setSelSubCat} />
                    <select value={trendGran} onChange={e => setTrendGran(e.target.value)}
                      style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.t2, cursor: 'pointer', outline: 'none' }}>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                    </select>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendData} margin={{ top: 4, right: 50, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="adsSpendGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366F1" stopOpacity={0.25}/><stop offset="95%" stopColor="#6366F1" stopOpacity={0}/></linearGradient>
                      <linearGradient id="adsRevGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/><stop offset="95%" stopColor="#10B981" stopOpacity={0}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={xFmt} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => fmt(v)} width={55} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#F59E0B' }} tickFormatter={v => `${v}x`} width={38} />
                    <Tooltip content={trendTooltip} />
                    <Area yAxisId="left" type="monotone" dataKey="spend" name="Spend" stroke="#6366F1" strokeWidth={2} fill="url(#adsSpendGrad)" dot={false} legendType="none" />
                    <Area yAxisId="left" type="monotone" dataKey="revenue" name="Revenue" stroke="#10B981" strokeWidth={2} fill="url(#adsRevGrad)" dot={false} legendType="none" />
                    <Line yAxisId="right" type="monotone" dataKey="roas" name="ROAS" stroke="#F59E0B" strokeWidth={2} dot={false} strokeDasharray="4 2" legendType="none" />
                  </ComposedChart>
                </ResponsiveContainer>
                {/* Custom legend, plain HTML — Recharts' built-in <Legend> ignores explicit
                    payload ordering for mixed Area/Line series, so it's replaced entirely to
                    guarantee Spend, Revenue, ROAS always reads left to right in that order. */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 6, fontSize: 11 }}>
                  {[
                    { name: 'Spend', color: '#6366F1' },
                    { name: 'Revenue', color: '#10B981' },
                    { name: 'ROAS', color: '#F59E0B' },
                  ].map(s => (
                    <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                      <span style={{ color: C.t2 }}>{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Spend Type Split (Sponsored Products/Brands/Display) — Amazon sub-tab only, sits
              beside the trend chart. Fixed categorical hue order (never cycled), a center total
              as the chart's headline number, full ad-type names with the SP/SB/SD short code as
              a secondary tag, and every label/value in ink tokens — the swatch alone carries color. */}
          {selPlatform === 'Amazon' && (() => {
            const AD_TYPE_META = {
              'Sponsored Products': { code: 'SP', color: '#6366F1' },
              'Sponsored Brands': { code: 'SB', color: '#F59E0B' },
              'Sponsored Display': { code: 'SD', color: '#14B8A6' },
            }
            const rowsByType = {}
            ;(ads.byAdType || []).filter(r => r.platform === 'Amazon').forEach(r => {
              rowsByType[r.adType] = (rowsByType[r.adType] || 0) + r.spend
            })
            // Fixed order (Products, Brands, Display) regardless of which are present — color
            // stays tied to the ad type, not to its rank in this period's data.
            const pieData = Object.keys(AD_TYPE_META)
              .filter(name => rowsByType[name] > 0)
              .map(name => ({ name, code: AD_TYPE_META[name].code, color: AD_TYPE_META[name].color, value: rowsByType[name] }))
            const unmapped = Object.entries(rowsByType).filter(([name]) => !AD_TYPE_META[name])
            if (unmapped.length) pieData.push({ name: 'Other', code: 'Other', color: C.t3, value: unmapped.reduce((s, [, v]) => s + v, 0) })
            const totalTypeSpend = pieData.reduce((s, d) => s + d.value, 0)
            return (
              <div className="kpi-card" style={{ padding: '14px 16px', flex: 1, minWidth: 0, height: ADS_CHART_ROW_H, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.t1, marginBottom: 10 }}>Spend Type Split</div>
                {pieData.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.t3, fontSize: 12 }}>No data</div>
                ) : (
                  <>
                    <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="62%" outerRadius="88%" paddingAngle={3} stroke="none">
                            {pieData.map(d => <Cell key={d.name} fill={d.color} />)}
                          </Pie>
                          <Tooltip
                            formatter={(v, n, entry) => [fmt(v), `${n} (${entry.payload.code})`]}
                            contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }}
                            itemStyle={{ color: C.t1, fontWeight: 400 }}
                            labelStyle={{ color: C.t1, fontWeight: 600 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                        <div style={{ fontSize: 10, color: C.t3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Total Spend</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: C.t1 }}>{fmt(totalTypeSpend)}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                      {pieData.map(d => (
                        <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                            <span style={{ width: 9, height: 9, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                            <span style={{ color: C.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                            <span style={{ color: C.t3, fontSize: 10, flexShrink: 0 }}>({d.code})</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <span style={{ color: C.t1, fontWeight: 600 }}>{fmt(d.value)}</span>
                            <span style={{ color: C.t3, fontSize: 10 }}>{(d.value / totalTypeSpend * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })()}

          {/* Platform Table — only on All tab */}
          {!selPlatform && (() => {
            const platLogos = {
              Amazon: '/logo-amazon.png',
              Flipkart: '/logo-flipkart.png',
              Myntra: '/logo-myntra.png',
              Zepto: '/logo-zepto.png',
              Instamart: '/logo-instamart.png',
              Blinkit: '/logo-blinkit.png',
              CRED: '/logo-cred.png',
            }
            // Merge Meta + Google into one D2C row; use sales orders for all platforms
            const metaT = totals.find(t => t.platform === 'Meta') || {}
            const googleT = totals.find(t => t.platform === 'Google') || {}
            const d2cRow = {
              platform: 'D2C',
              spend: (metaT.spend || 0) + (googleT.spend || 0),
              clicks: (metaT.clicks || 0) + (googleT.clicks || 0),
              impressions: (metaT.impressions || 0) + (googleT.impressions || 0),
              orders: channelSalesOrders['Shopify'] || 0,
              rev: platformNetRev['D2C'] || 0,
            }
            const otherTotals = totals.filter(t => t.platform !== 'Meta' && t.platform !== 'Google')
            const platformToChannel = { Amazon: 'Amazon', Flipkart: 'Flipkart', Myntra: 'Myntra', Zepto: 'Zepto', Instamart: 'Instamart', Blinkit: 'Blinkit' }
            // CRED's ad spend is manager-entered (data.cred.additionalSpend), not a per-platform
            // row from the ads API like the others — so it's not in `totals` and must be added
            // separately here to appear in the Overall Platform Overview table. Shown even at
            // ₹0 spend for consistency with every other channel row.
            const credRow = {
              platform: 'CRED',
              spend: credAdditionalSpend,
              clicks: 0,
              impressions: 0,
              orders: channelSalesOrders['CRED'] || 0,
              rev: platformNetRev['CRED'] || 0,
            }
            const rawRows = [d2cRow, ...otherTotals.map(t => ({ ...t, rev: platformNetRev[t.platform] || 0, orders: channelSalesOrders[platformToChannel[t.platform]] || t.orders || 0 })), credRow]
            const enrichedRows = rawRows.map(t => ({
              ...t,
              roas: t.spend > 0 && (t.rev || 0) > 0 ? (t.rev || 0) / t.spend : 0,
              ctr: t.impressions > 0 ? (t.clicks / t.impressions * 100) : 0,
              cpc: t.clicks > 0 ? t.spend / t.clicks : 0,
            }))
            const tableRows = platformTable.sortRows(enrichedRows, {
              platform: r => r.platform, spend: r => r.spend, rev: r => r.rev || 0, roas: r => r.roas,
            })

            const thStyle = { fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4, padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: `1.5px solid ${C.border}` }
            const tdStyle = { fontSize: 12, padding: '5px 10px', textAlign: 'right', color: C.t1, borderBottom: `1px solid ${C.border}` }
            const totalTdStyle = { ...tdStyle, padding: '7px 10px', fontWeight: 700, color: C.t1, borderBottom: 'none' }
            const { Th } = platformTable
            const totalSpendAll = enrichedRows.reduce((s, r) => s + (r.spend || 0), 0)
            const totalRev = enrichedRows.reduce((s, r) => s + (r.rev || 0), 0)
            const totalRoas = totalSpendAll > 0 && totalRev > 0 ? totalRev / totalSpendAll : 0
            const platformColumns = [
              { id: 'spend', label: 'Spend', sortKey: 'spend',
                row: t => <td style={tdStyle}>{fmt(t.spend)}{totalSpendAll > 0 && <span style={{ fontSize: 10, color: C.t3, marginLeft: 4 }}>({(t.spend / totalSpendAll * 100).toFixed(1)}%)</span>}</td>,
                total: () => <td style={totalTdStyle}>{fmt(totalSpendAll)}</td> },
              { id: 'rev', label: 'Revenue (Ex GST)', sortKey: 'rev',
                row: t => <td style={tdStyle}>{(t.rev || 0) > 0 ? fmt(t.rev) : '—'}</td>,
                total: () => <td style={totalTdStyle}>{totalRev > 0 ? fmt(totalRev) : '—'}</td> },
              { id: 'roas', label: 'ROAS', sortKey: 'roas',
                row: t => <td style={tdStyle}>{t.roas > 0 ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: roasBg(t.roas), color: roasColor(t.roas) }}>{t.roas.toFixed(2)}x</span> : '—'}</td>,
                total: () => <td style={totalTdStyle}>{totalRoas > 0 ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: roasBg(totalRoas), color: roasColor(totalRoas) }}>{totalRoas.toFixed(2)}x</span> : '—'}</td> },
            ]
            // platformReorder is a hook call — must NOT live inside this conditionally-invoked
            // IIFE (would violate the Rules of Hooks the moment selPlatform toggles). Called
            // unconditionally near the top of AdsTab instead; referenced here by column identity.
            const orderedPlatformCols = platformColumnOrder.orderedColumns.map(oc => platformColumns.find(c => c.id === oc.id) || oc)
            return (
              <div className="kpi-card" style={{ padding: '14px 16px', flex: 2, minWidth: 0, maxWidth: '38%', height: ADS_CHART_ROW_H, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.t1 }}>Platform Overview</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {!platformColumnOrder.isDefaultOrder && (
                      <button onClick={platformColumnOrder.resetOrder} title="Reset column order to default"
                        style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                        ↺ Reset columns
                      </button>
                    )}
                    <button onClick={() => exportCSV(tableRows.map(t => ({
                      Platform: t.platform === 'D2C' ? 'D2C (Meta + Google)' : t.platform, Spend: t.spend, 'Revenue (Ex GST)': t.rev || 0, ROAS: t.roas || '',
                    })), 'ads_platform_overview.csv')}
                      style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                      ⭳ Export
                    </button>
                  </div>
                </div>
                <div style={{ overflowX: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                    <thead>
                      <tr style={{ background: C.bg }}>
                        <Th label="Platform" sortKey="platform" style={thStyle} align="left" />
                        {orderedPlatformCols.map(c => (
                          <Th key={c.id} label={c.label} sortKey={c.sortKey} style={thStyle}
                            dragProps={{ onDragStart: platformColumnOrder.onDragStart(c.id), onDragOver: platformColumnOrder.onDragOver, onDrop: platformColumnOrder.onDrop(c.id) }} />
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map(t => {
                        const isD2CRow = t.platform === 'D2C'
                        return (
                          <tr key={t.platform} style={{ cursor: 'default' }}
                            onMouseEnter={e => e.currentTarget.style.background = C.hover}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <td style={{ ...tdStyle, textAlign: 'left' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                {isD2CRow ? (
                                  <>
                                    <img src="/logo-meta.jpg" alt="Meta" style={{ width: 16, height: 16, borderRadius: 3, objectFit: 'contain', flexShrink: 0 }} />
                                    <img src="/logo-google.jpg" alt="Google" style={{ width: 16, height: 16, borderRadius: 3, objectFit: 'contain', flexShrink: 0 }} />
                                  </>
                                ) : platLogos[t.platform] ? (
                                  <img src={platLogos[t.platform]} alt="" style={{ width: 16, height: 16, borderRadius: 3, objectFit: 'contain', flexShrink: 0, background: t.platform === 'CRED' ? '#1a1a1a' : 'transparent', padding: t.platform === 'CRED' ? 1 : 0 }} />
                                ) : (
                                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: PLATFORM_COLORS[t.platform] || C.acc, flexShrink: 0, display: 'inline-block' }} />
                                )}
                                <span style={{ fontWeight: 700 }}>{isD2CRow ? 'D2C (Meta + Google)' : t.platform}</span>
                              </div>
                            </td>
                            {orderedPlatformCols.map(c => <Fragment key={c.id}>{c.row(t)}</Fragment>)}
                          </tr>
                        )
                      })}
                      <tr style={{ background: C.bg, borderTop: `1.5px solid ${C.border}` }}>
                        <td style={{ ...totalTdStyle, textAlign: 'left' }}>Total</td>
                        {orderedPlatformCols.map(c => <Fragment key={c.id}>{c.total()}</Fragment>)}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}
          </div>
        </div>

        {/* Category table + Product table (with Category column) — same component for every
            sub-tab (All + each platform), reconciled to that tab's own KPI Total Spend. */}
        {(() => {
          const detail = !selPlatform ? allSpendDetail : isD2C ? (spendDetailByPlatform.D2C || allSpendDetail) : (spendDetailByPlatform[selPlatform] || allSpendDetail)
          const catRowsAll = detail.categoryRows || []
          const subCatRowsAll = detail.subCategoryRows || []
          if (!catRowsAll.length) return null

          // Category/sub-category slicers filter these tables down to the selection, same as
          // the trend chart above — one shared selCat/selSubCat state keeps the whole tab
          // consistent: pick "Slippers" once and every section reflects it.
          const slicedCatRows = selCat.length ? catRowsAll.filter(r => selCat.includes(r.category)) : catRowsAll
          const slicedProdRows = subCatRowsAll.filter(r =>
            (!selCat.length || selCat.includes(r.category)) && (!selSubCat.length || selSubCat.includes(r.subCategory))
          )

          // Same look as the Platform Overview table above: C.bg header band with a 1.5px
          // bottom border, hover-highlighted rows (no zebra striping), roasBg/roasColor badge.
          const thStyle = { fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4, padding: '7px 12px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: `1.5px solid ${C.border}` }
          const thStyleL = { ...thStyle, textAlign: 'left' }
          const tdStyle = { fontSize: 12, padding: '5px 12px', textAlign: 'right', color: C.t1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: `1px solid ${C.border}` }
          const tdStyleL = { ...tdStyle, textAlign: 'left' }
          const totalTdStyle = { ...tdStyle, padding: '7px 12px', fontWeight: 700, color: C.t1, borderBottom: 'none' }

          const catGetters = { category: r => r.category, spend: r => r.spend, revenue: r => r.revenue, roas: r => r.roas, addlSpend: r => { const scs = slicedProdRows.filter(p => p.category === r.category).map(p => p.subCategory); return hasAddlSpendData ? scs.reduce((s, sc) => s + (getProductAddlSpend(sc) || 0), 0) : 0 } }
          const prodGetters = { category: r => r.category, subCategory: r => r.subCategory, spend: r => r.spend, revenue: r => r.revenue, roas: r => r.roas, addlSpend: r => hasAddlSpendData ? (getProductAddlSpend(r.subCategory) || 0) : 0 }
          const catQ = allCatSearch.trim().toLowerCase()
          const prodQ = allProdSearch.trim().toLowerCase()
          const filteredCatRows = catQ ? slicedCatRows.filter(r => r.category.toLowerCase().includes(catQ)) : slicedCatRows
          const filteredProdRows = prodQ ? slicedProdRows.filter(r => r.category.toLowerCase().includes(prodQ) || r.subCategory.toLowerCase().includes(prodQ)) : slicedProdRows
          const sortedCats = catTable.sortRows(filteredCatRows, catGetters)
          const sortedProds = prodTable.sortRows(filteredProdRows, prodGetters)
          const { Th: CatTh } = catTable
          const { Th: ProdTh } = prodTable

          // ROAS = Revenue (Ex GST) ÷ Spend, same definition as the Platform Overview table above —
          // not the returns/cancel/CIR-adjusted netRevenue, which used to disagree with the top-level
          // ROAS figure.
          const catTotal = filteredCatRows.reduce((a, r) => ({ spend: a.spend + r.spend, revenue: a.revenue + r.revenue }), { spend: 0, revenue: 0 })
          const catRoas = catTotal.spend > 0 && catTotal.revenue > 0 ? catTotal.revenue / catTotal.spend : 0
          const prodTotalAll = filteredProdRows.reduce((a, r) => ({ spend: a.spend + r.spend, revenue: a.revenue + r.revenue }), { spend: 0, revenue: 0 })
          const prodRoasAll = prodTotalAll.spend > 0 && prodTotalAll.revenue > 0 ? prodTotalAll.revenue / prodTotalAll.spend : 0
          // Sum addl spend from actual product rows (not KPI card) so total matches row sum
          const catAddlTotal = hasAddlSpendData ? filteredProdRows.reduce((s, r) => s + (getProductAddlSpend(r.subCategory) || 0), 0) : 0
          const prodAddlTotal = catAddlTotal

          const roasCell = r => r > 0
            ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: roasBg(r), color: roasColor(r) }}>{r.toFixed(2)}x</span>
            : '—'

          const catColumnDefs = [
            {
              id: 'spend', label: 'Spend', sortKey: 'spend', width: '22%', style: thStyle,
              row: r => {
                const catSubCats = slicedProdRows.filter(p => p.category === r.category).map(p => p.subCategory)
                const catAddlSpend = hasAddlSpendData ? catSubCats.reduce((s, sc) => s + (getProductAddlSpend(sc) || 0), 0) : 0
                const totalCatSpend = r.spend + catAddlSpend
                const totalSpendForPct = catTotal.spend + catAddlTotal
                return <td style={tdStyle}>
                  {fmt(totalCatSpend)}
                  {totalSpendForPct > 0 && <span style={{ fontSize: 9.5, color: C.t3, marginLeft: 3 }}>({(totalCatSpend / totalSpendForPct * 100).toFixed(1)}%)</span>}
                </td>
              },
              total: () => <td style={{ ...totalTdStyle, position: 'sticky', bottom: 0, background: C.bg }}>{fmt(catTotal.spend + catAddlTotal)}</td>,
            },
            {
              id: 'revenue', label: 'Revenue (Ex GST)', sortKey: 'revenue', width: '22%', style: thStyle,
              row: r => <td style={tdStyle}>{r.revenue > 0 ? fmt(r.revenue) : '—'}</td>,
              total: () => <td style={{ ...totalTdStyle, position: 'sticky', bottom: 0, background: C.bg }}>{catTotal.revenue > 0 ? fmt(catTotal.revenue) : '—'}</td>,
            },
            {
              id: 'roas', label: 'ROAS', sortKey: 'roas', width: '16%', style: thStyle,
              row: r => <td style={tdStyle}>{roasCell(r.roas)}</td>,
              total: () => <td style={{ ...totalTdStyle, position: 'sticky', bottom: 0, background: C.bg }}>{roasCell(catRoas)}</td>,
            },
          ]
          const orderedCatCols = adsCatColumnOrder.orderedColumns.map(oc => catColumnDefs.find(c => c.id === oc.id) || oc)

          const prodColumnDefs = [
            {
              id: 'spend', label: 'Spend', sortKey: 'spend', width: '20%', style: thStyle,
              row: r => {
                const prodAddlSpend = hasAddlSpendData ? (getProductAddlSpend(r.subCategory) || 0) : 0
                const totalProdSpend = r.spend + prodAddlSpend
                const prodSpendTotal = prodTotalAll.spend + catAddlTotal
                return <td style={tdStyle}>
                  {fmt(totalProdSpend)}
                  {prodSpendTotal > 0 && <span style={{ fontSize: 9.5, color: C.t3, marginLeft: 3 }}>({(totalProdSpend / prodSpendTotal * 100).toFixed(1)}%)</span>}
                </td>
              },
              total: () => <td style={{ ...totalTdStyle, position: 'sticky', bottom: 0, background: C.bg }}>{fmt(prodTotalAll.spend + catAddlTotal)}</td>,
            },
            {
              id: 'revenue', label: 'Revenue (Ex GST)', sortKey: 'revenue', width: '18%', style: thStyle,
              row: r => <td style={tdStyle}>{r.revenue > 0 ? fmt(r.revenue) : '—'}</td>,
              total: () => <td style={{ ...totalTdStyle, position: 'sticky', bottom: 0, background: C.bg }}>{prodTotalAll.revenue > 0 ? fmt(prodTotalAll.revenue) : '—'}</td>,
            },
            {
              id: 'roas', label: 'ROAS', sortKey: 'roas', width: '18%', style: thStyle,
              row: r => <td style={tdStyle}>{roasCell(r.roas)}</td>,
              total: () => <td style={{ ...totalTdStyle, position: 'sticky', bottom: 0, background: C.bg }}>{roasCell(prodRoasAll)}</td>,
            },
          ]
          const orderedProdCols = adsProdColumnOrder.orderedColumns.map(oc => prodColumnDefs.find(c => c.id === oc.id) || oc)

          return (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 14 }}>
              {/* Category table */}
              <div className="kpi-card" style={{ padding: '14px 16px', flex: 1, minWidth: 0, height: ADS_SPEND_TABLE_H, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.t1 }}>By Category</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {!adsCatColumnOrder.isDefaultOrder && (
                      <button onClick={adsCatColumnOrder.resetOrder}
                        style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                        ↺ Reset columns
                      </button>
                    )}
                    <input value={allCatSearch} onChange={e => setAllCatSearch(e.target.value)} placeholder="Search category…"
                      style={{ fontSize: 11.5, padding: '4px 9px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.t1, width: 150, outline: 'none' }} />
                    <button onClick={() => exportCSV(filteredCatRows.map(r => ({ Category: r.category, Spend: r.spend, Revenue: r.revenue, ROAS: r.roas })), 'ads_all_by_category.csv')}
                      style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                      ⭳ Export
                    </button>
                  </div>
                </div>
                <div style={{ overflowX: 'hidden', overflowY: 'auto', flex: 1 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '40%' }} />
                      {orderedCatCols.map(c => <col key={c.id} style={{ width: c.width }} />)}
                    </colgroup>
                    <thead>
                      <tr style={{ background: C.bg }}>
                        <CatTh label="Category" sortKey="category" style={{ ...thStyleL, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }} align="left" />
                        {orderedCatCols.map(c => (
                          <CatTh key={c.id} label={c.label} sortKey={c.sortKey} style={{ ...c.style, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}
                            dragProps={{ onDragStart: adsCatColumnOrder.onDragStart(c.id), onDragOver: adsCatColumnOrder.onDragOver, onDrop: adsCatColumnOrder.onDrop(c.id) }} />
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCats.map(r => (
                        <tr key={r.category} style={{ cursor: 'default' }}
                          onMouseEnter={e => e.currentTarget.style.background = C.hover}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={tdStyleL} title={r.category}>{r.category}</td>
                          {orderedCatCols.map(c => <Fragment key={c.id}>{c.row(r)}</Fragment>)}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: C.bg, borderTop: `1.5px solid ${C.border}` }}>
                        <td style={{ ...totalTdStyle, textAlign: 'left', position: 'sticky', bottom: 0, background: C.bg }}>Total</td>
                        {orderedCatCols.map(c => <Fragment key={c.id}>{c.total()}</Fragment>)}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Product table — Category column included */}
              <div className="kpi-card" style={{ padding: '14px 16px', flex: 1, minWidth: 0, height: ADS_SPEND_TABLE_H, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.t1 }}>By Product</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {!adsProdColumnOrder.isDefaultOrder && (
                      <button onClick={adsProdColumnOrder.resetOrder}
                        style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                        ↺ Reset columns
                      </button>
                    )}
                    <input value={allProdSearch} onChange={e => setAllProdSearch(e.target.value)} placeholder="Search category / product…"
                      style={{ fontSize: 11.5, padding: '4px 9px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.t1, width: 180, outline: 'none' }} />
                    <button onClick={() => exportCSV(filteredProdRows.map(r => ({ Category: r.category, Product: r.subCategory, Spend: r.spend, Revenue: r.revenue, ROAS: r.roas })), 'ads_all_by_product.csv')}
                      style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                      ⭳ Export
                    </button>
                  </div>
                </div>
                <div style={{ overflowX: 'hidden', overflowY: 'auto', flex: 1 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '14%' }} /><col style={{ width: '26%' }} />
                      {orderedProdCols.map(c => <col key={c.id} style={{ width: c.width }} />)}
                    </colgroup>
                    <thead>
                      <tr style={{ background: C.bg }}>
                        <ProdTh label="Category" sortKey="category" style={{ ...thStyleL, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }} align="left" />
                        <ProdTh label="Product" sortKey="subCategory" style={{ ...thStyleL, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }} align="left" />
                        {orderedProdCols.map(c => (
                          <ProdTh key={c.id} label={c.label} sortKey={c.sortKey} style={{ ...c.style, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}
                            dragProps={{ onDragStart: adsProdColumnOrder.onDragStart(c.id), onDragOver: adsProdColumnOrder.onDragOver, onDrop: adsProdColumnOrder.onDrop(c.id) }} />
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedProds.map(r => (
                        <tr key={`${r.category}||${r.subCategory}`} style={{ cursor: 'default' }}
                          onMouseEnter={e => e.currentTarget.style.background = C.hover}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ ...tdStyleL, color: C.t3 }} title={r.category}>{r.category}</td>
                          <td style={tdStyleL} title={r.subCategory}>{r.subCategory}</td>
                          {orderedProdCols.map(c => <Fragment key={c.id}>{c.row(r)}</Fragment>)}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: C.bg, borderTop: `1.5px solid ${C.border}` }}>
                        <td style={{ ...totalTdStyle, textAlign: 'left', position: 'sticky', bottom: 0, background: C.bg }} colSpan={2}>Total</td>
                        {orderedProdCols.map(c => <Fragment key={c.id}>{c.total()}</Fragment>)}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              </div>
            </div>
          )
        })()}

      </div>}
    </div>
  )
}

function AdsCredView({ data, filters = {} }) {
  const cred = data.cred || {}
  const totals = cred.totals || {}
  const daily = cred.daily || []
  const byCategory = cred.byCategory || []
  const byProduct = cred.byProduct || []
  const additionalSpend = cred.additionalSpend ?? null

  const [catSearch, setCatSearch] = useState('')
  const [prodSearch, setProdSearch] = useState('')
  const [trendGran, setTrendGran] = useState('daily')
  const [trendSelCat, setTrendSelCat] = useState([])
  const [trendSelSubCat, setTrendSelSubCat] = useState([])
  const catTable = useSortableTable('rev')
  const prodTable = useSortableTable('rev')
  const credCatColumnOrder = useReorderableColumns('datatable-cols:ads-cred-by-category', [{ id: 'spend' }, { id: 'excRev' }, { id: 'roas' }])
  const credProdColumnOrder = useReorderableColumns('datatable-cols:ads-cred-by-product', [{ id: 'spend' }, { id: 'excRev' }, { id: 'roas' }])

  const totalRev = totals.rev || 0
  const totalExcRev = totals.excRev || 0
  const totalOrders = totals.orders || 0
  const totalUnits = totals.units || 0
  const asp = totalUnits > 0 ? totalRev / totalUnits : 0
  const aov = totalOrders > 0 ? totalRev / totalOrders : 0
  const roas = additionalSpend > 0 ? totalExcRev / additionalSpend : 0

  const roasColor = r => r >= 2 ? C.green.tx : r >= 1 ? '#D97706' : r > 0 ? C.red.tx : C.t3
  const roasBg = r => r >= 2 ? C.green.bg : r >= 1 ? '#FEF3C7' : r > 0 ? C.red.bg : C.bg
  const roasCell = r => r > 0
    ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: roasBg(r), color: roasColor(r) }}>{r.toFixed(2)}x</span>
    : '—'

  const kpis = [
    { label: 'Spend', value: fmt(additionalSpend || 0), sub: 'CRED additional mktg spend' },
    { label: 'Gross Revenue Ex GST', value: fmt(totalExcRev), sub: 'CRED exc. GST' },
    { label: 'Gross Revenue Inc GST', value: fmt(totalRev), sub: 'CRED inc. GST' },
    { label: 'ROAS', value: roas > 0 ? `${roas.toFixed(2)}x` : '—', sub: 'Rev (Ex GST) / Spend', roasVal: roas },
    { label: 'Orders', value: fmtN(totalOrders), sub: 'Distinct orders' },
    { label: 'Units', value: fmtN(totalUnits), sub: 'Items sold' },
    { label: 'ASP', value: fmt(asp), sub: 'Avg selling price' },
    { label: 'AOV', value: fmt(aov), sub: 'Avg order value' },
    { label: 'Cost Per Order', value: (additionalSpend && totalOrders > 0) ? fmt(additionalSpend / totalOrders) : '—', sub: 'Spend / Orders' },
  ]

  const thStyle = { fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4, padding: '7px 12px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: `1.5px solid ${C.border}` }
  const thStyleL = { ...thStyle, textAlign: 'left' }
  const tdStyle = { fontSize: 12, padding: '5px 12px', textAlign: 'right', color: C.t1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: `1px solid ${C.border}` }
  const tdStyleL = { ...tdStyle, textAlign: 'left' }
  const totalTdStyle = { ...tdStyle, padding: '7px 12px', fontWeight: 700, borderBottom: 'none' }

  const catQ = catSearch.trim().toLowerCase()
  const prodQ = prodSearch.trim().toLowerCase()
  const filtCatRows = catQ ? byCategory.filter(r => r.category.toLowerCase().includes(catQ)) : byCategory
  const filtProdRows = prodQ ? byProduct.filter(r => r.subCategory.toLowerCase().includes(prodQ) || r.category.toLowerCase().includes(prodQ)) : byProduct

  // Prorate additionalSpend across categories by revenue share
  const totalRevAll = byCategory.reduce((s, r) => s + r.excRev, 0)
  const getCatSpend = cat => {
    if (!additionalSpend || !totalRevAll) return 0
    const catRow = byCategory.find(r => r.category === cat)
    return additionalSpend * ((catRow?.excRev || 0) / totalRevAll)
  }
  const getProdSpend = (subCat) => {
    if (!additionalSpend || !totalRevAll) return 0
    const prodRow = byProduct.find(r => r.subCategory === subCat)
    return additionalSpend * ((prodRow?.excRev || 0) / totalRevAll)
  }

  const catGetters = { category: r => r.category, spend: r => getCatSpend(r.category), excRev: r => r.excRev, roas: r => { const s = getCatSpend(r.category); return s > 0 ? r.excRev / s : 0 }, orders: r => r.orders }
  const prodGetters = { subCategory: r => r.subCategory, category: r => r.category, spend: r => getProdSpend(r.subCategory), excRev: r => r.excRev, roas: r => { const s = getProdSpend(r.subCategory); return s > 0 ? r.excRev / s : 0 }, orders: r => r.orders }

  const { Th: CatTh } = catTable
  const { Th: ProdTh } = prodTable
  const sortedCats = catTable.sortRows(filtCatRows, catGetters)
  const sortedProds = prodTable.sortRows(filtProdRows, prodGetters)

  const catTotalSpend = filtCatRows.reduce((s, r) => s + getCatSpend(r.category), 0)
  const catTotals = filtCatRows.reduce((a, r) => ({ excRev: a.excRev + r.excRev, orders: a.orders + r.orders }), { excRev: 0, orders: 0 })
  const catTotalRoas = catTotalSpend > 0 ? catTotals.excRev / catTotalSpend : 0
  const prodTotalSpend = filtProdRows.reduce((s, r) => s + getProdSpend(r.subCategory), 0)
  const prodTotals = filtProdRows.reduce((a, r) => ({ excRev: a.excRev + r.excRev, orders: a.orders + r.orders }), { excRev: 0, orders: 0 })
  const prodTotalRoas = prodTotalSpend > 0 ? prodTotals.excRev / prodTotalSpend : 0

  if (!totalRev && !additionalSpend) return (
    <div style={{ color: C.t3, fontSize: 13, padding: 32, textAlign: 'center' }}>No CRED data for this period</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(kpis.length, 5)}, 1fr)`, gap: 10 }}>
        {kpis.map(k => (
          <div key={k.label} className="kpi-card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.roasVal != null ? roasColor(k.roasVal) : C.t1, letterSpacing: -0.5 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Spend, Revenue & ROAS Trend */}
      {daily.length > 0 && (() => {
        const totalRevForSpend = daily.reduce((s, r) => s + r.rev, 0)
        const dailyWithSpend = daily.map(r => ({
          ...r,
          spend: (additionalSpend && totalRevForSpend > 0) ? additionalSpend * (r.rev / totalRevForSpend) : 0
        }))

        const aggTrend = (rows, gran) => {
          const map = {}
          rows.forEach(r => {
            let key
            if (gran === 'weekly') {
              const d = new Date(r.date); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1)
              key = new Date(d.setDate(diff)).toISOString().slice(0, 10)
            } else if (gran === 'monthly') { key = r.date.slice(0, 7)
            } else if (gran === 'quarterly') {
              const mo = parseInt(r.date.slice(5, 7)); const y = parseInt(r.date.slice(0, 4))
              const q = mo >= 4 ? Math.floor((mo - 4) / 3) + 1 : 4
              key = `FY${mo >= 4 ? y : y - 1}-${String((mo >= 4 ? y : y - 1)+1).slice(2)} Q${q}`
            } else { key = r.date }
            if (!map[key]) map[key] = { date: key, spend: 0, rev: 0 }
            map[key].spend += r.spend || 0
            map[key].rev += r.rev || 0
          })
          return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
            .map(r => ({ ...r, roas: r.spend > 0 ? +(r.rev / r.spend).toFixed(2) : 0 }))
        }

        const trendData = aggTrend(dailyWithSpend, trendGran)
        const xFmt = d => (trendGran === 'monthly' || trendGran === 'quarterly') ? d : d?.slice(5)

        const catOptions = [...new Set(byProduct.map(r => r.category).filter(Boolean))].sort()
        const subCatOptions = [...new Set(byProduct.filter(r => !trendSelCat.length || trendSelCat.includes(r.category)).map(r => r.subCategory).filter(Boolean))].sort()
        const filterSummary = trendSelSubCat.length ? trendSelSubCat.join(', ') : trendSelCat.length ? trendSelCat.join(', ') : null

        const trendTooltip = ({ active, payload, label }) => {
          if (!active || !payload?.length) return null
          return (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, padding: '8px 10px', color: C.t1 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
              {['Spend', 'Revenue', 'ROAS'].map(name => {
                const p = payload.find(x => x.name === name)
                if (!p) return null
                return <div key={name}>{name}: {name === 'ROAS' ? `${p.value}x` : fmt(p.value)}</div>
              })}
            </div>
          )
        }

        return (
          <div className="kpi-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.t1, flexShrink: 0 }}>Spend, Revenue &amp; ROAS Trend</div>
                {filterSummary && <div style={{ fontSize: 11, color: C.t3, fontStyle: 'italic' }}>— {filterSummary}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <AdsSlicerDropdown label="Category" options={catOptions} selected={trendSelCat} onChange={setTrendSelCat} />
                <AdsSlicerDropdown label="Sub-category" options={subCatOptions} selected={trendSelSubCat} onChange={setTrendSelSubCat} />
                <select value={trendGran} onChange={e => setTrendGran(e.target.value)}
                  style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.t2, cursor: 'pointer', outline: 'none' }}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={trendData} margin={{ top: 4, right: 50, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="credSpendGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366F1" stopOpacity={0.25}/><stop offset="95%" stopColor="#6366F1" stopOpacity={0}/></linearGradient>
                  <linearGradient id="credRevGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/><stop offset="95%" stopColor="#10B981" stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={xFmt} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => fmt(v)} width={55} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#F59E0B' }} tickFormatter={v => `${v}x`} width={38} />
                <Tooltip content={trendTooltip} />
                <Area yAxisId="left" type="monotone" dataKey="spend" name="Spend" stroke="#6366F1" strokeWidth={2} fill="url(#credSpendGrad)" dot={false} legendType="none" />
                <Area yAxisId="left" type="monotone" dataKey="rev" name="Revenue" stroke="#10B981" strokeWidth={2} fill="url(#credRevGrad)" dot={false} legendType="none" />
                <Line yAxisId="right" type="monotone" dataKey="roas" name="ROAS" stroke="#F59E0B" strokeWidth={2} dot={false} strokeDasharray="4 2" legendType="none" />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 6, fontSize: 11 }}>
              {[{ name: 'Spend', color: '#6366F1' }, { name: 'Revenue', color: '#10B981' }, { name: 'ROAS', color: '#F59E0B' }].map(s => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <span style={{ color: C.t2 }}>{s.name}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* By Category + By Product tables */}
      {(byCategory.length > 0 || byProduct.length > 0) && (() => {
        const credCatColumnDefs = [
          {
            id: 'spend', label: 'Spend', sortKey: 'spend', width: '22%', style: thStyle,
            row: r => <td style={tdStyle}>{fmt(getCatSpend(r.category))}</td>,
            total: () => <td style={{ ...totalTdStyle, position: 'sticky', bottom: 0, background: C.bg }}>{fmt(catTotalSpend)}</td>,
          },
          {
            id: 'excRev', label: 'Revenue (Ex GST)', sortKey: 'excRev', width: '22%', style: thStyle,
            row: r => <td style={tdStyle}>{r.excRev > 0 ? fmt(r.excRev) : '—'}</td>,
            total: () => <td style={{ ...totalTdStyle, position: 'sticky', bottom: 0, background: C.bg }}>{catTotals.excRev > 0 ? fmt(catTotals.excRev) : '—'}</td>,
          },
          {
            id: 'roas', label: 'ROAS', sortKey: 'roas', width: '16%', style: thStyle,
            row: r => { const s = getCatSpend(r.category); return <td style={tdStyle}>{roasCell(s > 0 ? r.excRev / s : 0)}</td> },
            total: () => <td style={{ ...totalTdStyle, position: 'sticky', bottom: 0, background: C.bg }}>{roasCell(catTotalRoas)}</td>,
          },
        ]
        const orderedCredCatCols = credCatColumnOrder.orderedColumns.map(oc => credCatColumnDefs.find(c => c.id === oc.id) || oc)

        const credProdColumnDefs = [
          {
            id: 'spend', label: 'Spend', sortKey: 'spend', width: '20%', style: thStyle,
            row: r => <td style={tdStyle}>{fmt(getProdSpend(r.subCategory))}</td>,
            total: () => <td style={{ ...totalTdStyle, position: 'sticky', bottom: 0, background: C.bg }}>{fmt(prodTotalSpend)}</td>,
          },
          {
            id: 'excRev', label: 'Revenue (Ex GST)', sortKey: 'excRev', width: '20%', style: thStyle,
            row: r => <td style={tdStyle}>{r.excRev > 0 ? fmt(r.excRev) : '—'}</td>,
            total: () => <td style={{ ...totalTdStyle, position: 'sticky', bottom: 0, background: C.bg }}>{prodTotals.excRev > 0 ? fmt(prodTotals.excRev) : '—'}</td>,
          },
          {
            id: 'roas', label: 'ROAS', sortKey: 'roas', width: '16%', style: thStyle,
            row: r => { const s = getProdSpend(r.subCategory); return <td style={tdStyle}>{roasCell(s > 0 ? r.excRev / s : 0)}</td> },
            total: () => <td style={{ ...totalTdStyle, position: 'sticky', bottom: 0, background: C.bg }}>{roasCell(prodTotalRoas)}</td>,
          },
        ]
        const orderedCredProdCols = credProdColumnOrder.orderedColumns.map(oc => credProdColumnDefs.find(c => c.id === oc.id) || oc)

        return (
        <div style={{ display: 'flex', gap: 14 }}>
          {/* By Category */}
          <div className="kpi-card" style={{ padding: '14px 16px', flex: 1, minWidth: 0, maxHeight: 500, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.t1 }}>By Category</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {!credCatColumnOrder.isDefaultOrder && (
                  <button onClick={credCatColumnOrder.resetOrder}
                    style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                    ↺ Reset columns
                  </button>
                )}
                <input value={catSearch} onChange={e => setCatSearch(e.target.value)} placeholder="Search category…"
                  style={{ fontSize: 11.5, padding: '4px 9px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.t1, width: 150, outline: 'none' }} />
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '40%' }} />
                  {orderedCredCatCols.map(c => <col key={c.id} style={{ width: c.width }} />)}
                </colgroup>
                <thead>
                  <tr style={{ background: C.bg }}>
                    <CatTh label="Category" sortKey="category" style={{ ...thStyleL, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }} align="left" />
                    {orderedCredCatCols.map(c => (
                      <CatTh key={c.id} label={c.label} sortKey={c.sortKey} style={{ ...c.style, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}
                        dragProps={{ onDragStart: credCatColumnOrder.onDragStart(c.id), onDragOver: credCatColumnOrder.onDragOver, onDrop: credCatColumnOrder.onDrop(c.id) }} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedCats.map(r => (
                    <tr key={r.category} onMouseEnter={e => e.currentTarget.style.background = C.hover} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={tdStyleL}>{r.category}</td>
                      {orderedCredCatCols.map(c => <Fragment key={c.id}>{c.row(r)}</Fragment>)}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: C.bg, borderTop: `1.5px solid ${C.border}` }}>
                    <td style={{ ...totalTdStyle, textAlign: 'left', position: 'sticky', bottom: 0, background: C.bg }}>Total</td>
                    {orderedCredCatCols.map(c => <Fragment key={c.id}>{c.total()}</Fragment>)}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* By Product */}
          <div className="kpi-card" style={{ padding: '14px 16px', flex: 1, minWidth: 0, maxHeight: 500, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.t1 }}>By Product</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {!credProdColumnOrder.isDefaultOrder && (
                  <button onClick={credProdColumnOrder.resetOrder}
                    style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                    ↺ Reset columns
                  </button>
                )}
                <input value={prodSearch} onChange={e => setProdSearch(e.target.value)} placeholder="Search product…"
                  style={{ fontSize: 11.5, padding: '4px 9px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.t1, width: 160, outline: 'none' }} />
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '16%' }} /><col style={{ width: '30%' }} />
                  {orderedCredProdCols.map(c => <col key={c.id} style={{ width: c.width }} />)}
                </colgroup>
                <thead>
                  <tr style={{ background: C.bg }}>
                    <ProdTh label="Category" sortKey="category" style={{ ...thStyleL, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }} align="left" />
                    <ProdTh label="Product" sortKey="subCategory" style={{ ...thStyleL, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }} align="left" />
                    {orderedCredProdCols.map(c => (
                      <ProdTh key={c.id} label={c.label} sortKey={c.sortKey} style={{ ...c.style, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}
                        dragProps={{ onDragStart: credProdColumnOrder.onDragStart(c.id), onDragOver: credProdColumnOrder.onDragOver, onDrop: credProdColumnOrder.onDrop(c.id) }} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedProds.map(r => (
                    <tr key={`${r.category}||${r.subCategory}`} onMouseEnter={e => e.currentTarget.style.background = C.hover} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ ...tdStyleL, color: C.t3 }}>{r.category}</td>
                      <td style={tdStyleL} title={r.subCategory}>{r.subCategory}</td>
                      {orderedCredProdCols.map(c => <Fragment key={c.id}>{c.row(r)}</Fragment>)}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: C.bg, borderTop: `1.5px solid ${C.border}` }}>
                    <td style={{ ...totalTdStyle, textAlign: 'left', position: 'sticky', bottom: 0, background: C.bg }} colSpan={2}>Total</td>
                    {orderedCredProdCols.map(c => <Fragment key={c.id}>{c.total()}</Fragment>)}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}

function BlinkitTab({ data }) {
  const bl = data.blinkit || {}
  const t = bl.totals || {}
  const nDays = t.days || 1
  const [selectedCat, setSelectedCat] = useState(null)
  const [catRevView, setCatRevView] = useState('category')

  const allCats = bl.categories || []
  const allSubCats = bl.subCategories || []
  const filtCats = selectedCat ? allCats.filter(c => c.category === selectedCat) : allCats
  const filtSubCats = selectedCat ? allSubCats.filter(c => c.category === selectedCat) : allSubCats

  const rev = filtCats.reduce((s, c) => s + c.rev, 0) || t.rev || 0
  const excRev = filtCats.reduce((s, c) => s + (c.excRev||0), 0) || t.excRev || 0
  const units = filtCats.reduce((s, c) => s + c.units, 0) || t.units || 0
  const skus = t.skus || 0
  const cities = t.cities || 0
  const orders = t.orders || 0
  const asp = units ? rev / units : 0
  const aov = orders ? rev / orders : 0
  const gst = rev - excRev
  const dailyAvg = nDays ? rev / nDays : 0

  const daily = bl.daily || []
  const blPrevRev = bl.prevRev || 0
  const blPrevExcRev = bl.prevExcRev || 0
  const blPrevUnits = bl.prevUnits || 0
  const blPrevSkus = bl.prevSkus || 0
  const blPrevCities = bl.prevCities || 0
  const blPrevOrders = bl.prevOrders || 0
  const blPrevDailyArr = bl.prevDaily || []
  const blRevChg = blPrevRev > 0 ? ((rev - blPrevRev) / blPrevRev * 100) : null
  const blChgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }
  const blSparkData = Array.from({ length: Math.max(daily.length, blPrevDailyArr.length) }, (_, i) => ({
    i, cur: daily[i]?.rev ?? null, prev: blPrevDailyArr[i]?.rev ?? null
  }))

  const cityRows = bl.cities || []
  const stateRows = bl.states || []

  const catMatrixData = {}
  filtCats.forEach(c => { catMatrixData[c.category] = { rev: c.rev, excRev: c.excRev||0, units: c.units } })
  const subCatMatrixData = {}
  filtSubCats.forEach(x => {
    if (!subCatMatrixData[x.category]) subCatMatrixData[x.category] = {}
    subCatMatrixData[x.category][x.subcategory] = { rev: x.rev, excRev: x.excRev||0, units: x.units }
  })

  const catRowsForCatSubCat = allCats.map(c => ({ name: c.category, rev: c.rev, units: c.units, orders: 0 }))
  const subCatRowsForCatSubCat = allSubCats.map(x => ({ name: x.subcategory, category: x.category, rev: x.rev, units: x.units, orders: 0 }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {selectedCat && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
          <span style={{ color: C.t2 }}>Filtered by category:</span>
          <strong style={{ color: C.t1 }}>{selectedCat}</strong>
          <button onClick={() => setSelectedCat(null)} style={{ marginLeft: 'auto', fontSize: 11, color: C.acc, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✕ Clear</button>
        </div>
      )}
      {/* KPI layout */}
      <div className="sales-kpi-section" style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        <div className="kpi-card sales-kpi-hero" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue Inc GST · MRP</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(rev)}</div>
            {blRevChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: blRevChg >= 0 ? C.green.bg : C.red.bg, color: blRevChg >= 0 ? C.green.tx : C.red.tx }}>{blRevChg >= 0 ? '▲' : '▼'} {Math.abs(blRevChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{fmtN(units)} units · {fmtN(cities)} cities</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={blSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="blGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FFD600" stopOpacity={0.25} /><stop offset="95%" stopColor="#FFD600" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke="#FFD600" strokeWidth={2} fill="url(#blGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? C.t1 : C.t3 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="sales-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 10, alignItems: 'stretch' }}>
          {[
            { label: 'Net Revenue', value: fmt(excRev), sub: 'Ex GST', badge: blChgBadge(excRev, blPrevExcRev) },
            { label: 'GST', value: fmt(gst), sub: `${rev > 0 ? ((gst/rev)*100).toFixed(1) : 0}% of gross rev`, badge: blChgBadge(gst, blPrevRev - blPrevExcRev) },
            { label: 'Daily Avg Rev', value: fmt(dailyAvg), sub: `over ${nDays} days`, badge: blChgBadge(dailyAvg, blPrevRev > 0 ? blPrevRev / nDays : 0) },
            { label: 'Orders', value: fmtN(orders), sub: `${fmtN(cities)} cities`, badge: blChgBadge(orders, blPrevOrders) },
            { label: 'AOV', value: `₹${Math.round(aov).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ orders', badge: blChgBadge(aov, blPrevOrders > 0 ? blPrevRev / blPrevOrders : 0) },
            { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ units', badge: blChgBadge(asp, blPrevUnits > 0 ? blPrevRev / blPrevUnits : 0) },
          ].map(k => (
            <div key={k.label} className="kpi-card" style={{ padding: '10px 13px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="kpi-label">{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>
                {k.badge}
              </div>
              {k.sub && <div className="kpi-sub">{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Revenue Trend + Category Revenue + Geography Breakdown side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.65fr', gap: 14, alignItems: 'start' }}>
        <TrendAnalysisCard title="Revenue & Returns Trend" daily={daily} grossColor="#FFD600" grossGradId="blGrossGrad2" revKey="rev" excRevKey="excRev" boxHeight={360} />
        <CategoryRevenueCard
          catRows={catRowsForCatSubCat}
          subCatRows={subCatRowsForCatSubCat}
          skuMap={bl.skuMatrix || {}}
          totalRev={rev}
          view={catRevView}
          setView={setCatRevView}
          selectedName={selectedCat}
          onSelectCategory={v => setSelectedCat(prev => prev === v ? null : v)}
          height={360}
        />
        {(() => {
          const regAgg = {}; cityRows.forEach(c => { if (!c.region) return; if (!regAgg[c.region]) regAgg[c.region] = { region: c.region, rev: 0, orders: 0 }; regAgg[c.region].rev += c.rev; regAgg[c.region].orders += c.units })
          const tierAgg = {}; cityRows.forEach(c => { if (!c.cityTier) return; const k = `Tier ${c.cityTier}`; if (!tierAgg[k]) tierAgg[k] = { tier: c.cityTier, rev: 0, orders: 0 }; tierAgg[k].rev += c.rev; tierAgg[k].orders += c.units })
          return <GeoToggleDonutCard regionRows={Object.values(regAgg)} tierRows={Object.values(tierAgg)} boxHeight={360} />
        })()}
      </div>

      {/* Category Matrix */}
      <FinancialCategoryMatrix catData={catMatrixData} subCatData={subCatMatrixData} skuData={bl.skuMatrix || {}} title="Category Revenue Matrix · Blinkit" showMoM={true} catPrevMap={bl.catPrevMap || {}} subCatPrevMap={bl.subCatPrevMap || {}} skuPrevMap={bl.skuPrevMap || {}} />

      {/* Cities + States */}
      {(() => {
        const statePrevMap = bl.statePrevMap || {}
        const cityPrevMap = bl.cityPrevMap || {}
        const totalStateRev = bl.stateTotal || stateRows.reduce((s, x) => s + x.rev, 0)
        const totalCityRev = bl.cityTotal || cityRows.reduce((s, x) => s + x.rev, 0)
        let sCum = 0
        const enrichedStates = stateRows.map(s => {
          const prev = statePrevMap[s.state] || 0
          const sharePct = totalStateRev > 0 ? s.rev / totalStateRev * 100 : 0
          sCum += sharePct
          return { state: s.state, rev: s.rev, orders: s.orders || 0, asp: s.units > 0 ? s.rev / s.units : 0, sharePct, cumPct: sCum, mom: prev > 0 ? (s.rev - prev) / prev * 100 : null }
        })
        let cCum = 0
        const enrichedCities = cityRows.map(c => {
          const prev = cityPrevMap[c.city] || 0
          const sharePct = totalCityRev > 0 ? c.rev / totalCityRev * 100 : 0
          cCum += sharePct
          return { city: c.city, rev: c.rev, orders: c.orders || 0, asp: c.units > 0 ? c.rev / c.units : 0, sharePct, cumPct: cCum, mom: prev > 0 ? (c.rev - prev) / prev * 100 : null }
        })
        return (
          <div className="g-2" style={{ alignItems: 'stretch' }}>
            <ShopifyGeoRichTable title="Top States" rows={enrichedStates} firstKey="state" firstLabel="State" formatFirst={v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v} showAOV={false} showRTO={false} showASP={true} />
            <ShopifyGeoRichTable title="Top Cities" rows={enrichedCities} firstKey="city" firstLabel="City" formatFirst={v => v ? v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : v} showAOV={false} showRTO={false} showASP={true} />
          </div>
        )
      })()}
    </div>
  )
}

function InstaTab({ data }) {
  const ins = data.instamart || {}
  const t = ins.totals || {}
  const nDays = t.days || 1
  const [selectedCat, setSelectedCat] = useState(null)
  const [catRevView, setCatRevView] = useState('category')

  const allCats = ins.categories || []
  const allSubCats = ins.subCategories || []
  const filtCats = selectedCat ? allCats.filter(c => c.category === selectedCat) : allCats
  const filtSubCats = selectedCat ? allSubCats.filter(c => c.category === selectedCat) : allSubCats

  const rev = filtCats.reduce((s, c) => s + c.rev, 0) || t.rev || 0
  const excRev = filtCats.reduce((s, c) => s + (c.excRev||0), 0) || t.excRev || 0
  const units = filtCats.reduce((s, c) => s + c.units, 0) || t.units || 0
  const skus = t.skus || 0
  const cities = t.cities || 0
  const orders = t.orders || 0
  const asp = units ? rev / units : 0
  const aov = orders ? rev / orders : 0
  const gst = rev - excRev
  const dailyAvg = nDays ? rev / nDays : 0

  const daily = ins.daily || []
  const insPrevRev = ins.prevRev || 0
  const insPrevExcRev = ins.prevExcRev || 0
  const insPrevUnits = ins.prevUnits || 0
  const insPrevSkus = ins.prevSkus || 0
  const insPrevCities = ins.prevCities || 0
  const insPrevOrders = ins.prevOrders || 0
  const insPrevDailyArr = ins.prevDaily || []
  const insRevChg = insPrevRev > 0 ? ((rev - insPrevRev) / insPrevRev * 100) : null
  const insSparkData = Array.from({ length: Math.max(daily.length, insPrevDailyArr.length) }, (_, i) => ({
    i, cur: daily[i]?.rev ?? null, prev: insPrevDailyArr[i]?.rev ?? null
  }))

  const cityRows = ins.cities || []
  const stateRows = ins.states || []

  const catMatrixData = {}
  filtCats.forEach(c => { catMatrixData[c.category] = { rev: c.rev, excRev: c.excRev||0, units: c.units } })
  const subCatMatrixData = {}
  filtSubCats.forEach(x => {
    if (!subCatMatrixData[x.category]) subCatMatrixData[x.category] = {}
    subCatMatrixData[x.category][x.subcategory] = { rev: x.rev, excRev: x.excRev||0, units: x.units }
  })

  const catRowsForCatSubCat = allCats.map(c => ({ name: c.category, rev: c.rev, units: c.units, orders: 0 }))
  const subCatRowsForCatSubCat = allSubCats.map(x => ({ name: x.subcategory, category: x.category, rev: x.rev, units: x.units, orders: 0 }))

  const insChgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {selectedCat && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
          <span style={{ color: C.t2 }}>Filtered by category:</span>
          <strong style={{ color: C.t1 }}>{selectedCat}</strong>
          <button onClick={() => setSelectedCat(null)} style={{ marginLeft: 'auto', fontSize: 11, color: C.acc, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✕ Clear</button>
        </div>
      )}
      <div className="sales-kpi-section" style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        <div className="kpi-card sales-kpi-hero" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue Inc GST</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(rev)}</div>
            {insRevChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: insRevChg >= 0 ? C.green.bg : C.red.bg, color: insRevChg >= 0 ? C.green.tx : C.red.tx }}>{insRevChg >= 0 ? '▲' : '▼'} {Math.abs(insRevChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{nDays} days · {fmtN(units)} units</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={insSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="inGrossGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FF6B35" stopOpacity={0.25} /><stop offset="95%" stopColor="#FF6B35" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke="#FF6B35" strokeWidth={2} fill="url(#inGrossGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? C.t1 : C.t3 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="sales-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 10, alignItems: 'stretch' }}>
          {[
            { label: 'Net Revenue', value: fmt(excRev), sub: 'Ex GST', badge: insChgBadge(excRev, insPrevExcRev) },
            { label: 'GST', value: fmt(gst), sub: `${rev > 0 ? ((gst/rev)*100).toFixed(1) : 0}% of gross rev`, badge: insChgBadge(gst, insPrevRev - insPrevExcRev) },
            { label: 'Daily Avg Rev', value: fmt(dailyAvg), sub: `Inc GST / day`, badge: insChgBadge(dailyAvg, insPrevRev > 0 ? insPrevRev / nDays : 0) },
            { label: 'Orders', value: fmtN(orders), sub: `${fmtN(cities)} cities`, badge: insChgBadge(orders, insPrevOrders) },
            { label: 'AOV', value: `₹${Math.round(aov).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ orders', badge: insChgBadge(aov, insPrevOrders > 0 ? insPrevRev / insPrevOrders : 0) },
            { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ units', badge: insChgBadge(asp, insPrevUnits > 0 ? insPrevRev / insPrevUnits : 0) },
          ].map(k => (
            <div key={k.label} className="kpi-card" style={{ padding: '10px 13px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="kpi-label">{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>
                {k.badge}
              </div>
              {k.sub && <div className="kpi-sub">{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Revenue Trend + Category Revenue + Geography Breakdown side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.65fr', gap: 14, alignItems: 'start' }}>
        <TrendAnalysisCard title="Revenue & Returns Trend" daily={daily} grossColor="#FF6B35" grossGradId="inGrossGrad2" revKey="rev" excRevKey="excRev" boxHeight={360} />
        <CategoryRevenueCard
          catRows={catRowsForCatSubCat}
          subCatRows={subCatRowsForCatSubCat}
          skuMap={ins.skuMatrix || {}}
          totalRev={rev}
          view={catRevView}
          setView={setCatRevView}
          selectedName={selectedCat}
          onSelectCategory={v => setSelectedCat(prev => prev === v ? null : v)}
          height={360}
        />
        {(() => {
          const regAgg = {}; cityRows.forEach(c => { if (!c.region) return; if (!regAgg[c.region]) regAgg[c.region] = { region: c.region, rev: 0, orders: 0 }; regAgg[c.region].rev += c.rev; regAgg[c.region].orders += c.units })
          const tierAgg = {}; cityRows.forEach(c => { if (!c.cityTier) return; const k = `Tier ${c.cityTier}`; if (!tierAgg[k]) tierAgg[k] = { tier: c.cityTier, rev: 0, orders: 0 }; tierAgg[k].rev += c.rev; tierAgg[k].orders += c.units })
          return <GeoToggleDonutCard regionRows={Object.values(regAgg)} tierRows={Object.values(tierAgg)} boxHeight={360} />
        })()}
      </div>

      <FinancialCategoryMatrix catData={catMatrixData} subCatData={subCatMatrixData} skuData={ins.skuMatrix || {}} title="Category Revenue Matrix · Instamart" showMoM={true} catPrevMap={ins.catPrevMap || {}} subCatPrevMap={ins.subCatPrevMap || {}} skuPrevMap={ins.skuPrevMap || {}} />

      {(() => {
        const statePrevMap = ins.statePrevMap || {}
        const cityPrevMap = ins.cityPrevMap || {}
        const totalStateRev = ins.stateTotal || stateRows.reduce((s, x) => s + x.rev, 0)
        const totalCityRev = ins.cityTotal || cityRows.reduce((s, x) => s + x.rev, 0)
        let sCum = 0
        const enrichedStates = stateRows.map(s => {
          const prev = statePrevMap[s.state] || 0
          const sharePct = totalStateRev > 0 ? s.rev / totalStateRev * 100 : 0
          sCum += sharePct
          return { state: s.state, rev: s.rev, orders: s.orders || 0, asp: s.units > 0 ? s.rev / s.units : 0, sharePct, cumPct: sCum, mom: prev > 0 ? (s.rev - prev) / prev * 100 : null }
        })
        let cCum = 0
        const enrichedCities = cityRows.map(c => {
          const prev = cityPrevMap[c.city] || 0
          const sharePct = totalCityRev > 0 ? c.rev / totalCityRev * 100 : 0
          cCum += sharePct
          return { city: c.city, rev: c.rev, orders: c.orders || 0, asp: c.units > 0 ? c.rev / c.units : 0, sharePct, cumPct: cCum, mom: prev > 0 ? (c.rev - prev) / prev * 100 : null }
        })
        return (
          <div className="g-2" style={{ alignItems: 'stretch' }}>
            <ShopifyGeoRichTable title="Top States" rows={enrichedStates} firstKey="state" firstLabel="State" formatFirst={v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v} showAOV={false} showRTO={false} showASP={true} />
            <ShopifyGeoRichTable title="Top Cities" rows={enrichedCities} firstKey="city" firstLabel="City" formatFirst={v => v ? v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : v} showAOV={false} showRTO={false} showASP={true} />
          </div>
        )
      })()}
    </div>
  )
}

function ZeptoTab({ data }) {
  const zp = data.zepto || {}
  const t = zp.totals || {}
  const nDays = t.days || 1
  const orders = t.orders || 0
  const [selectedCat, setSelectedCat] = useState(null)
  const [catRevView, setCatRevView] = useState('category')

  const allCats = zp.categories || []
  const allSubCats = zp.subCategories || []
  const filtCats = selectedCat ? allCats.filter(c => c.category === selectedCat) : allCats
  const filtSubCats = selectedCat ? allSubCats.filter(c => c.category === selectedCat) : allSubCats

  const rev = filtCats.reduce((s, c) => s + c.rev, 0) || t.rev || 0
  const excRev = filtCats.reduce((s, c) => s + (c.excRev||0), 0) || t.excRev || 0
  const units = filtCats.reduce((s, c) => s + c.units, 0) || t.units || 0
  const skus = t.skus || 0
  const cities = t.cities || 0
  const asp = units ? rev / units : 0
  const aov = orders ? rev / orders : 0
  const gst = rev - excRev
  const dailyAvg = nDays ? rev / nDays : 0

  const daily = zp.daily || []
  const zpPrevRev = zp.prevRev || 0
  const zpPrevExcRev = zp.prevExcRev || 0
  const zpPrevUnits = zp.prevUnits || 0
  const zpPrevSkus = zp.prevSkus || 0
  const zpPrevCities = zp.prevCities || 0
  const zpPrevOrders = zp.prevOrders || 0
  const zpPrevDailyArr = zp.prevDaily || []
  const zpRevChg = zpPrevRev > 0 ? ((rev - zpPrevRev) / zpPrevRev * 100) : null
  const zpSparkData = Array.from({ length: Math.max(daily.length, zpPrevDailyArr.length) }, (_, i) => ({
    i, cur: daily[i]?.rev ?? null, prev: zpPrevDailyArr[i]?.rev ?? null
  }))

  const cityRows = zp.cities || []
  const stateRows = zp.states || []

  const catMatrixData = {}
  filtCats.forEach(c => { catMatrixData[c.category] = { rev: c.rev, excRev: c.excRev||0, units: c.units } })
  const subCatMatrixData = {}
  filtSubCats.forEach(x => {
    if (!subCatMatrixData[x.category]) subCatMatrixData[x.category] = {}
    subCatMatrixData[x.category][x.subcategory] = { rev: x.rev, excRev: x.excRev||0, units: x.units }
  })

  const catRowsForCatSubCat = allCats.map(c => ({ name: c.category, rev: c.rev, units: c.units, orders: 0 }))
  const subCatRowsForCatSubCat = allSubCats.map(x => ({ name: x.subcategory, category: x.category, rev: x.rev, units: x.units, orders: 0 }))

  const zpChgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {selectedCat && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
          <span style={{ color: C.t2 }}>Filtered by category:</span>
          <strong style={{ color: C.t1 }}>{selectedCat}</strong>
          <button onClick={() => setSelectedCat(null)} style={{ marginLeft: 'auto', fontSize: 11, color: C.acc, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✕ Clear</button>
        </div>
      )}
      <div className="sales-kpi-section" style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        <div className="kpi-card sales-kpi-hero" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue Inc GST</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(rev)}</div>
            {zpRevChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: zpRevChg >= 0 ? C.green.bg : C.red.bg, color: zpRevChg >= 0 ? C.green.tx : C.red.tx }}>{zpRevChg >= 0 ? '▲' : '▼'} {Math.abs(zpRevChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{nDays} days · {fmtN(orders)} orders · {fmtN(units)} units</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={zpSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="zpGrossGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.25} /><stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke="#8B5CF6" strokeWidth={2} fill="url(#zpGrossGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? C.t1 : C.t3 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="sales-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 10, alignItems: 'stretch' }}>
          {[
            { label: 'Net Revenue', value: fmt(excRev), sub: 'Ex GST', badge: zpChgBadge(excRev, zpPrevExcRev) },
            { label: 'GST', value: fmt(gst), sub: `${rev > 0 ? ((gst/rev)*100).toFixed(1) : 0}% of gross rev`, badge: zpChgBadge(gst, zpPrevRev - zpPrevExcRev) },
            { label: 'Daily Avg Rev', value: fmt(dailyAvg), sub: 'Inc GST / day', badge: zpChgBadge(dailyAvg, zpPrevRev > 0 ? zpPrevRev / nDays : 0) },
            { label: 'Orders', value: fmtN(orders), sub: `${fmtN(cities)} cities`, badge: zpChgBadge(orders, zpPrevOrders) },
            { label: 'AOV', value: `₹${Math.round(aov).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ orders', badge: zpChgBadge(aov, zpPrevOrders > 0 ? zpPrevRev / zpPrevOrders : 0) },
            { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ units', badge: zpChgBadge(asp, zpPrevUnits > 0 ? zpPrevRev / zpPrevUnits : 0) },
          ].map(k => (
            <div key={k.label} className="kpi-card" style={{ padding: '10px 13px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="kpi-label">{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>
                {k.badge}
              </div>
              {k.sub && <div className="kpi-sub">{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Revenue Trend + Category Revenue + Geography Breakdown side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.65fr', gap: 14, alignItems: 'start' }}>
        <TrendAnalysisCard title="Revenue & Returns Trend" daily={daily} grossColor="#8B5CF6" grossGradId="zpGrossGrad2" revKey="rev" excRevKey="excRev" boxHeight={360} />
        <CategoryRevenueCard
          catRows={catRowsForCatSubCat}
          subCatRows={subCatRowsForCatSubCat}
          skuMap={zp.skuMatrix || {}}
          totalRev={t.rev || 0}
          view={catRevView}
          setView={setCatRevView}
          selectedName={selectedCat}
          onSelectCategory={v => setSelectedCat(prev => prev === v ? null : v)}
          height={360}
        />
        {(() => {
          const regAgg = {}; cityRows.forEach(c => { if (!c.region) return; if (!regAgg[c.region]) regAgg[c.region] = { region: c.region, rev: 0, orders: 0 }; regAgg[c.region].rev += c.rev; regAgg[c.region].orders += c.units })
          const tierAgg = {}; cityRows.forEach(c => { if (!c.cityTier) return; const k = `Tier ${c.cityTier}`; if (!tierAgg[k]) tierAgg[k] = { tier: c.cityTier, rev: 0, orders: 0 }; tierAgg[k].rev += c.rev; tierAgg[k].orders += c.units })
          return <GeoToggleDonutCard regionRows={Object.values(regAgg)} tierRows={Object.values(tierAgg)} boxHeight={360} />
        })()}
      </div>

      <FinancialCategoryMatrix catData={catMatrixData} subCatData={subCatMatrixData} skuData={zp.skuMatrix || {}} title="Category Revenue Matrix · Zepto" showMoM={true} catPrevMap={zp.catPrevMap || {}} subCatPrevMap={zp.subCatPrevMap || {}} skuPrevMap={zp.skuPrevMap || {}} />

      {(() => {
        const statePrevMap = zp.statePrevMap || {}
        const cityPrevMap = zp.cityPrevMap || {}
        const totalStateRev = zp.stateTotal || stateRows.reduce((s, x) => s + x.rev, 0)
        const totalCityRev = zp.cityTotal || cityRows.reduce((s, x) => s + x.rev, 0)
        let sCum = 0
        const enrichedStates = stateRows.map(s => {
          const prev = statePrevMap[s.state] || 0
          const sharePct = totalStateRev > 0 ? s.rev / totalStateRev * 100 : 0
          sCum += sharePct
          return { state: s.state, rev: s.rev, orders: s.orders || 0, asp: s.units > 0 ? s.rev / s.units : 0, sharePct, cumPct: sCum, mom: prev > 0 ? (s.rev - prev) / prev * 100 : null }
        })
        let cCum = 0
        const enrichedCities = cityRows.map(c => {
          const prev = cityPrevMap[c.city] || 0
          const sharePct = totalCityRev > 0 ? c.rev / totalCityRev * 100 : 0
          cCum += sharePct
          return { city: c.city, rev: c.rev, orders: c.orders || 0, asp: c.units > 0 ? c.rev / c.units : 0, sharePct, cumPct: cCum, mom: prev > 0 ? (c.rev - prev) / prev * 100 : null }
        })
        return (
          <div className="g-2" style={{ alignItems: 'stretch' }}>
            <ShopifyGeoRichTable title="Top States" rows={enrichedStates} firstKey="state" firstLabel="State" formatFirst={v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v} showAOV={false} showRTO={false} showASP={true} />
            <ShopifyGeoRichTable title="Top Cities" rows={enrichedCities} firstKey="city" firstLabel="City" formatFirst={v => v ? v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : v} showAOV={false} showRTO={false} showASP={true} />
          </div>
        )
      })()}
    </div>
  )
}

function CredTab({ data }) {
  const cr = data.cred || {}
  const t = cr.totals || {}
  const nDays = t.days || 1
  const rev = t.rev || 0
  // Net Revenue (Exc GST) = shared measures layer (Gross × retained share, minus GST on that
  // share) — not raw excRev, which has no cancel/return deduction. See computeNetRevenueMeasures.
  const netRev = cr.netCalc?.netRev ?? (t.excRev || 0)
  const gstCollected = cr.netCalc?.gstCollected || 0
  const cancelRev = cr.netCalc?.cancelRev || 0
  const totalReturnRev = (cr.netCalc?.returnRev || 0) + (cr.netCalc?.rtoRev || 0) + (cr.netCalc?.cirRev || 0)
  const cancelPct = rev > 0 ? cancelRev / rev * 100 : 0
  const returnPct = rev > 0 ? totalReturnRev / rev * 100 : 0
  const orders = t.orders || 0
  const units = t.units || 0
  const asp = units ? rev / units : 0
  const dailyAvg = nDays ? rev / nDays : 0

  const crPrevRev = cr.prevRev || 0
  const crPrevOrders = cr.prevOrders || 0
  const crPrevUnits = cr.prevUnits || 0
  const crPrevDailyArr = cr.prevDaily || []
  const crRevChg = crPrevRev > 0 ? ((rev - crPrevRev) / crPrevRev * 100) : null
  const crPrevNetRev = cr.prevNetCalc?.netRev || 0
  const crPrevGstCollected = cr.prevNetCalc?.gstCollected || 0

  const [selectedCat, setSelectedCat] = useState(null)
  const [selectedSubCat, setSelectedSubCat] = useState(null)
  const [catRevView, setCatRevView] = useState('category')
  const [crTrendGroup, setCrTrendGroup] = useState('daily')
  const [crTrendMetric, setCrTrendMetric] = useState('rev')
  const daily = cr.daily || []
  const stateRows = cr.states || []
  const cityRows = cr.cities || []

  const crChgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }

  const allCats = cr.categories || []
  const allSubCats = cr.subCategories || []
  const catPrevMap = cr.catPrevMap || {}
  const subCatPrevMap = cr.subCatPrevMap || {}
  const statePrevMap = cr.statePrevMap || {}
  const cityPrevMap = cr.cityPrevMap || {}
  const stateTotal = cr.stateTotal || 0
  const cityTotal = cr.cityTotal || 0

  const catRows = allCats.map(c => ({ name: c.category, rev: c.rev, excRev: c.excRev || 0, units: c.units, orders: c.orders }))
  const subCatRows = allSubCats.map(s => ({ name: s.subcategory, category: s.category, rev: s.rev, excRev: s.excRev || 0, units: s.units, orders: s.orders }))

  // Category matrix data — CRED has no Cancel/RTO/CIR/Exch breakdown at category level, only
  // combined revenue, so returnRev stays 0 here and the matrix renders with simpleReturns.
  const catMatrixData = {}
  allCats.forEach(c => { catMatrixData[c.category] = { rev: c.rev, excRev: c.excRev || 0, units: c.units, orders: c.orders, returnRev: 0 } })
  const subCatMatrixData = {}
  allSubCats.forEach(s => {
    if (!subCatMatrixData[s.category]) subCatMatrixData[s.category] = {}
    subCatMatrixData[s.category][s.subcategory] = { rev: s.rev, excRev: s.excRev || 0, units: s.units, orders: s.orders, returnRev: 0 }
  })

  // Enrich states/cities for ShopifyGeoRichTable — revenue-based Return %
  let cumS = 0
  const enrichedStates = stateRows.map(s => {
    const prevRev = statePrevMap[s.state] || 0
    const sharePct = stateTotal > 0 ? s.rev / stateTotal * 100 : 0
    cumS += sharePct
    return { ...s, state: s.state, aov: s.orders ? s.rev / s.orders : 0, rtoPct: s.rev > 0 ? (s.returnRev||0) / s.rev * 100 : 0, mom: prevRev > 0 ? (s.rev - prevRev) / prevRev * 100 : null, sharePct, cumPct: cumS }
  })
  let cumC = 0
  const enrichedCities = cityRows.map(c => {
    const prevRev = cityPrevMap[c.city] || 0
    const sharePct = cityTotal > 0 ? c.rev / cityTotal * 100 : 0
    cumC += sharePct
    return { ...c, city: c.city, aov: c.orders ? c.rev / c.orders : 0, rtoPct: c.rev > 0 ? (c.returnRev||0) / c.rev * 100 : 0, mom: prevRev > 0 ? (c.rev - prevRev) / prevRev * 100 : null, sharePct, cumPct: cumC }
  })

  const crSparkData = Array.from({ length: Math.max(daily.length, crPrevDailyArr.length) }, (_, i) => ({
    i, cur: daily[i]?.rev ?? null, prev: crPrevDailyArr[i]?.rev ?? null
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero + KPI grid */}
      <div className="sales-kpi-section" style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        <div className="kpi-card sales-kpi-hero" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue Inc GST</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(rev)}</div>
            {crRevChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: crRevChg >= 0 ? C.green.bg : C.red.bg, color: crRevChg >= 0 ? C.green.tx : C.red.tx }}>{crRevChg >= 0 ? '▲' : '▼'} {Math.abs(crRevChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{nDays} days · {fmtN(orders)} orders · {fmtN(units)} units</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={crSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="crGrossGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#E11D48" stopOpacity={0.25} /><stop offset="95%" stopColor="#E11D48" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke="#E11D48" strokeWidth={2} fill="url(#crGrossGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} /><span style={{ color: C.t2 }}>{p.name}: {fmt(p.value)}</span></div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="sales-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 10, alignItems: 'stretch' }}>
          {[
            { label: 'Net Revenue', value: fmt(netRev), sub: 'Ex. return & cancellation', badge: crChgBadge(netRev, crPrevNetRev) },
            { label: 'GST', value: fmt(gstCollected), sub: `${rev > 0 ? ((gstCollected/rev)*100).toFixed(1) : 0}% of gross rev`, badge: crChgBadge(gstCollected, crPrevGstCollected) },
            { label: 'Daily Avg Rev', value: fmt(dailyAvg), sub: `over ${nDays} days`, badge: crChgBadge(dailyAvg, crPrevRev > 0 ? crPrevRev / nDays : 0) },
            { label: 'AOV', value: `₹${Math.round(orders ? rev / orders : 0).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ orders', badge: crChgBadge(orders ? rev / orders : 0, crPrevOrders > 0 ? crPrevRev / crPrevOrders : 0) },
            { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ units', badge: crChgBadge(asp, crPrevUnits > 0 ? crPrevRev / crPrevUnits : 0) },
            { label: 'Orders', value: fmtN(orders), sub: `${fmtN(units)} units`, badge: crChgBadge(orders, crPrevOrders) },
            { label: 'Cancellation %', value: `${cancelPct.toFixed(1)}%`, sub: `${fmt(cancelRev)} rev`, accent: cancelPct > 10 ? '#7A1A1A' : undefined },
            { label: 'Returns %', value: `${returnPct.toFixed(1)}%`, sub: `${fmt(totalReturnRev)} rev`, accent: returnPct > 20 ? '#7A1A1A' : undefined },
          ].map(k => (
            <div key={k.label} className="kpi-card" style={{ padding: '10px 13px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="kpi-label">{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <div className="kpi-value" style={{ fontSize: 17, ...(k.accent ? { color: k.accent } : {}) }}>{k.value}</div>{k.badge}
              </div>
              {k.sub && <div className="kpi-sub">{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Revenue & Returns Trend + Category Revenue + Geography Breakdown side by side */}
      {(() => {
        const gstRatio = rev > 0 ? (rev - (t.excRev || 0)) / rev : 0
        const rawDaily = daily.map(d => {
          const gr = d.rev || 0
          return { date: d.date, grossRev: gr, netRev: d.excRev || 0, units: d.units || 0, orders: d.orders || 0 }
        })
        const grouped = (() => {
          if (crTrendGroup === 'daily') return rawDaily
          const buckets = {}
          rawDaily.forEach(d => {
            const dt = new Date(d.date)
            let key
            if (crTrendGroup === 'weekly') { const day = dt.getDay(), diff = dt.getDate() - day + (day === 0 ? -6 : 1); key = new Date(new Date(d.date).setDate(diff)).toISOString().slice(0, 10) }
            else if (crTrendGroup === 'monthly') { key = d.date.slice(0, 7) }
            else { key = `${d.date.slice(0, 4)}-Q${Math.ceil(parseInt(d.date.slice(5, 7)) / 3)}` }
            if (!buckets[key]) buckets[key] = { date: key, grossRev: 0, netRev: 0, units: 0, orders: 0 }
            buckets[key].grossRev += d.grossRev; buckets[key].netRev += d.netRev; buckets[key].units += d.units; buckets[key].orders += d.orders
          })
          return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date))
        })()
        const isRev = crTrendMetric === 'rev', isOrders = crTrendMetric === 'orders'
        const xFmt = d => crTrendGroup === 'daily' ? d?.slice(5) : crTrendGroup === 'monthly' ? d?.slice(0, 7) : d
        const yFmt = v => isRev ? (v >= 1e5 ? `${(v/1e5).toFixed(1)}L` : fmt(v)) : fmtN(v)
        const btnSt = k => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${crTrendMetric===k?C.t1:C.border}`, background: crTrendMetric===k?C.t1:'transparent', color: crTrendMetric===k?'#fff':C.t2, cursor: 'pointer', fontFamily: 'var(--font)' })
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.65fr', gap: 14, alignItems: 'start' }}>
            <Card fill title="Revenue & Returns Trend" style={{ height: 360, alignSelf: 'start' }} action={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['rev','Revenue'],['orders','Orders'],['units','Units']].map(([k,l]) => <button key={k} style={btnSt(k)} onClick={() => setCrTrendMetric(k)}>{l}</button>)}
                </div>
                <select value={crTrendGroup} onChange={e => setCrTrendGroup(e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
                  {['daily','weekly','monthly','quarterly'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
                </select>
              </div>
            }>
              <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                <ComposedChart data={grouped} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={xFmt} />
                  <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={yFmt} width={60} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, color: C.t2 }}>{xFmt(label)}</div>
                      {payload.map(p => (
                        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ color: C.t2 }}>{p.name}: {isRev ? fmt(p.value) : fmtN(p.value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {isRev ? (<>
                    <Area type="monotone" dataKey="grossRev" name="Gross Revenue" stroke="#E11D48" fill="#E11D4822" strokeWidth={2} dot={grouped.length <= 3} />
                    <Area type="monotone" dataKey="netRev" name="Net Revenue" stroke="#0D9E68" fill="#0D9E6811" strokeWidth={2} dot={grouped.length <= 3} strokeDasharray="4 2" />
                  </>) : isOrders ? (
                    <Area type="monotone" dataKey="orders" name="Orders" stroke="#E11D48" fill="#E11D4822" strokeWidth={2} dot={grouped.length <= 3} />
                  ) : (
                    <Area type="monotone" dataKey="units" name="Units" stroke="#E11D48" fill="#E11D4822" strokeWidth={2} dot={grouped.length <= 3} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
            <CategoryRevenueCard
              catRows={catRows}
              subCatRows={subCatRows}
              skuMap={cr.skuMatrix || {}}
              totalRev={rev}
              view={catRevView}
              setView={setCatRevView}
              selectedName={selectedCat}
              onSelectCategory={v => { setSelectedCat(prev => prev === v ? null : v); setSelectedSubCat(null) }}
              height={360}
            />
            <GeoToggleDonutCard regionRows={cr.regionRows || []} tierRows={cr.tierRows || []} boxHeight={360} />
          </div>
        )
      })()}

      {/* Category Revenue Matrix */}
      <FlatCategoryProductMatrix catData={catMatrixData} subCatData={subCatMatrixData} skuData={cr.skuMatrix || {}} title="Category Revenue Matrix · CRED" catPrevMap={catPrevMap} subCatPrevMap={subCatPrevMap} simpleReturns showReturnPct />

      {/* States + Cities */}
      <div className="g-2" style={{ alignItems: 'stretch' }}>
        <ShopifyGeoRichTable title="Top States" rows={enrichedStates} firstKey="state" firstLabel="State" rtoLabel="Return %" />
        <ShopifyGeoRichTable title="Top Cities" rows={enrichedCities} firstKey="city" firstLabel="City" rtoLabel="Return %" />
      </div>
    </div>
  )
}

function FirstcryTab({ data }) {
  const fc = data.firstcry || {}
  const t = fc.totals || {}
  const nDays = t.days || 1
  const rev = t.rev || 0
  // Net Revenue (Exc GST) = shared measures layer — see computeNetRevenueMeasures.
  const netRev = fc.netCalc?.netRev ?? (t.excRev || 0)
  const gstCollected = fc.netCalc?.gstCollected || 0
  const cancelRev = fc.netCalc?.cancelRev || 0
  const totalReturnRev = (fc.netCalc?.returnRev || 0) + (fc.netCalc?.rtoRev || 0) + (fc.netCalc?.cirRev || 0)
  const cancelPct = rev > 0 ? cancelRev / rev * 100 : 0
  const returnPct = rev > 0 ? totalReturnRev / rev * 100 : 0
  const orders = t.orders || 0
  const units = t.units || 0
  const asp = units ? rev / units : 0
  const dailyAvg = nDays ? rev / nDays : 0

  const fcPrevRev = fc.prevRev || 0
  const fcPrevOrders = fc.prevOrders || 0
  const fcPrevUnits = fc.prevUnits || 0
  const fcPrevDailyArr = fc.prevDaily || []
  const fcRevChg = fcPrevRev > 0 ? ((rev - fcPrevRev) / fcPrevRev * 100) : null
  const fcPrevNetRev = fc.prevNetCalc?.netRev || 0
  const fcPrevGstCollected = fc.prevNetCalc?.gstCollected || 0

  const [selectedCat, setSelectedCat] = useState(null)
  const [selectedSubCat, setSelectedSubCat] = useState(null)
  const [catRevView, setCatRevView] = useState('category')
  const [fcTrendGroup, setFcTrendGroup] = useState('daily')
  const [fcTrendMetric, setFcTrendMetric] = useState('rev')
  const daily = fc.daily || []
  const stateRows = fc.states || []
  const cityRows = fc.cities || []

  const fcChgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }

  const allCats = fc.categories || []
  const allSubCats = fc.subCategories || []
  const catPrevMap = fc.catPrevMap || {}
  const subCatPrevMap = fc.subCatPrevMap || {}
  const statePrevMap = fc.statePrevMap || {}
  const cityPrevMap = fc.cityPrevMap || {}
  const stateTotal = fc.stateTotal || 0
  const cityTotal = fc.cityTotal || 0

  const catRows = allCats.map(c => ({ name: c.category, rev: c.rev, excRev: c.excRev || 0, units: c.units, orders: c.orders }))
  const subCatRows = allSubCats.map(s => ({ name: s.subcategory, category: s.category, rev: s.rev, excRev: s.excRev || 0, units: s.units, orders: s.orders }))

  // Category matrix data — Firstcry has no Cancel/RTO/CIR/Exch breakdown at category level.
  const catMatrixData = {}
  allCats.forEach(c => { catMatrixData[c.category] = { rev: c.rev, excRev: c.excRev || 0, units: c.units, orders: c.orders, returnRev: 0 } })
  const subCatMatrixData = {}
  allSubCats.forEach(s => {
    if (!subCatMatrixData[s.category]) subCatMatrixData[s.category] = {}
    subCatMatrixData[s.category][s.subcategory] = { rev: s.rev, excRev: s.excRev || 0, units: s.units, orders: s.orders, returnRev: 0 }
  })

  // Enrich states/cities for ShopifyGeoRichTable — revenue-based Return %
  let cumS = 0
  const enrichedStates = stateRows.map(s => {
    const prevRev = statePrevMap[s.state] || 0
    const sharePct = stateTotal > 0 ? s.rev / stateTotal * 100 : 0
    cumS += sharePct
    return { ...s, state: s.state, aov: s.orders ? s.rev / s.orders : 0, rtoPct: s.rev > 0 ? (s.returnRev||0) / s.rev * 100 : 0, mom: prevRev > 0 ? (s.rev - prevRev) / prevRev * 100 : null, sharePct, cumPct: cumS }
  })
  let cumC = 0
  const enrichedCities = cityRows.map(c => {
    const prevRev = cityPrevMap[c.city] || 0
    const sharePct = cityTotal > 0 ? c.rev / cityTotal * 100 : 0
    cumC += sharePct
    return { ...c, city: c.city, aov: c.orders ? c.rev / c.orders : 0, rtoPct: c.rev > 0 ? (c.returnRev||0) / c.rev * 100 : 0, mom: prevRev > 0 ? (c.rev - prevRev) / prevRev * 100 : null, sharePct, cumPct: cumC }
  })

  const fcSparkData = Array.from({ length: Math.max(daily.length, fcPrevDailyArr.length) }, (_, i) => ({
    i, cur: daily[i]?.rev ?? null, prev: fcPrevDailyArr[i]?.rev ?? null
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="sales-kpi-section" style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        <div className="kpi-card sales-kpi-hero" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue Inc GST</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(rev)}</div>
            {fcRevChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: fcRevChg >= 0 ? C.green.bg : C.red.bg, color: fcRevChg >= 0 ? C.green.tx : C.red.tx }}>{fcRevChg >= 0 ? '▲' : '▼'} {Math.abs(fcRevChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{nDays} days · {fmtN(orders)} orders · {fmtN(units)} units</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fcSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="fcGrossGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#F97316" stopOpacity={0.25} /><stop offset="95%" stopColor="#F97316" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke="#F97316" strokeWidth={2} fill="url(#fcGrossGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} /><span style={{ color: C.t2 }}>{p.name}: {fmt(p.value)}</span></div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="sales-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 10, alignItems: 'stretch' }}>
          {[
            { label: 'Net Revenue', value: fmt(netRev), sub: 'Ex. return & cancellation', badge: fcChgBadge(netRev, fcPrevNetRev) },
            { label: 'GST', value: fmt(gstCollected), sub: `${rev > 0 ? ((gstCollected/rev)*100).toFixed(1) : 0}% of gross rev`, badge: fcChgBadge(gstCollected, fcPrevGstCollected) },
            { label: 'Daily Avg Rev', value: fmt(dailyAvg), sub: `over ${nDays} days`, badge: fcChgBadge(dailyAvg, fcPrevRev > 0 ? fcPrevRev / nDays : 0) },
            { label: 'AOV', value: `₹${Math.round(orders ? rev / orders : 0).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ orders', badge: fcChgBadge(orders ? rev / orders : 0, fcPrevOrders > 0 ? fcPrevRev / fcPrevOrders : 0) },
            { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ units', badge: fcChgBadge(asp, fcPrevUnits > 0 ? fcPrevRev / fcPrevUnits : 0) },
            { label: 'Orders', value: fmtN(orders), sub: `${fmtN(units)} units`, badge: fcChgBadge(orders, fcPrevOrders) },
            { label: 'Cancellation %', value: `${cancelPct.toFixed(1)}%`, sub: `${fmt(cancelRev)} rev`, accent: cancelPct > 10 ? '#7A1A1A' : undefined },
            { label: 'Returns %', value: `${returnPct.toFixed(1)}%`, sub: `${fmt(totalReturnRev)} rev`, accent: returnPct > 20 ? '#7A1A1A' : undefined },
          ].map(k => (
            <div key={k.label} className="kpi-card" style={{ padding: '10px 13px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="kpi-label">{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <div className="kpi-value" style={{ fontSize: 17, ...(k.accent ? { color: k.accent } : {}) }}>{k.value}</div>{k.badge}
              </div>
              {k.sub && <div className="kpi-sub">{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {(() => {
        const rawDaily = daily.map(d => ({ date: d.date, grossRev: d.rev || 0, netRev: d.excRev || 0, units: d.units || 0, orders: d.orders || 0 }))
        const grouped = (() => {
          if (fcTrendGroup === 'daily') return rawDaily
          const buckets = {}
          rawDaily.forEach(d => {
            const dt = new Date(d.date)
            let key
            if (fcTrendGroup === 'weekly') { const day = dt.getDay(), diff = dt.getDate() - day + (day === 0 ? -6 : 1); key = new Date(new Date(d.date).setDate(diff)).toISOString().slice(0, 10) }
            else if (fcTrendGroup === 'monthly') { key = d.date.slice(0, 7) }
            else { key = `${d.date.slice(0, 4)}-Q${Math.ceil(parseInt(d.date.slice(5, 7)) / 3)}` }
            if (!buckets[key]) buckets[key] = { date: key, grossRev: 0, netRev: 0, units: 0, orders: 0 }
            buckets[key].grossRev += d.grossRev; buckets[key].netRev += d.netRev; buckets[key].units += d.units; buckets[key].orders += d.orders
          })
          return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date))
        })()
        const isRev = fcTrendMetric === 'rev', isOrders = fcTrendMetric === 'orders'
        const xFmt = d => fcTrendGroup === 'daily' ? d?.slice(5) : fcTrendGroup === 'monthly' ? d?.slice(0, 7) : d
        const yFmt = v => isRev ? (v >= 1e5 ? `${(v/1e5).toFixed(1)}L` : fmt(v)) : fmtN(v)
        const btnSt = k => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${fcTrendMetric===k?C.t1:C.border}`, background: fcTrendMetric===k?C.t1:'transparent', color: fcTrendMetric===k?'#fff':C.t2, cursor: 'pointer', fontFamily: 'var(--font)' })
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.65fr', gap: 14, alignItems: 'start' }}>
            <Card fill title="Revenue & Returns Trend" style={{ height: 360, alignSelf: 'start' }} action={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['rev','Revenue'],['orders','Orders'],['units','Units']].map(([k,l]) => <button key={k} style={btnSt(k)} onClick={() => setFcTrendMetric(k)}>{l}</button>)}
                </div>
                <select value={fcTrendGroup} onChange={e => setFcTrendGroup(e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
                  {['daily','weekly','monthly','quarterly'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
                </select>
              </div>
            }>
              <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                <ComposedChart data={grouped} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={xFmt} />
                  <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={yFmt} width={60} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, color: C.t2 }}>{xFmt(label)}</div>
                      {payload.map(p => (
                        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ color: C.t2 }}>{p.name}: {isRev ? fmt(p.value) : fmtN(p.value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {isRev ? (<>
                    <Area type="monotone" dataKey="grossRev" name="Gross Revenue" stroke="#F97316" fill="#F9731622" strokeWidth={2} dot={grouped.length <= 3} />
                    <Area type="monotone" dataKey="netRev" name="Net Revenue" stroke="#0D9E68" fill="#0D9E6811" strokeWidth={2} dot={grouped.length <= 3} strokeDasharray="4 2" />
                  </>) : isOrders ? (
                    <Area type="monotone" dataKey="orders" name="Orders" stroke="#F97316" fill="#F9731622" strokeWidth={2} dot={grouped.length <= 3} />
                  ) : (
                    <Area type="monotone" dataKey="units" name="Units" stroke="#F97316" fill="#F9731622" strokeWidth={2} dot={grouped.length <= 3} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
            <CategoryRevenueCard
              catRows={catRows}
              subCatRows={subCatRows}
              skuMap={fc.skuMatrix || {}}
              totalRev={rev}
              view={catRevView}
              setView={setCatRevView}
              selectedName={selectedCat}
              onSelectCategory={v => { setSelectedCat(prev => prev === v ? null : v); setSelectedSubCat(null) }}
              height={360}
            />
            <GeoToggleDonutCard regionRows={fc.regionRows || []} tierRows={fc.tierRows || []} boxHeight={360} />
          </div>
        )
      })()}

      <FlatCategoryProductMatrix catData={catMatrixData} subCatData={subCatMatrixData} skuData={fc.skuMatrix || {}} title="Category Revenue Matrix · Firstcry" catPrevMap={catPrevMap} subCatPrevMap={subCatPrevMap} simpleReturns showReturnPct />

      <div className="g-2" style={{ alignItems: 'stretch' }}>
        <ShopifyGeoRichTable title="Top States" rows={enrichedStates} firstKey="state" firstLabel="State" rtoLabel="Return %" />
        <ShopifyGeoRichTable title="Top Cities" rows={enrichedCities} firstKey="city" firstLabel="City" rtoLabel="Return %" />
      </div>
    </div>
  )
}

function MyntraTab({ data }) {
  const mn = data.myntra || {}
  const totals = mn.totals || {}
  const nDays = totals.days || data.nDays || 1
  const rev = totals.rev || 0
  // Net Revenue (Exc GST) = shared measures layer — see computeNetRevenueMeasures.
  const netRev = mn.netCalc?.netRev ?? (totals.excRev || 0)
  const gstCollected = mn.netCalc?.gstCollected || 0
  const cancelRev = mn.netCalc?.cancelRev || 0
  const cancelPct = rev > 0 ? cancelRev / rev * 100 : 0
  const nOrders = totals.orders || 0
  const qty = totals.units || 0
  const asp = qty ? rev / qty : 0
  // Myntra totals carry a real returnRev/returnOrders figure directly (unlike CRED/Firstcry,
  // which derive it from the netCalc shared-measures layer) — use it as-is.
  const mnReturnRev = totals.returnRev || 0
  const mnReturnOrders = totals.returnOrders || 0
  const mnReturnPct = rev > 0 ? (mnReturnRev / rev * 100) : 0

  const prevRev = mn.prevRev || 0
  const revChg = prevRev > 0 ? ((rev - prevRev) / prevRev * 100) : null
  const prevNetRev = mn.prevNetCalc?.netRev || 0
  const prevGstCollected = mn.prevNetCalc?.gstCollected || 0

  const dailyArr = mn.daily || []
  const prevDaily = mn.prevDaily || []

  const sparkData = Array.from({ length: Math.max(dailyArr.length, prevDaily.length) }, (_, i) => ({
    i, cur: dailyArr[i]?.rev ?? null, prev: prevDaily[i]?.rev ?? null
  }))

  const chgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }

  const cityRows = mn.cities || []
  const stateRows = mn.states || []

  const mnCatPrevMap = mn.catPrevMap || {}
  const mnSubCatPrevMap = mn.subCatPrevMap || {}
  const mnStatePrevMap = mn.statePrevMap || {}
  const mnCityPrevMap = mn.cityPrevMap || {}
  const mnStateTotal = mn.stateTotal || 0
  const mnCityTotal = mn.cityTotal || 0

  // Category matrix data — Myntra has no Cancel/RTO/CIR/Exch breakdown at category level.
  const catMatrixData = {}
  ;(mn.categories || []).forEach(c => { catMatrixData[c.category] = { rev: c.rev, excRev: c.excRev || 0, units: c.units, orders: c.orders, returnRev: 0 } })
  const subCatMatrixData = {}
  ;(mn.subCategories || []).forEach(x => { if (!subCatMatrixData[x.category]) subCatMatrixData[x.category] = {}; subCatMatrixData[x.category][x.subcategory] = { rev: x.rev, excRev: x.excRev || 0, units: x.units, orders: x.orders, returnRev: 0 } })
  const catRowsForCatSubCat = (mn.categories || []).map(c => ({ name: c.category, rev: c.rev, excRev: c.excRev || 0, units: c.units, orders: c.orders }))
  const subCatRowsForCatSubCat = (mn.subCategories || []).map(x => ({ name: x.subcategory, category: x.category, rev: x.rev, excRev: x.excRev || 0, units: x.units, orders: x.orders }))

  // Enrich states/cities — revenue-based Return %
  let mnCumS = 0
  const mnEnrichedStates = stateRows.map(s => {
    const prevRev = mnStatePrevMap[s.state] || 0
    const sharePct = mnStateTotal > 0 ? s.rev / mnStateTotal * 100 : 0
    mnCumS += sharePct
    return { ...s, aov: s.orders ? s.rev / s.orders : 0, rtoPct: s.rev > 0 ? (s.returnRev||0) / s.rev * 100 : 0, mom: prevRev > 0 ? (s.rev - prevRev) / prevRev * 100 : null, sharePct, cumPct: mnCumS }
  })
  let mnCumC = 0
  const mnEnrichedCities = cityRows.map(c => {
    const prevRev = mnCityPrevMap[c.city] || 0
    const sharePct = mnCityTotal > 0 ? c.rev / mnCityTotal * 100 : 0
    mnCumC += sharePct
    return { ...c, aov: c.orders ? c.rev / c.orders : 0, rtoPct: c.rev > 0 ? (c.returnRev||0) / c.rev * 100 : 0, mom: prevRev > 0 ? (c.rev - prevRev) / prevRev * 100 : null, sharePct, cumPct: mnCumC }
  })

  const [selectedCat, setSelectedCat] = useState(null)
  const [selectedSubCat, setSelectedSubCat] = useState(null)
  const [catRevView, setCatRevView] = useState('category')
  const [mnTrendGroup, setMnTrendGroup] = useState('daily')
  const [mnTrendMetric, setMnTrendMetric] = useState('rev')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* KPI Hero + grid */}
      <div className="sales-kpi-section" style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        <div className="kpi-card sales-kpi-hero" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue Inc GST</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(rev)}</div>
            {revChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: revChg >= 0 ? C.green.bg : C.red.bg, color: revChg >= 0 ? C.green.tx : C.red.tx }}>{revChg >= 0 ? '▲' : '▼'} {Math.abs(revChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{nDays} days · {fmtN(nOrders)} orders · {fmtN(qty)} units</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="mnGrossGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#E87858" stopOpacity={0.25} /><stop offset="95%" stopColor="#E87858" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke="#E87858" strokeWidth={2} fill="url(#mnGrossGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} /><span style={{ color: C.t2 }}>{p.name}: {fmt(p.value)}</span></div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="sales-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 10, alignItems: 'stretch' }}>
          {[
            { label: 'Net Revenue', value: fmt(netRev), sub: 'Ex. return & cancellation', badge: chgBadge(netRev, prevNetRev) },
            { label: 'GST', value: fmt(gstCollected), sub: `${rev > 0 ? ((gstCollected/rev)*100).toFixed(1) : 0}% of gross rev`, badge: chgBadge(gstCollected, prevGstCollected) },
            { label: 'Daily Avg Rev', value: fmt(rev / nDays), sub: `over ${nDays} days`, badge: chgBadge(rev / nDays, prevRev > 0 ? prevRev / nDays : 0) },
            { label: 'AOV', value: `₹${Math.round(nOrders ? rev / nOrders : 0).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ orders', badge: chgBadge(nOrders ? rev / nOrders : 0, mn.prevOrders > 0 ? prevRev / mn.prevOrders : 0) },
            { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ units', badge: chgBadge(asp, mn.prevUnits > 0 ? prevRev / mn.prevUnits : 0) },
            { label: 'Active Products', value: fmtN(totals.skus), sub: 'Product types sold' },
            { label: 'Cancellation %', value: `${cancelPct.toFixed(1)}%`, sub: `${fmt(cancelRev)} rev`, accent: cancelPct > 10 ? '#7A1A1A' : undefined },
            { label: 'Returns %', value: `${mnReturnPct.toFixed(1)}%`, sub: `${fmt(mnReturnRev)} ret · ${fmtN(mnReturnOrders)} orders`, accent: mnReturnPct > 15 ? '#7A1A1A' : undefined },
          ].map(k => (
            <div key={k.label} className="kpi-card" style={{ padding: '10px 13px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="kpi-label">{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <div className="kpi-value" style={{ fontSize: 17, ...(k.accent ? { color: k.accent } : {}) }}>{k.value}</div>{k.badge}
              </div>
              {k.sub && <div className="kpi-sub">{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {(() => {
        const rawDaily = dailyArr.map(d => ({ date: d.date, grossRev: d.rev || 0, netRev: d.excRev || 0, units: d.units || 0, orders: d.orders || 0 }))
        const grouped = (() => {
          if (mnTrendGroup === 'daily') return rawDaily
          const buckets = {}
          rawDaily.forEach(d => {
            const dt = new Date(d.date)
            let key
            if (mnTrendGroup === 'weekly') { const day = dt.getDay(), diff = dt.getDate() - day + (day === 0 ? -6 : 1); key = new Date(new Date(d.date).setDate(diff)).toISOString().slice(0, 10) }
            else if (mnTrendGroup === 'monthly') { key = d.date.slice(0, 7) }
            else { key = `${d.date.slice(0, 4)}-Q${Math.ceil(parseInt(d.date.slice(5, 7)) / 3)}` }
            if (!buckets[key]) buckets[key] = { date: key, grossRev: 0, netRev: 0, units: 0, orders: 0 }
            buckets[key].grossRev += d.grossRev; buckets[key].netRev += d.netRev; buckets[key].units += d.units; buckets[key].orders += d.orders
          })
          return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date))
        })()
        const isRev = mnTrendMetric === 'rev', isOrders = mnTrendMetric === 'orders'
        const xFmt = d => mnTrendGroup === 'daily' ? d?.slice(5) : mnTrendGroup === 'monthly' ? d?.slice(0, 7) : d
        const yFmt = v => isRev ? (v >= 1e5 ? `${(v/1e5).toFixed(1)}L` : fmt(v)) : fmtN(v)
        const btnSt = k => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${mnTrendMetric===k?C.t1:C.border}`, background: mnTrendMetric===k?C.t1:'transparent', color: mnTrendMetric===k?'#fff':C.t2, cursor: 'pointer', fontFamily: 'var(--font)' })
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.65fr', gap: 14, alignItems: 'start' }}>
            <Card fill title="Revenue & Returns Trend" style={{ height: 360, alignSelf: 'start' }} action={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['rev','Revenue'],['orders','Orders'],['units','Units']].map(([k,l]) => <button key={k} style={btnSt(k)} onClick={() => setMnTrendMetric(k)}>{l}</button>)}
                </div>
                <select value={mnTrendGroup} onChange={e => setMnTrendGroup(e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
                  {['daily','weekly','monthly','quarterly'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
                </select>
              </div>
            }>
              <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                <ComposedChart data={grouped} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={xFmt} />
                  <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={yFmt} width={60} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, color: C.t2 }}>{xFmt(label)}</div>
                      {payload.map(p => (
                        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ color: C.t2 }}>{p.name}: {isRev ? fmt(p.value) : fmtN(p.value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {isRev ? (<>
                    <Area type="monotone" dataKey="grossRev" name="Gross Revenue" stroke="#E87858" fill="#E8785822" strokeWidth={2} dot={grouped.length <= 3} />
                    <Area type="monotone" dataKey="netRev" name="Net Revenue" stroke="#0D9E68" fill="#0D9E6811" strokeWidth={2} dot={grouped.length <= 3} strokeDasharray="4 2" />
                  </>) : isOrders ? (
                    <Area type="monotone" dataKey="orders" name="Orders" stroke="#E87858" fill="#E8785822" strokeWidth={2} dot={grouped.length <= 3} />
                  ) : (
                    <Area type="monotone" dataKey="units" name="Units" stroke="#E87858" fill="#E8785822" strokeWidth={2} dot={grouped.length <= 3} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
            <CategoryRevenueCard
              catRows={catRowsForCatSubCat}
              subCatRows={subCatRowsForCatSubCat}
              skuMap={mn.skuMatrix || {}}
              totalRev={rev}
              view={catRevView}
              setView={setCatRevView}
              selectedName={selectedCat}
              onSelectCategory={v => { setSelectedCat(prev => prev === v ? null : v); setSelectedSubCat(null) }}
              height={360}
            />
            {(() => {
              // Myntra has no standalone regionRows/tierRows from backend — derive from cities'
              // inline region/cityTier fields (units aggregated as orders since Myntra city rows
              // don't carry a units field).
              const regAgg = {}; cityRows.forEach(c => { if (!c.region) return; if (!regAgg[c.region]) regAgg[c.region] = { region: c.region, rev: 0, orders: 0 }; regAgg[c.region].rev += c.rev; regAgg[c.region].orders += c.orders })
              const tierAgg = {}; cityRows.forEach(c => { if (!c.cityTier) return; const k = `Tier ${c.cityTier}`; if (!tierAgg[k]) tierAgg[k] = { tier: c.cityTier, name: k, rev: 0, orders: 0 }; tierAgg[k].rev += c.rev; tierAgg[k].orders += c.orders })
              return <GeoToggleDonutCard regionRows={Object.values(regAgg)} tierRows={Object.values(tierAgg)} boxHeight={360} />
            })()}
          </div>
        )
      })()}

      {/* Category Revenue Matrix */}
      <FlatCategoryProductMatrix catData={catMatrixData} subCatData={subCatMatrixData} skuData={mn.skuMatrix || {}} title="Category Revenue Matrix · Myntra" catPrevMap={mnCatPrevMap} subCatPrevMap={mnSubCatPrevMap} simpleReturns showReturnPct />

      {/* Top States + Top Cities side by side */}
      <div className="g-2" style={{ alignItems: 'stretch' }}>
        <ShopifyGeoRichTable title="Top States" rows={mnEnrichedStates} firstKey="state" firstLabel="State" rtoLabel="Return %" />
        <ShopifyGeoRichTable title="Top Cities" rows={mnEnrichedCities} firstKey="city" firstLabel="City" rtoLabel="Return %" />
      </div>
    </div>
  )
}

// Offline's Overall/B2B/Stockist/MT GT toggle — extracted so SalesPage can render it on the
// shared filter-bar row, same pattern as D2CSubChannelToggle/AmazonChannelViewToggle. sub/setSub
// are lifted to SalesPage (was local useState inside OfflineTab before).
function OfflineSubToggle({ sub, setSub }) {
  const opts = OFFLINE_SUB_OPTIONS
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {opts.map((opt, i) => (
        <div key={opt.id} style={{ display: 'flex', alignItems: 'center' }}>
          {i > 0 && <div style={{ width: 1, height: 14, background: '#E3E0D8', margin: '0 2px' }} />}
          <button onClick={() => setSub(opt.id)} style={{ fontSize: 12, fontWeight: sub === opt.id ? 700 : 500, padding: '5px 14px', borderRadius: 7, border: 'none', background: sub === opt.id ? '#FFD600' : 'transparent', color: '#13121A', cursor: 'pointer' }}>{opt.label}</button>
        </div>
      ))}
    </div>
  )
}

function OfflineTab({ data, sub, setSub }) {
  const off = data.offline || {}
  const [catRevView, setCatRevView] = useState('category')
  const [selectedCat, setSelectedCat] = useState(null)
  const SUB_OPTIONS = OFFLINE_SUB_OPTIONS

  // Real SubChannel values are namespaced (e.g. "Stockist_Sayball", "Offline_B2B_Savio"), not
  // the bare "Stockist"/"Offline_B2B" literals — match by prefix, not exact equality.
  const filterSub = rows => {
    if (sub === 'all') return rows
    if (sub === 'b2b') return rows.filter(r => r.subChannel === 'Shopify B2B' || r.subChannel?.startsWith('Offline_B2B'))
    if (sub === 'Stockist') return rows.filter(r => r.subChannel?.startsWith('Stockist'))
    return rows.filter(r => r.subChannel === sub)
  }

  // Totals: split sales vs credit notes
  const totalsBySub = off.totalsBySub || []
  const filteredTotals = filterSub(totalsBySub)
  const grossRev = filteredTotals.reduce((s, r) => s + (r.revSales || 0), 0)            // Gross = sales only
  const cnRev = filteredTotals.reduce((s, r) => s + (r.cnRev || 0), 0)                  // Credit notes (Inc. GST)
  const cnRevAbs = Math.abs(cnRev)                                                       // absolute credit note amount
  const grossAfterCN = grossRev - cnRevAbs                                              // gross minus credit notes
  const cnExcRev = filteredTotals.reduce((s, r) => s + (r.cnExcRev || 0), 0)
  const cnOrders = filteredTotals.reduce((s, r) => s + (r.cnOrders || 0), 0)
  const cnUnits = Math.abs(filteredTotals.reduce((s, r) => s + (r.cnUnits || 0), 0))
  const excRevSales = filteredTotals.reduce((s, r) => s + (r.excRevSales || 0), 0)
  // Net Revenue = (Gross − Credit Notes) excluding GST
  const netRev = excRevSales - Math.abs(cnExcRev)
  const gstCollected = grossAfterCN - netRev
  const nOrders = filteredTotals.reduce((s, r) => s + (r.orders || 0), 0)
  const qty = filteredTotals.reduce((s, r) => s + (r.units || 0), 0)
  const asp = qty ? grossRev / qty : 0
  const nDays = data.nDays || 1

  const prevBySub = off.prevBySub || []
  const filteredPrev = filterSub(prevBySub)
  const prevGrossRev = filteredPrev.reduce((s, r) => s + (r.revSales || 0), 0)
  const prevCnRev = Math.abs(filteredPrev.reduce((s, r) => s + (r.cnRev || 0), 0))
  const prevCnExcRev = Math.abs(filteredPrev.reduce((s, r) => s + (r.cnExcRev || 0), 0))
  const prevExcRevSales = filteredPrev.reduce((s, r) => s + (r.excRevSales || 0), 0)
  const prevNetRev = prevExcRevSales - prevCnExcRev
  const prevOrders = filteredPrev.reduce((s, r) => s + (r.orders || 0), 0)
  const prevUnits = filteredPrev.reduce((s, r) => s + (r.units || 0), 0)
  const revChg = prevGrossRev > 0 ? ((grossRev - prevGrossRev) / prevGrossRev * 100) : null

  // Backward-compat aliases for the rest of the component
  const rev = grossRev
  const excRev = netRev
  const prevRev = prevGrossRev
  const prevExcRev = prevNetRev

  // Daily series — filter by sub-channel, aggregate by date.
  // rev/excRev are Sales-only; cnRev/cnExcRev are Credit Notes; net = excRev - |cnExcRev|
  const aggByDate = rows => {
    const m = {}
    filterSub(rows).forEach(d => {
      if (!m[d.date]) m[d.date] = { date: d.date, rev: 0, excRev: 0, cnRev: 0, cnExcRev: 0, orders: 0, units: 0, net: 0 }
      m[d.date].rev += d.rev || 0
      m[d.date].excRev += d.excRev || 0
      m[d.date].cnRev += Math.abs(d.cnRev || 0)
      m[d.date].cnExcRev += Math.abs(d.cnExcRev || 0)
      m[d.date].orders += d.orders || 0
      m[d.date].units += d.units || 0
    })
    Object.values(m).forEach(d => { d.net = (d.excRev || 0) - (d.cnExcRev || 0) })
    return Object.values(m).sort((a, b) => a.date.localeCompare(b.date))
  }
  const dailyArr = aggByDate(off.daily || [])
  const prevDailyArr = aggByDate(off.prevDaily || [])
  const sparkData = Array.from({ length: Math.max(dailyArr.length, prevDailyArr.length) }, (_, i) => ({
    i, cur: dailyArr[i]?.rev ?? null, prev: prevDailyArr[i]?.rev ?? null
  }))

  const chgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }

  // Category aggregation — sum across selected sub-channel(s)
  const aggCat = rows => {
    const m = {}
    filterSub(rows).forEach(r => {
      if (!m[r.category]) m[r.category] = { name: r.category, rev: 0, excRev: 0, orders: 0, units: 0 }
      m[r.category].rev += r.rev || 0; m[r.category].excRev += r.excRev || 0
      m[r.category].orders += r.orders || 0; m[r.category].units += r.units || 0
    })
    return Object.values(m).sort((a, b) => b.rev - a.rev)
  }
  const catRows = aggCat(off.categoryRows || [])

  const aggSubCat = rows => {
    const m = {}
    filterSub(rows).forEach(r => {
      const k = `${r.category}::${r.subCategory}`
      if (!m[k]) m[k] = { name: r.subCategory, category: r.category, rev: 0, excRev: 0, orders: 0, units: 0 }
      m[k].rev += r.rev || 0; m[k].excRev += r.excRev || 0
      m[k].orders += r.orders || 0; m[k].units += r.units || 0
    })
    return Object.values(m).sort((a, b) => b.rev - a.rev)
  }
  const allSubCatRows = aggSubCat(off.subCategoryRows || []).map(x => ({ ...x, asp: x.units ? x.rev / x.units : 0 }))

  // State / City / Region / Tier aggregation
  const aggBy = (rows, keyFn, baseFields = {}) => {
    const m = {}
    filterSub(rows).forEach(r => {
      const k = keyFn(r)
      if (!m[k]) m[k] = { ...baseFields(r), rev: 0, orders: 0, units: 0 }
      m[k].rev += r.rev || 0; m[k].orders += r.orders || 0; m[k].units += r.units || 0
    })
    return Object.values(m).sort((a, b) => b.rev - a.rev)
  }
  const stateRowsRaw = aggBy(off.stateRows || [], r => r.state, r => ({ state: r.state, name: r.state, cities: r.cities || 0 }))
  const cityRowsRaw = aggBy(off.cityRows || [], r => `${r.city}|${r.state}`, r => ({ city: r.city, state: r.state, region: r.region, name: r.city }))

  // Build prev/total maps from sub-channel-aware rows
  const catPrevMap = (() => {
    const m = {}
    filterSub(off.catPrevRows || []).forEach(x => { m[x.category] = (m[x.category] || 0) + x.rev })
    return m
  })()
  const subCatPrevMap = (() => {
    const m = {}
    filterSub(off.subCatPrevRows || []).forEach(x => { const k = `${x.category}::${x.subcategory}`; m[k] = (m[k] || 0) + x.rev })
    return m
  })()
  const statePrevMap = (() => {
    const m = {}
    filterSub(off.statePrevRows || []).forEach(x => { m[x.state] = (m[x.state] || 0) + x.rev })
    return m
  })()
  const cityPrevMap = (() => {
    const m = {}
    filterSub(off.cityPrevRows || []).forEach(x => { m[x.city] = (m[x.city] || 0) + x.rev })
    return m
  })()
  const stateTotal = filterSub(off.stateTotalRows || []).reduce((s, x) => s + x.total, 0) || rev
  const cityTotal = filterSub(off.cityTotalRows || []).reduce((s, x) => s + x.total, 0) || rev

  // Enrich state rows with sharePct, cumPct, aov, mom
  const stateRows = (() => {
    let cum = 0
    return stateRowsRaw.map(r => {
      const sharePct = stateTotal > 0 ? r.rev / stateTotal * 100 : 0
      cum += sharePct
      const prevRev = statePrevMap[r.state] || 0
      const mom = prevRev > 0 ? (r.rev - prevRev) / prevRev * 100 : null
      return { ...r, sharePct, cumPct: cum, aov: r.orders ? r.rev / r.orders : 0, mom }
    })
  })()
  const cityRows = (() => {
    let cum = 0
    return cityRowsRaw.map(r => {
      const sharePct = cityTotal > 0 ? r.rev / cityTotal * 100 : 0
      cum += sharePct
      const prevRev = cityPrevMap[r.city] || 0
      const mom = prevRev > 0 ? (r.rev - prevRev) / prevRev * 100 : null
      return { ...r, sharePct, cumPct: cum, aov: r.orders ? r.rev / r.orders : 0, mom }
    })
  })()
  const regionRows = aggBy(off.regionRows || [], r => r.region, r => ({ region: r.region }))
  const tierRows = aggBy(off.tierRows || [], r => `${r.tier}`, r => ({ tier: r.tier, label: r.label }))

  // Category matrix
  const catMatrixData = {}
  catRows.forEach(c => { catMatrixData[c.name] = { rev: c.rev, excRev: c.excRev, units: c.units, orders: c.orders } })
  const subCatMatrixData = {}
  allSubCatRows.forEach(s => { if (!subCatMatrixData[s.category]) subCatMatrixData[s.category] = {}; subCatMatrixData[s.category][s.name] = { rev: s.rev, excRev: s.excRev, units: s.units, orders: s.orders } })
  const skuMatrixData = {}
  filterSub(off.skuRows || []).forEach(x => {
    if (!skuMatrixData[x.category]) skuMatrixData[x.category] = {}
    if (!skuMatrixData[x.category][x.subCategory]) skuMatrixData[x.category][x.subCategory] = {}
    const cur = skuMatrixData[x.category][x.subCategory][x.sku] || { rev: 0, excRev: 0, units: 0, orders: 0 }
    cur.rev += x.rev || 0; cur.excRev += x.excRev || 0; cur.units += x.units || 0; cur.orders += x.orders || 0
    skuMatrixData[x.category][x.subCategory][x.sku] = cur
  })

  const totalRev = rev
  const pct = (a, b) => b > 0 ? `${(a / b * 100).toFixed(1)}%` : '—'
  const cnPct = grossRev > 0 ? cnRevAbs / grossRev * 100 : 0

  const subLabel = sub !== 'all' ? ` · ${SUB_OPTIONS.find(o => o.id === sub)?.label || sub}` : ''

  const [offTrendGroup, setOffTrendGroup] = useState('daily')
  const [offTrendMetric, setOffTrendMetric] = useState('rev')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPI Hero + grid */}
      <div className="sales-kpi-section" style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        <div className="kpi-card sales-kpi-hero" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue Inc GST{subLabel}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(rev)}</div>
            {revChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: revChg >= 0 ? C.green.bg : C.red.bg, color: revChg >= 0 ? C.green.tx : C.red.tx }}>{revChg >= 0 ? '▲' : '▼'} {Math.abs(revChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{nDays} days · {fmtN(nOrders)} orders · {fmtN(qty)} units</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="offGrossGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0D9E68" stopOpacity={0.25} /><stop offset="95%" stopColor="#0D9E68" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke="#0D9E68" strokeWidth={2} fill="url(#offGrossGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} /><span style={{ color: C.t2 }}>{p.name}: {fmt(p.value)}</span></div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="sales-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 10, alignItems: 'stretch' }}>
          {[
            { label: 'Net Revenue', value: fmt(netRev), sub: 'Ex. credit notes', badge: chgBadge(netRev, prevNetRev) },
            { label: 'GST', value: fmt(gstCollected), sub: 'On net sales', badge: chgBadge(gstCollected, (prevGrossRev - prevCnRev) - prevNetRev) },
            { label: 'Daily Avg Rev', value: fmt(rev / Math.max(nDays, 1)), sub: `over ${nDays} days`, badge: chgBadge(rev / Math.max(nDays, 1), prevGrossRev / Math.max(nDays, 1)) },
            { label: 'AOV', value: `₹${Math.round(nOrders ? grossRev / nOrders : 0).toLocaleString('en-IN')}`, sub: 'Gross ÷ orders', badge: chgBadge(nOrders ? grossRev / nOrders : 0, prevOrders ? prevGrossRev / prevOrders : 0) },
            { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ units', badge: chgBadge(asp, prevUnits > 0 ? prevGrossRev / prevUnits : 0) },
            { label: 'Orders', value: fmtN(nOrders), sub: `${fmtN(qty)} units`, badge: chgBadge(nOrders, prevOrders) },
            { label: 'Units / Order', value: nOrders ? Math.round(qty / nOrders).toLocaleString('en-IN') : '0', sub: 'Avg units per order', badge: chgBadge(nOrders ? qty / nOrders : 0, prevOrders ? prevUnits / prevOrders : 0) },
            { label: 'Credit Notes %', value: `${cnPct.toFixed(1)}%`, sub: `${fmt(cnRevAbs)} · ${fmtN(cnOrders)} orders`, accent: cnPct > 10 ? '#7A1A1A' : undefined, badge: chgBadge(cnRevAbs, prevCnRev) },
          ].map(k => (
            <div key={k.label} className="kpi-card" style={{ padding: '10px 13px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="kpi-label">{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <div className="kpi-value" style={{ fontSize: 17, ...(k.accent ? { color: k.accent } : {}) }}>{k.value}</div>{k.badge}
              </div>
              {k.sub && <div className="kpi-sub">{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Revenue & Returns Trend + Category Revenue + Geography Breakdown side by side */}
      {(() => {
        const grouped = (() => {
          if (offTrendGroup === 'daily') return dailyArr
          const buckets = {}
          dailyArr.forEach(d => {
            const dt = new Date(d.date)
            let key
            if (offTrendGroup === 'weekly') { const day = dt.getDay(), diff = dt.getDate() - day + (day === 0 ? -6 : 1); key = new Date(new Date(d.date).setDate(diff)).toISOString().slice(0, 10) }
            else if (offTrendGroup === 'monthly') { key = d.date.slice(0, 7) }
            else { key = `${d.date.slice(0, 4)}-Q${Math.ceil(parseInt(d.date.slice(5, 7)) / 3)}` }
            if (!buckets[key]) buckets[key] = { date: key, rev: 0, net: 0, cnRev: 0, orders: 0, units: 0 }
            buckets[key].rev += d.rev; buckets[key].net += d.net; buckets[key].cnRev += d.cnRev || 0
            buckets[key].orders += d.orders; buckets[key].units += d.units
          })
          return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date))
        })()
        const isRev = offTrendMetric === 'rev', isOrders = offTrendMetric === 'orders'
        const xFmt = d => offTrendGroup === 'daily' ? d?.slice(5) : offTrendGroup === 'monthly' ? d?.slice(0, 7) : d
        const yFmt = v => isRev ? (v >= 1e5 ? `${(v/1e5).toFixed(1)}L` : fmt(v)) : fmtN(v)
        const btnSt = k => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${offTrendMetric===k?C.t1:C.border}`, background: offTrendMetric===k?C.t1:'transparent', color: offTrendMetric===k?'#fff':C.t2, cursor: 'pointer', fontFamily: 'var(--font)' })
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.65fr', gap: 14, alignItems: 'start' }}>
            <Card fill title="Revenue & Returns Trend" style={{ height: 360, alignSelf: 'start' }} note={sub !== 'all' ? SUB_OPTIONS.find(o => o.id === sub)?.label : undefined} action={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['rev','Revenue'],['orders','Orders'],['units','Units']].map(([k,l]) => <button key={k} style={btnSt(k)} onClick={() => setOffTrendMetric(k)}>{l}</button>)}
                </div>
                <select value={offTrendGroup} onChange={e => setOffTrendGroup(e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
                  {['daily','weekly','monthly','quarterly'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
                </select>
              </div>
            }>
              <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                <ComposedChart data={grouped} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={xFmt} />
                  <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={yFmt} width={60} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, color: C.t2 }}>{xFmt(label)}</div>
                      {payload.map(p => (
                        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ color: C.t2 }}>{p.name}: {isRev ? fmt(p.value) : fmtN(p.value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {isRev ? (<>
                    <Area type="monotone" dataKey="rev" name="Gross Revenue" stroke="#FFD600" fill="#FFD60022" strokeWidth={2} dot={grouped.length <= 3} />
                    <Area type="monotone" dataKey="net" name="Net Revenue" stroke="#0D9E68" fill="#0D9E6811" strokeWidth={2} dot={grouped.length <= 3} strokeDasharray="4 2" />
                  </>) : isOrders ? (
                    <Area type="monotone" dataKey="orders" name="Orders" stroke="#FFD600" fill="#FFD60022" strokeWidth={2} dot={grouped.length <= 3} />
                  ) : (
                    <Area type="monotone" dataKey="units" name="Units" stroke="#FFD600" fill="#FFD60022" strokeWidth={2} dot={grouped.length <= 3} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
            <CategoryRevenueCard
              catRows={catRows}
              subCatRows={allSubCatRows}
              skuMap={skuMatrixData}
              totalRev={totalRev}
              view={catRevView}
              setView={setCatRevView}
              selectedName={selectedCat}
              onSelectCategory={name => setSelectedCat(prev => prev === name ? null : name)}
              height={360}
            />
            <GeoToggleDonutCard regionRows={regionRows} tierRows={tierRows} boxHeight={360} />
          </div>
        )
      })()}

      {/* Category Revenue Matrix — Gross / Units / ASP / GST / Net only (no returns/cancel/rto/cir/exch — offline distribution has no such concept, Credit Notes are tracked separately at the KPI level) */}
      <FlatCategoryProductMatrix catData={catMatrixData} subCatData={subCatMatrixData} skuData={skuMatrixData} title={`Category Revenue Matrix · Offline${subLabel}`} catPrevMap={catPrevMap} subCatPrevMap={subCatPrevMap} noReturns />

      {/* Top States + Top Cities */}
      <div className="g-2" style={{ alignItems: 'stretch' }}>
        <ShopifyGeoRichTable title="Top States" rows={stateRows} firstKey="state" firstLabel="State" formatFirst={v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v} showRTO={false} showAOV={true} showASP={false} />
        <ShopifyGeoRichTable title="Top Cities" rows={cityRows} firstKey="city" firstLabel="City" formatFirst={v => v ? v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : v} showRTO={false} showAOV={true} showASP={false} />
      </div>
    </div>
  )
}

// International Sales tab — placeholder only. Channel='International' rows (Amazon
// International + Shopify International sub-brands, unified under one Channel by the 2026-08
// schema change) don't have a Sales-tab breakdown built yet; see PnL tab's "International" tab
// for the real KPI/Financial View treatment already built on this data.
function InternationalPlaceholderTab() {
  return (
    <div className="kpi-card" style={{ padding: '40px 24px', textAlign: 'center', color: C.t3, fontSize: 13 }}>
      International Sales — calculation pending
    </div>
  )
}

function ChannelTab({ data, channel, filters, setFilters, channelView, setChannelView }) {
  if (channel === 'Shopify') return <ShopifyTab data={data} filters={filters} setFilters={setFilters} />
  if (channel === 'Amazon') return <AmazonTab data={data} channelView={channelView} setChannelView={setChannelView} />
  if (channel === 'Flipkart') return <FlipkartTab data={data} />
  if (channel === 'Blinkit') return <BlinkitTab data={data} />
  if (channel === 'Instamart') return <InstaTab data={data} />
  if (channel === 'Zepto') return <ZeptoTab data={data} />
  if (channel === 'CRED') return <CredTab data={data} />
  if (channel === 'Firstcry') return <FirstcryTab data={data} />
  if (channel === 'Myntra') return <MyntraTab data={data} />
  if (channel === 'International') return <InternationalPlaceholderTab />
  const chOrders = data.orders.filter(o => o.channel === channel)
  const chRows = data.rows.filter(r => r.Channel === channel)
  const rev = chOrders.reduce((s, o) => s + o.rev, 0)
  const nOrders = chOrders.length
  const aov = nOrders ? rev / nOrders : 0
  const qty = chOrders.reduce((s, o) => s + o.qty, 0)
  const catMap = {}
  chRows.forEach(r => {
    const cat = r.Category || 'Others'
    if (!catMap[cat]) catMap[cat] = { rev: 0, orders: new Set(), units: 0 }
    catMap[cat].rev += parseFloat(r.SellingPrice_Inc_GST || 0); catMap[cat].orders.add(r.OrderId); catMap[cat].units += parseInt(r.ItemQty || 0)
  })
  const catRows = Object.entries(catMap).map(([k, v]) => ({ name: k, rev: v.rev, orders: v.orders.size, units: v.units, aov: v.orders.size ? v.rev / v.orders.size : 0 })).sort((a, b) => b.rev - a.rev)
  const dailyMap = {}
  chOrders.forEach(o => { if (!dailyMap[o.date]) dailyMap[o.date] = { date: o.date, rev: 0, orders: 0 }; dailyMap[o.date].rev += o.rev; dailyMap[o.date].orders += 1 })
  const dailyArr = Object.values(dailyMap).sort((a, b) => a.date?.localeCompare(b.date))
  const statusCounts = {}
  chOrders.forEach(o => { const s = o.orderStatus || 'Unknown'; statusCounts[s] = (statusCounts[s] || 0) + 1 })

  const chExcRev = chRows.reduce((s, r) => s + parseFloat(r.SellingPrice_Exc_GST || 0), 0)
  const grossMarginPct = rev > 0 ? ((rev - chExcRev) / rev * 100) : 0
  const revPerUnit = qty > 0 ? rev / qty : 0
  const chRTORev = channel === 'Shopify' ? chOrders.filter(o => o.isRTO).reduce((s, o) => s + o.rev, 0) + chOrders.filter(o => o.isCancelled).reduce((s, o) => s + o.rev, 0) + (data.cirRev || 0) : 0
  const deliveredCh = chOrders.filter(o => o.orderStatus === 'Delivered').length
  const rtoCh = chOrders.filter(o => o.orderStatus === 'RTO' || o.isRTO).length
  const cancelCh = chOrders.filter(o => o.orderStatus === 'Cancelled' || o.isCancelled).length
  const fulfilBase = deliveredCh + rtoCh + cancelCh
  const fulfilRate = fulfilBase > 0 ? (deliveredCh / fulfilBase * 100) : 0
  const upo = nOrders > 0 ? qty / nOrders : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="sales-channel-kpis">
      <div className="g-kpi5">
        <KPICard label="Revenue" value={fmt(rev)} />
        <KPICard label="Orders" value={fmtN(nOrders)} />
        <KPICard label="AOV" value={`₹${Math.round(aov).toLocaleString('en-IN')}`} />
        <KPICard label="Units" value={fmtN(qty)} />
        <KPICard label="Daily Avg" value={fmt(rev / (data.nDays || 1))} />
      </div>
      <div className="g-kpi3">
        <KPICard label="Revenue per Unit" value={`₹${Math.round(revPerUnit).toLocaleString('en-IN')}`} sub="Avg price per SKU" />
        <KPICard label="Revenue at Risk" value={channel === 'Shopify' ? fmt(chRTORev) : 'N/A'} sub="RTO + Cancelled + CIR" accent={chRTORev > 0 ? '#7A4000' : undefined} />
        <KPICard label="Units per Order" value={upo.toFixed(2)} sub="Avg basket size" />
      </div>
      </div>
      <div className="g-2">
        <Card title={`${channel} Daily Revenue`}>
          <AreaTrendChart data={dailyArr} color={C.ch[channel] || C.acc} />
        </Card>
        <Card title="Order Status">
          {Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([s, count]) => {
            const clr = { Delivered: C.green.tx, Dispatched: C.blue.tx, RTO: C.amber.tx, Cancelled: C.red.tx }[s] || C.acm
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 11.5, color: C.t2, width: 90 }}>{s}</span>
                <div style={{ flex: 1, height: 5, background: C.bg, borderRadius: 3 }}><div style={{ height: '100%', borderRadius: 3, background: clr, width: `${(count / nOrders) * 100}%` }} /></div>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t1, minWidth: 40, textAlign: 'right' }}>{fmtN(count)}</span>
                <span style={{ fontSize: 11, color: C.t3, minWidth: 34, textAlign: 'right' }}>{pct(count, nOrders)}</span>
              </div>
            )
          })}
        </Card>
      </div>
      <Card title="Category Breakdown">
        <DataTable columns={[{ key: 'name', label: 'Category' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }]} rows={catRows} storageKey="datatable-cols:qc-category" />
      </Card>
      <Card title="Daily Performance">
        <DataTable columns={[{ key: 'date', label: 'Date' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: (_, r) => r.orders ? `₹${Math.round(r.rev / r.orders).toLocaleString('en-IN')}` : '—' }]} rows={dailyArr} storageKey="datatable-cols:qc-daily" />
      </Card>
    </div>
  )
}

function QCTab({ data }) {
  const qcChs = ['Blinkit', 'Instamart', 'Zepto']
  const qcOrders = data.orders.filter(o => qcChs.includes(o.channel))
  const qcRev = qcOrders.reduce((s, o) => s + o.rev, 0)
  const nOrds = qcOrders.length
  const aov = nOrds ? qcRev / nOrds : 0
  const best = qcChs.reduce((b, ch) => { const r = data.chMap[ch]?.rev || 0; return r > b.rev ? { ch, rev: r } : b }, { ch: '', rev: 0 })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="g-kpi5">
        <KPICard label="QC Revenue" value={fmt(qcRev)} />
        <KPICard label="Orders" value={fmtN(nOrds)} />
        <KPICard label="Blended AOV" value={`₹${Math.round(aov).toLocaleString('en-IN')}`} />
        <KPICard label="Best Platform" value={best.ch} sub={fmt(best.rev)} />
        <KPICard label="QC Rev Share" value={pct(qcRev, data.totalRev)} />
      </div>
      <div className="g-3">
        {qcChs.map(ch => {
          const chRows = data.rows.filter(r => r.Channel === ch)
          const chOrd = data.chMap[ch] || { rev: 0, orders: 0 }
          const prodMap = {}
          chRows.forEach(r => { const p = r.ProductId || 'Unknown'; if (!prodMap[p]) prodMap[p] = { rev: 0, qty: 0 }; prodMap[p].rev += parseFloat(r.SellingPrice_Inc_GST || 0); prodMap[p].qty += parseInt(r.ItemQty || 0) })
          return (
            <Card key={ch} title={ch} note={`${fmt(chOrd.rev)} · ${fmtN(chOrd.orders)} orders`}>
              <DataTable columns={[{ key: 'sku', label: 'SKU' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'qty', label: 'Qty', align: 'right', render: v => fmtN(v) }]} rows={Object.entries(prodMap).map(([k, v]) => ({ sku: k, ...v })).sort((a, b) => b.rev - a.rev).slice(0, 15)} maxRows={15} storageKey="datatable-cols:qc-top-skus" />
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function OpsTab({ data }) {
  const tatArr = data.tatOrders
  const avgTAT = tatArr.length ? tatArr.reduce((a, b) => a + b, 0) / tatArr.length : 0
  const delayed = tatArr.filter(d => d > 7).length
  const statusCounts = data.orderStatusMap || {}
  const tatBuckets = [{ label: 'Same day', min: 0, max: 0 }, { label: '1-2 days', min: 1, max: 2 }, { label: '3-5 days', min: 3, max: 5 }, { label: '6-7 days', min: 6, max: 7 }, { label: '8-14 days', min: 8, max: 14 }, { label: '15+ days', min: 15, max: Infinity }].map(b => ({ ...b, count: tatArr.filter(d => d >= b.min && d <= b.max).length }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="g-kpi5">
        <KPICard label="Avg Delivery TAT" value={`${avgTAT.toFixed(1)}d`} />
        <KPICard label="Orders Tracked" value={fmtN(tatArr.length)} />
        <KPICard label="Delayed >7d" value={fmtN(delayed)} sub={tatArr.length ? pct(delayed, tatArr.length) : '—'} />
        <KPICard label="Total Orders" value={fmtN(data.nOrders)} />
        <KPICard label="Cities Covered" value={fmtN(Object.values(data.stateMap || {}).reduce((s, v) => s + (v.cities?.size || 0), 0))} />
      </div>
      <div className="g-2">
        <Card title="Order Status">
          {Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([s, count]) => {
            const clr = { Delivered: C.green.tx, Dispatched: C.blue.tx, RTO: C.amber.tx, Cancelled: C.red.tx }[s] || C.acm
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 11.5, color: C.t2, width: 90 }}>{s}</span>
                <div style={{ flex: 1, height: 5, background: C.bg, borderRadius: 3 }}><div style={{ height: '100%', borderRadius: 3, background: clr, width: `${(count / data.nOrders) * 100}%` }} /></div>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t1, minWidth: 48, textAlign: 'right' }}>{fmtN(count)}</span>
              </div>
            )
          })}
        </Card>
        <Card title="TAT Distribution">
          <DataTable columns={[{ key: 'label', label: 'Bucket' }, { key: 'count', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'pct', label: '%', render: (_, r) => pct(r.count, tatArr.length) }]} rows={tatBuckets} storageKey="datatable-cols:ops-tat-buckets" />
        </Card>
      </div>
    </div>
  )
}

function CXTab({ data }) {
  const { nCusts, repeatCusts, voucherMap, nOrders, orders } = data
  const repeatRate = nCusts ? (repeatCusts / nCusts * 100).toFixed(1) : '0'
  const freqMap = orders.reduce((acc, o) => { if (o.customerId) acc[o.customerId] = (acc[o.customerId] || 0) + 1; return acc }, {})
  const buyers2x = Object.values(freqMap).filter(n => n >= 2).length
  const buyers3x = Object.values(freqMap).filter(n => n >= 3).length
  const voucherOrders = orders.filter(o => o.voucher).length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="g-kpi5">
        <KPICard label="Unique Customers" value={fmtN(nCusts)} />
        <KPICard label="Repeat Rate" value={`${repeatRate}%`} />
        <KPICard label="2× Buyers" value={fmtN(buyers2x)} />
        <KPICard label="3×+ Buyers" value={fmtN(buyers3x)} />
        <KPICard label="Voucher Penetration" value={pct(voucherOrders, nOrders)} />
      </div>
      <Card title="Voucher Analysis">
        <DataTable columns={[{ key: 'type', label: 'Type' }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }]}
          rows={Object.entries(voucherMap).map(([k, v]) => ({ type: k, orders: v.orders, rev: v.rev, aov: v.orders ? v.rev / v.orders : 0 })).sort((a, b) => b.rev - a.rev)} storageKey="datatable-cols:cx-voucher-analysis" />
      </Card>
    </div>
  )
}

// Filter icon + popover — replaces the always-visible Category/Sub-category/SKU/Payment Type/
// Voucher dropdown row with a single icon on the right of the toggle bar; clicking it opens the
// same set of filters in a floating box. `children` are the filter controls to render inside —
// callers (SalesPage) decide which controls apply per active channel (e.g. Payment Types/Vouchers
// only render for Shopify), same conditional logic the old always-visible row already used.
function FilterIconPopover({ children, activeCount }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0, marginLeft: 'auto' }}>
      <button onClick={() => setOpen(o => !o)} title="Filters" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 7, border: `1px solid ${activeCount > 0 ? C.acm : C.border}`, background: activeCount > 0 ? '#FFF9CC' : C.card, color: C.t1, cursor: 'pointer' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" /></svg>
        Filters
        {activeCount > 0 && <span style={{ background: C.acm, color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px', minWidth: 16, textAlign: 'center' }}>{activeCount}</span>}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 200, background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, boxShadow: '0 8px 28px rgba(0,0,0,.14)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 260, maxHeight: '70vh', overflowY: 'auto' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function SalesPage({ data, filters, setFilters, activeTab, setActiveTab, fetchData, channelView, setChannelView, offlineSub, setOfflineSub }) {
  const filteredData = data

  const cats = useMemo(() => Object.keys(data?.catMap || {}).filter(Boolean).sort(), [data])
  const subCats = useMemo(() => {
    const all = Object.entries(data?.subCatMap || {})
    const cats = filters.category?.length > 0 ? filters.category : null
    const filtered = cats ? all.filter(([k]) => cats.includes(k.split('::')[0])) : all
    return [...new Set(filtered.map(([k]) => k.split('::')[1]).filter(Boolean))].sort()
  }, [data, filters.category])
  const stateOpts = useMemo(() => Object.keys(data?.stateMap || {}).filter(s => s && s.trim() !== '-').map(s => s === 'OTHERS' ? 'Others' : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).sort(), [data])
  const skuOpts = useMemo(() => data?.masterSkuList || [], [data])
  const paymentTypeOpts = useMemo(() => (data?.shopify?.paymentTypes || []).map(p => p.paymentType).filter(Boolean), [data])

  // Per-channel toggle slot — add a new channel's toggle here as its own one-line entry. Channels
  // with no toggle fall back to a plain label (the channel's own tab name) instead of leaving this
  // side of the bar empty, so the row doesn't look like an accidental gap under the tab bar.
  const channelToggle = activeTab === 'shopify' ? <D2CSubChannelToggle data={data} filters={filters} setFilters={setFilters} />
    : activeTab === 'amazon' ? <AmazonChannelViewToggle channelView={channelView} setChannelView={setChannelView} />
    : activeTab === 'offline' ? <OfflineSubToggle sub={offlineSub} setSub={setOfflineSub} />
    : <span style={{ fontSize: 13, fontWeight: 700, color: C.t2 }}>{TABS.find(t => t.id === activeTab)?.label || ''}</span>

  const activeFilterCount = (filters.category?.length || 0) + (filters.subCategory?.length || 0) + (filters.sku?.length || 0)
    + (filters.paymentType ? filters.paymentType.split(',').filter(Boolean).length : 0)
    + (filters.voucher ? filters.voucher.split(',').filter(Boolean).length : 0)

  if (!filteredData) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div className="sales-tabs">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); setChannelView('all'); setOfflineSub('all'); setFilters(f => ({ ...f, subChannel: '', voucher: '', channelGroup: [], category: [], subCategory: [], sku: [], paymentType: '' })) }} className={`stab${activeTab === tab.id ? ' active' : ''}`} style={tab.id === 'all' ? { fontWeight: activeTab === 'all' ? 800 : 700, fontSize: 13 } : {}}>
            {tab.logo && <img src={tab.logo} alt="" style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, objectFit: 'contain', filter: tab.id === 'cred' ? 'invert(1)' : 'none' }} />}
            {tab.label}
          </button>
        ))}
      </div>
      {/* Fixed bar: per-channel toggle on the left, filter icon on the right */}
      <div className="fbar">
        <div className="fbar-inner" style={{ width: '100%', justifyContent: 'space-between' }}>
          <div>{channelToggle}</div>
          <FilterIconPopover activeCount={activeFilterCount}>
            <SearchableSelect multi options={cats} value={filters.category || []} onChange={v => setFilters(f => ({ ...f, category: v, subCategory: [] }))} placeholder="All Categories" />
            <SearchableSelect multi options={subCats} value={filters.subCategory || []} onChange={v => setFilters(f => ({ ...f, subCategory: v }))} placeholder="All Sub-categories" dropdownWidth={320} />
            <SearchableSelect multi options={skuOpts} value={filters.sku || []} onChange={v => setFilters(f => ({ ...f, sku: v }))} placeholder="All SKUs" dropdownWidth={280} />
            {activeTab === 'shopify' && paymentTypeOpts.length > 0 && (
              <SearchableSelect multi options={paymentTypeOpts} value={(filters.paymentType ? filters.paymentType.split(',').map(x => x.trim()).filter(Boolean) : [])} onChange={v => setFilters(f => ({ ...f, paymentType: v.join(',') }))} placeholder="All Payment Types" dropdownWidth={220} />
            )}
            {activeTab === 'shopify' && <VoucherDropdown voucherList={data?.voucherList || []} selected={filters.voucher} onChange={v => setFilters(f => ({ ...f, voucher: v }))} />}
            <button onClick={() => setFilters(f => ({ ...f, category: [], subCategory: [], sku: [], subChannel: '', voucher: '', region: [], tier: [], state: [], city: '', channelGroup: [] }))} className="fclr">✕ Clear</button>
          </FilterIconPopover>
        </div>
      </div>
      {/* Content */}
      <div className="page-scroll">
        {activeTab === 'all' && <AllTab data={filteredData} rangeStart={filters.start} rangeEnd={filters.end} />}
        {activeTab === 'shopify' && <ChannelTab data={filteredData} channel="Shopify" filters={filters} setFilters={setFilters} />}
        {activeTab === 'ebo' && <EBOTab data={filteredData} rangeStart={filters.start} rangeEnd={filters.end} />}
        {activeTab === 'amazon' && <ChannelTab data={filteredData} channel="Amazon" channelView={channelView} setChannelView={setChannelView} />}
        {activeTab === 'flipkart' && <ChannelTab data={filteredData} channel="Flipkart" />}
        {activeTab === 'blinkit' && <ChannelTab data={filteredData} channel="Blinkit" />}
        {activeTab === 'cred' && <ChannelTab data={filteredData} channel="CRED" />}
        {activeTab === 'firstcry' && <ChannelTab data={filteredData} channel="Firstcry" />}
        {activeTab === 'instamart' && <ChannelTab data={filteredData} channel="Instamart" />}
        {activeTab === 'zepto' && <ChannelTab data={filteredData} channel="Zepto" />}
        {activeTab === 'myntra' && <ChannelTab data={filteredData} channel="Myntra" />}
        {activeTab === 'international' && <ChannelTab data={filteredData} channel="International" />}
        {activeTab === 'offline' && <OfflineTab data={filteredData} sub={offlineSub} setSub={setOfflineSub} />}
        {activeTab === 'qc' && <QCTab data={filteredData} />}
        {activeTab === 'ops' && <OpsTab data={filteredData} />}
        {activeTab === 'cx' && <CXTab data={filteredData} />}
      </div>
    </div>
  )
}

// ── Intelligence Page ─────────────────────────────────────────
function IntelCard({ color, label, number, sub, insight, bars, table, warning }) {
  const gradients = {
    red: 'linear-gradient(90deg,#E24B4A,#F08080)',
    green: 'linear-gradient(90deg,#2D9A50,#6ED98A)',
    blue: 'linear-gradient(90deg,#2E74CC,#7AB4EE)',
    amber: 'linear-gradient(90deg,#CC8A00,#F5C460)',
    purple: 'linear-gradient(90deg,#4843B2,#AAA6E6)',
    pink: 'linear-gradient(90deg,#CC4078,#F09BC0)',
  }
  const colors = {
    red: { bg: '#FDE8E8', tx: '#7A1A1A' }, green: { bg: '#E6F4E0', tx: '#286010' },
    blue: { bg: '#E1EFFD', tx: '#184078' }, amber: { bg: '#FEF2DC', tx: '#7A4000' },
    purple: { bg: '#EDECFB', tx: '#4843B2' }, pink: { bg: '#FDE8F3', tx: '#7A1050' },
  }
  const cc = colors[color] || colors.blue
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: '13px 13px 0 0', background: gradients[color] }} />
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: C.t3, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-.03em', marginBottom: 4, color: C.t1 }}>{number}</div>
      <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.6, marginBottom: 10 }}>{sub}</div>
      {warning && <div style={{ fontSize: 11.5, padding: '6px 10px', borderRadius: 7, background: cc.bg, color: cc.tx, marginBottom: 10, fontWeight: 500 }}>⚠ {warning}</div>}
      {bars && bars.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {bars.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 11, color: C.t2, width: 90, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label}</span>
              <div style={{ flex: 1, height: 5, background: C.bg, borderRadius: 3 }}>
                <div style={{ height: '100%', borderRadius: 3, background: cc.tx, width: `${b.pct}%` }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.t1, fontFamily: 'var(--mono)', minWidth: 52, textAlign: 'right' }}>{b.value}</span>
              <span style={{ fontSize: 10, color: C.t3, minWidth: 30, textAlign: 'right' }}>{b.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
      {insight && (
        <div style={{ background: C.acl, border: `1px solid ${C.acm}`, borderRadius: 8, padding: '9px 11px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#7A6000', marginBottom: 4 }}>◈ Insight</div>
          <div style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.65 }} dangerouslySetInnerHTML={{ __html: insight }} />
        </div>
      )}
    </div>
  )
}

function IntelPage({ data }) {
  if (!data) return (
    <div style={{ padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{ fontSize: 40 }}>◈</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.t1 }}>Intelligence Engine</div>
      <div style={{ fontSize: 12, color: C.t3 }}>Load a date range to generate insights</div>
    </div>
  )

  const { orders, rows, nOrders, nCusts, repeatCusts, totalRev, totalExcRev, chMap, catMap, stateMap, voucherMap, dailyArr, nDays, uniqueDates } = data

  const repeatRate = nCusts ? (repeatCusts / nCusts * 100) : 0
  const freqMap = orders.reduce((acc, o) => { if (o.customerId) acc[o.customerId] = (acc[o.customerId] || 0) + 1; return acc }, {})
  const buyers2x = Object.values(freqMap).filter(n => n >= 2).length
  const buyers3x = Object.values(freqMap).filter(n => n >= 3).length
  const lostRevIfRepeat10 = nCusts > 0 ? ((0.10 - repeatRate / 100) * nCusts * (totalRev / nOrders)) : 0

  const qcChs = ['Blinkit', 'Instamart', 'Zepto']
  const qcRev = qcChs.reduce((s, c) => s + (chMap[c]?.rev || 0), 0)
  const qcOrds = qcChs.reduce((s, c) => s + (chMap[c]?.orders || 0), 0)
  const qcAOV = qcOrds ? qcRev / qcOrds : 0
  const blendedAOV = nOrders ? totalRev / nOrders : 0
  const qcBars = qcChs.filter(c => chMap[c]).map(c => ({ label: c, value: fmt(chMap[c].rev), pct: qcRev ? chMap[c].rev / qcRev * 100 : 0 }))

  const voucherOrders = orders.filter(o => o.voucher)
  const voucherRev = voucherOrders.reduce((s, o) => s + o.rev, 0)
  const noVoucherRev = orders.filter(o => !o.voucher).reduce((s, o) => s + o.rev, 0)
  const noVoucherOrds = orders.filter(o => !o.voucher).length
  const voucherAOV = voucherOrders.length ? voucherRev / voucherOrders.length : 0
  const noVoucherAOV = noVoucherOrds ? noVoucherRev / noVoucherOrds : 0
  const aovDrag = noVoucherAOV - voucherAOV
  const voucherBars = Object.entries(voucherMap).sort((a, b) => b[1].rev - a[1].rev).slice(0, 5).map(([k, v]) => ({ label: k, value: fmt(v.rev), pct: totalRev ? v.rev / totalRev * 100 : 0 }))

  const shopifyOrders = orders.filter(o => o.channel === 'Shopify')
  const rtoOrders = shopifyOrders.filter(o => o.isRTO)
  const cirOrders = shopifyOrders.filter(o => o.isCIR)
  const cancelOrders = shopifyOrders.filter(o => o.isCancelled)
  const rtoRate = shopifyOrders.length ? rtoOrders.length / shopifyOrders.length * 100 : 0
  const cirRate = shopifyOrders.length ? cirOrders.length / shopifyOrders.length * 100 : 0
  const returnBars = [
    { label: 'RTO', value: fmtN(rtoOrders.length), pct: shopifyOrders.length ? rtoOrders.length / shopifyOrders.length * 100 : 0 },
    { label: 'CIR Return', value: fmtN(cirOrders.length), pct: shopifyOrders.length ? cirOrders.length / shopifyOrders.length * 100 : 0 },
    { label: 'Cancelled', value: fmtN(cancelOrders.length), pct: shopifyOrders.length ? cancelOrders.length / shopifyOrders.length * 100 : 0 },
  ]

  const sortedByRev = [...orders].sort((a, b) => b.rev - a.rev)
  const top1pct = Math.ceil(nOrders * 0.01)
  const top10pct = Math.ceil(nOrders * 0.10)
  const top1rev = sortedByRev.slice(0, top1pct).reduce((s, o) => s + o.rev, 0)
  const top10rev = sortedByRev.slice(0, top10pct).reduce((s, o) => s + o.rev, 0)
  const paretoBars = [
    { label: `Top 1% (${fmtN(top1pct)} ord)`, value: fmt(top1rev), pct: totalRev ? top1rev / totalRev * 100 : 0 },
    { label: `Top 10% (${fmtN(top10pct)} ord)`, value: fmt(top10rev), pct: totalRev ? top10rev / totalRev * 100 : 0 },
    { label: 'Bottom 50%', value: fmt(sortedByRev.slice(Math.ceil(nOrders * 0.5)).reduce((s, o) => s + o.rev, 0)), pct: totalRev ? sortedByRev.slice(Math.ceil(nOrders * 0.5)).reduce((s, o) => s + o.rev, 0) / totalRev * 100 : 0 },
  ]

  const topCats = Object.entries(catMap).sort((a, b) => b[1].rev - a[1].rev).slice(0, 5)
  const catGaps = topCats.map(([cat, v]) => {
    const catRows = rows.filter(r => r.Category === cat)
    const presentChs = new Set(catRows.map(r => r.Channel))
    const missingQC = qcChs.filter(c => !presentChs.has(c))
    return { cat, rev: v.rev, missing: missingQC }
  }).filter(g => g.missing.length > 0)

  const mid = Math.floor(uniqueDates.length / 2)
  const fhDates = new Set(uniqueDates.slice(0, mid))
  const lhDates = new Set(uniqueDates.slice(mid))
  const fhRev = orders.filter(o => fhDates.has(o.date)).reduce((s, o) => s + o.rev, 0)
  const lhRev = orders.filter(o => lhDates.has(o.date)).reduce((s, o) => s + o.rev, 0)
  const trendPct = fhRev > 0 ? ((lhRev - fhRev) / fhRev * 100) : 0

  const gstCollected = totalRev - totalExcRev
  const topStates = Object.entries(stateMap).sort((a, b) => b[1].rev - a[1].rev).slice(0, 5).map(([k, v]) => ({ label: k, value: fmt(v.rev), pct: totalRev ? v.rev / totalRev * 100 : 0 }))

  const multiItem = orders.filter(o => o.items > 1)
  const multiItemAOV = multiItem.length ? multiItem.reduce((s, o) => s + o.rev, 0) / multiItem.length : 0
  const singleItemAOV = orders.filter(o => o.items === 1).length ? orders.filter(o => o.items === 1).reduce((s, o) => s + o.rev, 0) / orders.filter(o => o.items === 1).length : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Summary strip */}
      <div className="g-intel">
        {[
          { label: 'Gross Revenue Inc GST', val: fmt(totalRev) },
          { label: 'GST', val: fmt(gstCollected) },
          { label: 'Repeat Rate', val: `${repeatRate.toFixed(1)}%`, warn: repeatRate < 10 },
          { label: 'QC Share', val: pct(qcRev, totalRev) },
          { label: 'Voucher Orders', val: pct(voucherOrders.length, nOrders) },
          { label: 'Trend (½ period)', val: `${trendPct > 0 ? '+' : ''}${trendPct.toFixed(1)}%`, warn: trendPct < -10 },
        ].map((s, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 11, padding: '11px 13px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: C.t3, marginBottom: 5 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.warn ? '#7A1A1A' : C.t1 }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div className="g-2">
        <IntelCard color="red" label="Customer Retention Crisis"
          number={`${repeatRate.toFixed(1)}%`}
          sub={`${fmtN(repeatCusts)} of ${fmtN(nCusts)} customers ever reordered · ${fmtN(buyers2x)} bought 2×, ${fmtN(buyers3x)} bought 3×+`}
          warning={repeatRate < 10 ? `Improving to 10% = est. +${fmt(Math.abs(lostRevIfRepeat10))} revenue with zero acquisition cost` : undefined}
          bars={[
            { label: '1× buyers', value: fmtN(nCusts - repeatCusts), pct: nCusts ? (nCusts - repeatCusts) / nCusts * 100 : 0 },
            { label: '2× buyers', value: fmtN(buyers2x), pct: nCusts ? buyers2x / nCusts * 100 : 0 },
            { label: '3×+ buyers', value: fmtN(buyers3x), pct: nCusts ? buyers3x / nCusts * 100 : 0 },
          ]}
          insight={`<strong>${(100 - repeatRate).toFixed(1)}%</strong> of customers never came back. Post-purchase email sequence + PLM loyalty codes are the fastest lever. Target: get 1× buyers to 2× within 90 days.`}
        />
        <IntelCard color="green" label="Q-Commerce Opportunity"
          number={fmt(qcRev)}
          sub={`${fmtN(qcOrds)} orders · AOV ₹${Math.round(qcAOV).toLocaleString('en-IN')} vs blended ₹${Math.round(blendedAOV).toLocaleString('en-IN')} — ${(qcAOV / blendedAOV).toFixed(1)}× brand average`}
          bars={qcBars}
          insight={`Q-commerce AOV is <strong>${(qcAOV / blendedAOV).toFixed(1)}× higher</strong> than blended. ${catGaps.length > 0 ? `<strong>${catGaps.map(g => g.cat).join(', ')}</strong> have zero QC presence — biggest untapped gap.` : 'Expand top SKUs to all 3 platforms.'}`}
        />
      </div>

      <div className="g-2">
        <IntelCard color="amber" label="Voucher & Discount Drag"
          number={pct(voucherOrders.length, nOrders)}
          sub={`${fmtN(voucherOrders.length)} orders used vouchers · AOV with voucher ₹${Math.round(voucherAOV).toLocaleString('en-IN')} vs ₹${Math.round(noVoucherAOV).toLocaleString('en-IN')} without`}
          warning={aovDrag > 0 ? `AOV drag: ₹${Math.round(aovDrag).toLocaleString('en-IN')} per vouchered order` : undefined}
          bars={voucherBars}
          insight={`Voucher orders have <strong>₹${Math.round(aovDrag).toLocaleString('en-IN')} lower AOV</strong> than organic. Review PLM loyalty code discount depth — cap at 10% to protect margin.`}
        />
        <IntelCard color="blue" label="Revenue Concentration — Pareto"
          number={`${totalRev ? (top1rev / totalRev * 100).toFixed(1) : 0}%`}
          sub={`Top 1% of orders (${fmtN(top1pct)}) drive this share · High-ticket orders are your most efficient revenue`}
          bars={paretoBars}
          insight={`Top <strong>${fmtN(top1pct)} orders</strong> = ${totalRev ? (top1rev / totalRev * 100).toFixed(1) : 0}% of revenue. Protect these customers with white-glove service and early access to new products.`}
        />
      </div>

      <div className="g-2">
        <IntelCard color="pink" label="Returns & RTO — Shopify Only"
          number={`${rtoRate.toFixed(1)}%`}
          sub={`RTO rate on ${fmtN(shopifyOrders.length)} Shopify orders · CIR ${cirRate.toFixed(1)}% · Marketplace return data unavailable`}
          bars={returnBars}
          insight={`RTO erodes net revenue by the full order value + reverse logistics cost. Every 1% RTO reduction on ${fmtN(shopifyOrders.length)} orders saves est. <strong>${fmt(shopifyOrders.length * 0.01 * blendedAOV)}</strong>.`}
        />
        <IntelCard color="purple" label="Basket & Multi-item Intelligence"
          number={pct(multiItem.length, nOrders)}
          sub={`${fmtN(multiItem.length)} multi-item orders · AOV ₹${Math.round(multiItemAOV).toLocaleString('en-IN')} vs ₹${Math.round(singleItemAOV).toLocaleString('en-IN')} single-item — ${multiItemAOV > singleItemAOV ? '+' : ''}${(((multiItemAOV - singleItemAOV) / (singleItemAOV || 1)) * 100).toFixed(0)}% AOV premium`}
          bars={topStates}
          insight={`Multi-item orders have <strong>₹${Math.round(multiItemAOV - singleItemAOV).toLocaleString('en-IN')} higher AOV</strong>. Bundle recommendations at checkout (e.g. Pillow + Insole) can shift single-item buyers to multi-item.`}
        />
      </div>

      {catGaps.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.t1, marginBottom: 4 }}>Category × Channel Gap Analysis</div>
          <div style={{ fontSize: 11.5, color: C.t3, marginBottom: 12 }}>High-revenue categories with zero Q-commerce presence</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {catGaps.map((g, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.t1, minWidth: 100 }}>{g.cat}</span>
                <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: C.t2, minWidth: 70 }}>{fmt(g.rev)}</span>
                <span style={{ fontSize: 11, color: C.t3 }}>Missing on:</span>
                {g.missing.map(m => (
                  <span key={m} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: '#FDE8E8', color: '#7A1A1A' }}>{m}</span>
                ))}
                <span style={{ fontSize: 11, color: C.green.tx, fontWeight: 600 }}>→ est. {fmt(g.rev * 0.05)}/mo opportunity</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: C.acl, border: `1px solid ${C.acm}`, borderRadius: 13, padding: '16px 18px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#7A6000', marginBottom: 6 }}>◈ Period Trend Signal</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: trendPct >= 0 ? C.green.tx : C.red.tx, marginBottom: 4 }}>{trendPct > 0 ? '+' : ''}{trendPct.toFixed(1)}%</div>
          <div style={{ fontSize: 12, color: C.t2 }}>Revenue change: first half {fmt(fhRev)} → second half {fmt(lhRev)}</div>
        </div>
        <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: C.t2, lineHeight: 1.7, borderLeft: `1px solid ${C.acm}`, paddingLeft: 20 }}>
          {trendPct < -10
            ? `⚠ Revenue declined ${Math.abs(trendPct).toFixed(1)}% in the second half of this period. Check for demand drop, channel issues, or data gaps (CRED batch, feed delays).`
            : trendPct > 10
            ? `✅ Strong momentum — revenue grew ${trendPct.toFixed(1)}% in the second half. Identify which channels drove growth and double down.`
            : `Revenue is relatively stable across the period (${trendPct.toFixed(1)}%). Intra-period volatility is normal — look at daily channel breakdown for specific signals.`
          }
        </div>
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────
function Skeleton() {
  return (
    <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="g-hero">
        {[1, 2, 3, 4].map(i => <div key={i} style={{ height: 130, borderRadius: 13, background: C.border, animation: 'pulse 1.5s infinite' }} />)}
      </div>
      <div style={{ height: 240, borderRadius: 13, background: C.border, animation: 'pulse 1.5s infinite' }} />
      <div className="g-3">
        {[1, 2, 3].map(i => <div key={i} style={{ height: 200, borderRadius: 13, background: C.border, animation: 'pulse 1.5s infinite' }} />)}
      </div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────
const TAB_TO_CHANNEL = { blinkit: 'Blinkit', instamart: 'Instamart', zepto: 'Zepto', cred: 'CRED', firstcry: 'Firstcry' }

// ── CustomerPage ──────────────────────────────────────────────
// NEW BACKEND FIELDS NEEDED — checklist for /api/customer:
//   1. customersByChannel: [{channel, customers, spend, cac, roas}]
//   2. daysToSecondPurchase: [{bucket, pct, count}]
//   3. aovByOrderNumber: [{orderNum, aov}]
//   4. segmentMigration: [{from, to, customers, direction}]
//   5. discountDepthRepeatRate: [{bucket, repeatRate}]

const CP = {
  bg: '#FFFFFF', paper: '#FFFFFF', ink: '#15130B', ink2: '#4A4636', ink3: '#8A8468',
  yellow: '#F5C518', yellowDeep: '#D9A800', head: '#F3DFA0', headLine: '#E6C877',
  line: '#8A8478', lineSoft: '#D8CD9E', green: '#2E6B3E', red: '#A62E2E',
}

function CpCard({ title, sub, action, children }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '10px 16px', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 12, color: C.t1, textTransform: 'uppercase', letterSpacing: '.06em' }}>{title}</span>
          {sub && <div style={{ fontSize: 10, color: C.t3, fontStyle: 'italic', marginTop: 1 }}>{sub}</div>}
        </div>
        {action && <span>{action}</span>}
      </div>
      <div style={{ padding: '12px 14px' }}>{children}</div>
    </div>
  )
}

function CpDelta({ cur, prev }) {
  if (prev === 0 || prev == null) return null
  const chg = (cur - prev) / Math.abs(prev) * 100
  return (
    <span style={{ color: chg >= 0 ? CP.green : CP.red, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700 }}>
      {chg >= 0 ? `▲ ${chg.toFixed(1)}%` : `▼ ${Math.abs(chg).toFixed(1)}%`}
    </span>
  )
}

function CpBackendTodo({ field }) {
  return (
    <div style={{ border: `2px dashed ${CP.lineSoft}`, padding: 18, textAlign: 'center', color: CP.ink3, fontSize: 11 }}>
      Needs backend support — {field} not yet in API
    </div>
  )
}

function HeroSparkCard({ c }) {
  const [hov, setHov] = useState(null)
  const [hovCard, setHovCard] = useState(false)
  const svgRef = useRef(null)
  const W = 200, H = 32
  const vals = c.sparkVals
  if (!vals || vals.length < 2) return null
  const min = Math.min(...vals), max = Math.max(...vals)
  const range = max - min || 1
  const getX = i => (i / (vals.length - 1)) * W
  const getY = v => H - 2 - ((v - min) / range) * (H - 6)
  const linePts = vals.map((v, i) => `${getX(i)},${getY(v)}`).join(' ')
  // area path: line + down to bottom-right + across to bottom-left + close
  const areaPath = `M ${vals.map((v, i) => `${getX(i)},${getY(v)}`).join(' L ')} L ${getX(vals.length - 1)},${H} L ${getX(0)},${H} Z`
  const gradId = `sg-${c.label.replace(/\s/g, '')}`
  const hovIdx = hov !== null ? hov : vals.length - 1
  const hovX = getX(hovIdx), hovY = getY(vals[hovIdx])
  const handleMove = e => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const idx = Math.round((x / rect.width) * (vals.length - 1))
    setHov(Math.max(0, Math.min(vals.length - 1, idx)))
  }
  return (
    <div onMouseEnter={() => setHovCard(true)} onMouseLeave={() => setHovCard(false)} style={{ background: 'var(--card)', border: `1px solid ${hovCard ? '#F5C518' : 'var(--b1)'}`, borderRadius: 12, padding: '10px 14px 6px', display: 'flex', flexDirection: 'column', gap: 2, transition: 'border-color .15s', cursor: 'default' }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t3)', textTransform: 'uppercase' }}>{c.label}</span>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.15, color: c.valColor }}>{c.value}</span>
        {c.badge}
      </div>
      <span style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 2 }}>{c.sub}</span>
      <div style={{ position: 'relative' }}>
        <svg ref={svgRef} width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          style={{ display: 'block', cursor: 'crosshair' }}
          onMouseMove={handleMove}
          onMouseLeave={() => setHov(null)}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.sparkColor} stopOpacity="0.25" />
              <stop offset="100%" stopColor={c.sparkColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* filled area */}
          <path d={areaPath} fill={`url(#${gradId})`} />
          {/* line */}
          <polyline points={linePts} fill="none" stroke={c.sparkColor} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
          {hov !== null && <circle cx={hovX} cy={hovY} r="3.5" fill={c.sparkColor} />}
        </svg>
        {hov !== null && (
          <div style={{
            position: 'absolute', top: 2,
            left: hovX / W * 100 > 65 ? 'auto' : 4,
            right: hovX / W * 100 > 65 ? 4 : 'auto',
            background: 'var(--card)', borderRadius: 4,
            padding: '1px 6px', pointerEvents: 'none',
            fontSize: 11, fontWeight: 700, color: c.valColor,
            boxShadow: '0 1px 4px rgba(0,0,0,.15)'
          }}>
            {c.fmt(vals[hovIdx])}
          </div>
        )}
      </div>
    </div>
  )
}

function CustomerPage({ filters, activeTab: activeTabProp, setActiveTab: setActiveTabProp }) {
  const [custData, setCustData] = useState(null)
  const [custError, setCustError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [crossFilter, setCrossFilter] = useState('Category')
  const [granularity, setGranularity] = useState('daily')
  const [spendGranularity, setSpendGranularity] = useState('daily')
  const [activeTabLocal, setActiveTabLocal] = useState('overview')
  const activeTab = activeTabProp !== undefined ? activeTabProp : activeTabLocal
  const setActiveTab = setActiveTabProp || setActiveTabLocal
  const [ovChartView, setOvChartView] = useState('revenue')
  const [ovGran, setOvGran] = useState('monthly')
  const [nrMetric, setNrMetric] = useState('customers')
  const [nrGran, setNrGran] = useState('daily')
  const [spendChartGran, setSpendChartGran] = useState('daily')
  const [dowMetric, setDowMetric] = useState('customers')
  const [liftDisplay, setLiftDisplay] = useState('lift')
  const [spendCacGran, setSpendCacGran] = useState('daily')
  const [cacBandGran, setCacBandGran] = useState('daily')
  const [cohortMode, setCohortMode] = useState('customer')
  const [cohortDisplay, setCohortDisplay] = useState('pct')
  const [cohortMonthLimit, setCohortMonthLimit] = useState(14)
  const API = import.meta.env.VITE_API_URL || ''

  useEffect(() => {
    if (!filters?.start || !filters?.end) return
    setLoading(true)
    setCustError(null)
    fetch(`${API}/api/customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start: filters.start, end: filters.end }),
    })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => { setCustData(d); setLoading(false) })
      .catch(e => { setCustError(e.message); setLoading(false) })
  }, [filters?.start, filters?.end])

  if (loading) return (
    <div style={{ background: CP.bg, padding: 40, textAlign: 'center', fontFamily: 'Space Grotesk, var(--font)', color: CP.ink3, fontSize: 13 }}>
      Loading customer data…
    </div>
  )
  if (custError) return (
    <div style={{ background: CP.bg, padding: 40, textAlign: 'center', fontFamily: 'Space Grotesk, var(--font)', color: CP.red, fontSize: 13 }}>
      Error: {custError}
    </div>
  )
  if (!custData) return (
    <div style={{ background: CP.bg, padding: 40, textAlign: 'center', fontFamily: 'Space Grotesk, var(--font)', color: CP.ink3, fontSize: 13 }}>
      No data — select a date range.
    </div>
  )

  const {
    kpis = {}, prevKpis = {},
    daily: rawDaily = [],
    cohort = [],
    rfm = [],
    segMigration = [],
    freqDist = [],
    monetaryDist = [],
    inactivity = [],
    discountDist = [],
    discountRepeatRate = [],
    discountRepeatRateByFirst = [],
    categoryDiscountAnalysis = [],
    crossSell = [],
    dailySpend: rawDailySpend = [],
  } = custData

  const bucketKey = (dateStr) => {
    if (!dateStr) return 'Unknown'
    if (granularity === 'daily') return dateStr
    if (granularity === 'weekly') {
      const d = new Date(dateStr)
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const mon = new Date(d.setDate(diff))
      return mon.toISOString().slice(0, 10)
    }
    return dateStr.slice(0, 7)
  }

  const monthlyMap = {}
  rawDaily.forEach(r => {
    const k = bucketKey(r.date || r.month || r.label || '')
    if (!monthlyMap[k]) monthlyMap[k] = { month: k, grossSales: 0, customersAcquired: 0, repeatRevenue: 0, totalOrders: 0 }
    monthlyMap[k].grossSales += r.grossSales || 0
    monthlyMap[k].customersAcquired += r.newCustomers || r.customersAcquired || 0
    monthlyMap[k].repeatRevenue += r.repeatRevenue || 0
    monthlyMap[k].totalOrders += r.totalOrders || 0
  })
  const monthly = Object.values(monthlyMap).sort((a, b) => a.month < b.month ? -1 : 1).map(r => ({
    ...r,
    aov: r.totalOrders > 0 ? r.grossSales / r.totalOrders : 0,
    repeatRevenueRate: r.grossSales > 0 ? r.repeatRevenue / r.grossSales * 100 : 0,
  }))

  const cohortMap = {}
  const cohort0 = {}
  const cohortRev0 = {}
  cohort.forEach(row => {
    const cm = row.cohortMonth || row.cohort_month || ''
    const idx = row.cohortIndex ?? row.cohort_index ?? 0
    if (!cohortMap[cm]) cohortMap[cm] = {}
    cohortMap[cm][idx] = row
    if (idx === 0) {
      cohort0[cm] = row.customers || 0
      cohortRev0[cm] = row.revenue || 0
    }
  })
  const cohortMonths = Object.keys(cohortMap).sort()
  let maxCohortIdx = 0
  cohort.forEach(r => {
    const idx = r.cohortIndex ?? r.cohort_index ?? 0
    if (idx > maxCohortIdx) maxCohortIdx = idx
  })

  const rfmTotal = rfm.reduce((s, r) => s + (r.customers || 0), 0)

  const crossFirstKey = crossFilter === 'Category' ? 'firstCategory' : 'firstSubCategory'
  const crossSecondKey = crossFilter === 'Category' ? 'secondCategory' : 'secondSubCategory'
  const allCrossFirst = [...new Set(crossSell.map(r => r[crossFirstKey]).filter(Boolean))]
  const allCrossSecond = [...new Set(crossSell.map(r => r[crossSecondKey]).filter(Boolean))]
  const crossMap = {}
  crossSell.forEach(r => {
    const fk = r[crossFirstKey]; const sk = r[crossSecondKey]
    if (!fk || !sk) return
    if (!crossMap[fk]) crossMap[fk] = {}
    crossMap[fk][sk] = (crossMap[fk][sk] || 0) + (r.customers || 0)
  })
  const crossRows = allCrossFirst.map(f => ({ first: f, data: allCrossSecond.map(s => crossMap[f]?.[s] || 0) }))

  function Sparkline({ vals, color }) {
    const W = 120, H = 40
    if (!vals || vals.length < 2) return <svg width={W} height={H} />
    const min = Math.min(...vals), max = Math.max(...vals)
    const range = max - min || 1
    const pts = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * W
      const y = H - ((v - min) / range) * (H - 4) - 2
      return `${x},${y}`
    }).join(' ')
    const lastX = W
    const lastY = H - ((vals[vals.length - 1] - min) / range) * (H - 4) - 2
    return (
      <svg width={W} height={H} style={{ display: 'block' }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
        <circle cx={lastX} cy={lastY} r={3} fill={color} />
      </svg>
    )
  }

  const CP_TAB_ICONS = {
    overview: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="1" width="5" height="5" /><rect x="8" y="1" width="5" height="5" />
        <rect x="1" y="8" width="5" height="5" /><rect x="8" y="8" width="5" height="5" />
      </svg>
    ),
    trends: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1,10 5,6 8,8 13,2" />
        <polyline points="9,2 13,2 13,6" />
      </svg>
    ),
    cohort: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12,7 A5,5 0 1,1 9.5,2.5" />
        <polyline points="10,1 9.5,2.5 11,3.5" />
      </svg>
    ),
    purchase: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2,1 L4,1 L5.5,8 L11,8 L12.5,3.5 L4.5,3.5" />
        <circle cx="6" cy="11" r="1" /><circle cx="10.5" cy="11" r="1" />
      </svg>
    ),
    rfm: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="4" r="2.5" />
        <path d="M1,13 C1,10 3.5,8.5 7,8.5 C10.5,8.5 13,10 13,13" />
      </svg>
    ),
    spend: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="11" x2="11" y2="3" />
        <circle cx="4" cy="4" r="1.5" /><circle cx="10" cy="10" r="1.5" />
      </svg>
    ),
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'trends', label: 'Acquisition & Trends' },
    { id: 'cohort', label: 'Retention Cohort' },
    { id: 'purchase', label: 'Purchase Behavior' },
    { id: 'rfm', label: 'Segments & RFM' },
    { id: 'spend', label: 'Spend & Discounts' },
  ]

  const ttStyle = { background: CP.paper, border: `2px solid ${CP.line}`, borderRadius: 0, padding: '8px 12px', fontSize: 11 }

  return (
    <div style={{ background: CP.bg, fontFamily: 'Inter, var(--font)', minHeight: '100%', width: '100%', boxSizing: 'border-box' }}>
      <div className="sales-tabs">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`stab${activeTab === tab.id ? ' active' : ''}`}>
            {CP_TAB_ICONS[tab.id]}
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ width: '100%', boxSizing: 'border-box' }}>

        {activeTab === 'overview' && (() => {
          const chgBadgeCp = (cur, prev, lowerIsBetter = false) => {
            if (!prev) return null
            const pct = (cur - prev) / Math.abs(prev) * 100
            const isGood = lowerIsBetter ? pct <= 0 : pct >= 0
            return <span style={{ fontSize: 10, fontWeight: 700, color: isGood ? '#0D9E68' : '#B91C1C', background: isGood ? '#F0FDF4' : '#FFF1F1', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>{pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%</span>
          }
          const roasColor = kpis.roas >= 2 ? '#0D9E68' : kpis.roas >= 1 ? '#D97706' : '#B91C1C'

          // Insight banner — top 2 biggest movers
          const metricDefs = [
            { label: 'Gross Sales', cur: kpis.grossSales || 0, prev: prevKpis.grossSales || 0 },
            { label: 'Total Customers', cur: kpis.totalCustomers || 0, prev: prevKpis.totalCustomers || 0 },
            { label: 'Repeat Rate', cur: (kpis.repeatRate || 0) * 100, prev: (prevKpis.repeatRate || 0) * 100 },
            { label: 'CAC', cur: kpis.cac || 0, prev: prevKpis.cac || 0 },
            { label: 'AOV', cur: kpis.aov || 0, prev: prevKpis.aov || 0 },
            { label: 'RoAS', cur: kpis.roas || 0, prev: prevKpis.roas || 0 },
          ]
          const withDelta = metricDefs.map(m => ({ ...m, delta: m.prev > 0 ? (m.cur - m.prev) / Math.abs(m.prev) * 100 : 0 })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
          const top2 = withDelta.slice(0, 2)
          const insightText = top2.length >= 2
            ? `${top2[0].label} is ${top2[0].delta >= 0 ? 'up' : 'down'} ${Math.abs(top2[0].delta).toFixed(1)}% while ${top2[1].label} is ${top2[1].delta >= 0 ? 'up' : 'down'} ${Math.abs(top2[1].delta).toFixed(1)}% in this period.`
            : null

          // — ledger helpers —
          const d = (cur, prev) => prev ? (cur - prev) / Math.abs(prev) * 100 : null

          // LTV prev: use prev period's ltv12 if available, else null (Maturing)
          const pLtv12 = prevKpis.ltv12 || null
          const pLtvCac = (prevKpis.ltvCac != null && prevKpis.ltvCac > 0) ? prevKpis.ltvCac : null

          const ledger1 = [
            { label: 'Total Spend',         cur: kpis.totalSpend || 0,   prev: prevKpis.totalSpend || 0,   f: fmt },
            { label: 'New Customers',       cur: kpis.newCustomers || 0, prev: prevKpis.newCustomers || 0, f: fmtN },
            { label: 'Returning Customers', cur: kpis.returningCustomers || 0, prev: prevKpis.returningCustomers || 0, f: fmtN },
            { label: 'RoAS',                cur: kpis.roas || 0,         prev: prevKpis.roas || 0,         f: v => `${v.toFixed(2)}×`, accent: 'good' },
            { label: 'CAC',                 cur: kpis.cac || 0,          prev: prevKpis.cac || 0,          f: fmt, lowerBetter: true, accent: 'inverted' },
          ]
          const ledger2 = [
            { label: 'Gross Rev (ex GST)',   cur: kpis.grossExcGst || 0,           prev: prevKpis.grossExcGst || 0,           f: fmt },
            { label: 'Net Rev (ex GST)',     cur: kpis.netRevenue || 0,             prev: prevKpis.netRevenue || 0,            f: fmt },
            { label: 'Repeat Rev %',         cur: (kpis.repeatRevenueRate||0)*100,  prev: (prevKpis.repeatRevenueRate||0)*100, f: v => `${v.toFixed(1)}%` },
            { label: '12-Mo LTV',            cur: kpis.ltv12 || 0,                 prev: pLtv12,                              f: fmt, maturing: !pLtv12 },
            { label: 'LTV : CAC',            cur: kpis.ltvCac || 0,                prev: pLtvCac,                             f: v => `${v.toFixed(2)}×`, maturing: !pLtvCac, ltvCacRow: true },
          ]

          // — dynamic one-line insights —
          const spendInsight = (() => {
            const metaDelta = d(kpis.metaSpend, prevKpis.metaSpend)
            const googleDelta = d(kpis.googleSpend, prevKpis.googleSpend)
            if (metaDelta === null || googleDelta === null) return null
            const metaDir = metaDelta >= 0 ? `grew ${Math.abs(metaDelta).toFixed(1)}%` : `fell ${Math.abs(metaDelta).toFixed(1)}%`
            const googleDir = googleDelta >= 0 ? `grew ${Math.abs(googleDelta).toFixed(1)}%` : `fell ${Math.abs(googleDelta).toFixed(1)}%`
            const diverge = Math.abs(metaDelta - googleDelta)
            if (diverge < 2) return null
            const leader = metaDelta > googleDelta ? 'Meta' : 'Google'
            return `Meta spend ${metaDir} while Google ${googleDir} — channel mix has shifted toward ${leader}.`
          })()
          const revenueInsight = (() => {
            const repRevDelta = d(kpis.repeatRevenue, prevKpis.repeatRevenue)
            const repRateDelta = d((kpis.repeatRevenueRate||0)*100, (prevKpis.repeatRevenueRate||0)*100)
            if (repRevDelta === null || repRateDelta === null) return null
            if (repRevDelta >= 0 && repRateDelta < 0) {
              return `Repeat revenue grew ${repRevDelta.toFixed(1)}% but repeat rate fell ${Math.abs(repRateDelta).toFixed(1)}pts — new customer growth is outpacing repeat rate.`
            }
            if (repRevDelta < 0 && repRateDelta >= 0) {
              return `Repeat rate improved ${repRateDelta.toFixed(1)}pts despite repeat revenue falling ${Math.abs(repRevDelta).toFixed(1)}% — base size contracted.`
            }
            const netDelta = d(kpis.netRevenue, prevKpis.netRevenue)
            if (netDelta !== null) return `Net revenue ${netDelta >= 0 ? 'grew' : 'fell'} ${Math.abs(netDelta).toFixed(1)}% this period.`
            return null
          })()

          function MetricTable({ title, rows, accentColor = '#F5C518', insight = null }) {
            return (
              <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                {/* title header */}
                <div style={{ background: CP.head, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${CP.headLine}` }}>
                  <div style={{ width: 3, height: 14, background: accentColor, borderRadius: 2, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'Space Grotesk, var(--font)', fontWeight: 800, fontSize: 11, color: CP.ink, textTransform: 'uppercase', letterSpacing: '.1em' }}>{title}</span>
                </div>
                {/* one-line insight */}
                {insight && (
                  <div style={{ padding: '7px 16px 6px', borderBottom: `1px solid ${CP.head}`, background: '#fff' }}>
                    <span style={{ fontSize: 11, color: CP.ink3, fontStyle: 'italic' }}>{insight}</span>
                  </div>
                )}
                {/* column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 70px', alignItems: 'center', padding: '7px 16px 7px 19px', borderBottom: `1px solid ${CP.headLine}`, background: '#fff' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: CP.ink, textTransform: 'uppercase', letterSpacing: '.06em' }}>Metric</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: CP.ink, textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'right' }}>Prev</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: CP.ink, textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'right' }}>Current</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: CP.ink, textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'right' }}>vs Prev</span>
                </div>
                {/* rows */}
                {rows.map((row, i) => {
                  const delta = (row.prev != null && row.prev !== 0) ? (row.cur - row.prev) / Math.abs(row.prev) * 100 : null
                  const isGood = row.lowerBetter ? delta !== null && delta <= 0 : delta !== null && delta >= 0
                  const rowAccent = 'transparent'
                  const ltvCacColor = row.ltvCacRow
                    ? row.cur >= 3 ? '#0D9E68' : row.cur >= 2 ? '#D97706' : '#B91C1C'
                    : CP.ink
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 70px', alignItems: 'center', padding: '10px 16px 10px 13px', borderBottom: i < rows.length - 1 ? `1px solid ${CP.head}` : 'none', borderLeft: `3px solid ${rowAccent}` }}>
                      {/* label + optional subtitle */}
                      <div>
                        <span style={{ fontSize: 12, color: CP.ink2, fontWeight: 500 }}>{row.label}</span>
                        {row.subtitle && <div style={{ fontSize: 10, color: CP.ink3, marginTop: 1 }}>{row.subtitle}</div>}
                      </div>
                      {/* prev */}
                      <div style={{ textAlign: 'right' }}>
                        {row.maturing
                          ? <span style={{ fontSize: 10, color: CP.ink3, fontStyle: 'italic' }}>Maturing</span>
                          : (row.prev != null && row.prev !== 0)
                            ? <span style={{ fontSize: 11, color: CP.ink3, fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' }}>{row.f(row.prev)}</span>
                            : null
                        }
                      </div>
                      {/* current */}
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: ltvCacColor, fontFamily: 'Space Grotesk, var(--font)', whiteSpace: 'nowrap' }}>{row.f(row.cur)}</span>
                        {row.ltvCacRow && <div style={{ fontSize: 10, color: CP.ink3, marginTop: 1 }}>Target: 3×</div>}
                      </div>
                      {/* vs prev */}
                      <div style={{ textAlign: 'right' }}>
                        {!row.maturing && delta !== null
                          ? <span style={{ fontSize: 10, fontWeight: 700, color: isGood ? '#0D9E68' : '#B91C1C', background: isGood ? '#ECFDF5' : '#FEF2F2', borderRadius: 5, padding: '3px 7px', whiteSpace: 'nowrap' }}>
                              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
                            </span>
                          : <span style={{ fontSize: 10, color: CP.ink3 }}>—</span>
                        }
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 14, paddingLeft: 16, paddingRight: 16, width: '100%', boxSizing: 'border-box' }}>
              {/* 8 hero KPIs with interactive sparklines */}
              {(() => {
                const dailyDates = rawDaily.map(r => r.date || '')
                const spendDates = rawDailySpend.map(r => r.date || '')
                const dailyVals = rawDaily.map(r => r.grossSales || 0)
                const newCustVals = rawDaily.map(r => r.newCustomers || 0)
                const spendVals = rawDailySpend.map(r => r.totalSpend || 0)
                const roasVals = rawDailySpend.map((r, i) => {
                  const s = r.totalSpend || 0
                  const rev = rawDaily[i]?.grossSales || 0
                  return s > 0 ? rev / s : 0
                })
                const cacVals = rawDailySpend.map((r, i) => {
                  const nc = rawDaily[i]?.newCustomers || 0
                  return nc > 0 ? (r.totalSpend || 0) / nc : 0
                })
                const repeatRevPctVals = rawDaily.map(r => {
                  const gs = r.grossSales || 0
                  return gs > 0 ? (r.repeatRevenue || 0) / gs * 100 : 0
                })
                const heroCards = [
                  { label: 'GROSS SALES', value: fmt(kpis.grossSales), sub: `${fmtN(kpis.totalOrders||0)} orders · AOV ${fmt(kpis.aov)}`, badge: chgBadgeCp(kpis.grossSales, prevKpis.grossSales), accent: '#F5C518', valColor: '#15130B', sparkVals: dailyVals, sparkColor: '#D9A800', fmt: v => fmt(v) },
                  { label: 'TOTAL CUSTOMERS', value: fmtN(kpis.totalCustomers), sub: `${fmtN(kpis.newCustomers||0)} new · ${fmtN(kpis.returningCustomers||0)} returning`, badge: chgBadgeCp(kpis.totalCustomers, prevKpis.totalCustomers), accent: '#F5C518', valColor: '#15130B', sparkVals: newCustVals, sparkColor: '#D9A800', fmt: v => fmtN(v) },
                  { label: 'TOTAL AD SPEND', value: fmt(kpis.totalSpend), sub: `Meta ${fmt(kpis.metaSpend)} · Google ${fmt(kpis.googleSpend)} · Add. ${fmt(kpis.additionalSpend || 0)}`, badge: chgBadgeCp(kpis.totalSpend, prevKpis.totalSpend), accent: '#F5C518', valColor: '#15130B', sparkVals: spendVals, sparkColor: '#D9A800', fmt: v => fmt(v) },
                  { label: 'ROAS', value: `${(kpis.roas||0).toFixed(2)}x`, sub: 'Gross Rev (Ex GST) / Ad Spend', badge: chgBadgeCp(kpis.roas, prevKpis.roas), accent: '#F5C518', valColor: '#D97706', sparkVals: roasVals, sparkColor: '#D97706', fmt: v => `${v.toFixed(2)}x` },
                  { label: 'CAC', value: fmt(kpis.cac), sub: 'Total Spend / New Customers', badge: chgBadgeCp(kpis.cac, prevKpis.cac, true), accent: '#F5C518', valColor: '#15130B', sparkVals: cacVals, sparkColor: '#D9A800', fmt: v => fmt(v) },
                  { label: '12-MO LTV', value: fmt(kpis.ltv12 || 0), sub: 'Avg rev / customer (last 12 mo)', badge: null, accent: '#F5C518', valColor: '#15130B', sparkVals: dailyVals, sparkColor: '#D9A800', fmt: v => fmt(v) },
                  { label: 'LTV : CAC', value: (kpis.ltvCac||0).toFixed(2)+'x', sub: '12-Mo LTV / CAC', badge: null, accent: '#F5C518', valColor: '#15130B', sparkVals: roasVals, sparkColor: '#D9A800', fmt: v => `${v.toFixed(2)}x` },
                  { label: 'REPEAT REVENUE %', value: `${((kpis.repeatRevenueRate||0)*100).toFixed(1)}%`, sub: `${fmt(kpis.repeatRevenue||0)} of Gross Sales`, badge: chgBadgeCp(kpis.repeatRevenueRate, prevKpis.repeatRevenueRate), accent: '#F5C518', valColor: '#15130B', sparkVals: repeatRevPctVals, sparkColor: '#D9A800', fmt: v => `${v.toFixed(1)}%` },
                ]
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                    {heroCards.map(c => <HeroSparkCard key={c.label} c={c} />)}
                  </div>
                )
              })()}

              {insightText && <div style={{ fontSize: 12, color: C.t3, padding: '4px 2px', fontStyle: 'italic' }}>{insightText}</div>}

              {/* Metric tables */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <MetricTable title="Ad Spend & Acquisition" rows={ledger1} accentColor="#D9A800" insight={spendInsight} />
                <MetricTable title="Revenue & Lifetime Value" rows={ledger2} accentColor="#0D9E68" insight={revenueInsight} />
              </div>

              {/* ── Main Trend Chart ── */}
              {(() => {
                const excRatio = kpis.grossSales > 0 && kpis.grossExcGst > 0 ? kpis.grossExcGst / kpis.grossSales : 1
                const netRatio  = kpis.grossSales > 0 && kpis.netRevenue  > 0 ? kpis.netRevenue  / kpis.grossSales : 0
                const bucketKey = dateStr => {
                  if (ovGran === 'daily') return dateStr
                  if (ovGran === 'weekly') {
                    const d = new Date(dateStr); const day = d.getDay()
                    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
                    return new Date(d.setDate(diff)).toISOString().slice(0, 10)
                  }
                  return dateStr.slice(0, 7)
                }
                // build unified map
                const map = {}
                rawDaily.forEach(r => {
                  const k = bucketKey(r.date || '')
                  if (!map[k]) map[k] = { label: k, grossExcGst: 0, netRevenue: 0, newCustomers: 0, repeatCustomers: 0, totalOrders: 0, aovSum: 0, aovN: 0, spend: 0 }
                  map[k].grossExcGst     += (r.grossSales || 0) * excRatio
                  map[k].netRevenue      += (r.grossSales || 0) * netRatio
                  map[k].newCustomers    += r.newCustomers || 0
                  map[k].repeatCustomers += r.repeatCustomers || 0
                  map[k].totalOrders     += r.totalOrders || 0
                  if (r.totalOrders > 0) { map[k].aovSum += r.grossSales || 0; map[k].aovN += r.totalOrders }
                })
                rawDailySpend.forEach(r => {
                  const k = bucketKey(r.date || '')
                  if (!map[k]) map[k] = { label: k, grossExcGst: 0, netRevenue: 0, newCustomers: 0, repeatCustomers: 0, totalOrders: 0, aovSum: 0, aovN: 0, spend: 0 }
                  map[k].spend += r.totalSpend || 0
                })
                const chartData = Object.values(map).sort((a, b) => a.label < b.label ? -1 : 1).map(r => ({
                  ...r,
                  aov:  r.aovN > 0 ? Math.round(r.aovSum / r.aovN) : 0,
                  roas: r.spend > 0 ? parseFloat((r.grossExcGst / r.spend).toFixed(2)) : 0,
                  cac:  r.newCustomers > 0 ? Math.round(r.spend / r.newCustomers) : 0,
                }))

                const views = [
                  { id: 'revenue',   label: 'Revenue & Spend' },
                  { id: 'customers', label: 'Customers' },
                  { id: 'aov',       label: 'AOV' },
                ]
                const pill = active => ({
                  background: active ? '#C9A24F' : '#FBF6E8',
                  color: active ? '#fff' : '#8A7F63',
                  border: `1px solid ${active ? '#C9A24F' : '#F0E2BC'}`,
                  borderRadius: 20, padding: '3px 11px', fontSize: 11,
                  cursor: 'pointer', fontWeight: active ? 700 : 500,
                  fontFamily: 'Inter, sans-serif', outline: 'none',
                })
                const granPill = active => ({
                  ...pill(active),
                  padding: '2px 9px', fontSize: 10.5,
                })
                const ttStyle = { background: '#fff', border: '1px solid #F0E2BC', borderRadius: 8, fontSize: 11, color: '#3A3324' }

                return (
                  <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(80,65,20,.04)', border: '1px solid #F0EADC' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #F0EADC', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#3A3324', textTransform: 'uppercase', letterSpacing: '.08em', fontFamily: 'Inter, sans-serif' }}>Performance Trend</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {views.map(v => <button key={v.id} style={pill(ovChartView === v.id)} onClick={() => setOvChartView(v.id)}>{v.label}</button>)}
                        </div>
                        <div style={{ width: 1, height: 16, background: '#E2D9C8' }} />
                        <div style={{ display: 'flex', gap: 4 }}>
                          {['daily','weekly','monthly'].map(g => <button key={g} style={granPill(ovGran === g)} onClick={() => setOvGran(g)}>{g.charAt(0).toUpperCase()+g.slice(1)}</button>)}
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: '14px 16px' }}>
                      <ResponsiveContainer width="100%" height={280}>
                        {ovChartView === 'revenue' ? (
                          <ComposedChart data={chartData} margin={{ top: 4, right: 50, bottom: 4, left: 0 }}>
                            <CartesianGrid stroke="#F0EADC" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#B8AE93' }} />
                            <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: '#B8AE93' }} tickFormatter={v => fmtBig(v)} />
                            <YAxis yAxisId="roas" orientation="right" tick={{ fontSize: 10, fill: '#B8AE93' }} tickFormatter={v => `${v}×`} />
                            <Tooltip contentStyle={ttStyle} itemStyle={{ color: '#3A3324' }} labelStyle={{ color: '#3A3324', fontWeight: 700 }} formatter={(v, name) => name === 'RoAS' ? [`${v}×`, name] : name === 'CAC' ? [fmt(v), name] : [fmt(v), name]} />
                            <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'Inter, sans-serif' }} formatter={v => <span style={{ color: '#13121A' }}>{v}</span>} />
                            <Bar yAxisId="rev" dataKey="grossExcGst" name="Gross Sales (ex GST)" fill="#E8C578" maxBarSize={32} radius={[3,3,0,0]} />
                            <Bar yAxisId="rev" dataKey="netRevenue"   name="Net Revenue"          fill="#C9A24F" maxBarSize={32} radius={[3,3,0,0]} />
                            <Bar yAxisId="rev" dataKey="spend"        name="Ad Spend"             fill="#4A7CC7" maxBarSize={32} radius={[3,3,0,0]} opacity={0.7} />
                            <Line yAxisId="roas" type="monotone" dataKey="roas" name="RoAS" stroke="#9E9484" strokeWidth={2} dot={false} />
                          </ComposedChart>
                        ) : ovChartView === 'customers' ? (
                          <ComposedChart data={chartData} margin={{ top: 4, right: 50, bottom: 4, left: 0 }}>
                            <CartesianGrid stroke="#F0EADC" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#B8AE93' }} />
                            <YAxis yAxisId="cust" tick={{ fontSize: 10, fill: '#B8AE93' }} tickFormatter={v => fmtN(v)} />
                            <YAxis yAxisId="cac" orientation="right" tick={{ fontSize: 10, fill: '#B8AE93' }} tickFormatter={v => fmt(v)} />
                            <Tooltip contentStyle={ttStyle} itemStyle={{ color: '#3A3324' }} labelStyle={{ color: '#3A3324', fontWeight: 700 }} formatter={(v, name) => name === 'CAC' ? [fmt(v), name] : [fmtN(v), name]} />
                            <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'Inter, sans-serif' }} formatter={v => <span style={{ color: '#13121A' }}>{v}</span>} />
                            <Bar yAxisId="cust" dataKey="newCustomers"    name="New Customers"    fill="#E8C578" maxBarSize={32} radius={[3,3,0,0]} />
                            <Bar yAxisId="cust" dataKey="repeatCustomers" name="Repeat Customers" fill="#C9A24F" maxBarSize={32} radius={[3,3,0,0]} />
                            <Line yAxisId="cac" type="monotone" dataKey="cac" name="CAC" stroke="#9E9484" strokeWidth={2} dot={false} />
                          </ComposedChart>
                        ) : (
                          <ComposedChart data={chartData} margin={{ top: 4, right: 50, bottom: 4, left: 0 }}>
                            <CartesianGrid stroke="#F0EADC" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#B8AE93' }} />
                            <YAxis yAxisId="aov" tick={{ fontSize: 10, fill: '#B8AE93' }} tickFormatter={v => fmt(v)} />
                            <YAxis yAxisId="rr" orientation="right" tick={{ fontSize: 10, fill: '#B8AE93' }} tickFormatter={v => `${v.toFixed(1)}×`} />
                            <Tooltip contentStyle={ttStyle} itemStyle={{ color: '#3A3324' }} labelStyle={{ color: '#3A3324', fontWeight: 700 }} formatter={(v, name) => name === 'RoAS' ? [`${v.toFixed(2)}×`, name] : [fmt(v), name]} />
                            <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'Inter, sans-serif' }} formatter={v => <span style={{ color: '#13121A' }}>{v}</span>} />
                            <Bar yAxisId="aov" dataKey="aov" name="AOV (ex GST)" fill="#E8C578" maxBarSize={32} radius={[3,3,0,0]} />
                            <Line yAxisId="rr" type="monotone" dataKey="roas" name="RoAS" stroke="#C9A24F" strokeWidth={2} dot={false} />
                            <Line yAxisId="aov" type="monotone" dataKey="cac" name="CAC" stroke="#9E9484" strokeWidth={2} dot={false} strokeDasharray="4 3" />
                          </ComposedChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </div>
                )
              })()}

            </div>
          )
        })()}

        {activeTab === 'trends' && (() => {
          // TODO: new API fields needed for full tab functionality:
          //   monthlyBudget   — monthly ad spend budget (number) for Spend Pacing bar
          //   customersByChannel — [{channel, customers, spend, cac, roas}] for channel breakdown
          //   qualityByChannel   — [{channel, cac, repeatRate90d, customers}] for quality quadrant chart

          const MONTHLY_BUDGET = null // TODO: wire up monthlyBudget from config/API
          const MARGIN_PCT = 0.35     // approximation pending real margin data per order

          // ── palette tokens ──────────────────────────────────
          const T = {
            bg: '#FDFCF8', card: '#FFFFFF', border: '#F0EADC', borderSoft: '#F6F2E8',
            t1: '#3A3324', t2: '#8A7F63', t3: '#B8AE93',
            amber: '#E8C578', amberDeep: '#C9A24F', amberSoft: '#FBF6E8', amberLine: '#F0E2BC',
            gold: '#D3B36C', goldDeep: '#A8874A', goldSoft: '#F9F3E4',
            green: '#9CA875', red: '#CFA579',
          }
          const ttS = { background: '#FFFFFF', border: `1px solid ${T.amberLine}`, borderRadius: 8, padding: '8px 12px', fontSize: 11, fontFamily: 'Inter, sans-serif', color: '#1a1a1a' }
          const ttItemStyle = { color: '#1a1a1a' }

          // ── pill toggle button style ──
          const pill = active => ({
            background: active ? T.amberDeep : T.amberSoft,
            color: active ? '#fff' : T.t2,
            border: `1px solid ${active ? T.amberDeep : T.amberLine}`,
            borderRadius: 20, padding: '3px 11px', fontSize: 11,
            cursor: 'pointer', fontWeight: active ? 700 : 500,
            fontFamily: 'Inter, sans-serif', outline: 'none',
          })

          // ── section card wrapper ──
          const SCard = ({ title, sub, action, children, stretch }) => (
            <div style={{ background: T.card, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(80,65,20,.04)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#3A3324', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '.08em' }}>{title}</div>
                  {sub && <div style={{ fontSize: 11, color: '#8A7F63', marginTop: 2 }}>{sub}</div>}
                </div>
                {action && <div style={{ display: 'flex', gap: 4 }}>{action}</div>}
              </div>
              <div style={{ padding: '0 16px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</div>
            </div>
          )

          // ── mini sparkline SVG ──
          const MiniSpark = ({ vals, color = T.amberDeep, h = 36 }) => {
            if (!vals || vals.length < 2) return <div style={{ height: h }} />
            const W = 180
            const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1
            const gx = i => (i / (vals.length - 1)) * W
            const gy = v => h - 2 - ((v - min) / range) * (h - 6)
            const pts = vals.map((v, i) => `${gx(i)},${gy(v)}`).join(' ')
            const area = `M ${vals.map((v, i) => `${gx(i)},${gy(v)}`).join(' L ')} L ${gx(vals.length-1)},${h} L 0,${h} Z`
            const gid = `tsg${color.replace('#','')}${h}`
            return (
              <svg width="100%" height={h} viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
                <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".22"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
                <path d={area} fill={`url(#${gid})`} />
                <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            )
          }

          // ── delta badge ──
          const Delta = ({ cur, prev, lowerBetter = false }) => {
            if (!prev) return null
            const d = (cur - prev) / Math.abs(prev) * 100
            const good = lowerBetter ? d <= 0 : d >= 0
            return <span style={{ fontSize: 10, fontWeight: 700, color: good ? '#0D9E68' : '#B91C1C', background: good ? '#F0FDF4' : '#FFF1F1', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>{d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)}%</span>
          }

          // ── derived daily series ──
          const spendByDay = {}
          rawDailySpend.forEach(r => { spendByDay[r.date || ''] = r.totalSpend || 0 })

          const enriched = rawDaily.map(r => {
            const d = r.date || ''
            const spend = spendByDay[d] || 0
            const nc = r.newCustomers || 0
            return { ...r, spend, cac: (nc > 0 && spend > 0) ? spend / nc : 0, roas: spend > 0 ? (r.grossSales || 0) / spend : 0 }
          })

          // ── bucket enriched by granularity for spend charts ──
          const bucketEnriched = (gran) => {
            if (gran === 'daily') return enriched.map(r => ({ ...r, date: r.date }))
            const map = {}
            enriched.forEach(r => {
              const d = new Date(r.date)
              let key
              if (gran === 'weekly') {
                const day = d.getDay()
                const diff = day === 0 ? -6 : 1 - day
                const mon = new Date(d); mon.setDate(d.getDate() + diff)
                key = mon.toISOString().slice(0, 10)
              } else {
                key = r.date.slice(0, 7)
              }
              if (!map[key]) map[key] = { date: key, spend: 0, grossSales: 0, newCustomers: 0, _cacSpend: 0, _cacNc: 0, _roasSpend: 0, _roasN: 0 }
              map[key].spend += r.spend || 0
              map[key].grossSales += r.grossSales || 0
              map[key].newCustomers += r.newCustomers || 0
              if (r.cac > 0) { map[key]._cacSpend += r.spend || 0; map[key]._cacNc += r.newCustomers || 0 }
              if (r.roas > 0) { map[key]._roasSpend += r.spend || 0; map[key]._roasN++ }
            })
            return Object.values(map).map(r => ({
              ...r,
              cac: r._cacNc > 0 ? r._cacSpend / r._cacNc : 0,
              roas: r._roasSpend > 0 ? r.grossSales / r._roasSpend : 0,
            })).sort((a, b) => a.date.localeCompare(b.date))
          }

          // ── 1. Insight banner removed ──
          const insightBanner = null

          // ── 2. KPI cards data ──
          const acqRate = kpis.totalCustomers > 0 ? kpis.newCustomers / kpis.totalCustomers : 0
          const pAcqRate = prevKpis.totalCustomers > 0 ? prevKpis.newCustomers / prevKpis.totalCustomers : 0
          const ltvCac = kpis.ltvCac || (kpis.ltv12 && kpis.cac ? kpis.ltv12 / kpis.cac : 0)
          const pLtvCac = prevKpis.ltvCac || 0
          // Payback Period: cac / (aov * marginPct) in days — approximation
          const avgOrderFreqDays = kpis.totalOrders > 0 && kpis.totalCustomers > 0 ? 30 : 30 // fallback 30d
          const paybackDays = kpis.aov > 0 && kpis.cac > 0 ? Math.round(kpis.cac / (kpis.aov * MARGIN_PCT)) : null

          const newCustVals = enriched.map(r => r.newCustomers || 0)
          const cacVals = enriched.filter(r => r.cac > 0).map(r => r.cac)
          const roasVals = enriched.filter(r => r.roas > 0).map(r => r.roas)
          const acqRateVals = enriched.map(r => {
            const tc = (r.newCustomers || 0) + (r.repeatCustomers || 0)
            return tc > 0 ? (r.newCustomers || 0) / tc * 100 : 0
          })

          const kpiCards = [
            { label: 'New Customers', val: fmtN(kpis.newCustomers), sub: `${fmtN(kpis.returningCustomers || 0)} returning`, spark: newCustVals, cur: kpis.newCustomers, prev: prevKpis.newCustomers },
            { label: 'CAC', val: fmt(kpis.cac), sub: 'Total Spend / New Customers', spark: cacVals, cur: kpis.cac, prev: prevKpis.cac, lowerBetter: true },
            { label: 'RoAS', val: `${(kpis.roas||0).toFixed(2)}×`, sub: 'Gross Rev (ex GST) / Spend', spark: roasVals, cur: kpis.roas, prev: prevKpis.roas },
            { label: 'Acquisition Rate', val: `${(acqRate*100).toFixed(1)}%`, sub: 'New / Total Customers', spark: acqRateVals, cur: acqRate, prev: pAcqRate },
            {
              label: 'LTV : CAC', val: ltvCac > 0 ? `${ltvCac.toFixed(2)}×` : '—',
              sub: ltvCac > 0 ? (ltvCac >= 3 ? '✦ Healthy' : '⚠ Watch') : 'Needs LTV data',
              subColor: ltvCac >= 3 ? T.green : ltvCac > 0 ? T.amberDeep : T.t3,
              spark: roasVals, cur: ltvCac, prev: pLtvCac,
            },
            {
              label: 'Payback Period', val: paybackDays != null ? `${paybackDays}d` : '—',
              sub: `Approx. at ${(MARGIN_PCT*100).toFixed(0)}% margin`, spark: null,
              cur: paybackDays, prev: null, lowerBetter: true,
            },
          ]

          // ── New vs Repeat bucketing ──
          const nrBucketKey = ds => {
            if (!ds) return 'Unknown'
            if (nrGran === 'daily') return ds
            if (nrGran === 'weekly') {
              const d = new Date(ds), day = d.getDay()
              const mon = new Date(d); mon.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
              return mon.toISOString().slice(0, 10)
            }
            return ds.slice(0, 7)
          }
          const nrMap = {}
          rawDaily.forEach(r => {
            const k = nrBucketKey(r.date || '')
            if (!nrMap[k]) nrMap[k] = { label: k, newCustomers: 0, repeatCustomers: 0, newOrders: 0, repeatOrders: 0, newSales: 0, repeatSales: 0 }
            nrMap[k].newCustomers += r.newCustomers || 0
            nrMap[k].repeatCustomers += r.repeatCustomers || 0
            nrMap[k].newOrders += r.newOrders || 0
            nrMap[k].repeatOrders += r.repeatOrders || 0
            nrMap[k].newSales += r.newSales || 0
            nrMap[k].repeatSales += r.repeatSales || r.repeatRevenue || 0
          })
          const nrData = Object.values(nrMap).sort((a, b) => a.label < b.label ? -1 : 1)
          const newKey = nrMetric === 'customers' ? 'newCustomers' : nrMetric === 'orders' ? 'newOrders' : 'newSales'
          const repKey = nrMetric === 'customers' ? 'repeatCustomers' : nrMetric === 'orders' ? 'repeatOrders' : 'repeatSales'

          // ── CAC vs RoAS dual-axis data ──
          const cacRoasData = enriched.filter(r => r.cac > 0 || r.roas > 0).map(r => ({
            label: r.date || '', cac: r.cac > 0 ? Math.round(r.cac) : null, roas: r.roas > 0 ? +r.roas.toFixed(2) : null,
          }))

          // ── Day-of-Week seasonality ──
          // Only use the most recent floor(n/7)*7 days so every weekday appears the same
          // number of times — avoids skewed averages when the range isn't a clean multiple of 7.
          const dowSortedDates = [...new Set(enriched.map(r => r.date).filter(Boolean))].sort()
          const dowWeeks = Math.floor(dowSortedDates.length / 7)
          const dowTrimmedDates = new Set(dowSortedDates.slice(-dowWeeks * 7))
          const dowInsufficient = dowSortedDates.length < 7
          const dowMap = { 0: { day: 'Sun', nc: 0, rev: 0, orders: 0, cnt: 0 }, 1: { day: 'Mon', nc: 0, rev: 0, orders: 0, cnt: 0 }, 2: { day: 'Tue', nc: 0, rev: 0, orders: 0, cnt: 0 }, 3: { day: 'Wed', nc: 0, rev: 0, orders: 0, cnt: 0 }, 4: { day: 'Thu', nc: 0, rev: 0, orders: 0, cnt: 0 }, 5: { day: 'Fri', nc: 0, rev: 0, orders: 0, cnt: 0 }, 6: { day: 'Sat', nc: 0, rev: 0, orders: 0, cnt: 0 } }
          enriched.forEach(r => {
            if (!r.date || !dowTrimmedDates.has(r.date)) return
            const dow = new Date(r.date).getDay()
            dowMap[dow].nc += r.newCustomers || 0
            dowMap[dow].rev += r.grossSalesExc || 0
            dowMap[dow].orders += r.totalOrders || 0
            dowMap[dow].cnt++
          })
          const dowRaw = [1,2,3,4,5,6,0].map(i => ({
            day: dowMap[i].day,
            avg: dowMap[i].cnt > 0 ? Math.round(dowMap[i].nc / dowMap[i].cnt) : 0,
            avgRev: dowMap[i].cnt > 0 ? Math.round(dowMap[i].rev / dowMap[i].cnt) : 0,
            avgOrders: dowMap[i].cnt > 0 ? Math.round(dowMap[i].orders / dowMap[i].cnt) : 0,
          }))
          const dowTotals = { avg: dowRaw.reduce((s,d) => s+d.avg, 0), avgRev: dowRaw.reduce((s,d) => s+d.avgRev, 0), avgOrders: dowRaw.reduce((s,d) => s+d.avgOrders, 0) }
          const dowData = dowRaw.map(d => ({
            ...d,
            pctCustomers: dowTotals.avg > 0 ? parseFloat((d.avg / dowTotals.avg * 100).toFixed(1)) : 0,
            pctRev: dowTotals.avgRev > 0 ? parseFloat((d.avgRev / dowTotals.avgRev * 100).toFixed(1)) : 0,
            pctOrders: dowTotals.avgOrders > 0 ? parseFloat((d.avgOrders / dowTotals.avgOrders * 100).toFixed(1)) : 0,
          }))
          const bestDow = dowData.reduce((a, b) => b.avg > a.avg ? b : a, dowData[0] || { day: '-', avg: 0 })
          const avgDowAll = dowData.reduce((s, d) => s + d.avg, 0) / (dowData.filter(d => d.avg > 0).length || 1)
          const dowInsight = bestDow.avg > 0 && avgDowAll > 0
            ? `${bestDow.day} has the highest avg new customer acquisition at ${fmtN(bestDow.avg)}/day — ${((bestDow.avg/avgDowAll-1)*100).toFixed(0)}% above the weekly average. Based on ${dowWeeks} complete week${dowWeeks !== 1 ? 's' : ''}.`
            : null

          // ── Marginal efficiency scatter ──
          const scatterData = enriched
            .filter(r => r.spend > 0 && (r.newCustomers || 0) > 0)
            .map(r => ({ spend: Math.round(r.spend), nc: r.newCustomers || 0 }))
          // least-squares trend line
          const n = scatterData.length
          let trendLine = []
          if (n > 2) {
            const sx = scatterData.reduce((a, d) => a + d.spend, 0), sy = scatterData.reduce((a, d) => a + d.nc, 0)
            const sxx = scatterData.reduce((a, d) => a + d.spend * d.spend, 0), sxy = scatterData.reduce((a, d) => a + d.spend * d.nc, 0)
            const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1)
            const intercept = (sy - slope * sx) / n
            const xMin = Math.min(...scatterData.map(d => d.spend)), xMax = Math.max(...scatterData.map(d => d.spend))
            trendLine = [{ spend: xMin, nc: Math.max(0, Math.round(slope * xMin + intercept)) }, { spend: xMax, nc: Math.max(0, Math.round(slope * xMax + intercept)) }]
          }

          // ── Spend donut data ──
          const totalSpend = kpis.totalSpend || 0
          const donutData = [
            { name: 'Meta', value: kpis.metaSpend || 0, color: T.amberDeep },
            { name: 'Google', value: kpis.googleSpend || 0, color: T.gold },
            { name: 'Additional', value: kpis.additionalSpend || 0, color: T.amberSoft },
          ].filter(d => d.value > 0)

          // ── Acquisition efficiency ledger sparklines ──
          const cqArr = custData.channelQuality || []
          const blendedClicks = cqArr.reduce((s, c) => s + (c.clicks || 0), 0)
          const blendedCpc = blendedClicks > 0 ? (kpis.totalSpend || 0) / blendedClicks : 0

          const effRows = [
            { label: 'Total Spend', cur: kpis.totalSpend||0, prev: prevKpis.totalSpend||0, f: fmt },
            { label: 'New Customers', cur: kpis.newCustomers||0, prev: prevKpis.newCustomers||0, f: fmtN },
            { label: 'CAC', cur: kpis.cac||0, prev: prevKpis.cac||0, f: fmt, lowerBetter: true },
            { label: 'RoAS', cur: kpis.roas||0, prev: prevKpis.roas||0, f: v => `${v.toFixed(2)}×` },
            { label: 'Acquisition Rate', cur: acqRate*100, prev: pAcqRate*100, f: v => `${v.toFixed(1)}%` },
            { label: 'CPC (Blended)', cur: blendedCpc, prev: 0, f: v => v > 0 ? fmt(v) : '—', lowerBetter: true },
            { label: 'LTV : CAC', cur: ltvCac, prev: pLtvCac, f: v => v > 0 ? `${v.toFixed(2)}×` : '—' },
          ]

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 14, paddingLeft: 16, paddingRight: 16, paddingBottom: 24, background: T.bg, width: '100%', boxSizing: 'border-box' }}>


              {/* 2. KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
                {kpiCards.map((c, i) => (
                  <div key={i} style={{ background: T.card, borderRadius: 12, padding: '10px 12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: T.t3, textTransform: 'uppercase', letterSpacing: '.07em' }}>{c.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: c.valColor || T.t1, fontFamily: 'Space Grotesk, var(--font)', lineHeight: 1.2 }}>{c.val}</span>
                      <Delta cur={c.cur} prev={c.prev} lowerBetter={c.lowerBetter} />
                    </div>
                    <span style={{ fontSize: 10, color: c.subColor || T.t3, lineHeight: 1.3, minHeight: 14 }}>{c.sub}</span>
                    {c.spark && c.spark.length > 1 ? <MiniSpark vals={c.spark} /> : <div style={{ height: 36 }} />}
                  </div>
                ))}
              </div>


              {/* 4 & 5. Charts row: First Order Date + New vs Repeat */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <SCard title="Acquisition Over Time" sub="Customers acquired & gross sales by day"
                  action={['daily','weekly','monthly'].map(g => <button key={g} style={pill(granularity===g)} onClick={() => setGranularity(g)}>{g[0].toUpperCase()+g.slice(1)}</button>)}
                >
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={monthly} margin={{ top: 18, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={T.borderSoft} />
                      <XAxis dataKey="month" tick={{ fontSize: 9, fill: T.t3 }} />
                      <YAxis yAxisId="cust" orientation="left" tick={{ fontSize: 9, fill: T.t3 }} tickFormatter={v => fmtBig(v)} />
                      <YAxis yAxisId="sales" orientation="right" tick={{ fontSize: 9, fill: T.t3 }} tickFormatter={v => fmtBig(v)} />
                      <Tooltip contentStyle={ttS} itemStyle={ttItemStyle} labelStyle={{ color: '#1a1a1a' }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} formatter={v => <span style={{ color: '#13121A' }}>{v}</span>} />
                      <Bar yAxisId="cust" dataKey="customersAcquired" fill="#F5C518" maxBarSize={granularity==='daily'?14:granularity==='weekly'?24:40} name="Customers" radius={[3,3,0,0]} />
                      <Line yAxisId="sales" dataKey="grossSales" stroke="#8A8478" strokeWidth={2.5} dot={false} name="Gross Sales" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </SCard>

                <SCard title="New vs Repeat" sub="Customer/order/sales split over time"
                  action={[
                    ...['customers','orders','sales'].map(m => <button key={m} style={pill(nrMetric===m)} onClick={() => setNrMetric(m)}>{m[0].toUpperCase()+m.slice(1)}</button>),
                    <span key="sep" style={{ width: 6 }} />,
                    ...['daily','weekly','monthly'].map(g => <button key={g} style={pill(nrGran===g)} onClick={() => setNrGran(g)}>{g[0].toUpperCase()+g.slice(1)}</button>),
                  ]}
                >
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={nrData} margin={{ top: 18, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={T.borderSoft} />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: T.t3 }} />
                      <YAxis tick={{ fontSize: 9, fill: T.t3 }} tickFormatter={v => fmtBig(v)} />
                      <Tooltip contentStyle={ttS} itemStyle={ttItemStyle} labelStyle={{ color: '#1a1a1a' }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} formatter={v => <span style={{ color: '#13121A' }}>{v}</span>} />
                      <Bar dataKey={newKey} stackId="a" fill="#F5C518" name="New" radius={[0,0,0,0]} />
                      <Bar dataKey={repKey} stackId="a" fill="#A8874A" name="Repeat" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </SCard>
              </div>

              {/* 6 & 7. CAC vs RoAS + Day-of-Week */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <SCard title="CAC vs RoAS Trend" sub="Daily acquisition cost vs return on ad spend">
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={cacRoasData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={T.borderSoft} />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: T.t3 }} />
                      <YAxis yAxisId="cac" orientation="left" tick={{ fontSize: 9, fill: T.t3 }} tickFormatter={v => fmt(v)} />
                      <YAxis yAxisId="roas" orientation="right" tick={{ fontSize: 9, fill: T.t3 }} tickFormatter={v => `${v.toFixed(1)}×`} />
                      <Tooltip contentStyle={ttS} itemStyle={ttItemStyle} labelStyle={{ color: '#1a1a1a' }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} formatter={v => <span style={{ color: '#13121A' }}>{v}</span>} />
                      <Bar yAxisId="cac" dataKey="cac" fill="#F5C518" maxBarSize={12} name="CAC (₹)" radius={[3,3,0,0]} />
                      <Line yAxisId="roas" dataKey="roas" stroke="#8A8478" strokeWidth={2.5} dot={false} name="RoAS" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </SCard>

                <SCard title="Day-of-Week Seasonality"
                  sub={dowInsufficient ? 'Select at least 7 days to view day-of-week patterns' : dowMetric === 'customers' ? (dowInsight || 'Avg new customers per weekday') : dowMetric === 'revenue' ? 'Avg gross sales (Ex GST) per weekday' : 'Avg orders per weekday'}
                  action={
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[['customers','Customers'],['revenue','Revenue'],['orders','Orders']].map(([m, label]) => (
                        <button key={m} style={pill(dowMetric === m)} onClick={() => setDowMetric(m)}>{label}</button>
                      ))}
                    </div>
                  }
                >
                  {dowInsufficient ? (
                    <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.t3, fontSize: 13 }}>
                      Select at least 7 days to view day-of-week patterns
                    </div>
                  ) : <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={dowData} margin={{ top: 20, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={T.borderSoft} />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: T.t3 }} />
                      <YAxis tick={{ fontSize: 9, fill: T.t3 }} tickFormatter={v => dowMetric === 'revenue' ? fmtBig(v) : fmtBig(v)} />
                      <Tooltip contentStyle={ttS} itemStyle={ttItemStyle} labelStyle={{ color: '#1a1a1a' }}
                        formatter={(v, name) => {
                          if (name === '%') return null
                          const pctKey = dowMetric === 'customers' ? 'pctCustomers' : dowMetric === 'revenue' ? 'pctRev' : 'pctOrders'
                          return dowMetric === 'revenue' ? [fmt(v), name] : [fmtN(v), name]
                        }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0]?.payload
                          const pct = dowMetric === 'customers' ? d?.pctCustomers : dowMetric === 'revenue' ? d?.pctRev : d?.pctOrders
                          const val = dowMetric === 'revenue' ? fmt(d?.avgRev) : dowMetric === 'customers' ? fmtN(d?.avg) : fmtN(d?.avgOrders)
                          const metricName = dowMetric === 'customers' ? 'Avg New Customers' : dowMetric === 'revenue' ? 'Avg Gross Sales' : 'Avg Orders'
                          return (
                            <div style={{ ...ttS, padding: '8px 12px' }}>
                              <div style={{ fontWeight: 700, color: '#1a1a1a', marginBottom: 4 }}>{label}</div>
                              <div style={{ color: '#1a1a1a', fontSize: 12 }}>{metricName}: {val}</div>
                              <div style={{ color: '#1a1a1a', fontSize: 12 }}>Share of week: {pct}%</div>
                            </div>
                          )
                        }}
                      />
                      <Bar dataKey={dowMetric === 'customers' ? 'avg' : dowMetric === 'revenue' ? 'avgRev' : 'avgOrders'}
                        name={dowMetric === 'customers' ? 'Avg New Customers' : dowMetric === 'revenue' ? 'Avg Gross Sales (Ex GST)' : 'Avg Orders'}
                        radius={[4,4,0,0]} fill="#F5C518">
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>}
                </SCard>
              </div>

              {/* 8. Spend vs Sales vs RoAS — triple story on one chart */}
              {(() => {
                const sd = bucketEnriched(spendChartGran)
                const granPills = ['daily','weekly','monthly'].map(g => (
                  <button key={g} style={pill(spendChartGran===g)} onClick={() => setSpendChartGran(g)}>{g[0].toUpperCase()+g.slice(1)}</button>
                ))
                return (<>
              <SCard title="Spend vs Sales vs RoAS" sub="Ad spend (bars) · Gross Sales (black line) · RoAS (amber line)"
                action={granPills}>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={sd} margin={{ top: 18, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke={T.borderSoft} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: T.t3 }} />
                    <YAxis yAxisId="spend" orientation="left" tick={{ fontSize: 9, fill: T.t3 }} tickFormatter={v => fmtBig(v)} />
                    <YAxis yAxisId="roas" orientation="right" tick={{ fontSize: 9, fill: T.t3 }} tickFormatter={v => `${v.toFixed(1)}×`} />
                    <Tooltip contentStyle={ttS} itemStyle={ttItemStyle} labelStyle={{ color: '#1a1a1a' }}
                      formatter={(v, n) => n === 'RoAS' ? [`${v.toFixed(2)}×`, n] : n === 'Gross Sales' ? [fmt(v), n] : [fmt(v), n]} />
                    <Legend wrapperStyle={{ fontSize: 10 }} formatter={v => <span style={{ color: '#13121A' }}>{v}</span>} />
                    <Bar yAxisId="spend" dataKey="spend" fill="#F5C518" maxBarSize={14} name="Ad Spend" radius={[3,3,0,0]} />
                    <Line yAxisId="spend" dataKey="grossSales" stroke="#8A8478" strokeWidth={2.5} dot={false} name="Gross Sales" />
                    <Line yAxisId="roas" dataKey="roas" stroke={T.amberDeep} strokeWidth={2} dot={false} strokeDasharray="4 2" name="RoAS" />
                  </ComposedChart>
                </ResponsiveContainer>
              </SCard>
                </>)
              })()}

              {/* 9 & 10. Spend vs CAC  +  CAC Efficiency Band */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                {/* Spend vs CAC: bar=spend, line=CAC */}
                <SCard title="Spend vs CAC" sub="As spend rises, does CAC improve or worsen?"
                  action={['daily','weekly','monthly'].map(g => <button key={g} style={pill(spendCacGran===g)} onClick={() => setSpendCacGran(g)}>{g[0].toUpperCase()+g.slice(1)}</button>)}>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={bucketEnriched(spendCacGran)} margin={{ top: 18, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={T.borderSoft} />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: T.t3 }} />
                      <YAxis yAxisId="spend" orientation="left" tick={{ fontSize: 9, fill: T.t3 }} tickFormatter={v => fmtBig(v)} />
                      <YAxis yAxisId="cac" orientation="right" tick={{ fontSize: 9, fill: T.t3 }} tickFormatter={v => fmt(v)} />
                      <Tooltip contentStyle={ttS} itemStyle={ttItemStyle} labelStyle={{ color: '#1a1a1a' }}
                        formatter={(v, n) => n === 'CAC' ? [fmt(v), n] : [fmt(v), n]} />
                      <Legend wrapperStyle={{ fontSize: 10 }} formatter={v => <span style={{ color: '#13121A' }}>{v}</span>} />
                      <Bar yAxisId="spend" dataKey="spend" fill="#F5C518" maxBarSize={14} name="Ad Spend" radius={[3,3,0,0]} />
                      <Line yAxisId="cac" dataKey="cac" stroke="#8A8478" strokeWidth={2.5} dot={false} name="CAC" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </SCard>

                {/* CAC Efficiency Band: CAC vs period avg ± stddev */}
                {(() => {
                  const bd = bucketEnriched(cacBandGran)
                  const cacVals = bd.map(r => r.cac).filter(v => v > 0)
                  const cacAvg = cacVals.length ? cacVals.reduce((s, v) => s + v, 0) / cacVals.length : 0
                  const cacStd = cacVals.length > 1 ? Math.sqrt(cacVals.reduce((s, v) => s + (v - cacAvg) ** 2, 0) / cacVals.length) : 0
                  const bandData = bd.map(r => ({
                    date: r.date,
                    cac: r.cac > 0 ? r.cac : null,
                    band: r.cac > 0 ? [Math.max(0, cacAvg - cacStd), cacAvg + cacStd] : null,
                    avg: cacAvg,
                  }))
                  const unit = cacBandGran === 'daily' ? 'days' : cacBandGran === 'weekly' ? 'weeks' : 'months'
                  const aboveAvg = bd.filter(r => r.cac > cacAvg + cacStd).length
                  const belowAvg = bd.filter(r => r.cac > 0 && r.cac < cacAvg - cacStd).length
                  return (
                    <SCard title="CAC Efficiency Band"
                      sub={`${belowAvg} ${unit} below avg (efficient) · ${aboveAvg} ${unit} above avg (costly)`}
                      action={['daily','weekly','monthly'].map(g => <button key={g} style={pill(cacBandGran===g)} onClick={() => setCacBandGran(g)}>{g[0].toUpperCase()+g.slice(1)}</button>)}>
                      <ResponsiveContainer width="100%" height={220}>
                        <ComposedChart data={bandData} margin={{ top: 18, right: 8, bottom: 4, left: 0 }}>
                          <CartesianGrid stroke={T.borderSoft} />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: T.t3 }} />
                          <YAxis tick={{ fontSize: 9, fill: T.t3 }} tickFormatter={v => fmt(v)} />
                          <Tooltip contentStyle={ttS} itemStyle={ttItemStyle} labelStyle={{ color: '#1a1a1a' }}
                            formatter={(v, n) => n === 'CAC' ? [fmt(v), n] : [fmt(v), n]} />
                          <Legend wrapperStyle={{ fontSize: 10 }} formatter={v => <span style={{ color: '#13121A' }}>{v}</span>} />
                          <Line dataKey="avg" stroke={T.amberLine} strokeWidth={1.5} dot={false} strokeDasharray="6 3" name="Avg CAC" legendType="plainline" />
                          <Line dataKey="cac" stroke="#8A8478" strokeWidth={2.5} dot={false} name="CAC" connectNulls />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </SCard>
                  )
                })()}

              </div>

            </div>
          )
        })()}

        {activeTab === 'cohort' && (() => {
          const CT = {
            bg: '#FDFCF8', card: '#FFFFFF', border: '#F0EADC', borderSoft: '#F6F2E8',
            t1: '#3A3324', t2: '#8A7F63', t3: '#B8AE93',
            amber: '#E8C578', amberDeep: '#C9A24F', amberSoft: '#FBF6E8', amberLine: '#F0E2BC',
            gold: '#D3B36C', green: '#9CA875', red: '#CFA579',
          }
          const ttC = { background: '#fff', border: `1px solid ${CT.amberLine}`, borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#1a1a1a' }
          const iStyle = { color: '#1a1a1a' }

          const pill = active => ({
            background: active ? CT.amberDeep : CT.amberSoft,
            color: active ? '#fff' : CT.t2,
            border: `1px solid ${active ? CT.amberDeep : CT.amberLine}`,
            borderRadius: 20, padding: '3px 11px', fontSize: 11,
            cursor: 'pointer', fontWeight: active ? 700 : 500,
            fontFamily: 'Inter, sans-serif', outline: 'none',
          })

          const CDelta = ({ cur, prev, lowerBetter = false }) => {
            if (!prev) return null
            const d = (cur - prev) / Math.abs(prev) * 100
            const good = lowerBetter ? d <= 0 : d >= 0
            return <span style={{ fontSize: 10, fontWeight: 700, color: good ? '#0D9E68' : '#B91C1C', background: good ? '#F0FDF4' : '#FFF1F1', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>{d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)}%</span>
          }

          const MiniSpark = ({ vals, color = CT.amberDeep, h = 36 }) => {
            if (!vals || vals.length < 2) return <div style={{ height: h }} />
            const W = 180
            const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1
            const gx = i => (i / (vals.length - 1)) * W
            const gy = v => h - 2 - ((v - min) / range) * (h - 6)
            const pts = vals.map((v, i) => `${gx(i)},${gy(v)}`).join(' ')
            const area = `M ${vals.map((v, i) => `${gx(i)},${gy(v)}`).join(' L ')} L ${gx(vals.length-1)},${h} L 0,${h} Z`
            const gid = `ctsg${color.replace('#','')}${h}`
            return (
              <svg width="100%" height={h} viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
                <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".22"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
                <path d={area} fill={`url(#${gid})`} />
                <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            )
          }

          const CCard = ({ title, sub, action, info, children }) => (
            <div style={{ background: CT.card, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(80,65,20,.04)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#FFFFFF' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#3A3324', textTransform: 'uppercase', letterSpacing: '.08em' }}>{title}</div>
                    {info && (
                      <div style={{ position: 'relative', display: 'inline-flex' }} className="info-icon-wrap">
                        <span style={{ width: 15, height: 15, borderRadius: '50%', background: '#E8DDB8', color: '#8A7F63', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default', userSelect: 'none', flexShrink: 0 }}>ⓘ</span>
                        <div style={{ position: 'absolute', top: 20, left: 0, zIndex: 99, background: '#3A3324', color: '#FFF9E8', fontSize: 11, lineHeight: 1.5, padding: '8px 12px', borderRadius: 8, width: 260, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', pointerEvents: 'none', opacity: 0, transition: 'opacity 0.15s' }} className="info-tooltip">
                          {info}
                        </div>
                      </div>
                    )}
                  </div>
                  {sub && <div style={{ fontSize: 11, color: '#8A7F63', marginTop: 2 }}>{sub}</div>}
                </div>
                {action && <div style={{ display: 'flex', gap: 4 }}>{action}</div>}
              </div>
              <div style={{ padding: '14px 16px', flex: 1 }}>{children}</div>
            </div>
          )

          // ── weighted avg M1 & M6 (full + first-half as "prev" for delta) ──
          let wSumM1 = 0, wTotM1 = 0, wSumM6 = 0, wTotM6 = 0
          let wSumM1p = 0, wTotM1p = 0, wSumM6p = 0, wTotM6p = 0
          const half = Math.floor(cohortMonths.length / 2)
          cohortMonths.forEach((cm, ci) => {
            const base = cohortMode === 'customer' ? (cohort0[cm] || 0) : (cohortRev0[cm] || 0)
            if (!base) return
            const r1 = cohortMap[cm][1], r6 = cohortMap[cm][6]
            if (r1) {
              const v = cohortMode === 'customer' ? r1.customers : r1.revenue
              wSumM1 += v; wTotM1 += base
              if (ci < half) { wSumM1p += v; wTotM1p += base }
            }
            if (r6) {
              const v = cohortMode === 'customer' ? r6.customers : r6.revenue
              wSumM6 += v; wTotM6 += base
              if (ci < half) { wSumM6p += v; wTotM6p += base }
            }
          })
          const avgM1 = wTotM1 > 0 ? wSumM1 / wTotM1 * 100 : 0
          const avgM6 = wTotM6 > 0 ? wSumM6 / wTotM6 * 100 : 0
          const prevAvgM1 = wTotM1p > 0 ? wSumM1p / wTotM1p * 100 : 0
          const prevAvgM6 = wTotM6p > 0 ? wSumM6p / wTotM6p * 100 : 0
          const lost90Row = inactivity.find(r => String(r.bucket || '').includes('90'))
          const lost90 = lost90Row ? (lost90Row.customers || 0) : 0

          // ── spark lines for stat cards: M1% per cohort, M6% per cohort ──
          const sparkM1 = cohortMonths.map(cm => {
            const base = cohortMode === 'customer' ? (cohort0[cm] || 0) : (cohortRev0[cm] || 0)
            if (!base) return 0
            const r1 = cohortMap[cm][1]
            if (!r1) return 0
            const v = cohortMode === 'customer' ? r1.customers : r1.revenue
            return +(v / base * 100).toFixed(2)
          }).filter(v => v > 0)
          const sparkM6 = cohortMonths.map(cm => {
            const base = cohortMode === 'customer' ? (cohort0[cm] || 0) : (cohortRev0[cm] || 0)
            if (!base) return 0
            const r6 = cohortMap[cm][6]
            if (!r6) return 0
            const v = cohortMode === 'customer' ? r6.customers : r6.revenue
            return +(v / base * 100).toFixed(2)
          }).filter(v => v > 0)
          const sparkLost90 = cohortMonths.map(cm => cohort0[cm] || 0).filter(v => v > 0)
          const avgOrdersPerCust = kpis.totalCustomers > 0 ? kpis.totalOrders / kpis.totalCustomers : 0
          const prevAvgOrdersPerCust = prevKpis.totalCustomers > 0 ? (prevKpis.totalOrders || 0) / prevKpis.totalCustomers : 0
          const sparkAvgOrders = cohortMonths.map(cm => {
            const base = cohort0[cm] || 0
            if (!base) return 0
            const r0 = cohortMap[cm][0]
            if (!r0) return 0
            return +(r0.customers > 0 ? r0.customers / base : 0)
          }).filter(v => v > 0)

          // ── blended retention curve (M1 onwards, weighted by cohort size) ──
          const avgRetention = []
          for (let idx = 1; idx <= maxCohortIdx; idx++) {
            let wSum = 0, wTot = 0
            cohortMonths.forEach(cm => {
              const base = cohortMode === 'customer' ? (cohort0[cm] || 0) : (cohortRev0[cm] || 0)
              if (!base) return
              const row = cohortMap[cm][idx]
              if (!row) return
              const v = cohortMode === 'customer' ? (row.customers || 0) : (row.revenue || 0)
              wSum += v; wTot += base
            })
            avgRetention.push({ month: `M${idx}`, pct: wTot > 0 ? +(wSum / wTot * 100).toFixed(2) : 0 })
          }
          // insight: find where retention drops below 2% or flattens
          const retInsight = (() => {
            const below2 = avgRetention.find(d => d.pct > 0 && d.pct < 2)
            if (below2) return `Retention drops below 2% at ${below2.month} (${below2.pct.toFixed(1)}%), indicating most churn occurs in the first ${below2.month.slice(1)} months.`
            const last3 = avgRetention.slice(-3)
            if (last3.length >= 2) {
              const diff = Math.abs(last3[last3.length-1].pct - last3[0].pct)
              if (diff < 0.3) return `Retention appears to have stabilised between ${last3[0].month}–${last3[last3.length-1].month} at ~${last3[last3.length-1].pct.toFixed(1)}%, suggesting a loyal core base.`
            }
            return `Average Month-1 retention is ${avgM1.toFixed(1)}% across all cohorts.`
          })()

          // ── cohort quality trend (M1 retention per cohort over time) ──
          const qualityTrend = cohortMonths.map(cm => {
            const base = cohortMode === 'customer' ? (cohort0[cm] || 0) : (cohortRev0[cm] || 0)
            if (!base) return null
            const r1 = cohortMap[cm][1]
            if (!r1) return null
            const v = cohortMode === 'customer' ? (r1.customers || 0) : (r1.revenue || 0)
            return { cohort: cm, m1pct: +(v / base * 100).toFixed(2) }
          }).filter(Boolean)
          const qualityInsight = (() => {
            if (qualityTrend.length < 4) return null
            const early = qualityTrend.slice(0, Math.ceil(qualityTrend.length / 2))
            const recent = qualityTrend.slice(-Math.min(4, qualityTrend.length))
            const earlyAvg = early.reduce((s, d) => s + d.m1pct, 0) / early.length
            const recentAvg = recent.reduce((s, d) => s + d.m1pct, 0) / recent.length
            const dir = recentAvg > earlyAvg ? 'improved' : 'declined'
            const diff = Math.abs(recentAvg - earlyAvg).toFixed(1)
            return `M1 retention has ${dir} by ${diff}pp in recent cohorts (${recentAvg.toFixed(1)}%) vs earlier cohorts (${earlyAvg.toFixed(1)}%).`
          })()

          // ── cohort size vs M1 retention ──
          const sizeVsRetention = cohortMonths.map(cm => {
            const base = cohort0[cm] || 0
            if (!base) return null
            const r1 = cohortMap[cm][1]
            if (!r1) return null
            const v = cohortMode === 'customer' ? (r1.customers || 0) : (r1.revenue || 0)
            const baseVal = cohortMode === 'customer' ? base : (cohortRev0[cm] || 0)
            return { cohort: cm, size: base, m1pct: baseVal > 0 ? +(v / baseVal * 100).toFixed(2) : 0 }
          }).filter(Boolean)
          const sizeInsight = (() => {
            if (sizeVsRetention.length < 3) return null
            const first = sizeVsRetention[0], last = sizeVsRetention[sizeVsRetention.length - 1]
            const sizeChg = first.size > 0 ? ((last.size - first.size) / first.size * 100).toFixed(0) : null
            const retChg = first.m1pct > 0 ? ((last.m1pct - first.m1pct) / first.m1pct * 100).toFixed(0) : null
            if (!sizeChg || !retChg) return null
            const sizeDir = +sizeChg >= 0 ? `grown ${sizeChg}%` : `shrunk ${Math.abs(sizeChg)}%`
            const retDir = +retChg >= 0 ? `also improved ${retChg}%` : `declined ${Math.abs(retChg)}%`
            return `Cohort size has ${sizeDir} while M1 retention has ${retDir} — from ${first.m1pct.toFixed(1)}% to ${last.m1pct.toFixed(1)}%.`
          })()

          // ── heatmap intensity ceiling from actual non-M0 data ──
          let maxNonM0Pct = 0
          cohortMonths.forEach(cm => {
            const base = cohortMode === 'customer' ? (cohort0[cm] || 0) : (cohortRev0[cm] || 0)
            if (!base) return
            for (let idx = 1; idx <= maxCohortIdx; idx++) {
              const row = cohortMap[cm]?.[idx]
              if (!row) continue
              const v = cohortMode === 'customer' ? (row.customers || 0) : (row.revenue || 0)
              const p = v / base * 100
              if (p > maxNonM0Pct) maxNonM0Pct = p
            }
          })
          const heatCeiling = Math.max(maxNonM0Pct * 1.1, 5)

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 14, paddingLeft: 16, paddingRight: 16, paddingBottom: 24, background: CT.bg, width: '100%', boxSizing: 'border-box' }}>

              {/* 1. Stat row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {[
                  { label: 'Avg M1 Retention', value: `${avgM1.toFixed(1)}%`, sub: 'Weighted by cohort size', spark: sparkM1, cur: avgM1, prev: prevAvgM1 },
                  { label: 'Avg M6 Retention', value: `${avgM6.toFixed(1)}%`, sub: 'Weighted by cohort size', spark: sparkM6, cur: avgM6, prev: prevAvgM6 },
                  { label: 'Inactive 90+ Days', value: fmtN(lost90), sub: 'Customers not seen in 90d', spark: sparkLost90, cur: lost90, prev: null },
                  { label: 'Avg Orders / Customer', value: avgOrdersPerCust > 0 ? avgOrdersPerCust.toFixed(2) : '—', sub: 'Total orders ÷ unique customers', spark: sparkAvgOrders, cur: avgOrdersPerCust, prev: prevAvgOrdersPerCust },
                ].map((s, i) => (
                  <div key={i} style={{ background: CT.card, borderRadius: 12, padding: '10px 12px 8px', boxShadow: '0 1px 2px rgba(80,65,20,.04)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: CT.t3, textTransform: 'uppercase', letterSpacing: '.07em' }}>{s.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: CT.t1, fontFamily: 'Space Grotesk, var(--font)', lineHeight: 1.2 }}>{s.value}</span>
                      <CDelta cur={s.cur} prev={s.prev} />
                    </div>
                    <span style={{ fontSize: 10, color: CT.t3, lineHeight: 1.3 }}>{s.sub}</span>
                    {s.spark && s.spark.length > 1 ? <MiniSpark vals={s.spark} /> : <div style={{ height: 36 }} />}
                  </div>
                ))}
              </div>

              {/* 2. Blended Retention Curve (M1+, M0 excluded) */}
              <CCard title="Blended Retention Curve" sub="Weighted avg retention across all cohorts — M0 excluded" info="Out of all cohorts combined, what % of customers came back in each month after their first purchase? M1 = came back in month 1, M2 = month 2, and so on."
                action={[['customer','Customers'],['sales','Sales']].map(([v,l]) => <button key={v} style={pill(cohortMode===v)} onClick={() => setCohortMode(v)}>{l}</button>)}
              >
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={avgRetention} margin={{ top: 4, right: 16, bottom: 4, left: 0 }} barCategoryGap="30%">
                    <CartesianGrid stroke={CT.borderSoft} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: CT.t3 }} />
                    <YAxis tick={{ fontSize: 10, fill: CT.t3 }} unit="%" />
                    <Tooltip contentStyle={ttC} itemStyle={iStyle} labelStyle={{ color: '#1a1a1a' }} formatter={v => [`${v.toFixed(1)}%`, 'Avg Retention']} />
                    <Bar dataKey="pct" name="Avg Retention %" radius={[4,4,0,0]} isAnimationActive={false}>
                      {avgRetention.map((d, i) => <Cell key={i} fill={i === 0 ? CT.amberDeep : CT.amber} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {retInsight && <div style={{ marginTop: 10, fontSize: 11, color: CT.t2, fontStyle: 'italic', borderTop: `1px solid ${CT.borderSoft}`, paddingTop: 8 }}>⚡ {retInsight}</div>}
              </CCard>

              {/* 3 & 4. Quality trend + Size vs Retention — side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                <CCard title="Cohort Quality Trend" sub="M1 retention % per cohort over time" info="For each month's batch of new customers, what % came back in Month 1 (M1)? Shows whether the quality of customers you're acquiring is improving or declining over time.">
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={qualityTrend} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                      <defs>
                        <linearGradient id="cqGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={CT.amberDeep} stopOpacity=".25" />
                          <stop offset="100%" stopColor={CT.amberDeep} stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={CT.borderSoft} />
                      <XAxis dataKey="cohort" tick={{ fontSize: 9, fill: CT.t3 }} />
                      <YAxis tick={{ fontSize: 9, fill: CT.t3 }} unit="%" />
                      <Tooltip contentStyle={ttC} itemStyle={iStyle} labelStyle={{ color: '#1a1a1a' }} formatter={v => [`${v.toFixed(1)}%`, 'M1 Retention']} />
                      <Area dataKey="m1pct" stroke={CT.amberDeep} strokeWidth={2} fill="url(#cqGrad)" dot={{ r: 3, fill: CT.amberDeep }} name="M1 Retention %" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                  {qualityInsight && <div style={{ marginTop: 10, fontSize: 11, color: CT.t2, fontStyle: 'italic', borderTop: `1px solid ${CT.borderSoft}`, paddingTop: 8 }}>⚡ {qualityInsight}</div>}
                </CCard>

                <CCard title="Cohort Size vs Retention" sub="Growing cohorts — at what cost to retention?" info="As monthly new customer volume grew (bars), did M1 retention % go up or down (line)? Shows whether scaling acquisition is hurting or improving customer quality.">
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={sizeVsRetention} margin={{ top: 4, right: 30, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={CT.borderSoft} />
                      <XAxis dataKey="cohort" tick={{ fontSize: 9, fill: CT.t3 }} />
                      <YAxis yAxisId="size" orientation="left" tick={{ fontSize: 9, fill: CT.t3 }} tickFormatter={v => fmtBig(v)} />
                      <YAxis yAxisId="ret" orientation="right" tick={{ fontSize: 9, fill: CT.t3 }} unit="%" />
                      <Tooltip contentStyle={ttC} itemStyle={iStyle} labelStyle={{ color: '#1a1a1a' }} />
                      <Bar yAxisId="size" dataKey="size" fill={CT.amber} maxBarSize={28} name="Cohort Size" isAnimationActive={false} />
                      <Line yAxisId="ret" dataKey="m1pct" stroke={CT.amberDeep} strokeWidth={2} dot={{ r: 3, fill: CT.amberDeep }} name="M1 Retention %" isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  {sizeInsight && <div style={{ marginTop: 10, fontSize: 11, color: CT.t2, fontStyle: 'italic', borderTop: `1px solid ${CT.borderSoft}`, paddingTop: 8 }}>⚡ {sizeInsight}</div>}
                </CCard>

              </div>

              {/* 5. Cohort Heatmap */}
              {(() => {
                const visibleMax = Math.min(cohortMonthLimit, maxCohortIdx)
                return (
              <CCard title="Cohort Heatmap"
                action={
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {[['customer','Customers'],['sales','Sales']].map(([v,l]) => <button key={v} style={pill(cohortMode===v)} onClick={() => setCohortMode(v)}>{l}</button>)}
                    <span style={{ width: 6 }} />
                    {[['pct','%'],['count','Count']].map(([v,l]) => <button key={v} style={pill(cohortDisplay===v)} onClick={() => setCohortDisplay(v)}>{l}</button>)}
                    <span style={{ width: 6 }} />
                    <select
                      value={cohortMonthLimit}
                      onChange={e => setCohortMonthLimit(Number(e.target.value))}
                      style={{ fontSize: 11, borderRadius: 20, border: `1px solid ${CT.amberLine}`, background: CT.amberSoft, color: CT.t2, padding: '3px 10px', fontFamily: 'Inter, sans-serif', cursor: 'pointer', outline: 'none' }}
                    >
                      {[6, 12, 24, 36].map(n => <option key={n} value={n}>{n} Months</option>)}
                    </select>
                  </div>
                }
              >
                <div style={{ overflowX: 'auto', overflowY: 'auto', width: '100%', height: 420, maxHeight: 420 }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%', tableLayout: 'auto' }}>
                    <colgroup>
                      <col style={{ width: 72 }} />
                      <col style={{ width: 62 }} />
                      {Array.from({ length: visibleMax + 1 }, (_, i) => <col key={i} />)}
                    </colgroup>
                    <thead>
                      <tr style={{ background: '#F3DFA0', borderBottom: `1px solid #E6C877` }}>
                        <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 4, background: '#F3DFA0', padding: '6px 8px', textAlign: 'left', color: CT.t1, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Cohort</th>
                        <th style={{ position: 'sticky', top: 0, left: 72, zIndex: 4, background: '#F3DFA0', padding: '6px 8px', textAlign: 'right', color: CT.t1, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Size</th>
                        {Array.from({ length: visibleMax + 1 }, (_, i) => (
                          <th key={i} style={{ position: 'sticky', top: 0, zIndex: 3, background: '#F3DFA0', padding: '6px 4px', textAlign: 'center', color: CT.t1, fontWeight: 700, fontSize: 10 }}>M{i}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cohortMonths.filter(cm => (cohort0[cm] || 0) > 0).map((cm, ri) => {
                        const base = cohortMode === 'customer' ? (cohort0[cm] || 0) : (cohortRev0[cm] || 0)
                        return (
                          <tr key={cm} style={{ borderBottom: `1px solid ${CT.borderSoft}`, background: ri % 2 === 0 ? CT.card : CT.bg }}>
                            <td style={{ position: 'sticky', left: 0, zIndex: 1, background: ri % 2 === 0 ? CT.card : CT.bg, padding: '5px 8px', color: CT.t2, fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>{cm}</td>
                            <td style={{ position: 'sticky', left: 72, zIndex: 1, background: ri % 2 === 0 ? CT.card : CT.bg, padding: '5px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: CT.t1, fontSize: 10 }}>{fmtN(cohort0[cm] || 0)}</td>
                            {Array.from({ length: visibleMax + 1 }, (_, idx) => {
                              const row = cohortMap[cm]?.[idx]
                              if (!row) return <td key={idx} style={{ padding: '5px 4px', background: 'transparent' }} />
                              const rawVal = cohortMode === 'customer' ? (row.customers || 0) : (row.revenue || 0)
                              const pctVal = base > 0 ? rawVal / base * 100 : 0
                              const intensity = idx === 0 ? 1 : Math.min(pctVal / heatCeiling, 1)
                              const bg = idx === 0 ? CT.amberDeep : `rgba(232,197,120,${(intensity * 0.85 + 0.05).toFixed(2)})`
                              const textColor = idx === 0 ? '#fff' : CT.t1
                              return (
                                <td key={idx} style={{ padding: '5px 4px', textAlign: 'center', background: bg, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: textColor, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {cohortDisplay === 'pct' ? `${pctVal.toFixed(1)}%` : cohortMode === 'customer' ? fmtN(rawVal) : fmt(rawVal)}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CCard>
                )
              })()}

            </div>
          )
        })()}

        {activeTab === 'purchase' && (() => {
          // ── compute lift heatmap from crossSell data ──
          const crossRaw = crossSell || []
          const isSubCat = crossFilter === 'Sub Category'

          // top-N categories by volume
          const catVolume = {}
          crossRaw.forEach(r => {
            const f = isSubCat ? r.firstSubCategory : r.firstCategory
            const s = isSubCat ? r.secondSubCategory : r.secondCategory
            if (f) catVolume[f] = (catVolume[f] || 0) + r.customers
            if (s) catVolume[s] = (catVolume[s] || 0) + r.customers
          })
          const TOP_N = isSubCat ? 8 : 9
          const topCats = Object.entries(catVolume).sort((a,b) => b[1]-a[1]).slice(0, TOP_N).map(([k]) => k)
          const getKey = (r, role) => {
            const raw = isSubCat ? (role === 'first' ? r.firstSubCategory : r.secondSubCategory) : (role === 'first' ? r.firstCategory : r.secondCategory)
            return topCats.includes(raw) ? raw : (raw ? 'Other' : null)
          }
          const liftCols = [...topCats, ...(crossRaw.some(r => !topCats.includes(isSubCat ? r.secondSubCategory : r.secondCategory)) ? ['Other'] : [])]
          const liftRows = [...topCats, ...(crossRaw.some(r => !topCats.includes(isSubCat ? r.firstSubCategory : r.firstCategory)) ? ['Other'] : [])]

          // count matrix
          const countMatrix = {}
          crossRaw.forEach(r => {
            const f = getKey(r, 'first'), s = getKey(r, 'second')
            if (!f || !s) return
            if (!countMatrix[f]) countMatrix[f] = {}
            countMatrix[f][s] = (countMatrix[f][s] || 0) + r.customers
          })
          // second-purchase totals for lift denominator
          const secondTotals = {}
          liftCols.forEach(c => { secondTotals[c] = liftRows.reduce((sum, f) => sum + (countMatrix[f]?.[c] || 0), 0) })
          const grandTotal = Object.values(secondTotals).reduce((a, b) => a + b, 0)
          // row totals
          const rowTotals = {}
          liftRows.forEach(f => { rowTotals[f] = liftCols.reduce((sum, c) => sum + (countMatrix[f]?.[c] || 0), 0) })

          // lift = (count[f][s] / rowTotal[f]) / (secondTotals[s] / grandTotal)
          const liftVal = (f, s) => {
            const cnt = countMatrix[f]?.[s] || 0
            const rowT = rowTotals[f] || 0
            const colShare = grandTotal > 0 ? (secondTotals[s] || 0) / grandTotal : 0
            if (!rowT || !colShare) return null
            return parseFloat(((cnt / rowT) / colShare).toFixed(2))
          }
          const rateVal = (f, s) => {
            const cnt = countMatrix[f]?.[s] || 0
            const rowT = rowTotals[f] || 0
            return rowT > 0 ? parseFloat((cnt / rowT * 100).toFixed(1)) : 0
          }

          // top 5 lift opportunities (exclude diagonal same-cat)
          const liftPairs = []
          liftRows.forEach(f => liftCols.forEach(s => {
            if (f === s) return
            const cnt = countMatrix[f]?.[s] || 0
            if (cnt < 10) return
            const lv = liftVal(f, s)
            if (lv && lv > 1) liftPairs.push({ f, s, lift: lv, count: cnt })
          }))
          liftPairs.sort((a, b) => b.lift - a.lift)
          const top5 = liftPairs.slice(0, 5)

          // best insight
          const bestLift = top5[0]
          const crossInsight = bestLift
            ? `${bestLift.f} buyers are ${bestLift.lift}× more likely than average to buy ${bestLift.s} next — prime bundle opportunity.`
            : null

          // cell color for lift
          const liftCellBg = (lv) => {
            if (lv === null) return 'transparent'
            if (lv >= 3) return `rgba(245,197,24,0.90)`
            if (lv >= 2) return `rgba(245,197,24,0.65)`
            if (lv >= 1.5) return `rgba(245,197,24,0.40)`
            if (lv >= 1) return `rgba(245,197,24,0.15)`
            return `rgba(148,147,159,0.12)`
          }

          // ── purchase behavior KPIs ──
          const pbKpis = custData.purchaseBehaviorKpis || {}
          const basket = custData.basketComposition || {}

          // ── order freq dist ──
          const freqHistData = (() => {
            const data = custData.orderFreqDist || []
            const total = data.reduce((s, r) => s + r.customers, 0)
            let cum = 0
            return data.map(r => {
              cum += r.customers
              return { ...r, pct: total > 0 ? parseFloat((r.customers / total * 100).toFixed(1)) : 0, cumPct: total > 0 ? parseFloat((cum / total * 100).toFixed(1)) : 0 }
            })
          })()
          const oneTimePct = freqHistData.find(r => r.orderCount === '1')?.pct || 0

          // ── repurchase cycle ──
          const cycleData = (custData.repurchaseCycleByCategory || []).slice(0, 10)
          const fastestCat = cycleData[0]
          const slowestCat = cycleData[cycleData.length - 1]

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16, paddingLeft: 16, paddingRight: 16, width: '100%', boxSizing: 'border-box' }}>

              {/* KPI Strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                {[
                  { label: 'Repeat Purchase Rate', value: pbKpis.repeatRate != null ? `${pbKpis.repeatRate}%` : '—', sub: `${fmtN(pbKpis.repeatCustomers || 0)} of ${fmtN(pbKpis.totalCustomers || 0)} customers` },
                  { label: 'Avg Orders / Customer', value: pbKpis.avgOrdersPerCustomer ? pbKpis.avgOrdersPerCustomer.toFixed(2) : '—', sub: 'Lifetime order frequency' },
                  { label: 'Avg Days Between Orders', value: pbKpis.avgDaysBetweenOrders ? `${pbKpis.avgDaysBetweenOrders}d` : '—', sub: 'Median repurchase gap' },
                  { label: 'Multi-Category Customers', value: pbKpis.multiCatRate != null ? `${pbKpis.multiCatRate}%` : '—', sub: 'Bought 2+ categories ever' },
                  { label: 'Avg Categories / Order', value: basket.avgCategoriesPerOrder ? basket.avgCategoriesPerOrder.toFixed(2) : '—', sub: `${basket.avgItemsPerOrder ? basket.avgItemsPerOrder.toFixed(1) : '—'} items per order` },
                ].map(({ label, value, sub }) => (
                  <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: 10, color: C.t3, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: C.t1, lineHeight: 1.1, fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
                    <div style={{ fontSize: 10, color: C.t3, marginTop: 4, fontStyle: 'italic' }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* Lift Heatmap */}
              <CpCard
                title="Cross-Sell Affinity Heatmap"
                sub="Which categories have genuine purchase affinity beyond category size?"
                action={
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[['lift','Lift'], ['rate','Rate %'], ['count','Count']].map(([v, l]) => {
                      const active = liftDisplay === v
                      return <button key={v} onClick={() => setLiftDisplay(v)} style={{ background: active ? '#C9A24F' : '#FBF6E8', color: active ? '#fff' : '#8A7F63', border: `1px solid ${active ? '#C9A24F' : '#F0E2BC'}`, borderRadius: 20, padding: '3px 11px', fontSize: 11, cursor: 'pointer', fontWeight: active ? 700 : 500, fontFamily: 'Inter, sans-serif', outline: 'none' }}>{l}</button>
                    })}
                    <span style={{ width: 8 }} />
                    {['Category', 'Sub Category'].map(f => {
                      const active = crossFilter === f
                      return <button key={f} onClick={() => setCrossFilter(f)} style={{ background: active ? '#C9A24F' : '#FBF6E8', color: active ? '#fff' : '#8A7F63', border: `1px solid ${active ? '#C9A24F' : '#F0E2BC'}`, borderRadius: 20, padding: '3px 11px', fontSize: 11, cursor: 'pointer', fontWeight: active ? 700 : 500, fontFamily: 'Inter, sans-serif', outline: 'none' }}>{f}</button>
                    })}
                  </div>
                }
              >
                {crossInsight && <div style={{ fontSize: 11, color: CP.ink3, fontStyle: 'italic', marginBottom: 10 }}>{crossInsight}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start' }}>
                  <div style={{ overflowX: 'auto', width: '100%' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 10, width: '100%' }}>
                      <colgroup>
                        <col style={{ width: isSubCat ? 180 : 120 }} />
                        {liftCols.map(s => <col key={s} />)}
                      </colgroup>
                      <thead>
                        <tr style={{ background: CP.head }}>
                          <th style={{ padding: '5px 8px', textAlign: 'left', color: CP.ink3, fontWeight: 600, whiteSpace: 'nowrap', fontSize: 10, minWidth: isSubCat ? 180 : 120 }}>1st Purchase ↓ / 2nd →</th>
                          {liftCols.map(s => (
                            <th key={s} style={{ padding: '5px 6px', textAlign: 'center', color: CP.ink, fontWeight: 700, fontSize: 9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s}>{s.length > 10 ? s.slice(0,10)+'…' : s}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {liftRows.map((f, ri) => (
                          <tr key={f} style={{ borderBottom: `1px solid ${CP.lineSoft}`, background: ri % 2 === 0 ? '#FDFCF8' : '#FFF' }}>
                            <td style={{ padding: '5px 8px', color: CP.ink2, fontWeight: 600, whiteSpace: 'nowrap', fontSize: 10, minWidth: isSubCat ? 180 : 120 }}>{f}</td>
                            {liftCols.map(s => {
                              const cnt = countMatrix[f]?.[s] || 0
                              const lv = liftVal(f, s)
                              const rv = rateVal(f, s)
                              const bg = liftDisplay === 'lift' ? liftCellBg(lv) : liftDisplay === 'rate' ? (rv > 0 ? `rgba(245,197,24,${Math.min(rv/30, 0.9).toFixed(2)})` : 'transparent') : (cnt > 0 ? `rgba(245,197,24,${Math.min(cnt / Math.max(...liftRows.map(ff => Math.max(...liftCols.map(ss => countMatrix[ff]?.[ss] || 0))), 1) * 0.85 + 0.05, 0.95).toFixed(2)})` : 'transparent')
                              const display = liftDisplay === 'lift' ? (lv != null && cnt >= 5 ? `${lv}×` : '') : liftDisplay === 'rate' ? (rv > 0 ? `${rv}%` : '') : (cnt > 0 ? fmtN(cnt) : '')
                              return (
                                <td key={s} title={`${f} → ${s}\nCount: ${fmtN(cnt)}\nRate: ${rv}%\nLift: ${lv != null ? lv+'×' : 'n/a'}`} style={{ padding: '5px 6px', textAlign: 'center', background: bg, fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: CP.ink, cursor: 'default' }}>
                                  {display}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Top 5 lift opportunities */}
                  {top5.length > 0 && (
                    <div style={{ minWidth: 220, background: CP.head, borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: CP.ink, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Top 5 Opportunities</div>
                      {top5.map(({ f, s, lift: lv, count: cnt }, i) => (
                        <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < 4 ? `1px solid ${CP.lineSoft}` : 'none' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: CP.ink }}>{f} → {s}</div>
                          <div style={{ fontSize: 9, color: CP.ink2, marginTop: 2 }}>{lv}× lift · {fmtN(cnt)} customers · bundle candidate</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CpCard>

              {/* Repurchase Cycle by Category */}
              <CpCard title="Repurchase Cycle by Category" sub="Which categories have the fastest natural replacement cycles?">
                {cycleData.length > 0 ? (() => {
                  const insight = fastestCat && slowestCat && fastestCat.category !== slowestCat.category
                    ? `${fastestCat.category} buyers repurchase in a median of ${fastestCat.medianDays} days — ${slowestCat.category} buyers take ${slowestCat.medianDays}+ days.`
                    : null
                  return (
                    <div>
                      {insight && <div style={{ fontSize: 11, color: CP.ink3, fontStyle: 'italic', marginBottom: 10 }}>{insight}</div>}
                      <ResponsiveContainer width="100%" height={240}>
                        <ComposedChart data={cycleData} margin={{ top: 16, right: 16, bottom: 60, left: 8 }}>
                          <CartesianGrid stroke={CP.lineSoft} vertical={false} />
                          <XAxis dataKey="category" tick={{ fontSize: 10, fill: CP.ink2 }} angle={-35} textAnchor="end" interval={0} />
                          <YAxis tick={{ fontSize: 10, fill: CP.ink3 }} tickFormatter={v => `${v}d`} />
                          <Tooltip contentStyle={ttStyle} itemStyle={{ color: CP.ink }} labelStyle={{ color: CP.ink, fontWeight: 700 }}
                            formatter={(v, name) => [`${v} days`, name]} />
                          <Bar dataKey="medianDays" name="Median days to repurchase" fill={CP.yellow} radius={[3,3,0,0]} maxBarSize={36}>
                            <LabelList dataKey="medianDays" position="top" style={{ fontSize: 9, fill: CP.ink2 }} formatter={v => `${v}d`} />
                          </Bar>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )
                })() : <CpBackendTodo field="repurchaseCycleByCategory" />}
              </CpCard>

              {/* Bottom row: 3 charts */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

                {/* Days to Second Purchase */}
                <CpCard title="Days to Second Purchase" sub="How quickly do customers come back?">
                  {custData.daysToSecondPurchase?.length > 0 ? (() => {
                    const total = custData.daysToSecondPurchase.reduce((s, r) => s + r.customers, 0)
                    const data = custData.daysToSecondPurchase.map(r => ({ ...r, pct: total > 0 ? parseFloat((r.customers / total * 100).toFixed(1)) : 0 }))
                    const within30 = data.filter(r => ['0-7d','8-30d'].includes(r.bucket)).reduce((s,r)=>s+r.customers,0)
                    const pct30 = total > 0 ? (within30 / total * 100).toFixed(0) : 0
                    return (
                      <div>
                        <div style={{ fontSize: 11, color: CP.ink3, marginBottom: 10, fontStyle: 'italic' }}>
                          {pct30}% of repeat customers came back within 30 days — {fmtN(within30)} customers
                        </div>
                        <ResponsiveContainer width="100%" height={190}>
                          <ComposedChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                            <CartesianGrid stroke={CP.lineSoft} />
                            <XAxis dataKey="bucket" tick={{ fontSize: 9, fill: CP.ink3 }} />
                            <YAxis yAxisId="left" tick={{ fontSize: 9, fill: CP.ink3 }} tickFormatter={v => fmtBig(v)} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: CP.ink3 }} tickFormatter={v => `${v}%`} />
                            <Tooltip contentStyle={ttStyle} itemStyle={{ color: CP.ink }} labelStyle={{ color: CP.ink, fontWeight: 700 }} formatter={(v, name) => name === '% of Repeaters' ? [`${v}%`, name] : [fmtN(v), name]} />
                            <Legend wrapperStyle={{ fontSize: 9 }} formatter={v => <span style={{ color: '#13121A' }}>{v}</span>} />
                            <Bar yAxisId="left" dataKey="customers" fill={CP.yellow} name="Customers" radius={[3,3,0,0]} maxBarSize={36} />
                            <Line yAxisId="right" type="monotone" dataKey="pct" stroke={CP.line} strokeWidth={2} dot={{ r: 3, fill: CP.line }} name="% of Repeaters" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    )
                  })() : <CpBackendTodo field="daysToSecondPurchase" />}
                </CpCard>

                {/* Order Frequency Distribution */}
                <CpCard title="Order Frequency Distribution" sub="How many orders do customers place over their lifetime?">
                  {freqHistData.length > 0 ? (() => {
                    return (
                      <div>
                        <div style={{ fontSize: 11, color: CP.ink3, marginBottom: 10, fontStyle: 'italic' }}>
                          {oneTimePct}% of customers are one-time buyers — growing repeat orders is the highest-leverage retention lever.
                        </div>
                        <ResponsiveContainer width="100%" height={190}>
                          <ComposedChart data={freqHistData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                            <CartesianGrid stroke={CP.lineSoft} />
                            <XAxis dataKey="orderCount" tick={{ fontSize: 8.5, fill: CP.ink3 }} interval={0} tickFormatter={v => v === '1' ? '1st time' : v === '2' ? '2nd time' : v === '3' ? '3rd time' : v === '6+' ? '6th+ time' : `${v}th time`} />
                            <YAxis yAxisId="left" tick={{ fontSize: 9, fill: CP.ink3 }} tickFormatter={v => fmtBig(v)} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: CP.ink3 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                            <Tooltip contentStyle={ttStyle} itemStyle={{ color: CP.ink }} labelStyle={{ color: CP.ink, fontWeight: 700 }} labelFormatter={v => v === '1' ? '1st time' : v === '2' ? '2nd time' : v === '3' ? '3rd time' : v === '6+' ? '6th+ time' : `${v}th time`} formatter={(v, name) => name === 'Cumulative %' ? [`${v}%`, name] : [fmtN(v), name]} />
                            <Legend wrapperStyle={{ fontSize: 9 }} formatter={v => <span style={{ color: '#13121A' }}>{v}</span>} />
                            <Bar yAxisId="left" dataKey="customers" fill={CP.yellowDeep} name="Customers" radius={[3,3,0,0]} maxBarSize={36} />
                            <Line yAxisId="right" type="monotone" dataKey="cumPct" stroke={CP.line} strokeWidth={2} dot={{ r: 3, fill: CP.line }} name="Cumulative %" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    )
                  })() : <CpBackendTodo field="orderFreqDist" />}
                </CpCard>

                {/* AOV by Order Number */}
                <CpCard title="AOV by Order Number" sub="Does AOV grow as customers become loyal?">
                  {custData.aovByOrderNumber?.length > 0 ? (() => {
                    const first = custData.aovByOrderNumber.find(r => r.orderLabel === '1st')
                    const last  = custData.aovByOrderNumber[custData.aovByOrderNumber.length - 1]
                    const growth = first && last && first.aov > 0 ? ((last.aov - first.aov) / first.aov * 100).toFixed(1) : null
                    return (
                      <div>
                        {growth !== null && <div style={{ fontSize: 11, color: CP.ink3, marginBottom: 10, fontStyle: 'italic' }}>
                          AOV {parseFloat(growth) >= 0 ? 'grows' : 'drops'} {Math.abs(growth)}% from 1st to {last.orderLabel} order — {parseFloat(growth) >= 0 ? 'loyal customers spend more' : 'newer customers drive higher initial AOV'}
                        </div>}
                        <ResponsiveContainer width="100%" height={190}>
                          <ComposedChart data={custData.aovByOrderNumber} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                            <CartesianGrid stroke={CP.lineSoft} />
                            <XAxis dataKey="orderLabel" tick={{ fontSize: 8.5, fill: CP.ink3 }} interval={0} tickFormatter={v => `${v} time`} />
                            <YAxis yAxisId="aov" tick={{ fontSize: 9, fill: CP.ink3 }} tickFormatter={v => fmt(v)} />
                            <YAxis yAxisId="cust" orientation="right" tick={{ fontSize: 9, fill: CP.ink3 }} tickFormatter={v => fmtBig(v)} />
                            <Tooltip contentStyle={ttStyle} itemStyle={{ color: CP.ink }} labelStyle={{ color: CP.ink, fontWeight: 700 }} labelFormatter={v => `${v} time`} formatter={(v, name) => name === 'Customers' ? [fmtN(v), name] : [fmt(v), name]} />
                            <Legend wrapperStyle={{ fontSize: 9 }} formatter={v => <span style={{ color: '#13121A' }}>{v}</span>} />
                            <Bar yAxisId="aov" dataKey="aov" fill={CP.yellowDeep} name="AOV (ex GST)" radius={[3,3,0,0]} maxBarSize={36} />
                            <Line yAxisId="cust" type="monotone" dataKey="customers" stroke={CP.line} strokeWidth={2} dot={{ r: 3, fill: CP.line }} name="Customers" strokeDasharray="4 3" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    )
                  })() : <CpBackendTodo field="aovByOrderNumber" />}
                </CpCard>
              </div>

              {/* Basket Composition */}
              {basket.totalOrders > 0 && (
                <CpCard title="Basket Composition" sub="How often do customers buy multiple categories in one order?">
                  {(() => {
                    const singlePct = basket.totalOrders > 0 ? (basket.singleCatOrders / basket.totalOrders * 100).toFixed(1) : 0
                    const multiPct  = basket.totalOrders > 0 ? (basket.multiCatOrders  / basket.totalOrders * 100).toFixed(1) : 0
                    const basketPieData = [
                      { name: 'Single-category', value: basket.singleCatOrders || 0 },
                      { name: 'Multi-category',  value: basket.multiCatOrders  || 0 },
                    ]
                    return (
                      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                        {/* Donut */}
                        <div style={{ position: 'relative', flexShrink: 0, width: 140, height: 140 }}>
                          <ResponsiveContainer width={140} height={140}>
                            <PieChart>
                              <Pie data={basketPieData} dataKey="value" cx="50%" cy="50%" innerRadius={42} outerRadius={60} paddingAngle={2}>
                                <Cell fill={CP.yellow} />
                                <Cell fill={CP.yellowDeep} />
                              </Pie>
                              <Tooltip contentStyle={ttStyle} formatter={(v, name) => [fmtN(v), name]} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 800, color: CP.ink }}>{fmtN(basket.totalOrders)}</div>
                            <div style={{ fontSize: 8, color: CP.ink3, textTransform: 'uppercase', letterSpacing: '.04em' }}>orders</div>
                          </div>
                        </div>
                        {/* Order type breakdown */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {[
                            { label: 'Single-category', orders: basket.singleCatOrders, pct: singlePct, color: CP.yellow },
                            { label: 'Multi-category',  orders: basket.multiCatOrders,  pct: multiPct,  color: CP.yellowDeep },
                          ].map((g, i) => (
                            <div key={i}>
                              {i > 0 && <div style={{ borderTop: `1px solid ${CP.lineSoft}`, marginBottom: 10 }} />}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ width: 9, height: 9, borderRadius: 2, background: g.color }} />
                                  <span style={{ fontSize: 11, color: CP.ink2, fontFamily: 'Inter, sans-serif' }}>{g.label}</span>
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: CP.ink, fontFamily: 'JetBrains Mono, monospace' }}>{fmtN(g.orders)}</span>
                              </div>
                              <div style={{ height: 6, borderRadius: 4, background: CP.lineSoft, overflow: 'hidden' }}>
                                <div style={{ width: `${g.pct}%`, height: '100%', background: g.color, borderRadius: 4 }} />
                              </div>
                              <div style={{ fontSize: 10, color: CP.ink3, marginTop: 3 }}>{g.pct}% of orders</div>
                            </div>
                          ))}
                        </div>
                        {/* KPI tiles */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {[
                            { label: 'Avg Categories / Order', value: basket.avgCategoriesPerOrder?.toFixed(2) },
                            { label: 'Avg SKUs / Order',       value: basket.avgSkusPerOrder?.toFixed(2) },
                            { label: 'Avg Items / Order',      value: basket.avgItemsPerOrder?.toFixed(1) },
                          ].map(({ label, value }) => (
                            <div key={label} style={{ textAlign: 'center', background: CP.head, borderRadius: 8, padding: '7px 16px', minWidth: 110 }}>
                              <div style={{ fontSize: 17, fontWeight: 800, color: CP.ink, fontFamily: 'JetBrains Mono, monospace' }}>{value || '—'}</div>
                              <div style={{ fontSize: 9, color: CP.ink3, marginTop: 2, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </CpCard>
              )}

              {/* Multi-cat customer stat + Top category pairs */}
              {pbKpis.totalCustomers > 0 && crossSell.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>

                  {/* Multi-category customers */}
                  <CpCard title="Cross-Category Customers" sub="Customers who bought from 2+ categories">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1, textAlign: 'center', background: CP.head, borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 22, fontWeight: 800, color: CP.ink }}>{pbKpis.multiCatRate}%</div>
                          <div style={{ fontSize: 9, color: CP.ink3, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 2 }}>of customers</div>
                        </div>
                        <div style={{ flex: 1, textAlign: 'center', background: CP.head, borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 22, fontWeight: 800, color: CP.ink }}>{fmtN(pbKpis.multiCatCustomers)}</div>
                          <div style={{ fontSize: 9, color: CP.ink3, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 2 }}>customers</div>
                        </div>
                      </div>
                      {/* Single vs Multi bar */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: CP.ink3 }}>Single-category</span>
                          <span style={{ fontSize: 10, color: CP.ink3 }}>Multi-category</span>
                        </div>
                        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${100 - pbKpis.multiCatRate}%`, background: CP.yellow }} />
                          <div style={{ width: `${pbKpis.multiCatRate}%`, background: CP.yellowDeep }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: CP.ink, fontFamily: 'JetBrains Mono, monospace' }}>{fmtN(pbKpis.totalCustomers - pbKpis.multiCatCustomers)}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: CP.ink, fontFamily: 'JetBrains Mono, monospace' }}>{fmtN(pbKpis.multiCatCustomers)}</span>
                        </div>
                      </div>
                      {/* Extra stats */}
                      <div style={{ display: 'flex', gap: 8, borderTop: `1px solid ${CP.lineSoft}`, paddingTop: 10 }}>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 700, color: CP.ink }}>{pbKpis.avgDaysBetweenOrders}d</div>
                          <div style={{ fontSize: 9, color: CP.ink3, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 1 }}>Avg days between orders</div>
                        </div>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 700, color: CP.ink }}>{pbKpis.avgOrdersPerCustomer?.toFixed(1)}×</div>
                          <div style={{ fontSize: 9, color: CP.ink3, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 1 }}>Avg orders / customer</div>
                        </div>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 700, color: CP.ink }}>{pbKpis.repeatRate}%</div>
                          <div style={{ fontSize: 9, color: CP.ink3, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 1 }}>Repeat rate</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: CP.ink3, fontStyle: 'italic' }}>
                        {pbKpis.multiCatRate >= 20
                          ? `Strong cross-sell — ${pbKpis.multiCatRate}% of customers explore multiple categories.`
                          : `Cross-sell opportunity — only ${pbKpis.multiCatRate}% of customers buy across categories.`}
                      </div>
                    </div>
                  </CpCard>

                  {/* Top category pairs */}
                  <CpCard title="Top Category Pairs" sub="Most common first → second purchase category combinations">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${CP.lineSoft}` }}>
                          <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, color: CP.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>First Purchase</th>
                          <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, color: CP.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Then Bought</th>
                          <th style={{ textAlign: 'right', padding: '4px 8px', fontSize: 10, color: CP.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Customers</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          // aggregate by category pair (crossSell has sub-category level rows)
                          const pairMap = new Map()
                          crossSell.forEach(r => {
                            const key = `${r.firstCategory}|||${r.secondCategory}`
                            pairMap.set(key, (pairMap.get(key) || 0) + r.customers)
                          })
                          return [...pairMap.entries()]
                            .map(([key, customers]) => { const [first, second] = key.split('|||'); return { first, second, customers } })
                            .sort((a, b) => b.customers - a.customers)
                            .slice(0, 7)
                            .map((r, i) => (
                              <tr key={i} style={{ borderBottom: `1px solid ${CP.lineSoft}`, background: i % 2 === 0 ? 'transparent' : CP.head }}>
                                <td style={{ padding: '6px 8px', color: CP.ink2, fontFamily: 'Inter, sans-serif' }}>{r.first || '—'}</td>
                                <td style={{ padding: '6px 8px', color: CP.ink, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>{r.second || '—'}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: CP.ink }}>{fmtN(r.customers)}</td>
                              </tr>
                            ))
                        })()}
                      </tbody>
                    </table>
                  </CpCard>

                </div>
              )}
            </div>
          )
        })()}

        {activeTab === 'rfm' && (() => {
          // ── Design tokens ──────────────────────────────────────
          const RS = {
            bg: '#FDFCF8', card: '#FFFFFF', border: '#E2D9C8', borderSoft: '#EDE7DA',
            t1: '#3A3324', t2: '#8A7F63', t3: '#B8AE93',
            amber: '#E8C578', amberDeep: '#C9A24F', amberSoft: '#FBF6E8', amberLine: '#F0E2BC',
            gold: '#D3B36C', green: '#9CA875', red: '#CFA579',
          }

          // ── RFM segment taxonomy ────────────────────────────────
          const SEG_META = {
            'Champions':           { action: 'REWARD VIP',       actionBg: '#166534', actionColor: '#fff', desc: 'Bought recently, buy often, spend the most',         tooltip: 'Bought very recently, buy most often, and spend the most. Your best customers right now. Reward with VIP perks, early access, and referral programs.',             actionTooltip: 'Bought very recently, buy most often, spend the most. Your best customers right now. → Reward VIP: loyalty perks, early access, referral programs.',           gridTooltip: 'Buy often + bought recently. These are your best customers right now.' },
            'Loyal Customers':     { action: 'UPSELL',            actionBg: '#1e40af', actionColor: '#fff', desc: 'Regular buyers with strong lifetime value',          tooltip: 'Buy regularly with good frequency and decent lifetime value. Not top spenders but very reliable. Introduce premium products or bundles to grow their basket.',    actionTooltip: 'Buy regularly, decent frequency, good lifetime value. Not top spenders but reliable. → Upsell: introduce premium products or bundles.',                        gridTooltip: 'Frequent buyers but not as recent as Champions. Still very valuable — buy often, just need a nudge to come back sooner.' },
            'Potential Loyalists': { action: 'NURTURE',           actionBg: '#0369a1', actionColor: '#fff', desc: 'Recent customers with repeat potential',             tooltip: 'Recent buyers who have purchased more than once and show signs of becoming loyal. Keep them engaged and build the habit before they go cold.',                  actionTooltip: 'Recent buyers with repeat potential — bought more than once, good recency. On track to become Champions. → Nurture: keep them engaged, build the habit.',      gridTooltip: 'Bought recently but not yet frequent. On track to become Champions if nurtured well. Keep them engaged.' },
            'New Customers':       { action: 'NUDGE 2ND ORDER',   actionBg: '#7c3aed', actionColor: '#fff', desc: 'Bought recently for the first time',                 tooltip: 'Made their first purchase recently. Critical window — nudge them towards a second order quickly to increase retention odds.',                                    actionTooltip: 'Bought recently for the first time. Critical window. → Nudge 2nd order quickly to increase retention odds.',                                                   gridTooltip: 'First-time buyers. Critical window — push for a 2nd order before they forget about you.' },
            'Promising':           { action: 'NUDGE 2ND ORDER',   actionBg: '#7c3aed', actionColor: '#fff', desc: 'Recent buyers, low frequency so far',                tooltip: 'Bought recently but only once or twice. Still forming habits. Nurture with targeted offers to convert them into regulars.',                                        actionTooltip: 'Recent buyers, low frequency so far. Still forming habits. → Nudge towards next order while purchase intent is still fresh.',                                  gridTooltip: 'Bought recently, low frequency so far. Still forming habits. Targeted offers can convert them to regulars.' },
            'Need Attention':      { action: 'REVIEW',            actionBg: '#b45309', actionColor: '#fff', desc: 'Above average but haven\'t bought recently',         tooltip: 'Had above-average scores before but recency is dropping. At a tipping point — re-engage now before they drift into hibernation.',                                  actionTooltip: 'Customers that don\'t fit cleanly into standard RFM buckets. Mixed signals on recency/frequency. → Review: analyze deeper before deciding.',                   gridTooltip: 'Mixed signals — recency is dropping. At a tipping point, re-engage now before they drift to hibernation.' },
            'About To Sleep':      { action: 'WIN-BACK',          actionBg: '#c2410c', actionColor: '#fff', desc: 'Below average — at risk of going dormant',           tooltip: 'Recency and frequency are both declining. On the verge of going fully dormant. A timely win-back offer could recover them.',                                     actionTooltip: 'Bought recently but only once or twice. New-ish customers still forming habits. → Review: nurture them before they go cold.',                                  gridTooltip: 'Recency and frequency both declining. On the verge of going fully dormant. A timely offer can still recover them.' },
            'At Risk':             { action: 'WIN-BACK',          actionBg: '#c2410c', actionColor: '#fff', desc: 'Bought often before but not recently',               tooltip: 'Used to buy frequently but have not returned in a while. High churn risk. Personalised win-back campaign recommended urgently.',                                  actionTooltip: 'Used to buy frequently but not recently. High churn risk. → Win-back: personalised campaign referencing their past purchases.',                                gridTooltip: 'Used to buy often but disappeared recently. High churn risk — personalised win-back urgently needed.' },
            'Cannot Lose Them':    { action: 'URGENT SAVE',       actionBg: '#991b1b', actionColor: '#fff', desc: 'Used to be champions — haven\'t returned',          tooltip: 'Previously your best customers — high spend, high frequency — but they have stopped buying. Most dangerous segment. Reach out immediately with high-value offers.', actionTooltip: 'Previously your best customers — high spend, high frequency — but stopped buying. Most dangerous segment. → Urgent Save: reach out immediately, high priority.', gridTooltip: 'Rare buyers now, but used to be champions. Most dangerous segment — high value at risk. Reach out immediately.' },
            'Hibernating':         { action: 'WIN-BACK',          actionBg: '#78350f', actionColor: '#fff', desc: 'Last purchase was long ago, low frequency',          tooltip: 'Bought a long time ago and have not come back. Not fully churned yet but going very cold. Win-back campaigns like "we miss you" discounts can reactivate them.',  actionTooltip: 'Bought a long time ago, haven\'t come back. Low frequency, long gap since last order. Not fully churned yet but going cold fast. → Win-Back: discounts, "we miss you" emails.', gridTooltip: 'Rarely bought + last purchase was long ago. Not fully churned yet — "we miss you" campaigns can reactivate them.' },
            'Lost':                { action: 'WIN-BACK',          actionBg: '#6b7280', actionColor: '#fff', desc: 'Lowest recency, frequency and monetary scores',      tooltip: 'Lowest scores across all three RFM dimensions. Effectively churned. Low ROI to pursue, but a small reactivation campaign may recover a fraction.',               actionTooltip: 'Lowest scores across all RFM dimensions. Effectively churned. → Win-back with a single low-cost campaign; do not invest heavily.',                             gridTooltip: 'Lowest scores on all three dimensions. Effectively churned. Low ROI to pursue — one small campaign is all worth trying.' },
            'Recent Users':        { action: 'REVIEW',            actionBg: '#6b7280', actionColor: '#fff', desc: 'Bought recently but low frequency',                   tooltip: 'Bought recently but only once or twice. New-ish customers still forming habits. Need nurturing before they go cold.',                                              actionTooltip: 'Bought recently but only once or twice. New-ish customers still forming habits. → Review: nurture them before they go cold.' },
            'Others':              { action: 'REVIEW',            actionBg: '#6b7280', actionColor: '#fff', desc: 'Mixed signals — doesn\'t fit standard RFM buckets',   tooltip: 'Customers that don\'t fit cleanly into standard RFM buckets — mixed signals on recency, frequency, and monetary. Analyze deeper before deciding on action.',    actionTooltip: 'Doesn\'t fit cleanly into standard RFM buckets. Mixed signals on recency/frequency/monetary. → Review: analyze this group deeper before deciding on action.' },
          }

          // ── RFM Grid placement (3×3) ────────────────────────────
          const GRID_PLACEMENT = {
            'Champions':           { row: 0, col: 0 },
            'Loyal Customers':     { row: 0, col: 1 },
            'Potential Loyalists': { row: 1, col: 0 },
            'New Customers':       { row: 0, col: 2 },
            'Promising':           { row: 1, col: 2 },
            'Need Attention':      { row: 1, col: 1 },
            'About To Sleep':      { row: 2, col: 0 },
            'At Risk':             { row: 1, col: 0 },
            'Cannot Lose Them':    { row: 2, col: 1 },
            'Hibernating':         { row: 2, col: 2 },
            'Lost':                { row: 2, col: 2 },
          }

          // ── RSCard component ────────────────────────────────────
          const RSCard = ({ title, sub, action, children, infoTooltip }) => (
            <div style={{ background: RS.card, borderRadius: 14, overflow: 'hidden', border: `1px solid ${RS.border}`, boxShadow: '0 1px 3px rgba(80,65,20,.04)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#FFFFFF' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#3A3324', textTransform: 'uppercase', letterSpacing: '.08em', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {title}
                    {infoTooltip && (
                      <span className="rscard-info-wrap" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                        <span style={{ width: 14, height: 14, borderRadius: '50%', background: RS.borderSoft, border: `1px solid ${RS.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: RS.t2, cursor: 'default', lineHeight: 1, userSelect: 'none' }}>i</span>
                        <div className="rscard-info-tt" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 999, background: '#fff', border: `1px solid ${RS.border}`, borderRadius: 7, padding: '10px 12px', width: 280, fontSize: 11, color: RS.t1, lineHeight: 1.6, boxShadow: '0 4px 14px rgba(0,0,0,.10)', pointerEvents: 'none', opacity: 0, transition: 'opacity .15s', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{infoTooltip}</div>
                      </span>
                    )}
                  </div>
                  {sub && <div style={{ fontSize: 11, color: '#8A7F63', marginTop: 2 }}>{sub}</div>}
                </div>
                {action && <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{action}</div>}
              </div>
              <div style={{ padding: '14px 16px', flex: 1 }}>{children}</div>
            </div>
          )

          // ── Computations ────────────────────────────────────────
          const rfmSorted = [...rfm].sort((a, b) => (b.totalRevenue || 0) - (a.totalRevenue || 0))
          const totalRev = rfm.reduce((s, r) => s + (r.totalRevenue || 0), 0)
          const totalCust = rfm.reduce((s, r) => s + (r.customers || 0), 0)

          const atRiskActions = new Set(['WIN-BACK', 'URGENT SAVE'])
          const healthyNames = new Set(['Champions', 'Loyal Customers'])

          const atRiskRev = rfm.reduce((s, r) => {
            const meta = SEG_META[r.segment]
            return s + (meta && atRiskActions.has(meta.action) ? (r.totalRevenue || 0) : 0)
          }, 0)
          const healthyRev = rfm.reduce((s, r) => {
            return s + (healthyNames.has(r.segment) ? (r.totalRevenue || 0) : 0)
          }, 0)

          const atRiskSegs = rfm.filter(r => { const m = SEG_META[r.segment]; return m && atRiskActions.has(m.action) })
          const atRiskCust = atRiskSegs.reduce((s, r) => s + (r.customers || 0), 0)

          const rfmMaxRev = rfmSorted[0]?.totalRevenue || 1

          // Build 3×3 grid
          const colLabels = ['Recent', 'Mid Recency', 'Long Ago']
          const rowLabels = ['Frequent', 'Mid Freq', 'Rare']
          const gridCells = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => []))
          rfm.forEach(seg => {
            const placement = GRID_PLACEMENT[seg.segment]
            if (placement) {
              gridCells[placement.row][placement.col].push(seg)
            }
          })
          const cellRevs = gridCells.map(row => row.map(segs => segs.reduce((s, r) => s + (r.totalRevenue || 0), 0)))
          const maxCellRev = Math.max(...cellRevs.flat(), 1)

          // Inactivity 90+ insight
          const inact90 = inactivity.filter(r => (r.bucket || '').includes('90') || (r.bucket || '').includes('90+')).reduce((s, r) => s + (r.customers || 0), 0)
          const hibSeg = rfm.find(r => r.segment === 'Hibernating')

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16, paddingLeft: 16, paddingRight: 16, paddingBottom: 24, width: '100%', boxSizing: 'border-box' }}>

              {/* 1. Insight banner */}
              <div style={{ background: RS.amberSoft, border: `1px solid ${RS.amberLine}`, borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>⚡</span>
                <span style={{ fontSize: 12, color: RS.t1, lineHeight: 1.5 }}>
                  <strong>{fmtN(atRiskCust)} customers</strong> ({totalCust > 0 ? (atRiskCust / totalCust * 100).toFixed(1) : 0}% of base) are in win-back segments representing <strong>{fmt(atRiskRev)}</strong> at risk.{' '}
                  Healthy segments (Champions + Loyal) account for <strong>{fmt(healthyRev)}</strong> ({totalRev > 0 ? (healthyRev / totalRev * 100).toFixed(1) : 0}% of total lifetime revenue).
                </span>
              </div>

              {/* 2. KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { label: 'Customers Analyzed', value: fmtN(totalCust), bg: RS.card, sub: 'All RFM segments combined', tooltip: 'Total unique customers across all 7 RFM segments. This is your entire analyzed customer base.' },
                  { label: 'Revenue at Risk', value: fmt(atRiskRev), bg: '#FFF7ED', sub: `${atRiskSegs.length} win-back segments`, tooltip: 'Revenue from Hibernating + Cannot Lose Them segments. These customers used to buy but haven\'t returned — if not re-engaged, this revenue is lost.' },
                  { label: 'Healthy Base Revenue', value: fmt(healthyRev), bg: RS.card, sub: 'Champions + Loyal Customers', tooltip: 'Revenue from Champions + Loyal Customers — your core active buyers who purchase often and spend the most. This is your stable, reliable revenue.' },
                  { label: 'Total Lifetime Revenue', value: fmt(totalRev), bg: RS.card, sub: 'All segments combined', tooltip: 'Sum of revenue across all 7 RFM segments combined — your total lifetime value from the entire customer base.' },
                ].map((kpi, i) => (
                  <div key={i} style={{ background: kpi.bg, borderRadius: 12, padding: '10px 12px 8px', border: `1px solid ${RS.border}`, position: 'relative', cursor: 'default' }}
                    onMouseEnter={e => {
                      const tt = e.currentTarget.querySelector('.rfm-kpi-tt')
                      if (tt) tt.style.opacity = '1'
                    }}
                    onMouseLeave={e => {
                      const tt = e.currentTarget.querySelector('.rfm-kpi-tt')
                      if (tt) tt.style.opacity = '0'
                    }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: RS.t2, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>{kpi.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: RS.t1, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '-.01em', lineHeight: 1.1 }}>{kpi.value}</div>
                    <div style={{ fontSize: 10, color: RS.t3, marginTop: 4 }}>{kpi.sub}</div>
                    <div className="rfm-kpi-tt" style={{
                      opacity: 0, pointerEvents: 'none', transition: 'opacity .15s',
                      position: 'absolute', top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
                      background: '#ffffff', color: '#3A3324', fontSize: 11, lineHeight: 1.5, border: '1px solid #E8DFC8',
                      padding: '7px 10px', borderRadius: 7, whiteSpace: 'normal', width: 200,
                      boxShadow: '0 4px 14px rgba(0,0,0,.18)', zIndex: 99, textAlign: 'center',
                    }}>{kpi.tooltip}</div>
                  </div>
                ))}
              </div>

              {/* 3. Segments list + RFM Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                {/* RFM Segments list */}
                <RSCard title="RFM Segments" sub={`${rfmSorted.length} segments · sorted by revenue`} infoTooltip={<>Segments are assigned based on R + F + M scores:<br/><br/><table style={{width:'100%',borderCollapse:'collapse',fontSize:10}}><tbody><tr style={{borderBottom:'1px solid #F0EADC'}}><td style={{padding:'2px 6px 2px 0',fontWeight:700}}>R≥4 &amp; F≥4</td><td style={{padding:'2px 0'}}>Champions</td></tr><tr style={{borderBottom:'1px solid #F0EADC'}}><td style={{padding:'2px 6px 2px 0',fontWeight:700}}>R≥3 &amp; F≥3</td><td>Loyal Customers</td></tr><tr style={{borderBottom:'1px solid #F0EADC'}}><td style={{padding:'2px 6px 2px 0',fontWeight:700}}>R≥4 &amp; F≤2</td><td>Recent Users</td></tr><tr style={{borderBottom:'1px solid #F0EADC'}}><td style={{padding:'2px 6px 2px 0',fontWeight:700}}>R≥3 &amp; M≥3</td><td>Potential Loyalists</td></tr><tr style={{borderBottom:'1px solid #F0EADC'}}><td style={{padding:'2px 6px 2px 0',fontWeight:700}}>R≤2 &amp; F≥3</td><td>Cannot Lose Them</td></tr><tr style={{borderBottom:'1px solid #F0EADC'}}><td style={{padding:'2px 6px 2px 0',fontWeight:700}}>R≤2 &amp; F≥2</td><td>Hibernating</td></tr><tr style={{borderBottom:'1px solid #F0EADC'}}><td style={{padding:'2px 6px 2px 0',fontWeight:700}}>Monetary ≥ ₹5000</td><td>Others</td></tr><tr><td style={{padding:'2px 6px 2px 0',fontWeight:700}}>Everything else</td><td>Hibernating</td></tr></tbody></table></>}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {rfmSorted.map((seg, i) => {
                      const name = seg.segment || 'Unknown'
                      const meta = SEG_META[name] || { action: 'REVIEW', actionBg: '#6b7280', actionColor: '#fff', desc: '' }
                      const segRev = seg.totalRevenue || 0
                      const segCust = seg.customers || 0
                      const barPct = rfmMaxRev > 0 ? segRev / rfmMaxRev * 100 : 0
                      const revPct = totalRev > 0 ? segRev / totalRev * 100 : 0
                      return (
                        <div key={i} style={{ borderBottom: i < rfmSorted.length - 1 ? `1px solid ${RS.borderSoft}` : 'none', paddingBottom: i < rfmSorted.length - 1 ? 10 : 0 }}>
                          {/* row: name+bar  |  customers  |  revenue  |  rev%  |  action */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 54px 90px', gap: 8, alignItems: 'center' }}>
                            {/* Left: name + desc + bar */}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ fontWeight: 700, fontSize: 12, color: RS.t1 }}>{name}</span>
                                {meta.tooltip && (
                                  <span className="seg-info-wrap" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: RS.borderSoft, border: `1px solid ${RS.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: RS.t2, cursor: 'default', lineHeight: 1, userSelect: 'none' }}>i</span>
                                    <div className="seg-info-tt" style={{ position: 'absolute', ...(i === 0 ? { top: 'calc(100% + 6px)' } : { bottom: 'calc(100% + 6px)' }), left: 0, zIndex: 999, background: '#fff', border: `1px solid ${RS.border}`, borderRadius: 7, padding: '7px 10px', width: 220, fontSize: 11, color: RS.t1, lineHeight: 1.5, boxShadow: '0 4px 14px rgba(0,0,0,.10)', pointerEvents: 'none', opacity: 0, transition: 'opacity .15s' }}>{meta.tooltip}</div>
                                  </span>
                                )}
                              </div>
                              <div style={{ background: RS.borderSoft, height: 4, borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ width: `${barPct}%`, height: '100%', background: RS.amberDeep, borderRadius: 2, transition: 'width .3s' }} />
                              </div>
                            </div>
                            {/* Customers */}
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 9, color: RS.t3, marginBottom: 1 }}>Customers</div>
                              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, color: RS.t1 }}>{fmtBig(segCust)}</div>
                            </div>
                            {/* Revenue */}
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 9, color: RS.t3, marginBottom: 1 }}>Revenue</div>
                              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 600, color: RS.t1 }}>{fmt(segRev)}</div>
                            </div>
                            {/* Rev % */}
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 9, color: RS.t3, marginBottom: 1 }}>Rev %</div>
                              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 600, color: RS.t2 }}>{revPct.toFixed(1)}%</div>
                            </div>
                            {/* Action badge */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <span className="seg-action-wrap" style={{ position: 'relative', display: 'inline-flex' }}>
                                <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 4, background: meta.actionBg, color: meta.actionColor, letterSpacing: '.05em', whiteSpace: 'nowrap', cursor: 'default' }}>{meta.action}</span>
                                {meta.actionTooltip && <div className="seg-action-tt" style={{ position: 'absolute', bottom: 'calc(100% + 6px)', right: 0, zIndex: 999, background: '#fff', border: `1px solid ${RS.border}`, borderRadius: 7, padding: '7px 10px', width: 220, fontSize: 11, color: RS.t1, lineHeight: 1.5, boxShadow: '0 4px 14px rgba(0,0,0,.10)', pointerEvents: 'none', opacity: 0, transition: 'opacity .15s' }}>{meta.actionTooltip}</div>}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </RSCard>

                {/* RFM Grid */}
                <RSCard title="RFM Grid" sub="Recency (cols) × Frequency (rows)" infoTooltip={<><strong>Recency</strong> = days since last order<br/><span style={{fontSize:10}}>≤30d → 5 · 31–60d → 4 · 61–90d → 3 · 91–180d → 2 · 180d+ → 1</span><br/><br/><strong>Frequency</strong> = total distinct orders (all-time)<br/><span style={{fontSize:10}}>5+ → 5 · 4 → 4 · 3 → 3 · 2 → 2 · 1 → 1</span><br/><br/><strong>Monetary</strong> = total spend exc. GST (all-time)<br/><span style={{fontSize:10}}>≥₹10K → 5 · ₹5K–10K → 4 · ₹2K–5K → 3 · ₹1K–2K → 2 · &lt;₹1K → 1</span></>}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {/* Column headers row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(3, 1fr)', gap: 6, marginBottom: 6 }}>
                      <div />
                      {colLabels.map((lbl, ci) => (
                        <div key={ci} style={{ textAlign: 'center', fontSize: 9, fontWeight: 800, color: RS.t2, textTransform: 'uppercase', letterSpacing: '.08em', background: RS.borderSoft, borderRadius: 6, padding: '4px 0' }}>{lbl}</div>
                      ))}
                    </div>
                    {/* Grid rows */}
                    {rowLabels.map((rowLbl, ri) => (
                      <div key={ri} style={{ display: 'grid', gridTemplateColumns: '52px repeat(3, 1fr)', gap: 6, marginBottom: 6 }}>
                        {/* Row label */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 8, fontWeight: 800, color: RS.t2, textTransform: 'uppercase', letterSpacing: '.06em', writingMode: 'vertical-rl', transform: 'rotate(180deg)', background: RS.borderSoft, borderRadius: 6, padding: '6px 3px' }}>{rowLbl}</span>
                        </div>
                        {[0, 1, 2].map(ci => {
                          const segs = gridCells[ri][ci]
                          const cellRev = cellRevs[ri][ci]
                          const intensity = maxCellRev > 0 ? cellRev / maxCellRev * 0.4 + (segs.length > 0 ? 0.07 : 0) : 0
                          const isIdeal = ri === 0 && ci === 0
                          const isEmpty = segs.length === 0
                          const emptyReasons = [
                            ['', '', 'Frequent buyers rarely go long ago — they keep coming back.'],
                            ['', 'Mid-frequency buyers with mid recency tend to shift to either loyal or hibernating — rarely stay in between.', 'Mid-frequency buyers who disappeared long ago are reclassified into Hibernating or Cannot Lose Them.'],
                            ['Rare buyers who purchased recently are grouped as Recent Users, not here.', '', ''],
                          ]
                          const emptyReason = isEmpty ? (emptyReasons[ri]?.[ci] || 'No customers fall into this recency + frequency combination.') : ''
                          return (
                            <div key={ci} className="rfm-grid-cell" style={{
                              background: isEmpty ? RS.borderSoft : `rgba(201,162,79,${intensity})`,
                              border: `1px solid ${isEmpty ? RS.borderSoft : RS.amberLine}`,
                              borderRadius: 8,
                              padding: isEmpty ? 0 : '10px 12px',
                              minHeight: 80,
                              position: 'relative',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: isEmpty ? 'center' : 'flex-start',
                            }}>
                              {isIdeal && !isEmpty && (
                                <div style={{ position: 'absolute', top: 5, right: 6, fontSize: 8, fontWeight: 800, color: RS.amberDeep, letterSpacing: '.04em' }}>✦ Ideal</div>
                              )}
                              {isEmpty ? (
                                <div className="rfm-grid-cell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 80, position: 'relative' }}>
                                  <span style={{ color: RS.t3, fontSize: 11 }}>—</span>
                                  {emptyReason && <div className="rfm-grid-tt" style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 999, background: '#fff', border: `1px solid ${RS.border}`, borderRadius: 7, padding: '7px 10px', width: 210, fontSize: 11, color: RS.t1, lineHeight: 1.5, boxShadow: '0 4px 14px rgba(0,0,0,.10)', pointerEvents: 'none', opacity: 0, transition: 'opacity .15s' }}>{emptyReason}</div>}
                                </div>
                              ) : (
                                <>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    {segs.map((seg, si) => {
                                      const segMeta = SEG_META[seg.segment] || { action: 'REVIEW', actionBg: '#6b7280', actionColor: '#fff' }
                                      const segRevPct = totalRev > 0 ? (seg.totalRevenue || 0) / totalRev * 100 : 0
                                      return (
                                        <div key={si} style={{ borderTop: si > 0 ? `1px solid ${RS.amberLine}` : 'none', paddingTop: si > 0 ? 5 : 0 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <span style={{ fontWeight: 800, fontSize: 11, color: RS.t1 }}>{seg.segment}</span>
                                            <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 5px', borderRadius: 3, background: segMeta.actionBg, color: segMeta.actionColor, letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{segMeta.action}</span>
                                          </div>
                                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginTop: 4 }}>
                                            <div>
                                              <div style={{ fontSize: 8.5, color: RS.t3, marginBottom: 1 }}>Customers</div>
                                              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: RS.t1 }}>{fmtBig(seg.customers || 0)}</div>
                                            </div>
                                            <div>
                                              <div style={{ fontSize: 8.5, color: RS.t3, marginBottom: 1 }}>Revenue</div>
                                              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: RS.t1, whiteSpace: 'nowrap' }}>{fmtBig(seg.totalRevenue || 0)}</div>
                                            </div>
                                            <div>
                                              <div style={{ fontSize: 8.5, color: RS.t3, marginBottom: 1 }}>Rev %</div>
                                              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: RS.t2 }}>{segRevPct.toFixed(1)}%</div>
                                            </div>
                                          </div>
                                          {segMeta.gridTooltip && (
                                            <div className="rfm-grid-tt" style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 999, background: '#fff', border: `1px solid ${RS.border}`, borderRadius: 7, padding: '7px 10px', width: 230, fontSize: 11, color: RS.t1, lineHeight: 1.5, boxShadow: '0 4px 14px rgba(0,0,0,.10)', pointerEvents: 'none', opacity: 0, transition: 'opacity .15s' }}>{segMeta.gridTooltip}</div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </RSCard>
              </div>


              {/* 4. Segment Migration — removed */}
              {false && segMigration.length > 0 && (() => {
                const SEGMENT_RANK = { 'Champions': 1, 'Loyal Customers': 2, 'Potential Loyalists': 3, 'Recent Users': 4, 'Others': 5, 'Cannot Lose Them': 6, 'Hibernating': 7 }
                const allMoves   = segMigration.filter(r => r.from !== r.to && SEGMENT_RANK[r.from] != null && SEGMENT_RANK[r.to] != null)
                const upgrades   = allMoves.filter(r => SEGMENT_RANK[r.to] < SEGMENT_RANK[r.from]).sort((a,b) => b.customers - a.customers)
                const downgrades = allMoves.filter(r => SEGMENT_RANK[r.to] > SEGMENT_RANK[r.from]).sort((a,b) => b.customers - a.customers)
                const totalMoved = allMoves.reduce((s,r) => s + r.customers, 0)
                const totalUp    = upgrades.reduce((s,r) => s + r.customers, 0)
                const totalDown  = downgrades.reduce((s,r) => s + r.customers, 0)
                const maxUp      = upgrades[0]?.customers || 1
                const maxDown    = downgrades[0]?.customers || 1
                const netDiff    = Math.abs(totalDown - totalUp)
                const biggestMove = [...allMoves].sort((a,b) => b.customers - a.customers)[0]
                const netDir     = totalDown > totalUp ? 'down' : 'up'
                const insightText = netDir === 'down'
                  ? `Downgrades outnumber upgrades by ${fmtBig(netDiff)} net this period — more customers are slipping to lower-engagement segments than moving up.`
                  : `Upgrades outnumber downgrades by ${fmtBig(netDiff)} net this period — more customers are moving to higher-engagement segments.`
                const biggestText = biggestMove ? `Biggest single move: ${fmtBig(biggestMove.customers)} customers from ${biggestMove.from} → ${biggestMove.to}.` : ''

                const SM_GREEN      = '#6B8F5A'
                const SM_GREEN_SOFT = '#EEF3E8'
                const SM_RED        = '#B5615A'
                const SM_RED_SOFT   = '#FAEEEC'
                const SM_AMBER_SOFT = '#FBF6E8'
                const SM_AMBER_LINE = '#F0E2BC'
                const SM_BORDER     = '#F0EADC'
                const SM_T1         = '#3A3324'
                const SM_T2         = '#8A7F63'
                const SM_T3         = '#B8AE93'

                const MigRow = ({ row, max, barColor, barBg }) => (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 52px', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 10.5, color: SM_T2, fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                      {row.from} → {row.to}
                    </span>
                    <div style={{ height: 5, background: barBg, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(row.customers / max * 100, 3)}%`, height: '100%', background: barColor, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, fontWeight: 700, color: SM_T1, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtBig(row.customers)}</span>
                  </div>
                )

                return (
                  <div style={{ background: '#FFFFFF', borderRadius: 14, border: `1px solid ${SM_BORDER}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(80,65,20,.04)' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: `1px solid ${SM_BORDER}` }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: SM_AMBER_SOFT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#C9A24F' }}>↔</div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: SM_T1, fontFamily: 'Inter, sans-serif' }}>Segment Migration</div>
                        <div style={{ fontSize: 10.5, color: SM_T2, fontFamily: 'Inter, sans-serif' }}>Who moved between RFM segments this period vs last</div>
                      </div>
                    </div>

                    {/* Summary strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: `1px solid ${SM_BORDER}` }}>
                      {[
                        { label: 'TOTAL MOVED', value: fmtBig(totalMoved), sub: 'Customers who changed segment', valColor: SM_T1 },
                        { label: 'UPGRADED',    value: fmtBig(totalUp),    sub: `${totalMoved > 0 ? Math.round(totalUp/totalMoved*100) : 0}% of all moves`, valColor: SM_GREEN },
                        { label: 'DOWNGRADED',  value: fmtBig(totalDown),  sub: `${totalMoved > 0 ? Math.round(totalDown/totalMoved*100) : 0}% of all moves`, valColor: SM_RED },
                      ].map((k, i) => (
                        <div key={i} style={{ padding: '12px 16px', borderRight: i < 2 ? `1px solid ${SM_BORDER}` : 'none' }}>
                          <div style={{ fontSize: 9, fontWeight: 800, color: SM_T3, textTransform: 'uppercase', letterSpacing: '.09em', marginBottom: 4, fontFamily: 'Inter, sans-serif' }}>{k.label}</div>
                          <div style={{ fontSize: 22, fontWeight: 800, color: k.valColor, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.1, marginBottom: 3 }}>{k.value}</div>
                          <div style={{ fontSize: 10, color: SM_T2, fontFamily: 'Inter, sans-serif' }}>{k.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* Insight banner */}
                    <div style={{ background: SM_AMBER_SOFT, borderBottom: `1px solid ${SM_AMBER_LINE}`, padding: '9px 16px', fontSize: 11, color: SM_T1, lineHeight: 1.6, fontFamily: 'Inter, sans-serif' }}>
                      <span>{insightText}</span>
                      {biggestText && <span style={{ marginLeft: 6, color: SM_T2 }}>{biggestText}</span>}
                    </div>

                    {/* Two columns */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                      {/* Upgrades */}
                      <div style={{ padding: '12px 16px', borderRight: `1px solid ${SM_BORDER}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 20, height: 20, borderRadius: 5, background: SM_GREEN_SOFT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: SM_GREEN, fontWeight: 800 }}>↑</span>
                            <span style={{ fontSize: 11.5, fontWeight: 800, color: SM_T1, fontFamily: 'Inter, sans-serif' }}>Upgrades</span>
                          </div>
                          <span style={{ fontSize: 10, color: SM_T3, fontFamily: 'Inter, sans-serif' }}>{upgrades.length} paths</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {upgrades.length > 0 ? upgrades.map((row, i) => (
                            <MigRow key={i} row={row} max={maxUp} barColor={SM_GREEN} barBg={SM_GREEN_SOFT} />
                          )) : <div style={{ fontSize: 11, color: SM_T3, fontFamily: 'Inter, sans-serif' }}>No upgrades this period.</div>}
                        </div>
                      </div>
                      {/* Downgrades */}
                      <div style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 20, height: 20, borderRadius: 5, background: SM_RED_SOFT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: SM_RED, fontWeight: 800 }}>↓</span>
                            <span style={{ fontSize: 11.5, fontWeight: 800, color: SM_T1, fontFamily: 'Inter, sans-serif' }}>Downgrades</span>
                          </div>
                          <span style={{ fontSize: 10, color: SM_T3, fontFamily: 'Inter, sans-serif' }}>{downgrades.length} paths</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {downgrades.length > 0 ? downgrades.map((row, i) => (
                            <MigRow key={i} row={row} max={maxDown} barColor={SM_RED} barBg={SM_RED_SOFT} />
                          )) : <div style={{ fontSize: 11, color: SM_T3, fontFamily: 'Inter, sans-serif' }}>No downgrades this period.</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* 5. Purchase Frequency + Monetary Distribution */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                <RSCard title="Purchase Frequency" sub="Customers by order count bucket">
                  {freqDist.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(freqDist.length * 44 + 20, 200)}>
                      <BarChart data={freqDist} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 8 }}>
                        <CartesianGrid stroke={RS.borderSoft} horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: RS.t3 }} tickFormatter={fmtBig} />
                        <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: RS.t2 }} width={120} />
                        <Tooltip contentStyle={ttStyle} formatter={v => [fmtBig(v), 'Customers']} />
                        <Bar dataKey="customers" fill={RS.amberDeep} name="Customers" radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 10, fill: RS.t2, formatter: fmtBig }} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ color: RS.t3, fontSize: 12, padding: 12, textAlign: 'center' }}>No frequency data available.</div>
                  )}
                </RSCard>

                <RSCard title="Monetary Distribution" sub="Customers and revenue by spend tier">
                  {monetaryDist.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={monetaryDist} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                        <CartesianGrid stroke={RS.borderSoft} />
                        <XAxis dataKey="bucket" tick={{ fontSize: 9, fill: RS.t3 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 10, fill: RS.t3 }} tickFormatter={fmtBig} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: RS.t3 }} tickFormatter={fmtBig} />
                        <Tooltip contentStyle={ttStyle} formatter={(v, name) => [fmtBig(v), name]} />
                        <Bar yAxisId="left" dataKey="customers" fill={RS.amber} name="Customers" />
                        <Line yAxisId="right" dataKey="revenue" stroke={RS.amberDeep} strokeWidth={2} dot={false} name="Revenue" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ color: RS.t3, fontSize: 12, padding: 12, textAlign: 'center' }}>No monetary data available.</div>
                  )}
                </RSCard>
              </div>

              {/* 6. Inactivity Distribution */}
              <RSCard title="Inactivity Distribution" sub="Days since last purchase">
                {inactivity.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={inactivity} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                        <CartesianGrid stroke={RS.borderSoft} />
                        <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: RS.t3 }} />
                        <YAxis tick={{ fontSize: 10, fill: RS.t3 }} tickFormatter={fmtBig} />
                        <Tooltip contentStyle={ttStyle} formatter={v => [fmtBig(v), 'Customers']} />
                        <Bar dataKey="customers" name="Customers">
                          {inactivity.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={(entry.bucket || '').includes('90') ? RS.amberDeep : RS.amber} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{ fontSize: 11, color: RS.t2, marginTop: 8, padding: '6px 8px', background: RS.amberSoft, borderRadius: 6 }}>
                      {inact90 > 0 && (
                        <>
                          <strong>{fmtN(inact90)}</strong> customers have been inactive for 90+ days.
                          {hibSeg && <> Hibernating segment alone accounts for <strong>{fmt(hibSeg.totalRevenue || 0)}</strong> in lifetime revenue — a significant win-back opportunity.</>}
                        </>
                      )}
                      {inact90 === 0 && 'No customers in the 90+ day inactivity bucket.'}
                    </div>
                  </>
                ) : (
                  <div style={{ color: RS.t3, fontSize: 12, padding: 12, textAlign: 'center' }}>No inactivity data available.</div>
                )}
              </RSCard>

            </div>
          )
        })()}

        {activeTab === 'spend' && (() => {
          // ── Bug fixes:
          // Bug 1: discountDist has fields {bucket, firstOrders, repeatOrders} — not "discounted"/"nonDiscounted"
          // Bug 2: pie chart derived from same fields by summing across buckets
          // Bug 3: metaCac/googleCac don't exist in API — show "—" instead of ₹0

          const SD = {
            bg: '#FDFCF8', card: '#FFFFFF', border: '#E2D9C8', borderSoft: '#EDE7DA',
            t1: '#3A3324', t2: '#8A7F63', t3: '#B8AE93',
            amber: '#E8C578', amberDeep: '#C9A24F', amberSoft: '#FBF6E8', amberLine: '#F0E2BC',
            blue: '#4A7CC7', blueSoft: '#EBF1FB',
          }

          const pill = active => ({
            background: active ? SD.amberDeep : SD.amberSoft,
            color: active ? '#fff' : SD.t2,
            border: `1px solid ${active ? SD.amberDeep : SD.amberLine}`,
            borderRadius: 20, padding: '3px 12px', fontSize: 11,
            cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: active ? 700 : 400, outline: 'none',
          })

          // ── Build spend+sales chart data ──
          const spendBucketKey = (dateStr) => {
            if (!dateStr) return 'Unknown'
            if (spendGranularity === 'daily') return dateStr
            if (spendGranularity === 'weekly') {
              const d = new Date(dateStr)
              const day = d.getDay()
              const diff = d.getDate() - day + (day === 0 ? -6 : 1)
              const mon = new Date(d.setDate(diff))
              return mon.toISOString().slice(0, 10)
            }
            return dateStr.slice(0, 7)
          }
          const spendByDay2 = {}
          rawDailySpend.forEach(r => {
            const k = spendBucketKey(r.date || r.label || '')
            spendByDay2[k] = (spendByDay2[k] || 0) + (r.totalSpend || r.spend || 0)
          })
          const spendSalesMap = {}
          rawDaily.forEach(r => {
            const k = spendBucketKey(r.date || r.month || r.label || '')
            if (!spendSalesMap[k]) spendSalesMap[k] = { label: k, totalSpend: 0, grossSalesExcGst: 0, netRevenue: 0 }
            // grossSales in rawDaily is inc-GST; use proportion: grossExcGst/grossSales ratio to approximate
            const excRatio = (kpis.grossSales > 0 && kpis.grossExcGst > 0) ? kpis.grossExcGst / kpis.grossSales : 1
            const netRatio  = (kpis.grossSales > 0 && kpis.netRevenue > 0)  ? kpis.netRevenue  / kpis.grossSales : 0
            spendSalesMap[k].grossSalesExcGst += (r.grossSales || 0) * excRatio
            spendSalesMap[k].netRevenue       += (r.grossSales || 0) * netRatio
          })
          Object.entries(spendByDay2).forEach(([k, v]) => {
            if (!spendSalesMap[k]) spendSalesMap[k] = { label: k, totalSpend: 0, grossSalesExcGst: 0, netRevenue: 0 }
            spendSalesMap[k].totalSpend += v
          })
          const spendSalesData = Object.values(spendSalesMap).sort((a, b) => a.label < b.label ? -1 : 1).map(r => ({
            ...r,
            discountGiven: Math.max(0, r.grossSalesExcGst - r.netRevenue),
            discountPct: r.grossSalesExcGst > 0 ? parseFloat(((r.grossSalesExcGst - r.netRevenue) / r.grossSalesExcGst * 100).toFixed(1)) : 0,
          }))

          // ── RoAS per channel (use grossExcGst as revenue proxy) ──
          const grossRevForRoas = kpis.grossExcGst || kpis.grossSales || 0
          const metaRoAS   = kpis.metaSpend > 0 ? grossRevForRoas / kpis.metaSpend : 0
          const googleRoAS = kpis.googleSpend > 0 ? grossRevForRoas / kpis.googleSpend : 0
          const blendedRoAS = kpis.roas || 0
          const blendedCAC  = kpis.cac || 0

          const channelInsight = null

          // ── CAC zero-while-spend bug flag ──
          const cacMissing = (kpis.metaSpend > 0 || kpis.googleSpend > 0)

          // Discounted = any bucket with actual discount %, Non-Discounted = '0% (Full Price)' + 'No Price Data'
          const totalDiscountedOrders    = discountDist.filter(r => r.bucket !== '0%' && r.bucket !== 'No Price Data').reduce((s, r) => s + (r.totalOrders || 0), 0)
          const totalNonDiscountedOrders = discountDist.filter(r => r.bucket === '0%' || r.bucket === 'No Price Data').reduce((s, r) => s + (r.totalOrders || 0), 0)
          const totalAllOrders           = discountDist.reduce((s, r) => s + (r.totalOrders || 0), 0)
          const totalFirstOrders         = totalDiscountedOrders
          const totalRepeatOrders        = totalNonDiscountedOrders
          const totalRevAllBuckets       = discountDist.reduce((s, r) => s + (r.totalOrders || 0) * (r.aovExc || 0), 0)
          const discountDistWithRevPct   = discountDist.map(r => ({
            ...r,
            revPct: totalRevAllBuckets > 0 ? parseFloat(((r.totalOrders || 0) * (r.aovExc || 0) / totalRevAllBuckets * 100).toFixed(1)) : 0,
            repeatPct: (r.totalOrders || 0) > 0 ? parseFloat(((r.repeatOrders || 0) / (r.totalOrders || 0) * 100).toFixed(1)) : 0,
          }))

          const pieData = [
            { name: 'Discounted', value: totalDiscountedOrders },
            { name: 'Non-Discounted', value: totalNonDiscountedOrders },
          ]

          const discountedRev    = discountDist.filter(r => r.bucket !== '0%' && r.bucket !== 'No Price Data').reduce((s, r) => s + (r.totalOrders || 0) * (r.aovExc || 0), 0)
          const nonDiscountedRev = discountDist.filter(r => r.bucket === '0%' || r.bucket === 'No Price Data').reduce((s, r) => s + (r.totalOrders || 0) * (r.aovExc || 0), 0)
          const discountedAov    = totalDiscountedOrders > 0 ? discountedRev / totalDiscountedOrders : 0
          const nonDiscountedAov = totalNonDiscountedOrders > 0 ? nonDiscountedRev / totalNonDiscountedOrders : 0

          const cardStyle = { background: SD.card, borderRadius: 12, border: `1px solid ${SD.border}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(80,65,20,.04)' }
          const cardHead  = { background: SD.amberSoft, borderBottom: `1px solid ${SD.amberLine}`, padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
          const cardTitle = { fontSize: 11, fontWeight: 800, color: SD.t1, textTransform: 'uppercase', letterSpacing: '.07em', fontFamily: 'Inter, sans-serif' }
          const cardBody  = { padding: '14px 16px' }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 16px 24px' }}>


              {/* KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
                {(() => {
                  const paybackMonths = (kpis.cac > 0 && kpis.ltv12 > 0) ? (kpis.cac / (kpis.ltv12 / 12)) : null
                  const discountedBuckets = discountDist.filter(r => r.bucket !== '0%' && r.bucket !== 'No Price Data' && (r.avgDiscPct || 0) > 0)
                  const totalDiscOrders = discountedBuckets.reduce((s, r) => s + (r.totalOrders || 0), 0)
                  const totalDiscValue = discountedBuckets.reduce((s, r) => s + (r.totalOrders || 0) * (r.aovExc || 0) * ((r.avgDiscPct || 0) / 100), 0)
                  const discValuePerOrder = totalDiscOrders > 0 ? totalDiscValue / totalDiscOrders : null
                  const avgDiscPctOverall = totalDiscOrders > 0 ? discountedBuckets.reduce((s, r) => s + (r.avgDiscPct || 0) * (r.totalOrders || 0), 0) / totalDiscOrders : null
                  return [
                    { label: 'Total Spend', value: fmt(kpis.totalSpend || 0), sub: `Meta ${fmt(kpis.metaSpend || 0)} · Google ${fmt(kpis.googleSpend || 0)}${kpis.additionalSpend > 0 ? ` · Add. ${fmt(kpis.additionalSpend)}` : ''}` },
                    { label: 'Blended RoAS', value: `${blendedRoAS.toFixed(2)}×`, sub: 'Gross Rev (ex GST) / Spend' },
                    { label: 'Blended CAC', value: fmt(blendedCAC), sub: 'Total Spend / New Customers' },
                    { label: 'Payback Period', value: paybackMonths != null ? `${paybackMonths.toFixed(1)} mo` : '—', sub: 'CAC ÷ Monthly Rev per Customer' },
                    { label: 'Discounted Order Share', value: totalAllOrders > 0 ? `${(totalFirstOrders / totalAllOrders * 100).toFixed(1)}%` : '—', sub: totalAllOrders > 0 ? `${fmtN(totalFirstOrders)} of ${fmtN(totalAllOrders)} orders` : 'No data' },
                    { label: 'Avg Discount / Order', value: discValuePerOrder != null ? fmt(discValuePerOrder) : '—', sub: avgDiscPctOverall != null ? `${avgDiscPctOverall.toFixed(1)}% avg discount on discounted orders` : 'Avg ₹ discount on discounted orders' },
                  ]
                })().map((k, i) => (
                  <div key={i} style={{ background: SD.card, borderRadius: 12, padding: '12px 14px', border: `1px solid ${SD.border}` }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: SD.t3, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4, fontFamily: 'Inter, sans-serif' }}>{k.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: SD.t1, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.1, marginBottom: 3 }}>{k.value}</div>
                    <div style={{ fontSize: 10, color: SD.t2, fontFamily: 'Inter, sans-serif' }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Spend vs Sales */}
              <div style={cardStyle}>
                <div style={cardHead}>
                  <span style={cardTitle}>Spend vs Sales</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {['daily', 'weekly', 'monthly'].map(g => (
                      <button key={g} style={pill(spendGranularity === g)} onClick={() => setSpendGranularity(g)}>
                        {g.charAt(0).toUpperCase() + g.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={cardBody}>
                  <ResponsiveContainer width="100%" height={240}>
                    <ComposedChart data={spendSalesData} margin={{ top: 4, right: 20, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={SD.borderSoft} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: SD.t3 }} />
                      <YAxis yAxisId="spend" orientation="left" tick={{ fontSize: 10, fill: SD.t3 }} tickFormatter={v => fmtBig(v)} />
                      <YAxis yAxisId="sales" orientation="right" tick={{ fontSize: 10, fill: SD.t3 }} tickFormatter={v => fmtBig(v)} />
                      <Tooltip contentStyle={{ background: '#fff', border: `1px solid ${SD.border}`, borderRadius: 7, fontSize: 11 }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0]?.payload
                          return (
                            <div style={{ background: '#fff', border: `1px solid ${SD.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 11 }}>
                              <div style={{ fontWeight: 700, color: SD.t1, marginBottom: 4 }}>{label}</div>
                              {payload.filter(p => p.dataKey !== 'discountGiven').map((p, i) => (
                                <div key={i} style={{ color: SD.t1 }}>{p.name}: {fmt(p.value)}</div>
                              ))}
                              <div style={{ color: '#E07000', marginTop: 2 }}>Discount Given: {fmt(d?.discountGiven)} <span style={{ fontWeight: 700 }}>({d?.discountPct}%)</span></div>
                            </div>
                          )
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Inter, sans-serif' }} formatter={v => <span style={{ color: '#13121A' }}>{v}</span>} />
                      <Bar yAxisId="spend" dataKey="totalSpend" fill={SD.amber} name="Total Spend" maxBarSize={40} radius={[3,3,0,0]} />
                      <Line yAxisId="sales" dataKey="grossSalesExcGst" stroke={SD.blue} strokeWidth={2} dot={false} name="Gross Sales (ex GST)" />
                      <Line yAxisId="sales" dataKey="netRevenue" stroke={SD.t1} strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="Net Revenue" />
                      <Line yAxisId="sales" dataKey="discountGiven" stroke="#E07000" strokeWidth={1.5} strokeDasharray="3 2" dot={false} name="Discount Given" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Discount Distribution + Donut */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={cardStyle}>
                  <div style={cardHead}>
                    <span style={cardTitle}>Discount Distribution</span>
                    <span style={{ fontSize: 10, color: SD.t3, fontStyle: 'italic' }}>Actual % off MRP (Listing Price) · New vs Repeat · AOV line</span>
                  </div>
                  <div style={cardBody}>
                    {discountDist.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <ComposedChart data={discountDistWithRevPct} margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
                          <CartesianGrid stroke={SD.borderSoft} />
                          <XAxis dataKey="bucket" tick={{ fontSize: 9.5, fill: SD.t3 }} />
                          <YAxis yAxisId="orders" tick={{ fontSize: 10, fill: SD.t3 }} tickFormatter={v => fmtBig(v)} />
                          <YAxis yAxisId="aov" orientation="right" tick={{ fontSize: 10, fill: SD.t3 }} tickFormatter={v => fmt(v)} />
                          <YAxis yAxisId="pct" orientation="right" hide />
                          <Tooltip contentStyle={{ background: '#fff', border: `1px solid ${SD.border}`, borderRadius: 7, fontSize: 11, color: SD.t1 }} formatter={(v, name) => [name === 'AOV (ex GST)' ? fmt(v) : (name === 'Avg Disc %' || name === 'Revenue %' || name === 'Repeat Customer %') ? `${v}%` : fmtN(v), name]} labelStyle={{ color: SD.t1, fontWeight: 700 }} itemStyle={{ color: SD.t1 }} />
                          <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Inter, sans-serif' }} formatter={v => <span style={{ color: '#13121A' }}>{v}</span>} />
                          <Bar yAxisId="orders" dataKey="totalOrders" fill={SD.amberDeep} name="Total Orders" radius={[3,3,0,0]} />
                          <Line yAxisId="aov" type="monotone" dataKey="aovExc" stroke={SD.t1} strokeWidth={2} dot={{ r: 3, fill: SD.t1 }} name="AOV (ex GST)" />
                          <Line yAxisId="pct" type="monotone" dataKey="avgDiscPct" stroke="#E07000" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 3, fill: '#E07000' }} name="Avg Disc %" />
                          <Line yAxisId="pct" type="monotone" dataKey="revPct" stroke="#2E74CC" strokeWidth={1.5} strokeDasharray="2 2" dot={{ r: 3, fill: '#2E74CC' }} name="Revenue %" />
                          <Line yAxisId="pct" type="monotone" dataKey="repeatPct" stroke="#7C6F3E" strokeWidth={1.5} strokeDasharray="3 2" dot={{ r: 3, fill: '#7C6F3E' }} name="Repeat Customer %" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ color: SD.t3, fontSize: 12, padding: 12, textAlign: 'center' }}>No discount data.</div>
                    )}
                  </div>
                </div>

                {/* Discounted vs Non-Discounted — redesigned */}
                <div style={cardStyle}>
                  <div style={cardHead}>
                    <div>
                      <span style={cardTitle}>Discounted vs Non-Discounted Orders</span>
                      <div style={{ fontSize: 10, color: SD.t3, fontFamily: 'Inter, sans-serif', marginTop: 2 }}>Order volume and basket size, this period</div>
                    </div>
                  </div>
                  <div style={{ padding: '12px 16px 0' }}>
                    {totalAllOrders > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                        {/* Donut with center label */}
                        <div style={{ position: 'relative', flexShrink: 0, width: 160, height: 160 }}>
                          <ResponsiveContainer width={160} height={160}>
                            <PieChart>
                              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={72} paddingAngle={2}>
                                <Cell fill="#C9A24F" />
                                <Cell fill="#E4DAC0" />
                              </Pie>
                              <Tooltip contentStyle={{ background: '#fff', border: `1px solid ${SD.border}`, borderRadius: 7, fontSize: 11 }} formatter={(v, name) => [fmtN(v), name]} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 800, color: SD.t1, lineHeight: 1.2 }}>{fmtN(totalAllOrders)}</div>
                            <div style={{ fontSize: 8, color: SD.t3, fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '.05em' }}>total</div>
                          </div>
                        </div>
                        {/* Stat rows */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          {[
                            { name: 'Discounted', color: '#C9A24F', orders: totalDiscountedOrders, rev: discountedRev, aov: discountedAov, repeatData: discountRepeatRateByFirst.find(r => r.type === 'Discounted') },
                            { name: 'Non-Discounted', color: '#E4DAC0', orders: totalNonDiscountedOrders, rev: nonDiscountedRev, aov: nonDiscountedAov, repeatData: discountRepeatRateByFirst.find(r => r.type === 'Non-Discounted') },
                          ].map((g, i) => (
                            <div key={i}>
                              {i > 0 && <div style={{ borderTop: `1px solid ${SD.borderSoft}`, margin: '10px 0' }} />}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                  <div style={{ width: 10, height: 10, borderRadius: 2, background: g.color, flexShrink: 0, marginTop: 3 }} />
                                  <div>
                                    <div style={{ fontSize: 10, color: SD.t2, fontFamily: 'Inter, sans-serif' }}>{g.name}</div>
                                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 15, fontWeight: 700, color: SD.t1 }}>{fmtN(g.orders)}</div>
                                    <div style={{ fontSize: 10, color: SD.t3, fontFamily: 'Inter, sans-serif' }}>{totalAllOrders > 0 ? (g.orders / totalAllOrders * 100).toFixed(1) : 0}% of orders</div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: 0, textAlign: 'right' }}>
                                  <div style={{ width: 100 }}>
                                    <div style={{ fontSize: 10, color: SD.t3, fontFamily: 'Inter, sans-serif' }}>Avg AOV</div>
                                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: SD.t1 }}>₹{Math.round(g.aov).toLocaleString('en-IN')}</div>
                                    <div style={{ fontSize: 10, color: SD.t3, fontFamily: 'Inter, sans-serif' }}>{totalRevAllBuckets > 0 ? (g.rev / totalRevAllBuckets * 100).toFixed(1) : 0}% of rev</div>
                                  </div>
                                  <div style={{ width: 110, borderLeft: `1px solid ${SD.borderSoft}`, paddingLeft: 12 }}>
                                    <div style={{ fontSize: 10, color: SD.t3, fontFamily: 'Inter, sans-serif' }}>Repeat Rate</div>
                                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: SD.t1 }}>{g.repeatData ? `${g.repeatData.repeatRate}%` : '—'}</div>
                                    <div style={{ fontSize: 10, color: SD.t3, fontFamily: 'Inter, sans-serif' }}>{g.repeatData ? `${fmtN(g.repeatData.repeatCustomers)} came back` : ''}</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: SD.t3, fontSize: 12, padding: 12, textAlign: 'center' }}>No data.</div>
                    )}
                  </div>
                  {/* Footer */}
                  {totalAllOrders > 0 && (
                    <div style={{ margin: '12px 16px 0', borderTop: `1px solid ${SD.borderSoft}`, padding: '8px 0 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 10, color: SD.t1, fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '.06em' }}>Total Orders Analyzed</div>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 800, color: SD.t1 }}>{fmtN(totalAllOrders)}</div>
                    </div>
                  )}
                  <div style={{ height: 2 }} />
                </div>
              </div>


              {/* Category-wise Discount Analysis */}
              {categoryDiscountAnalysis.length > 0 && (
                <div style={cardStyle}>
                  <div style={cardHead}>
                    <span style={cardTitle}>Category-wise Discount Analysis</span>
                    <span style={{ fontSize: 10, color: SD.t3, fontStyle: 'italic' }}>Order volume · % orders discounted · Avg discount depth · Repeat order %</span>
                  </div>
                  <div style={cardBody}>
                    <ResponsiveContainer width="100%" height={360}>
                      <ComposedChart data={categoryDiscountAnalysis} margin={{ top: 8, right: 48, bottom: 70, left: 8 }}>
                        <CartesianGrid stroke={SD.borderSoft} vertical={false} />
                        <XAxis dataKey="category" tick={{ fontSize: 10, fill: SD.t2 }} angle={-35} textAnchor="end" interval={0} />
                        <YAxis yAxisId="orders" tick={{ fontSize: 10, fill: SD.t3 }} tickFormatter={v => fmtBig(v)} />
                        <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: SD.t3 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{ background: '#fff', border: `1px solid ${SD.border}`, borderRadius: 7, fontSize: 11, color: SD.t1 }}
                          labelStyle={{ color: SD.t1, fontWeight: 700 }}
                          itemStyle={{ color: SD.t1 }}
                          formatter={(v, name) => {
                            if (name === 'Total Orders') return [fmtN(v), name]
                            if (name === 'AOV') return [fmt(v), name]
                            return [`${v}%`, name]
                          }}
                        />
                        <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 10, fontFamily: 'Inter, sans-serif', paddingTop: 8, bottom: 0 }} formatter={v => <span style={{ color: '#13121A' }}>{v}</span>} />
                        <Bar yAxisId="orders" dataKey="totalOrders" name="Total Orders" fill={SD.amberDeep} radius={[3,3,0,0]} maxBarSize={36} />
                        <Line yAxisId="pct" type="monotone" dataKey="discountedOrderPct" name="% Orders Discounted" stroke="#E07000" strokeWidth={2} dot={{ r: 3, fill: '#E07000' }} />
                        <Line yAxisId="pct" type="monotone" dataKey="avgDiscPct" name="Avg Disc %" stroke="#2E74CC" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3, fill: '#2E74CC' }} />
                        <Line yAxisId="pct" type="monotone" dataKey="repeatOrderPct" name="Repeat Order %" stroke="#7C6F3E" strokeWidth={2} strokeDasharray="3 2" dot={{ r: 3, fill: '#7C6F3E' }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

            </div>
          )
        })()}

      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading, null = no session
  const [profile, setProfile] = useState(null)
  const [allowedTabs, setAllowedTabs] = useState(null)

  useEffect(() => {
    if (window.location.hash.includes('type=recovery')) {
      setSession('recovery')
      return
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => { if (!window._suppressAuth) setSession(s || null) })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session || session === 'recovery') return
    supabase.from('user_profiles').select('*').eq('user_id', session.user.id).single()
      .then(({ data, error }) => {
        if (error) console.error('profile fetch error:', error)
        setProfile(data || { is_admin: false })
      })
    supabase.from('user_permissions').select('tab').eq('user_id', session.user.id)
      .then(({ data }) => setAllowedTabs(data ? data.map(r => r.tab) : []))
  }, [session])

  if (session === undefined) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F1E8', fontFamily: 'sans-serif', color: '#7A8079' }}>Loading…</div>
  )
  if (session === 'recovery') return <ResetPasswordPage />
  if (!session) return <LoginPage onLogin={s => setSession(s)} />

  // Wait for profile to load before rendering Dashboard so isAdmin check is accurate
  if (!profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F1E8', fontFamily: 'sans-serif', color: '#7A8079' }}>Loading…</div>
  )

  const isAdmin = profile.is_admin === true
  const effectiveTabs = isAdmin ? null : allowedTabs // null means all tabs visible

  return <Dashboard session={session} profile={profile} allowedTabs={effectiveTabs} onSignOut={() => setSession(null)} onProfileUpdated={() => supabase.from('user_profiles').select('*').eq('user_id', session.user.id).single().then(({ data }) => { if (data) setProfile(data) })} />
}

function DocumentsPage({ setPage }) {
  const docs = [
    {
      id: 'cogs',
      title: 'COGS Ledger',
      description: 'Manage cost of goods sold by SKU and month.',
      icon: '💰',
    },
    {
      id: 'logistics-ledger',
      title: 'Logistics Bill Ledger',
      description: 'Track B2B freight & B2C courier invoices line by line.',
      icon: '🚚',
    },
  ]
  return (
    <div style={{ padding: '32px 40px', maxWidth: 900 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#7A8079', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8 }}>Documents</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20, marginTop: 24 }}>
        {docs.map(doc => (
          <div key={doc.id} onClick={() => setPage(doc.id)}
            style={{ background: '#fff', border: '1.5px solid #E8E4DA', borderRadius: 16, padding: '28px 24px', cursor: 'pointer', transition: 'box-shadow .15s, border-color .15s', display: 'flex', flexDirection: 'column', gap: 12 }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = '#2F6A45' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#E8E4DA' }}
          >
            <div style={{ fontSize: 32 }}>{doc.icon}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#1A2B22', marginBottom: 4 }}>{doc.title}</div>
              <div style={{ fontSize: 12.5, color: '#7A8079', lineHeight: 1.5 }}>{doc.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const TAB_PRIORITY = ['overview', 'sales', 'ads', 'logistics', 'inventory', 'customer', 'documents']

function Dashboard({ session, profile, allowedTabs, onSignOut, onProfileUpdated }) {
  const [page, setPage] = useState(allowedTabs?.length ? (TAB_PRIORITY.find(t => allowedTabs.includes(t)) || allowedTabs[0]) : 'overview')
  const [invTab, setInvTab] = useState('health')
  const [customerTab, setCustomerTab] = useState('overview')

  useEffect(() => {
    if (allowedTabs?.length && !allowedTabs.includes(page)) {
      setPage(TAB_PRIORITY.find(t => allowedTabs.includes(t)) || allowedTabs[0])
    }
  }, [allowedTabs])
  const def = getDefaultDates()
  const [filters, setFilters] = useState({ start: def.start, end: def.end, category: [], subCategory: [], sku: [], subChannel: '', voucher: '', region: [], tier: [], state: [], city: '', channelGroup: [] })
  const [activeTab, setActiveTab] = useState('all')
  const [salesChannelView, setSalesChannelView] = useState('all')
  const [salesOfflineSub, setSalesOfflineSub] = useState('all')
  const [rawRows, setRawRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [logisticsData, setLogisticsData] = useState(null)
  const [inventoryDateControl, setInventoryDateControl] = useState(null)

  const API = import.meta.env.VITE_API_URL || ''
  const reqIdRef = useRef(0)
  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab
  // Client-side cache: key → response data. Cleared when dates change.
  const clientCacheRef = useRef(new Map())

  const fetchData = useCallback(async (start, end, extraFilters = {}, keepPrev = false) => {
    const ch = TAB_TO_CHANNEL[activeTabRef.current] || null
    const cacheKey = JSON.stringify({ start, end, ...extraFilters, channel: ch })

    // Client-side cache hit: skip fetch entirely
    if (keepPrev && clientCacheRef.current.has(cacheKey)) {
      setRawRows(prev => {
        const cached = clientCacheRef.current.get(cacheKey)
        if (prev && typeof prev === 'object' && !Array.isArray(prev)) return { ...prev, ...cached }
        return cached
      })
      return
    }

    const reqId = ++reqIdRef.current
    if (!keepPrev) setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/api/bq`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start, end, ...extraFilters, ...(ch ? { channel: ch } : {}) }) })
      if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
      const json = await res.json()
      if (reqId !== reqIdRef.current) return // stale response, ignore
      const next = json.source === 'postgres-aggregated' ? json : (json.totalRev !== undefined ? json : (json.rows || []))
      clientCacheRef.current.set(cacheKey, next)
      setRawRows(prev => {
        if (keepPrev && prev && typeof prev === 'object' && !Array.isArray(prev)) return { ...prev, ...next }
        return next
      })
    } catch (e) { if (reqId === reqIdRef.current) setError(e.message) }
    finally { if (reqId === reqIdRef.current) setLoading(false) }
  }, [API])

  const debounceRef = useRef(null)
  const prevDateRef = useRef({ start: null, end: null })
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  useEffect(() => {
    if (!filters.start || !filters.end) return
    clearTimeout(debounceRef.current)
    const dateChanged = filters.start !== prevDateRef.current.start || filters.end !== prevDateRef.current.end
    if (dateChanged) { prevDateRef.current = { start: filters.start, end: filters.end }; setRawRows(null) }
    debounceRef.current = setTimeout(() => {
      const { start, end, category, subCategory, sku, subChannel, voucher, region, tier, state, city, country, paymentType, channelGroup } = filtersRef.current
      const extra = {}
      if (category?.length) extra.category = category.join(',')
      if (subCategory?.length) extra.subCategory = subCategory.join(',')
      if (sku?.length) extra.sku = sku.join(',')
      if (subChannel) extra.subChannel = subChannel
      if (voucher) extra.voucher = voucher
      if (region?.length) extra.region = region.join(',')
      if (tier?.length) extra.tier = tier.join(',')
      if (state?.length) extra.state = state.join(',')
      if (city) extra.city = city
      if (country) extra.country = country
      if (paymentType) extra.paymentType = paymentType
      if (channelGroup?.length) extra.channelGroup = channelGroup.join(',')
      fetchData(start, end, extra)
      // Fetch logistics summary for Overview tab
      fetch(`${API}/api/logistics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start, end, shipmentType: 'forward' }) })
        .then(r => r.ok ? r.json() : null).then(j => { if (j) setLogisticsData(j) }).catch(() => {})
    }, 600)
    return () => clearTimeout(debounceRef.current)
  }, [filters.start, filters.end, filters.category, filters.subCategory, filters.sku, filters.subChannel, filters.voucher, filters.region, filters.tier, filters.state, filters.city, filters.country, filters.paymentType, filters.channelGroup, fetchData])

  const data = useMemo(() => { if (!rawRows) return null; if (rawRows.source === 'postgres-aggregated' || rawRows.totalRev !== undefined) return rawRows; return processData(rawRows) }, [rawRows])
  const alerts = useMemo(() => data ? detectAlerts(data) : [], [data])


  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} invTab={invTab} setInvTab={setInvTab} allowedTabs={allowedTabs} profile={profile} />
      <div className="app-main">
        <Topnav page={page} customerTab={customerTab} invTab={invTab} setInvTab={setInvTab} alerts={alerts} onRefresh={() => { const { start, end, category, subCategory, sku, subChannel, voucher, region, tier, state, city, country } = filters; const e = {}; if (category?.length) e.category = category.join(','); if (subCategory?.length) e.subCategory = subCategory.join(','); if (sku?.length) e.sku = sku.join(','); if (subChannel) e.subChannel = subChannel; if (voucher) e.voucher = voucher; if (region?.length) e.region = region.join(','); if (tier?.length) e.tier = tier.join(','); if (state?.length) e.state = state.join(','); if (city) e.city = city; if (country) e.country = country; fetchData(start, end, e) }} loading={loading} filters={filters} setFilters={setFilters} rawRows={rawRows} inventoryDateControl={inventoryDateControl} salesActiveTab={activeTab} setSalesActiveTab={setActiveTab} salesData={data} salesChannelView={salesChannelView} setSalesChannelView={setSalesChannelView} salesOfflineSub={salesOfflineSub} setSalesOfflineSub={setSalesOfflineSub} />
        {(loading || inventoryDateControl?.loading) && (
          <div style={{ height: 2, background: C.border, flexShrink: 0 }}>
            <div className="progress-bar" style={{ height: '100%', background: C.acc }} />
          </div>
        )}
        {error && (
          <div style={{ margin: '12px 16px 0', padding: '10px 13px', borderRadius: 9, background: C.red.bg, border: `1px solid ${C.red.bd}`, color: C.red.tx, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⚠ {error}</span>
            <button onClick={() => fetchData(filters.start, filters.end)} style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 8px', borderRadius: 5, border: `1px solid ${C.red.bd}`, background: 'transparent', color: C.red.tx, cursor: 'pointer', fontFamily: 'var(--font)' }}>Retry</button>
          </div>
        )}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!data && !loading && !error && page !== 'logistics' && page !== 'inventory' && page !== 'documents' && page !== 'cogs' && page !== 'logistics-ledger' && page !== 'logistics-cost' && page !== 'profile' && page !== 'logistics-cost' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: C.acl, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📊</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.t1, marginBottom: 4 }}>Frido Intelligence Suite</div>
                <div style={{ fontSize: 12, color: C.t3, marginBottom: 16 }}>Select a date range to load data</div>
                <button onClick={() => fetchData(filters.start, filters.end)} style={{ fontSize: 13, padding: '10px 22px', borderRadius: 10, background: C.acc, color: '#13121A', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}>
                  Load {filters.start} → {filters.end}
                </button>
              </div>
            </div>
          )}
          {loading && !data && page !== 'logistics' && page !== 'inventory' && page !== 'documents' && page !== 'cogs' && page !== 'logistics-ledger' && page !== 'logistics-cost' && page !== 'profile' && page !== 'logistics-cost' && <Skeleton />}
          {page === 'overview' && data && (!allowedTabs || allowedTabs.includes('overview')) && (
            <div className="page-scroll">
              <OverviewPage data={data} alerts={alerts} logisticsData={logisticsData} filters={filters} />
            </div>
          )}
          {page === 'sales' && data && (!allowedTabs || allowedTabs.includes('sales')) && <SalesPage data={data} filters={filters} setFilters={setFilters} activeTab={activeTab} setActiveTab={setActiveTab} fetchData={fetchData} channelView={salesChannelView} setChannelView={setSalesChannelView} offlineSub={salesOfflineSub} setOfflineSub={setSalesOfflineSub} />}
          {page === 'pnl' && data && <PnLPage data={data} filters={filters} setFilters={setFilters} />}
          {page === 'ads' && data && (!allowedTabs || allowedTabs.includes('ads')) && (
            <div className="page-scroll">
              <AdsTab data={data} filters={filters} />
            </div>
          )}
          {page === 'intelligence' && (
            <div className="page-scroll">
              <IntelPage data={data} />
            </div>
          )}
          {page === 'logistics' && (!allowedTabs || allowedTabs.includes('logistics')) && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <LogisticsPage filters={filters} />
            </div>
          )}
          {page === 'logistics-cost' && (!allowedTabs || allowedTabs.includes('logistics')) && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <LogisticsCostPage />
            </div>
          )}
          {page === 'inventory' && (!allowedTabs || allowedTabs.includes('inventory')) && (
            <div className="page-scroll" style={{ padding: 0 }}>
              <InventoryPage onTopbarDateControl={setInventoryDateControl} tab={invTab} setTab={setInvTab} />
            </div>
          )}
          {page === 'customer' && data && (!allowedTabs || allowedTabs.includes('customer')) && (
            <div className="page-scroll" style={{ padding: 0 }}>
              <CustomerPage filters={filters} activeTab={customerTab} setActiveTab={setCustomerTab} />
            </div>
          )}
          {page === 'documents' && (
            <div className="page-scroll">
              <DocumentsPage setPage={setPage} />
            </div>
          )}
          {page === 'cogs' && (
            <div className="page-scroll">
              <CogsPage />
            </div>
          )}
          {page === 'logistics-ledger' && (
            <div className="page-scroll">
              <LogisticsLedgerPage />
            </div>
          )}
          {page === 'profile' && (
            <div className="page-scroll">
              <ProfilePage session={session} profile={profile} onSignOut={onSignOut} onProfileUpdated={onProfileUpdated} />
            </div>
          )}
        </div>
      </div>
      <BottomNav page={page} setPage={setPage} allowedTabs={allowedTabs} profile={profile} />
    </div>
  )
}
