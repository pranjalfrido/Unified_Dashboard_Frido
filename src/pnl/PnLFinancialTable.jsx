import { useState, useEffect, useRef, Fragment } from 'react'
import { C, fmtN, exportCSV } from '../utils.js'
import { fmtSigned as fmt } from './pnlUtils.js'
import { useSortableTable, useReorderableColumns } from '../components.jsx'
import InfoPopover from '../responsive/InfoPopover.jsx'
import FlagChips from '../responsive/FlagChips.jsx'
import { PNL_OTHERS_INFO, PNL_WATCHLIST_EXCLUDE } from '../config/metricTargets.js'
import { getCogsForRange } from './pnlUtils.js'
import { buildFinancialRows, MIN_REV_FOR_RATIOS } from './financialRows.js'

// Financial View table — Category → Product (→ SKU) grain, same visual language as
// FlatCategoryProductMatrix (sticky C.bg header, sortable columns, hover-highlight rows,
// bold sticky Total row, expandable SKU rows, CSV export).
//
// COGS/GM are real, sourced from public.product_cogs_monthly (Supabase) via cogsMonthlyMap,
// passed down from PnLPage.jsx — a per-(sku, month) cost table covering Feb 2022-present (see
// scripts/sync-cogs-monthly-rest.mjs), replacing the old flat public/cogs-data.json. COGS value
// = per-unit cost × net units sold (gross units minus cancelled/RTO/returned/CIR units). netUnits
// comes from mapRow()/netRevenueOf(), which is fed by the resolved-rate engine
// (api/_returnComponents.js) for EVERY channel (D2C, EBO, Amazon SC/VC, Flipkart, Myntra, CRED,
// Firstcry) — each return component (RTO/CIR/Cancel/Exchange/Return) is resolved per SKU/date
// against either the live same-day rate or, for immature recent dates, a rolling 30-day rate, and
// netUnits = units − sum of resolved return-component units. This is no longer Amazon-SC-only.
// COGS % is COGS ÷ Net Revenue (netCovered), unaffected by which unit count feeds the COGS value
// itself. SnD/CM1 coverage by channel (confirmed 2026-10-22):
//   - Shopify (D2C) and EBO: resolved-rate SnD — RTO/CIR/Exchange/Delivered logistics legs,
//     Fulfilment, Payment Gateway and Software Fee all keyed off each SKU's resolved units/rates
//     (PnLPage.jsx's shSkuCosts/eboSkuCosts) against public/snd-rates.json. An ESTIMATE from a
//     weight-slab rate card, not real settlement data, but immature-day-safe since it derives from
//     the same resolved units Net Revenue/COGS already use.
//   - Flipkart: a verified flat all-in % rate card (see scripts/generate-flipkart-snd-ratecard.mjs)
//     applied to resolved Net Revenue — also immature-day-safe, different mechanism (no per-outcome
//     split) by design, not a gap.
//   - Amazon Seller Central: REAL settlement-report data (see amzSCSettlement in api/bq.js and
//     PNL_TAB_ROADMAP.md for the verified charge-column mapping) — the only channel whose SnD is
//     actual incurred cost rather than a rate-card estimate.
//   - Myntra, CRED, Firstcry, Amazon Vendor Central, Blinkit/Instamart/Zepto, Offline Sales:
//     no per-SKU SnD cost data wired into this table — sndBySku has no entries for these, so
//     cm1Covered is false for every row on those channels' Financial Views.
// CM2 (CM1 − Marketing Spend) is wired at SubCategory grain via activeAdSpendMap/adSpendMap
// (keyed by SubCategory name), not product/SKU-level attribution — still a coarser grain than
// COGS/SnD, which are per-SKU.
// Missing-cost columns render a muted "—" placeholder rather than a fabricated number. A SKU
// with no COGS/SnD entry also renders "—" for its own row, and a Product/Category row shows
// COGS/GM/SnD/CM1 only for the portion of its revenue covered by SKUs that DO have that cost
// — never silently treating a missing cost as zero.
//
// subCatData: {category: {subCategory: {rev, excRev, units, cancelRev, rtoRev, cirRev, exchRev, returnRev}}}
// skuData:    {category: {subCategory: {sku: {...same fields}}}}
// adSpendMap: optional {subCategory: spend} — real marketing spend, folded in as Spend % of Net Revenue.
// sndBySku: {sku: totalSndCost} — real SnD cost per SKU. Shopify/D2C: summed 4-component cost
// breakdown (logistics/fulfilment/paymentGw/softwareFee, computed in PnLPage.jsx's shSndBySku from
// public/snd-rates.json) collapsed to one number per SKU — no consumer here needs the individual
// components. Amazon SC/VC/All: settlement-report / margin-slab based (see amzSC/amzVCMatrix in
// api/bq.js). Other channels don't have per-SKU cost data wired yet.
// showMarketing: whether to render the Mktg Spend/Spend %/CM2 % columns at all — Amazon's
// Seller Central and Vendor Central views stop at CM1 % (marketing spend is only mapped on the
// combined "All" SC+VC view, since that's the grain the Ads tab's Amazon spend reconciles to).
// includeUnmatched/mobilityNetBySubCat: D2C-only — see PnLPage.jsx for how each is computed.
// spendAllocated: spend is an allocation, not real ad spend (EBO: 1.5% of Net) — the Spend column is
// labelled as such and RoAS is hidden, since it would only restate the allocation rate.
// Margin watchlist (useMarginRules, feature/responsive-pnl): margin = its result ({ flagsByKey, derived,
// ruleName }) → Flags + BE ROAS columns and the red cells (red only where a product breaks this
// channel's rule; the old decorative green/red is gone). flagFilter = { id, name, keys } shows only
// those products (chip "Flag: … ✕" → onClearFlag). onSimulate(key) adds a ↗ on row hover/focus.
// highlightKey scrolls to and highlights a product (margin matrix click).
// Default column order = the P&L calculation order (PNL_REVIEW_FIXES.md §1f): Units, ASP, Gross,
// Ex GST, Net, Returns, COGS, GM, SnD, CM1, Spend, ROAS, BE ROAS, CM2, Flags (after Product / Category).
const COL_ORDER = ['units', 'asp', 'gross', 'excRev', 'net', 'returnPct', 'cogsPct', 'gmPct', 'sndPct', 'cm1Pct', 'spendPct', 'roas', 'beRoas', 'cm2Pct', 'flags']

