import { getBQ } from './_bq.js'
import { getPool } from './_db.js'

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
    // prev period: same duration immediately before
    const ms = new Date(s).getTime(), me = new Date(e).getTime()
    const dur = me - ms
    const ps = new Date(ms - dur - 86400000).toISOString().slice(0, 10)
    const pe = new Date(ms - 86400000).toISOString().slice(0, 10)

    const [kpis, monthly, cohort, crossSell, rfm, freqDist, monetaryDist, inactivity, discountDist, adsKpis, dailySpend, prevKpis, prevAdsKpis, discountRepeatRate, daysToSecondPurchase, aovByOrderNumber] = await Promise.all([

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
  ROUND(SUM(order_rev_exc), 0) AS gross_exc_gst,
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
    o.SellingPrice_Inc_GST AS rev, o.SellingPrice_Exc_GST AS rev_exc, f.first_date
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
  ROUND(SUM(rev_exc), 0) AS gross_sales_exc,
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
    COUNT(DISTINCT OrderId) AS order_count,
    SUM(SellingPrice_Exc_GST) AS revenue
  FROM ${TBL}
  WHERE Channel = 'Shopify' AND CustomerId IS NOT NULL
  GROUP BY CustomerId, order_month
),
cohort_data AS (
  SELECT f.cohort_month,
    DATE_DIFF(a.order_month, f.cohort_month, MONTH) AS cohort_index,
    COUNT(DISTINCT a.CustomerId) AS customers,
    ROUND(SUM(a.revenue), 0) AS revenue
  FROM first_orders f
  JOIN all_orders a USING (CustomerId)
  WHERE f.cohort_month <= DATE_TRUNC(DATE('${e}'), MONTH)
    AND DATE_DIFF(a.order_month, f.cohort_month, MONTH) BETWEEN 0 AND 54
  GROUP BY cohort_month, cohort_index
)
SELECT FORMAT_DATE('%Y-%m', cohort_month) AS cohort_month, cohort_index, customers, revenue
FROM cohort_data
ORDER BY cohort_month, cohort_index`),

      // Q4 — first vs second purchase cross-sell (revenue-weighted category per order)
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
order_items AS (
  SELECT
    CustomerId, OrderId,
    MIN(OrderDate) AS order_date,
    COALESCE(pm.masterskucode, CAST(t.masterskucode AS STRING)) AS masterskucode,
    SUM(t.SellingPrice_Exc_GST) AS item_rev
  FROM ${TBL} t
  LEFT JOIN pid_map pm ON TRIM(CAST(t.ProductId AS STRING)) = pm.productid
  WHERE t.Channel = 'Shopify' AND t.CustomerId IS NOT NULL
  GROUP BY CustomerId, OrderId, COALESCE(pm.masterskucode, CAST(t.masterskucode AS STRING))
),
order_top_item AS (
  -- pick the highest-revenue SKU per order to represent the order's category
  SELECT CustomerId, OrderId, MIN(order_date) AS order_date, masterskucode
  FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY CustomerId, OrderId ORDER BY item_rev DESC, masterskucode) AS rn
    FROM order_items
  ) sub
  WHERE rn = 1
  GROUP BY CustomerId, OrderId, masterskucode
),
order_with_rank AS (
  SELECT
    o.CustomerId, o.OrderId, o.order_date,
    ROW_NUMBER() OVER (PARTITION BY o.CustomerId ORDER BY o.order_date, o.OrderId) AS rn,
    o.masterskucode
  FROM order_top_item o
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
    ROUND(SUM(SellingPrice_Exc_GST), 0) AS monetary
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
  CASE WHEN monetary < 2000 THEN '0-2K' WHEN monetary < 5000 THEN '2K-5K' WHEN monetary < 10000 THEN '5K-10K' WHEN monetary < 50000 THEN '10K-50K' ELSE '50K+' END AS bucket,
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

      // Q9 — discount distribution: new vs repeat customers + AOV, all from main fact table
      run(`WITH
first_dates AS (
  SELECT CustomerId, MIN(DATE(OrderDate)) AS first_date
  FROM ${TBL}
  WHERE Channel = 'Shopify' AND CustomerId IS NOT NULL
  GROUP BY CustomerId
),
order_agg AS (
  SELECT
    o.OrderId,
    o.CustomerId,
    ANY_VALUE(f.first_date) AS first_date,
    SUM(o.SellingPrice_Exc_GST) AS order_rev_exc,
    MAX(CASE WHEN o.voucher_code IS NOT NULL AND TRIM(o.voucher_code) != '' THEN 1 ELSE 0 END) AS has_voucher
  FROM ${TBL} o
  JOIN first_dates f USING (CustomerId)
  WHERE o.Channel = 'Shopify'
    AND DATE(o.OrderDate) BETWEEN '${s}' AND '${e}'
    AND o.CustomerId IS NOT NULL
  GROUP BY o.OrderId, o.CustomerId
),
bucketed AS (
  SELECT
    OrderId, CustomerId, order_rev_exc,
    CASE WHEN has_voucher = 1 THEN 'Discounted' ELSE 'No Discount' END AS discount_bucket,
    CASE WHEN first_date BETWEEN DATE('${s}') AND DATE('${e}') THEN 'new' ELSE 'repeat' END AS customer_type
  FROM order_agg
)
SELECT
  discount_bucket,
  COUNT(DISTINCT OrderId) AS total_orders,
  COUNTIF(customer_type = 'new') AS first_orders,
  COUNTIF(customer_type = 'repeat') AS repeat_orders,
  ROUND(SAFE_DIVIDE(SUM(order_rev_exc), COUNT(DISTINCT OrderId)), 0) AS aov_exc,
  COUNT(DISTINCT CustomerId) AS unique_customers,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT OrderId), COUNT(DISTINCT CustomerId)), 2) AS avg_orders_per_customer
