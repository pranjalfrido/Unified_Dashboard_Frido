// Theme colours, read live from the CSS custom properties in index.css.
//
// index.css is the single source of truth: it defines one token block per theme
// and the active one is selected by <html data-theme>. Every property below is a
// GETTER, so C.acc re-resolves on each read and follows a theme switch without
// any call site changing. The fallbacks are the gold (default) values, used only
// before first paint or in a non-browser context.
//
// Semantic colours (green/red/amber/blue) and the channel/courier colours are
// DATA ENCODINGS, not decoration - a reader maps them to a meaning - so they are
// identical across themes and several are kept as plain static values.
import { cssVar } from './theme.js'

const tok = (name, fallback) => cssVar(name, fallback)

export const C = {
  get acc(){ return tok("--acc", "#1F6F5C") },
  get acl(){ return tok("--acl", "#E6F2EE") },
  get acm(){ return tok("--acm", "#175A4A") },
  get acd(){ return tok("--acd", "#0E3F34") },
  get acs(){ return tok("--acs", "#A8D5C8") },
  // One step down from acl. Table headers and total rows sit on this so they read
  // as chrome against the near-white body, without needing light text.
  get ach(){ return tok("--ach", "#CFE8E0") },
  // Text/icons drawn ON the accent fill. Flips with the theme: the gold accent is
  // light and carries dark text, the indigo accent is dark and needs light text.
  get onAcc(){ return tok("--on-acc", "#FFFFFF") },
  // Accent as raw "r,g,b" channels, for rgba() glows and tints that need an alpha.
  // Mirrors --acc-rgb so a JS-built glow follows the theme like the CSS ones do.
  get accRgb(){ return tok("--acc-rgb", "31,111,92") },
  get bg(){ return tok("--bg", "#EDF1EF") },
  get card(){ return tok("--card","#fff") },
  get hov(){ return tok("--hov", "#F2F6F4") },
  get border(){ return tok("--b1", "#E2E9E6") },
  get border2(){ return tok("--b2", "#CBD8D3") },
  get t1(){ return tok("--t1", "#16211D") },
  get t2(){ return tok("--t2", "#42544E") },
  get t3(){ return tok("--t3", "#72847E") },
  // Elevation, matching --sh1/2/3. Use these instead of a border to separate a card.
  get sh1(){ return tok("--sh1","0 1px 2px rgba(40,38,30,.04),0 1px 3px rgba(40,38,30,.05)") },
  get sh2(){ return tok("--sh2","0 2px 4px rgba(40,38,30,.04),0 4px 12px rgba(40,38,30,.06)") },
  get sh3(){ return tok("--sh3","0 4px 8px rgba(40,38,30,.05),0 12px 28px rgba(40,38,30,.08)") },
  r: { sm: 8, md: 12, lg: 16, xl: 20 },
  get display(){ return tok("--display","Arial,Helvetica,sans-serif") },
  // Chart series palette as a SET. The accent leads, so it tracks the theme; the
  // rest are fixed hues chosen to stay distinguishable beside either accent.
  get series(){ return [this.acc, "#F2724F", "#3D9BE9", "#F0B429", "#2BB3A3", "#B06AD9", "#5C6B84"] },
  // Sequential ramp for parts-of-a-whole (donuts, stacked shares) where slices are
  // ordered by size and the eye should read rank, not category. Built from the
  // theme accent so it recolours on switch; steps are spaced on lightness so
  // neighbouring slices stay distinguishable in greyscale and for CVD viewers.
  get ramp(){
    const v = tok("--ramp", "").split(",").map(x => x.trim()).filter(Boolean)
    // Never hand a chart an empty palette: fall back to the default theme's ramp if
    // the token is missing (non-browser render, or before the stylesheet resolved).
    return v.length ? v : ["#0E3F34", "#175A4A", "#1F6F5C", "#4E9B87", "#88C4B3", "#BFE0D6"]
  },
  get green(){ return { bg: tok("--G", "#E4F3E7"), tx: tok("--Gt", "#1B6B33"), bd: tok("--Gb", "#93CFA4") } },
  get red(){   return { bg: tok("--R", "#FCE9E9"), tx: tok("--Rt", "#A82A2A"), bd: tok("--Rb", "#EFA3A3") } },
  get amber(){ return { bg: tok("--A", "#FCF2DF"), tx: tok("--At", "#8A5410"), bd: tok("--Ab", "#EFC680") } },
  get blue(){  return { bg: tok("--B", "#E6EFF9"), tx: tok("--Bt", "#1B4B84"), bd: tok("--Bb", "#8FB5DE") } },
  // Per-marketplace brand colours. Fixed in every theme: a reader maps these to a
  // specific channel, and the brands own the hues.
  ch: {
    Shopify: "#FFD600", "Shopify International": "#B8A000", Amazon: "#E8930A", Flipkart: "#2E74CC",
    Blinkit: "#0D9E68", CRED: "#CC4078", Instamart: "#4AB89A",
    Zepto: "#858380", Myntra: "#E87858", Firstcry: "#9B56B6", Pharmeasy: "#2ECC71", offline_sales: "#6B7280", EBO: "#8B5E3C"
  }
}

