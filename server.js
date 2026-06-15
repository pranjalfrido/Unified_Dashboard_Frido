import express from 'express'
import cors from 'cors'
import { BigQuery } from '@google-cloud/bigquery'
import pkg from 'pg'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

config()

const { Pool } = pkg
const __dirname = dirname(fileURLToPath(import.meta.url))

// Support both file-based key (local dev) and env variable (Render)
let bq
if (process.env.GCP_SA_KEY) {
  const credentials = JSON.parse(process.env.GCP_SA_KEY)
  bq = new BigQuery({ credentials, projectId: 'frido-429506' })
} else {
  const KEY_PATH = join(__dirname, '..', 'sa_key.json')
  bq = new BigQuery({ keyFilename: KEY_PATH, projectId: 'frido-429506' })
}

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5
})

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// ── Create tables if not exist ────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id          TEXT,
      order_date        DATE,
      channel           TEXT,
      sub_channel       TEXT,
      channel_account   TEXT,
      country           TEXT,
      state             TEXT,
      city              TEXT,
      pincode           TEXT,
      product_id        TEXT,
      sku_code          TEXT,
      master_sku        TEXT,
      category          TEXT,
      sub_category      TEXT,
      item_qty          NUMERIC,
      revenue_inc_gst   NUMERIC,
      revenue_exc_gst   NUMERIC,
      tax               NUMERIC,
      gst_rate          TEXT,
      payment_mode      TEXT,
      customer_id       TEXT,
      voucher_code      TEXT,
      fulfilment_status TEXT,
      financial_status  TEXT,
      order_status      TEXT,
      is_rto            SMALLINT,
      is_cancelled      SMALLINT,
      is_cir_return     SMALLINT,
      is_exchange       SMALLINT,
      dispatch_date     TEXT,
      delivered_date    TEXT,
      synced_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_date    ON orders (order_date)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders (channel)`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id          SERIAL PRIMARY KEY,
      sync_date   DATE,
      range_start DATE,
      range_end   DATE,
      rows_synced INT,
      rows_upserted INT,
      duration_s  NUMERIC,
      synced_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  const { rows } = await pool.query(`SELECT COUNT(*) FROM orders`)
  console.log(`[db] Tables ready — orders has ${rows[0].count} rows`)
}

// ── BQ query builder ──────────────────────────────────────────
function buildQuery(s, e) {
  return `WITH
