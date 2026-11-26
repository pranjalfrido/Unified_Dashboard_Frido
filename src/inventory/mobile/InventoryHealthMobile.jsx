import { useState } from 'react'
import { C } from '../../utils.js'
import { fmtNum, fmtInt, fmtDays } from '../theme.jsx'
import MasterTrendCard from '../../responsive/MasterTrendCard.jsx'
import { useBreakpoint } from '../../responsive/useBreakpoint.js'
import MixBar, { MixLegend } from '../../responsive/MixBar.jsx'
import StatusDot from '../../responsive/StatusDot.jsx'
import BottomSheet from '../../responsive/BottomSheet.jsx'
import { Card, KV } from '../../responsive/CardKit.jsx'
import { statusColor, allocColor } from './invStatus.js'
import { warehouseRows } from './invMobileData.js'
import { shortDay } from './invCaption.js'
import StockExplorer from './StockExplorer.jsx'
import AgeingCard from './AgeingCard.jsx'
import OosLossMobile from './OosLossMobile.jsx'
import Skeleton from '../../responsive/Skeleton.jsx'
import { useOosData, stockedSkus, oosSummary } from '../oosData.js'
import InventoryCostTable from '../InventoryCostTable.jsx'

// Inventory Health below 1024px (docs/responsive/INVENTORY_MOBILE_REDESIGN_PROMPT.md §2). Display
// only: every value comes from InventoryHealthPage's own memos (Regular facilities - mobile is
// locked to Regular) and is laid out here.
const M = C.m
const SPLIT = [{ key: 'rtd', label: 'RTD', color: M.green }, { key: 'raw', label: 'RAW', color: M.g3 }, { key: 'blk', label: 'Blocked', color: M.g4 }]

function SummaryCard({ summary, regular, lastSalesDate, layout }) {
  const doi = summary.doi
  const metrics = [
    { key: 'total', label: 'Total inventory', value: <>{fmtNum(regular.totalInvt)} <span style={{ fontSize: 15, color: M.muted, fontWeight: 600 }}>units</span></>,
      sub: `${fmtDays(doi)} days of inventory${lastSalesDate ? ` · latest sales ${shortDay(lastSalesDate)}` : ''}`,
      def: 'Units in Regular facilities: RTD + RAW + Blocked RAW.' },
    { key: 'rtd', label: 'RTD', value: fmtNum(regular.rtdInvt), def: 'Ready to dispatch: packed units that can ship now.' },
    { key: 'raw', label: 'RAW', value: fmtNum(regular.rawInvt), def: 'Units not yet ready to dispatch.' },
    { key: 'blk', label: 'Blocked RAW', value: fmtNum(regular.rawBlockedInvt), def: 'RAW units blocked (on hold) in the warehouse.' },
    { key: 'b2c', label: 'Avg sale (B2C)', value: `${fmtNum(summary.avgSaleB2C)}/day`, def: 'Average B2C units sold per day over the avg sale window.' },
    { key: 'tot', label: 'Total avg sale', value: `${fmtNum(summary.totalAvgSale)}/day`, def: 'Average units sold per day across all sales types (B2C + B2B + PO).' },
    { key: 'doi', label: 'Days of inventory', value: `${fmtDays(doi)} days`, status: doi <= 15 ? 'bad' : undefined, def: 'Total units ÷ average units sold per day (or order allocation, if higher).' },
  ]
  const parts = [{ ...SPLIT[0], value: regular.rtdInvt }, { ...SPLIT[1], value: regular.rawInvt }, { ...SPLIT[2], value: regular.rawBlockedInvt }]
  return (
    <MasterTrendCard metrics={metrics} layout={layout}
      summary={<MixBar parts={parts} height={8} legend fmt={v => ` ${fmtNum(v)}`} label="RTD, RAW and Blocked split" style={{ margin: '2px 0 4px' }} />} />
  )
}

// Entry to the Out-of-stock loss view (mockups/oos_mockup.html): one row under the summary card with
// the headline loss and SKU count (the same totals as that view), › opens it full screen.
function OosEntryRow({ data, error, onOpen }) {
  const s = data ? oosSummary(stockedSkus(data)) : null
  return (
    <button type="button" onClick={onOpen} disabled={!data}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 52, padding: '10px 14px', borderRadius: 14, border: `1px solid ${M.line}`, background: M.card, boxShadow: M.cardShadow, textAlign: 'left', fontFamily: 'var(--font)', color: M.ink, cursor: data ? 'pointer' : 'default' }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: 'block', fontSize: 13.5 }}>Out-of-stock loss</b>
        <span style={{ display: 'block', fontSize: 12, color: M.muted, marginTop: 1 }}>
          {s ? <><b style={{ color: M.down }}>₹{fmtNum(s.loss)}</b> lost so far · {fmtInt(s.skus) || 0} SKUs out</> : error ? 'Could not load' : <Skeleton width={150} height={12} />}
        </span>
      </span>
      <span aria-hidden="true" style={{ fontWeight: 700, color: M.green, fontSize: 18 }}>›</span>
    </button>
  )
}

