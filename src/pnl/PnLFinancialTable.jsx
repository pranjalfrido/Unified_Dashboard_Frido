import { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import { C, fmt, fmtN, exportCSV } from '../utils.js'
import { useSortableTable } from '../components.jsx'

// Financial View table — Category → Product (→ SKU) grain, same visual language as
// FlatCategoryProductMatrix (sticky C.bg header, sortable columns, hover-highlight rows,
// bold sticky Total row, expandable SKU rows, CSV export).
//
// COGS/GM are real, sourced from public/cogs-data.json (a flat per-SKU cost sheet — not yet
// month-wise, regenerate via scripts/generate-cogs-cache.mjs when a new sheet lands). SnD/CM1
// are real for Shopify only so far (sndBySku, computed in PnLPage.jsx from each SKU's actual
// order weight-share against public/snd-rates.json — see PNL_TAB_ROADMAP.md for other
// channels, which don't have per-SKU weight data queried yet). CM2 (SnD − Marketing Spend −
// COGS, i.e. after ad spend) still needs product-level ad-spend attribution, not yet wired.
// Missing-cost columns render a muted "—" placeholder rather than a fabricated number. A SKU
// with no COGS/SnD entry also renders "—" for its own row, and a Product/Category row shows
// COGS/GM/SnD/CM1 only for the portion of its revenue covered by SKUs that DO have that cost
// — never silently treating a missing cost as zero.
//
// subCatData: {category: {subCategory: {rev, excRev, units, cancelRev, rtoRev, cirRev, exchRev, returnRev}}}
// skuData:    {category: {subCategory: {sku: {...same fields}}}}
// adSpendMap: optional {subCategory: spend} — real marketing spend, folded in as Spend % of Net Revenue.
// sndBySku: optional {sku: totalSndCost} — real SnD cost per SKU (Shopify only for now).
// skuCosts: {sku: {logistics, fulfilment, paymentGw, softwareFee}} — D2C only, from PnLPage
export default function PnLFinancialTable({ subCatData, skuData, adSpendMap = {}, skuCosts, title = 'Financial View' }) {
  const [expandedSku, setExpandedSku] = useState({})
  const [search, setSearch] = useState('')
  const [cogsMap, setCogsMap] = useState(null)
  const toggleSku = key => setExpandedSku(prev => ({ ...prev, [key]: !prev[key] }))
  const table = useSortableTable('gross')
  const { Th } = table

  // Column widths — keyed by column id. Default widths in px.
  const DEFAULT_COL_WIDTHS = { cat: 120, sc: 220, gross: 110, excRev: 110, units: 70, returnPct: 80, net: 110, cogsPct: 75, gmPct: 75, sndPct: 75, cm1Pct: 75, spend: 100, spendPct: 80, cm2: 100, cm2Pct: 75 }
  const [colWidths, setColWidths] = useState(DEFAULT_COL_WIDTHS)
  const dragRef = useRef(null)

  const startResize = useCallback((colId, e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = colWidths[colId] || DEFAULT_COL_WIDTHS[colId] || 100
    const onMove = mv => {
      const newW = Math.max(50, startW + mv.clientX - startX)
      setColWidths(prev => ({ ...prev, [colId]: newW }))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    dragRef.current = onUp
  }, [colWidths])

  // Resize handle shown on right edge of each header cell
  const ResizeHandle = ({ colId }) => (
    <span
      onMouseDown={e => startResize(colId, e)}
      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 10, background: 'transparent' }}
      title="Drag to resize"
    />
  )

  useEffect(() => {
    fetch('/cogs-data.json').then(r => r.ok ? r.json() : {}).then(setCogsMap).catch(() => setCogsMap({}))
  }, [])

  const q = search.trim().toLowerCase()

  const mapRow = d => {
    const gross = d.rev || 0
    const excRev = d.excRev || 0
    const cancelRev = d.cancelRev || 0
    const rtoRev = d.rtoRev || 0
    const cirRev = d.cirRev || 0
    const exchRev = d.exchRev || 0
    const returnRev = d.returnRev || 0
    const totalReturnRev = cancelRev + rtoRev + cirRev + returnRev
    const gstRatio = gross > 0 ? (gross - excRev) / gross : 0
    const grossAfterReturns = gross - totalReturnRev
    const net = grossAfterReturns * (1 - gstRatio)
    return { gross, excRev, net, units: d.units || 0, totalReturnRev }
  }
  const pctOf = (n, d) => d > 0 ? (n / d * 100) : 0

  // Fallback COGS when no cogs-data.json entry: ASP (Gross Inc GST / units) <= 5000 → 40%, else 45%
  const fallbackCogs = (gross, units, net) => {
    if (!units || !gross) return 0
    const asp = gross / units
    return net * (asp <= 5000 ? 0.40 : 0.45)
  }

  // Aggregate per-product costs from all its SKUs.
  const costsForSkus = (cat, sc) => {
    const skus = skuData?.[cat]?.[sc] || {}
    let cogs = 0, netCovered = 0, anyCosted = false
    let logistics = 0, fulfilment = 0, paymentGw = 0, softwareFee = 0, anyCosts = false
    Object.entries(skus).forEach(([sku, d]) => {
      const entry = cogsMap?.[sku]
      const r = mapRow(d)
      if (entry && entry.cogs != null) {
        cogs += entry.cogs * r.units
      } else {
        // fallback: % of net rev based on ASP
        cogs += fallbackCogs(r.gross, r.units, r.net)
      }
      netCovered += r.net
      anyCosted = true
      const sc_ = skuCosts?.[sku]
      if (sc_) {
        logistics += sc_.logistics || 0
        fulfilment += sc_.fulfilment || 0
        paymentGw += sc_.paymentGw || 0
        softwareFee += sc_.softwareFee || 0
        anyCosts = true
      }
    })
    return { cogs, netCovered, anyCosted, logistics, fulfilment, paymentGw, softwareFee, anyCosts }
  }

  const allRows = []
  Object.entries(subCatData || {}).forEach(([cat, scMap]) => {
    Object.entries(scMap).forEach(([sc, d]) => {
      const r = mapRow(d)
      const spend = adSpendMap[sc] || 0
      const { cogs, netCovered, anyCosted, logistics, fulfilment, paymentGw, softwareFee, anyCosts } = (cogsMap || skuCosts) ? costsForSkus(cat, sc) : { cogs: 0, netCovered: 0, anyCosted: false, logistics: 0, fulfilment: 0, paymentGw: 0, softwareFee: 0, anyCosts: false }
      const gm = anyCosted ? netCovered - cogs : null
      const snd = anyCosts ? logistics + fulfilment + paymentGw + softwareFee : null
      const cm1 = anyCosted && anyCosts ? gm - snd : null
      const cm2 = cm1 != null && spend > 0 ? cm1 - spend : cm1 != null ? cm1 : null
      allRows.push({
        cat, sc, ...r, spend, cogs, netCovered, anyCosted,
        gm, logistics, fulfilment, paymentGw, softwareFee, anyCosts, snd, cm1, cm2,
        returnPct: pctOf(r.totalReturnRev, r.gross),
        spendPct: r.net > 0 ? (spend / r.net * 100) : 0,
        cm2Pct: r.net > 0 && cm2 != null ? (cm2 / r.net * 100) : 0,
      })
    })
  })
  const filteredRows = q ? allRows.filter(r => r.cat.toLowerCase().includes(q) || r.sc.toLowerCase().includes(q) || Object.keys(skuData?.[r.cat]?.[r.sc] || {}).some(sku => sku.toLowerCase().includes(q))) : allRows

  const getters = {
    cat: r => r.cat, sc: r => r.sc, gross: r => r.gross, excRev: r => r.excRev, units: r => r.units,
    returnPct: r => r.returnPct, net: r => r.net, spend: r => r.spend, spendPct: r => r.spendPct,
    cogs: r => r.anyCosted ? r.cogs : -Infinity, gm: r => r.gm ?? -Infinity,
    logistics: r => r.anyCosts ? r.logistics : -Infinity,
    fulfilment: r => r.anyCosts ? r.fulfilment : -Infinity,
    paymentGw: r => r.anyCosts ? r.paymentGw : -Infinity,
    softwareFee: r => r.anyCosts ? r.softwareFee : -Infinity,
    snd: r => r.snd ?? -Infinity,
    cm1: r => r.cm1 ?? -Infinity,
    cm2: r => r.cm2 ?? -Infinity,
  }
  const rows = table.sortRows(filteredRows, getters)

  const tot = filteredRows.reduce((s, r) => ({
    gross: s.gross + r.gross, excRev: s.excRev + r.excRev, net: s.net + r.net, units: s.units + r.units,
    totalReturnRev: s.totalReturnRev + r.totalReturnRev, spend: s.spend + r.spend,
    cogs: s.cogs + (r.anyCosted ? r.cogs : 0), netCovered: s.netCovered + (r.anyCosted ? r.netCovered : 0), anyCosted: s.anyCosted || r.anyCosted,
    logistics: s.logistics + (r.anyCosts ? r.logistics : 0),
    fulfilment: s.fulfilment + (r.anyCosts ? r.fulfilment : 0),
    paymentGw: s.paymentGw + (r.anyCosts ? r.paymentGw : 0),
    softwareFee: s.softwareFee + (r.anyCosts ? r.softwareFee : 0),
    anyCosts: s.anyCosts || r.anyCosts,
    cm1: s.cm1 + (r.cm1 != null ? r.cm1 : 0), anyCm1: s.anyCm1 || r.cm1 != null,
    cm2: s.cm2 + (r.cm2 != null ? r.cm2 : 0), anyCm2: s.anyCm2 || r.cm2 != null,
  }), { gross: 0, excRev: 0, net: 0, units: 0, totalReturnRev: 0, spend: 0, cogs: 0, netCovered: 0, anyCosted: false, logistics: 0, fulfilment: 0, paymentGw: 0, softwareFee: 0, anyCosts: false, cm1: 0, anyCm1: false, cm2: 0, anyCm2: false })
  const totSnd = tot.anyCosts ? tot.logistics + tot.fulfilment + tot.paymentGw + tot.softwareFee : null
  const totReturnPct = pctOf(tot.totalReturnRev, tot.gross)
  const totSpendPct = tot.net > 0 ? (tot.spend / tot.net * 100) : 0
  const totGm = tot.anyCosted ? tot.netCovered - tot.cogs : null

  const thStyle = { fontSize: 9.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4, padding: '6px 7px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: `1.5px solid ${C.border}` }
  const thStyleL = { ...thStyle, textAlign: 'left' }
  const tdStyle = { fontSize: 11, padding: '4px 7px', textAlign: 'right', color: C.t1, borderBottom: `1px solid ${C.border}`, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const tdStyleL = { ...tdStyle, textAlign: 'left', fontFamily: 'inherit' }
  // Sticky left column styles — Category fixed at 0, Product fixed at colWidths.cat px
  const catW = colWidths.cat, scW = colWidths.sc
  const stickyCat = { position: 'sticky', left: 0, background: C.card, zIndex: 1, width: catW, minWidth: catW, maxWidth: catW }
  const stickyProd = { position: 'sticky', left: catW, background: C.bg, zIndex: 1, width: scW, minWidth: scW, maxWidth: scW, boxShadow: '2px 0 4px rgba(0,0,0,0.06)' }
  const w = id => ({ width: colWidths[id], minWidth: colWidths[id], maxWidth: colWidths[id] })
  const totalTdStyle = { ...tdStyle, padding: '6px 7px', fontWeight: 700, color: C.t1, borderBottom: 'none', position: 'sticky', bottom: 0, background: C.card, borderTop: `1.5px solid ${C.border}`, zIndex: 1 }
  const pendingCell = <span style={{ color: C.t3 }} title="Pending data — see PNL_TAB_ROADMAP.md">—</span>
  const noCostCell = <span style={{ color: C.t3 }} title="No cost entry for this SKU/product yet">—</span>
  const pctCellOf = (val, netCoveredVal) => netCoveredVal > 0 ? `${pctOf(val, netCoveredVal).toFixed(1)}%` : noCostCell
  const valCellOf = val => val != null ? fmt(val) : noCostCell

  const handleExport = () => {
    const csvRows = rows.flatMap(r => {
      const main = {
        Category: r.cat, Product: r.sc,
        'Gross Rev (Inc GST)': Math.round(r.gross), 'Gross Rev (Ex GST)': Math.round(r.excRev),
        'Returns %': +r.returnPct.toFixed(2), 'Net Revenue': Math.round(r.net), Units: r.units,
        'COGS %': r.anyCosted && r.net > 0 ? +pctOf(r.cogs, r.net).toFixed(2) : '',
        'GM %': r.gm != null && r.net > 0 ? +pctOf(r.gm, r.net).toFixed(2) : '',
        'SND %': r.snd != null && r.net > 0 ? +pctOf(r.snd, r.net).toFixed(2) : '',
        'CM1 %': r.cm1 != null && r.net > 0 ? +pctOf(r.cm1, r.net).toFixed(2) : '',
        'Marketing Spend': Math.round(r.spend), 'Spend %': +r.spendPct.toFixed(2),
        CM2: r.cm2 != null ? Math.round(r.cm2) : '', 'CM2 %': r.cm2 != null && r.net > 0 ? +pctOf(r.cm2, r.net).toFixed(2) : '',
      }
      const csvSkuTotalGross = Object.values(skuData?.[r.cat]?.[r.sc] || {}).reduce((s, d) => s + (mapRow(d).gross || 0), 0)
      const skuRows = Object.entries(skuData?.[r.cat]?.[r.sc] || {}).map(([sku, d]) => {
        const sk = mapRow(d)
        const entry = cogsMap?.[sku]
        const costed = entry && entry.cogs != null
        const skCogs = costed ? entry.cogs * sk.units : fallbackCogs(sk.gross, sk.units, sk.net)
        const skGm = sk.net - skCogs
        const skC = skuCosts?.[sku]
        const skSndCsv = skC ? skC.logistics + skC.fulfilment + skC.paymentGw + skC.softwareFee : null
        const skCm1 = skSndCsv != null ? skGm - skSndCsv : null
        const skSpendCsv = r.spend > 0 && csvSkuTotalGross > 0 ? r.spend * (sk.gross / csvSkuTotalGross) : 0
        return {
          Category: r.cat, Product: `↳ ${sku}`,
          'Gross Rev (Inc GST)': Math.round(sk.gross), 'Gross Rev (Ex GST)': Math.round(sk.excRev),
          'Returns %': +pctOf(sk.totalReturnRev, sk.gross).toFixed(2), 'Net Revenue': Math.round(sk.net), Units: sk.units,
          'COGS %': sk.net > 0 ? +pctOf(skCogs, sk.net).toFixed(2) : '',
          'GM %': sk.net > 0 ? +pctOf(skGm, sk.net).toFixed(2) : '',
          'SND %': skSndCsv != null && sk.net > 0 ? +pctOf(skSndCsv, sk.net).toFixed(2) : '',
          'CM1 %': skCm1 != null && sk.net > 0 ? +pctOf(skCm1, sk.net).toFixed(2) : '',
          'Marketing Spend': skSpendCsv > 0 ? Math.round(skSpendCsv) : '', 'Spend %': skSpendCsv > 0 && sk.net > 0 ? +pctOf(skSpendCsv, sk.net).toFixed(2) : '',
          CM2: (() => { const v = skCm1 != null && skSpendCsv > 0 ? skCm1 - skSpendCsv : skCm1; return v != null ? Math.round(v) : '' })(),
          'CM2 %': (() => { const v = skCm1 != null && skSpendCsv > 0 ? skCm1 - skSpendCsv : skCm1; return v != null && sk.net > 0 ? +pctOf(v, sk.net).toFixed(2) : '' })(),
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
          <button onClick={handleExport} style={{ fontSize: 10, color: C.t2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>⭳ Export</button>
        </div>
      </div>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 560 }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: Object.values(colWidths).reduce((a, b) => a + b, 0) }}>
          <thead>
            <tr style={{ background: C.bg }}>
              <Th label="Category" sortKey="cat" style={{ ...thStyleL, ...stickyCat, top: 0, zIndex: 3, position: 'sticky', overflow: 'hidden' }} align="left"><ResizeHandle colId="cat" /></Th>
              <Th label="Product" sortKey="sc" style={{ ...thStyleL, ...stickyProd, top: 0, zIndex: 3, position: 'sticky', overflow: 'hidden' }} align="left"><ResizeHandle colId="sc" /></Th>
              <Th label="Gross (Inc GST)" sortKey="gross" style={{ ...thStyle, ...w('gross'), position: 'sticky', top: 0, background: C.bg, zIndex: 1, overflow: 'hidden' }}><ResizeHandle colId="gross" /></Th>
              <Th label="Gross (Ex GST)" sortKey="excRev" style={{ ...thStyle, ...w('excRev'), position: 'sticky', top: 0, background: C.bg, zIndex: 1, overflow: 'hidden' }}><ResizeHandle colId="excRev" /></Th>
              <Th label="Units" sortKey="units" style={{ ...thStyle, ...w('units'), position: 'sticky', top: 0, background: C.bg, zIndex: 1, overflow: 'hidden' }}><ResizeHandle colId="units" /></Th>
              <Th label="Returns %" sortKey="returnPct" style={{ ...thStyle, ...w('returnPct'), position: 'sticky', top: 0, background: C.bg, zIndex: 1, overflow: 'hidden' }}><ResizeHandle colId="returnPct" /></Th>
              <Th label="Net Rev" sortKey="net" style={{ ...thStyle, ...w('net'), position: 'sticky', top: 0, background: C.bg, zIndex: 1, overflow: 'hidden' }}><ResizeHandle colId="net" /></Th>
              <th style={{ ...thStyle, ...w('cogsPct'), position: 'sticky', top: 0, background: C.bg, zIndex: 1, cursor: 'default', overflow: 'hidden' }}>COGS %<ResizeHandle colId="cogsPct" /></th>
              <th style={{ ...thStyle, ...w('gmPct'), position: 'sticky', top: 0, background: C.bg, zIndex: 1, cursor: 'default', overflow: 'hidden' }}>GM %<ResizeHandle colId="gmPct" /></th>
              <th style={{ ...thStyle, ...w('sndPct'), position: 'sticky', top: 0, background: C.bg, zIndex: 1, cursor: 'default', overflow: 'hidden' }}>SND %<ResizeHandle colId="sndPct" /></th>
              <th style={{ ...thStyle, ...w('cm1Pct'), position: 'sticky', top: 0, background: C.bg, zIndex: 1, cursor: 'default', overflow: 'hidden' }}>CM1 %<ResizeHandle colId="cm1Pct" /></th>
              <Th label="Mktg Spend" sortKey="spend" style={{ ...thStyle, ...w('spend'), position: 'sticky', top: 0, background: C.bg, zIndex: 1, overflow: 'hidden' }}><ResizeHandle colId="spend" /></Th>
              <Th label="Spend %" sortKey="spendPct" style={{ ...thStyle, ...w('spendPct'), position: 'sticky', top: 0, background: C.bg, zIndex: 1, overflow: 'hidden' }}><ResizeHandle colId="spendPct" /></Th>
              <Th label="CM2" sortKey="cm2" style={{ ...thStyle, ...w('cm2'), position: 'sticky', top: 0, background: C.bg, zIndex: 1, overflow: 'hidden' }}><ResizeHandle colId="cm2" /></Th>
              <th style={{ ...thStyle, ...w('cm2Pct'), position: 'sticky', top: 0, background: C.bg, zIndex: 1, cursor: 'default', overflow: 'hidden' }}>CM2 %<ResizeHandle colId="cm2Pct" /></th>
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
                    onMouseEnter={e => { e.currentTarget.style.background = '#FFFBE6'; Array.from(e.currentTarget.querySelectorAll('td[data-sticky]')).forEach(td => td.style.background = '#FFFBE6') }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; Array.from(e.currentTarget.querySelectorAll('td[data-sticky]')).forEach(td => td.style.background = C.card) }}>
                    <td data-sticky="1" style={{ ...tdStyleL, ...stickyCat }}>{r.cat}</td>
                    <td data-sticky="1" style={{ ...tdStyleL, ...stickyProd }}>
                      <span onClick={() => hasSkus && toggleSku(skuKey)} style={{ cursor: hasSkus ? 'pointer' : 'default', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {hasSkus && <span style={{ fontSize: 9, color: C.t3, display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>}
                        {r.sc}
                      </span>
                    </td>
                    <td style={tdStyle}>{fmt(r.gross)}</td>
                    <td style={tdStyle}>{fmt(r.excRev)}</td>
                    <td style={tdStyle}>{fmtN(r.units)}</td>
                    <td style={tdStyle}>{r.returnPct > 0 ? <span style={{ color: r.returnPct > 20 ? '#B91C1C' : 'inherit' }}>{r.returnPct.toFixed(2)}%</span> : <span style={{ color: C.t3 }}>—</span>}</td>
                    <td style={tdStyle}>{fmt(r.net)}</td>
                    <td style={tdStyle}>{r.anyCosted && r.net > 0 ? `${pctOf(r.cogs, r.net).toFixed(1)}%` : noCostCell}</td>
                    <td style={tdStyle}>{r.gm != null && r.net > 0 ? `${pctOf(r.gm, r.net).toFixed(1)}%` : noCostCell}</td>
                    <td style={tdStyle}>{r.snd != null && r.net > 0 ? `${pctOf(r.snd, r.net).toFixed(1)}%` : noCostCell}</td>
                    <td style={tdStyle}>{r.cm1 != null && r.net > 0 ? `${pctOf(r.cm1, r.net).toFixed(1)}%` : noCostCell}</td>
                    <td style={tdStyle}>{r.spend > 0 ? fmt(r.spend) : <span style={{ color: C.t3 }}>—</span>}</td>
                    <td style={tdStyle}>{r.spend > 0 ? `${r.spendPct.toFixed(2)}%` : <span style={{ color: C.t3 }}>—</span>}</td>
                    <td style={tdStyle}>{r.cm2 != null ? fmt(r.cm2) : noCostCell}</td>
                    <td style={tdStyle}>{r.cm2 != null && r.net > 0 ? `${pctOf(r.cm2, r.net).toFixed(1)}%` : noCostCell}</td>
                  </tr>
                  {isOpen && skus.map(sk => {
                    const entry = cogsMap?.[sk.sku]
                    const costed = entry && entry.cogs != null
                    const skCogs = costed ? entry.cogs * sk.units : fallbackCogs(sk.gross, sk.units, sk.net)
                    const skGm = sk.net - skCogs
                    const skC = skuCosts?.[sk.sku]
                    const skSnd = skC ? skC.logistics + skC.fulfilment + skC.paymentGw + skC.softwareFee : null
                    const skCm1 = skSnd != null ? skGm - skSnd : null
                    const skSpend = r.spend > 0 && scTotalGross > 0 ? r.spend * (sk.gross / scTotalGross) : 0
                    return (
                      <tr key={sk.sku} style={{ background: C.bg, cursor: 'default' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#FFFBE6'; Array.from(e.currentTarget.querySelectorAll('td[data-sticky]')).forEach(td => td.style.background = '#FFFBE6') }}
                        onMouseLeave={e => { e.currentTarget.style.background = C.card; Array.from(e.currentTarget.querySelectorAll('td[data-sticky]')).forEach(td => td.style.background = C.card) }}>
                        <td data-sticky="1" style={{ ...tdStyleL, ...stickyCat, borderBottom: `1px solid ${C.border}` }}></td>
                        <td data-sticky="1" style={{ ...tdStyleL, ...stickyProd, borderBottom: `1px solid ${C.border}`, fontFamily: 'var(--mono)', fontSize: 11, color: C.t2, paddingLeft: 22 }}>└ {sk.sku}</td>
                        <td style={{ ...tdStyle, fontSize: 11 }}>{fmt(sk.gross)}</td>
                        <td style={{ ...tdStyle, fontSize: 11 }}>{fmt(sk.excRev)}</td>
                        <td style={{ ...tdStyle, fontSize: 11 }}>{fmtN(sk.units)}</td>
                        <td style={{ ...tdStyle, fontSize: 11 }}>{pctOf(sk.totalReturnRev, sk.gross) > 0 ? `${pctOf(sk.totalReturnRev, sk.gross).toFixed(2)}%` : <span style={{ color: C.t3 }}>—</span>}</td>
                        <td style={{ ...tdStyle, fontSize: 11 }}>{fmt(sk.net)}</td>
                        <td style={{ ...tdStyle, fontSize: 11 }}>{sk.net > 0 ? `${pctOf(skCogs, sk.net).toFixed(1)}%` : noCostCell}</td>
                        <td style={{ ...tdStyle, fontSize: 11 }}>{sk.net > 0 ? `${pctOf(skGm, sk.net).toFixed(1)}%` : noCostCell}</td>
                        <td style={{ ...tdStyle, fontSize: 11 }}>{skSnd != null && sk.net > 0 ? `${pctOf(skSnd, sk.net).toFixed(1)}%` : noCostCell}</td>
                        <td style={{ ...tdStyle, fontSize: 11 }}>{skCm1 != null && sk.net > 0 ? `${pctOf(skCm1, sk.net).toFixed(1)}%` : noCostCell}</td>
                        <td style={{ ...tdStyle, fontSize: 11 }}>{skSpend > 0 ? fmt(skSpend) : <span style={{ color: C.t3 }}>—</span>}</td>
                        <td style={{ ...tdStyle, fontSize: 11 }}>{skSpend > 0 && sk.net > 0 ? `${pctOf(skSpend, sk.net).toFixed(2)}%` : <span style={{ color: C.t3 }}>—</span>}</td>
                        {(() => { const skCm2 = skCm1 != null && skSpend > 0 ? skCm1 - skSpend : skCm1; return (<><td style={{ ...tdStyle, fontSize: 11 }}>{skCm2 != null ? fmt(skCm2) : noCostCell}</td><td style={{ ...tdStyle, fontSize: 11 }}>{skCm2 != null && sk.net > 0 ? `${pctOf(skCm2, sk.net).toFixed(1)}%` : noCostCell}</td></>) })()}
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...totalTdStyle, ...stickyCat, textAlign: 'left', zIndex: 3 }}>Total</td>
              <td style={{ ...totalTdStyle, ...stickyProd, textAlign: 'left', zIndex: 3 }}></td>
              <td style={totalTdStyle}>{fmt(tot.gross)}</td>
              <td style={totalTdStyle}>{fmt(tot.excRev)}</td>
              <td style={totalTdStyle}>{fmtN(tot.units)}</td>
              <td style={totalTdStyle}>{totReturnPct > 0 ? `${totReturnPct.toFixed(2)}%` : '—'}</td>
              <td style={totalTdStyle}>{fmt(tot.net)}</td>
              <td style={totalTdStyle}>{tot.anyCosted && tot.net > 0 ? `${pctOf(tot.cogs, tot.net).toFixed(1)}%` : noCostCell}</td>
              <td style={totalTdStyle}>{totGm != null && tot.net > 0 ? `${pctOf(totGm, tot.net).toFixed(1)}%` : noCostCell}</td>
              <td style={totalTdStyle}>{totSnd != null && tot.net > 0 ? `${pctOf(totSnd, tot.net).toFixed(1)}%` : noCostCell}</td>
              <td style={totalTdStyle}>{tot.anyCm1 && tot.net > 0 ? `${pctOf(tot.cm1, tot.net).toFixed(1)}%` : noCostCell}</td>
              <td style={totalTdStyle}>{tot.spend > 0 ? fmt(tot.spend) : '—'}</td>
              <td style={totalTdStyle}>{tot.spend > 0 ? `${totSpendPct.toFixed(2)}%` : '—'}</td>
              <td style={totalTdStyle}>{tot.anyCm2 ? fmt(tot.cm2) : noCostCell}</td>
              <td style={totalTdStyle}>{tot.anyCm2 && tot.net > 0 ? `${pctOf(tot.cm2, tot.net).toFixed(1)}%` : noCostCell}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
