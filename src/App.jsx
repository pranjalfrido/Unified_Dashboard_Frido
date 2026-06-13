import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { C, fmt, fmtN, pct, processData, detectAlerts, exportCSV, getDefaultDates } from './utils.js'
import { KPICard, AlertCard, HBar, DataTable, Card, Badge, RevTrendChart, AreaTrendChart, MultiLineChart } from './components.jsx'

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
  const { totalRev, totalExcRev, gstCollected, nOrders, totalQty, blendedAOV, nDays, chMap, catMap, stateMap, nCusts, repeatCusts, dailyArr, orders } = data
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
  const htOrders = orders.filter(o => o.rev >= 10000)
  const htRev = htOrders.reduce((s, o) => s + o.rev, 0)

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
        <KPICard center label="Orders / Units" value={fmtN(nOrders)} sub={`${fmtN(totalQty)} units · ${(totalQty / (nOrders || 1)).toFixed(1)}/order`} />
        <KPICard center label="Blended AOV" value={`₹${Math.round(blendedAOV).toLocaleString('en-IN')}`} sub={`Best: ${bestAOV.ch} ₹${Math.round(bestAOV.aov).toLocaleString('en-IN')}`} />
        <KPICard center label="Unique Customers" value={fmtN(nCusts)} sub={`${repeatRate}% repeat`} />
      </div>

      {/* 9 KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9,1fr)', gap: 10 }}>
        <KPICard label="Daily avg revenue" value={fmt(totalRev / nDays)} sub={`${nDays} days`} />
        <KPICard label="D2C Share" value={`${d2cPct}%`} sub={`Shopify ${fmt(shopifyRev)}`} />
        <KPICard label="Q-commerce Share" value={pct(qcRev, totalRev)} sub={`${fmt(qcRev)} · Blinkit+Instamart+Zepto`} />
        <KPICard label="Marketplace Share" value={`${(100 - parseFloat(d2cPct) - parseFloat(pct(qcRev, totalRev))).toFixed(1)}%`} sub={`Amazon+Flipkart+others ${fmt(totalRev - shopifyRev - qcRev)}`} />
        <KPICard label="Repeat rate" value={`${repeatRate}%`} sub={`${fmtN(repeatCusts)} of ${fmtN(nCusts)} cust.`} />
        <KPICard label="Multi-item rate" value={pct(orders.filter(o => o.items > 1).length, nOrders)} sub="+AOV premium" />
        <KPICard label="Q-commerce AOV" value={`₹${qcAOV.toLocaleString('en-IN')}`} sub="Blinkit+Instamart+Zepto" />
        <KPICard label="Voucher penetration" value={pct(voucherOrders, nOrders)} sub={`${fmtN(voucherOrders)} orders`} />
        <KPICard label="High-ticket ≥₹10K" value={fmtN(htOrders.length)} sub={fmt(htRev)} />
      </div>

      {/* Trend + Channels */}
      <div className="g-21">
        <Card title="Revenue trend · daily" note="₹ stacked by channel">
          <RevTrendChart dailyArr={dailyArr} channels={channels} />
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: C.t3, marginBottom: 7 }}>D2C vs Marketplace</div>
            <div className="spbar">
              <div style={{ width: `${d2cPct}%`, background: C.acc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', minWidth: 50 }}>{d2cPct}% D2C</div>
              <div style={{ flex: 1, background: '#B0ADB8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>{mktPct}% Mkt</div>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
              {sortedCh.slice(0, 4).map(([ch, v]) => (
                <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.t2 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.ch[ch] || C.acc, display: 'inline-block' }} />
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
          ]} rows={sortedCh.map(([ch, v]) => ({ ch, rev: v.rev, orders: v.orders, aov: v.orders ? v.rev / v.orders : 0, health: ch === 'Blinkit' ? 'GST flag' : ch === 'CRED' ? 'Feed gap' : 'Healthy' }))} />
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

function AllTab({ data }) {
  const { totalRev, totalExcRev, nOrders, totalQty, blendedAOV, nDays, dailyArr, chMap, catMap, subCatMap, stateMap, buckets, bucketRev, rows, orders } = data
  const channels = Object.keys(C.ch).filter(ch => chMap[ch])
  const sortedCh = Object.entries(chMap).sort((a, b) => b[1].rev - a[1].rev)
  const maxChRev = sortedCh[0]?.[1].rev || 1
  const catRows = Object.entries(catMap).map(([k, v]) => ({ name: k, rev: v.rev, excRev: v.excRev, orders: v.orders.size, units: v.units, aov: v.orders.size ? v.rev / v.orders.size : 0 })).sort((a, b) => b.rev - a.rev)
  const subCatRows = Object.entries(subCatMap).map(([k, v]) => ({ name: k, rev: v.rev, orders: v.orders.size, aov: v.orders.size ? v.rev / v.orders.size : 0 })).sort((a, b) => b.rev - a.rev).slice(0, 25)
  const stateRows = Object.entries(stateMap).map(([k, v]) => ({ state: k, rev: v.rev, orders: v.orders, aov: v.orders ? v.rev / v.orders : 0, cities: v.cities.size })).sort((a, b) => b.rev - a.rev).slice(0, 15)
  const bucketData = Object.entries(buckets).map(([k, v]) => ({ name: k, orders: v, rev: bucketRev[k] }))
  const allCats = catRows.slice(0, 8).map(r => r.name)
  const heatData = allCats.map(cat => {
    const row = { cat }
    channels.forEach(ch => { row[ch] = rows.filter(r => r.Category === cat && r.Channel === ch).reduce((s, r) => s + parseFloat(r.SellingPrice_Inc_GST || 0), 0) })
    return row
  })
  const maxHeat = Math.max(...heatData.flatMap(r => channels.map(ch => r[ch] || 0)), 1)

  const grossMarginPct = totalRev > 0 ? ((totalRev - totalExcRev) / totalRev * 100) : 0
  const revPerUnit = totalQty > 0 ? totalRev / totalQty : 0
  const shopifyOrders = orders.filter(o => o.channel === 'Shopify')
  const rtoRev = shopifyOrders.filter(o => o.isRTO).reduce((s, o) => s + o.rev, 0)
  const cancelRev = shopifyOrders.filter(o => o.isCancelled).reduce((s, o) => s + o.rev, 0)
  const atRiskRev = rtoRev + cancelRev
  const deliveredCount = orders.filter(o => o.orderStatus === 'Delivered').length
  const rtoCount = orders.filter(o => o.orderStatus === 'RTO' || o.isRTO).length
  const cancelCount = orders.filter(o => o.orderStatus === 'Cancelled' || o.isCancelled).length
  const fulfilmentBase = deliveredCount + rtoCount + cancelCount
  const fulfilmentRate = fulfilmentBase > 0 ? (deliveredCount / fulfilmentBase * 100) : 0
  const unitsPerOrder = nOrders > 0 ? totalQty / nOrders : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="g-kpi5">
        <KPICard label="Gross Revenue" value={fmt(totalRev)} sub={`${nDays} days`} />
        <KPICard label="Net (Exc GST)" value={fmt(totalExcRev)} />
        <KPICard label="Orders / Units" value={fmtN(nOrders)} sub={`${fmtN(totalQty)} units`} />
        <KPICard label="Blended AOV" value={`₹${Math.round(blendedAOV).toLocaleString('en-IN')}`} />
        <KPICard label="Daily Avg" value={fmt(totalRev / nDays)} />
      </div>
      <div className="g-kpi5">
        <KPICard label="Gross Margin %" value={`${grossMarginPct.toFixed(1)}%`} sub={`GST ${fmt(totalRev - totalExcRev)} of revenue`} accent={grossMarginPct < 15 ? '#7A1A1A' : undefined} />
        <KPICard label="Revenue per Unit" value={`₹${Math.round(revPerUnit).toLocaleString('en-IN')}`} sub={`Avg selling price per SKU sold`} />
        <KPICard label="Revenue at Risk" value={fmt(atRiskRev)} sub={`RTO + Cancelled (Shopify)`} accent={atRiskRev > 0 ? '#7A4000' : undefined} />
        <KPICard label="Fulfilment Rate" value={fulfilmentBase > 0 ? `${fulfilmentRate.toFixed(1)}%` : 'N/A'} sub={`${fmtN(deliveredCount)} delivered of ${fmtN(fulfilmentBase)}`} accent={fulfilmentRate < 80 && fulfilmentBase > 0 ? '#7A1A1A' : fulfilmentRate >= 90 ? '#286010' : undefined} />
        <KPICard label="Units per Order" value={unitsPerOrder.toFixed(2)} sub={`Avg basket size`} />
      </div>
      <div className="g-21">
        <Card title="Daily Revenue by Channel">
          <MultiLineChart dailyArr={dailyArr} channels={channels} />
        </Card>
        <Card title="Channel Share">
          {sortedCh.map(([ch, v]) => <HBar key={ch} dot={C.ch[ch] || C.acm} label={ch} width={(v.rev / maxChRev) * 100} value={fmt(v.rev)} pctVal={pct(v.rev, totalRev)} />)}
        </Card>
      </div>
      <Card title="Daily Orders by Channel">
        <div className="tbl-wrap">
          <DataTable columns={[{ key: 'date', label: 'Date' }, ...channels.map(ch => ({ key: ch + '_o', label: ch, align: 'right', render: v => fmtN(v || 0) })), { key: 'total', label: 'Total', align: 'right', render: v => fmtN(v) }]}
            rows={dailyArr.map(d => ({ ...d, total: channels.reduce((s, ch) => s + (d[ch + '_o'] || 0), 0) }))} />
        </div>
      </Card>
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
                      const v = row[ch] || 0, intensity = v / maxHeat
                      const cls = intensity === 0 ? 'h0' : intensity < 0.2 ? 'h1' : intensity < 0.5 ? 'h2' : intensity < 0.8 ? 'h3' : 'h4'
                      return <td key={ch} className={cls} style={{ padding: '5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11 }}>{v > 0 ? fmt(v) : '—'}</td>
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
      <div className="g-2">
        <Card title="Category Revenue">
          <DataTable columns={[{ key: 'name', label: 'Category' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'excRev', label: 'Exc GST', align: 'right', render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }]} rows={catRows} />
        </Card>
        <Card title="Top Sub-categories">
          <DataTable columns={[{ key: 'name', label: 'Sub-category' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }]} rows={subCatRows} />
        </Card>
      </div>
      <div className="g-2">
        <Card title="Top States">
          <DataTable columns={[{ key: 'state', label: 'State' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }, { key: 'cities', label: 'Cities' }]} rows={stateRows} />
        </Card>
        <Card title="Order Value Distribution">
          <DataTable columns={[{ key: 'name', label: 'Bucket' }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'pct', label: '%', render: (_, r) => pct(r.rev, totalRev) }]} rows={bucketData} />
        </Card>
      </div>
    </div>
  )
}

function ChannelTab({ data, channel }) {
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
      <div className="g-kpi5">
        <KPICard label="Gross Margin %" value={`${grossMarginPct.toFixed(1)}%`} sub="GST as % of revenue" accent={grossMarginPct < 15 ? '#7A1A1A' : undefined} />
        <KPICard label="Revenue per Unit" value={`₹${Math.round(revPerUnit).toLocaleString('en-IN')}`} sub="Avg price per SKU" />
        <KPICard label="Revenue at Risk" value={channel === 'Shopify' ? fmt(chRTORev) : 'N/A'} sub="RTO + Cancelled" accent={chRTORev > 0 ? '#7A4000' : undefined} />
        <KPICard label="Fulfilment Rate" value={fulfilBase > 0 ? `${fulfilRate.toFixed(1)}%` : 'N/A'} sub={fulfilBase > 0 ? `${fmtN(deliveredCh)} of ${fmtN(fulfilBase)}` : 'No status data'} accent={fulfilRate < 80 && fulfilBase > 0 ? '#7A1A1A' : fulfilRate >= 90 ? '#286010' : undefined} />
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
  const statusCounts = {}
  data.orders.forEach(o => { const s = o.orderStatus || 'Unknown'; statusCounts[s] = (statusCounts[s] || 0) + 1 })
  const tatBuckets = [{ label: 'Same day', min: 0, max: 0 }, { label: '1-2 days', min: 1, max: 2 }, { label: '3-5 days', min: 3, max: 5 }, { label: '6-7 days', min: 6, max: 7 }, { label: '8-14 days', min: 8, max: 14 }, { label: '15+ days', min: 15, max: Infinity }].map(b => ({ ...b, count: tatArr.filter(d => d >= b.min && d <= b.max).length }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="g-kpi5">
        <KPICard label="Avg Delivery TAT" value={`${avgTAT.toFixed(1)}d`} />
        <KPICard label="Orders Tracked" value={fmtN(tatArr.length)} />
        <KPICard label="Delayed >7d" value={fmtN(delayed)} sub={tatArr.length ? pct(delayed, tatArr.length) : '—'} />
        <KPICard label="Total Orders" value={fmtN(data.nOrders)} />
        <KPICard label="Cities Covered" value={fmtN([...new Set(data.orders.map(o => o.city).filter(Boolean))].length)} />
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
  const filteredData = useMemo(() => {
    if (!data) return data
    let rows = data.rows
    if (filters.category) rows = rows.filter(r => r.Category === filters.category)
    if (filters.state) rows = rows.filter(r => (r.State || '').toUpperCase() === filters.state.toUpperCase())
    if (filters.sku) rows = rows.filter(r => (r.ProductId || '').toLowerCase().includes(filters.sku.toLowerCase()))
    if (rows === data.rows) return data
    return processData(rows)
  }, [data, filters.category, filters.state, filters.sku])

  const cats = useMemo(() => [...new Set((data?.rows || []).map(r => r.Category).filter(Boolean))].sort(), [data])
  const states = useMemo(() => [...new Set((data?.rows || []).map(r => r.State).filter(Boolean))].sort(), [data])

  if (!filteredData) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div className="sales-tabs">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`stab${activeTab === tab.id ? ' active' : ''}`}>
            {tab.ch && <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.ch[tab.ch], display: 'inline-block', flexShrink: 0 }} />}
            {tab.label}
          </button>
        ))}
      </div>
      {/* Filter bar */}
      <div className="fbar">
        <div className="fbar-inner">
          <select className="fsel" value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
            <option value="">All Categories</option>{cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="fsel" value={filters.orderStatus} onChange={e => setFilters(f => ({ ...f, orderStatus: e.target.value }))}>
            <option value="">All Statuses</option><option>Delivered</option><option>Dispatched</option><option>RTO</option><option>Cancelled</option>
          </select>
          <select className="fsel" value={filters.state} onChange={e => setFilters(f => ({ ...f, state: e.target.value }))}>
            <option value="">All States</option>{states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="text" placeholder="Search SKU…" value={filters.sku} onChange={e => setFilters(f => ({ ...f, sku: e.target.value }))} className="fsrch" />
          <button onClick={() => setFilters(f => ({ ...f, category: '', orderStatus: '', state: '', sku: '' }))} className="fclr">✕ Clear</button>
        </div>
      </div>
      {/* Content */}
      <div className="page-scroll">
        {activeTab === 'all' && <AllTab data={filteredData} />}
        {activeTab === 'shopify' && <ChannelTab data={filteredData} channel="Shopify" />}
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
  const [filters, setFilters] = useState({ start: def.start, end: def.end, category: '', orderStatus: '', state: '', sku: '' })
  const [rawRows, setRawRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const API = import.meta.env.VITE_API_URL || ''

  const fetchData = useCallback(async (start, end) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API}/api/bq`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start, end }) })
      if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
      const json = await res.json()
      setRawRows(json.rows || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [API])

  const debounceRef = useRef(null)
  useEffect(() => {
    if (!filters.start || !filters.end) return
    setRawRows(null)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchData(filters.start, filters.end), 600)
    return () => clearTimeout(debounceRef.current)
  }, [filters.start, filters.end, fetchData])

  const data = useMemo(() => rawRows ? processData(rawRows) : null, [rawRows])
  const alerts = useMemo(() => data ? detectAlerts(data) : [], [data])

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} />
      <div className="app-main">
        <Topnav page={page} alerts={alerts} onRefresh={() => fetchData(filters.start, filters.end)} loading={loading} filters={filters} setFilters={setFilters} rawRows={rawRows} />
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
