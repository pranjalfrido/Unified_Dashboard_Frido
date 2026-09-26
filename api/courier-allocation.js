// Courier allocation simulator.
//
// Answers "which courier should carry which weight slab" by joining two ledgers that
// each hold only half the picture:
//   - cost      : public.logistics_invoices_b2c (Supabase) - what we were actually billed
//   - behaviour : Clickpost_Shipment_Tracking_Report (BigQuery) - RTO, transit, delivery
//
// Three design decisions drive everything below, each forced by the data:
//
// 1. COD and Prepaid are NEVER blended. Measured over 90 days: COD RTO is 23.48%,
//    Prepaid 1.62% - a 14x gap, larger than any courier-to-courier difference. A blended
//    RTO figure therefore mostly encodes how much COD volume a courier was handed, not how
//    well it performs, so comparing couriers on it ranks their order mix rather than them.
//    Every cell is keyed (courier, slab, payment_mode).
//
// 2. Recommendations are capped by observed pincode reach. Urbane Bolt has the best RTO on
//    record (1.4%) but has delivered to only 112 pincodes against Bluedart's 10,360, so an
//    uncapped optimiser would "save" millions by routing national volume to a courier that
//    cannot serve it. A courier is only eligible for a slab's volume in the pincodes where
//    it has actually delivered, and its recommended share is capped at that coverage.
//
// 3. Cells below MIN_CELL shipments are reported but never drive a recommendation. The
//    rate-card work showed heavy slabs resting on 1-2 observations produced absurd numbers.
import pkg from 'pg'
import { getBQ } from './_bq.js'
const { Pool } = pkg

// A dedicated pool, not the shared getPool(): this route runs a full scan over ~1.1M
// ledger rows and firing that into the pool serving every other route starved it — the
// "Connection terminated unexpectedly" / "read ECONNRESET" pair. Same reasoning as
// api/logistics-cost.js.
let allocPool
function getAllocPool() {
  if (!allocPool) {
    const connStr = process.env.SUPABASE_URL
    if (!connStr) throw new Error('SUPABASE_URL not configured')
    allocPool = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      max: 3,
      connectionTimeoutMillis: 45000,
      idleTimeoutMillis: 30000,
      statement_timeout: 120000,
    })
    // Mandatory. node-postgres emits 'error' on the Pool when the server drops an IDLE
    // connection; unhandled, that EventEmitter error takes the whole process down — a
    // hiccup on a connection this route is not even using would kill the server.
    allocPool.on('error', e => console.error('[courier-allocation pool]', e.message))
  }
  return allocPool
}

const TRANSIENT = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', '57P01', '08006', '08003'])
async function query(pool, sql, params) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await pool.query(sql, params)
    } catch (e) {
      const transient = TRANSIENT.has(e.code) || /ECONNRESET|terminated unexpectedly/i.test(e.message || '')
      if (!transient || attempt >= 2) throw e
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)))
    }
  }
}

// A courier must have this many shipments in a (slab, payment) cell before its rates are
// trusted enough to move volume onto it.
const MIN_CELL = 200
// Slabs beyond this are long-tail freight; the page focuses on parcel slabs where
// allocation is a real lever. Kept generous so 8kg chairs are still covered.
const MAX_SLAB = 15
// Guards against gram/kg unit errors in either ledger.
const MAX_KG = 100

// Courier naming differs between the two sources ("SkyAir" in the invoice ledger vs
// "Skye Air" in Clickpost, "Urbanbolt" vs "Urbane Bolt"). Both sides normalise to these
// keys or the join silently drops the smaller couriers - which are exactly the ones the
// simulator is most likely to recommend.
const COURIER_SQL_BQ = `CASE
  WHEN LOWER(c.courier_partner) LIKE '%bluedart%'   THEN 'Bluedart'
  WHEN LOWER(c.courier_partner) LIKE '%delhivery%'  THEN 'Delhivery'
  WHEN LOWER(c.courier_partner) LIKE '%elastic%'    THEN 'ElasticRun'
  WHEN LOWER(c.courier_partner) LIKE '%shadowfax%'  THEN 'Shadowfax'
  WHEN LOWER(c.courier_partner) LIKE '%swift%'      THEN 'Swift'
  WHEN LOWER(c.courier_partner) LIKE '%ekart%'      THEN 'Ekart'
  WHEN LOWER(c.courier_partner) LIKE '%safexpress%' THEN 'Safexpress'
  WHEN LOWER(c.courier_partner) LIKE '%shiprocket%' THEN 'Shiprocket'
  WHEN LOWER(c.courier_partner) LIKE '%sky air%' OR LOWER(c.courier_partner) LIKE '%skye%' THEN 'SkyAir'
  WHEN LOWER(c.courier_partner) LIKE '%urbane bolt%' OR LOWER(c.courier_partner) LIKE '%urbanbolt%' THEN 'Urbanbolt'
  WHEN LOWER(c.courier_partner) LIKE '%wareiq%'     THEN 'WareIQ'
  WHEN LOWER(c.courier_partner) LIKE '%zippee%'     THEN 'Zippee'
  ELSE c.courier_partner END`

