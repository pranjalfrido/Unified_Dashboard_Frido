import { useState } from 'react'
import { C, fmtN } from '../utils.js'
import DeltaBadge from '../responsive/DeltaBadge.jsx'
import InfoPopover from '../responsive/InfoPopover.jsx'
import { pctChange } from '../responsive/format.js'
import { metricStatus } from '../config/metricTargets.js'
import { METRICS, SPEED_INFO } from './metricLabels.js'

// Logistics & Ops on mobile (< 1024px) - matches docs/responsive/mockups/logistics_ops_mobile_mockup.html.
// Display only: `m` is logisticsMetrics(logisticsData) - the same values the desktop card shows -
// regrouped. `prev` is logisticsMetrics() of the equal-length window before the one shown (null while
// loading / when unavailable); `prevStatus` is usePrevPeriod's status.
//   card 1  date badge + Total shipments hero + Delivered % ring
//   card 2  Delivery health / Courier quality tiles (2 columns, value + ▲/▼ on one line, tap = definition)
//   card 3  Speed & SLA with Forward / RTO / Reverse tabs: end-to-end days, stage averages as
//           separate bars (they are averaged over different shipment sets, so they don't add up),
//           SLA met as progress bars with "x of y"
// All 8 TAT averages and all 8 SLA thresholds of the desktop card are here, only regrouped.
const pct = v => (v == null || !isFinite(v) ? '—' : `${v.toFixed(1)}%`)
const days = v => (v == null || !isFinite(v) ? '—' : `${v.toFixed(1)}d`)

function Card({ children, style }) {
  return <div style={{ background: C.card, borderRadius: 18, padding: 16, boxShadow: C.sh1, ...style }}>{children}</div>
}
function GroupLabel({ children, style }) {
  return <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: C.t3, margin: '2px 0 10px', ...style }}>{children}</div>
}

function Tile({ k, value, cur, prevValue, loading, hidden }) {
  const meta = METRICS[k]
  const status = metricStatus(k, cur)
  const edge = { good: C.green.tx, warn: C.amber.tx, bad: C.red.tx }[status]
  return (
    <InfoPopover asChild title={meta.label} text={meta.def}
      style={{ background: C.hov, borderRadius: 12, padding: '10px 12px', borderLeft: `3px solid ${edge || 'transparent'}`, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.t3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginTop: 2, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 19, fontWeight: 700, color: C.t1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        <DeltaBadge delta={pctChange(cur, prevValue)} lowerIsBetter={!!meta.lowerIsBetter} loading={loading} hidden={hidden} size={12} />
      </div>
    </InfoPopover>
  )
}

function Ring({ value }) {
  const r = 15.5, circ = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value || 0))
  return (
    <div style={{ width: 68, height: 68, position: 'relative', flexShrink: 0 }} role="img" aria-label={`Delivered ${pct(value)}`}>
      <svg viewBox="0 0 36 36" width="68" height="68" aria-hidden="true">
        <circle cx="18" cy="18" r={r} fill="none" stroke={C.border} strokeWidth="4" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={C.green.tx} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={`${(v / 100) * circ} ${circ}`} transform="rotate(-90 18 18)" />
      </svg>
      <b style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, color: C.t1, fontVariantNumeric: 'tabular-nums' }}>{pct(value)}</b>
    </div>
  )
}

function StageBar({ label, value, max }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '118px 1fr 44px', alignItems: 'center', gap: 8, margin: '8px 0', fontSize: 13 }}>
      <span style={{ color: C.t3, fontWeight: 600, fontSize: 12.5 }}>{label}</span>
      <span aria-hidden="true" style={{ height: 8, background: C.border, borderRadius: 4, overflow: 'hidden' }}>
        <i style={{ display: 'block', height: '100%', width: `${value != null && max ? (value / max) * 100 : 0}%`, background: C.acs, borderRadius: 4 }} />
      </span>
      <span style={{ textAlign: 'right', fontWeight: 700, color: C.t1, fontVariantNumeric: 'tabular-nums' }}>{days(value)}</span>
    </div>
  )
}

