// In-memory Postgres (PGlite) with the CN migrations applied, for tests. Never Supabase.
//
// Supabase provides auth.uid(), auth.role(), the anon/authenticated roles, user_profiles,
// user_permissions and is_admin_user(); the stubs below stand in for them so the migration
// files run unmodified.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const sql = (rel) => readFileSync(resolve(root, rel), "utf8");

export const USERS = {
  admin: "00000000-0000-0000-0000-00000000000a",
  uploader: "00000000-0000-0000-0000-00000000000b", // has 'documents'
  manager: "00000000-0000-0000-0000-00000000000c", // has 'documents' + 'documents:cn-manage'
  outsider: "00000000-0000-0000-0000-00000000000d", // signed in, no documents access
};

const SUPABASE_STUBS = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
    AS $$ SELECT current_user::text $$;

  CREATE TABLE public.user_profiles (user_id uuid PRIMARY KEY, is_admin boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.user_permissions (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid NOT NULL, tab text NOT NULL);
  CREATE FUNCTION public.is_admin_user(uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = uid AND is_admin = true AND is_active = true) $$;

  -- Same shape as scripts/sql/logistics-invoice-totals.sql (minus pg_cron, absent here).
  CREATE TABLE public.logistics_invoice_totals (
    category text NOT NULL, partner text NOT NULL, month_year text NOT NULL, invoice_number text NOT NULL,
    lines int NOT NULL, amount numeric, refreshed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (category, partner, month_year, invoice_number));

  INSERT INTO public.user_profiles (user_id, is_admin) VALUES
    ('${USERS.admin}', true), ('${USERS.uploader}', false), ('${USERS.manager}', false), ('${USERS.outsider}', false);
  INSERT INTO public.user_permissions (user_id, tab) VALUES
    ('${USERS.uploader}', 'documents'),
    ('${USERS.manager}', 'documents'), ('${USERS.manager}', 'documents:cn-manage'),
    ('${USERS.outsider}', 'sales');
`;

export async function freshDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  await db.exec(sql("scripts/sql/cn/001_cn_schema.sql"));
  return db;
}

// Schema + the real master seed + the upload engine (with the background commit).
export async function engineDb() {
  const db = await freshDb();
  await db.exec(sql("scripts/sql/cn/002_cn_master_seed.sql"));
  await db.exec(sql("scripts/sql/cn/003_cn_upload_engine.sql"));
  await db.exec(sql("scripts/sql/cn/004_cn_background_commit.sql"));
  return db;
}

// Run fn as a signed-in user (role authenticated, auth.uid() = that user); back to the
// superuser afterwards even if fn throws.
export async function as(db, uid, fn) {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  try { return await fn(); } finally {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`);
  }
}

// Expect a statement to fail; returns the Postgres error message.
export async function fails(promise) {
  try { await promise; } catch (e) { return e.message; }
  throw new Error("expected the statement to fail, but it succeeded");
}
