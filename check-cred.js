import { getBQ } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()

// Max date
const [r1] = await bq.query({ query: `
  SELECT MAX(DATE(OrderDateasddmmyyyyhhMMss)) AS max_date, MIN(DATE(OrderDateasddmmyyyyhhMMss)) AS min_date, COUNT(1) AS cnt
  FROM \`frido-429506.production.Unicommerce_Sale_Orders_Report\`
  WHERE LOWER(TRIM(ChannelName)) LIKE 'cred%' AND SaleOrderItemStatus != 'CANCELLED'
` })
console.log('CRED date range:', r1[0])

// All columns
const [cols] = await bq.query({ query: `
  SELECT column_name, data_type FROM \`frido-429506.production\`.INFORMATION_SCHEMA.COLUMNS
  WHERE table_name = 'Unicommerce_Sale_Orders_Report' ORDER BY ordinal_position
` })
console.log('Columns:', cols.map(c => `${c.column_name} (${c.data_type})`))

// Sample row
const [rows] = await bq.query({ query: `
  SELECT * FROM \`frido-429506.production.Unicommerce_Sale_Orders_Report\`
  WHERE LOWER(TRIM(ChannelName)) LIKE 'cred%' AND SaleOrderItemStatus != 'CANCELLED'
  LIMIT 1
` })
console.log('Sample:', JSON.stringify(rows[0], null, 2))

// Day-wise recent
const [days] = await bq.query({ query: `
  SELECT DATE(OrderDateasddmmyyyyhhMMss) AS date, COUNT(DISTINCT DisplayOrderCode) AS orders, SUM(1) AS items
  FROM \`frido-429506.production.Unicommerce_Sale_Orders_Report\`
  WHERE LOWER(TRIM(ChannelName)) LIKE 'cred%' AND SaleOrderItemStatus != 'CANCELLED'
    AND DATE(OrderDateasddmmyyyyhhMMss) >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
  GROUP BY date ORDER BY date
` })
console.log('Recent day-wise:', days.map(r => `${r.date?.value||r.date}: ${r.orders} orders`))
