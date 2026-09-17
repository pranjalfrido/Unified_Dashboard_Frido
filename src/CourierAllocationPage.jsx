import { useState, useEffect, useMemo } from 'react'
import { C as BASE_C, fmt, fmtN, exportCSV } from './utils.js'
import { Card } from './components.jsx'

// Same t3 darkening as the Logistics Cost tabs this page opens from — #94939F is 3.03:1 on
// a white card and fails WCAG AA at the 9.5-11px these labels run at.
const C = { ...BASE_C, t3: '#75747F' }

// Semantic only — gain / loss. Deliberately NOT courier brand hues: the question on this page
// is "which way does volume move", so green-up / red-down has to read instantly.
const GAIN = C.green.tx
const LOSS = C.red.tx

const PAYS = [{ key: 'Prepaid', label: 'Prepaid' }, { key: 'COD', label: 'COD' }]
const DEFAULT_W = { cost: 60, rto: 25, speed: 15 }

const ZONE_ORDER = ['A', 'B', 'C', 'D', 'E']
const ZONE_LABEL = { A: 'A · same city', B: 'B · same state', C: 'C · metro–metro', D: 'D · rest of India', E: 'E · NE, J&K' }
// Below this a cell is greyed and never marked best — thin cells produce absurd rates.
const ZONE_MIN = 500

const METRICS = [
  { k: 'landedCost', label: 'Landed ₹', fmt: v => `₹${v.toFixed(0)}` },
  { k: 'rtoPct', label: 'RTO %', fmt: v => `${v.toFixed(1)}%` },
  { k: 'transitDays', label: 'Transit', fmt: v => `${v.toFixed(1)}d` },
]

