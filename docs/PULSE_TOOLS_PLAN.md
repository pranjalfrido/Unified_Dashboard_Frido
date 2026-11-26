# Pulse tools plan — Step 1: how things work today (read-only survey)

Branch `feature/pulse-tools`, from `origin/main` at 6ae1d3be (2026-10-29). Nothing in the code has been changed.

> **Blocked on one input:** `docs/PULSE_METRICS.xlsx` does not exist in the repo yet. The third part of Step 1 (a row-by-row mapping of the sheet to endpoints) is therefore **not done**. Part 3 below lists the likely page → endpoint map to make that mapping quick once the sheet arrives.
> The master prompt is saved as `docs/PULSE_MASTER_PROMPT_1.md`, not `PULSE_MASTER_PROMPT.md`. I used that file.

## 1. How Pulse works now

```
Pulse UI (src/ask/*)  →  POST /api/pulse  →  connector POST {CONNECTOR_URL}/chat  →  Claude tool loop  →  run_command  →  BigQuery / Supabase / GitHub
```

| Piece | File | What it does |
|---|---|---|
| UI | `src/ask/AskFridoPage.jsx`, `ChatThread.jsx`, `ChatComposer.jsx`, `HistoryPanel.jsx` | Chat screen. History is kept in browser storage per user. |
| Vercel route | `api/pulse.js` | Needs `callerToken` (Supabase session), checks the user is active, and allows only the two owners or users with the `ask` permission. It then forwards **only `{messages}`** to the connector with `x-api-key`. **The user's identity is not passed on.** |
| Connector | `frido-data-connector/server.js` | Own Node service (Dockerfile, port 8080). Endpoints: `/health`, `/mcp` (MCP tool `run_command`), `/chat` (used by Pulse). |
| Model | `server.js` `/chat` | `claude-opus-4-7` (adaptive thinking) if the question matches a "complex" regex (compare, trend, why, inventory, plan, oos…), otherwise `claude-sonnet-4-6`. Up to 12 tool turns. The first turn is forced to use the tool. $300/month budget (`lib/costTracker.js`). |
| Tool | `run_command` (`target` = bigquery / supabase / repo) | **Free-form SQL** written by the model. Checked by `lib/safety.js` (SELECT-only, allowed tables) and `lib/authz.js` (role table in `config/access.json`). |
| Knowledge | `frido-data-connector/knowledge/CLAUDE.md` (632 lines) | Read from disk **once at server start** and sent as the system prompt on every call, plus today's IST date. Holds the formulas and SQL templates. `tables.json` and `repo-scope.json` list allowed tables and repo paths. |
| Repo reads | `lib/repo.js` | Reads files live from GitHub (`GITHUB_REPO` / `GITHUB_BRANCH`), restricted to `repo-scope.json`. CLAUDE.md tells the model to read `api/_bq.js` first. |

**Database logins**
- **BigQuery:** `lib/bigquery.js` uses the service account `for-quickcomm-automation@frido-429506` (via `GCP_SA_KEY_FILE` or `GCP_SA_KEY`). Capped at 5 GB billed per query. **The code does not make it read-only**; that depends on the IAM roles on the service account, which I haven't checked. The dashboard's `api/_bq.js` very likely uses the same account.
- **Supabase:** `lib/supabase.js` uses `SUPABASE_DB_URL` and wraps each query in `BEGIN READ ONLY` with a 30 s timeout. That is read-only at the transaction level. Whether the role itself is read-only is unknown (Step 4 requires this).