function SlaBar({ label, value, num, den }) {
  return (
    <div style={{ margin: '10px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, color: C.t1 }}>
        <span>{label}</span><b style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{pct(value)}</b>
      </div>
      <div aria-hidden="true" style={{ height: 8, background: C.border, borderRadius: 4, overflow: 'hidden', marginTop: 5 }}>
        <i style={{ display: 'block', height: '100%', width: `${value != null ? Math.min(100, value) : 0}%`, background: C.acc, borderRadius: 4 }} />
      </div>
      <div style={{ fontSize: 12, color: C.t3, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{den > 0 ? `${fmtN(num)} of ${fmtN(den)}` : '—'}</div>
    </div>
  )
}

export default function LogisticsOpsMobile({ m, prev, prevStatus, badgeText, info, showTitle = true, twoCol = false }) {
  const [flow, setFlow] = useState('fwd')
  const loading = prevStatus === 'loading'
  // All or none per card: no previous-period data (error / flag off) → no ▲/▼ on the whole card.
  const hidden = prevStatus === 'error' || prevStatus === 'off'
  const P = prev || {}

  const flows = {
    fwd: { tab: 'Forward', e2eLabel: 'Order → delivered', e2e: m.lAvgFul,
      stages: [['Order → pickup', m.lAvgPickup], ['Order → dispatch', m.lAvgProcessing], ['Pickup → delivered', m.lAvgIntransit]],
      sla: [['Processed ≤ 24h', m.lProcessedWithin24hPct, m.lProcessedWithin24h, m.lOrdersWithOrderDate],
        ['Picked up ≤ 24h', m.lPickedUpWithin24hPct, m.lPickedUpWithin24h, m.lOrdersPickedUp],
        ['Delivered ≤ 3d of pickup', m.lDeliveredWithin3dPickupPct, m.lDeliveredWithin3dPickup, m.lOrdersDeliveredTotal],
        ['Delivered ≤ 5d of order', m.lDeliveredWithin5dOrderPct, m.lDeliveredWithin5dOrder, m.lOrdersDeliveredTotal]] },
    rto: { tab: 'RTO', e2eLabel: 'RTO mark → delivered back', e2e: m.lAvgRtoTat, stages: [],
      sla: [['RTO ≤ 5d of mark', m.lRtoDeliveredWithin5dMarkPct, m.lRtoDeliveredWithin5dMark, m.lRtoCompleted],
        ['RTO ≤ 10d of mark', m.lRtoDeliveredWithin10dMarkPct, m.lRtoDeliveredWithin10dMark, m.lRtoCompleted]] },
    rvp: { tab: 'Reverse', e2eLabel: 'Return created → delivered', e2e: m.lAvgRvpTat,
      stages: [['Created → pickup', m.lAvgRvpCreatedToPickup], ['Pickup → delivered', m.lAvgRvpPickupToDelivery]],
      sla: [['Picked up ≤ 2d of created', m.lRvpDoneWithin2dPct, m.lRvpDoneWithin2d, m.lRvpCreated],
        ['Delivered ≤ 5d of pickup', m.lRvpDeliveredWithin5dPct, m.lRvpDeliveredWithin5d, m.lRvpDone]] },
  }
  const f = flows[flow]
  const stageMax = Math.max(...f.stages.map(s => s[1] || 0), 0)

  const tiles = (keys) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
      {keys.map(([k, cur, prevV]) => <Tile key={k} k={k} value={pct(cur)} cur={cur} prevValue={prevV} loading={loading} hidden={hidden} />)}
    </div>
  )

  const heroCard = (
    <Card>
      {showTitle && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: C.type.cardTitle.size, fontWeight: C.type.cardTitle.weight, color: C.t1 }}>Logistics &amp; Ops</span>
          <InfoPopover title="Logistics & Ops" text={info} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: showTitle ? 8 : 0 }}>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, background: C.amber.bg, color: C.amber.tx, borderRadius: 8, padding: '5px 8px' }}>
          <span aria-hidden="true">⏱</span>{badgeText}
        </span>
        {!showTitle && <InfoPopover title="Logistics & Ops" text={info} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em', color: C.t1, fontVariantNumeric: 'tabular-nums' }}>{fmtN(m.lTotal)}</span>
            <DeltaBadge delta={pctChange(m.lTotal, P.lTotal)} loading={loading} hidden={hidden} size={12} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3 }}>Total shipments</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Ring value={m.lDelPct} />
          <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>Delivered</div>
        </div>
      </div>
    </Card>
  )

  const tilesCard = (
    <Card>
      <GroupLabel>Delivery health</GroupLabel>
      {tiles([['rtoPct', m.lRtoPct, P.lRtoPct], ['zRtoPct', m.lZRtoPct, P.lZRtoPct], ['ndrPct', m.lNdrPct, P.lNdrPct], ['ndrResolvedPct', m.lNdrResolvedPct, P.lNdrResolvedPct]])}
      <GroupLabel style={{ marginTop: 16 }}>Courier quality</GroupLabel>
      {tiles([['fasr', m.lFasr, P.lFasr], ['rasr', m.lRasr, P.lRasr], ['slaBreachPct', m.lSlaPct, P.lSlaPct], ['delPct', m.lDelPct, P.lDelPct]])}
    </Card>
  )

  const speedCard = (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: C.type.cardTitle.size, fontWeight: C.type.cardTitle.weight, color: C.t1 }}>Speed &amp; SLA</span>
        <InfoPopover title="Speed & SLA" text={SPEED_INFO} />
      </div>
      <div role="tablist" aria-label="Shipment flow" style={{ display: 'flex', background: C.hov, borderRadius: 10, padding: 3, margin: '12px 0 14px' }}>
        {Object.entries(flows).map(([id, x]) => (
          <button key={id} type="button" role="tab" aria-selected={flow === id} onClick={() => setFlow(id)}
            style={{ flex: 1, minHeight: 36, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
              background: flow === id ? C.card : 'transparent', color: flow === id ? C.t1 : C.t3, boxShadow: flow === id ? C.sh1 : 'none' }}>{x.tab}</button>
        ))}
      </div>
      <div role="tabpanel" aria-label={`${f.tab} speed and SLA`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: C.t3, fontWeight: 600 }}>{f.e2eLabel}</span>
          <span style={{ fontSize: 26, fontWeight: 700, color: C.t1, fontVariantNumeric: 'tabular-nums' }}>{days(f.e2e)}</span>
        </div>
        {f.stages.length > 0 && <>
          <GroupLabel style={{ marginTop: 4, marginBottom: 2 }}>Stage averages</GroupLabel>
          {f.stages.map(([label, v]) => <StageBar key={label} label={label} value={v} max={stageMax} />)}
        </>}
        <GroupLabel style={{ marginTop: 14, marginBottom: 0 }}>SLA met</GroupLabel>
        {f.sla.map(([label, v, num, den]) => <SlaBar key={label} label={label} value={v} num={num} den={den} />)}
      </div>
    </Card>
  )

  return twoCol
    ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 12 }}>{heroCard}{speedCard}</div>{tilesCard}
      </div>
    : <div style={{ display: 'grid', gap: 12 }}>{heroCard}{tilesCard}{speedCard}</div>
}
