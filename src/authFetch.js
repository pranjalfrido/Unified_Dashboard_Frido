// fetch() for the dashboard's own data: /api routes and the static .json files. middleware.js
// rejects those without the user's Supabase login token, so every data request goes through here.
//
// getSession() returns the stored session and refreshes the access token first when it has expired
// (a laptop waking from sleep, the installed app resumed after hours in the background). If the
// token still expires between that check and the request, the 401 triggers one refresh and one
// retry. Other requests (Supabase, outside URLs) keep using plain fetch().
//
// supabase.js is loaded on first use, not imported at the top, so modules that use this helper still
// load outside Vite (node tests), where the Supabase client can't be created.
async function client() {
  return (await import('./supabase.js')).supabase
}

function withToken(headers, token) {
  const h = new Headers(headers || {})
  if (token) h.set('Authorization', `Bearer ${token}`)
  return h
}

export async function authFetch(url, options = {}) {
  const supabase = await client()
  const { data } = await supabase.auth.getSession()
  const res = await fetch(url, { ...options, headers: withToken(options.headers, data.session?.access_token) })
  if (res.status !== 401) return res
  const { data: refreshed } = await supabase.auth.refreshSession()
  if (!refreshed.session) return res
  return fetch(url, { ...options, headers: withToken(options.headers, refreshed.session.access_token) })
}
