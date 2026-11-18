-- Logistics Credit Notes — listings, row edits and upload history
-- ===============================================================
-- Run after 005_cn_more_upload_types.sql.
--
-- Listings read the cn_*_v views (active rows only) directly. Editing and deleting a row go
-- through the two functions below instead of plain UPDATEs, so a manager can change only a
-- row's VALUES — never its month, partner, account or key, which would bypass the
-- replace-by-scope rules — and so a delete is always the soft kind.

-- ── Which columns a manager may edit, per upload type ────────────────────────

ALTER TABLE public.cn_upload_types ADD COLUMN IF NOT EXISTS editable_cols TEXT[] NOT NULL DEFAULT '{}';
UPDATE public.cn_upload_types SET editable_cols = ARRAY['invoice_value', 'expected_cn', 'received_cn']
 WHERE code IN ('weight_dispute', 'ftl_ptl', '3pl');
UPDATE public.cn_upload_types SET editable_cols = ARRAY['shipment_value', 'expected_cn', 'cn_received_amt', 'cn_number']
 WHERE code = 'lost_damage';

-- Data rows change only through the engine and the functions below.
REVOKE UPDATE ON public.cn_weight_dispute, public.cn_lost_damage, public.cn_ftl_ptl, public.cn_3pl FROM authenticated;

