import { BigQuery } from '@google-cloud/bigquery'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

let bq
export function getBQ() {
  if (!bq) {
    if (process.env.GCP_SA_KEY) {
      const keyPath = join(tmpdir(), 'sa_key.json')
      writeFileSync(keyPath, process.env.GCP_SA_KEY)
      bq = new BigQuery({ keyFilename: keyPath, projectId: 'frido-429506' })
    } else {
      // local dev — sa_key.json sits at project root (one level up from api/)
      bq = new BigQuery({ keyFilename: join(dirname(fileURLToPath(import.meta.url)), '..', 'sa_key.json'), projectId: 'frido-429506' })
    }
  }
  return bq
}

export function buildQuery(s, e, filters = {}) {
  const { category, subCategory, state, sku, subChannel, voucher } = filters
  const whereClauses = []
  if (category) whereClauses.push(`COALESCE(im.Category, 'Frido') = '${category.replace(/'/g, "''")}'`)
  if (subCategory) whereClauses.push(`COALESCE(im.SubCategory, 'Frido') = '${subCategory.replace(/'/g, "''")}'`)
  if (state) whereClauses.push(`UPPER(TRIM(u.State)) = '${state.toUpperCase().replace(/'/g, "''")}'`)
  if (sku) whereClauses.push(`UPPER(TRIM(u.ChannelSKUCode)) LIKE '%${sku.toUpperCase().replace(/'/g, "''").replace(/%/g, '\\%')}%'`)
  if (subChannel) whereClauses.push(`u.SubChannel = '${subChannel.replace(/'/g, "''")}'`)
  if (voucher) {
    const codes = voucher.split(',').map(v => v.trim()).filter(Boolean)
    if (codes.length > 0) {
      const inList = codes.map(c => `'${c.replace(/'/g, "''")}'`).join(', ')
      whereClauses.push(`TRIM(u.voucher_code) IN (${inList})`)
    }
  }
  const whereClause = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')} ` : ''
  return `WITH
sku_mapping AS (SELECT DISTINCT TRIM(productid) AS productid, TRIM(masterskucode) AS masterskucode FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` WHERE TRIM(masterskucode) NOT IN ('', 'not found')),
price_amazon AS (SELECT DISTINCT TRIM(productid) AS productid, SAFE_CAST(TRIM(REGEXP_REPLACE(Selling_Price, r'[^\\x20-\\x7E]', '')) AS FLOAT64) AS selling_price FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` WHERE TRIM(channelname) = 'Amazon'),
price_blinkit AS (SELECT DISTINCT TRIM(productid) AS productid, SAFE_CAST(TRIM(REGEXP_REPLACE(Selling_Price, r'[^\\x20-\\x7E]', '')) AS FLOAT64) AS selling_price FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` WHERE TRIM(channelname) = 'Blinkit'),
price_zepto AS (SELECT DISTINCT TRIM(productid) AS productid, SAFE_CAST(TRIM(REGEXP_REPLACE(Selling_Price, r'[^\\x20-\\x7E]', '')) AS FLOAT64) AS selling_price FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` WHERE TRIM(channelname) = 'Zepto'),
price_instamart AS (SELECT DISTINCT TRIM(productid) AS productid, SAFE_CAST(TRIM(REGEXP_REPLACE(Selling_Price, r'[^\\x20-\\x7E]', '')) AS FLOAT64) AS selling_price FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` WHERE TRIM(channelname) = 'Instamart'),
item_master AS (SELECT DISTINCT TRIM(Product_Code) AS Product_Code, TRIM(Category_Name) AS Category, TRIM(Sub_category) AS SubCategory, TRIM(GST_Tax_Type_Code) AS GST_Tax_Type_Code FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\` WHERE TRIM(Product_Code) != ''),
shopify_india AS (SELECT 'India' AS Country, order_name AS OrderId, 'Shopify' AS Channel, CASE WHEN source_name='Retail Store' THEN 'Retail Store' WHEN order_name LIKE '#MF%' THEN 'MyFrido' WHEN order_name LIKE '#FM%' THEN 'Mobility' ELSE source_name END AS SubChannel, CASE WHEN source_name='Retail Store' THEN 'Retail' WHEN order_name LIKE '#MF%' THEN 'MyFrido' WHEN order_name LIKE '#FM%' THEN 'Mobility' ELSE 'B2B' END AS ChannelAccount, order_date_ist AS OrderDate, shipping_state AS State, shipping_city AS City, shipping_pincode AS Pincode, sku AS ProductId, sku AS ChannelSKUCode, CAST(qty AS FLOAT64) AS ItemQty, CAST(final_total_incl_tax AS FLOAT64) AS SellingPrice_Inc_GST, CAST(selling_price_excl_shipping_tax AS FLOAT64) AS SellingPrice_Exc_GST, fulfillment_tracking_url AS OrderTrackingStatus, order_fulfillment_status AS FulfilmentStatus, financial_status AS FinancialStatus, CAST(item_gst_tax AS FLOAT64) AS Tax, CAST(NULL AS STRING) AS fulfillment_channel, CAST(is_refunded_line AS STRING) AS RefundStatus, gateway AS PaymentMode, customer_id AS CustomerId, voucher_code AS voucher_code FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist BETWEEN '${s}' AND '${e}'),
shopify_b2b AS (SELECT 'India' AS Country, order_name AS OrderId, 'Shopify' AS Channel, 'Shopify B2B' AS SubChannel, 'Shopify B2B' AS ChannelAccount, order_date AS OrderDate, shipping_state AS State, shipping_city AS City, shipping_pincode AS Pincode, sku AS ProductId, sku AS ChannelSKUCode, CAST(qty AS FLOAT64) AS ItemQty, CAST(final_total_incl_tax AS FLOAT64) AS SellingPrice_Inc_GST, CAST(selling_price_excl_shipping_tax AS FLOAT64) AS SellingPrice_Exc_GST, fulfillment_tracking_url AS OrderTrackingStatus, line_fulfillment_status AS FulfilmentStatus, financial_status AS FinancialStatus, CAST(item_gst_tax AS FLOAT64) AS Tax, CAST(NULL AS STRING) AS fulfillment_channel, CAST(is_refunded_line AS STRING) AS RefundStatus, gateway AS PaymentMode, customer_id AS CustomerId, voucher_code AS voucher_code FROM \`frido-429506.production.fact_shopify_b2b_orders\` WHERE order_date BETWEEN '${s}' AND '${e}'),
shopify_international AS (SELECT 'International' AS Country, order_name AS OrderId, 'Shopify' AS Channel, CAST(NULL AS STRING) AS SubChannel, CASE WHEN currency='AED' THEN 'UAE' WHEN currency='GBP' THEN 'UK' WHEN currency='USD' THEN 'US' ELSE currency END AS ChannelAccount, order_date AS OrderDate, shipping_state AS State, shipping_city AS City, shipping_pincode AS Pincode, sku AS ProductId, sku AS ChannelSKUCode, CAST(qty AS FLOAT64) AS ItemQty, CAST(final_total_incl_tax AS FLOAT64) AS SellingPrice_Inc_GST, CAST(selling_price_excl_shipping_tax AS FLOAT64) AS SellingPrice_Exc_GST, fulfillment_tracking_url AS OrderTrackingStatus, order_fulfillment_status AS FulfilmentStatus, financial_status AS FinancialStatus, CAST(item_gst_tax AS FLOAT64) AS Tax, CAST(NULL AS STRING) AS fulfillment_channel, CAST(is_refunded_line AS STRING) AS RefundStatus, gateway AS PaymentMode, customer_id AS CustomerId, voucher_code AS voucher_code FROM \`frido-429506.production.fact_shopify_international_orders\` WHERE order_date BETWEEN '${s}' AND '${e}'),
amazon_seller_central AS (SELECT 'India' AS Country, amazon_order_id AS OrderId, 'Amazon' AS Channel, 'Amazon Seller Central' AS SubChannel, 'Seller Central' AS ChannelAccount, purchase_date_ist AS OrderDate, ship_state AS State, ship_city AS City, ship_postal_code AS Pincode, asin AS ProductId, sku AS ChannelSKUCode, CAST(quantity AS FLOAT64) AS ItemQty, CAST(item_price AS FLOAT64) AS SellingPrice_Inc_GST, CAST(NULL AS FLOAT64) AS SellingPrice_Exc_GST, CAST(NULL AS STRING) AS OrderTrackingStatus, item_status AS FulfilmentStatus, order_status AS FinancialStatus, CAST(item_tax AS FLOAT64) AS Tax, fulfillment_channel AS fulfillment_channel, CAST(NULL AS STRING) AS RefundStatus, CAST(NULL AS STRING) AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, promotion_ids AS voucher_code FROM \`frido-429506.production.amazon_seller_central_all_orders\` WHERE purchase_date_ist BETWEEN '${s}' AND '${e}'),
amazon_vendor_central AS (SELECT 'India' AS Country, CONCAT('AVC', LPAD(CAST(ROW_NUMBER() OVER (ORDER BY sales_date, asin) AS STRING), 6, '0')) AS OrderId, 'Amazon' AS Channel, 'Amazon Vendor Central' AS SubChannel, vendor_account AS ChannelAccount, sales_date AS OrderDate, CAST(NULL AS STRING) AS State, CAST(NULL AS STRING) AS City, CAST(NULL AS STRING) AS Pincode, asin AS ProductId, CAST(NULL AS STRING) AS ChannelSKUCode, CAST(orderedUnits AS FLOAT64) AS ItemQty, CAST(ordered_revenue AS FLOAT64) AS SellingPrice_Inc_GST, CAST(pa.selling_price AS FLOAT64) AS SellingPrice_Exc_GST, CAST(NULL AS STRING) AS OrderTrackingStatus, CAST(NULL AS STRING) AS FulfilmentStatus, CAST(NULL AS STRING) AS FinancialStatus, CAST(NULL AS FLOAT64) AS Tax, CAST(NULL AS STRING) AS fulfillment_channel, CAST(NULL AS STRING) AS RefundStatus, CAST(NULL AS STRING) AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, CAST(NULL AS STRING) AS voucher_code FROM \`frido-429506.production.Amazon_Vendor_Central_sales_DateASIN_wise\` LEFT JOIN price_amazon pa ON TRIM(asin) = pa.productid WHERE sales_date BETWEEN '${s}' AND '${e}'),
amazon_international AS (SELECT Country AS Country, amazon_order_id AS OrderId, 'Amazon' AS Channel, 'Amazon International' AS SubChannel, CASE WHEN UPPER(Country)='UK' THEN 'Amazon SC UK' WHEN UPPER(Country)='UAE' THEN 'Amazon SC UAE' ELSE Country END AS ChannelAccount, purchase_date_ist AS OrderDate, ship_state AS State, ship_city AS City, ship_postal_code AS Pincode, asin AS ProductId, sku AS ChannelSKUCode, CAST(quantity AS FLOAT64) AS ItemQty, CAST(item_price AS FLOAT64) AS SellingPrice_Inc_GST, CAST(NULL AS FLOAT64) AS SellingPrice_Exc_GST, CAST(NULL AS STRING) AS OrderTrackingStatus, item_status AS FulfilmentStatus, order_status AS FinancialStatus, CAST(item_tax AS FLOAT64) AS Tax, fulfillment_channel AS fulfillment_channel, CAST(NULL AS STRING) AS RefundStatus, CAST(NULL AS STRING) AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, promotion_ids AS voucher_code FROM \`frido-429506.production.amazon_seller_central_uk_uae_all_orders\` WHERE purchase_date_ist BETWEEN '${s}' AND '${e}'),
flipkart AS (SELECT 'India' AS Country, order_id AS OrderId, 'Flipkart' AS Channel, CASE WHEN UPPER(TRIM(fulfilment_type))='FBF' THEN 'Flipkart FBF' ELSE 'Flipkart NON-FBF' END AS SubChannel, 'Flipkart' AS ChannelAccount, DATE(SUBSTR(order_date,1,10)) AS OrderDate, customer_s_delivery_state AS State, CAST(NULL AS STRING) AS City, customer_s_delivery_pincode AS Pincode, TRIM(REPLACE(fsn,'"','')) AS ProductId, TRIM(REPLACE(REGEXP_REPLACE(sku,r'"{2,}SKU:-*"{0,}',''),'"','')) AS ChannelSKUCode, CAST(item_quantity AS FLOAT64) AS ItemQty, CAST(price_after_discount_price_before_discount_total_discountx AS FLOAT64) AS SellingPrice_Inc_GST, CAST(taxable_value_final_invoice_amount_taxesx AS FLOAT64) AS SellingPrice_Exc_GST, CAST(NULL AS STRING) AS OrderTrackingStatus, event_sub_type AS FulfilmentStatus, order_type AS FinancialStatus, CAST(igst_amount AS FLOAT64) AS Tax, fulfilment_type AS fulfillment_channel, event_type AS RefundStatus, CAST(NULL AS STRING) AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, CAST(NULL AS STRING) AS voucher_code FROM \`frido-429506.test_flipkart_dataset.sales_report\` WHERE DATE(SUBSTR(order_date,1,10)) BETWEEN '${s}' AND '${e}'),
myntra AS (SELECT 'India' AS Country, store_order_id AS OrderId, 'Myntra' AS Channel, 'Myntra' AS SubChannel, 'Myntra' AS ChannelAccount, created_on AS OrderDate, state AS State, city AS City, zipcode AS Pincode, myntra_sku_code AS ProductId, seller_sku_code AS ChannelSKUCode, CAST(1 AS FLOAT64) AS ItemQty, CAST(final_amount AS FLOAT64) AS SellingPrice_Inc_GST, CAST(seller_price AS FLOAT64) AS SellingPrice_Exc_GST, order_tracking_number AS OrderTrackingStatus, order_status AS FulfilmentStatus, order_status AS FinancialStatus, CAST(tax_recovery AS FLOAT64) AS Tax, courier_code AS fulfillment_channel, CAST(return_creation_date AS STRING) AS RefundStatus, CAST(NULL AS STRING) AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, CAST(NULL AS STRING) AS voucher_code FROM \`frido-429506.production.fact_myntra_orders_report\` WHERE created_on BETWEEN '${s}' AND '${e}'),
cred AS (SELECT 'India' AS Country, DisplayOrderCode AS OrderId, 'CRED' AS Channel, 'CRED' AS SubChannel, ChannelName AS ChannelAccount, DATE(OrderDateasddmmyyyyhhMMss) AS OrderDate, ShippingAddressState AS State, ShippingAddressCity AS City, CAST(ShippingAddressPincode_in AS STRING) AS Pincode, ItemSKUCode AS ProductId, ItemSKUCode AS ChannelSKUCode, CAST(1 AS FLOAT64) AS ItemQty, CAST(COALESCE(NULLIF(TRIM(CAST(SellingPrice AS STRING)),''), NULLIF(TRIM(SellingPrice_st),''), '0') AS FLOAT64) AS SellingPrice_Inc_GST, CAST(Subtotal AS FLOAT64) AS SellingPrice_Exc_GST, TrackingNumber AS OrderTrackingStatus, ShippingPackageStatusCode AS FulfilmentStatus, SaleOrderStatus AS FinancialStatus, CAST(Tax AS FLOAT64) AS Tax, ShippingCourier AS fulfillment_channel, ReturnDate AS RefundStatus, PaymentInstrument AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, VoucherCode AS voucher_code FROM \`frido-429506.production.Unicommerce_Sale_Orders_Report\` WHERE DATE(OrderDateasddmmyyyyhhMMss) BETWEEN '${s}' AND '${e}' AND LOWER(TRIM(ChannelName)) LIKE 'cred%' AND SaleOrderStatus != 'CANCELLED'),
firstcry AS (SELECT 'India' AS Country, DisplayOrderCode AS OrderId, 'Firstcry' AS Channel, 'Firstcry' AS SubChannel, ChannelName AS ChannelAccount, DATE(OrderDateasddmmyyyyhhMMss) AS OrderDate, ShippingAddressState AS State, ShippingAddressCity AS City, CAST(ShippingAddressPincode_in AS STRING) AS Pincode, ItemSKUCode AS ProductId, ItemSKUCode AS ChannelSKUCode, CAST(1 AS FLOAT64) AS ItemQty, CAST(COALESCE(NULLIF(TRIM(CAST(SellingPrice AS STRING)),''), NULLIF(TRIM(SellingPrice_st),''), '0') AS FLOAT64) AS SellingPrice_Inc_GST, CAST(Subtotal AS FLOAT64) AS SellingPrice_Exc_GST, TrackingNumber AS OrderTrackingStatus, ShippingPackageStatusCode AS FulfilmentStatus, SaleOrderStatus AS FinancialStatus, CAST(Tax AS FLOAT64) AS Tax, ShippingCourier AS fulfillment_channel, ReturnDate AS RefundStatus, PaymentInstrument AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, VoucherCode AS voucher_code FROM \`frido-429506.production.Unicommerce_Sale_Orders_Report\` WHERE DATE(OrderDateasddmmyyyyhhMMss) BETWEEN '${s}' AND '${e}' AND LOWER(TRIM(ChannelName)) LIKE 'firstcry%' AND SaleOrderStatus != 'CANCELLED'),
pharmeasy AS (SELECT 'India' AS Country, DisplayOrderCode AS OrderId, 'Pharmeasy' AS Channel, 'Pharmeasy' AS SubChannel, ChannelName AS ChannelAccount, DATE(OrderDateasddmmyyyyhhMMss) AS OrderDate, ShippingAddressState AS State, ShippingAddressCity AS City, CAST(ShippingAddressPincode_in AS STRING) AS Pincode, ItemSKUCode AS ProductId, ItemSKUCode AS ChannelSKUCode, CAST(1 AS FLOAT64) AS ItemQty, CAST(COALESCE(NULLIF(TRIM(CAST(SellingPrice AS STRING)),''), NULLIF(TRIM(SellingPrice_st),''), '0') AS FLOAT64) AS SellingPrice_Inc_GST, CAST(Subtotal AS FLOAT64) AS SellingPrice_Exc_GST, TrackingNumber AS OrderTrackingStatus, ShippingPackageStatusCode AS FulfilmentStatus, SaleOrderStatus AS FinancialStatus, CAST(Tax AS FLOAT64) AS Tax, ShippingCourier AS fulfillment_channel, ReturnDate AS RefundStatus, PaymentInstrument AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, VoucherCode AS voucher_code FROM \`frido-429506.production.Unicommerce_Sale_Orders_Report\` WHERE DATE(OrderDateasddmmyyyyhhMMss) BETWEEN '${s}' AND '${e}' AND LOWER(TRIM(ChannelName)) LIKE 'pharmeasy%' AND SaleOrderStatus != 'CANCELLED'),
blinkit AS (SELECT 'India' AS Country, CONCAT('BLI', LPAD(CAST(ROW_NUMBER() OVER (ORDER BY date, item_id) AS STRING), 6, '0')) AS OrderId, 'Blinkit' AS Channel, 'Blinkit' AS SubChannel, 'Blinkit' AS ChannelAccount, date AS OrderDate, CAST(NULL AS STRING) AS State, city_name AS City, CAST(NULL AS STRING) AS Pincode, item_id AS ProductId, item_id AS ChannelSKUCode, CAST(qty_sold AS FLOAT64) AS ItemQty, CAST(mrp AS FLOAT64) AS SellingPrice_Inc_GST, CAST(pb.selling_price AS FLOAT64) AS SellingPrice_Exc_GST, CAST(NULL AS STRING) AS OrderTrackingStatus, CAST(NULL AS STRING) AS FulfilmentStatus, CAST(NULL AS STRING) AS FinancialStatus, CAST(NULL AS FLOAT64) AS Tax, CAST(NULL AS STRING) AS fulfillment_channel, CAST(NULL AS STRING) AS RefundStatus, CAST(NULL AS STRING) AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, CAST(NULL AS STRING) AS voucher_code FROM \`frido-429506.production.fact_blinkit_sales_report\` LEFT JOIN price_blinkit pb ON TRIM(CAST(item_id AS STRING)) = pb.productid WHERE date BETWEEN '${s}' AND '${e}'),
zepto AS (SELECT 'India' AS Country, CONCAT('ZEP', LPAD(CAST(ROW_NUMBER() OVER (ORDER BY date, sku_number) AS STRING), 6, '0')) AS OrderId, 'Zepto' AS Channel, 'Zepto' AS SubChannel, 'Zepto' AS ChannelAccount, date AS OrderDate, CAST(NULL AS STRING) AS State, city AS City, CAST(NULL AS STRING) AS Pincode, sku_number AS ProductId, sku_number AS ChannelSKUCode, CAST(sales_qty_units AS FLOAT64) AS ItemQty, CAST(gross_merchandise_value AS FLOAT64) AS SellingPrice_Inc_GST, CAST(pz.selling_price AS FLOAT64) AS SellingPrice_Exc_GST, CAST(NULL AS STRING) AS OrderTrackingStatus, CAST(NULL AS STRING) AS FulfilmentStatus, CAST(NULL AS STRING) AS FinancialStatus, CAST(NULL AS FLOAT64) AS Tax, CAST(NULL AS STRING) AS fulfillment_channel, CAST(NULL AS STRING) AS RefundStatus, CAST(NULL AS STRING) AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, CAST(NULL AS STRING) AS voucher_code FROM \`frido-429506.production.zepto_sales_report\` LEFT JOIN price_zepto pz ON TRIM(sku_number) = pz.productid WHERE date BETWEEN '${s}' AND '${e}'),
instamart AS (SELECT 'India' AS Country, CONCAT('INS', LPAD(CAST(ROW_NUMBER() OVER (ORDER BY ordered_date, item_code) AS STRING), 6, '0')) AS OrderId, 'Instamart' AS Channel, 'Instamart' AS SubChannel, 'Instamart' AS ChannelAccount, DATE(ordered_date) AS OrderDate, CAST(NULL AS STRING) AS State, city AS City, CAST(NULL AS STRING) AS Pincode, item_code AS ProductId, item_code AS ChannelSKUCode, CAST(units_sold AS FLOAT64) AS ItemQty, CAST(gmv AS FLOAT64) AS SellingPrice_Inc_GST, CAST(pi.selling_price AS FLOAT64) AS SellingPrice_Exc_GST, CAST(NULL AS STRING) AS OrderTrackingStatus, CAST(NULL AS STRING) AS FulfilmentStatus, CAST(NULL AS STRING) AS FinancialStatus, CAST(NULL AS FLOAT64) AS Tax, CAST(NULL AS STRING) AS fulfillment_channel, CAST(NULL AS STRING) AS RefundStatus, CAST(NULL AS STRING) AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, CAST(NULL AS STRING) AS voucher_code FROM \`frido-429506.production.fact_instamart_sales_report\` LEFT JOIN price_instamart pi ON TRIM(item_code) = pi.productid WHERE DATE(ordered_date) BETWEEN '${s}' AND '${e}'),
unicommerce_status_map AS (SELECT TRIM(DisplayOrderCode) AS order_id, CASE WHEN UPPER(ShippingPackageStatusCode)='DELIVERED' THEN ShippingPackageStatusCode WHEN UPPER(ShippingPackageStatusCode) IN ('RETURNED','RETURN_EXPECTED','RETURN_ACKNOWLEDGED') THEN ShippingPackageStatusCode WHEN UPPER(SaleOrderItemStatus)='CANCELLED' THEN SaleOrderItemStatus WHEN UPPER(SaleOrderItemStatus)='DISPATCHED' THEN SaleOrderItemStatus ELSE NULL END AS unicommerce_status, COALESCE(CAST(DeliveryTime_dtm AS STRING), CAST(DeliveryTime AS STRING)) AS delivered_date_uni, COALESCE(CAST(DispatchDate_dtm AS STRING), CAST(DispatchDate AS STRING)) AS dispatch_date_uni FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY DisplayOrderCode ORDER BY Updated DESC) AS rn FROM \`frido-429506.production.Unicommerce_Sale_Orders_Report\` WHERE DisplayOrderCode IS NOT NULL) WHERE rn = 1),
clickpost_status_map AS (SELECT TRIM(order_id) AS order_id, clickpost_unified_status, delivery_date, out_for_pickup_1st_attempt FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC) AS rn FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\` WHERE order_id IS NOT NULL AND LOWER(TRIM(shipment_type))='forward') WHERE rn = 1),
cancelled_orders AS (SELECT TRIM(DisplayOrderCode) AS order_id, 1 AS is_cancelled FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY DisplayOrderCode ORDER BY Updated DESC) AS rn FROM \`frido-429506.production.Unicommerce_Sale_Orders_Report\` WHERE DisplayOrderCode IS NOT NULL AND SaleOrderItemStatus='CANCELLED') WHERE rn = 1),
rto_shipments AS (SELECT TRIM(order_id) AS order_id, 1 AS is_rto FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC) AS rn FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\` WHERE order_id IS NOT NULL AND (UPPER(clickpost_unified_status) LIKE 'RTO%' OR rto_mark_date IS NOT NULL)) WHERE rn = 1),
cir_returns AS (SELECT TRIM(forward_order_id) AS order_id, 1 AS is_cir_return, CASE WHEN UPPER(TRIM(Return_Type))='EXCHANGE' THEN 1 ELSE 0 END AS is_exchange FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY forward_order_id ORDER BY request_created_on DESC) AS rn FROM \`frido-429506.production.Clickpost_Returns_Exchange_Report\` WHERE forward_order_id IS NOT NULL) WHERE rn = 1),
unified AS (SELECT * FROM shopify_india UNION ALL SELECT * FROM shopify_b2b UNION ALL SELECT * FROM shopify_international UNION ALL SELECT * FROM amazon_seller_central UNION ALL SELECT * FROM amazon_vendor_central UNION ALL SELECT * FROM amazon_international UNION ALL SELECT * FROM flipkart UNION ALL SELECT * FROM myntra UNION ALL SELECT * FROM cred UNION ALL SELECT * FROM firstcry UNION ALL SELECT * FROM pharmeasy UNION ALL SELECT * FROM blinkit UNION ALL SELECT * FROM zepto UNION ALL SELECT * FROM instamart)
SELECT u.Country, u.OrderId, u.Channel, u.SubChannel, u.ChannelAccount, u.OrderDate, u.State, u.City, u.Pincode, u.ProductId, u.ChannelSKUCode, u.ItemQty, u.SellingPrice_Inc_GST,
  CASE WHEN SAFE_CAST(im.GST_Tax_Type_Code AS FLOAT64) IS NOT NULL THEN u.SellingPrice_Inc_GST / (1 + SAFE_CAST(im.GST_Tax_Type_Code AS FLOAT64) / 100) WHEN u.SellingPrice_Exc_GST IS NOT NULL AND u.SellingPrice_Exc_GST != 0 THEN u.SellingPrice_Exc_GST ELSE u.SellingPrice_Inc_GST / 1.18 END AS SellingPrice_Exc_GST,
  u.OrderTrackingStatus, u.FulfilmentStatus, u.FinancialStatus,
  CASE WHEN SAFE_CAST(im.GST_Tax_Type_Code AS FLOAT64) IS NOT NULL THEN CAST(u.SellingPrice_Inc_GST - (u.SellingPrice_Inc_GST / (1 + SAFE_CAST(im.GST_Tax_Type_Code AS FLOAT64) / 100)) AS STRING) ELSE 'Not Found' END AS Tax,
  u.fulfillment_channel, u.RefundStatus, u.PaymentMode, u.CustomerId, u.voucher_code,
  COALESCE(im.Category, 'Frido') AS Category, COALESCE(im.SubCategory, 'Frido') AS SubCategory, COALESCE(im.GST_Tax_Type_Code, 'Not Found') AS GST_Tax_Type_Code,
  COALESCE(sm.masterskucode, TRIM(u.ProductId)) AS MasterSKU,
  CASE WHEN u.Channel='Shopify' THEN COALESCE(cr.is_cir_return, 0) ELSE NULL END AS is_CIR_return,
  CASE WHEN u.Channel='Shopify' THEN COALESCE(cr.is_exchange, 0) ELSE NULL END AS is_exchange,
  CASE WHEN u.Channel='Shopify' THEN COALESCE(rto.is_rto, 0) ELSE NULL END AS is_rto,
  CASE WHEN u.Channel='Shopify' THEN COALESCE(co.is_cancelled, 0) ELSE NULL END AS is_cancelled,
  cs.clickpost_unified_status AS Clickpost_Status, us.unicommerce_status AS Unicommerce_Status,
  CASE WHEN UPPER(us.unicommerce_status)='DELIVERED' THEN 'Delivered' WHEN UPPER(cs.clickpost_unified_status) LIKE '%DELIVERED%' THEN 'Delivered' WHEN UPPER(us.unicommerce_status)='CANCELLED' THEN 'Cancelled' WHEN UPPER(cs.clickpost_unified_status) LIKE '%CANCELLED%' THEN 'Cancelled' WHEN UPPER(cs.clickpost_unified_status) LIKE 'RTO%' THEN 'RTO' WHEN UPPER(us.unicommerce_status) IN ('RETURNED','RETURN_EXPECTED','RETURN_ACKNOWLEDGED') THEN 'RTO' WHEN UPPER(us.unicommerce_status)='DISPATCHED' THEN 'Dispatched' WHEN UPPER(cs.clickpost_unified_status) LIKE '%DISPATCHED%' THEN 'Dispatched' ELSE NULL END AS Order_Status,
  COALESCE(CAST(us.dispatch_date_uni AS STRING), CAST(cs.out_for_pickup_1st_attempt AS STRING)) AS Dispatch_Date,
  COALESCE(CAST(us.delivered_date_uni AS STRING), CAST(cs.delivery_date AS STRING)) AS Delivered_Date
FROM unified u
LEFT JOIN sku_mapping sm ON TRIM(u.ProductId) = sm.productid
LEFT JOIN item_master im ON COALESCE(sm.masterskucode, TRIM(u.ProductId)) = im.Product_Code
LEFT JOIN cir_returns cr ON TRIM(u.OrderId) = cr.order_id
LEFT JOIN rto_shipments rto ON TRIM(u.OrderId) = rto.order_id
LEFT JOIN cancelled_orders co ON TRIM(u.OrderId) = co.order_id
LEFT JOIN unicommerce_status_map us ON TRIM(u.OrderId) = us.order_id
LEFT JOIN clickpost_status_map cs ON TRIM(u.OrderId) = cs.order_id
${whereClause}ORDER BY u.OrderDate DESC`
}

