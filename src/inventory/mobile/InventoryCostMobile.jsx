import { useMemo, useState } from 'react'
import { C } from '../../utils.js'
import { Card, ShowAllButton, KV } from '../../responsive/CardKit.jsx'
import FullScreenList from '../../responsive/FullScreenList.jsx'
import BottomSheet from '../../responsive/BottomSheet.jsx'
import ActionMenu from '../../responsive/ActionMenu.jsx'
import Skeleton from '../../responsive/Skeleton.jsx'
import { fmtCompact } from '../../responsive/format.js'
import { fmtDays, exportCsv } from '../theme.jsx'
import { statusColor } from './invStatus.js'
import { COST_EXPORT_COLS } from '../costExport.js'

// Inventory cost detail on a phone (<= 767px). Layout only: every row, total and filter comes from
// InventoryCostTable's own memos (same COGS, same valuation, same status filter as the laptop table);
// this file lays them out as cards. docs/INVENTORY_COST_MOBILE_REPORT.md has the decisions.
const M = C.m
const TOP = 10
const LIST_STATUSES = ['Slow Moving', 'Dead Stock'] // the laptop "Category" dropdown also offers these two lists
const statusText = s => (s === 'No Demand' ? 'No demand' : s === 'Dead / No Sale' ? 'Dead / no sale' : s || '—')
const MAP_TEXT = { Mapped: 'Mapped', 'Sub-cat avg': 'Sub-category average', Missing: 'Missing, not valued' }
const units = n => Math.round(n || 0).toLocaleString('en-IN')
const monthLabel = ym => new Date(`${String(ym).slice(0, 7)}-01T00:00:00`).toLocaleString('en-IN', { month: 'short', year: 'numeric' })

// Same sums as the laptop table's Total row.
function totalsOf(list) {
  const t = { n: list.length, units: 0, avgSale: 0, value: 0, missing: 0, avgMapped: 0 }
  for (const r of list) {
    t.units += r.totalInvt || 0
    t.avgSale += r.avgSale || 0
    t.value += r.totalCost || 0
    if (r.cogsMap === 'Missing') t.missing += 1
    if (r.cogsMap === 'Sub-cat avg') t.avgMapped += 1
  }
  return t
}

// A filter chip: looks 32px tall, but the button around it is 44px so it is easy to hit.
function Chip({ on, children, onClick, label }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} onClick={onClick}
      style={{ flex: '0 0 auto', minHeight: 44, padding: '0 3px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', height: 32, padding: '0 12px', borderRadius: M.radius.chip, whiteSpace: 'nowrap', fontSize: 13, fontWeight: on ? 700 : 500,
        border: `1px solid ${on ? M.green : M.line}`, background: on ? M.green : '#fff', color: on ? '#fff' : M.ink }}>{children}</span>
    </button>
  )
}

function DoiChip({ r }) {
  const blank = r.doi == null
  const col = statusColor(blank ? 'No Demand' : r.stockStatus)
  const light = col === M.g4
  return (
    <span style={{ display: 'inline-block', marginTop: 4, padding: '2px 8px', borderRadius: M.radius.chip, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, lineHeight: '16px',
      background: light ? '#eef1ef' : `${col}1f`, color: light ? M.muted : col, border: `1px solid ${light ? '#dfe5e1' : `${col}40`}` }}>
      {blank ? 'No demand' : `${fmtDays(r.doi)}d`}
    </span>
  )
}

