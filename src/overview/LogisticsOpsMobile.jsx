import { useState } from 'react'
import { C, fmtN } from '../utils.js'
import DeltaBadge from '../responsive/DeltaBadge.jsx'
import InfoPopover from '../responsive/InfoPopover.jsx'
import KpiTile from '../responsive/KpiTile.jsx'
import SegmentToggle from '../responsive/SegmentToggle.jsx'
import InfoStrip from '../responsive/InfoStrip.jsx'
import Skeleton from '../responsive/Skeleton.jsx'
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
// One mobile palette (C.m): shared KpiTile / SegmentToggle / InfoStrip, green shades for bars.
const M = C.m
const pct = v => (v == null || !isFinite(v) ? '—' : `${v.toFixed(1)}%`)
const days = v => (v == null || !isFinite(v) ? '—' : `${v.toFixed(1)}d`)

function Card({ children, style }) {
  return <div style={{ background: M.card, borderRadius: M.radius.card, padding: 16, boxShadow: M.cardShadow, ...style }}>{children}</div>
}
function GroupLabel({ children, style }) {
  return <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: M.muted, margin: '2px 0 10px', ...style }}>{children}</div>
}
const cardTitle = { fontSize: M.type.cardTitle, fontWeight: 700, color: M.ink }

function Tile({ k, value, cur, prevValue, loading, hidden, dataLoading }) {
  const meta = METRICS[k]
  return <KpiTile label={meta.label} value={value} loading={dataLoading} def={meta.def} status={metricStatus(k, cur)} lowerIsBetter={!!meta.lowerIsBetter}
    delta={pctChange(cur, prevValue)} deltaLoading={loading} deltaHidden={hidden} />
}

function Ring({ value, loading }) {
  const r = 15.5, circ = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value || 0))
  if (loading) return <Skeleton round width={68} height={68} label="Loading delivered %" />
  return (
    <div style={{ width: 68, height: 68, position: 'relative', flexShrink: 0 }} role="img" aria-label={`Delivered ${pct(value)}`}>
      <svg viewBox="0 0 36 36" width="68" height="68" aria-hidden="true">
        <circle cx="18" cy="18" r={r} fill="none" stroke={M.g4} strokeWidth="4" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={M.green} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={`${(v / 100) * circ} ${circ}`} transform="rotate(-90 18 18)" />
      </svg>
      <b style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, color: M.ink, fontVariantNumeric: 'tabular-nums' }}>{pct(value)}</b>
    </div>
  )
}

function StageBar({ label, value, max, loading }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '118px 1fr 44px', alignItems: 'center', gap: 8, margin: '8px 0', fontSize: 13 }}>
      <span style={{ color: M.muted, fontWeight: 600, fontSize: 12.5 }}>{label}</span>
      <span aria-hidden="true" style={{ height: 8, background: M.line, borderRadius: 4, overflow: 'hidden' }}>
        <i style={{ display: 'block', height: '100%', width: `${!loading && value != null && max ? (value / max) * 100 : 0}%`, background: M.g3, borderRadius: 4 }} />
      </span>
      <span style={{ textAlign: 'right', fontWeight: 700, color: M.ink, fontVariantNumeric: 'tabular-nums' }}>{loading ? <Skeleton width={36} height={13} /> : days(value)}</span>
    </div>
  )
}

