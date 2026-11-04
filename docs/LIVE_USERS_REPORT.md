# Live users (admins only): report

Branch `feat/live-users` (worktree `C:/wt-live`), from `origin/main` at `7d46a56c`. Local commits only; nothing pushed or merged.

## What it does
- **Heartbeat (every signed-in user).** `src/presence.js` `usePresenceHeartbeat(location.pathname)` runs in `Dashboard`, so the login page is excluded.
  - Sends `POST /api/presence {action:'beat', page}` with the Supabase access token in `Authorization`.
  - Timing: immediately, every 30 s while the tab is visible, and on every page change. It stops when the tab is hidden and resumes when it is shown again.
  - **Data sent:** only the URL path (e.g. `/pnl/shopify`). Nothing from the screen, and no NavAI text.
- **Server.** `api/presence.js` is one endpoint with two actions.
  - **`beat`:** the user id comes from `auth.getUser(token)`, never from the body. The caller must be an active profile.
    - Upserts the caller's single row `{page, last_seen, session_started}`.
    - `session_started` resets after a gap of more than 2 minutes ("active since").
    - `page` must match `^/[a-z0-9/_-]{0,80}$`, otherwise an empty string is stored.
  - **`list`:** the same admin check as `api/auth-admin.js` (active admin profile); anyone else gets **403**.
    - Returns users seen in the last 2 minutes: name (email if there is no name), readable page label, and active since.
    - Also returns `last_seen` for every member.
    - Labels are built server-side from the path. Examples: "P&L · D2C", "Sales · D2C · Return analysis", "Logistics · Performance", "Inventory · Sales & Allocation", "NavAI".
- **Admin UI** (`src/responsive/LiveUsers.jsx`; non-admins render nothing):
  - **Laptop:** a "● N live" pill in the top bar, left of the alerts bell and date, refreshing every 30 s. Clicking it opens a popover list.
  - **Phone:** nothing is added to the green header.
    - "● N live" sits in the launcher's profile row ("Admin · Profile & team access · ● 3 live").
    - "Live users (N)" is the last item in the header ⋯ menu on every page. It opens a bottom sheet.
  - **List row:** name · page label · "active 12 min", with the current admin marked "(you)". The empty state is "Only you are online".
  - **Profile → Team members** (laptop and phone): a green dot plus "Online" for live members. Others show "Last seen 2 h ago". Members never seen keep the existing last-login text.
  - **Polling:** one shared poll (30 s, paused while the tab is hidden) feeds all of these.

## Supabase: exactly what was created (production project, nothing else touched)
`scripts/sql/user-presence.sql`, applied and verified:
- Table `public.user_presence`:
  - `user_id uuid primary key references auth.users on delete cascade`
  - `page text`, `last_seen timestamptz`, `session_started timestamptz`
- Index `user_presence_last_seen_idx`.
- RLS enabled with **no policies**. `revoke all` from `anon` and `authenticated`.
- `grant select, insert, update, delete` to `service_role`. This project does not grant new tables to `service_role` by default; without the grant, the endpoint got "permission denied".

Verified:
- **Grants:** none for the browser roles.
- **Direct browser access:** logged-out read, signed-in read and signed-in write are all **denied**.
- **Table contents:** 0 rows right now. Test rows went with the test users via the cascade.

No existing table, policy, auth rule or data was changed.

## Tests (`_lv_tools/live.mjs`, local only)
Setup:
- 1 temporary admin, plus 2 temporary **non-admin** members (8 tabs each), each in its own browser (Chromium and WebKit).
- Member pages: B on `/pnl/shopify`, then `/sales/shopify/overall`; C on `/logistics/performance_analytics`.

| Run | Result |
|---|---|
| Chromium laptop 1366, incl. drop-off | **13/13** |
| WebKit laptop 1366 | **9/9** |
| Chromium 375 / 360 phone | **12/12 / 12/12** |
| WebKit 360 phone | **12/12** |
| WebKit 375 phone, incl. drop-off | **14/14** |

What is covered:
- **Non-admins:** `list` returns 403; no "live" pill on laptop; no "N live" in the launcher; no "Live users" in ⋯.
- **Admin, both views:** sees "3 live" with both names and pages (P&L · D2C, Logistics · Performance) and "(you)".
  - Laptop: pill and popover.
  - Phone: launcher row, then ⋯ "Live users (3)", then the sheet. No text under 12px, no page overflow.
- **Page change:** the label updates to "Sales · D2C".
- **Team members:** "Online" plus the dot for live members.
- **Drop-off:** one member's tab hidden and the other's closed, and both dropped off in **113–117 s**. Then:
  - The pill shows "1 live", and the popover says "Only you are online".
  - Team members shows "Last seen 2 min ago".
- **Build and lint:** `vite build` passes. No new lint errors: the new files are clean, and the changed files have the same counts as on main (App.jsx 350, ProfilePage 5, others 0; all pre-existing).

**Cleanup:** after every run, then checked again at the end. **0 temporary users remain** (0 `zz-` profiles, 0 `zz-` auth users). I never signed in as Suraj or Pranjal, and never changed their accounts.

## Notes / not done
- **Who shows up today.** Only sessions running this branch send heartbeats. So localhost shows only people using localhost. Real teammates appear once this is deployed, and until then Team members shows their last-login text.
- **Load.** Each heartbeat makes one `auth.getUser` call plus 2 small queries, about 2 per user per minute. That is fine for a team of around 40.
- **NavAI page.** NavAI draws its own header, so it has no pill on laptop and no ⋯ item on phone. The launcher's "● N live" and other pages cover it. Left as is as the least change.
- **What "live" means.** The 2-minute window and the 30 s interval mean a closed tab disappears after 2–2.5 minutes. There is no "leave" ping; that was not needed for the spec.
- **Problems hit along the way, both fixed:**
  - A test-harness bug: the phone member got a laptop-sized window.
  - Missing `service_role` grants on the new table.
  - One local edit helper truncated `App.jsx` mid-edit. It was restored from git before any commit (no effect on the branch).

## Run locally
From `C:/wt-live`:
```
node --env-file=.env _lv_tools/api.mjs    # API on 3016: /api/presence from this branch, everything else proxied to production
npx vite --config vite.local.config.js --host 127.0.0.1 --port 5196 --strictPort
```
