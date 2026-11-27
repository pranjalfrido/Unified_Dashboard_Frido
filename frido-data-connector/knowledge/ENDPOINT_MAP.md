# Endpoint map — which dashboard endpoint answers which question

Use the `dashboard_api` tool. `endpoint` = the name below, `params` = the request body the page sends, `paths` = dot-paths into the response ("a.b", "rows.*.sku"; `*` walks every element), `groupBy`/`sum`/`sortBy`/`limit`/`where` aggregate array rows. `describe:true` shows the response structure. Static files (inv-data-7d, logistics-data-forward, logistics-cost-data, pnl-data-lastmonth, sales-alloc-data, inward-data, ads-data …) take no params. The first call for given params can take up to ~90 s (then cached 30 min).
Dates are IST. Money fields come back already formatted (₹ Cr/L) with the raw value; copy the formatted value.
**Known broken/unavailable (say so, do not invent):** `/api/logistics` fails only in a daily window (about 09:00-10:25 IST, when a legacy scheduled query rewrites the Clickpost table and the column `zone_by_frido` goes missing); outside that window it works, inside it use the `logistics-data-*` files → Logistics → Performance numbers come from the `logistics-data-*` files; `/api/logistics-cost` times out → use `logistics-cost-data`; `/api/financial-mis` is not deployed; Customer Support has no ticket-status split. `/api/financial-mis` and the Financial MIS tab were removed from the dashboard (30 Oct), do not use them. **Access:** the dashboard sits behind a login wall; NavAI reads the data endpoints and `.json` files with its own read-only secret, and every tool answers only from pages the asking person can open (their tabs come from api/pulse.js). A refusal message means "ask your admin for access"; never work around it with custom SQL. **Inward** is only the new Inward page's `/api/inward` (Group 3b); the old `inward-data` file is gone.
If a figure is marked **browser-computed**, compute it from the response fields with the formula given. Own SQL is only for questions no endpoint answers (label it `Custom analysis, not from the dashboard:`).

## Group 1 — Logistics → Performance

**Status:** `POST /api/logistics` returns 500 in production today (`zone_by_frido` column missing), so the `logistics` endpoint cannot be called by `dashboard_api`. Sources that work: (1) the **locked Clickpost SQL template in CLAUDE.md ("EXACT SQL for Logistics Performance")** — use it for any date range (this is what produced RTO 8.2%, delivery 90.7%, TAT, EDD breach, NDR in the tests); (2) the static files `logistics-data-forward` (and `-cod`, `-prepaid`, `logistics-data`, `logistics-data-reverse`), which the page reads when the date range matches — run `describe:true` and check the range in the file (`mtdStart`/`mtdEnd`/`asOf`) before using it; same response shape as the endpoint. **Zone data is meaningless today:** Clickpost's own zone column is 100% NULL and the page's zone slices put everything in zone "D" — say zone-wise delivery/RTO is not reliable instead of quoting it.

Filters (request body / SQL): `start`,`end` (shipment CREATED date), `shipmentType` (`forward`|`reverse`|`all`; page default forward), `courier` (array), `sddNdd`, `paymentMode` (`COD`|`PREPAID`), `pickupState`,`dropState`,`dropCity`,`category`,`subCategory`, `weightSlabs` (`0-500g`,`500g-1kg`,`1-2kg`,`2-5kg`,`5-10kg`,`10-20kg`,`20-50kg`,`50kg+`).

| Metric | Path | Formula / Sep 2026 forward |
|---|---|---|
| Shipments / delivered / RTO | `kpis.total_shipments`, `kpis.delivered`, `kpis.rto` | 2,28,645 / 2,07,285 / 18,695 |
| **Delivery % and RTO %** (browser) | — | delivered ÷ total = 90.66%; rto ÷ total = 8.18% |
| In-transit / pickup pending / cancelled / lost+damaged | `kpis.in_transit`, `pickup_pending`, `cancelled`, `lost_damaged` | 1,673 / 279 / 557 / 103 |
| TAT (days) | `kpis.avg_intransit` (pickup→delivery), `avg_fulfilment` (order→delivery), `avg_pickup`, `avg_processing`, `avg_rto_tat`, `avg_s2a` | in-transit 3.13–3.14 d, fulfilment 5.27 d |
| **EDD breach %** (browser) | `sla_breach` ÷ (`on_time` + `sla_breach`) — delivered shipments only | 20,660 ÷ (1,72,903 + 20,660) = 10.67% |
| Open EDD breached / critical stuck / RTO undelivered >10 d | `kpis.edd_breached`, `kpis.critical_stuck`, `kpis.rto_10plus` | 1,989 / 1,590 / 389 |
| NDR | `kpis.ndr_count` (≥2 attempts) and `ndrByCourier.*` (≥1 failed attempt tab definition: 38,460 = 16.8%); `ndr_denom_attempted` | NDR % computed in the browser; give both definitions |
| By courier | `byCourier.*` (`courier_group,total,delivered,rto,on_time,sla_breach,avg_intransit_days,…`) | Bluedart 1,44,909 / 1,30,912 delivered (90.34%) / 12,608 RTO (8.70%), EDD breach 12.1%, TAT 3.43 d |
| By weight slab | `byWeightSlab.*` `groupBy:'slab'`, `sum:['total','rto','delivered']`; recompute % from sums | |
| Payment mode | `byPaymentDetail.*` | COD 67,131; PREPAID 1,61,514 |
| Drop state / city | `topDropStates.*`, `topDropCities.*` (counts only; RTO per state needs the `dropState` filter) | |
| Daily / weekly / monthly trend | `byDay.*`, `byWeek.*`, `byMonth.*` (`rto_pct` already a %) | |
| TAT buckets | `tatByCourier.*` (`bucket_0_1`,`bucket_2_3`,`bucket_4_5`,`bucket_5plus`) share = bucket ÷ delivered (browser) | |
| RTO reasons / ageing | `rtoReasons.*`, `rtoAgeing.*` (`0_1`,`2_4`,`5_7`,`8_10`,`10plus` days) | |
| Failed-delivery reasons | `failedDeliveryReasons.*` | |

