/* global process */
// Login wall for the dashboard's data (security fix, see SECURITY_FIX.md).
//
// Vercel runs this before the CDN and the functions, for the paths in config.matcher:
//  - every /api route, except auth-admin and pulse: those check the caller's token themselves, and
//    auth-admin's "forgot password" lookup has to work before anyone is logged in
//  - every file in public/ that is not a known public asset (images, fonts, css, manifest, sw.js, xlsx-worker.js,
//    offline.html, robots.txt): the data .json files, and any .bak/.csv/.xlsx/.txt/.html dropped there by mistake
//  - a valid token also needs an active user_profiles row (checked as the user, cached 60 s): a revoked person gets
//    401 "Access revoked" within a minute instead of waiting for their access token to expire
// A request passes with a valid Supabase access token (Authorization: Bearer <token>, which the
// frontend's authFetch() sends), or, for a scheduled caller, the CRON_SECRET (x-cron-secret header,
// or Vercel cron's own Authorization: Bearer <CRON_SECRET>). Anything else gets 401 and no data.
//
// The token is checked here, with no call to Supabase: it must be an ES256 JWT signed by one of the
// project's published keys (/auth/v1/.well-known/jwks.json), not expired, issued by this project and
// for the 'authenticated' role. A token signed with the legacy HS256 secret (only possible while
// that key is still in use) is checked by asking Supabase (/auth/v1/user) instead, cached until expiry.

import { requirementFor, isAllowed } from './api/_permissionMap.js'

// Every path except the built JS/CSS under /assets/ (never data); needsLogin() below decides per path.
export const config = { matcher: ['/((?!assets/).*)'] }

const OPEN_API = new Set(['/api/auth-admin', '/api/pulse'])

// Files that stay public without a login: the app shell and what the login screen and the installed app need.
// Anything else under public/ (.json, .bak, .csv, .xlsx, .txt, .html, .js, ...) needs a login, so a stray file
// dropped into public/ is private by default.
const PUBLIC_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'ico', 'woff', 'woff2', 'ttf', 'otf', 'css', 'map'])
const PUBLIC_FILES = new Set(['/manifest.webmanifest', '/sw.js', '/xlsx-worker.js', '/offline.html', '/robots.txt', '/index.html'])

// NavAI's read-only service secret (header x-navai-secret). It is NOT the cron secret and it opens only the
// data-reading endpoints below plus the public/*.json files, never feedback, presence, admin or auth-admin.
// api/logistics-cost is deliberately NOT here: its POST body can file/update claims and invalidate caches, and middleware
// can't see the body. NavAI reads that page from the logistics-cost-data.json file instead.
// Who may see which page is enforced by the connector from the asking user's own permissions (api/pulse.js).
const NAVAI_READ_API = new Set([
  'bq', 'logistics', 'inventory', 'inventory-oos', 'sales-allocation', 'return-analysis', 'returns',
  'customer', 'customer-support', 'cogs-monthly', 'cat-daily', 'courier-allocation', 'inward',
])
const NAVAI_SECRET = process.env.NAVAI_API_SECRET || ''

export function navaiMayRead(pathname, method) {
  if (pathname.startsWith('/api/')) return method === 'POST' && NAVAI_READ_API.has(pathname.slice(5).replace(/\/+$/, ''))
  return method === 'GET' && pathname.endsWith('.json')
}

const SUPABASE_URL = (process.env.SUPABASE_PROJECT_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
const ISSUER = `${SUPABASE_URL}/auth/v1`
const CRON_SECRET = process.env.CRON_SECRET || ''

const JWKS_TTL_MS = 10 * 60 * 1000
let jwks = null
let jwksAt = 0
const remoteOk = new Map() // HS256 token -> exp (s), for tokens Supabase confirmed
const ACTIVE_TTL_MS = 60 * 1000
const activeCache = new Map() // user id -> { active, admin, tabs, at }: profile + permissions, kept for 60 s

export function needsLogin(pathname) {
  if (pathname.startsWith('/api/')) return !OPEN_API.has(pathname.replace(/\/+$/, ''))
  if (pathname.startsWith('/assets/') || PUBLIC_FILES.has(pathname)) return false
  const last = pathname.split('/').pop()
  const dot = last.lastIndexOf('.')
  if (dot < 0) return false // page routes (/overview, /pnl): the shell only, data comes from /api and the files above
  return !PUBLIC_EXT.has(last.slice(dot + 1).toLowerCase())
}

function deny() {
  return new Response(JSON.stringify({ error: 'Login required' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'WWW-Authenticate': 'Bearer' },
  })
}

function b64urlBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

function b64urlJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(s)))
}

