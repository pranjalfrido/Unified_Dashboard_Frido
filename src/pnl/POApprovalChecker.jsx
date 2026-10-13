import { useState, useMemo, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { C, fmt } from '../utils.js'
import { rateForWeightGm } from './pnlUtils.js'

// Checks whether a specific PO a sales person has brought in is actually worth approving — given
// its real Qty and Selling Price (both already fixed by the deal, not something being planned),
// what profit/profit% does it actually leave once COGS, weight-based logistics, fulfilment,
// software cost, and any one-time asset/tooling cost are all accounted for? Ported from the
// business's own reference PO costing sheet (shared 2026-10-10, see the ALLESCARE GLOBAL example:
// Qty 140 × SP ₹900, COGS ₹488/unit, 1kg weight slab, Software ₹10/unit, Asset Cost ₹10,500 one-
// time → Profit ₹33,040 / 26%).
//
// Distinct from B2B Costing Calculator's 'Solve for Profit' mode in two ways:
//   1. Logistic cost/unit + Fulfilment are looked up from the real weight-slab rate card
//      (snd-rates.json — same `forward`/`fulfilment` fields PnLPage.jsx's offSndBySku already
//      uses), not derived from a flat ₹/kg assumption rate — a PO's weight slab is a known,
//      fixed fact about the product, not a planning assumption to tune.
//   2. Adds Software Cost (₹/unit, flat) and a ONE-TIME Asset Cost (e.g. a reusable packaging
//      mold/plate) that does NOT scale with Qty — a cost incurred once regardless of how many
//      units this specific PO is for.
//
// Formula (per the reference sheet):
//   Total Sale       = Qty × Selling Price
//   Total COGS       = Qty × COGS/unit
//   Logistic+Fulfil   = weight-slab lookup (rate.forward + rate.fulfilment) × Qty
//   Software Cost    = Software ₹/unit × Qty
//   Asset Cost       = one-time, NOT multiplied by Qty
//   Profit           = Total Sale − Total COGS − Total Logistics − Software Cost − Asset Cost
//   Profit %         = Profit ÷ Total Sale
//   Approval         = Profit% >= the business's own minimum acceptable margin (user-set
//                      threshold, not hardcoded — different categories/deals may have different
//                      bars) — shown as a clear ✓ Approve / ⚠ Review flag, never silently hidden.
let sndRatesPromise = null
function loadSndRates() {
  if (!sndRatesPromise) sndRatesPromise = fetch('/snd-rates.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : []).catch(() => [])
  return sndRatesPromise
}
// Uses pnlUtils.js's rateForWeightGm (the SAME lookup the Price Simulator/Breakeven ROAS already
// use) rather than a second, locally-reimplemented version — that import rounds UP to the next
// real slab (a courier bills the slab a shipment falls INTO, not the slab below it), which is the
// correct convention here too: a PO's stated per-unit Weight Slab is a discrete, known fact about
// one unit, the same kind of input Price Simulator/Breakeven ROAS already handle this way. This is
// DELIBERATELY different from PnLPage.jsx's fulfilmentForWeight (bracket-DOWN), which only applies
// to Offline's continuous, already-aggregated total shipment weight — a different situation this
// PO calculator doesn't have. An earlier version of this file used the bracket-down convention
// here by mistake (confirmed wrong 2026-10-10: a 0.92kg entry was matching the 500g slab instead
// of being billed at the 1000g slab it actually falls into).
function rateForWeightKg(slabs, weightKg) {
  if (!slabs?.length || weightKg == null || isNaN(weightKg)) return null
  return rateForWeightGm(slabs, weightKg * 1000)
}
const DEFAULT_SOFTWARE_COST_PER_UNIT = 10
const DEFAULT_SELLING_INCENTIVE_PCT = 4
const DEFAULT_MIN_PROFIT_PCT = 15

// Pure, standalone version of the single-PO calculation — used by BOTH the interactive form
// (wrapped in useMemo below) and the bulk upload path (run once per uploaded row), so the two
// can never drift apart into two different formulas. Takes already-parsed numeric inputs (not
// state setters/strings) plus the shared sndRateSlabs rate card.
function computePOResult({ qty, sellingPrice, cogsPerUnit, weightKg, softwareCostPerUnit, sellingIncentivePct, assetCost, minProfitPct, logisticsMode, ftlPtlTotalCost }, sndRateSlabs) {
  const q = parseFloat(qty)
  const sp = parseFloat(sellingPrice)
  const cogs = parseFloat(cogsPerUnit)
  const weight = parseFloat(weightKg)
  const softwareCost = parseFloat(softwareCostPerUnit) || 0
  const incentivePct = (parseFloat(sellingIncentivePct) || 0) / 100
  const asset = parseFloat(assetCost) || 0
  if (!(q > 0) || !(sp > 0) || !(cogs >= 0)) return null

  // Fulfilment always comes from the weight-slab rate card — it's warehouse handling/packing
  // cost, unrelated to which truck mode carries the shipment, so it applies in BOTH logistics
  // modes and is never replaced by the FTL/PTL total.
  const rate = rateForWeightKg(sndRateSlabs, weight)
  const fulfilmentPerUnit = rate ? rate.fulfilment : null

  let logisticPerUnit = null, logisticsPerUnitTotal, hasLogisticsInput, ftlPtlTotal = null
  if (logisticsMode === 'ftlPtl') {
    ftlPtlTotal = parseFloat(ftlPtlTotalCost)
    const ftlPtlPerUnit = ftlPtlTotal > 0 ? ftlPtlTotal / q : 0
    hasLogisticsInput = ftlPtlTotal > 0
    logisticsPerUnitTotal = ftlPtlPerUnit + (fulfilmentPerUnit || 0)
  } else {
    logisticPerUnit = rate ? rate.forward : null
    logisticsPerUnitTotal = (logisticPerUnit || 0) + (fulfilmentPerUnit || 0)
    hasLogisticsInput = rate != null
  }

  const totalSale = q * sp
  const totalCogs = q * cogs
  const totalLogistics = logisticsPerUnitTotal * q
  const totalSoftware = softwareCost * q
  // Selling Incentive = % of Selling Price (per unit), same "% of SP" convention the B2B
  // Costing Calculator's Shared Assumptions use — scales with Qty like Software Cost, unlike
  // the one-time Asset Cost below.
  const totalSellingIncentive = sp * incentivePct * q
  const totalCost = totalCogs + totalLogistics + totalSoftware + totalSellingIncentive + asset
  const profit = totalSale - totalCost
  const profitPct = totalSale > 0 ? (profit / totalSale) * 100 : null
  const approved = profitPct != null && profitPct >= (parseFloat(minProfitPct) || 0)

  return {
    q, sp, cogs, weight, rate, logisticPerUnit, fulfilmentPerUnit, logisticsPerUnitTotal, ftlPtlTotal,
    totalSale, totalCogs, totalLogistics, totalSoftware, totalSellingIncentive, asset, totalCost, profit, profitPct, approved,
    hasWeightRate: hasLogisticsInput,
  }
}

// ── Bulk upload/download ─────────────────────────────────────────────────────
// Lets a sales/ops team check many POs at once instead of one at a time — download a template,
// fill a row per PO, upload it back. Same xlsx-based template/upload pattern already established
// elsewhere in this app (src/CogsPage.jsx's downloadTemplate/importTemplate — see that file for
// the original convention this mirrors: header row + example rows + an Instructions sheet for the
// template; FileReader + XLSX.read + sheet_to_json(header:1) + normalized-header column matching
// for the import). Each column maps 1:1 to one of computePOResult's named inputs so a bulk row
// runs through the EXACT SAME formula as the single-PO form above, never a second implementation.
const BULK_FIELDS = [
  { key: 'customerName', label: 'Customer / Party', req: false, ex: 'Allescare Global Pvt Ltd' },
  { key: 'productName', label: 'Product Name', req: false, ex: 'Travel Neck Pillow' },
  { key: 'qty', label: 'Qty', req: true, ex: '140', type: 'number' },
  { key: 'sellingPrice', label: 'Selling Price', req: true, ex: '900', type: 'number' },
  { key: 'cogsPerUnit', label: 'COGS Per Unit', req: true, ex: '488', type: 'number' },
  { key: 'weightKg', label: 'Weight Slab (kg)', req: true, ex: '1', type: 'number' },
  { key: 'logisticsMode', label: 'Logistics Mode (Courier or FTL/PTL)', req: false, ex: 'Courier' },
  { key: 'ftlPtlTotalCost', label: 'Truck Cost (if FTL/PTL)', req: false, ex: '', type: 'number' },
  { key: 'softwareCostPerUnit', label: 'Software Cost Per Unit', req: false, ex: String(DEFAULT_SOFTWARE_COST_PER_UNIT), type: 'number' },
  { key: 'sellingIncentivePct', label: 'Selling Incentive % of SP', req: false, ex: String(DEFAULT_SELLING_INCENTIVE_PCT), type: 'number' },
  { key: 'assetCost', label: 'Asset Cost (one-time)', req: false, ex: '0', type: 'number' },
  { key: 'minProfitPct', label: 'Minimum Acceptable Profit %', req: false, ex: String(DEFAULT_MIN_PROFIT_PCT), type: 'number' },
]

function downloadBulkPOTemplate() {
  const headerRow = BULK_FIELDS.map(f => f.req ? `${f.label} *` : f.label)
  const ex1 = BULK_FIELDS.map(f => f.ex ?? '')
  const ws = XLSX.utils.aoa_to_sheet([headerRow, ex1])
  ws['!cols'] = BULK_FIELDS.map(f => ({ wch: Math.max(16, f.label.length + 4) }))
  BULK_FIELDS.forEach((f, c) => {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (ws[addr]) ws[addr].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      fill: { patternType: 'solid', fgColor: { rgb: f.req ? '9E2B25' : '1F5C4A' } },
      alignment: { horizontal: 'left' },
    }
  })
  const instrData = [
    ['Column', 'Required?', 'Description'],
    ['Customer / Party', 'No', 'Buyer name, for your own reference only — not used in any calculation'],
    ['Product Name', 'No', 'For your own reference only — does not auto-fill COGS/Weight like the on-screen Product picker does'],
    ['Qty', 'YES', 'Number of units in this PO'],
    ['Selling Price', 'YES', 'Per-unit selling price as quoted in the PO, ex-GST'],
    ['COGS Per Unit', 'YES', 'Cost of goods sold per unit'],
    ['Weight Slab (kg)', 'YES', 'Per-unit weight in kg — used to look up Forward/Fulfilment cost from the rate card. Rounded UP to the nearest real slab.'],
    ['Logistics Mode (Courier or FTL/PTL)', 'No', 'Type "Courier" (default if left blank) or "FTL/PTL". Fulfilment always applies either way.'],
    ['Truck Cost (if FTL/PTL)', 'No', 'Only used when Logistics Mode = FTL/PTL — one flat total cost for the whole shipment, divided evenly across Qty'],
    ['Software Cost Per Unit', 'No', `Defaults to ₹${DEFAULT_SOFTWARE_COST_PER_UNIT}/unit if left blank`],
    ['Selling Incentive % of SP', 'No', `Defaults to ${DEFAULT_SELLING_INCENTIVE_PCT}% if left blank`],
    ['Asset Cost (one-time)', 'No', 'A one-time cost (e.g. packaging mold/plate) NOT multiplied by Qty. Defaults to 0 if left blank.'],
    ['Minimum Acceptable Profit %', 'No', `Defaults to ${DEFAULT_MIN_PROFIT_PCT}% if left blank — the bar each PO's Profit% is checked against`],
    [''],
    ['Notes'],
    ['1. One row = one PO.'],
    ['2. Delete the sample row before adding your data.'],
    ['3. Columns marked * are required — rows missing them will be skipped and flagged after upload.'],
  ]
  const notes = XLSX.utils.aoa_to_sheet(instrData)
  notes['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 90 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'PO Data')
  XLSX.utils.book_append_sheet(wb, notes, 'Instructions')
  XLSX.writeFile(wb, 'po_approval_bulk_template.xlsx')
}

// Parses an uploaded workbook into { good: [...rows], bad: [...{line, missing}] } — does NOT run
// computePOResult itself (the caller does that per-row, same formula as the single-PO form).
function parseBulkPOFile(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const wsName = wb.SheetNames.find(n => /po|data/i.test(n)) ?? wb.SheetNames[0]
  const ws = wb.Sheets[wsName]
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })
  if (!aoa.length) throw new Error('Empty sheet')

  const normHead = c => String(c ?? '').trim().toLowerCase().replace(/\s*\*\s*$/, '').replace(/[\s_]+/g, ' ').trim()
  const hIdx = aoa.findIndex(row => {
    const cells = row.map(normHead)
    return ['qty', 'selling price'].every(w => cells.includes(w))
  })
  if (hIdx === -1) throw new Error("Couldn't find header row with 'Qty' and 'Selling Price' columns. Use the downloaded template.")

  const head = aoa[hIdx].map(normHead)
  const ci = {}
  for (const f of BULK_FIELDS) ci[f.key] = head.indexOf(normHead(f.label))

  const body = aoa.slice(hIdx + 1)
  const good = [], bad = []
  body.forEach((row, i) => {
    const r = {}
    for (const f of BULK_FIELDS) {
      const idx = ci[f.key]
      let v = idx === -1 ? '' : row[idx]
      v = v == null ? '' : String(v).trim()
      r[f.key] = v
    }
    const isEmpty = !r.qty && !r.sellingPrice && !r.cogsPerUnit
    if (isEmpty) return

    const missing = BULK_FIELDS.filter(f => f.req && !r[f.key]).map(f => f.label)
    if (missing.length) { bad.push({ line: hIdx + 2 + i, missing }); return }

    // Normalize Logistics Mode free text ("Courier"/"FTL"/"PTL"/"FTL/PTL"/blank) to the exact
    // internal mode id computePOResult expects.
    r.logisticsMode = /ftl|ptl/i.test(r.logisticsMode) ? 'ftlPtl' : 'courier'
    good.push(r)
  })

  return { good, bad, headerLine: hIdx + 1 }
}

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

