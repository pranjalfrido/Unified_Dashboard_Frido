import { when } from './feedbackApi.js'

// What the person was looking at, plus the device. Built once when the form opens.
export function buildContext(view, version, ai) {
  const w = window.innerWidth
  const phone = w <= 768
  const now = new Date()
  const ctx = {
    page: view?.page || document.title || 'Dashboard',
    path: view?.path || window.location.pathname,
    channel: view?.channel || '',
    subChannel: view?.subChannel || '',
    dateRange: view?.dateRange || '',
    start: view?.start || '',
    end: view?.end || '',
    filters: view?.filters || {},
    device: { kind: phone ? 'Phone' : w <= 1100 ? 'Tablet' : 'Laptop', viewport: `${w}×${window.innerHeight}`, browser: browserName() },
    appVersion: version,
    time: now.toISOString(),
  }
  if (ai) ctx.ai = { question: String(ai.question || '').slice(0, 300), answer: String(ai.answer || '').slice(0, 300) }
  return ctx
}
function browserName() {
  const u = navigator.userAgent
  return /Edg\//.test(u) ? 'Edge' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Browser'
}
export function filterText(f) {
  return Object.entries(f || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ')
}
export function contextLine(c) {
  return [c.page, c.channel, c.subChannel, c.dateRange, filterText(c.filters) && `Filters ${filterText(c.filters)}`, `${c.device.kind} ${c.device.viewport}`, `v${c.appVersion}`, when(c.time)].filter(Boolean).join(' · ')
}

