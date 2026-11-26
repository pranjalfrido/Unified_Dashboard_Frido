import { useMemo, useState } from 'react'
import { C } from '../../utils.js'
import { Card, ShowAllButton, KV } from '../../responsive/CardKit.jsx'
import FullScreenList from '../../responsive/FullScreenList.jsx'
import BottomSheet from '../../responsive/BottomSheet.jsx'
import Skeleton from '../../responsive/Skeleton.jsx'
import { fmtCompact } from '../../responsive/format.js'
import { fmtDays, exportCsv } from '../theme.jsx'
import Seg from '../Seg.jsx'
import { COST_EXPORT_COLS } from '../costExport.js'
import { groupProducts, totalsOf, hasStock, byValue, cogsRateLabel } from '../costGroup.js'

// Inventory cost on a phone (<= 767px), round 2 (docs/responsive/mockups/inventory_cost_mobile_mockup.html).
// Layout only: rows come valued from InventoryCostTable (same COGS rate, same sub-category-average rule); this file
// only filters to SKUs that have stock, groups them into products, adds them up and lays them out as cards.
const M = C.m
const TOP = 10
const VIEW_KEY = 'frido.invCostView'
const AMBER = '#b7791f'
const AMBER_BG = '#fdf3e1'
const STATUS_ORDER = ['Excess', 'Sufficient', 'Low', 'Critical', 'Out of Stock', 'No Demand', 'Dead / No Sale']
const LIST_STATUSES = ['Slow Moving', 'Dead Stock'] // the laptop "Category" dropdown also offers these two lists
// DOI chip colours (inventory_cost_mobile_mockup.html .d-ex / .d-ok / .d-lo / .d-cr / .d-nd)
const TONE = {
  Excess: ['#e8f0fa', '#2f6fb3'], Sufficient: ['#e4f3ea', '#2e7d4f'], Low: ['#fdf3e1', AMBER], Critical: ['#fbe9e7', '#c0392b'],
  'Out of Stock': ['#fbe9e7', '#c0392b'], 'No Demand': ['#eceae6', '#6f7471'], 'Dead / No Sale': ['#eceae6', '#6f7471'],
}
const statusText = s => (s === 'No Demand' ? 'No demand' : s === 'Dead / No Sale' ? 'Dead / no sale' : s || '—')
const MAP_TEXT = { Mapped: 'Mapped', 'Sub-cat avg': 'Sub-category average', Missing: 'Missing, not valued' }
const units = n => Math.round(n || 0).toLocaleString('en-IN')
const rupees = n => `₹${Math.round(n || 0).toLocaleString('en-IN')}`
const trim = s => s.replace(/\.0+$/, '')
// 10.22 L · 18.4K · 840 (units in stock)
const compactUnits = n => (n >= 1e7 ? `${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(2)} L` : n >= 1e3 ? `${trim((n / 1e3).toFixed(1))}K` : units(n))
const plural = (n, w) => `${n.toLocaleString('en-IN')} ${w}${n === 1 ? '' : 's'}`

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

// DOI / status pill in the status colour; "No demand" when DOI is blank.
function Pill({ status, children, big = false }) {
  const [bg, fg] = TONE[status] || TONE['No Demand']
  return (
    <span style={{ display: 'inline-block', marginTop: big ? 0 : 4, padding: big ? '2px 9px' : '2px 8px', borderRadius: M.radius.chip, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, lineHeight: '16px', background: bg, color: fg }}>{children}</span>
  )
}
const doiPill = (doi, status) => <Pill status={doi == null ? 'No Demand' : status}>{doi == null ? 'No demand' : `DOI ${fmtDays(doi)}d`}</Pill>

function Tag({ r }) {
  if (r.cogsMap === 'Mapped') return null
  const miss = r.cogsMap === 'Missing'
  return <span style={{ display: 'inline-block', marginLeft: 6, padding: '0 6px', borderRadius: 6, background: miss ? '#eceae6' : AMBER_BG, color: miss ? M.muted : AMBER, fontSize: 12, fontWeight: 600, lineHeight: '16px', verticalAlign: '1px' }}>{miss ? 'No COGS' : 'Avg COGS'}</span>
}

