// Courier behaviour profiles, MEASURED from the invoices instead of hardcoded.
//
// WHY THIS FILE EXISTS: three lists of courier names were typed into the SQL — the all-in
// couriers, the RTO bundlers, and the per-kg contracts. Every one of them is a claim about
// how a courier bills, and every one silently rots when a new courier is dumped or an
// existing one changes convention. A name missing from the all-in list gets a phantom
// surcharge; a name missing from the bundler list reports RTO at ~2x reality. Both are
// wrong in the direction of a bigger claim, which is the dangerous direction.
//
// So each list is now derived from a measurable billing signature, with thresholds placed
// inside a verified empty gap rather than at a value the data actually sits on.

// Ex-GST total. Delhivery uploaded GST-inclusive totals; keyed on the 1.18 RATIO so the
// correction self-retires when a clean file lands rather than stripping 18% forever.
const EX_GST_T = `CASE
  WHEN abs(total_cost::float8 / NULLIF(freight_charge::float8
       + COALESCE(surcharge::float8,0) + COALESCE(other_charge::float8,0), 0) - 1.18) < 0.005
  THEN total_cost::float8 / 1.18 ELSE total_cost::float8 END`

// ── 1. ALL-IN couriers ────────────────────────────────────────────────────────────────
// Signature: freight IS the total, so there is no add-on to model and the surcharge rate
// must be pinned to 0. Measured: the six all-in couriers sit at exactly 100.0% of rows with
// freight == total; the three that levy add-ons sit at exactly 0.0%. No courier is in
// between, so 95% is a threshold in open space, not a tuned cutoff.
//
// This was the Swift bug: Swift bills all-in, but a computed surcharge of 0.62-1.03 was
// being layered on top of an already-complete freight figure, inflating Frido's own
// modelled cost and manufacturing variance out of nothing.
export async function allInCouriers(pool, minRows = 200) {
  const { rows } = await pool.query(`
    SELECT courier_name
      FROM public.logistics_invoices_b2c
     WHERE freight_charge > 0 AND total_cost IS NOT NULL
     GROUP BY 1
    HAVING COUNT(*) >= $1
       AND SUM(CASE WHEN abs(${EX_GST_T} - freight_charge::float8) < 0.01 THEN 1 ELSE 0 END)
           >= 0.95 * COUNT(*)
     ORDER BY 1`, [minRows])
  return rows.map(r => r.courier_name)
}

// ── 2. RTO BUNDLERS ───────────────────────────────────────────────────────────────────
// Couriers whose RTO row contains forward + return rather than the return leg alone. For
// these the forward leg must be netted out or the RTO column reads about twice reality.
//
// The obvious test — "does this RTO AWB also have its own Forward row?" — DOES NOT WORK:
// it returns 0% for all nine couriers, because bundlers do not emit a separate forward row
// at all. That is the very reason the bundling is invisible.
//
// What does work is the cost ratio within the same courier/zone/slab cell. Measured:
//   bundlers    Delhivery 1.89 · ElasticRun 1.80 · Shadowfax 1.80 · SkyAir 2.00 · Swift 1.90
//   return-only Bluedart 0.72 · Urbanbolt 0.90
// Nothing lands between 0.90 and 1.80, so the 1.30 threshold sits mid-gap. A contract at
// the ~0.9x couriers typically specify can never cross it; only genuine bundling can.
export async function rtoBundlers(pool, minRtoRows = 100, ratioThreshold = 1.30) {
  const { rows } = await pool.query(`
    WITH s AS (
      SELECT courier_name, zone,
             CASE WHEN charged_weight_courier > 0 AND charged_weight_courier <= 0.5 THEN 0.5
                  WHEN charged_weight_courier > 0 THEN CEIL(charged_weight_courier) END AS slab,
             upper(shipment_mode) AS md, ${EX_GST_T} AS c
        FROM public.logistics_invoices_b2c
       WHERE freight_charge > 0 AND charged_weight_courier > 0
         AND upper(shipment_mode) IN ('FORWARD','RTO')),
    m AS (
      SELECT courier_name, zone, slab, md, COUNT(*) AS n,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY c) AS med
        FROM s GROUP BY 1,2,3,4)
    SELECT r.courier_name
      FROM m r
      JOIN m f ON f.courier_name = r.courier_name AND f.zone = r.zone
             AND f.slab IS NOT DISTINCT FROM r.slab AND f.md = 'FORWARD'
     WHERE r.md = 'RTO'
     GROUP BY 1
    HAVING SUM(r.n) >= $1
       AND percentile_cont(0.5) WITHIN GROUP (ORDER BY r.med / NULLIF(f.med,0)) >= $2
     ORDER BY 1`, [minRtoRows, ratioThreshold])
  return rows.map(r => r.courier_name)
}

