# Customer Phase C2 verification (CUSTOMER_MASTER_PLAN.md Part B §B6)

Run 27 Oct 2026, 05:00–06:00 IST, local build of `feature/responsive-customer` (vite + local API on the live BigQuery / Postgres sources). Data path: Customer Intelligence = live `POST /api/customer` (1–26 Oct 2026, the default range); Customer Support = live `POST /api/customer-support` (default day Mon 26 Oct; Detailed KPIs: last 8 days / 4 weeks / 3 months to 26 Oct). Note: at this hour 26 Oct is not rebuilt yet (DECISIONS C7), so the Support cards show ~100 interactions; that does not affect the phone = laptop checks (same response on both). Laptop = 1366×768, phone = iPhone 14 (390×844).

| Check | Result |
|---|---|
| Support Detailed KPIs: phone sheet = laptop table, every section / metric / period / "vs prev", Count and % | **Pass**: Day, Week and Month, 0 mismatches, 0 metrics missing (table below) |
| Customer Intelligence numbers: phone = laptop, 6 sub-tabs | **Pass**: 360 of 366 phone numbers found on the laptop tab (text, tooltips or the chart's own data); the other 6 are phone-only shares (below) |
| Watchlist rules recomputed from the API (not app code) = app | **Pass** (tables below) |
| Laptop 1366 before / after | **Pass**: every number that was on the laptop is still there; changes only in B1 / B2 areas (list below) |
| Palette + type (0 off-palette colours, 0 text < 12px), Chromium + WebKit | **Pass**: 7 views × 2 engines, 0 / 0 |
| No donuts, no page sideways scroll, no inner scroll in page flow, no card wider than the screen | **Pass**: all 7 views, both engines |
| Tap-through incl. finger scroll (Chromium touch swipe; WebKit pan check) | **Pass**: 35 / 35 on Chromium, 35 / 35 on WebKit |
| Screenshots SE / 14 / Pixel / small Android / landscape / iPad portrait | **Pass**: no overflow, nothing clipped (after the 12px gutter fix 1325fcfe); `docs/responsive/after/customer*/` (PNGs git-ignored, report.json committed) |
| Production build | **Pass** (`vite build`); lint unchanged vs the branch start (App.jsx 354, Support 3 + 1 moved to supportModel.js) |

## Support Detailed KPIs: phone = laptop (rows matched / laptop rows)
| Section | Rows | Day (Count / %) | Week (Count / %) | Month (Count / %) |
|---|---|---|---|---|
| Channel performance | 15 | 15/15 / no toggle | 15/15 / no toggle | 15/15 / no toggle |
| Orders & interaction conversion | 11 | 11/11 / no toggle | 11/11 / no toggle | 11/11 / no toggle |
| Interactions | 9 | 9/9 / 9/9 | 9/9 / 9/9 | 9/9 / 9/9 |
| Tasks | 5 | 5/5 / 5/5 | 5/5 / 5/5 | 5/5 / 5/5 |
| Contact resolution (MCR / FCR) | 12 | 12/12 / no toggle | 12/12 / no toggle | 12/12 / no toggle |
| Escalations & CXO escalations | 27 | 27/27 / 27/27 | 27/27 / 27/27 | 27/27 / 27/27 |
| SLA | 6 | 6/6 / 6/6 | 6/6 / 6/6 | 6/6 / 6/6 |
| Calls (Ozonetel): inbound line | 5 | 5/5 / 5/5 | 5/5 / 5/5 | 5/5 / 5/5 |
| Agents available & available hours | 6 | 6/6 / no toggle | 6/6 / no toggle | 6/6 / no toggle |
| Volume drivers — top 15 by sub category level 2 | 15 | 15/15 / 15/15 | 15/15 / 15/15 | 15/15 / 15/15 |
| TTR (Parent, Child, top 12 groups; Created · Resolved · Pending · TTR per period) | 14 | 14 rows × 29 cells, identical | 14 rows × 17 cells, identical | 14 rows × 13 cells, identical |

Each row compares the 7 (or 4 / 3) period values as text, including "Closed" on Sundays for the Ozonetel rows, and the "vs prev" text (same weekday last week in Day view; points for rates). Group rows (channels, Overall / channels, escalation groups) are compared per group. Metrics on laptop not on phone: **none**. Nothing on the phone is not on the laptop.

## Customer Intelligence: phone numbers vs laptop
| Sub-tab | Phone numbers | Found on laptop | Not on laptop (why) |
|---|---|---|---|
| Overview | 39 | 39 | — |
| Acquisition | 26 | 25 | ₹48 = CAC standard deviation in the efficiency sub-line (laptop draws it as the band, no number) |
| Retention | 41 | 41 | — |
| Behaviour | 88 | 88 | — |
| Segments | 62 | 58 | 6.0% / 5.7% / 7.4% / 80.9% = inactivity bucket shares of the total (laptop shows the counts only) |
| Discounts | 53 | 53 | — |

Formats compared numerically within display rounding (laptop "9.93L" = phone "9,92,658"; "₹1,810" = "₹1.81 K").

## Watchlist rule check
**Customer health, 1–26 Oct 2026** (app shows the same: 1 of 6 triggered)

| Rule | Inputs (from the API) | Bar | Result |
|---|---|---|---|
| Acquisition getting expensive | CAC ₹700 vs ₹717 (−2.3%), ROAS 3.76x vs 3.57x (+5.4%) | CAC ≥ +10% and ROAS down | not flagged |
| LTV:CAC below 3x | ₹2,293 / ₹700 = 3.28x | < 3x | not flagged |
| M1 retention slipping | Aug 2026 cohort 5.10% vs 5.36% (Aug 2025–Jul 2026, size-weighted) | below avg − 0.5 pts | not flagged |
| Repeat revenue share down | 39.15% vs 36.63% (+2.52 pts) | ≤ −2 pts | not flagged |
| Discount dependence | 27.6% vs 22.7% (+4.90 pts) | > 5 pts | not flagged |
| Win-back pool | Hibernating 9,92,658 (₹158.93 Cr) + Cannot Lose Them 36,093 (₹26.76 Cr) | > 0 | **flagged** |

**Customer health, 1–30 Sep 2026** (flagged examples)

| Rule | Inputs | Result |
|---|---|---|
| Acquisition getting expensive | CAC ₹731 vs ₹630 (+16.0%), ROAS 3.59x vs 4.00x (−10.2%) | **flagged** |
| Discount dependence | 27.4% vs 22.3% (+5.10 pts) | **flagged** |
| M1 retention slipping | Jul 2026 cohort 7.03% vs 5.12% | not flagged |

**Support, Fri 23 Oct 2026 vs Fri 16 Oct** (a full day)

| Rule | Inputs | Bar | Result |
|---|---|---|---|
| Pending > 8 days | 903 tickets in the 9–10 / 11–15 / 15+ day buckets | > 0 | **flagged** |
| Agent FRT above target | Chat 1,927 s on 713 replies (> 40 s); Email 7,626 s on 121 (> 15 min); Social 492 s on 114 (< 15 min) | ≥ 20 replies | **flagged** (2 channels; see DECISIONS C8) |
| Escalation rate up | 0.38% vs 0.16% (+0.22 pts) | ≥ +0.3 pts | not flagged |
| Contacts per 100 orders up | 56.3 vs 51.4 (+9.6%) | ≥ +10% | not flagged |

On 26 Oct (not rebuilt yet) the app shows 1 of 4: pending 903 flagged; FRT "Not enough agent replies to check" (fix 1181fbd2; before it said "within target").

## Laptop 1366 before / after (numbers on every tab, before = 8c757e2e, after = this branch, same API)
| Tab | Change | Expected |
|---|---|---|
| Overview | + Customer health watchlist (its numbers are new) | B2.1 |
| Acquisition | Spend vs Sales vs RoAS: one line at a time (ROAS axis ticks gone until RoAS is picked); lines dark green | B1 |
| Retention | Cohort heatmap M0 greyed | B1 |
| Purchase Behavior | Repurchase cycle → horizontal bars; basket donut → split bar | B1 |
| Segments | none | — |
| Spend & Discounts | Spend vs sales / Discount distribution: one line + toggle; category chart → horizontal bars with labels; discounted donut → split bar | B1 |
| Support | + Support watchlist; channel mix donut → split bar + counts; drivers + per 100 orders + links; Detailed KPI and ageing tables no longer cut off; TTR scroll hint, opens on the latest day | B1 / B2 |

All chart data arrays are unchanged except the three removed donuts.