sku_mapping AS (SELECT DISTINCT TRIM(productid) AS productid, TRIM(masterskucode) AS masterskucode FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` WHERE TRIM(masterskucode) NOT IN ('', 'not found')),
price_amazon AS (SELECT DISTINCT TRIM(productid) AS productid, SAFE_CAST(TRIM(REGEXP_REPLACE(Selling_Price, r'[^\x20-\x7E]', '')) AS FLOAT64) AS selling_price FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` WHERE TRIM(channelname) = 'Amazon'),
price_blinkit AS (SELECT DISTINCT TRIM(productid) AS productid, SAFE_CAST(TRIM(REGEXP_REPLACE(Selling_Price, r'[^\x20-\x7E]', '')) AS FLOAT64) AS selling_price FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` WHERE TRIM(channelname) = 'Blinkit'),
price_zepto AS (SELECT DISTINCT TRIM(productid) AS productid, SAFE_CAST(TRIM(REGEXP_REPLACE(Selling_Price, r'[^\x20-\x7E]', '')) AS FLOAT64) AS selling_price FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` WHERE TRIM(channelname) = 'Zepto'),
price_instamart AS (SELECT DISTINCT TRIM(productid) AS productid, SAFE_CAST(TRIM(REGEXP_REPLACE(Selling_Price, r'[^\x20-\x7E]', '')) AS FLOAT64) AS selling_price FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` WHERE TRIM(channelname) = 'Instamart'),
item_master AS (SELECT DISTINCT TRIM(Product_Code) AS Product_Code, TRIM(Category_Name) AS Category, TRIM(Sub_category) AS SubCategory, TRIM(GST_Tax_Type_Code) AS GST_Tax_Type_Code FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\` WHERE TRIM(Product_Code) != ''),
shopify_india AS (SELECT 'India' AS Country, order_name AS OrderId, 'Shopify' AS Channel, CASE WHEN source_name='Retail Store' THEN 'Retail Store' WHEN order_name LIKE '#MF%' THEN 'MyFrido' WHEN order_name LIKE '#FM%' THEN 'Mobility' ELSE source_name END AS SubChannel, CASE WHEN source_name='Retail Store' THEN 'Retail' WHEN order_name LIKE '#MF%' THEN 'MyFrido' WHEN order_name LIKE '#FM%' THEN 'Mobility' ELSE 'B2B' END AS ChannelAccount, order_date_ist AS OrderDate, shipping_state AS State, shipping_city AS City, shipping_pincode AS Pincode, sku AS ProductId, sku AS ChannelSKUCode, CAST(qty AS FLOAT64) AS ItemQty, CAST(final_total_incl_tax AS FLOAT64) AS SellingPrice_Inc_GST, CAST(selling_price_excl_shipping_tax AS FLOAT64) AS SellingPrice_Exc_GST, fulfillment_tracking_url AS OrderTrackingStatus, order_fulfillment_status AS FulfilmentStatus, financial_status AS FinancialStatus, CAST(item_gst_tax AS FLOAT64) AS Tax, CAST(NULL AS STRING) AS fulfillment_channel, CAST(is_refunded_line AS STRING) AS RefundStatus, gateway AS PaymentMode, customer_id AS CustomerId, voucher_code AS voucher_code FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist BETWEEN '${s}' AND '${e}'),
shopify_b2b AS (SELECT 'India' AS Country, order_name AS OrderId, 'Shopify' AS Channel, 'Shopify B2B' AS SubChannel, 'Shopify B2B' AS ChannelAccount, order_date AS OrderDate, shipping_state AS State, shipping_city AS City, shipping_pincode AS Pincode, sku AS ProductId, sku AS ChannelSKUCode, CAST(qty AS FLOAT64) AS ItemQty, CAST(final_total_incl_tax AS FLOAT64) AS SellingPrice_Inc_GST, CAST(selling_price_excl_shipping_tax AS FLOAT64) AS SellingPrice_Exc_GST, fulfillment_tracking_url AS OrderTrackingStatus, line_fulfillment_status AS FulfilmentStatus, financial_status AS FinancialStatus, CAST(item_gst_tax AS FLOAT64) AS Tax, CAST(NULL AS STRING) AS fulfillment_channel, CAST(is_refunded_line AS STRING) AS RefundStatus, gateway AS PaymentMode, customer_id AS CustomerId, voucher_code AS voucher_code FROM \`frido-429506.production.fact_shopify_b2b_orders\` WHERE order_date BETWEEN '${s}' AND '${e}'),
shopify_international AS (SELECT 'International' AS Country, order_name AS OrderId, 'Shopify' AS Channel, CAST(NULL AS STRING) AS SubChannel, CASE WHEN currency='AED' THEN 'UAE' WHEN currency='GBP' THEN 'UK' WHEN currency='USD' THEN 'US' ELSE currency END AS ChannelAccount, order_date AS OrderDate, shipping_state AS State, shipping_city AS City, shipping_pincode AS Pincode, sku AS ProductId, sku AS ChannelSKUCode, CAST(qty AS FLOAT64) AS ItemQty, CAST(final_total_incl_tax AS FLOAT64) AS SellingPrice_Inc_GST, CAST(selling_price_excl_shipping_tax AS FLOAT64) AS SellingPrice_Exc_GST, fulfillment_tracking_url AS OrderTrackingStatus, order_fulfillment_status AS FulfilmentStatus, financial_status AS FinancialStatus, CAST(item_gst_tax AS FLOAT64) AS Tax, CAST(NULL AS STRING) AS fulfillment_channel, CAST(is_refunded_line AS STRING) AS RefundStatus, gateway AS PaymentMode, customer_id AS CustomerId, voucher_code AS voucher_code FROM \`frido-429506.production.fact_shopify_international_orders\` WHERE order_date BETWEEN '${s}' AND '${e}'),
amazon_seller_central AS (SELECT 'India' AS Country, amazon_order_id AS OrderId, 'Amazon' AS Channel, 'Amazon Seller Central' AS SubChannel, 'Seller Central' AS ChannelAccount, purchase_date_ist AS OrderDate, ship_state AS State, ship_city AS City, ship_postal_code AS Pincode, asin AS ProductId, sku AS ChannelSKUCode, CAST(quantity AS FLOAT64) AS ItemQty, CAST(item_price AS FLOAT64) AS SellingPrice_Inc_GST, CAST(NULL AS FLOAT64) AS SellingPrice_Exc_GST, CAST(NULL AS STRING) AS OrderTrackingStatus, item_status AS FulfilmentStatus, order_status AS FinancialStatus, CAST(item_tax AS FLOAT64) AS Tax, fulfillment_channel AS fulfillment_channel, CAST(NULL AS STRING) AS RefundStatus, CAST(NULL AS STRING) AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, promotion_ids AS voucher_code FROM \`frido-429506.production.amazon_seller_central_all_orders\` WHERE purchase_date_ist BETWEEN '${s}' AND '${e}'),
amazon_vendor_central AS (SELECT 'India' AS Country, CONCAT('AVC', LPAD(CAST(ROW_NUMBER() OVER (ORDER BY sales_date, asin) AS STRING), 6, '0')) AS OrderId, 'Amazon' AS Channel, 'Amazon Vendor Central' AS SubChannel, vendor_account AS ChannelAccount, sales_date AS OrderDate, CAST(NULL AS STRING) AS State, CAST(NULL AS STRING) AS City, CAST(NULL AS STRING) AS Pincode, asin AS ProductId, CAST(NULL AS STRING) AS ChannelSKUCode, CAST(orderedUnits AS FLOAT64) AS ItemQty, CAST(ordered_revenue AS FLOAT64) AS SellingPrice_Inc_GST, CAST(pa.selling_price AS FLOAT64) AS SellingPrice_Exc_GST, CAST(NULL AS STRING) AS OrderTrackingStatus, CAST(NULL AS STRING) AS FulfilmentStatus, CAST(NULL AS STRING) AS FinancialStatus, CAST(NULL AS FLOAT64) AS Tax, CAST(NULL AS STRING) AS fulfillment_channel, CAST(NULL AS STRING) AS RefundStatus, CAST(NULL AS STRING) AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, CAST(NULL AS STRING) AS voucher_code FROM \`frido-429506.production.Amazon_Vendor_Central_sales_DateASIN_wise\` LEFT JOIN price_amazon pa ON TRIM(asin) = pa.productid WHERE sales_date BETWEEN '${s}' AND '${e}'),
amazon_international AS (SELECT Country AS Country, amazon_order_id AS OrderId, 'Amazon' AS Channel, 'Amazon International' AS SubChannel, CASE WHEN UPPER(Country)='UK' THEN 'Amazon SC UK' WHEN UPPER(Country)='UAE' THEN 'Amazon SC UAE' ELSE Country END AS ChannelAccount, purchase_date_ist AS OrderDate, ship_state AS State, ship_city AS City, ship_postal_code AS Pincode, asin AS ProductId, sku AS ChannelSKUCode, CAST(quantity AS FLOAT64) AS ItemQty, CAST(item_price AS FLOAT64) AS SellingPrice_Inc_GST, CAST(NULL AS FLOAT64) AS SellingPrice_Exc_GST, CAST(NULL AS STRING) AS OrderTrackingStatus, item_status AS FulfilmentStatus, order_status AS FinancialStatus, CAST(item_tax AS FLOAT64) AS Tax, fulfillment_channel AS fulfillment_channel, CAST(NULL AS STRING) AS RefundStatus, CAST(NULL AS STRING) AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, promotion_ids AS voucher_code FROM \`frido-429506.production.amazon_seller_central_uk_uae_all_orders\` WHERE purchase_date_ist BETWEEN '${s}' AND '${e}'),
flipkart AS (SELECT 'India' AS Country, order_id AS OrderId, 'Flipkart' AS Channel, CASE WHEN UPPER(TRIM(fulfilment_type))='FBF' THEN 'Flipkart FBF' ELSE 'Flipkart NON-FBF' END AS SubChannel, 'Flipkart' AS ChannelAccount, DATE(SUBSTR(order_date,1,10)) AS OrderDate, customer_s_delivery_state AS State, CAST(NULL AS STRING) AS City, customer_s_delivery_pincode AS Pincode, TRIM(REPLACE(fsn,'"','')) AS ProductId, TRIM(REPLACE(REGEXP_REPLACE(sku,r'"{2,}SKU:-*"{0,}',''),'"','')) AS ChannelSKUCode, CAST(item_quantity AS FLOAT64) AS ItemQty, CAST(price_after_discount_price_before_discount_total_discountx AS FLOAT64) AS SellingPrice_Inc_GST, CAST(taxable_value_final_invoice_amount_taxesx AS FLOAT64) AS SellingPrice_Exc_GST, CAST(NULL AS STRING) AS OrderTrackingStatus, event_sub_type AS FulfilmentStatus, order_type AS FinancialStatus, CAST(igst_amount AS FLOAT64) AS Tax, fulfilment_type AS fulfillment_channel, event_type AS RefundStatus, CAST(NULL AS STRING) AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, CAST(NULL AS STRING) AS voucher_code FROM \`frido-429506.test_flipkart_dataset.sales_report\` WHERE DATE(SUBSTR(order_date,1,10)) BETWEEN '${s}' AND '${e}'),
myntra AS (SELECT 'India' AS Country, store_order_id AS OrderId, 'Myntra' AS Channel, 'Myntra' AS SubChannel, 'Myntra' AS ChannelAccount, created_on AS OrderDate, state AS State, city AS City, zipcode AS Pincode, myntra_sku_code AS ProductId, seller_sku_code AS ChannelSKUCode, CAST(1 AS FLOAT64) AS ItemQty, CAST(final_amount AS FLOAT64) AS SellingPrice_Inc_GST, CAST(seller_price AS FLOAT64) AS SellingPrice_Exc_GST, order_tracking_number AS OrderTrackingStatus, order_status AS FulfilmentStatus, order_status AS FinancialStatus, CAST(tax_recovery AS FLOAT64) AS Tax, courier_code AS fulfillment_channel, CAST(return_creation_date AS STRING) AS RefundStatus, CAST(NULL AS STRING) AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, CAST(NULL AS STRING) AS voucher_code FROM \`frido-429506.production.fact_myntra_orders_report\` WHERE created_on BETWEEN '${s}' AND '${e}'),
cred AS (SELECT 'India' AS Country, DisplayOrderCode AS OrderId, 'CRED' AS Channel, 'CRED' AS SubChannel, ChannelName AS ChannelAccount, DATE(OrderDateasddmmyyyyhhMMss) AS OrderDate, ShippingAddressState AS State, ShippingAddressCity AS City, CAST(ShippingAddressPincode_in AS STRING) AS Pincode, ItemSKUCode AS ProductId, ItemSKUCode AS ChannelSKUCode, CAST(1 AS FLOAT64) AS ItemQty, CAST(SellingPrice AS FLOAT64) AS SellingPrice_Inc_GST, CAST(Subtotal AS FLOAT64) AS SellingPrice_Exc_GST, TrackingNumber AS OrderTrackingStatus, ShippingPackageStatusCode AS FulfilmentStatus, SaleOrderStatus AS FinancialStatus, CAST(Tax AS FLOAT64) AS Tax, ShippingCourier AS fulfillment_channel, ReturnDate AS RefundStatus, PaymentInstrument AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, VoucherCode AS voucher_code FROM \`frido-429506.production.Unicommerce_Sale_Orders_Report\` WHERE DATE(OrderDateasddmmyyyyhhMMss) BETWEEN '${s}' AND '${e}' AND LOWER(TRIM(ChannelName)) LIKE 'cred%' AND SaleOrderStatus != 'CANCELLED'),
firstcry AS (SELECT 'India' AS Country, DisplayOrderCode AS OrderId, 'Firstcry' AS Channel, 'Firstcry' AS SubChannel, ChannelName AS ChannelAccount, DATE(OrderDateasddmmyyyyhhMMss) AS OrderDate, ShippingAddressState AS State, ShippingAddressCity AS City, CAST(ShippingAddressPincode_in AS STRING) AS Pincode, ItemSKUCode AS ProductId, ItemSKUCode AS ChannelSKUCode, CAST(1 AS FLOAT64) AS ItemQty, CAST(SellingPrice AS FLOAT64) AS SellingPrice_Inc_GST, CAST(Subtotal AS FLOAT64) AS SellingPrice_Exc_GST, TrackingNumber AS OrderTrackingStatus, ShippingPackageStatusCode AS FulfilmentStatus, SaleOrderStatus AS FinancialStatus, CAST(Tax AS FLOAT64) AS Tax, ShippingCourier AS fulfillment_channel, ReturnDate AS RefundStatus, PaymentInstrument AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, VoucherCode AS voucher_code FROM \`frido-429506.production.Unicommerce_Sale_Orders_Report\` WHERE DATE(OrderDateasddmmyyyyhhMMss) BETWEEN '${s}' AND '${e}' AND LOWER(TRIM(ChannelName)) LIKE 'firstcry%' AND SaleOrderStatus != 'CANCELLED'),
pharmeasy AS (SELECT 'India' AS Country, DisplayOrderCode AS OrderId, 'Pharmeasy' AS Channel, 'Pharmeasy' AS SubChannel, ChannelName AS ChannelAccount, DATE(OrderDateasddmmyyyyhhMMss) AS OrderDate, ShippingAddressState AS State, ShippingAddressCity AS City, CAST(ShippingAddressPincode_in AS STRING) AS Pincode, ItemSKUCode AS ProductId, ItemSKUCode AS ChannelSKUCode, CAST(1 AS FLOAT64) AS ItemQty, CAST(SellingPrice AS FLOAT64) AS SellingPrice_Inc_GST, CAST(Subtotal AS FLOAT64) AS SellingPrice_Exc_GST, TrackingNumber AS OrderTrackingStatus, ShippingPackageStatusCode AS FulfilmentStatus, SaleOrderStatus AS FinancialStatus, CAST(Tax AS FLOAT64) AS Tax, ShippingCourier AS fulfillment_channel, ReturnDate AS RefundStatus, PaymentInstrument AS PaymentMode, CAST(NULL AS STRING) AS CustomerId, VoucherCode AS voucher_code FROM \`frido-429506.production.Unicommerce_Sale_Orders_Report\` WHERE DATE(OrderDateasddmmyyyyhhMMss) BETWEEN '${s}' AND '${e}' AND LOWER(TRIM(ChannelName)) LIKE 'pharmeasy%' AND SaleOrderStatus != 'CANCELLED'),
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
ORDER BY u.OrderDate DESC`
}