const COURIER_SQL_PG = `CASE
  WHEN LOWER(courier_name) LIKE '%bluedart%'   THEN 'Bluedart'
  WHEN LOWER(courier_name) LIKE '%delhivery%'  THEN 'Delhivery'
  WHEN LOWER(courier_name) LIKE '%elastic%'    THEN 'ElasticRun'
  WHEN LOWER(courier_name) LIKE '%shadowfax%'  THEN 'Shadowfax'
  WHEN LOWER(courier_name) LIKE '%swift%'      THEN 'Swift'
  WHEN LOWER(courier_name) LIKE '%ekart%'      THEN 'Ekart'
  WHEN LOWER(courier_name) LIKE '%safexpress%' THEN 'Safexpress'
  WHEN LOWER(courier_name) LIKE '%shiprocket%' THEN 'Shiprocket'
  WHEN LOWER(courier_name) LIKE '%skyair%' OR LOWER(courier_name) LIKE '%sky air%' THEN 'SkyAir'
  WHEN LOWER(courier_name) LIKE '%urbanbolt%' OR LOWER(courier_name) LIKE '%urbane%' THEN 'Urbanbolt'
  ELSE courier_name END`

// Billable slab, matching the rate card and lc_slab_costs: 0.5 kg floor, then round up.
const SLAB_BQ = kg => `CASE WHEN ${kg} <= 0.5 THEN 0.5 ELSE CAST(CEIL(${kg}) AS FLOAT64) END`
const SLAB_PG = kg => `CASE WHEN ${kg} <= 0.5 THEN 0.5 ELSE CEIL(${kg}) END`

// Clickpost stores weight as a string, in grams, sometimes with unit suffixes.
const KG_BQ = `SAFE_CAST(REGEXP_REPLACE(TRIM(c.shipment_weight), r'[^0-9.]', '') AS FLOAT64) / 1000`
// The invoice ledger: prefer the courier's charged weight, fall back to our declared weight
// when the courier uploaded a zero (75 ElasticRun rows did, and left as zero they produce a
// NULL slab and vanish from every per-kg figure).
const KG_PG = `COALESCE(NULLIF(charged_weight_courier, 0), declared_weight_frido)`

const PAY_BQ = `CASE WHEN UPPER(TRIM(c.payment_mode)) = 'COD' THEN 'COD' ELSE 'Prepaid' END`
const PAY_PG = `CASE WHEN UPPER(TRIM(payment_mode)) LIKE '%COD%' THEN 'COD' ELSE 'Prepaid' END`

// Delhivery uploaded totals GST-inclusive; keyed on the 1.18 ratio rather than the courier
// name so the correction retires itself once ex-GST totals are uploaded.
const EX_GST = `CASE
  WHEN freight_charge > 0 AND total_cost > 0
   AND ABS(total_cost / NULLIF(freight_charge, 0) - 1.18) < 0.005
  THEN total_cost / 1.18 ELSE total_cost END`

let cache = { key: null, at: 0, data: null }
const TTL = 10 * 60 * 1000

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const body = req.method === 'POST' ? (req.body || {}) : {}
  const lookbackDays = Math.min(Math.max(Number(body.lookbackDays) || 90, 30), 365)
  const key = `alloc:${lookbackDays}`

  if (cache.key === key && Date.now() - cache.at < TTL && cache.data) {
    return res.status(200).json({ ...cache.data, cached: true })
  }

  try {
    const [perf, cost, zmap] = await Promise.all([
      fetchPerformance(lookbackDays),
      fetchCost(),
      fetchZoneMap(),
    ])
    const out = build(perf.rows, cost, lookbackDays, perf.laneRows, zmap)
    cache = { key, at: Date.now(), data: out }
    return res.status(200).json(out)
  } catch (e) {
    console.error('[courier-allocation]', e)
    return res.status(500).json({ error: e.message })
  }
}

