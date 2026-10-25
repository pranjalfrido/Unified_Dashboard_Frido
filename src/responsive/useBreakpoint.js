import { useSyncExternalStore } from 'react'

// Breakpoint scale (docs/responsive/RESPONSIVE_PLAN.md §1). Each value is the bucket's minimum width:
//   xs < 480 · sm 480–767 · md 768–1023 · lg 1024–1279 · xl 1280–1535 · 2xl ≥ 1536
export const BREAKPOINTS = { xs: 0, sm: 480, md: 768, lg: 1024, xl: 1280, '2xl': 1536 }

// The app's original mobile cutoff. index.css's `@media (max-width: 768px)` block and every page
// that predates this hook switch layouts at <= 768 (so a 768px iPad portrait counts as "mobile").
// useIsMobile() keeps exactly that rule so migrating a page to the shared listener changes nothing
// visually; pages that have been redesigned use useBreakpoint() and the real md breakpoint instead.
const LEGACY_MOBILE_MAX = 768

// A phone turned sideways is wider than 768px, so width alone hands it the desktop layout. Short
// AND touch-first is what actually identifies it. Mirrored in index.css as the same media query.
const PHONE_LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 500px) and (pointer: coarse)'
const TOUCH_QUERY = '(hover: none) and (pointer: coarse)'

const bpFor = w => (w >= 1536 ? '2xl' : w >= 1280 ? 'xl' : w >= 1024 ? 'lg' : w >= 768 ? 'md' : w >= 480 ? 'sm' : 'xs')

function read() {
  const w = window.innerWidth
  const h = window.innerHeight
  const mq = q => (window.matchMedia ? window.matchMedia(q).matches : false)
  return { width: w, height: h, bp: bpFor(w), isPhoneLandscape: mq(PHONE_LANDSCAPE_QUERY), isTouch: mq(TOUCH_QUERY) }
}

// One resize/orientation listener for the whole app (previously each page added its own).
// The snapshot object is only replaced when a field changes, so components re-render on a real
// breakpoint change rather than on every resize event.
let snapshot = typeof window === 'undefined' ? { width: 1440, height: 900, bp: 'xl', isPhoneLandscape: false, isTouch: false } : read()
const listeners = new Set()
function onChange() {
  const next = read()
  if (next.width === snapshot.width && next.height === snapshot.height && next.isPhoneLandscape === snapshot.isPhoneLandscape && next.isTouch === snapshot.isTouch) return
  snapshot = next
  listeners.forEach(l => l())
}
function subscribe(l) {
  if (listeners.size === 0) {
    window.addEventListener('resize', onChange)
    window.addEventListener('orientationchange', onChange)
  }
  listeners.add(l)
  return () => {
    listeners.delete(l)
    if (listeners.size === 0) {
      window.removeEventListener('resize', onChange)
      window.removeEventListener('orientationchange', onChange)
    }
  }
}
const getSnapshot = () => snapshot

// { width, height, bp, isPhoneLandscape, isTouch, isMobile, isTablet, isDesktop, up(bp), down(bp) }
//   isMobile  - width < 768 (xs/sm) or a phone in landscape
//   isTablet  - md (768–1023), not a phone in landscape
//   up('lg')  - width >= 1024; down('md') - width < 768
export function useBreakpoint() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const isMobile = s.width < BREAKPOINTS.md || s.isPhoneLandscape
  return {
    ...s,
    isMobile,
    isTablet: !s.isPhoneLandscape && s.bp === 'md',
    isDesktop: !isMobile && s.width >= BREAKPOINTS.lg,
    up: name => s.width >= BREAKPOINTS[name],
    down: name => s.width < BREAKPOINTS[name],
  }
}

// Drop-in replacement for the per-page `useState(innerWidth <= 768)` + resize-listener pattern.
export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).width <= LEGACY_MOBILE_MAX
}

// Raw viewport width for the few components that size things from it directly.
export function useViewportWidth() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).width
}
