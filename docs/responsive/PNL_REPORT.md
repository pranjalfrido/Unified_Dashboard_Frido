# P&L Phase 2 report (mobile + margin watchlist)

Branch `feature/responsive-pnl` (pushed, not merged). Preview: https://vercel.com/pranjal-tripathi-s-projects/frido-navigator/Dhrox5aRVoxSTCNDd93kg2JqipUg (Vercel deployment of 4f7954bd, status success; "Visit" opens the site). Built on `release/responsive` + `fix/pnl-data` (PR #25, merged locally), as planned in `PNL_MOBILE_PLAN.md`.

## What's in it

**Laptop (every tab with the numbers; not on Overall / International):**
- Margin watchlist card: one tile per rule the tab supports (count, ₹ impact, revenue), "Rules for {channel}" popover; click a tile to filter the Financial View ("Flag: … ✕").
- Margin matrix (revenue vs CM1 %, Stars / Grow / Fix / Review; click a dot to find the product) + Biggest fixes (top 6 by ₹ CM1 below the bar, Simulate ↗), where CM1 exists.
- Financial View: Product first, Category second; short headers with full names on hover; red only where a product breaks its channel's rule (old decorative red/green removed; ROAS red only below the row's breakeven ROAS); new BE ROAS and Flags columns; ↗ on hover opens the Price Simulator (D2C) or B2B Costing (Offline) with the product filled in. Fits its card at 1366 and 1280.
- KPI cards, trend, waterfall and EBO store table are unchanged.

**Mobile / tablet (below 1024px):**
- P&L header: 13 channel chips (amber dot on Overall, EBO, International, Myntra), sub-tabs for D2C / Amazon / Offline, date, ⋯ (Refresh, Export).
- Master card as the released Overview, tiles per tab (D2C/Amazon/Flipkart 10, quick commerce 10 with Units, SC/VC and Offline 8 with ASP, EBO 8 without CM2, CRED/Firstcry/Myntra 6, Overall/International 4), previous period dashed.
- Watchlist → rule → product list → sheet → Simulate; matrix quadrant tiles; biggest fixes; margin ladder; Financial view (Category / Product, sort chips, flag dots, sheet with rule-breaking values in red); EBO stores + full store table; Tools card; In-progress strips.

## Your decisions, as built
1. EBO: 8 tiles (Gross, Net Rev, Returns, COGS, GM, SnD, CM1, Units), no CM2.
2. Overall: no channel league, no new calculations; stays In progress.
3. Table colours: red only, per channel bar; ROAS red only below breakeven.
4. Product first, Category second; short headers, full names on hover.
- Ad flags: the ⓘ on "Loss after ads" and "Below healthy ROAS" says they work at sub-category grain (same as spend).
- Previous period: per-product gross / units / returns add up exactly to the card's previous totals on all 20 tab / sub-tab views (table in the verification file).

## Verification (`PNL_MOBILE_VERIFICATION.md`)
All passed: rule check on 8 views (every flag re-derived from the displayed numbers), watchlist totals = sum of listed products (53 rules), previous-period sums (20 views), mobile = laptop (17 views), laptop diff only in the new sections, tap-through on Chromium (incl. real finger swipe) and WebKit, 30 device screenshots with no overflow, production build.

Data path: 1–26 Oct from the live API; screenshots and laptop before/after on September (static file).

## Needs you (`DECISIONS_FOR_SURAJ.md`)
- **P1** D2C "COGS > 50%" and "GM < 50%" always flag the same products (GM % = 100 − COGS %).
- **P2** The bars flag most checked products on several tabs (D2C 128 of 153, Amazon 108 of 119, Offline 41 of 43). Suggest ASP down > 10% and looser Offline/EBO COGS/GM bars.
- **P3** D2C "Others" shows as a big loss (−456% CM2): ad spend tagged "Others" with little revenue.

## Not done / notes
- Locally, live EBO store rows are empty because this machine's API server has no `SUPABASE_SECRET_KEY`; checked on September instead. Vercel has the key.
- Tools open their existing laptop layouts on phones (their mobile layout is Phase 3); a "‹ Back to …" button returns to the P&L.
- PR #25 is still open (no new commits), so the production check hasn't run yet; the watcher is still armed.
- Screenshots are local only (PNGs are git-ignored).
