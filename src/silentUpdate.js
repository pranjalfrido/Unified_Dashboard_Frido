// Silent updates. Replaces the old "New version available · Refresh" popup.
//
// When a new build is live we do NOT ask. We reload ourselves, but only at a moment where nothing can be lost:
//   1. the user switches to another page of the dashboard (the new page simply loads fresh), or
//   2. the app comes back to the screen after 5+ minutes in the background.
// Never while the user is typing, a NavAI answer is loading, or an upload/export is running (see isBusy).
// Safety net: if a chunk of the old build can no longer be fetched ("Failed to fetch dynamically imported module"),
// reload once - a second failure within two minutes is NOT retried (no reload loops) and the page shows a message.
//
// Plain browser code on purpose (no React): it is started from pwa.js before React mounts, and the same file is
// exercised by scripts/test-silent-update.mjs in a real browser.

const BACKGROUND_MS = 5 * 60 * 1000   // away from the screen at least this long -> safe to reload when back
const CHECK_EVERY_MS = 30 * 60 * 1000
const MIN_CHECK_GAP_MS = 60 * 1000
const TYPING_MS = 15 * 1000           // an input event this recently counts as "typing"
const CHUNK_GUARD_MS = 2 * 60 * 1000  // one automatic chunk-error reload per this window
const SNAP_TTL_MS = 2 * 60 * 1000
const SNAP_KEY = 'frido.reloadSnapshot'
const CHUNK_KEY = 'frido.chunkReloadAt'

const store = (kind => { try { return window[kind] } catch { return null } })
const session = () => store('sessionStorage')

// ---- "is it safe to reload right now?" -------------------------------------------------------------------------
const busy = new Set()
// Long-running work (NavAI answer loading, file reading, export, feedback submit) flags itself here.
export function setBusy(key, on) { if (on) busy.add(key); else busy.delete(key) }

