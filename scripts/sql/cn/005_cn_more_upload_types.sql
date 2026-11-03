-- Logistics Credit Notes — Lost/Damage/SLA, FTL/PTL and 3PL uploads
-- =================================================================
-- Three more upload types on the engine in 003/004, plus the row checks they share with
-- Weight Dispute. Each type is one cn_upload_types row and a row-check function; the
-- engine does everything else (headers, parsing, duplicates, scopes, commit, rollback).
--
--   type          one row per                        replace scope         bill-ledger check
--   lost_damage   AWB × reason                       month + courier       none (no invoice value)
--   ftl_ptl       month × transporter                month + transporter   FTL/PTL ledger
--   3pl           month × 3PL partner × facility     month + 3PL partner   3PL ledger
--
-- Run after 004_cn_background_commit.sql.

-- ── Shared row checks ────────────────────────────────────────────────────────

-- Courier, and the optional account that must belong to it. Used by Weight Dispute and
-- Lost/Damage so both word every problem the same way.
CREATE OR REPLACE FUNCTION public.cn_courier_lookup(p_courier text, p_account text,
  OUT out_courier_id bigint, OUT out_account_id bigint, OUT out_errs text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cn_couriers; a public.cn_courier_accounts; owners text;
BEGIN
  out_errs := '{}';
  IF p_courier IS NULL THEN RETURN; END IF;
  SELECT * INTO c FROM public.cn_couriers WHERE name_key = public.cn_name_key(p_courier);
  IF NOT FOUND THEN
    out_errs := ARRAY[format('Courier "%s" is not in masters — add it under Masters → Couriers first', p_courier)]; RETURN;
  END IF;
  IF NOT c.is_active THEN out_errs := ARRAY[format('Courier "%s" is deactivated in masters', c.name)]; RETURN; END IF;
  out_courier_id := c.id;
  IF p_account IS NULL THEN RETURN; END IF;
  SELECT * INTO a FROM public.cn_courier_accounts WHERE courier_id = c.id AND name_key = public.cn_name_key(p_account);
  IF NOT FOUND THEN
    SELECT string_agg(DISTINCT oc.name, ', ') INTO owners
      FROM public.cn_courier_accounts oa JOIN public.cn_couriers oc ON oc.id = oa.courier_id
     WHERE oa.name_key = public.cn_name_key(p_account);
    out_errs := ARRAY[CASE WHEN owners IS NOT NULL
      THEN format('Courier Account "%s" belongs to %s, not %s', p_account, owners, c.name)
      ELSE format('Courier Account "%s" is not in masters under %s — add it under Masters → Courier accounts first', p_account, c.name) END];
    RETURN;
  END IF;
  IF NOT a.is_active THEN out_errs := ARRAY[format('Courier Account "%s" is deactivated in masters', a.name)]; RETURN; END IF;
  out_account_id := a.id;
END $$;

-- Received > Expected and Expected > Invoice, for the uploads with all three amounts.
CREATE OR REPLACE FUNCTION public.cn_amount_warnings(p jsonb)
RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN (p->>'received_cn')::numeric > (p->>'expected_cn')::numeric
      THEN format('Received CN (%s) is more than Expected CN (%s)', p->>'received_cn', p->>'expected_cn') END,
    CASE WHEN (p->>'expected_cn')::numeric > (p->>'invoice_value')::numeric
      THEN format('Expected CN (%s) is more than Invoice Value (%s)', p->>'expected_cn', p->>'invoice_value') END
  ], NULL)
$$;

