import { useCallback, useMemo, useState } from 'react'
import { C, fmt, fmtN } from '../../utils.js'
import MasterTrendCard from '../../responsive/MasterTrendCard.jsx'
import SegmentToggle from '../../responsive/SegmentToggle.jsx'
import BottomSheet from '../../responsive/BottomSheet.jsx'
import FullScreenList from '../../responsive/FullScreenList.jsx'
import Sparkline from '../../responsive/Sparkline.jsx'
import InfoStrip from '../../responsive/InfoStrip.jsx'
import { Card, ShowAllButton, KV } from '../../responsive/CardKit.jsx'
import { PartnerRow, SplitTop } from './CostOverviewMobile.jsx'

// Logistics → Cost → FTL/PTL below 1024px (LOGISTICS_MOBILE_REDESIGN_PROMPT.md §5). Display only:
// b2bHead, b2bTransRows, b2bVehicleRows, b2bLaneVehRows, b2bSpreadRows, b2bTypeRows and the trend
// rows are LogisticsCostPage memos; formats and the Top-transporter > 60% red rule as desktop.
const M = C.m
const rsTrip = v => '₹' + Math.round(v).toLocaleString('en-IN')
const FTL_WINDOWS = [{ id: 1, label: '1M' }, { id: 3, label: '3M' }, { id: 6, label: '6M' }, { id: 999, label: 'All' }]

function FtlMaster({ b2b, b2bHead, b2bVariance, fixedVeh, vehicleRows, transRows, b2bSole, trendWindow, trendMonths, setTrendMonths, layout, onShowTable }) {
  const groupTrend = useCallback(rows => (rows || []).map(r => ({ ...r, date: `${r.raw}-01` })), [])
  const head = b2bHead
  const spend = head ? head.spend : b2b.totals.cost
  const dearest = vehicleRows.length ? vehicleRows.reduce((a, v) => (v.avgCost > a.avgCost ? v : a)) : null
  const top = transRows[0]
  const metrics = [
    { key: 'cost', label: 'Total freight cost', tileLabel: 'Freight cost', value: fmt(spend), delta: head?.momPct ?? null, compare: head?.momPct != null ? [{ label: 'MoM', delta: head.momPct }] : null, lowerIsBetter: true,
      sub: `${b2bVariance?.freightPctValue != null ? `${b2bVariance.freightPctValue.toFixed(2)}% of shipment value · ` : ''}${fmtN(head ? head.trips : b2b.totals.trips)} trips · ${fmtN(head ? head.lanes : b2b.totals.lanes)} lanes`,
      def: 'FTL/PTL freight for the selected billing months. MoM: the last selected month vs the month before.', point: r => r.billed, fmtPoint: fmt },
    { key: 'trip', label: 'Avg cost / trip', tileLabel: 'Avg cost/trip', value: rsTrip(head ? head.avgTrip : b2b.totals.avg_cost), sub: head ? `across ${fmtN(head.lanes)} lanes` : '', deltasHidden: true, point: r => r.perTrip, fmtPoint: rsTrip },
    { key: 'rental', label: 'Rental fixed vehicle', tileLabel: 'Rental vehicles', value: fixedVeh && fixedVeh.months > 0 ? fmt(fixedVeh.cost / fixedVeh.months) : '—', deltasHidden: true,
      sub: fixedVeh && fixedVeh.vehicles > 0 ? `${fmtN(fixedVeh.distinct_vehicles)} vehicles · ${fmt(fixedVeh.cost)} total${fixedVeh.carried?.length ? ` · ${fixedVeh.carried.length} mo carried` : ''}` : b2b?.fixedVehMonths?.length > 0 ? 'not uploaded for this period' : 'no fixed rentals uploaded',
      def: 'Monthly charge for vehicles on a fixed rental, not added to the freight total.' },
    { key: 'dear', label: 'Dearest vehicle', value: dearest ? rsTrip(dearest.avgCost) : '—', sub: dearest ? `${dearest.vehicle} per trip` : '', deltasHidden: true },
    { key: 'top', label: 'Top transporter share', tileLabel: 'Top transporter', value: top ? top.share.toFixed(1) + '%' : '—', valueColor: top && top.share > 60 ? M.down : undefined, sub: top ? `${top.key} · ${fmt(top.cost)}` : '', deltasHidden: true,
      def: 'Share of freight spend with the largest transporter. Red above 60%.' },
    { key: 'top3', label: 'Top 3 lane share', tileLabel: 'Top 3 lanes', value: head ? head.top3Pct.toFixed(1) + '%' : '—', sub: 'of total freight spend', deltasHidden: true },
    { key: 'sole', label: 'Single-sourced spend', tileLabel: 'Single-sourced', value: b2bSole ? b2bSole.pct.toFixed(1) + '%' : '—', sub: b2bSole ? `${fmtN(b2bSole.lanes)} of ${fmtN(b2bSole.totalLanes)} lanes, one carrier` : '', deltasHidden: true },
    { key: 'trans', label: 'Transporters', value: fmtN(transRows.length), sub: transRows.length > 1 ? `${fmt(transRows[transRows.length - 1].cost)} on the smallest` : 'single carrier', deltasHidden: true },
  ]
  return (
    <div>
      <MasterTrendCard small metrics={metrics} rawRows={trendWindow} groupTrend={groupTrend} layout={layout} granularity="monthly"
        windowMenu={{ title: 'Show months', options: FTL_WINDOWS, value: trendMonths, onChange: setTrendMonths }} />
      <ShowAllButton onClick={onShowTable}>Show monthly table →</ShowAllButton>
    </div>
  )
}

