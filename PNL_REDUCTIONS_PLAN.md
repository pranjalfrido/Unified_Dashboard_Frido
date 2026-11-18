# P&L reductions: plan (for approval, nothing built)

Branch `fix/pnl-reductions`, worktree `C:/wt-pnlr`, from `origin/main` @ `b766ea29` (staged loading, security and Phase 0 all merged). No code changed yet.

## Summary

* **Problem.** `pnl_detail` ships per-SKU-per-day rows. At YTD that is 268 MB and about 2 GB of peak function memory (PERF_STATUS §6). Ads downloads the whole thing to compute one figure: each product's breakeven ROAS.
* **Where the size is.** Measured on the real October 2026 response (`public/pnl-data-lastmonth.json`, no BigQuery calls): `pnl_detail` = **62.7 MB**, of which 54.9 MB is 17 row arrays. The eight `*.resolvedDailySKU` arrays alone are 41 MB.
* **Fix, in three parts:**
  1. **Whole-range figures** (net-revenue scale, per-SKU resolved rates for SnD, Flipkart per-SKU returns): ship exact reductions instead of rows. This uses the same method as `_resolvedAgg.js`: one shared function, the same expressions, the same row order.
  2. **Day-wise trend figures** (Amazon, D2C and Flipkart COGS%/SnD%/GM%/CM1%/CM2% lines, the mobile chart's day Net line): these genuinely need per-SKU-per-day rows. They ship in a compact column format holding only the fields the trend code reads. The browser rebuilds the same rows, so the arithmetic is unchanged.
  3. **Ads:** a new small `pnl_margin` group with only what its 6 P&L tabs need for CM1.
* **Measured on October:**
  * `pnl_detail`: 62.7 MB → **13.2 MB** (−79 %)
  * the Ads margin payload: 62.7 MB → **≈ 2.8 MB** (−96 %)
  * the column packs round-trip with **0 mismatched values**.
* **Unchanged:** every P&L number, all SQL, the full (no-phase) response, and the static `pnl-data*.json` files. Those still carry rows, and the code still accepts them.
* **Effort:** ≈ 5.5 days (range 4.5–7).

---

## 1. What P&L computes from the row-level arrays

All line numbers are in `src/pnl/PnLPage.jsx` unless noted.

### 1a. `<channel>.resolvedDailySKU` (41 MB/month). Uses inside P&L:

| # | Consumer | Lines | What it reads | Grain needed |
|---|---|---|---|---|
| R1 | **Net-revenue scale**, D2C (`shNetScale`): Overall = not International, MyFrido, Mobility | 1051-1068 | row count, Σ`(x.gross‖0)`, Σ`(x.totalReturnRev‖0)` over the rows matching the sub-channel | whole range, 3 variants |
| R1 | Net-revenue scale, `resolvedNetScale()`: EBO, Flipkart, CRED, Firstcry, Myntra | 119-129, 1122, 1736, 1740-1742 | same three sums | whole range |
| R1 | Net-revenue scale, Amazon: SC, VC, or SC rows **followed by** VC rows | 1722-1723 | same three sums. The All view sums one concatenated sequence, which is not bit-equal to SC sum + VC sum, so it needs its own reduction | whole range, 3 variants |
| R2 | **D2C per-SKU resolved rates** (`shResolvedRatesBySku`) → SnD (`shSkuCosts` → `shSndBySku`) → every D2C CM1/CM2, the Financial View SnD column, Price Simulator / Breakeven ROAS SnD per unit | 402-419, 421-493 | per SKU: Σunits, Σgross, Σ rto / cir / cancel / exchange `components.*.units` | whole range, 3 sub-channel variants |
| R2 | **EBO per-SKU resolved rates** (`eboResolvedRatesBySku`) → `eboSndBySku` | 540-554, 569-605 | same fields | whole range |
| T1 | **D2C day-wise SnD** (`shDailySndBySku`) → D2C trend SnD%/CM1%/CM2% | 1272-1307 | per row: date, sku, subChannel, units, gross, 4 component units. SnD is computed per row with a non-linear formula (`normalizeOutcomePcts`), then summed per `date::sku` | **per row** |

`offline.resolvedDailySKU` is **not read by P&L at all**; it ships today only because the phase generator matched the generic field name. Overview and Sales read `resolvedDailySKU` only through `resolvedAggOf` / `resolvedAggWhere` / `resolvedBySkuOf` (`api/_resolvedAgg.js`). Without rows those helpers already fall back to the shipped `resolvedAgg` (fast) and `resolvedAggDetail` (sales_detail), which parity showed are byte-identical.

### 1b. Other row arrays in `pnl_detail`

| # | Field (MB/month) | Consumer | Lines | Grain needed |
|---|---|---|---|---|
| R3 | `flipkart.dailyPnLBySku` (1.38) | Flipkart per-SKU returns `fkReturnRevBySku` / `fkReturnedUnitsBySku` → `fkSkuData` → Flipkart Financial View, COGS on net units, every margin | 1419-1439 | whole range, per SKU |
| T2 | `flipkart.dailyPnLBySku` | Flipkart trend (`fkDailyPnL`): per-row COGS from `getCogsPerUnit(sku, date, cogsMonthlyMap, asp = gross/units)` | 1449-1492 | **per row** (the COGS rate depends on SKU × month × row ASP, and `cogsMonthlyMap` is fetched separately by the browser) |
| T3 | `amzSC.dailyPnLBySku` (2.25), `amzVCMatrix.dailyPnLBySku` (2.70) | Amazon ₹ trend (`amzDaily`) and % trend (`amzDailyPnL`) | 1179-1257 | **per row** (same COGS reason) |
| T4 | `shopify.dailySKU` (5.03) | D2C % trend (`shDailyPnL`): per-row `netRevenueOf(x, …, shNetScale)`, per-row COGS, plus the MyFrido/Mobility spend ratio Σ`x.rev` | 1312-1370 | **per row** |
| T5 | `ads.adsDailyByCategory` (2.11) | per-day spend for CM2%: Amazon (1236), Flipkart (1472), Meta + Google × `cm2Ratio` (1328). Only `date`, `platform` and `spend` are read, and only those 4 platforms | 1234-1239, 1327-1330, 1471-1474 | per row for MyFrido/Mobility (each row is multiplied before summing); kept per row for all |
| — | `blinkit` / `zepto` / `instamart.dailyPnLBySku` (0.22) | **nothing reads them** (only `sndBySku` is read for these channels) | — | drop from P&L |

### 1c. Where these feed, so the parity suite covers every view

* **KPI cards and `kpiSummary`** (2049-2159): Net Revenue (via the net-revenue scale), COGS / GM / SnD / CM1 / Marketing / CM2 / ROAS and their %s, all tabs.
* **Financial View table** (`PnLFinancialTable` → `buildFinancialRows`, `src/pnl/financialRows.js`): `subCatData`, `skuData`, `sndBySku`, `netScale`, `adSpendMap`. These are the same inputs as the KPI cards.
* **Margin watchlist and margin matrix** (desktop table flags; mobile `WatchlistCard` / `MarginMatrix`, `PnLMobileView.jsx:352-358`): built from the Financial View rows plus the previous-period `rows`.
* **SKU tables:** the expandable SKU rows of the Financial View (`PnLFinancialTable.jsx:366`, per-SKU SnD).
* **Per-day trends:** desktop `PnLTrendCard` (`PnLChannelTab.jsx:199-260`; the % metrics appear only when `dailyPnL` is non-empty) and the mobile chart. The mobile chart's default line is `dayNet` from `dailyPnL` (`PnLMobileView.jsx:175-206`), so day-wise data is on screen by default on phones.
* **Tools:**
  * Price Simulator and Breakeven ROAS: `d2cProductList` / `d2cProductGroups` (1790-1970); SnD from R2; weights from `skuCostRows`.
  * B2B Costing and PO Approval: `offline.skuRows`, unchanged.
* **EBO store table** (`storePnLRows`, 617-772): `ebo.storeSkuCostRows`, unchanged.
* **Previous period:** a hidden `summaryOnly` instance (2162-2191, 2367-2371) runs all of the above on the previous range. It loads fast + `pnl_detail` (`App.jsx:20735`), so it gets the same savings.

### 1d. What the hidden Ads margin instance needs

`App.jsx:12143-12146` (desktop) and `12673-12676` (mobile) mount `PnLPage summaryOnly withMargins`. The tab is `shopify`, `amazon`, `flipkart`, `blinkit`, `zepto` or `instamart` (`ADS_PNL_TAB`, `App.jsx:11581`), with D2C = Overall and Amazon = All.
* It uses only `onSummary().margins` = `{ sc: { cat, excRev, cm1 } }` from `buildFinancialRows` (2184-2185), and turns that into breakeven ROAS = excRev ÷ CM1 (`App.jsx:12074-12076`).
* CM1 needs `subCatData`, `skuData`, `sndBySku`, `netScale`, `cogsMonthlyMap` and `snd-rates.json`.
* **No trend data**, and nothing from EBO, Offline, CRED, Firstcry, Myntra, International or the "All" tab.

---

## 2. Design

### 2.1 Shared module `api/_pnlAgg.js` (same pattern as `api/_resolvedAgg.js`)
One file, imported by `api/_bqPhases.js` (server) and `src/pnl/PnLPage.jsx` (browser).

**Reductions** (whole range, exact). Each accumulator starts at 0, adds in row order and uses the **exact expression the current P&L code uses**, including its `|| 0`. So a value from a reduction `===` the value from the rows.

| Reduction | Contents | Replaces the read at |
|---|---|---|
| `pnlAgg.netScale` | `{ n, gross, totalReturnRev }` for: shopify `notIntl` / `myfrido` / `mobility`; amazon `sc` / `vc` / `all` (SC then VC, one sequence); ebo; flipkart; cred; firstcry; myntra | 1061-1063, 1122, 1722, 1736, 1740-1742 (`resolvedNetScale` gets a sums-based variant; the formula after the sums is unchanged) |
| `pnlAgg.ratesBySku` | `{ sku: { units, gross, rtoUnits, cirUnits, cancelUnits, exchUnits } }` for shopify × 3 variants and ebo, in first-seen SKU order | 402-419, 540-554 |
| `pnlAgg.fkBySku` | `{ sku: { totalReturnRev, returnedUnits } }` | 1419-1423 |

**Trend packs** (per row, column format). Strings are dictionary-encoded and numbers kept as plain JSON numbers. JSON numbers round-trip exactly, so the browser's `unpackRows()` returns rows with identical values, in identical order:

| Pack | Rows | Fields |
|---|---|---|
| `pnlTrend.shResolved` | `shopify.resolvedDailySKU` rows with `sku && units` (the only ones T1 uses; the skip happens after the sub-channel filter, so dropping them earlier is equivalent) | date, sku, subChannel, units, gross, rto/cir/cancel/exchange units |
| `pnlTrend.shDailySKU` | `shopify.dailySKU` | date, sku, subChannel, units, returnUnits, rev, excRev, cancelRev, rtoRev, cirRev (exactly what `netRevenueOf` reads; `returnedUnits` stays absent, as today) |
| `pnlTrend.amzSC`, `.amzVC`, `.fk` | `dailyPnLBySku` | date, sku, gross, excRev, net, totalReturnRev, units, returnedUnits, snd (null kept as null) |
| `pnlTrend.adsDaily` | `ads.adsDailyByCategory` rows for Amazon / Flipkart / Meta / Google, original order | date, platform, spend |

**Browser helpers**, each picking rows when present and the reduction or pack otherwise:
* `netScaleSumsOf(data, channel, variant)`
* `ratesBySkuOf(data, channel, variant)`
* `fkBySkuOf(data)`
* `trendRowsOf(data, pack)`

"Rows present" covers the static `pnl-data*.json` shortcut and any full (no-phase) response. The decoded rows get new names (`pnlTrend.*`), never `resolvedDailySKU`, so Sales' `hasRows()` can't pick up a partial row and compute a wrong figure from it.

### 2.2 Phases (`api/_bqPhases.js`)

| Group | Contents | Loaded by |
|---|---|---|
| `pnl_detail` (changed) | Today's fields **minus** the 17 row arrays in §1, **plus** `pnlAgg` and `pnlTrend` | P&L (and its previous period) |
| `pnl_margin` (new) | Only the fields the 6 Ads tabs' CM1 needs: `shopify.skuCostRows`, `pnlAdSpendMap`, `amzSC.skuChannel`/`sndBySku`, `amzVCMatrix.skuData`/`subCatData`/`sndBySku`, `ads.categoryBreakdown`, `flipkart.subCategories`/`skuMatrix`/`sndBySku`, the QC `subCategories`/`skuMatrix`/`sndBySku`, and the `pnlAgg` entries for those channels. Queries: only what these fields depend on, from the existing measured dependency map (`deps.mjs` → `plan.mjs` → `write-phases.mjs`, extended with this group) | Ads (replaces `pnl_detail` in `bqPhaseMerge.js` `ads: [...]`) |

* The hidden Ads instance waits for `pnl_margin` instead of `pnl_detail` (`App.jsx:11757`).
* **Not split** into a separate `pnl_trend` request. Both halves need the same heavy BigQuery inputs (`shDailySKU` and the resolved-engine queries). A second request would re-run them, costing BigQuery time and, without a result-cache hit, bytes, all for a ~5 MB/month difference. Revisit only if YTD time still needs it.
* `CACHE_VERSION` +1. No SQL, filter or aggregation changes. The full (no-phase) response is byte-identical to today.

### 2.3 Views that genuinely need rows, and how they stay light
Only the day-wise trends: T1-T5, i.e. the Amazon, D2C and Flipkart % lines and CM2 spend, plus the mobile chart's day Net. Their COGS is per SKU × month × row ASP from `cogsMonthlyMap`, which the browser loads separately, and D2C SnD is non-linear per row. So no server-side per-day sum can reproduce them exactly without moving the whole P&L calculation to the server.

**Not on demand:** the mobile chart shows `dayNet` by default, so loading on demand would add a loader to the default phone view. They stay in `pnl_detail`, made light by:
* sending only the fields that are read;
* sending only rows that can contribute;
* the column format.

At 1 month that is 4.7 MB, against 29.7 MB for the arrays they are built from (`shopify.resolvedDailySKU` 16.2, `shopify.dailySKU` 5.0, the three `dailyPnLBySku` 6.3, `adsDailyByCategory` 2.1).

### 2.4 Code touched
* `api/_pnlAgg.js` (new).
* `api/_bqPhases.js`: regenerated with the pnl_detail change and the new `pnl_margin` group.
* `scripts/staged-loading/plan.mjs` / `write-phases.mjs`: rules for the two changes.
* `api/bq.js`: `CACHE_VERSION` only.
* `src/pnl/PnLPage.jsx`: about 10 read sites switched to the helpers; no formula touched.
* `src/bqPhaseMerge.js`, `src/detailPhase.js`, `App.jsx`: Ads uses `pnl_margin`.
* Parity scripts under `scripts/pnl-reductions/`.

---

## 3. The Ads margin payload
Covered in §2.2 (`pnl_margin`). Measured on October: **2.35 MB of fields + ≈ 0.4 MB of reductions ≈ 2.8 MB**, against 62.7 MB today. It also runs far fewer queries: none of the EBO, Offline, CRED, Firstcry, Myntra or International SKU queries, and none of the day-wise settlement queries. The browser then runs the unchanged `PnLPage summaryOnly withMargins` on it. The margins come out identical because every input `buildFinancialRows` reads for those 6 tabs is either shipped unchanged or replaced by an exact reduction.

---

## 4. Expected size, time and peak memory

Each figure is labelled with how it was obtained:
* **measured**: from PERF_STATUS §4 or §6, or measured this session on the October file;
* **est.**: projected. Packs scale with days; the kept SKU-grain fields scale mostly with SKU count.

| Range | `pnl_detail` today | `pnl_detail` after | Ads today (`pnl_detail`) | Ads after (`pnl_margin`) | Peak RSS `pnl_detail`, today → after |
|---|---|---|---|---|---|
| 1 month | 59.0 MB measured live (62.7 MB on the static file) | **13.2 MB measured** (static-file basis) | 59.0 MB | **≈ 2.8 MB measured** | not measured → est. −30–40 % |
| 3 months | ≈ 140 MB est. (between the measured 59 and 218) | ≈ 28 MB est. | ≈ 140 MB | ≈ 4 MB est. | — |
| 5 months | 217.6 MB measured | ≈ 42 MB est. | 217.6 MB | ≈ 5 MB est. | — |
| YTD (Apr 1 → today) | **268.1 MB, 20.4 s, 2032 MB RSS measured** | ≈ 50-55 MB est. | 268.1 MB | ≈ 6 MB est. | 2032 MB → est. 1.2-1.5 GB |

* **Time.**
  * The server's BigQuery part of `pnl_detail` doesn't change: same queries, 20.4 s at YTD.
  * The saving comes from not serialising, sending and parsing ~215 MB of JSON at YTD. That is several seconds on the server plus the download and `JSON.parse` in the browser, and far more on phones.
  * Ads also skips most P&L queries. Expect its margin figure at roughly fast-phase speed instead of after the 20 s `pnl_detail`.
  * All of this will be **measured** in Part 2. These are estimates.
* **Memory.**
  * The server still builds the resolved rows in memory: the engine runs exactly as today.
  * Peak RSS falls by the JSON string and response buffer of the dropped arrays.
  * The browser no longer holds 268 MB of parsed rows, which matters most on phones.
  * Ranges beyond YTD scale with the trend packs only, ≈ 4.7 MB per month.

---

## 5. Parity plan

**Goal:** every P&L tile, table, chart series and the Ads margin figure identical, before vs after. The reference is today's `origin/main` code on today's response.

* **Data.** The 17 cases from PERF_STATUS §4 (1, 3 and 5 months; every filter type; ShopifyIndia, MyFrido, Mobility) **plus YTD**. Each case is recorded once from BigQuery with the existing record/replay harness, so old and new code see identical rows. Only one live BigQuery pass per case is needed.
* **Layer 1: payload check (node).**
  * Every reduction is `===` the value the current P&L expressions give from the full rows.
  * Every unpacked trend row is field-identical to the source row, in the same order.
  * Every kept `pnl_detail` field is byte-identical.
  * The full (no-phase) response is byte-identical.
  * The `pnl_margin` fields are byte-identical.
* **Layer 2: what the page shows (headless browser, desktop 1440 px and phone 390 px).** A test page, not the app (no login, no Supabase), renders the real `PnLPage`:
  * **Old:** `origin/main`'s code on the old full response.
  * **New:** this branch on fast + new `pnl_detail`.
  * **Inputs:** both get the same `snd-rates.json` and the same recorded `/api/cogs-monthly` response.
  * **Views covered:** every tab and sub-view (D2C Overall/MyFrido/Mobility, Amazon All/SC/VC, Offline 5 sub-tabs, the other 9 channels), the EBO store table, and the 4 tools.
  * **Comparison:** the full rendered DOM, which covers KPI cards, the Financial View with expanded SKU rows, watchlist flags, the margin matrix, and the chart SVG paths (identical data means identical paths). Also compared: the `onSummary` output (previous-period summary and the Ads `margins`) for the 6 Ads tabs, old `pnl_detail` vs new `pnl_margin`.
* **Tolerance.** Replay runs must be **exact**: 0 diffs. A live-vs-live comparison is run once per case only to show the noise is limited to the known ±1 (|v| ≥ 100) / ±0.01 BigQuery noise. Any diff in a replay run is a bug.
* **Static-file path.** One extra case runs the new code on the unchanged `pnl-data-lastmonth.json` (rows present) to prove the fallback path is identical too.
* **YTD.** `ytd-phase.mjs` with `pnl_detail` (old vs new) and `pnl_margin`: status, time, response MB and peak RSS. Disk: recordings and snapshots are deleted after each case, as before.
* **Needs your OK for Part 2.** The parity runs read `sa_key.json` in place from the main folder (`SA_KEY_PATH`, never copied, printed or committed), the same arrangement you approved for the staged-loading and security fixes.

---

## 6. Effort, risks, overlap

**Effort** (one commit per step, parity after each):

| Step | Days |
|---|---|
| 1. `api/_pnlAgg.js` (reductions, packs, helpers) + Layer-1 check on recorded rows | 1 |
| 2. Phases: `pnl_detail` change + `pnl_margin`, generator rules, regenerate, replay parity | 1 |
| 3. `PnLPage.jsx` read sites → helpers; Ads → `pnl_margin` | 1 |
| 4. Layer-2 test page, 18 cases × desktop/phone, fix anything found | 2 |
| 5. YTD measurement, report, push for a Vercel preview | 0.5 |
| **Total** | **≈ 5.5 (4.5-7)** |

**Risks:**
1. **Floating-point order.** A reduction that adds in a different order or uses a different `|| 0` differs in the last bits. Mitigations: copy the expressions verbatim, use one shared module, require exact (`===`) Layer-1 checks, and require 0 diffs in the Layer-2 replay. Amazon All (SC then VC as one sequence) is the known trap and gets its own reduction.
2. **The generated phase tables are data-driven.** A field `pnl_margin` needs but no scenario exercised could be missed. Mitigations: Layer 2 compares all 6 Ads tabs' margins on all 18 cases, and the manual field list in §2.2 comes from reading the code.
3. **Sales pages** previously read `resolvedDailySKU` rows when `pnl_detail` happened to be loaded. They will now always use the shipped reductions. These were proven byte-identical in staged-loading parity (`agg-check.mjs`), which is re-run.
4. **Memory figures are estimates** until measured. The resolved engine still builds every row on the server, so this fix shrinks the response, not the BigQuery work.
5. **Data growth.** Packs grow by about 4.7 MB a month of range.

**Overlap with the Monthly Trend plan** (`MONTHLY_TREND_PLAN.md` §2: `src/kpi/pnl.js` = `buildChannelData` + `kpiSummary`, Phase 1, 5 days):
* This change does **not** move `channelData` or `kpiSummary` out of `PnLPage`. It only swaps about 10 input reads for helper calls, so the extraction is not done twice.
* When Phase 1 extracts `buildChannelData`, it imports the same helpers from `api/_pnlAgg.js`.
* The trend job only needs whole-range tiles, so it can request **`pnl_margin`-style reductions instead of rows**. That makes its monthly regeneration lighter than PHASE0_REPORT assumed.
* **Recommended order:** this branch first, then Phase 1 builds on it.
* **Note:** an unmerged agent branch, `fix/pnl-shared-logic` (`570f4414`, 29 Oct, "extract P&L calculation logic into pure shared pnlShared.js"), also refactors `PnLPage.jsx`. It is not on main and I won't touch it. Whichever of the two lands second will need a merge, and the Monthly Trend extraction should decide whether to reuse it.

**Not in scope (possible follow-ups):**
* Writing `public/pnl-data*.json` in the reduced form. `pnl-data-lastmonth.json` is 66.8 MB and the "Last month" preset downloads it. It is a full response that Sales and Overview also read, so it needs its own change.
* Reducing `shopify.skuCostRows` (1.4 MB/month) to per-SKU weight buckets.
* The Overview-only detail group (PERF_STATUS §6).
