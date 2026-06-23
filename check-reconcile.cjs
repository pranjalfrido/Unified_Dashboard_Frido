const { BigQuery } = require('@google-cloud/bigquery')
const bq = new BigQuery({ keyFilename: 'c:/Users/PranjalTripati/OneDrive - Arcatron Mobility Pvt Ltd/Desktop/MIS/sa_key.json', projectId: 'frido-429506' })

// Use last 7 days (same as dashboard default)
const end = new Date(); end.setDate(end.getDate() - 1)
const start = new Date(); start.setDate(end.getDate() - 6)
const s = start.toISOString().slice(0, 10)
const e = end.toISOString().slice(0, 10)

console.log(`\nDate range: ${s} → ${e}`)

async function run() {
  // Query 1: unified CTE total and by channel (same as dashboard)
  const unifiedQ = `
    WITH q AS (
      SELECT 'Shopify' AS Channel, CAST(final_total_incl_tax AS FLOAT64) AS inc, CAST(selling_price_excl_shipping_tax AS FLOAT64) AS exc, CAST(qty AS FLOAT64) AS units FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist BETWEEN '${s}' AND '${e}'
      UNION ALL SELECT 'Shopify', CAST(final_total_incl_tax AS FLOAT64), CAST(selling_price_excl_shipping_tax AS FLOAT64), CAST(qty AS FLOAT64) FROM \`frido-429506.production.fact_shopify_b2b_orders\` WHERE order_date BETWEEN '${s}' AND '${e}'
      UNION ALL SELECT 'Amazon SC', CAST(item_price AS FLOAT64), CAST(item_price AS FLOAT64) - CAST(item_tax AS FLOAT64), CAST(quantity AS FLOAT64) FROM \`frido-429506.production.amazon_seller_central_all_orders\` WHERE purchase_date_ist BETWEEN '${s}' AND '${e}' AND item_status != 'Cancelled'
      UNION ALL SELECT 'Amazon VC', CAST(ordered_revenue AS FLOAT64), NULL, CAST(orderedUnits AS FLOAT64) FROM \`frido-429506.production.Amazon_Vendor_Central_sales_DateASIN_wise\` WHERE sales_date BETWEEN '${s}' AND '${e}'
      UNION ALL SELECT 'Flipkart', CAST(price_after_discount_price_before_discount_total_discountx AS FLOAT64), CAST(taxable_value_final_invoice_amount_taxesx AS FLOAT64), CAST(item_quantity AS FLOAT64) FROM \`frido-429506.flipkart_reports.sales_report\` WHERE DATE(SUBSTR(order_date,1,10)) BETWEEN '${s}' AND '${e}'
      UNION ALL SELECT 'Myntra', CAST(final_amount AS FLOAT64), CAST(seller_price AS FLOAT64), 1 FROM \`frido-429506.production.fact_myntra_orders_report\` WHERE created_on BETWEEN '${s}' AND '${e}'
      UNION ALL SELECT 'CRED/FC/PE', CAST(COALESCE(NULLIF(TRIM(CAST(SellingPrice AS STRING)),''), NULLIF(TRIM(SellingPrice_st),''), '0') AS FLOAT64), CAST(Subtotal AS FLOAT64), 1 FROM \`frido-429506.production.Unicommerce_Sale_Orders_Report\` WHERE DATE(OrderDateasddmmyyyyhhMMss) BETWEEN '${s}' AND '${e}' AND SaleOrderStatus != 'CANCELLED' AND (LOWER(TRIM(ChannelName)) LIKE 'cred%' OR LOWER(TRIM(ChannelName)) LIKE 'firstcry%' OR LOWER(TRIM(ChannelName)) LIKE 'pharmeasy%')
      UNION ALL SELECT 'Blinkit', SAFE_DIVIDE(CAST(mrp AS FLOAT64), CAST(qty_sold AS FLOAT64)), NULL, CAST(qty_sold AS FLOAT64) FROM \`frido-429506.partnerbizz_reports_v2.sales\` WHERE DATE(date) BETWEEN '${s}' AND '${e}'
      UNION ALL SELECT 'Zepto', CAST(gross_merchandise_value AS FLOAT64), NULL, CAST(sales_qty_units AS FLOAT64) FROM \`frido-429506.production.zepto_sales_report\` WHERE date BETWEEN '${s}' AND '${e}'
      UNION ALL SELECT 'Instamart', CAST(gmv AS FLOAT64), NULL, CAST(units_sold AS FLOAT64) FROM \`frido-429506.production.fact_instamart_sales_report\` WHERE DATE(ordered_date) BETWEEN '${s}' AND '${e}'
    )
    SELECT Channel, ROUND(SUM(inc),0) AS gross, ROUND(SUM(exc),0) AS net, ROUND(SUM(units),0) AS units
    FROM q GROUP BY Channel ORDER BY gross DESC
  `

  const [rows] = await bq.query({ query: unifiedQ })

  let tG = 0, tN = 0, tU = 0
  console.log('\n' + 'Channel'.padEnd(14) + 'Gross Rev'.padStart(14) + 'Net Rev'.padStart(14) + 'Units'.padStart(8))
  console.log('-'.repeat(52))
  rows.forEach(r => {
    tG += parseFloat(r.gross || 0)
    tN += parseFloat(r.net || 0)
    tU += parseFloat(r.units || 0)
    console.log(r.Channel.padEnd(14) + String(Math.round(r.gross||0)).padStart(14) + String(Math.round(r.net||0)).padStart(14) + String(Math.round(r.units||0)).padStart(8))
  })
  console.log('-'.repeat(52))
  console.log('TOTAL (raw)'.padEnd(14) + String(Math.round(tG)).padStart(14) + String(Math.round(tN)).padStart(14) + String(Math.round(tU)).padStart(8))
  console.log('\n⚠️  Net Rev shows 0 for channels where exc GST is not in source (Amazon VC, Blinkit, Zepto, Instamart)')
  console.log('   Dashboard net uses price master lookup tables for those channels.')
  console.log('\nNow check the dashboard All Channels tab for the same date range and compare Gross Rev total.')
}

run().catch(console.error)
