import { useMemo, useState, useRef, useLayoutEffect } from 'react'
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar,
} from 'recharts'
import {
  IC, fmtNum, fmtInt, fmtDays, GlassCard, KpiTile, ChartTip, StatusChip, SearchableMultiSelect, SortableTh, ExportButton,
} from './theme.jsx'

const TABLE_SCROLL_HEIGHT = '52vh'
const SKU_TABLE_COLS = [
  { key: 'sku', label: 'Product ID', align: 'left', width: 150 },
  { key: 'category', label: 'Category', align: 'left', width: 110 },
  { key: 'subCategory', label: 'Sub-category', align: 'left', width: 150 },
  { key: 'qtyReceived', label: 'Received', align: 'right', width: 90 },
  { key: 'soldQty', label: 'Sold Qty', align: 'right', width: 90 },
  { key: 'qtyRejected', label: 'Rejected', align: 'right', width: 90 },
  { key: 'totalInvt', label: 'Current Invt', align: 'right', width: 100 },
  { key: 'avgSale', label: 'Avg Sale (B2C)', align: 'right', width: 110 },
  { key: 'doi', label: 'DOI', align: 'right', width: 70 },
  { key: 'stockStatus', label: 'Status', align: 'right', width: 110 },
]

const SLICER_HEIGHT = 32
const SIDEBAR_WIDTH = 220

// ── Left filter sidebar — same pattern as the other two tabs, for consistency ──
function FilterSidebar({ data, filters, setFilters, open, sidebarTop }) {
  const opts = data.filterOptions
  const set = (key, arr) => setFilters(f => ({ ...f, [key]: arr }))
  const anyActive = ['category', 'subCategory', 'sku', 'facility', 'vendor'].some(k => filters[k]?.length)

  // position: fixed, positioned using the app shell's own known top-bar height (--nav,
  // 52px in index.css) rather than a live getBoundingClientRect() measurement — measuring
  // the anchor's live position was unreliable across scroll timing / late-arriving
  // sidebarTop content (see SalesAllocationPage.jsx's FilterSidebar for the full writeup).
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
      // Matches the fixed inner panel's own background — without this, the app shell's grey
      // shows through where the anchor's own box sits before the fixed panel visually begins.
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
        <div style={{ fontSize: 10, fontWeight: 800, color: IC.t3, letterSpacing: '.06em', textTransform: 'uppercase' }}>Filters</div>
        <SearchableMultiSelect label="Category" options={opts.categories} selected={filters.category || []} onChange={v => set('category', v)}
          width={SIDEBAR_WIDTH - 24} height={SLICER_HEIGHT} />
        <SearchableMultiSelect label="Sub-category" options={opts.subCategories} selected={filters.subCategory || []} onChange={v => set('subCategory', v)}
          width={SIDEBAR_WIDTH - 24} height={SLICER_HEIGHT} />
        <SearchableMultiSelect label="Product ID" options={opts.skus} selected={filters.sku || []} onChange={v => set('sku', v)}
          width={SIDEBAR_WIDTH - 24} height={SLICER_HEIGHT} />
        <div style={{ height: 1, background: IC.border, margin: '2px 0' }} />
        <SearchableMultiSelect label="Facility" options={opts.facilities} selected={filters.facility || []} onChange={v => set('facility', v)}
          width={SIDEBAR_WIDTH - 24} height={SLICER_HEIGHT} />
        <SearchableMultiSelect label="Vendor" options={opts.vendors} selected={filters.vendor || []} onChange={v => set('vendor', v)}
          width={SIDEBAR_WIDTH - 24} height={SLICER_HEIGHT} />
        <div style={{ height: 1, background: IC.border, margin: '2px 0' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: IC.t2, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!filters.includeUnmapped} onChange={e => setFilters(f => ({ ...f, includeUnmapped: e.target.checked }))} />
          Include Unmapped SKUs
        </label>
        {anyActive && (
          <button onClick={() => setFilters({})} style={{ fontSize: 11, color: IC.t3, background: 'none', border: `1px solid ${IC.border}`, borderRadius: 6, padding: '5px 0', cursor: 'pointer' }}>
            ✕ Clear all
          </button>
        )}
      </div>
    </div>
  )
}

