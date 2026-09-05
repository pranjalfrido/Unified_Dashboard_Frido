import { useState, useEffect, useRef, useMemo, Fragment, useCallback } from 'react'
import { C, fmt, fmtN, exportCSV } from '../utils.js'
import {
  Card, QtyRevToggle, returnBadge, ReturnBreakdownTable, useSortableTable,
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from '../components.jsx'

// Stat tile per the dataviz skill's contract: label (sentence case, no colon) · value (semibold,
// proportional figures — never tabular-nums on a standalone number) · delta (signed, colored by
// direction). A 3px color bar on the left edge is the ONLY color the tile carries on its own
// chrome — it identifies which chart line this number belongs to without putting color on the
// text itself (text stays in ink tokens per marks-and-anatomy.md's "text never wears the data
// color" rule). No card border/fill — these sit directly on the trend card's own surface.
function TrendStatTile({ label, value, badge, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, minWidth: 0 }}>
      <div style={{ width: 3, borderRadius: 2, background: color, flexShrink: 0, alignSelf: 'stretch' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 11, color: C.t3, whiteSpace: 'nowrap' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'nowrap', overflow: 'hidden' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.t1, letterSpacing: '-.01em', whiteSpace: 'nowrap' }}>{value}</span>
          <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{badge}</span>
        </div>
      </div>
    </div>
  )
}

