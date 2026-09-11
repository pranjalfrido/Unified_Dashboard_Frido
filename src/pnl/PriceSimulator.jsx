import { useState, useMemo, useEffect, useRef } from 'react'
import { C, fmt, fmtN, pct } from '../utils.js'
import { blendedLogisticsPerUnit, rateForWeightGm } from './pnlUtils.js'

// Per-unit price values (Listing Price, ASP, Selling Price) are always shown in plain rupees —
// never abbreviated to K/L like the aggregate totals (Gross/Net/CM) do via the shared fmt() —
// since a unit price is a single real number a merchandiser reads directly (₹2,299), not a scale
// where L/Cr abbreviation helps.
const fmtPrice = v => (v == null || isNaN(v)) ? '₹0' : `₹${Math.round(v).toLocaleString('en-IN')}`

let sndRatesPromise = null
function loadSndRates() {
  if (!sndRatesPromise) sndRatesPromise = fetch('/snd-rates.json').then(r => r.ok ? r.json() : []).catch(() => [])
  return sndRatesPromise
}

// D2C-only "what-if" promo tester, scoped to ONE Product or Product Variant at a time — built on
// that SKU's/product's own real ASP, Listing Price, and tracked Discount (Listing_Price/Discount
// columns straight from fact_all_platform_sales_report — see api/bq.js's shListingPrice query)
// plus COGS/SnD-per-unit (from PnLPage.jsx's d2cProductList/d2cProductGroups). Discount% is a REAL
// lever on a REAL price: New Selling Price = Listing Price × (1 − Discount%), so the slider always
// has a visible ₹ price attached to it, not an abstract revenue scale-factor.
//
// An earlier "All D2C" (whole-portfolio) mode was removed deliberately: it had no single Listing
// Price to anchor Discount% to (a portfolio spans many list prices, so the lever fell back to
// scaling blended Net Revenue directly — not a real price change), no per-SKU mature return-rate
// or weight data to drive the Return Rate Impact lever, and its blended CM2 didn't correspond to
// any real decision a merchandiser would actually make (nobody discounts their entire catalog
// uniformly). A product-scoped simulation is the only one where every number is real.
//
// Model (per-unit price established from this product/variant's own Listing Price):
//   New Selling Price = Listing Price × (1 − Discount%)
//   New Units         = Baseline Units × (1 + Volume Δ%)
//   New Net Revenue   = New Gross (price × units) held at the SAME blended GST ratio the baseline
//                       period had, since GST% doesn't change with a discount.
//   COGS              — a FIXED ₹/unit cost — does NOT move with price, so COGS *as a % of
//                       revenue rises* as price drops. Surfaced explicitly since it's the one
//                       thing a naive "just multiply revenue down" simulation would hide.
//   SnD               — logistics/fulfilment/software-fee are fixed ₹/unit, scaled only by New
//                       Units. Payment gateway (1.1% of gross) scales with price automatically.
//   Marketing Spend   = New Net Revenue ÷ Target ROAS.
//   Return Rate Δ     — a discount often shifts return behavior (heavier discounting → higher
//                       returns is a common real pattern), so this is modeled explicitly rather
//                       than silently held fixed at the mature baseline rate. Expressed as a delta
//                       (percentage points) off the product's OWN mature-window return rate
//                       (returnRevRate, from d2cProductList/d2cProductGroups in PnLPage.jsx — see
//                       "Current" baseline below for how that's derived). Extra returned/RTO'd
//                       units beyond that baseline rate lose their pro-rata net revenue (the sale
//                       reverses) AND add real incremental reverse-logistics cost, priced against
//                       this product's own weight via snd-rates.json (see
//                       incrementalReverseLogisticsPerUnit below).
//   Breakeven Discount — the discount % at which CM2 crosses zero, holding Volume Δ%/Target ROAS/
//                       Return Rate Δ fixed at their current slider values.

const PAYMENT_GW_RATE = 0.011

// 'product' = grouped by SubCategory (e.g. "XL Coccyx Seat Cushion" — blends all its color/size
// variants, units-weighted). 'variant' = one exact MasterSKU / product-id from the item master.
const PICK_MODES = [
  { id: 'product', label: 'Product' },
  { id: 'variant', label: 'Product Variant' },
]

function Card({ children, style }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 16, ...style }}>
      {children}
    </div>
  )
}
function SectionLabel({ children }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</div>
}

function NumberInputField({ label, value, onChange, min, max, step, prefix, suffix, accent }) {
  const [text, setText] = useState(value == null ? '' : String(value))
  const inputRef = useRef(null)
  useEffect(() => { setText(value == null ? '' : String(value)) }, [value])
  const commit = () => {
    const n = parseFloat(text)
    if (Number.isNaN(n)) { setText(value == null ? '' : String(value)); return }
    const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n))
    onChange(clamped)
    setText(String(clamped))
  }
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: C.t2, marginBottom: 4 }}>{label}</div>
      <div
        onClick={e => {
          if (e.target === inputRef.current) return
          const el = inputRef.current
          if (!el) return
          el.focus()
          try { const len = el.value.length; el.setSelectionRange(len, len) } catch { /* number inputs don't support selection ranges in some browsers */ }
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, border: `1px solid ${C.border2}`, borderRadius: 8,
          padding: '6px 10px', background: '#fff', cursor: 'text',
        }}
      >
        {prefix && <span style={{ fontSize: 13, fontWeight: 700, color: accent || C.acd }}>{prefix}</span>}
        <input
          ref={inputRef}
          type="number" value={text} min={min} max={max} step={step ?? 1}
          onChange={e => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="pnl-no-spinner"
          size={Math.max(1, text.length)}
          style={{
            flex: '0 0 auto', width: `${Math.max(1, text.length)}ch`, minWidth: 0, border: 'none', outline: 'none', fontSize: 13, fontWeight: 700, color: accent || C.acd,
            fontVariantNumeric: 'tabular-nums', background: 'transparent',
          }}
        />
        {suffix && <span style={{ fontSize: 13, fontWeight: 700, color: accent || C.acd }}>{suffix}</span>}
        <span style={{ flex: 1 }} />
      </div>
    </div>
  )
}

