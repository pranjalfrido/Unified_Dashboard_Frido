import { getBQ } from './_bq.js'

// COGS Ledger auto-fill: given a list of SKU codes, returns per-SKU identity
// (category/subcategory from item master) and last-60-day sales performance
// (revenue inc GST, qty sold, ASP) from the live sales fact table. Item master
// is the source of truth for category/subcategory (see api/_bq.js's buildQuery
// comment — the fact table's own Category/SubCategory columns are a dbt-side
// default and can be wrong), so both come from the same join pattern used there.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const { skus } = req.body || {}
    if (!Array.isArray(skus) || !skus.length) return res.status(400).json({ error: 'skus[] required' })

    const cleanSkus = [...new Set(skus.map(s => String(s || '').trim().toUpperCase()).filter(Boolean))]
    if (!cleanSkus.length) return res.status(400).json({ error: 'no valid skus' })

    const bq = getBQ()
    const sql = `
WITH item_master AS (
  SELECT
    REGEXP_REPLACE(UPPER(TRIM(Product_Code)), r'[^A-Z0-9-]', '') AS sku_key,
    ANY_VALUE(Product_Code) AS Product_Code,
    CASE WHEN LOWER(ANY_VALUE(Category_Name)) LIKE '%spare%' THEN 'Others' ELSE ANY_VALUE(Category_Name) END AS Category_Name,
    CASE WHEN LOWER(ANY_VALUE(Category_Name)) LIKE '%spare%' THEN 'Others' ELSE ANY_VALUE(Sub_category) END AS Sub_category
  FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
  WHERE Product_Code IS NOT NULL AND TRIM(Product_Code) != ''
  GROUP BY sku_key
),
requested AS (
  SELECT sku FROM UNNEST(@skus) AS sku
),
sales_60d AS (
  SELECT
    REGEXP_REPLACE(UPPER(TRIM(u.masterskucode)), r'[^A-Z0-9-]', '') AS sku_key,
    SUM(CAST(u.ItemQty AS FLOAT64)) AS qty_60d,
    SUM(u.SellingPrice_Inc_GST) AS revenue_inc_gst_60d
  FROM \`frido-429506.production.fact_all_platform_sales_report\` u
  WHERE u.OrderDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
    AND u.Order_Status NOT IN ('Cancelled', 'RTO', 'Return', 'CIR')
    AND REGEXP_REPLACE(UPPER(TRIM(u.masterskucode)), r'[^A-Z0-9-]', '') IN (
      SELECT REGEXP_REPLACE(UPPER(TRIM(sku)), r'[^A-Z0-9-]', '') FROM requested
    )
  GROUP BY sku_key
)
SELECT
  r.sku AS requested_sku,
  im.Product_Code AS matched_sku,
  im.Category_Name AS category,
  im.Sub_category AS subcategory,
  COALESCE(s.qty_60d, 0) AS qty_60d,
  ROUND(COALESCE(s.revenue_inc_gst_60d, 0), 2) AS revenue_inc_gst_60d,
  CASE WHEN COALESCE(s.qty_60d, 0) > 0
    THEN ROUND(s.revenue_inc_gst_60d / s.qty_60d, 2)
    ELSE NULL END AS asp_inc_gst_60d
FROM requested r
LEFT JOIN item_master im ON REGEXP_REPLACE(UPPER(TRIM(r.sku)), r'[^A-Z0-9-]', '') = im.sku_key
LEFT JOIN sales_60d s ON s.sku_key = REGEXP_REPLACE(UPPER(TRIM(r.sku)), r'[^A-Z0-9-]', '')
`
    const [rows] = await bq.query({ query: sql, params: { skus: cleanSkus } })

    const bySku = {}
    for (const row of rows) {
      bySku[row.requested_sku] = {
        found: row.matched_sku != null,
        category: row.category ?? null,
        subcategory: row.subcategory ?? null,
        qty_60d: row.qty_60d ?? 0,
        revenue_inc_gst_60d: row.revenue_inc_gst_60d ?? 0,
        asp_inc_gst_60d: row.asp_inc_gst_60d ?? null,
      }
    }
    return res.status(200).json({ skus: bySku })
  } catch (e) {
    console.error('cogs-context error:', e)
    return res.status(500).json({ error: e.message ?? String(e) })
  }
}
