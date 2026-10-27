# Mobile header: deep green (final, option C1)

> Mockup: `docs/responsive/mockups/header_green_mockup.html` (final C1: Sales D2C, Logistics Cost, a sub-screen). Replaces the Ivory colours in `HEADER_MOBILE_PROMPT.md`; structure, heights and control order stay the same.
> Branch: on top of `release/responsive` if PR #28 is still open (tell me which branch you used), otherwise a new `feature/header-green` from main. **Display only**: same data, filters and routes. Never push or merge to `main`. Laptop unchanged.

## 1. Header (shared `MobilePageHeader`, every mobile screen)
- Background `linear-gradient(160deg, #1a4d34 0%, #1f5a3d 55%, #266b49 100%)`; shadow under it `0 8px 18px -8px rgba(20,50,35,.45)`; no bottom border.
- Heights unchanged: row 1 48px, chips row 36px, sub-tab row 32px, 2nd sub-tab row 30px. No collapse on scroll.
- **Row 1:** title white 17px / 650; context (e.g. "D2C") `#a9c9b6` 13px / 500. Icons (back, filter, ⋯) `#d8e8de`, borderless; pressed state `rgba(255,255,255,.10)`.
- **Date pill:** `rgba(255,255,255,.14)` fill, white text 12.5px / 600, radius 10, 32px tall; chevron = small SVG (9×6, stroke 1.6, 70% opacity), **vertically centred** with the text, 5px gap (no text glyph like ⌄).
- **Notifications dot** on ⋯: red `#e5534b` with a 1.5px ring in the header green so it stays crisp.
- **Filter count badge:** mint `#9fe0b9` circle with `#143d2a` number.
- **Channel chips:** inactive `#b9d4c4` text, no fill; **selected = white fill, `#1f5a3d` text**, no ring/outline. Right-edge fade mask stays.
- **Sub-tab row:** 1px top divider `rgba(255,255,255,.12)`, background `rgba(0,0,0,.08)`; tabs `#a9c9b6` 12.5px / 600; active white with a 2px `#9fe0b9` underline. 2nd sub-tab row (Logistics Cost, Customers Intelligence): `rgba(0,0,0,.14)`, same colours.
- **"Filtered:" strip** (only when a non-default filter is on): sits under the header on the page background (light), unchanged.
- Focus: no tap focus box; `:focus-visible` ring `#9fe0b9`.
- `theme-color` meta on mobile → `#1a4d34` (phone status bar matches).

## 2. Bottom bar (unchanged look, small lift)
- Stays light `#fbfaf7`, 48px + safe area, full width, fixed. Add a hairline `0 -1px 0 #e6e2d8` and soft shadow `0 -6px 16px -6px rgba(28,52,40,.14)` so it separates from content.
- Selected icon: as now (green icon on mint tile `#edf6f0`, very soft halo).

## 3. Coverage
- Every screen in the `HEADER_REPORT.md` list: all pages, channels, sub-tabs, P&L tools, Return Analysis, Out-of-stock loss (if merged), Profile screens, Documents, Frido Pulse, internal tools, and full-screen lists / heatmaps (‹ back + title on green).
- **Not changed:** bottom sheets (keep white sheet header with ✕), the launcher sheet, login (keeps its own green band), laptop.
- Master cards keep their soft green gradient; check they still look right under a green header (add 12px gap from header if needed).

## 4. Update docs
- `MOBILE_DESIGN_SYSTEM.md`: header colour tokens above (replace Ivory), bottom bar shadow.

## 5. Verification
- 375 and 360, Chromium + WebKit: Sales (Overall, D2C, Amazon sub-tabs), P&L + one tool, Inventory, Logistics Cost (2 sub-tab rows), Ads, Customers Intelligence, Profile, one full-screen list.
- Heights unchanged (±1px); chevron centred in the date pill; selected chip has no ring; text contrast ≥ 4.5:1 for title, chips and active tab; no layout shift; no horizontal overflow; no focus box on tap.
- Screenshots in `docs/responsive/HEADER_REPORT.md` (before/after). Commit, push, merge into local preview-all, restart localhost:5173. Reply in under 6 lines.
