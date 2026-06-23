import { getBQ } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()

// Check date range in each blinkit table
for (const tbl of ['Partnerbizz_Sales_report', 'fact_blinkit_sales_report', 'partnerbizz_reports_v2.sales']) {
  const dataset = tbl.includes('.') ? 'frido-429506' : 'frido-429506.production'
  const full = tbl.includes('.') ? `frido-429506.${tbl}` : `frido-429506.production.${tbl}`
  const [rows] = await bq.query({ query: `SELECT MIN(date) AS min_date, MAX(date) AS max_date, COUNT(*) AS total_rows FROM \`${full}\`` }).catch(e => [[{ min_date: 'ERR: '+e.message.slice(0,60) }]])
  console.log(`\n${tbl}:`)
  console.log(' min:', rows[0].min_date, '| max:', rows[0].max_date, '| rows:', rows[0].total_rows)
}
