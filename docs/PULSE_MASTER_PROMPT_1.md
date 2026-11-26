# Frido Pulse: make every answer match the dashboard — master prompt

You are improving **Frido Pulse**, the chatbot inside this dashboard repo (`src/ask/`, `api/pulse.js`, and the connector service it calls, which lives in this repo). Follow this file step by step. It replaces `docs/PULSE_ACCURACY_PLAN.md`.

---

## 0. Ground rules (apply to every step)

1. **Source of truth for logic = `docs/PULSE_METRICS.xlsx`** (written by Suraj). It says, for each metric: what it means, which dashboard page it must match, how to calculate it, channels, date logic, exclusions and what the answer shows. Sheet "General rules" sets the defaults (date range, IST, what "D2C" or "Amazon" means, inventory = Regular only, RTO = Logistics only…).
2. **Source of truth for numbers = the dashboard's own code.** For every metric, find the function / API endpoint behind the page named in column F and use **that code**. Never re-write a formula that already exists in the dashboard.
3. **If Suraj's definition and the dashboard code disagree: stop and list it for him.** Never choose yourself.
4. **Never push or merge to `main`.** Work on branch `feature/pulse-tools` (create it from latest main). Commit after each step.
5. **Read-only data.** Pulse must never write, update or delete data. No secrets in code, logs or commits (`.env`, `sa_key.json`, keys).
6. **Access:** Pulse answers only from pages the asking user can open. Never touch Suraj's or Pranjal's accounts; use temporary test users and delete them after.
7. **Stop at every ⛔ STOP**, reply in under 12 lines, and wait for Suraj's "go".

---

## Step 1 — Understand today's setup (read-only)

Write `docs/PULSE_TOOLS_PLAN.md` with:
- How Pulse works now: `api/pulse.js` → connector (`CONNECTOR_URL/chat`) → model → SQL / commands. Which files, which model, which database logins (read-only or not), how the knowledge file (CLAUDE.md) is loaded.
- **Every dashboard API endpoint / server function that returns numbers**, grouped by page: Overview, Sales (+ Return Analysis), P&L, Inventory Health, Out-of-stock loss, Logistics Performance, Logistics Cost, Ads, Customers. For each: file + function, inputs (channel, sub-channel, dates…), outputs, which screen uses it.
- For **each row in `PULSE_METRICS.xlsx`**: the endpoint/function that produces it on the page in column F (or "not on any page").

## Step 2 — Check Suraj's definitions against the code

