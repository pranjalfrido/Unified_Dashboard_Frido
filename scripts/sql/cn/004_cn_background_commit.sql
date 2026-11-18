-- Logistics Credit Notes — commit, in place or in the background
-- ===============================================================
-- A commit archives the active rows of every scope in the file and inserts the file's rows,
-- in one transaction. Measured on Supabase (03-Nov-26): 3.1 s for 50k new rows, 7.9 s when
-- those 50k replace 50k existing ones — at the 8 s statement_timeout of the `authenticated`
-- role, which a function-level SET cannot raise.
--
-- So cn_commit_batch commits straight away when the file touches at most
-- cn_settings.sync_commit_max_rows rows (rows to save + rows to replace; default 20,000,
-- which covers nearly every upload). A larger file is QUEUED: the pg_cron job below runs the
-- same one-transaction commit every 10 s as the database owner (2-minute limit). If anything
-- changed between the preview and that commit, the batch goes back to 'staged' with the
-- reason in commit_error, to be previewed and saved again.
--
-- Run after 003_cn_upload_engine.sql.

ALTER TABLE public.cn_upload_batches
  ADD COLUMN IF NOT EXISTS queued_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commit_error TEXT;

ALTER TABLE public.cn_upload_batches DROP CONSTRAINT IF EXISTS cn_upload_batches_status_check;
ALTER TABLE public.cn_upload_batches ADD CONSTRAINT cn_upload_batches_status_check
  CHECK (status IN ('staged', 'queued', 'committed', 'rolled_back', 'discarded'));

INSERT INTO public.cn_settings (key, value, description) VALUES
  ('sync_commit_max_rows', '20000', 'Uploads touching more rows than this (rows saved + rows replaced) are committed in the background')
ON CONFLICT (key) DO NOTHING;

-- Refuses (raises) if what the preview showed no longer holds. Caller holds the table lock.
CREATE OR REPLACE FUNCTION public.cn_commit_checks(b public.cn_upload_batches, t public.cn_upload_types)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed int;
BEGIN
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
  INTO changed USING b.id;
  IF changed > 0 THEN
    RAISE EXCEPTION 'The data changed since this file was previewed (someone else uploaded or edited it). Review the preview again before saving.';
  END IF;
  IF b.total_rows - b.failed_rows = 0 THEN
    RAISE EXCEPTION 'Nothing to save: every row has errors or is in a blocked scope.';
  END IF;
END $$;

