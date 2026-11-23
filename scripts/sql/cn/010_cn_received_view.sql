-- Logistics Credit Notes — the "CN Received" view in Cost Analytics
-- ==================================================================
-- Logistics → Cost Analytics → Overview has a "CN Received" button opening a summary of every
-- credit note: by category and reason (the layout of finance's CN sheet), by month and by
-- partner. Run after 009_cn_lost_damage_by_month.sql.
--
-- Cost Analytics users may not have Documents access, and the CN tables' row-level security
-- admits only Documents users. So the page reads this one function, which returns totals
-- only (never individual rows) to admins, Documents users and anyone with a Cost Analytics
-- permission.

CREATE OR REPLACE FUNCTION public.cn_can_view_received()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin_user(auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_permissions
                WHERE user_id = auth.uid()
                  AND (tab IN ('documents', 'documents:cn-manage') OR tab = 'logistics:cost' OR tab LIKE 'logistics:cost:%'))
  );
$$;

-- Active CN totals per category × reason × partner × month, and when each upload type was last
-- saved. Invoice values are the ones uploaded with the CNs (Weight Dispute, FTL/PTL, 3PL);
-- Lost/Damage rows carry a shipment value instead, so their invoice is NULL.
CREATE OR REPLACE FUNCTION public.cn_received_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE rows jsonb; updated jsonb;
BEGIN
  IF NOT public.cn_can_view_received() THEN
    RAISE EXCEPTION 'Viewing credit notes needs Cost Analytics or Documents access.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.month, x.category, x.reason, x.partner), '[]') INTO rows FROM (
    SELECT 'B2C' AS category, 'Weight Dispute' AS reason, c.name AS partner, to_char(d.month, 'YYYY-MM') AS month,
           count(*)::int AS n, sum(d.invoice_value) AS invoice, sum(d.expected_cn) AS expected, sum(d.received_cn) AS received
      FROM public.cn_weight_dispute d JOIN public.cn_couriers c ON c.id = d.courier_id
     WHERE d.is_active GROUP BY 1, 2, 3, 4
    UNION ALL
    SELECT 'B2C', d.reason, c.name, to_char(d.month, 'YYYY-MM'),
           count(*)::int, NULL, sum(d.expected_cn), sum(COALESCE(d.cn_received_amt, 0))
      FROM public.cn_lost_damage d JOIN public.cn_couriers c ON c.id = d.courier_id
     WHERE d.is_active GROUP BY 1, 2, 3, 4
    UNION ALL
    SELECT 'FTL/PTL', 'FTL/PTL', t.name, to_char(d.month, 'YYYY-MM'),
           count(*)::int, sum(d.invoice_value), sum(d.expected_cn), sum(d.received_cn)
      FROM public.cn_ftl_ptl d JOIN public.cn_transporters t ON t.id = d.transporter_id
     WHERE d.is_active GROUP BY 1, 2, 3, 4
    UNION ALL
    SELECT '3PL', '3PL', p.name, to_char(d.month, 'YYYY-MM'),
           count(*)::int, sum(d.invoice_value), sum(d.expected_cn), sum(d.received_cn)
      FROM public.cn_3pl d JOIN public.cn_3pl_partners p ON p.id = d.partner_id
     WHERE d.is_active GROUP BY 1, 2, 3, 4
  ) x;

  SELECT COALESCE(jsonb_object_agg(upload_type, last), '{}') INTO updated
    FROM (SELECT upload_type, max(committed_at) AS last FROM public.cn_upload_batches
           WHERE status = 'committed' GROUP BY 1) u;

  RETURN jsonb_build_object('rows', rows, 'updated', updated);
END $$;

REVOKE EXECUTE ON FUNCTION public.cn_can_view_received(), public.cn_received_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cn_can_view_received(), public.cn_received_summary() TO authenticated;
