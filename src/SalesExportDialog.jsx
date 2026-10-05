// Sales export dialog — date range, report picker, one Excel workbook.
//
// Replaces nine near-identical dropdown menus (one per channel tab), each offering the same
// three fixed reports over whatever range the dashboard happened to be showing. The parts
// that differ between channels are the ROW BUILDERS, not the chrome, so those come in as a
// prop and everything else is shared.
//
// Range: the picker accepts any dates. Inside the range already loaded it slices the data
// in memory and downloads immediately; outside it, it refetches from /api/bq first. That
// means a wide export can take a while and can cover a different period than the screen —
// the dialog says so rather than letting the file quietly disagree with the dashboard.

import { useState, useEffect, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { C } from './utils.js'

// One row per report the dialog can produce. `build` receives the resolved dataset and
// returns an array of flat objects; an empty array means the sheet is skipped rather than
// written blank, so a workbook never contains an empty tab.
export const SALES_REPORTS = [
  { id: 'sku', label: 'Day-wise & SKU', hint: 'One row per day per SKU' },
  { id: 'category', label: 'Category revenue', hint: 'Category and sub-category totals' },
  { id: 'returns', label: 'Returns & RTO detail', hint: 'Cancel, RTO and CIR per SKU' },
  { id: 'channels', label: 'Channel comparison', hint: 'Revenue, AOV and share per channel' },
  { id: 'states', label: 'Top states & cities', hint: 'Geography split' },
]

const iso = d => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function SalesExportDialog({
  channel,          // 'shopify' | 'amazon' | … — used for the filename and passed to builders
  channelLabel,     // human name for the file, e.g. 'D2C'
  dashStart, dashEnd,
  data,             // the dataset the dashboard is already showing
  buildReports,     // (data, { start, end, reportIds }) => [{ id, name, rows }]
  extraFilters = {},
  api = '',
}) {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState(dashStart)
  const [end, setEnd] = useState(dashEnd)
  const [picked, setPicked] = useState(() => new Set(['sku']))
  const [busy, setBusy] = useState(null)   // null | 'fetching' | 'building'
  const [err, setErr] = useState(null)
  const ref = useRef(null)

  // Re-sync when the dashboard range moves while the dialog is closed, so opening it always
  // starts from what is on screen rather than a range the reader has since left behind.
  useEffect(() => { if (!open) { setStart(dashStart); setEnd(dashEnd) } }, [dashStart, dashEnd, open])

  useEffect(() => {
    if (!open) return
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  // Whether the requested range reaches outside what the page has loaded. Only this case
  // needs the network; a narrower window is already in memory.
  const needsFetch = useMemo(
    () => !!(start && end && dashStart && dashEnd && (start < dashStart || end > dashEnd)),
    [start, end, dashStart, dashEnd],
  )
  const rangeValid = !!(start && end && start <= end)

  const toggle = id => setPicked(s => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  const run = async () => {
    if (!rangeValid || !picked.size) return
    setErr(null)
    try {
      let dataset = data
      if (needsFetch) {
        setBusy('fetching')
        const body = { start, end, ...extraFilters, ...(channel ? { channel } : {}) }
        const res = await fetch(`${api}/api/bq`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error(`Server returned ${res.status}`)
        const json = await res.json()
        dataset = json.source === 'postgres-aggregated' ? json : (json.totalRev !== undefined ? json : (json.rows || []))
      }

      setBusy('building')
      const sheets = buildReports(dataset, { start, end, reportIds: [...picked] })
        .filter(s => s?.rows?.length)

      if (!sheets.length) {
        setErr('Nothing to export for this range.')
        setBusy(null)
        return
      }

      const wb = XLSX.utils.book_new()
      for (const s of sheets) {
        // 31 chars is Excel's hard sheet-name limit and it rejects the file outright past
        // it, so the name is clipped rather than trusted.
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows), String(s.name).slice(0, 31))
      }
      const tag = `${start}_${end}`
      XLSX.writeFile(wb, `frido_${(channelLabel || channel || 'sales').toLowerCase().replace(/\s+/g, '_')}_${tag}.xlsx`)
      setBusy(null)
      setOpen(false)
    } catch (e) {
      setErr(e.message || String(e))
      setBusy(null)
    }
  }

  const field = {
    fontSize: 11.5, fontFamily: 'var(--font)', color: C.t1,
    border: `1px solid ${C.border2}`, borderRadius: 6, padding: '4px 7px',
    background: C.card, width: '100%', boxSizing: 'border-box',
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 8, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
        ↓ Export <span style={{ fontSize: 10, color: C.t3 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 32, right: 0, zIndex: 999,
          background: C.card, border: `1px solid ${C.border2}`, borderRadius: 10,
          boxShadow: '0 8px 28px rgba(0,0,0,.14)', padding: 12, width: 290,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.t3, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 7 }}>
            Date range
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <input type="date" value={start} max={end || undefined} onChange={e => setStart(e.target.value)} style={field} />
            <span style={{ fontSize: 11, color: C.t3 }}>to</span>
            <input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)} style={field} />
          </div>
          {/* Three states worth distinguishing: an impossible range, one that needs the
              network, and one already in memory. The middle case is the one that costs the
              reader time, so it says so before they commit to it. */}
          <div style={{ fontSize: 10.5, marginBottom: 10, minHeight: 14, color: !rangeValid ? C.red.tx : needsFetch ? '#92400E' : C.t3 }}>
            {!rangeValid ? 'Start date must be on or before the end date.'
              : needsFetch ? 'Outside the loaded range — this will query the server and may take a while.'
                : 'Within the dashboard range — exports instantly.'}
          </div>

          <div style={{ fontSize: 10, fontWeight: 800, color: C.t3, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 7 }}>
            Reports
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 10 }}>
            {SALES_REPORTS.map(r => {
              const on = picked.has(r.id)
              return (
                <label key={r.id} title={r.hint}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', background: on ? C.acl : 'transparent' }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(r.id)} style={{ accentColor: C.acm, flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, color: C.t1, fontWeight: on ? 600 : 400 }}>{r.label}</span>
                </label>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <button onClick={() => setPicked(new Set(SALES_REPORTS.map(r => r.id)))}
              style={{ fontSize: 11, color: C.t2, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', padding: 0 }}>
              Select all
            </button>
            <button onClick={run} disabled={!!busy || !rangeValid || !picked.size}
              style={{
                marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font)',
                padding: '5px 13px', borderRadius: 7, border: 'none',
                background: (!busy && rangeValid && picked.size) ? C.acc : C.border2,
                color: (!busy && rangeValid && picked.size) ? C.onAcc : C.t3,
                cursor: (!busy && rangeValid && picked.size) ? 'pointer' : 'default',
              }}>
              {busy === 'fetching' ? 'Fetching…' : busy === 'building' ? 'Building…' : `Download${picked.size > 1 ? ` (${picked.size})` : ''}`}
            </button>
          </div>

          {err && <div style={{ fontSize: 11, color: C.red.tx, marginTop: 8 }}>{err}</div>}
        </div>
      )}
    </div>
  )
}
