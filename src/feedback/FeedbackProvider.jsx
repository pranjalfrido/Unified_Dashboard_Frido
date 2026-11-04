import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FeedbackCtx } from './feedbackCtx.js'
import { fb, APP_VERSION, setFeedbackViewerAdmin } from './feedbackApi.js'
import { publishNavStat } from '../responsive/navStats.js'
import FeedbackForm from './FeedbackForm.jsx'

// One place for everything Feedback needs across the app: opening the form from any entry point,
// the page context captured when it opens, the badge numbers (admin "new" count, the user's own
// "your feedback was closed" notices) and the thank-you toast.
//   open({ type?, ai? })    → the form (phone: bottom sheet · laptop: side panel)
//   publishView(view)       → the Dashboard keeps the current page / filters here (read when the form opens)
//   registerRestore(fn)     → the Dashboard says how to open a page with saved filters (inbox link)
const POLL_MS = 2 * 60 * 1000

export default function FeedbackProvider({ session, profile, children }) {
  const token = session?.access_token || null
  const isAdmin = profile?.is_admin === true
  setFeedbackViewerAdmin(isAdmin) // fb() shows admins the real failure reason
  const [formOpen, setFormOpen] = useState(false)
  const [prefill, setPrefill] = useState(null)
  const [badge, setBadge] = useState({ unseen: 0, newCount: 0 })
  const [notices, setNotices] = useState([])
  const [toast, setToast] = useState(null)
  const viewRef = useRef({})
  const restoreRef = useRef(null)
  const ackedRef = useRef([])

  const publishView = useCallback(v => { viewRef.current = v || {} }, [])
  const registerRestore = useCallback(fn => { restoreRef.current = fn }, [])
  const restore = useCallback(ctx => restoreRef.current?.(ctx), [])

  // Badge numbers + the user's closed-item notices. A failed poll keeps the last numbers.
  const refresh = useCallback(() => {
    if (!token) return Promise.resolve()
    return fb('badge', token).then(b => {
      setBadge({ unseen: b.unseen || 0, newCount: b.newCount || 0 })
      if (b.unseen > 0) return fb('mine', token).then(m => setNotices((m.items || []).filter(i => i.notify)))
      setNotices([])
      return undefined
    }).catch(() => {})
  }, [token])

  useEffect(() => {
    const first = setTimeout(refresh, 0)
    const id = setInterval(refresh, POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearTimeout(first); clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [refresh])

  // The launcher shows "n new" next to the admin Feedback page.
  useEffect(() => { if (isAdmin) publishNavStat('feedback', badge.newCount > 0 ? { value: String(badge.newCount), label: 'new' } : { value: '0', label: 'new' }) }, [isAdmin, badge.newCount])

  const open = useCallback((p = null) => { setPrefill(p); setFormOpen(true) }, [])

  // Opening the notifications panel marks the closed items as read (server); they leave the list when it closes.
  const ackNotices = useCallback(() => {
    const ids = notices.map(n => n.id).filter(id => !ackedRef.current.includes(id))
    if (!ids.length || !token) return
    ackedRef.current.push(...ids)
    fb('ack', token, { ids }).then(() => setBadge(b => ({ ...b, unseen: Math.max(0, b.unseen - ids.length) }))).catch(() => { ackedRef.current = ackedRef.current.filter(i => !ids.includes(i)) })
  }, [notices, token])
  const clearAcked = useCallback(() => { if (ackedRef.current.length) { const done = ackedRef.current; ackedRef.current = []; setNotices(n => n.filter(x => !done.includes(x.id))) } }, [])

  const showToast = useCallback(text => { setToast(text); setTimeout(() => setToast(t => (t === text ? null : t)), 4000) }, [])

  const getView = useCallback(() => viewRef.current, [])
  const value = useMemo(() => ({ open, publishView, registerRestore, restore, badge, notices, ackNotices, clearAcked, isAdmin, token, refresh, showToast, getView }),
    [open, publishView, registerRestore, restore, badge, notices, ackNotices, clearAcked, isAdmin, token, refresh, showToast, getView])

  return (
    <FeedbackCtx.Provider value={value}>
      {children}
      {formOpen && (
        <FeedbackForm token={token} prefill={prefill} getView={getView} version={APP_VERSION}
          onClose={() => setFormOpen(false)}
          onSent={() => { setFormOpen(false); showToast("Thanks! Suraj's team will look into it."); refresh() }} />
      )}
      {toast && <div className="fb-toast" role="status">{toast}</div>}
    </FeedbackCtx.Provider>
  )
}