// Cost build-up line, drawn as a scaled bar (same visual convention as B2B Costing Calculator's
// CostBar / Breakeven ROAS's WaterfallBar) so Total Sale/COGS/Logistics/Software/Asset read as
// relative magnitudes at a glance, instead of a plain column of numbers.
// pctOfBase (optional): % this line represents of Total Sale (scaleMax) — shown next to the ₹
// value so a reader can judge "is 20% logistics normal?" without doing the division themselves.
// Omitted for the "sale" tone row itself (always 100% of itself, not informative to show).
function CostBar({ label, sub, value, scaleMax, tone, negative }) {
  const barPct = scaleMax > 0 ? Math.max(value !== 0 ? 3 : 0, Math.min(100, (Math.abs(value) / scaleMax) * 100)) : 0
  const pctOfBase = scaleMax > 0 && tone !== 'sale' ? (Math.abs(value) / scaleMax) * 100 : null
  const color = tone === 'total' ? (negative ? C.red.tx : C.green.tx) : tone === 'sale' ? C.acc : C.t3
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: tone ? 13.5 : 12.5, fontWeight: tone ? 800 : 600, color: tone ? C.t1 : C.t2 }}>
        <span>{label}</span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          {pctOfBase != null && (
            <span style={{ fontSize: 11, fontWeight: 700, color: negative ? C.red.tx : C.t3, fontVariantNumeric: 'tabular-nums' }}>
              {pctOfBase.toFixed(1)}%
            </span>
          )}
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: tone ? 800 : 700, color: negative ? C.red.tx : C.t1 }}>
            {value < 0 ? '−' : ''}{fmt(Math.abs(value))}
          </span>
        </span>
      </div>
      {sub && <div style={{ fontSize: 10.5, color: C.t3 }}>{sub}</div>}
      <div style={{ position: 'relative', height: 10, background: C.bg, borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barPct}%`, background: color, borderRadius: 5, transition: 'width 120ms ease-out' }} />
      </div>
    </div>
  )
}

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

const BULK_RESULT_COLUMNS = [
  { key: 'customer', label: 'Customer', align: 'left' },
  { key: 'product', label: 'Product', align: 'left' },
  { key: 'qty', label: 'Qty' },
  { key: 'sp', label: 'SP' },
  { key: 'cogsUnit', label: 'COGS/Unit' },
  { key: 'logistics', label: 'Logistics' },
  { key: 'software', label: 'Software' },
  { key: 'incentive', label: 'Incentive' },
  { key: 'asset', label: 'Asset' },
  { key: 'totalSale', label: 'Total Sale' },
  { key: 'profit', label: 'Profit' },
  { key: 'profitUnit', label: 'Profit/Unit' },
  { key: 'profitPct', label: 'Profit %' },
  { key: 'minPct', label: 'Min %' },
  { key: 'mode', label: 'Mode' },
  { key: 'decision', label: 'Decision' },
]

// Results table for a bulk-uploaded batch of POs — each row ran through computePOResult
// independently (see handleBulkUpload above), so this is purely a display/export surface, no
// further calculation happens here. Each row's OWN uploaded Minimum Acceptable Profit % is used
// for its decision (res.approved already reflects that — see computePOResult), never a single
// global minProfitPct, since different POs in the same batch can carry different bars (the
// dummy sample file deliberately mixes 15/18/20/25% to make this visible).
function BulkResultsCard({ rows, skipped, onExport, onClear }) {
  const approvedCount = rows.filter(r => r._result?.approved).length
  const reviewCount = rows.filter(r => r._result && !r._result.approved).length
  const incompleteCount = rows.filter(r => !r._result).length

  return (
    <Card style={{ gap: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <SectionLabel>Bulk Results</SectionLabel>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>
            {rows.length} PO{rows.length === 1 ? '' : 's'} checked — <span style={{ color: C.green.tx, fontWeight: 700 }}>{approvedCount} approve</span>, <span style={{ color: C.red.tx, fontWeight: 700 }}>{reviewCount} review</span>
            {incompleteCount > 0 && <span>, {incompleteCount} incomplete</span>}
            {skipped.length > 0 && <span> · {skipped.length} row{skipped.length === 1 ? '' : 's'} skipped (missing required fields)</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onExport}
            style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border2}`, background: '#fff', color: C.acd, cursor: 'pointer' }}>
            ⬇ Export Results
          </button>
          <button onClick={onClear}
            style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border2}`, background: '#fff', color: C.t3, cursor: 'pointer' }}>
            Clear
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              {BULK_RESULT_COLUMNS.map(c => (
                <th key={c.key} style={{ textAlign: c.align || 'right', padding: '6px 8px', fontWeight: 700, color: C.t3, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap', minWidth: c.key === 'customer' ? 160 : c.key === 'product' ? 170 : undefined }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const res = r._result
              return (
                <tr key={r._line} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '7px 8px', color: C.t1, fontWeight: 600, minWidth: 160, maxWidth: 220 }}>{r.customerName || '—'}</td>
                  <td style={{ padding: '7px 8px', color: C.t2, minWidth: 170, maxWidth: 240 }}>{r.productName || '—'}</td>
                  {res ? (
                    <>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{res.q}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(res.sp)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(res.cogs)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.t3 }}>−{fmt(res.totalLogistics)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.t3 }}>−{fmt(res.totalSoftware)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.t3 }}>−{fmt(res.totalSellingIncentive)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.t3 }}>{res.asset > 0 ? `−${fmt(res.asset)}` : '—'}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(res.totalSale)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: res.profit < 0 ? C.red.tx : C.t1 }}>{fmt(res.profit)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(res.profit / res.q)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: res.profitPct < 0 ? C.red.tx : C.t1 }}>{res.profitPct.toFixed(1)}%</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.t3 }}>{(parseFloat(r.minProfitPct) || DEFAULT_MIN_PROFIT_PCT).toFixed(0)}%</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: C.t3, fontSize: 11 }}>{r.logisticsMode === 'ftlPtl' ? 'FTL/PTL' : 'Courier'}{res.weight != null && !isNaN(res.weight) ? ` · ${res.weight}kg` : ''}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: res.approved ? C.green.bg : C.red.bg, color: res.approved ? C.green.tx : C.red.tx, whiteSpace: 'nowrap' }}>
                          {res.approved ? '✓ APPROVE' : '⚠ REVIEW'}
                        </span>
                      </td>
                    </>
                  ) : (
                    <td colSpan={BULK_RESULT_COLUMNS.length - 2} style={{ padding: '7px 8px', textAlign: 'right', color: C.amber.tx, fontStyle: 'italic' }}>Incomplete inputs — check Qty/SP/COGS</td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10.5, color: C.t3 }}>Decision checked against each row's own Minimum Acceptable Profit % (the "Min %" column) — different rows in the same file can carry different bars.</div>
    </Card>
  )
}

export default function POApprovalChecker({ productGroups = [] }) {
  const [sndRateSlabs, setSndRateSlabs] = useState(null)
  useEffect(() => { loadSndRates().then(setSndRateSlabs) }, [])

  const [customerName, setCustomerName] = useState('')
  const [productName, setProductName] = useState('')
  const [qty, setQty] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [cogsPerUnit, setCogsPerUnit] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [softwareCostPerUnit, setSoftwareCostPerUnit] = useState(DEFAULT_SOFTWARE_COST_PER_UNIT)
  const [sellingIncentivePct, setSellingIncentivePct] = useState(DEFAULT_SELLING_INCENTIVE_PCT)
  const [assetCost, setAssetCost] = useState('')
  const [minProfitPct, setMinProfitPct] = useState(DEFAULT_MIN_PROFIT_PCT)
  // Logistics mode — 'courier' (default): forward + fulfilment both looked up from the weight-slab
  // rate card, same as before. 'ftlPtl': a full/partial truck load booking replaces only the
  // FORWARD/freight leg — fulfilment (warehouse handling/packing per unit) is a separate real cost
  // that still applies regardless of which truck mode moves the shipment, so it stays sourced from
  // the weight-slab rate card even in FTL/PTL mode and is added on top of the truck cost, never
  // dropped. The FTL/PTL total (one flat cost for the whole shipment, e.g. a single truck hire) is
  // divided evenly across Qty to get an effective per-unit freight cost.
  const [logisticsMode, setLogisticsMode] = useState('courier') // 'courier' | 'ftlPtl'
  const [ftlPtlTotalCost, setFtlPtlTotalCost] = useState('')

  // Bulk upload: an uploaded file's rows get run through computePOResult (the SAME formula the
  // single-PO form above uses) one by one, then shown as a results table instead of one-at-a-time
  // in the form — each uploaded row uses ITS OWN values and is independent of whatever is
  // currently typed into the single-PO form on the left.
  const bulkFileInput = useRef(null)
  const [bulkRows, setBulkRows] = useState(null) // null until a file has been uploaded
  const [bulkSkipped, setBulkSkipped] = useState([])
  const [bulkError, setBulkError] = useState(null)

  const handleBulkUpload = e => {
    const file = e.target.files?.[0]
    if (!file) return
    setBulkError(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const { good, bad } = parseBulkPOFile(reader.result)
        if (bad.length) {
          const preview = bad.slice(0, 8).map(b => `• row ${b.line}: missing ${b.missing.join(', ')}`).join('\n')
          if (!confirm(`${bad.length} row(s) will be skipped (missing required fields):\n\n${preview}\n\nProcess the other ${good.length} row(s)?`)) return
        }
        if (!good.length) { alert('No valid PO rows found in this file.'); return }
        const computed = good.map((row, i) => ({ ...row, _line: i, _result: computePOResult(row, sndRateSlabs) }))
        setBulkRows(computed)
        setBulkSkipped(bad)
      } catch (err) {
        setBulkError(err.message ?? String(err))
      } finally {
        if (bulkFileInput.current) bulkFileInput.current.value = ''
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const exportBulkResults = () => {
    if (!bulkRows?.length) return
    const rows = bulkRows.map(r => {
      const res = r._result
      return {
        'Customer / Party': r.customerName || '',
        'Product Name': r.productName || '',
        Qty: res?.q ?? '',
        'Selling Price': res?.sp ?? '',
        'COGS Per Unit': res?.cogs ?? '',
        'Logistics & Fulfilment': res?.totalLogistics != null ? Math.round(res.totalLogistics) : '',
        'Software Cost': res?.totalSoftware != null ? Math.round(res.totalSoftware) : '',
        'Selling Incentive': res?.totalSellingIncentive != null ? Math.round(res.totalSellingIncentive) : '',
        'Asset Cost': res?.asset ?? '',
        'Total Sale': res?.totalSale != null ? Math.round(res.totalSale) : '',
        'Total Cost': res?.totalCost != null ? Math.round(res.totalCost) : '',
        'Profit': res?.profit != null ? Math.round(res.profit) : '',
        'Profit / Unit': res?.profit != null && res.q ? Math.round(res.profit / res.q) : '',
        'Profit %': res?.profitPct != null ? res.profitPct.toFixed(1) : '',
        'Minimum Profit %': parseFloat(r.minProfitPct) || DEFAULT_MIN_PROFIT_PCT,
        'Logistics Mode': r.logisticsMode === 'ftlPtl' ? 'FTL/PTL' : 'Courier',
        'Weight Slab (kg)': res?.weight ?? '',
        'Decision': res == null ? 'INCOMPLETE' : res.approved ? 'APPROVE' : 'REVIEW',
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(14, k.length + 4) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'PO Approval Results')
    XLSX.writeFile(wb, 'po_approval_bulk_results.xlsx')
  }

  const applyProduct = p => {
    setProductName(p.name)
    setCogsPerUnit(Math.round(p.cogsPerUnit * 100) / 100)
    setWeightKg(p.weightKg != null ? Math.round(p.weightKg * 100) / 100 : '')
  }

  const result = useMemo(() => computePOResult(
    { qty, sellingPrice, cogsPerUnit, weightKg, softwareCostPerUnit, sellingIncentivePct, assetCost, minProfitPct, logisticsMode, ftlPtlTotalCost },
    sndRateSlabs
  ), [qty, sellingPrice, cogsPerUnit, weightKg, softwareCostPerUnit, sellingIncentivePct, assetCost, sndRateSlabs, minProfitPct, logisticsMode, ftlPtlTotalCost])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <style>{`
        input.pnl-no-spinner::-webkit-outer-spin-button,
        input.pnl-no-spinner::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input.pnl-no-spinner { -moz-appearance: textfield; }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10, maxWidth: 1220 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.t1, letterSpacing: -0.2 }}>PO Approval Checker</div>
          <div style={{ fontSize: 12.5, color: C.t3, marginTop: 2 }}>
            Enter a PO's Qty, Selling Price, and costs to check whether its profit% clears your minimum bar before approving.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={downloadBulkPOTemplate}
            style={{ fontSize: 11.5, fontWeight: 700, padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border2}`, background: '#fff', color: C.t2, cursor: 'pointer' }}>
            ⬇ Download Bulk Template
          </button>
          <button onClick={() => bulkFileInput.current?.click()}
            style={{ fontSize: 11.5, fontWeight: 700, padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border2}`, background: '#fff', color: C.t2, cursor: 'pointer' }}>
            ⬆ Upload Bulk POs
          </button>
          <input ref={bulkFileInput} type="file" accept=".xlsx,.xls,.csv" onChange={handleBulkUpload} style={{ display: 'none' }} />
        </div>
      </div>

      {bulkError && (
        <div style={{ fontSize: 12.5, color: C.red.tx, background: C.red.bg, border: `1px solid ${C.red.bd}`, borderRadius: 10, padding: '10px 14px' }}>
          Upload failed: {bulkError}
        </div>
      )}

      {bulkRows && (
        <BulkResultsCard rows={bulkRows} skipped={bulkSkipped} onExport={exportBulkResults} onClear={() => { setBulkRows(null); setBulkSkipped([]) }} />
      )}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'stretch', maxWidth: 1220 }}>
        {/* ── PO inputs ── */}
        <div style={{ flex: '1 1 340px', display: 'flex' }}>
          <Card style={{ flex: 1, gap: 14, padding: 16 }}>
            <SectionLabel>PO Details</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t2 }}>Customer / Party</span>
                <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. Allescare Global Pvt Ltd"
                  style={{ boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, fontSize: 13, fontWeight: 600, color: C.t1, background: '#fff', outline: 'none' }} />
              </label>
              <NumField label="Qty" value={qty} onChange={setQty} min={1} step={1} />
            </div>

            <ProductPicker productGroups={productGroups} onApply={applyProduct} />
            {productName && <div style={{ fontSize: 12.5, fontWeight: 700, color: C.t1 }}>{productName}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <NumField label="Selling Price (as per PO)" value={sellingPrice} onChange={setSellingPrice} prefix="₹" step={1} />
              <NumField label="COGS / Unit" value={cogsPerUnit} onChange={setCogsPerUnit} prefix="₹" step={0.01} />
            </div>
            <NumField label="Weight Slab" value={weightKg} onChange={setWeightKg} suffix="kg/unit" step={0.1} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t2 }}>Freight</span>
                <div style={{ display: 'flex', gap: 4, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 3 }}>
                  <button onClick={() => setLogisticsMode('courier')}
                    style={{ fontSize: 11, fontWeight: logisticsMode === 'courier' ? 700 : 500, padding: '4px 10px', borderRadius: 6, border: 'none', outline: 'none', background: logisticsMode === 'courier' ? C.acs : 'transparent', color: C.t1, cursor: 'pointer' }}>
                    Per-Unit Courier
                  </button>
                  <button onClick={() => setLogisticsMode('ftlPtl')}
                    style={{ fontSize: 11, fontWeight: logisticsMode === 'ftlPtl' ? 700 : 500, padding: '4px 10px', borderRadius: 6, border: 'none', outline: 'none', background: logisticsMode === 'ftlPtl' ? C.acs : 'transparent', color: C.t1, cursor: 'pointer' }}>
                    FTL / PTL
                  </button>
                </div>
              </div>
              {logisticsMode === 'ftlPtl' ? (
                <>
                  <NumField label="Truck Cost (whole shipment, one-time)" value={ftlPtlTotalCost} onChange={setFtlPtlTotalCost} prefix="₹" step={100} />
                  <div style={{ fontSize: 11, color: C.t3 }}>Divided evenly across Qty for an effective per-unit freight cost. Fulfilment is still added separately from the weight-slab rate card above.</div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: C.t3 }}>Forward freight + Fulfilment looked up automatically from Weight Slab above.</div>
              )}
            </div>

            <NumField label="Software Cost" value={softwareCostPerUnit} onChange={setSoftwareCostPerUnit} prefix="₹" suffix="/ unit" step={0.5} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <NumField label="Selling Incentive" value={sellingIncentivePct} onChange={setSellingIncentivePct} suffix="% of SP" step={0.5} />
              <NumField label="Asset Cost (one-time)" value={assetCost} onChange={setAssetCost} prefix="₹" step={1} />
            </div>
            <NumField label="Minimum Acceptable Profit %" value={minProfitPct} onChange={setMinProfitPct} suffix="%" step={0.5} />

            {!(parseFloat(qty) > 0) || !(parseFloat(sellingPrice) > 0) ? (
              <div style={{ fontSize: 11.5, color: C.amber.tx, background: C.amber.bg, border: `1px solid ${C.amber.bd}`, borderRadius: 10, padding: '10px 14px' }}>
                Enter Qty, Selling Price, and COGS/Unit to check this PO.
              </div>
            ) : null}
          </Card>
        </div>

        {/* ── Result ── */}
        <div style={{ flex: '1 1 460px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {result ? (
            <>
              <div style={{
                background: result.approved ? 'linear-gradient(135deg, #fff 55%, #f0fdf4 100%)' : 'linear-gradient(135deg, #fff 55%, #fef2f2 100%)',
                border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 22px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16,
              }}>
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Profit %</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: result.profitPct < 0 ? C.red.tx : C.t1, marginTop: 4 }}>
                    {result.profitPct != null ? `${result.profitPct.toFixed(1)}%` : '—'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: C.t3 }}>Profit: {fmt(result.profit)} on Total Sale {fmt(result.totalSale)}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: result.approved ? C.green.tx : C.red.tx, marginTop: 2 }}>
                    {result.approved ? `✓ APPROVE — clears ${minProfitPct}% minimum` : `⚠ REVIEW — below ${minProfitPct}% minimum`}
                  </div>
                </div>
              </div>

              <Card style={{ gap: 14, padding: 18 }}>
                <div>
                  <SectionLabel>PO Breakdown</SectionLabel>
                  {(customerName || productName) && (
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: C.t1, marginTop: 4 }}>
                      {customerName}{customerName && productName ? ' — ' : ''}{productName}
                    </div>
                  )}
                </div>

                <CostBar label="Total Sale" sub={`${result.q} units × ${fmt(result.sp)}`} value={result.totalSale} scaleMax={result.totalSale} tone="sale" />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 2, borderLeft: `2px solid ${C.border}`, marginLeft: 2 }}>
                  <CostBar label="COGS" sub={`${result.q} units × ${fmt(result.cogs)}`} value={-result.totalCogs} scaleMax={result.totalSale} />
                  <CostBar
                    label="Logistics & Fulfilment"
                    sub={
                      !result.hasWeightRate ? 'No weight slab matched / no Truck Cost entered — see inputs above'
                      : logisticsMode === 'ftlPtl'
                        ? `${fmt(result.ftlPtlTotal)} truck ÷ ${result.q} + ${fmt(result.fulfilmentPerUnit)} fulfilment/unit`
                        : `${fmt(result.logisticPerUnit)} forward + ${fmt(result.fulfilmentPerUnit)} fulfilment per unit × ${result.q}`
                    }
                    value={-result.totalLogistics} scaleMax={result.totalSale}
                  />
                  <CostBar label="Software Cost" sub={`${result.q} units × ${fmt(softwareCostPerUnit)}`} value={-result.totalSoftware} scaleMax={result.totalSale} />
                  <CostBar label="Selling Incentive" sub={`${sellingIncentivePct}% of ${fmt(result.sp)} × ${result.q}`} value={-result.totalSellingIncentive} scaleMax={result.totalSale} />
                  {result.asset > 0 && <CostBar label="Asset Cost" sub="one-time, not scaled by Qty" value={-result.asset} scaleMax={result.totalSale} />}
                </div>

                <CostBar label="Profit" value={result.profit} scaleMax={result.totalSale} tone="total" negative={result.profit < 0} />

                {!result.hasWeightRate && (
                  <div style={{ fontSize: 11.5, color: C.amber.tx, background: C.amber.bg, border: `1px solid ${C.amber.bd}`, borderRadius: 10, padding: '10px 12px' }}>
                    {logisticsMode === 'ftlPtl'
                      ? 'Enter the Truck Cost above to include freight — fulfilment still needs a matching Weight Slab too. Profit shown above excludes logistics until both are entered.'
                      : 'No weight slab matched — enter Weight (kg/unit) above to include real logistics/fulfilment cost. Profit shown above excludes logistics until then.'}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                  <KpiTile label="Profit / Unit" value={fmt(result.profit / result.q)} negative={result.profit < 0} />
                  <KpiTile label="Logistics / Unit" value={result.hasWeightRate ? fmt(result.logisticsPerUnitTotal) : '—'} />
                  <KpiTile label="Total Cost" value={fmt(result.totalCost)} />
                  <KpiTile label="Total Sale" value={fmt(result.totalSale)} />
                </div>
              </Card>
            </>
          ) : (
            <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 18px', fontSize: 13, color: C.t3, textAlign: 'center' }}>
              Enter the PO's Qty, Selling Price, and COGS/Unit to check whether it clears your minimum profit bar.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
