-- Fixed monthly vehicle rentals
-- -----------------------------
-- Vehicles retained on a standing monthly charge rather than billed per trip. Kept in
-- their own table, not in logistics_invoices_b2b, for two reasons: a rental has one
-- Location rather than an origin and destination lane, and its cost must never enter the
-- per-trip or per-lane freight figures — a standing charge has no trips to divide by.
--
-- Surfaced as the "Rental Fixed Vehicle" view inside the FTL/PTL ledger tab.
--
-- Run once in Supabase → SQL Editor before using the uploader.

CREATE TABLE IF NOT EXISTS public.logistics_fixed_vehicles (
  id             BIGSERIAL PRIMARY KEY,
  month_year     TEXT NOT NULL,              -- YYYY-MM
  location       TEXT NOT NULL,
  transport_name TEXT NOT NULL,
  vehicle_type   TEXT,
  vehicle_number TEXT NOT NULL,
  agreed_km      NUMERIC,
  cost           NUMERIC,
  remarks        TEXT,
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- One row per vehicle per month, so re-uploading a month corrects it in place rather
-- than doubling it. onConflict needs a matching unique index.
CREATE UNIQUE INDEX IF NOT EXISTS logistics_fixed_vehicles_key
  ON public.logistics_fixed_vehicles (month_year, vehicle_number);

CREATE INDEX IF NOT EXISTS logistics_fixed_vehicles_month
  ON public.logistics_fixed_vehicles (month_year DESC);

ALTER TABLE public.logistics_fixed_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read fixed vehicles" ON public.logistics_fixed_vehicles;
CREATE POLICY "Authenticated users can read fixed vehicles" ON public.logistics_fixed_vehicles
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert fixed vehicles" ON public.logistics_fixed_vehicles;
CREATE POLICY "Authenticated users can insert fixed vehicles" ON public.logistics_fixed_vehicles
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update fixed vehicles" ON public.logistics_fixed_vehicles;
CREATE POLICY "Authenticated users can update fixed vehicles" ON public.logistics_fixed_vehicles
  FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can delete fixed vehicles" ON public.logistics_fixed_vehicles;
CREATE POLICY "Authenticated users can delete fixed vehicles" ON public.logistics_fixed_vehicles
  FOR DELETE USING (auth.role() = 'authenticated');
