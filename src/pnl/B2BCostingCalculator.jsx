import { useState, useMemo } from 'react'
import { C, fmt } from '../utils.js'

// Forward cost-plus pricing calculator for Offline (B2B/Stockist/MT GT) products — ported
// directly from the business's own "B2B Costing Calculator" reference spreadsheet (shared
// 2026-10-10), then extended (2026-10-10) with a second calculation mode, Qty, and ad-hoc extra
// cost lines per user request.
//
// Per-product inputs: COGS/unit, Listing Price (MRP), GST%, Vol. Weight (kg/unit) — COGS and
// Vol. Weight auto-fill from the dashboard's own cogsMap/item-master weight (via
// offlineProductGroups in PnLPage.jsx) when a real product is picked, same auto-fill convention
// Breakeven ROAS's ReferenceProductPicker already uses; both stay user-editable for a what-if.
// Listing Price and GST% have NO equivalent in Offline's own tracked data (no Listing_Price/
// Discount columns, no GST rate column on the offlineSKU query) so — exactly like the original
// spreadsheet — they're typed in manually every time, never auto-filled.
//
// Shared Assumptions (editable, apply to every product) mirror the spreadsheet's 7 "yellow cell"
// rates exactly:
//   Inbound Logistics Rate   — % of COGS, cost to bring goods INTO the warehouse
//   Forward Logistics Rate   — ₹ per kg (vol. weight), cost to ship OUT to the B2B buyer
//   Selling Incentives %     — % of Selling Price
//   Travelling & Events %    — % of Selling Price
//   Employee Cost %          — % of Selling Price
//   Office Overheads %       — % of Selling Price
//   PG / Finance Cost %      — % of Selling Price
// plus a per-product EBITDA Target % (the spreadsheet varies this row-by-row, not as a shared
// assumption — kept as a per-product lever here to match).
//
// Extra Costs: ad-hoc user-added rows (label + value), each either a flat ₹/unit or a % of
// Selling Price — for one-off costs the 7 shared assumptions don't cover (e.g. "Insurance",
// "Special Packaging"). Summed into totalExtraFlatPerUnit / totalExtraPctOfSp and folded into
// the SAME two formula modes below, so they behave exactly like the existing SI%/T&E%/etc. rates
// (% ones reduce the denominator in Solve-for-Price mode; both kinds are simply subtracted as
// real costs in Solve-for-Profit mode).
//
// Two calculation modes (toggle, 2026-10-10 addition):
//
//   MODE 'price' (original, forward: "I set a profit target, what do I charge?")
//     Step 1 — COGS                = user input (₹/unit)
//     Step 2 — Inbound Cost        = COGS × Inbound Rate%
//     Step 3 — Forward Logistics   = Vol. Weight (kg) × Forward Rate (₹/kg)
//     Step 4 — Total Cost (CM1)    = COGS + Inbound + Forward Logistics + extraFlatPerUnit
//     Step 5 — Selling Price ExGST = Total Cost ÷ (1 − SI% − T&E% − Employee% − Office% − PG%
//                                    − extraPctOfSp% − EBITDA%)
//     Rounded SP                   = ROUND(Selling Price ExGST ÷ 10, 0) × 10  (nearest ₹10)
//     Step 6 — SP incl. GST        = Rounded SP × (1 + GST%)
//     EBITDA ₹/unit                = Rounded SP × EBITDA%   (an INPUT target here, echoed back)
//
//   MODE 'profit' (new, reverse: "a buyer named a price, what profit do I actually get?")
//     Selling Price ExGST is the USER'S OWN INPUT instead of a solved value — every cost line
//     (Inbound/Forward/extraFlat are ₹, SI/T&E/Employee/Office/PG/extraPct are now evaluated
//     AGAINST this given price, not solved for) is subtracted from it directly:
//     EBITDA ₹/unit = Selling Price ExGST − Total Cost(CM1) − (SI%+T&E%+Employee%+Office%+PG%
//                     +extraPct%) × Selling Price ExGST
//     EBITDA %      = EBITDA ₹/unit ÷ Selling Price ExGST   (an OUTPUT here, the whole point of
//                     this mode — can come out lower, or even negative, than any target)
//     No rounding-to-₹10 step — the user's own typed price is used exactly as given, since
//     rounding a price THEY specified would misrepresent the real deal being evaluated.
//
//   Both modes share: Discount on Listing% = (Listing − SP incl. GST) ÷ Listing; Gross Margin% =
//   (SP − Total Cost CM1) ÷ SP; Status = "OK" if SP incl. GST ≤ Listing Price, else "SP > MRP".
//
// Qty (2026-10-10 addition): a pure multiplier on the per-unit Selling Price/EBITDA already
// computed above — Total Order Value = SP incl. GST × Qty, Total Profit = EBITDA/unit × Qty. Qty
// does NOT feed back into any per-unit rate (no bulk/slab pricing) — per-unit economics are
// identical whether Qty is 1 or 10,000, matching how the original spreadsheet has no quantity
// concept at all; Qty here is purely "what does placing this order actually add up to."
const DEFAULT_ASSUMPTIONS = {
  inboundRatePct: 10,      // % of COGS
  forwardRatePerKg: 15,    // ₹ per kg
  sellingIncentivesPct: 2, // % of SP
  travelEventsPct: 5,      // % of SP
  employeeCostPct: 9,      // % of SP
  officeOverheadsPct: 2,   // % of SP
  pgFinanceCostPct: 2,     // % of SP
}
const DEFAULT_EBITDA_TARGET_PCT = 20
const GST_PRESETS = [0, 5, 12, 18]
const MODES = [
  { id: 'price', label: 'Solve for Price', sub: 'I set a profit target → calculate the price to charge' },
  { id: 'profit', label: 'Solve for Profit', sub: 'A buyer named a price → calculate my real profit' },
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

function NumField({ label, value, onChange, suffix, prefix, min = 0, step = 'any', width }) {
  const text = value === '' || value == null ? '' : String(value)
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, width }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t2 }}>{label}</span>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, width: '100%', boxSizing: 'border-box',
        padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, background: '#fff',
      }}>
        {prefix && <span style={{ fontSize: 13, fontWeight: 700, color: C.acd }}>{prefix}</span>}
        <input
          type="number" min={min} step={step} value={value}
          onChange={e => onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="pnl-no-spinner"
          size={Math.max(1, text.length)}
          style={{
            flex: '0 1 auto', minWidth: 0, width: `${Math.max(1, text.length)}ch`, border: 'none', outline: 'none',
            fontSize: 13, fontWeight: 700, color: C.t1, background: 'transparent',
          }}
        />
        {suffix && <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t3 }}>{suffix}</span>}
        <span style={{ flex: 1 }} />
      </div>
    </label>
  )
}

