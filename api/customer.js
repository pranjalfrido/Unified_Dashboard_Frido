import { getBQ } from './_bq.js'

// All queries use fact_all_platform_sales_report filtered to Shopify
const TBL = '`frido-429506.production.fact_all_platform_sales_report`'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { start, end } = req.body || {}
  if (!start || !end) return res.status(400).json({ error: 'start and end required' })

  try {
    const bq = getBQ()
    const run = q => bq.query({ query: q, maximumBytesBilled: '10000000000' }).then(([rows]) => rows)
    const s = start, e = end

    const [kpis, monthly, cohort, crossSell, rfm, freqDist, monetaryDist, inactivity, discountDist, adsKpis, dailySpend] = await Promise.all([

      // Q1 — KPIs for the selected period (Shopify only)
      run(`WITH first_dates AS (
  SELECT CustomerId, MIN(DATE(OrderDate)) AS first_date
  FROM ${TBL}
  WHERE Channel = 'Shopify' AND CustomerId IS NOT NULL
  GROUP BY CustomerId
),
period AS (
  SELECT o.CustomerId, o.OrderId, DATE(o.OrderDate) AS order_date,
    o.SellingPrice_Inc_GST AS rev_inc, o.SellingPrice_Exc_GST AS rev_exc,
    o.voucher_code,
    CASE WHEN LOWER(o.Order_Status) IN ('rto','rto initiated','rto delivered') THEN 1 ELSE 0 END AS is_rto,
    CASE WHEN LOWER(o.Order_Status) IN ('cir return','cir') THEN 1 ELSE 0 END AS is_cir,
    CASE WHEN LOWER(o.Order_Status) IN ('cancelled','cancel') THEN 1 ELSE 0 END AS is_cancelled,
    f.first_date
  FROM ${TBL} o
  JOIN first_dates f USING (CustomerId)
  WHERE o.Channel = 'Shopify'
    AND DATE(o.OrderDate) BETWEEN '${s}' AND '${e}'
    AND o.CustomerId IS NOT NULL
),
order_agg AS (
  SELECT OrderId, first_date,
    SUM(rev_inc) AS order_rev_inc,
    SUM(rev_exc) AS order_rev_exc,
    MAX(is_rto) AS is_rto,
    MAX(is_cir) AS is_cir,
    MAX(is_cancelled) AS is_cancelled,
    ANY_VALUE(CustomerId) AS CustomerId,
    ANY_VALUE(voucher_code) AS voucher_code
  FROM period
  GROUP BY OrderId, first_date
)
SELECT
  COUNT(DISTINCT CustomerId) AS total_customers,
  COUNT(DISTINCT CASE WHEN first_date BETWEEN DATE('${s}') AND DATE('${e}') THEN CustomerId END) AS new_customers,
  COUNT(DISTINCT CASE WHEN first_date < DATE('${s}') THEN CustomerId END) AS returning_customers,
  COUNT(DISTINCT OrderId) AS total_orders,
  ROUND(SUM(order_rev_inc), 0) AS gross_sales,
  ROUND(SAFE_DIVIDE(SUM(order_rev_inc), COUNT(DISTINCT OrderId)), 0) AS aov,
  ROUND(SUM(CASE WHEN first_date < DATE('${s}') THEN order_rev_inc ELSE 0 END), 0) AS repeat_revenue,
  ROUND(SUM(order_rev_exc)
    - SUM(CASE WHEN is_rto = 1 THEN order_rev_exc ELSE 0 END)
    - SUM(CASE WHEN is_cir = 1 THEN order_rev_exc ELSE 0 END)
    - SUM(CASE WHEN is_cancelled = 1 THEN order_rev_exc ELSE 0 END), 0) AS net_revenue,
  COUNT(DISTINCT CASE WHEN voucher_code IS NOT NULL AND TRIM(voucher_code) != '' THEN OrderId END) AS discounted_orders,
  COUNT(DISTINCT CASE WHEN voucher_code IS NULL OR TRIM(voucher_code) = '' THEN OrderId END) AS non_discounted_orders
FROM order_agg`),

      // Q2 — daily new vs repeat (frontend aggregates to weekly/monthly)
      run(`WITH first_dates AS (
  SELECT CustomerId, MIN(DATE(OrderDate)) AS first_date
  FROM ${TBL}
  WHERE Channel = 'Shopify' AND CustomerId IS NOT NULL
  GROUP BY CustomerId
),
period AS (
  SELECT o.CustomerId, o.OrderId, DATE(o.OrderDate) AS order_date,
    o.SellingPrice_Inc_GST AS rev, f.first_date
  FROM ${TBL} o
  JOIN first_dates f USING (CustomerId)
  WHERE o.Channel = 'Shopify'
    AND DATE(o.OrderDate) BETWEEN '${s}' AND '${e}'
    AND o.CustomerId IS NOT NULL
)
SELECT
  CAST(order_date AS STRING) AS day,
  COUNT(DISTINCT CustomerId) AS customers_acquired,
  COUNT(DISTINCT OrderId) AS total_orders,
  ROUND(SUM(rev), 0) AS gross_sales,
  ROUND(SUM(CASE WHEN first_date < DATE('${s}') THEN rev ELSE 0 END), 0) AS repeat_revenue,
  ROUND(SUM(CASE WHEN first_date BETWEEN DATE('${s}') AND DATE('${e}') THEN rev ELSE 0 END), 0) AS new_revenue,
  COUNT(DISTINCT CASE WHEN first_date BETWEEN DATE('${s}') AND DATE('${e}') THEN CustomerId END) AS new_customers,
  COUNT(DISTINCT CASE WHEN first_date < DATE('${s}') THEN CustomerId END) AS repeat_customers,
  COUNT(DISTINCT CASE WHEN first_date BETWEEN DATE('${s}') AND DATE('${e}') THEN OrderId END) AS new_orders,
  COUNT(DISTINCT CASE WHEN first_date < DATE('${s}') THEN OrderId END) AS repeat_orders
FROM period
GROUP BY day
ORDER BY day`),

      // Q3 — cohort retention (all-time, last 18 months of cohorts) with revenue
      run(`WITH first_orders AS (
  SELECT CustomerId, DATE_TRUNC(MIN(DATE(OrderDate)), MONTH) AS cohort_month
  FROM ${TBL}
  WHERE Channel = 'Shopify' AND CustomerId IS NOT NULL
  GROUP BY CustomerId
),
all_orders AS (
  SELECT CustomerId, DATE_TRUNC(DATE(OrderDate), MONTH) AS order_month,
    -- Only count successful orders (exclude Cancel/RTO/CIR) for both customer and revenue retention
    COUNT(DISTINCT CASE WHEN LOWER(Order_Status) NOT IN ('cancelled','cancel','rto','rto initiated','rto delivered','cir return','cir') THEN OrderId END) AS valid_orders,
    SUM(CASE WHEN LOWER(Order_Status) NOT IN ('cancelled','cancel','rto','rto initiated','rto delivered','cir return','cir') THEN SellingPrice_Exc_GST ELSE 0 END) AS revenue
  FROM ${TBL}
  WHERE Channel = 'Shopify' AND CustomerId IS NOT NULL
  GROUP BY CustomerId, order_month
),
cohort_data AS (
  SELECT f.cohort_month,
    DATE_DIFF(a.order_month, f.cohort_month, MONTH) AS cohort_index,
    -- Only count customers who had at least 1 successful order that month
    COUNT(DISTINCT CASE WHEN a.valid_orders > 0 THEN a.CustomerId END) AS customers,
    ROUND(SUM(a.revenue), 0) AS revenue
  FROM first_orders f
  JOIN all_orders a USING (CustomerId)
  WHERE f.cohort_month >= DATE_TRUNC(DATE_SUB(DATE('${e}'), INTERVAL 18 MONTH), MONTH)
    AND f.cohort_month <= DATE_TRUNC(DATE('${e}'), MONTH)
    AND DATE_DIFF(a.order_month, f.cohort_month, MONTH) BETWEEN 0 AND 14
  GROUP BY cohort_month, cohort_index
)
SELECT FORMAT_DATE('%Y-%m', cohort_month) AS cohort_month, cohort_index, customers, revenue
FROM cohort_data
ORDER BY cohort_month, cohort_index`),

      // Q4 — first vs second purchase (order-level, with item master category/subcat lookup)
      run(`WITH
item_master AS (
  SELECT DISTINCT TRIM(Product_Code) AS sku, Category_Name, Sub_category
  FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
  WHERE Product_Code IS NOT NULL
),
pid_map AS (
  SELECT DISTINCT TRIM(productid) AS productid, TRIM(masterskucode) AS masterskucode
  FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\`
  WHERE productid IS NOT NULL AND masterskucode IS NOT NULL
),
-- Rank at ORDER level (not item level) — use MIN(OrderDate) per order to deduplicate
order_ranked AS (
  SELECT
    CustomerId,
    OrderId,
    MIN(OrderDate) AS order_date,
    -- pick one ProductId per order (any_value) then resolve SKU via pid_map
    ANY_VALUE(ProductId) AS product_id,
    ANY_VALUE(masterskucode) AS direct_sku
  FROM ${TBL}
  WHERE Channel = 'Shopify' AND CustomerId IS NOT NULL
  GROUP BY CustomerId, OrderId
),
order_with_rank AS (
  SELECT
    o.CustomerId, o.OrderId, o.order_date,
    ROW_NUMBER() OVER (PARTITION BY o.CustomerId ORDER BY o.order_date, o.OrderId) AS rn,
    COALESCE(pm.masterskucode, o.direct_sku) AS masterskucode
  FROM order_ranked o
  LEFT JOIN pid_map pm ON TRIM(CAST(o.product_id AS STRING)) = pm.productid
),
fp AS (
  SELECT r.CustomerId, im.Category_Name AS first_category, im.Sub_category AS first_sub_category
  FROM order_with_rank r
  LEFT JOIN item_master im ON r.masterskucode = im.sku
  WHERE r.rn = 1
),
sp AS (
  SELECT r.CustomerId, im.Category_Name AS second_category, im.Sub_category AS second_sub_category
  FROM order_with_rank r
  LEFT JOIN item_master im ON r.masterskucode = im.sku
  WHERE r.rn = 2
)
SELECT
  fp.first_category, fp.first_sub_category,
  sp.second_category, sp.second_sub_category,
  COUNT(DISTINCT fp.CustomerId) AS customers
FROM fp
JOIN sp USING (CustomerId)
WHERE fp.first_category IS NOT NULL AND sp.second_category IS NOT NULL
GROUP BY first_category, first_sub_category, second_category, second_sub_category
HAVING COUNT(DISTINCT fp.CustomerId) > 0
ORDER BY customers DESC
LIMIT 500`),

      // Q5 â€” RFM segments (all-time up to end date)
      run(`WITH customer_stats AS (
  SELECT
    CustomerId,
    DATE_DIFF(DATE('${e}'), MAX(DATE(OrderDate)), DAY) AS recency_days,
    COUNT(DISTINCT OrderId) AS frequency,
    ROUND(SUM(SellingPrice_Inc_GST), 0) AS monetary
  FROM ${TBL}
  WHERE Channel = 'Shopify' AND CustomerId IS NOT NULL
    AND DATE(OrderDate) <= DATE('${e}')
  GROUP BY CustomerId
),
scored AS (
  SELECT *,
    CASE WHEN recency_days <= 30 THEN 5 WHEN recency_days <= 60 THEN 4 WHEN recency_days <= 90 THEN 3 WHEN recency_days <= 180 THEN 2 ELSE 1 END AS r_score,
    CASE WHEN frequency >= 5 THEN 5 WHEN frequency >= 4 THEN 4 WHEN frequency >= 3 THEN 3 WHEN frequency >= 2 THEN 2 ELSE 1 END AS f_score,
    CASE WHEN monetary >= 10000 THEN 5 WHEN monetary >= 5000 THEN 4 WHEN monetary >= 2000 THEN 3 WHEN monetary >= 1000 THEN 2 ELSE 1 END AS m_score
  FROM customer_stats
),
segmented AS (
  SELECT *,
    CASE
      WHEN r_score >= 4 AND f_score >= 4 THEN 'Champions'
      WHEN r_score >= 3 AND f_score >= 3 THEN 'Loyal Customers'
      WHEN r_score >= 4 AND f_score <= 2 THEN 'Recent Users'
      WHEN r_score >= 3 AND m_score >= 3 THEN 'Potential Loyalists'
      WHEN r_score <= 2 AND f_score >= 3 THEN 'Cannot Lose Them'
      WHEN r_score <= 2 AND f_score >= 2 THEN 'Hibernating'
      WHEN monetary >= 5000 THEN 'Others'
      ELSE 'Hibernating'
    END AS segment
  FROM scored
)
SELECT segment,
  COUNT(*) AS customers,
  ROUND(SUM(monetary), 0) AS total_revenue,
  ROUND(AVG(monetary), 0) AS avg_revenue,
  ROUND(AVG(frequency), 2) AS avg_frequency,
  ROUND(AVG(recency_days), 0) AS avg_recency
FROM segmented
GROUP BY segment
ORDER BY total_revenue DESC`),

      // Q6 â€” purchase frequency distribution (all-time)
      run(`WITH freq AS (
  SELECT CustomerId, COUNT(DISTINCT OrderId) AS orders
  FROM ${TBL}
  WHERE Channel = 'Shopify' AND CustomerId IS NOT NULL
    AND DATE(OrderDate) <= DATE('${e}')
  GROUP BY CustomerId
)
SELECT
  CASE WHEN orders = 1 THEN 'Very Low (1 Order)' WHEN orders = 2 THEN 'Low (2 Orders)' WHEN orders = 3 THEN 'Medium (3 Orders)' WHEN orders BETWEEN 4 AND 5 THEN 'High (4-5 Orders)' ELSE 'Very High (5+ Orders)' END AS frequency_label,
  COUNT(*) AS customers,
  ROUND(SUM(orders), 0) AS total_orders
FROM freq
GROUP BY frequency_label
ORDER BY MIN(orders)`),

      // Q7 â€” monetary distribution (all-time)
      run(`WITH customer_ltv AS (
  SELECT CustomerId, ROUND(SUM(SellingPrice_Inc_GST), 0) AS monetary
  FROM ${TBL}
  WHERE Channel = 'Shopify' AND CustomerId IS NOT NULL
    AND DATE(OrderDate) <= DATE('${e}')
  GROUP BY CustomerId
)
SELECT
  CASE WHEN monetary < 500 THEN 'Very Low (0-500)' WHEN monetary < 2000 THEN 'Low (500-2K)' WHEN monetary < 5000 THEN 'Medium (2K-5K)' WHEN monetary < 10000 THEN 'High (5K-10K)' ELSE 'Very High (10K+)' END AS bucket,
  COUNT(*) AS customers,
  ROUND(SUM(monetary), 0) AS total_revenue,
  ROUND(AVG(monetary), 0) AS avg_revenue
FROM customer_ltv
GROUP BY bucket
ORDER BY MIN(monetary)`),

      // Q8 â€” inactivity buckets (all-time)
      run(`WITH last_purchase AS (
  SELECT CustomerId, MAX(DATE(OrderDate)) AS last_date
  FROM ${TBL}
  WHERE Channel = 'Shopify' AND CustomerId IS NOT NULL
  GROUP BY CustomerId
)
SELECT
  CASE WHEN DATE_DIFF(DATE('${e}'), last_date, DAY) < 30 THEN 'Active (<30 Days)' WHEN DATE_DIFF(DATE('${e}'), last_date, DAY) < 60 THEN 'Inactive 30-59 Days' WHEN DATE_DIFF(DATE('${e}'), last_date, DAY) < 90 THEN 'Inactive 60-89 Days' ELSE 'Inactive 90+ Days' END AS bucket,
  COUNT(*) AS customers
FROM last_purchase
GROUP BY bucket
ORDER BY MIN(DATE_DIFF(DATE('${e}'), last_date, DAY))`),

      // Q9 â€” discount distribution (voucher proxy) first vs repeat
      run(`WITH first_dates AS (
  SELECT CustomerId, MIN(DATE(OrderDate)) AS first_date
  FROM ${TBL}
  WHERE Channel = 'Shopify' AND CustomerId IS NOT NULL
  GROUP BY CustomerId
),
tagged AS (
  SELECT o.OrderId,
    CASE WHEN DATE(o.OrderDate) = f.first_date THEN 'First Order' ELSE 'Repeat Order' END AS order_type,
    CASE WHEN o.voucher_code IS NOT NULL AND TRIM(o.voucher_code) != '' THEN 'Discounted' ELSE 'No Discount' END AS disc_flag
  FROM ${TBL} o
  JOIN first_dates f USING (CustomerId)
  WHERE o.Channel = 'Shopify'
    AND DATE(o.OrderDate) BETWEEN '${s}' AND '${e}'
    AND o.CustomerId IS NOT NULL
)
SELECT disc_flag AS discount_bucket,
  COUNTIF(order_type = 'First Order') AS first_orders,
  COUNTIF(order_type = 'Repeat Order') AS repeat_orders
FROM tagged
GROUP BY discount_bucket`),

      // Q10 â€” ads KPIs
      run(`SELECT platform, ROUND(SUM(spend), 0) AS spend, ROUND(SUM(revenue), 0) AS revenue, ROUND(SUM(orders), 0) AS orders
FROM \`frido-429506.production.fact_all_platform_ads_report\`
WHERE report_date BETWEEN '${s}' AND '${e}' AND platform IN ('Meta', 'Google')
GROUP BY platform`),

      // Q11 — daily ad spend (Meta + Google combined) for trend chart
      run(`SELECT CAST(report_date AS STRING) AS day, ROUND(SUM(spend), 0) AS total_spend
FROM \`frido-429506.production.fact_all_platform_ads_report\`
WHERE report_date BETWEEN '${s}' AND '${e}' AND platform IN ('Meta', 'Google')
GROUP BY day ORDER BY day`),
    ])

    const k = kpis[0] || {}
    const metaAds = adsKpis.find(r => r.platform === 'Meta') || {}
    const googleAds = adsKpis.find(r => r.platform === 'Google') || {}
    const totalSpend = (parseFloat(metaAds.spend) || 0) + (parseFloat(googleAds.spend) || 0)
    const grossSales = parseFloat(k.gross_sales) || 0
    const totalCustomers = parseInt(k.total_customers) || 0
    const newCustomers = parseInt(k.new_customers) || 0
    const returningCustomers = parseInt(k.returning_customers) || 0

    res.json({
      kpis: {
        grossSales,
        totalSpend,
        metaSpend: parseFloat(metaAds.spend) || 0,
        googleSpend: parseFloat(googleAds.spend) || 0,
        totalCustomers,
        newCustomers,
        returningCustomers,
        repeatRate: totalCustomers > 0 ? returningCustomers / totalCustomers : 0,
        roas: totalSpend > 0 ? grossSales / totalSpend : 0,
        cac: newCustomers > 0 ? totalSpend / newCustomers : 0,
        aov: parseFloat(k.aov) || 0,
        acquisitionRate: totalCustomers > 0 ? newCustomers / totalCustomers : 0,
        repeatRevenue: parseFloat(k.repeat_revenue) || 0,
        repeatRevenueRate: grossSales > 0 ? (parseFloat(k.repeat_revenue) || 0) / grossSales : 0,
        netRevenue: parseFloat(k.net_revenue) || 0,
        netRevenueRate: grossSales > 0 ? (parseFloat(k.net_revenue) || 0) / grossSales : 0,
        discountedOrders: parseInt(k.discounted_orders) || 0,
        nonDiscountedOrders: parseInt(k.non_discounted_orders) || 0,
        totalOrders: parseInt(k.total_orders) || 0,
      },
      daily: monthly.map(r => ({
        day: r.day,
        customersAcquired: parseInt(r.customers_acquired) || 0,
        totalOrders: parseInt(r.total_orders) || 0,
        grossSales: parseFloat(r.gross_sales) || 0,
        repeatRevenue: parseFloat(r.repeat_revenue) || 0,
        newRevenue: parseFloat(r.new_revenue) || 0,
        newCustomers: parseInt(r.new_customers) || 0,
        repeatCustomers: parseInt(r.repeat_customers) || 0,
        newOrders: parseInt(r.new_orders) || 0,
        repeatOrders: parseInt(r.repeat_orders) || 0,
      })),
      cohort: cohort.map(r => ({
        cohortMonth: r.cohort_month,
        cohortIndex: parseInt(r.cohort_index),
        customers: parseInt(r.customers),
        revenue: parseFloat(r.revenue) || 0,
      })),
      crossSell: crossSell.map(r => ({
        firstCategory: r.first_category,
        firstSubCategory: r.first_sub_category,
        secondCategory: r.second_category,
        secondSubCategory: r.second_sub_category,
        customers: parseInt(r.customers),
      })),
      rfm: rfm.map(r => ({
        segment: r.segment,
        customers: parseInt(r.customers),
        totalRevenue: parseFloat(r.total_revenue) || 0,
        avgRevenue: parseFloat(r.avg_revenue) || 0,
        avgFrequency: parseFloat(r.avg_frequency) || 0,
        avgRecency: parseFloat(r.avg_recency) || 0,
      })),
      freqDist: freqDist.map(r => ({
        label: r.frequency_label,
        customers: parseInt(r.customers) || 0,
        totalOrders: parseInt(r.total_orders) || 0,
      })),
      monetaryDist: monetaryDist.map(r => ({
        bucket: r.bucket,
        customers: parseInt(r.customers) || 0,
        totalRevenue: parseFloat(r.total_revenue) || 0,
        avgRevenue: parseFloat(r.avg_revenue) || 0,
      })),
      inactivity: inactivity.map(r => ({
        bucket: r.bucket,
        customers: parseInt(r.customers) || 0,
      })),
      discountDist: discountDist.map(r => ({
        bucket: r.discount_bucket,
        firstOrders: parseInt(r.first_orders) || 0,
        repeatOrders: parseInt(r.repeat_orders) || 0,
      })),
      dailySpend: dailySpend.map(r => ({
        day: r.day,
        totalSpend: parseFloat(r.total_spend) || 0,
      })),
    })
  } catch (err) {
    console.error('[customer]', err)
    res.status(500).json({ error: err.message })
  }
}


