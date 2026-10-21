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
--    Re-upload safety — history of attempts, confirmed 2026-10-12 through 2026-10-14, each one
--    found broken by the next: (1) key = (voucher_no, product_name, quantity) — broke when a
--    Quantity/Rate correction changed the key, inserting a duplicate instead of replacing. (2) key
--    + line_no (Nth occurrence of Product+Vendor per voucher) — broke on a NULL vendor_name
--    (Postgres never treats NULL = NULL, so two NULL-vendor rows both passed the constraint; found
--    4 real duplicate pairs). (3) tried a UNIQUE INDEX on COALESCE(vendor_name,'') to fix that —
--    WRONG, PostgREST's upsert onConflict can only target a plain column list, never an expression,
--    so this broke every Save-to-Supabase button outright. (4) normalized vendor_name/ledger_name
--    to '' and went back to a plain constraint — fixed the NULL issue, but then found a much bigger
--    one: the exact same file, re-uploaded a few hours apart, produced ~5,600 duplicate rows in
--    purchase_ledger_domestic because Tally's own export reformats product_name spacing/punctuation
--    between two runs of the identical data ("Olive Green-6UK" vs "Olive Green - 6UK" for the same
--    real line). (5) tried keying on line POSITION within the voucher instead of product_name text
--    — also WRONG: verified directly that line order is NOT stable across two exports either
--    (1,071 of 6,630 position-pairs and 466 of 1,288 shared vouchers differed between the two
--    uploads of the same file). (6) tried Quantity+Rate as the key — also WRONG: 44% of rows in a
--    single clean upload share Quantity+Rate with a sibling line (common for footwear SKUs sold in
--    round pack sizes across many size variants at one rate), so this collided constantly even
--    within one real upload, let alone across two.
--
--    Conclusion: no per-line key survives Tally's own export inconsistency. The real, stable fact
--    is the VOUCHER itself — verified directly: (date, voucher_type, voucher_no) uniquely
--    identifies one real invoice with zero exceptions (0 cases of >1 vendor for the same key across
--    2,255 distinct vouchers checked). So re-upload safety is now handled procedurally, not via a
--    DB uniqueness constraint at all: each upload DELETES every existing row for every voucher it
--    contains, then INSERTS that upload's lines fresh — via the replace_voucher_lines_*() functions
--    below, each a single Postgres function call (one implicit transaction), so a crash mid-upload
--    never leaves a voucher half-deleted; vouchers not yet processed keep their original data.
--    product_name and line_no remain as plain descriptive/display fields — no uniqueness meaning.
UPDATE public.purchase_ledger_domestic SET vendor_name = '' WHERE vendor_name IS NULL;
UPDATE public.purchase_ledger_import SET vendor_name = '' WHERE vendor_name IS NULL;
UPDATE public.purchase_ledger_import SET ledger_name = '' WHERE ledger_name IS NULL;
UPDATE public.purchase_ledger_packaging SET vendor_name = '' WHERE vendor_name IS NULL;

ALTER TABLE public.purchase_ledger_domestic ADD COLUMN IF NOT EXISTS line_no INTEGER;
ALTER TABLE public.purchase_ledger_domestic DROP CONSTRAINT IF EXISTS purchase_ledger_domestic_unique;
ALTER TABLE public.purchase_ledger_domestic DROP CONSTRAINT IF EXISTS purchase_ledger_domestic_voucher_product_vendor_line_key;
DROP INDEX IF EXISTS purchase_ledger_domestic_voucher_product_vendor_line_idx;
CREATE INDEX IF NOT EXISTS purchase_ledger_domestic_voucher_key_idx ON public.purchase_ledger_domestic (date, voucher_type, voucher_no);

