// Overview's KPI calculations, moved out of OverviewPage (App.jsx) unchanged so the SAME code runs
// for the current period and for the previous-period ▲/▼ on mobile ("reuse the existing logic, no
// new formulas"). Every expression below is the one OverviewPage used inline before; comments on
// the reasoning behind each live with the original call sites in App.jsx.

// ── Sales headline KPIs (data = /api/bq or static P&L cache payload) ──
export function salesMetrics(data) {
  const { totalRev = 0, totalExcRev = 0, nOrders = 0, totalQty = 0, aspQty, blendedAOV = 0, rtoRevDirect, returnRev, cirRev, exchangeRev, netRevenueCalc = 0 } = data || {}
  const blendedASP = (aspQty || totalQty) > 0 ? totalRev / (aspQty || totalQty) : 0
  const cancelRev = data?.cancellRev || 0
  const cancelPct = totalRev > 0 ? cancelRev / totalRev * 100 : 0
  const rtoPct = totalRev > 0 ? ((rtoRevDirect || 0) + (returnRev || 0)) / totalRev * 100 : 0
  const cirPct = totalRev > 0 ? (cirRev || 0) / totalRev * 100 : 0
  const exchPct = totalRev > 0 ? (exchangeRev || 0) / totalRev * 100 : 0
  const totalReturnPct = cancelPct + rtoPct + cirPct
  return { totalRev, totalExcRev, nOrders, totalQty, blendedAOV, blendedASP, netRevenueCalc, cancelRev, cancelPct, rtoPct, cirPct, exchPct, totalReturnPct }
}

// ── Daily trend rows (heroTrendRaw) ──
// dailyArr only carries per-channel keys (Shopify, Shopify_net, Shopify_o, Shopify_u, …), so each
// day's totals are summed across channels. prevDailyArr (same length, aligned by index) gives the
// previous period's daily gross revenue.
export function trendRows(dailyArr, prevDailyArr) {
  return (dailyArr || []).map((d, i) => {
    const revenue = Object.entries(d).reduce((s, [k, v]) => (k !== 'date' && !k.endsWith('_o') && !k.endsWith('_u') && !k.endsWith('_net') && typeof v === 'number' ? s + v : s), 0)
    const netRevenue = Object.entries(d).reduce((s, [k, v]) => (k.endsWith('_net') && typeof v === 'number' ? s + v : s), 0)
    const units = Object.entries(d).reduce((s, [k, v]) => (k.endsWith('_u') && typeof v === 'number' ? s + v : s), 0)
    const orders = Object.entries(d).reduce((s, [k, v]) => (k.endsWith('_o') && typeof v === 'number' ? s + v : s), 0)
    const prevRev = prevDailyArr?.[i]?.rev ?? null
    return { date: d.date, revenue, netRevenue, units, orders, prevRevenue: prevRev }
  })
}

// Same daily/weekly/monthly grouping logic as ReturnTrendChart (D2CReturnAnalysisTab.jsx) —
// weekly buckets to ISO week-start (Monday), monthly buckets to YYYY-MM. Shared by the desktop
// Sales Trend chart and the mobile card so both aggregate the same way. `prev*` keys (previous
// period's per-metric daily values, mobile only) are summed the same way as their current twins.
export function groupHeroTrend(rows, groupBy) {
  if (groupBy === 'daily') return rows
  const buckets = {}
  rows.forEach(d => {
    const key = groupBy === 'weekly'
      ? (() => { const dt = new Date(d.date); const day = dt.getDay(); const diff = dt.getDate() - day + (day === 0 ? -6 : 1); return new Date(dt.setDate(diff)).toISOString().slice(0, 10) })()
      : d.date.slice(0, 7)
    if (!buckets[key]) buckets[key] = { date: key, revenue: 0, netRevenue: 0, units: 0, orders: 0, prevRevenue: 0 }
    const b = buckets[key]
    b.revenue += d.revenue
    b.netRevenue += d.netRevenue
    b.units += d.units
    b.orders += d.orders || 0
    if (d.prevRevenue !== null) b.prevRevenue += (d.prevRevenue || 0)
    for (const k of ['prevNetRevenue', 'prevUnits', 'prevOrders']) if (d[k] != null) b[k] = (b[k] || 0) + d[k]
  })
  return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date))
}