function SliderField({ label, value, onChange, min, max, step, formatValue, accent }) {
  const pctOfTrack = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.t2 }}>{label}</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: accent || C.acd, fontVariantNumeric: 'tabular-nums' }}>{formatValue(value)}</span>
      </div>
      <div style={{ position: 'relative', height: 6, borderRadius: 4, background: C.border2 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pctOfTrack}%`, borderRadius: 4, background: accent || C.acc, transition: 'width 60ms linear' }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'pointer' }}
        />
        <div style={{ position: 'absolute', left: `calc(${pctOfTrack}% - 8px)`, top: -5, width: 16, height: 16, borderRadius: '50%', background: '#fff', border: `2.5px solid ${accent || C.acc}`, boxShadow: '0 1px 3px rgba(0,0,0,0.25)', pointerEvents: 'none' }} />
      </div>
    </div>
  )
}

// Each stage (Gross Revenue → Net Revenue → Gross Margin → CM1 → CM2) is a ROW, with Current and
// Planned drawn as two horizontal bars extending from a shared zero line — a ranked-bar layout
// rather than a vertical step-down waterfall, so the actual ₹ values (and which stage moved most)
// read directly off the bar lengths without cross-referencing a separate legend.
const WATERFALL_STAGES = [
  { key: 'gross', label: 'Gross Revenue', color: C.acc },
  { key: 'net', label: 'Net Revenue', color: C.acm },
  { key: 'gm', label: 'Gross Margin', color: C.acd },
  { key: 'cm1', label: 'CM1', color: '#5A420C' },
  { key: 'cm2', label: 'CM2', color: '#4A360A' },
]
const BAR_H = 9
const BAR_GAP = 2
const ROW_GAP = 6

function WaterfallChart({ before, after, hideGross }) {
  const stages = hideGross ? WATERFALL_STAGES.filter(s => s.key !== 'gross') : WATERFALL_STAGES
  const allValues = stages.flatMap(s => [before[s.key], after[s.key]])
  const maxVal = Math.max(...allValues, 1)
  const minVal = Math.min(...allValues, 0)
  const range = maxVal - minVal || 1
  const zeroPct = (-minVal / range) * 100 // % from the left edge where zero sits

  const barLen = v => Math.abs(v) / range * 100
  const barLeft = v => v >= 0 ? zeroPct : zeroPct - barLen(v)

  return (
    <div>
      {minVal < 0 && (
        <div style={{ fontSize: 10.5, fontWeight: 700, color: C.red.tx, marginBottom: 8, textAlign: 'right' }}>◀ loss zone left of the line</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: ROW_GAP }}>
        {stages.map(stage => {
          const b = before[stage.key], a = after[stage.key]
          const aNegative = a < 0
          return (
            <div key={stage.key} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: '0 0 100px', fontSize: 11.5, fontWeight: 700, color: C.t2 }}>{stage.label}</div>
              <div style={{ flex: 1, position: 'relative' }}>
                {/* zero line spans both bar rows */}
                <div style={{ position: 'absolute', left: `${zeroPct}%`, top: 0, bottom: 0, width: 1, background: C.border2, zIndex: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: BAR_GAP }}>
                  <div style={{ position: 'relative', height: BAR_H }} title={`Current ${stage.label}: ${fmt(b)}`}>
                    <div style={{
                      position: 'absolute', left: `${barLeft(b)}%`, width: `${Math.max(barLen(b), b !== 0 ? 0.6 : 0)}%`, top: 0, bottom: 0,
                      background: C.border2, borderRadius: 4,
                    }} />
                  </div>
                  <div style={{ position: 'relative', height: BAR_H }} title={`Planned ${stage.label}: ${fmt(a)}`}>
                    <div style={{
                      position: 'absolute', left: `${barLeft(a)}%`, width: `${Math.max(barLen(a), a !== 0 ? 0.6 : 0)}%`, top: 0, bottom: 0,
                      background: aNegative ? C.red.tx : stage.color, borderRadius: 4,
                      boxShadow: `0 1px 4px ${aNegative ? 'rgba(220,38,38,0.25)' : 'rgba(0,0,0,0.12)'}`,
                      transition: 'left 160ms cubic-bezier(0.22, 1, 0.36, 1), width 160ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }} />
                  </div>
                </div>
              </div>
              <div style={{ flex: '0 0 128px', textAlign: 'right' }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: aNegative ? C.red.tx : C.t1, fontVariantNumeric: 'tabular-nums' }}>{fmt(a)}</div>
                <div style={{ fontSize: 10.5, color: C.t3, marginTop: 1 }}>from {fmt(b)}</div>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 16, fontSize: 11, color: C.t3 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.border2, display: 'inline-block' }} />Current</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.acc, display: 'inline-block' }} />Planned</span>
      </div>
    </div>
  )
}

// Numeric (not string-formatted) version of the shared pct() helper — needed wherever the raw
// number is compared (e.g. MiniStatCard's higherIsBetter direction), not just displayed.
const pctNum = (a, b) => b ? (a / b) * 100 : 0

// Small "from → to" comparison tile used under the waterfall (CM1%, COGS%, S&D, Marketing Spend) —
// tints the "to" value and arrow green/red based on whether the change is favorable, per
// higherIsBetter (true: CM1% rising is good; false: COGS%/S&D falling is good; undefined/omitted:
// no inherent direction, e.g. Marketing Spend is a lever input, not a result to grade).
function MiniStatCard({ label, from, to, format, higherIsBetter }) {
  const delta = from != null && to != null ? to - from : null
  const improved = higherIsBetter == null || delta == null || Math.abs(delta) < 1e-9
    ? null
    : higherIsBetter ? delta > 0 : delta < 0
  const tone = improved == null ? C.t1 : improved ? C.green.tx : C.red.tx
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: 0.2 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginTop: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: C.t3 }}>{format(from)}</span>
        <span style={{ fontSize: 12, color: improved == null ? C.t3 : tone }}>→</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: tone }}>{format(to)}</span>
      </div>
    </div>
  )
}

// Big hero readout for the number that actually decides whether a promo is a good idea — reacts
// strongly (red, "loss" framing) the moment CM2 crosses zero, instead of reading the same as every
// other line in a plain waterfall.
function Cm2HeroCard({ before, after, beforePct, afterPct }) {
  // "State" color — is the PLANNED CM2 itself a loss? — colors the headline number/background.
  // "Trend" color — is the CHANGE from current an improvement or a decline? — colors the delta,
  // completely independent of state: a still-positive-but-shrinking CM2 (e.g. ₹7.39L → ₹4.42L)
  // must show its delta as a decline (red ▼), never green, even though ₹4.42L alone isn't a loss.
  const negative = after < 0
  const statePalette = negative ? C.red : C.green
  const delta = after - before
  const improved = delta > 0.5
  const declined = delta < -0.5
  const trendPalette = declined ? C.red : improved ? C.green : null
  return (
    <div style={{
      background: negative
        ? 'linear-gradient(135deg, #fff 55%, #fef2f2 100%)'
        : 'linear-gradient(135deg, #fff 55%, #f0fdf4 100%)',
      border: `1px solid ${C.border}`,
      borderRadius: 14, padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16,
    }}>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Planned Contribution Margin 2 (CM2) {negative && <span style={{ color: statePalette.tx }}>— LOSS</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
          <span style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: C.t1 }}>{fmt(after)}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: statePalette.tx }}>{afterPct != null ? `${afterPct.toFixed(1)}%` : '—'}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 11, color: C.t3 }}>Current CM2: {fmt(before)} ({beforePct != null ? `${beforePct.toFixed(1)}%` : '—'})</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: trendPalette ? trendPalette.tx : C.t2, marginTop: 2 }}>
          {trendPalette && (improved ? '▲ ' : '▼ ')}{delta >= 0 ? '+' : ''}{fmt(delta)} {trendPalette && <span style={{ fontWeight: 500 }}>{improved ? 'improvement' : 'decline'}</span>}
        </div>
      </div>
    </div>
  )
}

// Current-scenario mini stat, shown alongside the picker so the user sees exactly what they're
// about to simulate against before touching a single slider.
function BaselineStat({ label, value, sub, accent, divider = true }) {
  return (
    <div style={{
      minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      paddingRight: divider ? 14 : 0, borderRight: divider ? `1px solid ${C.border}` : 'none',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: accent || C.t1, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.t3, marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

export default function PriceSimulator({ variantProducts = [], productGroups = [] }) {
  const [pickMode, setPickMode] = useState('product')
  const [selectedSku, setSelectedSku] = useState(null)
  const [search, setSearch] = useState('')
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  // Listing Price is user-editable (to simulate a hypothetical listing price change), but ALWAYS re-seeds
  // to the product's own real average Listing Price the moment a NEW product is selected — null
  // here means "use the real value," a number means "the user has overridden it for this product."
  const [listingPriceOverride, setListingPriceOverride] = useState(null)
  const [discountPct, setDiscountPct] = useState(10)
  // Whether Discount% is still at its seeded default (mirrors listingPriceOverride===null for
  // Listing Price) — used alongside it so "Planned" price at DEFAULT uses baseline.gross/net
  // directly (scaled only by volume) instead of always multiplying through priceMultiplier, which
  // is never exactly 1.0 even at default because discountPct is seeded/displayed rounded to 2
  // decimals (see seedDiscount below) — confirmed this left a small but real ~0.1-0.2% Current-
  // vs-Planned CM2 gap ("₹-260 decline" with every lever untouched). Same fix pattern as
  // targetRoasIsDefault above.
  const [discountPctIsDefault, setDiscountPctIsDefault] = useState(true)
  const [volumeDeltaPct, setVolumeDeltaPct] = useState(0)
  const [targetRoas, setTargetRoas] = useState(4)
  // The exact (unrounded) real ROAS this product was seeded with, and whether the user has since
  // dragged the Target ROAS slider away from that seed — used so "Planned" spend at DEFAULT uses
  // the product's exact real ad spend directly, not a round-tripped Net÷TargetROAS recomputation.
  // targetRoas itself is rounded to 1 decimal for display (see resetLevers), so recomputing spend
  // from it can never exactly reproduce real spend even when nothing else changed — confirmed this
  // was still leaving a small but real Current-vs-Planned CM2 gap at "default" levers. Tracking the
  // untouched state directly sidesteps that rounding entirely instead of chasing ever-smaller
  // floating-point precision.
  const [targetRoasIsDefault, setTargetRoasIsDefault] = useState(true)
  // Return Rate lever is shown and edited as the ABSOLUTE rate (not a delta on top of a hidden
  // baseline) — re-seeded to the product's own real mature-window rate on selection, same as
  // discountPct/listingPriceOverride below.
  const [returnRatePct, setReturnRatePct] = useState(0)
  // Whether Return Rate is still at its seeded default — mirrors listingPriceOverride/
  // discountPctIsDefault above. returnRatePct is seeded ROUNDED to 1 decimal
  // (Math.round(baseline.returnRevRate*1000)/10), so (returnRatePct/100 − baseline.returnRevRate)
  // is never exactly 0 at "default" — it's a tiny rounding residual that fed into
  // extraReturnFraction and cascaded into a small but real Current-vs-Planned CM2 gap even with
  // every lever untouched (confirmed: still a real "₹115 decline" after fixing the price/spend
  // rounding sources above). Same fix pattern: force extraReturnFraction to exactly 0 when untouched.
  const [returnRatePctIsDefault, setReturnRatePctIsDefault] = useState(true)
  const [sndRateSlabs, setSndRateSlabs] = useState(null)
  useEffect(() => { loadSndRates().then(setSndRateSlabs) }, [])

  const products = pickMode === 'variant' ? variantProducts : productGroups
  const selectedProduct = selectedSku == null ? null : products.find(p => p.sku === selectedSku) || null

  const handlePickModeChange = mode => { setPickMode(mode); setSelectedSku(null); setSearch('') }

  useEffect(() => {
    if (selectedSku != null && !products.some(p => p.sku === selectedSku)) setSelectedSku(null)
  }, [products, selectedSku])

  // Resets every lever to this product's own real current values — Listing Price to its real average
  // (or clears any override), Discount% to its real current discount, Return Rate to its real
  // mature-window rate, Volume Change back to 0%, Target ROAS back to a neutral 4x — so the
  // simulator always opens on "what's actually true today," letting the user adjust from there
  // rather than an arbitrary fixed starting point. Shared by the auto-reseed-on-product-change
  // effect below and the manual reset button in the card header.
  const resetLevers = product => {
    if (!product) return
    setListingPriceOverride(null)
    // Seeded from (Listing Price − Prepaid ASP) ÷ Listing Price — the REAL effective discount,
    // matching what the user sees when comparing Listing Price against ASP on screen — NOT
    // product.currentDiscount (the fact table's own tracked Discount column), which is a
    // narrower, separately-tracked coupon/promo figure that undercounts the true gap (confirmed:
    // observed real cases where Listing≈₹1011 and ASP≈₹842, a genuine ~17% gap, while the tracked
    // Discount column implied only ~4%, presumably excluding tax/other pricing components folded
    // into ASP). Uses product.prepaidAsp (Prepaid-orders-only ASP), NOT the blended asp across
    // both payment types — COD orders carry a real handling-fee surcharge baked into
    // SellingPrice_Inc_GST that Listing_Price never reflects (confirmed via live BigQuery
    // order-level detail: COD SellingPrice_Inc_GST can run ~₹68 above Listing_Price at Discount=0
    // on the same product), which was making this ratio come out NEGATIVE for COD-heavy products —
    // an impossible-looking "current discount." Falls back to the blended `asp` only when this
    // product has no Prepaid orders at all in the selected range (prepaidAsp null).
    const referenceAsp = product.prepaidAsp ?? product.asp
    const seedDiscount = product.listingPrice > 0
      ? ((product.listingPrice - referenceAsp) / product.listingPrice) * 100
      : 0
    setDiscountPct(Math.max(0, Math.min(70, Math.round(seedDiscount * 100) / 100)))
    setDiscountPctIsDefault(true)
    setVolumeDeltaPct(0)
    // Seeded to this product's own REAL current ROAS (Net Revenue ÷ real ad spend) — not a flat
    // 4x — so that at every lever left at its default, Planned Spend (Net÷TargetROAS) reproduces
    // the SAME real spend baseline.spend already uses, and Planned CM2 exactly equals Current CM2.
    // Without this, a product whose real ROAS is far from 4x (e.g. a low-ad-spend, mostly-organic
    // product with real ROAS ~43x) would show a misleadingly different "Planned" CM2 even with
    // every other lever untouched — confirmed: Orthopaedic Heating Belt showed Planned CM2 ₹2.62L
    // vs. Current CM2 ₹7.39L at 0% discount/volume change purely because Target ROAS defaulted to
    // 4x against its real ~43x. Falls back to 4.0x only when this product has no real spend on
    // record (adSpend null/0) or no net revenue to divide by.
    const realRoas = product.adSpend > 0 && product.net > 0 ? product.net / product.adSpend : null
    setTargetRoas(realRoas != null ? Math.max(0.5, Math.round(realRoas * 10) / 10) : 4)
    setTargetRoasIsDefault(true)
    setReturnRatePct(Math.round((product.returnRevRate || 0) * 1000) / 10)
    setReturnRatePctIsDefault(true)
  }

  // Re-seed every lever the moment a product is selected (or changed) — see resetLevers above.
  useEffect(() => { resetLevers(selectedProduct) }, [selectedProduct?.sku])

  // Typeahead — matches SKU, name, subcategory, OR an abbreviation of the name (each word's first
  // letter, e.g. "XL Coccyx Seat Cushion" → "xlcsc") so a short acronym works as well as the full name.
  const abbrevOf = name => (name || '').split(/\s+/).map(w => w[0] || '').join('').toLowerCase()
  const labelFor = p => (pickMode === 'product' ? p.name : `${p.sku} — ${p.name}`)
  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return products
      .filter(p => p.sku.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q) || (p.subCategory || '').toLowerCase().includes(q) || abbrevOf(p.name).includes(q))
      .slice(0, 8)
  }, [products, search])

  // Reference price the Discount% slider is measured against — the product's real Listing Price,
  // straight from the fact table (Listing_Price column), overridable by the user
  // (listingPriceOverride) to simulate a hypothetical new listing price. NEVER silently falls back to ASP
  // as if it were Listing Price: ASP is the CURRENT SELLING price — already net of whatever
  // real-world discount is live today (e.g. Listing ₹999, currently selling at ₹850 = 15% off
  // already) — so treating it as a stand-in for Listing Price would silently understate the true
  // discount% and mislabel an already-discounted price as "the list price." When this product has
  // no Listing_Price row for the selected range, referencePrice is null and the UI explains that
  // Discount% is applying to ASP directly instead — but the user can still type a real Listing
  // Price into the field to switch the calculation onto the normal listing-price-based path.
  const referencePrice = listingPriceOverride ?? selectedProduct?.listingPrice ?? null
  // Anchor for the Listing Price slider's range/default display when this product has no real
  // Listing_Price on record — falls back to its current ASP so the slider still centers on a
  // sensible, product-scaled value instead of an arbitrary fixed number.
  const listingPriceSliderAnchor = referencePrice ?? selectedProduct?.asp ?? 500

  // Both "Current" (this baseline) AND every "Planned" figure must be built from the MATURE
  // return-rate components (returnRevRate/rtoPct/cirPct/returnStatusPct/cancelPct/exchPct — see
  // PnLPage.jsx's d2cProductList comment), never from this SKU's own live-selected-range net/snd
  // directly. A recent date range hasn't had time for its own RTOs/returns/CIRs to resolve, so
  // trusting its raw `net`/`sndPerUnit` as "Current" would silently show an inflated CM1/CM2 (too
  // little return-loss baked in) that the mature-rate-driven "Planned" simulation would then
  // never actually be comparable against — the same immaturity bug the Return Rate Impact lever
  // was built to fix, just applied to the STARTING point instead of only the slider's delta.
  // Net Revenue is rebuilt as excRev × (1 − matureReturnRevRate) — excRev (Gross Ex GST BEFORE any
  // return deduction) is a stable figure return-status can't distort, unlike the live-range `net`.
  // SnD's logistics component is rebuilt from scratch via blendedLogisticsPerUnit using the mature
  // rto/return/cir/exchange/cancel mix + this product's real weight; fulfilment/payment-gateway/
  // software-fee are recomputed with their own fixed formulas (same ones shSkuCosts uses
  // server-side) rather than carried over from the live-range sndPerUnit total.
  const baseline = useMemo(() => {
    if (!selectedProduct) return null
    const { units, gross, excRev, cogsPerUnit, sndPerUnit } = selectedProduct
    if (sndPerUnit == null || units <= 0) return null
    const matureReturnRevRate = selectedProduct.returnRevRate ?? 0
    const rtoPct = selectedProduct.rtoPct || 0
    // Exchange gets its own extra forward+reverse leg on top of the shared forward charge inside
    // blendedLogisticsPerUnit — confirmed against the business's own reference PnL spreadsheet AND
    // the business's explicit confirmation of the operational logic (every non-cancelled order,
    // Exchange included, already pays one forward leg; Exchange additionally pays a reverse pickup
    // + a second forward replacement shipment) — kept as its own parameter here so the incremental-
    // reverse-logistics weighting below can still track it separately.
    const nonRtoReturnPct = (selectedProduct.returnStatusPct || 0) + (selectedProduct.cirPct || 0)
    const exchPct = selectedProduct.exchPct || 0
    const cancelPct = selectedProduct.cancelPct || 0

    const net = (excRev || 0) * (1 - matureReturnRevRate)
    // COGS is charged only on the share of units that stayed sold (1 − matureReturnRevRate) — same
    // "net units" convention the real D2C PnL table already uses (pnlUtils.js's netRevenueOf:
    // netUnits = units − cancelled/RTO/returned/CIR units, so COGS never prices units that didn't
    // stay sold). A Cancelled/RTO'd/CIR'd/Returned unit's COGS isn't fully sunk (goods come back to
    // inventory); Exchange is excluded from this reduction (matureReturnRevRate already excludes
    // it) since an exchanged unit's COGS was never actually lost — the customer still has a product.
    const grossCogs = cogsPerUnit * units
    const cogs = grossCogs * (1 - matureReturnRevRate)
    const gm = net - cogs

    const rate = sndRateSlabs ? rateForWeightGm(sndRateSlabs, selectedProduct.weightGm ?? null) : null
    let snd
    if (rate) {
      const { logistics, fulfilment } = blendedLogisticsPerUnit(rate, { rtoPct, returnPct: nonRtoReturnPct, exchangePct: exchPct, cancelPct })
      const paymentGw = (gross / units) * PAYMENT_GW_RATE // per-unit gross Inc GST × PG rate
      const softwareFee = 15
      snd = (logistics + fulfilment + paymentGw + softwareFee) * units
    } else {
      // snd-rates.json hasn't loaded yet or this product has no weight on record — fall back to
      // the live-range blended sndPerUnit rather than showing no SnD at all while waiting.
      snd = sndPerUnit * units
    }
    const cm1 = gm - snd
    // Real Meta+Google ad spend for this product (selectedProduct.adSpend, from
    // PnLPage.jsx's d2cProductGroups — the same pnlAdSpendMap the D2C tab's own kpiSummary uses),
    // for the selected date range. Only available in Product mode (SubCategory grain) — no ad
    // platform attributes spend below that to individual Product Variants/SKUs, so Variant mode
    // still has no real baseline spend to show.
    const spend = selectedProduct.adSpend ?? 0
    const cm2 = cm1 - spend
    return {
      net, gross, units, cogs, gm, snd, cm1, spend, cm2, asp: selectedProduct.asp,
      // Prepaid-only ASP — used ONLY for the Current Discount comparison against Listing Price
      // (see resetLevers' seedDiscount and currentDiscountPct below), never for CM1/CM2/waterfall,
      // which all correctly keep using the blended `asp` across both payment types.
      prepaidAsp: selectedProduct.prepaidAsp ?? null,
      hasRealAdSpend: selectedProduct.adSpend != null,
      listingPrice: selectedProduct.listingPrice, currentDiscount: selectedProduct.currentDiscount,
      returnRevRate: matureReturnRevRate,
      returnRateSource: selectedProduct.returnRateSource,
      weightGm: selectedProduct.weightGm,
      rtoPct, cirPct: selectedProduct.cirPct || 0,
      returnStatusPct: selectedProduct.returnStatusPct || 0, exchPct: selectedProduct.exchPct || 0,
      drr: selectedProduct.drr || 0,
    }
  }, [selectedProduct, sndRateSlabs])

  const hasBaseline = baseline != null

  // Current discount % (as tracked in the fact table) vs. Planned discount % (the slider) — the
  // two numbers the user actually asked to see side by side.
  // (Listing Price − Prepaid ASP) ÷ Listing Price — same real-effective-discount formula
  // resetLevers' seedDiscount uses (see that comment for why Prepaid-only, not blended asp).
  const currentDiscountPct = selectedProduct && baseline?.listingPrice
    ? ((baseline.listingPrice - (baseline.prepaidAsp ?? baseline.asp)) / baseline.listingPrice * 100)
    : null
  const plannedSellingPrice = referencePrice != null ? referencePrice * (1 - discountPct / 100) : null
  // The REAL price multiplier applied to baseline.net: ratio of the planned price to the
  // product's CURRENT actual selling price, not (1 − discountPct/100) directly — see
  // referencePrice's comment above for why those two differ whenever the product is already
  // discounted off listing today. MUST use the SAME asp basis discountPct was seeded from
  // (baseline.prepaidAsp, falling back to blended baseline.asp — see resetLevers' seedDiscount and
  // currentDiscountPct) — using a DIFFERENT asp here than the one discountPct was derived from
  // silently makes priceMultiplier ≠ 1 even at "default" levers (confirmed real regression: seeding
  // discountPct from Listing-vs-Prepaid-ASP while this ratio still divided by the blended ASP made
  // every "Planned" figure — Net Revenue, SnD%, CM1%, CM2% — show a spurious change with every
  // lever untouched). Falls back to the naive (1 − discountPct/100) only when this specific product
  // has no Listing_Price row on record (see the amber notice below the price tag).
  const priceMultiplierBaseAsp = baseline?.prepaidAsp ?? baseline?.asp
  const priceMultiplier = (priceMultiplierBaseAsp > 0 && plannedSellingPrice != null)
    ? plannedSellingPrice / priceMultiplierBaseAsp
    : 1 - discountPct / 100

  // Extra return-rate impact — returnRatePct is the ABSOLUTE planned rate the user sets (seeded
  // to the product's own mature-window returnRevRate on selection, see the re-seed effect above),
  // so the incremental fraction actually driving extra cost/lost-revenue is (returnRatePct −
  // baseline.returnRevRate), clamped to [0, 1 − baseline rate] so the effective rate can never go
  // negative or exceed 100%. The incremental return share loses its pro-rata NET REVENUE (the
  // sale reverses) but COGS is treated as sunk (a returned unit is often not resellable at full
  // value) — so extraReturnFraction reduces newNet directly without reducing newCogs, correctly
  // shrinking GM/CM1 rather than leaving them unaffected.
  // Forced to exactly 0 at default (see returnRatePctIsDefault above) — returnRatePct is seeded
  // ROUNDED to 1 decimal, so (returnRatePct/100 − baseline.returnRevRate) is never exactly 0 on
  // its own at "default," which was cascading a tiny but real rounding residual into newNet/CM2
  // even with every lever untouched.
  const extraReturnFraction = returnRatePctIsDefault
    ? 0
    : (baseline?.returnRevRate != null
      ? Math.max(0, Math.min(1 - baseline.returnRevRate, (returnRatePct / 100) - baseline.returnRevRate))
      : 0)

  // Incremental reverse-logistics cost from the extra return share (Return Rate Impact lever) —
  // priced with this product's OWN real weight (weightGm) against snd-rates.json, the same rate
  // card every other D2C SnD figure in this app already uses. baseline.snd is ALREADY rebuilt from
  // the mature window's own RTO/CIR/Return/Exchange/Cancel mix (see baseline above), so only the
  // INCREMENTAL slice beyond that (extraReturnFraction, derived from returnRatePct) needs pricing
  // here — split between RTO's own extra cost (rto) and Return/CIR/Exchange's (reverse — Exchange
  // shares this same cost path, confirmed against the business's own reference PnL spreadsheet:
  // Exch_Cost = Fwd_Cost + CIR_Cost, no second forward leg), weighted by their relative share of
  // this product's own mature-window mix (falls back to an even split if neither has any real
  // signal), each net of the `forward` cost every unit already pays regardless of outcome (already
  // counted once in baseline.snd's fixed component).
  const incrementalReverseLogisticsPerUnit = useMemo(() => {
    if (!selectedProduct || !sndRateSlabs || extraReturnFraction <= 0) return 0
    const rate = rateForWeightGm(sndRateSlabs, baseline?.weightGm ?? null)
    if (!rate) return 0
    const rtoShare = baseline.rtoPct || 0
    const reverseShare = (baseline.returnStatusPct || 0) + (baseline.cirPct || 0) + (baseline.exchPct || 0)
    const totalShare = rtoShare + reverseShare
    const rtoWeight = totalShare > 0 ? rtoShare / totalShare : 0.5
    const reverseWeight = totalShare > 0 ? reverseShare / totalShare : 0.5
    return rtoWeight * rate.rto + reverseWeight * rate.reverse
  }, [selectedProduct, sndRateSlabs, baseline, extraReturnFraction])

  const simulated = useMemo(() => {
    if (!hasBaseline) return null
    const volumeMultiplier = 1 + volumeDeltaPct / 100

    // Gross Revenue = price × units, before any GST/return deduction — scales directly with the
    // price and volume multipliers, unaffected by the Return Rate Impact lever (a returned unit
    // still generated gross revenue at the point of sale; the loss shows up in Net Revenue, not here).
    // At default (Listing Price AND Discount both untouched), priceMultiplier is never exactly
    // 1.0 — discountPct is seeded/displayed rounded to 2 decimals, so plannedSellingPrice/asp
    // carries that rounding into the ratio — leaving a small but real (~0.1-0.2%) Current-vs-
    // Planned gap even with nothing changed (confirmed: a real "₹260 decline" on a ~₹2.16L CM2 at
    // fully-default levers). Skip priceMultiplier entirely in that state and use baseline.gross/net
    // directly (scaled only by volume) — same fix pattern as targetRoasIsDefault above.
    const priceUntouched = listingPriceOverride == null && discountPctIsDefault
    const effectivePriceMultiplier = priceUntouched ? 1 : priceMultiplier
    const newGross = (baseline.gross || 0) * effectivePriceMultiplier * volumeMultiplier
    const newNet = baseline.net * effectivePriceMultiplier * volumeMultiplier * (1 - extraReturnFraction)
    const newCogs = baseline.cogs * volumeMultiplier
    const newGm = newNet - newCogs

    // Split fixed-per-unit SnD (scales with volume only) from the payment-gateway slice (≈1.1% of
    // GROSS, scales with price × volume) — baseline.snd is a single blended total, so approximate
    // the split via the known payment-gateway rate constant rather than re-deriving per-SKU.
    const baselineGrossApprox = baseline.net > 0 ? baseline.net : 0 // Net ≈ Gross ex-GST; pgFee is on Gross Inc GST, kept simple/consistent
    const baselinePgFee = baselineGrossApprox * PAYMENT_GW_RATE
    const baselineFixedSnd = Math.max(baseline.snd - baselinePgFee, 0)
    const newFixedSnd = baselineFixedSnd * volumeMultiplier
    const newPgFee = baselineGrossApprox * effectivePriceMultiplier * volumeMultiplier * PAYMENT_GW_RATE
    // Extra returned/RTO'd units (beyond the baseline's own mature-window rate) each add real
    // reverse-logistics cost — priced per-unit above, applied here to the ABSOLUTE unit count the
    // extra return fraction represents (baseline.units × volumeMultiplier × extraReturnFraction).
    const newReverseLogisticsCost = (baseline.units || 0) * volumeMultiplier * extraReturnFraction * incrementalReverseLogisticsPerUnit
    const newSnd = newFixedSnd + newPgFee + newReverseLogisticsCost

    const newCm1 = newGm - newSnd
    // At default (user hasn't touched Target ROAS), scale the EXACT real spend directly by
    // volume×price instead of round-tripping through the rounded targetRoas slider value
    // (targetRoas is rounded to 1 decimal for display — recomputing spend from it can never
    // exactly reproduce baseline.spend even when nothing else changed, leaving a small but real
    // Current-vs-Planned CM2 gap at "default" levers). Once the user actually drags the slider,
    // switch to the standard Net÷TargetROAS formula as normal.
    const newSpend = targetRoasIsDefault
      ? (baseline.spend || 0) * effectivePriceMultiplier * volumeMultiplier
      : (targetRoas > 0 ? newNet / targetRoas : 0)
    const newCm2 = newCm1 - newSpend

    return { gross: newGross, net: newNet, cogs: newCogs, gm: newGm, snd: newSnd, cm1: newCm1, spend: newSpend, cm2: newCm2 }
  }, [hasBaseline, baseline, priceMultiplier, listingPriceOverride, discountPctIsDefault, volumeDeltaPct, targetRoas, targetRoasIsDefault, extraReturnFraction, incrementalReverseLogisticsPerUnit])

  const breakevenDiscountPct = useMemo(() => {
    if (!hasBaseline) return null
    const volumeMultiplier = 1 + volumeDeltaPct / 100
    const baselineGrossApprox = baseline.net > 0 ? baseline.net : 0
    const baselinePgFee = baselineGrossApprox * PAYMENT_GW_RATE
    const baselineFixedSnd = Math.max(baseline.snd - baselinePgFee, 0)
    const newFixedSnd = baselineFixedSnd * volumeMultiplier
    const newCogs = baseline.cogs * volumeMultiplier
    const spendFactor = targetRoas > 0 ? 1 / targetRoas : 0
    const retainedFraction = 1 - extraReturnFraction
    // coeff carries (1 − extraReturnFraction) since newNet is scaled by it too (see simulated's
    // newNet above) — held fixed at the Return Rate Δ slider's current value, same as
    // volumeDeltaPct/targetRoas, so this still answers "at TODAY's other lever settings, what's
    // the max discount before CM2 turns negative."
    const coeff = volumeMultiplier * baseline.net * retainedFraction * (1 - PAYMENT_GW_RATE - spendFactor)
    if (Math.abs(coeff) < 1e-9) return null
    // pStar solves for the ratio applied to baseline.net (i.e. priceMultiplier = newPrice ÷
    // baseline.asp) at which CM2 = 0 — convert it back to a discount off referencePrice (Listing
    // Price, or ASP itself when this product has no Listing_Price on record, matching
    // priceMultiplier's own fallback above), the same conversion "Planned Selling Price" uses in reverse.
    const pStar = (newCogs + newFixedSnd) / coeff
    const discount = (baseline.asp > 0 && referencePrice > 0)
      ? (1 - (pStar * baseline.asp) / referencePrice) * 100
      : (1 - pStar) * 100
    if (!isFinite(discount)) return null
    return discount
  }, [hasBaseline, baseline, volumeDeltaPct, targetRoas, selectedProduct, referencePrice, extraReturnFraction])

  const gmPctBefore = hasBaseline && baseline.net > 0 ? baseline.gm / baseline.net * 100 : null
  const gmPctAfter = simulated && simulated.net > 0 ? simulated.gm / simulated.net * 100 : null
  const cm1PctBefore = hasBaseline && baseline.net > 0 ? baseline.cm1 / baseline.net * 100 : null
  const cm1PctAfter = simulated && simulated.net > 0 ? simulated.cm1 / simulated.net * 100 : null
  const cm2PctBefore = hasBaseline && baseline.net > 0 ? baseline.cm2 / baseline.net * 100 : null
  const cm2PctAfter = simulated && simulated.net > 0 ? simulated.cm2 / simulated.net * 100 : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 1220 }}>
      <style>{`
        input.pnl-no-spinner::-webkit-outer-spin-button,
        input.pnl-no-spinner::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input.pnl-no-spinner { -moz-appearance: textfield; }
      `}</style>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.t1, letterSpacing: -0.2 }}>Price Simulator</div>
        <div style={{ fontSize: 12.5, color: C.t3, marginTop: 2 }}>
          Pick a product and adjust its price, discount, volume, and ROAS to see CM1 and CM2 update instantly — all against its real listing price and cost data.
        </div>
      </div>

      {/* ── Product picker + current scenario snapshot ── */}
      <Card style={{ padding: '16px 22px', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {PICK_MODES.map((m, i) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <div style={{ width: 1, height: 14, background: '#D6D0B0', margin: '0 4px' }} />}
                <button onClick={() => handlePickModeChange(m.id)}
                  style={{
                    fontSize: 12, fontWeight: pickMode === m.id ? 700 : 500, padding: '5px 14px', borderRadius: 7, border: 'none', outline: 'none',
                    background: pickMode === m.id ? C.acs : 'transparent', color: pickMode === m.id ? '#3F3D33' : C.t2,
                    cursor: 'pointer',
                  }}>{m.label}</button>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: C.t3 }}>
            {pickMode === 'product'
              ? 'A Product blends all its color/size variants, weighted by units sold.'
              : 'A Variant is one exact SKU / product-id from the item master.'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ position: 'relative', flex: '1 1 340px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t2 }}>{pickMode === 'product' ? 'Product' : 'Product Variant (SKU)'}</span>
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setSuggestOpen(true); setHighlightIdx(0) }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
                onKeyDown={e => {
                  if (!suggestOpen || suggestions.length === 0) return
                  if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1)) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)) }
                  else if (e.key === 'Enter') {
                    e.preventDefault()
                    const pick = suggestions[highlightIdx]
                    if (pick) { setSelectedSku(pick.sku); setSearch(labelFor(pick)); setSuggestOpen(false) }
                  } else if (e.key === 'Escape') { setSuggestOpen(false) }
                }}
                placeholder={pickMode === 'product' ? "Search product…" : "Search SKU or product…"}
                style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, fontSize: 13, fontWeight: 600, color: C.t1, background: '#fff', outline: 'none' }}
              />
            </label>
            {suggestOpen && suggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 20,
                background: '#fff', border: `1px solid ${C.border2}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                maxHeight: 260, overflowY: 'auto',
              }}>
                {suggestions.map((p, i) => (
                  <div
                    key={p.sku}
                    onMouseDown={() => { setSelectedSku(p.sku); setSearch(labelFor(p)); setSuggestOpen(false) }}
                    onMouseEnter={() => setHighlightIdx(i)}
                    style={{
                      padding: '9px 12px', cursor: 'pointer', fontSize: 13,
                      background: i === highlightIdx ? C.acl : 'transparent',
                      borderBottom: i < suggestions.length - 1 ? `1px solid ${C.border}` : 'none',
                    }}>
                    <div style={{ fontWeight: 700, color: C.t1 }}>{pickMode === 'product' ? p.name : p.sku}</div>
                    <div style={{ fontSize: 11.5, color: C.t3, marginTop: 1 }}>
                      {pickMode === 'product' ? `${p.variantCount} variant${p.variantCount === 1 ? '' : 's'}` : p.name} · {fmtN(p.units)} units · {fmt(p.gross)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {hasBaseline && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${baseline.gross != null ? 9 : 8}, 1fr)`, gap: 10, overflowX: 'auto', paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            {baseline.gross != null && <BaselineStat label="Gross Revenue" value={fmt(baseline.gross)} />}
            <BaselineStat label="Units Sold" value={fmtN(baseline.units)} />
            <BaselineStat label="DRR (Units/Day)" value={fmtN(Math.round(baseline.drr))} />
            {/* Prepaid-only ASP — consistent with the Current Discount fix below (Promo Levers):
                COD orders carry a real handling-fee surcharge baked into SellingPrice_Inc_GST that
                Listing_Price never reflects, so a blended-both-payment-types ASP isn't the right
                comparison figure here. Falls back to the blended asp only when this product has
                zero Prepaid orders in the selected range. Gross Revenue/Net Revenue/COGS/GM%/CM1%/
                CM2% below all deliberately stay on the full blended (COD+Prepaid) figures — only
                this one ASP readout switches, per explicit decision to keep every other KPI
                reflecting the real, whole business. */}
            <BaselineStat label="ASP" value={fmtPrice(baseline.prepaidAsp ?? baseline.asp)} />
            <BaselineStat label="Net Revenue" value={fmt(baseline.net)} />
            <BaselineStat label="COGS / Unit" value={fmtPrice(selectedProduct.cogsPerUnit)} />
            <BaselineStat label="GM %" value={pct(baseline.gm, baseline.net)} />
            <BaselineStat label="CM1 %" value={pct(baseline.cm1, baseline.net)} />
            <BaselineStat label="CM2 %" value={pct(baseline.cm2, baseline.net)} divider={false} />
          </div>
        )}
      </Card>

      {!selectedProduct ? (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 18px', fontSize: 13, color: C.t3, textAlign: 'center' }}>
          Search for a product or variant above to start simulating a discount, volume, and ROAS scenario against its real numbers.
        </div>
      ) : !hasBaseline ? (
        <div style={{ background: C.amber.bg, border: `1px solid ${C.amber.bd}`, borderRadius: 12, padding: '16px 18px', fontSize: 13, fontWeight: 600, color: C.amber.tx }}>
          This product has no S&D coverage for the selected date range, so it can't be simulated yet — try a different product or widen the date range.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'stretch' }}>
          {/* ── Levers ── */}
          <div style={{ flex: '1 1 340px', display: 'flex' }}>
            <Card style={{ flex: 1, gap: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <SectionLabel>Promo Levers</SectionLabel>
                <button
                  onClick={() => resetLevers(selectedProduct)}
                  title="Reset all levers to this product's real current values"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 26, padding: 0, borderRadius: 7,
                    border: `1px solid ${C.border2}`, background: '#fff', color: C.t3,
                    cursor: 'pointer', transition: 'color 120ms, border-color 120ms, transform 120ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = C.acd; e.currentTarget.style.borderColor = C.acc }}
                  onMouseLeave={e => { e.currentTarget.style.color = C.t3; e.currentTarget.style.borderColor = C.border2 }}
                  onMouseDown={e => { e.currentTarget.style.transform = 'rotate(-90deg)' }}
                  onMouseUp={e => { e.currentTarget.style.transform = 'rotate(0deg)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 1 2.64 6.36" />
                    <path d="M3 21v-6h6" />
                  </svg>
                </button>
              </div>

              {/* Listing Price — a slider like every other lever here, seeded to the product's own
                  real average Listing Price whenever a new product is selected (see the re-seed
                  effect above), and draggable to simulate a hypothetical listing price change.
                  Customers buy off THIS price, then coupons/promo discounts (the Discount% lever
                  below) get layered on top of it — the two are deliberately kept as separate
                  inputs rather than working off ASP directly, since ASP is only the after-the-fact
                  OUTCOME of Listing Price + whatever discount happened to apply, not something a
                  promo can be planned against directly. Range spans 50%–150% of the real listing
                  price (or the current ASP as a fallback anchor when this product has none on
                  record) so the slider stays meaningfully scaled whether the product is a ₹300
                  accessory or a ₹5,000 mobility aid. */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <NumberInputField
                  label="Listing Price" value={Math.round(referencePrice ?? listingPriceSliderAnchor)}
                  onChange={v => setListingPriceOverride(Math.round(v))}
                  min={1} max={1000000} step={1} prefix="₹"
                />
                <NumberInputField label="Discount" value={discountPct} onChange={v => { setDiscountPct(Math.round(v * 100) / 100); setDiscountPctIsDefault(false) }} min={0} max={70} step={0.01} suffix="%" />
              </div>
              {referencePrice == null && (
                <div style={{ fontSize: 11.5, color: C.amber.tx, background: C.amber.bg, border: `1px solid ${C.amber.bd}`, borderRadius: 10, padding: '10px 14px' }}>
                  No Listing Price on record for this {pickMode === 'product' ? 'product' : 'variant'} in the selected range — enter one above, or Discount% will apply directly to its current ASP ({fmtPrice(baseline?.asp || 0)}) instead.
                </div>
              )}
              {currentDiscountPct != null && (
                <div style={{ display: 'flex', gap: 18, fontSize: 12 }}>
                  <span style={{ color: C.t3 }}>Current discount <b style={{ color: C.t1 }}>{currentDiscountPct.toFixed(2)}%</b></span>
                  <span style={{ color: C.t3 }}>Planned discount <b style={{ color: C.acd }}>{discountPct.toFixed(2)}%</b></span>
                </div>
              )}

              {/* Selling Price after discount — read-only, moves automatically off Listing Price
                  and Discount above (it's literally plannedSellingPrice, the same figure the
                  price tag shows), shown here again as its own labeled row so it's legible
                  without cross-referencing the tag. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase' }}>Current Selling Price</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.t3 }}>{fmtPrice(baseline?.asp || 0)}</div>
                </div>
                <div style={{ fontSize: 16, color: C.t3 }}>→</div>
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.acd, textTransform: 'uppercase' }}>New Selling Price</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: C.acd }}>{fmtPrice(plannedSellingPrice ?? baseline?.asp ?? 0)}</div>
                </div>
              </div>

              <SliderField label="Volume Change" value={volumeDeltaPct} onChange={setVolumeDeltaPct} min={-50} max={200} step={5}
                formatValue={v => `${v > 0 ? '+' : ''}${v}%`} accent={C.blue.tx} />
              <SliderField label="Target ROAS" value={targetRoas} onChange={v => { setTargetRoas(v); setTargetRoasIsDefault(false) }} min={0.5} max={Math.max(15, Math.ceil(targetRoas))} step={0.1}
                formatValue={v => `${v.toFixed(1)}x`} accent={C.green.tx} />

              {selectedProduct && baseline?.returnRevRate != null && (
                <div>
                  {/* Return Rate shown/edited as the ABSOLUTE planned rate, seeded to the
                      product's own real mature-window rate (see the re-seed effect above) —
                      the user drags it UP from there to model a heavier discount pulling in
                      more low-intent buyers who return more, rather than entering a separate
                      "+Xpp on top" delta. */}
                  <SliderField label="Return Rate" value={returnRatePct} onChange={v => { setReturnRatePct(v); setReturnRatePctIsDefault(false) }} min={0} max={100} step={1}
                    formatValue={v => `${v}%`} accent={C.red.tx} />
                  <div style={{ fontSize: 11, color: C.t3, marginTop: 6 }}>
                    Current (mature) Return% <b style={{ color: C.t1 }}>{(baseline.returnRevRate * 100).toFixed(1)}%</b>
                    {baseline.returnRateSource === 'category' && ' (Category avg)'}
                    {baseline.returnRateSource === 'all' && ' (D2C avg)'}
                    {' '}— heavier discounts often pull in more low-intent, higher-return buyers.
                  </div>
                </div>
              )}

              <div style={{ background: breakevenDiscountPct != null && breakevenDiscountPct >= 0 ? C.acl : C.red.bg, border: `1px solid ${breakevenDiscountPct != null && breakevenDiscountPct >= 0 ? C.border2 : C.red.bd}`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: breakevenDiscountPct != null && breakevenDiscountPct >= 0 ? C.acd : C.red.tx, textTransform: 'uppercase', letterSpacing: 0.3 }}>Breakeven Discount</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: breakevenDiscountPct != null && breakevenDiscountPct >= 0 ? C.acd : C.red.tx, marginTop: 2 }}>
                  {breakevenDiscountPct == null ? '—' : `${breakevenDiscountPct.toFixed(1)}%`}
                </div>
                <div style={{ fontSize: 11.5, color: breakevenDiscountPct != null && breakevenDiscountPct >= 0 ? C.acd : C.red.tx, opacity: 0.85, marginTop: 2 }}>
                  {breakevenDiscountPct == null
                    ? 'CM2 cannot reach zero at this Volume Change / Target ROAS combination'
                    : breakevenDiscountPct < 0
                      ? `Already unprofitable at 0% discount, ${volumeDeltaPct > 0 ? '+' : ''}${volumeDeltaPct}% volume and ${targetRoas.toFixed(1)}x ROAS — a ${Math.abs(breakevenDiscountPct).toFixed(1)}% price INCREASE would be needed just to break even`
                      : `Max discount before CM2 turns negative, at ${volumeDeltaPct > 0 ? '+' : ''}${volumeDeltaPct}% volume and ${targetRoas.toFixed(1)}x ROAS`}
                </div>
              </div>
            </Card>
          </div>

          {/* ── Waterfall + CM2 headline ── */}
          <div style={{ flex: '1 1 460px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Cm2HeroCard before={baseline.cm2} after={simulated.cm2} beforePct={cm2PctBefore} afterPct={cm2PctAfter} />
            <Card style={{ gap: 12, padding: 16 }}>
              <div>
                <SectionLabel>Contribution Waterfall</SectionLabel>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.t1, marginTop: 2 }}>
                  {pickMode === 'product' ? selectedProduct.name : selectedProduct.sku}
                </div>
              </div>

              <WaterfallChart
                before={{ gross: baseline.gross || 0, net: baseline.net, gm: baseline.gm, cm1: baseline.cm1, cm2: baseline.cm2 }}
                after={{ gross: simulated.gross || 0, net: simulated.net, gm: simulated.gm, cm1: simulated.cm1, cm2: simulated.cm2 }}
                hideGross={baseline.gross == null}
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                <MiniStatCard label="GM %" from={gmPctBefore} to={gmPctAfter} format={v => v != null ? `${v.toFixed(1)}%` : '—'} higherIsBetter />
                <MiniStatCard label="S&D %" from={pctNum(baseline.snd, baseline.net)} to={pctNum(simulated.snd, simulated.net)} format={v => v != null ? `${v.toFixed(1)}%` : '—'} higherIsBetter={false} />
                <MiniStatCard label="CM1 %" from={cm1PctBefore} to={cm1PctAfter} format={v => v != null ? `${v.toFixed(1)}%` : '—'} higherIsBetter />
                <MiniStatCard label="CM2 %" from={cm2PctBefore} to={cm2PctAfter} format={v => v != null ? `${v.toFixed(1)}%` : '—'} higherIsBetter />
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
