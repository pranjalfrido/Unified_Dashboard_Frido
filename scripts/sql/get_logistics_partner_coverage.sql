-- Which billing partners have been uploaded for a given month, and which have not.
--
-- Answers the question the ledger could not: "whose bill is still missing?" Shadowfax and
-- Urbanbolt both went from a June invoice straight to an August one with no July upload,
-- and nothing surfaced it — July simply showed seven couriers instead of nine, which looks
-- like a quiet month rather than a gap.
--
-- `expected` is derived from history rather than a hand-maintained list: a partner is
-- expected in a month if it was billed in any of the LOOKBACK months before it. That keeps
-- a newly onboarded courier from being flagged for months it predates, and lets a courier
-- we have genuinely stopped using age out on its own after LOOKBACK quiet months.
--
-- Returns one row per expected partner, so the UI can render a checkbox per partner without
-- fetching any invoice rows. Aggregating here rather than in the browser matters: the b2c
-- ledger is ~1.5M rows and the page would otherwise have to page through all of them.

CREATE OR REPLACE FUNCTION public.get_logistics_partner_coverage(
  tbl text,
  target_month text,
  lookback int DEFAULT 3
)
RETURNS TABLE(
  partner text,
  uploaded boolean,
  rows_n int,
  cost numeric,
  last_seen text,
  months_seen int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Table name is matched against a whitelist rather than interpolated, same as
  -- get_logistics_months: these are the only two ledgers, and a dynamic identifier here
  -- would be an injection point reachable from the anon key.
  IF tbl = 'logistics_invoices_b2c' THEN
    RETURN QUERY
    WITH prior AS (
      SELECT b.courier_name AS partner,
             COUNT(DISTINCT b.month_year)::int AS months_seen,
             MAX(b.month_year)                 AS last_seen
        FROM logistics_invoices_b2c b
       WHERE b.courier_name IS NOT NULL
         AND b.month_year IS NOT NULL
         AND b.month_year < target_month
         -- Interval arithmetic on the YYYY-MM label, so the window is calendar months
         -- rather than "the last N months that happen to have data".
         AND b.month_year >= to_char(
               to_date(target_month, 'YYYY-MM') - (lookback || ' months')::interval,
               'YYYY-MM')
       GROUP BY 1
    ),
    actual AS (
      SELECT b.courier_name AS partner,
             COUNT(*)::int  AS rows_n,
             SUM(b.total_cost) AS cost
        FROM logistics_invoices_b2c b
       WHERE b.courier_name IS NOT NULL
         AND b.month_year = target_month
       GROUP BY 1
    )
    -- FULL JOIN, not LEFT: a partner that appears for the first time in target_month has no
    -- prior row, and dropping it would hide a courier that IS uploaded from the checklist.
    SELECT COALESCE(p.partner, a.partner)::text,
           (a.partner IS NOT NULL)            AS uploaded,
           COALESCE(a.rows_n, 0)              AS rows_n,
           COALESCE(a.cost, 0)::numeric       AS cost,
           COALESCE(p.last_seen, target_month)::text,
           COALESCE(p.months_seen, 0)         AS months_seen
      FROM prior p
      FULL JOIN actual a ON a.partner = p.partner
     ORDER BY (a.partner IS NOT NULL), COALESCE(p.months_seen, 0) DESC, 1;

  ELSIF tbl = 'logistics_invoices_b2b' THEN
    RETURN QUERY
    WITH prior AS (
      SELECT b.transporter_name AS partner,
             COUNT(DISTINCT b.month_year)::int AS months_seen,
             MAX(b.month_year)                 AS last_seen
        FROM logistics_invoices_b2b b
       WHERE b.transporter_name IS NOT NULL
         AND b.month_year IS NOT NULL
         AND b.month_year < target_month
         AND b.month_year >= to_char(
               to_date(target_month, 'YYYY-MM') - (lookback || ' months')::interval,
               'YYYY-MM')
       GROUP BY 1
    ),
    actual AS (
      SELECT b.transporter_name AS partner,
             COUNT(*)::int  AS rows_n,
             SUM(b.total_cost) AS cost
        FROM logistics_invoices_b2b b
       WHERE b.transporter_name IS NOT NULL
         AND b.month_year = target_month
       GROUP BY 1
    )
    SELECT COALESCE(p.partner, a.partner)::text,
           (a.partner IS NOT NULL)            AS uploaded,
           COALESCE(a.rows_n, 0)              AS rows_n,
           COALESCE(a.cost, 0)::numeric       AS cost,
           COALESCE(p.last_seen, target_month)::text,
           COALESCE(p.months_seen, 0)         AS months_seen
      FROM prior p
      FULL JOIN actual a ON a.partner = p.partner
     ORDER BY (a.partner IS NOT NULL), COALESCE(p.months_seen, 0) DESC, 1;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_logistics_partner_coverage(text, text, int) TO anon, authenticated;
