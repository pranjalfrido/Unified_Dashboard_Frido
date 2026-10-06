-- One row per SKU per month in public.cogs_ledger.
--
-- The COGS page upserts with onConflict "itemskucode,month" and its own help text says
-- "Same SKU + month on upload will update the existing record" — but the table carried no
-- such constraint, only the id primary key. Postgres rejects an ON CONFLICT clause that
-- names columns with no matching unique index, so every upload failed with
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- Without this the upsert cannot work at all, and if it were rewritten as a plain insert
-- the same SKU-month would accumulate duplicate rows on each re-upload instead of being
-- corrected in place.
--
-- NOT NULL first: a unique index treats NULLs as distinct, so a NULL month would let the
-- same SKU be inserted repeatedly and silently defeat the constraint.
ALTER TABLE public.cogs_ledger ALTER COLUMN itemskucode SET NOT NULL;
ALTER TABLE public.cogs_ledger ALTER COLUMN month       SET NOT NULL;

ALTER TABLE public.cogs_ledger
  ADD CONSTRAINT cogs_ledger_sku_month_key UNIQUE (itemskucode, month);
