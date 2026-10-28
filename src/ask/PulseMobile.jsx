import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ClockCounterClockwise, NotePencil, Lightning, Truck, ChartBar, Cube, ArrowsLeftRight, ArrowUp, CaretRight, MagnifyingGlass, Plus, Trash, Code, CheckCircle } from '@phosphor-icons/react'
import MobilePageHeader from '../responsive/MobilePageHeader.jsx'
import BottomSheet from '../responsive/BottomSheet.jsx'
import { renderMarkdown } from './markdown.js'
import { displayTitle, groupByDate, SUGGESTIONS } from './pulseShared.js'

// Frido Pulse on phones (docs/responsive/PULSE_FEATURES.md, mockups/pulse_mockup.html). Layout only:
// AskFridoPage owns the conversations and passes the same handlers the laptop view uses.
//   header   green MobilePageHeader: 🕘 history · title (+ category chip) · ✎ new question · ⋯ delete
//   thread   question bubble right, answer full width (same markdown renderer); tables fit the width
//            or swipe inside their own box (first column fixed); Show SQL; clarify buttons
//   composer one line, grows to 5; Enter = new line, the button sends. While the keyboard is open the
//            bottom bar hides and the composer sits on the keyboard (visualViewport).
//   history  BottomSheet: New question, search, Today / Yesterday / Previous 7 days, delete per row.

const SUGGESTION_ICONS = [Truck, ChartBar, Cube, ArrowsLeftRight]
const isError = m => m.role === 'assistant' && typeof m.id === 'string' && m.id.startsWith('err')

// Visible area: its height, its offset (iOS scrolls the layout viewport under the keyboard), and
// whether the on-screen keyboard is open (composer focused and the visible area much shorter).
function useViewport(focused) {
  const read = () => {
    const v = window.visualViewport
    return { h: v ? v.height : window.innerHeight, top: v ? v.offsetTop : 0, ih: window.innerHeight }
  }
  const [vp, setVp] = useState(() => ({ ...read(), tallest: window.innerHeight }))
  useEffect(() => {
    const v = window.visualViewport
    const on = () => setVp(p => ({ ...read(), tallest: Math.max(p.tallest, window.innerHeight) }))
    v?.addEventListener('resize', on); v?.addEventListener('scroll', on); window.addEventListener('resize', on)
    return () => { v?.removeEventListener('resize', on); v?.removeEventListener('scroll', on); window.removeEventListener('resize', on) }
  }, [])
  const kb = focused && (vp.ih - vp.h > 120 || vp.tallest - vp.ih > 120)
  return { ...vp, kb }
}