// One SKU row: left grows (name, SKU · category, price · units · per day), right 88px (value + DOI chip).
function CostRow({ r, onClick }) {
  const clamp = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }
  const one = { display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const tag = r.cogsMap === 'Mapped' ? null : (
    <span style={{ display: 'inline-block', marginRight: 6, padding: '0 6px', borderRadius: 6, background: '#eef1ef', color: M.muted, fontSize: 12, fontWeight: 600, lineHeight: '16px' }}>
      {r.cogsMap === 'Missing' ? 'No COGS' : 'Avg COGS'}
    </span>
  )
  return (
    <button type="button" onClick={onClick}
      style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 88px', columnGap: 10, alignItems: 'start', width: '100%', minHeight: 64, padding: 12, border: 'none', borderBottom: `1px solid ${M.line}`,
        background: 'transparent', textAlign: 'left', fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer' }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ ...clamp, fontSize: M.type.listValue, fontWeight: 700, lineHeight: '17px' }}>{r.subCategory || r.sku}</span>
        <span style={{ ...one, fontSize: 12, lineHeight: '16px', color: M.muted, marginTop: 1 }}>{r.sku}{r.category ? ` · ${r.category}` : ''}</span>
        <span style={{ ...one, fontSize: 12, lineHeight: '16px', color: M.muted, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
          {tag}{r.cogs != null ? `₹${Math.round(r.cogs).toLocaleString('en-IN')}/unit · ` : ''}{units(r.totalInvt)} units · {units(r.avgSale)}/day
        </span>
      </span>
      <span style={{ textAlign: 'right', minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: M.type.listValue, fontWeight: 700, lineHeight: '17px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{r.totalCost != null ? fmtCompact(r.totalCost) : '—'}</span>
        <DoiChip r={r} />
      </span>
    </button>
  )
}

function Tile({ label, value, color, onClick, hint }) {
  const body = (
    <>
      <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: M.muted, whiteSpace: 'nowrap' }}>{label}{hint}</div>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: color || M.ink, marginTop: 2, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </>
  )
  const box = { flex: '1 1 0', minWidth: 0, background: M.soft, borderRadius: M.radius.tile, padding: '9px 8px', border: `1px solid ${M.tileBorder}`, textAlign: 'left', fontFamily: 'var(--font)', color: M.ink }
  return onClick
    ? <button type="button" onClick={onClick} aria-label={`${label}: ${value}. Show definition`} style={{ ...box, cursor: 'pointer' }}>{body}</button>
    : <div style={box}>{body}</div>
}

const SORTS = [
  { key: 'totalCost', label: 'Value ↓', value: r => r.totalCost },
  { key: 'totalInvt', label: 'Units', value: r => r.totalInvt },
  { key: 'doi', label: 'DOI', value: r => r.doi },
  { key: 'avgSale', label: 'Avg sale', value: r => r.avgSale },
  { key: 'cogs', label: 'COGS/unit', value: r => r.cogs },
].map(s => ({ ...s, format: () => '' }))

export default function InventoryCostMobile({ cogs, err, skus, rows, view, setView, viewOptions, isAdmin }) {
  const [cats, setCats] = useState([]) // selected product categories; empty = all
  const [catOpen, setCatOpen] = useState(false)
  const [full, setFull] = useState(false)
  const [onlyUnmapped, setOnlyUnmapped] = useState(false)
  const [sel, setSel] = useState(null)
  const [defOpen, setDefOpen] = useState(false)

  const statusChips = useMemo(() => viewOptions.filter(v => !LIST_STATUSES.includes(v)).concat(viewOptions.filter(v => LIST_STATUSES.includes(v))), [viewOptions])
  const categories = useMemo(() => [...new Set((skus || []).map(s => s.category).filter(Boolean))].sort(), [skus])
  const catCount = useMemo(() => { const m = {}; for (const r of rows) m[r.category] = (m[r.category] || 0) + 1; return m }, [rows])
  const list = useMemo(() => (cats.length ? rows.filter(r => cats.includes(r.category)) : rows), [rows, cats])
  const byValue = useMemo(() => [...list].sort((a, b) => (a.totalCost == null) - (b.totalCost == null) || (b.totalCost || 0) - (a.totalCost || 0)), [list])
  const totals = useMemo(() => totalsOf(list), [list])
  const unmapped = useMemo(() => list.filter(r => r.cogsMap !== 'Mapped'), [list])
  const fullItems = onlyUnmapped ? unmapped : list

  if (err) return <Card title="Inventory cost detail"><div style={{ fontSize: 13, color: M.down }}>Could not load COGS ({err}). Cost values need the COGS table.</div></Card>
  if (!cogs) return <Card title="Inventory cost detail"><Skeleton width="60%" height={14} /><div style={{ height: 8 }} /><Skeleton width="100%" height={64} /></Card>

  const closeFull = () => { setFull(false); setOnlyUnmapped(false) }
  const openFull = only => { setOnlyUnmapped(!!only); setFull(true) }
  const pickStatus = v => setView(v === 'All' ? [] : [v])
  const toggleCat = c => setCats(p => (p.includes(c) ? p.filter(x => x !== c) : [...p, c]))

  const chips = (
    <div role="group" aria-label="Filter by status" style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', scrollbarWidth: 'none' }}>
      <Chip on={!view.length} onClick={() => pickStatus('All')}>All</Chip>
      {statusChips.map(v => <Chip key={v} on={view.length === 1 && view[0] === v} onClick={() => pickStatus(v)}>{statusText(v)}</Chip>)}
      <Chip on={cats.length > 0} onClick={() => setCatOpen(true)} label="Category filter">{cats.length ? `Category · ${cats.length}` : 'Category'} ▾</Chip>
    </div>
  )

  const menu = [
    { id: 'csv', label: 'Export CSV', onSelect: () => exportCsv('inventory_cost_detail.csv', COST_EXPORT_COLS, byValue) },
    ...(isAdmin ? [{ id: 'unmapped', label: `Unmapped COGS (${unmapped.length.toLocaleString('en-IN')}) · no own COGS`, onSelect: () => setTimeout(() => openFull(true), 350) }] : []),
  ]

  const footer = l => {
    const t = totalsOf(l)
    return (
      <div style={{ background: '#fff', borderTop: `1px solid ${M.line}`, boxShadow: '0 -4px 12px -8px rgba(28,52,40,.25)', padding: '10px 14px calc(10px + var(--safe-bottom))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontSize: M.type.listValue, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          <span>Total · {t.n.toLocaleString('en-IN')} SKUs</span><span>{fmtCompact(t.value)}</span>
        </div>
        <div style={{ fontSize: 12, color: M.muted, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          {units(t.units)} units · {units(t.avgSale)}/day avg sale · <span style={{ color: t.missing ? M.amber : M.muted, fontWeight: t.missing ? 700 : 400 }}>{t.missing.toLocaleString('en-IN')} missing COGS</span>
        </div>
      </div>
    )
  }

  const extra = (
    <div style={{ marginTop: 4 }}>
      {chips}
      {onlyUnmapped && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: M.muted, minHeight: 44 }}>
          <span style={{ flex: 1, minWidth: 0 }}>SKUs without their own COGS: <b style={{ color: M.ink }}>{unmapped.length.toLocaleString('en-IN')}</b> ({totals.missing} not valued + {totals.avgMapped} at sub-category average)</span>
          <button type="button" onClick={() => setOnlyUnmapped(false)} style={{ minHeight: 44, padding: '0 6px', border: 'none', background: 'none', color: M.green, fontWeight: 700, fontSize: 13, fontFamily: 'var(--font)', cursor: 'pointer' }}>Show all</button>
        </div>
      )}
    </div>
  )

  return (
    <Card title="Inventory cost detail"
      right={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <button type="button" aria-label="Search inventory cost SKUs" onClick={() => openFull(false)}
            style={{ width: 44, height: 44, borderRadius: 10, border: `1px solid ${M.line}`, background: '#fff', color: M.ink, fontSize: 16, cursor: 'pointer', fontFamily: 'var(--font)' }}>🔍</button>
          <ActionMenu tone="light" size={44} title="Inventory cost detail" label="Inventory cost actions" items={menu} />
        </span>
      }
      sub={`${totals.n.toLocaleString('en-IN')} SKUs · COGS as of ${monthLabel(cogs.month)} · ${totals.missing.toLocaleString('en-IN')} not valued`}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <Tile label="Inv. value" value={fmtCompact(totals.value)} />
        <Tile label="Units" value={units(totals.units)} />
        <Tile label="Not valued" value={totals.missing.toLocaleString('en-IN')} color={totals.missing ? M.amber : undefined} onClick={() => setDefOpen(true)} hint={<span aria-hidden="true" style={{ marginLeft: 3, textTransform: 'none' }}>ⓘ</span>} />
      </div>
      <div style={{ margin: '0 -16px', padding: '0 13px' }}>{chips}</div>
      <div style={{ margin: '0 -4px' }}>
        {byValue.slice(0, TOP).map(r => <CostRow key={r.skuKey || r.sku} r={r} onClick={() => setSel(r)} />)}
        {!byValue.length && <div style={{ padding: 16, textAlign: 'center', color: M.muted, fontSize: 13 }}>No SKUs match.</div>}
      </div>
      {byValue.length > TOP && <ShowAllButton onClick={() => openFull(false)}>View all {byValue.length.toLocaleString('en-IN')} SKUs →</ShowAllButton>}

      <FullScreenList open={full} onClose={closeFull} title="All SKUs" noun="SKUs" items={fullItems} sorts={SORTS} initialSort="totalCost"
        name={r => r.sku} searchText={r => `${r.sku} ${r.subCategory || ''} ${r.category || ''}`} autoFocusSearch tallChips
        extraControls={extra} footer={footer}
        renderRow={r => <CostRow r={r} onClick={() => setSel(r)} />} />

      <BottomSheet open={defOpen} onClose={() => setDefOpen(false)} title="Not valued vs Unmapped COGS">
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: M.ink }}>
          <p style={{ margin: '0 0 10px' }}><b>Not valued ({totals.missing.toLocaleString('en-IN')})</b>: SKUs with no COGS of their own and no sub-category average. Their stock is <b>not</b> in the inventory value.</p>
          <p style={{ margin: 0 }}><b>Unmapped COGS ({unmapped.length.toLocaleString('en-IN')})</b>, in the ⋯ menu: every SKU without its own COGS. That is the {totals.missing.toLocaleString('en-IN')} above plus {totals.avgMapped.toLocaleString('en-IN')} that are valued at the sub-category average (tagged "Avg COGS").</p>
        </div>
      </BottomSheet>

      <BottomSheet open={catOpen} onClose={() => setCatOpen(false)} title="Category" subtitle={`${categories.length} categories`}>
        {categories.map(c => {
          const on = cats.includes(c)
          return (
            <button key={c} type="button" role="checkbox" aria-checked={on} onClick={() => toggleCat(c)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 48, padding: '0 2px', border: 'none', borderTop: `1px solid ${M.line}`, background: 'none', textAlign: 'left', fontFamily: 'var(--font)', fontSize: 14, color: M.ink, cursor: 'pointer' }}>
              <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${on ? M.green : M.g4}`, background: on ? M.green : '#fff', color: '#fff', fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{on ? '✓' : ''}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{c}</span>
              <span style={{ color: M.muted, fontSize: 12 }}>{(catCount[c] || 0).toLocaleString('en-IN')} SKUs</span>
            </button>
          )
        })}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={() => setCats([])} style={{ flex: 1, minHeight: 46, borderRadius: 12, border: `1px solid ${M.line}`, background: '#fff', color: M.ink, fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>Clear</button>
          <button type="button" onClick={() => setCatOpen(false)} style={{ flex: 1, minHeight: 46, borderRadius: 12, border: 'none', background: M.green, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>Done</button>
        </div>
      </BottomSheet>

      <BottomSheet open={!!sel} onClose={() => setSel(null)} title={sel?.sku || ''} subtitle={sel?.subCategory}>
        {sel && (
          <KV items={[
            { label: 'Category', value: sel.category || '—' },
            { label: 'Sub-category', value: sel.subCategory || '—' },
            { label: 'SKU', value: sel.sku },
            { label: 'COGS / unit', value: sel.cogs != null ? `₹${Math.round(sel.cogs).toLocaleString('en-IN')}` : '—' },
            { label: 'Total inventory', value: `${units(sel.totalInvt)} units` },
            { label: 'Avg sale (B2C)', value: `${units(sel.avgSale)}/day` },
            { label: 'Total value', value: sel.totalCost != null ? `₹${Math.round(sel.totalCost).toLocaleString('en-IN')}` : '—' },
            { label: 'DOI', value: sel.doi == null ? 'No demand' : `${fmtDays(sel.doi)}d` },
            { label: 'Status', value: statusText(sel.stockStatus), color: statusColor(sel.stockStatus) === M.g4 ? undefined : statusColor(sel.stockStatus) },
            { label: 'COGS status', value: MAP_TEXT[sel.cogsMap] || sel.cogsMap, color: sel.cogsMap === 'Missing' ? M.amber : undefined },
          ]} />
        )}
      </BottomSheet>
    </Card>
  )
}
