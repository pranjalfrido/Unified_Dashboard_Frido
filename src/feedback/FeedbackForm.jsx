import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, X } from '@phosphor-icons/react'
import BottomSheet from '../responsive/BottomSheet.jsx'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
import { fb, TYPES, compressImage } from './feedbackApi.js'
import { buildContext, contextLine } from './feedbackContext.js'
import './feedback.css'

const MAX = 1000

function FormBody({ token, prefill, getView, version, onClose, onSent }) {
  const [ctx] = useState(() => buildContext(getView(), version, prefill?.ai)) // captured once, when the form opens
  const [type, setType] = useState(prefill?.type || '')
  const [message, setMessage] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [shot, setShot] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const taRef = useRef(null)
  useEffect(() => { const t = setTimeout(() => taRef.current?.focus({ preventScroll: true }), 250); return () => clearTimeout(t) }, [])

  const pick = async e => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setError('')
    try { setShot(await compressImage(f)) } catch (err) { setError(err.message) }
  }
  const canSend = !!type && message.trim().length > 0 && !busy
  const submit = async () => {
    if (!canSend) return
    setBusy(true); setError('')
    try {
      await fb('submit', token, { type, message: message.trim(), urgent, context: ctx, screenshot: shot || undefined })
      onSent()
    } catch (e) { setError(e.message); setBusy(false) }
  }

  return (
    <div className="fb-form">
      <div className="fb-chips" role="group" aria-label="What are you sending?">
        {TYPES.map(t => <button key={t.id} type="button" className="fb-chip" aria-pressed={type === t.id} onClick={() => setType(t.id)}>{t.label}</button>)}
      </div>
      {prefill?.ai && <div className="fb-ai">The NavAI question and answer are attached automatically.</div>}
      <textarea ref={taRef} className="fb-text" value={message} maxLength={MAX} rows={5} aria-label="Your message"
        placeholder={type === 'wrong_number' ? 'Which number looks wrong, and what did you expect?' : 'What happened, or what would you like?'}
        onChange={e => setMessage(e.target.value)} />
      <div className="fb-count" aria-live="polite">{message.length >= 800 ? `${message.length} / ${MAX}` : ''}</div>

      <div className="fb-row">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} data-testid="fb-file" />
        {!shot
          ? <button type="button" className="fb-ghost" onClick={() => fileRef.current?.click()}><Camera size={16} /> Add screenshot</button>
          : <span className="fb-shot"><img src={shot} alt="Screenshot to send" /><button type="button" aria-label="Remove screenshot" onClick={() => setShot(null)}><X size={12} weight="bold" /></button></span>}
        <label className="fb-urgent"><input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} /> This is urgent</label>
      </div>

      <div className="fb-ctx" data-testid="fb-context">{contextLine(ctx)}</div>
      {error && <div className="fb-err" role="alert">{error}</div>}
      <div className="fb-actions">
        <button type="button" className="fb-cancel" onClick={onClose}>Cancel</button>
        <button type="button" className="fb-send" disabled={!canSend} onClick={submit}>{busy ? 'Sending…' : 'Send'}</button>
      </div>
    </div>
  )
}

export default function FeedbackForm({ token, prefill, getView, version, onClose, onSent }) {
  const bp = useBreakpoint()
  const phone = bp.width <= 768 || bp.isPhoneLandscape
  if (phone) {
    return (
      <BottomSheet open onClose={onClose} title="Send feedback">
        <FormBody token={token} prefill={prefill} getView={getView} version={version} onClose={onClose} onSent={onSent} />
      </BottomSheet>
    )
  }
  return createPortal(<SidePanel onClose={onClose}><FormBody token={token} prefill={prefill} getView={getView} version={version} onClose={onClose} onSent={onSent} /></SidePanel>, document.body)
}

function SidePanel({ onClose, children }) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="fb-panel-wrap">
      <div className="fb-backdrop" onClick={onClose} />
      <aside className="fb-panel" role="dialog" aria-label="Send feedback">
        <div className="fb-panel-head"><b>Send feedback</b><button type="button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        {children}
      </aside>
    </div>
  )
}
