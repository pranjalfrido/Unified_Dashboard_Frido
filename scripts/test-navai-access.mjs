// Proves NavAI's read-only secret (x-navai-secret) opens ONLY the read endpoints and the public data .json files, and is
// refused on everything that writes or administers, and on every method except POST (api) / GET (.json).
//   node scripts/test-navai-access.mjs        (generates throwaway secrets/keys in memory; prints none)
// Sections: (a) a normal login still opens every page and API, (b) no login + no secret = 401, (c) the secret opens the
// allowlist only, (d) the secret is refused on every write/admin route and method, (e) the asking user's page access is
// read from the database by api/pulse.js and forwarded (the connector's own tab checks are in
// frido-data-connector/scripts/test-page-access.mjs).
import { randomBytes, generateKeyPairSync, createSign } from 'crypto'
import { readdirSync } from 'fs'

const secret = randomBytes(24).toString('hex')
process.env.NAVAI_API_SECRET = secret
process.env.SUPABASE_PROJECT_URL = 'https://example.invalid'
process.env.SUPABASE_SECRET_KEY = randomBytes(16).toString('hex') // dummy, for the pulse.js section only
// A throwaway login: an ES256 key pair, its public half served as the project's JWKS (fetch is stubbed), and a token
// signed with the private half. This is the same check a real Supabase session goes through in middleware.js.
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'ES256', use: 'sig' }
const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')
const signJwt = (claims, key = privateKey) => {
  const head = b64({ alg: 'ES256', typ: 'JWT', kid: 'test-key' }), body = b64(claims)
  const sig = createSign('SHA256').update(`${head}.${body}`).sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  return `${head}.${body}.${sig}`
}
const claims = { iss: 'https://example.invalid/auth/v1', aud: 'authenticated', role: 'authenticated', sub: 'user-1', email: 'u@example.test', exp: Math.floor(Date.now() / 1000) + 600 }
const fetchLog = []
const realFetch = globalThis.fetch
globalThis.fetch = async (url, o) => {
  const u = String(url); fetchLog.push({ url: u, o })
  if (u.endsWith('/auth/v1/.well-known/jwks.json')) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })
  if (u.includes('/rest/v1/user_profiles') && !globalThis.__fakeFetch) return new Response(JSON.stringify([{ is_active: true }]), { status: 200 }) // the active-profile check in middleware.js
  return (globalThis.__fakeFetch ? globalThis.__fakeFetch(u, o) : realFetch(url, o))
}
const mw = (await import(new URL('../middleware.js', import.meta.url))).default

const call = async (method, path, headers = { 'x-navai-secret': secret }) => {
  const r = await mw(new Request('http://x' + path, { method, headers }))
  return r instanceof Response ? r.status : 'pass'
}
let failed = 0
const check = (name, got, want) => { const ok = got === want; if (!ok) failed++; console.log(ok ? 'OK  ' : 'FAIL', name, '->', got) }


// (a) a normal login still works on every page and API (every api route + the data files), (b) nothing = 401
const login = { authorization: `Bearer ${signJwt(claims)}` }
const allRoutes = readdirSync(new URL('../api', import.meta.url)).filter(f => f.endsWith('.js') && !f.startsWith('_')).map(f => f.slice(0, -3))
for (const e of allRoutes) check(`(a) POST /api/${e} with a valid login passes`, await call('POST', `/api/${e}`, login), 'pass')
for (const f of ['inv-data-7d', 'pnl-data', 'ads-data', 'inward-data', 'logistics-cost-data', 'cogs-data']) check(`(a) GET /${f}.json with a valid login passes`, await call('GET', `/${f}.json`, login), 'pass')
check('(a) an expired login is refused', await call('POST', '/api/bq', { authorization: `Bearer ${signJwt({ ...claims, exp: Math.floor(Date.now() / 1000) - 5 })}` }), 401)
check('(a) a login signed by another key is refused', await call('POST', '/api/bq', { authorization: `Bearer ${signJwt(claims, generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey)}` }), 401)
for (const e of ['bq', 'inward', 'inventory', 'logistics', 'customer', 'return-analysis', 'feedback']) check(`(b) POST /api/${e} with no login and no secret is 401`, await call('POST', `/api/${e}`, {}), 401)
for (const f of ['inv-data-7d', 'ads-data']) check(`(b) GET /${f}.json with no login and no secret is 401`, await call('GET', `/${f}.json`, {}), 401)

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

// (e) /api/pulse reads the asking user's tabs from the database (never from the request) and forwards them to the connector
{
  process.env.CONNECTOR_URL = 'https://connector.invalid'; process.env.CONNECTOR_API_KEY = randomBytes(16).toString('hex')
  let forwarded = null
  const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
  let profile = { is_active: true, is_admin: false }, tabs = [{ tab: 'ask' }, { tab: 'inventory:inward' }]
  globalThis.__fakeFetch = async (u, o) => {
    if (u.includes('/auth/v1/user')) return reply({ id: 'user-1', email: 'someone@example.test', aud: 'authenticated' })
    if (u.includes('/rest/v1/user_profiles')) return reply(profile)
    if (u.includes('/rest/v1/user_permissions')) return reply(tabs)
    if (u.startsWith('https://connector.invalid/chat')) { forwarded = JSON.parse(o.body); return reply({ reply: 'ok' }) }
    return reply({}, 404)
  }
  const pulse = (await import(new URL('../api/pulse.js', import.meta.url))).default
  const run = async body => { const r = { code: 200, setHeader() {}, status(c) { r.code = c; return r }, json() { return r }, end() { return r } }; forwarded = null; await pulse({ method: 'POST', headers: {}, body }, r); return r.code }
  const msg = [{ role: 'user', content: 'hi' }]
  const code = await run({ messages: msg, callerToken: 'x', access: { isAdmin: true, tabs: ['everything'] } }) // a forged access in the body
  check('(e) pulse forwards the database tabs, not the request body ones', code === 200 && JSON.stringify(forwarded?.access) === JSON.stringify({ isAdmin: false, tabs: ['ask', 'inventory:inward'] }), true)
  profile = { is_active: true, is_admin: true }
  await run({ messages: msg, callerToken: 'x' })
  check('(e) an admin is forwarded as admin', forwarded?.access?.isAdmin === true, true)
  globalThis.__fakeFetch = undefined
}

// Permission key for custom SQL: a grantable chip under NavAI in Team members
{
  const { PERMISSION_TREE, getAllLeafKeys } = await import(new URL('../src/permissionTree.js', import.meta.url))
  const ask = PERMISSION_TREE.find(n => n.key === 'ask')
  const sql = ask?.children?.find(c => c.key === 'ask:sql')
  const files = ask?.children?.find(c => c.key === 'ask:files')
  check("permission tree: 'ask:files' sits under NavAI with the agreed label", files?.label === 'NavAI: file upload' && getAllLeafKeys(ask).includes('ask:files'), true)
  check("permission tree: 'ask:sql' sits under NavAI with the agreed label", sql?.label === 'NavAI: custom analysis' && getAllLeafKeys(ask).includes('ask') && getAllLeafKeys(ask).includes('ask:sql'), true)
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed')
process.exit(failed ? 1 : 0)
