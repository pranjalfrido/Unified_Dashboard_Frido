-- 3PL warehousing cost ledger
-- ---------------------------
-- Backs the "3PL · Warehousing" tab in the Logistics Ledger. One row is one 3PL
-- partner's charges for one warehouse for one month.
--
-- Run this once in Supabase → SQL Editor before using the uploader.

CREATE TABLE IF NOT EXISTS public.logistics_costs_3pl (
  id                     BIGSERIAL PRIMARY KEY,
  month_year             TEXT NOT NULL,      -- YYYY-MM
  threepl_logistics_name TEXT NOT NULL,
  warehouse              TEXT NOT NULL,
  invoice_number         TEXT,
  operation_fee          NUMERIC DEFAULT 0,
  rental_fee             NUMERIC DEFAULT 0,
  other_fee              NUMERIC DEFAULT 0,
  total_cost             NUMERIC,
  remarks                TEXT,
  updated_at             TIMESTAMPTZ DEFAULT now()
);

-- The uploader upserts on this combination, so re-uploading a month corrects that
-- month in place instead of doubling it. onConflict needs a matching unique index.
CREATE UNIQUE INDEX IF NOT EXISTS logistics_costs_3pl_key
  ON public.logistics_costs_3pl (month_year, threepl_logistics_name, warehouse);

-- Month is the usual filter, so index it for the table's own reads.
CREATE INDEX IF NOT EXISTS logistics_costs_3pl_month
  ON public.logistics_costs_3pl (month_year DESC);

ALTER TABLE public.logistics_costs_3pl ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read 3pl costs" ON public.logistics_costs_3pl;
CREATE POLICY "Authenticated users can read 3pl costs" ON public.logistics_costs_3pl
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert 3pl costs" ON public.logistics_costs_3pl;
CREATE POLICY "Authenticated users can insert 3pl costs" ON public.logistics_costs_3pl
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update 3pl costs" ON public.logistics_costs_3pl;
CREATE POLICY "Authenticated users can update 3pl costs" ON public.logistics_costs_3pl
  FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can delete 3pl costs" ON public.logistics_costs_3pl;
CREATE POLICY "Authenticated users can delete 3pl costs" ON public.logistics_costs_3pl
  FOR DELETE USING (auth.role() = 'authenticated');
