import { useState, useMemo, useEffect } from 'react'
import PnLChannelTab from './PnLChannelTab.jsx'
import StorePnLTable from './StorePnLTable.jsx'
import { netRevenueOf, estimateCogsPerUnit } from './pnlUtils.js'

// One subtab per Sales-tab channel + a consolidated "All Channels" tab — same bar, same visual
// chrome as SalesPage. Every channel's Category→Product(→SKU) map is rebuilt here the same way
// each existing Sales channel tab already does it (small local pick()/aggregation transforms
// reading straight off `data`), so this needs no new API endpoint — 100% reuse of /api/bq's
// existing response shape. See PNL_TAB_ROADMAP.md for the COGS/SnD prerequisites still pending;
// the Financial View table (PnLFinancialTable.jsx) renders those columns as "—" until then.
const PNL_TABS = [
  { id: 'all', label: 'Overall' },
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
  // Channel='International' (Amazon International + Shopify International sub-brands, unified
  // under one Channel by the 2026-08 schema change) — India-scoped D2C/Amazon tabs no longer
  // carry these rows, so International gets its own top-level tab, same depth as every other
  // channel minus Marketing Spend/ROAS/CM2 (ad spend isn't attributable to international sales).
  { id: 'international', label: 'International' },
  { id: 'offline', label: 'Offline Sales', logo: '/offline-sales.png' },
]

// Same shared per-row pick used by every existing FlatCategoryProductMatrix caller — kept
// local (not imported) since it's a 2-line pure function, not worth a shared-module trip.
const pick = v => ({ rev: v.rev || 0, excRev: v.excRev || 0, units: v.units || v.aspUnits || 0, returnUnits: v.returnUnits || 0, cancelRev: v.cancelRev || 0, codCancelRev: v.codCancelRev || 0, rtoRev: v.rtoRev || 0, cirRev: v.cirRev || 0, exchRev: v.exchRev || 0, returnRev: v.returnRev || 0 })

