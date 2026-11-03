// Parity page runtime: render-parity.mjs (Playwright) loads recorded payloads into the page, then
// renders one P&L view at a time with window.__render(spec) and reads back the DOM and the hidden
// summary instance's onSummary() output (KPI totals, per-product rows, daily series incl. the
// day-wise % trend, and the Ads margins). The same file drives old.html and new.html.
import { createRoot } from 'react-dom/client'
import '../../../src/index.css'

export function run(PnLPage) {
  const main = createRoot(document.getElementById('root'))
  const probe = createRoot(document.getElementById('probe'))
  const DATA = {}
  window.__load = async (name, url) => {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`load ${url}: ${r.status}`)
    DATA[name] = await r.json()
    return true
  }
  window.__drop = name => { delete DATA[name]; return true }
  // spec: { key, start, end, caseLabel, data, prevData, probeData, tab, amz, off, d2c, main, probe }
  window.__render = spec => {
    try { sessionStorage.clear() } catch { /* private mode */ }
    window.__summary = null
    // __case keeps PnLPage's module-level previous-period cache (keyed by range + filters) from
    // handing one case's previous period to another case with the same dates.
    const filters = { start: spec.start, end: spec.end, __case: spec.caseLabel }
    const view = {
      filters, setFilters: () => {}, activeTab: spec.tab, setActiveTab: () => {}, amzChannelView: spec.amz, setAmzChannelView: () => {},
      offlineSub: spec.off, setOfflineSub: () => {}, d2cSubCh: spec.d2c, setD2cSubCh: () => {},
    }
    const loadPeriod = spec.prevData ? async () => DATA[spec.prevData] : undefined
    main.render(spec.main ? <PnLPage key={spec.key} data={DATA[spec.data]} loadPeriod={loadPeriod} {...view} /> : null)
    probe.render(spec.probe ? <PnLPage key={`p-${spec.key}`} data={DATA[spec.probeData || spec.data]} summaryOnly withMargins onSummary={v => { window.__summary = v }} {...view} /> : null)
    return true
  }
}
