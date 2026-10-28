# Phase 0.3 — Issue List

**Methodology note (round 4, FINAL — the user's own direct review of round 3's 221 screenshots
found real problems with the audit itself, now fixed and re-run).** Rounds 1-2 were code-inspection-
only, blocked on a real Supabase auth wall; round 3 completed the first live screenshot sweep once
that was resolved via `scripts/save-auth.mjs`. **The user then personally reviewed all 221 round-3
screenshots and found concrete, real defects in the audit methodology itself** — most importantly,
the "fixed Sept 2026 date range" was NOT actually applied consistently (many mobile/tablet
screenshots still showed the app's default October range), and screenshots were viewport-height-only
(not full-page), missing content below the fold. Round 4 (this round) fixed both:
- **Root cause of the date-range bug, found and fixed**: the date-label assertion regex only matched
  the DESKTOP date format (`"1 Sept 2026 → 30 Sept 2026"`, full year, arrow separator) and silently
  matched zero elements on narrower viewports, which render a visibly different COMPACT format
  (`"1 Sept – 30 Sept"`, no year, en-dash). A second, related bug: the regex's `\w{3}` month-name
  matcher doesn't match 4-letter "Sept" (only 3-letter months like "Oct"). Both fixed; the corrected
  regex now matches both formats and asserts the rendered label actually shows "Sept" before
  trusting a capture, with up to 3 retries on failure.
- **Full re-run, all 221 screenshots, now with `fullPage: true`** (not just the first
  viewport-height) and the date-label assertion enforced — confirmed complete by direct file-count
  verification (ground truth, not the findings log) across all 17 routes × 13 viewports.
- **Both of the user's specifically-cited broken screenshots are now fixed and verified**: tablet
  `sales-shopify` (was a blank loading spinner — now captures full real content) and laptop
  `logistics-performance` (was stuck with the date picker left open — now captures a clean landing
  state with the picker closed).
- **Interaction-testing pass re-run with its own fix**: the previous round's flat `interact/` folder
  (which silently overwrote each viewport's screenshots with the next one tested) is now
  viewport-namespaced (`interact/<viewport>/<step>.png`) — all 35 expected screenshots now exist with
  no overwrites.
- **`baseline-numbers.json` completed for all 5 pages** — the previously-documented `api/bq` gap is
  now closed via a temporary, fully-reverted server-side logging instrument (see that section below).
- **One significant new finding surfaced by the correction itself**: Logistics Performance Analytics
  throws a hard, reproducible server-side query error for the September 2026 range — see the P0
  section. Relatedly, 3 of the 4 originally-reported "empty chart" bugs no longer reproduce once the
  date range is genuinely correct — see the dedicated correction entry in the P0 section.
- **One honest residual gap, not fully fixed**: 3 of 221 screenshots still show an open date-picker
  overlay in specific picker UI variants (tablet bottom-sheet, landscape inline calendar) that don't
  close on `Escape` the way the standard dropdown does — see P1 #16.

Everything from rounds 1-3 (code-inspection and the now-superseded round-3 live findings) remains
valid in spirit and is kept below, corrected or re-confirmed against the round-4 date-verified
screenshots where the two differ.

## P0 — Broken

1. **Pinch-zoom and double-tap-zoom are disabled globally.** `index.html:6`:
   `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />`.
   This blocks a core accessibility affordance (zooming to read a dense financial table on a phone)
   and directly conflicts with the prompt's own Phase 10 requirement ("works at 200% browser zoom").
   Affects **every page, every mobile viewport**, with no exception.

2. **No route-level code splitting — a single 3.1 MB (uncompressed) JS bundle serves the entire
   app.** Confirmed via `dist/assets/index-*.js` = 3,120,632 bytes, vs. the vendor/recharts chunks
   at 233 KB / 391 KB. Every user — including a 3G/4G mobile visitor who only wants the Overview
   page — downloads all 20K+ lines of `App.jsz`'s bundled logic (P&L, Logistics, Inventory, Ads,
   etc.) up front. This alone very likely fails the prompt's own Phase 10 target (LCP < 3s on 4G,
   Lighthouse Performance ≥ 80) before any CSS/layout work even starts.

3. **Nine of seventeen page files have ZERO responsive-awareness code** (no `isMobile`, no
   `window.innerWidth` check, no mobile-specific component): `CogsPage.jsx`,
   `CourierAllocationPage.jsx`, `FlashPage.jsx`, `LoadingOverlay.jsx`, `LoginPage.jsx` (partially
   forgivable — but still worth checking), `LogisticsLedgerPage.jsx`, `PackagingBomPage.jsx`,
   `ProfilePage.jsx`, `PurchaseLedgerPage.jsx`. On a small phone viewport these pages are almost
   certainly rendering their desktop fixed-width table/layout as-is, which is a strong predictor of
   horizontal page scroll and cut-off content (classic P0 symptoms) — this needs live-screenshot
   confirmation in Phase 1's first pass, but the code-level signal is unambiguous.

