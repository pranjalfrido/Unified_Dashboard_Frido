import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { C, fmt, fmtN, pct, processData, detectAlerts, exportCSV, getDefaultDates } from './utils.js'
import { KPICard, AlertCard, HBar, DataTable, Card, Badge, RevTrendChart, AreaTrendChart, MultiLineChart, ChartTooltip, BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from './components.jsx'

// ── Sidebar ───────────────────────────────────────────────────
function Sidebar({ page, setPage }) {
  const items = [
    { id: 'overview', icon: '⊞', label: 'Overview' },
    { id: 'sales', icon: '▦', label: 'Sales' },
    { id: 'intelligence', icon: '◈', label: 'Intel' },
  ]
  const dims = [
    { label: 'P&L' }, { label: 'Inventory' }, { label: 'Courier' }, { label: 'Marketing' }
  ]
  return (
    <nav className="sidebar">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 14, gap: 2 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: C.acc, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 12px rgba(255,214,0,.4)' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#13121A' }}>Fr</span>
        </div>
        <span style={{ fontSize: 7.5, fontWeight: 600, color: C.t3, letterSpacing: '.04em', textTransform: 'uppercase', lineHeight: 1, textAlign: 'center' }}>Analytics</span>
      </div>
      {items.map(item => (
        <div key={item.id} onClick={() => setPage(item.id)}
          className={`sb-item${page === item.id ? ' active' : ''}`}>
          <span className="sb-icon">{item.icon}</span>
          <span className="sb-label">{item.label}</span>
        </div>
      ))}
      <div className="sb-div" />
      {dims.map(d => (
        <div key={d.label} className="sb-item dim">
          <span className="sb-icon" style={{ fontSize: 16 }}>○</span>
          <span className="sb-label">{d.label}</span>
        </div>
      ))}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <div className="sb-div" />
        {[{ ic: '⚙', label: 'Settings' }, { ic: '👤', label: 'Profile' }].map(b => (
          <div key={b.label} className="sb-item">
            <span className="sb-icon" style={{ fontSize: 16 }}>{b.ic}</span>
            <span className="sb-label">{b.label}</span>
          </div>
        ))}
      </div>
    </nav>
  )
}

// ── Bottom Nav (mobile) ───────────────────────────────────────
function BottomNav({ page, setPage }) {
  const items = [
    { id: 'overview', icon: '⊞', label: 'Overview' },
    { id: 'sales', icon: '▦', label: 'Sales' },
    { id: 'intelligence', icon: '◈', label: 'Intel' },
  ]
  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {items.map(item => (
          <div key={item.id} onClick={() => setPage(item.id)} className={`bn-item${page === item.id ? ' active' : ''}`}>
            <span className="bn-icon">{item.icon}</span>
            <span className="bn-label">{item.label}</span>
          </div>
        ))}
      </div>
    </nav>
  )
}

// ── Topnav ─────────────────────────────────────────────────────
function Topnav({ page, alerts, onRefresh, loading, filters, setFilters, rawRows }) {
  const titles = { overview: 'Overview', sales: 'Sales Analytics', intelligence: 'Intelligence' }
  const critical = alerts.filter(a => a.type === 'red').length
  const today = new Date()
  const fmt0 = d => d.toISOString().slice(0, 10)
  const presets = [
    { label: 'Today', fn: () => { const d = fmt0(today); setFilters(f => ({ ...f, start: d, end: d })) } },
    { label: '7D', fn: () => { const s = new Date(today); s.setDate(s.getDate() - 6); setFilters(f => ({ ...f, start: fmt0(s), end: fmt0(today) })) } },
    { label: '30D', fn: () => { const s = new Date(today); s.setDate(s.getDate() - 29); setFilters(f => ({ ...f, start: fmt0(s), end: fmt0(today) })) } },
    { label: 'MTD', fn: () => { const s = new Date(today.getFullYear(), today.getMonth(), 1); setFilters(f => ({ ...f, start: fmt0(s), end: fmt0(today) })) } },
  ]
  return (
    <div className="topnav">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: C.t1, letterSpacing: '-.02em' }}>frido</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: C.t3 }}>Analytics Dashboard</span>
        </div>
        <span style={{ fontSize: 11, color: C.t3, fontWeight: 500, fontStyle: 'italic', lineHeight: 1 }}>Freedom to do more</span>
      </div>
      <div className="tnav-sep" />
      <span className="tnav-title">{titles[page]}</span>
      <div className="tnav-sep" />
      <span className="tnav-sub">{filters.start} → {filters.end}</span>
      <div className="tnav-right">
        {presets.map(p => (
          <button key={p.label} onClick={p.fn} className="tnav-preset">{p.label}</button>
        ))}
        <input type="date" value={filters.start} onChange={e => setFilters(f => ({ ...f, start: e.target.value }))} className="tnav-date" />
        <span style={{ fontSize: 12, color: C.t3 }}>→</span>
        <input type="date" value={filters.end} onChange={e => setFilters(f => ({ ...f, end: e.target.value }))} className="tnav-date" />
        {critical > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: C.red.bg, color: C.red.tx, border: `1px solid ${C.red.bd}`, display: 'inline-flex', alignItems: 'center', gap: 4 }}>⚠ {critical} critical</span>}
        <button onClick={onRefresh} className="tnav-btn">
          <span style={{ display: 'inline-block', animation: loading ? 'spin 1s linear infinite' : 'none', fontSize: 14 }}>↻</span> Refresh
        </button>
        <button onClick={() => exportCSV(rawRows)} className="tnav-btn tnav-btn-primary" style={{ color: '#13121A' }}>↓ Export</button>
      </div>
    </div>
  )
}

