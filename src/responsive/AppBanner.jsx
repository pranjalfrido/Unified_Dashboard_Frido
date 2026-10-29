import { useEffect, useState } from 'react'
import { C } from '../utils.js'
import { isStandalone, isIOS, subscribe, canPromptInstall, promptInstall, hasUpdate } from '../pwa.js'

// Phones only (rendered next to the bottom bar). In the browser: "Install the Frido app" — Android opens
// the browser's install dialog, iPhone gets the Share → Add to Home Screen steps. "Not now" hides it
// for 7 days. In the installed app: "New version available · Refresh" after a deploy.
const KEY = 'frido.installDismissedAt'
const WEEK = 7 * 24 * 60 * 60 * 1000
// Same rule as the phone layout in index.css (the bottom bar is mounted on laptops too, just hidden).
const PHONE = '(max-width:768px), (orientation:landscape) and (max-height:500px) and (pointer:coarse)'
const isPhone = () => window.matchMedia?.(PHONE).matches === true
const dismissedRecently = () => { try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < WEEK } catch { return false } }

const ShareIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: '-2px' }}>
    <path d="M12 3v12" /><path d="M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
)

export default function AppBanner() {
  const [, tick] = useState(0)
  const [hidden, setHidden] = useState(dismissedRecently)
  const [phone, setPhone] = useState(isPhone)
  useEffect(() => subscribe(() => tick(n => n + 1)), [])
  useEffect(() => {
    const mq = window.matchMedia?.(PHONE)
    if (!mq) return
    const on = () => setPhone(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  if (!phone) return null
  const standalone = isStandalone()
  const update = standalone && hasUpdate()
  const ios = !standalone && isIOS()
  const android = !standalone && canPromptInstall()
  if (!update && (hidden || (!ios && !android))) return null

  const notNow = () => { try { localStorage.setItem(KEY, String(Date.now())) } catch { /* private mode */ } setHidden(true) }
  const btn = { font: 'inherit', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 10, minHeight: 36, padding: '0 14px', cursor: 'pointer' }

  return (
    <div role="region" aria-label={update ? 'App update' : 'Install the app'} className="app-banner"
      style={{ position: 'fixed', left: 'max(10px, var(--safe-left))', right: 'max(10px, var(--safe-right))', bottom: 'calc(var(--bot, 48px) + var(--safe-bottom) + 10px)',
        zIndex: C.z.toast, background: '#fff', border: '1px solid #dfe6e1', borderRadius: 14, boxShadow: '0 10px 28px -8px rgba(20,50,35,.35)',
        padding: '12px 12px 12px 14px', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font)', color: '#1c2420' }}>
      <img src="/icon-192.png" alt="" width="36" height="36" style={{ flex: '0 0 auto', borderRadius: 9 }} />
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.4 }}>
        {update ? <><b>New version available</b><div style={{ color: '#4B534F' }}>Refresh to get the latest dashboard.</div></>
          : ios ? <><b>Install the Frido app</b><div style={{ color: '#4B534F' }}>Tap Share {ShareIcon} then <b>Add to Home Screen</b>.</div></>
          : <><b>Install the Frido app</b><div style={{ color: '#4B534F' }}>Opens full screen from your home screen.</div></>}
      </div>
      {update
        ? <button type="button" style={{ ...btn, background: '#1f5a3d', color: '#fff' }} onClick={() => location.reload()}>Refresh</button>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 auto' }}>
            {android && <button type="button" style={{ ...btn, background: '#1f5a3d', color: '#fff' }} onClick={() => promptInstall().then(ok => { if (!ok) notNow() })}>Install</button>}
            <button type="button" style={{ ...btn, background: 'transparent', color: '#4B534F', fontWeight: 600, minHeight: 30 }} onClick={notNow}>Not now</button>
          </div>}
    </div>
  )
}
