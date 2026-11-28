// Which page permission (src/permissionTree.js key) lets a signed-in person call which /api route or read which
// protected file in public/. Used by middleware.js; docs/PERMISSION_MAP.md is generated from this file
// (node scripts/security/gen-permission-map.mjs). Pure JS, no imports, runs in the middleware.
//
// Spec words:  'sales*'  = the key 'sales' or any 'sales:...' key        'overview' = exactly that key
//              'any'     = any permission at all (data every signed-in team member's screens load)
//              'self'    = the route checks the caller itself (feedback, presence, pulse): any active user passes here
//              'admin'   = admins only (also what an unknown route or file gets: new things start closed)
// A person passes if they hold ANY listed key. Admins (user_profiles.is_admin) pass everything.
// Shared data lists every page that uses it (e.g. cogs-monthly: P&L and Inventory).

const SALES = 'sales*', ADS = 'ads*', PNL = 'pnl*', INV = 'inventory*', COST = 'logistics:cost*', DOCS = 'documents*'

// [route, specs, note]
export const API_RULES = [
  ['bq',                [ 'overview', SALES, ADS, PNL ], 'Overview, Sales, Ads, P&L (main BigQuery fan-out, all phases)'],
  ['logistics',         [ 'overview', 'logistics' ], 'Overview logistics tile, Logistics > Performance'],
  ['returns',           [ 'logistics' ], 'Logistics > Performance returns block'],
  ['logistics-cost',    [ COST ], 'Cost Analytics (read + CSV export). fileClaim / updateClaim / invalidate: admin only (see ACTION_RULES)'],
  ['courier-allocation',[ COST ], 'Courier allocation, opened from Cost Analytics'],
  ['inventory',         [ INV ], 'Inventory Health (live fallback when inv-data.json is stale)'],
  ['inventory-oos',     [ INV ], 'Inventory > OOS loss'],
  ['inward',            [ INV ], 'Inventory > Inward (also checks inventory:inward itself)'],
  ['sales-allocation',  [ INV ], 'Inventory > Sales & Allocation'],
  ['cogs-monthly',      [ PNL, INV ], 'P&L (COGS) and Inventory cost / inward'],
  ['cogs-context',      [ DOCS ], 'Documents > COGS ledger'],
  ['packaging-products',[ DOCS ], 'Documents > Packaging BOM'],
  ['cat-daily',         [ SALES, PNL, ADS ], 'Category / SKU daily expand in Sales, P&L, Ads tables'],
  ['customer',          [ 'overview', 'customer' ], 'Overview customer tile, Customer Intelligence'],
  ['customer-support',  [ 'customer:support' ], 'Customer Support'],
  ['return-analysis',   [ 'overview', SALES ], 'Overview, Sales > return analysis'],
  ['email-controls',    [ 'admin' ], 'Scheduler pause / resume (also checks admin itself)'],
  ['permission-denials',[ 'admin' ], 'Would-be denial log (also checks admin itself)'],
  ['feedback',          [ 'self' ], 'Checks the caller itself'],
  ['presence',          [ 'self' ], 'Checks the caller itself (list is admin only)'],
  ['pulse',             [ 'self' ], 'NavAI: asked person\'s own permissions are applied inside (api/pulse.js)'],
  ['auth-admin',        [ 'self' ], 'Checks the caller itself (open to the login wall by design)'],
]

// POST bodies on these routes decide the requirement (middleware reads body.action).
export const ACTION_RULES = {
  'logistics-cost': { fileClaim: [ 'admin' ], updateClaim: [ 'admin' ], invalidate: [ 'admin' ] },
}

// [file matcher (exact path or /regex/), specs, note]
export const FILE_RULES = [
  [ /^\/pnl-data(-lastmonth)?\.json$/,        [ 'overview', SALES, PNL, ADS ], 'Static copy of the Sales/P&L query: Overview, Sales, P&L, Ads read it before calling /api/bq' ],
  [ '/ads-data.json',                          [ 'overview', ADS ], 'Ads cache' ],
  [ '/alerts-data.json',                       [ 'any' ], 'Alerts bell: every screen loads it, filtered per person in the browser' ],
  [ '/alerts-phase2.json',                     [ 'any' ], 'Alerts bell (phase 2), filtered per person in the browser' ],
  [ '/cogs-data.json',                         [ PNL, INV ], 'COGS cache for P&L and Inventory cost' ],
  [ '/snd-rates.json',                         [ PNL ], 'P&L shipping-and-delivery rates' ],
  [ '/flipkart-snd-ratecard.json',             [ PNL ], 'P&L Flipkart rate card' ],
  [ '/india-states.json',                      [ 'any' ], 'Map outlines (no business data)' ],
  [ '/india-districts-full.json',              [ 'any' ], 'Map outlines (no business data)' ],
  [ '/inv-data-7d.json',                       [ 'overview', INV ], 'Overview inventory tile, Inventory' ],
  [ /^\/inv-data(-\d+d)?\.json$/,              [ INV ], 'Inventory Health snapshots' ],
  [ '/inward-data.json',                       [ INV ], 'Inventory > Inward' ],
  [ '/logistics-cost-data.json',               [ COST ], 'Cost Analytics cache' ],
  [ '/logistics-data.json',                    [ 'overview', 'logistics' ], 'Logistics cache (Overview tile + Performance)' ],
  [ /^\/logistics-data-[a-z-]+\.json$/,        [ 'logistics' ], 'Logistics > Performance forward / reverse / COD / prepaid cuts' ],
  [ '/sales-alloc-data.json',                  [ 'overview', INV ], 'Overview tile, Inventory > Sales & Allocation' ],
  [ /^\/purchase-parser-(domestic|import|packaging)\.html$/, [ DOCS ], 'Documents > Purchase Ledger parser pages (loaded with the login token)' ],
  // Read only by api/bq.js on the server (from disk): no browser needs them, so they stay admin only.
  [ '/subcat-first-order.json',                [ 'admin' ], 'Server-side input of api/bq.js' ],
  [ '/vc-event-calendar.json',                 [ 'admin' ], 'Server-side input of api/bq.js' ],
  [ '/vc-margin-rates.json',                   [ 'admin' ], 'Server-side input of api/bq.js' ],
]

const norm = p => p.replace(/\/+$/, '') || '/'

// What this request needs: { specs, label } (label is what the denial log records).
export function requirementFor(pathname, method = 'GET', body = null) {
  const path = norm(pathname)
  if (path.startsWith('/api/')) {
    const name = path.slice(5)
    const rule = API_RULES.find(r => r[0] === name)
    if (!rule) return { specs: ['admin'], label: path }
    const act = method === 'POST' && body && typeof body.action === 'string' ? ACTION_RULES[name]?.[body.action] : null
    return act ? { specs: act, label: `${path}#${body.action}` } : { specs: rule[1], label: path }
  }
  const rule = FILE_RULES.find(r => (typeof r[0] === 'string' ? r[0] === path : r[0].test(path)))
  return { specs: rule ? rule[1] : ['admin'], label: path }
}

function holds(tabs, spec) {
  if (spec === 'any') return tabs.length > 0
  if (spec.endsWith('*')) { const p = spec.slice(0, -1); return tabs.some(t => t === p || t.startsWith(p + ':')) }
  return tabs.includes(spec)
}

// admin: user_profiles.is_admin. tabs: user_permissions.tab values.
export function isAllowed(specs, { admin, tabs }) {
  if (admin) return true
  if (specs.includes('self')) return true
  return specs.some(s => s !== 'admin' && holds(tabs || [], s))
}