-- Archive the active rows of every unblocked scope, insert the file's valid rows, mark the
-- batch committed. Caller holds the table lock and has run cn_commit_checks.
CREATE OR REPLACE FUNCTION public.cn_commit_apply(b public.cn_upload_batches, t public.cn_upload_types)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n_replaced int; n_inserted int; cols text; vcols text;
BEGIN
  EXECUTE format(
    'UPDATE public.%1$I d SET is_active = false, replaced_by_batch_id = $1, replaced_at = now()
       FROM public.cn_batch_scopes s
      WHERE s.batch_id = $1 AND s.status <> ''blocked'' AND d.is_active
        AND d.month = (s.vals->>''month'')::date AND d.%2$I = (s.vals->>%2$L)::bigint', t.target_table, t.partner_col)
  USING b.id;
  GET DIAGNOSTICS n_replaced = ROW_COUNT;

  SELECT string_agg(quote_ident(c), ', '), string_agg('v.' || quote_ident(c), ', ') INTO cols, vcols FROM unnest(t.insert_cols) c;
  BEGIN
    EXECUTE format(
      'INSERT INTO public.%1$I (%2$s, batch_id, source_row_no)
       SELECT %3$s, $1, r.row_no
         FROM public.cn_staging_rows r
         JOIN public.cn_batch_scopes s ON s.batch_id = r.batch_id AND s.scope_key = r.scope_key AND s.status <> ''blocked''
        CROSS JOIN LATERAL jsonb_populate_record(NULL::public.%1$I, r.parsed) v
        WHERE r.batch_id = $1 AND NOT r.has_error', t.target_table, cols, vcols)
    USING b.id;
  EXCEPTION WHEN unique_violation THEN
    -- e.g. a Lost/Damage AWB that is active under a scope this file has but which is blocked.
    RAISE EXCEPTION 'Nothing was saved: some rows clash with rows already saved that this file could not replace (%). Fix the blocked rows and preview again.', SQLERRM;
  END;
  GET DIAGNOSTICS n_inserted = ROW_COUNT;

  UPDATE public.cn_upload_batches
     SET status = 'committed', committed_at = now(), inserted_rows = n_inserted, replaced_rows = n_replaced, commit_error = NULL
   WHERE id = b.id;
  RETURN jsonb_build_object('batch_id', b.id, 'queued', false, 'inserted_rows', n_inserted, 'replaced_rows', n_replaced,
                            'failed_rows', b.failed_rows, 'blocked_scopes', b.blocked_scopes);
END $$;

CREATE OR REPLACE FUNCTION public.cn_commit_batch(p_batch_id bigint, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.cn_upload_batches; t public.cn_upload_types; touched int; max_rows int;
BEGIN
  PERFORM public.cn_batch_for_caller(p_batch_id, 'staged');
  SELECT * INTO b FROM public.cn_upload_batches WHERE id = p_batch_id FOR UPDATE;
  SELECT * INTO t FROM public.cn_upload_types WHERE code = b.upload_type;

  -- The user must have confirmed the CURRENT preview: staging more rows clears it.
  IF b.validated_at IS NULL OR b.preview_token IS DISTINCT FROM p_token THEN
    RAISE EXCEPTION 'This file has changed since it was previewed. Review the preview again before saving.';
  END IF;

  max_rows := COALESCE((SELECT (value #>> '{}')::int FROM public.cn_settings WHERE key = 'sync_commit_max_rows'), 20000);
  touched := (b.total_rows - b.failed_rows)
             + COALESCE((SELECT sum(existing_rows) FROM public.cn_batch_scopes WHERE batch_id = p_batch_id AND status <> 'blocked'), 0);

  -- One commit per upload type at a time; reads are not blocked.
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE', t.target_table);
  -- Checked now even when queueing, so a stale preview fails here rather than later.
  PERFORM public.cn_commit_checks(b, t);

  IF touched > max_rows THEN
    UPDATE public.cn_upload_batches SET status = 'queued', queued_at = now(), commit_error = NULL WHERE id = p_batch_id;
    RETURN jsonb_build_object('batch_id', p_batch_id, 'queued', true, 'rows_touched', touched);
  END IF;
  RETURN public.cn_commit_apply(b, t);
END $$;

-- Background worker (pg_cron, every 10 s): commits queued batches oldest first, at most three
-- per run. A batch that can no longer be committed as previewed goes back to 'staged' with
-- the reason, and its preview is cleared so it must be reviewed again.
CREATE OR REPLACE FUNCTION public.cn_run_commit_queue()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.cn_upload_batches; t public.cn_upload_types; n int := 0;
BEGIN
  LOOP
    SELECT * INTO b FROM public.cn_upload_batches WHERE status = 'queued' ORDER BY queued_at, id LIMIT 1 FOR UPDATE SKIP LOCKED;
    EXIT WHEN NOT FOUND;
    SELECT * INTO t FROM public.cn_upload_types WHERE code = b.upload_type;
    BEGIN
      EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE', t.target_table);
      PERFORM public.cn_commit_checks(b, t);
      PERFORM public.cn_commit_apply(b, t);
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.cn_upload_batches
         SET status = 'staged', queued_at = NULL, validated_at = NULL, preview_token = NULL, commit_error = SQLERRM
       WHERE id = b.id;
    END;
    n := n + 1;
    EXIT WHEN n >= 3;
  END LOOP;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION
  public.cn_commit_checks(public.cn_upload_batches, public.cn_upload_types),
  public.cn_commit_apply(public.cn_upload_batches, public.cn_upload_types),
  public.cn_run_commit_queue()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cn_commit_batch(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cn_commit_batch(bigint, text) TO authenticated;

-- Every 10 seconds; an idle run is one indexed lookup. cron.schedule with a job name replaces
-- an existing job of that name. Skipped where pg_cron is absent (the test database).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('cn-commit-queue', '10 seconds', 'SELECT public.cn_run_commit_queue()');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cn_upload_batches_queued ON public.cn_upload_batches (queued_at) WHERE status = 'queued';
