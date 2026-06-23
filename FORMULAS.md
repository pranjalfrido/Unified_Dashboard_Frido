# Frido Dashboard — Formula Reference

All numbers shown in the dashboard are calculated from BigQuery order line-item rows.  
Each row = one SKU line in one order. Multiple rows share the same `OrderId` when an order has multiple items.

---

## Data Layer — How Raw Rows Become Orders

Before any KPI is calculated, rows are collapsed into **orders**:

| Field on Order | Source column | How |
|---|---|---|
| `rev` | `SellingPrice_Inc_GST` | Sum of all line rows for this `OrderId` |
| `excRev` | `SellingPrice_Exc_GST` | Sum of all line rows for this `OrderId` |
| `qty` | `ItemQty` | Sum of all line rows for this `OrderId` |
| `items` | — | Count of line rows for this `OrderId` (= number of distinct SKU lines) |
| `isRTO` | `is_rto = 1` | True if any line row has `is_rto = 1` |
| `isCIR` | `is_CIR_return = 1` | True if any line row has `is_CIR_return = 1` |
| `isCancelled` | `is_cancelled = 1` | True if any line row has `is_cancelled = 1` |
| `date` | `OrderDate` | First 10 chars (YYYY-MM-DD) |
| `deliverDate` | `Delivered_Date` | First 10 chars |

---

## Shared / Global Formulas (used everywhere)

| Name | Formula |
|---|---|
| **Total Gross Revenue** | `SUM(order.rev)` — includes GST |
| **Total Net Revenue** | `SUM(order.excRev)` — excludes GST |
| **GST Collected** | `Total Gross Revenue − Total Net Revenue` |
| **Total Orders** | `COUNT(distinct OrderIds)` |
| **Total Units** | `SUM(order.qty)` |
| **Blended AOV** | `Total Gross Revenue ÷ Total Orders` |
| **nDays** | Count of distinct `OrderDate` days in the selected range |
| **Daily Avg Revenue** | `Total Gross Revenue ÷ nDays` |

### Display formatting

| Range | Format |
|---|---|
| ≥ ₹1 Crore (10M) | `₹X.XX Cr` |
| ≥ ₹1 Lakh (100K) | `₹X.X L` |
| Below | `₹X,XX,XXX` (Indian locale) |

---

## Overview Tab

### Hero Card
| KPI | Formula |
|---|---|
| Gross Revenue | `SUM(order.rev)` |
| Net Revenue | `SUM(order.excRev)` |
| GST | `Gross − Net` |
| Days / Channels / Orders | Counts from filtered data |
| Daily Avg | `Gross Revenue ÷ nDays` |

### 4-column KPI row
| KPI | Formula |
|---|---|
| Orders / Units | `COUNT(orders)` / `SUM(qty)` |
| Units per Order | `SUM(qty) ÷ COUNT(orders)` |
| Blended AOV | `SUM(rev) ÷ COUNT(orders)` |
| Best AOV channel | Channel with highest `channel.rev ÷ channel.orders` |
| Unique Customers | `COUNT(distinct CustomerId)` |
| Repeat Rate | `COUNT(customers with ≥2 orders) ÷ COUNT(distinct CustomerId) × 100` |

### 7-KPI strip
| KPI | Formula |
|---|---|
| Daily Avg Revenue | `Gross Revenue ÷ nDays` |
| D2C Share | `Shopify.rev ÷ Total Gross Revenue × 100` |
| Repeat Rate | Same as above |
| Multi-item Rate | `COUNT(orders where items > 1) ÷ Total Orders × 100` |
| Q-commerce AOV | `(Blinkit.rev + Instamart.rev + Zepto.rev) ÷ (Blinkit.orders + Instamart.orders + Zepto.orders)` |
| Voucher Penetration | `COUNT(orders with voucher_code) ÷ Total Orders × 100` |
| High-ticket ≥₹10K | `COUNT(orders where rev ≥ 10,000)` |

### Channel Breakdown
| Metric | Formula |
|---|---|
| Channel Revenue | `SUM(order.rev)` for that channel |
| Channel % | `Channel.rev ÷ Total Gross Revenue × 100` |
| Bar width | `Channel.rev ÷ MAX(channel.rev across all channels) × 100` |

### D2C vs Marketplace Bar
| Metric | Formula |
|---|---|
| D2C % | `Shopify.rev ÷ Total Gross Revenue × 100` |
| Marketplace % | `100 − D2C%` |

