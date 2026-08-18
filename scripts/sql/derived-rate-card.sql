-- Derived rate card, refreshed month by month as new bills land.
--
-- WHY A TABLE AND NOT A VIEW: the card must be a FROZEN snapshot. Pricing a shipment
-- against a card that silently moves when next month's bills arrive makes yesterday's
-- analysis irreproducible, and a variance that changes on its own cannot be argued.
-- computed_at records when each cell was measured.
--
-- GRAIN: month x courier x account x leg x zone x slab x payment_mode. Month is the
-- outermost key so a rate change shows up as a new row rather than being blended into a
-- period average — the whole point is to hold rate constant within a month so any residual
-- variance is WEIGHT.
--
-- PAYMENT MODE IS PART OF THE KEY because some couriers price COD into the freight line
-- rather than as a separate fee. Measured on Swift, April, zone D, 0.5 kg, forward:
--   Surface Prepaid ₹31 (5,309 rows) · Surface COD ₹55 (884) · NDD Prepaid ₹45 · NDD COD ₹70
-- Four exact rates, each internally consistent. Without payment_mode in the key all four
-- collapse to a ₹31 median, every COD shipment is under-priced by ₹24, and the shortfall is
-- misattributed to "rate variance" — ₹12.27 L of it on Swift alone. Bluedart does not show
-- this because it books COD as a separate other_charge, leaving its freight line single-rate.
--
-- slab is NULL for Bluedart B2B, which is priced per actual kg with no slabbing. Its zone
-- letters are REGIONS (A=West B=North C=South D=East E=NE/J&K), not distance bands.
CREATE TABLE IF NOT EXISTS public.logistics_rate_card_derived (
  id                bigserial PRIMARY KEY,
  month_year        text        NOT NULL,
  courier_name      text        NOT NULL,
  account_type      text        NOT NULL,       -- '(none)' rather than NULL, so the
                                                -- uniqueness constraint actually bites
  leg               text        NOT NULL,       -- Forward | Reverse | RTO
  zone              text        NOT NULL,
  weight_slab       numeric,                    -- NULL = priced per actual kg (B2B)
  payment_mode      text        NOT NULL,       -- '(none)' rather than NULL, so the unique
                                                -- constraint treats missing as one bucket

  shipments         integer     NOT NULL,
  freight_median    numeric,                    -- the recurring rate: use this to price
  freight_wavg      numeric,                    -- true average spend: use for budgeting
  freight_min       numeric,
  freight_max       numeric,
  cv                numeric,                    -- <0.05 tight, <0.20 loose, else scattered
  confidence        text,

  surcharge_rate    numeric,                    -- add-on load as a fraction of freight
  total_wavg        numeric,
  cost_per_kg       numeric,

  computed_at       timestamptz NOT NULL DEFAULT now(),

  -- One cell per key per month. Lets the refresh upsert instead of delete-then-insert,
  -- so a failed run cannot leave the table half-empty.
  CONSTRAINT logistics_rate_card_derived_cell_key
    UNIQUE (month_year, courier_name, account_type, leg, zone, weight_slab, payment_mode)
);

-- ── Migration: payment_mode added to the grain after the first build ──
-- Runs BEFORE the indexes below, which reference the column — CREATE TABLE IF NOT EXISTS is
-- a no-op on an existing table, so on a pre-migration table the column would not yet exist
-- and the index creation would fail. Rows measured under the old 6-column grain are deleted
-- rather than migrated: their medians blend payment modes, which is the defect being fixed.
ALTER TABLE public.logistics_rate_card_derived
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT '(none)';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'logistics_rate_card_derived_cell_key'
       AND array_length(conkey, 1) = 6
  ) THEN
    DELETE FROM public.logistics_rate_card_derived;
    ALTER TABLE public.logistics_rate_card_derived
      DROP CONSTRAINT logistics_rate_card_derived_cell_key;
    ALTER TABLE public.logistics_rate_card_derived
      ADD CONSTRAINT logistics_rate_card_derived_cell_key
      UNIQUE (month_year, courier_name, account_type, leg, zone, weight_slab, payment_mode);
  END IF;
END $$;

-- Stale indexes from the pre-payment_mode grain: dropped so the replacements below define
-- the lookup path, rather than leaving two overlapping indexes on the same columns.
DROP INDEX IF EXISTS public.idx_lrcd_lookup;
DROP INDEX IF EXISTS public.idx_lrcd_key_nomonth;

-- The pricing path looks up one cell at a time by exactly this key.
CREATE INDEX IF NOT EXISTS idx_lrcd_lookup
  ON public.logistics_rate_card_derived
     (courier_name, account_type, leg, zone, weight_slab, payment_mode, month_year);

-- Fallback tiers scan by key without the month, so this supports the tier-2 lookup.
CREATE INDEX IF NOT EXISTS idx_lrcd_key_nomonth
  ON public.logistics_rate_card_derived
     (courier_name, account_type, leg, zone, weight_slab, payment_mode);
