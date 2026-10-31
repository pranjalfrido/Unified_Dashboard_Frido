import { useEffect, useState } from 'react'

// The part of the screen the person can actually see. On Android Chrome and iPhone Safari the
// on-screen keyboard shrinks window.visualViewport but not the layout viewport (100vh, `bottom: 0`),
// so a normal bottom sheet ends up behind the keyboard. kb = true while the keyboard is up.
export function useVisualViewport() {
  const read = () => {
    const vv = window.visualViewport
    const h = vv ? vv.height : window.innerHeight
    const top = vv ? vv.offsetTop : 0
    return { h, top, kb: window.innerHeight - h - top > 120 }
  }
  const [vp, setVp] = useState(read)
  useEffect(() => {
    const vv = window.visualViewport
    const on = () => setVp(read())
    vv?.addEventListener('resize', on)
    vv?.addEventListener('scroll', on)
    window.addEventListener('resize', on)
    return () => { vv?.removeEventListener('resize', on); vv?.removeEventListener('scroll', on); window.removeEventListener('resize', on) }
  }, [])
  return vp
}
