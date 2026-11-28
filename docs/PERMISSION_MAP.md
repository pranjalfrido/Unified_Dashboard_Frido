# Page permissions on the server

Generated from `api/_permissionMap.js` by `node scripts/security/gen-permission-map.mjs`. Edit the map, then regenerate. `middleware.js` applies it after the token and active-user checks.

- A person passes with **any one** listed key. **Admins pass everything.** `sales*` means the key `sales` or any `sales:...` key.
- `any` = any permission at all (data every screen loads, filtered per person in the browser). `self` = the route checks the caller itself. `admin` = admins only.
- A route or file that is not in this table is **admin only** (new things start closed).
- Unchanged and checked before this map: cron / scheduler secret, `x-navai-secret` (NavAI applies the asking person's own access), GitHub Actions precompute (cron secret), `auth-admin`, `pulse`.
- `PERMISSION_ENFORCE`: `log` (default) never blocks and records would-be denials (Vercel log line + `/api/permission-denials`, admin only); `enforce` answers 403 `{"error":"No access to this data"}`.

## API routes

| Route | Allowed keys | Used by |
|---|---|---|
| `/api/bq` | `overview`, `sales*`, `ads*`, `pnl*` | Overview, Sales, Ads, P&L (main BigQuery fan-out, all phases) |
| `/api/logistics` | `overview`, `logistics` | Overview logistics tile, Logistics > Performance |
| `/api/returns` | `logistics` | Logistics > Performance returns block |
| `/api/logistics-cost` | `logistics:cost*` | Cost Analytics (read + CSV export). fileClaim / updateClaim / invalidate: admin only (see ACTION_RULES) |
| `/api/courier-allocation` | `logistics:cost*` | Courier allocation, opened from Cost Analytics |
| `/api/inventory` | `inventory*` | Inventory Health (live fallback when inv-data.json is stale) |
| `/api/inventory-oos` | `inventory*` | Inventory > OOS loss |
| `/api/inward` | `inventory*` | Inventory > Inward (also checks inventory:inward itself) |
| `/api/sales-allocation` | `inventory*` | Inventory > Sales & Allocation |
| `/api/cogs-monthly` | `pnl*`, `inventory*` | P&L (COGS) and Inventory cost / inward |
| `/api/cogs-context` | `documents*` | Documents > COGS ledger |
| `/api/packaging-products` | `documents*` | Documents > Packaging BOM |
| `/api/cat-daily` | `sales*`, `pnl*`, `ads*` | Category / SKU daily expand in Sales, P&L, Ads tables |
| `/api/customer` | `overview`, `customer` | Overview customer tile, Customer Intelligence |
| `/api/customer-support` | `customer:support` | Customer Support |
| `/api/return-analysis` | `overview`, `sales*` | Overview, Sales > return analysis |
| `/api/email-controls` | `admin` | Scheduler pause / resume (also checks admin itself) |
| `/api/permission-denials` | `admin` | Would-be denial log (also checks admin itself) |
| `/api/feedback` | `self` | Checks the caller itself |
| `/api/presence` | `self` | Checks the caller itself (list is admin only) |
| `/api/pulse` | `self` | NavAI: asked person's own permissions are applied inside (api/pulse.js) |
| `/api/auth-admin` | `self` | Checks the caller itself (open to the login wall by design) |

### Actions decided by the request body

| Route | Action | Allowed keys |
|---|---|---|
| `/api/logistics-cost` | `fileClaim` | `admin` |
| `/api/logistics-cost` | `updateClaim` | `admin` |
| `/api/logistics-cost` | `invalidate` | `admin` |

There is no separate "manage" key in the permission tree for Cost Analytics, and the app never calls these three actions from the browser, so they are admin only.

## Files in public/

| File | Allowed keys | Used by |
|---|---|---|
| `^/pnl-data(-lastmonth)?\.json$` | `overview`, `sales*`, `pnl*`, `ads*` | Static copy of the Sales/P&L query: Overview, Sales, P&L, Ads read it before calling /api/bq |
| `/ads-data.json` | `overview`, `ads*` | Ads cache |
| `/alerts-data.json` | `any` | Alerts bell: every screen loads it, filtered per person in the browser |
| `/alerts-phase2.json` | `any` | Alerts bell (phase 2), filtered per person in the browser |
| `/cogs-data.json` | `pnl*`, `inventory*` | COGS cache for P&L and Inventory cost |
| `/snd-rates.json` | `pnl*` | P&L shipping-and-delivery rates |
| `/flipkart-snd-ratecard.json` | `pnl*` | P&L Flipkart rate card |
| `/india-states.json` | `any` | Map outlines (no business data) |
| `/india-districts-full.json` | `any` | Map outlines (no business data) |
| `/inv-data-7d.json` | `overview`, `inventory*` | Overview inventory tile, Inventory |
| `^/inv-data(-\d+d)?\.json$` | `inventory*` | Inventory Health snapshots |
| `/inward-data.json` | `inventory*` | Inventory > Inward |
| `/logistics-cost-data.json` | `logistics:cost*` | Cost Analytics cache |
| `/logistics-data.json` | `overview`, `logistics` | Logistics cache (Overview tile + Performance) |
| `^/logistics-data-[a-z-]+\.json$` | `logistics` | Logistics > Performance forward / reverse / COD / prepaid cuts |
| `/sales-alloc-data.json` | `overview`, `inventory*` | Overview tile, Inventory > Sales & Allocation |
| `^/purchase-parser-(domestic|import|packaging)\.html$` | `documents*` | Documents > Purchase Ledger parser pages (loaded with the login token) |
| `/subcat-first-order.json` | `admin` | Server-side input of api/bq.js |
| `/vc-event-calendar.json` | `admin` | Server-side input of api/bq.js |
| `/vc-margin-rates.json` | `admin` | Server-side input of api/bq.js |

Any other file that needs a login (`.json`, `.bak`, `.csv`, ... see `middleware.js` `needsLogin`) is admin only.