// Courier branding, shared by the Logistics Performance and Logistics Cost sidebars.
// Lives here rather than in App.jsx so both pages read from one definition.
// Keyed on BOTH spellings on purpose. The Logistics Performance tab reads courier names
// from BigQuery as "Skye Air" / "Urbane Bolt", while the B2C invoice ledger stores them
// as "SkyAir" / "Urbanbolt" — so a single spelling left those two showing a coloured
// initial instead of their logo on the cost tab.
export const COURIER_COLORS = {
  Bluedart: '#E8400A', Delhivery: '#E60000', 'Delhivery NDD': '#A00000',
  Ekart: '#F78F1E', ElasticRun: '#00509E', 'Elastic Run': '#00509E',
  Safexpress: '#1B4D9E', Shadowfax: '#6B3FA0', Shiprocket: '#E8400A',
  'Skye Air': '#00B0F0', SkyAir: '#00B0F0',
  Swift: '#13803A',
  'Urbane Bolt': '#2BB24C', Urbanbolt: '#2BB24C',
  // FTL/PTL transporters — assigned hues, not brand colours (no logos exist for these).
  Jopadevi: '#2a78d6', Reliable: '#eb6834', 'VS Transport': '#1baf7a',
  'ARB Logistic': '#eda100', 'KM-Logistic': '#4a3aa7',
}
export const COURIER_LOGOS = {
  Bluedart: '/blue-dart.jpg', Delhivery: '/Delhivery.png', 'Delhivery NDD': '/delhivery-ndd.png',
  'Bluedart B2B': '/blue-dart.jpg',
  Ekart: '/ekart_logistics_logo.jpg', ElasticRun: '/elasticrun_logo.jpg', 'Elastic Run': '/elasticrun_logo.jpg',
  Safexpress: '/safeexpress.webp', Shadowfax: '/shadow-fax.jpg', Shiprocket: '/shiprocket.jpg',
  'Skye Air': '/sky-air.webp', SkyAir: '/sky-air.webp',
  Swift: '/swift-courier.jpg',
  'Urbane Bolt': '/urban-bolt.jpg', Urbanbolt: '/urban-bolt.jpg',
}

