import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.SUPABASE_PROJECT_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_PROJECT_URL or SUPABASE_SECRET_KEY env vars')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// NavAI ('ask') can only be granted or removed by these two (the same list as the app).
const PULSE_WHITELIST = ['pranjal.t@myfrido.com', 'suraj.s@myfrido.com']

// Every action returns { error } with a 4xx/5xx status when anything fails, so the Profile screens can
// say so instead of showing a success toast. Role and status changes guard against locking everyone out:
// you can't demote, revoke or delete yourself, and the last active admin can't be removed.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, callerToken, ...payload } = req.body || {}
  const admin = getAdminClient()

  // ── "Forgot password" on the login page (no session yet): name + status for one exact email.
  //    Replaces the browser reading user_profiles through the public "email lookup" policy.
  if (action === 'account_lookup') {
    const email = String(payload.email || '').trim().toLowerCase()
    if (!email) return res.status(400).json({ error: 'Email required' })
    const { data, error } = await admin.from('user_profiles').select('name, is_active').eq('email', email).maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data ? { found: true, name: data.name, is_active: data.is_active } : { found: false })
  }

  if (!callerToken) return res.status(401).json({ error: 'Unauthorized' })

  // Verify the caller is an active admin using the admin client (bypasses RLS)
  const { data: userData, error: userErr } = await admin.auth.getUser(callerToken)
  const user = userData?.user
  if (userErr || !user) return res.status(401).json({ error: 'Invalid session', detail: userErr?.message })

  const { data: callerProfile, error: profileErr } = await admin.from('user_profiles').select('is_admin, is_active').eq('user_id', user.id).single()
  if (profileErr || !callerProfile?.is_admin || !callerProfile?.is_active) return res.status(403).json({ error: 'Admin access required', detail: profileErr?.message })

  const canPulse = PULSE_WHITELIST.includes((user.email || '').toLowerCase())
  const fail = (status, error) => res.status(status).json({ error })

  async function target(userId) {
    if (!userId) return { err: 'user_id required' }
    const { data, error } = await admin.from('user_profiles').select('user_id, name, is_admin, is_active').eq('user_id', userId).maybeSingle()
    if (error) return { err: error.message, status: 500 }
    if (!data) return { err: 'No such team member', status: 404 }
    return { t: data }
  }
  // true when removing this user's admin role / access would leave no active admin
  async function isLastAdmin(t) {
    if (!t.is_admin || !t.is_active) return false
    const { count, error } = await admin.from('user_profiles').select('user_id', { count: 'exact', head: true }).eq('is_admin', true).eq('is_active', true).neq('user_id', t.user_id)
    if (error) throw new Error(error.message)
    return (count || 0) === 0
  }
  // Set a member's tabs to exactly `tabs`: add the new rows first, then remove the old ones, so a
  // failure half-way never leaves them with no access. Pulse ('ask') is kept as it was unless the
  // caller may grant it.
  async function setTabs(userId, tabs) {
    const { data: rows, error } = await admin.from('user_permissions').select('tab').eq('user_id', userId)
    if (error) throw new Error(error.message)
    const had = (rows || []).map(r => r.tab)
    let want = [...new Set((Array.isArray(tabs) ? tabs : []).filter(t => typeof t === 'string' && t))]
    // NavAI chat ('ask') and NavAI custom analysis ('ask:sql') are both granted only by the NavAI owners.
    if (!canPulse) want = [...want.filter(t => t !== 'ask' && t !== 'ask:sql'), ...had.filter(t => t === 'ask' || t === 'ask:sql')]
    const add = want.filter(t => !had.includes(t))
    const drop = had.filter(t => !want.includes(t))
    if (add.length) {
      const { error: insErr } = await admin.from('user_permissions').insert(add.map(tab => ({ user_id: userId, tab })))
      if (insErr) throw new Error(insErr.message)
    }
    if (drop.length) {
      const { error: delErr } = await admin.from('user_permissions').delete().eq('user_id', userId).in('tab', drop)
      if (delErr) throw new Error(delErr.message)
    }
    return want.sort()
  }

  try {
    // ── Create user ──────────────────────────────────────────────────────────
    if (action === 'create_user') {
      const { email, password, name, tabs, is_admin } = payload

      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      })
      if (error) return fail(400, error.message)

      const userId = data.user.id

      const { error: insErr } = await admin.from('user_profiles').insert({
        user_id: userId, name, email, is_admin: !!is_admin, is_active: true,
      })
      if (insErr) {
        await admin.auth.admin.deleteUser(userId) // don't leave a login without a profile
        return fail(500, 'Could not create the profile: ' + insErr.message)
      }

      // An admin sees every tab without rows; the only row an admin can need is Pulse ('ask').
      const want = is_admin ? (Array.isArray(tabs) && tabs.includes('ask') ? ['ask'] : []) : tabs
      const saved = want?.length > 0 ? await setTabs(userId, want) : []
      return res.status(200).json({ success: true, user_id: userId, tabs: saved })
    }

    // ── Reset user password (admin, no old password needed) ──────────────────
    if (action === 'reset_password') {
      const { user_id, new_password } = payload
      const { error } = await admin.auth.admin.updateUserById(user_id, { password: new_password })
      if (error) return fail(400, error.message)
      return res.status(200).json({ success: true })
    }

    // ── Set a member's tabs (replaces the browser's delete + insert) ─────────
    if (action === 'set_permissions') {
      const { t, err, status } = await target(payload.user_id)
      if (err) return fail(status || 400, err)
      if (t.is_admin) return fail(400, `${t.name} is an admin and sees every tab. Make them a member first.`)
      return res.status(200).json({ success: true, tabs: await setTabs(t.user_id, payload.tabs) })
    }

    // ── Give or remove NavAI (members and admins: being admin doesn't include Pulse) ──
    if (action === 'set_pulse') {
      if (!canPulse) return fail(403, 'Only Suraj or Pranjal can give or remove NavAI access.')
      const { t, err, status } = await target(payload.user_id)
      if (err) return fail(status || 400, err)
      const { data: rows, error: selErr } = await admin.from('user_permissions').select('tab').eq('user_id', t.user_id).eq('tab', 'ask')
      if (selErr) return fail(500, selErr.message)
      if (payload.on && !rows?.length) {
        const { error: insErr } = await admin.from('user_permissions').insert({ user_id: t.user_id, tab: 'ask' })
        if (insErr) return fail(500, insErr.message)
      }
      if (!payload.on && rows?.length) {
        const { error: delErr } = await admin.from('user_permissions').delete().eq('user_id', t.user_id).eq('tab', 'ask')
        if (delErr) return fail(500, delErr.message)
      }
      return res.status(200).json({ success: true, pulse: !!payload.on })
    }

    // ── Admin → member, keeping the tabs given ───────────────────────────────
    if (action === 'demote_user') {
      const { t, err, status } = await target(payload.user_id)
      if (err) return fail(status || 400, err)
      if (t.user_id === user.id) return fail(400, "You can't remove your own admin role.")
      if (!t.is_admin) return fail(400, `${t.name} is already a member.`)
      if (await isLastAdmin(t)) return fail(400, `${t.name} is the last active admin. Make someone else admin first.`)
      const { error } = await admin.from('user_profiles').update({ is_admin: false }).eq('user_id', t.user_id)
      if (error) return fail(500, error.message)
      return res.status(200).json({ success: true, tabs: await setTabs(t.user_id, payload.tabs) })
    }

    // ── Member → admin ───────────────────────────────────────────────────────
    if (action === 'promote_user') {
      const { t, err, status } = await target(payload.user_id)
      if (err) return fail(status || 400, err)
      if (t.is_admin) return fail(400, `${t.name} is already an admin.`)
      if (!t.is_active) return fail(400, `${t.name}'s access is revoked. Restore it first.`)
      const { error } = await admin.from('user_profiles').update({ is_admin: true }).eq('user_id', t.user_id)
      if (error) return fail(500, error.message)
      return res.status(200).json({ success: true })
    }

    // ── Revoke user (blocks login, signs out everywhere) ─────────────────────
    if (action === 'revoke_user') {
      const { t, err, status } = await target(payload.user_id)
      if (err) return fail(status || 400, err)
      if (t.user_id === user.id) return fail(400, "You can't revoke your own access.")
      if (await isLastAdmin(t)) return fail(400, `${t.name} is the last active admin. Make someone else admin first.`)
      const { error: banErr } = await admin.auth.admin.updateUserById(t.user_id, { ban_duration: '876600h' }) // 100 years
      if (banErr) return fail(500, banErr.message)
      const { error } = await admin.from('user_profiles').update({ is_active: false }).eq('user_id', t.user_id)
      if (error) return fail(500, error.message)
      await admin.auth.admin.signOut(t.user_id, 'global').catch(() => {}) // best effort; the ban already blocks them
      return res.status(200).json({ success: true })
    }

    // ── Restore user (lifts the block) ───────────────────────────────────────
    if (action === 'restore_user') {
      const { t, err, status } = await target(payload.user_id)
      if (err) return fail(status || 400, err)
      const { error: banErr } = await admin.auth.admin.updateUserById(t.user_id, { ban_duration: 'none' })
      if (banErr) return fail(500, banErr.message)
      const { error } = await admin.from('user_profiles').update({ is_active: true }).eq('user_id', t.user_id)
      if (error) return fail(500, error.message)
      return res.status(200).json({ success: true })
    }

    // ── Delete user ──────────────────────────────────────────────────────────
    if (action === 'delete_user') {
      const { t, err, status } = await target(payload.user_id)
      if (err) return fail(status || 400, err)
      if (t.user_id === user.id) return fail(400, "You can't delete your own account.")
      if (await isLastAdmin(t)) return fail(400, `${t.name} is the last active admin. Make someone else admin first.`)
      const { error } = await admin.auth.admin.deleteUser(t.user_id)
      if (error) return fail(500, error.message)
      // Cascade deletes profile + permissions via FK ON DELETE CASCADE
      return res.status(200).json({ success: true })
    }

    return fail(400, 'Unknown action')
  } catch (e) {
    return fail(500, e.message)
  }
}
