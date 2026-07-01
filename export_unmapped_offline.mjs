import { BigQuery } from '@google-cloud/bigquery'
import { writeFileSync } from 'fs'
const bq = new BigQuery({ keyFilename: 'sa_key.json', projectId: 'frido-429506' })

const q = `
WITH offline_all AS (
  SELECT Particulars, COALESCE(Alt__Units, Quantity) AS qty, Value, 'MTGT' AS src FROM \`frido-429506.offline_sales.MTGT\`
  UNION ALL SELECT Particulars, COALESCE(Alt__Units, Quantity), Value, 'Offline_B2B' FROM \`frido-429506.offline_sales.Offline_B2B\`
  UNION ALL SELECT Particulars, COALESCE(Alt__Units, Quantity), Value, 'Stockist' FROM \`frido-429506.offline_sales.Stockist\`
),
sm AS (SELECT DISTINCT TRIM(productid) AS productid, TRIM(masterskucode) AS masterskucode FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` WHERE TRIM(masterskucode) NOT IN ('', 'not found')),
im AS (SELECT DISTINCT TRIM(Product_Code) AS pc, TRIM(Category_Name) AS cat FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\` WHERE TRIM(Product_Code) != '')
SELECT
  TRIM(o.Particulars) AS particulars,
  STRING_AGG(DISTINCT o.src ORDER BY o.src) AS sources,
  COUNT(*) AS rows_count,
  SUM(CAST(o.qty AS FLOAT64)) AS total_qty,
  SUM(CAST(o.Value AS FLOAT64)) AS total_value
FROM offline_all o
LEFT JOIN sm ON TRIM(o.Particulars) = sm.productid
LEFT JOIN im ON COALESCE(sm.masterskucode, TRIM(o.Particulars)) = im.pc
WHERE im.cat IS NULL AND TRIM(o.Particulars) != ''
GROUP BY TRIM(o.Particulars)
ORDER BY total_value DESC
`
const [rows] = await bq.query(q)

const escape = v => {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

const lines = ['Particulars (Tally Product Name),Sources,Total Rows,Total Qty,Total Value (₹),Master SKU Code (TO FILL),Category (TO FILL),Sub-Category (TO FILL)']
rows.forEach(r => {
  lines.push([
    escape(r.particulars),
    escape(r.sources),
    r.rows_count,
    Math.round(r.total_qty || 0),
    Math.round(r.total_value || 0),
    '', '', ''
  ].join(','))
})

writeFileSync('unmapped_offline_skus.csv', lines.join('\n'), 'utf8')
console.log(`✅ Exported ${rows.length} unmapped offline products to unmapped_offline_skus.csv`)
console.log(`Total unmapped value: ₹${Math.round(rows.reduce((s, r) => s + (r.total_value || 0), 0)).toLocaleString('en-IN')}`)
