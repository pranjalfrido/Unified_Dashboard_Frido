# P&L reductions: report

Branch `fix/pnl-reductions` (worktree `C:/wt-pnlr`), from `origin/main` @ `b766ea29`. Plan: `PNL_REDUCTIONS_PLAN.md`.

## Status

| Item | State |
|---|---|
| P&L reads whole-range reductions and column-packed trend rows instead of the per-SKU-per-day arrays | **Done** |
| Ads' margin probe on its own small `pnl_margin` group | **Done** |
| Every number identical (payload, replay, rendered page; 1 / 3 / 5 months, every filter, MyFrido / Mobility, YTD; desktop + phone) | **PASS: 0 differences** (§2) |
| `pnl_detail` size, YTD | **273.5 MB → 36.5 MB** (gzip 24.8 → 8.2 MB); Ads' P&L data **273.5 → 4.2 MB** |
| Peak memory, YTD, `pnl_detail` | **2,500 → 1,638 MB** (1,232 MB under a 1,536 MB heap cap) |
| Fits Vercel Standard (2 GB) at YTD? | **Yes, every phase** (§3). It did **not** before: old `pnl_detail` peaked at 2.5 GB |
| P&L / Ads margin in the browser at YTD | **Before: the tab crashes** parsing the 274 MB response, so no numbers at all. **After: 35 s desktop / 45 s phone (P&L), 31 s / 32 s (Ads margin)**, mostly BigQuery (§4) |
| `npm run build` | passes; lint unchanged vs `origin/main` on touched app files, new files clean |
| Pushed | `origin/fix/pnl-reductions` for a Vercel preview. **Not merged; main untouched** |

### Commits
| Hash | Step |
|---|---|
| `423ac2ba` | 1. `api/_pnlAgg.js`: exact reductions, column trend packs, browser helpers + payload check |
| `888549fb` | 2. Phases: `pnl_detail` ships `pnlAgg`/`pnlTrend` instead of the rows; new `pnl_margin`; replay parity |
| `fdc98a68` | 3. `PnLPage` reads the helpers; Ads probe waits for `pnl_margin` |
| `ed0aeb5c` | 4. Rendered-page parity (browser + Node) and measurement scripts |
| (last) | 5. Report, measurements, script fixes |

### What changed
* **`api/_pnlAgg.js` (new).** One module used by the server and the browser.
  * **Reductions:** the net-revenue-scale sums (D2C Overall / MyFrido / Mobility; Amazon SC, VC, and SC-then-VC as one sequence; EBO, Flipkart, CRED, Firstcry, Myntra), D2C and EBO per-SKU resolved units / gross, and Flipkart per-SKU returns.
  * **Trend packs:** column-packed rows for the day-wise trends: D2C resolved and daily SKU, Amazon SC / VC and Flipkart daily P&L, Amazon / Flipkart / Meta / Google daily spend.
  * **Same expressions:** each is computed with the expressions `PnLPage` used on the rows, in the same order, so the values are identical.
* **`api/_bqPhases.js` (generated).**
  * `pnl_detail` drops 17 row arrays and adds `<channel>.pnlAgg` / `.pnlTrend`.
  * `pnl_margin` is new: 20 fields, 43 queries vs 92.
  * fast / sales_detail / ads_detail are unchanged.
  * The full (no-phase) response is unchanged.
  * `CACHE_VERSION` 15.
* **`src/pnl/PnLPage.jsx`.** About 10 read sites now call the helpers. No formula changed. Without reductions (the static `pnl-data*.json`, which carry rows), the helpers compute the same thing from the rows.
* **`src/App.jsx`, `src/bqPhaseMerge.js`.**
  * Ads loads `ads_detail` + `pnl_margin`.
  * A cached `pnl_detail` counts as `pnl_margin`, so Ads doesn't re-request it after a P&L visit.
  * `pnl_margin` merges before `pnl_detail`.
* **Monthly Trend overlap.** No extraction was done here. `channelData` and `kpiSummary` stay in `PnLPage`. Phase 1's `src/kpi/pnl.js` can import the same helpers, and its job can request reductions instead of rows.

## 2. Parity: every number identical

Old = `origin/main` @ `b766ea29` (exported by the scripts, never modified). New = this branch. Both are fed the **same recorded BigQuery rows**: each case is recorded once live, then every phase is replayed. So any difference would be this change's, not BigQuery noise. Tolerance: none (exact).

