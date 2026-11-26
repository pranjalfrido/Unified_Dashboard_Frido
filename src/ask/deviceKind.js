// Phones and tablets get no voice button in NavAI (the browsers' speech recognition is not reliable there).
// Deliberately imports nothing: the speech code is only downloaded where the button is shown (VoiceButton is lazy-loaded).
// A touchscreen laptop is not matched: it has a mouse/trackpad, so (hover: none) is false.
export function isPhoneOrTablet() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true // iPadOS reports itself as a Mac
  try { return !!window.matchMedia?.('(pointer: coarse) and (hover: none)').matches } catch { return false }
}
