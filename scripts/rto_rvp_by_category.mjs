import { BigQuery } from '@google-cloud/bigquery';
const bq = new BigQuery({ keyFilename: 'sa_key.json', projectId: 'frido-429506' });

const query = `
WITH item_cat AS (
  SELECT DISTINCT
    Scan_Identifier AS sku,
    Category_Code,
    Category_Name
  FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
  WHERE Scan_Identifier IS NOT NULL
),
classified AS (
  SELECT
    c.order_date,
    c.product_sku_code,
    c.clickpost_unified_status,
    c.rto_mark_date,
    c.rvp_reason,
    c.delivery_date,
    CASE
      WHEN UPPER(COALESCE(i.Category_Code,'')) LIKE '%MOBILITY%' OR UPPER(COALESCE(i.Category_Name,'')) LIKE '%MOBILITY%'
        OR UPPER(COALESCE(i.Category_Code,'')) LIKE '%CHAIR%' OR UPPER(COALESCE(i.Category_Name,'')) LIKE '%CHAIR%'
      THEN 'Chair & Mobility'
      ELSE 'Non Chair & Mobility'
    END AS category_bucket
  FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\` c
  LEFT JOIN item_cat i ON c.product_sku_code = i.sku
  WHERE DATE(c.order_date) >= '2026-07-01'
    AND DATE(c.order_date) <= '2026-08-31'
),
monthly AS (
  SELECT
    FORMAT_DATE('%Y-%m', DATE(order_date)) AS month,
    category_bucket,
    COUNT(*) AS total_shipments,
    COUNTIF(LOWER(clickpost_unified_status) = 'delivered') AS delivered,
    COUNTIF(LOWER(clickpost_unified_status) LIKE '%rto%' OR rto_mark_date IS NOT NULL) AS rto_count,
    COUNTIF(rvp_reason IS NOT NULL AND TRIM(rvp_reason) != '') AS rvp_count
  FROM classified
  GROUP BY 1, 2
)
SELECT
  month,
  category_bucket,
  total_shipments,
  delivered,
  ROUND(delivered * 100.0 / NULLIF(total_shipments,0), 2) AS delivery_pct,
  rto_count,
  ROUND(rto_count * 100.0 / NULLIF(total_shipments,0), 2) AS rto_pct,
  rvp_count,
  ROUND(rvp_count * 100.0 / NULLIF(total_shipments,0), 2) AS rvp_pct
FROM monthly
ORDER BY month, category_bucket
`;

const [rows] = await bq.query(query);
console.table(rows);