export default function CourierAllocationPage({ onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [pay, setPay] = useState('Prepaid')
  const [lookback, setLookback] = useState(90)
  const [w, setW] = useState(DEFAULT_W)
  const [openBand, setOpenBand] = useState(null)
  const [zoneMetric, setZoneMetric] = useState('landedCost')

  const API = import.meta.env.VITE_API_URL || ''

  useEffect(() => {
    const ctl = new AbortController()
    ;(async () => {
      // Inside the async body, not the effect body: a synchronous setState during an effect
      // triggers a cascading render (react-hooks/set-state-in-effect).
      setLoading(true); setErr(null)
      try {
        const res = await fetch(`${API}/api/courier-allocation`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lookbackDays: lookback }), signal: ctl.signal,
        })
        if (!res.ok) throw new Error(`API ${res.status}`)
        const j = await res.json()
        if (j.error) throw new Error(j.error)
        setData(j)
      } catch (e) {
        if (e.name !== 'AbortError') setErr(e.message)
      } finally {
        if (!ctl.signal.aborted) setLoading(false)
      }
    })()
    return () => ctl.abort()
  }, [API, lookback])

  // Re-score client-side so the sliders are instant; the server ships a cost-anchored baseline.
  const slabs = useMemo(() => {
    if (!data) return []
    const tot = w.cost + w.rto + w.speed || 1
    const wc = w.cost / tot, wr = w.rto / tot, ws = w.speed / tot

    return data.slabs.filter(s => s.pay === pay).map(s => {
      const pool = s.couriers.filter(c => c.eligible && c.landedCost != null)
      const rng = vals => {
        const ok = vals.filter(v => v != null && Number.isFinite(v))
        if (!ok.length) return [0, 1]
        const lo = Math.min(...ok), hi = Math.max(...ok)
        return [lo, hi > lo ? hi : lo + 1]
      }
      const [lc, hc] = rng(pool.map(c => c.landedCost))
      const [lr, hr] = rng(pool.map(c => c.rtoPct))
      const [lt, ht] = rng(pool.map(c => c.transitDays))
      const scored = pool.map(c => {
        const nc = (c.landedCost - lc) / (hc - lc)
        const nr = c.rtoPct == null ? 0.5 : (c.rtoPct - lr) / (hr - lr)
        const nt = c.transitDays == null ? 0.5 : (c.transitDays - lt) / (ht - lt)
        return { ...c, score: wc * nc + wr * nr + ws * nt }
      }).sort((a, b) => a.score - b.score)

      // Greedy fill capped by observed pincode coverage — a courier reaching 6% of this slab's
      // destinations cannot take 100% of its volume however good its score.
      let left = 100
      const plan = []
      for (const c of scored) {
        if (left <= 0.01) break
        const give = Math.min(left, Math.max(c.coverage, c.share))
        if (give <= 0.01) continue
        plan.push({ courier: c.courier, share: give, landedCost: c.landedCost, current: c.share })
        left -= give
      }
      if (left > 0.01) {
        const inc = plan.find(p => p.courier === s.incumbent)
        if (inc) inc.share += left
        else {
          const ic = s.couriers.find(c => c.courier === s.incumbent)
          if (ic?.landedCost != null) plan.push({ courier: s.incumbent, share: left, landedCost: ic.landedCost, current: ic.share })
        }
      }

      const weighted = rs => {
        const cov = rs.reduce((a, r) => a + (r.share || 0) / 100, 0)
        if (cov <= 0.5) return null
        return rs.reduce((a, r) => a + ((r.share || 0) / 100) * r.landedCost, 0) / cov
      }
      const curRows = s.couriers.filter(c => c.landedCost != null).map(c => ({ share: c.share, landedCost: c.landedCost }))
      const curW = weighted(curRows)
      const newW = weighted(plan)

      // Never recommend a regression: once cheap couriers' coverage is exhausted the remainder
      // is forced onto whoever is left, which on COD 0.5 kg "saved" -₹80k/month.
      const better = curW != null && newW != null && newW < curW
      const finalPlan = better
        ? plan
        : s.couriers.filter(c => c.landedCost != null && c.share > 0.01)
            .map(c => ({ courier: c.courier, share: c.share, landedCost: c.landedCost, current: c.share }))

      return {
        ...s, plan: finalPlan, unchanged: !better,
        currentLanded: curW, plannedLanded: better ? newW : curW,
        saving: curW != null && (better ? newW : curW) != null
          ? (curW - (better ? newW : curW)) * s.shipments * (30 / (data.lookbackDays || 90)) : null,
      }
    })
  }, [data, pay, w])

  // Weight bands, rebuilt from the re-scored slabs so the sliders drive them too.
  const bands = useMemo(() => {
    if (!data?.bands) return []
    return data.bands.filter(b => b.pay === pay).map(b => {
      const group = slabs.filter(s => b.slabs.includes(s.slab))
      const shipments = group.reduce((a, s) => a + s.shipments, 0)
      const byC = new Map()
      for (const s of group) {
        for (const c of s.couriers) {
          if (!byC.has(c.courier)) byC.set(c.courier, { courier: c.courier, now: 0, plan: 0, landedNum: 0, den: 0, rtoNum: 0, rtoDen: 0, tNum: 0, tDen: 0 })
          const e = byC.get(c.courier)
          const n = (c.share / 100) * s.shipments
          const p = s.plan.find(x => x.courier === c.courier)
          e.now += n
          e.plan += ((p?.share ?? 0) / 100) * s.shipments
          if (c.landedCost != null) { e.landedNum += c.landedCost * n; e.den += n }
          if (c.rtoPct != null) { e.rtoNum += c.rtoPct * (c.resolved || 0); e.rtoDen += (c.resolved || 0) }
          if (c.transitDays != null) { e.tNum += c.transitDays * n; e.tDen += n }
        }
      }
      const couriers = [...byC.values()].map(e => ({
        courier: e.courier,
        shipments: Math.round(e.now),
        share: shipments > 0 ? (e.now / shipments) * 100 : 0,
        plannedShare: shipments > 0 ? (e.plan / shipments) * 100 : 0,
        delta: e.plan - e.now,
        landedCost: e.den > 0 ? e.landedNum / e.den : null,
        rtoPct: e.rtoDen > 0 ? e.rtoNum / e.rtoDen : null,
        transitDays: e.tDen > 0 ? e.tNum / e.tDen : null,
      })).filter(c => c.shipments > 0 || Math.abs(c.delta) > 1).sort((a, b2) => b2.shipments - a.shipments)

      const wgt = key => {
        const den = couriers.reduce((a, c) => c.landedCost != null ? a + c[key] / 100 : a, 0)
        if (den <= 0.5) return null
        return couriers.reduce((a, c) => c.landedCost != null ? a + (c[key] / 100) * c.landedCost : a, 0) / den
      }
      return {
        ...b, shipments, couriers,
        saving: group.reduce((a, s) => a + (s.saving || 0), 0),
        currentLanded: wgt('share'), plannedLanded: wgt('plannedShare'),
        best: couriers.filter(c => c.landedCost != null && c.share >= 5)
          .sort((a, b2) => a.landedCost - b2.landedCost)[0]?.courier ?? null,
      }
    }).filter(b => b.shipments > 0)
  }, [data, slabs, pay])

  const totalSaving = useMemo(() => slabs.reduce((s, x) => s + (x.saving || 0), 0), [slabs])

  // Net movement per courier — the page's headline answer, in shipments rather than share
  // points because "+1.15 lakh parcels" is actionable and "+28 points" is not.
  const net = useMemo(() => {
    const m = new Map()
    for (const s of slabs) {
      for (const c of s.couriers) {
        const p = s.plan.find(x => x.courier === c.courier)
        const d = (((p?.share ?? 0) - c.share) / 100) * s.shipments
        m.set(c.courier, (m.get(c.courier) || 0) + d)
      }
    }
    return [...m.entries()].map(([courier, n]) => ({ courier, net: n }))
      .filter(x => Math.abs(x.net) >= 1).sort((a, b) => b.net - a.net)
  }, [slabs])

  const doExport = () => {
    const rows = []
    for (const b of bands) {
      for (const c of b.couriers) {
        rows.push({
          payment: pay, weight_band: b.label, courier: c.courier,
          shipments_90d: c.shipments,
          current_share_pct: c.share.toFixed(2),
          recommended_share_pct: c.plannedShare.toFixed(2),
          shipment_change_90d: Math.round(c.delta),
          landed_cost: c.landedCost != null ? c.landedCost.toFixed(2) : '',
          rto_pct: c.rtoPct != null ? c.rtoPct.toFixed(2) : '',
          transit_days: c.transitDays != null ? c.transitDays.toFixed(2) : '',
        })
      }
    }
    for (const z of (data?.zones || []).filter(z => z.pay === pay)) {
      rows.push({
        payment: pay, weight_band: `ZONE ${z.zone}`, courier: z.courier,
        shipments_90d: z.shipments, current_share_pct: '', recommended_share_pct: '',
        shipment_change_90d: '',
        landed_cost: z.landedCost != null ? z.landedCost.toFixed(2) : '',
        rto_pct: z.rtoPct != null ? z.rtoPct.toFixed(2) : '',
        transit_days: z.transitDays != null ? z.transitDays.toFixed(2) : '',
      })
    }
    exportCSV(rows, `courier_allocation_${pay.toLowerCase()}_${lookback}d.csv`)
  }

  if (loading) return <Shell onBack={onBack}><LoadingPanel lookback={lookback} /></Shell>
  if (err) return <Shell onBack={onBack}><div style={{ padding: 40, textAlign: 'center', color: LOSS }}>Could not load: {err}</div></Shell>
  if (!data) return <Shell onBack={onBack}><div style={{ padding: 40 }} /></Shell>

  const losers = net.filter(c => c.net < 0).sort((a, b) => a.net - b.net)
  const gainers = net.filter(c => c.net > 0)

  return (
    <Shell onBack={onBack}
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={lookback} onChange={e => setLookback(Number(e.target.value))} style={selStyle}>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
          </select>
          <button onClick={doExport} style={btnStyle}>↓ Export CSV</button>
        </div>
      }>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'inline-flex', background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, padding: 3, gap: 3 }}>
          {PAYS.map(p => (
            <button key={p.key} onClick={() => setPay(p.key)} style={{
              border: 'none', cursor: 'pointer', borderRadius: 7, padding: '6px 18px',
              fontFamily: 'var(--font)', fontSize: 12, fontWeight: 700,
              background: pay === p.key ? C.acl : 'transparent', color: pay === p.key ? C.t1 : C.t3,
            }}>{p.label}</button>
          ))}
        </div>
        <Sliders w={w} setW={setW} onReset={() => setW(DEFAULT_W)} />
      </div>

      {/* The answer, in one sentence + four numbers. */}
      <div style={{
        background: C.card, border: `1px solid ${C.border2}`, borderRadius: 13,
        padding: '16px 20px', marginBottom: 14,
      }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: C.t3, marginBottom: 6 }}>
          Recommended move · {pay}
        </div>
        {net.length > 0 ? (
          <div style={{ fontSize: 14.5, color: C.t1, lineHeight: 1.55, maxWidth: 780 }}>
            Shift <b>{fmtN(Math.round(Math.abs(losers.reduce((a, c) => a + c.net, 0))))}</b> shipments off{' '}
            <b style={{ color: LOSS }}>{losers.slice(0, 2).map(c => c.courier).join(' and ')}</b>
            {losers.length > 2 ? ` (and ${losers.length - 2} more)` : ''} onto{' '}
            <b style={{ color: GAIN }}>{gainers.map(c => c.courier).join(' and ')}</b> — worth{' '}
            <b>{fmt(Math.round(totalSaving))}</b> a month.
          </div>
        ) : (
          <div style={{ fontSize: 14, color: C.t2, lineHeight: 1.55, maxWidth: 780 }}>
            The current mix already beats every alternative these couriers can serve.
            {pay === 'COD' && ' COD landed costs sit close together because RTO dominates them all — the lever here is reducing RTO, not switching courier.'}
          </div>
        )}
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', marginTop: 14 }}>
          <Stat label="Saving / month" value={fmt(Math.round(totalSaving))} accent={totalSaving > 0 ? GAIN : C.t1} />
          <Stat label={`${pay} RTO`} value={`${(pay === 'COD' ? data.health.codRtoPct : data.health.prepaidRtoPct)?.toFixed(2)}%`}
            accent={pay === 'COD' ? LOSS : GAIN} />
          <Stat label="Shipments analysed" value={fmtN(data.health.perfShipments)} />
          <Stat label="Zoned" value={data.zoneCoverage?.pct != null ? `${data.zoneCoverage.pct.toFixed(1)}%` : '—'} />
        </div>
      </div>

      {/* TABLE 1 — weight bands.
          style={{ height: 'auto' }} overrides Card's default height:100%. Card is built for
          fixed-height dashboard grid cells; here the cards are stacked in a scrolling column,
          and 100% made each one stretch to its container, leaving a large blank area under the
          table — most visible on the last card, which absorbs all remaining viewport height. */}
      <Card title="By weight range" style={{ height: 'auto' }}
        note={`${pay} · click a row for the slabs inside it`}>
        <div style={{ overflowX: 'auto' }}>
          {/* Fixed column widths. Left to itself the browser gave the chip column 919px of a
              1366px table and pushed Landed ₹ and Saving to the far edge, so the eye had to
              cross a wide empty gap to connect a row's move to its numbers. */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 860, maxWidth: 1180, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 118 }} />
              <col style={{ width: 92 }} />
              <col />
              <col style={{ width: 112 }} />
              <col style={{ width: 96 }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border2}` }}>
                <th style={{ ...thStyle, textAlign: 'left' }}>Weight</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Shipments</th>
                <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 16 }}>Current mix → recommended</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Landed ₹</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Saving/mo</th>
              </tr>
            </thead>
            <tbody>
              {bands.map(b => {
                const open = openBand === b.key
                const movers = b.couriers.filter(c => Math.abs(c.delta) >= Math.max(50, b.shipments * 0.01))
                const up = movers.filter(c => c.delta > 0).sort((a, c) => c.delta - a.delta)
                const dn = movers.filter(c => c.delta < 0).sort((a, c) => a.delta - c.delta)
                return (
                  <Fragment2 key={b.key}>
                    <tr onClick={() => setOpenBand(open ? null : b.key)}
                      style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer', background: open ? C.bg : 'transparent' }}>
                      <td style={{ ...tdStyle, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        <span style={{ color: C.t3, marginRight: 6, fontSize: 9 }}>{open ? '▼' : '▶'}</span>
                        {b.label}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtN(b.shipments)}</td>
                      {/* whiteSpace normal: tdStyle sets nowrap for numeric columns, but under
                          tableLayout:fixed that would clip a long chip list instead of wrapping. */}
                      <td style={{ ...tdStyle, paddingLeft: 16, whiteSpace: 'normal' }}>
                        {movers.length === 0
                          ? <span style={{ color: C.t3 }}>keep {b.best || 'current mix'}</span>
                          : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              {dn.map(c => <Chip key={c.courier} c={c} dir="out" />)}
                              {dn.length > 0 && up.length > 0 && <span style={{ color: C.t3 }}>→</span>}
                              {up.map(c => <Chip key={c.courier} c={c} dir="in" />)}
                            </span>
                          )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {b.currentLanded != null ? `₹${b.currentLanded.toFixed(0)}` : '—'}
                        {b.plannedLanded != null && b.plannedLanded < b.currentLanded - 0.5 && (
                          <> → <b style={{ color: GAIN }}>₹{b.plannedLanded.toFixed(0)}</b></>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: b.saving > 0 ? GAIN : C.t3 }}>
                        {b.saving > 0 ? fmt(Math.round(b.saving)) : '—'}
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={5} style={{ padding: 0, background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                          <BandDetail b={b} />
                        </td>
                      </tr>
                    )}
                  </Fragment2>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${C.border2}` }}>
                <td style={{ ...tdStyle, fontWeight: 800 }}>All weights</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>
                  {fmtN(bands.reduce((a, b) => a + b.shipments, 0))}
                </td>
                <td />
                <td />
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: GAIN }}>
                  {fmt(Math.round(totalSaving))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <div style={{ height: 12 }} />

      {/* TABLE 2 — zones */}
      {data.zones?.length > 0 && (
        <ZoneTable zones={data.zones} pay={pay} coverage={data.zoneCoverage}
          metric={zoneMetric} setMetric={setZoneMetric} />
      )}

      <MethodNote data={data} />
    </Shell>
  )
}

