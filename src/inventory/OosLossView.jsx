// Out-of-stock loss view — opened from the "OOS loss" button on Inventory Health.
// One row per SKU that is out of stock today and sold (B2C) in the last 180 days:
// days out of stock x avg daily sale (longest in-stock run) x ASP = loss of sale opportunity.
// Data: POST /api/inventory-oos (api/inventory-oos.js + api/data/inventory_oos.sql).
import { useMemo, useState } from 'react'
import { IC, fmtNum, fmtInt, GlassCard, KpiTile, SearchableMultiSelect, SortableTh, ExportButton } from './theme.jsx'
import { useOosData, stockedSkus, ageOf, oosSummary, lossByCategory, lossByAge, OOS_EXPORT_COLS } from './oosData.js'
const inr = (n) => (n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN'))
const inrShort = (n) => (n == null || n === 0 ? '—' : '₹' + fmtNum(n))
const dt = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—')
const dec = (n) => (n == null ? '—' : n >= 10 ? Math.round(n).toLocaleString('en-IN') : n.toFixed(2))

// Columns: category, then the five from the brief (SKU, days OOS, avg daily sale, ASP, loss), then context.
const COLS = [
  { key: 'category', label: 'Category', align: 'left', w: 130 },
  { key: 'sku', label: 'SKU', align: 'left', w: 230 },
  { key: 'daysOos', label: 'No. of days OOS', w: 92 },
  { key: 'avgDailySale', label: 'Avg daily sale', w: 92 },
  { key: 'asp', label: 'ASP', w: 92 },
  { key: 'lossToDate', label: 'Loss of sale opportunity', w: 130 },
  { key: 'dailyLoss', label: 'Loss / day', w: 92 },
  { key: 'oosSince', label: 'OOS since', w: 104 },
  { key: 'windowDays', label: 'Sales window', align: 'left', w: 170 },
  { key: 'lastSale', label: 'Last sale', w: 80 },
]
const TIPS = {
  daysOos: 'Calendar days since OOS since (capped at 180)',
  oosSince: 'Day after the last Shopify D2C sale when the SKU had been selling continuously (D2C orders on 20+ of 30 days) and then went silent for longer than its usual gap (at least 3 days); otherwise the day after it last had stock in a live warehouse',
  avgDailySale: 'B2C units per day during the longest unbroken in-stock run of the last 180 days. Runs under 14 days fall back to the 180-day average — see Sales window',
  asp: 'Average selling price (incl. GST), last 180 days, all platforms, cancelled orders excluded',
  lossToDate: 'Days OOS x avg daily sale x ASP',
  dailyLoss: 'Avg daily sale x ASP — what each further day out of stock costs',
}

// Bar fills: green gradients from the theme accent tokens (they follow a theme switch).
// Read at render time - IC getters resolve the live CSS variables.
// Dark greens: accent -> deep accent.
const gradMain = () => `linear-gradient(90deg, ${IC.acc}, ${IC.accBorder})`    // loss by category

// lastSalesDate: the Inventory Health page's latest-sales date, shown the same way as on that page;
// the stock-history date the OOS figures use is shown under it.
export default function OosLossView({ onBack, lastSalesDate }) {
  // Data + summaries are shared with the phone view (oosData.js), so both show the same numbers.
  const { data, error } = useOosData()
  const [search, setSearch] = useState('')
  const [cats, setCats] = useState([])
  const [age, setAge] = useState(null)   // ageing bucket picked on the chart
  const [sort, setSort] = useState({ key: 'lossToDate', dir: 'desc' })

  // SKUs never in stock in a live warehouse in 180 days are left out (see stockedSkus).
  const scoped = useMemo(() => stockedSkus(data), [data])
  const categories = useMemo(() => [...new Set(scoped.map(r => r.category))].sort(), [scoped])
  // Cross-filtering: each chart is drawn from the rows matching every OTHER filter, so picking a
  // category keeps the whole ageing picture for it (and vice versa) and the picked bar stays visible.
  const match = (r, { skipCat, skipAge } = {}) => {
    const q = search.trim().toLowerCase()
    return (skipCat || !cats.length || cats.includes(r.category)) &&
      (skipAge || !age || ageOf(r.daysOos) === age) &&
      (!q || r.sku.toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q) || (r.subCategory || '').toLowerCase().includes(q))
  }
  const rows = useMemo(() => {
    const out = scoped.filter(r => match(r))
    const { key, dir } = sort
    const m = dir === 'asc' ? 1 : -1
    return out.sort((a, b) => {
      const x = a[key], y = b[key]
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * m
    })
  }, [scoped, cats, age, search, sort])

  const kpi = oosSummary(rows)
  const byCat = useMemo(() => lossByCategory(scoped.filter(r => match(r, { skipCat: true }))), [scoped, age, search])
  const maxCat = byCat[0]?.[1] || 1
  // Loss so far per days-out bucket.
  const byAge = useMemo(() => lossByAge(scoped.filter(r => match(r, { skipAge: true }))), [scoped, cats, search])
  const maxAge = Math.max(1, ...byAge.map(b => b.loss))
  const onSort = (key) => setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))

  const cell = (r, c) => {
    switch (c.key) {
      case 'sku': return (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: IC.t1 }}>{r.sku}</div>
          {/* Item-master sub-category under the SKU (category has its own column) */}
          <div title={r.name || ''} style={{ fontSize: 11, color: IC.t3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: c.w - 10 }}>
            {r.subCategory && r.subCategory !== 'Uncategorized' ? r.subCategory : '—'}
          </div>
        </div>)
      case 'daysOos': return <span style={{ fontWeight: 700, color: r.daysOos >= 30 ? IC.status.Critical.c : r.daysOos >= 7 ? IC.status.Low.c : IC.t1 }}>{r.neverInStock ? '180+' : r.daysOos}</span>
      case 'avgDailySale': return dec(r.avgDailySale)
      case 'asp': return <span title={r.aspSource ? `ASP from ${r.aspSource}` : ''}>{inr(r.asp)}</span>
      case 'lossToDate': return <span style={{ fontWeight: 700, color: IC.t1 }}>{inr(r.lossToDate)}</span>
      case 'dailyLoss': return inr(r.dailyLoss)
      case 'oosSince': return r.neverInStock ? '—' : (
        <div style={{ lineHeight: 1.15 }}
          title={r.oosSource === 'D2C sales stop'
            ? `Last D2C sale ${dt(r.d2cLastSale)} — D2C orders on ${r.d2cSaleDays30} of the 30 days before, then none for ${r.daysOos} days (stop rule: ${r.d2cStopAfterDays}+ d). Stock-based date: ${dt(r.stockOosSince)}`
            : 'Day after the last in-stock day in a live warehouse'}>
          <div>{dt(r.oosSince)}</div>
          <div style={{ fontSize: 10.5, color: r.oosSource === 'D2C sales stop' ? IC.acc : IC.t3 }}>{r.oosSource === 'D2C sales stop' ? 'D2C sales stop' : 'stock'}</div>
        </div>)
      case 'windowDays': return (
        <div style={{ lineHeight: 1.15 }}>
          <div>{r.windowDays ? `${dt(r.windowStart)} – ${dt(r.windowEnd)} · ${r.windowDays} d` : 'no in-stock run'}</div>
          <div style={{ fontSize: 10.5, color: r.basis.startsWith('Longest') ? IC.t3 : IC.status.Low.c }}>
            {r.basis.startsWith('Longest') ? `${fmtInt(r.windowUnits)} units sold` : r.basis}
          </div>
        </div>)
      case 'lastSale': return dt(r.lastSale)
      default: return r[c.key] ?? '—'
    }
  }

  const exportCols = OOS_EXPORT_COLS

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={{ fontSize: 11.5, color: IC.t2, background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>
            ← Inventory Health
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: IC.t1, letterSpacing: '-.01em' }}>Out-of-stock loss</div>
            <div style={{ fontSize: 11, color: IC.t3 }}>
              SKUs with no stock in live warehouses today that sold in the last 180 days
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, lineHeight: 1.3 }}>
          {data?.asOf && (
            <span title="Days out of stock and in-stock runs come from the daily stock history, which is updated once a day"
              style={{ fontSize: 10.5, color: IC.t3, whiteSpace: 'nowrap' }}>
              OOS days counted to {new Date(data.asOf + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
          {lastSalesDate && (
            <span style={{ fontSize: 10.5, color: IC.t3, whiteSpace: 'nowrap' }}>
              Latest sales {new Date(lastSalesDate + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
      </div>

      {error && <div style={{ color: IC.negative, fontSize: 13 }}>Could not load: {error}</div>}
      {!data && !error && <div style={{ color: IC.t3, fontSize: 13, padding: 20 }}>Calculating out-of-stock loss from 180 days of stock history…</div>}

      {data && <>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          <KpiTile compact icon="/oos-icon-loss.svg" label="Loss of sale opportunity" value={inrShort(kpi.loss)} accent={IC.negative} sub="so far, this stock-out" />
          <KpiTile compact icon="/oos-icon-skus.svg" label="SKUs out of stock" value={fmtInt(kpi.skus) || '0'} sub="with B2C sales in the last 180 days" />
          <KpiTile compact icon="/oos-icon-daily.svg" label="Loss per day" value={inrShort(kpi.daily)} sub="each further day out" />
          <KpiTile compact icon="/oos-icon-asp.svg" label="Avg ASP" value={kpi.avgAsp == null ? '—' : inr(kpi.avgAsp)} sub={`average selling price across ${kpi.aspSkus} SKUs`} />
          <KpiTile compact icon="/oos-icon-days.svg" label="Avg days OOS" value={kpi.avgDays ? Math.round(kpi.avgDays) : '—'} unit="days"
            sub={kpi.skus ? `average out-of-stock streak · longest ${kpi.maxDays} d` : undefined} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 12 }}>
          <GlassCard title="Loss by category" note="loss of sale opportunity so far · click to filter" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6 }}>
              {byCat.map(([c, v]) => (
                <div key={c} onClick={() => setCats(cs => (cs.length === 1 && cs[0] === c ? [] : [c]))}
                  style={{ display: 'grid', gridTemplateColumns: '120px 1fr 64px', alignItems: 'center', gap: 10, cursor: 'pointer', opacity: cats.length && !cats.includes(c) ? 0.45 : 1 }}>
                  <span style={{ fontSize: 12, color: cats.includes(c) ? IC.t1 : IC.t2, fontWeight: cats.includes(c) ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c}</span>
                  <div style={{ height: 10, background: IC.hoverBg, borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${(v / maxCat) * 100}%`, height: '100%', background: gradMain(), borderRadius: 5 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: IC.t1, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inrShort(v)}</span>
                </div>
              ))}
              {!byCat.length && <div style={{ fontSize: 12, color: IC.t3 }}>No loss in this selection.</div>}
            </div>
          </GlassCard>

          <GlassCard title="Stock-out ageing" note="loss so far by days out of stock · click to filter" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Vertical columns: one per days-out range, height = loss so far. */}
              <div style={{ flex: 1, minHeight: 170, display: 'flex', alignItems: 'stretch', gap: 14, padding: '0 4px' }}>
                {byAge.map(b => {
                  return (
                    <div key={b.k} onClick={() => b.skus && setAge(a => (a === b.k ? null : b.k))}
                      title={`${b.skus} SKUs out ${b.k} · loss so far ${inr(b.loss)}`}
                      style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        cursor: b.skus ? 'pointer' : 'default', opacity: age && age !== b.k ? 0.45 : 1 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: IC.t1, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{inrShort(b.loss)}</span>
                      <div style={{ flex: 1, width: '100%', maxWidth: 56, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                        background: IC.hoverBg, borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ height: `${(b.loss / maxAge) * 100}%`, background: `linear-gradient(180deg, ${IC.acc}, ${IC.accBorder})` }} />
                      </div>
                      <div style={{ textAlign: 'center', lineHeight: 1.25 }}>
                        <div style={{ fontSize: 12, fontWeight: age === b.k ? 700 : 600, color: age === b.k ? IC.t1 : IC.t2, whiteSpace: 'nowrap' }}>{b.k}</div>
                        <div style={{ fontSize: 10.5, color: IC.t3, whiteSpace: 'nowrap' }}>{b.skus} SKU{b.skus === 1 ? '' : 's'}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </GlassCard>
        </div>

        <GlassCard
          title="SKU detail"
          note={`${fmtInt(rows.length) || 0} SKUs · sorted by ${COLS.find(c => c.key === sort.key)?.label.toLowerCase()}`}
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <SearchableMultiSelect label="Category" options={categories} selected={cats} onChange={setCats} width={150} height={30} />
              <input placeholder="Search SKU or sub-category…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 8, padding: '6px 10px', color: IC.t1, fontSize: 12, width: 200, maxWidth: '100%', boxSizing: 'border-box' }} />
              <ExportButton filename={`oos_loss_${data.asOf || 'today'}.csv`} columns={exportCols} rows={rows} />
            </div>
          }>
          <div style={{ overflow: 'auto', maxHeight: '62vh' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 12, color: IC.t2 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  {COLS.map(c => (
                    <SortableTh key={c.key} label={<span title={TIPS[c.key] || ''}>{c.label}</span>} sortKey={c.key} sortState={sort} onSort={onSort} width={c.w} align={c.align || 'right'} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.skuKey}>
                    {COLS.map(c => (
                      <td key={c.key} style={{ padding: '4px 10px', borderTop: `1px solid ${IC.border}`, textAlign: c.align || 'right', whiteSpace: c.key === 'sku' ? 'normal' : 'nowrap', fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle' }}>
                        {cell(r, c)}
                      </td>
                    ))}
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={COLS.length} style={{ padding: 20, textAlign: 'center', color: IC.t3 }}>No out-of-stock SKUs match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </>}
    </div>
  )
}
