# Staged-loading mapping report (Part 1)

Read-only investigation, worktree `fix/staged-loading`, built on `origin/main` @ `476cc4c3`.
No code changed in this report (one line of temporary debug instrumentation was added to
`api/bq.js` to get a stack trace for a bug found below, then fully reverted — `git status`
confirms `api/bq.js` is clean).

## ⚠️ Flag before anything else: `phase:'slow'` is currently BROKEN when called alone

This matters for Part 2's design, so it's flagged first. `phase: 'slow'` already exists in
`api/bq.js` but **crashes with a 500** if called without a preceding/combined `phase:'fast'`
response: `TypeError: Cannot read properties of undefined (reading 'netRev')` at
`api/bq.js:4614` (`chMap['Shopify'].netRev += intlExcRev`).

Root cause: `chMap` (and `netRevenueCalc`, `dailyArr`, and several other computed intermediates)
are built from `byChannel`/`byDate` — both **fast-only** queries. Under `phase:'slow'`,
`filteredQueries` only runs `SLOW_QUERY_KEYS`, so `r.byChannel`/`r.byDate` are `[]`, `chMap` stays
`{}`, and later code at line 4614 (`chMap['Shopify'].netRev += ...`, inside the
`resolvedDailySKU`-based Shopify-International net-rev patch) assumes `chMap['Shopify']` already
exists from the earlier `byChannel`-driven loop. It also took **21-23 seconds and ~930MB-1.1GB
peak RSS** to reach that crash — `phase:'slow'` still runs ~140 queries even though it throws
before producing a usable response, so today it is strictly worse than useless standalone (all
the memory/time cost of the full detail fetch, with no output).

**This means Part 2 cannot simply add new `phase` values independently — it needs to fix this
assumption** (either compute `chMap`/`netRevenueCalc`/`dailyArr` unconditionally regardless of
phase — they're cheap, not from `SLOW_QUERY_KEYS` — or guard every write like
`chMap['Flipkart']` already correctly does two lines above the broken one). This is a
pre-existing bug in code that was built but never exercised standalone before (the earlier
Sales fix on `fix/overview-ytd` always fetched fast-then-slow and merged client-side, so this
path was masked). Not fixed here per Part 1 scope — flagged for Part 2.

No other single group is known to exceed ~700MB on its own based on the measurements below
(see per-group estimates) — nothing else triggers the "flag, don't fix" threshold from the
brief, aside from the phase:'slow' bug itself, which isn't a memory-threshold issue but a
correctness bug.

## Measured reference points (YTD, 2026-04-01 → 2026-10-30, 1024MB-equivalent heap unless noted)

