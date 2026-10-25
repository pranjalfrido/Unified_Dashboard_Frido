# Overview — Alignment with the Sales mobile design (addendum)

> Apply on top of `OVERVIEW_MOBILE_REDESIGN_PROMPT.md`. Where this file and the earlier prompt differ, **this file wins**.
> Visual reference for everything below: `docs/responsive/mockups/sales_mobile_mockup.html` (the Sales master card, header, lists, glow, palette).
> Scope: below 1024px only. Laptop/desktop unchanged. Display/layout only — no number or logic changes.

---

## Goal
Overview and Sales must look and behave like **one app**. Build (or refactor into) **shared components** so both pages use the same code:
`MobilePageHeader`, `MasterTrendCard`, `KpiTile`, `CompactRankRow`, `MobileRankedList`, `FullScreenList`, `FilterSheet`/`FilterPicker`, `CollapsibleSection`, `InfoPopover`, `DeltaBadge`.

## 1. Header — same as Sales
- Same **compact dark-green gradient header**: title "Overview" (soft white) + date pill on row 1.
- If Overview has any filters/slicers today: the same **filter icon with a white count badge** → the same `FilterSheet` (level 1 rows) + `FilterPicker` (search, Top by revenue / A–Z, pinned selections, Apply (n)). Active filters appear in the same slim **"Filtered:"** strip with ✕ and Clear.
- No channel chips on Overview (Overview is all channels). If Overview has a channel slicer, it goes inside the FilterSheet.
- Notification bell: keep it, styled for the dark header (white outline icon, small badge).

## 2. Hero card → the same `MasterTrendCard` as Sales
**Replaces section B ("Sales Trend card") of the Overview prompt.**
- **Soft light-green gradient background** (`#dcebe2 → #e9f3ed → #f4f9f6 → #fff`), very light border `#dbe8df`.
- **Hero:** Gross Revenue, ~28px, with ▲/▼ vs prev period on a **fixed 2-line** sub-line ("▲ x% vs prev · orders · units").
- **Chart:** identical to Sales — full-width, ~120px tall, no axis labels, prev-period dashed line, legend "This period / Prev period / Daily · auto", touch-and-drag scrubber (hero shows that day's value + "date · prev ₹x"), auto granularity with override in "⋯". **No card resize while scrubbing.**
- **KPI grid instead of the swipe-chip row:** 2-column `KpiTile` grid, **even count**, label + ▲/▼ on line 1, value on line 2; tap → hero and chart switch to that metric; selected tile = **soft glow** (`border 1px rgba(31,90,61,.22)` + `box-shadow 0 0 10px 1px rgba(31,90,61,.10)`); other tiles very light border `rgba(31,90,61,.08)`.
- **Proposed Overview tiles (6):** Gross rev, Net rev, Orders, Units, AOV, Return %. ASP drops on mobile only to keep the count even (it stays on desktop). Confirm in your plan; if you think a different metric should drop, say why.
- ▲/▼ previous-period values: keep the deferred/lazy/cached approach already agreed. Same "all or none per card" rule.

## 3. Lists — same row style as Sales
- **Channel Scorecard:** keep the aligned 2-column cards (fixed rows) from the Overview prompt, but apply the Sales palette: no per-channel brand-coloured bars (small logo is fine), all bars Frido green, normal dark text, ▲/▼ only in green/red, very light tile border.
- **Product Performance:** use the exact Sales product-row style: `MobileRankedList` with **fixed row height** (name max 2 lines, **category under the name**, thin bar pinned at the bottom), sort chips, tap → detail sheet. "Show all" → the same **`FullScreenList`** (search, sort chips, category chips, count, 20 at a time + Load more, back arrow), built for 200+ items.
- Any simple breakdown list (e.g. regions, top states if present): use `CompactRankRow` — name · ₹ · % on one line, thin bar. **No donuts** on mobile.

## 4. Logistics & Ops / State of the Business — palette alignment
- Tiles use the same `KpiTile` look (very light border, value + ▲/▼ on one line where space allows).
- Status colour edges only when a target exists in `metricTargets.js` (unchanged rule) — otherwise neutral.
- Speed & SLA bars and the customer split bar use Frido green shades only.
- Inventory alert rows: neutral rows with a small status dot (red/amber) only when the existing thresholds say so — no fully coloured tiles.

## 5. Global rules (identical on both pages)
- Calm palette: Frido green for brand; dark text for values; green ▲ / red ▼ only for good/bad (direction-aware); existing Return % thresholds as the only status colour. No gold/orange/blue decorative accents.
- Type scale: hero ~28px; tile value ~15.5px; labels 11–12px uppercase muted; body 12.5–13px; minimum 12px; inputs ≥16px; one font + `tabular-nums`.
- Fixed heights for anything that changes on touch; no inner scroll containers; no wide tables on mobile.
- Collapsible sections (G2) keep working; section headings styled the same on both pages.
- Bottom nav: same component on both pages.

## 6. Plan → build → verify
**Plan first (then wait for my OK):**
1. Which components become shared and where they'll live (e.g. `src/responsive/`), and what changes in Overview vs what Sales will reuse.
2. Whether Overview has filters/slicers today and how they map to the FilterSheet.
3. The final Overview KPI tile list (even count) and what drops on mobile.

**Verification (then STOP):**
1. Build passes; no new lint errors; numbers identical to baseline.
2. Side-by-side screenshots at iPhone SE / iPhone 14 / Pixel: **Overview master card vs Sales master card** (must look like the same component), Product Performance vs Sales product list, headers of both pages. Plus 1366 laptop (unchanged).
3. Interaction check: scrub (no resize), tile switch + glow, filter sheet/picker, Show all full-screen list, collapsible sections.
4. Update the Vercel **preview** and send the link.
