import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
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
const MODE_COLOR = { Forward: SERIES.blue, Reverse: SERIES.orange, RTO: SERIES.orange }

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
    trendAll: j.trendAll || [],
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
    <div className="kpi-card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
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
    <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '18px 22px' }}>
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
      {sub && <div className="kpi-sub" style={{ fontSize: 13, marginTop: 6 }}>{sub}</div>}
      {children && <div style={{ flex: 1, minHeight: 48, paddingTop: 10 }}>{children}</div>}
    </div>
  )
}

function SectionHdr({ title, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '22px 0 11px' }}>
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
function ChipRow({ options, selected, onToggle }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {(options || []).map(o => {
        const on = selected.includes(o)
        return (
          <button key={o} onClick={() => onToggle(o)}
            style={{
              border: `1.5px solid ${on ? C.acm : C.border2}`, cursor: 'pointer',
              background: on ? C.acl : C.card, color: C.t1,
              fontSize: 11, fontWeight: on ? 700 : 500, padding: '5px 11px',
              borderRadius: 7, fontFamily: 'var(--font)', whiteSpace: 'nowrap',
            }}>
            {o}
          </button>
        )
      })}
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end' }}>
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
    add('claimable_n', r.claimable_n)
    add('rc_entitled', r.rc_entitled); add('rc_carrier', r.rc_carrier)
  }
  const byZone = {}, byMode = {}, byMonth = {}, byCourier = {}, byPay = {}
  for (const r of rows) {
    if (r.zone)    acc(byZone,    r.zone,    r)
    if (r.mode)    acc(byMode,    r.mode,    r)
    if (r.month)   acc(byMonth,   r.month,   r)
    if (r.courier_name) acc(byCourier, r.courier_name, r)
    if (r.payment) acc(byPay,     r.payment, r)
  }
  const toArr = (map) => Object.entries(map).map(([key, v]) => ({ key, ...v }))
  return { byZone: toArr(byZone), byMode: toArr(byMode), byMonth: toArr(byMonth), byCourier: toArr(byCourier), byPay: toArr(byPay) }
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

