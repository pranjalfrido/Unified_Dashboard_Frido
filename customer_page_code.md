# CustomerPage — Full Code for Redesign

## Context for redesign

This is a React component from a dark-themed internal analytics dashboard (Frido MIS).

**Theme constants available (`C`):**
- `C.bg` — page background (dark)
- `C.card` — card background
- `C.t1`, `C.t2`, `C.t3` — text colors (primary → muted)
- `C.border`, `C.border2` — border colors
- `C.acc` — accent color (golden yellow, e.g. `#FFD600`)
- `C.acl` — accent light background
- `C.blue.bg`, `C.blue.tx`, `C.blue.bd` — blue tones
- `C.red.bg`, `C.red.tx`, `C.red.bd` — red tones

**Shared components used:**
- `<Card title={...} action={...}>` — card wrapper with header + optional action slot
- `<LSectionTitle title="..." collapsed={bool} onToggle={fn} />` — collapsible section header
- `<LKpiCard label="..." value="..." cur={number} prev={number} subValue="..." />` — KPI tile with delta badge

**Formatters:**
- `fmt(v)` — formats as ₹ currency
- `fmtN(v)` — formats as integer with locale commas
- `fmtBig(v)` — short form (K/L/Cr)
- `pct(v)` — percentage

**Charting:** Recharts (`ResponsiveContainer`, `ComposedChart`, `BarChart`, `PieChart`, `Bar`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `Legend`, `CartesianGrid`, `Cell`, `Pie`)

---

## Full Component Code