-- ── Weight Dispute ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cn_rows_weight_dispute(p_batch_id bigint, p_from int, p_to int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.cn_staging_rows s
     SET parsed = s.parsed || jsonb_build_object('courier_id', x.cid, 'courier_account_id', x.aid),
         scope_key = CASE WHEN s.parsed->>'month' IS NOT NULL AND x.cid IS NOT NULL THEN (s.parsed->>'month') || '|' || x.cid END,
         errors = s.errors || x.errs,
         warnings = s.warnings || x.warns
    FROM (SELECT r.row_no, l.out_courier_id AS cid, l.out_account_id AS aid, l.out_errs AS errs,
                 public.cn_amount_warnings(r.parsed) AS warns
            FROM public.cn_staging_rows r
           CROSS JOIN LATERAL public.cn_courier_lookup(r.parsed->>'courier', r.parsed->>'courier_account') l
           WHERE r.batch_id = p_batch_id AND r.row_no BETWEEN p_from AND p_to) x
   WHERE s.batch_id = p_batch_id AND s.row_no = x.row_no;
END $$;

-- ── Lost/Damage/SLA Breach ───────────────────────────────────────────────────

-- Expected CN defaults to the Shipment Value when left blank (a courier may cap liability
-- lower, so it can be entered). CN No. and CN Received Amt may both be blank: CN pending.
CREATE OR REPLACE FUNCTION public.cn_rows_lost_damage(p_batch_id bigint, p_from int, p_to int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.cn_staging_rows s
     SET parsed = s.parsed || jsonb_build_object('courier_id', x.cid, 'courier_account_id', x.aid,
                                                 'expected_cn', x.expected, 'expected_cn_defaulted', x.defaulted),
         scope_key = CASE WHEN s.parsed->>'month' IS NOT NULL AND x.cid IS NOT NULL THEN (s.parsed->>'month') || '|' || x.cid END,
         errors = s.errors || x.errs,
         warnings = s.warnings || x.warns
    FROM (SELECT r.row_no, l.out_courier_id AS cid, l.out_account_id AS aid, l.out_errs AS errs,
                 a.expected, a.defaulted,
                 array_remove(ARRAY[
                   CASE WHEN NOT a.defaulted AND a.expected > a.ship
                     THEN format('Expected CN (%s) is more than Shipment Value (%s)', a.expected, a.ship) END,
                   CASE WHEN a.recv > a.ship
                          THEN format('CN Received Amt (%s) is more than Shipment Value (%s)', a.recv, a.ship)
                        WHEN a.recv > a.expected
                          THEN format('CN Received Amt (%s) is more than Expected CN (%s)', a.recv, a.expected) END,
                   CASE WHEN r.parsed->>'cn_number' IS NOT NULL AND a.recv IS NULL
                          THEN 'CN No. is given but CN Received Amt is blank'
                        WHEN a.recv > 0 AND r.parsed->>'cn_number' IS NULL
                          THEN 'CN Received Amt is given without a CN No.' END
                 ], NULL) AS warns
            FROM public.cn_staging_rows r
           CROSS JOIN LATERAL public.cn_courier_lookup(r.parsed->>'courier', r.parsed->>'courier_account') l
           CROSS JOIN LATERAL (
             SELECT (r.parsed->>'shipment_value')::numeric AS ship,
                    (r.parsed->>'cn_received_amt')::numeric AS recv,
                    COALESCE((r.parsed->>'expected_cn')::numeric, (r.parsed->>'shipment_value')::numeric) AS expected,
                    (r.parsed->>'expected_cn') IS NULL AS defaulted
           ) a
           WHERE r.batch_id = p_batch_id AND r.row_no BETWEEN p_from AND p_to) x
   WHERE s.batch_id = p_batch_id AND s.row_no = x.row_no;
END $$;

-- AWB + reason is unique among active rows across ALL months and couriers, and an upload
-- only replaces the scopes it contains. So an AWB + reason already saved under a scope this
-- file doesn't cover can't be saved again here; say where it is.
CREATE OR REPLACE FUNCTION public.cn_cross_lost_damage(p_batch_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.cn_staging_rows s
     SET x_errors = s.x_errors || format(
           'AWB %s (%s) is already saved under %s / %s — only a file for that month and courier can replace it',
           d.awb, d.reason, public.cn_month_label(d.month), c.name)
    FROM public.cn_lost_damage d
    JOIN public.cn_couriers c ON c.id = d.courier_id
   WHERE s.batch_id = p_batch_id AND NOT s.has_error AND s.scope_key IS NOT NULL
     AND d.is_active AND d.awb = s.parsed->>'awb' AND d.reason = s.parsed->>'reason'
     AND (d.month::text || '|' || d.courier_id) <> s.scope_key
     AND (d.month::text || '|' || d.courier_id) NOT IN
         (SELECT DISTINCT scope_key FROM public.cn_staging_rows WHERE batch_id = p_batch_id AND scope_key IS NOT NULL);
END $$;

-- ── FTL/PTL ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cn_rows_ftl_ptl(p_batch_id bigint, p_from int, p_to int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.cn_staging_rows s
     SET parsed = s.parsed || jsonb_build_object('transporter_id', x.tid),
         scope_key = CASE WHEN s.parsed->>'month' IS NOT NULL AND x.tid IS NOT NULL THEN (s.parsed->>'month') || '|' || x.tid END,
         errors = s.errors || x.errs,
         warnings = s.warnings || x.warns
    FROM (SELECT r.row_no,
                 CASE WHEN t.is_active THEN t.id END AS tid,
                 array_remove(ARRAY[
                   CASE WHEN r.parsed->>'transporter' IS NOT NULL AND t.id IS NULL
                          THEN format('Transporter "%s" is not in masters — add it under Masters → Transporters first', r.parsed->>'transporter')
                        WHEN t.id IS NOT NULL AND NOT t.is_active
                          THEN format('Transporter "%s" is deactivated in masters', t.name) END
                 ], NULL) AS errs,
                 public.cn_amount_warnings(r.parsed) AS warns
            FROM public.cn_staging_rows r
            LEFT JOIN public.cn_transporters t ON t.name_key = public.cn_name_key(r.parsed->>'transporter')
           WHERE r.batch_id = p_batch_id AND r.row_no BETWEEN p_from AND p_to) x
   WHERE s.batch_id = p_batch_id AND s.row_no = x.row_no;
END $$;

-- ── 3PL ──────────────────────────────────────────────────────────────────────

-- Partner, the facility that must belong to it, and the Location, which must match the
-- facility's location in masters (the data row stores the facility, not the location).
CREATE OR REPLACE FUNCTION public.cn_rows_3pl(p_batch_id bigint, p_from int, p_to int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.cn_staging_rows s
     SET parsed = s.parsed || jsonb_build_object('partner_id', x.pid, 'facility_id', x.fid),
         scope_key = CASE WHEN s.parsed->>'month' IS NOT NULL AND x.pid IS NOT NULL THEN (s.parsed->>'month') || '|' || x.pid END,
         errors = s.errors || x.errs,
         warnings = s.warnings || x.warns
    FROM (SELECT r.row_no,
                 CASE WHEN p.is_active THEN p.id END AS pid,
                 CASE WHEN p.is_active AND f.is_active THEN f.id END AS fid,
                 array_remove(ARRAY[
                   CASE WHEN r.parsed->>'partner' IS NOT NULL AND p.id IS NULL
                          THEN format('3PL Partner "%s" is not in masters — add it under Masters → 3PL partners first', r.parsed->>'partner')
                        WHEN p.id IS NOT NULL AND NOT p.is_active
                          THEN format('3PL Partner "%s" is deactivated in masters', p.name) END,
                   CASE WHEN r.parsed->>'facility' IS NULL OR p.id IS NULL OR NOT p.is_active THEN NULL
                        WHEN f.id IS NULL AND o.partners IS NOT NULL
                          THEN format('3PL Facility "%s" belongs to %s, not %s', r.parsed->>'facility', o.partners, p.name)
                        WHEN f.id IS NULL
                          THEN format('3PL Facility "%s" is not in masters under %s — add it under Masters → 3PL facilities first', r.parsed->>'facility', p.name)
                        WHEN NOT f.is_active
                          THEN format('3PL Facility "%s" is deactivated in masters', f.name)
                        WHEN r.parsed->>'location' IS NOT NULL AND public.cn_name_key(r.parsed->>'location') <> public.cn_name_key(f.location)
                          THEN format('Location "%s" doesn''t match %s''s location in masters (%s)', r.parsed->>'location', f.name, f.location) END
                 ], NULL) AS errs,
                 public.cn_amount_warnings(r.parsed) AS warns
            FROM public.cn_staging_rows r
            LEFT JOIN public.cn_3pl_partners p ON p.name_key = public.cn_name_key(r.parsed->>'partner')
            LEFT JOIN public.cn_3pl_facilities f ON f.partner_id = p.id AND f.name_key = public.cn_name_key(r.parsed->>'facility')
            LEFT JOIN LATERAL (
              SELECT string_agg(DISTINCT op.name, ', ') AS partners
                FROM public.cn_3pl_facilities ofc JOIN public.cn_3pl_partners op ON op.id = ofc.partner_id
               WHERE ofc.name_key = public.cn_name_key(r.parsed->>'facility')
            ) o ON r.parsed->>'facility' IS NOT NULL AND f.id IS NULL
           WHERE r.batch_id = p_batch_id AND r.row_no BETWEEN p_from AND p_to) x
   WHERE s.batch_id = p_batch_id AND s.row_no = x.row_no;
END $$;

-- ── Upload types ─────────────────────────────────────────────────────────────

INSERT INTO public.cn_upload_types
  (code, label, sort, template_file, target_table, partner_col, partner_table, partner_label, ledger_category,
   unique_cols, unique_label, insert_cols, row_fn, cross_fn, columns)
VALUES
(
  'lost_damage', 'Lost/Damage/SLA Breach CN', 2, 'lost_damage_sla_cn_template.xlsx',
  'cn_lost_damage', 'courier_id', 'cn_couriers', 'Courier', NULL,
  ARRAY['awb', 'reason'], 'AWB + Reason',
  ARRAY['awb', 'month', 'courier_id', 'courier_account_id', 'reason', 'shipment_value', 'expected_cn',
        'expected_cn_defaulted', 'cn_received_amt', 'cn_number'],
  'cn_rows_lost_damage', 'cn_cross_lost_damage',
  '[
    {"key": "awb", "label": "AWB", "type": "code", "required": true, "aliases": ["AWB No", "AWB Number", "Airway Bill", "AWB No."],
     "example": "1234567890123", "hint": "Format this column as Text in Excel so long numbers keep every digit"},
    {"key": "month", "label": "Month", "type": "month", "required": true, "example": "Apr-2026",
     "hint": "Invoice month: Apr-2026, 04/2026 or 2026-04"},
    {"key": "courier", "label": "Courier", "type": "text", "required": true, "example": "Bluedart", "hint": "As named in Masters → Couriers"},
    {"key": "courier_account", "label": "Courier Account", "type": "text", "required": false, "aliases": ["Account"],
     "example": "Bluedart Dart Plus", "hint": "Optional. Must belong to the Courier"},
    {"key": "reason", "label": "Reason", "type": "enum", "required": true,
     "enum": ["Lost/Damage", "SLA Breach", "High Ageing", "Wrong Invoicing"], "example": "Lost/Damage",
     "hint": "Pick from the drop-down"},
    {"key": "shipment_value", "label": "Shipment Value", "type": "amount", "required": true,
     "aliases": ["Shipment Value (ex GST)", "Declared Value"], "example": "2499", "hint": "INR"},
    {"key": "expected_cn", "label": "Expected CN", "type": "amount", "required": false, "aliases": ["Expected CN (ex GST)"],
     "example": "", "hint": "Optional. Blank = the full Shipment Value; enter less when the courier caps its liability"},
    {"key": "cn_received_amt", "label": "CN Received Amt", "type": "amount", "required": false,
     "aliases": ["CN Received Amount", "CN Amount", "Received CN"], "example": "", "hint": "Optional. Blank while the CN is pending"},
    {"key": "cn_number", "label": "CN No.", "type": "text", "required": false, "aliases": ["CN No", "CN Number", "Credit Note No"],
     "example": "", "hint": "Optional. The courier''s credit note number"}
  ]'::jsonb
),
(
  'ftl_ptl', 'FTL/PTL CN', 3, 'ftl_ptl_cn_template.xlsx',
  'cn_ftl_ptl', 'transporter_id', 'cn_transporters', 'Transporter', 'FTL/PTL',
  ARRAY['month', 'transporter_id'], 'Month + Transporter',
  ARRAY['month', 'transporter_id', 'invoice_value', 'expected_cn', 'received_cn'],
  'cn_rows_ftl_ptl', NULL,
  '[
    {"key": "month", "label": "Month", "type": "month", "required": true, "example": "Apr-2026",
     "hint": "Invoice month: Apr-2026, 04/2026 or 2026-04"},
    {"key": "transporter", "label": "Transporter", "type": "text", "required": true, "aliases": ["Transporter Name"],
     "example": "Jopadevi", "hint": "As named in Masters → Transporters"},
    {"key": "invoice_value", "label": "Invoice Value (ex GST)", "type": "amount", "required": true,
     "aliases": ["Invoice Value", "Total Invoice Value", "Total Invoice Value (ex GST)"], "example": "850000", "hint": "INR, ex-GST"},
    {"key": "expected_cn", "label": "Total Expected CN (ex GST)", "type": "amount", "required": true,
     "aliases": ["Expected CN", "Total Expected CN"], "example": "25000", "hint": "INR, ex-GST"},
    {"key": "received_cn", "label": "Total Received CN (ex GST)", "type": "amount", "required": true,
     "aliases": ["Received CN", "Total Received CN"], "example": "10000", "hint": "INR, ex-GST; 0 if nothing received yet"}
  ]'::jsonb
),
(
  '3pl', '3PL CN', 4, '3pl_cn_template.xlsx',
  'cn_3pl', 'partner_id', 'cn_3pl_partners', '3PL Partner', '3PL',
  ARRAY['month', 'partner_id', 'facility_id'], 'Month + 3PL Partner + 3PL Facility',
  ARRAY['month', 'partner_id', 'facility_id', 'invoice_value', 'expected_cn', 'received_cn'],
  'cn_rows_3pl', NULL,
  '[
    {"key": "month", "label": "Month", "type": "month", "required": true, "example": "Apr-2026",
     "hint": "Invoice month: Apr-2026, 04/2026 or 2026-04"},
    {"key": "partner", "label": "3PL Partner", "type": "text", "required": true, "aliases": ["3PL", "Partner", "3PL Partner Name"],
     "example": "Hexalog", "hint": "As named in Masters → 3PL partners"},
    {"key": "facility", "label": "3PL Facility", "type": "text", "required": true, "aliases": ["Facility", "Facility Name"],
     "example": "Hexalog_GGN2", "hint": "Must belong to the 3PL Partner (Masters → 3PL facilities)"},
    {"key": "location", "label": "Location", "type": "text", "required": true, "aliases": ["Facility Location"],
     "example": "Gurgaon", "hint": "Must match the facility''s location in masters"},
    {"key": "invoice_value", "label": "Invoice Value (ex GST)", "type": "amount", "required": true,
     "aliases": ["Invoice Value", "Total Invoice Value", "Total Invoice Value (ex GST)"], "example": "460500", "hint": "INR, ex-GST"},
    {"key": "expected_cn", "label": "Total Expected CN (ex GST)", "type": "amount", "required": true,
     "aliases": ["Expected CN", "Total Expected CN"], "example": "18000", "hint": "INR, ex-GST"},
    {"key": "received_cn", "label": "Total Received CN (ex GST)", "type": "amount", "required": true,
     "aliases": ["Received CN", "Total Received CN"], "example": "18000", "hint": "INR, ex-GST; 0 if nothing received yet"}
  ]'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label, sort = EXCLUDED.sort, template_file = EXCLUDED.template_file, target_table = EXCLUDED.target_table,
  partner_col = EXCLUDED.partner_col, partner_table = EXCLUDED.partner_table, partner_label = EXCLUDED.partner_label,
  ledger_category = EXCLUDED.ledger_category, unique_cols = EXCLUDED.unique_cols, unique_label = EXCLUDED.unique_label,
  insert_cols = EXCLUDED.insert_cols, row_fn = EXCLUDED.row_fn, cross_fn = EXCLUDED.cross_fn, columns = EXCLUDED.columns;

REVOKE EXECUTE ON FUNCTION
  public.cn_courier_lookup(text, text),
  public.cn_rows_weight_dispute(bigint, int, int),
  public.cn_rows_lost_damage(bigint, int, int), public.cn_cross_lost_damage(bigint),
  public.cn_rows_ftl_ptl(bigint, int, int), public.cn_rows_3pl(bigint, int, int)
  FROM PUBLIC, anon, authenticated;
