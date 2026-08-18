// Logistics Cost Analytics — server-side aggregation over logistics_invoices_b2c.
//
// WHY THIS EXISTS: the tab originally aggregated in the browser, paging the ledger
// through PostgREST. That table is 539k+ rows and PostgREST caps a response at 1000
// rows, so a full scan meant ~540 requests / ~149MB — which the browser drops with
// "TypeError: Failed to fetch". PostgREST aggregate functions are disabled on this
// project, so the fix is to do the SUM/GROUP BY in Postgres and return a few KB.
// Full-table aggregate measures ~1.2s here versus a crash before.
//
// Read-only: SELECT only, never writes.

import pkg from 'pg'

const { Pool } = pkg

// A DEDICATED pool, deliberately not the shared getPool() from _db.js.
//
// The shared pool is max:10 and serves every other route in server.js. This endpoint's
// queries are full-table scans over 539k rows, and firing several into that shared pool
// starved it — surfacing as "Connection terminated unexpectedly" and "read ECONNRESET",
// two different errors with the same cause. The connection string itself was never the
// problem: at max:3 the identical string runs the heavy aggregate in ~470ms, repeatably.
//
// So: a small private pool, and the queries below are kept few and short.
let costPool
function getCostPool() {
  if (!costPool) {
    const connStr = process.env.SUPABASE_URL
    if (!connStr) throw new Error('SUPABASE_URL not configured')
    costPool = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      // 6, not 3: the handler needs several scans per request and 3 meant queries queued
      // behind each other until connectionTimeoutMillis fired — the "timeout exceeded when
      // trying to connect" this endpoint kept returning. Still well under the shared pool's
      // 10 so the two together stay inside the pooler's limit.
      max: 6,
      // Waiting 45s beats failing: the heavy aggregates take seconds, and a queued request
      // that completes late is far better than a 500 the user has to retry.
      connectionTimeoutMillis: 45000,
      idleTimeoutMillis: 30000,
      // Hard ceiling on a single query. Without it, one pathological scan pins a connection
      // indefinitely and every later request starves behind it.
      statement_timeout: 120000,
    })
    // Without this, an idle-client error from the pooler becomes an unhandled
    // rejection that takes the whole server process down.
    costPool.on('error', e => console.error('[logistics-cost pool]', e.message))
  }
  return costPool
}

// Slicer options, destination cities and the B2B ledger do not depend on the filters,
// so they are fetched once and cached rather than re-queried per request. This was also
// a reliability fix: running them sequentially AFTER the main aggregate meant hitting a
// connection the pooler had since dropped, producing an intermittent ECONNRESET that a
// retry could not recover from mid-stream.
// 60 minutes, not 5. The underlying ledger changes only when invoices are uploaded by hand,
// so a short window bought no freshness and made users pay the ~56s cold rebuild repeatedly.
// After an upload, run scripts/refresh-cost-aggregates.mjs and restart (or POST
// {action:'invalidate'}) rather than waiting this out.
const REF_TTL_MS = 60 * 60 * 1000
let refCache = null

// Full-response cache keyed on the filter payload. Bounded to RESP_CACHE_MAX entries so a
// user cycling through slicers cannot grow it without limit; oldest key is evicted first.
const RESP_TTL_MS = 60 * 60 * 1000
const RESP_CACHE_MAX = 24
const respCache = new Map()

// Stable key: JSON.stringify is order-sensitive, so sort the entries first or the same
// filter set arriving in a different key order would miss the cache.
function cacheKey(f) {
  const pick = {}
  for (const k of Object.keys(f).sort()) {
    if (k === 'action') continue
    const v = f[k]
    if (v == null || (Array.isArray(v) && v.length === 0)) continue
    pick[k] = Array.isArray(v) ? [...v].sort() : v
  }
  return JSON.stringify(pick)
}

// The pooler occasionally resets an idle connection. That surfaces as ECONNRESET on the
// next use and is transient, so retry once on connection-level errors only — never on a
// SQL error, which would just fail again identically.
const TRANSIENT = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', '57P01', '08006', '08003'])

// Runs tasks with a hard concurrency cap. Promise.all fires everything at once, so 8-10
// queries against a max:6 pool left several waiting on a connection while the ones holding
// them ran multi-second scans — that queueing, not the network, is what produced the
// intermittent connect timeouts. Capping below the pool size guarantees a free connection
// is always available for whichever task starts next.
async function mapLimit(tasks, limit) {
  const out = new Array(tasks.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= tasks.length) return
      out[i] = await tasks[i]()
    }
  })
  await Promise.all(workers)
  return out
}

async function query(pool, sql, params) {
  for (let attempt = 0; ; attempt++) {
    try {
      // Calls the driver directly — must not recurse into this wrapper.
      return await pool.query(sql, params)
    } catch (e) {
      const transient = TRANSIENT.has(e.code) || /ECONNRESET|terminated unexpectedly/i.test(e.message || '')
      if (!transient || attempt >= 2) throw e
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)))
    }
  }
}

// Weight units were fixed at source (Aug 2026): Swift and Delhivery now upload kilograms
// like every other courier, so the per-courier gram detection that used to live here is
// gone. Verified after reupload — zero rows above 500 kg across all 664,926, and
// Delhivery's max fell from 139,840 to 155 kg.
//
// This ceiling stays as a guard, not a correction. It currently matches nothing, but an
// earlier partial gram->kg conversion left 2,416 rows claiming "139,840 kg" for a ₹3,673
// parcel, which silently wrecked every ₹/kg figure on the page. If that recurs, the
// impossible rows drop out instead of distorting the dashboard.
const MAX_PLAUSIBLE_PARCEL_KG = 500

// Billable slab = how a courier rate card actually steps: 0.5 kg minimum, then round
// up to the next whole kg (0.4->0.5, 0.6->1, 1.2->2, 3.0->3).
// <= 0.5, not < 0.5: a shipment of exactly 0.5 kg belongs in the 0.5 slab. With a
// strict <, CEIL(0.5) promotes it to the 1 kg slab, which over-states the billable
// slab for a large share of parcels (173,220 Bluedart rows sit at exactly 0.5 kg).
const SLAB_SQL = `CASE WHEN dw > 0 AND dw <= 0.5 THEN 0.5
                       WHEN dw > 0 THEN CEIL(dw)
                       ELSE NULL END`

// Same slab rule, applied to any weight column. Used to round BOTH the courier's
// charged weight and our declared weight before comparing them, so the weight gap is
// expressed in billable slabs rather than raw kilograms.
const SLAB_OF = col => `CASE WHEN ${col} > 0 AND ${col} <= 0.5 THEN 0.5
                             WHEN ${col} > 0 THEN CEIL(${col})
                             ELSE 0 END`

// ── Delhivery GST correction ────────────────────────────────────────────────────
// Delhivery's total_cost was uploaded GST-INCLUSIVE while every other courier's is
// ex-GST, so an uncorrected total mixes tax-inclusive and tax-exclusive figures and no
// cross-courier comparison holds.
//
// Verified before applying: total_cost / (freight + surcharge + other) = 1.180 on
// 58,128 of 58,128 Delhivery rows — 100%, no exceptions in any month. That exactness is
// what makes a blanket divide safe; a partial match would not have been.
//
// Applied on READ, not written to the table: the ledger is the uploaded record and the
// user will re-upload ex-GST totals, at which point this correction must stop firing.
// Keying on the 1.18 ratio rather than on the courier name alone means it retires
// itself automatically — once ex-GST totals land, the ratio is 1.0 and this is a no-op.
// A blanket "if Delhivery then divide" would silently strip 18% from the new data too.
const GST_DIVISOR = 1.18
const exGst = (totalCol, freightCol, surCol, othCol) => `
  CASE WHEN abs(${totalCol} / NULLIF(${freightCol} + COALESCE(${surCol}, 0)
                                  + COALESCE(${othCol}, 0), 0) - ${GST_DIVISOR}) < 0.005
       THEN ${totalCol} / ${GST_DIVISOR}
       ELSE ${totalCol} END`