| Request | Result | Time | Size | Peak RSS |
|---|---|---|---|---|
| No phase (full/unphased, today's only path) | OK (needs ≥1.7GB heap; OOMs at 1024MB per `LONG_RANGE_ISSUE.md`) | 27.3s | 339.1 MB | 1769 MB (at 3.8GB cap) / crashes at 1024MB |
| `phase:'fast'` (today, already shipped, unused by frontend) | OK | 6.0s | 11.0 MB | 337 MB |
| `phase:'slow'` (today, as shipped) | **CRASH (500)** | 21-23s to crash | 66 bytes (error body) | 929-1074 MB |
| Implied SLOW total (full − fast) | — | — | **~328.1 MB** | n/a (not a real response) |

The 328.1MB "slow total" is what Part 2's `sales_detail` + `pnl_detail` + `ads_detail` groups
need to split between them once the `phase:'slow'` bug above is fixed.

## Response structure (how to read the key list below)

`api/bq.js`'s payload has two layers:
1. **~60 top-level scalar/map fields** (e.g. `totalRev`, `chMap`, `catMap`, `stateMap`,
   `cityRows`, `dailyArr`, `skuRows`, `pnlSalesRows`) — these are channel-agnostic, cross-channel
   rollups.
2. **15 per-channel objects** (`shopify`, `amzSC`, `amzVC`, `flipkart`, `blinkit`, `instamart`,
   `zepto`, `cred`, `firstcry`, `myntra`, `ebo`, `offline`, `international`, `amzVCMatrix`, `ads`),
   each with its own `totals`/`daily`/`netCalc` (fast) plus `catMap`/`stateMap`/`skuMap`/
   `skuMatrix`/`dailySkuCostRows`/`sndBySku`/etc. (slow — this is exactly what
   `CHANNEL_SLOW_FIELDS` + the `_slow_<channel>` field lists in `api/bq.js` already enumerate,
   lines ~5107-5149 and ~5143-5218).

`SLOW_PAYLOAD_KEYS` (top-level) + `CHANNEL_SLOW_FIELDS` (per-channel) together are the
**authoritative, already-correct FAST/SLOW boundary** — they were built and verified during the
earlier Sales fix (`fix/overview-ytd`, merged into current `main`). This report maps that
existing boundary to consumer tabs; it does not re-derive the boundary from scratch.

## FAST group (already shipped, unchanged)

Everything NOT in `SLOW_PAYLOAD_KEYS` / `CHANNEL_SLOW_FIELDS` — totals, `chMap`, `prevChMap`,
`dailyArr`, per-channel `totals`/`daily`/`netCalc`, order-status/payment/voucher/high-ticket
breakdowns, `masterSkuList`, `pnlAdRawTotals`-derived scalars, all `*ReturnRateMature`/
`*ComponentRateMature` aggregates (already pre-aggregated server-side, cheap).

- **Consumers**: Overview (its one destructured list: `totalRev, totalExcRev, nOrders, totalQty,
  blendedAOV, nDays, chMap, catMap, subCatMap, stateMap, nCusts, repeatCusts, dailyArr,
  prevDailyArr, prevRev, prevOrders, rtoRevDirect, returnRev, cirRev, cancellRev,
  netRevenueCalc` plus `data.skuRows`, `data.cityRows`, `data.prevChMap`, and
  `data.<channel>.resolvedDailySKU` for 7 channels — see cross-cutting section below), Sales
  (reads the same top-level fields via `AllTab`), P&L (reads `totals`/`netCalc`/`daily` for
  headline KPIs), Ads (reads `chMap`, `shopify.totals`).
- **YTD size/time/memory**: 11.0 MB, 5.9-6.0s, 337-390 MB peak RSS. **Confirmed well under the
  700MB flag threshold and under the 1024MB crash ceiling** — this is the one group already
  proven safe standalone.
- **Note — two fields currently in FAST that arguably shouldn't be**: `catMap` and `stateMap` ARE
  in `OverviewPage`'s own destructure (`src/App.jsx` line ~5527) but ARE in
  `SLOW_PAYLOAD_KEYS` (dropped by `phase:'fast'` today). This means **Overview's existing
  `phase:'fast'` dependency is currently incomplete** — wiring `phase:'fast'` into Overview
  (the `fix/overview-ytd` plan) requires either moving `catMap`/`stateMap` into fast, or Overview
  tolerating empty maps until a detail group arrives. Flagging this now since Part 2 touches
  exactly this.

## SALES_DETAIL group (read only by Sales tab's per-channel detail views)

Sales's generic `ChannelTab` renders one of `ShopifyTab`/`AmazonTab`/`FlipkartTab`/`BlinkitTab`/
`InstaTab`/`ZeptoTab`/`CredTab`/`FirstcryTab`/`MyntraTab`/`EBOTab`/`OfflineTab` per active tab,
each reading that channel's full state/city/category/SKU-matrix/return-reasons detail. Confirmed
by direct grep of each tab component's body (e.g. `ShopifyTab` at `src/App.jsx:9074` reads
`sh.catMap, sh.subCatMap, sh.stateMap, sh.statePrevMap, sh.stateTotal, sh.cityRows,
sh.cityPrevMap, sh.cityTotal, sh.regionRows, sh.tierRows, sh.skuMap, sh.skuPrevMap,
sh.returnReasons, sh.dailySKU, sh.resolvedDailySKU, sh.mobilityNetBySubCat, sh.paymentTypes` —
none of `dailySkuCostRows`/`sndBySku`/`dailyPnLBySku`/`skuCostRows`/`skuWeightGm`/
`listingPriceBySku`/`prepaidAspBySku` appear in `App.jsx` at all).

