# Feedback feature — build report

Branch `feat/feedback` (worktree `C:/wt-feedback`), local commits only: nothing pushed, nothing merged, nothing run on production Supabase.

## What's built

**Entry points (everyone signed in)**
- Laptop: "Feedback" button + ⋯ menu (What's new) at the right of the top header; "Feedback" at the bottom of the sidebar.
- Phone: "Send feedback" at the end of the header ⋯ menu (every page) and in the All pages launcher. The green header is unchanged.
- NavAI: "Report this answer" (👎 icon) under every answer, laptop and phone → same form, type *Wrong number*, the question and answer attached.

**Form** — type chips (Bug · Wrong number · Suggestion · New feature/page), one text box (required, 1,000 chars), optional screenshot (compressed in the browser to ≤1280 px JPEG), "This is urgent". A grey line shows what is captured: page, channel, sub-channel, date range, active filters, device, app version, time. Phone = bottom sheet, laptop = side panel. Toast: "Thanks! Suraj's team will look into it."

**Admin inbox** (admins only) — page "Feedback": laptop sidebar item "Inbox" with a red *new* count, phone launcher row with "n new". List (type icon, message, user, page, time, status, urgent flag), filters (status, type, page, user), newest first. Item view: full message, context, screenshot, NavAI question/answer, "Open this page with the same filters", status, reply, "Show in What's new". Done / Won't do need a reply (checked in the browser and on the server).

**Closing the loop** — Profile → "My feedback" (laptop and phone). Closing an item with a reply puts a notification in the existing bell / notifications sheet ("Your feedback was fixed" / "won't do"); opening the panel marks it read. "What's new": Done items with "Show in What's new", last 30 days (phone: launcher; laptop: ⋯ menu). It shows only the team's note and date, never who asked or what they wrote.

**Alerts** — e-mail straight away for every urgent item and every "Wrong number"; everything else in one summary at 7 pm IST (`vercel.json` cron `30 13 * * *` → `GET /api/feedback?action=digest`, protected by `CRON_SECRET`). Recipients: `FEEDBACK_ALERT_EMAILS` (default suraj.s@myfrido.com). Sent through Microsoft Graph like the other mailers. In local mode the e-mail is written to `.feedback-local/emails.log` instead.

**Safety** — all writes go through `api/feedback.js` with the service key; the user comes from the verified session only (a forged `user_id` is ignored); non-admin → 403 on list / get / update / digest; 20 items per user per rolling day (429 after); message length and type checked; control characters stripped; text is never interpreted as HTML (React text nodes, `esc()` in e-mail); screenshots must be real jpeg/png/webp (magic bytes) and ≤1.5 MB; context is size- and depth-limited.

## Files
- `api/feedback.js`, `api/_feedbackStore.js` (Supabase store + local store with the same methods), `scripts/feedback-local-server.mjs`
- `docs/sql/feedback.sql` — **not applied anywhere**
- `src/feedback/*` (form, provider, inbox, My feedback, What's new, nav pieces, local test login), small hooks in `src/App.jsx`, `MobilePageHeader`, `MobileBottomNav`, `navConfig`, `ChatThread`, `PulseMobile`, `ProfilePage`, `ProfileMobile`
- `vite.config.js` (adds `__APP_VERSION__` = first 8 chars of the Vercel commit), `vercel.json` (cron), `.gitignore`, `.env.example`
- `scripts/feedback-e2e.mjs` — the test run below

## Test results (local mode, test people only)
`node scripts/feedback-e2e.mjs` — 16 API checks + a 24-step UI run per device, 5 devices: laptop 1366, Chromium 375 / 360, WebKit 375 / 360.
- Laptop 40/40, Chromium 375 40/40, Chromium 360 40/40, WebKit 375 40/40. WebKit 360 passed 39/40 on the first run: the one miss was the script counting WebKit's CORS messages about *other* APIs that don't exist locally as page errors (script now ignores them; WebKit 360 not re-run, WebKit 375 was).
- Covered: every type from phone and laptop with and without screenshot; context captured (page, device kind, version, time); NavAI report with question + answer; inbox, type and status filters; Done blocked without a reply; Done with reply + What's new → user notification, My feedback reply, What's new; non-admin has no inbox (no sidebar item, no launcher row, `/feedback` redirects and renders nothing), 403 on every admin action, cannot see others' items.
- Build passes. No new lint errors (files I added are clean; `src/App.jsx` 370 problems before and after).
- Screenshots (not committed): `.feedback-local/shots-e2e/`.

## What you must do before it can go live
1. Run `docs/sql/feedback.sql` in the Supabase SQL editor (table, indexes, RLS read-only policies, private bucket `feedback-screenshots`, admin read policy on the bucket).
2. Vercel env: `SUPABASE_PROJECT_URL` and `SUPABASE_SECRET_KEY` (already used by `api/pulse.js`), `CRON_SECRET` (any long random string — Vercel then sends it with the cron), optional `FEEDBACK_ALERT_EMAILS`, and the mail credentials: `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` (or the existing `OTP_FRIDO_*` set) plus `ALERT_SENDER_EMAIL` (or the existing `REPORT_MAIL_FROM`). The Graph app needs permission to send as that mailbox, as for the connector.
3. Do **not** set `FEEDBACK_LOCAL` / `VITE_FEEDBACK_LOCAL` in Vercel. With them absent the local test login and local store are dead code.
4. Switch off local mode, deploy a preview, and test once with a real login and real Supabase (submit, screenshot, inbox as admin, reply, notification).

## Not done / worth knowing
- Real Supabase path (store, signed screenshot URLs, e-mail through Graph) is written but **not run** — no production access by design. Local mode returns the screenshot as a data URL; real mode returns a 10-minute signed URL; the field name and the rest of the behaviour are the same.
- "Open this page with the same filters" restores the page path, dates and the filters the Dashboard keeps (category, SKU, region, …). Filters held inside individual pages (for example a sub-tab's own search box) are not captured.
- The pasted spec asked for a 👎 "under every NavAI answer": it is a text button "Report this answer" with the thumbs-down icon, hidden on error replies on the laptop thread.
- Notifications are read at the first poll after login and then every 2 minutes (and when the tab is shown again), not instantly.
- The existing "alert mailer" lives only on the connector branch; this uses the same Microsoft Graph approach inside `api/_feedbackStore.js`.
- Local run: vite on http://localhost:5197 and the local API on :3017 (see below). The local store holds a few demo items (`node scripts/feedback-seed-demo.mjs` re-adds them; running the e2e script wipes the store).

## Run it locally
```
cd C:/wt-feedback
node scripts/feedback-local-server.mjs          # API on :3017, LOCAL mode (file store in .feedback-local/)
npx vite --port 5197 --strictPort               # app on http://localhost:5197 (uses .env.local, git-ignored)
```
`.env.local` (not committed): `VITE_FEEDBACK_LOCAL=1`, `VITE_API_URL=http://localhost:3017`, dummy Supabase URL/key.
Open http://localhost:5197 and pick a test person (Test Admin / Asha Verma / Rohan Mehta), or go straight to `/overview?as=admin`, `?as=asha`, `?as=rohan`. Data pages (Sales, Inventory …) are empty/erroring in this mode because only the feedback API runs locally; the Overview shows cached data.