// Number-like cells (₹, %, Cr, L, K, days…) right-aligned; a table wider than the screen swipes inside
// its own box with a fade on the right edge while there is more to see.
const NUM = /^[-+−]?\s?(₹\s?)?[\d,]+(\.\d+)?\s?(%|Cr|L|K|k|M|x|d|days|pts|pp)?$/
// The alignment classes go into the HTML itself, so a re-render that resets the answer keeps them.
function answerHtml(text) {
  const html = renderMarkdown(text)
  if (!html.includes('af-table')) return html
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  tpl.content.querySelectorAll('.af-table').forEach(table => {
    const rows = [...table.rows]
    const cols = Math.max(0, ...rows.map(r => r.cells.length))
    for (let j = 1; j < cols; j++) {
      const body = rows.slice(1).map(r => r.cells[j]).filter(c => c && c.textContent.trim())
      if (body.length && body.every(c => NUM.test(c.textContent.trim()))) rows.forEach(r => r.cells[j]?.classList.add('pm-n'))
    }
  })
  return tpl.innerHTML
}
function fitTables(root) {
  const offs = []
  root?.querySelectorAll('.af-table').forEach(table => {
    const wrap = table.parentElement
    const upd = () => wrap.classList.toggle('pm-more', wrap.scrollWidth - wrap.clientWidth - wrap.scrollLeft > 2)
    upd()
    wrap.addEventListener('scroll', upd, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(upd) : null
    ro?.observe(wrap)
    offs.push(() => { wrap.removeEventListener('scroll', upd); ro?.disconnect() })
  })
  return () => offs.forEach(f => f())
}

function Who({ model }) {
  return (
    <div className="pm-who">
      <i aria-hidden="true"><Lightning size={11} weight="fill" /></i>Frido Pulse
      {model && <span className="pm-badge">{model.includes('opus') ? '⚡ Opus' : '· Sonnet'}</span>}
    </div>
  )
}

function Answer({ msg }) {
  const [sqlOpen, setSqlOpen] = useState(false)
  const ref = useRef(null)
  const html = useMemo(() => (msg.text ? answerHtml(msg.text) : ''), [msg.text])
  useLayoutEffect(() => fitTables(ref.current), [html])
  if (msg.thinking) return <div className="pm-ai"><Who /><div className="af-thinking"><span /><span /><span /></div></div>
  if (isError(msg)) return <div className="pm-ai"><Who /><div className="pm-err" role="alert">{msg.text}</div></div>
  return (
    <div className="pm-ai">
      <Who model={msg.model} />
      {msg.text && <div ref={ref} className="af-answer pm-answer" dangerouslySetInnerHTML={{ __html: html }} />}
      {msg.assumptions && <div className="af-assumptions">Assumptions: {msg.assumptions}</div>}
      {(msg.matchesDashboard || msg.sql) && (
        <div className="pm-acts">
          {msg.matchesDashboard && <span className="pm-act"><CheckCircle size={13} weight="fill" />Matches dashboard</span>}
          {msg.sql && (
            <button type="button" className="pm-act" aria-expanded={sqlOpen} onClick={() => setSqlOpen(o => !o)}>
              <Code size={13} />{sqlOpen ? 'Hide SQL' : 'Show SQL'}
            </button>
          )}
        </div>
      )}
      {sqlOpen && msg.sql && <pre className="pm-sql">{msg.sql}</pre>}
    </div>
  )
}

function Clarify({ msg, onChoice }) {
  return (
    <div className="pm-ai">
      <Who />
      <div className="af-answer pm-answer">{msg.question}</div>
      <div className="pm-clar">
        {msg.options.map(opt => <button key={opt} type="button" onClick={() => onChoice(opt)}>{opt}</button>)}
      </div>
    </div>
  )
}

function Empty({ onSuggestion, recent, onOpen }) {
  return (
    <div className="pm-empty">
      <div className="pm-hero">
        <div className="pm-bolt" aria-hidden="true"><Lightning size={24} weight="fill" /></div>
        <h2>Ask anything</h2>
        <p>Sales, inventory, logistics, P&amp;L — all in one place</p>
      </div>
      <div className="pm-sh">Try asking</div>
      {SUGGESTIONS.map((s, i) => {
        const Icon = SUGGESTION_ICONS[i] || Lightning
        return (
          <button key={s} type="button" className="pm-sug" onClick={() => onSuggestion(s)}>
            <i aria-hidden="true"><Icon size={15} /></i><span>{s}</span><CaretRight size={14} className="pm-chev" aria-hidden="true" />
          </button>
        )
      })}
      {recent.length > 0 && (
        <>
          <div className="pm-sh">Recent</div>
          {recent.map(c => <button key={c.id} type="button" className="pm-rec" onClick={() => onOpen(c.id)}><span>{displayTitle(c)}</span><CaretRight size={13} aria-hidden="true" /></button>)}
        </>
      )}
    </div>
  )
}

function Composer({ onSend, disabled, onFocusChange }) {
  const ref = useRef(null)
  const [val, setVal] = useState('')
  const grow = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 130) + 'px' // 5 lines, then it scrolls inside
  }
  const submit = () => {
    const text = val.trim()
    if (!text || disabled) return
    setVal('')
    requestAnimationFrame(grow)
    onSend(text)
  }
  return (
    <div className="pm-cmp">
      <div className="pm-box">
        <textarea ref={ref} rows={1} value={val} placeholder="Ask a question…" aria-label="Ask a question" disabled={disabled}
          onChange={e => { setVal(e.target.value); grow() }} onFocus={() => onFocusChange(true)} onBlur={() => onFocusChange(false)} />
        <button type="button" className="pm-send" aria-label="Send" disabled={disabled || !val.trim()} onMouseDown={e => e.preventDefault()} onClick={submit}>
          <ArrowUp size={16} weight="bold" />
        </button>
      </div>
      <div className="pm-disc">Pulse can make mistakes. Verify key numbers.</div>
    </div>
  )
}

