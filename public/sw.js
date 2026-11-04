// Frido Navigator service worker (installed app + browser). Deliberately minimal:
// - pages: always from the network; the offline page only when the network fails
// - /assets/* (hashed, never change): cached after the first load so the app opens fast
// - API calls, data JSON and Supabase: never touched, so numbers are always live
// To switch it off for everyone, replace this file with one that calls self.registration.unregister().
const VERSION = 'v1'
const SHELL = `shell-${VERSION}`
const ASSETS = `assets-${VERSION}`
const OFFLINE = '/offline.html'
const MAX_ASSETS = 80

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll([OFFLINE, '/icon-192.png'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== ASSETS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()))
})

async function trim(cache) {
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - MAX_ASSETS; i++) await cache.delete(keys[i])
}

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)))
    return
  }

  // The offline page's own icon must load while offline too.
  if (url.pathname === '/icon-192.png') {
    e.respondWith(fetch(req).catch(() => caches.match(req)))
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.open(ASSETS).then(async cache => {
      const hit = await cache.match(req)
      if (hit) return hit
      const res = await fetch(req)
      // A missing asset is rewritten to index.html with a 200 - never cache that as a script.
      if (res.ok && !(res.headers.get('content-type') || '').includes('text/html')) {
        cache.put(req, res.clone()).then(() => trim(cache))
      }
      return res
    }))
  }
})
