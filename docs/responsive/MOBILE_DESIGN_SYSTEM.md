# Frido Navigator — Mobile Design System (applies to EVERY page)

> Source of truth for the mobile/tablet look of the whole dashboard (below 1024px).
> Reference mockups: `docs/responsive/mockups/sales_mobile_mockup.html` (primary), `overview_mobile_mockup.html`, `product_performance_mobile_mockup.html`, `logistics_ops_mobile_mockup.html`.
> Every page (Overview, Sales, P&L, Ads, Inventory, Logistics, Customer, Documents, Profile, FLASH, ledgers/tools) must follow this file. Page prompts only describe **what** goes on a page; **how it looks** comes from here.
> Laptop/desktop (1024px and up): unchanged unless a page prompt says otherwise. Display/layout only — never change data or logic.

---

## 1. Tokens (single source: the `C` theme object)
**Colours — calm, one palette**
| Token | Use |
|---|---|
| Frido green `#1f5a3d` (+ dark `#0f2a1d`) | brand, bars, selected states, primary buttons; the page header (below) |
| Header deep green: gradient `linear-gradient(160deg, #1a4d34 0%, #1f5a3d 55%, #266b49 100%)`, shadow `0 8px 18px -8px rgba(20,50,35,.45)`, title `#fff`, context `#a9c9b6`, chip text `#c8dfd1`, icons `#d8e8de`, pressed `rgba(255,255,255,.10)`, date pill `rgba(255,255,255,.14)`, accent mint `#9fe0b9` (filter count, active underline, focus ring), notification dot `#e5534b` (`C.m.hdr`) | the phone page header (see `MobilePageHeader`) |
| Bottom bar `#fbfaf7`, inactive icon `#8a938e`, hairline + shadow `0 -1px 0 #e6e2d8, 0 -6px 16px -6px rgba(28,52,40,.14)` (`C.m.nav`) | the phone bottom bar (see `MobileBottomNav`) |
| Login band gradient `#0f2a1d → #1c4630` | the login page only (a brand moment) |
| Green shades `#5f8f75`, `#9cc4ad`, `#d5dbd7` | secondary series, stacked parts |
| Ink `#1c2420` | all values and titles |
| Muted `#7b847f` | labels, captions |
| Line `#eeebe4`, page bg `#f4f2ed`, card `#fff` | structure |
| Up `#1f8a4c` / Down `#c0392b` | **only** for good/bad changes and alerts |
| Amber | **only** for status from `metricTargets.js` (e.g. Return % > 8%) |

- No decorative colours (no gold, orange, blue, per-channel brand colours on bars/chips/text). Logos only where they identify a channel, small.
- Direction-aware good/bad: lower is better for Returns %, RTO %, CIR %, Cancellation %, Exchange %, NDR %, SLA breach %, CAC, COGS %, ACoS.

**Type** (one font + `font-variant-numeric: tabular-nums`; no monospace)
page title 17/650 (header) · card title 15–16/700 · hero 28/700 · tile value 15.5/700 · list value 13.5/700 · body 12.5–13 · labels 11–12 uppercase 600 muted · minimum 12px · inputs ≥16px.

**Shape & effects**
card radius 18 · tile radius 12 · chip radius 999 · tile border `1px rgba(31,90,61,.08)` · **selected = soft glow**: `border 1px rgba(31,90,61,.22)` + `box-shadow 0 0 10px 1px rgba(31,90,61,.10)` · master card gradient `#dcebe2 → #e9f3ed → #f4f9f6 → #fff` with border `#dbe8df` · transitions 150–250ms, respect reduced motion.

**Spacing**: 4/8 scale; page gutter 12–16px; safe-area insets; `dvh` not `vh`.

