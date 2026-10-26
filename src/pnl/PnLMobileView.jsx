import { useEffect, useMemo, useState } from 'react'
import { C, fmtN, exportCSV } from '../utils.js'
import { fmtSigned as fmt } from './pnlUtils.js'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
import MasterTrendCard from '../responsive/MasterTrendCard.jsx'
import { groupSumTrend } from '../responsive/trend.js'
import { Card, ShowAllButton, KV } from '../responsive/CardKit.jsx'
import InfoStrip from '../responsive/InfoStrip.jsx'
import SegmentToggle from '../responsive/SegmentToggle.jsx'
import MobileRankedList from '../responsive/MobileRankedList.jsx'
import FullScreenList from '../responsive/FullScreenList.jsx'
import BottomSheet from '../responsive/BottomSheet.jsx'
import WatchlistCard from '../responsive/WatchlistCard.jsx'
import MarginMatrix from '../responsive/MarginMatrix.jsx'
import { QUADRANTS } from '../responsive/marginMatrixPoints.js'
import BiggestFixes from '../responsive/BiggestFixes.jsx'
import FlagChips from '../responsive/FlagChips.jsx'

// P&L below 1024px (PNL_MASTER_PLAN.md Part B §4, mockups/pnl_mockup.html phone; PNL_MOBILE_PLAN.md §4).
// Display only: every number comes from what PnLChannelTab already has (the KPI cards' values,
// kpiSummary, the Financial View rows and the margin watchlist result), so mobile = laptop.
//   master card   MasterTrendCard (hero = gross); tiles per tab, even counts; a tile switches the chart
//                 where a daily series exists (gross / units / ASP from `daily`, net and the margin
//                 %s from `dailyPnL`); previous period dashed from prevSummary.daily, by day index
//   watchlist     WatchlistCard mobile → rule → full-screen list → product sheet (Simulate)
//   matrix/fixes  MarginMatrix mobile (quadrant tiles → list), BiggestFixes top 3 + all
//   ladder        Gross → Net → GM → CM1 → CM2 (only the steps that exist), replaces the waterfall
//   financial     Category / Product, sort chips, flag dots, product sheet with rule-breaking values red
//   stores        EBO only: store list + the full store table full-screen
//   tools         D2C: Price Simulator, Breakeven ROAS · Offline: B2B Costing, PO Approval
const M = C.m
const pctTxt = v => (v != null && isFinite(v) ? `${v.toFixed(1)}%` : '—')
const chg = (cur, prev) => (cur != null && prev != null && prev > 0 ? (cur - prev) / prev * 100 : null)
const PCT_KEYS = ['returnPct', 'cogsPct', 'gmPct', 'sndPct', 'cm1Pct', 'cm2Pct']
// Tabs whose numbers show but aren't complete yet (Part B §4 "Incomplete tabs"): an In-progress strip
// that says what's missing. Overall / International use PNL_IN_PROGRESS (numbers hidden) instead.
const PROGRESS_NOTE = {
  ebo: "Store costs (employee, CAM, software, volumetric rent) aren't available yet and marketing is a flat 1.5% of net, so CM2 here is before those costs.",
  myntra: "SnD, CM1 and ad spend aren't available for Myntra yet.",
}

// Tile lists (PNL_MOBILE_PLAN.md §4). Tiles whose value doesn't exist on the tab are left out
// (one InfoStrip names them) and the grid is kept even.
function tileKeys({ tab, amzView, showMarketing, spendAllocated, returnsNotCaptured, inProgress }) {
  if (inProgress) return ['gross', 'net', 'returns', 'units']
  if (tab === 'ebo') return ['gross', 'net', 'returns', 'cogs', 'gm', 'snd', 'cm1', 'units']
  if (tab === 'offline' || (tab === 'amazon' && amzView !== 'all')) return ['gross', 'asp', 'net', 'returns', 'cogs', 'gm', 'snd', 'cm1']
  if (['cred', 'firstcry', 'myntra'].includes(tab)) return ['gross', 'net', 'returns', 'cogs', 'gm', 'units']
  const ads = showMarketing && !spendAllocated ? ['mktg', 'roas', 'cm2'] : []
  return returnsNotCaptured ? ['gross', 'net', 'units', 'cogs', 'gm', 'snd', 'cm1', ...ads] : ['gross', 'net', 'returns', 'cogs', 'gm', 'snd', 'cm1', ...ads]
}

