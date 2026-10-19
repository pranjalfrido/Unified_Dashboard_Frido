// Rebuilds public.lc_courier_disputes and public.lc_month_claims.
//
// These are the two tables refresh-cost-aggregates.mjs never reaches: it aborts on the
// disputes build, so both were last written on 24 Sep while the ledger has grown by ~3.5
// lakh shipments since. lc_courier_disputes feeds the Recoverable / claim columns on the
// courier table; lc_month_claims feeds the claim column on the Monthly Trend.
//
// Why a separate runner rather than fixing the main script: the disputes query joins the
// derived rate card TWICE across the full ledger, and `weight_slab IS NOT DISTINCT FROM`
// defeats the index on both joins — a single one of those joins measured 27.9s here, so the
// pair plus the aggregation overruns the timeout the main script sets. Run on its own with a
// 15-minute ceiling and a direct (non-pooler) connection, it completes.
//
// This is a workaround, not a fix. The durable answer is to make those joins indexable —
// most likely a generated slab column on the ledger so the join key is a plain equality
// rather than IS NOT DISTINCT FROM. Once that lands, fold these two builds back into
// refresh-cost-aggregates.mjs and delete this file.

import { config } from 'dotenv'
config()

import pkg from 'pg'
const { Pool } = pkg

// The pooler adds its own ceiling on long statements; the direct port does not.
const connStr = process.env.SUPABASE_DB_URL
  || (process.env.SUPABASE_URL || '').replace(':6543/', ':5432/')
if (!connStr) {
  console.error('SUPABASE_URL not configured')
  process.exit(1)
}

const pool = new Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false },
  max: 2,
  connectionTimeoutMillis: 60000,
  idleTimeoutMillis: 180000,
})
pool.on('error', e => console.error('[pool]', e.message))

const PER_KG_COURIERS = ['Bluedart B2B']
const sqlList = a => a.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ')

const EX_GST = `
  CASE WHEN abs(total_cost::float8
              / NULLIF(freight_charge::float8 + COALESCE(surcharge::float8, 0)
                     + COALESCE(other_charge::float8, 0), 0) - 1.18) < 0.005
       THEN total_cost::float8 / 1.18 ELSE total_cost::float8 END`
const EXI = EX_GST.replace(/(total_cost|freight_charge|surcharge|other_charge)/g, 'i.$1')

const LEG = `CASE WHEN upper(i.shipment_mode)='FORWARD' THEN 'Forward'
                  WHEN upper(i.shipment_mode)='RTO' THEN 'RTO'
                  ELSE 'Reverse' END`

const OUR_WT = 'COALESCE(NULLIF(i.declared_weight_frido, 0), i.charged_weight_courier)'

const SL = col => `CASE WHEN i.courier_name IN (${sqlList(PER_KG_COURIERS)}) THEN NULL
                        WHEN ${col} > 0 AND ${col} <= 0.5 THEN 0.5
                        WHEN ${col} > 0 THEN CEIL(${col})
                        ELSE NULL END`

const CARD = (a, w) => `
  JOIN public.lc_card_dedup ${a}
       ON ${a}.month_year = i.month_year AND ${a}.courier_name = i.courier_name
      AND ${a}.account_type = COALESCE(i.courier_account_type,'(none)')
      AND ${a}.leg = ${LEG} AND ${a}.zone = i.zone
      AND ${a}.weight_slab IS NOT DISTINCT FROM ${SL(w)}
      AND ${a}.payment_mode = COALESCE(i.payment_mode,'(none)')`

