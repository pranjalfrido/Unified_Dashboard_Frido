import { useCallback, useState } from 'react'
import { C, fmt, fmtN, fmtBig } from '../../utils.js'
import MasterTrendCard from '../../responsive/MasterTrendCard.jsx'
import MixBar, { MixLegend } from '../../responsive/MixBar.jsx'
import SegmentToggle from '../../responsive/SegmentToggle.jsx'
import BottomSheet from '../../responsive/BottomSheet.jsx'
import { Card, ShowAllButton, KV, RowText } from '../../responsive/CardKit.jsx'
import { TREND_WINDOWS } from './costMobileData.js'

// Logistics → Cost → Overview below 1024px (LOGISTICS_MOBILE_REDESIGN_PROMPT.md §3). Display only:
// `overall`, the monthly series and the partner rows are LogisticsCostPage's own memos (the same
// values the desktop Overview tiles and partner cards print).
const M = C.m
const money1 = v => (v == null || !isFinite(v) ? '—' : '₹' + Number(v).toFixed(1))
const shareOf = (v, t) => (t ? (v / t) * 100 : 0)

// Split bar shared by the Overview (B2C / FTL/PTL / 3PL) and 3PL (Operations / Rental / Other) cards.
export function SplitTop({ parts }) {
  const total = parts.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div>
      <MixBar parts={parts} height={8} label="Cost split" />
      <MixLegend parts={parts.filter(p => p.value > 0)} fmt={v => `${Math.round(shareOf(v, total))}%`} style={{ marginTop: 6 }} />
    </div>
  )
}

export function CostMaster({ overall, months, trendWindow, setTrendWindow, layout }) {
  const groupTrend = useCallback(rows => (rows || []).map(r => ({ ...r, date: `${r.raw}-01` })), [])
  const o = overall
  const pctOfSpend = v => `${shareOf(v, o.total).toFixed(1)}% of spend`
  const pctValue = o.b2bValue == null
    ? { value: o.b2cLogisticsPct != null ? o.b2cLogisticsPct.toFixed(2) + '%' : '—', sub: 'B2C basis · freight value pending' }
    : { value: o.logisticsPct != null ? o.logisticsPct.toFixed(2) + '%' : '—', sub: 'all cost ÷ all shipment value' }
  const series = key => ({ point: r => r[key] ?? null, fmtPoint: fmt })
  const metrics = [
    { key: 'total', label: 'Total logistics cost', tileLabel: 'Total cost', value: fmt(o.total), deltasHidden: true,
      sub: `${o.logisticsPct != null ? `${o.logisticsPct.toFixed(2)}% of shipment value · ` : ''}${fmtBig(o.b2cUnits)} parcels · ${fmtN(o.b2bUnits)} trips`,
      def: 'B2C courier + FTL/PTL freight + 3PL warehousing for the selected billing months.', ...series('total') },
    { key: 'b2c', label: 'B2C courier cost', tileLabel: 'B2C courier', value: fmt(o.b2cCost), sub: pctOfSpend(o.b2cCost), deltasHidden: true, ...series('b2c') },
    { key: 'b2b', label: 'FTL/PTL freight cost', tileLabel: 'FTL/PTL freight', value: fmt(o.b2bCost), sub: pctOfSpend(o.b2bCost), deltasHidden: true, ...series('b2b') },
    { key: 'tpl', label: '3PL warehousing cost', tileLabel: '3PL warehousing', value: o.tplCost > 0 ? fmt(o.tplCost) : '—', sub: o.tplCost > 0 ? pctOfSpend(o.tplCost) : 'no 3PL invoices', deltasHidden: true, ...series('tpl') },
    { key: 'partners', label: 'Partners', value: fmtN(o.carriers + o.tplPartners), sub: `${fmtN(o.carriers)} carriers · ${fmtN(o.tplPartners)} 3PL · ${fmtN(o.tplSites)} sites`, deltasHidden: true },
    { key: 'pct', label: 'Logistics % of value', tileLabel: '% of value', value: pctValue.value, sub: pctValue.sub, deltasHidden: true, def: 'Logistics cost ÷ shipment value.' },
  ]
  return (
    <MasterTrendCard metrics={metrics} rawRows={months} groupTrend={groupTrend} layout={layout} granularity="monthly"
      windowMenu={{ title: 'Show months', options: TREND_WINDOWS, value: trendWindow, onChange: setTrendWindow }}
      note={<SplitTop parts={[
        { key: 'b2c', label: 'B2C', value: o.b2cCost, color: M.green },
        { key: 'b2b', label: 'FTL/PTL', value: o.b2bCost, color: M.g2 },
        { key: 'tpl', label: '3PL', value: o.tplCost, color: M.g3 },
      ]} />} />
  )
}

// Ranked partner row: name + unit rates, cost + share, thin share bar.
export function PartnerRow({ name, sub, value, valueSub, bar, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderTop: `1px solid ${M.line}`, background: 'transparent', padding: '10px 0', fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer' }}>
      <RowText name={name} sub={sub} value={value} valueSub={valueSub} />
      {bar != null && <span aria-hidden="true" style={{ display: 'block', height: 3, marginTop: 6, borderRadius: 2, background: M.line }}><i style={{ display: 'block', height: '100%', width: `${Math.max(1, Math.min(100, bar))}%`, background: M.green, borderRadius: 2 }} /></span>}
    </button>
  )
}

