# Mobile navigation: icon-only bottom bar (soft green glow) + launcher

> Mockup: `docs/responsive/mockups/nav_mockup.html` (v2). Follow `MOBILE_DESIGN_SYSTEM.md`.
> Branch: `feature/responsive-profile` (after the login work). Same routes, same access rules, no backend or database changes. Never push or merge to `main`. Laptop sidebar unchanged.

## 1. Bottom bar (below 1024px)
- **Standard bottom bar, not floating:** full width, flush with the bottom edge, white background, 1px top border (`#eeebe4`), no rounded corners, no shadow, height 60px + the iPhone safe-area inset. Content gets bottom padding so nothing hides behind it.
- **7 slots, icons only (no labels):** Overview · Sales · P&L · Inventory · Logistics · Customer · launcher ("All pages"). Ads, Documents, Frido Pulse and tools live in the launcher. Each slot = 1/7 of the dock width (~53px at 375, ~51px at 360), so every tap target stays ≥ 44px. Inner padding 2px.
- **Icons:** 22px, one consistent outline set, muted grey when not selected.
- **Selected = soft mint tile:** icon in Frido green `#1f5a3d`, stroke 2, on a soft mint tile `#edf6f0` (38 × 34, radius 12) with a very soft, tight halo (`box-shadow: 0 0 8px 1px rgba(120,190,150,.22)`). No dot, no big glow. Inactive icons `#8a938e`. Fade/scale in over 250ms (none with reduced motion). No dark pill, no label.
- **Accessibility:** each icon has `aria-label` with the page name; long-press shows a small tooltip with the name; the launcher icon is labelled "All pages".
- **Last slot = launcher** (grid-plus icon). On a page opened from the launcher (e.g. Ads), the last slot shows that page's icon with the green glow. A small red dot on the launcher icon only when a launcher page has a badge (see 2).
- **Always fixed and visible:** `position: fixed; bottom: 0` on every page, never hidden on scroll (today it sometimes vanishes while scrolling: find why, e.g. a transform/overflow on a parent, the page's own scroll container, or `100vh` vs `100dvh`, and fix it at the root). Content has bottom padding = bar height + safe area. Only full-screen views and bottom sheets cover it.
- No tap focus box; `:focus-visible` ring only.

## 2. Launcher (bottom sheet from the last slot)
- **Top:** profile row (avatar / initials, name, "Admin · Profile & team access ›" for Suraj, "Profile ›" for others) + close button.
- **Search** ("Search pages… try 'rto' or 'roas'", 16px input): matches page names and a small keyword map (rto, ndr, courier → Logistics; roas, spend → Ads; cac, retention, ticket → Customer; margin, cm1 → P&L; stock, doi → Inventory; return → Sales; cogs → COGS). Results as rows; tap navigates. Keyword map in one config file.
- **Recent:** last 4 visited pages as chips (stored per user on this device in `localStorage`, wrapped in try/catch).
- **Pages as a compact grouped list** (not big tiles): groups **Analytics** (Ads, and Logistics / Customer if not in the bar), **Workspace** (Documents, Frido Pulse), **Tools** (COGS, Courier Allocation and any other tool the user can open). Each row: icon tile (34px, soft green), name + one-line description, and on the right the **live number** with a tiny label (Ads "5.23x ROAS", Logistics "4.1% RTO", Customer "211 · 9+ days", Frido Pulse "9:30 am updated") only if that data is already loaded/cached; otherwise a ›. No new queries.
- **Current page** row: soft green background + a 3px green edge on the left.
- Sheet fits its content; if it scrolls, use the global 3px scrollbar (no wide grey bar as today).
- **Edit bar:** toggles edit mode: every page the user can open as a row with a check (grouped Main / Analytics / Workspace / Tools); pick 2–6 pages for the dock (the launcher is always last). "Done" saves. **Saved per user per device in `localStorage`** (key includes the user id); default Overview, Sales, P&L, Inventory, Logistics, Customer, or the first 6 pages the user can open. If a saved page later loses access, it drops out silently.
- **Footer line:** Theme (left) · Sign out (right, red text), light text buttons, not big boxes.
- Closes on: tile / row tap (navigates), ✕, shade tap, swipe down, Esc.

## 3. Access
Only pages the user can open appear in the dock, Recent, search results and tiles (same access data as the sidebar). A user with fewer than 6 pages gets a shorter dock (icons spread evenly).

## 4. Verification
- Chromium + WebKit at 375 / 360: each dock icon (all 7, tap targets ≥ 44px at 360), launcher → every tile, search ("rto", "roas", "cogs"), Recent updates, Edit dock (add / remove / limit 6 / Done), reload keeps the dock, last slot shows the current launcher page, bar stays visible while scrolling long pages (P&L, Customer Support) on both engines.
- Non-admin test user: only their pages anywhere; profile row says "Profile".
- No horizontal overflow, no text under 12px, safe-area respected, no focus box on tap.
- Screenshots (dock on 5 pages, launcher, search, edit mode) in `PROFILE_REPORT.md`.
