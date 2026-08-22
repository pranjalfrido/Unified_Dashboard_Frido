import { useState, useEffect, useMemo, useRef, useCallback, Children } from 'react'
import { C, fmt, fmtN, fmtBig, COURIER_COLORS, COURIER_LOGOS } from './utils.js'
import {
  Card, Badge, DataTable, ChartTooltip,
  BarChart, Bar, Line, ComposedChart, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, LabelList, PieChart, Pie, ResponsiveContainer, Cell,
} from './components.jsx'

// ── Logistics Cost Analytics ──────────────────────────────────
// Reads the manually-dumped invoice ledgers (logistics_invoices_b2c / _b2b).
// Read-only: this page never writes to Supabase.

const B2C = 'logistics_invoices_b2c'
const ZONES = ['A', 'B', 'C', 'D', 'E']

// ── Palette ───────────────────────────────────────────────────
// Validated with the dataviz validator against this app's white card surface
// (#ffffff), light mode only — the app ships no dark theme.
//
// Zones and weight slabs are ORDERED categories, so they take a single-hue ordinal
// blue ramp (light→dark) rather than categorical hues: colouring an ordered scale
// with unrelated hues throws away the ordering the reader needs. Validated with
// --ordinal: monotone lightness, all adjacent ΔL ≥ 0.06, light end clears the surface.
const ORDINAL_BLUE = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281']

// Shipment mode is true identity (Forward/RTO/Reverse), so it takes categorical
// slots 1–2–3 in fixed order — validated --pairs all, worst ΔE 9.2 CVD / 24.0 normal.
// Colour follows the entity: RTO stays orange even when Forward is filtered out.
const SERIES = { blue: '#2a78d6', orange: '#eb6834', aqua: '#1baf7a', yellow: '#eda100' }
// Two reporting legs now — RTO/RVP/DTO all fold into Reverse upstream. The RTO key is
// retained only so an unexpected raw value still renders in a stable colour.
const MODE_COLOR = { Forward: SERIES.blue, Reverse: SERIES.orange, RTO: SERIES.yellow }

// Six categorical slots in fixed order for the rate-drift lines — validated against
// this app's white surface (worst adjacent ΔE 9.1 CVD / 19.6 normal vision). Fixed
// order means a courier keeps its colour as the filter changes the line count.
const DRIFT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7']

// Chart chrome — recessive hairlines, muted axis ink.
const VIZ = {
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  muted: '#898781',
  surface: '#ffffff',
}

const zoneColor = (zone, ordered) => {
  const i = ordered.indexOf(zone)
  return i === -1 ? VIZ.muted : ORDINAL_BLUE[Math.min(i, ORDINAL_BLUE.length - 1)]
}

// Weight slabs mirror how courier rate cards actually step, so a slab filter
// answers "which slab is bleeding money" rather than an arbitrary cut.
const WEIGHT_BANDS = [
  { key: '0-1', label: '0 – 1 kg', min: 0, max: 1 },
  { key: '1-2', label: '1 – 2 kg', min: 1, max: 2 },
  { key: '2-5', label: '2 – 5 kg', min: 2, max: 5 },
  { key: '5-10', label: '5 – 10 kg', min: 5, max: 10 },
  { key: '10+', label: '10 kg +', min: 10, max: null },
]

// The three reporting scopes. B2C is the default because it is where the detail
// (and the recoverable money) lives.
// Courier name with its mark. The logo is decorative — alt is empty so a screen reader
// reads the name once, not twice — and a broken file hides the img rather than showing a
// torn-image glyph, so an unmapped courier degrades to plain text instead of visible damage.
function CourierCell({ name }) {
  const [bad, setBad] = useState(false)
  const logo = COURIER_LOGOS[name]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
      {logo && !bad
        ? <img src={logo} alt="" onError={() => setBad(true)}
            style={{ width: 18, height: 18, objectFit: 'contain', borderRadius: 3,
                     flexShrink: 0, background: '#fff' }} />
        // Fixed-size placeholder, so names stay left-aligned whether or not a mark exists.
        : <span style={{ width: 18, flexShrink: 0 }} />}
      {name}
    </span>
  )
}

const BAND_LABEL = { '0-1': '0 – 1 kg', '1-2': '1 – 2 kg', '2-5': '2 – 5 kg', '5-10': '5 – 10 kg', '10+': '10 kg +' }

const SCOPES = [
  { id: 'all', label: 'Overall', hint: 'B2B + B2C combined summary' },
  { id: 'b2c', label: 'B2C', hint: 'Courier / parcel shipments' },
  { id: 'b2b', label: 'B2B', hint: 'Transporter freight, lane-wise' },
]

const EMPTY_FILTERS = {
  months: [], zones: [], modes: [], payments: [], couriers: [],
  accountTypes: [], band: null, destCity: null, billing: 'all',
}

const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }

// Weight units are inconsistent between uploads: some couriers bill in kilograms,
// others in grams. The API detects this per courier and normalises to kg before
// aggregating; the list of affected couriers comes back in the response so the UI
// can disclose it. The stored data is never modified.
// Currency uses the app-wide fmt() (₹x.xx Cr / L / K) so this tab matches Sales.
// Per-shipment figures deliberately stay exact below — "₹0.00 K" would be useless.

// Weight totals stay in kilograms, compacted with the same Cr/L/K scale as currency.
// An earlier version rendered tonnes ("169 t"), but a bare "t" beside rupee and percent
// tiles reads as cryptic rather than as a unit — the ledger is denominated in kg, so the
// tiles say kg.
const fmtKg = v => `${fmtBig(num(v))} kg`

// Cost-per-kg is meaningless when the weight denominator is ~0, so guard it.
const perKg = (cost, wt) => (num(wt) > 0.001 ? num(cost) / num(wt) : null)

// Billable slab (implemented in SQL, api/logistics-cost.js): 0.5 kg minimum, else
// round up to the next whole kg. The spec arrived as IF(wt > 0.5, 0.5, CEILING(wt,1)),
// which inverts — it would bill a 3 kg parcel at 0.5 kg while rounding 0.4 kg UP to 1.
// Tested against what Bluedart actually charged, the flipped "< 0.5" form matches
// 26.7% of rows vs 4.7% for the literal reading, so that is the real rate card.

function cubeToByCourierMonth(cube) {
  if (!cube?.length) return []
  const map = {}
  for (const r of cube) {
    if (!r.courier_name || !r.month) continue
    const key = `${r.courier_name}|${r.month}`
    if (!map[key]) map[key] = { key, n: 0, cost: 0, wt: 0 }
    map[key].n += Number(r.n) || 0
    map[key].cost += Number(r.cost) || 0
    map[key].wt += Number(r.wt) || 0
  }
  return Object.values(map)
}

// Maps the API's row-per-group payload into the keyed shape the rest of this page
// already renders from, so the aggregation move stayed confined to data loading.
function shapeResponse(j) {
  const t = j.totals || {}
  const toMap = rows => {
    const out = {}
    for (const r of rows || []) {
      out[r.key] = {
        n: Number(r.n) || 0,
        cost: Number(r.cost) || 0,
        wt: Number(r.wt) || 0,
        declWt: Number(r.decl_wt) || 0,
        value: Number(r.value) || 0,
        overN: Number(r.over_n) || 0,
        overKg: Number(r.over_kg) || 0,
        recInfl: Number(r.rec_infl) || 0,
        recAdmit: Number(r.rec_admit) || 0,
        recAdmitN: Number(r.rec_admit_n) || 0,
        recUnexp: Number(r.rec_unexp) || 0,
        reverseN: Number(r.reverse_n) || 0,
        claimableRs: Number(r.claimable_rs) || 0,
        claimableN: Number(r.claimable_n) || 0,
      }
    }
    return out
  }
  return {
    n: Number(t.n) || 0,
    cost: Number(t.cost) || 0,
    chargedWt: Number(t.charged_wt) || 0,
    declaredWt: Number(t.declared_wt) || 0,
    shipValue: Number(t.ship_value) || 0,
    surcharge: Number(t.surcharge) || 0,
    overbilledRows: Number(t.overbilled_rows) || 0,
    overbilledKg: Number(t.overbilled_kg) || 0,
    overbilledCostEst: Number(t.overbilled_cost) || 0,
    slabRows: Number(t.slab_rows) || 0,
    slabExcessKg: Number(t.slab_excess_kg) || 0,
    slabExcessCost: Number(t.slab_excess_cost) || 0,
    // Rate-card pricing (see api/logistics-cost.js).
    rcEntitled: Number(t.rc_entitled) || 0,
    rcCarrier: Number(t.rc_carrier) || 0,
    // All-in: card rate grossed up by each courier's own monthly surcharge + other-charge
    // rate, so the entitlement is comparable with the full invoice rather than with base
    // freight alone. Base-only figures are kept for the claim tiers, which are argued on
    // freight.
    rcEntitledAllin: Number(t.rc_entitled_allin) || 0,
    rcCarrierAllin: Number(t.rc_carrier_allin) || 0,
    rcEntitledSurcharge: Number(t.rc_entitled_surcharge) || 0,
    invAddons: Number(t.inv_addons) || 0,
    rcTotal: Number(t.rc_total) || 0,
    invFreight: Number(t.inv_freight) || 0,
    rcPriced: Number(t.rc_priced) || 0,
    rcOverN: Number(t.rc_over_n) || 0,
    rcOverCost: Number(t.rc_over_cost) || 0,
    rcInflN: Number(t.rc_infl_n) || 0,
    rcInflCost: Number(t.rc_infl_cost) || 0,
    rcAdmitN: Number(t.rc_admit_n) || 0,
    rcAdmitCost: Number(t.rc_admit_cost) || 0,
    claimableN: Number(t.claimable_n) || 0,
    claimableRs: Number(t.claimable_rs) || 0,
    marginKillerN: Number(t.margin_killer_n) || 0,
    marginKillerCost: Number(t.margin_killer_cost) || 0,
    // Derived-card pricing at their weight vs ours, on the identical population.
    dcOurs: Number(t.dc_ours) || 0,
    dcTheirs: Number(t.dc_theirs) || 0,
    dcInvoiced: Number(t.dc_invoiced) || 0,
    dcN: Number(t.dc_n) || 0,
    dcWeightN: Number(t.dc_weight_n) || 0,
    dcRateN: Number(t.dc_rate_n) || 0,
    // TOTAL-cost basis (freight + that cell's own surcharge), used by Billing Accuracy.
    // The ledger has no Frido total cost, so it is derived from the rate card.
    dtOurs: Number(t.dt_ours) || 0,
    dtTheirs: Number(t.dt_theirs) || 0,
    dtInvoiced: Number(t.dt_invoiced) || 0,
    dtN: Number(t.dc_n) || 0,
    // Per-ROW clamped claim figures. The netted dt_theirs/dt_ours difference is the net
    // commercial position; these are what can actually be invoiced back.
    dtWeightClaim: Number(t.dt_weight_claim) || 0,
    dtRateClaim: Number(t.dt_rate_claim) || 0,
    dtWeightN: Number(t.dt_weight_n) || 0,
    dtRateN: Number(t.dt_rate_n) || 0,
    skipped: Number(j.skipped) || 0,
    health: j.health || null,
    claims: j.claims || [],
    byZone: toMap(j.byZone),
    byMode: toMap(j.byMode),
    byMonth: toMap(j.byMonth),
    byCourier: toMap(j.byCourier),
    byPay: toMap(j.byPay),
    byAcct: toMap(j.byAcct),
    byBand: toMap(j.byBand),
    byLane: toMap(j.byLane),
    likeForLike: j.likeForLike || [],
    rateDrift: j.rateDrift || [],
    byProduct: j.byProduct || [],
    rateGrid: j.rateGrid || [],
    courierDisputes: j.courierDisputes || [],
    slabCosts: j.slabCosts || [],
    trendAll: j.trendAll || [],
    byCourierMonth: j.byCourierMonth || cubeToByCourierMonth(j.cube),
  }
}

function monthLabel(my) {
  if (!my) return '—'
  const [y, m] = String(my).split('-')
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const i = parseInt(m, 10) - 1
  return names[i] ? `${names[i]} ${y}` : my
}

