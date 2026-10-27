import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { C } from '../../utils.js'
import { fmtNum, fmtInt, exportCsv } from '../theme.jsx'
import MobilePageHeader from '../../responsive/MobilePageHeader.jsx'
import HeaderFilterButton from '../../responsive/HeaderFilterButton.jsx'
import MasterTrendCard from '../../responsive/MasterTrendCard.jsx'
import CompactRankRow from '../../responsive/CompactRankRow.jsx'
import BottomSheet from '../../responsive/BottomSheet.jsx'
import FullScreenList from '../../responsive/FullScreenList.jsx'
import FilterSheet from '../../responsive/FilterSheet.jsx'
import CollapsibleSection from '../../responsive/CollapsibleSection.jsx'
import Skeleton from '../../responsive/Skeleton.jsx'
import { useBreakpoint } from '../../responsive/useBreakpoint.js'
import { Card, KV, ShowAllButton } from '../../responsive/CardKit.jsx'
import { stockedSkus, AGE_BUCKETS, ageOf, oosSummary, lossByCategory, lossByAge, OOS_EXPORT_COLS } from '../oosData.js'

// Out-of-stock loss below 1024px (mockup: docs/responsive/mockups/oos_mockup.html; look and
// components: MOBILE_DESIGN_SYSTEM.md). A full-screen view over Inventory Health, opened from the
// "Out-of-stock loss" row under the summary card. Display only: the rows and every total come from
// the same API and the same helpers (oosData.js) as the desktop view (OosLossView.jsx).
const M = C.m
const OUT30 = '30+'   // the "Out 30+ days" watch row = the 31-60 d and 60+ d buckets
const TOP = 10

const inr = n => (n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN'))
const inrShort = n => (n == null || n === 0 ? '—' : '₹' + fmtNum(n))
const dt = iso => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—')
const dec = n => (n == null ? '—' : n >= 10 ? Math.round(n).toLocaleString('en-IN') : n.toFixed(2))
// Days-out colour, the same thresholds as the laptop table (30+ red, 7+ amber).
const daysColor = d => (d >= 30 ? M.down : d >= 7 ? M.amber : M.ink)
const subCat = r => (r.subCategory && r.subCategory !== 'Uncategorized' ? r.subCategory : '—')
const flagOf = r => (r.basis && !r.basis.startsWith('Longest') ? r.basis : null)
const inAge = (r, age) => (age === OUT30 ? r.daysOos >= 31 : ageOf(r.daysOos) === age)
const ageLabel = age => (age === OUT30 ? 'Out 30+ days' : `${age} out`)

const SORTS = [
  { key: 'loss', label: 'Loss so far', value: r => r.lossToDate || 0, format: r => inr(r.lossToDate) },
  { key: 'day', label: 'Loss / day', value: r => r.dailyLoss || 0, format: r => `${inr(r.dailyLoss)}/day` },
  { key: 'days', label: 'Days out', value: r => r.daysOos, format: r => `${r.daysOos} d` },
]

const HOW = (
  <>
    <b>Avg daily sale</b>: B2C units per day over the SKU's longest unbroken in-stock run in the last 180 days (runs under 14 days use the 180-day average).{' '}
    <b>ASP</b>: 180-day average selling price incl. GST.{' '}
    <b>OOS since</b>: the day after the last in-stock day ("stock"), or the day after the last D2C sale for SKUs that were selling steadily and then stopped ("D2C sales stop").{' '}
    <b>Loss of sale opportunity</b> = days out × avg daily sale × ASP.
  </>
)

function SkuRow({ r, onOpen, last }) {
  const flag = flagOf(r)
  return (
    <button type="button" onClick={() => onOpen(r)}
      style={{ display: 'flex', gap: 10, width: '100%', padding: '10px 0', border: 'none', borderBottom: last ? 'none' : `1px solid ${M.line}`, background: 'transparent', textAlign: 'left', fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer' }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, letterSpacing: '.01em' }}>{r.sku}</span>
        <span style={{ display: 'block', fontSize: 12, color: M.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subCat(r)}</span>
        <span style={{ display: 'block', fontSize: 12, color: M.muted, marginTop: 3 }}>
          <b style={{ color: daysColor(r.daysOos) }}>{r.daysOos} d out</b> · {inr(r.dailyLoss)}/day
          {flag && <span style={{ display: 'block', color: M.amber, marginTop: 2 }}>{flag}</span>}
        </span>
      </span>
      <span style={{ flex: '0 0 auto', textAlign: 'right' }}>
        <b style={{ display: 'block', fontSize: M.type.listValue, fontVariantNumeric: 'tabular-nums' }}>{inrShort(r.lossToDate)}</b>
        <span style={{ fontSize: 12, color: M.muted }}>{r.category}</span>
      </span>
    </button>
  )
}

function SkuSheet({ r, onClose }) {
  const flag = r && flagOf(r)
  return (
    <BottomSheet open={!!r} onClose={onClose} title={r?.sku || ''} subtitle={r ? `${subCat(r)} · ${r.category}` : null}>
      {r && (
        <KV items={[
          { label: 'Loss so far', value: inr(r.lossToDate), color: M.down },
          { label: 'Loss / day', value: inr(r.dailyLoss) },
          { label: 'Days out', value: <span style={{ color: daysColor(r.daysOos) }}>{r.daysOos}<span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: M.muted }}>since {dt(r.oosSince)} · {r.oosSource === 'D2C sales stop' ? 'D2C sales stop' : 'stock'}</span></span> },
          { label: 'Avg daily sale', value: <>{dec(r.avgDailySale)}{flag && <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: M.amber }}>{flag}</span>}</> },
          { label: 'ASP', value: inr(r.asp) },
          { label: 'Last sale', value: dt(r.lastSale) },
          { label: 'Sales window', value: <>{r.windowDays ? `${dt(r.windowStart)} – ${dt(r.windowEnd)} · ${r.windowDays} d` : 'no in-stock run'}<span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: M.muted }}>{r.windowDays ? `${fmtInt(r.windowUnits) || 0} units sold` : 'longest in-stock run'}</span></> },
        ]} />
      )}
    </BottomSheet>
  )
}

