# Sales Tab — Mobile Redesign (consolidated prompt for Claude Code)

> Prerequisite: the Overview mobile redesign is merged/verified. This prompt **reuses its shared components** (type scale, DeltaBadge, InfoPopover, MobileRankedList, BottomSheet, CollapsibleSection, chart scrubber, metricTargets/flags).
> Reference mockup: `docs/responsive/mockups/sales_mobile_mockup.html` (open it; layout and interactions are the target; some values in it are illustrative).
> Branch: `feature/responsive-overhaul`. One commit per section.

---

Redesign the **Sales tab for mobile and tablet (below 1024px)**, covering every channel tab and sub-tab. **Laptop and desktop (1024px and up) must stay pixel-identical.**

## Non-negotiable rules
1. **Display and layout only.** No changes to data, queries, metric formulas or numbers. Values must match `baseline-numbers.json` and the desktop view for the same channel, filters and dates.
   - ▲/▼ values: use **only what desktop already calculates** for each channel. No new calculations. A KPI without a desktop ▲/▼ shows a grey "—".
2. **Config-driven, not hard-coded per channel.** Each channel's mobile layout comes from one config file (`src/sales/mobileChannelConfig.js`), so a new channel or card is a config change, not a new layout.
3. Before coding, send me a short plan (see the end). Then build section by section and stop at Verification.

## A. Global rules (same as Overview — reuse, don't re-implement)
- **Calm colour palette, no decorative colours:**
  - Frido green for the brand (header, bars, selected states);
  - normal dark text for all values;
  - **green ▲ / red ▼ only** for good/bad changes (direction-aware: Returns %, RTO %, CIR %, Cancellation %, Exchange % — lower is better);
  - the existing Return % thresholds as the only status colour.
  - No per-channel brand colours on bars/chips (logos are fine where the desktop already uses them, but keep them small).
- One font (main font + `tabular-nums`), the Overview type scale, minimum 12px, inputs ≥16px.
- **Selected state = soft glow**, not a heavy border: `border: 1px solid rgba(31,90,61,.22)` + `box-shadow: 0 0 10px 1px rgba(31,90,61,.10)`, smooth transition. All tiles have a very light border `rgba(31,90,61,.08)`.
- **Nothing that changes on touch may resize a card or move content below it** (hero values, scrub details, tooltips, toggles). Use fixed heights for those lines.
- No inner scroll containers on mobile. No wide horizontal-scroll tables on mobile.
- Plain-language labels + tap-to-see definitions (InfoPopover).

## B. Sales header (one reusable component — will be used on P&L/Ads later)
- **Compact dark-green gradient header** (same feel as the login page):
  - Row 1: "Sales · {Channel}" (channel name in soft white, not gold) + date pill.
  - Row 2: **channel chips** (horizontal scroll, edge fade, active = white chip) + a **filter icon button** with a small white count badge.
  - Row 3 (only if the channel has sub-tabs): **underline-style sub-tabs** — D2C: Overall / MyFrido / Mobility · Amazon: Overall / Seller Central / Vendor Central · Offline: its existing sub-tabs. Hidden for channels without sub-tabs.
  - Row 4 (only if filters are active): a slim **"Filtered:" strip** with removable chips (✕) and "Clear".
- Remove the ☰ "Channel & Filters" modal on mobile — channels move to the chips; filters move to the filter sheet below.
- **Channel-specific action buttons** (e.g. D2C "Return Analysis", "Export"): put them in a small "⋯" menu at the right of the sub-tab row (or the date row if there are no sub-tabs).

## C. Filters (must scale to 200+ items)
- Filter icon → bottom sheet **level 1**: one row per filter showing its current value ("Footwear", "All") and the option count; **Product launch** stays a 3-way toggle (All / New ≤90d / Existing) using the existing definition.
- Tap a row → **level 2 picker**:
  - search box (≥16px), "Top by revenue / A–Z" sort, checkboxes, revenue next to each item;
  - **selected items pinned at the top**;
  - **Sub-category limited to the selected Category**, SKU limited to the selected Sub-category (use existing filter logic);
  - render max ~40 rows + "type to narrow down" (or virtualise);
  - "Apply (n)", "Clear", back arrow.
