import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.SUPABASE_PROJECT_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_PROJECT_URL or SUPABASE_SECRET_KEY env vars')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, callerToken, ...payload } = req.body
  if (!callerToken) return res.status(401).json({ error: 'Unauthorized' })

  // Verify the caller is an active admin using the admin client (bypasses RLS)
  const admin = getAdminClient()
  const { data: { user }, error: userErr } = await admin.auth.getUser(callerToken)
  if (userErr || !user) return res.status(401).json({ error: 'Invalid session' })

  const { data: callerProfile } = await admin.from('user_profiles').select('is_admin, is_active').eq('user_id', user.id).single()
  if (!callerProfile?.is_admin || !callerProfile?.is_active) return res.status(403).json({ error: 'Admin access required' })

  const anonClient = createClient(process.env.SUPABASE_PROJECT_URL, process.env.SUPABASE_ANON_KEY)

  try {
    // ── Create user ──────────────────────────────────────────────────────────
    if (action === 'create_user') {
      const { email, password, name, tabs, is_admin } = payload

      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      })
      if (error) return res.status(400).json({ error: error.message })

      const userId = data.user.id

      await anonClient.from('user_profiles').insert({
        user_id: userId, name, email, is_admin: !!is_admin, is_active: true,
      })

      if (!is_admin && tabs?.length > 0) {
        await anonClient.from('user_permissions').insert(tabs.map(tab => ({ user_id: userId, tab })))
      }

      return res.status(200).json({ success: true, user_id: userId })
    }

    // ── Reset user password (admin, no old password needed) ──────────────────
    if (action === 'reset_password') {
      const { user_id, new_password } = payload
      const { error } = await admin.auth.admin.updateUserById(user_id, { password: new_password })
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ success: true })
    }

    // ── Revoke user (permanent block) ────────────────────────────────────────
    if (action === 'revoke_user') {
      const { user_id } = payload
      // Ban user in Supabase Auth + mark profile inactive
      await admin.auth.admin.updateUserById(user_id, { ban_duration: '876600h' }) // 100 years
      await anonClient.from('user_profiles').update({ is_active: false }).eq('user_id', user_id)
      // Sign out all sessions
      await admin.auth.admin.signOut(user_id, 'global')
      return res.status(200).json({ success: true })
    }

    // ── Delete user ──────────────────────────────────────────────────────────
    if (action === 'delete_user') {
      const { user_id } = payload
      await admin.auth.admin.deleteUser(user_id)
      // Cascade deletes profile + permissions via FK ON DELETE CASCADE
      return res.status(200).json({ success: true })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
