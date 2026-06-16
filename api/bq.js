import { getPool } from './_db.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { start, end } = req.body
  if (!start || !end) return res.status(400).json({ error: 'Missing start or end date' })

  const pool = getPool()
  try {
    const [
      totals, byChannel, byDate, byCategory, byState, byOrderValue,
      byVoucher, byOrderStatus, customerStats, tatData, topOrders,
      highTicket, multiItemStats, bySubCategory
    ] = await Promise.all([
      pool.query(`SELECT COUNT(DISTINCT order_id) AS n_orders, SUM(revenue_inc_gst) AS total_rev, SUM(revenue_exc_gst) AS total_exc_rev, SUM(item_qty) AS total_qty, COUNT(DISTINCT order_date) AS n_days, COUNT(DISTINCT CASE WHEN channel IS NOT NULL THEN channel END) AS n_channels FROM orders WHERE order_date BETWEEN $1 AND $2`, [start, end]),
      pool.query(`SELECT channel, COUNT(DISTINCT order_id) AS orders, SUM(revenue_inc_gst) AS rev, SUM(revenue_exc_gst) AS exc_rev, SUM(item_qty) AS qty FROM orders WHERE order_date BETWEEN $1 AND $2 GROUP BY channel ORDER BY rev DESC`, [start, end]),
      pool.query(`SELECT order_date::text AS date, channel, SUM(revenue_inc_gst) AS rev, COUNT(DISTINCT order_id) AS orders FROM orders WHERE order_date BETWEEN $1 AND $2 GROUP BY order_date, channel ORDER BY order_date`, [start, end]),
      pool.query(`SELECT category, COUNT(DISTINCT order_id) AS orders, SUM(revenue_inc_gst) AS rev, SUM(revenue_exc_gst) AS exc_rev, SUM(item_qty) AS units FROM orders WHERE order_date BETWEEN $1 AND $2 GROUP BY category ORDER BY rev DESC`, [start, end]),
      pool.query(`SELECT UPPER(TRIM(state)) AS state, COUNT(DISTINCT order_id) AS orders, SUM(revenue_inc_gst) AS rev, COUNT(DISTINCT city) AS cities FROM orders WHERE order_date BETWEEN $1 AND $2 AND state IS NOT NULL GROUP BY UPPER(TRIM(state)) ORDER BY rev DESC LIMIT 30`, [start, end]),
      pool.query(`WITH order_totals AS (SELECT order_id, SUM(revenue_inc_gst) AS order_rev FROM orders WHERE order_date BETWEEN $1 AND $2 GROUP BY order_id) SELECT CASE WHEN order_rev < 500 THEN '<₹500' WHEN order_rev < 1000 THEN '₹500-1K' WHEN order_rev < 2500 THEN '₹1K-2.5K' WHEN order_rev < 5000 THEN '₹2.5K-5K' WHEN order_rev < 10000 THEN '₹5K-10K' WHEN order_rev < 25000 THEN '₹10K-25K' ELSE '₹25K+' END AS bucket, COUNT(*) AS cnt, SUM(order_rev) AS rev FROM order_totals GROUP BY 1`, [start, end]),
      pool.query(`SELECT CASE WHEN voucher_code IS NULL OR TRIM(voucher_code) = '' THEN 'No voucher' WHEN UPPER(voucher_code) LIKE '%PREPAID%' THEN 'PREPAID-DISCOUNT' WHEN UPPER(voucher_code) LIKE '%PLM%' THEN 'Loyalty (PLM)' WHEN UPPER(voucher_code) LIKE '%FRV%' THEN 'Repeat (FRV)' ELSE 'Other/custom' END AS voucher_type, COUNT(DISTINCT order_id) AS orders, SUM(revenue_inc_gst) AS rev FROM orders WHERE order_date BETWEEN $1 AND $2 GROUP BY 1`, [start, end]),
      pool.query(`SELECT order_status, COUNT(DISTINCT order_id) AS cnt, SUM(revenue_inc_gst) AS rev FROM orders WHERE order_date BETWEEN $1 AND $2 GROUP BY order_status`, [start, end]),
      pool.query(`WITH in_range AS (SELECT DISTINCT customer_id FROM orders WHERE order_date BETWEEN $1 AND $2 AND customer_id IS NOT NULL), prior AS (SELECT DISTINCT customer_id FROM orders WHERE order_date < $1 AND customer_id IS NOT NULL) SELECT COUNT(*) AS n_custs, COUNT(p.customer_id) AS repeat_custs FROM in_range ir LEFT JOIN prior p USING (customer_id)`, [start, end]),
      pool.query(`SELECT CASE WHEN tat = 0 THEN 'Same day' WHEN tat <= 2 THEN '1-2 days' WHEN tat <= 5 THEN '3-5 days' WHEN tat <= 7 THEN '6-7 days' WHEN tat <= 14 THEN '8-14 days' ELSE '15+ days' END AS bucket, COUNT(*) AS cnt, AVG(tat) AS avg_tat FROM (SELECT (NULLIF(delivered_date,'')::date - order_date)::int AS tat FROM orders WHERE order_date BETWEEN $1 AND $2 AND delivered_date IS NOT NULL AND delivered_date != '' AND order_date IS NOT NULL AND (NULLIF(delivered_date,'')::date - order_date) BETWEEN 0 AND 60) t GROUP BY 1`, [start, end]),
      pool.query(`SELECT order_id, order_date::text, channel, state, city, SUM(revenue_inc_gst) AS rev, SUM(item_qty) AS qty, MAX(order_status) AS order_status, MAX(customer_id) AS customer_id, MAX(voucher_code) AS voucher_code FROM orders WHERE order_date BETWEEN $1 AND $2 GROUP BY order_id, order_date, channel, state, city ORDER BY rev DESC LIMIT 20`, [start, end]),
      pool.query(`SELECT COUNT(*) AS ht_count, COALESCE(SUM(rev),0) AS ht_rev FROM (SELECT order_id, SUM(revenue_inc_gst) AS rev FROM orders WHERE order_date BETWEEN $1 AND $2 GROUP BY order_id HAVING SUM(revenue_inc_gst) >= 10000) t`, [start, end]),
      pool.query(`SELECT COUNT(CASE WHEN total_qty > 1 THEN 1 END) AS multi_item_orders FROM (SELECT order_id, SUM(item_qty) AS total_qty FROM orders WHERE order_date BETWEEN $1 AND $2 GROUP BY order_id) t`, [start, end]),
      pool.query(`SELECT sub_category, COUNT(DISTINCT order_id) AS orders, SUM(revenue_inc_gst) AS rev FROM orders WHERE order_date BETWEEN $1 AND $2 GROUP BY sub_category ORDER BY rev DESC LIMIT 50`, [start, end]),
    ])

    const dateSet = [...new Set(byDate.rows.map(r => r.date))].sort()
    const dailyArr = dateSet.map(date => {
      const entry = { date }
      byDate.rows.filter(r => r.date === date).forEach(r => {
        entry[r.channel] = parseFloat(r.rev) || 0
        entry[r.channel + '_o'] = parseInt(r.orders) || 0
      })
      return entry
    })

    const catMap = {}
    byCategory.rows.forEach(r => { catMap[r.category || 'Unknown'] = { rev: parseFloat(r.rev) || 0, excRev: parseFloat(r.exc_rev) || 0, orders: { size: parseInt(r.orders) }, units: parseInt(r.units) || 0 } })

    const subCatMap = {}
    bySubCategory.rows.forEach(r => { subCatMap[r.sub_category || 'Unknown'] = { rev: parseFloat(r.rev) || 0, orders: { size: parseInt(r.orders) || 0 } } })

    const stateMap = {}
    byState.rows.forEach(r => { if (!r.state) return; stateMap[r.state] = { rev: parseFloat(r.rev) || 0, orders: parseInt(r.orders) || 0, cities: { size: parseInt(r.cities) } } })

    const chMap = {}
    byChannel.rows.forEach(r => { chMap[r.channel] = { rev: parseFloat(r.rev) || 0, orders: parseInt(r.orders) || 0, qty: parseInt(r.qty) || 0 } })

    const orderStatusMap = {}
    byOrderStatus.rows.forEach(r => { orderStatusMap[r.order_status || 'Unknown'] = parseInt(r.cnt) || 0 })

    const bucketOrder = ['<₹500','₹500-1K','₹1K-2.5K','₹2.5K-5K','₹5K-10K','₹10K-25K','₹25K+']
    const buckets = Object.fromEntries(bucketOrder.map(k => [k, 0]))
    const bucketRev = Object.fromEntries(bucketOrder.map(k => [k, 0]))
    byOrderValue.rows.forEach(r => { buckets[r.bucket] = parseInt(r.cnt) || 0; bucketRev[r.bucket] = parseFloat(r.rev) || 0 })

    const voucherMap = {}
    byVoucher.rows.forEach(r => { voucherMap[r.voucher_type] = { orders: parseInt(r.orders) || 0, rev: parseFloat(r.rev) || 0 } })

    const tatOrders = []
    tatData.rows.forEach(r => { for (let i = 0; i < parseInt(r.cnt); i++) tatOrders.push(Math.round(parseFloat(r.avg_tat))) })

    const t = totals.rows[0]
    const totalRev = parseFloat(t.total_rev) || 0
    const totalExcRev = parseFloat(t.total_exc_rev) || 0
    const nOrders = parseInt(t.n_orders) || 0
    const totalQty = parseInt(t.total_qty) || 0
    const nDays = parseInt(t.n_days) || 1
    const nCusts = parseInt(customerStats.rows[0]?.n_custs) || 0
    const repeatCusts = parseInt(customerStats.rows[0]?.repeat_custs) || 0
    const htCount = parseInt(highTicket.rows[0]?.ht_count) || 0
    const htRevAgg = parseFloat(highTicket.rows[0]?.ht_rev) || 0
    const multiItemOrders = parseInt(multiItemStats.rows[0]?.multi_item_orders) || 0

    const orders = topOrders.rows.map(r => ({
      orderId: r.order_id, rev: parseFloat(r.rev) || 0, qty: parseInt(r.qty) || 0, items: parseInt(r.qty) || 0,
      channel: r.channel, date: r.order_date, state: r.state, city: r.city,
      orderStatus: r.order_status, customerId: r.customer_id, voucher: r.voucher_code,
      isRTO: false, isCIR: false, isCancelled: false, isExchange: false
    }))

    res.json({
      source: 'postgres-aggregated',
      totalRev, totalExcRev, totalQty, nOrders, nDays,
      blendedAOV: nOrders ? totalRev / nOrders : 0,
      gstCollected: totalRev - totalExcRev,
      nCusts, repeatCusts,
      uniqueDates: dateSet,
      dailyArr, chMap, catMap, subCatMap, stateMap, orderStatusMap,
      buckets, bucketRev, voucherMap, tatOrders,
      htCount, htRev: htRevAgg, multiItemOrders,
      orders, rows: [],
    })
  } catch (err) {
    console.error('[api/bq]', err.message)
    res.status(500).json({ error: err.message })
  }
}
