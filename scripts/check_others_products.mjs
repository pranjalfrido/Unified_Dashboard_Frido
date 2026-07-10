import { BigQuery } from '@google-cloud/bigquery'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const bq = new BigQuery({ keyFilename: join(__dirname, '../../sa_key.json'), projectId: 'frido-429506' })

// These are subcategories from valid item master categories that have no ad campaign
// i.e. they appear in sales but not in adsCategoryBreakdown product-targeted rows
const [rows] = await bq.query(`
WITH valid_cats AS (
  SELECT DISTINCT LOWER(TRIM(Category_Name)) AS cat_key, Category_Name
  FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
  WHERE Category_Name IS NOT NULL AND TRIM(Category_Name) != ''
),
ad_products AS (
  SELECT DISTINCT LOWER(TRIM(product_name)) AS prod_key
  FROM \`frido-429506.production.fact_all_platform_ads_report\`
  WHERE report_date BETWEEN '2026-07-03' AND '2026-07-09'
    AND target_type = 'product'
    AND product_name IS NOT NULL AND TRIM(product_name) != ''
    AND platform IN ('Meta', 'Google')
)
SELECT s.SubCategory, s.Category, ROUND(SUM(s.SellingPrice_Exc_GST),0) AS revenue, COUNT(DISTINCT s.OrderId) AS orders
FROM \`frido-429506.production.fact_all_platform_sales_report\` s
JOIN valid_cats vc ON LOWER(TRIM(s.Category)) = vc.cat_key
LEFT JOIN ad_products ap ON LOWER(TRIM(s.SubCategory)) = ap.prod_key
WHERE s.OrderDate BETWEEN '2026-07-03' AND '2026-07-09'
  AND s.Channel = 'Shopify'
  AND s.SubCategory IS NOT NULL AND TRIM(s.SubCategory) != ''
  AND ap.prod_key IS NULL
GROUP BY s.SubCategory, s.Category
ORDER BY revenue DESC
LIMIT 30
`)
console.log('SubCategories in sales with NO ad campaign (going into Others):')
rows.forEach(r => console.log(`  [${r.Category}] ${r.SubCategory} | Revenue: ₹${r.revenue} | Orders: ${r.orders}`))