FROM bucketed
GROUP BY discount_bucket
ORDER BY discount_bucket`),

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

      // Q12 — prev period KPIs
      run(`WITH first_dates AS (
  SELECT CustomerId, MIN(DATE(OrderDate)) AS first_date
  FROM ${TBL} WHERE Channel = 'Shopify' AND CustomerId IS NOT NULL GROUP BY CustomerId
),
period AS (
  SELECT o.CustomerId, o.OrderId, DATE(o.OrderDate) AS order_date,
    o.SellingPrice_Inc_GST AS rev_inc, o.SellingPrice_Exc_GST AS rev_exc,
    f.first_date,
    CASE WHEN LOWER(o.Order_Status) IN ('rto','rto initiated','rto delivered') THEN 1 ELSE 0 END AS is_rto,
    CASE WHEN LOWER(o.Order_Status) IN ('cir return','cir') THEN 1 ELSE 0 END AS is_cir,
    CASE WHEN LOWER(o.Order_Status) IN ('cancelled','cancel') THEN 1 ELSE 0 END AS is_cancelled
  FROM ${TBL} o JOIN first_dates f USING (CustomerId)
  WHERE o.Channel = 'Shopify' AND DATE(o.OrderDate) BETWEEN '${ps}' AND '${pe}' AND o.CustomerId IS NOT NULL
),
order_agg AS (
  SELECT OrderId, first_date,
    SUM(rev_inc) AS order_rev_inc, SUM(rev_exc) AS order_rev_exc,
    MAX(is_rto) AS is_rto, MAX(is_cir) AS is_cir, MAX(is_cancelled) AS is_cancelled,
    ANY_VALUE(CustomerId) AS CustomerId
  FROM period GROUP BY OrderId, first_date
)
SELECT
  COUNT(DISTINCT CustomerId) AS total_customers,
  COUNT(DISTINCT CASE WHEN first_date BETWEEN DATE('${ps}') AND DATE('${pe}') THEN CustomerId END) AS new_customers,
  COUNT(DISTINCT CASE WHEN first_date < DATE('${ps}') THEN CustomerId END) AS returning_customers,
  COUNT(DISTINCT OrderId) AS total_orders,
  ROUND(SUM(order_rev_inc), 0) AS gross_sales,
  ROUND(SUM(order_rev_exc), 0) AS gross_exc_gst,
  ROUND(SAFE_DIVIDE(SUM(order_rev_inc), COUNT(DISTINCT OrderId)), 0) AS aov,
  ROUND(SUM(CASE WHEN first_date < DATE('${ps}') THEN order_rev_inc ELSE 0 END), 0) AS repeat_revenue,
  ROUND(SUM(order_rev_exc)
    - SUM(CASE WHEN is_rto = 1 THEN order_rev_exc ELSE 0 END)
    - SUM(CASE WHEN is_cir = 1 THEN order_rev_exc ELSE 0 END)
    - SUM(CASE WHEN is_cancelled = 1 THEN order_rev_exc ELSE 0 END), 0) AS net_revenue
