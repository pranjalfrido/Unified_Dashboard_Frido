import { C, fmt, fmtN } from '../utils.js'
import DeltaBadge from '../responsive/DeltaBadge.jsx'
import InfoPopover from '../responsive/InfoPopover.jsx'
import { pctChange } from '../responsive/format.js'
import { metricStatus } from '../config/metricTargets.js'
import { METRICS } from './metricLabels.js'

// "State of the Business" on mobile (< 1024px) - matches the bottom half of
// docs/responsive/mockups/logistics_ops_mobile_mockup.html. Display only: every value is one the desktop
// tiles already show (customerMetrics() / invSummary), regrouped.
//   Customers · D2C   New vs Repeat revenue as one split bar (values + share), then one even row of 3
//                     tiles: Customers (+ "x new"), Repeat rate, LTV - ▲/▼ top-right on these narrow tiles
//   Inventory alerts  Stockout risk and Dead stock as rows that open Inventory Health pre-filtered /
//                     scrolled; the other three inventory figures in one compact row
const EDGE = s => ({ good: C.green.tx, warn: C.amber.tx, bad: C.red.tx }[s])

function Card({ title, info, right, children }) {
  return (
    <div style={{ background: C.card, borderRadius: 18, padding: 16, boxShadow: C.sh1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: C.type.cardTitle.size, fontWeight: C.type.cardTitle.weight, color: C.t1 }}>{title}</span>
          {info && <InfoPopover title={title} text={info} />}
        </span>
        {right}
      </div>
      {children}
    </div>
  )
}

// Narrow tile (three across on a phone, ~100px): too narrow for a label and a ▲/▼ on one line, so -
// as in the mockup - the ▲/▼ sits on its own line under the value. Fixed rows (label, value, ▲/▼,
// note) keep the three tiles aligned whether or not a tile has a note.
function SmallTile({ k, value, note, delta, loading, hidden }) {
  const meta = METRICS[k]
  return (
    <InfoPopover asChild title={meta.label} text={meta.def}
      style={{ background: C.hov, borderRadius: 12, padding: '10px 10px', minWidth: 0, display: 'grid', gridTemplateRows: '18px auto 18px auto', rowGap: 2 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.t3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.label}</span>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.t1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ minHeight: 18 }}><DeltaBadge delta={delta} loading={loading} hidden={hidden} size={12} /></div>
      <div style={{ fontSize: 12, lineHeight: '16px', color: C.t3, minHeight: 16 }}>{note || ''}</div>
    </InfoPopover>
  )
}

