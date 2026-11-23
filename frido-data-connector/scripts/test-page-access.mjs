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
for (const [n, got, want] of rows) console.log(got === want ? 'OK  ' : 'FAIL', n, '->', got)