// ── Simple horizontal-bar breakdown row (category/vendor/facility tables share this) ──
function BreakdownBar({ label, sub, value, maxValue, rejected, color = IC.acc }) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 70px', alignItems: 'center', gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: IC.t1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: IC.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color }} />
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: IC.t1, fontVariantNumeric: 'tabular-nums' }}>{fmtInt(value)}</div>
        {rejected != null && rejected > 0 && <div style={{ fontSize: 10, color: IC.status.Critical.c }}>{fmtInt(rejected)} rejected</div>}
      </div>
    </div>
  )
}

export default function InwardPage({ data, filters, setFilters, sidebarTop }) {
  const [trendGranularity, setTrendGranularity] = useState('daily') // 'daily' | 'weekly' | 'monthly'
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [skuSearch, setSkuSearch] = useState('')
  const [skuSort, setSkuSort] = useState({ key: 'qtyReceived', dir: 'desc' })

  const trendChart = useMemo(() => {
    if (!data) return []
    const series = data[trendGranularity] || data.daily
    return series.map((d, i, arr) => {
      const windowStart = Math.max(0, i - 6)
      const windowArr = arr.slice(windowStart, i + 1)
      const rollingAvg = windowArr.reduce((s, x) => s + x.qtyReceived, 0) / windowArr.length
      const label = trendGranularity === 'monthly' ? d.date : d.date.slice(5)
      return { date: label, qtyReceived: d.qtyReceived, qtyRejected: d.qtyRejected, rollingAvg: Math.round(rollingAvg) }
    })
  }, [data, trendGranularity])

  const categoryChart = useMemo(() => {
    if (!data) return []
    return data.categoryBreakdown.slice(0, 12).map(c => ({ name: c.category, qtyReceived: c.qtyReceived }))
  }, [data])

  const skuTableRows = useMemo(() => {
    if (!data) return []
    let rows = data.skuTable
    if (skuSearch.trim()) {
      const q = skuSearch.trim().toLowerCase()
      rows = rows.filter(r => r.sku.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) || r.subCategory.toLowerCase().includes(q))
    }
    const { key, dir } = skuSort
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
  }, [data, skuSearch, skuSort])

  const onSkuSort = key => setSkuSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))

  if (!data) return null

  const maxVendorQty = Math.max(1, ...data.vendorPerformance.map(v => v.qtyReceived))
  const maxSubCatQty = Math.max(1, ...data.subCategoryBreakdown.map(sc => sc.qtyReceived))
  const maxReasonQty = Math.max(1, ...data.rejectionReasons.map(r => r.qty))

  return (
    <div style={{ display: 'flex', gap: 0 }}>
      <FilterSidebar data={data} filters={filters} setFilters={setFilters} open={sidebarOpen} sidebarTop={sidebarTop} />
      <button onClick={() => setSidebarOpen(o => !o)} style={{
        width: 16, alignSelf: 'flex-start', marginTop: 4, height: 48, border: `1px solid ${IC.border}`, borderLeft: 'none',
        background: IC.surface, cursor: 'pointer', borderRadius: '0 8px 8px 0', display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: IC.t3, fontSize: 12, flexShrink: 0, position: 'sticky', top: 4,
      }}>
        {sidebarOpen ? '‹' : '›'}
      </button>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18, paddingLeft: 16, paddingRight: 24 }}>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <KpiTile label="Total Inward Qty" value={fmtNum(data.summary.totalReceived)} unit="units" icon="📥" />
          <KpiTile label="Total Sold Qty" value={fmtNum(data.summary.totalSoldQty)} unit="units" sub="same period" icon="🛒" />
          <KpiTile label="Inward Coverage Ratio" value={data.summary.inwardCoverageRatio != null ? `${data.summary.inwardCoverageRatio.toFixed(2)}×` : '—'}
            sub="inward ÷ sold" accent={data.summary.inwardCoverageRatio != null && data.summary.inwardCoverageRatio < 1 ? IC.status.Critical.c : IC.positive} icon="⚖" />
          <KpiTile label="Units Rejected" value={fmtNum(data.summary.totalRejected)} unit="units" sub={`${data.summary.rejectionPct.toFixed(1)}% rejection rate`}
            accent={data.summary.rejectionPct > 5 ? IC.status.Critical.c : IC.positive} icon="⛔" />
          <KpiTile label="Vendors" value={fmtNum(data.summary.distinctVendors)} icon="🏭" />
          <KpiTile label="SKUs" value={fmtNum(data.summary.distinctSkus)} icon="🏷" />
        </div>

        {/* SKU-level inward detail — received/rejected for this period, plus current
            inventory and trailing Avg Sale/DOI so it reads as "is this matched by demand." */}
        <GlassCard
          title="Inward Detail"
          note={`${fmtInt(skuTableRows.length)} of ${fmtInt(data.skuTable.length)} SKUs — Avg Sale/DOI as of ${data.avgSaleWindow?.end ? new Date(data.avgSaleWindow.end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}`}
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input placeholder="Quick search…" value={skuSearch} onChange={e => setSkuSearch(e.target.value)}
                style={{ background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 8, padding: '6px 10px', color: IC.t1, fontSize: 12, width: 170 }} />
              <ExportButton filename="inward_detail.csv" rows={skuTableRows}
                columns={[
                  { label: 'Product ID', key: 'sku' }, { label: 'Category', key: 'category' }, { label: 'Sub-category', key: 'subCategory' },
                  { label: 'Units Received', key: 'qtyReceived' }, { label: 'Units Sold', key: 'soldQty' }, { label: 'Units Rejected', key: 'qtyRejected' },
                  { label: 'Current Inventory', key: 'totalInvt' }, { label: 'Avg Sale (B2C)', key: 'avgSale' }, { label: 'DOI', key: 'doi' },
                  { label: 'Stock Status', key: 'stockStatus' },
                ]} />
            </div>
          }>
          <div style={{ maxHeight: TABLE_SCROLL_HEIGHT, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                <tr>
                  {SKU_TABLE_COLS.map(c => (
                    <SortableTh key={c.key} label={c.label} sortKey={c.key} sortState={skuSort} onSort={onSkuSort} align={c.align} width={c.width} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {skuTableRows.length === 0 && (
                  <tr><td colSpan={SKU_TABLE_COLS.length} style={{ padding: '16px 10px', color: IC.t3, fontSize: 12, textAlign: 'center' }}>No inward data for this period.</td></tr>
                )}
                {skuTableRows.map((r, i) => (
                  <tr key={r.sku + i} style={{ borderBottom: `1px solid ${IC.border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.025)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '7px 10px', fontWeight: 600, color: IC.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sku}</td>
                    <td style={{ padding: '7px 10px', color: IC.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.category}</td>
                    <td style={{ padding: '7px 10px', color: IC.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subCategory}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtInt(r.qtyReceived)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: IC.t2 }}>{fmtInt(r.soldQty)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.qtyRejected > 0 ? IC.status.Critical.c : IC.t2 }}>{fmtInt(r.qtyRejected)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: IC.t1 }}>{fmtInt(r.totalInvt)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: IC.t2 }}>{fmtInt(r.avgSale)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: IC.t1 }}>{fmtDays(r.doi)}d</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}><StatusChip status={r.stockStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>

        {/* Inward trend */}
        <GlassCard title="Inward Trend" note={`${trendGranularity} units received, with rolling average`}
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[{ k: 'daily', label: 'Daily' }, { k: 'weekly', label: 'Weekly' }, { k: 'monthly', label: 'Monthly' }].map(g => (
                  <button key={g.k} onClick={() => setTrendGranularity(g.k)}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, cursor: 'pointer', background: trendGranularity === g.k ? IC.accDim : IC.surface, color: trendGranularity === g.k ? IC.t1 : IC.t3, border: `1px solid ${trendGranularity === g.k ? IC.accBorder : IC.border}` }}>
                    {g.label}
                  </button>
                ))}
              </div>
              <ExportButton filename="inward_trend.csv" rows={data[trendGranularity]}
                columns={[{ label: 'Date', key: 'date' }, { label: 'Units Received', key: 'qtyReceived' }, { label: 'Units Rejected', key: 'qtyRejected' }]} />
            </div>
          }>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={trendChart} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={IC.border} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: IC.t3 }} axisLine={{ stroke: IC.border2 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: IC.t3 }} tickFormatter={fmtNum} axisLine={{ stroke: IC.border2 }} tickLine={false} width={44} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="qtyReceived" name="Units Received" fill="rgba(52,211,153,0.18)" stroke={IC.acc} strokeWidth={2} />
              {trendGranularity === 'daily' && <Line type="monotone" dataKey="rollingAvg" name="7d Rolling Avg" stroke={IC.categorical[0]} strokeWidth={2} dot={false} strokeDasharray="4 3" />}
            </ComposedChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* Category breakdown + facility-wise inward */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 14 }}>
          <GlassCard title="Category Breakdown" note="units received, top 12"
            action={<ExportButton filename="category_breakdown.csv" rows={data.categoryBreakdown}
              columns={[{ label: 'Category', key: 'category' }, { label: 'Units Received', key: 'qtyReceived' }, { label: 'Units Rejected', key: 'qtyRejected' }]} />}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={categoryChart} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={IC.border} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: IC.t3 }} tickFormatter={fmtNum} axisLine={{ stroke: IC.border2 }} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10.5, fill: IC.t2 }} width={130} axisLine={{ stroke: IC.border2 }} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="qtyReceived" name="Units Received" fill={IC.acc} radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard title="Facility-Wise Inward" note="units received by warehouse location">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.facilityBreakdown.length === 0 && <div style={{ fontSize: 12, color: IC.t3 }}>No data for this period.</div>}
              {data.facilityBreakdown.map(f => (
                <BreakdownBar key={f.location} label={f.location} value={f.qtyReceived} rejected={f.qtyRejected}
                  maxValue={Math.max(1, ...data.facilityBreakdown.map(x => x.qtyReceived))} />
              ))}
            </div>
          </GlassCard>
        </div>

        {/* Sub-category breakdown table */}
        <GlassCard title="Sub-Category Breakdown" note="units received, top 20"
          action={<ExportButton filename="subcategory_breakdown.csv" rows={data.subCategoryBreakdown}
            columns={[{ label: 'Category', key: 'category' }, { label: 'Sub-category', key: 'subCategory' }, { label: 'Units Received', key: 'qtyReceived' }, { label: 'Units Rejected', key: 'qtyRejected' }]} />}>
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.subCategoryBreakdown.length === 0 && <div style={{ fontSize: 12, color: IC.t3 }}>No data for this period.</div>}
            {data.subCategoryBreakdown.slice(0, 20).map((sc, i) => (
              <BreakdownBar key={i} label={sc.subCategory} sub={sc.category} value={sc.qtyReceived} rejected={sc.qtyRejected} maxValue={maxSubCatQty} />
            ))}
          </div>
        </GlassCard>

        {/* Vendor performance + rejection reasons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 14 }}>
          <GlassCard title="Vendor Performance" note="units received & rejection rate, top by volume"
            action={<ExportButton filename="vendor_performance.csv" rows={data.vendorPerformance}
              columns={[{ label: 'Vendor', key: 'vendor' }, { label: 'Units Received', key: 'qtyReceived' }, { label: 'Units Rejected', key: 'qtyRejected' }, { label: 'Rejection %', key: 'rejectionPct' }, { label: 'GRN Count', key: 'grnCount' }]} />}>
            <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.vendorPerformance.length === 0 && <div style={{ fontSize: 12, color: IC.t3 }}>No data for this period.</div>}
              {data.vendorPerformance.slice(0, 20).map((v, i) => (
                <BreakdownBar key={i} label={v.vendor} sub={`${v.grnCount} GRNs · ${v.rejectionPct.toFixed(1)}% rejected`}
                  value={v.qtyReceived} maxValue={maxVendorQty}
                  color={v.rejectionPct > 5 ? IC.status.Critical.c : IC.positive} />
              ))}
            </div>
          </GlassCard>

          <GlassCard title="Rejection Reasons" note="units rejected by reason">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.rejectionReasons.length === 0 && <div style={{ fontSize: 12, color: IC.t3 }}>No rejections in this period.</div>}
              {data.rejectionReasons.slice(0, 10).map((r, i) => (
                <BreakdownBar key={i} label={r.reason} value={r.qty} maxValue={maxReasonQty} color={IC.status.Critical.c} />
              ))}
            </div>
          </GlassCard>
        </div>

      </div>
    </div>
  )
}
