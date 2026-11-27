import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClockCounterClockwise, ArrowUp, CaretRight, MagnifyingGlass, Plus, Code, CheckCircle, ThumbsDown } from '@phosphor-icons/react'
import NavAIIcon from './NavAIIcon.jsx'
import { useFeedback } from '../feedback/feedbackCtx.js'
import { ranQuery } from './ranQuery.js'
import MobilePageHeader from '../responsive/MobilePageHeader.jsx'
import BottomSheet from '../responsive/BottomSheet.jsx'
import { renderMarkdown } from './markdown.js'
import { chatTime, displayTitle, groupByDate, QUICK_QUESTIONS } from './pulseShared.js'
import PulseTable from './PulseTable.jsx'
import ExcelButton from './ExcelButton.jsx'
import { answerBlocks } from './answerTables.js'
import { AttachButton, AttachChips } from './ComposerExtras.jsx'
import { VoiceSlot } from './VoiceSlot.jsx'
import { useAttachments } from './useAttachments.js'

// NavAI on phones (docs/responsive/PULSE_UI_FIX_PROMPT.md, mockups/pulse_fix_mockup.html). Layout only:
// AskFridoPage owns the conversations and passes the same handlers the laptop view uses.
//   header   green MobilePageHeader: 🕘 your chats · title · + New. One job per button, no ⋯ menu, and
//            nothing moves when a chat opens (⋯ used to appear where ✎ was, so a second tap on ✎ hit ⋯).
//   first    "Hi {first name}", quick questions by area (areas the user can open), recent questions
//   thread   question bubble right, answer full width; tables via PulseTable; Source line small grey
//   composer one line, grows to 5; Enter = new line, the button sends. While the keyboard is open the
//            bottom bar hides and the composer sits on the keyboard (visualViewport).
//   chats    BottomSheet: search, Today / Yesterday / Previous 7 days; tap = open; swipe left or
//            long-press = delete, then "Chat deleted · Undo" for 5 s.

const isError = m => m.role === 'assistant' && typeof m.id === 'string' && m.id.startsWith('err')
const LONG_PRESS_MS = 500
const SWIPE_W = 84

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

// "Suraj" from "Suraj Singh" (or from suraj.s@… when the profile has no name).
function firstName(name) {
  const n = (name || '').trim()
  const w = n.includes('@') ? n.split('@')[0].split(/[._-]/)[0] : n.split(/\s+/)[0]
  return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''
}

function Who({ model }) {
  return (
    <div className="pm-who">
      <i aria-hidden="true"><NavAIIcon size={12} /></i>NavAI
      {model && <span className="pm-badge">{model.includes('opus') ? '⚡ Opus' : '· Sonnet'}</span>}
    </div>
  )
}

function Answer({ msg, question, isAdmin }) {
  const [sqlOpen, setSqlOpen] = useState(false)
  const fbk = useFeedback()
  const showSql = isAdmin && ranQuery(msg.sql) // admins only, and only when a query really ran
  const blocks = useMemo(() => (msg.text ? answerBlocks(msg.text) : []), [msg.text])
  const tables = useMemo(() => blocks.filter(b => b.type === 'table'), [blocks])
  if (msg.thinking) return <div className="pm-ai"><Who /><div className="af-thinking"><span /><span /><span /></div></div>
  if (isError(msg)) return <div className="pm-ai"><Who /><div className="pm-err" role="alert">{msg.text}</div></div>
  return (
    <div className="pm-ai">
      <Who model={isAdmin ? msg.model : undefined} />
      {blocks.length > 0 && (
        <div className="af-answer pm-answer">
          {blocks.map((b, i) => b.type === 'table' ? <PulseTable key={i} headers={b.headers} rows={b.rows} title={b.title} keyHeader={msg.tableKeys?.[b.index]} />
            : b.type === 'src' ? <div key={i} className="pm-src">{b.text}</div>
            : <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(b.text) }} />)}
          {tables.length > 1 && <div className="pm-tbar nx-xl-all-bar"><ExcelButton tables={tables} all /></div>}
        </div>
      )}
      {msg.assumptions && <div className="af-assumptions">Assumptions: {msg.assumptions}</div>}
      {(msg.matchesDashboard || showSql) && (
        <div className="pm-acts">
          {msg.matchesDashboard && <span className="pm-act"><CheckCircle size={13} weight="fill" />Matches dashboard</span>}
          {showSql && (
            <button type="button" className="pm-act" aria-expanded={sqlOpen} onClick={() => setSqlOpen(o => !o)}>
              <Code size={13} />{sqlOpen ? 'Hide SQL' : 'Show SQL'}
            </button>
          )}
        </div>
      )}
      {sqlOpen && showSql && <pre className="pm-sql">{msg.sql}</pre>}
      {msg.text && (
        <button type="button" className="fb-report" data-testid="report-answer" onClick={() => fbk.open({ type: 'wrong_number', ai: { question, answer: msg.text } })}>
          <ThumbsDown size={14} /> Report this answer
        </button>
      )}
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

