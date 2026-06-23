import { getBQ } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()
const [rows] = await bq.query({ query: `
  SELECT
    TRIM(CAST(b.item_id AS STRING)) AS item_id,
    pb.selling_price                AS item_master_selling_price,
    im.GST_Tax_Type_Code,
    im.Category
  FROM \`frido-429506.production.fact_blinkit_sales_report\` b
  LEFT JOIN (
    SELECT DISTINCT TRIM(productid) AS productid,
      SAFE_CAST(TRIM(REGEXP_REPLACE(Selling_Price, r'[^\x20-\x7E]', '')) AS FLOAT64) AS selling_price
    FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\`
    WHERE TRIM(channelname) = 'Blinkit'
  ) pb ON TRIM(CAST(b.item_id AS STRING)) = pb.productid
  LEFT JOIN (
    SELECT DISTINCT TRIM(productid) AS productid, TRIM(masterskucode) AS masterskucode
    FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\`
    WHERE TRIM(masterskucode) NOT IN ('', 'not found')
  ) sm ON TRIM(CAST(b.item_id AS STRING)) = sm.productid
  LEFT JOIN (
    SELECT DISTINCT TRIM(Product_Code) AS Product_Code, TRIM(GST_Tax_Type_Code) AS GST_Tax_Type_Code, TRIM(Category_Name) AS Category
    FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
  ) im ON COALESCE(sm.masterskucode, TRIM(CAST(b.item_id AS STRING))) = im.Product_Code
  WHERE b.date = '2026-06-15'
  GROUP BY item_id, pb.selling_price, im.GST_Tax_Type_Code, im.Category
  LIMIT 20
` })

console.log('item_id'.padEnd(12), '| selling_price'.padEnd(20), '| GST%'.padEnd(8), '| category')
console.log('-'.repeat(70))
let noPrice = 0, noGST = 0
rows.forEach(r => {
  if (!r.item_master_selling_price) noPrice++
  if (!r.GST_Tax_Type_Code) noGST++
  console.log(
    String(r.item_id ?? '').padEnd(12),
    '|', String(r.item_master_selling_price ?? 'NULL').padEnd(18),
    '|', String(r.GST_Tax_Type_Code ?? 'NULL').padEnd(6),
    '|', r.Category ?? 'NULL'
  )
})
console.log(`\nOut of ${rows.length} rows: ${noPrice} have no Item Master selling price, ${noGST} have no GST%`)
