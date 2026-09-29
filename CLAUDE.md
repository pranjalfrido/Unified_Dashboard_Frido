# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start Vite dev server (frontend only)
npm run build      # production build → dist/
npm run lint       # ESLint
npm run preview    # preview production build locally
```

Local dev with API: Vite serves the frontend; Vercel CLI (`vercel dev`) is needed to run the `api/` serverless functions locally. Set `VITE_API_URL=http://localhost:3000` in `.env.local` when using `vercel dev`.

## Architecture

### Overview
Full-stack React + Vercel Serverless. Frontend is a single-page React app (Vite). Backend is Vercel serverless functions in `api/`. Most data comes from BigQuery; the Inventory Health tab uses a pre-computed static JSON file served from Vercel CDN (see below).

### Data Flow
```
Browser → POST /api/<tab> → Vercel Serverless Function → BigQuery → JSON response → React state
```

Each dashboard tab has its own API endpoint. The frontend sends `{ start, end, ...filters }` in the POST body. The API runs one BigQuery query (often with many CTEs) and returns pre-aggregated JSON.

### API files (`api/`)
- `_bq.js` — BigQuery client singleton (`getBQ()`) + `buildQuery()` which constructs the base CTE for the sales fact table with all filter logic. **All sales/ads queries go through this.**
- `_db.js` — Postgres pool (currently unused by active routes)
- `_inventory_shared.js` — Pure JS utility functions for inventory calculations (DOI, stock status, dead stock). No BQ calls.
- `bq.js` — Sales & Ads tab. Sends courier/shipmentType/category filters to BQ; zone/payment/state/city are filtered client-side in `App.jsx`.
- `logistics.js` — Single massive BQ query with ~28 CTEs. Date filter uses `DATE(created_at)`. The `all_channels` CTE was removed — channels now come from `base` to avoid a second full table scan.
- `inventory.js` — 6 parallel Supabase queries. All 6 source tables are synced from BigQuery to Supabase hourly by `export_to_supabase.mjs`. Normally this endpoint is NOT called by the frontend — `public/inv-data.json` (pre-computed static JSON, served from CDN) is used instead. This endpoint is the fallback when the static file is missing or older than 2 hours.
- `inward.js`, `returns.js`, `customer.js`, `sales-allocation.js` — Each fires one BQ query.
- `admin.js` — Admin/sync utilities.

### BigQuery tables (project: `frido-429506`)
| Dataset | Key tables |
|---------|-----------|
| `production` | `fact_all_platform_sales_report`, `Clickpost_Shipment_Tracking_Report`, `Aggregated_uniware_sales_report`, `fact_shopify_inventory` |
| `sharepoint_to_gcp` | `Frido_Item_Master__frido_item_sku_master`, `Frido_Item_Master__productid_sku_mapping` |
| `Frido_BigQuery` | `Frido_Unicommerce_3_Inventory_Snapshot_Inventory_Snapshot` |

### Frontend (`src/`)
- `App.jsx` — **Monolithic file** containing all page components: `LogisticsPage`, sales/ads/overview pages, date picker, routing logic. Very large — search for `function <PageName>Page` to navigate.
- `InventoryPage.jsx` — Inventory tab, imports from `src/inventory/`.
- `src/inventory/` — Inventory sub-components: `InventoryHealthPage.jsx`, `SalesAllocationPage.jsx`, `InwardPage.jsx`, `theme.jsx` (dark theme palette `IC`).
- `components.jsx` — Shared chart/UI components (KPICard, DataTable, chart wrappers around Recharts).
- `utils.js` — Theme constants (`C`), formatters (`fmt`, `fmtN`, `fmtBig`, `pct`), `processData()`, `detectAlerts()`, `exportCSV()`.

### Auth / Secrets
- **Local**: Place `sa_key.json` (GCP service account) at repo root. `_bq.js` loads it automatically.
- **Vercel**: Set `GCP_SA_KEY` env var (JSON string). `_bq.js` writes it to a temp file at runtime.
- `VITE_API_URL` — set in Vercel env for the deployed frontend to point at the right API origin.

### Deployment
Deployed on Vercel Hobby plan. `vercel.json` sets `maxDuration: 300` for all `api/*.js` functions but Hobby plan caps at 60s. BQ queries that take >60s will timeout on Hobby. The function limit on Hobby is 12 — all sync/admin routes are merged into `admin.js` to stay under this limit.

### Performance notes
- Logistics slicer filters for **courier, shipmentType, sddNdd, category** trigger a BQ re-fetch (accurate KPIs). Filters for **zone, payment, state, city** are applied client-side from cached response data.
- Inventory Health fetches `public/inv-data.json` from Vercel CDN (~100-200ms). A GitHub Actions cron (`.github/workflows/precompute-inventory.yml`) runs hourly: syncs BQ→Supabase via `export_to_supabase.mjs`, then runs `scripts/generate-inv-cache.mjs` to regenerate `public/inv-data.json` and commits it. All slicer filters (category, location, stock status, etc.) are applied client-side — no re-fetch on filter change.
- GST rate lookups must use `GST_Tax_Type_Code` from the item master, not other GST columns.
