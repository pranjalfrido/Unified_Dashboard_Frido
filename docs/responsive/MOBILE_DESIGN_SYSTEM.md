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
| Frido green `#1f5a3d` (+ dark `#0f2a1d`) | brand, bars, selected states, primary buttons; in the page header only the selected chip, the active underline and the date pill text |
| Header Ivory `#fbfaf7`, hairline `#eae7df`, divider `#f0ede6`, band `#f6f4ef`, context grey `#8a938e`, chip text `#5c6761`, icons `#4e5a54`, pressed `#f1efe9`, date pill `#eef5f0`, notification dot `#d9534f` (`C.m.hdr`) | the phone page header (see `MobilePageHeader`) |
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
page title 17/650 (header; 15 collapsed) · card title 15–16/700 · hero 28/700 · tile value 15.5/700 · list value 13.5/700 · body 12.5–13 · labels 11–12 uppercase 600 muted · minimum 12px · inputs ≥16px.

**Shape & effects**
card radius 18 · tile radius 12 · chip radius 999 · tile border `1px rgba(31,90,61,.08)` · **selected = soft glow**: `border 1px rgba(31,90,61,.22)` + `box-shadow 0 0 10px 1px rgba(31,90,61,.10)` · master card gradient `#dcebe2 → #e9f3ed → #f4f9f6 → #fff` with border `#dbe8df` · transitions 150–250ms, respect reduced motion.

**Spacing**: 4/8 scale; page gutter 12–16px; safe-area insets; `dvh` not `vh`.

## 2. Shared components (`src/responsive/`) — every page uses these, no page-specific copies
| Component | What it is |
|---|---|
| `MobilePageHeader` | **Ivory header on every phone screen** (top bar and full-screen views; mockup `mockups/header_mockup.html`). Row 1 48px: [‹ back 34×34] title 17/650 ink + context 13/500 grey, then **always date · filter · ⋯** (a control the page lacks is absent; the rest never move). Row 2 (chips) 28px + 10px: text chips `#5c6761`, selected = green fill + white, right edge fades, selected scrolls into view, 5px amber "in progress" dot. Row 3 sub-tabs 34px 12.5/600 grey, active ink + 2px green underline the label's width, spread when ≤ 4, scroll when more; second sub-tab row 30px 12px on `#f6f4ef`. "Filtered:" strip 28px, only filters that differ from the page default. Heights 48 / 86 / 120px (1 / 2 / 3 rows). Collapses after ~80px of downward scroll into one 42px translucent bar ("Title · context · sub-tab" 15px + date + ⋯, blur + soft shadow), scrolling up restores it, the content never jumps. Date pill: 32px, radius 10, mint `#eef5f0`, green 12.5/600, short form ("Sep 2026", "1–26 Oct") + chevron at 60%. Filter / ⋯: 34×34 borderless icons 16px `#4e5a54`, filter count = 14px green circle; notifications = 7px red dot on ⋯ and "Notifications (n)" as the first ⋯ item (no separate bell, no second-row ⋯). No tap focus box; `:focus-visible` ring `#9cc4ad`. `theme-color` `#fbfaf7` on phones. Bottom sheets keep their own sheet header; the login page keeps its green band. |
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
| `MobileBottomNav` | 5 labelled items (Overview, Sales, P&L, Inventory, More) + "More" sheet |

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
