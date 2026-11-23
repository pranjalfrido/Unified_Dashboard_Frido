# NavAI access, permissions and knowledge sync: report

Written for: Suraj (owner of the dashboard and the NavAI connector).
Date: 23 Nov 2026. Nothing here is pushed, merged or deployed. All work is committed locally on two branches.

| Repo | Branch | Commits |
|---|---|---|
| Dashboard | `fix/navai-api-access` (from origin/main a2803a6f) | 6b97620d, e7fcf68d + this report |
| Dashboard | `docs/navai-sync-rule` (from origin/main) | 8e5b2059 (rule added to CLAUDE.md) |
| Connector | `feature/pulse-tools` (on top of 333d7db3) | be161a59, 842998d4, 47d67c2c |

## 1. Cloud Run log check (read-only, `frido-data-connector`, revision 00065-sop)

| Window | `dashboard_api` calls logged | Result |
|---|---|---|
| Last 7 days | 4 | **4 of 4 returned 401** ("Login required"): 18 Nov (1), 21 Nov (1), 23 Nov (2) |
| Last 30 days (logs start 29 Oct) | 100 | **8 returned 401** (first logged 8 Nov, last 23 Nov 12:29 UTC); 92 other errors, all 29-31 Oct (before the login wall); **0 successes** |
| `pnl` tool, last 30 days | 23 | 23 errors, all on 29 Oct |

Calls hit `/api/inward`, `/api/inward-data`, `/logistics-data-forward.json`, `/logistics-cost-data.json`. The login wall was merged on 3 Nov; nobody used `dashboard_api` between 31 Oct and 8 Nov, so the first 401 in the logs is 8 Nov. Anonymous requests to the live site also return 401 today (checked with one `curl` each on `/api/bq` and `/inward-data.json`). NavAI's `dashboard_api` and `pnl` tools therefore cannot read the dashboard until the secret below is in place. Its custom-SQL tool is unaffected (it reads BigQuery directly).

## 2. What the fix does

**Dashboard (`fix/navai-api-access`)**
- `middleware.js`: a request with header `x-navai-secret` equal to env `NAVAI_API_SECRET` (min. 32 characters, constant-time compare) passes the login wall **only** for `POST` on this allowlist: `bq, logistics, inventory, inventory-oos, sales-allocation, return-analysis, returns, customer, customer-support, cogs-monthly, cat-daily, courier-allocation, inward`; and `GET` on `.json` data files. The Ads data lives in `bq` and `ads-data.json`.
- Everything else is refused with 401: `feedback, presence, admin, auth-admin (handler needs a user token), pulse (same), packaging-products, cogs-context, logistics-cost`, any unknown route, and every GET/PUT/PATCH/DELETE/HEAD on an api route and every non-GET on a `.json`.
- **`logistics-cost` is deliberately not on the list:** its POST body can file or update claims and invalidate caches, and middleware cannot see the body. NavAI reads that page from `logistics-cost-data.json`.
- `api/inward.js`: the secret is accepted as a read-only, non-admin caller (no Data quality, no `dq_export`). Without this, `/api/inward` also needs a user session, so NavAI could never read it.
- `api/pulse.js`: reads the asking user's `is_admin` and `user_permissions` tabs from the database (never from the request) and sends them to the connector as `access`. **Before this change pulse.js sent only the messages**, so NavAI applied no per-page permissions to anyone.

**Connector (`feature/pulse-tools`)**
- Sends `x-navai-secret` (from env `NAVAI_API_SECRET`) on every dashboard call, including the P&L tool's page fetches.
- `lib/pageAccess.js`: every data tool checks the asking user's tabs. `dashboard_api` per endpoint (and the Ads / P&L parts of `bq`), the `pnl` tool per channel tab, the OOS tool, and **custom SQL is admins only** (decision: SQL cannot be tied to one page; set `NAVAI_SQL_NON_ADMIN=allow` on the service to loosen it). A `/chat` call without `access` gets no pages (fail closed). `financial-mis` and the live `logistics-cost` endpoint are removed from NavAI.
- `scripts/pulse-ask.mjs` can send an access object (`PULSE_ASK_ACCESS`) so you can test as admin or as a limited user.

## 3. Tests

