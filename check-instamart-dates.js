import { getBQ } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()

const [r1] = await bq.query({ query: `
  SELECT MAX(DATE(ordered_date)) AS max_date, MIN(DATE(ordered_date)) AS min_date, COUNT(1) AS cnt
  FROM \`frido-429506.production.fact_instamart_sales_report\`
` })
console.log('fact_instamart_sales_report:', r1[0])

const [r2] = await bq.query({ query: `
  SELECT MAX(DATE(ordered_date)) AS max_date, MIN(DATE(ordered_date)) AS min_date, COUNT(1) AS cnt
  FROM \`frido-429506.production.stg_instamart_reports__sales\`
` }).catch(e => { console.log('stg_instamart_reports__sales error:', e.message); return [[]] })
if (r2.length) console.log('stg_instamart_reports__sales:', r2[0])

const [r3] = await bq.query({ query: `
  SELECT MAX(DATE(ordered_date)) AS max_date, MIN(DATE(ordered_date)) AS min_date, COUNT(1) AS cnt
  FROM \`frido-429506.production.stg_instamart_sales_report__v2\`
` }).catch(e => { console.log('stg_instamart_sales_report__v2 error:', e.message); return [[]] })
if (r3.length) console.log('stg_instamart_sales_report__v2:', r3[0])

// Also check partnerbizz_reports.sales max date
const [r4] = await bq.query({ query: `
  SELECT MAX(date) AS max_date, MIN(date) AS min_date, COUNT(1) AS cnt
  FROM \`frido-429506.partnerbizz_reports.sales\`
` }).catch(e => { console.log('partnerbizz_reports.sales error:', e.message); return [[]] })
if (r4.length) console.log('partnerbizz_reports.sales:', r4[0])
