import { useEffect, useRef, useState } from 'react'
import { Microphone, MicrophoneSlash, Paperclip, X, CaretDown, FileXls, FilePdf, FileDoc, FileImage, FileText } from '@phosphor-icons/react'
import { useVoiceInput, VOICE_LANGS } from './useVoiceInput.js'
import { ACCEPT, fmtSize } from './attachments.js'

// Voice (mic) and file (paperclip) pieces shared by the laptop and phone NavAI composers.

// ── Voice ──────────────────────────────────────────────────────────────────────
// Mic button + small language menu (the caret, or a long press on the mic). Renders nothing where the browser
// has no speech recognition. Text goes into the box through setValue; nothing is ever sent from here.
export function VoiceButton({ getValue, setValue, disabled, className = '' }) {
  const v = useVoiceInput({ getValue, setValue })
  const [menu, setMenu] = useState(false)
  const press = useRef(null)
  const wrap = useRef(null)
  useEffect(() => {
    if (!menu) return
    const off = e => { if (!wrap.current?.contains(e.target)) setMenu(false) }
    document.addEventListener('pointerdown', off)
    return () => document.removeEventListener('pointerdown', off)
  }, [menu])
  if (!v.supported) return null
  const startPress = () => { press.current = setTimeout(() => { press.current = 'long'; setMenu(true) }, 500) }
  const endPress = () => { if (press.current && press.current !== 'long') clearTimeout(press.current) }
  const click = () => { if (press.current === 'long') { press.current = null; return } press.current = null; v.toggle() }
  const langLabel = VOICE_LANGS.find(l => l.code === v.lang)?.label
  return (
    <div className={`nx-voice ${className}`} ref={wrap}>
      {v.listening && <span className="nx-listening" role="status">Listening…</span>}
      <button type="button" className={`nx-icon-btn nx-mic${v.listening ? ' on' : ''}`} aria-label={v.listening ? 'Stop listening' : 'Speak your question'} aria-pressed={v.listening}
        title={`Voice (${langLabel}). Press and hold, or use the arrow, to change language.`} disabled={disabled}
        onMouseDown={e => { e.preventDefault(); startPress() }} onMouseUp={endPress} onMouseLeave={endPress}
        onTouchStart={startPress} onTouchEnd={endPress} onContextMenu={e => e.preventDefault()} onClick={click}>
        {v.error ? <MicrophoneSlash size={17} /> : <Microphone size={17} weight={v.listening ? 'fill' : 'regular'} />}
      </button>
      <button type="button" className="nx-caret" aria-label="Voice language" aria-expanded={menu} onMouseDown={e => e.preventDefault()} onClick={() => setMenu(m => !m)}><CaretDown size={10} weight="bold" /></button>
      {menu && (
        <div className="nx-menu" role="menu">
          {VOICE_LANGS.map(l => (
            <button key={l.code} type="button" role="menuitemradio" aria-checked={v.lang === l.code} className={v.lang === l.code ? 'sel' : ''}
              onClick={() => { v.setLang(l.code); setMenu(false) }}>{l.label} <small>{l.code}</small></button>
          ))}
        </div>
      )}
      {v.error && <div className="nx-voice-err" role="alert">{v.error}</div>}
    </div>
  )
}

const ICON = { image: FileImage, pdf: FilePdf, sheet: FileXls, docx: FileDoc }

export function AttachChips({ items, onRemove, compact }) {
  if (!items.length) return null
  return (
    <div className={`nx-chips${compact ? ' compact' : ''}`} aria-label="Attached files">
      {items.map(i => {
        const Icon = ICON[i.kind] || FileText
        const busy = i.status === 'converting', bad = i.status === 'error'
        return (
          <span className={`nx-chip${busy ? ' busy' : ''}${bad ? ' err' : ''}`} key={i.id} title={bad ? i.error : i.name} data-status={i.status}>
            {i.preview && !bad ? <img src={i.preview} alt="" className="nx-thumb" /> : <Icon size={16} />}
            <span className="nx-chip-name">{i.name}</span>
            {busy && <small className="nx-chip-state" role="status">Preparing file…</small>}
            {bad && <small className="nx-chip-error" role="alert">{i.error}</small>}
            {!busy && !bad && <small>{fmtSize(i.size)}</small>}
            <button type="button" aria-label={`Remove ${i.name}`} onMouseDown={e => e.preventDefault()} onClick={() => onRemove(i.id)}><X size={11} weight="bold" /></button>
          </span>
        )
      })}
    </div>
  )
}

// 📎 "Upload or add files" (Ctrl+U on a laptop). Drag-and-drop and paste are wired by the composer through useFileDrop.
export function AttachButton({ onFiles, disabled, shortcut }) {
  const input = useRef(null)
  useEffect(() => {
    if (!shortcut || disabled) return
    const key = e => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'u') { e.preventDefault(); input.current?.click() } }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [shortcut, disabled])
  return (
    <>
      <button type="button" className="nx-icon-btn nx-attach" aria-label="Upload or add files" title={shortcut ? 'Upload or add files (Ctrl+U)' : 'Upload or add files'} disabled={disabled}
        onMouseDown={e => e.preventDefault()} onClick={() => input.current?.click()}>
        <Paperclip size={17} />
      </button>
      <input ref={input} type="file" multiple hidden accept={ACCEPT} data-testid="nx-file-input"
        onChange={e => { onFiles(e.target.files); e.target.value = '' }} />
    </>
  )
}