FROM order_agg`),

      // Q13 — prev period ads
      run(`SELECT platform, ROUND(SUM(spend), 0) AS spend
FROM \`frido-429506.production.fact_all_platform_ads_report\`
WHERE report_date BETWEEN '${ps}' AND '${pe}' AND platform IN ('Meta', 'Google')
GROUP BY platform`),

      // Q14 — discount depth vs repeat rate
      // For each discount bucket: of customers whose FIRST-EVER order fell in that bucket,
      // what % went on to place a second order (ever)?
      run(`WITH all_orders AS (
  SELECT DISTINCT order_id, customer_id,
    CAST(order_date_ist AS DATE) AS order_date,
    item_discount_percent AS discount_pct
  FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\`
  WHERE customer_id IS NOT NULL
    AND LOWER(sku) NOT LIKE '%coup%'
    AND LOWER(sku) NOT LIKE '%dfa%'
),
customer_order_rank AS (
  SELECT customer_id, order_id, order_date, discount_pct,
    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS rn,
    COUNT(DISTINCT order_id) OVER (PARTITION BY customer_id) AS total_orders
  FROM all_orders
),
first_orders AS (
  SELECT customer_id, discount_pct, total_orders
  FROM customer_order_rank
  WHERE rn = 1
),
bucketed AS (
  SELECT customer_id, total_orders,
    CASE
      WHEN discount_pct IS NULL OR discount_pct = 0 THEN '0%'
      WHEN discount_pct <= 0.10 THEN '1-10%'
      WHEN discount_pct <= 0.20 THEN '11-20%'
      WHEN discount_pct <= 0.30 THEN '21-30%'
      WHEN discount_pct <= 0.40 THEN '31-40%'
      ELSE '40%+'
    END AS discount_bucket
  FROM first_orders
)
SELECT
  discount_bucket,
  COUNT(DISTINCT customer_id) AS total_customers,
  COUNTIF(total_orders > 1) AS repeat_customers,
  ROUND(SAFE_DIVIDE(COUNTIF(total_orders > 1), COUNT(DISTINCT customer_id)) * 100, 1) AS repeat_rate,
  CASE discount_bucket WHEN '0%' THEN 0 WHEN '1-10%' THEN 1 WHEN '11-20%' THEN 2 WHEN '21-30%' THEN 3 WHEN '31-40%' THEN 4 ELSE 5 END AS sort_order
FROM bucketed
GROUP BY discount_bucket
ORDER BY sort_order`),

      // Q15 — days between 1st and 2nd purchase (all-time, not date-filtered)
      run(`WITH
orders AS (
  SELECT CustomerId, OrderId, MIN(DATE(OrderDate)) AS order_date
  FROM ${TBL}
  WHERE Channel = 'Shopify' AND CustomerId IS NOT NULL
  GROUP BY CustomerId, OrderId
),
ranked AS (
  SELECT CustomerId, order_date,
    ROW_NUMBER() OVER (PARTITION BY CustomerId ORDER BY order_date, OrderId) AS rn
  FROM orders
),
gaps AS (
  SELECT
    o1.CustomerId,
    DATE_DIFF(o2.order_date, o1.order_date, DAY) AS days_to_second
  FROM ranked o1
  JOIN ranked o2 ON o1.CustomerId = o2.CustomerId AND o2.rn = 2
  WHERE o1.rn = 1 AND DATE_DIFF(o2.order_date, o1.order_date, DAY) >= 0
),
bucketed AS (
  SELECT CustomerId,
    CASE
      WHEN days_to_second <= 7   THEN '0-7d'
      WHEN days_to_second <= 30  THEN '8-30d'
      WHEN days_to_second <= 60  THEN '31-60d'
      WHEN days_to_second <= 90  THEN '61-90d'
      WHEN days_to_second <= 180 THEN '91-180d'
      ELSE '180d+'
    END AS bucket,
    days_to_second
  FROM gaps
)
SELECT
  bucket,
  COUNT(DISTINCT CustomerId) AS customers,
  CASE bucket WHEN '0-7d' THEN 0 WHEN '8-30d' THEN 1 WHEN '31-60d' THEN 2 WHEN '61-90d' THEN 3 WHEN '91-180d' THEN 4 ELSE 5 END AS sort_order
FROM bucketed
GROUP BY bucket
ORDER BY sort_order`),

      // Q16 — AOV by order number (1st through 6th+), revenue-weighted, all-time
      run(`WITH
order_totals AS (
  SELECT CustomerId, OrderId, MIN(DATE(OrderDate)) AS order_date,
    SUM(SellingPrice_Exc_GST) AS order_rev
  FROM ${TBL}
  WHERE Channel = 'Shopify' AND CustomerId IS NOT NULL
  GROUP BY CustomerId, OrderId
),
ranked AS (
  SELECT CustomerId, OrderId, order_rev,
    ROW_NUMBER() OVER (PARTITION BY CustomerId ORDER BY order_date, OrderId) AS order_num
  FROM order_totals
),
capped AS (
  SELECT
    CASE WHEN order_num >= 6 THEN '6th+' ELSE CONCAT(CAST(order_num AS STRING), CASE order_num WHEN 1 THEN 'st' WHEN 2 THEN 'nd' WHEN 3 THEN 'rd' ELSE 'th' END) END AS order_label,
    CASE WHEN order_num >= 6 THEN 6 ELSE order_num END AS order_sort,
    order_rev
  FROM ranked
)
SELECT
  order_label,
  order_sort,
  ROUND(AVG(order_rev), 0) AS aov,
  COUNT(*) AS customers
FROM capped
GROUP BY order_label, order_sort
ORDER BY order_sort`),
    ])

    // Fetch additional (offline) spend from Postgres for the selected date range
    let additionalSpend = 0
    try {
      const db = getPool()
      const months = []
      const cur = new Date(s)
      const endDate = new Date(e)
      while (cur <= endDate) {
        const ym = cur.toISOString().slice(0, 7)
        if (!months.includes(ym)) months.push(ym)
        cur.setMonth(cur.getMonth() + 1)
      }
      const placeholders = months.map((_, i) => `$${i + 1}`).join(',')
      const { rows } = await db.query(
        `SELECT SUM(total_spend_ex_gst::numeric) AS total
         FROM markting_spend
         WHERE channeltomap = 'D2C'
           AND is_additional_spend = 'yes'
           AND TO_CHAR(month_year::timestamp, 'YYYY-MM') IN (${placeholders})`,
        months
      )
      additionalSpend = parseFloat(rows[0]?.total) || 0
    } catch (_) {
      additionalSpend = 0
    }

    const k = kpis[0] || {}
    const metaAds = adsKpis.find(r => r.platform === 'Meta') || {}
    const googleAds = adsKpis.find(r => r.platform === 'Google') || {}
    const metaSpend = parseFloat(metaAds.spend) || 0
    const googleSpend = parseFloat(googleAds.spend) || 0
    const totalSpend = metaSpend + googleSpend + additionalSpend
    const grossSales = parseFloat(k.gross_sales) || 0
    const grossExcGst = parseFloat(k.gross_exc_gst) || 0
    const totalCustomers = parseInt(k.total_customers) || 0
    const newCustomers = parseInt(k.new_customers) || 0
    const returningCustomers = parseInt(k.returning_customers) || 0
    const netRevenue = parseFloat(k.net_revenue) || 0
    const cac = newCustomers > 0 ? totalSpend / newCustomers : 0
    // ltv12: avg revenue per customer over last 12 months from rfm total
    const rfmTotalRev = rfm.reduce((s, r) => s + (parseFloat(r.total_revenue) || 0), 0)
    const rfmTotalCust = rfm.reduce((s, r) => s + (parseInt(r.customers) || 0), 0)
    const ltv12 = rfmTotalCust > 0 ? rfmTotalRev / rfmTotalCust : 0
    const ltvCac = cac > 0 ? ltv12 / cac : 0

    // Segment migration: compare segments at prev period end vs current end
    const segMigration = await run(`WITH
prev_stats AS (
  SELECT CustomerId,
    DATE_DIFF(DATE('${pe}'), MAX(DATE(OrderDate)), DAY) AS recency_days,
    COUNT(DISTINCT OrderId) AS frequency,
    ROUND(SUM(SellingPrice_Exc_GST), 0) AS monetary
  FROM ${TBL}
  WHERE Channel = 'Shopify' AND CustomerId IS NOT NULL AND DATE(OrderDate) <= DATE('${pe}')
  GROUP BY CustomerId
),
prev_seg AS (
  SELECT CustomerId,
    CASE
      WHEN (CASE WHEN recency_days<=30 THEN 5 WHEN recency_days<=60 THEN 4 WHEN recency_days<=90 THEN 3 WHEN recency_days<=180 THEN 2 ELSE 1 END) >= 4
       AND (CASE WHEN frequency>=5 THEN 5 WHEN frequency>=4 THEN 4 WHEN frequency>=3 THEN 3 WHEN frequency>=2 THEN 2 ELSE 1 END) >= 4 THEN 'Champions'
      WHEN (CASE WHEN recency_days<=30 THEN 5 WHEN recency_days<=60 THEN 4 WHEN recency_days<=90 THEN 3 WHEN recency_days<=180 THEN 2 ELSE 1 END) >= 3
       AND (CASE WHEN frequency>=5 THEN 5 WHEN frequency>=4 THEN 4 WHEN frequency>=3 THEN 3 WHEN frequency>=2 THEN 2 ELSE 1 END) >= 3 THEN 'Loyal Customers'
      WHEN (CASE WHEN recency_days<=30 THEN 5 WHEN recency_days<=60 THEN 4 WHEN recency_days<=90 THEN 3 WHEN recency_days<=180 THEN 2 ELSE 1 END) >= 4
       AND (CASE WHEN frequency>=5 THEN 5 WHEN frequency>=4 THEN 4 WHEN frequency>=3 THEN 3 WHEN frequency>=2 THEN 2 ELSE 1 END) <= 2 THEN 'Recent Users'
      WHEN (CASE WHEN recency_days<=30 THEN 5 WHEN recency_days<=60 THEN 4 WHEN recency_days<=90 THEN 3 WHEN recency_days<=180 THEN 2 ELSE 1 END) >= 3
       AND (CASE WHEN monetary>=10000 THEN 5 WHEN monetary>=5000 THEN 4 WHEN monetary>=2000 THEN 3 WHEN monetary>=1000 THEN 2 ELSE 1 END) >= 3 THEN 'Potential Loyalists'
      WHEN (CASE WHEN recency_days<=30 THEN 5 WHEN recency_days<=60 THEN 4 WHEN recency_days<=90 THEN 3 WHEN recency_days<=180 THEN 2 ELSE 1 END) <= 2
       AND (CASE WHEN frequency>=5 THEN 5 WHEN frequency>=4 THEN 4 WHEN frequency>=3 THEN 3 WHEN frequency>=2 THEN 2 ELSE 1 END) >= 3 THEN 'Cannot Lose Them'
      WHEN (CASE WHEN recency_days<=30 THEN 5 WHEN recency_days<=60 THEN 4 WHEN recency_days<=90 THEN 3 WHEN recency_days<=180 THEN 2 ELSE 1 END) <= 2
       AND (CASE WHEN frequency>=5 THEN 5 WHEN frequency>=4 THEN 4 WHEN frequency>=3 THEN 3 WHEN frequency>=2 THEN 2 ELSE 1 END) >= 2 THEN 'Hibernating'
      WHEN monetary >= 5000 THEN 'Others'
      ELSE 'Hibernating'
    END AS segment
  FROM prev_stats
),
curr_stats AS (
  SELECT CustomerId,
    DATE_DIFF(DATE('${e}'), MAX(DATE(OrderDate)), DAY) AS recency_days,
    COUNT(DISTINCT OrderId) AS frequency,
    ROUND(SUM(SellingPrice_Exc_GST), 0) AS monetary
  FROM ${TBL}
  WHERE Channel = 'Shopify' AND CustomerId IS NOT NULL AND DATE(OrderDate) <= DATE('${e}')
  GROUP BY CustomerId
),
curr_seg AS (
  SELECT CustomerId,
    CASE
      WHEN (CASE WHEN recency_days<=30 THEN 5 WHEN recency_days<=60 THEN 4 WHEN recency_days<=90 THEN 3 WHEN recency_days<=180 THEN 2 ELSE 1 END) >= 4
       AND (CASE WHEN frequency>=5 THEN 5 WHEN frequency>=4 THEN 4 WHEN frequency>=3 THEN 3 WHEN frequency>=2 THEN 2 ELSE 1 END) >= 4 THEN 'Champions'
      WHEN (CASE WHEN recency_days<=30 THEN 5 WHEN recency_days<=60 THEN 4 WHEN recency_days<=90 THEN 3 WHEN recency_days<=180 THEN 2 ELSE 1 END) >= 3
       AND (CASE WHEN frequency>=5 THEN 5 WHEN frequency>=4 THEN 4 WHEN frequency>=3 THEN 3 WHEN frequency>=2 THEN 2 ELSE 1 END) >= 3 THEN 'Loyal Customers'
      WHEN (CASE WHEN recency_days<=30 THEN 5 WHEN recency_days<=60 THEN 4 WHEN recency_days<=90 THEN 3 WHEN recency_days<=180 THEN 2 ELSE 1 END) >= 4
       AND (CASE WHEN frequency>=5 THEN 5 WHEN frequency>=4 THEN 4 WHEN frequency>=3 THEN 3 WHEN frequency>=2 THEN 2 ELSE 1 END) <= 2 THEN 'Recent Users'
      WHEN (CASE WHEN recency_days<=30 THEN 5 WHEN recency_days<=60 THEN 4 WHEN recency_days<=90 THEN 3 WHEN recency_days<=180 THEN 2 ELSE 1 END) >= 3
       AND (CASE WHEN monetary>=10000 THEN 5 WHEN monetary>=5000 THEN 4 WHEN monetary>=2000 THEN 3 WHEN monetary>=1000 THEN 2 ELSE 1 END) >= 3 THEN 'Potential Loyalists'
      WHEN (CASE WHEN recency_days<=30 THEN 5 WHEN recency_days<=60 THEN 4 WHEN recency_days<=90 THEN 3 WHEN recency_days<=180 THEN 2 ELSE 1 END) <= 2
       AND (CASE WHEN frequency>=5 THEN 5 WHEN frequency>=4 THEN 4 WHEN frequency>=3 THEN 3 WHEN frequency>=2 THEN 2 ELSE 1 END) >= 3 THEN 'Cannot Lose Them'
      WHEN (CASE WHEN recency_days<=30 THEN 5 WHEN recency_days<=60 THEN 4 WHEN recency_days<=90 THEN 3 WHEN recency_days<=180 THEN 2 ELSE 1 END) <= 2
       AND (CASE WHEN frequency>=5 THEN 5 WHEN frequency>=4 THEN 4 WHEN frequency>=3 THEN 3 WHEN frequency>=2 THEN 2 ELSE 1 END) >= 2 THEN 'Hibernating'
      WHEN monetary >= 5000 THEN 'Others'
      ELSE 'Hibernating'
    END AS segment
  FROM curr_stats
)
SELECT p.segment AS from_segment, c.segment AS to_segment, COUNT(*) AS customers
FROM prev_seg p JOIN curr_seg c USING (CustomerId)
WHERE p.segment != c.segment
GROUP BY from_segment, to_segment
ORDER BY customers DESC
LIMIT 50`)

    const pk = prevKpis[0] || {}
    const pMeta = prevAdsKpis.find(r => r.platform === 'Meta') || {}
    const pGoogle = prevAdsKpis.find(r => r.platform === 'Google') || {}
    const pTotalSpend = (parseFloat(pMeta.spend) || 0) + (parseFloat(pGoogle.spend) || 0)
    const pGrossSales = parseFloat(pk.gross_sales) || 0
    const pTotalCustomers = parseInt(pk.total_customers) || 0
    const pNewCustomers = parseInt(pk.new_customers) || 0
    const pReturningCustomers = parseInt(pk.returning_customers) || 0
    const pRepeatRevenue = parseFloat(pk.repeat_revenue) || 0
    const pNetRevenue = parseFloat(pk.net_revenue) || 0

    res.json({
      kpis: {
        grossSales,
        grossExcGst,
        totalSpend,
        metaSpend,
        googleSpend,
        additionalSpend,
        totalCustomers,
        newCustomers,
        returningCustomers,
        repeatRate: totalCustomers > 0 ? returningCustomers / totalCustomers : 0,
        roas: totalSpend > 0 ? grossExcGst / totalSpend : 0,
        cac,
        ltv12,
        ltvCac,
        aov: parseFloat(k.aov) || 0,
        acquisitionRate: totalCustomers > 0 ? newCustomers / totalCustomers : 0,
        repeatRevenue: parseFloat(k.repeat_revenue) || 0,
        repeatRevenueRate: grossSales > 0 ? (parseFloat(k.repeat_revenue) || 0) / grossSales : 0,
        netRevenue,
        netRevenueRate: grossExcGst > 0 ? netRevenue / grossExcGst : 0,
        discountedOrders: parseInt(k.discounted_orders) || 0,
        nonDiscountedOrders: parseInt(k.non_discounted_orders) || 0,
        totalOrders: parseInt(k.total_orders) || 0,
      },
      prevKpis: {
        grossSales: pGrossSales,
        grossExcGst: parseFloat(pk.gross_exc_gst) || 0,
        totalSpend: pTotalSpend,
        metaSpend: parseFloat(pMeta.spend) || 0,
        googleSpend: parseFloat(pGoogle.spend) || 0,
        totalCustomers: pTotalCustomers,
        newCustomers: pNewCustomers,
        returningCustomers: pReturningCustomers,
        repeatRate: pTotalCustomers > 0 ? pReturningCustomers / pTotalCustomers : 0,
        roas: pTotalSpend > 0 ? (parseFloat(pk.gross_exc_gst) || 0) / pTotalSpend : 0,
        cac: pNewCustomers > 0 ? pTotalSpend / pNewCustomers : 0,
        aov: parseFloat(pk.aov) || 0,
        acquisitionRate: pTotalCustomers > 0 ? pNewCustomers / pTotalCustomers : 0,
        repeatRevenue: pRepeatRevenue,
        repeatRevenueRate: pGrossSales > 0 ? pRepeatRevenue / pGrossSales : 0,
        netRevenue: pNetRevenue,
        netRevenueRate: pGrossSales > 0 ? pNetRevenue / pGrossSales : 0,
        totalOrders: parseInt(pk.total_orders) || 0,
      },
      daily: monthly.map(r => ({
        date: r.day,
        customersAcquired: parseInt(r.customers_acquired) || 0,
        totalOrders: parseInt(r.total_orders) || 0,
        grossSales: parseFloat(r.gross_sales) || 0,
        grossSalesExc: parseFloat(r.gross_sales_exc) || 0,
        repeatRevenue: parseFloat(r.repeat_revenue) || 0,
        newRevenue: parseFloat(r.new_revenue) || 0,
        newSales: parseFloat(r.new_revenue) || 0,
        repeatSales: parseFloat(r.repeat_revenue) || 0,
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
      segMigration: segMigration.map(r => ({
        from: r.from_segment,
        to: r.to_segment,
        customers: parseInt(r.customers) || 0,
      })),
      freqDist: freqDist.map(r => ({
        label: r.frequency_label,
        customers: parseInt(r.customers) || 0,
        totalOrders: parseInt(r.total_orders) || 0,
      })),
      monetaryDist: monetaryDist.map(r => ({
        bucket: r.bucket,
        customers: parseInt(r.customers) || 0,
        revenue: parseFloat(r.total_revenue) || 0,
        avgRevenue: parseFloat(r.avg_revenue) || 0,
      })),
      inactivity: inactivity.map(r => ({
        bucket: r.bucket,
        customers: parseInt(r.customers) || 0,
      })),
      discountDist: discountDist.map(r => ({
        bucket: r.discount_bucket,
        totalOrders: parseInt(r.total_orders) || 0,
        firstOrders: parseInt(r.first_orders) || 0,
        repeatOrders: parseInt(r.repeat_orders) || 0,
        aovExc: parseFloat(r.aov_exc) || 0,
        uniqueCustomers: parseInt(r.unique_customers) || 0,
        avgOrdersPerCustomer: parseFloat(r.avg_orders_per_customer) || 0,
      })),
      dailySpend: dailySpend.map(r => ({
        date: r.day,
        totalSpend: parseFloat(r.total_spend) || 0,
      })),
      discountRepeatRate: discountRepeatRate.map(r => ({
        bucket: r.discount_bucket,
        totalCustomers: parseInt(r.total_customers) || 0,
        repeatCustomers: parseInt(r.repeat_customers) || 0,
        repeatRate: parseFloat(r.repeat_rate) || 0,
      })),
      daysToSecondPurchase: daysToSecondPurchase.map(r => ({
        bucket: r.bucket,
        customers: parseInt(r.customers) || 0,
      })),
      aovByOrderNumber: aovByOrderNumber.map(r => ({
        orderLabel: r.order_label,
        aov: parseFloat(r.aov) || 0,
        customers: parseInt(r.customers) || 0,
      })),
    })
  } catch (err) {
    console.error('[customer]', err)
    res.status(500).json({ error: err.message })
  }
}


