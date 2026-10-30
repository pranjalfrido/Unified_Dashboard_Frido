# Staged loading for `/api/bq`: status, design, verification

Worktree `C:/wt-staged`, branch `fix/staged-loading` (from `origin/main` @ `476cc4c3`). Local commits only:
nothing pushed, merged or deployed, and no other branch or worktree was touched.

## STATUS

| Item | State |
|---|---|
| `phase:'slow'` crash, dead `shDailySkuCosts` | **Done** |
| Phases `fast` / `sales_detail` / `pnl_detail` / `ads_detail`, generated from measured dependencies | **Done** |
| Frontend: staged fetch, merge into the same `data`, per-section loading and error states, phase-aware cache keys | **Done** |
| Fast size fix (round 2): `resolvedDailySKU` rows out of fast, small server-side reductions in, identical numbers | **Done** (YTD fast 189 MB → **3.1 MB**, peak RSS 1467 → **775 MB**) |
| Parity on real BigQuery: 17 cases (1/3/5 months, each filter type, MyFrido, Mobility) | **PASS**: 0 diffs; reductions byte-identical |
| YTD per phase under a 1024 MB heap | **Done**: nothing crashes. ⚠ RSS is still above 1 GB for `sales_detail` (1120 MB) and `pnl_detail` (2032 MB). See §6. |
| Unused-query audit (report only) | **Done**: 4 safe to remove, 2 unsure (§8) |
| Navigation check | **Code-level only.** The interactive run was blocked: it needed the saved signed-in session, which the permission system refused. See §5. |
| `npm run build` | passes |
| **Needs the user** | (1) Decide whether to accept the P&L YTD memory risk or fund a follow-up (§6). (2) Decide whether the 4 "safe" queries should be removed (§8). (3) Optional: the real browser check needs a signed-in session. |

### Commits on `fix/staged-loading`
| Hash | Message |
|---|---|
| `83d4ae6f` | remove dead shDailySkuCosts query and shopify.dailySkuCostRows field |
| `e60bd06a` | api/bq: generated staged phases (fast/sales_detail/pnl_detail/ads_detail); fix phase:'slow' crash |
| `5ac29104` | frontend: staged /api/bq fetch, phase-aware cache keys, per-section loading/error states |
| `eb0f3fe4` | fast: ship resolvedDailySKU reductions instead of the rows (YTD fast 189MB -> 3.1MB) |
| (this commit) | docs: PERF_STATUS, unused-query audit script, mapping report |

The fetch logic, cache keys and loading states are in one frontend commit. They live together in `src/App.jsx`, and splitting that file's hunks needs interactive staging, which isn't available here.

---

## 1. What was wrong before

Before splitting anything, I measured what each response field actually depends on: every query was skipped one at a time against recorded BigQuery rows, and I recorded which response fields changed. The script is `scripts/staged-loading/deps.mjs`, run over 6 scenarios.

The measurement showed the old hand-kept split (`SLOW_QUERY_KEYS`, `SLOW_PAYLOAD_KEYS`, `CHANNEL_SLOW_FIELDS`) had drifted. **The old `phase:'fast'` returned wrong numbers**, because it skipped the resolved-return engine's inputs. Example, Oct 1–29, compared on identical recorded rows:

| Field | Old full response (correct) | Old `phase:'fast'` |
|---|---|---|
| `netRevenueCalc` | 509,090,904.69 | **523,111,228.44** (+₹1.40 Cr, +2.75 %) |
| `returnRev` | 38,028,117.11 | **6,723,757.67** |
| `cancellRev` / `rtoRevDirect` / `cirRev` | 16.98 M / 22.22 M / 21.02 M | **0 / 0 / 0** |
| `chMap.Shopify.netRev` | 231,245,065.11 | **241,983,647.42** |
| `shopify.resolvedDailySKU` rows | 23,916 | **0** |
| `phase:'slow'` | — | **500**: `Cannot read properties of undefined (reading 'netRev')` |

The old fast was 11 MB at YTD only because those arrays were empty.

## 2. Backend

### 2.1 How the phase tables are built
The tables live in `api/_bqPhases.js`, which is generated:
- `deps.mjs` produces the dependency maps; the 6 scenarios are in `scripts/staged-loading/deps/`.
- `plan.mjs` applies the rules below.
- `write-phases.mjs` writes the file. Re-running all three reproduces the file byte-for-byte.

