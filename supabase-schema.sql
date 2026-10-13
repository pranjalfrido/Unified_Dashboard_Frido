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

-- is_admin_user(): SECURITY DEFINER function used by every "admin or self" policy below instead
-- of an inline `EXISTS (SELECT 1 FROM user_profiles ...)` subquery. A policy ON user_profiles that
-- queries user_profiles again inside its own USING clause is a self-referencing RLS trap —
-- confirmed 2026-10-12: this caused intermittent "infinite recursion detected in policy for
-- relation user_profiles" errors, surfacing to the browser as a plain 500 on the profile fetch,
-- which the app silently treated as "not admin, no profile" and hid the entire sidebar/nav for a
-- real admin account. SECURITY DEFINER runs with the function owner's privileges, bypassing RLS
-- for this one lookup, which breaks the cycle entirely. STABLE lets Postgres cache the result
-- within a single statement instead of re-evaluating it per row.
CREATE OR REPLACE FUNCTION public.is_admin_user(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = uid AND is_admin = true AND is_active = true
  );
$$;

DROP POLICY IF EXISTS "Profiles readable by admin or self" ON public.user_profiles;
CREATE POLICY "Profiles readable by admin or self" ON public.user_profiles
  FOR SELECT USING (
    auth.uid() = user_id OR public.is_admin_user(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can insert profiles" ON public.user_profiles;
CREATE POLICY "Admins can insert profiles" ON public.user_profiles
  FOR INSERT WITH CHECK (
    public.is_admin_user(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can update any profile; users can update own" ON public.user_profiles;
CREATE POLICY "Admins can update any profile; users can update own" ON public.user_profiles
  FOR UPDATE USING (
    auth.uid() = user_id OR public.is_admin_user(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can delete profiles" ON public.user_profiles;
CREATE POLICY "Admins can delete profiles" ON public.user_profiles
  FOR DELETE USING (
    public.is_admin_user(auth.uid())
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
    auth.uid() = user_id OR public.is_admin_user(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can manage permissions" ON public.user_permissions;
CREATE POLICY "Admins can manage permissions" ON public.user_permissions
  FOR ALL USING (
    public.is_admin_user(auth.uid())
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
    auth.uid() = user_id OR public.is_admin_user(auth.uid())
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

-- 7. item_master read access — this table is created directly by export_to_supabase.mjs
--    (a raw CREATE TABLE with no RLS/policy setup), so it never got a SELECT policy of its
--    own. It has RLS enabled with no matching policy, which silently denies every client-side
--    read ("permission denied for table item_master") even though CogsPage.jsx and other pages
--    already query it via the anon-key client — confirmed 2026-09-30 while wiring up
--    PackagingBomPage.jsx. Safe to run even if RLS/policies already exist correctly; the
--    IF NOT EXISTS-equivalent DROP+CREATE pattern below is idempotent.
ALTER TABLE public.item_master ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read item master" ON public.item_master;
CREATE POLICY "Authenticated users can read item master" ON public.item_master
  FOR SELECT USING (auth.role() = 'authenticated');

-- 8. Packaging BOM — the packaging SKU catalogue (synced hourly from the Sheet-backed BigQuery
--    table by export_to_supabase.mjs, same pattern as item_master — a raw CREATE TABLE with no
--    RLS/policy setup of its own, so it needs the same read-policy treatment as item_master
--    above) and the product-wise bill of materials. Product = item_master.Sub_category (confirmed
--    2026-09-30: packaging is defined at the sub-category level, not per exact SKU, since a
--    sub-category's variants — color, etc. — all share the same packaging).
--    Replaced the earlier packaging_material_types/packaging_sub_types split (confirmed
--    2026-10-11: collapsed into one flat packaging_sku_master, which is now the single source of
--    truth for packaging type/name/SKU/cost/dimensions, maintained directly in the Sheet).
ALTER TABLE public.packaging_sku_master ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read packaging sku master" ON public.packaging_sku_master;
CREATE POLICY "Authenticated users can read packaging sku master" ON public.packaging_sku_master
  FOR SELECT USING (auth.role() = 'authenticated');

-- packaging_sku_master_extra: SKUs added inline from the Packaging BOM uploader when a user
-- references a packaging item that doesn't exist yet in the Sheet-backed packaging_sku_master
-- (confirmed 2026-10-12). packaging_sku_master itself is TRUNCATEd and fully reloaded from
-- BigQuery on every hourly sync (export_to_supabase.mjs's bulkLoad), so anything inserted directly
-- into it from the app would be silently deleted on the next sync — this table exists so new SKUs
-- survive that sync untouched. The BOM page merges both tables into one SKU list at read time; a
-- row here is flagged to the user as "not yet in the Sheet" until someone adds it there for real
-- and it starts coming through packaging_sku_master instead (at which point it becomes a harmless
-- duplicate here — the merge keys off packaging_sku and prefers the Sheet-synced copy).
CREATE TABLE IF NOT EXISTS public.packaging_sku_master_extra (
  packaging_sku    TEXT PRIMARY KEY,
  packaging_type   TEXT NOT NULL,
  packaging_name   TEXT NOT NULL,
  cost_per_unit    NUMERIC,
  vol_weight_gm    NUMERIC,
  vendor           TEXT,
  linked_product   TEXT,
  added_by         UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.packaging_sku_master_extra ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read packaging sku master extra" ON public.packaging_sku_master_extra;
CREATE POLICY "Authenticated users can read packaging sku master extra" ON public.packaging_sku_master_extra
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated users can write packaging sku master extra" ON public.packaging_sku_master_extra;
CREATE POLICY "Authenticated users can write packaging sku master extra" ON public.packaging_sku_master_extra
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packaging_sku_master_extra TO authenticated;

-- product_code (not Sub_category) is the real join key — confirmed 2026-10-12: Sub_category is
-- free text maintained in a Sheet and gets renamed/altered sometimes, which would silently orphan
-- any BOM row keyed on the old string the moment that happened (this bit every other Sub_category
-- -keyed join in the codebase too, but it's fixed here specifically). sub_category_at_save is a
-- denormalized CACHE of what the Sub_category was called at save time, kept only for display/
-- diagnostics when the live item master is unreachable — every real read re-derives the current
-- Sub_category live via api/packaging-products.js (detail=1), so a rename in the Sheet is picked
-- up automatically on next load with no migration needed. One row per (Product_Code, packaging_
-- sku): building "one product's BOM" in the UI fans out and writes a row for every Product_Code
-- currently in that Sub_category (confirmed 2026-10-12 — simpler fan-out now, allows a single SKU
-- variant to diverge from its siblings later if ever needed, vs. one row covering the whole group).
CREATE TABLE IF NOT EXISTS public.packaging_bom (
  product_code         TEXT NOT NULL,   -- item_master.Product_Code — the real, stable key
  packaging_sku        TEXT NOT NULL,   -- packaging_sku_master.packaging_sku
  sub_category_at_save TEXT,            -- cached label only, never used as a join/lookup key
  qty_per_unit         NUMERIC NOT NULL DEFAULT 1,
  -- cost_override: per-BOM-row cost (₹/unit) that takes precedence over
  -- packaging_sku_master.cost_per_unit for THIS product's costing only. Needed because the sheet
  -- is still being populated — most SKUs have no cost yet (confirmed 2026-10-11, all 326 rows
  -- blank at the time this was added) — and because a product may legitimately pay a different
  -- rate than the master's default (e.g. a negotiated per-product rate). NULL = use the master's
  -- cost_per_unit as-is.
  cost_override        NUMERIC,
  -- batch_id: every write — a single-product Save or one bulk-upload file — tags all the rows it
  -- touches with one shared UUID (confirmed 2026-10-12, added so a bad bulk upload can be found
  -- and reversed in one action instead of hunting row by row; batch_source/batch_note give enough
  -- context to recognize which batch is the bad one from a list). A later edit to an individual
  -- row naturally moves it to a new batch (whatever wrote it last), which is correct — batch_id
  -- always answers "who wrote this row's CURRENT values", not its full history.
  batch_id              UUID,
  batch_source          TEXT,           -- 'form' | 'bulk_upload'
  batch_note            TEXT,           -- e.g. the uploaded filename, for bulk_upload batches
  batch_created_by      UUID REFERENCES auth.users(id),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (product_code, packaging_sku)
);

ALTER TABLE public.packaging_bom ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read bom" ON public.packaging_bom;
CREATE POLICY "Authenticated users can read bom" ON public.packaging_bom
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated users can write bom" ON public.packaging_bom;
CREATE POLICY "Authenticated users can write bom" ON public.packaging_bom
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Tables created via raw SQL Editor (rather than Supabase's own Table Editor UI) don't
-- automatically get the standard authenticated/anon role GRANTs Supabase normally applies —
-- without them, Postgres denies access at the grant level before RLS policies are even
-- evaluated, which is indistinguishable from an RLS failure ("permission denied for table ...")
-- confirmed 2026-09-30 for the old packaging_material_types table; same treatment applied here.
GRANT SELECT ON public.packaging_sku_master TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packaging_bom TO authenticated;
GRANT SELECT ON public.item_master TO authenticated;

-- 9. Purchase ledger tables (domestic/import/packaging Tally purchase parsers, public/purchase-
--    parser-*.html) — these were created directly via Supabase's Table Editor UI at some point
--    outside this schema file, which defaults new tables to an "allow all" policy for BOTH anon
--    and authenticated with no restriction (qual: true). Confirmed 2026-10-12: this meant anyone
--    who could reach the public parser page — no login required, since the anon key is hardcoded
--    in that static HTML — could read, insert, update, or even TRUNCATE these tables. Locked down
--    here to the same authenticated-only pattern as every other table; the parser pages' Supabase
--    client shares the dashboard's login session automatically (same origin, default localStorage
--    session persistence), so a user already signed into the dashboard in that browser still
--    works — this only blocks requests with no valid session at all.
--
--    line_no / re-upload key — also confirmed 2026-10-12: the original unique key was
--    (voucher_no, product_name, quantity), which breaks in two ways. (1) Correcting a Quantity or
--    Rate on re-upload changes the key, so the corrected row gets INSERTED alongside the old wrong
--    one instead of replacing it. (2) Tally can legitimately list the same product twice on one
--    voucher from the same vendor (e.g. a price-revision line) — a real case of this was found in
--    purchase_ledger_import (voucher YH-7732-8-1, "R & D Items - Imported" twice). line_no is the
--    Nth occurrence of (Product, Vendor) within one voucher, computed by each parser HTML in file
--    order; the key is now (voucher_no, product_name, vendor_name, line_no) — a correction to
--    Quantity/Rate/Date/anything else keeps the same line_no and cleanly replaces the row, while
--    two genuinely different lines for the same product still get distinct keys.
ALTER TABLE public.purchase_ledger_domestic ADD COLUMN IF NOT EXISTS line_no INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.purchase_ledger_domestic DROP CONSTRAINT IF EXISTS purchase_ledger_domestic_unique;
ALTER TABLE public.purchase_ledger_domestic DROP CONSTRAINT IF EXISTS purchase_ledger_domestic_voucher_product_vendor_line_key;
ALTER TABLE public.purchase_ledger_domestic ADD CONSTRAINT purchase_ledger_domestic_voucher_product_vendor_line_key
  UNIQUE (voucher_no, product_name, vendor_name, line_no);

ALTER TABLE public.purchase_ledger_import ADD COLUMN IF NOT EXISTS line_no INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.purchase_ledger_import DROP CONSTRAINT IF EXISTS purchase_ledger_import_unique;
ALTER TABLE public.purchase_ledger_import DROP CONSTRAINT IF EXISTS purchase_ledger_import_voucher_product_vendor_line_key;
ALTER TABLE public.purchase_ledger_import ADD CONSTRAINT purchase_ledger_import_voucher_product_vendor_line_key
  UNIQUE (voucher_no, product_name, vendor_name, line_no);

ALTER TABLE public.purchase_ledger_packaging ADD COLUMN IF NOT EXISTS line_no INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.purchase_ledger_packaging DROP CONSTRAINT IF EXISTS purchase_ledger_packaging_unique;
ALTER TABLE public.purchase_ledger_packaging DROP CONSTRAINT IF EXISTS purchase_ledger_packaging_voucher_product_vendor_line_key;
ALTER TABLE public.purchase_ledger_packaging ADD CONSTRAINT purchase_ledger_packaging_voucher_product_vendor_line_key
  UNIQUE (voucher_no, product_name, vendor_name, line_no);

DROP POLICY IF EXISTS "allow all" ON public.purchase_ledger_domestic;
DROP POLICY IF EXISTS "Authenticated users can read purchase_ledger_domestic" ON public.purchase_ledger_domestic;
CREATE POLICY "Authenticated users can read purchase_ledger_domestic" ON public.purchase_ledger_domestic
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated users can write purchase_ledger_domestic" ON public.purchase_ledger_domestic;
CREATE POLICY "Authenticated users can write purchase_ledger_domestic" ON public.purchase_ledger_domestic
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
REVOKE ALL ON public.purchase_ledger_domestic FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_ledger_domestic TO authenticated;

DROP POLICY IF EXISTS "allow all" ON public.purchase_ledger_import;
DROP POLICY IF EXISTS "Authenticated users can read purchase_ledger_import" ON public.purchase_ledger_import;
CREATE POLICY "Authenticated users can read purchase_ledger_import" ON public.purchase_ledger_import
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated users can write purchase_ledger_import" ON public.purchase_ledger_import;
CREATE POLICY "Authenticated users can write purchase_ledger_import" ON public.purchase_ledger_import
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
REVOKE ALL ON public.purchase_ledger_import FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_ledger_import TO authenticated;

DROP POLICY IF EXISTS "allow all" ON public.purchase_ledger_packaging;
DROP POLICY IF EXISTS "Authenticated users can read purchase_ledger_packaging" ON public.purchase_ledger_packaging;
CREATE POLICY "Authenticated users can read purchase_ledger_packaging" ON public.purchase_ledger_packaging
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated users can write purchase_ledger_packaging" ON public.purchase_ledger_packaging;
CREATE POLICY "Authenticated users can write purchase_ledger_packaging" ON public.purchase_ledger_packaging
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
REVOKE ALL ON public.purchase_ledger_packaging FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_ledger_packaging TO authenticated;

-- 10. Insert YOUR admin profile (run this separately after creating your auth account)
-- Replace the UUID with your actual user ID from Supabase → Authentication → Users
-- INSERT INTO public.user_profiles (user_id, name, email, is_admin, is_active)
-- VALUES ('YOUR-USER-UUID-HERE', 'Pranjal Tripati', 'pranjal.t@myfrido.com', true, true);