-- ledger_name: which specific ledger a row came from (e.g. "CHA Charges", "Cess on Import",
-- "Import of Goods") — this table pools Import of Goods together with every Cost ledger type
-- (Custom Duty, SWS, CAIDC, Cess, CHA, Freight — all via the same "ledger" report path in
-- public/purchase-parser-import.html); without this column nothing distinguished one cost ledger
-- from another, only that a row was SOME cost ledger (quantity IS NULL). Since the same Voucher No.
-- can legitimately carry separate Cost-ledger blocks (e.g. both CHA and Freight booked on one
-- bill), the voucher-replace key for this table also includes ledger_name so uploading one ledger's
-- file never wipes out another ledger's rows for the same voucher.
ALTER TABLE public.purchase_ledger_import ADD COLUMN IF NOT EXISTS line_no INTEGER;
ALTER TABLE public.purchase_ledger_import ADD COLUMN IF NOT EXISTS ledger_name TEXT;
ALTER TABLE public.purchase_ledger_import DROP CONSTRAINT IF EXISTS purchase_ledger_import_unique;
ALTER TABLE public.purchase_ledger_import DROP CONSTRAINT IF EXISTS purchase_ledger_import_voucher_product_vendor_line_key;
ALTER TABLE public.purchase_ledger_import DROP CONSTRAINT IF EXISTS purchase_ledger_import_voucher_product_vendor_line_ledger_key;
DROP INDEX IF EXISTS purchase_ledger_import_voucher_product_vendor_line_ledger_idx;
CREATE INDEX IF NOT EXISTS purchase_ledger_import_voucher_key_idx ON public.purchase_ledger_import (date, voucher_type, voucher_no);

ALTER TABLE public.purchase_ledger_packaging ADD COLUMN IF NOT EXISTS line_no INTEGER;
ALTER TABLE public.purchase_ledger_packaging DROP CONSTRAINT IF EXISTS purchase_ledger_packaging_unique;
ALTER TABLE public.purchase_ledger_packaging DROP CONSTRAINT IF EXISTS purchase_ledger_packaging_voucher_product_vendor_line_key;
DROP INDEX IF EXISTS purchase_ledger_packaging_voucher_product_vendor_line_idx;
CREATE INDEX IF NOT EXISTS purchase_ledger_packaging_voucher_key_idx ON public.purchase_ledger_packaging (date, voucher_type, voucher_no);

