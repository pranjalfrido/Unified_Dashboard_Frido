import { BigQuery } from '@google-cloud/bigquery'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { writeFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const bq = new BigQuery({ keyFilename: join(__dirname, '../../sa_key.json'), projectId: 'frido-429506' })

// All subcategories that NEVER had a product-targeted ad campaign on Meta or Google
const [rows] = await bq.query(`
WITH valid_cats AS (
  SELECT DISTINCT LOWER(TRIM(Category_Name)) AS cat_key, Category_Name
  FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
  WHERE Category_Name IS NOT NULL AND TRIM(Category_Name) != ''
),
ad_products AS (
  SELECT DISTINCT LOWER(TRIM(product_name)) AS prod_key
  FROM \`frido-429506.production.fact_all_platform_ads_report\`
  WHERE target_type = 'product'
    AND product_name IS NOT NULL AND TRIM(product_name) != ''
    AND platform IN ('Meta', 'Google')
)
SELECT s.Category, s.SubCategory,
  ROUND(SUM(s.SellingPrice_Exc_GST),0) AS revenue,
  COUNT(DISTINCT s.OrderId) AS orders,
  SUM(s.ItemQty) AS units
FROM \`frido-429506.production.fact_all_platform_sales_report\` s
JOIN valid_cats vc ON LOWER(TRIM(s.Category)) = vc.cat_key
LEFT JOIN ad_products ap ON LOWER(TRIM(s.SubCategory)) = ap.prod_key
WHERE s.Channel = 'Shopify'
  AND s.SubCategory IS NOT NULL AND TRIM(s.SubCategory) != ''
  AND ap.prod_key IS NULL
GROUP BY s.Category, s.SubCategory
ORDER BY revenue DESC
`)

const header = 'Category,SubCategory,Revenue,Orders,Units'
const lines = rows.map(r => `"${r.Category}","${r.SubCategory}",${r.revenue},${r.orders},${r.units}`)
const csv = [header, ...lines].join('\n')

const outPath = join(__dirname, '../../others_products_alltime.csv')
writeFileSync(outPath, csv)
console.log(`Exported ${rows.length} rows to others_products_alltime.csv`)
