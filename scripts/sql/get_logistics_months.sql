-- Distinct months for the Logistics Ledger month picker (src/LogisticsLedgerPage.jsx).
--
-- WHY THE B2C BRANCH IS A RECURSIVE CTE
-- The original body was SELECT DISTINCT month_year over the whole table. At 1.73M rows that
-- read every entry of idx_lib2c_month_id - plus ~760k heap fetches whenever the visibility map
-- lagged behind a big upload - and took ~14 s. The browser calls this as `anon`, whose
-- statement_timeout is 3 s, so the page failed with "canceling statement due to statement
-- timeout" (16-Oct-26).
--
-- This version is a loose index scan: start at the newest month, then repeatedly ask the index
-- for the first month strictly older than the last one found. One index probe per month (9
-- today), so it stays in milliseconds however large the ledger grows. It relies on
-- idx_lib2c_month_id (month_year DESC, id DESC) - do not drop that index.
--
-- B2B keeps the plain DISTINCT: ~2.4k rows, already instant.

CREATE OR REPLACE FUNCTION public.get_logistics_months(tbl text)
 RETURNS TABLE(month_year text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF tbl = 'logistics_invoices_b2c' THEN
    RETURN QUERY
      WITH RECURSIVE m(my) AS (
        (SELECT b.month_year FROM logistics_invoices_b2c b
          WHERE b.month_year IS NOT NULL
          ORDER BY b.month_year DESC LIMIT 1)
        UNION ALL
        SELECT (SELECT b.month_year FROM logistics_invoices_b2c b
                 WHERE b.month_year < m.my
                 ORDER BY b.month_year DESC LIMIT 1)
          FROM m
         WHERE m.my IS NOT NULL
      )
      SELECT m.my::text FROM m WHERE m.my IS NOT NULL ORDER BY 1 DESC;
  ELSIF tbl = 'logistics_invoices_b2b' THEN
    RETURN QUERY SELECT DISTINCT b.month_year FROM logistics_invoices_b2b b WHERE b.month_year IS NOT NULL ORDER BY 1 DESC;
  END IF;
END;
$function$;
