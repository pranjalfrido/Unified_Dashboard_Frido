// EBO store-wise P&L helpers — resolves the Retail POS store_id → unifiedstorename mapping
// (from Supabase's store_all_stores) and the 6 fixed-cost sheets (rent, employee, CAM, utilities,
// software, volumetric rent) that sit below CM2 to get to EBITDA. Fetched over PostgREST rather
// than api/_db.js's getPool() — SUPABASE_URL in .env is a placeholder localhost connection string,
// not the real Supabase Postgres URL, so the REST API (SUPABASE_PROJECT_URL + SUPABASE_SECRET_KEY)
// is the only working path to this data today.
//
// store_marketing_cost is intentionally not fetched here — confirmed with user 2026-08-20 the
// table is still being built (0 rows, no real columns yet). Marketing Spend/CM2→EBITDA for stores
// renders as "—" until it's populated; no code change needed here when it is, since every
// consumer already treats a missing cost line as "not costed" rather than zero.

const REST_BASE = process.env.SUPABASE_PROJECT_URL || 'https://dkvxaekxyqjjxcjoidqz.supabase.co'
const REST_KEY = process.env.SUPABASE_SECRET_KEY

async function fetchTable(table, params = '') {
  if (!REST_KEY) throw new Error('SUPABASE_SECRET_KEY not configured')
  const res = await fetch(`${REST_BASE}/rest/v1/${table}?select=*${params}`, {
    headers: { apikey: REST_KEY, Authorization: `Bearer ${REST_KEY}` },
  })
  if (!res.ok) throw new Error(`Supabase fetch failed for ${table}: ${res.status} ${await res.text()}`)
  return res.json()
}

