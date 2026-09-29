-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- If you ran the previous version, run only the new parts marked with [NEW]

-- 1. Enable storage for avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT DO NOTHING;

-- Storage policies: create these manually via Supabase → Storage → Policies UI
-- Policy 1: INSERT — bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
-- Policy 2: SELECT — bucket_id = 'avatars' (public read)
-- Policy 3: UPDATE — bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]

-- 2. user_profiles table
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  avatar_url TEXT,
  invited_at TIMESTAMPTZ DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  UNIQUE(user_id),
  UNIQUE(email)
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles readable by admin or self" ON public.user_profiles;
CREATE POLICY "Profiles readable by admin or self" ON public.user_profiles
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.is_admin = true AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins can insert profiles" ON public.user_profiles;
CREATE POLICY "Admins can insert profiles" ON public.user_profiles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.is_admin = true AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins can update any profile; users can update own" ON public.user_profiles;
CREATE POLICY "Admins can update any profile; users can update own" ON public.user_profiles
  FOR UPDATE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.is_admin = true AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins can delete profiles" ON public.user_profiles;
CREATE POLICY "Admins can delete profiles" ON public.user_profiles
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.is_admin = true AND p.is_active = true
    )
  );

-- 3. user_permissions table
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tab TEXT NOT NULL CHECK (tab IN ('overview','sales','ads','logistics','inventory','customer')),
  UNIQUE(user_id, tab)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permissions readable by admin or self" ON public.user_permissions;
CREATE POLICY "Permissions readable by admin or self" ON public.user_permissions
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.is_admin = true AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins can manage permissions" ON public.user_permissions;
CREATE POLICY "Admins can manage permissions" ON public.user_permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.is_admin = true AND p.is_active = true
    )
  );

-- 4. [NEW] login_activity table
CREATE TABLE IF NOT EXISTS public.login_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('login', 'logout')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.login_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activity readable by admin or self" ON public.login_activity;
CREATE POLICY "Activity readable by admin or self" ON public.login_activity
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.is_admin = true AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can insert own activity" ON public.login_activity;
CREATE POLICY "Users can insert own activity" ON public.login_activity
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 5. Function to update last_login_at
CREATE OR REPLACE FUNCTION public.handle_last_login()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.user_profiles SET last_login_at = now() WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_login ON auth.users;
CREATE TRIGGER on_auth_user_login
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_last_login();

-- 6. COGS Ledger table
CREATE TABLE IF NOT EXISTS public.cogs_ledger (
  itemskucode      TEXT NOT NULL,
  month            TEXT NOT NULL,  -- YYYY-MM
  productname      TEXT,
  tallyproductname TEXT,
  subcategory      TEXT,
  category         TEXT,
  cogs             NUMERIC,
  is_explicit      BOOLEAN DEFAULT true,
  updated_at       TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (itemskucode, month)
);

ALTER TABLE public.cogs_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read cogs" ON public.cogs_ledger;
CREATE POLICY "Authenticated users can read cogs" ON public.cogs_ledger
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can upsert cogs" ON public.cogs_ledger;
CREATE POLICY "Authenticated users can upsert cogs" ON public.cogs_ledger
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update cogs" ON public.cogs_ledger;
CREATE POLICY "Authenticated users can update cogs" ON public.cogs_ledger
  FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can delete cogs" ON public.cogs_ledger;
CREATE POLICY "Authenticated users can delete cogs" ON public.cogs_ledger
  FOR DELETE USING (auth.role() = 'authenticated');

-- 7. Insert YOUR admin profile (run this separately after creating your auth account)
-- Replace the UUID with your actual user ID from Supabase → Authentication → Users
-- INSERT INTO public.user_profiles (user_id, name, email, is_admin, is_active)
-- VALUES ('YOUR-USER-UUID-HERE', 'Pranjal Tripati', 'pranjal.t@myfrido.com', true, true);