Response keys in this group (per `CHANNEL_SLOW_FIELDS`, restricted to the subset each channel's
OWN Sales tab component reads — i.e. excluding the PnL-only cost/weight/settlement fields listed
under PNL_DETAIL below):
- Per channel: `catMap`/`category`, `subCatMap`/`subCategory`, `stateMap`/`state`,
  `statePrevMap`/`statePrev`, `stateTotal`, `cityRows`/`city`, `cityPrevMap`/`cityPrev`,
  `cityTotal`, `regionRows`/`region`, `tierRows`/`tier`, `skuMap`/`sku`/`skus`,
  `skuPrevMap`/`skuPrev`, `skuMatrix`, `returnReasons`, `catChannel`/`subCatChannel`/`skuChannel`
  (Amazon SC cross-channel matrices), `storeRows` (EBO).
- Top-level: `cityRows`, `stateMap`, `stateTotal`, `cityPrevMap`, `cityTotal`, `regionRows`,
  `tierRows`, `catChannelMap`, `subCatChannelMap`, `buckets`, `bucketRev`, `skuRows`.
- **Dead-field finding (see UNUSED section)**: `dailySkuCostRows` and `skuWeightShares` — present
  in `CHANNEL_SLOW_FIELDS`/`SLOW_PAYLOAD_KEYS` as if they were detail fields needing a home — are
  actually read by NOTHING, not even PnL. Moved to UNUSED below instead of SALES_DETAIL or
  PNL_DETAIL.