// ---------------------------------------------------------------- performance (BigQuery)
async function fetchPerformance(days) {
  const bq = getBQ()
  const sql = `
    WITH base AS (
      SELECT
        ${COURIER_SQL_BQ} AS courier,
        ${KG_BQ} AS kg,
        ${PAY_BQ} AS pay,
        c.drop_pincode AS pin,
        c.pickup_pincode AS ppin,
        c.drop_state AS state,
        CASE
          WHEN c.clickpost_unified_status = 'Delivered' THEN 'Delivered'
          WHEN c.clickpost_unified_status = 'NoStatusExist' AND LOWER(c.latest_remark) LIKE '%delivered%' THEN 'Delivered'
          WHEN c.clickpost_unified_status LIKE 'RTO%' THEN 'RTO'
          WHEN c.clickpost_unified_status = 'NoStatusExist' AND LOWER(c.latest_remark) LIKE '%rto%' THEN 'RTO'
          WHEN c.clickpost_unified_status IN ('Lost', 'Damaged') THEN 'Lost'
          WHEN c.clickpost_unified_status = 'Cancelled' THEN 'Cancelled'
          -- Everything else is unresolved: still moving, or not yet picked up.
          ELSE 'Open'
        END AS st,
        -- In-transit is pickup -> delivery, NOT order -> delivery: order-to-pickup is our
        -- own processing time and would penalise couriers for warehouse delays.
        SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', SUBSTR(c.pickup_date, 1, 19)) AS pts,
        SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', SUBSTR(c.delivery_date, 1, 19)) AS dts
      FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\` c
      WHERE DATE(c.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)
        AND c.courier_partner IS NOT NULL
    ),
    scoped AS (
      SELECT *, ${SLAB_BQ('kg')} AS slab
      FROM base
      WHERE kg IS NOT NULL AND kg > 0 AND kg <= ${MAX_KG}
    ),
    -- Same measures as the cells CTE, but one grain finer: keyed by the pincode LANE so zone can
    -- be resolved in JS against public.pincode_zone_map. Zone is a property of the lane, not
    -- the destination — the same drop pincode is zone A from a local warehouse and zone D
    -- from across the country — so the pair has to survive into the application layer.
    -- Clickpost's own zone column is 100% NULL, which is why this exists at all.
    lane_cells AS (
      SELECT
        courier, slab, pay, ppin, pin,
        COUNT(*) AS n,
        COUNTIF(st = 'Delivered') AS delivered,
        COUNTIF(st = 'RTO') AS rto,
        COUNTIF(st = 'Lost') AS lost,
        COUNTIF(st IN ('Delivered', 'RTO', 'Lost')) AS resolved,
        ROUND(AVG(IF(pts IS NOT NULL AND dts IS NOT NULL
              AND TIMESTAMP_DIFF(dts, pts, MINUTE) BETWEEN 0 AND 28800,
              TIMESTAMP_DIFF(dts, pts, MINUTE) / 1440.0, NULL)), 3) AS transit_days
      FROM scoped
      WHERE slab <= ${MAX_SLAB} AND pin IS NOT NULL
      GROUP BY 1, 2, 3, 4, 5
    ),
    cells AS (
      SELECT
        courier, slab, pay,
        COUNT(*) AS n,
        COUNTIF(st = 'Delivered') AS delivered,
        COUNTIF(st = 'RTO') AS rto,
        COUNTIF(st = 'Lost') AS lost,
        -- Rates are measured on RESOLVED shipments only: delivered + RTO + lost.
        --
        -- Measured, not hypothetical: over 90 days at prepaid 0.5 kg, Delhivery's raw
        -- delivery rate reads 86.26% against Bluedart's 94.11% — but 5.71% of Delhivery's
        -- are Cancelled and 5.63% still in transit, against Bluedart's 0.09% and 3.24%.
        -- Cancelled parcels were never delivered AND never charged; in-transit ones simply
        -- have not landed yet. Dividing landed cost by the raw rate therefore penalised
        -- Delhivery twice for things that are not delivery failures at all.
        COUNTIF(st IN ('Delivered', 'RTO', 'Lost')) AS resolved,
        COUNTIF(st = 'Cancelled') AS cancelled,
        COUNTIF(st = 'Open') AS open_now,
        ROUND(AVG(IF(pts IS NOT NULL AND dts IS NOT NULL
              AND TIMESTAMP_DIFF(dts, pts, MINUTE) BETWEEN 0 AND 28800,
              TIMESTAMP_DIFF(dts, pts, MINUTE) / 1440.0, NULL)), 2) AS transit_days,
        COUNT(DISTINCT pin) AS pins,
        COUNT(DISTINCT state) AS states
      FROM scoped
      WHERE slab <= ${MAX_SLAB}
      GROUP BY 1, 2, 3
    ),
    -- Observed reach per courier, used to cap how much volume it can be given. Measured
    -- across all slabs: a courier that serves a pincode for 1 kg can serve it for 2 kg.
    reach AS (
      SELECT courier, COUNT(DISTINCT pin) AS pins, COUNT(DISTINCT state) AS states, COUNT(*) AS n
      FROM scoped WHERE pin IS NOT NULL GROUP BY 1
    ),
    -- Total distinct pincodes we ship to, so reach can be expressed as a % of demand.
    universe AS (
      SELECT COUNT(DISTINCT pin) AS pins, COUNT(DISTINCT state) AS states FROM scoped WHERE pin IS NOT NULL
    ),
    -- Per-slab pincode demand, so a courier's eligible share is geography-aware rather
    -- than a flat percentage: the share of THIS slab's pincodes the courier actually covers.
    slab_reach AS (
      SELECT
        s.slab, s.pay, s.courier,
        COUNT(DISTINCT s.pin) AS courier_pins,
        (SELECT COUNT(DISTINCT s2.pin) FROM scoped s2
          WHERE s2.slab = s.slab AND s2.pay = s.pay AND s2.pin IS NOT NULL) AS slab_pins
      FROM scoped s
      WHERE s.pin IS NOT NULL AND s.slab <= ${MAX_SLAB}
      GROUP BY 1, 2, 3
    )
    SELECT
      'cell' AS kind, courier, slab, pay, n, delivered, rto, lost,
      resolved, cancelled, open_now,
      transit_days, pins, states, NULL AS slab_pins, NULL AS courier_pins
    FROM cells
    UNION ALL
    SELECT 'reach', courier, NULL, NULL, n, NULL, NULL, NULL, NULL, NULL, NULL, NULL, pins, states, NULL, NULL FROM reach
    UNION ALL
    SELECT 'universe', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, pins, states, NULL, NULL FROM universe
    UNION ALL
    SELECT 'slab_reach', courier, slab, pay, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, slab_pins, courier_pins FROM slab_reach
  `
  // Lane rows come back as their own result set rather than being forced into the UNION
  // above — they carry two extra columns (ppin, pin) and padding every other branch with
  // NULLs to match would make the projection unreadable and easy to misalign.
  const laneSql = sql.slice(0, sql.indexOf('\n    SELECT\n      \'cell\' AS kind')) + `
    SELECT courier, slab, pay, ppin, pin, n, delivered, rto, lost, resolved, transit_days
    FROM lane_cells
  `
  const [rows, laneRows] = await Promise.all([
    bq.query({ query: sql }).then(r => r[0]),
    bq.query({ query: laneSql }).then(r => r[0]),
  ])
  return { rows, laneRows }
}