// Return-metrics trend chart — single ComposedChart, dual y-axis: left = Revenue (₹), right =
// the 5 return-rate lines (%) — same pairing convention as D2C Overview's own "Revenue & Returns
// Trend" chart (App.jsx ~line 6008-6050).
function ReturnTrendChart({ kpis, dailyTrend }) {
  const [groupBy, setGroupBy] = useState('daily')
  const raw = (dailyTrend || []).map(d => ({ date: d.date, revenue: d.revenue, cancelPct: d.cancelPct, rtoPct: d.rtoPct, cirPct: d.cirPct, exchangePct: d.exchangePct, totalReturnPct: d.totalReturnPct }))
  const grouped = useMemo(() => {
    if (groupBy === 'daily') return raw
    const buckets = {}
    raw.forEach(d => {
      const key = groupBy === 'weekly'
        ? (() => { const dt = new Date(d.date); const day = dt.getDay(); const diff = dt.getDate() - day + (day === 0 ? -6 : 1); return new Date(dt.setDate(diff)).toISOString().slice(0, 10) })()
        : d.date.slice(0, 7)
      if (!buckets[key]) buckets[key] = { date: key, revenue: 0, cancelPct: 0, rtoPct: 0, cirPct: 0, exchangePct: 0, totalReturnPct: 0, _n: 0 }
      buckets[key].revenue += d.revenue
      buckets[key].cancelPct += d.cancelPct; buckets[key].rtoPct += d.rtoPct; buckets[key].cirPct += d.cirPct
      buckets[key].exchangePct += d.exchangePct; buckets[key].totalReturnPct += d.totalReturnPct; buckets[key]._n += 1
    })
    return Object.values(buckets).map(b => ({ ...b, cancelPct: b.cancelPct / b._n, rtoPct: b.rtoPct / b._n, cirPct: b.cirPct / b._n, exchangePct: b.exchangePct / b._n, totalReturnPct: b.totalReturnPct / b._n })).sort((a, b) => a.date.localeCompare(b.date))
  }, [raw, groupBy])
  const xFmt = d => groupBy === 'daily' ? d?.slice(5) : groupBy === 'monthly' ? d?.slice(0, 7) : d

  const revChg = kpis && kpis.prevTotalRevenue > 0 ? ((kpis.totalRevenue - kpis.prevTotalRevenue) / kpis.prevTotalRevenue * 100) : null

  return (
    <Card title="Return Metrics Trend" style={{ height: 420, display: 'flex', flexDirection: 'column' }} action={
      <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
        {['daily', 'weekly', 'monthly'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
      </select>
    }>
      {kpis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8, marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <TrendStatTile label="Revenue" value={fmt(kpis.totalRevenue)} color="#E0B800"
            badge={revChg !== null && <span style={{ fontSize: 10, fontWeight: 700, color: revChg >= 0 ? C.green.tx : C.red.tx }}>{revChg >= 0 ? '▲' : '▼'} {Math.abs(revChg).toFixed(1)}%</span>} />
          <TrendStatTile label="Return %" value={`${kpis.returnPct.toFixed(1)}%`} color="#E24B4A" badge={returnBadge(kpis.returnPct, kpis.prevReturnPct)} />
          <TrendStatTile label="Cancel %" value={`${kpis.cancelPct.toFixed(1)}%`} color="#B91C1C" badge={returnBadge(kpis.cancelPct, kpis.prevCancelPct)} />
          <TrendStatTile label="RTO %" value={`${kpis.rtoPct.toFixed(1)}%`} color="#CC8A00" badge={returnBadge(kpis.rtoPct, kpis.prevRtoPct)} />
          <TrendStatTile label="CIR %" value={`${kpis.cirPct.toFixed(1)}%`} color="#2E74CC" badge={returnBadge(kpis.cirPct, kpis.prevCirPct)} />
          <TrendStatTile label="Exchange %" value={`${kpis.exchangePct.toFixed(1)}%`} color="#9B59B6" badge={returnBadge(kpis.exchangePct, kpis.prevExchangePct)} />
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%" minHeight={240}>
          <ComposedChart data={grouped} margin={{ top: 4, right: 20, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="raRevGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#E0B800" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#E0B800" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={xFmt} />
            <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => fmt(v)} width={54} />
            <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => `${v.toFixed(1)}%`} width={40} />
            <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
                <div style={{ fontWeight: 700, marginBottom: 4, color: C.t1 }}>{xFmt(label)}</div>
                {payload.map(p => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ color: C.t2 }}>{p.name}: {p.dataKey === 'revenue' ? fmt(p.value) : `${Number(p.value).toFixed(1)}%`}</span>
                  </div>
                ))}
              </div>
            ) : null} />
            <Legend wrapperStyle={{ fontSize: 11, color: C.t1 }} />
            <Area yAxisId="rev" type="monotone" dataKey="revenue" name="Revenue" stroke="#E0B800" fill="url(#raRevGrad)" strokeWidth={2} dot={false} />
            <Line yAxisId="pct" type="monotone" dataKey="totalReturnPct" name="Return % (Overall)" stroke="#E24B4A" strokeWidth={2} dot={false} />
            <Line yAxisId="pct" type="monotone" dataKey="cancelPct" name="Cancellation %" stroke="#B91C1C" strokeWidth={1.5} dot={false} strokeDasharray="6 2" />
            <Line yAxisId="pct" type="monotone" dataKey="rtoPct" name="RTO %" stroke="#CC8A00" strokeWidth={1.5} dot={false} />
            <Line yAxisId="pct" type="monotone" dataKey="cirPct" name="CIR %" stroke="#2E74CC" strokeWidth={1.5} dot={false} strokeDasharray="3 2" />
            <Line yAxisId="pct" type="monotone" dataKey="exchangePct" name="Exchange %" stroke="#9B59B6" strokeWidth={1.5} dot={false} strokeDasharray="3 2" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

