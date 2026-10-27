import { useSyncExternalStore } from 'react'

// Which P&L tool is open on a phone (PNL_REVIEW_FIXES.md §2). The phone header lives in App.jsx's
// Topnav, the tool state in PnLPage, so they share it here:
//   tool   { id, title, backLabel, onBack } while a tool is open, else null → the header swaps the
//          channel chips / sub-tabs for "‹ D2C  Price Simulator"
//   reset  the open tool's reset: () => undo (a function that restores the levers as they were)
//   toast  { text, undo } after a reset, shown by PnLPage's UndoToast
let state = { tool: null, reset: null, toast: null }
const subs = new Set()
const emit = () => subs.forEach(f => f())
const subscribe = cb => { subs.add(cb); return () => subs.delete(cb) }

export function setPnlTool(tool) { state = { ...state, tool, ...(tool ? {} : { reset: null, toast: null }) }; emit() }
export function setPnlToolReset(reset) { state = { ...state, reset }; emit() }
export function runPnlToolReset() {
  const undo = state.reset?.()
  state = { ...state, toast: { text: 'Levers reset', undo: typeof undo === 'function' ? undo : null } }
  emit()
}
export function clearPnlToast() { state = { ...state, toast: null }; emit() }
export function usePnlTool() { return useSyncExternalStore(subscribe, () => state) }