// Pincode -> zone, from public.pincode_zone_map (see scripts/load-pincode-zones.mjs).
// Cached for the process: the table is ~127k static rows and reloading it per request would
// dominate the response time.
let zoneCache = null
async function fetchZoneMap() {
  if (zoneCache) return zoneCache
  const pool = getAllocPool()
  const r = await query(pool, `SELECT pickup_pincode, drop_pincode, zone, kind FROM public.pincode_zone_map`)
  const pair = new Map(), drop = new Map()
  for (const row of r.rows) {
    if (row.kind === 'pair') pair.set(`${row.pickup_pincode}|${row.drop_pincode}`, row.zone)
    else drop.set(row.drop_pincode, row.zone)
  }
  zoneCache = { pair, drop }
  return zoneCache
}

// Exact lane first, destination-majority second. Measured against 90 days of Clickpost:
// 84.9% resolve on the exact pair, a further 15.0% on the drop pincode, 0.1% unresolved —
// and the unresolved are reported as such rather than defaulted into a zone.
function zoneOf(zmap, ppin, pin) {
  const d = String(pin || '').trim()
  if (!d) return null
  const p = String(ppin || '').trim()
  return zmap.pair.get(`${p}|${d}`) || zmap.drop.get(d) || null
}

// ---------------------------------------------------------------------- cost (Supabase)
async function fetchCost() {
  const pool = getAllocPool()
  const sql = `
    WITH b AS (
      SELECT
        ${COURIER_SQL_PG} AS courier,
        ${SLAB_PG(KG_PG)} AS slab,
        ${PAY_PG} AS pay,
        GREATEST(${EX_GST}, 0) AS cost,
        month_year
      FROM public.logistics_invoices_b2c
      WHERE total_cost IS NOT NULL
        AND ${KG_PG} BETWEEN 0.01 AND ${MAX_KG}
        -- Forward legs only. RTO and reverse rows carry a different rate basis, and mixing
        -- them in would make a courier look expensive purely for having more returns -
        -- which the RTO metric already captures separately.
        AND (shipment_mode IS NULL OR UPPER(shipment_mode) NOT IN ('RTO', 'REVERSE', 'RVP', 'DTO'))
    )
    SELECT courier, slab::float8 AS slab, pay,
      COUNT(*)::int AS n,
      ROUND(AVG(cost)::numeric, 2)::float8 AS avg_cost,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cost)::numeric, 2)::float8 AS med_cost,
      ROUND(SUM(cost)::numeric, 2)::float8 AS total_cost,
      COUNT(DISTINCT month_year)::int AS months
    FROM b
    WHERE slab <= ${MAX_SLAB}
    GROUP BY 1, 2, 3
  `
  const r = await query(pool, sql)
  return r.rows
}