**Things to fix in Step 4**
1. **Connector auth is open by default.** `lib/auth.js` returns a `founder` dev user unless `AUTH_ENABLED=true`. With the key path, every caller becomes `connector@myfrido.com` with role `analyst`, so per-user access is **not enforced today**. Every Pulse user gets the same rights.
2. `/chat` sets CORS `Access-Control-Allow-Origin: *`.
3. The Dockerfile does `COPY sa_key.json` into the image. The key is baked into the image, so the image must stay private.
4. `frido-data-connector/` is **untracked in git** in this checkout. It isn't part of the repo history, so changes to it can't go into a PR until it is added. (`.env` and `sa_key*.json` are gitignored and stay out.)
5. Formulas live twice: in the dashboard code and as copied text in CLAUDE.md. This is the source of the RTO mismatch (4.7% vs 8.2%).

## 2. Dashboard endpoints that return numbers

All are Vercel functions in `api/`, called by the frontend with `POST {start, end, …filters}`.

| Page | Endpoint → file | Inputs | Output (summary) | Used by |
|---|---|---|---|---|
| **Overview** | Assembled in the browser from `/api/bq` (sales), `/api/logistics`, `/api/customer`, `/api/returns`, `/api/cat-daily`, `/api/financial-mis` | start, end | KPI tiles and charts | `src/overview/*`, `App.jsx` |
| **Sales** (per channel) | `api/bq.js` default handler (5,236 lines; helper `buildQuery` in `api/_bq.js`) | start, end, category, subCategory, sku, subChannel, channel, voucher, region, tier, state, city, country, paymentType, channelGroup, phase | gross, net, orders, units, returns, CIR, cancellations, daily SKU, sub-channel, city/state | `App.jsx` Sales pages |
| Sales – daily category | `api/cat-daily.js` | start, end, channel | category-by-day sales | `App.jsx:7272` |
| Sales – Financial MIS | `api/financial-mis.js` | start, end | per-channel financial table | `App.jsx`, tab `sales:financial-mis` |
| **Return Analysis** | `api/return-analysis.js` (+ `_returnComponents.js`) | start, end, category, subCategory, subChannel, paymentType | return % by SKU / category / reason | `src/sales/returnAnalysisData.js` |
| Returns (overview) | `api/returns.js` | start, end | returns summary | `App.jsx:826` |
| **Ads** | `api/bq.js` with `{adsMonthly:true, from, to}` plus static `public/ads-data.json` | from, to | monthly spend / ROAS by channel | `src/ads/useAdsMonthly.js` |
| **P&L** | `api/cogs-monthly.js`, `api/cogs-context.js`, `api/_store_pnl.js`, `api/_sndRates.js`, and sales from `api/bq.js` | month / dates, channel | COGS, CM1, marketing % (assembled in `src/pnl/PnLPage.jsx`) | `src/pnl/*` |
| **Inventory Health** | Static `public/inv-data-{7,15,30}d.json` (hourly cron), fallback `api/inventory.js` (Supabase) with maths in `_inventory_shared.js` | filters applied client-side | stock, DOI, avg daily sale, dead stock | `src/InventoryPage.jsx` |
| Inventory – Sales allocation | `api/sales-allocation.js` (static `sales-alloc-data.json`) | filters | sales by warehouse / category | `InventoryPage.jsx:422` |
| Inventory – Inward | `api/inward.js` (static `inward-data.json`) | start, end, category, facility, vendor, sku | inward quantities | `InventoryPage.jsx:423` |
| **Out-of-stock loss** | `api/inventory-oos.js` + `api/data/inventory_oos.sql` | `{}` (fixed 180-day window) | OOS SKUs, days out, avg daily sale, ASP, lost sales | `src/inventory/OosLossView.jsx` |
| **Logistics Performance** | `api/logistics.js` (~28 CTEs over the Clickpost table) | start, end, courier, shipmentType, sddNdd, paymentMode, pickupState, dropState, dropCity, category, subCategory, weightSlabs | RTO %, delivery rate, TAT, stuck, NDR, by courier / zone | `App.jsx` `LogisticsPage` |
| Logistics – courier allocation | `api/courier-allocation.js` | days | courier performance and cost by lane | `CourierAllocationPage.jsx` |
| **Logistics Cost** | `api/logistics-cost.js` (2,279 lines, own Postgres pool) | filters (see `cacheKey`) | cost per shipment, cost by courier / type | `LogisticsCostPage.jsx` |
| **Customers** | `api/customer.js` | start, end | new vs repeat, retention, CAC, cross-sell | `App.jsx` Customer pages |
| Customer Support | `api/customer-support.js` | grain, start, end | tickets by period | `CustomerSupportPage.jsx` |

