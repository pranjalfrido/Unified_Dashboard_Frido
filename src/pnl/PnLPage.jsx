import { useState, useMemo, useEffect } from 'react'
import PnLChannelTab from './PnLChannelTab.jsx'

// One subtab per Sales-tab channel + a consolidated "All Channels" tab — same bar, same visual
// chrome as SalesPage. Every channel's Category→Product(→SKU) map is rebuilt here the same way
// each existing Sales channel tab already does it (small local pick()/aggregation transforms
// reading straight off `data`), so this needs no new API endpoint — 100% reuse of /api/bq's
// existing response shape. See PNL_TAB_ROADMAP.md for the COGS/SnD prerequisites still pending;
// the Financial View table (PnLFinancialTable.jsx) renders those columns as "—" until then.
const PNL_TABS = [
  { id: 'all', label: 'All Channels' },
  { id: 'shopify', label: 'D2C', logo: '/logo-shopify.png' },
  { id: 'ebo', label: 'EBO', logo: '/ebo.png' },
  { id: 'amazon', label: 'Amazon', logo: '/logo-amazon.png' },
  { id: 'flipkart', label: 'Flipkart', logo: '/logo-flipkart.png' },
  { id: 'blinkit', label: 'Blinkit', logo: '/logo-blinkit.png' },
  { id: 'cred', label: 'CRED', logo: '/logo-cred.png' },
  { id: 'firstcry', label: 'Firstcry', logo: '/logo-firstcry.png' },
  { id: 'instamart', label: 'Instamart', logo: '/logo-instamart.png' },
  { id: 'zepto', label: 'Zepto', logo: '/logo-zepto.png' },
  { id: 'myntra', label: 'Myntra', logo: '/logo-myntra.png' },
  { id: 'offline', label: 'Offline Sales', logo: '/offline-sales.png' },
]

// Same shared per-row pick used by every existing FlatCategoryProductMatrix caller — kept
// local (not imported) since it's a 2-line pure function, not worth a shared-module trip.
const pick = v => ({ rev: v.rev || 0, excRev: v.excRev || 0, units: v.units || v.aspUnits || 0, returnUnits: v.returnUnits || 0, cancelRev: v.cancelRev || 0, codCancelRev: v.codCancelRev || 0, rtoRev: v.rtoRev || 0, cirRev: v.cirRev || 0, exchRev: v.exchRev || 0, returnRev: v.returnRev || 0 })

function netOf(subCatData) {
  let gross = 0, excRev = 0, net = 0, returnRev = 0, units = 0
  Object.values(subCatData || {}).forEach(scMap => {
    Object.values(scMap).forEach(d => {
      const totalReturn = ((d.cancelRev || 0) - (d.codCancelRev || 0)) + (d.rtoRev || 0) + (d.cirRev || 0) + (d.returnRev || 0)
      const gstRatio = d.rev > 0 ? (d.rev - d.excRev) / d.rev : 0
      gross += d.rev || 0
      excRev += d.excRev || 0
      units += d.units || 0
      returnRev += totalReturn
      net += (d.rev - totalReturn) * (1 - gstRatio)
    })
  })
  return { gross, excRev, net, units, returnRev }
}

// SnD rates — {weightGm, forward, rto, reverse, fulfilment}, sorted ascending by weightGm.
let sndRatesPromise = null
function loadSndRates() {
  if (!sndRatesPromise) sndRatesPromise = fetch('/snd-rates.json').then(r => r.ok ? r.json() : []).catch(() => [])
  return sndRatesPromise
}
function rateForSlab(slabs, weightSlab) {
  if (!slabs || !slabs.length || weightSlab == null) return null
  return slabs.find(s => s.weightGm === weightSlab) || null
}

// Flat per-SKU COGS rate sheet (public/cogs-data.json), same file PnLFinancialTable.jsx fetches
// for the whole-range table — fetched again here (browser HTTP cache makes this free) so the
// day-wise trend chart can compute its own GM%/CM1% without threading cogsMap down as a prop.
let cogsMapPromise = null
function loadCogsMap() {
  if (!cogsMapPromise) cogsMapPromise = fetch('/cogs-data.json').then(r => r.ok ? r.json() : {}).catch(() => ({}))
  return cogsMapPromise
}

