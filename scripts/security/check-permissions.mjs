// Run: node scripts/security/check-permissions.mjs
// Security batch 2: page permissions in middleware.js. Mocked users (no real accounts, no network): for every route and
// protected file in api/_permissionMap.js, a person with a listed key, a person without, an admin, the NavAI secret.
process.env.SUPABASE_PROJECT_URL = 'https://test-project.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'anon'
process.env.CRON_SECRET = 'cron-secret-0123456789'
process.env.NAVAI_API_SECRET = 'navai-secret-0123456789-0123456789-ab'
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const pub = await crypto.subtle.exportKey('jwk', kp.publicKey)
const USERS = {} // id -> { active, admin, tabs | 'error' }
const denialPosts = []
let permFail = false
globalThis.fetch = async (u, o = {}) => {
  u = String(u)
  if (u.endsWith('/.well-known/jwks.json')) return new Response(JSON.stringify({ keys: [{ ...pub, kid: 'k', alg: 'ES256', use: 'sig' }] }))
  if (u.includes('/rest/v1/permission_denials')) { denialPosts.push(JSON.parse(o.body)); return new Response('', { status: 201 }) }
  const id = decodeURIComponent(u.split('user_id=eq.')[1] || '')
  const usr = USERS[id]
  if (u.includes('/rest/v1/user_profiles')) return new Response(JSON.stringify(usr ? [{ is_active: usr.active !== false, is_admin: !!usr.admin }] : []))
  if (u.includes('/rest/v1/user_permissions')) return permFail ? new Response('{}', { status: 500 }) : new Response(JSON.stringify((usr?.tabs || []).map(tab => ({ tab }))))
  throw new Error('unexpected fetch ' + u)
}
const logs = []
const realLog = console.log
const { default: mw } = await import('../../middleware.js')
const { API_RULES, FILE_RULES, requirementFor, isAllowed } = await import('../../api/_permissionMap.js')
const b = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
async function tokenFor(sub) {
  const data = `${b({ alg: 'ES256', kid: 'k', typ: 'JWT' })}.${b({ iss: 'https://test-project.supabase.co/auth/v1', aud: 'authenticated', role: 'authenticated', sub, exp: now + 3600 })}`
  return `${data}.${Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(data))).toString('base64url')}`
}
let fail = 0
const T = (name, ok) => { if (!ok) { fail++; realLog('FAIL', name) } }
let n = 0
const user = (tabs, extra = {}) => { const id = 'u' + ++n; USERS[id] = { tabs, ...extra }; return id }
async function run(id, path, method, mode, headers = {}, body) {
  process.env.PERMISSION_ENFORCE = mode
  logs.length = 0
  console.log = (...a) => logs.push(a.join(' '))
  try {
    const h = { ...headers }
    if (id) h.authorization = `Bearer ${await tokenFor(id)}`
    return await mw(new Request('https://x' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }))
  } finally { console.log = realLog }
}

// A key that satisfies a spec list, and a key that does not.
const keyFor = specs => { const s = specs.find(x => x !== 'admin' && x !== 'self') || 'any'; return s === 'any' ? 'sales:all' : s.endsWith('*') ? s.slice(0, -1) + ':x' : s }
const OTHER = ['ask', 'customer:support', 'documents:cn-manage', 'inventory:inward', 'logistics:cost:b2c', 'pnl:amazon', 'sales:amazon', 'ads:all', 'overview', 'logistics']
const unrelated = specs => OTHER.find(k => !isAllowed(specs, { admin: false, tabs: [k] }))

