-- Logistics credit-note register
-- ------------------------------
-- Backs Documents → Logistics Credit Notes (src/LogisticsLedgerPage.jsx, format
-- `creditNotes`). One row is one credit note claim against ONE partner invoice for ONE
-- reason: the row is uploaded when the claim is raised and re-uploaded with cn_number /
-- received_amount once the partner issues the CN, which updates it in place.
--
-- All amounts are ex-GST.
--
-- Run once in Supabase → SQL Editor, together with get_logistics_months.sql (which gains a
-- branch for this table's month picker).

CREATE TABLE IF NOT EXISTS public.logistics_credit_notes (
  id                     BIGSERIAL PRIMARY KEY,
  category               TEXT NOT NULL CHECK (category IN ('B2C', 'FTL/PTL', '3PL')),
  partner_name           TEXT NOT NULL,
  month_year             TEXT NOT NULL,      -- YYYY-MM of the invoice the CN is raised against
  invoice_number         TEXT NOT NULL,
  reason                 TEXT NOT NULL,
  raised_amount_ex_gst   NUMERIC NOT NULL CHECK (raised_amount_ex_gst >= 0),
  raised_on              DATE,
  cn_number              TEXT,
  received_amount_ex_gst NUMERIC CHECK (received_amount_ex_gst >= 0),
  cn_date                DATE,
  status                 TEXT CHECK (status IN ('raised', 'partially received', 'received', 'rejected')),
  remarks                TEXT,
  updated_at             TIMESTAMPTZ DEFAULT now()
);

-- One claim per invoice per reason. The uploader upserts on this, so re-uploading a row
-- with the CN filled in updates the claim rather than adding a second one.
CREATE UNIQUE INDEX IF NOT EXISTS logistics_credit_notes_key
  ON public.logistics_credit_notes (category, partner_name, invoice_number, reason);

CREATE INDEX IF NOT EXISTS logistics_credit_notes_month
  ON public.logistics_credit_notes (month_year DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.logistics_credit_notes TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.logistics_credit_notes_id_seq TO authenticated;

ALTER TABLE public.logistics_credit_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read credit notes" ON public.logistics_credit_notes;
CREATE POLICY "Authenticated users can read credit notes" ON public.logistics_credit_notes
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert credit notes" ON public.logistics_credit_notes;
CREATE POLICY "Authenticated users can insert credit notes" ON public.logistics_credit_notes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update credit notes" ON public.logistics_credit_notes;
CREATE POLICY "Authenticated users can update credit notes" ON public.logistics_credit_notes
  FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can delete credit notes" ON public.logistics_credit_notes;
CREATE POLICY "Authenticated users can delete credit notes" ON public.logistics_credit_notes
  FOR DELETE USING (auth.role() = 'authenticated');


-- Invoice totals per partner invoice
-- ----------------------------------
-- The CN summary sets each category's credit notes against what that category was
-- invoiced. Summing the B2C ledger live takes ~11 s at 1.5M rows (measured 02-Nov-26),
-- past the 8 s statement_timeout of the `authenticated` role, so the totals are kept here
-- (~10k rows) and refreshed hourly by pg_cron below.
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
-- Read only through get_logistics_cn_summary(); no direct grants.

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


-- Summary feed for the CN page
-- ----------------------------
-- invoices:  invoiced amount per category × partner × month (the "Total Invoice" column).
-- unmatched: CN ids whose invoice_number is not in the bill ledger for that partner.
--            B2C and 3PL only — most FTL/PTL ledger lines and every vehicle rental carry
--            no invoice number, so a miss there would mean nothing.
CREATE OR REPLACE FUNCTION public.get_logistics_cn_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT jsonb_build_object(
    'invoices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('category', category, 'partner', partner, 'month_year', month_year, 'amount', amount))
        FROM (
          SELECT category, partner, month_year, SUM(amount) AS amount
            FROM logistics_invoice_totals
           GROUP BY 1, 2, 3
        ) s
    ), '[]'::jsonb),
    'unmatched', COALESCE((
      SELECT jsonb_agg(cn.id)
        FROM logistics_credit_notes cn
       WHERE cn.category IN ('B2C', '3PL')
         AND NOT EXISTS (
           SELECT 1 FROM logistics_invoice_totals t
            WHERE t.invoice_number = cn.invoice_number
              AND t.category = cn.category
              AND lower(t.partner) = lower(cn.partner_name)
         )
    ), '[]'::jsonb),
    'refreshed_at', (SELECT max(refreshed_at) FROM logistics_invoice_totals)
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.get_logistics_cn_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_logistics_cn_summary() TO authenticated;
