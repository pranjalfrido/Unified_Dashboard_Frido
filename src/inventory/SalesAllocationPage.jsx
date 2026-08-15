import { useMemo, useState, useEffect, useRef, useCallback, Children, Fragment } from 'react'
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import {
  IC, fmtNum, fmtInt, fmtCurrency, GlassCard, KpiTile, SearchableMultiSelect, ExportButton,
} from './theme.jsx'

function SaKpiCarousel({ children }) {
  const count = Children.count(children)
  const scrollRef = useRef(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const cardW = 160 + 10
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
            <div key={i} style={{ width: i === activeIdx ? 16 : 6, height: 6, borderRadius: 3, background: i === activeIdx ? '#FFD600' : '#C7C7CE', transition: 'all .2s' }} />
          ))}
        </div>
      </div>
      <div className="inv-kpi-desktop-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`, gap: 10, alignItems: 'stretch' }}>
        {children}
      </div>
    </>
  )
}

const SLICER_HEIGHT = 32
const SIDEBAR_WIDTH = 220
// Matrix cell-key field delimiter — must match api/sales-allocation.js's MSEP. Category/
// sub-category names can contain a literal "|", so a plain pipe can't be used as a delimiter.
const MSEP = '\x1f'
// Shared fixed content height for the Category Contribution / Drastic Sales Change pair —
// keeps both cards the same height regardless of row count or which toggle is active.
// Category Contribution's rows spread evenly to fill it; Drastic Sales Change (up to 20
// rows) scrolls internally once its compact rows exceed it.
const MOVERS_CARD_HEIGHT = 270
// Total fixed height for the Top Products / Drastic Sales Change cards, header+toolbar
// included. Each card's own toolbar can be taller or shorter than its sibling's (Drastic's
// has more toggle groups) — the list below simply gets whatever vertical space is left via
// flex:1, so the outer card height stays fixed without forcing both lists to the same size.
const MOVERS_TOTAL_HEIGHT = 380

// Sales Trend tooltip — Units + Revenue (whichever series are on the chart) plus ASP
// (revenue ÷ units for that point), shown as a plain number with no dedicated trend line
// since ASP sits on neither the qty nor the revenue scale.
function SalesTrendTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  return (
    <div style={{ background: IC.surfaceHi, border: `1px solid ${IC.border2}`, borderRadius: 10, padding: '8px 12px', fontSize: 11.5 }}>
      <div style={{ fontWeight: 700, color: IC.t1, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, color: IC.t2 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color || p.fill }} />
          <span>{p.name}</span>
          <span style={{ marginLeft: 'auto', fontWeight: 700, color: IC.t1, fontVariantNumeric: 'tabular-nums' }}>
            {p.dataKey === 'rev' ? fmtCurrency(p.value) : fmtNum(p.value)}
          </span>
        </div>
      ))}
      {point?.asp != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: IC.t2, marginTop: 2, paddingTop: 4, borderTop: `1px solid ${IC.border}` }}>
          <span style={{ width: 7 }} />
          <span>ASP</span>
          <span style={{ marginLeft: 'auto', fontWeight: 700, color: IC.t1, fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(point.asp)}</span>
        </div>
      )}
    </div>
  )
}