| | Test | Result |
|---|---|---|
| (a) | A normal login (ES256 token signed by a throwaway key, JWKS served locally) passes every api route and the data files; an expired token and a token signed by another key are refused | pass |
| (b) | No login and no secret: `/api/bq`, `inward`, `inventory`, `logistics`, `customer`, `return-analysis`, `feedback` and the `.json` files return 401 | pass |
| (c) | The secret opens exactly the 13 allowlisted endpoints (POST) and the `.json` files (GET) | pass |
| (d) | The secret is refused on feedback, presence, admin, packaging-products, cogs-context, logistics-cost, every non-allowlisted route in `api/`, an unknown route, GET/PUT/PATCH/DELETE/HEAD on `bq`, PUT/PATCH/DELETE on feedback, non-GET on `.json`; wrong/truncated/empty secret refused; the secret is not accepted as a Bearer token or as the cron header; auth-admin and pulse handlers refuse it | pass |
| (e) | `api/pulse.js` forwards the database's tabs and ignores a forged `access` in the request; in the connector, for **each** of the 25 NavAI endpoints: no tabs = refused, only that page's tab = allowed, only another page's tab = refused, admin = allowed; custom SQL refused for non-admins | pass |

Run: `node scripts/test-navai-access.mjs` in the dashboard (93 checks) and `node scripts/test-page-access.mjs` in `frido-data-connector` (125 checks). Both generate throwaway secrets in memory and print none.
Limit: (a) proves the middleware logic with a local key; I did not log in to the live site (no token available to me).

## 4. Audit: what NavAI was missing (revision 00065 was built 30 Oct)

