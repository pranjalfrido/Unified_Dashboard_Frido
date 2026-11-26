import { useCallback, useEffect, useRef, useState } from 'react'

// Voice input for the NavAI question box, using the browser's own speech recognition (Web Speech API).
// No paid service and nothing sent by us: the browser does the recognising. Text goes into the box only; it is
// never sent automatically. The caller supplies getValue/setValue for its own text box.
//
// Phones (26 Nov 2026 reports):
//  - "Listening…" and the red mic show only after the browser says the mic really started (onstart / onaudiostart).
//    A permission refusal, or an Android block (e.g. a floating button on screen), never leaves a red mic behind.
//  - Every error resets the button at once (onend does not always fire after an error).
//  - iPhone Safari: start() is called straight from the tap (no await/timer before it: iOS needs the gesture),
//    one utterance at a time (continuous = false) and restarted after each result until the person taps stop or 3 s of
//    silence. If no text arrives within 6 s the person is told to use the keyboard's own 🎙.
//  - iPhone Chrome / Firefox / Edge: the speech engine does not work inside those apps, so the tap explains that.

export const VOICE_LANGS = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'Hindi' },
]
const LANG_KEY = 'navai_voice_lang'
export const SILENCE_MS = 3000
export const NO_TEXT_MS = 6000       // iPhone Safari: nothing heard after "Listening…" this long -> keyboard fallback
export const START_TIMEOUT_MS = 8000 // the mic never reported starting (no onstart, no error) -> reset
export const VOICE_DENIED_MESSAGE = 'Microphone blocked. Close any floating buttons on your screen, then allow the microphone for this site in Chrome settings.'
export const VOICE_DENIED_IOS_MESSAGE = 'Microphone blocked. Allow the microphone for this site in Settings > Safari, then try again.'
export const VOICE_IOS_APP_MESSAGE = 'Voice works in Safari on iPhone. Or tap the 🎙 on your keyboard.'
export const VOICE_IOS_NO_TEXT_MESSAGE = "Voice isn't working on this phone. Tap the 🎙 on your keyboard instead."
export const VOICE_NO_MIC_MESSAGE = 'No microphone found on this phone.'
export const VOICE_NETWORK_MESSAGE = 'Voice needs an internet connection. Check your network and try again.'
export const VOICE_GENERIC_MESSAGE = 'Voice input stopped. Try again.'

const ua = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent || '')
export function isIOS(agent = ua()) {
  if (/iPhone|iPad|iPod/.test(agent)) return true
  return /Macintosh/.test(agent) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1 // iPadOS asks for a desktop site
}
// Chrome / Firefox / Edge / Opera on iPhone are Safari's engine inside another app: no usable speech recognition.
export const isIOSThirdPartyBrowser = (agent = ua()) => isIOS(agent) && /CriOS|FxiOS|EdgiOS|OPiOS/.test(agent)

export function speechRecognitionClass() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}
// Hide the mic where the browser can't do it: never show a broken button. (iPhone Chrome keeps the button, to explain.)
export const voiceSupported = () => !!speechRecognitionClass() || isIOSThirdPartyBrowser()

export function readVoiceLang() {
  try {
    const v = localStorage.getItem(LANG_KEY)
    return VOICE_LANGS.some(l => l.code === v) ? v : 'en-IN'
  } catch { return 'en-IN' }
}
function saveVoiceLang(code) { try { localStorage.setItem(LANG_KEY, code) } catch { /* private mode: fine */ } }

// error code -> message ('' = just reset the button, nothing to say)
export function voiceErrorMessage(code, ios = false) {
  switch (code) {
    case 'not-allowed': case 'service-not-allowed': return ios ? VOICE_DENIED_IOS_MESSAGE : VOICE_DENIED_MESSAGE
    case 'audio-capture': return VOICE_NO_MIC_MESSAGE
    case 'network': return VOICE_NETWORK_MESSAGE
    case 'no-speech': case 'aborted': return ''
    default: return VOICE_GENERIC_MESSAGE
  }
}