function ChangeBadge({ pct }) {
  if (pct == null) return null
  const up = pct >= 0
  const color = up ? IC.positive : IC.status.Critical.c
  return <span style={{ fontSize: 11, fontWeight: 700, color }}>{up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%</span>
}

// ── Tiny inline sparkline (single series, no axes/legend — the mark IS the label) ──
// ── Left filter sidebar — same pattern/component set as Inventory Health, for consistency ──
function FilterSidebar({ data, filters, setFilters, open, onClose, isMobile, sidebarTop }) {
  const opts = data.filterOptions
  const set = (key, arr) => setFilters(f => ({ ...f, [key]: arr }))
  const anyActive = ['category', 'subCategory', 'sku', 'channel', 'salesType', 'facility', 'region']
    .some(k => filters[k]?.length)

  const filterContent = (
    <>
      {sidebarTop}
      <div style={{ fontSize: 10, fontWeight: 800, color: IC.t3, letterSpacing: '.06em', textTransform: 'uppercase' }}>Filters</div>
      <SearchableMultiSelect label="Category" options={opts.categories} selected={filters.category || []} onChange={v => set('category', v)}
        width={SIDEBAR_WIDTH - 24} height={SLICER_HEIGHT} />
      <SearchableMultiSelect label="Sub-category" options={opts.subCategories} selected={filters.subCategory || []} onChange={v => set('subCategory', v)}
        width={SIDEBAR_WIDTH - 24} height={SLICER_HEIGHT} />
      <SearchableMultiSelect label="Product ID" options={opts.skus} selected={filters.sku || []} onChange={v => set('sku', v)}
        width={SIDEBAR_WIDTH - 24} height={SLICER_HEIGHT} />
      <div style={{ height: 1, background: IC.border, margin: '2px 0' }} />
      <SearchableMultiSelect label="Channel" options={opts.channels} selected={filters.channel || []} onChange={v => set('channel', v)}
        width={SIDEBAR_WIDTH - 24} height={SLICER_HEIGHT} />
      <SearchableMultiSelect label="Sales Type" options={opts.salesTypes} selected={filters.salesType || []} onChange={v => set('salesType', v)}
        width={SIDEBAR_WIDTH - 24} height={SLICER_HEIGHT} />
      <div style={{ height: 1, background: IC.border, margin: '2px 0' }} />
      <SearchableMultiSelect label="Facility" options={opts.facilities} selected={filters.facility || []} onChange={v => set('facility', v)}
        getKey={o => o.facility} getLabel={o => o.facility} width={SIDEBAR_WIDTH - 24} height={SLICER_HEIGHT} />
      <SearchableMultiSelect label="Region" options={opts.regions} selected={filters.region || []} onChange={v => set('region', v)}
        width={SIDEBAR_WIDTH - 24} height={SLICER_HEIGHT} />
      <div style={{ height: 1, background: IC.border, margin: '2px 0' }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: IC.t2, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!filters.comparePrevious} onChange={e => setFilters(f => ({ ...f, comparePrevious: e.target.checked }))} />
        Compare to previous period
      </label>
      {anyActive && (
        <button onClick={() => setFilters(f => ({ comparePrevious: f.comparePrevious, momentumWindow: f.momentumWindow }))}
          style={{ fontSize: 11, color: IC.t3, background: 'none', border: `1px solid ${IC.border}`, borderRadius: 6, padding: '5px 0', cursor: 'pointer' }}>
          ✕ Clear all
        </button>
      )}
    </>
  )

  if (isMobile) {
    if (!open) return null
    return (
      <>
        <div className="inv-filter-backdrop" onClick={onClose} />
        <div className="inv-filter-drawer" style={{ background: IC.surface, borderRight: `1px solid ${IC.border}`, display: 'flex', flexDirection: 'column', gap: 10, padding: '12px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: IC.t1 }}>Filters</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: IC.t3, fontSize: 18, cursor: 'pointer', padding: '2px 6px', lineHeight: 1 }}>✕</button>
          </div>
          {filterContent}
        </div>
      </>
    )
  }

  return (
    <div style={{
      width: open ? SIDEBAR_WIDTH : 0, minWidth: open ? SIDEBAR_WIDTH : 0, transition: 'width .2s ease, min-width .2s ease',
      overflow: 'hidden', borderRight: `1px solid ${IC.border}`, flexShrink: 0,
      background: IC.surface,
    }}>
      <div style={{
        width: SIDEBAR_WIDTH, padding: '12px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10,
        background: IC.surface,
        ...(open ? {
          position: 'fixed', top: 'var(--nav)', left: 'var(--sb)',
          height: 'calc(100vh - var(--nav))', overflowY: 'auto',
        } : {}),
      }}>
        {filterContent}
      </div>
    </div>
  )
}

// `variants` are the raw duplicate/alias SKU codes rolled into this master SKU — expandable
// only when there's more than one, since a single-variant row has nothing new to reveal.
// Ranked single-series bar list — used by both Category Contribution and Channel-Wise
// Sales. Rows are laid out as `repeat(N, 1fr)` grid tracks over a fixed height so they
// always fill it edge-to-edge regardless of row count, rather than leaving blank space
// below a `space-between` flex column (which only spaces gaps, not the outer edges).
function RankedBarList({ rows, total, height, nameWidth = 90, metric = 'qty' }) {
  return (
    <div style={{ display: 'grid', gridTemplateRows: `repeat(${rows.length}, 1fr)`, height, flexShrink: 0, overflow: 'hidden' }}>
      {rows.map(r => {
        const pct = total > 0 ? r.value / total : 0
        return (
          <div key={r.name} style={{ display: 'grid', gridTemplateColumns: `${nameWidth}px 1fr 74px 52px`, alignItems: 'center', gap: 8 }}>
            <span title={r.name} style={{ fontSize: 11, color: IC.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            <div style={{ height: 10, borderRadius: 4, background: 'rgba(0,0,0,0.06)', overflow: 'hidden', position: 'relative' }}>
              <div style={{ width: `${pct * 100}%`, height: '100%', background: IC.acc, borderRadius: 4 }} />
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: IC.t1, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {metric === 'rev' ? fmtCurrency(r.value) : fmtInt(r.value)}
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: IC.t1, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(pct * 100).toFixed(1)}%</span>
          </div>
        )
      })}
    </div>
  )
}

// Top Products bar list — unlike RankedBarList (which fills a fixed height edge-to-edge
// for a small, known row count), this shows the FULL SKU/sub-category/category list, so
// rows keep their natural height and the container scrolls once it exceeds the fixed
// height. Height is fixed (not maxHeight) so this card always matches Drastic Sales
// Change's height exactly, regardless of row count — short lists (e.g. Category level)
// just leave the box at its full fixed height with room to spare, rather than shrinking it.
// Bar width is scaled to the single largest value in the list (not the running total) so
// the #1 row always reads as a full bar. The %-of-total column is against total sales for
// the WHOLE period (grandTotal), not the sum of visible rows — so percentages don't
// silently re-normalize as you scroll.
function TopProductsBarList({ rows, metric, grandTotal, nameWidth = 140, isMobile = false }) {
  const maxVal = Math.max(1, ...rows.map(r => r[metric]))
  const ROW_HEIGHT = 25 // explicit fixed row height — no layout-dependent sizing.
  // This element only fills its parent (height: 100%) — the actual fixed pixel height is
  // owned solely by the outer wrapper div at the call site. Previously this element ALSO
  // had its own independent `height: 270px`, nested inside an outer 270px `overflow:hidden`
  // wrapper — two separately-set fixed heights that could drift apart by a subpixel under
  // real (non-synthetic) scroll/layout, leaving a blank gap below the last visible row.
  // When rows are few enough to fit without scrolling (e.g. Category level, ~6-8 rows),
  // stretch them to fill the box edge-to-edge instead of leaving blank space below the
  // last row — same fill-vs-scroll split used for Category Revenue/Geography on the Sales tab.
  return (
    <div style={{ height: '100%', flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {rows.map((r, i) => {
        const val = r[metric]
        const pctOfTotal = grandTotal > 0 ? (val / grandTotal) * 100 : 0
        return (
          <div key={r.name} style={{ minHeight: ROW_HEIGHT, flex: '1 1 auto', boxSizing: 'border-box', display: 'grid', gridTemplateColumns: isMobile ? `${nameWidth}px 1fr 66px 52px` : `18px ${nameWidth}px 1fr 66px 52px`, alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < rows.length - 1 ? `1px solid ${IC.border}` : 'none' }}>
            {!isMobile && <span style={{ fontSize: 10.5, color: IC.t3 }}>{i + 1}</span>}
            <span title={r.name} style={{ fontSize: 11.5, color: IC.t1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            <div style={{ height: 10, borderRadius: 4, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              <div style={{ width: `${(val / maxVal) * 100}%`, height: '100%', background: IC.acc, borderRadius: 4 }} />
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: IC.t1, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {metric === 'rev' ? fmtCurrency(val) : fmtInt(val)}
            </span>
            <span style={{ fontSize: 10.5, color: IC.t3, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pctOfTotal.toFixed(1)}%</span>
          </div>
        )
      })}
    </div>
  )
}

// Location-Wise Sales vs Allocation — clustered (grouped) bars per warehouse: a Sales bar
// (demand from states whose nearest-WH region is this location) and an Allocation bar
// (units actually shipped from facilities mapped to this location) sit one above the other
// within each location's row, both scaled against the same shared max across the whole
// list so they're directly comparable location-to-location. Allocation% = allocation ÷
// sales — over 100% means the WH ships more than its own region demands (absorbing other
// regions' orders too); under 100% means it's under-serving even its own region. Same
// fixed-height/fill-edge-to-edge treatment and font sizing as RankedBarList.
function LocationClusteredBarList({ rows, height, nameWidth = 90 }) {
  const maxVal = Math.max(1, ...rows.flatMap(r => [r.sales, r.allocation]))
  const totalAllocation = rows.reduce((s, r) => s + r.allocation, 0)
  return (
    <div style={{ display: 'grid', gridTemplateRows: `repeat(${rows.length}, 1fr)`, height, flexShrink: 0, overflow: 'hidden' }}>
      {rows.map(r => {
        const pct = r.sales > 0 ? r.allocation / r.sales : null
        const pctColor = pct == null ? IC.t3 : pct < 0.7 ? IC.status.Critical.c : pct < 0.9 ? IC.status.Low.c : IC.positive
        const pctOfTotal = totalAllocation > 0 ? (r.allocation / totalAllocation) * 100 : 0
        return (
          <div key={r.location} style={{ display: 'grid', gridTemplateColumns: `${nameWidth}px 1fr 90px 56px`, alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: IC.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.location}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center' }}>
              <div style={{ height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <div style={{ width: `${(r.sales / maxVal) * 100}%`, height: '100%', background: IC.acc, borderRadius: 3 }} />
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <div style={{ width: `${(r.allocation / maxVal) * 100}%`, height: '100%', background: IC.categorical[0], borderRadius: 3 }} />
              </div>
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: IC.t1, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtInt(r.sales)} / {fmtInt(r.allocation)}</span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: IC.t3, textAlign: 'right' }}>{pctOfTotal.toFixed(1)}%</span>
          </div>
        )
      })}
    </div>
  )
}

// Generic risers/fallers table for the Drastic Sales Change explorer — one row shape
// works across all 3 levels since the API already labels each row with the right fields
// (sku+category+subCategory, or subCategory+category, or just category). No sub-label
// under the name — level is already stated in the toggle above, so it'd just repeat.
function DrasticMoversTable({ rows, metric, level }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {rows.length === 0 && <div style={{ fontSize: 12, color: IC.t3, padding: '4px 0' }}>No data for this comparison.</div>}
      {rows.map((r, i) => {
        const label = level === 'sku' ? r.sku : level === 'subCategory' ? r.subCategory : r.category
        const up = r.pctChange >= 0
        return (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '16px 1fr 60px 60px 68px', alignItems: 'center', gap: 8, padding: '3.5px 0',
            borderBottom: i < rows.length - 1 ? `1px solid ${IC.border}` : 'none',
          }}>
            <span style={{ fontSize: 10.5, color: IC.t3 }}>{i + 1}</span>
            <span title={label} style={{ fontSize: 11.5, color: IC.t1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
            <span style={{ fontSize: 10.5, color: IC.t3, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {metric === 'rev' ? fmtCurrency(r.compareVal) : fmtInt(r.compareVal)}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: IC.t1, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {metric === 'rev' ? fmtCurrency(r.lastVal) : fmtInt(r.lastVal)}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: up ? IC.positive : IC.status.Critical.c, textAlign: 'right' }}>
              {up ? '▲' : '▼'} {Math.abs(r.pctChange).toFixed(0)}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function SalesAllocationPage({ data, filters, setFilters, sidebarTop }) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const [trendGranularity, setTrendGranularity] = useState('daily') // 'daily' | 'weekly' | 'monthly'
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [channelMetric, setChannelMetric] = useState('rev') // 'rev' | 'qty' — Channel-Wise Sales bar list
  const [categoryMetric, setCategoryMetric] = useState('rev') // 'rev' | 'qty' — Category Contribution bar list, independent of channelMetric
  const [drasticLevel, setDrasticLevel] = useState('subCategory') // 'sku' | 'subCategory' | 'category'
  const [drasticMode, setDrasticMode] = useState('day2') // 'day2' | 'day7'
  const [drasticMetric, setDrasticMetric] = useState('qty') // 'qty' | 'rev'
  const [drasticDirection, setDrasticDirection] = useState('risers') // 'risers' | 'fallers'
  const [matrixMetric, setMatrixMetric] = useState('qty') // 'qty' | 'rev'
  const [matrixGranularity, setMatrixGranularity] = useState('date') // 'date' | 'week' | 'month' | 'quarter' | 'year'
  const [matrixExpanded, setMatrixExpanded] = useState(new Set()) // expanded row paths ("cat" or "cat|sub")
  const [matrixSearch, setMatrixSearch] = useState('')
  const [matrixSort, setMatrixSort] = useState({ key: 'total', dir: 'desc' }) // key: 'total' | a bucketKey | 'name'
  const [top20Metric, setTop20Metric] = useState('rev') // 'qty' | 'rev' — Top Products list, beside Drastic Sales Change
  const [top20Level, setTop20Level] = useState('subCategory') // 'sku' | 'subCategory' | 'category'

  // Client-side filter: when static file has rawRows, filter instantly without API call
  const filteredData = useMemo(() => {
    if (!data?.rawRows) return data
    const hasFilter = (arr) => arr?.length > 0
    const anyActive = hasFilter(filters.category) || hasFilter(filters.subCategory) ||
      hasFilter(filters.sku) || hasFilter(filters.channel) || hasFilter(filters.salesType) ||
      hasFilter(filters.facility) || hasFilter(filters.region)
    if (!anyActive) return data

    const rows = data.rawRows.filter(r => {
      if (hasFilter(filters.category) && !filters.category.includes(r.category)) return false
      if (hasFilter(filters.subCategory) && !filters.subCategory.includes(r.subCategory)) return false
      if (hasFilter(filters.sku) && !filters.sku.includes(r.sku)) return false
      if (hasFilter(filters.channel) && !filters.channel.includes(r.channel) && !filters.channel.includes(r.channel2)) return false
      if (hasFilter(filters.salesType) && !filters.salesType.includes(r.salesType)) return false
      if (hasFilter(filters.facility) && !filters.facility.includes(r.facility)) return false
      if (hasFilter(filters.region) && !filters.region.includes(r.region)) return false
      return true
    })

    // Re-aggregate from filtered rows
    const dailyMap = new Map()
    const catMap = new Map()
    const subCatMap = new Map()
    const chMap = new Map()
    const ch2Map = new Map()
    const typeMap = new Map()
    const skuMap2 = new Map()
    const whDemand = new Map(), whCorrect = new Map()
    const facMap = new Map(), facRevMap = new Map()
    let totalQty = 0, totalRev = 0

    for (const r of rows) {
      totalQty += r.qty; totalRev += r.rev
      // daily
      if (!dailyMap.has(r.date)) dailyMap.set(r.date, { date: r.date, qty: 0, rev: 0 })
      const d = dailyMap.get(r.date); d.qty += r.qty; d.rev += r.rev
      // category
      if (!catMap.has(r.category)) catMap.set(r.category, { category: r.category, qty: 0, rev: 0 })
      const c = catMap.get(r.category); c.qty += r.qty; c.rev += r.rev
      // subCategory
      const sk = `${r.category}|${r.subCategory}`
      if (!subCatMap.has(sk)) subCatMap.set(sk, { category: r.category, subCategory: r.subCategory, qty: 0, rev: 0 })
      const sc = subCatMap.get(sk); sc.qty += r.qty; sc.rev += r.rev
      // channel
      if (!chMap.has(r.channel)) chMap.set(r.channel, { channel: r.channel, qty: 0, rev: 0 })
      const ch = chMap.get(r.channel); ch.qty += r.qty; ch.rev += r.rev
      // channel2
      if (!ch2Map.has(r.channel2)) ch2Map.set(r.channel2, { channel: r.channel2, qty: 0, rev: 0 })
      const c2 = ch2Map.get(r.channel2); c2.qty += r.qty; c2.rev += r.rev
      // salesType
      if (!typeMap.has(r.salesType)) typeMap.set(r.salesType, { type: r.salesType, qty: 0, rev: 0 })
      const ct = typeMap.get(r.salesType); ct.qty += r.qty; ct.rev += r.rev
      // sku
      if (!skuMap2.has(r.sku)) skuMap2.set(r.sku, { sku: r.sku, category: r.category, subCategory: r.subCategory, qty: 0, rev: 0 })
      const s = skuMap2.get(r.sku); s.qty += r.qty; s.rev += r.rev
      // fillRate
      if (r.nearestWH) {
        whDemand.set(r.nearestWH, (whDemand.get(r.nearestWH) || 0) + r.qty)
        if (r.location === r.nearestWH) whCorrect.set(r.nearestWH, (whCorrect.get(r.nearestWH) || 0) + r.qty)
      }
      // facility allocation
      if (r.location && r.location !== 'Unmapped') {
        facMap.set(r.location, (facMap.get(r.location) || 0) + r.qty)
        facRevMap.set(r.location, (facRevMap.get(r.location) || 0) + r.rev)
      }
    }

    const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date))
    const days = daily.length || 1
    const exactTotal = rows.reduce((s, r) => s + r.qty, 0)
    const exactCorrect = rows.filter(r => r.nearestWH && r.location === r.nearestWH).reduce((s, r) => s + r.qty, 0)

    // weekly/monthly rollup
    const weekKey = d => { const dt = new Date(d + 'T00:00:00Z'); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day); return dt.toISOString().slice(0, 10) }
    const rollup = (keyFn) => {
      const m = new Map()
      for (const d of daily) {
        const k = keyFn(d.date)
        if (!m.has(k)) m.set(k, { date: k, qty: 0, rev: 0 })
        const a = m.get(k); a.qty += d.qty; a.rev += d.rev
      }
      return [...m.values()].sort((a, b) => a.date.localeCompare(b.date))
    }

    const fillRateByWarehouse = [...whDemand.entries()].map(([wh, demand]) => {
      const correct = whCorrect.get(wh) || 0
      return { warehouse: wh, demandQty: Math.round(demand), demandQtyPerDay: Math.round(demand / days), correctQty: Math.round(correct), correctQtyPerDay: Math.round(correct / days), fillRate: demand > 0 ? correct / demand : null }
    })

    const facilityAllocation = [...facMap.entries()].map(([location, qty]) => {
      const rev = facRevMap.get(location) || 0
      const demand = [...whDemand.entries()].find(([wh]) => wh === location)?.[1] || 0
      return { location, qty: Math.round(qty), qtyPerDay: Math.round(qty / days), rev: Math.round(rev), revPerDay: Math.round(rev / days), asp: qty > 0 ? Math.round(rev / qty) : null, sharePct: totalQty > 0 ? qty / totalQty : null, allocationPct: demand > 0 ? Math.min(1, qty / demand) : null, skuCount: 0, region: null }
    })

    // Re-derive Product-Wise Sales Matrix from filtered rows
    const MSEP = '\x1f'
    const matrixCells = new Map()
    const matrixDatesSet = new Set()
    const matrixSkuMetaMap = new Map()
    for (const r of rows) {
      matrixDatesSet.add(r.date)
      if (!matrixSkuMetaMap.has(r.sku)) matrixSkuMetaMap.set(r.sku, { sku: r.sku, category: r.category, subCategory: r.subCategory })
      const addCell = (cat, sub, skuKey) => {
        const cellKey = `${cat}${MSEP}${sub}${MSEP}${skuKey}${MSEP}${r.date}`
        if (!matrixCells.has(cellKey)) matrixCells.set(cellKey, { qty: 0, rev: 0 })
        const c = matrixCells.get(cellKey); c.qty += r.qty; c.rev += r.rev
      }
      addCell(r.category, '', '')
      addCell(r.category, r.subCategory, '')
      addCell(r.category, r.subCategory, r.sku)
    }
    const matrixCellRows = [...matrixCells.entries()].map(([k, v]) => {
      const [cat, sub, skuKey, date] = k.split(MSEP)
      return { path: `${cat}${MSEP}${sub}${MSEP}${skuKey}`, date, qty: Math.round(v.qty), rev: Math.round(v.rev) }
    })
    const matrixSkuList = [...matrixSkuMetaMap.entries()].map(([key, meta]) => ({ skuKey: key, ...meta }))
    const matrixDates = [...matrixDatesSet].sort()

    return {
      ...data,
      rawRows: data.rawRows,
      summary: {
        ...data.summary,
        totalUnits: Math.round(totalQty),
        totalRevenue: Math.round(totalRev),
        avgDailyRevenue: Math.round(totalRev / days),
        avgDailyUnits: Math.round(totalQty / days),
        avgSellingPrice: totalQty > 0 ? Math.round(totalRev / totalQty) : 0,
        exactFillRate: exactTotal > 0 ? exactCorrect / exactTotal : null,
      },
      daily,
      weekly: rollup(weekKey),
      monthly: rollup(d => d.slice(0, 7)),
      categorySales: [...catMap.values()].sort((a, b) => b.rev - a.rev),
      subCategorySales: [...subCatMap.values()].sort((a, b) => b.rev - a.rev),
      channelSales: [...chMap.values()].sort((a, b) => b.rev - a.rev),
      channelSales2: [...ch2Map.values()].sort((a, b) => b.rev - a.rev),
      channelTypeSales: [...typeMap.values()].sort((a, b) => b.rev - a.rev),
      productSales: [...skuMap2.values()].sort((a, b) => b.rev - a.rev),
      fillRateByWarehouse,
      facilityAllocation,
      matrixCellRows,
      matrixSkuList,
      matrixDates,
    }
  }, [data, filters.category, filters.subCategory, filters.sku, filters.channel, filters.salesType, filters.facility, filters.region])

  const dailyChart = useMemo(() => {
    if (!filteredData) return []
    const series = filteredData[trendGranularity] || filteredData.daily
    return series.map(d => {
      const label = trendGranularity === 'monthly' ? d.date : d.date.slice(5)
      return { date: label, qty: d.qty, rev: d.rev, asp: d.qty > 0 ? Math.round(d.rev / d.qty) : null }
    })
  }, [data, trendGranularity])

  const categoryRollup = useMemo(() => {
    if (!filteredData) return []
    return filteredData.categorySales.slice(0, 12).map(c => ({ name: c.category, qty: c.qty, rev: c.rev }))
  }, [filteredData])

  // Ranked by whichever metric is active — a single-series bar list reads share/rank far
  // more clearly than a donut's angle comparisons, especially past ~6 slices.
  const categoryDonutSorted = useMemo(() => {
    return [...categoryRollup].map(c => ({ name: c.name, value: c[categoryMetric] })).sort((a, b) => b.value - a.value)
  }, [categoryRollup, categoryMetric])
  const categoryDonutTotal = useMemo(() => categoryDonutSorted.reduce((s, c) => s + c.value, 0), [categoryDonutSorted])

  // Channel-wise sales (unified_channel2 grouping — B2C/B2B/Purchase-Order only, coarser
  // than the Channel-Wise Sales table further down which uses unified_channel).
  const channelDonutSorted = useMemo(() => {
    if (!filteredData) return []
    return [...filteredData.channelSales2].map(c => ({ name: c.channel, value: c[channelMetric] })).sort((a, b) => b.value - a.value)
  }, [filteredData, channelMetric])
  const channelDonutTotal = useMemo(() => channelDonutSorted.reduce((s, c) => s + c.value, 0), [channelDonutSorted])

  // Location-Wise Sales vs Allocation — Sales = demand from the STATE side: units ordered
  // by states whose nearest-WH region is this location (fillRateByWarehouse.demandQty,
  // same number backing the Fill Rate KPI). Allocation = supply from the FACILITY side:
  // units actually shipped from facilities mapped to this location (facilityAllocation.qty).
  // Same location order both come from (sortByLocationOrder, applied server-side already).
  const locationStackedRows = useMemo(() => {
    if (!filteredData) return []
    const demandByLoc = new Map(filteredData.fillRateByWarehouse.map(w => [w.warehouse, w.demandQty]))
    return filteredData.facilityAllocation.map(f => ({ location: f.location, sales: demandByLoc.get(f.location) || 0, allocation: f.qty }))
  }, [filteredData])

  // Product-Wise Sales Matrix — server sends day-granularity cells only; week/month/
  // quarter/year are re-bucketed here so switching granularity is instant, no refetch.
  // MSEP must match the server's cell-key delimiter (api/sales-allocation.js) — category/
  // sub-category names can contain a literal "|" (real data has e.g. "FSS101 | Everyday
  // Foldable Wheelchair"), which corrupted plain |-joined paths and crashed date parsing
  // downstream when the shifted "date" field wasn't a real date.
  const matrixBucketKeyFor = (granularity, dateStr) => {
    if (granularity === 'date') return dateStr
    const d = new Date(dateStr + 'T00:00:00Z')
    if (granularity === 'week') {
      const day = (d.getUTCDay() + 6) % 7
      d.setUTCDate(d.getUTCDate() - day)
      return d.toISOString().slice(0, 10)
    }
    if (granularity === 'month') return dateStr.slice(0, 7)
    if (granularity === 'quarter') { const [y, m] = dateStr.split('-'); return `${y}-Q${Math.ceil(Number(m) / 3)}` }
    return dateStr.slice(0, 4) // year
  }

  const matrixColumns = useMemo(() => {
    if (!filteredData) return []
    return [...new Set(filteredData.matrixDates.map(d => matrixBucketKeyFor(matrixGranularity, d)))].sort()
  }, [filteredData, matrixGranularity])

  // cellsByPath: "cat|sub|skuKey" -> Map(bucketKey -> {qty, rev}), re-bucketed from the raw
  // daily cells whenever granularity changes.
  const matrixCellsByPath = useMemo(() => {
    if (!filteredData) return new Map()
    const m = new Map()
    for (const c of filteredData.matrixCellRows) {
      const bucketKey = matrixBucketKeyFor(matrixGranularity, c.date)
      if (!m.has(c.path)) m.set(c.path, new Map())
      const perBucket = m.get(c.path)
      if (!perBucket.has(bucketKey)) perBucket.set(bucketKey, { qty: 0, rev: 0 })
      const cell = perBucket.get(bucketKey)
      cell.qty += c.qty
      cell.rev += c.rev
    }
    return m
  }, [filteredData, matrixGranularity])

  // Row total (sum across all visible bucket columns) per path — used for the Total column
  // and for "sort by Total".
  const matrixRowTotal = useMemo(() => {
    if (!filteredData) return new Map()
    const totals = new Map() // path -> {qty, rev}
    for (const [path, perBucket] of matrixCellsByPath) {
      let qty = 0, rev = 0
      for (const c of perBucket.values()) { qty += c.qty; rev += c.rev }
      totals.set(path, { qty, rev })
    }
    return totals
  }, [matrixCellsByPath])

  // Grand-total row: sum across ALL products for each bucket column, plus the overall total.
  const matrixGrandTotal = useMemo(() => {
    if (!filteredData) return { perBucket: new Map(), total: { qty: 0, rev: 0 } }
    const perBucket = new Map()
    let qty = 0, rev = 0
    for (const cat of filteredData.matrixSkuList.length ? [...new Set(filteredData.matrixSkuList.map(s => s.category))] : []) {
      const cells = matrixCellsByPath.get(`${cat}${MSEP}${MSEP}`)
      if (!cells) continue
      for (const [bucketKey, c] of cells) {
        if (!perBucket.has(bucketKey)) perBucket.set(bucketKey, { qty: 0, rev: 0 })
        const acc = perBucket.get(bucketKey)
        acc.qty += c.qty
        acc.rev += c.rev
        qty += c.qty
        rev += c.rev
      }
    }
    return { perBucket, total: { qty, rev } }
  }, [filteredData, matrixCellsByPath])

  // Sort comparator shared by all 3 levels — sorts by a specific bucket column, the Total
  // column, or the name itself. Metric (qty vs rev) follows the active matrixMetric toggle.
  const matrixValueFor = (path, key) => {
    if (key === 'total') return (matrixRowTotal.get(path) || { qty: 0, rev: 0 })[matrixMetric]
    const cell = matrixCellsByPath.get(path)?.get(key)
    return cell ? cell[matrixMetric] : 0
  }
  function sortMatrixItems(items, getPath, getName) {
    const { key, dir } = matrixSort
    const sign = dir === 'asc' ? 1 : -1
    return [...items].sort((a, b) => {
      if (key === 'name') return sign * getName(a).localeCompare(getName(b))
      return sign * (matrixValueFor(getPath(a), key) - matrixValueFor(getPath(b), key))
    })
  }
  const toggleMatrixSort = key => setMatrixSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))

  // Hierarchical row list: Category rows always shown; Sub-category rows shown only under
  // an expanded category; SKU rows shown only under an expanded sub-category. Each level is
  // sorted independently by the active matrixSort, so expanding a category re-sorts its
  // sub-categories the same way the top-level categories are sorted.
  const matrixCategoryTree = useMemo(() => {
    if (!filteredData) return []
    const q = matrixSearch.trim().toLowerCase()
    const cats = new Map() // category -> Map(subCategory -> Set(skuKey))
    for (const s of filteredData.matrixSkuList) {
      if (!cats.has(s.category)) cats.set(s.category, new Map())
      const subs = cats.get(s.category)
      if (!subs.has(s.subCategory)) subs.set(s.subCategory, [])
      subs.get(s.subCategory).push(s)
    }
    let tree = [...cats.entries()].map(([category, subs]) => ({
      category,
      subs: sortMatrixItems(
        [...subs.entries()].map(([subCategory, skus]) => ({
          subCategory,
          skus: sortMatrixItems(skus, s => `${category}${MSEP}${subCategory}${MSEP}${s.skuKey}`, s => s.sku),
        })),
        s => `${category}${MSEP}${s.subCategory}${MSEP}`, s => s.subCategory,
      ),
    }))
    if (q) {
      tree = tree
        .map(({ category, subs }) => {
          const catMatches = category.toLowerCase().includes(q)
          const filteredSubs = subs
            .map(({ subCategory, skus }) => {
              const subMatches = catMatches || subCategory.toLowerCase().includes(q)
              const filteredSkus = subMatches ? skus : skus.filter(s => s.sku.toLowerCase().includes(q))
              return filteredSkus.length ? { subCategory, skus: filteredSkus } : null
            })
            .filter(Boolean)
          return filteredSubs.length ? { category, subs: filteredSubs } : null
        })
        .filter(Boolean)
    }
    return sortMatrixItems(tree, c => `${c.category}${MSEP}${MSEP}`, c => c.category)
  }, [filteredData, matrixSort, matrixMetric, matrixCellsByPath, matrixRowTotal, matrixSearch])

  // Auto-expand every category/sub-category row while searching so matches are visible
  // without the user needing to manually click into each branch.
  useEffect(() => {
    if (!matrixSearch.trim()) return
    setMatrixExpanded(() => {
      const next = new Set()
      for (const { category, subs } of matrixCategoryTree) {
        next.add(category)
        for (const { subCategory } of subs) next.add(`${category}${MSEP}${subCategory}`)
      }
      return next
    })
  }, [matrixCategoryTree, matrixSearch])

  const toggleMatrixExpanded = path => setMatrixExpanded(s => {
    const next = new Set(s)
    if (next.has(path)) next.delete(path); else next.add(path)
    return next
  })

  const drasticBucket = filteredData?.topMovers?.[drasticLevel]?.[drasticMode]?.[drasticMetric]
  const drasticRows = drasticBucket ? (drasticDirection === 'risers' ? drasticBucket.risers : drasticBucket.fallers) : []

  // Top Products — full leaderboard (no cap) for the selected range, sits beside Drastic
  // Sales Change. Level toggle picks which server-computed rollup to rank: SKU-level uses
  // productSales (name = sku), Sub-category/Category reuse the same rollups already powering
  // Category Contribution / the Matrix — re-sorted here so both metrics rank correctly.
  const topProductsSource = !filteredData ? [] : top20Level === 'sku' ? filteredData.productSales.map(r => ({ name: r.sku, qty: r.qty, rev: r.rev }))
    : top20Level === 'subCategory' ? filteredData.subCategorySales.map(r => ({ name: r.subCategory, qty: r.qty, rev: r.rev }))
    : filteredData.categorySales.map(r => ({ name: r.category, qty: r.qty, rev: r.rev }))
  const topProductsRows = [...topProductsSource].sort((a, b) => b[top20Metric] - a[top20Metric])

  if (!data) return null
  const revenueAvailable = filteredData.summary.totalRevenue > 0
  const salesTypeMix = (() => {
    const metricKey = revenueAvailable ? 'rev' : 'qty'
    const total = filteredData.channelTypeSales.reduce((s, t) => s + t[metricKey], 0)
    if (total <= 0) return null
    const pct = type => Math.round(((filteredData.channelTypeSales.find(t => t.type === type)?.[metricKey] || 0) / total) * 100)
    return { b2c: pct('B2C Order'), b2b: pct('B2B Order'), po: pct('Purchase Order') }
  })()

  // See InventoryHealthPage.jsx's collapse-toggle button for why this is position:fixed and
  // keyed off --sb instead of assuming flow-adjacency to the (also position:fixed) sidebar.
  return (
    <div style={{ display: 'flex', gap: 0 }}>
      <FilterSidebar data={data} filters={filters} setFilters={setFilters} open={sidebarOpen} onClose={() => setSidebarOpen(false)} isMobile={isMobile} sidebarTop={sidebarTop} />
      {/* Desktop collapse-toggle — hidden on mobile via CSS */}
      <button className="inv-filter-toggle" onClick={() => setSidebarOpen(o => !o)} style={{
        width: 16, height: 48, border: `1px solid ${IC.border}`, borderLeft: 'none',
        background: IC.surface, cursor: 'pointer', borderRadius: '0 8px 8px 0', display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: IC.t3, fontSize: 12, flexShrink: 0,
        position: 'fixed', top: 'calc(var(--nav) + 4px)',
        left: sidebarOpen ? `calc(var(--sb) + ${SIDEBAR_WIDTH}px)` : 'var(--sb)',
        zIndex: 30, transition: 'left .2s ease',
      }}>
        {sidebarOpen ? '‹' : '›'}
      </button>

      {/* +16 accounts for the collapse-toggle button's own width (position:fixed, out of flow). */}
      <div className="inv-main-content" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18, paddingLeft: 32, paddingRight: 24, paddingTop: 16 }}>

        {/* Mobile filter button */}
        <button className="inv-filter-mobile-btn" onClick={() => setSidebarOpen(true)} style={{
          display: 'none', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
          background: IC.surface, border: `1px solid ${IC.border2}`, color: IC.t2, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start',
        }}>
          ☰ Filters{filters && ['category', 'subCategory', 'sku', 'channel', 'salesType', 'facility', 'region'].some(k => filters[k]?.length) ? ' •' : ''}
        </button>

        {/* KPI row */}
        <SaKpiCarousel>
          <KpiTile compact label="Revenue" value={revenueAvailable ? fmtCurrency(filteredData.summary.totalRevenue) : '—'}
            sub={revenueAvailable ? `Avg ${fmtCurrency(filteredData.summary.avgDailyRevenue)}/day` : 'Pending pipeline sync for recent dates'} icon="/sa-icon-revenue.jpg" />
          <KpiTile compact label="Units Sold" value={fmtNum(filteredData.summary.totalUnits)} unit="units"
            sub={`Avg ${fmtNum(filteredData.summary.avgDailyUnits)}/day`} icon="/sa-icon-units.png" />
          <KpiTile compact label="Avg Selling Price" value={revenueAvailable ? fmtCurrency(filteredData.summary.avgSellingPrice) : '—'} icon="/sa-icon-asp.png" />
          <KpiTile compact label="Fill Rate" value={filteredData.summary.exactFillRate != null ? `${Math.round(filteredData.summary.exactFillRate * 100)}%` : '—'} sub="nearest-WH-correct units ÷ total units" accent={filteredData.summary.exactFillRate >= 0.9 ? IC.positive : IC.status.Low.c} icon="/sa-icon-fillrate.png" />
          <KpiTile compact label="Momentum" value={filteredData.summary.momentumPct != null ? `${filteredData.summary.momentumPct > 0 ? '+' : ''}${filteredData.summary.momentumPct.toFixed(0)}%` : '—'} sub="first vs last day" accent={filteredData.summary.momentumPct >= 0 ? IC.positive : IC.status.Critical.c} icon="/sa-icon-momentum.png" />
          <KpiTile compact label="Sales Type Mix" value={salesTypeMix ? `${salesTypeMix.b2c}% B2C` : '—'}
            sub={salesTypeMix ? `${salesTypeMix.b2b}% B2B · ${salesTypeMix.po}% PO` : 'No sales in range'} icon="/sa-icon-salesmix.png" />
        </SaKpiCarousel>
        {filteredData.previousPeriod && (
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: IC.t3, marginTop: -6 }}>
            <span>Revenue vs previous period: <ChangeBadge pct={filteredData.previousPeriod.revenueChangePct} /></span>
            <span>Units vs previous period: <ChangeBadge pct={filteredData.previousPeriod.unitsChangePct} /></span>
          </div>
        )}

        {/* Sales trend */}
        <GlassCard title={isMobile ? <span style={{ marginLeft: 8 }}>Sales Trend</span> : "Sales Trend"} note={isMobile ? null : `${trendGranularity} units & revenue`}
          style={isMobile ? { paddingLeft: 6, paddingRight: 6 } : undefined}
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isMobile ? (
                <div style={{ display: 'flex', gap: 4 }}>
                  {[{ k: 'daily', label: 'D' }, { k: 'weekly', label: 'W' }, { k: 'monthly', label: 'M' }].map(g => (
                    <button key={g.k} onClick={() => setTrendGranularity(g.k)}
                      style={{ fontSize: 11, padding: '4px 8px', borderRadius: 7, cursor: 'pointer', background: trendGranularity === g.k ? IC.accDim : IC.surface, color: trendGranularity === g.k ? IC.t1 : IC.t3, border: `1px solid ${trendGranularity === g.k ? IC.accBorder : IC.border}` }}>
                      {g.label}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[{ k: 'daily', label: 'Daily' }, { k: 'weekly', label: 'Weekly' }, { k: 'monthly', label: 'Monthly' }].map(g => (
                      <button key={g.k} onClick={() => setTrendGranularity(g.k)}
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, cursor: 'pointer', background: trendGranularity === g.k ? IC.accDim : IC.surface, color: trendGranularity === g.k ? IC.t1 : IC.t3, border: `1px solid ${trendGranularity === g.k ? IC.accBorder : IC.border}` }}>
                        {g.label}
                      </button>
                    ))}
                  </div>
                  <ExportButton filename="sales_trend.csv" rows={filteredData[trendGranularity]} columns={[{ label: 'Date', key: 'date' }, { label: 'Units', key: 'qty' }, { label: 'Revenue', key: 'rev' }]} />
                </>
              )}
            </div>
          }>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={dailyChart} margin={{ top: 4, right: isMobile ? 10 : 12, bottom: 0, left: isMobile ? 20 : 0 }}>
              <CartesianGrid stroke={IC.border} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: IC.t3 }} axisLine={{ stroke: IC.border2 }} tickLine={false}
                {...(isMobile && dailyChart?.length ? {
                  ticks: [dailyChart[0].date, ...dailyChart.filter((_, i) => i > 0 && i < dailyChart.length - 1 && i % Math.ceil(dailyChart.length / 6) === 0).map(d => d.date), dailyChart[dailyChart.length - 1].date]
                } : {})} />
              <YAxis yAxisId="qty" tick={isMobile ? false : { fontSize: 10, fill: IC.t3 }} tickFormatter={fmtNum} axisLine={{ stroke: IC.border2 }} tickLine={false} width={isMobile ? 0 : 44} />
              {revenueAvailable && !isMobile && <YAxis yAxisId="rev" orientation="right" tick={{ fontSize: 10, fill: IC.t3 }} tickFormatter={fmtCurrency} axisLine={{ stroke: IC.border2 }} tickLine={false} width={56} />}
              <Tooltip content={<SalesTrendTip />} />
              <Area yAxisId="qty" type="monotone" dataKey="qty" name="Units Sold" fill="rgba(255,214,0,0.14)" stroke={IC.acc} strokeWidth={2} />
              {revenueAvailable && <Line yAxisId="rev" type="monotone" dataKey="rev" name="Revenue" stroke={IC.categorical[0]} strokeWidth={2} dot={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* Location-wise sold vs allocation + channel-wise split + category-wise split —
            fixed, matched heights so no card's content area grows/shrinks with row count
            or toggle state. Same RankedBarList sizing/fonts across all three. */}
        <div className="inv-3col-row" style={{ display: 'grid', gridTemplateColumns: '0.85fr 0.85fr 1fr', gap: 14, alignItems: 'stretch' }}>
          <GlassCard title="Location-Wise Sales vs Allocation"
            style={{ display: 'flex', flexDirection: 'column' }}
            action={
              <div style={{ display: 'grid', gridTemplateColumns: `56px`, gap: 8 }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: IC.t3, textAlign: 'right', whiteSpace: 'nowrap' }}>% of total</span>
              </div>
            }>
            <LocationClusteredBarList rows={locationStackedRows} height={MOVERS_CARD_HEIGHT} />
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10.5, color: IC.t3, flexShrink: 0 }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, background: IC.acc, borderRadius: 2, marginRight: 5 }} />Sales (region demand)</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, background: IC.categorical[0], borderRadius: 2, marginRight: 5 }} />Allocation (shipped from here)</span>
            </div>
          </GlassCard>

          <GlassCard title="Channel-Wise Sales"
            style={{ display: 'flex', flexDirection: 'column' }}
            action={
              <div style={{ display: 'flex', gap: 4 }}>
                {[{ k: 'rev', label: 'Revenue' }, { k: 'qty', label: 'Units' }].map(m => (
                  <button key={m.k} disabled={m.k === 'rev' && !revenueAvailable} onClick={() => setChannelMetric(m.k)}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, cursor: m.k === 'rev' && !revenueAvailable ? 'not-allowed' : 'pointer', opacity: m.k === 'rev' && !revenueAvailable ? 0.4 : 1, background: channelMetric === m.k ? IC.accDim : IC.surface, color: channelMetric === m.k ? IC.t1 : IC.t3, border: `1px solid ${channelMetric === m.k ? IC.accBorder : IC.border}` }}>
                    {m.label}
                  </button>
                ))}
              </div>
            }>
            <RankedBarList rows={channelDonutSorted} total={channelDonutTotal} height={MOVERS_CARD_HEIGHT} metric={channelMetric} />
          </GlassCard>

          <GlassCard title="Category Contribution"
            style={{ display: 'flex', flexDirection: 'column' }}
            action={
              <div style={{ display: 'flex', gap: 4 }}>
                {[{ k: 'rev', label: 'Revenue' }, { k: 'qty', label: 'Units' }].map(m => (
                  <button key={m.k} disabled={m.k === 'rev' && !revenueAvailable} onClick={() => setCategoryMetric(m.k)}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, cursor: m.k === 'rev' && !revenueAvailable ? 'not-allowed' : 'pointer', opacity: m.k === 'rev' && !revenueAvailable ? 0.4 : 1, background: categoryMetric === m.k ? IC.accDim : IC.surface, color: categoryMetric === m.k ? IC.t1 : IC.t3, border: `1px solid ${categoryMetric === m.k ? IC.accBorder : IC.border}` }}>
                    {m.label}
                  </button>
                ))}
              </div>
            }>
            <RankedBarList rows={categoryDonutSorted} total={categoryDonutTotal} height={MOVERS_CARD_HEIGHT} metric={categoryMetric} />
          </GlassCard>
        </div>

        {/* Top Products (full ranked bar list, no cap) beside Drastic Sales Change — equal
            widths, equal TOTAL card height (MOVERS_TOTAL_HEIGHT). Each card's header/toolbar
            sizes to its own content (Drastic's toolbar has more toggle groups than Top
            Products' and can be taller) — the list below fills whatever space remains via
            flex:1/minHeight:0 and scrolls internally, so neither card grows past the fixed
            total height and neither list is forced to match the other's size. */}
        <div className="sa-movers-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
          <GlassCard title="Top Products"
            note={isMobile ? null : `${fmtInt(topProductsRows.length)} ${top20Level === 'sku' ? 'SKUs' : top20Level === 'subCategory' ? 'sub-cats' : 'categories'}`}
            style={{ display: 'flex', flexDirection: 'column', height: MOVERS_TOTAL_HEIGHT }}
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[{ k: 'sku', label: 'SKU' }, { k: 'subCategory', label: 'Sub-cat' }, { k: 'category', label: 'Category' }].map(l => (
                    <button key={l.k} onClick={() => setTop20Level(l.k)}
                      style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 6, cursor: 'pointer', background: top20Level === l.k ? IC.accDim : IC.surface, color: top20Level === l.k ? IC.t1 : IC.t3, border: `1px solid ${top20Level === l.k ? IC.accBorder : IC.border}` }}>
                      {l.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[{ k: 'rev', label: 'Revenue' }, { k: 'qty', label: 'Units' }].map(m => (
                    <button key={m.k} disabled={m.k === 'rev' && !revenueAvailable} onClick={() => setTop20Metric(m.k)}
                      style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 6, cursor: m.k === 'rev' && !revenueAvailable ? 'not-allowed' : 'pointer', opacity: m.k === 'rev' && !revenueAvailable ? 0.4 : 1, background: top20Metric === m.k ? IC.accDim : IC.surface, color: top20Metric === m.k ? IC.t1 : IC.t3, border: `1px solid ${top20Metric === m.k ? IC.accBorder : IC.border}` }}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            }>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <TopProductsBarList rows={topProductsRows} metric={top20Metric}
                grandTotal={top20Metric === 'rev' ? filteredData.summary.totalRevenue : filteredData.summary.totalUnits}
                nameWidth={top20Level === 'sku' ? (isMobile ? 130 : 150) : (isMobile ? 160 : 220)}
                isMobile={isMobile} />
            </div>
          </GlassCard>

          <GlassCard title="Drastic Sales Change" note={isMobile ? null : "biggest movers"}
            style={{ display: 'flex', flexDirection: 'column', height: MOVERS_TOTAL_HEIGHT }}
            action={isMobile
              ? <SearchableMultiSelect label="Channel" options={data.filterOptions.unifiedChannels2} selected={filters.drasticChannel || []} onChange={v => setFilters(f => ({ ...f, drasticChannel: v }))} width={110} height={25} />
              : <ExportButton filename="drastic_movers.csv" rows={drasticRows}
                  columns={[
                    { label: drasticLevel === 'sku' ? 'SKU' : drasticLevel === 'subCategory' ? 'Sub-category' : 'Category', key: drasticLevel === 'sku' ? 'sku' : drasticLevel === 'subCategory' ? 'subCategory' : 'category' },
                    { label: 'Category', key: 'category' }, { label: 'Last', key: 'lastVal' }, { label: 'Compare', key: 'compareVal' }, { label: '% Change', key: 'pctChange' },
                  ]} />
            }>
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {isMobile ? (
                <>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[{ k: 'sku', label: 'SKU' }, { k: 'subCategory', label: 'Sub-cat' }, { k: 'category', label: 'Category' }].map(l => (
                      <button key={l.k} onClick={() => setDrasticLevel(l.k)}
                        style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 6, cursor: 'pointer', background: drasticLevel === l.k ? IC.accDim : IC.surface, color: drasticLevel === l.k ? IC.t1 : IC.t3, border: `1px solid ${drasticLevel === l.k ? IC.accBorder : IC.border}` }}>
                        {l.label}
                      </button>
                    ))}
                    <div style={{ width: 1, background: IC.border, margin: '0 2px' }} />
                    {[{ k: 'risers', label: '▲ Risers' }, { k: 'fallers', label: '▼ Fallers' }].map(d => (
                      <button key={d.k} onClick={() => setDrasticDirection(d.k)}
                        style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 6, cursor: 'pointer', background: drasticDirection === d.k ? IC.accDim : IC.surface, color: drasticDirection === d.k ? (d.k === 'risers' ? IC.positive : IC.status.Critical.c) : IC.t3, border: `1px solid ${drasticDirection === d.k ? IC.accBorder : IC.border}` }}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[{ k: 'qty', label: 'Units' }, { k: 'rev', label: 'Revenue' }].map(m => (
                      <button key={m.k} disabled={m.k === 'rev' && !revenueAvailable} onClick={() => setDrasticMetric(m.k)}
                        style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 6, cursor: m.k === 'rev' && !revenueAvailable ? 'not-allowed' : 'pointer', opacity: m.k === 'rev' && !revenueAvailable ? 0.4 : 1, background: drasticMetric === m.k ? IC.accDim : IC.surface, color: drasticMetric === m.k ? IC.t1 : IC.t3, border: `1px solid ${drasticMetric === m.k ? IC.accBorder : IC.border}` }}>
                        {m.label}
                      </button>
                    ))}
                    <div style={{ width: 1, background: IC.border, margin: '0 2px' }} />
                    {[{ k: 'day2', label: 'Last vs 2nd' }, { k: 'day7', label: 'Last vs 7th' }].map(m => (
                      <button key={m.k} onClick={() => setDrasticMode(m.k)}
                        style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 6, cursor: 'pointer', background: drasticMode === m.k ? IC.accDim : IC.surface, color: drasticMode === m.k ? IC.t1 : IC.t3, border: `1px solid ${drasticMode === m.k ? IC.accBorder : IC.border}`, whiteSpace: 'nowrap' }}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {[{ k: 'sku', label: 'SKU' }, { k: 'subCategory', label: 'Sub-category' }, { k: 'category', label: 'Category' }].map(l => (
                  <button key={l.k} onClick={() => setDrasticLevel(l.k)}
                    style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 6, cursor: 'pointer', background: drasticLevel === l.k ? IC.accDim : IC.surface, color: drasticLevel === l.k ? IC.t1 : IC.t3, border: `1px solid ${drasticLevel === l.k ? IC.accBorder : IC.border}` }}>
                    {l.label}
                  </button>
                ))}
                <div style={{ width: 1, background: IC.border, margin: '0 2px' }} />
                {[{ k: 'risers', label: '▲ Risers' }, { k: 'fallers', label: '▼ Fallers' }].map(d => (
                  <button key={d.k} onClick={() => setDrasticDirection(d.k)}
                    style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 6, cursor: 'pointer', background: drasticDirection === d.k ? IC.accDim : IC.surface, color: drasticDirection === d.k ? (d.k === 'risers' ? IC.positive : IC.status.Critical.c) : IC.t3, border: `1px solid ${drasticDirection === d.k ? IC.accBorder : IC.border}` }}>
                    {d.label}
                  </button>
                ))}
                <div style={{ width: 1, background: IC.border, margin: '0 2px' }} />
                {[{ k: 'qty', label: 'Units' }, { k: 'rev', label: 'Revenue' }].map(m => (
                  <button key={m.k} disabled={m.k === 'rev' && !revenueAvailable} onClick={() => setDrasticMetric(m.k)}
                    style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 6, cursor: m.k === 'rev' && !revenueAvailable ? 'not-allowed' : 'pointer', opacity: m.k === 'rev' && !revenueAvailable ? 0.4 : 1, background: drasticMetric === m.k ? IC.accDim : IC.surface, color: drasticMetric === m.k ? IC.t1 : IC.t3, border: `1px solid ${drasticMetric === m.k ? IC.accBorder : IC.border}` }}>
                    {m.label}
                  </button>
                ))}
                <div style={{ width: 1, background: IC.border, margin: '0 2px' }} />
                <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                  {[{ k: 'day2', label: 'Last vs 2nd-last day' }, { k: 'day7', label: 'Last vs 7th-last day' }].map(m => (
                    <button key={m.k} onClick={() => setDrasticMode(m.k)}
                      style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 6, cursor: 'pointer', background: drasticMode === m.k ? IC.accDim : IC.surface, color: drasticMode === m.k ? IC.t1 : IC.t3, border: `1px solid ${drasticMode === m.k ? IC.accBorder : IC.border}`, whiteSpace: 'nowrap' }}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <div style={{ width: 1, background: IC.border, margin: '0 2px' }} />
                <SearchableMultiSelect label="Channel" options={data.filterOptions.unifiedChannels2} selected={filters.drasticChannel || []} onChange={v => setFilters(f => ({ ...f, drasticChannel: v }))}
                  width={130} height={25} />
              </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {drasticRows.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '16px 1fr 60px 60px 68px', gap: 8, padding: '0 0 4px', borderBottom: `1px solid ${IC.border2}`, marginBottom: 2, flexShrink: 0 }}>
                  <span />
                  <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: IC.t3 }}>
                    {drasticLevel === 'sku' ? 'SKU' : drasticLevel === 'subCategory' ? 'Sub-category' : 'Category'}
                  </span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', color: IC.t3, textAlign: 'right' }}>Before</span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', color: IC.t3, textAlign: 'right' }}>Now</span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', color: IC.t3, textAlign: 'right' }}>Change</span>
                </div>
              )}
              <DrasticMoversTable rows={drasticRows} metric={drasticMetric} level={drasticLevel} />
            </div>
          </GlassCard>
        </div>

        {/* Product-Wise Sales Matrix — Category → Sub-category → SKU rows, time-bucketed
            columns. Own Channel filter, independent of the sidebar. */}
        <GlassCard title="Product-Wise Sales Matrix" note="click a row to expand — category → sub-category → SKU"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input type="text" value={matrixSearch} onChange={e => setMatrixSearch(e.target.value)}
                placeholder="Search category / sub-cat / SKU…"
                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, background: IC.surface, color: IC.t1, border: `1px solid ${IC.border}`, width: 190, height: SLICER_HEIGHT, boxSizing: 'border-box' }} />
              <SearchableMultiSelect label="Channel" options={data.filterOptions.unifiedChannels2} selected={filters.matrixChannel || []} onChange={v => setFilters(f => ({ ...f, matrixChannel: v }))}
                width={150} height={SLICER_HEIGHT} />
              <div style={{ display: 'flex', gap: 4 }}>
                {[{ k: 'qty', label: 'Units' }, { k: 'rev', label: 'Revenue' }].map(m => (
                  <button key={m.k} disabled={m.k === 'rev' && !revenueAvailable} onClick={() => setMatrixMetric(m.k)}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, cursor: m.k === 'rev' && !revenueAvailable ? 'not-allowed' : 'pointer', opacity: m.k === 'rev' && !revenueAvailable ? 0.4 : 1, background: matrixMetric === m.k ? IC.accDim : IC.surface, color: matrixMetric === m.k ? IC.t1 : IC.t3, border: `1px solid ${matrixMetric === m.k ? IC.accBorder : IC.border}` }}>
                    {m.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[{ k: 'date', label: 'Date' }, { k: 'week', label: 'Week' }, { k: 'month', label: 'Month' }].map(g => (
                  <button key={g.k} onClick={() => { setMatrixGranularity(g.k); setMatrixSort({ key: 'total', dir: 'desc' }) }}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, cursor: 'pointer', background: matrixGranularity === g.k ? IC.accDim : IC.surface, color: matrixGranularity === g.k ? IC.t1 : IC.t3, border: `1px solid ${matrixGranularity === g.k ? IC.accBorder : IC.border}` }}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          }>
          <div style={{ maxHeight: 480, overflow: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11.5, width: 'max-content', minWidth: '100%' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: IC.surfaceHi }}>
                <tr>
                  <th onClick={() => toggleMatrixSort('name')}
                    style={{ position: 'sticky', left: 0, zIndex: 4, background: IC.surfaceHi, textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: matrixSort.key === 'name' ? IC.t1 : IC.t3, padding: '6px 10px', borderBottom: `1px solid ${IC.border2}`, minWidth: 220, cursor: 'pointer', userSelect: 'none' }}>
                    Product{matrixSort.key === 'name' ? (matrixSort.dir === 'desc' ? ' ▼' : ' ▲') : ''}
                  </th>
                  {matrixColumns.map(col => (
                    <th key={col} onClick={() => toggleMatrixSort(col)}
                      style={{ textAlign: 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: matrixSort.key === col ? IC.t1 : IC.t3, padding: '6px 10px', borderBottom: `1px solid ${IC.border2}`, minWidth: 84, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                      {col}{matrixSort.key === col ? (matrixSort.dir === 'desc' ? ' ▼' : ' ▲') : ''}
                    </th>
                  ))}
                  <th onClick={() => toggleMatrixSort('total')}
                    style={{ textAlign: 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: matrixSort.key === 'total' ? IC.t1 : IC.t3, padding: '6px 10px', borderBottom: `1px solid ${IC.border2}`, minWidth: 90, cursor: 'pointer', userSelect: 'none', borderLeft: `1px solid ${IC.border2}` }}>
                    Total{matrixSort.key === 'total' ? (matrixSort.dir === 'desc' ? ' ▼' : ' ▲') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {matrixCategoryTree.map(({ category, subs }) => {
                  const catPath = `${category}${MSEP}${MSEP}`
                  const catOpen = matrixExpanded.has(category)
                  const catCells = matrixCellsByPath.get(catPath)
                  const catTotal = matrixRowTotal.get(catPath)
                  return (
                    <Fragment key={category}>
                      <tr onClick={() => toggleMatrixExpanded(category)} style={{ cursor: 'pointer', borderBottom: `1px solid ${IC.border}` }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ position: 'sticky', left: 0, background: IC.surface, padding: '6px 10px', fontWeight: 700, color: IC.t1 }}>
                          <span style={{ display: 'inline-block', transform: catOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', marginRight: 6, color: IC.t3, fontSize: 9 }}>›</span>
                          {category}
                        </td>
                        {matrixColumns.map(col => {
                          const v = catCells?.get(col)
                          return (
                            <td key={col} style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: IC.t1 }}>
                              {v ? (matrixMetric === 'rev' ? (revenueAvailable ? fmtCurrency(v.rev) : '—') : fmtInt(v.qty)) : '—'}
                            </td>
                          )
                        })}
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: IC.t1, borderLeft: `1px solid ${IC.border2}` }}>
                          {catTotal ? (matrixMetric === 'rev' ? (revenueAvailable ? fmtCurrency(catTotal.rev) : '—') : fmtInt(catTotal.qty)) : '—'}
                        </td>
                      </tr>
                      {catOpen && subs.map(({ subCategory, skus }) => {
                        const subPath = `${category}${MSEP}${subCategory}${MSEP}`
                        const subKeyFull = `${category}|${subCategory}`
                        const subOpen = matrixExpanded.has(subKeyFull)
                        const subCells = matrixCellsByPath.get(subPath)
                        const subTotal = matrixRowTotal.get(subPath)
                        return (
                          <Fragment key={subKeyFull}>
                            <tr onClick={() => toggleMatrixExpanded(subKeyFull)} style={{ cursor: 'pointer', borderBottom: `1px solid ${IC.border}` }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <td style={{ position: 'sticky', left: 0, background: IC.surface, padding: '6px 10px 6px 26px', color: IC.t2 }}>
                                <span style={{ display: 'inline-block', transform: subOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', marginRight: 6, color: IC.t3, fontSize: 9 }}>›</span>
                                {subCategory}
                              </td>
                              {matrixColumns.map(col => {
                                const v = subCells?.get(col)
                                return (
                                  <td key={col} style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: IC.t2 }}>
                                    {v ? (matrixMetric === 'rev' ? (revenueAvailable ? fmtCurrency(v.rev) : '—') : fmtInt(v.qty)) : '—'}
                                  </td>
                                )
                              })}
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: IC.t2, borderLeft: `1px solid ${IC.border2}` }}>
                                {subTotal ? (matrixMetric === 'rev' ? (revenueAvailable ? fmtCurrency(subTotal.rev) : '—') : fmtInt(subTotal.qty)) : '—'}
                              </td>
                            </tr>
                            {subOpen && skus.map(s => {
                              const skuPath = `${category}${MSEP}${subCategory}${MSEP}${s.skuKey}`
                              const skuCells = matrixCellsByPath.get(skuPath)
                              const skuTotal = matrixRowTotal.get(skuPath)
                              return (
                                <tr key={s.skuKey} style={{ borderBottom: `1px solid ${IC.border}` }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                  <td style={{ position: 'sticky', left: 0, background: IC.surface, padding: '5px 10px 5px 42px', color: IC.t3, fontSize: 11 }}>{s.sku}</td>
                                  {matrixColumns.map(col => {
                                    const v = skuCells?.get(col)
                                    return (
                                      <td key={col} style={{ padding: '5px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: IC.t3, fontSize: 11 }}>
                                        {v ? (matrixMetric === 'rev' ? (revenueAvailable ? fmtCurrency(v.rev) : '—') : fmtInt(v.qty)) : '—'}
                                      </td>
                                    )
                                  })}
                                  <td style={{ padding: '5px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: IC.t3, fontSize: 11, borderLeft: `1px solid ${IC.border2}` }}>
                                    {skuTotal ? (matrixMetric === 'rev' ? (revenueAvailable ? fmtCurrency(skuTotal.rev) : '—') : fmtInt(skuTotal.qty)) : '—'}
                                  </td>
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
              <tfoot>
                <tr style={{ position: 'sticky', bottom: 0, background: IC.surfaceHi, borderTop: `2px solid ${IC.border2}` }}>
                  <td style={{ position: 'sticky', left: 0, background: IC.surfaceHi, padding: '7px 10px', fontWeight: 700, color: IC.t1 }}>Grand Total</td>
                  {matrixColumns.map(col => {
                    const v = matrixGrandTotal.perBucket.get(col)
                    return (
                      <td key={col} style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: IC.t1 }}>
                        {v ? (matrixMetric === 'rev' ? (revenueAvailable ? fmtCurrency(v.rev) : '—') : fmtInt(v.qty)) : '—'}
                      </td>
                    )
                  })}
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: IC.t1, borderLeft: `1px solid ${IC.border2}` }}>
                    {matrixMetric === 'rev' ? (revenueAvailable ? fmtCurrency(matrixGrandTotal.total.rev) : '—') : fmtInt(matrixGrandTotal.total.qty)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
