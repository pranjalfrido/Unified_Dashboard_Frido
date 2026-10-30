// Staged /api/bq loading status for <DetailGate> (src/DetailGate.jsx) — the context the Dashboard
// provides per page, and the hooks sections use to read it. Kept out of DetailGate.jsx so that file
// only exports a component (React fast refresh).
import { createContext, useContext } from 'react'

export const DetailPhaseContext = createContext(null)

const READY = { status: 'ready', error: null, retry: null }

// Context value: { status, error, retry } of the page's main detail group, plus `byPhase` — the
// same triple for every detail group the page loads (Ads also loads pnl_detail for its margins).
// `phase` picks one of those; omitted = the page's main group.
export function useDetailPhase(phase) {
  const ctx = useContext(DetailPhaseContext)
  if (!ctx) return READY
  if (phase) return ctx.byPhase?.[phase] || READY
  return ctx
}

// True when the section's data is in (use it to blank out a value, disable an export, …).
export function useDetailReady(phase) {
  return useDetailPhase(phase).status === 'ready'
}
