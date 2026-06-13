import { BigQuery } from '@google-cloud/bigquery'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url))
const bq = new BigQuery({ keyFilename: join(__dirname, '..', 'sa_key.json'), projectId: 'frido-429506' })

const q = `
SELECT
  SUM(row_count) AS total_rows,
  ROUND(SUM(row_count) * 400 / 1024 / 1024, 0) AS estimated_mb
FROM (
  SELECT COUNT(*) AS row_count FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\`
  UNION ALL SELECT COUNT(*) FROM \`frido-429506.production.fact_shopify_b2b_orders\`
  UNION ALL SELECT COUNT(*) FROM \`frido-429506.production.fact_shopify_international_orders\`
  UNION ALL SELECT COUNT(*) FROM \`frido-429506.production.amazon_seller_central_all_orders\`
  UNION ALL SELECT COUNT(*) FROM \`frido-429506.production.Amazon_Vendor_Central_sales_DateASIN_wise\`
  UNION ALL SELECT COUNT(*) FROM \`frido-429506.production.amazon_seller_central_uk_uae_all_orders\`
  UNION ALL SELECT COUNT(*) FROM \`frido-429506.test_flipkart_dataset.sales_report\`
  UNION ALL SELECT COUNT(*) FROM \`frido-429506.production.fact_myntra_orders_report\`
  UNION ALL SELECT COUNT(*) FROM \`frido-429506.production.fact_blinkit_sales_report\`
  UNION ALL SELECT COUNT(*) FROM \`frido-429506.production.zepto_sales_report\`
  UNION ALL SELECT COUNT(*) FROM \`frido-429506.production.fact_instamart_sales_report\`
  UNION ALL SELECT COUNT(*) FROM \`frido-429506.production.Unicommerce_Sale_Orders_Report\`
)
`
const [rows] = await bq.query({ query: q })
console.log('Total rows across all channels:', rows[0].total_rows)
console.log('Estimated storage in Supabase (~400 bytes/row):', rows[0].estimated_mb, 'MB')
console.log('At 500 bytes/row:', Math.round(Number(rows[0].total_rows) * 500 / 1024 / 1024), 'MB')
