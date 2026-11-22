/* global localStorage */
import { supabase } from '../supabase.js'

const lsKey = userId => `tour.seen.${userId}`

function readLocal(userId) {
  try {
    const raw = localStorage.getItem(lsKey(userId))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeLocal(userId, seen) {
  try {
    localStorage.setItem(lsKey(userId), JSON.stringify(seen))
  } catch { /* storage unavailable */ }
}

/**
 * Merge server (profile.tours_seen) and local storage, taking the max version per tour.
 */
export function getToursSeen(profile, userId) {
  const server = profile?.tours_seen || {}
  const local = readLocal(userId)
  const merged = { ...local }
  for (const [id, v] of Object.entries(server)) {
    merged[id] = Math.max(merged[id] ?? 0, v)
  }
  return merged
}

/**
 * Mark a tour as seen at the given version.
 * Writes localStorage immediately; Supabase RPC is best-effort.
 */
export async function markTourSeen(userId, tourId, version) {
  const current = readLocal(userId)
  const updated = { ...current, [tourId]: Math.max(current[tourId] ?? 0, version) }
  writeLocal(userId, updated)

  try {
    await supabase.rpc('mark_tour_seen', { p_tour_id: tourId, p_version: version })
  } catch { /* offline or column not migrated yet — localStorage keeps it */ }
}

/**
 * Reset all tours for this user (replay from scratch).
 */
export async function resetTours(userId) {
  try {
    localStorage.removeItem(lsKey(userId))
  } catch { /* storage unavailable */ }

  try {
    await supabase.rpc('reset_tours_seen')
  } catch { /* best-effort */ }
}