// ── Overview Page ─────────────────────────────────────────────
function OverviewPage({ data, alerts }) {
  const { totalRev, totalExcRev, gstCollected, nOrders, totalQty, blendedAOV, nDays, chMap, catMap, stateMap, nCusts, repeatCusts, dailyArr, orders, htCount, htRev, multiItemOrders } = data
  const shopifyRev = chMap['Shopify']?.rev || 0
  const d2cPct = totalRev ? (shopifyRev / totalRev * 100).toFixed(1) : '0'
  const mktPct = (100 - parseFloat(d2cPct)).toFixed(1)
  const qcChs = ['Blinkit', 'Instamart', 'Zepto']
  const qcRev = qcChs.reduce((s, c) => s + (chMap[c]?.rev || 0), 0)
  const qcOrds = qcChs.reduce((s, c) => s + (chMap[c]?.orders || 0), 0)
  const qcAOV = qcOrds ? Math.round(qcRev / qcOrds) : 0
  const repeatRate = nCusts ? (repeatCusts / nCusts * 100).toFixed(1) : '0'
  const sortedCh = Object.entries(chMap).sort((a, b) => b[1].rev - a[1].rev)
  const maxChRev = sortedCh[0]?.[1].rev || 1
  const bestAOV = sortedCh.reduce((b, [ch, v]) => { const a = v.orders ? v.rev / v.orders : 0; return a > b.aov ? { ch, aov: a } : b }, { ch: '', aov: 0 })
  const topCats = Object.entries(catMap).map(([k, v]) => ({ name: k, rev: v.rev, orders: v.orders.size, aov: v.orders.size ? v.rev / v.orders.size : 0 })).sort((a, b) => b.rev - a.rev).slice(0, 5)
  const channels = Object.keys(C.ch).filter(ch => chMap[ch])
  const voucherOrders = orders.filter(o => o.voucher).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero row */}
      <div className="g-hero">
        <div className="hero-grad" style={{ borderRadius: 16, padding: '24px 26px', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(0,0,0,.5)', marginBottom: 8 }}>Gross Revenue · Inc. GST</div>
            <div className="hero-val" style={{ fontSize: 42, fontWeight: 700, color: '#13121A', letterSpacing: '-.04em', lineHeight: 1, marginBottom: 6 }}>{totalRev >= 1e7 ? `₹${(totalRev / 1e7).toFixed(2)} Cr` : `₹${(totalRev / 1e5).toFixed(1)} L`}</div>
            <div style={{ fontSize: 12.5, color: 'rgba(0,0,0,.55)', lineHeight: 1.7 }}>Net {fmt(totalExcRev)} · GST {fmt(gstCollected)}<br />{nDays}d · {Object.keys(chMap).length} channels · {fmtN(nOrders)} orders</div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 5, background: 'rgba(0,0,0,.1)', color: '#13121A', marginTop: 10, width: 'fit-content' }}>
            Daily avg {fmt(totalRev / nDays)}
          </div>
          <div style={{ position: 'absolute', right: -10, bottom: -20, fontSize: 100, color: 'rgba(0,0,0,.04)', pointerEvents: 'none' }}>₹</div>
        </div>
        <KPICard center label="Orders" value={fmtN(nOrders)} sub={`${fmtN(totalQty)} units · ${(totalQty / (nOrders || 1)).toFixed(1)}/order`} />
        <KPICard center label="Blended AOV" value={`₹${Math.round(blendedAOV).toLocaleString('en-IN')}`} sub={`Best: ${bestAOV.ch} ₹${Math.round(bestAOV.aov).toLocaleString('en-IN')}`} />
        <KPICard center label="Unique Customers" value={fmtN(nCusts)} sub={`${repeatRate}% repeat`} />
      </div>

      {/* 9 KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 10 }}>
        <KPICard label="Daily avg revenue" value={fmt(totalRev / nDays)} sub={`${nDays} days`} />
        <KPICard label="D2C Share" value={`${d2cPct}%`} sub={`Shopify ${fmt(shopifyRev)}`} />
        <KPICard label="Q-commerce Share" value={pct(qcRev, totalRev)} sub={`${fmt(qcRev)} · Blinkit+Instamart+Zepto`} />
        <KPICard label="Marketplace Share" value={`${(100 - parseFloat(d2cPct) - parseFloat(pct(qcRev, totalRev))).toFixed(1)}%`} sub={`Amazon+Flipkart+others ${fmt(totalRev - shopifyRev - qcRev)}`} />
        <KPICard label="Multi-item rate" value={pct(multiItemOrders, nOrders)} sub="+AOV premium" />
        <KPICard label="Voucher penetration" value={pct(voucherOrders, nOrders)} sub={`${fmtN(voucherOrders)} orders`} />
        <KPICard label="High-ticket ≥₹10K" value={fmtN(htCount)} sub={fmt(htRev)} />
      </div>

      {/* Trend + Channels */}
      <div className="g-21">
        <Card title="Revenue trend · daily" note="₹ stacked by channel">
          <RevTrendChart dailyArr={dailyArr} channels={channels} />
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: C.t3, marginBottom: 7 }}>D2C vs Q-Commerce vs Marketplace</div>
            <div className="spbar">
              <div style={{ width: `${d2cPct}%`, background: C.acc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#13121A', minWidth: 50 }}>{d2cPct}% D2C</div>
              <div style={{ width: `${pct(qcRev, totalRev)}`, background: '#0D9E68', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', minWidth: 40 }}>{parseFloat(pct(qcRev, totalRev)).toFixed(1)}% QC</div>
              <div style={{ flex: 1, background: '#B0ADB8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#13121A' }}>{(100 - parseFloat(d2cPct) - parseFloat(pct(qcRev, totalRev))).toFixed(1)}% Mkt</div>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
              {sortedCh.slice(0, 6).map(([ch, v]) => (
                <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.t2 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.ch[ch] || C.acc, display: 'inline-block', border: C.ch[ch] === '#FFD600' ? '1px solid #E6C200' : 'none' }} />
                  {ch} {fmt(v.rev)}
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card title="Channel breakdown">
          {sortedCh.map(([ch, v]) => <HBar key={ch} dot={C.ch[ch] || C.acm} label={ch} width={(v.rev / maxChRev) * 100} value={fmt(v.rev)} pctVal={pct(v.rev, totalRev)} />)}
        </Card>
      </div>

      {/* Alerts + Scorecard + Top Performers */}
      <div className="g-3">
        <Card title="Management alerts" note={`${alerts.filter(a => a.type === 'red').length} critical · ${alerts.filter(a => a.type === 'amber').length} watch`}>
          {alerts.length === 0 && <div style={{ fontSize: 12, color: C.t3 }}>No alerts for this period.</div>}
          {alerts.map((a, i) => <AlertCard key={i} {...a} />)}
        </Card>
        <Card title="Channel scorecard">
          <DataTable columns={[
            { key: 'ch', label: 'Channel' },
            { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
            { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
            { key: 'aov', label: 'AOV', align: 'right', mono: true, render: v => `₹${Math.round(v).toLocaleString('en-IN')}` },
            { key: 'health', label: 'Health', render: v => <Badge type={v === 'Healthy' ? 'green' : v === 'GST flag' ? 'amber' : 'red'}>{v}</Badge> },
          ]} rows={Object.keys(C.ch).map(ch => { const v = chMap[ch] || { rev: 0, orders: 0 }; return { ch, rev: v.rev, orders: v.orders, aov: v.orders ? v.rev / v.orders : 0, health: ch === 'Blinkit' ? 'GST flag' : ch === 'CRED' ? 'Feed gap' : 'Healthy' } })} />
        </Card>
        <Card title="Top performers">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: C.t3, marginBottom: 7 }}>Categories</div>
          <DataTable columns={[{ key: 'name', label: 'Category' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }]} rows={topCats} maxRows={5} />
        </Card>
      </div>
    </div>
  )
}

// ── Sales sub-tabs ────────────────────────────────────────────
const TABS = [
  { id: 'all', label: 'All Channels' },
  { id: 'shopify', label: 'Shopify', ch: 'Shopify' },
  { id: 'amazon', label: 'Amazon', ch: 'Amazon' },
  { id: 'flipkart', label: 'Flipkart', ch: 'Flipkart' },
  { id: 'blinkit', label: 'Blinkit', ch: 'Blinkit' },
  { id: 'cred', label: 'CRED', ch: 'CRED' },
  { id: 'instamart', label: 'Instamart', ch: 'Instamart' },
  { id: 'zepto', label: 'Zepto', ch: 'Zepto' },
  { id: 'myntra', label: 'Myntra', ch: 'Myntra' },
  { id: 'qc', label: '⚡ Quick Commerce' },
  { id: 'ops', label: '🚚 Operations' },
  { id: 'cx', label: '👥 Customers' },
]

function PaginatedCard({ title, rows, columns, pageSize = 10 }) {
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [rows])
  const totalPages = Math.ceil(rows.length / pageSize)
  const visible = rows.slice(page * pageSize, (page + 1) * pageSize)
  return (
    <Card title={title} style={{ display: 'flex', flexDirection: 'column' }}>
      <DataTable columns={columns} rows={visible} />
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
  const ref = useRef(null)
  const selectedArr = selected ? selected.split(',').map(s => s.trim()).filter(Boolean) : []
  const filtered = (voucherList || []).filter(({ code }) => code.toLowerCase().includes(search.toLowerCase()))

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = code => {
    const next = selectedArr.includes(code) ? selectedArr.filter(v => v !== code) : [...selectedArr, code]
    onChange(next.join(','))
  }

  const label = selectedArr.length === 0 ? 'All Vouchers' : selectedArr.length === 1 ? selectedArr[0] : `${selectedArr.length} vouchers selected`

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <div onClick={() => setOpen(o => !o)} className="fsel" style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', minWidth: 160, maxWidth: 200, background: selectedArr.length ? '#FFF9CC' : undefined, borderColor: selectedArr.length ? C.acm : undefined }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5 }}>{label}</span>
        <span style={{ fontSize: 8, color: C.t3, flexShrink: 0 }}>▼</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 200, background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, boxShadow: '0 8px 28px rgba(0,0,0,.14)', width: 240 }}>
          <div style={{ padding: '7px 8px', borderBottom: `1px solid ${C.border}` }}>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} onMouseDown={e => e.stopPropagation()} placeholder="Search voucher…" style={{ width: '100%', fontSize: 11.5, padding: '4px 8px', border: `1px solid ${C.border2}`, borderRadius: 6, outline: 'none', fontFamily: 'var(--font)', background: C.bg }} />
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            <div onClick={() => { onChange(''); setSearch(''); setOpen(false) }} style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: selectedArr.length === 0 ? C.t1 : C.t2, fontWeight: selectedArr.length === 0 ? 600 : 400, background: selectedArr.length === 0 ? C.acl : undefined }}>All Vouchers</div>
            <div style={{ height: 1, background: C.border }} />
            {filtered.map(({ code, orders }) => {
              const checked = selectedArr.includes(code)
              return (
                <div key={code} onClick={() => toggle(code)} style={{ padding: '5px 10px', fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, background: checked ? C.acl : undefined }}>
                  <span style={{ width: 13, height: 13, borderRadius: 3, border: `1.5px solid ${checked ? C.acm : C.border2}`, background: checked ? C.acc : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 8, fontWeight: 700 }}>{checked ? '✓' : ''}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{code}</span>
                  <span style={{ fontSize: 10, color: C.t3, flexShrink: 0 }}>{orders}</span>
                </div>
              )
            })}
            {filtered.length === 0 && <div style={{ padding: '10px', fontSize: 11.5, color: C.t3, textAlign: 'center' }}>No results</div>}
          </div>
          {selectedArr.length > 0 && (
            <div style={{ padding: '6px 10px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: C.t3 }}>{selectedArr.length} selected</span>
              <span onClick={() => onChange('')} style={{ fontSize: 11, color: '#A32D2D', cursor: 'pointer', fontWeight: 500 }}>Clear</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const CHART_METRICS = [
  { id: 'rev', label: 'Revenue', key: ch => ch },
  { id: 'orders', label: 'Orders', key: ch => ch + '_o' },
  { id: 'units', label: 'Units', key: ch => ch + '_u' },
]
const CHART_TYPES = [
  { id: 'line', label: 'Line' },
  { id: 'bar', label: 'Bar' },
  { id: 'area', label: 'Area' },
]

function ChannelTrendCard({ dailyArr, channels }) {
  const [metric, setMetric] = useState('rev')
  const chartType = 'line'
  const m = CHART_METRICS.find(x => x.id === metric)
  const dataKey = m.key
  const fmtTick = v => v >= 1e5 ? `${(v / 1e5).toFixed(0)}L` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v
  const selStyle = { fontSize: 11.5, padding: '4px 8px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer' }

  const chartProps = {
    data: dailyArr,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  }
  const axisProps = {
    xAxis: <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />,
    yAxis: <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={fmtTick} width={40} />,
    grid: <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />,
    tooltip: <Tooltip content={<ChartTooltip />} />,
    legend: <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />,
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>Daily {m.label} by Channel</span>
        <select value={metric} onChange={e => setMetric(e.target.value)} style={selStyle}>
          {CHART_METRICS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        {chartType === 'bar' ? (
          <BarChart {...chartProps}>
            {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{axisProps.tooltip}{axisProps.legend}
            {channels.map(ch => <Bar key={ch} dataKey={dataKey(ch)} name={ch} stackId="a" fill={C.ch[ch] || C.acc} />)}
          </BarChart>
        ) : chartType === 'area' ? (
          <AreaChart {...chartProps}>
            {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{axisProps.tooltip}{axisProps.legend}
            {channels.map(ch => <Area key={ch} type="monotone" dataKey={dataKey(ch)} name={ch} stroke={C.ch[ch] || C.acc} fill={C.ch[ch] || C.acc} fillOpacity={0.15} strokeWidth={2} dot={false} />)}
          </AreaChart>
        ) : (
          <LineChart {...chartProps}>
            {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{axisProps.tooltip}{axisProps.legend}
            {channels.map(ch => <Line key={ch} type="monotone" dataKey={dataKey(ch)} name={ch} stroke={C.ch[ch] || C.acc} strokeWidth={2} dot={false} />)}
          </LineChart>
        )}
      </ResponsiveContainer>
    </Card>
  )
}

const DAILY_METRICS = [
  { id: 'rev', label: 'Revenue' },
  { id: 'orders', label: 'Orders' },
  { id: 'units', label: 'Units' },
  { id: 'aov', label: 'AOV' },
  { id: 'asp', label: 'ASP' },
]

const GROUP_OPTS = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
]

function getGroupKey(date, groupBy) {
  if (!date) return '—'
  if (groupBy === 'daily') return date
  if (groupBy === 'weekly') {
    const d = new Date(date)
    const jan1 = new Date(d.getFullYear(), 0, 1)
    const weekNum = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)
    const mon = d.toLocaleString('en-IN', { month: 'short' })
    const yr = String(d.getFullYear()).slice(2)
    return `${mon}-${yr} W${weekNum}`
  }
  if (groupBy === 'monthly') return date.slice(0, 7)
  if (groupBy === 'quarterly') {
    const [y, m] = date.split('-')
    const q = Math.ceil(parseInt(m) / 3)
    return `${y} Q${q}`
  }
  return date
}

function groupDailyArr(dailyArr, channels, groupBy) {
  if (groupBy === 'daily') return dailyArr
  const map = {}
  dailyArr.forEach(d => {
    const key = getGroupKey(d.date, groupBy)
    if (!map[key]) { map[key] = { date: key }; channels.forEach(ch => { map[key][ch] = 0; map[key][ch + '_o'] = 0; map[key][ch + '_u'] = 0 }) }
    channels.forEach(ch => {
      map[key][ch] = (map[key][ch] || 0) + (d[ch] || 0)
      map[key][ch + '_o'] = (map[key][ch + '_o'] || 0) + (d[ch + '_o'] || 0)
      map[key][ch + '_u'] = (map[key][ch + '_u'] || 0) + (d[ch + '_u'] || 0)
    })
  })
  return Object.values(map)
}

function DailyChannelTable({ dailyArr, channels, nDays = 7 }) {
  const autoGroup = nDays <= 14 ? 'daily' : nDays <= 90 ? 'weekly' : 'monthly'
  const [metric, setMetric] = useState('rev')
  const [groupBy, setGroupBy] = useState(autoGroup)
  useEffect(() => { setGroupBy(autoGroup) }, [nDays])
  const m = DAILY_METRICS.find(x => x.id === metric)
  const grouped = groupDailyArr(dailyArr, channels, groupBy)

  const getVal = (d, ch) => {
    if (metric === 'rev') return d[ch] || 0
    if (metric === 'orders') return d[ch + '_o'] || 0
    if (metric === 'units') return d[ch + '_u'] || 0
    if (metric === 'aov') { const o = d[ch + '_o'] || 0; return o ? (d[ch] || 0) / o : 0 }
    if (metric === 'asp') { const u = d[ch + '_u'] || 0; return u ? (d[ch] || 0) / u : 0 }
    return 0
  }
  const fmtVal = v => {
    if (metric === 'rev') return fmt(v)
    if (metric === 'aov' || metric === 'asp') return v > 0 ? `₹${Math.round(v).toLocaleString('en-IN')}` : '—'
    return fmtN(v)
  }
  const getTotalVal = d => {
    if (metric === 'rev') return channels.reduce((s, ch) => s + (d[ch] || 0), 0)
    if (metric === 'orders') return channels.reduce((s, ch) => s + (d[ch + '_o'] || 0), 0)
    if (metric === 'units') return channels.reduce((s, ch) => s + (d[ch + '_u'] || 0), 0)
    if (metric === 'aov') { const o = channels.reduce((s, ch) => s + (d[ch + '_o'] || 0), 0); const r = channels.reduce((s, ch) => s + (d[ch] || 0), 0); return o ? r / o : 0 }
    if (metric === 'asp') { const u = channels.reduce((s, ch) => s + (d[ch + '_u'] || 0), 0); const r = channels.reduce((s, ch) => s + (d[ch] || 0), 0); return u ? r / u : 0 }
    return 0
  }

  const selStyle = { fontSize: 11.5, padding: '4px 8px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer' }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{GROUP_OPTS.find(x => x.id === groupBy).label} {m.label} by Channel</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={selStyle}>
            {GROUP_OPTS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          <select value={metric} onChange={e => setMetric(e.target.value)} style={selStyle}>
            {DAILY_METRICS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}>
            <tr>
              <th style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}` }}>Period</th>
              {channels.map(ch => <th key={ch} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: 'right', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}` }}>{ch}</th>)}
              <th style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: 'right', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}` }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((d, i) => (
              <tr key={i} style={{ borderBottom: i < grouped.length - 1 ? `1px solid ${C.border}` : 'none' }} onMouseEnter={e => e.currentTarget.style.background = '#FFFBE6'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ padding: '5.5px 5px', color: C.t2 }}>{d.date}</td>
                {channels.map(ch => <td key={ch} style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t1, fontFamily: 'var(--mono)', fontSize: 11.5 }}>{fmtVal(getVal(d, ch))}</td>)}
                <td style={{ padding: '5.5px 5px', textAlign: 'right', fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)', fontSize: 11.5 }}>{fmtVal(getTotalVal(d))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function CategoryChannelMatrix({ heatData, channels, maxHeat }) {
  return (
    <Card title="Category × Channel Revenue Matrix" note="₹ shading = intensity">
      <div className="tbl-wrap">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 700 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: C.t3, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Category</th>
              {channels.map(ch => <th key={ch} style={{ textAlign: 'right', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: C.ch[ch], fontSize: 10, fontWeight: 700 }}>{ch}</th>)}
              <th style={{ textAlign: 'right', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: C.t1, fontSize: 10, fontWeight: 700 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {heatData.map((row, i) => {
              const rowTotal = channels.reduce((s, ch) => s + (row[ch] || 0), 0)
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '5px', fontWeight: 600, color: C.t1 }}>{row.cat}</td>
                  {channels.map(ch => {
                    const v = row[ch] || 0
                    const intensity = v / rowTotal
                    const cls = intensity === 0 ? 'h0' : intensity < 0.1 ? 'h1' : intensity < 0.3 ? 'h2' : intensity < 0.6 ? 'h3' : 'h4'
                    return (
                      <td key={ch} className={cls} style={{ padding: '5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11 }}>
                        {v > 0 ? fmt(v) : '—'}
                      </td>
                    )
                  })}
                  <td style={{ padding: '5px', textAlign: 'right', fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)', fontSize: 11 }}>{fmt(rowTotal)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="ins-box" style={{ marginTop: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#7A6000', marginBottom: 5 }}>⚡ Gap analysis</div>
        <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.7 }}>Red cells (—) = zero revenue. Look for high-performing categories with missing channel presence to find growth opportunities.</div>
      </div>
    </Card>
  )
}

function AllTab({ data }) {
  const { totalRev, totalExcRev, gstCollected, nOrders, totalQty, blendedAOV, nDays, dailyArr, chMap, catMap, subCatMap, stateMap, cityRows = [], buckets, bucketRev, rows, orders, orderStatusRevMap = {}, orderStatusMap = {}, catChannelMap = {} } = data
  const channels = Object.keys(C.ch).filter(ch => chMap[ch])
  const sortedCh = Object.entries(chMap).sort((a, b) => b[1].rev - a[1].rev)
  const maxChRev = sortedCh[0]?.[1].rev || 1
  const [selectedCat, setSelectedCat] = useState(null)
  const catRows = Object.entries(catMap).map(([k, v]) => ({ name: k, rev: v.rev, excRev: v.excRev, orders: v.orders.size, units: v.units, aov: v.orders.size ? v.rev / v.orders.size : 0 })).sort((a, b) => b.rev - a.rev)
  const allSubCatRows = Object.entries(subCatMap).map(([k, v]) => ({ name: k, rev: v.rev, orders: v.orders.size, aov: v.orders.size ? v.rev / v.orders.size : 0, category: v.category })).sort((a, b) => b.rev - a.rev)
  const subCatRows = selectedCat ? allSubCatRows.filter(r => r.category === selectedCat) : allSubCatRows
  const stateRows = Object.entries(stateMap).map(([k, v]) => ({ state: k, rev: v.rev, orders: v.orders, aov: v.orders ? v.rev / v.orders : 0, cities: v.cities.size })).sort((a, b) => b.rev - a.rev)
  const bucketData = Object.entries(buckets).map(([k, v]) => ({ name: k, orders: v, rev: bucketRev[k] }))
  const allCats = catRows.slice(0, 8).map(r => r.name)
  const heatData = allCats.map(cat => {
    const row = { cat }
    channels.forEach(ch => { row[ch] = catChannelMap[cat]?.[ch] || 0 })
    return row
  })
  const maxHeat = Math.max(...heatData.flatMap(r => channels.map(ch => r[ch] || 0)), 1)

  const grossMarginPct = totalRev > 0 ? ((totalRev - totalExcRev) / totalRev * 100) : 0
  const revPerUnit = totalQty > 0 ? totalExcRev / totalQty : 0
  const shopifyOrders = orders.filter(o => o.channel === 'Shopify')
  const atRiskRev = (orderStatusRevMap['RTO'] || 0) + (orderStatusRevMap['Cancelled'] || 0)
  const deliveredCount = orders.filter(o => o.orderStatus === 'Delivered').length
  const rtoCount = orders.filter(o => o.orderStatus === 'RTO' || o.isRTO).length
  const cancelCount = orders.filter(o => o.orderStatus === 'Cancelled' || o.isCancelled).length
  const fulfilmentBase = deliveredCount + rtoCount + cancelCount
  const fulfilmentRate = fulfilmentBase > 0 ? (deliveredCount / fulfilmentBase * 100) : 0
  const unitsPerOrder = nOrders > 0 ? totalQty / nOrders : 0
  const rtoOrders = orderStatusMap['RTO'] || 0
  const returnPct = nOrders > 0 ? (rtoOrders / nOrders * 100) : 0
  const asp = totalQty > 0 ? totalRev / totalQty : 0
  const deliveredOrders = orderStatusMap['Delivered'] || 0
  const fulfilmentPct = nOrders > 0 ? (deliveredOrders / nOrders * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10}}>
        <KPICard label="Gross Revenue" value={fmt(totalRev)} sub={`${nDays} days`} />
        <KPICard label="Net (Exc GST)" value={fmt(totalExcRev)} />
        <KPICard label="Orders" value={fmtN(nOrders)} sub={`${fmtN(totalQty)} units`} />
        <KPICard label="Return %" value={`${returnPct.toFixed(1)}%`} sub={`${fmtN(rtoOrders)} RTO orders`} accent={returnPct > 10 ? '#7A1A1A' : undefined} />
        <KPICard label="Blended AOV" value={`₹${Math.round(blendedAOV).toLocaleString('en-IN')}`} />
        <KPICard label="Daily Avg" value={fmt(totalRev / nDays)} />
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10}}>
        <KPICard label="ASP" value={`₹${Math.round(asp).toLocaleString('en-IN')}`} sub={`Revenue per unit sold`} />
        <KPICard label="Fulfilment %" value={`${fulfilmentPct.toFixed(1)}%`} sub={`${fmtN(deliveredOrders)} delivered`} accent={fulfilmentPct < 80 ? '#7A1A1A' : fulfilmentPct >= 90 ? '#286010' : undefined} />
        <KPICard label="GST Collected" value={fmt(gstCollected)} sub={`${totalRev > 0 ? ((gstCollected / totalRev) * 100).toFixed(1) : 0}% of gross rev`} />
        <KPICard label="Revenue per Unit" value={`₹${Math.round(revPerUnit).toLocaleString('en-IN')}`} sub={`Net (exc GST) per unit sold`} />
        <KPICard label="Revenue at Risk" value={fmt(atRiskRev)} sub={`RTO + Cancelled`} accent={atRiskRev > 0 ? '#7A4000' : undefined} />
        <KPICard label="Units per Order" value={unitsPerOrder.toFixed(2)} sub={`Avg basket size`} />
      </div>
      <div className="g-21">
        <ChannelTrendCard dailyArr={dailyArr} channels={channels} />
        <Card title="Channel Share">
          {sortedCh.map(([ch, v]) => <HBar key={ch} dot={C.ch[ch] || C.acm} label={ch} width={(v.rev / maxChRev) * 100} value={fmt(v.rev)} pctVal={pct(v.rev, totalRev)} />)}
        </Card>
      </div>
      <DailyChannelTable dailyArr={dailyArr} channels={channels} nDays={nDays} />
      <CategoryChannelMatrix heatData={heatData} channels={channels} maxHeat={maxHeat} />
      <div className="g-2" style={{ alignItems: 'stretch' }}>
        <Card title="Category Revenue" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {[{ label: 'Category' }, { label: 'Revenue', align: 'right' }, { label: 'Exc GST', align: 'right' }, { label: 'Orders', align: 'right' }, { label: 'AOV', align: 'right' }].map(c => (
                    <th key={c.label} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: c.align || 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}` }}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {catRows.map((r, i) => {
                  const isSelected = selectedCat === r.name
                  return (
                    <tr key={r.name} onClick={() => setSelectedCat(isSelected ? null : r.name)} style={{ borderBottom: i < catRows.length - 1 ? `1px solid ${C.border}` : 'none', background: isSelected ? C.acl : '', cursor: 'pointer' }} onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#FFFBE6' }} onMouseLeave={e => { e.currentTarget.style.background = isSelected ? C.acl : '' }}>
                      <td style={{ padding: '5.5px 5px', color: C.t2 }}>{isSelected ? <strong>{r.name}</strong> : r.name}</td>
                      <td style={{ padding: '5.5px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1 }}>{fmt(r.rev)}</td>
                      <td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmt(r.excRev)}</td>
                      <td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.orders)}</td>
                      <td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>₹{Math.round(r.aov).toLocaleString('en-IN')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <PaginatedCard title={selectedCat ? `Sub-categories · ${selectedCat}` : 'Sub-categories'} rows={subCatRows} columns={[{ key: 'name', label: 'Sub-category' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }]} pageSize={selectedCat ? subCatRows.length : catRows.length} />
      </div>
      <div className="g-2" style={{ alignItems: 'stretch' }}>
        <PaginatedCard title="Top States" rows={stateRows} columns={[{ key: 'state', label: 'State', render: v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }, { key: 'cities', label: 'Cities' }]} pageSize={15} />
        <PaginatedCard title="Top Cities" rows={cityRows} columns={[{ key: 'city', label: 'City', render: v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: (_, r) => `₹${r.orders ? Math.round(r.rev / r.orders).toLocaleString('en-IN') : 0}` }]} pageSize={15} />
      </div>
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

function ShopifyTab({ data, filters, setFilters }) {
  const subChannelMap = data.subChannelMap || {}
  const paymentModeMap = data.paymentModeMap || {}
  const { chMap, orderStatusMap = {}, orderStatusRevMap = {}, nOrders, nCusts, repeatCusts, dailyArr, catMap, subCatMap, stateMap, cityRows = [], voucherMap = {}, orders, financialStatusMap = {}, fulfilmentStatusMap = {}, refundTrend = [] } = data
  const sel = filters.subChannel || ''

  const totalRev = data.totalRev || 0
  const totalExcRev = data.totalExcRev || 0
  const totalQty = data.totalQty || 0
  const rev = totalRev
  const excRev = totalExcRev
  const qty = totalQty
  const shopifyOrders = data.nOrders || 0
  const gst = rev - excRev
  const nDays = data.nDays || 1
  const dailyAvg = nDays ? rev / nDays : 0
  const aov = shopifyOrders ? rev / shopifyOrders : 0
  const asp = qty ? rev / qty : 0
  const deliveredOrders = orderStatusMap['Delivered'] || 0
  const rtoOrders = orderStatusMap['RTO'] || 0
  const fulfilmentPct = nOrders ? (deliveredOrders / nOrders * 100) : 0
  const rtoPct = nOrders ? (rtoOrders / nOrders * 100) : 0
  const atRiskRev = (orderStatusRevMap['RTO'] || 0) + (orderStatusRevMap['Cancelled'] || 0)
  const repeatRate = nCusts ? (repeatCusts / nCusts * 100).toFixed(1) : '0'

  const subChKeys = Object.keys(subChannelMap)
  const maxSubChRev = Math.max(...Object.values(subChannelMap).map(v => v.rev), 1)
  const totalVoucherOrders = Object.values(voucherMap).reduce((s, v) => s + v.orders, 0) || 1
  const maxVoucherOrders = Math.max(...Object.values(voucherMap).map(v => v.orders), 1)
  const maxPaymentOrders = Math.max(...Object.values(paymentModeMap).map(v => v.orders), 1)

  const [selectedCat, setSelectedCat] = useState(null)
  const catRows = Object.entries(catMap).map(([k, v]) => ({ name: k, rev: v.rev, excRev: v.excRev, orders: v.orders.size, units: v.units, aov: v.orders.size ? v.rev / v.orders.size : 0 })).sort((a, b) => b.rev - a.rev)
  const allSubCatRows = Object.entries(subCatMap).map(([k, v]) => ({ name: k, rev: v.rev, orders: v.orders.size, aov: v.orders.size ? v.rev / v.orders.size : 0, category: v.category })).sort((a, b) => b.rev - a.rev)
  const subCatRows = selectedCat ? allSubCatRows.filter(r => r.category === selectedCat) : allSubCatRows
  const stateRows = Object.entries(stateMap).map(([k, v]) => ({ state: k, rev: v.rev, orders: v.orders, aov: v.orders ? v.rev / v.orders : 0, cities: v.cities.size })).sort((a, b) => b.rev - a.rev)
  const shopifyOrderRows = orders.filter(o => o.channel === 'Shopify')

  const selStyle = { fontSize: 11.5, padding: '4px 10px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.t2 }}>Sub-channel:</span>
        <select value={sel} onChange={e => setFilters(f => ({ ...f, subChannel: e.target.value }))} style={selStyle}>
          <option value="">All</option>
          {subChKeys.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
        <KPICard label="Gross Revenue" value={fmt(rev)} sub={`${nDays} days`} />
        <KPICard label="Net (Exc GST)" value={fmt(excRev)} />
        <KPICard label="GST Collected" value={fmt(gst)} sub={rev > 0 ? `${((gst / rev) * 100).toFixed(1)}% of gross` : '—'} />
        <KPICard label="Orders" value={fmtN(shopifyOrders)} />
        <KPICard label="Units" value={fmtN(qty)} />
        <KPICard label="Daily Avg" value={fmt(dailyAvg)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
        <KPICard label="AOV" value={`₹${Math.round(aov).toLocaleString('en-IN')}`} />
        <KPICard label="ASP" value={`₹${Math.round(asp).toLocaleString('en-IN')}`} sub="Revenue per unit" />
        <KPICard label="Fulfilment %" value={`${fulfilmentPct.toFixed(1)}%`} sub={`${fmtN(deliveredOrders)} delivered`} accent={fulfilmentPct < 80 ? '#7A1A1A' : fulfilmentPct >= 90 ? '#286010' : undefined} />
        <KPICard label="RTO %" value={`${rtoPct.toFixed(1)}%`} sub={`${fmtN(rtoOrders)} RTO orders`} accent={rtoPct > 10 ? '#7A1A1A' : undefined} />
        <KPICard label="Revenue at Risk" value={fmt(atRiskRev)} sub="RTO + Cancelled" accent={atRiskRev > 0 ? '#7A4000' : undefined} />
        <KPICard label="Repeat Rate" value={`${repeatRate}%`} sub={`${fmtN(repeatCusts)} of ${fmtN(nCusts)} custs`} />
      </div>
      <div className="g-3">
        <Card title="Sub-channel Breakdown">
          {subChKeys.map((k, i) => { const dots = ['#FFD600','#0D9E68','#2E74CC','#CC4078','#9B59B6']; return <HBar key={k} dot={dots[i % dots.length]} label={k} width={(subChannelMap[k].rev / maxSubChRev) * 100} value={fmt(subChannelMap[k].rev)} pctVal={rev ? pct(subChannelMap[k].rev, rev) : '—'} /> })}
        </Card>
        <Card title="Category Revenue">
          {catRows.slice(0, 8).map((r, i) => { const dots = ['#534AB7','#0D9E68','#2E74CC','#CC8A00','#CC4078','#E24B4A','#9B59B6','#FF6B35']; return <HBar key={r.name} dot={dots[i % dots.length]} label={r.name} width={(r.rev / (catRows[0]?.rev || 1)) * 100} value={fmt(r.rev)} pctVal={totalRev ? pct(r.rev, totalRev) : '—'} /> })}
        </Card>
        <OrderValuePieCard buckets={data.buckets || {}} bucketRev={data.bucketRev || {}} />
      </div>
      <div className="g-2" style={{ alignItems: 'stretch' }}>
      <Card title="Daily Revenue Trend · Shopify">
        <AreaTrendChart data={dailyArr} dataKey="Shopify" color={C.ch['Shopify']} />
      </Card>
      </div>
      <div className="g-2">
        <Card title="Financial Status">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={Object.entries(financialStatusMap).map(([k,v]) => ({ name: k, orders: v.orders, rev: v.rev }))} layout="vertical" margin={{top:0,right:10,bottom:0,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: C.t3 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: C.t3 }} width={90} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="orders" fill={C.acc} radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Fulfilment Status">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={Object.entries(fulfilmentStatusMap).map(([k,v]) => ({ name: k, orders: v }))} layout="vertical" margin={{top:0,right:10,bottom:0,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: C.t3 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: C.t3 }} width={90} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="orders" fill="#0D9E68" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
      <Card title="Daily Refund Rate %">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={refundTrend} margin={{top:0,right:0,bottom:0,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
            <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => `${v.toFixed(1)}%`} width={40} />
            <Tooltip content={<ChartTooltip />} />
            <Line type="monotone" dataKey="rate" stroke={C.red?.tx || '#E24B4A'} strokeWidth={2} dot={false} name="Refund Rate %" />
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <div className="g-2" style={{ alignItems: 'stretch' }}>
        <Card title="Category Revenue" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>{[{ label: 'Category' }, { label: 'Revenue', align: 'right' }, { label: 'Exc GST', align: 'right' }, { label: 'Orders', align: 'right' }, { label: 'AOV', align: 'right' }].map(c => <th key={c.label} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: c.align || 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}` }}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {catRows.map((r, i) => {
                  const isSelected = selectedCat === r.name
                  return (
                    <tr key={r.name} onClick={() => setSelectedCat(isSelected ? null : r.name)} style={{ borderBottom: i < catRows.length - 1 ? `1px solid ${C.border}` : 'none', background: isSelected ? C.acl : '', cursor: 'pointer' }} onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#FFFBE6' }} onMouseLeave={e => { e.currentTarget.style.background = isSelected ? C.acl : '' }}>
                      <td style={{ padding: '5.5px 5px', color: C.t2 }}>{isSelected ? <strong>{r.name}</strong> : r.name}</td>
                      <td style={{ padding: '5.5px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1 }}>{fmt(r.rev)}</td>
                      <td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmt(r.excRev)}</td>
                      <td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.orders)}</td>
                      <td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>₹{Math.round(r.aov).toLocaleString('en-IN')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <PaginatedCard title={selectedCat ? `Sub-categories · ${selectedCat}` : 'Sub-categories'} rows={subCatRows} columns={[{ key: 'name', label: 'Sub-category' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }]} pageSize={selectedCat ? subCatRows.length : catRows.length} />
      </div>
      <div className="g-2" style={{ alignItems: 'stretch' }}>
        <PaginatedCard title="Top States" rows={stateRows} columns={[{ key: 'state', label: 'State', render: v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }, { key: 'cities', label: 'Cities' }]} pageSize={15} />
        <PaginatedCard title="Top Cities" rows={cityRows} columns={[{ key: 'city', label: 'City', render: v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: (_, r) => `₹${r.orders ? Math.round(r.rev / r.orders).toLocaleString('en-IN') : 0}` }]} pageSize={15} />
      </div>
    </div>
  )
}

function ChannelTab({ data, channel, filters, setFilters }) {
  if (channel === 'Shopify') return <ShopifyTab data={data} filters={filters} setFilters={setFilters} />
  const chOrders = data.orders.filter(o => o.channel === channel)
  const chRows = data.rows.filter(r => r.Channel === channel)
  const rev = chOrders.reduce((s, o) => s + o.rev, 0)
  const nOrders = chOrders.length
  const aov = nOrders ? rev / nOrders : 0
  const qty = chOrders.reduce((s, o) => s + o.qty, 0)
  const catMap = {}
  chRows.forEach(r => {
    const cat = r.Category || 'Unknown'
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
  const chRTORev = channel === 'Shopify' ? chOrders.filter(o => o.isRTO).reduce((s, o) => s + o.rev, 0) + chOrders.filter(o => o.isCancelled).reduce((s, o) => s + o.rev, 0) : 0
  const deliveredCh = chOrders.filter(o => o.orderStatus === 'Delivered').length
  const rtoCh = chOrders.filter(o => o.orderStatus === 'RTO' || o.isRTO).length
  const cancelCh = chOrders.filter(o => o.orderStatus === 'Cancelled' || o.isCancelled).length
  const fulfilBase = deliveredCh + rtoCh + cancelCh
  const fulfilRate = fulfilBase > 0 ? (deliveredCh / fulfilBase * 100) : 0
  const upo = nOrders > 0 ? qty / nOrders : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="g-kpi5">
        <KPICard label="Revenue" value={fmt(rev)} />
        <KPICard label="Orders" value={fmtN(nOrders)} />
        <KPICard label="AOV" value={`₹${Math.round(aov).toLocaleString('en-IN')}`} />
        <KPICard label="Units" value={fmtN(qty)} />
        <KPICard label="Daily Avg" value={fmt(rev / (data.nDays || 1))} />
      </div>
      <div className="g-kpi3">
        <KPICard label="Revenue per Unit" value={`₹${Math.round(revPerUnit).toLocaleString('en-IN')}`} sub="Avg price per SKU" />
        <KPICard label="Revenue at Risk" value={channel === 'Shopify' ? fmt(chRTORev) : 'N/A'} sub="RTO + Cancelled" accent={chRTORev > 0 ? '#7A4000' : undefined} />
        <KPICard label="Units per Order" value={upo.toFixed(2)} sub="Avg basket size" />
      </div>
      {channel === 'Blinkit' && <AlertCard type="red" title="Blinkit GST pipeline broken" body="SellingPrice_Exc_GST unreliable — implied GST 800%+. Use Inc_GST only." />}
      {channel === 'CRED' && <AlertCard type="amber" title="CRED batch anomaly" body="Spikes may represent delayed batch processing, not organic demand." />}
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
        <DataTable columns={[{ key: 'name', label: 'Category' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }]} rows={catRows} />
      </Card>
      <Card title="Daily Performance">
        <DataTable columns={[{ key: 'date', label: 'Date' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: (_, r) => r.orders ? `₹${Math.round(r.rev / r.orders).toLocaleString('en-IN')}` : '—' }]} rows={dailyArr} />
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
              <DataTable columns={[{ key: 'sku', label: 'SKU' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'qty', label: 'Qty', align: 'right', render: v => fmtN(v) }]} rows={Object.entries(prodMap).map(([k, v]) => ({ sku: k, ...v })).sort((a, b) => b.rev - a.rev).slice(0, 15)} maxRows={15} />
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
          <DataTable columns={[{ key: 'label', label: 'Bucket' }, { key: 'count', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'pct', label: '%', render: (_, r) => pct(r.count, tatArr.length) }]} rows={tatBuckets} />
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
      {parseFloat(repeatRate) < 10 && nCusts > 0 && <AlertCard type="red" title={`Repeat rate ${repeatRate}% — launch CRM programme`} body="90%+ customers never reordered. Implement post-purchase flows, loyalty points, and win-back campaigns." />}
      <Card title="Voucher Analysis">
        <DataTable columns={[{ key: 'type', label: 'Type' }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }]}
          rows={Object.entries(voucherMap).map(([k, v]) => ({ type: k, orders: v.orders, rev: v.rev, aov: v.orders ? v.rev / v.orders : 0 })).sort((a, b) => b.rev - a.rev)} />
      </Card>
    </div>
  )
}

function SalesPage({ data, filters, setFilters }) {
  const [activeTab, setActiveTab] = useState('all')
  const filteredData = data

  const cats = useMemo(() => Object.keys(data?.catMap || {}).filter(Boolean).sort(), [data])
  const states = useMemo(() => Object.keys(data?.stateMap || {}).filter(Boolean).sort(), [data])
  const subCats = useMemo(() => {
    const all = Object.entries(data?.subCatMap || {})
    const filtered = filters.category ? all.filter(([, v]) => v.category === filters.category) : all
    return filtered.map(([k]) => k).filter(Boolean).sort()
  }, [data, filters.category])

  if (!filteredData) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div className="sales-tabs">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); if (tab.id !== 'shopify') setFilters(f => ({ ...f, voucher: '' })) }} className={`stab${activeTab === tab.id ? ' active' : ''}`}>
            {tab.ch && <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.ch[tab.ch], display: 'inline-block', flexShrink: 0 }} />}
            {tab.label}
          </button>
        ))}
      </div>
      {/* Filter bar */}
      <div className="fbar">
        <div className="fbar-inner">
          <select className="fsel" value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value, subCategory: '' }))}>
            <option value="">All Categories</option>{cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="fsel" value={filters.subCategory || ''} onChange={e => setFilters(f => ({ ...f, subCategory: e.target.value }))}>
            <option value="">All Sub-categories</option>{subCats.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="fsel" value={filters.state} onChange={e => setFilters(f => ({ ...f, state: e.target.value }))}>
            <option value="">All States</option>{states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="text" placeholder="Search SKU…" value={filters.sku} onChange={e => setFilters(f => ({ ...f, sku: e.target.value }))} className="fsrch" />
          {activeTab === 'shopify' && <VoucherDropdown voucherList={data?.voucherList || []} selected={filters.voucher} onChange={v => setFilters(f => ({ ...f, voucher: v }))} />}
          <button onClick={() => setFilters(f => ({ ...f, category: '', subCategory: '', state: '', sku: '', subChannel: '', voucher: '' }))} className="fclr">✕ Clear</button>
        </div>
      </div>
      {/* Content */}
      <div className="page-scroll">
        {activeTab === 'all' && <AllTab data={filteredData} />}
        {activeTab === 'shopify' && <ChannelTab data={filteredData} channel="Shopify" filters={filters} setFilters={setFilters} />}
        {activeTab === 'amazon' && <ChannelTab data={filteredData} channel="Amazon" />}
        {activeTab === 'flipkart' && <ChannelTab data={filteredData} channel="Flipkart" />}
        {activeTab === 'blinkit' && <ChannelTab data={filteredData} channel="Blinkit" />}
        {activeTab === 'cred' && <ChannelTab data={filteredData} channel="CRED" />}
        {activeTab === 'instamart' && <ChannelTab data={filteredData} channel="Instamart" />}
        {activeTab === 'zepto' && <ChannelTab data={filteredData} channel="Zepto" />}
        {activeTab === 'myntra' && <ChannelTab data={filteredData} channel="Myntra" />}
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
          { label: 'Gross Revenue', val: fmt(totalRev) },
          { label: 'GST Collected', val: fmt(gstCollected) },
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
export default function App() {
  const [page, setPage] = useState('overview')
  const def = getDefaultDates()
  const [filters, setFilters] = useState({ start: def.start, end: def.end, category: '', subCategory: '', state: '', sku: '', subChannel: '', voucher: '' })
  const [rawRows, setRawRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const API = import.meta.env.VITE_API_URL || ''
  const reqIdRef = useRef(0)

  const fetchData = useCallback(async (start, end, extraFilters = {}) => {
    const reqId = ++reqIdRef.current
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API}/api/bq`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start, end, ...extraFilters }) })
      if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
      const json = await res.json()
      if (reqId !== reqIdRef.current) return // stale response, ignore
      setRawRows(json.source === 'postgres-aggregated' ? json : (json.totalRev !== undefined ? json : (json.rows || [])))
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
      const { start, end, category, subCategory, state, sku, subChannel, voucher } = filtersRef.current
      const extra = {}
      if (category) extra.category = category
      if (subCategory) extra.subCategory = subCategory
      if (state) extra.state = state
      if (sku) extra.sku = sku
      if (subChannel) extra.subChannel = subChannel
      if (voucher) extra.voucher = voucher
      fetchData(start, end, extra)
    }, 600)
    return () => clearTimeout(debounceRef.current)
  }, [filters.start, filters.end, filters.category, filters.subCategory, filters.state, filters.sku, filters.subChannel, filters.voucher, fetchData])

  const data = useMemo(() => { if (!rawRows) return null; if (rawRows.source === 'postgres-aggregated' || rawRows.totalRev !== undefined) return rawRows; return processData(rawRows) }, [rawRows])
  const alerts = useMemo(() => data ? detectAlerts(data) : [], [data])

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} />
      <div className="app-main">
        <Topnav page={page} alerts={alerts} onRefresh={() => { const { start, end, category, state, orderStatus } = filters; const e = {}; if (category) e.category = category; if (state) e.state = state; if (orderStatus) e.orderStatus = orderStatus; fetchData(start, end, e) }} loading={loading} filters={filters} setFilters={setFilters} rawRows={rawRows} />
        {loading && (
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
          {!data && !loading && !error && (
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
          {loading && !data && <Skeleton />}
          {page === 'overview' && data && (
            <div className="page-scroll">
              <OverviewPage data={data} alerts={alerts} />
            </div>
          )}
          {page === 'sales' && data && <SalesPage data={data} filters={filters} setFilters={setFilters} />}
          {page === 'intelligence' && (
            <div className="page-scroll">
              <IntelPage data={data} />
            </div>
          )}
        </div>
      </div>
      <BottomNav page={page} setPage={setPage} />
    </div>
  )
}
