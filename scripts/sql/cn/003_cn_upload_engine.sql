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

-- p_rows: [[<spreadsheet row number>, <cell>, <cell>, …], …] with cells in the batch's header
-- order. Arrays rather than objects keyed by header: half the bytes on a slow connection.
CREATE OR REPLACE FUNCTION public.cn_stage_rows(p_batch_id bigint, p_rows jsonb)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.cn_upload_batches; t public.cn_upload_types; n int; lo int; hi int;
  cur_month date := date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date;
  warn_months int := COALESCE((SELECT (value #>> '{}')::int FROM public.cn_settings WHERE key = 'past_month_warn'), 12);
BEGIN
  b := public.cn_batch_for_caller(p_batch_id, 'staged');
  SELECT * INTO t FROM public.cn_upload_types WHERE code = b.upload_type;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'rows must be a JSON array'; END IF;
  n := jsonb_array_length(p_rows);
  IF n = 0 THEN RETURN 0; END IF;
  IF n > 5000 THEN RAISE EXCEPTION 'Send at most 5,000 rows per call (got %).', n; END IF;
  IF (SELECT count(*) FROM public.cn_staging_rows WHERE batch_id = p_batch_id) + n > 100000 THEN
    RAISE EXCEPTION 'A file can have at most 100,000 rows.';
  END IF;

  WITH input AS (
    SELECT (e->>0)::int AS row_no, e - 0 AS raw FROM jsonb_array_elements(p_rows) e
  ),
  cells AS (
    SELECT i.row_no, c.ord, c.col->>'key' AS key, c.col->>'label' AS label, c.col->>'type' AS typ,
           COALESCE((c.col->>'required')::boolean, false) AS req, c.col->'enum' AS enum_vals,
           NULLIF(btrim(i.raw->>((b.header_map->>(c.col->>'key'))::int)), '') AS v
      FROM input i
     CROSS JOIN jsonb_array_elements(t.columns) WITH ORDINALITY AS c(col, ord)
  ),
  parsed AS (
    SELECT row_no, ord, key, label, typ, req, enum_vals, v,
           CASE typ
             WHEN 'month'  THEN to_jsonb(public.cn_parse_month(v))
             WHEN 'amount' THEN to_jsonb(public.cn_parse_amount(v))
             WHEN 'enum'   THEN (SELECT to_jsonb(x) FROM jsonb_array_elements_text(enum_vals) x
                                  WHERE public.cn_name_key(x) = public.cn_name_key(v) LIMIT 1)
             WHEN 'code'   THEN to_jsonb(upper(regexp_replace(v, '\s+', '', 'g')))
             ELSE               to_jsonb(regexp_replace(v, '\s+', ' ', 'g'))
           END AS pv
      FROM cells
  ),
  checked AS (
    SELECT row_no, ord, key, pv,
           CASE
             WHEN v IS NULL THEN CASE WHEN req THEN format('%s is required', label) END
             WHEN pv IS NULL THEN CASE typ
               WHEN 'month'  THEN format('%s "%s" is not a month — use e.g. Apr-2026, 04/2026 or 2026-04', label, v)
               WHEN 'amount' THEN format('%s "%s" is not a number', label, v)
               WHEN 'enum'   THEN format('%s "%s" is not one of: %s', label, v,
                                         (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(enum_vals) x))
             END
             WHEN typ = 'amount' AND (pv #>> '{}')::numeric < 0 THEN format('%s cannot be negative (%s)', label, v)
             WHEN typ = 'amount' AND (pv #>> '{}')::numeric >= 1e12 THEN format('%s is too large (%s)', label, v)
             WHEN typ = 'month' AND (pv #>> '{}')::date > cur_month THEN
               format('%s %s is in the future — the latest allowed is %s', label,
                      public.cn_month_label((pv #>> '{}')::date), public.cn_month_label(cur_month))
           END AS err,
           CASE WHEN typ = 'month' AND pv IS NOT NULL
                 AND (pv #>> '{}')::date < (cur_month - make_interval(months => warn_months))::date
             THEN format('%s %s is more than %s months ago', label, public.cn_month_label((pv #>> '{}')::date), warn_months)
           END AS warn
      FROM parsed
  ),
  agg AS (
    SELECT row_no,
           jsonb_object_agg(key, pv) AS parsed,
           COALESCE(array_agg(err ORDER BY ord) FILTER (WHERE err IS NOT NULL), '{}') AS errs,
           COALESCE(array_agg(warn ORDER BY ord) FILTER (WHERE warn IS NOT NULL), '{}') AS warns
      FROM checked GROUP BY row_no
  )
  INSERT INTO public.cn_staging_rows AS s (batch_id, row_no, raw, parsed, scope_key, errors, warnings, x_errors, x_warnings)
  SELECT p_batch_id, i.row_no, i.raw, a.parsed, NULL, a.errs, a.warns, '{}', '{}'
    FROM input i JOIN agg a USING (row_no)
  ON CONFLICT (batch_id, row_no) DO UPDATE
    SET raw = EXCLUDED.raw, parsed = EXCLUDED.parsed, scope_key = NULL, errors = EXCLUDED.errors,
        warnings = EXCLUDED.warnings, x_errors = '{}', x_warnings = '{}';

  SELECT min((e->>0)::int), max((e->>0)::int) INTO lo, hi FROM jsonb_array_elements(p_rows) e;
  -- Type-specific row checks (masters, warnings) and the scope key.
  EXECUTE format('SELECT public.%I($1, $2, $3)', t.row_fn) USING p_batch_id, lo, hi;

  UPDATE public.cn_upload_batches SET validated_at = NULL, preview_token = NULL WHERE id = p_batch_id;
  RETURN n;
END $$;

-- ── cn_validate_batch ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cn_validate_batch(p_batch_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.cn_upload_batches; t public.cn_upload_types; pct numeric; result jsonb; token text;
BEGIN
  b := public.cn_batch_for_caller(p_batch_id, 'staged');
  SELECT * INTO t FROM public.cn_upload_types WHERE code = b.upload_type;
  pct := COALESCE((SELECT (value #>> '{}')::numeric FROM public.cn_settings WHERE key = 'invoice_variance_pct'), 5);

  UPDATE public.cn_staging_rows SET x_errors = '{}', x_warnings = '{}', blocked_note = NULL
   WHERE batch_id = p_batch_id AND (x_errors <> '{}' OR x_warnings <> '{}' OR blocked_note IS NOT NULL);
  DELETE FROM public.cn_batch_scopes WHERE batch_id = p_batch_id;

  -- In-file duplicates on the unique key, among rows with no errors of their own. A blank
  -- optional part counts as a value: two blank-account rows for one month + courier clash.
  UPDATE public.cn_staging_rows s
     SET x_errors = s.x_errors || format('Duplicate of row %s (same %s)', d.first_row, t.unique_label)
    FROM (SELECT row_no, min(row_no) OVER (PARTITION BY ukey) AS first_row
            FROM (SELECT r.row_no,
                         (SELECT string_agg(COALESCE(r.parsed->>u.c, '∅'), '|' ORDER BY u.o)
                            FROM unnest(t.unique_cols) WITH ORDINALITY AS u(c, o)) AS ukey
                    FROM public.cn_staging_rows r
                   WHERE r.batch_id = p_batch_id AND r.errors = '{}' AND r.scope_key IS NOT NULL) k) d
   WHERE s.batch_id = p_batch_id AND s.row_no = d.row_no AND d.row_no <> d.first_row;

  IF t.cross_fn IS NOT NULL THEN
    EXECUTE format('SELECT public.%I($1)', t.cross_fn) USING p_batch_id;
  END IF;

  -- Scopes, in one set-based pass: rows per scope, the partner's name, the active rows the
  -- scope would replace and the bill-ledger total are each aggregated once and joined, so the
  -- cost stays flat however many scopes a file has.
  EXECUTE format($q$
    INSERT INTO public.cn_batch_scopes
      (batch_id, scope_key, vals, label, status, sort_rank, existing_rows, new_rows, error_rows, blocked_by, warnings)
    WITH s AS (
      SELECT r.scope_key,
             min(r.parsed->>'month')::date AS month,
             min((r.parsed->>%2$L)::bigint) AS partner_id,
             count(*) FILTER (WHERE NOT r.has_error)::int AS new_rows,
             count(*) FILTER (WHERE r.has_error)::int AS error_rows,
             (array_agg(r.row_no ORDER BY r.row_no) FILTER (WHERE r.has_error))[1:10] AS err_rows,
             sum((r.parsed->>'invoice_value')::numeric) FILTER (WHERE NOT r.has_error) AS file_invoice
        FROM public.cn_staging_rows r
       WHERE r.batch_id = $1 AND r.scope_key IS NOT NULL
       GROUP BY r.scope_key
    ),
    existing AS (
      SELECT d.month, d.%2$I AS partner_id, count(*)::int AS n
        FROM public.%1$I d
       WHERE d.is_active AND (d.month, d.%2$I) IN (SELECT month, partner_id FROM s)
       GROUP BY 1, 2
    ),
    ledger AS (
      SELECT p.id AS partner_id, li.month_year, sum(li.amount) AS total
        FROM public.%3$I p
       CROSS JOIN LATERAL unnest(p.ledger_names) AS ln(name)
        JOIN public.logistics_invoice_totals li ON li.category = $2 AND li.partner = ln.name
       WHERE p.id IN (SELECT partner_id FROM s)
       GROUP BY 1, 2
    ),
    j AS (
      SELECT s.*, COALESCE(e.n, 0) AS existing, l.total AS ledger_total,
             public.cn_month_label(s.month) || ' / ' || p.name AS label
        FROM s
        JOIN public.%3$I p ON p.id = s.partner_id
        LEFT JOIN existing e ON e.month = s.month AND e.partner_id = s.partner_id
        LEFT JOIN ledger l ON l.partner_id = s.partner_id AND l.month_year = to_char(s.month, 'YYYY-MM')
    )
    SELECT $1, scope_key, jsonb_build_object('month', month, %2$L, partner_id), label,
           CASE WHEN error_rows > 0 THEN 'blocked' WHEN existing > 0 THEN 'replace' ELSE 'new' END,
           CASE WHEN error_rows > 0 THEN 0 WHEN existing > 0 THEN 1 ELSE 2 END,
           existing, new_rows, error_rows, COALESCE(err_rows, '{}'),
           CASE WHEN $2 IS NULL OR error_rows > 0 THEN '{}'::text[]
                WHEN COALESCE(ledger_total, 0) = 0
                  THEN ARRAY[format('No bill-ledger total for %%s to compare the invoice value against', label)]
                WHEN abs(file_invoice - ledger_total) / ledger_total * 100 > $3
                  THEN ARRAY[format('Invoice value %%s differs from the bill ledger (%%s) by %%s%%%% — over the %%s%%%% threshold',
                                    file_invoice, round(ledger_total, 2), round(abs(file_invoice - ledger_total) / ledger_total * 100, 1), $3)]
                ELSE '{}'::text[] END
      FROM j
  $q$, t.target_table, t.partner_col, t.partner_table)
  USING p_batch_id, t.ledger_category, pct;

  -- A row whose month or partner is unknown could belong to any scope sharing the part that
  -- IS known, so it blocks all of those. Grouped by that known part first, so the comparison
  -- is per pattern, not per row.
  UPDATE public.cn_batch_scopes s
     SET status = 'blocked', sort_rank = 0, warnings = '{}',
         blocked_by = (SELECT array_agg(DISTINCT e ORDER BY e) FROM unnest(s.blocked_by || x.rows) e)
    FROM (SELECT s2.scope_key, (array_agg(p.first_row ORDER BY p.first_row))[1:10] AS rows
            FROM (SELECT r.parsed->>'month' AS month, r.parsed->>t.partner_col AS partner, min(r.row_no) AS first_row
                    FROM public.cn_staging_rows r
                   WHERE r.batch_id = p_batch_id AND r.has_error AND r.scope_key IS NULL
                   GROUP BY 1, 2) p
            JOIN public.cn_batch_scopes s2
              ON s2.batch_id = p_batch_id
             AND (p.month IS NULL OR p.month = s2.vals->>'month')
             AND (p.partner IS NULL OR p.partner = s2.vals->>t.partner_col)
           GROUP BY s2.scope_key) x
   WHERE s.batch_id = p_batch_id AND s.scope_key = x.scope_key;

  -- Rows that are fine but won't be saved because their scope is blocked.
  UPDATE public.cn_staging_rows r
     SET blocked_note = format('Not saved: %s is blocked by errors in row%s %s', s.label,
                               CASE WHEN cardinality(s.blocked_by) > 1 THEN 's' ELSE '' END, array_to_string(s.blocked_by, ', '))
    FROM public.cn_batch_scopes s
   WHERE s.batch_id = p_batch_id AND s.status = 'blocked'
     AND r.batch_id = p_batch_id AND r.scope_key = s.scope_key AND NOT r.has_error;

  SELECT md5(COALESCE(string_agg(scope_key || ':' || status || ':' || existing_rows || ':' || new_rows, ',' ORDER BY scope_key), '')
             || '#' || (SELECT count(*) FROM public.cn_staging_rows WHERE batch_id = p_batch_id))
    INTO token FROM public.cn_batch_scopes WHERE batch_id = p_batch_id;

  WITH r AS (
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE has_error)::int AS error_rows,
           count(*) FILTER (WHERE has_warning)::int AS warning_rows,
           count(*) FILTER (WHERE NOT has_error AND blocked_note IS NULL AND scope_key IS NOT NULL)::int AS to_save
      FROM public.cn_staging_rows
     WHERE batch_id = p_batch_id
  ), sc AS (
    SELECT count(*) FILTER (WHERE status = 'new')::int AS new_scopes,
           count(*) FILTER (WHERE status = 'replace')::int AS replace_scopes,
           count(*) FILTER (WHERE status = 'blocked')::int AS blocked_scopes,
           COALESCE(sum(existing_rows) FILTER (WHERE status <> 'blocked'), 0)::int AS to_replace,
           count(*)::int AS total_scopes,
           count(*) FILTER (WHERE warnings <> '{}')::int AS warning_scopes,
           COALESCE((array_agg(label ORDER BY label) FILTER (WHERE status = 'replace'))[1:5], '{}') AS replace_labels,
           -- The scope list comes inline only for small files; the preview pages through
           -- cn_batch_scopes for large ones (a file can have tens of thousands of scopes).
           CASE WHEN count(*) <= 200 THEN COALESCE(jsonb_agg(jsonb_build_object('scope_key', scope_key, 'label', label, 'status', status,
                     'existing_rows', existing_rows, 'new_rows', new_rows, 'error_rows', error_rows,
                     'blocked_by', blocked_by, 'warnings', warnings) ORDER BY sort_rank, label), '[]') END AS scopes
      FROM public.cn_batch_scopes WHERE batch_id = p_batch_id
  )
  SELECT jsonb_build_object(
           'batch_id', p_batch_id, 'token', token,
           'total_rows', r.total, 'rows_to_save', r.to_save, 'rows_to_replace', sc.to_replace,
           'error_rows', r.error_rows, 'warning_rows', r.warning_rows, 'failed_rows', r.total - r.to_save,
           'new_scopes', sc.new_scopes, 'replace_scopes', sc.replace_scopes, 'blocked_scopes', sc.blocked_scopes,
           'total_scopes', sc.total_scopes, 'warning_scopes', sc.warning_scopes, 'replace_labels', to_jsonb(sc.replace_labels),
           'scopes', sc.scopes)
    INTO result FROM r, sc;

  UPDATE public.cn_upload_batches
     SET total_rows = (result->>'total_rows')::int, failed_rows = (result->>'failed_rows')::int,
         warning_rows = (result->>'warning_rows')::int, blocked_scopes = (result->>'blocked_scopes')::int,
         validated_at = now(), preview_token = token
   WHERE id = p_batch_id;
  RETURN result;
END $$;

-- ── cn_commit_batch ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cn_commit_batch(p_batch_id bigint, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.cn_upload_batches; t public.cn_upload_types; n_replaced int; n_inserted int; cols text; vcols text; changed int;
BEGIN
  b := public.cn_batch_for_caller(p_batch_id, 'staged');
  PERFORM 1 FROM public.cn_upload_batches WHERE id = p_batch_id FOR UPDATE;
  SELECT * INTO t FROM public.cn_upload_types WHERE code = b.upload_type;

  -- One commit per upload type at a time; reads are not blocked.
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE', t.target_table);

  -- The user must have confirmed the CURRENT preview: staging more rows clears it.
  IF b.validated_at IS NULL OR b.preview_token IS DISTINCT FROM p_token THEN
    RAISE EXCEPTION 'This file has changed since it was previewed. Review the preview again before saving.';
  END IF;
  -- Masters edited since the preview could change which rows are valid.
  IF (SELECT max(m) FROM (
        SELECT max(updated_at) m FROM public.cn_couriers UNION ALL SELECT max(updated_at) FROM public.cn_courier_accounts
        UNION ALL SELECT max(updated_at) FROM public.cn_transporters UNION ALL SELECT max(updated_at) FROM public.cn_3pl_partners
        UNION ALL SELECT max(updated_at) FROM public.cn_3pl_facilities) x) > b.validated_at THEN
    RAISE EXCEPTION 'Masters changed since this file was previewed. Review the preview again before saving.';
  END IF;
  -- Another upload or an edit since the preview changes what each scope replaces.
  EXECUTE format(
    'SELECT count(*) FROM public.cn_batch_scopes s
       LEFT JOIN (SELECT d.month, d.%2$I AS partner_id, count(*)::int AS n FROM public.%1$I d
                   WHERE d.is_active AND (d.month, d.%2$I) IN
                         (SELECT (vals->>''month'')::date, (vals->>%2$L)::bigint FROM public.cn_batch_scopes WHERE batch_id = $1)
                   GROUP BY 1, 2) e
         ON e.month = (s.vals->>''month'')::date AND e.partner_id = (s.vals->>%2$L)::bigint
      WHERE s.batch_id = $1 AND s.status <> ''blocked'' AND COALESCE(e.n, 0) <> s.existing_rows', t.target_table, t.partner_col)
  INTO changed USING p_batch_id;
  IF changed > 0 THEN
    RAISE EXCEPTION 'The data changed since this file was previewed (someone else uploaded or edited it). Review the preview again before saving.';
  END IF;
  IF b.total_rows - b.failed_rows = 0 THEN
    RAISE EXCEPTION 'Nothing to save: every row has errors or is in a blocked scope.';
  END IF;

  EXECUTE format(
    'UPDATE public.%1$I d SET is_active = false, replaced_by_batch_id = $1, replaced_at = now()
       FROM public.cn_batch_scopes s
      WHERE s.batch_id = $1 AND s.status <> ''blocked'' AND d.is_active
        AND d.month = (s.vals->>''month'')::date AND d.%2$I = (s.vals->>%2$L)::bigint', t.target_table, t.partner_col)
  USING p_batch_id;
  GET DIAGNOSTICS n_replaced = ROW_COUNT;

  SELECT string_agg(quote_ident(c), ', '), string_agg('v.' || quote_ident(c), ', ') INTO cols, vcols FROM unnest(t.insert_cols) c;
  EXECUTE format(
    'INSERT INTO public.%1$I (%2$s, batch_id, source_row_no)
     SELECT %3$s, $1, r.row_no
       FROM public.cn_staging_rows r
       JOIN public.cn_batch_scopes s ON s.batch_id = r.batch_id AND s.scope_key = r.scope_key AND s.status <> ''blocked''
      CROSS JOIN LATERAL jsonb_populate_record(NULL::public.%1$I, r.parsed) v
      WHERE r.batch_id = $1 AND NOT r.has_error', t.target_table, cols, vcols)
  USING p_batch_id;
  GET DIAGNOSTICS n_inserted = ROW_COUNT;

  UPDATE public.cn_upload_batches
     SET status = 'committed', committed_at = now(), inserted_rows = n_inserted, replaced_rows = n_replaced
   WHERE id = p_batch_id;

  RETURN jsonb_build_object('batch_id', p_batch_id, 'inserted_rows', n_inserted, 'replaced_rows', n_replaced,
                            'failed_rows', b.failed_rows, 'blocked_scopes', b.blocked_scopes);
END $$;

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

-- Masters (courier; account must belong to that courier), amount warnings, scope key.
CREATE OR REPLACE FUNCTION public.cn_rows_weight_dispute(p_batch_id bigint, p_from int, p_to int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.cn_staging_rows s
     SET parsed = s.parsed || jsonb_build_object('courier_id', x.courier_id, 'courier_account_id', x.account_id),
         scope_key = CASE WHEN s.parsed->>'month' IS NOT NULL AND x.courier_id IS NOT NULL
                          THEN (s.parsed->>'month') || '|' || x.courier_id END,
         errors = s.errors || x.errs,
         warnings = s.warnings || x.warns
    FROM (
      SELECT r.row_no,
             CASE WHEN c.is_active THEN c.id END AS courier_id,
             CASE WHEN a.is_active THEN a.id END AS account_id,
             array_remove(ARRAY[
               CASE WHEN r.parsed->>'courier' IS NOT NULL AND c.id IS NULL
                      THEN format('Courier "%s" is not in masters — add it under Masters → Couriers first', r.parsed->>'courier')
                    WHEN c.id IS NOT NULL AND NOT c.is_active
                      THEN format('Courier "%s" is deactivated in masters', c.name) END,
               CASE WHEN r.parsed->>'courier_account' IS NULL OR c.id IS NULL OR NOT c.is_active THEN NULL
                    WHEN a.id IS NULL AND o.couriers IS NOT NULL
                      THEN format('Courier Account "%s" belongs to %s, not %s', r.parsed->>'courier_account', o.couriers, c.name)
                    WHEN a.id IS NULL
                      THEN format('Courier Account "%s" is not in masters under %s — add it under Masters → Courier accounts first',
                                  r.parsed->>'courier_account', c.name)
                    WHEN NOT a.is_active
                      THEN format('Courier Account "%s" is deactivated in masters', a.name) END
             ], NULL) AS errs,
             array_remove(ARRAY[
               CASE WHEN (r.parsed->>'received_cn')::numeric > (r.parsed->>'expected_cn')::numeric
                      THEN format('Received CN (%s) is more than Expected CN (%s)', r.parsed->>'received_cn', r.parsed->>'expected_cn') END,
               CASE WHEN (r.parsed->>'expected_cn')::numeric > (r.parsed->>'invoice_value')::numeric
                      THEN format('Expected CN (%s) is more than Invoice Value (%s)', r.parsed->>'expected_cn', r.parsed->>'invoice_value') END
             ], NULL) AS warns
        FROM public.cn_staging_rows r
        LEFT JOIN public.cn_couriers c ON c.name_key = public.cn_name_key(r.parsed->>'courier')
        LEFT JOIN public.cn_courier_accounts a ON a.courier_id = c.id AND a.name_key = public.cn_name_key(r.parsed->>'courier_account')
        LEFT JOIN LATERAL (
          SELECT string_agg(DISTINCT oc.name, ', ') AS couriers
            FROM public.cn_courier_accounts oa JOIN public.cn_couriers oc ON oc.id = oa.courier_id
           WHERE oa.name_key = public.cn_name_key(r.parsed->>'courier_account')
        ) o ON r.parsed->>'courier_account' IS NOT NULL AND a.id IS NULL
       WHERE r.batch_id = p_batch_id AND r.row_no BETWEEN p_from AND p_to
    ) x
   WHERE s.batch_id = p_batch_id AND s.row_no = x.row_no;
END $$;

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
  public.cn_rows_weight_dispute(bigint, int, int), public.cn_cross_weight_dispute(bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION
  public.cn_create_batch(text, text, text[]), public.cn_stage_rows(bigint, jsonb), public.cn_validate_batch(bigint),
  public.cn_commit_batch(bigint, text), public.cn_rollback_batch(bigint), public.cn_discard_batch(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.cn_create_batch(text, text, text[]), public.cn_stage_rows(bigint, jsonb), public.cn_validate_batch(bigint),
  public.cn_commit_batch(bigint, text), public.cn_rollback_batch(bigint), public.cn_discard_batch(bigint)
  TO authenticated;
