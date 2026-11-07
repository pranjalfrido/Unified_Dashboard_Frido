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
//       or { mode: 'sku', sku: '<Product_Code>', start, end } for one SKU's drill-down.
// One BigQuery round (GRN lines, sales, SKU master, SKU mapping [+ data quality for admins]) per
// date range, cached 15 min; filters are applied in JS on the cached rows, so changing a filter
// never re-queries BigQuery. ₹ value = units × COGS, read in-process through api/cogs-monthly.js.
import { createClient } from '@supabase/supabase-js'
import { getBQ, requestTimer } from './_bq.js'
import { buildFacilityMaps, buildSkuMap, normSku } from './_inventory_shared.js'
import cogsMonthlyHandler from './cogs-monthly.js'
import {
  INWARD_PERMISSION, GRN_SQL, DQ_SQL, SALES_SQL, SKU_GRN_SQL, SKU_SALES_SQL, MASTER_SQL, SKUMAP_SQL,
  periods, monthOf, isIsoDate, normaliseFilters, nonSaleChannels, buildInwardPayload, buildSkuDetail, GRN_FLOOR,
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

export async function authorizeInward(req, client) {
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
    const { data: grant, error: grantErr } = await admin.from('user_permissions').select('tab').eq('user_id', userId).eq('tab', INWARD_PERMISSION).limit(1)
    if (grantErr) return { status: 503, error: 'Auth service unavailable.' }
    result = grant?.length ? { ok: true, isAdmin: false, userId } : { status: 403, error: "You don't have access to Inventory → Inward." }
  }
  authCache.set(token, result, AUTH_TTL_MS)
  return result
}

// ── COGS through the existing /api/cogs-monthly handler (in-process, same pool + query) ──
function callHandler(handler, body) {
  return new Promise((resolve, reject) => {
    let code = 200
    const res = {
      setHeader() {}, status(c) { code = c; return res },
      json(b) { if (code >= 400) reject(new Error(b?.error || `cogs-monthly ${code}`)); else resolve(b) },
      end() { resolve(null) },
    }
    Promise.resolve(handler({ method: 'POST', body }, res)).catch(reject)
  })
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
    const cogsP = callHandler(cogsMonthlyHandler, { startMonth: monthOf(range.prevStart), endMonth: monthOf(range.end) })
      .then(r => ({ rows: r?.rows || [] }), e => ({ rows: [], error: e.message }))
    const [grnRows, salesRows, masterRows, skuMapRows, dqRows, cogs] = await Promise.all([
      q(bq, timer, 'grn', GRN_SQL, span),
      q(bq, timer, 'sales', SALES_SQL, { ...span, excl }, { excl: ['STRING'] }),
      q(bq, timer, 'master', MASTER_SQL),
      q(bq, timer, 'skumap', SKUMAP_SQL),
      isAdmin ? q(bq, timer, 'dq', DQ_SQL, { qStart: range.start, qEnd: range.end }) : Promise.resolve(null),
      cogsP,
    ])
    const data = { grnRows, salesRows, masterRows, skuMapRows, dqRows, cogsRows: cogs.rows, cogsError: cogs.error }
    dataCache.set(key, data, DATA_TTL_MS)
    return data
  })()
  inflight.set(key, p)
  try { return await p } finally { inflight.delete(key) }
}

async function skuDetail(body, timer) {
  const sku = String(body.sku || '').trim()
  if (!sku) return { status: 400, error: 'sku required' }
  const start = body.start, end = body.end
  const bq = getBQ()
  const { channelToDescription } = buildFacilityMaps()
  const excl = nonSaleChannels(channelToDescription)
  // Every raw sales key that resolves to this SKU: itself + productids mapped to it.
  const skuMapRows = await q(bq, timer, 'skumap', SKUMAP_SQL)
  const target = normSku(sku)
  const keys = new Set([target])
  for (const [pid, master] of buildSkuMap(skuMapRows)) if (master === target) keys.add(pid)
  const span = { qStart: start, qEnd: end }
  const [grnRows, salesRows] = await Promise.all([
    q(bq, timer, 'sku_grn', SKU_GRN_SQL, { ...span, sku }),
    q(bq, timer, 'sku_sales', SKU_SALES_SQL, { ...span, excl, keys: [...keys] }, { excl: ['STRING'], keys: ['STRING'] }),
  ])
  return { ok: true, data: buildSkuDetail({ grnRows, salesRows, start, end }) }
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
  const { start, end } = body
  if (!isIsoDate(start) || !isIsoDate(end) || start > end) return res.status(400).json({ error: 'start and end (YYYY-MM-DD, start ≤ end) required' })
  const range = periods(start < GRN_FLOOR ? GRN_FLOOR : start, end)
  if (range.days > MAX_RANGE_DAYS) return res.status(400).json({ error: `Pick a range of at most ${MAX_RANGE_DAYS} days` })

  try {
    if (body.mode === 'sku') {
      const today = new Date().toISOString().slice(0, 10)
      const r = await skuDetail({ ...body, start: range.start, end: today > end ? today : end }, timer)
      timer.finish(res)
      return r.ok ? res.json(r.data) : res.status(r.status).json({ error: r.error })
    }
    const data = await loadRange(range, auth.isAdmin, timer)
    const payload = buildInwardPayload({ ...data, range, filters: normaliseFilters(body), isAdmin: auth.isAdmin })
    timer.finish(res)
    return res.json(payload)
  } catch (e) {
    console.error('[inward]', e.message)
    timer.finish(res)
    return res.status(500).json({ error: e.message })
  }
}