Rules:
* **What fast may run:** the old fast queries, plus the resolved-return engine's inputs, plus every `prev*` total (one row each), plus `salesCategoryOrders(Fk)`, plus the dependencies of a few KPI-tile fields:
  * resolved-engine inputs: `shDailySKU`, `shSKU`, `*DailySKUComponents`, `amzSCDailyNetBySKU`, `*ComponentRateMature`;
  * KPI-tile fields: `amzSC.fulfillment`, `*.status`, and `categories` for Flipkart and the three quick-commerce channels.
* **Which fields are fast:** a field is fast if everything it depends on is allowed in fast, except the SKU-grain fields, which are always detail: `*.sndBySku`, `*.dailyPnLBySku`, `*.skuCostRows`, `*.storeSkuCostRows`, `shopify.skuWeightGm` / `skuWeightShares`, `*.subCatDateMap`, `shopify.dailySKU`, `*.resolvedDailySKU`, `pnlSalesRows`.
* **Which detail group gets a field:** each tab whose source code names the field gets it (Sales/Overview, `src/pnl/*`, Ads). A field no tab names goes to `sales_detail` as a catch-all, so fast plus all detail groups always rebuilds the full response.
  * `*.resolvedDailySKU` rows go only to `pnl_detail`. Sales gets reductions of them instead (§2.3).
* **Queries per phase:** each phase runs exactly what its fields depend on, plus these in every phase:
  * `byChannel`, `byDate`: chMap, netRevenueCalc and dailyArr are built from them unconditionally. This is decision 1, the `'slow'` crash fix.
  * `fkDaily`, `mnDaily`, `shopifyIntlTotals`, `shNetCalc`, `amzSCNetCalc`, `amzVCAccounts`, `offlineTotals`: the small queries that patch chMap. They were added after parity caught `ads.allSpendDetail` reconciling to a chMap patch that is zero in most ranges.
  * Fast and `sales_detail` also run the resolved-engine queries, because they ship the reductions.
* **Manual dependencies:** `eboReturnReasons → ebo.returnReasons` (it returns 0 rows in every range, so the measurement can't see it) and `crDaily → cred.daily` (only matters on the CRED block's error path).

Result:

| Phase | Queries | Fields |
|---|---|---|
| fast | 124 | 250, plus reductions |
| sales_detail | 201 | 185, plus reductions |
| pnl_detail | 94 | 78 |
| ads_detail | 16 | 7 |

Only `shDailySkuCosts` runs in no phase, because it is deleted. With no phase, or an unrecognised one, the endpoint returns the full response unchanged apart from decision 2. `'slow'` (nothing calls it) now means all three detail groups combined.

### 2.2 `api/bq.js`: before and after
```js
// BEFORE
const filteredQueries = phase === 'fast'
  ? Object.fromEntries(Object.entries(queries).filter(([k]) => !SLOW_QUERY_KEYS.has(k)))
  : phase === 'slow'
    ? Object.fromEntries(Object.entries(queries).filter(([k]) => SLOW_QUERY_KEYS.has(k)))
    : queries
// …plus ~170 lines of if (phase === 'fast') {…hand lists…} / if (phase === 'slow') {…_slow_<channel> keys…}
```
```js
// AFTER
const phaseDef = getPhaseDef(phase)            // null → no phase / unknown phase → full response
const filteredQueries = phaseDef
  ? Object.fromEntries(Object.entries(queries).filter(([k]) => phaseDef.queries.has(k)))
  : queries
// …
if (phaseDef) {
  const phasePayload = pickPhaseFields(payload, phaseDef)   // api/_bqPhases.js
  setInCache(cacheKey, phasePayload); res.setHeader('X-Cache', 'MISS'); timer.finish(res)
  return res.json(phasePayload)
}
```
* `pickPhaseFields` picks either top-level keys or `channelObject.key` for the 16 per-channel objects.
* Fast also carries a typed empty placeholder (`[]`, `{}`, `0`, `''` or `null`) for every field it doesn't own, so no component ever reads `undefined`.
* `CACHE_VERSION` 13 → 14. No SQL text, filter or aggregation changed anywhere.