function SlaBar({ label, value, num, den, loading }) {
  return (
    <div style={{ margin: '10px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, color: M.ink }}>
        <span>{label}</span><b style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{loading ? <Skeleton width={44} height={14} /> : pct(value)}</b>
      </div>
      <div aria-hidden="true" style={{ height: 8, background: M.line, borderRadius: 4, overflow: 'hidden', marginTop: 5 }}>
        <i style={{ display: 'block', height: '100%', width: `${!loading && value != null ? Math.min(100, value) : 0}%`, background: M.green, borderRadius: 4 }} />
      </div>
      <div style={{ fontSize: 12, lineHeight: '16px', color: M.muted, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{loading ? <Skeleton width={110} height={12} /> : den > 0 ? `${fmtN(num)} of ${fmtN(den)}` : '—'}</div>
    </div>
  )
}

// dataLoading: /api/logistics has not answered yet - every value shows a skeleton (logisticsMetrics()
// of no data is all zeros, which must never be shown as if it were data).
export default function LogisticsOpsMobile({ m, prev, prevStatus, badgeText, info, showTitle = true, twoCol = false, dataLoading = false }) {
  const [flow, setFlow] = useState('fwd')
  const loading = prevStatus === 'loading'
  // All or none per card: no previous-period data (error / flag off) → no ▲/▼ on the whole card.
  const hidden = prevStatus === 'error' || prevStatus === 'off'
  const P = prev || {}

  const flows = {
    fwd: { tab: 'Forward', e2eLabel: 'Order → delivered', e2e: m.lAvgFul,
      stages: [['Order → AWB', m.lAvgProcessing], ['AWB → pickup', m.lAvgPickup], ['Pickup → delivery', m.lAvgIntransit]],
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
      {keys.map(([k, cur, prevV]) => <Tile key={k} k={k} value={pct(cur)} cur={cur} prevValue={prevV} loading={loading} hidden={hidden} dataLoading={dataLoading} />)}
    </div>
  )

  const heroCard = (
    <Card>
      {showTitle && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={cardTitle}>Logistics &amp; Ops</span>
          <InfoPopover title="Logistics & Ops" text={info} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: showTitle ? 8 : 0 }}>
        {badgeText ? <InfoStrip icon="⏱" text={badgeText} style={{ width: 'auto' }} /> : <Skeleton width={200} height={30} radius={10} />}
        {!showTitle && <InfoPopover title="Logistics & Ops" text={info} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 30, lineHeight: '38px', fontWeight: 700, letterSpacing: '-.02em', color: M.ink, fontVariantNumeric: 'tabular-nums' }}>{dataLoading ? <Skeleton width={120} height={30} label="Loading total shipments" /> : fmtN(m.lTotal)}</span>
            {!dataLoading && <DeltaBadge delta={pctChange(m.lTotal, P.lTotal)} loading={loading} hidden={hidden} size={12} />}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: M.muted }}>Total shipments</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Ring value={m.lDelPct} loading={dataLoading} />
          <div style={{ fontSize: 12, color: M.muted, marginTop: 2 }}>Delivered</div>
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
        <span style={cardTitle}>Speed &amp; SLA</span>
        <InfoPopover title="Speed & SLA" text={SPEED_INFO} />
      </div>
      <SegmentToggle full label="Shipment flow" value={flow} onChange={setFlow} options={Object.entries(flows).map(([id, x]) => ({ id, label: x.tab }))} style={{ margin: '12px 0 14px' }} />
      <div role="tabpanel" aria-label={`${f.tab} speed and SLA`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: M.muted, fontWeight: 600 }}>{f.e2eLabel}</span>
          <span style={{ fontSize: 26, lineHeight: '32px', fontWeight: 700, color: M.ink, fontVariantNumeric: 'tabular-nums' }}>{dataLoading ? <Skeleton width={64} height={26} /> : days(f.e2e)}</span>
        </div>
        {f.stages.length > 0 && <>
          <GroupLabel style={{ marginTop: 4, marginBottom: 2 }}>Stage averages</GroupLabel>
          {f.stages.map(([label, v]) => <StageBar key={label} label={label} value={v} max={stageMax} loading={dataLoading} />)}
        </>}
        <GroupLabel style={{ marginTop: 14, marginBottom: 0 }}>SLA met</GroupLabel>
        {f.sla.map(([label, v, num, den]) => <SlaBar key={label} label={label} value={v} num={num} den={den} loading={dataLoading} />)}
      </div>
    </Card>
  )

  return twoCol
    ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12, alignItems: 'start' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 12 }}>{heroCard}{speedCard}</div>{tilesCard}
      </div>
    : <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 12 }}>{heroCard}{tilesCard}{speedCard}</div>
}