-- ── cn_update_row ────────────────────────────────────────────────────────────
-- p_changes: {"received_cn": "12,500", …}. Amounts are parsed like uploads (₹ and commas
-- fine); a blank optional amount or text clears it.
CREATE OR REPLACE FUNCTION public.cn_update_row(p_type text, p_id bigint, p_changes jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.cn_upload_types; k text; v text; col jsonb; amount numeric; n int;
BEGIN
  IF NOT public.cn_can_manage() THEN
    RAISE EXCEPTION 'Editing credit-note rows needs Documents → Credit notes: manage.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO t FROM public.cn_upload_types WHERE code = p_type;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown upload type "%".', p_type; END IF;
  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' OR p_changes = '{}' THEN RAISE EXCEPTION 'Nothing to change.'; END IF;

  EXECUTE format('SELECT count(*) FROM public.%I WHERE id = $1 AND is_active', t.target_table) INTO n USING p_id;
  IF n = 0 THEN RAISE EXCEPTION 'Row % is not an active % row (it may have been replaced or deleted).', p_id, t.label; END IF;

  FOR k, v IN SELECT key, NULLIF(btrim(value #>> '{}'), '') FROM jsonb_each(p_changes) LOOP
    IF NOT k = ANY(t.editable_cols) THEN
      RAISE EXCEPTION '% can''t be edited here. Only % can; to change anything else, upload the corrected file.',
        k, array_to_string(t.editable_cols, ', ');
    END IF;
    SELECT c INTO col FROM jsonb_array_elements(t.columns) c WHERE c->>'key' = k;
    IF col->>'type' = 'amount' THEN
      amount := public.cn_parse_amount(v);
      IF v IS NOT NULL AND amount IS NULL THEN RAISE EXCEPTION '% "%" is not a number.', col->>'label', v; END IF;
      IF amount < 0 THEN RAISE EXCEPTION '% cannot be negative.', col->>'label'; END IF;
      IF amount IS NULL AND (col->>'required')::boolean THEN RAISE EXCEPTION '% is required.', col->>'label'; END IF;
      -- Lost/Damage: a blank Expected CN means "the full shipment value", as on upload.
      IF k = 'expected_cn' AND p_type = 'lost_damage' THEN
        EXECUTE 'UPDATE public.cn_lost_damage SET expected_cn = COALESCE($1, shipment_value), expected_cn_defaulted = ($1 IS NULL) WHERE id = $2'
          USING amount, p_id;
      ELSE
        EXECUTE format('UPDATE public.%I SET %I = $1 WHERE id = $2', t.target_table, k) USING amount, p_id;
      END IF;
    ELSE
      EXECUTE format('UPDATE public.%I SET %I = $1 WHERE id = $2', t.target_table, k) USING v, p_id;
    END IF;
  END LOOP;
END $$;

-- ── cn_delete_row ────────────────────────────────────────────────────────────
-- Soft delete: the row leaves the active set (and the listings), keeps its history, and a
-- rollback never brings it back.
CREATE OR REPLACE FUNCTION public.cn_delete_row(p_type text, p_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.cn_upload_types; n int;
BEGIN
  IF NOT public.cn_can_manage() THEN
    RAISE EXCEPTION 'Deleting credit-note rows needs Documents → Credit notes: manage.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO t FROM public.cn_upload_types WHERE code = p_type;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown upload type "%".', p_type; END IF;
  EXECUTE format('UPDATE public.%I SET is_active = false, deleted_at = now(), deleted_by = auth.uid() WHERE id = $1 AND is_active',
                 t.target_table) USING p_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Row % is not an active % row (it may have been replaced or deleted already).', p_id, t.label; END IF;
END $$;

-- ── Upload history ───────────────────────────────────────────────────────────
-- Batches newest first, with who uploaded them (user_profiles is not readable across users,
-- so the name comes through this function). total = matching batches, for paging.
CREATE OR REPLACE FUNCTION public.cn_list_batches(p_type text DEFAULT NULL, p_status text DEFAULT NULL,
                                                  p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS TABLE (id bigint, upload_type text, type_label text, file_name text, status text, uploaded_by_name text,
               uploaded_at timestamptz, committed_at timestamptz, rolled_back_at timestamptz, rolled_back_by_name text,
               total_rows int, inserted_rows int, replaced_rows int, failed_rows int, warning_rows int,
               blocked_scopes int, commit_error text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.cn_can_upload() THEN
    RAISE EXCEPTION 'You don''t have access to credit-note uploads.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT b.id, b.upload_type, t.label, b.file_name, b.status,
           COALESCE(NULLIF(u.full_name, ''), NULLIF(u.name, ''), u.email, b.uploaded_by::text),
           b.uploaded_at, b.committed_at, b.rolled_back_at,
           COALESCE(NULLIF(r.full_name, ''), NULLIF(r.name, ''), r.email),
           b.total_rows, b.inserted_rows, b.replaced_rows, b.failed_rows, b.warning_rows, b.blocked_scopes, b.commit_error,
           count(*) OVER ()
      FROM public.cn_upload_batches b
      JOIN public.cn_upload_types t ON t.code = b.upload_type
      LEFT JOIN public.user_profiles u ON u.user_id = b.uploaded_by
      LEFT JOIN public.user_profiles r ON r.user_id = b.rolled_back_by
     WHERE (p_type IS NULL OR b.upload_type = p_type)
       AND (p_status IS NULL OR b.status = p_status)
     ORDER BY b.id DESC
     LIMIT LEAST(GREATEST(p_limit, 1), 200) OFFSET GREATEST(p_offset, 0);
END $$;

-- ── Housekeeping ─────────────────────────────────────────────────────────────
-- A file previewed but never saved or discarded keeps its staged rows (up to 100k). After 7
-- days it is discarded and its staged rows removed; the batch record stays in the history.
CREATE OR REPLACE FUNCTION public.cn_discard_stale_batches()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ids bigint[];
BEGIN
  SELECT array_agg(id) INTO ids FROM public.cn_upload_batches WHERE status = 'staged' AND uploaded_at < now() - interval '7 days';
  IF ids IS NULL THEN RETURN 0; END IF;
  DELETE FROM public.cn_staging_rows WHERE batch_id = ANY(ids);
  DELETE FROM public.cn_batch_scopes WHERE batch_id = ANY(ids);
  UPDATE public.cn_upload_batches SET status = 'discarded', commit_error = 'Discarded automatically: not saved within 7 days'
   WHERE id = ANY(ids);
  RETURN cardinality(ids);
END $$;

REVOKE EXECUTE ON FUNCTION public.cn_discard_stale_batches() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cn_update_row(text, bigint, jsonb), public.cn_delete_row(text, bigint),
                           public.cn_list_batches(text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cn_update_row(text, bigint, jsonb), public.cn_delete_row(text, bigint),
                          public.cn_list_batches(text, text, int, int) TO authenticated;

-- Daily at 21:00 UTC (02:30 IST). Skipped where pg_cron is absent (the test database).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('cn-discard-stale-batches', '0 21 * * *', 'SELECT public.cn_discard_stale_batches()');
  END IF;
END $$;
