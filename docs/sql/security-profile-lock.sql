-- Lock user_profiles: a signed-in member can change only their own name, avatar and session id.
-- Found 2026-11-28: the live policy "Admins can update any profile; users can update own" (UPDATE, USING
-- auth.uid() = user_id OR is_admin_user(auth.uid()), WITH CHECK none) lets any member update every column of
-- their own row, including is_admin and is_active. NOT RUN: review, then run in the Supabase SQL editor. Safe to re-run.
--
-- ── 1. Columns of public.user_profiles (supabase-schema.sql + what the code reads and writes) ──────────────
--
--   USER-EDITABLE (the browser updates these as the member, on their own row):
--     name               Profile → Save                                   (src/profile/profileShared.js:134)
--     avatar_url         Profile → upload photo                           (src/profile/profileShared.js:126)
--     active_session_id  login stamp, cleared on sign-out                 (LoginPage.jsx:138, App.jsx:3661, 20090, ProfilePage.jsx:559)
--
--   PROTECTED (changed only by an admin, the service role (api/auth-admin.js, api/*), the DB itself, or a trigger):
--     id, user_id        row identity
--     email              login identity
--     is_admin           role                                             (auth-admin: promote / demote)
--     is_active          revoked or not                                   (auth-admin: revoke / restore)
--     invited_at         created
--     last_login_at      written by trigger on_auth_user_login (auth.users), not by the browser
--     weak_password, weak_skips   weak-password flag and "remind me later" count (security-batch1.sql). The app now
--                        writes them through /api/auth-admin action weak_flag (service role), not from the browser.
--     any other column   (revoked_at / revoked_by / pulse flags, if the live table has them: the repo's schema has none,
--                        pulse access lives in user_permissions tab 'ask'). The trigger below is an ALLOW-list of the three
--                        editable columns, so any column not listed is protected, including ones added later.
--
-- ── 2. Trigger ───────────────────────────────────────────────────────────────────────────────────────────
-- Applies to browser sessions only (auth.role() is 'authenticated' or 'anon'). The service role, the SQL editor /
-- direct database sessions, and the auth.users login trigger (no browser role) are not restricted. A browser caller who
-- is an active admin is not restricted by this trigger. (guard_user_profiles from scripts/sql/access-hardening.sql, if
-- applied, is stricter and still blocks even an admin's browser session from changing is_admin / is_active / email /
-- user_id, and still protects the last admin. Both triggers can stay.)
CREATE OR REPLACE FUNCTION public.guard_user_profiles_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  editable CONSTANT text[] := ARRAY['name', 'avatar_url', 'active_session_id'];
BEGIN
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon')
     AND NOT public.is_admin_user(auth.uid())
     AND (to_jsonb(NEW) - editable) IS DISTINCT FROM (to_jsonb(OLD) - editable) THEN
    RAISE EXCEPTION 'Only an admin can change this part of a profile (members can change their name and photo)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_user_profiles_columns() FROM PUBLIC;

DROP TRIGGER IF EXISTS guard_user_profiles_columns ON public.user_profiles;
CREATE TRIGGER guard_user_profiles_columns
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_profiles_columns();

-- ── 3. Policies ──────────────────────────────────────────────────────────────────────────────────────────
-- Replace the one policy that has no WITH CHECK by two: a member updates only their own row (and the row must still be
-- theirs afterwards); an admin updates any row. "Users can update own session id" (own row, WITH CHECK) is already fine.
DROP POLICY IF EXISTS "Admins can update any profile; users can update own" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can update any profile" ON public.user_profiles;
CREATE POLICY "Admins can update any profile" ON public.user_profiles
  FOR UPDATE USING (public.is_admin_user(auth.uid())) WITH CHECK (public.is_admin_user(auth.uid()));

-- ── 4. What in the app updates user_profiles from the browser (all own row, all editable columns) ──────────
--   profileShared.js:126   { avatar_url }                        ok
--   profileShared.js:134   { name }                              ok
--   LoginPage.jsx:138      { active_session_id }                 ok
--   App.jsx:3661, 20090    { active_session_id: null }           ok
--   ProfilePage.jsx:559    { active_session_id: null }           ok
-- Writes that used protected columns were moved to the API in this branch (src/weakFlag.js -> /api/auth-admin
-- weak_flag): LoginPage.jsx (weak_password), WeakPasswordGate.jsx (weak_skips), ResetPasswordPage.jsx and
-- profileShared.js changeOwnPassword (clear both). Nothing else in src/ updates, inserts or deletes user_profiles.
-- Server side (service role, unaffected by the trigger and by RLS): api/auth-admin.js create (insert), promote / demote
-- (is_admin), revoke / restore (is_active), weak_flag, reset_password (clears the flag).
-- Also unaffected: last_login_at, set by the auth.users trigger handle_last_login (no browser role).
--
-- ── 5. Rollback (uncomment to run) ───────────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS guard_user_profiles_columns ON public.user_profiles;
-- DROP FUNCTION IF EXISTS public.guard_user_profiles_columns();
-- DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
-- DROP POLICY IF EXISTS "Admins can update any profile" ON public.user_profiles;
-- CREATE POLICY "Admins can update any profile; users can update own" ON public.user_profiles
--   FOR UPDATE USING (auth.uid() = user_id OR public.is_admin_user(auth.uid()));

-- ── 6. Test (run AFTER the block above; changes nothing, it ends with ROLLBACK) ─────────────────────────
-- Replace the two uuids: a normal active member and an active admin (select user_id, name, is_admin from user_profiles).
-- Each line of output is a NOTICE: PASS or FAIL. Expected: all PASS.
-- BEGIN;
-- DO $t$
-- DECLARE
--   m uuid := '00000000-0000-0000-0000-000000000001';  -- member
--   a uuid := '00000000-0000-0000-0000-000000000002';  -- admin
--   other uuid; n int;
-- BEGIN
--   SELECT user_id INTO other FROM public.user_profiles WHERE user_id NOT IN (m, a) LIMIT 1;
--   -- member, own name: allowed
--   PERFORM set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
--   SET LOCAL ROLE authenticated;
--   UPDATE public.user_profiles SET name = name WHERE user_id = m; GET DIAGNOSTICS n = ROW_COUNT;
--   RAISE NOTICE '% member can update own name', CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END;
--   -- member, protected columns: each must fail
--   BEGIN UPDATE public.user_profiles SET is_admin = true WHERE user_id = m; RAISE NOTICE 'FAIL member set is_admin';
--   EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS member cannot set is_admin'; END;
--   BEGIN UPDATE public.user_profiles SET is_active = false WHERE user_id = m; RAISE NOTICE 'FAIL member set is_active';
--   EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS member cannot set is_active'; END;
--   BEGIN UPDATE public.user_profiles SET weak_skips = 0 WHERE user_id = m; RAISE NOTICE 'FAIL member set weak_skips';
--   EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS member cannot set weak_skips'; END;
--   BEGIN UPDATE public.user_profiles SET email = 'x@example.com' WHERE user_id = m; RAISE NOTICE 'FAIL member set email';
--   EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS member cannot set email'; END;
--   -- member, someone else's row: no row is visible to update
--   IF other IS NOT NULL THEN
--     UPDATE public.user_profiles SET name = name WHERE user_id = other; GET DIAGNOSTICS n = ROW_COUNT;
--     RAISE NOTICE '% member cannot update another profile', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END;
--   END IF;
--   RESET ROLE;
--   -- admin, a protected column on a member (weak_skips, so the last-admin guard is not involved): allowed
--   PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
--   SET LOCAL ROLE authenticated;
--   UPDATE public.user_profiles SET weak_skips = 1 WHERE user_id = m; GET DIAGNOSTICS n = ROW_COUNT;
--   RAISE NOTICE '% admin can change a protected column', CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END;
--   RESET ROLE;
--   -- service role: allowed
--   PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
--   SET LOCAL ROLE service_role;
--   UPDATE public.user_profiles SET weak_skips = 0 WHERE user_id = m; GET DIAGNOSTICS n = ROW_COUNT;
--   RAISE NOTICE '% service role can change a protected column', CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END;
--   RESET ROLE;
-- END $t$;
-- ROLLBACK;
--
-- From the app instead: sign in as a member, open the browser console and run
--   await supabase.from('user_profiles').update({ is_admin: true }).eq('user_id', '<own id>')
-- (use the app's own client, or the REST call with the member's token). It must return an error 42501 (or 0 rows if the
-- id is not theirs). Then Profile → change name and photo must still save, and login / logout must still work.
