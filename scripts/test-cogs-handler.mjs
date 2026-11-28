// Run: node scripts/test-cogs-handler.mjs   (no database: the query is injected)
// api/cogs-monthly.js reliability: one retry, 10-minute cache, stale answer when the database is down, one JSON log line
// per failure / empty answer (status, ms, rows; no SKUs, no user data).
const handlerMod = await import('../api/cogs-monthly.js')
const handler = handlerMod.default
let fail = 0
const T = (name, ok) => { if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', name) }
const logs = { warn: [], error: [] }
console.warn = m => logs.warn.push(m); console.error = m => logs.error.push(m)
const mkRes = () => { const r = { code: 200, body: null, headers: {} }; r.setHeader = (k, v) => { r.headers[k] = v }; r.status = c => { r.code = c; return r }; r.json = b => { r.body = b; return r }; r.end = () => r; return r }
const call = async (run, body = { startMonth: '2026-11-01', endMonth: '2026-11-01' }) => { const res = mkRes(); await handler({ method: 'POST', body }, res, { run }); return res }
const row = { sku: 'A', month: '2026-11-01', cogs: '100.5', category: 'c', sub_category: 's', cogs_source: 'actual', carried_from_month: null }
const reset = () => { handlerMod._resetCogsCache(); logs.warn.length = 0; logs.error.length = 0 }

reset(); let n = 0
let r = await call(async () => { n++; return [row] })
T('normal: 200 with shaped rows, one query', r.code === 200 && r.body.rows[0].cogs === 100.5 && r.body.rows[0].subCategory === 's' && n === 1 && logs.warn.length + logs.error.length === 0)
r = await call(async () => { n++; return [row] })
T('second identical call served from the 10-minute cache (no query)', n === 1 && r.body.rows.length === 1)

reset(); n = 0
r = await call(async () => { n++; if (n === 1) throw new Error('Connection terminated unexpectedly'); return [row] })
T('first query fails, retry on a fresh pool succeeds: 200', r.code === 200 && n === 2)
T('the retry is logged (status, ms, rows, retried)', logs.warn.some(l => { const j = JSON.parse(l); return j.route === 'cogs-monthly' && j.retried === true && j.rows === 1 && typeof j.ms === 'number' }))

reset()
r = await call(async () => { throw Object.assign(new Error('too many clients'), { code: '53300' }) }, { startMonth: '2026-10-01', endMonth: '2026-10-01', skus: ['SECRET-SKU-1'] })
T('both tries fail, nothing cached: 500', r.code === 500)
{ const j = JSON.parse(logs.error[0] || '{}')
  T('failure logged with route, status, ms, rows and error code', j.route === 'cogs-monthly' && j.status === 500 && typeof j.ms === 'number' && j.rows === 0 && j.error === '53300')
  T('log line carries no SKU list', !logs.error.concat(logs.warn).join('').includes('SECRET-SKU-1')) }

reset()
r = await call(async () => [], { startMonth: '2026-09-01', endMonth: '2026-09-01' })
T('empty answer: 200 with no rows, logged as a warning, not cached', r.code === 200 && r.body.rows.length === 0 && JSON.parse(logs.warn[0]).rows === 0)
n = 0
await call(async () => { n++; return [row] }, { startMonth: '2026-09-01', endMonth: '2026-09-01' })
T('an empty answer is not cached (the next call queries again)', n === 1)

// stale: cached answer older than the TTL, database down
reset()
const realNow = Date.now.bind(Date); let off = 0; Date.now = () => realNow() + off
await call(async () => [row], { startMonth: '2026-08-01', endMonth: '2026-08-01' })
off = 11 * 60 * 1000
r = await call(async () => { throw new Error('connect ETIMEDOUT') }, { startMonth: '2026-08-01', endMonth: '2026-08-01' })
T('database down after the cache expired: the last good answer is served (200, X-Cogs-Stale)', r.code === 200 && r.body.rows.length === 1 && r.headers['X-Cogs-Stale'] === '1')
T('the stale answer is logged as an error', logs.error.some(l => JSON.parse(l).stale === true))
Date.now = realNow

reset(); r = await call(async () => [row], { endMonth: 'x' })
T('missing startMonth: 400 and logged', r.code === 400 && logs.warn.length === 1)
{ const res = mkRes(); await handler({ method: 'GET' }, res); T('GET: 405', res.code === 405) }
console.log(fail ? `${fail} FAILED` : 'ALL PASS')
process.exit(fail ? 1 : 0)