export default function PnLFinancialTable({ subCatData, skuData, adSpendMap = {}, sndBySku, title = 'Financial View', showMarketing = true, includeUnmatched = false, mobilityNetBySubCat = {}, netScale = 1, cogsMonthlyMap, startDate, endDate, hasReturnBreakdown = true, spendAllocated = false, headerInfo = null, margin = null, flagFilter = null, onClearFlag, onSimulate, simulateLabel = 'Simulate', highlightKey = null }) {
  const [expandedSku, setExpandedSku] = useState({})
  const [search, setSearch] = useState('')
  const toggleSku = key => setExpandedSku(prev => ({ ...prev, [key]: !prev[key] }))
  const table = useSortableTable('gross')
  const { Th } = table

  const q = search.trim().toLowerCase()

  // Rows (Net Revenue, COGS, SnD, CM1, CM2 per Category × Product): src/pnl/financialRows.js, shared
  // with the margin watchlist and the mobile list so they always match this table.
  const { allRows, mapRow, pctOf } = buildFinancialRows({ subCatData, skuData, adSpendMap, sndBySku, mobilityNetBySubCat, netScale, cogsMonthlyMap, startDate, endDate })
  const searchedRows = q ? allRows.filter(r => r.cat.toLowerCase().includes(q) || r.sc.toLowerCase().includes(q) || Object.keys(skuData?.[r.cat]?.[r.sc] || {}).some(sku => sku.toLowerCase().includes(q))) : allRows
  const filteredRows = flagFilter ? searchedRows.filter(r => flagFilter.keys.has(`${r.cat}::${r.sc}`)) : searchedRows
  const flagsOf = r => margin?.flagsByKey?.[`${r.cat}::${r.sc}`] || []
  const breaks = (r, id) => flagsOf(r).includes(id)
  const red = { color: '#B91C1C' }
  const beOf = r => margin?.derived?.[`${r.cat}::${r.sc}`]?.beRoas ?? null
  const redIf = (on, text) => (on ? <span style={red}>{text}</span> : text)
  // Short header, full name on hover (decision 4, 27 Oct)
  const hdr = (short, full) => <span title={full}>{short}</span>
  // BE ROAS only where a real ROAS exists (real ad spend, not an allocation)
  const showBe = showMarketing && !spendAllocated && adSpendMap != null && !!margin
  const scrollRef = useRef(null)
  useEffect(() => {
    if (!highlightKey || !scrollRef.current) return
    const el = scrollRef.current.querySelector(`tr[data-key="${CSS.escape(highlightKey)}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlightKey])

  const getters = {
    cat: r => r.cat, sc: r => r.sc, gross: r => r.gross, excRev: r => r.excRev, units: r => r.units, asp: r => r.asp,
    returnPct: r => r.returnPct, net: r => r.net, spend: r => r.spend, spendPct: r => r.spendPct, roas: r => r.roas ?? -Infinity,
    cogs: r => r.anyCosted ? r.cogs : -Infinity, gm: r => r.gm ?? -Infinity,
    snd: r => r.anySnd ? r.snd : -Infinity, cm1: r => r.cm1 ?? -Infinity, cm2: r => r.cm2 ?? -Infinity,
    cogsPct: r => r.cogsPct ?? -Infinity, gmPct: r => r.gmPct ?? -Infinity,
    sndPct: r => r.sndPct ?? -Infinity, cm1Pct: r => r.cm1Pct ?? -Infinity, cm2Pct: r => r.cm2Pct ?? -Infinity,
    beRoas: r => beOf(r) ?? -Infinity, flags: r => flagsOf(r).length,
  }
  const rows = table.sortRows(filteredRows, getters)

  const tot = filteredRows.reduce((s, r) => ({
    gross: s.gross + r.gross, excRev: s.excRev + r.excRev, net: s.net + r.net, units: s.units + r.units,
    totalReturnRev: s.totalReturnRev + r.totalReturnRev, spend: s.spend + r.spend,
    cogs: s.cogs + (r.anyCosted ? r.cogs : 0), netCovered: s.netCovered + (r.anyCosted ? r.netCovered : 0), anyCosted: s.anyCosted || r.anyCosted,
    snd: s.snd + (r.anySnd ? r.snd : 0), sndNetCovered: s.sndNetCovered + (r.anySnd ? r.sndNetCovered : 0), anySnd: s.anySnd || r.anySnd,
    // CM1/CM2 on product-level net (netCovered), the same base as COGS%/GM% — matches kpiSummary.
    cm1: s.cm1 + (r.cm1Covered ? r.cm1 : 0), cm1NetCovered: s.cm1NetCovered + (r.cm1Covered ? r.netCovered : 0), anyCm1: s.anyCm1 || r.cm1Covered,
    cm2: s.cm2 + (r.cm2Covered ? r.cm2 : 0), cm2NetCovered: s.cm2NetCovered + (r.cm2Covered ? r.netCovered : 0), anyCm2: s.anyCm2 || r.cm2Covered,
  }), { gross: 0, excRev: 0, net: 0, units: 0, totalReturnRev: 0, spend: 0, cogs: 0, netCovered: 0, anyCosted: false, snd: 0, sndNetCovered: 0, anySnd: false, cm1: 0, cm1NetCovered: 0, anyCm1: false, cm2: 0, cm2NetCovered: 0, anyCm2: false })
  const totReturnPct = pctOf(tot.totalReturnRev, tot.gross)
  const totAsp = tot.units > 0 ? tot.gross / tot.units : 0
  // Marketing spend total: sum of visible rows' spend, plus any unmatched adSpendMap keys (spend
  // whose SubCategory didn't attribute to a sales row in this exact range) when includeUnmatched
  // is set — D2C "All" view only, so the headline Mktg Spend/CM2 always ties out to the Ads tab's
  // real total instead of silently under-reporting by the unattributed remainder. Amazon and every
  // other channel simply sum visible rows (includeUnmatched defaults to false).
  const visibleScSet = new Set(filteredRows.map(r => r.sc))
  const allSubCatKeys = new Set(Object.values(subCatData || {}).flatMap(scMap => Object.keys(scMap)))
  const totSpend = adSpendMap != null ? Object.entries(adSpendMap).reduce((s, [k, v]) => {
    if (visibleScSet.has(k)) return s + v
    if (includeUnmatched && !allSubCatKeys.has(k)) return s + v
    return s
  }, 0) : tot.spend
  const totSpendPct = tot.net > 0 ? (totSpend / tot.net * 100) : 0
  const totRoas = totSpend > 0 ? tot.excRev / totSpend : null
  const totGm = tot.anyCosted ? tot.netCovered - tot.cogs : null
  const totCogsPct = tot.netCovered > 0 ? (tot.cogs / tot.netCovered * 100) : 0
  const totGmPct = tot.netCovered > 0 && totGm != null ? (totGm / tot.netCovered * 100) : 0
  const totSndPct = tot.sndNetCovered > 0 ? (tot.snd / tot.sndNetCovered * 100) : 0
  const totCm1Pct = tot.anyCm1 && tot.cm1NetCovered > 0 ? (tot.cm1 / tot.cm1NetCovered * 100) : 0
  // CM2 total re-derived from totCm1/totSpend (rather than summing rows' cm2Covered values)
  // so it reflects the includeUnmatched-adjusted totSpend above, not just the visible-row sum.
  const totCm1ForCm2 = tot.anyCm1 ? tot.cm1 : null
  const totCm2 = totCm1ForCm2 != null ? totCm1ForCm2 - totSpend : null
  const totCm2Pct = totCm2 != null && tot.cm1NetCovered > 0 ? pctOf(totCm2, tot.cm1NetCovered) : 0

  const thStyle = { fontSize: 12, fontWeight: 600, color: C.t1, letterSpacing: 0.2, padding: '10px 5px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: `1px solid ${C.border2}` }
  const thStyleL = { ...thStyle, textAlign: 'left' }
  const tdStyle = { fontSize: 11, padding: '8px 5px', textAlign: 'right', color: C.t1, borderBottom: `1px solid ${C.border}`, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const tdStyleL = { ...tdStyle, textAlign: 'left', fontFamily: 'inherit' }
  const totalTdStyle = { ...tdStyle, padding: '10px 5px', fontWeight: 700, color: C.t1, borderBottom: 'none', position: 'sticky', bottom: 0, background: C.ach, borderTop: `1px solid ${C.border2}`, zIndex: 3 }
  const pendingCell = <span style={{ color: C.t3 }} title="Pending data — see PNL_TAB_ROADMAP.md">—</span>
  const noCostCell = <span style={{ color: C.t3 }} title="No cost entry for this SKU/product yet">—</span>
  const pctCellOf = (val, netCoveredVal) => netCoveredVal > 0 ? `${pctOf(val, netCoveredVal).toFixed(1)}%` : noCostCell
  const valCellOf = val => val != null ? fmt(val) : noCostCell

  // Column registry — the single source of truth for this table's columns. Category/Product are
  // pinned (not draggable — they're the row identity, not a metric) and always render first;
  // every other column is drag-to-reorder via useReorderableColumns below. Each column defines
  // its header (th/thStyle/sortKey), its main-row cell, its SKU-sub-row cell, and its Total-row
  // cell as small render functions — reordering the array changes DISPLAY order only, every
  // cell's actual value/formula is untouched and still keyed by column id, not position.
  const ALL_COLUMNS = [
    { id: 'gross', width: 10, label: hdr('Gross', 'Gross revenue (Inc GST)'), sortKey: 'gross', style: thStyle,
      row: r => <td style={tdStyle}>{fmt(r.gross)}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{fmt(sk.gross)}</td>,
      total: () => <td style={totalTdStyle}>{fmt(tot.gross)}</td> },
    { id: 'excRev', width: 10, label: hdr('Ex GST', 'Gross revenue (Ex GST)'), sortKey: 'excRev', style: thStyle,
      row: r => <td style={tdStyle}>{fmt(r.excRev)}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{fmt(sk.excRev)}</td>,
      total: () => <td style={totalTdStyle}>{fmt(tot.excRev)}</td> },
    { id: 'units', width: 7, label: hdr('Units', 'Units sold'), sortKey: 'units', style: thStyle,
      row: r => <td style={tdStyle}>{fmtN(r.units)}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{fmtN(sk.units)}</td>,
      total: () => <td style={totalTdStyle}>{fmtN(tot.units)}</td> },
    { id: 'asp', width: 6, label: hdr('ASP', 'Average selling price (gross ÷ units)'), sortKey: 'asp', style: thStyle,
      row: r => <td style={tdStyle}>{r.asp > 0 ? `₹${Math.round(r.asp).toLocaleString('en-IN')}` : <span style={{ color: C.t3 }}>—</span>}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{sk.units > 0 ? `₹${Math.round(sk.gross / sk.units).toLocaleString('en-IN')}` : <span style={{ color: C.t3 }}>—</span>}</td>,
      total: () => <td style={totalTdStyle}>{totAsp > 0 ? `₹${Math.round(totAsp).toLocaleString('en-IN')}` : '—'}</td> },
    { id: 'returnPct', width: 7, label: hdr('Ret',  'Returns % of gross'), sortKey: 'returnPct', style: thStyle,
      row: r => <td style={tdStyle}>{r.returnPct > 0 ? redIf(breaks(r, 'ret') || breaks(r, 'retup'), `${r.returnPct.toFixed(2)}%`) : <span style={{ color: C.t3 }}>—</span>}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{pctOf(sk.totalReturnRev, sk.gross) > 0 ? `${pctOf(sk.totalReturnRev, sk.gross).toFixed(2)}%` : <span style={{ color: C.t3 }}>—</span>}</td>,
      total: () => <td style={totalTdStyle}>{totReturnPct > 0 ? `${totReturnPct.toFixed(2)}%` : '—'}</td> },
    { id: 'net', width: 10, label: hdr('Net', 'Net revenue'), sortKey: 'net', style: thStyle,
      row: r => <td style={tdStyle}>{fmt(r.net)}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{fmt(sk.net)}</td>,
      total: () => <td style={totalTdStyle}>{fmt(tot.net)}</td> },
    { id: 'cogsPct', width: 6, label: hdr('COGS', 'COGS % of net revenue'), sortKey: 'cogsPct', style: thStyle,
      row: r => <td style={tdStyle}>{r.cogsPct != null ? redIf(breaks(r, 'cogs'), `${r.cogsPct.toFixed(1)}%`) : noCostCell}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{sk._costed && sk.net > MIN_REV_FOR_RATIOS ? `${pctOf(sk._cogs, sk.net).toFixed(1)}%` : noCostCell}</td>,
      total: () => <td style={totalTdStyle}>{pctCellOf(tot.cogs, tot.netCovered)}</td> },
    { id: 'gmPct', width: 6, label: hdr('GM', 'Gross margin % of net revenue'), sortKey: 'gmPct', style: thStyle,
      row: r => <td style={tdStyle}>{r.gmPct != null ? redIf(breaks(r, 'gm'), `${r.gmPct.toFixed(1)}%`) : noCostCell}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{sk._gm != null && sk.net > MIN_REV_FOR_RATIOS ? `${pctOf(sk._gm, sk.net).toFixed(1)}%` : noCostCell}</td>,
      total: () => <td style={totalTdStyle}>{totGm != null ? pctCellOf(totGm, tot.netCovered) : noCostCell}</td> },
    { id: 'sndPct', width: 6, label: hdr('SnD', 'Selling & distribution cost % of net revenue'), sortKey: 'sndPct', style: thStyle,
      row: r => <td style={tdStyle}>{r.sndPct != null ? `${r.sndPct.toFixed(1)}%` : noCostCell}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{sk._snd != null && sk.net > MIN_REV_FOR_RATIOS ? `${pctOf(sk._snd, sk.net).toFixed(1)}%` : noCostCell}</td>,
      total: () => <td style={totalTdStyle}>{pctCellOf(tot.snd, tot.sndNetCovered)}</td> },
    { id: 'cm1Pct', width: 6, label: hdr('CM1', 'Contribution margin 1 % of net revenue'), sortKey: 'cm1Pct', style: thStyle,
      row: r => <td style={tdStyle}>{r.cm1Pct != null ? redIf(breaks(r, 'cm1'), `${r.cm1Pct.toFixed(1)}%`) : noCostCell}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{sk._cm1 != null && sk.net > MIN_REV_FOR_RATIOS ? `${pctOf(sk._cm1, sk.net).toFixed(1)}%` : noCostCell}</td>,
      total: () => <td style={totalTdStyle}>{tot.anyCm1 ? `${totCm1Pct.toFixed(1)}%` : noCostCell}</td> },
    ...(showMarketing ? [
      { id: 'spendPct', width: 7, label: spendAllocated ? hdr('Mktg', 'Marketing % of net (allocated 1.5% of Net)') : hdr('Spend', 'Ad spend % of net revenue'), sortKey: 'spendPct', style: thStyle,
        row: r => <td style={tdStyle}>{r.spend > 0 ? `${r.spendPct.toFixed(2)}%` : <span style={{ color: C.t3 }}>—</span>}</td>,
        sku: () => <td style={{ ...tdStyle, fontSize: 11 }}><span style={{ color: C.t3 }}>—</span></td>,
        total: () => <td style={totalTdStyle}>{totSpend > 0 ? `${totSpendPct.toFixed(2)}%` : '—'}</td> },
      { id: 'roas', width: 6, label: hdr('ROAS', 'Return on ad spend (gross ex GST ÷ spend)'), sortKey: 'roas', style: thStyle,
        row: r => <td style={tdStyle}>{r.roas != null ? redIf(breaks(r, 'loss'), `${r.roas.toFixed(2)}x`) : <span style={{ color: C.t3 }}>—</span>}</td>,
        sku: () => <td style={{ ...tdStyle, fontSize: 11 }}><span style={{ color: C.t3 }}>—</span></td>,
        total: () => <td style={totalTdStyle}>{totRoas != null ? `${totRoas.toFixed(2)}x` : '—'}</td> },
      ...(showBe ? [{ id: 'beRoas', width: 7, label: hdr('BE ROAS', 'Breakeven ROAS: the ROAS at which CM2 is zero'), sortKey: 'beRoas', style: thStyle,
        row: r => <td style={tdStyle}>{beOf(r) != null ? `${beOf(r).toFixed(2)}x` : <span style={{ color: C.t3 }}>—</span>}</td>,
        sku: () => <td style={{ ...tdStyle, fontSize: 11 }}><span style={{ color: C.t3 }}>—</span></td>,
        total: () => <td style={totalTdStyle}>—</td> }] : []),
      { id: 'cm2Pct', width: 6, label: hdr('CM2', 'Contribution margin 2 (after ad spend) % of net revenue'), sortKey: 'cm2Pct', style: thStyle,
        row: r => <td style={tdStyle}>{r.cm2Pct != null ? redIf(breaks(r, 'loss'), `${r.cm2Pct.toFixed(1)}%`) : noCostCell}</td>,
        sku: () => <td style={{ ...tdStyle, fontSize: 11 }}>{pendingCell}</td>,
        total: () => <td style={totalTdStyle}>{totCm2 != null ? `${totCm2Pct.toFixed(1)}%` : noCostCell}</td> },
    ] : []),
    ...(margin ? [{ id: 'flags', width: 12, label: hdr('Flags', 'Margin watchlist rules this product breaks'), sortKey: 'flags', style: { ...thStyle, textAlign: 'left' },
      row: r => <td style={{ ...tdStyleL, overflow: 'hidden' }}><FlagChips ids={flagsOf(r)} names={margin.ruleName} max={1} /></td>,
      sku: () => <td style={{ ...tdStyle, fontSize: 11 }} />,
      total: () => <td style={{ ...totalTdStyle, textAlign: 'left', fontFamily: 'inherit' }}>{margin.flaggedProducts ? `${margin.flaggedProducts} flagged` : ''}</td> }] : []),
  ].filter(c => !(spendAllocated && c.id === 'roas')).sort((a, b) => COL_ORDER.indexOf(a.id) - COL_ORDER.indexOf(b.id))
  // v2: the default order changed to the P&L order (PNL_REVIEW_FIXES.md §1f), so an order saved
  // under the old key doesn't hide it.
  const reorder = useReorderableColumns(`pnl-financial-table-cols:v2:${title}`, ALL_COLUMNS)

  const handleExport = () => {
    const p2 = v => v != null ? +v.toFixed(2) : ''
    const ri = v => v != null ? Math.round(v) : ''
    const buildRow = (category, product, sk, rawD, skCogs, skGm, skSnd, skCm1, skSpend, skCm2, costed) => {
      const cancelRev = rawD?.cancelRev || 0
      const rtoRev = rawD?.rtoRev || 0
      const cirRev = rawD?.cirRev || 0
      const exchRev = rawD?.exchRev || 0
      const gross = sk.gross
      return {
        Category: category,
        Product: product,
        'Gross Rev (Inc GST)': ri(gross),
        'Gross Rev (Ex GST)': ri(sk.excRev),
        Units: sk.units,
        'Net Units': sk.netUnits,
        ASP: sk.units > 0 ? ri(gross / sk.units) : '',
        ...(hasReturnBreakdown ? {
          'Cancel Rev': ri(cancelRev),
          'Cancel %': p2(pctOf(cancelRev, gross)),
          'RTO Rev': ri(rtoRev),
          'RTO %': p2(pctOf(rtoRev, gross)),
          'CIR Rev': ri(cirRev),
          'CIR %': p2(pctOf(cirRev, gross)),
          'Exch Rev': ri(exchRev),
          'Exch %': p2(pctOf(exchRev, gross)),
          'Total Returns Rev': ri(sk.totalReturnRev),
          'Total Returns %': p2(pctOf(sk.totalReturnRev, gross)),
        } : {
          'Return Rev': ri(sk.totalReturnRev),
          'Return %': p2(pctOf(sk.totalReturnRev, gross)),
        }),
        'Net Revenue': ri(sk.net),
        'COGS': costed ? ri(skCogs) : '',
        'COGS %': costed && sk.net > MIN_REV_FOR_RATIOS ? p2(pctOf(skCogs, sk.net)) : '',
        'Gross Margin': skGm != null ? ri(skGm) : '',
        'GM %': skGm != null && sk.net > MIN_REV_FOR_RATIOS ? p2(pctOf(skGm, sk.net)) : '',
        'SnD Cost': skSnd != null ? ri(skSnd) : '',
        'SnD %': skSnd != null && sk.net > MIN_REV_FOR_RATIOS ? p2(pctOf(skSnd, sk.net)) : '',
        'CM1': skCm1 != null ? ri(skCm1) : '',
        'CM1 %': skCm1 != null && sk.net > MIN_REV_FOR_RATIOS ? p2(pctOf(skCm1, sk.net)) : '',
        ...(showMarketing ? {
          'Marketing Spend': skSpend > 0 ? ri(skSpend) : '',
          'Spend %': skSpend > 0 && sk.net > MIN_REV_FOR_RATIOS ? p2(pctOf(skSpend, sk.net)) : '',
          'RoAS': skSpend > 0 ? p2(sk.excRev / skSpend) : '',
          'Net RoAS': skSpend > 0 ? p2(sk.net / skSpend) : '',
          'CM2': skCm2 != null ? ri(skCm2) : '',
          'CM2 %': skCm2 != null && sk.net > MIN_REV_FOR_RATIOS ? p2(pctOf(skCm2, sk.net)) : '',
        } : {}),
      }
    }

    const csvRows = rows.map(r => {
      const rawD = subCatData?.[r.cat]?.[r.sc] || {}
      const rFull = mapRow(rawD, r.sc, r.cat)
      return buildRow(r.cat, r.sc,
        { gross: r.gross, excRev: r.excRev, units: r.units, netUnits: rFull.netUnits, totalReturnRev: r.totalReturnRev, net: r.net },
        rawD,
        r.anyCosted ? r.cogs : null, r.gm, r.anySnd ? r.snd : null, r.cm1, r.spend, r.cm2, r.anyCosted
      )
    })
    // Allocated spend (EBO): same columns as the table — renamed, RoAS left out.
    const csvOut = !spendAllocated ? csvRows : csvRows.map(row => {
      const out = {}
      Object.entries(row).forEach(([k, v]) => {
        if (k === 'RoAS' || k === 'Net RoAS') return
        out[k === 'Marketing Spend' ? 'Mktg (allocated 1.5% of Net)' : k === 'Spend %' ? 'Mktg % (allocated)' : k] = v
      })
      return out
    })
    exportCSV(csvOut, `${(title || 'financial_view').toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`)
  }

  return (
    <div className="kpi-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: C.t1, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{title}{headerInfo && <InfoPopover title="GM % / CM1 % and credit notes" text={headerInfo} style={{ width: 20, height: 20, margin: '-4px 0' }} />}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {flagFilter && (
            <button type="button" onClick={onClearFlag} title="Show all products"
              style={{ fontSize: 11.5, fontWeight: 600, color: '#8a5a00', background: 'rgba(200,134,10,.12)', border: 'none', borderRadius: 999, padding: '3px 10px', cursor: 'pointer', fontFamily: 'var(--font)' }}>Flag: {flagFilter.name} · {filteredRows.length} ✕</button>
          )}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search category / product…"
            style={{ fontSize: 11.5, padding: '4px 9px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.t1, width: 200, outline: 'none' }} />
          {!reorder.isDefaultOrder && <button onClick={reorder.resetOrder} title="Reset column order to default" style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>↺ Reset columns</button>}
          <button onClick={handleExport} style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>⭳ Export</button>
        </div>
      </div>
      <style>{'.fv-row .fv-sim{opacity:0}.fv-row:hover .fv-sim,.fv-row:focus-within .fv-sim{opacity:1}'}</style>
      <div ref={scrollRef} style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 560 }}>
        {/* Auto layout: number columns size to their values; Product / Category get a fixed minimum and grow with what's left (ellipsis) */}
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', minWidth: 1100 }}>
          <thead>
            <tr style={{ background: C.acl }}>
              <Th label="Product" sortKey="sc" style={{ ...thStyleL, paddingLeft: 12, minWidth: 146, position: 'sticky', top: 0, background: C.ach, zIndex: 3 }} align="left" />
              <Th label="Category" sortKey="cat" style={{ ...thStyleL, minWidth: 70, position: 'sticky', top: 0, background: C.ach, zIndex: 3 }} align="left" />
              {reorder.orderedColumns.map(c => (
                <Th key={c.id} label={c.label} sortKey={c.sortKey} style={{ ...c.style, position: 'sticky', top: 0, background: C.ach, zIndex: 3 }}
                  dragProps={{ onDragStart: reorder.onDragStart(c.id), onDragOver: reorder.onDragOver, onDrop: reorder.onDrop(c.id) }} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const skuKey = `${r.cat}::${r.sc}`
              const isOpen = expandedSku[skuKey]
              const allSkus = Object.entries(skuData?.[r.cat]?.[r.sc] || {}).map(([sku, d]) => ({ sku, ...mapRow(d) })).sort((a, b) => b.gross - a.gross)
              const skus = q ? allSkus.filter(sk => r.cat.toLowerCase().includes(q) || r.sc.toLowerCase().includes(q) || sk.sku.toLowerCase().includes(q)) : allSkus
              const scTotalGross = allSkus.reduce((s, sk) => s + sk.gross, 0)
              const hasSkus = allSkus.length > 0
              const rowZebra = skuKey === highlightKey ? 'rgba(200,134,10,.14)' : ri % 2 === 1 ? C.hov : 'transparent'
              return (
                <Fragment key={skuKey}>
                  <tr className="fv-row" data-key={skuKey} data-hl={skuKey === highlightKey ? '1' : undefined} style={{ cursor: 'default', background: rowZebra, ...(skuKey === highlightKey ? { outline: '2px solid rgba(200,134,10,.7)', outlineOffset: -2 } : {}), transition: 'box-shadow .12s, background .12s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.acl; e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${C.acm}55, 0 0 8px 0 ${C.acc}33` }}
                    onMouseLeave={e => { e.currentTarget.style.background = rowZebra; e.currentTarget.style.boxShadow = 'none' }}>
                    <td style={{ ...tdStyleL, paddingLeft: 12, maxWidth: 0, minWidth: 146, fontWeight: 600, overflow: 'hidden' }}><div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span onClick={() => hasSkus && toggleSku(skuKey)} title={r.sc} style={{ cursor: hasSkus ? 'pointer' : 'default', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%' }}>
                        {hasSkus && <span style={{ fontSize: 9, color: C.t3, display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s', flexShrink: 0 }}>▶</span>}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sc}</span>
                      </span>
                      {PNL_WATCHLIST_EXCLUDE.has(r.sc) && <InfoPopover title={r.sc} text={PNL_OTHERS_INFO} style={{ width: 20, height: 20, margin: '-4px 0', flexShrink: 0 }} />}
                      {onSimulate && <button type="button" className="fv-sim" onClick={() => onSimulate(skuKey)} title={`${simulateLabel}: ${r.sc}`}
                        style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 11, fontWeight: 600, color: C.t1, background: C.card, border: `1px solid ${C.border2}`, borderRadius: 6, padding: '1px 6px', cursor: 'pointer', fontFamily: 'var(--font)' }}>↗</button>}
                    </div></td>
                    <td style={{ ...tdStyleL, maxWidth: 0, minWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.cat}>{r.cat}</td>
                    {reorder.orderedColumns.map(c => <Fragment key={c.id}>{c.row(r)}</Fragment>)}
                  </tr>
                  {isOpen && skus.map(sk_ => {
                    const skAsp = sk_.units > 0 ? sk_.gross / sk_.units : 0
                    const skPerUnitCogs = getCogsForRange({ sku: sk_.sku, units: sk_.units, startDate, endDate, cogsMonthlyMap, asp: skAsp }).perUnitBlended
                    const costed = skPerUnitCogs > 0 || sk_.netUnits > 0
                    const skCogs = costed ? skPerUnitCogs * sk_.netUnits : 0
                    const skGm = costed ? sk_.net - skCogs : null
                    const skSnd = sndBySku?.[sk_.sku]
                    const skCm1 = costed && skSnd != null ? skGm - skSnd : null
                    // Precompute once per SKU row (not per-cell) — _costed/_cogs/_gm/_snd/_cm1 are
                    // read by the COGS%/GM%/SnD%/CM1% column definitions above, whichever position
                    // they're currently displayed in.
                    const sk = { ...sk_, _costed: costed, _cogs: skCogs, _gm: skGm, _snd: skSnd, _cm1: skCm1 }
                    return (
                      <tr key={sk.sku} style={{ cursor: 'default', background: C.hov, transition: 'box-shadow .12s, background .12s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = C.acl; e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${C.acm}55, 0 0 8px 0 ${C.acc}33` }}
                        onMouseLeave={e => { e.currentTarget.style.background = C.hov; e.currentTarget.style.boxShadow = 'none' }}>
                        <td style={{ ...tdStyleL, maxWidth: 0, borderBottom: `1px solid ${C.border}`, fontFamily: 'var(--mono)', fontSize: 11, color: C.t2, paddingLeft: 26 }} title={sk.sku}>└ {sk.sku}</td>
                        <td style={{ ...tdStyleL, borderBottom: `1px solid ${C.border}` }}></td>
                        {reorder.orderedColumns.map(c => <Fragment key={c.id}>{c.sku(sk)}</Fragment>)}
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...totalTdStyle, textAlign: 'left', paddingLeft: 12 }}>Total</td>
              <td style={{ ...totalTdStyle, textAlign: 'left' }}></td>
              {reorder.orderedColumns.map(c => <Fragment key={c.id}>{c.total()}</Fragment>)}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