// ------------------------------------------------------------------------------ assemble
function build(perfRows, costRows, lookbackDays, laneRows, zmap) {
  const num = v => (v === null || v === undefined ? null : Number(v))

  const cells = new Map()      // courier|slab|pay -> cell
  const reach = new Map()      // courier -> {pins, states, n}
  const slabReach = new Map()  // slab|pay|courier -> coverage share
  let universe = { pins: 0, states: 0 }

  for (const r of perfRows) {
    if (r.kind === 'reach') {
      reach.set(r.courier, { pins: num(r.pins) || 0, states: num(r.states) || 0, n: num(r.n) || 0 })
    } else if (r.kind === 'universe') {
      universe = { pins: num(r.pins) || 0, states: num(r.states) || 0 }
    } else if (r.kind === 'slab_reach') {
      const sp = num(r.slab_pins) || 0
      const cp = num(r.courier_pins) || 0
      slabReach.set(`${num(r.slab)}|${r.pay}|${r.courier}`, sp > 0 ? cp / sp : 0)
    } else {
      const n = num(r.n) || 0
      // Denominator for every rate. Cancelled and still-open shipments are excluded from
      // it, not counted as failures — see the `resolved` comment in the SQL above.
      const res = num(r.resolved) || 0
      const k = `${r.courier}|${num(r.slab)}|${r.pay}`
      cells.set(k, {
        courier: r.courier, slab: num(r.slab), pay: r.pay,
        shipments: n,
        resolved: res,
        delivered: num(r.delivered) || 0,
        rto: num(r.rto) || 0,
        lost: num(r.lost) || 0,
        cancelled: num(r.cancelled) || 0,
        open: num(r.open_now) || 0,
        rtoPct: res > 0 ? ((num(r.rto) || 0) / res) * 100 : null,
        delPct: res > 0 ? ((num(r.delivered) || 0) / res) * 100 : null,
        lostPct: res > 0 ? ((num(r.lost) || 0) / res) * 100 : null,
        // Surfaced so a low resolved-share is visible rather than silently shrinking the
        // basis: a courier whose parcels are mostly still moving has a thin sample.
        resolvedPct: n > 0 ? (res / n) * 100 : null,
        transitDays: num(r.transit_days),
        pins: num(r.pins) || 0,
        states: num(r.states) || 0,
        cost: null, medCost: null, costN: 0, costMonths: 0,
      })
    }
  }

  // Attach cost. The two ledgers cover different windows (Clickpost is a rolling lookback,
  // the invoice ledger is whole months), so cost is a rate joined onto behaviour rather
  // than the same shipments counted twice.
  const costOnly = []
  for (const c of costRows) {
    const k = `${c.courier}|${num(c.slab)}|${c.pay}`
    const cell = cells.get(k)
    if (cell) {
      cell.cost = num(c.avg_cost)
      cell.medCost = num(c.med_cost)
      cell.costN = num(c.n) || 0
      cell.costMonths = num(c.months) || 0
    } else {
      costOnly.push({ courier: c.courier, slab: num(c.slab), pay: c.pay, n: num(c.n) || 0 })
    }
  }

  const all = [...cells.values()]
  // A cell needs both sides to be comparable: behaviour without cost cannot be ranked on
  // spend, cost without behaviour cannot be ranked on RTO.
  const priced = all.filter(c => c.cost != null && c.shipments > 0)

  // ------------------------------------------------------- per (slab, payment) comparison
  const groups = new Map()
  for (const c of priced) {
    const k = `${c.slab}|${c.pay}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(c)
  }

  const slabs = []
  for (const [k, list] of groups) {
    const [slabStr, pay] = k.split('|')
    const slab = Number(slabStr)
    const totalN = list.reduce((s, c) => s + c.shipments, 0)
    // Only cells with enough observations may be recommended, and only couriers that
    // actually reach a meaningful share of this slab's destinations.
    const eligible = list.filter(c => {
      // MIN_CELL applies to RESOLVED shipments: a cell with 5,000 parcels still in transit
      // has no measured RTO to rank on.
      if (c.resolved < MIN_CELL) return false
      const cov = slabReach.get(`${slab}|${pay}|${c.courier}`) ?? 0
      return cov >= 0.05
    })
    const incumbent = [...list].sort((a, b) => b.shipments - a.shipments)[0] || null

    slabs.push({
      slab, pay,
      shipments: totalN,
      couriers: list
        .map(c => ({
          ...c,
          share: totalN > 0 ? (c.shipments / totalN) * 100 : 0,
          coverage: (slabReach.get(`${slab}|${pay}|${c.courier}`) ?? 0) * 100,
          eligible: eligible.includes(c),
          // Landed cost per DELIVERED shipment: an RTO costs the forward leg, the return
          // leg, and yields no revenue. Ranking on invoice cost alone would favour a cheap
          // courier that loses a fifth of its parcels.
          landedCost: c.cost != null && c.delPct > 0
            ? (c.cost * (1 + (c.rtoPct || 0) / 100)) / (c.delPct / 100)
            : null,
        }))
        .sort((a, b) => b.shipments - a.shipments),
      incumbent: incumbent ? incumbent.courier : null,
      minCell: MIN_CELL,
    })
  }
  slabs.sort((a, b) => a.slab - b.slab || (a.pay === 'Prepaid' ? -1 : 1))

  // ----------------------------------------------------------------- recommended shares
  // A greedy fill, not a "give it all to the winner" pick. Each slab's volume is offered
  // to eligible couriers best-score-first, and each can absorb only up to its observed
  // pincode coverage of that slab — so a courier reaching 6% of destinations can never be
  // handed 100% of the volume however good its numbers look.
  for (const s of slabs) {
    const pool = s.couriers.filter(c => c.eligible && c.landedCost != null)
    if (!pool.length) { s.plan = []; s.saving = null; continue }

    // Score is landed cost by default; the UI re-weights client-side for the what-if
    // sliders, but the server ships a cost-anchored baseline so the page is useful
    // before the user touches anything.
    const ranked = [...pool].sort((a, b) => a.landedCost - b.landedCost)

    let remaining = 100
    const plan = []
    for (const c of ranked) {
      if (remaining <= 0.01) break
      // Headroom: coverage is the hard ceiling, but never shrink a courier below the share
      // it already carries — that volume is demonstrably servable by it today.
      const ceiling = Math.max(c.coverage, c.share)
      const give = Math.min(remaining, ceiling)
      if (give <= 0.01) continue
      plan.push({ courier: c.courier, share: give, landedCost: c.landedCost, current: c.share })
      remaining -= give
    }
    // Anything left over stays with the incumbent rather than being silently dropped.
    if (remaining > 0.01 && s.incumbent) {
      const inc = plan.find(p => p.courier === s.incumbent)
      const incCell = s.couriers.find(c => c.courier === s.incumbent)
      if (inc) inc.share += remaining
      else if (incCell?.landedCost != null) {
        plan.push({ courier: s.incumbent, share: remaining, landedCost: incCell.landedCost, current: incCell.share })
      }
    }

    // The greedy fill can land WORSE than today: once the cheap couriers' coverage is
    // exhausted the remainder is forced onto whoever is left, which on COD 0.5 kg meant
    // pushing volume onto Delhivery at Rs 152 landed and "saving" -Rs 80k/month. Measured,
    // not hypothetical. If the plan does not beat the current mix, keep the current mix and
    // report no change — a simulator that recommends a regression is worse than silent.
    const weighted = rows => {
      const cov = rows.reduce((a, r) => a + (r.share || 0) / 100, 0)
      if (cov <= 0.5) return null
      return rows.reduce((a, r) => a + ((r.share || 0) / 100) * r.landedCost, 0) / cov
    }
    const curRows = s.couriers.filter(c => c.landedCost != null).map(c => ({ share: c.share, landedCost: c.landedCost }))
    const curW = weighted(curRows)
    const newW = weighted(plan)
    if (curW == null || newW == null || newW >= curW) {
      s.plan = s.couriers
        .filter(c => c.landedCost != null && c.share > 0.01)
        .map(c => ({ courier: c.courier, share: c.share, landedCost: c.landedCost, current: c.share }))
      s.planUnchanged = true
    } else {
      s.plan = plan
      s.planUnchanged = false
    }

    // Saving = (current weighted landed cost - planned weighted landed cost) x volume.
    // Landed, not invoice: the whole point is that a cheaper courier with worse RTO can
    // cost more per delivered parcel.
    const finalW = weighted(s.plan)
    s.currentLanded = curW
    s.plannedLanded = finalW
    if (curW != null && finalW != null) {
      s.savingPerShipment = curW - finalW
      // Normalised to a month: the lookback is configurable, so an absolute figure over an
      // arbitrary window is hard to act on.
      s.saving = (curW - finalW) * s.shipments * (30 / lookbackDays)
    } else {
      s.savingPerShipment = null
      s.saving = null
    }
  }

  // ------------------------------------------------------------------- zone × courier grain
  // Folded from the lane grain, because zone depends on the pickup→drop pair. Cost is joined
  // at (courier, slab, pay) since the invoice ledger has no zone of its own, so a zone's cost
  // is its own slab mix priced at that courier's rates — not a separate zonal rate card.
  const zoneAgg = new Map()   // courier|zone|pay -> tallies
  let zonedShipments = 0, unzonedShipments = 0
  for (const r of (laneRows || [])) {
    const n = num(r.n) || 0
    const z = zmap ? zoneOf(zmap, r.ppin, r.pin) : null
    if (!z) { unzonedShipments += n; continue }
    zonedShipments += n
    const k = `${r.courier}|${z}|${r.pay}`
    if (!zoneAgg.has(k)) {
      zoneAgg.set(k, { courier: r.courier, zone: z, pay: r.pay, shipments: 0, resolved: 0, delivered: 0, rto: 0, lost: 0, transitNum: 0, transitDen: 0, costNum: 0, costDen: 0 })
    }
    const e = zoneAgg.get(k)
    e.shipments += n
    e.resolved += num(r.resolved) || 0
    e.delivered += num(r.delivered) || 0
    e.rto += num(r.rto) || 0
    e.lost += num(r.lost) || 0
    const td = num(r.transit_days)
    if (td != null) { e.transitNum += td * n; e.transitDen += n }
    // Shipment-weighted cost from the (courier, slab, pay) cell this lane row belongs to.
    const cc = cells.get(`${r.courier}|${num(r.slab)}|${r.pay}`)
    if (cc?.cost != null) { e.costNum += cc.cost * n; e.costDen += n }
  }

  const zones = [...zoneAgg.values()].map(e => {
    const rtoPct = e.resolved > 0 ? (e.rto / e.resolved) * 100 : null
    const delPct = e.resolved > 0 ? (e.delivered / e.resolved) * 100 : null
    const cost = e.costDen > 0 ? e.costNum / e.costDen : null
    return {
      courier: e.courier, zone: e.zone, pay: e.pay,
      shipments: e.shipments, resolved: e.resolved,
      rtoPct, delPct,
      transitDays: e.transitDen > 0 ? e.transitNum / e.transitDen : null,
      cost,
      landedCost: cost != null && delPct > 0 ? (cost * (1 + (rtoPct || 0) / 100)) / (delPct / 100) : null,
    }
  }).filter(z => z.shipments > 0)

  // ------------------------------------------------------------------ weight-band rollup
  // Individual slabs are too granular to act on: 16 prepaid slabs, and everything above 2 kg
  // is under 8% of volume each. These bands follow the actual distribution — 0.5 kg alone is
  // 50.9% of prepaid volume so it stays its own band, and the long tail folds into 5-10/10+.
  const BANDS = [
    { key: '0.5', label: 'Up to 0.5 kg', lo: 0, hi: 0.5 },
    { key: '1', label: '0.5 – 1 kg', lo: 0.5, hi: 1 },
    { key: '2', label: '1 – 2 kg', lo: 1, hi: 2 },
    { key: '5', label: '2 – 5 kg', lo: 2, hi: 5 },
    { key: '10', label: '5 – 10 kg', lo: 5, hi: 10 },
    { key: '10+', label: 'Over 10 kg', lo: 10, hi: Infinity },
  ]
  const bands = []
  for (const pv of ['Prepaid', 'COD']) {
    for (const b of BANDS) {
      const group = slabs.filter(s => s.pay === pv && s.slab > b.lo && s.slab <= b.hi)
      if (!group.length) continue
      const shipments = group.reduce((a, s) => a + s.shipments, 0)
      if (!shipments) continue
      // Courier tallies folded across the band's slabs, weighted by shipments so a big slab
      // dominates a small one rather than every slab counting equally.
      const byCourier = new Map()
      for (const s of group) {
        for (const c of s.couriers) {
          if (!byCourier.has(c.courier)) {
            byCourier.set(c.courier, { courier: c.courier, shipments: 0, planned: 0, costNum: 0, landedNum: 0, den: 0, rtoNum: 0, rtoDen: 0, transitNum: 0, transitDen: 0 })
          }
          const e = byCourier.get(c.courier)
          const n = (c.share / 100) * s.shipments
          const p = s.plan.find(x => x.courier === c.courier)
          e.shipments += n
          e.planned += ((p?.share ?? 0) / 100) * s.shipments
          if (c.cost != null) { e.costNum += c.cost * n; e.den += n }
          if (c.landedCost != null) e.landedNum += c.landedCost * n
          if (c.rtoPct != null) { e.rtoNum += c.rtoPct * c.resolved; e.rtoDen += c.resolved }
          if (c.transitDays != null) { e.transitNum += c.transitDays * n; e.transitDen += n }
        }
      }
      const couriersOut = [...byCourier.values()].map(e => ({
        courier: e.courier,
        shipments: Math.round(e.shipments),
        share: shipments > 0 ? (e.shipments / shipments) * 100 : 0,
        plannedShare: shipments > 0 ? (e.planned / shipments) * 100 : 0,
        deltaShipments: e.planned - e.shipments,
        cost: e.den > 0 ? e.costNum / e.den : null,
        landedCost: e.den > 0 ? e.landedNum / e.den : null,
        rtoPct: e.rtoDen > 0 ? e.rtoNum / e.rtoDen : null,
        transitDays: e.transitDen > 0 ? e.transitNum / e.transitDen : null,
      })).filter(c => c.shipments > 0).sort((a, b2) => b2.shipments - a.shipments)

      const wCur = couriersOut.reduce((a, c) => c.landedCost != null ? a + (c.share / 100) * c.landedCost : a, 0)
      const covCur = couriersOut.reduce((a, c) => c.landedCost != null ? a + c.share / 100 : a, 0)
      const wNew = couriersOut.reduce((a, c) => c.landedCost != null ? a + (c.plannedShare / 100) * c.landedCost : a, 0)
      const covNew = couriersOut.reduce((a, c) => c.landedCost != null ? a + c.plannedShare / 100 : a, 0)

      bands.push({
        key: b.key, label: b.label, pay: pv,
        slabs: group.map(s => s.slab).sort((x, y) => x - y),
        shipments,
        saving: group.reduce((a, s) => a + (s.saving || 0), 0),
        currentLanded: covCur > 0.5 ? wCur / covCur : null,
        plannedLanded: covNew > 0.5 ? wNew / covNew : null,
        couriers: couriersOut,
      })
    }
  }

  const couriers = [...new Set(all.map(c => c.courier))].sort()
  const reachOut = couriers.map(c => ({
    courier: c,
    pins: reach.get(c)?.pins ?? 0,
    states: reach.get(c)?.states ?? 0,
    shipments: reach.get(c)?.n ?? 0,
    pinShare: universe.pins > 0 ? ((reach.get(c)?.pins ?? 0) / universe.pins) * 100 : 0,
  })).sort((a, b) => b.shipments - a.shipments)

  return {
    generatedAt: new Date().toISOString(),
    lookbackDays,
    universe,
    minCell: MIN_CELL,
    maxSlab: MAX_SLAB,
    slabs,
    couriers,
    reach: reachOut,
    // Headline: total monthly saving available if every slab moved to its planned mix.
    totalSaving: slabs.reduce((s, x) => s + (x.saving || 0), 0),
    bands,
    zones,
    zoneCoverage: {
      zoned: zonedShipments,
      unzoned: unzonedShipments,
      pct: (zonedShipments + unzonedShipments) > 0
        ? (zonedShipments / (zonedShipments + unzonedShipments)) * 100 : null,
    },
    health: {
      cells: all.length,
      pricedCells: priced.length,
      unpricedCells: all.length - priced.length,
      costOnlyCells: costOnly.length,
      perfShipments: all.reduce((s, c) => s + c.shipments, 0),
      // Payment-mode RTO gap, the single most important caveat on this page.
      codRtoPct: rtoFor(all, 'COD'),
      prepaidRtoPct: rtoFor(all, 'Prepaid'),
    },
  }
}

function rtoFor(cells, pay) {
  const list = cells.filter(c => c.pay === pay)
  const n = list.reduce((s, c) => s + c.resolved, 0)
  const r = list.reduce((s, c) => s + c.rto, 0)
  return n > 0 ? (r / n) * 100 : null
}
