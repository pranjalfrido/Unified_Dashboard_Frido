import { createContext, useContext } from 'react'

export const TourContext = createContext(null)

export function useTour() {
  const ctx = useContext(TourContext)
  if (!ctx) return { startTour: () => {}, replayMain: () => {}, resetAllTours: () => {} }
  return ctx
}
