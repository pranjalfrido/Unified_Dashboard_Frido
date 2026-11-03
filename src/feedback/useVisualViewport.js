import { useEffect, useState } from 'react'

// The part of the screen the person can actually see. On Android Chrome and iPhone Safari the
// on-screen keyboard shrinks window.visualViewport but not the layout viewport (100vh, `bottom: 0`),
// so a normal bottom sheet ends up behind the keyboard. kb = true while the keyboard is up.
//
// Measured on every visualViewport resize / scroll, and again a few times after any focus change: the keyboard
// animates in after the field is focused and some browsers send no final resize when it has finished, which
// left the sheet one step behind (text box and Send under the keyboard). Updates are batched per frame.
export function useVisualViewport() {
  const read = () => {
    const vv = window.visualViewport
    const h = Math.round(vv ? vv.height : window.innerHeight)
    const top = Math.round(vv ? vv.offsetTop : 0)
    return { h, top, kb: window.innerHeight - h - top > 120 }
  }
  const [vp, setVp] = useState(read)
  useEffect(() => {
    const vv = window.visualViewport
    let raf = 0
    let timers = []
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setVp(prev => { const n = read(); return n.h === prev.h && n.top === prev.top && n.kb === prev.kb ? prev : n }))
    }
    const settle = () => { timers.forEach(clearTimeout); timers = [0, 120, 300, 600, 1000].map(ms => setTimeout(measure, ms)) }
    vv?.addEventListener('resize', measure)
    vv?.addEventListener('scroll', measure)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', settle)
    document.addEventListener('focusin', settle)
    document.addEventListener('focusout', settle)
    return () => {
      cancelAnimationFrame(raf); timers.forEach(clearTimeout)
      vv?.removeEventListener('resize', measure); vv?.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure); window.removeEventListener('orientationchange', settle)
      document.removeEventListener('focusin', settle); document.removeEventListener('focusout', settle)
    }
  }, [])
  return vp
}
