import { BigQuery } from '@google-cloud/bigquery'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const bq = new BigQuery({ keyFilename: join(__dirname, '../../sa_key.json'), projectId: 'frido-429506' })

const query = `
WITH im_sub AS (
  SELECT LOWER(TRIM(Sub_category)) AS sub_key, ANY_VALUE(Category_Name) AS Category_Name
  FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
  WHERE Sub_category IS NOT NULL GROUP BY sub_key
),
im_cat AS (
  SELECT LOWER(TRIM(Category_Name)) AS cat_key, ANY_VALUE(Category_Name) AS Category_Name
  FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
  WHERE Category_Name IS NOT NULL GROUP BY cat_key
),
camp_map AS (
  SELECT LOWER(TRIM(campaign_name)) AS camp_key, ANY_VALUE(product_name) AS product_name,
    ANY_VALUE(category) AS category, ANY_VALUE(target_type) AS target_type
  FROM \`frido-429506.ads_campaign_mapping.master_campaign_mapping_sheet_all_platforms\`
  WHERE campaign_name IS NOT NULL GROUP BY camp_key
),
mapped AS (
  SELECT a.platform, a.campaign_name, a.target_type AS orig_target_type,
    COALESCE(m.target_type, a.target_type) AS target_type,
    COALESCE(m.product_name, a.product_name) AS product_name,
    COALESCE(m.category, CASE
      WHEN a.target_type = 'product' THEN COALESCE(i_prod.Category_Name, 'Unknown')
      WHEN a.target_type = 'category' THEN COALESCE(i_cat.Category_Name, a.product_name)
      ELSE 'Unknown'
    END) AS category,
    a.spend
  FROM \`frido-429506.production.fact_all_platform_ads_report\` a
  LEFT JOIN camp_map m ON LOWER(TRIM(a.campaign_name)) = m.camp_key AND (a.product_name IS NULL OR TRIM(a.product_name) = '')
  LEFT JOIN im_sub i_prod ON a.target_type = 'product' AND LOWER(TRIM(a.product_name)) = i_prod.sub_key
  LEFT JOIN im_cat i_cat ON a.target_type = 'category' AND LOWER(TRIM(a.product_name)) = i_cat.cat_key
  WHERE a.report_date BETWEEN '2026-06-01' AND '2026-06-30'
    AND a.target_type != 'all'
    AND (a.product_name IS NOT NULL AND TRIM(a.product_name) != '' OR m.product_name IS NOT NULL)
)
SELECT campaign_name, platform, orig_target_type, product_name, ROUND(SUM(spend),0) AS spend
FROM mapped
WHERE category = 'Unknown'
GROUP BY campaign_name, platform, orig_target_type, product_name
ORDER BY spend DESC
LIMIT 30
`

const [rows] = await bq.query(query)
console.log(`Found ${rows.length} campaigns with Unknown category:`)
rows.forEach(r => console.log(`  ${r.platform} | ${r.orig_target_type} | product: ${r.product_name} | campaign: ${r.campaign_name} | spend: ${r.spend}`))
