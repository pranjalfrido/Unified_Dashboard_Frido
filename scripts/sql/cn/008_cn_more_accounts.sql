-- Logistics Credit Notes — courier accounts seen in the first real Lost/Damage file
-- ==================================================================================
-- Batch #30 (04-Nov-26) named accounts that were not in masters. Confirmed by Tushar the
-- same day:
--   * an account may carry its courier's own name ("Swift" under Swift, …);
--   * five new accounts, added exactly as named.
-- ("Swift_NDD" needed no entry: names now match with underscores read as spaces, see 007.)
-- Safe to re-run: existing accounts are left as they are.

INSERT INTO public.cn_courier_accounts (courier_id, name)
SELECT c.id, v.account
  FROM (VALUES
    ('Swift',      'Swift'),
    ('Shadowfax',  'Shadowfax'),
    ('Delhivery',  'Delhivery'),
    ('SkyAir',     'SkyAir'),
    ('ElasticRun', 'ElasticRun'),
    ('Swift',      'Swift Reverse'),
    ('Ekart',      'Ekart Logistics FWD'),
    ('Ekart',      'Ekart Logistics Large SPS'),
    ('Ekart',      'Ekart Large Reverse'),
    ('Delhivery',  'Delhivery Reverse')
  ) AS v (courier, account)
  JOIN public.cn_couriers c ON c.name_key = public.cn_name_key(v.courier)
ON CONFLICT ON CONSTRAINT cn_courier_accounts_name_key DO NOTHING;