### Channel Scorecard
| Column | Formula |
|---|---|
| Revenue | `channel.rev` |
| Orders | `channel.orders` |
| AOV | `channel.rev ÷ channel.orders` |

---

## Sales Tab — All Channels

### KPI Row 1 (original 5)
| KPI | Formula |
|---|---|
| Gross Revenue | `SUM(order.rev)` |
| Net (Exc GST) | `SUM(order.excRev)` |
| Orders / Units | `COUNT(orders)` / `SUM(qty)` |
| Blended AOV | `SUM(rev) ÷ COUNT(orders)` |
| Daily Avg | `Gross Revenue ÷ nDays` |

### KPI Row 2 (5 new KPIs)
| KPI | Formula |
|---|---|
| Gross Margin % | `(Gross Revenue − Net Revenue) ÷ Gross Revenue × 100` — this is actually the GST % of revenue, since net margin requires cost data |
| Revenue per Unit | `Gross Revenue ÷ Total Units sold` |
| Revenue at Risk | `SUM(rev of Shopify RTO orders) + SUM(rev of Shopify Cancelled orders)` |
| Fulfilment Rate | `COUNT(Delivered) ÷ (COUNT(Delivered) + COUNT(RTO) + COUNT(Cancelled)) × 100` |
| Units per Order | `Total Units ÷ Total Orders` |

### Category × Channel Heat Matrix
| Cell | Formula |
|---|---|
| Cell value | `SUM(SellingPrice_Inc_GST)` for rows matching that `Category` AND `Channel` |
| Colour intensity | `Cell value ÷ MAX(all cell values)` → classes h0/h1/h2/h3/h4 |

### Order Value Distribution (Buckets)
Orders are bucketed by `order.rev`:

| Bucket | Condition |
|---|---|
| `<₹500` | `rev < 500` |
| `₹500-1K` | `500 ≤ rev < 1,000` |
| `₹1K-2.5K` | `1,000 ≤ rev < 2,500` |
| `₹2.5K-5K` | `2,500 ≤ rev < 5,000` |
| `₹5K-10K` | `5,000 ≤ rev < 10,000` |
| `₹10K-25K` | `10,000 ≤ rev < 25,000` |
| `₹25K+` | `rev ≥ 25,000` |

### Category Revenue Table
| Column | Formula |
|---|---|
| Revenue | `SUM(SellingPrice_Inc_GST)` for all rows in that category |
| Exc GST | `SUM(SellingPrice_Exc_GST)` for that category |
| Orders | `COUNT(distinct OrderId)` in that category |
| AOV | `Category Revenue ÷ Category Orders` |

### State Revenue Table
| Column | Formula |
|---|---|
| Revenue | `SUM(order.rev)` for orders in that state |
| Orders | `COUNT(orders)` in that state |
| AOV | `State Revenue ÷ State Orders` |
| Cities | `COUNT(distinct City)` in that state |

---

## Sales Tab — Individual Channel (Shopify / Amazon / Blinkit etc.)

### KPI Row 1
| KPI | Formula |
|---|---|
| Revenue | `SUM(order.rev)` for that channel only |
| Orders | `COUNT(orders)` for that channel |
| AOV | `Channel Revenue ÷ Channel Orders` |
| Units | `SUM(order.qty)` for that channel |
| Daily Avg | `Channel Revenue ÷ nDays` |

### KPI Row 2
| KPI | Formula |
|---|---|
| Gross Margin % | `(Channel rev − Channel excRev) ÷ Channel rev × 100` |
| Revenue per Unit | `Channel rev ÷ Channel qty` |
| Revenue at Risk | Shopify only: `SUM(rev of RTO orders) + SUM(rev of Cancelled orders)` · "N/A" for other channels |
| Fulfilment Rate | `Delivered ÷ (Delivered + RTO + Cancelled) × 100` using that channel's orders |
| Units per Order | `Channel qty ÷ Channel orders` |

### Order Status Bar
| Metric | Formula |
|---|---|
| Count per status | `COUNT(orders where orderStatus = X)` |
| Bar width | `Status count ÷ Channel total orders × 100` |
| % label | `Status count ÷ Channel total orders × 100` |

---

## Sales Tab — Quick Commerce (QC)

Aggregates Blinkit + Instamart + Zepto together.

| KPI | Formula |
|---|---|
| QC Revenue | `Blinkit.rev + Instamart.rev + Zepto.rev` |
| Orders | `Blinkit.orders + Instamart.orders + Zepto.orders` |
| Blended AOV | `QC Revenue ÷ QC Orders` |
| Best Platform | Platform with highest `rev` among the 3 |
| QC Rev Share | `QC Revenue ÷ Total Gross Revenue × 100` |