function Partners({ overall, b2cCards, b2bCards, fixedVeh, fixedVehMonths, tplPartners }) {
  const [view, setView] = useState('b2c')
  const [all, setAll] = useState(false)
  const [pick, setPick] = useState(null)
  let rows
  if (view === 'b2c') {
    rows = b2cCards.map(c => ({
      key: c.key, name: c.key, value: fmt(c.cost), valueSub: `${c.share.toFixed(1)}%`, bar: c.share,
      sub: `${fmtBig(c.shipments)} shpmt · ₹${c.avgCost.toFixed(0)}/shpmt${c.cpk != null ? ` · ₹${c.cpk.toFixed(1)}/kg` : ''}`,
      kv: [{ label: 'Cost', value: fmt(c.cost) }, { label: 'Share', value: `${c.share.toFixed(1)}%` }, { label: 'Shipments', value: fmtBig(c.shipments) }, { label: '₹ / shipment', value: `₹${c.avgCost.toFixed(0)}` },
        { label: '₹ / kg', value: c.cpk != null ? `₹${c.cpk.toFixed(1)}` : '—' }, { label: '% of value', value: c.pctValue != null ? c.pctValue.toFixed(2) + '%' : '—' }],
    }))
  } else if (view === 'b2b') {
    rows = b2bCards.map(c => ({
      key: c.key, name: c.key, value: fmt(c.cost), valueSub: `${c.share.toFixed(1)}%`, bar: c.share,
      sub: `${fmtN(c.trips)} trips · ₹${Math.round(c.avgCost).toLocaleString('en-IN')}/trip`,
      kv: [{ label: 'Cost', value: fmt(c.cost) }, { label: 'Share', value: `${c.share.toFixed(1)}%` }, { label: 'Trips', value: fmtN(c.trips) }, { label: '₹ / trip', value: `₹${Math.round(c.avgCost).toLocaleString('en-IN')}` },
        { label: 'Vehicles', value: `${c.vehicleCount}${c.freightTypes ? ` · ${c.freightTypes}` : ''}` }, { label: 'Mostly', value: c.topVehicle || '—' }],
    }))
    // Rental fixed vehicle: its own row, billed monthly and never added to the freight total (as desktop).
    if ((fixedVeh && fixedVeh.cost > 0) || fixedVehMonths?.length > 0) {
      const has = fixedVeh && fixedVeh.cost > 0
      const last = [...(fixedVehMonths || [])].map(r => r.month_year).sort().at(-1)
      rows.push({
        key: '__rental', name: 'Rental fixed vehicle', value: has ? fmt(fixedVeh.cost) : '—', valueSub: 'fixed', bar: null,
        sub: has ? `${fmtN(fixedVeh.distinct_vehicles)} vehicles · ${fixedVeh.months > 0 ? `${fmt(fixedVeh.cost / fixedVeh.months)}/month` : '—'}` : `not uploaded for this period · last uploaded ${last}`,
        kv: has ? [{ label: 'Cost', value: fmt(fixedVeh.cost) }, { label: 'Vehicles', value: fmtN(fixedVeh.distinct_vehicles) }, { label: 'Per month', value: fixedVeh.months > 0 ? fmt(fixedVeh.cost / fixedVeh.months) : '—' },
          ...(fixedVeh.carried?.length ? [{ label: 'Carried', value: fixedVeh.carried.map(c => `${c.month} = ${c.from}`).join(', ') }] : [])] : [{ label: 'Last uploaded', value: last || '—' }],
      })
    }
  } else {
    rows = (tplPartners || []).map(pp => {
      const pct = overall.tplCost > 0 ? (pp.cost / overall.tplCost) * 100 : 0
      return {
        key: pp.key, name: pp.key, value: fmt(pp.cost), valueSub: `${pct.toFixed(1)}%`, bar: pct,
        sub: `${fmtN(pp.warehouses)} site${pp.warehouses === 1 ? '' : 's'} · ${pp.shipments > 0 ? `${money1(pp.cost / pp.shipments)}/parcel` : '—/parcel'}`,
        kv: [{ label: 'Cost', value: fmt(pp.cost) }, { label: 'Share', value: `${pct.toFixed(1)}%` }, { label: 'Sites', value: fmtN(pp.warehouses) }, { label: 'Per month', value: pp.months > 0 ? fmt(pp.cost / pp.months) : '—' },
          { label: '₹ / parcel', value: pp.shipments > 0 ? money1(pp.cost / pp.shipments) : '—' }, { label: '₹ / kg', value: pp.weight_kg > 0 ? money1(pp.cost / pp.weight_kg) : '—' }],
      }
    })
  }
  const shown = all ? rows : rows.slice(0, 5)
  return (
    <Card title="Partners">
      <SegmentToggle full label="Partner type" options={[{ id: 'b2c', label: 'B2C couriers' }, { id: 'b2b', label: 'FTL/PTL' }, { id: 'tpl', label: '3PL' }]} value={view} onChange={v => { setView(v); setAll(false) }} />
      <div style={{ marginTop: 6 }}>
        {!rows.length && <div style={{ padding: '12px 0', fontSize: 13, color: M.muted }}>No partners for these months.</div>}
        {shown.map(r => <PartnerRow key={r.key} {...r} onClick={() => setPick(r)} />)}
      </div>
      {rows.length > 5 && <ShowAllButton onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</ShowAllButton>}
      <BottomSheet open={!!pick} onClose={() => setPick(null)} title={pick?.name || ''}>{pick && <KV items={pick.kv} />}</BottomSheet>
    </Card>
  )
}

export default function CostOverviewMobile({ overall, months, trendWindow, setTrendWindow, b2cCards, b2bCards, fixedVeh, fixedVehMonths, tplPartners, layout }) {
  return (
    <>
      <CostMaster overall={overall} months={months} trendWindow={trendWindow} setTrendWindow={setTrendWindow} layout={layout} />
      <Partners overall={overall} b2cCards={b2cCards} b2bCards={b2bCards} fixedVeh={fixedVeh} fixedVehMonths={fixedVehMonths} tplPartners={tplPartners} />
    </>
  )
}