function AlertRow({ label, value, note, status, onClick, hint }) {
  return (
    <button type="button" onClick={onClick} aria-label={`${label}: ${value}. ${hint}`}
      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 64, padding: '10px 12px', borderRadius: 12, border: 'none',
        borderLeft: `3px solid ${EDGE(status) || 'transparent'}`, background: C.hov, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', color: C.t1 }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t3 }}>{label}</span>
        <span style={{ display: 'block', fontSize: 19, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        <span style={{ display: 'block', fontSize: 12, color: C.t3 }}>{note}</span>
      </span>
      <span aria-hidden="true" style={{ fontSize: 22, color: C.border2 }}>›</span>
    </button>
  )
}

export default function BusinessStateMobile({ cust, custPrevKpis, ltvPrev, ltvPrevStatus, inv, invUpdated, onOpenInventory, twoCol = false }) {
  const { custNewRev, custRepeatRev, custLtv, custTotalCustomers, custNewCustomers, custKpis, loaded } = cust
  const splitTotal = custNewRev + custRepeatRev
  const newShare = splitTotal > 0 ? custNewRev / splitTotal * 100 : 0
  // All or none per card: Customers + Repeat rate come with the page's own /api/customer response
  // (prevKpis); LTV needs the extra previous-period load. If that fails, the card shows no ▲/▼.
  const loading = !loaded || ltvPrevStatus === 'loading'
  const hidden = ltvPrevStatus === 'error' || ltvPrevStatus === 'off' || (loaded && !custPrevKpis)
  const repeatRate = custKpis.repeatRate

  const customers = (
    <Card title="Customers · D2C" info="D2C (Shopify) customers only, for the selected date range.">
      <div style={{ marginTop: 12, fontSize: 12, color: C.t3, fontWeight: 600 }}>Revenue split</div>
      <div aria-hidden="true" style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 6, background: C.border }}>
        <div style={{ width: `${newShare}%`, background: C.acc }} />
        <div style={{ width: `${splitTotal > 0 ? 100 - newShare : 0}%`, background: C.acs }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
        <div>
          <div style={{ fontSize: 12, color: C.t3, fontWeight: 600 }}><span style={{ color: C.acc }}>●</span> New customers</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.t1, fontVariantNumeric: 'tabular-nums' }}>{loaded ? fmt(custNewRev) : '—'} <span style={{ fontSize: 12, color: C.t3, fontWeight: 600 }}>{loaded ? `${newShare.toFixed(0)}%` : ''}</span></div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: C.t3, fontWeight: 600 }}><span style={{ color: C.acs }}>●</span> Repeat customers</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.t1, fontVariantNumeric: 'tabular-nums' }}>{loaded ? fmt(custRepeatRev) : '—'} <span style={{ fontSize: 12, color: C.t3, fontWeight: 600 }}>{loaded && splitTotal > 0 ? `${(100 - newShare).toFixed(0)}%` : ''}</span></div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginTop: 14 }}>
        <SmallTile k="customers" value={loaded ? fmtN(custTotalCustomers) : '—'} note={loaded ? `${fmtN(custNewCustomers)} new` : ''}
          delta={pctChange(custTotalCustomers, custPrevKpis?.totalCustomers)} loading={loading} hidden={hidden} />
        <SmallTile k="repeatRate" value={loaded && repeatRate != null ? `${(repeatRate * 100).toFixed(1)}%` : '—'}
          delta={pctChange(repeatRate, custPrevKpis?.repeatRate)} loading={loading} hidden={hidden} />
        <SmallTile k="ltv" value={loaded ? fmt(custLtv) : '—'}
          delta={pctChange(custLtv, ltvPrev)} loading={loading} hidden={hidden} />
      </div>
    </Card>
  )

  const doiBand = inv.doi == null ? '—' : inv.doi <= 2 ? 'Critical' : inv.doi <= 15 ? 'Low' : inv.doi <= 45 ? 'Sufficient' : 'Excess'
  const inventory = (
    <Card title="Inventory alerts" right={invUpdated ? <span style={{ fontSize: 12, color: C.t3 }}>Updated {invUpdated}</span> : null}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        <AlertRow label="Stockout risk" value={inv.loaded ? `${fmtN(inv.criticalLowCount)} SKUs` : '—'} note="Critical + low stock"
          status={metricStatus('stockoutRiskSkus', inv.criticalLowCount)} hint="Opens Inventory Health filtered to Critical and Low stock."
          onClick={() => onOpenInventory?.({ stockStatus: ['Critical', 'Low'] })} />
        <AlertRow label="Dead stock" value={inv.loaded ? `${fmtN(inv.deadStockUnits)} units` : '—'} note={inv.loaded ? `${fmtN(inv.deadStockCount)} SKUs · no sale in 90 days` : ''}
          status={metricStatus('deadStockUnits', inv.deadStockUnits)} hint="Opens Inventory Health at the dead-stock list."
          onClick={() => onOpenInventory?.({ scrollTo: 'inv-dead-stock' })} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginTop: 10 }}>
        {[['Total inventory', inv.loaded ? `${fmtN(inv.totalInvt)}` : '—', inv.loaded ? `units · ${fmtN(inv.skuCount)} SKUs` : ''],
          ['Days of inventory', inv.loaded && inv.doi != null ? `${inv.doi}d` : '—', doiBand],
          ['DOI · top 20', inv.top20Doi != null ? `${inv.top20Doi}d` : '—', inv.top20Matched != null ? `${inv.top20Matched} of 20 matched` : '']].map(([k, v, n]) => (
          // Label and note may wrap to two lines (fixed 2-line rows keep the three tiles aligned).
          <div key={k} style={{ background: C.hov, borderRadius: 12, padding: '10px 10px', minWidth: 0, display: 'grid', gridTemplateRows: '32px auto 32px', rowGap: 2 }}>
            <span style={{ fontSize: 12, lineHeight: '16px', fontWeight: 600, color: C.t3, overflow: 'hidden' }}>{k}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.t1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
            <span style={{ fontSize: 12, lineHeight: '16px', color: C.t3, overflow: 'hidden' }}>{n}</span>
          </div>
        ))}
      </div>
    </Card>
  )

  return twoCol
    ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12, alignItems: 'start' }}>{customers}{inventory}</div>
    : <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 12 }}>{customers}{inventory}</div>
}
