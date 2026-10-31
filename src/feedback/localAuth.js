import { LOCAL_MODE } from './feedbackApi.js'

// LOCAL TEST MODE ONLY (VITE_FEEDBACK_LOCAL=1, never set in production): lets the app open on localhost
// as one of three made-up test people, with no Supabase login. Everything here is dead code in a
// normal build (LOCAL_MODE is false, so localSession() is null and the picker is never rendered).
export const LOCAL_PEOPLE = {
  admin: { user_id: '00000000-0000-4000-8000-0000000000a1', email: 'admin@local.test', name: 'Test Admin', is_admin: true },
  asha: { user_id: '00000000-0000-4000-8000-0000000000b1', email: 'asha@local.test', name: 'Asha Verma', is_admin: false },
  rohan: { user_id: '00000000-0000-4000-8000-0000000000b2', email: 'rohan@local.test', name: 'Rohan Mehta', is_admin: false },
}
const KEY = 'fb_local_as'
export const LOCAL_TABS = ['overview', 'sales', 'sales:all', 'sales:shopify', 'ads', 'ads:all', 'pnl', 'pnl:all', 'logistics', 'logistics:cost', 'logistics:cost:all', 'inventory', 'inventory:detail', 'inventory:sales', 'customer', 'customer:support', 'documents', 'ask']

export function localKey() {
  if (!LOCAL_MODE) return null
  try {
    const q = new URLSearchParams(window.location.search).get('as')
    if (q && LOCAL_PEOPLE[q]) sessionStorage.setItem(KEY, q)
    const k = sessionStorage.getItem(KEY)
    return LOCAL_PEOPLE[k] ? k : null
  } catch { return null }
}
export function localSession() {
  const k = localKey()
  return k ? { access_token: `local:${k}`, user: { id: LOCAL_PEOPLE[k].user_id, email: LOCAL_PEOPLE[k].email } } : null
}
export const isLocalSession = s => LOCAL_MODE && String(s?.access_token || '').startsWith('local:')
export function localProfileFor(session) {
  const p = LOCAL_PEOPLE[String(session.access_token).replace('local:', '')]
  return { profile: { ...p, is_active: true, avatar_url: null, invited_at: null, last_login_at: null }, tabs: LOCAL_TABS }
}