// ── Claim Register (spec §2) ────────────────────────────────────────────────────
// Grain is (courier, tier, month): at ~25-31 rupees recoverable per shipment nobody
// files 256,159 individual claims, so a claim covers the whole group and the AWB detail
// is exported as the evidence pack. Recovered money is the point — claimable is a
// hypothesis, credited is a result.
const CLAIM_TIERS = {
  // Strongest first. 'admitted' needs no argument: the courier's own remarks concede it.
  admitted: `courier_admits = 'admitted' AND frido_carrier - frido_base > 0`,
  wrong_rate: `inv_freight - frido_carrier > 1`,
  wrong_weight: `frido_carrier - frido_base > 1 AND courier_admits IS DISTINCT FROM 'admitted'`,
}

async function fileClaim(pool, body) {
  const { courier, tier, month, minAmount = 10 } = body
  if (!courier || !month) throw new Error('courier and month are required')
  if (!CLAIM_TIERS[tier]) throw new Error(`unknown tier: ${tier}`)

  // Recompute the claim from the ledger at filing time, then freeze it. The ledger gets
  // re-priced whenever rate cards or weights improve, so a filed claim must keep the
  // numbers it was argued on or it cannot be defended later.
  const { rows } = await query(pool, `
    WITH norm AS (
      SELECT i.courier_name, i.month_year,
             i.freight_charge::float8 AS inv_freight,
             i.frido_billed_cost::float8 AS frido_base,
             i.frido_carrier_cost::float8 AS frido_carrier,
             CASE WHEN i.rmk_weight_dispute ILIKE '%wrong weight charged%'
                    OR i.rmk_weight_dispute ILIKE '%under charged%'
                  THEN 'admitted' ELSE NULL END AS courier_admits
        FROM public.logistics_invoices_b2c i
       WHERE i.total_cost > 0 AND i.zone IN ('A','B','C','D','E')
         AND i.charged_weight_courier <= ${MAX_PLAUSIBLE_PARCEL_KG}
         AND i.frido_carrier_cost IS NOT NULL
         AND i.courier_name = $1 AND i.month_year = $2
    )
    SELECT COUNT(*)::int AS n,
           COALESCE(SUM(GREATEST(frido_carrier - frido_base, 0) + GREATEST(inv_freight - frido_carrier, 0)), 0)::float8 AS claim,
           COALESCE(SUM(frido_base), 0)::float8 AS card_cost,
           COALESCE(SUM(inv_freight), 0)::float8 AS billed
      FROM norm
     WHERE ${CLAIM_TIERS[tier]}
       AND GREATEST(frido_carrier - frido_base, 0) + GREATEST(inv_freight - frido_carrier, 0) > $3
  `, [courier, month, minAmount])

  const r = rows[0]
  if (!r || r.n === 0) throw new Error('nothing claimable for that courier/tier/month at this threshold')

  const { rows: out } = await query(pool, `
    INSERT INTO public.logistics_claims
      (courier_name, month_year, tier, shipment_count, claim_amount, status,
       ev_min_amount, ev_card_cost, ev_billed, ev_snapshot_at)
    VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8, now())
    ON CONFLICT (courier_name, tier, month_year) DO UPDATE SET
      shipment_count = EXCLUDED.shipment_count,
      claim_amount   = EXCLUDED.claim_amount,
      ev_min_amount  = EXCLUDED.ev_min_amount,
      ev_card_cost   = EXCLUDED.ev_card_cost,
      ev_billed      = EXCLUDED.ev_billed,
      ev_snapshot_at = now(),
      updated_at     = now()
    RETURNING *
  `, [courier, month, tier, r.n, r.claim, minAmount, r.card_cost, r.billed])
  return out[0]
}

async function updateClaim(pool, body) {
  const { id, status, creditedAmount, creditNote, notes } = body
  if (!id) throw new Error('id is required')
  const allowed = ['draft', 'filed', 'accepted', 'rejected', 'credited']
  if (status && !allowed.includes(status)) throw new Error(`unknown status: ${status}`)

  const { rows } = await query(pool, `
    UPDATE public.logistics_claims SET
      status          = COALESCE($2, status),
      credited_amount = COALESCE($3, credited_amount),
      credit_note     = COALESCE($4, credit_note),
      notes           = COALESCE($5, notes),
      -- Stamp the lifecycle dates automatically so aging is trustworthy.
      filed_on   = CASE WHEN $2 = 'filed' AND filed_on IS NULL THEN CURRENT_DATE ELSE filed_on END,
      settled_on = CASE WHEN $2 IN ('accepted','rejected','credited') AND settled_on IS NULL
                        THEN CURRENT_DATE ELSE settled_on END,
      updated_at = now()
     WHERE id = $1
    RETURNING *
  `, [id, status ?? null, creditedAmount ?? null, creditNote ?? null, notes ?? null])
  if (!rows.length) throw new Error(`claim ${id} not found`)
  return rows[0]
}