Browser-computed here: Delivery %, RTO %, Z-RTO %, FASR (`delivered_1attempt` ÷ `total_ofd_attempts`), EDD breach % (table), NDR %, TAT-bucket shares, "SLA breach" card (`sla_breach` ÷ total — different denominator from the table).

## Group 2 — Logistics → Cost

**Month totals (fixed 26 Oct):** with the page on "All" months, FTL/PTL (`b2bMonths`) and 3PL (`tplMonths`, `tplWhMonths`) totals are the sum over **all** months; sum the rows yourself and never read one month's row as the total. **Use the static file `logistics-cost-data` (what the page loads first; Jan–Sep 2026, all months in one file).** The live `/api/logistics-cost` times out (500 after ~150 s) — do not call it. The file's top-level aggregates (`totals`, `byZone`, `byCourier`, `byMode`, `slabCosts`) are ALL-TIME; **for a month always read the flat rows and filter by month with `where`**. All costs are ex-GST ₹; weights kg. Per-shipment and per-kg figures are computed in the browser = `cost ÷ n` and `cost ÷ wt` (do the same from the summed rows).
Row sources (check with `describe:true`):
- `cube` rows `{courier_name, zone, mode, month, payment, acct, is_overbilled, slab, band, n, cost, wt, decl_wt, value, surcharge, over_n}` — B2C by month. Use `paths:['cube']`, `where:{month:'2026-09'}`, `groupBy:<zone|courier_name|mode|payment|slab|band>`, `sum:['n','cost','wt','value','surcharge']`.
- `b2bMonths` `{key,trips,cost}` (FTL/PTL by month), `b2bVehicles` `{month_year,vehicle,transporter,freight_type,trips,billed}`, `b2bTransMonths` `{month,transporter,vehicle,freight_type,trips,billed}`.
- `tplWhMonths` `{warehouse,pincode,partner,month_year,cost,operation_fee,rental_fee,other_fee,shipments,weight_kg}` (3PL by month and site), `tplMonths` `{key,cost,…,shipments}`.
- `byMonth` `{key,n,cost,wt,value}` (B2C month-on-month), `trendAll` `{month_year,courier_name,n,cost,…}` (courier by month).

| Question | How (Sep 2026) | Verified value |
|---|---|---|
| B2C freight | `cube` where month, `sum:['cost']` | ₹2.34 Cr (2,34,10,881) |
| B2C cost per shipment / per kg | cost ÷ n, cost ÷ wt from the same sums | ₹91.39 over 2,56,166 shipments; ₹42.29/kg (5,53,641 kg billed) |
| % of GMV (B2C) | cost ÷ `value` | 5.68% (GMV ₹41.24 Cr) |
| Surcharges | `sum:['surcharge']` | ₹69.40 L (29.65% of cost) |
| **Zone-wise shipment cost** | `cube` where month, `groupBy:'zone'`, `sum:['n','cost','wt']`, then ÷ | A 34,529 · ₹20.40 L · ₹59.09/ship · ₹29.86/kg; B 27,732 · ₹26.12 L · ₹94.19 · ₹30.96; C 31,910 · ₹31.28 L · ₹98.04 · ₹38.83; D 1,52,018 · ₹1.44 Cr · ₹94.50 · ₹47.97; E 9,977 · ₹12.65 L · ₹126.77 · ₹60.45 (sums to 2,56,166 / ₹2.34 Cr) |
| By courier | `groupBy:'courier_name'` | Bluedart 1,62,018 · ₹1.37 Cr · ₹84.29; Delhivery 60,598 · ₹68.08 L · ₹112.34; ElasticRun 21,462 · ₹14.11 L · ₹65.73; Swift 9,341 · ₹13.57 L · ₹145.28 |
| By mode / payment / weight band | `groupBy:'mode'` (Forward, Reverse, RTO), `'payment'` (case variants are separate values — add Prepaid/PREPAID/prepaid/Pre-paid), `'band'`/`'slab'` | Forward ₹1.875 Cr, Reverse ₹35.50 L, RTO ₹11.08 L |
| **Wasted freight on returns** (browser) | mode ≠ Forward: sum of Reverse + RTO `cost` and `n` | ₹46.58 L (35,49,680 + 11,08,124), 44,719 legs, 19.9% of B2C cost |
| FTL/PTL cost and trips | `b2bMonths` where `key:'2026-09'` | ₹60.48 L, 403 trips (avg ₹15,010/trip) |
| FTL/PTL by vehicle / freight type / transporter | `b2bVehicles` where `month_year:'2026-09'` `groupBy:'vehicle'|'freight_type'`, `sum:['trips','billed']`; `b2bTransMonths` where `month:'2026-09'` `groupBy:'transporter'` | FTL 350 trips ₹57.55 L; FTL/PTL 53 trips ₹2.94 L |
| 3PL warehousing total / by partner / by site | `tplWhMonths` where `month_year:'2026-09'`, `sum:['cost']`, `groupBy:'partner'|'warehouse'` | ₹57.77 L; Hexalog ₹38.46 L, Beyond Sqfeet ₹8.32 L, Aaj SCM ₹5.50 L, Losung ₹5.49 L |
| **Total logistics cost (Overview)** (browser) | B2C cost + `b2bMonths` cost + Σ `tplWhMonths` cost | ₹3.52 Cr = 2,34,10,881 + 60,48,500 + 57,76,886.5; 8.54% of B2C GMV |
| Month on month | `byMonth`, `trendAll`, `b2bMonths`, `tplMonths` | |
Caveats: Sep claimable figures are not meaningful (rate card not applied to Sep invoices; claims register empty); origin/destination-city cost has no per-city rows in the file (only the API with filters, which times out) — say it is not available.


