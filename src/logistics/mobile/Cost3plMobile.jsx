import { useCallback, useMemo, useState } from 'react'
import { C, fmt, fmtN } from '../../utils.js'
import MasterTrendCard from '../../responsive/MasterTrendCard.jsx'
import BottomSheet from '../../responsive/BottomSheet.jsx'
import FullScreenList from '../../responsive/FullScreenList.jsx'
import Sparkline from '../../responsive/Sparkline.jsx'
import { Card, ShowAllButton, KV, RowText, Chips } from '../../responsive/CardKit.jsx'
import { PartnerRow, SplitTop } from './CostOverviewMobile.jsx'

// Logistics → Cost → 3PL below 1024px (LOGISTICS_MOBILE_REDESIGN_PROMPT.md §5). Display only: the
// hero and tile figures are the desktop 3PL block's own inline calculations (copied as-is below),
// from LogisticsCostPage's tpl / tplTrend / tplShareBySite / tplWhTrend memos.
const M = C.m
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monShort = raw => MON[parseInt(String(raw).split('-')[1], 10) - 1] || raw
const money1 = v => (v == null || !isFinite(v) ? '—' : '₹' + Number(v).toFixed(1))

// Desktop 3PL block (LogisticsCostPage "scope === 'tpl'") figures.
function tplFigures(tpl, agg, tplTrend) {
  const t = tpl.totals
  const perMonth = t.months > 0 ? t.cost / t.months : 0
  const share = v => (t.cost > 0 ? (v / t.cost) * 100 : 0)
  const bm = agg?.byMonth
  const valueOf = m => (!bm ? 0 : Array.isArray(bm) ? Number(bm.find(r => r.key === m)?.value) || 0 : Number(bm[m]?.value) || 0)
  const tplShipValue = (t.monthKeys || []).reduce((a, m) => a + valueOf(m), 0)
  const tplValuePct = tplShipValue > 0 ? (t.cost / tplShipValue) * 100 : null
  const rated = (tpl.warehouses || []).filter(w => w.shipments > 0)
  const ratedCost = rated.reduce((a, w) => a + Number(w.cost || 0), 0)
  const totalShip = rated.reduce((a, w) => a + Number(w.shipments || 0), 0)
  const totalKg = rated.reduce((a, w) => a + Number(w.weight_kg || 0), 0)
  const perShip = totalShip > 0 ? ratedCost / totalShip : null
  const perKg = totalKg > 0 ? ratedCost / totalKg : null
  const avgWt = totalShip > 0 ? totalKg / totalShip : null
  const mRates = (tplTrend || []).filter(m => m.per_ship != null)
  const last = mRates[mRates.length - 1], prev = mRates[mRates.length - 2]
  const rateDelta = last && prev && prev.per_ship > 0 ? ((last.per_ship - prev.per_ship) / prev.per_ship) * 100 : null
  return { t, perMonth, share, tplShipValue, tplValuePct, perShip, perKg, avgWt, totalShip, totalKg, rateDelta, prev }
}

function TplMaster({ f, tplTrend, layout }) {
  const { t, share } = f
  const groupTrend = useCallback(rows => (rows || []).map(r => ({ ...r, date: `${r.key}-01` })), [])
  const metrics = [
    { key: 'cost', label: 'Total warehousing cost', tileLabel: 'Total cost', value: fmt(t.cost), lowerIsBetter: true,
      compare: f.rateDelta != null ? [{ label: `₹/parcel vs ${monShort(f.prev.key)}`, delta: f.rateDelta }] : null, delta: f.rateDelta,
      sub: `${fmt(f.perMonth)} per month · ${fmtN(t.partners)} partners · ${fmtN(t.warehouses)} sites`,
      def: '3PL warehousing for the selected billing months. ▲/▼: change in cost per parcel between the latest two months with volume.', point: r => r.cost, fmtPoint: fmt },
    { key: 'parcel', label: 'Cost / parcel', value: f.perShip != null ? money1(f.perShip) : '—', sub: f.perShip != null ? `across ${fmtN(f.totalShip)} parcels` : 'no volume matched', deltasHidden: true, point: r => r.per_ship, fmtPoint: money1 },
    { key: 'kg', label: 'Cost / kg', value: f.perKg != null ? money1(f.perKg) : '—', sub: f.perKg != null ? `${fmtN(Math.round(f.totalKg))} kg handled` : 'no weight matched', deltasHidden: true },
    { key: 'wt', label: 'Avg parcel weight', value: f.avgWt != null ? `${f.avgWt.toFixed(2)} kg` : '—', sub: 'shipped weight ÷ parcels', deltasHidden: true },
    { key: 'site', label: 'Cost / site / month', value: t.warehouses > 0 && t.months > 0 ? fmt(t.cost / t.warehouses / t.months) : '—', sub: `${fmtN(t.warehouses)} sites · ${fmtN(t.months)} months`, deltasHidden: true },
    { key: 'ops', label: 'Operations', value: fmt(t.operation_fee), sub: `${share(t.operation_fee).toFixed(1)}% of spend`, deltasHidden: true, point: r => r.operation_fee, fmtPoint: fmt },
    { key: 'rent', label: 'Rental', value: t.rental_fee > 0 ? fmt(t.rental_fee) : '—', sub: t.rental_fee > 0 ? `${share(t.rental_fee).toFixed(1)}% — fixed, volume-blind` : 'nothing billed', deltasHidden: true, point: r => r.rental_fee, fmtPoint: fmt },
    { key: 'pct', label: 'Warehousing % of value', tileLabel: '% of value', value: f.tplValuePct != null ? f.tplValuePct.toFixed(2) + '%' : '—', sub: f.tplValuePct != null ? `${fmt(t.cost)} on ${fmt(f.tplShipValue)} shipped` : 'no matching months', deltasHidden: true },
  ]
  return (
    <MasterTrendCard metrics={metrics} rawRows={tplTrend} groupTrend={groupTrend} layout={layout} granularity="monthly"
      note={<SplitTop parts={[
        { key: 'ops', label: 'Operations', value: t.operation_fee || 0, color: M.green },
        { key: 'rent', label: 'Rental', value: t.rental_fee || 0, color: M.g3 },
        ...(t.other_fee > 0 ? [{ key: 'other', label: 'Other', value: t.other_fee, color: M.g4 }] : []),
      ]} />} />
  )
}

