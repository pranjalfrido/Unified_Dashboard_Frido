# Monthly Trend: Phase 0 report (31 Oct 2026)

Branch `fix/trend-phase0`, stacked on `fix/security-auth`. Plan: `MONTHLY_TREND_PLAN.md` (§10 Phase 0).

## B5: Ads cache truncation (fixed)

**Bug.** The Ads page used `ads-data.json` (a rolling 90-day cache) whenever the selected range's **end** was inside the cache window. A range that **starts** before the window was sliced, so its first days silently disappeared.

**Fix** (`src/App.jsx`, Ads cache loader):
* Before: `cacheCovers = end >= rollingStart && end <= rollingEnd`
* After: `cacheCovers = start >= rollingStart && end <= rollingEnd`

When the cache doesn't hold the whole range, the page now uses the live `/api/bq` data. The page already requests the `ads_detail` phase in every case; the cache only marked it ready early.

**Before / after, August 2026.** Production cache window on 31 Oct: 2 Aug – 30 Oct, so August straddles it. Ad spend for 1–31 Aug:

| Platform | Before (sliced cache: 2–31 Aug) | After (live: 1–31 Aug) | Missing before |
|---|---|---|---|
| Meta | ₹9,50,90,952 | ₹9,73,42,028 | ₹22,51,076 |
| Amazon | ₹1,31,19,065 | ₹1,34,94,792 | ₹3,75,727 |
| Flipkart | ₹32,72,879 | ₹33,53,311 | ₹80,432 |
| Myntra | ₹11,65,309 | ₹12,01,222 | ₹35,913 |
| Google | ₹8,66,151 | ₹8,93,187 | ₹27,036 |
| Zepto | ₹2,88,448 | ₹3,03,940 | ₹15,492 |
| Blinkit | ₹4,49,748 | ₹4,63,566 | ₹13,818 |
| Instamart | ₹1,37,107 | ₹1,41,830 | ₹4,723 |
| **Total** | **₹11,43,89,659** | **₹11,71,93,876** | **₹28,04,217 (2.4%)** |

**Parity.** For 2–31 Aug, the cache and the live load agree exactly (₹11,43,89,659 both, difference ₹0.00). The whole gap is 1 Aug (₹28,04,217). Ranges fully inside the window are unchanged: they still use the cache, with the same slicing code.

## B6: MTD preset on the 1st of a month (fixed)

**Bug.** The picker's MTD preset is the 1st → yesterday, so on the 1st it produced start > end.

**Fix** (`src/App.jsx`, date picker):
* On the 1st, the preset shows as **"MTD · no days yet"**, greyed out with a tooltip, and can't be clicked. This applies to both the phone chips and the desktop list.
* `activePreset` skips it, so the highlight logic never evaluates the reversed range.
* On every other day it behaves exactly as before.
* The default range on load (`getDefaultDates`) was already safe: on the 1st it is the whole previous month.

**Check.** The build passes. The visible behaviour can be seen on the preview tomorrow (1 Nov) or by setting the device date to a 1st; the date picker needs a login.

## BigQuery cost: measured

**One full 1-month `/api/bq` load (June 2026, no filters, no phase).** This is the load the Monthly Trend job would run per month. It ran on 31 Oct 2026, 04:28:47–04:29:34 UTC, and was read back from `region-asia-south1.INFORMATION_SCHEMA.JOBS_BY_PROJECT`.

| Measure | Value |
|---|---|
| Bytes billed | **≈ 29.6 GB** (29,646,389,248 B in the window; 21.7 GB in the 642 jobs that name June directly, and the rest in the same load's comparison-period / rolling-window queries) |
| Query jobs | 642–960 (the window holds 960; background traffic the minutes before was ~200–270 jobs/min with ~0 GB billed) |
| BigQuery time | 36.7 s from first job start to last job end; slowest single job 1.9 s; 1,817 slot-seconds |
| Wall time (handler, incl. Supabase / COGS) | 47.8 s |
| Response size | 42.9 MB (stays in the job; never sent to a browser) |
| BigQuery result-cache hits | 186 of 960 |

**Pricing model.** On-demand: 0 of 980,962 query jobs in the last 7 days used a reservation.

**Context.**
* The dashboard's service account was billed **41.8 TiB in the last 30 days** (1.74 M queries).
* `production.fact_all_platform_sales_report` is rewritten **once a day at ~10:00 IST** (every day of the last 7; twice on 29 Oct).

## Monthly cost estimate for the planned job

All figures use 29.6 GB per month-load and **$6.25 per TiB**. That is the on-demand list price in US multi-region; the asia-south1 (Mumbai) rate may be higher, so check the billing page. The free 1 TiB/month is already used by existing traffic.

| Part | Loads / month | TiB | ≈ $ / month |
|---|---|---|---|
| Closed months M-2, M-3, regenerated **once a day** after the 10:00 IST fact-table rebuild (M-1 and MTD come from the hourly static files, D1: no BigQuery) | 60 | 1.62 | 10 |
| Older months M-4…M-12, weekly | 39 | 1.05 | 7 |
| Daily parity check, 3 sampled months | 90 | 2.43 | 15 |
| Logic changes (full 12-month regeneration), ~4 a month | 48 | 1.29 | 8 |
| **Recommended total** | **≈ 237** | **≈ 6.4** | **≈ $40** (about +15% on today's ~41.8 TiB) |
| One-off pre-launch full run | 12 | 0.32 | 2 |

**Two plan settings would make this far more expensive. Both are corrected in the plan:**
1. **Regenerating on any source change, hourly.** Ads and settlement tables change through the day. If every change re-ran M-2 and M-3, that would be 1,440 loads a month: **≈ 39 TiB, ≈ $240 a month**. Instead, closed months re-run once a day, after the fact table's daily rebuild, which picks up that day's ads and settlement changes too. COGS sheet uploads and SnD rate changes are rare (about monthly) and re-run only the months they touch. They are covered by the "logic changes" line.
2. **The git SHA in `logic_version`.** The hourly bot cache commit redeploys production, so the SHA changes every hour. That would trigger a full 12-month regeneration hourly: 8,640 loads, **≈ 233 TiB, ≈ $1,460 a month**. `logic_version` must be `CACHE_VERSION` + `KPI_VERSION` only. The SHA is stored for information and never compared.

**Timing.** One month takes ~37–48 s, more than the plan's ~15 s estimate. That is still one month per invocation, inside the 300 s limit.
* The last 3 closed months take ~2–2.5 min of chained calls.
* All 12 months take ~8–10 min.