// Constant-time compare, so the secret can't be guessed one character at a time from response times.
function sameSecret(a, b) {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function signingKeys(force) {
  if (force || !jwks || Date.now() - jwksAt > JWKS_TTL_MS) {
    const r = await fetch(`${ISSUER}/.well-known/jwks.json`)
    if (!r.ok) throw new Error(`jwks ${r.status}`)
    jwks = (await r.json()).keys || []
    jwksAt = Date.now()
  }
  return jwks
}

function claimsOk(p) {
  const now = Math.floor(Date.now() / 1000)
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud]
  return typeof p.exp === 'number' && p.exp > now && p.iss === ISSUER && aud.includes('authenticated') && p.role === 'authenticated'
}

async function verifyEs256(header, parts) {
  let jwk = (await signingKeys(false)).find(k => k.kid === header.kid)
  // A key rotated in since the last fetch: reload once.
  if (!jwk) jwk = (await signingKeys(true)).find(k => k.kid === header.kid)
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256') return false
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))
}

async function verifyRemote(token, payload) {
  const cached = remoteOk.get(token)
  if (cached && cached > Date.now() / 1000) return true
  const r = await fetch(`${ISSUER}/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } })
  if (!r.ok) return false
  if (remoteOk.size > 1000) remoteOk.clear()
  remoteOk.set(token, payload.exp)
  return true
}

export async function validToken(token) {
  if (!SUPABASE_URL || !token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  let header, payload
  try {
    header = b64urlJson(parts[0])
    payload = b64urlJson(parts[1])
  } catch {
    return false
  }
  if (!claimsOk(payload)) return false
  try {
    if (header.alg === 'ES256') return await verifyEs256(header, parts)
    if (header.alg === 'HS256') return await verifyRemote(token, payload)
  } catch (e) {
    console.error('[auth] token check failed:', e.message)
  }
  return false
}

function denyRevoked() {
  return new Response(JSON.stringify({ error: 'Access revoked' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'WWW-Authenticate': 'Bearer' },
  })
}

// A valid token is not enough: the person must still have an active user_profiles row, and (batch 2) their page
// permissions decide which routes and files they may use. Both are read as the user (their own token + the anon key,
// the same reads the app makes at login), so no service key is needed here, and cached together per user for 60 s: a
// revoked person is refused within a minute, a changed permission applies within a minute.
// Returns { active, admin, tabs } (tabs null when user_permissions could not be read: that entry is kept 5 s only),
// or null when Supabase could not be asked (not cached; the caller answers 503).
export async function loadAccess(token, userId) {
  const hit = activeCache.get(userId)
  if (hit && Date.now() - hit.at < ACTIVE_TTL_MS) return hit
  try {
    const h = { apikey: ANON_KEY, Authorization: `Bearer ${token}`, Accept: 'application/json' }
    const uid = encodeURIComponent(userId)
    const [pr, pm] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/user_profiles?select=is_active,is_admin&user_id=eq.${uid}`, { headers: h }),
      fetch(`${SUPABASE_URL}/rest/v1/user_permissions?select=tab&user_id=eq.${uid}`, { headers: h }).catch(() => null),
    ])
    if (pr.status === 401 || pr.status === 403) return { active: false, admin: false, tabs: [] }
    if (!pr.ok) return null
    const rows = await pr.json()
    const active = Array.isArray(rows) && rows.length === 1 && rows[0].is_active === true
    let tabs = null
    if (pm && pm.ok) { const t = await pm.json().catch(() => null); if (Array.isArray(t)) tabs = t.map(r => r.tab) }
    const entry = { active, admin: active && rows[0].is_admin === true, tabs, at: tabs === null ? Date.now() - ACTIVE_TTL_MS + 5000 : Date.now() }
    if (activeCache.size > 2000) activeCache.clear()
    activeCache.set(userId, entry)
    return entry
  } catch (e) {
    console.error('[auth] active check failed:', e.message)
    return null
  }
}

