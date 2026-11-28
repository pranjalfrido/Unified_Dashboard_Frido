import { createClient } from '@supabase/supabase-js'

// Caller must be an active admin: a valid Supabase access token (Authorization: Bearer) whose user has an
// user_profiles row with is_admin and is_active. The same check auth-admin makes. `admin` can be passed in (tests).
export function getAdminClient() {
  const url = process.env.SUPABASE_PROJECT_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_PROJECT_URL or SUPABASE_SECRET_KEY env vars')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Returns { ok: true, user } or { ok: false, status, error }.
export async function requireActiveAdmin(req, admin = getAdminClient()) {
  const h = req.headers?.authorization || req.headers?.Authorization || ''
  const token = String(h).replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' }
  const { data, error } = await admin.auth.getUser(token)
  const user = data?.user
  if (error || !user) return { ok: false, status: 401, error: 'Invalid session' }
  const { data: profile, error: pErr } = await admin.from('user_profiles').select('is_admin, is_active').eq('user_id', user.id).maybeSingle()
  if (pErr) return { ok: false, status: 500, error: 'Could not check access' }
  if (!profile?.is_admin || !profile?.is_active) return { ok: false, status: 403, error: 'Admin access required' }
  return { ok: true, user }
}
