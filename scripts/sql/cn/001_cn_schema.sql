-- Logistics Credit Notes — schema
-- ===============================
-- Backs Documents → Logistics Credit Notes (src/cn/). Four uploads, each REPLACING the
-- data for the scopes it contains rather than upserting row by row:
--
--   upload            one row per                          replace scope
--   weight_dispute    month × courier × courier account    month + courier
--   lost_damage       AWB × reason                         month + courier
--   ftl_ptl           month × transporter                  month + transporter
--   3pl               month × 3PL partner × facility       month + 3PL partner
--
-- Replaced rows are archived, never deleted: is_active = false, replaced_by_batch_id and
-- replaced_at say which upload superseded them, so a batch can be rolled back. Every read
-- (views, listings, exports, dashboards) is of active rows only, and the unique keys are
-- partial indexes WHERE is_active so archived history never conflicts with current data.
--
-- Month is the INVOICE month, stored as the first of that month. Amounts are INR ex-GST,
-- NUMERIC(14,2).
--
-- Staging, validation, commit and rollback functions are added by 002_cn_upload_engine.sql.
-- Supabase specifics (auth.uid(), auth.role(), the anon/authenticated roles, user_profiles,
-- user_permissions, is_admin_user()) are expected to exist; tests stub them.

-- ── Access ───────────────────────────────────────────────────────────────────

-- View and upload: anyone who can open Documents.
CREATE OR REPLACE FUNCTION public.cn_can_upload()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin_user(auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_permissions
                WHERE user_id = auth.uid() AND tab IN ('documents', 'documents:cn-manage'))
  );
$$;

-- Manage masters, edit or delete rows, roll back batches: admins and documents:cn-manage.
CREATE OR REPLACE FUNCTION public.cn_can_manage()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin_user(auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_permissions
                WHERE user_id = auth.uid() AND tab = 'documents:cn-manage')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.cn_can_upload(), public.cn_can_manage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cn_can_upload(), public.cn_can_manage() TO authenticated;

-- How names are matched: case-insensitive, trimmed, inner runs of spaces collapsed.
-- "  Delhivery   NDD " and "delhivery ndd" are the same name.
CREATE OR REPLACE FUNCTION public.cn_name_key(v text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT regexp_replace(lower(btrim(v)), '\s+', ' ', 'g') $$;

-- updated_at / updated_by on every write.
CREATE OR REPLACE FUNCTION public.cn_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END $$;

-- ── Settings ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cn_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID
);

INSERT INTO public.cn_settings (key, value, description) VALUES
  ('invoice_variance_pct', '5',  'Warn when an uploaded Invoice Value differs from the bill ledger total for the same month and partner by more than this %'),
  ('past_month_warn',      '12', 'Warn when a row''s month is more than this many months before the current month')
ON CONFLICT (key) DO NOTHING;

-- ── Masters ──────────────────────────────────────────────────────────────────
-- Uploads match names against these; an unknown name is a row error. ledger_names /
-- ledger_keys record which raw names in the bill ledgers each entry stands for, so the
-- invoice-value check can find the ledger total for a master partner.
-- Deactivate (is_active = false) rather than delete an entry that data rows reference.

CREATE TABLE IF NOT EXISTS public.cn_couriers (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT NOT NULL CHECK (btrim(name) <> ''),
  name_key     TEXT GENERATED ALWAYS AS (public.cn_name_key(name)) STORED,
  ledger_names TEXT[] NOT NULL DEFAULT '{}',   -- logistics_invoices_b2c.courier_name values
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID,
  CONSTRAINT cn_couriers_name_key UNIQUE (name_key)
);

-- A named sub-account under one courier ("Bluedart Air", "Delhivery NDD"). It may share its
-- courier's name. Names are unique within a courier, not across couriers.
CREATE TABLE IF NOT EXISTS public.cn_courier_accounts (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  courier_id  BIGINT NOT NULL REFERENCES public.cn_couriers(id),
  name        TEXT NOT NULL CHECK (btrim(name) <> ''),
  name_key    TEXT GENERATED ALWAYS AS (public.cn_name_key(name)) STORED,
  -- [{"courier": "Bluedart", "account_type": "Air"}, …] — ledger courier_name +
  -- courier_account_type pairs this account covers.
  ledger_keys JSONB NOT NULL DEFAULT '[]',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID,
  CONSTRAINT cn_courier_accounts_name_key UNIQUE (courier_id, name_key),
  -- Target of the (courier_id, courier_account_id) foreign keys below, which make an
  -- account under the wrong courier impossible to store.
  CONSTRAINT cn_courier_accounts_courier_id_id UNIQUE (courier_id, id)
);