async function swap(name, createSql, indexSql) {
  const t = Date.now()
  const c = await pool.connect()
  const onErr = e => console.error(`[${name} client]`, e.message)
  c.on('error', onErr)
  try {
    await c.query('SET statement_timeout = 900000')
    await c.query(`DROP TABLE IF EXISTS public.${name}_new`)
    await c.query(createSql.replace('__TARGET__', `public.${name}_new`))
    if (indexSql) await c.query(indexSql.replace('__IDX__', `idx_${name}_new`).replace('__TARGET__', `public.${name}_new`))
    await c.query(`ANALYZE public.${name}_new`)
    await c.query('BEGIN')
    await c.query(`DROP TABLE IF EXISTS public.${name}`)
    await c.query(`ALTER TABLE public.${name}_new RENAME TO ${name}`)
    await c.query('COMMIT')
    const { rows } = await c.query(`SELECT COUNT(*)::int n FROM public.${name}`)
    console.log(`  ${name.padEnd(22)} ${String(rows[0].n).padStart(6)} rows  ${((Date.now() - t) / 1000).toFixed(1)}s`)
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    console.error(`  ${name.padEnd(22)} FAILED after ${((Date.now() - t) / 1000).toFixed(1)}s: ${e.message}`)
    process.exitCode = 1
  } finally {
    c.removeListener('error', onErr)
    c.release()
  }
}

console.log('rebuilding the two tables the main refresh never reaches …')

await swap('lc_courier_disputes', `
  CREATE TABLE __TARGET__ AS
  WITH j AS (
    SELECT i.courier_name,
           dco.freight_median * (1 + dco.surcharge_rate) AS ours,
           dct.freight_median * (1 + dct.surcharge_rate) AS theirs,
           ${EXI} AS invoiced
      FROM public.logistics_invoices_b2c i
      ${CARD('dct','i.charged_weight_courier')}
      ${CARD('dco', OUR_WT)}
     WHERE i.total_cost > 0 AND i.zone IN ('A','B','C','D','E')
       AND i.charged_weight_courier <= 500
       AND i.month_year IS NOT NULL
  )
  SELECT courier_name,
         COUNT(*)::int AS priced_n,
         -- GREATEST(...,0): billing BELOW their own card is not an overcharge, and letting
         -- it go negative would net off real overbilling on other shipments.
         COALESCE(SUM(GREATEST(theirs - ours, 0)), 0)::float8   AS weight_rs,
         COALESCE(SUM(GREATEST(invoiced - theirs, 0)), 0)::float8 AS rate_rs,
         COALESCE(SUM(GREATEST(theirs - ours, 0) + GREATEST(invoiced - theirs, 0)), 0)::float8 AS total_rs,
         COUNT(*) FILTER (WHERE GREATEST(theirs - ours, 0) + GREATEST(invoiced - theirs, 0) > 1)::int AS disputed_n,
         COALESCE(SUM(invoiced), 0)::float8 AS invoiced_rs
    FROM j
   GROUP BY 1
`, 'CREATE INDEX __IDX__ ON __TARGET__ (courier_name)')

await swap('lc_month_claims', `
  CREATE TABLE __TARGET__ AS
  WITH j AS (
    SELECT i.month_year,
           dco.freight_median * (1 + dco.surcharge_rate) AS ours,
           dct.freight_median * (1 + dct.surcharge_rate) AS theirs,
           ${EXI} AS invoiced
      FROM public.logistics_invoices_b2c i
      ${CARD('dct','i.charged_weight_courier')}
      ${CARD('dco', OUR_WT)}
     WHERE i.total_cost > 0 AND i.zone IN ('A','B','C','D','E')
       AND i.charged_weight_courier <= 500
       AND i.month_year IS NOT NULL
  )
  -- Column list matches refresh-cost-aggregates.mjs exactly: anything reading this table
  -- expects priced_n, rate_variance and invoiced_rs to be present, and a narrower rebuild
  -- would silently drop them.
  SELECT month_year,
         COUNT(*)::int AS priced_n,
         COALESCE(SUM(GREATEST(theirs - ours, 0)), 0)::float8   AS weight_claim,
         COALESCE(SUM(GREATEST(invoiced - theirs, 0)), 0)::float8 AS rate_variance,
         COUNT(*) FILTER (WHERE theirs - ours > 1)::int AS affected_n,
         COALESCE(SUM(invoiced), 0)::float8 AS invoiced_rs
    FROM j
   GROUP BY 1
`, 'CREATE INDEX __IDX__ ON __TARGET__ (month_year)')

await pool.end()