export default function OosLossMobile({ open, onClose, data, error, lastSalesDate }) {
  const bp = useBreakpoint()
  const layout = bp.isPhoneLandscape ? 'landscape' : bp.width >= 768 ? 'tablet' : 'phone'
  const [cats, setCats] = useState([])
  const [age, setAge] = useState(null)
  const [sortKey, setSortKey] = useState('loss')
  const [filterOpen, setFilterOpen] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
  const [howSheet, setHowSheet] = useState(false)
  const [fullOpen, setFullOpen] = useState(false)
  const [sel, setSel] = useState(null)
  const listRef = useRef(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })

  // Like FullScreenList: opening pushes a history entry, so the Android/browser Back button closes it.
  useEffect(() => {
    if (!open) return
    let poppedByBack = false
    window.history.pushState({ oosView: true }, '')
    const onPop = () => { if (window.history.state?.oosView) return; poppedByBack = true; closeRef.current() }
    window.addEventListener('popstate', onPop)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('popstate', onPop)
      document.body.style.overflow = prev
      if (!poppedByBack && window.history.state?.oosView) window.history.back()
    }
  }, [open])

  const scoped = useMemo(() => stockedSkus(data), [data])
  const all = useMemo(() => oosSummary(scoped), [scoped])
  // Each card is drawn from the rows matching every OTHER filter, as on the laptop.
  const match = (r, { skipCat, skipAge } = {}) => (skipCat || !cats.length || cats.includes(r.category)) && (skipAge || !age || inAge(r, age))
  const rows = useMemo(() => scoped.filter(r => match(r)), [scoped, cats, age])
  const byCat = useMemo(() => lossByCategory(scoped.filter(r => match(r, { skipCat: true }))), [scoped, age])
  const byAge = useMemo(() => lossByAge(scoped.filter(r => match(r, { skipAge: true }))), [scoped, cats])
  const catTotal = useMemo(() => oosSummary(scoped.filter(r => match(r, { skipCat: true }))).loss, [scoped, age])
  const ageTotal = byAge.reduce((t, b) => t + b.loss, 0)
  const pctOf = (v, t) => (t > 0 ? `${Math.round((v / t) * 100)}%` : '')
  const out30 = useMemo(() => oosSummary(scoped.filter(r => r.daysOos >= 31 && (!cats.length || cats.includes(r.category)))), [scoped, cats])
  const sort = SORTS.find(s => s.key === sortKey)
  const sorted = useMemo(() => [...rows].sort((a, b) => sort.value(b) - sort.value(a)), [rows, sort])
  const categories = useMemo(() => {
    const m = new Map()
    for (const r of scoped) m.set(r.category, (m.get(r.category) || 0) + (r.lossToDate || 0))
    return [...m.entries()].map(([value, rank]) => ({ value, rank }))
  }, [scoped])

  // Keep the scroll position when a filter changes (nothing above the list resizes), except the
  // "Out 30+ days" row, which jumps to the list it filters.
  const toList = () => requestAnimationFrame(() => listRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  const pickCat = c => setCats(cs => (cs.length === 1 && cs[0] === c ? [] : [c]))
  const pickAge = a => setAge(x => (x === a ? null : a))
  const nFilters = (cats.length ? 1 : 0) + (age ? 1 : 0)

  if (!open) return null
  const s = all
  const maxCat = byCat[0]?.[1] || 1
  const maxAge = Math.max(1, ...byAge.map(b => b.loss))
  const counted = data?.asOf ? `OOS counted to ${dt(data.asOf)}` : null
  const sales = lastSalesDate ? `sales till ${dt(lastSalesDate)}` : null

  const metrics = [
    { key: 'loss', label: 'Loss of sale opportunity', value: inrShort(s.loss), valueColor: M.down, sub: `so far, this stock-out · ${fmtInt(s.skus) || 0} SKUs`,
      def: 'Days out of stock × avg daily sale × ASP, added up over the SKUs out of stock today.' },
    { key: 'skus', label: 'SKUs out', value: fmtInt(s.skus) || '0', def: 'SKUs with no stock in live warehouses today that sold (B2C) in the last 180 days.' },
    { key: 'day', label: 'Loss / day', value: inrShort(s.daily), def: 'Avg daily sale × ASP, added up: what each further day out of stock costs.' },
    { key: 'asp', label: 'Avg ASP', value: s.avgAsp == null ? '—' : inr(s.avgAsp), def: `Average selling price across ${s.aspSkus} SKUs (simple average of their 180-day ASPs).` },
    { key: 'days', label: 'Avg days out', value: s.skus ? `${Math.round(s.avgDays)} days` : '—', def: `Average out-of-stock streak; the longest is ${s.maxDays} days.` },
  ]
  const menu = {
    items: [
      { id: 'csv', group: 'Export CSV', label: 'Out-of-stock SKUs', onSelect: () => exportCsv(`oos_loss_${data?.asOf || 'today'}.csv`, OOS_EXPORT_COLS, sorted) },
      { id: 'how', label: "How it's calculated", onSelect: () => setHowSheet(true) },
    ],
  }
  const chip = (on, label, onClick) => (
    <button key={label} type="button" aria-pressed={on} onClick={onClick}
      style={{ flex: '0 0 auto', minHeight: 32, padding: '0 11px', borderRadius: M.radius.chip, border: 'none', background: on ? M.green : 'transparent', color: on ? '#fff' : M.hdr.chip, fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>{label}</button>
  )
  const clearChip = (label, onClick) => (
    <button key={label} type="button" onClick={onClick} aria-label={`Clear ${label}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 30, padding: '0 10px', margin: '0 6px 6px 0', borderRadius: M.radius.chip, border: 'none', background: M.hdr.pill, color: M.green, fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>{label} ✕</button>
  )

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Out-of-stock loss" className="oos-mobile"
      style={{ position: 'fixed', inset: 0, zIndex: C.z.modal, background: M.bg, display: 'flex', flexDirection: 'column', paddingTop: 'var(--safe-top)' }}>
      <MobilePageHeader onBack={onClose} backLabel="Inventory" title="Out-of-stock loss"
        filter={<HeaderFilterButton count={nFilters} onClick={() => setFilterOpen(true)} disabled={!data} />} menu={menu} />

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: `10px max(12px, var(--safe-right)) calc(20px + var(--safe-bottom)) max(12px, var(--safe-left))` }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, color: M.muted, margin: '0 2px', lineHeight: '17px' }}>
          {[counted, sales].filter(Boolean).join(' · ') || ' '}{' · SKUs with no stock in live warehouses that sold (B2C) in the last 180 days'}
        </div>

        {error && <Card><div style={{ fontSize: 13, color: M.down }}>Could not load: {error}</div></Card>}
        {!data && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, pointerEvents: 'none' }} aria-busy="true" aria-label="Loading out-of-stock loss">
            <Skeleton width="100%" height={232} radius={M.radius.card} /><Skeleton width="100%" height={56} radius={14} /><Skeleton width="100%" height={300} radius={M.radius.card} />
          </div>
        )}

        {data && <>
          <MasterTrendCard metrics={metrics} layout={layout} summary={false} />

          {/* Watch row: SKUs out for more than 30 days (31-60 d and 60+ d) - filters the list. */}
          <button type="button" onClick={() => { setAge(OUT30); toList() }} aria-pressed={age === OUT30}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, padding: '10px 12px', borderRadius: 14, background: '#fdf3f1', border: `1px solid ${age === OUT30 ? M.down : '#f4d7d2'}`, textAlign: 'left', fontFamily: 'var(--font)', cursor: 'pointer' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 13.5, color: '#7d241a' }}>Out 30+ days</b>
              <span style={{ fontSize: 12, color: '#8f5a52' }}>{fmtInt(out30.skus) || 0} SKUs · {inrShort(out30.loss)} lost so far</span>
            </span>
            <span aria-hidden="true" style={{ fontWeight: 700, color: M.down, fontSize: 18 }}>›</span>
          </button>

          <Card title="Loss by category" right={<span style={{ fontSize: 12, color: M.muted }}>tap to filter</span>}>
            {byCat.map(([c, v], i) => (
              <div key={c} style={{ opacity: cats.length && !cats.includes(c) ? 0.5 : 1 }}>
                <CompactRankRow name={<span style={{ color: cats.includes(c) ? M.green : M.ink, fontWeight: cats.includes(c) ? 700 : 600 }}>{c}</span>}
                  value={inrShort(v)} pct={pctOf(v, catTotal)} barPct={(v / maxCat) * 100} onClick={() => pickCat(c)} last={i === byCat.length - 1} />
              </div>
            ))}
            {!byCat.length && <div style={{ fontSize: 13, color: M.muted }}>No loss in this selection.</div>}
          </Card>

          <Card title="Stock-out ageing" right={<span style={{ fontSize: 12, color: M.muted }}>loss so far · tap to filter</span>}>
            {byAge.map((b, i) => (
              <div key={b.k} style={{ opacity: age && age !== b.k ? 0.5 : 1 }}>
                <CompactRankRow name={<span style={{ color: age === b.k ? M.green : M.ink, fontWeight: age === b.k ? 700 : 600 }}>{b.k} · {b.skus} SKU{b.skus === 1 ? '' : 's'}</span>}
                  value={inrShort(b.loss)} pct={pctOf(b.loss, ageTotal)} barPct={(b.loss / maxAge) * 100} onClick={b.skus ? () => pickAge(b.k) : undefined} last={i === byAge.length - 1} />
              </div>
            ))}
          </Card>

          <div ref={listRef} style={{ scrollMarginTop: 8 }}>
            <Card title="SKUs" right={<span style={{ fontSize: 12, color: M.muted }}>{nFilters ? `${rows.length} shown` : `${fmtInt(s.skus) || 0} SKUs`}</span>}>
              {nFilters > 0 && (
                <div>
                  {cats.length > 0 && clearChip(cats.join(', '), () => setCats([]))}
                  {age && clearChip(ageLabel(age), () => setAge(null))}
                </div>
              )}
              <div role="group" aria-label="Sort by" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '0 -16px 6px', padding: '0 16px', scrollbarWidth: 'none' }}>
                {SORTS.map(o => chip(o.key === sortKey, o.label, () => setSortKey(o.key)))}
              </div>
              {sorted.slice(0, TOP).map((r, i, arr) => <SkuRow key={r.skuKey} r={r} onOpen={setSel} last={i === arr.length - 1} />)}
              {!sorted.length && <div style={{ fontSize: 13, color: M.muted, padding: '10px 0' }}>No out-of-stock SKUs match.</div>}
              {sorted.length > TOP && <ShowAllButton onClick={() => setFullOpen(true)}>All {fmtInt(sorted.length)} SKUs →</ShowAllButton>}
            </Card>
          </div>

          <Card>
            <CollapsibleSection title="How it's calculated" summary="avg daily sale · ASP · OOS since · loss" open={howOpen} onToggle={() => setHowOpen(o => !o)}>
              <div style={{ fontSize: 12.5, color: '#4b554f', lineHeight: 1.5, paddingTop: 4 }}>{HOW}</div>
            </CollapsibleSection>
          </Card>
        </>}
      </div>
      </div>

      <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter out-of-stock SKUs"
        onReset={() => { setCats([]); setAge(null) }}
        rows={[
          { key: 'cat', label: 'Category', noun: 'categories', options: categories, selected: cats, multi: true, set: cats.length > 0,
            summary: cats.length ? cats.join(', ') : 'All categories', onApply: v => setCats(v), fmtRank: v => inrShort(v) },
          { key: 'age', label: 'Days out', noun: 'ranges', multi: false, set: !!age, summary: age ? ageLabel(age) : 'Any',
            options: [{ value: OUT30, label: 'Out 30+ days' }, ...AGE_BUCKETS.map(b => ({ value: b.k, label: `${b.k} out` }))],
            selected: age ? [age] : [], onApply: v => setAge(v[0] || null) },
        ]} />

      <FullScreenList open={fullOpen} onClose={() => setFullOpen(false)} title="Out-of-stock SKUs" noun="SKUs" items={rows} sorts={SORTS} initialSort={sortKey}
        name={r => r.sku} sub={r => `${subCat(r)} · ${r.daysOos} d out`} secondary={r => r.category}
        searchText={r => `${r.sku} ${r.category} ${r.subCategory || ''}`} groupOf={r => r.category} onSelect={setSel} />

      <SkuSheet r={sel} onClose={() => setSel(null)} />

      <BottomSheet open={howSheet} onClose={() => setHowSheet(false)} title="How it's calculated">
        <div style={{ fontSize: 13, color: '#4b554f', lineHeight: 1.55 }}>{HOW}</div>
      </BottomSheet>
    </div>,
    document.body,
  )
}