## Group 2b — Logistics → Cost Analytics → "CN Received" (the `cn_received` tool, merged 18 Nov 2026)

The **CN Received** button (top right of Cost Analytics → Overview) opens `/logistics/cn_received`. It has **no `/api` endpoint and no data file**: the browser calls the read-only Supabase function `cn_received_summary()` and adds up its rows (`src/cn/cnReceived.js`). Use the **`cn_received` tool**, which runs the same query (SELECT only, read-only transaction, active rows only) and the same arithmetic. It cannot write: uploads and approvals live on the separate Documents → Logistics credit notes pages (`logistics-cn`), which NavAI does not touch.

**Who may ask:** anyone who can open the page, i.e. admins and users with a Cost Analytics permission (`logistics:cost` or any `logistics:cost:*`). Others are refused ("ask your admin for access"); do not work around it with custom SQL.

**What the page shows (totals only):** CN count, invoice value, **received CN**, **received % of invoice**, by format (B2C couriers, FTL/PTL, 3PL), by reason (weight dispute, lost/damage, SLA breach, high ageing, wrong invoicing, wrong billing = all FTL/PTL and 3PL CNs), by partner (top partners by received CN) and by invoice month. The invoice month is the month on the CN row, not the date it was received. Invoice value is blank for lost/damage, SLA breach, high ageing and wrong invoicing (claims against a shipment value), so their "% of invoice" is "—". `expected_cn` (the amount uploaded as expected) is only in the page's Excel export; the tool returns it as `expected_cn` and a derived `expected_minus_received` — label that as "from the page's export, not shown on screen".

**Not on this page (say so, never invent):** individual credit notes, which are still open or pending, ageing of credit notes, per-CN lists. Questions like "top 5 open CNs" or "ageing of pending CNs" get that answer plus what the page does show (by partner / by reason).

**Months:** data runs through the latest uploaded invoice month (Sep 2026 on 24 Nov 2026; Oct 2026 not uploaded yet). If "last month" has no rows, say so and offer the latest month the tool lists.

| Question | Tool call | Check value (24 Nov 2026) |
|---|---|---|
| CN count and ₹ received for a month | `cn_received {month:"2026-09"}` TOTAL | Sep 2026: 311 CNs, received ₹5.13 L (raw 512664); invoice value "—" (all B2C claims) |
| Received vs invoice (CN vs claimed) | `cn_received {}` BY FORMAT | all months: B2C ₹2.92 Cr of ₹30.82 Cr invoice (9.5%); FTL/PTL ₹7,500 of ₹4.32 Cr (0.0%); 3PL ₹2.31 L of ₹77.81 L (3.0%); total ₹2.94 Cr of ₹35.92 Cr (8.2%) |
| Top partners by received CN | BY PARTNER | all months: Swift ₹1.71 Cr, Bluedart ₹1.08 Cr, Ekart ₹6.35 L, Delhivery ₹3.97 L, Hexalog ₹1.75 L |
| Received by reason | BY REASON | Sep 2026: High ageing ₹2.48 L (153), Lost/Damage ₹1.70 L (147), Wrong invoicing ₹93,837 (3), SLA breach ₹532 (8) |
| Expected vs received by courier (not on screen) | BY PARTNER `expected_minus_received` | all months: Bluedart ₹68.08 L, Swift ₹20.05 L, Ekart ₹23.44 L, Shadowfax ₹17.69 L |

## Group 3 — Inventory tab (example values are from the 29 Oct file snapshot; formulas updated 23 Nov 2026)

