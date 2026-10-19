-- Partner x month upload coverage, for every month in the ledger at once.
--
-- Replaces the per-month checkbox panel. The question is not really "is this partner's bill
-- in for last month" but "where are the holes" — Shadowfax and Urbanbolt both went from a
-- June invoice straight to an August one with no July upload, and a single-month view only
-- shows that if you happen to be looking at July.
--
-- Returns one row per partner-month that HAS data. Absence is the signal, so the client
-- renders a gap wherever a cell is missing between a partner's first and last month; a
-- courier that was never used in a month it predates is not a hole.
--
-- Cheap enough to call on every load: 64 cells for the 1.5M-row b2c ledger, 1.3s, which
-- matters because the anon role PostgREST uses has a 3s statement timeout.
--
-- Requires idx_lib2c_month_courier (see get_logistics_partner_coverage.sql) — without it
-- this is a full scan of the ledger and overruns that timeout.

CREATE OR REPLACE FUNCTION public.get_logistics_partner_matrix(tbl text)
RETURNS TABLE(partner text, month_year text, rows_n int, cost numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Whitelisted rather than interpolated, same as get_logistics_months: a dynamic
  -- identifier here would be an injection point reachable from the anon key.
  IF tbl = 'logistics_invoices_b2c' THEN
    RETURN QUERY SELECT b.courier_name::text, b.month_year::text, COUNT(*)::int, SUM(b.total_cost)::numeric
      FROM logistics_invoices_b2c b
     WHERE b.courier_name IS NOT NULL AND b.month_year IS NOT NULL GROUP BY 1,2;
  ELSIF tbl = 'logistics_invoices_b2b' THEN
    RETURN QUERY SELECT b.transporter_name::text, b.month_year::text, COUNT(*)::int, SUM(b.total_cost)::numeric
      FROM logistics_invoices_b2b b
     WHERE b.transporter_name IS NOT NULL AND b.month_year IS NOT NULL GROUP BY 1,2;
  ELSIF tbl = 'logistics_costs_3pl' THEN
    RETURN QUERY SELECT b.threepl_logistics_name::text, b.month_year::text, COUNT(*)::int, SUM(b.total_cost)::numeric
      FROM logistics_costs_3pl b
     WHERE b.threepl_logistics_name IS NOT NULL AND b.month_year IS NOT NULL GROUP BY 1,2;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_logistics_partner_matrix(text) TO anon, authenticated;
