import { useCallback, useMemo, useState } from 'react'
import { C, fmt, fmtN, fmtBig, COURIER_LOGOS } from '../../utils.js'
import MasterTrendCard from '../../responsive/MasterTrendCard.jsx'
import SegmentToggle from '../../responsive/SegmentToggle.jsx'
import BottomSheet from '../../responsive/BottomSheet.jsx'
import FullScreenList from '../../responsive/FullScreenList.jsx'
import FilterPicker from '../../responsive/FilterPicker.jsx'
import DrillDownList from '../../responsive/DrillDownList.jsx'
import Sparkline from '../../responsive/Sparkline.jsx'
import ActionMenu from '../../responsive/ActionMenu.jsx'
import { Card, ShowAllButton, KV, RowText, Chips } from '../../responsive/CardKit.jsx'
import { PartnerRow } from './CostOverviewMobile.jsx'

// Logistics → Cost → B2C below 1024px (LOGISTICS_MOBILE_REDESIGN_PROMPT.md §4). Display only: every
// list is one of LogisticsCostPage's memos (courierRows, slabRows, bandRows, zoneRowsShown, modeRows,
// driftRows, activeCell …) and every cell uses the desktop table's own format and red/green rule.
const M = C.m
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monShort = raw => MON[parseInt(String(raw).split('-')[1], 10) - 1] || raw
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
const rs = (v, d = 2) => (v == null ? '—' : '₹' + Number(v).toFixed(d))
const B2C_WINDOWS = [{ id: 1, label: '1M' }, { id: 3, label: '3M' }, { id: 6, label: '6M' }, { id: 999, label: 'All' }]
const Logo = ({ name }) => (COURIER_LOGOS[name] ? <img src={COURIER_LOGOS[name]} alt="" style={{ display: 'inline-block', width: 16, height: 16, objectFit: 'contain', borderRadius: 3, verticalAlign: '-3px', marginRight: 6 }} /> : null)

function B2CMaster({ kpis, agg, mom, heroDeltas, reverseBurden, trendRows, trendWindow, trendMonths, setTrendMonths, fmtKg, layout, onShowTable }) {
  const groupTrend = useCallback(rows => (rows || []).map(r => ({ ...r, date: `${r.raw}-01` })), [])
  // MoM compares the ledger's latest two months (desktop heroDeltas), not the selected month, so the
  // label names them ("Sep vs Aug").
  const momD = heroDeltas.find(d => d.note === 'MoM')
  const momLabel = mom ? `${monShort(mom.curr.raw)} vs ${monShort(mom.prev.raw)}` : 'MoM'
  const compare = momD ? [{ label: momLabel, delta: momD.pct }] : null
  const sub = `${kpis.costPctValue != null ? `${kpis.costPctValue.toFixed(2)}% of GMV · ` : ''}${fmtBig(kpis.shipments)} invoices · ${fmtKg(kpis.chargedWt)} billed`
  const metrics = [
    { key: 'cost', label: 'B2C logistics cost', tileLabel: 'B2C cost', value: fmt(kpis.total), sub, compare, delta: momD ? momD.pct : null, lowerIsBetter: true,
      def: 'B2C courier freight for the selected billing months. ▲/▼ compares the ledger\'s latest two months.', point: r => r.cost, fmtPoint: fmt },
    { key: 'value', label: 'Total shipment value', tileLabel: 'Shipment value', value: fmt(agg.shipValue), sub: 'goods shipped', deltasHidden: true, point: r => r.value, fmtPoint: fmt },
    { key: 'cpk', label: 'Cost per kg', value: kpis.cpk != null ? '₹' + kpis.cpk.toFixed(2) : '—', sub: `${fmtKg(kpis.chargedWt)} billed`, deltasHidden: true, point: r => r.cpk, fmtPoint: v => rs(v) },
    { key: 'avg', label: 'Avg cost / shipment', tileLabel: 'Cost / shpmt', value: kpis.avgCost != null ? '₹' + kpis.avgCost.toFixed(2) : '—', sub: 'freight ÷ invoices', deltasHidden: true, point: r => r.avgCost, fmtPoint: v => rs(v) },
    { key: 'sur', label: 'Surcharge % of freight', tileLabel: 'Surcharge %', value: kpis.surchargePct != null ? kpis.surchargePct.toFixed(1) + '%' : '—', sub: `${fmt(agg.surcharge)} of ${fmt(agg.cost)} billed`, deltasHidden: true },
    { key: 'waste', label: 'Wasted freight (returns)', tileLabel: 'Wasted freight', value: fmt(reverseBurden.cost), valueColor: M.down, sub: `${fmtN(reverseBurden.n)} legs · ${reverseBurden.pct.toFixed(1)}% of spend`, deltasHidden: true,
      def: 'Freight on RTO and reverse legs: cost with no sale against it.' },
  ]
  return (
    <div>
      <MasterTrendCard small metrics={metrics} rawRows={trendWindow} groupTrend={groupTrend} layout={layout} granularity="monthly"
        windowMenu={{ title: 'Show months', options: B2C_WINDOWS, value: trendMonths, onChange: setTrendMonths }} />
      {trendRows.length > 0 && <ShowAllButton onClick={onShowTable}>Show monthly table →</ShowAllButton>}
    </div>
  )
}

