import { BigQuery } from '@google-cloud/bigquery'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const bq = new BigQuery({ keyFilename: join(__dirname, '../../sa_key.json'), projectId: 'frido-429506' })

const [rows] = await bq.query(`
  SELECT DISTINCT Category_Name
  FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
  WHERE Category_Name IS NOT NULL AND TRIM(Category_Name) != ''
  ORDER BY Category_Name
`)
console.log('Valid categories in Item Master:')
rows.forEach(r => console.log(`  ${r.Category_Name}`))