export function useVoiceInput({ getValue, setValue }) {
  const [supported] = useState(voiceSupported)
  const [listening, setListening] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [lang, setLangState] = useState(readVoiceLang)
  const rec = useRef(null)
  const timer = useRef(null)
  const startTimer = useRef(null)
  const base = useRef('')            // text in the box before this utterance (grows as iPhone utterances are committed)
  const gotText = useRef(false)
  const wanted = useRef(false)       // iPhone: the person has not tapped stop yet, so restart after each utterance
  const io = useRef({ getValue, setValue })
  const beginRef = useRef(null)      // begin() calls itself to restart on iPhone
  useEffect(() => { io.current = { getValue, setValue } })

  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  const clearStartTimer = () => { if (startTimer.current) { clearTimeout(startTimer.current); startTimer.current = null } }
  // Back to the idle button, whatever state we were in. The old instance is dropped so late events from it are ignored.
  const reset = useCallback(() => {
    clearTimer(); clearStartTimer()
    wanted.current = false
    const r = rec.current
    rec.current = null
    if (r) { try { r.abort() } catch { /* already gone */ } }
    setListening(false); setStarting(false)
  }, [])
  const stop = useCallback(() => {
    clearTimer(); clearStartTimer()
    wanted.current = false
    const r = rec.current
    if (!r) { setListening(false); setStarting(false); return }
    try { r.stop() } catch { /* already stopped */ }
    // stop() normally ends with onend; if the browser never says so, do not leave the button red.
    setTimeout(() => { if (rec.current === r) { rec.current = null; setListening(false); setStarting(false) } }, 1500)
  }, [])
  const armSilence = useCallback(() => { clearTimer(); timer.current = setTimeout(stop, SILENCE_MS) }, [stop])

  // Creates and starts ONE recognition. Called from the tap handler itself (and, on iPhone, from onend to continue).
  const begin = useCallback((ios, language) => {
    const Rec = speechRecognitionClass()
    if (!Rec) return false
    const r = new Rec()
    r.lang = language
    r.continuous = !ios        // iPhone Safari: one utterance at a time, restarted below
    r.interimResults = true
    const live = () => rec.current === r
    const markStarted = () => {
      if (!live()) return
      clearStartTimer()
      setStarting(false); setListening(true)
    }
    r.onstart = markStarted
    r.onaudiostart = markStarted
    r.onresult = e => {
      if (!live()) return
      markStarted()
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
      text = text.trimStart()
      if (text) gotText.current = true
      io.current.setValue(base.current + text)
      const last = e.results[e.results.length - 1]
      if (ios && last?.isFinal && text) base.current = base.current + text.trimEnd() + ' ' // keep it; the next utterance adds after it
      armSilence()
    }
    r.onerror = e => {
      if (!live()) return
      const msg = voiceErrorMessage(e?.error, ios)
      if (msg) setError(msg)
      reset() // onend does not always follow an error: never stay red
    }
    r.onend = () => {
      if (!live()) return
      if (ios && wanted.current) {
        // iPhone: carry on listening until the person taps stop, 3 s pass without speech, or 6 s pass with no text at all
        // (the timers armed by start()/onresult keep running across the restart)
        rec.current = null
        if (!beginRef.current(true, language)) { wanted.current = false; clearTimer(); clearStartTimer(); setListening(false); setStarting(false) }
        return
      }
      rec.current = null
      clearTimer(); clearStartTimer()
      setListening(false); setStarting(false)
    }
    rec.current = r
    try { r.start() } catch { rec.current = null; return false }
    return true
  }, [armSilence, reset])
  useEffect(() => { beginRef.current = begin })

  const start = useCallback(() => {
    // No await, promise or timer before r.start(): iPhone Safari only listens when start() runs inside the tap.
    if (isIOSThirdPartyBrowser()) { setError(VOICE_IOS_APP_MESSAGE); return }
    if (!speechRecognitionClass()) return
    if (rec.current) reset() // only one recognition at a time
    setError('')
    const ios = isIOS()
    const before = io.current.getValue() || ''
    base.current = before && !/\s$/.test(before) ? before + ' ' : before
    gotText.current = false
    wanted.current = true
    if (!begin(ios, lang)) { wanted.current = false; setError(VOICE_GENERIC_MESSAGE); return }
    setStarting(true) // "Listening…" waits for onstart/onaudiostart
    clearTimer()
    if (ios) {
      // no text at all for 6 s -> keyboard fallback (onresult replaces this with the 3 s silence timer)
      timer.current = setTimeout(() => { reset(); setError(VOICE_IOS_NO_TEXT_MESSAGE) }, NO_TEXT_MS)
    } else {
      armSilence()
    }
    // the mic never reported starting and gave no error: reset instead of waiting forever
    clearStartTimer()
    startTimer.current = setTimeout(() => {
      if (rec.current) { reset(); setError(ios ? VOICE_IOS_NO_TEXT_MESSAGE : VOICE_GENERIC_MESSAGE) }
    }, START_TIMEOUT_MS)
  }, [lang, begin, armSilence, reset])

  const toggle = useCallback(() => { if (rec.current) stop(); else start() }, [start, stop])
  const setLang = useCallback(code => {
    if (!VOICE_LANGS.some(l => l.code === code)) return
    saveVoiceLang(code); setLangState(code)
    if (rec.current) stop()
  }, [stop])

  useEffect(() => () => { clearTimer(); clearStartTimer(); wanted.current = false; try { rec.current?.abort() } catch { /* gone */ } rec.current = null }, [])
  return { supported, listening, starting, error, lang, setLang, toggle, stop, clearError: () => setError('') }
}