| Change on main | Affects NavAI? | What was outdated | Fixed? |
|---|---|---|---|
| Login wall (3 Nov) | **Yes, critical** | NavAI sent no credentials, so every dashboard call is 401 | Yes: secret header + middleware allowlist |
| `api/pulse.js` sent no user access | **Yes** | No per-page permissions in NavAI | Yes: forwarded + enforced |
| P&L reductions (`api/_pnlAgg.js`, `bq` phases, 3-4 Nov) | Yes | P&L bundle built from 28 Oct main (6fa77412) | Yes: rebuilt from a2803a6f (build script now also archives `_pnlAgg.js`, `_resolvedAgg.js`); numbers identical to the page, see section 5 |
| `bq` staged loading (`phase`) | Yes | Map did not say a no-phase call returns the full payload | Yes: documented |
| Return Analysis: each cancelled order counted once (26 Oct) | Wording | Not in the knowledge | Yes |
| Logistics 5a: "All" months totals (26 Oct) | Wording | Not in the knowledge | Yes |
| Logistics zone error | Yes | Map said `/api/logistics` is broken permanently; it fails only about 09:00-10:25 IST daily | Yes |
| Ads "Unattributed" row (27 Oct); one CAC definition | Wording | Not in the knowledge | Yes |
| Inventory window ends on the last complete day (4 Nov); sales-allocation anchor (4 Nov) | Yes | Metrics said "latest sales date" | Yes |
| Avg Sale: all B2C per SKU (23 Nov) | Yes | Metrics/map described the old per-warehouse sum | Yes, incl. the two caveats: live `/api/inventory` still old; per-SKU ceil rounding awaits `fix/inventory-avg-sale` |
| Inward page (8-23 Nov) | **Yes** | Map described the retired GRN report ("quantities are 0"); `/api/inward` needs a user session | Yes: new Group 3b, access path, playbook row, 11 test questions |
| Financial MIS removed (30 Oct) | Yes | Still listed as an endpoint | Yes: removed |
| Flipkart SnD rate card CI (10 Nov) | Indirect | P&L bundle reads `/snd-rates.json` (behind the wall) | Covered by the secret on `.json` GET |
| Alerts bell files (`alerts-data.json`, `alerts-phase2.json`) | Gap | NavAI cannot read them | Not added (not requested; say if you want it) |
| Feedback, live users, PWA, mobile layouts, BQ concurrency | No | | n/a |
| Overview YTD fast/slow split (#60) | No (same response fields) | | n/a |

Also changed: `knowledge/repo-scope.json` (adds `api/_inward_core.js`, `_pnlAgg.js`, `_resolvedAgg.js`, `_bqPhases.js`; `api/inward.js` was already there), `docs/PULSE_METRICS.md` and `PULSE_PLAYBOOK.md` (avg sale, access rule, Inward row; copied to `knowledge/` by `npm run sync-knowledge`, which I ran), `docs/pulse_test_set.csv` (20 new questions, ids 69-88; Inward answers say "fill from live page after merge"). The permanent rule is on `docs/navai-sync-rule`.

## 5. NavAI vs the page logic, run locally on main (a2803a6f), 1-31 Oct 2026 unless stated

The live site cannot be called without a login, so both sides run on the same payload that the dashboard's own handlers produce from BigQuery today: "page" = the page's own component/tile formula; "NavAI" = the connector's tool code (rebuilt P&L bundle, `dashboard_api` answers with their formatting).

| Question | Page | NavAI | Match |
|---|---|---|---|
| D2C CM1 % | 38.81% | 38.81% | yes |
| D2C COGS % of net | 41.92% (test set says live page showed 41.9% on 3 Nov) | 41.92% | yes |
| D2C SnD % | 19.28% | 19.28% | yes |
| D2C net / gross revenue | Rs 24.32 Cr / Rs 33.90 Cr | same | yes |
| Amazon CM1 / COGS / SnD % | 27.03 / 42.92 / 30.05 | same | yes |
| D2C cancellations (Return Analysis) | 5.06%, Rs 1.71 Cr | 5.1% (raw 5.0572), Rs 1.71 Cr | yes |
| RTO % (Logistics, forward) | 18,749 / 2,28,008 = 8.22% | same inputs; NavAI computes the % (the map says how) | yes |
| Ads CAC (Customer page) | Rs 690.06 (spend Rs 7.84 Cr / 1,13,646 new customers) | Rs 690.06 | yes |

"Last month" is Oct 2026. Not compared: the formatted `pnl` tool text (it also queries Supabase for the COGS month note, which needs the connector's own database URL).

## 6. Steps for you (nothing below is run by me; never paste the value into chat, a file or a commit)

1. **Create the secret in Secret Manager** (from any shell; the value is generated and piped, never shown):
   `openssl rand -hex 32 | tr -d '\n' | gcloud secrets create navai-api-secret --project frido-429506 --replication-policy=automatic --data-file=-`
2. **Let the connector read it** (runtime account as in `docs/PULSE_DEPLOY_STEPS.md`):
   `gcloud secrets add-iam-policy-binding navai-api-secret --project frido-429506 --member="serviceAccount:1012773678578-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"`
3. **Put the same value in Vercel** (piped from Secret Manager, not displayed), Production (add Preview only if you test on previews):
   `gcloud secrets versions access latest --secret=navai-api-secret --project frido-429506 | vercel env add NAVAI_API_SECRET production --sensitive`
4. **Deploy the dashboard branch first** (open the PR from `fix/navai-api-access`, merge when you are happy). Until it is live the secret is ignored and NavAI still gets 401.
5. **Canary the connector** from `feature/pulse-tools`, no traffic, `--update-*` flags only:
   `gcloud run deploy frido-data-connector --source frido-data-connector --project frido-429506 --region asia-south1 --no-traffic --tag canary --update-secrets NAVAI_API_SECRET=navai-api-secret:latest`
   Never use `--set-env-vars` or `--set-secrets`: they replace everything already set.
6. **Check answers against the page** through the canary URL with `scripts/pulse-ask.mjs` (key from `CONNECTOR_API_KEY`, never printed). Test as admin with `PULSE_ASK_ACCESS='{"isAdmin":true,"tabs":[]}'` and as a limited user with `PULSE_ASK_ACCESS='{"isAdmin":false,"tabs":["inventory:inward"]}'` (D2C P&L must be refused). Then go through the new questions 69-88 in `docs/pulse_test_set.csv` (fill the Inward expected answers from the live page).
7. **Only after your OK, shift traffic:** `gcloud run services update-traffic frido-data-connector --project frido-429506 --region asia-south1 --to-latest`. Rollback: `--to-revisions frido-data-connector-00065-sop=100`.
8. Also in the dashboard deploy: `pulse.js` now needs the Supabase service key it already uses; no new Vercel variable besides `NAVAI_API_SECRET`.

## 7. Safe choices I made without asking

- Custom SQL for non-admins is refused (can be loosened with `NAVAI_SQL_NON_ADMIN=allow`).
- `logistics-cost` (live) is not reachable by NavAI; it uses the file.
- A `/chat` call without access info is denied. Direct MCP callers (no `access`) keep their role-based access as before.
- Local only, not committed: `vite.local.config.js`, the `node_modules` links, `_cmp/`, `dev.log` (all in the worktrees' `.git/info/exclude`).
- Your main folder was not touched (4 uncommitted tracked files, 184 untracked, 615 commits behind). `C:/wt-inward` and its dev server on 5173 were not touched.