// One product's numbers in a sheet: rule-breaking values red, flag chips by name, Simulate.
function ProductSheet({ row, flags, ruleName, derived, tabLabel, period, cols, onSimulate, simulateLabel }) {
  const bad = id => flags.includes(id)
  const red = on => (on ? M.down : undefined)
  const items = [
    { label: 'Gross', value: fmt(row.gross) },
    { label: 'Net rev', value: fmt(row.net) },
    cols.ret && { label: 'Returns', value: pctTxt(row.returnPct), color: red(bad('ret') || bad('retup')) },
    { label: 'ASP', value: row.asp > 0 ? `₹${Math.round(row.asp).toLocaleString('en-IN')}` : '—', color: red(bad('asp')) },
    cols.cogs && { label: 'COGS', value: pctTxt(row.cogsPct), color: red(bad('cogs')) },
    cols.cogs && { label: 'GM', value: pctTxt(row.gmPct), color: red(bad('gm')) },
    cols.snd && { label: 'SnD', value: pctTxt(row.sndPct) },
    cols.cm1 && { label: 'CM1', value: pctTxt(row.cm1Pct), color: red(bad('cm1')) },
    cols.spend && { label: 'Spend', value: row.spend > 0 ? pctTxt(row.spendPct) : '—' },
    cols.spend && { label: 'ROAS', value: row.roas != null ? `${row.roas.toFixed(2)}x` : '—', color: red(bad('loss')) },
    cols.spend && { label: 'Breakeven ROAS', value: derived?.beRoas != null ? `${derived.beRoas.toFixed(2)}x` : '—' },
    cols.spend && { label: 'CM2', value: pctTxt(row.cm2Pct), color: red(bad('loss')) },
  ].filter(Boolean)
  return (
    <div>
      <div style={{ fontSize: 12, color: M.muted, marginBottom: 8 }}>{row.cat} · {tabLabel} · {period}</div>
      {flags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {flags.map(id => (
            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
              background: id === 'loss' ? 'rgba(192,57,43,.1)' : 'rgba(200,134,10,.12)', color: id === 'loss' ? M.down : '#8a5a00' }}>
              <i style={{ width: 7, height: 7, borderRadius: '50%', background: id === 'loss' ? M.down : M.amber, display: 'inline-block' }} />{ruleName[id] || id}
            </span>
          ))}
        </div>
      )}
      <KV items={items} />
      {onSimulate && (
        <button type="button" onClick={onSimulate}
          style={{ marginTop: 12, width: '100%', minHeight: 44, borderRadius: 12, border: 'none', background: M.green, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
          Simulate this product ↗ <span style={{ fontWeight: 500, opacity: 0.85 }}>({simulateLabel})</span>
        </button>
      )}
    </div>
  )
}

function Ladder({ steps }) {
  const top = steps[0]?.value || 1
  return steps.map(s => (
    <div key={s.name} style={{ padding: '7px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
        <b style={{ color: M.ink }}>{s.name}</b>
        <span style={{ color: M.muted, fontVariantNumeric: 'tabular-nums' }}>{s.pct ? `${s.pct} · ` : ''}<b style={{ color: s.value < 0 ? M.down : M.ink }}>{fmt(s.value)}</b></span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: M.soft, marginTop: 5, overflow: 'hidden' }}>
        <i style={{ display: 'block', height: '100%', width: `${Math.max(1, Math.min(100, Math.abs(s.value) / top * 100))}%`, background: s.value < 0 ? M.down : s.light ? M.g2 : M.green, borderRadius: 4 }} />
      </div>
    </div>
  ))
}