// ── Small presentational helpers ──────────────────────────────
// Compact KPI tile for the hero grid — matches the Sales page's "hero + rows of 4"
// layout so the two tabs read as one product.
function Tile({ label, value, sub, badge, accent }) {
  return (
    // Fixed three-band layout so every tile in a grid reads identically.
    //
    // Was `justifyContent: center` with no reserved space for the sub, which meant a tile
    // whose sub wrapped to two lines pushed its label and value up relative to its
    // neighbours — the label row, value row and sub row all sat at different heights across
    // the grid. Now the label pins to the top, the value sits directly under it, and the sub
    // is pushed to the bottom by `marginTop: auto`, so the three bands line up across every
    // card regardless of how long any one sub is.
    <div className="kpi-card" style={{ padding: '9px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div className="kpi-label">{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <div className="kpi-value" style={{ fontSize: 17, marginBottom: 0, ...(accent ? { color: accent } : {}) }}>{value}</div>
        {badge}
      </div>
      {/* minHeight reserves two lines, so a one-line sub does not make its card shorter
          than a two-line neighbour and shift the value row. */}
      {/* Single line always: subs are kept short enough to fit, and ellipsis catches any
        that a long formatted value pushes over. A wrapping sub was what made card heights
        and label positions differ across the grid. */}
      <div className="kpi-sub" style={{
        marginTop: 'auto', paddingTop: 4,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }} title={typeof sub === 'string' ? sub : undefined}>{sub}</div>
    </div>
  )
}

// The one number this tab exists to report, at display size. Proportional figures
// (no tabular-nums) — equal-width digits read loose at this scale.
function Hero({ label, value, sub, deltas, children }) {
  return (
    <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 22px' }}>
      <div className="kpi-label" style={{ fontSize: 11 }}>{label}</div>
      {/* Value left, change badges pinned RIGHT — same arrangement as the Tile badges, so
          the eye finds every MoM figure in the same place down the row. space-between rather
          than a gap, so the badge tracks the card edge instead of the value's width. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div className="kpi-value" style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-.02em' }}>{value}</div>
        {deltas?.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            {deltas.map(d => (
              <span key={d.note} style={{
                fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 5,
                background: d.good ? C.green.bg : C.red.bg,
                color: d.good ? C.green.tx : C.red.tx, whiteSpace: 'nowrap',
              }}>
                {d.up ? '▲' : '▼'} {Math.abs(d.pct).toFixed(1)}%
                <span style={{ fontWeight: 400, opacity: 0.7 }}> {d.note}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {sub && <div className="kpi-sub" style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.5 }}>{sub}</div>}
      {children && <div style={{ flex: 1, minHeight: 38, paddingTop: 6 }}>{children}</div>}
    </div>
  )
}

// Section header. Collapsible when given onToggle — the caret and whole-row click match
// the Logistics Performance tab, so the two tabs behave the same way.
function SectionHdr({ title, note, collapsed, onToggle }) {
  const clickable = typeof onToggle === 'function'
  return (
    <div onClick={clickable ? onToggle : undefined}
      style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '22px 0 11px',
               cursor: clickable ? 'pointer' : 'default', userSelect: clickable ? 'none' : undefined }}>
      {clickable && (
        <span style={{ fontSize: 9, color: C.t3, display: 'inline-block', flexShrink: 0,
                       transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform .2s' }}>▼</span>
      )}
      <span style={{ fontSize: 12, fontWeight: 700, color: C.t2, letterSpacing: '.06em', textTransform: 'uppercase' }}>{title}</span>
      {note && <span style={{ fontSize: 11.5, color: C.t3 }}>{note}</span>}
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  )
}

// Courier row with its logo — the same treatment as the Logistics Performance
// sidebar, so a courier looks identical on both tabs. Falls back to a coloured
// initial when the logo asset is missing or fails to load.
function CourierRow({ label, active, onClick }) {
  const [imgErr, setImgErr] = useState(false)
  const logo = COURIER_LOGOS[label]
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 8px', borderRadius: 7, border: 'none',
      background: active ? '#EFEFEF' : 'transparent',
      color: active ? '#1a1a1a' : C.t2,
      fontSize: 12, fontWeight: active ? 700 : 500,
      cursor: 'pointer', fontFamily: 'var(--font)',
      width: '100%', textAlign: 'left', transition: 'all .15s',
      borderLeft: active ? '3px solid #888' : '3px solid transparent',
    }}>
      {logo && !imgErr
        ? <img src={logo} alt="" onError={() => setImgErr(true)}
            style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 4, flexShrink: 0, background: '#fff', padding: 1 }} />
        : <span style={{ width: 22, height: 22, borderRadius: 4, background: COURIER_COLORS[label] || '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{label.charAt(0)}</span>
      }
      {label}
    </button>
  )
}

// Two-up segmented control in the boxed style the Performance sidebar uses for
// Courier Direction. Clicking the active option clears it back to "all".
// Multi-select pill row, for dimensions with 3+ options that don't fit a SegPair.
function ChipRow({ options, selected, onToggle, small }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: small ? 3 : 5 }}>
      {(options || []).map(o => {
        const on = selected.includes(o)
        return (
          <button key={o} onClick={() => onToggle(o)}
            style={{
              border: `1.5px solid ${on ? C.acm : C.border2}`, cursor: 'pointer',
              background: on ? C.acl : C.card, color: C.t1,
              fontSize: small ? 12 : 11, fontWeight: on ? 700 : 500, padding: small ? '4px 9px' : '5px 11px',
              borderRadius: small ? 6 : 7, fontFamily: 'var(--font)', whiteSpace: 'nowrap',
            }}>
            {o}
          </button>
        )
      })}
    </div>
  )
}

function SlabDropdown({ value, onChange, slabs }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler) }
  }, [open])
  const label = value === '' ? 'All' : `${value} kg`
  const active = value !== ''
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 500, padding: '4px 9px', borderRadius: 6, border: `1.5px solid ${active ? C.acm : C.border2}`, background: active ? C.acl : C.card, color: C.t1, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
        {label} <span style={{ fontSize: 9, color: C.t3 }}>▼</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 999, background: C.card, border: `1.5px solid ${C.border2}`, borderRadius: 8, marginTop: 4, minWidth: 90, maxHeight: 160, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
          {[{ label: 'All slabs', value: '' }, ...slabs.map(sv => ({ label: `${sv} kg`, value: sv }))].map(opt => (
            <div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false) }}
              style={{ padding: '5px 12px', fontSize: 12, fontWeight: opt.value === value ? 700 : 400, color: C.t1, background: opt.value === value ? '#e5e7eb' : 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SegPair({ options, value, onChange }) {
  return (
    // flexShrink: 0 — the sidebar is a flex column, so without it this control gets
    // squeezed to a hairline when the column runs short of space (which is exactly what
    // happened to Billing Status: the heading showed but the buttons collapsed).
    <div style={{ display: 'flex', flexShrink: 0, minHeight: 34, border: `1.5px solid ${C.border2}`, borderRadius: 8, overflow: 'hidden', background: C.card }}>
      {options.map((o, i) => {
        const on = value === o.value
        return (
          <button key={o.value} onClick={() => onChange(on ? null : o.value)}
            style={{
              flex: 1, padding: '7px 0', border: 'none',
              borderLeft: i > 0 ? `1.5px solid ${C.border2}` : 'none',
              background: on ? C.t1 : 'transparent',
              color: on ? '#fff' : C.t2,
              fontSize: 11.5, fontWeight: on ? 700 : 500,
              cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'center',
              transition: 'all .15s',
            }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// Searchable single-select for high-cardinality dimensions (415 destination cities).
// Full-width labelled dropdown, styled like the Performance sidebar's FILTERS block.
// Handles both single-select (destination city) and multi-select (zone, mode, payment)
// so every filter in that block looks the same regardless of arity.
function SearchSelect({ label, options, value, onChange, multi, selected }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch('') } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const list = options || []
  const sel = multi ? (selected || []) : []
  const active = multi ? sel.length > 0 : !!value
  // Search only appears once the list is long enough to need it.
  const searchable = list.length > 8
  const filtered = list.filter(o => o.toLowerCase().includes(search.toLowerCase())).slice(0, 200)

  const summary = multi
    ? (sel.length === 0 ? label : sel.length === 1 ? sel[0] : `${label} · ${sel.length}`)
    : (value || label)

  const isOn = o => (multi ? sel.includes(o) : o === value)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
          border: `1.5px solid ${active ? C.acm : C.border2}`, borderRadius: 8,
          background: active ? C.acl : C.card, cursor: 'pointer', fontFamily: 'var(--font)',
          fontSize: 11.5, color: active ? C.t1 : C.t2, fontWeight: active ? 600 : 400,
          width: '100%', whiteSpace: 'nowrap', boxSizing: 'border-box',
        }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>{summary}</span>
        <span style={{ fontSize: 8, color: C.t3, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 400, background: C.card, border: `1px solid ${C.border2}`, borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,.14)', minWidth: 196, width: '100%', maxHeight: 300, display: 'flex', flexDirection: 'column' }}>
          {searchable && (
            <div style={{ padding: '7px 8px', borderBottom: `1px solid ${C.border}` }}>
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                style={{ width: '100%', fontSize: 11.5, padding: '4px 8px', border: `1px solid ${C.border2}`, borderRadius: 6, outline: 'none', fontFamily: 'var(--font)', background: C.bg, boxSizing: 'border-box' }} />
            </div>
          )}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div onClick={() => { onChange(null); if (!multi) setOpen(false); setSearch('') }}
              style={{ padding: '8px 12px', fontSize: 11.5, cursor: 'pointer', color: C.t3, borderBottom: `1px solid ${C.border}` }}>
              All {label}
            </div>
            {filtered.map(o => {
              const on = isOn(o)
              return (
                <div key={o} onClick={() => { onChange(o); if (!multi) { setOpen(false); setSearch('') } }}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', fontSize: 11.5, cursor: 'pointer', color: on ? C.t1 : C.t2, fontWeight: on ? 700 : 400, background: on ? C.acl : 'transparent' }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = C.bg }}
                  onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent' }}>
                  {multi && (
                    <span style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0, border: `1.5px solid ${on ? C.acm : C.border2}`, background: on ? C.acm : C.card, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#1a1400', fontWeight: 900 }}>
                      {on ? '✓' : ''}
                    </span>
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{o}</span>
                </div>
              )
            })}
            {!filtered.length && <div style={{ padding: '10px 12px', fontSize: 11.5, color: C.t3 }}>No match</div>}
          </div>
        </div>
      )}
    </div>
  )
}



// Inline magnitude bar for a table cell — gives share-of-total a visual shape
// without spending a whole chart on it. Single hue: one series, one colour.
function ShareBar({ pct, children }) {
  const w = Math.max(0, Math.min(100, num(pct)))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center' }}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{children}</span>
      <span aria-hidden="true" style={{ width: 46, height: 5, borderRadius: 3, background: C.bg, flexShrink: 0, overflow: 'hidden' }}>
        <span style={{ display: 'block', width: w + '%', height: '100%', borderRadius: 3, background: SERIES.blue }} />
      </span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────
// Sum a set of cube rows into a totals object matching the API's `totals` shape.
function sumCube(rows) {
  const t = {}
  const add = (k, v) => { t[k] = (t[k] || 0) + (Number(v) || 0) }
  for (const r of rows) {
    add('n', r.n); add('cost', r.cost); add('charged_wt', r.wt); add('declared_wt', r.decl_wt)
    add('ship_value', r.value); add('surcharge', r.surcharge)
    add('overbilled_rows', r.over_n); add('overbilled_kg', r.over_kg); add('overbilled_cost', r.over_cost)
    add('rec_infl', r.rec_infl); add('rec_unexp', r.rec_unexp); add('reverse_n', r.reverse_n)
    add('rec_admit', r.rec_admit); add('rec_admit_n', r.rec_admit_n)
    add('slab_rows', r.slab_n); add('slab_excess_kg', r.slab_kg); add('slab_excess_cost', r.slab_cost)
    add('rc_entitled', r.rc_entitled); add('rc_carrier', r.rc_carrier); add('rc_total', r.rc_total)
    add('rc_entitled_allin', r.rc_entitled_allin); add('rc_carrier_allin', r.rc_carrier_allin)
    add('rc_entitled_surcharge', r.rc_entitled_surcharge); add('inv_addons', r.inv_addons)
    add('inv_freight', r.inv_freight); add('rc_priced', r.rc_priced)
    add('rc_over_n', r.rc_over_n); add('rc_over_cost', r.rc_over_cost)
    add('rc_infl_n', r.rc_infl_n); add('rc_infl_cost', r.rc_infl_cost)
    add('claimable_n', r.claimable_n); add('claimable_rs', r.claimable_rs)
    add('margin_killer_n', r.margin_killer_n); add('margin_killer_cost', r.margin_killer_cost)
  }
  return t
}

// Re-derive the byZone / byMode / byMonth / byCourier / byPay breakdown arrays
// from the cube rows, so charts still work after a client-side filter.
function cubeToBreakdowns(rows) {
  const acc = (map, key, r) => {
    if (!map[key]) map[key] = {}
    const add = (k, v) => { map[key][k] = (map[key][k] || 0) + (Number(v) || 0) }
    add('n', r.n); add('cost', r.cost); add('wt', r.wt); add('decl_wt', r.decl_wt)
    add('value', r.value); add('surcharge', r.surcharge)
    add('over_n', r.over_n); add('over_kg', r.over_kg); add('over_cost', r.over_cost)
    add('rec_infl', r.rec_infl); add('rec_unexp', r.rec_unexp); add('rec_admit', r.rec_admit)
    add('rec_admit_n', r.rec_admit_n); add('reverse_n', r.reverse_n)
    add('claimable_n', r.claimable_n); add('claimable_rs', r.claimable_rs)
    add('rc_entitled', r.rc_entitled); add('rc_carrier', r.rc_carrier)
  }
  const byZone = {}, byMode = {}, byMonth = {}, byCourier = {}, byPay = {}, byCourierMonth = {}
  const bySlab = {}, byBand = {}
  for (const r of rows) {
    if (r.zone)    acc(byZone,    r.zone,    r)
    if (r.mode)    acc(byMode,    r.mode,    r)
    if (r.month)   acc(byMonth,   r.month,   r)
    if (r.courier_name) acc(byCourier, r.courier_name, r)
    if (r.payment) acc(byPay,     r.payment, r)
    if (r.courier_name && r.month) acc(byCourierMonth, `${r.courier_name}|${r.month}`, r)
    if (r.slab != null) {
      const sk = String(r.slab)
      acc(bySlab, sk, r)
      // track per-mode cost/n for fwd/rev/rto averages
      if (!bySlab[sk]._mode) bySlab[sk]._mode = {}
      const md = bySlab[sk]._mode
      md[r.mode] = md[r.mode] || { n: 0, cost: 0 }
      md[r.mode].n += Number(r.n) || 0
      md[r.mode].cost += Number(r.cost) || 0
    }
    if (r.band) {
      acc(byBand, r.band, r)
      if (!byBand[r.band].dim) byBand[r.band].dim = 'band'
    }
  }
  const toArr = (map) => Object.entries(map).map(([key, v]) => ({ key, ...v }))
  // Shape slabCosts to match the format slabRows expects
  const slabCosts = Object.entries(bySlab).map(([slab, v]) => {
    const md = v._mode || {}
    const fwd = md['Forward'] || { n: 0, cost: 0 }
    const rev = md['Reverse'] || { n: 0, cost: 0 }
    const rto = md['RTO'] || { n: 0, cost: 0 }
    return {
      slab: Number(slab),
      n: v.n,
      cost: v.cost,
      avg_cost: v.n ? v.cost / v.n : 0,
      cpk: v.wt ? v.cost / v.wt : 0,
      fwd_avg: fwd.n ? fwd.cost / fwd.n : 0,
      rev_avg: rev.n ? rev.cost / rev.n : 0,
      rto_avg: rto.n ? rto.cost / rto.n : 0,
      claim_rs: v.claimable_rs || 0,
      claim_n: v.claimable_n || 0,
    }
  }).sort((a, b) => a.slab - b.slab)
  const byBandArr = toArr(byBand).map(r => ({ ...r, key: BAND_LABEL[r.key] || r.key }))
  return { byZone: toArr(byZone), byMode: toArr(byMode), byMonth: toArr(byMonth), byCourier: toArr(byCourier), byPay: toArr(byPay), byCourierMonth: toArr(byCourierMonth), slabCosts, byBand: byBandArr }
}

// Filters that can be satisfied purely from the cube (no API needed).
function isCubeFilter(f) {
  return !f.band && !f.destCity
}

// Apply cube-compatible filters to cube rows.
function filterCube(cube, f) {
  return cube.filter(r => {
    if (f.couriers?.length && !f.couriers.includes(r.courier_name)) return false
    if (f.zones?.length && !f.zones.includes(r.zone)) return false
    if (f.modes?.length && !f.modes.includes(r.mode)) return false
    if (f.months?.length && !f.months.includes(r.month)) return false
    if (f.payments?.length && !f.payments.includes(r.payment)) return false
    if (f.billing === 'overbilled' && !r.is_overbilled) return false
    if (f.billing === 'clean' && r.is_overbilled) return false
    return true
  })
}

// Mobile-only swipe carousel for hero KPI tiles — hidden on desktop via CSS class.
function CostKpiCarousel({ children }) {
  const count = Children.count(children)
  const scrollRef = useRef(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setActiveIdx(Math.min(count - 1, Math.round(el.scrollLeft / (el.offsetWidth * 0.72 + 10))))
  }, [count])
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [onScroll])
  return (
    <>
      {/* Mobile carousel */}
      <div className="cost-kpi-carousel-wrap" style={{ display: 'none' }}>
        <div ref={scrollRef} style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', paddingBottom: 4 }}
          className="cost-kpi-carousel-inner">
          {children}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 8 }}>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} style={{ width: i === activeIdx ? 16 : 6, height: 6, borderRadius: 3, background: i === activeIdx ? C.acc : C.border2, transition: 'all .2s' }} />
          ))}
        </div>
      </div>
      {/* Desktop grid — hidden on mobile */}
      <div className="cost-kpi-desktop-grid">
        {children}
      </div>
    </>
  )
}

