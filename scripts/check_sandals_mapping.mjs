import { BigQuery } from '@google-cloud/bigquery'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const bq = new BigQuery({ keyFilename: join(__dirname, '../../sa_key.json'), projectId: 'frido-429506' })

const [adsRows] = await bq.query(`
  SELECT DISTINCT product_name, target_type, platform
  FROM \`frido-429506.production.fact_all_platform_ads_report\`
  WHERE LOWER(product_name) LIKE '%sandal%' OR LOWER(product_name) LIKE '%cloud comfort%'
    AND platform IN ('Meta', 'Google')
  LIMIT 20
`)
console.log('Sandals-related product_names in ads table:')
adsRows.forEach(r => console.log(`  [${r.platform}] target_type: ${r.target_type} | product_name: ${r.product_name}`))

const [salesRows] = await bq.query(`
  SELECT DISTINCT SubCategory, Category
  FROM \`frido-429506.production.fact_all_platform_sales_report\`
  WHERE LOWER(SubCategory) LIKE '%sandal%' OR LOWER(SubCategory) LIKE '%cloud comfort%'
  LIMIT 20
`)
console.log('\nSandals-related SubCategory in sales table:')
salesRows.forEach(r => console.log(`  [${r.Category}] ${r.SubCategory}`))
