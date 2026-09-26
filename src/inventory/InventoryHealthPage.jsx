import React, { useState, useMemo, useRef, useEffect, useCallback, Children } from 'react'
import {
  IC, fmtNum, fmtInt, fmtDays, GlassCard, KpiTile, StatusChip, SearchableMultiSelect, DraggableTh, SortableTh, ExportButton, PillToggle,
} from './theme.jsx'

// Mobile: horizontal swipe carousel with header + dots. Desktop: normal 7-col grid.
function KpiCarousel({ children }) {
  const count = Children.count(children)
  const scrollRef = useRef(null)
  const [activeIdx, setActiveIdx] = useState(0)

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const cardW = 160 + 10 // card width + gap
    setActiveIdx(Math.min(count - 1, Math.round(el.scrollLeft / cardW)))
  }, [count])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [onScroll])

  return (
    <>
      {/* Mobile carousel — shown via CSS */}
      <div className="inv-kpi-carousel-wrap" style={{ display: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: IC.t1 }}>Key Metrics</span>
          <span style={{ fontSize: 11, color: IC.t3 }}>{count} tiles · swipe →</span>
        </div>
        <div ref={scrollRef} className="inv-kpi-grid" style={{ display: 'flex', gap: 10 }}>
          {children}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 10 }}>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} style={{ width: i === activeIdx ? 16 : 6, height: 6, borderRadius: 3, background: i === activeIdx ? IC.acc : '#C7C7CE', transition: 'all .2s' }} />
          ))}
        </div>
      </div>
      {/* Desktop grid */}
      <div className="inv-kpi-desktop-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`, gap: 10, alignItems: 'stretch' }}>
        {children}
      </div>
    </>
  )
}

// Mobile: horizontal swipe carousel for Warehouse Health. Desktop: GlassCard grid.
function WhCarousel({ locations, filters, facilityTypes }) {
  // Must match the same filtering `cards` applies below (a location with no facility of the
  // active type renders no card at all) — otherwise the "N locations" label and dot-indicator
  // count would overcount past however many cards are actually visible.
  const hasByFacilityType = locations?.some(loc => loc.byFacilityType?.length > 0)
  const activeTypesForCount = (facilityTypes?.length > 0 && hasByFacilityType) ? facilityTypes : null
  const visibleLocations = activeTypesForCount
    ? locations.filter(loc => (loc.byFacilityType || []).some(f => activeTypesForCount.includes(f.facilityType) && f.totalInvt > 0))
    : locations
  const count = visibleLocations.length
  const scrollRef = useRef(null)
  const [activeIdx, setActiveIdx] = useState(0)

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const cardW = 180 + 8
    setActiveIdx(Math.min(count - 1, Math.round(el.scrollLeft / cardW)))
  }, [count])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [onScroll])

  // Each card's inventory figures (totalInvt/rtdInvt/rawInvt/rawBlockedInvt) are swapped for
  // the sum of just `facilityTypes` at this location — via loc.byFacilityType, computed once
  // per location at cache-generation time. avgSale/doi/allocationPct are left as the
  // location's own unfiltered values: sales/allocation data has no facility identity to split
  // by (only Location grain — see generate-inv-cache.mjs), so a "facility-type-specific DOI"
  // isn't something we actually have data for and showing one would misrepresent the number.
  const activeTypes = hasByFacilityType ? activeTypesForCount : null
  // A location with NO facility of the active type(s) (e.g. DEL has only non-Regular
  // facilities) must not render a card at all — previously every location was mapped
  // unconditionally and just had its numbers summed to zero, producing an empty "—/no data"
  // card for a facility type that was never supposed to appear on this (Regular-only) carousel.
  const cards = visibleLocations
    .map(loc => {
      let cardLoc = loc
      if (activeTypes) {
        const matches = (loc.byFacilityType || []).filter(f => activeTypes.includes(f.facilityType))
        const summed = matches.reduce((acc, f) => ({
          totalInvt: acc.totalInvt + f.totalInvt, rtdInvt: acc.rtdInvt + f.rtdInvt,
          rawInvt: acc.rawInvt + f.rawInvt, rawBlockedInvt: acc.rawBlockedInvt + f.rawBlockedInvt,
        }), { totalInvt: 0, rtdInvt: 0, rawInvt: 0, rawBlockedInvt: 0 })
        cardLoc = { ...loc, ...summed }
      }
      return <WarehouseCard key={loc.location} loc={cardLoc} selected={filters.location?.length > 0 && filters.location.includes(loc.location)} />
    })

  return (
    <>
      {/* Mobile carousel */}
      <div className="inv-wh-carousel-wrap" style={{ display: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: IC.t1 }}>Warehouse Health</span>
          <span style={{ fontSize: 11, color: IC.t3 }}>{count} locations · swipe →</span>
        </div>
        <div ref={scrollRef} className="inv-wh-grid-mob" style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', paddingBottom: 4, scrollbarWidth: 'none' }}>
          {cards}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 10 }}>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} style={{ width: i === activeIdx ? 16 : 6, height: 6, borderRadius: 3, background: i === activeIdx ? IC.acc : '#C7C7CE', transition: 'all .2s' }} />
          ))}
        </div>
      </div>
      {/* Desktop GlassCard grid */}
      <div className="inv-wh-desktop-wrap">
        <GlassCard title="Warehouse Health" note={`${count} locations`}>
          <div className="inv-wh-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(count, 1)}, 1fr)`, gap: 8 }}>
            {cards}
          </div>
        </GlassCard>
      </div>
    </>
  )
}

