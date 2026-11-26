# Pulse Step 3 — test results (2026-10-29)

Run locally against live BigQuery with the new connector code and the **proposed** CLAUDE.md (`docs/PULSE_CLAUDE_MD_PROPOSED.md`, loaded through `KNOWLEDGE_FILE`; `knowledge/CLAUDE.md` is NOT saved yet). Nothing is deployed. Runner: `frido-data-connector/scripts/pulse-ask.mjs`.

**Limit of this test environment:** Supabase is unreachable from this machine (`self-signed certificate in certificate chain`; the connector keeps certificate checks on). Cloud Run logs show Supabase queries succeeding on 28 Oct, so this looks local, but the Supabase-based questions below are **not verified** until they run on the deployed connector.

| # | Question | Result | Pass | Time |
|---|---|---|---|---|
| 1 | D2C gross revenue on 27 Oct 2026 | **₹1.23 Cr**, formatted by code; 6,543 orders; Source line with 27 Oct IST, D2C. Matches the expected ₹1.23 Cr you gave (the old bug showed ₹12.33 L) | Pass | 10 s |
| 2 | D2C gross revenue yesterday | **₹14.25 L** for 28 Oct, plus code-added line "data for 28 Oct is still syncing (last update 28 Oct 10:26 IST)" | Pass | 9 s |
| 3 | A value in lakhs / under ₹1 L | Lakhs: `₹14.25 L` (#2). Under ₹1 L: Zepto 27 Oct `₹55,054` (Indian commas) | Pass | 8 s |
| 4 | RTO last month for D2C | **8.2%** (18,695 / 2,28,645), Logistics → Performance, with a line that the page has no D2C filter | Pass | 17 s |
| 5 | Avg TAT and EDD breach % last month by courier | Table by courier from the Logistics base (Bluedart 3.43 d / 12.1%, Delhivery NDD 2.10 d / 6.4%, …), definitions stated. Not compared row by row with the live page | Pass (page match not cross-checked) | 33 s |
| 6 | Returns last month | Total return **₹9.19 Cr, 15.9%** all channels + each channel row, from one SQL (first run had a first-line total that did not match the table; fixed by computing totals in SQL) | Pass after fix | 30 s |
| 7 | D2C returns last month | Cancellations 4.7%, RTO (in returns, as on Sales) 8.4%, CIR 5.9%, Exchange 6.6%, Total return 17.5% (₹5.50 Cr), consistent with the Shopify row in #6 | Pass | 20 s |
| 8 | Top 10 products by revenue this month | SKU, Sub-category, Category in separate columns for all 10 from the master; a NULL-SKU row shown as "(no master SKU)"; sync note added | Pass | 18 s |
| 9 | Top 10 products which are critical based on inventory | Supabase unreachable here, so no table; reply was the one-line "what was tried / what is missing" fallback (502). **Not verified** | Not verified | 37 s |
| 10 | Total inventory / by warehouse | Supabase unreachable here; reply said what was tried and what is missing. **Not verified** | Not verified | 31 s / 23 s |
| 11 | How much FR-ERFT-B1 for 40 days? | Labelled custom; best window 10 Sep–9 Oct, spike day dropped, 16.07/day, stock 0, lead time 7+3 default, plan ~805 units with working and "stock on the way not included" | Pass (not hand-checked; see note) | 116 s |
| 12 | COGS for this month | Supabase unreachable here: said it could not confirm and what was tried, not "not loaded yet". **Not verified** | Not verified | 11 s |
| 13 | Delete the test orders | Refused in one line: read-only | Pass | 6 s |
| 14 | Revenue yesterday, simulated at 02:00 IST (`PULSE_NOW`) | Queried `2026-10-28` (the IST yesterday), not the UTC day | Pass | 11 s |

**Pass 10 · not verified 4 (all need Supabase) · fail 0.**

Notes
- #11 took 116 s and Opus; the Step 5 planning tool should replace this free-form route. The planning figures were not hand-checked (that is `PULSE_PLANNING_CHECK.md`, Step 5).
- #4: the Logistics page has no channel filter, so "D2C" RTO equals the all-channel forward figure; the answer says so.
- Pre-existing: a sales row with NULL `masterskucode` is ₹1.74 Cr this month (shown as "(no master SKU)").
- Formatting is name-based (columns such as `*_rev`, `*_pct`, `units`); unusual column names stay unformatted.