let lastInputAt = 0
const TEXT_INPUT = /^(text|search|email|number|tel|url|password|date|datetime-local|month|time|week)?$/i
export function isTyping() {
  const el = document.activeElement
  if (el && el !== document.body) {
    const tag = el.tagName
    if (tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true
    if (tag === 'INPUT' && TEXT_INPUT.test(el.getAttribute('type') || '')) return true
  }
  if (Date.now() - lastInputAt < TYPING_MS) return true
  // An unsent draft (NavAI box, feedback text) is kept even when the box lost focus.
  for (const t of document.querySelectorAll('textarea')) if (t.value && t.value.trim()) return true
  return false
}
export const isBusy = () => busy.size > 0 || isTyping()

// ---- keep the page's state across the reload -----------------------------------------------------------------------
// The URL already keeps the page. The top-level filters are state in memory, so they are saved here just before a
// silent reload and put back on the next load. (NavAI chats are already kept in localStorage by the chat itself.)
let snapshotFn = null
export const registerSnapshot = fn => { snapshotFn = fn }
function saveSnapshot() {
  try { const s = snapshotFn && snapshotFn(); if (s) session()?.setItem(SNAP_KEY, JSON.stringify({ at: Date.now(), ...s })) } catch { /* storage blocked: nothing to keep */ }
}
export function takeSnapshot() {
  try {
    const raw = session()?.getItem(SNAP_KEY)
    if (!raw) return null
    session().removeItem(SNAP_KEY)
    const s = JSON.parse(raw)
    return s && Date.now() - s.at < SNAP_TTL_MS ? s : null
  } catch { return null }
}

// ---- is there a newer build? ---------------------------------------------------------------------------------------
// Compare the entry script of the live index.html with the one this page loaded. The entry file name is a hash of
// the code, so it changes only when the code does (the commit id is NOT baked into the bundle any more - see
// vite.config.js; it used to be, which made every hourly data-cache commit look like a new version).
let updateReady = false
export const hasUpdate = () => updateReady
const entryOf = html => (html.match(/\/assets\/index-[\w-]+\.js/) || [])[0]
let lastCheck = 0
export async function checkForUpdate(force = false) {
  if (updateReady) return true
  if (!force && Date.now() - lastCheck < MIN_CHECK_GAP_MS) return false
  lastCheck = Date.now()
  try {
    const mine = entryOf(document.documentElement.innerHTML)
    const live = entryOf(await (await fetch('/', { cache: 'no-store' })).text())
    if (mine && live && mine !== live) updateReady = true
  } catch { /* offline: try again later */ }
  return updateReady
}

const doReload = to => { saveSnapshot(); if (to) location.assign(to); else location.reload() }

// 1) Called by the app on every page switch (path + search of the page being opened).
export function onPageSwitch(to) {
  if (updateReady && !isBusy()) doReload(to)
}

// 2) Called when the app returns to the screen.
export async function onBackToScreen(hiddenForMs) {
  if (hiddenForMs < BACKGROUND_MS) { checkForUpdate(); return }
  await checkForUpdate(true)
  if (updateReady && !isBusy()) doReload()
}

// ---- chunk-load failures (an old page asking for files of a build that is gone) ----------------------------------
const CHUNK_RE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk/i
export const isChunkError = e => CHUNK_RE.test(String((e && (e.message || e.reason?.message || e.reason)) || e || ''))

let notice = null
function showNotice() {
  if (notice || typeof document === 'undefined') return
  notice = document.createElement('div')
  notice.setAttribute('role', 'alert')
  notice.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;background:#fff;color:#1c2420;border:1px solid #dfe6e1;border-radius:12px;padding:12px 14px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 10px 28px -8px rgba(20,50,35,.35);display:flex;gap:12px;align-items:center'
  notice.innerHTML = '<span style="flex:1">This page could not finish loading. Reload to get the latest version.</span>'
  const b = document.createElement('button')
  b.type = 'button'; b.textContent = 'Reload'
  b.style.cssText = 'font:inherit;font-weight:700;border:0;border-radius:10px;min-height:36px;padding:0 14px;background:#1f5a3d;color:#fff;cursor:pointer'
  b.onclick = () => location.reload()
  notice.appendChild(b)
  document.body.appendChild(notice)
}

// Returns true when it reloaded. The guard lives in sessionStorage so it survives the reload it causes.
export function reloadOnceForChunkError() {
  try {
    const last = Number(session()?.getItem(CHUNK_KEY) || 0)
    if (last && Date.now() - last < CHUNK_GUARD_MS) { showNotice(); return false }
    session()?.setItem(CHUNK_KEY, String(Date.now()))
  } catch { /* storage blocked: reload once anyway, the guard cannot persist so show the notice next time instead */ }
  location.reload()
  return true
}

// A file upload is a fetch whose body is a File / Blob / FormData: hold updates until it settles. (Ordinary data
// requests are not held, or a page that is still loading would block every update.)
function watchUploads() {
  const realFetch = window.fetch
  if (!realFetch || realFetch.__silentUpdate) return
  let n = 0
  const wrapped = function (input, init) {
    const b = init && init.body
    const upload = typeof FormData !== 'undefined' && (b instanceof FormData || (typeof Blob !== 'undefined' && b instanceof Blob))
    if (!upload) return realFetch.apply(this, arguments)
    const key = 'upload-' + (++n)
    setBusy(key, true)
    return realFetch.apply(this, arguments).finally(() => setBusy(key, false))
  }
  wrapped.__silentUpdate = true
  window.fetch = wrapped
}

export function startSilentUpdates({ prod = true } = {}) {
  document.addEventListener('input', () => { lastInputAt = Date.now() }, true)
  watchUploads()

  // Vite fires this when a dynamic import's preload fails; the other two catch plain import() rejections.
  window.addEventListener('vite:preloadError', e => { e.preventDefault?.(); reloadOnceForChunkError() })
  window.addEventListener('unhandledrejection', e => { if (isChunkError(e.reason)) { e.preventDefault?.(); reloadOnceForChunkError() } })
  window.addEventListener('error', e => { if (isChunkError(e.message || e.error)) reloadOnceForChunkError() })

  if (!prod) return
  let hiddenAt = 0
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
    onBackToScreen(hiddenAt ? Date.now() - hiddenAt : 0)
  })
  window.addEventListener('load', () => setTimeout(() => checkForUpdate(true), 15 * 1000))
  setInterval(() => { if (document.visibilityState === 'visible') checkForUpdate() }, CHECK_EVERY_MS)
}