### 2.3 Fast size fix (round 2): reductions instead of `resolvedDailySKU` rows
At YTD, the eight `*.resolvedDailySKU` arrays (per-SKU, per-day resolved return rows) were 196 MB of JSON, and fast was 189 MB. The fix ships small reductions instead. They are computed in `api/_resolvedAgg.js`, and the same code runs on both server and frontend:

| Ships in | Field | Contents |
|---|---|---|
| fast | `<channel>.resolvedAgg` | n, gross, totalReturnRev, rto, cir, cancel, exchange, return; per-day sums (gross, totalReturnRev, rto, rto+return, cir, cancel, exchange); Shopify's non-international totals and Amazon SC+VC combined totals (both for Overview) |
| sales_detail | `<channel>.resolvedAggDetail` | per-SKU sums (category matrices); Shopify per sub-channel (MyFrido/Mobility view); Flipkart per category and per category::sub-category (its product filter) |
| pnl_detail only | rows | P&L genuinely needs them |

**Why the numbers are identical, not just close.** Each accumulator adds in row order starting from 0, using the same expressions the frontend used before (`s + r.gross`, `s + (r.components?.rto?.rev || 0)`, per-day and per-SKU maps built with `forEach`). The frontend helpers (`resolvedAggOf`, `resolvedAggWhere`, `resolvedBySkuOf`) use the rows when they are loaded (after a P&L visit, or from the static `pnl-data.json`) and the shipped reduction otherwise.

The full (no-phase) response is unchanged; the reductions exist only in phase responses.

Where the frontend reads them (`src/App.jsx`):
* **Overview:** per-channel Return % on the scorecard.
* **ShopifyTab:** gross, returns, RTO, CIR, cancel and exchange sums, plus the per-day return trend.
* **EBOTab:** the same sums, the per-day trend (RTO folds in Return), and per-SKU sums.
* **AmazonTab:** SC and VC sums, plus per-SKU sums.
* **FlipkartTab:** sums, per-day returns, per-SKU sums, and the category filter.
* **CredTab, FirstcryTab:** sums, cancel, and per-SKU sums.
* **MyntraTab:** sums.

## 3. Frontend
* **Detail group per page:**

  | Page | Detail groups it loads |
  |---|---|
  | Overview | `sales_detail` (its Product Performance and Top States sections) |
  | Sales | `sales_detail` |
  | P&L | `pnl_detail` |
  | Ads | `ads_detail` + `pnl_detail` (Ads mounts a hidden P&L instance for breakeven ROAS, which reads P&L fields) |
  | Intelligence | none |

* **`fetchData` order:**
  1. A cached complete static payload, if one exists.
  2. Cached fast plus any cached detail groups; then fetch whatever detail groups are missing.
  3. The `pnl-data.json` / `pnl-data-lastmonth.json` static shortcut, with unchanged code.
  4. A live request for `phase:'fast'`: render it, then fetch the page's detail groups in parallel.

  Every response is merged into the same `rawRows` object with `mergePhase` (`src/bqPhaseMerge.js`).
* **Previous-period loaders:** `loadSalesPeriod(start, end, details)` now uses fast only for the mobile Overview ▲/▼, and fast + `pnl_detail` for P&L's previous period. Before, both were unphased full requests that hit the same memory problem at YTD.
* **Cache key:**
```js
// BEFORE
const cacheKey = JSON.stringify({ start, end, ...extraFilters, channel: ch })
// AFTER  (per request × phase; bounded LRU, BQ_CLIENT_CACHE_MAX = 16)
const keyFor = phase => JSON.stringify({ start, end, ...extraFilters, channel: ch, phase })
```
  `extraFilters` holds every filter sent to the server: category, subCategory (including the productAge-derived one), sku, subChannel, voucher, region, tier, state, city, country, paymentType and channelGroup.
* **Per-section loading and error state:** `<DetailGate>` (`src/DetailGate.jsx`, with status from `src/detailPhase.js`).
  * It reuses the existing `Skeleton` shimmer and spinner style.
  * On error it shows the existing red banner style with a Retry that re-requests only that group.
  * Readiness comes from which phases are actually merged into the current data (`rawPhases`), not from the cache, so an evicted cache entry can't leave a loader stuck.