// Fills the caches before any user request, then keeps them filled.
//
// The cold path is ~56s — GROUPED alone is 29s of irreducible aggregation over 660k rows —
// so the goal is that a real request never triggers it. Refreshes at 90% of the TTL, which
// keeps the entry warm without a thundering herd of overlapping rebuilds.
//
// Failures are logged and retried on the next tick rather than thrown: a warm-up that cannot
// reach the database must not stop the server from serving other routes.
let warmTimer = null
export async function prewarm() {
  const fakeRes = {
    status() { return this },
    json() { return this },
  }
  const t = Date.now()
  try {
    // The default page load — scope b2c, no filters — is the entry worth having warm.
    await handler({ method: 'POST', body: { scope: 'b2c' } }, fakeRes)
    console.log(`[logistics-cost] cache warm in ${((Date.now() - t) / 1000).toFixed(1)}s`)
  } catch (e) {
    console.error('[logistics-cost] prewarm failed:', e.message)
  }
  clearTimeout(warmTimer)
  warmTimer = setTimeout(prewarm, RESP_TTL_MS * 0.9)
  // Do not hold the process open on this timer alone.
  warmTimer.unref?.()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const f = req.body || {}
  const pool = getCostPool()

  // Cache hit short-circuits everything below. Claim mutations are excluded (handled next)
  // because they must always reach the database.
  if (f.action !== 'fileClaim' && f.action !== 'updateClaim') {
    const hit = respCache.get(cacheKey(f))
    if (hit && Date.now() - hit.at < RESP_TTL_MS) {
      return res.status(200).json(hit.body)
    }
  }

  // Drops both caches. Called after an invoice upload + aggregate refresh so the next
  // request rebuilds, instead of serving stale numbers until the TTL expires.
  if (f.action === 'invalidate') {
    respCache.clear()
    refCache = null
    return res.status(200).json({ ok: true, invalidated: true })
  }

  // Claim mutations share this endpoint so the dashboard needs only one route.
  if (f.action === 'fileClaim' || f.action === 'updateClaim') {
    try {
      const claim = f.action === 'fileClaim'
        ? await fileClaim(pool, f)
        : await updateClaim(pool, f)
      return res.status(200).json({ ok: true, claim })
    } catch (e) {
      console.error('[logistics-cost claim]', e.message)
      return res.status(400).json({ error: e.message })
    }
  }

  try {
    // ── Build the filtered base CTE ──
    // No unit detection: every courier now uploads kilograms (verified — zero rows above
    // 500 kg across all 664,926, and Delhivery's max is 155 kg). The old per-courier
    // gram normalisation is gone; weights are read as stored.
    const params = []
    // Only the five real courier zones. The ledger also holds a handful of malformed
    // values ("North", "West" — 161 rows, 0.025% of volume, ₹25,444) that are city
    // names rather than zones; they have no rate card and were showing as empty bars
    // in the zone chart. Excluded at source so every KPI, chart and table agrees.
    const where = [
      "i.total_cost > 0",
      "i.zone IN ('A','B','C','D','E')",
      // Physical-plausibility guard. Currently matches zero rows (max in the ledger is
      // 198 kg), but it is cheap insurance: a partial gram->kg conversion previously
      // left 2,416 rows claiming "139,840 kg" for a ₹3,673 parcel, which silently wrecked
      // every ₹/kg figure. If that recurs, those rows drop out instead of distorting the
      // dashboard.
      `i.charged_weight_courier <= ${MAX_PLAUSIBLE_PARCEL_KG}`,
    ]
    const add = (sql, val) => { params.push(val); where.push(sql.replace('$?', '$' + params.length)) }

    if (f.months?.length) add('i.month_year = ANY($?)', f.months)
    if (f.zones?.length) add('i.zone = ANY($?)', f.zones)
    // Filter on the SAME collapsed grouping the chart displays — otherwise picking
    // "Reverse" in the slicer would match only literal 'Reverse' rows and silently
    // drop the RVP and DTO shipments folded into that bar.
    if (f.modes?.length) {
      add(`CASE
             WHEN upper(i.shipment_mode) IN ('REVERSE','RVP','DTO','RTO') THEN 'Reverse'
             WHEN upper(i.shipment_mode) = 'FORWARD' THEN 'Forward'
             ELSE COALESCE(i.shipment_mode, 'Unknown')
           END = ANY($?)`, f.modes)
    }
    if (f.payments?.length) add('i.payment_mode = ANY($?)', f.payments)
    if (f.couriers?.length) add('i.courier_name = ANY($?)', f.couriers)
    if (f.accountTypes?.length) add('i.courier_account_type = ANY($?)', f.accountTypes)
    if (f.destCity) add('i.destination_city = $?', f.destCity)

    const bandClauses = {
      '0-1': 'cw >= 0 AND cw < 1',
      '1-2': 'cw >= 1 AND cw < 2',
      '2-5': 'cw >= 2 AND cw < 5',
      '5-10': 'cw >= 5 AND cw < 10',
      '10+': 'cw >= 10',
    }
    const postFilters = []
    if (f.band && bandClauses[f.band]) postFilters.push(bandClauses[f.band])
    // Billing accuracy compares two columns, so it also belongs after normalisation.
    // Overbilled/Clean must use the SAME slab-based comparison the KPIs report, or the
    // slicer would disagree with the numbers it is meant to filter.
    //
    // COALESCE(dw, 0) matters: declared_weight_frido is NULL on 17,499 Delhivery rows,
    // and SQL three-valued logic makes NOT(NULL) evaluate to NULL — so without this
    // those rows were dropped from BOTH buckets and over + clean didn't sum to the
    // total. Treating a missing declared weight as 0 puts them in "Clean", which is
    // right: with no declared weight there is nothing proven against the courier.
    const slabOver = `${SLAB_OF('cw')} - ${SLAB_OF('COALESCE(dw, 0)')} > 0.001 AND COALESCE(dw, 0) > 0`
    if (f.billing === 'over') postFilters.push(slabOver)
    if (f.billing === 'ok') postFilters.push(`NOT (${slabOver})`)

    // ── Surcharge rates, per courier per month ──
    // The rate card prices BASE FREIGHT only, but three couriers add a fuel surcharge and
    // other charges on top, and those are a real part of what we owe. Comparing a
    // base-only entitlement against a base-only invoice hides them from both sides, so the
    // section understates the true bill.
    //
    // The rate is derived from the courier's OWN invoices — sum(surcharge)/sum(freight) per
    // courier per month — because no contract sheet covers every partner and the invoices
    // are the authority on what was actually applied. Weighted (sum ÷ sum) rather than a
    // mean of per-row ratios, so a ₹20 parcel cannot outvote a ₹2,000 one.
    //
    // PER MONTH, not a single blended rate: Bluedart's other-charge load moved 7.1% → 13.3%
    // across Apr–Jul and Bluedart B2B's surcharge moved 40.9% → 57.9%. One blended figure
    // would misprice every month except the average.
    //
    // Six couriers bill a single all-in number (total_cost = freight_charge on 100% of
    // rows), so their rate is legitimately 0 — their surcharge is already inside the
    // freight they invoiced, and grossing it up again would double-count.
    // Derived from (ex-GST total ÷ freight) − 1, NOT from summing the surcharge and
    // other_charge columns. Those two columns do not always account for the whole gap
    // between freight and total: for Delhivery they sum to 6.3% while the real ex-GST
    // add-on load is 20.0%, so column-summing would under-gross the entitlement and
    // manufacture a false overcharge. The total is the authority on what was billed.
    //
    // Six couriers bill a single all-in number (total = freight on 100% of rows), so their
    // rate falls out as 0 naturally — their surcharge is already inside that freight, and
    // grossing it up again would double-count.
    // Reads a PRE-COMPUTED table, not an inline aggregate.
    //
    // As a CTE this scanned and grouped the entire ledger, and because it lives inside BASE —
    // which four separate queries expand — a single page load re-derived it four times. That
    // was ~20s of GROUPED's 31.5s: the query shape alone measures 10s standalone.
    //
    // Rebuilt only by scripts/refresh-cost-aggregates.mjs, run after an invoice upload.
    // Nothing here triggers it: a filter change or reload must never recompute it.
    const RATES = `
      rates AS (SELECT courier_name, month_year, addon_rate FROM public.lc_addon_rate)`

    const BASE = `
      WITH ${RATES},
      norm AS (
        SELECT
          i.month_year, i.courier_name, i.zone, i.shipment_mode, i.payment_mode,
          i.courier_account_type, i.destination_city, i.origin_city,
          -- Shipment mode, collapsed to the two legs that matter commercially: freight
          -- that carries revenue, and freight that doesn't. RTO / RVP / DTO / Reverse are
          -- all goods coming back, so they report as one "Reverse" bucket.
          --
          -- NOTE: pricing still treats RTO separately (90% of forward, per the rate
          -- cards) — this grouping is for REPORTING only and must not be reused as a
          -- pricing key, or RTO would be priced as a full reverse leg.
          CASE
            WHEN upper(i.shipment_mode) IN ('REVERSE', 'RVP', 'DTO', 'RTO') THEN 'Reverse'
            WHEN upper(i.shipment_mode) = 'FORWARD' THEN 'Forward'
            ELSE COALESCE(i.shipment_mode, 'Unknown')
          END AS mode_group,
          -- Ex-GST so Delhivery is comparable with the other couriers. See exGst().
          ${exGst('i.total_cost::float8', 'i.freight_charge::float8', 'i.surcharge::float8', 'i.other_charge::float8')} AS cost,
          i.freight_charge::float8 AS inv_freight,
          i.surcharge::float8  AS surcharge,
          i.shipment_value::float8 AS ship_value,
          -- Rate-card pricing written by scripts/price-ledger.mjs:
          --   frido_billed_cost  = card rate on OUR declared weight (entitlement)
          --   frido_carrier_cost = same card on the COURIER's charged weight (control)
          -- The gap between them is freight charged for weight we did not ship.
          i.frido_billed_cost::float8  AS frido_base,
          i.frido_addl_charges::float8 AS frido_addl,
          i.frido_total_cost::float8   AS frido_total,
          i.frido_carrier_cost::float8 AS frido_carrier,
          -- Entitlement GROSSED UP by the courier's own surcharge rate for that month, so
          -- it is comparable with the all-in invoice rather than with base freight only.
          -- COALESCE(rate, 0) leaves the all-in couriers untouched: their surcharge is
          -- already inside the freight they billed, so multiplying again would double it.
          (i.frido_billed_cost::float8  * (1 + COALESCE(r.addon_rate, 0))) AS frido_base_allin,
          (i.frido_carrier_cost::float8 * (1 + COALESCE(r.addon_rate, 0))) AS frido_carrier_allin,
          COALESCE(r.addon_rate, 0)::float8 AS addon_rate,
          -- The courier's OWN weight-dispute annotation, parsed from the remarks blob.
          -- Only Bluedart writes these (42,264 rows). Where it says "wrong weight
          -- charged" our independent slab analysis agrees on 100% of 36,168 rows, and
          -- where it says "under weight charged" we agree on 0% — two unrelated methods
          -- reaching the same verdict, which makes this the strongest claim tier: the
          -- courier has already conceded the error in writing.
          CASE
            WHEN i.rmk_weight_dispute ILIKE '%wrong weight charged%' THEN 'admitted'
            WHEN i.rmk_weight_dispute ILIKE '%under charged%'        THEN 'admitted'
            ELSE NULL
          END AS courier_admits,
          -- Read as stored: all couriers upload kilograms as of the Aug 2026 reupload.
          i.charged_weight_courier::float8 AS cw,
          i.declared_weight_frido::float8  AS dw
        FROM public.logistics_invoices_b2c i
        LEFT JOIN rates r ON r.courier_name = i.courier_name
                         AND r.month_year  = i.month_year
        WHERE ${where.join(' AND ')}
      ),
      base AS (
        SELECT *,
               ${SLAB_SQL} AS slab,
               -- Both weights rounded to their BILLABLE SLAB before differencing.
               -- Couriers charge per slab, not per gram, so a raw kg difference
               -- overstates the problem: a 0.60 kg parcel billed at 0.72 kg is a 0.12 kg
               -- raw gap but both land in the 1 kg slab, so the invoice is identical and
               -- there is nothing to dispute. Slab-differencing drops those false
               -- positives (196,781 flagged rows -> 127,522) while raising real excess
               -- weight (181,975 kg -> 204,073 kg), because a slab crossing costs a
               -- whole slab.
               -- COALESCE so a NULL declared weight yields a 0 slab rather than a NULL
               -- gap (NULL would silently drop the row from every FILTER below).
               (${SLAB_OF('cw')} - ${SLAB_OF('COALESCE(dw, 0)')}) AS gap,
               ${SLAB_OF('cw')} AS cw_slab,
               ${SLAB_OF('COALESCE(dw, 0)')} AS dw_slab,
               -- Materialised so GROUPING SETS can group on it like any other column.
               CASE WHEN cw < 1 THEN '0 – 1 kg'
                    WHEN cw < 2 THEN '1 – 2 kg'
                    WHEN cw < 5 THEN '2 – 5 kg'
                    WHEN cw < 10 THEN '5 – 10 kg'
                    ELSE '10 kg +' END AS band
          FROM norm
         WHERE cw > 0
         ${postFilters.length ? 'AND ' + postFilters.map(c => `(${c})`).join(' AND ') : ''}
      )
    `

    // ── 3. Every dimension in ONE pass via GROUPING SETS ──
    // Nine concurrent full-table scans exhausted the connection pool. GROUPING SETS
    // reads the table once and emits the grand total plus every breakdown as labelled
    // rows, so this is a single short query instead of nine competing ones — which is
    // both the correctness fix and ~9x less database work.
    const GROUPED = `
      ${BASE}
      SELECT
        CASE
          WHEN GROUPING(zone) = 0 THEN 'zone'
          WHEN GROUPING(mode_group) = 0 THEN 'mode'
          WHEN GROUPING(month_year) = 0 THEN 'month'
          WHEN GROUPING(courier_name) = 0 THEN 'courier'
          WHEN GROUPING(payment_mode) = 0 THEN 'pay'
          WHEN GROUPING(courier_account_type) = 0 THEN 'acct'
          WHEN GROUPING(band) = 0 THEN 'band'
          ELSE 'total'
        END AS dim,
        COALESCE(zone, mode_group, month_year, courier_name,
                 payment_mode, courier_account_type, band, 'ALL')::text AS key,
        COUNT(*)::int              AS n,
        SUM(cost)::float8          AS cost,
        SUM(cw)::float8            AS wt,
        SUM(dw)::float8            AS decl_wt,
        SUM(ship_value)::float8    AS value,
        SUM(surcharge)::float8     AS surcharge,
        COUNT(*) FILTER (WHERE gap > 0.001 AND COALESCE(dw, 0) > 0)::int AS over_n,
        COALESCE(SUM(gap) FILTER (WHERE gap > 0.001 AND COALESCE(dw, 0) > 0), 0)::float8 AS over_kg,
        -- Recoverable split by CAUSE, per dimension. The two need different remedies:
        --   inflation   = courier billed a heavier weight than we shipped (weight dispute)
        --   unexplained = billed above their own card even at their own weight (rate dispute)
        COALESCE(SUM(GREATEST(frido_carrier - frido_base, 0)), 0)::float8 AS rec_infl,
        COALESCE(SUM(GREATEST(inv_freight - frido_carrier, 0)), 0)::float8 AS rec_unexp,
        -- Courier-admitted subset of the weight claim. This is not additional money —
        -- it is the portion of rec_infl the courier has already conceded in writing,
        -- so it must never be added to a claim total, only shown as its strongest part.
        COUNT(*) FILTER (WHERE courier_admits = 'admitted')::int AS rec_admit_n,
        COALESCE(SUM(GREATEST(frido_carrier - frido_base, 0)) FILTER (WHERE courier_admits = 'admitted'), 0)::float8 AS rec_admit,
        -- Claimable at the practical filing threshold. Below ~10 rupees per shipment the
        -- admin cost of a claim exceeds the recovery; a 10-rupee floor keeps 94.4% of the
        -- value in 175k of 256k rows, so the register stays a work queue not a data dump.
        COUNT(*) FILTER (WHERE GREATEST(frido_carrier - frido_base, 0) + GREATEST(inv_freight - frido_carrier, 0) > 10)::int AS claimable_n,
        COALESCE(SUM(GREATEST(frido_carrier - frido_base, 0) + GREATEST(inv_freight - frido_carrier, 0))
                 FILTER (WHERE GREATEST(frido_carrier - frido_base, 0) + GREATEST(inv_freight - frido_carrier, 0) > 10), 0)::float8 AS claimable_rs,
        -- Reverse-leg share, an operational-quality signal per courier.
        COUNT(*) FILTER (WHERE mode_group <> 'Forward')::int AS reverse_n,
        -- Excess valued at each shipment's own effective rate, not a blended one.
        -- The denominator is the CHARGED SLAB, matching the slab-based gap above, so
        -- rate x excess-slabs is internally consistent.
        COALESCE(SUM((cost / NULLIF(cw_slab, 0)) * gap) FILTER (WHERE gap > 0.001 AND COALESCE(dw, 0) > 0), 0)::float8 AS over_cost,
        COUNT(*) FILTER (WHERE slab IS NOT NULL AND cw - slab > 0.001)::int AS slab_n,
        COALESCE(SUM(cw - slab) FILTER (WHERE slab IS NOT NULL AND cw - slab > 0.001), 0)::float8 AS slab_kg,
        COALESCE(SUM((cost / cw) * (cw - slab)) FILTER (WHERE slab IS NOT NULL AND cw - slab > 0.001), 0)::float8 AS slab_cost,
        -- Rate-card variance
        COALESCE(SUM(frido_base), 0)::float8      AS rc_entitled,
        COALESCE(SUM(frido_carrier), 0)::float8   AS rc_carrier,
        -- All-in figures: entitlement and control with each courier's own monthly surcharge
        -- applied, so they can be set against total_cost instead of base freight.
        COALESCE(SUM(frido_base_allin), 0)::float8    AS rc_entitled_allin,
        COALESCE(SUM(frido_carrier_allin), 0)::float8 AS rc_carrier_allin,
        -- The surcharge WE owe on our own entitlement — what the card-only figure omits.
        COALESCE(SUM(frido_base_allin - frido_base), 0)::float8 AS rc_entitled_surcharge,
        -- Invoiced surcharge + other, so the two sides of the comparison are visible.
        COALESCE(SUM(cost - inv_freight), 0)::float8 AS inv_addons,
        COALESCE(SUM(frido_total), 0)::float8     AS rc_total,
        COALESCE(SUM(inv_freight), 0)::float8     AS inv_freight,
        COUNT(frido_base)::int                    AS rc_priced,
        -- Rows where the courier's own card, at their own weight, still under-runs the
        -- invoice: that is an overcharge the rate card cannot explain.
        COUNT(*) FILTER (WHERE frido_carrier IS NOT NULL AND inv_freight - frido_carrier > 0.5)::int AS rc_over_n,
        COALESCE(SUM(inv_freight - frido_carrier) FILTER (WHERE frido_carrier IS NOT NULL AND inv_freight - frido_carrier > 0.5), 0)::float8 AS rc_over_cost,
        -- Weight inflation: card priced at their weight minus card priced at ours.
        COALESCE(SUM(frido_carrier - frido_base) FILTER (WHERE frido_carrier IS NOT NULL AND frido_carrier > frido_base), 0)::float8 AS rc_infl_cost,
        COUNT(*) FILTER (WHERE frido_carrier IS NOT NULL AND frido_carrier - frido_base > 0.5)::int AS rc_infl_n,
        -- Deliveries where freight eats more than a quarter of the order value. These
        -- are the shipments that destroy contribution margin regardless of rate card.
        COUNT(*) FILTER (WHERE ship_value > 0 AND cost > 0.25 * ship_value)::int AS margin_killer_n,
        COALESCE(SUM(cost) FILTER (WHERE ship_value > 0 AND cost > 0.25 * ship_value), 0)::float8 AS margin_killer_cost
      FROM base
      GROUP BY GROUPING SETS (
        (), (zone), (mode_group), (month_year),
        (courier_name), (payment_mode), (courier_account_type), (band)
      )
    `

    // ── Like-for-like courier comparison ──
    // Per-shipment averages are not comparable across couriers because each carries a
    // different weight and zone mix. This holds BOTH constant — forward parcels only,
    // grouped by (zone, weight slab) — and reports each courier's average within the
    // cell, so the numbers can actually be set side by side. A courier only appears in
    // a cell where it has enough shipments to be meaningful.
    const lflQ = () => query(pool, `
      ${BASE}
      SELECT zone,
             CASE WHEN cw < 1 THEN '0 – 1 kg'
                  WHEN cw < 2 THEN '1 – 2 kg'
                  WHEN cw < 5 THEN '2 – 5 kg'
                  WHEN cw < 10 THEN '5 – 10 kg'
                  ELSE '10 kg +' END AS band,
             -- Leg is a returned dimension now, not a hard-coded Forward filter, so the UI
             -- can compare couriers on reverse and RTO legs too. A courier that is cheapest
             -- outbound is not necessarily cheapest on returns.
             mode_group AS leg,
             courier_name,
             COUNT(*)::int      AS n,
             AVG(cost)::float8  AS avg_cost,
             (SUM(cost) / NULLIF(SUM(cw), 0))::float8 AS cpk
        FROM base
       GROUP BY 1, 2, 3, 4
      -- 200 was tuned for forward-only volumes; reverse and RTO legs are an order of
      -- magnitude thinner, so a flat 200 would erase them from the comparison entirely.
      HAVING COUNT(*) >= 50
       ORDER BY 1, 2, 3, 6
    `, params)

    // ── Rate drift: ₹/kg per courier per month ──
    // A courier quietly raising its effective rate is invisible in a blended total but
    // shows up immediately here. Couriers with thin months are excluded so a handful of
    // shipments can't produce a fake spike.
    const driftQ = () => query(pool, `
      ${BASE}
      SELECT month_year, courier_name,
             COUNT(*)::int AS n,
             (SUM(cost) / NULLIF(SUM(cw), 0))::float8 AS cpk
        FROM base
       GROUP BY 1, 2
      HAVING COUNT(*) >= 500
       ORDER BY 2, 1
    `, params)

    // Lanes stay separate: high cardinality, and capped + ordered server-side so the
    // payload stays small. One extra short query is fine; nine were not.
    const lanesQ = () => query(pool, `
      ${BASE}
      SELECT COALESCE(origin_city, '?') || ' → ' || COALESCE(destination_city, '?') AS key,
             COUNT(*)::int AS n, SUM(cost)::float8 AS cost, SUM(cw)::float8 AS wt,
             COALESCE(SUM(gap) FILTER (WHERE gap > 0.001 AND COALESCE(dw, 0) > 0), 0)::float8 AS over_kg
        FROM base GROUP BY 1 HAVING COUNT(*) >= 5
        ORDER BY SUM(cost) DESC LIMIT 40
    `, params)

    // ── Cost by product: category -> sub-category, split by leg ──
    // Joins awb_shipment_dims (synced from BigQuery) for category / sub-category / L*B*H.
    //
    // RTO IS THE RETURN LEG ONLY here. Two recording conventions exist in the invoices:
    // Bluedart and Urbanbolt bill the return leg alone, while the other five put forward +
    // return in that single row (verified: no RTO AWB has a separate forward row, so the
    // raw ratio reads ~1.9x of forward and looks like RTO costs double). For the bundlers
    // the matching forward rate is subtracted, which lands every courier near the ~0.9x
    // their contracts specify. Without this the RTO column is roughly twice reality.
    //
    // This is deliberately NOT the 'Reverse' grouping the rest of the page uses: pricing a
    // leg is the point of the table, so Forward / Reverse / RTO stay distinct.
    const productQ = () => query(pool, `
      -- fwd was an inline CTE computing a median over the FULL ledger on every request,
      -- which cost ~40s of the 45s this query took. It is filter-independent, so it is now
      -- a materialised table (public.lc_fwd_median, 1,718 rows) refreshed by
      -- scripts/refresh-fwd-median.mjs alongside the derived rate card.
      WITH fwd AS (SELECT courier_name, zone, acct, slab, fwd_t FROM public.lc_fwd_median),
      p AS (
        SELECT d.category AS cat, d.sub_category AS sub,
               CASE WHEN upper(i.shipment_mode) = 'FORWARD' THEN 'Forward'
                    WHEN upper(i.shipment_mode) = 'RTO'     THEN 'RTO'
                    ELSE 'Reverse' END AS leg,
               -- Net out the bundled forward leg for the five couriers that include it.
               -- GREATEST(...,0) guards the rare cell priced below forward.
               CASE WHEN upper(i.shipment_mode) = 'RTO'
                         AND i.courier_name IN ('Delhivery','ElasticRun','Shadowfax','SkyAir','Swift')
                         AND f.fwd_t IS NOT NULL
                    THEN GREATEST(${exGst('i.total_cost::float8', 'i.freight_charge::float8', 'i.surcharge::float8', 'i.other_charge::float8')} - f.fwd_t, 0)
                    ELSE ${exGst('i.total_cost::float8', 'i.freight_charge::float8', 'i.surcharge::float8', 'i.other_charge::float8')} END AS cost,
               i.charged_weight_courier::float8 AS cw,
               -- Billable SLAB, not raw kg: couriers charge per slab (0.5 kg floor, then
               -- round up to the next whole kg), so the slab is what the invoice was
               -- actually built on. Slabbed per shipment here and averaged later —
               -- averaging raw kg and slabbing the mean would round the average instead of
               -- reflecting the billed slabs.
               ${SLAB_OF('i.charged_weight_courier::float8')} AS cw_slab,
               d.volumetric_kg::float8 AS vw,
               pmw.weight_kg::float8 AS master_kg,
               pmw.slab_kg::float8   AS master_slab
          FROM public.logistics_invoices_b2c i
          JOIN public.awb_shipment_dims d ON d.awb = i.awb_number
          -- Master product weight per sub-category, from the BigQuery item master
          -- (Weight_gms, converted to kg at sync). This gives ONE real slab per product
          -- instead of an average of billed slabs, which was a value no parcel is charged.
          LEFT JOIN public.product_master_weight pmw
                 ON lower(trim(pmw.sub_category)) = lower(trim(d.sub_category))
          LEFT JOIN fwd f ON f.courier_name = i.courier_name AND f.zone = i.zone
                         AND f.acct = COALESCE(i.courier_account_type, '(none)')
                         AND f.slab = ${SLAB_OF('i.charged_weight_courier::float8')}
         WHERE ${where.join(' AND ')} AND d.category IS NOT NULL
      )
      SELECT cat, sub,
             COUNT(*) FILTER (WHERE leg = 'Forward')::int    AS fwd_n,
             AVG(cost) FILTER (WHERE leg = 'Forward')::float8 AS fwd_avg,
             COUNT(*) FILTER (WHERE leg = 'Reverse')::int    AS rev_n,
             AVG(cost) FILTER (WHERE leg = 'Reverse')::float8 AS rev_avg,
             COUNT(*) FILTER (WHERE leg = 'RTO')::int        AS rto_n,
             AVG(cost) FILTER (WHERE leg = 'RTO')::float8    AS rto_avg,
             COUNT(*)::int        AS n,
             AVG(cost)::float8    AS avg_cost,
             SUM(cost)::float8    AS cost,
             AVG(cw)::float8      AS cw_avg,
             AVG(cw_slab)::float8 AS cw_slab_avg,
             -- Modal slab: the single slab most shipments in this group are billed at.
             -- At SUB-CATEGORY level this is a real billed value (89-96% of Orthotics
             -- Posture Corrector sits at 0.5 kg), whereas the average is a blend no parcel
             -- is charged. At CATEGORY level the mode is misleading — Mixed Shipments spans
             -- 76 slabs with only 21% at the mode — so the UI shows the mode only where the
             -- group is concentrated enough for it to mean something.
             mode() WITHIN GROUP (ORDER BY cw_slab)::float8 AS cw_slab_mode,
             AVG(master_kg)::float8 AS master_kg,
             CASE WHEN COUNT(DISTINCT master_slab) = 1 THEN MIN(master_slab) END::float8
               AS master_slab,
             COUNT(DISTINCT cw_slab)::int AS cw_slab_variants,
             AVG(vw)::float8      AS vw_avg
        FROM p
       GROUP BY GROUPING SETS ((cat), (cat, sub))
      HAVING COUNT(*) >= 20
       ORDER BY 1, SUM(cost) DESC
    `, params)

    // ── What-if rate grid: courier x zone x slab ──
    // Deliberately NOT filtered by the page slicers. The simulator answers "what would
    // this parcel cost on each courier", so it needs every courier's rate regardless of
    // which ones the user is currently looking at — filtering to one courier would leave
    // nothing to compare against. It is also the reason this is cached: the grid is the
    // same for every request.
    //
    // Median of actual invoiced freight, not the contract card: this is what the courier
    // really charges once fuel and slab rounding land. n travels with each cell so the UI
    // can grey out thin ones instead of quoting a rate built on nine shipments.
    const gridQ = () => query(pool, `
      SELECT courier_name AS courier, zone,
             ${SLAB_OF('charged_weight_courier::float8')} AS slab,
             COUNT(*)::int AS n,
             -- Ex-GST, so the simulator does not quote Delhivery 18% high against the rest.
             percentile_cont(0.5) WITHIN GROUP (ORDER BY
               ${exGst('total_cost::float8', 'freight_charge::float8', 'surcharge::float8', 'other_charge::float8')})::float8 AS cost
        FROM public.logistics_invoices_b2c
       WHERE total_cost > 0 AND zone IN ('A','B','C','D','E')
         AND charged_weight_courier <= ${MAX_PLAUSIBLE_PARCEL_KG}
         AND upper(shipment_mode) = 'FORWARD'
       GROUP BY 1, 2, 3
      HAVING COUNT(*) >= 20
       ORDER BY 1, 2, 3
    `, [])

    // ── Monthly trend, deliberately UNFILTERED ──
    // The slicers scope the rest of the page, but the trend answers "is our total freight
    // bill rising", which must not change when someone filters to one courier or zone —
    // a filtered trend line looks like a spend drop when it is only a narrower question.
    // Same reason as the rate grid: identical for every request, so it is cached below.
    const trendQ = () => query(pool, `
      SELECT month_year,
             COUNT(*)::int          AS n,
             -- Ex-GST, or the trend would step up whenever Delhivery's share of the month
             -- grew, which is a tax artefact rather than a cost movement.
             SUM(${exGst('total_cost::float8', 'freight_charge::float8', 'surcharge::float8', 'other_charge::float8')})::float8 AS cost,
             SUM(charged_weight_courier)::float8 AS wt,
             -- Declared shipment value, so freight-as-%-of-GMV can be shown per period
             -- rather than only as one blended figure.
             SUM(shipment_value)::float8 AS value
        FROM public.logistics_invoices_b2c
       WHERE total_cost > 0 AND zone IN ('A','B','C','D','E')
         AND charged_weight_courier <= ${MAX_PLAUSIBLE_PARCEL_KG}
         AND month_year IS NOT NULL
       GROUP BY 1
       ORDER BY 1
    `, [])

    // ── Weight vs rate attribution ──
    // Its own query rather than two more joins on BASE: BASE is reused by four queries, and
    // adding joins there put five concurrent scans over the connection pool and timed the
    // whole endpoint out. One narrow aggregate is cheap.
    //
    // The SAME derived card is looked up twice — at the slab the courier charged, and at the
    // slab our declared weight implies. Identical rate source, so weight is the only
    // variable between them:
    //   card_theirs - card_ours   = weight-driven (they weighed heavier than we shipped)
    //   invoice     - card_theirs = rate-driven (their own card can't explain it)
    // Restricted to rows priced BOTH ways, so all three figures cover one population —
    // comparing unequal row sets produced a spurious 14.9% control variance.
    const wrQ = () => query(pool, `
      -- Reads a PRE-COMPUTED single-row summary, not a live join.
      --
      -- As a live query this was the most expensive on the page (30.6s of a ~70s cold load):
      -- it joins the derived rate card TWICE across the full ledger — once at the courier's
      -- charged weight, once at our declared weight — and IS NOT DISTINCT FROM on the
      -- nullable slab column defeats index use on both joins.
      --
      -- It is filter-independent by design: the weight/rate split and the Billing Accuracy
      -- totals describe the whole book, not a slicer selection. So it is built by
      -- scripts/refresh-cost-aggregates.mjs after an invoice upload and simply read here.
      -- A filter change or page reload never recomputes it.
      SELECT * FROM public.lc_billing_summary
    `, [])

    // Throttled, not Promise.all: these are full-table scans against a max:6 pool, and
    // firing them all at once queued them behind each other until the connect timeout fired.
    // 4 at a time keeps spare connections so nothing waits on the pool itself.
    //
    // wrQ is NOT here — it is filter-independent by design and took 17s, so it moved into
    // refCache and now runs once per cache period instead of once per request.
    // Only the filter-DEPENDENT queries run per request. gridQ, trendQ and wrQ all ignore
    // the slicers by design, so they moved into refCache and now run once per cache period.
    // Parallelism is not the lever here: 4 concurrent scans measured the same 3.1s as fewer
    // because the instance is CPU-bound, so the fix is fewer scans per request, not more
    // connections.
    // ── Cube: (courier × zone × mode × month × payment × is_overbilled) ──
    // Pre-aggregated at the finest grain the common filters need. Returned in the
    // static JSON so the frontend can re-aggregate client-side on every filter change
    // without a round-trip. Band and destCity are excluded — their cardinality would
    // make the cube too large; those filters still hit the live API.
    const CUBE_Q = `
      ${BASE}
      SELECT
        courier_name,
        zone,
        mode_group                                                AS mode,
        month_year                                               AS month,
        COALESCE(payment_mode, 'Unknown')                        AS payment,
        (gap > 0.001 AND COALESCE(dw, 0) > 0)                   AS is_overbilled,
        COUNT(*)::int                                            AS n,
        SUM(cost)::float8                                        AS cost,
        SUM(cw)::float8                                          AS wt,
        SUM(dw)::float8                                          AS decl_wt,
        SUM(ship_value)::float8                                  AS value,
        SUM(surcharge)::float8                                   AS surcharge,
        COUNT(*) FILTER (WHERE gap > 0.001 AND COALESCE(dw, 0) > 0)::int  AS over_n,
        COALESCE(SUM(gap) FILTER (WHERE gap > 0.001 AND COALESCE(dw, 0) > 0), 0)::float8 AS over_kg,
        COALESCE(SUM((cost / NULLIF(cw_slab, 0)) * gap) FILTER (WHERE gap > 0.001 AND COALESCE(dw, 0) > 0), 0)::float8 AS over_cost,
        COALESCE(SUM(GREATEST(frido_carrier - frido_base, 0)), 0)::float8  AS rec_infl,
        COALESCE(SUM(GREATEST(inv_freight - frido_carrier, 0)), 0)::float8 AS rec_unexp,
        COUNT(*) FILTER (WHERE courier_admits = 'admitted')::int            AS rec_admit_n,
        COALESCE(SUM(GREATEST(frido_carrier - frido_base, 0)) FILTER (WHERE courier_admits = 'admitted'), 0)::float8 AS rec_admit,
        COUNT(*) FILTER (WHERE GREATEST(frido_carrier - frido_base, 0) + GREATEST(inv_freight - frido_carrier, 0) > 10)::int AS claimable_n,
        COALESCE(SUM(GREATEST(frido_carrier - frido_base, 0) + GREATEST(inv_freight - frido_carrier, 0))
                 FILTER (WHERE GREATEST(frido_carrier - frido_base, 0) + GREATEST(inv_freight - frido_carrier, 0) > 10), 0)::float8 AS claimable_rs,
        COUNT(*) FILTER (WHERE mode_group <> 'Forward')::int               AS reverse_n,
        COUNT(*) FILTER (WHERE slab IS NOT NULL AND cw - slab > 0.001)::int AS slab_n,
        COALESCE(SUM(cw - slab) FILTER (WHERE slab IS NOT NULL AND cw - slab > 0.001), 0)::float8 AS slab_kg,
        COALESCE(SUM((cost / cw) * (cw - slab)) FILTER (WHERE slab IS NOT NULL AND cw - slab > 0.001), 0)::float8 AS slab_cost,
        COALESCE(SUM(frido_base), 0)::float8           AS rc_entitled,
        COALESCE(SUM(frido_carrier), 0)::float8        AS rc_carrier,
        COALESCE(SUM(frido_base_allin), 0)::float8     AS rc_entitled_allin,
        COALESCE(SUM(frido_carrier_allin), 0)::float8  AS rc_carrier_allin,
        COALESCE(SUM(frido_base_allin - frido_base), 0)::float8 AS rc_entitled_surcharge,
        COALESCE(SUM(cost - inv_freight), 0)::float8   AS inv_addons,
        COALESCE(SUM(frido_total), 0)::float8          AS rc_total,
        COALESCE(SUM(inv_freight), 0)::float8          AS inv_freight,
        COUNT(frido_base)::int                         AS rc_priced,
        COUNT(*) FILTER (WHERE frido_carrier IS NOT NULL AND inv_freight - frido_carrier > 0.5)::int AS rc_over_n,
        COALESCE(SUM(inv_freight - frido_carrier) FILTER (WHERE frido_carrier IS NOT NULL AND inv_freight - frido_carrier > 0.5), 0)::float8 AS rc_over_cost,
        COALESCE(SUM(frido_carrier - frido_base) FILTER (WHERE frido_carrier IS NOT NULL AND frido_carrier > frido_base), 0)::float8 AS rc_infl_cost,
        COUNT(*) FILTER (WHERE frido_carrier IS NOT NULL AND frido_carrier - frido_base > 0.5)::int AS rc_infl_n,
        COUNT(*) FILTER (WHERE ship_value > 0 AND cost > 0.25 * ship_value)::int AS margin_killer_n,
        COALESCE(SUM(cost) FILTER (WHERE ship_value > 0 AND cost > 0.25 * ship_value), 0)::float8 AS margin_killer_cost
      FROM base
      GROUP BY 1, 2, 3, 4, 5, 6
      ORDER BY 1, 2, 3, 4, 5, 6
    `

    const [grouped, lanes, lfl, drift, product, cubeRes] = await mapLimit([
      () => query(pool, GROUPED, params), lanesQ, lflQ, driftQ, productQ,
      () => query(pool, CUBE_Q, params),
    ], 3)

    const DIM_KEY = {
      zone: 'byZone', mode: 'byMode', month: 'byMonth', courier: 'byCourier',
      pay: 'byPay', acct: 'byAcct', band: 'byBand',
    }
    const out = { byZone: [], byMode: [], byMonth: [], byCourier: [], byPay: [], byAcct: [], byBand: [] }
    for (const r of grouped.rows) {
      if (r.dim === 'total') {
        out.totals = {
          n: r.n, cost: r.cost, charged_wt: r.wt, declared_wt: r.decl_wt,
          ship_value: r.value, surcharge: r.surcharge,
          overbilled_rows: r.over_n, overbilled_kg: r.over_kg, overbilled_cost: r.over_cost,
          rec_infl: r.rec_infl, rec_unexp: r.rec_unexp, reverse_n: r.reverse_n,
          rec_admit: r.rec_admit, rec_admit_n: r.rec_admit_n,
          slab_rows: r.slab_n, slab_excess_kg: r.slab_kg, slab_excess_cost: r.slab_cost,
          rc_entitled: r.rc_entitled, rc_carrier: r.rc_carrier, rc_total: r.rc_total,
          rc_entitled_allin: r.rc_entitled_allin, rc_carrier_allin: r.rc_carrier_allin,
          rc_entitled_surcharge: r.rc_entitled_surcharge, inv_addons: r.inv_addons,
          inv_freight: r.inv_freight, rc_priced: r.rc_priced,
          rc_over_n: r.rc_over_n, rc_over_cost: r.rc_over_cost,
          rc_infl_n: r.rc_infl_n, rc_infl_cost: r.rc_infl_cost,
          rc_admit_n: r.rec_admit_n, rc_admit_cost: r.rec_admit,
          claimable_n: r.claimable_n, claimable_rs: r.claimable_rs,
          margin_killer_n: r.margin_killer_n, margin_killer_cost: r.margin_killer_cost,
        }
      } else {
        out[DIM_KEY[r.dim]].push(r)
      }
    }
    out.totals ||= { n: 0, cost: 0 }
    out.byLane = lanes.rows
    out.likeForLike = lfl.rows
    out.rateDrift = drift.rows

    // Category rows (sub IS NULL) carry their sub-category rows as children, so the page
    // can render an expandable tree without a second request or client-side regrouping.
    const catNode = new Map()
    for (const r of product.rows) {
      if (r.sub === null) catNode.set(r.cat, { ...r, children: [] })
    }
    for (const r of product.rows) {
      if (r.sub !== null) catNode.get(r.cat)?.children.push(r)
    }
    out.byProduct = [...catNode.values()].sort((a, b) => b.cost - a.cost)
    out.cube = cubeRes.rows
    // Served from refCache — see the note on the mapLimit call above.

    // ── 4. Filter-independent reference data, cached ──
    if (!refCache || Date.now() - refCache.at > REF_TTL_MS) {
      // Throttled to 3: this block is 10 queries and only runs on a cache miss, so it can
      // afford to be slower — but firing all 10 at once starved the pool and produced the
      // same connect timeout the main block hit.
      const [health, joinCov, opt, cityRows, b2b, b2bLanes, b2bTotals, b2bTrans, b2bMonths, b2bTypes, wr, gridRes, trendRes] = await mapLimit([
        // ── Data Health (spec §0) ──
        // Every exclusion and every coverage rate the page depends on, in one query.
        // This exists so finance can see the gaps before finding one themselves and
        // discarding the whole dashboard.
        //
        // The AWB corruption check uses a STRICT pattern: '^[0-9]+\.[0-9]+E\+[0-9]+$'
        // matches real Excel damage like "2.28332E+13". A looser '[0-9]E\+[0-9]' test
        // reported 4,156 false positives — valid ElasticRun IDs such as FR4C4FF49E26WY
        // that merely contain "E2". Real corruption count is zero.
        () => query(pool, `
          SELECT
            COUNT(*)::int AS total_rows,
            COUNT(*) FILTER (WHERE total_cost <= 0)::int AS zero_cost,
            COUNT(*) FILTER (WHERE zone NOT IN ('A','B','C','D','E') OR zone IS NULL)::int AS bad_zone,
            COUNT(*) FILTER (WHERE charged_weight_courier > ${MAX_PLAUSIBLE_PARCEL_KG})::int AS implausible_wt,
            COUNT(*) FILTER (WHERE declared_weight_frido IS NULL OR declared_weight_frido = 0)::int AS no_declared_wt,
            COUNT(*) FILTER (WHERE frido_total_cost IS NULL)::int AS unpriced,
            COUNT(*) FILTER (WHERE awb_number ~ '^[0-9]+\\.[0-9]+E\\+[0-9]+$')::int AS corrupt_awb,
            COUNT(*) FILTER (WHERE rmk_weight_dispute IS NOT NULL)::int AS courier_disputes
          FROM public.logistics_invoices_b2c
        `),
        // Join coverage, measured only on rows the page actually reports on.
        () => query(pool, `
          SELECT
            COUNT(*)::int AS scoped,
            COUNT(d.awb)::int AS joined,
            COUNT(*) FILTER (WHERE d.len_cm IS NOT NULL)::int AS with_dims,
            COUNT(*) FILTER (WHERE d.category IS NOT NULL AND d.category <> 'Mixed Shipments')::int AS with_cat,
            COUNT(*) FILTER (WHERE d.category = 'Mixed Shipments')::int AS mixed
          FROM public.logistics_invoices_b2c i
          LEFT JOIN public.awb_shipment_dims d ON d.awb = i.awb_number
          WHERE i.total_cost > 0 AND i.zone IN ('A','B','C','D','E')
            AND i.charged_weight_courier <= ${MAX_PLAUSIBLE_PARCEL_KG}
        `),
        () => query(pool, `
          SELECT
            (SELECT array_agg(DISTINCT month_year ORDER BY month_year) FROM public.logistics_invoices_b2c WHERE month_year IS NOT NULL) AS months,
            -- Only the five real zones, matching the exclusion in the base CTE. Without
            -- this the slicer offered "North"/"West", which would filter to zero rows.
            (SELECT array_agg(DISTINCT zone ORDER BY zone) FROM public.logistics_invoices_b2c WHERE zone IN ('A','B','C','D','E')) AS zones,
            (SELECT array_agg(DISTINCT m ORDER BY m) FROM (SELECT DISTINCT CASE WHEN upper(shipment_mode) IN ('REVERSE','RVP','DTO','RTO') THEN 'Reverse' WHEN upper(shipment_mode)='FORWARD' THEN 'Forward' ELSE shipment_mode END AS m FROM public.logistics_invoices_b2c WHERE shipment_mode IS NOT NULL) q) AS modes,
            (SELECT array_agg(DISTINCT payment_mode ORDER BY payment_mode) FROM public.logistics_invoices_b2c WHERE payment_mode IS NOT NULL) AS payments,
            (SELECT array_agg(DISTINCT courier_name ORDER BY courier_name) FROM public.logistics_invoices_b2c WHERE courier_name IS NOT NULL) AS couriers,
            (SELECT array_agg(DISTINCT courier_account_type ORDER BY courier_account_type) FROM public.logistics_invoices_b2c WHERE courier_account_type IS NOT NULL) AS account_types
        `),
        () => query(pool, `
          SELECT destination_city AS c FROM public.logistics_invoices_b2c
           WHERE destination_city IS NOT NULL AND destination_city <> ''
           GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 600
        `),
        // freight_type_FTL_PTL is mixed-case in the schema, so it MUST be double-quoted
        // — unquoted, Postgres folds it to lowercase and the column "does not exist".
        // Do not wrap this in .catch(): swallowing the error made 1,742 real B2B rows
        // silently render as "no B2B invoices uploaded yet".
        () => query(pool, `
          SELECT month_year, transporter_name, origin_location, destination_location,
                 "freight_type_FTL_PTL" AS freight_type,
                 charged_weight::float8 AS charged_weight,
                 total_cost::float8 AS total_cost
            FROM public.logistics_invoices_b2b
           ORDER BY month_year DESC NULLS LAST LIMIT 500
        `),
        // ── B2B aggregates for the B2B tab ──
        // NOTE: charged_weight / load_weight / no_of_packages / freight_charge are 100%
        // NULL in this table today, so there is no ₹/kg to report — only trip cost.
        // Those metrics appear automatically once the ledger carries weights.
        () => query(pool, `
          SELECT origin_location || ' → ' || destination_location AS lane,
                 origin_location, destination_location,
                 COUNT(*)::int AS trips,
                 SUM(total_cost)::float8 AS cost,
                 AVG(total_cost)::float8 AS avg_cost,
                 MIN(total_cost)::float8 AS min_cost,
                 MAX(total_cost)::float8 AS max_cost
            FROM public.logistics_invoices_b2b
           WHERE total_cost > 0
           GROUP BY 1, 2, 3
           ORDER BY 5 DESC
           LIMIT 60
        `),
        () => query(pool, `
          SELECT COUNT(*)::int AS trips,
                 SUM(total_cost)::float8 AS cost,
                 AVG(total_cost)::float8 AS avg_cost,
                 COUNT(DISTINCT transporter_name)::int AS transporters,
                 COUNT(DISTINCT origin_location || '→' || destination_location)::int AS lanes
            FROM public.logistics_invoices_b2b WHERE total_cost > 0
        `),
        () => query(pool, `
          SELECT transporter_name AS key, COUNT(*)::int AS trips,
                 SUM(total_cost)::float8 AS cost, AVG(total_cost)::float8 AS avg_cost
            FROM public.logistics_invoices_b2b WHERE total_cost > 0
           GROUP BY 1 ORDER BY 3 DESC
        `),
        () => query(pool, `
          SELECT month_year AS key, COUNT(*)::int AS trips, SUM(total_cost)::float8 AS cost
            FROM public.logistics_invoices_b2b WHERE total_cost > 0
           GROUP BY 1 ORDER BY 1
        `),
        () => query(pool, `
          SELECT COALESCE("freight_type_FTL_PTL", 'Unknown') AS key,
                 COUNT(*)::int AS trips, SUM(total_cost)::float8 AS cost,
                 AVG(total_cost)::float8 AS avg_cost
            FROM public.logistics_invoices_b2b WHERE total_cost > 0
           GROUP BY 1 ORDER BY 3 DESC
        `),
        wrQ, gridQ, trendQ,
      ], 3)
      const options = opt.rows[0] || {}
      options.cities = cityRows.rows.map(r => r.c).sort()
      refCache = {
        // Weight-vs-rate attribution: filter-independent and expensive (17s), so it is
        // measured once per cache period rather than per request.
        weightRate: wr.rows[0] || {},
        rateGrid: gridRes.rows,
        trendAll: trendRes.rows,
        at: Date.now(), options, b2b: b2b.rows,
        // Data Health (§0): exclusions + coverage, so every number is auditable.
        health: { ...health.rows[0], ...joinCov.rows[0] },
        // Kept for the existing disclosure line above Cost Overview.
        skipped: health.rows[0].zero_cost + health.rows[0].bad_zone + health.rows[0].implausible_wt,
        b2bLanes: b2bLanes.rows,
        b2bTotals: b2bTotals.rows[0] || { trips: 0, cost: 0 },
        b2bTrans: b2bTrans.rows,
        b2bMonths: b2bMonths.rows,
        b2bTypes: b2bTypes.rows,
      }
    }

    // Attribution describes the whole book, not the slicer-filtered view: the derived card
    // is monthly and the weight/rate split is a property of the ledger, not of a selection.
    // Applied here, after section 4 has guaranteed refCache exists.
    Object.assign(out.totals, refCache.weightRate || {})
    out.rateGrid = refCache.rateGrid || []
    out.trendAll = refCache.trendAll || []
    out.skipped = refCache.skipped
    out.health = refCache.health

    // Claims are read fresh every request, never from refCache — filing one must show up
    // immediately, and the table is tiny compared to the ledger.
    const { rows: claimRows } = await query(pool, `
      SELECT id, courier_name, month_year, tier, shipment_count,
             claim_amount::float8   AS claim_amount,
             credited_amount::float8 AS credited_amount,
             status, filed_on, settled_on, credit_note, notes,
             ev_min_amount::float8 AS ev_min_amount,
             -- Days since filing for open claims, or days taken to settle for closed
             -- ones. Aging is what turns a register into a chase list.
             CASE WHEN status IN ('draft')                       THEN NULL
                  WHEN settled_on IS NOT NULL                    THEN settled_on - filed_on
                  WHEN filed_on IS NOT NULL                      THEN CURRENT_DATE - filed_on
             END::int AS age_days
        FROM public.logistics_claims
       ORDER BY (status = 'credited'), claim_amount DESC
    `)
    out.claims = claimRows
    out.options = refCache.options
    out.b2b = refCache.b2b
    out.b2bLanes = refCache.b2bLanes
    out.b2bTotals = refCache.b2bTotals
    out.b2bTrans = refCache.b2bTrans
    out.b2bMonths = refCache.b2bMonths
    out.b2bTypes = refCache.b2bTypes

    // Store before responding. Claims are read fresh every request elsewhere, so a cached
    // body would not hide a newly filed claim from the register.
    if (f.action !== 'fileClaim' && f.action !== 'updateClaim') {
      respCache.set(cacheKey(f), { at: Date.now(), body: out })
      // Simple FIFO eviction — insertion order is Map's iteration order.
      while (respCache.size > RESP_CACHE_MAX) {
        respCache.delete(respCache.keys().next().value)
      }
    }
    res.status(200).json(out)
  } catch (e) {
    console.error('[logistics-cost]', e)
    res.status(500).json({ error: e.message })
  }
}
