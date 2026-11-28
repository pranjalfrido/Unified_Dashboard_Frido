// Run: node scripts/security/check-batch4.mjs   (needs public/sales-data*.json: node scripts/derive-sales-cut.mjs)
// Security batch 4: COGS keys, the sales cut of the P&L file, server-filtered alerts. Mocked users, no network.
import { readFileSync, existsSync } from 'node:fs'
process.env.SUPABASE_PROJECT_URL = 'https://test-project.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'anon'
process.env.CRON_SECRET = 'cron-secret-0123456789'
process.env.NAVAI_API_SECRET = 'navai-secret-0123456789-0123456789-ab'
process.env.PERMISSION_ENFORCE = 'enforce'
let fail = 0
const T = (name, ok) => { if (!ok) { fail++; console.log('FAIL', name) } }
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))

// ── 1. per key: which files / APIs answer 200 vs 403 in enforce mode ──────────────────────────────────────
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const pub = await crypto.subtle.exportKey('jwk', kp.publicKey)
const USERS = {}
globalThis.fetch = async u => {
  u = String(u)
  if (u.endsWith('/.well-known/jwks.json')) return new Response(JSON.stringify({ keys: [{ ...pub, kid: 'k', alg: 'ES256', use: 'sig' }] }))
  const id = decodeURIComponent(u.split('user_id=eq.')[1] || ''), usr = USERS[id]
  if (u.includes('/rest/v1/user_profiles')) return new Response(JSON.stringify([{ is_active: true, is_admin: !!usr?.admin }]))
  if (u.includes('/rest/v1/user_permissions')) return new Response(JSON.stringify((usr?.tabs || []).map(tab => ({ tab }))))
  if (u.includes('/rest/v1/permission_denials')) return new Response('', { status: 201 })
  throw new Error('unexpected fetch ' + u)
}
const { default: mw } = await import('../../middleware.js')
const b = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
async function tok(sub) {
  const d = `${b({ alg: 'ES256', kid: 'k', typ: 'JWT' })}.${b({ iss: 'https://test-project.supabase.co/auth/v1', aud: 'authenticated', role: 'authenticated', sub, exp: now + 3600 })}`
  return `${d}.${Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(d))).toString('base64url')}`
}
const quiet = fn => { const l = console.log; console.log = () => {}; return fn().finally(() => { console.log = l }) }
const TARGETS = {
  'POST /api/cogs-monthly': ['/api/cogs-monthly', 'POST'], 'GET /cogs-data.json': ['/cogs-data.json', 'GET'],
  'GET /pnl-data.json': ['/pnl-data.json', 'GET'], 'GET /pnl-data-lastmonth.json': ['/pnl-data-lastmonth.json', 'GET'],
  'GET /sales-data.json': ['/sales-data.json', 'GET'], 'GET /sales-data-lastmonth.json': ['/sales-data-lastmonth.json', 'GET'],
  'GET /alerts-data.json (raw)': ['/alerts-data.json', 'GET'], 'GET /alerts-phase2.json (raw)': ['/alerts-phase2.json', 'GET'],
  'POST /api/alerts': ['/api/alerts', 'POST'],
  'bq fast': ['/api/bq', 'POST', { phase: 'fast' }], 'bq sales_detail': ['/api/bq', 'POST', { phase: 'sales_detail' }], 'bq ads_detail': ['/api/bq', 'POST', { phase: 'ads_detail' }],
  'bq pnl_margin': ['/api/bq', 'POST', { phase: 'pnl_margin' }], 'bq pnl_detail': ['/api/bq', 'POST', { phase: 'pnl_detail' }], 'bq full (no phase)': ['/api/bq', 'POST', {}], 'bq adsMonthly': ['/api/bq', 'POST', { adsMonthly: true }],
}
const SALES_FILES = ['GET /sales-data.json', 'GET /sales-data-lastmonth.json']
const EXPECT = { // key -> targets that answer 200
  overview: [...SALES_FILES, 'POST /api/alerts', 'bq fast', 'bq sales_detail'],
  'sales:all': [...SALES_FILES, 'POST /api/alerts', 'bq fast', 'bq sales_detail'],
  'ads:all': ['POST /api/cogs-monthly', 'GET /cogs-data.json', ...SALES_FILES, 'POST /api/alerts', 'bq fast', 'bq ads_detail', 'bq pnl_margin', 'bq adsMonthly'],
  'pnl:all': ['POST /api/cogs-monthly', 'GET /cogs-data.json', 'GET /pnl-data.json', 'GET /pnl-data-lastmonth.json', ...SALES_FILES, 'POST /api/alerts', 'bq fast', 'bq pnl_margin', 'bq pnl_detail', 'bq full (no phase)'],
  inventory: ['POST /api/alerts'],
  'inventory:detail': ['POST /api/alerts'],
  'inventory:sales': ['POST /api/alerts'],
  'inventory:cost': ['POST /api/cogs-monthly', 'GET /cogs-data.json', 'POST /api/alerts'],
  'inventory:inward': ['POST /api/cogs-monthly', 'GET /cogs-data.json', 'POST /api/alerts'],
  logistics: ['POST /api/alerts'], customer: ['POST /api/alerts'], documents: ['POST /api/alerts'], ask: ['POST /api/alerts'],
}
let n = 0
for (const [key, ok] of Object.entries(EXPECT)) {
  const id = 'u' + ++n; USERS[id] = { tabs: [key] }
  for (const [name, [path, method, body]] of Object.entries(TARGETS)) {
    const r = await quiet(async () => mw(new Request('https://x' + path, { method, headers: { authorization: `Bearer ${await tok(id)}` }, body: body ? JSON.stringify(body) : undefined })))
    const want = ok.includes(name)
    T(`key ${key}: ${name} -> ${want ? 200 : 403}`, want ? r === undefined : r?.status === 403)
  }
}
USERS.adm = { admin: true, tabs: [] }
for (const [name, [path, method, body]] of Object.entries(TARGETS))
  T(`admin: ${name} -> 200`, (await quiet(async () => mw(new Request('https://x' + path, { method, headers: { authorization: `Bearer ${await tok('adm')}` }, body: body ? JSON.stringify(body) : undefined })))) === undefined)
