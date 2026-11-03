// Run: node scripts/security/check-middleware.mjs
// Unit test for middleware.js's token check with a locally generated ES256 key (no real tokens).
process.env.SUPABASE_PROJECT_URL = 'https://test-project.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'anon'
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const pub = await crypto.subtle.exportKey('jwk', kp.publicKey)
const kid = 'testkid1'
let jwksCalls = 0, userCalls = 0
globalThis.fetch = async (u, o) => {
  if (String(u).endsWith('/.well-known/jwks.json')) { jwksCalls++; return new Response(JSON.stringify({ keys: [{ ...pub, kid, alg: 'ES256', use: 'sig' }] })) }
  if (String(u).endsWith('/auth/v1/user')) { userCalls++; return new Response('{}', { status: o.headers.Authorization.endsWith('.good') ? 200 : 401 }) }
  throw new Error('unexpected fetch ' + u)
}
const { validToken, needsLogin, default: mw } = await import('../../middleware.js')
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
for (const [p, want] of [['/api/bq', true], ['/api/auth-admin', false], ['/api/pulse', false], ['/api/pulse/', false], ['/pnl-data.json', true], ['/x/y.json', true], ['/', false], ['/assets/index-abc.js', false], ['/manifest.webmanifest', false]]) {
  const got = needsLogin(p); if (got !== want) fail++
  console.log(got === want ? 'PASS' : 'FAIL', 'needsLogin', p, '->', got)
}
const r1 = await mw(new Request('https://x/api/bq', { method: 'POST', headers: { Authorization: `Bearer ${good}` } }))
const r2 = await mw(new Request('https://x/api/bq', { method: 'POST' }))
const r3 = await mw(new Request('https://x/api/bq', { method: 'OPTIONS' }))
for (const [n, ok] of [['middleware passes a valid token', r1 === undefined], ['middleware 401 without token', r2?.status === 401], ['OPTIONS preflight passes', r3 === undefined]]) { if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', n) }
console.log(`jwks fetched ${jwksCalls}x (cached), Supabase /user called ${userCalls}x`)
console.log(fail ? `${fail} FAILED` : 'ALL PASS')
process.exit(fail ? 1 : 0)