```jsx
function CustomerPage({ filters }) {
  const [custData, setCustData] = useState(null)
  const [custError, setCustError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [crossFilter, setCrossFilter] = useState('Category')
  const [granularity, setGranularity] = useState('daily')
  const [secCollapsed, setSecCollapsed] = useState({ trends: false, cohort: false, purchase: false, rfm: false, discount: false })
  const toggleSec = k => setSecCollapsed(s => ({ ...s, [k]: !s[k] }))
  const [spendGranularity, setSpendGranularity] = useState('daily')
  const API = import.meta.env.VITE_API_URL || ''

  useEffect(() => {
    setLoading(true); setCustError(null)
    fetch(`${API}/api/customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start: filters.start, end: filters.end })
    })
      .then(r => r.json())
      .then(d => { if (d.error) { setCustError(d.error); setCustData(null) } else { setCustData(d) }; setLoading(false) })
      .catch(e => { setCustError(e.message); setLoading(false) })
  }, [filters.start, filters.end])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: C.t3 }}>Loading customer data...</div>
  if (custError) return <div style={{ padding: 40, margin: 16, borderRadius: 10, background: C.red.bg, border: `1px solid ${C.red.bd}`, color: C.red.tx, fontSize: 12 }}><strong>Error loading customer data:</strong> {custError}</div>
  if (!custData) return <div style={{ padding: 60, textAlign: 'center', color: C.t3 }}>Select a date range to load customer analysis</div>

  const { kpis = {}, prevKpis = {}, daily: rawDaily = [], cohort = [], rfm = [], freqDist = [], monetaryDist = [], inactivity = [], discountDist = [], crossSell = [], dailySpend: rawDailySpend = [] } = custData

  // Aggregate daily rows into the selected granularity
  const monthly = (() => {
    const buckets = {}
    rawDaily.forEach(r => {
      const d = new Date(r.day)
      let key, label
      if (granularity === 'daily') {
        key = r.day
        label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      } else if (granularity === 'weekly') {
        const day = d.getDay()
        const diff = (day === 0 ? -6 : 1 - day)
        const mon = new Date(d); mon.setDate(d.getDate() + diff)
        key = mon.toISOString().slice(0, 10)
        label = `W${mon.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
      } else {
        key = r.day.slice(0, 7)
        label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
      }
      if (!buckets[key]) buckets[key] = { month: label, customersAcquired: 0, totalOrders: 0, grossSales: 0, repeatRevenue: 0, newRevenue: 0, newCustomers: 0, repeatCustomers: 0, newOrders: 0, repeatOrders: 0 }
      buckets[key].customersAcquired += r.customersAcquired
      buckets[key].totalOrders += r.totalOrders
      buckets[key].grossSales += r.grossSales
      buckets[key].repeatRevenue += r.repeatRevenue
      buckets[key].newRevenue += r.newRevenue
      buckets[key].newCustomers += r.newCustomers
      buckets[key].repeatCustomers += r.repeatCustomers
      buckets[key].newOrders += r.newOrders
      buckets[key].repeatOrders += r.repeatOrders
    })
    return Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => ({
      ...v,
      aov: v.totalOrders > 0 ? v.grossSales / v.totalOrders : 0,
      repeatRevenueRate: v.grossSales > 0 ? v.repeatRevenue / v.grossSales : 0,
    }))
  })()

  // Cohort pivot
  const cohortMap = {}
  const cohort0 = {}
  const cohortRev0 = {}
  cohort.forEach(r => {
    if (!cohortMap[r.cohortMonth]) cohortMap[r.cohortMonth] = {}
    cohortMap[r.cohortMonth][r.cohortIndex] = { customers: r.customers, revenue: r.revenue }
    if (r.cohortIndex === 0) { cohort0[r.cohortMonth] = r.customers; cohortRev0[r.cohortMonth] = r.revenue }
  })
  const cohortMonths = Object.keys(cohortMap).sort()
  const maxCohortIdx = Math.max(...cohort.map(r => r.cohortIndex), 0)

  // RFM colors
  const RFM_COLORS = { 'Champions': '#FFD600', 'Loyal Customers': '#FFE033', 'Recent Users': '#FAD000', 'Potential Loyalists': '#F5C800', 'Cannot Lose Them': '#EFC000', "Can't Lose Them": '#EFC000', 'Hibernating': '#E8B800', 'Others': '#E0B000', 'Price Sensitive': '#D9A800', 'Needs Attention': '#F2CA00', 'About to Sleep': '#DCAC00', 'Lost Customers': '#D4A400' }
  const rfmTotal = rfm.reduce((s, r) => s + r.totalRevenue, 0)

  // Cross-sell pivot
  const crossFirstKey = crossFilter === 'Category' ? 'firstCategory' : 'firstSubCategory'
  const crossSecondKey = crossFilter === 'Category' ? 'secondCategory' : 'secondSubCategory'
  const allCrossFirst = [...new Set(crossSell.map(r => r[crossFirstKey]).filter(Boolean))].sort()
  const allCrossSecond = [...new Set(crossSell.map(r => r[crossSecondKey]).filter(Boolean))].sort()
  const crossMap = {}
  crossSell.forEach(r => {
    const sk = r[crossSecondKey], fk = r[crossFirstKey]
    if (!sk || !fk) return
    if (!crossMap[sk]) crossMap[sk] = {}
    crossMap[sk][fk] = (crossMap[sk][fk] || 0) + r.customers
  })
  const crossRows = allCrossSecond.filter(sc => crossMap[sc])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 4px' }}>
      {/* Yellow info banner */}
      <div style={{ background: C.acl, border: `1px solid #E6C200`, borderRadius: 9, padding: '8px 14px', fontSize: 12, color: '#7A6000' }}>
        <strong>Shopify D2C only</strong> — Amazon, Flipkart & quick-commerce channels do not share customer identity
      </div>

      {/* Section 1: Overview KPIs — always visible */}
      <LSectionTitle title="Overview KPIs" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8 }}>
        <LKpiCard label="Gross Sale" value={fmtBig(kpis.grossSales)} cur={kpis.grossSales} prev={prevKpis.grossSales} />
        <LKpiCard label="Total Spend" value={fmtBig(kpis.totalSpend)} cur={kpis.totalSpend} prev={prevKpis.totalSpend} />
        <LKpiCard label="Meta Spend" value={fmtBig(kpis.metaSpend)} cur={kpis.metaSpend} prev={prevKpis.metaSpend} />
        <LKpiCard label="Google Spend" value={fmtBig(kpis.googleSpend)} cur={kpis.googleSpend} prev={prevKpis.googleSpend} />
        <LKpiCard label="Total Customers" value={fmtBig(kpis.totalCustomers)} cur={kpis.totalCustomers} prev={prevKpis.totalCustomers} />
        <LKpiCard label="New Customers" value={fmtBig(kpis.newCustomers)} cur={kpis.newCustomers} prev={prevKpis.newCustomers} />
        <LKpiCard label="Returning Customers" value={fmtBig(kpis.returningCustomers)} cur={kpis.returningCustomers} prev={prevKpis.returningCustomers} />
        <LKpiCard label="Repeat Rate" value={`${(kpis.repeatRate * 100).toFixed(2)}%`} cur={kpis.repeatRate} prev={prevKpis.repeatRate} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8 }}>
        <LKpiCard label="RoAS" value={kpis.roas.toFixed(2)} cur={kpis.roas} prev={prevKpis.roas} />
        <LKpiCard label="CAC" value={`₹${Math.round(kpis.cac).toLocaleString('en-IN')}`} cur={kpis.cac} prev={prevKpis.cac} />
        <LKpiCard label="AOV" value={`₹${Math.round(kpis.aov).toLocaleString('en-IN')}`} cur={kpis.aov} prev={prevKpis.aov} />
        <LKpiCard label="CLTV" value={fmt((kpis.grossSales || 0) / (kpis.totalCustomers || 1))} cur={kpis.grossSales / (kpis.totalCustomers || 1)} prev={prevKpis.grossSales / (prevKpis.totalCustomers || 1)} subValue="Rev / unique customer" />
        <LKpiCard label="Acquisition Rate" value={`${(kpis.acquisitionRate * 100).toFixed(2)}%`} cur={kpis.acquisitionRate} prev={prevKpis.acquisitionRate} />
        <LKpiCard label="Repeat Revenue" value={`${((kpis.repeatRevenueRate || 0) * 100).toFixed(2)}%`} cur={kpis.repeatRevenueRate} prev={prevKpis.repeatRevenueRate} subValue={fmt(kpis.repeatRevenue || 0)} />
        <LKpiCard label="Revenue per Cust" value={fmt(kpis.grossSales / (kpis.totalCustomers || 1))} cur={kpis.grossSales / (kpis.totalCustomers || 1)} prev={prevKpis.grossSales / (prevKpis.totalCustomers || 1)} />
        <LKpiCard label="Net Revenue %" value={kpis.netRevenueRate ? `${((kpis.netRevenueRate) * 100).toFixed(2)}%` : '—'} cur={kpis.netRevenueRate} prev={prevKpis.netRevenueRate} subValue={kpis.netRevenue ? fmt(kpis.netRevenue) : ''} />
      </div>

      {/* Section 2: Acquisition & Revenue Trends */}
      <LSectionTitle title="Acquisition & Revenue Trends" collapsed={secCollapsed.trends} onToggle={() => toggleSec('trends')} />
      {!secCollapsed.trends && (() => {
        const xLabel = granularity === 'monthly' ? 'First Order Date Month' : granularity === 'weekly' ? 'First Order Date Week' : 'First Order Date'
        const maxBar = granularity === 'daily' ? 18 : granularity === 'weekly' ? 30 : 48
        const showLabels = monthly.length <= 20
        return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title={xLabel} action={
          <select value={granularity} onChange={e => setGranularity(e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
            {['daily','weekly','monthly'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase()+g.slice(1)}</option>)}
          </select>
        }>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={monthly} margin={{ top: 20, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis yAxisId="cust" tick={{ fontSize: 10 }} tickFormatter={v => v.toLocaleString('en-IN')} width={55} />
              <YAxis yAxisId="sales" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => v >= 1e7 ? `₹${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `₹${(v/1e5).toFixed(0)}L` : `₹${(v/1000).toFixed(0)}K`} />
              <YAxis yAxisId="aov" hide />
              <YAxis yAxisId="rrr" hide />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const d = payload[0]?.payload || {}
                return (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 11 }}>
                    <div style={{ fontWeight: 700, marginBottom: 5, color: C.t2 }}>{label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: C.acc, display: 'inline-block', flexShrink: 0 }} /><span style={{ color: C.t2 }}>Customers Acquired: {(d.customersAcquired||0).toLocaleString('en-IN')}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2E74CC', display: 'inline-block', flexShrink: 0 }} /><span style={{ color: C.t2 }}>Gross Sales: {fmt(d.grossSales||0)}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#E8930A', display: 'inline-block', flexShrink: 0 }} /><span style={{ color: C.t2 }}>AOV: ₹{Math.round(d.aov||0).toLocaleString('en-IN')}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0D9E68', display: 'inline-block', flexShrink: 0 }} /><span style={{ color: C.t2 }}>Repeat Revenue Rate: {((d.repeatRevenueRate||0)*100).toFixed(1)}%</span></div>
                  </div>
                )
              }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="cust" dataKey="customersAcquired" name="Customers Acquired" fill={C.acc} radius={[3,3,0,0]} maxBarSize={maxBar}
                label={showLabels ? { position: 'top', fontSize: 9, fill: C.t2, fontWeight: 600, formatter: v => v.toLocaleString('en-IN') } : false} />
              <Line yAxisId="sales" type="monotone" dataKey="grossSales" name="Gross Sales" stroke="#2E74CC" strokeWidth={2} dot={false} />
              <Line yAxisId="aov"   type="monotone" dataKey="aov"   name="AOV"         stroke="#E8930A" strokeWidth={2} dot={false} />
              <Line yAxisId="rrr"   type="monotone" dataKey="repeatRevenueRate" name="Repeat Revenue Rate" stroke="#0D9E68" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
        {(() => {
          const [nrMetric, setNrMetric] = [custData._nrMetric || 'customers', v => setCustData(d => ({ ...d, _nrMetric: v }))]
          const [nrGran, setNrGran] = [custData._nrGran || granularity, v => setCustData(d => ({ ...d, _nrGran: v }))]
          const nrData = (() => {
            const buckets = {}
            rawDaily.forEach(r => {
              const d = new Date(r.day)
              let key, label
              if (nrGran === 'daily') { key = r.day; label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) }
              else if (nrGran === 'weekly') { const day = d.getDay(), diff = (day === 0 ? -6 : 1 - day); const mon = new Date(d); mon.setDate(d.getDate() + diff); key = mon.toISOString().slice(0, 10); label = `W${mon.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` }
              else { key = r.day.slice(0, 7); label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) }
              if (!buckets[key]) buckets[key] = { month: label, newCustomers: 0, repeatCustomers: 0, newOrders: 0, repeatOrders: 0, newRevenue: 0, repeatRevenue: 0 }
              buckets[key].newCustomers += r.newCustomers; buckets[key].repeatCustomers += r.repeatCustomers
              buckets[key].newOrders += r.newOrders; buckets[key].repeatOrders += r.repeatOrders
              buckets[key].newRevenue += r.newRevenue; buckets[key].repeatRevenue += r.repeatRevenue
            })
            return Object.entries(buckets).sort(([a],[b]) => a.localeCompare(b)).map(([,v]) => v)
          })()
          const newKey = nrMetric === 'customers' ? 'newCustomers' : nrMetric === 'orders' ? 'newOrders' : 'newRevenue'
          const repKey = nrMetric === 'customers' ? 'repeatCustomers' : nrMetric === 'orders' ? 'repeatOrders' : 'repeatRevenue'
          const tickFmt = v => nrMetric === 'revenue' ? (v >= 1e7 ? `₹${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `₹${(v/1e5).toFixed(0)}L` : `₹${(v/1000).toFixed(0)}K`) : v.toLocaleString('en-IN')
          const lblFmt = v => nrMetric === 'revenue' ? (v >= 1e7 ? `₹${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `₹${(v/1e5).toFixed(0)}L` : `₹${(v/1000).toFixed(0)}K`) : v.toLocaleString('en-IN')
          return (
          <Card title="New vs Repeat Customers" action={
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              {[['customers','Customers'],['orders','Orders'],['revenue','Sales']].map(([k,l]) => (
                <button key={k} onClick={() => setNrMetric(k)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, border: `1px solid ${nrMetric===k ? C.acc : C.border}`, background: nrMetric===k ? C.acl : C.card, color: nrMetric===k ? '#7A6000' : C.t2, cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: nrMetric===k ? 700 : 400 }}>{l}</button>
              ))}
              <select value={nrGran} onChange={e => setNrGran(e.target.value)} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, border: `1px solid ${C.border}`, background: C.card, color: C.t2, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                {['daily','weekly','monthly'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase()+g.slice(1)}</option>)}
              </select>
            </div>
          }>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={nrData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={tickFmt} />
                <Tooltip formatter={(v, n) => [nrMetric === 'revenue' ? fmt(v) : fmtN(v), n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey={newKey} stackId="a" fill={C.acc} name="New Customers" radius={[0,0,0,0]}
                  label={{ position: 'inside', fontSize: 9, fill: '#7A6000', fontWeight: 700, formatter: lblFmt }} />
                <Bar dataKey={repKey} stackId="a" fill="#B8A000" name="Repeat Customers" radius={[3,3,0,0]}
                  label={{ position: 'top', fontSize: 9, fill: C.t2, fontWeight: 700, formatter: lblFmt }} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          )
        })()}
      </div>
        )
      })()}

      {/* Section 3: Customer Retention Cohort */}
      <LSectionTitle title="Customer Retention Cohort" collapsed={secCollapsed.cohort} onToggle={() => toggleSec('cohort')} />
      {!secCollapsed.cohort && (() => {
        const [cohortMode, setCohortMode] = [custData._cohortMode || 'customer', v => setCustData(d => ({ ...d, _cohortMode: v }))]
        return (
        <Card title={
          <div>
            <div>Customer Retention Cohort</div>
            <div style={{ fontSize: 11, fontWeight: 400, color: C.t3, marginTop: 2 }}>
              {cohortMode === 'customer'
                ? 'Only customers with ≥1 successful order (excl. Cancel / RTO / CIR)'
                : 'Net revenue per cohort (Exc. GST, excl. Cancel / RTO / CIR) ÷ Month 0 revenue'}
            </div>
          </div>
        } action={
          <div style={{ display: 'flex', gap: 5 }}>
            {[['customer','Customer Retention %'],['sales','Sales Retention %']].map(([k,l]) => (
              <button key={k} onClick={() => setCohortMode(k)} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, border: `1px solid ${cohortMode===k ? '#2E74CC' : C.border}`, background: cohortMode===k ? '#E1EFFD' : C.card, color: cohortMode===k ? '#184078' : C.t2, cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: cohortMode===k ? 700 : 400 }}>{l}</button>
            ))}
          </div>
        }>
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 10.5, width: '100%', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                  <th style={{ padding: '5px 8px', textAlign: 'left', color: C.t3, fontWeight: 700, fontSize: 9.5, whiteSpace: 'nowrap', width: 80 }}>Cohort Month</th>
                  {Array.from({ length: maxCohortIdx + 1 }, (_, i) => (
                    <th key={i} style={{ padding: '5px 4px', textAlign: 'center', color: C.t3, fontWeight: 700, fontSize: 9.5 }}>{i === 0 ? 'Month 0' : `+${i}M`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohortMonths.map(cm => {
                  const baseC = cohort0[cm] || 1
                  const baseR = cohortRev0[cm] || 1
                  return (
                    <tr key={cm} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '4px 8px', fontWeight: 700, color: C.t1, fontSize: 10, whiteSpace: 'nowrap' }}>{cm}</td>
                      {Array.from({ length: maxCohortIdx + 1 }, (_, i) => {
                        const cell = cohortMap[cm]?.[i]
                        const pctVal = cell != null
                          ? cohortMode === 'customer'
                            ? cell.customers / baseC * 100
                            : cell.revenue / baseR * 100
                          : null
                        const intensity = pctVal != null ? Math.min(i === 0 ? 1 : pctVal / 15, 1) : 0
                        const bg = i === 0 ? '#2E74CC' : pctVal != null ? `rgba(46,116,204,${0.08 + intensity * 0.55})` : 'transparent'
                        const txtColor = i === 0 ? '#fff' : pctVal != null && intensity > 0.5 ? '#fff' : C.t1
                        return (
                          <td key={i} title={cell ? `${cohortMode==='customer'?cell.customers+' customers':fmt(cell.revenue)}` : ''} style={{ padding: '4px 4px', textAlign: 'center', fontSize: 9.5, fontFamily: 'var(--mono)', background: bg, color: txtColor, fontWeight: 400 }}>
                            {pctVal != null ? `${pctVal.toFixed(1)}%` : ''}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
        )
      })()}

      {/* Section 4: Purchase Behavior */}
      <LSectionTitle title="Purchase Behavior" collapsed={secCollapsed.purchase} onToggle={() => toggleSec('purchase')} />
      {!secCollapsed.purchase && (() => {
        return (
      <Card title={<div><div>Purchase Behavior: First vs Second Purchase</div><div style={{ fontSize: 11, fontWeight: 400, color: C.t3, marginTop: 2 }}>All-time data — not affected by date filter. Shows what customers bought on their 2nd order after their 1st.</div></div>} action={
        <div style={{ display: 'flex', gap: 4 }}>
          {['Sub Category', 'Category'].map(t => (
            <button key={t} onClick={() => setCrossFilter(t)} style={{ fontSize: 10, padding: '3px 9px', borderRadius: 5, border: `1px solid ${C.border}`, background: crossFilter === t ? C.t1 : C.card, color: crossFilter === t ? '#fff' : C.t2, cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: crossFilter === t ? 700 : 400 }}>{t}</button>
          ))}
        </div>
      }>
        <div style={{ overflowX: 'auto', overflowY: 'auto', width: '100%', maxHeight: 420 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 10.5, width: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '140px' }} />
              {allCrossFirst.map(cat => <col key={cat} />)}
            </colgroup>
            <thead>
              <tr>
                <th style={{ padding: '2px 8px 0', borderBottom: 'none' }} />
                <th colSpan={allCrossFirst.length} style={{ padding: '4px 6px 2px', textAlign: 'center', fontSize: 9.5, fontWeight: 700, color: C.blue.tx, background: C.blue.bg, borderRadius: '6px 6px 0 0', letterSpacing: '.04em' }}>
                  First Purchase {crossFilter} →
                </th>
              </tr>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                <th style={{ padding: '4px 8px', textAlign: 'left', verticalAlign: 'bottom', overflow: 'hidden' }}>
                  <div style={{ fontSize: 8.5, fontWeight: 700, color: C.blue.tx, background: C.blue.bg, display: 'inline-block', padding: '2px 6px', borderRadius: 4, marginBottom: 2 }}>↓ Second Purchase {crossFilter}</div>
                </th>
                {allCrossFirst.map(cat => (
                  <th key={cat} style={{ padding: '4px 6px', textAlign: 'right', color: C.t3, fontWeight: 700, fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {crossRows.map((sc, i) => (
                <tr key={sc} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? 'transparent' : C.bg }}>
                  <td style={{ padding: '4px 8px', fontWeight: 600, color: C.t1, fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: C.t3, fontSize: 9 }}>⊞</span> {sc}
                  </td>
                  {allCrossFirst.map(fc => {
                    const v = crossMap[sc]?.[fc]
                    return <td key={fc} style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10, color: v ? C.t1 : C.t3 }}>{v ? fmtN(v) : ''}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
        )
      })()}

      {/* Section 5: RFM & Segmentation */}
      <LSectionTitle title="RFM & Segmentation" collapsed={secCollapsed.rfm} onToggle={() => toggleSec('rfm')} />
      {!secCollapsed.rfm && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* RFM Segments — horizontal bar list */}
        <Card title="RFM Segments">
          {(() => {
            const RFM_DESC = {
              'Champions':          'Bought recently, buy often, high spend',
              'Loyal Customers':    'Buy regularly, decent recency & frequency',
              'Recent Users':       'Bought recently but only once or twice',
              'Potential Loyalists':'Recent buyers with good spend potential',
              'Cannot Lose Them':   'Bought often but not seen in 90–180+ days',
              'Hibernating':        'Low recency & low frequency — going cold',
              'Others':             'High spenders not fitting other segments',
              'Price Sensitive':    'Moderate frequency but low spend per order',
              'Needs Attention':    'Average recency & frequency — at risk',
              'About to Sleep':     'Dropping off — haven\'t bought in a while',
              'Lost Customers':     'Haven\'t purchased in 180+ days',
            }
            const RFM_TOOLTIP = {
              'Champions':          'Rule: Last order ≤60 days ago (R≥4) AND ≥4 orders ever (F≥4).',
              'Loyal Customers':    'Rule: Last order ≤90 days (R≥3) AND ≥3 orders (F≥3).',
              'Recent Users':       'Rule: Last order ≤60 days (R≥4) AND ≤2 orders (F≤2).',
              'Potential Loyalists':'Rule: Last order ≤90 days (R≥3) AND spend ≥₹2,000 (M≥3).',
              'Cannot Lose Them':   'Rule: Last order >180 days (R≤2) AND ≥3 orders (F≥3).',
              'Hibernating':        'Rule: Last order >180 days (R≤2) AND ≤2 orders (F≤2).',
              'Others':             'Rule: Lifetime spend ≥₹5,000 but doesn\'t fit any other segment.',
              'Price Sensitive':    'Rule: ≥3 orders (F≥3) AND spend <₹2,000 (M≤2).',
              'Needs Attention':    'Rule: Last order 60–90 days (R=3) AND 2–3 orders (F=2–3).',
              'About to Sleep':     'Rule: Last order 90–180 days (R=2) AND 2–3 orders (F=2–3).',
              'Lost Customers':     'Rule: Last order >180 days (R=1) AND ≤2 orders (F≤2).',
            }
            const sorted = [...rfm].sort((a, b) => b.totalRevenue - a.totalRevenue)
            const maxRev = sorted[0]?.totalRevenue || 1
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sorted.map(seg => {
                  const col = RFM_COLORS[seg.segment] || '#8B8000'
                  const barW = seg.totalRevenue / maxRev * 100
                  const pct = rfmTotal > 0 ? (seg.totalRevenue / rfmTotal * 100).toFixed(1) : '0'
                  const desc = RFM_DESC[seg.segment] || ''
                  const tooltip = RFM_TOOLTIP[seg.segment] || ''
                  return (
                    <div key={seg.segment} title={tooltip} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'help' }}>
                      <div style={{ width: 4, height: 34, borderRadius: 2, background: col, flexShrink: 0 }} />
                      <div style={{ width: 200, flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.t1 }}>{seg.segment}</div>
                        <div style={{ fontSize: 9.5, color: C.t3 }}>{desc}</div>
                      </div>
                      <div style={{ fontSize: 10, color: C.t3, width: 80, flexShrink: 0 }}>{fmtN(seg.customers)} custs</div>
                      <div style={{ flex: 1, background: C.border, borderRadius: 3, height: 8, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${barW}%`, background: col, borderRadius: 3 }} />
                      </div>
                      <div style={{ width: 72, textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)' }}>{fmt(seg.totalRevenue)}</div>
                        <div style={{ fontSize: 10, color: C.t3 }}>{pct}%</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </Card>

        {/* Purchase Frequency Distribution */}
        <Card title="Purchase Frequency Distribution">
          {(() => {
            const total = freqDist.reduce((s, r) => s + r.customers, 0) || 1
            const maxCusts = Math.max(...freqDist.map(r => r.customers), 1)
            const shades = [C.acc, '#F5DC00', '#E6CC00', '#CCB400', '#B8A000']
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, paddingTop: 8 }}>
                {freqDist.map((r, i) => {
                  const widthPct = r.customers / maxCusts * 100
                  const pct = (r.customers / total * 100).toFixed(1)
                  const shade = shades[i] || C.acc
                  return (
                    <div key={r.label} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: `${Math.max(widthPct, 8)}%`, background: shade, borderRadius: 4, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', transition: 'width .3s' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)' }}>{fmtBig(r.customers)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: C.t2 }}>{r.label}</span>
                        <span style={{ fontSize: 10, color: C.t3 }}>{pct}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </Card>

        {/* Monetary Distribution */}
        <Card title="Distribution of Customers Across Monetary Segment">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={monetaryDist} margin={{ top: 24, right: 60, left: 10, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 9.5, fill: C.t2 }} angle={-12} textAnchor="end" interval={0} />
              <YAxis yAxisId="left" tick={{ fontSize: 9 }} tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} width={48} label={{ value: 'Customers', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 9, fill: C.t3 } }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} tickFormatter={v => v >= 1e9 ? `₹${(v/1e9).toFixed(1)}B` : v >= 1e7 ? `₹${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `₹${(v/1e5).toFixed(0)}L` : `₹${(v/1000).toFixed(0)}K`} width={58} label={{ value: 'Revenue', angle: 90, position: 'insideRight', offset: 10, style: { fontSize: 9, fill: C.t3 } }} />
              <Tooltip formatter={(v, n) => n === 'Revenue' ? [fmt(v), n] : [fmtN(v), n]} />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
              <Bar yAxisId="left" dataKey="customers" name="Customers" radius={[4,4,0,0]} maxBarSize={60}
                label={{ position: 'top', fontSize: 9, fill: C.t2, formatter: v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v }}>
                {monetaryDist.map((_, i) => <Cell key={i} fill={[C.acc, '#F5DC00', '#E6CC00', '#CCB400', '#B8A000'][i] || C.acc} />)}
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="totalRevenue" name="Revenue" stroke="#2E74CC" strokeWidth={2} dot={{ r: 4, fill: '#2E74CC' }}
                label={{ position: 'top', fontSize: 9, fill: '#2E74CC', formatter: v => v >= 1e7 ? `${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v/1e5).toFixed(0)}L` : `${(v/1000).toFixed(0)}K` }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        {/* Inactivity Buckets */}
        <Card title="Inactive Customers (30, 60, 90 Days)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={inactivity} margin={{ top: 24, right: 10, left: 10, bottom: 20 }}>
              <XAxis dataKey="bucket" tick={{ fontSize: 9, fill: C.t2 }} angle={-10} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={v => v >= 1e7 ? `${(v/1e7).toFixed(1)} Cr` : v >= 1e5 ? `${(v/1e5).toFixed(1)} L` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} width={45} />
              <Tooltip formatter={(v) => [fmtN(v), 'Customers']} />
              <Bar dataKey="customers" fill={C.acc} name="Customers" radius={[3,3,0,0]}
                label={{ position: 'top', fontSize: 9, fill: C.t2, fontWeight: 600, formatter: v => v >= 1e7 ? `${(v/1e7).toFixed(2)} Cr` : v >= 1e5 ? `${(v/1e5).toFixed(2)} L` : v >= 1000 ? `${(v/1000).toFixed(1)}K` : v }}>
                {inactivity.map((r, i) => <Cell key={i} fill={r.bucket.includes('90+') ? C.acc : r.bucket.includes('60') ? '#F5DC00' : r.bucket.includes('30') ? '#E6CC00' : '#CCB400'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
      )}

      {/* Section 6: Discount & Spend Analysis */}
      <LSectionTitle title="Discount & Spend Analysis" collapsed={secCollapsed.discount} onToggle={() => toggleSec('discount')} />
      {!secCollapsed.discount && (<>
      {(() => {
        const fmtAxis = v => v >= 1e7 ? `₹${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `₹${(v/1e5).toFixed(0)}L` : v >= 1000 ? `₹${(v/1000).toFixed(0)}K` : `₹${v}`
        const spendByDay = {}
        rawDailySpend.forEach(r => { spendByDay[r.day] = r.totalSpend })
        const mergedDaily = rawDaily.map(r => ({ ...r, totalSpend: spendByDay[r.day] || 0 }))
        const buckets = {}
        mergedDaily.forEach(r => {
          const key = spendGranularity === 'monthly' ? r.day.slice(0, 7)
            : spendGranularity === 'weekly' ? (() => { const d = new Date(r.day); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); const mon = new Date(d.setDate(diff)); return mon.toISOString().slice(0, 10) })()
            : r.day
          if (!buckets[key]) buckets[key] = { key, grossSales: 0, totalSpend: 0 }
          buckets[key].grossSales += r.grossSales || 0
          buckets[key].totalSpend += r.totalSpend || 0
        })
        const spendData = Object.values(buckets).sort((a, b) => a.key.localeCompare(b.key))
        const xLabel = spendGranularity === 'monthly' ? 'Total Spend vs Gross Sales by Month'
          : spendGranularity === 'weekly' ? 'Total Spend vs Gross Sales by Week'
          : 'Total Spend vs Gross Sales by Day'
        return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
          <Card title={xLabel} action={
            <select value={spendGranularity} onChange={e => setSpendGranularity(e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
              {['daily','weekly','monthly'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase()+g.slice(1)}</option>)}
            </select>
          }>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={spendData} margin={{ top: 20, right: 60, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="key" tick={{ fontSize: 9.5 }} tickFormatter={d => spendGranularity === 'monthly' ? d : d?.slice(5)} interval="preserveStartEnd" />
                <YAxis yAxisId="spend" tick={{ fontSize: 9 }} tickFormatter={fmtAxis} width={52} />
                <YAxis yAxisId="sales" orientation="right" tick={{ fontSize: 9 }} tickFormatter={fmtAxis} width={52} />
                <Tooltip formatter={(v, n) => [fmt(v), n]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar yAxisId="spend" dataKey="totalSpend" name="Total Spend (Meta+Google)" fill={C.acc} radius={[3,3,0,0]} maxBarSize={40}
                  label={{ position: 'top', fontSize: 9, fill: C.t2, fontWeight: 600, formatter: v => v >= 1e7 ? `₹${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `₹${(v/1e5).toFixed(1)}L` : v >= 1000 ? `₹${(v/1000).toFixed(0)}K` : `₹${v}` }} />
                <Line yAxisId="sales" type="monotone" dataKey="grossSales" name="Gross Sales" stroke="#2E74CC" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </div>
        )
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Discount distribution First vs Repeat */}
        <Card title="Order Distribution by Discount % (First vs Repeat)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={discountDist} margin={{ top: 24, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={v => v >= 1e5 ? `${(v/1e5).toFixed(0)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
              <Tooltip formatter={(v, n) => [fmtN(v), n]} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="firstOrders" stackId="a" fill={C.acc} name="First Order"
                label={{ position: 'inside', fontSize: 9, fill: C.t1, fontWeight: 600, formatter: v => v >= 2000 ? (v >= 1000 ? `${(v/1000).toFixed(0)}K` : v) : '' }} />
              <Bar dataKey="repeatOrders" stackId="a" fill="#CCB400" name="Repeat Order" radius={[3,3,0,0]}
                label={(props) => {
                  const { x, y, width, value, index } = props
                  const row = discountDist[index] || {}
                  const total = (row.firstOrders || 0) + (row.repeatOrders || 0)
                  if (!total) return null
                  const lbl = total >= 1000 ? `${(total/1000).toFixed(0)}K` : total
                  return <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={9} fill={C.t2} fontWeight={600}>{lbl}</text>
                }} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Discounted vs Non-Discounted donut */}
        <Card title="Discounted vs Non-Discounted Orders Split">
          {(() => {
            const disc = kpis.discountedOrders
            const nonDisc = kpis.nonDiscountedOrders
            const total = disc + nonDisc || 1
            const pieData = [
              { name: 'Discounted', value: disc, color: C.acc },
              { name: 'Non-Discounted', value: nonDisc, color: '#B8A000' },
            ]
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200 }}>
                <PieChart width={180} height={180}>
                  <Pie data={pieData} cx={88} cy={88} innerRadius={52} outerRadius={82} dataKey="value">
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                  {pieData.map(d => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                      <div style={{ fontSize: 11, color: C.t2 }}>{d.name}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)', marginLeft: 4 }}>
                        {fmtN(d.value)} ({(d.value / total * 100).toFixed(2)}%)
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </Card>
      </div>
      </>)}
    </div>
  )
}
```

---

## What's in this page (summary for redesign)

**6 collapsible sections:**

1. **Overview KPIs** — 16 KPI cards in 2 rows of 8: Gross Sale, Total/Meta/Google Spend, Total/New/Returning Customers, Repeat Rate, RoAS, CAC, AOV, CLTV, Acquisition Rate, Repeat Revenue %, Revenue per Cust, Net Revenue %

2. **Acquisition & Revenue Trends** — 2 charts side by side:
   - Customers Acquired bar + Gross Sales / AOV / Repeat Revenue Rate lines (daily/weekly/monthly toggle)
   - New vs Repeat stacked bar chart (customers / orders / sales toggle + granularity toggle)

3. **Customer Retention Cohort** — Heatmap table: rows = cohort months, columns = Month 0, +1M, +2M … Customer Retention % or Sales Retention % toggle. Color intensity = retention %. Month 0 column = solid blue.

4. **Purchase Behavior** — Cross-sell matrix table: rows = 2nd purchase category, columns = 1st purchase category, values = customer count. Toggle between Category and Sub Category.

5. **RFM & Segmentation** — 4 charts in 2×2 grid:
   - RFM Segments: horizontal bar list (11 segments, golden accent palette, segment name + description + customer count + revenue bar + % of total)
   - Purchase Frequency Distribution: pyramid/funnel bars (1 order, 2 orders, 3 orders, 4 orders, 5+ orders)
   - Monetary Distribution: bar + line combo (customer count bars by spend bucket + revenue line)
   - Inactive Customers: bar chart (30/60/90/90+ day buckets)

6. **Discount & Spend Analysis** — 3 charts:
   - Total Spend vs Gross Sales (full-width bar+line, daily/weekly/monthly toggle)
   - Order Distribution by Discount % stacked bar (First vs Repeat)
   - Discounted vs Non-Discounted donut chart