// Aggregates every {category: {subCategory: d}} row's Net Revenue via the shared netRevenueOf()
// formula (see ./pnlUtils.js) — no scName/mobility override passed here, since the Mobility
// whitelist-net override is applied afterward on the AGGREGATE n.net (see the `shopify` block
// below), exactly as this function did before centralization.
function netOf(subCatData, netScale = 1) {
  let gross = 0, excRev = 0, net = 0, returnRev = 0, units = 0
  Object.values(subCatData || {}).forEach(scMap => {
    Object.values(scMap).forEach(d => {
      const r = netRevenueOf(d, undefined, {}, undefined, netScale)
      gross += r.gross
      excRev += r.excRev
      units += r.units
      returnRev += r.totalReturnRev
      net += r.net
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
// Offline's fulfilment lookup is bracketed (highest slab <= total weight), unlike D2C/EBO's
// rateForSlab() which matches a single order's EXACT weightSlab value — offline has no per-order
// line-item weight, only each SKU's total net weight moved across the whole date range (confirmed
// 2026-08-20: treat that total as one shipment for slab-lookup purposes). Assumes slabs is sorted
// ascending by weightGm (true of snd-rates.json as generated).
function fulfilmentForWeight(slabs, weightGm) {
  if (!slabs || !slabs.length || weightGm == null) return null
  let match = null
  for (const s of slabs) {
    if (s.weightGm <= weightGm) match = s
    else break
  }
  return match || slabs[0]
}

// Flat per-SKU COGS rate sheet (public/cogs-data.json), same file PnLFinancialTable.jsx fetches
// for the whole-range table — fetched again here (browser HTTP cache makes this free) so the
// day-wise trend chart can compute its own GM%/CM1% without threading cogsMap down as a prop.
let cogsMapPromise = null
function loadCogsMap() {
  if (!cogsMapPromise) cogsMapPromise = fetch('/cogs-data.json').then(r => r.ok ? r.json() : {}).catch(() => ({}))
  return cogsMapPromise
}

export default function PnLPage({ data, filters, setFilters, activeTab: activeTabProp, setActiveTab: setActiveTabProp, amzChannelView: amzChannelViewProp, setAmzChannelView: setAmzChannelViewProp, offlineSub: offlineSubProp, setOfflineSub: setOfflineSubProp, d2cSubCh: d2cSubChProp, setD2cSubCh: setD2cSubChProp }) {
  const [activeTabLocal, setActiveTabLocal] = useState('all')
  const [amzChannelViewLocal, setAmzChannelViewLocal] = useState('all') // 'all' | 'sc' | 'vc'
  const [offlineSubLocal, setOfflineSubLocal] = useState('all') // 'all' | 'b2b' | 'Stockist' | 'MTGT' | 'misc'
  // D2C is India-only permanently (International orders live under their own top-level
  // "International" PnL tab) — no region toggle/state needed here anymore.
  const [d2cSubChLocal, setD2cSubChLocal] = useState('all') // 'all' | 'MyFrido' | 'Mobility'
  const activeTab = activeTabProp !== undefined ? activeTabProp : activeTabLocal
  const setActiveTab = setActiveTabProp || setActiveTabLocal
  const amzChannelView = amzChannelViewProp !== undefined ? amzChannelViewProp : amzChannelViewLocal
  const setAmzChannelView = setAmzChannelViewProp || setAmzChannelViewLocal
  const offlineSub = offlineSubProp !== undefined ? offlineSubProp : offlineSubLocal
  const setOfflineSub = setOfflineSubProp || setOfflineSubLocal
  const d2cSubCh = d2cSubChProp !== undefined ? d2cSubChProp : d2cSubChLocal
  const setD2cSubCh = setD2cSubChProp || setD2cSubChLocal
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

  // EBO S&D: same weight-slab courier formula as D2C (see eboSkuCosts query in api/bq.js) —
  // ~70% of EBO orders are punched online and shipped courier-direct from the warehouse,
  // indistinguishable in the data from a normal D2C order, and no field marks the remaining
  // ~30% fulfilled directly from the physical store instead. EBO_SND_SCALE approximates that
  // in-store share's lower logistics cost as a flat 15% reduction on the whole formula, rather
  // than a per-order split (confirmed with user 2026-08-20 — deliberately not modeling the
  // separate ₹4/kg warehouse→store movement cost, since the two paths can't be told apart).
  const EBO_SND_SCALE = 0.85
  const eboSkuCosts = useMemo(() => {
    const rows = data?.ebo?.skuCostRows
    if (!sndRates || !rows?.length) return {}
    const bySku = {}
    rows.forEach(row => {
      const { sku, orderStatus, weightSlab, lineCount, totalQty, grossIncGst } = row
      if (!sku) return
      const effectiveSlab = weightSlab != null ? weightSlab : 2000
      const rate = rateForSlab(sndRates, effectiveSlab)
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
  }, [sndRates, data])
  const eboSndBySku = useMemo(() => {
    const out = {}
    Object.entries(eboSkuCosts).forEach(([sku, c]) => {
      out[sku] = ((c.logistics || 0) + (c.fulfilment || 0) + (c.paymentGw || 0) + (c.softwareFee || 0)) * EBO_SND_SCALE
    })
    return out
  }, [eboSkuCosts])

  // Store-wise EBO P&L, down to EBITDA (confirmed 2026-08-20). SnD reuses the identical
  // weight-slab formula as eboSkuCosts above (same EBO_SND_SCALE), just computed per (store, sku)
  // from ebo.storeSkuCostRows instead of per-SKU across the whole channel — a SKU sold from two
  // different stores gets two independent cost lines rather than one blended figure. Marketing
  // Spend uses the same flat 1.5%-of-Net-Revenue assumption as the channel-level eboAdSpendMap
  // above, applied per store. Fixed costs (rent/employee/CAM/utilities/software/volumetric rent)
  // come straight from ebo.storeRows[].fixedCosts (already resolved server-side in api/bq.js via
  // api/_store_pnl.js's Supabase fetch) — summed across every month the current date range spans,
  // since EBITDA here is for the whole selected range, not one specific month.
  const EBO_STORE_SPEND_RATE = 0.015
  const storePnLRows = useMemo(() => {
    const storeRows = data?.ebo?.storeRows
    if (!storeRows?.length) return []

    // Per (store, sku) SnD — same logistics/fulfilment/paymentGw/softwareFee formula as
    // eboSkuCosts, scaled by EBO_SND_SCALE, just keyed by store additionally.
    const skuCostRows = data?.ebo?.storeSkuCostRows || []
    const sndByStoreSku = {}
    if (sndRates?.length) {
      skuCostRows.forEach(row => {
        const { storeName, sku, orderStatus, weightSlab, lineCount, totalQty, grossIncGst } = row
        if (!storeName || !sku) return
        const effectiveSlab = weightSlab != null ? weightSlab : 2000
        const rate = rateForSlab(sndRates, effectiveSlab)
        let logistics = 0
        const fulfilment = rate ? rate.fulfilment * lineCount : 0
        if (rate) {
          const st = (orderStatus || '').toLowerCase()
          if (st === 'cancelled') logistics = 0
          else if (st === 'rto') logistics = (rate.forward + rate.rto) * lineCount
          else if (st === 'cir' || st === 'exchange' || st === 'return') logistics = (rate.forward + rate.reverse) * lineCount
          else logistics = rate.forward * lineCount
        }
        const paymentGw = grossIncGst * 0.011
        const softwareFee = totalQty * 15
        const key = `${storeName}::${sku}`
        sndByStoreSku[key] = (sndByStoreSku[key] || 0) + (logistics + fulfilment + paymentGw + softwareFee) * EBO_SND_SCALE
      })
    }
    // COGS per (store, sku) — net units (gross − cancelled/RTO/CIR/return/exchange) × a per-unit
    // COGS rate. The rate itself (real cogsMap entry, or the ASP-based estimate fallback) is
    // computed ONCE per SKU at the CHANNEL-WIDE grain (same ASP the Financial View's skuMap/
    // costsForSkus() uses — gross ÷ units summed across every store), not re-derived per store from
    // that store's own narrower ASP — confirmed 2026-08-20 the user wants Store-wise's Total row to
    // match the Financial View bit-for-bit through CM2. Computing the ASP-fallback per store instead
    // (each store's own gross/netUnits ratio) is legitimate but produces a slightly different
    // number whenever a SKU's per-store ASP differs from its channel-wide ASP — a real, if small
    // (~0.15% of COGS observed), rounding gap versus the Financial View's one-rate-per-SKU figure.
    const perUnitCogsBySku = {}
    if (cogsMap) {
      const channelUnitsBySku = {}
      const channelGrossBySku = {}
      skuCostRows.forEach(row => {
        const { sku, totalQty, grossIncGst } = row
        if (!sku) return
        channelUnitsBySku[sku] = (channelUnitsBySku[sku] || 0) + totalQty
        channelGrossBySku[sku] = (channelGrossBySku[sku] || 0) + grossIncGst
      })
      Object.keys(channelUnitsBySku).forEach(sku => {
        const entry = cogsMap[sku]
        const units = channelUnitsBySku[sku] || 0
        const asp = units > 0 ? (channelGrossBySku[sku] || 0) / units : 0
        perUnitCogsBySku[sku] = (entry && entry.cogs != null) ? entry.cogs : estimateCogsPerUnit(asp)
      })
    }
    const cogsByStoreSku = {}
    if (cogsMap) {
      const netUnitsByStoreSku = {}
      skuCostRows.forEach(row => {
        const { storeName, sku, orderStatus, totalQty } = row
        if (!storeName || !sku) return
        const key = `${storeName}::${sku}`
        const st = (orderStatus || '').toLowerCase()
        const isReturnLike = st === 'cancelled' || st === 'rto' || st === 'cir' || st === 'exchange' || st === 'return'
        netUnitsByStoreSku[key] = (netUnitsByStoreSku[key] || 0) + (isReturnLike ? 0 : totalQty)
      })
      Object.entries(netUnitsByStoreSku).forEach(([key, netUnits]) => {
        const sku = key.split('::')[1]
        const perUnitCogs = perUnitCogsBySku[sku] || 0
        if (perUnitCogs > 0 || netUnits > 0) cogsByStoreSku[key] = perUnitCogs * netUnits
      })
    }
    // Aggregate SnD/COGS from (store, sku) grain up to (store) grain — the store P&L row itself
    // doesn't need per-SKU detail, only the store-level total.
    const sndByStore = {}
    Object.entries(sndByStoreSku).forEach(([key, v]) => {
      const storeName = key.split('::')[0]
      sndByStore[storeName] = (sndByStore[storeName] || 0) + v
    })
    const anySndByStore = new Set(Object.keys(sndByStore))
    const cogsByStore = {}
    const anyCogsByStore = new Set()
    Object.entries(cogsByStoreSku).forEach(([key, v]) => {
      const storeName = key.split('::')[0]
      cogsByStore[storeName] = (cogsByStore[storeName] || 0) + v
      anyCogsByStore.add(storeName)
    })

    // storeRows is (store, month) grain — collapse to one row per store for the currently
    // selected date range, summing revenue/units/weight and fixed costs across every month the
    // range spans (a range crossing a month boundary sums that month's full fixed-cost line once
    // per month present, not pro-rated — same "whole month" granularity the underlying cost
    // sheets themselves carry).
    const byStore = {}
    storeRows.forEach(row => {
      const { storeName } = row
      if (!byStore[storeName]) {
        byStore[storeName] = {
          storeName, gross: 0, excRev: 0, netRev: 0, cancelRev: 0, rtoRev: 0, returnRev: 0, cirRev: 0,
          orders: 0, units: 0,
          fixedCosts: { rent: 0, utilities: 0, employeeCost: 0, cam: 0, software: 0, volumetricRent: 0 },
        }
      }
      const s = byStore[storeName]
      s.gross += row.gross || 0
      s.excRev += row.excRev || 0
      s.netRev += row.netRev || 0
      s.cancelRev += row.cancelRev || 0
      s.rtoRev += row.rtoRev || 0
      s.returnRev += row.returnRev || 0
      s.cirRev += row.cirRev || 0
      s.orders += row.orders || 0
      s.units += row.units || 0
      const fc = row.fixedCosts || {}
      s.fixedCosts.rent += fc.rent || 0
      s.fixedCosts.utilities += fc.utilities || 0
      s.fixedCosts.employeeCost += fc.employeeCost || 0
      s.fixedCosts.cam += fc.cam || 0
      s.fixedCosts.software += fc.software || 0
      s.fixedCosts.volumetricRent += fc.volumetricRent || 0
    })

    // Rescale each store's netRev so the sum ties out EXACTLY to the Financial View's EBO Net
    // Revenue (data.ebo.netCalc.netRev, computeNetRevenueMeasures run once for the whole channel)
    // — confirmed 2026-08-20 the user wants Store-wise's Total row to match the Financial View
    // bit-for-bit through CM2, not just closely. Per-(store,month) netRev is computed from that
    // bucket's OWN gross/exc-GST ratio (a real, if tiny, blended-GST-ratio rounding difference vs
    // computing the ratio once across the whole channel — same class of gap netScale/shNetScale
    // already reconcile for D2C elsewhere in this file), so raw per-store netRev sums close to but
    // not exactly the channel figure (~0.1% off, observed). Only `netRev` is rescaled — gross/
    // units/etc. stay the real, unscaled per-store figures, same convention as every other netScale
    // use in this file.
    const rawNetRevTotal = Object.values(byStore).reduce((s, v) => s + v.netRev, 0)
    const channelNetRev = data?.ebo?.netCalc?.netRev
    const netRevScale = (channelNetRev != null && rawNetRevTotal > 0) ? channelNetRev / rawNetRevTotal : 1
    Object.values(byStore).forEach(s => { s.netRev *= netRevScale })

    return Object.values(byStore).map(s => {
      const cogs = anyCogsByStore.has(s.storeName) ? cogsByStore[s.storeName] : null
      const gm = cogs != null ? s.netRev - cogs : null
      const snd = anySndByStore.has(s.storeName) ? sndByStore[s.storeName] : null
      const cm1 = gm != null && snd != null ? gm - snd : null
      const spend = s.netRev * EBO_STORE_SPEND_RATE
      const cm2 = cm1 != null ? cm1 - spend : null
      const totalFixedCosts = Object.values(s.fixedCosts).reduce((a, b) => a + b, 0)
      // "— (marketing not yet costed)" convention doesn't apply to fixed costs: rent/employee/CAM/
      // utilities/software each independently default to 0 when that store has no row in its
      // Supabase sheet (a store simply not yet onboarded into cost tracking), so EBITDA is always
      // computable once CM2 is — never blocked on every cost line being present.
      const ebitda = cm2 != null ? cm2 - totalFixedCosts : null
      return { ...s, cogs, gm, snd, cm1, spend, cm2, totalFixedCosts, ebitda }
    }).sort((a, b) => b.gross - a.gross)
  }, [data, sndRates, cogsMap])

  // Offline S&D: ₹8/kg transport (on total net weight moved) + a weight-wise fulfilment cost
  // (confirmed 2026-08-20, supersedes the earlier flat ₹9/kg-only formula). Fulfilment reuses the
  // same D2C/EBO rate card (snd-rates.json) but its `fulfilment` figure (VAS + storage + box-in —
  // see the rate-card build formula) is a cost to store/handle/box ONE unit at that unit's own
  // weight, so it's looked up PER UNIT SOLD at the SKU's per-unit weight (unitWeightGms) and
  // multiplied by units — not once for the SKU's aggregate total weight (that undercounted
  // fulfilment for any SKU shipped across many units, since one lookup was applied regardless of
  // how many units it actually covered). fulfilmentForWeight brackets to the highest slab <= the
  // given weight (D2C/EBO's rateForSlab does an exact match instead, since they always have a
  // real discrete weightSlab value per order-line; offline's item-master weight is continuous).
  // Scoped to the selected offlineSub (all/b2b/Stockist/MTGT/misc) the same way offSkuData/
  // offSubCatData above are; "all" combines every sub-channel's units/weight per SKU first, so a
  // SKU sold across multiple sub-channels is costed once on its true combined total.
  const OFFLINE_TRANSPORT_PER_KG = 8
  // Payment gateway fee = 1.1% of (gross, exc-GST) Sales revenue — confirmed 2026-08-20, applies
  // only to sub-channels that actually take card/UPI payment at point of sale (B2B, Stockist);
  // MT GT and Miscellaneous settle by other means (credit terms / cash-and-carry) so no gateway
  // fee applies there. Must be computed per (subChannel, sku) row BEFORE the cross-sub-channel
  // aggregation below — collapsing rows into one bySku total first would lose which sub-channel
  // each unit of revenue came from, silently applying (or skipping) the fee for the wrong rows
  // once "all" combines multiple sub-channels for the same SKU.
  const OFFLINE_PAYMENT_GW_RATE = 0.011
  const offlinePaymentGwSubChannels = sc => {
    const isB2B = sc === 'Shopify B2B' || sc?.startsWith('Offline_B2B')
    const isStockist = sc?.startsWith('Stockist')
    return isB2B || isStockist
  }
  const offSndBySku = useMemo(() => {
    const rows = data?.offline?.skuRows
    if (!rows?.length || !sndRates) return {}
    const isB2B = sc => sc === 'Shopify B2B' || sc?.startsWith('Offline_B2B')
    const isStockist = sc => sc?.startsWith('Stockist')
    const filtered = offlineSub === 'all' ? rows
      : offlineSub === 'b2b' ? rows.filter(r => isB2B(r.subChannel))
      : offlineSub === 'Stockist' ? rows.filter(r => isStockist(r.subChannel))
      : offlineSub === 'MTGT' ? rows.filter(r => r.subChannel === 'MTGT')
      : offlineSub === 'misc' ? rows.filter(r => !isB2B(r.subChannel) && !isStockist(r.subChannel) && r.subChannel !== 'MTGT')
      : rows.filter(r => r.subChannel === offlineSub)
    const bySku = {}
    filtered.forEach(row => {
      if (!row.sku) return
      if (!bySku[row.sku]) bySku[row.sku] = { weightGms: 0, units: 0, unitWeightGms: row.unitWeightGms || 0, paymentGw: 0 }
      bySku[row.sku].weightGms += row.weightGms || 0
      bySku[row.sku].units += row.units || 0
      // unitWeightGms is constant per SKU (item-master value) — keep the first non-zero sighting
      // rather than overwrite with a later 0 from a sub-channel row missing the join.
      if (!bySku[row.sku].unitWeightGms && row.unitWeightGms) bySku[row.sku].unitWeightGms = row.unitWeightGms
      if (offlinePaymentGwSubChannels(row.subChannel)) {
        bySku[row.sku].paymentGw += (row.excRev || 0) * OFFLINE_PAYMENT_GW_RATE
      }
    })
    const out = {}
    Object.entries(bySku).forEach(([sku, { weightGms, units, unitWeightGms, paymentGw }]) => {
      const transport = (weightGms / 1000) * OFFLINE_TRANSPORT_PER_KG
      const rate = fulfilmentForWeight(sndRates, unitWeightGms)
      const fulfilment = (rate ? rate.fulfilment : 0) * units
      out[sku] = transport + fulfilment + paymentGw
    })
    return out
  }, [data, offlineSub, sndRates])

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

    // Only keys that actually exist as an Amazon SubCategory (SC or VC) for THIS date range can
    // ever be reached by kpiSummary (it sums activeAdSpendMap[sc] only for sc keys present in
    // amzSubCatData) — a productRows subCategory that doesn't exactly match a real SubCategory
    // (renamed/discontinued/spelling drift) would otherwise sit under an orphaned key forever
    // summed into nothing, silently undercounting Marketing Spend/CM2 versus the Ads tab's raw
    // Amazon total (same class of bug fixed for D2C's pnlAdSpendMap — see api/bq.js comment).
    const validSubCats = new Set()
    Object.values(data?.amzSC?.subCatChannel || {}).forEach(scMap => Object.keys(scMap).forEach(sc => validSubCats.add(sc)))
    Object.values(data?.amzVCMatrix?.subCatData || {}).forEach(scMap => Object.keys(scMap).forEach(sc => validSubCats.add(sc)))

    const map = {}
    productRows.forEach(r => {
      const cat = r.category || 'Others'
      const keyRaw = r.subCategory || 'Others'
      const key = validSubCats.has(keyRaw) ? keyRaw : 'Others'
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

  // Flipkart marketing spend by SubCategory — same reuse-and-rescale pattern as amzAdSpendMap
  // above, filtered to platform === 'Flipkart' instead of 'Amazon', so the PnL tab's Marketing
  // Spend/CM2 numbers for Flipkart always match the Ads tab's own Flipkart breakdown.
  const fkAdSpendMap = useMemo(() => {
    const productRows = (data?.ads?.categoryBreakdown?.productRows || []).filter(r => r.platform === 'Flipkart')
    const categoryRows = (data?.ads?.categoryBreakdown?.categoryRows || []).filter(r => r.platform === 'Flipkart')

    const productSpendByCat = {}
    productRows.forEach(r => {
      const cat = r.category || 'Others'
      productSpendByCat[cat] = (productSpendByCat[cat] || 0) + (r.spend || 0)
    })
    const catTotalSpend = {}
    categoryRows.forEach(r => { catTotalSpend[r.category || 'Others'] = r.spend || 0 })

    // Same orphaned-key protection as amzAdSpendMap: only fold into a real Flipkart SubCategory
    // name for this date range, otherwise 'Others' — data.flipkart.subCategories is the exact
    // universe activeData.subCatData exposes for the Flipkart tab elsewhere in this file.
    const validSubCats = new Set()
    ;(data?.flipkart?.subCategories || []).forEach(x => validSubCats.add(x.subcategory))

    const map = {}
    productRows.forEach(r => {
      const cat = r.category || 'Others'
      const keyRaw = r.subCategory || 'Others'
      const key = validSubCats.has(keyRaw) ? keyRaw : 'Others'
      const catProductSum = productSpendByCat[cat] || 0
      const catTrueTotal = catTotalSpend[cat]
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
      // D2C is India-only — Channel='International' rows are already excluded upstream (this
      // channel's data is scoped to Channel='Shopify', which no longer contains them post the
      // 2026-08 schema change), so the only remaining filter here is the MyFrido/Mobility toggle.
      const sc = (r.sub_channel || '').toLowerCase()
      if (sc === 'shopify international') return false
      if (d2cSubCh === 'Mobility') return r.sub_channel === 'Mobility'
      if (d2cSubCh === 'MyFrido') return r.sub_channel === 'MyFrido'
      return true
    }
    const shSubCatData = {}
    if (shSalesCatRows.length > 0) {
      shSalesCatRows.filter(filterD2CRow).forEach(r => {
        const cat = r.category || 'Others', sc = r.sub_category || 'Others'
        if (!shSubCatData[cat]) shSubCatData[cat] = {}
        if (!shSubCatData[cat][sc]) shSubCatData[cat][sc] = { rev: 0, excRev: 0, units: 0, returnUnits: 0, cancelRev: 0, codCancelRev: 0, rtoRev: 0, cirRev: 0, exchRev: 0, returnRev: 0 }
        shSubCatData[cat][sc].rev += parseFloat(r.gross_revenue) || 0
        shSubCatData[cat][sc].excRev += parseFloat(r.revenue) || 0
        shSubCatData[cat][sc].units = (shSubCatData[cat][sc].units || 0) + (parseInt(r.units) || 0)
        shSubCatData[cat][sc].returnUnits = (shSubCatData[cat][sc].returnUnits || 0) + (parseInt(r.return_units) || 0)
        shSubCatData[cat][sc].cancelRev += parseFloat(r.cancel_rev) || 0
        shSubCatData[cat][sc].codCancelRev += parseFloat(r.cod_cancel_rev) || 0
        shSubCatData[cat][sc].rtoRev += parseFloat(r.return_rev) || 0
        shSubCatData[cat][sc].cirRev += parseFloat(r.cir_rev) || 0
        shSubCatData[cat][sc].exchRev += parseFloat(r.exch_rev) || 0
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
    // netScale reconciles PnL's row-level blended-GST-ratio Net Revenue to the Sales tab's more
    // precise whole-range netCalc.netRev (real per-line-item GST summed over completed orders
    // only) — confirmed 2026-08-19 the two tabs should tie out exactly rather than differ by a
    // small methodology margin. Computed once here (needed by both shDailyPnL below and the
    // `shopify` channelData block further down) as (Sales tab's authoritative total) ÷ (this same
    // row set's raw, unscaled netOf() sum). 'all' (Overall D2C) reconciles to sh.netCalc.netRev;
    // 'MyFrido' reconciles to subChannelMap.MyFrido.netCalc.netRev (added alongside bySubChannel
    // in api/bq.js). Mobility is excluded — it already has its own exact manager-defined whitelist
    // override, which must stay unscaled.
    const shNetScale = (() => {
      if (d2cSubCh === 'Mobility') return 1
      const rawNet = netOf(shSubCatData).net
      const target = d2cSubCh === 'MyFrido' ? data.subChannelMap?.MyFrido?.netCalc?.netRev : sh.netCalc?.netRev
      return (target != null && rawNet > 0) ? target / rawNet : 1
    })()
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
    // EBO Marketing Spend: flat assumed rate, 1.5% of each SubCategory's own Net Revenue
    // (confirmed 2026-08-20) — a placeholder assumption, same pattern as D2C's flat 1.1% payment
    // gateway rate, until/unless a real EBO marketing cost source exists. Built here (not inside
    // PnLFinancialTable) using the same netRevenueOf() every row/SKU in the table already calls,
    // so `spend = 1.5% × r.net` lines up exactly with the Net Rev the table actually displays for
    // that row — summed by bare SubCategory (not Category::SubCategory) to match adSpendMap's own
    // lookup key (adSpendMap[sc]), consistent with how every other channel's adSpendMap is keyed.
    const EBO_SPEND_RATE = 0.015
    const eboAdSpendMap = {}
    Object.entries(eboSubCatData).forEach(([, scMap]) => {
      Object.entries(scMap).forEach(([sc, d]) => {
        const net = netRevenueOf(d).net
        eboAdSpendMap[sc] = (eboAdSpendMap[sc] || 0) + net * EBO_SPEND_RATE
      })
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
        const rowSndCovered = x.snd != null
        if (rowSndCovered) { d.snd += x.snd || 0; d.sndNetCovered += x.net || 0; d.anySnd = true }
        // Same ASP-based COGS fallback PnLFinancialTable.jsx's costsForSkus() uses (via shared
        // estimateCogsPerUnit in ./pnlUtils.js) for any SKU missing a real cogs-data.json entry —
        // previously this trend calc read cogsMap[x.sku].cogs directly with NO fallback, so a day
        // with SKUs not yet in the cost sheet showed a different (lower-coverage) COGS%/GM%/
        // CM1%/CM2% here than the whole-range Financial View table for the identical date range.
        const netUnits = Math.max((x.units || 0) - (x.returnedUnits || 0), 0)
        const entry = cogsMap?.[x.sku]
        const asp = (x.units || 0) > 0 ? (x.gross || 0) / x.units : 0
        const perUnitCogs = (entry && entry.cogs != null) ? entry.cogs : estimateCogsPerUnit(asp)
        const rowCosted = perUnitCogs > 0 || netUnits > 0
        if (rowCosted) {
          d.cogs += perUnitCogs * netUnits
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

    // D2C day-wise SnD per SKU — same rate-slab lookup shSkuCosts/shSndBySku use, just grouped by
    // (date, sku) via shDailySkuCostRows (see api/bq.js) instead of the whole range. Real per-day
    // computation, not a whole-range rate applied uniformly across days — same standard as
    // Amazon VC's dailyPnLBySku (fresh per-day margin-slab calc, not an averaged rate).
    const shDailySndBySku = (() => {
      const rows = data?.shopify?.dailySkuCostRows
      if (!sndRates || !rows?.length) return {}
      const out = {}
      rows.forEach(row => {
        const { date, sku, orderStatus, weightSlab, lineCount, totalQty, grossIncGst } = row
        if (!sku) return
        // Same d2cSubCh scoping shSkuCosts (the whole-range equivalent) already applies — without
        // this, every Overall/MyFrido/Mobility view showed identical (unfiltered) day-wise SnD.
        if (d2cSubCh === 'Mobility' && row.subChannel !== 'mobility') return
        if (d2cSubCh === 'MyFrido' && row.subChannel !== 'myfrido') return
        const effectiveSlab = weightSlab != null ? weightSlab : 2000
        const rate = rateForSlab(sndRates, effectiveSlab)
        let logistics = 0
        const fulfilment = rate ? rate.fulfilment * lineCount : 0
        if (rate) {
          const st = (orderStatus || '').toLowerCase()
          if (st === 'cancelled') logistics = 0
          else if (st === 'rto') logistics = (rate.forward + rate.rto) * lineCount
          else if (st === 'cir' || st === 'exchange' || st === 'return') logistics = (rate.forward + rate.reverse) * lineCount
          else logistics = rate.forward * lineCount
        }
        const paymentGw = grossIncGst * 0.011
        const softwareFee = totalQty * 15
        const key = `${date}::${sku}`
        out[key] = (out[key] || 0) + logistics + fulfilment + paymentGw + softwareFee
      })
      return out
    })()

    // D2C day-wise COGS%/GM%/SnD%/CM1%/CM2% for the trend chart — same "covered net" convention
    // and ASP-COGS fallback (estimateCogsPerUnit) as amzDailyPnL above, built from shDailySKU
    // (real per-day Net Revenue via netRevenueOf()) and shDailySndBySku (real per-day SnD above).
    const shDailyPnL = (() => {
      const allRows = data?.shopify?.dailySKU || []
      // Same d2cSubCh scoping as shSubCatData/shSkuData above — without this, the trend chart's
      // day-wise %-metrics were always computed from ALL sub-channels combined, identical on
      // every Overall/MyFrido/Mobility view regardless of the selected toggle.
      const rows = d2cSubCh === 'all' ? allRows : allRows.filter(x => d2cSubCh === 'Mobility' ? x.subChannel === 'mobility' : d2cSubCh === 'MyFrido' ? x.subChannel === 'myfrido' : true)
      // Day-wise Meta+Google ad spend (adsDailyByCategory has no MyFrido/Mobility dimension at
      // all — only product Category, e.g. "Mobility" the CATEGORY, which is a different concept
      // from the Mobility SUB-CHANNEL toggle and coincidentally shares the name) — so "Overall"
      // gets the real, exact day-wise total (matches the KPI card precisely), while MyFrido/
      // Mobility approximate it via the same revenue-share ratio already used for the raw
      // Gross/Net Revenue trend line on those views (confirmed acceptable with the user).
      const shTotalRevForRatio = data?.shopify?.totals?.rev || 0
      const subChGrossForRatio = rows.reduce((s, x) => s + (x.rev || 0), 0)
      const cm2Ratio = d2cSubCh !== 'all' && shTotalRevForRatio > 0 ? subChGrossForRatio / shTotalRevForRatio : 1
      const spendByDate = {}
      ;(data.ads?.adsDailyByCategory || []).filter(x => x.platform === 'Meta' || x.platform === 'Google').forEach(x => {
        spendByDate[x.date] = (spendByDate[x.date] || 0) + (x.spend || 0) * cm2Ratio
      })
      const byDate = {}
      rows.forEach(x => {
        if (!byDate[x.date]) byDate[x.date] = { date: x.date, gross: 0, excRev: 0, net: 0, totalReturnRev: 0, snd: 0, sndNetCovered: 0, anySnd: false, cogs: 0, netCovered: 0, anyCosted: false, cm1NetCovered: 0, cm2NetCovered: 0 }
        const d = byDate[x.date]
        const r = netRevenueOf(x, undefined, {}, undefined, shNetScale)
        d.gross += r.gross
        d.excRev += r.excRev
        d.net += r.net
        d.totalReturnRev += r.totalReturnRev
        const snd = shDailySndBySku[`${x.date}::${x.sku}`]
        const rowSndCovered = snd != null
        if (rowSndCovered) { d.snd += snd; d.sndNetCovered += r.net; d.anySnd = true }
        const entry = cogsMap?.[x.sku]
        const asp = r.units > 0 ? r.gross / r.units : 0
        const perUnitCogs = (entry && entry.cogs != null) ? entry.cogs : estimateCogsPerUnit(asp)
        const rowCosted = perUnitCogs > 0 || r.netUnits > 0
        if (rowCosted) {
          d.cogs += perUnitCogs * r.netUnits
          d.netCovered += r.net
          d.anyCosted = true
        }
        if (rowCosted && rowSndCovered) { d.cm1NetCovered += r.net; d.cm2NetCovered += r.net }
      })
      return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map(d => {
        const gm = d.anyCosted ? d.netCovered - d.cogs : null
        const cm1Covered = d.anyCosted && d.anySnd
        const cm1 = cm1Covered ? gm - d.snd : null
        const spend = spendByDate[d.date] || 0
        const cm2 = cm1Covered ? cm1 - spend : null
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
      // fk.subCategories has one row per (category, subcategory, sub) — sub being FBF/NON-FBF —
      // so a plain `fkSubCatData[cat][sc] = {...}` assignment here silently OVERWRITES the FBF
      // row with the NON-FBF row (or vice versa, whichever the array visits last), discarding
      // roughly half of every subcategory's real revenue. Must ACCUMULATE across both `sub`
      // values into the same (category, subcategory) bucket instead — confirmed this was
      // silently collapsing Net Revenue and inflating COGS%/SnD% to nonsensical levels (COGS%
      // >95%) before this fix, caught via a full CM1/CM2 waterfall sanity check (GM - SnD did
      // not equal CM1, which it must by construction).
      const existing = fkSubCatData[x.category][x.subcategory] || { rev: 0, excRev: 0, units: 0, returnRev: 0, deliveredRev: 0 }
      fkSubCatData[x.category][x.subcategory] = {
        rev: existing.rev + (x.rev || 0),
        excRev: existing.excRev + (x.excRev || 0),
        units: existing.units + (x.units || 0),
        returnRev: existing.returnRev + (x.returnRev || 0),
        deliveredRev: existing.deliveredRev + (x.deliveredRev || 0),
      }
    })
    // returnRev already combines Return+RTO (Flipkart doesn't split them — see fkNetCalc's note
    // in api/bq.js), passed as returnRev with rtoRev/cirRev omitted so netRevenueOf()'s
    // totalReturnRev = cancelRev+rtoRev+cirRev+returnRev doesn't double-count. cancelRev is
    // rev - deliveredRev ONLY (deliveredRev in fkSubCategory's SQL is "FulfilmentStatus !=
    // 'Cancelled' AND positive revenue", which already INCLUDES Return/RTO rows — subtracting
    // returnRev again here double-counted it and always went negative, silently clamped to 0,
    // meaning cancelRev read as 0 for every row). Verified against an independent whole-channel
    // BQ query to within 0.1-0.36% across Mar-Jun 2026 after this correction. Computed AFTER the
    // accumulation above (not per-sub-row) since deliveredRev/rev/returnRev must be summed across
    // both fulfilment types first.
    Object.keys(fkSubCatData).forEach(cat => {
      Object.keys(fkSubCatData[cat]).forEach(sc => {
        const d = fkSubCatData[cat][sc]
        const cancelRev = Math.max(d.rev - d.deliveredRev, 0)
        fkSubCatData[cat][sc] = pick({ rev: d.rev, excRev: d.excRev, units: d.units, returnRev: d.returnRev, cancelRev })
      })
    })
    // fk.skuMatrix gives the (category, subcategory, sku) grouping and whole-range rev/units;
    // fk.dailyPnLBySku (built alongside sndBySku in api/bq.js's flipkart block) carries the real
    // per-SKU totalReturnRev this grouping lacks — merge them so fkSkuData's rows aren't missing
    // returns the way fk.skuMatrix alone would leave them (same bug fkSubCatData had above).
    const fkReturnRevBySku = {}, fkReturnedUnitsBySku = {}
    ;(fk.dailyPnLBySku || []).forEach(x => {
      fkReturnRevBySku[x.sku] = (fkReturnRevBySku[x.sku] || 0) + (x.totalReturnRev || 0)
      fkReturnedUnitsBySku[x.sku] = (fkReturnedUnitsBySku[x.sku] || 0) + (x.returnedUnits || 0)
    })

    const fkSkuData = {}
    Object.entries(fk.skuMatrix || {}).forEach(([cat, scMap]) => {
      fkSkuData[cat] = {}
      Object.entries(scMap).forEach(([sc, skuMap]) => {
        fkSkuData[cat][sc] = {}
        Object.entries(skuMap).forEach(([sku, d]) => {
          // totalReturnRev already folds cancel+return together for Flipkart (see fkNetCalc's
          // note) — passed as returnRev with cancelRev left at 0 so netRevenueOf() doesn't add it
          // twice. returnedUnits lets netRevenueOf() derive netUnits (gross units minus
          // returned/cancelled) so COGS prices only units that stayed sold, not gross units —
          // without this, COGS silently overstated by pricing every returned unit too.
          fkSkuData[cat][sc][sku] = { ...d, returnRev: fkReturnRevBySku[sku] || 0, cancelRev: 0, returnedUnits: fkReturnedUnitsBySku[sku] || 0 }
        })
      })
    })

    // Flipkart day-wise COGS%/GM%/SnD%/CM1%/CM2% trend — same algorithm as amzDailyPnL above
    // (per-day accumulate, ASP-fallback COGS via estimateCogsPerUnit, per-row SnD/COGS coverage
    // gating so CM1/CM2 only count days where a row has BOTH), simpler here since
    // fk.dailyPnLBySku already carries a real per-row `snd` field with no SC/VC-style merge
    // needed. Without this, the Flipkart tab's trend chart silently dropped every %-metric from
    // its picker (PnLChannelTab's availableMetrics filters out all axis:'pct' metrics unless
    // dailyPnL is non-empty) even though whole-range SnD/COGS/CM1/CM2 already worked correctly
    // in the KPI cards and Financial Table.
    const fkDailyPnL = (() => {
      const byDate = {}
      ;(fk.dailyPnLBySku || []).forEach(x => {
        if (!byDate[x.date]) byDate[x.date] = { date: x.date, gross: 0, excRev: 0, net: 0, totalReturnRev: 0, snd: 0, sndNetCovered: 0, anySnd: false, cogs: 0, netCovered: 0, anyCosted: false, cm1NetCovered: 0, cm2NetCovered: 0 }
        const d = byDate[x.date]
        d.gross += x.gross || 0
        d.excRev += x.excRev || 0
        d.net += x.net || 0
        d.totalReturnRev += x.totalReturnRev || 0
        const rowSndCovered = x.snd != null
        if (rowSndCovered) { d.snd += x.snd || 0; d.sndNetCovered += x.net || 0; d.anySnd = true }
        const netUnits = Math.max((x.units || 0) - (x.returnedUnits || 0), 0)
        const entry = cogsMap?.[x.sku]
        const asp = (x.units || 0) > 0 ? (x.gross || 0) / x.units : 0
        const perUnitCogs = (entry && entry.cogs != null) ? entry.cogs : estimateCogsPerUnit(asp)
        const rowCosted = perUnitCogs > 0 || netUnits > 0
        if (rowCosted) {
          d.cogs += perUnitCogs * netUnits
          d.netCovered += x.net || 0
          d.anyCosted = true
        }
        if (rowCosted && rowSndCovered) { d.cm1NetCovered += x.net || 0; d.cm2NetCovered += x.net || 0 }
      })
      const spendByDate = {}
      ;(data.ads?.adsDailyByCategory || []).filter(x => x.platform === 'Flipkart').forEach(x => {
        spendByDate[x.date] = (spendByDate[x.date] || 0) + (x.spend || 0)
      })
      return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map(d => {
        const gm = d.anyCosted ? d.netCovered - d.cogs : null
        const cm1Covered = d.anyCosted && d.anySnd
        const cm1 = cm1Covered ? gm - d.snd : null
        const spend = spendByDate[d.date] || 0
        const cm2 = cm1Covered ? cm1 - spend : null
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
    // ── International (Channel='International', both Amazon International + Shopify
    // International sub-brands) — same simple single-Channel shape as CRED/Firstcry/Myntra above.
    const intl = data.international || {}

    // ── Offline (row-array shape, sub-channel filterable) ──
    const off = data.offline || {}
    const isOffB2B = sc => sc === 'Shopify B2B' || sc?.startsWith('Offline_B2B')
    const isOffStockist = sc => sc?.startsWith('Stockist')
    const filterOffSub = rows => {
      if (offlineSub === 'all') return rows
      if (offlineSub === 'b2b') return rows.filter(r => isOffB2B(r.subChannel))
      if (offlineSub === 'Stockist') return rows.filter(r => isOffStockist(r.subChannel))
      if (offlineSub === 'MTGT') return rows.filter(r => r.subChannel === 'MTGT')
      // Miscellaneous: catch-all for any offline SubChannel that isn't B2B/Stockist/MTGT — picks
      // up new SubChannel values (e.g. a future BQ sync) automatically with no code change needed.
      if (offlineSub === 'misc') return rows.filter(r => !isOffB2B(r.subChannel) && !isOffStockist(r.subChannel) && r.subChannel !== 'MTGT')
      return rows.filter(r => r.subChannel === offlineSub)
    }
    // Offline has no Cancel/RTO/Return/CIR order-status concept — its equivalent of a "return" is
    // a Credit Note (Order_Status='Credit Note'), which the API now surfaces per Category/
    // SubCategory as cnRev (Inc-GST, offlineSubCategory query in api/bq.js). Fed into `returnRev`
    // (the same field pick()/netRevenueOf() read for every other channel's Returns KPI) so the
    // "Returns" card and Return% actually reflect Credit Notes instead of always showing 0.
    const offSubCatData = {}
    filterOffSub(off.subCategoryRows || []).forEach(x => {
      if (!offSubCatData[x.category]) offSubCatData[x.category] = {}
      if (!offSubCatData[x.category][x.subCategory]) offSubCatData[x.category][x.subCategory] = { rev: 0, excRev: 0, units: 0, returnRev: 0 }
      offSubCatData[x.category][x.subCategory].rev += x.rev || 0
      offSubCatData[x.category][x.subCategory].excRev += x.excRev || 0
      offSubCatData[x.category][x.subCategory].units += x.units || 0
      offSubCatData[x.category][x.subCategory].returnRev += Math.abs(x.cnRev || 0)
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
        // shNetScale (computed above, right after shSubCatData, so shDailyPnL can use it too) — see
        // that computation's comment for the full reconciliation rationale.
        const n = netOf(shSubCatData, shNetScale)
        // For Mobility sub-channel, override net revenue with manager-defined filter
        // (paid/pending/partially_paid × Delivered/Dispatched/Exchange/Blank, SellingPrice_Exc_GST)
        // computed server-side as mobilityNetCalc and stored in subChannelMap.Mobility.netRev —
        // takes priority over netCalc.netRev above, since netCalc isn't Mobility-scoped.
        if (d2cSubCh === 'Mobility') {
          const mobilityNet = data.subChannelMap?.Mobility?.netRev
          if (mobilityNet != null && mobilityNet > 0) n.net = mobilityNet
        }
        // Reconcile mobilityNetBySubCat's SubCategory keys against shSubCatData's actual
        // SubCategory names before exposing it below — mobilityNetBySubCat is built server-side
        // from a SEPARATE BigQuery query (mobilityNetBySubCat, keyed by raw SubCategory ALONE,
        // with no Category dimension) than shSubCatData (built here from pnlSalesRows, which null-
        // coalesces a missing sub_category to 'Others'). Two real problems this must handle:
        // (1) a row whose SubCategory is null/blank can independently normalize to two different
        // names across these two paths (observed: 'Frido' in one, 'Others' in the other) — an
        // orphaned whitelist key like that would silently never attach to a Financial View row;
        // (2) the SAME SubCategory name can appear under TWO DIFFERENT Categories (observed:
        // 'Sparepart' exists under both Category='Mobility' and Category='Sparepart (Chair &
        // Mobility)') — since netRevenueOf() looks up mobilityNetBySubCat BY BARE SUBCATEGORY NAME
        // (no Category dimension), a flat SubCategory-only map would apply that ONE whitelist
        // value to BOTH rows independently, double-counting it in the Financial Table's Total sum
        // versus the KPI card's true whole-range total (mobilityNetCalc) — this is why the two
        // previously disagreed by exactly one Sparepart-value's worth even after case (1) above
        // was fixed. Guarded against by keying this reconciled map by 'Category::SubCategory' and
        // changing consumers (PnLFinancialTable.jsx's mapRow, kpiSummary below) to look up that
        // same composite key instead of bare SubCategory.
        const reconciledMobilityNetBySubCat = {}
        if (d2cSubCh === 'Mobility' && sh.mobilityNetBySubCat) {
          const scToCats = new Map()
          Object.entries(shSubCatData).forEach(([cat, scMap]) => Object.keys(scMap).forEach(sc => {
            if (!scToCats.has(sc)) scToCats.set(sc, [])
            scToCats.get(sc).push(cat)
          }))
          Object.entries(sh.mobilityNetBySubCat).forEach(([sc, val]) => {
            const cats = scToCats.get(sc)
            if (!cats || cats.length === 0) {
              // Orphaned — no row anywhere has this SubCategory name; fold into whichever
              // Category actually has an 'Others' bucket in shSubCatData (there's normally at
              // most one, since 'Others' itself is a null-coalesce fallback, not a real product
              // category), defaulting to a bare 'Others::Others' key if none exists at all.
              const othersCat = Object.keys(shSubCatData).find(cat => shSubCatData[cat]?.Others) || 'Others'
              const key = `${othersCat}::Others`
              reconciledMobilityNetBySubCat[key] = (reconciledMobilityNetBySubCat[key] || 0) + val
            } else if (cats.length === 1) {
              const key = `${cats[0]}::${sc}`
              reconciledMobilityNetBySubCat[key] = (reconciledMobilityNetBySubCat[key] || 0) + val
            } else {
              // SubCategory name collides across multiple Categories — the raw whitelist query has
              // no Category dimension to split this by, so distribute proportionally to each
              // colliding row's own gross revenue share (same fallback already used for Mobility's
              // whitelist-net-by-SKU distribution elsewhere in this file).
              const grossByCat = cats.map(cat => shSubCatData[cat]?.[sc]?.rev || 0)
              const totalGross = grossByCat.reduce((s, g) => s + g, 0)
              cats.forEach((cat, i) => {
                const share = totalGross > 0 ? val * (grossByCat[i] / totalGross) : val / cats.length
                const key = `${cat}::${sc}`
                reconciledMobilityNetBySubCat[key] = (reconciledMobilityNetBySubCat[key] || 0) + share
              })
            }
          })
        }
        // Scale daily values by subchannel share when MyFrido/Mobility is selected
        const shTotalRev = sh.totals?.rev || 0
        const isSubChFiltered = d2cSubCh === 'MyFrido' || d2cSubCh === 'Mobility'
        const subChRatio = (isSubChFiltered && shTotalRev > 0) ? n.gross / shTotalRev : 1
        const daily = subChRatio === 1 ? (sh.daily || []) : (sh.daily || []).map(d => ({ ...d, rev: (d.rev || 0) * subChRatio, excRev: (d.excRev || 0) * subChRatio }))
        // shDailyPnL is unscaled by subChRatio unlike `daily` above — every one of its fields
        // (cogsPct/sndPct/gmPct/cm1Pct) is a ratio (numerator ÷ denominator), and MyFrido/Mobility
        // filtering would scale both halves of each ratio by the same factor, leaving the % itself
        // unchanged — only the raw ₹ `daily` line needs the scale-down, not this %-only series.
        return { subCatData: shSubCatData, skuData: shSkuData, daily, dailyPnL: shDailyPnL, ...n, netScale: shNetScale, mobilityNetBySubCat: reconciledMobilityNetBySubCat, orders: d2cSubCh === 'all' ? (sh.totals?.orders || 0) : (data.subChannelMap?.[d2cSubCh]?.orders || 0) }
      })(),
      ebo: { subCatData: eboSubCatData, skuData: eboSkuData, daily: ebo.daily || [], gross: ebo.totals?.rev || 0, net: ebo.netCalc?.netRev ?? 0, units: ebo.totals?.qty || 0, orders: ebo.totals?.orders || 0, returnRev: (ebo.netCalc?.cancelRev || 0) + (ebo.netCalc?.rtoRev || 0) + (ebo.netCalc?.cirRev || 0) + (ebo.netCalc?.returnRev || 0), adSpendMap: eboAdSpendMap },
      // Net Revenue intentionally stays on netOf()'s row-level blended-GST formula (NOT
      // amzPreciseNetRev/amzSC.netCalc.netRev) — same reasoning as D2C: the precise figure is a
      // whole-range total with no per-Category/SubCategory breakdown, so it can't feed the
      // Financial View table's row-level GM%/CM1%/etc, and using it only for the KPI headline
      // made the KPI card diverge visibly from the table's Total row (confirmed by the user — a
      // ₹12.48 Cr vs ₹14.82 Cr mismatch on the same date range). PnL's Net Revenue is now
      // consistently the same formula everywhere (KPI card = table Total = trend chart) for both
      // Amazon and D2C, even though neither ties exactly to the Sales tab's more precise figure —
      // that gap is a known, accepted methodology difference, not a bug to keep chasing.
      amazon: (() => { const n = netOf(amzSubCatData); return { subCatData: amzSubCatData, skuData: amzSkuData, daily: amzDaily, dailyPnL: amzDailyPnL, amzTotalGross, ...n } })(),
      // Flipkart/CRED/Firstcry/Myntra: same reasoning as D2C above — kept on netOf()'s
      // revenue-weighted blended-GST formula (not the channel's own precise netCalc.netRev) so
      // the KPI card stays consistent with the Financial View table's row-level math within
      // this tab, even though it won't tie exactly to the Sales tab's more precise figure.
      flipkart: (() => { const n = netOf(fkSubCatData); return { subCatData: fkSubCatData, skuData: fkSkuData, daily: fk.daily || [], dailyPnL: fkDailyPnL, ...n } })(),
      blinkit: (() => { const sc = qcSubCatOf(bl); const n = netOf(sc); return { subCatData: sc, skuData: bl.skuMatrix || {}, daily: bl.daily || [], ...n } })(),
      instamart: (() => { const sc = qcSubCatOf(ins); const n = netOf(sc); return { subCatData: sc, skuData: ins.skuMatrix || {}, daily: ins.daily || [], ...n } })(),
      zepto: (() => { const sc = qcSubCatOf(zp); const n = netOf(sc); return { subCatData: sc, skuData: zp.skuMatrix || {}, daily: zp.daily || [], ...n } })(),
      cred: (() => { const sc = simpleSubCatOf(cr.subCategories || []); const n = netOf(sc); return { subCatData: sc, skuData: cr.skuMatrix || {}, daily: cr.daily || [], ...n } })(),
      firstcry: (() => { const sc = simpleSubCatOf(fc.subCategories || []); const n = netOf(sc); return { subCatData: sc, skuData: fc.skuMatrix || {}, daily: fc.daily || [], ...n } })(),
      myntra: (() => { const sc = simpleSubCatOf(mn.subCategories || []); const n = netOf(sc); return { subCatData: sc, skuData: mn.skuMatrix || {}, daily: mn.daily || [], ...n } })(),
      international: (() => { const sc = simpleSubCatOf(intl.subCategories || []); const n = netOf(sc); return { subCatData: sc, skuData: intl.skuMatrix || {}, daily: intl.daily || [], ...n } })(),
      offline: (() => { const n = netOf(offSubCatData); return { subCatData: offSubCatData, skuData: offSkuData, daily: offDaily, ...n } })(),
    }
  }, [data, amzChannelView, offlineSub, d2cSubCh, cogsMap, sndRates])

  const CHANNEL_COLORS = { all: '#94939F', shopify: '#FFD600', ebo: '#8B5E3C', amazon: '#E8930A', flipkart: '#2E74CC', blinkit: '#0D9E68', cred: '#CC4078', firstcry: '#9B56B6', instamart: '#4AB89A', zepto: '#858380', myntra: '#E87858', international: '#0D9E68', offline: '#6B7280' }

  const activeData = channelData ? (channelData[activeTab] || channelData.all) : null
  const activeTabMeta = PNL_TABS.find(t => t.id === activeTab)

  const activeSndBySku = activeTab === 'shopify' ? shSndBySku : activeTab === 'ebo' ? eboSndBySku : activeTab === 'offline' ? offSndBySku : (activeTab === 'amazon' && amzChannelView === 'sc') ? amzSndBySku : (activeTab === 'amazon' && amzChannelView === 'vc') ? amzVCSndBySku : (activeTab === 'amazon' && amzChannelView === 'all') ? amzAllSndBySku : activeTab === 'flipkart' ? data?.flipkart?.sndBySku : undefined
  const activeAdSpendMap = activeTab === 'amazon' && amzChannelView === 'all' ? amzAdSpendMap : activeTab === 'shopify' ? (data?.pnlAdSpendMap || {}) : activeTab === 'ebo' ? (activeData?.adSpendMap || {}) : activeTab === 'flipkart' ? fkAdSpendMap : undefined
  // International and Offline have no attributable ad spend (same treatment as Amazon SC/VC
  // individually) — Marketing Spend/ROAS/CM2 columns are hidden rather than showing an
  // always-zero spend.
  const activeShowMarketing = !(activeTab === 'amazon' && (amzChannelView === 'sc' || amzChannelView === 'vc')) && activeTab !== 'international' && activeTab !== 'offline'
  // "All" D2C ad-spend covers SubCategories with no matching sales row in this exact range (an
  // unattributed remainder) — only fold that bucket in when viewing the unfiltered D2C total, or
  // MyFrido/Mobility's own numbers would silently absorb spend that belongs to the other sub-channel.
  const activeIncludeUnmatched = activeTab === 'shopify' && d2cSubCh === 'all'
  // Sourced from channelData's reconciled version (activeData.mobilityNetBySubCat), NOT the raw
  // data.shopify.mobilityNetBySubCat server payload — the raw version's SubCategory keys can
  // include names (e.g. a null-SubCategory row normalizing to 'Frido' server-side) that don't
  // match any SubCategory actually present in activeData.subCatData (which instead null-coalesces
  // to 'Others'), silently excluding that whitelist value from every per-row consumer (this KPI
  // card, the Financial Table) while the whole-range KPI net total included it — a real, visible
  // gap between the two for the exact same date range. See channelData's shopify branch above.
  const activeMobilityNetBySubCat = activeTab === 'shopify' && d2cSubCh === 'Mobility' ? (activeData?.mobilityNetBySubCat || {}) : {}
  // netScale reconciles PnL's row-level Net Revenue to the Sales tab's whole-range figure (see
  // the `shopify` block's netScale comment in channelData above) — only ever non-1 for D2C
  // Overall/MyFrido. Threaded into kpiSummary's own netRevenueOf() calls below so COGS%/GM%/
  // CM1%/CM2% (which divide by this same rescaled net) stay consistent with the KPI card and
  // Financial Table, which already receive it via activeData.netScale / the netScale prop.
  const activeNetScale = activeData?.netScale ?? 1

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
    let cm1 = 0, cm1NetCovered = 0, anyCm1 = false, cm2NetCovered = 0
    if (!activeData) {
      return { net, cogs: null, gm: null, snd: null, cm1: null, spend, cm2: null, roas: null, cogsPct: null, gmPct: null, sndPct: null, cm1Pct: null, spendPct: null, cm2Pct: null }
    }
    // Ad spend is keyed by SubCategory name only (activeAdSpendMap[sc]) — sum it once per unique
    // sc, NOT once per (cat, sc) iteration below, or any SubCategory name that appears under 2+
    // Categories gets its spend added multiple times (this previously inflated D2C's "All" Mktg
    // Spend/CM2 by counting "Mouse Wrist Support"/"Sparepart" — both shared across categories —
    // 2x). PnLFinancialTable.jsx's totSpend avoids this the same way, by summing Object.entries
    // (adSpendMap) directly instead of accumulating inside the per-row loop.
    const visibleScSet = new Set()
    Object.values(activeData.subCatData || {}).forEach(scMap => Object.keys(scMap).forEach(sc => visibleScSet.add(sc)))
    Array.from(visibleScSet).forEach(sc => { spend += activeAdSpendMap?.[sc] || 0 })
    Object.entries(activeData.subCatData || {}).forEach(([cat, scMap]) => {
      Object.entries(scMap).forEach(([sc, d]) => {
        // Net Revenue via the shared netRevenueOf() formula (./pnlUtils.js) — previously this
        // block hand-rolled its own totalReturn = cancelRev+rtoRev+cirRev+returnRev WITHOUT
        // subtracting codCancelRev, unlike netRevenueOf()/netOf() (which the KPI card's own
        // "Net Revenue" figure, the Financial View Total row, and the trend chart all use). COD
        // cancellations are pre-dispatch drops, not true returns, so omitting the exclusion here
        // overstated Returns and understated Net Revenue for D2C specifically (the only channel
        // with real cod_cancel_rev) versus every other number on this exact same KPI row.
        const rowR = netRevenueOf(d, sc, activeMobilityNetBySubCat, cat, activeNetScale)
        const rowNet = rowR.net
        const excRev = d.excRev || 0
        net += rowNet
        grossExcRev += excRev

        let rowCogs = 0, rowNetCovered = 0, rowAnyCosted = false, rowSnd = 0, rowSndNetCovered = 0, rowAnySnd = false
        const skuEntriesForRow = Object.entries(activeData.skuData?.[cat]?.[sc] || {})
        // Mobility whitelist net is a SUBCATEGORY-level override — distribute it proportionally
        // across this subcategory's SKUs by each SKU's own standard-formula net share, exactly
        // like PnLFinancialTable.jsx's costsForSkus() does (same whitelistNet/standardNetTotal
        // pattern). Without this, kpiSummary summed each SKU's un-overridden netRevenueOf(sd).net
        // directly — since that call passes no scName/catName, the whitelist guard is a permissive
        // no-op there, so every Mobility SKU's COGS/GM/CM1 silently used the standard formula
        // instead of the manager-defined whitelist net the Financial Table's Total row correctly
        // uses, producing a real KPI-vs-Total CM1%/CM2% mismatch confirmed live (58.6% vs 38.4%
        // for the same date range).
        const rowWhitelistNet = activeMobilityNetBySubCat[`${cat}::${sc}`] != null ? activeMobilityNetBySubCat[`${cat}::${sc}`] : null
        const rowStandardNetTotal = rowWhitelistNet != null ? skuEntriesForRow.reduce((s, [, sd]) => s + netRevenueOf(sd, undefined, {}, undefined, activeNetScale).net, 0) : 0
        skuEntriesForRow.forEach(([sku, sd]) => {
          const skRStandard = netRevenueOf(sd, undefined, {}, undefined, activeNetScale)
          const skR = rowWhitelistNet != null && rowStandardNetTotal > 0
            ? { ...skRStandard, net: rowWhitelistNet * (skRStandard.net / rowStandardNetTotal) }
            : skRStandard
          const skNet = skR.net
          const netUnits = skR.netUnits
          const entry = cogsMap?.[sku]
          // Same ASP-fallback estimate PnLFinancialTable.jsx's costsForSkus() and this file's own
          // amzDailyPnL already use for any SKU missing a real cogs-data.json entry — without this,
          // this block silently dropped uncosted SKUs from both cogs and netCovered instead of
          // estimating them, so kpiSummary's COGS%/GM%/CM1%/CM2% covered a DIFFERENT set of SKUs
          // than the Financial View table's identical-looking %s for the same date range.
          const skUnits = skR.units || 0
          const skAsp = skUnits > 0 ? skR.gross / skUnits : 0
          const perUnitCogs = (entry && entry.cogs != null) ? entry.cogs : estimateCogsPerUnit(skAsp)
          if (perUnitCogs > 0 || netUnits > 0) { rowCogs += perUnitCogs * netUnits; rowNetCovered += skNet; rowAnyCosted = true }
          if (activeSndBySku && activeSndBySku[sku] != null) { rowSnd += activeSndBySku[sku]; rowSndNetCovered += skNet; rowAnySnd = true }
        })
        if (rowAnyCosted) { cogs += rowCogs; netCovered += rowNetCovered; anyCosted = true }
        if (rowAnySnd) { snd += rowSnd; sndNetCovered += rowSndNetCovered; anySnd = true }
        // CM1 is computed and gated PER ROW (rowGm - rowSnd, only when BOTH costs are known for
        // this row) then summed — exactly like PnLFinancialTable.jsx's tot.cm1 (which sums only
        // rows where r.cm1Covered is true). Previously this derived CM1 from whole-range
        // accumulators (netCovered - cogs - snd) gated on whole-range anyCosted/anySnd flags,
        // which let a row that's COGS-covered but NOT SnD-covered (or vice versa) leak its COGS/
        // net into the global gm term even though the table correctly excludes that exact row
        // from CM1 — a genuine per-row-vs-aggregate mismatch, not just a rounding difference.
        if (rowAnyCosted && rowAnySnd) {
          const rowGm = rowNetCovered - rowCogs
          cm1 += rowGm - rowSnd
          cm1NetCovered += rowNet
          cm2NetCovered += rowNet
          anyCm1 = true
        }
      })
    })
    const gm = anyCosted ? netCovered - cogs : null
    const cm1Covered = anyCm1
    const cm1Final = cm1Covered ? cm1 : null
    const cm2 = cm1Covered ? cm1 - spend : null
    return {
      net, cogs: anyCosted ? cogs : null, gm, snd: anySnd ? snd : null, cm1: cm1Final, spend, cm2,
      // ROAS = Gross Revenue (Ex GST, before returns) ÷ Marketing Spend — same formula and same
      // numerator base ("Revenue (Ex GST) / Spend") the Ads tab's own Overall ROAS card uses, so
      // this always matches that number exactly rather than drifting via a different revenue base.
      roas: spend > 0 ? grossExcRev / spend : null,
      cogsPct: anyCosted && netCovered > 0 ? (cogs / netCovered * 100) : null,
      gmPct: gm != null && netCovered > 0 ? (gm / netCovered * 100) : null,
      sndPct: anySnd && sndNetCovered > 0 ? (snd / sndNetCovered * 100) : null,
      cm1Pct: cm1Final != null && cm1NetCovered > 0 ? (cm1Final / cm1NetCovered * 100) : null,
      spendPct: net > 0 ? (spend / net * 100) : null,
      cm2Pct: cm2 != null && cm2NetCovered > 0 ? (cm2 / cm2NetCovered * 100) : null,
    }
  }, [activeData, activeSndBySku, activeAdSpendMap, cogsMap, activeMobilityNetBySubCat, activeNetScale])

  if (!data || !channelData) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
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
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {[{ id: 'all', label: 'Overall' }, { id: 'MyFrido', label: 'MyFrido' }, { id: 'Mobility', label: 'Mobility' }].map((opt, i) => (
              <div key={opt.id} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <div style={{ width: 1, height: 14, background: '#E3E0D8', margin: '0 2px' }} />}
                <button onClick={() => setD2cSubCh(opt.id)} style={{ fontSize: 12, fontWeight: d2cSubCh === opt.id ? 700 : 500, padding: '5px 14px', borderRadius: 7, border: 'none', background: d2cSubCh === opt.id ? '#FFD600' : 'transparent', color: '#13121A', cursor: 'pointer' }}>{opt.label}</button>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'amazon' && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {[{ id: 'all', label: 'Overall' }, { id: 'sc', label: 'Seller Central' }, { id: 'vc', label: 'Vendor Central' }].map((opt, i) => (
              <div key={opt.id} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <div style={{ width: 1, height: 14, background: '#E3E0D8', margin: '0 2px' }} />}
                <button onClick={() => setAmzChannelView(opt.id)} style={{ fontSize: 12, fontWeight: amzChannelView === opt.id ? 700 : 500, padding: '5px 14px', borderRadius: 7, border: 'none', background: amzChannelView === opt.id ? '#FFD600' : 'transparent', color: '#13121A', cursor: 'pointer' }}>{opt.label}</button>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'offline' && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {[{ id: 'all', label: 'Overall' }, { id: 'b2b', label: 'B2B' }, { id: 'Stockist', label: 'Stockist' }, { id: 'MTGT', label: 'MT GT' }, { id: 'misc', label: 'Miscellaneous' }].map((opt, i) => (
              <div key={opt.id} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <div style={{ width: 1, height: 14, background: '#E3E0D8', margin: '0 2px' }} />}
                <button onClick={() => setOfflineSub(opt.id)} style={{ fontSize: 12, fontWeight: offlineSub === opt.id ? 700 : 500, padding: '5px 14px', borderRadius: 7, border: 'none', background: offlineSub === opt.id ? '#FFD600' : 'transparent', color: '#13121A', cursor: 'pointer' }}>{opt.label}</button>
              </div>
            ))}
          </div>
        )}
        <PnLChannelTab
          title={activeTabMeta?.label || 'PnL'}
          note={activeTab === 'amazon' ? (amzChannelView === 'all' ? 'SC + VC' : amzChannelView === 'sc' ? 'Seller Central' : 'Vendor Central') : activeTab === 'offline' ? (offlineSub === 'all' ? undefined : offlineSub === 'misc' ? 'Miscellaneous' : offlineSub) : activeTab === 'shopify' ? (d2cSubCh === 'all' ? undefined : d2cSubCh) : undefined}
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
          netScale={activeData?.netScale ?? 1}
          hideTrendUnits={activeTab === 'amazon' || activeTab === 'shopify'}
        />
        {activeTab === 'ebo' && <StorePnLTable rows={storePnLRows} />}
      </div>
    </div>
  )
}
