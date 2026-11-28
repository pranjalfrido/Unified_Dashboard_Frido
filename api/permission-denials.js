/* global process */
import { getAdminClient, requireActiveAdmin } from './_auth.js'

// Admin only. The last 200 requests the page-permission check would have refused (PERMISSION_ENFORCE=log) or did
// refuse (enforce): user id, route or file, required keys, mode, time. No data and no email; user ids can be matched
// to names in Profile > Team members. Written by middleware.js into permission_denials (docs/sql/permission-denials.sql).
export default async function handler(req, res, deps = {}) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const admin = deps.admin || getAdminClient()
  const who = await requireActiveAdmin(req, admin)
  if (!who.ok) return res.status(who.status).json({ error: who.error })
  const { data, error } = await admin.from('permission_denials').select('at, user_id, route, required, mode').order('at', { ascending: false }).limit(200)
  if (error) return res.status(500).json({ error: error.message.includes('permission_denials') ? 'Table missing: run docs/sql/permission-denials.sql' : error.message })
  // Same route + user collapse into one line with a count, newest first.
  const lines = {}
  for (const r of data) { const k = `${r.user_id}|${r.route}|${r.mode}`; (lines[k] ||= { ...r, count: 0 }).count++ }
  return res.status(200).json({ mode: process.env.PERMISSION_ENFORCE === 'enforce' ? 'enforce' : 'log', total: data.length, denials: data, grouped: Object.values(lines) })
}