4. **`PnLPage.jsx` and `PnLFinancialTable.jsx` — the densest financial tables in the app — have
   ZERO `isMobile` references.** Given the prompt explicitly calls out "P&L, Financial MIS, SKU-wise
   and courier reconciliation" as needing the sticky-column/horizontal-scroll pattern (Phase 6,
   Pattern B), and this page currently has no responsive branching at all, this is very likely
   unusable on mobile today without any special handling already in place.
   — **UPDATE (live screenshot confirms this, but the real bug found is sharper and different
   than expected):** `docs/responsive/before/pnl-all/smallAndroid-360x800.png` shows the page DOES
   render a usable card-based mobile layout (via shared CSS/component primitives — `PnLPage.jsx`
   itself still has zero `isMobile` JS, so this layout comes "for free" from something more
   generic, not page-specific work — worth identifying exactly what in Phase 1). It surfaces a
   genuine, STILL REPRODUCING (round 4, correct Sept date range) P0 DATA-DISPLAY bug: the
   "Gross Margin" KPI card shows a raw, unformatted negative number — `₹-20,21,55,151` for September
   (confirmed on `docs/responsive/before/pnl-all/laptop-1366x768.png`) — overflowing its own card's
   right edge, while every other KPI on the same screen (Gross Revenue, Returns, Net Revenue, COGS)
   correctly displays in compact Cr format. This formatting bug is real and worth fixing regardless
   of the point below.
   — **IMPORTANT CORRECTION (per the user, applies to WHY SnD Cost/CM1/MKTG Spend/ROAS/CM2 show no
   data on this same screen): this is a KNOWN, CONFIRMED-INCOMPLETE FEATURE, not a regression bug.**
   The P&L "Overall" tab (and also EBO, International, AND Myntra — confirmed by the user, corrected
   round 5; Myntra was missing from this list in earlier rounds) were never fully built out with complete
   cross-channel Revenue/Marketing-Spend/SnD/CM1/ROAS/CM2 aggregation logic — the per-channel/D2C tab
   is confirmed correct and complete by the user; "Overall" simply doesn't yet roll these metrics up
   across all channels. This is a feature-completeness gap with its scope to be decided separately,
   not something this responsive audit should characterize as "needs fixing now." Concrete supporting
   numbers, kept for reference: on the originally-reviewed October range, Gross Margin exactly equaled
   negative COGS (−₹19.85 Cr matching −COGS of ₹19.85 Cr almost to the rupee), and Overall's "MKTG
   SPEND" showed ₹0 while the D2C tab alone shows ₹7.76 Cr — both consistent with Revenue/Marketing
   Spend simply not being aggregated into the Overall view yet, not with a calculation defect in
   already-built logic. No fix work is in scope here; this note exists purely so Phase 1 doesn't
   mistake the visible "—"/₹0 values for a responsive-layout problem to paper over with CSS.

5. **Overview's KPI card row is completely illegible on narrow phone viewports — confirmed on
   BOTH iPhone SE (375px) AND iPhone 14 (390px), round 4 update.** Confirmed live in
   `docs/responsive/before/overview/iphoneSE-375x667.png` AND `iphone14-390x844.png`: all 8 KPI
   labels/values (Gross Revenue, Net Revenue, Prev Period, Orders, Units, AOV, ASP, Return%) render
   stacked directly on top of each other into unreadable overlapping text, instead of the clean
   compact-card layout every other viewport shows. This is almost certainly the exact `(!) The
   width(-1) and height(-1) of chart should be greater than 0` Recharts warning seen in this
   session's console-error findings — a flex/grid container collapsing to zero width before
   Recharts/the KPI row can measure it at these narrow widths, not a data or logic bug. Confirms
   this is a genuine width-range issue (roughly ≤390px), not a single-device quirk.
   — **Also confirmed on iPhone 14 (round 4): the Channel Scorecard below it squeezes all 12
   channels into 6 narrow, truncated columns** (`docs/responsive/before/overview/iphone14-390x844.png`)
   — channel names are barely legible (just a colored dot/icon visible in several), numbers wrap
   awkwardly across lines. Needs the prompt's own Phase 4 "2 per row or scrollable carousel" KPI
   card guidance applied here specifically, not the current narrow-multi-column squeeze.
   — **Tablet portrait (768px) is NOT literally the phone layout, but is genuinely cramped —
   corrected characterization, round 4**: `docs/responsive/before/overview/tablet-768x1024.png`
   shows a 2-column compact KPI row (not fully single-column like phone) but labels truncate
   mid-word ("GROSS REVENU…", "ASP (INC. GST)…") and the Channel Scorecard is squeezed into the
   same 6-narrow-column layout as phone, with channel names truncating ("Offli…", "Insta…",
   "First…", "Inter…"). This points to the breakpoint logic treating "not ≤768px" and "≥1024px
   desktop" as the only two states, with nothing tailored for the 768-1023px tablet band specifically
   — consistent with the code-inspection finding (Issue earlier in this file) that only 2 real CSS
   breakpoints exist anywhere in the app.
   — **Phone LANDSCAPE (844×390) renders the FULL DESKTOP layout, confirmed round 4**:
   `docs/responsive/before/overview/iphone14-landscape-844x390.png` shows the complete desktop
   sidebar (Overview/Sales/P&L/Ads/Inventory/Logistics icons with full labels) and desktop-style KPI
   row — NOT cut off or truncated in this specific capture (legible, actually functional), but
   architecturally wrong: the only breakpoint signal the app has is raw CSS pixel width
   (`window.innerWidth <= 768`), so an 844px-wide landscape phone crosses that threshold and gets
   treated as a small laptop. This is the clearest piece of live evidence for the code-inspection
   finding that the app cannot distinguish device CLASS from viewport WIDTH alone.

