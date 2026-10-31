import { useEffect, useState } from 'react'
import { fb, TYPE_LABEL, when } from './feedbackApi.js'
import { useFeedback } from './FeedbackProvider.jsx'
import { TypeIcon } from './FeedbackInbox.jsx'
import './feedback.css'

// What's new: fixes and features the team marked "Show in What's new" in the last 30 days.
// Only the team's note is shown, never who asked or what they wrote.
export default function WhatsNew() {
  const { token } = useFeedback()
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let off = false
    if (!token) return
    fb('whatsnew', token).then(d => { if (!off) setItems(d.items) }, e => { if (!off) setError(e.message) })
    return () => { off = true }
  }, [token])
  return (
    <section className="fbm" data-testid="whats-new" aria-label="What's new">
      <div className="fbm-head"><h3>What's new</h3><span className="fbx-muted">Last 30 days</span></div>
      {error && <div className="fb-err">{error}</div>}
      {items === null && !error && <div className="fbx-muted">Loading…</div>}
      {items && !items.length && <div className="fbx-empty">Nothing new to show yet.</div>}
      {items && items.map(i => (
        <article key={i.id} className="fbm-item">
          <div className="fbm-top"><span className="fbx-type"><TypeIcon type={i.type} size={16} /> {i.type === 'bug' || i.type === 'wrong_number' ? 'Fixed' : TYPE_LABEL[i.type]}</span><span className="fbx-muted">{when(i.resolved_at)}</span></div>
          <p className="fbx-msg">{i.text}</p>
        </article>
      ))}
    </section>
  )
}