function FirstView({ name, areas, recent, onAsk, onFill, onOpen }) {
  const quick = QUICK_QUESTIONS.filter(x => !areas || areas[x.area])
  const first = firstName(name)
  return (
    <div className="pm-first">
      <h2 className="pm-hello">Hi{first ? ` ${first}` : ''} <span aria-hidden="true">👋</span></h2>
      <p className="pm-lede">Ask about sales, returns, logistics or inventory. Answers match the dashboard.</p>
      {quick.length > 0 && (
        <>
          <div className="pm-sh">Quick questions</div>
          <div className="pm-chips">
            {quick.map(x => (
              <button key={x.label} type="button" className="pm-chip" onClick={() => (x.fill ? onFill(x.q) : onAsk(x.q))}>
                <i>{x.tag}</i>{x.label}
              </button>
            ))}
          </div>
        </>
      )}
      {recent.length > 0 && (
        <>
          <div className="pm-sh">Recent</div>
          {recent.map(c => (
            <button key={c.id} type="button" className="pm-rec" onClick={() => onOpen(c.id)}>
              <span>{displayTitle(c)}</span><small>{chatTime(c)}</small>
            </button>
          ))}
        </>
      )}
    </div>
  )
}

function Composer({ onSend, disabled, onFocusChange, apiRef, canFiles }) {
  const ref = useRef(null)
  const [val, setVal] = useState('')
  const files = useAttachments(canFiles)
  const grow = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 130) + 'px' // 5 lines, then it scrolls inside
  }
  // focus(): + New and the Planning chip; fill(text): puts a question in the box for the user to finish.
  useEffect(() => {
    apiRef.current = {
      focus: () => ref.current?.focus(),
      fill: text => {
        setVal(text)
        const el = ref.current
        el?.focus()
        requestAnimationFrame(() => { grow(); el?.setSelectionRange(text.length, text.length) })
      },
    }
  })
  const submit = () => {
    if (disabled || !files.sendable) return // nothing is sent while a file is still being prepared or failed
    let text = val.trim()
    if (!text && files.items.length) text = 'Please analyse the attached file' + (files.items.length > 1 ? 's.' : '.')
    if (!text) return
    const bytes = files.payload(text.length)
    if (!bytes.complete) { files.setError('A file is not ready. Remove it or try again.'); return } // never send without an attached file
    if (bytes.tooBig) { files.setError(bytes.tooBig); return }
    const typed = val, sent = files.items
    setVal('')
    requestAnimationFrame(grow)
    files.detach()
    // A failed send (false) puts the question and the files back so the person can just tap Send again.
    Promise.resolve(onSend(text, bytes.data.length ? { attachments: bytes.data, chips: bytes.names } : undefined)).then(ok => {
      if (ok === false) {
        setVal(v => v || typed); requestAnimationFrame(grow)
        if (sent.length) files.restore(sent)
      } else files.release(sent)
    })
  }
  // Voice writes into the box only; the person edits it and taps Send.
  const getVal = useCallback(() => val, [val])
  const setFromVoice = useCallback(t => { setVal(t); requestAnimationFrame(grow) }, [])
  const canSend = !disabled && files.sendable && (val.trim() || files.items.length)
  return (
    <div className="pm-cmp">
      <AttachChips items={files.items} onRemove={files.remove} compact />
      <div className="pm-box">
        <textarea ref={ref} rows={1} value={val} placeholder="Ask a question…" aria-label="Ask a question" disabled={disabled}
          onChange={e => { setVal(e.target.value); grow() }} onFocus={() => onFocusChange(true)} onBlur={() => onFocusChange(false)} />
        {canFiles && <AttachButton onFiles={files.add} disabled={disabled} sheet />}
        <VoiceSlot getValue={getVal} setValue={setFromVoice} disabled={disabled} />
        <button type="button" className="pm-send" aria-label="Send" disabled={!canSend} onMouseDown={e => e.preventDefault()} onClick={submit}>
          <ArrowUp size={16} weight="bold" />
        </button>
      </div>
      {files.error && <div className="nx-err" role="alert">{files.error}</div>}
      <div className="pm-disc">NavAI can make mistakes. Verify key numbers.</div>
    </div>
  )
}