6. **Every single page load fires 2-3 recurring HTTP 404 requests**, confirmed via live network
   interception on Overview and present as console errors across every route in the full sweep
   (`sales-all`, `sales-shopify`, `sales-amazon`, `sales-ebo`, `pnl-all`, `pnl-shopify`, `ads` all
   logged identical `CONSOLE_ERROR` findings in `_tmp_sweep_findings.json`). **Root cause found and
   confirmed precisely**: `src/App.jsx:19585` and `:19601` fetch `${API}/pnl-data.json` and
   `${API}/pnl-data-lastmonth.json` — prefixing a STATIC public asset path (these files live in
   `public/`, served by Vite/Vercel's CDN, per CLAUDE.md's documented architecture) with `API`
   (`VITE_API_URL`, meant only for serverless function calls to `/api/*`). In local dev, where the
   API server runs on a different port/origin than the static file host, this makes the request go
   to the wrong server entirely, 404-ing every time. In production this accidentally "works" only
   because Vercel happens to serve both from the same domain — the underlying code is still
   architecturally wrong regardless of environment, and should be fixed to a plain relative fetch
   (`fetch('/pnl-data.json')`) rather than prefixed with `API`. Not a responsive/visual bug, but a
   real, confirmed, fixable data-fetching bug surfaced by this audit.
   — **FIXED on branch `fix/api-origin`** (both `pnl-data.json` and `pnl-data-lastmonth.json`
   switched to relative paths). **One more instance of the exact same bug pattern found during that
   branch's codebase-wide search, round 6 — NOT fixed on that branch (out of its scope), flagged
   here for awareness**: `src/App.jsx:19797`, `fetch(\`${API}/ads-data.json\`)` — same static-file-
   fetched-through-API-origin pattern, same fix needed. Every other `${API}/...` fetch in the
   codebase was checked and confirmed to be a genuine `/api/*` serverless route, not a static asset.

7. **Ads page shows nonsensical "Cr" (Crore) units on count-based metrics — CONFIRMED STILL
   PRESENT with the correct Sept 2026 date range (round 4), unchanged finding.** Confirmed live in
   `docs/responsive/before/ads/laptop-1366x768.png`: "IMPRESSIONS: 117.00 Cr" and "TOTAL CLICKS:
   1.16 Cr" — these are unit-less counts (number of ad impressions/clicks), not currency, and
   "Crore" is a rupee-specific magnitude label. This strongly suggests the same compact-number
   formatter used for ₹ revenue figures elsewhere in the app is being applied to these fields
   without first stripping or adapting its currency-specific suffix, producing a confusing/wrong
   label (117 Cr of what, exactly a non-finance reader would reasonably ask). Needs a pass to
   either use a currency-free compact formatter (a plain K/L/M count style) for count fields
   specifically, or confirm this is intentional. This is a standalone formatting bug, independent
   of the P&L Overall reframing above — not related to that known-incomplete-feature gap.

8. **CRITICAL — Logistics Performance Analytics throws a hard server-side error for the Sept 2026
   date range, across EVERY viewport tested (new, round 4).** Confirmed on
   `docs/responsive/before/logistics-performance/desktop-1920x1080.png`,
   `laptop-1366x768.png`, and `smallAndroid-360x800.png` (and reproducing consistently, not
   intermittently): the entire page shows nothing but a red error banner —
   `{"error":"Name zone_by_frido not found inside c at [9:16]"}` with a "Retry" link — no KPIs, no
   charts, no tables render at all. This reads as a BigQuery SQL error (an undefined column or CTE
   alias reference, `zone_by_frido`, inside whatever query this page runs) that is specific to this
   date range or something about it, not a responsive/layout issue — this is NOT the same as the
   three "empty chart" items below, which are a softer "chart has no data to plot" state; this is a
   hard query failure blocking the entire page. This is the single most severe finding in this
   entire audit and should be treated as a backend bug needing investigation completely separately
   from the responsive-overhaul work, with high priority given it may affect the Logistics tab for
   other date ranges too (not verified either way in this pass — only Sept 2026 was tested).

