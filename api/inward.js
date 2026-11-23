/* global process */
// Inventory → Inward (POST /api/inward). Rewritten 2026-11-08 for the new Inward page — the old
// version read the legacy stg_unicommerce_grn_report table. Data rules: api/_inward_core.js and
// docs/INWARD_DATA_NOTES.md.
//
// Access: the caller's Supabase session (Authorization: Bearer <token>, sent by authFetch) must
// belong to an active admin, or to a member granted 'inventory:inward' in user_permissions —
// checked here on the server, not only by hiding the tab. Same lookup pattern as api/pulse.js.
//
// Body: { start, end, warehouse[], sourceType[], vendor[], category[], subCategory[], sku }
//       or { mode: 'sku'|'vendor'|'subcat', sku|vendor|subCategory: '<value>' } for that
//       SKU's/vendor's/sub-category's last 10 distinct GRN days (full history, not range-bound);
//       or { mode: 'dq_export', kind: 'sku'|'vendor', start, end } — admins only — every raw GRN
//       line (not aggregated) for SKUs/vendors unresolved in that date range, for the Data quality
//       panel's export.
// One BigQuery round (GRN lines, sales, SKU master, SKU mapping [+ data quality for admins]) per
// date range, cached 15 min; filters are applied in JS on the cached rows, so changing a filter
// never re-queries BigQuery. The page's own GRN-level COGS tiering was found unreliable and was
// removed — `skuMonthly`/`prevSkuMonthly` below instead feed the client-side "Inward value ₹" tile
// (useInwardCogsValue), which reads product_cogs_monthly through /api/cogs-monthly, same as P&L.
import { createClient } from '@supabase/supabase-js'
import { getBQ, requestTimer } from './_bq.js'
import { buildFacilityMaps } from './_inventory_shared.js'
import {
  INWARD_PERMISSION, GRN_SQL, DQ_SQL, DQ_UNMAPPED_SKU_DETAIL_SQL, DQ_UNMAPPED_VENDOR_DETAIL_SQL, SALES_SQL,
  SKU_GRN_SQL, VENDOR_GRN_SQL, SUBCAT_GRN_SQL, MASTER_SQL, SKUMAP_SQL, FIRST_SKU_SQL, LAST_SKU_SQL, VENDOR_MASTER_SQL, EXCLUDED_PKG_SQL,
  periods, isIsoDate, normaliseFilters, nonSaleChannels, buildInwardPayload, buildLastGrnDays, buildVendorSkusSupplied, GRN_FLOOR,
} from './_inward_core.js'

const DATA_TTL_MS = 15 * 60 * 1000
const AUTH_TTL_MS = 60 * 1000
const MAX_RANGE_DAYS = 800

// ── Small TTL caches (per warm instance) ─────────────────────────────────────────────
function ttlCache(max) {
  const m = new Map()
  return {
    get(k) { const e = m.get(k); if (!e) return undefined; if (e.exp < Date.now()) { m.delete(k); return undefined } return e.v },
    set(k, v, ttl) { if (m.size >= max) m.delete(m.keys().next().value); m.set(k, { v, exp: Date.now() + ttl }) },
  }
}
const dataCache = ttlCache(24)    // raw rows per date range (+ admin flag)
const inflight = new Map()        // same key requested twice at once → one BigQuery round
const authCache = ttlCache(500)   // token → auth result