// One chat in "Your chats": tap opens it; drag left past 40px leaves the red Delete showing; a 500ms
// press (or the browser's long-press menu) asks to delete. touch-action: pan-y keeps vertical scrolling.
function ChatRow({ c, current, swiped, onSwipe, onOpen, onDelete, onLongPress }) {
  const [drag, setDrag] = useState(null)
  const st = useRef(null)
  const skipClick = useRef(false)
  const clear = () => { clearTimeout(st.current?.timer) }
  const down = e => {
    if (e.button > 0) return
    skipClick.current = false
    st.current = { x: e.clientX, y: e.clientY, base: swiped ? -SWIPE_W : 0, dragging: false,
      timer: setTimeout(() => { skipClick.current = true; st.current = null; onLongPress() }, LONG_PRESS_MS) }
  }
  const move = e => {
    const s = st.current
    if (!s) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (!s.dragging) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        s.dragging = true
        clear()
        e.currentTarget.setPointerCapture?.(e.pointerId)
      } else if (Math.abs(dy) > 8) { clear(); st.current = null; return } else return
    }
    setDrag(Math.max(-SWIPE_W - 30, Math.min(0, s.base + dx)))
  }
  const up = () => {
    const s = st.current
    clear()
    st.current = null
    if (s?.dragging) {
      skipClick.current = true
      onSwipe(drag != null ? drag < -40 : swiped)
      setDrag(null)
    }
  }
  const cancel = () => { clear(); st.current = null; setDrag(null) }
  const x = drag ?? (swiped ? -SWIPE_W : 0)
  return (
    <div className={`pm-hi${current ? ' on' : ''}`}>
      <button type="button" className="pm-hdel" tabIndex={x < 0 ? 0 : -1} aria-hidden={x < 0 ? undefined : 'true'}
        style={{ visibility: x < 0 ? 'visible' : 'hidden' }} onClick={onDelete}>Delete</button>
      <button type="button" className="pm-hin" aria-current={current ? 'true' : undefined}
        style={{ transform: x ? `translateX(${x}px)` : undefined, transition: drag != null ? 'none' : undefined }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
        onContextMenu={e => { e.preventDefault(); if (!skipClick.current) { clear(); st.current = null; skipClick.current = true; onLongPress() } }}
        onClick={() => {
          if (skipClick.current) { skipClick.current = false; return }
          if (swiped) onSwipe(false)
          else onOpen()
        }}>
        <span className="pm-hmain"><b>{displayTitle(c)}</b><small>{current ? 'Open now' : chatTime(c)}</small></span>
        <CaretRight size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

function ChatsSheet({ open, onClose, conversations, activeId, onOpen, onDelete }) {
  const [q, setQ] = useState('')
  const [swipedId, setSwipedId] = useState(null)
  const [askId, setAskId] = useState(null)
  const close = () => { setQ(''); setSwipedId(null); onClose() }
  const list = q.trim() ? conversations.filter(c => displayTitle(c).toLowerCase().includes(q.trim().toLowerCase())) : conversations
  const g = groupByDate(list)
  const asked = conversations.find(c => c.id === askId)
  const row = c => (
    <ChatRow key={c.id} c={c} current={c.id === activeId} swiped={swipedId === c.id}
      onSwipe={on => setSwipedId(on ? c.id : null)}
      onOpen={() => { onOpen(c.id); close() }}
      onDelete={() => { setSwipedId(null); onDelete(c.id) }}
      onLongPress={() => { setSwipedId(null); setAskId(c.id) }} />
  )
  const group = (label, items) => items.length > 0 && <div key={label}><div className="pm-sh">{label}</div>{items.map(row)}</div>
  return (
    <>
      <BottomSheet open={open} onClose={close} title="Your chats">
        <div className="pm-chats">
          <label className="pm-search">
            <MagnifyingGlass size={15} aria-hidden="true" />
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search chats" aria-label="Search chats" />
          </label>
          {group('Today', g.today)}{group('Yesterday', g.yesterday)}{group('Previous 7 days', g.week)}
          {list.length === 0 && <div className="pm-none">{conversations.length ? 'No chats found' : 'No chats yet. Ask a question to start one.'}</div>}
          {conversations.length > 0 && <div className="pm-hint">Tap to open · swipe left or long-press to delete</div>}
        </div>
      </BottomSheet>
      <BottomSheet open={open && !!asked} onClose={() => setAskId(null)} title={asked ? displayTitle(asked) : ''}>
        <div className="pm-confirm">
          <button type="button" onClick={() => setAskId(null)}>Cancel</button>
          <button type="button" className="pm-danger-fill" onClick={() => { const id = askId; setAskId(null); onDelete(id) }}>Delete chat</button>
        </div>
      </BottomSheet>
    </>
  )
}

// "Chat deleted · Undo" for 5 s, above the sheet and the composer.
function UndoToast({ toast, onUndo, onDone }) {
  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(onDone, 5000)
    return () => clearTimeout(t)
  }, [toast, onDone])
  if (!toast) return null
  return createPortal(
    <div className="pm-toast" role="status">
      <span>Chat deleted</span>
      <button type="button" onClick={onUndo}>Undo</button>
    </div>,
    document.body,
  )
}