// React.Fragment with a key, without importing Fragment at the top of a file that already
// has a long import list.
function Fragment2({ children }) { return <>{children}</> }

function Chip({ c, dir }) {
  const out = dir === 'out'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 4,
      background: out ? C.red.bg : C.green.bg,
      border: `1px solid ${out ? C.red.bd : C.green.bd}`,
      borderRadius: 6, padding: '2px 7px', fontSize: 11,
    }}>
      <b style={{ color: C.t1 }}>{c.courier}</b>
      <span style={{ color: out ? LOSS : GAIN, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {out ? '−' : '+'}{fmtN(Math.round(Math.abs(c.delta)))}
      </span>
    </span>
  )
}

function BandDetail({ b }) {
  return (
    <div style={{ padding: '10px 16px 12px' }}>
      <div style={{ fontSize: 10.5, color: C.t3, marginBottom: 8 }}>
        Slabs in this range: {b.slabs.map(s => `${s} kg`).join(', ')}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border2}` }}>
            {['Courier', 'Shipments', 'Now', 'Recommended', 'Change', 'Landed ₹', 'RTO %', 'Transit'].map((h, i) => (
              <th key={h} style={{ ...thStyle, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {b.couriers.map(c => (
            <tr key={c.courier} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ ...tdStyle, fontWeight: 600 }}>{c.courier}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtN(c.shipments)}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{c.share.toFixed(1)}%</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{c.plannedShare.toFixed(1)}%</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: c.delta > 0 ? GAIN : c.delta < 0 ? LOSS : C.t3 }}>
                {Math.abs(c.delta) < 1 ? '—' : `${c.delta > 0 ? '+' : '−'}${fmtN(Math.round(Math.abs(c.delta)))}`}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{c.landedCost != null ? `₹${c.landedCost.toFixed(2)}` : '—'}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: c.rtoPct > 15 ? LOSS : C.t1 }}>{c.rtoPct != null ? c.rtoPct.toFixed(2) : '—'}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{c.transitDays != null ? `${c.transitDays.toFixed(1)}d` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────── zone table
// Zone changes the answer, so it stays: measured on 90 days, Delhivery is cheapest in zone C
// (₹66 landed, 0.7% RTO) but among the dearest in D and E. A single national ranking would
// drop it everywhere, which is exactly wrong for the zone where it wins.
function ZoneTable({ zones, pay, coverage, metric, setMetric }) {
  const rows = zones.filter(z => z.pay === pay)
  const vol = new Map()
  for (const z of rows) vol.set(z.courier, (vol.get(z.courier) || 0) + z.shipments)
  const couriers = [...new Set(rows.map(z => z.courier))]
    .filter(c => rows.some(r => r.courier === c && r.shipments >= ZONE_MIN && r[metric] != null))
    .sort((a, b) => (vol.get(b) || 0) - (vol.get(a) || 0))
  const at = (c, z) => rows.find(r => r.courier === c && r.zone === z)
  const M = METRICS.find(m => m.k === metric)

  // Best needs volume AND reach: without the share test the ✓ lands on niche couriers —
  // Urbanbolt wins zone A on ₹33 but serves 112 pincodes nationally, which no one can act on.
  const zoneVol = {}
  for (const z of ZONE_ORDER) zoneVol[z] = rows.filter(r => r.zone === z).reduce((a, r) => a + r.shipments, 0)
  const best = {}
  for (const z of ZONE_ORDER) {
    let bc = null, bv = Infinity
    for (const c of couriers) {
      const e = at(c, z)
      const v = e?.[metric]
      if (e && e.shipments >= ZONE_MIN && zoneVol[z] > 0 && (e.shipments / zoneVol[z]) >= 0.08 && v != null && v < bv) { bv = v; bc = c }
    }
    best[z] = bc
  }

  return (
    <Card title="By zone" style={{ height: 'auto' }}
      note={`${coverage?.pct != null ? coverage.pct.toFixed(1) + '% zoned' : ''} · ✓ = best that can absorb the volume`}
      action={
        <div style={{ display: 'inline-flex', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 2, gap: 2 }}>
          {METRICS.map(m => (
            <button key={m.k} onClick={() => setMetric(m.k)} style={{
              border: 'none', cursor: 'pointer', borderRadius: 6, padding: '4px 10px',
              fontFamily: 'var(--font)', fontSize: 10.5, fontWeight: 700,
              background: metric === m.k ? C.card : 'transparent',
              color: metric === m.k ? C.t1 : C.t3,
            }}>{m.label}</button>
          ))}
        </div>
      }>
      <div style={{ overflowX: 'auto' }}>
        {/* Capped: five numeric columns stretched across a wide screen put 270px between each
            value, so comparing a courier's zones meant scanning across near-empty space. */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 640, maxWidth: 900, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 130 }} />
            {ZONE_ORDER.map(z => <col key={z} />)}
          </colgroup>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border2}` }}>
              <th style={{ ...thStyle, textAlign: 'left' }}>Courier</th>
              {ZONE_ORDER.map(z => <th key={z} style={{ ...thStyle, textAlign: 'right' }}>{ZONE_LABEL[z]}</th>)}
            </tr>
          </thead>
          <tbody>
            {couriers.map(c => (
              <tr key={c} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{c}</td>
                {ZONE_ORDER.map(z => {
                  const e = at(c, z)
                  const v = e?.[metric]
                  const thin = !e || e.shipments < ZONE_MIN
                  const isBest = best[z] === c && !thin
                  return (
                    <td key={z} style={{
                      ...tdStyle, textAlign: 'right',
                      background: isBest ? C.green.bg : 'transparent',
                      color: thin ? C.t3 : isBest ? GAIN : C.t1,
                      fontWeight: isBest ? 800 : 400, opacity: thin ? 0.55 : 1,
                    }} title={e ? `${fmtN(e.shipments)} shipments${thin ? ` — under ${ZONE_MIN}, not ranked` : ''}` : 'no shipments'}>
                      {v == null ? '·' : (isBest ? '✓ ' : '') + M.fmt(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10.5, color: C.t3, marginTop: 8, lineHeight: 1.5, maxWidth: 780 }}>
        Zone follows the lane, not the destination — the same pincode is zone A from a local
        warehouse and zone D from across the country. Cells under {ZONE_MIN} shipments are greyed
        and never marked best; the ✓ also needs 8% of that zone's volume so it lands on a courier
        that could absorb the work.
        {coverage?.unzoned > 0 && <> {fmtN(coverage.unzoned)} shipments could not be zoned and are excluded.</>}
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────── chrome
function Stat({ label, value, accent }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: C.t3 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: accent || C.t1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>{value}</div>
    </div>
  )
}

function Sliders({ w, setW, onReset }) {
  const items = [{ k: 'cost', label: 'Cost' }, { k: 'rto', label: 'RTO' }, { k: 'speed', label: 'Speed' }]
  const tot = w.cost + w.rto + w.speed || 1
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.t3 }}>Rank by</span>
      {items.map(it => (
        <label key={it.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.t2 }}>
          <span style={{ fontWeight: 700, minWidth: 32 }}>{it.label}</span>
          <input type="range" min={0} max={100} value={w[it.k]}
            onChange={e => setW({ ...w, [it.k]: Number(e.target.value) })}
            style={{ width: 78, accentColor: C.acc }} />
          <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 28, color: C.t3 }}>
            {Math.round((w[it.k] / tot) * 100)}%
          </span>
        </label>
      ))}
      <button onClick={onReset} style={{ ...btnStyle, padding: '3px 9px', fontSize: 10.5 }}>Reset</button>
    </div>
  )
}

