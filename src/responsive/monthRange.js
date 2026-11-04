// Billing-month helpers for MonthRangePicker: 'YYYY-MM' keys, labels for pills and captions.
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const ym = k => [Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1]
export const key = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`
const idx = k => { const [y, m] = ym(k); return y * 12 + m }
export const contiguous = keys => keys.every((k, i) => i === 0 || idx(k) === idx(keys[i - 1]) + 1)

// "Sep 2026" · "Apr – Jul 2026" · "Nov 2025 – Feb 2026" · "Apr, Jun 2026" · "5 months".
// short: "Apr – Jul 26" (phone header pill); a single month stays "Sep 2026".
export function monthsLabel(value, months, { short = false } = {}) {
  const sel = (value?.length ? [...value] : [...months]).sort()
  if (!sel.length) return ''
  const yr = y => (short ? String(y).slice(2) : String(y))
  const [y0, m0] = ym(sel[0]), [y1, m1] = ym(sel.at(-1))
  if (sel.length === 1) return `${MON[m0]} ${y0}`
  if (contiguous(sel)) return y0 === y1 ? `${MON[m0]} – ${MON[m1]} ${yr(y1)}` : `${MON[m0]} ${yr(y0)} – ${MON[m1]} ${yr(y1)}`
  if (sel.length <= 3) return y0 === y1 ? `${sel.map(k => MON[ym(k)[1]]).join(', ')} ${yr(y1)}` : sel.map(k => `${MON[ym(k)[1]]} ${yr(ym(k)[0])}`).join(', ')
  return `${sel.length} months`
}
export const monthsCount = (value, months) => (value?.length ? value.length : months.length)

