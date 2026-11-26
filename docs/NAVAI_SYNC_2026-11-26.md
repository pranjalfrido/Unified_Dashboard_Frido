# NavAI sync, 26 Nov 2026 (branch navai/sync-2026-11-26)

Base: no `LAST_SYNC.md` existed, so the window starts at the last NavAI knowledge refresh (`47d67c2c`, 23 Nov; the `feature/pulse-tools` merge `d14dca3e` is dated 26 Nov but its knowledge is the 23–24 Nov work). Synced up to origin/main `81b3e321`.

## What changed on the dashboard → what changed in NavAI
| Dashboard change | NavAI |
|---|---|
| **Inventory Health → "Inventory cost detail" card** released (`inventory:cost`; laptop 24 Nov, phone 26 Nov; COGS label "Sep 2026, carried forward") | New read-only tool `inventory_cost` (lib/inventoryCost.js): summary, by product / SKU / category, SKUs without COGS, COGS month. Same rule as the card (own COGS, else sub-category average, else not valued), stock = Regular facilities of `inv-data-7d`, counts = SKUs with stock > 0, DOI / status bands as the card. All totals calculated in code. Permission `inventory:cost` (admin always); `cogs-monthly` also opens with `inventory:cost`. Knowledge: ENDPOINT_MAP Group 3c, PULSE_METRICS 45–48, PLAYBOOK row, CLAUDE.md rule 5d. |
| Inventory Health avg sale is company-wide per SKU (23 Nov cache fix; 25 Nov SKU-level avg sale with facility slicers) | Knowledge only (ENDPOINT_MAP avg-sale rows). No code: NavAI reads the same file. |
| COGS page reads/writes `product_cogs_monthly`; `cogs_ledger` retired | `cogs_ledger` removed from `tables.json` and CLAUDE.md. NavAI stays SELECT-only. |
| `pnl-data.json` shrunk: zero return components are `null`, `source` field removed | Knowledge note (ENDPOINT_MAP, "Changes of 26 Nov"). No number changes. |
| Breakeven ROAS calculator, Saved scenarios, other P&L calculators | No change: they work on user-typed or privately saved numbers. Noted as "NavAI has no access". |
| Feedback, live users, silent update, PWA, phone layouts, Inward mobile, OOS mobile | No change (no data or meaning). |
| `middleware.js` | No change: the card reads `/api/cogs-monthly` and `inv-data-*.json`, both already on the x-navai-secret read list. Nothing admin/feedback/presence/auth-admin/upload was added; no write endpoint is on the list. |

## Hidden pages (`frido-data-connector/knowledge/hidden-pages.json`)
New mechanism: a key listed there is answered for **admins only**; others get "I don't have access to that." and NavAI never mentions the page. Listed now: `alerts-phase2` (Alerts Phase 2), `documents:cn-manage` (Credit notes: manage). **Please confirm this list**: I found no other in-progress data pages in the code; add a key before a new page ships to users.

## Read-only
`inventory_cost` only reads two sources (`inv-data-7d` file, `POST /api/cogs-monthly`, which is SELECT-only). No insert / update / delete exists in the module (a test greps for it).

## Tests
`test-inventory-cost` (rule on a fixture + guards that fail when the page's `valueRow`, COGS reducer, `costGroup.js` or Regular-stock code changes), `test-page-access` (+15 cases: with permission = answer, without = refused, hidden = admin only), and all existing tests. 6 new test-set questions (ids 105–110), one the page cannot answer.