| Tab | Source | Notes |
|---|---|---|
| Inventory Health | file `inv-data-7d` (also `15d`, `30d`; the avg-sale toggle just selects the file) | Hourly cron. Page falls back to POST `/api/inventory` `{start,end,avgSaleWindowDays,…}` if the file is older than 2 h. |
| Sales & Allocation | file `sales-alloc-data` or POST `/api/sales-allocation` `{start,end,category,subCategory,sku,channel,salesType,facility,region,…}` | Momentum and avg sale are anchored on the **last complete day** (latest sales date minus 1), since 4 Nov. |
| Inward | POST `/api/inward` only (new page, see Group 3b) | The old `inward-data` file and legacy GRN report are gone. |
| OOS loss | use the `oos_loss` tool | |

| Question | How |
|---|---|
| **Total inventory (Regular view = what the page tile shows)** | `inv-data-7d` with `regular:true` → TOTAL 8,49,795 at that snapshot (PNQ 4,32,025; GGN 2,37,552; KOL 53,547; MUM 49,323; HYD 45,077; BLR 31,179; CHN 1,092). Do NOT use `summary.totalInvt` (all facility types, 8,70,247). Also path `facilityTypeSummary` (groupBy `facilityType`, sum `totalInvt`). |
| **Stock of one SKU per warehouse** | `inv-data-7d` with `regular:{sku:'FR-OPC-M1'}` → PNQ 9,059; KOL 2,870; BLR 912; MUM 402; GGN 23 (total 13,266). |
| Avg sale | `summary.avgSaleB2C` (B2C/day, the "Avg Sale (B2C)" tile), `summary.totalAvgSale` (all sales types). Window = the file (7/15/30) and **ends on the last complete day (latest sales date minus 1)**, not the partial current day. **B2C = every Frido-fulfilled B2C channel** (Shopify, CRED, Amazon, Flipkart, Myntra, Blinkit, Zepto, Instamart: all channels mapped to B2C Order, not Shopify only). Since 23 Nov a SKU's company-wide avg sale counts **all** B2C orders for that SKU whichever warehouse shipped them (before, only warehouses holding stock were counted, so multi-warehouse SKUs such as W1 / Neck WoC / Lumbo read lower than the Sales tab DRR). The live fallback `/api/inventory` still uses the old per-warehouse sum, so the static `inv-data-*` files are the reference. Avg sale per SKU is still rounded up (ceil) in the files until the rounding fix is merged, so small SKUs can read slightly high. |
| Avg sale with a facility slicer (since 25 Nov) | When the Inventory Health page narrows to a facility / facility type, the SKU's avg sale stays the **company-wide SKU avg sale** (all warehouses), not the sum of the remaining locations; stock is the facility-exact units. |
| DOI | `summary.doi` (company-wide, all facility types). SKU: `skus` rows `{sku,doi,stockStatus,avgSale,…}`. Server formula: doi = floor(totalInvt / ceil(max(avgSale, orderAllocation))). |
| Critical / Low / … SKUs | path `skus` with `where:{stockStatus:'Critical'}`, `sortBy:'doi'`, `desc:false`, `limit`. Counts: `statusBreakdown` rows `{status,count}`. Bands: ≤2 Critical, ≤15 Low, ≤45 Sufficient, else Excess; Out of Stock / No Demand / Dead (No Sale) are separate. **Note: SKU `totalInvt`/`doi` here are company-wide (all facility types).** |
| Lead-time risk | path `leadTimeRisk` (top 20: sku, leadTime, doi, stockStatus, avgSale). |
| Slow moving / dead stock | `slowMoving`, `deadStock` (sub-category roll-ups); SKU dead = `skus` `where:{isDead:true}`; counts `summary.deadStockCount`, `summary.deadStockUnits`. |
| Stock by location (all types) | path `locations` (location,totalInvt,rtdInvt,rawInvt,rawBlockedInvt,avgSale,doi,stockStatus). Regular only → `regular:true`. |
| Sales by warehouse | `sales-alloc-data` path `facilityAllocation` (location,qty,qtyPerDay,rev,sharePct); fill rate `fillRateByWarehouse` (fraction 0–1). Products `productSales`, categories `categorySales`. |
| Inward by vendor / facility / week / SKU | `/api/inward`, see Group 3b. |

**Browser-computed (InventoryHealthPage.jsx):** Regular KPI tiles = Σ over `skus[].facilities[]` where facilityType = Regular (equals `facilityTypeSummary` Regular with no slicers; `regular:true` reproduces it); warehouse cards use Regular stock but company-wide avgSale/DOI; detail table footer `doi = floor(totalInvt / ceil(max(sumAvgSale, sumOrderAllocation)))`.

## Group 3b — Inventory → Inward (`inward`, POST `/api/inward`, new page, merged 23 Nov 2026)

**Body** `{start,end, warehouse[], sourceType[], vendor[], category[], subCategory[], sku}`; all filters optional and applied on cached rows. Drill-downs: `{mode:'sku'|'vendor'|'subcat', sku|vendor|subCategory}` = that SKU / vendor / sub-category's **last 10 distinct GRN days** (full history, not range-bound; vendor mode with `start,end` also returns `skusSupplied` for the range). Range max 800 days; data starts 2025-04-01. The Data quality panel and `dq_export` are admin-only and not available to NavAI.