---

## Sales Tab — Operations

| KPI | Formula |
|---|---|
| Avg Delivery TAT | `MEAN( (Delivered_Date − OrderDate) in days )` · Only orders where both dates exist · Capped at 0–60 days |
| Orders Tracked | Count of orders with both `OrderDate` and `Delivered_Date` |
| Delayed >7d | `COUNT(TAT > 7 days)` |
| Cities Covered | `COUNT(distinct City)` across all orders |

### TAT Buckets
| Bucket | Condition on TAT (days) |
|---|---|
| Same day | `TAT = 0` |
| 1-2 days | `1 ≤ TAT ≤ 2` |
| 3-5 days | `3 ≤ TAT ≤ 5` |
| 6-7 days | `6 ≤ TAT ≤ 7` |
| 8-14 days | `8 ≤ TAT ≤ 14` |
| 15+ days | `TAT ≥ 15` |

---

## Sales Tab — Customers (CX)

| KPI | Formula |
|---|---|
| Unique Customers | `COUNT(distinct CustomerId)` |
| Repeat Rate | `COUNT(customers with ≥2 orders) ÷ Unique Customers × 100` |
| 2× Buyers | `COUNT(customers with exactly or more than 2 orders)` |
| 3×+ Buyers | `COUNT(customers with ≥3 orders)` |
| Voucher Penetration | `COUNT(orders with a voucher_code) ÷ Total Orders × 100` |

### Voucher Classification
Voucher codes are bucketed by keyword match:

| Bucket | Rule |
|---|---|
| No voucher | `voucher_code` is empty |
| PREPAID-DISCOUNT | code contains "PREPAID" (case-insensitive) |
| Loyalty (PLM) | code contains "PLM" |
| Repeat (FRV) | code contains "FRV" |
| Other/custom | anything else |

### Voucher Table
| Column | Formula |
|---|---|
| Orders | `COUNT(orders)` in that voucher bucket |
| Revenue | `SUM(order.rev)` in that bucket |
| AOV | `Bucket Revenue ÷ Bucket Orders` |

---

## Intelligence Tab

### Summary Strip (6 metrics)
| Metric | Formula |
|---|---|
| Gross Revenue | `SUM(order.rev)` |
| GST Collected | `Gross Revenue − Net Revenue` |
| Repeat Rate | `Repeat customers ÷ Unique customers × 100` |
| QC Share | `(Blinkit + Instamart + Zepto revenue) ÷ Total Revenue × 100` |
| Voucher Orders | `COUNT(orders with voucher) ÷ Total Orders × 100` |
| Trend (½ period) | `(Second-half revenue − First-half revenue) ÷ First-half revenue × 100` · Period split at midpoint of unique dates |

### Intel Card 1 — Customer Retention Crisis
| Metric | Formula |
|---|---|
| Headline % | `Repeat customers ÷ Unique customers × 100` |
| 1× buyers | `Unique customers − Repeat customers` |
| 2× buyers | `COUNT(customers with ≥2 orders)` |
| 3×+ buyers | `COUNT(customers with ≥3 orders)` |
| Revenue opportunity | `(0.10 − repeat_rate) × Unique customers × (Total Revenue ÷ Total Orders)` — estimated lift if repeat rate improves to 10% |

### Intel Card 2 — Q-Commerce Opportunity
| Metric | Formula |
|---|---|
| QC Revenue | `Blinkit.rev + Instamart.rev + Zepto.rev` |
| QC AOV | `QC Revenue ÷ QC Orders` |
| AOV multiple | `QC AOV ÷ Blended AOV` |
| Platform bars | Each platform's `rev ÷ QC total revenue × 100` |
| Gap detection | For top 5 categories: check if that category has `SUM(rev) = 0` on each QC channel → flagged as missing |

### Intel Card 3 — Voucher & Discount Drag
| Metric | Formula |
|---|---|
| Voucher penetration | `COUNT(vouchered orders) ÷ Total Orders × 100` |
| Vouchered AOV | `SUM(rev of vouchered orders) ÷ COUNT(vouchered orders)` |
| Non-vouchered AOV | `SUM(rev of non-vouchered orders) ÷ COUNT(non-vouchered orders)` |
| AOV Drag | `Non-vouchered AOV − Vouchered AOV` |
| Bars | Top 5 voucher buckets: `bucket.rev ÷ Total Revenue × 100` |