const admin = user([], { admin: true })
const targets = [
  ...API_RULES.map(([r, specs]) => ({ path: '/api/' + r, method: 'POST', specs })),
  ...FILE_RULES.map(([f, specs]) => ({ path: typeof f === 'string' ? f : f.source.includes('purchase-parser') ? '/purchase-parser-domestic.html' : f.source.includes('pnl-data') ? '/pnl-data-lastmonth.json' : f.source.includes('logistics-data') ? '/logistics-data-reverse-cod.json' : '/inv-data-15d.json', method: 'GET', specs })),
]
for (const t of targets) {
  const selfOnly = t.specs.includes('self'), adminOnly = t.specs.every(s => s === 'admin')
  const withKey = adminOnly ? null : user([keyFor(t.specs)])
  const without = selfOnly ? null : t.specs.includes('any') ? user([]) : user([unrelated(t.specs)])
  const label = `${t.method} ${t.path}`
  if (withKey) for (const mode of ['log', 'enforce']) T(`${label} with the key (${mode}) passes`, (await run(withKey, t.path, t.method, mode)) === undefined)
  if (without) {
    const e = await run(without, t.path, t.method, 'enforce')
    T(`${label} without a key (enforce) -> 403`, e?.status === 403 && (await e.json()).error === 'No access to this data')
    const l = await run(without, t.path, t.method, 'log')
    T(`${label} without a key (log) -> passes and logs`, l === undefined && logs.some(x => x.includes('would-deny') && x.includes(`uid=${without}`) && x.includes(`route=${t.path}`)))
  }
  for (const mode of ['log', 'enforce']) T(`${label} admin (${mode}) passes`, (await run(admin, t.path, t.method, mode)) === undefined)
  if (t.path.startsWith('/api/') ? ['bq','logistics','inventory','inventory-oos','sales-allocation','return-analysis','returns','customer','customer-support','cogs-monthly','cat-daily','courier-allocation','inward'].includes(t.path.slice(5)) : t.path.endsWith('.json'))
    T(`${label} NavAI secret passes`, (await run(null, t.path, t.method, 'enforce', { 'x-navai-secret': process.env.NAVAI_API_SECRET })) === undefined)
  T(`${label} cron secret passes`, (await run(null, t.path, t.method, 'enforce', { 'x-cron-secret': process.env.CRON_SECRET })) === undefined)
  if (!['/api/pulse', '/api/auth-admin'].includes(t.path)) T(`${label} no login -> 401`, (await run(null, t.path, t.method, 'enforce'))?.status === 401)
  else T(`${label} stays open to the login wall (checks the caller itself)`, (await run(null, t.path, t.method, 'enforce')) === undefined)
}

// unknown route / file: admin only
{ const u = user(['sales:all', 'pnl:all', 'overview']); T('unknown /api route -> 403 (enforce)', (await run(u, '/api/brand-new', 'POST', 'enforce'))?.status === 403)
  T('unknown file -> 403 (enforce)', (await run(u, '/new-data.json', 'GET', 'enforce'))?.status === 403)
  T('unknown route passes in log mode', (await run(u, '/api/brand-new', 'POST', 'log')) === undefined && logs.length === 1)
  T('page route (no extension) is not gated', (await run(u, '/overview', 'GET', 'enforce')) === undefined) }

// logistics-cost: reads for cost keys, claim writes / invalidate admin only, decided from the body
{ const cost = user(['logistics:cost:b2c'])
  const call = (id, body, mode = 'enforce') => run(id, '/api/logistics-cost', 'POST', mode, { 'content-type': 'application/json' }, body)
  T('logistics-cost read passes for a cost user', (await call(cost, { action: 'data', scope: 'b2c' })) === undefined)
  T('logistics-cost rawExport passes for a cost user', (await call(cost, { action: 'rawExport', scope: 'b2c' })) === undefined)
  for (const a of ['fileClaim', 'updateClaim', 'invalidate']) {
    T(`logistics-cost ${a}: cost user -> 403 (enforce)`, (await call(cost, { action: a }))?.status === 403)
    T(`logistics-cost ${a}: cost user passes in log mode and logs the action`, (await call(cost, { action: a }, 'log')) === undefined && logs.some(x => x.includes(`#${a}`)))
    T(`logistics-cost ${a}: admin passes`, (await call(admin, { action: a })) === undefined)
  }
  T('logistics-cost with an unreadable body is treated as a read', (await run(cost, '/api/logistics-cost', 'POST', 'enforce', {}, undefined)) === undefined) }

// shared data: any one relevant key is enough
for (const [path, method, keys] of [['/api/cogs-monthly', 'POST', ['pnl:amazon', 'inventory:cost', 'inventory']], ['/pnl-data.json', 'GET', ['overview', 'sales:ebo', 'pnl:all', 'ads:d2c']], ['/sales-alloc-data.json', 'GET', ['overview', 'inventory:sales']], ['/api/bq', 'POST', ['overview', 'sales:cred', 'ads:all', 'pnl:zepto']]])
  for (const k of keys) T(`${method} ${path} allowed by ${k}`, (await run(user([k]), path, method, 'enforce')) === undefined)
