// Installed-app support (public/manifest.webmanifest, public/sw.js). Imported once from main.jsx so the
// browser's install offer is caught before React mounts; AppBanner.jsx reads the state below.
import { startSilentUpdates } from './silentUpdate.js'

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

// iPhone / iPad (iPadOS reports itself as a Mac with touch). Safari has no install API there.
export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

let deferred = null
const subs = new Set()
const emit = () => subs.forEach(fn => fn())
export const subscribe = fn => { subs.add(fn); return () => subs.delete(fn) }
export const canPromptInstall = () => !!deferred

// Android Chrome / Edge / Samsung: keep the offer and show our own card instead of the mini-infobar.
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; emit() })
window.addEventListener('appinstalled', () => { deferred = null; emit() })

export async function promptInstall() {
  if (!deferred) return false
  const e = deferred
  deferred = null
  e.prompt()
  const { outcome } = await e.userChoice
  emit()
  return outcome === 'accepted'
}

// New deploys are applied silently (no popup): see silentUpdate.js. Started once here, before React mounts.
startSilentUpdates({ prod: import.meta.env.PROD })

if (import.meta.env.PROD) {
  if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').then(r => r.update()).catch(() => {}) })
}
