// ── Theme registry and the JS↔CSS colour bridge ──────────────────────────────
//
// Colour is defined once, as CSS custom properties per theme in index.css.
// This module is the JS half: it exposes the themes for the picker, applies the
// choice to <html data-theme>, and reads the *live* token values back out so
// JS-driven colours (Recharts fills, inline styles) follow the active theme.
//
// Reading from getComputedStyle rather than duplicating hexes here is what keeps
// the two halves from drifting: index.css stays the single source of truth.

export const THEMES = [
  {
    id: 'gold',
    label: 'Gold',
    hint: 'Warm beige, gold accent',
    // Swatch for the picker. Mirrors --bg/--acc/--acm; picker-only, never read
    // for page colour, so a small duplication here cannot drift the UI.
    swatch: ['#F2F1EF', '#D89A1A', '#7A5410'],
  },
  {
    id: 'indigo',
    label: 'Indigo',
    hint: 'Cool grey-blue, indigo accent',
    swatch: ['#EEF0F5', '#5B5BD6', '#3A3A9E'],
  },
]

export const DEFAULT_THEME = 'gold'
const STORAGE_KEY = 'frido.theme'

export const isValidTheme = id => THEMES.some(t => t.id === id)

// localStorage throws in private windows and when site data is blocked, so every
// access is guarded; the dashboard must still render with the default theme.
export function readStoredTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isValidTheme(v) ? v : DEFAULT_THEME
  } catch { return DEFAULT_THEME }
}

export function storeTheme(id) {
  try { localStorage.setItem(STORAGE_KEY, id) } catch { /* non-fatal */ }
}

// Stamps the theme on <html>. Every var(--x) re-resolves from this, so the CSS
// side of the switch is complete the moment this runs.
export function applyTheme(id) {
  const theme = isValidTheme(id) ? id : DEFAULT_THEME
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
  }
  return theme
}

// ── Live token reads ────────────────────────────────────────────────────────
// getComputedStyle is comparatively expensive and these are read inside render
// paths and chart loops, so resolved values are memoised per theme and the cache
// is dropped whenever the theme changes.
let tokenCache = new Map()
let cachedFor = null

export function cssVar(name, fallback = '') {
  if (typeof window === 'undefined') return fallback
  const active = document.documentElement.getAttribute('data-theme') || DEFAULT_THEME
  if (active !== cachedFor) { tokenCache = new Map(); cachedFor = active }
  if (tokenCache.has(name)) return tokenCache.get(name)
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
  tokenCache.set(name, v)
  return v
}

// Called by the picker after switching so the next read re-resolves.
export function invalidateTokenCache() { tokenCache = new Map(); cachedFor = null }
