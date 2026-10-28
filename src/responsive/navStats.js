import { useSyncExternalStore } from 'react'

// Live numbers for the phone launcher (NAV_MOBILE_PROMPT.md §2): a page posts its own headline value
// once it has computed it ("5.23x ROAS"), and the launcher shows it next to that page. Nothing is
// fetched for this: a page that hasn't been opened has no number, and the launcher shows ›.
//   publishNavStat(pageId, { value, label }) · useNavStats() → { [pageId]: { value, label } }
let stats = {}
const subs = new Set()
export function publishNavStat(id, stat) {
  const cur = stats[id]
  if (cur && cur.value === stat?.value && cur.label === stat?.label) return
  stats = { ...stats, [id]: stat }
  // Pages call this while rendering; tell the launcher afterwards, not in the middle of that render.
  queueMicrotask(() => subs.forEach(f => f()))
}
export function useNavStats() {
  return useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb) }, () => stats)
}
