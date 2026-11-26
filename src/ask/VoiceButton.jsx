import { useEffect, useRef, useState } from 'react'
import { Microphone, MicrophoneSlash, CaretDown } from '@phosphor-icons/react'
import { useVoiceInput, VOICE_LANGS } from './useVoiceInput.js'

// ── Voice ──────────────────────────────────────────────────────────────────────
// Mic button + small language menu (the caret, or a long press on the mic). Renders nothing where the browser
// has no speech recognition. Text goes into the box through setValue; nothing is ever sent from here.
export default function VoiceButton({ getValue, setValue, disabled, className = '' }) {
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
      <button type="button" className={`nx-icon-btn nx-mic${v.listening ? ' on' : ''}`} aria-label={v.listening ? 'Stop listening' : 'Speak your question'} aria-pressed={v.listening} aria-busy={v.starting || undefined}
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
