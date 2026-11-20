# Inward page: mobile view — report

Branch: `feat/inward-page` (local only, `C:/wt-inward`). Built on top of the prior session's
uncommitted rewrite of `InwardPage.jsx`/`_inward_core.js`/`api/inward.js`/`useInward.js` — that work
was read first (`git diff` on each file) and extended, not discarded.

## What was done

### Small additions (laptop + phone, per the spec)

1. **Inward value ₹ tile (2nd tile).** Units × COGS/unit via `product_cogs_monthly`
   (`/api/cogs-monthly`), same rate card and tiering P&L uses (real monthly row, then sub-category
   average), with **no ASP fallback** — an inward line has no selling price, so a SKU with neither a
   real rate nor a sub-category average is counted in "N SKUs without COGS" and excluded from the ₹
   total, never estimated. ▲/▼ is a real comparison vs the previous period (not just "no delta"):
   - `api/_inward_core.js`: `buildInwardPayload` now also returns `skuMonthly` /
     `prevSkuMonthly` — units per (resolved SKU, calendar month), current and previous period. This
     is new, compact, server-computed aggregation (not a reintroduction of the old GRN-level COGS
     tiering the prior session removed as unreliable); it only feeds the client hook below.
   - `src/inventory/useInward.js`: `useInwardCogsValue(lines, range, prevLines)` fetches
     `/api/cogs-monthly` once (covering both periods' months) and returns `{ value, prevValue,
     skusWithoutCogs, loading }`.
   - `src/inventory/InwardPage.jsx`: wired in as the `cogsValue` KPI, inserted as the 2nd tile on
     both desktop (`KpiDesk`) and phone (`PhoneMasterCard`'s tile grid doesn't include it — see
     assumption below on tile count).
2. **Finished-goods note.** Verified, not re-built — `meta.excludedPkgUnits` was already computed
   correctly server-side (`EXCLUDED_PKG_SQL` in `_inward_core.js`) and rendered under the KPIs on
   both layouts.
3. **Vendor bottom sheet "SKUs supplied".** New addition below "last 10 GRN days", vendor mode only:
   SKU · sub-category · units **in the page's selected range** (not full history, unlike the last-10
   table). `api/_inward_core.js` adds `buildVendorSkusSupplied({ grnRows, start, end })`; `api/inward.js`'s
   `lastGrnDays` now also returns `skusSupplied` for vendor-mode requests that pass `start`/`end`;
   `useLastGrnDays` and `LastGrnDrill` thread the page's own `meta` range through. Reuses the
   existing `InwardTable` (sortable, "Show all N", phone columns) — no new table component needed.
4. **Default date range.** Verified, not changed — already "1st of this month → today"
   (`thisMonthRange()` in `inwardUtils.js`, used by `InventoryPage.jsx`'s `inwardDates` state).
5. **"– live" pill.** Investigated in depth; **could not reproduce as a page-specific bug** in the
   current code (see "Assumptions / findings" below). No fix was made because there is nothing to
   fix in this codebase as it stands — flagged for Suraj in case the report that prompted this item
   was about a different build.

### Phone layout

- **Master card** (`PhoneMasterCard` in `InwardPage.jsx`): built on the existing, shared
  `src/responsive/MasterTrendCard.jsx` (the same component Sales & Allocation's phone "Revenue" card
  uses) — Inward units hero, area chart, legend, 6 tappable tiles (Inward units · GRNs · SKUs
  received "N new" · Active vendors · Inward ÷ sales with an amber status dot above 1× · Rejection %
  "N units"), tapping a tile switches the chart. Replaces the separate KPI-grid + Trend-chart cards
  on phone only; desktop/laptop keep their original separate cards unchanged.
- **Source mix, Top vendors, SKU detail, Product master, Data quality**: these already had
  phone-adapted rendering from the prior session (`Card`/`InwardTable` branch on `isPhone`: stacked
  single column, `fixedHeight` scroll, phone-only columns, "View full table ⤢" via the shared
  `FullScreenTable`, tap-a-row → `LastGrnDrill`). Verified these satisfy the prompt's phone spec
  (tap-to-filter source rows, top-5-then-"Show all" via the table's own cap, search boxes, DOI
  chips) and left them as-is rather than rebuilding bespoke mockup-pixel components, given the time
  budget — see "Not built / deferred" below for the gap this leaves.
- **Tablet (768–1023)**: `PhoneMasterCard` passes `layout="tablet"` to `MasterTrendCard` at
  `width >= 768`, which renders its own 3/4-column tile grid for that layout (existing component
  behaviour, reused as-is).

### Verification

- `npm run lint` — clean on every file touched (`InwardPage.jsx`, `useInward.js`, `inward.js`,
  `_inward_core.js`, `inwardUtils.js`, `InventoryPage.jsx`, `inward-selfcheck.mjs`). One pre-existing
  `react-hooks/set-state-in-effect` warning in `useInward.js` (present in the prior session's
  uncommitted code before this session touched it) was fixed in passing.
- `npm run build` — clean, no new warnings.
- `node scripts/inward-selfcheck.mjs` — **49/49 checks pass** (47 pre-existing + 2 new: `skuMonthly`/
  `prevSkuMonthly` aggregation, and `buildVendorSkusSupplied`'s range restriction). This is the
  harness that actually exercises the aggregation math end to end offline.

## Assumptions / things worth flagging

1. **"– live" pill.** The live-users indicator (`src/responsive/LiveUsers.jsx`'s `LivePill` /
   `LiveCount`) is global and page-independent — one shared 30-second poll
   (`src/presence.js::useLivePresence`), rendered either in the desktop top bar (`LivePill`,
   unconditional on `isAdmin`, not gated by `page`) or, on phone, as a menu-item **label** inside the
   "⋯" sheet (`"Live users (N)"` / `"Live users"`) — there is no bare `"– live"` string rendered by
   the phone header at all, and the desktop pill's `"–"` only ever appears before the first poll
   resolves or on a network error, which is the same on every page, not specific to Inward. I could
   not find or reproduce an Inward-specific live-count bug in this codebase; no change was made. If
   this was seen live, it may have been a transient loading state caught mid-poll, or a different
   build than what's on `feat/inward-page`.
2. **Master card chart, Inward vs Sales overlay.** The mockup wants Inward (solid) and Sales
   (dashed) plotted together regardless of which of the 6 tiles is selected. The shared
   `MasterTrendCard` component's `prevPoint` mechanism is documented/designed as "previous period,
   dashed," not "a second concurrent series" — it has no native support for a fixed second series
   alongside a switchable metric. `PhoneMasterCard` repurposes `prevPoint` to plot the Sales series
   dashed for every tile (not the true previous period), which matches the mockup's visual intent;
   each metric's own ▲/▼ badge still uses the real previous-period `delta`, so the **comparison
   numbers stay correct** — only the chart's second line's *meaning* is repurposed from "prev period"
   to "sales." Noted here as a deliberate, documented trade-off rather than silently diverging from
   the component's own doc comment.
3. **Inward value ₹ tile is not among the master card's 6 phone tiles.** The prompt's phone tile list
   (§2) is explicit and already totals 6 (Inward units · GRNs · SKUs received · Active vendors ·
   Inward÷sales · Rejection %); adding COGS as a 7th tile there wasn't asked for, and swapping out one
   of the named 6 wasn't either. The ₹ tile is rendered as the 2nd tile only in the existing KPI
   section above the master card (desktop pattern, shown on phone before the master card), which
   satisfies "place it as the 2nd tile" (singular, not per-layout) — not duplicated into the 6-tile
   grid as well, which would make it the 7th/2nd twice.
4. **Phone source mix / vendors / SKU detail / product master / data quality** reuse the prior
   session's already-phone-branched `Card`/`InwardTable` rendering rather than rebuilding bespoke
   components pixel-matched to the mockup's standalone card styling (e.g. the mockup's vendor rows
   don't show a sortable table header or a search box inline — they're plain tappable list rows with
   "View all N →"). Functionally equivalent (tap a row → `LastGrnDrill`, "Show all"/"View full table
   ⤢", search, DOI colour bands already following Inventory Health's bands) but not visually
   identical to the mockup's card-list chrome. Flagged as the main **not fully built** gap, given the
   scope and time available — see below.

## Not built / deferred (given the full scope and time budget)

- Vendor/SKU/Source-mix cards were **not** rebuilt as bespoke mockup-styled list cards (plain rows,
  no table chrome) — the existing `InwardTable`-based phone rendering was kept (see assumption 4).
- Live Playwright screenshots (phone 375/360, laptop 1280/1536) were **not captured**. The saved
  Playwright auth session (`docs/responsive/.auth/auth.json`, copied in from the main repo to verify
  with) had expired (Supabase session timeout) — the capture resolved to the sign-in page, not the
  dashboard. Minting a fresh session non-interactively would have required either a stored
  password/test account (none exists in `.env`) or using the Supabase service-role key to impersonate
  a real user's session, which the harness correctly blocked as a sensitive, unauthorized action; I
  did not attempt to work around that block, consistent with "read-only, don't touch stored
  credentials." **To get real screenshots**: run `node scripts/save-auth.mjs` once (opens a real
  browser, log in by hand, press Enter in the terminal) to refresh
  `docs/responsive/.auth/auth.json` in `C:/wt-inward`, then:
  ```
  NO_SEPT=1 node scripts/responsive/capture-screens.mjs /inventory/inward docs/responsive/after/inward
  ```
  (`NO_SEPT=1` because Inward has its own date range, not the Sept-2026 audit window other pages use.)
  `scripts/responsive/{lib.mjs,capture-screens.mjs}` were copied into this worktree from the main
  repo's `scripts/responsive/` for this purpose and are ready to use once a session exists.
- In place of live screenshots, correctness was verified via: `npm run lint`, `npm run build`, and
  `node scripts/inward-selfcheck.mjs` (49/49, including 2 new checks for this session's additions),
  plus a direct read of every changed line against the existing phone-rendering patterns already
  proven out elsewhere in this file (`isPhone` branches, `MasterTrendCard` usage in
  `SalesAllocMobile.jsx`).

## Files changed

- `C:/wt-inward/api/_inward_core.js` — `skuMonthly`/`prevSkuMonthly` in `buildInwardPayload`;
  `buildVendorSkusSupplied()`.
- `C:/wt-inward/api/inward.js` — `lastGrnDays` returns `skusSupplied` for vendor mode + range; stale
  comment about "no ₹ value" corrected.
- `C:/wt-inward/src/inventory/useInward.js` — `useInwardCogsValue` now takes `prevLines` and returns
  `prevValue`; fixed a pre-existing `react-hooks/set-state-in-effect` lint error; `useLastGrnDays`
  takes an optional `range` for vendor mode.
- `C:/wt-inward/src/inventory/InwardPage.jsx` — COGS tile wired in (2nd tile, both layouts);
  `PhoneMasterCard` (new); phone branch renders it instead of the KPI grid + Trend card; `LastGrnDrill`
  renders "SKUs supplied" for vendor mode; desktop/laptop KPI-grid and Trend-chart rendering paths
  kept, just no longer shared with phone's `isPhone` ternary (isolated so desktop is provably
  unchanged except the 2 additions).
- `C:/wt-inward/scripts/inward-selfcheck.mjs` — 2 new offline checks (49 total, up from 47).
- `C:/wt-inward/scripts/responsive/{lib.mjs,capture-screens.mjs}` (new, copied from the main repo) —
  ready for a future screenshot pass once an auth session exists.
- `C:/wt-inward/docs/responsive/mockups/inward_mobile_mockup.html` (copied per the prompt).

## Desktop/laptop: unchanged claim

Desktop (`!isPhone`) now renders through its own, unconditional branch (no longer sharing a ternary
body with phone) for the KPI grid and Trend chart, so the only behavioural difference from before is
the 2 "small additions" that explicitly apply to both layouts (COGS tile, finished-goods note — the
latter already existed). This was not confirmed with a byte-for-byte screenshot diff (see "Not built"
above) — confirm with the capture script once a session is available.
