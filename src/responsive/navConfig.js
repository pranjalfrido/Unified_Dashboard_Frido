// Phone navigation (NAV_MOBILE_PROMPT.md): every page the dock / launcher can show, its group,
// one-line description and the search keywords. Which of them a user sees is decided by the
// caller with the same access rules as the laptop sidebar; this file never grants anything.
//   group: 'main' (can sit in the dock) · 'analytics' · 'workspace' · 'tools'
export const NAV_PAGES = [
  { id: 'overview', label: 'Overview', group: 'main', desc: 'Business at a glance' },
  { id: 'sales', label: 'Sales', group: 'main', desc: 'Revenue by channel, product and region' },
  { id: 'pnl', label: 'P&L', group: 'main', desc: 'Margins by channel and product' },
  { id: 'inventory', label: 'Inventory', group: 'main', desc: 'Stock health, DOI, allocation' },
  { id: 'logistics', label: 'Logistics', group: 'main', desc: 'Delivery, RTO, courier cost' },
  { id: 'customer', label: 'Customer', group: 'main', desc: 'Acquisition, retention, support' },
  { id: 'ads', label: 'Ads', group: 'analytics', desc: 'Spend, ROAS and campaigns' },
  { id: 'documents', label: 'Documents', group: 'workspace', desc: 'Ledgers and uploads' },
  { id: 'ask', label: 'NavAI', group: 'workspace', desc: 'Ask questions about the data' },
  { id: 'feedback', label: 'Feedback', group: 'workspace', desc: 'Reports and ideas from your team' },
  { id: 'cogs', label: 'COGS Ledger', group: 'tools', desc: 'Cost of goods by SKU and month' },
  { id: 'courier-allocation', label: 'Courier Allocation', group: 'tools', desc: 'Which courier ships where' },
  { id: 'logistics-ledger', label: 'Logistics Bill Ledger', group: 'tools', desc: 'Freight and courier invoices' },
  { id: 'logistics-cn', label: 'Logistics Credit Notes', group: 'tools', desc: 'Credit notes raised and received' },
  { id: 'purchase-ledger', label: 'Purchase Ledger', group: 'tools', desc: 'Domestic, import and packaging purchases' },
  { id: 'packaging-bom', label: 'Packaging BOM', group: 'tools', desc: 'Packaging per product' },
]

// Search words → page (besides the page names themselves).
export const NAV_KEYWORDS = {
  rto: 'logistics', ndr: 'logistics', courier: 'logistics', delivery: 'logistics', shipment: 'logistics', tat: 'logistics',
  roas: 'ads', spend: 'ads', campaign: 'ads', meta: 'ads', google: 'ads',
  cac: 'customer', retention: 'customer', ticket: 'customer', support: 'customer', cohort: 'customer', ltv: 'customer',
  margin: 'pnl', cm1: 'pnl', cm2: 'pnl', profit: 'pnl', gm: 'pnl',
  stock: 'inventory', doi: 'inventory', allocation: 'inventory', warehouse: 'inventory',
  return: 'sales', revenue: 'sales', orders: 'sales', channel: 'sales',
  feedback: 'feedback', bug: 'feedback', report: 'feedback',
  cogs: 'cogs', cost: 'cogs', invoice: 'logistics-ledger', cn: 'logistics-cn', 'credit note': 'logistics-cn', freight: 'logistics-ledger', purchase: 'purchase-ledger', packaging: 'packaging-bom',
}

export const DEFAULT_DOCK = ['overview', 'sales', 'pnl', 'inventory', 'logistics', 'customer']
export const DOCK_MAX = 6
export const DOCK_MIN = 2

// Saved per user per device (localStorage; private windows can refuse it, so every access is guarded).
const dockKey = userId => `nav.dock.${userId || 'anon'}`
const recentKey = userId => `nav.recent.${userId || 'anon'}`
const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage unavailable */ } }
export const loadDock = userId => read(dockKey(userId))
export const saveDock = (userId, ids) => write(dockKey(userId), ids)
export const loadRecent = userId => read(recentKey(userId)) || []
export const pushRecent = (userId, id) => { const r = [id, ...loadRecent(userId).filter(x => x !== id)].slice(0, 4); write(recentKey(userId), r); return r }

// Pages matching a search: names first, then keywords ("rto" → Logistics).
export function searchPages(q, pages) {
  const s = q.trim().toLowerCase()
  if (!s) return []
  const byName = pages.filter(p => p.label.toLowerCase().includes(s) || p.desc.toLowerCase().includes(s))
  const byWord = Object.entries(NAV_KEYWORDS).filter(([w]) => w.startsWith(s) || s.startsWith(w)).map(([, id]) => pages.find(p => p.id === id)).filter(Boolean)
  return [...new Set([...byName, ...byWord])]
}