// Partner row with two thin bars: share of spend (green) over share of parcels (light green).
function DualRow({ name, sub, value, valueSub, costPct, shipPct, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderTop: `1px solid ${M.line}`, background: 'transparent', padding: '10px 0', fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer' }}>
      <RowText name={name} sub={sub} value={value} valueSub={valueSub} />
      {costPct != null && (
        <span aria-hidden="true" style={{ display: 'block', marginTop: 6 }}>
          <i style={{ display: 'block', height: 4, width: `${Math.max(1, costPct)}%`, background: M.green, borderRadius: 2 }} />
          <i style={{ display: 'block', height: 4, width: `${Math.max(1, shipPct)}%`, background: M.g3, borderRadius: 2, marginTop: 2 }} />
        </span>
      )}
    </button>
  )
}

function Partners({ partners, shareBySite }) {
  const [sort, setSort] = useState('spend')
  const [pick, setPick] = useState(null)
  const shareOf = useMemo(() => new Map((shareBySite || []).map(s => [s.key, s])), [shareBySite])
  const rows = useMemo(() => [...(partners || [])].map(p => ({ ...p, perShip: p.shipments > 0 ? p.cost / p.shipments : null, perKg: p.weight_kg > 0 ? p.cost / p.weight_kg : null }))
    .sort((a, b) => (sort === 'spend' ? b.cost - a.cost : sort === 'parcel' ? (b.perShip ?? -1) - (a.perShip ?? -1) : (b.perKg ?? -1) - (a.perKg ?? -1))), [partners, sort])
  return (
    <Card title="Partners" right={<span style={{ fontSize: 12, color: M.muted }}>spend vs volume</span>}>
      <Chips label="Sort by" options={[{ id: 'spend', label: 'Spend' }, { id: 'parcel', label: '₹ / parcel' }, { id: 'kg', label: '₹ / kg' }]} value={sort} onChange={setSort} />
      {rows.map(p => {
        const s = shareOf.get(p.key)
        return <DualRow key={p.key} name={p.key} sub={`${fmtN(p.warehouses)} site${p.warehouses === 1 ? '' : 's'} · ${money1(p.perShip)}/parcel · ${money1(p.perKg)}/kg`}
          value={sort === 'parcel' ? money1(p.perShip) : sort === 'kg' ? money1(p.perKg) : fmt(p.cost)}
          valueSub={s ? `${s.cost_pct.toFixed(1)}% spend · ${s.ship_pct.toFixed(0)}% parcels` : 'no parcels matched'} costPct={s?.cost_pct ?? null} shipPct={s?.ship_pct ?? 0} onClick={() => setPick(p)} />
      })}
      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12, color: M.muted, flexWrap: 'wrap' }}>
        <span><i style={{ display: 'inline-block', width: 10, height: 4, background: M.green, borderRadius: 2, marginRight: 5, verticalAlign: 'middle' }} />% of spend</span>
        <span><i style={{ display: 'inline-block', width: 10, height: 4, background: M.g3, borderRadius: 2, marginRight: 5, verticalAlign: 'middle' }} />% of parcels</span>
        <span>spend &gt; parcels = above blended rate</span>
      </div>
      <BottomSheet open={!!pick} onClose={() => setPick(null)} title={pick?.key || ''} subtitle="3PL partner">
        {pick && <KV items={[{ label: 'Spend', value: fmt(pick.cost) }, { label: 'Sites', value: fmtN(pick.warehouses) }, { label: 'Per month', value: pick.months > 0 ? fmt(pick.cost / pick.months) : '—' },
          { label: '₹ / parcel', value: money1(pick.perShip) }, { label: '₹ / kg', value: money1(pick.perKg) }, { label: 'Parcels', value: pick.shipments > 0 ? fmtN(pick.shipments) : '—' }]} />}
      </BottomSheet>
    </Card>
  )
}

