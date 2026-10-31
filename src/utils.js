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
import { ALERT_RULES, ADS_RULES, CUSTOMER_RULES } from './config/metricTargets.js'

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
  // Layout tokens (responsive overhaul). Theme-independent, so plain values rather than getters.
  // Spacing is a 4/8 scale: C.space[4] === 16 (px).
  space: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 },
  // Page gutters per breakpoint (mobile / tablet / desktop).
  gutter: { mobile: 16, tablet: 24, desktop: 32 },
  // Stacking order, low to high. Matches what the shell already uses: topnav 100, sidebar 400,
  // the mobile filter overlay 499/500.
  z: { base: 0, raised: 10, dropdown: 60, sticky: 80, nav: 100, drawer: 200, sidebar: 400, overlay: 499, modal: 500, toast: 600 },
  // Breakpoint minimum widths - same scale as src/responsive/useBreakpoint.js.
  bp: { xs: 0, sm: 480, md: 768, lg: 1024, xl: 1280, '2xl': 1536 },
  motion: { fast: '150ms', base: '200ms', slow: '250ms' },
  // Mobile palette + scale (docs/responsive/MOBILE_DESIGN_SYSTEM.md §1) for everything below
  // 1024px. One fixed palette - it does not follow the desktop theme picker (forest/gold/indigo),
  // so desktop keeps its theme and look exactly as before.
  m: {
    green: '#1f5a3d', greenDark: '#0f2a1d', header: 'linear-gradient(180deg,#0f2a1d,#1c4630)',
    g2: '#5f8f75', g3: '#9cc4ad', g4: '#d5dbd7',
    ink: '#1c2420', muted: '#7b847f', line: '#eeebe4', bg: '#f4f2ed', soft: '#f4f2ed', card: '#fff',
    up: '#1f8a4c', down: '#c0392b', amber: '#c8860a', prev: '#a3aba6', // prev: previous-period line + its legend swatch
    downDark: '#7a1f1f', // Inventory "Out of stock" (darker than Critical red), approved 2026-10-26
    masterGrad: 'linear-gradient(180deg,#dcebe2 0px,#e9f3ed 140px,#f4f9f6 300px,#ffffff 460px)', masterBorder: '#dbe8df',
    glowTile: '#e3f1e8', // phone nav launcher: current-page row
    navTile: '#edf6f0', // phone bottom bar: selected icon tile (34 × 30, radius 11, tight soft halo)
    // Phone page header, deep green (HEADER_GREEN_PROMPT.md): surface, context, chip text, icons, pressed, date pill, accent (count, underline), notification dot
    hdr: { bg: 'linear-gradient(160deg,#1a4d34 0%,#1f5a3d 55%,#266b49 100%)', context: '#a9c9b6', chip: '#c8dfd1', icon: '#d8e8de', press: 'rgba(255,255,255,.10)', pill: 'rgba(255,255,255,.14)', accent: '#9fe0b9', dot: '#e5534b' },
    // Phone bottom bar (light): surface, inactive icon, hairline + soft shadow
    nav: { bg: '#fbfaf7', icon: '#8a938e', shadow: '0 -1px 0 #e6e2d8, 0 -6px 16px -6px rgba(28,52,40,.14)' },
    tileBorder: 'rgba(31,90,61,.08)', glowBorder: 'rgba(31,90,61,.22)', glow: '0 0 10px 1px rgba(31,90,61,.10)',
    cardShadow: '0 1px 3px rgba(0,0,0,.06)',
    radius: { card: 18, tile: 12, chip: 999 },
    // px; nothing below 12
    type: { pageTitle: 17, cardTitle: 15.5, hero: 24, tileValue: 14, listValue: 13.5, body: 13, label: 12 }, // hero 24 / tile 14 on every page (2026-10-26)
  },
  // Mobile type scale (Overview mobile redesign): { size (px), weight }. Nothing on mobile goes
  // below 12px; labels are uppercase + muted (C.t3) at the `label` size.
  type: {
    pageTitle: { size: 17, weight: 600 },
    cardTitle: { size: 16, weight: 700 },
    hero: { size: 31, weight: 700 },
    value: { size: 19, weight: 700 },
    secondary: { size: 14.5, weight: 600 },
    label: { size: 12, weight: 600 },
    body: { size: 13, weight: 400 },
    min: 12,
  },
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
// #3/#4/#6/#11 read a dedicated static file (public/alerts-data.json), produced hourly by
// scripts/generate-alerts-cache.mjs directly from BigQuery for a FIXED mature window (orders
// 15-21 days ago for logistics, 14-20 days ago for returns). This is intentional and must not be
// changed back to reading logisticsData/data: those reflect whatever date range the user currently
// has selected in the app, so an alert built on them would silently depend on the viewer's own
// filter state instead of a fixed, always-current fact. See docs/ALERTS_BACKTEST.md.
let _alertsCache = null
let _alertsCachePromise = null
export function loadAlertsCache() {
  if (_alertsCachePromise) return _alertsCachePromise
  _alertsCachePromise = fetch('/alerts-data.json').then(r => r.ok ? r.json() : null).then(j => { _alertsCache = j; return j }).catch(() => { _alertsCache = null; return null })
  return _alertsCachePromise
}
// Synchronous read of whatever loadAlertsCache() last resolved (or null before the first load) —
// computeCombinedAlerts can't be async, so the caller (App.jsx) calls loadAlertsCache() once on
// mount and re-renders when it resolves, same pattern as the other static JSON fetches.
function getAlertsCache() { return _alertsCache }