// a person with a sales key AND a P&L key can use both files; NavAI secret and cron still pass the files
USERS.both = { tabs: ['sales:all', 'pnl:all'] }
T('sales + pnl keys: both files 200', (await quiet(async () => mw(new Request('https://x/pnl-data.json', { headers: { authorization: `Bearer ${await tok('both')}` } })))) === undefined)
T('NavAI secret still reads pnl-data.json', (await mw(new Request('https://x/pnl-data.json', { headers: { 'x-navai-secret': process.env.NAVAI_API_SECRET } }))) === undefined)
T('cron secret still reads alerts-data.json', (await mw(new Request('https://x/alerts-data.json', { headers: { 'x-cron-secret': process.env.CRON_SECRET } }))) === undefined)

// ── 2. the sales cut carries the same numbers, and no P&L detail ──────────────────────────────────────────
if (!existsSync('public/sales-data.json')) { console.log('run node scripts/derive-sales-cut.mjs first'); process.exit(1) }
const { getPhaseDef } = await import('../../api/_bqPhases.js')
const { CHANNEL_OBJECTS_FOR_TEST } = {}
const { salesMetrics, trendRows } = await import('../../src/overview/overviewMetrics.js')
for (const [fullF, cutF] of [['public/pnl-data.json', 'public/sales-data.json'], ['public/pnl-data-lastmonth.json', 'public/sales-data-lastmonth.json']]) {
  const full = JSON.parse(readFileSync(fullF, 'utf8')), cut = JSON.parse(readFileSync(cutF, 'utf8'))
  let checked = 0, bad = []
  for (const ph of ['fast', 'sales_detail', 'ads_detail']) {
    for (const f of getPhaseDef(ph).fields) {
      const [a, c] = f.split('.')
      const fv = c === undefined ? full[a] : full[a]?.[c], cv = c === undefined ? cut[a] : cut[a]?.[c]
      if (fv === undefined) continue // computed (resolvedAgg) or not present in this payload
      checked++
      if (!same(fv, cv)) bad.push(f)
    }
  }
  T(`${cutF}: every field of fast / sales_detail / ads_detail equals the full file (${checked} fields)${bad.length ? ' differs: ' + bad.slice(0, 5) : ''}`, bad.length === 0)
  T(`${cutF}: Overview headline numbers (salesMetrics) identical`, same(salesMetrics(full), salesMetrics(cut)))
  T(`${cutF}: Overview trend rows identical`, same(trendRows(full.dailyArr, full.prevDailyArr), trendRows(cut.dailyArr, cut.prevDailyArr)))
  T(`${cutF}: mtdStart / mtdEnd kept, asOf present (the app matches the window on them)`, cut.mtdStart === full.mtdStart && cut.mtdEnd === full.mtdEnd && !!cut.asOf)
  // P&L-only groups are empty
  const pnlOnly = [...getPhaseDef('pnl_detail').fields].filter(f => !['fast', 'sales_detail', 'ads_detail'].some(p => getPhaseDef(p).fields.has(f)))
  let leaked = 0
  for (const f of pnlOnly) { const [a, c] = f.split('.'); const v = c === undefined ? cut[a] : cut[a]?.[c]; if (v !== undefined && v !== null && !(Array.isArray(v) ? v.length === 0 : typeof v === 'object' ? Object.keys(v).length === 0 : v === 0 || v === '' || v === false)) leaked++ }
  T(`${cutF}: P&L-only fields (cost rows, S&D, pnlAgg) are empty (${pnlOnly.length} checked)`, leaked === 0)
  T(`${cutF}: smaller than the full file`, readFileSync(cutF).length < readFileSync(fullF).length * 0.6)
}
// precompute writes all four files and the workflow commits them
const gen = readFileSync('scripts/generate-pnl-cache.mjs', 'utf8'), wf = readFileSync('.github/workflows/precompute-inventory.yml', 'utf8')
for (const f of ['public/pnl-data.json', 'public/pnl-data-lastmonth.json', 'public/sales-data.json', 'public/sales-data-lastmonth.json']) {
  T(`precompute script writes ${f}`, gen.includes(`'${f}'`))
  T(`workflow commits ${f}`, wf.includes(f))
}

