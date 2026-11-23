-- Logistics Credit Notes — upload engine
-- ======================================
-- One engine for all four CN uploads, driven by a row in cn_upload_types per upload. The
-- database is the source of truth for every check; the browser only reads the file and
-- finds its header row.
--
--   cn_create_batch(type, file, headers)  match headers to the type's columns; a missing
--                                         required column fails here, before any row is sent
--   cn_stage_rows(batch, rows)            store a chunk of rows (≤ 5,000) and run every
--                                         ROW-level check on it: required, numbers, months,
--                                         enums, masters, per-row warnings
--   cn_validate_batch(batch)              the CROSS-row checks over the whole file: in-file
--                                         duplicates, scopes, blocked scopes, rows each scope
--                                         will replace, invoice value vs the bill ledger
--   cn_commit_batch(batch, token)         one transaction: confirm nothing changed since the
--                                         preview, archive the active rows of every unblocked
--                                         scope, insert the file's valid rows
--   cn_rollback_batch(batch)              undo a committed batch, unless a later batch has
--                                         replaced one of its scopes since
--   cn_discard_batch(batch)               drop a batch that was previewed but not saved
--
-- Row checks run per chunk and cross-row checks once, so no single call has to work through
-- a 50k-row file inside the 8 s statement_timeout of the `authenticated` role.
--
-- A scope is always month + partner (courier / transporter / 3PL partner). If ANY row of a
-- scope has an error the whole scope is blocked. A row whose month or partner could not be
-- read blocks every scope it might belong to: an unreadable month blocks all of that
-- partner's scopes in the file, an unknown partner all of that month's.

-- ── Config ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cn_upload_types (
  code            TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  sort            INT NOT NULL DEFAULT 0,
  template_file   TEXT NOT NULL,
  target_table    TEXT NOT NULL,      -- cn_weight_dispute, …
  partner_col     TEXT NOT NULL,      -- scope = month + this column
  partner_table   TEXT NOT NULL,      -- master the partner column points at (has ledger_names)
  partner_label   TEXT NOT NULL,      -- "Courier", "Transporter", "3PL Partner"
  ledger_category TEXT,               -- logistics_invoice_totals.category for the invoice check; NULL = no check
  unique_cols     TEXT[] NOT NULL,    -- the type's unique key, as parsed keys
  unique_label    TEXT NOT NULL,
  insert_cols     TEXT[] NOT NULL,    -- target columns filled from the parsed row
  row_fn          TEXT NOT NULL,      -- type-specific row checks: fn(batch_id, from_row, to_row)
  cross_fn        TEXT,               -- type-specific cross-row checks: fn(batch_id)
  -- [{key, label, type: month|amount|text|code|enum, required, enum: [...], aliases: [...],
  --   example, hint}] in template order
  columns         JSONB NOT NULL
);

-- ── Staging additions ────────────────────────────────────────────────────────

ALTER TABLE public.cn_upload_batches
  ADD COLUMN IF NOT EXISTS headers       TEXT[] NOT NULL DEFAULT '{}',   -- header row as uploaded
  ADD COLUMN IF NOT EXISTS header_map    JSONB NOT NULL DEFAULT '{}',    -- column key -> index into headers
  ADD COLUMN IF NOT EXISTS warning_rows  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validated_at  TIMESTAMPTZ,
  -- Fingerprint of the preview (scopes, statuses, row counts). Commit re-validates and
  -- refuses if it no longer matches what the user confirmed.
  ADD COLUMN IF NOT EXISTS preview_token TEXT;

-- Row checks write errors/warnings; cross-row checks write x_errors/x_warnings, which are
-- recomputed on every validation.
ALTER TABLE public.cn_staging_rows
  ADD COLUMN IF NOT EXISTS x_errors    TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS x_warnings  TEXT[] NOT NULL DEFAULT '{}',
  -- Set on a row that is fine itself but sits in a blocked scope, so it won't be saved.
  ADD COLUMN IF NOT EXISTS blocked_note TEXT,
  ADD COLUMN IF NOT EXISTS has_error   BOOLEAN GENERATED ALWAYS AS (errors <> '{}' OR x_errors <> '{}') STORED,
  ADD COLUMN IF NOT EXISTS has_warning BOOLEAN GENERATED ALWAYS AS (warnings <> '{}' OR x_warnings <> '{}') STORED;