// ── Server-side permission check ─────────────────────────────────────────────────────
function getAdminClient() {
  const url = process.env.SUPABASE_PROJECT_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_PROJECT_URL or SUPABASE_SECRET_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// NavAI (the connector) reads this endpoint with its own read-only secret; middleware.js already checked the
// secret and the path. It gets the same view as a non-admin member (no Data quality / dq_export); the connector
// itself decides, from the asking user's permissions, whether that user may see Inward at all.
function isNavai(req) {
  const secret = process.env.NAVAI_API_SECRET || ''
  const sent = String(req.headers?.['x-navai-secret'] || '')
  if (secret.length < 32 || sent.length !== secret.length) return false
  let diff = 0
  for (let i = 0; i < sent.length; i++) diff |= sent.charCodeAt(i) ^ secret.charCodeAt(i)
  return diff === 0
}

export async function authorizeInward(req, client) {
  if (isNavai(req)) return { ok: true, isAdmin: false, userId: 'navai' }
  const h = req.headers?.authorization || req.headers?.Authorization || ''
  const token = /^Bearer\s+(.+)$/i.exec(h)?.[1]?.trim()
  if (!token) return { status: 401, error: 'Not logged in.' }
  const cached = authCache.get(token)
  if (cached) return cached
  let admin
  try { admin = client || getAdminClient() } catch { return { status: 503, error: 'Auth service unavailable.' } }
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user) return { status: 401, error: 'Session expired. Please log in again.' }
  const userId = userData.user.id
  const { data: profile, error: profileErr } = await admin.from('user_profiles').select('is_admin, is_active').eq('user_id', userId).maybeSingle()
  if (profileErr) return { status: 503, error: 'Auth service unavailable.' }
  if (!profile?.is_active) return { status: 403, error: 'Your account has been deactivated. Contact your admin.' }
  let result
  if (profile.is_admin) {
    result = { ok: true, isAdmin: true, userId }
  } else {
    // Inward is available to anyone who already has Inventory access (Health/Detail or Sales &
    // Allocation), not only a separate 'inventory:inward' grant — matches the sidebar's hasInwardAccess.
    const { data: grants, error: grantErr } = await admin.from('user_permissions').select('tab').eq('user_id', userId).in('tab', [INWARD_PERMISSION, 'inventory', 'inventory:detail', 'inventory:sales'])
    if (grantErr) return { status: 503, error: 'Auth service unavailable.' }
    result = grants?.length ? { ok: true, isAdmin: false, userId } : { status: 403, error: "You don't have access to Inventory → Inward." }
  }
  authCache.set(token, result, AUTH_TTL_MS)
  return result
}

// ── BigQuery helpers ─────────────────────────────────────────────────────────────────
async function q(bq, timer, key, query, params, types) {
  const t0 = Date.now()
  const [rows] = await bq.query({ query, params, types, maximumBytesBilled: '20000000000' })
  timer.queryTimings.push({ key, ms: Date.now() - t0 })
  return rows
}

async function loadRange(range, isAdmin, timer) {
  const key = `${range.prevStart}|${range.end}|${isAdmin ? 'a' : 'm'}`
  const hit = dataCache.get(key)
  if (hit) { timer.markCacheHit(key); return hit }
  if (inflight.has(key)) return inflight.get(key)
  timer.markCacheMiss(key)
  const p = (async () => {
    const bq = getBQ()
    const { channelToDescription } = buildFacilityMaps()
    const span = { qStart: range.prevStart, qEnd: range.end }
    const excl = nonSaleChannels(channelToDescription)
    const [grnRows, salesRows, masterRows, skuMapRows, firstSkuRows, lastSkuRows, vendorMasterRows, dqRows, excludedPkgRows] = await Promise.all([
      q(bq, timer, 'grn', GRN_SQL, span),
      q(bq, timer, 'sales', SALES_SQL, { ...span, excl }, { excl: ['STRING'] }),
      q(bq, timer, 'master', MASTER_SQL),
      q(bq, timer, 'skumap', SKUMAP_SQL),
      // Scans the FULL history (GRN_FLOOR → range.end), independent of range.start, so "New SKU"
      // always means "never received before" — not "not received in the selected range's prior days".
      q(bq, timer, 'first_sku', FIRST_SKU_SQL, { qEnd: range.end }),
      // Same full-history scan, but for the Product master table's Last inward date/qty/vendor —
      // so a SKU with no GRN in the selected range still shows its true last-ever inward.
      q(bq, timer, 'last_sku', LAST_SKU_SQL, { qEnd: range.end }),
      // Vendor master: every vendor ever used, full history, for lifetime totals + last GRN date.
      q(bq, timer, 'vendor_master', VENDOR_MASTER_SQL, { qEnd: range.end }),
      isAdmin ? q(bq, timer, 'dq', DQ_SQL, { qStart: range.start, qEnd: range.end }) : Promise.resolve(null),
      // "Finished goods only · X units … not shown" note (small addition) — units excluded as raw
      // material/packaging in the CURRENT period only (not prevStart → end like `span`).
      q(bq, timer, 'excluded_pkg', EXCLUDED_PKG_SQL, { qStart: range.start, qEnd: range.end }),
    ])
    const data = { grnRows, salesRows, masterRows, skuMapRows, firstSkuRows, lastSkuRows, vendorMasterRows, dqRows, excludedPkgUnits: Number(excludedPkgRows?.[0]?.units) || 0 }
    dataCache.set(key, data, DATA_TTL_MS)
    return data
  })()
  inflight.set(key, p)
  try { return await p } finally { inflight.delete(key) }
}

