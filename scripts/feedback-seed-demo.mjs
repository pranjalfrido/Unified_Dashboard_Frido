// Fills the LOCAL feedback store (API on :3017) with a few demo items from the made-up test people.
const API = process.env.API || 'http://localhost:3017/api/feedback'
const call = (action, as, extra = {}) => fetch(API, { method: 'POST', body: JSON.stringify({ action, callerToken: `local:${as}`, ...extra }) }).then(r => r.json())
const dev = (kind, viewport, browser) => ({ kind, viewport, browser })
const mk = (as, type, message, context, urgent = false) => call('submit', as, { type, message, urgent, context: { appVersion: 'demo', time: new Date().toISOString(), ...context } })

await mk('asha', 'wrong_number', 'D2C net revenue on Overview does not match Shopify for 28 Oct.', { page: 'Overview', path: '/overview', start: '2026-10-01', end: '2026-10-30', dateRange: '2026-10-01 to 2026-10-30', device: dev('Laptop', '1366×800', 'Chrome') })
await mk('rohan', 'bug', 'The Sales filter sheet does not close after Apply on my phone.', { page: 'Sales', channel: 'D2C', path: '/sales/shopify/overall', device: dev('Phone', '375×812', 'Safari') }, true)
await mk('rohan', 'suggestion', 'Could we get a weekly e-mail of the Overview numbers?', { page: 'Overview', path: '/overview', device: dev('Laptop', '1440×900', 'Edge') })
const closed = await mk('asha', 'bug', 'Inventory export button was greyed out.', { page: 'Inventory', path: '/inventory/inventory_health', device: dev('Laptop', '1366×800', 'Chrome') })
await call('update', 'admin', { id: closed.id, status: 'done', admin_reply: 'Fixed: the export works again for every inventory view.' })
console.log('demo items added')