CREATE TABLE IF NOT EXISTS public.cn_transporters (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT NOT NULL CHECK (btrim(name) <> ''),
  name_key     TEXT GENERATED ALWAYS AS (public.cn_name_key(name)) STORED,
  ledger_names TEXT[] NOT NULL DEFAULT '{}',   -- logistics_invoices_b2b.transporter_name / logistics_fixed_vehicles.transport_name
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID,
  CONSTRAINT cn_transporters_name_key UNIQUE (name_key)
);

CREATE TABLE IF NOT EXISTS public.cn_3pl_partners (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT NOT NULL CHECK (btrim(name) <> ''),
  name_key     TEXT GENERATED ALWAYS AS (public.cn_name_key(name)) STORED,
  ledger_names TEXT[] NOT NULL DEFAULT '{}',   -- logistics_costs_3pl.threepl_logistics_name
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID,
  CONSTRAINT cn_3pl_partners_name_key UNIQUE (name_key)
);

CREATE TABLE IF NOT EXISTS public.cn_3pl_facilities (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partner_id   BIGINT NOT NULL REFERENCES public.cn_3pl_partners(id),
  name         TEXT NOT NULL CHECK (btrim(name) <> ''),
  name_key     TEXT GENERATED ALWAYS AS (public.cn_name_key(name)) STORED,
  location     TEXT NOT NULL CHECK (btrim(location) <> ''),
  pincode      TEXT,
  ledger_names TEXT[] NOT NULL DEFAULT '{}',   -- logistics_costs_3pl.facility_name
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID,
  CONSTRAINT cn_3pl_facilities_name_key UNIQUE (partner_id, name_key),
  CONSTRAINT cn_3pl_facilities_partner_id_id UNIQUE (partner_id, id)
);

-- ── Upload batches ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cn_upload_batches (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  upload_type    TEXT NOT NULL CHECK (upload_type IN ('weight_dispute', 'lost_damage', 'ftl_ptl', '3pl')),
  file_name      TEXT NOT NULL,
  uploaded_by    UUID NOT NULL DEFAULT auth.uid(),
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- staged → committed → rolled_back, or staged → discarded
  status         TEXT NOT NULL DEFAULT 'staged'
                 CHECK (status IN ('staged', 'committed', 'rolled_back', 'discarded')),
  total_rows     INT NOT NULL DEFAULT 0,   -- data rows in the file
  inserted_rows  INT NOT NULL DEFAULT 0,   -- rows saved as active
  replaced_rows  INT NOT NULL DEFAULT 0,   -- existing active rows archived by this batch
  failed_rows    INT NOT NULL DEFAULT 0,   -- rows not saved (own errors, or in a blocked scope)
  blocked_scopes INT NOT NULL DEFAULT 0,
  committed_at   TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  rolled_back_by UUID
);

CREATE INDEX IF NOT EXISTS cn_upload_batches_type_time
  ON public.cn_upload_batches (upload_type, uploaded_at DESC);

