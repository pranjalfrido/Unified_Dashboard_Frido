# Phase 0.5 — Responsive Overhaul Plan

## Environment & Method (read this first — honest account of what was and wasn't done)

**Goal for this pass:** produce `INVENTORY.md`, `ISSUES.md`, and this plan, per
`DASHBOARD_RESPONSIVE_PROMPT_2.md`'s Phase 0, with **zero code changes**.

**What worked:**
- Local API server (`npm run server`, Express wrapper around the same `api/*.js` handlers used in
  production, confirmed at `server.js`) started cleanly on port 3001, matching `.env.local`'s
  existing `VITE_API_URL=http://localhost:3001` — no config changes needed, no `vercel dev` login
  friction.
- Vite dev server started cleanly (port 5174, since 5173 was already in use).
- Playwright (`playwright@1.62.1`, already a devDependency) launched a real Chromium browser
  successfully in this environment with no sandboxing issues.

**What was blocked, and why:**
- The dashboard has a real Supabase-auth login wall (`src/LoginPage.jsx`,
  `supabase.auth.signInWithPassword`) — there is no dev-mode bypass, test-user shortcut, or
  anonymous-access path found in the code. Attempting the audit would require real, valid
  credentials, which were not available to supply non-interactively in this session. **The
  authenticated screenshot sweep across all pages/viewports from the prompt's Phase 0.2 was
  therefore not performed.**
- What WAS done instead: the **login page itself** was screenshotted at all 13 required
  viewports (desktop/laptop/tablet/mobile, portrait+landscape) — see
  `docs/responsive/before/login/*.png` — and programmatically checked for horizontal overflow at
  each size (all passed, zero overflow). This confirms Playwright + the dev environment work
  end-to-end and are ready to go the moment real credentials are available.
- The full **inventory, issue list, and this plan** were instead built by direct source-code
  inspection (see `INVENTORY.md`'s and `ISSUES.md`'s own notes on method) — a legitimate
  substitute per this task's own instructions when screenshot automation is blocked, but it is
  **not a replacement** for the real thing. Several issues (especially P1/P2 visual/spacing ones
  that only show up in actual rendered layout) are very likely still undiscovered.
- **Lighthouse scores were not captured** — same root blocker (can't reach authenticated pages to
  measure them) plus no Lighthouse CLI/CI integration found in this repo to run against the
  (reachable) login page alone meaningfully. This is a gap, not a silent skip — flagged here per
  instruction.

**Round 2 update — the unblock path is now built, but still not exercised.** Per the user's explicit
instruction (no passwords ever typed into chat), `scripts/save-auth.mjs` now exists: it opens a real,
visible (headed) Chromium window, the user logs in there with their own real credentials exactly as
they normally would, then presses Enter in the terminal once they're past the login form — the
script saves the resulting session via Playwright's `storageState()` to
`docs/responsive/.auth/auth.json` (gitignored, confirmed added to `.gitignore` this round; never
committed). No password is ever seen, typed, or stored by this agent at any point.

**As of this update, `docs/responsive/.auth/auth.json` does NOT exist** — the user has not yet run
`node scripts/save-auth.mjs`. This is the single hard blocker on everything below that requires a
live, authenticated page: the full screenshot sweep, real Lighthouse scores, the modal/drawer/picker
completion, and the number-integrity baseline file. All of that is accurately described in this plan
as "pending," not fabricated or guessed at.