// ── Logistics & Ops (logisticsData = /api/logistics or /logistics-data.json `current`) ──
export function logisticsMetrics(logisticsData) {
  const lkpi = logisticsData?.kpis || {}
  const lTotal = parseInt(lkpi.total_shipments) || 0
  const lDelivered = parseInt(lkpi.delivered) || 0
  const lRto = parseInt(lkpi.rto) || 0
  const lZRto = parseInt(lkpi.z_rto) || 0
  const lSla = parseInt(lkpi.sla_breach) || 0
  const lDelPct = lTotal > 0 ? lDelivered / lTotal * 100 : 0
  const lRtoPct = lTotal > 0 ? lRto / lTotal * 100 : 0
  const lZRtoPct = lTotal > 0 ? lZRto / lTotal * 100 : 0
  const lSlaPct = lTotal > 0 ? lSla / lTotal * 100 : 0
  const lFasr = lkpi.delivered_1attempt && lkpi.total_ofd_attempts ? (parseInt(lkpi.delivered_1attempt) / (parseInt(lkpi.total_ofd_attempts) || 1) * 100) : null
  const lRasr = lkpi.delivered_multi && lkpi.total_ofd_attempts ? (parseInt(lkpi.delivered_multi) / (parseInt(lkpi.total_ofd_attempts) || 1) * 100) : null
  const lAvgFul = parseFloat(lkpi.avg_fulfilment) || null
  const lAvgProcessing = parseFloat(lkpi.avg_processing) || null
  const lAvgPickup = parseFloat(lkpi.avg_pickup) || null
  const lAvgIntransit = parseFloat(lkpi.avg_intransit) || null
  const lOrdersWithOrderDate = parseInt(lkpi.orders_with_order_date) || 0
  const lOrdersPickedUp = parseInt(lkpi.orders_picked_up) || 0
  const lOrdersDeliveredTotal = parseInt(lkpi.orders_delivered_total) || 0
  const lProcessedWithin24h = parseInt(lkpi.processed_within_24h) || 0
  const lPickedUpWithin24h = parseInt(lkpi.picked_up_within_24h) || 0
  const lDeliveredWithin3dPickup = parseInt(lkpi.delivered_within_3d_of_pickup) || 0
  const lDeliveredWithin5dOrder = parseInt(lkpi.delivered_within_5d_of_order) || 0
  const lProcessedWithin24hPct = lOrdersWithOrderDate > 0 ? lProcessedWithin24h / lOrdersWithOrderDate * 100 : null
  const lPickedUpWithin24hPct = lOrdersPickedUp > 0 ? lPickedUpWithin24h / lOrdersPickedUp * 100 : null
  const lDeliveredWithin3dPickupPct = lOrdersDeliveredTotal > 0 ? lDeliveredWithin3dPickup / lOrdersDeliveredTotal * 100 : null
  const lDeliveredWithin5dOrderPct = lOrdersDeliveredTotal > 0 ? lDeliveredWithin5dOrder / lOrdersDeliveredTotal * 100 : null
  const lNdrDenom = parseInt(lkpi.ndr_denom_attempted) || 0
  const lNdrCount = parseInt(lkpi.ndr_count) || 0
  const lNdrResolvedDelivered = parseInt(lkpi.ndr_resolved_delivered) || 0
  const lNdrPct = lNdrDenom > 0 ? lNdrCount / lNdrDenom * 100 : null
  const lNdrResolvedPct = lNdrCount > 0 ? lNdrResolvedDelivered / lNdrCount * 100 : null
  const lAvgRtoTat = parseFloat(lkpi.avg_rto_tat) || null
  const lRtoCompleted = parseInt(lkpi.rto_completed) || 0
  const lRtoDeliveredWithin5dMark = parseInt(lkpi.rto_delivered_within_5d_of_mark) || 0
  const lRtoDeliveredWithin10dMark = parseInt(lkpi.rto_delivered_within_10d_of_mark) || 0
  const lRtoDeliveredWithin5dMarkPct = lRtoCompleted > 0 ? lRtoDeliveredWithin5dMark / lRtoCompleted * 100 : null
  const lRtoDeliveredWithin10dMarkPct = lRtoCompleted > 0 ? lRtoDeliveredWithin10dMark / lRtoCompleted * 100 : null
  const lRvpCreated = parseInt(lkpi.rvp_created) || 0
  const lRvpDone = parseInt(lkpi.rvp_done) || 0
  const lRvpDelivered = parseInt(lkpi.rvp_delivered) || 0
  const lRvpDoneWithin2d = parseInt(lkpi.rvp_done_within_2d_of_created) || 0
  const lRvpDeliveredWithin5d = parseInt(lkpi.rvp_delivered_within_5d_of_done) || 0
  const lRvpDoneWithin2dPct = lRvpCreated > 0 ? lRvpDoneWithin2d / lRvpCreated * 100 : null
  const lRvpDeliveredWithin5dPct = lRvpDone > 0 ? lRvpDeliveredWithin5d / lRvpDone * 100 : null
  const lAvgRvpCreatedToPickup = parseFloat(lkpi.avg_rvp_created_to_pickup) || null
  const lAvgRvpPickupToDelivery = parseFloat(lkpi.avg_rvp_pickup_to_delivery) || null
  const lAvgRvpTat = parseFloat(lkpi.avg_rvp_tat) || null
  return {
    lTotal, lDelivered, lRto, lZRto, lSla, lDelPct, lRtoPct, lZRtoPct, lSlaPct, lFasr, lRasr, lAvgFul,
    lAvgProcessing, lAvgPickup, lAvgIntransit, lOrdersWithOrderDate, lOrdersPickedUp, lOrdersDeliveredTotal,
    lProcessedWithin24h, lPickedUpWithin24h, lDeliveredWithin3dPickup, lDeliveredWithin5dOrder,
    lProcessedWithin24hPct, lPickedUpWithin24hPct, lDeliveredWithin3dPickupPct, lDeliveredWithin5dOrderPct,
    lNdrDenom, lNdrCount, lNdrResolvedDelivered, lNdrPct, lNdrResolvedPct,
    lAvgRtoTat, lRtoCompleted, lRtoDeliveredWithin5dMark, lRtoDeliveredWithin10dMark, lRtoDeliveredWithin5dMarkPct, lRtoDeliveredWithin10dMarkPct,
    lRvpCreated, lRvpDone, lRvpDelivered, lRvpDoneWithin2d, lRvpDeliveredWithin5d, lRvpDoneWithin2dPct, lRvpDeliveredWithin5dPct,
    lAvgRvpCreatedToPickup, lAvgRvpPickupToDelivery, lAvgRvpTat,
  }
}

// ── Customers (overviewCustData = /api/customer, Shopify-only) ──
export function customerMetrics(custData) {
  const custKpis = custData?.kpis || {}
  const custRepeatRev = custKpis.repeatRevenue || 0
  const custNewRev = Math.max(0, (custKpis.grossSales || 0) - custRepeatRev)
  const custLtv = custKpis.ltv12 || 0
  const custTotalCustomers = custKpis.totalCustomers || 0
  const custNewCustomers = custKpis.newCustomers || 0
  return { custKpis, custRepeatRev, custNewRev, custLtv, custTotalCustomers, custNewCustomers }
}
