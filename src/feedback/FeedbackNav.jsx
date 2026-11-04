import { ChatCircleDots, Tray } from '@phosphor-icons/react'
import { useFeedback } from './feedbackCtx.js'
import './feedback.css'

// Laptop header, right side: the "Feedback" button.
export function FeedbackHeaderButtons() {
  const { open } = useFeedback()
  return (
    <div className="fb-hdr">
      <button type="button" className="fb-hbtn" onClick={() => open()} data-testid="fb-open-header"><ChatCircleDots size={16} /> Feedback</button>
    </div>
  )
}

// Sidebar (laptop): "Feedback" at the bottom, and for admins the inbox with its "new" count.
export function FeedbackSidebarItems({ page, setPage }) {
  const { open, isAdmin, badge } = useFeedback()
  return (
    <>
      {(
        <div onClick={() => setPage('feedback')} className={`sb-item${page === 'feedback' ? ' active' : ''}`} style={{ position: 'relative' }} data-testid="sb-inbox">
          <span className="sb-icon"><Tray size={20} weight={page === 'feedback' ? 'fill' : 'regular'} /></span>
          <span className="sb-label">Inbox</span>
          {isAdmin && badge.newCount > 0 && <span className="fb-navbadge" aria-label={`${badge.newCount} new`}>{badge.newCount > 99 ? '99+' : badge.newCount}</span>}
        </div>
      )}
      <div onClick={() => open()} className="sb-item" data-testid="sb-feedback">
        <span className="sb-icon"><ChatCircleDots size={20} /></span>
        <span className="sb-label">Feedback</span>
      </div>
    </>
  )
}