export function computeCombinedAlerts(data, logisticsData, invSnapshotData, baseAlerts, profile) {
  const lkpi = logisticsData?.kpis || {}
  // Removed from Phase 1 bell per docs/ALERTS_PHASE1_PROMPT.md 2026-10-31 — superseded by ALERT_RULES.* — kept for reference
  // const lTotal = parseInt(lkpi.total_shipments) || 0
  // const lDelivered = parseInt(lkpi.delivered) || 0
  // const lRto = parseInt(lkpi.rto) || 0
  // const lSla = parseInt(lkpi.sla_breach) || 0
  // const lDelPct = lTotal > 0 ? lDelivered / lTotal * 100 : 0
  // const lRtoPct = lTotal > 0 ? lRto / lTotal * 100 : 0
  // const lSlaPct = lTotal > 0 ? lSla / lTotal * 100 : 0
  const lNdrDenom = parseInt(lkpi.ndr_denom_attempted) || 0
  const lNdrCount = parseInt(lkpi.ndr_count) || 0
  const lNdrPct = lNdrDenom > 0 ? lNdrCount / lNdrDenom * 100 : null
  const lOrdersDeliveredTotal = parseInt(lkpi.orders_delivered_total) || 0
  const lDeliveredWithin3dPickup = parseInt(lkpi.delivered_within_3d_of_pickup) || 0
  const lDeliveredWithin5dOrder = parseInt(lkpi.delivered_within_5d_of_order) || 0
  const lDeliveredWithin3dPickupPct = lOrdersDeliveredTotal > 0 ? lDeliveredWithin3dPickup / lOrdersDeliveredTotal * 100 : null
  const lDeliveredWithin5dOrderPct = lOrdersDeliveredTotal > 0 ? lDeliveredWithin5dOrder / lOrdersDeliveredTotal * 100 : null
  const lStuckCritical = parseInt(lkpi.critical_stuck) || 0

  const invSummary = invSnapshotData?.summary || {}

  // #1 Top-20 SKU stockout risk (inventory) — logic/threshold unchanged, click-nav added.
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
    return {
      type: atRisk >= 5 ? 'red' : 'amber', title: `${atRisk} of your top 20 best-selling SKUs at stockout risk`,
      body: 'Critical, Low, or Out of Stock status on a top-20-by-revenue SKU.',
      key: 'top20Stockout', requiredPermission: 'inventory', nav: { page: 'inventory', sub: 'health' },
    }
  })()

  // #2 Fleet-wide stockout risk (inventory) — ALERT_RULES.fleetStockoutSkus (> 250, unchanged).
  const fleetStockoutAlert = invSnapshotData && (invSummary.criticalLowCount || 0) > ALERT_RULES.fleetStockoutSkus
    ? { type: 'amber', title: `${fmtN(invSummary.criticalLowCount)} SKUs at stockout risk`, body: `Critical + Low stock status count above ${ALERT_RULES.fleetStockoutSkus} SKUs.`, key: 'fleetStockout', requiredPermission: 'inventory', nav: { page: 'inventory', sub: 'health' } }
    : null

  // #3/#4/#11/#6 read scripts/generate-alerts-cache.mjs's hourly static output (public/alerts-data.json)
  // for a FIXED mature window — NEVER logisticsData/data, which reflect the viewer's own selected
  // date range. loadAlertsCache() is kicked off once in the Dashboard mount effect; until it
  // resolves, getAlertsCache() returns null and these 4 alerts simply don't show this render.
  const alertsCache = getAlertsCache()
  const logCache = alertsCache?.logistics || null
  const retCache = alertsCache?.returns || null

  const deliveryAlert = logCache?.deliveryPct != null && logCache.deliveryPct < ALERT_RULES.deliveryPctMin
    ? { type: 'red', title: `Delivery % below ${ALERT_RULES.deliveryPctMin}%`, body: `${logCache.rangeLabel}: Delivery ${logCache.deliveryPct.toFixed(1)}%.`, key: 'deliveryPctLow', requiredPermission: 'logistics', nav: { page: 'logistics' } }
    : null
  const rtoAlert = logCache?.rtoPct != null && logCache.rtoPct > ALERT_RULES.rtoPctMax
    ? { type: 'red', title: `RTO % above ${ALERT_RULES.rtoPctMax}%`, body: `${logCache.rangeLabel}: RTO ${logCache.rtoPct.toFixed(1)}%.`, key: 'rtoPctHigh', requiredPermission: 'logistics', nav: { page: 'logistics' } }
    : null

  // #11 TAT/EDD breach % = SLA-breach share of delivered-with-EDD (on_time + sla_breach), the exact
  // kpis fields from api/logistics.js, computed by generate-alerts-cache.mjs against
  // expected_delivery_date_by_courier_partner. No fallback field: if the cache couldn't compute a
  // delivered-with-EDD population (slaBreachAvailable=false, or the cache is missing entirely), this
  // alert is SKIPPED, never silently substituted with a different denominator.
  const slaBreachAlert = logCache?.slaBreachAvailable && logCache.slaBreachPct != null && logCache.slaBreachPct > ALERT_RULES.slaBreachPctMax
    ? { type: 'amber', title: `TAT/EDD breach % above ${ALERT_RULES.slaBreachPctMax}%`, body: `${logCache.rangeLabel}: SLA-breach share ${logCache.slaBreachPct.toFixed(1)}% of delivered-with-EDD shipments.`, key: 'slaBreachHigh', requiredPermission: 'logistics', nav: { page: 'logistics' } }
    : null

  // #5 Stuck shipments above N — live snapshot count (kpis.critical_stuck), N=50.
  const stuckAlert = lStuckCritical > ALERT_RULES.stuckShipmentsMax
    ? { type: 'amber', title: `${fmtN(lStuckCritical)} shipments stuck`, body: `More than ${ALERT_RULES.stuckShipmentsMax} shipments stuck in-transit past EDD+5 days.`, key: 'stuckShipments', requiredPermission: 'logistics', nav: { page: 'logistics' } }
    : null

  // #6 D2C return-rate red lines (bell-only bars — the live Return Analysis page's own RED_THRESH
  // in src/sales/returnAnalysisData.js is untouched). Fixed window (orders 14-20 days ago), from the
  // same static cache as #3/#4/#11 — never the viewer's selected range.
  const d2cRedLineAlert = (() => {
    if (!retCache || retCache.gross == null || retCache.gross <= 0) return null
    const bars = ALERT_RULES.d2cRedLines
    const fired = []
    if (retCache.cancelPct != null && retCache.cancelPct > bars.cancelPct) fired.push(`Cancel ${retCache.cancelPct.toFixed(1)}%`)
    if (retCache.rtoPct != null && retCache.rtoPct > bars.rtoPct) fired.push(`RTO ${retCache.rtoPct.toFixed(1)}%`)
    if (retCache.cirPct != null && retCache.cirPct > bars.cirPct) fired.push(`CIR ${retCache.cirPct.toFixed(1)}%`)
    if (retCache.exchangePct != null && retCache.exchangePct > bars.exchangePct) fired.push(`Exchange ${retCache.exchangePct.toFixed(1)}%`)
    if (retCache.totalReturnPct != null && retCache.totalReturnPct > bars.totalReturnPct) fired.push(`Total Return ${retCache.totalReturnPct.toFixed(1)}%`)
    if (!fired.length) return null
    return { type: 'amber', title: 'D2C return-rate red line breached', body: `${retCache.rangeLabel}: ${fired.join(', ')}.`, key: 'd2cRedLines', requiredPermission: 'sales:shopify', nav: { page: 'sales', sub: 'shopify' } }
  })()

  // #7 Channel with 0 orders yesterday (most recent complete calendar day), grouped into one alert.
  // Excludes CRED/Firstcry (naturally thin/intermittent per the backtest). Reads the SAME static
  // alerts-data.json cache as #3/#4/#6/#11 (generate-alerts-cache.mjs's `zeroOrders` block) —
  // NEVER the viewer's selected range or the browser's local clock. The original version of this
  // alert (a client useMemo reading data.chMap/data.uniqueDates) had two compounding bugs found
  // during Phase 1 verification 2026-10-31: (1) it only ran when the user's currently-selected
  // date range happened to include yesterday, the same "must not depend on client filter state"
  // bug class already fixed for #3/#4/#6/#11; (2) it built "yesterday" from the browser's own
  // local timezone rather than IST, so on a mismatched clock the date it checked often had no
  // real orders synced yet for ANY channel — which is what caused it to flag "nearly every
  // channel" as zero-orders in the live test. Moved server-side with an explicit IST boundary.
  const zeroOrderAlert = (() => {
    const zc = alertsCache?.zeroOrders
    if (!zc?.zeroChannels?.length) return null
    const zero = zc.zeroChannels.filter(c => !ALERT_RULES.zeroOrderExcludeChannels.includes(c))
    if (!zero.length) return null
    return { type: 'amber', title: `0 orders yesterday: ${zero.join(', ')}`, body: `${zc.label}: no orders recorded on ${zero.join(', ')}.`, key: 'zeroOrders', requiredPermission: zero.map(c => `sales:${c.toLowerCase()}`), nav: { page: 'sales', sub: zero[0].toLowerCase() } }
  })()

  // #9 Ads: spend with no sales — ADS_RULES.noSalesSpend/noSalesRoas, one alert per platform
  // grouped by permission. Fixed 2026-10-31 (Phase 1 verification): this previously read
  // byAdType/totals' own `revenue` field directly, which is the raw ads-table column and is
  // ALWAYS 0 for Meta and Google (confirmed live: "Meta spend Rs6.85Cr, ROAS 0.00x" — a false
  // alert on every run). The live Ads page never uses that raw column for these two platforms —
  // src/ads/adsData.js's buildDailyByChannel/OVERALL_CHANNELS split D2C's Shopify sales between
  // Meta and Google by each platform's SHARE of that day's combined Meta+Google spend (the
  // platforms don't report attributed revenue for Shopify, so this is the same "total-sales
  // ROAS" convention the Ads page's own TOTAL_SALES_ROAS_INFO describes). Every other platform's
  // sales channel already carries real revenue 1:1 (Amazon ads -> Amazon sales, etc.), so only
  // Meta/Google need the spend-share split; the rest still use data.ads's own revenue field
  // because it already matches that platform's chMap entry by construction server-side.
  const adsNoSalesAlerts = (() => {
    const byAdType = data?.ads?.byAdType || data?.ads?.totals || []
    if (!byAdType.length) return []
    const byPlat = {}
    for (const r of byAdType) {
      const p = r.platform; if (!p) continue
      if (!byPlat[p]) byPlat[p] = { spend: 0, revenue: 0 }
      byPlat[p].spend += r.spend || 0
      byPlat[p].revenue += r.revenue || 0
    }
    // D2C (Meta+Google) sales-split revenue, same convention as adsData.js's buildDailyByChannel:
    // each platform's revenue = Shopify's total ex-GST sales for the range * (that platform's
    // spend / combined Meta+Google spend).
    const metaSpend = byPlat.Meta?.spend || 0
    const googleSpend = byPlat.Google?.spend || 0
    const d2cSpend = metaSpend + googleSpend
    const shopifyRev = data?.chMap?.Shopify?.excRev ?? data?.chMap?.Shopify?.rev ?? 0
    if (byPlat.Meta) byPlat.Meta.revenue = d2cSpend > 0 ? shopifyRev * (metaSpend / d2cSpend) : 0
    if (byPlat.Google) byPlat.Google.revenue = d2cSpend > 0 ? shopifyRev * (googleSpend / d2cSpend) : 0
    const ADS_KEY_MAP_LOWER = { All: 'ads:all', D2C: 'ads:d2c', Shopify: 'ads:d2c', Amazon: 'ads:amazon', Blinkit: 'ads:blinkit', Zepto: 'ads:zepto', Instamart: 'ads:instamart', Flipkart: 'ads:flipkart', Myntra: 'ads:myntra', CRED: 'ads:cred' }
    return Object.entries(byPlat).map(([platform, { spend, revenue }]) => {
      const roas = spend > 0 ? revenue / spend : 0
      if (spend > ADS_RULES.noSalesSpend && roas < ADS_RULES.noSalesRoas) {
        return { type: 'red', title: `${platform}: spend with no sales`, body: `Spend ${fmt(spend)} with ROAS ${roas.toFixed(2)}x (below ${ADS_RULES.noSalesRoas}x).`, key: `adsNoSales_${platform}`, requiredPermission: ADS_KEY_MAP_LOWER[platform] || 'ads:all', nav: { page: 'ads', sub: platform } }
      }
      return null
    }).filter(Boolean)
  })()

  // #10 Inventory data stale > 2h (admin only) — ALERT_RULES.inventoryStaleHours, unchanged.
  const staleInvAlert = (() => {
    if (!invSnapshotData?.asOf || !profile?.is_admin) return null
    const ageHours = (Date.now() - new Date(invSnapshotData.asOf).getTime()) / 36e5
    if (ageHours <= ALERT_RULES.inventoryStaleHours) return null
    return { type: 'amber', title: `Inventory data stale (${ageHours.toFixed(1)}h old)`, body: `public/inv-data.json is older than ${ALERT_RULES.inventoryStaleHours}h — the hourly precompute cron may be failing.`, key: 'invStale', requiredPermission: 'admin', nav: { page: 'inventory', sub: 'health' } }
  })()

  // #13 Customers: CAC up vs the previous period — ALERT_RULES.cacUpPctBell (15%), a bell-specific
  // constant (NOT CUSTOMER_RULES.cacUpPct, which also colors the Customer Intelligence page's own
  // in-page tile at 10% — kept separate so this alert doesn't silently recolor that tile).
  const cacUpAlert = (() => {
    const newCusts = (data?.nCusts || 0) - (data?.repeatCusts || 0)
    const prevNewCusts = (data?.prevNCusts || 0) - (data?.prevRepeatCusts || 0)
    if (newCusts <= 0 || prevNewCusts <= 0) return null
    const metaGoogleSpend = (data?.ads?.totals || []).filter(t => t.platform === 'Meta' || t.platform === 'Google').reduce((s, t) => s + (t.spend || 0), 0)
    const prevTotals = data?.ads?.prevTotals || {}
    const prevMetaGoogleSpend = (prevTotals['Meta']?.spend || 0) + (prevTotals['Google']?.spend || 0)
    if (!metaGoogleSpend || !prevMetaGoogleSpend) return null
    const cac = metaGoogleSpend / newCusts
    const prevCac = prevMetaGoogleSpend / prevNewCusts
    if (prevCac <= 0) return null
    const changePct = (cac - prevCac) / prevCac * 100
    if (changePct < ALERT_RULES.cacUpPctBell) return null
    return { type: 'amber', title: `CAC up ${changePct.toFixed(1)}% vs prior period`, body: `CAC ${fmt(cac)} vs ${fmt(prevCac)} previously.`, key: 'cacUp', requiredPermission: 'customer', nav: { page: 'customer' } }
  })()

  return [
    topSkuStockoutAlert,
    fleetStockoutAlert,
    deliveryAlert,
    rtoAlert,
    stuckAlert,
    d2cRedLineAlert,
    zeroOrderAlert,
    ...adsNoSalesAlerts,
    staleInvAlert,
    slaBreachAlert,
    cacUpAlert,
    ...(baseAlerts || []),
    // Removed from Phase 1 bell per docs/ALERTS_PHASE1_PROMPT.md 2026-10-31 — superseded by ALERT_RULES.* — kept for reference
    // ...(logisticsData ? [
    //   lDelPct > 0 && lDelPct < 80 ? { type: 'red', title: `Delivery% at ${lDelPct.toFixed(1)}%`, body: 'Below the 80% healthy threshold for the selected range.' } : null,
    //   lSlaPct > 15 ? { type: 'amber', title: `SLA Breach ${lSlaPct.toFixed(1)}%`, body: 'More than 15% of delivered shipments missed their committed SLA date.' } : null,
    //   lRtoPct > 10 ? { type: 'red', title: `RTO ${lRtoPct.toFixed(1)}%`, body: 'Return-to-origin rate above 10% for the selected range.' } : (lRtoPct > 8 ? { type: 'amber', title: `RTO ${lRtoPct.toFixed(1)}%`, body: 'Return-to-origin rate above the 8% healthy threshold.' } : null),
    //   lNdrPct !== null && lNdrPct > 20 ? { type: 'amber', title: `NDR ${lNdrPct.toFixed(1)}%`, body: 'More than 1 in 5 attempted deliveries needed a re-attempt.' } : null,
    // ].filter(Boolean) : []),
    ...(logisticsData ? [
      lNdrPct !== null && lNdrPct > 20 ? { type: 'amber', title: `NDR ${lNdrPct.toFixed(1)}%`, body: 'More than 1 in 5 attempted deliveries needed a re-attempt.', key: 'ndrHigh', requiredPermission: 'logistics', nav: { page: 'logistics' } } : null,
      lDeliveredWithin3dPickupPct !== null && lDeliveredWithin3dPickupPct < 80 ? { type: 'amber', title: `Delivered ≤3d of Pickup at ${lDeliveredWithin3dPickupPct.toFixed(1)}%`, body: '80% of shipments should deliver within 3 days of courier pickup.', key: 'del3dPickupLow', requiredPermission: 'logistics', nav: { page: 'logistics' } } : null,
      lDeliveredWithin5dOrderPct !== null && lDeliveredWithin5dOrderPct < 80 ? { type: 'amber', title: `Delivered ≤5d of Order at ${lDeliveredWithin5dOrderPct.toFixed(1)}%`, body: '80% of shipments should deliver within 5 days of order creation.', key: 'del5dOrderLow', requiredPermission: 'logistics', nav: { page: 'logistics' } } : null,
    ].filter(Boolean) : []),
    // #8 D2C CM1%/COGS% and #12 D2C SnD% — EXPLICITLY excluded from Phase 1 build per the task
    // brief ("exclude #8 ... and #12 ... — leave as commented placeholders only, do not build
    // them"). Thresholds from the backtest (CM1<48%, COGS>43%, SnD>9%) are recorded here for
    // whenever a future phase takes these up — NOT wired in.
    // #8: PNL_RULE_BARS.d2c.cm1/cogs-based bell check (CM1 < 48, COGS > 43) — not built.
    // #12: D2C SnD% > 9% bell check — not built (also has no existing PNL_RULE_BARS key).
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
// Standardized "is this range immature" check for Provisional Return%, confirmed 2026-10-19:
// matches the existing today-14d/today-44d rolling-mature-window convention api/bq.js already
// uses for Shopify's returnRateMature + the S&D rate card (RATE_COVERAGE_FLOOR/rollingStart/
// rollingEnd), NOT getMaturityAdjustedRange's separate 15d/45d convention above (that function
// does date-range SUBSTITUTION for one Overview tile; this one is a boolean check used to decide
// whether to show a second "Provisional" number alongside the real one — deliberately not
// reusing or changing getMaturityAdjustedRange so its one existing caller is untouched).
// Touches the immature window if the selected range's END date falls after the cutoff — a
// recent end date means at least the tail of the range hasn't had time to mature, same logic
// as getMaturityAdjustedRange's own boundary check.
export const PROVISIONAL_MATURITY_CUTOFF_DAYS = 14
export function rangeTouchesImmatureWindow(end) {
  if (!end) return false
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - PROVISIONAL_MATURITY_CUTOFF_DAYS)
  const endD = new Date(end + 'T00:00:00')
  if (Number.isNaN(endD)) return false
  return endD > cutoff
}

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