function daysAgoStr(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
function todayStr() { return new Date().toISOString().slice(0, 10) }

const unwrap = v => {
  if (v == null) return null
  if (typeof v === 'object' && v.value !== undefined) return v.value
  return v
}

// ── Bulk sync a date range ────────────────────────────────────
async function syncRange(start, end) {
  const t0 = Date.now()
  console.log(`[BQ] Fetching ${start} → ${end}`)
  const [bqRows] = await bq.query({ query: buildQuery(start, end) })
  console.log(`[BQ] Got ${bqRows.length} rows in ${((Date.now()-t0)/1000).toFixed(1)}s — inserting into Supabase...`)

  await pool.query(`DELETE FROM orders WHERE order_date BETWEEN $1 AND $2`, [start, end])

  if (bqRows.length === 0) {
    await pool.query(`INSERT INTO sync_log (range_start, range_end, rows_synced, duration_s) VALUES ($1,$2,$3,$4)`, [start, end, 0, ((Date.now()-t0)/1000).toFixed(1)])
    return 0
  }

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
        unwrap(r.OrderId),
        unwrap(r.OrderDate),
        unwrap(r.Channel),
        unwrap(r.SubChannel),
        unwrap(r.ChannelAccount),
        unwrap(r.Country),
        unwrap(r.State),
        unwrap(r.City),
        unwrap(r.Pincode),
        unwrap(r.ProductId),
        unwrap(r.ChannelSKUCode),
        unwrap(r.MasterSKU),
        unwrap(r.Category),
        unwrap(r.SubCategory),
        r.ItemQty != null ? parseFloat(unwrap(r.ItemQty)) : null,
        r.SellingPrice_Inc_GST != null ? parseFloat(unwrap(r.SellingPrice_Inc_GST)) : null,
        r.SellingPrice_Exc_GST != null ? parseFloat(unwrap(r.SellingPrice_Exc_GST)) : null,
        taxNum,
        unwrap(r.GST_Tax_Type_Code),
        unwrap(r.PaymentMode),
        unwrap(r.CustomerId),
        unwrap(r.voucher_code),
        unwrap(r.FulfilmentStatus),
        unwrap(r.FinancialStatus),
        unwrap(r.Order_Status),
        r.is_rto != null ? parseInt(unwrap(r.is_rto)) : null,
        r.is_cancelled != null ? parseInt(unwrap(r.is_cancelled)) : null,
        r.is_CIR_return != null ? parseInt(unwrap(r.is_CIR_return)) : null,
        r.is_exchange != null ? parseInt(unwrap(r.is_exchange)) : null,
        unwrap(r.Dispatch_Date),
        unwrap(r.Delivered_Date)
      )
    }
    await pool.query(
      `INSERT INTO orders (order_id,order_date,channel,sub_channel,channel_account,country,state,city,pincode,product_id,sku_code,master_sku,category,sub_category,item_qty,revenue_inc_gst,revenue_exc_gst,tax,gst_rate,payment_mode,customer_id,voucher_code,fulfilment_status,financial_status,order_status,is_rto,is_cancelled,is_cir_return,is_exchange,dispatch_date,delivered_date) VALUES ${values.join(',')}`,
      params
    )
    process.stdout.write(`\r[sync] Inserted ${Math.min(i + BATCH, bqRows.length)}/${bqRows.length} rows...`)
  }

  const dur = ((Date.now() - t0) / 1000).toFixed(1)
  await pool.query(`INSERT INTO sync_log (sync_date, range_start, range_end, rows_synced, duration_s) VALUES ($1,$2,$3,$4,$5)`, [start, start, end, bqRows.length, dur]).catch(() => {})
  console.log(`\n[sync] ✅ ${start}→${end}: ${bqRows.length} rows in ${dur}s`)
  return bqRows.length
}

