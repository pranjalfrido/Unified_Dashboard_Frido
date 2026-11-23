-- Logistics Credit Notes — fixes from the first real upload (04-Nov-26)
-- ======================================================================
-- A 60k-row Lost/Damage file (batch #30) showed three problems. Run after 006_cn_listing.sql.
--
-- 1. The preview timed out: counting a batch's 60k staged rows took 9 s as a signed-in user,
--    because every access rule called cn_can_upload() once PER ROW. Wrapped in a sub-select
--    the call is evaluated once per query (Supabase's documented RLS pattern).
-- 2. "Swift_NDD" did not match the master "Swift NDD": names now treat underscores like spaces.
-- 3. "-" typed for an empty amount was read as "not a number": a cell holding only a dash is
--    now blank, so optional fields default as usual and required ones say "is required".

-- ── 1. Access rules evaluated once per query ────────────────────────────────
-- Rewrites every CN policy's cn_can_upload() / cn_can_manage() call as a sub-select.
-- Policies already in that form (they deparse with "SELECT") are left alone, so re-running
-- this is harmless.

DO $$
DECLARE p record; q text; w text;
BEGIN
  FOR p IN SELECT tablename, policyname, qual, with_check FROM pg_policies
            WHERE schemaname = 'public' AND tablename LIKE 'cn\_%'
  LOOP
    q := CASE WHEN p.qual ~ 'SELECT' THEN NULL
              ELSE regexp_replace(p.qual, '(public\.)?cn_can_(upload|manage)\(\)', '(SELECT public.cn_can_\2())', 'g') END;
    w := CASE WHEN p.with_check ~ 'SELECT' THEN NULL
              ELSE regexp_replace(p.with_check, '(public\.)?cn_can_(upload|manage)\(\)', '(SELECT public.cn_can_\2())', 'g') END;
    IF q IS NOT NULL THEN EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', p.policyname, p.tablename, q); END IF;
    IF w IS NOT NULL THEN EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)', p.policyname, p.tablename, w); END IF;
  END LOOP;
END $$;

-- ── 2. Underscores match like spaces ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cn_name_key(v text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $f$ SELECT btrim(regexp_replace(lower(v), '[\s_]+', ' ', 'g')) $f$;

-- name_key is a stored column computed with cn_name_key(); rewriting each row recomputes it.
UPDATE public.cn_couriers SET name = name;
UPDATE public.cn_courier_accounts SET name = name;
UPDATE public.cn_transporters SET name = name;
UPDATE public.cn_3pl_partners SET name = name;
UPDATE public.cn_3pl_facilities SET name = name;

-- ── 3. A lone dash is blank ─────────────────────────────────────────────────

-- A cell's text for parsing: trimmed, and NULL when empty or only a dash ("-", "–", "—").
CREATE OR REPLACE FUNCTION public.cn_cell(v text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $f$ SELECT CASE WHEN btrim(v) IN ('', '-', '–', '—') THEN NULL ELSE btrim(v) END $f$;

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
           public.cn_cell(i.raw->>((b.header_map->>(c.col->>'key'))::int)) AS v
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

REVOKE EXECUTE ON FUNCTION public.cn_stage_rows(bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cn_stage_rows(bigint, jsonb) TO authenticated;
