// Installed-app support (public/manifest.webmanifest, public/sw.js). Imported once from main.jsx so the
// browser's install offer is caught before React mounts; AppBanner.jsx reads the state below.

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

// A new deploy while the installed app stays open: there is no reload button, so compare the entry
// script of the live index.html with the one this page loaded and offer a refresh when they differ.
let updateReady = false
export const hasUpdate = () => updateReady
const entryOf = html => (html.match(/\/assets\/index-[\w-]+\.js/) || [])[0]
let lastCheck = 0
let hiddenAt = 0
async function checkForUpdate(force = false) {
  if (updateReady || document.visibilityState !== 'visible') return
  if (!force && Date.now() - lastCheck < 60 * 1000) return // at most once a minute
  lastCheck = Date.now()
  try {
    const mine = entryOf(document.documentElement.innerHTML)
    const live = entryOf(await (await fetch('/', { cache: 'no-store' })).text())
    if (mine && live && mine !== live) { updateReady = true; emit() }
  } catch { /* offline: try again later */ }
}

if (import.meta.env.PROD) {
  if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').then(r => r.update()).catch(() => {}) })
  // Installed app AND ordinary browser tabs: a phone keeps the old page alive in the background for days, so a new
  // deploy (renamed text, new icon) never shows until someone reloads. Check on load, every time the app comes back
  // to the foreground, and every 30 minutes; the banner offers "Refresh". After 10+ minutes in the background the
  // page reloads by itself when it comes back with an update waiting (nothing is mid-way then).
  window.addEventListener('load', () => setTimeout(() => checkForUpdate(true), 15 * 1000))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
    checkForUpdate().then(() => { if (updateReady && hiddenAt && Date.now() - hiddenAt > 10 * 60 * 1000) location.reload() })
  })
  setInterval(checkForUpdate, 30 * 60 * 1000)
}
