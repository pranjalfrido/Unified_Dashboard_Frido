import React, { useState, useMemo, useRef, useLayoutEffect, useEffect } from 'react'
import {
  IC, fmtNum, fmtInt, fmtDays, GlassCard, KpiTile, StatusChip, SearchableMultiSelect, DraggableTh, ExportButton,
} from './theme.jsx'

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
function SubCatStockTable({ rows, emptyLabel }) {
  const [expanded, setExpanded] = useState(new Set())
  const toggle = key => setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  const [sort, setSort] = useState(null) // { key: 'subCategory' | 'totalInvt' | 'avgSale' | 'doi', dir: 'asc' | 'desc' }
  const onSort = key => setSort(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'subCategory' ? 'asc' : 'desc' })

  if (rows.length === 0) return <div style={{ color: IC.t3, fontSize: 12 }}>{emptyLabel}</div>

  const sortedRows = sort ? [...rows].sort((a, b) => {
    const sign = sort.dir === 'asc' ? 1 : -1
    const av = a[sort.key], bv = b[sort.key]
    if (typeof av === 'string') return sign * av.localeCompare(bv)
    return sign * ((av ?? -Infinity) - (bv ?? -Infinity))
  }) : rows

  const th = (label, key, align = 'right') => (
    <th onClick={() => onSort(key)}
      style={{
        textAlign: align, padding: '6px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
        color: sort?.key === key ? IC.t1 : IC.t3, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
      }}>
      {label}{sort?.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )

  return (
    <div style={{ maxHeight: 460, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead style={{ position: 'sticky', top: 0, background: IC.surfaceHi, zIndex: 1 }}>
          <tr>
            {th('Sub-category', 'subCategory', 'left')}
            {th('Total Invt', 'totalInvt')}
            {th('Avg Sale', 'avgSale')}
            {th('DOI', 'doi')}
          </tr>
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
                  <td style={{ padding: '6px 8px', fontWeight: 600, color: IC.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: IC.t3, marginRight: 6, display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
                    {r.subCategory}
                    <span style={{ marginLeft: 6, fontSize: 10.5, color: IC.t3, fontWeight: 500 }}>({r.category})</span>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtInt(r.totalInvt)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: IC.t2 }}>{fmtNum(r.avgSale)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: IC.t1 }}>{fmtDays(r.doi)}d</td>
                </tr>
                {isOpen && r.skus.map((s, j) => (
                  <tr key={key + '-' + j} style={{ background: 'rgba(0,0,0,0.02)', borderBottom: `1px solid ${IC.border}`, height: 28 }}>
                    <td style={{ padding: '5px 8px 5px 26px', color: IC.t3, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↳ {s.sku}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 11.5, color: IC.t2 }}>{fmtInt(s.totalInvt)}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 11.5, color: IC.t2 }}>{fmtNum(s.avgSale)}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 11.5, color: IC.t1 }}>{fmtDays(s.doi)}d</td>
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
  return <div style={{ fontSize: 10, fontWeight: 800, color: IC.t3, letterSpacing: '.06em', textTransform: 'uppercase', margin: '2px 0 2px' }}>{title}</div>
}

function TileToggle({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = IC.hoverBg }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = IC.surface }}
      style={{
        padding: '6px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: active ? 700 : 500,
        background: active ? IC.accDim : IC.surface, color: active ? IC.t1 : IC.t2,
        border: `1.5px solid ${active ? IC.accBorder : IC.border}`, textAlign: 'center',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'background .12s',
      }}>
      {label}
    </button>
  )
}

