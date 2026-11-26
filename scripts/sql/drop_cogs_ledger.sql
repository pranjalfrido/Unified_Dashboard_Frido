-- Retire the old manual COGS table. NOT part of the migration: run it ONLY AFTER the PR that points the
-- COGS ledger page at public.product_cogs_monthly is merged AND deployed - until then the live page still
-- reads and writes this table and would break.
--
-- Nothing in the database depends on it (checked: no views, functions, triggers or foreign keys).
-- It held 1,850 rows, all for 2026-07, entered by hand. Backed up before this change to
-- exports/backup_cogs_ledger_2026-11-26.json (kept locally, not in git).
DROP TABLE IF EXISTS public.cogs_ledger;
