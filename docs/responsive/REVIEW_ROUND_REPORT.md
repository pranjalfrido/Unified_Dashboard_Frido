# Review round report (27 Oct 2026)

Work from `PNL_REVIEW_FIXES.md` and `SURAJ_ANSWERS_27OCT.md`. Everything is pushed to its own branch. Nothing was pushed, merged or opened as a PR to `main`; nothing was merged into `release/responsive`; `fix/pnl-data` (PR #25) was not touched.

## Branches and previews

| Branch | Head | Preview (direct, needs Vercel sign-in) | Build |
|---|---|---|---|
| `feature/responsive-pnl` | ef800e74 | https://frido-navigator-7gnhcxmsg-pranjal-tripathi-s-projects.vercel.app | ✓ |
| `fix/ads-data` | 2d60f25c | https://frido-navigator-8h3hutrvy-pranjal-tripathi-s-projects.vercel.app | ✓ |
| `feature/responsive-ads` (has P&L) | c4e7e8d1 | https://frido-navigator-ic9yzl8y9-pranjal-tripathi-s-projects.vercel.app | ✓ |
| `fix/customer-data` | 7aa37917 | https://frido-navigator-e2ocdtjrg-pranjal-tripathi-s-projects.vercel.app | ✓ |
| `feature/responsive-customer` (has P&L + Ads) | 319298b5 | https://frido-navigator-mvoa4m3np-pranjal-tripathi-s-projects.vercel.app | ✓ |

Merge order when you're ready: PR #25 → `main`; `fix/ads-data`, `fix/customer-data` → `main`; then `feature/responsive-customer` alone carries P&L + Ads + Customer for `release/responsive`.

## 1. P&L (`feature/responsive-pnl`)

**P1–P4 (watchlist)**
- P1: no GM rule on D2C. P2: ASP down > 10%; EBO / Offline GM < 40%; materiality ≥ 2% of gross or ≥ 100 units. P3: "Others" out of the watchlist and matrix, ⓘ in the table.
- P4 c: Offline COGS > 60%, Flipkart COGS > 55%, D2C Returns > 25%, Amazon Returns > 20%.
- P4 a: header "x products need action (2+ rules or loss) · y checked", tap → that list; tiles keep full counts.

| Tab | Checked | Tiles flagged (before P4 → after) | Needs action | Top 2 rules if > 40% |
|---|---|---|---|---|
| D2C | 124 | 97 → 90 (73%) | 68 (55%) | Below healthy ROAS 42 · ASP down 36 |
| Amazon Overall | 95 | 73 → 67 (71%) | 39 (41%) | ASP down 39 · COGS > 45% 28 |
| Amazon SC | 73 | 54 → 50 (68%) | 24 (33%) | |
| Flipkart | 34 | 29 → 29 (85%) | 22 (65%) | CM1 < 20% 16 · Loss 13 |
| Offline | 27 | 25 → 23 (85%) | 20 (74%) | CM1 < 30% 19 · COGS > 60% 19 |
| EBO | 33 | 14 (42%) | 7 (21%) | |
| CRED / Blinkit | 6 / 12 | 5 / 4 | 1 / 0 | |

Rule check: every flag correct on 8 views; no more bars changed.

**PNL_REVIEW_FIXES.md §1–6** (one commit each; details in `PNL_REPORT.md`)
- §1 Financial view: P&L-order chips per channel (the §1a table matches the code on all 20 views, no difference), highest first + tap to flip, Units · Revenue · ASP on every row, % sorts on material products ("Show all"), sheet in the same order; laptop column order Units, ASP, Gross, Ex GST, Net, Ret, COGS, GM, SnD, CM1, Spend, ROAS, BE ROAS, CM2, Flags. D2C Returns % top 1: Cramp Relief Belt (₹7.84 K, 100%) → Arch Support Wedge Sandals (₹4.93 L, 35.7%).
- §2 Tools: "‹ D2C  Price Simulator" header, short intro + ⓘ, sticky result bar, one-sign money ("▼ ₹7.83 L", laptop too), equal-width toggles, Reset in ⋯ with Undo, 16px inputs, mobile palette.
- §3 Price Simulator: 3 × 3 grid, readable waterfall. Volume default (logic): 0%, planned = current (₹22.38 L) on first open; the review's −35% was a moved slider, no change.
- §4 Breakeven: overflow 509px → 375px; "Your product".
- §5 B2B: rounding up to the next ₹10 (your answer; ₹504 → ₹510, laptop too), "₹x exact · ₹y quoted"; empty listing price "✓ OK" → "Enter listing price to check" (bug, laptop too).
- §6 PO: bulk upload laptop-only, collapsible products, banner, "usual CM1 on Offline" (Orthotics Heel Protector 7.7%).

**§7 verification** (`PNL_REVIEW_VERIFICATION.md`): phone top 8 = laptop on 139 chip lists (0 mismatches), Units / Revenue / ASP 190 rows equal, tools laptop = phone on all four cases, no overflow at 375 / 360, inputs ≥ 16px, sticky bar hidden while typing, palette + type 0 problems on Chromium and WebKit, laptop diff only where listed, build ✓. Before / after screenshots: `docs/responsive/after/pnl-review/compare/index.html` (local, PNGs git-ignored).

## 2. Ads

| # | Branch | Old → new |
|---|---|---|
| D3 | fix/ads-data | Flipkart estimate added ex GST: 1–25 Oct Flipkart gross ex GST ₹241.32 L → ₹237.75 L, net ₹205.24 L → ₹202.20 L, Flipkart tab net ₹220.30 L → ₹217.03 L; Overall net ₹4,384.18 L → ₹4,381.14 L (Sales and P&L Flipkart / Overall move by the same −₹3.57 L; September unchanged). New rows "CRED (not in categories)" ₹11.63 L and "Flipkart / Myntra estimate (no product detail)" ₹53.81 L: Total = card on every tab. |
| D2 | fix/ads-data + feature/responsive-ads | "Unattributed" line on both paths: 1–26 Oct All ₹2.79 Cr (32.6%), Footwear ₹2.76 Cr 4.73x → ₹1.98 Cr 6.60x; D2C ₹2.76 Cr (43.3%), Footwear 3.51x → 5.88x. Total spend unchanged; P&L ad-spend inputs identical. |
| D4 | fix/ads-data | Ads CAC = Customer CAC: 1–26 Oct ₹672 (94,777 new) → ₹700 (90,930); Sep ₹706 → ₹731. |
| D5 | fix/ads-data | CRED follows the selected dates; steady-state numbers unchanged (Oct ₹11.63 L, Sep ₹26.39 L). |
| D7 | feature/responsive-ads | ROAS-down needs ≥ ₹50 K spend both periods: Sep vs Aug All 46 → 29 products (−₹20.96 Cr → −₹17.90 Cr), D2C 32 → 26. |
| D8 | — | No change (noted). |

Verification: build ✓, lint unchanged, card = table on 8 tabs, palette + type 0 problems on /ads and /ads/D2C (Chromium + WebKit; three off-palette channel greys fixed), screenshots SE / 14 / laptop no overflow.

## 3. Customer

| # | Branch | Old → new |
|---|---|---|
| C1 | fix/customer-data | Inactivity as of the end date ("as of {date}"): as of 30 Sep Active 280,913 → 154,809; 90+ days 1,981,015 → 2,006,992. |
| C2 | fix/customer-data | One payback in months at a fixed 35% margin ("35% margin, P&L CM1 link later", your speed-up): Acquisition "1.1 orders" and Spend & Discounts "3.7 mo" → 10.5 mo both. P&L CM1 link in BACKLOG. |
| C3 | — | Already the Customer definition; no change. |
| C5 | fix/customer-data | Lift totals over all 646,473 customers (was 420,227, LIMIT 500), diagonal out of the maths. Category top 1 Cushions → Covers 5.24x → Cushions → Other 2.59x (then Orthotics → Personal Care 2.19x, Orthotics → Footwear 2.16x, Footwear → Orthotics 1.93x, Footwear → Personal Care 1.91x). |
| C6 | fix/customer-data | As of 26 Oct: Hibernating 992,658 → 860,401; About To Sleep 0 → 132,257 (₹13.03 Cr). |
| C9 | fix/customer-data + feature/responsive-customer | One cached query; Pillows 68,704 and Orthotics 67,811 = direct BigQuery counts. "Repurchase due" card (laptop + phone): 3,11,897 across categories. |
| C4 | feature/responsive-customer | "LTV:CAC on margin" next to revenue: 3.28x (revenue) / 1.15x (35% margin), Healthy bar on the margin one ("Watch"); label only. |
| C7 | feature/responsive-customer | Before 11:00 IST: "Yesterday's support data loads at 11:00 IST", ▲/▼ grey. |
| C8 | feature/responsive-customer | FRT targets chat 15 min, social 30 min, email 4 h (chat still flags at 32 min on 23 Oct). |
| C10 | feature/responsive-customer | Tooltip lists all five win-back segments; ₹185.68 Cr unchanged. |

Verification: build ✓, lint unchanged, phone = laptop for payback, cross-sell, Repurchase due and segments, palette + type 0 problems on 6 Customer sub-tabs + Support (Chromium + WebKit), screenshots SE / 14 / laptop no overflow.

## 4. Housekeeping
- `feature/responsive-pnl` → `feature/responsive-ads` (c4e7e8d1) → `feature/responsive-customer` (319298b5), local merges, pushed. Conflicts kept both sides (watchlist card, phone header, imports, BACKLOG).
- `DECISIONS_FOR_SURAJ.md` on `feature/responsive-customer` is the single full file: P&L, Ads, Customer, answers marked "decided, applied", D6 "answered, not built", plus every "Decisions made without Suraj".
- Your `MOBILE_DESIGN_SYSTEM.md` change committed on `feature/responsive-pnl` (ef800e74) and carried to Ads and Customer.
- After the merges: all three feature branches render on a 390px phone with 0 palette / type problems (P&L, Ads, Customer, Support).

## 5. Data tasks (BACKLOG.md, DATA (team))
Sale-campaign → product mapping; "Socks" in the item master; CRED spend Sep / Oct; D2C additional spend after August; daily open-ticket snapshot. Credit-note tagging and EBO store mappings / cost sheets were already listed. Also logged: use the P&L D2C CM1 % for payback and LTV:CAC.

## Decisions made without Suraj (all in DECISIONS_FOR_SURAJ.md)
- D5: the cache wins for CRED only when the live data is for other dates (always preferring it would have changed September to ₹26.97 L).
- D2: the ₹6.8 L "Socks" spend differs between paths (live name-matches it); fixed by the item-master data task.
- D3: Flipkart's partly-synced last day still sits next to its estimate (the answer covered only the GST fix).
- C5: sub-category totals sent as top 8 + "Other" (the heatmap's own rule).
- C9: order's category, all-time median, "due" = last order 1–2× the median (both ends included); the card says its total adds categories.
- C4: the "LTV:CAC below 3x" watchlist rule still reads the revenue value until the P&L CM1 link.

## Skipped
- **D6** (Unmatched ad spend row on P&L quick commerce): PR #25 was still open, so `fix/pnl-unmatched-spend` was not created (your rule). Answer recorded in DECISIONS.
- Nothing deferred (every item took under 20 minutes).
- Ads D7 October tile didn't load within the check's wait; old → new uses Sep vs Aug.