-- replace_voucher_lines_*(): delete every existing row for one voucher, then insert the upload's
-- new lines for that same voucher — all inside one function call (one implicit Postgres
-- transaction), so a page crash/network drop mid-upload never leaves a voucher half-deleted.
-- SECURITY DEFINER (confirmed 2026-10-14): the parser HTML pages have no login — they always call
-- Supabase with the plain anon key — but the table's RLS policies and grants only ever covered
-- `authenticated`, so with SECURITY INVOKER every save/read failed outright ("permission denied
-- for table ..."). Fix: run these three functions as their owner (bypassing RLS) and grant EXECUTE
-- to anon, while leaving direct table grants/RLS as authenticated-only — so anon can replace one
-- voucher's lines through this function's exact shape, but cannot read/write the table directly.
CREATE OR REPLACE FUNCTION public.replace_voucher_lines_domestic(
  p_date DATE, p_voucher_type TEXT, p_voucher_no TEXT, p_rows JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.purchase_ledger_domestic
  WHERE date = p_date AND voucher_type = p_voucher_type AND voucher_no = p_voucher_no;

  INSERT INTO public.purchase_ledger_domestic (
    date, product_name, vendor_name, voucher_type, voucher_no, voucher_ref_no,
    quantity, unit_of_measure, rate, line_item_gross_total_exc_gst,
    purchase_rate_per_qty_rs_exc_gst, line_no
  )
  SELECT
    (r->>'date')::DATE, r->>'product_name', r->>'vendor_name', r->>'voucher_type', r->>'voucher_no',
    r->>'voucher_ref_no', (r->>'quantity')::NUMERIC, r->>'unit_of_measure', (r->>'rate')::NUMERIC,
    (r->>'line_item_gross_total_exc_gst')::NUMERIC, (r->>'purchase_rate_per_qty_rs_exc_gst')::NUMERIC,
    (r->>'line_no')::INTEGER
  FROM jsonb_array_elements(p_rows) AS r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_voucher_lines_packaging(
  p_date DATE, p_voucher_type TEXT, p_voucher_no TEXT, p_rows JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.purchase_ledger_packaging
  WHERE date = p_date AND voucher_type = p_voucher_type AND voucher_no = p_voucher_no;

  INSERT INTO public.purchase_ledger_packaging (
    date, product_name, vendor_name, voucher_type, voucher_no, voucher_ref_no,
    quantity, unit_of_measure, rate, line_item_gross_total_exc_gst,
    purchase_rate_per_qty_rs_exc_gst, line_no
  )
  SELECT
    (r->>'date')::DATE, r->>'product_name', r->>'vendor_name', r->>'voucher_type', r->>'voucher_no',
    r->>'voucher_ref_no', (r->>'quantity')::NUMERIC, r->>'unit_of_measure', (r->>'rate')::NUMERIC,
    (r->>'line_item_gross_total_exc_gst')::NUMERIC, (r->>'purchase_rate_per_qty_rs_exc_gst')::NUMERIC,
    (r->>'line_no')::INTEGER
  FROM jsonb_array_elements(p_rows) AS r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 4-argument version: the voucher-replace key here also includes ledger_name (see comment above
-- the column definitions) since the same Voucher No. can carry separate Cost-ledger blocks.
CREATE OR REPLACE FUNCTION public.replace_voucher_lines_import(
  p_date DATE, p_voucher_type TEXT, p_voucher_no TEXT, p_ledger_name TEXT, p_rows JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.purchase_ledger_import
  WHERE date = p_date AND voucher_type = p_voucher_type AND voucher_no = p_voucher_no
    AND COALESCE(ledger_name, '') = COALESCE(p_ledger_name, '');

  INSERT INTO public.purchase_ledger_import (
    date, product_name, vendor_name, voucher_type, voucher_no, voucher_ref_no, gst,
    quantity, unit_of_measure, rate_usd, gross_total_usd, gross_total_rs, roe,
    purchase_rate_per_qty_rs_exc_gst, line_no, ledger_name
  )
  SELECT
    (r->>'date')::DATE, r->>'product_name', r->>'vendor_name', r->>'voucher_type', r->>'voucher_no',
    r->>'voucher_ref_no', r->>'gst', (r->>'quantity')::NUMERIC, r->>'unit_of_measure',
    (r->>'rate_usd')::NUMERIC, (r->>'gross_total_usd')::NUMERIC, (r->>'gross_total_rs')::NUMERIC,
    (r->>'roe')::NUMERIC, (r->>'purchase_rate_per_qty_rs_exc_gst')::NUMERIC,
    (r->>'line_no')::INTEGER, r->>'ledger_name'
  FROM jsonb_array_elements(p_rows) AS r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_voucher_lines_domestic(DATE,TEXT,TEXT,JSONB) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.replace_voucher_lines_packaging(DATE,TEXT,TEXT,JSONB) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.replace_voucher_lines_import(DATE,TEXT,TEXT,TEXT,JSONB) TO authenticated, anon;

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

-- 11. tally_sku_mapping — persists the Tally Product Name -> SKU Code mapping built 2026-10-14
--     (previously only an Excel export). Join path confirmed: tally_product_name matches
--     productid_sku_mapping.productid where channelname='Tally' (that column holds the raw Tally
--     product name text for Tally rows, not a numeric ID like other channels), which maps to
--     masterskucode, which is sku_master.Product_Code (also exposed as item_master.Product_Code in
--     Supabase). Deliberately a SEPARATE table from cogs_ledger — cogs_ledger stays the manual-
--     entry table exactly as-is; this table is the input the COGS CALCULATION reads from, kept
--     independent so recomputing/re-reviewing the mapping never touches manually-typed COGS rows.
--     confidence/match_source/flag mirror the verification work done when this mapping was first
--     built (mapping-sheet primary, sku_master fallback, size/category/collision re-checks) — kept
--     here so a stale or shaky mapping can be filtered out of the COGS calc without re-deriving it.
CREATE TABLE IF NOT EXISTS public.tally_sku_mapping (
  tally_product_name   TEXT PRIMARY KEY,
  product_code         TEXT,            -- sku_master.Product_Code / item_master.Product_Code; NULL = confirmed no match
  matched_sku_name     TEXT,            -- sku_master.Name at match time, for display/audit only
  confidence           TEXT NOT NULL,   -- 'high' | 'medium' | 'low' | 'needs_review' | 'conflict' | 'unverifiable' | 'no_match'
  match_source         TEXT,            -- 'mapping_sheet' | 'sku_master_fallback' | 'human_rule_*' | etc.
  flag                 TEXT,            -- human-readable note on why this needs review, if applicable
  is_cost_ledger_only  BOOLEAN DEFAULT false,  -- name only ever seen in Import Cost-ledger rows (CHA/Freight/Duty/…), no separate goods line
  updated_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tally_sku_mapping ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read tally_sku_mapping" ON public.tally_sku_mapping;
CREATE POLICY "Authenticated users can read tally_sku_mapping" ON public.tally_sku_mapping
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated users can write tally_sku_mapping" ON public.tally_sku_mapping;
CREATE POLICY "Authenticated users can write tally_sku_mapping" ON public.tally_sku_mapping
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tally_sku_mapping TO authenticated;

-- 12. cogs_calculated — automatically derived COGS per (product_code, month), confirmed design
--     2026-10-15: product_cost = weighted-average purchase rate (Σ qty×rate / Σ qty) across that
--     SKU's Domestic + Import "Import of Goods" purchase lines in that month, via tally_sku_mapping;
--     if a SKU had no purchase in a given month, the LAST KNOWN weighted-average cost is carried
--     forward (confirmed: inventory bought in an earlier month is still being sold later, so the
--     cost shouldn't go blank just because nothing was purchased that exact month).
--     packaging_cost = Σ(packaging_bom.qty_per_unit × COALESCE(cost_override, packaging_sku_master.
--     cost_per_unit)) for that product_code's BOM — confirmed 2026-10-15 to use packaging's CURRENT
--     cost flat across every month, since packaging_bom/packaging_sku_master have no month/effective
--     -date dimension yet (unlike the purchase ledger, which is naturally dated) — revisit once
--     packaging cost history starts being tracked.
--     Deliberately separate from cogs_ledger (the pre-existing manual-entry table, left untouched)
--     per 2026-10-15 decision: at read time, callers should use cogs_calculated first and fall back
--     to cogs_ledger only where no calculated row exists for that (SKU, month).
CREATE TABLE IF NOT EXISTS public.cogs_calculated (
  product_code       TEXT NOT NULL,
  month              TEXT NOT NULL,  -- YYYY-MM
  product_cost       NUMERIC,        -- weighted-avg purchase rate for the month (or carried forward)
  product_cost_month TEXT,           -- the month this product_cost actually came from, when carried forward (NULL = this month had a real purchase)
  packaging_cost     NUMERIC,        -- current packaging BOM cost (flat across months, see note above)
  other_charges      NUMERIC DEFAULT 0,  -- placeholder for any additional per-unit charge, not yet defined
  cogs               NUMERIC,        -- product_cost + packaging_cost + other_charges
  computed_at        TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (product_code, month)
);

ALTER TABLE public.cogs_calculated ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read cogs_calculated" ON public.cogs_calculated;
CREATE POLICY "Authenticated users can read cogs_calculated" ON public.cogs_calculated
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated users can write cogs_calculated" ON public.cogs_calculated;
CREATE POLICY "Authenticated users can write cogs_calculated" ON public.cogs_calculated
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cogs_calculated TO authenticated;