// ── 3. PER-KG (UNSLABBED) CONTRACTS ───────────────────────────────────────────────────
// Deliberately NOT derived. A weight heuristic looks tempting — Bluedart B2B has a 78 kg
// median with 92.5% of rows over 20 kg — but Ekart sits at 27 kg and 80.3% while still
// being slab-priced. Any threshold that catches B2B also catches Ekart and would wrongly
// strip its slabbing.
//
// This is a fact about a signed contract, not a pattern in the data, so it stays explicit.
// ADD A COURIER HERE when its contract prices per actual kg with no slab rounding.
export const PER_KG_COURIERS = ['Bluedart B2B']

// Volumetric divisor per contract CFT; B2C default 5000, Bluedart B2B CFT 6 gives 4500.
// A SMALLER divisor yields a HEAVIER volumetric weight, so using the B2C 5000 for B2B would
// understate what the courier may charge and fabricate an overbilling claim.
export const VOLUMETRIC_DIVISOR = { 'Bluedart B2B': 4500 }
export const DEFAULT_VOLUMETRIC_DIVISOR = 5000

// SQL-literal list, NULL-safe: an empty array must become NULL rather than IN () which is
// a syntax error, so callers can interpolate the result unconditionally.
export const sqlList = names =>
  names.length ? names.map(n => `'${n.replace(/'/g, "''")}'`).join(',') : 'NULL'

// Resolve every profile in one round trip and report what was measured, so a convention
// change shows up in the refresh log instead of silently altering the numbers.
export async function loadCourierProfiles(pool, { log = console.log } = {}) {
  const [allIn, bundlers] = await Promise.all([allInCouriers(pool), rtoBundlers(pool)])
  log(`  profiles: all-in [${allIn.join(', ') || 'none'}]`)
  log(`            rto-bundlers [${bundlers.join(', ') || 'none'}]`)
  log(`            per-kg [${PER_KG_COURIERS.join(', ')}] (contract-set)`)
  return { allIn, bundlers, perKg: PER_KG_COURIERS,
           allInSql: sqlList(allIn), bundlersSql: sqlList(bundlers), perKgSql: sqlList(PER_KG_COURIERS) }
}

// ── Persistence ───────────────────────────────────────────────────────────────────────
// The API serves requests and cannot afford to re-measure per call, so the refresh writes
// the measured profiles to a table the API reads once and caches. Storing them also makes a
// convention change auditable: the row shows what was measured and when.
export async function persistCourierProfiles(pool, profiles) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.lc_courier_profile (
      courier_name  text PRIMARY KEY,
      is_all_in     boolean NOT NULL DEFAULT false,  -- freight already equals total
      is_rto_bundle boolean NOT NULL DEFAULT false,  -- RTO row includes the forward leg
      is_per_kg     boolean NOT NULL DEFAULT false,  -- priced per actual kg, no slabbing
      measured_at   timestamptz NOT NULL DEFAULT now()
    )`)
  // Every courier present in the ledger gets a row, so a new courier appears with all flags
  // false rather than being absent and forcing the reader to guess.
  await pool.query(`
    INSERT INTO public.lc_courier_profile
          (courier_name, is_all_in, is_rto_bundle, is_per_kg, measured_at)
    SELECT DISTINCT i.courier_name,
           i.courier_name = ANY($1), i.courier_name = ANY($2), i.courier_name = ANY($3), now()
      FROM public.logistics_invoices_b2c i
     WHERE i.courier_name IS NOT NULL
        ON CONFLICT (courier_name) DO UPDATE
       SET is_all_in     = EXCLUDED.is_all_in,
           is_rto_bundle = EXCLUDED.is_rto_bundle,
           is_per_kg     = EXCLUDED.is_per_kg,
           measured_at   = EXCLUDED.measured_at`,
    [profiles.allIn, profiles.bundlers, profiles.perKg])
}