**Scope, say this whenever you quote a total: finished goods only.** GRN lines whose code is raw material / packaging (PKG codes) or is not in the SKU master are **dropped from every number** (they appear only in the admin Data quality panel); `meta.excludedPkgUnits` = units dropped as packaging in the range. Internal (intra-company transfer) GRNs, the Vadgaon traceability facility and "WRONG" invoices are excluded. Source: `production.unicommerce_grn_refined`; `_RAW_PO<n>` codes multiply units by the pack quantity n.

| Question | Path / how |
|---|---|
| **Inward units, GRNs, SKUs, vendors** | `kpis.cur.units`, `.grns`, `.skus`, `.vendors`; previous equal period (same number of days ending the day before `start`) in `kpis.prev.*`. |
| **Rejected units / rejection %** | `kpis.cur.rejected`, `kpis.cur.rejectionPct` = rejected / (received + rejected) x 100. |
| **Inward / sales** | `kpis.cur.ratio` = inward units / sales units in the same period (`kpis.cur.salesUnits`); above 1 stock is building, below 1 draining; `null` with no sales. |
| **New SKUs** | `kpis.cur.newSkus` = SKUs whose first-ever inward date (full history) is inside the range. |
| **Source type split** (Domestic / Import / Inhouse / Unmapped) | `sourceMix` rows `{sourceType, units, grns, avgGrnSize, share}`. "Unmapped" = vendor name missing from vendor_mapping (still counted so totals reconcile). |
| **Inward value in rupees** | **Browser-computed, not in the response.** = sum over `skuMonthly` rows (`{sku, month, units}`) of units x that SKU's COGS for that month. Rate from `POST /api/cogs-monthly {skus, startMonth, endMonth}` (`product_cogs_monthly`: the SKU's real row, else the sub-category average; **no ASP fallback**); SKUs with no COGS are skipped and counted as "without COGS". The previous period uses `prevSkuMonthly`. Label it "inward value at COGS". |
| **By vendor** | `vendors` rows (`vendor, sourceType, grns, units, skus`); every vendor ever used, lifetime totals and last GRN date, in `vendorMaster`. |
| **By SKU / sub-category** | `skus` rows (`sku, name, category, subCategory, units, rejected, grns, lastInward, salesUnits`); every SKU in the master with its last-ever inward date, quantity and vendors in `masterSkus`. |
| **By warehouse** | use the `warehouse` filter (locations in `filterOptions.warehouses`). |
| **Daily trend** | `daily` rows `{date, total, sales, ...per source type}`. |
| **Last 10 GRN days of a SKU / vendor / sub-category** | the `mode` calls above. |
| **Days of inventory (DOI) of a SKU** | Not an Inward field: use Inventory Health (`inv-data-7d`), DOI = floor(stock / ceil(max(avg sale, order allocation))) with the **7-day** B2C avg sale. |
| **Latest inward / sales date** | `meta.lastGrnDate`, `meta.lastSalesDate`. |

Quote `meta.notes` when present (for example "Sales are not filtered by vendor or source type"). Received and rejected quantities now work; the old "shows 0" problem belonged to the retired legacy GRN report.

## Group 3c — Inventory Health → "Inventory cost detail" card (the `inventory_cost` tool, released 26 Nov 2026, permission `inventory:cost`)