## 2. Shared components (`src/responsive/`) — every page uses these, no page-specific copies
| Component | What it is |
|---|---|
| `MobilePageHeader` | **Deep-green header on every phone screen** (top bar and full-screen views; prompt `HEADER_GREEN_PROMPT.md`, mockup `mockups/header_green_mockup.html`). One fixed height per page, no collapse. Row 1 48px: [‹ back] title white 17/650 + context `#a9c9b6` 13/500, then **always date · filter · ⋯** (a control the page lacks is absent; the rest never move). Row 2 (chips) 36px with 26px text chips `#c8dfd1` (the mockup's `#b9d4c4` is 4.05:1 at the light end of the gradient; `#c8dfd1` keeps ≥ 4.5:1), selected = white fill + green `#1f5a3d` text, no ring, right edge fades, selected scrolls into view, 5px amber "in progress" dot. Row 3 sub-tabs 32px 12.5/600 `#a9c9b6` on `rgba(0,0,0,.08)` with a `rgba(255,255,255,.12)` top divider, active white + 2px mint `#9fe0b9` underline the label's width, spread when ≤ 4, scroll when more; second sub-tab row 30px 12px on `rgba(0,0,0,.14)`. "Filtered:" strip 28px under the green bar on the light page background, only filters that differ from the page default. Heights 48 / 84 / 116px (1 / 2 / 3 rows, +30 for a second sub-tab row), the same before and after scrolling; no backdrop blur (it would trap the date sheet). Date pill: 32px, radius 10, `rgba(255,255,255,.14)`, white 12.5/600, short form ("Sep 2026", "1–26 Oct") + a 9×6 SVG chevron (stroke 1.6, 70%) centred with the text, 5px gap. Filter / ⋯: borderless 16px icons `#d8e8de`, 44×44 tap target with a 34×34 pressed tile `rgba(255,255,255,.10)`; filter count = 14px mint `#9fe0b9` circle with `#143d2a` number; notifications = 7px red `#e5534b` dot with a 1.5px header-green ring on ⋯ and "Notifications (n)" as the first ⋯ item. No tap focus box; `:focus-visible` ring `#9fe0b9`. `theme-color` `#1a4d34` on phones. Bottom sheets keep their white sheet header with ✕; the launcher and the login page (own green band) are unchanged. |
| `FilterSheet` + `FilterPicker` | level 1: one row per filter (current value + count), small toggles inline; level 2: search, Top by revenue / A–Z, checkboxes, pinned selections, dependent lists (Category → Sub-category → SKU), Apply (n). Scales to 1000+ items |
| `MasterTrendCard` | gradient card: hero (fixed 2-line sub-line), full-width chart (no axes, prev dashed line, scrubber, auto granularity, override in "⋯"), even 2-col `KpiTile` grid that switches the chart |
| `MasterTrendCard` layout (fixed, every page) | label + ⓘ left, ⋯ right (no date) · big value · one sub-line "▲x% vs prev · 2 key facts" · chart exactly as Overview (≈120px, thin green line with a gradient fill fading to transparent, previous period thin dashed grey, line kept inside the middle band, no axes) · legend row "This period / Prev period · Daily · auto" · 2-col tiles. Reference: released Overview hero. |
| `KpiTile` | label + `DeltaBadge` on line 1, value on line 2; optional status dot; tap = select (glow) or InfoPopover |
| `DeltaBadge` | ▲/▼ %, direction-aware colour, shimmer while loading, grey "—" if none |
| `CompactRankRow` | name · value · % on one line + thin bar (breakdowns: channels, categories, regions, tiers) |
| `MobileRankedList` | fixed-height rows (name max 2 lines, sub-label under name, bar pinned bottom), sort chips, tap → `BottomSheet` detail with all columns; top N + "Show all" |
| `FullScreenList` | slide-in page for "Show all": search, sort chips, filter chips, count, 20 at a time + Load more / virtualised, back arrow |
| `SegmentToggle` | 2–3 option toggle inside a card (Gross/Net, Region/City tier, State/City, Category/Product/SKU, Forward/RTO/Reverse) |
| `InfoStrip` | slim neutral one-line note (data availability, snapshot time, partial period), tap to expand |
| `CollapsibleSection` | tappable section heading with one-line summary when closed, lazy render, remembers state |
| `BottomSheet`, `InfoPopover` | detail sheets and tap-to-see definitions |
| `MobileBottomNav` | light icon bar `#fbfaf7` with a hairline + soft shadow on top (`C.m.nav`), 48px + safe-area inset (same as header row 1), tap targets ≥ 44px; selected = green icon on a 34 × 30 mint tile `#edf6f0`, inactive `#8a938e`; last slot opens the All pages launcher (NAV_MOBILE_PROMPT.md) |

## 3. Translation rules — how any desktop element becomes mobile
| Desktop element | Mobile |
|---|---|
| KPI card row/grid + main trend chart | one `MasterTrendCard` (even KPI count; odd → drop least decision-relevant on mobile only, list it in the plan) |
| Secondary trend charts | small chart card with `SegmentToggle` for series; max 2 lines (current + prev) |
| Bar/breakdown list | `CompactRankRow` list, top 6–8 + "Show all" |
| Donut / pie | `CompactRankRow` bars (no donuts) |
| Record table (products, SKUs, stores, campaigns, couriers, customers, POs) | `MobileRankedList` + `FullScreenList` |
| Wide numeric/financial table (P&L, MIS, ledgers) | sticky first column + horizontal scroll **inside a dedicated full-screen view**, opened from a summary card; summary card shows 3–4 key lines |
| Day × channel / matrix time tables | hidden below 1024px (desktop only) unless the page prompt says otherwise |
| Slicers / dropdown filters | `FilterSheet` |
| Tabs / sub-tabs | header chips row / underline sub-tabs |
| Banners, notes, "as of" | `InfoStrip` |
| Buttons (Export, Refresh, special views) | "⋯" menu |
| Calculators / what-if tools | single-column form, inputs ≥16px, result card pinned below, sticky action button |
| Maps | full width, tap region → BottomSheet, ranked list below |

## 4. Behaviour rules
- **Scrollbars (every scroll area, every page):** 3px, light Frido green `rgba(31,90,61,.28)`, transparent track, no arrow buttons — page, bottom sheets, full-screen lists, filter pickers, tables and any inner scroll. Use one global CSS rule with `::-webkit-scrollbar { width:3px; height:3px }`, a transparent track, a 3px rounded thumb and `::-webkit-scrollbar-button { display:none }`. **Important: do NOT set `scrollbar-width` / `scrollbar-color` for Chrome/Edge**: since Chrome 121 those standard properties override `::-webkit-scrollbar` and bring back the wide Windows scrollbar with arrows. Put them only inside `@supports not selector(::-webkit-scrollbar) { … }` (Firefox). Remove any existing `scrollbar-width` declarations elsewhere. Not per-component styles. Desktop uses the same rule.
- Nothing that changes on touch may resize a card or move content below it (fixed heights).
- No inner scroll containers in page flow; no page-level horizontal scroll.
- Every number has a plain label; abbreviations get an InfoPopover definition.
- Indian formatting (₹, L, Cr), IST, readable dates ("1 Oct – 24 Oct", "Updated 25 Oct, 2:33 pm").
- Loading: skeletons with fixed height, `pointer-events:none`; charts never show empty axes while loading.
- ▲/▼ only from existing calculations (or the agreed previous-period loader); all-or-none per card.
- Incomplete pages (P&L Overall/EBO/International/Myntra): "In progress" badge per the backlog item.

## 5. Per-page checklist (Claude Code must tick this in every page's Verification)
- [ ] Uses `MobilePageHeader`, `MobileBottomNav`
- [ ] All filters through `FilterSheet`
- [ ] Top of page = `MasterTrendCard` (if the page has KPIs + trend)
- [ ] Lists/tables mapped per section 3; no donuts, no wide tables in page flow
- [ ] Palette, type scale, glow, borders exactly per section 1
- [ ] No resize on touch; no inner scroll; no horizontal page scroll
- [ ] Numbers identical to desktop/baseline
- [ ] Laptop 1366 screenshot unchanged
- [ ] Screenshots iPhone SE / 14 / Pixel / small Android / landscape / iPad portrait

## 6. Order of pages
Overview (with alignment addendum) → Sales → P&L (+ Financial MIS) → Ads → Inventory → Logistics → Customer → Profile → internal tools (usable level: COGS, Packaging BOM, ledgers, Courier Allocation, Documents, P&L calculators) → FLASH (minimal; replaced by Ask Frido later).
For each page after Sales, I'll share screenshots and a short page prompt; the design comes from this file.
