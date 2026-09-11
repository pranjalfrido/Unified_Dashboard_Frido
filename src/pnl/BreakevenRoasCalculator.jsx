import { useState, useMemo, useEffect } from 'react'
import { C, fmt } from '../utils.js'
import { perUnitWaterfall, rateForWeightGm } from './pnlUtils.js'

// Forward-looking, single-unit calculator for a NOT-YET-LAUNCHED product: given a listing price,
// a discount (selling price defaults to 7% off listing — Frido's usual launch convention), COGS,
// weight, GST slab, and expected outcome rates (Cancellation/RTO/CIR/Exchange — modeled
// separately, not blended, so each maps to its own real logistics cost path exactly like
// shSkuCosts does for actual orders — see the ReferenceProductPicker below for pulling these from
// a real comparable product's mature-window rates instead of guessing), works out the full
// per-unit contribution waterfall and the two headline numbers a launch decision actually needs:
//   Breakeven ROAS      — the ad efficiency at which marketing spend exactly consumes all of CM1
//                          (CM2 = 0). ROAS = Net Revenue / Marketing Spend, so breakeven spend is
//                          CM1, i.e. breakeven ROAS = Net Revenue / CM1.
//   Breakeven ROAS @15% — the (stricter) ROAS needed so CM2 lands at 15% of Net Revenue instead
//                          of just breaking even: spend = CM1 − 0.15×NetRev, so
//                          ROAS = NetRev / (CM1 − 0.15×NetRev).
// A ROAS target only makes sense once CM1 > 0 (there's contribution margin ads can safely spend
// against, and, for the 15% target, only once CM1 already clears the 15% floor on its own) — an
// infeasible input state has a real answer ("no ROAS makes this profitable"), never a fabricated
// number, so both are rendered as null/"—" with the reason spelled out instead of Infinity or a
// silently negative ROAS.
let sndRatesPromise = null
function loadSndRates() {
  if (!sndRatesPromise) sndRatesPromise = fetch('/snd-rates.json').then(r => r.ok ? r.json() : []).catch(() => [])
  return sndRatesPromise
}

const GST_PRESETS = [0, 5, 18]
const LAUNCH_DISCOUNT_DEFAULT = 7

function Card({ children, style }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 18, ...style }}>
      {children}
    </div>
  )
}
function SectionLabel({ children }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</div>
}

// Single-value KPI tile matching the Price Simulator's MiniStatCard card visuals (bordered box,
// C.bg background) — used here without a "from → to" comparison since Breakeven ROAS has only
// one computed scenario, not a Current-vs-Planned pair.
function KpiTile({ label, value, amount, negative }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: 0.2 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: negative ? C.red.tx : C.t1 }}>{value}</div>
        {amount != null && <div style={{ fontSize: 11.5, fontWeight: 600, color: C.t3 }}>{amount}</div>}
      </div>
    </div>
  )
}

// onBlurResolve (optional): when the user finishes typing a raw value, transform it to a
// canonical/billed value on blur — used by Weight to snap a raw entry like 326g to the actual
// courier-billing slab it maps to (e.g. 500g), since that slab (not the raw weight) is what
// the logistics rate is ever actually charged against; see rateForWeightGm's round-up rule.
function NumField({ label, value, onChange, suffix, placeholder, min = 0, step = 'any', width, onBlurResolve }) {
  const text = value === '' || value == null ? '' : String(value)
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, width }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t2 }}>{label}</span>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, width: '100%', boxSizing: 'border-box',
        padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, background: '#fff',
      }}>
        <input
          type="number" min={min} step={step} value={value} placeholder={placeholder}
          onChange={e => onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          onBlur={() => { if (onBlurResolve && value !== '' && value != null) onChange(onBlurResolve(value)) }}
          className="pnl-no-spinner"
          size={Math.max(1, text.length || (placeholder ? placeholder.length : 1))}
          style={{
            flex: '0 1 auto', minWidth: 0, width: `${Math.max(1, text.length)}ch`, border: 'none', outline: 'none',
            fontSize: 13, fontWeight: 600, color: C.t1, background: 'transparent',
          }}
        />
        {suffix && <span style={{ fontSize: 12, fontWeight: 600, color: C.t3 }}>{suffix}</span>}
        <span style={{ flex: 1 }} />
      </div>
    </label>
  )
}

