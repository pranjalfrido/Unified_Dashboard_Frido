/* global __APP_VERSION__ */
// Client for api/feedback.js. The signed-in user is identified by the session token only.
const API = import.meta.env.VITE_API_URL || ''

// Local stand-in (localhost testing): VITE_FEEDBACK_LOCAL=1 at build/dev time. Absent in production builds.
export const LOCAL_MODE = import.meta.env.DEV && import.meta.env.VITE_FEEDBACK_LOCAL === '1' // DEV is false in every production build

// Who is looking, so an admin gets the real reason for a failure and everyone else only the plain message.
// Set by FeedbackProvider; defaults to "not admin".
let viewerIsAdmin = false
export const setFeedbackViewerAdmin = v => { viewerIsAdmin = v === true }

// middleware.js (the /api login wall) only lets a request through with `Authorization: Bearer <Supabase access token>`;
// a token in the body alone is rejected with {"error":"Login required"} before this function even runs (SECURITY_FIX.md).
// api/feedback.js still verifies the same token itself (admin.auth.getUser, as api/pulse.js does).
const post = (action, token, extra) => fetch(`${API}/api/feedback`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({ action, callerToken: token, ...extra }),
})

// Why a call failed, for admins: which layer answered (the login wall, our function, or the platform) and what it said.
function adminReason(res, data) {
  if (data?.detail) return data.detail // our function: the real server-side reason, sent to admins only
  if (res.status === 401 && data?.error === 'Login required') return 'HTTP 401 from the login wall (middleware.js), before the feedback function ran: the Authorization header was missing, expired or not a valid Supabase token.'
  if (data?.error) return `HTTP ${res.status} from the feedback function: ${data.error}`
  return `HTTP ${res.status} with no JSON body: the platform answered, not the feedback function (crash, timeout or wrong route). Check the Vercel function logs for /api/feedback.`
}

export async function fb(action, token, extra = {}) {
  let res
  try {
    res = await post(action, token, extra)
  } catch {
    throw Object.assign(new Error('No connection. Please try again.'), { status: 0 })
  }
  // An expired access token: refresh the session once and retry (the Supabase client normally refreshes on its own).
  if (res.status === 401 && !LOCAL_MODE) {
    try {
      const { supabase } = await import('../supabase.js')
      const { data: s } = await supabase.auth.refreshSession()
      if (s?.session?.access_token) res = await post(action, s.session.access_token, extra)
    } catch { /* keep the first answer */ }
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const plain = data?.error === 'Login required' ? 'Your login was not accepted. Please log out and log in again.' : (data?.error || `Something went wrong. Please try again. (error ${res.status})`)
    throw Object.assign(new Error(viewerIsAdmin ? `${plain} Admin info: ${adminReason(res, data)}` : plain), { status: res.status })
  }
  return data
}

export const TYPES = [
  { id: 'bug', label: 'Bug' },
  { id: 'wrong_number', label: 'Wrong number' },
  { id: 'suggestion', label: 'Suggestion' },
  { id: 'new_feature', label: 'New feature/page' },
]
export const TYPE_LABEL = Object.fromEntries(TYPES.map(t => [t.id, t.label]))
export const STATUS_LABEL = { new: 'New', in_progress: 'In progress', done: 'Done', wont_do: "Won't do" }

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

// "3 Oct, 4:15 pm" style, local time.
export function when(iso) {
  const d = new Date(iso)
  if (isNaN(d)) return ''
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
}

// Shrinks a picked image to ≤1280px on the long edge, JPEG, until it is under ~600 KB. → data URL
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Please choose an image.'))
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale)); const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
      const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h)
      let q = 0.78; let out = canvas.toDataURL('image/jpeg', q)
      while (out.length > 800000 && q > 0.4) { q -= 0.1; out = canvas.toDataURL('image/jpeg', q) }
      resolve(out)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be opened.')) }
    img.src = url
  })
}
