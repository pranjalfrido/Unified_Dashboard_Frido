-- Invoice totals per partner invoice
-- ----------------------------------
-- Already applied to Supabase (02-Nov-26); kept here so the repo matches the database.
--
-- The CN uploaders warn when an uploaded Invoice Value differs from what the bill ledger
-- says that partner invoiced for the month (cn_settings.invoice_variance_pct). Summing the
-- 1.5M-row B2C ledger live takes ~11 s, past the 8 s statement_timeout of the
-- `authenticated` role, so the totals are kept here (~11k rows) and refreshed hourly by
-- pg_cron.
--
-- invoice_number is '' where the ledger row has none (most FTL/PTL lines, every fixed
-- vehicle rental) so it can sit in the primary key.
CREATE TABLE IF NOT EXISTS public.logistics_invoice_totals (
  category       TEXT NOT NULL,
  partner        TEXT NOT NULL,
  month_year     TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  lines          INT NOT NULL,
  amount         NUMERIC,
  refreshed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (category, partner, month_year, invoice_number)
);

CREATE INDEX IF NOT EXISTS logistics_invoice_totals_invoice
  ON public.logistics_invoice_totals (invoice_number);

ALTER TABLE public.logistics_invoice_totals ENABLE ROW LEVEL SECURITY;
-- No direct grants: read only by the SECURITY DEFINER CN validation functions.

-- DELETE + INSERT in one transaction rather than TRUNCATE: TRUNCATE takes an exclusive
-- lock, which would block the summary for the ~10 s the B2C scan takes.
CREATE OR REPLACE FUNCTION public.refresh_logistics_invoice_totals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  DELETE FROM logistics_invoice_totals;

  INSERT INTO logistics_invoice_totals (category, partner, month_year, invoice_number, lines, amount)
  SELECT 'B2C', courier_name, month_year, COALESCE(invoice_number, ''), COUNT(*), SUM(total_cost)
    FROM logistics_invoices_b2c
   WHERE courier_name IS NOT NULL AND month_year IS NOT NULL
   GROUP BY 2, 3, 4;

  -- Per-trip freight and fixed monthly vehicle rentals are both FTL/PTL spend.
  INSERT INTO logistics_invoice_totals (category, partner, month_year, invoice_number, lines, amount)
  SELECT 'FTL/PTL', partner, month_year, inv, COUNT(*), SUM(amount)
    FROM (
      SELECT transporter_name AS partner, month_year, COALESCE(invoice_number, '') AS inv, total_cost AS amount
        FROM logistics_invoices_b2b
      UNION ALL
      SELECT transport_name, month_year, '', cost
        FROM logistics_fixed_vehicles
    ) t
   WHERE partner IS NOT NULL AND month_year IS NOT NULL
   GROUP BY 2, 3, 4;

  INSERT INTO logistics_invoice_totals (category, partner, month_year, invoice_number, lines, amount)
  SELECT '3PL', threepl_logistics_name, month_year, COALESCE(invoice_number, ''), COUNT(*), SUM(total_cost)
    FROM logistics_costs_3pl
   WHERE threepl_logistics_name IS NOT NULL AND month_year IS NOT NULL
   GROUP BY 2, 3, 4;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.refresh_logistics_invoice_totals() FROM PUBLIC, anon, authenticated;

-- Hourly at :20. cron.schedule with a job name replaces an existing job of that name, so
-- re-running this file does not stack duplicates.
SELECT cron.schedule('refresh-logistics-invoice-totals', '20 * * * *', $$SELECT public.refresh_logistics_invoice_totals()$$);

-- Fill it now rather than waiting for the first run.
SELECT public.refresh_logistics_invoice_totals();


