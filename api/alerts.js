/* global process */
import { getAdminClient } from './_auth.js'
import { computePhase2Alerts } from '../src/alerts/phase2Rules.js'

// The alerts bell's two precomputed inputs (public/alerts-data.json, public/alerts-phase2.json) hold every channel's
// numbers. They are no longer served to the browser (admin only in api/_permissionMap.js); this route reads them on the
// server and returns only what the signed-in person may see, the same rule the bell applied in the browser:
//   data    the four fixed-window alerts' numbers: logistics (needs 'logistics'), returns / D2C red lines ('sales:shopify'),
//           zero-order channels (per channel 'sales:<channel>'), D2C P&L ('pnl:shopify'). A section the person cannot see is left out.
//   phase2  the Phase 2 alerts already built for this person (computePhase2Alerts with their permissions), not raw numbers.
// Admins get everything. Same keys, same alert text as before; the only difference is that "0 orders on ..." names just
// the channels the person can open.

const FILES = { data: 'alerts-data.json', phase2: 'alerts-phase2.json' }

// Read from the site's own CDN with the cron secret (middleware lets that through). NOT from disk: a file read from
// public/ makes Vercel's tracer bundle the whole public/ folder (265 MB) into this function, over the 250 MB limit.
async function readStatic(name, req) {
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host
  const secret = process.env.CRON_SECRET
  if (!host || !secret) throw new Error('alerts input not available')
  const proto = req.headers?.['x-forwarded-proto'] || 'https'
  const r = await fetch(`${proto}://${host}/${name}`, { headers: { 'x-cron-secret': secret } })
  if (!r.ok) throw new Error(`${name} ${r.status}`)
  return r.json()
}

export function filterAlertsData(d, can) {
  if (!d) return null
  const out = { generatedAt: d.generatedAt }
  if (d.logistics && can('logistics')) out.logistics = d.logistics
  if (d.returns && can('sales:shopify')) out.returns = d.returns
  if (d.d2cPnl && can('pnl:shopify')) out.d2cPnl = d.d2cPnl
  if (d.zeroOrders) {
    const seen = Object.keys(d.zeroOrders.ordersByChannel || {}).filter(c => can(`sales:${c.toLowerCase()}`))
    if (seen.length) out.zeroOrders = {
      ...d.zeroOrders,
      ordersByChannel: Object.fromEntries(seen.map(c => [c, d.zeroOrders.ordersByChannel[c]])),
      zeroChannels: (d.zeroOrders.zeroChannels || []).filter(c => seen.includes(c)),
    }
  }
  return out
}

export default async function handler(req, res, deps = {}) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const admin = deps.admin || getAdminClient()
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const { data: u, error: ue } = await admin.auth.getUser(token)
  if (ue || !u?.user) return res.status(401).json({ error: 'Invalid session' })
  const { data: prof, error: pe } = await admin.from('user_profiles').select('is_admin, is_active').eq('user_id', u.user.id).maybeSingle()
  if (pe) return res.status(500).json({ error: 'Could not check access' })
  if (!prof?.is_active) return res.status(403).json({ error: 'Access revoked' })
  const isAdmin = prof.is_admin === true
  let tabs = []
  if (!isAdmin) {
    const { data: rows, error: te } = await admin.from('user_permissions').select('tab').eq('user_id', u.user.id)
    if (te) return res.status(500).json({ error: 'Could not check access' })
    tabs = (rows || []).map(r => r.tab)
  }
  const can = k => isAdmin || tabs.includes(k)
  try {
    const read = deps.readStatic || (n => readStatic(n, req))
    const [d, p2] = await Promise.all([read(FILES.data), read(FILES.phase2)])
    const { spikes, targets } = computePhase2Alerts(p2, { can, isAdmin })
    return res.status(200).json({
      data: filterAlertsData(d, can),
      phase2: p2 ? { precomputed: true, spikes, targets, targetsComputedAt: p2.targetsComputedAt || null, generatedAt: p2.generatedAt || null } : null,
    })
  } catch {
    return res.status(503).json({ error: 'Alerts are not available right now' })
  }
}
