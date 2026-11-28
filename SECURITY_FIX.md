# Security fix: login required for data files and /api

Branch `fix/security-auth`, stacked on `fix/staged-loading`.

## The problem (found 31 Oct 2026)

Anyone with the URL could read the dashboard's data without logging in:
* **Static data files.** Every `.json` file in `public/` (pnl-data*.json, ads-data.json, inv-data*.json, logistics*.json, sales-alloc-data.json, cogs-data.json, snd-rates.json, vc-margin-rates.json, inward-data.json, …) was served straight from Vercel's CDN. The login only decided what the screens showed.
* **API routes.** Every `/api` route except `pulse` and `auth-admin` answered without a login, including:
  * `/api/bq`: all sales, P&L and ads data. Each call runs ~300 BigQuery queries.
  * `/api/admin`: `wipe`, `delete-range`, `vacuum`, `sync`.
  * `/api/logistics-cost`: `fileClaim` / `updateClaim` (writes), `rawExport` (invoice rows).

The per-endpoint findings are in `WORK_STATUS.md` (Step 2), in the main project folder.

## The fix

### `middleware.js` (new, repo root)
Vercel Routing Middleware runs before the CDN and the functions.

* **What is protected (`config.matcher`):**
  * every `/api/*` route, except `/api/auth-admin` and `/api/pulse`
  * every `*.json` file
* **Exceptions:**
  * `auth-admin` and `pulse` already check the caller's token in the request body. `auth-admin`'s `account_lookup` ("forgot password") has to work before login.
  * The app shell, JS/CSS assets, images and `manifest.webmanifest` are not data, so the login screen and the installed app still load.
* **A request passes when it has either:**
  * a valid Supabase access token: `Authorization: Bearer <token>`.
    * ES256 tokens are verified in the middleware against the project's published keys (`/auth/v1/.well-known/jwks.json`, cached for 10 minutes and re-fetched when an unknown key id appears). This needs no network call per request.
    * The token must be unexpired, issued by this project (`iss = <SUPABASE_PROJECT_URL>/auth/v1`), and for audience and role `authenticated`.
    * HS256 tokens (only possible while the legacy key is still in use) are checked with Supabase `/auth/v1/user` and cached until they expire.
  * or the scheduled-caller secret: `x-cron-secret: <CRON_SECRET>`, or `Authorization: Bearer <CRON_SECRET>`, which is what Vercel cron sends. This only works when `CRON_SECRET` is set and at least 16 characters long, and it is compared in constant time.
* **Everything else** gets `401 {"error":"Login required"}` with `Cache-Control: no-store`.
* **Preflights.** `OPTIONS` requests pass (they carry no credentials and the handlers return no data for them).
* **Env vars it reads (already set on Vercel):** `SUPABASE_PROJECT_URL` (falls back to `VITE_SUPABASE_URL`), `VITE_SUPABASE_ANON_KEY` (for the HS256 fallback), and `CRON_SECRET` (optional).

### `src/authFetch.js` (new)
One shared helper for every data request. Every `/api` and data-file `fetch(...)` in the frontend now uses it: 45 call sites in 14 files.

* **Adds the token.** It attaches `Authorization: Bearer <access token>`.
* **Token refresh.** `supabase.auth.getSession()` refreshes an expired token first (a laptop waking from sleep, the installed app resumed after hours). If the token still expires in between, the 401 triggers one `refreshSession()` and one retry.
* **Not switched:** Supabase REST calls (Logistics ledger), the Teams webhook, `/api/auth-admin`, `/api/pulse` and the PWA online probe keep plain `fetch`.

### `vercel.json`
The data-file `Cache-Control` changed from `public, max-age=0, must-revalidate` to `private, …`, so no shared cache keeps a copy of a login-only file.

### `scripts/security/check-middleware.mjs` (new)
A unit test of the token check. It uses a locally generated ES256 key and no real tokens, and covers:
* valid, expired, wrong issuer, wrong role, wrong audience
* signed by another key, payload edited, unknown key id, `alg: none`
* the HS256 fallback
* the path rules and the middleware's pass / 401 / preflight behaviour

Run it with `node scripts/security/check-middleware.mjs`.

## Callers

| Caller | Calls the Vercel URL? | Handling |
|---|---|---|
| Browser / installed app (logged in) | yes | `authFetch` sends the token |
| Login page: `auth-admin` `account_lookup` | yes | left open on purpose (no session yet) |
| Profile page: `auth-admin` | yes | its own `callerToken` check (unchanged) |
| Pulse: `/api/pulse` | yes | its own `callerToken` check (unchanged) |
| GitHub Action `precompute-inventory.yml` (hourly, fired by cron-job.org via `workflow_dispatch`) | **no**: runs `scripts/generate-*.mjs`, which import the handlers directly | nothing to change |
| GitHub Action `precompute-flipkart-snd.yml` | no | nothing to change |
| cron-job.org | **no**: it calls GitHub's API to start the workflow, not Vercel | nothing to change |
| Vercel cron | none configured | would use `CRON_SECRET` |
| `scripts/responsive/measure-prev-cost.mjs` (manual, local) | posts to an API URL | against a protected deployment it needs a token, or `x-cron-secret` |
| `frido-data-connector` (Pulse backend) | no: its own BigQuery access | nothing to change |

