// Rebuilds production.shelfwise_inventory_corrected from the Shelfwise raw table, applying
// the stale-row correction: Unicommerce/Daton stops returning a (Shelf, SKU,
// InventoryType) row once its quantity hits 0 via outbound movement, instead of sending an
// explicit 0, so the last known non-zero quantity persists indefinitely. Any row stale >12h on
// an outbound-type shelf (i.e. NOT RTN/DEMO, which are inbound-only and never exhibit this) is
// treated as 0. Validated against live Uniware Shelfwise exports: gap dropped from 9.29% to
// 0.16% of total GOOD_INVENTORY (see 18-Sept-2026 reconciliation).
//
// Also computes RtdInvt/RawInvt for Vadgaon_OPS only (0 for every other facility) — that
// facility's RTD/Raw split is by shelf-name substring rather than the pack-qty/raw-SKU-text
// heuristic api/_inventory_shared.js's computeRowInventory() uses elsewhere; see that
// function's Vadgaon_OPS branch, which reads these two columns directly.
//
// QuantityNotFound gets the same correction, for the same reason as QuantityBlocked — 43% of
// its latest-sync total (37,223 of 86,522, checked 19-Sept-2026) sat in stale combos before
// this fix. NetVariance is carried through as its exact mirror (NetVariance = -QuantityNotFound
// at the row level, confirmed earlier this session) rather than corrected independently.
//
// QuantityDamaged and ExcessQuantity are genuinely all-zero across the entire raw table today
// (verified 19-Sept-2026) — nothing to correct there, and they're not pulled into this table.
//
// Run hourly (matches the Shelfwise table's own sync cadence) via cron/GitHub Actions, same
// schedule as export_to_supabase.mjs which reads this table immediately after.
//
// Deliberately NOT named unicommerce_inventory_snapshot_hourly (the table this replaces as
// the dashboard's inventory source) — that name is also written by an external job outside
// this repo, on its own schedule, using the OLD uncorrected 5-column logic. Found 19-Sept-2026
// when that job silently overwrote this table's corrected output between two of our runs,
// clobbering RtdInvt/RawInvt/RawBlockedInvt/QuantityNotFound/NetVariance and reverting
// Quantity/InventoryBlocked to their uncorrected values. Writing to a dedicated table name
// removes that collision entirely — export_to_supabase.mjs reads from shelfwise_inventory_corrected now.

import { BigQuery } from '@google-cloud/bigquery'

const bq = new BigQuery({ keyFilename: './sa_key.json', projectId: 'frido-429506' })

const STALE_HOURS_THRESHOLD = 36

