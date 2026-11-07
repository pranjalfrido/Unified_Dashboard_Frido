-- Inventory → Inward: read-only verification queries (BigQuery, project frido-429506).
-- Not run on 2026-11-08 — BigQuery access was not available in the build session (see
-- docs/INWARD_REPORT.md). Run these, then compare with POST /api/inward for the same month.

-- ── Step 1a: columns of the GRN table and the vendor mapping ─────────────────────────────
SELECT table_name, column_name, data_type
FROM `frido-429506.production.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name IN ('unicommerce_grn_refined', 'vendor_mapping')
ORDER BY table_name, ordinal_position;

-- ── Step 1b: join coverage per month since Apr-25 (SKU → SKU master, vendor → vendor_mapping) ──
WITH g AS (
  SELECT *, SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(GRNDate, 1, 10)) AS grn_date,
    REGEXP_REPLACE(REGEXP_REPLACE(ItemSkuCode, r'[-_]RAW[-_]?PO[-_]?[0-9]+$', ''), r'[-_]RAW$', '') AS final_sku_code
  FROM `frido-429506.production.unicommerce_grn_refined`
),
f AS (
  SELECT * FROM g
  WHERE grn_date >= DATE '2025-04-01'
    AND NOT REGEXP_CONTAINS(UPPER(ItemSkuCode), r'PKG')
    AND Facility != 'myfrido-Vadgaon_Traceability'
    AND NOT REGEXP_CONTAINS(UPPER(IFNULL(CAST(GRNInvoiceNo AS STRING), '')), r'WRONG')
),
sm AS (SELECT TRIM(productid) productid, ANY_VALUE(TRIM(masterskucode)) masterskucode
       FROM `frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping`
       WHERE masterskucode IS NOT NULL AND LOWER(TRIM(masterskucode)) NOT IN ('', 'not found') GROUP BY 1),
m AS (SELECT DISTINCT TRIM(Product_Code) product_code FROM `frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master`),
v AS (SELECT DISTINCT vendor_name FROM `frido-429506.production.vendor_mapping`)
SELECT FORMAT_DATE('%Y-%m', grn_date) AS month, COUNT(*) AS lines,
  ROUND(100 * COUNTIF(m.product_code IS NOT NULL) / COUNT(*), 1) AS sku_match_pct,
  ROUND(100 * COUNTIF(v.vendor_name IS NOT NULL) / COUNT(*), 1) AS vendor_match_pct,
  COUNT(DISTINCT IF(v.vendor_name IS NULL, f.VendorName, NULL)) AS unmapped_vendor_names
FROM f LEFT JOIN sm ON sm.productid = TRIM(f.final_sku_code)
LEFT JOIN m ON m.product_code = sm.masterskucode
LEFT JOIN v ON v.vendor_name = f.VendorName
GROUP BY month ORDER BY month;

-- ── Step 3a: units reconciliation for one month (written independently of the API's SQL) ──
-- Expected: equals kpis.cur.units from POST /api/inward {start:'2026-10-01', end:'2026-10-31'} (no filters).
-- Prior investigation for Oct-26: 33,020 raw lines → 32,376 matched, 2,263 SKUs, 78 vendors, qty 1,392,195.
WITH f AS (
  SELECT ItemSkuCode, GRNCode, VendorName,
    SAFE_CAST(QuantityReceived AS FLOAT64) AS qr,
    COALESCE(SAFE_CAST(REGEXP_EXTRACT(ItemSkuCode, r'[-_]RAW[-_]?PO[-_]?([0-9]+)$') AS INT64), 1) AS pack_qty,
    REGEXP_REPLACE(REGEXP_REPLACE(ItemSkuCode, r'[-_]RAW[-_]?PO[-_]?[0-9]+$', ''), r'[-_]RAW$', '') AS final_sku_code
  FROM `frido-429506.production.unicommerce_grn_refined`
  WHERE PARSE_DATE('%Y-%m-%d', SUBSTR(GRNDate, 1, 10)) BETWEEN '2026-10-01' AND '2026-10-31'
    AND NOT REGEXP_CONTAINS(UPPER(ItemSkuCode), r'PKG')
    AND Facility != 'myfrido-Vadgaon_Traceability'
    AND NOT REGEXP_CONTAINS(UPPER(IFNULL(CAST(GRNInvoiceNo AS STRING), '')), r'WRONG')
)
SELECT COUNT(*) AS raw_lines,
  COUNTIF(m.product_code IS NOT NULL) AS matched_lines,
  COUNT(DISTINCT IF(m.product_code IS NOT NULL, m.product_code, NULL)) AS skus,
  COUNT(DISTINCT IF(m.product_code IS NOT NULL, f.GRNCode, NULL)) AS grns,
  SUM(IF(m.product_code IS NOT NULL, f.qr * f.pack_qty, 0)) AS inward_units
FROM f
LEFT JOIN (SELECT TRIM(productid) productid, ANY_VALUE(TRIM(masterskucode)) masterskucode
           FROM `frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping`
           WHERE masterskucode IS NOT NULL AND LOWER(TRIM(masterskucode)) NOT IN ('', 'not found') GROUP BY 1) sm
  ON sm.productid = TRIM(f.final_sku_code)
LEFT JOIN (SELECT DISTINCT TRIM(Product_Code) product_code FROM `frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master`) m
  ON m.product_code = sm.masterskucode;

-- ── Step 3b: sample-SKU ₹ check ──────────────────────────────────────────────────────────
-- Pick the top SKU of the API's skus[] for the month, then:
--   units:  the query above with AND m.product_code = '<SKU>'
--   COGS:   POST /api/cogs-monthly {skus:['<SKU>'], startMonth:'2026-10-01', endMonth:'2026-10-01'} → rows[0].cogs
--   expect: skus[i].value = units × cogs (single-month range; GRN month = Oct)