// true / false / null (could not ask), as in batch 1.
export async function userIsActive(token, userId) {
  const a = await loadAccess(token, userId)
  return a === null ? null : a.active
}

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } })

// Would-be denials (and, in enforce mode, real ones) are logged as one line: user id, route or file, required keys.
// No email, no data. Also written to the permission_denials table (docs/sql/permission-denials.sql) so an admin can read
// the last 200 at /api/permission-denials; that insert runs as the user, once per user+route per 10 min, and is skipped
// quietly if the table does not exist yet.
const DENIAL_DEDUPE_MS = 10 * 60 * 1000
const denialSeen = new Map()
async function recordDenial(token, userId, label, specs, mode) {
  console.log(`[permission] ${mode === 'enforce' ? 'denied' : 'would-deny'} uid=${userId} route=${label} need=${specs.join('|')}`)
  const k = userId + ' ' + label
  const last = denialSeen.get(k)
  if (last && Date.now() - last < DENIAL_DEDUPE_MS) return
  if (denialSeen.size > 5000) denialSeen.clear()
  denialSeen.set(k, Date.now())
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/permission_denials`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: userId, route: label, required: specs.join('|'), mode }),
      signal: AbortSignal.timeout(1500),
    })
  } catch { /* logging must never break a request */ }
}

// After the token and active checks: does this person's page permission cover this route or file?
// PERMISSION_ENFORCE=enforce blocks with 403; anything else ("log", the default) only records.
async function permissionGate(request, pathname, userId, token, access) {
  if (access.admin) return
  const enforce = process.env.PERMISSION_ENFORCE === 'enforce'
  let body = null
  if (request.method === 'POST' && pathname.replace(/\/+$/, '') === '/api/logistics-cost') {
    try { if (Number(request.headers.get('content-length') || 0) < 1_000_000) body = await request.clone().json() } catch { body = null }
  }
  const need = requirementFor(pathname, request.method, body)
  if (need.specs.includes('self')) return
  if (access.tabs === null) return enforce ? json(503, { error: 'Auth check unavailable, try again' }, { 'Retry-After': '5' }) : undefined
  if (isAllowed(need.specs, access)) return
  await recordDenial(token, userId, need.label, need.specs, enforce ? 'enforce' : 'log')
  if (enforce) return json(403, { error: 'No access to this data' })
}

export default async function middleware(request) {
  const { pathname } = new URL(request.url)
  // CORS preflights carry no credentials and the handlers answer them without data.
  if (request.method === 'OPTIONS' || !needsLogin(pathname)) return

  const auth = request.headers.get('authorization') || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (CRON_SECRET.length >= 16 && (sameSecret(request.headers.get('x-cron-secret') || '', CRON_SECRET) || sameSecret(bearer, CRON_SECRET))) return

  if (NAVAI_SECRET.length >= 32 && navaiMayRead(pathname, request.method) && sameSecret(request.headers.get('x-navai-secret') || '', NAVAI_SECRET)) return

  if (await validToken(bearer)) {
    let sub = ''
    try { sub = String(b64urlJson(bearer.split('.')[1]).sub || '') } catch { /* validToken passed, so this cannot happen */ }
    if (!sub) return deny()
    const access = await loadAccess(bearer, sub)
    if (access === null) return json(503, { error: 'Auth check unavailable, try again' }, { 'Retry-After': '5' })
    if (!access.active) return denyRevoked()
    return permissionGate(request, pathname, sub, bearer, access)
  }
  return deny()
}
