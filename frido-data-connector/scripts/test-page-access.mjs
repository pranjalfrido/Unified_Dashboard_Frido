// Per-user page access checks for NavAI tools (lib/pageAccess.js). Run: node scripts/test-page-access.mjs
import { checkEndpoint, checkPnl, checkOos, checkRawSql, normaliseAccess } from '../lib/pageAccess.js'
const u = (isAdmin, tabs) => ({ access: normaliseAccess({ isAdmin, tabs }) })
const rows = [
  ['no access object (direct call) -> denied everywhere', checkEndpoint({ access: normaliseAccess(undefined) }, 'bq', {}).ok, false],
  ['admin reads inward', checkEndpoint(u(true, []), 'inward').ok, true],
  ['inward-only user reads inward', checkEndpoint(u(false, ['inventory:inward']), 'inward-data').ok, true],
  ['inward-only user reads logistics', checkEndpoint(u(false, ['inventory:inward']), 'logistics').ok, false],
  ['sales:shopify user reads bq', checkEndpoint(u(false, ['sales:shopify']), 'bq', {}).ok, true],
  ['sales:shopify user reads bq ads paths', checkEndpoint(u(false, ['sales:shopify']), 'bq', { paths: ['ads.kpis'] }).ok, false],
  ['ads:all user reads bq ads paths', checkEndpoint(u(false, ['ads:all']), 'bq', { paths: ['ads.kpis'] }).ok, true],
  ['unknown endpoint, non-admin', checkEndpoint(u(false, ['overview']), 'financial-mis').ok, false],
  ['pnl:amazon user asks D2C P&L', checkPnl(u(false, ['pnl:amazon']), 'shopify').ok, false],
  ['pnl:amazon user asks Amazon P&L', checkPnl(u(false, ['pnl:amazon']), 'amazon').ok, true],
  ['OOS without inventory tab', checkOos(u(false, ['inventory:sales'])).ok, false],
  ['raw SQL non-admin', checkRawSql(u(false, ['sales:all'])).ok, false],
  ['raw SQL admin', checkRawSql(u(true, [])).ok, true],
  ['MCP user (no access prop) raw SQL', checkRawSql({}).ok, true],
]
let failed = 0
const check = (n, got, want) => { const ok = got === want; if (!ok) failed++; console.log(ok ? 'OK  ' : 'FAIL', n, '->', got) }
for (const [n, got, want] of rows) check(n, got, want)

// (e) every endpoint NavAI can call: a user with no tabs is refused, an admin is allowed, and a user holding only the page's
// own tab is allowed while one holding only some other page's tab is refused.
const { ENDPOINTS } = await import('../lib/dashboardApi.js')
const ONLY = { 'bq': 'sales:shopify', 'pnl-data': 'pnl:all', 'pnl-data-lastmonth': 'pnl:all', 'ads-data': 'ads:all', 'return-analysis': 'sales:shopify', 'returns': 'sales:all', 'cat-daily': 'sales:amazon', 'cogs-monthly': 'pnl:amazon', 'logistics': 'logistics', 'logistics-data': 'logistics', 'logistics-data-forward': 'logistics', 'logistics-data-forward-cod': 'logistics', 'logistics-data-forward-prepaid': 'logistics', 'logistics-data-reverse': 'logistics', 'logistics-cost-data': 'logistics:cost:b2c', 'courier-allocation': 'logistics:cost:all', 'inventory': 'inventory', 'inventory-oos': 'inventory', 'inv-data-7d': 'inventory', 'inv-data-15d': 'inventory', 'inv-data-30d': 'inventory:detail', 'sales-allocation': 'inventory:sales', 'sales-alloc-data': 'inventory:sales', 'inward': 'inventory:inward', 'inward-data': 'inventory:inward', 'customer': 'customer', 'customer-support': 'customer:support' }
const unknown = Object.keys(ENDPOINTS).filter(e => !(e in ONLY))
check('every NavAI endpoint has a page rule in this test', unknown.length === 0, true)
for (const e of Object.keys(ENDPOINTS)) {
  const mine = ONLY[e], other = ['documents', 'overview'].includes(mine) ? 'ask' : (mine.startsWith('logistics') ? 'customer' : 'logistics')
  check(`${e}: user with no tabs refused`, checkEndpoint(u(false, []), e, {}).ok, false)
  check(`${e}: user with only the page's tab (${mine}) allowed`, checkEndpoint(u(false, [mine]), e, {}).ok, true)
  check(`${e}: user with only another page's tab (${other}) refused`, checkEndpoint(u(false, [other]), e, {}).ok, false)
  check(`${e}: admin allowed`, checkEndpoint(u(true, []), e, {}).ok, true)
}
check('financial-mis (removed) is not callable', 'financial-mis' in ENDPOINTS, false)
check('logistics-cost live endpoint (write actions in its body) is not callable', 'logistics-cost' in ENDPOINTS, false)

console.log(failed ? failed + ' check(s) FAILED' : 'All checks passed')
process.exit(failed ? 1 : 0)