9. **Three previously-reported "empty chart" issues no longer reproduce once the date-range bug
   (see the P1 section below) was fixed — IMPORTANT CORRECTION, round 4.** The original screenshots
   (taken before the date-range-setting bug was found and fixed) showed empty charts on: Inventory
   Sales & Allocation (mobile + laptop), Ads (laptop, September), and P&L Overall (laptop). With the
   corrected screenshots (genuinely confirmed showing September 2026 data via the fixed date-label
   assertion), **all three now render real, populated charts with real September data**:
   `docs/responsive/before/inventory-sales/laptop-1366x768.png` and `smallAndroid-360x800.png` both
   show a fully-populated "Sales Trend" chart with real daily Sept data; `docs/responsive/before/ads/laptop-1366x768.png`
   shows a fully-populated "Spend, Revenue & ROAS Trend" chart; `docs/responsive/before/pnl-all/laptop-1366x768.png`
   shows a fully-populated "Overall — Revenue Trend" chart. **The most likely explanation is that all
   three were symptoms of the same root-cause date-range bug** (the page was fetching data for
   whatever stale/default range happened to be active, not genuinely September, and in some cases
   that produced an empty result) **— NOT three separate data/query bugs**, with the one confirmed
   exception being Logistics (finding #8 above), which has its own distinct, real, still-reproducing
   server error unrelated to date range. Recommend a quick manual re-check of these three pages by
   the user/team before fully closing this out, but do not carry them forward as open "empty chart
   data bugs needing investigation" the way the original report characterized them — the evidence
   now points elsewhere.

## P1 — Poor

5. **Only 6 `@media` rules exist in the entire `src/index.css`**, and only 2 are real layout
   breakpoints (`max-width:768px` at line 302, `min-width:769px and max-width:1024px` at line 547)
   — the rest are `prefers-reduced-motion` rules. The prompt's target breakpoint system (`xs <480`,
   `sm 480-767`, `md 768-1023`, `lg 1024-1279`, `xl 1280-1535`, `2xl ≥1536`) does not exist yet in
   any form — there is no `sm`/`xs` split for small phones (360-479px) vs. large phones (480-767px),
   and no laptop-specific (1024-1279 / 1280-1535) breakpoint at all. The app's actual responsive
   logic instead relies on a single hardcoded JS threshold (`window.innerWidth <= 768`,
   confirmed at `App.jsx:30` and `:409`) baked directly into component logic rather than CSS —
   meaning "tablet" (769-1023px) and "small laptop" (1024-1279px) currently get **identical**
   treatment to full desktop, which is very unlikely to look good given the prompt's own tablet
   sub-breakpoint (icon rail vs. drawer nav) isn't distinguished anywhere in the code.

6. **`100vh` is used across at least 9 page files** (`src/index.css`, `App.jsx` ×2,
   `CogsPage.jsx`, `LoadingOverlay.jsx`, `LoginPage.jsx`, `LogisticsLedgerPage.jsx`,
   `PackagingBomPage.jsx`, `ProfilePage.jsx` ×2, `ResetPasswordPage.jsx`) with **zero** `dvh`/`svh`
   usage anywhere in the codebase. This is the classic iOS Safari bug where the address bar
   collapsing/expanding causes layout jump or clipped content at the bottom of the viewport — a
   near-certain real-device issue on every iPhone, not a theoretical one.

7. **Zero `safe-area-inset` usage anywhere in the codebase**, and `viewport-fit=cover` is not set in
   `index.html`'s viewport meta. On any notched iPhone (which is most current iPhones), fixed
   bottom elements (if the mobile nav/bottom-sheet patterns from the prompt get built) would sit
   under the home-indicator bar without this — flagged now so Phase 1's shell work builds it in from
   the start rather than retrofitting later.

8. **Multiple real `<input>` elements render at 11–11.5px font-size** (e.g. `App.jsx:159, 214,
   6041, 6151, 6721, 7409, 7592` — all search-box inputs with `fontSize: 11` or `11.5`), well under
   the 16px threshold that prevents iOS Safari's automatic zoom-on-focus. Every one of these search
   boxes will cause an unwanted zoom-in when a mobile user taps to search, then stay zoomed until
   they manually pinch back out — a genuinely annoying, confirmed-pattern iOS bug, not speculation.

