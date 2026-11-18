-- Logistics Credit Notes — Lost/Damage claims by month; unknown partners block only themselves
-- ==========================================================================================
-- Decided by Tushar on 04-Nov-26 after the first real Lost/Damage upload (batch #30):
-- 1. The same AWB can be claimed for the same reason in different months (the file had ~56
--    such pairs), so the Lost/Damage key is AWB + Reason + Month, not AWB + Reason.
-- 2. A row with an unknown courier / transporter / 3PL partner blocks only itself. It used to
--    block every scope of its month, so two stray "Hexalog" rows held back all of May-2026.
--    A row whose month can't be read still blocks its partner's scopes in the file.
-- cn_validate_batch moves here from 003 and cn_cross_lost_damage from 005.
-- Run after 008_cn_more_accounts.sql.

DROP INDEX IF EXISTS public.cn_lost_damage_active_key;
CREATE UNIQUE INDEX cn_lost_damage_active_key
  ON public.cn_lost_damage (awb, reason, month) WHERE is_active;

UPDATE public.cn_upload_types SET unique_cols = ARRAY['awb', 'reason', 'month'], unique_label = 'AWB + Reason + Month'
 WHERE code = 'lost_damage';

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

  -- A row whose MONTH is unreadable could belong to any of its partner's scopes in the file,
  -- so it blocks all of them. A row whose partner is unknown blocks only itself (it can't
  -- belong to another partner's scope). Grouped per pattern, not per row.
  UPDATE public.cn_batch_scopes s
     SET status = 'blocked', sort_rank = 0, warnings = '{}',
         blocked_by = (SELECT array_agg(DISTINCT e ORDER BY e) FROM unnest(s.blocked_by || x.rows) e)
    FROM (SELECT s2.scope_key, (array_agg(p.first_row ORDER BY p.first_row))[1:10] AS rows
            FROM (SELECT r.parsed->>'month' AS month, r.parsed->>t.partner_col AS partner, min(r.row_no) AS first_row
                    FROM public.cn_staging_rows r
                   WHERE r.batch_id = p_batch_id AND r.has_error AND r.scope_key IS NULL
                     AND r.parsed->>t.partner_col IS NOT NULL
                   GROUP BY 1, 2) p
            JOIN public.cn_batch_scopes s2
              ON s2.batch_id = p_batch_id
             AND (p.month IS NULL OR p.month = s2.vals->>'month')
             AND p.partner = s2.vals->>t.partner_col
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

-- AWB + reason + month is unique among active rows across ALL couriers, and an upload only
-- replaces the scopes it contains. So a claim already saved for the same month under another
-- courier, in a scope this file doesn't cover, can't be saved again here; say where it is.
CREATE OR REPLACE FUNCTION public.cn_cross_lost_damage(p_batch_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.cn_staging_rows s
     SET x_errors = s.x_errors || format(
           'AWB %s (%s) for this month is already saved under %s / %s — only a file for that month and courier can replace it',
           d.awb, d.reason, public.cn_month_label(d.month), c.name)
    FROM public.cn_lost_damage d
    JOIN public.cn_couriers c ON c.id = d.courier_id
   WHERE s.batch_id = p_batch_id AND NOT s.has_error AND s.scope_key IS NOT NULL
     AND d.is_active AND d.awb = s.parsed->>'awb' AND d.reason = s.parsed->>'reason' AND d.month::text = s.parsed->>'month'
     AND (d.month::text || '|' || d.courier_id) <> s.scope_key
     AND (d.month::text || '|' || d.courier_id) NOT IN
         (SELECT DISTINCT scope_key FROM public.cn_staging_rows WHERE batch_id = p_batch_id AND scope_key IS NOT NULL);
END $$;

REVOKE EXECUTE ON FUNCTION public.cn_cross_lost_damage(bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cn_validate_batch(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cn_validate_batch(bigint) TO authenticated;
