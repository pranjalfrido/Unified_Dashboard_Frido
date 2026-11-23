// Proves NavAI's read-only secret (x-navai-secret) opens ONLY the read endpoints and the public data .json files, and is
// refused on everything that writes or administers, and on every method except POST (api) / GET (.json).
//   node scripts/test-navai-access.mjs        (generates a throwaway secret in memory; prints no secret)
import { randomBytes } from 'crypto'
import { readdirSync } from 'fs'

const secret = randomBytes(24).toString('hex')
process.env.NAVAI_API_SECRET = secret
process.env.SUPABASE_PROJECT_URL = 'https://example.invalid'
const mw = (await import(new URL('../middleware.js', import.meta.url))).default

const call = async (method, path, headers = { 'x-navai-secret': secret }) => {
  const r = await mw(new Request('http://x' + path, { method, headers }))
  return r instanceof Response ? r.status : 'pass'
}
let failed = 0
const check = (name, got, want) => { const ok = got === want; if (!ok) failed++; console.log(ok ? 'OK  ' : 'FAIL', name, '->', got) }

// 1. allowed: the read endpoints (POST) and the public data files (GET)
const READ = ['bq', 'logistics', 'inventory', 'inventory-oos', 'sales-allocation', 'return-analysis', 'returns', 'customer', 'customer-support', 'cogs-monthly', 'cat-daily', 'courier-allocation', 'inward']
for (const e of READ) check(`POST /api/${e} with secret`, await call('POST', `/api/${e}`), 'pass')
for (const f of ['inv-data-7d', 'inward-data', 'pnl-data-lastmonth', 'ads-data', 'logistics-cost-data']) check(`GET /${f}.json with secret`, await call('GET', `/${f}.json`), 'pass')

// 2. refused: every route that writes or administers (all /api files that are not in the read list), plus unknown routes
const routes = readdirSync(new URL('../api', import.meta.url)).filter(f => f.endsWith('.js') && !f.startsWith('_')).map(f => f.slice(0, -3))
const OPEN_TO_ITS_OWN_CHECK = new Set(['auth-admin', 'pulse']) // middleware leaves these open; their handlers check the caller's token (tested below)
for (const e of routes.filter(r => !READ.includes(r) && !OPEN_TO_ITS_OWN_CHECK.has(r))) check(`POST /api/${e} with secret is refused`, await call('POST', `/api/${e}`), 401)
for (const e of ['feedback', 'presence', 'admin', 'logistics-cost', 'packaging-products', 'cogs-context', 'nonexistent']) check(`POST /api/${e} with secret is refused`, await call('POST', `/api/${e}`), 401)

// 3. refused: wrong method on an allowed endpoint (nothing but POST on api, GET on .json)
for (const m of ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD']) check(`${m} /api/bq with secret is refused`, await call(m, '/api/bq'), 401)
for (const m of ['PUT', 'PATCH', 'DELETE', 'POST']) check(`${m} /inv-data-7d.json with secret is refused`, await call(m, '/inv-data-7d.json'), 401)
for (const m of ['PUT', 'PATCH', 'DELETE']) check(`${m} /api/feedback with secret is refused`, await call(m, '/api/feedback'), 401)

// 4. refused: wrong, truncated, empty or missing secret; the cron header name is not accepted for it
check('wrong secret', await call('POST', '/api/bq', { 'x-navai-secret': secret.slice(0, -1) + (secret.endsWith('0') ? '1' : '0') }), 401)
check('truncated secret', await call('POST', '/api/bq', { 'x-navai-secret': secret.slice(0, 20) }), 401)
check('empty secret', await call('POST', '/api/bq', { 'x-navai-secret': '' }), 401)
check('no header', await call('POST', '/api/bq', {}), 401)
check('secret in Authorization bearer', await call('POST', '/api/bq', { authorization: `Bearer ${secret}` }), 401)
check('secret in x-cron-secret', await call('POST', '/api/bq', { 'x-cron-secret': secret }), 401)

// 5. the two routes middleware leaves open: the secret must not unlock them (their handlers need a real user token)
const res = () => { const r = { code: 200, setHeader() {}, status(c) { r.code = c; return r }, json() { return r }, end() { return r } }; return r }
for (const name of ['auth-admin', 'pulse']) {
  const h = (await import(new URL(`../api/${name}.js`, import.meta.url))).default
  const r = res()
  let threw = false
  try { await h({ method: 'POST', headers: { 'x-navai-secret': secret }, body: { action: 'listUsers', messages: [{ role: 'user', content: 'hi' }] }, query: {} }, r) } catch { threw = true }
  check(`/api/${name} handler with secret only (no user token) is refused`, threw || r.code >= 400, true)
}

// 6. /api/inward: the secret is a read-only member, never an admin (no Data quality export)
const { authorizeInward } = await import(new URL('../api/inward.js', import.meta.url))
const ok = await authorizeInward({ headers: { 'x-navai-secret': secret } })
check('inward: secret is accepted as a non-admin reader', ok.ok === true && ok.isAdmin === false, true)
const bad = await authorizeInward({ headers: { 'x-navai-secret': secret.slice(0, -1) + 'z' } }, { auth: { getUser: async () => ({ data: null, error: new Error('x') }) } })
check('inward: wrong secret is refused', bad.ok === true, false)

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed')
process.exit(failed ? 1 : 0)
