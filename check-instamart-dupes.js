import { getBQ } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()

// Look at the actual duplicate rows to understand structure
const [rows] = await bq.query({ query: `
  SELECT ordered_date, city, area_name, store_id, item_code, units_sold, gmv
  FROM \`frido-429506.production.fact_instamart_sales_report\`
  WHERE DATE(ordered_date) = '2026-06-12' AND item_code = '970717' AND city = 'Bangalore'
  ORDER BY ordered_date, store_id
` })
console.log('Duplicate rows for 970717 Bangalore 2026-06-12:')
rows.forEach(r => console.log(` store_id=${r.store_id} area=${r.area_name} units=${r.units_sold} gmv=${r.gmv}`))
