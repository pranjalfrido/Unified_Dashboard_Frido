import { C } from '../utils.js'

// Heat colours for phone heatmaps / heat chips (Frido green, darker = more): v against the max of the
// scale; muted = a greyed cell outside the scale (e.g. cohort M0, same-category cross-sell).
export function heatBg(v, max, muted = false) {
  if (muted) return C.m.soft
  if (!v || !max) return 'transparent'
  return `rgba(31,90,61,${(0.08 + 0.62 * Math.min(1, v / max)).toFixed(2)})`
}
export const heatInk = (v, max) => (max && v / max > 0.6 ? '#fff' : C.m.ink)