- **YTD size/time/memory**: not separately measurable in isolation today (phase:'slow' bug above
  blocks any live split-group measurement without first fixing it). Based on the already-verified
  top-20 list in `LONG_RANGE_ISSUE.md`, the queries that land here specifically
  (`shSKU`/`shState`/`shCity`/`shSubCategory`/`fkSKUMatrix`/`fkStates`/`fkCities`/
  `amzSCStates`/`amzSCCities`/`amzSCSKUs`/`blSKUMatrix`/etc., the "*States*"/"*Cities*"/
  "*SKUMatrix*"/"*Category*" family across 11 channels) account for roughly half of the
  SLOW_QUERY_KEYS set by count (~45-50 of ~90), but these are NOT the heaviest ones in the
  top-20-by-bytes table — the heaviest ones (`amzSCLineItemWeights`, `shDailySkuCosts`,
  `shDailySKU`'s siblings) belong to PNL_DETAIL or are cross-cutting (see below). **Best estimate:
  SALES_DETAIL is well under 328MB alone** — plausibly in the 60-120MB range — but this is an
  estimate, not a direct measurement, pending the `phase:'slow'` fix. Flagging the estimate
  honestly rather than presenting it as measured.

## PNL_DETAIL group (read only by `src/pnl/PnLPage.jsx` / `PnLChannelTab.jsx`)

Confirmed by grep — these response field names appear ONLY in the two PnL files, zero matches in
`App.jsx`:
- `sndBySku`, `dailyPnLBySku` (both files)
- `skuCostRows`, `skuWeightGm`, `listingPriceBySku`, `prepaidAspBySku` (PnLPage.jsx)
- Top-level: `pnlSalesRows`, `pnlAdSpendMap`, `pnlRawAdSpend`

These are fed by the genuinely heaviest raw queries in the whole 317-query set (confirmed by
tracing `r.<queryKey>` usage in `api/bq.js`, not just grepping the SQL definition):
- `amzSCLineItemWeights` (60.3 MB / 15.4s/ 454k rows) → feeds `amzSC.sndBySku` (stock-movement
  cost component) — consumed at `api/bq.js:3558,3588`
- `shDailySkuCosts` (49.7 MB / 15.3s / 302k rows) → feeds `shopify.dailySkuCostRows` — **but see
  UNUSED below: this specific response field is never read by anything**, despite its query being
  this expensive. This is the single biggest win available.
- `amzSCDailyNetBySKU` (12.3 MB / 7.0s) → feeds `amzSC.sndBySku`/`dailyPnLBySku` — consumed at
  `api/bq.js:2572,3509`
- `amzSCMFNOrderWeights` (4.4s) → feeds `amzSC.sndBySku` (MFN logistics cost) —
  `api/bq.js:3540,3578`
- `amzSCDailySettlement` (1.7s) → feeds `amzSC.sndBySku` settlement coverage —
  `api/bq.js:3500`
- `fkSKUMatrixDaily` (3.5-2.7s) → feeds `flipkart.dailyPnLBySku` — `api/bq.js:3963`
- `eboStoreSkuCosts` → feeds `ebo.skuCostRows`, read by `PnLPage.jsx` (confirmed via its own code
  comment: "sourced from ebo.skuCostRows ... see eboStoreSkuCosts")

- **YTD size/time/memory**: `shDailySkuCosts` alone is 49.7MB raw-query-result (before its
  `dailySkuCostRows` is confirmed-dead — see UNUSED), `amzSCLineItemWeights` is 60.3MB. If
  `dailySkuCostRows` is genuinely cut entirely (not needed by PNL_DETAIL phase at all, since
  nothing reads it), PNL_DETAIL's real floor is closer to `amzSCLineItemWeights` +
  `amzSCDailyNetBySKU` + `amzSCMFNOrderWeights` + `amzSCDailySettlement` + `fkSKUMatrixDaily` +
  smaller per-channel cost fields — **roughly 90-130MB estimated**, pending a direct measurement
  once `phase:'slow'` is fixed (same caveat as SALES_DETAIL above).
- **Not flagged over 700MB** based on this estimate, but this is the least-precisely-measured
  group in this report and should be re-verified with a real isolated measurement in Part 2
  before assuming the estimate holds.

## ADS_DETAIL group (read only by `AdsTab`, `src/App.jsx:11680`)

- `ads.spendDetail`, `ads.allSpendDetail`, `ads.spendDetailByPlatform`, `ads.additionalSpend`,
  `ads.additionalSpendByProduct`, `ads.zeroOrder`, `ads.dailyByCategory` (= raw query
  `adsDailyByCategory`, 1.5-5.2s depending on run, confirmed read at `src/App.jsx:11748-12300`
  via `ads.adsDailyByCategory` — note the response field is actually named `dailyByCategory` per
  `_slow_ads`'s chSlow list, double-check this exact rename in Part 2's implementation since the
  grep above was against the raw query key, not the final renamed field — flagging as a possible
  naming mismatch to verify, not confirmed broken today since it's already working via the
  existing full/unphased path).
- Also reads `salesDailyByCategory` — this one is a TOP-LEVEL-ish field living inside `ads.*`
  per the payload construction; confirmed read at `src/App.jsx:11886,12300,20670`.
- **YTD size/time**: `adsDailyByCategory` (3.0-5.2s across runs) and `salesDailyByCategory`
  (2.7-4.8s) are the two slow queries here; by the byte-profile pattern from `LONG_RANGE_ISSUE.md`
  (daily-grain-by-category queries, not daily-grain-by-SKU, so meaningfully smaller row counts
  than the SKU-grain queries above) — **estimated well under 50MB**, smallest of the three detail
  groups. Not flagged.

## Cross-cutting keys needing special handling

1. **`resolvedDailySKU`** (on `shopify`, `ebo`, `amzSC`, `amzVC`, `flipkart`, `cred`, `firstcry`,
   `myntra`) — **read directly by `OverviewPage`** (`src/App.jsx` lines 103-108,
   `data.amzSC?.resolvedDailySKU`, `data.flipkart?.resolvedDailySKU`, etc., for the per-channel
   "Return %" tiles) AND by each channel's own Sales tab (`sh.resolvedDailySKU`,
   `ebo.resolvedDailySKU`, confirmed above). **It is NOT in `CHANNEL_SLOW_FIELDS`** — it already
   survives `phase:'fast'` today. This is the single field flagged in the earlier
   `fix/overview-ytd` investigation as ~53% of Overview's old payload bloat (242MB of 455MB at
   the time) — **it needs to move to SLOW** (or its own on-demand fetch) for Overview specifically,
   while Sales still needs it at full detail. Since Overview only ever `.reduce()`s it down to a
   return-rate percentage per channel (never renders per-SKU/per-day rows from it), Overview's
   real need here is "give me one number per channel," not the raw array — this is the
   highest-value remaining optimization beyond what `phase:'fast'` already does, and Part 2 should
   decide: (a) compute a pre-reduced `channelReturnPct` scalar map server-side and put THAT in
   fast, leaving the raw `resolvedDailySKU` array in the relevant detail group(s); or (b) leave
   `resolvedDailySKU` in fast for now (it's additive, not fixing it doesn't break anything) and
   revisit only if `phase:'fast'` is still too large after the other fixes. Not re-measured in
   isolation here — flagged for Part 2's design decision, not a blocker.

