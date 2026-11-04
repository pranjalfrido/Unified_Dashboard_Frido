import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase.js'

// Live users (admins only). Two halves:
//   usePresenceHeartbeat(pageKey)  every signed-in user: while the tab is visible, tell api/presence
//                                  "I'm here, on this page" every 30 s and on every page change; stops
//                                  when the tab is hidden. Sends only the URL path (e.g. "/pnl/shopify").
//   useLivePresence(enabled)       admins: one shared 30 s poll of who is live (+ everyone's last seen),
//                                  read by the header pill, the launcher, the ⋯ menu and Team members.
const API = import.meta.env.VITE_API_URL || ''
const BEAT_MS = 30 * 1000

async function call(action, body = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) return null
  const r = await fetch(`${API}/api/presence`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...body }), keepalive: action === 'beat' })
  if (!r.ok || r.status === 204) return r.ok ? {} : null
  return r.json()
}

export function usePresenceHeartbeat(pageKey, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    let timer = null
    const beat = () => { call('beat', { page: pageKey }).catch(() => {}) }
    const start = () => { if (timer) return; beat(); timer = setInterval(beat, BEAT_MS) }
    const stop = () => { clearInterval(timer); timer = null }
    const onVis = () => (document.visibilityState === 'visible' ? start() : stop())
    onVis()
    document.addEventListener('visibilitychange', onVis)
    return () => { stop(); document.removeEventListener('visibilitychange', onVis) }
  }, [pageKey, enabled])
}

// ── Admin read: one poll shared by every subscriber ─────────────────────────
let snap = { live: [], lastSeen: {}, me: null, loaded: false, error: null }
const subs = new Set()
let pollTimer = null
const emit = () => subs.forEach(f => f())
async function refresh() {
  if (document.visibilityState !== 'visible') return
  try {
    const d = await call('list')
    snap = d && d.live ? { live: d.live, lastSeen: d.lastSeen || {}, me: d.me, loaded: true, error: null } : { ...snap, loaded: true, error: 'unavailable' }
  } catch { snap = { ...snap, loaded: true, error: 'unavailable' } }
  emit()
}
const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
function subscribe(f) {
  subs.add(f)
  if (subs.size === 1) { refresh(); pollTimer = setInterval(refresh, BEAT_MS); document.addEventListener('visibilitychange', onVisible) }
  return () => {
    subs.delete(f)
    if (!subs.size) { clearInterval(pollTimer); pollTimer = null; document.removeEventListener('visibilitychange', onVisible) }
  }
}
const noop = () => () => {}
const EMPTY = { live: [], lastSeen: {}, me: null, loaded: false, error: null }
export function useLivePresence(enabled) {
  return useSyncExternalStore(enabled ? subscribe : noop, () => (enabled ? snap : EMPTY))
}
export const refreshLivePresence = refresh

// "12 min", "2 h", "3 d"
export function ago(iso, now = Date.now()) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min`
  const h = Math.round(m / 60)
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`
}

// N live (null until the first answer, or on error), for menu labels and the launcher.
export function useLiveCount(isAdmin) {
  const p = useLivePresence(!!isAdmin)
  return p.loaded && !p.error ? p.live.length : null
}

// Team members: green dot when online, else "Last seen 2 h ago" (null when never seen).
export function presenceOf(p, userId, now = Date.now()) {
  if (!p.loaded || p.error) return null
  if (p.live.some(u => u.userId === userId)) return { online: true, text: 'Online' }
  const t = p.lastSeen[userId]
  return t ? { online: false, text: `Last seen ${ago(t, now).replace('just now', '1 min')} ago` } : null // never seen: caller keeps its own text
}