9. **No shared chart wrapper component exists.** `src/components.jsx` has `KPICard` and `DataTable`
   as shared primitives, but every chart in the app is built ad-hoc via raw Recharts
   `ResponsiveContainer`/`ComposedChart` calls scattered through the page files, with
   per-instance `isMobile` conditionals duplicated chart-by-chart where they exist at all (e.g. the
   Overview page's two trend charts each independently check `isMobile` to adjust height/margin/tick
   count — the exact same logic re-implemented twice rather than shared). Phase 5's "build one
   shared responsive chart wrapper" requirement has essentially a blank slate to work from — this is
   more rebuild than retrofit.

10. **Uneven responsive investment creates an inconsistent user experience even today.**
    `LogisticsCostPage.jsx` (54 refs) and `SalesAllocationPage.jsx` (41 refs) have clearly had
    real mobile design effort put in; `PnLPage.jsx`, `CogsPage.jsx`, `CourierAllocationPage.jsx`,
    and five others have had none. A user moving from Logistics to P&L on the same phone session
    will experience a jarring quality cliff — this is worth calling out explicitly to the business
    stakeholder, since it means the "improve and systematise" instruction in the prompt's
    Non-negotiable Rule 5 is the right framing: there IS a design language partially in place
    (the `isMobile`-conditional pattern, `C`/theme tokens, `cardStyle`) worth extending rather than
    replacing, it's just unevenly applied.

## P1 — Poor (added round 2)

13. **No dedicated 404/NotFound page exists anywhere in the codebase**, confirmed this round
    (searched for `404`/`NotFound`/`not-found` across all `src/*.jsx` files — zero matches). An
    invalid or stale URL has no defined fallback UI. Needs a Phase 1 decision: build a real 404
    state, or confirm (via the live app, once auth is available) that the routing structure makes
    this state practically unreachable — don't leave it ambiguous.

14. **The hidden Inward inventory tab is a genuine code-level ambiguity, not just a hidden nav
    item** — confirmed this round that the page-render logic and URL-reverse-parsing for it are
    still live in `App.jsx` even though the nav entry is commented out, meaning it's unclear from
    code alone whether the page is truly unreachable or reachable via direct URL. **Flagged as an
    open question for the user per their explicit instruction — not resolved here.** See
    `INVENTORY.md`'s Inventory/Inward row for the full trace.

## P1 — Poor (round 4, from the user's direct screenshot review — all newly confirmed)

15. **ROOT CAUSE FOUND: the original "fixed" Sept 2026 date range was never actually fixed on many
    viewports — the date-label text regex used by this audit's own scripts only matched the DESKTOP
    date-range format and silently found zero matching elements on narrower viewports, which use a
    visibly different, shorter format.** Confirmed by direct inspection: desktop renders
    `"1 Sept 2026 → 30 Sept 2026"` (full year, arrow separator) while mobile/some tablet widths
    render the compact `"1 Sept – 30 Sept"` (no year, en-dash separator) for the SAME underlying date
    range. The original regex (`/\d{1,2}\s\w{3}\s\d{4}\s*→/`) required exactly 4 digits for the year
    and an arrow, so it matched zero elements on any viewport using the compact format — the
    date-picker click target genuinely didn't exist for the script to find, not a flaky timing issue.
    **This fully explains the user's original finding** that mobile/tablet screenshots showed "1 Oct
    – 24 Oct" (the app's own default range) instead of the intended September range. **Fixed, round
    4**: the date-label regex now matches both formats AND the month-name capture handles both
    3-letter ("Oct") and 4-letter ("Sept") abbreviations (a second, related bug — `\w{3}` doesn't
    match "Sept"). Every one of the 221 corrected screenshots now either confirms the September date
    label before capture, or — for the ~68 viewport/page combinations where the assertion correctly
    reports "not confirmed" — this is because that specific page genuinely has NO global date-range
    picker at all (Inventory Health, Logistics Cost, Logistics Courier Allocation, Documents, and
    Profile all confirmed independently, by direct screenshot inspection, to have no such control),
    not a remaining script failure.