// One row, same 2-column grid as Inward: left grows, right 88px; min height 64, 12px padding, thin divider.
function Row({ main, tag, line2, line3, value, chip, onClick }) {
  const clamp = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }
  const one = { display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 12, lineHeight: '16px', color: M.muted, marginTop: 1 }
  return (
    <button type="button" onClick={onClick}
      style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 88px', columnGap: 10, alignItems: 'start', width: '100%', minHeight: 64, padding: 12, border: 'none', borderBottom: `1px solid ${M.line}`,
        background: 'transparent', textAlign: 'left', fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer' }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ ...clamp, fontSize: M.type.listValue, fontWeight: 700, lineHeight: '17px' }}>{main}{tag}</span>
        {line2 != null && <span style={one}>{line2}</span>}
        <span style={{ ...one, fontVariantNumeric: 'tabular-nums' }}>{line3}</span>
      </span>
      <span style={{ textAlign: 'right', minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: M.type.listValue, fontWeight: 700, lineHeight: '17px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {chip}
      </span>
    </button>
  )
}

const perUnit = c => (c != null ? `${rupees(c)}/unit · ` : '')
const rowLine3 = (cogs, u, avg) => `${perUnit(cogs)}${units(u)} u · ${units(avg)}/day`

function ProductRow({ p, onClick }) {
  const line2 = `${p.category || '—'} · ${plural(p.variants.length, 'variant')}${p.missingN ? ` · ${p.missingN} No COGS` : ''}`
  return <Row main={p.name} line2={line2} line3={rowLine3(p.cogs, p.units, p.avgSale)} value={p.value > 0 ? fmtCompact(p.value) : '—'} chip={doiPill(p.doi, p.status)} onClick={onClick} />
}
// sku rows: main = SKU code, second line = product (sub-category) name
function SkuRow({ r, onClick }) {
  return <Row main={r.sku} tag={<Tag r={r} />} line2={r.subCategory || '—'} line3={rowLine3(r.cogs, r.totalInvt, r.avgSale)} value={r.totalCost != null ? fmtCompact(r.totalCost) : '—'} chip={doiPill(r.doi, r.stockStatus)} onClick={onClick} />
}

function Tile({ label, hint, value, sub, onClick, warn = false }) {
  const body = (
    <>
      <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: warn ? AMBER : M.muted, whiteSpace: 'nowrap' }}>{label}{hint}</div>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: warn ? AMBER : M.ink, marginTop: 4, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ fontSize: 12, color: warn ? AMBER : M.muted, marginTop: 1, whiteSpace: 'nowrap' }}>{sub}</div>
    </>
  )
  const box = { minWidth: 0, minHeight: 66, background: warn ? AMBER_BG : M.soft, borderRadius: M.radius.tile, padding: '8px 8px', border: 'none', textAlign: 'left', fontFamily: 'var(--font)', color: M.ink, overflow: 'hidden' }
  return onClick
    ? <button type="button" onClick={onClick} aria-label={`${label}: ${value}, ${sub}. Show details`} style={{ ...box, cursor: 'pointer' }}>{body}</button>
    : <div style={box}>{body}</div>
}

const sortsFor = product => [
  { key: product ? 'value' : 'totalCost', label: 'Value ↓', value: r => (product ? r.value : r.totalCost) },
  { key: product ? 'units' : 'totalInvt', label: 'Units', value: r => (product ? r.units : r.totalInvt) },
  { key: 'doi', label: 'DOI', value: r => r.doi },
  { key: 'avgSale', label: 'Avg sale', value: r => r.avgSale },
  ...(product ? [] : [{ key: 'cogs', label: 'COGS/unit', value: r => r.cogs }]),
].map(s => ({ ...s, format: () => '' }))