export const fmt = v => {
  if (v == null || isNaN(v)) return '₹0'
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(2)} K`
  return `₹${Math.round(v).toLocaleString('en-IN')}`
}
export const fmtN = v => (v || 0).toLocaleString('en-IN')
export const fmtBig = v => {
  if (v == null || isNaN(v)) return '0'
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)}Cr`
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)}L`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return Math.round(v).toLocaleString('en-IN')
}
export const pct = (a, b) => b ? ((a / b) * 100).toFixed(1) + '%' : '0%'

export function processData(rows) {
  const orderMap = {}
  rows.forEach(r => {
    if (!orderMap[r.OrderId]) {
      orderMap[r.OrderId] = {
        orderId: r.OrderId, rev: 0, excRev: 0, qty: 0, items: 0,
        channel: r.Channel, subChannel: r.SubChannel, channelAccount: r.ChannelAccount,
        date: r.OrderDate?.slice(0, 10), state: r.State, city: r.City,
        customerId: r.CustomerId, voucher: r.voucher_code,
        dispatchDate: r.Dispatch_Date, deliverDate: r.Delivered_Date, orderStatus: r.Order_Status,
        financialStatus: r.FinancialStatus, fulfilmentStatus: r.FulfilmentStatus,
        isRTO: false, isCIR: false, isExchange: false, isCancelled: false, isReturn: false,
      }
    }
    const o = orderMap[r.OrderId]
    o.rev += parseFloat(r.SellingPrice_Inc_GST || 0)
    o.excRev += parseFloat(r.SellingPrice_Exc_GST || 0)
    o.qty += parseInt(r.ItemQty || 0)
    o.items += 1
    if (r.is_rto == 1) o.isRTO = true
    if (r.is_CIR_return == 1) o.isCIR = true
    if (r.is_exchange == 1) o.isExchange = true
    if (r.is_cancelled == 1) o.isCancelled = true
    // Order_Status='Return' bucket — newer channels (Amazon VC, Flipkart) carry their returns
    // under this status rather than the older is_rto/is_CIR_return/is_cancelled flags, which are
    // dbt-derived and don't cover it. Without this, netRevenueCalc below silently under-counted
    // total returns for any channel using the 'Return' status, not just VC — see
    // api/_bq.js's computeNetRevenueMeasures / netRevenueSelectFragment for the same bucket used
    // server-side, which this client-side calc is now kept consistent with.
    if (r.Order_Status === 'Return') o.isReturn = true
  })
  const orders = Object.values(orderMap)
  const totalRev = orders.reduce((s, o) => s + o.rev, 0)
  const totalExcRev = orders.reduce((s, o) => s + o.excRev, 0)
  const totalQty = orders.reduce((s, o) => s + o.qty, 0)
  const nOrders = orders.length
  const blendedAOV = nOrders ? totalRev / nOrders : 0
  const uniqueDates = [...new Set(orders.map(o => o.date).filter(Boolean))].sort()
  const nDays = uniqueDates.length || 1

  const chMap = {}
  orders.forEach(o => {
    if (!chMap[o.channel]) chMap[o.channel] = { rev: 0, orders: 0, qty: 0 }
    chMap[o.channel].rev += o.rev; chMap[o.channel].orders += 1; chMap[o.channel].qty += o.qty
  })

  const dailyChMap = {}
  orders.forEach(o => {
    const k = `${o.date}__${o.channel}`
    if (!dailyChMap[k]) dailyChMap[k] = { rev: 0, orders: 0, qty: 0, date: o.date, channel: o.channel }
    dailyChMap[k].rev += o.rev; dailyChMap[k].orders += 1; dailyChMap[k].qty += o.qty
  })
  const dailyMap = {}
  Object.values(dailyChMap).forEach(d => {
    if (!dailyMap[d.date]) dailyMap[d.date] = { date: d.date }
    dailyMap[d.date][d.channel] = (dailyMap[d.date][d.channel] || 0) + d.rev
    dailyMap[d.date][d.channel + '_o'] = (dailyMap[d.date][d.channel + '_o'] || 0) + d.orders
    dailyMap[d.date][d.channel + '_u'] = (dailyMap[d.date][d.channel + '_u'] || 0) + d.qty
  })
  const dailyArr = uniqueDates.map(d => dailyMap[d] || { date: d })

  const catMap = {}
  rows.forEach(r => {
    const cat = r.Category || 'Unknown'
    if (!catMap[cat]) catMap[cat] = { rev: 0, excRev: 0, orders: new Set(), units: 0 }
    catMap[cat].rev += parseFloat(r.SellingPrice_Inc_GST || 0)
    catMap[cat].excRev += parseFloat(r.SellingPrice_Exc_GST || 0)
    catMap[cat].orders.add(r.OrderId)
    catMap[cat].units += parseInt(r.ItemQty || 0)
  })

  const subCatMap = {}
  rows.forEach(r => {
    const cat = r.Category || 'Unknown'
    const sc = r.SubCategory || 'Unknown'
    const key = `${cat}::${sc}`
    if (!subCatMap[key]) subCatMap[key] = { rev: 0, orders: new Set() }
    subCatMap[key].rev += parseFloat(r.SellingPrice_Inc_GST || 0)
    subCatMap[key].orders.add(r.OrderId)
  })

  const stateMap = {}
  orders.forEach(o => {
    const s = ((o.state || 'Unknown').toUpperCase().trim()) || 'Unknown'
    if (!stateMap[s]) stateMap[s] = { rev: 0, orders: 0, cities: new Set() }
    stateMap[s].rev += o.rev; stateMap[s].orders += 1
    if (o.city) stateMap[s].cities.add(o.city.toUpperCase().trim())
  })

  const custFreqMap = {}
  orders.forEach(o => { if (o.customerId) custFreqMap[o.customerId] = (custFreqMap[o.customerId] || 0) + 1 })
  const custFreq = Object.values(custFreqMap)
  const nCusts = custFreq.length
  const repeatCusts = custFreq.filter(n => n >= 2).length

  const tatOrders = orders.filter(o => o.date && o.deliverDate).map(o => {
    return Math.round((new Date(o.deliverDate.slice(0, 10)) - new Date(o.date)) / 86400000)
  }).filter(d => d >= 0 && d <= 60)

  const bucketKeys = ['<₹500', '₹500-1K', '₹1K-2.5K', '₹2.5K-5K', '₹5K-10K', '₹10K-25K', '₹25K+']
  const buckets = Object.fromEntries(bucketKeys.map(k => [k, 0]))
  const bucketRev = Object.fromEntries(bucketKeys.map(k => [k, 0]))
  orders.forEach(o => {
    const v = o.rev
    const k = v < 500 ? '<₹500' : v < 1000 ? '₹500-1K' : v < 2500 ? '₹1K-2.5K' : v < 5000 ? '₹2.5K-5K' : v < 10000 ? '₹5K-10K' : v < 25000 ? '₹10K-25K' : '₹25K+'
    buckets[k]++; bucketRev[k] += v
  })

  const voucherMap = {}
  orders.forEach(o => {
    const v = o.voucher || ''
    const k = !v ? 'No voucher' : v.toUpperCase().includes('PREPAID') ? 'PREPAID-DISCOUNT' : v.toUpperCase().includes('PLM') ? 'Loyalty (PLM)' : v.toUpperCase().includes('FRV') ? 'Repeat (FRV)' : 'Other/custom'
    if (!voucherMap[k]) voucherMap[k] = { orders: 0, rev: 0 }
    voucherMap[k].orders++; voucherMap[k].rev += o.rev
  })

  const gstMap = {}
  rows.forEach(r => {
    const g = r.GST_Tax_Type_Code || 'Unknown'
    if (!gstMap[g]) gstMap[g] = { rev: 0, orders: new Set() }
    gstMap[g].rev += parseFloat(r.SellingPrice_Inc_GST || 0); gstMap[g].orders.add(r.OrderId)
  })

  const rtoRev = orders.filter(o => o.isRTO).reduce((s, o) => s + o.rev, 0)
  const cirRev = orders.filter(o => o.isCIR).reduce((s, o) => s + o.rev, 0)
  const cancellRev = orders.filter(o => o.isCancelled).reduce((s, o) => s + o.rev, 0)
  // returnRev = Order_Status='Return' bucket (Amazon VC, Flipkart, etc — see isReturn above).
  // Included in netRevenueCalc alongside RTO/CIR/Cancelled so this client-side "All Channels"
  // rollup stays consistent with api/_bq.js's computeNetRevenueMeasures, which already treats
  // 'Return' as a 4th deduction bucket server-side.
  const returnRev = orders.filter(o => o.isReturn).reduce((s, o) => s + o.rev, 0)
  const netRevenueCalc = totalRev - (totalRev - totalExcRev) - rtoRev - cirRev - cancellRev - returnRev

  return { totalRev, totalExcRev, totalQty, nOrders, blendedAOV, nDays, gstCollected: totalRev - totalExcRev, dailyArr, catMap, subCatMap, chMap, stateMap, nCusts, repeatCusts, tatOrders, buckets, bucketRev, voucherMap, gstMap, orders, rows, uniqueDates, rtoRev, cirRev, cancellRev, returnRev, netRevenueCalc }
}

export function detectAlerts(data) {
  const alerts = []
  const { orders, totalRev, uniqueDates, chMap, rows, nCusts, repeatCusts } = data
  // Revenue-decline and CIR-spike both compare a recent window against an earlier one — immature
  // tail-of-range dates (returns/CIR that haven't had 15 days to land yet) would otherwise make
  // the most recent days look artificially "down" or "clean", firing false alerts. Restrict both
  // checks to the maturity-adjusted date range before splitting into first/last half.
  const matRange = uniqueDates.length ? getMaturityAdjustedRange({ start: uniqueDates[0], end: uniqueDates[uniqueDates.length - 1] }) : null
  const matDates = matRange ? uniqueDates.filter(d => d >= matRange.start && d <= matRange.end) : uniqueDates
  const mid = Math.floor(matDates.length / 2)
  const fh = new Set(matDates.slice(0, mid)), lh = new Set(matDates.slice(mid))
  const fr = orders.filter(o => fh.has(o.date)).reduce((s, o) => s + o.rev, 0)
  const lr = orders.filter(o => lh.has(o.date)).reduce((s, o) => s + o.rev, 0)
  if (fr > 0 && (lr - fr) / fr * 100 < -10) alerts.push({ type: 'red', title: `Revenue declining ${Math.abs(((lr - fr) / fr) * 100).toFixed(1)}%`, body: `First half ${fmt(fr)} vs last half ${fmt(lr)} ${matRange?.label || ''}.` })
  const blRows = rows.filter(r => r.Channel === 'Blinkit' && parseFloat(r.SellingPrice_Exc_GST || 0) > 0)
  if (blRows.length) {
    const blInc = blRows.reduce((s, r) => s + parseFloat(r.SellingPrice_Inc_GST || 0), 0)
    const blExc = blRows.reduce((s, r) => s + parseFloat(r.SellingPrice_Exc_GST || 0), 0)
    if (blExc > 0 && (blInc - blExc) / blExc * 100 > 50) alerts.push({ type: 'red', title: 'Blinkit GST pipeline broken', body: `Implied GST = ${((blInc - blExc) / blExc * 100).toFixed(0)}%.` })
  }
  const matDateSet = new Set(matDates)
  const shopO = orders.filter(o => o.channel === 'Shopify' && (!matRange || matDateSet.has(o.date)))
  const cirRate = shopO.length ? shopO.filter(o => o.isCIR).length / shopO.length * 100 : 0
  if (cirRate > 10) alerts.push({ type: 'amber', title: `CIR returns ${cirRate.toFixed(1)}% (Shopify)`, body: `Review sizing and product quality ${matRange?.label || ''}.` })
  const repeatRate = nCusts ? repeatCusts / nCusts * 100 : 0
  if (repeatRate < 10 && nCusts > 0) alerts.push({ type: 'amber', title: `Repeat rate only ${repeatRate.toFixed(1)}%`, body: 'Launch CRM and loyalty programme.' })
  const qcChannels = ['Blinkit', 'Instamart', 'Zepto']
  const qcRev = qcChannels.reduce((s, c) => s + (chMap[c]?.rev || 0), 0)
  const qcOrds = qcChannels.reduce((s, c) => s + (chMap[c]?.orders || 0), 0)
  const qcAOV = qcOrds ? qcRev / qcOrds : 0
  if (qcAOV > 3000) alerts.push({ type: 'green', title: `Q-commerce AOV ${fmt(qcAOV)} — scale up`, body: 'Expand SKU catalogue across all 3 platforms.' })
  return alerts
}

// Combines the base Sales/Ads alerts (detectAlerts) with Logistics/Ops and Inventory rules that
// need logisticsData/invSnapshotData — both fetched separately from `data` and previously only
// available inside OverviewPage, which is why this used to live there as a local computation.
// Lifted to a standalone function so BOTH the Topnav alerts bell and the Overview popover can
// share one single source of truth, rather than risk drift between two separate copies of the
// same logic. Thresholds mirror the tile coloring used in the Logistics & Ops Performance card
// (Delivery% <80% red, RTO% >8%/>10% amber/red, SLA Breach% >15% amber, NDR% >20% amber, the two
// 80%-target SLA thresholds) and the Days of Inventory bands, so the alert and the tile it
// summarizes never disagree about what counts as a problem.
export function computeCombinedAlerts(data, logisticsData, invSnapshotData, baseAlerts) {
  const lkpi = logisticsData?.kpis || {}
  const lTotal = parseInt(lkpi.total_shipments) || 0
  const lDelivered = parseInt(lkpi.delivered) || 0
  const lRto = parseInt(lkpi.rto) || 0
  const lSla = parseInt(lkpi.sla_breach) || 0
  const lDelPct = lTotal > 0 ? lDelivered / lTotal * 100 : 0
  const lRtoPct = lTotal > 0 ? lRto / lTotal * 100 : 0
  const lSlaPct = lTotal > 0 ? lSla / lTotal * 100 : 0
  const lNdrDenom = parseInt(lkpi.ndr_denom_attempted) || 0
  const lNdrCount = parseInt(lkpi.ndr_count) || 0
  const lNdrPct = lNdrDenom > 0 ? lNdrCount / lNdrDenom * 100 : null
  const lOrdersDeliveredTotal = parseInt(lkpi.orders_delivered_total) || 0
  const lDeliveredWithin3dPickup = parseInt(lkpi.delivered_within_3d_of_pickup) || 0
  const lDeliveredWithin5dOrder = parseInt(lkpi.delivered_within_5d_of_order) || 0
  const lDeliveredWithin3dPickupPct = lOrdersDeliveredTotal > 0 ? lDeliveredWithin3dPickup / lOrdersDeliveredTotal * 100 : null
  const lDeliveredWithin5dOrderPct = lOrdersDeliveredTotal > 0 ? lDeliveredWithin5dOrder / lOrdersDeliveredTotal * 100 : null

  const invSummary = invSnapshotData?.summary || {}

  // Best-seller stockout check: of the top 20 SKUs by revenue, how many currently read
  // Critical/Low/Out of Stock in the inventory snapshot? A sharper signal than the all-SKU
  // Stockout-Risk count — losing sales on a BEST-SELLER is a bigger problem than the same status
  // on a long-tail SKU, so this leads the alerts list.
  const topSkuStockoutAlert = (() => {
    if (!invSnapshotData?.skus?.length || !data?.skuRows?.length) return null
    const topProductsMap = {}
    for (const r of data.skuRows) {
      const key = r.sku || 'Unknown'
      if (!topProductsMap[key]) topProductsMap[key] = { sku: key, rev: 0 }
      topProductsMap[key].rev += r.rev || 0
    }
    const top20 = Object.values(topProductsMap).sort((a, b) => b.rev - a.rev).slice(0, 20)
    const invBySku = new Map(invSnapshotData.skus.map(s => [String(s.sku).trim().toLowerCase(), s.stockStatus]))
    const atRisk = top20.filter(p => {
      const st = invBySku.get(String(p.sku).trim().toLowerCase())
      return st === 'Critical' || st === 'Low' || st === 'Out of Stock'
    }).length
    if (atRisk === 0) return null
    return { type: atRisk >= 5 ? 'red' : 'amber', title: `${atRisk} of your top 20 best-selling SKUs at stockout risk`, body: 'Critical, Low, or Out of Stock status on a top-20-by-revenue SKU.' }
  })()

  return [
    topSkuStockoutAlert,
    ...(baseAlerts || []),
    ...(logisticsData ? [
      lDelPct > 0 && lDelPct < 80 ? { type: 'red', title: `Delivery% at ${lDelPct.toFixed(1)}%`, body: 'Below the 80% healthy threshold for the selected range.' } : null,
      lSlaPct > 15 ? { type: 'amber', title: `SLA Breach ${lSlaPct.toFixed(1)}%`, body: 'More than 15% of delivered shipments missed their committed SLA date.' } : null,
      lRtoPct > 10 ? { type: 'red', title: `RTO ${lRtoPct.toFixed(1)}%`, body: 'Return-to-origin rate above 10% for the selected range.' } : (lRtoPct > 8 ? { type: 'amber', title: `RTO ${lRtoPct.toFixed(1)}%`, body: 'Return-to-origin rate above the 8% healthy threshold.' } : null),
      lNdrPct !== null && lNdrPct > 20 ? { type: 'amber', title: `NDR ${lNdrPct.toFixed(1)}%`, body: 'More than 1 in 5 attempted deliveries needed a re-attempt.' } : null,
      lDeliveredWithin3dPickupPct !== null && lDeliveredWithin3dPickupPct < 80 ? { type: 'amber', title: `Delivered ≤3d of Pickup at ${lDeliveredWithin3dPickupPct.toFixed(1)}%`, body: '80% of shipments should deliver within 3 days of courier pickup.' } : null,
      lDeliveredWithin5dOrderPct !== null && lDeliveredWithin5dOrderPct < 80 ? { type: 'amber', title: `Delivered ≤5d of Order at ${lDeliveredWithin5dOrderPct.toFixed(1)}%`, body: '80% of shipments should deliver within 5 days of order creation.' } : null,
    ].filter(Boolean) : []),
    ...(invSnapshotData ? [
      (invSummary.criticalLowCount || 0) > 250 ? { type: 'amber', title: `${fmtN(invSummary.criticalLowCount)} SKUs at stockout risk`, body: 'Critical + Low stock status count above 250 SKUs.' } : null,
    ].filter(Boolean) : []),
  ].filter(Boolean)
}

export function exportCSV(rows, filename = 'frido_export.csv') {
  if (!rows?.length) return
  const cols = Object.keys(rows[0])
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function localDateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Inclusive day count for a YYYY-MM-DD range, used as the divisor for daily run
// rate. Inclusive because a single-day range is one day of selling, not zero, and
// parsed as local midnight so a timezone offset cannot shift the count by one.
export function daysInRange(start, end) {
  if (!start || !end) return 0
  const a = new Date(start + 'T00:00:00'), b = new Date(end + 'T00:00:00')
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  const d = Math.floor((b - a) / 86400000) + 1
  return d > 0 ? d : 0
}

export function getDefaultDates() {
  const end = new Date()
  end.setDate(end.getDate() - 1)
  const start = new Date(end.getFullYear(), end.getMonth(), 1)
  return { start: localDateStr(start), end: localDateStr(end) }
}

// Shared by every Overview-tab metric whose orders need time to resolve (RTO%, Delivery%, SLA
// breach%, Z-RTO%, FASR, Avg Fulfilment/TAT, CIR%, Cancel%, Return%, and the revenue-decline/
// CIR-spike checks in detectAlerts) — a fixed 15-day maturity cutoff applied uniformly, so no
// metric silently reads immature tail-of-range data where returns/RTOs haven't had time to land
// yet. Selecting "last 7 days" for RTO% would otherwise show an artificially low rate simply
// because most of those orders haven't had 15 days to come back as an RTO.
//   maturityBoundary = today − 15d
//   if selectedRange.end is already mature (<= boundary): use the selected range as-is
//   else: fall back to the last mature 30-day window (today−45d to today−15d)
// Callers must show `label` in their own section heading — never substitute dates silently.
export function getMaturityAdjustedRange(selectedRange) {
  const today = new Date()
  const maturityBoundary = new Date(today)
  maturityBoundary.setDate(maturityBoundary.getDate() - 15)

  const selEnd = new Date(selectedRange.end)
  if (selEnd <= maturityBoundary) {
    return { start: selectedRange.start, end: selectedRange.end, isFallback: false, label: `· ${selectedRange.start} – ${selectedRange.end}` }
  }
  const fallbackEnd = new Date(maturityBoundary)
  const fallbackStart = new Date(today)
  fallbackStart.setDate(fallbackStart.getDate() - 45)
  const start = localDateStr(fallbackStart), end = localDateStr(fallbackEnd)
  return { start, end, isFallback: true, label: `· ${start} – ${end} (selected range too recent — showing last mature 30 days)` }
}
