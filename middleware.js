/* global process */
// Login wall for the dashboard's data (security fix, see SECURITY_FIX.md).
//
// Vercel runs this before the CDN and the functions, for the paths in config.matcher:
//  - every /api route, except auth-admin and pulse: those check the caller's token themselves, and
//    auth-admin's "forgot password" lookup has to work before anyone is logged in
//  - every .json file served from public/ (pnl-data*.json, ads-data.json, inv-data*.json, cogs-data.json, …)
// A request passes with a valid Supabase access token (Authorization: Bearer <token>, which the
// frontend's authFetch() sends), or, for a scheduled caller, the CRON_SECRET (x-cron-secret header,
// or Vercel cron's own Authorization: Bearer <CRON_SECRET>). Anything else gets 401 and no data.
//
// The token is checked here, with no call to Supabase: it must be an ES256 JWT signed by one of the
// project's published keys (/auth/v1/.well-known/jwks.json), not expired, issued by this project and
// for the 'authenticated' role. A token signed with the legacy HS256 secret (only possible while
// that key is still in use) is checked by asking Supabase (/auth/v1/user) instead, cached until expiry.

export const config = { matcher: ['/api/:path*', '/(.*\\.json)'] }

const OPEN_API = new Set(['/api/auth-admin', '/api/pulse'])

// NavAI's read-only service secret (header x-navai-secret). It is NOT the cron secret and it opens only the
// data-reading endpoints below plus the public/*.json files, never feedback, presence, admin or auth-admin.
// Who may see which page is enforced by the connector from the asking user's own permissions (api/pulse.js).
const NAVAI_READ_API = new Set([
  'bq', 'logistics', 'logistics-cost', 'inventory', 'inventory-oos', 'sales-allocation', 'return-analysis', 'returns',
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

export function needsLogin(pathname) {
  if (pathname.startsWith('/api/')) return !OPEN_API.has(pathname.replace(/\/+$/, ''))
  return pathname.endsWith('.json')
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

export default async function middleware(request) {
  const { pathname } = new URL(request.url)
  // CORS preflights carry no credentials and the handlers answer them without data.
  if (request.method === 'OPTIONS' || !needsLogin(pathname)) return

  const auth = request.headers.get('authorization') || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (CRON_SECRET.length >= 16 && (sameSecret(request.headers.get('x-cron-secret') || '', CRON_SECRET) || sameSecret(bearer, CRON_SECRET))) return

  if (NAVAI_SECRET.length >= 32 && navaiMayRead(pathname, request.method) && sameSecret(request.headers.get('x-navai-secret') || '', NAVAI_SECRET)) return

  if (await validToken(bearer)) return
  return deny()
}