export default function LogisticsCostPage() {
  const [agg, setAgg] = useState(null)
  const [b2bRows, setB2bRows] = useState(null)
  // B2B aggregates (lanes, transporters, months, freight types) for the B2B tab.
  const [b2b, setB2b] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const API = import.meta.env.VITE_API_URL || ''
  const [filters, setFilters] = useState(EMPTY_FILTERS)
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
            if (age < 2 * 60 * 60 * 1000) { j = data }
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
      }))
    // No indexing: the trend chart plots native ₹, so there is nothing to normalise.
    return rows
  }, [agg])

  // Monthly Trend runs on the UNFILTERED series. The slicers scope the rest of the page,
  // but "is our total freight bill rising" must answer the same way regardless of which
  // courier or zone is selected — a filtered line reads as a spend drop when it is only a
  // narrower question. monthSeries stays slicer-scoped because the MoM/YoY deltas on the
  // KPI cards describe the filtered view they sit next to.
  // Window for the Monthly Trend chart alone: 1, 3 or 6 months back, or everything.
  // Independent of the sidebar filters, which the trend deliberately ignores.
  const [trendMonths, setTrendMonths] = useState(6)

  const trendRows = useMemo(() => (agg?.trendAll || []).map(r => {
    const cost = Number(r.cost) || 0
    const n = Number(r.n) || 0
    const wt = Number(r.wt) || 0
    const value = Number(r.value) || 0
    return {
      month: monthLabel(r.month_year), raw: r.month_year,
      cost, shipments: n, wt, value,
      pctGmv: value > 0 ? (cost / value) * 100 : null,
      avgCost: n ? cost / n : 0,
      cpk: perKg(cost, wt) ?? 0,
    }
  }), [agg])

  // The chart and its table both read this — the last N periods of the full series.
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

  const payRows = useMemo(() => {
    if (!agg) return []
    return Object.entries(agg.byPay)
      .map(([k, b]) => ({ k, n: b.n, cost: b.cost, avgCost: b.n ? b.cost / b.n : 0 }))
      .sort((a, b) => b.cost - a.cost)
  }, [agg])

  const courierRows = useMemo(() => {
    if (!agg) return []
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
      }))
      .sort((a, b) => b.cost - a.cost)
  }, [agg])

  // ── Rate drift ──
  // Pivot (month, courier, cpk) into one row per month with a column per courier, which
  // is the shape a multi-line chart needs. Couriers are ordered by spend so the biggest
  // ones take the leading colour slots.
  const driftCouriers = useMemo(() => {
    if (!agg?.rateDrift?.length) return []
    const spend = {}
    for (const r of agg.rateDrift) spend[r.courier_name] = (spend[r.courier_name] || 0) + Number(r.n)
    return Object.keys(spend).sort((a, b) => spend[b] - spend[a]).slice(0, DRIFT_COLORS.length)
  }, [agg])

  const driftSeries = useMemo(() => {
    if (!agg?.rateDrift?.length) return []
    const byMonth = {}
    for (const r of agg.rateDrift) {
      if (!driftCouriers.includes(r.courier_name)) continue
      byMonth[r.month_year] ??= { month: monthLabel(r.month_year), raw: r.month_year }
      byMonth[r.month_year][r.courier_name] = Number(r.cpk)
    }
    return Object.values(byMonth).sort((a, b) => a.raw.localeCompare(b.raw))
  }, [agg, driftCouriers])

  // First vs latest ₹/kg per courier — the drift figure management acts on.
  const driftRows = useMemo(() => {
    if (!agg?.rateDrift?.length) return []
    const by = {}
    for (const r of agg.rateDrift) {
      (by[r.courier_name] ??= []).push({ m: r.month_year, cpk: Number(r.cpk) })
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
  const recoverRows = useMemo(
    () => [...courierRows].filter(r => r.recTotal > 0).sort((a, b) => b.recTotal - a.recTotal)
      .map(r => ({
        ...r,
        // Rupees alone rank by size, which hides intensity: Ekart's ₹1.14 L is 27.5% of
        // what we pay them, while Bluedart's ₹30.4 L is 9.9% of theirs. The percentage is
        // what says "this partner's billing is systematically off" rather than "this
        // partner is large", so both are carried.
        recPctFreight: r.cost ? (r.recTotal / r.cost) * 100 : 0,
        recPerShipment: r.shipments ? r.recTotal / r.shipments : 0,
        // Share of the claim that needs no argument — the courier already conceded it.
        admitPct: r.recTotal ? (r.recAdmit / r.recTotal) * 100 : 0,
      })),
    [courierRows]
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

  // Worst offender by INTENSITY, not size. A 1,000-shipment floor keeps a tiny partner
  // with a freak percentage from being presented as the headline problem.
  const worstIntensity = useMemo(() => {
    const eligible = recoverRows.filter(r => r.shipments >= 1000)
    return eligible.length
      ? eligible.reduce((a, r) => (r.recPctFreight > a.recPctFreight ? r : a))
      : null
  }, [recoverRows])

  // Like-for-like: pick one (zone, slab) cell and compare couriers inside it. Holding
  // both constant is the only fair basis for a switching decision — a raw per-shipment
  // average just reflects whose parcels are heavier.
  // ── Like-for-like: three independent multi-select filters ──
  // Replaces a single dropdown over pre-joined (zone · band) cells. That forced the
  // comparison into exactly one zone and one slab, so questions like "cheapest across all
  // metro zones for parcels under 2 kg" were unanswerable.
  const lflOptions = useMemo(() => {
    const z = new Set(), b = new Set(), l = new Set()
    for (const r of agg?.likeForLike || []) {
      z.add(r.zone); b.add(r.band); l.add(r.leg)
    }
    // Bands are weight ranges, so they must sort by weight and not as text.
    const bandOrder = ['0 – 1 kg', '1 – 2 kg', '2 – 5 kg', '5 – 10 kg', '10 kg +']
    return {
      zones: [...z].sort(),
      bands: [...b].sort((x, y) => bandOrder.indexOf(x) - bandOrder.indexOf(y)),
      legs: [...l].sort(),
    }
  }, [agg])

  const [lflZones, setLflZones] = useState([])
  const [lflBands, setLflBands] = useState([])
  const [lflLegs, setLflLegs] = useState([])

  // Empty selection means "all", so the card renders something on first paint instead of
  // an empty state that looks broken.
  const pick = (sel, all) => (sel.length ? sel : all)

  const activeCell = useMemo(() => {
    const rows = agg?.likeForLike || []
    if (!rows.length) return null
    const zs = pick(lflZones, lflOptions.zones)
    const bs = pick(lflBands, lflOptions.bands)
    const ls = pick(lflLegs, lflOptions.legs)

    // Re-aggregate across every selected cell rather than reading one pre-built cell.
    // Weighted by shipment count: a straight mean of cell averages would let a 60-shipment
    // cell pull the number as hard as a 60,000-shipment one.
    const byCourier = new Map()
    for (const r of rows) {
      if (!zs.includes(r.zone) || !bs.includes(r.band) || !ls.includes(r.leg)) continue
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

    // Fewer than two couriers is not a comparison.
    if (out.length < 2) return null
    return {
      rows: out,
      n: out.reduce((s, c) => s + c.n, 0),
      zones: zs, bands: bs, legs: ls,
      allZones: zs.length === lflOptions.zones.length,
      allBands: bs.length === lflOptions.bands.length,
      allLegs: ls.length === lflOptions.legs.length,
    }
  }, [agg, lflZones, lflBands, lflLegs, lflOptions])

  // ── Cost by product ──
  // Categories are collapsed by default: 15 categories expand to ~200 sub-category rows,
  // which buries the signal. Expanding is per-category and additive.
  const [openCats, setOpenCats] = useState(() => new Set())
  const toggleCat = useCallback(name => setOpenCats(prev => {
    const next = new Set(prev)
    next.has(name) ? next.delete(name) : next.add(name)
    return next
  }), [])

  const num = v => (Number(v) || 0)

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
    const out = []
    for (const c of agg?.byProduct || []) {
      const fwd = num(c.fwd_avg)
      const kids = c.children || []
      out.push({
        label: c.cat, isSub: false, hasKids: kids.length > 0, open: openCats.has(c.cat),
        n: num(c.n), fwd, rev: num(c.rev_avg), rto: num(c.rto_avg),
        ...costToServe(c),
        cw: num(c.cw_slab_avg), masterKg: num(c.master_kg), masterSlab: num(c.master_slab),
        vw: num(c.vw_avg), cost: num(c.cost),
      })
      if (!openCats.has(c.cat)) continue
      for (const s of [...kids].sort((a, b) => num(b.cost) - num(a.cost))) {
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
  }, [agg, openCats, costToServe])


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
    const weight = Math.max((agg?.dtTheirs || 0) - (agg?.dtOurs || 0), 0)
    const rate = Math.max((agg?.dtInvoiced || 0) - (agg?.dtTheirs || 0), 0)
    const total = weight + rate
    const billed = agg?.dtInvoiced || 0
    return { weight, rate, total, pctOfBilled: billed ? (total / billed) * 100 : 0 }
  }, [agg])

  // What a COD shipment costs above a prepaid one — the fee is real, and at scale it
  // is a lever (COD averages ₹125.41 vs ₹92.34 prepaid).
  const codPremium = useMemo(() => {
    if (!agg) return null
    const cod = agg.byPay.COD, pre = agg.byPay.Prepaid
    if (!cod?.n || !pre?.n) return null
    return cod.cost / cod.n - pre.cost / pre.n
  }, [agg])

  // How much MORE of the cost COD carries than of the volume, in percentage points.
  // This over-index is the actual finding — a cost pie alone can't show it.
  const payShareGap = useMemo(() => {
    if (!agg) return null
    const cod = agg.byPay.COD
    if (!cod?.n) return null
    const totalN = Object.values(agg.byPay).reduce((s, b) => s + b.n, 0)
    const totalCost = Object.values(agg.byPay).reduce((s, b) => s + b.cost, 0)
    if (!totalN || !totalCost) return null
    return (cod.cost / totalCost) * 100 - (cod.n / totalN) * 100
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
  const heroSub = !kpis ? '' : [
    `${fmtBig(kpis.shipments)} invoices`,
    `${fmtKg(kpis.chargedWt)} billed`,
    kpis.costPctValue != null ? `${kpis.costPctValue.toFixed(2)}% of GMV` : null,
  ].filter(Boolean).join(' · ')

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
          options={[{ value: 'over', label: 'Overbilled' }, { value: 'ok', label: 'Clean' }]} />

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
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
          <Hero label="Total Logistics Cost" value={fmt(overall.total)}
            sub={`${fmtN(overall.b2cUnits)} parcels + ${fmtN(overall.b2bUnits)} freight trips`} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 10 }}>
            <Tile label="B2C Courier Spend" value={fmt(overall.b2cCost)}
              sub={`${overall.b2cShare.toFixed(1)}% of total`} />
            <Tile label="B2B Freight Spend" value={fmt(overall.b2bCost)}
              sub={`${overall.b2bShare.toFixed(1)}% of total`} />
            <Tile label="B2C Shipments" value={fmtBig(overall.b2cUnits)}
              sub={'avg ₹' + (overall.b2cCost / (overall.b2cUnits || 1)).toFixed(2) + ' / parcel'} />
            <Tile label="B2B Trips" value={fmtN(overall.b2bUnits)}
              sub={'avg ' + fmt(overall.b2bCost / (overall.b2bUnits || 1)) + ' / trip'} />
            <Tile label="Recoverable (B2C)" value={fmt(kpis.overbilledCost)}
              sub="weight overbilling" accent={C.red.tx} />
            <Tile label="B2B Lanes" value={fmtN(overall.b2bLanes)}
              sub={`${overall.b2bTransporters} transporters`} />
            <Tile label="Freight as % of GMV"
              value={kpis.costPctValue != null ? kpis.costPctValue.toFixed(2) + '%' : '—'}
              sub="B2C declared value" />
            <Tile label="Billing Periods" value={fmtN(overallMonths.length)}
              sub={overallMonths.length ? `${overallMonths[0].month} – ${overallMonths[overallMonths.length - 1].month}` : null} />
          </div>
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
                { key: 'units', label: 'Units', align: 'right', render: (_, r) => `${fmtBig(r.units)} ${r.unitLabel}` },
                { key: 'cost', label: 'Cost', align: 'right', render: (_, r) => fmt(r.cost) },
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
                { key: 'b2c', label: 'B2C', align: 'right', render: (_, r) => fmt(r.b2c) },
                { key: 'b2b', label: 'B2B', align: 'right', render: (_, r) => fmt(r.b2b) },
                { key: 'total', label: 'Total', align: 'right', render: (_, r) => fmt(r.total) },
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
                { key: 'trips', label: 'Trips', align: 'right', render: (_, r) => fmtN(r.trips) },
                { key: 'cost', label: 'Total', align: 'right', render: (_, r) => fmt(r.cost) },
                { key: 'avgCost', label: 'Avg / trip', align: 'right', render: (_, r) => fmt(r.avgCost) },
                { key: 'minCost', label: 'Min', align: 'right', render: (_, r) => fmt(r.minCost) },
                { key: 'maxCost', label: 'Max', align: 'right', render: (_, r) => fmt(r.maxCost) },
                { key: 'spread', label: 'Spread', align: 'right', render: (_, r) => (
                  <span style={{ color: r.trips >= 10 && r.spread > r.avgCost ? C.red.tx : undefined, fontWeight: r.trips >= 10 && r.spread > r.avgCost ? 700 : undefined }}>
                    {fmt(r.spread)}
                  </span>
                ) },
                { key: 'share', label: 'Share', align: 'right', render: (_, r) => <ShareBar pct={r.share}>{r.share.toFixed(1) + '%'}</ShareBar> },
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
                { key: 'trips', label: 'Trips', align: 'right', render: (_, r) => fmtN(r.trips) },
                { key: 'cost', label: 'Cost', align: 'right', render: (_, r) => fmt(r.cost) },
                { key: 'avgCost', label: 'Avg / trip', align: 'right', render: (_, r) => fmt(r.avgCost) },
                { key: 'share', label: 'Share', align: 'right', render: (_, r) => <ShareBar pct={r.share}>{r.share.toFixed(1) + '%'}</ShareBar> },
              ]}
              rows={b2bTransRows}
            />
          </Card>

          <Card title="By freight type" note="FTL = full truck, PTL = part load">
            <DataTable
              columns={[
                { key: 'key', label: 'Type' },
                { key: 'trips', label: 'Trips', align: 'right', render: (_, r) => fmtN(r.trips) },
                { key: 'cost', label: 'Cost', align: 'right', render: (_, r) => fmt(r.cost) },
                { key: 'avgCost', label: 'Avg / trip', align: 'right', render: (_, r) => fmt(r.avgCost) },
                { key: 'share', label: 'Share', align: 'right', render: (_, r) => <ShareBar pct={r.share}>{r.share.toFixed(1) + '%'}</ShareBar> },
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
                { key: 'total_cost', label: 'Total', align: 'right', render: (_, r) => fmt(r.total_cost) },
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
              { key: 'trips', label: 'Trips', align: 'right', render: (_, r) => fmtN(r.trips) },
              { key: 'cost', label: 'Cost', align: 'right', render: (_, r) => fmt(r.cost) },
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
      {/* Hero widened from 1.5fr to 2.2fr: it now carries the MoM badge on the value row and
          a bigger number, so it needs the room. */}
      <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 5fr', gap: 18, alignItems: 'stretch' }}>
        <Hero
          label="Total Logistics Cost"
          value={fmt(kpis.total)}
          deltas={heroDeltas}
          sub={heroSub}
        >
          {/* Sparkline of the same measure the hero reports — one series, so the
              card title names it and no legend is needed. */}
          {monthSeries.length > 1 && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthSeries} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="lcHero" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SERIES.blue} stopOpacity={0.22} />
                    <stop offset="95%" stopColor={SERIES.blue} stopOpacity={0} />
                  </linearGradient>
                </defs>
                {/* Hidden axis bound to `month`. Without an XAxis, Recharts labels the
                    tooltip with the array INDEX — the sparkline was showing "1" instead of
                    "May 2026". hide keeps the chart a clean sparkline while giving the
                    tooltip a real category to name. */}
                <XAxis dataKey="month" hide />
                <Area type="monotone" dataKey="cost" name="Freight cost" stroke={SERIES.blue}
                  strokeWidth={2} fill="url(#lcHero)" dot={false} />
                <Tooltip content={<ChartTooltip formatter={v => fmt(v)} />} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Hero>

        {/* 4x2. Invoiced Shipments moved to the Monthly Trend table, where the
            period-by-period figures give it context; the three rate-card figures folded in
            here when the Billing Accuracy section was removed. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 14, alignItems: 'stretch' }}>
          {/* Declared shipment value — the GMV the freight was spent moving. It is the
              denominator behind the 'of GMV' figure in the hero, so showing it makes that
              percentage checkable rather than asserted. */}
          <Tile label="Total Shipment Value" value={fmt(agg.shipValue)}
            sub="goods shipped" />
          <Tile label="Cost per Kg" value={kpis.cpk != null ? '₹' + kpis.cpk.toFixed(2) : '—'}
            sub={`${fmtKg(kpis.chargedWt)} billed`} />
          {/* Renamed for clarity:
              "Surcharge Load" -> the % had no stated denominator; now names it.
              "Reverse Leg Cost" -> kept, but retitled to say WHY it matters (wasted
                freight), since the leg chart below already shows the split. */}
          <Tile label="Avg Cost / Shipment" value={'₹' + kpis.avgCost.toFixed(2)}
            sub="freight ÷ invoices" />
          <Tile label="Surcharge % of Freight" value={kpis.surchargePct.toFixed(1) + '%'}
            sub={`${fmt(agg.surcharge)} of ${fmt(agg.cost)} billed`} />
          {/* Billing Accuracy folded in here: the whole section reduced to three figures —
              what the rate card says we owed, what was invoiced, and the gap — so it earns a
              row rather than a section of its own.
              The weight-vs-rate split and the control tile are gone: the split is a
              diagnostic rather than a decision, and the control ('Card at Their Weight')
              existed to prove the model, which the 0.55% variance has now established. */}
          <Tile label="Should Have Paid" value={fmt(agg.dtOurs)}
            sub="card × our weight" />
          <Tile label="Actually Billed" value={fmt(agg.dtInvoiced)}
            sub={`${fmt(Math.max(agg.dtInvoiced - agg.dtOurs, 0))} over card`}
            accent={C.red.tx} />
          <Tile label="Claimable Overcharge" value={fmt(billingGap.total)}
            sub={`${billingGap.pctOfBilled.toFixed(1)}% of total cost billed`}
            accent={C.red.tx} />
          <Tile label="Wasted Freight (Returns)" value={fmt(reverseBurden.cost)}
            sub={`${fmtN(reverseBurden.n)} legs · ${reverseBurden.pct.toFixed(1)}% of spend`}
            accent={C.red.tx} />
        </div>
      </div>

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
        note={`${trendWindow.length} of ${trendRows.length} period${trendRows.length === 1 ? '' : 's'} · all couriers, zones and modes — not affected by the slicers`} />
      <Card title="Freight spend and unit cost"
        note="bars = total spend (left axis) · lines = cost per unit (right axis)"
        action={
          // Range applies to THIS chart only. Options above the available history are
          // disabled rather than hidden, so the reader can see how much data exists.
          <div style={{ display: 'flex', gap: 4 }}>
            {[{ n: 1, l: '1M' }, { n: 3, l: '3M' }, { n: 6, l: '6M' }, { n: 999, l: 'All' }].map(o => {
              const on = trendMonths === o.n
              // Disabled only if a SMALLER option already covers the whole series, so the
              // button is not offering a distinct view. Never disable the current selection.
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
        }>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trendWindow} margin={{ top: 12, right: 14, left: 4, bottom: 4 }}>
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
              <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 6 }} />
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
          <DataTable
            columns={[
              { key: 'month', label: 'Period' },
              { key: 'cost', label: 'Freight cost', align: 'right', render: (_, r) => fmt(r.cost) },
              { key: 'shipments', label: 'Shipments', align: 'right', render: (_, r) => fmtN(r.shipments) },
              { key: 'avgCost', label: 'Avg / ship', align: 'right', render: (_, r) => '₹' + r.avgCost.toFixed(2) },
              { key: 'cpk', label: '₹ / kg', align: 'right', render: (_, r) => '₹' + r.cpk.toFixed(2) },
              { key: 'wt', label: 'Billed wt', align: 'right', render: (_, r) => fmtKg(r.wt) },
              // Moved down from the Cost Overview tiles: as a single blended number it had no
              // context, but per period it shows whether freight is gaining on revenue.
              { key: 'pctGmv', label: '% of GMV', align: 'right', render: (_, r) => (
                r.pctGmv != null ? r.pctGmv.toFixed(2) + '%' : '—'
              ) },
            ]}
            rows={trendWindow}
          />
        </div>
      </Card>

      {/* ── Zone + mode ── */}
      <SectionHdr title="Where The Money Goes" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))', gap: 14 }}>
        <Card title="Cost by zone" note="zone drives the courier's rate card">
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={zoneRows} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={VIZ.grid} vertical={false} />
                <XAxis dataKey="zone" tick={{ fontSize: 11.5, fill: VIZ.muted }} axisLine={{ stroke: VIZ.axis }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: VIZ.muted }} axisLine={false} tickLine={false}
                  tickFormatter={v => fmt(v)} />
                <Tooltip cursor={{ fill: 'rgba(11,11,11,0.04)' }}
                  content={<ChartTooltip formatter={v => fmt(v)} />} />
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
          <div style={{ fontSize: 10.5, color: VIZ.muted, marginTop: -2, marginBottom: 6 }}>Click a bar to filter by zone</div>
          <DataTable
            columns={[
              { key: 'zone', label: 'Zone' },
              { key: 'shipments', label: 'Shipments', align: 'right', render: (_, r) => fmtN(r.shipments) },
              { key: 'avgCost', label: 'Avg ₹', align: 'right', render: (_, r) => '₹' + r.avgCost.toFixed(2) },
              { key: 'cpk', label: '₹/kg', align: 'right', render: (_, r) => (r.cpk != null ? '₹' + r.cpk.toFixed(2) : '—') },
              { key: 'share', label: 'Share', align: 'right', render: (_, r) => <ShareBar pct={r.share}>{r.share.toFixed(1) + '%'}</ShareBar> },
            ]}
            rows={zoneRows}
          />
        </Card>

        {/* Part-to-whole is valid here: the three legs are mutually exclusive and sum to
            100% of freight spend, and three slices is well inside the ~6 slice limit.
            Rendered as a donut with direct labels because Forward takes 316° of arc
            while Reverse (28°) and RTO (15°) are thin wedges — the labels carry the
            comparison that the angles cannot. RVP and DTO are folded into Reverse
            upstream in api/logistics-cost.js. */}
        <Card style={{ display: 'flex', flexDirection: 'column' }} title="Forward vs reverse" note="RTO, RVP and DTO all count as reverse — cost with no revenue">
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
                  // 2px surface gap between segments rather than a stroke outline.
                  paddingAngle={2}
                  stroke={VIZ.surface} strokeWidth={2}
                  onClick={d => d?.mode && toggleIn('modes', d.mode)}
                  style={{ cursor: 'pointer' }}
                  // Direct labels: the thin slices are unreadable by angle alone.
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
          {/* Total in the donut hole — the figure the slices are shares of. */}
          <div style={{ textAlign: 'center', marginTop: -148, marginBottom: 118, pointerEvents: 'none' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.t3, letterSpacing: '.05em', textTransform: 'uppercase' }}>Total</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.t1 }}>{fmt(agg.cost)}</div>
          </div>
          <div style={{ fontSize: 10.5, color: VIZ.muted, marginTop: -2, marginBottom: 6 }}>Click a slice to filter by leg</div>
          <DataTable
            columns={[
              { key: 'mode', label: 'Mode' },
              { key: 'shipments', label: 'Shipments', align: 'right', render: (_, r) => fmtN(r.shipments) },
              { key: 'cost', label: 'Cost', align: 'right', render: (_, r) => fmt(r.cost) },
              { key: 'avgCost', label: 'Avg ₹', align: 'right', render: (_, r) => '₹' + r.avgCost.toFixed(2) },
              { key: 'share', label: 'Share', align: 'right', render: (_, r) => <ShareBar pct={r.share}>{r.share.toFixed(1) + '%'}</ShareBar> },
            ]}
            rows={modeRows}
          />
        </Card>
      </div>

      {/* ── Weight slab + service type ── */}
      <SectionHdr title="Rate Card Exposure" note="cost behaviour across billing slabs" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))', gap: 14 }}>
        {/* ONE chart, ONE axis, grouped bars.
            The two series are avg cost PER SHIPMENT and cost PER KG — both are
            per-shipment rupee figures on the same order of magnitude (₹44–₹415 and
            ₹20–₹89), so a single ₹ axis carries them honestly with no second scale.
            Total spend is deliberately NOT a series here: at ₹1.4 Cr it would render
            ₹/kg at 0.0006% of the axis, i.e. invisible. Spend lives in the table
            below and in the tooltip, where its own scale does it justice. */}
        <Card style={{ display: 'flex', flexDirection: 'column' }} title="Cost per shipment vs cost per kg, by weight slab"
          note="both in ₹ on one axis — heavier slabs cost more per parcel but less per kg">
          <div style={{ flex: 1, minHeight: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bandRows} margin={{ top: 12, right: 12, left: 4, bottom: 4 }} barGap={4}>
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
                <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 4 }} />
                <Bar dataKey="avgCost" name="Avg ₹ / shipment" fill={SERIES.blue} radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Bar dataKey="cpk" name="₹ / kg" fill={SERIES.orange} radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <DataTable
            columns={[
              { key: 'band', label: 'Slab' },
              { key: 'shipments', label: 'Shipments', align: 'right', render: (_, r) => fmtN(r.shipments) },
              { key: 'cost', label: 'Total Cost', align: 'right', render: (_, r) => fmt(r.cost) },
              { key: 'share', label: 'Share', align: 'right', render: (_, r) => <ShareBar pct={r.share}>{r.share.toFixed(1) + '%'}</ShareBar> },
              { key: 'avgCost', label: 'Avg ₹', align: 'right', render: (_, r) => '₹' + r.avgCost.toFixed(2) },
              { key: 'cpk', label: '₹/kg', align: 'right', render: (_, r) => (r.cpk != null ? '₹' + r.cpk.toFixed(2) : '—') },
              { key: 'overPct', label: 'Overbilled', align: 'right', render: (_, r) => r.overPct.toFixed(1) + '%' },
            ]}
            rows={bandRows}
            maxHeight={220}
          />
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
          note="₹/kg per month — a rising line is a rate increase, not a heavier mix">
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={driftSeries} margin={{ top: 12, right: 44, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={VIZ.grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: VIZ.muted }} axisLine={{ stroke: VIZ.axis }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: VIZ.muted }} axisLine={false} tickLine={false}
                  tickFormatter={v => '₹' + v.toFixed(0)} />
                <Tooltip cursor={{ stroke: VIZ.axis, strokeWidth: 1 }}
                  content={<ChartTooltip formatter={v => '₹' + num(v).toFixed(2) + ' / kg'} />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="plainline" />
                {driftCouriers.map((c, i) => (
                  <Line key={c} type="monotone" dataKey={c} name={c}
                    stroke={DRIFT_COLORS[i % DRIFT_COLORS.length]} strokeWidth={2}
                    dot={{ r: 2.5 }} connectNulls />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <DataTable
            columns={[
              { key: 'courier', label: 'Courier' },
              { key: 'first', label: 'First', align: 'right', render: (_, r) => '₹' + r.first.toFixed(2) },
              { key: 'last', label: 'Latest', align: 'right', render: (_, r) => '₹' + r.last.toFixed(2) },
              { key: 'drift', label: 'Drift', align: 'right', render: (_, r) => (
                r.months < 2 ? <span style={{ color: C.t3 }}>—</span>
                  : <span style={{ color: r.drift > 5 ? C.red.tx : r.drift < -5 ? C.green.tx : undefined, fontWeight: Math.abs(r.drift) > 5 ? 700 : undefined }}>
                      {(r.drift >= 0 ? '+' : '') + r.drift.toFixed(1) + '%'}
                    </span>
              ) },
              { key: 'months', label: 'Months', align: 'right', render: (_, r) => fmtN(r.months) },
            ]}
            rows={driftRows}
            maxHeight={220}
          />
          <div style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>
            Couriers with fewer than 500 shipments in a month are excluded, so a handful
            of parcels can't fake a spike.
          </div>
        </Card>
      </div>

      {/* ── By courier ── */}
      {/* The overbilled-% column here is the per-partner breakdown of the headline figure
          in Billing Accuracy above. Prepaid vs COD follows it, since the COD premium is
          read per courier once the partner table has set the context. */}
      <SectionHdr title="By Courier Partner"
        note={courierRows.length === 1 ? 'one partner in the ledger so far' : `${courierRows.length} partners`} />
      <Card>
        <DataTable
          columns={[
            { key: 'courier', label: 'Courier' },
            { key: 'shipments', label: 'Shipments', align: 'right', render: (_, r) => fmtN(r.shipments) },
            { key: 'cost', label: 'Cost', align: 'right', render: (_, r) => fmt(r.cost) },
            { key: 'avgCost', label: 'Avg ₹', align: 'right', render: (_, r) => '₹' + r.avgCost.toFixed(2) },
            { key: 'cpk', label: '₹/kg', align: 'right', render: (_, r) => (r.cpk != null ? '₹' + r.cpk.toFixed(2) : '—') },
            // "Overbilled" alone didn't say overbilled on WHAT — it is the share of
            // this courier's shipments billed at a heavier slab than we declared.
            { key: 'overPct', label: '% Wrong Weight', align: 'right', render: (_, r) => (
              <span style={{ color: r.overPct > 40 ? C.red.tx : undefined, fontWeight: r.overPct > 40 ? 700 : undefined }}>
                {r.overPct.toFixed(1) + '%'}
              </span>
            ) },
          ]}
          rows={courierRows}
        />
        {courierRows.length === 1 && (
          <div style={{ fontSize: 11.5, color: C.t3, marginTop: 8 }}>
            Courier-vs-courier comparison unlocks once bills from other partners are uploaded.
          </div>
        )}
      </Card>

      {/* ── Payment mode ── */}
      <div style={{ marginTop: 14 }}>
        {/* Two donuts rather than one: the insight is the GAP between COD's share of
            volume (21.5%) and its share of cost (27.1%). A single cost pie shows the
            27% but gives nothing to compare it against, so the over-index is invisible.
            Two mutually-exclusive slices summing to 100% is a legitimate part-to-whole,
            and at 97° vs 263° the angles are readable without labels doing the work. */}
        <Card title="Prepaid vs COD" note="COD takes a bigger bite of cost than of volume">
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { key: 'n', title: 'Share of shipments' },
              { key: 'cost', title: 'Share of cost' },
            ].map(metric => {
              const total = payRows.reduce((s, r) => s + r[metric.key], 0)
              return (
                <div key={metric.key} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: C.t3, letterSpacing: '.05em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 2 }}>
                    {metric.title}
                  </div>
                  <div style={{ height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const r = payload[0].payload
                            return (
                              <div style={{ background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, padding: '9px 11px', boxShadow: '0 6px 20px rgba(0,0,0,.12)' }}>
                                <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t1, marginBottom: 4 }}>{r.k}</div>
                                <div style={{ fontSize: 14, fontWeight: 800, color: C.t1 }}>
                                  {metric.key === 'cost' ? fmt(r.cost) : fmtN(r.n)}
                                </div>
                                <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>
                                  {(r[metric.key] / total * 100).toFixed(1)}% · ₹{r.avgCost.toFixed(2)} avg
                                </div>
                              </div>
                            )
                          }} />
                        <Pie data={payRows} dataKey={metric.key} nameKey="k"
                          cx="50%" cy="50%" innerRadius={38} outerRadius={64}
                          paddingAngle={2} stroke={VIZ.surface} strokeWidth={2}
                          label={({ k, value }) => `${k} ${(value / total * 100).toFixed(0)}%`}
                          labelLine={false}
                          style={{ fontSize: 10 }}>
                          {payRows.map(r => (
                            <Cell key={r.k} fill={r.k === 'COD' ? SERIES.orange : SERIES.blue} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )
            })}
          </div>
          <DataTable
            columns={[
              { key: 'k', label: 'Payment' },
              { key: 'n', label: 'Shipments', align: 'right', render: (_, r) => fmtN(r.n) },
              { key: 'cost', label: 'Cost', align: 'right', render: (_, r) => fmt(r.cost) },
              { key: 'avgCost', label: 'Avg ₹', align: 'right', render: (_, r) => '₹' + r.avgCost.toFixed(2) },
            ]}
            rows={payRows}
          />
          {codPremium != null && (
            <div style={{ fontSize: 11.5, color: C.t3, marginTop: 8 }}>
              COD costs <strong style={{ color: C.red.tx }}>₹{codPremium.toFixed(2)}</strong> more per
              shipment, so it carries {payShareGap != null ? `${payShareGap.toFixed(1)} points more` : 'more'} of
              the cost than of the volume.
            </div>
          )}
        </Card>
      </div>

      {/* ── Recoverable, split by cause ── */}
      {/* The two causes need different conversations, so they are separate stack
          segments rather than one "recoverable" total:
            weight inflation → a weight-capture dispute (they measured heavier than we shipped)
            unexplained      → a rate-compliance dispute (billed above their own card)
          Stacked because they sum to one recoverable figure per courier. */}
      {recoverRows.length > 0 && (
        <>
          <SectionHdr title="Recoverable by Cause"
            note={`${fmt(recoverTotals.total)} across ${recoverRows.length} partners · weight disputes and rate-compliance disputes need different escalations`} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 14 }}>
            <Card style={{ display: 'flex', flexDirection: 'column' }} title="Recoverable per courier" note="bar length = rupees · split = which dispute">
              <div style={{ flex: 1, minHeight: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  {/* Horizontal: courier names read straight instead of angled, and the
                      ranking runs top-to-bottom the same way the table does. */}
                  <BarChart data={recoverRows} layout="vertical"
                    margin={{ top: 6, right: 14, left: 4, bottom: 4 }}>
                    <CartesianGrid stroke={VIZ.grid} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: VIZ.muted }}
                      axisLine={{ stroke: VIZ.axis }} tickLine={false} tickFormatter={v => fmt(v)} />
                    <YAxis type="category" dataKey="courier" width={78}
                      tick={{ fontSize: 11, fill: VIZ.muted }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(11,11,11,0.04)' }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        const r = payload[0].payload
                        return (
                          <div style={{ background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, padding: '9px 11px', boxShadow: '0 6px 20px rgba(0,0,0,.12)' }}>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t1, marginBottom: 5 }}>{label}</div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: C.t1 }}>{fmt(r.recTotal)}</div>
                            <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>
                              wrong weight {fmt(r.recInfl)}<br />
                              wrong rate {fmt(r.recUnexp)}
                            </div>
                            <div style={{ fontSize: 11, color: C.t2, marginTop: 4 }}>
                              {r.recPctFreight.toFixed(1)}% of their freight · ₹{r.recPerShipment.toFixed(1)}/shipment
                            </div>
                          </div>
                        )
                      }} />
                    <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 4 }} />
                    <Bar dataKey="recInfl" name="Wrong weight" stackId="rec" fill={SERIES.blue} maxBarSize={26} stroke={VIZ.surface} strokeWidth={2} />
                    <Bar dataKey="recUnexp" name="Wrong rate" stackId="rec" fill={SERIES.orange} radius={[0, 4, 4, 0]} maxBarSize={26} stroke={VIZ.surface} strokeWidth={2} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* The chart ranks by rupees, which tracks partner size. This names the
                  partner whose billing is most wrong relative to what we pay them — a
                  different question, and the one that justifies a rate review. */}
              {worstIntensity && (
                <div style={{ fontSize: 11.5, color: C.t2, marginTop: 8, lineHeight: 1.5 }}>
                  Highest intensity: <strong>{worstIntensity.courier}</strong> at{' '}
                  <strong style={{ color: C.red.tx }}>{worstIntensity.recPctFreight.toFixed(1)}%</strong> of
                  their own freight bill ({fmt(worstIntensity.recTotal)} on {fmtN(worstIntensity.shipments)} shipments).
                </div>
              )}
            </Card>

            <Card title="Escalation priority" note="ranked by claim size, with intensity and per-shipment cost">
              <DataTable
                columns={[
                  { key: 'courier', label: 'Courier' },
                  { key: 'recTotal', label: 'Total Claim', align: 'right', render: (_, r) => (
                    <span style={{ fontWeight: 700, color: C.red.tx }}>{fmt(r.recTotal)}</span>
                  ) },
                  // Intensity, not size. Ranks by how wrong the billing is relative to what
                  // we pay that partner, which is what a rate review is argued on.
                  { key: 'recPctFreight', label: '% of Freight', align: 'right', render: (_, r) => (
                    <span style={{ color: r.recPctFreight > 20 ? C.red.tx : undefined, fontWeight: r.recPctFreight > 20 ? 700 : undefined }}>
                      {r.recPctFreight.toFixed(1)}%
                    </span>
                  ) },
                  { key: 'recPerShipment', label: '₹ / Shipment', align: 'right', render: (_, r) => (
                    <span style={{ color: C.t2 }}>₹{r.recPerShipment.toFixed(1)}</span>
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
        note="category → sub-category, per shipment by leg. RTO is the return leg only" />
      <div>
        <Card title="Category detail" note="click a category to open its sub-categories">
          <DataTable
            columns={[
              { key: 'label', label: 'Category / Sub-category', render: (_, r) => (
                r.isSub
                  ? <span style={{ paddingLeft: 16, color: VIZ.muted }}>{r.label}</span>
                  : <span style={{ fontWeight: 700, cursor: 'pointer' }}
                      onClick={() => toggleCat(r.label)}>
                      <span style={{ display: 'inline-block', width: 12, color: VIZ.muted }}>
                        {r.hasKids ? (r.open ? '−' : '+') : ''}
                      </span>{r.label}
                    </span>
              ) },
              { key: 'n', label: 'Shipments', align: 'right', render: (_, r) => fmtN(r.n) },
              { key: 'fwd', label: 'Forward', align: 'right', render: (_, r) => r.fwd ? fmt(r.fwd) : '—' },
              { key: 'rev', label: 'Reverse', align: 'right', render: (_, r) => r.rev ? fmt(r.rev) : '—' },
              { key: 'rto', label: 'RTO', align: 'right', render: (_, r) => r.rto ? fmt(r.rto) : '—' },
              // Cost to serve one order: forward + reverse + RTO, each weighted by how often
              // it actually happens (return count ÷ forward count). Forward is the
              // denominator because every order has one; returns are the exception at 3-21%.
              // A raw sum of the three averages was dropped — it assumes every shipment goes
              // out, is picked up AND is RTO'd, which overstates Footwear by ~2.5x (₹264 vs
              // ₹103) and would mislead any margin decision built on it.
              { key: 'ctsReal', label: 'Avg. Logistic Cost', align: 'right', render: (_, r) => (
                r.ctsReal ? <span style={{ fontWeight: 700 }}>{fmt(r.ctsReal)}</span> : '—'
              ) },
              // Slab derived from the item master's product weight, so it is ONE real slab
              // per product rather than an average of billed slabs (the old 1.72 kg was a
              // value no parcel is ever charged). Actual product weight shown beside it.
              // Falls back to the billed average only where the master has no single weight:
              // a category spanning several sub-categories, or 'Mixed Shipments'.
              // Slab only — the actual product weight is already in the Volumetric KG column
              // beside it, so repeating it in brackets was redundant.
              // Unit carried on the value, so the header does not need to repeat it.
              // Category rows show the shipment-weighted AVERAGE product weight, because a
              // category spans products of different weights and no single slab is true for
              // all of them. Sub-category rows show the billable SLAB, which is one real
              // value the courier charges on.
              { key: 'slab', label: 'Weight Slab', align: 'right', render: (_, r) => {
                if (r.masterSlab > 0) return <strong>{r.masterSlab} kg</strong>
                return r.masterKg > 0 ? <strong>{r.masterKg.toFixed(2)} kg</strong> : '—'
              } },
              { key: 'vw', label: 'Volumetric', align: 'right', render: (_, r) => (r.vw ? r.vw.toFixed(2) + ' kg' : '—') },
              { key: 'cost', label: 'Total spend', align: 'right', render: (_, r) => fmt(r.cost) },
            ]}
            rows={productRows}
            maxHeight={480}
            maxRows={200}
          />
        </Card>
      </div>

      {/* ── Like-for-like courier comparison ── */}
      {activeCell && (
        <>
          <SectionHdr title="Like-for-Like Courier Cost"
            note="same zone, same weight slab, same leg — the only fair comparison" />
          {/* Three independent multi-selects instead of one combined dropdown. Selecting
              nothing in a row means ALL of it, so the card always has data to show. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 12 }}>
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
          </div>
          <Card
            title={[
              activeCell.allZones ? 'All zones' : 'Zone ' + activeCell.zones.join(', '),
              activeCell.allBands ? 'all weights' : activeCell.bands.join(', '),
              activeCell.allLegs ? 'all legs' : activeCell.legs.join(', '),
            ].join(' · ')}
            note={`${fmtN(activeCell.n)} shipments · min 50 per courier per cell`}
          >
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
            <DataTable
              columns={[
                { key: 'courier', label: 'Courier' },
                { key: 'n', label: 'Shipments', align: 'right', render: (_, r) => fmtN(r.n) },
                { key: 'avgCost', label: 'Avg ₹', align: 'right', render: (_, r) => '₹' + r.avgCost.toFixed(2) },
                { key: 'cpk', label: '₹/kg', align: 'right', render: (_, r) => '₹' + r.cpk.toFixed(2) },
                { key: 'vs', label: 'vs cheapest', align: 'right', render: (_, r) => {
                  const d = r.avgCost - activeCell.rows[0].avgCost
                  return d < 0.01
                    ? <span style={{ color: C.green.tx, fontWeight: 700 }}>cheapest</span>
                    : <span style={{ color: C.red.tx }}>{'+₹' + d.toFixed(2)}</span>
                } },
              ]}
              rows={activeCell.rows}
            />
            <div style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>
              Cost only — this does not account for SLA, coverage or damage rates. Confirm
              service levels are comparable before shifting volume.
            </div>
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
        {sidebar}

        {/* Sidebar collapse handle */}
        <button onClick={() => setSidebarOpen(o => !o)}
          style={{ width: 16, alignSelf: 'flex-start', marginTop: 20, height: 48, border: `1px solid ${C.border}`, borderLeft: 'none', background: C.card, cursor: 'pointer', borderRadius: '0 6px 6px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.t3, fontSize: 12, flexShrink: 0, boxShadow: '2px 0 4px rgba(0,0,0,0.06)', padding: 0 }}>
          {sidebarOpen ? '‹' : '›'}
        </button>

        <div style={{ flex: 1, overflow: 'auto', padding: '6px 20px 40px' }}>
          {/* Scope tabs: which ledger this page is reporting on. Sits above everything
              it scopes, alongside the filter summary. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 2, marginBottom: 18 }}>
            <div style={{ display: 'inline-flex', background: C.bg, borderRadius: 9, padding: 3, gap: 2, border: `1.5px solid ${C.border2}` }}>
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