function Couriers({ courierRows }) {
  const [sort, setSort] = useState('cost')
  const [pick, setPick] = useState(null)
  const tot = courierRows.reduce((a, x) => a + (Number(x.cost) || 0), 0)
  const key = { cost: 'cost', ship: 'avgCost', kg: 'cpk', over: 'overPct' }[sort]
  const rows = [...courierRows].sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1))
  const share = r => (tot > 0 ? ((Number(r.cost) || 0) / tot) * 100 : null)
  const overNode = r => <span style={{ color: r.overPct > 25 ? M.down : undefined, fontWeight: r.overPct > 25 ? 700 : undefined }}>{r.overPct.toFixed(1)}%</span>
  const value = r => (sort === 'ship' ? rs(r.avgCost) : sort === 'kg' ? rs(r.cpk) : sort === 'over' ? overNode(r) : fmt(r.cost))
  return (
    <Card title="Couriers" right={<span style={{ fontSize: 12, color: M.muted }}>{courierRows.length} partners</span>}>
      <Chips label="Sort by" options={[{ id: 'cost', label: 'Cost' }, { id: 'ship', label: '₹ / shipment' }, { id: 'kg', label: '₹ / kg' }, { id: 'over', label: 'Over-weight' }]} value={sort} onChange={setSort} />
      {rows.map(r => (
        <PartnerRow key={r.courier} name={<><Logo name={r.courier} />{r.courier}</>} sub={`${fmtN(r.shipments)} · ₹${r.avgCost.toFixed(2)}/shpmt${r.cpk != null ? ` · ₹${r.cpk.toFixed(2)}/kg` : ''}`}
          value={value(r)} valueSub={<>{share(r) != null ? `${share(r).toFixed(1)}%` : '—'} · over-wt {overNode(r)}</>} bar={sort === 'cost' ? share(r) : null} onClick={() => setPick(r)} />
      ))}
      <BottomSheet open={!!pick} onClose={() => setPick(null)} title={pick?.courier || ''} subtitle="Courier partner">
        {pick && <KV items={[
          { label: 'Shipments', value: fmtN(pick.shipments) }, { label: 'Cost', value: fmt(pick.cost) },
          { label: 'Avg cost / shipment', value: rs(pick.avgCost) }, { label: 'Cost / kg', value: rs(pick.cpk) },
          { label: 'Over wt', value: `${fmtN(pick.overN)} (${pick.overPct.toFixed(1)}%)`, color: pick.overPct > 25 ? M.down : undefined },
          { label: 'Under wt', value: `${fmtN(pick.underN)} (${pick.underPct.toFixed(1)}%)` },
          { label: 'Share of spend', value: share(pick) != null ? `${share(pick).toFixed(1)}%` : '—' },
        ]} />}
      </BottomSheet>
    </Card>
  )
}

