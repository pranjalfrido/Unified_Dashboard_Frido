# Mobile headers: Ivory, compact and elegant (all pages)

> Mockup: `docs/responsive/mockups/header_mockup.html`. Follow `MOBILE_DESIGN_SYSTEM.md` (update its MobilePageHeader section with these rules).
> Branch: `feature/responsive-profile` (after the navigation work). Change the shared `MobilePageHeader` once so every page gets it; no page-specific copies. Layout only; same data, filters and routes. Never push or merge to `main`. Laptop unchanged.

## 0. Bug: "Filtered" strip with nothing filtered
Overview shows "Filtered: Sub-channel: ShopifyIndia ✕ Clear" and a filter count "1" although the user filtered nothing. Find where the default filter is counted as a user filter. **Rule:** the strip and the count show only filters that differ from the page's default state. Same rule on every page. Report what the default was and where it came from.

## 1. Structure (same on every page; rows only when the page has them)
| Row | Height | Content |
|---|---|---|
| 1 | 48px | Title 17px / 650, letter-spacing −0.015em, ink `#1c2420`, + context in 13px / 500 grey `#8a938e` (e.g. "Sales  D2C"). Right side, **always this order**: date · filter · ⋯. A control the page doesn't have is absent; the others never move. |
| 2 | 28px chips + 10px bottom padding | Channel / platform chips (Sales, P&L, Ads). |
| 3 | 34px | Underline sub-tabs. A second sub-tab row (Logistics Cost, Customers Intelligence) is 30px, 12px, on a slightly darker band `#f6f4ef`. |
| strip | 28px | "Filtered:" chips + Clear, only when a non-default filter is active (see 0). |
Targets: 48 / 86 / 120px for 1 / 2 / 3 rows; 42px collapsed.

## 2. Colour and surface (Ivory)
- Header background `#fbfaf7`, 1px bottom border `#eae7df`; sub-tab row has a 1px top divider `#f0ede6`. Page background stays `#f4f2ed`, cards white.
- **One accent:** Frido green `#1f5a3d` only for the active chip, the active underline and the date pill text. Everything else ink / grey.
- Update `theme-color` meta to `#fbfaf7` on mobile so the phone's status bar matches.
- The dark green gradient stays only where it's a brand moment: the login band. The master cards keep their soft green gradient.

## 3. Controls
- **Date pill:** 32px tall, radius 10, mint fill `#eef5f0`, green text 12.5px / 600, short format ("1–30 Sep", "Sep 2026", "1–26 Oct") + small chevron at 60% opacity. No border.
- **Filter and ⋯:** 34 × 34, radius 10, **no border or fill**, icon 16px in `#4e5a54`; pressed state `#f1efe9`. Filter count = green circle (14px) with white number; notifications = a 7px red dot on ⋯ (count shown inside the menu: "Notifications (4)" as the first item, opening the existing panel).
- Remove the separate bell button and the second-row ⋯ (Sales D2C, P&L): their actions go into the row-1 ⋯ menu.
- No tap focus box anywhere in the header; `:focus-visible` ring (`#9cc4ad`) for keyboard.

## 4. Chips and tabs
- **Channel chips:** 28px tall, padding 0 11px, 12.5px / 600, gap 4; inactive = text only `#5c6761` (no fill, no border); **selected = Frido green fill, white text**, no ring. Right edge fades (mask) to hint scroll; the selected chip scrolls into view. "In progress" dot 5px amber.
- **Sub-tabs:** 12.5px / 600, grey `#8a938e`; active ink with a 2px green underline the width of the label. Evenly spread when ≤ 4 tabs, left-aligned scroll when more.

## 5b. Coverage: every page, tab and sub-tab
Change the shared `MobilePageHeader` once, then **make sure every mobile screen uses it** (any page with its own header gets migrated, no copies). First list every route/screen from the code in `HEADER_REPORT.md` with its rows; the table below is the minimum:

| Page | Row 1 (title · context · controls) | Row 2 chips | Row 3 sub-tabs |
|---|---|---|---|
| Overview | Overview · date · filter · ⋯ | — | — |
| Sales | Sales · channel · date · filter · ⋯ | Overall, D2C, EBO, Amazon, Flipkart, Blinkit, CRED, Firstcry, Instamart, Zepto, Myntra, International, Offline, Financial MIS (as in code) | D2C: Overall / MyFrido / Mobility; Amazon: Overall / Seller Central / Vendor Central; Offline: Overall / B2B / Stockist / MT GT / Misc (whatever each channel has) |
| Sales → Return Analysis | ‹ back to Sales · "Return analysis" · date · filter · ⋯ | — | — |
| P&L | P&L · channel · date · ⋯ | all P&L channels (in-progress dot) | same sub-tabs as Sales per channel |
| P&L tools (Price Simulator, Breakeven ROAS, B2B Costing, PO Approval) | ‹ D2C / ‹ Offline back · tool title · ⋯ (no chips, no sub-tabs) | — | — |
| Inventory | Inventory · filter · ⋯ (no date) | — | Inventory Health / Sales & Allocation |
| Logistics | Logistics · date (or month pill on Cost) · filter · ⋯ | — | Performance / Cost; Cost adds 2nd row Overview / B2C / FTL/PTL / 3PL |
| Ads | Ads · channel · date · ⋯ | Overall, D2C, Amazon, Flipkart, Myntra, Blinkit, Zepto, Instamart, CRED | — |
| Customers | Customers · date · ⋯ | — | Intelligence / Support; Intelligence adds 2nd row Overview / Acquisition / Retention / Behaviour / Segments / Discounts; Support has the Daily / Weekly / Monthly toggle in the page, not the header |
| Profile, Team members, Member page | Profile (‹ back on sub-screens) · ⋯ | — | — |
| Documents, Frido Pulse | title · date (if the page has one) · ⋯ | — | as in code |
| Internal tools (COGS, Packaging BOM, ledgers, Courier Allocation…) | ‹ back · title · ⋯ | — | as in code |
| Full-screen lists / heatmaps / drill-downs | ‹ back · title · (search icon if the view has search) | — | — |
| Login | unchanged (keeps its green band) | — | — |

- Rule for any screen not listed: same 3-row pattern, rows only if it has them, control order date · filter · ⋯.
- Back arrow (sub-screens and tools) sits left of the title, 34 × 34, same borderless style.
- Bottom sheets keep their own sheet header (title + ✕); they don't use the page header.

## 5. Collapse on scroll
After ~80px of downward scroll, rows 2–3 (and the filter strip) fold into a single 42px bar: "Title · channel · sub-tab" (15px / 13px grey) + date pill + ⋯, background `rgba(251,250,247,.86)` with backdrop blur and a soft shadow `0 4px 14px rgba(28,36,32,.07)`. Scrolling up restores the full header. 200ms transition, none with reduced motion. Sticky at the top. Must not jump the content (use a placeholder height or transform). The bottom bar stays fixed as before.

## 6. Verification
- **Every screen in the 5b list** (the one you built from the code) at 375 and 360 (Chromium + WebKit), every channel chip and every sub-tab, incl. Return Analysis, all 4 P&L tools, Profile sub-screens, Documents, Frido Pulse, internal tools and full-screen views. Screenshot each header (expanded + collapsed) into `docs/responsive/HEADER_REPORT.md`, and mark any screen that couldn't be migrated and why.
- Heights match section 1 (±2px); add a table of measured heights per page, before vs after (expanded and collapsed), at 375px; control order identical everywhere; no wrapped titles; no focus box on tap.
- Overview with no filter applied: no strip, no count. Apply a filter: strip + count appear; Clear removes them.
- Notifications reachable from ⋯ with the same count as before.
- No horizontal page overflow; text ≥ 12px.