**What WAS completed this round without needing live access:** the inventory gaps that are pure
code-reading work (Ads/Customer sub-tabs now confirmed by direct reference, Reset Password flow
confirmed reachable, 404/error-page absence confirmed, dark-mode absence confirmed), the Inward
open question properly flagged rather than assumed, and every planning/sequencing decision in
section 3 below (page order, FULL vs. USABLE tiers, code-splitting sequencing, the viewport-meta
fix spec, the login-page-specific fixes, and FLASH's reduced scope) — all of which are documentation
and judgment calls the user explicitly handed down this round, not things that need a rendered page
to write down correctly.

**Round 3 update — the audit is now complete.** The user ran `scripts/save-auth.mjs` with real
credentials; `docs/responsive/.auth/auth.json` now holds a valid session. Using it:

- **Full screenshot sweep**: all 17 routes × all 13 required viewports (221 screenshots), fixed
  date range **1 Sept 2026 – 30 Sept 2026** ("Last Month" preset, set via the real date-picker UI
  once per page load), completeness verified by direct file-count (ground truth), not by trusting
  the findings log (which accumulated stale crash-artifact entries from a mid-sweep Vite dev-server
  crash caused by rapid repeated browser launches — a real environment-stability lesson, documented
  here: throttle Playwright browser launches with a short pause between them when running a large
  sweep against a local Vite dev server, or it can take the server down).
- **Interaction-testing pass**: 7 pages × 5 representative viewports (desktop/laptop/tablet/large
  phone/small phone — a deliberate judgment call, not all 13, to fit the time budget; see the
  scoping note in `_tmp_audit_lib.mjs`'s `INTERACTION_VIEWPORTS`, carried into this plan rather than
  lost with the deleted script) — nav tabs, sub-tabs, and filter-sheet buttons clicked, before/after
  overflow checked, opened states screenshotted.
- **Lighthouse (mobile)**: run against a real PRODUCTION build (`vite build` + `vite preview`), after
  the Vite dev server produced meaningless 100+ second LCP numbers on a first attempt (unminified
  dev-mode module serving, not a real app problem — documented, then correctly discarded). Real
  scores: Performance 56-59, Accessibility 88, Best Practices 100, SEO 82 across all 5 target pages
  — see `ISSUES.md`'s Lighthouse section for the full table and what it means for prioritization.
- **`baseline-numbers.json`**: built via real API response interception, successful for 4 of 5 pages'
  supporting endpoints, with one honestly-documented capture limitation (`api/bq`) — see `ISSUES.md`.

This closes the live-access gap that blocked rounds 1-2. The remaining open items are the two
still-unanswered user questions (Inward page reachability, Customer page tier placement — see the
Summary section at the end of this file) and the deliberately-scoped-down coverage noted above
(P&L's embedded tools and the other 10 non-interaction-tested pages still only have base screenshots,
not interaction testing) — both are genuine remaining gaps, not silently hidden ones.

**Round 4 update — the user personally reviewed all 221 round-3 screenshots and found real,
concrete defects in the audit methodology itself, now fixed.** Two new findings worth carrying
forward as their own line items in future Phase 1 planning, beyond the page-by-page issue list in
`ISSUES.md`:

- **Date-range assertion bug and fix (methodology finding, not an app bug)**: the round-3 sweep's
  date-label regex only matched the desktop date-range format (`"1 Sept 2026 → 30 Sept 2026"`) and
  silently found zero matching elements on narrower viewports, which render a visibly shorter
  compact format (`"1 Sept – 30 Sept"`, no year, en-dash instead of an arrow) — plus a second bug
  where the month-name matcher didn't handle 4-letter month abbreviations ("Sept" vs "Oct"). Fixed in
  round 4: the regex now matches both formats, and every screenshot capture now ASSERTS the rendered
  date label before trusting it, retrying up to 3 times on failure. This explains and resolves the
  user's original finding that several mobile/tablet screenshots showed the wrong (October, the
  app's default) date range despite the audit script believing it had set September. Also fixed:
  screenshots are now full-page (`fullPage: true`), not just the first viewport-height, so content
  below the fold (tables, charts, maps) is now actually represented.
- **A genuine, severe, NEW backend bug found via the corrected sweep**: Logistics Performance
  Analytics throws a hard server-side query error (`"Name zone_by_frido not found inside c"`) for
  the September 2026 range, reproducing across every viewport tested. This is unrelated to the
  responsive-overhaul work and needs its own dedicated backend investigation — see `ISSUES.md`'s P0
  section for full detail. Relatedly, 3 of the 4 originally-reported "empty chart" issues (Inventory
  Sales & Allocation, Ads, P&L Overall) no longer reproduce as empty once the date range is genuinely
  correct — likely symptoms of the same date-range bug, not separate data defects, though this
  should get one more quick re-verification pass before being fully closed out.
- `baseline-numbers.json` is now complete for all 5 target pages — the previously-documented `api/bq`
  gap is closed via a temporary, fully-reverted server-side logging instrument added to `server.js`
  (confirmed removed via an empty `git diff server.js` after use) — see `ISSUES.md` for the technical
  detail.

---

## 1. Design-system foundation (adapted to this app's actual stack)

**Confirmed stack:** React 19.2, `react-router-dom` 7 (present as a dependency but the dashboard
shell itself uses a hand-rolled `page` state + manual path strings rather than a `<Routes>` tree —
worth deciding in Phase 1 whether to formalize this or leave it as-is per Rule 5's "don't replace
the stack without asking"), Vite 8, Tailwind 3.4 (present but `src/index.css` shows most styling is
hand-written CSS + inline `style={{}}` objects with a shared `C` color/theme token object, not
Tailwind utility classes in practice — Tailwind appears under-utilized relative to how much of the
actual styling happens via JS-computed inline styles). Recharts 3.8 for all charts. No dedicated
table library — `DataTable` in `components.jsx` is hand-built. No map library beyond `d3-geo` +
raw SVG path rendering for the India choropleth (no react-simple-maps or similar).

**Breakpoints — recommend introducing proper CSS custom-media-style breakpoints alongside the
existing JS `isMobile` pattern, not replacing it overnight:**

```css
/* add to src/index.css as CSS variables/comments documenting the scale, even before every
   component is migrated to use them via @media queries */
:root {
  --bp-xs: 480px;   /* small phones, below this */
  --bp-sm: 767px;   /* large phones, up to this */
  --bp-md: 1023px;  /* tablet, up to this */
  --bp-lg: 1279px;  /* small laptop, up to this */
  --bp-xl: 1535px;  /* laptop/desktop, up to this */
  /* 2xl: >= 1536px */
}
```

Given the existing codebase already leans on a JS `isMobile` boolean baked into ~15 files, the
pragmatic migration path is: (1) introduce a shared `useBreakpoint()` hook returning
`'xs'|'sm'|'md'|'lg'|'xl'|'2xl'` (single resize listener, used everywhere, replacing the currently
duplicated `useState`+`useEffect` boilerplate found independently in `App.jsx` twice and in several
other files), (2) keep boolean `isMobile`/`isTablet` derived from it for files that only need a
coarse check, so existing conditional logic doesn't all need rewriting at once, (3) progressively
add real CSS breakpoints for the tablet/laptop distinctions the current JS pattern can't express at
all (see Issue #5).

**Layout grid, spacing scale, typography, number formatting, design tokens, viewport/safe-area,
touch targets, motion:** adopt exactly as specified in the prompt file's own Phase 1 section — no
conflicts found with the existing stack that would require deviating from it. One addition specific
to this app: the existing `C` theme-token object (referenced throughout `App.jsx`, e.g. `C.bg`,
`C.acc`, `C.t1`/`C.t2`/`C.t3`) should be the single place new spacing/radius/shadow/z-index tokens
get added, rather than introducing a second, parallel token system — confirm its definition
location (likely `src/utils.js` per the prior session's own documentation of `fmt`/`C` living
there) before Phase 1 starts.

---

## 2. Per-page plan

Given the live-screenshot gap above, this per-page plan is necessarily **structural/directional**
(what SHOULD happen per breakpoint, based on the prompt's own Phase 2-7 patterns applied to each
page's known component mix from `INVENTORY.md`) rather than screenshot-verified fixes for specific
pixel-level problems. Phase 1's first screenshot pass should be used to sharpen this into exact
fixes per page.

| Page | Mobile | Tablet | Laptop | Desktop |
|---|---|---|---|---|
| Login | Already correct — single centered form, no overflow at any size confirmed this pass. Low priority. | Same | Same | Same |
| Overview | KPI cards → 2/row compact or horizontal snap carousel (prompt Phase 4); India map → full-width, tap-state bottom sheet + ranked list below (prompt Phase 5's explicit map guidance); 2 trend charts stack to 1 column (the existing `isMobile` grid-column logic already does this — extend pattern, don't rebuild) | 3-column KPI grid; map at reduced but still substantial width; trend charts may stay 2-up if width allows (`md` breakpoint doesn't exist yet — this page currently treats tablet identically to mobile OR desktop depending on the `≤768` cutoff, needs explicit tablet treatment) | 4-column KPI grid, full shell | Full shell, 4-6 column KPI grid |
| Sales (all 12 channel tabs) | Tab bar → horizontally scrollable chips (currently likely a plain row given no evidence of scroll-snap tab implementation found); KPI cards compact; SKU/category tables → Pattern C (card/list view) given these are record-style rows | Tab bar chips or segmented control; tables may use Pattern A (priority columns) if width allows | Standard desktop tab bar; full table columns | Same, generous spacing |
| P&L (all tabs + Financial MIS) | **Highest-priority mobile fix in the app** — zero existing responsive code (Issue #4). Financial table needs Pattern B (sticky first column + horizontal scroll + sticky totals row) per the prompt's own explicit callout of P&L as a Pattern-B candidate. Embedded tools (Price Simulator, Breakeven ROAS Calculator, B2B Costing, PO Approval Checker) need individual mobile audit — these are complex multi-input forms, likely need Phase 7's single-column form treatment | Pattern B still likely needed given column count; tab bar as chips | Full table, standard tabs | Full table |
| Ads | KPI cards compact; per-platform trend charts → mobile chart adaptations (fewer ticks, compact numbers); breakdown tables → Pattern A or C | Standard | Standard | Standard |
| Inventory Health | **Second-highest priority** — this is the single densest table dataset in the app (per `INVENTORY.md`). Needs Pattern B (sticky column) at minimum, likely combined with the existing filter-slicer UI needing a bottom-sheet treatment (prompt Phase 3) since it already has some `isMobile` code (8 refs) to build on rather than start from scratch | Pattern B | Full table + inline filters | Full table + inline filters |
| Sales & Allocation (Inventory) | Already has the most mobile-aware code of any sub-page (41 refs) — likely needs refinement/consistency pass rather than ground-up work; verify it actually matches the prompt's target patterns once screenshots exist, don't assume existing `isMobile` code is already correct | Verify | Verify | Verify |
| Logistics (Performance Analytics) | Has a dedicated `MobileLogisticsPanel` already — audit it against the prompt's actual bottom-sheet/filter-sheet spec (Phase 3) rather than assuming it already matches; likely closest to "done" of any page given 68 `isMobile` refs in this one page's logic | Needs explicit tablet treatment — currently binary mobile/desktop split per Issue #5 | Icon-rail nav per prompt's laptop spec (not yet built anywhere in the app — this is a shell-level change, Phase 2) | Full sidebar |
| Logistics Cost Analytics | Second-most mobile-aware file (54 refs) — same "audit, don't rebuild from scratch" note as above | Needs tablet treatment | Standard | Standard |
| Courier Allocation | **Zero mobile code** — ground-up mobile work needed | Ground-up | Standard | Standard |
| Customer | Minimal mobile code found — audit RFM tab specifically given its date-range-blur interaction (`dateBlurred` logic) may behave oddly on touch | Audit | Standard | Standard |
| Documents | Low data density — likely lower priority, but zero mobile code found, needs at minimum a pass-through check | Audit | Standard | Standard |
| COGS / Packaging BOM / Purchase Ledger / Logistics Ledger | **All zero mobile code.** These are lower-traffic internal tool pages per their naming (cost-sheet/BOM/ledger management) — recommend deprioritizing relative to Sales/P&L/Inventory/Logistics in the implementation order below, but they do need SOME pass given the "entire dashboard, Overview to Profile" scope the prompt explicitly states | Lower priority | Standard | Standard |
| FLASH ("Ask Frido"-equivalent chat panel) | Prompt explicitly asks for "full screen on mobile, side panel on desktop" — **zero mobile code currently (`FlashPage.jsx`, 0 refs)**. This is a named, explicit requirement in the prompt file (Phase 2 nav + Final Deliverables section) — do not deprioritize | Side panel likely fine down to tablet width, verify | Side panel | Side panel |
| Profile | Zero mobile code; it's a simple form page per `INVENTORY.md` — straightforward single-column mobile treatment per prompt Phase 7, likely quick to fix | Standard | Standard | Standard |

---

## 3. Prioritized implementation order (updated round 2 — supersedes round 1's ordering)

The user has given an explicit page order and an explicit two-tier mobile-support model this round.
Both replace round 1's inferred prioritization below.

### 3.1 Two mobile support tiers (new this round — apply to every page's plan)

- **FULL (complete redesign):** Overview, Sales (all channel tabs), P&L (summary + Financial MIS),
  Inventory Health, Ads, Logistics (Performance + Cost Analytics), Profile. These get the full
  treatment from every phase of the original prompt (Phases 4-7's card/chart/table/modal patterns,
  the complete per-breakpoint layouts).
- **USABLE (no horizontal overflow, scrollable tables, single-column forms — explicitly NOT a deep
  redesign):** COGS, Packaging BOM, Purchase Ledger, Logistics Ledger, Courier Allocation,
  Documents, and the P&L **embedded tools** specifically (Price Simulator, Breakeven ROAS
  Calculator, B2B Costing Calculator, PO Approval Checker — note these are scoped to USABLE even
  though they live inside the FULL-tier P&L page; the P&L summary/MIS views themselves are FULL,
  the embedded calculator tools are not). For this tier: fix overflow, make tables scroll instead of
  break, stack forms to one column — stop there. Do not invest further design effort here unless a
  later round upgrades a specific page's tier.

### 3.2 Page implementation order (explicit, replaces round 1's inferred order)

**Overview → Sales Overall + channels → P&L summary + Financial MIS → Inventory Health → Ads →
Logistics → others.**

1. Foundation first, unchanged from round 1 (still correct, still blocks everything downstream):
   a. Viewport meta tag fix — see 3.3 below for the now-more-specific spec.
   b. `useBreakpoint()` shared hook + CSS breakpoint variables + design-token additions to `C`.
   c. Shared responsive chart wrapper (prompt Phase 5).
   d. Shared table component's Pattern A/B/C variants (prompt Phase 6).
   e. App shell/nav responsive pass (prompt Phase 2).
   f. Global filter bar → bottom sheet pattern (prompt Phase 3).
2. **Overview** (FULL) — the default landing page.
3. **Sales Overall + all channel tabs** (FULL) — one shared fix across all 12 channel tabs per Rule 3.
4. **P&L summary + Financial MIS** (FULL) — the embedded tools (Price Simulator etc.) get only the
   USABLE treatment, done separately/later, not blocking this page's FULL-tier work.
5. **Inventory Health** (FULL) — densest table in the app.
6. **Ads** (FULL) — note the Meta+Google combined D2C trend view (see `INVENTORY.md`) needs its own
   dual-axis/toggle consideration per the original prompt's Phase 5 guidance.
7. **Logistics** (FULL, both Performance Analytics and Cost Analytics) — already has the most
   existing mobile code of any section; this is an audit-and-refine pass against the prompt's actual
   target patterns, not a rebuild from scratch.
8. **Others, in two groups:**
   - **FULL tier remaining:** Profile (quick win, simple form page).
   - **USABLE tier (all of it):** COGS, Packaging BOM, Purchase Ledger, Logistics Ledger, Courier
     Allocation, Documents, P&L embedded tools. Apply the overflow/scroll/single-column fixes
     described in 3.1 and stop.
   - **Customer** was not explicitly placed in the user's stated order or either tier list — flagged
     as an open question in the Summary section below rather than silently assumed into FULL or
     USABLE.
   - **FLASH** gets its own minimal-fix-only treatment — see 3.4 below — sequence it wherever
     convenient since its scope is intentionally small, not tied to the FULL/USABLE page order above.
9. Platform-specific passes (prompt Phase 9), performance/accessibility (Phase 10), and testing
   (Phase 11) — after the page-by-page work above, not interleaved with it.

### 3.3 Viewport meta tag — exact fix (new this round, replaces round 1's one-line summary)

Current (`index.html:6`):
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
```
Target:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```
— i.e. remove `maximum-scale` and `user-scalable` entirely (restores pinch/double-tap zoom and
200%-zoom accessibility), add `viewport-fit=cover` (required for `env(safe-area-inset-*)` to work on
notched devices, ties into the safe-area work already flagged in round 1's P1 #7). Additionally,
apply `touch-action: manipulation` broadly to interactive elements (buttons, tabs, nav items) as a
global CSS rule — this removes the old 300ms tap-delay on touch devices without disabling zoom
app-wide the way the current `user-scalable=no` does; the two are not the same mechanism and this
plan should not conflate them.

### 3.4 Login page — specific fixes (new this round, found by direct user inspection, not this
agent's screenshot pass — the user evidently has already looked at this page on real devices)

Three concrete fixes to make in Phase 1, scoped narrowly to `LoginPage.jsx`:
a. **Landscape phones / short viewports (<500px tall):** hide the brand/marketing panel entirely,
   show only the login form — there isn't vertical room for both, and the form is what matters.
b. **iPad portrait specifically:** fix a visual defect — a darker band appears at the bottom of the
   brand panel on this one viewport. **Confirmed and visually reproduced this round** in the
   existing round-1 screenshot `docs/responsive/before/login/tablet-768x1024.png` (768×1024): there
   is a clearly visible hard-edged, flat dark-green band across the full width of the brand panel's
   bottom ~70px (below the "© 2026 Frido Navigator" line), sitting below the smoother
   gradient/particle-texture green that fills the rest of the panel above it. **Root cause likely the
   same mechanism as the star/tagline overlap in (c) below** — confirmed by reading `LoginPage.jsx`:
   the brand-footer text (`.brand-footer` CSS class, line ~300) is plain HTML with no special
   background of its own, which means the band is not a separate footer block but the background
   SVG itself (`<rect fill="url(#terrainGlow)">`, a `radialGradient` centered at `cx=50% cy=94%`
   inside the same fixed `viewBox="0 0 720 900"`, line ~134). At the tablet-portrait panel's actual
   rendered aspect ratio, this fixed-viewBox gradient scales/stretches differently than it does at
   other aspect ratios, and the `terrainGlow` radial falloff likely produces a harder visible edge
   near the bottom at this specific proportion. Fix in Phase 1 should address both (b) and (c)
   together, since both stem from the same fixed-viewBox-stretched-to-fit-variable-panel-shapes
   design — likely by reworking the background to use percentage-based/viewport-relative gradients
   instead of a fixed pixel viewBox, so it scales consistently at every real panel aspect ratio
   rather than only looking right at the ratios it happened to be designed against.
c. **Star/particle decoration overlapping the tagline text.** **Root cause confirmed this round** by
   reading `LoginPage.jsx` directly: the stars are a fixed set of hardcoded SVG `<circle>` elements
   (NOT randomized — e.g. `cx="442.2" cy="113.5"`, `cx="338.3" cy="183.0"`, ~18 stars total) inside a
   background `<svg>` with a fixed `viewBox="0 0 720 900"` (a 0.8 width:height ratio), while the
   "Navigate through the insights" tagline is separate HTML text positioned independently over that
   SVG background. Checked against all 13 of round 1's login screenshots — no overlap visible in any
   of them, because none happened to land on an aspect ratio divergent enough from 720:900 to push a
   star into the text's HTML position. **The real risk is any panel aspect ratio meaningfully
   different from 0.8** (e.g. a very short/wide panel, or very tall/narrow one at some viewport this
   round's 13 didn't include) — if the SVG scales via `preserveAspectRatio` (default `xMidYMid
   meet`/`slice` behavior) to fill a differently-proportioned panel, the fixed star coordinates shift
   relative to the independently-positioned tagline text, and a star can end up overlapping it. Fix
   options for Phase 1: (i) give the SVG `preserveAspectRatio="xMidYMid slice"` if not already set
   and add a deliberate text-exclusion gap in the star coordinate set around where the tagline
   HTML sits, or (ii) move the stars into the same positioning context as the text (e.g. as a
   React-rendered absolutely-positioned layer using percentage-based coordinates instead of a fixed
   SVG viewBox) so both scale identically and can never drift apart. Needs testing across the actual
   range of panel aspect ratios the final responsive breakpoints produce, not just the original 13
   fixed screen sizes.

### 3.5 FLASH — explicitly minimal scope (new this round)

The user states FLASH will be replaced by a future "Ask Frido" chat feature — **do not invest
redesign effort here.** Minimal mobile fix only: no horizontal overflow, usable on a phone screen,
nothing more. This overrides round 1's framing of FLASH as a "don't skip" full-effort item citing
the original prompt's explicit Ask-Frido-panel callout — the user's instruction here is more
specific and current than the generic prompt file, and takes precedence.

### 3.6 Code-splitting — explicitly sequenced separately from visual work (new this round)

The original prompt's Phase 10 performance work and this round's 3.1-3.2 visual/responsive work
must NOT be done as one blended effort. Sequence:
1. First, low-risk: lazy-load pages that already live in their own separate files (e.g.
   `CogsPage.jsx`, `PackagingBomPage.jsx`, `PurchaseLedgerPage.jsx`, `LogisticsLedgerPage.jsx`,
   `CourierAllocationPage.jsx`, `FlashPage.jsx`, `ProfilePage.jsx`, `LoginPage.jsx`,
   `ResetPasswordPage.jsx` — each is already an independent module, so wrapping their imports in
   `React.lazy()`/`Suspense` is mechanical and low-risk, independent of any visual change to those
   pages).
2. Only later, in small, independently-verified steps, consider splitting `App.jsx` itself (which
   hosts Overview/Sales/P&L/Ads/Inventory/Logistics/Customer/Documents/Financial MIS as internal
   functions, not separate files) — this is a much larger, riskier refactor and must not be
   bundled into the critical path of the visual overhaul. Each split step should be verified
   (build succeeds, no behavior change) before the next.

---

## Summary for sign-off (round 4, FINAL — Phase 0 complete, corrected)

- **Delivered round 1:** `INVENTORY.md`, `ISSUES.md`, this plan, plus 13 login-page screenshots.
- **Delivered round 2:** `scripts/save-auth.mjs`, Ads/Customer sub-tab inventory completion, Reset
  Password/404/dark-mode confirmation, the Inward open question flagged, two login-page visual bugs
  root-caused, and the full plan restructuring (page order, FULL/USABLE tiers, code-splitting
  sequencing, viewport-meta spec, FLASH scope reduction).
- **Delivered round 3:** the first full live screenshot sweep (221 screenshots), interaction testing,
  real Lighthouse scores, and an initial `baseline-numbers.json`.
- **Round 4 (this round, FINAL): you personally reviewed all 221 round-3 screenshots and found real,
  concrete problems with the audit itself — all now fixed, verified, and re-delivered:**
  - **Root cause found and fixed for the date-range bug you reported**: round 3's date-label
    assertion only matched the desktop date format; mobile/some tablet widths render a visibly
    different, shorter format the original regex couldn't match at all (plus a second bug where the
    month-name matcher didn't handle "Sept"'s 4 letters) — so the date-picker click target silently
    didn't exist on many viewports, and those screenshots captured whatever default range happened
    to be loaded instead of September. Fixed: the regex now matches both formats, and every capture
    now ASSERTS the rendered date label shows September before trusting it, with up to 3 retries.
  - **Your two specific examples, confirmed fixed**: tablet `sales-shopify` (was a blank loading
    spinner, now shows full real content) and laptop `logistics-performance` (was stuck with the
    date picker open, now shows a clean closed landing state).
  - **Full-page capture** (`fullPage: true`) now used throughout — content below the fold (tables,
    charts, maps) is now actually represented in every screenshot, not just the first screen's worth.
  - **Full re-run**: all 221 screenshots recaptured and ground-truth verified at 17/17 routes ×
    13/13 viewports each; all 35 interaction-test screenshots re-run with the overwrite bug fixed
    (now viewport-namespaced folders, confirmed no overwrites).
  - **`baseline-numbers.json` now complete for all 5 pages** — the `api/bq` gap is closed via a
    temporary, fully-reverted server-side logging instrument (confirmed via empty `git diff
    server.js`).
  - **Every item in your section-B findings list, confirmed and documented with route/viewport
    detail**: Overview KPI row illegible on iPhone SE AND iPhone 14 + Channel Scorecard squeezed on
    tablet; phone landscape rendering the full desktop sidebar layout (a breakpoint-threshold bug);
    tablet portrait showing cramped truncated labels (a real, if more nuanced than originally
    described, breakpoint problem); Customer page column crush; Courier Allocation table cutoff;
    Logistics Cost carousel cutoff with no swipe hint; 8 unlabeled bottom-nav icons; page title
    truncation (confirmed exact string: "Performan…"); Profile's blank avatar gap.
  - **One significant NEW finding, more severe than anything previously found**: Logistics
    Performance Analytics throws a hard, reproducible server-side query error
    (`"Name zone_by_frido not found inside c"`) for the Sept 2026 range, across every viewport
    tested — a real backend bug, entirely separate from the responsive work, needing its own
    dedicated investigation.
  - **An important correction**: 3 of your 4 originally-reported "empty chart" findings (Inventory
    Sales & Allocation, Ads, P&L Overall) no longer reproduce as empty now that the date range is
    genuinely correct — all three render real September data. Documented as likely resolved by the
    date-range fix (worth one more quick re-check, not re-flagged as confirmed-still-broken), with
    Logistics correctly kept as its own distinct, real, severe bug.
  - **The P&L Overall/EBO/International/Myntra reframing applied exactly as you corrected**
    (Myntra added round 5 — was missing from this list in earlier rounds): documented as
    a known, confirmed-incomplete feature (never fully built out with cross-channel aggregation),
    not a regression bug — with your concrete example numbers kept as supporting detail only.
  - **The Ads "Cr"-on-count-metrics bug confirmed still present** with the correct September data
    (Impressions: 117.00 Cr) — kept as its own standalone finding, unrelated to the P&L reframing.
  - **One honest residual gap**: 3 of 221 screenshots still show an open date-picker overlay in two
    specific picker UI variants that don't close on Escape — understood precisely (which variants),
    not fully fixed this round given the time budget; flagged for a quick Phase 1 follow-up.
- **Still open, not resolved by assumption, per your explicit earlier instruction:**
  1. Is the Inward inventory tab intentionally hidden or a stale leftover? (`INVENTORY.md`'s
     Inventory/Inward row, `ISSUES.md` P1 #14.)
  2. Which mobile-support tier (FULL or USABLE) does the Customer page belong to? It was never
     explicitly placed in your stated page order or tier lists.
- **Final, complete severity counts** (code inspection + corrected live screenshots + interaction
  testing, see `ISSUES.md` for full detail, exact counts verified by direct enumeration of every
  numbered entry, not estimated, round 5): **P0: 9, P1: 17, P2: 3.**
- **Top 5 findings overall, all of Phase 0 considered:**
  1. **NEW** — Logistics Performance Analytics throws a hard server-side query error for the entire
     September 2026 range, across every viewport — the single most severe finding in this audit,
     and a genuine backend bug needing its own dedicated fix, separate from the responsive work.
  2. Overview's KPI header row is illegible on both iPhone SE and iPhone 14 — a confirmed, reproduced,
     severe real-device bug.
  3. PnL's Gross Margin KPI shows a raw unformatted negative number — a real formatting bug,
     independent of the separately-documented P&L Overall known-incomplete-feature gap.
  4. The single 3.1MB unsplit JS bundle is proven (via real Lighthouse scores) to cap every page's
     mobile Performance score at 56-59, well under the prompt's own ≥80 target.
  5. A real, confirmed, fixable code bug — not a responsive issue — causes 2-3 404 requests on every
     single page load (`src/App.jsx:19585`/`:19601`, wrong-origin fetch of static JSON files).
- **No code was changed anywhere in this entire Phase 0 exercise that remains in the codebase.** A
  temporary, clearly-marked, env-var-gated logging instrument was added to `server.js` to close the
  `api/bq` baseline gap, used once, then fully removed — confirmed via an empty `git diff server.js`.
  Nothing in `src/App.jsx`, any P&L file, or any Ads file was touched at any point. This is now the
  complete, final Phase 0 deliverable — pending your review, your answers to the two open questions
  above, and your explicit approval before any Phase 1 code changes begin.
