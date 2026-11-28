import { supabase } from './supabase.js'

// weak_password / weak_skips on user_profiles are protected columns: the browser cannot write them
// (docs/sql/security-profile-lock.sql). This asks /api/auth-admin to do it for the signed-in person, on their own row.
// op: 'flag' | 'skip' | 'clear' ('clear' needs the new password, which the server re-checks). Failures are quiet.
export async function weakFlag(op, password, token) {
  try {
    const t = token || (await supabase.auth.getSession()).data.session?.access_token
    if (!t) return null
    const r = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth-admin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'weak_flag', op, password, callerToken: t }),
    })
    return r.ok ? await r.json() : null
  } catch { return null }
}