- Footer: "Reset all" / "Show results". Filter state behaviour stays exactly as today.

## D. Master card: KPIs + trend (one card, top of every channel)
- **Soft light-green gradient background** (`#dcebe2 → #e9f3ed → #f4f9f6 → #fff`), as in the mockup.
- **Hero:** the channel's headline metric (Gross Revenue inc GST) large (~28px), with ▲/▼ (MoM, and YoY where desktop has it) + "orders · units" on a **fixed 2-line** sub-line.
- **Chart:** full-width, no axis labels, prev-period dashed line, touch-and-drag scrubber updating the hero (fixed height lines — no jumping). Auto granularity (no Daily/Weekly toggle on mobile; override in "⋯"). Legend: This period / Prev period / "Daily · auto".
- **KPI grid:** 2 columns, **always an even number of tiles**. Label + ▲/▼ on the first line, value on the second. Tap a tile → hero and chart switch to that metric (if a metric has no daily series, show the value with "No daily breakdown").
- **Extra series on desktop trend charts** (e.g. Amazon SC Rev / VC Rev, Return % overlay on D2C/Flipkart): on mobile, show them as **selectable tiles/chips** that switch the chart — never more than 2 lines at once (current + prev).
- **Data notes** (e.g. Flipkart "Data available till 21 Oct — last 6 days shown as 7-day rolling avg estimate"): a slim neutral info strip at the top of the master card (one line, tap to expand). Keep the logic and wording meaning unchanged.

### KPI tiles per channel (proposal — **confirm against the actual desktop KPIs and send me the final table**)
Rule: keep desktop's KPIs; if the count is odd, drop the least decision-relevant one on mobile only (it stays on desktop). Hero is not counted.

| Channel | Mobile KPI tiles (even) | Dropped on mobile |
|---|---|---|
| Overall | Gross rev, Net rev, Rev at risk, AOV, Avg net/day, ASP, GST, Returns % (8) | Repeat customer rate |
| D2C (and MyFrido/Mobility) | Net rev, GST, Avg net/day, AOV, ASP, Returns %, RTO %, CIR %, Cancellation %, Exchange % (10) | — |
| Amazon (Overall) | Gross SC, Gross VC, Net rev, GST, Avg net/day, ASP, AOV, Returns % (8) | — |
| Amazon SC / VC sub-tabs | their existing KPIs, even count | as needed |
| Flipkart | Net rev, Avg net/day, AOV, ASP, Delivered %, GST, Cancellation %, Returns % (8) | — |
| EBO, Offline, Blinkit, Myntra, Instamart, Zepto, CRED, Firstcry, International | their existing desktop KPIs, even count | as needed |

## E. Standard sections (every channel, below the master card, as CollapsibleSections)
1. **Channel share** (Overall only): ranked list, top 6 + "Show all 12"; Gross/Net toggle; tap a channel → that channel's tab.
2. **Categories** — one card with **Category / Product / SKU** toggle (SKU only where desktop has "SKU Code"):
   - Category view: compact rows (name · ₹ · % on one line, thin bar).
   - Product/SKU view: `MobileRankedList` with **fixed row height** (name max 2 lines, category under the name, bar at the bottom), sort chips for **all the matrix columns the desktop has for that channel** (e.g. D2C: Gross rev, Net rev, vs Prev, Units, DRR, ASP, Cancel %, RTO %, CIR %, Exchange %, Total return %), tap → detail sheet with all columns.
   - This replaces both "Category Revenue" and the "Category Revenue Matrix" on mobile.
   - **"Show all products"** → full-screen list (slide in): search, sort chips, category chips, count, 20 at a time + "Load more" (or virtualised), detail sheet, back arrow. Must handle 200+ products.
