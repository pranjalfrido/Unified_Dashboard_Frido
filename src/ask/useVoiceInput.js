import { useCallback, useEffect, useRef, useState } from 'react'

// Voice input for the NavAI question box, using the browser's own speech recognition (Web Speech API).
// No paid service and nothing sent by us: the browser does the recognising. Text goes into the box only; it is
// never sent automatically. The caller supplies getValue/setValue for its own text box.

export const VOICE_LANGS = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'Hindi' },
]
const LANG_KEY = 'navai_voice_lang'
export const SILENCE_MS = 3000
export const VOICE_DENIED_MESSAGE = 'Allow microphone access to use voice'

export function speechRecognitionClass() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}
// Hide the mic where the browser can't do it (some iPhone Safari versions): never show a broken button.
export const voiceSupported = () => !!speechRecognitionClass()

export function readVoiceLang() {
  try {
    const v = localStorage.getItem(LANG_KEY)
    return VOICE_LANGS.some(l => l.code === v) ? v : 'en-IN'
  } catch { return 'en-IN' }
}
function saveVoiceLang(code) { try { localStorage.setItem(LANG_KEY, code) } catch { /* private mode: fine */ } }

export function useVoiceInput({ getValue, setValue }) {
  const [supported] = useState(voiceSupported)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const [lang, setLangState] = useState(readVoiceLang)
  const rec = useRef(null)
  const timer = useRef(null)
  const base = useRef('')
  const io = useRef({ getValue, setValue })
  useEffect(() => { io.current = { getValue, setValue } })

  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  const stop = useCallback(() => {
    clearTimer()
    try { rec.current?.stop() } catch { /* already stopped */ }
  }, [])
  const armSilence = useCallback(() => { clearTimer(); timer.current = setTimeout(stop, SILENCE_MS) }, [stop])

  const start = useCallback(() => {
    const Rec = speechRecognitionClass()
    if (!Rec || rec.current) return
    setError('')
    const r = new Rec()
    r.lang = lang
    r.continuous = true
    r.interimResults = true
    const before = io.current.getValue() || ''
    base.current = before && !/\s$/.test(before) ? before + ' ' : before
    r.onresult = e => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
      io.current.setValue(base.current + text.trimStart())
      armSilence()
    }
    r.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError(VOICE_DENIED_MESSAGE)
      else if (e.error !== 'no-speech' && e.error !== 'aborted') setError('Voice input stopped. Try again.')
    }
    r.onend = () => { clearTimer(); rec.current = null; setListening(false) }
    rec.current = r
    try { r.start(); setListening(true); armSilence() } catch { rec.current = null; setListening(false) }
  }, [lang, armSilence])

  const toggle = useCallback(() => { if (rec.current) stop(); else start() }, [start, stop])
  const setLang = useCallback(code => {
    if (!VOICE_LANGS.some(l => l.code === code)) return
    saveVoiceLang(code); setLangState(code)
    if (rec.current) stop()
  }, [stop])

  useEffect(() => () => { clearTimer(); try { rec.current?.abort() } catch { /* gone */ } rec.current = null }, [])
  return { supported, listening, error, lang, setLang, toggle, stop, clearError: () => setError('') }
}