// ── 3. alerts: server-filtered, bell output identical ─────────────────────────────────────────────────────
const rawData = JSON.parse(readFileSync('public/alerts-data.json', 'utf8')), rawP2 = JSON.parse(readFileSync('public/alerts-phase2.json', 'utf8'))
const alerts = (await import('../../api/alerts.js'))
const { computePhase2Alerts } = await import('../../src/alerts/phase2Rules.js')
const P = {
  a: { admin: true, tabs: [] }, m1: { tabs: ['sales:amazon', 'pnl:amazon', 'ads:amazon'] }, m2: { tabs: ['logistics', 'logistics:cost:b2c', 'inventory', 'inventory:sales', 'customer', 'customer:support'] },
  m3: { tabs: ['sales:shopify', 'pnl:shopify', 'sales:blinkit', 'sales:zepto'] }, m4: { tabs: ['documents'] },
}
const fakeAdmin = {
  auth: { getUser: async t => (P[t.replace('t-', '')] ? { data: { user: { id: t.replace('t-', '') } }, error: null } : { data: { user: null }, error: {} }) },
  from: tbl => ({ select: () => ({ eq: (_c, id) => tbl === 'user_profiles'
    ? { maybeSingle: async () => ({ data: id === 'gone' ? { is_active: false } : { is_admin: !!P[id]?.admin, is_active: true }, error: null }) }
    : Promise.resolve({ data: (P[id]?.tabs || []).map(tab => ({ tab })), error: null }) }) }),
}
const mkRes = () => { const r = { code: 200, body: null }; r.setHeader = () => {}; r.status = c => { r.code = c; return r }; r.json = x => { r.body = x; return r }; return r }
const readStatic = async n => (n === 'alerts-data.json' ? rawData : rawP2)
const ask = async (token, method = 'GET') => { const r = mkRes(); await alerts.default({ method, headers: token ? { authorization: `Bearer ${token}` } : {} }, r, { admin: fakeAdmin, readStatic }); return r }
T('alerts: no token 401', (await ask(null)).code === 401)
T('alerts: bad token 401', (await ask('nope')).code === 401)
T('alerts: PUT 405', (await ask('t-a', 'PUT')).code === 405)
{ const r = await ask('t-a')
  T('alerts: admin gets every input section', r.code === 200 && same(r.body.data, rawData))
  const want = computePhase2Alerts(rawP2, { can: () => true, isAdmin: true })
  T('alerts: admin phase 2 alerts equal the browser rule on the raw file', same(r.body.phase2.spikes, want.spikes) && same(r.body.phase2.targets, want.targets) && r.body.phase2.targetsComputedAt === rawP2.targetsComputedAt)
  T('alerts: the bell input from the API gives the same list (client computePhase2Alerts on the precomputed object)', same(computePhase2Alerts(r.body.phase2, { can: () => false, isAdmin: false }), want)) }