function WarehouseCard({ locations, onSeeStock }) {
  const [sel, setSel] = useState(null)
  const rows = warehouseRows(locations)
  return (
    <Card title="Warehouse health" right={<span style={{ fontSize: 12, color: M.muted }}>DOI · allocation</span>}>
      <MixLegend parts={[{ key: 'rtd', label: 'RTD (ready to dispatch)', color: M.green }, { key: 'raw', label: 'RAW', color: M.g3 }]} style={{ marginBottom: 6 }} />
      {rows.map(l => {
        const rtdPct = l.totalInvt > 0 ? (l.rtdInvt / l.totalInvt) * 100 : 0
        return (
          <button key={l.location} type="button" className="inv-wh-row" onClick={() => setSel(l)}
            style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) auto auto', alignItems: 'center', columnGap: 10, width: '100%', minHeight: 52, padding: '8px 0', border: 'none', borderTop: `1px solid ${M.line}`, background: 'transparent', textAlign: 'left', fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{l.location}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <b style={{ fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(l.totalInvt)}</b>
                <StatusDot color={statusColor(l.stockStatus)} label={l.stockStatus} fontSize={12} muted />
              </span>
              <span aria-hidden="true" style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 5, background: M.line }}>
                <i style={{ width: `${rtdPct}%`, background: M.green }} /><i style={{ flex: 1, background: M.g3 }} />
              </span>
            </span>
            <span style={{ textAlign: 'right', fontSize: 13.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 40 }}>{fmtDays(l.doi)}d</span>
            <span style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 600, color: allocColor(l.allocationPct), fontVariantNumeric: 'tabular-nums', minWidth: 40 }}>{l.allocationPct == null ? '—' : `${l.allocationPct.toFixed(0)}%`}</span>
          </button>
        )
      })}
      <BottomSheet open={!!sel} onClose={() => setSel(null)} title={sel ? `${sel.location} warehouse` : ''}
        subtitle={sel ? <StatusDot color={statusColor(sel.stockStatus)} label={sel.stockStatus} fontSize={12} muted /> : null}>
        {sel && (
          <>
            <KV items={[
              { label: 'Total', value: fmtInt(sel.totalInvt) }, { label: 'DOI', value: `${fmtDays(sel.doi)} days` },
              { label: 'RTD', value: fmtInt(sel.rtdInvt) }, { label: 'RAW', value: fmtInt(sel.rawInvt) },
              { label: 'Blocked RAW', value: fmtInt(sel.rawBlockedInvt) }, { label: 'Avg sale', value: `${fmtNum(sel.avgSale)}/day` },
              { label: 'Allocation', value: sel.allocationPct == null ? '—' : `${sel.allocationPct.toFixed(0)}%`, color: allocColor(sel.allocationPct) },
            ]} />
            <div style={{ fontSize: 12, color: M.muted, marginTop: 10 }}>Allocation = units allocated to orders at this location ÷ its total avg sale per day.</div>
            {onSeeStock && (
              <button type="button" onClick={() => { const loc = sel.location; setSel(null); onSeeStock(loc) }}
                style={{ width: '100%', marginTop: 12, minHeight: 46, borderRadius: 12, border: 'none', background: M.green, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>
                See {sel.location} stock
              </button>
            )}
          </>
        )}
      </BottomSheet>
    </Card>
  )
}

export default function InventoryHealthMobile({ data, regular, locations, lastSalesDate, showDetailOnly, skus, pivot, regularLocations, filterKey, slow, dead, rtdLevel, setRtdLevel, rtdOptions, allowedTabs, detailSkus, slowSkus, deadSkus }) {
  const bp = useBreakpoint()
  const layout = bp.isPhoneLandscape ? 'landscape' : bp.width >= 768 ? 'tablet' : 'phone'
  const [loc, setLoc] = useState('All')
  // Warehouse sheet → "See PNQ stock": the explorer switches to that location and scrolls into view.
  const seeStock = l => { setLoc(l); requestAnimationFrame(() => document.getElementById('inv-stock-explorer')?.scrollIntoView({ block: 'start', behavior: 'smooth' })) }
  // Out-of-stock loss: loaded with the page (one shared request, see oosData.js), opened full screen.
  const oos = useOosData(!showDetailOnly)
  const [oosOpen, setOosOpen] = useState(false)
  return (
    <div className="inv-mobile ov-mobile" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, flex: 1, background: M.bg, padding: '12px max(12px, var(--safe-right)) 24px max(12px, var(--safe-left))' }}>
      {!showDetailOnly && <SummaryCard summary={data.summary} regular={regular} lastSalesDate={lastSalesDate} layout={layout} />}
      {!showDetailOnly && <OosEntryRow data={oos.data} error={oos.error} onOpen={() => setOosOpen(true)} />}
      {!showDetailOnly && <WarehouseCard locations={locations} onSeeStock={seeStock} />}
      <StockExplorer skus={skus} pivot={pivot} regularLocations={regularLocations} loc={loc} setLoc={setLoc} resetKey={filterKey} rtdLevel={rtdLevel} setRtdLevel={setRtdLevel} rtdOptions={rtdOptions} />
      {!showDetailOnly && <AgeingCard slow={slow} dead={dead} />}
      {(allowedTabs == null || allowedTabs?.includes('inventory:cost')) && <InventoryCostTable skus={detailSkus || []} isAdmin={allowedTabs == null} slowSkus={slowSkus} deadSkus={deadSkus} />}
      <OosLossMobile open={oosOpen} onClose={() => setOosOpen(false)} data={oos.data} error={oos.error} />
    </div>
  )
}