export default function PnLPage({ data, filters, setFilters }) {
  const [activeTab, setActiveTab] = useState('all')
  const [amzChannelView, setAmzChannelView] = useState('all') // 'all' | 'sc' | 'vc'
  const [offlineSub, setOfflineSub] = useState('all') // 'all' | 'b2b' | 'Stockist' | 'MTGT'
  const [d2cRegion, setD2cRegion] = useState('india') // 'india' | 'international'
  const [d2cSubCh, setD2cSubCh] = useState('all') // 'all' | 'MyFrido' | 'Mobility'
  const [sndRates, setSndRates] = useState(null)
  const [cogsMap, setCogsMap] = useState(null)

  useEffect(() => { loadSndRates().then(setSndRates) }, [])
  useEffect(() => { loadCogsMap().then(setCogsMap) }, [])

  // Per-SKU D2C cost breakdown: logistics, fulfilment, payment gateway, software fee.
  // Logistics cost depends on Order_Status; fulfilment applies to all orders incl. cancelled.
  // Payment gateway = 1.1% of gross_inc_gst (D2C only). Software fee = ₹15 × units.
  // Filtered by d2cRegion/d2cSubCh so SND matches the revenue toggle selection.
  const shSkuCosts = useMemo(() => {
    const rows = data?.shopify?.skuCostRows
    if (!sndRates || !rows?.length) return {}
    const bySku = {}
    rows.forEach(row => {
      const { sku, category, orderStatus, weightSlab, lineCount, totalQty, grossIncGst } = row
      if (!sku) return
      if (d2cSubCh === 'Mobility' && row.subChannel !== 'mobility') return
      if (d2cSubCh === 'MyFrido' && row.subChannel !== 'myfrido') return
      // Fallback: missing weight → treat as 2kg slab
      const effectiveSlab = weightSlab != null ? weightSlab : 2000
      const rate = rateForSlab(sndRates, effectiveSlab)
      // Logistics & fulfilment apply once per line item (lineCount), not per unit
      let logistics = 0
      let fulfilment = rate ? rate.fulfilment * lineCount : 0
      if (rate) {
        const st = (orderStatus || '').toLowerCase()
        if (st === 'cancelled') {
          logistics = 0
        } else if (st === 'rto') {
          logistics = (rate.forward + rate.rto) * lineCount
        } else if (st === 'cir' || st === 'exchange' || st === 'return') {
          logistics = (rate.forward + rate.reverse) * lineCount
        } else {
          logistics = rate.forward * lineCount
        }
      }
      const paymentGw = grossIncGst * 0.011
      const softwareFee = totalQty * 15
      if (!bySku[sku]) bySku[sku] = { logistics: 0, fulfilment: 0, paymentGw: 0, softwareFee: 0 }
      bySku[sku].logistics += logistics
      bySku[sku].fulfilment += fulfilment
      bySku[sku].paymentGw += paymentGw
      bySku[sku].softwareFee += softwareFee
    })
    return bySku
  }, [sndRates, data, d2cSubCh])

  // D2C S&D summed to the same {sku: totalCost} shape the Amazon-architecture `sndBySku` prop
  // expects (PnLFinancialTable's costsForSkus() only ever consumes a single combined number per
  // SKU) — the 4-component breakdown (logistics/fulfilment/paymentGw/softwareFee) itself has no
  // other consumer (no cost-breakdown tooltip/export column exists), so summing here is lossless
  // for everything downstream while still keeping shSkuCosts itself available if a future
  // breakdown view is added.
  const shSndBySku = useMemo(() => {
    const out = {}
    Object.entries(shSkuCosts).forEach(([sku, c]) => {
      out[sku] = (c.logistics || 0) + (c.fulfilment || 0) + (c.paymentGw || 0) + (c.softwareFee || 0)
    })
    return out
  }, [shSkuCosts])

  // Amazon Seller Central S&D: real per-MasterSKU cost from the settlement report (see
  // amzSCSettlement in api/bq.js) — no rate-card estimate needed, unlike Shopify. Only
  // meaningful for the "Seller Central" view; Vendor Central has no settlement report, so this
  // is intentionally not applied when amzChannelView is 'all' or 'vc' (would silently attribute
  // an SC-only cost to VC's share of a combined SKU row).
  const amzSndBySku = data?.amzSC?.sndBySku
  // Amazon Vendor Central S&D: margin-slab based (VC has no settlement report), see
  // amzVCMatrix.sndBySku in api/bq.js — totally different mechanism from SC's real settlement
  // cost, per user directive that SC/VC S&D need separate approaches. Only meaningful for the
  // "Vendor Central" view, same isolation logic as amzSndBySku above.
  const amzVCSndBySku = data?.amzVCMatrix?.sndBySku
  // Amazon "All" (SC+VC combined) S&D: sum of both channels' own SnD per SKU — a SKU sold
  // through BOTH SC and VC gets both its real settlement cost AND its VC margin-based cost
  // added together, matching how gross/units/etc already combine SC+VC on this view (see
  // pickAmz below). Without this, "All" would show blank SnD/CM1 and marketing-spend/CM2
  // (added here) would have nothing to subtract from.
  const amzAllSndBySku = useMemo(() => {
    const merged = {}
    Object.entries(amzSndBySku || {}).forEach(([sku, v]) => { merged[sku] = (merged[sku] || 0) + v })
    Object.entries(amzVCSndBySku || {}).forEach(([sku, v]) => { merged[sku] = (merged[sku] || 0) + v })
    return merged
  }, [amzSndBySku, amzVCSndBySku])
  // Amazon marketing spend by SubCategory — reused verbatim from the Ads tab's own "By Product"
  // breakdown (data.ads.categoryBreakdown.productRows, platform === 'Amazon') so the PnL tab's
  // Marketing Spend/CM2 numbers are always identical to what the Ads tab already shows, never a
  // separately-derived figure that could silently drift from it.
  // productRows undercounts vs. the true per-Category total (categoryRows/adsTotals) by design —
  // it's built by iterating SALES data and looking up matching ad spend, so any ad spend whose
  // target doesn't fully attribute down to a SubCategory with matching sales in this exact range
  // falls through. Rescale each Category's SubCategory spend up so it sums EXACTLY to that
  // Category's real total (categoryRows), so the PnL total always ties out to the Ads tab's
  // headline Total Spend number — never silently short by the unattributed remainder.
  const amzAdSpendMap = useMemo(() => {
    const productRows = (data?.ads?.categoryBreakdown?.productRows || []).filter(r => r.platform === 'Amazon')
    const categoryRows = (data?.ads?.categoryBreakdown?.categoryRows || []).filter(r => r.platform === 'Amazon')

    const productSpendByCat = {}
    productRows.forEach(r => {
      const cat = r.category || 'Others'
      productSpendByCat[cat] = (productSpendByCat[cat] || 0) + (r.spend || 0)
    })
    const catTotalSpend = {}
    categoryRows.forEach(r => { catTotalSpend[r.category || 'Others'] = r.spend || 0 })

    const map = {}
    productRows.forEach(r => {
      const cat = r.category || 'Others'
      const key = r.subCategory || 'Others'
      const catProductSum = productSpendByCat[cat] || 0
      const catTrueTotal = catTotalSpend[cat]
      // Scale factor: if this Category's true total is known and its product-level sum is
      // short of it, scale every SubCategory's spend up proportionally so they sum exactly to
      // the true total. Falls back to 1 (no scaling) if either side is zero/unknown.
      const scale = catProductSum > 0 && catTrueTotal != null ? catTrueTotal / catProductSum : 1
      map[key] = (map[key] || 0) + (r.spend || 0) * scale
    })
    return map
  }, [data])

  const channelData = useMemo(() => {
    if (!data) return null

    // ── All Channels (consolidated) ──
    const allSubCatData = {}
    Object.entries(data.subCatMap || {}).forEach(([k, v]) => {
      const [cat, sc] = k.split('::')
      if (!allSubCatData[cat]) allSubCatData[cat] = {}
      allSubCatData[cat][sc || 'Others'] = pick(v)
    })
    const allSkuData = {}
    ;(data.skuRows || []).forEach(x => {
      const cat = x.category || 'Others', sc = x.subCategory || 'Others', sku = x.sku
      if (!sku) return
      if (!allSkuData[cat]) allSkuData[cat] = {}
      if (!allSkuData[cat][sc]) allSkuData[cat][sc] = {}
      if (!allSkuData[cat][sc][sku]) allSkuData[cat][sc][sku] = { rev: 0, units: 0 }
      allSkuData[cat][sc][sku].rev += x.rev || 0
      allSkuData[cat][sc][sku].units += x.units || 0
    })

    // ── D2C / Shopify — filtered by region + sub-channel toggles ──
    const sh = data.shopify || {}
    // Use salesCategoryOrders rows (have sub_channel) for D2C when filtering is active
    const allSalesCatRows = data.pnlSalesRows || [] // rows from salesCategoryOrders with sub_channel
    const shSalesCatRows = allSalesCatRows.filter(r => r.platform === 'Shopify')
    const filterD2CRow = r => {
      const sc = (r.sub_channel || '').toLowerCase()
      if (d2cRegion === 'india' && sc === 'shopify international') return false
      if (d2cRegion === 'international' && sc !== 'shopify international') return false
      if (d2cSubCh === 'Mobility') return r.sub_channel === 'Mobility'
      if (d2cSubCh === 'MyFrido') return r.sub_channel === 'MyFrido'
      return true
    }
    const shSubCatData = {}
    if (shSalesCatRows.length > 0) {
      shSalesCatRows.filter(filterD2CRow).forEach(r => {
        const cat = r.category || 'Others', sc = r.sub_category || 'Others'
        if (!shSubCatData[cat]) shSubCatData[cat] = {}
        if (!shSubCatData[cat][sc]) shSubCatData[cat][sc] = { rev: 0, excRev: 0, units: 0, returnUnits: 0, cancelRev: 0, codCancelRev: 0, rtoRev: 0, cirRev: 0, returnRev: 0 }
        shSubCatData[cat][sc].rev += parseFloat(r.gross_revenue) || 0
        shSubCatData[cat][sc].excRev += parseFloat(r.revenue) || 0
        shSubCatData[cat][sc].units = (shSubCatData[cat][sc].units || 0) + (parseInt(r.units) || 0)
        shSubCatData[cat][sc].returnUnits = (shSubCatData[cat][sc].returnUnits || 0) + (parseInt(r.return_units) || 0)
        shSubCatData[cat][sc].cancelRev += parseFloat(r.cancel_rev) || 0
        shSubCatData[cat][sc].codCancelRev += parseFloat(r.cod_cancel_rev) || 0
        shSubCatData[cat][sc].rtoRev += parseFloat(r.return_rev) || 0
        shSubCatData[cat][sc].cirRev += parseFloat(r.cir_rev) || 0
      })
      Object.keys(shSubCatData).forEach(cat => Object.keys(shSubCatData[cat]).forEach(sc => { shSubCatData[cat][sc] = pick(shSubCatData[cat][sc]) }))
    } else {
      // fallback to pre-aggregated shopify subCatMap (no sub-channel filtering)
      Object.entries(sh.subCatMap || {}).forEach(([k, v]) => {
        const [cat, sc] = k.split('::')
        if (!shSubCatData[cat]) shSubCatData[cat] = {}
        shSubCatData[cat][sc || 'Others'] = pick(v)
      })
    }
    const shSkuData = {}
    const subChKey = d2cSubCh === 'MyFrido' ? 'myfrido' : d2cSubCh === 'Mobility' ? 'mobility' : null
    Object.entries(sh.skuMap || {}).forEach(([cat, scMap]) => {
      shSkuData[cat] = {}
      Object.entries(scMap).forEach(([sc, skMap]) => {
        shSkuData[cat][sc] = {}
        Object.entries(skMap).forEach(([sku, v]) => {
          const rows = v.subChannelRows || {}
          const keys = subChKey
            ? (rows[subChKey] ? [subChKey] : [])
            : Object.keys(rows).filter(k => k !== 'shopify international')
          if (keys.length === 0) return
          const agg = { rev: 0, excRev: 0, units: 0, returnUnits: 0, cancelRev: 0, codCancelRev: 0, rtoRev: 0, cirRev: 0, exchRev: 0, returnRev: 0 }
          keys.forEach(k => { const r = rows[k]; Object.keys(agg).forEach(f => { agg[f] = (agg[f] || 0) + (r[f] || 0) }) })
          shSkuData[cat][sc][sku] = pick(agg)
        })
      })
    })

    // ── EBO ──
    const ebo = data.ebo || {}
    const eboSubCatData = {}
    Object.entries(ebo.subCatMap || {}).forEach(([k, v]) => {
      const [cat, sc] = k.split('::')
      if (!eboSubCatData[cat]) eboSubCatData[cat] = {}
      eboSubCatData[cat][sc || 'Others'] = pick(v)
    })
    const eboSkuData = {}
    Object.entries(ebo.skuMap || {}).forEach(([cat, scMap]) => {
      eboSkuData[cat] = {}
      Object.entries(scMap).forEach(([sc, skMap]) => {
        eboSkuData[cat][sc] = {}
        Object.entries(skMap).forEach(([sku, v]) => { eboSkuData[cat][sc][sku] = pick(v) })
      })
    })

    // ── Amazon (SC + VC combined, filtered by amzChannelView) ──
    const amzSC = data.amzSC || {}
    const amzVCMatrix = data.amzVCMatrix || {}
    const showSC = amzChannelView !== 'vc'
    const showVC = amzChannelView !== 'sc'
    const pickAmz = (scChData, vc) => {
      const r = {}
      ;['rev', 'excRev', 'units', 'returnedUnits', 'cancelRev', 'rtoRev', 'cirRev', 'exchRev', 'returnRev'].forEach(k => {
        r[k] = (showSC ? (scChData?.FBA?.[k] || 0) + (scChData?.MFN?.[k] || 0) : 0) + (showVC ? (vc?.[k] || 0) : 0)
      })
      return r
    }
    // Key-space for category/subcategory/SKU iteration must itself be scoped to the selected
    // view — 'sc' should only ever produce rows that exist in SC's own data, never a phantom
    // zero-value row whose only reason for existing is that the SKU/category appears in VC.
    const allScSub = amzSC.subCatChannel || {}
    const allVcSub = amzVCMatrix.subCatData || {}
    // True combined Amazon (SC+VC) gross revenue, computed independent of amzChannelView, so
    // Seller Central's / Vendor Central's own "% of total" Gross Revenue KPI card always means
    // "% of Amazon's whole business" regardless of which toggle is currently selected.
    let amzTotalGross = 0
    Object.values(allScSub).forEach(scMap => Object.values(scMap).forEach(d => {
      amzTotalGross += (d.FBA?.rev || 0) + (d.MFN?.rev || 0)
    }))
    Object.values(allVcSub).forEach(scMap => Object.values(scMap).forEach(d => { amzTotalGross += d.rev || 0 }))
    const subCatKeySource = amzChannelView === 'sc' ? [allScSub] : amzChannelView === 'vc' ? [allVcSub] : [allScSub, allVcSub]
    const amzSubCatData = {}
    new Set(subCatKeySource.flatMap(m => Object.keys(m))).forEach(cat => {
      amzSubCatData[cat] = {}
      new Set(subCatKeySource.flatMap(m => Object.keys(m[cat] || {}))).forEach(sc => {
        amzSubCatData[cat][sc] = pickAmz(allScSub[cat]?.[sc], allVcSub[cat]?.[sc])
      })
    })
    const allScSku = amzSC.skuChannel || {}
    const allVcSku = amzVCMatrix.skuData || {}
    const skuKeySource = amzChannelView === 'sc' ? [allScSku] : amzChannelView === 'vc' ? [allVcSku] : [allScSku, allVcSku]
    const amzSkuData = {}
    new Set(skuKeySource.flatMap(m => Object.keys(m))).forEach(cat => {
      amzSkuData[cat] = {}
      new Set(skuKeySource.flatMap(m => Object.keys(m[cat] || {}))).forEach(sc => {
        amzSkuData[cat][sc] = {}
        new Set(skuKeySource.flatMap(m => Object.keys(m[cat]?.[sc] || {}))).forEach(sku => {
          amzSkuData[cat][sc][sku] = pickAmz(allScSku[cat]?.[sc]?.[sku], allVcSku[cat]?.[sc]?.[sku])
        })
      })
    })
    // Amazon trend — scoped to the selected amzChannelView (SC only / VC only / SC+VC summed),
    // same as every other number on this page. Built from dailyPnLBySku (real per-day per-SKU
    // gross/net/units for BOTH SC and VC — see api/bq.js) rather than the old amzSC.daily (which
    // only ever had SC's own numbers, hardcoded, regardless of which toggle was active — "All"
    // and "Vendor Central" were silently showing SC's revenue shape).
    // excRev here is x.net (GST-exclusive AND returns-excluded), NOT x.excRev (GST-exclusive
    // only) — "Net Revenue" everywhere else on this page (the KPI card, netOf() above) means the
    // returns-adjusted figure, so the trend chart's "Net Revenue" line must use the same
    // definition or it silently disagrees with the KPI card and its own tooltip for the same day.
    const amzDailyMap = {}
    const amzDailySourceRows = [
      ...(amzChannelView !== 'vc' ? (amzSC.dailyPnLBySku || []) : []),
      ...(amzChannelView !== 'sc' ? (amzVCMatrix.dailyPnLBySku || []) : []),
    ]
    amzDailySourceRows.forEach(x => {
      if (!amzDailyMap[x.date]) amzDailyMap[x.date] = { date: x.date, rev: 0, excRev: 0, units: 0 }
      amzDailyMap[x.date].rev += x.gross || 0
      amzDailyMap[x.date].excRev += x.net || 0
      amzDailyMap[x.date].units += x.units || 0
    })
    const amzDaily = Object.values(amzDailyMap).sort((a, b) => a.date.localeCompare(b.date))

    // Amazon day-wise SnD%/GM%/CM1%/CM2% trend — built from amzSC/amzVCMatrix's dailyPnLBySku
    // (see api/bq.js: same per-SKU day-wise settlement gross-up / margin-slab logic that feeds
    // the whole-range sndBySku, just also keyed by date). Scoped to the selected amzChannelView
    // the same way subCatData/skuData above are (SC only / VC only / SC+VC summed), so switching
    // the toggle changes the trend the same way it changes every other number on the page. COGS
    // is applied per day using the same flat per-unit rate (cogsMap) the whole-range table uses —
    // only the day's own units/net revenue vary, not the rate itself. CM2 uses the ACTUAL day's
    // Amazon ad spend (data.ads.adsDailyByCategory, already daily/real — not a share of the
    // whole-range total spread out) summed across every SubCategory, only ever shown on the
    // combined "All" view (amzChannelView === 'all'), matching showMarketing's own gating.
    const amzDailyPnL = (() => {
      const scRows = amzChannelView !== 'vc' ? (amzSC.dailyPnLBySku || []) : []
      const vcRows = amzChannelView !== 'sc' ? (amzVCMatrix.dailyPnLBySku || []) : []
      const byDate = {}
      ;[...scRows, ...vcRows].forEach(x => {
        if (!byDate[x.date]) byDate[x.date] = { date: x.date, gross: 0, excRev: 0, net: 0, totalReturnRev: 0, snd: 0, sndNetCovered: 0, anySnd: false, cogs: 0, netCovered: 0, anyCosted: false, cm1NetCovered: 0, cm2NetCovered: 0 }
        const d = byDate[x.date]
        d.gross += x.gross || 0
        d.excRev += x.excRev || 0
        d.net += x.net || 0
        d.totalReturnRev += x.totalReturnRev || 0
        const rowCosted = cogsMap?.[x.sku]?.cogs != null
        const rowSndCovered = x.snd != null
        if (rowSndCovered) { d.snd += x.snd || 0; d.sndNetCovered += x.net || 0; d.anySnd = true }
        if (rowCosted) {
          const netUnits = Math.max((x.units || 0) - (x.returnedUnits || 0), 0)
          d.cogs += cogsMap[x.sku].cogs * netUnits
          d.netCovered += x.net || 0
          d.anyCosted = true
        }
        if (rowCosted && rowSndCovered) { d.cm1NetCovered += x.net || 0; d.cm2NetCovered += x.net || 0 }
      })
      const spendByDate = {}
      if (amzChannelView === 'all') {
        ;(data.ads?.adsDailyByCategory || []).filter(x => x.platform === 'Amazon').forEach(x => {
          spendByDate[x.date] = (spendByDate[x.date] || 0) + (x.spend || 0)
        })
      }
      return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map(d => {
        const gm = d.anyCosted ? d.netCovered - d.cogs : null
        const cm1Covered = d.anyCosted && d.anySnd
        const cm1 = cm1Covered ? gm - d.snd : null
        const spend = spendByDate[d.date] || 0
        const cm2 = cm1Covered && amzChannelView === 'all' ? cm1 - spend : null
        return {
          date: d.date,
          returnPct: d.gross > 0 ? (d.totalReturnRev / d.gross * 100) : 0,
          cogsPct: d.anyCosted && d.netCovered > 0 ? (d.cogs / d.netCovered * 100) : null,
          sndPct: d.anySnd && d.sndNetCovered > 0 ? (d.snd / d.sndNetCovered * 100) : null,
          gmPct: gm != null && d.netCovered > 0 ? (gm / d.netCovered * 100) : null,
          cm1Pct: cm1 != null && d.cm1NetCovered > 0 ? (cm1 / d.cm1NetCovered * 100) : null,
          cm2Pct: cm2 != null && d.cm2NetCovered > 0 ? (cm2 / d.cm2NetCovered * 100) : null,
        }
      })
    })()

    // ── Flipkart ──
    const fk = data.flipkart || {}
    const fkCatMatrix = {}
    ;(fk.categories || []).forEach(c => { fkCatMatrix[c.category] = { rev: 0, excRev: 0, units: 0 } })
    const fkSubCatData = {}
    ;(fk.subCategories || []).forEach(x => {
      if (!fkSubCatData[x.category]) fkSubCatData[x.category] = {}
      fkSubCatData[x.category][x.subcategory] = pick({ rev: x.rev, excRev: x.excRev || 0, units: x.units })
    })
    const fkSkuData = fk.skuMatrix || {}

    // ── Blinkit / Instamart / Zepto (quick-commerce, identical shape) ──
    const qcSubCatOf = qc => {
      const m = {}
      ;(qc.subCategories || []).forEach(x => {
        if (!m[x.category]) m[x.category] = {}
        m[x.category][x.subcategory] = pick({ rev: x.rev, excRev: x.excRev || 0, units: x.units })
      })
      return m
    }
    const bl = data.blinkit || {}
    const ins = data.instamart || {}
    const zp = data.zepto || {}

    // ── CRED / Firstcry / Myntra (identical shape, real returnRev in totals) ──
    const simpleSubCatOf = (rows) => {
      const m = {}
      rows.forEach(x => {
        if (!m[x.category]) m[x.category] = {}
        m[x.category][x.subcategory] = pick({ rev: x.rev, excRev: x.excRev || 0, units: x.units, returnRev: x.returnRev || 0 })
      })
      return m
    }
    const cr = data.cred || {}
    const fc = data.firstcry || {}
    const mn = data.myntra || {}

    // ── Offline (row-array shape, sub-channel filterable) ──
    const off = data.offline || {}
    const filterOffSub = rows => {
      if (offlineSub === 'all') return rows
      if (offlineSub === 'b2b') return rows.filter(r => r.subChannel === 'Shopify B2B' || r.subChannel?.startsWith('Offline_B2B'))
      if (offlineSub === 'Stockist') return rows.filter(r => r.subChannel?.startsWith('Stockist'))
      return rows.filter(r => r.subChannel === offlineSub)
    }
    const offSubCatData = {}
    filterOffSub(off.subCategoryRows || []).forEach(x => {
      if (!offSubCatData[x.category]) offSubCatData[x.category] = {}
      if (!offSubCatData[x.category][x.subCategory]) offSubCatData[x.category][x.subCategory] = { rev: 0, excRev: 0, units: 0 }
      offSubCatData[x.category][x.subCategory].rev += x.rev || 0
      offSubCatData[x.category][x.subCategory].excRev += x.excRev || 0
      offSubCatData[x.category][x.subCategory].units += x.units || 0
    })
    Object.keys(offSubCatData).forEach(cat => Object.keys(offSubCatData[cat]).forEach(sc => { offSubCatData[cat][sc] = pick(offSubCatData[cat][sc]) }))
    const offSkuData = {}
    filterOffSub(off.skuRows || []).forEach(x => {
      if (!offSkuData[x.category]) offSkuData[x.category] = {}
      if (!offSkuData[x.category][x.subCategory]) offSkuData[x.category][x.subCategory] = {}
      if (!offSkuData[x.category][x.subCategory][x.sku]) offSkuData[x.category][x.subCategory][x.sku] = { rev: 0, excRev: 0, units: 0 }
      offSkuData[x.category][x.subCategory][x.sku].rev += x.rev || 0
      offSkuData[x.category][x.subCategory][x.sku].excRev += x.excRev || 0
      offSkuData[x.category][x.subCategory][x.sku].units += x.units || 0
    })
    const offDaily = filterOffSub(off.daily || [])

    return {
      all: { subCatData: allSubCatData, skuData: allSkuData, daily: data.dailyArr || [], gross: data.totalRev || 0, excRev: data.totalExcRev || 0, net: data.netRevenueCalc || 0, units: data.totalQty || 0, orders: data.nOrders || 0, returnRev: data.returnRev || 0 },
      shopify: (() => {
        const n = netOf(shSubCatData)
        // For Mobility sub-channel, override net revenue with manager-defined filter
        // (paid/pending/partially_paid × Delivered/Dispatched/Exchange/Blank, SellingPrice_Exc_GST)
        // computed server-side as mobilityNetCalc and stored in subChannelMap.Mobility.netRev
        if (d2cSubCh === 'Mobility') {
          const mobilityNet = data.subChannelMap?.Mobility?.netRev
          if (mobilityNet != null && mobilityNet > 0) n.net = mobilityNet
        }
        // Scale daily values by subchannel share when MyFrido/Mobility is selected
        const shTotalRev = sh.totals?.rev || 0
        const isSubChFiltered = d2cSubCh === 'MyFrido' || d2cSubCh === 'Mobility'
        const subChRatio = (isSubChFiltered && shTotalRev > 0) ? n.gross / shTotalRev : 1
        const daily = subChRatio === 1 ? (sh.daily || []) : (sh.daily || []).map(d => ({ ...d, rev: (d.rev || 0) * subChRatio, excRev: (d.excRev || 0) * subChRatio }))
        return { subCatData: shSubCatData, skuData: shSkuData, daily, ...n, orders: d2cSubCh === 'all' ? (sh.totals?.orders || 0) : (data.subChannelMap?.[d2cSubCh]?.orders || 0) }
      })(),
      ebo: { subCatData: eboSubCatData, skuData: eboSkuData, daily: ebo.daily || [], gross: ebo.totals?.rev || 0, net: ebo.netCalc?.netRev ?? 0, units: ebo.totals?.qty || 0, orders: ebo.totals?.orders || 0, returnRev: (ebo.netCalc?.cancelRev || 0) + (ebo.netCalc?.rtoRev || 0) + (ebo.netCalc?.cirRev || 0) + (ebo.netCalc?.returnRev || 0) },
      amazon: (() => { const n = netOf(amzSubCatData); return { subCatData: amzSubCatData, skuData: amzSkuData, daily: amzDaily, dailyPnL: amzDailyPnL, amzTotalGross, ...n } })(),
      flipkart: (() => { const n = netOf(fkSubCatData); return { subCatData: fkSubCatData, skuData: fkSkuData, daily: fk.daily || [], ...n } })(),
      blinkit: (() => { const sc = qcSubCatOf(bl); const n = netOf(sc); return { subCatData: sc, skuData: bl.skuMatrix || {}, daily: bl.daily || [], ...n } })(),
      instamart: (() => { const sc = qcSubCatOf(ins); const n = netOf(sc); return { subCatData: sc, skuData: ins.skuMatrix || {}, daily: ins.daily || [], ...n } })(),
      zepto: (() => { const sc = qcSubCatOf(zp); const n = netOf(sc); return { subCatData: sc, skuData: zp.skuMatrix || {}, daily: zp.daily || [], ...n } })(),
      cred: (() => { const sc = simpleSubCatOf(cr.subCategories || []); const n = netOf(sc); return { subCatData: sc, skuData: cr.skuMatrix || {}, daily: cr.daily || [], ...n } })(),
      firstcry: (() => { const sc = simpleSubCatOf(fc.subCategories || []); const n = netOf(sc); return { subCatData: sc, skuData: fc.skuMatrix || {}, daily: fc.daily || [], ...n } })(),
      myntra: (() => { const sc = simpleSubCatOf(mn.subCategories || []); const n = netOf(sc); return { subCatData: sc, skuData: mn.skuMatrix || {}, daily: mn.daily || [], ...n } })(),
      offline: (() => { const n = netOf(offSubCatData); return { subCatData: offSubCatData, skuData: offSkuData, daily: offDaily, ...n } })(),
    }
  }, [data, amzChannelView, offlineSub, d2cRegion, d2cSubCh, cogsMap])

  const CHANNEL_COLORS = { all: '#94939F', shopify: '#FFD600', ebo: '#8B5E3C', amazon: '#E8930A', flipkart: '#2E74CC', blinkit: '#0D9E68', cred: '#CC4078', firstcry: '#9B56B6', instamart: '#4AB89A', zepto: '#858380', myntra: '#E87858', offline: '#6B7280' }

  const activeData = channelData ? (channelData[activeTab] || channelData.all) : null
  const activeTabMeta = PNL_TABS.find(t => t.id === activeTab)

  const activeSndBySku = activeTab === 'shopify' ? shSndBySku : (activeTab === 'amazon' && amzChannelView === 'sc') ? amzSndBySku : (activeTab === 'amazon' && amzChannelView === 'vc') ? amzVCSndBySku : (activeTab === 'amazon' && amzChannelView === 'all') ? amzAllSndBySku : undefined
  const activeAdSpendMap = activeTab === 'amazon' && amzChannelView === 'all' ? amzAdSpendMap : activeTab === 'shopify' ? (data?.pnlAdSpendMap || {}) : undefined
  const activeShowMarketing = !(activeTab === 'amazon' && (amzChannelView === 'sc' || amzChannelView === 'vc'))
  // "All" D2C ad-spend covers SubCategories with no matching sales row in this exact range (an
  // unattributed remainder) — only fold that bucket in when viewing the unfiltered D2C total, or
  // MyFrido/Mobility's own numbers would silently absorb spend that belongs to the other sub-channel.
  const activeIncludeUnmatched = activeTab === 'shopify' && d2cSubCh === 'all'
  const activeMobilityNetBySubCat = activeTab === 'shopify' && d2cSubCh === 'Mobility' ? (data?.shopify?.mobilityNetBySubCat || {}) : {}

  // Whole-range GM%/SnD%/CM1%/CM2% KPI summary — same aggregation PnLFinancialTable.jsx's Total
  // row computes (net units × flat COGS rate, SnD from sndBySku, CM1 = GM − SnD, CM2 = CM1 −
  // marketing spend), lifted up here so the KPI card row can surface the same headline numbers
  // without duplicating the whole Financial View table.
  // Every %-metric here divides by its own "covered net" (net revenue of only the rows where
  // that specific metric is actually known), exactly matching PnLFinancialTable.jsx's Total row
  // (tot.cogs/tot.netCovered, tot.snd/tot.sndNetCovered, tot.cm1/tot.cm1NetCovered, tot.cm2/
  // tot.cm2NetCovered) and the trend chart's tooltip (amzDailyPnL below) — dividing by the whole
  // range's net instead (as an earlier version of this did for cogsPct/sndPct/cm1Pct/cm2Pct)
  // silently disagreed with both of those by a few points whenever coverage is partial (COGS in
  // particular, since not every SKU has a cogs-data.json entry).
  const kpiSummary = useMemo(() => {
    let net = 0, grossExcRev = 0, netCovered = 0, cogs = 0, anyCosted = false, snd = 0, sndNetCovered = 0, anySnd = false, spend = 0
    let cm1NetCovered = 0, cm2NetCovered = 0
    if (!activeData) {
      return { net, cogs: null, gm: null, snd: null, cm1: null, spend, cm2: null, roas: null, cogsPct: null, gmPct: null, sndPct: null, cm1Pct: null, spendPct: null, cm2Pct: null }
    }
    Object.entries(activeData.subCatData || {}).forEach(([cat, scMap]) => {
      Object.entries(scMap).forEach(([sc, d]) => {
        const gross = d.rev || 0
        const excRev = d.excRev || 0
        const totalReturn = (d.cancelRev||0) + (d.rtoRev||0) + (d.cirRev||0) + (d.returnRev||0)
        const gstRatio = gross > 0 ? (gross - excRev) / gross : 0
        const rowNet = Math.max(gross - totalReturn, 0) * (1 - gstRatio)
        net += rowNet
        grossExcRev += excRev
        const rowSpend = activeAdSpendMap?.[sc] || 0
        spend += rowSpend

        let rowCogs = 0, rowNetCovered = 0, rowAnyCosted = false, rowSnd = 0, rowSndNetCovered = 0, rowAnySnd = false
        Object.entries(activeData.skuData?.[cat]?.[sc] || {}).forEach(([sku, sd]) => {
          const skGross = sd.rev || 0
          const skExcRev = sd.excRev || 0
          const skReturn = (sd.cancelRev||0) + (sd.rtoRev||0) + (sd.cirRev||0) + (sd.returnRev||0)
          const skGstRatio = skGross > 0 ? (skGross - skExcRev) / skGross : 0
          const skNet = Math.max(skGross - skReturn, 0) * (1 - skGstRatio)
          const units = sd.units || 0
          const netUnits = sd.returnedUnits != null ? Math.max(units - sd.returnedUnits, 0) : units
          const entry = cogsMap?.[sku]
          if (entry && entry.cogs != null) { rowCogs += entry.cogs * netUnits; rowNetCovered += skNet; rowAnyCosted = true }
          if (activeSndBySku && activeSndBySku[sku] != null) { rowSnd += activeSndBySku[sku]; rowSndNetCovered += skNet; rowAnySnd = true }
        })
        if (rowAnyCosted) { cogs += rowCogs; netCovered += rowNetCovered; anyCosted = true }
        if (rowAnySnd) { snd += rowSnd; sndNetCovered += rowSndNetCovered; anySnd = true }
        // CM1/CM2 coverage is gated on BOTH COGS and SnD being known for this row (same
        // cm1Covered = anyCosted && anySnd the table uses) — their "covered net" only counts
        // rowNet when both conditions hold, not just whichever one happens to be true.
        if (rowAnyCosted && rowAnySnd) { cm1NetCovered += rowNet; cm2NetCovered += rowNet }
      })
    })
    const gm = anyCosted ? netCovered - cogs : null
    const cm1Covered = anyCosted && anySnd
    const cm1 = cm1Covered ? gm - snd : null
    const cm2 = cm1Covered ? cm1 - spend : null
    return {
      net, cogs: anyCosted ? cogs : null, gm, snd: anySnd ? snd : null, cm1, spend, cm2,
      // ROAS = Gross Revenue (Ex GST, before returns) ÷ Marketing Spend — same formula and same
      // numerator base ("Revenue (Ex GST) / Spend") the Ads tab's own Overall ROAS card uses, so
      // this always matches that number exactly rather than drifting via a different revenue base.
      roas: spend > 0 ? grossExcRev / spend : null,
      cogsPct: anyCosted && netCovered > 0 ? (cogs / netCovered * 100) : null,
      gmPct: gm != null && netCovered > 0 ? (gm / netCovered * 100) : null,
      sndPct: anySnd && sndNetCovered > 0 ? (snd / sndNetCovered * 100) : null,
      cm1Pct: cm1 != null && cm1NetCovered > 0 ? (cm1 / cm1NetCovered * 100) : null,
      spendPct: net > 0 ? (spend / net * 100) : null,
      cm2Pct: cm2 != null && cm2NetCovered > 0 ? (cm2 / cm2NetCovered * 100) : null,
    }
  }, [activeData, activeSndBySku, activeAdSpendMap, cogsMap])

  if (!data || !channelData) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="sales-tabs">
        {PNL_TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`stab${activeTab === tab.id ? ' active' : ''}`} style={tab.id === 'all' ? { fontWeight: activeTab === 'all' ? 800 : 700, fontSize: 13 } : {}}>
            {tab.logo && <img src={tab.logo} alt="" style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, objectFit: 'contain', filter: tab.id === 'cred' ? 'invert(1)' : 'none' }} />}
            {tab.label}
          </button>
        ))}
      </div>
      <div className="page-scroll">
        {activeTab === 'shopify' && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 2, background: '#F2F1EF', border: '1px solid #E0DDD4', borderRadius: 8, padding: 3 }}>
              {[{ id: 'india', label: 'India' }, { id: 'international', label: 'International' }].map(opt => (
                <button key={opt.id} onClick={() => setD2cRegion(opt.id)} style={{ fontSize: 12, fontWeight: d2cRegion === opt.id ? 700 : 500, padding: '4px 12px', borderRadius: 6, border: 'none', background: d2cRegion === opt.id ? '#94939F' : 'transparent', color: d2cRegion === opt.id ? '#fff' : '#13121A', cursor: 'pointer' }}>{opt.label}</button>
              ))}
            </div>
            <div style={{ width: 1, height: 20, background: '#E0DDD4' }} />
            <div style={{ display: 'flex', gap: 2, background: '#F2F1EF', border: '1px solid #E0DDD4', borderRadius: 8, padding: 3 }}>
              {[{ id: 'all', label: 'All' }, { id: 'MyFrido', label: 'MyFrido' }, { id: 'Mobility', label: 'Mobility' }].map(opt => (
                <button key={opt.id} onClick={() => setD2cSubCh(opt.id)} style={{ fontSize: 12, fontWeight: d2cSubCh === opt.id ? 700 : 500, padding: '4px 12px', borderRadius: 6, border: 'none', background: d2cSubCh === opt.id ? '#94939F' : 'transparent', color: d2cSubCh === opt.id ? '#fff' : '#13121A', cursor: 'pointer' }}>{opt.label}</button>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'amazon' && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {[{ id: 'all', label: 'All' }, { id: 'sc', label: 'Seller Central' }, { id: 'vc', label: 'Vendor Central' }].map(opt => (
              <button key={opt.id} onClick={() => setAmzChannelView(opt.id)} style={{ fontSize: 12, fontWeight: amzChannelView === opt.id ? 700 : 500, padding: '5px 14px', borderRadius: 7, border: 'none', background: amzChannelView === opt.id ? '#FFD600' : 'transparent', color: '#13121A', cursor: 'pointer' }}>{opt.label}</button>
            ))}
          </div>
        )}
        {activeTab === 'offline' && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {[{ id: 'all', label: 'All' }, { id: 'b2b', label: 'B2B' }, { id: 'Stockist', label: 'Stockist' }, { id: 'MTGT', label: 'MT GT' }].map(opt => (
              <button key={opt.id} onClick={() => setOfflineSub(opt.id)} style={{ fontSize: 12, fontWeight: offlineSub === opt.id ? 700 : 500, padding: '5px 14px', borderRadius: 7, border: 'none', background: offlineSub === opt.id ? '#FFD600' : 'transparent', color: '#13121A', cursor: 'pointer' }}>{opt.label}</button>
            ))}
          </div>
        )}
        <PnLChannelTab
          title={activeTabMeta?.label || 'PnL'}
          note={activeTab === 'amazon' ? (amzChannelView === 'all' ? 'SC + VC' : amzChannelView === 'sc' ? 'Seller Central' : 'Vendor Central') : activeTab === 'offline' ? (offlineSub === 'all' ? undefined : offlineSub) : activeTab === 'shopify' ? (d2cSubCh === 'all' ? undefined : d2cSubCh) : undefined}
          gross={activeData.gross}
          excRev={activeData.excRev}
          net={activeData.net}
          units={activeData.units}
          orders={activeData.orders}
          returnRev={activeData.returnRev}
          subCatData={activeData.subCatData}
          skuData={activeData.skuData}
          sndBySku={activeSndBySku}
          adSpendMap={activeAdSpendMap}
          showMarketing={activeShowMarketing}
          daily={activeData.daily}
          dailyPnL={activeData.dailyPnL}
          kpiSummary={kpiSummary}
          grossOfTotalPct={activeTab === 'amazon' && (amzChannelView === 'sc' || amzChannelView === 'vc') && activeData.amzTotalGross > 0 ? (activeData.gross / activeData.amzTotalGross * 100) : null}
          noReturnAccent={activeTab === 'amazon' && amzChannelView === 'vc'}
          grossColor={CHANNEL_COLORS[activeTab] || '#FFD600'}
          gradId={`pnl${activeTab}Grad`}
          includeUnmatched={activeIncludeUnmatched}
          mobilityNetBySubCat={activeMobilityNetBySubCat}
        />
      </div>
    </div>
  )
}