-- The file's rows as uploaded, with the validator's verdict. Kept after commit so a batch
-- can be viewed and its error report re-downloaded.
CREATE TABLE IF NOT EXISTS public.cn_staging_rows (
  batch_id  BIGINT NOT NULL REFERENCES public.cn_upload_batches(id) ON DELETE CASCADE,
  row_no    INT NOT NULL,                       -- spreadsheet row number
  raw       JSONB NOT NULL,                     -- cell values as uploaded, in the batch's header order
  parsed    JSONB,                              -- normalised values and master ids
  scope_key TEXT,                               -- e.g. '2026-04-01|courier:12'
  errors    TEXT[] NOT NULL DEFAULT '{}',
  warnings  TEXT[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (batch_id, row_no)
);

CREATE INDEX IF NOT EXISTS cn_staging_rows_scope ON public.cn_staging_rows (batch_id, scope_key);

-- ── Data tables ──────────────────────────────────────────────────────────────
-- Shared shape: month (first of month), amounts ≥ 0, the batch that inserted the row, and
-- the archive trail. Rows are inserted only by cn_commit_batch(); managers may edit amounts
-- or soft-delete a row (deleted_at), which also takes it out of the active set.

CREATE TABLE IF NOT EXISTS public.cn_weight_dispute (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  month                DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
  courier_id           BIGINT NOT NULL REFERENCES public.cn_couriers(id),
  courier_account_id   BIGINT,                  -- NULL = courier level, no account
  invoice_value        NUMERIC(14,2) NOT NULL CHECK (invoice_value >= 0),
  expected_cn          NUMERIC(14,2) NOT NULL CHECK (expected_cn >= 0),
  received_cn          NUMERIC(14,2) NOT NULL CHECK (received_cn >= 0),
  batch_id             BIGINT NOT NULL REFERENCES public.cn_upload_batches(id),
  source_row_no        INT,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  replaced_by_batch_id BIGINT REFERENCES public.cn_upload_batches(id),
  replaced_at          TIMESTAMPTZ,
  deleted_at           TIMESTAMPTZ,
  deleted_by           UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by           UUID,
  FOREIGN KEY (courier_id, courier_account_id) REFERENCES public.cn_courier_accounts (courier_id, id)
);

-- Blank account counts as a value: two blank-account rows for one month + courier collide.
CREATE UNIQUE INDEX IF NOT EXISTS cn_weight_dispute_active_key
  ON public.cn_weight_dispute (month, courier_id, courier_account_id) NULLS NOT DISTINCT
  WHERE is_active;
CREATE INDEX IF NOT EXISTS cn_weight_dispute_courier_month ON public.cn_weight_dispute (courier_id, month) WHERE is_active;
CREATE INDEX IF NOT EXISTS cn_weight_dispute_batch ON public.cn_weight_dispute (batch_id);
CREATE INDEX IF NOT EXISTS cn_weight_dispute_replaced_by ON public.cn_weight_dispute (replaced_by_batch_id) WHERE replaced_by_batch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cn_lost_damage (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  awb                   TEXT NOT NULL CHECK (awb <> '' AND awb = upper(btrim(awb))),
  month                 DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
  courier_id            BIGINT NOT NULL REFERENCES public.cn_couriers(id),
  courier_account_id    BIGINT,
  reason                TEXT NOT NULL CHECK (reason IN ('Lost/Damage', 'SLA Breach', 'High Ageing', 'Wrong Invoicing')),
  shipment_value        NUMERIC(14,2) NOT NULL CHECK (shipment_value >= 0),
  -- Defaults to shipment_value when the upload leaves it blank; lower when the courier caps
  -- its liability.
  expected_cn           NUMERIC(14,2) NOT NULL CHECK (expected_cn >= 0),
  expected_cn_defaulted BOOLEAN NOT NULL DEFAULT false,
  cn_received_amt       NUMERIC(14,2) CHECK (cn_received_amt >= 0),   -- NULL = CN pending
  cn_number             TEXT,
  batch_id              BIGINT NOT NULL REFERENCES public.cn_upload_batches(id),
  source_row_no         INT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  replaced_by_batch_id  BIGINT REFERENCES public.cn_upload_batches(id),
  replaced_at           TIMESTAMPTZ,
  deleted_at            TIMESTAMPTZ,
  deleted_by            UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            UUID,
  FOREIGN KEY (courier_id, courier_account_id) REFERENCES public.cn_courier_accounts (courier_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS cn_lost_damage_active_key
  ON public.cn_lost_damage (awb, reason) WHERE is_active;
CREATE INDEX IF NOT EXISTS cn_lost_damage_awb ON public.cn_lost_damage (awb);
CREATE INDEX IF NOT EXISTS cn_lost_damage_courier_month ON public.cn_lost_damage (courier_id, month) WHERE is_active;
CREATE INDEX IF NOT EXISTS cn_lost_damage_month ON public.cn_lost_damage (month) WHERE is_active;
CREATE INDEX IF NOT EXISTS cn_lost_damage_batch ON public.cn_lost_damage (batch_id);
CREATE INDEX IF NOT EXISTS cn_lost_damage_replaced_by ON public.cn_lost_damage (replaced_by_batch_id) WHERE replaced_by_batch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cn_ftl_ptl (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  month                DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
  transporter_id       BIGINT NOT NULL REFERENCES public.cn_transporters(id),
  invoice_value        NUMERIC(14,2) NOT NULL CHECK (invoice_value >= 0),
  expected_cn          NUMERIC(14,2) NOT NULL CHECK (expected_cn >= 0),
  received_cn          NUMERIC(14,2) NOT NULL CHECK (received_cn >= 0),
  batch_id             BIGINT NOT NULL REFERENCES public.cn_upload_batches(id),
  source_row_no        INT,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  replaced_by_batch_id BIGINT REFERENCES public.cn_upload_batches(id),
  replaced_at          TIMESTAMPTZ,
  deleted_at           TIMESTAMPTZ,
  deleted_by           UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by           UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS cn_ftl_ptl_active_key
  ON public.cn_ftl_ptl (month, transporter_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS cn_ftl_ptl_transporter_month ON public.cn_ftl_ptl (transporter_id, month) WHERE is_active;
CREATE INDEX IF NOT EXISTS cn_ftl_ptl_batch ON public.cn_ftl_ptl (batch_id);
CREATE INDEX IF NOT EXISTS cn_ftl_ptl_replaced_by ON public.cn_ftl_ptl (replaced_by_batch_id) WHERE replaced_by_batch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cn_3pl (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  month                DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
  partner_id           BIGINT NOT NULL REFERENCES public.cn_3pl_partners(id),
  facility_id          BIGINT NOT NULL,
  invoice_value        NUMERIC(14,2) NOT NULL CHECK (invoice_value >= 0),
  expected_cn          NUMERIC(14,2) NOT NULL CHECK (expected_cn >= 0),
  received_cn          NUMERIC(14,2) NOT NULL CHECK (received_cn >= 0),
  batch_id             BIGINT NOT NULL REFERENCES public.cn_upload_batches(id),
  source_row_no        INT,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  replaced_by_batch_id BIGINT REFERENCES public.cn_upload_batches(id),
  replaced_at          TIMESTAMPTZ,
  deleted_at           TIMESTAMPTZ,
  deleted_by           UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by           UUID,
  FOREIGN KEY (partner_id, facility_id) REFERENCES public.cn_3pl_facilities (partner_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS cn_3pl_active_key
  ON public.cn_3pl (month, partner_id, facility_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS cn_3pl_partner_month ON public.cn_3pl (partner_id, month) WHERE is_active;
CREATE INDEX IF NOT EXISTS cn_3pl_batch ON public.cn_3pl (batch_id);
CREATE INDEX IF NOT EXISTS cn_3pl_replaced_by ON public.cn_3pl (replaced_by_batch_id) WHERE replaced_by_batch_id IS NOT NULL;

-- ── Triggers ─────────────────────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cn_couriers', 'cn_courier_accounts', 'cn_transporters', 'cn_3pl_partners',
                           'cn_3pl_facilities', 'cn_weight_dispute', 'cn_lost_damage', 'cn_ftl_ptl', 'cn_3pl']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_touch', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.cn_touch()', t || '_touch', t);
  END LOOP;
END $$;

-- ── Views: active rows, master names, derived values ────────────────────────
-- security_invoker so the caller's RLS applies. Recovery % is NULL when nothing is expected.

CREATE OR REPLACE VIEW public.cn_weight_dispute_v WITH (security_invoker = true) AS
SELECT d.id, d.month, d.courier_id, c.name AS courier, d.courier_account_id, a.name AS courier_account,
       d.invoice_value, d.expected_cn, d.received_cn,
       d.expected_cn - d.received_cn AS pending_cn,
       CASE WHEN d.expected_cn > 0 THEN round(d.received_cn / d.expected_cn * 100, 2) END AS recovery_pct,
       d.batch_id, d.source_row_no, d.created_at, d.updated_at, d.updated_by
  FROM public.cn_weight_dispute d
  JOIN public.cn_couriers c ON c.id = d.courier_id
  LEFT JOIN public.cn_courier_accounts a ON a.id = d.courier_account_id
 WHERE d.is_active;

CREATE OR REPLACE VIEW public.cn_lost_damage_v WITH (security_invoker = true) AS
SELECT d.id, d.awb, d.month, d.courier_id, c.name AS courier, d.courier_account_id, a.name AS courier_account,
       d.reason, d.shipment_value, d.expected_cn, d.expected_cn_defaulted, d.cn_received_amt, d.cn_number,
       d.expected_cn - COALESCE(d.cn_received_amt, 0) AS pending_cn,
       CASE WHEN d.expected_cn > 0 THEN round(COALESCE(d.cn_received_amt, 0) / d.expected_cn * 100, 2) END AS recovery_pct,
       d.batch_id, d.source_row_no, d.created_at, d.updated_at, d.updated_by
  FROM public.cn_lost_damage d
  JOIN public.cn_couriers c ON c.id = d.courier_id
  LEFT JOIN public.cn_courier_accounts a ON a.id = d.courier_account_id
 WHERE d.is_active;

CREATE OR REPLACE VIEW public.cn_ftl_ptl_v WITH (security_invoker = true) AS
SELECT d.id, d.month, d.transporter_id, t.name AS transporter,
       d.invoice_value, d.expected_cn, d.received_cn,
       d.expected_cn - d.received_cn AS pending_cn,
       CASE WHEN d.expected_cn > 0 THEN round(d.received_cn / d.expected_cn * 100, 2) END AS recovery_pct,
       d.batch_id, d.source_row_no, d.created_at, d.updated_at, d.updated_by
  FROM public.cn_ftl_ptl d
  JOIN public.cn_transporters t ON t.id = d.transporter_id
 WHERE d.is_active;

CREATE OR REPLACE VIEW public.cn_3pl_v WITH (security_invoker = true) AS
SELECT d.id, d.month, d.partner_id, p.name AS partner, d.facility_id, f.name AS facility, f.location,
       d.invoice_value, d.expected_cn, d.received_cn,
       d.expected_cn - d.received_cn AS pending_cn,
       CASE WHEN d.expected_cn > 0 THEN round(d.received_cn / d.expected_cn * 100, 2) END AS recovery_pct,
       d.batch_id, d.source_row_no, d.created_at, d.updated_at, d.updated_by
  FROM public.cn_3pl d
  JOIN public.cn_3pl_partners p ON p.id = d.partner_id
  JOIN public.cn_3pl_facilities f ON f.id = d.facility_id
 WHERE d.is_active;

-- ── Grants and row-level security ────────────────────────────────────────────

GRANT SELECT ON public.cn_settings, public.cn_upload_batches, public.cn_staging_rows,
                public.cn_weight_dispute_v, public.cn_lost_damage_v, public.cn_ftl_ptl_v, public.cn_3pl_v
  TO authenticated;
GRANT UPDATE (value) ON public.cn_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cn_couriers, public.cn_courier_accounts, public.cn_transporters,
                                        public.cn_3pl_partners, public.cn_3pl_facilities
  TO authenticated;
-- Data rows: read, and update for managers (amount edits, soft delete). Inserts and archiving
-- happen only inside the SECURITY DEFINER engine functions.
GRANT SELECT, UPDATE ON public.cn_weight_dispute, public.cn_lost_damage, public.cn_ftl_ptl, public.cn_3pl
  TO authenticated;

DO $$
DECLARE t text;
BEGIN
  -- Masters: everyone who can upload reads; managers write.
  FOREACH t IN ARRAY ARRAY['cn_couriers', 'cn_courier_accounts', 'cn_transporters', 'cn_3pl_partners', 'cn_3pl_facilities']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS cn_read ON public.%I', t);
    EXECUTE format('CREATE POLICY cn_read ON public.%I FOR SELECT USING (public.cn_can_upload())', t);
    EXECUTE format('DROP POLICY IF EXISTS cn_insert ON public.%I', t);
    EXECUTE format('CREATE POLICY cn_insert ON public.%I FOR INSERT WITH CHECK (public.cn_can_manage())', t);
    EXECUTE format('DROP POLICY IF EXISTS cn_update ON public.%I', t);
    EXECUTE format('CREATE POLICY cn_update ON public.%I FOR UPDATE USING (public.cn_can_manage()) WITH CHECK (public.cn_can_manage())', t);
    EXECUTE format('DROP POLICY IF EXISTS cn_delete ON public.%I', t);
    EXECUTE format('CREATE POLICY cn_delete ON public.%I FOR DELETE USING (public.cn_can_manage())', t);
  END LOOP;

  -- Data tables: everyone who can upload reads; managers update. No insert/delete policy.
  FOREACH t IN ARRAY ARRAY['cn_weight_dispute', 'cn_lost_damage', 'cn_ftl_ptl', 'cn_3pl']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS cn_read ON public.%I', t);
    EXECUTE format('CREATE POLICY cn_read ON public.%I FOR SELECT USING (public.cn_can_upload())', t);
    EXECUTE format('DROP POLICY IF EXISTS cn_update ON public.%I', t);
    EXECUTE format('CREATE POLICY cn_update ON public.%I FOR UPDATE USING (public.cn_can_manage()) WITH CHECK (public.cn_can_manage())', t);
  END LOOP;

  -- Batches, staging, settings: read for uploaders; writes through engine functions only
  -- (settings: managers may change a value).
  FOREACH t IN ARRAY ARRAY['cn_upload_batches', 'cn_staging_rows', 'cn_settings']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS cn_read ON public.%I', t);
    EXECUTE format('CREATE POLICY cn_read ON public.%I FOR SELECT USING (public.cn_can_upload())', t);
  END LOOP;
  DROP POLICY IF EXISTS cn_update ON public.cn_settings;
  CREATE POLICY cn_update ON public.cn_settings FOR UPDATE USING (public.cn_can_manage()) WITH CHECK (public.cn_can_manage());
END $$;