CREATE TABLE IF NOT EXISTS public.cn_batch_scopes (
  batch_id      BIGINT NOT NULL REFERENCES public.cn_upload_batches(id) ON DELETE CASCADE,
  scope_key     TEXT NOT NULL,                    -- 'YYYY-MM-01|<partner id>'
  vals          JSONB NOT NULL,                   -- {"month": …, "<partner_col>": …}
  label         TEXT,                             -- 'Apr-2026 / Delhivery'
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'replace', 'blocked')),
  sort_rank     SMALLINT NOT NULL DEFAULT 2,       -- 0 blocked, 1 replace, 2 new: preview order
  existing_rows INT NOT NULL DEFAULT 0,           -- active rows the commit will archive
  new_rows      INT NOT NULL DEFAULT 0,           -- valid rows the commit will insert
  error_rows    INT NOT NULL DEFAULT 0,
  blocked_by    INT[] NOT NULL DEFAULT '{}',      -- first rows whose errors block it
  warnings      TEXT[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (batch_id, scope_key)
);

CREATE INDEX IF NOT EXISTS cn_batch_scopes_order ON public.cn_batch_scopes (batch_id, sort_rank, label);

-- ── Parsing ──────────────────────────────────────────────────────────────────

-- Header matching: case, punctuation and spacing ignored, and a trailing "optional" /
-- "required" / "mandatory" (the template marks optional columns) dropped.
CREATE OR REPLACE FUNCTION public.cn_norm_header(h text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(btrim(regexp_replace(lower(coalesce(h, '')), '[^a-z0-9]+', ' ', 'g')),
                        '\s+(optional|required|mandatory)$', '')
$$;

-- Amounts: ₹, "Rs", "INR", commas and spaces stripped; "(100)" is -100. NULL when blank or
-- not a number — the caller tells the two apart by whether a value was given.
CREATE OR REPLACE FUNCTION public.cn_parse_amount(v text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE s text;
BEGIN
  IF v IS NULL OR btrim(v) = '' THEN RETURN NULL; END IF;
  s := regexp_replace(v, '(₹|inr|rs\.?|,|\s)', '', 'gi');
  IF s ~ '^\(.*\)$' THEN s := '-' || substr(s, 2, length(s) - 2); END IF;
  IF s ~ '^[-+]?([0-9]+\.?[0-9]*|\.[0-9]+)$' THEN RETURN s::numeric; END IF;
  RETURN NULL;
END $$;

-- Months, normalised to the first of the month. Accepts:
--   2026-04, 2026/04, 2026-04-15 (and the ISO dates the browser sends for Excel date cells)
--   04/2026, 4-2026            month / year
--   15/04/2026, 15-04-2026     day / month / year (Indian order)
--   Apr-2026, April 2026, Apr-26, Sept 2026
--   46113                      an Excel date serial
-- NULL when it is none of these.
CREATE OR REPLACE FUNCTION public.cn_parse_month(v text)
RETURNS date LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE s text := btrim(coalesce(v, '')); m text[]; y int; mo int; pos int;
BEGIN
  IF s = '' THEN RETURN NULL; END IF;
  IF s ~ '^[0-9]{5}(\.[0-9]+)?$' THEN
    RETURN date_trunc('month', DATE '1899-12-30' + floor(s::numeric)::int)::date;
  END IF;
  m := regexp_match(s, '^([0-9]{4})[-/.]([0-9]{1,2})([-/.][0-9]{1,2})?$');
  IF m IS NOT NULL THEN y := m[1]::int; mo := m[2]::int;
  ELSE
    m := regexp_match(s, '^([0-9]{1,2})[-/.]([0-9]{4})$');
    IF m IS NOT NULL THEN mo := m[1]::int; y := m[2]::int;
    ELSE
      m := regexp_match(s, '^([0-9]{1,2})[-/.]([0-9]{1,2})[-/.]([0-9]{4})$');
      IF m IS NOT NULL THEN mo := m[2]::int; y := m[3]::int;
      ELSE
        m := regexp_match(lower(s), '^([a-z]{3,9})[\s\-/.'']*([0-9]{2}|[0-9]{4})$');
        IF m IS NULL THEN RETURN NULL; END IF;
        pos := position(left(m[1], 3) IN 'janfebmaraprmayjunjulaugsepoctnovdec');
        IF pos = 0 OR pos % 3 <> 1 THEN RETURN NULL; END IF;
        -- The full word must be a prefix of the month's name ("sept", "april"), not "marx".
        IF position(m[1] IN (ARRAY['january','february','march','april','may','june','july',
                                   'august','september','october','november','december'])[(pos + 2) / 3]) <> 1
           AND NOT (m[1] = 'sept') THEN RETURN NULL; END IF;
        mo := (pos + 2) / 3;
        y := CASE WHEN length(m[2]) = 2 THEN 2000 + m[2]::int ELSE m[2]::int END;
      END IF;
    END IF;
  END IF;
  IF mo NOT BETWEEN 1 AND 12 OR y NOT BETWEEN 2000 AND 2099 THEN RETURN NULL; END IF;
  RETURN make_date(y, mo, 1);
END $$;

CREATE OR REPLACE FUNCTION public.cn_month_label(d date)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT to_char(d, 'Mon-YYYY') $$;

-- ── Batch access ─────────────────────────────────────────────────────────────

-- The batch, if the caller may act on it. Staged batches belong to their uploader (and
-- managers); `need` is the status the action requires.
CREATE OR REPLACE FUNCTION public.cn_batch_for_caller(p_batch_id bigint, need text)
RETURNS public.cn_upload_batches LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.cn_upload_batches;
BEGIN
  IF NOT public.cn_can_upload() THEN
    RAISE EXCEPTION 'You don''t have access to credit-note uploads.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO b FROM public.cn_upload_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Upload batch #% does not exist.', p_batch_id; END IF;
  IF need = 'staged' AND b.uploaded_by IS DISTINCT FROM auth.uid() AND NOT public.cn_can_manage() THEN
    RAISE EXCEPTION 'Batch #% was uploaded by someone else.', p_batch_id USING ERRCODE = '42501';
  END IF;
  IF b.status <> need THEN
    RAISE EXCEPTION 'Batch #% is %, not %.', p_batch_id, replace(b.status, '_', ' '), replace(need, '_', ' ');
  END IF;
  RETURN b;
END $$;

-- ── cn_create_batch ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cn_create_batch(p_type text, p_file_name text, p_headers text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.cn_upload_types; col jsonb; names text[]; hits int[];
  map jsonb := '{}'; missing text[] := '{}'; dupes text[] := '{}'; ignored text[]; id bigint;
BEGIN
  IF NOT public.cn_can_upload() THEN
    RAISE EXCEPTION 'You don''t have access to credit-note uploads.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO t FROM public.cn_upload_types WHERE code = p_type;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown upload type "%".', p_type; END IF;

  FOR col IN SELECT c FROM jsonb_array_elements(t.columns) c LOOP
    names := ARRAY(SELECT public.cn_norm_header(x) FROM (
               SELECT col->>'label' AS x UNION ALL SELECT jsonb_array_elements_text(COALESCE(col->'aliases', '[]'))) n);
    -- 0-based positions of the headers that match this column
    hits := ARRAY(SELECT (o - 1)::int FROM unnest(p_headers) WITH ORDINALITY AS u(h, o)
                   WHERE btrim(coalesce(h, '')) <> '' AND public.cn_norm_header(h) = ANY(names));
    IF cardinality(hits) > 1 THEN
      dupes := dupes || format('%s (%s)', col->>'label', (SELECT string_agg(p_headers[i + 1], ', ') FROM unnest(hits) i));
    ELSIF cardinality(hits) = 1 THEN map := map || jsonb_build_object(col->>'key', hits[1]);
    ELSIF (col->>'required')::boolean THEN missing := missing || (col->>'label');
    END IF;
  END LOOP;

  IF cardinality(dupes) > 0 THEN
    RAISE EXCEPTION 'More than one column matches: %. Keep one of each.', array_to_string(dupes, '; ');
  END IF;
  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION 'Missing required column(s): %. Use the template''s header row.', array_to_string(missing, ', ');
  END IF;
  -- Headers that matched no column; reported, not an error.
  ignored := ARRAY(SELECT h FROM unnest(p_headers) WITH ORDINALITY AS u(h, o)
                    WHERE btrim(coalesce(h, '')) <> ''
                      AND (o - 1) NOT IN (SELECT value::int FROM jsonb_each_text(map)));

  INSERT INTO public.cn_upload_batches (upload_type, file_name, headers, header_map)
  VALUES (p_type, p_file_name, p_headers, map) RETURNING cn_upload_batches.id INTO id;
  RETURN jsonb_build_object('batch_id', id, 'header_map', map, 'ignored', to_jsonb(ignored));
END $$;

-- ── cn_stage_rows ────────────────────────────────────────────────────────────
-- Defined in 007_cn_fixes.sql (a cell holding only a dash counts as blank).

-- ── cn_validate_batch ────────────────────────────────────────────────────────
-- Defined in 009_cn_lost_damage_by_month.sql.

-- ── cn_commit_batch ──────────────────────────────────────────────────────────
-- Defined in 004_cn_background_commit.sql (commits in place, or queues a large file for the
-- background worker).

-- ── cn_rollback_batch ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cn_rollback_batch(p_batch_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.cn_upload_batches; t public.cn_upload_types; later text; n_off int; n_on int;
BEGIN
  IF NOT public.cn_can_manage() THEN
    RAISE EXCEPTION 'Rolling back an upload needs Documents → Credit notes: manage.' USING ERRCODE = '42501';
  END IF;
  b := public.cn_batch_for_caller(p_batch_id, 'committed');
  PERFORM 1 FROM public.cn_upload_batches WHERE id = p_batch_id FOR UPDATE;
  SELECT * INTO t FROM public.cn_upload_types WHERE code = b.upload_type;
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE', t.target_table);

  SELECT string_agg(DISTINCT format('#%s (%s)', l.id, ls.label), ', ') INTO later
    FROM public.cn_batch_scopes mine
    JOIN public.cn_batch_scopes ls ON ls.scope_key = mine.scope_key AND ls.status <> 'blocked' AND ls.batch_id <> mine.batch_id
    JOIN public.cn_upload_batches l ON l.id = ls.batch_id AND l.status = 'committed'
                                   AND l.upload_type = b.upload_type AND l.committed_at > b.committed_at
   WHERE mine.batch_id = p_batch_id AND mine.status <> 'blocked';
  IF later IS NOT NULL THEN
    RAISE EXCEPTION 'Can''t roll back batch #%: later upload(s) % have replaced the same data since. Roll those back first.', p_batch_id, later;
  END IF;

  EXECUTE format('UPDATE public.%I SET is_active = false WHERE batch_id = $1 AND is_active', t.target_table) USING p_batch_id;
  GET DIAGNOSTICS n_off = ROW_COUNT;
  EXECUTE format('UPDATE public.%I SET is_active = true, replaced_by_batch_id = NULL, replaced_at = NULL
                   WHERE replaced_by_batch_id = $1 AND deleted_at IS NULL', t.target_table) USING p_batch_id;
  GET DIAGNOSTICS n_on = ROW_COUNT;

  UPDATE public.cn_upload_batches SET status = 'rolled_back', rolled_back_at = now(), rolled_back_by = auth.uid()
   WHERE id = p_batch_id;
  RETURN jsonb_build_object('batch_id', p_batch_id, 'deactivated_rows', n_off, 'restored_rows', n_on);
END $$;

-- ── cn_discard_batch ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cn_discard_batch(p_batch_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.cn_batch_for_caller(p_batch_id, 'staged');
  DELETE FROM public.cn_staging_rows WHERE batch_id = p_batch_id;
  DELETE FROM public.cn_batch_scopes WHERE batch_id = p_batch_id;
  UPDATE public.cn_upload_batches SET status = 'discarded' WHERE id = p_batch_id;
END $$;

-- ── Weight Dispute ───────────────────────────────────────────────────────────

-- Row checks (cn_rows_weight_dispute) are in 005_cn_more_upload_types.sql, with the
-- courier/account lookup the other courier uploads share.

-- A courier-level row (no account) next to account rows for the same month + courier may
-- count the same money twice.
CREATE OR REPLACE FUNCTION public.cn_cross_weight_dispute(p_batch_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.cn_staging_rows s
     SET x_warnings = s.x_warnings || format(
           '%s / %s has a courier-level row (no account) and account rows in this file — check they don''t double count',
           public.cn_month_label((s.parsed->>'month')::date), c.name)
    FROM public.cn_couriers c
   WHERE s.batch_id = p_batch_id AND NOT s.has_error AND c.id = (s.parsed->>'courier_id')::bigint
     AND s.scope_key IN (
       SELECT scope_key FROM public.cn_staging_rows
        WHERE batch_id = p_batch_id AND scope_key IS NOT NULL AND NOT has_error
        GROUP BY scope_key
       HAVING bool_or(parsed->>'courier_account_id' IS NULL) AND bool_or(parsed->>'courier_account_id' IS NOT NULL));
END $$;

INSERT INTO public.cn_upload_types
  (code, label, sort, template_file, target_table, partner_col, partner_table, partner_label, ledger_category,
   unique_cols, unique_label, insert_cols, row_fn, cross_fn, columns)
VALUES (
  'weight_dispute', 'Weight Dispute CN', 1, 'weight_dispute_cn_template.xlsx',
  'cn_weight_dispute', 'courier_id', 'cn_couriers', 'Courier', 'B2C',
  ARRAY['month', 'courier_id', 'courier_account_id'], 'Month + Courier + Courier Account',
  ARRAY['month', 'courier_id', 'courier_account_id', 'invoice_value', 'expected_cn', 'received_cn'],
  'cn_rows_weight_dispute', 'cn_cross_weight_dispute',
  '[
    {"key": "month", "label": "Month", "type": "month", "required": true, "example": "Apr-2026",
     "hint": "Invoice month: Apr-2026, 04/2026 or 2026-04"},
    {"key": "courier", "label": "Courier", "type": "text", "required": true, "example": "Delhivery",
     "hint": "As named in Masters → Couriers"},
    {"key": "courier_account", "label": "Courier Account", "type": "text", "required": false, "aliases": ["Account"],
     "example": "Delhivery Surface",
     "hint": "Optional. Must belong to the Courier. Leave blank for a courier-level row"},
    {"key": "invoice_value", "label": "Total Invoice Value (ex GST)", "type": "amount", "required": true,
     "aliases": ["Invoice Value", "Total Invoice Value", "Total Invoice"], "example": "1250000",
     "hint": "INR, ex-GST"},
    {"key": "expected_cn", "label": "Total Expected CN (ex GST)", "type": "amount", "required": true,
     "aliases": ["Expected CN", "Total Expected CN", "Raised CN"], "example": "45000", "hint": "INR, ex-GST"},
    {"key": "received_cn", "label": "Total Received CN (ex GST)", "type": "amount", "required": true,
     "aliases": ["Received CN", "Total Received CN"], "example": "30000", "hint": "INR, ex-GST; 0 if nothing received yet"}
  ]'::jsonb)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label, sort = EXCLUDED.sort, template_file = EXCLUDED.template_file, target_table = EXCLUDED.target_table,
  partner_col = EXCLUDED.partner_col, partner_table = EXCLUDED.partner_table, partner_label = EXCLUDED.partner_label,
  ledger_category = EXCLUDED.ledger_category, unique_cols = EXCLUDED.unique_cols, unique_label = EXCLUDED.unique_label,
  insert_cols = EXCLUDED.insert_cols, row_fn = EXCLUDED.row_fn, cross_fn = EXCLUDED.cross_fn, columns = EXCLUDED.columns;

-- ── Grants and RLS ───────────────────────────────────────────────────────────

ALTER TABLE public.cn_upload_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cn_batch_scopes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cn_read ON public.cn_upload_types;
CREATE POLICY cn_read ON public.cn_upload_types FOR SELECT USING (public.cn_can_upload());
DROP POLICY IF EXISTS cn_read ON public.cn_batch_scopes;
CREATE POLICY cn_read ON public.cn_batch_scopes FOR SELECT USING (public.cn_can_upload());
GRANT SELECT ON public.cn_upload_types, public.cn_batch_scopes TO authenticated;

REVOKE EXECUTE ON FUNCTION
  public.cn_batch_for_caller(bigint, text),
  public.cn_cross_weight_dispute(bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION
  public.cn_create_batch(text, text, text[]),
  public.cn_rollback_batch(bigint), public.cn_discard_batch(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.cn_create_batch(text, text, text[]),
  public.cn_rollback_batch(bigint), public.cn_discard_batch(bigint)
  TO authenticated;
