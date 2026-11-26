import { lazy, Suspense } from 'react'
import { isPhoneOrTablet } from './deviceKind.js'

// The 🎙 in the NavAI composer: laptop/desktop only. On a phone or tablet nothing is rendered and the voice module
// (speech code, language menu, messages) is never downloaded.
const VoiceButton = lazy(() => import('./VoiceButton.jsx'))
const hidden = isPhoneOrTablet()

export function VoiceSlot(props) {
  if (hidden) return null
  return <Suspense fallback={null}><VoiceButton {...props} /></Suspense>
}
