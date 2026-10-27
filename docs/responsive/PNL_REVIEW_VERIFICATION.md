# P&L review fixes: verification (PNL_REVIEW_FIXES.md §7)

Branch `feature/responsive-pnl`, local build, page default range **1–26 Oct 2026, live API**. Scripts (committed): `scripts/responsive/check-pnl-fv.mjs`, `check-pnl-tools.mjs`, `capture-pnl-review.mjs`, `compose-before-after.mjs`, `check-palette.mjs` (new `TOOL=` option). Results: `docs/responsive/after/pnl-review/fv-check.json`, `after/pnl-tools/report.json`, `before|after/pnl-review/report.json`. Screenshots are git-ignored; the before | after composites are on Suraj's machine in `docs/responsive/after/pnl-review/compare/` (open `index.html`).

## Summary

| Check | Result |
|---|---|
| Chip list per channel / sub-tab = §1a table | ✓ 20 views, no difference (MT GT had no products in the range, no list) |
| Each chip's top 8 on the phone = laptop table sorted the same way (materiality filter on % / ROAS sorts) | ✓ 0 real mismatches on 20 views, 139 chip lists. Ties at display precision counted separately (15). |
| Units, Revenue, ASP of the top 10 rows (Revenue, "Show all") = laptop row | ✓ 190 rows on 19 views, 0 differences (International has fewer than 9 products: no "Show all") |
| Tools: same inputs → same outputs on laptop and phones (SE, 14, small Android) | ✓ all four cases equal |
| No horizontal overflow at 375 and 360, every tool, with the case filled in | ✓ (Breakeven was 509px at 375 before; PO 396px mid-build, fixed) |
| Sticky bar never covers a focused input | ✓ hidden while a text field has focus, on every tool and viewport |
| Inputs ≥ 16px (no iOS zoom) | ✓ 0 inputs under 16px |
| Design system (palette, text ≥ 12px), Chromium + WebKit | ✓ Financial view page and all four tools: 0 off-palette colours, 0 text under 12px |
| Laptop 1366 before / after | ✓ Financial View column order only; tools: B2B status line and rounding text, "Your product", one-sign money (no laptop-visible case changed in the Price Simulator) |
| Production build | ✓ |
| Lint | unchanged vs b1cf3f5a (App.jsx 354 errors; touched P&L / responsive files equal to their baselines; new files clean) |

## Tool cases (laptop = phone)

| Tool | Case | Result (every viewport) |
|---|---|---|
| Price Simulator | Orthotics Posture Corrector, no lever touched | Planned CM2 ₹22.38 L = Current ₹22.38 L; breakeven discount 26.5%; bar "Planned CM2 ₹22.38 L (18.1%) · same as current" |
| Breakeven ROAS | New product ₹1,999 / 7% / ₹600 / 500 g / 18% | Breakeven 1.79x, CM2 @ 15% 2.46x |
| B2B Costing | COGS ₹249, 0.5 kg, EBITDA 20%, no listing price | ₹494 incl. GST; "₹469 exact · ₹470 quoted"; "Enter listing price to check" |
| PO Approval | Orthotics Heel Protector, 20 × ₹400 | Profit 5.8% (₹468 on ₹8.00 K), REVIEW (min 15%); usual CM1 on Offline 7.7% (phone line) |

## Financial view (phone vs laptop)

| View | Chips | Top-8 lists | Ties | Rows (U/R/ASP) |
|---|---|---|---|---|
| Overall, International | Revenue, Net revenue, Returns % | ✓ | | ✓ |
| D2C, MyFrido, Mobility, Amazon, Flipkart | all 9 | ✓ | 1–2 | ✓ |
| Amazon SC / VC, Offline (Overall, B2B, Stockist, Misc), EBO | Revenue … CM1 % (7) | ✓ | 0–2 | ✓ |
| Blinkit, Instamart, Zepto | all except Returns % (8) | ✓ | 0–2 | ✓ |
| CRED, Firstcry, Myntra | Revenue, Net revenue, Returns %, COGS %, GM % | ✓ | 0–2 | ✓ |

The script's first pass flagged lists where the phone continues past the laptop's last value: products with 0% returns (laptop shows "—") and products with no ROAS go after every real value on the phone. Where both have a value the order is identical; these are not counted as mismatches.

## Watchlist (P4) rule check
See `PNL_RULES_RECHECK_2026-10-27.md` and DECISIONS P4: all flags correct on 8 views; "needs action" header counts equal a recount from the displayed flags.