// Mobile inventory detail table — sticky Product ID, scrolled to right on mount so
// Inventory/Avg Sale/DOI are visible by default; Sub-cat revealed by scrolling left.
const MobDetailTable = React.memo(function MobDetailTable({ filteredSkus, tableTotals, expandedSku, setExpandedSku, TABLE_SCROLL_HEIGHT }) {
  const scrollRef = useRef(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 250
  }, [])

  const P = '5px 6px'
  const W = { sku: 139, sub: 250, inv: 68, avg: 65, doi: 50 }
  const ths = IC.t3, th1 = IC.t1, th2 = IC.t2
  const nb = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const stickyTd = (bg) => ({ position: 'sticky', left: 0, zIndex: 2, background: bg, padding: P, ...nb })

  return (
    <div className="inv-detail-mobile-only" ref={scrollRef} style={{ maxHeight: TABLE_SCROLL_HEIGHT, overflow: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 9.2, tableLayout: 'fixed', width: W.sku + W.sub + W.inv + W.avg + W.doi }}>
        <colgroup>
          <col style={{ width: W.sku }} /><col style={{ width: W.sub }} />
          <col style={{ width: W.inv }} /><col style={{ width: W.avg }} /><col style={{ width: W.doi }} />
        </colgroup>
        <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: IC.surface }}>
          <tr>
            {[
              { label: 'Product ID', sticky: true, align: 'left' },
              { label: 'Sub-cat', align: 'left' },
              { label: 'Inventory', align: 'right' },
              { label: 'Avg Sale', align: 'right' },
              { label: 'DOI', align: 'right' },
            ].map((col, ci) => (
              <th key={ci} style={{
                padding: P, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
                color: ths, textAlign: col.align, whiteSpace: 'nowrap', overflow: 'hidden',
                ...(col.sticky ? { position: 'sticky', left: 0, zIndex: 4, background: IC.surface } : {}),
              }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Divider as a real row (genuine table content, 1px tall) — a filler <tr> nested
              INSIDE the sticky <thead> (with its own sticky-left cell) broke the thead's own
              sticky behavior on scroll — putting it here, as the first <tbody> row, avoids the
              nested-sticky-context problem while still sitting flush under the header. */}
          <tr style={{ height: 1 }}>
            <td style={{ padding: 0, height: 1, background: IC.border, position: 'sticky', left: 0, zIndex: 4 }} />
            <td colSpan={4} style={{ padding: 0, height: 1, background: IC.border }} />
          </tr>
          {filteredSkus.map((s, i) => (
            <React.Fragment key={`mob-${s.skuKey || 'sku'}-${i}`}>
              <tr onClick={() => setExpandedSku(s.skuKey)}
                style={{ borderBottom: `1px solid ${IC.border}`, cursor: 'pointer', height: 30 }}>
                <td style={{ ...stickyTd(IC.surface), fontWeight: 600, color: th1 }}>
                  <span style={{ color: ths, marginRight: 3, display: 'inline-block', transform: expandedSku === s.skuKey ? 'rotate(90deg)' : 'none', transition: 'transform .15s', fontSize: 10 }}>›</span>
                  {s.sku}
                </td>
                <td style={{ padding: P, color: th2, ...nb }}>{s.subCategory}</td>
                <td style={{ padding: P, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtInt(s.totalInvt)}</td>
                <td style={{ padding: P, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtInt(s.avgSale)}</td>
                <td style={{ padding: P, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtDays(s.doi)}d</td>
              </tr>
              {expandedSku === s.skuKey && s.locations.filter(l => l.totalInvt > 0 || l.avgSale > 0).map(l => (
                <tr key={`mob-${s.skuKey}-${l.location}`} style={{ background: 'rgba(0,0,0,0.025)', borderBottom: `1px solid ${IC.border}`, height: 26 }}>
                  <td style={{ ...stickyTd('rgba(245,245,246,1)'), color: ths, fontSize: 10.5, paddingLeft: 10 }}>↳ {l.location}</td>
                  <td style={{ padding: P }} />
                  <td style={{ padding: P, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtInt(l.totalInvt)}</td>
                  <td style={{ padding: P, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtInt(l.avgSale)}</td>
                  <td style={{ padding: P, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtDays(l.doi)}d</td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ height: 1 }}>
            <td style={{ padding: 0, height: 1, background: IC.border, position: 'sticky', left: 0, zIndex: 2 }} />
            <td colSpan={4} style={{ padding: 0, height: 1, background: IC.border }} />
          </tr>
          <tr style={{ position: 'sticky', bottom: 0, zIndex: 2, background: IC.surface, height: 30 }}>
            <td style={{ ...stickyTd(IC.surface), fontWeight: 700, fontSize: 10, color: ths }}>{filteredSkus.length} SKUs</td>
            <td style={{ padding: P }} />
            <td style={{ padding: P, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtInt(tableTotals.totalInvt)}</td>
            <td style={{ padding: P, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtInt(tableTotals.avgSale)}</td>
            <td style={{ padding: P, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtDays(tableTotals.doi)}d</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
})

// "Columns" button + dropdown — the only way back for a column hidden via DraggableTh's
// right-click menu, since a right-click affordance with no visible undo would be a dead end.
function ColumnVisibilityMenu({ columnDefs, order, hidden, onShow }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  if (hidden.size === 0) return null
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ fontSize: 11, color: IC.t2, background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
        Columns ({hidden.size} hidden)
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50, minWidth: 180,
          background: IC.surfaceHi, border: `1px solid ${IC.border2}`, borderRadius: 8, boxShadow: '0 6px 16px rgba(0,0,0,0.1)', padding: 4,
        }}>
          {order.filter(k => hidden.has(k)).map(k => (
            <button key={k} onClick={() => onShow(k)}
              style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 12, color: IC.t1, background: 'none', border: 'none', borderRadius: 6, padding: '7px 10px', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              ✓ Show {columnDefs[k]?.label || k}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const SLICER_WIDTH = 122
const SLICER_HEIGHT = 30
const TABLE_SCROLL_HEIGHT = '58vh'

// All numeric measure columns share one width, DOI gets its own (shorter values),
// status gets its own (fits the chip), and dimension columns are sized to their
// typical content length rather than forced uniform.
const MEASURE_COL_WIDTH = 88
const DEFAULT_COL_WIDTHS = {
  category: 92, subCategory: 170, sku: 140,
  rtdInvt: MEASURE_COL_WIDTH, rawInvt: MEASURE_COL_WIDTH, rawBlockedInvt: MEASURE_COL_WIDTH,
  totalInvt: MEASURE_COL_WIDTH, avgSale: MEASURE_COL_WIDTH, doi: 64, stockStatus: 118, websiteStatus: 108,
}

// Columns are grouped so drag-to-reorder only swaps within the same group:
// dimensions (category/sub-category/product id) can only trade places with each other,
// and measures/status with each other — keeps the table structurally sane.
const COLUMN_DEFS = {
  category: { label: 'Category', group: 'dimension', align: 'left' },
  subCategory: { label: 'Sub-category', group: 'dimension', align: 'left' },
  sku: { label: 'Product ID', group: 'dimension', align: 'left' },
  rtdInvt: { label: 'RTD Invt', group: 'measure', align: 'right' },
  rawInvt: { label: 'RAW Invt', group: 'measure', align: 'right' },
  rawBlockedInvt: { label: 'RAW Blocked', group: 'measure', align: 'right' },
  totalInvt: { label: 'Total Invt', group: 'measure', align: 'right' },
  avgSale: { label: 'Avg Sale (B2C)', group: 'measure', align: 'right' },
  doi: { label: 'DOI', group: 'measure', align: 'right' },
  stockStatus: { label: 'Status', group: 'measure', align: 'right' },
  websiteStatus: { label: 'Website Status', group: 'measure', align: 'right' },
}
const DEFAULT_COL_ORDER = ['category', 'subCategory', 'sku', 'rtdInvt', 'rawInvt', 'rawBlockedInvt', 'totalInvt', 'avgSale', 'doi', 'stockStatus', 'websiteStatus']

// Severity order for the Stock Status tiles — worst first, so the sidebar reads as a triage list.
const STOCK_STATUS_ORDER = ['Out of Stock', 'Critical', 'Low', 'Sufficient', 'Excess', 'Dead / No Sale', 'No Demand']
const sortByStatusOrder = statuses => [...statuses].sort((a, b) => {
  const ia = STOCK_STATUS_ORDER.indexOf(a), ib = STOCK_STATUS_ORDER.indexOf(b)
  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
})

// Allocation % — actual order allocation to a facility/SKU ÷ actual regional (B2C) sale.
// Under 90% reads as under-served (Critical), over 110% as over-allocated relative to
// demand (Excess); the healthy band in between reads as everything-is-fine (positive/green).
function allocationColor(pct) {
  if (pct == null) return IC.t3
  if (pct < 90) return IC.status.Critical.c
  if (pct > 110) return IC.status.Excess.c
  return IC.positive
}

// Website Status — Live/Stock Out on Shopify, kept as its own small badge rather than
// folded into StatusChip/IC.status since it's a distinct concept from stockStatus
// (warehouse DOI-based health) and shouldn't share that palette's meanings. Color also
// flags two mismatch cases against the warehouse's own stockStatus:
// - Live on the site but the warehouse itself is Out of Stock/Critical — red, a real
//   fulfillment risk (selling something that can't actually be shipped).
// - Stock Out on the site despite otherwise-healthy warehouse stock — orange, a
//   listing/sync problem rather than an inventory problem.
function websiteStatusColor(status, stockStatus) {
  const isLive = status === 'Live'
  const warehouseCritical = stockStatus === 'Out of Stock' || stockStatus === 'Critical'
  if (isLive && warehouseCritical) return IC.status.Critical.c
  if (!isLive && !warehouseCritical) return IC.status.Low.c
  return isLive ? IC.positive : IC.status.Critical.c
}
function WebsiteStatusBadge({ status, stockStatus }) {
  const c = websiteStatusColor(status, stockStatus)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999,
      background: `${c}22`, border: `1px solid ${c}55`, fontSize: 11, fontWeight: 600, color: c, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
      {status}
    </span>
  )
}

// Sub-category rollup table for Slow-Moving / Dead Stock — click a sub-category row
// to expand into its SKUs.
// Total-Inventory-only table for one non-Regular facility type (Dark Store / Frido Store /
// Internal Store). Columns default to Location (grouping every store in that location
// together — keeps the table readable when there are dozens of individual stores), but the
// "Location / Store" quick-search lets a user narrow down to specific individual stores by
// name, at which point the table switches to one column per selected store instead of per
// location — so "how much does Bangalore-Whitefield-DS specifically have" is answerable
// without listing all 30+ individual Dark Stores by default. Deliberately minimal otherwise —
// no RTD/Raw/Blocked/DOI/Status, since these facility types don't carry that distinction the
// way Regular/3PL facilities do (per the "only total inventory will be shown" scope).
function SimpleFacilityTypeTable({ skus, facilityType, search = '', locationOrder, allFacilities }) {
  const [sort, setSort] = useState({ key: 'totalInvt', dir: 'desc' })
  const onSort = key => setSort(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })
  const [selectedFacilities, setSelectedFacilities] = useState([])
  const headerScrollRef = useRef(null)
  const bodyScrollRef = useRef(null)
  const syncFromBody = e => { if (headerScrollRef.current) headerScrollRef.current.scrollLeft = e.currentTarget.scrollLeft }
  const syncFromHeader = e => { if (bodyScrollRef.current) bodyScrollRef.current.scrollLeft = e.currentTarget.scrollLeft }

  const facilityOptions = useMemo(
    () => allFacilities.filter(f => f.facilityType === facilityType).sort((a, b) => a.facility.localeCompare(b.facility)),
    [allFacilities, facilityType]
  )
  // Column headers show the human-readable Store_Location (e.g. "Amanora Mall, PNQ") instead
  // of the raw facility code (e.g. "Frido_0002") when available.
  const storeLocationByFacility = useMemo(
    () => new Map(allFacilities.map(f => [f.facility, f.storeLocation || f.facility])),
    [allFacilities]
  )
  const facilityLocationOrder = useMemo(() => {
    const byLoc = new Map(allFacilities.map(f => [f.facility, f.location]))
    return (list) => [...list].sort((a, b) => {
      const la = locationOrder.indexOf(byLoc.get(a)), lb = locationOrder.indexOf(byLoc.get(b))
      if (la !== lb) return (la === -1 ? 999 : la) - (lb === -1 ? 999 : lb)
      return (storeLocationByFacility.get(a) || a).localeCompare(storeLocationByFacility.get(b) || b)
    })
  }, [allFacilities, locationOrder, storeLocationByFacility])

  const rows = useMemo(() => {
    return skus
      .map(s => {
        const matches = (s.facilities || []).filter(f => f.facilityType === facilityType)
        const totalInvt = matches.reduce((sum, f) => sum + (f.totalInvt || 0), 0)
        const byFacility = matches.reduce((acc, f) => { acc[f.facility] = (acc[f.facility] || 0) + (f.totalInvt || 0); return acc }, {})
        return { sku: s.sku, category: s.category, subCategory: s.subCategory, totalInvt, byFacility }
      })
      .filter(r => r.totalInvt > 0)
  }, [skus, facilityType])

  // Columns are always individual stores (their Store_Location name shown, not grouped by
  // city) — either every store this type has stock in by default, or just the ones picked
  // via the "Location / Store" search, narrowed down from potentially dozens of stores.
  const allStoreCols = useMemo(() => {
    const present = new Set()
    rows.forEach(r => Object.keys(r.byFacility).forEach(f => present.add(f)))
    return facilityLocationOrder([...present])
  }, [rows, facilityLocationOrder])
  const columns = selectedFacilities.length > 0 ? facilityLocationOrder(selectedFacilities) : allStoreCols

  const colKey = c => `fac:${c}`
  const colValue = (r, c) => r.byFacility[c] || 0

  const filtered = useMemo(() => {
    let out = rows
    if (selectedFacilities.length > 0) out = out.filter(r => selectedFacilities.some(f => (r.byFacility[f] || 0) > 0))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(r => r.sku.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) || r.subCategory.toLowerCase().includes(q))
    }
    return out
  }, [rows, search, selectedFacilities])

  const sortedRows = useMemo(() => {
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const isColSort = sort.key.startsWith('fac:')
      const av = isColSort ? colValue(a, sort.key.slice(4)) : a[sort.key]
      const bv = isColSort ? colValue(b, sort.key.slice(4)) : b[sort.key]
      if (typeof av === 'string') return sign * av.localeCompare(bv)
      return sign * ((av ?? -Infinity) - (bv ?? -Infinity))
    })
  }, [filtered, sort])

  const total = useMemo(() => filtered.reduce((s, r) => s + r.totalInvt, 0), [filtered])
  const totalByCol = useMemo(() => {
    const t = {}
    for (const r of filtered) for (const c of columns) t[c] = (t[c] || 0) + colValue(r, c)
    return t
  }, [filtered, columns])
  // When narrowed to specific stores, the visible "Total" per row reflects just those stores,
  // not the SKU's full facility-type total — otherwise the grand total wouldn't equal the sum
  // of the shown columns, which reads as broken.
  const rowTotal = r => selectedFacilities.length > 0 ? columns.reduce((s, c) => s + colValue(r, c), 0) : r.totalInvt

  // Category/Sub-category/Product ID are frozen (sticky left) so they stay visible while
  // scrolling horizontally through potentially dozens of store columns — otherwise there's no
  // way to tell which SKU a number belongs to once scrolled past the first few stores.
  const FROZEN_WIDTHS = [100, 230, 150]
  const frozenLeft = idx => FROZEN_WIDTHS.slice(0, idx).reduce((a, b) => a + b, 0)
  const frozenStyle = idx => ({ position: 'sticky', left: frozenLeft(idx), zIndex: 2 })

  const th = (label, key, align = 'right', frozenIdx = null) => (
    <th onClick={() => onSort(key)} title={label}
      style={{
        textAlign: align, padding: '6px 8px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
        color: sort?.key === key ? IC.t1 : IC.t3, cursor: 'pointer', userSelect: 'none',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        background: IC.surface,
        position: 'sticky', top: 0,
        zIndex: frozenIdx != null ? 4 : 2,
        ...(frozenIdx != null ? frozenStyle(frozenIdx) : {}),
      }}>
      {label}{sort?.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )

  const exportCols = [
    { label: 'Category', key: 'category' }, { label: 'Sub-category', key: 'subCategory' }, { label: 'Product ID', key: 'sku' },
    ...columns.map(c => ({ label: storeLocationByFacility.get(c) || c, key: `col_${c}` })),
    { label: 'Total Invt', key: 'totalInvt' },
  ]
  const exportRows = sortedRows.map(r => ({
    ...r, totalInvt: rowTotal(r), ...Object.fromEntries(columns.map(c => [`col_${c}`, colValue(r, c)])),
  }))

  return (
    <div className="inv-detail-card"><GlassCard
      title={`${facilityType} Inventory`}
      note={`${fmtInt(sortedRows.length)} SKUs`}
      action={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SearchableMultiSelect label="Location / Store" options={facilityOptions} selected={selectedFacilities}
            onChange={setSelectedFacilities} getKey={o => o.facility} getLabel={o => o.storeLocation || o.facility} width={220} height={34} />
          <ExportButton filename={`${facilityType.toLowerCase().replace(/\s+/g, '_')}_inventory.csv`} rows={exportRows} columns={exportCols} />
        </div>
      }>
      {sortedRows.length === 0 ? (
        <div style={{ color: IC.t3, fontSize: 12 }}>No inventory at {selectedFacilities.length > 0 ? 'the selected store(s)' : `${facilityType} facilities`}.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${IC.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {/* Fixed header — scrolls horizontally in sync with body */}
          <div ref={headerScrollRef} onScroll={syncFromHeader} style={{ overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none' }}>
            <table style={{ width: FROZEN_WIDTHS.reduce((a,b)=>a+b,0) + columns.length * 90 + 90, borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: FROZEN_WIDTHS[0] }} /><col style={{ width: FROZEN_WIDTHS[1] }} /><col style={{ width: FROZEN_WIDTHS[2] }} />
                {columns.map(c => <col key={c} style={{ width: 90 }} />)}<col style={{ width: 90 }} />
              </colgroup>
              <thead>
                <tr>
                  {th('Category', 'category', 'left', 0)}
                  {th('Sub-category', 'subCategory', 'left', 1)}
                  {th('Product ID', 'sku', 'left', 2)}
                  {columns.map(c => th(storeLocationByFacility.get(c) || c, colKey(c)))}
                  {th('Total Invt', 'totalInvt')}
                </tr>
                <tr style={{ height: 1 }}>
                  <td style={{ padding: 0, height: 1, background: IC.border, ...frozenStyle(0) }} />
                  <td style={{ padding: 0, height: 1, background: IC.border, ...frozenStyle(1) }} />
                  <td style={{ padding: 0, height: 1, background: IC.border, ...frozenStyle(2) }} />
                  <td colSpan={columns.length + 1} style={{ padding: 0, height: 1, background: IC.border }} />
                </tr>
              </thead>
            </table>
          </div>
          {/* Scrollable body */}
          <div ref={bodyScrollRef} onScroll={syncFromBody} style={{ overflowX: 'auto', overflowY: 'auto', height: 370 }}>
            <table style={{ width: FROZEN_WIDTHS.reduce((a,b)=>a+b,0) + columns.length * 90 + 90, borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: FROZEN_WIDTHS[0] }} /><col style={{ width: FROZEN_WIDTHS[1] }} /><col style={{ width: FROZEN_WIDTHS[2] }} />
                {columns.map(c => <col key={c} style={{ width: 90 }} />)}<col style={{ width: 90 }} />
              </colgroup>
              <tbody>
                {sortedRows.map(r => (
                  <tr key={r.sku} style={{ borderBottom: `1px solid ${IC.border}`, height: 34 }}>
                    <td style={{ padding: '7px 10px', color: IC.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: IC.surface, ...frozenStyle(0) }}>{r.category}</td>
                    <td style={{ padding: '7px 10px', color: IC.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: IC.surface, ...frozenStyle(1) }}>{r.subCategory}</td>
                    <td style={{ padding: '7px 10px', color: IC.t1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: IC.surface, ...frozenStyle(2) }}>{r.sku}</td>
                    {columns.map(c => (
                      <td key={c} style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: IC.t1 }}>{fmtInt(colValue(r, c))}</td>
                    ))}
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtInt(rowTotal(r))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Fixed footer total */}
          <div ref={null} style={{ overflowX: 'hidden', borderTop: `1px solid ${IC.border}` }}>
            <table style={{ width: FROZEN_WIDTHS.reduce((a,b)=>a+b,0) + columns.length * 90 + 90, borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: FROZEN_WIDTHS[0] }} /><col style={{ width: FROZEN_WIDTHS[1] }} /><col style={{ width: FROZEN_WIDTHS[2] }} />
                {columns.map(c => <col key={c} style={{ width: 90 }} />)}<col style={{ width: 90 }} />
              </colgroup>
              <tbody>
                <tr style={{ background: IC.surface, height: 34 }}>
                  <td style={{ padding: '7px 10px', fontWeight: 700, color: IC.t1, background: IC.surface, ...frozenStyle(0), zIndex: 2 }}>Total</td>
                  <td style={{ padding: '7px 10px', background: IC.surface, ...frozenStyle(1), zIndex: 2 }} />
                  <td style={{ padding: '7px 10px', fontSize: 11, color: IC.t3, fontWeight: 500, background: IC.surface, ...frozenStyle(2), zIndex: 2 }}>{fmtInt(filtered.length)} SKUs</td>
                  {columns.map(c => (
                    <td key={c} style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: IC.t1, fontVariantNumeric: 'tabular-nums', background: IC.surface }}>{fmtInt(totalByCol[c] || 0)}</td>
                  ))}
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: IC.t1, fontVariantNumeric: 'tabular-nums', background: IC.surface }}>{fmtInt(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </GlassCard></div>
  )
}

// Other Facilities view — 3 independent tables (Frido Store / Dark Store / Internal Store),
// not merged into one, per the "different table for all other 3 types" requirement — each
// facility type's inventory is scoped and shown on its own rather than blended together.
// Frido Store (retail) listed first per explicit request.
function OtherFacilitiesTable({ skus, search, locationOrder, allFacilities }) {
  return (
    <>
      <SimpleFacilityTypeTable skus={skus} facilityType="Frido Store" search={search} locationOrder={locationOrder} allFacilities={allFacilities} />
      <SimpleFacilityTypeTable skus={skus} facilityType="Dark Store" search={search} locationOrder={locationOrder} allFacilities={allFacilities} />
      <SimpleFacilityTypeTable skus={skus} facilityType="Internal Store" search={search} locationOrder={locationOrder} allFacilities={allFacilities} />
    </>
  )
}

function SubCatStockTable({ rows, emptyLabel, search = '' }) {
  const [expanded, setExpanded] = useState(new Set())
  const toggle = key => setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  const [sort, setSort] = useState(null)
  const onSort = key => setSort(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'subCategory' ? 'asc' : 'desc' })

  if (rows.length === 0) return <div style={{ color: IC.t3, fontSize: 12 }}>{emptyLabel}</div>

  const filtered = search ? rows.filter(r => r.subCategory?.toLowerCase().includes(search.toLowerCase())) : rows
  const sortedRows = sort ? [...filtered].sort((a, b) => {
    const sign = sort.dir === 'asc' ? 1 : -1
    const av = a[sort.key], bv = b[sort.key]
    if (typeof av === 'string') return sign * av.localeCompare(bv)
    return sign * ((av ?? -Infinity) - (bv ?? -Infinity))
  }) : filtered

  const th = (label, key, align = 'right') => (
    <th onClick={() => onSort(key)}
      style={{
        textAlign: align, padding: '6px 8px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
        color: sort?.key === key ? IC.t1 : IC.t3, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
        background: IC.surface,
      }}>
      {label}{sort?.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )

  return (
    <div style={{ maxHeight: 460, overflowY: 'auto', paddingRight: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 190 }} />
          <col style={{ width: 72 }} />
          <col style={{ width: 64 }} />
          <col style={{ width: 52 }} />
        </colgroup>
        <thead style={{ position: 'sticky', top: 0, background: IC.surface, zIndex: 1 }}>
          <tr>
            {th('Sub-category', 'subCategory', 'left')}
            {th('Total Invt', 'totalInvt')}
            {th('Avg Sale', 'avgSale')}
            {th('DOI', 'doi')}
          </tr>
          {/* Divider as a real filler row (genuine table content, 1px tall) — border/box-shadow
              on this sticky <thead> proved unreliable across several tables on this page. */}
          <tr style={{ height: 1 }}><td colSpan={4} style={{ padding: 0, height: 1, background: IC.border }} /></tr>
        </thead>
        <tbody>
          {sortedRows.map((r, i) => {
            const key = `${r.category}|${r.subCategory}`
            const isOpen = expanded.has(key)
            return (
              <React.Fragment key={key + i}>
                <tr onClick={() => toggle(key)}
                  style={{ borderBottom: `1px solid ${IC.border}`, cursor: 'pointer', height: 30 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.025)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: IC.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: IC.t3, marginRight: 6, display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
                    {r.subCategory}
                    <span style={{ marginLeft: 6, fontSize: 10.5, color: IC.t3, fontWeight: 500 }}>({r.category})</span>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtInt(r.totalInvt)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: IC.t2 }}>{fmtNum(r.avgSale)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: IC.t1 }}>{fmtDays(r.doi)}d</td>
                </tr>
                {isOpen && r.skus.map((s, j) => (
                  <tr key={key + '-' + j} style={{ background: 'rgba(0,0,0,0.02)', borderBottom: `1px solid ${IC.border}`, height: 28 }}>
                    <td style={{ padding: '5px 8px 5px 26px', color: IC.t3, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↳ {s.sku}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 11.5, color: IC.t2 }}>{fmtInt(s.totalInvt)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 11.5, color: IC.t2 }}>{fmtNum(s.avgSale)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 11.5, color: IC.t1 }}>{fmtDays(s.doi)}d</td>
                  </tr>
                ))}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Independent Avg Sale table for Mobility & Ergo Furniture — see mobilityErgoAvgSale in
// scripts/generate-inv-cache.mjs for the calculation itself (adaptive-window, all-location,
// no exclusions on Cancelled/RTO). Deliberately NOT wired to the Location sidebar filter — this
// table's numbers are driven entirely by each SKU's own selling history, not the page's
// location/date-range selection, so it stays visually and functionally separate from the main
// Inventory Detail table (same reasoning as why it's a distinct backend field, not folded into
// `skus`).
const MOBILITY_ERGO_COLS = [
  { key: 'category', label: 'Category', align: 'left', width: 110 },
  { key: 'subCategory', label: 'Sub-Category', align: 'left', width: 160 },
  { key: 'sku', label: 'Product ID', align: 'left', width: 130 },
  { key: 'rtdInvt', label: 'RTD Invt', width: 78 },
  { key: 'rawInvt', label: 'Raw Invt', width: 78 },
  { key: 'rawBlockedInvt', label: 'Raw Blocked', width: 90 },
  { key: 'totalInvt', label: 'Total Invt', width: 84 },
  { key: 'lifeDays', label: 'Selling Life', width: 90 },
  { key: 'windowDays', label: 'Window Used', width: 130 },
  { key: 'avgSaleNew', label: 'Avg Sale', width: 82 },
  { key: 'avgSaleCurrent', label: 'Avg Sale (Std 7d)', width: 110 },
  { key: 'doi', label: 'DOI', width: 64 },
  { key: 'stockStatus', label: 'Status', width: 110 },
  { key: 'websiteStatus', label: 'Website Status', width: 110 },
]

function MobilityErgoAvgSaleTable({ rows }) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ key: 'totalInvt', dir: 'desc' })
  const onSort = key => setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })

  const q = search.trim().toLowerCase()
  const filtered = q ? rows.filter(r => r.sku.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) || r.subCategory.toLowerCase().includes(q)) : rows
  const sorted = [...filtered].sort((a, b) => {
    const sign = sort.dir === 'asc' ? 1 : -1
    const av = a[sort.key], bv = b[sort.key]
    if (typeof av === 'string') return sign * av.localeCompare(bv)
    return sign * ((av ?? -Infinity) - (bv ?? -Infinity))
  })

  const totals = filtered.reduce((acc, r) => ({
    rtdInvt: acc.rtdInvt + (r.rtdInvt || 0), rawInvt: acc.rawInvt + (r.rawInvt || 0),
    rawBlockedInvt: acc.rawBlockedInvt + (r.rawBlockedInvt || 0), totalInvt: acc.totalInvt + (r.totalInvt || 0),
  }), { rtdInvt: 0, rawInvt: 0, rawBlockedInvt: 0, totalInvt: 0 })

  const exportRows = filtered.map(r => ({
    Category: r.category, SubCategory: r.subCategory, ProductID: r.sku,
    RTDInvt: r.rtdInvt, RawInvt: r.rawInvt, RawBlocked: r.rawBlockedInvt, TotalInvt: r.totalInvt,
    SellingLifeDays: r.lifeDays, WindowStart: r.windowStart, WindowEnd: r.windowEnd, WindowDays: r.windowDays,
    AvgSale: r.avgSaleNew, AvgSaleStd7d: r.avgSaleCurrent, DOI: r.doi, Status: r.stockStatus, WebsiteStatus: r.websiteStatus,
  }))

  return (
    <GlassCard
      title="Avg Sale · Mobility &amp; Ergo Furniture"
      note={`${fmtInt(filtered.length)} of ${fmtInt(rows.length)} SKUs · adaptive-window calculation, all locations`}
      action={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input placeholder="Search category / product…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 8, padding: '6px 10px', color: IC.t1, fontSize: 12, width: 200, boxSizing: 'border-box' }} />
          <ExportButton filename="mobility_ergo_avg_sale.csv" rows={exportRows}
            columns={[
              { label: 'Category', key: 'Category' }, { label: 'Sub-Category', key: 'SubCategory' }, { label: 'Product ID', key: 'ProductID' },
              { label: 'RTD Invt', key: 'RTDInvt' }, { label: 'RAW Invt', key: 'RawInvt' }, { label: 'RAW Blocked', key: 'RawBlocked' }, { label: 'Total Invt', key: 'TotalInvt' },
              { label: 'Selling Life (days)', key: 'SellingLifeDays' }, { label: 'Window Start', key: 'WindowStart' }, { label: 'Window End', key: 'WindowEnd' }, { label: 'Window (days)', key: 'WindowDays' },
              { label: 'Avg Sale', key: 'AvgSale' }, { label: 'Avg Sale (Std 7d)', key: 'AvgSaleStd7d' }, { label: 'DOI', key: 'DOI' }, { label: 'Status', key: 'Status' }, { label: 'Website Status', key: 'WebsiteStatus' },
            ]} />
        </div>
      }>
      <div style={{ maxHeight: 520, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
          <colgroup>{MOBILITY_ERGO_COLS.map(c => <col key={c.key} style={{ width: c.width }} />)}</colgroup>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: IC.surface }}>
            <tr>
              {MOBILITY_ERGO_COLS.map(c => (
                <SortableTh key={c.key} label={c.label} sortKey={c.key} sortState={sort} onSort={onSort} align={c.align} />
              ))}
            </tr>
            {/* Divider as a real filler row (genuine table content, 1px tall) — border/box-shadow
                on this sticky <thead> proved unreliable (not rendering despite being in the CSS). */}
            <tr style={{ height: 1 }}><td colSpan={MOBILITY_ERGO_COLS.length} style={{ padding: 0, height: 1, background: IC.border }} /></tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.sku + i} style={{ borderBottom: `1px solid ${IC.border}`, height: 32 }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.025)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '8px 12px', color: IC.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.category}</td>
                <td style={{ padding: '8px 12px', color: IC.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subCategory}</td>
                <td style={{ padding: '8px 12px', fontWeight: 600, color: IC.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sku}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtInt(r.rtdInvt)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtInt(r.rawInvt)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: IC.status.Low.c }}>{fmtInt(r.rawBlockedInvt)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtInt(r.totalInvt)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: IC.t2 }}>{fmtDays(r.lifeDays)}d</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 10.5, color: IC.t3 }} title={`${r.windowStart} → ${r.windowEnd}`}>{fmtDays(r.windowDays)}d</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: IC.t1 }}>{fmtNum(r.avgSaleNew)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: IC.t3 }}>{fmtNum(r.avgSaleCurrent)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{r.doi == null ? '—' : `${fmtDays(r.doi)}d`}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}><StatusChip status={r.stockStatus} /></td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: r.websiteStatus === 'Live' ? `${IC.status.Sufficient.c}22` : `${IC.status.Critical.c}22`,
                    color: r.websiteStatus === 'Live' ? IC.status.Sufficient.c : IC.status.Critical.c,
                  }}>{r.websiteStatus}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ height: 1 }}><td colSpan={MOBILITY_ERGO_COLS.length} style={{ padding: 0, height: 1, background: IC.border }} /></tr>
            <tr style={{ position: 'sticky', bottom: 0, background: IC.surface, height: 34 }}>
              <td style={{ padding: '7px 10px', fontWeight: 700, fontSize: 11, color: IC.t3 }} colSpan={3}>{filtered.length} SKUs</td>
              <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtInt(totals.rtdInvt)}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtInt(totals.rawInvt)}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: IC.status.Low.c }}>{fmtInt(totals.rawBlockedInvt)}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtInt(totals.totalInvt)}</td>
              <td colSpan={7} />
            </tr>
          </tfoot>
        </table>
      </div>
    </GlassCard>
  )
}

