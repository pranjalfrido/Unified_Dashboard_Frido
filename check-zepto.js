import { getBQ } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()

// Max date
const [r1] = await bq.query({ query: `
  SELECT MAX(date) AS max_date, MIN(date) AS min_date, COUNT(1) AS cnt
  FROM \`frido-429506.production.zepto_sales_report\`
` })
console.log('zepto_sales_report:', r1[0])

// Columns
const [cols] = await bq.query({ query: `
  SELECT column_name, data_type
  FROM \`frido-429506.production\`.INFORMATION_SCHEMA.COLUMNS
  WHERE table_name = 'zepto_sales_report'
  ORDER BY ordinal_position
` })
console.log('Columns:', cols.map(c => `${c.column_name} (${c.data_type})`))

// Sample rows
const [rows] = await bq.query({ query: `
  SELECT * FROM \`frido-429506.production.zepto_sales_report\` LIMIT 3
` })
console.log('Sample:', JSON.stringify(rows[0], null, 2))

// Check for duplicates
const [dupes] = await bq.query({ query: `
  SELECT sku_number, city, date, COUNT(1) AS cnt
  FROM \`frido-429506.production.zepto_sales_report\`
  WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
  GROUP BY sku_number, city, date HAVING cnt > 1
  ORDER BY cnt DESC LIMIT 5
` })
console.log('Duplicates:', dupes.length ? dupes : 'none')

// Day-wise totals recent
const [days] = await bq.query({ query: `
  SELECT date, SUM(CAST(sales_qty_units AS FLOAT64)) AS units
  FROM \`frido-429506.production.zepto_sales_report\`
  WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY)
  GROUP BY date ORDER BY date
` })
console.log('Recent day-wise:', days.map(r => `${r.date?.value||r.date}: ${r.units}`))

// Item master for Zepto
const [im] = await bq.query({ query: `
  SELECT productid, channelproductname, masterskucode, Selling_Price, tax_code
  FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\`
  WHERE TRIM(channelname) = 'Zepto' LIMIT 5
` })
console.log('Zepto Item Master sample:', im)
