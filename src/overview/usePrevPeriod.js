import { useEffect, useState } from 'react'
import { SHOW_PERIOD_DELTAS } from '../config/flags.js'

// Previous equal-length period: the same rule api/bq.js uses for prevRev (Gross Revenue's existing
// "Prev Period"): ends the day before `start`, same number of days. 1–30 Sept → 2–31 Aug.
export function prevRange(start, end) {
  if (!start || !end) return null
  const s = new Date(`${start}T00:00:00Z`), e = new Date(`${end}T00:00:00Z`)
  const days = Math.round((e - s) / 86400000) + 1
  const pe = new Date(s); pe.setUTCDate(pe.getUTCDate() - 1)
  const ps = new Date(pe); ps.setUTCDate(ps.getUTCDate() - days + 1)
  return { start: ps.toISOString().slice(0, 10), end: pe.toISOString().slice(0, 10) }
}

// Loads a previous-period result for the mobile Overview's ▲/▼:
//   deferred - starts only once `ready` is true (the current period has rendered), then waits for
//              the browser to be idle, so it never competes with the first paint
//   lazy     - `enabled` false (e.g. a collapsed section) → nothing is requested
//   cached   - per key for the session: in memory, plus sessionStorage (try/catch; storage can be
//              full, disabled or absent) - only the small derived result is stored, never raw payloads
// `load` must resolve to a small JSON-serialisable object (or null). Timings of real network loads
// are recorded on window.__prevPeriodTimings for the cost measurement script.
const memory = new Map()
const inflight = new Map()
const SS_PREFIX = 'ov.prev.'

function readStore(key) {
  if (memory.has(key)) return memory.get(key)
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + key)
    if (raw) { const v = JSON.parse(raw); memory.set(key, v); return v }
  } catch { /* storage unavailable - fall through to a fresh load */ }
  return undefined
}
function writeStore(key, value) {
  memory.set(key, value)
  try { sessionStorage.setItem(SS_PREFIX + key, JSON.stringify(value)) } catch { /* quota / private mode */ }
}

export function usePrevPeriod(key, load, { enabled = true, ready = true } = {}) {
  const active = SHOW_PERIOD_DELTAS && enabled && !!key
  // Only ever set from the async load below; status for the current key is derived at render.
  const [result, setResult] = useState({ key: null, status: 'loading', value: null })
  const cached = active ? readStore(key) : undefined

  useEffect(() => {
    if (!active || !ready || readStore(key) !== undefined) return
    let cancelled = false
    const idle = window.requestIdleCallback || (cb => setTimeout(cb, 200))
    const cancelIdle = window.cancelIdleCallback || clearTimeout
    const handle = idle(() => {
      let p = inflight.get(key)
      if (!p) {
        const t0 = performance.now()
        p = Promise.resolve().then(load).then(v => {
          ;(window.__prevPeriodTimings ||= []).push({ key, ms: Math.round(performance.now() - t0) })
          if (v != null) writeStore(key, v)
          return v
        }).finally(() => inflight.delete(key))
        inflight.set(key, p)
      }
      p.then(v => { if (!cancelled) setResult({ key, status: v != null ? 'ready' : 'error', value: v ?? null }) })
        .catch(() => { if (!cancelled) setResult({ key, status: 'error', value: null }) })
    })
    return () => { cancelled = true; cancelIdle(handle) }
  }, [active, key, ready]) // eslint-disable-line react-hooks/exhaustive-deps -- `load` is recreated each render; `key` identifies it

  if (!active) return { status: 'off', value: null }
  if (cached !== undefined) return { status: 'ready', value: cached }
  // A result for an older key (range changed) never leaks into the new range.
  return result.key === key ? result : { status: 'loading', value: null }
}
