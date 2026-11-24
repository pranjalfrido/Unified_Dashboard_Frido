import { useState, useMemo, useEffect } from 'react'
import { IC, fmtDays, GlassCard, StatusChip, ExportButton, exportCsv, SearchableMultiSelect } from './theme.jsx'

const API = import.meta.env.VITE_API_URL || ''

// Inventory valued at cost. Same rows, slicers and search as the Inventory Detail table above
// (the caller passes that table's already-filtered SKU list); the units columns are replaced by
// units plus ₹ at COGS; the RTD / RAW / blocked columns are left out on purpose.
//
// COGS per unit comes from public.product_cogs_monthly (api/cogs-monthly.js), the same
// month-aware source the P&L tab uses. For each SKU we take its LATEST month with a cost:
//   Mapped        the SKU has its own COGS
//   Sub-cat avg   no COGS for the SKU, so the mean COGS of its sub-category's SKUs is used
//   Missing       neither exists, so the stock is NOT valued (shown as — and counted separately)

const inr = n => '₹' + Math.round(n || 0).toLocaleString('en-IN')
const monthStart = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`

// One fetch per page load; the COGS sheet changes monthly.
let cogsPromise = null
function loadLatestCogs() {
  if (!cogsPromise) {
    const now = new Date()
    const body = JSON.stringify({ startMonth: monthStart(new Date(now.getFullYear(), now.getMonth() - 6, 1)), endMonth: monthStart(now) })
    cogsPromise = fetch(`${API}/api/cogs-monthly`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      .then(r => { if (!r.ok) throw new Error(`cogs-monthly ${r.status}`); return r.json() })
      .then(({ rows }) => {
        // latest month with a positive cost, per SKU and per sub-category
        const latest = {}
        for (const r of rows || []) {
          if (!(r.cogs > 0)) continue
          if (!latest[r.sku] || r.month > latest[r.sku].month) latest[r.sku] = { month: r.month, cogs: r.cogs, subCategory: r.subCategory }
        }
        const sums = {}
        for (const v of Object.values(latest)) {
          if (!v.subCategory) continue
          const s = (sums[v.subCategory] ||= { sum: 0, n: 0 })
          s.sum += v.cogs; s.n += 1
        }
        const subAvg = {}
        for (const [k, s] of Object.entries(sums)) subAvg[k] = s.sum / s.n
        const month = Object.values(latest).reduce((m, v) => (v.month > m ? v.month : m), '')
        return { latest, subAvg, month }
      })
      .catch(e => { cogsPromise = null; throw e })
  }
  return cogsPromise
}

const MAP_STYLE = {
  Mapped: { c: IC.positive, tip: 'COGS found for this SKU' },
  'Sub-cat avg': { c: IC.status.Low.c, tip: 'No COGS for this SKU: using the average of its sub-category' },
  Missing: { c: IC.status.Critical.c, tip: 'No COGS for this SKU or its sub-category: stock is not valued' },
}
function MapChip({ kind }) {
  const s = MAP_STYLE[kind]
  return (
    <span title={s.tip} style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: 999, background: `${s.c}22`, border: `1px solid ${s.c}55`, fontSize: 11, fontWeight: 600, color: s.c, whiteSpace: 'nowrap' }}>{kind}</span>
  )
}

const COLS = [
  { key: 'category', label: 'Category', align: 'left' },
  { key: 'subCategory', label: 'Sub-category', align: 'left' },
  { key: 'sku', label: 'Product ID', align: 'left' },
  { key: 'cogs', label: 'COGS / unit', align: 'right' },
  { key: 'totalInvt', label: 'Total Invt', align: 'right' },
  { key: 'avgSale', label: 'Avg Sale (B2C)', align: 'right' },
  { key: 'totalCost', label: 'Total Inv Value', align: 'right' },
  { key: 'doi', label: 'DOI', align: 'right' },
  { key: 'stockStatus', label: 'Status', align: 'right' },
  { key: 'cogsMap', label: 'COGS', align: 'right' },
]
const SHOW_STEP = 300

const STATUS_ORDER = ['Excess', 'Sufficient', 'Low', 'Critical', 'Out of Stock', 'No Demand', 'Dead / No Sale']

// slowSkus / deadSkus: Sets of SKU codes from the page's own Slow Moving / Dead Stock sub-category
// lists, so this filter agrees with those two cards.
export default function InventoryCostTable({ skus, maxHeight = 520, isAdmin = false, slowSkus, deadSkus }) {
  const [search, setSearch] = useState('')
  const [view, setView] = useState([])   // selected categories; empty = all SKUs
  const [cogs, setCogs] = useState(null)
  const [err, setErr] = useState(null)
  const [sort, setSort] = useState({ key: 'totalCost', dir: 'desc' })
  const [shown, setShown] = useState(SHOW_STEP)

  useEffect(() => { let on = true; loadLatestCogs().then(c => on && setCogs(c)).catch(e => on && setErr(e.message)); return () => { on = false } }, [])

  const viewOptions = useMemo(() => {
    const present = new Set((skus || []).map(s => s.stockStatus))
    const statuses = [...STATUS_ORDER.filter(x => present.has(x)), ...[...present].filter(x => x && !STATUS_ORDER.includes(x))]
    return [...(slowSkus ? ['Slow Moving'] : []), ...(deadSkus ? ['Dead Stock'] : []), ...statuses]
  }, [skus, slowSkus, deadSkus])

  const rows = useMemo(() => {
    if (!cogs) return []
    // A SKU is kept when it matches ANY selected category.
    const keep = s => !view.length || view.some(v =>
      v === 'Slow Moving' ? slowSkus?.has(s.sku)
      : v === 'Dead Stock' ? deadSkus?.has(s.sku)
      : s.stockStatus === v)
    const q = search.trim().toLowerCase()
    const match = s => !q || s.sku.toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q) || (s.subCategory || '').toLowerCase().includes(q)
    return (skus || []).filter(s => keep(s) && match(s)).map(s => {
      const own = cogs.latest[s.sku]
      const avg = cogs.subAvg[s.subCategory]
      const unit = own ? own.cogs : avg != null ? avg : null
      return {
        ...s,
        cogs: unit,
        cogsMap: own ? 'Mapped' : avg != null ? 'Sub-cat avg' : 'Missing',
        totalCost: unit != null ? unit * (s.totalInvt || 0) : null,
      }
    })
  }, [skus, cogs, view, search, slowSkus, deadSkus])

  const sorted = useMemo(() => {
    const { key, dir } = sort, m = dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = a[key], y = b[key]
      if (x == null && y == null) return 0
      if (x == null) return 1            // unvalued rows always sink
      if (y == null) return -1
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * m
    })
  }, [rows, sort])

  // SKUs with no COGS row of their own (valued at the sub-category average, or not valued at all).
  const unmapped = useMemo(() => rows.filter(r => r.cogsMap !== 'Mapped').sort((a, b) => (b.totalInvt || 0) - (a.totalInvt || 0)), [rows])
  const exportUnmapped = () => exportCsv('unmapped_cogs_skus.csv', [
    { label: 'Product ID', key: 'sku' }, { label: 'Category', key: 'category' }, { label: 'Sub-category', key: 'subCategory' },
    { label: 'Total Inventory', key: 'totalInvt' }, { label: 'Avg Sale (B2C)', key: 'avgSale' }, { label: 'Stock Status', key: 'stockStatus' },
    { label: 'Fallback used', key: 'fallback' }, { label: 'COGS used per unit', key: 'cogs' },
  ], unmapped.map(r => ({ ...r, fallback: r.cogsMap === 'Missing' ? 'None (not valued)' : 'Sub-category average' })))

  const totals = useMemo(() => {
    const t = { totalInvt: 0, avgSale: 0, totalCost: 0, missing: 0, avgMapped: 0, n: rows.length, missingUnits: 0 }
    for (const r of rows) {
      t.totalInvt += r.totalInvt || 0
      t.avgSale += r.avgSale || 0
      t.totalCost += r.totalCost || 0
      if (r.cogsMap === 'Missing') { t.missing += 1; t.missingUnits += r.totalInvt || 0 }
      if (r.cogsMap === 'Sub-cat avg') t.avgMapped += 1
    }
    return t
  }, [rows])

  const onSort = key => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'category' || key === 'subCategory' || key === 'sku' ? 'asc' : 'desc' })
  const th = { padding: '10px 10px', fontSize: 11, fontWeight: 700, color: IC.t2, textTransform: 'uppercase', letterSpacing: '.04em', background: IC.surface, cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: `1px solid ${IC.border}` }
  const td = { padding: '10px 10px', fontSize: 12.5, whiteSpace: 'nowrap', borderBottom: `1px solid ${IC.border}`, fontVariantNumeric: 'tabular-nums' }

  const note = cogs
    ? `${rows.length.toLocaleString('en-IN')} SKUs · COGS as of ${cogs.month.slice(0, 7)}${totals.missing ? ` · ${totals.missing} not valued` : ''}`
    : 'Loading COGS…'

  return (
    <GlassCard
      title="Inventory Cost Detail"
      note={note}
      action={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input placeholder="Search SKU…" value={search} onChange={e => { setSearch(e.target.value); setShown(SHOW_STEP) }}
          style={{ background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 8, padding: '6px 10px', color: IC.t1, fontSize: 12, width: 200, maxWidth: '100%', boxSizing: 'border-box' }} />
        <SearchableMultiSelect label="Category" options={viewOptions} selected={view}
          onChange={v => { setView(v); setShown(SHOW_STEP) }} width={122} height={30} />
        {isAdmin && cogs && (
          <button onClick={exportUnmapped} disabled={!unmapped.length}
            title="SKUs in this table with no COGS of their own (admin only)"
            style={{ fontSize: 11, color: IC.t2, background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 7, padding: '5px 10px', cursor: unmapped.length ? 'pointer' : 'default', opacity: unmapped.length ? 1 : 0.5 }}>
            ⭳ Unmapped COGS ({unmapped.length.toLocaleString('en-IN')})
          </button>
        )}
        <ExportButton filename="inventory_cost_detail.csv" rows={sorted}
          columns={[
            { label: 'Category', key: 'category' }, { label: 'Sub-category', key: 'subCategory' }, { label: 'Product ID', key: 'sku' },
            { label: 'COGS per unit', key: 'cogs' }, { label: 'Total Inventory', key: 'totalInvt' }, { label: 'Avg Sale (B2C)', key: 'avgSale' }, { label: 'Total Inventory Value', key: 'totalCost' },
            { label: 'DOI', key: 'doi' }, { label: 'Stock Status', key: 'stockStatus' }, { label: 'COGS mapping', key: 'cogsMap' },
          ]} />
        </div>
      }
    >
      {err && <div style={{ padding: 16, color: IC.status.Critical.c, fontSize: 13 }}>Could not load COGS ({err}). Cost values need the COGS table.</div>}
      {!err && !cogs && <div style={{ padding: 16, color: IC.t3, fontSize: 13 }}>Loading COGS…</div>}
      {cogs && (
        <div style={{ maxHeight, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: IC.surface }}>
              <tr>
                {COLS.map(c => (
                  <th key={c.key} onClick={() => onSort(c.key)} style={{ ...th, textAlign: c.align }}>
                    {c.label}{sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, shown).map(r => (
                <tr key={r.skuKey || r.sku}>
                  <td style={{ ...td, color: IC.t1 }}>{r.category}</td>
                  <td style={{ ...td, color: IC.t2 }}>{r.subCategory}</td>
                  <td style={{ ...td, color: IC.t1, fontWeight: 700 }}>{r.sku}</td>
                  <td style={{ ...td, textAlign: 'right', color: IC.t2 }}>{r.cogs != null ? inr(r.cogs) : '—'}</td>
                  <td style={{ ...td, textAlign: 'right', color: IC.t1 }}>{Math.round(r.totalInvt || 0).toLocaleString('en-IN')}</td>
                  <td style={{ ...td, textAlign: 'right', color: IC.t2 }}>{Math.round(r.avgSale || 0).toLocaleString('en-IN')}</td>
                  <td style={{ ...td, textAlign: 'right', color: IC.t1, fontWeight: 700 }}>{r.totalCost != null ? inr(r.totalCost) : '—'}</td>
                  <td style={{ ...td, textAlign: 'right', color: IC.t1, fontWeight: 700 }}>{fmtDays(r.doi)}d</td>
                  <td style={{ ...td, textAlign: 'right' }}><StatusChip status={r.stockStatus} /></td>
                  <td style={{ ...td, textAlign: 'right' }}><MapChip kind={r.cogsMap} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 3, background: IC.surface }}>
              <tr>
                <td style={{ ...td, fontWeight: 700, color: IC.t1}}>Total</td>
                <td style={{ ...td, position: 'sticky', bottom: 0, background: IC.surface, color: IC.t3 }}>{totals.n.toLocaleString('en-IN')} SKUs</td>
                <td style={{ ...td}} />
                <td style={{ ...td}} />
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: IC.t1}}>{Math.round(totals.totalInvt).toLocaleString('en-IN')}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: IC.t1}}>{Math.round(totals.avgSale).toLocaleString('en-IN')}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: IC.t1}}>{inr(totals.totalCost)}</td>
                <td style={{ ...td}} />
                <td style={{ ...td}} />
                <td style={{ ...td, textAlign: 'right', color: IC.t3, fontSize: 11}}>
                  {totals.avgMapped ? `${totals.avgMapped} avg · ` : ''}{totals.missing ? `${totals.missing} missing` : 'all mapped'}
                </td>
              </tr>
            </tfoot>
          </table>
          {shown < sorted.length && (
            <div style={{ padding: 12, textAlign: 'center' }}>
              <button onClick={() => setShown(n => n + SHOW_STEP)}
                style={{ fontSize: 12, color: IC.t2, background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>
                Show {Math.min(SHOW_STEP, sorted.length - shown)} more ({(sorted.length - shown).toLocaleString('en-IN')} left)
              </button>
            </div>
          )}
        </div>
      )}
    </GlassCard>
  )
}
