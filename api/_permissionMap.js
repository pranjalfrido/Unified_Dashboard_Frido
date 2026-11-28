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
  ['bq',                [ 'overview', SALES, ADS, PNL ], 'Overview, Sales, Ads, P&L. Decided by the request body (phase), see PHASE_RULES'],
  ['logistics',         [ 'overview', 'logistics' ], 'Overview logistics tile, Logistics > Performance'],
  ['returns',           [ 'logistics' ], 'Logistics > Performance returns block'],
  ['logistics-cost',    [ COST ], 'Cost Analytics (read + CSV export). fileClaim / updateClaim / invalidate: admin only (see ACTION_RULES)'],
  ['courier-allocation',[ COST ], 'Courier allocation, opened from Cost Analytics'],
  ['inventory',         [ INV ], 'Inventory Health (live fallback when inv-data.json is stale)'],
  ['inventory-oos',     [ INV ], 'Inventory > OOS loss'],
  ['inward',            [ INV ], 'Inventory > Inward (also checks inventory:inward itself)'],
  ['sales-allocation',  [ INV ], 'Inventory > Sales & Allocation'],
  ['cogs-monthly',      [ PNL, ADS, 'inventory:cost', 'inventory:inward' ], 'P&L (COGS), Ads (breakeven ROAS needs real COGS), Inventory > Cost detail (inventory:cost), Inward value (inventory:inward)'],
  ['cogs-context',      [ DOCS ], 'Documents > COGS ledger'],
  ['packaging-products',[ DOCS ], 'Documents > Packaging BOM'],
  ['cat-daily',         [ SALES, PNL, ADS ], 'Category / SKU daily expand in Sales, P&L, Ads tables'],
  ['customer',          [ 'overview', 'customer' ], 'Overview customer tile, Customer Intelligence'],
  ['customer-support',  [ 'customer:support' ], 'Customer Support'],
  ['return-analysis',   [ 'overview', SALES ], 'Overview, Sales > return analysis'],
  ['email-controls',    [ 'admin' ], 'Scheduler pause / resume (also checks admin itself)'],
  ['permission-denials',[ 'admin' ], 'Would-be denial log (also checks admin itself)'],
  ['alerts',            [ 'any' ], 'Alerts bell: returns only the alerts for pages / channels the person can open (admins get all)'],
  ['feedback',          [ 'self' ], 'Checks the caller itself'],
  ['presence',          [ 'self' ], 'Checks the caller itself (list is admin only)'],
  ['pulse',             [ 'self' ], 'NavAI: asked person\'s own permissions are applied inside (api/pulse.js)'],
  ['auth-admin',        [ 'self' ], 'Checks the caller itself (open to the login wall by design)'],
]

// /api/bq returns different groups of data depending on body.phase; the full response (no phase) holds everything,
// including the whole P&L, so it needs a P&L key. adsMonthly is the Ads monthly view.
export const PHASE_RULES = {
  bq: {
    fast:         [ 'overview', SALES, ADS, PNL ],
    sales_detail: [ 'overview', SALES ],
    ads_detail:   [ ADS ],
    pnl_margin:   [ ADS, PNL ],
    pnl_detail:   [ PNL ],
  },
}
export const BQ_NO_PHASE = [ PNL ]
export const BQ_ADS_MONTHLY = [ ADS ]

// Routes whose POST body decides the requirement (middleware reads the body for these).
export const BODY_ROUTES = ['/api/logistics-cost', '/api/bq']

// POST bodies on these routes decide the requirement (middleware reads body.action).
export const ACTION_RULES = {
  'logistics-cost': { fileClaim: [ 'admin' ], updateClaim: [ 'admin' ], invalidate: [ 'admin' ] },
}

// [file matcher (exact path or /regex/), specs, note]
export const FILE_RULES = [
  [ /^\/pnl-data(-lastmonth)?\.json$/,        [ PNL ], 'Full P&L payload (COGS, margins, costs): P&L only. Others read sales-data*.json' ],
  [ /^\/sales-data(-lastmonth)?\.json$/,      [ 'overview', SALES, ADS, PNL ], 'Sales cut of the same query (no P&L detail): Overview, Sales, Ads read it before calling /api/bq' ],
  [ '/ads-data.json',                          [ 'overview', ADS ], 'Ads cache' ],
  // The bell reads /api/alerts, which filters these two per person on the server. The raw files hold every channel.
  [ '/alerts-data.json',                       [ 'admin' ], 'Raw alerts input, read by /api/alerts (server) only' ],
  [ '/alerts-phase2.json',                     [ 'admin' ], 'Raw alerts input, read by /api/alerts (server) only' ],
  [ '/cogs-data.json',                         [ PNL, ADS, 'inventory:cost', 'inventory:inward' ], 'COGS rate card (no page reads it directly any more; /api/cogs-monthly is the source)' ],
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
    if (name === 'bq' && method === 'POST') {
      if (body && body.adsMonthly) return { specs: BQ_ADS_MONTHLY, label: `${path}#adsMonthly` }
      const ph = body && typeof body.phase === 'string' ? body.phase : ''
      return PHASE_RULES.bq[ph] ? { specs: PHASE_RULES.bq[ph], label: `${path}#${ph}` } : { specs: BQ_NO_PHASE, label: `${path}#${ph || 'full'}` }
    }
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
