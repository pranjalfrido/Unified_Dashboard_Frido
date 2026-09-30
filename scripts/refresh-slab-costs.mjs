// Rebuilds public.lc_slab_costs on its own.
//
// Why this exists: refresh-cost-aggregates.mjs builds lc_courier_disputes BEFORE
// lc_slab_costs, and that query reliably exceeds the statement timeout at this ledger size.
// Because the script aborts there, every table after it — lc_month_claims and
// lc_slab_costs — is left at whatever it was when the last complete run finished. The slab
// table had been stale since 24 Sep, reporting 11.1 lakh shipments against a ledger of 14.6
// lakh, so the Weight Slab card understated its whole book by about a quarter.
//
// This runs just the slab build, so the card can be corrected without waiting on the
// unrelated dispute query to be made fast enough to finish.
//
// The SQL is a copy of the block in refresh-cost-aggregates.mjs. That duplication is
// deliberate but temporary: the real fix is to reorder or repair the dispute build so the
// full script completes, at which point this file should be deleted rather than maintained
// alongside it.

import { config } from 'dotenv'
config()

import pkg from 'pg'
const { Pool } = pkg

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
  idleTimeoutMillis: 120000,
})
pool.on('error', e => console.error('[slab pool]', e.message))

// ── Shared definitions, kept identical to refresh-cost-aggregates.mjs ────────────────
// Couriers that bill per kilogram rather than per slab: their rate card has no slab
// dimension, so the join key must be NULL for them or it matches nothing.
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

const SLABC = col => `CASE WHEN i.courier_name IN (${sqlList(PER_KG_COURIERS)}) THEN NULL
                           WHEN ${col} > 0 AND ${col} <= 0.5 THEN 0.5
                           WHEN ${col} > 0 THEN CEIL(${col})
                           ELSE NULL END`

async function swap(name, createSql, indexSql) {
  const t = Date.now()
  const c = await pool.connect()
  // A checked-out client is outside pool.on('error'); without this a dropped connection
  // mid-rebuild takes the process down instead of surfacing as a caught error.
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
    return rows[0].n
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    c.removeListener('error', onErr)
    c.release()
  }
}

console.log('rebuilding lc_slab_costs …')

await swap('lc_slab_costs', `
  CREATE TABLE __TARGET__ AS
  WITH card AS (
    -- ONE row per key. Bluedart B2B has a NULL weight_slab, and IS NOT DISTINCT FROM treats
    -- NULL as equal to NULL, so joining the card directly fans each of its shipments across
    -- every NULL-slab row. Collapsing first keeps the join one-to-one.
    SELECT month_year, courier_name, account_type, leg, zone, payment_mode, weight_slab,
           MIN(freight_median * (1 + surcharge_rate)) AS rate
      FROM public.logistics_rate_card_derived
     WHERE shipments >= 20
     GROUP BY 1,2,3,4,5,6,7
  ),
  j AS (
    SELECT CASE WHEN i.charged_weight_courier <= 0.5 THEN 0.5
                ELSE CEIL(i.charged_weight_courier) END AS slab,
           ${LEG} AS leg,
           ${EXI} AS invoiced,
           i.charged_weight_courier::float8 AS cw,
           ${OUR_WT}::float8 AS dw,
           co.rate AS ours, ct.rate AS theirs
      FROM public.logistics_invoices_b2c i
      LEFT JOIN card ct ON ct.month_year = i.month_year AND ct.courier_name = i.courier_name
                       AND ct.account_type = COALESCE(i.courier_account_type,'(none)')
                       AND ct.leg = ${LEG} AND ct.zone = i.zone
                       AND ct.payment_mode = COALESCE(i.payment_mode,'(none)')
                       AND ct.weight_slab IS NOT DISTINCT FROM ${SLABC('i.charged_weight_courier')}
      LEFT JOIN card co ON co.month_year = i.month_year AND co.courier_name = i.courier_name
                       AND co.account_type = COALESCE(i.courier_account_type,'(none)')
                       AND co.leg = ${LEG} AND co.zone = i.zone
                       AND co.payment_mode = COALESCE(i.payment_mode,'(none)')
                       AND co.weight_slab IS NOT DISTINCT FROM ${SLABC(OUR_WT)}
     WHERE i.total_cost > 0 AND i.zone IN ('A','B','C','D','E')
       AND i.charged_weight_courier <= 500
  )
  SELECT slab,
         COUNT(*)::int AS n,
         COALESCE(SUM(invoiced), 0)::float8 AS cost,
         (SUM(invoiced) / COUNT(*))::float8 AS avg_cost,
         (SUM(invoiced) / NULLIF(SUM(cw), 0))::float8 AS cpk,
         COUNT(*) FILTER (WHERE leg = 'Forward')::int AS fwd_n,
         AVG(invoiced) FILTER (WHERE leg = 'Forward')::float8 AS fwd_avg,
         COUNT(*) FILTER (WHERE leg = 'Reverse')::int AS rev_n,
         AVG(invoiced) FILTER (WHERE leg = 'Reverse')::float8 AS rev_avg,
         COUNT(*) FILTER (WHERE leg = 'RTO')::int AS rto_n,
         AVG(invoiced) FILTER (WHERE leg = 'RTO')::float8 AS rto_avg,
         COALESCE(SUM(GREATEST(theirs - ours, 0))
                  FILTER (WHERE ours IS NOT NULL AND theirs IS NOT NULL AND dw > 0), 0)::float8 AS claim_rs,
         COUNT(*) FILTER (WHERE ours IS NOT NULL AND theirs IS NOT NULL AND dw > 0
                            AND theirs - ours > 1)::int AS claim_n,
         AVG(cw - dw) FILTER (WHERE dw > 0)::float8 AS avg_gap_kg
    FROM j
   GROUP BY 1
`, 'CREATE INDEX __IDX__ ON __TARGET__ (slab)')

const { rows } = await pool.query(`
  SELECT SUM(n)::bigint AS n, SUM(cost)::float8 AS cost, COUNT(*)::int AS slabs
  FROM public.lc_slab_costs`)
const s = rows[0]
console.log(
  `  covers ${Number(s.n).toLocaleString('en-IN')} shipments, ` +
  `Rs${Math.round(s.cost).toLocaleString('en-IN')}, across ${s.slabs} slabs`
)

await pool.end()
