-- Access hardening (Profile → Team members), 2026-10-27. Safe to re-run. Run in the Supabase SQL editor.
-- Found in review: any signed-in user could set is_admin / is_active on their own profile from the
-- browser (the "users can update own" policy covers every column), and anyone (even logged out) could
-- read every profile through "Public email lookup".
--
-- Part A works with the app before and after fix/profile-access: run it now.
-- Part B needs the fix/profile-access deploy (its login page asks the API instead of reading
-- user_profiles directly): run it after that deploy.

-- ── Part A ────────────────────────────────────────────────────────────────────────────────────────

-- 1. Role, status and email change only server-side (the admin API uses the service role) or from a
--    direct database session; never from a browser session, not even an admin's. And never remove the
--    last active admin (by update or delete).
CREATE OR REPLACE FUNCTION public.guard_user_profiles()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  via_browser BOOLEAN := coalesce(auth.role(), '') IN ('authenticated', 'anon');
  loses_admin BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF via_browser AND (NEW.is_admin IS DISTINCT FROM OLD.is_admin OR NEW.is_active IS DISTINCT FROM OLD.is_active
        OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.email IS DISTINCT FROM OLD.email) THEN
      RAISE EXCEPTION 'Role, status and email can only be changed by an admin through Team members' USING ERRCODE = '42501';
    END IF;
    loses_admin := OLD.is_admin AND OLD.is_active AND NOT (NEW.is_admin AND NEW.is_active);
  ELSE
    loses_admin := OLD.is_admin AND OLD.is_active;
  END IF;
  IF loses_admin AND NOT EXISTS (
    SELECT 1 FROM public.user_profiles WHERE is_admin AND is_active AND user_id <> OLD.user_id
  ) THEN
    RAISE EXCEPTION 'This is the last active admin; make someone else admin first' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS guard_user_profiles ON public.user_profiles;
CREATE TRIGGER guard_user_profiles
  BEFORE UPDATE OR DELETE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_profiles();

-- 2. Profiles are created and deleted only by the admin API (service role); the app never does this
--    from the browser.
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.user_profiles;

-- ── Part B (after the fix/profile-access deploy) ────────────────────────────────────────────────
-- Logged-out visitors (and members) can no longer list every profile. Members still read their own
-- profile; admins read all ("Profiles readable by admin or self"). Uncomment and run after the deploy:
-- DROP POLICY IF EXISTS "Public email lookup" ON public.user_profiles;