## Verification (local, 31 Oct 2026)

Vercel previews are behind Vercel's own login (SSO), so curl can't reach them. A local harness ran `middleware.js` in front of the built `dist/` and the branch's API handlers, the way Vercel does.

* **No token: 401 everywhere.**
  * All 27 data files in `dist/`.
  * All 17 data endpoints, on both POST and GET.
  * Forged tokens: garbage, wrong issuer, right claims with a bad signature, the anon key used as a token.
* **Still open:**
  * `/api/auth-admin` `account_lookup` → 200.
  * The app shell, manifest and icons → 200.
  * `/api/pulse` → 401 from its own check.
* **Cron secret:** the right secret → 200, a wrong one → 401.
* **Logged-out browser** (1440 px and 390 px): the login screen shows, with no failed requests and no page errors.
* **Parity, old path vs new path, back to back** (no middleware vs middleware):
  * `/api/bq` for Sep 2026, and for Sep 2026 with category = Cushions: 0 differences in 102 top-level keys.
  * `pnl-data.json`, `pnl-data-lastmonth.json`, `ads-data.json` and `snd-rates.json` are byte-identical.
* **Unit test:** `scripts/security/check-middleware.mjs`, 24 / 24 pass.
* **Not verified here: a logged-in browser session.** Refreshing the saved Playwright login failed (expired), and minting a session with the service key was refused by the session's safety rules. See "Before merging".

## Before merging (manual)

1. **Open the preview while logged in.** Use the branch's Vercel preview (Vercel will ask you to log in to Vercel first), then log in to the dashboard. Check that these load with numbers:
   * Overview, Sales, P&L, Ads, Inventory, Logistics, Customers, the COGS page
   * the India map on Overview
   * in DevTools → Network: no 401s
2. **Check one data file logged out.** Open `<preview>/pnl-data.json` in a private window. You should get `{"error":"Login required"}` (after Vercel's own SSO screen).
3. **Optional:** set `CRON_SECRET` (≥ 16 random characters) in Vercel → Settings → Environment Variables. You only need it when a scheduled caller is added (e.g. the Monthly Trend job).
4. **After merging to production:**
   * Check https://frido-navigator.vercel.app/pnl-data.json in a private window: it should return 401.
   * Copies downloaded before the fix can't be recalled.

## Follow-ups (not in this branch)

* **Deactivated users.** A deactivated user's token stays valid until it expires (≤ 1 h). `pulse` checks `is_active`; the middleware doesn't (that would mean a Supabase read per request).
* **Email enumeration.** `auth-admin` `account_lookup` still returns the name and active flag for any email.
* **Admin actions.** `/api/admin`'s destructive actions are now behind login, but any logged-in user can call them. They should be admin-only, or removed (the `orders` table is empty).
* **Logistics claims.** `/api/logistics-cost` `fileClaim` / `updateClaim` are behind login but have no role check.

## Batch 1 (from docs/DASHBOARD_SECURITY_AUDIT.md), branch `fix/security-batch1`

* **Files in `public/`**: `middleware.js` now matches every path except `/assets/` and asks for a login on anything in `public/` that is not a known public asset (images, fonts, css, `manifest.webmanifest`, `sw.js`, `xlsx-worker.js`, `offline.html`, `robots.txt`). `.bak`, `.csv`, `.xlsx`, `.txt`, `.html` and any new file are private by default. `logistics-cost-data.json.bak` removed. The Purchase Ledger parser pages are now fetched with the login token and shown in the iframe as its content.
* **Revoked users**: after the token check, middleware reads the user's own `user_profiles.is_active` (as the user, anon key), cached 60 s. Not active or no profile: `401 {"error":"Access revoked"}`. Supabase unreachable: 503 (not cached). NavAI secret, cron secret and Vercel cron are checked before this and are unchanged.
* **`api/admin.js` deleted** (unused).
* **`api/email-controls`**: GET and POST need a token whose user is an active admin (`api/_auth.js`, same rule as auth-admin).
* **`account_lookup`**: same reply for every email, 5 per minute per IP (per function instance). Set `TEAMS_RESET_WEBHOOK_URL` on Vercel to post the reset card from the server; without it the browser posts a card with the email only.
* **Passwords**: one rule (8+, lower, upper, digit, symbol) in `src/passwordRules.js`, used by Change / Create / Reset forms and by auth-admin. Change password sends `current_password` to Supabase too.
* **Weak existing passwords**: needs `docs/sql/security-batch1.sql` (two columns on `user_profiles`). Login flags the profile when Supabase returns `weakPassword`; the app shows "Please set a stronger password" (3 reminders, then required); admins see "Weak password" in the Users list.
* Tests: `node scripts/security/check-middleware.mjs`, `node scripts/security/check-batch1.mjs`, `node scripts/test-navai-access.mjs`.