// Ranked list of all products by revenue lost to returns — modeled on CategoryRevenueCard's HBar
// row list (components.jsx). Uniform styling top to bottom (no top-3 accent) since a search box
// lets the reader find any product directly — the accent added visual noise without adding
// information a plain rank number + sorted order didn't already convey.
function TopReturnedProductsCard({ topProducts, paymentTypeOpts, paymentType, setPaymentType, basis, setBasis }) {
  const [search, setSearch] = useState('')
  const allRows = topProducts || []
  const rows = search ? allRows.filter(r => r.subCategory.toLowerCase().includes(search.toLowerCase()) || r.category.toLowerCase().includes(search.toLowerCase())) : allRows
  const maxVal = Math.max(...allRows.map(r => basis === 'qty' ? r.returnQtyLost : r.returnRevLost), 1)
  return (
    <Card fill title="Top Products · High Returns" titleNoWrap style={{ height: 420 }} action={
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={paymentType} onChange={e => setPaymentType(e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
          <option value="">Payment Type</option>
          {paymentTypeOpts.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <QtyRevToggle value={basis} onChange={setBasis} />
      </div>
    }>
      <div style={{ height: '100%', overflowY: 'auto' }}>
        {rows.length === 0 && <div style={{ fontSize: 12, color: C.t3, textAlign: 'center', padding: '20px 0' }}>No return data</div>}
        {rows.map((r, i) => {
          const val = basis === 'qty' ? r.returnQtyLost : r.returnRevLost
          return (
            <div key={`${r.category}::${r.subCategory}`} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 6px', borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700, background: C.bg, color: C.t2 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.subCategory}>{r.subCategory}</div>
                <div style={{ fontSize: 10, color: C.t3 }}>{r.category} · {r.returnPct.toFixed(1)}% of gross rev</div>
              </div>
              <div className="hb-track" style={{ width: 60, flexShrink: 0 }}><div className="hb-fill" style={{ width: `${(val / maxVal) * 100}%`, background: C.acc }} /></div>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)', flexShrink: 0, minWidth: 62, textAlign: 'right' }}>{basis === 'qty' ? `${fmtN(val)} units` : fmt(val)}</span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

const REASON_COLORS = ['#534AB7', '#0D9E68', '#2E74CC', '#CC8A00', '#CC4078', '#E24B4A', '#9B59B6', '#FF6B35']

// Payment Type-wise Return Breakdown, transposed — payment types (Prepaid/COD/PPCOD) run across
// as columns, metrics (Revenue/Cancel%/RTO%/CIR%/Exchange%/Total Return%) run down as rows. Only
// 2-4 payment types typically exist, so this reads better as a compact metric-by-type grid than
// ReturnBreakdownTable's default many-rows/fixed-columns shape — a dedicated small table instead
// of forcing that generic component to transpose.
function PaymentTypeTransposedTable({ paymentTypeTable, basis, setBasis }) {
  const rows = useMemo(() => paymentTypeTable || [], [paymentTypeTable])
  const pctSuffix = basis === 'qty' ? 'PctQty' : 'Pct'
  const RED_THRESH = { cancelPct: 3, rtoPct: 9, cirPct: 9, exchangePct: 6, totalReturnPct: 20 }

  // Blended "Overall" column — weighted by each payment type's own revenue/qty (basis-dependent
  // denominator), not a plain average of the per-type percentages, so it reconciles with the
  // page's own Return %/Cancel %/etc. KPIs the same way a DAX measure would re-aggregate.
  const overall = useMemo(() => {
    const denomKey = basis === 'qty' ? 'qty' : 'revenue'
    const totalDenom = rows.reduce((s, r) => s + (r[denomKey] || 0), 0)
    const weighted = pctKey => totalDenom > 0 ? rows.reduce((s, r) => s + (r[denomKey] || 0) * (r[`${pctKey}${pctSuffix}`] || 0), 0) / totalDenom : 0
    return {
      paymentType: 'Overall',
      revenue: rows.reduce((s, r) => s + (r.revenue || 0), 0),
      qty: rows.reduce((s, r) => s + (r.qty || 0), 0),
      [`cancel${pctSuffix}`]: weighted('cancel'),
      [`rto${pctSuffix}`]: weighted('rto'),
      [`cir${pctSuffix}`]: weighted('cir'),
      [`exchange${pctSuffix}`]: weighted('exchange'),
      [`totalReturn${pctSuffix}`]: weighted('totalReturn'),
    }
  }, [rows, basis, pctSuffix])

  const metricRows = [
    { key: 'revenue', label: basis === 'qty' ? 'Qty' : 'Revenue', fmt: r => basis === 'qty' ? fmtN(r.qty) : fmt(r.revenue), mono: true, bold: true },
    { key: 'cancelPct', label: 'Cancel %', fmt: r => `${(r[`cancel${pctSuffix}`] || 0).toFixed(1)}%` },
    { key: 'rtoPct', label: 'RTO %', fmt: r => `${(r[`rto${pctSuffix}`] || 0).toFixed(1)}%` },
    { key: 'cirPct', label: 'CIR %', fmt: r => `${(r[`cir${pctSuffix}`] || 0).toFixed(1)}%` },
    { key: 'exchangePct', label: 'Exchange %', fmt: r => `${(r[`exchange${pctSuffix}`] || 0).toFixed(1)}%` },
    { key: 'totalReturnPct', label: 'Total Return %', fmt: r => `${(r[`totalReturn${pctSuffix}`] || 0).toFixed(1)}%`, bold: true },
  ]
  const cellColor = (m, r) => {
    if (!RED_THRESH[m.key]) return C.t1
    const v = r[`${m.key.replace('Pct', '')}${pctSuffix}`]
    return (v || 0) > RED_THRESH[m.key] ? '#B91C1C' : C.t1
  }
  const thStyle = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: C.t3, padding: '3px 8px 7px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', whiteSpace: 'nowrap' }
  const rowLabelStyle = { fontSize: 10.5, fontWeight: 600, color: C.t3, textTransform: 'uppercase', letterSpacing: '.03em', padding: '6px 8px 6px 0', whiteSpace: 'nowrap' }

  return (
    <Card title="Payment Type-wise Return Breakdown" action={<QtyRevToggle value={basis} onChange={setBasis} />}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left' }}>Metric</th>
              <th style={{ ...thStyle, color: C.t1, borderRight: `1px solid ${C.border}` }}>Overall</th>
              {rows.map(r => <th key={r.paymentType} style={{ ...thStyle, color: C.t1 }}>{r.paymentType}</th>)}
            </tr>
          </thead>
          <tbody>
            {metricRows.map((m, i) => (
              <tr key={m.key} style={{ borderBottom: i < metricRows.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <td style={rowLabelStyle}>{m.label}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: m.mono ? 'var(--mono)' : 'inherit', fontSize: m.mono ? 11.5 : 12, fontWeight: 700, color: cellColor(m, overall), whiteSpace: 'nowrap', borderRight: `1px solid ${C.border}` }}>
                  {m.fmt(overall)}
                </td>
                {rows.map(r => (
                  <td key={r.paymentType} style={{ padding: '6px 8px', textAlign: 'right', fontFamily: m.mono ? 'var(--mono)' : 'inherit', fontSize: m.mono ? 11.5 : 12, fontWeight: m.bold ? 700 : 400, color: cellColor(m, r), whiteSpace: 'nowrap' }}>
                    {m.fmt(r)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={2 + rows.length} style={{ padding: '20px 5px', textAlign: 'center', color: C.t3 }}>No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

const CAT_COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316','#6366F1','#84CC16','#06B6D4','#A855F7']

// Stacked bar chart: X = last 6 months (fixed, ignores date picker).
// Bars stacked by category. Dropdown to filter by sub-category (or All).
function CancelBucketChart({ cancelByBucket }) {
  const [selectedSubCats, setSelectedSubCats] = useState([]) // [] = All
  const [dropOpen, setDropOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState(null)
  const dropRef = useRef(null)
  const searchRef = useRef(null)

  useEffect(() => {
    const h = e => { if (dropRef.current && !dropRef.current.contains(e.target)) { setDropOpen(false); setPending(null); setSearch('') } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => { if (dropOpen) searchRef.current?.focus({ preventScroll: true }) }, [dropOpen])

  const { months, keys, subCatOptions } = useMemo(() => {
    if (!cancelByBucket?.length) return { months: [], keys: [], subCatOptions: [] }
    const monthMap = {}
    const catTotals = {}
    const subCatSet = new Set()
    cancelByBucket.forEach(r => {
      monthMap[r.monthDt] = r.month
      catTotals[r.category] = (catTotals[r.category] || 0) + r.cancelCount
      subCatSet.add(r.subCategory)
    })
    const months = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0])).map(([, l]) => l)
    const keys = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).map(([k]) => k)
    const subCatOptions = ['All', ...Array.from(subCatSet).sort()]
    return { months, keys, subCatOptions }
  }, [cancelByBucket])

  const chartData = useMemo(() => {
    if (!cancelByBucket?.length || !months.length) return []
    return months.map(month => {
      const row = { month, _buckets: { '0-1': 0, '2-4': 0, '5-7': 0, '8-10': 0, '10+': 0 } }
      keys.forEach(k => { row[k] = 0 })
      cancelByBucket
        .filter(r => r.month === month && (selectedSubCats.length === 0 || selectedSubCats.includes(r.subCategory)))
        .forEach(r => {
          row[r.category] = (row[r.category] || 0) + r.cancelCount
          row._buckets[r.bucket] = (row._buckets[r.bucket] || 0) + r.cancelCount
        })
      return row
    })
  }, [cancelByBucket, months, keys, selectedSubCats])

  const staged = pending !== null ? pending : selectedSubCats
  const filteredOpts = subCatOptions.filter(o => o.toLowerCase().includes(search.toLowerCase()))
  const triggerLabel = selectedSubCats.length === 0 ? 'All Sub-categories' : selectedSubCats.length === 1 ? selectedSubCats[0] : `${selectedSubCats[0]} +${selectedSubCats.length - 1}`

  return (
    <Card title="Cancellation · Days Since Order" action={
      <div ref={dropRef} style={{ position: 'relative', flexShrink: 0 }}>
        <div onClick={() => { setPending(null); setDropOpen(v => !v) }} className="fsel" style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', minWidth: 120, background: selectedSubCats.length > 0 ? '#FFF9CC' : undefined, borderColor: selectedSubCats.length > 0 ? C.acm : undefined }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5 }}>{triggerLabel}</span>
          <span style={{ fontSize: 8, color: C.t3, flexShrink: 0 }}>▼</span>
        </div>
        {dropOpen && (
          <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 200, background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, boxShadow: '0 8px 28px rgba(0,0,0,.14)', width: 200 }}>
            <div style={{ padding: '7px 8px', borderBottom: `1px solid ${C.border}` }}>
              <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} onMouseDown={e => e.stopPropagation()} placeholder="Search sub-categories…" style={{ width: '100%', fontSize: 11.5, padding: '4px 8px', border: `1px solid ${C.border2}`, borderRadius: 6, outline: 'none', fontFamily: 'var(--font)', background: C.bg, boxSizing: 'border-box' }} />
            </div>
            <div style={{ maxHeight: 100, overflowY: 'auto' }}>
              {filteredOpts.map(opt => {
                const active = staged.includes(opt)
                return (
                  <div key={opt} onClick={() => setPending(active ? staged.filter(x => x !== opt) : [...staged, opt])} style={{ padding: '5px 10px', fontSize: 11.5, cursor: 'pointer', background: active ? C.acl : undefined, color: active ? C.t1 : C.t2, fontWeight: active ? 600 : 400, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 13, height: 13, borderRadius: 3, border: `1.5px solid ${active ? C.acm : C.border2}`, background: active ? C.acm : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{active && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1 }}>✓</span>}</span>
                    {opt}
                  </div>
                )
              })}
              {filteredOpts.length === 0 && <div style={{ padding: 10, fontSize: 11.5, color: C.t3, textAlign: 'center' }}>No results</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, padding: 8, borderTop: `1px solid ${C.border}` }}>
              <button onMouseDown={e => e.stopPropagation()} onClick={() => { setPending([]); }} style={{ flex: 1, fontSize: 11.5, fontWeight: 600, padding: '5px 0', borderRadius: 6, border: `1.5px solid ${C.border2}`, background: 'transparent', color: C.t2, cursor: 'pointer', fontFamily: 'var(--font)' }}>Clear</button>
              <button onMouseDown={e => e.stopPropagation()} onClick={() => setPending(filteredOpts)} style={{ flex: 1, fontSize: 11.5, fontWeight: 600, padding: '5px 0', borderRadius: 6, border: `1.5px solid ${C.border2}`, background: 'transparent', color: C.t2, cursor: 'pointer', fontFamily: 'var(--font)' }}>Select All</button>
              <button onMouseDown={e => e.stopPropagation()} onClick={() => { setSelectedSubCats(pending !== null ? pending : staged); setPending(null); setDropOpen(false); setSearch('') }} style={{ flex: 1, fontSize: 11.5, fontWeight: 700, padding: '5px 0', borderRadius: 6, border: 'none', background: C.t1, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)' }}>Apply</button>
            </div>
          </div>
        )}
      </div>
    }>
      {chartData.length === 0 ? (
        <div style={{ fontSize: 12, color: C.t3, textAlign: 'center', padding: '30px 0' }}>No cancellation data</div>
      ) : (
        <div>
          <ResponsiveContainer width="100%" height={175}>
            <BarChart data={chartData} margin={{ top: 0, right: 4, bottom: 10, left: 0 }} barCategoryGap="25%">
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: C.t3 }} />
              <YAxis tick={{ fontSize: 9, fill: C.t3 }} width={42} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const buckets = payload[0]?.payload?._buckets || {}
                  const total = Object.values(buckets).reduce((s, v) => s + v, 0)
                  const BCOLS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6']
                  return (
                    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, color: C.t1 }}>{label} · {fmtN(total)} cancellations</div>
                      {['0-1','2-4','5-7','8-10','10+'].map((b, i) => (
                        <div key={b} style={{ display: 'flex', gap: 6, alignItems: 'center', color: C.t2 }}>
                          <span style={{ width: 7, height: 7, borderRadius: 2, background: BCOLS[i], flexShrink: 0 }} />
                          <span style={{ flex: 1 }}>{b} days:</span>
                          <span style={{ fontWeight: 600, color: C.t1 }}>{fmtN(buckets[b] || 0)}</span>
                          <span style={{ color: C.t3 }}>({total ? ((buckets[b] || 0) / total * 100).toFixed(0) : 0}%)</span>
                        </div>
                      ))}
                    </div>
                  )
                }}
              />
              {keys.map((k, i) => (
                <Bar key={k} dataKey={k} name={k} stackId="a" fill={CAT_COLORS[i % CAT_COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

// Detail table of return reasons — grouped by top-level Reason (Count/% Share/Revenue Impact
// aggregated across its sub-reasons), each expandable to its Sub-reason breakdown via the same
// rotating-▶-chevron interaction used elsewhere on this page (ReturnBreakdownTable's variant
// rows, App.jsx's FlatCategoryProductMatrix) — collapses what was a flat 50+ row list down to
// one row per Reason by default.
function ReturnReasonsTable({ returnReasons, height = 420 }) {
  const [expanded, setExpanded] = useState({})
  const totalCount = useMemo(() => (returnReasons || []).reduce((s, r) => s + r.count, 0), [returnReasons])
  const grouped = useMemo(() => {
    const m = {}
    ;(returnReasons || []).forEach(r => {
      if (!m[r.reason]) m[r.reason] = { reason: r.reason, count: 0, revenueImpact: 0, subReasons: [] }
      m[r.reason].count += r.count
      m[r.reason].revenueImpact += r.revenueImpact
      m[r.reason].subReasons.push(r)
    })
    return Object.values(m)
  }, [returnReasons])
  const { sortRows, Th } = useSortableTable('count')
  const sortedRows = sortRows(grouped, { reason: r => r.reason, count: r => r.count, pctShare: r => totalCount ? r.count / totalCount * 100 : 0, revenueImpact: r => r.revenueImpact })
  const thStyle = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }

  return (
    <Card fill title="Return Reasons · Detail">
      <div style={{ overflowY: 'auto', height: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}>
            <tr>
              <Th label="Reason" sortKey="reason" style={thStyle} align="left" />
              <Th label="Count" sortKey="count" style={thStyle} align="right" />
              <Th label="% Share" sortKey="pctShare" style={thStyle} align="right" />
              <Th label="Revenue Impact" sortKey="revenueImpact" style={thStyle} align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r, i) => {
              const isOpen = expanded[r.reason]
              const subs = [...r.subReasons].sort((a, b) => b.count - a.count)
              return (
                <Fragment key={r.reason}>
                  <tr style={{ borderBottom: (i < sortedRows.length - 1 && !isOpen) ? `1px solid ${C.border}` : 'none' }} onMouseEnter={e => e.currentTarget.style.background = '#FFFBE6'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '5.5px 5px', color: C.t1 }}>
                      <span onClick={() => setExpanded(prev => ({ ...prev, [r.reason]: !prev[r.reason] }))} style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                        <span style={{ fontSize: 9, color: C.t3, display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>
                        {r.reason}
                      </span>
                    </td>
                    <td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t1 }}>{fmtN(r.count)}</td>
                    <td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{totalCount ? (r.count / totalCount * 100).toFixed(1) : 0}%</td>
                    <td style={{ padding: '5.5px 5px', textAlign: 'right', fontFamily: 'var(--mono)', color: C.t1 }}>{fmt(r.revenueImpact)}</td>
                  </tr>
                  {isOpen && subs.map((s, si) => (
                    <tr key={s.subReason} style={{ background: C.bg, borderBottom: (si < subs.length - 1 || i < sortedRows.length - 1) ? `1px solid ${C.border}` : 'none' }} onMouseEnter={e => e.currentTarget.style.background = '#FFFBE6'} onMouseLeave={e => e.currentTarget.style.background = C.bg}>
                      <td style={{ padding: '4px 5px', color: C.t3, fontSize: 11, paddingLeft: 22 }}>↳ {s.subReason}</td>
                      <td style={{ padding: '4px 5px', textAlign: 'right', color: C.t2, fontSize: 11 }}>{fmtN(s.count)}</td>
                      <td style={{ padding: '4px 5px', textAlign: 'right', color: C.t3, fontSize: 11 }}>{totalCount ? (s.count / totalCount * 100).toFixed(1) : 0}%</td>
                      <td style={{ padding: '4px 5px', textAlign: 'right', fontFamily: 'var(--mono)', color: C.t2, fontSize: 11 }}>{fmt(s.revenueImpact)}</td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
            {sortedRows.length === 0 && <tr><td colSpan={4} style={{ padding: '20px 5px', textAlign: 'center', color: C.t3 }}>No data</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export default function D2CReturnAnalysisTab({ filters, subCatFirstOrderMap = {} }) {
  const API = import.meta.env.VITE_API_URL || ''
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [topProductsBasis, setTopProductsBasis] = useState('revenue')
  const [topProductsPaymentType, setTopProductsPaymentType] = useState('')
  const [catBasis, setCatBasis] = useState('revenue')
  const [catSearch, setCatSearch] = useState('')
  const [monthBasis, setMonthBasis] = useState('revenue')
  const [payBasis, setPayBasis] = useState('revenue')

  const reqIdRef = useRef(0)
  useEffect(() => {
    if (!filters.start || !filters.end) return
    const reqId = ++reqIdRef.current
    let subCategoryList = filters.subCategory?.length ? [...filters.subCategory] : []
    if (filters.productAge && Object.keys(subCatFirstOrderMap).length) {
      const today = new Date()
      const ageSubs = Object.entries(subCatFirstOrderMap)
        .filter(([, d]) => { const days = (today - new Date(d)) / 86400000; return filters.productAge === 'new' ? days <= 90 : days > 90 })
        .map(([sc]) => sc)
      subCategoryList = ageSubs
    }
    const body = {
      start: filters.start, end: filters.end,
      subChannel: (filters.subChannel === 'MyFrido' || filters.subChannel === 'Mobility') ? filters.subChannel : '',
      category: filters.category?.length ? filters.category.join(',') : undefined,
      subCategory: subCategoryList.length ? subCategoryList.join(',') : undefined,
      topProductsPaymentType: topProductsPaymentType || undefined,
    }
    // Deferred to a microtask so the fetch kickoff (and its setLoading/setError) doesn't run
    // synchronously inside the effect body itself — same async-boundary shape React's
    // set-state-in-effect rule wants, without changing request/race-guard behavior.
    Promise.resolve().then(() => {
      if (reqId !== reqIdRef.current) return
      setLoading(true)
      setError(null)
      fetch(`${API}/api/return-analysis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(r => { if (!r.ok) throw new Error(`API error ${r.status}`); return r.json() })
        .then(json => { if (reqId === reqIdRef.current) setData(json) })
        .catch(e => { if (reqId === reqIdRef.current) setError(e.message) })
        .finally(() => { if (reqId === reqIdRef.current) setLoading(false) })
    })
  }, [API, filters.start, filters.end, filters.subChannel, filters.category, filters.subCategory, filters.productAge, subCatFirstOrderMap, topProductsPaymentType])

  const paymentTypeOpts = useMemo(() => (data?.paymentTypeTable || []).map(r => r.paymentType).filter(Boolean), [data])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && (
        <div style={{ padding: '10px 13px', borderRadius: 9, background: C.red.bg, border: `1px solid ${C.red.bd}`, color: C.red.tx, fontSize: 12 }}>⚠ {error}</div>
      )}
      {loading && !data && (
        <div style={{ fontSize: 12, color: C.t3, textAlign: 'center', padding: '40px 0' }}>Loading return analysis…</div>
      )}

      {data && (
        <>
          <div className="g-2" style={{ gridTemplateColumns: '1.6fr 1fr', alignItems: 'start' }}>
            <ReturnTrendChart kpis={data.kpis} dailyTrend={data.dailyTrend} />
            <TopReturnedProductsCard
              topProducts={data.topProducts}
              paymentTypeOpts={paymentTypeOpts}
              paymentType={topProductsPaymentType}
              setPaymentType={setTopProductsPaymentType}
              basis={topProductsBasis}
              setBasis={setTopProductsBasis}
            />
          </div>

          <div className="g-2" style={{ gridTemplateColumns: '1.235fr 1fr', alignItems: 'stretch', gridAutoRows: undefined }}>
            <ReturnBreakdownTable
              title="Category-wise Return Breakdown"
              rows={data.categoryTable}
              labelCols={[{ key: 'category', label: 'Category' }, { key: 'subCategory', label: 'Sub-category' }]}
              basis={catBasis}
              search={catSearch}
              onSearchChange={setCatSearch}
              onExport={() => exportCSV(data.categoryTable, 'd2c_return_analysis_category.csv')}
              getVariants={r => data.skuVariants?.[`${r.category}::${r.subCategory}`]}
              maxHeight={385}
              boxHeight={445}
              action={<QtyRevToggle value={catBasis} onChange={setCatBasis} />}
            />
            <ReturnBreakdownTable
              title="Last 12 Months Summary"
              rows={data.monthlyTable}
              labelCols={[{ key: 'month', label: 'Month', render: monthKey => {
                const [y, m] = (monthKey || '').split('-')
                if (!y || !m) return monthKey
                const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                return `${MONTH_ABBR[parseInt(m, 10) - 1]}-${y.slice(2)}`
              } }]}
              basis={monthBasis}
              maxHeight={390}
              boxHeight={450}
              defaultSortKey="month"
              action={<QtyRevToggle value={monthBasis} onChange={setMonthBasis} />}
            />
          </div>

          <div className="g-3" style={{ gridTemplateColumns: '0.69fr 0.7fr 0.8fr', alignItems: 'stretch', gridAutoRows: '270px' }}>
            <PaymentTypeTransposedTable paymentTypeTable={data.paymentTypeTable} basis={payBasis} setBasis={setPayBasis} />
            <CancelBucketChart cancelByBucket={data.cancelByBucket} />
            <ReturnReasonsTable returnReasons={data.returnReasons} />
          </div>
        </>
      )}
    </div>
  )
}
