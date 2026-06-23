const { BigQuery } = require('@google-cloud/bigquery')
const bq = new BigQuery({ keyFilename: 'c:/Users/PranjalTripati/OneDrive - Arcatron Mobility Pvt Ltd/Desktop/MIS/sa_key.json', projectId: 'frido-429506' })

const s = '2026-06-12', e = '2026-06-18'

async function run() {
  // Query each channel's raw source directly — no unified CTE — to get ground truth
  const queries = {
    Shopify:    `SELECT 'Shopify' AS ch, COUNT(DISTINCT order_name) AS orders, ROUND(SUM(CAST(final_total_incl_tax AS FLOAT64)),0) AS gross, ROUND(SUM(CAST(selling_price_excl_shipping_tax AS FLOAT64)),0) AS net, ROUND(SUM(CAST(qty AS FLOAT64)),0) AS units FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist BETWEEN '${s}' AND '${e}'`.replace('${s}',s).replace('${e}',e),
    AmazonSC:   `SELECT 'Amazon SC' AS ch, COUNT(DISTINCT amazon_order_id) AS orders, ROUND(SUM(CAST(item_price AS FLOAT64)),0) AS gross, 0 AS net, ROUND(SUM(CAST(quantity AS FLOAT64)),0) AS units FROM \`frido-429506.production.amazon_seller_central_all_orders\` WHERE purchase_date_ist BETWEEN '${s}' AND '${e}' AND item_status != 'Cancelled'`.replace('${s}',s).replace('${e}',e),
    Flipkart:   `SELECT 'Flipkart' AS ch, COUNT(DISTINCT order_id) AS orders, ROUND(SUM(CAST(price_after_discount_price_before_discount_total_discountx AS FLOAT64)),0) AS gross, ROUND(SUM(CAST(taxable_value_final_invoice_amount_taxesx AS FLOAT64)),0) AS net, ROUND(SUM(CAST(item_quantity AS FLOAT64)),0) AS units FROM \`frido-429506.flipkart_reports.sales_report\` WHERE DATE(SUBSTR(order_date,1,10)) BETWEEN '${s}' AND '${e}'`.replace('${s}',s).replace('${e}',e),
    Myntra:     `SELECT 'Myntra' AS ch, COUNT(DISTINCT store_order_id) AS orders, ROUND(SUM(CAST(final_amount AS FLOAT64)),0) AS gross, ROUND(SUM(CAST(seller_price AS FLOAT64)),0) AS net, COUNT(*) AS units FROM \`frido-429506.production.fact_myntra_orders_report\` WHERE created_on BETWEEN '${s}' AND '${e}'`.replace('${s}',s).replace('${e}',e),
    Blinkit:    `SELECT 'Blinkit' AS ch, COUNT(*) AS orders, ROUND(SUM(SAFE_DIVIDE(CAST(mrp AS FLOAT64),CAST(qty_sold AS FLOAT64))*CAST(qty_sold AS FLOAT64)),0) AS gross, 0 AS net, ROUND(SUM(CAST(qty_sold AS FLOAT64)),0) AS units FROM \`frido-429506.partnerbizz_reports_v2.sales\` WHERE DATE(date) BETWEEN '${s}' AND '${e}'`.replace('${s}',s).replace('${e}',e),
    Zepto:      `SELECT 'Zepto' AS ch, COUNT(*) AS orders, ROUND(SUM(CAST(gross_merchandise_value AS FLOAT64)),0) AS gross, 0 AS net, ROUND(SUM(CAST(sales_qty_units AS FLOAT64)),0) AS units FROM \`frido-429506.production.zepto_sales_report\` WHERE date BETWEEN '${s}' AND '${e}'`.replace('${s}',s).replace('${e}',e),
    Instamart:  `SELECT 'Instamart' AS ch, COUNT(*) AS orders, ROUND(SUM(CAST(gmv AS FLOAT64)),0) AS gross, 0 AS net, ROUND(SUM(CAST(units_sold AS FLOAT64)),0) AS units FROM \`frido-429506.production.fact_instamart_sales_report\` WHERE DATE(ordered_date) BETWEEN '${s}' AND '${e}'`.replace('${s}',s).replace('${e}',e),
  }

  const results = await Promise.all(Object.values(queries).map(q => bq.query({ query: q }).then(([r]) => r[0])))

  let tG = 0, tN = 0, tU = 0
  console.log('\nChannel-by-channel ground truth (raw tables):')
  console.log('Channel'.padEnd(12), 'Gross Rev'.padStart(14), 'Net Rev'.padStart(14), 'Units'.padStart(8), 'Orders'.padStart(8))
  console.log('-'.repeat(58))
  results.forEach(r => {
    tG += parseFloat(r.gross||0); tN += parseFloat(r.net||0); tU += parseFloat(r.units||0)
    console.log((r.ch||'').padEnd(12), String(Math.round(r.gross)).padStart(14), String(Math.round(r.net||0)).padStart(14), String(Math.round(r.units)).padStart(8), String(r.orders).padStart(8))
  })
  console.log('-'.repeat(58))
  console.log('SUM'.padEnd(12), String(Math.round(tG)).padStart(14), String(Math.round(tN)).padStart(14), String(Math.round(tU)).padStart(8))
  console.log('\nAll Channels KPI (from dashboard screenshot):')
  console.log('Gross: 125,900,000 (~₹12.59 Cr)  Net: 111,800,000 (~₹11.18 Cr)  Units: 88,586')
}

run().catch(console.error)