2. **`shDailySKU`** (and per-channel siblings `mnDailySKU`, `blDailySKU`, `zpDailySKU`,
   `inDailySKU`) — read by **both** Overview (collapsed to a `byDate` reduce for the D2C
   sub-channel sparkline, confirmed in `LONG_RANGE_ISSUE.md` section 3) **and** Sales (`ShopifyTab`
   reads `sh.dailySKU` directly at full per-SKU-per-day grain, confirmed above) **and** P&L's CSV
   export path uses `sh.dailySKU` for XLSX generation (confirmed in prior session's
   investigation, not re-verified in this report but consistent with `dailySKU`'s role). This is
   the field `LONG_RANGE_ISSUE.md` section 5a already recommended adding to Overview's fast
   response specifically — Part 2 should implement that (small, cheap addition) rather than
   making Overview wait for `sales_detail`.

3. **`catMap`/`stateMap`** — see the FAST group note above: read by Overview but currently
   excluded by `phase:'fast'`. Needs a decision in Part 2 (move to fast, or Overview tolerates an
   empty map until a detail phase lands — the brief's "per-section loading state" requirement
   suggests the latter is the intended design, i.e. Overview's state/category breakdown sections
   show a small loader until `sales_detail` or a dedicated light-weight group arrives).

## UNUSED keys — confirmed safe to stop running

Confirmed via `grep -rn "<fieldname>" src/` returning zero matches anywhere in the frontend
(App.jsx, PnLPage.jsx, PnLChannelTab.jsx, and the rest of `src/` checked too, not just the three
named files, in case a field was consumed by a smaller component file this report didn't
individually trace):

| Field | Raw query it's built from | Grep proof | YTD query cost (from `LONG_RANGE_ISSUE.md`) |
|---|---|---|---|
| `shopify.dailySkuCostRows` | `shDailySkuCosts` | `grep -rn "dailySkuCostRows" src/` → 0 matches | 49.7 MB, 15.3-15.6s, 302k rows — **the single most expensive query in the entire 317-query set with zero consumers** |
| (per-channel) `skuWeightShares` | (intermediate computation inside the Shopify weight-slab block, not a single named raw query) | `grep -rn "skuWeightShares" src/` → 0 matches | not separately measured (computed in-process, not its own BQ query) — low priority next to `dailySkuCostRows` but still dead weight in `CHANNEL_SLOW_FIELDS`'s list |
| `returnCat` / `returnSubCat` / `returnSKU` (amzSC) | (removed queries, per existing code comment at `api/bq.js` line ~3172: "returnCat/returnSubCat/returnSKU/orderStatusDebug removed 2026-10-19 — those amzSC payload fields no longer exist") | Already removed from the response; `chSlow('amzSC', [...])` silently skips them since they don't exist on `payload.amzSC`. Listed here only so Part 2 doesn't think these are still live fields needing a bucket. | N/A — already gone |

**Stopping `shDailySkuCosts` from running at all (not just moving it to a detail phase) is the
single highest-value, zero-risk change available** — confirmed nothing anywhere reads its
response field, so there is no frontend behavior to preserve. This should be flagged to the user
as a candidate for Part 2 even though it's technically outside "staged loading" — it is pure
dead weight, 49.7MB/15s of every single current full/unphased request for a field nothing uses.

No other top-level or per-channel field was found with zero consumers — every other field in
`SLOW_PAYLOAD_KEYS`/`CHANNEL_SLOW_FIELDS` was traced to at least one real consumer among
Overview/Sales/PnL/Ads (Intelligence reads only `data.orders`/`data.rows`, both already FAST
and empty-by-design today — `orders, skuRows, rows: []` at `api/bq.js` line ~2890 shows `rows` is
hardcoded empty already, so Intelligence's `data.orders` dependency is the only one worth noting;
it's FAST, unaffected by this work).

## Summary table

| Bucket | Field count (approx) | YTD size | YTD peak RSS | YTD time | Measured directly? |
|---|---|---|---|---|---|
| FAST | ~60 top-level + per-channel totals/daily/netCalc × 15 channels | 11.0 MB | 337-390 MB | 5.9-6.0s | ✅ yes, direct |
| SALES_DETAIL | ~15 fields × 11 channels (state/city/category/SKU-matrix/return-reasons) | ~60-120 MB (estimate) | not isolated | not isolated | ❌ no — blocked by phase:'slow' bug |
| PNL_DETAIL | 6 named fields + 5 heavy source queries | ~90-130 MB (estimate) | not isolated | not isolated | ❌ no — blocked by phase:'slow' bug |
| ADS_DETAIL | 7 fields | <50 MB (estimate) | not isolated | not isolated | ❌ no — blocked by phase:'slow' bug |
| UNUSED | 1 confirmed major (`dailySkuCostRows`) + 2 minor | 49.7 MB of pure waste | n/a | 15.3-15.6s of pure waste | ✅ yes (its query is in the already-measured top-20) |
| (reference) full/unphased today | all of the above | 339.1 MB | 1769 MB (crashes at 1024MB) | 27.3s | ✅ yes, direct |
| (reference) implied SLOW total | SALES+PNL+ADS+UNUSED combined | ~328.1 MB (339.1 − 11.0) | n/a (phase:'slow' crashes) | n/a | ✅ yes, by subtraction |

No single detail group is confirmed or estimated to exceed ~700MB alone — the one real flag in
this report is the `phase:'slow'` crash bug, not a memory-size problem.

## What Part 2 must do before building on top of this

1. Fix the `phase:'slow'` crash (`chMap`/`netRevenueCalc`/`dailyArr` must not assume
   `byChannel`/`byDate` ran) — otherwise none of `sales_detail`/`pnl_detail`/`ads_detail` can be
   measured or implemented safely, since they're built the same way `phase:'slow'` is today.
2. Decide whether to also drop `dailySkuCostRows` entirely (confirmed dead) while wiring the new
   phases — free 49.7MB/15s with zero behavior risk.
3. Decide the cross-cutting `resolvedDailySKU`/`shDailySKU`/`catMap`/`stateMap` handling per the
   notes above — these determine exactly what Overview's "fast" response needs beyond what
   `phase:'fast'` already provides today.
4. Re-measure SALES_DETAIL/PNL_DETAIL/ADS_DETAIL in isolation once (1) is fixed — this report's
   size estimates for those three groups are structurally well-reasoned (based on the
   already-verified top-20 query costs and confirmed field ownership) but are NOT direct
   measurements, and should not be treated as final numbers for Part 3's verification tables.
