import { useEffect, useRef, useCallback, useState } from 'react'
import './tour.css'
import { TourContext } from './TourContext.js'
import { TOURS } from './tours/index.js'
import { getToursSeen, markTourSeen, resetTours } from './storage.js'
import { isTourEligible } from './eligibility.js'
import { runTour, isRunning, destroyActive } from './engine.js'

/**
 * Wraps the dashboard shell. Decides when to auto-start tours and exposes
 * replayMain() and resetAllTours() to the rest of the app via context.
 *
 * Props:
 *   userId       string
 *   profile      object (from Supabase user_profiles)
 *   allowedTabs  string[] | null
 *   page         string  (current page id)
 *   setPage      function
 *   layout       'desktop' | 'mobile'
 *   ready        boolean  (true when shell is mounted and profile is loaded)
 *   children     ReactNode
 */
export function TourProvider({ userId, profile, allowedTabs, page, setPage, layout, ready, children }) {
  const runningRef = useRef(false)
  const lastAutoRef = useRef(null) // tour id of last auto-started tour
  const [, forceUpdate] = useState(0)

  // Build the permission checker that matches the sidebar and mobile dock rules
  const can = useCallback((permissionId) => {
    if (!allowedTabs) return true
    if (permissionId === 'sales') return allowedTabs.some(t => t === 'sales:all' || t.startsWith('sales:'))
    if (permissionId === 'ads') return allowedTabs.some(t => t === 'ads:all' || t.startsWith('ads:'))
    if (permissionId === 'pnl') return allowedTabs.some(t => t === 'pnl:all' || t.startsWith('pnl:'))
    if (permissionId === 'logistics') return allowedTabs.includes('logistics') || allowedTabs.some(t => t.startsWith('logistics:cost'))
    if (permissionId === 'inventory') return allowedTabs.includes('inventory') || allowedTabs.includes('inventory:sales') || allowedTabs.includes('inventory:detail')
    if (permissionId === 'customer') return allowedTabs.includes('customer') || allowedTabs.includes('customer:support')
    return allowedTabs.includes(permissionId)
  }, [allowedTabs])

  // Auto-start logic: runs when page, layout, or ready changes
  useEffect(() => {
    if (!ready || !userId || !profile) return
    if (isRunning()) return

    // Don't auto-start on login/reset screens (no profile means we're not in Dashboard)
    const AUTO_DELAY_MS = 700

    const timer = setTimeout(async () => {
      if (isRunning() || runningRef.current) return

      const seen = getToursSeen(profile, userId)

      // Find the first eligible tour to auto-start
      // Main tour has priority; page tours come after
      const toRun = TOURS.find(tour => {
        if (tour.trigger === 'manual') return false
        if (tour.trigger === 'first-login' && tour.id !== 'main') return false
        return isTourEligible(tour, {
          layout,
          can,
          seenVersion: seen[tour.id],
          currentPage: page,
        })
      })

      if (!toRun) return
      if (lastAutoRef.current === toRun.id + layout) return // already ran this combo

      runningRef.current = true
      lastAutoRef.current = toRun.id + layout
      try {
        await runTour(toRun, {
          layout,
          can,
          seenVersion: seen[toRun.id],
          userId,
          setPage,
        })
      } finally {
        runningRef.current = false
      }
    }, AUTO_DELAY_MS)

    return () => clearTimeout(timer)
  }, [ready, userId, profile, page, layout, can, setPage])

  // Destroy active tour when page changes mid-tour
  useEffect(() => {
    if (isRunning()) {
      destroyActive()
      runningRef.current = false
    }
  }, [page])

  const replayMain = useCallback(async () => {
    if (isRunning()) return
    destroyActive()
    const mainTour = TOURS.find(t => t.id === 'main')
    if (!mainTour) return
    runningRef.current = true
    lastAutoRef.current = null
    try {
      // Force replay by passing seenVersion as undefined (new user experience)
      await runTour(mainTour, { layout, can, seenVersion: undefined, userId, setPage })
    } finally {
      runningRef.current = false
      forceUpdate(n => n + 1)
    }
  }, [layout, can, userId, setPage])

  const startTour = useCallback(async (tourId) => {
    if (isRunning()) return
    const tour = TOURS.find(t => t.id === tourId)
    if (!tour) return
    const seen = getToursSeen(profile, userId)
    runningRef.current = true
    try {
      await runTour(tour, { layout, can, seenVersion: seen[tourId], userId, setPage })
    } finally {
      runningRef.current = false
    }
  }, [layout, can, userId, setPage, profile])

  const resetAllTours = useCallback(async () => {
    await resetTours(userId)
    lastAutoRef.current = null
    forceUpdate(n => n + 1)
  }, [userId])

  return (
    <TourContext.Provider value={{ startTour, replayMain, resetAllTours }}>
      {children}
    </TourContext.Provider>
  )
}