async function syncRecentDays(days = 7) {
  return syncRange(daysAgoStr(days - 1), todayStr())
}

// ── Check if range is fully synced ───────────────────────────
async function hasDataInPG(start, end) {
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT order_date) AS synced_days FROM orders WHERE order_date BETWEEN $1 AND $2`,
    [start, end]
  )
  const syncedDays = parseInt(rows[0].synced_days)
  if (syncedDays === 0) return false
  const expectedDays = Math.round((new Date(end) - new Date(start)) / 86400000) + 1
  return syncedDays >= expectedDays - 2
}

// ── Query Postgres ────────────────────────────────────────────
async function queryPostgres(start, end) {
  const t0 = Date.now()
  const { rows } = await pool.query(
    `SELECT * FROM orders WHERE order_date BETWEEN $1 AND $2 ORDER BY order_date DESC`,
    [start, end]
  )
  console.log(`[pg] ${start}→${end}: ${rows.length} rows in ${Date.now()-t0}ms`)
  return rows.map(r => ({
    OrderId:              r.order_id,
    OrderDate:            r.order_date instanceof Date ? r.order_date.toISOString().slice(0,10) : String(r.order_date),
    Channel:              r.channel,
    SubChannel:           r.sub_channel,
    ChannelAccount:       r.channel_account,
    Country:              r.country,
    State:                r.state,
    City:                 r.city,
    Pincode:              r.pincode,
    ProductId:            r.product_id,
    ChannelSKUCode:       r.sku_code,
    MasterSKU:            r.master_sku,
    Category:             r.category,
    SubCategory:          r.sub_category,
    ItemQty:              r.item_qty,
    SellingPrice_Inc_GST: r.revenue_inc_gst,
    SellingPrice_Exc_GST: r.revenue_exc_gst,
    Tax:                  r.tax,
    GST_Tax_Type_Code:    r.gst_rate,
    PaymentMode:          r.payment_mode,
    CustomerId:           r.customer_id,
    voucher_code:         r.voucher_code,
    FulfilmentStatus:     r.fulfilment_status,
    FinancialStatus:      r.financial_status,
    Order_Status:         r.order_status,
    is_rto:               r.is_rto,
    is_cancelled:         r.is_cancelled,
    is_CIR_return:        r.is_cir_return,
    is_exchange:          r.is_exchange,
    Dispatch_Date:        r.dispatch_date,
    Delivered_Date:       r.delivered_date,
  }))
}

// ── API: main data endpoint ───────────────────────────────────
app.post('/api/bq', async (req, res) => {
  const { start, end } = req.body
  if (!start || !end) return res.status(400).json({ error: 'Missing start or end date' })
  try {
    const inPG = await hasDataInPG(start, end)
    if (inPG) {
      const rows = await queryPostgres(start, end)
      return res.json({ rows, source: 'postgres' })
    }
    console.log(`[api] ${start}→${end} not in cache, fetching from BQ...`)
    await syncRange(start, end)
    const rows = await queryPostgres(start, end)
    res.json({ rows, source: 'bq-synced' })
  } catch (err) {
    console.error('[api] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── API: manual sync trigger ──────────────────────────────────
app.post('/api/sync', async (req, res) => {
  const days = req.body?.days ?? 7
  syncRecentDays(days).catch(e => console.error('[sync]', e.message))
  res.json({ message: `Syncing last ${days} days in background` })
})

// ── API: wipe all data and re-sync from scratch ───────────────
app.post('/api/wipe-and-resync', async (req, res) => {
  const { from = '2022-01-01', to = todayStr() } = req.body
  res.json({ message: `Wiping all data and re-syncing ${from} → ${to} in background` })
  ;(async () => {
    try {
      console.log('[wipe] Truncating orders and sync_log tables...')
      await pool.query(`TRUNCATE TABLE orders`)
      await pool.query(`TRUNCATE TABLE sync_log`)
      console.log('[wipe] Done. Starting fresh sync...')
    } catch (e) {
      console.error('[wipe] Failed to truncate:', e.message)
      return
    }
    let cur = new Date(from)
    const endDate = new Date(to)
    while (cur <= endDate) {
      const monthStart = cur.toISOString().slice(0, 10)
      const last = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
      const monthEnd = (last > endDate ? endDate : last).toISOString().slice(0, 10)
      try {
        await syncRange(monthStart, monthEnd)
        console.log(`[history] ✅ ${monthStart} → ${monthEnd} done`)
      } catch (e) {
        console.error(`[history] ❌ ${monthStart} → ${monthEnd} failed:`, e.message)
      }
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
    }
    console.log('[history] 🎉 Full re-sync complete!')
  })()
})

// ── API: full historical sync month by month ──────────────────
app.post('/api/sync-history', async (req, res) => {
  const { from = '2022-01-01', to = todayStr() } = req.body
  res.json({ message: `Starting historical sync from ${from} to ${to} in background` })
  ;(async () => {
    let cur = new Date(from)
    const endDate = new Date(to)
    while (cur <= endDate) {
      const monthStart = cur.toISOString().slice(0, 10)
      const last = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
      const monthEnd = (last > endDate ? endDate : last).toISOString().slice(0, 10)
      try {
        await syncRange(monthStart, monthEnd)
        console.log(`[history] ✅ ${monthStart} → ${monthEnd} done`)
      } catch (e) {
        console.error(`[history] ❌ ${monthStart} → ${monthEnd} failed:`, e.message)
      }
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
    }
    console.log('[history] 🎉 Full historical sync complete!')
  })()
})

// ── API: sync status ──────────────────────────────────────────
app.get('/api/sync-status', async (_req, res) => {
  try {
    const { rows: log } = await pool.query(`SELECT * FROM sync_log ORDER BY synced_at DESC LIMIT 30`)
    const { rows: cnt } = await pool.query(`SELECT COUNT(*) AS total, MIN(order_date) AS min_date, MAX(order_date) AS max_date FROM orders`)
    res.json({ log, orders: cnt[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Scheduled daily sync at 8:30 AM IST (3:00 AM UTC) ────────
function scheduleDailySync() {
  function msUntilNext8_30_IST() {
    const now = new Date()
    const next = new Date()
    next.setUTCHours(3, 0, 0, 0)
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
    return next - now
  }
  const runDailySync = async () => {
    console.log('[scheduler] Daily sync — resyncing last 3 days...')
    try { await syncRecentDays(3) } catch (e) { console.error('[scheduler]', e.message) }
    setTimeout(runDailySync, msUntilNext8_30_IST())
  }
  const ms = msUntilNext8_30_IST()
  console.log(`[scheduler] Daily sync in ${Math.round(ms / 60000)} min`)
  setTimeout(runDailySync, ms)
}

// ── Startup ───────────────────────────────────────────────────
async function start() {
  await initDB().catch(e => console.warn('[db] init skipped (read-only):', e.message))
  app.listen(3001, () => console.log('[server] BQ proxy running on http://localhost:3001'))
  syncRecentDays(7).catch(e => console.error('[startup sync]', e.message))
  setInterval(() => syncRecentDays(2).catch(e => console.error('[hourly sync]', e.message)), 60 * 60 * 1000)
  scheduleDailySync()
}

start()