export default function PulseMobile({ conversations, activeId, active, sending, userProfile, areas, canFiles, onSelect, onNew, onDelete, onRestore, onSend, onClarifyChoice }) {
  const [histOpen, setHistOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [focused, setFocused] = useState(false)
  const vp = useViewport(focused)
  const scroller = useRef(null)
  const composer = useRef(null)
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

  // Recent: the last 3 different questions.
  const recent = useMemo(() => {
    const seen = new Set(), out = []
    for (const c of conversations) {
      const k = displayTitle(c).toLowerCase()
      if (!c.messages?.length || seen.has(k)) continue
      seen.add(k)
      out.push(c)
      if (out.length === 3) break
    }
    return out
  }, [conversations])

  // + New: back to the first view (if not there already) and into the question box.
  const startNew = () => {
    if (activeId) onNew()
    composer.current?.focus()
  }
  const del = id => {
    const index = conversations.findIndex(c => c.id === id)
    if (index < 0) return
    setToast({ conv: conversations[index], index, wasOpen: id === activeId, at: Date.now() })
    onDelete(id)
  }
  const undo = () => {
    if (!toast) return
    onRestore(toast.conv, toast.index)
    if (toast.wasOpen) onSelect(toast.conv.id)
    setToast(null)
  }
  const hideToast = useMemo(() => () => setToast(null), [])

  const header = (
    <div className="topnav m-header" data-page="ask">
      <MobilePageHeader
        lead={<button type="button" className="mph-ib" aria-label="Your chats" onClick={() => setHistOpen(true)}><ClockCounterClockwise size={19} /></button>}
        title={inChat ? displayTitle(active) : 'NavAI'}
        right={<button type="button" className="pm-new" aria-label="New chat" onClick={startNew}><span><Plus size={14} weight="bold" aria-hidden="true" />New</span></button>}
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
            {messages.map((m, idx) => {
              if (m.role === 'user') return <div key={m.id} className="pm-me">{m.text}{m.files?.length ? <div className="nx-sent">{m.files.map((f, i) => <span key={i}>📎 {f.name}</span>)}</div> : null}</div>
              if (m.clarify) return <Clarify key={m.id} msg={m} onChoice={onClarifyChoice} />
              const q = [...messages.slice(0, idx)].reverse().find(x => x.role === 'user')?.text || ''
              return <Answer key={m.id} msg={m} question={q} isAdmin={userProfile?.isAdmin === true} />
            })}
          </div>
        ) : (
          <FirstView name={userProfile?.name} areas={areas} recent={recent} onAsk={onSend} onFill={t => composer.current?.fill(t)} onOpen={onSelect} />
        )}
      </div>
      <Composer onSend={onSend} disabled={sending} onFocusChange={setFocused} apiRef={composer} canFiles={canFiles} />
      <ChatsSheet open={histOpen} onClose={() => setHistOpen(false)} conversations={conversations} activeId={activeId}
        onOpen={onSelect} onDelete={del} />
      <UndoToast toast={toast} onUndo={undo} onDone={hideToast} />
    </div>
  )
}