function Warehouses({ warehouses }) {
  const [full, setFull] = useState(false)
  const [pick, setPick] = useState(null)
  const sub = w => `${w.partner || '—'} · ${w.location || w.pincode || '—'} · ${w.shipments > 0 ? `${fmtN(w.shipments)} parcels` : 'no parcels matched'}`
  const right = w => (w.shipments > 0 ? `${money1(w.cost / w.shipments)}/parcel · ${w.weight_kg > 0 ? money1(w.cost / w.weight_kg) : '—'}/kg` : '—')
  return (
    <Card title="Warehouses (sites)">
      {warehouses.slice(0, 6).map(w => <PartnerRow key={w.key} name={w.key} sub={sub(w)} value={fmt(w.cost)} valueSub={right(w)} bar={null} onClick={() => setPick(w)} />)}
      {warehouses.length > 6 && <ShowAllButton onClick={() => setFull(true)}>Show all {warehouses.length} sites →</ShowAllButton>}
      <FullScreenList open={full} onClose={() => setFull(false)} title="Warehouses" noun="sites" items={warehouses}
        sorts={[{ key: 'cost', label: 'Total', value: w => w.cost, format: w => fmt(w.cost) }, { key: 'ps', label: '₹ / parcel', value: w => (w.shipments > 0 ? w.cost / w.shipments : -1), format: w => (w.shipments > 0 ? money1(w.cost / w.shipments) : '—') }]}
        name={w => w.key} sub={sub} searchText={w => `${w.key} ${w.partner || ''} ${w.location || ''} ${w.pincode || ''}`} onSelect={w => setPick(w)} />
      <BottomSheet open={!!pick} onClose={() => setPick(null)} title={pick?.key || ''} subtitle={pick?.partner}>
        {pick && <KV items={[{ label: 'Pincode', value: pick.pincode || '—' }, { label: 'Location', value: pick.location || '—' }, { label: 'Parcels', value: pick.shipments > 0 ? fmtN(pick.shipments) : '—' },
          { label: 'Weight', value: pick.weight_kg > 0 ? `${fmtN(Math.round(pick.weight_kg))} kg` : '—' }, { label: 'Total', value: fmt(pick.cost) },
          { label: '₹ / parcel', value: pick.shipments > 0 ? money1(pick.cost / pick.shipments) : '—' }, { label: '₹ / kg', value: pick.weight_kg > 0 ? money1(pick.cost / pick.weight_kg) : '—' }]} />}
      </BottomSheet>
    </Card>
  )
}

function SiteTrend({ whTrend, names, tplTrend }) {
  const [site, setSite] = useState(names[0] || null)
  if (!names.length || !whTrend.length) return null
  const blended = new Map((tplTrend || []).map(m => [m.key, m.per_ship]))
  const pts = whTrend.map(m => ({ month: m.month, key: m.key, v: m[site] ?? null, b: blended.get(m.key) ?? null }))
  return (
    <Card title="Site trend" sub="Cost per parcel by month, against the blended rate">
      <Chips label="Site" options={names.map(n => ({ id: n, label: n }))} value={site} onChange={setSite} />
      <div style={{ padding: '6px 0 10px' }}><Sparkline values={pts.map(p => p.v ?? 0)} width={300} height={56} color={M.green} label={`${site} cost per parcel`} /></div>
      <KV items={pts.map(p => ({ label: p.month, value: `${p.v != null ? money1(p.v) : '—'} · blended ${p.b != null ? money1(p.b) : '—'}` }))} />
    </Card>
  )
}

export default function Cost3plMobile({ tpl, agg, tplTrend, shareBySite, whTrend, whNames, layout }) {
  if (!tpl) return null
  if (!tpl.totals?.rows) return <Card title="No 3PL invoices yet"><div style={{ fontSize: 13, color: M.muted }}>Add warehousing bills from the Logistics Bill Ledger page and the site breakdown will appear here.</div></Card>
  const f = tplFigures(tpl, agg, tplTrend)
  return (
    <>
      <TplMaster f={f} tplTrend={tplTrend} layout={layout} />
      <Partners partners={tpl.partners} shareBySite={shareBySite} />
      <Warehouses warehouses={tpl.warehouses || []} />
      <SiteTrend whTrend={whTrend || []} names={whNames || []} tplTrend={tplTrend} />
    </>
  )
}