function KpiTile({ label, value, sub, negative }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: 0.2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: negative ? C.red.tx : C.t1, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// Step-by-step cost build-up, drawn as scaled bars (same visual convention as Breakeven ROAS's
// WaterfallBar) so COGS/Inbound/Forward Logistics/Extra Costs read as relative magnitudes against
// Total Cost.
function CostBar({ label, value, scaleMax, tone }) {
  const barPct = scaleMax > 0 ? Math.max(value !== 0 ? 3 : 0, Math.min(100, (value / scaleMax) * 100)) : 0
  const color = tone === 'total' ? C.acc : C.t3
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: tone === 'total' ? 13 : 12.5, fontWeight: tone === 'total' ? 700 : 500, color: tone === 'total' ? C.t1 : C.t2 }}>
        <span>{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: tone === 'total' ? 800 : 600, color: C.t1 }}>{fmt(value)}</span>
      </div>
      <div style={{ position: 'relative', height: 12, background: C.bg, borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barPct}%`, background: color, borderRadius: 5, transition: 'width 120ms ease-out' }} />
      </div>
    </div>
  )
}

// Typeahead over offlineProductGroups (PnLPage.jsx) — picking one auto-fills COGS/unit and Vol.
// Weight from the dashboard's own cogsMap/item-master data; Listing Price and GST% are left for
// the user to type (no such tracked fields exist for Offline products — see file header comment).
function ProductPicker({ productGroups, onApply }) {
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

  const pick = p => { onApply(p); setSearch(p.name); setOpen(false) }

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t2 }}>Product (optional — auto-fills COGS &amp; Weight)</span>
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
      </label>
      {open && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: `1px solid ${C.border2}`, borderRadius: 10, boxShadow: '0 6px 18px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 240, overflowY: 'auto' }}>
          {suggestions.map((p, i) => (
            <div key={p.sku} onMouseDown={() => pick(p)} onMouseEnter={() => setHighlightIdx(i)}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12.5, borderBottom: `1px solid ${C.border}`, background: i === highlightIdx ? C.acl : 'transparent' }}>
              <div style={{ fontWeight: 700, color: C.t1 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>
                COGS ₹{Math.round(p.cogsPerUnit)} · {p.weightKg != null ? `${p.weightKg.toFixed(2)} kg` : 'no weight on record'} · {p.variantCount} variant{p.variantCount === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

let extraCostIdCounter = 0
function newExtraCostRow() {
  extraCostIdCounter += 1
  return { id: extraCostIdCounter, label: '', value: '', unit: 'flat' } // unit: 'flat' (₹/unit) | 'pctOfSp' (% of Selling Price)
}

// One ad-hoc extra-cost row — label + value + a flat-₹-vs-%-of-SP toggle. Rows with no label AND
// no value are ignored by the calculation (so an empty freshly-added row doesn't zero anything
// out), letting the user add several rows and only fill in the ones they need.
function ExtraCostRow({ row, onChange, onRemove }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        value={row.label}
        onChange={e => onChange({ ...row, label: e.target.value })}
        placeholder="e.g. Insurance, Packaging…"
        style={{ flex: '1 1 140px', minWidth: 0, boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, fontSize: 12.5, fontWeight: 600, color: C.t1, background: '#fff', outline: 'none' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '0 0 auto', border: `1px solid ${C.border2}`, borderRadius: 8, padding: '4px 8px', background: '#fff' }}>
        {row.unit === 'flat' && <span style={{ fontSize: 13, fontWeight: 700, color: C.acd }}>₹</span>}
        <input
          type="number" value={row.value}
          onChange={e => onChange({ ...row, value: e.target.value === '' ? '' : parseFloat(e.target.value) })}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="pnl-no-spinner"
          placeholder="0"
          size={Math.max(1, String(row.value ?? '').length || 1)}
          style={{ width: `${Math.max(2, String(row.value ?? '').length)}ch`, border: 'none', outline: 'none', fontSize: 12.5, fontWeight: 700, color: C.t1, background: 'transparent' }}
        />
        {row.unit === 'pctOfSp' && <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t3 }}>%</span>}
      </div>
      <button onClick={() => onChange({ ...row, unit: row.unit === 'flat' ? 'pctOfSp' : 'flat' })}
        title="Toggle ₹/unit vs % of Selling Price"
        style={{ flex: '0 0 auto', fontSize: 11, fontWeight: 700, padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg, color: C.t2, cursor: 'pointer', whiteSpace: 'nowrap' }}>
        {row.unit === 'flat' ? '₹/unit' : '% of SP'}
      </button>
      <button onClick={onRemove} title="Remove"
        style={{ flex: '0 0 auto', width: 26, height: 26, borderRadius: 7, border: `1px solid ${C.border2}`, background: '#fff', color: C.t3, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>
        ×
      </button>
    </div>
  )
}

export default function B2BCostingCalculator({ productGroups = [] }) {
  const [mode, setMode] = useState('price') // 'price' | 'profit'
  const [assumptions, setAssumptions] = useState(DEFAULT_ASSUMPTIONS)
  const setAssumption = (key, v) => setAssumptions(prev => ({ ...prev, [key]: v }))

  const [productName, setProductName] = useState('')
  const [cogsPerUnit, setCogsPerUnit] = useState('')
  const [listingPrice, setListingPrice] = useState('')
  const [gstPct, setGstPct] = useState(5)
  const [volWeightKg, setVolWeightKg] = useState('')
  const [ebitdaTargetPct, setEbitdaTargetPct] = useState(DEFAULT_EBITDA_TARGET_PCT)
  // Only used in 'profit' mode — the price a buyer has actually named, ex-GST (not Rounded-to-₹10
  // like the solved price in 'price' mode, since this is a real number someone else specified).
  const [givenSellingPriceExGst, setGivenSellingPriceExGst] = useState('')
  const [qty, setQty] = useState(1)
  const [extraCosts, setExtraCosts] = useState([])

  const applyProduct = p => {
    setProductName(p.name)
    setCogsPerUnit(Math.round(p.cogsPerUnit * 100) / 100)
    setVolWeightKg(p.weightKg != null ? Math.round(p.weightKg * 100) / 100 : '')
    // Listing Price and GST% are deliberately NOT touched — no such data exists for Offline
    // products (see file header comment), so the user's own entry (or lack of one) is preserved.
  }

  const addExtraCost = () => setExtraCosts(prev => [...prev, newExtraCostRow()])
  const updateExtraCost = (id, next) => setExtraCosts(prev => prev.map(r => r.id === id ? next : r))
  const removeExtraCost = id => setExtraCosts(prev => prev.filter(r => r.id !== id))

  const result = useMemo(() => {
    const cogs = parseFloat(cogsPerUnit)
    const weight = parseFloat(volWeightKg)
    const listing = parseFloat(listingPrice)
    const gst = parseFloat(gstPct)
    const ebitdaTarget = parseFloat(ebitdaTargetPct)
    const q = parseFloat(qty) || 1
    if (!(cogs > 0) || isNaN(weight) || weight < 0) return null

    const activeExtraCosts = extraCosts.filter(r => r.label.trim() !== '' || (r.value !== '' && r.value != null && r.value !== 0))
    const extraFlatPerUnit = activeExtraCosts.filter(r => r.unit === 'flat').reduce((s, r) => s + (parseFloat(r.value) || 0), 0)
    const extraPctOfSp = activeExtraCosts.filter(r => r.unit === 'pctOfSp').reduce((s, r) => s + (parseFloat(r.value) || 0), 0) / 100

    const inboundCost = cogs * (assumptions.inboundRatePct / 100)
    const forwardLogistics = weight * assumptions.forwardRatePerKg
    const totalCostCm1 = cogs + inboundCost + forwardLogistics + extraFlatPerUnit

    const pctRatesSum = (assumptions.sellingIncentivesPct + assumptions.travelEventsPct + assumptions.employeeCostPct + assumptions.officeOverheadsPct + assumptions.pgFinanceCostPct) / 100 + extraPctOfSp

    let sellingPriceExGst, roundedSp, ebitdaPct, ebitdaAmount

    if (mode === 'price') {
      const denom = 1 - pctRatesSum - (ebitdaTarget || 0) / 100
      if (denom <= 0) return { totalCostCm1, inboundCost, forwardLogistics, extraFlatPerUnit, extraPctOfSp, activeExtraCosts, invalid: 'deducted-pct-over-100' }
      sellingPriceExGst = totalCostCm1 / denom
      roundedSp = Math.round(sellingPriceExGst / 10) * 10
      ebitdaPct = ebitdaTarget
      ebitdaAmount = roundedSp * (ebitdaPct / 100)
    } else {
      const given = parseFloat(givenSellingPriceExGst)
      if (!(given > 0)) return { totalCostCm1, inboundCost, forwardLogistics, extraFlatPerUnit, extraPctOfSp, activeExtraCosts, needsPrice: true }
      // No rounding here — this is the buyer's own real number, used exactly as given.
      sellingPriceExGst = given
      roundedSp = given
      const pctCostAmount = pctRatesSum * roundedSp
      ebitdaAmount = roundedSp - totalCostCm1 - pctCostAmount
      ebitdaPct = roundedSp > 0 ? (ebitdaAmount / roundedSp) * 100 : null
    }

    const spInclGst = roundedSp * (1 + (gst || 0) / 100)
    const grossMarginPct = roundedSp > 0 ? (roundedSp - totalCostCm1) / roundedSp : null
    const discountOnListingPct = (listing > 0) ? (listing - spInclGst) / listing : null
    const statusOk = !(listing > 0) || spInclGst <= listing

    return {
      inboundCost, forwardLogistics, totalCostCm1, extraFlatPerUnit, extraPctOfSp, activeExtraCosts,
      sellingPriceExGst, roundedSp, spInclGst, grossMarginPct, ebitdaPct, ebitdaAmount,
      discountOnListingPct, statusOk, hasListing: listing > 0,
      totalOrderValue: spInclGst * q, totalProfit: ebitdaAmount * q, qty: q,
    }
  }, [cogsPerUnit, volWeightKg, listingPrice, gstPct, ebitdaTargetPct, givenSellingPriceExGst, qty, assumptions, extraCosts, mode])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 1220 }}>
      <style>{`
        input.pnl-no-spinner::-webkit-outer-spin-button,
        input.pnl-no-spinner::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input.pnl-no-spinner { -moz-appearance: textfield; }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.t1, letterSpacing: -0.2 }}>B2B Costing Calculator</div>
          <div style={{ fontSize: 12.5, color: C.t3, marginTop: 2 }}>
            {mode === 'price'
              ? "Enter a product's cost and target EBITDA% to work out the Selling Price to quote a B2B/Stockist buyer."
              : 'Enter the Selling Price a buyer has named to see the real EBITDA%/profit it leaves you.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 4 }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} title={m.sub}
              style={{
                fontSize: 12, fontWeight: mode === m.id ? 700 : 500, padding: '6px 14px', borderRadius: 7, border: 'none', outline: 'none',
                background: mode === m.id ? C.acs : 'transparent', color: C.t1, cursor: 'pointer',
              }}>{m.label}</button>
          ))}
        </div>
      </div>

      {/* ── Shared assumptions ── */}
      <Card style={{ padding: '16px 22px', gap: 12 }}>
        <SectionLabel>Shared Assumptions — adjust to match your business</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <NumField label="Inbound Logistics Rate" value={assumptions.inboundRatePct} onChange={v => setAssumption('inboundRatePct', v)} suffix="% of COGS" step={0.1} />
          <NumField label="Forward Logistics Rate" value={assumptions.forwardRatePerKg} onChange={v => setAssumption('forwardRatePerKg', v)} prefix="₹" suffix="/ kg" step={0.5} />
          <NumField label="Selling Incentives" value={assumptions.sellingIncentivesPct} onChange={v => setAssumption('sellingIncentivesPct', v)} suffix="% of SP" step={0.1} />
          <NumField label="Travelling & Events" value={assumptions.travelEventsPct} onChange={v => setAssumption('travelEventsPct', v)} suffix="% of SP" step={0.1} />
          <NumField label="Employee Cost" value={assumptions.employeeCostPct} onChange={v => setAssumption('employeeCostPct', v)} suffix="% of SP" step={0.1} />
          <NumField label="Office Overheads" value={assumptions.officeOverheadsPct} onChange={v => setAssumption('officeOverheadsPct', v)} suffix="% of SP" step={0.1} />
          <NumField label="PG / Finance Cost" value={assumptions.pgFinanceCostPct} onChange={v => setAssumption('pgFinanceCostPct', v)} suffix="% of SP" step={0.1} />
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {/* ── Product inputs ── */}
        <div style={{ flex: '1 1 340px', display: 'flex' }}>
          <Card style={{ flex: 1, gap: 14, padding: 16 }}>
            <SectionLabel>Product Inputs</SectionLabel>
            <ProductPicker productGroups={productGroups} onApply={applyProduct} />
            {productName && (
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.t1 }}>{productName}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <NumField label="COGS / Unit" value={cogsPerUnit} onChange={setCogsPerUnit} prefix="₹" step={0.01} />
              <NumField label="Vol. Weight" value={volWeightKg} onChange={setVolWeightKg} suffix="kg/unit" step={0.01} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <NumField label="Listing Price (MRP)" value={listingPrice} onChange={setListingPrice} prefix="₹" step={1} />
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: C.t2, marginBottom: 4 }}>GST %</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {GST_PRESETS.map(g => (
                    <button key={g} onClick={() => setGstPct(g)}
                      style={{
                        flex: 1, fontSize: 12, fontWeight: gstPct === g ? 700 : 500, padding: '6px 0', borderRadius: 7, border: 'none', outline: 'none',
                        background: gstPct === g ? C.acs : C.bg, color: gstPct === g ? C.t1 : C.t3, cursor: 'pointer',
                      }}>{g}%</button>
                  ))}
                </div>
              </div>
            </div>

            {mode === 'price' ? (
              <NumField label="EBITDA Target" value={ebitdaTargetPct} onChange={setEbitdaTargetPct} suffix="% of SP" step={0.5} />
            ) : (
              <NumField label="Selling Price (ex-GST, as named by buyer)" value={givenSellingPriceExGst} onChange={setGivenSellingPriceExGst} prefix="₹" step={1} />
            )}

            <NumField label="Qty" value={qty} onChange={setQty} min={1} step={1} />

            {/* ── Extra costs ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <SectionLabel>Additional Costs</SectionLabel>
                <button onClick={addExtraCost}
                  style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 7, border: `1px solid ${C.border2}`, background: '#fff', color: C.acd, cursor: 'pointer' }}>
                  + Add Cost
                </button>
              </div>
              {extraCosts.length === 0 && (
                <div style={{ fontSize: 11.5, color: C.t3 }}>No additional costs added — click "+ Add Cost" for anything not covered above (e.g. Insurance, Special Packaging).</div>
              )}
              {extraCosts.map(row => (
                <ExtraCostRow key={row.id} row={row} onChange={next => updateExtraCost(row.id, next)} onRemove={() => removeExtraCost(row.id)} />
              ))}
            </div>

            {!(parseFloat(cogsPerUnit) > 0) && (
              <div style={{ fontSize: 11.5, color: C.amber.tx, background: C.amber.bg, border: `1px solid ${C.amber.bd}`, borderRadius: 10, padding: '10px 14px' }}>
                Enter COGS/Unit (or pick a product above) to see the calculated {mode === 'price' ? 'Selling Price' : 'Profit'}.
              </div>
            )}
          </Card>
        </div>

        {/* ── Results ── */}
        <div style={{ flex: '1 1 460px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {result && !result.invalid && !result.needsPrice ? (
            <>
              <div style={{
                background: result.statusOk ? 'linear-gradient(135deg, #fff 55%, #f0fdf4 100%)' : 'linear-gradient(135deg, #fff 55%, #fef2f2 100%)',
                border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 22px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16,
              }}>
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {mode === 'price' ? 'Selling Price incl. GST' : 'Resulting EBITDA %'} {!result.statusOk && <span style={{ color: C.red.tx }}>— EXCEEDS MRP</span>}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: mode === 'profit' && result.ebitdaPct < 0 ? C.red.tx : C.t1, marginTop: 4 }}>
                    {mode === 'price' ? fmt(result.spInclGst) : (result.ebitdaPct != null ? `${result.ebitdaPct.toFixed(1)}%` : '—')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {mode === 'price' ? (
                    <div style={{ fontSize: 11, color: C.t3 }}>Rounded SP (ex-GST): {fmt(result.roundedSp)}</div>
                  ) : (
                    <div style={{ fontSize: 11, color: C.t3 }}>SP incl. GST: {fmt(result.spInclGst)} · EBITDA/unit: {fmt(result.ebitdaAmount)}</div>
                  )}
                  <div style={{ fontSize: 14, fontWeight: 700, color: result.statusOk ? C.green.tx : C.red.tx, marginTop: 2 }}>
                    {result.statusOk ? '✓ OK — within Listing Price' : '⚠ SP exceeds Listing Price'}
                  </div>
                </div>
              </div>

              {result.qty > 1 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <KpiTile label={`Total Order Value (×${result.qty})`} value={fmt(result.totalOrderValue)} />
                  <KpiTile label={`Total Profit (×${result.qty})`} value={fmt(result.totalProfit)} negative={result.totalProfit < 0} />
                </div>
              )}

              <Card style={{ gap: 12, padding: 16 }}>
                <SectionLabel>Cost Build-Up</SectionLabel>
                <CostBar label="COGS" value={parseFloat(cogsPerUnit) || 0} scaleMax={result.totalCostCm1} />
                <CostBar label="Inbound Logistics" value={result.inboundCost} scaleMax={result.totalCostCm1} />
                <CostBar label="Forward Logistics" value={result.forwardLogistics} scaleMax={result.totalCostCm1} />
                {result.activeExtraCosts.filter(r => r.unit === 'flat').map(r => (
                  <CostBar key={r.id} label={r.label || 'Additional cost'} value={parseFloat(r.value) || 0} scaleMax={result.totalCostCm1} />
                ))}
                <CostBar label="Total Cost (CM1 basis)" value={result.totalCostCm1} scaleMax={result.totalCostCm1} tone="total" />
                {result.activeExtraCosts.filter(r => r.unit === 'pctOfSp').length > 0 && (
                  <div style={{ fontSize: 11, color: C.t3 }}>
                    Plus {result.activeExtraCosts.filter(r => r.unit === 'pctOfSp').map(r => `${r.label || 'Additional cost'} (${r.value}% of SP)`).join(', ')} — applied as a % of Selling Price, not shown to scale above.
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  <KpiTile label="Gross Margin %" value={result.grossMarginPct != null ? `${(result.grossMarginPct * 100).toFixed(1)}%` : '—'} />
                  <KpiTile label="EBITDA / Unit" value={fmt(result.ebitdaAmount)} negative={result.ebitdaAmount < 0} sub={mode === 'price' ? `${ebitdaTargetPct}% target` : `${result.ebitdaPct?.toFixed(1)}% of SP`} />
                  <KpiTile
                    label="Discount on Listing"
                    value={result.discountOnListingPct != null ? `${(result.discountOnListingPct * 100).toFixed(1)}%` : '—'}
                    sub={result.hasListing ? undefined : 'Enter Listing Price above'}
                    negative={result.discountOnListingPct != null && result.discountOnListingPct < 0}
                  />
                  <KpiTile label="Selling Price (ex-GST)" value={fmt(result.sellingPriceExGst)} sub={mode === 'price' ? 'before rounding to ₹10' : 'as given'} />
                </div>
              </Card>
            </>
          ) : result?.invalid ? (
            <div style={{ background: C.red.bg, border: `1px solid ${C.red.bd}`, borderRadius: 12, padding: '16px 18px', fontSize: 13, fontWeight: 600, color: C.red.tx }}>
              Selling Incentives% + Travel&amp;Events% + Employee% + Office% + PG% + any % Additional Costs + EBITDA Target% add up to 100% or more — no Selling Price can cover all of these. Lower one of the rates above or the EBITDA Target.
            </div>
          ) : result?.needsPrice ? (
            <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 18px', fontSize: 13, color: C.t3, textAlign: 'center' }}>
              Enter the Selling Price a buyer has named (ex-GST) to see the resulting profit.
            </div>
          ) : (
            <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 18px', fontSize: 13, color: C.t3, textAlign: 'center' }}>
              Enter a product's COGS and Vol. Weight (or pick a real product) to calculate.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
