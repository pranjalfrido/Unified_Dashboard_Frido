import { getBQ, buildQuery } from './_bq.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { start, end, category, subCategory, state } = req.body
  if (!start || !end) return res.status(400).json({ error: 'Missing start or end date' })

  const bq = getBQ()

  // Run all aggregation queries in parallel directly on BigQuery
  const rawBase = buildQuery(start, end)
  const filterClauses = []
  if (category) filterClauses.push(`Category = '${category.replace(/'/g, "''")}'`)
  if (subCategory) filterClauses.push(`SubCategory = '${subCategory.replace(/'/g, "''")}'`)
  if (state) filterClauses.push(`UPPER(TRIM(State)) = '${state.toUpperCase().replace(/'/g, "''")}'`)
  const base = filterClauses.length ? `SELECT * FROM (${rawBase}) WHERE ${filterClauses.join(' AND ')}` : rawBase

  const queries = {
    totals: `WITH q AS (${base}) SELECT COUNT(DISTINCT OrderId) AS n_orders, SUM(SellingPrice_Inc_GST) AS total_rev, SUM(SellingPrice_Exc_GST) AS total_exc_rev, SUM(ItemQty) AS total_qty, COUNT(DISTINCT OrderDate) AS n_days, COUNT(DISTINCT CustomerId) AS n_custs FROM q`,
    byChannel: `WITH q AS (${base}) SELECT Channel, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS qty FROM q GROUP BY Channel ORDER BY rev DESC`,
    byDate: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, Channel, SUM(SellingPrice_Inc_GST) AS rev, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units FROM q GROUP BY date, Channel ORDER BY date`,
    byCategory: `WITH q AS (${base}) SELECT Category, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units FROM q GROUP BY Category ORDER BY rev DESC`,
    byState: `WITH q AS (${base}) SELECT UPPER(TRIM(State)) AS state, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, COUNT(DISTINCT City) AS cities FROM q WHERE State IS NOT NULL GROUP BY UPPER(TRIM(State)) ORDER BY rev DESC LIMIT 30`,
    byOrderValue: `WITH q AS (${base}), ot AS (SELECT OrderId, SUM(SellingPrice_Inc_GST) AS order_rev FROM q GROUP BY OrderId) SELECT CASE WHEN order_rev < 500 THEN '<₹500' WHEN order_rev < 1000 THEN '₹500-1K' WHEN order_rev < 2500 THEN '₹1K-2.5K' WHEN order_rev < 5000 THEN '₹2.5K-5K' WHEN order_rev < 10000 THEN '₹5K-10K' WHEN order_rev < 25000 THEN '₹10K-25K' ELSE '₹25K+' END AS bucket, COUNT(*) AS cnt, SUM(order_rev) AS rev FROM ot GROUP BY 1`,
    byVoucher: `WITH q AS (${base}) SELECT CASE WHEN voucher_code IS NULL OR TRIM(voucher_code) = '' THEN 'No voucher' WHEN UPPER(voucher_code) LIKE '%PREPAID%' THEN 'PREPAID-DISCOUNT' WHEN UPPER(voucher_code) LIKE '%PLM%' THEN 'Loyalty (PLM)' WHEN UPPER(voucher_code) LIKE '%FRV%' THEN 'Repeat (FRV)' ELSE 'Other/custom' END AS voucher_type, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q GROUP BY 1`,
    byOrderStatus: `WITH q AS (${base}) SELECT Order_Status AS order_status, COUNT(DISTINCT OrderId) AS cnt, SUM(SellingPrice_Inc_GST) AS rev FROM q GROUP BY Order_Status`,
    highTicket: `WITH q AS (${base}), ot AS (SELECT OrderId, SUM(SellingPrice_Inc_GST) AS rev FROM q GROUP BY OrderId HAVING SUM(SellingPrice_Inc_GST) >= 10000) SELECT COUNT(*) AS ht_count, SUM(rev) AS ht_rev FROM ot`,
    multiItem: `WITH q AS (${base}), ot AS (SELECT OrderId, SUM(ItemQty) AS total_qty FROM q GROUP BY OrderId) SELECT COUNT(CASE WHEN total_qty > 1 THEN 1 END) AS multi_item_orders FROM ot`,
    repeatRate: `WITH in_range AS (SELECT DISTINCT customer_id FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist BETWEEN '${start}' AND '${end}' AND customer_id IS NOT NULL), prior AS (SELECT DISTINCT customer_id FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist < '${start}' AND customer_id IS NOT NULL) SELECT COUNT(*) AS n_custs, COUNTIF(p.customer_id IS NOT NULL) AS repeat_custs FROM in_range ir LEFT JOIN prior p USING (customer_id)`,
    bySubCategory: `WITH q AS (${base}) SELECT Category, SubCategory, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q GROUP BY Category, SubCategory ORDER BY rev DESC LIMIT 200`,
    byCategoryChannel: `WITH q AS (${base}) SELECT Category, Channel, SUM(SellingPrice_Inc_GST) AS rev FROM q GROUP BY Category, Channel`,
    byCity: `WITH q AS (${base}) SELECT TRIM(City) AS city, UPPER(TRIM(State)) AS state, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE City IS NOT NULL AND TRIM(City) != '' GROUP BY TRIM(City), UPPER(TRIM(State)) ORDER BY rev DESC LIMIT 50`,
    topOrders: `WITH q AS (${base}), ot AS (SELECT OrderId, CAST(OrderDate AS STRING) AS order_date, Channel, State, City, SUM(SellingPrice_Inc_GST) AS rev, SUM(ItemQty) AS qty, MAX(FulfilmentStatus) AS order_status, MAX(CustomerId) AS customer_id, MAX(voucher_code) AS voucher_code FROM q GROUP BY OrderId, OrderDate, Channel, State, City) SELECT * FROM ot ORDER BY rev DESC LIMIT 20`,
  }

  try {
    const results = await Promise.all(
      Object.entries(queries).map(([key, sql]) =>
        bq.query({ query: sql }).then(([rows]) => ({ key, rows }))
      )
    )
    const r = Object.fromEntries(results.map(({ key, rows }) => [key, rows]))

    const dateSet = [...new Set(r.byDate.map(x => x.date))].sort()
    const dailyArr = dateSet.map(date => {
      const entry = { date }
      r.byDate.filter(x => x.date === date).forEach(x => {
        entry[x.Channel] = parseFloat(x.rev) || 0
        entry[x.Channel + '_o'] = parseInt(x.orders) || 0
        entry[x.Channel + '_u'] = parseInt(x.units) || 0
      })
      return entry
    })

    const catMap = {}
    r.byCategory.forEach(x => { catMap[x.Category || 'Unknown'] = { rev: parseFloat(x.rev) || 0, excRev: parseFloat(x.exc_rev) || 0, orders: { size: parseInt(x.orders) }, units: parseInt(x.units) || 0 } })

    const subCatMap = {}
    r.bySubCategory.forEach(x => { subCatMap[x.SubCategory || 'Unknown'] = { rev: parseFloat(x.rev) || 0, orders: { size: parseInt(x.orders) || 0 }, category: x.Category || 'Unknown' } })

    const catChannelMap = {}
    r.byCategoryChannel.forEach(x => {
      const cat = x.Category || 'Unknown'
      if (!catChannelMap[cat]) catChannelMap[cat] = {}
      catChannelMap[cat][x.Channel] = parseFloat(x.rev) || 0
    })

    const stateMap = {}
    r.byState.forEach(x => { if (!x.state) return; stateMap[x.state] = { rev: parseFloat(x.rev) || 0, orders: parseInt(x.orders) || 0, cities: { size: parseInt(x.cities) } } })

    const cityRows = (r.byCity || []).map(x => ({ city: x.city, state: x.state, orders: parseInt(x.orders) || 0, rev: parseFloat(x.rev) || 0 }))

    const chMap = {}
    r.byChannel.forEach(x => { chMap[x.Channel] = { rev: parseFloat(x.rev) || 0, orders: parseInt(x.orders) || 0, qty: parseInt(x.qty) || 0 } })

    const orderStatusMap = {}
    const orderStatusRevMap = {}
    r.byOrderStatus.forEach(x => { orderStatusMap[x.order_status || 'Unknown'] = parseInt(x.cnt) || 0; orderStatusRevMap[x.order_status || 'Unknown'] = parseFloat(x.rev) || 0 })

    const bucketOrder = ['<₹500','₹500-1K','₹1K-2.5K','₹2.5K-5K','₹5K-10K','₹10K-25K','₹25K+']
    const buckets = Object.fromEntries(bucketOrder.map(k => [k, 0]))
    const bucketRev = Object.fromEntries(bucketOrder.map(k => [k, 0]))
    r.byOrderValue.forEach(x => { buckets[x.bucket] = parseInt(x.cnt) || 0; bucketRev[x.bucket] = parseFloat(x.rev) || 0 })

    const voucherMap = {}
    r.byVoucher.forEach(x => { voucherMap[x.voucher_type] = { orders: parseInt(x.orders) || 0, rev: parseFloat(x.rev) || 0 } })

    const t = r.totals[0] || {}
    const totalRev = parseFloat(t.total_rev) || 0
    const totalExcRev = parseFloat(t.total_exc_rev) || 0
    const nOrders = parseInt(t.n_orders) || 0
    const totalQty = parseInt(t.total_qty) || 0
    const nDays = parseInt(t.n_days) || 1
    const nCusts = parseInt(t.n_custs) || 0
    const repeatCusts = parseInt(r.repeatRate[0]?.repeat_custs) || 0
    const htCount = parseInt(r.highTicket[0]?.ht_count) || 0
    const htRevAgg = parseFloat(r.highTicket[0]?.ht_rev) || 0
    const multiItemOrders = parseInt(r.multiItem[0]?.multi_item_orders) || 0

    const orders = r.topOrders.map(x => ({
      orderId: x.OrderId, rev: parseFloat(x.rev) || 0, qty: parseInt(x.qty) || 0, items: parseInt(x.qty) || 0,
      channel: x.Channel, date: x.order_date, state: x.State, city: x.City,
      orderStatus: x.order_status, customerId: x.customer_id, voucher: x.voucher_code,
      isRTO: false, isCIR: false, isCancelled: false, isExchange: false
    }))

    res.json({
      source: 'postgres-aggregated',
      totalRev, totalExcRev, totalQty, nOrders, nDays,
      blendedAOV: nOrders ? totalRev / nOrders : 0,
      gstCollected: totalRev - totalExcRev,
      nCusts, repeatCusts,
      uniqueDates: dateSet,
      dailyArr, chMap, catMap, subCatMap, stateMap, cityRows, catChannelMap, orderStatusMap, orderStatusRevMap,
      buckets, bucketRev, voucherMap, tatOrders: [],
      htCount, htRev: htRevAgg, multiItemOrders,
      orders, rows: [],
    })
  } catch (err) {
    console.error('[api/bq]', err.message)
    res.status(500).json({ error: err.message })
  }
}
