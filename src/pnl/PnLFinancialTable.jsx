import { useState, useEffect, Fragment } from 'react'
import { C, fmt, fmtN, exportCSV } from '../utils.js'
import { useSortableTable, useReorderableColumns } from '../components.jsx'
import { netRevenueOf, estimateCogsPerUnit } from './pnlUtils.js'

// Financial View table — Category → Product (→ SKU) grain, same visual language as
// FlatCategoryProductMatrix (sticky C.bg header, sortable columns, hover-highlight rows,
// bold sticky Total row, expandable SKU rows, CSV export).
//
// COGS/GM are real, sourced from public/cogs-data.json (a flat per-SKU cost sheet — not yet
// month-wise, regenerate via scripts/generate-cogs-cache.mjs when a new sheet lands). COGS value
// = per-unit cost × net units sold (gross units minus cancelled/RTO/returned/CIR units) — only
// Amazon SC currently reports returnedUnits (see amzSCSubCatChannel/amzSCSKUChannel in
// api/bq.js), so other channels fall back to gross units in mapRow() until they're wired up the
// same way. COGS % is COGS ÷ Net Revenue (netCovered), unaffected by which unit count feeds the
// COGS value itself. SnD/CM1
// are real for Shopify (sndBySku, computed in PnLPage.jsx from each SKU's actual order
// weight-share against public/snd-rates.json) and for Amazon Seller Central (sndBySku sourced
// from the real settlement report — see amzSCSettlement in api/bq.js and PNL_TAB_ROADMAP.md for
// the verified charge-column mapping). Other channels don't have per-SKU cost data wired yet.
// CM2 (SnD − Marketing Spend − COGS, i.e. after ad spend) still needs product-level ad-spend
// attribution, not yet wired.
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
export default function PnLFinancialTable({ subCatData, skuData, adSpendMap = {}, sndBySku, title = 'Financial View', showMarketing = true, includeUnmatched = false, mobilityNetBySubCat = {}, netScale = 1 }) {
  const [expandedSku, setExpandedSku] = useState({})
  const [search, setSearch] = useState('')
  const [cogsMap, setCogsMap] = useState(null)
  const toggleSku = key => setExpandedSku(prev => ({ ...prev, [key]: !prev[key] }))
  const table = useSortableTable('gross')
  const { Th } = table

  useEffect(() => {
    fetch('/cogs-data.json').then(r => r.ok ? r.json() : {}).then(setCogsMap).catch(() => setCogsMap({}))
  }, [])

  const q = search.trim().toLowerCase()

  // Net Revenue / netUnits / totalReturnRev — single canonical formula, shared with
  // PnLPage.jsx's netOf()/amzDailyPnL/kpiSummary via ./pnlUtils.js (see that file's header
  // comment for the exact formula and the mobility-override behavior).
  const mapRow = (d, scName, catName) => netRevenueOf(d, scName, mobilityNetBySubCat, catName, netScale)
  const pctOf = (n, d) => d > 0 ? (n / d * 100) : 0
  // A handful of rows have genuinely non-zero but negligible revenue (e.g. a ₹1 leftover-cent
  // transaction) — pctOf's `d > 0` guard lets these through and produces million-percent ratios
  // (COGS%/GM%/SnD%/CM1%/CM2%/Spend%/ROAS) that are technically correct arithmetic but visually
  // meaningless and alarming. Below this floor, treat the denominator as "not meaningfully
  // covered" the same way a true-zero row already renders as "—", rather than fabricating a
  // finite-but-absurd percentage.
  const MIN_REV_FOR_RATIOS = 100
  const pctOfFloored = (n, d) => d > MIN_REV_FOR_RATIOS ? (n / d * 100) : 0

  // Per-SKU COGS × units and SnD. Every SKU gets a COGS figure — real (cogsMap) where available,
  // else the ASP-based estimate above — so anyCosted is always true and no product is ever
  // excluded from GM%/CM1%/CM2% for lack of a cost sheet entry. netCovered/sndNetCovered track
  // how much of this row's Net Revenue is backed by an SnD entry (SnD has no fallback estimate).
  const costsForSkus = (cat, sc) => {
    const skus = skuData?.[cat]?.[sc] || {}
    let cogs = 0, netCovered = 0, anyCosted = false
    let snd = 0, sndNetCovered = 0, anySnd = false
    // For Mobility subcategories: distribute the manager-defined whitelist net revenue
    // proportionally across SKUs by each SKU's standard-formula net share, so per-SKU COGS%/GM%/
    // SnD%/CM1% denominators stay consistent with the subcategory-level override applied in
    // mapRow() above, instead of silently reverting to the standard (non-whitelist) net per SKU.
    // Keyed 'Category::SubCategory' — see pnlUtils.js's netRevenueOf() header comment for why a
    // bare SubCategory key would double-apply this whitelist value when the same SubCategory name
    // exists under two different Categories (e.g. 'Sparepart' under both Mobility and 'Sparepart
    // (Chair & Mobility)').
    const whitelistNet = mobilityNetBySubCat[`${cat}::${sc}`] != null ? mobilityNetBySubCat[`${cat}::${sc}`] : null
    const skuEntries = Object.entries(skus)
    const standardNetTotal = whitelistNet != null ? skuEntries.reduce((s, [, d]) => s + mapRow(d).net, 0) : 0
    skuEntries.forEach(([sku, d]) => {
      const entry = cogsMap?.[sku]
      const rStandard = mapRow(d)
      const r = whitelistNet != null && standardNetTotal > 0
        ? { ...rStandard, net: whitelistNet * (rStandard.net / standardNetTotal) }
        : rStandard
      const asp = r.units > 0 ? r.gross / r.units : 0
      const perUnitCogs = (entry && entry.cogs != null) ? entry.cogs : estimateCogsPerUnit(asp)
      if (perUnitCogs > 0 || r.netUnits > 0) {
        cogs += perUnitCogs * r.netUnits
        netCovered += r.net
        anyCosted = true
      }
      if (sndBySku && sndBySku[sku] != null) {
        snd += sndBySku[sku]
        sndNetCovered += r.net
        anySnd = true
      }
    })
    return { cogs, netCovered, anyCosted, snd, sndNetCovered, anySnd }
  }

  const allRows = []
  Object.entries(subCatData || {}).forEach(([cat, scMap]) => {
    Object.entries(scMap).forEach(([sc, d]) => {
      const r = mapRow(d, sc, cat)
      const spend = adSpendMap != null ? (adSpendMap[sc] || 0) : null
      const { cogs, netCovered, anyCosted, snd, sndNetCovered, anySnd } = (cogsMap || sndBySku) ? costsForSkus(cat, sc) : { cogs: 0, netCovered: 0, anyCosted: false, snd: 0, sndNetCovered: 0, anySnd: false }
      const gm = anyCosted ? netCovered - cogs : null
      // CM1 = GM − SnD, only meaningful where BOTH costs are known for the same covered revenue —
      // a row costed for GM but not SnD (or vice versa) can't produce an honest CM1.
      const cm1Covered = anyCosted && anySnd
      const cm1 = cm1Covered ? gm - snd : null
      // CM2 = CM1 − Marketing Spend — only meaningful where CM1 itself is covered (spend with no
      // known CM1 can't produce an honest CM2 either; a row with zero real ad spend still gets a
      // valid CM2 of cm1 - 0, since "no ad spend" is a known fact, not a missing cost).
      const cm2Covered = cm1Covered
      const cm2 = cm2Covered ? cm1 - spend : null
      // Rows with negligible-but-nonzero revenue (e.g. a genuine ₹1 leftover transaction) would
      // otherwise pass every `> 0` guard below and produce finite-but-meaningless million-percent
      // ratios (COGS 2,104,545%, CM1 -2,161,006% observed on a real ₹1 row) — floor them to "not
      // meaningfully covered" instead, same treatment a true-zero-revenue row already gets.
      const belowFloor = r.net <= MIN_REV_FOR_RATIOS
      allRows.push({
        cat, sc, ...r, spend, cogs, netCovered, anyCosted, gm, snd, sndNetCovered, anySnd, cm1, cm1Covered, cm2, cm2Covered,
        returnPct: pctOf(r.totalReturnRev, r.gross),
        spendPct: belowFloor ? 0 : (r.net > 0 ? (spend / r.net * 100) : 0),
        roas: belowFloor ? null : (spend > 0 ? r.excRev / spend : null),
        netRoas: belowFloor ? null : (spend > 0 ? r.net / spend : null),
        asp: r.units > 0 ? r.gross / r.units : 0,
        cogsPct: !belowFloor && netCovered > MIN_REV_FOR_RATIOS ? pctOfFloored(cogs, netCovered) : null,
        gmPct: !belowFloor && gm != null && netCovered > MIN_REV_FOR_RATIOS ? pctOfFloored(gm, netCovered) : null,
        sndPct: !belowFloor && sndNetCovered > MIN_REV_FOR_RATIOS ? pctOfFloored(snd, sndNetCovered) : null,
        // CM1%/CM2% denominator: "covered net" (sndNetCovered, since cm1Covered = anyCosted &&
        // anySnd and COGS's ASP-fallback means anyCosted is ~always true — so sndNetCovered is
        // effectively cm1/cm2's own covered-net) — NOT the row's full r.net. Using r.net here
        // previously disagreed with this exact row's own COGS%/GM%/SnD% cells (which correctly use
        // netCovered/sndNetCovered) whenever a row had partial SnD coverage across its SKUs, AND
        // disagreed with the Total row (totCm1Pct/totCm2Pct below, which already use
        // tot.cm1NetCovered) and the KPI card (PnLPage.jsx's kpiSummary.cm1Pct/cm2Pct, which use
        // cm1NetCovered) for the identical date range — three different denominators for what
        // should be one number.
        cm1Pct: !belowFloor && cm1 != null && sndNetCovered > MIN_REV_FOR_RATIOS ? pctOfFloored(cm1, sndNetCovered) : null,
        cm2Pct: !belowFloor && cm2 != null && sndNetCovered > MIN_REV_FOR_RATIOS ? pctOfFloored(cm2, sndNetCovered) : null,
      })
    })
  })
  const filteredRows = q ? allRows.filter(r => r.cat.toLowerCase().includes(q) || r.sc.toLowerCase().includes(q) || Object.keys(skuData?.[r.cat]?.[r.sc] || {}).some(sku => sku.toLowerCase().includes(q))) : allRows

  const getters = {
    cat: r => r.cat, sc: r => r.sc, gross: r => r.gross, excRev: r => r.excRev, units: r => r.units, asp: r => r.asp,
    returnPct: r => r.returnPct, net: r => r.net, spend: r => r.spend, spendPct: r => r.spendPct, roas: r => r.roas ?? -Infinity,
    cogs: r => r.anyCosted ? r.cogs : -Infinity, gm: r => r.gm ?? -Infinity,
    snd: r => r.anySnd ? r.snd : -Infinity, cm1: r => r.cm1 ?? -Infinity, cm2: r => r.cm2 ?? -Infinity,
    cogsPct: r => r.cogsPct ?? -Infinity, gmPct: r => r.gmPct ?? -Infinity,
    sndPct: r => r.sndPct ?? -Infinity, cm1Pct: r => r.cm1Pct ?? -Infinity, cm2Pct: r => r.cm2Pct ?? -Infinity,
  }
  const rows = table.sortRows(filteredRows, getters)

  const tot = filteredRows.reduce((s, r) => ({
    gross: s.gross + r.gross, excRev: s.excRev + r.excRev, net: s.net + r.net, units: s.units + r.units,
    totalReturnRev: s.totalReturnRev + r.totalReturnRev, spend: s.spend + r.spend,
    cogs: s.cogs + (r.anyCosted ? r.cogs : 0), netCovered: s.netCovered + (r.anyCosted ? r.netCovered : 0), anyCosted: s.anyCosted || r.anyCosted,
    snd: s.snd + (r.anySnd ? r.snd : 0), sndNetCovered: s.sndNetCovered + (r.anySnd ? r.sndNetCovered : 0), anySnd: s.anySnd || r.anySnd,
    cm1: s.cm1 + (r.cm1Covered ? r.cm1 : 0), cm1NetCovered: s.cm1NetCovered + (r.cm1Covered ? r.net : 0), anyCm1: s.anyCm1 || r.cm1Covered,
    cm2: s.cm2 + (r.cm2Covered ? r.cm2 : 0), cm2NetCovered: s.cm2NetCovered + (r.cm2Covered ? r.net : 0), anyCm2: s.anyCm2 || r.cm2Covered,
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

  const thStyle = { fontSize: 9.5, fontWeight: 700, color: C.t1, textTransform: 'uppercase', letterSpacing: 0.4, padding: '6px 7px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: `1.5px solid ${C.border}` }
  const thStyleL = { ...thStyle, textAlign: 'left' }
  const tdStyle = { fontSize: 11, padding: '4px 7px', textAlign: 'right', color: C.t1, borderBottom: `1px solid ${C.border}`, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const tdStyleL = { ...tdStyle, textAlign: 'left', fontFamily: 'inherit' }
  const totalTdStyle = { ...tdStyle, padding: '6px 7px', fontWeight: 700, color: C.t1, borderBottom: 'none', position: 'sticky', bottom: 0, background: C.bg, borderTop: `1.5px solid ${C.border}`, zIndex: 1 }
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
    { id: 'gross', label: 'Gross (Inc GST)', sortKey: 'gross', style: thStyle,
      row: r => <td style={tdStyle}>{fmt(r.gross)}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{fmt(sk.gross)}</td>,
      total: () => <td style={totalTdStyle}>{fmt(tot.gross)}</td> },
    { id: 'excRev', label: 'Gross (Ex GST)', sortKey: 'excRev', style: thStyle,
      row: r => <td style={tdStyle}>{fmt(r.excRev)}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{fmt(sk.excRev)}</td>,
      total: () => <td style={totalTdStyle}>{fmt(tot.excRev)}</td> },
    { id: 'units', label: 'Units', sortKey: 'units', style: thStyle,
      row: r => <td style={tdStyle}>{fmtN(r.units)}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{fmtN(sk.units)}</td>,
      total: () => <td style={totalTdStyle}>{fmtN(tot.units)}</td> },
    { id: 'asp', label: 'ASP', sortKey: 'asp', style: thStyle,
      row: r => <td style={tdStyle}>{r.asp > 0 ? `₹${Math.round(r.asp).toLocaleString('en-IN')}` : <span style={{ color: C.t3 }}>—</span>}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{sk.units > 0 ? `₹${Math.round(sk.gross / sk.units).toLocaleString('en-IN')}` : <span style={{ color: C.t3 }}>—</span>}</td>,
      total: () => <td style={totalTdStyle}>{totAsp > 0 ? `₹${Math.round(totAsp).toLocaleString('en-IN')}` : '—'}</td> },
    { id: 'returnPct', label: 'Returns %', sortKey: 'returnPct', style: thStyle,
      row: r => <td style={tdStyle}>{r.returnPct > 0 ? <span style={{ color: r.returnPct > 20 ? '#B91C1C' : 'inherit' }}>{r.returnPct.toFixed(2)}%</span> : <span style={{ color: C.t3 }}>—</span>}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{pctOf(sk.totalReturnRev, sk.gross) > 0 ? `${pctOf(sk.totalReturnRev, sk.gross).toFixed(2)}%` : <span style={{ color: C.t3 }}>—</span>}</td>,
      total: () => <td style={totalTdStyle}>{totReturnPct > 0 ? `${totReturnPct.toFixed(2)}%` : '—'}</td> },
    { id: 'net', label: 'Net Rev', sortKey: 'net', style: thStyle,
      row: r => <td style={tdStyle}>{fmt(r.net)}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{fmt(sk.net)}</td>,
      total: () => <td style={totalTdStyle}>{fmt(tot.net)}</td> },
    { id: 'cogsPct', label: 'COGS %', sortKey: 'cogsPct', style: thStyle,
      row: r => <td style={tdStyle}>{r.cogsPct != null ? `${r.cogsPct.toFixed(1)}%` : noCostCell}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{sk._costed && sk.net > MIN_REV_FOR_RATIOS ? `${pctOf(sk._cogs, sk.net).toFixed(1)}%` : noCostCell}</td>,
      total: () => <td style={totalTdStyle}>{pctCellOf(tot.cogs, tot.netCovered)}</td> },
    { id: 'gmPct', label: 'GM %', sortKey: 'gmPct', style: thStyle,
      row: r => <td style={tdStyle}>{r.gmPct != null ? `${r.gmPct.toFixed(1)}%` : noCostCell}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{sk._gm != null && sk.net > MIN_REV_FOR_RATIOS ? `${pctOf(sk._gm, sk.net).toFixed(1)}%` : noCostCell}</td>,
      total: () => <td style={totalTdStyle}>{totGm != null ? pctCellOf(totGm, tot.netCovered) : noCostCell}</td> },
    { id: 'sndPct', label: 'SnD %', sortKey: 'sndPct', style: thStyle,
      row: r => <td style={tdStyle}>{r.sndPct != null ? `${r.sndPct.toFixed(1)}%` : noCostCell}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{sk._snd != null && sk.net > MIN_REV_FOR_RATIOS ? `${pctOf(sk._snd, sk.net).toFixed(1)}%` : noCostCell}</td>,
      total: () => <td style={totalTdStyle}>{pctCellOf(tot.snd, tot.sndNetCovered)}</td> },
    { id: 'cm1Pct', label: 'CM1 %', sortKey: 'cm1Pct', style: thStyle,
      row: r => <td style={tdStyle}>{r.cm1Pct != null ? `${r.cm1Pct.toFixed(1)}%` : noCostCell}</td>,
      sku: sk => <td style={{ ...tdStyle, fontSize: 11 }}>{sk._cm1 != null && sk.net > MIN_REV_FOR_RATIOS ? `${pctOf(sk._cm1, sk.net).toFixed(1)}%` : noCostCell}</td>,
      total: () => <td style={totalTdStyle}>{tot.anyCm1 ? `${totCm1Pct.toFixed(1)}%` : noCostCell}</td> },
    ...(showMarketing ? [
      { id: 'spendPct', label: 'Spend %', sortKey: 'spendPct', style: thStyle,
        row: r => <td style={tdStyle}>{r.spend > 0 ? `${r.spendPct.toFixed(2)}%` : <span style={{ color: C.t3 }}>—</span>}</td>,
        sku: () => <td style={{ ...tdStyle, fontSize: 11 }}><span style={{ color: C.t3 }}>—</span></td>,
        total: () => <td style={totalTdStyle}>{totSpend > 0 ? `${totSpendPct.toFixed(2)}%` : '—'}</td> },
      { id: 'roas', label: 'RoAS', sortKey: 'roas', style: thStyle,
        row: r => <td style={tdStyle}>{r.roas != null ? `${r.roas.toFixed(2)}x` : <span style={{ color: C.t3 }}>—</span>}</td>,
        sku: () => <td style={{ ...tdStyle, fontSize: 11 }}><span style={{ color: C.t3 }}>—</span></td>,
        total: () => <td style={totalTdStyle}>{totRoas != null ? `${totRoas.toFixed(2)}x` : '—'}</td> },
      { id: 'cm2Pct', label: 'CM2 %', sortKey: 'cm2Pct', style: thStyle,
        row: r => <td style={tdStyle}>{r.cm2Pct != null ? `${r.cm2Pct.toFixed(1)}%` : noCostCell}</td>,
        sku: () => <td style={{ ...tdStyle, fontSize: 11 }}>{pendingCell}</td>,
        total: () => <td style={totalTdStyle}>{totCm2 != null ? `${totCm2Pct.toFixed(1)}%` : noCostCell}</td> },
    ] : []),
  ]
  const reorder = useReorderableColumns(`pnl-financial-table-cols:${title}`, ALL_COLUMNS)

  const handleExport = () => {
    const csvRows = rows.flatMap(r => {
      const main = {
        Category: r.cat, Product: r.sc,
        'Gross Rev (Inc GST)': Math.round(r.gross), 'Gross Rev (Ex GST)': Math.round(r.excRev),
        Units: r.units, ASP: r.asp > 0 ? Math.round(r.asp) : '',
        'Returns %': +r.returnPct.toFixed(2), 'Returns Value': Math.round(r.totalReturnRev),
        'Net Revenue': Math.round(r.net),
        'COGS': r.anyCosted ? Math.round(r.cogs) : '', 'COGS %': r.cogsPct != null ? +r.cogsPct.toFixed(2) : '',
        'Gross Margin': r.gm != null ? Math.round(r.gm) : '', 'GM %': r.gmPct != null ? +r.gmPct.toFixed(2) : '',
        'SnD Cost': r.anySnd ? Math.round(r.snd) : '', 'SnD %': r.sndPct != null ? +r.sndPct.toFixed(2) : '',
        'CM1': r.cm1 != null ? Math.round(r.cm1) : '', 'CM1 %': r.cm1Pct != null ? +r.cm1Pct.toFixed(2) : '',
        ...(showMarketing ? {
          'Marketing Spend': Math.round(r.spend), 'Spend %': +r.spendPct.toFixed(2),
          'RoAS': r.roas != null ? +r.roas.toFixed(2) : '', 'Net RoAS': r.netRoas != null ? +r.netRoas.toFixed(2) : '',
          'CM2': r.cm2 != null ? Math.round(r.cm2) : '', 'CM2 %': r.cm2Pct != null ? +r.cm2Pct.toFixed(2) : '',
        } : {}),
      }
      // SKU sub-rows: same per-SKU cost logic as the table body (whitelist-net-scaled mapRow,
      // estimateCogsPerUnit fallback, sndBySku lookup) so exported SKU rows always match what's
      // shown when a Product row is expanded — no separately-derived export-only calculation.
      const whitelistNet = mobilityNetBySubCat[`${r.cat}::${r.sc}`] != null ? mobilityNetBySubCat[`${r.cat}::${r.sc}`] : null
      const skuEntries = Object.entries(skuData?.[r.cat]?.[r.sc] || {})
      const standardNetTotal = whitelistNet != null ? skuEntries.reduce((s, [, d]) => s + mapRow(d).net, 0) : 0
      const csvSkuTotalGross = skuEntries.reduce((s, [, d]) => s + (mapRow(d).gross || 0), 0)
      const skuRows = skuEntries.map(([sku, d]) => {
        const rStandard = mapRow(d)
        const sk = whitelistNet != null && standardNetTotal > 0
          ? { ...rStandard, net: whitelistNet * (rStandard.net / standardNetTotal) }
          : rStandard
        const entry = cogsMap?.[sku]
        const asp = sk.units > 0 ? sk.gross / sk.units : 0
        const perUnitCogs = (entry && entry.cogs != null) ? entry.cogs : estimateCogsPerUnit(asp)
        const costed = perUnitCogs > 0 || sk.netUnits > 0
        const skCogs = costed ? perUnitCogs * sk.netUnits : 0
        const skGm = costed ? sk.net - skCogs : null
        const skSnd = sndBySku?.[sku]
        const skCm1 = costed && skSnd != null ? skGm - skSnd : null
        const skSpendCsv = showMarketing && r.spend > 0 && csvSkuTotalGross > 0 ? r.spend * (sk.gross / csvSkuTotalGross) : 0
        const skCm2 = skCm1 != null && showMarketing ? skCm1 - skSpendCsv : null
        return {
          Category: r.cat, Product: `↳ ${sku}`,
          'Gross Rev (Inc GST)': Math.round(sk.gross), 'Gross Rev (Ex GST)': Math.round(sk.excRev),
          Units: sk.units, ASP: asp > 0 ? Math.round(asp) : '',
          'Returns %': +pctOf(sk.totalReturnRev, sk.gross).toFixed(2), 'Returns Value': Math.round(sk.totalReturnRev),
          'Net Revenue': Math.round(sk.net),
          'COGS': costed ? Math.round(skCogs) : '', 'COGS %': costed && sk.net > MIN_REV_FOR_RATIOS ? +pctOf(skCogs, sk.net).toFixed(2) : '',
          'Gross Margin': skGm != null ? Math.round(skGm) : '', 'GM %': skGm != null && sk.net > MIN_REV_FOR_RATIOS ? +pctOf(skGm, sk.net).toFixed(2) : '',
          'SnD Cost': skSnd != null ? Math.round(skSnd) : '', 'SnD %': skSnd != null && sk.net > MIN_REV_FOR_RATIOS ? +pctOf(skSnd, sk.net).toFixed(2) : '',
          'CM1': skCm1 != null ? Math.round(skCm1) : '', 'CM1 %': skCm1 != null && sk.net > MIN_REV_FOR_RATIOS ? +pctOf(skCm1, sk.net).toFixed(2) : '',
          ...(showMarketing ? {
            'Marketing Spend': skSpendCsv > 0 ? Math.round(skSpendCsv) : '', 'Spend %': skSpendCsv > 0 && sk.net > MIN_REV_FOR_RATIOS ? +pctOf(skSpendCsv, sk.net).toFixed(2) : '',
            'RoAS': '', 'Net RoAS': '',
            'CM2': skCm2 != null ? Math.round(skCm2) : '', 'CM2 %': skCm2 != null && sk.net > MIN_REV_FOR_RATIOS ? +pctOf(skCm2, sk.net).toFixed(2) : '',
          } : {}),
        }
      })
      return [main, ...skuRows]
    })
    exportCSV(csvRows, `${(title || 'financial_view').toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`)
  }

  return (
    <div className="kpi-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: C.t1 }}>{title}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search category / product…"
            style={{ fontSize: 11.5, padding: '4px 9px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.t1, width: 200, outline: 'none' }} />
          {!reorder.isDefaultOrder && <button onClick={reorder.resetOrder} title="Reset column order to default" style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>↺ Reset columns</button>}
          <button onClick={handleExport} style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>⭳ Export</button>
        </div>
      </div>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 560 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 1580 }}>
          <colgroup>
            <col style={{ width: showMarketing ? '8%' : '10%' }} /><col style={{ width: showMarketing ? '17%' : '20%' }} />
            {reorder.orderedColumns.map(c => <col key={c.id} style={{ width: `${(showMarketing ? 75 : 78) / ALL_COLUMNS.length}%` }} />)}
          </colgroup>
          <thead>
            <tr style={{ background: C.bg }}>
              <Th label="Category" sortKey="cat" style={{ ...thStyleL, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }} align="left" />
              <Th label="Product" sortKey="sc" style={{ ...thStyleL, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }} align="left" />
              {reorder.orderedColumns.map(c => (
                <Th key={c.id} label={c.label} sortKey={c.sortKey} style={{ ...c.style, position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}
                  dragProps={{ onDragStart: reorder.onDragStart(c.id), onDragOver: reorder.onDragOver, onDrop: reorder.onDrop(c.id) }} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const skuKey = `${r.cat}::${r.sc}`
              const isOpen = expandedSku[skuKey]
              const allSkus = Object.entries(skuData?.[r.cat]?.[r.sc] || {}).map(([sku, d]) => ({ sku, ...mapRow(d) })).sort((a, b) => b.gross - a.gross)
              const skus = q ? allSkus.filter(sk => r.cat.toLowerCase().includes(q) || r.sc.toLowerCase().includes(q) || sk.sku.toLowerCase().includes(q)) : allSkus
              const scTotalGross = allSkus.reduce((s, sk) => s + sk.gross, 0)
              const hasSkus = allSkus.length > 0
              return (
                <Fragment key={skuKey}>
                  <tr style={{ cursor: 'default' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FFFBE6'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ ...tdStyleL, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.cat}>{r.cat}</td>
                    <td style={{ ...tdStyleL, fontWeight: 600, overflow: 'hidden' }}>
                      <span onClick={() => hasSkus && toggleSku(skuKey)} title={r.sc} style={{ cursor: hasSkus ? 'pointer' : 'default', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%' }}>
                        {hasSkus && <span style={{ fontSize: 9, color: C.t3, display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s', flexShrink: 0 }}>▶</span>}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sc}</span>
                      </span>
                    </td>
                    {reorder.orderedColumns.map(c => <Fragment key={c.id}>{c.row(r)}</Fragment>)}
                  </tr>
                  {isOpen && skus.map(sk_ => {
                    const entry = cogsMap?.[sk_.sku]
                    const skAsp = sk_.units > 0 ? sk_.gross / sk_.units : 0
                    const skPerUnitCogs = (entry && entry.cogs != null) ? entry.cogs : estimateCogsPerUnit(skAsp)
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
                      <tr key={sk.sku} style={{ cursor: 'default' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#FFFBE6'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ ...tdStyleL, borderBottom: `1px solid ${C.border}` }}></td>
                        <td style={{ ...tdStyleL, borderBottom: `1px solid ${C.border}`, fontFamily: 'var(--mono)', fontSize: 11, color: C.t2, paddingLeft: 22 }}>└ {sk.sku}</td>
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
              <td style={{ ...totalTdStyle, textAlign: 'left' }}>Total</td>
              <td style={{ ...totalTdStyle, textAlign: 'left' }}></td>
              {reorder.orderedColumns.map(c => <Fragment key={c.id}>{c.total()}</Fragment>)}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
