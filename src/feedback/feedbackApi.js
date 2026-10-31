/* global __APP_VERSION__ */
// Client for api/feedback.js. The signed-in user is identified by the session token only.
const API = import.meta.env.VITE_API_URL || ''

// Local stand-in (localhost testing): VITE_FEEDBACK_LOCAL=1 at build/dev time. Absent in production builds.
export const LOCAL_MODE = import.meta.env.DEV && import.meta.env.VITE_FEEDBACK_LOCAL === '1' // DEV is false in every production build

export async function fb(action, token, extra = {}) {
  let res
  try {
    res = await fetch(`${API}/api/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, callerToken: token, ...extra }) })
  } catch {
    throw Object.assign(new Error('No connection. Please try again.'), { status: 0 })
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), { status: res.status })
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