T('a person with only NavAI (ask) cannot use /api/bq in enforce mode', (await run(user(['ask']), '/api/bq', 'POST', 'enforce'))?.status === 403)
T('a person with no permissions at all cannot read the alerts file', (await run(user([]), '/alerts-data.json', 'GET', 'enforce'))?.status === 403)
T('a person with any permission can read the alerts file', (await run(user(['customer']), '/alerts-data.json', 'GET', 'enforce')) === undefined)

// revoked still 401, permissions unreadable: enforce 503 / log passes, denial log shape, default mode is log
{ const revoked = user(['sales:all'], { active: false }); T('revoked user -> 401 before any permission check', (await run(revoked, '/api/bq', 'POST', 'enforce'))?.status === 401)
  permFail = true; const u = user(['sales:all'])
  T('permissions unreadable: enforce -> 503', (await run(u, '/api/bq', 'POST', 'enforce'))?.status === 503)
  T('permissions unreadable: log mode passes', (await run(user(['sales:all']), '/api/bq', 'POST', 'log')) === undefined)
  permFail = false
  const d = user(['ask']); denialPosts.length = 0
  await run(d, '/api/inventory', 'POST', 'log'); await run(d, '/api/inventory', 'POST', 'log')
  T('denial recorded once per user+route, with id, route, keys, mode and nothing else', denialPosts.length === 1 && JSON.stringify(Object.keys(denialPosts[0]).sort()) === JSON.stringify(['mode', 'required', 'route', 'user_id']) && denialPosts[0].mode === 'log' && denialPosts[0].required === 'inventory*')
  T('log line has no email', !logs.concat(['x']).some(x => x.includes('@')))
  const d2 = user(['ask']); delete process.env.PERMISSION_ENFORCE; logs.length = 0
  console.log = () => {}
  const r = await mw(new Request('https://x/api/inventory', { method: 'POST', headers: { authorization: `Bearer ${await tokenFor(d2)}` } }))
  console.log = realLog
  T('PERMISSION_ENFORCE unset = log mode (never blocks)', r === undefined) }

// requirementFor on odd inputs
T('trailing slash is the same route', requirementFor('/api/bq/', 'POST').label === '/api/bq')

// /api/permission-denials handler: admin only
{ const h = (await import('../../api/permission-denials.js')).default
  const mkRes = () => { const r = { code: 200, body: null }; r.setHeader = () => {}; r.status = c => { r.code = c; return r }; r.json = x => { r.body = x; return r }; return r }
  const fake = { auth: { getUser: async t => ({ data: { user: t === 'tm' ? { id: 'm' } : t === 'ta' ? { id: 'a' } : null }, error: t === 'tm' || t === 'ta' ? null : {} }) },
    from: tbl => tbl === 'user_profiles' ? { select: () => ({ eq: (_c, id) => ({ maybeSingle: async () => ({ data: { is_admin: id === 'a', is_active: true }, error: null }) }) }) }
      : { select: () => ({ order: () => ({ limit: async () => ({ data: [{ at: 't', user_id: 'x', route: '/api/bq', required: 'sales*', mode: 'log' }, { at: 't', user_id: 'x', route: '/api/bq', required: 'sales*', mode: 'log' }], error: null }) }) }) } }
  const go = async (token, method = 'GET') => { const r = mkRes(); await h({ method, headers: token ? { authorization: `Bearer ${token}` } : {} }, r, { admin: fake }); return r }
  T('permission-denials: no token 401', (await go(null)).code === 401)
  T('permission-denials: member 403', (await go('tm')).code === 403)
  T('permission-denials: admin gets the list, grouped', (await go('ta')).code === 200 && (await go('ta')).body.grouped[0].count === 2)
  T('permission-denials: POST 405', (await go('ta', 'POST')).code === 405) }

realLog(fail ? `${fail} FAILED` : `ALL PASS (${targets.length} routes/files checked)`)
process.exit(fail ? 1 : 0)
