// Page permissions for NavAI answers. api/pulse.js sends the asking user's own access ({ isAdmin, tabs }, read from the
// database there, keys from src/permissionTree.js). Every data tool checks it here, so NavAI never answers from a page the
// person cannot open on the dashboard. Fail closed: a /chat call without `access` gets no pages.
// MCP callers (no `access` on the user) are authorised by their connector role alone, as before.

export function normaliseAccess(a) {
  return { isAdmin: a?.isAdmin === true, tabs: Array.isArray(a?.tabs) ? a.tabs.filter(t => typeof t === 'string').slice(0, 300) : [] };
}

// 'sales:*' = any tab of that group (sales:shopify, sales:amazon …); anything else is an exact tab key.
const ENDPOINT_TABS = {
  'bq': ['overview', 'sales:*', 'ads:*', 'pnl:*'],
  'pnl-data': ['pnl:*'], 'pnl-data-lastmonth': ['pnl:*'],
  'ads-data': ['ads:*'],
  'return-analysis': ['sales:*'], 'returns': ['sales:*'], 'cat-daily': ['sales:*'],
  'cogs-monthly': ['pnl:*', 'inventory:inward'],
  'logistics': ['logistics'], 'logistics-data': ['logistics'], 'logistics-data-forward': ['logistics'],
  'logistics-data-forward-cod': ['logistics'], 'logistics-data-forward-prepaid': ['logistics'], 'logistics-data-reverse': ['logistics'],
  'logistics-cost-data': ['logistics:cost:*'], 'courier-allocation': ['logistics:cost:*'],
  'inventory': ['inventory', 'inventory:detail'], 'inventory-oos': ['inventory'],
  'inv-data-7d': ['inventory', 'inventory:detail'], 'inv-data-15d': ['inventory', 'inventory:detail'], 'inv-data-30d': ['inventory', 'inventory:detail'],
  'sales-allocation': ['inventory:sales'], 'sales-alloc-data': ['inventory:sales'],
  'inward': ['inventory:inward'], 'inward-data': ['inventory:inward'],
  'customer': ['customer'], 'customer-support': ['customer:support'],
};

const has = (acc, key) => (key.endsWith(':*') ? acc.tabs.some(t => t === key.slice(0, -2) || t.startsWith(key.slice(0, -1))) : acc.tabs.includes(key));
const anyOf = (acc, keys) => acc.isAdmin || keys.some(k => has(acc, k));
const refuse = what => ({ ok: false, denied: true, text: `You don't have access to ${what} on the dashboard, so NavAI can't answer from it. Ask your admin for access.` });
const hasAccess = user => user && user.access !== undefined;

// dashboard_api: endpoint (+ the Ads / P&L part of bq, which is narrower than "any Sales tab").
export function checkEndpoint(user, endpoint, args = {}) {
  if (!hasAccess(user)) return { ok: true };
  const acc = user.access;
  let keys = ENDPOINT_TABS[endpoint];
  if (!keys) return acc.isAdmin ? { ok: true } : refuse(`the "${endpoint}" data`);
  if (endpoint === 'bq') {
    const paths = args.paths || [];
    if (args.params?.adsMonthly || paths.some(p => /^ads/.test(p))) keys = ['ads:*'];
    else if (paths.some(p => /^(pnl|flipkart|myntra|ebo|blinkit|zepto|instamart|cred|firstcry|offline|international)/.test(p))) keys = ['pnl:*', 'sales:*'];
  }
  return anyOf(acc, keys) ? { ok: true } : refuse(`the page for "${endpoint}"`);
}

// pnl tool: one channel's P&L tab (or Overall P&L).
export function checkPnl(user, tab) {
  if (!hasAccess(user)) return { ok: true };
  return anyOf(user.access, ['pnl:all', `pnl:${tab}`]) ? { ok: true } : refuse(`the ${tab} P&L tab`);
}

// OOS-loss tool: Inventory → Health & Overview.
export function checkOos(user) {
  if (!hasAccess(user)) return { ok: true };
  return anyOf(user.access, ['inventory']) ? { ok: true } : refuse('Inventory → Health & Overview');
}

// Free SQL (BigQuery / Supabase) can read any table, so it can't be tied to one page. It needs its own grant: the
// 'ask:sql' tab ("NavAI: custom analysis", given in Team members next to NavAI), or being an admin.
export function checkRawSql(user) {
  if (!hasAccess(user) || user.access.isAdmin || user.access.tabs.includes('ask:sql')) return { ok: true };
  return { ok: false, denied: true, text: "Custom analysis isn't enabled for your account; ask an admin. I can still answer from the dashboard pages you have access to." };
}