Not numbers (ignore for Pulse): `admin.js`, `auth-admin.js`, `packaging-products.js`, `_db.js`.

**Gaps and notes for Step 2/4**
- Overview, P&L and Ads are assembled in the browser from several endpoints. The numbers a user sees are not always one endpoint's output. A tool that calls "the page's function" may need that browser logic moved to a shared server function.
- Sales and Inventory have static-file paths (`inv-data*.json`, `*-alloc-data.json`) that can be up to an hour old. Tools must say which one they used.
- Dashboard page permissions are keys in `src/permissionTree.js`: `overview`, `sales:<channel>`, `ads:<channel>`, `pnl:<channel>`, `sales:financial-mis`, `logistics`, `logistics:cost:*`, `inventory`, `inventory:detail`, `inventory:sales`, `customer`, `customer:support`, `documents`, `ask`. The `/api/*` endpoints themselves are **not** permission-checked in the files I read (the permission checks are in the UI). Step 4's "tool checks the user can open that page" needs a server-side check built from `user_permissions`.

## 3. `PULSE_METRICS.xlsx` row-by-row mapping

**Not done: the file is missing.** Once it is in `docs/`, I'll map each row (column F page) to the endpoint in Part 2 and add the table here. Likely targets for the known metrics:

| Metric | Page | Endpoint |
|---|---|---|
| Gross / Net revenue, orders, units, AOV, ASP, CIR, cancellation % | Sales | `api/bq.js` |
| RTO %, delivery rate, stuck, TAT, NDR | Logistics → Performance | `api/logistics.js` |
| Return % by SKU / category | Sales → Return Analysis | `api/return-analysis.js` |
| Total inventory, DOI, avg daily sale | Inventory Health | `inv-data*.json` / `api/inventory.js` |
| OOS loss, avg daily sale (OOS method) | Inventory → OOS loss | `api/inventory-oos.js` |
| Logistics cost | Logistics → Cost | `api/logistics-cost.js` |
| Ads spend / ROAS | Ads | `api/bq.js` (`adsMonthly`) |
| CM1, COGS | P&L | `api/cogs-monthly.js` + sales |
| CAC, new vs repeat | Customers | `api/customer.js` |

## Added requirements for Step 3 (CLAUDE.md rules) — from Suraj, 2026-10-29

These go into the connector's `knowledge/CLAUDE.md` in Step 3 (diff shown before saving). Not applied yet; Step 3 starts on Suraj's "go".

1. **Denials:** if a tool or file read is denied, never retry the same thing. After 1 denial, switch route: use the locked templates or other allowed tables, and if needed build the answer with own logic.
2. **Custom calculations:** any answer built with own logic says so on the first line: `Custom calculation, not from the dashboard:` plus the definition used in one line (e.g. "critical = lowest days of inventory, Regular warehouses, avg sale over the last 30 days").
3. **No bare failures:** never end with only "the data query failed". If it truly can't answer, say in one line what was tried and what is missing.
4. **Denial cap:** max 2 denials per question, then answer with what it has.
5. **Acceptance test:** "Top 10 products which are critical based on inventory" must return a labelled top-10 table now (custom-calculation label), and the dashboard-matching version once the `inventory` tool exists (Step 4). Add it to the Step 6 scoring set.

Note: the connector already caps tool turns at 12 and forces the first turn to call a tool (`server.js`), and its final fallback returns "No answer could be generated — the data query failed". Item 3 means that fallback text in `server.js` must change too, not only CLAUDE.md.
