-- COGS ledger now lives in public.product_cogs_monthly (replaces public.cogs_ledger).
-- Additive and idempotent: safe to run while the old page is still live.
--
-- 1. Access. The table was service-role only (RLS off, no grants for logged-in users), so the COGS
--    page, which talks to Supabase from the browser, could not read or write it. Same model as the other
--    ledger tables: any authenticated user. anon gets nothing.
-- 2. rebuild_cogs_fill(skus) - re-derives the carried_forward rows from the 'actual' rows, with the
--    rule the original loader used (scripts/sync-cogs-monthly-rest.mjs): a month with no uploaded value
--    takes the latest earlier uploaded month, or, if there is none, the earliest later one.
--    Runs in one transaction, so readers (P&L via /api/cogs-monthly) never see a half-built table.
--    A SKU left with no 'actual' rows loses its filled rows too.

ALTER TABLE public.product_cogs_monthly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read product_cogs_monthly" ON public.product_cogs_monthly;
DROP POLICY IF EXISTS "Authenticated users can write product_cogs_monthly" ON public.product_cogs_monthly;
CREATE POLICY "Authenticated users can read product_cogs_monthly" ON public.product_cogs_monthly
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can write product_cogs_monthly" ON public.product_cogs_monthly
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
REVOKE ALL ON public.product_cogs_monthly FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_cogs_monthly TO authenticated;

CREATE OR REPLACE FUNCTION public.rebuild_cogs_fill(p_skus text[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM product_cogs_monthly
   WHERE cogs_source <> 'actual' AND (p_skus IS NULL OR sku = ANY (p_skus));

  INSERT INTO product_cogs_monthly (sku, month, category, sub_category, cogs, cogs_source, carried_from_month, synced_at)
  SELECT s.sku, g.m::date, a.category, a.sub_category, a.cogs, 'carried_forward', a.month, now()
    FROM (SELECT DISTINCT sku FROM product_cogs_monthly
           WHERE cogs_source = 'actual' AND cogs > 0 AND (p_skus IS NULL OR sku = ANY (p_skus))) s
   CROSS JOIN generate_series('2022-02-01'::date, date_trunc('month', current_date)::date, interval '1 month') g(m)
   CROSS JOIN LATERAL (
         SELECT x.* FROM product_cogs_monthly x
          WHERE x.sku = s.sku AND x.cogs_source = 'actual' AND x.cogs > 0
          ORDER BY (x.month > g.m::date),
                   CASE WHEN x.month <= g.m::date THEN x.month END DESC NULLS LAST,
                   x.month ASC
          LIMIT 1) a
   WHERE NOT EXISTS (SELECT 1 FROM product_cogs_monthly y
                      WHERE y.sku = s.sku AND y.month = g.m::date AND y.cogs_source = 'actual');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_cogs_fill(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rebuild_cogs_fill(text[]) TO authenticated, service_role;