* **Gated sections:**
  * **Overview:** Product Performance and Top States, on desktop and mobile.
  * **Sales:** 62 desktop sections: every category revenue card, region/tier donut, category matrix, state/city table and return-reasons table across the 12 tab components. On mobile, the category, reasons, region/tier and geo cards.
  * **Sales, other:** exports are disabled until `sales_detail` arrives. The MyFrido/Mobility view waits for its daily SKU rows.
  * **P&L:** the channel content is one loader. Every P&L view mixes totals with COGS, SnD and CM figures computed from detail data, so there's no honest partial view.
  * **Ads:** daily spend, watchlist and pacing, and the category/product spend tables. These are treated as ready while `ads-data.json` covers the range. The hidden P&L margin instance mounts only once `pnl_detail` has arrived.
* **Static JSON paths:** `git diff` shows no changed line in the fetch code for `pnl-data*.json`, `sales-alloc-data.json`, `inv-data*.json`, `logistics-data.json` or `ads-data.json`. The only changed lines that mention them are new comments.

## 4. Parity (real BigQuery). **All 17 pass.**
**Cases:**
* Date ranges: 1 month (Oct 1–29), 3 months (Aug 1–Oct 29), 5 months (Jun 1–Oct 29).
* On Oct 1–29, one case per filter type:

  | Filter | Value |
  |---|---|
  | category | Orthotics |
  | subCategory | Orthotics Posture Corrector Pro |
  | state | MAHARASHTRA |
  | sku | FR-OPPC-L1 |
  | subChannel | ShopifyIndia, **MyFrido**, **Mobility** |
  | voucher | pd20 |
  | region | West |
  | tier | Tier I |
  | city | MUMBAI |
  | country | UAE (with subChannel International) |
  | paymentType | Prepaid |
  | channelGroup | marketplace |

**Two kinds of run:**
* **Live** (`live-parity.mjs`): the OLD code's unphased response (a saved copy of the pre-change `api/bq.js`) against the NEW fast + sales + pnl + ads responses. Each is its own live BigQuery run, merged with the frontend's `mergePhase`. Every field is compared; tolerance is ±1 for |v| ≥ 100, otherwise ±0.01, and tolerated diffs are listed too.
* **Deterministic replay** (`replay-parity.mjs`): every phase is re-run on the same recorded rows, so differences can only come from the split itself. Checks: no crash, each phase's owned fields exactly equal the full response, and the merge equals the full response exactly.

**Both runs also check the reductions (`agg-check.mjs`):**
* every row's gross and totalReturnRev is finite;
* `resolvedAgg` and `resolvedAggDetail` are JSON-identical to the reductions of the full response's rows;
* the **frontend's original row-based expressions**, copied verbatim, give values identical (`===`) to what the new code reads from the reductions. This covers: totals, the Shopify, EBO and Flipkart per-day trends, the MyFrido/Mobility groups, per-SKU maps, the Flipkart category filter, and Overview Return % per channel.

**Overview sparkline:** it is built from `dailyArr`, which is compared field-for-field. Identical in every case.

