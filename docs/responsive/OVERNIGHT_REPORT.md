# Overnight report: P&L Phase 2, Ads and Customer (26–27 Oct 2026)

Everything below is pushed to its own branch. Nothing was merged or pushed to `main`; no feature branch was merged into `release/responsive`; `fix/pnl-data` (PR #25) was not touched.

## 1. Status

| Branch | What's in it | Pushed | Preview | Build | Verification |
|---|---|---|---|---|---|
| `feature/responsive-pnl` | P&L Phase 2: margin watchlist, matrix, biggest fixes, Financial View rules, P&L mobile | yes, 5e60fa33 | https://vercel.com/pranjal-tripathi-s-projects/frido-navigator/Dhrox5aRVoxSTCNDd93kg2JqipUg | pass | all pass (`PNL_MOBILE_VERIFICATION.md`) |
| `release/responsive` | latest `main` merged in (job files kept as main's) | yes, a19de010 | — | pass | — |
| `fix/ads-data` | Ads Phase 1: 7 safe data / label fixes | yes, 87a1e224 | https://vercel.com/pranjal-tripathi-s-projects/frido-navigator/8U8NrWSpp6DUbogeeXC9qbr5d7Te | pass | before / after tables (`ADS_FINDINGS.md`) |
| `feature/responsive-ads` | Ads Phase 2: watchlist, daily / 6-month / pacing / share sections, Ads mobile | yes, c36a804b | https://vercel.com/pranjal-tripathi-s-projects/frido-navigator/81SzR2udqqQejxh5BF1cHL9nzcd2 | pass | all pass (`ADS_VERIFICATION.md`) |
| `fix/customer-data` | Customer Phase 1: 8 safe label / comparison / colour fixes | yes, 102bc5b7 | https://vercel.com/pranjal-tripathi-s-projects/frido-navigator/7RWWaPmmP7jfCV1HbyMmH933pxh7 | pass | before / after table (`CUSTOMER_FINDINGS.md`) |
| `feature/responsive-customer` | Customer Phase 2: laptop fixes, two watchlists, Customer + Support mobile | yes (preview built from b5bc2578; reports on top) | https://vercel.com/pranjal-tripathi-s-projects/frido-navigator/8evbh94n6WNKXZ3fWZCg6sK88nf2 | pass | all pass (`CUSTOMER_VERIFICATION.md`) |

Per-page reports: `PNL_REPORT.md`, `ADS_REPORT.md`, `CUSTOMER_REPORT.md`.

## 2. Data fixes applied (old → new)

**Ads (`fix/ads-data`)**
- A1 previous period: ▲/▼ compared with the 90 days before the whole cache, not the same-length window before the range. Overall spend 1–25 Oct ▼66.4% → ▲8.0%; Amazon ▼66.9% → ▲71.0%; D2C CAC badge hidden (no real previous CAC on the cached path).
- A4 Amazon SP / SB / SD split: was the cache's 90-day total for any range. 1–25 Oct ₹4.26 Cr → ₹1.62 Cr (= Amazon spend).
- A5 CRED: "Spend (allocated)" / "ROAS (allocated)" labels, palette. No number change.
- A7 late revenue: Flipkart / Myntra days not reported yet show "pending" instead of a ₹0 dip.
- A8 a ₹2–4 rounding residual no longer creates an "Others" row.
- Additional spend limited to the chosen range; Orders sparkline added.

**Customer (`fix/customer-data`)**
- CA5 previous Total spend left out additional spend: previous-period spend and CAC ▲/▼ now compare like with like.
- CA10 Support daily view compared with the day before → same weekday last week; Sunday inbound calls "Closed".
- CA11 changes of % metrics in points ("▲196.7%" → "▲3.3 pts").
- CA4 payback "1d" was a count of orders → "1.1 orders" (value unchanged).
- CA1–CA3, CA6, CA12–CA15: labels and bases made explicit (picker usable on Segments, "LTV (12-mo revenue)", "Inbound (tickets)" vs "Calls (Ozonetel)", "n/a (voice)", trailing dots trimmed); CA7–CA9 palette and auto daily granularity; CA14 direction-aware colours.

## 3. Decisions for you (`DECISIONS_FOR_SURAJ.md`)
Top 5:
1. **D2** Ads unattributed spend ₹2.86 Cr (33%) is Meta "all products" sale campaigns: map them to products, or keep them as one line.
2. **D4 / C3** Two CAC definitions: Customer CAC includes additional spend and counts 90,342 new customers; Ads uses product spend and 94,191 (1–25 Oct). Pick one.
3. **C2** One payback definition (orders at 35% margin vs months of revenue per customer).
4. **P2** The P&L bars flag most products on several tabs (D2C 128 of 153): loosen the bars or ASP rule.
5. **C7 / C8** Support: "yesterday" is empty before the 11:00 IST rebuild; the FRT watchlist targets come from the SLA and flag chat / email every day. Need your targets.

Also listed there: D3, D5–D8, P1, P3, C1, C4–C6, C9 (Repurchase due needs one new query), C10 ("Revenue at risk" tooltip).

## 4. Verification summary
| Check | P&L | Ads | Customer + Support |
|---|---|---|---|
| Mobile = laptop numbers | pass (17 views) | pass (8 tabs) | pass (Detailed KPIs: every section / metric / period / "vs prev", Day / Week / Month, 0 mismatches; Intelligence 360 of 366, the 6 others phone-only shares) |
| Watchlist rule check | pass (8 views, 53 rules) | pass | pass (recomputed from the API) |
| Previous-period sums | pass (20 views) | — | — |
| Laptop 1366 before / after | only new sections | only new sections | every old number unchanged; only B1 / B2 areas |
| Design system (palette, ≥ 12px, no donuts, no overflow, no inner scroll), Chromium + WebKit | pass | pass | pass |
| Tap-through incl. finger scroll | pass | pass | pass (35 / 35 each engine) |
| Screenshots (SE / 14 / Pixel / small Android / landscape / iPad) | pass (30) | pass (24) | pass (12) |
| Production build | pass | pass | pass |

Nothing failed after fixes. Fixed along the way: Customer phone view had no side gutter; Support root text colour; FRT rule wording when no channel has enough replies.

## 5. Laptop changes per page
- **P&L:** margin watchlist; margin matrix + biggest fixes; Financial View with Product first, short headers, red-only rule colours, BE ROAS, Flags, ↗ to the simulators; fits 1366 / 1280.
- **Ads:** Ads watchlist; daily spend by channel + heat table; last 6 months (one extra cached query); month pacing; spend vs revenue share; unattributed line; Amazon split bar; plain ROAS (red only below 1x / breakeven); "total-sales ROAS" labels.
- **Customer Intelligence:** health watchlist; no donuts; horizontal bars for repurchase cycle and category discounts; one line + toggle on 3 charts; cohort M0 greyed.
- **Customer Support:** watchlist; channel mix split bar; contacts per 100 orders + links; Detailed KPI / ageing tables no longer cut off; TTR scroll hint.

## 6. Not done, and why
- **Customer Repurchase due:** needs a new customer-level query (C9).
- **Support backlog trend:** no snapshot history; today only (BACKLOG).
- **CRED on phones:** keeps its current view (separate data path).
- **P&L Overall:** stays "In progress", no new calculations (your decision).
- **MOBILE_DESIGN_SYSTEM.md §2** not updated on any branch: your working copy has uncommitted edits to it. The new shared components are listed in ADS_REPORT.md and CUSTOMER_REPORT.md.
- **Local limits:** this machine's API has no Supabase / Postgres secrets, so EBO store rows and CRED / additional spend were checked on September static data; Vercel has the keys.

## 7. PR #25 production check
PR #25 (`fix/pnl-data`) is still **open (head 9aa75ddc)** as of 27 Oct 00:09 IST: not merged. The production check (EBO Unmapped / Ignored rows appear, Offline margins match the preview, ▲/▼ load) has **not run**, because it only runs after the merge. The watcher stays armed for the rest of its 12-hour window.

## 8. Suggested merge order
1. PR #25 `fix/pnl-data` → `main` (after your review), then the production check.
2. `fix/ads-data` and `fix/customer-data` → `main` after review (independent; small).
3. Feature branches into `release/responsive` in this order: `feature/responsive-pnl` → `feature/responsive-ads` → `feature/responsive-customer` (each contains the one before it, so later merges are small).
4. One release of `release/responsive` → `main` at the end.
