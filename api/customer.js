import { getBQ } from './_bq.js'

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

    const [kpis, monthly, cohort, crossSell, rfm, freqDist, monetaryDist, inactivity, discountDist, adsKpis] = await Promise.all([
      // Query 1 — kpis
      run(`WITH orders AS (
  SELECT
    o.customer_id,
    o.order_id,
    DATE(o.order_date_ist) AS order_date,
    o.selling_price_excl_shipping_tax AS rev,
    o.selling_price_incl_tax AS rev_inc,
    o.total_discounts,
    MIN(DATE(o.order_date_ist)) OVER (PARTITION BY o.customer_id) AS first_order_date
  FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` o
  WHERE DATE(o.order_date_ist) BETWEEN '${s}' AND '${e}'
    AND o.customer_id IS NOT NULL
    AND o.financial_status NOT IN ('refunded','voided')
)
SELECT
  COUNT(DISTINCT customer_id) AS total_customers,
  COUNTIF(first_order_date BETWEEN '${s}' AND '${e}') AS new_customers,
  COUNTIF(first_order_date < '${s}') AS returning_customers,
  COUNT(DISTINCT order_id) AS total_orders,
  ROUND(SUM(rev), 0) AS gross_sales,
  ROUND(SAFE_DIVIDE(SUM(rev), COUNT(DISTINCT order_id)), 0) AS aov,
  ROUND(SAFE_DIVIDE(SUM(total_discounts), SUM(rev_inc + total_discounts)), 4) AS avg_discount_rate,
  COUNTIF(total_discounts > 0) AS discounted_orders,
  COUNT(DISTINCT order_id) - COUNTIF(total_discounts > 0) AS non_discounted_orders
FROM orders`),

      // Query 2 — monthly
      run(`WITH first_dates AS (
  SELECT customer_id, MIN(DATE(order_date_ist)) AS first_date
  FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\`
  WHERE customer_id IS NOT NULL
  GROUP BY customer_id
),
period_orders AS (
  SELECT o.customer_id, DATE(o.order_date_ist) AS order_date,
    o.selling_price_excl_shipping_tax AS rev,
    f.first_date
  FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` o
  JOIN first_dates f USING (customer_id)
  WHERE DATE(o.order_date_ist) BETWEEN '${s}' AND '${e}'
    AND o.customer_id IS NOT NULL
    AND o.financial_status NOT IN ('refunded','voided')
)
SELECT
  FORMAT_DATE('%Y-%m', order_date) AS month,
  COUNT(DISTINCT customer_id) AS customers_acquired,
  ROUND(SUM(rev), 0) AS gross_sales,
  COUNT(DISTINCT CASE WHEN first_date BETWEEN DATE('${s}') AND DATE('${e}') THEN customer_id END) AS new_customers,
  COUNT(DISTINCT CASE WHEN first_date < DATE('${s}') THEN customer_id END) AS repeat_customers
FROM period_orders
GROUP BY month
ORDER BY month`),

      // Query 3 — cohort
      run(`WITH first_orders AS (
  SELECT customer_id, DATE_TRUNC(MIN(DATE(order_date_ist)), MONTH) AS cohort_month
  FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\`
  WHERE customer_id IS NOT NULL
  GROUP BY customer_id
),
all_orders AS (
  SELECT DISTINCT o.customer_id, DATE_TRUNC(DATE(o.order_date_ist), MONTH) AS order_month
  FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` o
  WHERE customer_id IS NOT NULL AND financial_status NOT IN ('refunded','voided')
),
cohort_data AS (
  SELECT f.cohort_month, DATE_DIFF(a.order_month, f.cohort_month, MONTH) AS cohort_index,
    COUNT(DISTINCT a.customer_id) AS customers
  FROM first_orders f
  JOIN all_orders a USING (customer_id)
  WHERE f.cohort_month >= DATE_TRUNC(DATE_SUB(DATE('${e}'), INTERVAL 18 MONTH), MONTH)
    AND f.cohort_month <= DATE_TRUNC(DATE('${e}'), MONTH)
    AND DATE_DIFF(a.order_month, f.cohort_month, MONTH) BETWEEN 0 AND 14
  GROUP BY cohort_month, cohort_index
)
SELECT FORMAT_DATE('%Y-%m', cohort_month) AS cohort_month, cohort_index, customers
FROM cohort_data
ORDER BY cohort_month, cohort_index`),

      // Query 4 — crossSell
      run(`WITH ranked AS (
  SELECT customer_id, MasterSKU AS sku,
    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date_ist) AS rn
  FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\`
  WHERE customer_id IS NOT NULL AND financial_status NOT IN ('refunded','voided')
),
im AS (
  SELECT DISTINCT TRIM(Sub_category) AS sku, ANY_VALUE(Category_Name) AS category
  FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
  WHERE Sub_category IS NOT NULL GROUP BY TRIM(Sub_category)
),
fp AS (SELECT customer_id, sku AS first_sku FROM ranked WHERE rn = 1),
sp AS (SELECT customer_id, sku AS second_sku FROM ranked WHERE rn = 2)
SELECT
  COALESCE(im1.category, fp.first_sku) AS first_category,
  COALESCE(im2.category, sp.second_sku) AS second_category,
  COUNT(DISTINCT fp.customer_id) AS customers
FROM fp
JOIN sp USING (customer_id)
LEFT JOIN im im1 ON fp.first_sku = im1.sku
LEFT JOIN im im2 ON sp.second_sku = im2.sku
GROUP BY first_category, second_category
HAVING COUNT(DISTINCT fp.customer_id) > 0
ORDER BY customers DESC`),

      // Query 5 — rfm
      run(`WITH customer_stats AS (
  SELECT
    customer_id,
    DATE_DIFF(DATE('${e}'), MAX(DATE(order_date_ist)), DAY) AS recency_days,
    COUNT(DISTINCT order_id) AS frequency,
    ROUND(SUM(selling_price_excl_shipping_tax), 0) AS monetary
  FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\`
  WHERE customer_id IS NOT NULL AND financial_status NOT IN ('refunded','voided')
    AND DATE(order_date_ist) <= DATE('${e}')
  GROUP BY customer_id
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
    (r_score + f_score + m_score) / 3.0 AS avg_score,
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

      // Query 6 — freqDist
      run(`WITH freq AS (
  SELECT customer_id, COUNT(DISTINCT order_id) AS orders
  FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\`
  WHERE customer_id IS NOT NULL AND financial_status NOT IN ('refunded','voided')
    AND DATE(order_date_ist) <= DATE('${e}')
  GROUP BY customer_id
)
SELECT
  CASE WHEN orders = 1 THEN 'Very Low (1 Order)' WHEN orders = 2 THEN 'Low (2 Orders)' WHEN orders = 3 THEN 'Medium (3 Orders)' WHEN orders BETWEEN 4 AND 5 THEN 'High (4–5 Orders)' ELSE 'Very High (5+ Orders)' END AS frequency_label,
  COUNT(*) AS customers,
  ROUND(SUM(orders), 0) AS total_orders
FROM freq
GROUP BY frequency_label
ORDER BY MIN(orders)`),

      // Query 7 — monetaryDist
      run(`WITH customer_ltv AS (
  SELECT customer_id, ROUND(SUM(selling_price_excl_shipping_tax), 0) AS monetary
  FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\`
  WHERE customer_id IS NOT NULL AND financial_status NOT IN ('refunded','voided')
    AND DATE(order_date_ist) <= DATE('${e}')
  GROUP BY customer_id
)
SELECT
  CASE WHEN monetary < 500 THEN 'Very Low (₹0–₹500)' WHEN monetary < 2000 THEN 'Low (₹500–₹2K)' WHEN monetary < 5000 THEN 'Medium (₹2K–₹5K)' WHEN monetary < 10000 THEN 'High (₹5K–₹10K)' ELSE 'Very High (₹10K+)' END AS bucket,
  COUNT(*) AS customers,
  ROUND(SUM(monetary), 0) AS total_revenue,
  ROUND(AVG(monetary), 0) AS avg_revenue
FROM customer_ltv
GROUP BY bucket
ORDER BY MIN(monetary)`),

      // Query 8 — inactivity
      run(`WITH last_purchase AS (
  SELECT customer_id, MAX(DATE(order_date_ist)) AS last_date
  FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\`
  WHERE customer_id IS NOT NULL AND financial_status NOT IN ('refunded','voided')
  GROUP BY customer_id
),
with_days AS (
  SELECT customer_id, DATE_DIFF(DATE('${e}'), last_date, DAY) AS days_since
  FROM last_purchase
)
SELECT
  CASE WHEN days_since < 30 THEN 'Active (<30 Days)' WHEN days_since < 60 THEN 'Inactive 30–59 Days' WHEN days_since < 90 THEN 'Inactive 60–89 Days' ELSE 'Inactive 90+ Days' END AS bucket,
  COUNT(*) AS customers
FROM with_days
GROUP BY bucket
ORDER BY MIN(days_since)`),

      // Query 9 — discountDist
      run(`WITH first_dates AS (
  SELECT customer_id, MIN(DATE(order_date_ist)) AS first_date
  FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\`
  WHERE customer_id IS NOT NULL GROUP BY customer_id
),
tagged AS (
  SELECT o.order_id, o.total_discounts, o.selling_price_incl_tax,
    CASE WHEN DATE(o.order_date_ist) = f.first_date THEN 'First Order' ELSE 'Repeat Order' END AS order_type
  FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` o
  JOIN first_dates f USING (customer_id)
  WHERE DATE(o.order_date_ist) BETWEEN '${s}' AND '${e}'
    AND o.customer_id IS NOT NULL AND o.financial_status NOT IN ('refunded','voided')
),
bucketed AS (
  SELECT order_type,
    CASE
      WHEN total_discounts = 0 OR selling_price_incl_tax + total_discounts = 0 THEN '0%'
      WHEN SAFE_DIVIDE(total_discounts, selling_price_incl_tax + total_discounts) <= 0.10 THEN '1-10%'
      WHEN SAFE_DIVIDE(total_discounts, selling_price_incl_tax + total_discounts) <= 0.20 THEN '11-20%'
      WHEN SAFE_DIVIDE(total_discounts, selling_price_incl_tax + total_discounts) <= 0.30 THEN '21-30%'
      WHEN SAFE_DIVIDE(total_discounts, selling_price_incl_tax + total_discounts) <= 0.40 THEN '31-40%'
      ELSE '40%+'
    END AS discount_bucket
  FROM tagged
)
SELECT discount_bucket,
  COUNTIF(order_type = 'First Order') AS first_orders,
  COUNTIF(order_type = 'Repeat Order') AS repeat_orders
FROM bucketed
GROUP BY discount_bucket
ORDER BY MIN(CASE discount_bucket WHEN '0%' THEN 0 WHEN '1-10%' THEN 1 WHEN '11-20%' THEN 2 WHEN '21-30%' THEN 3 WHEN '31-40%' THEN 4 ELSE 5 END)`),

      // Query 10 — adsKpis
      run(`SELECT platform, ROUND(SUM(spend), 0) AS spend, ROUND(SUM(revenue), 0) AS revenue, ROUND(SUM(orders), 0) AS orders
FROM \`frido-429506.production.fact_all_platform_ads_report\`
WHERE report_date BETWEEN '${s}' AND '${e}' AND platform IN ('Meta', 'Google')
GROUP BY platform`),
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
        cltv: 0,
        acquisitionRate: totalCustomers > 0 ? newCustomers / totalCustomers : 0,
        repeatRevenueRate: 0,
        discountedOrders: parseInt(k.discounted_orders) || 0,
        nonDiscountedOrders: parseInt(k.non_discounted_orders) || 0,
        totalOrders: parseInt(k.total_orders) || 0,
      },
      monthly: monthly.map(r => ({
        month: r.month,
        customersAcquired: parseInt(r.customers_acquired) || 0,
        grossSales: parseFloat(r.gross_sales) || 0,
        newCustomers: parseInt(r.new_customers) || 0,
        repeatCustomers: parseInt(r.repeat_customers) || 0,
      })),
      cohort: cohort.map(r => ({
        cohortMonth: r.cohort_month,
        cohortIndex: parseInt(r.cohort_index),
        customers: parseInt(r.customers),
      })),
      crossSell: crossSell.map(r => ({
        firstCategory: r.first_category,
        secondCategory: r.second_category,
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
    })
  } catch (err) {
    console.error('[customer]', err)
    res.status(500).json({ error: err.message })
  }
}
