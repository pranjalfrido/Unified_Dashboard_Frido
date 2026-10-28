import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.SUPABASE_PROJECT_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_PROJECT_URL or SUPABASE_SECRET_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages, callerToken } = req.body || {}

  if (!callerToken) return res.status(401).json({ error: 'Not logged in.' })
  if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: 'messages array required' })

  // Verify Supabase session and check user is active
  let admin
  try { admin = getAdminClient() } catch (e) {
    return res.status(503).json({ error: 'Auth service unavailable.' })
  }

  const { data: userData, error: userErr } = await admin.auth.getUser(callerToken)
  if (userErr || !userData?.user) return res.status(401).json({ error: 'Session expired. Please log in again.' })

  const { data: profile, error: profileErr } = await admin
    .from('user_profiles')
    .select('is_active')
    .eq('user_id', userData.user.id)
    .single()

  if (profileErr || !profile?.is_active) return res.status(403).json({ error: 'Your account has been deactivated. Contact your admin.' })

  // Pulse access, the same rule as App.jsx, read from the database (never from the request): the two
  // owners, or anyone granted the 'ask' tab. Being an admin alone doesn't grant it.
  const PULSE_WHITELIST = ['pranjal.t@myfrido.com', 'suraj.s@myfrido.com']
  if (!PULSE_WHITELIST.includes((userData.user.email || '').toLowerCase())) {
    const { data: grant, error: grantErr } = await admin
      .from('user_permissions')
      .select('tab')
      .eq('user_id', userData.user.id)
      .eq('tab', 'ask')
      .limit(1)
    if (grantErr) return res.status(503).json({ error: 'Auth service unavailable.' })
    if (!grant?.length) return res.status(403).json({ error: "You don't have access to Frido Pulse" })
  }

  // Forward to connector — credentials stay server-side
  const connectorUrl = process.env.CONNECTOR_URL
  const connectorKey = process.env.CONNECTOR_API_KEY
  if (!connectorUrl || !connectorKey) return res.status(503).json({ error: 'Data connector not configured.' })

  try {
    const upstream = await fetch(`${connectorUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': connectorKey,
      },
      body: JSON.stringify({ messages }),
    })

    const data = await upstream.json().catch(() => ({}))

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data.error || `Connector error ${upstream.status}` })
    }

    return res.status(200).json(data)
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach data connector. Please try again.' })
  }
}
