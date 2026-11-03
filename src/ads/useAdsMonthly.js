import { useEffect, useState } from 'react'
import { authFetch } from '../authFetch.js'

// Ads "Last 6 months" (ADS_MASTER_PLAN.md Part B §1.2): 5 full calendar months + the current month to
// yesterday, independent of the date picker. One POST /api/bq { adsMonthly } per session (sessionStorage).
const API = import.meta.env.VITE_API_URL || ''
const SS = 'ads.monthly.v1.'

export function sixMonthWindow(today = new Date()) {
  const y = new Date(today); y.setDate(y.getDate() - 1)
  const from = new Date(y.getFullYear(), y.getMonth() - 5, 1)
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const months = []
  for (let i = 0; i < 6; i++) { const d = new Date(from.getFullYear(), from.getMonth() + i, 1); months.push(iso(d).slice(0, 7)) }
  return { from: iso(from), to: iso(y), months, toDay: y.getDate(), daysInLast: new Date(y.getFullYear(), y.getMonth() + 1, 0).getDate() }
}

export function useAdsMonthly(enabled = true) {
  const win = sixMonthWindow()
  const key = SS + win.from + '|' + win.to
  const [state, setState] = useState(() => {
    try { const v = sessionStorage.getItem(key); if (v) return { status: 'ready', data: JSON.parse(v) } } catch { /* storage blocked */ }
    return { status: 'idle', data: null }
  })
  useEffect(() => {
    if (!enabled || state.status !== 'idle') return
    let gone = false
    authFetch(`${API}/api/bq`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adsMonthly: true, from: win.from, to: win.to }) })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(data => {
        if (gone) return
        try { sessionStorage.setItem(key, JSON.stringify(data)) } catch { /* quota */ }
        setState({ status: 'ready', data })
      })
      .catch(() => { if (!gone) setState({ status: 'error', data: null }) })
    return () => { gone = true }
  }, [enabled, key]) // eslint-disable-line react-hooks/exhaustive-deps -- key captures the window
  return { ...state, win }
}
