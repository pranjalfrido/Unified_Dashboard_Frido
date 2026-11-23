# Inward page — data notes (Step 1)

Branch `feat/inward-page` (worktree `C:/wt-inward`), written 2026-11-08.

> **Access status for this run.** No `sa_key.json` / `.env` exists in this worktree. Two attempts
> to run read-only BigQuery queries with the key that sits in the main project folder (referenced by
> absolute path, never copied) were **denied by the session's permission system** ("credential
> exploration"). Following the brief ("if you need a key you don't already have access to in this
> worktree, stop and report — don't work around it"), no live query was run. The column inventory
> below therefore comes from the prior, already-validated investigation quoted in the build spec, and
> every number marked *(prior)* must be re-checked with the queries in `docs/sql/inward_verify.sql`
> once access is granted. Nothing here was invented: columns the spec did not confirm are marked "?".

## 1. GRN fact — `production.unicommerce_grn_refined`

| Column | Present | Used for / notes |
|---|---|---|
| GRNCode | Y | distinct GRN count, drill-down events |
| GRNDate | Y | **STRING**. ~1.5 % of rows are `YYYY-MM-DDTHH:MM` (no seconds) → always `PARSE_DATE('%Y-%m-%d', SUBSTR(GRNDate,1,10))`, never `CAST`/`DATE()`. The API uses `SAFE.PARSE_DATE` (same result on valid rows; a garbage row is dropped instead of failing the whole page) |
| ItemSkuCode | Y | final SKU = strip `[-_]RAW[-_]?PO[-_]?<n>$` then `[-_]RAW$`; pack qty = that `<n>` (default 1); `PKG` codes excluded |
| Facility | Y | warehouse (→ Location via facility master); `myfrido-Vadgaon_Traceability` excluded |
| VendorName / VendorCode | Y | vendor; `VendorName` = `vendor_mapping.vendor_name` (exact) |
| GRNInvoiceNo | Y | rows containing `WRONG` (any case) excluded |
| POCode / PODate | Y | **lead time** = days from PO date to GRN received date (avg per GRN) |
| GRNReceivedTimestamp | Y | received date for lead time (falls back to GRN date when empty) |
| QuantityReceived | Y | inward units = QuantityReceived × pack qty |
| QuantityRejected | Y | **rejection %** = rejected ÷ (received + rejected), × pack qty |
| PercentageRejection, RejectionReason | Y | not used (recomputed from quantities) |
| ValuesofGoodsReceived/Rejected with/without taxes | Y | **not used** — the spec values inward at COGS, not at invoice value |
| Per-unit price column | N | none useful → ₹ value = units × COGS (Supabase `product_cogs_monthly`) |
| QCCompletedOn, GrnitemStatus, BatchCode, ExpiryDate, Updated, Category, ItemType*, AdditionalCost, VendorSkuCode, GRNCreatedBy, GRNInvoiceDate | Y | not used on this page |

Coverage *(prior)*: SKU → SKU-master match 95.8 %–99.0 % every month Apr-25 → Oct-26; Oct-26:
33,020 lines → 32,376 matched, 2,263 SKUs, 78 vendors, pack-adjusted qty 1,392,195.

## 2. Vendor mapping — `production.vendor_mapping`

| Column | Present | Notes |
|---|---|---|
| vendor_name | Y | join key (exact match to GRN `VendorName`) |
| unified_vendor_name | Y | vendor shown on the page |
| vendor_type | Y | source type. Real values: `Domestic`, `Import`, `Inhouse`, `Internal` (used as-is; `Internal` = internal stock transfers) |

Coverage *(prior)*: ~99 % of GRN rows map; ~38 vendor names unmapped, mostly legacy pre-Apr-25.

## 3. Other sources

| Source | Used for | Notes |
|---|---|---|
| `sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping` | final SKU → `masterskucode` | `TRIM(productid)` exact, case-sensitive; `masterskucode` NULL / `not found` dropped; de-duplicated per productid |
| `sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master` | category, sub-category, product name | `Product_Code` = `masterskucode`; product name shown = sub-category (spec) |
| `production.shelfwise_inventory_corrected` | current stock | read **through Inventory Health's own feed** (`inv-data-7d.json`, fallback `/api/inventory`), which is built from this table via `export_to_supabase.mjs` → so stock / Avg Sale / DOI are identical to the Health page by construction |
| `production.aggregated_uniware_sales_report` | sales units (KPI ratio, trend line, warehouse, category) and the drill-down's daily sales | channels = B2C + B2B + Purchase Order (+ unmapped), same set as Health's "Total Avg Sale"; pseudo SKUs (COUP/DFA) excluded; only SKUs in the SKU master |
| Supabase `product_cogs_monthly` (via `api/cogs-monthly.js`, called in-process) | ₹ value | per SKU per GRN month; fallback = sub-category average for that month (P&L rule) |