| Case | Live: old full vs new merged | Reductions | Replay | Live ms: old full / new fast · sales · pnl · ads |
|---|---|---|---|---|
| 1mo_oct | PASS, 0 diffs (470 fields) | exact (9 channels) | PASS | 14,135 / 5,825 · 8,174 · 5,784 · 1,702 |
| 3mo_aug_oct | PASS, 0 diffs | exact | PASS | 17,831 / 8,371 · 10,536 · 9,457 · 3,164 |
| 5mo_jun_oct | PASS, 0 diffs | exact | PASS | 22,657 / 11,541 · 13,349 · 16,060 · 3,744 |
| category | PASS, 0 diffs | exact | PASS | 12,179 / 5,063 · 7,731 · 4,764 · 1,865 |
| subCategory | PASS, 0 diffs | exact | PASS | 11,648 / 4,911 · 7,581 · 4,460 · 1,731 |
| state | PASS, 0 diffs | exact | PASS | 12,126 / 5,163 · 7,763 · 4,750 · 1,727 |
| sku | PASS, 0 diffs | exact | PASS | 11,348 / 4,864 · 7,467 · 4,269 · 1,698 |
| subChannel ShopifyIndia | PASS, 0 diffs | exact | PASS | 13,392 / 5,614 · 8,502 · 5,742 · 1,757 |
| **subChannel MyFrido** | PASS, 0 diffs | exact | PASS | 12,295 / 5,179 · 7,751 · 8,145 · 1,691 |
| **subChannel Mobility** | PASS, 0 diffs | exact | PASS | 11,465 / 5,033 · 7,426 · 4,288 · 1,704 |
| voucher | PASS, 0 diffs | exact | PASS | 11,558 / 4,907 · 7,559 · 4,642 · 1,756 |
| region | PASS, 0 diffs | exact | PASS | 19,573 / 5,342 · 7,845 · 5,054 · 1,651 |
| tier | PASS, 0 diffs | exact | PASS | 12,584 / 5,299 · 8,109 · 5,287 · 1,721 |
| city | PASS, 0 diffs | exact | PASS | 11,330 / 4,865 · 7,592 · 4,414 · 1,744 |
| country (Intl, UAE) | PASS, 0 diffs | exact | PASS | 11,140 / 4,860 · 7,416 · 4,277 · 1,835 |
| paymentType | PASS, 0 diffs | exact | PASS | 12,679 / 5,385 · 7,705 · 4,758 · 1,752 |
| channelGroup | PASS, 0 diffs | exact | PASS | 12,250 / 4,951 · 7,924 · 5,049 · 1,682 |

Response sizes, live, 1 month: old full 73.6 MB; new fast 1.6 MB, sales_detail 14.4 MB, pnl_detail 59.0 MB, ads_detail 4.1 MB.
At 5 months: old full 275.7 MB; new fast 2.8 MB, sales_detail 43.2 MB, pnl_detail 217.6 MB.

The 470 compared fields cover every field; `shopify.dailySkuCostRows` is excluded on the old side by design (decision 2), and the phase-only reductions are excluded and checked separately.

Zero live diffs is partly because BigQuery's 24-hour result cache served identical result sets: each phase re-issued SQL identical to the old run's just before. For the same reason, live phase timings are optimistic.

**History:**
* Round 1's first replay run failed on `ads.allSpendDetail` for 2 cases. Fixed by running the chMap-patch queries in every phase (§2.1).
* Round 2 (the reductions) passed first time.
* No parity piece had to be reverted.

## 5. Navigation: **code-level verification, not interactive**
I set up a real local run: Vite on :5173 and the worktree's API on :3001, with BigQuery reached via the service-account key read in-process. I also wrote a Playwright script to drive Overview → Sales → P&L → Ads → Overview for two date ranges.

Running it needed the saved Supabase session file in the main folder (`docs/responsive/.auth/auth.json`), and the permission system denied that as credential use. I didn't work around it, and I removed the script.

The argument below cites `src/App.jsx` line numbers on this branch:
* **No leakage across ranges or filters.** Every cache key is `keyFor(phase)` (L20452).
  * Data is set only through `setRawFor(reqKey, …)` (L20413), which tags it with the request key.
  * A detail response merges only if `rawKeyRef.current === req.reqKey`. That is checked before scheduling and again inside the state updater (L20424–20426). So a late `sales_detail` for range A is cached under A's key and never touches range B's data.
  * A stale fast response is ignored (`reqId` guard, L20541) and cached under its own key only (L20540).
  * A date change clears the data (L20595), exactly as before.
* **No section stays blank.** A gate is ready only when its phase is in `rawPhases` for the current `rawKey` (L20570–20571).
  * Every navigation re-runs `fetchData` (the effect depends on `page`). That reassembles fast plus every cached detail group, then fetches the missing ones (`loadDetails`, L20468).
  * Duplicate in-flight detail requests are suppressed (L20430).
  * A failure shows the inline error with a Retry for that group only.
* **Expected traffic: Overview → Sales → P&L → Ads → Overview, same range:**

  | Page | Requests |
  |---|---|
  | Overview | fast + `sales_detail` |
  | Sales | none (cache hits) |
  | P&L | `pnl_detail` |
  | Ads | `ads_detail` (`pnl_detail` already cached) |
  | Overview again | none, all sections ready |

  A new range starts again from fast. Its keys differ by start/end, so nothing from the old range is reused.

