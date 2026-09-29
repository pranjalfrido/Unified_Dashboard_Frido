# PnL Tab — Roadmap

Status: **Planning / not yet built**. This doc is the working plan agreed on 2026-07-31. Revisit and update as decisions change.

## Goal

A new dashboard tab with one subtab per sales channel (Shopify, Amazon, other marketplaces, etc.), each showing a full financial-view PnL table, plus a final **consolidated / brand-level subtab** that rolls up all channels.

Channel build order: **Shopify (D2C) first** — richest first-party data, simplest COGS/SnD mapping. Other channels replicate the same query/table shape once Shopify is validated.

## Financial View Table — Columns & Formulas

Grain: Category → Product (SKU), for a user-selected date range (same start/end picker pattern as other tabs).

| # | Column | Notes |
|---|--------|-------|
| 1 | Category | From item master (per commit `5a1c884` — Category/SubCategory driven by item master, not fact table) |
| 2 | Product (SKU) | From item master |
| 3 | Gross Revenue (inc GST) | |
| 4 | Gross Revenue (ex GST) | GST split via `GST_Tax_Type_Code` from item master — **not** other GST columns (per CLAUDE.md convention) |
| 5 | Total Returns (value & %) | Includes cancellations |
| 6 | Net Revenue | Gross (ex GST) − Returns/Cancellations |
| 7 | COGS value | From COGS master, **month-wise** (see below) |
| 8 | COGS % | COGS value / Net Revenue |
| 9 | GM value | Net Revenue − COGS value |
| 10 | GM % | GM value / Net Revenue |
| 11 | SnD value | See SnD breakdown below |
| 12 | SnD % | SnD value / Net Revenue |
| 13 | CM1 | GM value − SnD value |
| 14 | CM1 % | CM1 / Net Revenue |
| 15 | Marketing Spend | Already available (ads data) |
| 16 | Spend % | Marketing Spend / Net Revenue |
| 17 | CM2 | CM1 − Marketing Spend |
| 18 | CM2 % | CM2 / Net Revenue |

Formula stack, confirmed:
```
Net Revenue = Gross Revenue (ex GST) − Returns − Cancellations
GM   = Net Revenue − COGS
CM1  = GM − SnD
CM2  = CM1 − Marketing Spend
```

## COGS

- Source: existing COGS master sheet, **month-wise per SKU** (cost varies month to month — landed cost revisions etc).
- **Status: exists but needs a data cleanup pass before use** — this is a prerequisite task, not just an ingestion job. Do not build the financial table against it until cleaned.
- Join key: (SKU, month) — not a flat per-SKU lookup, since cost changes over time.
- Open question to resolve during cleanup: which months/SKUs are missing or inconsistent, and what's the fallback (e.g. most recent available month's cost) when a SKU has no COGS entry for the selected month.

## SnD (Shipping & Distribution)

Components, confirmed:
1. **Forward shipping charge** — from new master sheet (weight-wise rate)
2. **Reverse/RTO charge** — from new master sheet (weight-wise rate)
3. **Fulfilment fee** — from new master sheet (weight-wise rate)
4. **COD handling** — folded into forward/reverse courier charges, **no separate line item**
5. **Payment gateway charge** — **not sourced from data**; modeled as a flat assumption of **1.5% of gross revenue value**

Source: a new master sheet (forward charge, reverse charge, fulfilment fee — all keyed by product weight slab) to be ingested into GCP/BigQuery. This sheet does not yet exist in BQ — ingestion pipeline is a prerequisite task (likely similar pattern to existing sharepoint→GCP syncs).

Join key: SKU → weight → weight-slab rate. Need the actual slab boundaries from the sheet once available.

## Date Range / Time Grain

- Financial view table uses a **selectable date range**, consistent with other tabs (not locked to monthly).
- COGS and SnD-weight-master are **month-wise sources** — when a selected range doesn't align to full calendar months (e.g. mid-month start/end), need pro-rating or "use the month containing each order's date" logic. Decide exact approach once COGS cleanup data is in hand — likely: join COGS by `(SKU, month_of(order_date))` per order, not a single blended rate for the range.

## Build Sequence

1. **Prerequisite: COGS master cleanup** — fix missing/inconsistent SKU-month entries in the existing COGS sheet.
2. **Prerequisite: SnD master sheet → GCP ingestion** — get the weight-wise forward/reverse/fulfilment rate sheet into BigQuery (new sync job, pattern similar to existing sharepoint_to_gcp syncs).
3. **Backend**: build `api/pnl-shopify.js` (or similar) — one BQ query joining sales fact + item master (category/product identity, GST type) + COGS master (by SKU+month) + SnD weight master (by SKU weight slab) + existing ads spend source. Compute all 18 columns server-side, pre-aggregated by Category/Product for the requested date range.
4. **Frontend**: new PnL tab in `App.jsx` (or a new `src/pnl/` folder mirroring `src/inventory/` structure) — Shopify subtab first, financial view table component (likely reusing `DataTable` from `components.jsx`).
5. **Validate** Shopify numbers against known/manual truth (finance team sign-off).
6. **Replicate** to other channel subtabs (Amazon, other marketplaces) — same table shape, channel-specific fact table filters. Each channel may have its own fee nuances (e.g. Amazon referral fee) to fold into SnD or a new line — revisit per channel.
7. **Consolidated / brand-level subtab** — roll up all channels into one combined financial view table.

## Open Questions (revisit before/during build)

- COGS: fallback logic when a SKU has no month-matching cost entry.
- SnD weight master: actual weight-slab boundaries and rate table structure — need to see the sheet.
- Non-Shopify channels: marketplace-specific fees (referral fee, closing fee, etc.) — do these get folded into SnD, or need a new column? Decide per channel when we get there.
- Pro-rating logic for mid-month date ranges against month-wise COGS/SnD sources.