The card values the Inventory Health SKU list at cost. Use the **`inventory_cost` tool** (it reads the same two sources the card reads and applies the card's own rule; every total and count is calculated by the tool). Do not rebuild it with `run_command`.

| Item | Rule |
|---|---|
| **Stock** | Inventory Health file `inv-data-7d`, **Regular facilities only** (the page's default Regular view, sum of each SKU's `facilities` with `facilityType = Regular`). |
| **COGS per unit** | `POST /api/cogs-monthly` (`product_cogs_monthly`): each SKU's **latest month with a cost**. Today Jun–Sep 2026 are real uploads; Oct and Nov are **carried forward from Sep 2026**. The card says "COGS rates: Sep 2026, carried forward"; say the same. |
| **Valuation of one SKU** | own COGS x units; else the **average COGS of the SKU's sub-category** x units; else **not valued** (shown as Missing, counted as ₹0). |
| **Counts** | **SKUs with stock > 0 only.** The laptop table also lists zero-stock SKUs, so its row count is higher; the value and units are the same either way. |
| **Product** | all SKUs with the same sub-category name (SKU-master `Sub_category`). Value, units and avg sale are sums; DOI = floor(units / avg sale); "No Demand" when avg sale is 0. |
| **Status bands** (same as Inventory Health) | Critical <= 2 days, Low <= 15, Sufficient <= 45, else Excess. |
| **Avg sale** | the Inventory Health B2C avg sale of the file window (7 days), company-wide for the SKU since 23 Nov (all warehouses). |

| Question | Tool call |
|---|---|
| Total inventory value / units / SKUs with stock / how many have no COGS | `inventory_cost {by:'summary'}` |
| Value by product / category / SKU, top N, DOI and status | `inventory_cost {by:'product'|'category'|'sku', sortBy, limit}`; add `category`, `product` (the exact sub-category from the Product match block), `sku` or `status` to filter |
| Which SKUs have no COGS / what are they valued at | `inventory_cost {by:'no_cogs'}` (sub-category-average SKUs and not-valued SKUs, with units, value, why and fix) |
| Which COGS month is used | the first lines of every `inventory_cost` result |

**The card cannot answer:** value at a past date (it is today's stock), value by warehouse or facility type other than Regular, value at ASP or selling price, the effect of a COGS change before it is uploaded, per-SKU COGS history, or anything about Other / Dark Store facilities. Say so and offer what it does show. The tool needs the `inventory:cost` permission (admins always); without it NavAI says the user has no access to Inventory Health → Inventory cost detail.

## Group 3d — Inventory opportunity: push for sale / liquidate (the `inventory_opportunity` tool, permission `inventory:cost`)
Not a page: an analysis on the Inventory Health data. Stock = Regular facilities (inv-data files), valued like the Inventory cost card (own COGS, else sub-category average, else "No COGS"). Avg daily sale: B2C from the Inventory Health files for 7 / 15 / 30 days (as the page), from the consumer-channel sales table for 60 / 90 days. Excess = max(0, stock - cover_days x avg sale); excess value = excess x COGS per unit; DOI = floor(stock / avg). ASP = SellingPrice_Exc_GST / units over the last 90 days (after discounts, before cancellations / returns); margin per unit = ASP - COGS; max discount before loss % = margin / ASP. Excluded and listed by name: never-live SKUs (never sold), categories Spare Parts and Covers and sub-categories with "cover" in the name (defaults in `knowledge/liquidation-config.json`, which also holds the other defaults). Mobility and Ergo Furniture are a separate high-value list. SKUs without COGS are a separate "No COGS" list. Settings (all changeable in the chat): cover_days 60, top_n 20, channel b2c / all, sales_days 30, min_doi none, rank_by excess_value / doi / stock_value, include / exclude categories and sub-categories, the high-value group. The Excel has the sub-category summaries, every SKU with all columns and the No COGS SKUs. **Cannot do:** valuation at selling price for stock without sales (ASP n/a), 60/90-day figures for the Inventory Health page itself, anything on Other / Dark Store stock.

## Group 5 — P&L (other channels), Ads, Customers, Support (Sep 2026 values)

**P&L:** `/api/bq {start,end}` only holds revenue-side facts per channel (`chMap.<Channel>.{rev,excRev,orders,qty,returnRev}`, `flipkart.totals`, `myntra.totals`, `ebo.totals`/`ebo.storeRows`, `blinkit/zepto/instamart/cred/firstcry.totals`, `offline.totalsBySub`, `pnlSalesRows`, `pnlRawAdSpend` 77,617,165). **Net revenue, COGS, CM1, CM2, COGS %, CM1 %, marketing % are browser-computed → use the `pnl` tool** (per channel and month). COGS per unit: POST `cogs-monthly {startMonth:'2026-09-01',endMonth:'2026-09-01',skus?}` → `rows.*` `{sku,month,cogs (per unit ₹),cogsSource,carriedFromMonth}`; Sep 2026 all `actual`, Oct = carried from Sep. Total COGS = per-unit cost × net units — never hand-sum.

**Ads** (`bq {start,end}`, block `ads.*`; 6-month table `bq {adsMonthly:true,from,to}`; file `ads-data` is a rolling 90 days):
| Need | Path | Sep 2026 |
|---|---|---|
| Spend by platform | `ads.totals` (platform,spend,revenue,impressions,clicks,orders,ctr,cpc,roas) | Meta ₹7.67 Cr; Amazon ₹1.14 Cr; Flipkart ₹36.78 L; Google ₹8.95 L; Myntra ₹7.05 L; Blinkit ₹4.44 L; Zepto ₹2.46 L; Instamart ₹1.32 L |
| Total ad spend | sum of `ads.totals.*.spend` (`sum:['spend']`) | ₹9.42 Cr (94,211,354). `customer.kpis.totalSpend` ₹7.76 Cr is D2C Meta+Google+additional only. |
| By campaign / category / SKU / ad type | `ads.campaigns`, `ads.byCategory`, `ads.bySku`, `ads.byAdType` | |
| Prior period | `ads.prevTotals.<Platform>` | |
**Ads category / product tables:** spend not linked to a product (`target_type = 'all'` or no product name) is one **"Unattributed" category row** (spend only, no revenue), so no category's ROAS carries it; product and category ROAS are attributed-only; totals still include it. **Browser-computed ROAS = total-sales ROAS:** channel `chMap.<Channel>.excRev` ÷ that channel's ad spend (Amazon 125,384,787 ÷ 11,390,327 = 11.01×; D2C = chMap.Shopify.excRev ÷ (Meta+Google) = 3.59×; Flipkart 4.72×). `ads.totals.*.roas` is the platform-reported ROAS (Amazon 7.31) — different; say which one. CTR = clicks ÷ impressions; CPC = spend ÷ clicks. ACoS/TACoS: not tracked.

**Customers** (`customer {start,end}`; server-computed `kpis`, previous period in `prevKpis`):
| Metric | Path | Sep 2026 |
|---|---|---|
| New / returning / total customers | `kpis.newCustomers` / `returningCustomers` / `totalCustomers` | 1,06,224 / 48,585 / 1,54,809 |
| Repeat rate | `kpis.repeatRate` (fraction) | 31.4% |
| CAC | `kpis.cac` = (Meta+Google+additional spend) / new customers. **This is the one CAC definition** (Customer page, Overview); the previous period now includes its own additional spend, so the up/down arrows compare like with like. | ₹731 |
| LTV (12-month revenue/customer) | `kpis.ltv12` | ₹2,291 |
| LTV:CAC | `kpis.ltvCac` (revenue-based, no margin) | 3.1× |
| Orders / AOV | `kpis.totalOrders` / `kpis.aov` | 1,69,857 / ₹1,850 |
Cohort retention is browser-computed (cohort customers at index N ÷ index 0); margin-based LTV:CAC uses a default 35% margin in the browser. Geography is not here (use `bq` stateMap/cityRows).

**Customer Support** (`customer-support {grain:'month'|'week'|'day',start,end}`): raw sums per bucket; averages are browser-computed (FRT = `frt_sum`/`frt_n` seconds, ART = `res_sum`/`res_n` hours, TTR = `hrs_sum`/`resolved`). `tickets` rows with `ch:'All'`: Sep interactions 92,270; escalations 425. **Open tickets older than 9 days:** path `pendency` (rows `{kind,grp,bucket,n}`; live snapshot of tickets not Resolved/Closed/Junk created in the last 45 days, ignores start/end), `where:{kind:'Parent'}`, buckets `9-10`, `11-15`, `15+` summed (Parent 88+157+373 = 618; Child 149). Ticket status split is not available.

## Group 4 — Sales / Returns / Overview (`bq`, `return-analysis`, `returns`, `cat-daily`)

**`bq` response shape (staged loading, 3 Nov):** the page asks `bq` with a `phase` (`fast`, `sales_detail`, `pnl_detail`, `pnl_margin`, `ads_detail`) and gets only that part. **Without `phase` NavAI gets the full response, rows included** (large at long ranges, so always use `paths`). In the `pnl_detail` phase the P&L row arrays are replaced by `pnlAgg` / `pnlTrend` (same numbers, packed). **`bq` params** `{start,end}` required. Optional comma-separated filters: `category`, `subCategory`, `sku`, `subChannel` (`ShopifyIndia` = all D2C India (page default), `MyFrido`, `Mobility`, `International`, or a raw SubChannel such as `Amazon Seller Central`), `channelGroup` (`d2c`,`ebo`,`marketplace`,`quick_commerce`,`offline`,`international`), `paymentType` (`Prepaid`,`COD`,`PPCOD`), `voucher`, `region`, `tier`, `state`, `city`, `country`. `channel` is ignored. **`phase:'fast'`** returns a ~2 MB payload in ~11 s with totals, `chMap`, `subChannelMap`, `netRevenueCalc`, `dailyArr`, `ads` — but NO `catMap`, `stateMap`, `skuRows`, `cityRows`, `pnlSalesRows` or `shopify.resolvedDailySKU`. Omit `phase` for category/state/SKU questions (≈60 MB, slow, then cached). Never use `phase:'slow'`.
`chMap` keys: Shopify (= D2C), Amazon, EBO, offline_sales, Blinkit, Flipkart, Myntra, CRED, Instamart, Zepto, Firstcry, International; each `{rev (gross inc GST), excRev, netRev, orders, qty}`. Maps are keyed objects: use `chMap.*.netRev` style paths.

| Question | Paths | Verified |
|---|---|---|
| D2C gross / orders / units | `shopify.totals.rev`, `.orders`, `.qty` (= `chMap.Shopify.*`) | 1–28 Oct: ₹29.51 Cr, 1,60,931, 2,21,179; Sep gross ₹31.42 Cr |
| D2C net revenue | `chMap.Shopify.netRev` (= `shopify.netCalc.netRev`) | Sep ₹22.55 Cr (matches the P&L/Sales tile) |
| **Net revenue by channel (the page's own)** | `chMap.*.netRev` (sum = `netRevenueCalc`) | Sep: D2C 22.55, Amazon 10.18, Offline 3.55, EBO 2.20, Blinkit 1.39, Flipkart 1.20, Myntra 0.63 Cr |
| MyFrido vs Mobility | `subChannelMap.MyFrido.{rev,excRev,orders,qty}`, `subChannelMap.Mobility.*`; Mobility net = `subChannelMap.Mobility.netRev` | Sep MyFrido ₹28.65 Cr, Mobility ₹2.77 Cr gross |
| AOV / ASP (D2C) | AOV = `chMap.Shopify.rev` ÷ `chMap.Shopify.orders`; ASP = `shopify.totals.rev` ÷ `shopify.totals.aspQty`; page-scoped: `scopedAOV`, `scopedASP` (D2C, Amazon SC, Myntra, Flipkart, Firstcry, CRED only); `blendedAOV` = all channels | Sep AOV ₹1,850, ASP ₹1,357 |
| Category / sub-category | `catMap.<cat>.{rev,excRev,units,…}`, `subCatMap["Cat::Sub"]`; D2C: `shopify.catMap`; `catMap.*.orders` is `{size}` — use `shopify.catMap` or `pnlSalesRows` | Sep Footwear ₹13.70 Cr (all channels) |
| Top SKUs | `skuRows` (one row per sku × channel) `groupBy:'sku'`, `sum:['rev']`, `sortBy:'rev'`; filter channel with `where:{channel:'Shopify'}` | Sep top D2C SKU FR-OPPC-L1 ₹1.42 Cr |
| State / city / tier / payment | `stateMap`, `cityRows`, `tierRows`, `regionRows` (D2C: `shopify.*`), `paymentModeMap.<Prepaid|COD>`; D2C `shopify.paymentTypes` | |
| Previous period / growth | `prevRev`, `prevOrders`, `prevChMap.<ch>.{rev,excRev,netRev}`, `momRev`, `yoyRev`, `shopify.prevNetCalc.netRev`. `prevExcRev` is previous GROSS ex-GST, not net. | |
| Daily trend | `dailyArr` (`date`, `<Ch>`, `<Ch>_net`, `<Ch>_o`, `<Ch>_u`); D2C `shopify.daily` | |
| Live-status return mix | `shopify.netCalc.{cirPct,rtoPct,cancelPct,totalReturnPct}` (fractions), `.cirRev/.rtoRev/.cancelRev/.exchRev`; all channels `cancellRev`, `rtoRevDirect`, `returnRev`, `cirRev`, `exchangeRev`; counts `orderStatusMap` | Sep D2C totalReturnPct 0.18 |

**Browser-computed (replicate with the formula):**
1. **D2C Returns % tile (provisional) and D2C Net Revenue tile** (App.jsx ShopifyTab): Returns % = Σ `shopify.resolvedDailySKU.totalReturnRev` ÷ Σ `.gross` × 100 (needs the FULL payload, not `fast`); net = (Σgross − ΣtotalReturnRev) × (excRev/gross). Sep: Returns 19.04%, net ₹22.55 Cr. For provisional returns and CIR/RTO/cancel components use the returns SQL template (it reproduces this engine) — or this path when the full payload is loaded.
2. **Overview Returns % tile** = (`cancellRev` + `rtoRevDirect` + `returnRev` + `cirRev`) ÷ `totalRev` × 100 (Sep 17.40%; exchange 3.74% separate). Not the same as D2C's 19.04%.
3. Overview AOV = `blendedAOV` (₹1,995 Sep); Overview ASP = `totalRev` ÷ (`aspQty` || `totalQty`).
4. Overview net-revenue ▲/▼ = `netRevenueCalc` vs the previous-period call's `netRevenueCalc`; channel scorecard share = `rev/totalRev`, delta vs `prevChMap.<ch>.rev`; top products = `skuRows` summed by sku.
**Cancellations are counted once per order** in Return Analysis > Cancellation, Days Since Order (fixed 26 Oct; an order with several cancelled lines no longer counts several times). Cancellation % elsewhere is revenue-based (see PULSE_METRICS). **Return Analysis (`return-analysis` {start,end,category?,subCategory?,subChannel?,paymentType?}) — D2C only, no browser math:** `kpis.returnPct` (actual statuses; Sep 19.04), `kpis.cancelPct/rtoPct/cirPct/exchangePct` (4.72 / 8.42 / 5.91 / 6.63), `dailyTrend`, `categoryTable`, `topProducts`, `paymentTypeTable`, `monthlyTable` (last 12 months), `returnReasons`, `exchangeReasons`. The Sales tile (provisional) and Return Analysis (actual) match for mature months and diverge for the latest 15 days.
**Returns portal (`returns` {start,end}, Clickpost):** `kpis.{total_requests,total_returns,total_exchanges,pickup_success,refund_processed,total_refunded,prepaid_count,cod_count}`, `byReason`, `byProduct`, `byDay`, `byCourier`, `byState`. Sep: 30,704 requests, 10,850 returns, 19,854 exchanges.
**`cat-daily` {start,end,channel}** (channel required: shopify, ebo, amazon, amazon_vc, flipkart, blinkit, instamart, zepto, cred, firstcry, myntra, offline): nested map `subCatDateMap.<Cat>.<Sub>.<date>.{rev,excRev,units,cancelRev,rtoRev,cirRev,exchRev}`.
**Financial MIS:** `/api/financial-mis` is NOT deployed (404) — say it is not available.

## Changes of 26 Nov 2026 that need no new endpoint

- **P&L / Sales payload (`pnl-data.json`, `bq`):** return components with zero revenue and zero % are now `null` (absent) in `resolvedDailySKU`, and the per-component `source` field ('live' / 'rolling_30d') no longer exists. Treat a missing component as 0; never say a component's "source". The numbers themselves are unchanged.
- **COGS page** now reads and writes `product_cogs_monthly` (the old `cogs_ledger` table is retired). NavAI only reads `product_cogs_monthly`; it never writes.
- **P&L calculators** (Breakeven ROAS, Price simulator, PO approval checker, B2B costing) and **saved scenarios** work on numbers the user types or saves privately; NavAI has no access to them. Say so if asked; offer the P&L tool for real channel figures.