function MoneyCard({ zoneRows, modeRows, zoneSub, setZoneSub, zoneSubOptions }) {
  const [view, setView] = useState('zone')
  const [pickSub, setPickSub] = useState(false)
  const rows = view === 'zone'
    ? zoneRows.map(r => ({ key: r.zone, name: `Zone ${r.zone}`, value: fmt(r.cost), valueSub: `${r.share.toFixed(1)}%`, bar: r.share, sub: `${fmtN(r.shipments)} shpmt · ₹${r.avgCost.toFixed(2)}/shpmt${r.cpk != null ? ` · ₹${r.cpk.toFixed(2)}/kg` : ''}` }))
    : modeRows.map(r => ({ key: r.mode, name: r.mode, value: fmt(r.cost), valueSub: `${r.share.toFixed(1)}%`, bar: r.share, sub: `${fmtN(r.shipments)} shpmt · ₹${r.avgCost.toFixed(2)}/shpmt` }))
  return (
    <Card title="Where the money goes">
      <SegmentToggle full label="Split by" options={[{ id: 'zone', label: 'By zone' }, { id: 'leg', label: 'By leg' }]} value={view} onChange={setView} />
      {view === 'zone' && (
        <button type="button" onClick={() => setPickSub(true)} style={{ marginTop: 8, minHeight: 32, padding: '0 12px', borderRadius: 999, border: `1px solid ${zoneSub ? M.green : M.line}`, background: zoneSub ? 'rgba(31,90,61,.08)' : '#fff', color: M.ink, fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>
          {zoneSub || 'All sub-categories'} ▾
        </button>
      )}
      <div style={{ marginTop: 6 }}>{rows.map(r => <PartnerRow key={r.key} {...r} />)}</div>
      <BottomSheet open={pickSub} onClose={() => setPickSub(false)} title="Sub-category">
        <FilterPicker title="Sub-category" noun="sub-categories" multi={false} options={(zoneSubOptions || []).map(v => ({ value: v }))} selected={zoneSub ? [zoneSub] : []}
          onBack={() => setPickSub(false)} onApply={v => { setZoneSub(v[0] || ''); setPickSub(false) }} />
      </BottomSheet>
    </Card>
  )
}

function SlabsCard({ slabRows, bandRows }) {
  const [view, setView] = useState('slab')
  const [full, setFull] = useState(false)
  const [pick, setPick] = useState(null)
  const bySpend = useMemo(() => [...slabRows].sort((a, b) => b.cost - a.cost), [slabRows])
  const slabSub = r => `${fmtN(r.n)} shpmt · ₹${r.avgCost.toFixed(0)}/shpmt · ₹${r.cpk.toFixed(1)}/kg`
  const menu = view === 'slab' ? [{ id: 'search', label: 'Search slabs', onSelect: () => setFull(true) }] : []
  return (
    <Card title="Weight slabs" right={<ActionMenu items={menu} tone="light" title="Weight slabs" />}>
      <SegmentToggle full label="Slabs" options={[{ id: 'slab', label: 'Billed slab' }, { id: 'band', label: 'Rate card band' }]} value={view} onChange={setView} />
      <div style={{ marginTop: 6 }}>
        {view === 'slab'
          ? bySpend.slice(0, 8).map(r => <PartnerRow key={r.slab} name={`${r.slab} kg`} sub={slabSub(r)} value={fmt(r.cost)} valueSub={`${r.share.toFixed(1)}%`} bar={r.share} onClick={() => setPick({ slab: r })} />)
          : bandRows.map(r => <PartnerRow key={r.band} name={r.band} sub={`${fmtN(r.shipments)} shpmt · ${rs(r.avgCost)}/shpmt · ${r.cpk != null ? rs(r.cpk) : '—'}/kg`} value={fmt(r.cost)} valueSub={`${r.share.toFixed(1)}% · overbilled ${r.overPct.toFixed(1)}%`} bar={r.share} onClick={() => setPick({ band: r })} />)}
      </div>
      {view === 'slab' && bySpend.length > 8 && <ShowAllButton onClick={() => setFull(true)}>Show all {bySpend.length} slabs →</ShowAllButton>}
      <FullScreenList open={full} onClose={() => setFull(false)} title="Weight slabs" noun="slabs" items={bySpend}
        sorts={[{ key: 'cost', label: 'Spend', value: r => r.cost, format: r => fmt(r.cost) }, { key: 'cpk', label: '₹ / kg', value: r => r.cpk, format: r => `₹${r.cpk.toFixed(1)}` }, { key: 'n', label: 'Shipments', value: r => r.n, format: r => fmtN(r.n) }]}
        name={r => `${r.slab} kg`} sub={slabSub} secondary={r => `${r.share.toFixed(1)}%`} searchText={r => `${r.slab} kg`} onSelect={r => setPick({ slab: r })} />
      <BottomSheet open={!!pick} onClose={() => setPick(null)} title={pick?.slab ? `${pick.slab.slab} kg` : pick?.band?.band || ''} subtitle={pick?.slab ? 'Billed weight slab' : 'Rate card band'}>
        {pick?.slab && <KV items={[{ label: 'Shipments', value: fmtN(pick.slab.n) }, { label: 'Total spend', value: fmt(pick.slab.cost) }, { label: 'Avg / shipment', value: `₹${pick.slab.avgCost.toFixed(0)}` }, { label: 'Cost / kg', value: `₹${pick.slab.cpk.toFixed(1)}` },
          { label: 'Forward', value: pick.slab.fwdAvg ? `₹${pick.slab.fwdAvg.toFixed(0)}` : '—' }, { label: 'Reverse', value: pick.slab.revAvg ? `₹${pick.slab.revAvg.toFixed(0)}` : '—' }, { label: 'RTO', value: pick.slab.rtoAvg ? `₹${pick.slab.rtoAvg.toFixed(0)}` : '—' }, { label: 'Share of spend', value: `${pick.slab.share.toFixed(1)}%` }]} />}
        {pick?.band && <KV items={[{ label: 'Shipments', value: fmtN(pick.band.shipments) }, { label: 'Total cost', value: fmt(pick.band.cost) }, { label: 'Share', value: `${pick.band.share.toFixed(1)}%` }, { label: 'Avg / shipment', value: rs(pick.band.avgCost) },
          { label: 'Cost / kg', value: rs(pick.band.cpk) }, { label: 'Overbilled', value: `${pick.band.overPct.toFixed(1)}%` }]} />}
      </BottomSheet>
    </Card>
  )
}

function DriftCard({ driftRows, trendAll }) {
  const [pick, setPick] = useState(null)
  // Desktop drift colour: above +5% red, below −5% green; fewer than 2 months → "—".
  const tone = r => (r.months < 2 ? undefined : r.drift > 5 ? M.down : r.drift < -5 ? M.up : undefined)
  const series = useMemo(() => {
    if (!pick) return []
    return (trendAll || []).filter(r => r.courier_name === pick.courier && r.month_year).map(r => ({ m: r.month_year, cpk: r.wt ? r.cost / r.wt : 0 })).sort((a, b) => a.m.localeCompare(b.m))
  }, [pick, trendAll])
  return (
    <Card title="Rate drift by courier" sub="₹ per kg, first month → latest month">
      {driftRows.map(r => (
        <PartnerRow key={r.courier} name={<><Logo name={r.courier} />{r.courier}</>} sub={`₹${r.first.toFixed(2)} → ₹${r.last.toFixed(2)} /kg · ${fmtN(r.months)} months`}
          value={<span style={{ color: tone(r) }}>{r.months < 2 ? '—' : (r.drift >= 0 ? '+' : '') + r.drift.toFixed(1) + '%'}</span>} valueSub="drift" bar={null} onClick={() => setPick(r)} />
      ))}
      <BottomSheet open={!!pick} onClose={() => setPick(null)} title={pick?.courier || ''} subtitle="₹ per kg by month">
        {pick && (
          <>
            <div style={{ padding: '4px 0 12px' }}><Sparkline values={series.map(s => s.cpk)} width={300} height={60} color={M.green} label={`${pick.courier} ₹ per kg by month`} /></div>
            <KV items={series.map(s => ({ label: `${monShort(s.m)} ${s.m.slice(0, 4)}`, value: `₹${s.cpk.toFixed(2)}` }))} />
          </>
        )}
      </BottomSheet>
    </Card>
  )
}

function ProductCard({ byProduct, costToServe }) {
  const [leaf, setLeaf] = useState(null)
  // The desktop productRows fields for a category / sub-category, unfiltered by search.
  const shape = useCallback((c, isSub) => ({
    key: isSub ? c.sub : c.cat, label: isSub ? c.sub : c.cat, kids: isSub ? [] : (c.children || []),
    n: num(c.n), cost: num(c.cost), fwd: num(c.fwd_avg), rev: num(c.rev_avg), rto: num(c.rto_avg), ...costToServe(c),
    cw: num(c.cw_slab_avg), masterKg: num(c.master_kg), masterSlab: num(c.master_slab), overSlabN: num(c.over_slab_n), underSlabN: num(c.under_slab_n), cmpN: num(c.cmp_n),
  }), [costToServe])
  const getRows = useCallback(path => (path.length === 0 ? (byProduct || []).map(c => shape(c, false)) : [...path.at(-1).kids].sort((a, b) => num(b.cost) - num(a.cost)).map(s => shape(s, true))), [byProduct, shape])
  const over = r => (r.cmpN > 0 ? `${fmtN(r.overSlabN)} (${((r.overSlabN / r.cmpN) * 100).toFixed(1)}%)` : '—')
  return (
    <Card title="Cost by product">
      <DrillDownList rootLabel="All categories" getRows={getRows} rowKey={r => r.key} rowLabel={r => r.label} canOpen={(r, depth) => depth === 0 && r.kids.length > 0} onLeaf={r => setLeaf(r)}
        renderRow={r => <RowText name={r.label} sub={`${fmtN(r.n)} shpmt · ${r.ctsReal ? `${fmt(r.ctsReal)}/order` : '—/order'}`} value={fmt(r.cost)} valueSub={r.overSlabN > 0 ? <span style={{ color: M.down, fontWeight: 700 }}>over-wt {over(r)}</span> : 'spend'} />} />
      <BottomSheet open={!!leaf} onClose={() => setLeaf(null)} title={leaf?.label || ''} subtitle="Cost by product">
        {leaf && <KV items={[
          { label: 'Shipments', value: fmtN(leaf.n) }, { label: 'Spend', value: fmt(leaf.cost) }, { label: 'Forward', value: leaf.fwd ? fmt(leaf.fwd) : '—' }, { label: 'Reverse', value: leaf.rev ? fmt(leaf.rev) : '—' },
          { label: 'RTO (net)', value: leaf.rto ? fmt(leaf.rto) : '—' }, { label: 'Cost / order', value: leaf.ctsReal ? fmt(leaf.ctsReal) : '—' },
          { label: 'Billed slab', value: leaf.masterSlab > 0 ? `${leaf.masterSlab} kg` : leaf.cw > 0 ? `~${leaf.cw.toFixed(1)} kg` : '—' }, { label: 'Actual wt', value: leaf.masterKg > 0 ? `${leaf.masterKg.toFixed(2)} kg` : '—' },
          { label: 'Avg billed wt', value: leaf.cw > 0 ? `${leaf.cw.toFixed(2)} kg` : '—' }, { label: 'Over wt', value: over(leaf), color: leaf.overSlabN > 0 ? M.down : undefined },
          { label: 'Under wt', value: leaf.cmpN > 0 ? `${fmtN(leaf.underSlabN)} (${((leaf.underSlabN / leaf.cmpN) * 100).toFixed(1)}%)` : '—' },
        ]} />}
      </BottomSheet>
    </Card>
  )
}

function LikeForLike({ activeCell, lflOptions, lfl }) {
  const [picker, setPicker] = useState(null)
  const chip = (id, label, on) => (
    <button key={id} type="button" onClick={() => setPicker(id)} style={{ flex: '0 0 auto', minHeight: 28, padding: '0 9px', borderRadius: 999, border: `1px solid ${on ? M.green : M.line}`, background: on ? 'rgba(31,90,61,.08)' : '#fff', color: M.ink, fontSize: 12, fontWeight: on ? 700 : 500, fontFamily: 'var(--font)', cursor: 'pointer' }}>{label} ▾</button>
  )
  const P = {
    zone: { title: 'Zone', noun: 'zones', options: lflOptions.zones, selected: lfl.zones, apply: lfl.setZones, multi: true, label: v => `Zone ${v}` },
    band: { title: 'Weight slab', noun: 'slabs', options: lflOptions.bands, selected: lfl.bands, apply: lfl.setBands, multi: true },
    leg: { title: 'Leg', noun: 'legs', options: lflOptions.legs, selected: lfl.legs, apply: lfl.setLegs, multi: true },
    slab: { title: 'Specific slab', noun: 'slabs', options: lflOptions.slabs.map(String), selected: lfl.slab !== '' ? [String(lfl.slab)] : [], apply: v => lfl.setSlab(v[0] ?? ''), multi: false, label: v => `${v} kg` },
  }
  const p = picker ? P[picker] : null
  const rows = activeCell.rows
  return (
    <Card title="Like-for-like courier cost" sub="Same zone, slab and leg: who is cheapest">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {chip('zone', lfl.zones.length ? `Zone ${lfl.zones.join(', ')}` : 'All zones', lfl.zones.length > 0)}
        {chip('band', lfl.bands.length ? lfl.bands.join(', ') : 'All slabs', lfl.bands.length > 0)}
        {chip('leg', lfl.legs.length ? lfl.legs.join(', ') : 'All legs', lfl.legs.length > 0)}
        {chip('slab', lfl.slab !== '' ? `${lfl.slab} kg` : 'Specific slab', lfl.slab !== '')}
      </div>
      {rows.length < 2 && <div style={{ fontSize: 13, color: M.muted, padding: '8px 0' }}>Fewer than two couriers ship this combination, so there is nothing to compare.</div>}
      {rows.length >= 2 && rows.map(r => {
        const d = r.avgCost - rows[0].avgCost
        return (
          <PartnerRow key={r.courier} name={<><Logo name={r.courier} />{r.courier}</>} sub={`${fmtN(r.n)} shpmt · ₹${r.cpk.toFixed(2)}/kg`} value={`₹${r.avgCost.toFixed(2)}`}
            valueSub={d < 0.01 ? <span style={{ color: M.up, fontWeight: 700 }}>cheapest</span> : <span style={{ color: M.down }}>{'+₹' + d.toFixed(2)}</span>} bar={null} />
        )
      })}
      <BottomSheet open={!!p} onClose={() => setPicker(null)} title={p?.title || ''}>
        {p && <FilterPicker title={p.title} noun={p.noun} multi={p.multi} options={p.options.map(v => ({ value: v, label: p.label ? p.label(v) : v }))} selected={p.selected.map(String)}
          onBack={() => setPicker(null)} onApply={v => { p.apply(v); setPicker(null) }} />}
      </BottomSheet>
    </Card>
  )
}

export default function CostB2CMobile(props) {
  const { kpis, agg, trendRows, trendWindow, fmtKg } = props
  const [table, setTable] = useState(false)
  if (!kpis || !agg) return null
  const tot = trendWindow.reduce((a, x) => a + (Number(x.cost) || 0), 0)
  return (
    <>
      <B2CMaster {...props} onShowTable={() => setTable(true)} />
      <Couriers courierRows={props.courierRows} />
      <MoneyCard zoneRows={props.zoneRows} modeRows={props.modeRows} zoneSub={props.zoneSub} setZoneSub={props.setZoneSub} zoneSubOptions={props.zoneSubOptions} />
      <SlabsCard slabRows={props.slabRows} bandRows={props.bandRows} />
      <DriftCard driftRows={props.driftRows} trendAll={agg.trendAll} />
      <ProductCard byProduct={agg.byProduct} costToServe={props.costToServe} />
      <LikeForLike activeCell={props.activeCell} lflOptions={props.lflOptions} lfl={props.lfl} />
      <FullScreenList open={table} onClose={() => setTable(false)} title="Monthly B2C freight" noun="months" items={trendWindow.length ? trendWindow : trendRows}
        sorts={[{ key: 'raw', label: 'Month', value: r => -Number(String(r.raw).replace('-', '')), format: r => fmt(r.cost) }, { key: 'cost', label: 'Freight cost', value: r => r.cost, format: r => fmt(r.cost) }]}
        name={r => r.month} sub={r => `${fmtN(r.shipments)} shpmt · ₹${r.avgCost.toFixed(2)}/shpmt · ₹${r.cpk.toFixed(2)}/kg · ${fmtKg(r.wt)} · ${r.pctGmv != null ? r.pctGmv.toFixed(2) + '%' : '—'} of GMV`}
        secondary={r => (tot > 0 ? `${(((Number(r.cost) || 0) / tot) * 100).toFixed(1)}% of spend` : '—')} searchText={r => r.month} />
    </>
  )
}
