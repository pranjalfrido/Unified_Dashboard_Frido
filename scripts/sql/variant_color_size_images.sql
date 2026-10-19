-- Variant Color / Size / Images — one row per Shopify variant across both stores.
--
-- Columns follow the Variant_Color_Size_Images sample sheet — Product Title, SKU, Color,
-- Size, Images — plus Store and Status, which that sheet had no way to express. The sheet
-- was a FORMAT example, so this is not filtered to match its row count: it returns the
-- current catalogue in that shape.
--
-- Three things about these tables drive the shape of this query:
--
-- 1. They are APPEND-ONLY SNAPSHOT HISTORY, not current state. Frido_Shopify_products holds
--    188,434 rows for 500 products across 1,312 ingest batches. Querying it directly returns
--    every historical copy of every variant.
--
-- 2. A batch is PARTIAL. The newest _daton_batch_runtime covers only 162 of the 500 products,
--    so filtering to the latest batch would silently drop two thirds of the catalogue. The
--    dedupe therefore takes the newest row PER PRODUCT ID, not the newest batch.
--
-- 3. Colour and size are NOT at fixed option positions. option1/2/3 are positional, and the
--    names vary by product — Color, Size, Shoe Size, Category, Combo, and 'Title' as a
--    placeholder on single-variant products. Reading option1 as colour would label a shoe
--    size as a colour. Each option is matched BY NAME to find which position it occupies,
--    then that position is read off the variant.
--
-- The grain is ONE ROW PER VARIANT, and SKU is not unique within it. 378 SKUs appear on
-- more than one row and 288 of those are within active products alone — FR-ASPI-L1 appears
-- 17 times, across "Frido Arch Sports Insole", "AC - Frido Arch Sports Insole" and "MAX",
-- at sizes "7 UK", "L (7-10 UK)" and "Large (7-10 UK)". These are real separate listings
-- that share a code, not duplicate rows, so they are left alone. Deduplicating on SKU would
-- silently drop live listings. Group by SKU afterwards only if you want one row per code
-- and are content to lose that detail.

WITH
-- Newest row per product, per store.
frido AS (
  SELECT * EXCEPT(rn) FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY _daton_batch_runtime DESC) rn
    FROM `frido-429506.Frido_BigQuery.Frido_Shopify_products`
  ) WHERE rn = 1
),
mobility AS (
  SELECT * EXCEPT(rn) FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY _daton_batch_runtime DESC) rn
    FROM `frido-429506.Frido_BigQuery.Frido_Mobility_Shopify_products`
  ) WHERE rn = 1
),

-- One stream. `store` is kept so a SKU present in both can be told apart; drop the column
-- if the sheet should not carry it.
products AS (
  SELECT 'myfrido'  AS store, id, title, status, options, variants, images FROM frido
  UNION ALL
  SELECT 'mobility' AS store, id, title, status, options, variants, images FROM mobility
),

variants AS (
  SELECT
    p.store,
    p.status,
    p.id    AS product_id,
    p.title AS product_title,
    v.sku,
    v.id    AS variant_id,
    v.image_id,

    -- Which option position holds colour / size, decided per product by NAME.
    -- LOWER + TRIM because the same option appears as "Color", "color" and " Colour".
    (SELECT MIN(o.position) FROM UNNEST(p.options) o
      WHERE LOWER(TRIM(o.name)) IN ('color','colour')) AS colour_pos,
    (SELECT MIN(o.position) FROM UNNEST(p.options) o
      WHERE LOWER(TRIM(o.name)) IN ('size','shoe size','shoe size (uk)','sizes')) AS size_pos,

    v.option1, v.option2, v.option3
  FROM products p, UNNEST(p.variants) v
  -- No status filter here on purpose: `status` is emitted as a column instead, so the
  -- caller decides. Add  WHERE Status = 'active'  around this query, or uncomment below.
  -- WHERE p.status = 'active'
),

resolved AS (
  SELECT
    store, status, product_id, product_title, sku, variant_id, image_id,
    CASE colour_pos WHEN 1 THEN option1 WHEN 2 THEN option2 WHEN 3 THEN option3 END AS color,
    CASE size_pos   WHEN 1 THEN option1 WHEN 2 THEN option2 WHEN 3 THEN option3 END AS size
  FROM variants
),

-- Image lookup, as JOINs rather than correlated subqueries: BigQuery rejects a correlated
-- subquery that references another table unless it can de-correlate it, which it cannot here.
--
-- Three routes, in order of reliability:
--   a) the variant's own image_id — exact, but often null;
--   b) an image whose variant_ids list contains this variant;
--   c) the product's first image, as a last resort.
--
-- variant_ids is a STRING, not an array, so route (b) matches it as a delimited list. A
-- plain LIKE '%id%' would match 123 inside 1234.
prod_images AS (
  SELECT p.store, p.id AS product_id, i.id AS image_id, i.src, i.position, i.variant_ids
  FROM products p, UNNEST(p.images) i
),

-- (a) exact image per variant
by_image_id AS (
  SELECT store, image_id, ANY_VALUE(src) AS src
  FROM prod_images WHERE image_id IS NOT NULL GROUP BY 1, 2
),

-- (b) variant_ids exploded to one row per listed variant
by_variant_list AS (
  SELECT store, SAFE_CAST(vid AS INT64) AS variant_id, ANY_VALUE(src) AS src
  FROM prod_images,
       UNNEST(SPLIT(REGEXP_REPLACE(COALESCE(variant_ids, ''), r'[\[\]\s"]', ''), ',')) vid
  WHERE vid != '' GROUP BY 1, 2
),

-- (c) first image of each product
by_product AS (
  SELECT store, product_id, src FROM (
    SELECT store, product_id, src, ROW_NUMBER() OVER (PARTITION BY store, product_id ORDER BY position) rn
    FROM prod_images
  ) WHERE rn = 1
)

SELECT
  r.product_title AS `Product Title`,
  r.sku           AS `SKU`,
  r.color         AS `Color`,
  r.size          AS `Size`,
  COALESCE(a.src, b.src, c.src) AS `Images`,
  -- Beyond the five columns of the sample sheet. A SKU can exist in both stores, and a
  -- draft looks identical to a live product once it is a row in a spreadsheet — without
  -- these two the reader cannot tell either apart.
  r.store         AS `Store`,
  r.status        AS `Status`
FROM resolved r
LEFT JOIN by_image_id     a ON a.store = r.store AND a.image_id   = r.image_id
LEFT JOIN by_variant_list b ON b.store = r.store AND b.variant_id = r.variant_id
LEFT JOIN by_product      c ON c.store = r.store AND c.product_id = r.product_id
ORDER BY `Product Title`, `Color`, `Size`, `SKU`