function Transporters({ transRows, transTrendRows }) {
  const [pick, setPick] = useState(null)
  const [all, setAll] = useState(false)
  const shown = all ? transRows : transRows.slice(0, 6)
  const series = useMemo(() => (pick ? (transTrendRows || []).map(r => ({ month: r.month, v: Number(r[pick.key]) || 0 })) : []), [pick, transTrendRows])
  return (
    <Card title="Transporters" sub="Tap a transporter for its monthly spend">
      {shown.map(r => <PartnerRow key={r.key} name={r.key} sub={`${fmtN(r.trips)} trips · ${rsTrip(r.avgCost)}/trip`} value={fmt(r.cost)} valueSub={`${r.share.toFixed(1)}%`} bar={r.share} onClick={() => setPick(r)} />)}
      {transRows.length > 6 && <ShowAllButton onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${transRows.length}`}</ShowAllButton>}
      <BottomSheet open={!!pick} onClose={() => setPick(null)} title={pick?.key || ''} subtitle="Freight spend by month (every month on record)">
        {pick && (
          <>
            <KV items={[{ label: 'Trips', value: fmtN(pick.trips) }, { label: 'Total spend', value: fmt(pick.cost) }, { label: 'Avg cost / trip', value: rsTrip(pick.avgCost) }, { label: 'Share', value: `${pick.share.toFixed(1)}%` }]} />
            <div style={{ padding: '14px 0 6px' }}><Sparkline values={series.map(s => s.v)} width={300} height={60} color={M.green} label={`${pick.key} monthly spend`} /></div>
            <KV items={series.map(s => ({ label: s.month, value: s.v ? fmt(s.v) : '—' }))} />
          </>
        )}
      </BottomSheet>
    </Card>
  )
}

function Vehicles({ vehicleRows }) {
  const [metric, setMetric] = useState('spend')
  const [all, setAll] = useState(false)
  const [pick, setPick] = useState(null)
  const rows = useMemo(() => [...vehicleRows].sort((a, b) => (metric === 'spend' ? b.cost - a.cost : b.avgCost - a.avgCost)), [vehicleRows, metric])
  const max = Math.max(...rows.map(r => (metric === 'spend' ? r.cost : r.avgCost)), 0) || 1
  const shown = all ? rows : rows.slice(0, 6)
  return (
    <Card title="Vehicle types">
      <SegmentToggle full label="Measure" options={[{ id: 'spend', label: 'Total spend' }, { id: 'trip', label: 'Cost per trip' }]} value={metric} onChange={setMetric} />
      <div style={{ marginTop: 6 }}>
        {shown.map(r => <PartnerRow key={r.vehicle} name={r.vehicle} sub={`${fmtN(r.trips)} trips · ${fmtN(r.lanes)} lanes · ${fmtN(r.transporters)} transporters`}
          value={metric === 'spend' ? fmt(r.cost) : rsTrip(r.avgCost)} valueSub={metric === 'spend' ? `${r.share.toFixed(1)}%` : 'per trip'} bar={((metric === 'spend' ? r.cost : r.avgCost) / max) * 100} onClick={() => setPick(r)} />)}
      </div>
      {rows.length > 6 && <ShowAllButton onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</ShowAllButton>}
      <BottomSheet open={!!pick} onClose={() => setPick(null)} title={pick?.vehicle || ''} subtitle="Vehicle type">
        {pick && <KV items={[{ label: 'Trips', value: fmtN(pick.trips) }, { label: 'Total spend', value: fmt(pick.cost) }, { label: 'Avg cost / trip', value: rsTrip(pick.avgCost) }, { label: 'Lanes', value: fmtN(pick.lanes) }, { label: 'Transporters', value: fmtN(pick.transporters) }, { label: 'Share', value: `${pick.share.toFixed(1)}%` }]} />}
      </BottomSheet>
    </Card>
  )
}

function Lanes({ laneRows }) {
  const [full, setFull] = useState(false)
  const [pick, setPick] = useState(null)
  const sub = r => `${r.vehicle} · ${fmtN(r.trips)} trips · ${rsTrip(r.avgCost)}/trip`
  return (
    <Card title="Lanes" sub="One row per lane and vehicle size">
      {laneRows.slice(0, 6).map((r, i) => <PartnerRow key={`${r.lane}-${r.vehicle}-${i}`} name={r.lane} sub={sub(r)} value={fmt(r.cost)} valueSub="total" bar={null} onClick={() => setPick(r)} />)}
      {laneRows.length > 6 && <ShowAllButton onClick={() => setFull(true)}>Show all {laneRows.length} →</ShowAllButton>}
      <FullScreenList open={full} onClose={() => setFull(false)} title="Lanes" noun="lanes" items={laneRows}
        sorts={[{ key: 'cost', label: 'Total', value: r => r.cost, format: r => fmt(r.cost) }, { key: 'trip', label: '₹ / trip', value: r => r.avgCost, format: r => rsTrip(r.avgCost) }, { key: 'trips', label: 'Trips', value: r => r.trips, format: r => fmtN(r.trips) }]}
        name={r => r.lane} sub={sub} searchText={r => `${r.lane} ${r.vehicle}`} onSelect={r => setPick(r)} />
      <BottomSheet open={!!pick} onClose={() => setPick(null)} title={pick?.lane || ''} subtitle={pick?.vehicle}>
        {pick && <KV items={[{ label: 'Trips', value: fmtN(pick.trips) }, { label: 'Total', value: fmt(pick.cost) }, { label: 'Avg cost / trip', value: rsTrip(pick.avgCost) }, { label: 'Min', value: fmt(pick.minCost) }, { label: 'Max', value: fmt(pick.maxCost) }, { label: 'Carriers', value: fmtN(pick.transporters) }]} />}
      </BottomSheet>
    </Card>
  )
}

function RateConsistency({ spreadRows }) {
  if (!spreadRows.length) return null
  return (
    <Card title="Rate consistency" sub="Same lane and vehicle, cheapest vs dearest trip · min 8 trips">
      {spreadRows.map(r => <PartnerRow key={r.key} name={r.lane} sub={`${r.vehicle} · ${fmtN(r.trips)} trips · ${fmt(r.lo)} – ${fmt(r.hi)}`} value={<span style={{ color: M.down }}>{r.spreadPct.toFixed(0)}%</span>} valueSub={`${fmt(r.spread)} spread`} bar={null} />)}
    </Card>
  )
}

function FreightMix({ typeRows }) {
  if (!typeRows.length) return null
  const tot = typeRows.reduce((s, r) => s + r.cost, 0)
  return (
    <Card title="Freight type mix" sub="FTL = full truck, PTL = part load">
      <SplitTop parts={typeRows.map((r, i) => ({ key: r.key, label: r.key, value: r.cost, color: [M.green, M.g2, M.g3, M.g4][i] || M.g4 }))} />
      <div style={{ marginTop: 6 }}>
        {typeRows.map(r => <PartnerRow key={r.key} name={r.key} sub={`${fmtN(r.trips)} trips · ${rsTrip(r.avgCost)}/trip`} value={fmt(r.cost)} valueSub={tot ? `${((r.cost / tot) * 100).toFixed(1)}%` : '—'} bar={null} />)}
      </div>
    </Card>
  )
}

function Invoices({ rows, monthLabel }) {
  const [open, setOpen] = useState(false)
  if (!rows?.length) return null
  return (
    <Card title="Transporter invoices" sub="Most recent 500 bills">
      <ShowAllButton onClick={() => setOpen(true)}>Show {Math.min(rows.length, 500)} invoices →</ShowAllButton>
      <FullScreenList open={open} onClose={() => setOpen(false)} title="Transporter invoices" noun="invoices" items={rows.slice(0, 500)}
        sorts={[{ key: 'total', label: 'Total', value: r => Number(r.total_cost) || 0, format: r => fmt(r.total_cost) }]}
        name={r => `${r.origin_location} → ${r.destination_location}`} sub={r => `${r.transporter_name} · ${monthLabel(r.month_year)} · ${r.vehicle_type || '—'} · ${r.vehicle_number || '—'} · ${r.freight_type || '—'}`}
        searchText={r => `${r.transporter_name} ${r.origin_location} ${r.destination_location} ${r.vehicle_number || ''}`} />
    </Card>
  )
}

export default function CostFtlMobile(props) {
  const { b2b, trendWindow, monthLabel } = props
  const [table, setTable] = useState(false)
  if (!b2b) return null
  if (!b2b.totals.trips) return <Card title="No FTL/PTL freight invoices yet"><div style={{ fontSize: 13, color: M.muted }}>Add transporter bills from the Logistics Bill Ledger page and lane analysis will appear here.</div></Card>
  const tot = trendWindow.reduce((a, x) => a + (Number(x.billed) || 0), 0)
  return (
    <>
      {b2b.totals?.unpriced_rows > 0 && <InfoStrip text={`${fmtN(b2b.totals.unpriced_rows)} invoice lines (${fmt(b2b.totals.unpriced_cost)}) are uploaded but not yet priced, so they are missing from every figure on this tab.`} />}
      <FtlMaster {...props} onShowTable={() => setTable(true)} />
      <Transporters transRows={props.transRows} transTrendRows={props.transTrendRows} />
      <Vehicles vehicleRows={props.vehicleRows} />
      <Lanes laneRows={props.laneRows} />
      <RateConsistency spreadRows={props.spreadRows} />
      <FreightMix typeRows={props.typeRows} />
      <Invoices rows={props.invoiceRows} monthLabel={monthLabel} />
      <FullScreenList open={table} onClose={() => setTable(false)} title="Monthly FTL/PTL freight" noun="months" items={trendWindow}
        sorts={[{ key: 'cost', label: 'Freight cost', value: r => r.billed, format: r => fmt(r.billed) }]}
        name={r => r.month} sub={r => `${fmtN(r.trips)} trips · ${rsTrip(r.perTrip)}/trip · FTL share ${r.ftlShare.toFixed(1)}%`}
        secondary={r => (tot > 0 ? `${(((Number(r.billed) || 0) / tot) * 100).toFixed(1)}% of spend` : '—')} searchText={r => r.month} />
    </>
  )
}
