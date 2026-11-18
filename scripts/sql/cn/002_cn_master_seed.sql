-- Logistics Credit Notes — master seed
-- ====================================
-- Initial masters, built from the names in the bill ledgers (logistics_invoices_b2c,
-- logistics_invoices_b2b, logistics_fixed_vehicles, logistics_costs_3pl) as of 03-Nov-26.
-- Mapping confirmed by Tushar the same day. Decisions on the doubtful names:
--   * "Bluedart B2B" in the B2C ledger is a Bluedart ACCOUNT, not a separate courier.
--   * Bluedart_B2C (Jan–Mar) stays its own account "Bluedart B2C".
--   * ElasticRun R-NDD = Regional NDD; Shadowfax "My Frido - Prime Small(NDD)" = NDD.
--   * Urbanbolt Intracity NDD stays separate from Urbanbolt NDD.
--   * "Hexalog, Techonologies" (vehicle rentals) is the transporter "Hexalog Technologies".
--   * Hexalog's two Gurgaon facilities: location "Gurgaon" (the ledger says "Harayana").
--   * Facility names are the ledger codes unchanged.
--
-- Safe to re-run: entries are matched by name; a re-run refreshes ledger mappings and
-- adds anything missing, and never removes what was added later in the Masters screen.

-- ── Couriers ──
INSERT INTO public.cn_couriers (name, ledger_names) VALUES
  ('Bluedart',   ARRAY['Bluedart', 'Bluedart B2B']),
  ('Delhivery',  ARRAY['Delhivery']),
  ('Ekart',      ARRAY['Ekart']),
  ('ElasticRun', ARRAY['ElasticRun']),
  ('Safexpress', ARRAY['Safexpress']),
  ('Shadowfax',  ARRAY['Shadowfax']),
  ('SkyAir',     ARRAY['SkyAir']),
  ('Swift',      ARRAY['Swift']),
  ('Urbanbolt',  ARRAY['Urbanbolt'])
ON CONFLICT ON CONSTRAINT cn_couriers_name_key DO UPDATE SET ledger_names = EXCLUDED.ledger_names;

-- ── Courier accounts ── (courier, account, ledger courier_name / courier_account_type pairs)
INSERT INTO public.cn_courier_accounts (courier_id, name, ledger_keys)
SELECT c.id, v.account, v.keys::jsonb
  FROM (VALUES
    ('Bluedart',   'Bluedart Air',            '[{"courier":"Bluedart","account_type":"Air"},{"courier":"Bluedart","account_type":"Air Etail"},{"courier":"Bluedart B2B","account_type":"Air Etail"}]'),
    ('Bluedart',   'Bluedart Dart Plus',      '[{"courier":"Bluedart","account_type":"Dart Plus"}]'),
    ('Bluedart',   'Bluedart B2C',            '[{"courier":"Bluedart","account_type":"Bluedart_B2C"}]'),
    ('Bluedart',   'Bluedart Surface',        '[{"courier":"Bluedart","account_type":"Surface"}]'),
    ('Bluedart',   'Bluedart RVP',            '[{"courier":"Bluedart","account_type":"RVP"},{"courier":"Bluedart","account_type":"Bluedart_RVP"}]'),
    ('Bluedart',   'Bluedart B2B',            '[{"courier":"Bluedart B2B","account_type":"B2B"},{"courier":"Bluedart B2B","account_type":"Surface"},{"courier":"Bluedart B2B","account_type":"Bluedart_B2C"},{"courier":"Bluedart B2B","account_type":"Dart Plus"}]'),
    ('Delhivery',  'Delhivery Express',       '[{"courier":"Delhivery","account_type":"Express"}]'),
    ('Delhivery',  'Delhivery Surface',       '[{"courier":"Delhivery","account_type":"Surface"}]'),
    ('Delhivery',  'Delhivery Heavy',         '[{"courier":"Delhivery","account_type":"Heavy"}]'),
    ('Ekart',      'Ekart B2B',               '[{"courier":"Ekart","account_type":"B2B"}]'),
    ('Ekart',      'Ekart Large',             '[{"courier":"Ekart","account_type":"Large"}]'),
    ('Ekart',      'Ekart Non Large',         '[{"courier":"Ekart","account_type":"Non Large"}]'),
    ('Ekart',      'Ekart Surface',           '[{"courier":"Ekart","account_type":"Surface"}]'),
    ('ElasticRun', 'ElasticRun NDD',          '[{"courier":"ElasticRun","account_type":"NDD"}]'),
    ('ElasticRun', 'ElasticRun SDD',          '[{"courier":"ElasticRun","account_type":"SDD"}]'),
    ('ElasticRun', 'ElasticRun Regional NDD', '[{"courier":"ElasticRun","account_type":"Regional NDD"},{"courier":"ElasticRun","account_type":"R-NDD"}]'),
    ('Safexpress', 'Safexpress Air',          '[{"courier":"Safexpress","account_type":"Air"}]'),
    ('Safexpress', 'Safexpress Surface',      '[{"courier":"Safexpress","account_type":"Surface"}]'),
    ('Shadowfax',  'Shadowfax Prime Small',   '[{"courier":"Shadowfax","account_type":"Prime Small"},{"courier":"Shadowfax","account_type":"My Frido - Prime Small"}]'),
    ('Shadowfax',  'Shadowfax Prime Large',   '[{"courier":"Shadowfax","account_type":"Prime Large"},{"courier":"Shadowfax","account_type":"My Frido - Prime Large"}]'),
    ('Shadowfax',  'Shadowfax NDD',           '[{"courier":"Shadowfax","account_type":"NDD"},{"courier":"Shadowfax","account_type":"My Frido - Prime Small(NDD)"}]'),
    ('SkyAir',     'SkyAir NDD',              '[{"courier":"SkyAir","account_type":"NDD"}]'),
    ('SkyAir',     'SkyAir SDD',              '[{"courier":"SkyAir","account_type":"SDD"}]'),
    ('Swift',      'Swift NDD',               '[{"courier":"Swift","account_type":"NDD"}]'),
    ('Swift',      'Swift Surface',           '[{"courier":"Swift","account_type":"Surface"}]'),
    ('Urbanbolt',  'Urbanbolt NDD',           '[{"courier":"Urbanbolt","account_type":"NDD"}]'),
    ('Urbanbolt',  'Urbanbolt Intracity NDD', '[{"courier":"Urbanbolt","account_type":"Intracity NDD"}]')
  ) AS v (courier, account, keys)
  JOIN public.cn_couriers c ON c.name_key = public.cn_name_key(v.courier)