For each row in `PULSE_METRICS.xlsx`:
- Compare column G (Suraj's definition) and columns H–J (channels, dates, exclusions) with what the code in Step 1 actually does.
- Result per row: ✅ same · ⚠️ different (say exactly how, in plain words) · ❓ not on any page / can't find.
- Rows marked "To confirm" or empty: write what the code does, in plain words, for Suraj to confirm.
- **Known case:** RTO %. Pulse answered 4.7% for last month (revenue-based formula from CLAUDE.md); Logistics → Performance shows 8.2%. Suraj's rule: **RTO % = Logistics → Performance only.** Reproduce 8.2% from the Logistics code and remove the revenue-based RTO from Pulse.

Write it to `docs/PULSE_METRICS_CHECK.md` as a table: metric · Suraj's definition · what the code does · result · question for Suraj.

⛔ **STOP.** Reply with: counts of ✅ / ⚠️ / ❓, the full list of ⚠️ and ❓ rows (one line each), and the RTO check (8.2% reproduced: yes/no).

Suraj will answer each ⚠️/❓ in the sheet (column "Your notes" / status "Confirmed"). Continue only after his "go".

## Step 3 — Write Pulse's rulebook

1. Create `docs/PULSE_METRICS.md` from the confirmed sheet (both sheets), one section per metric:
   - **Name** and **also called** (synonyms people use)
   - **Answer from:** tool name + dashboard page (e.g. "tool `logistics_performance` → Logistics → Performance")
   - **Definition** in plain words (Suraj's, confirmed)
   - **Channels / dates / exclusions**
   - **Answer shows** (e.g. "% + RTO shipments ÷ total, vs previous period")
   - **Example question → example answer**
2. Update the connector's knowledge file (CLAUDE.md) — show the diff before saving:
   - At the top: **"For every question: (1) find the metric in PULSE_METRICS.md (match synonyms), (2) apply General rules for anything not said (dates, channel), (3) call the tool listed under 'Answer from', (4) answer in the format below. Only if no metric/tool fits, write SQL yourself and label the answer *custom query — not from the dashboard*."**
   - Remove formulas that a tool now covers (keep only those needed for custom queries), so there is one source for each metric.
   - Fix: all dates in IST (`CURRENT_DATE('Asia/Kolkata')`); Clickpost `shipment_type` and courier column names as they really are in the table (check with SELECT DISTINCT); inventory = Regular + Live facilities only.
3. **Answer format (put in CLAUDE.md):**
   - First line: the number in **bold** with unit (₹ Cr / L, Indian commas, % with 1 decimal), plus change vs previous period if the page shows it.
   - Then a short table if there's a breakdown (max 10 rows).
   - Last line: `Source: <page> · <channel> · <dates, IST> · <filters>` — e.g. `Source: Logistics → Performance · D2C forward shipments · 1–30 Sep 2026`.
   - If something was assumed (dates, channel), say it in that line. If data isn't available, say so in one line and stop.
   - Ask back only when the General rules say to (e.g. Amazon SC vs VC, "best courier").

## Step 4 — Build the dashboard tools

Build one tool per group from Step 1 (at least these):

| Tool | Answers | Calls |
|---|---|---|
| `sales_summary` | gross, net, orders, units, AOV, ASP, returns %, CIR %, cancellation %, DRR, vs previous period | the Sales page's own functions |
| `sales_breakdown` | by channel / sub-channel / category / SKU, top N | Sales page functions |
| `return_analysis` | return % by SKU / category | Return Analysis functions |
| `inventory` | total, by warehouse, by SKU, DOI, avg daily sale, slow stock (Regular + Live) | Inventory Health functions |
| `oos_loss` | OOS SKUs, loss, by category / ageing / SKU | Out-of-stock loss functions |
| `logistics_performance` | RTO %, delivery rate, TAT, stuck, pending, NDR, by courier | Logistics Performance functions |
| `logistics_cost` | total cost, cost per shipment, cost % of revenue, by courier / type | Logistics Cost functions |
| `ads` | spend, ROAS, ACoS by channel | Ads page functions |
| `pnl` | CM1, CM1 %, COGS, marketing % by channel (Overall stays "not available") | P&L functions |
| `customers` | CAC, new vs repeat, retention, LTV, support tickets | Customers functions |

Rules for every tool:
- Calls the **same function/endpoint the page uses** with the same inputs (channel, sub-channel, start, end). No copied formulas.
- Runs **as the logged-in user**: `api/pulse.js` passes the user's session to the connector; the tool checks the user can open that page, otherwise returns "You don't have access to this data." `api/pulse.js` also checks the user can open Pulse (`'ask'` permission or the existing whitelist) and returns 403 otherwise.
- Returns the numbers **plus** the source line (page, channel, dates, filters) for the answer.
- **Check each tool against its page** for 2 date ranges (this month, last month) and 2 channels where relevant: numbers must match exactly. Note how long each tool takes.
- Database logins used by Pulse must be **read-only** (BigQuery viewer; Supabase read-only role). Change it, or tell Suraj exactly what to change.

⛔ **STOP.** Reply with: tools built, match results (✅/❌ per tool), response times, anything Suraj must do.

## Step 5 — Planning tools (beyond the dashboard, fixed logic)

**5a. Measure first (report before building):**
- **Lead time Pune → each Regular 3PL warehouse** (stock comes by transfer from Vadgaon_OPS / Frido_Sudhawadi): from stock-transfer records of the last 90 days (dispatch at Pune → inward at destination), median and 80th-percentile days per warehouse. Name the table/columns used. If transfers can't be matched, use 7 days and say so.
- **Stock on the way:** there is no table for it. Check if transfers dispatched from Pune but not yet inwarded can be found; if yes use them, if not use 0 and **say "stock on the way not included" in every planning answer**.
- **Safety days** per warehouse = 80th percentile − median lead time, minimum 3.

**5b. `replenishment_priority`** (warehouse optional, top N default 10). For each SKU × Regular 3PL warehouse (not Pune):
- Daily demand = B2C avg daily sale **from that warehouse**, OOS-page method (longest in-stock run in 180 days; run < 14 days → 180-day average, flagged).
- Days of cover = sellable stock ÷ daily demand.
- Needs refill if days of cover < lead time + safety days.
- Priority = (lead time + safety − days of cover) × daily demand × ASP = **sales at risk (₹)**.
- Suggested transfer = daily demand × (40 + lead time) − stock − on the way, rounded up to pack/carton size if the item master has it; never below 0.
- Pune check: Pune sellable stock for the SKU; if it can't cover the transfer → "Pune short by X (needs PO)".
- Answer: per warehouse, top 10 table — SKU, product, stock, days of cover, daily demand, sales at risk, suggested qty, Pune stock.

**5c. `plan_qty`** (SKUs, target days default 40, one warehouse or all Regular):
- Plan qty = daily demand × (target days + lead time) − (stock + on the way), rounded up to pack size, never below 0.
- Always show the working: daily demand (method + run used), lead time, stock, on the way, result. Flag fallbacks.

**5d. Check:** FR-ERFT-B1 daily demand (all warehouses) = 17.41/day as on the OOS page. Work 3 SKUs by hand in `docs/PULSE_PLANNING_CHECK.md`.

Add both tools to `PULSE_METRICS.md` (rows "Replenishment priority" and "Plan qty for X days").

⛔ **STOP.** Reply with: lead times per warehouse, whether "on the way" was found, the FR-ERFT-B1 check, and a sample top-10 for one warehouse.

## Step 6 — Score it

1. Run every question in `docs/pulse_test_set.csv` through Pulse **twice**: on `main` (before) and on `feature/pulse-tools` (after).
2. Pass = within 0.5% of `expected_answer`, or the right behaviour for tricky ones (asked back / said no data / refused).
3. Also check every answer has the bold number first and the `Source:` line.
4. Write `docs/PULSE_SCORE.md`: before vs after score, a pass/fail table (question, Pulse answer, expected, pass/fail, time), and the top 5 failures with reason and suggested fix. No code changes in this step.

⛔ **STOP.** Reply with both scores, average answer time, and the top 5 failures.

## Step 7 — Wrap up (only after Suraj's "go")

- Push `feature/pulse-tools` and open a PR to main (don't merge). PR description: what changed, the score before/after, anything Suraj must do (read-only logins, env vars).
- From now on, when a dashboard formula changes, the tool changes with it automatically; if a new metric is added to a page, add a row to `PULSE_METRICS.xlsx`, then a section in `PULSE_METRICS.md`.
