# Phase 0.1 — Route & Component Inventory

Built by reading `src/App.jsx` (20,161 lines — the monolithic host for most pages), `src/pnl/PnLPage.jsx`,
`src/inventory/*.jsx`, and the other standalone page files in `src/`, plus the URL-routing switch
(`src/App.jsx` ~line 19400) and the sidebar nav config (~line 3320).

Route shape: a single-page app with no react-router route tree for most sections — a `page` state
variable plus hand-built path strings (`/sales/:channel/:subtab`, `/inventory/:subtab`,
`/pnl/:subtab`, `/ads/:platform`, `/logistics/:subtab`) pushed via `history`/`useEffect`, not
`<Routes>`. `react-router-dom` is a dependency but is not the primary navigation mechanism for the
dashboard shell itself — confirm during Phase 1 whether login/reset-password use it separately
(`LoginPage.jsx`, `ResetPasswordPage.jsx` are plausible candidates).

| Section | Tab | Sub-tab | Route (approx) | Components on page | Data density |
|---|---|---|---|---|---|
| Auth | Login | — | `/` (unauthenticated) | Form (email/password), 2 text inputs, submit button, "forgot password" link | Low |
| Auth | Reset Password | — | Confirmed reachable: `App.jsx` renders `<ResetPasswordPage />` directly whenever Supabase's auth `session === 'recovery'` (~line 18970) — i.e. this flow is reached by clicking a password-reset link emailed by Supabase, not by in-app navigation. Not a stub. | Form (likely new-password + confirm fields) | Low |
| Overview | Overview | — | `/` (post-login default) | ~8-10 KPI cards w/ sparklines, 2 trend charts (ComposedChart: ordered revenue + TAT), category/product breakdown tables, India choropleth map (`india-states.json` via d3-geo), alerts panel | High |
| Sales | Overall | — | `/sales/all` | KPI cards, revenue trend chart, category/product tables, state/city breakdown | High |
| Sales | D2C/EBO/Amazon/Flipkart/Blinkit/CRED/Firstcry/Instamart/Zepto/Myntra/International/Offline | per-channel sub-tabs | `/sales/:channel` or `/sales/:channel/:subtab` (D2C has a further `/sales/shopify/:subtab2` level — MyFrido/Mobility/Overall) | Same page shell per channel: KPI cards, trend chart, SKU/category table, geography | High (11 channel tabs × similar density) |
| P&L | Overall/D2C/EBO/Amazon/Flipkart/Blinkit/CRED/Firstcry/Instamart/Zepto/Myntra/International/Offline | `all`/`shopify`(+MyFrido/Mobility sub-toggle)/`amazon`(+SC/VC toggle)/`offline`(+B2B/Stockist/MTGT/misc toggle) | `/pnl/:tab` | Waterfall-style financial table (hierarchical, many columns — COGS%/GM%/SnD%/CM1%/CM2%), trend chart, KPI cards. Also hosts **Price Simulator**, **Breakeven ROAS Calculator**, **B2B Costing Calculator**, **PO Approval Checker** as embedded tools/modals | Very high (wide financial tables are the single densest UI surface in the app) |
| P&L | Financial MIS | — | separate `financial-mis` page (`FinancialMISPage` in App.jsx, also standalone-feeling logic in `api/financial-mis.js`) | Finance-grain report table, Category_Finance/SubCategory_Finance rollups | High |
| Ads | Overview + per-platform: **Meta, Google (both grouped under a D2C umbrella — `d2cPlatforms = ['Meta','Google']`), Amazon, Flipkart, Myntra, Blinkit, Zepto, Instamart** (confirmed by direct code reference, not inferred this round) | `/ads` or `/ads/:platform` | KPI cards (spend/revenue/ROAS/CTR/CPC), trend charts (Meta+Google share a combined D2C trend view per `trendAdsPlatFilter` logic — a genuine cross-platform aggregation worth noting for the mobile dual-axis/toggle guidance), category/product ads breakdown tables, mobile already has a dedicated `MobileAdsPanel` component (confirmed, platform-selector panel — audit its completeness, don't assume it covers the whole page) | High |
| Inventory | Inventory Health | — | `/inventory/inventory_health` | Large filterable table (category/location/stock-status/DOI slicers), stock-status KPI tiles, dead-stock callouts — sourced from static `public/inv-data*.json` CDN files per CLAUDE.md | Very high (this is the single largest table dataset in the app) |
| Inventory | Sales & Allocation | — | `/inventory/sales_allocation` | Table + KPI cards for inventory sales allocation (`SalesAllocationPage.jsx` — already has 41 `isMobile`/`window.innerWidth` references, the most of any non-App.jsx file) | High |
| Inventory | Inward | — | **OPEN QUESTION — see note below, not resolved this pass** — the nav tab is commented out (`App.jsx` ~line 4170), but the page-render branch (`invTab === 'inward'`, ~line 4272) and its "not inward" sibling branch (~line 4350) are both still live in the code, and `InwardPage.jsx` itself is a complete, non-stub component. The URL-reverse-parsing logic for `/inventory/:sub` (~line 19406) falls through any `sub` value that isn't `'health'`/`'sales'` to `sub || 'inventory_health'` — meaning it is genuinely ambiguous from code reading alone whether typing `/inventory/inward` directly would actually render `InwardPage`, silently redirect to Inventory Health, or hit a role-based `allowedTabs` gate first (confirmed role gating exists for the `inventory` page generally, ~line 19497, but not specifically checked against an `inward` sub-value). **Per explicit instruction, this is NOT being resolved by assumption — flagging as an open question for the user: is Inward intentionally hidden (e.g. deprecated, awaiting a different data source) or a stale leftover that should either be fully removed or re-enabled and included in the responsive audit scope?** | Unknown — reachability itself unconfirmed |
| Logistics | Performance Analytics | — | `/logistics/performance_analytics` | Extensive filter sidebar (courier/shipmentType/sddNdd/zone/state/city/payment/category/weight-slab), KPI cards, 2 trend charts, TAT-bucket breakdown, pickup-ageing chart, weight-distribution chart — this page already has the most `isMobile`-aware code in the app (68 refs in App.jsx alone touch logistics logic) and a dedicated `MobileLogisticsPanel` component | Very high |
| Logistics | Cost Analytics | — | `/logistics/cost_analytics` (`LogisticsCostPage.jsx`, 54 `isMobile` refs — second-most mobile-aware file in the app) | Cost breakdown tables/charts | High |
| Logistics | Courier Allocation | — | separate page (`CourierAllocationPage.jsx`, 0 `isMobile` refs — **zero mobile handling**) | Allocation table/tool | Medium-High |
| Customer | Overview / Acquisition & Trends / Retention Cohort / Purchase Behavior / Segments & RFM / Spend & Discounts (6 confirmed sub-tabs, `CustomerPage` ~line 16267) | — | `CustomerPage.jsx` embedded in App.jsx | Overview: acquisition/revenue charts with chart-view and granularity toggles. Trends: acquisition charts. Cohort: retention cohort grid/heatmap-style table with month-limit and display-mode (%/absolute) toggles — likely the densest matrix on this page. Purchase Behavior: day-of-week and lift-display metrics. RFM: segmentation table (date range gets visually blurred in RFM mode per `dateBlurred` logic in App.jsx ~line 4826 — a real UX quirk worth checking on touch, since "blurred but still interactive" states can be confusing on mobile). Spend & Discounts: CAC-band and spend-granularity charts | Medium-High (Cohort sub-tab specifically is high-density) |
| Documents | — | — | `DocumentsPage` (~line 19298) | Document list/upload UI | Low-Medium |
| COGS | — | — | `CogsPage.jsx` (0 `isMobile` refs) | Cost-sheet related table/tool | Medium |
| Packaging BOM | — | — | `PackagingBomPage.jsx` (0 `isMobile` refs) | BOM table | Medium |
| Purchase Ledger | — | — | `PurchaseLedgerPage.jsx` (0 `isMobile` refs) | Ledger table, likely upload/import UI | Medium-High |
| Logistics Ledger | — | — | `LogisticsLedgerPage.jsx` (0 `isMobile` refs) | Ledger table | Medium |
| FLASH | — | — | `FlashPage.jsx` (0 `isMobile` refs) — "Frido Live Analytics & Smart Hub," described as a chat-style panel in CLAUDE.md/sidebar tooltip text | Low-Medium (chat UI) — **this is the "Ask Frido"-equivalent panel** the prompt file asks about by name; confirmed present under the id `flash` |
| Profile | — | — | `ProfilePage.jsx` (0 `isMobile` refs) | Account/profile form, login activity | Low |
| Error/Empty states | — | — | `LoadingOverlay.jsx` exists for loading states. **Confirmed this round: there is no dedicated 404/NotFound page or component anywhere in `src/`** — an unmatched/invalid route has no defined fallback UI found in the codebase. This is a genuine gap (not just "not yet inventoried") worth a deliberate decision in Phase 1: either build a real 404 state or confirm the app's routing structure makes an invalid URL state unreachable in practice (e.g. if `page` always falls back to a known default rather than ever rendering "nothing matched"). | Low, but a real gap |
| Theme / dark mode | — | — | **Confirmed: no dark mode exists.** `src/theme.js` defines a light-mode-only *accent-color* picker (Gold / Indigo / Forest swatches — these change accent/background hue, not a light↔dark toggle), and notably `ENABLED_THEMES = ['forest']` means only one of the three defined themes is actually selectable right now — the picker UI itself may be effectively single-option/vestigial. No `prefers-color-scheme` media query or dark-palette CSS variables found anywhere in `src/index.css`. | n/a |

## Notes on completeness

- **Update (round 3, final):** The auth blocker is resolved — `scripts/save-auth.mjs` was run with
  real credentials and produced a valid session. A full live screenshot sweep (17 routes × 13
  viewports, 221 screenshots, ground-truth file-count verified) plus an interaction-testing pass (7
  pages × 5 representative viewports, clicking through nav/tabs/filters) are both complete — see
  `docs/responsive/before/<route>/*.png` and `.../interact/*.png`. Several real bugs were confirmed
  this round purely from live rendering that code inspection could never have found on its own —
  see `ISSUES.md`'s round-3 P0/P1 additions (the PnL Gross Margin formatting bug, Overview's
  iPhone-SE KPI-row illegibility, the pnl-data.json wrong-origin 404 bug, the Ads "Cr" unit-label
  bug). This closes the live-screenshot gap flagged in rounds 1-2.
- **Still not fully closed, and why:** the P&L embedded tools (Price Simulator / Breakeven ROAS /
  B2B Costing / PO Approval Checker) were not individually screenshotted or interacted with this
  round — the interaction-testing pass's scope (per `RESPONSIVE_PLAN.md`'s own documented judgment
  call) covered 7 representative pages, not all 17, given the time budget for a single audit pass.
  Modals/drawers/date-pickers were captured for the pages the interaction script specifically
  targeted (Overview's date-picker, Inventory Health's and Logistics's filter sheets, Customer's
  tab-switch panels) but not exhaustively for every page's every modal — a genuinely thorough
  component-by-component modal/drawer catalogue across all 17 pages remains a reasonable Phase 1
  follow-up, not something this round claims to have fully closed.
- Round 1's original grep-based navigation mapping (not reading all 20,161 lines of `App.jsx` end to
  end) remains the foundation of this inventory's structure — still a strong, now live-verified pass,
  not a literal line-by-line audit of every component in the file.
- The India choropleth map (`india-states.json`, d3-geo-based, confirmed via `package.json`
  dependency `d3-geo`) lives on the Overview page per code comments found during a prior session
  (not re-verified line-by-line this pass).
