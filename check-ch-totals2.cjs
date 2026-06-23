const { BigQuery } = require('@google-cloud/bigquery')
const bq = new BigQuery({ keyFilename: 'c:/Users/PranjalTripati/OneDrive - Arcatron Mobility Pvt Ltd/Desktop/MIS/sa_key.json', projectId: 'frido-429506' })
const s = '2026-06-12', e = '2026-06-18'

async function run() {
  const queries = {
    'Shopify India':    `SELECT ROUND(SUM(CAST(final_total_incl_tax AS FLOAT64)),0) AS gross, ROUND(SUM(CAST(selling_price_excl_shipping_tax AS FLOAT64)),0) AS net, ROUND(SUM(CAST(qty AS FLOAT64)),0) AS units FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist BETWEEN '${s}' AND '${e}'`,
    'Shopify B2B':      `SELECT ROUND(SUM(CAST(final_total_incl_tax AS FLOAT64)),0) AS gross, ROUND(SUM(CAST(selling_price_excl_shipping_tax AS FLOAT64)),0) AS net, ROUND(SUM(CAST(qty AS FLOAT64)),0) AS units FROM \`frido-429506.production.fact_shopify_b2b_orders\` WHERE order_date BETWEEN '${s}' AND '${e}'`,
    'Shopify Intl':     `SELECT ROUND(SUM(CAST(final_total_incl_tax AS FLOAT64)),0) AS gross, ROUND(SUM(CAST(selling_price_excl_shipping_tax AS FLOAT64)),0) AS net, ROUND(SUM(CAST(qty AS FLOAT64)),0) AS units FROM \`frido-429506.production.fact_shopify_international_orders\` WHERE order_date BETWEEN '${s}' AND '${e}'`,
    'Amazon SC':        `SELECT ROUND(SUM(CAST(item_price AS FLOAT64)),0) AS gross, 0 AS net, ROUND(SUM(CAST(quantity AS FLOAT64)),0) AS units FROM \`frido-429506.production.amazon_seller_central_all_orders\` WHERE purchase_date_ist BETWEEN '${s}' AND '${e}' AND item_status != 'Cancelled'`,
    'Amazon VC':        `SELECT ROUND(SUM(CAST(ordered_revenue AS FLOAT64)),0) AS gross, 0 AS net, ROUND(SUM(CAST(orderedUnits AS FLOAT64)),0) AS units FROM \`frido-429506.production.Amazon_Vendor_Central_sales_DateASIN_wise\` WHERE sales_date BETWEEN '${s}' AND '${e}'`,
    'Amazon Intl':      `SELECT ROUND(SUM(CAST(item_price AS FLOAT64)),0) AS gross, 0 AS net, ROUND(SUM(CAST(quantity AS FLOAT64)),0) AS units FROM \`frido-429506.production.amazon_seller_central_uk_uae_all_orders\` WHERE purchase_date_ist BETWEEN '${s}' AND '${e}' AND item_status != 'Cancelled'`,
    'Flipkart':         `SELECT ROUND(SUM(CAST(price_after_discount_price_before_discount_total_discountx AS FLOAT64)),0) AS gross, ROUND(SUM(CAST(taxable_value_final_invoice_amount_taxesx AS FLOAT64)),0) AS net, ROUND(SUM(CAST(item_quantity AS FLOAT64)),0) AS units FROM \`frido-429506.flipkart_reports.sales_report\` WHERE DATE(SUBSTR(order_date,1,10)) BETWEEN '${s}' AND '${e}'`,
    'Myntra':           `SELECT ROUND(SUM(CAST(final_amount AS FLOAT64)),0) AS gross, ROUND(SUM(CAST(seller_price AS FLOAT64)),0) AS net, COUNT(*) AS units FROM \`frido-429506.production.fact_myntra_orders_report\` WHERE created_on BETWEEN '${s}' AND '${e}'`,
    'CRED/FC/PE':       `SELECT ROUND(SUM(CAST(COALESCE(NULLIF(TRIM(CAST(SellingPrice AS STRING)),''), NULLIF(TRIM(SellingPrice_st),''), '0') AS FLOAT64)),0) AS gross, ROUND(SUM(CAST(Subtotal AS FLOAT64)),0) AS net, COUNT(*) AS units FROM \`frido-429506.production.Unicommerce_Sale_Orders_Report\` WHERE DATE(OrderDateasddmmyyyyhhMMss) BETWEEN '${s}' AND '${e}' AND SaleOrderStatus != 'CANCELLED' AND (LOWER(TRIM(ChannelName)) LIKE 'cred%' OR LOWER(TRIM(ChannelName)) LIKE 'firstcry%' OR LOWER(TRIM(ChannelName)) LIKE 'pharmeasy%')`,
    'Blinkit':          `SELECT ROUND(SUM(CAST(mrp AS FLOAT64)),0) AS gross, 0 AS net, ROUND(SUM(CAST(qty_sold AS FLOAT64)),0) AS units FROM \`frido-429506.partnerbizz_reports_v2.sales\` WHERE DATE(date) BETWEEN '${s}' AND '${e}'`,
    'Zepto':            `SELECT ROUND(SUM(CAST(gross_merchandise_value AS FLOAT64)),0) AS gross, 0 AS net, ROUND(SUM(CAST(sales_qty_units AS FLOAT64)),0) AS units FROM \`frido-429506.production.zepto_sales_report\` WHERE date BETWEEN '${s}' AND '${e}'`,
    'Instamart':        `SELECT ROUND(SUM(CAST(gmv AS FLOAT64)),0) AS gross, 0 AS net, ROUND(SUM(CAST(units_sold AS FLOAT64)),0) AS units FROM \`frido-429506.production.fact_instamart_sales_report\` WHERE DATE(ordered_date) BETWEEN '${s}' AND '${e}'`,
  }

  const results = await Promise.all(
    Object.entries(queries).map(([ch, q]) => bq.query({ query: q.replace(/\$\{s\}/g, s).replace(/\$\{e\}/g, e) }).then(([r]) => ({ ch, ...r[0] })))
  )

  let tG = 0, tN = 0, tU = 0
  console.log('\nFull channel reconciliation vs All Channels dashboard:')
  console.log('Channel'.padEnd(16), 'Gross Rev'.padStart(14), 'Net Rev'.padStart(14), 'Units'.padStart(8))
  console.log('-'.repeat(55))
  results.forEach(r => {
    tG += parseFloat(r.gross||0); tN += parseFloat(r.net||0); tU += parseFloat(r.units||0)
    console.log(r.ch.padEnd(16), String(Math.round(r.gross||0)).padStart(14), String(Math.round(r.net||0)).padStart(14), String(Math.round(r.units||0)).padStart(8))
  })
  console.log('-'.repeat(55))
  console.log('RAW SUM'.padEnd(16), String(Math.round(tG)).padStart(14), String(Math.round(tN)).padStart(14), String(Math.round(tU)).padStart(8))
  console.log('\nDASHBOARD'.padEnd(16), '125900000'.padStart(14), '111800000'.padStart(14), '88586'.padStart(8))
  console.log('\nDIFF'.padEnd(16), String(Math.round(125900000-tG)).padStart(14), String(Math.round(111800000-tN)).padStart(14), String(Math.round(88586-tU)).padStart(8))
}

run().catch(console.error)
