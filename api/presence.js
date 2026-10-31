/* global process */
import { createClient } from '@supabase/supabase-js'

// Live users (admins only). Two actions, both POST with the caller's Supabase access token:
//   beat  { page }  any signed-in, active user: upserts their single user_presence row
//                   (user id from the verified token, never from the body). Stores only the page
//                   key and timestamps, nothing that is on screen.
//   list            active admins only (same check as auth-admin.js), else 403: who was seen in the
//                   last 2 minutes with a readable page label, plus last_seen for every member.
// The table is RLS-locked with no policies (scripts/sql/user-presence.sql), so only this endpoint,
// using the service key, can read or write it.

const LIVE_MS = 2 * 60 * 1000

function getAdminClient() {
  const url = process.env.SUPABASE_PROJECT_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_PROJECT_URL or SUPABASE_SECRET_KEY env vars')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const SALES_CH = { all: 'Overall', shopify: 'D2C', ebo: 'EBO', amazon: 'Amazon', flipkart: 'Flipkart', blinkit: 'Blinkit', cred: 'CRED', firstcry: 'Firstcry', instamart: 'Instamart', zepto: 'Zepto', myntra: 'Myntra', international: 'International', offline: 'Offline Sales' }
const PAGES = { overview: 'Overview', customer: 'Customers', 'customer-support': 'Customer Support', profile: 'Profile', documents: 'Documents', ask: 'NavAI',
  cogs: 'COGS Ledger', 'logistics-ledger': 'Logistics Bill Ledger', 'purchase-ledger': 'Purchase Ledger', 'packaging-bom': 'Packaging BOM' }
const titleCase = s => String(s).replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

// "/pnl/shopify" → "P&L · D2C". Mirrors the app's URL scheme (App.jsx parseUrl); unknown keys fall
// back to a tidy version of the first segment rather than the raw path.
export function pageLabel(key) {
  const [a = 'overview', b, c] = String(key || '').replace(/^\/+/, '').split('/').filter(Boolean)
  if (a === 'sales') {
    const ch = SALES_CH[b || 'all'] || titleCase(b)
    return c === 'return_analysis' ? `Sales · ${ch} · Return analysis` : `Sales · ${ch}`
  }
  if (a === 'pnl') return `P&L · ${SALES_CH[b || 'all'] || titleCase(b)}`
  if (a === 'ads') return b ? `Ads · ${SALES_CH[b] || titleCase(b)}` : 'Ads'
  if (a === 'inventory') return b === 'sales_allocation' ? 'Inventory · Sales & Allocation' : 'Inventory · Health'
  if (a === 'logistics') return b === 'cost_analytics' || b === 'cost' ? 'Logistics · Cost' : b === 'courier_allocation' ? 'Courier Allocation' : 'Logistics · Performance'
  return PAGES[a] || titleCase(a)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { action, page } = req.body || {}
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  let admin
  try { admin = getAdminClient() } catch (e) { return res.status(500).json({ error: e.message }) }
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  const user = userData?.user
  if (userErr || !user) return res.status(401).json({ error: 'Invalid session' })
  const { data: me, error: meErr } = await admin.from('user_profiles').select('is_admin, is_active').eq('user_id', user.id).maybeSingle()
  if (meErr) return res.status(500).json({ error: meErr.message })
  if (!me?.is_active) return res.status(403).json({ error: 'Inactive account' })

  if (action === 'beat') {
    // Page key only: a short path like "/pnl/shopify". Anything else is dropped, never stored.
    const key = typeof page === 'string' && /^\/[a-z0-9/_-]{0,80}$/i.test(page) ? page : ''
    const now = new Date()
    const { data: prev } = await admin.from('user_presence').select('last_seen, session_started').eq('user_id', user.id).maybeSingle()
    // A gap of more than 2 minutes starts a new visit ("active since").
    const continuing = prev && now - new Date(prev.last_seen) <= LIVE_MS
    const { error } = await admin.from('user_presence').upsert({ user_id: user.id, page: key, last_seen: now.toISOString(), session_started: continuing ? prev.session_started : now.toISOString() }, { onConflict: 'user_id' })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).end()
  }

  if (action === 'list') {
    if (!me.is_admin) return res.status(403).json({ error: 'Admin access required' })
    const [{ data: rows, error }, { data: people, error: pErr }] = await Promise.all([
      admin.from('user_presence').select('user_id, page, last_seen, session_started'),
      admin.from('user_profiles').select('user_id, name, email'),
    ])
    if (error || pErr) return res.status(500).json({ error: (error || pErr).message })
    const who = Object.fromEntries((people || []).map(p => [p.user_id, p]))
    const now = Date.now()
    const live = (rows || [])
      .filter(r => now - new Date(r.last_seen).getTime() <= LIVE_MS && who[r.user_id])
      .map(r => ({ userId: r.user_id, name: who[r.user_id].name || who[r.user_id].email || 'Unknown', page: pageLabel(r.page), since: r.session_started, lastSeen: r.last_seen }))
      .sort((a, b) => new Date(a.since) - new Date(b.since))
    const lastSeen = Object.fromEntries((rows || []).map(r => [r.user_id, r.last_seen]))
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ live, lastSeen, now: new Date(now).toISOString(), me: user.id })
  }

  return res.status(400).json({ error: 'Unknown action' })
}