| Layer | What | Cases | Result |
|---|---|---|---|
| 1. Payload (`payload-check.mjs`, `replay.mjs`) | Every reduction `===` the original `PnLPage` expression on the JSON-round-tripped full response. Every unpacked trend row field-identical, same order. Every phase's fields `===` the full response's. fast / sales / ads unchanged. `pnl_margin` reductions `===` `pnl_detail`'s | 17 (1 / 3 / 5 months, every filter, ShopifyIndia / MyFrido / Mobility) + YTD + both static files | **exact** (a tampered value is caught: negative test) |
| 2a. Rendered page in Chromium (`render-parity.mjs`) | Real `PnLPage`, old vs new, desktop 1440 px and phone 390 px | 15 one-month cases (all except 3 / 5 months) | **IDENTICAL** |
| 2b. Rendered page in Node (`node-parity.mjs`) | Same comparison where the old page's payload is too big for a browser tab | 1 month (cross-check), 3 months, 5 months, YTD | **IDENTICAL** (136 / 136 / 136 / 115 comparisons) |

**2a covers:**
* 21 tab and sub-tab views: Overall; D2C Overall / MyFrido / Mobility; EBO; Amazon All / SC / VC; Flipkart, Blinkit, CRED, Firstcry, Instamart, Zepto, Myntra, International; Offline All / B2B / Stockist / MT GT / Misc.
* For each view, the full rendered DOM: KPI cards, waterfall, Financial View **with every product's SKU rows expanded**, watchlist flags, margin matrix, and the trend charts' SVG.
* The summary output: KPI totals, per-product rows, daily series including the day-wise COGS / SnD / GM / CM1 / CM2 %, and margins.
* The 4 tools: Price Simulator, Breakeven ROAS, B2B Costing, PO Approval.
* The **Ads margin figure** on its 6 tabs: old input fast + old `pnl_detail` + ads_detail vs new input fast + `pnl_margin` + ads_detail.
* The **static-file path**: the new code on a full response with rows, vs old.
* The previous-period ▲/▼ in the same page.

**2b covers the same views at desktop and phone width:**
* Every prop the page hands to `PnLChannelTab` (the data every desktop and phone channel view renders from), `StorePnLTable` and the 4 tools.
* Each view's summary, and the previous period's summary.
* Ads margins, and the static path for 1 / 3 / 5 months.
* The display components are unchanged code, so identical props mean identical pages. That claim is backed by 2a at 1 month, where both layers ran and both passed.

**Why 3 months, 5 months and YTD use Node.** The old page's response at 3 months (147 MB) crashed the Chromium tab on loading, even with an 8 GB renderer heap. That is the problem this branch fixes.

Recordings and snapshots were deleted after each case.

## Comparison rule for the rendered pages (what is and isn't normalised)

The old and new pages' rendered DOM (`#root.innerHTML`) is compared as a string, with **one** normalisation:
* **What is normalised:** Recharts' auto-generated clip-path id, `recharts<N>-clip`, and only where it appears as an attribute value: `id="recharts<N>-clip"`, `url(#recharts<N>-clip)` and `href="#recharts<N>-clip"`. The regex is `RECHARTS_ID_ATTR` in `scripts/pnl-reductions/render-parity.mjs`.
* **Why:** that number comes from a page-wide counter of chart mounts. In `city` and `paymentType` a chart mounted a few extra times while data arrived in the new page, which shifted every later id by 4 and made all 40 views "differ" on that id alone. Their onSummary output (KPI totals, per-product rows, daily series, margins) was identical.
* **Everything else is compared byte for byte:**
  * all text (every KPI value, table cell, label and %);
  * all numbers;
  * all SVG geometry: path `d`, `points`, `x`, `y`, `width`, `height`, `transform`;
  * all styles and class names.
  
  The same `recharts<N>-clip` string appearing anywhere outside those three attribute forms, e.g. in text, is also compared unchanged.
* **Unit check:** a sample pair differing only in the id compares equal; changing one path point (`L3,4` → `L3,5`) or one text value still makes it differ.
* **Summary output is compared without any normalisation:** the `JSON.stringify` of `onSummary()`, covering the KPI totals, product rows, daily series and margins.
* **Where it was needed:** only `city` and `paymentType`. The other 15 browser cases were identical with no normalisation at all, and they were run before it existed. The Node check (2b) compares props and summaries, which contain no Recharts ids, so it needs none.
* **The Ads probe's comparison is `margins` only.** That is the one field Ads reads from it: `onSummary={sm => setAdsMargins({ …, margins: sm.margins })}`. `pnl_margin` deliberately carries no day-wise trend data, so the probe's `daily` series differs by design and isn't read anywhere.

## 3. Peak memory and Vercel Standard (2 GB)