// Every numeric column in these sheets is stored as TEXT, with missing values as the literal
// string "NaN" (not SQL NULL) — confirmed 2026-08-20, treat as 0/not-applicable per user direction,
// same "silently absent" convention COGS/SnD already use elsewhere rather than blocking the page.
function num(v) {
  if (v == null) return 0
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

// month_year values are expected as full timestamps ("2026-07-26 00:00:00") but this parses
// several other realistic sheet-entry shapes too (confirmed 2026-08-24: entries should be tolerant
// of format drift as new months get added by hand rather than silently dropping a row the moment
// someone types the date slightly differently) — normalized down to YYYY-MM so cost rows can be
// joined against the revenue side's own CAST(OrderDate AS STRING) month key. Handles, in order:
//   1. ISO-ish "YYYY-MM..." (the current real format, incl. full timestamps)
//   2. "MM/YYYY" or "M/YYYY" (e.g. "07/2026")
//   3. "MM-YYYY" or "M-YYYY" (e.g. "07-2026")
//   4. "DD/MM/YYYY" or "DD-MM-YYYY" (e.g. "26/07/2026")
//   5. A native Date/timestamp value (Supabase can hand back a Date object, not just a string, for
//      timestamp columns depending on the client)
//   6. Last resort: anything JS's own Date parser can make sense of (e.g. "July 2026", "2026/07")
// Returns null (row dropped, same as before) only when NONE of these can extract a valid month.
function toMonthKey(monthYear) {
  if (!monthYear) return null
  if (monthYear instanceof Date) {
    if (isNaN(monthYear.getTime())) return null
    return `${monthYear.getFullYear()}-${String(monthYear.getMonth() + 1).padStart(2, '0')}`
  }
  const str = String(monthYear).trim()
  const iso = str.match(/^(\d{4})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}`
  const slashOrDashMY = str.match(/^(\d{1,2})[/-](\d{4})$/)
  if (slashOrDashMY) return `${slashOrDashMY[2]}-${slashOrDashMY[1].padStart(2, '0')}`
  const dmy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}`
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`
  return null
}

// Normalizes store_rent/store_utilities' `year` column to a clean 4-digit string key, tolerating
// a number (2026), a numeric string with whitespace (" 2026 "), or a full date value someone might
// enter by mistake (extracts just the year) — same defensive-parsing spirit as toMonthKey above, so
// getCostForMonth's lookup key (monthKey.slice(0,4)) reliably matches what's stored here.
function toYearKey(year) {
  if (year == null) return null
  if (year instanceof Date) return isNaN(year.getTime()) ? null : String(year.getFullYear())
  const str = String(year).trim()
  const plain = str.match(/^(\d{4})$/)
  if (plain) return plain[1]
  const embedded = str.match(/(\d{4})/)
  if (embedded) return embedded[1]
  return null
}

// store_all_stores encodes two kinds of non-store rows inline rather than just omitting them:
// a real store_id that's actually a test/demo entry (mapped straight to null/junk), and an
// explicit unifiedstorename of the literal string "Ignore" for real POS ids that aren't retail
// selling floors (e.g. FRIDO_0004 "Exhibition", FRIDO_0007 "Retail Inside Sales" — confirmed via
// live BQ cross-check 2026-08-20: both exist with real order volume but aren't stores to report
// EBITDA for). Both must be filtered out here, not just a plain null check.
export async function getStoreIdMap() {
  const rows = await fetchTable('store_all_stores')
  const map = {}
  rows.forEach(r => {
    const unified = (r.unifiedstorename || '').trim()
    if (!r.store_id || !unified || unified.toLowerCase() === 'ignore') return
    map[r.store_id] = unified
  })
  return map
}

// Returns { [unifiedstorename]: { [monthKey]: { rent, employeeCost, cam, utilities, software, volumetricRent } } }
// rent/utilities are keyed by YEAR, not month, in their source sheets — but rent_amt_rs (and the
// utility figure) is itself already the flat MONTHLY amount, not an annual total (confirmed
// 2026-08-20: rent doesn't vary month to month within a year, so it's recorded once per year rather
// than as 12 identical monthly rows). getCostForMonth() below therefore correctly applies that same
// figure to every month of the year it belongs to — a 3-month range legitimately adds it 3 times,
// once per month, not a bug and not something to pro-rate. A genuine mid-year rent revision would
// need a second row for the new amount (there's currently no month grain to split within a year if
// one happens, so it would apply to the whole year until this sheet gains real month granularity).
//
// rent fallback (confirmed 2026-08-23): when a store_rent row has no usable rent_amt_rs (missing/
// NaN), fall back to percent_of_revenue% of that store-MONTH's own Net Revenue instead of leaving
// rent uncosted. This fallback is resolved per (store, month) in getCostForMonth() below, not here
// — rentByYear only stores the two raw ingredients (the real amount if present, and the fallback
// %), since the % needs that specific month's own Net Revenue, which isn't known until the revenue
// side of storePnLRows computes it.
export async function getStoreCosts() {
  const [rent, employee, cam, utilities, software, volumetricRent] = await Promise.all([
    fetchTable('store_rent'),
    fetchTable('store_employee_cost'),
    fetchTable('store_cam'),
    fetchTable('store_utilities'),
    fetchTable('store_software_cost'),
    fetchTable('store_volumental_rent'),
  ])

  const byStore = {}
  const ensure = (store) => {
    if (!byStore[store]) byStore[store] = { rentByYear: {}, rentPctByYear: {}, monthly: {} }
    return byStore[store]
  }
  const ensureMonth = (store, monthKey) => {
    const s = ensure(store)
    if (!s.monthly[monthKey]) s.monthly[monthKey] = { employeeCost: 0, cam: 0, software: 0, volumetricRent: 0 }
    return s.monthly[monthKey]
  }

  rent.forEach(r => {
    const year = toYearKey(r.year)
    if (!r.store_name || !year) return
    const s = ensure(r.store_name)
    const amt = num(r.rent_amt_rs)
    // A real rent_amt_rs entry wins outright; percent_of_revenue is only ever consulted when the
    // amount itself is missing/NaN (num() collapses both to 0, indistinguishable from a genuine
    // ₹0 entry — but a genuine ₹0 rent is not a realistic real-world value, so treating any 0 here
    // as "missing" and falling back to the % is the correct read, not a false positive in practice).
    if (amt > 0) s.rentByYear[year] = (s.rentByYear[year] || 0) + amt
    else s.rentPctByYear[year] = (s.rentPctByYear[year] || 0) + num(r.percent_of_revenue)
  })
  utilities.forEach(r => {
    const year = toYearKey(r.year)
    if (!r.store_name || !year) return
    const s = ensure(r.store_name)
    if (!s.utilitiesByYear) s.utilitiesByYear = {}
    s.utilitiesByYear[year] = (s.utilitiesByYear[year] || 0) + num(r.total_utility_charge || r.utilities_charges_amt_rs)
  })
  employee.forEach(r => {
    const monthKey = toMonthKey(r.month_year)
    if (!r.store_name || !monthKey) return
    ensureMonth(r.store_name, monthKey).employeeCost += num(r.gross_salary_amt_rs) + num(r.incenitives)
  })
  cam.forEach(r => {
    const monthKey = toMonthKey(r.month_year)
    if (!r.store_name || !monthKey) return
    ensureMonth(r.store_name, monthKey).cam += num(r.cam_charges_amt_rs) + num(r.mall_infra_charges)
  })
  software.forEach(r => {
    const monthKey = toMonthKey(r.month_year)
    if (!r.store_name || !monthKey) return
    ensureMonth(r.store_name, monthKey).software += num(r.total_software_cost)
  })
  volumetricRent.forEach(r => {
    const monthKey = toMonthKey(r.month_year)
    if (!r.store_name || !monthKey) return
    ensureMonth(r.store_name, monthKey).volumetricRent += num(r.volumental_rent_amt_rs_month)
  })

  return byStore
}

// Resolves one store × one month's full fixed-cost line — six independently-sourced components,
// each its own calculation (confirmed 2026-08-23: kept as separate named steps below rather than
// a single combined lookup, so each line's source/fallback stays individually auditable):
//
//   rent          = that year's real rent_amt_rs, OR percent_of_revenue% × this store-month's own
//                   Net Revenue when no real amount was entered (confirmed 2026-08-23 — the % fallback
//                   is resolved HERE, not in getStoreCosts, since it needs this specific month's
//                   Net Revenue, which only this call site knows).
//   utilities     = that year's flat monthly total_utility_charge (same "flat monthly figure filed
//                   once per year" shape as rent's real-amount path — see getStoreCosts' comment).
//   employeeCost  = that month's gross_salary_amt_rs + incenitives.
//   cam           = that month's cam_charges_amt_rs + mall_infra_charges.
//   software      = that month's total_software_cost.
//   volumetricRent = that month's volumental_rent_amt_rs_month (confirmed 2026-08-24 against the
//   real Supabase column — a prior brief rename to volumental_rent_amt_rs was wrong).
//
// netRevForMonth: this store-month's own Net Revenue (Exc GST, after returns) — required only for
// the rent % fallback; every other line ignores it.
export function getCostForMonth(storeCosts, unifiedStoreName, monthKey, netRevForMonth = 0) {
  const s = storeCosts[unifiedStoreName]
  if (!s) return { rent: 0, utilities: 0, employeeCost: 0, cam: 0, software: 0, volumetricRent: 0 }
  const year = monthKey ? monthKey.slice(0, 4) : null
  const m = s.monthly?.[monthKey] || {}

  const rent = (() => {
    const realAmt = year ? (s.rentByYear?.[year] || 0) : 0
    if (realAmt > 0) return realAmt
    const pct = year ? (s.rentPctByYear?.[year] || 0) : 0
    // percent_of_revenue is stored as a decimal FRACTION, not a percentage number — 0.15 means
    // 15% (confirmed 2026-08-24 against real data: Bhartiya Mall/Felix Plaza/DLF Mall/M5 Mall all
    // carry percent_of_revenue=0.15 with no real rent_amt_rs). Multiplying directly by
    // netRevForMonth is correct; dividing by 100 first (as an earlier version of this did, treating
    // 0.15 as "0.15%") understated rent by 1000x for every store on this fallback.
    return pct > 0 ? pct * netRevForMonth : 0
  })()
  const utilities = year ? (s.utilitiesByYear?.[year] || 0) : 0
  const employeeCost = m.employeeCost || 0
  const cam = m.cam || 0
  const software = m.software || 0
  const volumetricRent = m.volumetricRent || 0

  return { rent, utilities, employeeCost, cam, software, volumetricRent }
}