function WarehouseCard({ loc, selected }) {
  const rtdPct = loc.totalInvt > 0 ? (loc.rtdInvt / loc.totalInvt) * 100 : 0
  const borderColor = IC.status[loc.stockStatus]?.c || IC.border
  const allocColor = allocationColor(loc.allocationPct)
  return (
    <div style={{
      background: selected ? 'rgba(0,0,0,0.055)' : IC.surface,
      border: selected ? `1.5px solid ${IC.t2}` : `1px solid ${IC.border}`,
      borderRadius: 12, padding: '10px 11px', minWidth: 0,
      display: 'flex', flexDirection: 'column', gap: 6, borderTop: `3px solid ${borderColor}`,
      transition: 'background 0.15s, border 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: IC.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc.location}</span>
        <StatusChip status={loc.stockStatus} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: IC.t1, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden' }}>{fmtNum(loc.totalInvt)}<span style={{ fontSize: 10.5, color: IC.t3, fontWeight: 400 }}> units</span></div>
        <div style={{ fontSize: 11, color: IC.t2, whiteSpace: 'nowrap', flexShrink: 0 }}>DOI <b style={{ color: IC.t1, fontVariantNumeric: 'tabular-nums' }}>{fmtDays(loc.doi)}d</b></div>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: 'rgba(0,0,0,0.06)', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${rtdPct}%`, background: IC.acc }} />
        <div style={{ width: `${100 - rtdPct}%`, background: IC.t3 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: IC.t3, gap: 4 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>RTD {fmtNum(loc.rtdInvt)}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>RAW {fmtNum(loc.rawInvt)}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4, borderTop: `1px solid ${IC.border}` }}>
        <div style={{ fontSize: 10.5, color: IC.t2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Avg Sale: <b style={{ color: IC.t1 }}>{fmtNum(loc.avgSale)}</b></div>
        <div style={{ fontSize: 10.5, color: IC.t2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Allocation: <b style={{ color: allocColor }}>{loc.allocationPct == null ? '—' : `${loc.allocationPct.toFixed(0)}%`}</b></div>
      </div>
    </div>
  )
}

// ── Left filter sidebar (mirrors the Logistics page pattern) ─────────────────
// Location & Stock Status render as a uniform tile grid; everything below follows
// the drill order Facility Type → Facility → Category → Sub-category → Product ID.
// RTD Level lives on the Inventory Detail table itself, not here.
const SIDEBAR_WIDTH = 220

function SidebarSectionTitle({ title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 4px' }}>
      <div style={{ width: 3, height: 12, borderRadius: 2, background: IC.accBorder, flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 800, color: IC.t2, letterSpacing: '.05em', textTransform: 'uppercase' }}>{title}</span>
    </div>
  )
}

function TileToggle({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = IC.hoverBg }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = IC.surface }}
      style={{
        padding: '7px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: active ? 700 : 500,
        background: active ? IC.accDim : IC.surface, color: active ? IC.t1 : IC.t2,
        border: `1.5px solid ${active ? IC.accBorder : IC.border}`, textAlign: 'center',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'background .12s, border-color .12s',
      }}>
      {label}
    </button>
  )
}

function FilterSidebar({ data, filters, setFilters, open, onClose, isMobile, sidebarTop, popover, facilityView }) {
  const opts = data.filterOptions
  // Facility slicer only offers facilities matching the active Regular/Other Facilities tab —
  // otherwise selecting a Dark Store here while on the Regular view would filter the Regular
  // table down to nothing (facilityType mismatch), which looks broken rather than empty-by-design.
  const facilityOptionsForView = useMemo(
    () => opts.facilities.filter(f => facilityView === 'regular' ? f.facilityType === 'Regular' : f.facilityType !== 'Regular'),
    [opts.facilities, facilityView]
  )
  const set = (key, arr) => setFilters(f => ({ ...f, [key]: arr }))
  const toggleTile = (key, value) => setFilters(f => {
    const cur = f[key] || []
    const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value]
    return { ...f, [key]: next }
  })
  const anyActive = ['category', 'subCategory', 'facility', 'productId', 'location', 'stockStatus', 'websiteStatus']
    .some(k => filters[k]?.length)

  // On mobile: renders as a fixed overlay drawer. On desktop: position:fixed panel anchored
  // to --sb/--nav CSS variables (see comment below for why measured approach was dropped).
  if (isMobile) {
    if (!open) return null
    return (
      <>
        <div className="inv-filter-backdrop" onClick={onClose} />
        <div className="inv-filter-drawer" style={{ background: '#FAFBFF', borderRight: `1px solid ${IC.border}`, display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 12px 16px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            {sidebarTop}
            <button onClick={onClose} style={{ background: '#F0F2F5', border: 'none', color: IC.t2, fontSize: 14, cursor: 'pointer', padding: '4px 8px', lineHeight: 1, borderRadius: 8 }}>✕</button>
          </div>
          <SidebarSectionTitle title="Location" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {opts.locations.map(loc => (
              <TileToggle key={loc} label={loc} active={(filters.location || []).includes(loc)} onClick={() => toggleTile('location', loc)} />
            ))}
          </div>
          <SidebarSectionTitle title="Stock Status" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {sortByStatusOrder(opts.stockStatuses).map(s => (
              <TileToggle key={s} label={IC.status[s]?.label || s} active={(filters.stockStatus || []).includes(s)} onClick={() => toggleTile('stockStatus', s)} />
            ))}
          </div>
          <SidebarSectionTitle title="Website Status" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {['Live', 'Stock Out'].map(s => (
              <TileToggle key={s} label={s} active={(filters.websiteStatus || []).includes(s)} onClick={() => toggleTile('websiteStatus', s)} />
            ))}
          </div>
          <div style={{ height: 1, background: IC.border, margin: '2px 0' }} />
          <SidebarSectionTitle title="Avg Sale Window" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[7, 15, 30].map(d => (
              <TileToggle key={d} label={`${d}d`} active={(filters.avgSaleWindowDays || 7) === d} onClick={() => setFilters(f => ({ ...f, avgSaleWindowDays: d }))} />
            ))}
          </div>
          <div style={{ height: 1, background: IC.border, margin: '2px 0' }} />
          <SidebarSectionTitle title="Filters" />
          <SearchableMultiSelect label="Facility" options={facilityOptionsForView} selected={filters.facility || []} onChange={v => set('facility', v)} getKey={o => o.facility} getLabel={o => o.facility} width={240} height={SLICER_HEIGHT} />
          <SearchableMultiSelect label="Category" options={opts.categories} selected={filters.category || []} onChange={v => set('category', v)} width={240} height={SLICER_HEIGHT} />
          <SearchableMultiSelect label="Sub-category" options={opts.subCategories} selected={filters.subCategory || []} onChange={v => set('subCategory', v)} width={240} height={SLICER_HEIGHT} />
          <SearchableMultiSelect label="Product ID" options={opts.productIds} selected={filters.productId || []} onChange={v => set('productId', v)} getKey={o => o.sku} getLabel={o => o.sku} width={240} height={SLICER_HEIGHT} />
          {anyActive && (
            <button onClick={() => setFilters({})} style={{ fontSize: 11.5, color: '#D93025', background: '#FFF0EE', border: '1px solid #F5B8B2', borderRadius: 8, padding: '7px 0', cursor: 'pointer', fontWeight: 600, marginTop: 4 }}>
              ✕ Clear all filters
            </button>
          )}
        </div>
      </>
    )
  }

  return (
    <div style={popover ? { display: 'contents' } : {
      width: open ? SIDEBAR_WIDTH : 0, minWidth: open ? SIDEBAR_WIDTH : 0, transition: 'width .2s ease, min-width .2s ease',
      overflow: 'hidden', flexShrink: 0,
      // Width-reserver only: its child is position:fixed. Deliberately transparent so the
      // page ground shows around the floating panel card.
    }}>
      <div style={{
        width: popover ? 248 : SIDEBAR_WIDTH, padding: popover ? 0 : '12px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10,
        ...(popover ? { maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 } : { background: IC.surface }),
        ...(!popover && open ? {
          position: 'fixed', top: 'calc(var(--nav) + 18px)', left: 'calc(var(--sb) + 18px)',
          height: 'calc(100vh - var(--nav) - 30px)', overflowY: 'auto', paddingRight: 10,
          borderRadius: 16, boxShadow: '0 2px 4px rgba(26,28,35,.04),0 4px 12px rgba(26,28,35,.06)',
        } : {}),
      }}>
        {sidebarTop}
        <SidebarSectionTitle title="Location" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {opts.locations.map(loc => (
            <TileToggle key={loc} label={loc} active={(filters.location || []).includes(loc)} onClick={() => toggleTile('location', loc)} />
          ))}
        </div>

        <SidebarSectionTitle title="Stock Status" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {sortByStatusOrder(opts.stockStatuses).map(s => (
            <TileToggle key={s} label={IC.status[s]?.label || s} active={(filters.stockStatus || []).includes(s)} onClick={() => toggleTile('stockStatus', s)} />
          ))}
        </div>

        <SidebarSectionTitle title="Website Status" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {['Live', 'Stock Out'].map(s => (
            <TileToggle key={s} label={s} active={(filters.websiteStatus || []).includes(s)} onClick={() => toggleTile('websiteStatus', s)} />
          ))}
        </div>

        <div style={{ height: 1, background: IC.border, margin: '2px 0' }} />
        <SidebarSectionTitle title="Avg Sale Window" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {[7, 15, 30].map(d => (
            <TileToggle key={d} label={`${d}d`} active={(filters.avgSaleWindowDays || 7) === d} onClick={() => setFilters(f => ({ ...f, avgSaleWindowDays: d }))} />
          ))}
        </div>

        <div style={{ height: 1, background: IC.border, margin: '2px 0' }} />
        <SidebarSectionTitle title="Filters" />
        <SearchableMultiSelect label="Facility" options={facilityOptionsForView} selected={filters.facility || []} onChange={v => set('facility', v)}
          getKey={o => o.facility} getLabel={o => o.facility} width={SIDEBAR_WIDTH - 24} height={SLICER_HEIGHT} />
        <SearchableMultiSelect label="Category" options={opts.categories} selected={filters.category || []} onChange={v => set('category', v)}
          width={SIDEBAR_WIDTH - 24} height={SLICER_HEIGHT} />
        <SearchableMultiSelect label="Sub-category" options={opts.subCategories} selected={filters.subCategory || []} onChange={v => set('subCategory', v)}
          width={SIDEBAR_WIDTH - 24} height={SLICER_HEIGHT} />
        <SearchableMultiSelect label="Product ID" options={opts.productIds} selected={filters.productId || []} onChange={v => set('productId', v)}
          getKey={o => o.sku} getLabel={o => o.sku} width={SIDEBAR_WIDTH - 24} height={SLICER_HEIGHT} />

        {anyActive && (
          <button onClick={() => setFilters({})} style={{ fontSize: 11, color: IC.t3, background: 'none', border: `1px solid ${IC.border}`, borderRadius: 6, padding: '5px 0', cursor: 'pointer' }}>
            ✕ Clear all
          </button>
        )}
      </div>
    </div>
  )
}

// ── Collapsible pivot table: Category > Sub-category > SKU rows, Location columns ──
// Each location shows Invt and Avg Sale side by side (not toggled) so both are visible together.
function PivotTable({ pivot, search, facilityTypeFilter }) {
  const [expanded, setExpanded] = useState(new Set())
  const toggle = key => setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  // When one or more Facility Types are selected, each (SKU, Location) cell's totalInvt is
  // swapped for the sum of just those types at that location (via byLocation[loc].byFacilityType,
  // computed once per cell at cache-generation time). avgSale is left unfiltered — sales data
  // has no facility-type dimension to split by (only Location grain), so there's no real
  // facility-type-specific Avg Sale to show; the SKU's own row-level totalInvt is swapped the
  // same way by summing the filtered per-location cells.
  const activeTypes = facilityTypeFilter?.length > 0 ? facilityTypeFilter : null
  const cellInvt = (v) => {
    if (!activeTypes || !v) return v?.totalInvt || 0
    return activeTypes.reduce((s, t) => s + (v.byFacilityType?.[t] || 0), 0)
  }

  const tree = useMemo(() => {
    const cats = new Map()
    for (const r of pivot.rows) {
      if (!cats.has(r.category)) cats.set(r.category, { name: r.category, byLoc: {}, totalInvt: 0, avgSale: 0, subs: new Map() })
      const cat = cats.get(r.category)
      if (!cat.subs.has(r.subCategory)) cat.subs.set(r.subCategory, { name: r.subCategory, byLoc: {}, totalInvt: 0, avgSale: 0, skus: [] })
      const sub = cat.subs.get(r.subCategory)
      let rowTotalInvt = 0
      for (const loc of pivot.locations) rowTotalInvt += cellInvt(r.byLocation[loc])
      const skuRow = activeTypes ? { ...r, totalInvt: rowTotalInvt } : r
      sub.skus.push(skuRow)
      sub.totalInvt += rowTotalInvt
      sub.avgSale += r.avgSale
      cat.totalInvt += rowTotalInvt
      cat.avgSale += r.avgSale
      for (const loc of pivot.locations) {
        const v = r.byLocation[loc] || { totalInvt: 0, avgSale: 0 }
        const invt = cellInvt(v)
        cat.byLoc[loc] = { totalInvt: (cat.byLoc[loc]?.totalInvt || 0) + invt, avgSale: (cat.byLoc[loc]?.avgSale || 0) + v.avgSale }
        sub.byLoc[loc] = { totalInvt: (sub.byLoc[loc]?.totalInvt || 0) + invt, avgSale: (sub.byLoc[loc]?.avgSale || 0) + v.avgSale }
      }
    }
    return [...cats.values()].sort((a, b) => b.totalInvt - a.totalInvt)
  }, [pivot, activeTypes])

  const filteredTree = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tree
    return tree
      .map(cat => {
        const catMatches = cat.name.toLowerCase().includes(q)
        const subs = [...cat.subs.values()].filter(sub => {
          const subMatches = catMatches || sub.name.toLowerCase().includes(q)
          return subMatches || sub.skus.some(s => s.sku.toLowerCase().includes(q))
        }).map(sub => {
          const subMatches = catMatches || sub.name.toLowerCase().includes(q)
          const skus = subMatches ? sub.skus : sub.skus.filter(s => s.sku.toLowerCase().includes(q))
          return { ...sub, skus }
        })
        return subs.length ? { ...cat, subs: new Map(subs.map(s => [s.name, s])) } : null
      })
      .filter(Boolean)
  }, [tree, search])

  // Auto-expand every category/sub-category while searching so matches are visible
  // without needing to manually click into each branch.
  useEffect(() => {
    if (!search.trim()) return
    const next = new Set()
    for (const cat of filteredTree) {
      next.add(`c:${cat.name}`)
      for (const sub of cat.subs.values()) next.add(`s:${cat.name}|${sub.name}`)
    }
    setExpanded(next)
  }, [filteredTree, search])

  // Grand total across every category — same shape as a category node so it can
  // reuse locCell() directly.
  const grandTotal = useMemo(() => {
    const g = { byLoc: {}, totalInvt: 0, avgSale: 0 }
    for (const cat of tree) {
      g.totalInvt += cat.totalInvt
      g.avgSale += cat.avgSale
      for (const loc of pivot.locations) {
        const v = cat.byLoc[loc] || { totalInvt: 0, avgSale: 0 }
        g.byLoc[loc] = { totalInvt: (g.byLoc[loc]?.totalInvt || 0) + v.totalInvt, avgSale: (g.byLoc[loc]?.avgSale || 0) + v.avgSale }
      }
    }
    return g
  }, [tree, pivot.locations])

  const SUBCOL_W = 48
  // isLeaf: true for a SKU row's own byLocation (raw cells, never filtered yet — cellInvt()
  // must run). false for cat/sub/grandTotal .byLoc rollups, which were already filtered while
  // building `tree` above — running cellInvt() on those again would look for a .byFacilityType
  // key they don't carry and silently collapse to 0 instead of passing the correct total through.
  const locCell = (obj, loc, color, isLeaf) => {
    const v = obj[loc] || { totalInvt: 0, avgSale: 0 }
    const invt = isLeaf ? cellInvt(v) : (v.totalInvt || 0)
    return (
      <td key={loc} style={{ padding: '8px 12px', borderRight: `1px solid ${IC.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color, flex: 1, textAlign: 'right', paddingRight: 4 }}>{fmtInt(invt)}</span>
          <span style={{ color: IC.t3, flex: 1, textAlign: 'right' }}>{fmtInt(v.avgSale)}</span>
        </div>
      </td>
    )
  }

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ maxHeight: TABLE_SCROLL_HEIGHT, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 200 }} />
            {pivot.locations.map(loc => <col key={loc} style={{ width: 100 }} />)}
            <col style={{ width: 110 }} />
          </colgroup>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'left', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: IC.t3, padding: '6px 10px', borderRight: `1px solid ${IC.border}`, position: 'sticky', left: 0, background: IC.surface, zIndex: 3, whiteSpace: 'nowrap' }}>Category / Sub-category / SKU</th>
              {pivot.locations.map(loc => (
                <th key={loc} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: IC.t3, padding: '6px 6px 2px', borderRight: `1px solid ${IC.border}`, background: IC.surface }}>{loc}</th>
              ))}
              <th rowSpan={2} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: IC.t3, padding: '6px 6px', background: IC.surface }}>Total<br />Invt / Sale</th>
            </tr>
            <tr>
              {pivot.locations.map(loc => (
                <th key={loc} style={{ fontSize: 11, fontWeight: 600, color: IC.t3, padding: '0 6px 6px', borderRight: `1px solid ${IC.border}`, background: IC.surface }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ flex: 1, textAlign: 'right', paddingRight: 4 }}>Inventory</span><span style={{ flex: 1, textAlign: 'right' }}>Avg Sale</span></span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Divider as a real row (genuine table content, 1px tall) — a filler <tr> nested
                INSIDE the sticky <thead> (with its own sticky-left cell) broke the thead's own
                sticky behavior on scroll — putting it here, as the first <tbody> row, avoids the
                nested-sticky-context problem while still sitting flush under the header. */}
            <tr style={{ height: 1 }}>
              <td style={{ padding: 0, height: 1, background: IC.border, position: 'sticky', left: 0, zIndex: 3 }} />
              <td colSpan={pivot.locations.length + 1} style={{ padding: 0, height: 1, background: IC.border }} />
            </tr>
            {filteredTree.map(cat => {
              const catKey = `c:${cat.name}`
              const catOpen = expanded.has(catKey)
              return (
                <React.Fragment key={catKey}>
                  <tr onClick={() => toggle(catKey)} style={{ cursor: 'pointer', background: 'rgba(0,0,0,0.02)', borderBottom: `1px solid ${IC.border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.045)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: IC.t1, position: 'sticky', left: 0, background: IC.surface, borderRight: `1px solid ${IC.border}` }}>
                      <span style={{ display: 'inline-block', width: 14, transform: catOpen ? 'rotate(90deg)' : 'none', transition: 'transform .12s', color: IC.t3 }}>›</span>
                      {cat.name}
                    </td>
                    {pivot.locations.map(loc => locCell(cat.byLoc, loc, IC.t1))}
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: IC.t1 }}>
                      {fmtInt(cat.totalInvt)} <span style={{ color: IC.t3, fontWeight: 500 }}>/ {fmtInt(cat.avgSale)}</span>
                    </td>
                  </tr>
                  {catOpen && [...cat.subs.values()].sort((a, b) => b.totalInvt - a.totalInvt).map(sub => {
                    const subKey = `s:${cat.name}|${sub.name}`
                    const subOpen = expanded.has(subKey)
                    return (
                      <React.Fragment key={subKey}>
                        <tr onClick={() => toggle(subKey)} style={{ cursor: 'pointer', borderBottom: `1px solid ${IC.border}` }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '6px 10px 6px 28px', color: IC.t2, position: 'sticky', left: 0, background: IC.surface, borderRight: `1px solid ${IC.border}` }}>
                            <span style={{ display: 'inline-block', width: 14, transform: subOpen ? 'rotate(90deg)' : 'none', transition: 'transform .12s', color: IC.t3 }}>›</span>
                            {sub.name}
                          </td>
                          {pivot.locations.map(loc => locCell(sub.byLoc, loc, IC.t2))}
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: IC.t1 }}>
                            {fmtInt(sub.totalInvt)} <span style={{ color: IC.t3 }}>/ {fmtInt(sub.avgSale)}</span>
                          </td>
                        </tr>
                        {subOpen && sub.skus.sort((a, b) => b.totalInvt - a.totalInvt).map(sku => (
                          <tr key={sku.sku} style={{ borderBottom: `1px solid ${IC.border}`, background: 'rgba(0,0,0,0.015)' }}>
                            <td style={{ padding: '5px 10px 5px 46px', color: IC.t3, fontSize: 12, position: 'sticky', left: 0, background: IC.surface, borderRight: `1px solid ${IC.border}` }}>{sku.sku}</td>
                            {pivot.locations.map(loc => locCell(sku.byLocation, loc, IC.t3, true))}
                            <td style={{ padding: '5px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: IC.t2, fontSize: 12 }}>
                              {fmtInt(sku.totalInvt)} <span style={{ color: IC.t3 }}>/ {fmtInt(sku.avgSale)}</span>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </tbody>
          <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
            <tr style={{ height: 1 }}>
              <td style={{ padding: 0, height: 1, background: IC.border, position: 'sticky', left: 0, zIndex: 3 }} />
              <td colSpan={pivot.locations.length + 1} style={{ padding: 0, height: 1, background: IC.border }} />
            </tr>
            <tr style={{ background: IC.surface }}>
              <td style={{ padding: '7px 10px', fontWeight: 700, color: IC.t1, position: 'sticky', left: 0, background: IC.surface, borderRight: `1px solid ${IC.border}` }}>Grand Total</td>
              {pivot.locations.map(loc => locCell(grandTotal.byLoc, loc, IC.t1))}
              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: IC.t1 }}>
                {fmtInt(grandTotal.totalInvt)} <span style={{ color: IC.t2, fontWeight: 600 }}>/ {fmtInt(grandTotal.avgSale)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

const InventoryHealthInner = React.memo(function InventoryHealthInner({ data, filters, setFilters, sidebarTop, sidebarOpen, setSidebarOpen, facilityViewProp, setFacilityViewProp }) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 250)
    return () => clearTimeout(t)
  }, [searchInput])
  const [expandedSku, setExpandedSku] = useState(null)
  const toggleExpandedSku = useCallback(skuKey => setExpandedSku(k => k === skuKey ? null : skuKey), [])

  // Desktop table virtualization
  const tableScrollRef = useRef(null)
  const [vScrollTop, setVScrollTop] = useState(0)
  const ROW_H = 34
  const OVERSCAN = 5
  const useVirtual = !expandedSku
  const [colWidths, setColWidths] = useState(DEFAULT_COL_WIDTHS)
  // Column visibility IS its width — dragging a header border to 0 hides it (Excel's own
  // model), rather than a separate hidden-columns Set that could drift out of sync with the
  // width state. Restoring remembers the width the column had right before it was hidden
  // (DraggableTh's own last-nonzero-width tracking handles the "drag the thin seam back
  // open" case; lastNonZeroWidths below backs the "Columns" menu's one-click restore).
  const [colOrder, setColOrder] = useState(DEFAULT_COL_ORDER)
  const hiddenCols = useMemo(() => new Set(colOrder.filter(k => (colWidths[k] ?? DEFAULT_COL_WIDTHS[k]) === 0)), [colOrder, colWidths])
  const [dragCol, setDragCol] = useState(null)
  const [sort, setSort] = useState({ key: 'avgSale', dir: 'desc' })
  const [pivotSearch, setPivotSearch] = useState('')
  const [slowSearch, setSlowSearch] = useState('')
  const [deadSearch, setDeadSearch] = useState('')

  // Regular / Other Facilities — top-level view switch. "Regular" shows the full detailed
  // view (Warehouse Health, Inventory Detail with RTD/Raw/Blocked/DOI, Location-Wise pivot),
  // scoped to Regular-type facilities only. "Other Facilities" shows a single simple
  // Total-Inventory-only table across Dark Store/Frido Store/Internal Store combined, with
  // Facility Type as a visible column. Replaces the old Facility Type sidebar slicer, which
  // never actually filtered the main Inventory Detail table (only Warehouse Health/pivot did,
  // and only after this session's fixes) — a hardcoded top-level switch removes that class of
  // "filter exists but silently doesn't apply everywhere" bug entirely.
  const [facilityViewLocal, setFacilityViewLocal] = useState('regular')
  const facilityView = facilityViewProp ?? facilityViewLocal
  const setFacilityView = setFacilityViewProp ?? setFacilityViewLocal

  // Remembers each column's last nonzero width so hiding it (dragging to 0) and later
  // restoring it — via the seam drag or the "Columns" menu — brings back its old size
  // instead of some arbitrary default.
  const lastNonZeroWidthsRef = React.useRef({ ...DEFAULT_COL_WIDTHS })
  const setColWidth = (key, w) => {
    if (w > 0) lastNonZeroWidthsRef.current[key] = w
    setColWidths(prev => ({ ...prev, [key]: Math.max(0, w) }))
  }
  const restoreColumn = key => setColWidth(key, lastNonZeroWidthsRef.current[key] || DEFAULT_COL_WIDTHS[key] || 100)
  const onSort = key => setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  const reorderCols = (draggedKey, targetKey) => setColOrder(prev => {
    const next = [...prev]
    const from = next.indexOf(draggedKey), to = next.indexOf(targetKey)
    if (from === -1 || to === -1) return prev
    next.splice(from, 1)
    next.splice(to, 0, draggedKey)
    return next
  })
  const isDefaultColLayout = colOrder.every((k, i) => k === DEFAULT_COL_ORDER[i]) && colOrder.every(k => (colWidths[k] ?? DEFAULT_COL_WIDTHS[k]) === DEFAULT_COL_WIDTHS[k])
  const resetColLayout = () => { setColOrder(DEFAULT_COL_ORDER); setColWidths(DEFAULT_COL_WIDTHS); lastNonZeroWidthsRef.current = { ...DEFAULT_COL_WIDTHS } }

  // Inventory Detail is scoped to Regular-type facilities only — a SKU's own totalInvt/
  // rtdInvt/rawInvt/rawBlockedInvt are pre-summed across every facility, so re-deriving just
  // the Regular portion means summing its own `.facilities` array (each entry carries its
  // facilityType) instead of trusting the SKU-level fields directly. avgSale/doi/stockStatus
  // are left as the SKU's existing company-wide figures — sales data has no facility-type
  // dimension to split by (only Location grain), so there's no true "Regular-only Avg Sale" to
  // compute; using the full figure is the best available approximation.
  //
  // The Facility slicer (filters.facility) further narrows this down to one or more specific
  // Regular facilities (e.g. just Vadgaon_OPS) — previously a dead filter here (same class of
  // bug as the old Facility Type slicer): the sidebar control existed and looked like it was
  // filtering, but this table's numbers never actually read it.
  const selectedFacilitySet = filters.facility?.length > 0 ? new Set(filters.facility) : null
  // Location narrows which facilities' stock gets summed too, same as the Facility slicer —
  // previously only filteredSkus read filters.location (to decide which SKU rows show up at
  // all), while regularSkus kept summing every Regular facility regardless, so picking "Pune"
  // still showed each SKU's company-wide total instead of just its Pune-location total.
  const selectedLocationSet = filters.location?.length > 0 ? new Set(filters.location) : null
  const regularSkus = useMemo(() => {
    if (!data) return []
    return data.skus.map(s => {
      let reg = (s.facilities || []).filter(f => f.facilityType === 'Regular')
      if (selectedFacilitySet) reg = reg.filter(f => selectedFacilitySet.has(f.facility))
      if (selectedLocationSet) reg = reg.filter(f => selectedLocationSet.has(f.location))
      const totalInvt = reg.reduce((sum, f) => sum + (f.totalInvt || 0), 0)
      const rtdInvt = reg.reduce((sum, f) => sum + (f.rtdInvt || 0), 0)
      const rawInvt = reg.reduce((sum, f) => sum + (f.rawInvt || 0), 0)
      const rawBlockedInvt = reg.reduce((sum, f) => sum + (f.rawBlockedInvt || 0), 0)
      return { ...s, totalInvt, rtdInvt, rawInvt, rawBlockedInvt }
    })
  }, [data, selectedFacilitySet, selectedLocationSet])

  // KPI row totals for the Regular view — summed from regularSkus (Regular-only inventory),
  // not data.summary (company-wide across every facility type).
  const regularSummary = useMemo(() => {
    const t = { totalInvt: 0, rtdInvt: 0, rawInvt: 0, rawBlockedInvt: 0 }
    for (const s of regularSkus) {
      t.totalInvt += s.totalInvt; t.rtdInvt += s.rtdInvt; t.rawInvt += s.rawInvt; t.rawBlockedInvt += s.rawBlockedInvt
    }
    return t
  }, [regularSkus])

  // Every sidebar/table slicer below was previously a "dead" filter on this table — each
  // control existed, visually toggled active, and even fed data.filterOptions correctly, but
  // filteredSkus never actually read filters.location/stockStatus/category/subCategory/
  // productId/rtdLevel. The table always showed all 2,427 SKUs no matter what was selected
  // (the note showing "X of 2,427 SKUs" was a live tell — X never moved). Only filters.facility
  // was wired in (fixed earlier). All of them now actually narrow the rows shown.
  const filteredSkus = useMemo(() => {
    if (!data) return []
    let rows = regularSkus
    if (filters.category?.length) rows = rows.filter(r => filters.category.includes(r.category))
    if (filters.subCategory?.length) rows = rows.filter(r => filters.subCategory.includes(r.subCategory))
    if (filters.productId?.length) rows = rows.filter(r => filters.productId.includes(r.sku))
    if (filters.stockStatus?.length) rows = rows.filter(r => filters.stockStatus.includes(r.stockStatus))
    if (filters.rtdLevel?.length) rows = rows.filter(r => filters.rtdLevel.includes(r.rtdLevel))
    if (filters.websiteStatus?.length) rows = rows.filter(r => filters.websiteStatus.includes(r.websiteStatus))
    if (filters.location?.length) {
      const locSet = new Set(filters.location)
      rows = rows.filter(r => (r.facilities || []).some(f => f.facilityType === 'Regular' && locSet.has(f.location) && (f.totalInvt || 0) > 0))
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(r => r.sku.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) || r.subCategory.toLowerCase().includes(q))
    }
    const { key, dir } = sort
    const sign = dir === 'asc' ? 1 : -1
    rows = [...rows].sort((a, b) => {
      const av = a[key], bv = b[key]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') return sign * av.localeCompare(bv)
      return sign * (av - bv)
    })
    return rows
  }, [data, regularSkus, filters.category, filters.subCategory, filters.productId, filters.stockStatus, filters.rtdLevel, filters.websiteStatus, filters.location, search, sort])

  // Footer totals for the Inventory Detail table — sums the measure columns across
  // whatever's currently visible (search + slicers applied), so it reads as "total for
  // what I'm looking at," not the whole unfiltered dataset.
  const tableTotals = useMemo(() => {
    const t = { rtdInvt: 0, rawInvt: 0, rawBlockedInvt: 0, totalInvt: 0, avgSale: 0, orderAllocation: 0 }
    for (const s of filteredSkus) {
      t.rtdInvt += s.rtdInvt
      t.rawInvt += s.rawInvt
      t.rawBlockedInvt += s.rawBlockedInvt
      t.totalInvt += s.totalInvt
      t.avgSale += s.avgSale
      t.orderAllocation += s.orderAllocation
    }
    const denominator = Math.ceil(Math.max(t.avgSale, t.orderAllocation))
    t.doi = denominator > 0 ? Math.floor(t.totalInvt / denominator) : null
    return t
  }, [filteredSkus])

  // Location-Wise Inventory pivot — restricted to whatever SKUs survive filteredSkus (Regular
  // scope + every sidebar filter), so this table respects the same Category/Sub-category/
  // Product ID/Stock Status/RTD Level/Location/Facility selections as Inventory Detail above
  // it, instead of always showing the full company-wide pivot regardless of what's filtered.
  const filteredPivot = useMemo(() => {
    const keySet = new Set(filteredSkus.map(s => s.sku))
    const locSet = filters.location?.length ? new Set(filters.location) : null
    const locations = locSet ? data.pivot.locations.filter(l => locSet.has(l)) : data.pivot.locations
    const rows = data.pivot.rows.filter(r => keySet.has(r.sku))
    return { locations, rows }
  }, [data, filteredSkus, filters.location])

  // Slow Moving / Dead Stock — recomputed from filteredSkus (Regular-scoped + every sidebar
  // filter applied) instead of the server-side data.slowMoving/data.deadStock, which are
  // always company-wide regardless of what's selected in the sidebar. Same thresholds/logic
  // as the server-side version (scripts/generate-inv-cache.mjs): a sub-category counts as
  // "dead" if it's not selling and holds >200 units, or its DOI exceeds 200; "slow moving" if
  // not selling at all, or DOI exceeds 45. Sub-categories with ≤50 total units, or starting
  // with "spareparts", are excluded — same floor as the server-side computation.
  const filteredSubCatRows = useMemo(() => {
    const SUBCAT_QTY_FLOOR = 50
    const map = new Map()
    for (const s of filteredSkus) {
      const key = `${s.category}|${s.subCategory}`
      if (!map.has(key)) map.set(key, { category: s.category, subCategory: s.subCategory, totalInvt: 0, avgSale: 0, skuList: [] })
      const acc = map.get(key)
      acc.totalInvt += s.totalInvt; acc.avgSale += s.avgSale; acc.skuList.push(s)
    }
    return [...map.values()]
      .filter(sc => sc.totalInvt > SUBCAT_QTY_FLOOR && !sc.subCategory?.toLowerCase().startsWith('sparepart'))
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
  }, [filteredSkus])
  const filteredDeadStock = useMemo(
    () => filteredSubCatRows.filter(sc => (sc.notBeingSold && sc.totalInvt > 200) || sc.doi > 200).sort((a, b) => b.totalInvt - a.totalInvt),
    [filteredSubCatRows]
  )
  const filteredSlowMoving = useMemo(
    () => filteredSubCatRows.filter(sc => sc.notBeingSold || sc.doi > 45).sort((a, b) => b.totalInvt - a.totalInvt),
    [filteredSubCatRows]
  )

  // Export rows flatten each sub-category's collapsed `skus[]` array to one row per SKU —
  // the on-screen table stays collapsed-by-default, but the CSV needs the SKU-level detail.
  const slowMovingExportRows = useMemo(() => {
    return filteredSlowMoving.flatMap(sc => sc.skus.map(s => ({
      category: sc.category, subCategory: sc.subCategory, sku: s.sku,
      totalInvt: s.totalInvt, avgSale: s.avgSale, doi: s.doi,
    })))
  }, [filteredSlowMoving])
  const deadStockExportRows = useMemo(() => {
    return filteredDeadStock.flatMap(sc => sc.skus.map(s => ({
      category: sc.category, subCategory: sc.subCategory, sku: s.sku,
      totalInvt: s.totalInvt, avgSale: s.avgSale, doi: s.doi,
    })))
  }, [filteredDeadStock])

  // Location-Wise export: one row per SKU, with a single "Location" column carrying each
  // location's own row — i.e. one row per (SKU, location), not one wide row per SKU.
  const pivotExportRows = useMemo(() => {
    return filteredPivot.rows.flatMap(r =>
      filteredPivot.locations.map(loc => {
        const v = r.byLocation[loc] || { totalInvt: 0, avgSale: 0 }
        return {
          category: r.category, subCategory: r.subCategory, sku: r.sku,
          location: loc, totalInvt: v.totalInvt, avgSale: v.avgSale,
        }
      })
    )
  }, [filteredPivot])

  // Inventory Detail export: one row per (SKU, location) — mirrors the on-screen table's
  // expand-to-locations view, but flattened for CSV instead of collapsed by default.
  const inventoryDetailExportRows = useMemo(() => {
    return filteredSkus.flatMap(s =>
      s.locations
        .filter(l => l.totalInvt > 0 || l.avgSale > 0)
        .map(l => ({
          category: s.category, subCategory: s.subCategory, sku: s.sku, location: l.location,
          rtdInvt: l.rtdInvt, rawInvt: l.rawInvt, rawBlockedInvt: l.rawBlockedInvt,
          totalInvt: l.totalInvt, avgSale: l.avgSale, doi: l.doi, stockStatus: l.stockStatus,
          websiteStatus: s.websiteStatus,
        }))
    )
  }, [filteredSkus])

  if (!data) return null

  // The collapse-toggle button used to sit in normal document flow right after the fixed
  // sidebar, assuming it would land flush against the sidebar's edge — but a position:fixed
  // sibling doesn't participate in flow at all, so this button's actual position depended on
  // where its own flow-placeholder happened to land, not on the sidebar's real edge. Fixing
  // the button's own position relative to the same --sb CSS variable the sidebar uses keeps
  // them locked together.
  return (
    <div style={{ display: 'flex', gap: 0 }}>
      {isMobile && <FilterSidebar data={data} filters={filters} setFilters={setFilters} open={sidebarOpen} onClose={() => setSidebarOpen(false)} isMobile={isMobile} sidebarTop={sidebarTop} />}

      {/* The collapse toggle is position:fixed and docked against the nav rail, so it no
          longer sits where content begins - this padding is just the page gutter. */}
      <div className="inv-main-content" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18, paddingLeft: 12, paddingRight: 24, paddingTop: 16 }}>

        {/* Mobile filter button — hidden on desktop, shown via CSS on mobile */}
        <button className="inv-filter-mobile-btn" onClick={() => setSidebarOpen(true)} style={{
          display: 'none', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
          background: IC.surface, border: `1px solid ${IC.border2}`, color: IC.t2, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start',
        }}>
          ☰ Filters{filters && Object.values(filters).some(v => Array.isArray(v) ? v.length : v) ? ' •' : ''}
        </button>

        {facilityView === 'regular' ? <>

        {/* KPI row — desktop: 7-col grid; mobile: swipe carousel */}
        <KpiCarousel>
          <KpiTile compact label="Total Inventory" value={fmtNum(regularSummary.totalInvt)} unit="units" icon="/inv-icon-total.png" />
          <KpiTile compact label="RTD Inventory" value={fmtNum(regularSummary.rtdInvt)} unit="units" icon="/inv-icon-rtd.jpg" />
          <KpiTile compact label="RAW Inventory" value={fmtNum(regularSummary.rawInvt)} unit="units" icon="/inv-icon-raw.png" />
          <KpiTile compact label="Blocked RAW" value={fmtNum(regularSummary.rawBlockedInvt)} unit="units" accent={IC.status.Low.c} icon="/inv-icon-blocked.png" />
          <KpiTile compact label="Avg Sale (B2C)" value={fmtNum(data.summary.avgSaleB2C)} unit="units/day" icon="/inv-icon-avgsale.png" />
          <KpiTile compact label="Total Avg Sale" value={fmtNum(data.summary.totalAvgSale)} unit="units/day" icon="/inv-icon-totalavgsale.png" />
          <KpiTile compact label="Days of Inventory" value={data.summary.doi} unit="days" accent={data.summary.doi <= 15 ? IC.status.Critical.c : IC.positive} icon="/inv-icon-doi.png" />
        </KpiCarousel>

        {/* Warehouse Health — desktop: GlassCard grid; mobile: swipe carousel */}
        <WhCarousel locations={data.locations} filters={filters} facilityTypes={['Regular']} />

        {/* Main inventory table */}
        <div className="inv-detail-card"><GlassCard
          title="Inventory Detail"
          note={<span className="inv-detail-desktop-only">{`${fmtInt(filteredSkus.length)} of ${fmtInt(data.skus.length)} SKUs`}</span>}
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="inv-detail-desktop-only"><SearchableMultiSelect label="RTD Level" options={data.filterOptions.rtdLevels} selected={filters.rtdLevel || []}
                onChange={v => setFilters(f => ({ ...f, rtdLevel: v }))} width={SLICER_WIDTH} height={SLICER_HEIGHT} /></span>
              <input placeholder="Search…" value={searchInput} onChange={e => setSearchInput(e.target.value)}
                className="inv-detail-search"
                style={{ background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 8, padding: '6px 10px', color: IC.t1, fontSize: 12, width: 238, maxWidth: '100%', boxSizing: 'border-box' }} />
              <span className="inv-detail-desktop-only"><ColumnVisibilityMenu columnDefs={COLUMN_DEFS} order={colOrder} hidden={hiddenCols} onShow={restoreColumn} /></span>
              {!isDefaultColLayout && (
                <span className="inv-detail-desktop-only">
                  <button onClick={resetColLayout}
                    style={{ fontSize: 11, color: IC.t2, background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>
                    ↺ Reset columns
                  </button>
                </span>
              )}
              <span className="inv-detail-desktop-only"><ExportButton filename="inventory_detail.csv" rows={inventoryDetailExportRows}
                columns={[
                  { label: 'Category', key: 'category' }, { label: 'Sub-category', key: 'subCategory' }, { label: 'Product ID', key: 'sku' }, { label: 'Location', key: 'location' },
                  { label: 'RTD Inventory', key: 'rtdInvt' }, { label: 'RAW Inventory', key: 'rawInvt' }, { label: 'RAW Blocked Inventory', key: 'rawBlockedInvt' },
                  { label: 'Total Inventory', key: 'totalInvt' }, { label: 'Avg Sale (B2C)', key: 'avgSale' }, { label: 'DOI', key: 'doi' },
                  { label: 'Stock Status', key: 'stockStatus' }, { label: 'Website Status', key: 'websiteStatus' },
                ]} /></span>
            </div>
          }
        >
        {/* Mobile table: sticky Product ID + 6 scrollable cols */}
        <MobDetailTable filteredSkus={filteredSkus} tableTotals={tableTotals} expandedSku={expandedSku} setExpandedSku={toggleExpandedSku} TABLE_SCROLL_HEIGHT={TABLE_SCROLL_HEIGHT} />
        {/* Desktop table */}
        <div className="inv-detail-desktop-only" ref={tableScrollRef} style={{ maxHeight: TABLE_SCROLL_HEIGHT, overflow: 'auto' }}
          onScroll={e => setVScrollTop(e.currentTarget.scrollTop)}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: IC.surface }}>
              <tr>
                {colOrder.map(key => {
                  const def = COLUMN_DEFS[key]
                  return (
                    <DraggableTh key={key} label={def.label} sortKey={key} sortState={sort} onSort={onSort} align={def.align}
                      width={colWidths[key] ?? DEFAULT_COL_WIDTHS[key]} onResize={w => setColWidth(key, w)}
                      group={def.group} onReorder={reorderCols} dragState={dragCol} setDragState={setDragCol} />
                  )
                })}
              </tr>
              {/* Divider as a real filler row (genuine table content, 1px tall) — border/box-shadow
                  on this sticky <thead> proved unreliable across several tables on this page. */}
              <tr style={{ height: 1 }}><td colSpan={colOrder.length} style={{ padding: 0, height: 1, background: IC.border }} /></tr>
            </thead>
            <tbody>
              {(() => {
                const containerH = tableScrollRef.current ? tableScrollRef.current.clientHeight : window.innerHeight * 0.58
                const startIdx = useVirtual ? Math.max(0, Math.floor(vScrollTop / ROW_H) - OVERSCAN) : 0
                const endIdx = useVirtual ? Math.min(filteredSkus.length, Math.ceil((vScrollTop + containerH) / ROW_H) + OVERSCAN) : filteredSkus.length
                const topSpacerH = useVirtual ? startIdx * ROW_H : 0
                const bottomSpacerH = useVirtual ? (filteredSkus.length - endIdx) * ROW_H : 0
                return (
                  <>
                    {topSpacerH > 0 && <tr style={{ height: topSpacerH }}><td colSpan={colOrder.length} /></tr>}
                    {filteredSkus.slice(startIdx, endIdx).map((s, relIdx) => {
                const i = startIdx + relIdx
                const activeLocations = s.locations.filter(l => l.totalInvt > 0 || l.avgSale > 0)
                return (
                  <React.Fragment key={`${s.skuKey || 'sku'}-${i}`}>
                    <tr onClick={() => toggleExpandedSku(s.skuKey)}
                      style={{ borderBottom: `1px solid ${IC.border}`, cursor: 'pointer', height: 34 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.025)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      {colOrder.map(key => {
                        if (hiddenCols.has(key)) return <td key={key} style={{ padding: 0, width: 0, overflow: 'hidden' }} />
                        const def = COLUMN_DEFS[key]
                        const cellStyle = { padding: '7px 10px', textAlign: def.align, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
                        if (key === 'category') return <td key={key} style={{ ...cellStyle, color: IC.t2 }}>{s.category}</td>
                        if (key === 'subCategory') return <td key={key} style={{ ...cellStyle, color: IC.t2 }}>{s.subCategory}</td>
                        if (key === 'sku') return (
                          <td key={key} style={{ ...cellStyle, fontWeight: 600, color: IC.t1 }}>
                            <span style={{ color: IC.t3, marginRight: 6, display: 'inline-block', transform: expandedSku === s.skuKey ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
                            {s.sku}
                          </td>
                        )
                        if (key === 'rtdInvt') return <td key={key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', color: IC.t1 }}>{fmtInt(s.rtdInvt)}</td>
                        if (key === 'rawInvt') return <td key={key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums' }}>{fmtInt(s.rawInvt)}</td>
                        if (key === 'rawBlockedInvt') return <td key={key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', color: IC.status.Low.c }}>{fmtInt(s.rawBlockedInvt)}</td>
                        if (key === 'totalInvt') return <td key={key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtInt(s.totalInvt)}</td>
                        if (key === 'avgSale') return <td key={key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums' }}>{fmtInt(s.avgSale)}</td>
                        if (key === 'doi') return <td key={key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: IC.t1 }}>{fmtDays(s.doi)}d</td>
                        if (key === 'stockStatus') return <td key={key} style={cellStyle}><StatusChip status={s.stockStatus} /></td>
                        if (key === 'websiteStatus') return <td key={key} style={cellStyle}><WebsiteStatusBadge status={s.websiteStatus} stockStatus={s.stockStatus} /></td>
                        return null
                      })}
                    </tr>
                    {expandedSku === s.skuKey && activeLocations.length === 0 && (
                      <tr style={{ background: 'rgba(0,0,0,0.02)', borderBottom: `1px solid ${IC.border}`, height: 30 }}>
                        <td colSpan={colOrder.length} style={{ padding: '6px 10px 6px 34px', color: IC.t3, fontSize: 11.5 }}>No location-level stock.</td>
                      </tr>
                    )}
                    {expandedSku === s.skuKey && activeLocations.map(l => (
                      <tr key={s.skuKey + l.location} style={{ background: 'rgba(0,0,0,0.02)', borderBottom: `1px solid ${IC.border}`, height: 30 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.045)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}>
                        {colOrder.map(key => {
                          if (hiddenCols.has(key)) return <td key={key} style={{ padding: 0, width: 0, overflow: 'hidden' }} />
                          const def = COLUMN_DEFS[key]
                          const cellStyle = { padding: '6px 10px', textAlign: def.align, fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
                          // Category/Sub-category stay blank on location rows — the location label
                          // sits one tab in, directly under the Product ID column (not the row start).
                          if (key === 'category') return <td key={key} style={cellStyle} />
                          if (key === 'subCategory') return <td key={key} style={cellStyle} />
                          if (key === 'sku') return <td key={key} style={{ ...cellStyle, color: IC.t3, paddingLeft: 24 }}>↳ {l.location}</td>
                          if (key === 'rtdInvt') return <td key={key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', color: IC.t1 }}>{fmtInt(l.rtdInvt)}</td>
                          if (key === 'rawInvt') return <td key={key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', color: IC.t2 }}>{fmtInt(l.rawInvt)}</td>
                          if (key === 'rawBlockedInvt') return <td key={key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', color: IC.status.Low.c }}>{fmtInt(l.rawBlockedInvt)}</td>
                          if (key === 'totalInvt') return <td key={key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', color: IC.t1, fontWeight: 700 }}>{fmtInt(l.totalInvt)}</td>
                          if (key === 'avgSale') return <td key={key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', color: IC.t2 }}>{fmtInt(l.avgSale)}</td>
                          if (key === 'doi') return <td key={key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', color: IC.t1, fontWeight: 700 }}>{fmtDays(l.doi)}d</td>
                          if (key === 'stockStatus') return <td key={key} style={cellStyle}><StatusChip status={l.stockStatus} /></td>
                          if (key === 'websiteStatus') return <td key={key} style={cellStyle} />
                          return null
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                )
                    })}
                    {bottomSpacerH > 0 && <tr style={{ height: bottomSpacerH }}><td colSpan={colOrder.length} /></tr>}
                  </>
                )
              })()}
            </tbody>
            <tfoot>
              {/* Total row — sticky to the bottom of the scroll area, sums whatever's
                  currently visible (search + slicers applied). This table has no vertical
                  borders between its category/sub-category/sku columns anywhere (data rows
                  included — separated by padding alone, by design), so its Total/SKU-count
                  cells were reading as merged once the footer background shifted off pure
                  white — kept on IC.surface here (unlike the header, and unlike every other
                  table's footer on this page) specifically to preserve that separation. */}
              <tr style={{ height: 1 }}><td colSpan={colOrder.length} style={{ padding: 0, height: 1, background: IC.border }} /></tr>
              <tr style={{
                position: 'sticky', bottom: 0, zIndex: 1, background: IC.surface, height: 34,
              }}>
                {colOrder.map(key => {
                  if (hiddenCols.has(key)) return <td key={key} style={{ padding: 0, width: 0, overflow: 'hidden' }} />
                  const def = COLUMN_DEFS[key]
                  const cellStyle = { padding: '7px 10px', textAlign: def.align, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 700, color: IC.t1 }
                  if (key === 'category') return <td key={key} style={cellStyle}>Total</td>
                  if (key === 'subCategory') return <td key={key} style={cellStyle} />
                  if (key === 'sku') return <td key={key} style={{ ...cellStyle, fontSize: 11, color: IC.t3, fontWeight: 500 }}>{filteredSkus.length} SKUs</td>
                  if (key === 'rtdInvt') return <td key={key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums' }}>{fmtInt(tableTotals.rtdInvt)}</td>
                  if (key === 'rawInvt') return <td key={key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums' }}>{fmtInt(tableTotals.rawInvt)}</td>
                  if (key === 'rawBlockedInvt') return <td key={key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums' }}>{fmtInt(tableTotals.rawBlockedInvt)}</td>
                  if (key === 'totalInvt') return <td key={key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums' }}>{fmtInt(tableTotals.totalInvt)}</td>
                  if (key === 'avgSale') return <td key={key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums' }}>{fmtInt(tableTotals.avgSale)}</td>
                  if (key === 'doi') return <td key={key} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums' }}>{fmtDays(tableTotals.doi)}d</td>
                  if (key === 'stockStatus') return <td key={key} style={cellStyle} />
                  if (key === 'websiteStatus') return <td key={key} style={cellStyle} />
                  return null
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </GlassCard></div>

      {/* Location-wise pivot table — hidden on mobile */}
      <div className="inv-detail-desktop-only"><GlassCard title="Location-Wise Inventory & Avg Sale"
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="text" value={pivotSearch} onChange={e => setPivotSearch(e.target.value)}
              placeholder="Search category / sub-category / SKU…"
              style={{ fontSize: 11.5, padding: '6px 10px', borderRadius: 7, background: IC.surface, color: IC.t1, border: `1px solid ${IC.border2}`, width: 260, boxSizing: 'border-box' }} />
            <ExportButton filename="location_wise_inventory.csv" rows={pivotExportRows}
              columns={[
                { label: 'Category', key: 'category' }, { label: 'Sub-category', key: 'subCategory' }, { label: 'Product ID', key: 'sku' },
                { label: 'Location', key: 'location' }, { label: 'Total Invt', key: 'totalInvt' }, { label: 'Avg Sale', key: 'avgSale' },
              ]} />
          </div>
        }>
        <PivotTable pivot={filteredPivot} search={pivotSearch} facilityTypeFilter={[]} />
      </GlassCard></div>

      {/* Slow-moving + Dead stock — each card sits in its own minWidth:0 wrapper div,
          on top of GlassCard's own minWidth:0, so this two-card row can't be pushed wider
          than its grid track by anything inside (e.g. SubCatStockTable's own scroll area)
          — the actual cause of the page-wide horizontal scroll/misalignment bug reported
          earlier. Belt-and-suspenders: the constraint is enforced at both the grid-item
          wrapper level and the card level, not relying on either alone. */}
      <div className="inv-2col-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'stretch', paddingBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
        <GlassCard title={<><span className="inv-detail-desktop-only">Slow Moving Sub-categories</span><span className="inv-detail-mobile-only">Slow Moving</span></>}
          action={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input placeholder="Search…" value={slowSearch} onChange={e => setSlowSearch(e.target.value)}
              className="inv-detail-search"
              style={{ background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 8, padding: '6px 10px', color: IC.t1, fontSize: 12, width: 238, maxWidth: '100%', boxSizing: 'border-box' }} />
            <span className="inv-detail-desktop-only"><ExportButton filename="slow_moving.csv" rows={slowMovingExportRows}
              columns={[{ label: 'Category', key: 'category' }, { label: 'Sub-category', key: 'subCategory' }, { label: 'Product ID', key: 'sku' }, { label: 'Total Invt', key: 'totalInvt' }, { label: 'Avg Sale', key: 'avgSale' }, { label: 'DOI', key: 'doi' }]} /></span>
          </div>}>
          <SubCatStockTable rows={filteredSlowMoving} emptyLabel="No slow-moving sub-categories flagged." search={slowSearch} />
        </GlassCard>
        </div>

        <div style={{ minWidth: 0 }}>
        <GlassCard title={<><span className="inv-detail-desktop-only">Dead Stock Sub-categories</span><span className="inv-detail-mobile-only">Dead Stock</span></>}
          action={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input placeholder="Search…" value={deadSearch} onChange={e => setDeadSearch(e.target.value)}
              className="inv-detail-search"
              style={{ background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 8, padding: '6px 10px', color: IC.t1, fontSize: 12, width: 238, maxWidth: '100%', boxSizing: 'border-box' }} />
            <span className="inv-detail-desktop-only"><ExportButton filename="dead_stock.csv" rows={deadStockExportRows}
              columns={[{ label: 'Category', key: 'category' }, { label: 'Sub-category', key: 'subCategory' }, { label: 'Product ID', key: 'sku' }, { label: 'Total Invt', key: 'totalInvt' }, { label: 'Avg Sale', key: 'avgSale' }, { label: 'DOI', key: 'doi' }]} /></span>
          </div>}>
          <SubCatStockTable rows={filteredDeadStock} emptyLabel="No dead stock right now." search={deadSearch} />
        </GlassCard>
        </div>
      </div>

      {/* Mobility & Ergo Furniture — independent Avg Sale table. Not gated by any sidebar
          filter (location/facility/category/etc.) — see MOBILITY_ERGO_COLS comment above for
          why this is deliberately separate from the main Inventory Detail table. */}
      {data.mobilityErgoAvgSale?.length > 0 && (
        <div style={{ paddingBottom: 20 }}>
          <MobilityErgoAvgSaleTable rows={data.mobilityErgoAvgSale} />
        </div>
      )}
      </> : (
        <OtherFacilitiesTable skus={data.skus} search={search} locationOrder={data.filterOptions.locations} allFacilities={data.filterOptions.facilities} />
      )}
      </div>
    </div>
  )
})

export default function InventoryHealthPage({ data, filters, setFilters, sidebarTop, facilityView: facilityViewProp, setFacilityView: setFacilityViewProp }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  if (!data) return null
  return (
    <InventoryHealthInner
      data={data} filters={filters} setFilters={setFilters}
      sidebarTop={sidebarTop} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
      facilityViewProp={facilityViewProp} setFacilityViewProp={setFacilityViewProp}
    />
  )
}

// Exported so InventoryPage can render this panel inside the top-bar Filters popover.
export { FilterSidebar as HealthFilterSidebar }
