// Run: node scripts/security/check-middleware.mjs
// Unit test for middleware.js's token check with a locally generated ES256 key (no real tokens).
process.env.SUPABASE_PROJECT_URL = 'https://test-project.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'anon'
process.env.CRON_SECRET = 'cron-secret-0123456789'
process.env.NAVAI_API_SECRET = 'navai-secret-0123456789-0123456789-ab'
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const pub = await crypto.subtle.exportKey('jwk', kp.publicKey)
const kid = 'testkid1'
let jwksCalls = 0, userCalls = 0, profileCalls = 0
// user_profiles as the middleware reads it: u1 active, u2 revoked, u3 no row, u5 Supabase error, anything else active
const PROFILES = { u1: [{ is_active: true }], u2: [{ is_active: false }], u3: [] }
globalThis.fetch = async (u, o) => {
  if (String(u).endsWith('/.well-known/jwks.json')) { jwksCalls++; return new Response(JSON.stringify({ keys: [{ ...pub, kid, alg: 'ES256', use: 'sig' }] })) }
  if (String(u).endsWith('/auth/v1/user')) { userCalls++; return new Response('{}', { status: o.headers.Authorization.endsWith('.good') ? 200 : 401 }) }
  if (String(u).includes('/rest/v1/user_profiles')) {
    profileCalls++
    const id = decodeURIComponent(String(u).split('user_id=eq.')[1])
    if (id === 'u5') return new Response('{}', { status: 500 })
    return new Response(JSON.stringify(PROFILES[id] || [{ is_active: true }]), { status: 200 })
  }
  throw new Error('unexpected fetch ' + u)
}
const { validToken, needsLogin, default: mw, config } = await import('../../middleware.js')
const b = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const base = { iss: 'https://test-project.supabase.co/auth/v1', aud: 'authenticated', role: 'authenticated', sub: 'u1', exp: now + 600 }
async function sign(payload, header = { alg: 'ES256', kid, typ: 'JWT' }, key = kp.privateKey) {
  const data = `${b(header)}.${b(payload)}`
  const sig = Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(data))).toString('base64url')
  return `${data}.${sig}`
}
const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const good = await sign(base)
const cases = [
  ['valid ES256 token', good, true],
  ['expired', await sign({ ...base, exp: now - 5 }), false],
  ['wrong issuer', await sign({ ...base, iss: 'https://evil.supabase.co/auth/v1' }), false],
  ['anon role', await sign({ ...base, role: 'anon' }), false],
  ['wrong audience', await sign({ ...base, aud: 'other' }), false],
  ['signed by another key', await sign(base, undefined, other.privateKey), false],
  ['payload edited after signing', good.split('.')[0] + '.' + b({ ...base, sub: 'admin' }) + '.' + good.split('.')[2], false],
  ['unknown kid', await sign(base, { alg: 'ES256', kid: 'nope' }), false],
  ['alg none', `${b({ alg: 'none' })}.${b(base)}.`, false],
  ['HS256 confirmed by Supabase', `${b({ alg: 'HS256' })}.${b(base)}.good`, true],
  ['HS256 rejected by Supabase', `${b({ alg: 'HS256' })}.${b(base)}.bad`, false],
  ['empty', '', false],
]
let fail = 0
for (const [name, tok, want] of cases) {
  const got = await validToken(tok)
  if (got !== want) fail++
  console.log(got === want ? 'PASS' : 'FAIL', name, '->', got)
}
for (const [p, want] of [['/api/bq', true], ['/api/auth-admin', false], ['/api/pulse', false], ['/api/pulse/', false], ['/pnl-data.json', true], ['/x/y.json', true], ['/', false], ['/assets/index-abc.js', false], ['/manifest.webmanifest', false],
  // every other file in public/ needs a login, whatever its extension
  ['/logistics-cost-data.json.bak', true], ['/x.csv', true], ['/x.xlsx', true], ['/notes.txt', true], ['/backup.zip', true], ['/data.json', true], ['/purchase-parser-domestic.html', true],
  ['/some.js', true], ['/PNL-DATA.JSON', true], ['/a/b/c.bak', true],
  // known public assets stay open
  ['/frido-logo.png', false], ['/favicon.svg', false], ['/icon-192.png', false], ['/logo-amazon.png', false], ['/sw.js', false], ['/xlsx-worker.js', false], ['/offline.html', false], ['/robots.txt', false], ['/index.html', false], ['/assets/index-abc.js', false], ['/overview', false], ['/pnl', false], ['/login', false], ['/api/auth-admin/', false], ['/api/admin', true], ['/api/email-controls', true]]) {
  const got = needsLogin(p); if (got !== want) fail++
  console.log(got === want ? 'PASS' : 'FAIL', 'needsLogin', p, '->', got)
}
const r1 = await mw(new Request('https://x/api/bq', { method: 'POST', headers: { Authorization: `Bearer ${good}` } }))
const r2 = await mw(new Request('https://x/api/bq', { method: 'POST' }))
const r3 = await mw(new Request('https://x/api/bq', { method: 'OPTIONS' }))
for (const [n, ok] of [['middleware passes a valid token', r1 === undefined], ['middleware 401 without token', r2?.status === 401], ['OPTIONS preflight passes', r3 === undefined]]) { if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', n) }
console.log(`jwks fetched ${jwksCalls}x (cached), Supabase /user called ${userCalls}x`)

// ── active-profile check, NavAI, cron ──
const tokFor = async sub => sign({ ...base, sub })
const call = (path, headers = {}, method = 'POST') => mw(new Request('https://x' + path, { method, headers }))
const T = async (name, ok) => { if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', name) }
let realNow = Date.now.bind(Date), offset = 0
Date.now = () => realNow() + offset
const bearer = t => ({ Authorization: `Bearer ${t}` })
const t1 = await tokFor('u1'), t2 = await tokFor('u2'), t3 = await tokFor('u3'), t5 = await tokFor('u5')
await T('active user passes (api)', (await call('/api/bq', bearer(t1))) === undefined)
await T('active user passes (data file)', (await call('/pnl-data.json', bearer(t1), 'GET')) === undefined)
await T('no login on any data route -> 401', (await Promise.all(['/api/bq', '/api/inventory', '/api/email-controls', '/api/admin', '/pnl-data.json', '/logistics-cost-data.json.bak', '/x.csv'].map(p => call(p)))).every(r => r?.status === 401))
let r = await call('/api/bq', bearer(t2))
await T('revoked user -> 401 Access revoked', r?.status === 401 && (await r.json()).error === 'Access revoked')
r = await call('/pnl-data.json', bearer(t3), 'GET')
await T('token with no profile row -> 401 Access revoked', r?.status === 401 && (await r.json()).error === 'Access revoked')
r = await call('/api/bq', bearer(t5))
await T('Supabase error on the check -> 503, not cached', r?.status === 503)
const before = profileCalls
await call('/api/bq', bearer(t1)); await call('/api/bq', bearer(t1))
await T('active result cached (no extra Supabase read within 60 s)', profileCalls === before)
// revoke while cached: still allowed up to 60 s, refused after
PROFILES.u1 = [{ is_active: false }]
await T('revoked within the 60 s window is still served from cache (documented limit)', (await call('/api/bq', bearer(t1))) === undefined)
offset = 59_000
await T('still cached at 59 s', (await call('/api/bq', bearer(t1))) === undefined)
offset = 61_000
r = await call('/api/bq', bearer(t1))
await T('revoked user refused after 60 s', r?.status === 401 && (await r.json()).error === 'Access revoked')
offset = 0
// cron
await T('cron secret header still passes', (await call('/api/feedback', { 'x-cron-secret': process.env.CRON_SECRET })) === undefined)
await T('Vercel cron Authorization Bearer <CRON_SECRET> still passes', (await call('/api/feedback?action=digest', bearer(process.env.CRON_SECRET), 'GET')) === undefined)
await T('wrong cron secret -> 401', (await call('/api/bq', { 'x-cron-secret': 'cron-secret-0123456789x' }))?.status === 401)
// NavAI
const nv = { 'x-navai-secret': process.env.NAVAI_API_SECRET }
await T('NavAI secret: POST /api/bq passes', (await call('/api/bq', nv)) === undefined)
await T('NavAI secret: GET *.json passes', (await call('/pnl-data.json', nv, 'GET')) === undefined)
await T('NavAI secret: does NOT open /api/email-controls', (await call('/api/email-controls', nv))?.status === 401)
await T('NavAI secret: does NOT open a .bak/.csv file', (await call('/logistics-cost-data.json.bak', nv, 'GET'))?.status === 401 && (await call('/x.csv', nv, 'GET'))?.status === 401)
await T('NavAI secret: does NOT open /api/logistics-cost or /api/feedback', (await call('/api/logistics-cost', nv))?.status === 401 && (await call('/api/feedback', nv))?.status === 401)
await T('wrong NavAI secret -> 401', (await call('/api/bq', { 'x-navai-secret': 'navai-secret-0123456789-0123456789-ax' }))?.status === 401)
await T('matcher skips /assets/ only', config.matcher.length === 1 && /assets/.test(config.matcher[0]))
console.log(fail ? `${fail} FAILED` : 'ALL PASS')
process.exit(fail ? 1 : 0)