// Last 10 distinct GRN days for one SKU or one vendor — the full history (GRN_FLOOR → today), not
// bound by the page's selected date range, so a SKU/vendor with no recent activity still shows its
// true last 10 days rather than an empty table just because the page filter is on a narrow range.
async function lastGrnDays(body, timer) {
  const mode = body.mode
  const bq = getBQ()
  const today = new Date().toISOString().slice(0, 10)
  const span = { qStart: GRN_FLOOR, qEnd: today }
  if (mode === 'sku') {
    const sku = String(body.sku || '').trim()
    if (!sku) return { status: 400, error: 'sku required' }
    const grnRows = await q(bq, timer, 'sku_grn', SKU_GRN_SQL, { ...span, sku })
    return { ok: true, data: buildLastGrnDays({ grnRows }) }
  }
  if (mode === 'subcat') {
    const subCategory = String(body.subCategory || '').trim()
    if (!subCategory) return { status: 400, error: 'subCategory required' }
    const grnRows = await q(bq, timer, 'subcat_grn', SUBCAT_GRN_SQL, { ...span, subCategory })
    return { ok: true, data: buildLastGrnDays({ grnRows }) }
  }
  const vendor = String(body.vendor || '').trim()
  if (!vendor) return { status: 400, error: 'vendor required' }
  const grnRows = await q(bq, timer, 'vendor_grn', VENDOR_GRN_SQL, { ...span, vendor })
  const out = buildLastGrnDays({ grnRows })
  // "SKUs supplied" addition: only for the vendor drill-down, only when the page's own selected
  // range is passed through — SKU/sub-category units IN that range (not full history, unlike the
  // last-10-GRN-days table above), reusing the same grnRows already fetched for this vendor.
  if (isIsoDate(body.start) && isIsoDate(body.end)) {
    out.skusSupplied = buildVendorSkusSupplied({ grnRows, start: body.start, end: body.end })
  }
  return { ok: true, data: out }
}

// Full GRN-level export (every raw line, not aggregated) for admins: SKUs or vendors unresolved
// in the given date range. Loaded lazily, only when an admin clicks the export — never part of
// the normal page payload.
async function dqExport(body, timer) {
  const { start, end, kind } = body
  if (!isIsoDate(start) || !isIsoDate(end) || start > end) return { status: 400, error: 'start and end (YYYY-MM-DD, start ≤ end) required' }
  const bq = getBQ()
  const span = { qStart: start, qEnd: end }
  if (kind === 'vendor') {
    const rows = await q(bq, timer, 'dq_vendor_detail', DQ_UNMAPPED_VENDOR_DETAIL_SQL, span)
    return { ok: true, data: { rows } }
  }
  const rows = await q(bq, timer, 'dq_sku_detail', DQ_UNMAPPED_SKU_DETAIL_SQL, span)
  return { ok: true, data: { rows } }
}

export default async function inwardHandler(req, res) {
  const timer = requestTimer('inward')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await authorizeInward(req)
  if (!auth.ok) { timer.finish(res); return res.status(auth.status).json({ error: auth.error }) }

  const body = req.body || {}

  try {
    if (body.mode === 'sku' || body.mode === 'vendor' || body.mode === 'subcat') {
      const r = await lastGrnDays(body, timer)
      timer.finish(res)
      return r.ok ? res.json(r.data) : res.status(r.status).json({ error: r.error })
    }
    if (body.mode === 'dq_export') {
      if (!auth.isAdmin) { timer.finish(res); return res.status(403).json({ error: 'Admins only.' }) }
      const r = await dqExport(body, timer)
      timer.finish(res)
      return r.ok ? res.json(r.data) : res.status(r.status).json({ error: r.error })
    }
    const { start, end } = body
    if (!isIsoDate(start) || !isIsoDate(end) || start > end) return res.status(400).json({ error: 'start and end (YYYY-MM-DD, start ≤ end) required' })
    const range = periods(start < GRN_FLOOR ? GRN_FLOOR : start, end)
    if (range.days > MAX_RANGE_DAYS) return res.status(400).json({ error: `Pick a range of at most ${MAX_RANGE_DAYS} days` })
    const data = await loadRange(range, auth.isAdmin, timer)
    const payload = buildInwardPayload({ ...data, range, filters: normaliseFilters(body), isAdmin: auth.isAdmin, excludedPkgUnits: data.excludedPkgUnits })
    timer.finish(res)
    return res.json(payload)
  } catch (e) {
    console.error('[inward]', e.message)
    timer.finish(res)
    return res.status(500).json({ error: e.message })
  }
}