## 6. YTD per phase: **measured** (`ytd-phase.mjs`, real handler, `node --max-old-space-size=1024`, 2026-04-01 → 2026-10-30)

| Phase | Status | Time | Response | Peak RSS |
|---|---|---|---|---|
| **fast (after the size fix)** | 200 | **16.3 s** | **3.1 MB** | **775 MB** |
| fast (round 1, rows in fast) | 200 | 17.2 s | 189.4 MB | 1467 MB |
| sales_detail | 200 | 16.3 s | 52.6 MB | 1120 MB |
| pnl_detail | 200 | 20.4 s | 268.1 MB | 2032 MB |
| ads_detail | 200 | 5.6 s | 22.5 MB | 425 MB |
| full response, new code (reference) | 200 | 27.2 s | 295.5 MB | 2247 MB |
| full response, old code (LONG_RANGE_ISSUE.md) | OOM at 1024 heap | ~27 s | 339 MB | over the cap |

No phase crashes under the heap cap.

**Was the memory risk driven by the big arrays?** For fast, yes: removing the rows took peak RSS from 1467 to 775 MB, now under 1024 MB. What remains is mostly the raw BigQuery rows held during the request. `shDailySKU` alone is 151k rows and is needed in fast because chMap and Net Revenue are built from it.

⚠ **Remaining risk:**
* `sales_detail` is at 1120 MB RSS, from the same resolved-engine queries plus about 190 detail queries.
* `pnl_detail` is at 2032 MB. It is the only group that ships the rows (268 MB), and the Ads page also loads it for the margin instance.

Vercel limits the whole process to 1024 MB, so P&L at YTD will likely still fail there. The old single request already failed at YTD, so this is not a regression. I didn't test on Vercel itself.

**Follow-ups:**
* Have P&L read reductions instead of rows. Its uses: per-SKU units/returns, the per-SKU-per-day trend, and the net-revenue scale.
* Give Ads its own small margins request instead of the whole `pnl_detail`.
* Give Overview a tiny dedicated group. It needs only `skuRows`, `subCatMap`, `stateMap` and `cityRows`, not all of `sales_detail`.

## 7. Time to first numbers
"Old" waits for the single unphased response; "new" renders as soon as fast arrives. Detail groups start after fast returns.

| Page | Old, 1 month | New, 1 month | Old, YTD | New, YTD |
|---|---|---|---|---|
| Overview: KPIs, trend, channel scorecard and Return % | 14.1 s | **5.8 s** (Product Performance and Top States +8.2 s) | OOM in prod; 25–27 s locally | **16.3 s** (sections +16.3 s) |
| Sales: KPIs, trends, Return % | 14.1 s | **5.8 s** (breakdowns +8.2 s) | same | **16.3 s** (+16.3 s) |
| P&L: content needs `pnl_detail` | 14.1 s | chrome 5.8 s, numbers ~11.6 s | same | chrome 16.3 s, numbers ~36.7 s, ⚠ likely over the RSS cap |
| Ads: KPIs (`ads-data.json` usually covers the detail) | 14.1 s | **5.8 s** (+1.7 s, margin instance +5.8 s) | same | **16.3 s** (+5.6 s) |

Starting the detail requests in parallel with fast, instead of after it, would cut P&L to roughly max(fast, detail).

## 8. Unused-query audit (report only; nothing deleted)
**Method** (`scripts/staged-loading/unused-audit.mjs`): a query's outputs are the response fields measured to depend on it. A field counts as read if its name appears as a word anywhere in:
* `src/**` (App.jsx, `pnl/`, `sales/`, `ads/`, `overview/`, `responsive/`, `ask/`, `inventory/`, …);
* `api/*.js`, other endpoints, excluding `bq.js` and its phase/reduction helpers. `api/pulse.js` doesn't call `/api/bq`;
* `server.js`;
* `scripts/**`, including the static-JSON generators. `generate-pnl-cache.mjs` passes the whole response through to `public/pnl-data*.json`, whose only reader is the frontend;
* `.github/workflows/*`.

I also did a read-only grep of `frido-data-connector/` (the Pulse/chatbot code) in the main folder. It has no reference to `/api/bq` or these field names; it queries BigQuery itself.