const query = `
CREATE OR REPLACE TABLE \`frido-429506.production.shelfwise_inventory_corrected\` AS
WITH base AS (
  SELECT
    Facility, ItemTypeSKUCode, ItemTypeName, Shelf, InventoryType,
    InventoryAllocation, InventorySync,
    SAFE_CAST(NULLIF(TRIM(Quantity_st), '') AS FLOAT64) AS Quantity,
    SAFE_CAST(NULLIF(TRIM(QuantityBlocked_st), '') AS FLOAT64) AS QuantityBlocked,
    SAFE_CAST(NULLIF(TRIM(QuantityNotFound_st), '') AS FLOAT64) AS QuantityNotFound,
    TIMESTAMP_MILLIS(CAST(_daton_batch_runtime AS INT64)) AS batch_ts
  FROM \`frido-429506.Frido_BigQuery.Frido_Unicommerce_3_Inventory_Snapshot_Shelfwise_Inventory\`
  WHERE Facility IS NOT NULL AND ItemTypeSKUCode IS NOT NULL
    AND NOT REGEXP_CONTAINS(IFNULL(Shelf, ''), r'(?i)(QC|Reject|Return|rtn|bad)')
),
latest_ts_per_key AS (
  SELECT Facility, ItemTypeSKUCode, Shelf, InventoryType, MAX(batch_ts) AS max_ts
  FROM base GROUP BY Facility, ItemTypeSKUCode, Shelf, InventoryType
),
-- Sum all rows sharing a key's own latest sync timestamp (NOT dedupe-to-one-row — a single
-- sync can carry multiple additive line items for the same key, e.g. Return_dump shelves).
raw_latest AS (
  SELECT b.Facility, b.ItemTypeSKUCode, b.ItemTypeName, b.Shelf, b.InventoryType,
    b.InventoryAllocation, b.InventorySync,
    SUM(b.Quantity) AS Quantity, SUM(b.QuantityBlocked) AS QuantityBlocked,
    SUM(b.QuantityNotFound) AS QuantityNotFound, t.max_ts AS last_seen_ts
  FROM base b JOIN latest_ts_per_key t
    ON b.Facility = t.Facility AND b.ItemTypeSKUCode = t.ItemTypeSKUCode
    AND b.Shelf = t.Shelf AND b.InventoryType = t.InventoryType AND b.batch_ts = t.max_ts
  GROUP BY b.Facility, b.ItemTypeSKUCode, b.ItemTypeName, b.Shelf, b.InventoryType,
    b.InventoryAllocation, b.InventorySync, t.max_ts
),
corrected AS (
  SELECT Facility, ItemTypeSKUCode, ItemTypeName, Shelf, InventoryType,
    InventoryAllocation, InventorySync, last_seen_ts,
    CASE
      WHEN Quantity > 0
        AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), last_seen_ts, HOUR) > ${STALE_HOURS_THRESHOLD}
        AND NOT REGEXP_CONTAINS(Shelf, r'^(RTN|DEMO)')
      THEN 0
      ELSE Quantity
    END AS Quantity_Final,
    -- QuantityBlocked gets the exact same staleness treatment as Quantity — a shelf/SKU whose
    -- last sync is >12h old on an outbound-type shelf silently stops being returned at all
    -- (the same Unicommerce/Daton behavior that inflates Quantity), so its blocked reservation
    -- from that stale sync is just as untrustworthy and must be zeroed the same way. Found via
    -- a live-vs-GCP reconciliation on 19-Sept-2026: unstaled blocked totals were 3.5x live
    -- (101,581 vs 29,174) at exactly the facilities with heavy stale-row buildup; applying this
    -- correction brought it to 31,007 (~6% of live).
    CASE
      WHEN (Quantity > 0 OR IFNULL(QuantityBlocked, 0) > 0)
        AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), last_seen_ts, HOUR) > ${STALE_HOURS_THRESHOLD}
        AND NOT REGEXP_CONTAINS(Shelf, r'^(RTN|DEMO)')
      THEN 0
      ELSE IFNULL(QuantityBlocked, 0)
    END AS QuantityBlocked,
    -- Same staleness treatment as Quantity/QuantityBlocked — 43% of QuantityNotFound's
    -- latest-sync total sat in stale combos before this fix (checked 19-Sept-2026).
    CASE
      WHEN (Quantity > 0 OR IFNULL(QuantityBlocked, 0) > 0 OR IFNULL(QuantityNotFound, 0) > 0)
        AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), last_seen_ts, HOUR) > ${STALE_HOURS_THRESHOLD}
        AND NOT REGEXP_CONTAINS(Shelf, r'^(RTN|DEMO)')
      THEN 0
      ELSE IFNULL(QuantityNotFound, 0)
    END AS QuantityNotFound,
    -- pack_qty for Frido_Sudhawadi RAW shelves only — extract PO## from SKU name
    CASE
      WHEN Facility = 'Frido_Sudhawadi' AND REGEXP_CONTAINS(Shelf, r'RAW')
      THEN GREATEST(1, COALESCE(
        SAFE_CAST(REGEXP_EXTRACT(ItemTypeSKUCode, r'(?i)P[O0][_\\s]*(\\d+)') AS INT64), 1
      ))
      ELSE 1
    END AS pack_qty
  FROM raw_latest
)
SELECT
  ItemTypeSKUCode AS ItemSkuCode,
  ItemTypeName,
  Facility,
  Shelf,
  InventoryAllocation,
  InventorySync,
  MAX(last_seen_ts) AS Updated,
  SUM(IF(InventoryType = 'GOOD_INVENTORY', Quantity_Final, 0)) AS Inventory,
  SUM(QuantityBlocked) AS InventoryBlocked,
  -- Vadgaon_OPS: RTD shelves excluding RTN/QC contaminated (e.g. RTN-RTD-01)
  -- Frido_Sudhawadi: RTD shelves (no pack_qty scaling — RTD stock is finished goods)
  SUM(IF(Facility = 'Vadgaon_OPS' AND InventoryType = 'GOOD_INVENTORY'
      AND REGEXP_CONTAINS(Shelf, r'RTD')
      AND NOT REGEXP_CONTAINS(Shelf, r'RTN|QC'), Quantity_Final, 0)
  + IF(Facility = 'Frido_Sudhawadi' AND InventoryType = 'GOOD_INVENTORY'
      AND REGEXP_CONTAINS(Shelf, r'RTD'), Quantity_Final, 0)) AS RtdInvt,
  -- Vadgaon_OPS: RACK shelves excluding RTN/QC (e.g. QC-RACK-2)
  -- Frido_Sudhawadi: RAW shelves with pack_qty scaling
  SUM(IF(Facility = 'Vadgaon_OPS' AND InventoryType = 'GOOD_INVENTORY'
      AND NOT REGEXP_CONTAINS(Shelf, r'RTD')
      AND REGEXP_CONTAINS(Shelf, r'RACK')
      AND NOT REGEXP_CONTAINS(Shelf, r'RTN|QC'), Quantity_Final, 0)
  + IF(Facility = 'Frido_Sudhawadi' AND InventoryType = 'GOOD_INVENTORY'
      AND REGEXP_CONTAINS(Shelf, r'RAW'), Quantity_Final * pack_qty, 0)) AS RawInvt,
  -- Vadgaon_OPS: RACK blocked excluding RTN/QC
  -- Frido_Sudhawadi: RAW blocked with pack_qty scaling
  SUM(IF(Facility = 'Vadgaon_OPS' AND InventoryType = 'GOOD_INVENTORY'
      AND NOT REGEXP_CONTAINS(Shelf, r'RTD')
      AND REGEXP_CONTAINS(Shelf, r'RACK')
      AND NOT REGEXP_CONTAINS(Shelf, r'RTN|QC'), QuantityBlocked, 0)
  + IF(Facility = 'Frido_Sudhawadi' AND InventoryType = 'GOOD_INVENTORY'
      AND REGEXP_CONTAINS(Shelf, r'RAW'), QuantityBlocked * pack_qty, 0)) AS RawBlockedInvt,
  SUM(QuantityNotFound) AS QuantityNotFound,
  -SUM(QuantityNotFound) AS NetVariance
FROM corrected
GROUP BY ItemTypeSKUCode, ItemTypeName, Facility, Shelf, InventoryAllocation, InventorySync
`

const [job] = await bq.createQueryJob({ query })
console.log(`Job ${job.id} started...`)
const [rows] = await job.getQueryResults()
const [metadata] = await job.getMetadata()
const rowsAffected = metadata.statistics?.query?.numDmlAffectedRows
  || metadata.statistics?.query?.statementType
console.log(`Done. Table rebuilt: production.shelfwise_inventory_corrected`)

const [countRows] = await bq.query({
  query: `SELECT COUNT(*) AS n, SUM(Inventory) AS total_inv FROM \`frido-429506.production.shelfwise_inventory_corrected\``,
})
console.log(`Rows: ${countRows[0].n}, Total Inventory: ${countRows[0].total_inv}`)