### Intel Card 4 — Revenue Concentration (Pareto)
| Metric | Formula |
|---|---|
| Headline % | `Top 1% orders revenue ÷ Total Revenue × 100` |
| Top 1% orders | `CEIL(Total Orders × 0.01)` orders sorted by `rev` descending |
| Top 10% orders | `CEIL(Total Orders × 0.10)` orders sorted by `rev` descending |
| Bottom 50% | Orders from rank `CEIL(50%)` onward |
| Bar % | Each group's `rev ÷ Total Revenue × 100` |

### Intel Card 5 — Returns & RTO (Shopify Only)
| Metric | Formula |
|---|---|
| RTO Rate | `COUNT(Shopify orders where isRTO=true) ÷ COUNT(Shopify orders) × 100` |
| CIR Rate | `COUNT(Shopify orders where isCIR=true) ÷ COUNT(Shopify orders) × 100` |
| Cancelled % | `COUNT(Shopify orders where isCancelled=true) ÷ COUNT(Shopify orders) × 100` |
| Savings per 1% RTO reduction | `COUNT(Shopify orders) × 0.01 × Blended AOV` |

### Intel Card 6 — Basket & Multi-item Intelligence
| Metric | Formula |
|---|---|
| Multi-item rate | `COUNT(orders where items > 1) ÷ Total Orders × 100` |
| Multi-item AOV | `SUM(rev of multi-item orders) ÷ COUNT(multi-item orders)` |
| Single-item AOV | `SUM(rev of single-item orders) ÷ COUNT(single-item orders)` |
| AOV premium | `(Multi-item AOV − Single-item AOV) ÷ Single-item AOV × 100` |
| Bars | Top 5 states by revenue: `state.rev ÷ Total Revenue × 100` |

### Period Trend Signal
| Metric | Formula |
|---|---|
| First-half revenue | `SUM(rev)` for orders on dates in the first 50% of unique dates |
| Second-half revenue | `SUM(rev)` for orders on dates in the last 50% of unique dates |
| Trend % | `(Second-half − First-half) ÷ First-half × 100` |

---

## Automated Alerts (Overview Tab)

Alerts fire automatically based on these rules:

| Alert | Trigger | Type |
|---|---|---|
| Revenue declining | `(Second-half rev − First-half rev) ÷ First-half rev < −10%` | 🔴 Red |
| Blinkit GST broken | `(Inc_GST − Exc_GST) ÷ Exc_GST > 50%` on Blinkit rows | 🔴 Red |
| CRED feed gap | Any day where CRED revenue `< 20%` of daily mean across the period | 🔴 Red |
| CIR returns high | `CIR returns ÷ Shopify orders > 10%` | 🟡 Amber |
| Repeat rate low | `Repeat customers ÷ Unique customers < 10%` | 🟡 Amber |
| Q-commerce AOV high | `QC AOV > ₹3,000` — opportunity signal | 🟢 Green |

---

## Filters — How They Affect Numbers

Filters narrow the **raw rows** dataset, then all formulas re-run on the filtered set.

| Filter | How applied |
|---|---|
| Date range | Only rows where `OrderDate` falls within `[start, end]` (applied in BigQuery query) |
| Category | Only rows where `Category = selected` |
| State | Only rows where `State = selected` (case-insensitive) |
| SKU / ProductId | Only rows where `ProductId` contains the search term |

> Filters are applied before `processData()` so every KPI, chart, and table reflects the filtered subset.

---

## Column Reference (BigQuery source table)

| Column | Used for |
|---|---|
| `OrderId` | Grouping rows into orders |
| `OrderDate` | Date filtering, TAT calculation, daily trend |
| `Channel` | Channel breakdown, QC grouping |
| `SellingPrice_Inc_GST` | All revenue KPIs (gross) |
| `SellingPrice_Exc_GST` | Net revenue, margin calculations |
| `ItemQty` | Unit counts |
| `Category` / `SubCategory` | Category tables, heat matrix |
| `State` / `City` | Geography tables |
| `CustomerId` | Repeat rate, customer frequency |
| `voucher_code` | Voucher analysis |
| `Order_Status` | Fulfilment rate |
| `Delivered_Date` | TAT calculation |
| `Dispatch_Date` | Ops tracking |
| `is_rto` | RTO flags (1 = yes) |
| `is_CIR_return` | Customer-initiated return flag |
| `is_cancelled` | Cancellation flag |
| `is_exchange` | Exchange flag |
| `GST_Tax_Type_Code` | GST type breakdown |
| `ProductId` | SKU-level filtering and QC product tables |