ON CONFLICT ON CONSTRAINT cn_courier_accounts_name_key DO UPDATE SET ledger_keys = EXCLUDED.ledger_keys;

-- ── Transporters ──
INSERT INTO public.cn_transporters (name, ledger_names) VALUES
  ('ARB Logistic',              ARRAY['ARB Logistic']),
  ('Delhivery Freight Service', ARRAY['Delhivery Freight Service']),
  ('Jopadevi',                  ARRAY['Jopadevi']),
  ('KM Logistic',               ARRAY['KM-Logistic', 'KM Logistic']),
  ('Reliable',                  ARRAY['Reliable']),
  ('VS Transport',              ARRAY['VS Transport']),
  ('RN Transport',              ARRAY['RN Transport']),
  ('Hexalog Technologies',      ARRAY['Hexalog, Techonologies'])
ON CONFLICT ON CONSTRAINT cn_transporters_name_key DO UPDATE SET ledger_names = EXCLUDED.ledger_names;

-- ── 3PL partners and facilities ──
INSERT INTO public.cn_3pl_partners (name, ledger_names) VALUES
  ('Aaj SCM',       ARRAY['Aaj SCM']),
  ('Beyond Sqfeet', ARRAY['Beyond Sqfeet']),
  ('Hexalog',       ARRAY['Hexalog']),
  ('Losung',        ARRAY['Losung']),
  ('WareIQ',        ARRAY['WareIQ'])
ON CONFLICT ON CONSTRAINT cn_3pl_partners_name_key DO UPDATE SET ledger_names = EXCLUDED.ledger_names;

INSERT INTO public.cn_3pl_facilities (partner_id, name, location, pincode, ledger_names)
SELECT p.id, v.facility, v.location, v.pincode, ARRAY[v.facility]
  FROM (VALUES
    ('Aaj SCM',       'Aaj_Kol_Item',        'Kolkata',   '712223'),
    ('Beyond Sqfeet', 'Beyond_Mum',          'Mumbai',    '421302'),
    ('Hexalog',       'Gurgaon_Hexalog',     'Gurgaon',   '122001'),
    ('Hexalog',       'Hexalog_GGN2',        'Gurgaon',   '122503'),
    ('Hexalog',       'myfrido-BLR_Hexalog', 'Bangalore', '562114'),
    ('Losung',        'Losung_Hyderabad',    'Hyderabad', '501401'),
    ('WareIQ',        'Wareiq_CHN_item',     'Chennai',   '600052'),
    ('WareIQ',        'Wareiq_HYD_item',     'Hyderabad', '500078')
  ) AS v (partner, facility, location, pincode)
  JOIN public.cn_3pl_partners p ON p.name_key = public.cn_name_key(v.partner)
ON CONFLICT ON CONSTRAINT cn_3pl_facilities_name_key DO UPDATE
  SET location = EXCLUDED.location, pincode = EXCLUDED.pincode, ledger_names = EXCLUDED.ledger_names;
