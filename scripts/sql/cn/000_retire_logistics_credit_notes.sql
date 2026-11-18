-- Retire the first credit-note register
-- -------------------------------------
-- logistics_credit_notes (one claim per invoice + reason) was applied to Supabase on
-- 02-Nov-26 from the unmerged feat/logistics-credit-notes branch and never received a row.
-- The Logistics Credit Notes module (001_cn_schema.sql) replaces it.
--
-- logistics_invoice_totals and its hourly pg_cron job stay: the CN uploaders check uploaded
-- invoice values against them (see scripts/sql/logistics-invoice-totals.sql).
--
-- After running this, re-run scripts/sql/get_logistics_months.sql to drop the
-- logistics_credit_notes branch that branch added to it.

DROP FUNCTION IF EXISTS public.get_logistics_cn_summary();

-- Refuses to drop a table that has gained rows since it was checked empty.
DO $$
BEGIN
  IF to_regclass('public.logistics_credit_notes') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.logistics_credit_notes) THEN
    RAISE EXCEPTION 'logistics_credit_notes is not empty — not dropping it';
  END IF;
END $$;

DROP TABLE IF EXISTS public.logistics_credit_notes;