function FilterSidebar({ data, filters, setFilters, open, sidebarTop }) {
  const opts = data.filterOptions
  const set = (key, arr) => setFilters(f => ({ ...f, [key]: arr }))
  const toggleTile = (key, value) => setFilters(f => {
    const cur = f[key] || []
    const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value]
    return { ...f, [key]: next }
  })
  const anyActive = ['category', 'subCategory', 'facility', 'facilityType', 'productId', 'location', 'stockStatus']
    .some(k => filters[k]?.length)

  // position: fixed, positioned using the app shell's own known top-bar height (--nav,
  // 52px in index.css) rather than a live getBoundingClientRect() measurement — measuring
  // the anchor's live position was unreliable: if the page had already been scrolled when
  // this component mounted (or before sidebarTop's data-dependent content, e.g. the
  // snapshot-timestamp line that only appears once data arrives, finished growing to full
  // height), the captured top/left baked in a stale, already-scrolled offset that never
  // corrected itself, leaving the fixed sidebar pinned in the wrong place with its top
  // content clipped.
  const anchorRef = useRef(null)
  const [left, setLeft] = useState(null)
  useLayoutEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- measuring DOM layout is exactly what useLayoutEffect is for
      setLeft(null)
      return
    }
    const measure = () => {
      const el = anchorRef.current
      if (!el) return
      setLeft(el.getBoundingClientRect().left)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open])

  return (
    <div ref={anchorRef} style={{
      width: open ? SIDEBAR_WIDTH : 0, minWidth: open ? SIDEBAR_WIDTH : 0, transition: 'width .2s ease, min-width .2s ease',
      overflow: 'hidden', borderRight: `1px solid ${IC.border}`, flexShrink: 0,
      // Matches the fixed inner panel's own background — this outer anchor div only reserves
      // width in the flex row (its child becomes position:fixed once measured), but it still
      // occupies real vertical space at its own top offset (pushed down by the page's own
      // padding). Without a matching background here, the app shell's grey shows through as
      // a gap above/around where the fixed white sidebar visually begins.
      background: IC.surface,
    }}>
      <div style={{
        width: SIDEBAR_WIDTH, padding: '12px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10,
        background: IC.surface,
        ...(left != null ? {
          position: 'fixed', top: 'var(--nav)', left,
          height: 'calc(100vh - var(--nav))', overflowY: 'auto',
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

        <div style={{ height: 1, background: IC.border, margin: '2px 0' }} />
        <SidebarSectionTitle title="Avg Sale Window" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {[7, 15, 30].map(d => (
            <TileToggle key={d} label={`${d}d`} active={(filters.avgSaleWindowDays || 7) === d} onClick={() => setFilters(f => ({ ...f, avgSaleWindowDays: d }))} />
          ))}
        </div>

        <div style={{ height: 1, background: IC.border, margin: '2px 0' }} />
        <SidebarSectionTitle title="Filters" />
        <SearchableMultiSelect label="Facility Type" options={opts.facilityTypes} selected={filters.facilityType || []} onChange={v => set('facilityType', v)}
          width={SIDEBAR_WIDTH - 24} height={SLICER_HEIGHT} />
        <SearchableMultiSelect label="Facility" options={opts.facilities} selected={filters.facility || []} onChange={v => set('facility', v)}
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
function PivotTable({ pivot, search }) {
  const [expanded, setExpanded] = useState(new Set())
  const toggle = key => setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  const tree = useMemo(() => {
    const cats = new Map()
    for (const r of pivot.rows) {
      if (!cats.has(r.category)) cats.set(r.category, { name: r.category, byLoc: {}, totalInvt: 0, avgSale: 0, subs: new Map() })
      const cat = cats.get(r.category)
      if (!cat.subs.has(r.subCategory)) cat.subs.set(r.subCategory, { name: r.subCategory, byLoc: {}, totalInvt: 0, avgSale: 0, skus: [] })
      const sub = cat.subs.get(r.subCategory)
      sub.skus.push(r)
      sub.totalInvt += r.totalInvt
      sub.avgSale += r.avgSale
      cat.totalInvt += r.totalInvt
      cat.avgSale += r.avgSale
      for (const loc of pivot.locations) {
        const v = r.byLocation[loc] || { totalInvt: 0, avgSale: 0 }
        cat.byLoc[loc] = { totalInvt: (cat.byLoc[loc]?.totalInvt || 0) + v.totalInvt, avgSale: (cat.byLoc[loc]?.avgSale || 0) + v.avgSale }
        sub.byLoc[loc] = { totalInvt: (sub.byLoc[loc]?.totalInvt || 0) + v.totalInvt, avgSale: (sub.byLoc[loc]?.avgSale || 0) + v.avgSale }
      }
    }
    return [...cats.values()].sort((a, b) => b.totalInvt - a.totalInvt)
  }, [pivot])

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

  const SUBCOL_W = 64
  const locCell = (obj, loc, color) => {
    const v = obj[loc] || { totalInvt: 0, avgSale: 0 }
    return (
      <td key={loc} style={{ padding: '6px 10px', borderRight: `1px solid ${IC.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color, width: SUBCOL_W, textAlign: 'right' }}>{fmtInt(v.totalInvt)}</span>
          <span style={{ color: IC.t3, width: SUBCOL_W, textAlign: 'right' }}>{fmtInt(v.avgSale)}</span>
        </div>
      </td>
    )
  }

  return (
    <div>
      <div style={{ maxHeight: TABLE_SCROLL_HEIGHT, overflow: 'auto' }}>
        <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: IC.t3, padding: '6px 10px', borderBottom: `1px solid ${IC.border2}`, borderRight: `1px solid ${IC.border}`, position: 'sticky', left: 0, background: IC.surfaceHi, zIndex: 3 }}>Category / Sub-category / SKU</th>
              {pivot.locations.map(loc => (
                <th key={loc} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: IC.t3, padding: '6px 10px 2px', borderRight: `1px solid ${IC.border}`, background: IC.surfaceHi }}>{loc}</th>
              ))}
              <th rowSpan={2} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: IC.t3, padding: '6px 10px', borderBottom: `1px solid ${IC.border2}`, background: IC.surfaceHi }}>Total<br />Inventory / Avg Sale</th>
            </tr>
            <tr>
              {pivot.locations.map(loc => (
                <th key={loc} style={{ fontSize: 9, fontWeight: 600, color: IC.t3, padding: '0 10px 6px', borderBottom: `1px solid ${IC.border2}`, borderRight: `1px solid ${IC.border}`, background: IC.surfaceHi }}>
                  <span style={{ display: 'flex', justifyContent: 'center', gap: 10 }}><span style={{ width: SUBCOL_W, textAlign: 'right' }}>Inventory</span><span style={{ width: SUBCOL_W, textAlign: 'right' }}>Avg Sale</span></span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredTree.map(cat => {
              const catKey = `c:${cat.name}`
              const catOpen = expanded.has(catKey)
              return (
                <React.Fragment key={catKey}>
                  <tr onClick={() => toggle(catKey)} style={{ cursor: 'pointer', background: 'rgba(0,0,0,0.02)', borderBottom: `1px solid ${IC.border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.045)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}>
                    <td style={{ padding: '7px 10px', fontWeight: 700, color: IC.t1, position: 'sticky', left: 0, background: IC.surface, borderRight: `1px solid ${IC.border}` }}>
                      <span style={{ display: 'inline-block', width: 14, transform: catOpen ? 'rotate(90deg)' : 'none', transition: 'transform .12s', color: IC.t3 }}>›</span>
                      {cat.name}
                    </td>
                    {pivot.locations.map(loc => locCell(cat.byLoc, loc, IC.t1))}
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: IC.t1 }}>
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
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: IC.t1 }}>
                            {fmtInt(sub.totalInvt)} <span style={{ color: IC.t3 }}>/ {fmtInt(sub.avgSale)}</span>
                          </td>
                        </tr>
                        {subOpen && sub.skus.sort((a, b) => b.totalInvt - a.totalInvt).map(sku => (
                          <tr key={sku.sku} style={{ borderBottom: `1px solid ${IC.border}`, background: 'rgba(0,0,0,0.015)' }}>
                            <td style={{ padding: '5px 10px 5px 46px', color: IC.t3, fontSize: 11, position: 'sticky', left: 0, background: IC.surface, borderRight: `1px solid ${IC.border}` }}>{sku.sku}</td>
                            {pivot.locations.map(loc => locCell(sku.byLocation, loc, IC.t3))}
                            <td style={{ padding: '5px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: IC.t2, fontSize: 11 }}>
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
          <tfoot>
            <tr style={{ background: IC.surfaceHi, borderTop: `2px solid ${IC.border2}` }}>
              <td style={{ padding: '7px 10px', fontWeight: 700, color: IC.t1, position: 'sticky', left: 0, background: IC.surfaceHi, borderRight: `1px solid ${IC.border}` }}>Grand Total</td>
              {pivot.locations.map(loc => locCell(grandTotal.byLoc, loc, IC.t1))}
              <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: IC.t1 }}>
                {fmtInt(grandTotal.totalInvt)} <span style={{ color: IC.t2, fontWeight: 600 }}>/ {fmtInt(grandTotal.avgSale)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

export default function InventoryHealthPage({ data, filters, setFilters, sidebarTop }) {
  const [search, setSearch] = useState('')
  const [expandedSku, setExpandedSku] = useState(null)
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pivotSearch, setPivotSearch] = useState('')

  // Facility Type defaults to "Regular" on first load (once options are known).
  const defaultedFacilityType = React.useRef(false)
  React.useEffect(() => {
    if (defaultedFacilityType.current) return
    if (!data?.filterOptions?.facilityTypes?.includes('Regular')) return
    defaultedFacilityType.current = true
    if (!filters.facilityType) setFilters(f => ({ ...f, facilityType: ['Regular'] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.filterOptions?.facilityTypes])

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

  const filteredSkus = useMemo(() => {
    if (!data) return []
    let rows = data.skus
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
  }, [data, search, sort])

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

  // Export rows flatten each sub-category's collapsed `skus[]` array to one row per SKU —
  // the on-screen table stays collapsed-by-default, but the CSV needs the SKU-level detail.
  const slowMovingExportRows = useMemo(() => {
    if (!data) return []
    return data.slowMoving.flatMap(sc => sc.skus.map(s => ({
      category: sc.category, subCategory: sc.subCategory, sku: s.sku,
      totalInvt: s.totalInvt, avgSale: s.avgSale, doi: s.doi,
    })))
  }, [data])
  const deadStockExportRows = useMemo(() => {
    if (!data) return []
    return data.deadStock.flatMap(sc => sc.skus.map(s => ({
      category: sc.category, subCategory: sc.subCategory, sku: s.sku,
      totalInvt: s.totalInvt, avgSale: s.avgSale, doi: s.doi,
    })))
  }, [data])

  // Location-Wise export: one row per SKU, with a single "Location" column carrying each
  // location's own row — i.e. one row per (SKU, location), not one wide row per SKU.
  const pivotExportRows = useMemo(() => {
    if (!data) return []
    return data.pivot.rows.flatMap(r =>
      data.pivot.locations.map(loc => {
        const v = r.byLocation[loc] || { totalInvt: 0, avgSale: 0 }
        return {
          category: r.category, subCategory: r.subCategory, sku: r.sku,
          location: loc, totalInvt: v.totalInvt, avgSale: v.avgSale,
        }
      })
    )
  }, [data])

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

  return (
    <div style={{ display: 'flex', gap: 0 }}>
      <FilterSidebar data={data} filters={filters} setFilters={setFilters} open={sidebarOpen} sidebarTop={sidebarTop} />
      <button onClick={() => setSidebarOpen(o => !o)} style={{
        width: 16, alignSelf: 'flex-start', marginTop: 4, height: 48, border: `1px solid ${IC.border}`, borderLeft: 'none',
        background: IC.surface, cursor: 'pointer', borderRadius: '0 8px 8px 0', display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: IC.t3, fontSize: 12, flexShrink: 0,
        position: 'sticky', top: 4,
      }}>
        {sidebarOpen ? '‹' : '›'}
      </button>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18, paddingLeft: 16, paddingRight: 24 }}>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 10, alignItems: 'stretch' }}>
          <KpiTile compact label="Total Inventory" value={fmtNum(data.summary.totalInvt)} unit="units" icon="📦" />
          <KpiTile compact label="RTD Inventory" value={fmtNum(data.summary.rtdInvt)} unit="units" icon="✓" />
          <KpiTile compact label="RAW Inventory" value={fmtNum(data.summary.rawInvt)} unit="units" icon="◧" />
          <KpiTile compact label="Blocked RAW" value={fmtNum(data.summary.rawBlockedInvt)} unit="units" accent={IC.status.Low.c} icon="⛔" />
          <KpiTile compact label="Avg Sale (B2C)" value={fmtNum(data.summary.avgSaleB2C)} unit="units/day" icon="📈" />
          <KpiTile compact label="Total Avg Sale" value={fmtNum(data.summary.totalAvgSale)} unit="units/day" icon="Σ" />
          <KpiTile compact label="Days of Inventory" value={data.summary.doi} unit="days" accent={data.summary.doi <= 15 ? IC.status.Critical.c : IC.positive} icon="⏱" />
        </div>

        {/* Warehouse grid — always one row; cards shrink to fit rather than wrapping to a 2nd line */}
        <GlassCard title="Warehouse Health" note={`${(data.allLocations || data.locations).length} locations`}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max((data.allLocations || data.locations).length, 1)}, 1fr)`, gap: 8 }}>
            {(data.allLocations || data.locations).map(loc => <WarehouseCard key={loc.location} loc={loc} selected={filters.location?.length > 0 && filters.location.includes(loc.location)} />)}
          </div>
        </GlassCard>

        {/* Main inventory table */}
        <GlassCard
          title="Inventory Detail"
          note={`${fmtInt(filteredSkus.length)} of ${fmtInt(data.skus.length)} SKUs`}
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SearchableMultiSelect label="RTD Level" options={data.filterOptions.rtdLevels} selected={filters.rtdLevel || []}
                onChange={v => setFilters(f => ({ ...f, rtdLevel: v }))} width={SLICER_WIDTH} height={SLICER_HEIGHT} />
              <input placeholder="Quick search…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 8, padding: '6px 10px', color: IC.t1, fontSize: 12, width: 170 }} />
              <ColumnVisibilityMenu columnDefs={COLUMN_DEFS} order={colOrder} hidden={hiddenCols} onShow={restoreColumn} />
              <ExportButton filename="inventory_detail.csv" rows={inventoryDetailExportRows}
                columns={[
                  { label: 'Category', key: 'category' }, { label: 'Sub-category', key: 'subCategory' }, { label: 'Product ID', key: 'sku' }, { label: 'Location', key: 'location' },
                  { label: 'RTD Inventory', key: 'rtdInvt' }, { label: 'RAW Inventory', key: 'rawInvt' }, { label: 'RAW Blocked Inventory', key: 'rawBlockedInvt' },
                  { label: 'Total Inventory', key: 'totalInvt' }, { label: 'Avg Sale (B2C)', key: 'avgSale' }, { label: 'DOI', key: 'doi' },
                  { label: 'Stock Status', key: 'stockStatus' }, { label: 'Website Status', key: 'websiteStatus' },
                ]} />
            </div>
          }
        >
        <div style={{ maxHeight: TABLE_SCROLL_HEIGHT, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: IC.surfaceHi }}>
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
            </thead>
            <tbody>
              {filteredSkus.map((s, i) => {
                const activeLocations = s.locations.filter(l => l.totalInvt > 0 || l.avgSale > 0)
                return (
                  <React.Fragment key={`${s.skuKey || 'sku'}-${i}`}>
                    <tr onClick={() => setExpandedSku(k => k === s.skuKey ? null : s.skuKey)}
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
            </tbody>
            <tfoot>
              {/* Total row — sticky to the bottom of the scroll area, sums whatever's
                  currently visible (search + slicers applied). Same background shade as
                  the header, so header + footer read as one matched pair framing the table. */}
              <tr style={{
                position: 'sticky', bottom: 0, zIndex: 1, background: IC.surfaceHi,
                borderTop: `2px solid ${IC.border2}`, height: 34,
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
      </GlassCard>

      {/* Location-wise pivot table */}
      <GlassCard title="Location-Wise Inventory & Avg Sale"
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
        <PivotTable pivot={data.pivot} search={pivotSearch} />
      </GlassCard>

      {/* Slow-moving + Dead stock */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 14 }}>
        <GlassCard title="Slow-Moving Sub-categories" note="DOI > 45d or not being sold, sub-cat stock > 50 units"
          action={<ExportButton filename="slow_moving.csv" rows={slowMovingExportRows}
            columns={[{ label: 'Category', key: 'category' }, { label: 'Sub-category', key: 'subCategory' }, { label: 'Product ID', key: 'sku' }, { label: 'Total Invt', key: 'totalInvt' }, { label: 'Avg Sale', key: 'avgSale' }, { label: 'DOI', key: 'doi' }]} />}>
          <SubCatStockTable rows={data.slowMoving} emptyLabel="No slow-moving sub-categories flagged." />
        </GlassCard>

        <GlassCard title="Dead Stock Sub-categories" note="DOI > 200d, or not being sold with stock > 200 units"
          action={<ExportButton filename="dead_stock.csv" rows={deadStockExportRows}
            columns={[{ label: 'Category', key: 'category' }, { label: 'Sub-category', key: 'subCategory' }, { label: 'Product ID', key: 'sku' }, { label: 'Total Invt', key: 'totalInvt' }, { label: 'Avg Sale', key: 'avgSale' }, { label: 'DOI', key: 'doi' }]} />}>
          <SubCatStockTable rows={data.deadStock} emptyLabel="No dead stock right now." />
        </GlassCard>
      </div>

      </div>
    </div>
  )
}