for (const id of ['m1', 'm2', 'm3', 'm4']) {
  const r = await ask('t-' + id), tabs = P[id].tabs
  const want = computePhase2Alerts(rawP2, { can: k => tabs.includes(k), isAdmin: false })
  T(`alerts ${id}: phase 2 alerts identical to what the bell showed from the raw file`, r.code === 200 && same(r.body.phase2.spikes, want.spikes) && same(r.body.phase2.targets, want.targets))
  const d = r.body.data
  T(`alerts ${id}: logistics block only with 'logistics'`, (!!d.logistics) === tabs.includes('logistics'))
  T(`alerts ${id}: returns block only with 'sales:shopify'`, (!!d.returns) === tabs.includes('sales:shopify'))
  T(`alerts ${id}: D2C P&L (cogs / cm1) only with 'pnl:shopify'`, (!!d.d2cPnl) === tabs.includes('pnl:shopify'))
  const seen = Object.keys(d.zeroOrders?.ordersByChannel || {})
  T(`alerts ${id}: order counts only for channels the person can open`, seen.every(c => tabs.includes(`sales:${c.toLowerCase()}`)) && (seen.length > 0) === Object.keys(rawData.zeroOrders.ordersByChannel).some(c => tabs.includes(`sales:${c.toLowerCase()}`)))
  const text = JSON.stringify(r.body)
  T(`alerts ${id}: nothing from sections they cannot see (no raw phase-2 numbers at all)`, !('windows' in r.body.phase2) && !('pnl' in r.body.phase2) && !('cost' in r.body.phase2))
  void text
}
{ const r = await ask('t-m4'); T('alerts m4 (documents only): 200, no alerts, no error', r.code === 200 && r.body.phase2.spikes.length === 0 && r.body.phase2.targets.length === 0 && Object.keys(r.body.data).join() === 'generatedAt') }
// zero-order alert wording: only the viewer's channels
{ const f = alerts.filterAlertsData({ generatedAt: 'x', zeroOrders: { date: 'd', ordersByChannel: { Shopify: { date: 'd', orders: 0 }, Amazon: { date: 'd', orders: 0 } }, zeroChannels: ['Shopify', 'Amazon'] } }, k => k === 'sales:amazon')
  T('zero-order block names only the channels the person may see', same(f.zeroOrders.zeroChannels, ['Amazon']) && !('Shopify' in f.zeroOrders.ordersByChannel)) }
// the client loaders read from the feed, not the raw files
const utilsSrc = readFileSync('src/utils.js', 'utf8'), p2Src = readFileSync('src/alerts/phase2Rules.js', 'utf8')
T('browser no longer fetches alerts-data.json / alerts-phase2.json', !/authFetch\('\/alerts-/.test(utilsSrc) && !/authFetch\('\/alerts-/.test(p2Src) && utilsSrc.includes('loadAlertsFeed') && p2Src.includes('loadAlertsFeed'))

console.log(fail ? `${fail} FAILED` : 'ALL PASS')
process.exit(fail ? 1 : 0)