function HistorySheet({ open, onClose, conversations, activeId, onSelect, onNew, onDelete }) {
  const [q, setQ] = useState('')
  const [confirmId, setConfirmId] = useState(null)
  const close = () => { setQ(''); setConfirmId(null); onClose() }
  const list = q.trim() ? conversations.filter(c => displayTitle(c).toLowerCase().includes(q.trim().toLowerCase())) : conversations
  const g = groupByDate(list)
  const row = c => (
    <div key={c.id} className={`pm-hrow${c.id === activeId ? ' on' : ''}`}>
      {confirmId === c.id ? (
        <div className="pm-hconf">
          <span>Delete this chat?</span>
          <button type="button" onClick={() => setConfirmId(null)}>Cancel</button>
          <button type="button" className="pm-danger" onClick={() => { onDelete(c.id); setConfirmId(null) }}>Delete</button>
        </div>
      ) : (
        <>
          <button type="button" className="pm-hopen" aria-current={c.id === activeId ? 'true' : undefined} onClick={() => { onSelect(c.id); close() }}>{displayTitle(c)}</button>
          <button type="button" className="pm-hdel" aria-label={`Delete “${displayTitle(c)}”`} onClick={() => setConfirmId(c.id)}><Trash size={16} /></button>
        </>
      )}
    </div>
  )
  const group = (label, items) => items.length > 0 && <div key={label}><div className="pm-sh">{label}</div>{items.map(row)}</div>
  return (
    <BottomSheet open={open} onClose={close} title="Your questions">
      <button type="button" className="pm-newq" onClick={() => { onNew(); close() }}><Plus size={14} weight="bold" />New question</button>
      <label className="pm-search">
        <MagnifyingGlass size={15} aria-hidden="true" />
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search questions" aria-label="Search questions" />
      </label>
      {group('Today', g.today)}{group('Yesterday', g.yesterday)}{group('Previous 7 days', g.week)}
      {list.length === 0 && <div className="pm-none">{conversations.length ? 'No conversations found' : 'No questions yet'}</div>}
    </BottomSheet>
  )
}

export default function PulseMobile({ conversations, activeId, active, sending, onSelect, onNew, onDelete, onSend, onClarifyChoice }) {
  const [histOpen, setHistOpen] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const vp = useViewport(focused)
  const scroller = useRef(null)
  const messages = useMemo(() => active?.messages || [], [active])
  const inChat = messages.length > 0

  // Keyboard open: hide the bottom bar (it is portalled to <body>).
  useEffect(() => {
    document.body.classList.toggle('pm-kb', vp.kb)
    return () => document.body.classList.remove('pm-kb')
  }, [vp.kb])

  // Opening a chat jumps to its latest message; a new question or answer (or the keyboard opening)
  // scrolls to it. An answer taller than the thread shows its start, not its end.
  const toLatest = smooth => {
    const el = scroller.current
    if (!el) return
    const last = el.querySelector('.pm-thread-inner')?.lastElementChild
    const top = last && last.offsetHeight > el.clientHeight - 24 ? last.offsetTop - 8 : el.scrollHeight
    el.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
  }
  useLayoutEffect(() => toLatest(false), [activeId])
  useEffect(() => toLatest(true), [messages, vp.kb])

  const recent = conversations.filter(c => c.messages?.length).slice(0, 3)
  const header = (
    <div className="topnav m-header" data-page="ask">
      <MobilePageHeader
        lead={<button type="button" className="mph-ib" aria-label="Your questions" onClick={() => setHistOpen(true)}><ClockCounterClockwise size={18} /></button>}
        title={inChat ? displayTitle(active) : 'Frido Pulse'}
        tag={inChat ? active.category : null}
        right={<button type="button" className="mph-ib" aria-label="New question" onClick={onNew}><NotePencil size={18} /></button>}
        menu={active ? { title: 'Chat', items: [{ id: 'delete', label: 'Delete this chat', onSelect: () => setTimeout(() => setDelOpen(true), 350) }] } : undefined}
      />
    </div>
  )

  return (
    <div className={`pm-root${inChat ? ' pm-in-chat' : ''}${vp.kb ? ' pm-kb-open' : ''}`}
      style={{ top: vp.top, height: vp.kb ? vp.h : `calc(${vp.h}px - var(--bot) - var(--safe-bottom))` }}>
      {header}
      <div ref={scroller} className="pm-thread">
        {inChat ? (
          <div className="pm-thread-inner">
            {messages.map(m => {
              if (m.role === 'user') return <div key={m.id} className="pm-me">{m.text}</div>
              if (m.clarify) return <Clarify key={m.id} msg={m} onChoice={onClarifyChoice} />
              return <Answer key={m.id} msg={m} />
            })}
          </div>
        ) : (
          <Empty onSuggestion={onSend} recent={recent} onOpen={onSelect} />
        )}
      </div>
      <Composer onSend={onSend} disabled={sending} onFocusChange={setFocused} />
      <HistorySheet open={histOpen} onClose={() => setHistOpen(false)} conversations={conversations} activeId={activeId}
        onSelect={onSelect} onNew={onNew} onDelete={onDelete} />
      <BottomSheet open={delOpen} onClose={() => setDelOpen(false)} title="Delete this chat?" subtitle={active ? displayTitle(active) : undefined}>
        <p className="pm-confirm-text">It is removed from your questions on this device. This can’t be undone.</p>
        <div className="pm-confirm">
          <button type="button" onClick={() => setDelOpen(false)}>Cancel</button>
          <button type="button" className="pm-danger-fill" onClick={() => { if (active) onDelete(active.id); setDelOpen(false) }}>Delete</button>
        </div>
      </BottomSheet>
    </div>
  )
}
