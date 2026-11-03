import { useEffect, useState } from 'react'
import { Flag, CaretLeft } from '@phosphor-icons/react'
import TypeIcon from './TypeIcon.jsx'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
import { fb, TYPES, TYPE_LABEL, STATUS_LABEL, when } from './feedbackApi.js'
import { useFeedback } from './feedbackCtx.js'
import { filterText } from './feedbackContext.js'
import './feedback.css'

function Detail({ id, token, onChanged, onBack, phone }) {
  const { restore, showToast } = useFeedback()
  const [item, setItem] = useState(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('new')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let off = false
    fb('get', token, { id }).then(d => { if (off) return; setItem(d.item); setStatus(d.item.status); setReply(d.item.admin_reply || '') }, e => { if (!off) setError(e.message) })
    return () => { off = true }
  }, [id, token])

  if (error) return <div className="fbx-detail"><div className="fb-err">{error}</div></div>
  if (!item) return <div className="fbx-detail"><div className="fbx-muted">Loading…</div></div>

  const closing = status === 'done' || status === 'wont_do'
  const needReply = closing && reply.trim().length < 3
  const c = item.context || {}
  const save = async () => {
    if (needReply) return
    setBusy(true); setError('')
    try {
      const d = await fb('update', token, { id, status, admin_reply: reply })
      setItem(p => ({ ...p, ...d.item })); onChanged()
      showToast('Saved.')
    } catch (e) { setError(e.message) }
    setBusy(false)
  }
  const rows = [
    ['Page', c.page], ['Channel', c.channel], ['Sub-channel', c.subChannel], ['Date range', c.dateRange],
    ['Filters', filterText(c.filters)], ['Device', c.device && `${c.device.kind} ${c.device.viewport} · ${c.device.browser}`],
    ['App version', c.appVersion], ['Sent', when(item.created_at)],
  ].filter(r => r[1])

  return (
    <div className="fbx-detail" data-testid="fbx-detail">
      {phone && <button type="button" className="fbx-back" onClick={onBack}><CaretLeft size={16} weight="bold" /> All feedback</button>}
      <div className="fbx-dhead">
        <span className="fbx-type"><TypeIcon type={item.type} /> {TYPE_LABEL[item.type]}</span>
        {item.urgent && <span className="fbx-urgent"><Flag size={12} weight="fill" /> Urgent</span>}
        <span className={`fbx-status s-${item.status}`}>{STATUS_LABEL[item.status]}</span>
      </div>
      <div className="fbx-from">{item.user_name || item.user_email}{item.user_name && item.user_email ? ` · ${item.user_email}` : ''}</div>
      <p className="fbx-msg">{item.message}</p>
      {c.ai && (
        <div className="fbx-ai">
          <div><b>NavAI question</b>{c.ai.question}</div>
          <div><b>NavAI answer</b>{c.ai.answer}</div>
        </div>
      )}
      {item.screenshot_url && <a href={item.screenshot_url} target="_blank" rel="noreferrer" className="fbx-shot"><img src={item.screenshot_url} alt="Screenshot from the user" /></a>}
      <dl className="fbx-ctx">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {c.path && <button type="button" className="fbx-link" onClick={() => restore(c)}>Open this page with the same filters</button>}

      <div className="fbx-manage">
        <label className="fbx-lab">Status
          <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status">
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="fbx-lab">Reply to {item.user_name?.split(' ')[0] || 'the user'}{closing ? ' (required)' : ''}
          <textarea value={reply} maxLength={1000} rows={3} onChange={e => setReply(e.target.value)} placeholder={closing ? 'A short note on what was done, or why not' : 'Optional'} aria-label="Reply" />
        </label>
        {error && <div className="fb-err" role="alert">{error}</div>}
        <button type="button" className="fb-send fbx-save" disabled={busy || needReply} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        {needReply && <div className="fbx-muted">Add a short reply to close this item.</div>}
      </div>
    </div>
  )
}

export default function FeedbackInbox() {
  const { isAdmin, token, refresh } = useFeedback()
  const bp = useBreakpoint()
  const phone = bp.width <= 768 || bp.isPhoneLandscape
  const [filters, setFilters] = useState({ status: '', type: '', page: '', user: '' })
  const [data, setData] = useState({ items: [], pages: [], users: [], newCount: 0 })
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [sel, setSel] = useState(null)

  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (!isAdmin) return
    let off = false
    const f = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    fb('list', token, { filters: f }).then(d => { if (!off) { setData(d); setError(''); setLoaded(true) } }, e => { if (!off) { setError(e.message); setLoaded(true) } })
    return () => { off = true }
  }, [isAdmin, filters, token, reload])

  if (!isAdmin) return null
  const set = k => e => setFilters(f => ({ ...f, [k]: e.target.value }))
  const changed = () => { setReload(n => n + 1); refresh() }
  const showList = !phone || !sel
  const showDetail = sel && (!phone || true)

  return (
    <div className="fbx" data-testid="fbx">
      {(showList || !phone) && (
        <div className="fbx-main" style={phone && sel ? { display: 'none' } : undefined}>
          <div className="fbx-top">
            <h2>Feedback {data.newCount > 0 && <span className="fbx-badge">{data.newCount} new</span>}</h2>
          </div>
          <div className="fbx-filters">
            <select value={filters.status} onChange={set('status')} aria-label="Filter by status"><option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select value={filters.type} onChange={set('type')} aria-label="Filter by type"><option value="">All types</option>{TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
            <select value={filters.page} onChange={set('page')} aria-label="Filter by page"><option value="">All pages</option>{data.pages.map(p => <option key={p} value={p}>{p}</option>)}</select>
            <select value={filters.user} onChange={set('user')} aria-label="Filter by user"><option value="">All users</option>{data.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </div>
          {error && <div className="fb-err">{error}</div>}
          <div className="fbx-list" role="list">
            {!loaded && <div className="fbx-muted">Loading…</div>}
            {loaded && !data.items.length && <div className="fbx-empty">Nothing here{Object.values(filters).some(Boolean) ? ' for these filters' : ' yet'}.</div>}
            {data.items.map(i => (
              <button key={i.id} type="button" role="listitem" className={`fbx-row${sel === i.id ? ' on' : ''}${i.status === 'new' ? ' isnew' : ''}`} onClick={() => setSel(i.id)} data-testid="fbx-row">
                <span className={`fbx-ic t-${i.type}`}><TypeIcon type={i.type} /></span>
                <span className="fbx-rmain">
                  <span className="fbx-rmsg">{i.message}</span>
                  <span className="fbx-rmeta">{i.user_name || i.user_email} · {i.context?.page || '—'} · {when(i.created_at)}</span>
                </span>
                <span className="fbx-rend">
                  {i.urgent && <span className="fbx-urgent" title="Urgent"><Flag size={12} weight="fill" /></span>}
                  <span className={`fbx-status s-${i.status}`}>{STATUS_LABEL[i.status]}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {showDetail && (!phone || sel) && (
        <div className="fbx-side">
          {sel ? <Detail key={sel} id={sel} token={token} onChanged={changed} onBack={() => setSel(null)} phone={phone} />
            : <div className="fbx-detail"><div className="fbx-empty">Pick an item to read it, reply and change its status.</div></div>}
        </div>
      )}
    </div>
  )
}