const unwrap = v => {
  if (v == null) return null
  if (typeof v === 'object' && v.value !== undefined) return v.value
  return v
}

export async function syncRange(pool, start, end) {
  const bq = getBQ()
  const t0 = Date.now()
  console.log(`[BQ] Fetching ${start} → ${end}`)
  const [bqRows] = await bq.query({ query: buildQuery(start, end), maximumBytesBilled: '10000000000' })
  console.log(`[BQ] Got ${bqRows.length} rows in ${((Date.now()-t0)/1000).toFixed(1)}s`)

  await pool.query(`DELETE FROM orders WHERE order_date BETWEEN $1 AND $2`, [start, end])
  if (bqRows.length === 0) return 0

  const BATCH = 500
  for (let i = 0; i < bqRows.length; i += BATCH) {
    const batch = bqRows.slice(i, i + BATCH)
    const values = [], params = []
    let p = 1
    for (const r of batch) {
      values.push(`($${p},$${p+1},$${p+2},$${p+3},$${p+4},$${p+5},$${p+6},$${p+7},$${p+8},$${p+9},$${p+10},$${p+11},$${p+12},$${p+13},$${p+14},$${p+15},$${p+16},$${p+17},$${p+18},$${p+19},$${p+20},$${p+21},$${p+22},$${p+23},$${p+24},$${p+25},$${p+26},$${p+27},$${p+28},$${p+29},$${p+30})`)
      p += 31
      const taxRaw = unwrap(r.Tax)
      const taxNum = taxRaw && taxRaw !== 'Not Found' ? parseFloat(taxRaw) : null
      params.push(
        unwrap(r.OrderId), unwrap(r.OrderDate), unwrap(r.Channel), unwrap(r.SubChannel), unwrap(r.ChannelAccount),
        unwrap(r.Country), unwrap(r.State), unwrap(r.City), unwrap(r.Pincode), unwrap(r.ProductId),
        unwrap(r.ChannelSKUCode), unwrap(r.MasterSKU), unwrap(r.Category), unwrap(r.SubCategory),
        r.ItemQty != null ? parseFloat(unwrap(r.ItemQty)) : null,
        r.SellingPrice_Inc_GST != null ? parseFloat(unwrap(r.SellingPrice_Inc_GST)) : null,
        r.SellingPrice_Exc_GST != null ? parseFloat(unwrap(r.SellingPrice_Exc_GST)) : null,
        taxNum, unwrap(r.GST_Tax_Type_Code), unwrap(r.PaymentMode), unwrap(r.CustomerId), unwrap(r.voucher_code),
        unwrap(r.FulfilmentStatus), unwrap(r.FinancialStatus), unwrap(r.Order_Status),
        r.is_rto != null ? parseInt(unwrap(r.is_rto)) : null,
        r.is_cancelled != null ? parseInt(unwrap(r.is_cancelled)) : null,
        r.is_CIR_return != null ? parseInt(unwrap(r.is_CIR_return)) : null,
        r.is_exchange != null ? parseInt(unwrap(r.is_exchange)) : null,
        unwrap(r.Dispatch_Date), unwrap(r.Delivered_Date)
      )
    }
    await pool.query(
      `INSERT INTO orders (order_id,order_date,channel,sub_channel,channel_account,country,state,city,pincode,product_id,sku_code,master_sku,category,sub_category,item_qty,revenue_inc_gst,revenue_exc_gst,tax,gst_rate,payment_mode,customer_id,voucher_code,fulfilment_status,financial_status,order_status,is_rto,is_cancelled,is_cir_return,is_exchange,dispatch_date,delivered_date) VALUES ${values.join(',')}`,
      params
    )
  }
  console.log(`[sync] ✅ ${start}→${end}: ${bqRows.length} rows in ${((Date.now()-t0)/1000).toFixed(1)}s`)
  return bqRows.length
}