// Plain number input for the four "Expected Order Outcomes" %s — matches the Price Simulator's
// Listing Price/Discount fields (typed value, not a slider) for consistency across both tools.
function PctField({ label, value, onChange, accent }) {
  const text = value === '' || value == null ? '' : String(value)
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t2 }}>{label}</span>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, width: '100%', boxSizing: 'border-box',
        padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, background: '#fff',
      }}>
        <input
          type="number" min={0} max={100} step={0.1} value={value}
          onChange={e => onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="pnl-no-spinner"
          size={Math.max(1, text.length)}
          style={{
            flex: '0 1 auto', minWidth: 0, width: `${Math.max(1, text.length)}ch`, border: 'none', outline: 'none',
            fontSize: 13, fontWeight: 700, color: accent || C.t1, background: 'transparent',
          }}
        />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t3 }}>%</span>
        <span style={{ flex: 1 }} />
      </div>
    </label>
  )
}

// One waterfall line drawn as a bar-to-scale (matching the Price Simulator's WaterfallBar
// treatment) instead of a plain text row — so the eye reads relative MAGNITUDE (how big is COGS
// vs. logistics vs. CM1), not just a column of numbers.
function WaterfallBar({ label, value, scaleMax, tone, color: colorOverride }) {
  const rawPct = scaleMax > 0 ? Math.min(100, Math.abs(value) / scaleMax * 100) : 0
  // Small real costs (Logistics, Fulfilment) can be <1% of Gross Selling Price and render as an
  // invisible sliver at true scale — floor any nonzero value to a minimum visible width so every
  // line item reads as an actual bar, not a barely-there dot, while zero stays truly zero-width.
  const barPct = value !== 0 ? Math.max(rawPct, 3) : 0
  const negative = value < 0
  // A cost line (COGS/Logistics/Fulfilment) is EXPECTED to be negative — its colorOverride still
  // applies, so each keeps its own distinct tone instead of every cost line collapsing into the
  // same harsh red. Red is reserved for an unexpected negative on a "total" line (e.g. CM1 or GM
  // itself turning into a loss), which has no colorOverride passed in that case.
  const color = colorOverride || (negative ? C.red.tx : (tone === 'total' ? C.acc : C.t3))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: tone === 'total' ? 13 : 12.5, fontWeight: tone === 'total' ? 700 : 500, color: tone === 'total' ? C.t1 : C.t2 }}>
        <span>{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: tone === 'total' ? 800 : 600, color: negative ? C.red.tx : C.t1 }}>
          {negative ? '−' : ''}{fmt(Math.abs(value))}
        </span>
      </div>
      <div style={{ position: 'relative', height: 12, background: C.bg, borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barPct}%`, background: color, borderRadius: 5, transition: 'width 120ms ease-out' }} />
      </div>
    </div>
  )
}

// Typeahead over the same Product list the Price Simulator's "Product" mode already builds
// (d2cProductGroups from PnLPage.jsx) — picking one applies its real mature-window outcome rates
// via onApply, then the user can still hand-tune from there. Product-grain only (not Product
// Variant/SKU) since a not-yet-launched product doesn't have variant-level specifics to match
// against — the broader Product's blended rate is the right comparable. Search-only (no
// persistent selection state) since this is a one-shot "seed my estimate," not an ongoing pick.
function ReferenceProductPicker({ productGroups, onApply }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return productGroups
      .filter(p => p.sku.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q) || (p.subCategory || '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [productGroups, search])

  const pick = p => {
    onApply(p)
    setSearch(p.name)
    setOpen(false)
  }

  if (!productGroups.length) return null

  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t2 }}>Pull rates from a real product</div>
      <div style={{ position: 'relative' }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); setHighlightIdx(0) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={e => {
            if (!open || suggestions.length === 0) return
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)) }
            else if (e.key === 'Enter') { e.preventDefault(); const p = suggestions[highlightIdx]; if (p) pick(p) }
            else if (e.key === 'Escape') { setOpen(false) }
          }}
          placeholder="Search product…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, fontSize: 13, fontWeight: 600, color: C.t1, background: '#fff', outline: 'none' }}
        />
        {open && suggestions.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: `1px solid ${C.border2}`, borderRadius: 10, boxShadow: '0 6px 18px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 220, overflowY: 'auto' }}>
            {suggestions.map((p, i) => (
              <div key={p.sku} onMouseDown={() => pick(p)} onMouseEnter={() => setHighlightIdx(i)}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12.5, borderBottom: `1px solid ${C.border}`, background: i === highlightIdx ? C.acl : 'transparent' }}>
                <div style={{ fontWeight: 700, color: C.t1 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>
                  Canc {((p.cancelPct || 0) * 100).toFixed(1)}% · RTO {((p.rtoPct || 0) * 100).toFixed(1)}% · CIR {((p.cirPct || 0) * 100).toFixed(1)}% · Exch {((p.exchPct || 0) * 100).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RoasCard({ label, value, sublabel, tone }) {
  const numberColor = tone === 'bad' ? C.red.tx : C.t1
  return (
    <div style={{ flex: 1, minWidth: 220, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: numberColor, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
        {value != null ? `${value.toFixed(2)}x` : '—'}
      </div>
      <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>{sublabel}</div>
    </div>
  )
}

export default function BreakevenRoasCalculator({ productGroups = [] }) {
  const [slabs, setSlabs] = useState(null)
  useEffect(() => { loadSndRates().then(setSlabs) }, [])

  const [listingPrice, setListingPrice] = useState(1999)
  const [discountPct, setDiscountPct] = useState(LAUNCH_DISCOUNT_DEFAULT)
  const [cogs, setCogs] = useState(600)
  const [weightGm, setWeightGm] = useState(500)
  const [gstPct, setGstPct] = useState(18)
  // All four outcome %s start at 0 — no calculated or guessed default exists for a not-yet-launched
  // product, so leaving them at 0 avoids any appearance of an authoritative number until the user
  // either types their own estimate or pulls a real comparable's rates via the search box above.
  // ("Return %"/Order_Status='Return' was removed — confirmed against live BigQuery that this
  // status value never occurs for D2C/Shopify rows; CIR is D2C's real customer-initiated-return
  // bucket, so keeping a separate always-zero "Return %" field alongside it was misleading.)
  const [rtoPct, setRtoPct] = useState(0)
  const [cancelPct, setCancelPct] = useState(0)
  const [cirPct, setCirPct] = useState(0)
  const [exchangePct, setExchangePct] = useState(0)

  // Fills all four Expected Order Outcome %s from a real, already-launched product's own
  // mature-window (14-44 day settled) rates — the same rtoPct/cirPct/exchPct/cancelPct fields the
  // Price Simulator's baseline already relies on (see PnLPage.jsx's d2cProductList/
  // d2cProductGroups) — so a not-yet-launched product's estimate can be grounded in a real
  // comparable instead of a guess.
  const applyReferenceRates = product => {
    if (!product) return
    setCancelPct(Math.round((product.cancelPct || 0) * 1000) / 10)
    setRtoPct(Math.round((product.rtoPct || 0) * 1000) / 10)
    setCirPct(Math.round((product.cirPct || 0) * 1000) / 10)
    setExchangePct(Math.round((product.exchPct || 0) * 1000) / 10)
  }

  const sellingPrice = useMemo(() => {
    if (listingPrice === '' || discountPct === '') return 0
    return listingPrice * (1 - discountPct / 100)
  }, [listingPrice, discountPct])

  // Exchange gets its OWN extra cost on top of the shared forward charge in blendedLogisticsPerUnit
  // (forward + reverse + a second forward) — an exchange means Frido ships a replacement item (a
  // real second forward shipment) in addition to the pickup, so it costs more than CIR/Return.
  const buildOutcomePcts = (rtPct, cPct, cirP, ePct) => ({
    rtoPct: (rtPct || 0) / 100,
    returnPct: (cirP || 0) / 100,
    exchangePct: (ePct || 0) / 100,
    cancelPct: (cPct || 0) / 100,
  })
  const outcomePcts = useMemo(() => buildOutcomePcts(rtoPct, cancelPct, cirPct, exchangePct), [rtoPct, cancelPct, cirPct, exchangePct])

  const waterfall = useMemo(() => {
    if (!slabs || !sellingPrice) return null
    return perUnitWaterfall({
      sellingPriceIncGst: sellingPrice,
      gstRate: (gstPct || 0) / 100,
      cogsPerUnit: cogs === '' ? null : cogs,
      weightGm: weightGm === '' ? null : weightGm,
      slabs,
      outcomePcts,
    })
  }, [slabs, sellingPrice, gstPct, cogs, weightGm, outcomePcts])

  // ROAS = Gross Revenue (Ex GST, BEFORE return-loss deduction) / Ad Spend — same revenue base
  // the Ads tab's own Overall ROAS card and the real D2C PnL's kpiSummary.roas use (Gross Ex GST,
  // not Net Revenue), so a ROAS lever here means the same thing it means everywhere else in the
  // app, confirmed against the reference sheet's own Breakeven RoAS formula too (P41 =
  // (SellingPrice-7%launchDiscount)/CM1, i.e. gross ex-GST before returns, not net).
  // Breakeven ROAS = GrossExGST / CM1 (spend that exactly zeroes CM2). Only meaningful once CM1 > 0
  // — a negative CM1 means the product loses money before a single rupee of ad spend, so no ROAS
  // rescues it.
  const breakevenRoas = waterfall && waterfall.cm1 > 0 ? waterfall.excGst / waterfall.cm1 : null
  // Breakeven ROAS @ 15% CM2 = GrossExGST / (CM1 − 0.15×NetRevenue) — the 15% CM2 target itself is
  // still defined as a share of Net Revenue (the real, return-adjusted revenue this product keeps),
  // only the ROAS ratio's own numerator switches to gross ex-GST. Needs CM1 to clear the 15% floor
  // BEFORE any ad spend, otherwise the target is unreachable regardless of ROAS.
  const target15Budget = waterfall ? waterfall.cm1 - 0.15 * waterfall.netRev : null
  const breakevenRoas15 = waterfall && target15Budget > 0 ? waterfall.excGst / target15Budget : null

  const totalLossPct = (rtoPct || 0) + (cancelPct || 0) + (cirPct || 0) + (exchangePct || 0)
  const lossOver100 = totalLossPct > 100

  const waterfallScaleMax = waterfall ? Math.max(waterfall.grossIncGst, 1) : 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1220 }}>
      <style>{`
        input.pnl-no-spinner::-webkit-outer-spin-button,
        input.pnl-no-spinner::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input.pnl-no-spinner { -moz-appearance: textfield; }
      `}</style>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.t1, letterSpacing: -0.2 }}>Breakeven ROAS Calculator</div>
        <div style={{ fontSize: 13, color: C.t3, marginTop: 3 }}>
          Model a new product's per-unit economics before launch — find the ad efficiency it needs to break even, and the efficiency it needs to hit a healthy 15% CM2.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {/* ── Inputs ── */}
        <div style={{ flex: '1 1 420px', display: 'flex' }}>
          <Card style={{ flex: 1, gap: 10, padding: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <SectionLabel>Pricing</SectionLabel>
              <div style={{ display: 'flex', gap: 10 }}>
                <NumField label="Listing Price" value={listingPrice} onChange={setListingPrice} suffix="₹" width="100%" />
                <NumField label="Launch Discount" value={discountPct} onChange={setDiscountPct} suffix="%" width="100%" />
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${C.border}` }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SectionLabel>Cost Basis</SectionLabel>
              <div style={{ display: 'flex', gap: 10 }}>
                <NumField label="COGS / Unit" value={cogs} onChange={setCogs} suffix="₹" width="100%" placeholder="auto if blank" />
                <NumField label="Weight" value={weightGm} onChange={setWeightGm} suffix="g" width="100%"
                  onBlurResolve={w => slabs ? (rateForWeightGm(slabs, w)?.weightGm ?? w) : w} />
              </div>
              <div>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t2 }}>GST Rate</span>
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  {GST_PRESETS.map((g, i) => (
                    <div key={g} style={{ display: 'flex', alignItems: 'center' }}>
                      {i > 0 && <div style={{ width: 1, height: 14, background: '#D6D0B0', margin: '0 4px' }} />}
                      <button onClick={() => setGstPct(g)}
                        style={{
                          fontSize: 12, fontWeight: gstPct === g ? 700 : 500, padding: '5px 12px', borderRadius: 7, border: 'none', outline: 'none',
                          background: gstPct === g ? C.acs : 'transparent', color: gstPct === g ? '#3F3D33' : C.t3, cursor: 'pointer',
                        }}>{g}%</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${C.border}` }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SectionLabel>Expected Order Outcomes</SectionLabel>
              <ReferenceProductPicker productGroups={productGroups} onApply={applyReferenceRates} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <PctField label="Cancellation %" value={cancelPct} onChange={setCancelPct} accent={C.blue.tx} />
                <PctField label="RTO %" value={rtoPct} onChange={setRtoPct} accent={C.amber.tx} />
                <PctField label="CIR %" value={cirPct} onChange={setCirPct} accent={C.t2} />
                <PctField label="Exchange %" value={exchangePct} onChange={setExchangePct} accent={C.t2} />
              </div>
            </div>
            {lossOver100 && (
              <div style={{ fontSize: 12, fontWeight: 600, color: C.red.tx, background: C.red.bg, border: `1px solid ${C.red.bd}`, borderRadius: 8, padding: '8px 12px' }}>
                Cancellation + RTO + CIR + Exchange adds up to {totalLossPct.toFixed(0)}%, over 100% — lower one so the outcomes stay realistic.
              </div>
            )}
          </Card>
        </div>

        {/* ── Waterfall + headline ROAS ── */}
        <div style={{ flex: '1 1 380px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card>
            <SectionLabel>Per-Unit Waterfall</SectionLabel>
            {!waterfall ? (
              <div style={{ fontSize: 13, color: C.t3, padding: '20px 0' }}>Enter a listing price to see the breakdown.</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                  <WaterfallBar label="Gross Selling Price (Inc. GST)" value={waterfall.grossIncGst} scaleMax={waterfallScaleMax} tone="total" color={C.acc} />
                  <WaterfallBar label="Net Revenue (Ex. GST)" value={waterfall.netRev} scaleMax={waterfallScaleMax} tone="total" color={C.acm} />
                  <WaterfallBar label="Gross Margin (GM)" value={waterfall.gm} scaleMax={waterfallScaleMax} tone="total" color={waterfall.gm >= 0 ? C.acd : undefined} />
                  <WaterfallBar label="Contribution Margin 1 (CM1)" value={waterfall.cm1} scaleMax={waterfallScaleMax} tone="total" color={waterfall.cm1 >= 0 ? '#4A360A' : undefined} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                  <KpiTile label="COGS %" value={waterfall.netRev > 0 ? `${(waterfall.cogs / waterfall.netRev * 100).toFixed(1)}%` : '0.0%'} amount={fmt(waterfall.cogs)} />
                  <KpiTile label="GM %" value={waterfall.netRev > 0 ? `${(waterfall.gm / waterfall.netRev * 100).toFixed(1)}%` : '0.0%'} amount={fmt(waterfall.gm)} />
                  <KpiTile label="S&D %" value={waterfall.netRev > 0 ? `${(waterfall.snd / waterfall.netRev * 100).toFixed(1)}%` : '0.0%'} amount={fmt(waterfall.snd)} />
                  <KpiTile label="CM1 %" value={waterfall.netRev > 0 ? `${(waterfall.cm1 / waterfall.netRev * 100).toFixed(1)}%` : '0.0%'} amount={`${waterfall.cm1 < 0 ? '−' : ''}${fmt(Math.abs(waterfall.cm1))}`} negative={waterfall.cm1 < 0} />
                </div>
              </>
            )}
          </Card>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', flex: 1, alignItems: 'stretch' }}>
            <RoasCard
              label="Breakeven ROAS"
              value={breakevenRoas}
              tone={breakevenRoas != null ? 'good' : 'bad'}
              sublabel={breakevenRoas != null ? 'Ad spend at or below this ROAS keeps CM2 ≥ 0' : 'CM1 is ≤ 0 — no ad spend makes this product breakeven as priced'}
            />
            <RoasCard
              label="Breakeven ROAS @ 15% CM2"
              value={breakevenRoas15}
              tone={breakevenRoas15 != null ? 'good' : 'bad'}
              sublabel={breakevenRoas15 != null ? 'ROAS needed for CM2 to reach 15% of Net Revenue' : 'CM1 does not clear a 15%-of-Net-Revenue floor even before ad spend'}
            />
          </div>
        </div>
      </div>

    </div>
  )
}