Measured with `measure.mjs`:
* real handler, one request per process, YTD = 2026-04-01 → 2026-11-02;
* BigQuery's result cache warm for both versions (one warm-up pass first);
* peak RSS is the OS-reported maximum, taken after the response is serialised and before compression, which happens outside the function;
* "1,536 MB cap" = `--max-old-space-size=1536`, my stand-in for a 2 GB function.

| Phase, YTD | Response (gzip) | Peak RSS, no cap | Peak RSS, 1,536 MB cap | Fits 2 GB? |
|---|---|---|---|---|
| fast | 3.2 MB (0.7) | 854 MB | 813 MB | yes |
| sales_detail | 53.6 MB (6.8) | 1,269 MB | 1,177 MB | yes |
| **pnl_detail, before** | **273.5 MB (24.8)** | **2,500 MB** | **2,118 MB** | **no** |
| **pnl_detail, after** | **36.5 MB (8.2)** | **1,638 MB** | **1,232 MB** | **yes** |
| pnl_margin (Ads) | 4.2 MB (0.7) | 1,195 MB | 919 MB | yes |
| ads_detail | 22.9 MB (1.7) | 552 MB | 448 MB | yes |

At 1 month, `pnl_detail` goes 729 → 546 MB and `pnl_margin` peaks at 475 MB.

**Answer: at YTD every phase now fits Standard (2 GB). Before this change P&L at YTD did not.**

Caveats before switching back:
* The tightest is the new `pnl_detail`: 1.64 GB with no heap cap (about 80 % of 2 GB), 1.23 GB with the cap.
* Its peak grows about 180 MB per month of range (546 MB at 1 month → 1,638 MB at 7 months). Ranges well beyond YTD (12+ months), or data growth, would approach 2 GB again.
* The remaining memory is the BigQuery rows and the resolved-return engine's in-memory rows, not the response. Cutting it further means server-side work (fewer or narrower rows), not more response trimming.
* These are local measurements. The first real check on Vercel is the preview of this branch.

## 4. Time to first number (P&L tab, Ads margin figure)

**How it's built.** The real app is behind the login, which this environment can't use, so each total is assembled from measured parts:
* server time per phase, including JSON serialisation (`measure.mjs`, warm BigQuery cache);
* transfer = gzip size at an **assumed** link: desktop 50 Mbps + 20 ms; phone 9 Mbps + 60 ms (≈ DevTools Fast 4G);
* browser `JSON.parse` of each response, and the P&L calculation (channel data, KPI summary, Financial View rows, margins), both **measured** in headless Chromium (`render-parity.mjs --timing`, median of 3). Phone = 4× CPU throttling.

Sequence, as in the app: fast, then the page's detail group (`pnl_detail` for P&L, `pnl_margin` for Ads; before, Ads also used `pnl_detail`), then the calculation.

| | P&L desktop | P&L phone | Ads margin desktop | Ads margin phone |
|---|---|---|---|---|
| **1 month, before** | 13.6 s | 20.7 s | 13.5 s | 20.5 s |
| **1 month, after** | **12.8 s** | **15.8 s** | **10.2 s** | **11.2 s** |
| **YTD, before** | **no numbers: the tab crashes** | **no numbers** | **no numbers** | **no numbers** |
| **YTD, after** | **34.9 s** | **45.3 s** | **30.5 s** | **32.4 s** |

**Where the time goes:**

| Part | Before | After |
|---|---|---|
| 1-month browser, P&L, phone: parse + calculate | 0.9 + 1.0 s | 0.2 + 0.8 s |
| 1-month browser, Ads margin, phone: calculate | 0.8 s | 0.3 s |
| 1-month transfer, phone, `pnl_detail` | 6.4 s (7.2 MB gzip) | 2.4 s (2.6 MB) |
| YTD server time (BigQuery-bound) | 13.9 s fast + 17.9 s `pnl_detail` | 13.9 s fast + 18.5 s `pnl_detail` / 16.2 s `pnl_margin` |
| YTD browser, P&L, phone: parse + calculate | — (crash) | 0.5 + 4.3 s |
| YTD transfer, phone, `pnl_detail` | 22.1 s (24.8 MB) | 7.4 s (8.2 MB) |

The YTD "before" crash happens in headless Chromium while parsing the old 274 MB `pnl_detail` response, with one payload in the tab, as in the app, and an 8 GB renderer heap. The old server response itself completes (17.9 s, 2.5 GB RSS on a 4 GB function).

**What's left.** YTD is now dominated by BigQuery: about 32 s of server time across fast and the detail group, run one after the other. The obvious next step, not done here, is PERF_STATUS §7's: start the detail group in parallel with fast instead of after it. That would cut roughly 14 s off both P&L and Ads at YTD, with no change to any number.

## fix/pnl-shared-logic (570f4414)