function Shell({ children, onBack, right }) {
  return (
    <div className="page-scroll lc-page" style={{ padding: '14px 18px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={btnStyle}>← Cost Analytics</button>
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.t1, letterSpacing: '-.01em' }}>Courier Allocation</div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>Which courier should carry which weight and zone</div>
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

// The cold path is genuinely slow — ~35s when the logistics-cost prewarm holds the Supabase
// pooler. A static "loading…" for that long is indistinguishable from a hung page.
function LoadingPanel({ lookback }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setSecs(s => s + 1), 1000)
    return () => clearInterval(iv)
  }, [])
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center' }}>
      <div style={{
        width: 30, height: 30, margin: '0 auto 16px', borderRadius: '50%',
        border: `2.5px solid ${C.border2}`, borderTopColor: C.acc,
        animation: 'lcSpin 0.9s linear infinite',
      }} />
      <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>Working out the best courier mix</div>
      <div style={{ fontSize: 11.5, color: C.t3, marginTop: 6, lineHeight: 1.6, maxWidth: 430, margin: '6px auto 0' }}>
        Joining {lookback} days of delivery performance to the invoice ledger, per courier,
        weight and zone.
        <br />First load takes <b style={{ color: C.t2 }}>30–60 seconds</b>; cached for 10 minutes after.
      </div>
      <div style={{ fontSize: 11, color: C.t3, marginTop: 12, fontVariantNumeric: 'tabular-nums' }}>{secs}s</div>
    </div>
  )
}

