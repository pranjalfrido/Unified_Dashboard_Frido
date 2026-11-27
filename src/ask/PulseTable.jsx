import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowsOut, Copy, Check } from '@phosphor-icons/react'
import MobilePageHeader from '../responsive/MobilePageHeader.jsx'
import { inlineFormat } from './markdown.js'
import ExcelButton from './ExcelButton.jsx'
import { phoneColumns, withTotals } from './phoneColumns.js'

// A table in a Pulse answer on phones (docs/responsive/PULSE_UI_FIX_PROMPT.md §5, mockups/pulse_fix_mockup.html):
//   fits the width: at most 4 columns; more → "View full table ⤢" opens a full-screen table that scrolls
//   sideways with the first column fixed. Header row small uppercase on a light band; numbers right-aligned
//   and never wrapped; ▲ / ▼ green when good, red when bad (an increase is bad for returns, RTO, CIR,
//   cancellations…); a row starting "Total" bold on a light background; a cell's second line (<br>) small
//   and grey underneath; 10 rows, then "Show all N rows". Copy = the whole table as tab-separated text.

const MAX_COLS = 4
const MAX_ROWS = 10
const plain = s => (s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim()
const NUM = /^[▲▼]?\s?[-+−]?\s?(₹\s?)?[\d,]+(\.\d+)?\s?(%|Cr|L|K|k|M|x|d|days|pts|pp)?$/
const LOWER_IS_BETTER = /return|rto|cir|cancel|exchange|ndr|breach|cac|cogs|acos/i
const isTotal = r => /^total\b/i.test(plain(r[0]))

// "Trend" columns on the phone: +12.3% -> ▲ 12.3%, -4.5% -> ▼ 4.5% (up = selling faster, shown green).
function trendCell(header, raw) {
  if (!/trend/i.test(plain(header))) return raw
  const m = /^([+-])\s?(\d[\d,.]*\s?%)$/.exec(plain(raw))
  return m ? `${m[1] === '+' ? '▲' : '▼'} ${m[2]}` : raw
}

function tone(raw, rowLabel, header) {
  const t = plain(raw)
  if (!/^[▲▼]/.test(t)) return ''
  const up = t[0] === '▲'
  return up !== LOWER_IS_BETTER.test(`${plain(rowLabel)} ${plain(header)}`) ? ' up' : ' dn'
}

function Cell({ raw, num, cls = '' }) {
  const [main, ...rest] = (raw || '').split(/<br\s*\/?>/i)
  return (
    <td className={`${num ? 'n' : ''}${cls}`}>
      <span dangerouslySetInnerHTML={{ __html: inlineFormat(main.trim()) }} />
      {rest.length > 0 && <small dangerouslySetInnerHTML={{ __html: inlineFormat(rest.join(' ').trim()) }} />}
    </td>
  )
}

function Table({ headers, rows, cols, numCols, colIdx }) {
  const idx = colIdx || Array.from({ length: cols }, (_, j) => j)
  return (
    <table className="pm-tb">
      <thead><tr>{idx.map(j => <th key={j} className={numCols[j] ? 'n' : ''}>{/trend/i.test(plain(headers[j])) ? 'Trend' : plain(headers[j])}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={isTotal(r) ? 'tot' : undefined}>
            {idx.map(j => <Cell key={j} raw={trendCell(headers[j], r[j])} num={numCols[j]} cls={j ? tone(trendCell(headers[j], r[j]), /trend/i.test(plain(headers[j])) ? '' : r[0], headers[j]) : ''} />)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).catch(() => legacyCopy(text))
  legacyCopy(text)
  return Promise.resolve()
}
function legacyCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy') } catch { /* nothing else to try */ }
  ta.remove()
}

// Full-screen table: green header with ‹ back (Android/browser Back closes it too).
function FullTable({ headers, rows, cols, numCols, onClose }) {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  useEffect(() => {
    let popped = false
    window.history.pushState({ pulseTable: true }, '')
    const onPop = () => { popped = true; closeRef.current() }
    const onKey = e => { if (e.key === 'Escape') closeRef.current() }
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      if (!popped && window.history.state?.pulseTable) window.history.back()
    }
  }, [])
  return createPortal(
    <div className="pm-full" role="dialog" aria-modal="true" aria-label="Full table">
      <div className="topnav m-header" data-page="ask">
        <MobilePageHeader onBack={onClose} backLabel="the answer" title="Full table" sub={`${rows.length} rows · ${cols} columns`} />
      </div>
      <div className="pm-full-body">
        <Table headers={headers} rows={rows} cols={cols} numCols={numCols} />
      </div>
    </div>,
    document.body,
  )
}

export default function PulseTable({ headers, rows: rawRows, title, keyHeader }) {
  const [all, setAll] = useState(false)
  const [full, setFull] = useState(false)
  const [copied, setCopied] = useState(false)
  const ncol = Math.max(headers.length, ...rawRows.map(r => r.length))
  // Number columns: every non-empty body cell looks like a number (₹, %, Cr, L, ▲ 12%…).
  const numCols = useMemo(() => Array.from({ length: ncol }, (_, j) => {
    if (j === 0) return false
    const body = rawRows.map(r => plain(r[j])).filter(t => t && t.toLowerCase() !== 'n/a')
    return body.length > 0 && body.every(t => NUM.test(t))
  }), [rawRows, ncol])
  const rows = useMemo(() => withTotals(rawRows, headers, numCols), [rawRows, headers, numCols])
  const colIdx = useMemo(() => phoneColumns(headers, numCols, keyHeader), [headers, numCols, keyHeader])

  // 10 rows, then "Show all"; a Total row further down stays visible at the bottom.
  const shown = useMemo(() => {
    if (all || rows.length <= MAX_ROWS) return rows
    const top = rows.slice(0, MAX_ROWS)
    const total = rows.slice(MAX_ROWS).find(isTotal)
    return total ? [...top.slice(0, MAX_ROWS - 1), total] : top
  }, [rows, all])

  const copy = () => {
    const line = r => Array.from({ length: ncol }, (_, j) => plain(r[j]).replace(/\t/g, ' ')).join('\t')
    copyText([line(headers), ...rows.map(line)].join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <div className="pm-tbw">
      <div className="pm-tbox"><Table headers={headers} rows={shown} cols={Math.min(ncol, MAX_COLS)} numCols={numCols} colIdx={colIdx} /></div>
      <div className="pm-tbar">
        {rows.length > MAX_ROWS && <button type="button" onClick={() => setAll(a => !a)}>{all ? 'Show fewer rows' : `Show all ${rows.length} rows`}</button>}
        {colIdx.length < ncol && <button type="button" onClick={() => setFull(true)}>View full table <ArrowsOut size={13} weight="bold" aria-hidden="true" /></button>}
        <button type="button" className="pm-copy" onClick={copy} aria-live="polite">
          {copied ? <Check size={13} weight="bold" aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}{copied ? 'Copied' : 'Copy'}
        </button>
        <ExcelButton tables={[{ title, headers, rows }]} />
      </div>
      {full && <FullTable headers={headers} rows={rows} cols={ncol} numCols={numCols} onClose={() => setFull(false)} />}
    </div>
  )
}