**What it is.** One agent commit (29 Oct, "refactor(pnl): extract P&L calculation logic into pure shared pnlShared.js").
* **Where it lives:** only in a local agent worktree (`.claude/worktrees/agent-a28f35cfd10f66579`). No remote branch contains it, and it was never pushed or merged.
* **What it does:** moves about 480 lines out of `PnLPage.jsx` into `src/pnl/pnlShared.js`:
  * `netOf`, `resolvedNetScale` and the D2C net-scale helper;
  * the weight-slab and bucket builders;
  * the D2C, EBO and Offline SnD builders and the D2C day-wise SnD;
  * `computeKpiSummary`.
* **What it leaves:** the `channelData` builder, which is the hard part of the Monthly Trend extraction, stays in `PnLPage`.
* **Stated purpose:** "shared with the Pulse connector". But `frido-data-connector/` does not import it.
* **Verification:** the commit claims "no behaviour change" but carries no parity evidence.
* **Base:** it is built on `6fa77412`, from before staged loading and the security fix. This branch changes the same functions: `resolvedNetScale` now takes sums, and the per-SKU rates come from `api/_pnlAgg.js`.

**Still useful? Not as a merge; possibly as a reference.** It would conflict with `PnLPage.jsx` as it is now, and it predates the reductions its functions should now read. Its useful idea, pulling `kpiSummary` and the SnD builders into pure functions, is a subset of the Monthly Trend Phase 1 extraction (`src/kpi/pnl.js`, which also covers `buildChannelData`). Phase 1 should do that extraction on current code, with the zero-tolerance extraction tests it plans, and can reuse this commit's function boundaries as a starting map. Recommendation: leave it unmerged, and delete the worktree when convenient (I have not touched it).

## Follow-up sketch: static pnl-data files in the reduced form

**What reads them:**
* `App.jsx` `fetchData`: the static shortcut for any **unfiltered** request whose dates equal the file's `mtdStart`/`mtdEnd`, on Overview, Sales, P&L, Ads and Intelligence. The payload is used as a complete response (phase `full`, every section ready).
* `App.jsx` `loadSalesPeriod`: the same shortcut for previous-period loads (mobile Overview ▲/▼, P&L previous period).
* **Writer:** `scripts/generate-pnl-cache.mjs`, run by the hourly GitHub Action `precompute-inventory.yml`, which commits both files.
* **Access:** login required (`middleware.js`), cached `private` (`vercel.json`).

**Size, measured today on the committed files.** "Reduced" = the same payload written as the merged fast + sales_detail + pnl_detail + ads_detail phase responses. It is exactly what the live app already assembles, with reductions instead of rows.

| File | Range in file | Now | Reduced | Gzip now → reduced |
|---|---|---|---|---|
| `pnl-data.json` (MTD) | 1-2 Nov | 7.7 MB | 6.2 MB | 1.3 → 1.2 MB |
| `pnl-data-lastmonth.json` | 1-31 Oct | 66.8 MB | **28.1 MB** | 8.4 → **4.7 MB** |

The MTD file grows through the month toward the last-month figure.

**A bigger, separate cost found while sizing this.** `fetchData` downloads `pnl-data.json`, then **`pnl-data-lastmonth.json`**, just to read their `mtdStart`/`mtdEnd`, before knowing whether either file matches.
* The default range (MTD to yesterday) normally matches the MTD file, so it stops there.
* But the first time in a session that the user picks any other unfiltered range (last 7 days, a custom range, YTD), the browser downloads and parses the whole 66.8 MB (8.4 MB gzipped) last-month file, even though it doesn't match.
* The same happens on the default range whenever the MTD file is behind yesterday.

**Plan sketch (about 1-1.5 days):**
1. `generate-pnl-cache.mjs` writes the reduced form: `pickPhaseFields` for each phase, merged with `mergePhase`, plus the file's own extras (`mtdStart`, `mtdEnd`, `subCatFirstOrderMap`).
   * No frontend change is needed for the content. Every page already runs on phase data without rows: Sales and Overview read `resolvedAgg*`, P&L reads `pnlAgg`/`pnlTrend` through helpers that fall back to rows only when rows exist.
   * `phase 'full'` still means "everything present".
2. A tiny `pnl-data-index.json` (`{ mtd: {start, end}, lastMonth: {start, end} }`), written by the same script, so `fetchData` / `loadSalesPeriod` only download a file whose range matches.
3. **Parity:**
   * `render-parity.mjs`'s static path (new code on the reduced file vs old code on the current file);
   * the staged-loading `agg-check` for Sales / Overview on the same file;
   * a Network-tab check that a non-matching range downloads only the index.