export default function LogisticsCostPage({ externalFilters, setExternalFilters } = {}) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  const [agg, setAgg] = useState(null)
  const [b2bRows, setB2bRows] = useState(null)
  // B2B aggregates (lanes, transporters, months, freight types) for the B2B tab.
  const [b2b, setB2b] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const API = import.meta.env.VITE_API_URL || ''
  const [internalFilters, setInternalFilters] = useState(EMPTY_FILTERS)
  const filters = externalFilters || internalFilters
  const setFilters = setExternalFilters || setInternalFilters
  const [opts, setOpts] = useState({ months: [], zones: [], modes: [], payments: [], couriers: [], accountTypes: [], cities: [] })
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // 'all' = B2B + B2C summary · 'b2c' = courier detail · 'b2b' = lane-wise freight
  const [scope, setScope] = useState('all')
  const [reloadKey] = useState(0)

  // Raw full-dataset JSON — loaded once from CDN, never re-fetched for cube-compatible filters.
  const [baseData, setBaseData] = useState(null)

  const filterKey = JSON.stringify(filters)
  const scanRef = useRef(0)

  useEffect(() => {
    const ctl = new AbortController()
    const myRun = ++scanRef.current
    const f = JSON.parse(filterKey)

    // If the base data is loaded AND the filter can be handled by the cube, skip the API.
    if (baseData?.cube && isCubeFilter(f)) {
      const filtered = filterCube(baseData.cube, f)
      const totals = sumCube(filtered)
      // dt_*/dc_* come from refCache and are filter-independent — they are not in the cube
      // rows, so they must be carried over from the unfiltered base or they read as zero.
      const BASE_TOTALS = baseData.totals || {}
      const FILTER_INDEPENDENT_KEYS = ['dc_n', 'dc_ours', 'dc_theirs', 'dc_invoiced',
        'dc_weight_n', 'dc_rate_n', 'dt_ours', 'dt_theirs', 'dt_invoiced', 'dt_weight_n',
        'dt_rate_n', 'dt_weight_claim', 'dt_rate_claim']
      FILTER_INDEPENDENT_KEYS.forEach(k => { if (BASE_TOTALS[k] != null) totals[k] = BASE_TOTALS[k] })
      const breakdowns = cubeToBreakdowns(filtered)
      // Merge totals + breakdowns into the base response shape, preserving filter-independent fields.
      const merged = {
        ...baseData,
        totals,
        byZone: breakdowns.byZone,
        byMode: breakdowns.byMode,
        byMonth: breakdowns.byMonth,
        byCourier: breakdowns.byCourier,
        byPay: breakdowns.byPay,
        byCourierMonth: breakdowns.byCourierMonth,
        slabCosts: breakdowns.slabCosts,
        byBand: breakdowns.byBand,
      }
      setAgg(shapeResponse(merged))
      setLoading(false)
      return
    }

    ;(async () => {
      setLoading(true); setError(null)
      try {
        let j
        // Try CDN static file on first load (no filters set yet, or base not cached)
        const isDefaultFilters = !f.months?.length && !f.zones?.length && !f.modes?.length &&
          !f.payments?.length && !f.couriers?.length && !f.accountTypes?.length &&
          !f.band && !f.destCity && (!f.billing || f.billing === 'all')

        if (isDefaultFilters && !baseData) {
          const staticRes = await fetch('/logistics-cost-data.json', { signal: ctl.signal }).catch(() => null)
          if (staticRes?.ok) {
            const data = await staticRes.json()
            const age = data.asOf ? (Date.now() - new Date(data.asOf).getTime()) : Infinity
            if (age < 3 * 60 * 60 * 1000) { j = data }
          }
        }

        if (!j) {
          const res = await fetch(`${API}/api/logistics-cost`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: filterKey,
            signal: ctl.signal,
          })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error || `Server returned ${res.status}`)
          }
          j = await res.json()
        }

        if (scanRef.current !== myRun) return

        // Cache the full base response so future cube-compatible filters are instant.
        if (isDefaultFilters && j.cube) setBaseData(j)

        setAgg(shapeResponse(j))
        setB2bRows(j.b2b || [])
        setB2b({
          lanes: j.b2bLanes || [],
          totals: j.b2bTotals || { trips: 0, cost: 0 },
          transporters: j.b2bTrans || [],
          months: j.b2bMonths || [],
          types: j.b2bTypes || [],
        })
        if (j.options) {
          setOpts({
            months: j.options.months || [],
            zones: j.options.zones || [],
            modes: j.options.modes || [],
            payments: j.options.payments || [],
            couriers: j.options.couriers || [],
            accountTypes: j.options.account_types || [],
            cities: j.options.cities || [],
          })
        }
      } catch (e) {
        if (e.name === 'AbortError') return
        if (scanRef.current === myRun) setError(e.message || String(e))
      } finally {
        if (scanRef.current === myRun) setLoading(false)
      }
    })()

    return () => ctl.abort()
  }, [filterKey, API, reloadKey, baseData])

  // ── Derived views ──
  const kpis = useMemo(() => {
    if (!agg || !agg.n) return null
    const avgCost = agg.cost / agg.n
    const cpk = perKg(agg.cost, agg.chargedWt)
    const costPctValue = agg.shipValue > 0 ? (agg.cost / agg.shipValue) * 100 : null
    return {
      total: agg.cost,
      shipments: agg.n,
      avgCost,
      cpk,
      costPctValue,
      chargedWt: agg.chargedWt,
      weightGap: agg.chargedWt - agg.declaredWt,
      overbilledPct: (agg.overbilledRows / agg.n) * 100,
      overbilledCost: agg.overbilledCostEst,
      slabPct: (agg.slabRows / agg.n) * 100,
      slabExcessKg: agg.slabExcessKg,
      slabExcessCost: agg.slabExcessCost,
      slabBillable: agg.slabBillable,
      // No separate RTO figure: RTO now reports inside the Reverse bucket, so the
      // "Wasted Freight (Returns)" tile covers it via reverseBurden.
      surchargePct: agg.cost > 0 ? (agg.surcharge / agg.cost) * 100 : 0,
    }
  }, [agg])

  const monthSeries = useMemo(() => {
    if (!agg) return []
    const rows = Object.entries(agg.byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, b]) => ({
        month: monthLabel(m),
        raw: m,
        cost: b.cost,
        shipments: b.n,
        avgCost: b.n ? b.cost / b.n : 0,
        cpk: perKg(b.cost, b.wt) ?? 0,
        wt: b.wt,
        pctGmv: b.value > 0 ? (b.cost / b.value) * 100 : null,
        claim: b.claimableRs || 0,
        surchargePct: b.cost > 0 ? (b.surcharge / b.cost) * 100 : 0,
      }))
    // No indexing: the trend chart plots native ₹, so there is nothing to normalise.
    return rows
  }, [agg])

  // Window for the Monthly Trend chart: 1, 3 or 6 months back, or everything.
  const [trendMonths, setTrendMonths] = useState(6)

  const trendRows = useMemo(() => monthSeries, [monthSeries])

  // The chart and its table both read this — the last N periods of the filtered series.
  const trendWindow = useMemo(
    () => (trendMonths >= 999 ? trendRows : trendRows.slice(-trendMonths)),
    [trendRows, trendMonths]
  )

  // Ordered zone axis, so the ordinal ramp maps light→dark onto A→E consistently.
  const zoneOrder = useMemo(() => {
    if (!agg) return []
    return Object.keys(agg.byZone).sort((a, b) => {
      const ia = ZONES.indexOf(a), ib = ZONES.indexOf(b)
      if (ia === -1 && ib === -1) return a.localeCompare(b)
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
  }, [agg])

  const zoneRows = useMemo(() => {
    if (!agg) return []
    return Object.entries(agg.byZone)
      .map(([zone, b]) => ({
        zone,
        shipments: b.n,
        cost: b.cost,
        avgCost: b.n ? b.cost / b.n : 0,
        cpk: perKg(b.cost, b.wt),
        avgWt: b.n ? b.wt / b.n : 0,
        overPct: b.n ? (b.overN / b.n) * 100 : 0,
        share: agg.cost ? (b.cost / agg.cost) * 100 : 0,
      }))
      .sort((a, b) => {
        const ia = ZONES.indexOf(a.zone), ib = ZONES.indexOf(b.zone)
        if (ia === -1 && ib === -1) return 0
        if (ia === -1) return 1
        if (ib === -1) return -1
        return ia - ib
      })
  }, [agg])


  const modeRows = useMemo(() => {
    if (!agg) return []
    return Object.entries(agg.byMode)
      .map(([mode, b]) => ({
        mode, shipments: b.n, cost: b.cost,
        avgCost: b.n ? b.cost / b.n : 0,
        share: agg.cost ? (b.cost / agg.cost) * 100 : 0,
      }))
      .sort((a, b) => b.cost - a.cost)
  }, [agg])

  const courierRows = useMemo(() => {
    if (!agg) return []
    // Claimable weight overbilling per courier, keyed for lookup below.
    const claimBy = new Map((agg.courierDisputes || []).map(d => [d.courier_name, d]))
    return Object.entries(agg.byCourier)
      .map(([courier, b]) => ({
        courier, shipments: b.n, cost: b.cost,
        avgCost: b.n ? b.cost / b.n : 0,
        cpk: perKg(b.cost, b.wt),
        overPct: b.n ? (b.overN / b.n) * 100 : 0,
        // Recoverable split by cause — the two need different remedies.
        recInfl: b.recInfl, recUnexp: b.recUnexp,
        // Subset of recInfl the courier has conceded in writing — never added on top.
        recAdmit: b.recAdmit, recAdmitN: b.recAdmitN,
        recTotal: b.recInfl + b.recUnexp,
        // Reverse-leg share: an operational-quality signal, not a cost one.
        reversePct: b.n ? (b.reverseN / b.n) * 100 : 0,
        // Weight-only claim on the total-cost basis, so this column reconciles with the
        // headline figure. recInfl above is base freight and stays for the stacked chart.
        claimRs: Number(claimBy.get(courier)?.weight_rs) || 0,
      }))
      .sort((a, b) => b.cost - a.cost)
  }, [agg])

  // ── Rate drift ──
  // Pivot (month, courier, cpk) into one row per month with a column per courier, which
  // is the shape a multi-line chart needs. Couriers are ordered by spend so the biggest
  // ones take the leading colour slots.
  // Rate drift derived from byCourierMonth — filter-responsive.
  const driftCouriers = useMemo(() => {
    const rows = agg?.byCourierMonth || []
    if (!rows.length) return []
    const spend = {}
    for (const r of rows) {
      const courier = r.key.split('|')[0]
      spend[courier] = (spend[courier] || 0) + (Number(r.n) || 0)
    }
    return Object.keys(spend).sort((a, b) => spend[b] - spend[a]).slice(0, DRIFT_COLORS.length)
  }, [agg])

  const driftSeries = useMemo(() => {
    const rows = agg?.byCourierMonth || []
    if (!rows.length) return []
    const byMonth = {}
    for (const r of rows) {
      const [courier, month] = r.key.split('|')
      if (!driftCouriers.includes(courier)) continue
      const cpk = r.wt ? r.cost / r.wt : 0
      byMonth[month] ??= { month: monthLabel(month), raw: month }
      byMonth[month][courier] = cpk
    }
    return Object.values(byMonth).sort((a, b) => a.raw.localeCompare(b.raw))
  }, [agg, driftCouriers])

  const driftRows = useMemo(() => {
    const rows = agg?.byCourierMonth || []
    if (!rows.length) return []
    const by = {}
    for (const r of rows) {
      const [courier, month] = r.key.split('|')
      const cpk = r.wt ? r.cost / r.wt : 0;
      (by[courier] ??= []).push({ m: month, cpk })
    }
    return Object.entries(by)
      .map(([courier, pts]) => {
        pts.sort((a, b) => a.m.localeCompare(b.m))
        const first = pts[0].cpk, last = pts[pts.length - 1].cpk
        return {
          courier, first, last, months: pts.length,
          drift: first ? ((last - first) / first) * 100 : 0,
        }
      })
      .sort((a, b) => b.drift - a.drift)
  }, [agg])

  // Couriers ranked by what is recoverable from them, for the cause-split chart.
  // Pre-computed per-slab costs. Filter-independent, like the trend and the rate grid, so it
  // reads straight from the payload rather than re-aggregating on every render.
  const slabRows = useMemo(() => (agg?.slabCosts || []).map(r => ({
    slab: Number(r.slab),
    n: num(r.n),
    cost: num(r.cost),
    avgCost: num(r.avg_cost),
    cpk: num(r.cpk),
    fwdAvg: num(r.fwd_avg),
    revAvg: num(r.rev_avg),
    rtoAvg: num(r.rto_avg),
    claimRs: num(r.claim_rs),
    claimN: num(r.claim_n),
  })),
  // Every slab, no threshold. A cost table should account for all the spend: an n>=1000
  // filter hid 120 of 139 slabs and 13% of it, including a 104 kg slab worth ₹10.45 L. The
  // card scrolls, so extra rows are cheap; a silently missing row is not.
  [agg])

  // Courier spend with claim intensity — derived from byCourier (filter-responsive).
  const courierSpendRows = useMemo(() => {
    return Object.entries(agg?.byCourier || {})
      .map(([courier, b]) => {
        const spend = num(b.cost)
        const cl = num(b.rec_infl)
        return { courier, spend, claim: cl, claimPct: spend ? (cl / spend) * 100 : 0 }
      })
      .sort((a, b) => b.spend - a.spend)
  }, [agg])

  // Escalation priority derived from byCourier (filter-responsive).
  const recoverRows = useMemo(
    () => Object.entries(agg?.byCourier || {})
      .map(([courier, b]) => {
        const recInfl = num(b.rec_infl)
        const recUnexp = num(b.rec_unexp)
        const recAdmit = num(b.rec_admit)
        const recTotal = recInfl + recUnexp
        const shipments = num(b.n)
        const disputedN = num(b.claimable_n)
        return {
          courier,
          recInfl, recUnexp, recAdmit, recTotal,
          shipments, disputedN,
          recPerShipment: disputedN ? recInfl / disputedN : 0,
          recPctFreight: num(b.cost) ? (recInfl / num(b.cost)) * 100 : 0,
        }
      })
      .filter(r => r.recInfl > 0 || r.recUnexp > 0)
      .sort((a, b) => b.recInfl - a.recInfl),
    [agg]
  )

  // Section totals, so the header states the prize before the reader parses eight rows.
  const recoverTotals = useMemo(() => {
    const s = recoverRows.reduce((a, r) => ({
      infl: a.infl + r.recInfl, unexp: a.unexp + r.recUnexp,
      admit: a.admit + r.recAdmit, total: a.total + r.recTotal,
    }), { infl: 0, unexp: 0, admit: 0, total: 0 })
    // Concentration: how much of the claim sits with the top two partners. Two
    // conversations recovering most of the money is the practical plan.
    const top2 = recoverRows.slice(0, 2).reduce((a, r) => a + r.recTotal, 0)
    return { ...s, top2, top2Pct: s.total ? (top2 / s.total) * 100 : 0 }
  }, [recoverRows])

  // Like-for-like: pick one (zone, slab) cell and compare couriers inside it. Holding
  // both constant is the only fair basis for a switching decision — a raw per-shipment
  // average just reflects whose parcels are heavier.
  // ── Like-for-like: three independent multi-select filters ──
  // Replaces a single dropdown over pre-joined (zone · band) cells. That forced the
  // comparison into exactly one zone and one slab, so questions like "cheapest across all
  // metro zones for parcels under 2 kg" were unanswerable.
  const lflOptions = useMemo(() => {
    const z = new Set(), b = new Set(), l = new Set(), sl = new Set()
    for (const r of agg?.likeForLike || []) {
      z.add(r.zone); b.add(r.band); l.add(r.leg)
      if (r.slab != null) sl.add(Number(r.slab))
    }
    // Bands are weight ranges, so they must sort by weight and not as text.
    const bandOrder = ['0 – 1 kg', '1 – 2 kg', '2 – 5 kg', '5 – 10 kg', '10 kg +']
    // Legs follow the shipment's lifecycle, not the alphabet — alphabetical would read
    // Forward, RTO, Reverse and put the undelivered return before the customer return.
    const legOrder = ['Forward', 'Reverse', 'RTO']
    return {
      zones: [...z].sort(),
      bands: [...b].sort((x, y) => bandOrder.indexOf(x) - bandOrder.indexOf(y)),
      legs: [...l].sort((x, y) => {
        const ix = legOrder.indexOf(x), iy = legOrder.indexOf(y)
        return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy)
      }),
      // Exact billable slabs, numeric-sorted. Far too many to expose as chips, which is
      // why this one is a dropdown while the coarse bands stay as chips.
      slabs: [...sl].sort((x, y) => x - y),
    }
  }, [agg])

  const [lflZones, setLflZones] = useState([])
  const [lflBands, setLflBands] = useState([])
  const [lflLegs, setLflLegs] = useState([])
  const [lflSlab, setLflSlab] = useState('')
  const [subQuery, setSubQuery] = useState('')
  // Collapsed sections, persisted so the layout a user settles on survives a reload.
  const [slabSearch, setSlabSearch] = useState('')
  const [catTooltip, setCatTooltip] = useState('')
  const [secHid, setSecHid] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lc-sections') || '{}') } catch { return {} }
  })
  const toggleSec = key => setSecHid(prev => {
    const next = { ...prev, [key]: !prev[key] }
    try { localStorage.setItem('lc-sections', JSON.stringify(next)) } catch { /* private mode */ }
    return next
  })

  // Empty selection means "all", so the card renders something on first paint instead of
  // an empty state that looks broken.
  const pick = (sel, all) => (sel.length ? sel : all)

  const activeCell = useMemo(() => {
    const rows = agg?.likeForLike || []
    if (!rows.length) return { rows: [], comparable: false, n: 0, zones: [], bands: [], legs: [] }
    const zs = pick(lflZones, lflOptions.zones)
    const bs = pick(lflBands, lflOptions.bands)
    const ls = pick(lflLegs, lflOptions.legs)

    // Re-aggregate across every selected cell rather than reading one pre-built cell.
    // Weighted by shipment count: a straight mean of cell averages would let a 60-shipment
    // cell pull the number as hard as a 60,000-shipment one.
    const byCourier = new Map()
    for (const r of rows) {
      if (!zs.includes(r.zone) || !bs.includes(r.band) || !ls.includes(r.leg)) continue
      // An exact slab overrides the coarse band when one is picked. '' means unset, so
      // the band chips keep working on their own.
      if (lflSlab !== '' && Number(r.slab) !== Number(lflSlab)) continue
      const n = Number(r.n) || 0
      const c = byCourier.get(r.courier_name)
        || { courier: r.courier_name, n: 0, cost: 0, kg: 0 }
      c.n += n
      c.cost += (Number(r.avg_cost) || 0) * n
      // cpk is cost/kg, so cost/cpk recovers the kilograms behind it — needed to re-derive
      // a weighted ₹/kg across cells without the API returning raw weight.
      const cpk = Number(r.cpk) || 0
      if (cpk > 0) c.kg += ((Number(r.avg_cost) || 0) * n) / cpk
      byCourier.set(r.courier_name, c)
    }

    const out = [...byCourier.values()]
      .filter(c => c.n > 0)
      .map(c => ({ courier: c.courier, n: c.n, avgCost: c.cost / c.n, cpk: c.kg > 0 ? c.cost / c.kg : 0 }))
      .sort((a, b) => a.avgCost - b.avgCost)

    // A single courier is still worth showing — it just is not a comparison.
    const comparable = out.length >= 2
    return {
      rows: out,
      comparable,
      n: out.reduce((s, c) => s + c.n, 0),
      zones: zs, bands: bs, legs: ls,
      slab: lflSlab,
      allZones: zs.length === lflOptions.zones.length,
      allBands: bs.length === lflOptions.bands.length,
      allLegs: ls.length === lflOptions.legs.length,
    }
  }, [agg, lflZones, lflBands, lflLegs, lflSlab, lflOptions])

  // ── Cost by product ──
  // Categories are collapsed by default: 15 categories expand to ~200 sub-category rows,
  // which buries the signal. Expanding is per-category and additive.
  const [openCats, setOpenCats] = useState(() => new Set())
  const toggleCat = useCallback(name => setOpenCats(prev => {
    const next = new Set(prev)
    next.has(name) ? next.delete(name) : next.add(name)
    return next
  }), [])

  // Cost to serve one product: forward + reverse + RTO, each scaled by how often it happens
  // (return count ÷ forward count). Forward is the denominator because every order has one;
  // returns are the exception at 3-21% depending on the category.
  // A missing leg contributes 0 rather than nulling the whole figure — a category with no
  // RTO history genuinely costs nothing in RTO.
  // useCallback so productRows' useMemo has a stable dependency — a fresh function each
  // render would defeat the memo and rebuild ~200 rows on every keystroke elsewhere.
  const costToServe = useCallback(c => {
    const f = num(c.fwd_avg), r = num(c.rev_avg), t = num(c.rto_avg)
    const fn = num(c.fwd_n), rn = num(c.rev_n), tn = num(c.rto_n)
    if (!(f > 0)) return { ctsReal: null }
    return { ctsReal: fn > 0 ? f + r * (rn / fn) + t * (tn / fn) : null }
  }, [])

  // Flat row list with the open sub-categories spliced in beneath their parent, so one
  // DataTable renders the whole tree.
  const productRows = useMemo(() => {
    // A matching sub-category must surface even when its parent is collapsed, so the
    // search expands the parent rather than filtering rows after the fact.
    const sq = subQuery.trim().toLowerCase()
    const hit = s => String(s?.sub ?? '').toLowerCase().includes(sq)
    const out = []
    for (const c of agg?.byProduct || []) {
      const fwd = num(c.fwd_avg)
      const kids = c.children || []
      // Resolve the search first: the parent header must not be emitted for a category
      // with no matching child, or the filtered list still shows all ~30 categories.
      const kidHits = sq ? kids.filter(hit) : null
      const catHit = sq ? String(c.cat).toLowerCase().includes(sq) : false
      if (sq && !catHit && !kidHits.length) continue
      out.push({
        label: c.cat, isSub: false, hasKids: kids.length > 0, open: openCats.has(c.cat),
        n: num(c.n), fwd, rev: num(c.rev_avg), rto: num(c.rto_avg),
        ...costToServe(c),
        cw: num(c.cw_slab_avg), masterKg: num(c.master_kg), masterSlab: num(c.master_slab),
        vw: num(c.vw_avg), cost: num(c.cost),
      })
      // A category matched by name shows all its children; otherwise only the matching
      // ones. With no search active, honour the manual open/closed state.
      if (!sq && !openCats.has(c.cat)) continue
      for (const s of [...(catHit ? kids : (kidHits || kids))].sort((a, b) => num(b.cost) - num(a.cost))) {
        const sf = num(s.fwd_avg)
        out.push({
          label: s.sub, isSub: true, hasKids: false,
          n: num(s.n), fwd: sf, rev: num(s.rev_avg), rto: num(s.rto_avg),
          ...costToServe(s),
          cw: num(s.cw_slab_avg), masterKg: num(s.master_kg), masterSlab: num(s.master_slab),
          vw: num(s.vw_avg), cost: num(s.cost),
        })
      }
    }
    return out
  }, [agg, openCats, costToServe, subQuery])


  // Weight slab is where rate-card leakage usually hides — a slab whose ₹/kg is
  // out of line with its neighbours is a rounding or slab-boundary problem.
  const bandRows = useMemo(() => {
    if (!agg) return []
    const order = WEIGHT_BANDS.map(b => b.label)
    return Object.entries(agg.byBand)
      .map(([band, b]) => ({
        band,
        shipments: b.n,
        cost: b.cost,
        avgCost: b.n ? b.cost / b.n : 0,
        cpk: perKg(b.cost, b.wt),
        overPct: b.n ? (b.overN / b.n) * 100 : 0,
        share: agg.cost ? (b.cost / agg.cost) * 100 : 0,
      }))
      .sort((a, b) => order.indexOf(a.band) - order.indexOf(b.band))
  }, [agg])

  const mom = useMemo(() => {
    if (monthSeries.length < 2) return null
    return { curr: monthSeries[monthSeries.length - 1], prev: monthSeries[monthSeries.length - 2] }
  }, [monthSeries])

  // Stacked deltas on the hero, like the Sales page's WoW/MoM/YoY badges. Freight cost
  // is a cost, so DOWN is good — the colour follows that, not the arrow direction.
  const heroDeltas = useMemo(() => {
    const out = []
    const push = (curr, prev, note) => {
      if (prev == null || !prev || curr == null) return
      const pct = ((curr - prev) / Math.abs(prev)) * 100
      if (!isFinite(pct)) return
      out.push({ pct, up: pct > 0, good: pct < 0, note })
    }
    if (mom) push(mom.curr.cost, mom.prev.cost, 'MoM')
    // Same month a year earlier, when the ledger reaches back that far.
    if (mom) {
      const [y, m] = String(mom.curr.raw).split('-')
      const yoyKey = `${Number(y) - 1}-${m}`
      const yoy = monthSeries.find(s => s.raw === yoyKey)
      if (yoy) push(mom.curr.cost, yoy.cost, 'YoY')
    }
    return out
  }, [mom, monthSeries])

  // Reverse legs (RTO + Reverse/RVP/DTO) carry cost with no revenue against them, so
  // management reads them as one burden rather than two separate modes.
  const reverseBurden = useMemo(() => {
    if (!agg) return { cost: 0, pct: 0, n: 0 }
    let cost = 0, n = 0
    for (const [mode, b] of Object.entries(agg.byMode)) {
      if (mode === 'Forward') continue
      cost += b.cost; n += b.n
    }
    return { cost, n, pct: agg.cost ? (cost / agg.cost) * 100 : 0 }
  }, [agg])

  // Billing Accuracy runs on TOTAL COST. The ledger has the courier's total_cost but no
  // Frido equivalent, so the entitlement comes from the derived rate card: each cell's
  // freight grossed up by that cell's own measured surcharge rate.
  // GREATEST(...,0) on each leg — a courier billing BELOW its own card is not an overcharge,
  // and letting it go negative would net off real overbilling elsewhere.
  const billingGap = useMemo(() => {
    // WEIGHT ONLY is the claim. The rate component — the courier billing above its own
    // card — is measured against a card DERIVED from those same invoices, so it detects
    // inconsistency with their own average behaviour rather than a breach of the signed
    // contract. It is not invoiceable, so it is reported separately as a diagnostic and
    // never summed into the claimable figure.
    //
    // Per-ROW clamped: clamping the grand total would let shipments billed BELOW card
    // cancel those billed above it, a netting no courier would accept since the
    // under-billed parcels cannot be claimed back.
    const weight = agg?.dtWeightClaim || 0
    const rate = agg?.dtRateClaim || 0
    const billed = agg?.dtInvoiced || 0
    return {
      weight,
      rate,
      total: weight,
      pctOfBilled: billed ? (weight / billed) * 100 : 0,
    }
  }, [agg])

  // ── B2B derived views ──
  const b2bLaneRows = useMemo(() => {
    if (!b2b) return []
    return b2b.lanes.map(l => ({
      lane: l.lane,
      origin: l.origin_location,
      dest: l.destination_location,
      trips: Number(l.trips) || 0,
      cost: Number(l.cost) || 0,
      avgCost: Number(l.avg_cost) || 0,
      minCost: Number(l.min_cost) || 0,
      maxCost: Number(l.max_cost) || 0,
      // Spread between cheapest and dearest trip on the same lane — a wide spread on a
      // high-volume lane is the clearest sign of inconsistent rating.
      spread: Number(l.max_cost) - Number(l.min_cost),
      share: b2b.totals.cost ? (Number(l.cost) / Number(b2b.totals.cost)) * 100 : 0,
    }))
  }, [b2b])

  const b2bTransRows = useMemo(() => {
    if (!b2b) return []
    const total = Number(b2b.totals.cost) || 0
    return b2b.transporters.map(t => ({
      key: t.key, trips: Number(t.trips) || 0, cost: Number(t.cost) || 0,
      avgCost: Number(t.avg_cost) || 0,
      share: total ? (Number(t.cost) / total) * 100 : 0,
    }))
  }, [b2b])

  const b2bTypeRows = useMemo(() => {
    if (!b2b) return []
    const total = Number(b2b.totals.cost) || 0
    return b2b.types.map(t => ({
      key: t.key, trips: Number(t.trips) || 0, cost: Number(t.cost) || 0,
      avgCost: Number(t.avg_cost) || 0,
      share: total ? (Number(t.cost) / total) * 100 : 0,
    }))
  }, [b2b])

  const b2bMonthRows = useMemo(() => {
    if (!b2b) return []
    return b2b.months.map(m => ({
      month: monthLabel(m.key), raw: m.key,
      trips: Number(m.trips) || 0, cost: Number(m.cost) || 0,
    }))
  }, [b2b])

  // ── Overall: B2C + B2B side by side ──
  // Deliberately additive only. The two ledgers bill on different units (parcels vs
  // trips), so a blended "cost per shipment" across both would be meaningless — the
  // summary reports each stream and their sum, never a fake combined unit rate.
  const overall = useMemo(() => {
    if (!agg || !b2b) return null
    const b2cCost = agg.cost
    const b2bCost = Number(b2b.totals.cost) || 0
    const total = b2cCost + b2bCost
    return {
      total,
      b2cCost, b2bCost,
      b2cShare: total ? (b2cCost / total) * 100 : 0,
      b2bShare: total ? (b2bCost / total) * 100 : 0,
      b2cUnits: agg.n,
      b2bUnits: Number(b2b.totals.trips) || 0,
      b2bLanes: Number(b2b.totals.lanes) || 0,
      b2bTransporters: Number(b2b.totals.transporters) || 0,
      streams: [
        { name: 'B2C · courier parcels', cost: b2cCost, units: agg.n, unitLabel: 'shipments', color: SERIES.blue },
        { name: 'B2B · transporter freight', cost: b2bCost, units: Number(b2b.totals.trips) || 0, unitLabel: 'trips', color: SERIES.orange },
      ],
    }
  }, [agg, b2b])

  // Monthly cost for both streams on one ₹ axis — same unit, so this is a fair overlay.
  const overallMonths = useMemo(() => {
    if (!monthSeries.length && !b2bMonthRows.length) return []
    const keys = [...new Set([...monthSeries.map(m => m.raw), ...b2bMonthRows.map(m => m.raw)])].sort()
    const b2cBy = Object.fromEntries(monthSeries.map(m => [m.raw, m.cost]))
    const b2bBy = Object.fromEntries(b2bMonthRows.map(m => [m.raw, m.cost]))
    return keys.map(k => ({
      month: monthLabel(k), raw: k,
      b2c: b2cBy[k] || 0,
      b2b: b2bBy[k] || 0,
      total: (b2cBy[k] || 0) + (b2bBy[k] || 0),
    }))
  }, [monthSeries, b2bMonthRows])

  const toggleIn = (key, val) =>
    setFilters(f => ({ ...f, [key]: f[key].includes(val) ? f[key].filter(x => x !== val) : [...f[key], val] }))
  const setOne = (key, val) => setFilters(f => ({ ...f, [key]: val }))

  const activeCount =
    filters.months.length + filters.zones.length + filters.modes.length +
    filters.payments.length + filters.couriers.length + filters.accountTypes.length +
    (filters.band ? 1 : 0) + (filters.destCity ? 1 : 0) + (filters.billing !== 'all' ? 1 : 0)

  // ── Render ──
  // Hero sub-line: volume, weight, and freight as a share of GMV. The GMV percentage had
  // its own tile, but it is a property of total cost — reading it beside the rupee figure
  // it divides is clearer than as a standalone number.
  // Two lines, GMV share first: it is the ratio that judges the rupee figure above it, so it
  // earns its own line. Volume and weight are supporting counts and sit together below.
  const heroSub = !kpis ? null : (
    <>
      {kpis.costPctValue != null && <div>{kpis.costPctValue.toFixed(2)}% of GMV</div>}
      <div>{fmtBig(kpis.shipments)} invoices · {fmtKg(kpis.chargedWt)} billed</div>
    </>
  )

  const sidebar = (
    <div style={{ width: sidebarOpen ? 220 : 0, minWidth: sidebarOpen ? 220 : 0, transition: 'width .25s ease, min-width .25s ease', overflow: 'hidden', borderRight: `1px solid ${C.border}`, background: C.card, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* The column scrolls, so nothing inside it should ever be compressed to fit —
          `> * { flex-shrink: 0 }` keeps every control at its natural height instead of
          letting the last ones collapse into slivers. */}
      <div style={{ width: 220, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 9, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}
        className="lc-slicers">

        {/* Courier partners as logo rows, matching the Performance sidebar. */}
        <div style={{ fontSize: 10, fontWeight: 800, color: C.t3, letterSpacing: '.06em', textTransform: 'uppercase' }}>Courier Partner</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {opts.couriers.map(c => (
            <CourierRow key={c} label={c} active={filters.couriers.includes(c)} onClick={() => toggleIn('couriers', c)} />
          ))}
          {filters.couriers.length > 0 && (
            <button onClick={() => setOne('couriers', [])}
              style={{ fontSize: 11, color: C.t3, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font)', marginTop: 4 }}>
              ✕ Clear
            </button>
          )}
        </div>

        <div style={{ height: 1, background: C.border, margin: '4px 0' }} />

        {/* Two-up segmented pairs, the same treatment as Courier Direction. */}
        {/* Two separate filters, so two separate headings — one block labelled
            "Shipment Direction" was covering both direction AND billing status.
            The mode pair also offered only Forward/RTO, which silently excluded the
            40,284 Reverse shipments; it now uses the same three collapsed legs the
            chart shows, as a chip row since there are three options rather than two. */}
        <div style={{ fontSize: 10, fontWeight: 800, color: C.t3, letterSpacing: '.06em', textTransform: 'uppercase' }}>Shipment Leg</div>
        <ChipRow options={opts.modes} selected={filters.modes} onToggle={v => toggleIn('modes', v)} />

        <div style={{ fontSize: 10, fontWeight: 800, color: C.t3, letterSpacing: '.06em', textTransform: 'uppercase', marginTop: 4 }}>Billing Status</div>
        <SegPair
          value={filters.billing === 'all' ? null : filters.billing}
          onChange={v => setOne('billing', v || 'all')}
          options={[{ value: 'overbilled', label: 'Overbilled' }, { value: 'clean', label: 'Clean' }]} />

        <div style={{ height: 1, background: C.border, margin: '4px 0' }} />

        {/* Everything else as full-width labelled dropdowns under one FILTERS heading. */}
        <div style={{ fontSize: 10, fontWeight: 800, color: C.t3, letterSpacing: '.06em', textTransform: 'uppercase' }}>Filters</div>

        <SearchSelect label="Billing Period" options={opts.months} multi
          selected={filters.months}
          onChange={v => (v === null ? setOne('months', []) : toggleIn('months', v))} />

        <SearchSelect label="Zone" options={opts.zones} multi
          selected={filters.zones}
          onChange={v => (v === null ? setOne('zones', []) : toggleIn('zones', v))} />

        <SearchSelect label="Payment" options={opts.payments} multi
          selected={filters.payments}
          onChange={v => (v === null ? setOne('payments', []) : toggleIn('payments', v))} />

        <SearchSelect label="Service Type" options={opts.accountTypes} multi
          selected={filters.accountTypes}
          onChange={v => (v === null ? setOne('accountTypes', []) : toggleIn('accountTypes', v))} />

        {/* No "Shipment Mode" dropdown here — the Shipment Leg chips above are the same
            filter, and two controls writing one piece of state is a bug waiting to
            confuse someone. */}
        <SearchSelect label="Weight Slab" options={WEIGHT_BANDS.map(b => b.label)}
          value={filters.band ? WEIGHT_BANDS.find(b => b.key === filters.band)?.label : null}
          onChange={label => {
            if (label === null) return setOne('band', null)
            const b = WEIGHT_BANDS.find(x => x.label === label)
            setOne('band', b ? b.key : null)
          }} />

        <SearchSelect label="Drop City" options={opts.cities}
          value={filters.destCity} onChange={v => setOne('destCity', v)} />

        {activeCount > 0 && (
          <button onClick={() => setFilters(EMPTY_FILTERS)}
            style={{ fontSize: 11, color: C.t3, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'var(--font)', marginTop: 2 }}>
            ✕ Clear All ({activeCount})
          </button>
        )}
      </div>
    </div>
  )

  let content
  if (error) {
    content = (
      <Card title="Could not load cost ledger">
        <div style={{ fontSize: 12.5, color: C.red.tx, marginBottom: 8 }}>{error}</div>
        <div style={{ fontSize: 12, color: C.t3 }}>
          This tab reads <code>{B2C}</code> from Supabase. Check that the table exists and is readable.
        </div>
      </Card>
    )
  } else if (loading && !agg) {
    content = (
      <Card title="Loading cost ledger…" note="aggregating on the server">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 74, borderRadius: 11, background: C.bg }} />
          ))}
        </div>
      </Card>
    )
  } else if ((!agg || !agg.n) && scope !== 'b2b') {
    // The B2B tab reads a different table, so an empty B2C result must not blank it.
    content = (
      <Card title="No matching invoices">
        <div style={{ fontSize: 12.5, color: C.t2 }}>
          {activeCount > 0
            ? 'No rows match the current slicers. Try clearing one or more filters.'
            : <>Nothing has been uploaded to <code>{B2C}</code> yet. Add bills from the <strong>Logistics Bill Ledger</strong> page and they will appear here.</>}
        </div>
        {activeCount > 0 && (
          <button onClick={() => setFilters(EMPTY_FILTERS)}
            style={{ marginTop: 10, fontSize: 11.5, background: C.acc, border: 'none', borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}>
            Clear all filters
          </button>
        )}
      </Card>
    )
  } else if (scope === 'all') {
    // ── OVERALL: B2B + B2C combined ──
    content = !overall ? <Card title="Loading summary…" /> : (
      <>
        <SectionHdr title="Combined Freight Spend" note="B2C courier + B2B transporter" />
        {/* Desktop layout */}
        <div className="cost-kpi-desktop-grid" style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
          <Hero label="Total Logistics Cost" value={fmt(overall.total)}
            sub={`${fmtN(overall.b2cUnits)} parcels + ${fmtN(overall.b2bUnits)} freight trips`} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 10 }}>
            <Tile label="B2C Courier Spend" value={fmt(overall.b2cCost)} sub={`${overall.b2cShare.toFixed(1)}% of total`} />
            <Tile label="B2B Freight Spend" value={fmt(overall.b2bCost)} sub={`${overall.b2bShare.toFixed(1)}% of total`} />
            <Tile label="B2C Shipments" value={fmtBig(overall.b2cUnits)} sub={'avg ₹' + (overall.b2cCost / (overall.b2cUnits || 1)).toFixed(2) + ' / parcel'} />
            <Tile label="B2B Trips" value={fmtN(overall.b2bUnits)} sub={'avg ' + fmt(overall.b2bCost / (overall.b2bUnits || 1)) + ' / trip'} />
            <Tile label="Recoverable (B2C)" value={fmt(kpis.overbilledCost)} sub="weight overbilling" accent={C.red.tx} />
            <Tile label="B2B Lanes" value={fmtN(overall.b2bLanes)} sub={`${overall.b2bTransporters} transporters`} />
            <Tile label="Freight as % of GMV" value={kpis.costPctValue != null ? kpis.costPctValue.toFixed(2) + '%' : '—'} sub="B2C declared value" />
            <Tile label="Billing Periods" value={fmtN(overallMonths.length)} sub={overallMonths.length ? `${overallMonths[0].month} – ${overallMonths[overallMonths.length - 1].month}` : null} />
          </div>
        </div>
        {/* Mobile carousel */}
        <div className="cost-kpi-carousel-wrap" style={{ display: 'none' }}>
          <CostKpiCarousel>
            {[
              { label: 'Total Logistics Cost', value: fmt(overall.total), sub: `${fmtBig(overall.b2cUnits)} parcels` },
              { label: 'B2C Courier Spend', value: fmt(overall.b2cCost), sub: `${overall.b2cShare.toFixed(1)}% of total` },
              { label: 'B2B Freight Spend', value: fmt(overall.b2bCost), sub: `${overall.b2bShare.toFixed(1)}% of total` },
              { label: 'B2C Shipments', value: fmtBig(overall.b2cUnits), sub: 'avg ₹' + (overall.b2cCost / (overall.b2cUnits || 1)).toFixed(2) + ' / parcel' },
              { label: 'B2B Trips', value: fmtN(overall.b2bUnits), sub: 'avg ' + fmt(overall.b2bCost / (overall.b2bUnits || 1)) + ' / trip' },
              { label: 'Recoverable (B2C)', value: fmt(kpis.overbilledCost), sub: 'weight overbilling', accent: C.red.tx },
              { label: 'Freight as % of GMV', value: kpis.costPctValue != null ? kpis.costPctValue.toFixed(2) + '%' : '—', sub: 'B2C declared value' },
              { label: 'B2B Lanes', value: fmtN(overall.b2bLanes), sub: `${overall.b2bTransporters} transporters` },
            ].map(t => (
              <div key={t.label} style={{ minWidth: '70vw', maxWidth: '70vw', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', boxSizing: 'border-box', scrollSnapAlign: 'start', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, letterSpacing: '.05em', textTransform: 'uppercase' }}>{t.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: t.accent || C.t1, lineHeight: 1.15 }}>{t.value}</div>
                {t.sub && <div style={{ fontSize: 11, color: C.t3 }}>{t.sub}</div>}
              </div>
            ))}
          </CostKpiCarousel>
        </div>

        <SectionHdr title="Stream Split" note="the two ledgers bill different units, so they are reported separately" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 14 }}>
          <Card title="Cost by stream">
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overall.streams} layout="vertical" margin={{ top: 10, right: 18, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke={VIZ.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: VIZ.muted }} axisLine={false} tickLine={false}
                    tickFormatter={v => fmt(v)} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: VIZ.muted }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(11,11,11,0.04)' }} content={<ChartTooltip formatter={v => fmt(v)} />} />
                  <Bar dataKey="cost" name="Cost" radius={[0, 4, 4, 0]} maxBarSize={34}>
                    {overall.streams.map(s => <Cell key={s.name} fill={s.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <DataTable
              columns={[
                { key: 'name', label: 'Stream' },
                { key: 'units', label: 'Units', align: 'center', render: (_, r) => `${fmtBig(r.units)} ${r.unitLabel}` },
                { key: 'cost', label: 'Cost', align: 'center', render: (_, r) => fmt(r.cost) },
              ]}
              rows={overall.streams}
            />
          </Card>

          <Card title="Monthly cost — both streams" note="same unit (₹), so one axis is fair">
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={overallMonths} margin={{ top: 10, right: 16, left: 4, bottom: 4 }}>
                  <CartesianGrid stroke={VIZ.grid} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: VIZ.muted }} axisLine={{ stroke: VIZ.axis }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: VIZ.muted }} axisLine={false} tickLine={false} tickFormatter={v => fmt(v)} />
                  <Tooltip cursor={{ stroke: VIZ.axis, strokeWidth: 1 }} content={<ChartTooltip formatter={v => fmt(v)} />} />
                  <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 4 }} iconType="plainline" />
                  <Line type="monotone" dataKey="b2c" name="B2C courier" stroke={SERIES.blue} strokeWidth={2}
                    dot={{ r: 3, fill: SERIES.blue, stroke: VIZ.surface, strokeWidth: 1.5 }} />
                  <Line type="monotone" dataKey="b2b" name="B2B freight" stroke={SERIES.orange} strokeWidth={2}
                    dot={{ r: 3, fill: SERIES.orange, stroke: VIZ.surface, strokeWidth: 1.5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <DataTable
              columns={[
                { key: 'month', label: 'Period' },
                { key: 'b2c', label: 'B2C', align: 'center', render: (_, r) => fmt(r.b2c) },
                { key: 'b2b', label: 'B2B', align: 'center', render: (_, r) => fmt(r.b2b) },
                { key: 'total', label: 'Total', align: 'center', render: (_, r) => fmt(r.total) },
              ]}
              rows={overallMonths}
            />
          </Card>
        </div>
      </>
    )
  } else if (scope === 'b2b') {
    // ── B2B: lane-wise cost analysis ──
    content = !b2b ? <Card title="Loading B2B freight…" /> : !b2b.totals.trips ? (
      <Card title="No B2B freight invoices yet">
        <div style={{ fontSize: 12.5, color: C.t2 }}>
          Add transporter bills from the <strong>Logistics Bill Ledger</strong> page (B2B · Freight format)
          and lane analysis will appear here.
        </div>
      </Card>
    ) : (
      <>
        <SectionHdr title="B2B Freight Overview" note={`${fmtN(b2b.totals.trips)} trips · ${fmtN(b2b.totals.lanes)} lanes`} />
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
          <Hero label="Total Freight Cost" value={fmt(b2b.totals.cost)}
            sub={`${fmtN(b2b.totals.trips)} trips across ${fmtN(b2b.totals.lanes)} lanes`} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 10 }}>
            <Tile label="Avg Cost / Trip" value={fmt(b2b.totals.avg_cost)} sub="all lanes blended" />
            <Tile label="Lanes" value={fmtN(b2b.totals.lanes)} sub="origin → destination pairs" />
            <Tile label="Transporters" value={fmtN(b2b.totals.transporters)}
              sub={b2bTransRows[0] ? `${b2bTransRows[0].key} leads` : null} />
            <Tile label="Costliest Lane" value={b2bLaneRows[0] ? fmt(b2bLaneRows[0].cost) : '—'}
              sub={b2bLaneRows[0]?.lane} />
            <Tile label="Top Lane Share" value={b2bLaneRows[0] ? b2bLaneRows[0].share.toFixed(1) + '%' : '—'}
              sub="of B2B spend" />
            <Tile label="Dearest Avg Trip"
              value={b2bLaneRows.length ? fmt(Math.max(...b2bLaneRows.map(r => r.avgCost))) : '—'}
              sub="highest per-trip lane" />
            <Tile label="Freight Types" value={fmtN(b2bTypeRows.length)}
              sub={b2bTypeRows.map(t => t.key).join(', ')} />
            <Tile label="Billing Periods" value={fmtN(b2bMonthRows.length)}
              sub={b2bMonthRows.length ? `${b2bMonthRows[0].month} – ${b2bMonthRows[b2bMonthRows.length - 1].month}` : null} />
          </div>
        </div>

        {/* Weight columns are entirely empty in this ledger today, so ₹/kg cannot be
            computed. Say so rather than render a column of dashes. */}
        <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: 9, background: C.amber.bg, border: `1px solid ${C.amber.bd}` }}>
          <span style={{ fontSize: 12, color: C.amber.tx }}>
            B2B bills carry no weight data (<code>charged_weight</code>, <code>load_weight</code> and
            <code> no_of_packages</code> are empty on all {fmtN(b2b.totals.trips)} rows), so cost per kg
            isn't available for freight. Lane analysis below is trip-based. Fill those columns at upload
            time and ₹/kg appears automatically.
          </span>
        </div>

        <SectionHdr title="Lane-wise Cost" note="top 60 lanes by spend" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 14 }}>
          <Card title="Costliest lanes" note="total freight spend per lane">
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={b2bLaneRows.slice(0, 10)} layout="vertical" margin={{ top: 10, right: 18, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke={VIZ.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: VIZ.muted }} axisLine={false} tickLine={false}
                    tickFormatter={v => fmt(v)} />
                  <YAxis type="category" dataKey="lane" width={168} tick={{ fontSize: 9.5, fill: VIZ.muted }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(11,11,11,0.04)' }} content={<ChartTooltip formatter={v => fmt(v)} />} />
                  <Bar dataKey="cost" name="Lane spend" fill={SERIES.blue} radius={[0, 4, 4, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Avg cost per trip" note="same 10 lanes — volume vs rate">
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={b2bLaneRows.slice(0, 10)} layout="vertical" margin={{ top: 10, right: 18, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke={VIZ.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: VIZ.muted }} axisLine={false} tickLine={false}
                    tickFormatter={v => fmt(v)} />
                  <YAxis type="category" dataKey="lane" width={168} tick={{ fontSize: 9.5, fill: VIZ.muted }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(11,11,11,0.04)' }} content={<ChartTooltip formatter={v => fmt(v)} />} />
                  <Bar dataKey="avgCost" name="Avg / trip" fill={SERIES.orange} radius={[0, 4, 4, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 14 }}>
          <Card title="Lane detail" note="min/max spread flags inconsistent rating on the same route">
            <DataTable
              columns={[
                { key: 'lane', label: 'Lane' },
                { key: 'trips', label: 'Trips', align: 'center', render: (_, r) => fmtN(r.trips) },
                { key: 'cost', label: 'Total', align: 'center', render: (_, r) => fmt(r.cost) },
                { key: 'avgCost', label: 'Avg Cost / Trip', align: 'center', render: (_, r) => fmt(r.avgCost) },
                { key: 'minCost', label: 'Min', align: 'center', render: (_, r) => fmt(r.minCost) },
                { key: 'maxCost', label: 'Max', align: 'center', render: (_, r) => fmt(r.maxCost) },
                { key: 'spread', label: 'Spread', align: 'center', render: (_, r) => (
                  <span style={{ color: r.trips >= 10 && r.spread > r.avgCost ? C.red.tx : undefined, fontWeight: r.trips >= 10 && r.spread > r.avgCost ? 700 : undefined }}>
                    {fmt(r.spread)}
                  </span>
                ) },
                { key: 'share', label: 'Share', align: 'center', render: (_, r) => <ShareBar pct={r.share}>{r.share.toFixed(1) + '%'}</ShareBar> },
              ]}
              rows={b2bLaneRows}
              maxRows={60}
            />
          </Card>
        </div>

        <SectionHdr title="Transporter & Freight Type" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))', gap: 14 }}>
          <Card title="By transporter">
            <DataTable
              columns={[
                { key: 'key', label: 'Transporter' },
                { key: 'trips', label: 'Trips', align: 'center', render: (_, r) => fmtN(r.trips) },
                { key: 'cost', label: 'Cost', align: 'center', render: (_, r) => fmt(r.cost) },
                { key: 'avgCost', label: 'Avg Cost / Trip', align: 'center', render: (_, r) => fmt(r.avgCost) },
                { key: 'share', label: 'Share', align: 'center', render: (_, r) => <ShareBar pct={r.share}>{r.share.toFixed(1) + '%'}</ShareBar> },
              ]}
              rows={b2bTransRows}
            />
          </Card>

          <Card title="By freight type" note="FTL = full truck, PTL = part load">
            <DataTable
              columns={[
                { key: 'key', label: 'Type' },
                { key: 'trips', label: 'Trips', align: 'center', render: (_, r) => fmtN(r.trips) },
                { key: 'cost', label: 'Cost', align: 'center', render: (_, r) => fmt(r.cost) },
                { key: 'avgCost', label: 'Avg Cost / Trip', align: 'center', render: (_, r) => fmt(r.avgCost) },
                { key: 'share', label: 'Share', align: 'center', render: (_, r) => <ShareBar pct={r.share}>{r.share.toFixed(1) + '%'}</ShareBar> },
              ]}
              rows={b2bTypeRows}
            />
          </Card>
        </div>

        {/* The raw invoice table, moved here from the B2C tab where it didn't belong. */}
        <SectionHdr title="Transporter Invoices" note="most recent 500 bills" />
        <Card>
          {b2bRows && b2bRows.length ? (
            <DataTable
              columns={[
                { key: 'month_year', label: 'Period', render: (_, r) => monthLabel(r.month_year) },
                { key: 'transporter_name', label: 'Transporter' },
                { key: 'origin_location', label: 'Origin' },
                { key: 'destination_location', label: 'Destination' },
                { key: 'freight_type', label: 'Type' },
                { key: 'total_cost', label: 'Total', align: 'center', render: (_, r) => fmt(r.total_cost) },
              ]}
              rows={b2bRows}
              maxRows={25}
            />
          ) : (
            <div style={{ fontSize: 12.5, color: C.t2 }}>No transporter invoices to show.</div>
          )}
        </Card>

        <SectionHdr title="Monthly B2B Trend" />
        <Card title="Freight spend by billing period">
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={b2bMonthRows} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="lcB2b" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SERIES.orange} stopOpacity={0.20} />
                    <stop offset="95%" stopColor={SERIES.orange} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={VIZ.grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: VIZ.muted }} axisLine={{ stroke: VIZ.axis }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: VIZ.muted }} axisLine={false} tickLine={false} tickFormatter={v => fmt(v)} />
                <Tooltip cursor={{ stroke: VIZ.axis, strokeWidth: 1 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const r = payload[0].payload
                    return (
                      <div style={{ background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, padding: '9px 11px', boxShadow: '0 6px 20px rgba(0,0,0,.12)' }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t1, marginBottom: 5 }}>{label}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>{fmt(r.cost)}</div>
                        <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>{fmtN(r.trips)} trips</div>
                      </div>
                    )
                  }} />
                <Area type="monotone" dataKey="cost" name="Freight spend" stroke={SERIES.orange}
                  strokeWidth={2} fill="url(#lcB2b)"
                  dot={{ r: 3.5, fill: SERIES.orange, stroke: VIZ.surface, strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <DataTable
            columns={[
              { key: 'month', label: 'Period' },
              { key: 'trips', label: 'Trips', align: 'center', render: (_, r) => fmtN(r.trips) },
              { key: 'cost', label: 'Cost', align: 'center', render: (_, r) => fmt(r.cost) },
            ]}
            rows={b2bMonthRows}
          />
        </Card>
      </>
    )
  } else {
    content = (
      <>

      {/* ── Cost overview: hero + 2 rows of 4 ── */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            { label: 'Total Logistics Cost', value: fmt(kpis.total), spark: monthSeries.map(d => d.cost || 0) },
            { label: '% of Revenue', value: kpis.costPctValue != null ? kpis.costPctValue.toFixed(2) + '%' : '—', spark: monthSeries.map(d => d.pctGmv || 0), invertColor: true },
            { label: 'Total Invoices', value: fmtBig(kpis.shipments), spark: monthSeries.map(d => d.shipments || 0) },
            { label: 'Billed Weight', value: fmtKg(kpis.chargedWt), spark: monthSeries.map(d => d.wt || 0), invertColor: true },
            { label: 'Total Shipment Value', value: fmt(agg.shipValue), spark: monthSeries.map(d => d.cost || 0) },
            { label: 'Cost per Kg', value: kpis.cpk != null ? '₹' + kpis.cpk.toFixed(2) : '—', spark: monthSeries.map(d => d.cpk || 0), invertColor: true },
            { label: 'Avg Cost / Shipment', value: '₹' + kpis.avgCost.toFixed(2), spark: monthSeries.map(d => d.avgCost || 0), invertColor: true },
            { label: 'Surcharge %', value: kpis.surchargePct.toFixed(2) + '%', spark: monthSeries.map(d => d.cpk || 0), invertColor: true },
            { label: 'Should Have Paid', value: fmt(agg.dtOurs), spark: monthSeries.map(d => d.cost || 0) },
            { label: 'Actually Billed', value: fmt(agg.dtInvoiced), spark: monthSeries.map(d => d.cost || 0), accent: C.red.tx },
            { label: 'Claimable', value: fmt(billingGap.weight), spark: monthSeries.map(d => d.claim || 0), accent: C.red.tx, invertColor: true },
            ...(!isMobile ? [{ label: 'Wasted Freight', value: fmt(reverseBurden.cost), spark: monthSeries.map(d => d.cost || 0), accent: C.red.tx, invertColor: true }] : []),
          ].map(m => {
            const pts = m.spark.slice(-14)
            const min = Math.min(...pts), max = Math.max(...pts)
            const range = max - min || 1
            const W = 44, H = 22
            const points = pts.map((v, i) => {
              const x = pts.length === 1 ? W/2 : (i/(pts.length-1))*W
              const y = H - ((v-min)/range)*H
              return `${x.toFixed(1)},${y.toFixed(1)}`
            }).join(' ')
            const last2 = pts.slice(-2)
            const isUp = last2.length === 2 ? last2[1] >= last2[0] : null
            const lineColor = isUp === null ? '#1baf7a' : m.invertColor ? (isUp ? '#E53935' : '#1baf7a') : (isUp ? '#1baf7a' : '#E53935')
            return (
              <div key={m.label} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '0 14px', display: 'flex', alignItems: 'center', height: 45, gap: 0 }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.t2, letterSpacing: '.03em', textTransform: 'uppercase' }}>{m.label}</div>
                {pts.length > 1
                  ? <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', flexShrink: 0 }}>
                      <polyline points={points} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                      <circle cx={points.split(' ').pop().split(',')[0]} cy={points.split(' ').pop().split(',')[1]} r="2.5" fill={lineColor} />
                    </svg>
                  : <div style={{ width: W, flexShrink: 0 }} />
                }
                <div style={{ width: 90, fontSize: 15, fontWeight: 800, color: m.accent || C.t1, lineHeight: 1.1, textAlign: 'right', paddingLeft: 8, whiteSpace: 'nowrap' }}>{m.value}</div>
              </div>
            )
          })}
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 5fr', gap: 18, alignItems: 'stretch' }}>
        <Hero
          label="Total Logistics Cost"
          value={fmt(kpis.total)}
          deltas={heroDeltas}
          sub={heroSub}
        >
          {monthSeries.length > 1 && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthSeries} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="lcHero" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SERIES.blue} stopOpacity={0.22} />
                    <stop offset="95%" stopColor={SERIES.blue} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" hide />
                <Area type="monotone" dataKey="cost" name="Freight cost" stroke={SERIES.blue}
                  strokeWidth={2} fill="url(#lcHero)" dot={false} />
                <Tooltip content={<ChartTooltip formatter={v => fmt(v)} />} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Hero>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 14, alignItems: 'stretch' }}>
          <Tile label="Total Shipment Value" value={fmt(agg.shipValue)}
            sub="goods shipped" />
          <Tile label="Cost per Kg" value={kpis.cpk != null ? '₹' + kpis.cpk.toFixed(2) : '—'}
            sub={`${fmtKg(kpis.chargedWt)} billed`} />
          <Tile label="Avg Cost / Shipment" value={'₹' + kpis.avgCost.toFixed(2)}
            sub="freight ÷ invoices" />
          <Tile label="Surcharge % of Freight" value={kpis.surchargePct.toFixed(1) + '%'}
            sub={`${fmt(agg.surcharge)} of ${fmt(agg.cost)} billed`} />
          <Tile label="Should Have Paid" value={fmt(agg.dtOurs)}
            sub="card × our weight" />
          <Tile label="Actually Billed" value={fmt(agg.dtInvoiced)}
            sub={`${fmt(Math.max(agg.dtInvoiced - agg.dtOurs, 0))} over card`}
            accent={C.red.tx} />
          <Tile label="Claimable — Wrong Weight" value={fmt(billingGap.weight)}
            sub={`${billingGap.pctOfBilled.toFixed(1)}% of total cost billed`}
            accent={C.red.tx} />
          <Tile label="Wasted Freight (Returns)" value={fmt(reverseBurden.cost)}
            sub={`${fmtN(reverseBurden.n)} legs · ${reverseBurden.pct.toFixed(1)}% of spend`}
            accent={C.red.tx} />
        </div>
      </div>
      )}

      {/* ── Trend ── */}
      {/* ONE chart carrying all four measures. Total spend is a BAR on the left axis
          (₹ Cr, a monthly stock); avg/shipment and ₹/kg are LINES on the right axis
          (₹ per unit). The two axes are unavoidable here — ₹1.6 Cr and ₹34 cannot share a
          scale — but they are legible because bar-vs-line already separates the encodings,
          so nothing has to be read against the wrong axis. Shipment count is not a fourth
          series: it lives in the tooltip and the table, since a count is not rupees.

          UNFILTERED BY DESIGN — reads trendAll, not the slicer-scoped monthSeries. "Is our
          freight bill rising" must not change when someone filters to one courier. */}
      <SectionHdr title="Monthly Trend"
        note={`${trendWindow.length} of ${trendRows.length} period${trendRows.length === 1 ? '' : 's'}`} collapsed={secHid['trend']} onToggle={() => toggleSec('trend')} />
      <Card style={{ ...(secHid['trend'] ? { display: 'none' } : {}), ...(isMobile ? { paddingLeft: 8 } : {}) }} title={isMobile ? <span style={{ fontSize: 15 }}>Freight spend and unit cost</span> : "Freight spend and unit cost"}
        note={isMobile ? "" : "bars = total spend (left axis) · lines = cost per unit (right axis)"}
        action={
          // Range applies to THIS chart only. Options above the available history are
          // disabled rather than hidden, so the reader can see how much data exists.
          isMobile ? (
            <select value={trendMonths} onChange={e => setTrendMonths(Number(e.target.value))}
              style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, fontFamily: 'var(--font)', border: `1.5px solid ${C.acm}`, background: '#fff', color: C.t1, cursor: 'pointer' }}>
              {[{ n: 1, l: '1M' }, { n: 3, l: '3M' }, { n: 6, l: '6M' }, { n: 999, l: 'All' }].map(o => (
                <option key={o.l} value={o.n}>{o.l}</option>
              ))}
            </select>
          ) : (
          <div style={{ display: 'flex', gap: 4 }}>
            {[{ n: 1, l: '1M' }, { n: 3, l: '3M' }, { n: 6, l: '6M' }, { n: 999, l: 'All' }].map(o => {
              const on = trendMonths === o.n
              const short = o.n !== 999 && !on && o.n > trendRows.length
                && trendRows.length <= Math.max(...[1, 3, 6].filter(v => v < o.n))
              return (
                <button key={o.l} onClick={() => setTrendMonths(o.n)} disabled={short}
                  title={short ? `only ${trendRows.length} periods uploaded` : undefined}
                  style={{
                    fontSize: 11, fontWeight: on ? 700 : 500, padding: '4px 10px',
                    borderRadius: 6, fontFamily: 'var(--font)',
                    border: `1.5px solid ${on ? C.acm : C.border2}`,
                    background: on ? C.acl : C.card,
                    color: short ? C.t3 : C.t1,
                    cursor: short ? 'default' : 'pointer', opacity: short ? 0.45 : 1,
                  }}>
                  {o.l}
                </button>
              )
            })}
          </div>
          )
        }>
        <div style={{ height: 200, marginTop: isMobile ? 20 : 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trendWindow} margin={{ top: 12, right: isMobile ? -28 : 14, left: isMobile ? -4 : 4, bottom: 4 }}>
              <CartesianGrid stroke={VIZ.grid} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: VIZ.muted }}
                axisLine={{ stroke: VIZ.axis }} tickLine={false} />
              <YAxis yAxisId="spend" tick={{ fontSize: 11, fill: VIZ.muted }}
                axisLine={false} tickLine={false} tickFormatter={v => fmt(v)} />
              <YAxis yAxisId="unit" orientation="right" tick={{ fontSize: 11, fill: VIZ.muted }}
                axisLine={false} tickLine={false} tickFormatter={v => '₹' + v.toFixed(0)} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,.04)' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const r = payload[0].payload
                  return (
                    <div style={{ background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, padding: '9px 11px', boxShadow: '0 6px 20px rgba(0,0,0,.12)' }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t1, marginBottom: 5 }}>{label}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>{fmt(r.cost)}</div>
                      <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>
                        {fmtN(r.shipments)} shipments · {fmtKg(r.wt)} billed
                      </div>
                      <div style={{ fontSize: 11.5, color: SERIES.aqua, marginTop: 5, fontWeight: 600 }}>
                        ₹{r.avgCost.toFixed(2)} / shipment
                      </div>
                      <div style={{ fontSize: 11.5, color: SERIES.yellow, fontWeight: 600 }}>
                        ₹{r.cpk.toFixed(2)} / kg
                      </div>
                    </div>
                  )
                }} />
              <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 11.5, paddingTop: 0, bottom: isMobile ? 8 : 0 }} formatter={(value) => <span style={{ color: C.t1 }}>{value}</span>} />
              <Bar yAxisId="spend" dataKey="cost" name="Total freight spend"
                fill={SERIES.blue} fillOpacity={0.82} radius={[4, 4, 0, 0]} maxBarSize={64} />
              <Line yAxisId="unit" type="monotone" dataKey="avgCost" name="Avg / shipment"
                stroke={SERIES.aqua} strokeWidth={2.5}
                dot={{ r: 3.5, fill: SERIES.aqua, stroke: VIZ.surface, strokeWidth: 2 }}
                activeDot={{ r: 6, fill: SERIES.aqua, stroke: VIZ.surface, strokeWidth: 2 }} />
              <Line yAxisId="unit" type="monotone" dataKey="cpk" name="Cost per kg"
                stroke={SERIES.yellow} strokeWidth={2.5}
                dot={{ r: 3.5, fill: SERIES.yellow, stroke: VIZ.surface, strokeWidth: 2 }}
                activeDot={{ r: 6, fill: SERIES.yellow, stroke: VIZ.surface, strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Table twin — the real rupees, counts and weights behind the chart. */}
        <div style={{ marginTop: 12 }}>
          {isMobile ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content', minWidth: '100%', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ position: 'sticky', left: 0, background: C.card, zIndex: 2, padding: '6px 8px', textAlign: 'left', fontWeight: 700, color: C.t2, whiteSpace: 'nowrap', fontSize: 10, minWidth: 72 }}>PERIOD</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: C.t2, whiteSpace: 'nowrap', fontSize: 10, minWidth: 88 }}>FREIGHT COST</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: C.t2, whiteSpace: 'nowrap', fontSize: 10, minWidth: 88 }}>SHIPMENTS</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: C.t2, whiteSpace: 'nowrap', fontSize: 10, minWidth: 88 }}>AVG COST/SHIP</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: C.t2, whiteSpace: 'nowrap', fontSize: 10, minWidth: 88 }}>COST/KG</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: C.t2, whiteSpace: 'nowrap', fontSize: 10, minWidth: 88 }}>BILLED WT</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: C.t2, whiteSpace: 'nowrap', fontSize: 10, minWidth: 88 }}>% GMV</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: C.t2, whiteSpace: 'nowrap', fontSize: 10, minWidth: 88 }}>CLAIMABLE</th>
                  </tr>
                </thead>
                <tbody>
                  {trendWindow.map((r, i) => (
                    <tr key={r.month} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.card : C.bg }}>
                      <td style={{ position: 'sticky', left: 0, background: i % 2 === 0 ? C.card : C.bg, zIndex: 1, padding: '6px 8px', fontWeight: 600, color: C.t1, whiteSpace: 'nowrap' }}>{r.month}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: C.t1 }}>{fmt(r.cost)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: C.t1 }}>{fmtN(r.shipments)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: C.t1 }}>{'₹' + r.avgCost.toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: C.t1 }}>{'₹' + r.cpk.toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: C.t1 }}>{fmtKg(r.wt)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: C.t1 }}>{r.pctGmv != null ? r.pctGmv.toFixed(2) + '%' : '—'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{r.claim > 0 ? <span style={{ color: C.red.tx, fontWeight: 700 }}>{fmt(r.claim)}</span> : <span style={{ color: C.t3 }}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
          <DataTable
            columns={[
              { key: 'month', label: 'Period' },
              { key: 'cost', label: 'Freight cost', align: 'center', render: (_, r) => fmt(r.cost) },
              { key: 'shipments', label: 'Shipments', align: 'center', render: (_, r) => fmtN(r.shipments) },
              { key: 'avgCost', label: 'Avg Cost / Shipment', align: 'center', render: (_, r) => '₹' + r.avgCost.toFixed(2) },
              { key: 'cpk', label: 'Cost / kg', align: 'center', render: (_, r) => '₹' + r.cpk.toFixed(2) },
              { key: 'wt', label: 'Billed wt', align: 'center', render: (_, r) => fmtKg(r.wt) },
              { key: 'pctGmv', label: '% of GMV', align: 'center', render: (_, r) => (
                r.pctGmv != null ? r.pctGmv.toFixed(2) + '%' : '—'
              ) },
              { key: 'claim', label: 'Claimable', align: 'center', render: (_, r) => (
                r.claim > 0
                  ? <span style={{ color: C.red.tx, fontWeight: 700 }}>{fmt(r.claim)}</span>
                  : <span style={{ color: C.t3 }}>—</span>
              ) },
            ]}
            rows={trendWindow}
          />
          )}
        </div>
      </Card>

      {/* ── Zone + mode ── */}
      <SectionHdr title="Where The Money Goes" collapsed={secHid['money']} onToggle={() => toggleSec('money')} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))', gap: 14 , ...(secHid['money'] ? { display: 'none' } : {}) }}>
        <Card title="Cost by zone" note="">
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={zoneRows} margin={{ top: 10, right: isMobile ? 10 : 12, left: isMobile ? -14 : 4, bottom: 4 }}>
                <CartesianGrid stroke={VIZ.grid} vertical={false} />
                <XAxis dataKey="zone" tickFormatter={z => `Zone ${z}`} tick={{ fontSize: 11.5, fill: VIZ.muted }} axisLine={{ stroke: VIZ.axis }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: VIZ.muted }} axisLine={false} tickLine={false}
                  tickFormatter={v => fmt(v)} />
                <Tooltip cursor={{ fill: 'rgba(11,11,11,0.04)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const r = payload[0].payload
                    return (
                      <div style={{ background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, padding: '9px 11px', boxShadow: '0 6px 20px rgba(0,0,0,.12)' }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t1, marginBottom: 5 }}>Zone {r.zone}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>{fmt(r.cost)}</div>
                        <div style={{ fontSize: 11, color: C.t2, marginTop: 3 }}>
                          {r.share.toFixed(1)}% of total freight
                        </div>
                        <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                          {fmtN(r.shipments)} shipments · ₹{r.avgCost.toFixed(2)} per shipment
                        </div>
                      </div>
                    )
                  }} />
                <Bar dataKey="cost" name="Cost" radius={[4, 4, 0, 0]} maxBarSize={44}
                  onClick={d => d?.zone && ZONES.includes(d.zone) && toggleIn('zones', d.zone)}
                  style={{ cursor: 'pointer' }}>
                  {zoneRows.map(r => (
                    <Cell key={r.zone} fill={zoneColor(r.zone, zoneOrder)}
                      opacity={filters.zones.length && !filters.zones.includes(r.zone) ? 0.35 : 1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {!isMobile && <div style={{ fontSize: 10.5, color: VIZ.muted, marginTop: -2, marginBottom: 6 }}>Click a bar to filter by zone</div>}
          {isMobile ? (
            <div style={{ overflowX: 'auto', marginTop: 8, marginLeft: -8, marginRight: -8 }}>
              <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 11, width: '100%' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ position: 'sticky', left: 0, background: C.card, zIndex: 2, padding: '6px 6px', textAlign: 'left', fontWeight: 700, color: C.t2, whiteSpace: 'nowrap', fontSize: 10, minWidth: 58 }}>ZONE</th>
                    <th style={{ padding: '6px 6px', textAlign: 'center', fontWeight: 700, color: C.t2, whiteSpace: 'nowrap', fontSize: 10, minWidth: 70 }}>SHIPMENTS</th>
                    <th style={{ padding: '6px 6px', textAlign: 'center', fontWeight: 700, color: C.t2, whiteSpace: 'nowrap', fontSize: 10, minWidth: 70 }}>AVG COST/SHIP</th>
                    <th style={{ padding: '6px 6px', textAlign: 'center', fontWeight: 700, color: C.t2, whiteSpace: 'nowrap', fontSize: 10, minWidth: 70 }}>COST/KG</th>
                    <th style={{ padding: '6px 6px', textAlign: 'center', fontWeight: 700, color: C.t2, whiteSpace: 'nowrap', fontSize: 10, minWidth: 55 }}>SHARE</th>
                  </tr>
                </thead>
                <tbody>
                  {zoneRows.map((r, i) => (
                    <tr key={r.zone} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.card : C.bg }}>
                      <td style={{ position: 'sticky', left: 0, background: i % 2 === 0 ? C.card : C.bg, zIndex: 1, padding: '6px 6px', fontWeight: 600, color: C.t1, whiteSpace: 'nowrap' }}>Zone {r.zone}</td>
                      <td style={{ padding: '6px 6px', textAlign: 'center', color: C.t1 }}>{fmtBig(r.shipments)}</td>
                      <td style={{ padding: '6px 6px', textAlign: 'center', color: C.t1 }}>{'₹' + r.avgCost.toFixed(2)}</td>
                      <td style={{ padding: '6px 6px', textAlign: 'center', color: C.t1 }}>{r.cpk != null ? '₹' + r.cpk.toFixed(2) : '—'}</td>
                      <td style={{ padding: '6px 6px', textAlign: 'center', color: C.t1 }}>{r.share.toFixed(1) + '%'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
          <DataTable
            columns={[
              { key: 'zone', label: 'Zone', render: v => `Zone ${v}` },
              { key: 'shipments', label: 'Shipments', align: 'center', render: (_, r) => fmtN(r.shipments) },
              { key: 'avgCost', label: 'Avg Cost / Shipment', align: 'center', render: (_, r) => '₹' + r.avgCost.toFixed(2) },
              { key: 'cpk', label: 'Cost / kg', align: 'center', render: (_, r) => (r.cpk != null ? '₹' + r.cpk.toFixed(2) : '—') },
              { key: 'share', label: 'Share', align: 'center', render: (_, r) => <ShareBar pct={r.share}>{r.share.toFixed(1) + '%'}</ShareBar> },
            ]}
            rows={zoneRows}
          />
          )}
        </Card>

        {/* Part-to-whole is valid here: the three legs are mutually exclusive and sum to
            100% of freight spend, and three slices is well inside the ~6 slice limit.
            Rendered as a donut with direct labels because Forward takes 316° of arc
            while Reverse (28°) and RTO (15°) are thin wedges — the labels carry the
            comparison that the angles cannot. RVP and DTO are folded into Reverse
            upstream in api/logistics-cost.js; RTO is its own leg. */}
        <Card style={{ display: 'flex', flexDirection: 'column' }} title="Cost by leg" note={isMobile ? "" : "RVP and DTO count as reverse · RTO shown separately — both are cost with no revenue"}>
          {isMobile ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 150, height: 150, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const r = payload[0].payload
                        return (
                          <div style={{ background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, padding: '9px 11px', boxShadow: '0 6px 20px rgba(0,0,0,.12)' }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: C.t1 }}>{fmt(r.cost)}</div>
                            <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{r.share.toFixed(1)}% of spend</div>
                          </div>
                        )
                      }} />
                    <Pie data={modeRows} dataKey="cost" nameKey="mode" cx="50%" cy="50%"
                      innerRadius={38} outerRadius={62} paddingAngle={2}
                      stroke={VIZ.surface} strokeWidth={2}
                      onClick={d => d?.mode && toggleIn('modes', d.mode)}
                      style={{ cursor: 'pointer' }} label={false} labelLine={false}>
                      {modeRows.map(r => (
                        <Cell key={r.mode} fill={MODE_COLOR[r.mode] || VIZ.muted}
                          opacity={filters.modes.length && !filters.modes.includes(r.mode) ? 0.35 : 1} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginLeft: 'auto' }}>
                {modeRows.map(r => (
                  <div key={r.mode} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: MODE_COLOR[r.mode] || VIZ.muted, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.t1, lineHeight: 1.2 }}>{r.mode} <span style={{ fontWeight: 400, color: C.t3 }}>{r.share.toFixed(1)}%</span></div>
                      <div style={{ fontSize: 11, color: C.t3 }}>{fmt(r.cost)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const r = payload[0].payload
                      return (
                        <div style={{ background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, padding: '9px 11px', boxShadow: '0 6px 20px rgba(0,0,0,.12)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                            <span style={{ width: 9, height: 9, borderRadius: 2, background: MODE_COLOR[r.mode] || VIZ.muted, flexShrink: 0 }} />
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.t1 }}>{r.mode}</span>
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>{fmt(r.cost)}</div>
                          <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>
                            {fmtN(r.shipments)} shipments · ₹{r.avgCost.toFixed(2)} avg · {r.share.toFixed(1)}% of spend
                          </div>
                        </div>
                      )
                    }} />
                  <Pie
                    data={modeRows}
                    dataKey="cost"
                    nameKey="mode"
                    cx="50%" cy="50%"
                    innerRadius={52} outerRadius={88}
                    paddingAngle={2}
                    stroke={VIZ.surface} strokeWidth={2}
                    onClick={d => d?.mode && toggleIn('modes', d.mode)}
                    style={{ cursor: 'pointer' }}
                    label={({ mode, share, x, y, textAnchor }) => (
                      <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="central"
                        fontSize={11} fontWeight={700} fill={C.t2}>
                        {`${mode} ${share.toFixed(1)}%`}
                      </text>
                    )}
                    labelLine={{ stroke: VIZ.axis, strokeWidth: 1 }}
                  >
                    {modeRows.map(r => (
                      <Cell key={r.mode} fill={MODE_COLOR[r.mode] || VIZ.muted}
                        opacity={filters.modes.length && !filters.modes.includes(r.mode) ? 0.35 : 1} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {!isMobile && <div style={{ fontSize: 10.5, color: VIZ.muted, marginTop: -2, marginBottom: 6 }}>Click a slice to filter by leg</div>}
          {isMobile ? (
            <div style={{ overflowX: 'auto', marginLeft: -8, marginRight: -8, WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 11.5 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border2}` }}>
                    <th style={{ position: 'sticky', left: 0, background: C.card, zIndex: 2, padding: '5px 8px', textAlign: 'left', fontWeight: 700, color: C.t2, minWidth: 80, whiteSpace: 'nowrap', borderRight: `1px solid ${C.border}` }}>Mode</th>
                    <th style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 700, color: C.t2, minWidth: 80, whiteSpace: 'nowrap' }}>Shipments</th>
                    <th style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 700, color: C.t2, minWidth: 80, whiteSpace: 'nowrap' }}>Cost</th>
                    <th style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 700, color: C.t2, minWidth: 90, whiteSpace: 'nowrap' }}>Avg/Ship</th>
                    <th style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 700, color: C.t2, minWidth: 60, whiteSpace: 'nowrap' }}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {modeRows.map((r, i) => (
                    <tr key={r.mode} style={{ borderBottom: i < modeRows.length - 1 ? `1px solid ${C.border2}` : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                      <td style={{ position: 'sticky', left: 0, background: C.card, zIndex: 1, padding: '5px 8px', fontWeight: 600, color: C.t1, whiteSpace: 'nowrap', borderRight: `1px solid ${C.border}` }}>{r.mode}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', color: C.t1 }}>{fmtBig(r.shipments)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', color: C.t1 }}>{fmt(r.cost)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', color: C.t1 }}>₹{r.avgCost.toFixed(2)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', color: C.t1 }}>{r.share.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
          <DataTable
            columns={[
              { key: 'mode', label: 'Mode' },
              { key: 'shipments', label: 'Shipments', align: 'center', render: (_, r) => fmtN(r.shipments) },
              { key: 'cost', label: 'Cost', align: 'center', render: (_, r) => fmt(r.cost) },
              { key: 'avgCost', label: 'Avg Cost / Shipment', align: 'center', render: (_, r) => '₹' + r.avgCost.toFixed(2) },
              { key: 'share', label: 'Share', align: 'center', render: (_, r) => <ShareBar pct={r.share}>{r.share.toFixed(1) + '%'}</ShareBar> },
            ]}
            rows={modeRows}
          />
          )}
        </Card>
      </div>

      {/* ── Weight slab + service type ── */}
      <SectionHdr title="Rate Card Exposure" note={isMobile ? "" : "cost behaviour across billing slabs"} collapsed={secHid['ratecard']} onToggle={() => toggleSec('ratecard')} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))', gap: 14 , ...(secHid['ratecard'] ? { display: 'none' } : {}) }}>
        {/* ONE chart, ONE axis, grouped bars.
            The two series are avg cost PER SHIPMENT and cost PER KG — both are
            per-shipment rupee figures on the same order of magnitude (₹44–₹415 and
            ₹20–₹89), so a single ₹ axis carries them honestly with no second scale.
            Total spend is deliberately NOT a series here: at ₹1.4 Cr it would render
            ₹/kg at 0.0006% of the axis, i.e. invisible. Spend lives in the table
            below and in the tooltip, where its own scale does it justice. */}
        <Card style={{ display: 'flex', flexDirection: 'column' }} title={isMobile ? "Cost Efficiency Across Weight Slabs" : "Cost per shipment vs cost per kg, by weight slab"}
          note={isMobile ? "" : "both in ₹ on one axis — heavier slabs cost more per parcel but less per kg"}>
          <div style={{ flex: 1, minHeight: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bandRows} margin={isMobile ? { top: 12, right: 10, left: -24, bottom: 4 } : { top: 12, right: 12, left: 4, bottom: 4 }} barGap={4}>
                <CartesianGrid stroke={VIZ.grid} vertical={false} />
                <XAxis dataKey="band" tick={{ fontSize: 10.5, fill: VIZ.muted }} axisLine={{ stroke: VIZ.axis }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: VIZ.muted }} axisLine={false} tickLine={false}
                  tickFormatter={v => '₹' + v.toFixed(0)} />
                <Tooltip cursor={{ fill: 'rgba(11,11,11,0.04)' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const r = payload[0].payload
                    return (
                      <div style={{ background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, padding: '9px 11px', boxShadow: '0 6px 20px rgba(0,0,0,.12)' }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t1, marginBottom: 6 }}>{label}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 9, height: 9, borderRadius: 2, background: SERIES.blue, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 800, color: C.t1 }}>₹{r.avgCost.toFixed(2)}</span>
                          <span style={{ fontSize: 11, color: C.t3 }}>per shipment</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
                          <span style={{ width: 9, height: 9, borderRadius: 2, background: SERIES.orange, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 800, color: C.t1 }}>₹{r.cpk != null ? r.cpk.toFixed(2) : '—'}</span>
                          <span style={{ fontSize: 11, color: C.t3 }}>per kg</span>
                        </div>
                        <div style={{ fontSize: 11, color: C.t3, marginTop: 5, paddingTop: 5, borderTop: `1px solid ${C.border}` }}>
                          {fmt(r.cost)} total · {fmtN(r.shipments)} shipments · {r.share.toFixed(1)}% of spend
                        </div>
                      </div>
                    )
                  }} />
                <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 4 }} formatter={(value) => <span style={{ color: C.t1 }}>{value}</span>} />
                <Bar dataKey="avgCost" name="Avg ₹ / shipment" fill={SERIES.blue} radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Bar dataKey="cpk" name="Cost / kg" fill={SERIES.orange} radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {isMobile ? (
            <div style={{ overflowX: 'auto', marginLeft: -8, marginRight: -8, WebkitOverflowScrolling: 'touch' }}>
              <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content', minWidth: '100%', fontSize: 11.5 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border2}` }}>
                    <th style={{ position: 'sticky', left: 0, background: C.card, zIndex: 2, padding: '5px 8px', textAlign: 'left', fontWeight: 700, color: C.t2, width: 72, whiteSpace: 'nowrap', borderRight: `1px solid ${C.border}` }}>Slab</th>
                    <th style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 700, color: C.t2, width: 72, whiteSpace: 'nowrap' }}>Shipments</th>
                    <th style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 700, color: C.t2, width: 72, whiteSpace: 'nowrap' }}>Cost</th>
                    <th style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 700, color: C.t2, width: 58, whiteSpace: 'nowrap' }}>Share</th>
                    <th style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 700, color: C.t2, width: 80, whiteSpace: 'nowrap' }}>Avg/Ship</th>
                    <th style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 700, color: C.t2, width: 68, whiteSpace: 'nowrap' }}>Cost/kg</th>
                    <th style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 700, color: C.t2, width: 72, whiteSpace: 'nowrap' }}>Overbilled</th>
                  </tr>
                </thead>
                <tbody>
                  {bandRows.map((r, i) => (
                    <tr key={r.band} style={{ borderBottom: i < bandRows.length - 1 ? `1px solid ${C.border2}` : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                      <td style={{ position: 'sticky', left: 0, background: C.card, zIndex: 1, padding: '5px 8px', fontWeight: 600, color: C.t1, whiteSpace: 'nowrap', borderRight: `1px solid ${C.border}` }}>{r.band}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', color: C.t1 }}>{fmtBig(r.shipments)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', color: C.t1 }}>{fmt(r.cost)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', color: C.t1 }}>{r.share.toFixed(1)}%</td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', color: C.t1 }}>₹{r.avgCost.toFixed(2)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', color: C.t1 }}>{r.cpk != null ? '₹' + r.cpk.toFixed(2) : '—'}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', color: C.t1 }}>{r.overPct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
          <DataTable
            columns={[
              { key: 'band', label: 'Slab' },
              { key: 'shipments', label: 'Shipments', align: 'center', render: (_, r) => fmtN(r.shipments) },
              { key: 'cost', label: isMobile ? 'Cost' : 'Total Cost', align: 'center', render: (_, r) => fmt(r.cost) },
              { key: 'share', label: 'Share', align: 'center', render: (_, r) => <ShareBar pct={r.share}>{r.share.toFixed(1) + '%'}</ShareBar> },
              { key: 'avgCost', label: 'Avg Cost / Shipment', align: 'center', render: (_, r) => '₹' + r.avgCost.toFixed(2) },
              { key: 'cpk', label: 'Cost / kg', align: 'center', render: (_, r) => (r.cpk != null ? '₹' + r.cpk.toFixed(2) : '—') },
              { key: 'overPct', label: 'Overbilled', align: 'center', render: (_, r) => r.overPct.toFixed(1) + '%' },
            ]}
            rows={bandRows}
            maxHeight={220}
          />
          )}
        </Card>

        {/* Note corrected: the old text claimed "express/NDD carries a premium over
            surface", which the data contradicts — NDD averages ₹59/shipment against
            Surface at ₹118, because NDD carries lighter parcels. The premium shows up
            per KG, not per shipment. */}
        {/* "By service type" removed. It listed 11 raw account_type values including
            "Surface" and "SURFACE" as separate rows — the same service split by casing,
            which made the table read as a data dump rather than analysis. Its useful
            content (₹/kg by tier) is already covered by the weight-slab chart beside it.
            Replaced with rate drift, which answers a question nobody could ask before:
            is any courier quietly raising its effective rate? */}
        <Card title="Effective rate drift by courier"
          note={isMobile ? "" : "₹/kg per month — a rising line is a rate increase, not a heavier mix"}>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={driftSeries} margin={isMobile ? { top: 12, right: 16, left: -24, bottom: 4 } : { top: 12, right: 44, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={VIZ.grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: VIZ.muted }} axisLine={{ stroke: VIZ.axis }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: VIZ.muted }} axisLine={false} tickLine={false}
                  tickFormatter={v => '₹' + v.toFixed(0)} />
                <Tooltip cursor={{ stroke: VIZ.axis, strokeWidth: 1 }}
                  content={<ChartTooltip formatter={v => '₹' + num(v).toFixed(2) + ' / kg'} />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="plainline" formatter={(value) => <span style={{ color: C.t1 }}>{value}</span>} />
                {driftCouriers.map((c, i) => (
                  <Line key={c} type="monotone" dataKey={c} name={c}
                    stroke={DRIFT_COLORS[i % DRIFT_COLORS.length]} strokeWidth={2}
                    dot={{ r: 2.5 }} connectNulls />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {isMobile ? (
            <div style={{ overflowX: 'auto', marginLeft: -8, marginRight: -8, WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border2}` }}>
                    <th style={{ position: 'sticky', left: 0, background: C.card, zIndex: 2, padding: '5px 6px', textAlign: 'left', fontWeight: 800, color: C.t1, width: '28%', whiteSpace: 'nowrap' }}>Courier</th>
                    <th style={{ padding: '5px 2px', textAlign: 'center', fontWeight: 800, color: C.t1, width: '18%', whiteSpace: 'nowrap' }}>First</th>
                    <th style={{ padding: '5px 2px', textAlign: 'center', fontWeight: 800, color: C.t1, width: '18%', whiteSpace: 'nowrap' }}>Latest</th>
                    <th style={{ padding: '5px 2px', textAlign: 'center', fontWeight: 800, color: C.t1, width: '18%', whiteSpace: 'nowrap' }}>Drift</th>
                    <th style={{ padding: '5px 2px', textAlign: 'center', fontWeight: 800, color: C.t1, width: '18%', whiteSpace: 'nowrap' }}>Months</th>
                  </tr>
                </thead>
                <tbody>
                  {driftRows.map((r, i) => (
                    <tr key={r.courier} style={{ borderBottom: i < driftRows.length - 1 ? `1px solid ${C.border2}` : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                      <td style={{ position: 'sticky', left: 0, background: i % 2 === 0 ? C.card : 'rgba(0,0,0,0.02)', zIndex: 1, padding: '5px 6px', fontWeight: 700, color: C.t1, whiteSpace: 'nowrap' }}><CourierCell name={r.courier} /></td>
                      <td style={{ padding: '5px 2px', textAlign: 'center', color: C.t1 }}>₹{r.first.toFixed(2)}</td>
                      <td style={{ padding: '5px 2px', textAlign: 'center', color: C.t1 }}>₹{r.last.toFixed(2)}</td>
                      <td style={{ padding: '5px 2px', textAlign: 'center' }}>
                        {r.months < 2 ? <span style={{ color: C.t3 }}>—</span>
                          : <span style={{ color: r.drift > 5 ? C.red.tx : r.drift < -5 ? C.green.tx : C.t1, fontWeight: Math.abs(r.drift) > 5 ? 700 : undefined }}>
                              {(r.drift >= 0 ? '+' : '') + r.drift.toFixed(1) + '%'}
                            </span>}
                      </td>
                      <td style={{ padding: '5px 2px', textAlign: 'center', color: C.t1 }}>{fmtN(r.months)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
          <DataTable
            columns={[
              { key: 'courier', label: 'Courier', render: v => <CourierCell name={v} /> },
              { key: 'first', label: 'First', align: 'center', render: (_, r) => '₹' + r.first.toFixed(2) },
              { key: 'last', label: 'Latest', align: 'center', render: (_, r) => '₹' + r.last.toFixed(2) },
              { key: 'drift', label: 'Drift', align: 'center', render: (_, r) => (
                r.months < 2 ? <span style={{ color: C.t3 }}>—</span>
                  : <span style={{ color: r.drift > 5 ? C.red.tx : r.drift < -5 ? C.green.tx : undefined, fontWeight: Math.abs(r.drift) > 5 ? 700 : undefined }}>
                      {(r.drift >= 0 ? '+' : '') + r.drift.toFixed(1) + '%'}
                    </span>
              ) },
              { key: 'months', label: 'Months', align: 'center', render: (_, r) => fmtN(r.months) },
            ]}
            rows={driftRows}
            maxHeight={220}
          />
          )}
          {!isMobile && <div style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>
            Couriers with fewer than 500 shipments in a month are excluded, so a handful
            of parcels can't fake a spike.
          </div>}
        </Card>
      </div>

      {/* ── By courier ── */}
      {/* The overbilled-% column here is the per-partner breakdown of the headline figure
          in Billing Accuracy above. Prepaid vs COD follows it, since the COD premium is
          read per courier once the partner table has set the context. */}
      <SectionHdr title="By Courier Partner"
        note={courierRows.length === 1 ? 'one partner in the ledger so far' : `${courierRows.length} partners`} collapsed={secHid['courier']} onToggle={() => toggleSec('courier')} />
      <Card style={secHid['courier'] ? { display: 'none' } : undefined}>
        {isMobile ? (
          <div style={{ overflowX: 'auto', marginLeft: -8, marginRight: -8, WebkitOverflowScrolling: 'touch' }}>
            <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content', minWidth: '100%', fontSize: 11.5 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border2}` }}>
                  <th style={{ position: 'sticky', left: 0, background: C.card, zIndex: 2, padding: '5px 8px', textAlign: 'left', fontWeight: 800, color: C.t1, width: 90, whiteSpace: 'nowrap', borderRight: `1px solid ${C.border}` }}>Courier</th>
                  <th style={{ padding: '5px 4px', textAlign: 'center', fontWeight: 800, color: C.t1, width: 62, whiteSpace: 'nowrap' }}>Shipments</th>
                  <th style={{ padding: '5px 4px', textAlign: 'center', fontWeight: 800, color: C.t1, width: 62, whiteSpace: 'nowrap' }}>Cost</th>
                  <th style={{ padding: '5px 4px', textAlign: 'center', fontWeight: 800, color: C.t1, width: 62, whiteSpace: 'nowrap' }}>Avg/Ship</th>
                  <th style={{ padding: '5px 4px', textAlign: 'center', fontWeight: 800, color: C.t1, width: 58, whiteSpace: 'nowrap' }}>Cost/kg</th>
                  <th style={{ padding: '5px 4px', textAlign: 'center', fontWeight: 800, color: C.t1, width: 68, whiteSpace: 'nowrap' }}>% Wrong Wt</th>
                  <th style={{ padding: '5px 4px', textAlign: 'center', fontWeight: 800, color: C.t1, width: 65, whiteSpace: 'nowrap' }}>Claimable</th>
                </tr>
              </thead>
              <tbody>
                {courierRows.map((r, i) => (
                  <tr key={r.courier} style={{ borderBottom: i < courierRows.length - 1 ? `1px solid ${C.border2}` : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                    <td style={{ position: 'sticky', left: 0, background: C.card, zIndex: 1, padding: '5px 8px', fontWeight: 700, color: C.t1, whiteSpace: 'nowrap', borderRight: `1px solid ${C.border}` }}><CourierCell name={r.courier} /></td>
                    <td style={{ padding: '5px 4px', textAlign: 'center', color: C.t1 }}>{fmtBig(r.shipments)}</td>
                    <td style={{ padding: '5px 4px', textAlign: 'center', color: C.t1 }}>{fmt(r.cost)}</td>
                    <td style={{ padding: '5px 4px', textAlign: 'center', color: C.t1 }}>₹{r.avgCost.toFixed(2)}</td>
                    <td style={{ padding: '5px 4px', textAlign: 'center', color: C.t1 }}>{r.cpk != null ? '₹' + r.cpk.toFixed(2) : '—'}</td>
                    <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                      <span style={{ color: r.overPct > 40 ? C.red.tx : C.t1, fontWeight: r.overPct > 40 ? 700 : undefined }}>{r.overPct.toFixed(1)}%</span>
                    </td>
                    <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                      {r.claimRs > 0 ? <span style={{ color: C.red.tx, fontWeight: 700 }}>{fmt(r.claimRs)}</span> : <span style={{ color: C.t3 }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
        <DataTable
          columns={[
            { key: 'courier', label: 'Courier', render: v => <CourierCell name={v} /> },
            { key: 'shipments', label: 'Shipments', align: 'center', render: (_, r) => fmtN(r.shipments) },
            { key: 'cost', label: 'Cost', align: 'center', render: (_, r) => fmt(r.cost) },
            { key: 'avgCost', label: 'Avg Cost / Shipment', align: 'center', render: (_, r) => '₹' + r.avgCost.toFixed(2) },
            { key: 'cpk', label: 'Cost / kg', align: 'center', render: (_, r) => (r.cpk != null ? '₹' + r.cpk.toFixed(2) : '—') },
            { key: 'overPct', label: '% Wrong Weight', align: 'center', render: (_, r) => (
              <span style={{ color: r.overPct > 40 ? C.red.tx : undefined, fontWeight: r.overPct > 40 ? 700 : undefined }}>
                {r.overPct.toFixed(1) + '%'}
              </span>
            ) },
            { key: 'claimRs', label: 'Claimable', align: 'center', render: (_, r) => (
              r.claimRs > 0
                ? <span style={{ color: C.red.tx, fontWeight: 700 }}>{fmt(r.claimRs)}</span>
                : <span style={{ color: C.t3 }}>—</span>
            ) },
          ]}
          rows={courierRows}
        />
        )}
        {courierRows.length === 1 && (
          <div style={{ fontSize: 11.5, color: C.t3, marginTop: 8 }}>
            Courier-vs-courier comparison unlocks once bills from other partners are uploaded.
          </div>
        )}
      </Card>

      {/* ── Weight slab cost analysis ── */}
      {/* Replaces the Prepaid-vs-COD donuts, which restated a KPI tile. Cost per billable
          slab answers something nothing else on the page did: where the money sits by weight,
          and which slabs carry the overbilling. Slab is the courier's charged weight rounded
          how they bill it — 0.5 kg floor, then up to the next whole kg. */}
      <div style={{ marginTop: 14 , ...(secHid['courier'] ? { display: 'none' } : {}) }}>
        <Card title="Weight slab detail"
          note={isMobile ? "" : "spend, unit cost and leg split per billable slab"}
          action={isMobile ? (
            <input
              value={slabSearch} onChange={e => setSlabSearch(e.target.value)}
              placeholder="Search…"
              style={{ fontSize: 11.5, padding: '4px 8px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.bg, color: C.t1, outline: 'none', width: 100 }}
            />
          ) : null}>
          {isMobile ? (
            <>
              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 320, marginLeft: -8, marginRight: -8, WebkitOverflowScrolling: 'touch' }}>
                <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content', minWidth: '100%', fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border2}` }}>
                      <th style={{ position: 'sticky', top: 0, left: 0, background: C.card, zIndex: 3, padding: '5px 8px', textAlign: 'left', fontWeight: 800, color: C.t1, width: 60, whiteSpace: 'nowrap', borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border2}` }}>Wt Slab</th>
                      <th style={{ position: 'sticky', top: 0, background: C.card, padding: '5px 4px', textAlign: 'center', fontWeight: 800, color: C.t1, width: 72, whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border2}` }}>Shipments</th>
                      <th style={{ position: 'sticky', top: 0, background: C.card, padding: '5px 4px', textAlign: 'center', fontWeight: 800, color: C.t1, width: 72, whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border2}` }}>Cost</th>
                      <th style={{ position: 'sticky', top: 0, background: C.card, padding: '5px 4px', textAlign: 'center', fontWeight: 800, color: C.t1, width: 72, whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border2}` }}>Avg/Ship</th>
                      <th style={{ position: 'sticky', top: 0, background: C.card, padding: '5px 4px', textAlign: 'center', fontWeight: 800, color: C.t1, width: 66, whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border2}` }}>Cost/kg</th>
                      <th style={{ position: 'sticky', top: 0, background: C.card, padding: '5px 4px', textAlign: 'center', fontWeight: 800, color: C.t1, width: 66, whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border2}` }}>Forward</th>
                      <th style={{ position: 'sticky', top: 0, background: C.card, padding: '5px 4px', textAlign: 'center', fontWeight: 800, color: C.t1, width: 66, whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border2}` }}>Reverse</th>
                      <th style={{ position: 'sticky', top: 0, background: C.card, padding: '5px 4px', textAlign: 'center', fontWeight: 800, color: C.t1, width: 58, whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border2}` }}>RTO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slabRows.filter(r => {
                      const q = slabSearch.trim().toLowerCase()
                      const label = `${r.slab} kg`.toLowerCase()
                      return q === '' || label === q || (label.startsWith(q) && !q.includes('kg'))
                    }).map((r, i, arr) => (
                      <tr key={r.slab} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${C.border2}` : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                        <td style={{ position: 'sticky', left: 0, background: C.card, zIndex: 1, padding: '5px 8px', fontWeight: 700, color: C.t1, whiteSpace: 'nowrap', borderRight: `1px solid ${C.border}` }}>{r.slab} kg</td>
                        <td style={{ padding: '5px 4px', textAlign: 'center', color: C.t1 }}>{fmtBig(r.n)}</td>
                        <td style={{ padding: '5px 4px', textAlign: 'center', color: C.t1 }}>{fmt(r.cost)}</td>
                        <td style={{ padding: '5px 4px', textAlign: 'center', color: C.t1 }}>₹{r.avgCost.toFixed(0)}</td>
                        <td style={{ padding: '5px 4px', textAlign: 'center', color: C.t1 }}>₹{r.cpk.toFixed(1)}</td>
                        <td style={{ padding: '5px 4px', textAlign: 'center', color: C.t1 }}>{r.fwdAvg ? '₹' + r.fwdAvg.toFixed(0) : '—'}</td>
                        <td style={{ padding: '5px 4px', textAlign: 'center', color: C.t1 }}>{r.revAvg ? '₹' + r.revAvg.toFixed(0) : '—'}</td>
                        <td style={{ padding: '5px 4px', textAlign: 'center', color: C.t1 }}>{r.rtoAvg ? '₹' + r.rtoAvg.toFixed(0) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
          <DataTable
            columns={[
              { key: 'slab', label: 'Weight Slab', render: (_, r) => (
                <span style={{ fontWeight: 700 }}>{r.slab} kg</span>
              ) },
              { key: 'n', label: 'Shipments', align: 'center', render: (_, r) => fmtN(r.n) },
              { key: 'cost', label: 'Total Spend', align: 'center', render: (_, r) => fmt(r.cost) },
              { key: 'avgCost', label: 'Avg Cost / Shipment', align: 'center', render: (_, r) => '₹' + r.avgCost.toFixed(0) },
              { key: 'cpk', label: 'Cost / kg', align: 'center', render: (_, r) => '₹' + r.cpk.toFixed(1) },
              { key: 'fwdAvg', label: 'Forward', align: 'center', render: (_, r) => (r.fwdAvg ? '₹' + r.fwdAvg.toFixed(0) : '—') },
              { key: 'revAvg', label: 'Reverse', align: 'center', render: (_, r) => (r.revAvg ? '₹' + r.revAvg.toFixed(0) : '—') },
              { key: 'rtoAvg', label: 'RTO', align: 'center', render: (_, r) => (r.rtoAvg ? '₹' + r.rtoAvg.toFixed(0) : '—') },
            ]}
            rows={slabRows}
            search searchKeys={['slab']} searchPlaceholder="Find a weight slab…"
            maxRows={200}
            maxHeight={420}
          />
          )}
        </Card>

      {/* ── Recoverable, split by cause ── */}
      </div>
      {/* Weight overbilling only — the courier charged for weight we did not ship, the one
          dispute backed by our own declared figures rather than by a card inferred from
          their invoices. Rate variance sits beside it as a diagnostic, never summed in. */}
      {recoverRows.length > 0 && (
        <>
          <SectionHdr title="Recoverable"
            note={`${fmt(recoverTotals.infl)} claimable on weight across ${recoverRows.length} partners · ${fmt(recoverTotals.unexp)} rate variance shown separately, not invoiceable`} collapsed={secHid['recover']} onToggle={() => toggleSec('recover')} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 14 , ...(secHid['recover'] ? { display: 'none' } : {}) }}>
            <Card style={{ display: 'flex', flexDirection: 'column' }} title="Spend and claim by courier"
              note="bars = total spend (left axis) · line = claim as % of that courier's spend (right axis)">
              <div style={{ flex: 1, minHeight: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={courierSpendRows} margin={{ top: 10, right: 14, left: 4, bottom: 4 }}>
                    <CartesianGrid stroke={VIZ.grid} vertical={false} />
                    <XAxis dataKey="courier" tick={{ fontSize: 9.5, fill: VIZ.muted }}
                      axisLine={{ stroke: VIZ.axis }} tickLine={false} interval={0}
                      angle={-25} textAnchor="end" height={52} />
                    <YAxis yAxisId="spend" tick={{ fontSize: 11, fill: VIZ.muted }}
                      axisLine={false} tickLine={false} tickFormatter={v => fmt(v)} />
                    {/* Second axis is unavoidable: spend spans ₹1.5 L to ₹4.29 Cr while the
                        claim rate spans 0-8%. Bar-vs-line separates the encodings so neither
                        is read against the wrong scale. */}
                    <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 11, fill: VIZ.muted }}
                      axisLine={false} tickLine={false} tickFormatter={v => v.toFixed(0) + '%'} />
                    <Tooltip cursor={{ fill: 'rgba(11,11,11,0.04)' }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        const r = payload[0].payload
                        return (
                          <div style={{ background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, padding: '9px 11px', boxShadow: '0 6px 20px rgba(0,0,0,.12)' }}>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t1, marginBottom: 5 }}>{label}</div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>{fmt(r.spend)}</div>
                            <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>total spend</div>
                            <div style={{ fontSize: 11.5, color: C.red.tx, marginTop: 5, fontWeight: 600 }}>
                              {fmt(r.claim)} claimable · {r.claimPct.toFixed(2)}% of their spend
                            </div>
                          </div>
                        )
                      }} />
                    <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 4 }} />
                    <Bar yAxisId="spend" dataKey="spend" name="Total spend" fill={SERIES.blue}
                      fillOpacity={0.82} radius={[4, 4, 0, 0]} maxBarSize={38} />
                    <Line yAxisId="pct" type="monotone" dataKey="claimPct" name="Claim % of spend"
                      stroke={SERIES.orange} strokeWidth={2.5}
                      dot={{ r: 3.5, fill: SERIES.orange, stroke: VIZ.surface, strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: SERIES.orange, stroke: VIZ.surface, strokeWidth: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Escalation priority"
              note="what each courier over-billed, and how concentrated it is">
              <DataTable
                columns={[
                  { key: 'courier', label: 'Courier', render: v => <CourierCell name={v} /> },
                  // Renamed from 'Total Claim': it is the over-billed amount, and saying so
                  // removes the guesswork about what the number represents.
                  { key: 'recInfl', label: 'Claimable (Weight)', align: 'center', render: (_, r) => (
                    <span style={{ fontWeight: 700, color: C.red.tx }}>{fmt(r.recInfl)}</span>
                  ) },
                  // Rate variance kept visible but plainly separate: it is measured against
                  // the courier own derived card, so it flags inconsistency, not a claim.
                  { key: 'recUnexp', label: 'Rate Variance', align: 'center', render: (_, r) => (
                    <span style={{ color: C.t2 }}>{r.recUnexp > 0 ? fmt(r.recUnexp) : '—'}</span>
                  ) },
                  // How many shipments it sits on, out of how many we could price. Without
                  // this the per-shipment figure has no visible denominator.
                  { key: 'disputedN', label: 'Shipments Affected', align: 'center', render: (_, r) => (
                    <span>
                      {fmtN(r.disputedN)}
                      <span style={{ fontSize: 10.5, color: C.t3 }}> of {fmtN(r.shipments)}</span>
                    </span>
                  ) },
                  { key: 'recPerShipment', label: 'Avg per Affected', align: 'center', render: (_, r) => (
                    <span style={{ color: C.t2 }}>₹{r.recPerShipment.toFixed(0)}</span>
                  ) },
                  // Intensity: over-billing as a share of what we pay that courier. Ranks by
                  // how wrong the billing is rather than by partner size.
                  { key: 'recPctFreight', label: '% of Their Bill', align: 'center', render: (_, r) => (
                    <span style={{ color: r.recPctFreight > 12 ? C.red.tx : undefined, fontWeight: r.recPctFreight > 12 ? 700 : undefined }}>
                      {r.recPctFreight.toFixed(1)}%
                    </span>
                  ) },
                ]}
                rows={recoverRows}
              />
            </Card>
          </div>
        </>
      )}


      {/* ── Cost by product ── */}
      <SectionHdr title="Cost by Product"
        note={isMobile ? "" : "category → sub-category, per shipment by leg. RTO is the return leg only"} collapsed={secHid['product']} onToggle={() => toggleSec('product')} />
      <div style={secHid['product'] ? { display: 'none' } : undefined}>
        <Card title="Category detail" note={isMobile ? "" : "click a category to open its sub-categories"}
          action={isMobile ? (
            <input value={subQuery} onChange={e => setSubQuery(e.target.value)}
              placeholder="Search…"
              style={{ fontSize: 11.5, padding: '4px 8px', width: 100, borderRadius: 7, border: `1px solid ${C.border2}`, background: C.bg, color: C.t1, outline: 'none' }} />
          ) : null}>
          {/* Own search box rather than DataTable's: a collapsed category never emits its
              children, so filtering finished rows could not reach a sub-category. This
              query feeds productRows, which expands matching parents as it builds. */}
          {!isMobile && <div style={{ marginBottom: 8 }}>
            <input value={subQuery} onChange={e => setSubQuery(e.target.value)}
              placeholder="Find a category or sub-category…"
              style={{
                fontFamily: 'var(--font)', fontSize: 11.5, padding: '6px 10px', width: 260,
                borderRadius: 7, border: `1.5px solid ${subQuery.trim() ? C.acm : C.border2}`,
                background: subQuery.trim() ? C.acl : C.card, color: C.t1, outline: 'none',
              }} />
            {subQuery.trim() && (
              <span style={{ fontSize: 11, color: C.t3, marginLeft: 9 }}>
                {productRows.filter(r => r.isSub).length} sub-categories
                <button onClick={() => setSubQuery('')}
                  style={{ marginLeft: 8, border: 'none', background: 'none', color: C.t3, cursor: 'pointer', fontSize: 11, textDecoration: 'underline', padding: 0, fontFamily: 'var(--font)' }}>clear</button>
              </span>
            )}
          </div>}
          <DataTable
            columns={[
              // Left-aligned so the indented sub-category names still read as a hierarchy.
              { key: 'label', label: isMobile ? 'Category' : 'Category / Sub-category', width: isMobile ? 129 : undefined, sticky: isMobile ? true : undefined, render: (_, r) => (
                isMobile && r.isSub ? null :
                r.isSub
                  ? <span onClick={e => { e.stopPropagation(); setCatTooltip(r.label) }} style={{ paddingLeft: 16, color: VIZ.muted, display: 'block', maxWidth: isMobile ? 129 : undefined, overflow: isMobile ? 'hidden' : 'visible', textOverflow: isMobile ? 'ellipsis' : 'unset', whiteSpace: isMobile ? 'nowrap' : 'normal' }}>{r.label}</span>
                  : <span style={{ fontWeight: 700, cursor: 'pointer', display: 'block', maxWidth: isMobile ? 129 : undefined, overflow: isMobile ? 'hidden' : 'visible', textOverflow: isMobile ? 'ellipsis' : 'unset', whiteSpace: isMobile ? 'nowrap' : 'normal' }}
                      onClick={() => toggleCat(r.label)}>
                      {!isMobile && <span style={{ display: 'inline-block', width: 12, color: VIZ.muted }}>
                        {r.hasKids ? (r.open ? '−' : '+') : ''}
                      </span>}{r.label}
                    </span>
              ) },
              { key: 'n', label: 'Shipments', align: 'center', render: (_, r) => fmtN(r.n) },
              { key: 'cost', label: isMobile ? 'Spend' : 'Total Spend', align: 'center', render: (_, r) => fmt(r.cost) },
              { key: 'fwd', label: 'Forward', align: 'center', render: (_, r) => r.fwd ? fmt(r.fwd) : '—' },
              { key: 'rev', label: 'Reverse', align: 'center', render: (_, r) => r.rev ? fmt(r.rev) : '—' },
              { key: 'rto', label: 'RTO', align: 'center', render: (_, r) => r.rto ? fmt(r.rto) : '—' },
              // Cost to serve one order: forward + reverse + RTO, each scaled by how often it
              // actually happens (return count ÷ forward count). Forward is the denominator
              // because every order has one; returns are the exception at 3-21%. A raw sum of
              // the three averages would assume every shipment goes out, is picked up AND is
              // RTO'd — overstating Footwear by ~2.5x (₹264 vs ₹103).
              { key: 'ctsReal', label: 'Avg. Logistic Cost', align: 'center', render: (_, r) => (
                r.ctsReal ? <span style={{ fontWeight: 700 }}>{fmt(r.ctsReal)}</span> : '—'
              ) },
              // Sub-category rows show the billable SLAB from the item master — one real value
              // the courier charges on. Category rows show the shipment-weighted average
              // product weight instead, because a category spans products of different weights
              // and no single slab is true for all of them.
              { key: 'slab', label: 'Weight Slab', align: 'center', render: (_, r) => {
                if (r.masterSlab > 0) return <strong>{r.masterSlab} kg</strong>
                return r.masterKg > 0 ? <strong>{r.masterKg.toFixed(2)} kg</strong> : '—'
              } },
              { key: 'vw', label: 'Volumetric Weight', align: 'center', render: (_, r) => (r.vw ? r.vw.toFixed(2) + ' kg' : '—') },
            ]}
            rows={productRows}
            maxHeight={480}
            maxRows={200}
            style={isMobile ? { marginLeft: -8, marginRight: -8 } : undefined}
          />
          {isMobile && catTooltip ? (
            <div onClick={() => setCatTooltip('')}
              style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: C.card, border: `1px solid ${C.border2}`, borderRadius: 10, padding: '12px 16px', maxWidth: 260, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', fontSize: 13, fontWeight: 600, color: C.t1, textAlign: 'center' }}>
                {catTooltip}
                <div style={{ fontSize: 11, color: C.t3, marginTop: 6 }}>tap anywhere to close</div>
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      {/* ── Like-for-like courier comparison ── */}
      {activeCell && (
        <>
          <SectionHdr title="Like-for-Like Courier Cost"
            note={isMobile ? "" : "same zone, same weight slab, same leg — the only fair comparison"} collapsed={secHid['lfl']} onToggle={() => toggleSec('lfl')} />
          {/* Three independent multi-selects instead of one combined dropdown. Selecting
              nothing in a row means ALL of it, so the card always has data to show. */}
          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10, ...(secHid['lfl'] ? { display: 'none' } : {}) }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.t2, whiteSpace: 'nowrap', letterSpacing: '0.03em', minWidth: 32 }}>Zone</span>
                <ChipRow options={lflOptions.zones} selected={lflZones} small
                  onToggle={z => setLflZones(t => t.includes(z) ? t.filter(x => x !== z) : [...t, z])} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', flexWrap: 'nowrap' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.t2, whiteSpace: 'nowrap', letterSpacing: '0.03em', minWidth: 28, flexShrink: 0 }}>Slab</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', flexShrink: 0 }}>
                  {lflOptions.bands.map(b => {
                    const on = lflBands.includes(b)
                    return <button key={b} onClick={() => setLflBands(t => t.includes(b) ? t.filter(x => x !== b) : [...t, b])}
                      style={{ border: `1.5px solid ${on ? C.acm : C.border2}`, cursor: 'pointer', background: on ? C.acl : C.card, color: C.t1, fontSize: 11, fontWeight: on ? 700 : 500, padding: '3px 6px', borderRadius: 6, fontFamily: 'var(--font)', whiteSpace: 'nowrap', flexShrink: 0 }}>{b}</button>
                  })}
                </div>
                <SlabDropdown value={lflSlab} onChange={setLflSlab} slabs={lflOptions.slabs} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.t2, whiteSpace: 'nowrap', letterSpacing: '0.03em', minWidth: 32 }}>Leg</span>
                <ChipRow options={lflOptions.legs} selected={lflLegs} small
                  onToggle={l => setLflLegs(t => t.includes(l) ? t.filter(x => x !== l) : [...t, l])} />
              </div>
            </div>
          ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 12, ...(secHid['lfl'] ? { display: 'none' } : {}) }}>
            <div>
              <div className="kpi-label" style={{ marginBottom: 6 }}>ZONE</div>
              <ChipRow options={lflOptions.zones} selected={lflZones}
                onToggle={z => setLflZones(t => t.includes(z) ? t.filter(x => x !== z) : [...t, z])} />
            </div>
            <div>
              <div className="kpi-label" style={{ marginBottom: 6 }}>WEIGHT SLAB</div>
              <ChipRow options={lflOptions.bands} selected={lflBands}
                onToggle={b => setLflBands(t => t.includes(b) ? t.filter(x => x !== b) : [...t, b])} />
            </div>
            <div>
              <div className="kpi-label" style={{ marginBottom: 6 }}>SHIPMENT LEG</div>
              <ChipRow options={lflOptions.legs} selected={lflLegs}
                onToggle={l => setLflLegs(t => t.includes(l) ? t.filter(x => x !== l) : [...t, l])} />
            </div>
            <div>
              <div className="kpi-label" style={{ marginBottom: 6 }}>SPECIFIC SLAB</div>
              <select value={lflSlab} onChange={e => setLflSlab(e.target.value)}
                style={{
                  fontFamily: 'var(--font)', fontSize: 11, padding: '6px 9px',
                  borderRadius: 7, border: `1.5px solid ${lflSlab !== '' ? C.acm : C.border2}`,
                  background: lflSlab !== '' ? C.acl : C.card, color: C.t1, cursor: 'pointer',
                }}>
                <option value="">All slabs</option>
                {lflOptions.slabs.map(sv => (
                  <option key={sv} value={sv}>{sv} kg</option>
                ))}
              </select>
            </div>
          </div>
          )}
          <Card style={secHid['lfl'] ? { display: 'none' } : undefined}
            title={[
              activeCell.allZones ? 'All zones' : 'Zone ' + activeCell.zones.join(', '),
              activeCell.slab !== '' ? activeCell.slab + ' kg slab'
                : activeCell.allBands ? 'all weights' : activeCell.bands.join(', '),
              activeCell.allLegs ? 'all legs' : activeCell.legs.join(', '),
            ].join(' · ')}
            note={activeCell.rows.length
              ? (isMobile ? '' : `${fmtN(activeCell.n)} shipments · min 50 per courier per cell`)
              : 'no shipments match this combination'}
          >
          {/* Empty and single-courier results render an explanation instead of a blank
              chart. Returning null from activeCell used to unmount this entire section —
              zone E is served by one courier — leaving no filters to click back with. */}
          {!activeCell.rows.length ? (
            <div style={{ fontSize: 12.5, color: C.t2, padding: '16px 0' }}>
              Nothing matches this combination. A courier needs 50+ shipments in the cell to
              appear, so a narrow zone, slab and leg together can rule everything out —
              widen any one of them.
            </div>
          ) : (
          <>
            {!activeCell.comparable && (
              <div style={{ fontSize: 11.5, color: C.t2, marginBottom: 10 }}>
                Only one courier ships this combination, so there is nothing to compare
                against — the figures below are that courier alone.
              </div>
            )}
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activeCell.rows} layout="vertical" margin={{ top: 10, right: 46, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke={VIZ.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: VIZ.muted }} axisLine={false} tickLine={false}
                    tickFormatter={v => '₹' + v.toFixed(0)} />
                  <YAxis type="category" dataKey="courier" width={82} tick={{ fontSize: 11, fill: VIZ.muted }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(11,11,11,0.04)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const r = payload[0].payload
                      const best = activeCell.rows[0]
                      const delta = r.avgCost - best.avgCost
                      return (
                        <div style={{ background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, padding: '9px 11px', boxShadow: '0 6px 20px rgba(0,0,0,.12)' }}>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t1, marginBottom: 5 }}>{r.courier}</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>₹{r.avgCost.toFixed(2)}</div>
                          <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>
                            {fmtN(r.n)} shipments · ₹{r.cpk.toFixed(2)}/kg
                            {delta > 0.01 && <><br />₹{delta.toFixed(2)} above {best.courier}</>}
                          </div>
                        </div>
                      )
                    }} />
                  <Bar dataKey="avgCost" name="Avg ₹ / shipment" radius={[0, 4, 4, 0]} maxBarSize={26}>
                    {activeCell.rows.map((r, i) => (
                      // Cheapest in the cell is highlighted; the rest recede.
                      <Cell key={r.courier} fill={i === 0 ? SERIES.aqua : SERIES.blue} fillOpacity={i === 0 ? 1 : 0.55} />
                    ))}
                    <LabelList dataKey="avgCost" position="right" offset={8} fontSize={10.5}
                      fontWeight={700} fill={C.t2} formatter={v => '₹' + num(v).toFixed(0)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {isMobile ? (
              <div style={{ overflowX: 'auto', marginLeft: -8, marginRight: -8, WebkitOverflowScrolling: 'touch' }}>
                <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content', minWidth: '100%', fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border2}` }}>
                      <th style={{ position: 'sticky', left: 0, background: C.card, zIndex: 2, padding: '5px 8px', textAlign: 'left', fontWeight: 700, color: C.t2, width: 100, whiteSpace: 'nowrap', borderRight: `1px solid ${C.border}` }}>Courier</th>
                      <th style={{ padding: '5px 2px', textAlign: 'center', fontWeight: 700, color: C.t2, width: 50, whiteSpace: 'nowrap' }}>Shipments</th>
                      <th style={{ padding: '5px 2px', textAlign: 'center', fontWeight: 700, color: C.t2, width: 48, whiteSpace: 'nowrap' }}>Avg ₹</th>
                      <th style={{ padding: '5px 2px', textAlign: 'center', fontWeight: 700, color: C.t2, width: 44, whiteSpace: 'nowrap' }}>₹/kg</th>
                      <th style={{ padding: '5px 2px', textAlign: 'center', fontWeight: 700, color: C.t2, width: 68, whiteSpace: 'nowrap' }}>Vs Cheap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCell.rows.map((r, i) => {
                      const d = r.avgCost - activeCell.rows[0].avgCost
                      return (
                        <tr key={r.courier} style={{ borderBottom: i < activeCell.rows.length - 1 ? `1px solid ${C.border2}` : 'none' }}>
                          <td style={{ position: 'sticky', left: 0, background: C.card, zIndex: 1, padding: '5px 8px', fontWeight: 600, color: C.t1, whiteSpace: 'nowrap', borderRight: `1px solid ${C.border}` }}><CourierCell name={r.courier} /></td>
                          <td style={{ padding: '5px 2px', textAlign: 'center', color: C.t1 }}>{fmtBig(r.n)}</td>
                          <td style={{ padding: '5px 2px', textAlign: 'center', color: C.t1 }}>₹{r.avgCost.toFixed(2)}</td>
                          <td style={{ padding: '5px 2px', textAlign: 'center', color: C.t1 }}>₹{r.cpk.toFixed(2)}</td>
                          <td style={{ padding: '5px 2px', textAlign: 'center' }}>{d < 0.01 ? <span style={{ color: C.green.tx, fontWeight: 700 }}>cheap</span> : <span style={{ color: C.red.tx }}>{'+₹' + d.toFixed(2)}</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
            <DataTable
              columns={[
                { key: 'courier', label: 'Courier', render: v => <CourierCell name={v} /> },
                { key: 'n', label: 'Shipments', align: 'center', render: (_, r) => fmtN(r.n) },
                { key: 'avgCost', label: 'Avg ₹', align: 'center', render: (_, r) => '₹' + r.avgCost.toFixed(2) },
                { key: 'cpk', label: '₹/kg', align: 'center', render: (_, r) => '₹' + r.cpk.toFixed(2) },
                { key: 'vs', label: 'vs cheapest', align: 'center', render: (_, r) => {
                  const d = r.avgCost - activeCell.rows[0].avgCost
                  return d < 0.01
                    ? <span style={{ color: C.green.tx, fontWeight: 700 }}>cheapest</span>
                    : <span style={{ color: C.red.tx }}>{'+₹' + d.toFixed(2)}</span>
                } },
              ]}
              rows={activeCell.rows}
            />
            )}
            {!isMobile && <div style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>
              Cost only — this does not account for SLA, coverage or damage rates. Confirm
              service levels are comparable before shifting volume.
            </div>}
          </>
          )}
          </Card>
        </>
      )}

      {/* Top Lanes removed from this tab. The B2C origin/destination columns are not
          clean enough to lane-analyse: 75,539 rows have no origin city (rendered as
          "?") and city casing is inconsistent (Mumbai / MUMBAI / mumbai), so one real
          lane was being split across several rows and counted separately. Restore this
          once cities are normalised at upload — the B2B tab carries lane analysis on
          data that does support it.

          The B2B Freight invoice table also moved: it now lives on the B2B tab. */}
      </>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {loading && (
        <div style={{ height: 2, background: C.border, flexShrink: 0 }}>
          <div className="progress-bar" style={{ height: '100%', background: C.acc }} />
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {!isMobile && sidebar}

        {/* Sidebar collapse handle — desktop only */}
        {!isMobile && (
          <button onClick={() => setSidebarOpen(o => !o)}
            style={{ width: 16, alignSelf: 'flex-start', marginTop: 20, height: 48, border: `1px solid ${C.border}`, borderLeft: 'none', background: C.card, cursor: 'pointer', borderRadius: '0 6px 6px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.t3, fontSize: 12, flexShrink: 0, boxShadow: '2px 0 4px rgba(0,0,0,0.06)', padding: 0 }}>
            {sidebarOpen ? '‹' : '›'}
          </button>
        )}

        <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '6px 8px 40px' : '6px 20px 40px' }}>
          {/* Scope tabs: which ledger this page is reporting on. Sits above everything
              it scopes, alongside the filter summary. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 2, marginBottom: 18 }}>
            <div style={{ display: 'inline-flex', background: C.bg, borderRadius: 9, padding: 3, gap: 2 }}>
              {SCOPES.map(sc => {
                const on = scope === sc.id
                return (
                  <button key={sc.id} onClick={() => setScope(sc.id)}
                    title={sc.hint}
                    style={{
                      border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
                      fontSize: 12, fontWeight: on ? 700 : 500,
                      padding: '6px 14px', borderRadius: 7,
                      background: on ? C.acc : 'transparent',
                      color: on ? '#1a1400' : C.t2,
                      transition: 'all .15s',
                    }}>
                    {sc.label}
                  </button>
                )
              })}
            </div>
            {activeCount > 0 && scope !== 'b2b' && <Badge type="blue">{activeCount} filter{activeCount === 1 ? '' : 's'} active</Badge>}
            {loading && <span style={{ fontSize: 11.5, color: C.t3 }}>Refreshing…</span>}
            {/* The Lanes toggle went with the Top Lanes table it controlled. */}
          </div>
          {scope === 'b2b' && (
            <div style={{ fontSize: 11, color: C.t3, marginTop: -10, marginBottom: 14 }}>
              B2B freight is trip-billed, so the sidebar's courier/zone/weight filters don't apply here.
            </div>
          )}
          {/* Refetch holds the previous render at reduced opacity — no skeleton flash,
              no layout jump, per the interaction rules. */}
          <div style={{ opacity: loading && agg ? 0.55 : 1, transition: 'opacity .18s ease' }}>
            {content}
          </div>
        </div>
      </div>
    </div>
  )
}
