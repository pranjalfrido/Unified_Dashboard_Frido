import { useEffect, useRef, useState } from 'react'
import { ChatCircleDots, DotsThree, Sparkle, Tray } from '@phosphor-icons/react'
import { useFeedback } from './FeedbackProvider.jsx'
import './feedback.css'

// Laptop header, right side: "Feedback" button and a ⋯ menu (What's new).
export function FeedbackHeaderButtons({ setPage }) {
  const { open } = useFeedback()
  const [menu, setMenu] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!menu) return
    const off = e => { if (!ref.current?.contains(e.target)) setMenu(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [menu])
  return (
    <div className="fb-hdr" ref={ref}>
      <button type="button" className="fb-hbtn" onClick={() => open()} data-testid="fb-open-header"><ChatCircleDots size={16} /> Feedback</button>
      <button type="button" className="fb-hmore" aria-label="More" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(v => !v)}><DotsThree size={20} weight="bold" /></button>
      {menu && (
        <div className="fb-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setMenu(false); setPage('whatsnew') }}><Sparkle size={15} /> What's new</button>
        </div>
      )}
    </div>
  )
}

// Sidebar (laptop): "Feedback" at the bottom, and for admins the inbox with its "new" count.
export function FeedbackSidebarItems({ page, setPage }) {
  const { open, isAdmin, badge } = useFeedback()
  return (
    <>
      {isAdmin && (
        <div onClick={() => setPage('feedback')} className={`sb-item${page === 'feedback' ? ' active' : ''}`} style={{ position: 'relative' }} data-testid="sb-inbox">
          <span className="sb-icon"><Tray size={20} weight={page === 'feedback' ? 'fill' : 'regular'} /></span>
          <span className="sb-label">Inbox</span>
          {badge.newCount > 0 && <span className="fb-navbadge" aria-label={`${badge.newCount} new`}>{badge.newCount > 99 ? '99+' : badge.newCount}</span>}
        </div>
      )}
      <div onClick={() => open()} className="sb-item" data-testid="sb-feedback">
        <span className="sb-icon"><ChatCircleDots size={20} /></span>
        <span className="sb-label">Feedback</span>
      </div>
    </>
  )
}
