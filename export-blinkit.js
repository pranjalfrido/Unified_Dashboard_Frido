import { buildQuery } from './api/_bq.js'
import { getBQ } from './api/_bq.js'
import * as XLSX from 'xlsx'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { config } from 'dotenv'

config()

const START = '2026-06-10'
const END   = '2026-06-19'

async function run() {
  console.log(`Querying Blinkit data ${START} → ${END} from BigQuery...`)
  const bq = getBQ()
  const base = buildQuery(START, END)
  const sql = `WITH q AS (${base})
SELECT
  CAST(q.OrderDate AS STRING)                        AS Date,
  q.Channel,
  q.SubChannel,
  q.ChannelAccount,
  q.ProductId                                        AS Item_ID,
  q.ChannelSKUCode                                   AS Channel_SKU,
  q.MasterSKU                                        AS Master_SKU,
  q.Category,
  q.SubCategory,
  q.City,
  q.State,
  q.Country,
  ROUND(q.ItemQty, 0)                                AS Units_Sold,
  ROUND(q.SellingPrice_Exc_GST, 2)                   AS Selling_Price_Exc_GST,
  ROUND(q.SellingPrice_Inc_GST, 2)                   AS Selling_Price_Inc_GST,
  q.GST_Tax_Type_Code                                AS GST_Rate_Pct,
  ROUND(q.SellingPrice_Inc_GST - q.SellingPrice_Exc_GST, 2) AS GST_Amount,
  ROUND(q.ItemQty * q.SellingPrice_Exc_GST, 2)       AS Net_Revenue_Exc_GST,
  ROUND(q.ItemQty * q.SellingPrice_Inc_GST, 2)       AS Gross_Revenue_Inc_GST
FROM q
WHERE q.Channel = 'Blinkit'
ORDER BY q.OrderDate, q.ProductId`

  const [rows] = await bq.query({ query: sql, maximumBytesBilled: '10000000000' })
  console.log(`Got ${rows.length} rows`)

  const unwrap = v => (v != null && typeof v === 'object' && v.value !== undefined) ? v.value : v
  const sheetData = rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, unwrap(v)])))

  const ws = XLSX.utils.json_to_sheet(sheetData)

  // Auto column widths
  const cols = Object.keys(sheetData[0] || {})
  ws['!cols'] = cols.map(col => {
    const maxLen = Math.max(col.length, ...sheetData.slice(0, 200).map(r => String(r[col] ?? '').length))
    return { wch: Math.min(maxLen + 2, 40) }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Blinkit Sales')

  const outPath = join('C:\\Users\\PranjalTripati\\OneDrive - Arcatron Mobility Pvt Ltd\\Desktop\\MIS', `Blinkit_${START}_to_${END}.xlsx`)
  writeFileSync(outPath, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  console.log(`✅ Saved to: ${outPath}`)
}

run().catch(e => { console.error('❌', e.message); process.exit(1) })