function MethodNote({ data }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ padding: '14px 2px 28px' }}>
      <button onClick={() => setOpen(v => !v)} style={{ ...btnStyle, fontSize: 11 }}>
        {open ? 'Hide how this is calculated' : 'How this is calculated'}
      </button>
      {open && (
        <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.65, marginTop: 10, maxWidth: 780 }}>
          <p style={{ margin: '0 0 8px' }}>
            <b style={{ color: C.t2 }}>COD and Prepaid never mix.</b> COD RTO is{' '}
            {data.health.codRtoPct?.toFixed(2)}% against Prepaid's {data.health.prepaidRtoPct?.toFixed(2)}% —
            a {(data.health.codRtoPct / (data.health.prepaidRtoPct || 1)).toFixed(0)}× gap, wider than any
            difference between couriers. Blended, an RTO figure would mostly measure how much COD
            volume a courier was handed rather than how well it performs.
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <b style={{ color: C.t2 }}>Ranking is on landed cost</b> — the invoice grossed up for the
            return leg an RTO incurs, divided by the delivery rate. A cheap courier with a high RTO
            is the expensive one.
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <b style={{ color: C.t2 }}>Rates use resolved shipments only</b> — delivered, RTO or lost.
            Cancelled parcels were never delivered and never charged; still-moving ones have not
            landed yet.
          </p>
          <p style={{ margin: 0 }}>
            Cost comes from the invoice ledger (forward legs, ex-GST); performance from Clickpost over
            the lookback. Moves are capped by observed pincode reach, and cells under {data.minCell}{' '}
            resolved shipments never drive a recommendation. Savings assume a courier's measured rates
            hold as volume shifts onto it — which is what a pilot should test.
          </p>
        </div>
      )}
    </div>
  )
}

const thStyle = { padding: '7px 9px', fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: C.t3, whiteSpace: 'nowrap' }
const tdStyle = { padding: '8px 9px', color: C.t1, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const btnStyle = {
  background: C.card, border: `1px solid ${C.border2}`, borderRadius: 8,
  padding: '6px 11px', fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 700,
  color: C.t2, cursor: 'pointer',
}
const selStyle = { ...btnStyle, padding: '6px 8px' }