3. **Region & city tier** — toggle Region / City tier; compact ₹ + % rows; bars, **no donut** on mobile.
4. **Top states & cities** — toggle State / City; share % + order change ▲/▼ (relabel clearly: "▲/▼ = change in orders"); top 8 + "Show all N" → same full-screen searchable list.

## F. Channel-specific cards (render from config, using the shared patterns)
Keep them few and consistent. Each is a CollapsibleSection placed **after Categories, before Geography**:

| Channel | Desktop card | Mobile treatment |
|---|---|---|
| EBO | Store-wise Sales (21 stores × 8 columns + total) | `MobileRankedList` of stores: name, Gross rev + share bar; sort chips (Gross rev, Net rev, Orders, Units, AOV, Cancel %, CIR %, Total return %); tap → detail sheet; show top 8 + "Show all 21"; a total row on top ("21 stores · ₹2.37 Cr") |
| Amazon | Channel · Account Breakdown (SC-FBA, ETrade, CocoBlue, RetailEZ, SC-MFN…) | compact ranked rows: account, ₹, units, share bar; top 6 + "Show all" |
| D2C | "Return Analysis" button | item in the "⋯" menu; opens the existing view |
| Flipkart | data-availability banner, "Returns: 1,100 · 6.3%" chip | info strip in master card; returns becomes part of the Returns % tile (value + count in the detail popover) |
| Any channel | Export / Export CSV | "⋯" menu (respect scope and row limits) |
| Others | any other extra card | map it to one of: ranked list, compact rows, info strip, or "⋯" action. If none fits, list it in your plan and ask me |

## G. Hidden on mobile (below 1024px only — keep on laptop/desktop unchanged)
- **Revenue by Channel** (day × channel table).
- Donut charts (replaced by bars).
- Any wide matrix table (replaced by the ranked lists above).
Don't delete or change these components — only hide them below 1024px.

## H. Bug to fix (separate small commit, show me before/after)
- On mobile Overall, "Daily avg net rev" shows **₹2.32 Cr** while desktop shows **₹1.75 Cr over 24 days**. ₹55.72 Cr gross ÷ 24 = ₹2.32 Cr; ₹42.10 Cr net ÷ 24 = ₹1.75 Cr. So mobile appears to divide **gross** instead of **net**. Find the cause, make mobile use the same value desktop uses, and confirm for all channels.

## I. Tablet portrait (768–1023)
Same structure, wider: KPI grid 3–4 columns (still even per row where possible), lists can show 2 metric columns, charts taller.

## Plan to send me first (then wait for OK)
1. The final **KPI tile table per channel and sub-tab** (from the actual desktop code), with what's dropped on mobile.
2. The list of **channel-specific cards** found in code for every channel, and how each maps to section F.
3. Which shared components from Overview you'll reuse and which are new (`SalesHeader`, `FilterSheet` + `FilterPicker`, `FullScreenList`, `mobileChannelConfig.js`).
4. Anything that doesn't fit.

## Verification (then STOP)
1. Build passes; no new lint errors.
2. Numbers identical to desktop/baseline for: Overall, D2C (+ MyFrido), Amazon (+ SC, VC), Flipkart, EBO, Offline — Sept 2026. Plus the Daily-avg fix before/after.
3. Full-page screenshots at iPhone SE, iPhone 14, Pixel, small Android, phone landscape, iPad portrait **and 1366 laptop (must be unchanged)** for: Overall, D2C, Amazon, Flipkart, EBO, one quick-commerce channel.
4. Interaction check: channel chips, sub-tabs, filter sheet + picker with search (200+ items), active-filter chips, chart scrub (no card resize), KPI tile switching + glow, Category/Product/SKU toggle, sort chips, fixed row heights, "Show all products" full-screen list, geography toggles, store list (EBO), account breakdown (Amazon), "⋯" menu actions.
5. Update the Vercel **preview** (not production) and send me the link.
