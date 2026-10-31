import { useEffect, useState } from 'react'
import { fb, TYPE_LABEL, STATUS_LABEL, when } from './feedbackApi.js'
import { useFeedback } from './FeedbackProvider.jsx'
import { TypeIcon } from './FeedbackInbox.jsx'
import './feedback.css'

// Profile → "My feedback": the person's own items with their status and the team's reply.
export default function MyFeedback({ compact = false }) {
  const { token, open } = useFeedback()
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let off = false
    if (!token) return
    fb('mine', token).then(d => { if (!off) setItems(d.items) }, e => { if (!off) setError(e.message) })
    return () => { off = true }
  }, [token])
  return (
    <section className={`fbm${compact ? ' compact' : ''}`} data-testid="my-feedback" aria-label="My feedback">
      <div className="fbm-head"><h3>My feedback</h3><button type="button" className="fb-ghost" onClick={() => open()}>Send feedback</button></div>
      {error && <div className="fb-err">{error}</div>}
      {items === null && !error && <div className="fbx-muted">Loading…</div>}
      {items && !items.length && <div className="fbx-muted">You haven't sent any feedback yet.</div>}
      {items && items.map(i => (
        <article key={i.id} className="fbm-item">
          <div className="fbm-top"><span className="fbx-type"><TypeIcon type={i.type} size={16} /> {TYPE_LABEL[i.type]}</span><span className={`fbx-status s-${i.status}`}>{STATUS_LABEL[i.status]}</span></div>
          <p className="fbx-msg">{i.message}</p>
          <div className="fbx-muted">{i.context?.page ? `${i.context.page} · ` : ''}{when(i.created_at)}</div>
          {i.admin_reply && <div className="fbm-reply"><b>Reply from the team</b>{i.admin_reply}</div>}
        </article>
      ))}
    </section>
  )
}