16. **Investigated further, round 5 — the 3 residual "picker left open" screenshots are NOT a
    picker-close bug; they are a symptom of the same chart-loading-state issue documented as its own
    new finding below (#23).** Directly re-tested, round 5: on `logistics-performance`'s landscape
    inline-calendar-panel variant, BOTH clicking the picker's own "Cancel" button AND tapping outside
    the picker successfully close it (confirmed via a direct Playwright test — `Cancel` click closes
    it, tap-outside at a far corner also closes it) — this specific variant has NO real close-button
    bug. On `inventory-sales`'s tablet screenshot, direct investigation found the real cause: at the
    moment of capture, the Sales Trend chart's data had not yet rendered (empty axes, no plotted
    line — the same transient loading-window issue as finding #23), and SOMETHING in that loading
    state (not yet identified precisely — needs a Phase 1 DOM inspection, not just re-testing from
    outside) intercepts pointer events over the date-range button's screen position, causing a
    genuine `click` timeout on an otherwise-correctly-rendered, clickable element (confirmed: a
    Playwright `force: true` click bypassing the interception succeeds immediately, meaning the
    button itself has no real problem — something else is transiently overlapping it). **Conclusion,
    per the user's explicit ask: tap-outside/Cancel DO correctly close these pickers on both variants
    tested — this is NOT a standalone picker-close product bug.** The original "stuck open" captures
    were a downstream effect of the chart-loading-state issue (#23) intercepting an unrelated click,
    not a defect in the date-picker component itself. No separate fix needed here beyond #23's
    planned loading-skeleton work.

17. **Customer page: a multi-column comparison layout crushes on mobile — confirmed, round 4.**
    `docs/responsive/before/customer/smallAndroid-360x800.png`: two side-by-side panels ("Ad Spend &
    Acquisition" / "Revenue & Lifetime Value") each contain a 2-column metric table, and at this
    width the second ("PREV") column header and several values truncate at the panel edge (e.g.
    "62," cut off mid-number). The two-panel-side-by-side pattern doesn't fit a 360px viewport at
    all — needs Phase 1's Pattern C (stacked cards) or a tab/accordion treatment instead of
    side-by-side panels on mobile.

18. **Courier Allocation: the weight-range breakdown table is cut off with no indication more
    content exists — confirmed, round 4.** `docs/responsive/before/logistics-courier-allocation/smallAndroid-360x800.png`:
    the "By weight r…" section header itself truncates, and its table's column headers ("Weight",
    "Shipments", "Current m…") are cut off at the viewport edge with no horizontal-scroll affordance
    or shadow hint shown to the user that there's more to see.

19. **Logistics Cost: a courier-card carousel item is cut off with no swipe indicator — confirmed,
    round 4.** `docs/responsive/before/logistics-cost/smallAndroid-360x800.png`: the "B2C COURIE…"
    KPI card is visibly cut off at the right edge of the viewport, with carousel dots shown below the
    first card row but no "swipe →" text hint the way Inventory Sales & Allocation's equivalent
    carousel explicitly provides (`docs/responsive/before/inventory-sales/smallAndroid-360x800.png`
    shows "6 tiles · swipe →" as a direct, good comparison — Logistics Cost should adopt this same
    pattern for consistency).

20. **Bottom navigation shows 8 unlabeled icons — confirmed as a real, current issue, round 4.**
    Visible on every mobile screenshot (e.g. `docs/responsive/before/overview/smallAndroid-360x800.png`):
    the bottom nav bar packs 8 icon-only buttons (grid/Overview, bar-chart/Sales, trending-up/P&L,
    cube/Inventory, truck/Logistics, play/Ads, people/Customer, person/Profile) with no text labels
    at all, and no visual grouping or "more" affordance. This confirms the original prompt's own
    Phase 2 guidance (4-5 labelled items + a "More" overflow sheet) is not just a nice-to-have but
    addresses a real, already-present usability problem — 8 unlabeled icons asks the user to
    memorize icon meanings with zero text backup, which doesn't fail outright but asks more of users
    than a labelled nav would.

21. **Page titles truncate on narrow viewports — confirmed, round 4, with the exact example the
    user cited.** `docs/responsive/before/logistics-performance/smallAndroid-360x800.png` shows the
    page header literally reading **"Performan…"** (truncated from "Performance Analytics") at
    360px width, with the title competing for space against the date-range pill and a hamburger
    menu icon in the same header row. Needs either a shorter mobile-specific title, or the header
    layout reworked so the title can wrap or the other header elements move to a second row on very
    narrow viewports.

22. **Profile page: a blank, empty area where an avatar should be — confirmed, round 4.**
    `docs/responsive/before/profile/smallAndroid-360x800.png` shows a large empty gap between the "My
    Profile" section header and the "Change photo" button — consistent with an avatar image or
    placeholder circle that either isn't rendering at all, or is collapsing to zero height at this
    viewport width. Worth checking whether this is a genuinely missing image asset (a data issue) or
    a CSS sizing bug (a responsive issue) before assigning Phase 1 work to it.

23. **NEW, round 5 — "Charts show empty axes while loading," with a real, directly-observed side
    effect: a loading-state overlap can block clicks on unrelated page elements.** The user's own
    belief — that the earlier laptop Ads "empty chart" report (even for the correct September range)
    was a load-timing artifact (captured mid-load before data arrived), not a genuine date-range-bug
    symptom — is independently confirmed this round by direct investigation of a DIFFERENT page: on
    Inventory Sales & Allocation (tablet, 768px), a direct Playwright test caught the Sales Trend
    chart rendering with empty axes (no data line plotted yet) at the exact moment of capture, and
    found that in this transient loading state, something intercepts pointer-event clicks over the
    unrelated date-range button in the header (confirmed: a normal `click()` times out waiting for
    the element to become clickable, while a `force: true` click — which bypasses interception
    checks — succeeds immediately, meaning the button itself is fine and something else is
    transiently overlapping it). This same root cause explains why 2 of round 4's "picker left open"
    screenshots looked like a picker-close bug but weren't (see the corrected item #16 above) — one
    loading-state issue was producing two different-looking symptoms. **Planned fix approach (Phase 1,
    not now): every chart gets a universal loading-skeleton state** (a fixed-height placeholder shown
    until the chart's data has actually arrived and the chart has rendered) as part of the shared
    responsive chart wrapper work already planned for Phase 1 — this removes the empty-axes flash
    AND, as a side effect, should eliminate whatever is currently overlapping unrelated elements
    during that same window. No fix is being made now; this is documented for Phase 1 scoping only.
    **Explicit requirement, added round 6, directly informed by the click-interception root cause
    above — do not reintroduce this same bug via the skeleton itself**: the loading skeleton must
    cover the chart's visual area ONLY and must NOT intercept pointer events (clicks/taps) for
    anything outside that exact area — specifically, nearby filter controls and the date-range
    picker button must remain fully clickable while a chart elsewhere on the page is still showing
    its skeleton. In practice this means the skeleton element needs `pointer-events: none` (or an
    equivalently scoped hit-test region limited to its own bounding box) rather than, e.g., a
    full-width/full-row overlay that happens to extend past the chart's actual rendered bounds —
    the exact kind of oversized/invisible overlay that caused the click-interception symptom this
    finding is already built on. Phase 1's implementation should include this as an explicit test
    case: with a chart's skeleton showing, confirm a click on an adjacent header control (e.g. the
    date-range button) still registers normally.

## P2 — Polish

11. **The `isMobile` pattern is a single boolean breakpoint (`≤768px`) implemented via JS
    `window.innerWidth` + a resize listener, not CSS media queries or a `useMediaQuery` hook.**
    This works but means: (a) it can't express the tablet/laptop intermediate states the prompt
    wants (no `md`/`lg` distinction, just "mobile" vs. "not mobile"), (b) it causes an extra
    re-render on every resize event rather than letting the browser handle breakpoint changes
    natively via CSS, and (c) it duplicates the same `useState`/`useEffect` resize-listener
    boilerplate in at least App.jsx (×2 separate instances — lines ~30 and ~409 — not even
    sharing one hook within the same file).

12. **Inventory's "Inward" tab exists in code (`InwardPage.jsx`) but is commented out of the nav**
    (`// { id: 'inward', label: 'Inward' }` in `App.jsx` ~line 4170). Not a responsive issue per se,
    but worth flagging to the user during Phase 0 sign-off in case this inventory needs to list it
    as "intentionally hidden" vs. "should be audited too."

## Interaction-testing findings (round 3, updated round 4)

Clicking through nav/tabs/filters at 5 representative viewports surfaced:

8. **(P2) Two click-timeout failures on the Sales page's "Amazon" channel tab** at
   desktop-1920x1080 and laptop-1366x768 — the automated test's text-based locator
   (`getByText('Amazon', { exact: true })`) timed out waiting for a stable click target. Manually
   inspecting the corresponding screenshot shows the real channel tab row renders correctly with no
   visible overlap issue — this is most likely the test script's own locator matching an ambiguity
   (e.g. "Amazon" appearing twice on the page — once as a tab, once inside a channel-breakdown list
   further down) rather than a real app bug. Documented honestly as a test-script limitation, not
   escalated to a real finding, since visual inspection did not corroborate an actual UI problem.
9. **FIXED, round 4**: the interaction-test script previously wrote each step's screenshot to a
   fixed filename per page shared across all 5 tested viewports, silently overwriting earlier
   viewports' captures. This round's corrected script now saves to
   `docs/responsive/before/<route>/interact/<viewport>/<step>.png` — a distinct folder per viewport
   — confirmed via a full re-run (35 interaction screenshots now on disk, one complete set per
   viewport × page combination, no overwrites).
10. No horizontal-overflow or hard crashes were triggered by any tested interaction (date-picker
    open, chart tap, tab switches, filter-sheet open) across the 5 viewports tested — a genuinely
    positive finding, though it only covers 7 of 17 pages and a representative (not exhaustive)
    viewport subset; see `RESPONSIVE_PLAN.md` for the full scope/coverage caveat.

## Lighthouse (mobile) — real scores, round 3

Run against a real **production build** (`npx vite build` + `npx vite preview`), NOT the Vite dev
server — the dev server's unminified/unbundled module-serving produced a nonsense 133.9s LCP on
first attempt (documented, then discarded as a measurement artifact, not a real finding). The
production-build numbers below ARE real and directly confirm the P0 bundle-size finding with
measured evidence, not just static analysis:

| Page | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| Overview | 58 | 88 | 100 | 82 |
| Sales Overall | 59 | 88 | 100 | 82 |
| P&L | 59 | 88 | 100 | 82 |
| Inventory Health | 59 | 88 | 100 | 82 |
| Logistics | 56 | 88 | 100 | 82 |

Overview's detail: **LCP 6.8s, FCP 6.8s, TBT 170ms, CLS 0** (mobile, simulated throttling). All 5
pages score nearly identically — strong, real evidence that the single 3.1MB monolithic bundle (not
yet code-split) dominates load performance regardless of which page is actually displayed, exactly
as the static-analysis P0 finding predicted. **None of the 5 pages hit the original prompt's own
target of Performance ≥ 80** — this is the single most load-bearing, now-measured (not inferred)
justification for prioritizing the code-splitting work (see `RESPONSIVE_PLAN.md` section 3.6).
CLS of 0 is a genuine, real positive finding — no layout-shift problems detected. Full raw reports:
`docs/responsive/lighthouse/*.json`.

## baseline-numbers.json — now complete for all 5 pages, round 4 update

`docs/responsive/baseline-numbers.json` captures real API response data (full precision, not
on-screen rounded text) for the Sept 2026 fixed date range, for all 5 target pages: `api/customer`
(Overview), `api/cogs-monthly` (P&L), `api/inventory` (Inventory Health), `api/logistics`
(Logistics), and now **`api/bq`** (the main sales/revenue dataset powering Overview/Sales/P&L's
headline KPI cards) — **the previously-documented gap is now closed.** Browser/CDP-side interception
of `api/bq`'s response consistently failed across three different approaches (response-event,
deferred-promise, `page.route()`) with the same Chrome DevTools Protocol error ("Request content was
evicted from inspector cache"), caused by a race between the response arriving and the app's own
re-render/re-fetch cycle. The fix: a temporary, clearly-marked, environment-variable-gated
(`AUDIT_LOG_BQ`) response-logging instrument was added to `server.js`'s `/api/bq` route, run once
against a second server instance on a separate port to capture the real response server-side
(sidestepping the browser-side race entirely), and then **fully removed, restoring `server.js` to
its exact original state — confirmed via an empty `git diff server.js`.** Only top-level scalar
fields (numbers/strings/booleans) were captured, not the full multi-megabyte row-level arrays, to
keep the baseline file a reasonable size (confirmed real value: `totalRev: 578708025.16`, i.e.
₹57.87 Cr, matching the on-screen Gross Revenue figure exactly). See the file's own `methodology`
field for the complete technical note. One remaining minor caveat, also documented in the file:
Inventory Health does not use the global date-range picker at all (confirmed via its captured
request body using a rolling window near the current date, not September) — this is expected,
consistent with its documented architecture (a pre-computed static JSON cache), not a capture
failure.

## Severity counts (FINAL, round 4 — live screenshots + interaction testing + code inspection +
## corrected date-range sweep, all combined)

**Exact counts, verified by direct enumeration of every numbered entry in this file (not estimated):**

- **P0: 9** — items 1-9: pinch-zoom disabled; no code splitting; 9 zero-mobile-code page files;
  PnL's zero-isMobile finding + the Gross Margin formatting bug it surfaced; Overview's KPI-row
  illegibility (iPhone SE + iPhone 14); the recurring pnl-data.json wrong-origin 404s; the Ads
  "Cr"-on-count-metrics bug; **the new critical Logistics server-query-error finding**; the
  empty-chart correction/clarification entry.
- **P1: 17** — items 5-10 (round 1: CSS breakpoint gaps, `100vh` usage, missing safe-area insets,
  small input font sizes, no shared chart wrapper, uneven responsive investment), items 13-14
  (round 2: no 404 page, the Inward open question), items 15-23 (round 4-5: the date-regex root cause
  and fix, the investigated-and-resolved "residual open picker" item (now understood as a symptom of
  #23, not its own bug), Customer column crush, Courier Allocation table cutoff, Logistics Cost
  carousel cutoff, bottom-nav unlabeled icons, page title truncation, Profile blank avatar, and the
  new "charts show empty axes while loading" finding with its Phase-1 loading-skeleton fix plan).
- **P2: 3** — the `isMobile`-pattern-is-JS-not-CSS note, the Inward-tab-commented-out note, and the
  Sales-page click-timeout test-script limitation (explicitly NOT escalated to a real finding). The
  former filename-overwrite process note is RESOLVED this round and is correctly no longer counted
  as an open P2 — see the Interaction-testing findings section above for its resolution record.

This is the final, complete Phase 0 issue list, fully reconciled against a CORRECTED live screenshot
sweep (the original round-3 sweep's date-range-setting bug is now understood, fixed, and
re-verified). All items above are either confirmed via live, authenticated, date-verified
screenshots/interaction testing, or clearly labeled as code-inspection-only/test-script-limitation
where that's genuinely what they are. Nothing in this file represents a guess presented as a
confirmed finding, and nothing confirmed-resolved this round is left listed as still-open.