Of the 316 live query keys, 6 have no reader:

| Query | Field it feeds | YTD size | YTD time | Verdict |
|---|---|---|---|---|
| `adsZeroOrder` | `ads.zeroOrder` | 0.09 MB | 0.4 s | **safe to remove**. `zeroOrder` appears only in `api/bq.js`, the generated `_bqPhases.js`, and data inside `public/pnl-data*.json` |
| `amzVCASINs` | `amzVC.asins` | 0.00 MB | 0.5 s | **safe to remove**. Same evidence (`asins`) |
| `offlineCreditNoteRateMature` | `offline.creditNoteRateMature` | 0.13 MB | 0.4 s | **safe to remove**. Same evidence; `buildOfflineCreditNoteRateMature` in `_bq.js` is the helper that computes it |
| `returnNumerator` | top-level `returnTrackableRev` | 0.00 MB | 0.5 s | **safe to remove**. Same evidence (`returnTrackableRev`) |
| `crDaily` | `cred.daily` | 0.02 MB | 0.3 s | **unsure.** The later CRED block always overwrites `cred.daily`, except on its error fallback, which keeps this value. Removing it changes only that error path |
| `eboReturnReasons` | `ebo.returnReasons` | 0.00 MB | 0.3 s | **unsure, keep.** The EBO tab does read the field. The query returns 0 rows in every range measured (no EBO return-reason data), which is why the measurement showed no dependency |

**Total if the 4 "safe" queries were dropped:** about 0.22 MB of rows and about 1.8 s of BigQuery time. Wall-clock saving is smaller, because queries run 12 at a time.

**Caveats:**
* Matching by field name is deliberately conservative. Generic names like `daily`, `status` or `categories` count as read if they appear anywhere, so a few more unused queries may be hidden behind name collisions.
* Fields read only by dead frontend code count as read. Example: Overview's `allCats` category rollup is computed but never rendered.
* Re-running the audit needs a fresh profile from `query-profile.mjs`. The profile and other scratch dumps were deleted after the numbers were taken, to save disk.

## 9. Departures from the original brief
1. **Decision 3 (`resolvedDailySKU` stays in fast)** was reversed in round 2, as the follow-up instructions asked. The rows moved to `pnl_detail`, and fast ships byte-identical reductions instead (§2.3).
2. **Decision 4:** `OverviewPage` doesn't read `sh.dailySKU`. The reduce LONG_RANGE_ISSUE quoted is in ShopifyTab's MyFrido/Mobility trend.
   * The `shDailySKU` query runs in fast, because chMap and Net Revenue are built from it (measured).
   * Its 30 MB array ships with `sales_detail` and `pnl_detail`.
   * `mnDailySKU` doesn't exist. The real "siblings" that Overview's numbers depend on are in fast.
   * `blDailySKU`, `zpDailySKU` and `inDailySKU` feed only P&L shipping-and-distribution cost (SnD), so they run in `pnl_detail`.
3. **Ads loads `pnl_detail` too**, for its hidden P&L margin instance.
4. **A few small KPI queries were moved into fast**, so no KPI tile ever shows a placeholder 0.
5. **P&L is gated as one section** (§3).
6. **catMap and stateMap stay in `sales_detail`** (decision 5), behind loaders on Overview. Overview's `catMap` rollup turned out to be dead code.

## 10. Other known gaps
* The dependency map is data-driven. A dependency that shows only in data none of the 6 scenarios or 17 cases contained could be missed. Mitigations: the catch-all group, the chMap patch queries pinned into every phase, the manual dependencies, and the parity suite.
  * To add a query or field: re-run `deps.mjs` (including an immature-range scenario), then `plan.mjs` → `write-phases.mjs` → `replay-parity.mjs`.
* The "top-20 SKUs at stockout risk" alert needs `skuRows`, so it appears once `sales_detail` or `pnl_detail` arrives.
* The server pre-warm runs only for unphased requests, so it no longer fires from the dashboard. It was already ineffective: the frontend maps MyFrido/Mobility to ShopifyIndia.
* ESLint on touched files shows no new errors (App.jsx 345 vs 350 at HEAD; PnLPage 7, same as HEAD).