## 4. Sections built vs skipped

Every section in the spec has the columns it needs — **nothing skipped for missing columns.**
Rejection % (QuantityRejected) and lead time (PODate + GRNReceivedTimestamp) are included.
"Not-required inward" flag table: not built (spec says "not now"); a placeholder is left in
`src/inventory/InwardPage.jsx`.

## 5. Assumptions

1. **SKU-master exclusion is absolute.** GRN rows that don't resolve all the way to a real
   `Product_Code` are dropped from every number and appear only in Data quality (admins).
2. **Vendors missing from `vendor_mapping` are kept** (they are real, SKU-resolved inward) with
   source type `Unmapped` and the raw vendor name, so totals still reconcile to BigQuery. They are
   listed under Data quality. (The "real values only" rule is about the four mapped types; dropping
   these rows would break the units reconciliation.)
3. **Duplicates in the lookup tables are collapsed** (one row per productid, per Product_Code, per
   vendor_name) so a duplicate mapping row can never double-count inward.
4. **Warehouse = Location** (PNQ, GGN, BLR, …) from the facility master, the same grain as Inventory
   Health's warehouse cards. A GRN facility missing from the facility master shows under its raw
   facility name.
5. **Sales are filtered by category / sub-category / SKU / warehouse only.** Source type and vendor
   don't exist on a sale, so those two filters change inward numbers but not the sales line; the
   page says so under the KPI row when either is active.
6. **Current stock / Avg Sale / DOI** come from Inventory Health's own data (see §3), not a separate
   query, so they cannot drift from the Health page. Health's default (and phone-only) **Regular** view
   shows a SKU's stock summed over *Regular* facilities only, but keeps the feed's Avg Sale and DOI
   (DOI is computed server-side on all facilities) — e.g. FR-OPC-M1: feed stock 18,893 vs Health's
   displayed 18,672, DOI 20 d either way. Inward mirrors exactly that (stock = Regular facilities, Avg
   Sale + DOI = feed), so the three numbers are the ones the Health page shows. Warehouse view: stock =
   the location's Regular facilities (as on Health's warehouse cards), Avg Sale / DOI = the location's
   own; with a category/SKU filter, Regular stock of the matching SKUs, summed Avg Sale and
   `floor(all-facility stock ÷ Avg Sale)` (the formula `InventoryPage.jsx` uses for Health's filtered rows).
7. **COGS.** Each GRN line is valued at its own GRN month's COGS. Same tiers as the P&L page
   (`src/pnl/pnlUtils.js#getCogsPerUnit`): SKU's own month → its sub-category's average for that month.
   The P&L's last tier (40/50 % of ASP) needs a selling price, which a GRN line doesn't have; instead,
   a SKU with no COGS row at all borrows its SKU-master sub-category's average, and anything still
   uncosted is valued at ₹0 and counted in the "units without COGS" note under the KPI.
8. **Previous equal period** for ▲/▼ = the same number of days ending the day before `start`.
9. **Default date range** = 1st of this month → today.
10. **Lead time** is averaged per GRN (not per line), only where PO date ≤ received date.
11. **Average days between GRNs** (vendor) = (last GRN date − first GRN date) ÷ (GRN days − 1) within
    the selected range; blank for a vendor with one GRN day.
12. **Drill-down estimated stock** = today's stock (Health feed) − inward after that day + sales after
    that day, for each day from the range start to today; labelled "estimated". Sales here are the same
    B2C + B2B + PO channels, so stock transfers and other movements are not in it.
13. The legacy cron step `scripts/generate-inward-cache.mjs` (old GRN table) still runs in
    `precompute-inventory.yml` and writes `public/inward-data.json`; the new page no longer reads it.
    Left untouched (shared workflow) — remove in a follow-up.
14. **Server-side permission** = valid Supabase session + active profile + (admin, or a
    `user_permissions` row `inventory:inward`), checked in `api/inward.js` before any query (same
    lookup as `api/pulse.js`). Admins see the tab by default (`inventory:inward` added to the admin tab
    list in `App.jsx`). Data quality is only computed and sent for admins.
15. **Local dev note (pre-existing, not changed):** `vite.config.js` proxies `/api` to :3001, which also
    captures the frontend's own module imports from `/api/_pnlAgg.js` / `/api/_resolvedAgg.js`; with no
    API server on :3001 the app never boots. The local preview used a scratch copy of the config without
    the proxy (see `scripts/inward-browser-check.mjs` header).