// EBO stores: list + the wide store table full-screen.
function StoresCard({ rows, renderTable }) {
  const [full, setFull] = useState(false)
  useEffect(() => {
    if (!full) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [full])
  const sorted = [...rows].sort((a, b) => b.gross - a.gross)
  const max = sorted[0]?.gross || 1
  const p = (n, d) => (d > 100 && n != null ? `${(n / d * 100).toFixed(1)}%` : '—')
  return (
    <Card title="Stores" sub="By gross · CM2* is before store costs">
      {sorted.slice(0, 8).map((s, i) => (
        <div key={s.storeName} style={{ position: 'relative', padding: '8px 0 12px', borderBottom: `1px solid ${M.line}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', columnGap: 10 }}>
            <span style={{ fontSize: M.type.listValue, fontWeight: 600, overflowWrap: 'anywhere' }}>{i + 1}. {s.storeName}</span>
            <span style={{ fontSize: M.type.listValue, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(s.gross)}</span>
          </div>
          <div style={{ fontSize: 12, color: M.muted, fontVariantNumeric: 'tabular-nums' }}>CM1 {p(s.cm1, s.netRev)} · CM2* {p(s.cm2, s.netRev)}</div>
          <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 4, height: 3, background: M.line, borderRadius: 2 }}>
            <i style={{ display: 'block', height: '100%', width: `${Math.max(1, s.gross / max * 100)}%`, background: M.green, borderRadius: 2 }} />
          </span>
        </div>
      ))}
      <ShowAllButton onClick={() => setFull(true)}>Full store table (all {rows.length} rows, all columns) →</ShowAllButton>
      {full && (
        <div role="dialog" aria-label="Store P&L" style={{ position: 'fixed', inset: 0, zIndex: C.z.modal, background: M.bg, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: M.header, color: '#fff', paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
            <button type="button" onClick={() => setFull(false)} aria-label="Back" style={{ minWidth: 44, minHeight: 44, border: 'none', background: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}>‹</button>
            <b style={{ fontSize: 16 }}>Store P&amp;L</b>
          </div>
          <div className="pnl-store-full" style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', padding: 8 }}>{renderTable()}</div>
        </div>
      )}
    </Card>
  )
}

export default function PnLMobileView({
  tab, amzView, title, period, start, end, gross, net, units, returnRev, prevGross, daily, dailyPnL, kpiSummary, prevSummary,
  showMarketing, spendAllocated, returnsNotCaptured, inProgress, actualNet, margin, fvRows, adSpendReal,
  onSimulate, simulateLabel, tools = [], onTool, storeRows, renderStoreTable, notAvailableNote,
}) {
  const bp = useBreakpoint()
  const layout = bp.isPhoneLandscape ? 'landscape' : bp.width >= 768 ? 'tablet' : 'phone'
  const ks = kpiSummary || {}
  const prevStatus = prevSummary?.status || 'off'
  const prevReady = prevStatus === 'ready'
  const prevLoading = prevStatus === 'loading'
  const ps = prevReady ? prevSummary : {}
  const asp = units > 0 ? gross / units : null
  const onNet = actualNet != null ? ' of actual net' : ' of net'

  // ── Daily rows: gross / ex-GST / units from `daily` (one row per date), the day's net and margin
  // %s from `dailyPnL`; each % carries its numerator and weight so weekly / monthly grouping stays a
  // weighted average. The previous period is laid on by day index (day 1 ↔ day 1).
  const rawRows = useMemo(() => {
    const byDate = {}
    ;(daily || []).forEach(d => {
      const x = byDate[d.date] || (byDate[d.date] = { date: d.date, rev: 0, excRev: 0, units: 0 })
      x.rev += d.rev || 0; x.excRev += d.excRev || 0; x.units += d.units || 0
    })
    ;(dailyPnL || []).forEach(d => {
      const x = byDate[d.date]
      if (!x) return
      if (d.dayNet != null) x.dayNet = d.dayNet
      const w = d.dayNet ?? x.excRev
      PCT_KEYS.forEach(k => { if (d[k] != null && w > 0) { x[`${k}N`] = d[k] * w; x[`${k}W`] = w } })
    })
    const cur = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
    const prev = prevReady ? [...(prevSummary.daily || [])].sort((a, b) => a.date.localeCompare(b.date)) : []
    return cur.map((r, i) => {
      const p = prev[i]
      if (!p) return r
      const out = { ...r, pRev: p.rev ?? null, pUnits: p.units ?? null, pExcRev: p.excRev ?? null }
      if (p.dayNet != null) out.pDayNet = p.dayNet
      const w = p.dayNet ?? p.excRev
      PCT_KEYS.forEach(k => { if (p[k] != null && w > 0) { out[`p${k}N`] = p[k] * w; out[`p${k}W`] = w } })
      return out
    })
  }, [daily, dailyPnL, prevReady, prevSummary])
  const hasDayNet = rawRows.some(r => r.dayNet != null)
  const hasPct = k => rawRows.some(r => r[`${k}W`] > 0)
  const ratio = (n, d) => r => (r[d] > 0 ? r[n] / r[d] : null)
  const pctSeries = k => (hasPct(k) ? { point: ratio(`${k}N`, `${k}W`), prevPoint: ratio(`p${k}N`, `p${k}W`), fmtPoint: v => `${v.toFixed(1)}%` } : {})
  const money = v => fmt(v)

  const all = {
    gross: { label: 'Gross revenue', tileLabel: 'Gross', def: 'Gross revenue including GST.', value: fmt(gross), delta: chg(gross, prevGross),
      sub: [`Net ${fmt(net)}`, ks.cm2 != null && showMarketing && !spendAllocated ? `CM2 ${pctTxt(ks.cm2Pct)}` : null, ks.roas != null && !spendAllocated && showMarketing ? `ROAS ${ks.roas.toFixed(2)}x` : null].filter(Boolean).join(' · '),
      point: r => r.rev, prevPoint: r => r.pRev ?? null, fmtPoint: money },
    net: { label: 'Net revenue', tileLabel: 'Net rev', def: returnsNotCaptured ? 'Gross ex GST: returns are not captured for this channel.' : 'Ex GST, after cancellations, RTO and returns.', value: fmt(net),
      delta: chg(net, ps.net), deltaLoading: prevLoading, sub: gross > 0 ? `${(net / gross * 100).toFixed(1)}% of gross` : undefined,
      ...(hasDayNet ? { point: r => r.dayNet ?? null, prevPoint: r => r.pDayNet ?? null, fmtPoint: money }
        : returnsNotCaptured ? { point: r => r.excRev, prevPoint: r => r.pExcRev ?? null, fmtPoint: money } : {}) },
    returns: returnsNotCaptured ? null : { label: 'Returns', def: 'Returned, cancelled and RTO revenue (of gross).', value: fmt(returnRev), tileValue: <>{fmt(returnRev)}<Pct v={gross > 0 ? returnRev / gross * 100 : null} /></>,
      delta: chg(returnRev, ps.returnRev), deltaLoading: prevLoading, lowerIsBetter: true, sub: gross > 0 ? `${(returnRev / gross * 100).toFixed(1)}% of gross` : undefined, ...pctSeries('returnPct') },
    units: { label: 'Units', def: 'Units sold.', value: fmtN(units), delta: chg(units, ps.units), deltaLoading: prevLoading, point: r => r.units, prevPoint: r => r.pUnits ?? null, fmtPoint: v => fmtN(Math.round(v)) },
    asp: { label: 'ASP', def: 'Gross revenue ÷ units.', value: asp != null ? `₹${Math.round(asp).toLocaleString('en-IN')}` : '—',
      delta: prevReady && ps.units > 0 && asp != null ? chg(asp, ps.gross / ps.units) : null, deltaLoading: prevLoading,
      point: r => (r.units > 0 ? r.rev / r.units : null), prevPoint: r => (r.pUnits > 0 ? r.pRev / r.pUnits : null), fmtPoint: v => `₹${Math.round(v).toLocaleString('en-IN')}` },
    cogs: ks.cogs == null ? null : { label: 'COGS', def: `Cost of goods sold (% ${onNet.trim()}).`, value: fmt(ks.cogs), tileValue: <>{fmt(ks.cogs)}<Pct v={ks.cogsPct} /></>, delta: chg(ks.cogs, ps.cogs), deltaLoading: prevLoading, lowerIsBetter: true, sub: `${pctTxt(ks.cogsPct)}${onNet}${hasPct('cogsPct') ? ' · chart: daily %' : ''}`, ...pctSeries('cogsPct') },
    gm: ks.gm == null ? null : { label: 'Gross margin', tileLabel: 'GM', def: `Net revenue − COGS (% ${onNet.trim()}).`, value: fmt(ks.gm), tileValue: <>{fmt(ks.gm)}<Pct v={ks.gmPct} /></>, delta: chg(ks.gm, ps.gm), deltaLoading: prevLoading, sub: `${pctTxt(ks.gmPct)}${onNet}${hasPct('gmPct') ? ' · chart: daily %' : ''}`, ...pctSeries('gmPct') },
    snd: ks.snd == null ? null : { label: 'SnD cost', tileLabel: 'SnD', def: 'Selling & distribution cost.', value: fmt(ks.snd), tileValue: <>{fmt(ks.snd)}<Pct v={ks.sndPct} /></>, delta: chg(ks.snd, ps.snd), deltaLoading: prevLoading, lowerIsBetter: true, sub: `${pctTxt(ks.sndPct)}${onNet}${hasPct('sndPct') ? ' · chart: daily %' : ''}`, ...pctSeries('sndPct') },
    cm1: ks.cm1 == null ? null : { label: 'CM1', def: 'Gross margin − SnD.', value: fmt(ks.cm1), tileValue: <>{fmt(ks.cm1)}<Pct v={ks.cm1Pct} /></>, valueColor: ks.cm1 < 0 ? M.down : undefined, delta: chg(ks.cm1, ps.cm1), deltaLoading: prevLoading, sub: `${pctTxt(ks.cm1Pct)}${onNet}${hasPct('cm1Pct') ? ' · chart: daily %' : ''}`, ...pctSeries('cm1Pct') },
    mktg: ks.spend == null ? null : { label: 'Marketing spend', tileLabel: 'Mktg', def: 'Ad spend attributed to this channel.', value: fmt(ks.spend), tileValue: <>{fmt(ks.spend)}<Pct v={ks.spendPct} /></>, delta: chg(ks.spend, ps.spend), deltaLoading: prevLoading, lowerIsBetter: true, sub: `${pctTxt(ks.spendPct)} of net` },
    roas: ks.roas == null ? null : { label: 'ROAS', def: 'Gross revenue (ex GST) ÷ ad spend.', value: `${ks.roas.toFixed(2)}x`, delta: chg(ks.roas, ps.roas), deltaLoading: prevLoading, sub: 'Gross ex GST ÷ spend' },
    cm2: ks.cm2 == null ? null : { label: 'CM2', def: 'CM1 − marketing spend.', value: fmt(ks.cm2), tileValue: <>{fmt(ks.cm2)}<Pct v={ks.cm2Pct} /></>, valueColor: ks.cm2 < 0 ? M.down : undefined, delta: chg(ks.cm2, ps.cm2), deltaLoading: prevLoading, sub: `${pctTxt(ks.cm2Pct)}${onNet}${hasPct('cm2Pct') ? ' · chart: daily %' : ''}`, ...pctSeries('cm2Pct') },
  }
  const wanted = tileKeys({ tab, amzView, showMarketing, spendAllocated, returnsNotCaptured, inProgress })
  let tiles = wanted.filter(k => all[k]).map(k => ({ key: k, ...all[k] }))
  // Even grid: drop the last tile if a missing value left an odd count (the strip names what's missing)
  if (tiles.length % 2 && tiles.length > 1) tiles = tiles.slice(0, -1)
  // The laptop cards that say "Not available" on this tab are left out here; one strip names them.
  const laptopCards = ['cogs', 'gm', 'snd', 'cm1', ...(showMarketing ? ['mktg', ...(spendAllocated ? [] : ['roas']), 'cm2'] : [])]
  const missing = inProgress ? [] : [...laptopCards.filter(k => !all[k]), ...(returnsNotCaptured ? ['returns'] : [])].map(k => ({ cogs: 'COGS', gm: 'gross margin', snd: 'SnD', cm1: 'CM1', mktg: 'ad spend', roas: 'ROAS', cm2: 'CM2', returns: 'returns' }[k]))

  // ── Margin watchlist sheets / lists
  const [ruleList, setRuleList] = useState(null) // rule id
  const [quad, setQuad] = useState(null) // { id, pts }
  const [fixesOpen, setFixesOpen] = useState(false)
  const [sheetKey, setSheetKey] = useState(null)
  const [grp, setGrp] = useState('prod')
  const [catOpen, setCatOpen] = useState(null)
  const cols = { ret: !returnsNotCaptured, cogs: ks.cogs != null, snd: ks.snd != null, cm1: ks.cm1 != null, spend: !!adSpendReal }
  const rowByKey = useMemo(() => Object.fromEntries((fvRows || []).map(r => [`${r.cat}::${r.sc}`, r])), [fvRows])
  const flagsOf = key => margin?.flagsByKey?.[key] || []
  const openProduct = key => { setSheetKey(key) }
  const simulate = onSimulate ? key => { setSheetKey(null); setRuleList(null); setQuad(null); setFixesOpen(false); setCatOpen(null); onSimulate(key) } : null
  const rule = margin?.rules.find(r => r.id === ruleList) || null
  const cm1Rule = margin?.rules.find(r => r.id === 'cm1') || null
  const derivedOf = key => margin?.derived?.[key]

  // Value shown for a product in a rule's list (the number that breaks the rule)
  const ruleValue = (id, x) => {
    const r = x.row, d = derivedOf(x.key) || {}
    if (id === 'loss' || id === 'thin') {
      const x = v => (v != null ? `${v.toFixed(2)}x` : '—')
      return { v: `${pctTxt(r.cm2Pct)} CM2`, s: `ROAS ${x(r.roas)} vs ${id === 'loss' ? 'breakeven' : 'needed'} ${x(id === 'loss' ? d.beRoas : d.roasNeeded)}` }
    }
    if (id === 'cm1') return { v: `${pctTxt(r.cm1Pct)} CM1`, s: `GM ${pctTxt(r.gmPct)} · SnD ${pctTxt(r.sndPct)}` }
    if (id === 'cogs') return { v: `${pctTxt(r.cogsPct)} COGS`, s: `ASP ${r.asp > 0 ? '₹' + Math.round(r.asp).toLocaleString('en-IN') : '—'}` }
    if (id === 'gm') return { v: `${pctTxt(r.gmPct)} GM`, s: `COGS ${pctTxt(r.cogsPct)}` }
    if (id === 'ret') return { v: `${pctTxt(r.returnPct)} returns`, s: `Prev ${pctTxt(d.prevRetPct)}` }
    if (id === 'retup') return { v: `+${(r.returnPct - d.prevRetPct).toFixed(1)} pts`, s: `${pctTxt(d.prevRetPct)} → ${pctTxt(r.returnPct)}` }
    if (id === 'asp') return { v: `${((d.asp - d.prevAsp) / d.prevAsp * 100).toFixed(1)}% ASP`, s: `₹${Math.round(d.prevAsp).toLocaleString('en-IN')} → ₹${Math.round(d.asp).toLocaleString('en-IN')}` }
    return { v: '', s: '' }
  }

  // ── Financial view: product rows, or category rows (the same sums the table's Total row uses)
  const catRows = useMemo(() => {
    const m = {}
    ;(fvRows || []).forEach(r => {
      const c = m[r.cat] || (m[r.cat] = { cat: r.cat, sc: r.cat, isCat: true, n: 0, gross: 0, excRev: 0, net: 0, units: 0, totalReturnRev: 0, spend: 0, cogs: 0, netCovered: 0, anyCosted: false, snd: 0, sndNetCovered: 0, anySnd: false, cm1: 0, cm1NetCovered: 0, anyCm1: false })
      c.n++; c.gross += r.gross; c.excRev += r.excRev; c.net += r.net; c.units += r.units; c.totalReturnRev += r.totalReturnRev; c.spend += r.spend || 0
      if (r.anyCosted) { c.cogs += r.cogs; c.netCovered += r.netCovered; c.anyCosted = true }
      if (r.anySnd) { c.snd += r.snd; c.sndNetCovered += r.sndNetCovered; c.anySnd = true }
      if (r.cm1Covered) { c.cm1 += r.cm1; c.cm1NetCovered += r.netCovered; c.anyCm1 = true }
    })
    return Object.values(m).map(c => {
      const p = (n, d) => (d > 0 ? n / d * 100 : null)
      const cm2 = c.anyCm1 && cols.spend ? c.cm1 - c.spend : null
      return { ...c, returnPct: p(c.totalReturnRev, c.gross), asp: c.units > 0 ? c.gross / c.units : 0, cogsPct: c.anyCosted ? p(c.cogs, c.netCovered) : null, gmPct: c.anyCosted ? p(c.netCovered - c.cogs, c.netCovered) : null,
        sndPct: c.anySnd ? p(c.snd, c.sndNetCovered) : null, cm1Pct: c.anyCm1 ? p(c.cm1, c.cm1NetCovered) : null, cm2Pct: cm2 != null ? p(cm2, c.cm1NetCovered) : null }
    })
  }, [fvRows, cols.spend])
  const neg = v => (v == null ? null : -v)
  const sorts = [
    { key: 'gross', label: 'Revenue', value: r => r.gross, format: r => fmt(r.gross) },
    cols.spend && { key: 'cm2', label: 'CM2 % ↑', value: r => neg(r.cm2Pct), format: r => pctTxt(r.cm2Pct), bar: 'bad' },
    cols.cm1 && { key: 'cm1', label: 'CM1 % ↑', value: r => neg(r.cm1Pct), format: r => pctTxt(r.cm1Pct), bar: 'bad' },
    cols.ret && { key: 'ret', label: 'Returns %', value: r => r.returnPct, format: r => pctTxt(r.returnPct), bar: 'bad' },
    cols.cogs && { key: 'gm', label: 'GM % ↑', value: r => neg(r.gmPct), format: r => pctTxt(r.gmPct), bar: 'bad' },
    cols.cogs && { key: 'cogs', label: 'COGS %', value: r => r.cogsPct, format: r => pctTxt(r.cogsPct), bar: 'bad' },
  ].filter(Boolean)
  const breaksFor = { cm2: 'loss', cm1: 'cm1', ret: 'ret', gm: 'gm', cogs: 'cogs' }
  const rowKey = r => (r.isCat ? `cat:${r.cat}` : `${r.cat}::${r.sc}`)
  const listProps = {
    itemKey: rowKey, sorts, name: r => r.sc, sub: r => (r.isCat ? `${r.n} product${r.n === 1 ? '' : 's'}` : r.cat),
    secondary: (r, k) => (k === 'gross' ? [cols.spend ? `CM2 ${pctTxt(r.cm2Pct)}` : cols.cm1 ? `CM1 ${pctTxt(r.cm1Pct)}` : cols.cogs ? `GM ${pctTxt(r.gmPct)}` : null, cols.ret ? `Ret ${pctTxt(r.returnPct)}` : null].filter(Boolean).join(' · ') : fmt(r.gross)),
    searchText: r => `${r.sc} ${r.cat}`, groupOf: r => r.cat,
    badge: r => (r.isCat ? null : <FlagChips ids={flagsOf(rowKey(r))} names={margin?.ruleName} variant="mobile" />),
    valueColor: (r, k) => (!r.isCat && breaksFor[k] && flagsOf(rowKey(r)).includes(breaksFor[k]) ? M.down : undefined),
  }

  // Export (header "⋯"): the Financial view's product rows, same values as the list
  useEffect(() => {
    const onExport = () => exportCSV((fvRows || []).map(r => ({
      Category: r.cat, Product: r.sc, 'Gross Rev (Inc GST)': Math.round(r.gross), Units: r.units, 'Net Revenue': Math.round(r.net),
      'Return %': r.returnPct != null ? +r.returnPct.toFixed(2) : '', 'COGS %': r.cogsPct != null ? +r.cogsPct.toFixed(2) : '', 'GM %': r.gmPct != null ? +r.gmPct.toFixed(2) : '',
      'SnD %': r.sndPct != null ? +r.sndPct.toFixed(2) : '', 'CM1 %': r.cm1Pct != null ? +r.cm1Pct.toFixed(2) : '', ...(cols.spend ? { 'Spend %': r.spend > 0 ? +r.spendPct.toFixed(2) : '', RoAS: r.roas != null ? +r.roas.toFixed(2) : '', 'CM2 %': r.cm2Pct != null ? +r.cm2Pct.toFixed(2) : '' } : {}),
      Flags: (margin?.flagsByKey?.[`${r.cat}::${r.sc}`] || []).map(id => margin.ruleName[id]).join(' · '),
    })), `pnl_${tab}_financial_view.csv`)
    window.addEventListener('pnl:export', onExport)
    return () => window.removeEventListener('pnl:export', onExport)
  }, [fvRows, margin, tab, cols.spend])

  const ladder = [
    { name: 'Gross revenue', value: gross },
    { name: 'Net revenue', value: net, pct: gross > 0 ? `${(net / gross * 100).toFixed(1)}% of gross` : null },
    ks.gm != null && { name: 'Gross margin', value: ks.gm, pct: pctTxt(ks.gmPct) },
    ks.cm1 != null && { name: 'CM1', value: ks.cm1, pct: pctTxt(ks.cm1Pct) },
    ks.cm2 != null && showMarketing && !spendAllocated && { name: 'CM2', value: ks.cm2, pct: pctTxt(ks.cm2Pct), light: true },
  ].filter(Boolean)

  const sheetRow = sheetKey ? rowByKey[sheetKey] : null
  const productListProps = {
    name: x => x.row.sc, searchText: x => `${x.row.sc} ${x.row.cat}`, groupOf: x => x.row.cat,
    badge: x => <FlagChips ids={flagsOf(x.key)} names={margin?.ruleName} variant="mobile" />,
    onSelect: x => openProduct(x.key),
  }

  return (
    <div className="pnl-mobile ov-mobile" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 24 }}>
      {(inProgress || PROGRESS_NOTE[tab]) && <InfoStrip icon="◔" text={`In progress. ${inProgress || PROGRESS_NOTE[tab]}`} />}
      {!inProgress && !PROGRESS_NOTE[tab] && missing.length > 0 && <InfoStrip text={notAvailableNote || `${listJoin(missing)} ${missing.length === 1 ? "isn't" : "aren't"} available for ${title} yet.`} />}
      <MasterTrendCard key={`${tab}:${amzView}:${title}`} metrics={tiles} rawRows={rawRows} groupTrend={groupSumTrend} start={start} end={end} layout={layout} />

      {margin && (
        <WatchlistCard result={margin} channel={title} variant="mobile" onOpenRule={setRuleList}
          pendingPrev={prevLoading ? [`ASP down > ${margin.bars.aspDrop}%`, ...(margin.bars.retUp != null && !returnsNotCaptured ? [`Returns up > ${margin.bars.retUp} pts`] : [])] : []} />
      )}

      {margin && cm1Rule && (
        <Card title="Margin matrix" right={<span style={{ fontSize: 12, color: M.muted }}>Revenue → · CM1 % ↑</span>}>
          <MarginMatrix rows={(fvRows || []).filter(r => margin.derived[`${r.cat}::${r.sc}`]?.material)} bar={margin.bars.cm1} variant="mobile" onQuadrant={(id, pts) => setQuad({ id, pts })} />
        </Card>
      )}
      {margin && cm1Rule && (
        <Card title="Biggest fixes" right={<span style={{ fontSize: 12, color: M.muted }}>₹ CM1 below {margin.bars.cm1}%</span>}>
          <BiggestFixes items={cm1Rule.items} bar={margin.bars.cm1} variant="mobile" onSimulate={simulate} onAll={() => setFixesOpen(true)} />
        </Card>
      )}

      {!inProgress && ladder.length > 2 && (
        <Card title="Margin ladder" right={<span style={{ fontSize: 12, color: M.muted }}>% of net rev</span>}>
          <Ladder steps={ladder} />
        </Card>
      )}

      {(fvRows || []).length > 0 && (
        <Card title="Financial view" right={<span style={{ fontSize: 12, color: M.muted }}>{grp === 'prod' ? `${fvRows.length} products` : `${catRows.length} categories`}</span>}>
          <SegmentToggle options={[{ id: 'cat', label: 'Category' }, { id: 'prod', label: 'Product' }]} value={grp} onChange={setGrp} label="Group by" full />
          <div style={{ height: 6 }} />
          <MobileRankedList key={grp} noun={grp === 'prod' ? 'products' : 'categories'} items={grp === 'prod' ? fvRows : catRows} topN={8} compact={false}
            {...listProps} onSelect={r => (r.isCat ? setCatOpen(r.cat) : openProduct(rowKey(r)))} />
        </Card>
      )}

      {storeRows?.length > 0 && <StoresCard rows={storeRows} renderTable={renderStoreTable} />}

      {tools.length > 0 && (
        <Card title="Tools" right={<span style={{ fontSize: 12, color: M.muted }}>{title}</span>}>
          {tools.map((t, i) => (
            <button key={t.id} type="button" onClick={() => onTool(t.id)}
              style={{ display: 'grid', gridTemplateColumns: '32px minmax(0,1fr) 14px', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, padding: '6px 0', border: 'none', borderBottom: i < tools.length - 1 ? `1px solid ${M.line}` : 'none', background: 'transparent', textAlign: 'left', fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer' }}>
              <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 10, background: M.soft, display: 'grid', placeItems: 'center', color: M.green, fontSize: 15 }}>{t.icon}</span>
              <span style={{ minWidth: 0 }}><b style={{ display: 'block', fontSize: 13.5 }}>{t.label}</b><span style={{ display: 'block', fontSize: 12, color: M.muted }}>{t.desc}</span></span>
              <span aria-hidden="true" style={{ color: M.muted, fontSize: 16 }}>›</span>
            </button>
          ))}
        </Card>
      )}

      {/* Rule → its products */}
      <FullScreenList open={!!rule} onClose={() => setRuleList(null)} title={rule?.name || ''} noun="products" items={rule?.items || []}
        sorts={[{ key: 'impact', label: '₹ impact', value: x => -x.impact, format: x => ruleValue(rule?.id, x).v, bar: 'bad' }]}
        sub={x => ruleValue(rule?.id, x).s} secondary={x => fmt(x.impact)} valueColor={() => (rule?.red ? M.down : undefined)} {...productListProps} />
      {/* Quadrant → its products */}
      <FullScreenList open={!!quad} onClose={() => setQuad(null)} title={QUADRANTS.find(q => q.id === quad?.id)?.label || ''} noun="products" items={quad?.pts || []}
        sorts={[{ key: 'gross', label: 'Revenue', value: p => p.x, format: p => `${pctTxt(p.y)} CM1` }]}
        sub={() => QUADRANTS.find(q => q.id === quad?.id)?.hint || ''} secondary={p => `${fmt(p.x)} · CM2 ${pctTxt(p.row.cm2Pct)}`}
        valueColor={p => (p.y < (margin?.bars.cm1 ?? 0) ? M.down : undefined)} {...productListProps} />
      {/* All biggest fixes */}
      <FullScreenList open={fixesOpen} onClose={() => setFixesOpen(false)} title="Biggest fixes" noun="products" items={cm1Rule?.items || []}
        sorts={[{ key: 'impact', label: '₹ CM1 gap', value: x => -x.impact, format: x => fmt(x.impact), bar: 'bad' }]}
        sub={x => `CM1 ${pctTxt(x.row.cm1Pct)} · GM ${pctTxt(x.row.gmPct)} · COGS ${pctTxt(x.row.cogsPct)}`} valueColor={() => M.down} {...productListProps} />
      {/* Category → its products */}
      <FullScreenList open={!!catOpen} onClose={() => setCatOpen(null)} title={catOpen || ''} noun="products" items={(fvRows || []).filter(r => r.cat === catOpen)}
        sorts={sorts} initialSort="gross" {...listProps} onSelect={r => openProduct(rowKey(r))} />

      <BottomSheet open={!!sheetRow} onClose={() => setSheetKey(null)} title={sheetRow?.sc || ''}>
        {sheetRow && <ProductSheet row={sheetRow} flags={flagsOf(sheetKey)} ruleName={margin?.ruleName || {}} derived={derivedOf(sheetKey)} tabLabel={title} period={period}
          cols={cols} onSimulate={simulate ? () => simulate(sheetKey) : null} simulateLabel={simulateLabel} />}
      </BottomSheet>
    </div>
  )
}

function Pct({ v }) {
  if (v == null || !isFinite(v)) return null
  return <small style={{ marginLeft: 5, fontSize: 12, fontWeight: 600, color: M.muted }}>{v.toFixed(1)}%</small>
}
function listJoin(a) {
  const s = [...new Set(a)]
  if (s.length <= 1) return cap(s[0] || '')
  return cap(`${s.slice(0, -1).join(', ')} and ${s[s.length - 1]}`)
}
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s }