export default function InventoryCostMobile({ cogs, err, skus, allRows, slowSkus, deadSkus, isAdmin }) {
  const [mode, setMode] = useState(() => { try { return localStorage.getItem(VIEW_KEY) === 'sku' ? 'sku' : 'product' } catch { return 'product' } })
  const [status, setStatus] = useState('All')
  const [cats, setCats] = useState([]) // selected product categories; empty = all
  const [catOpen, setCatOpen] = useState(false)
  const [full, setFull] = useState(null) // null | 'main' | 'nocogs'
  const [noCogsOpen, setNoCogsOpen] = useState(false)
  const [rateOpen, setRateOpen] = useState(false)
  const [selProduct, setSelProduct] = useState(null)
  const [selSku, setSelSku] = useState(null)
  const product = mode === 'product'
  const pickMode = m => { setMode(m); try { localStorage.setItem(VIEW_KEY, m) } catch { /* private mode: fine */ } }

  // Only SKUs with stock count (a SKU with 0 units adds nothing to value or units and only inflates the SKU counts).
  const base = useMemo(() => allRows.filter(hasStock), [allRows])
  const categories = useMemo(() => [...new Set((skus || []).map(s => s.category).filter(Boolean))].sort(), [skus])
  const catRows = useMemo(() => (cats.length ? base.filter(r => cats.includes(r.category)) : base), [base, cats])
  const products = useMemo(() => groupProducts(catRows), [catRows])
  const inList = (set, sku) => !!set?.has(sku)
  const skuRows = useMemo(() => {
    const keep = r => status === 'All' || (status === 'Slow Moving' ? inList(slowSkus, r.sku) : status === 'Dead Stock' ? inList(deadSkus, r.sku) : r.stockStatus === status)
    return catRows.filter(keep).sort(byValue)
  }, [catRows, status, slowSkus, deadSkus])
  const prodRows = useMemo(() => {
    const keep = p => status === 'All' || (status === 'Slow Moving' ? p.variants.some(v => inList(slowSkus, v.sku)) : status === 'Dead Stock' ? p.variants.some(v => inList(deadSkus, v.sku)) : p.status === status)
    return products.filter(keep).sort((a, b) => b.value - a.value || b.units - a.units)
  }, [products, status, slowSkus, deadSkus])
  const scope = useMemo(() => (product ? prodRows.flatMap(p => p.variants) : skuRows), [product, prodRows, skuRows])
  const totals = useMemo(() => totalsOf(scope), [scope])
  const notValued = useMemo(() => scope.filter(r => r.cogsMap === 'Missing').sort((a, b) => (b.totalInvt || 0) - (a.totalInvt || 0)), [scope])
  const unmapped = useMemo(() => scope.filter(r => r.cogsMap !== 'Mapped'), [scope])
  const statusChips = useMemo(() => {
    const present = new Set([...base.map(r => r.stockStatus), ...products.map(p => p.status)])
    return STATUS_ORDER.filter(s => present.has(s)).concat(LIST_STATUSES.filter(s => (s === 'Slow Moving' ? slowSkus : deadSkus)))
  }, [base, products, slowSkus, deadSkus])
  const catCount = useMemo(() => { const m = {}; for (const r of base) m[r.category] = (m[r.category] || 0) + 1; return m }, [base])

  if (err) return <Card title="Inventory cost"><div style={{ fontSize: 13, color: M.down }}>Could not load COGS ({err}). Cost values need the COGS table.</div></Card>
  if (!cogs) return <Card title="Inventory cost"><Skeleton width="60%" height={14} /><div style={{ height: 8 }} /><Skeleton width="100%" height={64} /></Card>

  const rate = cogsRateLabel(cogs)
  const items = product ? prodRows : skuRows
  const noun = product ? 'products' : 'SKUs'
  const exportScope = () => exportCsv('inventory_cost_detail.csv', COST_EXPORT_COLS, [...scope].sort(byValue))
  const exportUnmapped = () => exportCsv('unmapped_cogs_skus.csv', [
    { label: 'Product ID', key: 'sku' }, { label: 'Category', key: 'category' }, { label: 'Sub-category', key: 'subCategory' },
    { label: 'Total Inventory', key: 'totalInvt' }, { label: 'Avg Sale (B2C)', key: 'avgSale' }, { label: 'Stock Status', key: 'stockStatus' },
    { label: 'Fallback used', key: 'fallback' }, { label: 'COGS used per unit', key: 'cogs' },
  ], [...unmapped].sort((a, b) => (b.totalInvt || 0) - (a.totalInvt || 0)).map(r => ({ ...r, fallback: r.cogsMap === 'Missing' ? 'None (not valued)' : 'Sub-category average' })))
  const toggleCat = c => setCats(p => (p.includes(c) ? p.filter(x => x !== c) : [...p, c]))

  const chips = (
    <div role="group" aria-label="Filter by status" style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', scrollbarWidth: 'none' }}>
      <Chip on={status === 'All'} onClick={() => setStatus('All')}>All</Chip>
      {statusChips.map(v => <Chip key={v} on={status === v} onClick={() => setStatus(v)}>{statusText(v)}</Chip>)}
      <Chip on={cats.length > 0} onClick={() => setCatOpen(true)} label="Category filter">{cats.length ? `Category · ${cats.length}` : 'Category'} ▾</Chip>
    </div>
  )

  const green = { background: M.green, color: '#fff', padding: '10px 14px calc(10px + var(--safe-bottom))' }
  const footerMain = l => {
    const t = totalsOf(product ? l.flatMap(p => p.variants) : l)
    return (
      <div style={green}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontSize: M.type.listValue, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          <span>Total · {plural(l.length, product ? 'product' : 'SKU')}</span><span>{fmtCompact(t.value)}</span>
        </div>
        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{units(t.units)} u · {units(t.avgSale)}/day avg sale · {t.missing.toLocaleString('en-IN')} no COGS</div>
      </div>
    )
  }
  const footerNoCogs = l => (
    <div style={green}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: M.type.listValue, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}><span>Total · {plural(l.length, 'SKU')}</span><span>{units(l.reduce((a, r) => a + (r.totalInvt || 0), 0))} u</span></div>
      <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>not valued · ₹0 counted in the inventory value</div>
    </div>
  )
  const listMenu = { title: 'Inventory cost', items: [
    { id: 'csv', label: 'Export CSV', onSelect: exportScope },
    { id: 'nocogs', label: `No COGS list (${totals.missing.toLocaleString('en-IN')})`, onSelect: () => setNoCogsOpen(true) },
  ] }

  const skuKv = r => [
    { label: 'Category', value: r.category || '—' },
    { label: 'Sub-category', value: r.subCategory || '—' },
    { label: 'SKU', value: r.sku },
    { label: 'COGS / unit', value: r.cogs != null ? rupees(r.cogs) : '—' },
    { label: 'Total inventory', value: `${units(r.totalInvt)} units` },
    { label: 'Avg sale (B2C)', value: `${units(r.avgSale)}/day` },
    { label: 'Total value', value: r.totalCost != null ? rupees(r.totalCost) : '—' },
    { label: 'DOI', value: r.doi == null ? 'No demand' : `${fmtDays(r.doi)}d` },
    { label: 'Status', value: <Pill status={r.stockStatus} big>{statusText(r.stockStatus)}</Pill> },
    { label: 'COGS status', value: MAP_TEXT[r.cogsMap] || r.cogsMap, color: r.cogsMap === 'Missing' ? AMBER : undefined },
  ]
  const p = selProduct

  return (
    <Card title={<span style={{ whiteSpace: 'nowrap' }}>Inventory cost</span>}
      right={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
          <button type="button" aria-label="Search inventory cost" onClick={() => setFull('main')}
            style={{ width: 44, height: 44, margin: '-4px', padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${M.line}`, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🔍</span>
          </button>
          <Seg isPhone hit44 label="Inventory cost view" value={mode} onChange={pickMode} options={[{ value: 'product', label: 'Product' }, { value: 'sku', label: 'SKU' }]} />
        </span>
      }
      sub={`Top ${Math.min(TOP, items.length)} of ${items.length.toLocaleString('en-IN')} ${noun} · by value`}>
      {rate.carried ? (
        <button type="button" onClick={() => setRateOpen(true)} aria-label={`${rate.text}. Tap for details`}
          style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, margin: '-14px 0 -8px', padding: 0, border: 'none', background: 'none', fontFamily: 'var(--font)', fontSize: 12, color: M.muted, cursor: 'pointer', textAlign: 'left' }}>
          <span aria-hidden="true">ⓘ</span><span>COGS rates: <b style={{ color: AMBER, fontWeight: 600 }}>{rate.text.replace('COGS rates: ', '')}</b></span>
        </button>
      ) : <div style={{ fontSize: 12, color: M.muted, margin: '-4px 0 8px' }}>{rate.text}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,.85fr) minmax(0,1.25fr)', gap: 8, margin: '14px 0 8px' }}>
        <Tile label="Inv. value" value={fmtCompact(totals.value)} sub="at cost" />
        <Tile label="Units" value={compactUnits(totals.units)} sub="in stock" />
        <Tile warn label="No COGS" hint={<span aria-hidden="true" style={{ marginLeft: 3 }}>ⓘ</span>} value={totals.missing.toLocaleString('en-IN')} sub={`SKUs · ${compactUnits(totals.missingUnits)} u`} onClick={() => setNoCogsOpen(true)} />
      </div>
      <div style={{ margin: '0 -16px', padding: '0 13px' }}>{chips}</div>
      <div style={{ margin: '0 -4px' }}>
        {items.slice(0, TOP).map(it => product
          ? <ProductRow key={it.key} p={it} onClick={() => setSelProduct(it)} />
          : <SkuRow key={it.skuKey || it.sku} r={it} onClick={() => setSelSku(it)} />)}
        {!items.length && <div style={{ padding: 16, textAlign: 'center', color: M.muted, fontSize: 13 }}>No {noun} match.</div>}
      </div>
      {items.length > TOP && <ShowAllButton onClick={() => setFull('main')}>View all {items.length.toLocaleString('en-IN')} {noun} →</ShowAllButton>}

      <FullScreenList open={full === 'main'} onClose={() => setFull(null)} title={`All ${noun}`} noun={noun} items={items} sorts={sortsFor(product)} initialSort={product ? 'value' : 'totalCost'}
        name={it => (product ? it.name : it.sku)} searchText={it => (product ? `${it.name} ${it.category} ${it.variants.map(v => v.sku).join(' ')}` : `${it.sku} ${it.subCategory || ''} ${it.category || ''}`)}
        autoFocusSearch tallChips extraControls={<div style={{ marginTop: 4 }}>{chips}</div>} footer={footerMain} menu={listMenu}
        renderRow={it => (product ? <ProductRow p={it} onClick={() => setSelProduct(it)} /> : <SkuRow r={it} onClick={() => setSelSku(it)} />)} />

      <FullScreenList open={full === 'nocogs'} onClose={() => setFull(null)} title="Not valued SKUs" noun="SKUs" items={notValued} sorts={sortsFor(false).filter(s => s.key !== 'cogs')} initialSort="totalInvt"
        name={r => r.sku} searchText={r => `${r.sku} ${r.subCategory || ''} ${r.category || ''}`} autoFocusSearch tallChips footer={footerNoCogs}
        menu={isAdmin ? { title: 'Not valued SKUs', items: [{ id: 'csv', label: 'Export CSV (all SKUs without own COGS)', onSelect: exportUnmapped }] } : undefined}
        renderRow={r => <SkuRow r={r} onClick={() => setSelSku(r)} />} />

      <BottomSheet open={rateOpen} onClose={() => setRateOpen(false)} title="COGS rates">
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: M.ink }}>{rate.why}</div>
      </BottomSheet>

      <BottomSheet open={noCogsOpen} onClose={() => setNoCogsOpen(false)} title="SKUs without their own COGS" subtitle={`In stock only · ${plural(totals.missing + totals.avgMapped, 'SKU')}`}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '2px 0 10px' }}>
          <div style={{ background: M.soft, borderRadius: M.radius.tile, padding: '9px 11px', minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: M.muted }}>Valued at sub-cat avg</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>{plural(totals.avgMapped, 'SKU')}</div>
            <div style={{ fontSize: 12, color: M.muted }}>included in {fmtCompact(totals.avgValue)}</div>
          </div>
          <div style={{ background: AMBER_BG, borderRadius: M.radius.tile, padding: '9px 11px', minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: AMBER }}>Not valued</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3, color: AMBER }}>{plural(totals.missing, 'SKU')}</div>
            <div style={{ fontSize: 12, color: AMBER }}>{units(totals.missingUnits)} units · ₹0 counted</div>
          </div>
        </div>
        <div style={{ background: AMBER_BG, borderRadius: M.radius.tile, padding: '10px 12px', fontSize: 12, lineHeight: 1.45, color: '#6b4a12', marginBottom: 8 }}>
          <b>Why:</b> no COGS uploaded for these SKUs. When the sub-category has an average, we use it; otherwise the stock is left out of the ₹ value. <b>Fix:</b> add COGS in the monthly COGS upload.
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontWeight: 700, color: M.muted, minHeight: 36 }}>
          <span>NOT VALUED · BY UNITS</span>
          {isAdmin && <button type="button" onClick={exportUnmapped} style={{ minHeight: 44, padding: '0 4px', border: 'none', background: 'none', color: M.green, fontWeight: 600, fontSize: 12, fontFamily: 'var(--font)', cursor: 'pointer' }}>Export CSV ⤓</button>}
        </div>
        {notValued.slice(0, TOP).map(r => (
          <Row key={r.skuKey || r.sku} main={r.sku} line2={`${r.subCategory || '—'}${r.category ? ` · ${r.category}` : ''}`} line3={`${units(r.totalInvt)} u · ${units(r.avgSale)}/day`}
            value={`${units(r.totalInvt)} u`} chip={<span style={{ display: 'inline-block', marginTop: 6, padding: '0 6px', borderRadius: 6, background: AMBER_BG, color: AMBER, fontSize: 12, fontWeight: 600, lineHeight: '16px' }}>No COGS</span>} onClick={() => setSelSku(r)} />
        ))}
        {!notValued.length && <div style={{ padding: 12, fontSize: 13, color: M.muted }}>Every SKU with stock has a COGS value.</div>}
        {notValued.length > TOP && <ShowAllButton onClick={() => setFull('nocogs')}>View all {notValued.length.toLocaleString('en-IN')} →</ShowAllButton>}
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

      <BottomSheet open={!!p} onClose={() => setSelProduct(null)} title={p?.name || ''} subtitle={p ? `${p.category || '—'} · ${plural(p.variants.length, 'variant')}` : ''}>
        {p && (
          <>
            <KV items={[
              { label: 'Inventory value', value: rupees(p.value) },
              { label: 'Units', value: units(p.units) },
              { label: 'Avg sale (B2C)', value: `${units(p.avgSale)}/day` },
              { label: 'DOI · status', value: <span>{p.doi == null ? 'No demand' : `${fmtDays(p.doi)}d`} <Pill status={p.status} big>{statusText(p.status)}</Pill></span> },
            ]} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: M.muted, margin: '12px 0 2px' }}><span>VARIANTS</span><span style={{ fontWeight: 500 }}>sorted by value</span></div>
            {p.variants.map(v => <SkuRow key={v.skuKey || v.sku} r={v} onClick={() => setSelSku(v)} />)}
          </>
        )}
      </BottomSheet>

      <BottomSheet open={!!selSku} onClose={() => setSelSku(null)} title={selSku?.sku || ''} subtitle={selSku?.subCategory}>
        {selSku && <KV items={skuKv(selSku)} />}
      </BottomSheet>
    </Card>
  )
}
