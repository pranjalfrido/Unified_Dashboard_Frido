import { useState } from 'react'

// Open/closed state for a CollapsibleSection, remembered per user in localStorage under
// `ui.section.<id>` (try/catch everywhere: storage can be full, disabled or absent - then the
// default is used and the choice simply isn't remembered). Lives in the page (not inside the
// section) so the page can also defer work, e.g. previous-period requests, until a section opens.
const KEY = id => `ui.section.${id}`

function readOpen(id, fallback) {
  try {
    const v = localStorage.getItem(KEY(id))
    return v === '1' ? true : v === '0' ? false : fallback
  } catch { return fallback }
}

export function useCollapsible(id, defaultOpen) {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen))
  const toggle = () => {
    setOpen(prev => {
      const next = !prev
      try { localStorage.setItem(KEY(id), next ? '1' : '0') } catch { /* storage unavailable */ }
      return next
    })
  }
  return [open, toggle]
}
