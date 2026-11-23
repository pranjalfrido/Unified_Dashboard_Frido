// Inventory → Inward (rewritten 2026-11-08; replaces the old hidden Inward tab that read the legacy
// GRN table). Laptop / desktop / phone in one component:
//   phone (≤ 768 or phone landscape): green header holds date + filter (App.jsx Topnav), filters in a
//     bottom sheet, KPI tiles 2 per row, charts full width, tables 4 columns + "View full table ⤢"
//   laptop 1024–1279: KPI tiles 3 per row, charts stacked
//   desktop ≥ 1280: 6 KPI tiles in a row, trend + source mix side by side
// Data: POST /api/inward (one call per filter change, cached server-side) + Inventory Health's own
// feed for current stock / Avg Sale / DOI (passed in as invData), so those match Health exactly.
import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { IC, SearchableMultiSelect, ExportButton } from './theme.jsx'
import { C, fmtBig } from '../utils.js'
import { usePhone, inwardFilterCount, useLastGrnDays, useDqExport } from './useInward.js'
import DeltaBadge from '../responsive/DeltaBadge.jsx'
import BottomSheet from '../responsive/BottomSheet.jsx'
import FilterPicker from '../responsive/FilterPicker.jsx'
import FullScreenTable from '../responsive/FullScreenTable.jsx'
import FullScreenList from '../responsive/FullScreenList.jsx'
import MasterTrendCard from '../responsive/MasterTrendCard.jsx'
import {
  SOURCE_TYPES, SOURCE_COLORS, autoGrain, rollup, fmtBucket, fmtDayYear, fmtRange, pctChange,
  stockIndex, attachStock, toTsv, toCsv, fmtUnits, fmtRatio, fmtPct,
} from './inwardUtils.js'

const M = C.m
const MAX_ROWS = 10
const PHONE_COLS = 4

// ── Small building blocks ───────────────────────────────────────────────────────────────
// Desktop chrome matches Inventory Health's GlassCard exactly (border, radius 16, 18px/20px
// padding, card-hoverable, 13.5px title) so Inward's cards read as the same design system.
function Card({ title, sub, subTitle, action, children, isPhone, id, style, inlineHeader }) {
  return (
    <section id={id} className={isPhone ? undefined : 'card-hoverable'} style={{
      background: isPhone ? M.card : IC.surface, border: isPhone ? 'none' : `1px solid ${IC.border}`,
      borderRadius: isPhone ? M.radius.card : 16, boxShadow: isPhone ? M.cardShadow : 'none',
      padding: isPhone ? '14px 14px 12px' : '18px 20px', minWidth: 0, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', height: '100%', ...style,
    }}>
      {(title || action) && (
        isPhone ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: M.type.cardTitle, fontWeight: 700, color: M.ink, letterSpacing: '-.01em' }}>{title}</span>
              {sub && <span style={{ display: 'block', fontSize: 12, color: M.muted, marginTop: 2 }}>{sub}</span>}
            </div>
            {action}
          </div>
        ) : inlineHeader ? (
          // Desktop, full-width card: title+sub and the action (search/export) share one row —
          // there's room, unlike the paired side-by-side cards below which stack to keep height equal.
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, overflow: 'hidden' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: IC.t1, letterSpacing: '-.01em', flexShrink: 0 }}>{title}</span>
              {sub && <span title={subTitle} style={{ fontSize: 11.5, color: IC.t3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>}
            </div>
            {action && <div style={{ display: 'flex', flexShrink: 0 }}>{action}</div>}
          </div>
        ) : (
          // Desktop: title+sub on their own row, action on the row below — so two cards side by
          // side (e.g. Vendor performance / SKU detail) keep the same header height and their
          // tables start at the same y, regardless of how long either card's title/sub/action is.
          <div style={{ marginBottom: 14 }}>
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, overflow: 'hidden' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: IC.t1, letterSpacing: '-.01em', flexShrink: 0 }}>{title}</span>
              {sub && <span title={subTitle} style={{ fontSize: 11.5, color: IC.t3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>}
            </div>
            {action && <div style={{ display: 'flex', marginTop: 10 }}>{action}</div>}
          </div>
        )
      )}
      {children}
    </section>
  )
}

function Seg({ options, value, onChange, isPhone, label }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'inline-flex', background: isPhone ? M.soft : IC.page, borderRadius: 10, padding: 2, gap: 2, maxWidth: '100%' }}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          style={{ minHeight: isPhone ? 30 : 30, padding: isPhone ? '0 9px' : '0 10px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer',
            background: value === o.value ? (isPhone ? '#fff' : IC.surface) : 'transparent', color: value === o.value ? IC.t1 : IC.t3,
            boxShadow: value === o.value ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>{o.label}</button>
      ))}
    </div>
  )
}

const btnStyle = isPhone => ({ minHeight: isPhone ? 44 : 30, padding: '0 12px', borderRadius: 9, border: `1px solid ${isPhone ? M.line : IC.border2}`,
  background: isPhone ? '#fff' : IC.surface, color: isPhone ? M.ink : IC.t2, fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer', whiteSpace: 'nowrap' })

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).catch(() => legacyCopy(text))
  legacyCopy(text); return Promise.resolve()
}
function legacyCopy(text) {
  const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
  document.body.appendChild(ta); ta.select(); try { document.execCommand('copy') } catch { /* nothing else to try */ } ta.remove()
}
function downloadCsv(filename, text) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

// ── Table: sortable, right-aligned numbers, 10 rows then "Show all", Copy (TSV) + CSV.
// Phone: the 4 columns named in `phoneKeys` + "View full table ⤢" (full screen, first column fixed,
// sideways scroll — the NavAI / Pulse table pattern, built on responsive/FullScreenTable).
//   columns: [{ key, label, num, text(r) → string, render?(r) → node, csv?(r), sort?(r) }]
// fixedHeight: instead of "10 rows then Show all", the table body scrolls inside a constant-height
// container (the whole card stops growing with row count) and every row is always in the DOM —
// the user scrolls to see the rest. totalRow(rows) → a row object of the same shape as `rows`,
// rendered pinned below the header as a non-sortable summary ("Total" line); only meaningful
// together with fixedHeight (a short, un-scrolled table doesn't need one).
// externalSearch: when set (a string, possibly ''), the table's own search box + Copy/CSV row is
// suppressed — the caller (InwardPage) renders search + ExportButton itself in the Card header's
// top-right, matching Inventory Health's table convention, and filters by this value instead of an
// internal q state. `search` (the predicate) is still required to actually filter rows.
function InwardTable({ columns, rows, isPhone, filename, title, defaultSort, sortable = true, onRowClick, phoneKeys, search, searchPlaceholder, rowStyle, emptyText = 'No rows for these filters', fullNote, fixedHeight, totalRow, externalSearch, hideExport }) {
  const [sort, setSort] = useState(defaultSort || null)
  const [all, setAll] = useState(false)
  const [full, setFull] = useState(false)
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState(false)
  const effectiveQ = externalSearch != null ? externalSearch : q
  const filtered = useMemo(() => (search && effectiveQ.trim() ? rows.filter(r => search(r, effectiveQ.trim().toLowerCase())) : rows), [rows, effectiveQ, search])
  const sorted = useMemo(() => {
    if (!sortable || !sort) return filtered
    const col = columns.find(c => c.key === sort.key)
    const get = col?.sort || (r => r[sort.key])
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const x = get(a), y = get(b)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir
    })
  }, [filtered, sort, sortable, columns])
  const shown = fixedHeight || all ? sorted : sorted.slice(0, MAX_ROWS)
  const total = useMemo(() => (totalRow ? totalRow(filtered) : null), [totalRow, filtered])
  const cols = isPhone && phoneKeys ? phoneKeys.slice(0, PHONE_COLS).map(k => columns.find(c => c.key === k)).filter(Boolean) : columns
  const textOf = (c, r) => (c.text ? c.text(r) : r[c.key] == null ? '' : String(r[c.key]))
  const csvCols = columns.map(c => ({ label: c.label, csv: r => (c.csv ? c.csv(r) : textOf(c, r)) }))
  const onSort = k => { if (!sortable) return; setSort(s => (s?.key === k ? { key: k, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key: k, dir: columns.find(c => c.key === k)?.num ? 'desc' : 'asc' })) }
  const copy = () => copyText(toTsv(csvCols, sorted)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  const ink = isPhone ? M.ink : IC.t1, muted = isPhone ? M.muted : IC.t3, line = isPhone ? M.line : IC.border
  const th = c => ({ textAlign: c.num ? 'right' : 'left', fontSize: isPhone ? 12 : 10.5, fontWeight: 700, color: sort?.key === c.key ? ink : muted,
    textTransform: isPhone ? 'none' : 'uppercase', letterSpacing: isPhone ? 'normal' : '.05em', padding: isPhone ? '8px 6px' : '6px 8px',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: `1px solid ${line}`, cursor: sortable ? 'pointer' : 'default', userSelect: 'none', background: isPhone ? M.soft : IC.surface })
  const td = c => ({ textAlign: c.num ? 'right' : 'left', fontSize: 12.5, color: c.num ? ink : (isPhone ? M.ink : IC.t2), padding: isPhone ? '0 6px' : '7px 10px', height: isPhone ? 44 : 34,
    whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', maxWidth: c.maxWidth || (isPhone ? 140 : 280), overflow: 'hidden', textOverflow: 'ellipsis' })
  const tdTotal = c => ({ ...td(c), fontWeight: 700, color: ink, borderTop: `1px solid ${line}`, background: isPhone ? M.soft : IC.surface,
    ...(fixedHeight ? { position: 'sticky', bottom: 0, zIndex: 1 } : {}) })
  return (
    <div style={{ minWidth: 0 }}>
      {search && externalSearch == null && (
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={searchPlaceholder || 'Search…'} aria-label={searchPlaceholder || 'Search table'}
          style={{ width: isPhone ? '100%' : 260, boxSizing: 'border-box', marginBottom: 10, minHeight: isPhone ? 44 : 32, fontSize: isPhone ? 16 : 12.5, padding: '0 12px', borderRadius: 9,
            border: `1px solid ${q ? IC.accBorder : (isPhone ? M.line : IC.border2)}`, background: isPhone ? '#fff' : IC.surface, color: ink, fontFamily: 'var(--font)', outline: 'none' }} />
      )}
      <div style={{ overflowX: isPhone ? 'hidden' : 'auto', overflowY: fixedHeight ? 'auto' : undefined, maxHeight: fixedHeight || undefined, minWidth: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: isPhone ? 'fixed' : 'auto' }}>
          <thead><tr>{cols.map((c, i) => (
            <th key={c.key} style={{ ...th(c), ...(fixedHeight ? { position: 'sticky', top: 0, zIndex: 1 } : {}), ...(isPhone && i === 0 ? { width: '36%' } : {}) }} onClick={() => onSort(c.key)} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
              {c.label}{sort?.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
            </th>))}</tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r._key || i} onClick={onRowClick ? () => onRowClick(r) : undefined}
                style={{ cursor: onRowClick ? 'pointer' : 'default', borderBottom: `1px solid ${line}`, ...(rowStyle ? rowStyle(r) : {}) }}>
                {cols.map(c => <td key={c.key} style={td(c)} title={textOf(c, r)}>{c.render ? c.render(r) : textOf(c, r)}</td>)}
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={cols.length} style={{ padding: 16, fontSize: 12.5, color: muted, textAlign: 'center' }}>{emptyText}</td></tr>}
          </tbody>
          {total && (
            <tfoot><tr>{cols.map(c => <td key={c.key} style={tdTotal(c)}>{c.render ? c.render(total) : textOf(c, total)}</td>)}</tr></tfoot>
          )}
        </table>
      </div>
      {!hideExport && (!fixedHeight || (isPhone && phoneKeys && columns.length > PHONE_COLS) || externalSearch == null) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          {!fixedHeight && sorted.length > MAX_ROWS && <button type="button" style={btnStyle(isPhone)} onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${sorted.length}`}</button>}
          {isPhone && phoneKeys && columns.length > PHONE_COLS && <button type="button" style={btnStyle(isPhone)} onClick={() => setFull(true)}>View full table ⤢</button>}
          <span style={{ flex: 1 }} />
          {(externalSearch == null || isPhone) && <>
            <button type="button" style={btnStyle(isPhone)} onClick={copy} aria-live="polite">{copied ? 'Copied ✓' : 'Copy'}</button>
            <button type="button" style={btnStyle(isPhone)} onClick={() => downloadCsv(filename, toCsv(csvCols, sorted))}>CSV</button>
          </>}
        </div>
      )}
      {isPhone && (
        <FullScreenTable open={full} onClose={() => setFull(false)} title={title} note={fullNote} head={columns[0].label}
          cols={columns.slice(1).map(c => c.label)} firstWidth={130}
          rows={sorted.map((r, i) => ({ key: r._key || i, label: textOf(columns[0], r), cells: columns.slice(1).map(c => ({ text: textOf(c, r) })) }))} />
      )}
    </div>
  )
}

// ── KPI tile (desktop / laptop) — same visual language as Inventory Health's KpiTile, plus a
// ▲/▼ delta badge under the value (Health's own tiles have no period-over-period comparison).
function KpiDesk({ label, value, delta, sub, title, neutral, lowerIsBetter }) {
  return (
    <div title={title} className="card-hoverable" style={{
      background: IC.surface, border: `1px solid ${IC.border}`, borderRadius: 16, padding: '12px 16px',
      minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: IC.t3, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 24, fontWeight: 700, color: IC.t1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
        <DeltaBadge delta={delta} neutral={neutral} lowerIsBetter={lowerIsBetter} size={12} />
      </div>
      <span style={{ fontSize: 11.5, color: IC.t3, minHeight: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub || ' '}</span>
    </div>
  )
}

function TrendTip({ active, payload, label, grain, typesInTrend }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload || {}
  const ratio = row.sales > 0 ? row.total / row.sales : null
  return (
    <div style={{ background: '#fff', border: `1px solid ${IC.border2}`, borderRadius: 10, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 14px rgba(0,0,0,.08)', minWidth: 210 }}>
      <div style={{ fontWeight: 700, color: IC.t1, marginBottom: 4 }}>{fmtBucket(label, grain)}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: IC.t2, lineHeight: 1.7 }}>
        <span style={{ width: 14, height: 2, background: IC.t1, flexShrink: 0 }} /><span>Total inward</span>
        <span style={{ marginLeft: 'auto', fontWeight: 700, color: IC.t1, fontVariantNumeric: 'tabular-nums' }}>{fmtUnits(row.total)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: IC.t2, lineHeight: 1.7 }}>
        <span style={{ width: 14, height: 2, background: IC.accBorder, flexShrink: 0 }} /><span>Total sales</span>
        <span style={{ marginLeft: 'auto', fontWeight: 700, color: IC.t1, fontVariantNumeric: 'tabular-nums' }}>{fmtUnits(row.sales)}</span>
      </div>
      {ratio != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: IC.t2, lineHeight: 1.7 }}>
          <span style={{ width: 14, height: 0, borderTop: `2px dashed ${IC.t3}`, flexShrink: 0 }} /><span>Inward ÷ sales</span>
          <span style={{ marginLeft: 'auto', fontWeight: 700, color: ratio > 1 ? IC.negative : IC.t1, fontVariantNumeric: 'tabular-nums' }}>{ratio.toFixed(2)}×</span>
        </div>
      )}
      <div style={{ borderTop: `1px solid ${IC.border}`, marginTop: 4, paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 11, color: IC.t3, marginBottom: 1 }}>Inward by source</div>
        {(typesInTrend || []).filter(t => row[t]).map(t => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, color: IC.t2 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: SOURCE_COLORS[t] || '#6f7d75', flexShrink: 0 }} />
            <span>{t}</span>
            <span style={{ marginLeft: 'auto', fontWeight: 700, color: IC.t1, fontVariantNumeric: 'tabular-nums' }}>{fmtUnits(row[t])}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Legend({ items, isPhone }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 8 }}>
      {items.map(it => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: isPhone ? M.ink : IC.t2 }}>
          {it.line ? <span style={{ width: 14, height: 2, background: it.color }} /> : <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color }} />}
          {it.label}
        </span>
      ))}
    </div>
  )
}

// ── Phone card-list rows (item 4): Top vendors / SKU detail / Product master replace the squeezed,
// inner-scroll table on phone with flat `.li`-style rows (inward_mobile_mockup.html), top 5 + a
// "View all N →" link that opens the shared FullScreenList (search + sort + Total row). No table,
// no nested scroll container anywhere on the base phone card — only the full-screen view scrolls.
// Source tag colours: reused verbatim from the mockup's .dom/.imp/.inh/.unm CSS classes.
const SOURCE_TAG_STYLE = {
  Domestic: { bg: '#e3efe8', fg: '#1f5a3d' },
  Import: { bg: '#e3ecf6', fg: '#2c5a86' },
  Inhouse: { bg: '#fbeedd', fg: '#9a5a12' },
  Unmapped: { bg: '#eee', fg: '#555' },
}
function SourceTag({ sourceType }) {
  const s = SOURCE_TAG_STYLE[sourceType] || SOURCE_TAG_STYLE.Unmapped
  return <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: '2px 6px', marginLeft: 6, background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>{sourceType}</span>
}
// DOI colour bands — same thresholds as Inventory Health / _inventory_shared.js's DOI_BANDS
// (critical ≤2d, low ≤15d, sufficient ≤45d, else excess), reused rather than reinvented.
function doiChipColor(doi) {
  if (doi == null) return { bg: '#eee', fg: '#555' }
  if (doi <= 2) return { bg: '#fde4e1', fg: '#a5321f' }       // Critical (mockup's .lo tone — too little cover)
  if (doi <= 15) return { bg: '#fde4e1', fg: '#a5321f' }      // Low
  if (doi <= 45) return { bg: '#e3efe8', fg: '#1f5a3d' }      // Sufficient (mockup's .ok tone)
  return { bg: '#fbeedd', fg: '#9a5a12' }                     // Excess (mockup's .hi tone — too much cover)
}
function DoiChip({ doi }) {
  const c = doiChipColor(doi)
  return <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: '2px 6px', background: c.bg, color: c.fg }}>DOI {doi == null ? '—' : `${doi}d`}</span>
}
// One `.li` row: name (wraps, never truncates) + right-aligned number, tap → the shared drill-in.
function PhoneLiRow({ name, tag, meta: metaLine, right, rightSub, onClick, first }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, width: '100%',
      padding: '16px 0', minHeight: 44, border: 'none', borderTop: first ? 'none' : `1px solid ${M.line}`,
      background: 'none', textAlign: 'left', fontFamily: 'var(--font)', cursor: 'pointer',
    }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: M.ink, overflowWrap: 'anywhere' }}>{name}{tag}</span>
        {metaLine && <span style={{ display: 'block', fontSize: 11.5, color: M.muted, marginTop: 2 }}>{metaLine}</span>}
      </span>
      <span style={{ textAlign: 'right', flexShrink: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: M.ink, fontVariantNumeric: 'tabular-nums' }}>{right}</span>
        {rightSub && <span style={{ display: 'block', fontSize: 11, color: M.muted, marginTop: 1 }}>{rightSub}</span>}
      </span>
    </button>
  )
}
function ViewAllLink({ n, noun, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'block', width: '100%', textAlign: 'center', fontSize: 13, fontWeight: 700, color: M.green,
      padding: '10px 0 2px', border: 'none', borderTop: `1px solid ${M.line}`, marginTop: 4, background: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
    }}>View all {fmtUnits(n)} {noun} →</button>
  )
}

// Top vendors phone card: top 5 by units + "View all" full-screen list. Tapping any row (base card
// or full-screen) opens the shared LastGrnDrill — same drill-in as desktop's table rows.
function VendorPhoneCard({ vendors, onDrill }) {
  const top5 = useMemo(() => [...vendors].sort((a, b) => b.units - a.units).slice(0, 5), [vendors])
  const [full, setFull] = useState(false)
  const name = v => v.vendor
  const sorts = [
    { key: 'units', label: 'Units', value: v => v.units, format: v => fmtUnits(v.units) },
    { key: 'grns', label: 'GRNs', value: v => v.grns, format: v => fmtUnits(v.grns) },
    { key: 'lastGrn', label: 'Last GRN', value: v => v.lastGrn || '', format: v => fmtDayYear(v.lastGrn) },
  ]
  return (
    <Card isPhone title="Top vendors" sub={`${vendors.length} · by units`}>
      {top5.map((v, i) => (
        <PhoneLiRow key={v.vendor} first={i === 0} onClick={() => onDrill({ mode: 'vendor', id: v.vendor, subtitle: v.sourceType })}
          name={v.vendor} tag={<SourceTag sourceType={v.sourceType} />}
          meta={`${fmtUnits(v.grns)} GRN${v.grns === 1 ? '' : 's'} · ${fmtUnits(v.skus)} SKU${v.skus === 1 ? '' : 's'} · ${fmtDayYear(v.lastGrn)}`}
          right={fmtUnits(v.units)} rightSub="units" />
      ))}
      {vendors.length > 5 && <ViewAllLink n={vendors.length} noun="vendors" onClick={() => setFull(true)} />}
      <FullScreenList open={full} onClose={() => setFull(false)} title="Top vendors" noun="vendors" items={vendors} sorts={sorts} initialSort="units"
        name={name} sub={v => `${fmtUnits(v.grns)} GRNs · ${fmtUnits(v.skus)} SKUs · ${fmtDayYear(v.lastGrn)}`} secondary={() => null}
        searchText={name} badge={v => <SourceTag sourceType={v.sourceType} />}
        onSelect={v => { setFull(false); onDrill({ mode: 'vendor', id: v.vendor, subtitle: v.sourceType }) }} />
    </Card>
  )
}

// SKU detail phone card: top 5 by units (By SKU / By sub-category toggle carries into the
// full-screen view), each row SKU + sub-category + stock/DOI/last-inward, tap → drill-in.
function SkuPhoneCard({ skuRows, subCatRows, skuView, setSkuView, invLoading, onDrill }) {
  const isSku = skuView === 'sku'
  const rows = isSku ? skuRows : subCatRows
  const top5 = useMemo(() => [...rows].sort((a, b) => b.units - a.units).slice(0, 5), [rows])
  const [full, setFull] = useState(false)
  const name = r => (isSku ? r.sku : r.subCategory)
  const sorts = [
    { key: 'units', label: 'Units', value: r => r.units, format: r => fmtUnits(r.units) },
    { key: 'stock', label: 'Stock', value: r => r.stock ?? -1, format: r => (r.stock == null ? (invLoading ? '…' : '—') : fmtUnits(r.stock)) },
    { key: 'doi', label: 'DOI', value: r => r.doi ?? -1, format: r => (r.doi == null ? '—' : `${r.doi}d`) },
  ]
  const metaOf = r => `Stock ${r.stock == null ? (invLoading ? '…' : '—') : fmtUnits(r.stock)} · last inward ${fmtDayYear(r.lastInward)}`
  return (
    <Card isPhone title="SKU detail"
      action={<Seg isPhone label="SKU detail view" value={skuView} onChange={setSkuView} options={[{ value: 'sku', label: 'By SKU' }, { value: 'subcat', label: 'Sub-cat' }]} />}>
      {top5.map((r, i) => (
        <PhoneLiRow key={isSku ? r.skuKey : r.subCategory} first={i === 0}
          onClick={() => onDrill(isSku ? { mode: 'sku', id: r.sku, subtitle: r.subCategory } : { mode: 'subcat', id: r.subCategory, subtitle: r.category })}
          name={isSku ? r.sku : r.subCategory}
          meta={<>{isSku && <span style={{ display: 'block' }}>{r.subCategory}</span>}<span style={{ display: 'block', marginTop: 1 }}>{metaOf(r)}</span></>}
          right={fmtUnits(r.units)} rightSub={<>inward Qty<span style={{ display: 'block', marginTop: 1 }}><DoiChip doi={r.doi} /></span></>} />
      ))}
      {rows.length > 5 && <ViewAllLink n={rows.length} noun={isSku ? 'SKUs' : 'sub-categories'} onClick={() => setFull(true)} />}
      <FullScreenList open={full} onClose={() => setFull(false)} title="SKU detail" noun={isSku ? 'SKUs' : 'sub-categories'} items={rows} sorts={sorts} initialSort="units"
        name={name} sub={r => metaOf(r)} secondary={() => null} searchText={r => `${name(r)} ${r.subCategory || ''}`}
        onSelect={r => { setFull(false); onDrill(isSku ? { mode: 'sku', id: r.sku, subtitle: r.subCategory } : { mode: 'subcat', id: r.subCategory, subtitle: r.category }) }} />
    </Card>
  )
}

// Product master phone card: search box only (no base row list) — typing/tapping opens a full-screen
// search view (same card-row style). Items come from the full master list; FullScreenList's own
// built-in search box drives it, so this card's search field just opens the view already focused.
function ProductMasterPhoneCard({ rows, invLoading, onDrill }) {
  const [full, setFull] = useState(false)
  const name = r => r.sku
  const sorts = [
    { key: 'lastInward', label: 'Last inward', value: r => r.lastInward || '', format: r => fmtDayYear(r.lastInward) },
    { key: 'rangeQty', label: 'Inward (range)', value: r => r.rangeQty, format: r => fmtUnits(r.rangeQty) },
    { key: 'stock', label: 'Stock', value: r => r.stock ?? -1, format: r => (r.stock == null ? (invLoading ? '…' : '—') : fmtUnits(r.stock)) },
  ]
  return (
    <Card isPhone title="Product master" sub={`${fmtUnits(rows.length)} SKUs`}>
      <button type="button" onClick={() => setFull(true)} style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: M.soft, border: `1px solid ${M.line}`, borderRadius: 12,
        padding: '10px 12px', fontSize: 13, color: M.muted, fontFamily: 'var(--font)', cursor: 'pointer', textAlign: 'left',
      }}>⌕ Search any SKU, even if not inwarded</button>
      <FullScreenList open={full} onClose={() => setFull(false)} title="Product master" noun="SKUs" items={rows} sorts={sorts} initialSort="lastInward"
        name={name} sub={r => `${r.subCategory || r.category || ''}`}
        secondary={r => `Stock ${r.stock == null ? (invLoading ? '…' : '—') : fmtUnits(r.stock)} · ${r.doi == null ? 'DOI —' : `DOI ${r.doi}d`}`}
        searchText={r => `${r.sku} ${r.category || ''} ${r.subCategory || ''}`}
        onSelect={r => { setFull(false); onDrill({ mode: 'sku', id: r.sku, subtitle: r.subCategory }) }} />
    </Card>
  )
}

// Vendor master phone card: every vendor ever used (3rd-party + Inhouse, Internal excluded), from
// GRN_FLOOR — independent of the selected range (a vendor with no GRN in the current window still
// shows up, with its true lifetime totals and last-ever GRN date). Same search-only entry → full-
// screen pattern as Product master. "Products supplied" = sub-categories, lifetime, highest-units
// first (the vendor drill-down's own "SKUs supplied" list is range-bound and SKU-level; this is the
// master list's lifetime, sub-category-level equivalent).
function VendorMasterPhoneCard({ rows, onDrill }) {
  const [full, setFull] = useState(false)
  const name = r => r.vendor
  const sorts = [
    { key: 'lastGrn', label: 'Last GRN', value: r => r.lastGrn || '', format: r => fmtDayYear(r.lastGrn) },
    { key: 'rangeUnits', label: 'Units (range)', value: r => r.rangeUnits, format: r => fmtUnits(r.rangeUnits) },
    { key: 'lifetimeUnits', label: 'Lifetime units', value: r => r.lifetimeUnits, format: r => fmtUnits(r.lifetimeUnits) },
  ]
  return (
    <Card isPhone title="Vendor master" sub={`${fmtUnits(rows.length)} vendors · since Apr-25`}>
      <button type="button" onClick={() => setFull(true)} style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: M.soft, border: `1px solid ${M.line}`, borderRadius: 12,
        padding: '10px 12px', fontSize: 13, color: M.muted, fontFamily: 'var(--font)', cursor: 'pointer', textAlign: 'left',
      }}>⌕ Search any vendor, even if not inwarded in this range</button>
      <FullScreenList open={full} onClose={() => setFull(false)} title="Vendor master" noun="vendors" items={rows} sorts={sorts} initialSort="lastGrn"
        name={name} sub={r => `${r.sourceType} · Lifetime ${fmtUnits(r.lifetimeGrns)} GRNs · ${fmtUnits(r.lifetimeUnits)} units · ${fmtUnits(r.skuCount)} SKUs`}
        searchText={r => `${r.vendor} ${r.sourceType || ''}`} rowLayout="line"
        onSelect={r => { setFull(false); onDrill({ mode: 'vendor', id: r.vendor, subtitle: r.sourceType }) }} />
    </Card>
  )
}

// ── Phone filter sheet: SKU search + one row per filter (level 2 = shared FilterPicker) ──
function InwardFilterSheet({ open, onClose, opts, filters, setFilters }) {
  // Mounted only while open (see the page), so the search box starts from the applied value each time.
  const [pick, setPick] = useState(null)
  const [sku, setSku] = useState(filters.sku || '')
  const close = () => { setPick(null); if ((sku || '') !== (filters.sku || '')) setFilters(f => ({ ...f, sku: sku.trim() })); onClose() }
  const subOpts = (opts.subCategories || []).filter(s => !(filters.category?.length) || filters.category.includes(s.category))
  const rows = [
    { key: 'warehouse', label: 'Warehouse', options: (opts.warehouses || []).map(v => ({ value: v })), noun: 'warehouses' },
    { key: 'sourceType', label: 'Source type', options: (opts.sourceTypes || []).map(v => ({ value: v })), noun: 'source types' },
    { key: 'vendor', label: 'Vendor', options: (opts.vendors || []).map(v => ({ value: v.vendor, sub: v.sourceType })), noun: 'vendors' },
    { key: 'category', label: 'Category', options: (opts.categories || []).map(v => ({ value: v })), noun: 'categories' },
    { key: 'subCategory', label: 'Sub-category', options: subOpts.map(s => ({ value: s.subCategory, sub: s.category })), noun: 'sub-categories' },
  ]
  const picking = rows.find(r => r.key === pick)
  return (
    <BottomSheet open={open} onClose={close} title="Inward filters">
      {picking ? (
        <FilterPicker key={picking.key} title={picking.label} noun={picking.noun} options={picking.options} selected={filters[picking.key] || []}
          onBack={() => setPick(null)} onApply={v => { setFilters(f => ({ ...f, [picking.key]: v, ...(picking.key === 'category' ? { subCategory: [] } : {}) })); setPick(null) }} />
      ) : (
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: M.muted, marginBottom: 6 }} htmlFor="inward-sku-search">SKU search</label>
          <input id="inward-sku-search" value={sku} onChange={e => setSku(e.target.value)} placeholder="SKU code or sub-category"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 46, fontSize: 16, padding: '0 12px', borderRadius: 12, border: `1px solid ${M.line}`, fontFamily: 'var(--font)', marginBottom: 8 }} />
          {rows.map(r => {
            const sel = filters[r.key] || []
            return (
              <button key={r.key} type="button" onClick={() => setPick(r.key)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', minHeight: 56, padding: '8px 0', border: 'none', borderTop: `1px solid ${M.line}`, background: 'none', textAlign: 'left', fontFamily: 'var(--font)', cursor: 'pointer' }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: M.ink }}>{r.label}</span>
                  <span style={{ display: 'block', fontSize: 12.5, marginTop: 2, color: sel.length ? M.green : M.muted, fontWeight: sel.length ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sel.length ? sel.join(', ') : 'All'}</span>
                </span>
                <span style={{ fontSize: 12, color: M.muted, whiteSpace: 'nowrap' }}>{r.options.length} ›</span>
              </button>
            )
          })}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => { setSku(''); setFilters({}) }}
              style={{ flex: 1, minHeight: 46, borderRadius: 12, border: `1px solid ${M.line}`, background: '#fff', color: M.ink, fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>Reset</button>
            <button type="button" onClick={close}
              style={{ flex: 1, minHeight: 46, borderRadius: 12, border: 'none', background: M.green, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>Done</button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

// ── Desktop filter panel body (shared by the popover below) ─────────────────────────────
function DesktopFilterFields({ opts, filters, setFilters }) {
  const [sku, setSku] = useState(filters.sku || '')
  // A chip removal / Clear all changes filters.sku from outside: follow it (adjusting during render).
  const [seenSku, setSeenSku] = useState(filters.sku || '')
  if ((filters.sku || '') !== seenSku) { setSeenSku(filters.sku || ''); setSku(filters.sku || '') }
  useEffect(() => {
    if ((sku || '') === (filters.sku || '')) return
    const t = setTimeout(() => setFilters(f => ({ ...f, sku: sku.trim() })), 400)
    return () => clearTimeout(t)
  }, [sku]) // eslint-disable-line react-hooks/exhaustive-deps
  const subOpts = (opts.subCategories || []).filter(s => !(filters.category?.length) || filters.category.includes(s.category)).map(s => s.subCategory)
  const set = k => v => setFilters(f => ({ ...f, [k]: v, ...(k === 'category' ? { subCategory: [] } : {}) }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 230 }}>
      <input value={sku} onChange={e => setSku(e.target.value)} placeholder="Search SKU…" aria-label="SKU search"
        style={{ height: 34, width: '100%', boxSizing: 'border-box', borderRadius: 8, border: `1px solid ${sku ? IC.accBorder : IC.border2}`, padding: '0 10px', fontSize: 12.5, color: IC.t1, background: IC.surface, fontFamily: 'var(--font)', outline: 'none' }} />
      <SearchableMultiSelect label="Warehouse" options={opts.warehouses || []} selected={filters.warehouse || []} onChange={set('warehouse')} width="100%" />
      <SearchableMultiSelect label="Source type" options={opts.sourceTypes || []} selected={filters.sourceType || []} onChange={set('sourceType')} width="100%" />
      <SearchableMultiSelect label="Vendor" options={(opts.vendors || []).map(v => v.vendor)} selected={filters.vendor || []} onChange={set('vendor')} width="100%" />
      <SearchableMultiSelect label="Category" options={opts.categories || []} selected={filters.category || []} onChange={set('category')} width="100%" />
      <SearchableMultiSelect label="Sub-category" options={[...new Set(subOpts)]} selected={filters.subCategory || []} onChange={set('subCategory')} width="100%" />
      {inwardFilterCount(filters) > 0 && (
        <button type="button" onClick={() => setFilters({})} style={{ ...btnStyle(false), height: 34, color: IC.negative, width: '100%' }}>Clear all</button>
      )}
    </div>
  )
}

// ── Single "Filters" button → popover panel (same pattern as Inventory Health) ───────────
function FiltersButton({ opts, filters, setFilters }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest('[data-smsel-panel]')) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  const activeCount = inwardFilterCount(filters)
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 7, border: `1px solid ${activeCount > 0 ? IC.accBorder : IC.border2}`, background: activeCount > 0 ? IC.accDim : IC.surface, color: IC.t1, cursor: 'pointer', fontFamily: 'var(--font)' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" /></svg>
        Filters
        {activeCount > 0 && <span style={{ background: IC.accBorder, color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px', minWidth: 16, textAlign: 'center' }}>{activeCount}</span>}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 200, background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 9, boxShadow: '0 8px 28px rgba(0,0,0,.18)', padding: 12, maxHeight: '70vh', overflowY: 'auto' }}>
          <DesktopFilterFields opts={opts} filters={filters} setFilters={setFilters} />
        </div>
      )}
    </div>
  )
}

// Small "i" circle → popover with the ratio/finished-goods notes (desktop only; phone keeps the
// always-visible lines under the master card, matching the mockup's inline ⓘ convention there).
function InfoTip({ text }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="Inward notes"
        style={{ display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', border: `1px solid ${IC.border2}`, background: open ? IC.accDim : IC.surface, color: IC.t3, fontSize: 11, fontStyle: 'italic', fontWeight: 700, fontFamily: 'var(--font)', cursor: 'pointer', padding: 0 }}>
        i
      </button>
      {open && (
        <div role="dialog" style={{ position: 'absolute', top: '125%', right: 0, zIndex: 200, width: 280, background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 9, boxShadow: '0 8px 28px rgba(0,0,0,.18)', padding: '10px 12px', fontSize: 12, color: IC.t2, lineHeight: 1.5 }}>
          {text}
        </div>
      )}
    </div>
  )
}

// Removable "Filtered:" chips (both layouts).
function FilterChips({ filters, setFilters, isPhone }) {
  const items = []
  for (const [k, label] of [['warehouse', 'Warehouse'], ['sourceType', 'Source'], ['vendor', 'Vendor'], ['category', 'Category'], ['subCategory', 'Sub-category']]) {
    for (const v of filters[k] || []) items.push({ k, v, text: `${label}: ${v}` })
  }
  if (filters.sku) items.push({ k: 'sku', v: filters.sku, text: `SKU: ${filters.sku}` })
  if (!items.length) return null
  const remove = it => setFilters(f => (it.k === 'sku' ? { ...f, sku: '' } : { ...f, [it.k]: (f[it.k] || []).filter(x => x !== it.v) }))
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minWidth: 0 }}>
      <span style={{ fontSize: 12, color: isPhone ? M.muted : IC.t3 }}>Filtered:</span>
      {items.map(it => (
        <button key={it.k + it.v} type="button" onClick={() => remove(it)} aria-label={`Remove ${it.text}`}
          style={{ minHeight: isPhone ? 44 : 26, fontSize: 12, padding: '0 12px', borderRadius: 999, border: `1px solid ${IC.accBorder}`, background: isPhone ? '#e9f3ed' : IC.accDim, color: isPhone ? M.green : IC.t1, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {it.text} ✕
        </button>
      ))}
    </div>
  )
}

// ── SKU drill-down ──────────────────────────────────────────────────────────────────────────
// Drill-down for a SKU or vendor row: its last 10 distinct GRN days (full history, not bound by
// the page's date filter), each with that day's total units and GRN count. Same shape for both —
// mode: 'sku' (id = SKU code) or 'vendor' (id = unified vendor name).
function LastGrnDrill({ mode, id, subtitle, isPhone, onClose, range }) {
  const { data, loading, error } = useLastGrnDays(mode, id, range)
  useEffect(() => {
    if (isPhone) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPhone, onClose])
  // Vendor drill-downs are already filtered to one vendor (shown via `subtitle` already); for SKU/
  // sub-category drill-downs, roll up vendors across all returned days into one deduplicated,
  // highest-units-first list, shown once in the header next to the sub-category — not per row.
  const vendorsLine = useMemo(() => {
    if (mode === 'vendor' || !data?.rows?.length) return null
    const totals = new Map()
    for (const r of data.rows) for (const v of r.vendors || []) totals.set(v.vendor, (totals.get(v.vendor) || 0) + v.units)
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([vendor]) => vendor).join(', ')
  }, [mode, data])
  const dayCols = [
    { key: 'date', label: 'Date', text: r => fmtDayYear(r.date), csv: r => r.date, sort: r => r.date },
    { key: 'units', label: 'Units', num: true, text: r => fmtUnits(r.units), csv: r => r.units },
    { key: 'grnCount', label: 'GRNs', num: true, text: r => fmtUnits(r.grnCount), csv: r => r.grnCount },
  ]
  // Vendor bottom sheet addition: "SKUs supplied" — SKU · sub-category · units in the page's
  // selected range (not full history, unlike the last-10-GRN-days table above), top 10 + "Show all".
  const skuSuppliedCols = [
    { key: 'sku', label: 'SKU', text: r => r.sku },
    { key: 'subCategory', label: 'Sub-category', text: r => r.subCategory, maxWidth: 200 },
    { key: 'units', label: 'Units', num: true, text: r => fmtUnits(r.units), csv: r => r.units },
  ]
  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {loading && <div style={{ height: 240, borderRadius: 12, background: IC.page }} aria-busy="true" />}
      {error && <div style={{ fontSize: 12.5, color: IC.negative }}>⚠ {error}</div>}
      {data && (
        data.rows.length
          ? <InwardTable columns={dayCols} rows={data.rows.map((r, i) => ({ ...r, _key: `${r.date}-${i}` }))} isPhone={isPhone}
              title={`${id} · last ${data.rows.length} GRN days`} filename={`inward_last10_${id}.csv`} defaultSort={{ key: 'date', dir: 'desc' }}
              sortable={false} phoneKeys={['date', 'units', 'grnCount']} emptyText="No GRN days found." hideExport />
          : <div style={{ fontSize: 12.5, color: IC.t3 }}>No GRN days found (since Apr-25).</div>
      )}
      {mode === 'vendor' && data?.skusSupplied && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: isPhone ? M.ink : IC.t1, marginBottom: 6 }}>SKUs supplied{range ? ` · ${fmtRange(range.start, range.end)}` : ''}</div>
          {!data.skusSupplied.length ? (
            <div style={{ fontSize: 12.5, color: IC.t3 }}>No SKUs in this range.</div>
          ) : isPhone ? (
            // Flat card-rows instead of a cramped 3-column table — sub-category names are long
            // ("Orthotics Heel Protector") and were getting cut off with "…" in a fixed-width cell.
            <div>
              {data.skusSupplied.map((r, i) => (
                <PhoneLiRow key={`${r.sku}-${i}`} first={i === 0} name={r.sku}
                  meta={r.subCategory} right={fmtUnits(r.units)} rightSub="units" />
              ))}
            </div>
          ) : (
            <InwardTable columns={skuSuppliedCols} rows={data.skusSupplied.map((r, i) => ({ ...r, _key: `${r.sku}-${i}` }))} isPhone={false}
              title={`${id} · SKUs supplied`} filename={`inward_skus_supplied_${id}.csv`} defaultSort={{ key: 'units', dir: 'desc' }} hideExport />
          )}
        </div>
      )}
    </div>
  )
  const title = `${id} · last ${data?.rows?.length || 10} GRN days`
  const fullSubtitle = [subtitle, vendorsLine].filter(Boolean).join(' · ')
  if (isPhone) return <BottomSheet open onClose={onClose} title={title} subtitle={fullSubtitle}>{body}</BottomSheet>
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: C.z.modal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)' }} />
      <div role="dialog" aria-modal="true" aria-label={title} style={{ position: 'relative', width: 'min(520px, 94vw)', maxHeight: '90vh', overflowY: 'auto', background: IC.surface, borderRadius: 16, padding: '18px 20px', boxShadow: '0 12px 40px rgba(0,0,0,.25)', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: IC.t1 }}>{title}</div>
            {fullSubtitle && <div style={{ fontSize: 12, color: IC.t3 }}>{fullSubtitle}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: IC.page, fontSize: 18, cursor: 'pointer', color: IC.t1 }}>×</button>
        </div>
        {body}
      </div>
    </div>,
    document.body,
  )
}

// ── Phone master card (INWARD_MOBILE_PROMPT.md §2): same pattern as Sales & Allocation's phone
// "Revenue" master card (MasterTrendCard) — light-green gradient card, big Inward units value,
// area chart with sales as a dashed overlay, legend, then 6 tappable tiles (2×3). Assumption (noted
// in the report): MasterTrendCard's built-in `prevPoint` mechanism (normally "previous period,
// dashed") is reused here to draw the SALES series dashed alongside Inward units (solid) instead —
// the mockup wants both series on screen together regardless of which tile is selected, which the
// component doesn't otherwise support; Inward's own tile keeps its real ▲/▼ vs previous period via
// `delta`, unaffected by this reuse of `prevPoint` for the chart only.
function PhoneMasterCard({ k, delta, trend, grain, meta, layout }) {
  const salesPoint = r => r.sales
  const metrics = [
    {
      key: 'units', label: 'Inward units', value: fmtUnits(k.cur.units), sub: `Avg ${fmtUnits(k.cur.units / (meta.days || 1))}/day · ${fmtUnits(k.cur.grns)} GRNs`,
      delta: delta('units'), deltaNeutral: true, point: r => r.total, prevPoint: salesPoint, fmtPoint: fmtUnits,
      def: '3rd-party (Domestic/Import) + Inhouse units received in GRNs (pack-adjusted). Chart: solid = inward, dashed = sales.',
    },
    { key: 'grns', label: 'GRNs', value: fmtUnits(k.cur.grns), delta: delta('grns'), deltaNeutral: true, sub: 'distinct GRN codes', point: r => r.total, prevPoint: salesPoint, fmtPoint: fmtUnits, def: 'Distinct GRN codes in the period.' },
    { key: 'skus', label: 'SKUs received', value: fmtUnits(k.cur.skus), sub: `${fmtUnits(k.cur.newSkus)} new`, deltasHidden: true, point: r => r.total, prevPoint: salesPoint, fmtPoint: fmtUnits, def: 'Distinct SKUs received; "new" = never received before (since Apr-25).' },
    { key: 'vendors', label: 'Active vendors', value: fmtUnits(k.cur.vendors), delta: delta('vendors'), deltaNeutral: true, sub: 'with ≥1 GRN', point: r => r.total, prevPoint: salesPoint, fmtPoint: fmtUnits, def: 'Vendors (unified name) with at least one GRN.' },
    {
      key: 'ratio', label: 'Inward ÷ sales', value: fmtRatio(k.cur.ratio), status: k.cur.ratio > 1 ? 'warn' : undefined,
      sub: k.cur.ratio > 1 ? 'stock building' : `sales ${fmtUnits(k.cur.salesUnits)} units`, deltasHidden: true,
      point: r => (r.sales > 0 ? r.total / r.sales : null), fmtPoint: fmtRatio, def: 'Inward units ÷ sales units, same period. Above 1 (amber) = stock building.',
    },
    { key: 'rejectionPct', label: 'Rejection %', value: fmtPct(k.cur.rejectionPct), delta: delta('rejectionPct'), lowerIsBetter: true, sub: `${fmtUnits(k.cur.rejected)} units`, point: r => r.total, prevPoint: salesPoint, fmtPoint: fmtUnits, def: 'Rejected units ÷ (received + rejected), 3rd-party + Inhouse only.' },
  ]
  return (
    <MasterTrendCard metrics={metrics} rawRows={trend} groupTrend={rows => rows} start={meta.start} end={meta.end} layout={layout} granularity={grain} />
  )
}

// ── The page ──────────────────────────────────────────────────────────────────────────────
export default function InwardPage({ data, loading, error, status, invData, invLoading, filters, setFilters, sidebarTop, sheetOpen, setSheetOpen }) {
  const { isPhone, width } = usePhone()
  const [grainSel, setGrainSel] = useState('auto')
  const [drill, setDrill] = useState(null)
  const [dqOpen, setDqOpen] = useState(false)
  const { fetchRows: fetchDqRows, loading: dqExportLoading } = useDqExport()
  const [vendorSearch, setVendorSearch] = useState('')
  const [skuSearchQ, setSkuSearchQ] = useState('')
  const [skuView, setSkuView] = useState('sku') // 'sku' | 'subcat' — SKU detail table's roll-up toggle
  const [masterSearch, setMasterSearch] = useState('')
  const [vendorMasterSearch, setVendorMasterSearch] = useState('')

  const meta = data?.meta
  const opts = data?.filterOptions || {}
  const k = data?.kpis
  const idx = useMemo(() => stockIndex(invData), [invData])
  const skuRows = useMemo(() => attachStock(data?.skus, idx), [data?.skus, idx])
  // Sub-category roll-up of skuRows: units/GRNs summed, stock/avg sale summed, DOI recomputed from
  // the summed stock ÷ summed avg sale (not an average of per-SKU DOIs — DOI isn't additive, but a
  // ratio of two summed, additive quantities is a meaningful "blended" DOI for the group).
  const subCatRows = useMemo(() => {
    const m = new Map()
    for (const s of skuRows) {
      const key = s.subCategory || 'Uncategorized'
      if (!m.has(key)) m.set(key, { subCategory: key, category: s.category, units: 0, grns: 0, stock: 0, avgSale: 0, hasStock: false, skuCount: 0, lastInward: null })
      const g = m.get(key)
      g.units += s.units; g.grns += s.grns; g.skuCount += 1
      if (s.stock != null) { g.stock += s.stock; g.hasStock = true }
      if (s.avgSale != null) g.avgSale += s.avgSale
      if (!g.lastInward || (s.lastInward && s.lastInward > g.lastInward)) g.lastInward = s.lastInward
    }
    return [...m.values()].map(g => ({
      ...g, _key: g.subCategory, sku: g.subCategory,
      stock: g.hasStock ? g.stock : null, avgSale: g.hasStock ? g.avgSale : null,
      doi: g.hasStock && g.avgSale > 0 ? Math.floor(g.stock / g.avgSale) : null,
    })).sort((a, b) => b.units - a.units)
  }, [skuRows])
  // Product master: every SKU in the SKU master (data.masterSkus, built server-side independent of
  // the selected date range), with the same current stock / Avg sale / DOI attached from Inventory
  // Health's feed as skuRows above — so a SKU with zero GRNs in the selected range still shows up
  // with its true last-ever inward date/qty/vendor(s), not just rows that had activity in range.
  const productMasterRows = useMemo(() => attachStock(data?.masterSkus, idx), [data?.masterSkus, idx])
  const grain = grainSel === 'auto' ? autoGrain(meta?.days || 0) : grainSel
  const trend = useMemo(() => rollup(data?.daily || [], grain).map(r => ({ ...r, ratio: r.sales > 0 ? r.total / r.sales : null })), [data?.daily, grain])
  const typesInTrend = useMemo(() => (opts.sourceTypes || SOURCE_TYPES).filter(t => (data?.daily || []).some(d => d[t])), [opts.sourceTypes, data?.daily])
  const toggleSource = t => setFilters(f => { const cur = f.sourceType || []; return { ...f, sourceType: cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t] } })

  const ink = isPhone ? M.ink : IC.t1, muted = isPhone ? M.muted : IC.t3
  const gap = isPhone ? 12 : 16
  const sideBySide = !isPhone && width >= 1280

  if (status === 403 && !data) {
    return (
      <div style={{ padding: isPhone ? 16 : 24, display: 'flex', flexDirection: 'column', gap: 12 }}>{!isPhone && sidebarTop}
        <Card isPhone={isPhone} title="No access to Inward"><div style={{ fontSize: 13, color: muted }}>Ask an admin to give you <b>Inventory → Inward</b> in Profile → Team.</div></Card>
      </div>
    )
  }

  const rangeLine = meta ? `${fmtRange(meta.start, meta.end)} · ▲/▼ vs ${fmtRange(meta.prevStart, meta.prevEnd)}` : ''
  const delta = key => pctChange(k?.cur?.[key], k?.prev?.[key])
  const kpiList = k ? [
    { id: 'units', label: 'Inward units', value: fmtUnits(k.cur.units), delta: delta('units'), sub: `${fmtUnits(k.cur.rejected)} rejected`, def: '3rd-party (Domestic/Import) + Inhouse units received in GRNs (pack-adjusted), SKUs in the SKU master only. Internal transfers are excluded.' },
    { id: 'grns', label: 'GRNs', value: fmtUnits(k.cur.grns), delta: delta('grns'), sub: 'distinct GRN codes', def: 'Distinct GRN codes in the period.' },
    { id: 'skus', label: 'SKUs received', short: 'SKUs', value: fmtUnits(k.cur.skus), delta: delta('skus'), sub: 'distinct SKUs', def: 'Distinct SKUs received.' },
    { id: 'vendors', label: 'Active vendors', short: 'Vendors', value: fmtUnits(k.cur.vendors), delta: delta('vendors'), sub: 'with at least 1 GRN', def: 'Vendors (unified name) with at least one GRN.' },
    { id: 'ratio', label: 'Inward ÷ sales', short: 'In ÷ sales', value: fmtRatio(k.cur.ratio), delta: delta('ratio'), sub: `sales ${fmtUnits(k.cur.salesUnits)} units`, def: 'Inward units (3rd-party + Inhouse) ÷ sales units (B2C+B2B+PO) in the same period. Above 1 = stock building.', neutral: true },
    { id: 'rejectionPct', label: 'Rejection %', value: fmtPct(k.cur.rejectionPct), delta: delta('rejectionPct'), sub: `${fmtUnits(k.cur.rejected)} units rejected`, def: 'Rejected units ÷ (received + rejected) in the period, 3rd-party + Inhouse only.', lowerIsBetter: true },
    { id: 'newSkus', label: 'New SKUs', value: fmtUnits(k.cur.newSkus), sub: 'never received before', def: 'SKUs whose first-ever inward GRN (since Apr-25) falls inside the selected date range — not just "not received last period". Dynamic to any range picked.', neutral: true },
  ] : []
  // Always one row: as many columns as tiles, so adding/removing a KPI never wraps the row.
  const kpiCols = kpiList.length || 1

  // Finished-goods note: must use the SAME excluded-units figure as the Data quality panel for the
  // selected range. Data quality's "SKUs not in master" count (dataQuality.unmappedSku.units) is GRN
  // lines that fail to resolve to the SKU master (raw-material/packaging codes chief among them) —
  // a different, larger number than meta.excludedPkgUnits (only the lines whose code literally
  // contains "PKG", already dropped before resolution even runs). Admins see dataQuality, so for them
  // the note uses that same figure the Data quality panel shows; non-admins (no dataQuality in the
  // payload) keep the PKG-only figure as the best available approximation.
  const finishedGoodsUnits = data?.dataQuality ? data.dataQuality.unmappedSku.units : (meta?.excludedPkgUnits || 0)
  const finishedGoodsNote = `Finished goods only · ${fmtUnits(finishedGoodsUnits)} units of raw material / packaging / unresolved SKUs not shown`

  // ── Tables ──
  const vendorCols = [
    { key: 'vendor', label: 'Vendor', text: r => r.vendor, maxWidth: 260 },
    { key: 'sourceType', label: 'Source', text: r => r.sourceType },
    { key: 'grns', label: 'GRNs', num: true, text: r => fmtUnits(r.grns), csv: r => r.grns },
    { key: 'units', label: 'Units', num: true, text: r => fmtUnits(r.units), csv: r => r.units },
    { key: 'skus', label: 'SKUs', num: true, text: r => fmtUnits(r.skus), csv: r => r.skus },
    { key: 'lastGrn', label: 'Last GRN', text: r => fmtDayYear(r.lastGrn), csv: r => r.lastGrn, sort: r => r.lastGrn },
  ]
  // GRNs/units sum across vendors; SKUs is a distinct count so a plain sum would double-count
  // SKUs shared by several vendors — shown as "—" instead of a misleading number.
  const vendorTotalRow = rs => {
    const grns = rs.reduce((a, r) => a + r.grns, 0), units = rs.reduce((a, r) => a + r.units, 0)
    return { _key: 'total', vendor: `Total (${rs.length} vendors)`, sourceType: '', grns, units, skus: null, lastGrn: null }
  }
  const skuCols = [
    { key: 'sku', label: 'SKU', text: r => r.sku },
    { key: 'subCategory', label: 'Sub-category', text: r => r.subCategory, maxWidth: 220 },
    { key: 'units', label: 'Inward units', num: true, text: r => fmtUnits(r.units), csv: r => r.units },
    { key: 'stock', label: 'Current stock', num: true, text: r => (r.stock == null ? (invLoading ? '…' : '—') : fmtUnits(r.stock)), csv: r => r.stock ?? '' },
    { key: 'avgSale', label: 'Avg sale /day', num: true, text: r => (r.avgSale == null ? '—' : fmtUnits(r.avgSale)), csv: r => r.avgSale ?? '' },
    { key: 'doi', label: 'DOI', num: true, text: r => (r.doi == null ? '—' : `${r.doi} d`), csv: r => r.doi ?? '' },
    { key: 'lastInward', label: 'Last inward', text: r => fmtDayYear(r.lastInward), csv: r => r.lastInward, sort: r => r.lastInward },
  ]
  // Units sum across SKUs; stock/avg sale/DOI are per-SKU snapshot figures, not meaningful
  // summed (DOI especially — it isn't additive), so they're left blank on the total row.
  const skuTotalRow = rs => ({
    _key: 'total', sku: `Total (${rs.length} SKUs)`, subCategory: '',
    units: rs.reduce((a, r) => a + r.units, 0),
    stock: null, avgSale: null, doi: null, lastInward: null,
  })
  const subCatCols = [
    { key: 'sku', label: 'Sub-category', text: r => r.subCategory, maxWidth: 220 },
    { key: 'skuCount', label: 'SKUs', num: true, text: r => fmtUnits(r.skuCount), csv: r => r.skuCount },
    { key: 'units', label: 'Inward units', num: true, text: r => fmtUnits(r.units), csv: r => r.units },
    { key: 'stock', label: 'Current stock', num: true, text: r => (r.stock == null ? (invLoading ? '…' : '—') : fmtUnits(r.stock)), csv: r => r.stock ?? '' },
    { key: 'avgSale', label: 'Avg sale /day', num: true, text: r => (r.avgSale == null ? '—' : fmtUnits(r.avgSale)), csv: r => r.avgSale ?? '' },
    { key: 'doi', label: 'DOI', num: true, text: r => (r.doi == null ? '—' : `${r.doi} d`), csv: r => r.doi ?? '' },
    { key: 'lastInward', label: 'Last inward', text: r => fmtDayYear(r.lastInward), csv: r => r.lastInward, sort: r => r.lastInward },
  ]
  // Same convention as the SKU view's total row: units sum, stock-related columns blank
  // (a grand total across every sub-category's already-blended DOI isn't a meaningful number).
  const subCatTotalRow = rs => ({
    _key: 'total', sku: `Total (${rs.length} sub-categories)`, skuCount: rs.reduce((a, r) => a + r.skuCount, 0),
    units: rs.reduce((a, r) => a + r.units, 0),
    stock: null, avgSale: null, doi: null, lastInward: null,
  })

  // Product master: every SKU, independent of the selected date range — "Last inward" columns are
  // true all-time (not bound by the range), "Inward qty (range)" is the one column that does reflect
  // the currently selected dates, so a SKU with 0 there but a real last-inward date is correctly a
  // "not inwarded in this window" case rather than "never inwarded at all".
  const masterCols = [
    { key: 'sku', label: 'SKU', text: r => r.sku, maxWidth: 130 },
    { key: 'category', label: 'Category', text: r => r.category, maxWidth: 140 },
    { key: 'subCategory', label: 'Sub-category', text: r => r.subCategory, maxWidth: 220 },
    { key: 'stock', label: 'Current stock', num: true, text: r => (r.stock == null ? (invLoading ? '…' : '—') : fmtUnits(r.stock)), csv: r => r.stock ?? '' },
    { key: 'avgSale', label: 'Avg sale /day', num: true, text: r => (r.avgSale == null ? '—' : fmtUnits(r.avgSale)), csv: r => r.avgSale ?? '' },
    { key: 'doi', label: 'DOI', num: true, text: r => (r.doi == null ? '—' : `${r.doi} d`), csv: r => r.doi ?? '', maxWidth: 100 },
    { key: 'lastInward', label: 'Last inward', text: r => fmtDayYear(r.lastInward), csv: r => r.lastInward, sort: r => r.lastInward },
    { key: 'lastInwardQty', label: 'Last inward qty', num: true, text: r => (r.lastInwardQty == null ? '—' : fmtUnits(r.lastInwardQty)), csv: r => r.lastInwardQty ?? '' },
    { key: 'lastInwardVendors', label: 'Last inward vendor(s)', text: r => (r.lastInwardVendors || []).join(', ') || '—', csv: r => (r.lastInwardVendors || []).join('; '), maxWidth: 240 },
    { key: 'rangeQty', label: 'Inward qty (range)', num: true, text: r => fmtUnits(r.rangeQty), csv: r => r.rangeQty },
  ]
  const masterSearchFn = (r, q) => r.sku.toLowerCase().includes(q) || String(r.subCategory || '').toLowerCase().includes(q) || String(r.category || '').toLowerCase().includes(q)

  // Vendor master: every vendor ever used (lifetime), independent of the date range except the
  // "Units (range)" column — same convention as Product master above.
  const vendorMasterCols = [
    { key: 'vendor', label: 'Vendor', text: r => r.vendor, maxWidth: 260 },
    { key: 'sourceType', label: 'Source', text: r => r.sourceType },
    { key: 'lastGrn', label: 'Last GRN', text: r => fmtDayYear(r.lastGrn), csv: r => r.lastGrn, sort: r => r.lastGrn },
    { key: 'rangeUnits', label: 'Units (range)', num: true, text: r => fmtUnits(r.rangeUnits), csv: r => r.rangeUnits },
    { key: 'lifetimeGrns', label: 'Lifetime GRNs', num: true, text: r => fmtUnits(r.lifetimeGrns), csv: r => r.lifetimeGrns },
    { key: 'lifetimeUnits', label: 'Lifetime units', num: true, text: r => fmtUnits(r.lifetimeUnits), csv: r => r.lifetimeUnits },
    { key: 'skuCount', label: 'SKUs supplied', num: true, text: r => fmtUnits(r.skuCount), csv: r => r.skuCount },
    { key: 'productsSupplied', label: 'Products supplied', text: r => (r.productsSupplied || []).map(p => p.subCategory).join(', ') || '—', csv: r => (r.productsSupplied || []).map(p => p.subCategory).join('; '), maxWidth: 320 },
  ]
  const vendorMasterSearchFn = (r, q) => r.vendor.toLowerCase().includes(q) || String(r.sourceType || '').toLowerCase().includes(q)

  const loadingFirst = !data && !error
  const skel = hgt => <div aria-busy="true" style={{ height: hgt, borderRadius: isPhone ? M.radius.card : 16, background: isPhone ? '#ebe8e1' : IC.surface, opacity: 0.7, pointerEvents: 'none' }} />

  // Full GRN-level export (every raw line, not aggregated) for the Data quality panel — fetched on
  // click, not held in page state, since it can be thousands of rows across the whole selected range.
  const dqSkuExportCols = [
    { label: 'GRN date', key: 'grnDate' }, { label: 'GRN code', key: 'grnCode' }, { label: 'GRN SKU code', key: 'itemSkuCode' },
    { label: 'Final SKU code', key: 'finalSkuCode' }, { label: 'Reason', key: 'reason' }, { label: 'Facility', key: 'facility' },
    { label: 'Vendor name', key: 'vendorName' }, { label: 'Vendor code', key: 'vendorCode' }, { label: 'GRN invoice no', key: 'grnInvoiceNo' },
    { label: 'GRN invoice date', key: 'grnInvoiceDate' }, { label: 'PO code', key: 'poCode' }, { label: 'PO date', key: 'poDate' },
    { label: 'Qty received', key: 'quantityReceived' }, { label: 'Qty rejected', key: 'quantityRejected' }, { label: 'Pack qty', key: 'packQty' },
    { label: 'Units (pack-adjusted)', key: 'units' }, { label: 'Rejection reason', key: 'rejectionReason' }, { label: 'GRN item status', key: 'grnItemStatus' },
  ]
  const dqVendorExportCols = [
    { label: 'GRN date', key: 'grnDate' }, { label: 'GRN code', key: 'grnCode' }, { label: 'GRN SKU code', key: 'itemSkuCode' },
    { label: 'Resolved SKU', key: 'resolvedSku' }, { label: 'Facility', key: 'facility' }, { label: 'Vendor name', key: 'vendorName' },
    { label: 'Vendor code', key: 'vendorCode' }, { label: 'GRN invoice no', key: 'grnInvoiceNo' }, { label: 'GRN invoice date', key: 'grnInvoiceDate' },
    { label: 'PO code', key: 'poCode' }, { label: 'PO date', key: 'poDate' }, { label: 'Qty received', key: 'quantityReceived' },
    { label: 'Qty rejected', key: 'quantityRejected' }, { label: 'Pack qty', key: 'packQty' }, { label: 'Units (pack-adjusted)', key: 'units' },
    { label: 'Rejection reason', key: 'rejectionReason' }, { label: 'GRN item status', key: 'grnItemStatus' },
  ]
  const exportDq = async kind => {
    if (!meta) return
    const rows = await fetchDqRows(kind, meta.start, meta.end).catch(() => null)
    if (!rows) return
    const cols = kind === 'vendor' ? dqVendorExportCols : dqSkuExportCols
    downloadCsv(`inward_dq_${kind}_grn_detail_${meta.start}_${meta.end}.csv`, toCsv(cols.map(c => ({ label: c.label, csv: r => r[c.key] ?? '' })), rows))
  }

  return (
    // The page is its own (full-area) scroll container, like the other Inventory sub-pages.
    // Inward has no sidebarTop filler row (Health/Sales show "Updated ... / Latest sales ..." there),
    // so matching Health's 16px top padding left a visibly bigger empty gap above the first row here
    // than on Health — tightened to line up with how Health actually looks, not just its padding value.
    <div className="inward-page" style={{ background: isPhone ? M.bg : IC.page, flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: isPhone ? '12px 16px 96px' : width >= 1280 ? '0px 24px 40px' : '0px 20px 40px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: isPhone ? gap : 18 }}>
      {!isPhone && sidebarTop && <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>{sidebarTop}</div>}
      {/* Title, date range and Refresh live in the app's top bar (desktop) / green header (phone). */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        {!isPhone && <div style={{ fontSize: 12, color: muted }}>{rangeLine}{loading && data ? ' · updating…' : ''}</div>}
        {!isPhone && meta && (
          <InfoTip text={`Inward ÷ sales above 1 = stock building.${(meta?.notes || []).map(n => ` ${n}`).join('')} ${finishedGoodsNote}`} />
        )}
        {!isPhone && <FiltersButton opts={opts} filters={filters} setFilters={setFilters} />}
      </div>
      <FilterChips filters={filters} setFilters={setFilters} isPhone={isPhone} />
      {isPhone && sheetOpen && <InwardFilterSheet open onClose={() => setSheetOpen(false)} opts={opts} filters={filters} setFilters={setFilters} />}

      {error && !data && <div role="alert" style={{ padding: '12px 14px', borderRadius: 12, background: C.red.bg, border: `1px solid ${C.red.bd}`, color: C.red.tx, fontSize: 12.5 }}>⚠ {error}</div>}
      {error && data && <div role="alert" style={{ fontSize: 12, color: C.red.tx }}>⚠ Couldn't refresh: {error} (showing the last result)</div>}

      {/* 1. KPI tiles (desktop/laptop) OR 1+2. Phone master card (INWARD_MOBILE_PROMPT.md §2):
          Inward units hero + area chart (inward solid, sales dashed) + 6 tappable tiles, in one
          green-gradient card — replaces the separate KPI grid + Trend card on phone only. */}
      {loadingFirst ? skel(isPhone ? 300 : 96) : k && isPhone ? (
        <div>
          <PhoneMasterCard k={k} delta={delta} trend={trend} grain={grain} meta={meta} layout={width >= 768 ? 'tablet' : 'phone'} />
        </div>
      ) : k && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${kpiCols}, minmax(0, 1fr))`, gap: 10, alignItems: 'stretch' }}>
            {kpiList.map(t => <KpiDesk key={t.id} label={t.label} value={t.value} delta={t.delta} sub={t.sub} title={t.def} neutral={t.neutral} lowerIsBetter={t.lowerIsBetter} />)}
          </div>
        </div>
      )}

      {/* 2. Trend (desktop/laptop only — phone's trend is inside the master card above) + 3. Source mix */}
      {loadingFirst ? skel(isPhone ? 220 : 340) : data && (
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'minmax(0, 1fr)' : sideBySide ? 'minmax(0, 1.65fr) minmax(0, 1fr)' : 'minmax(0, 1fr)', gap, alignItems: 'stretch' }}>
          {!isPhone && (
            <Card isPhone={isPhone} inlineHeader title="Inward trend" sub={`Total inward vs. sales, with the inward ÷ sales ratio · ${grain}`}
              action={<Seg isPhone={isPhone} label="Trend grain" value={grainSel} onChange={setGrainSel}
                options={[{ value: 'auto', label: 'Auto' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />}>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 10, right: 36, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={IC.border} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: IC.t3 }} tickFormatter={d => fmtBucket(d, grain)} minTickGap={28} axisLine={{ stroke: IC.border }} tickLine={false} />
                    <YAxis yAxisId="units" tick={{ fontSize: 12, fill: IC.t3 }} tickFormatter={fmtBig} width={46} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="ratio" orientation="right" tick={{ fontSize: 12, fill: IC.t3 }} tickFormatter={v => `${v}×`} width={34} axisLine={false} tickLine={false} />
                    <Tooltip content={<TrendTip grain={grain} typesInTrend={typesInTrend} />} cursor={{ stroke: IC.border2, strokeDasharray: '3 3' }} />
                    <Line yAxisId="units" dataKey="total" name="Total inward" stroke={IC.t1} strokeWidth={2.25} dot={false} activeDot={{ r: 4, fill: IC.t1, stroke: '#fff', strokeWidth: 1.5 }} isAnimationActive={false} />
                    <Line yAxisId="units" dataKey="sales" name="Total sales" stroke={IC.accBorder} strokeWidth={2.25} dot={false} activeDot={{ r: 4, fill: IC.accBorder, stroke: '#fff', strokeWidth: 1.5 }} isAnimationActive={false} />
                    <Line yAxisId="ratio" dataKey="ratio" name="Inward ÷ sales" stroke={IC.t3} strokeWidth={1.5} strokeDasharray="4 3" dot={false}
                      activeDot={{ r: 3.5, fill: IC.t3, stroke: '#fff', strokeWidth: 1.5 }} isAnimationActive={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <Legend isPhone={isPhone} items={[{ label: 'Total inward', color: IC.t1, line: true }, { label: 'Total sales', color: IC.accBorder, line: true }, { label: 'Inward ÷ sales', color: IC.t3, line: true }]} />
            </Card>
          )}

          <Card isPhone={isPhone} title="Source mix" sub="Tap a source to filter the page">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(data.sourceMix || []).map(s => {
                const on = (filters.sourceType || []).includes(s.sourceType)
                return (
                  <button key={s.sourceType} type="button" onClick={() => toggleSource(s.sourceType)} aria-pressed={on}
                    style={{ textAlign: 'left', minHeight: 44, padding: '8px 10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'var(--font)',
                      border: `1px solid ${on ? IC.accBorder : (isPhone ? M.line : IC.border)}`, background: on ? (isPhone ? '#e9f3ed' : IC.accDim) : 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: SOURCE_COLORS[s.sourceType] || '#6f7d75', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: ink }}>{s.sourceType}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: ink, fontVariantNumeric: 'tabular-nums' }}>{fmtUnits(s.units)}</span>
                      <span style={{ width: 46, textAlign: 'right', fontSize: 12, color: muted, fontVariantNumeric: 'tabular-nums' }}>{fmtPct(s.share * 100, 0)}</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: isPhone ? M.soft : IC.page, margin: '6px 0 4px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(0, Math.min(100, s.share * 100))}%`, height: '100%', background: IC.accBorder, borderRadius: 3 }} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: 12, color: muted }}>
                      <span>{fmtUnits(s.grns)} GRNs</span><span>avg {fmtUnits(s.avgGrnSize)} units/GRN</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </Card>
        </div>
      )}

      {/* 4. Vendor performance + 5. SKU detail — one row, side by side on wide desktop (matching
          the trend/source-mix row above), stacked below that width. Phone: card lists (item 4),
          not these squeezed tables — see VendorPhoneCard / SkuPhoneCard below. */}
      {data && isPhone && (
        <>
          <VendorPhoneCard vendors={data.vendors} onDrill={setDrill} />
          <SkuPhoneCard skuRows={skuRows} subCatRows={subCatRows} skuView={skuView} setSkuView={setSkuView} invLoading={invLoading} onDrill={setDrill} />
        </>
      )}
      {data && !isPhone && (
        <div style={{ display: 'grid', gridTemplateColumns: sideBySide ? 'minmax(0, 1fr) minmax(0, 1.2fr)' : 'minmax(0, 1fr)', gap, alignItems: 'stretch' }}>
          <Card isPhone={false} inlineHeader title="Vendor performance" sub={`${data.vendors.length} vendors · scroll for all`}
            action={(
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30, marginLeft: 'auto', justifyContent: 'flex-end' }}>
                <input type="text" value={vendorSearch} onChange={e => setVendorSearch(e.target.value)} placeholder="Search vendor…"
                  style={{ height: '100%', fontSize: 11.5, padding: '0 10px', borderRadius: 7, background: IC.surface, color: IC.t1, border: `1px solid ${IC.border2}`, width: 170, boxSizing: 'border-box' }} />
                <ExportButton filename={`inward_vendors_${meta.start}_${meta.end}.csv`} rows={data.vendors}
                  columns={[{ label: 'Vendor', key: 'vendor' }, { label: 'Source', key: 'sourceType' }, { label: 'GRNs', key: 'grns' }, { label: 'Units', key: 'units' },
                    { label: 'SKUs', key: 'skus' }, { label: 'Last GRN', key: 'lastGrn' }]} />
              </div>
            )}>
            <InwardTable columns={vendorCols} rows={data.vendors.map(v => ({ ...v, _key: v.vendor }))} isPhone={false} title="Vendor performance" filename={`inward_vendors_${meta.start}_${meta.end}.csv`}
              defaultSort={{ key: 'units', dir: 'desc' }} phoneKeys={['vendor', 'units', 'skus', 'lastGrn']}
              fixedHeight={440} totalRow={vendorTotalRow} onRowClick={r => setDrill({ mode: 'vendor', id: r.vendor, subtitle: r.sourceType })}
              search={(r, q) => r.vendor.toLowerCase().includes(q)} searchPlaceholder="Search vendor…" externalSearch={vendorSearch} />
          </Card>

          <Card isPhone={false} inlineHeader
            title="SKU detail"
            sub={skuView === 'sku' ? `${skuRows.length} SKUs · tap a row for its last 10 GRN days` : `${subCatRows.length} sub-categories · tap a row for its last 10 GRN days`}
            subTitle={skuView === 'subcat' ? 'Units summed, DOI recomputed from summed stock ÷ summed avg sale.' : undefined}
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30, marginLeft: 'auto', justifyContent: 'flex-end' }}>
                <Seg isPhone={false} label="SKU detail view" value={skuView} onChange={setSkuView}
                  options={[{ value: 'sku', label: 'By SKU' }, { value: 'subcat', label: 'By sub-category' }]} />
                <input type="text" value={skuSearchQ} onChange={e => setSkuSearchQ(e.target.value)} placeholder={skuView === 'sku' ? 'Search SKU or sub-category…' : 'Search sub-category…'}
                  style={{ height: '100%', fontSize: 11.5, padding: '0 10px', borderRadius: 7, background: IC.surface, color: IC.t1, border: `1px solid ${IC.border2}`, width: 190, boxSizing: 'border-box' }} />
                {skuView === 'sku' ? (
                  <ExportButton filename={`inward_skus_${meta.start}_${meta.end}.csv`} rows={skuRows}
                    columns={[{ label: 'SKU', key: 'sku' }, { label: 'Sub-category', key: 'subCategory' }, { label: 'Inward units', key: 'units' },
                      { label: 'Current stock', key: 'stock' }, { label: 'Avg sale /day', key: 'avgSale' }, { label: 'DOI', key: 'doi' }, { label: 'Last inward', key: 'lastInward' }]} />
                ) : (
                  <ExportButton filename={`inward_subcategories_${meta.start}_${meta.end}.csv`} rows={subCatRows}
                    columns={[{ label: 'Sub-category', key: 'subCategory' }, { label: 'SKUs', key: 'skuCount' }, { label: 'Inward units', key: 'units' },
                      { label: 'Current stock', key: 'stock' }, { label: 'Avg sale /day', key: 'avgSale' }, { label: 'DOI', key: 'doi' }, { label: 'Last inward', key: 'lastInward' }]} />
                )}
              </div>
            }>
            {skuView === 'sku' ? (
              <InwardTable columns={skuCols} rows={skuRows.map(s => ({ ...s, _key: s.skuKey }))} isPhone={false} title="SKU detail" filename={`inward_skus_${meta.start}_${meta.end}.csv`}
                defaultSort={{ key: 'avgSale', dir: 'desc' }} phoneKeys={['sku', 'units', 'stock', 'doi']} externalSearch={skuSearchQ}
                onRowClick={r => setDrill({ mode: 'sku', id: r.sku, subtitle: r.subCategory })}
                search={(r, q) => r.sku.toLowerCase().includes(q) || String(r.subCategory || '').toLowerCase().includes(q)} searchPlaceholder="Search SKU or sub-category"
                fixedHeight={440} totalRow={skuTotalRow} />
            ) : (
              <InwardTable columns={subCatCols} rows={subCatRows} isPhone={false} title="Sub-category detail" filename={`inward_subcategories_${meta.start}_${meta.end}.csv`}
                defaultSort={{ key: 'avgSale', dir: 'desc' }} phoneKeys={['sku', 'units', 'stock', 'doi']} externalSearch={skuSearchQ}
                onRowClick={r => setDrill({ mode: 'subcat', id: r.subCategory, subtitle: r.category })}
                search={(r, q) => r.subCategory.toLowerCase().includes(q)} searchPlaceholder="Search sub-category"
                fixedHeight={440} totalRow={subCatTotalRow} />
            )}
          </Card>
        </div>
      )}

      {/* Product master — every SKU, searchable, independent of the selected date range (so a SKU
          with zero inward in the current window is still found, with its true last-ever inward).
          Phone: search-only entry card → full-screen results (item 4); desktop stays the table. */}
      {data && isPhone && <ProductMasterPhoneCard rows={productMasterRows} invLoading={invLoading} onDrill={setDrill} />}
      {data && isPhone && <VendorMasterPhoneCard rows={data.vendorMaster || []} onDrill={setDrill} />}
      {data && !isPhone && (
        <Card isPhone={false} inlineHeader title="Product master" sub={`${productMasterRows.length} SKUs · search any SKU, even ones not inwarded in the selected range`}
          action={(
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30, marginLeft: 'auto', justifyContent: 'flex-end' }}>
              <input type="text" value={masterSearch} onChange={e => setMasterSearch(e.target.value)} placeholder="Search SKU, category, sub-category…"
                style={{ height: '100%', fontSize: 11.5, padding: '0 10px', borderRadius: 7, background: IC.surface, color: IC.t1, border: `1px solid ${IC.border2}`, width: 220, boxSizing: 'border-box' }} />
              <ExportButton filename={`inward_product_master.csv`} rows={productMasterRows}
                columns={[{ label: 'SKU', key: 'sku' }, { label: 'Category', key: 'category' }, { label: 'Sub-category', key: 'subCategory' },
                  { label: 'Current stock', key: 'stock' }, { label: 'Avg sale /day', key: 'avgSale' }, { label: 'DOI', key: 'doi' },
                  { label: 'Last inward', key: 'lastInward' }, { label: 'Last inward qty', key: 'lastInwardQty' },
                  { label: 'Last inward vendor(s)', key: 'lastInwardVendors' }, { label: 'Inward qty (range)', key: 'rangeQty' }]} />
            </div>
          )}>
          <InwardTable columns={masterCols} rows={productMasterRows.map(r => ({ ...r, _key: r.skuKey }))} isPhone={false} title="Product master" filename="inward_product_master.csv"
            defaultSort={{ key: 'avgSale', dir: 'desc' }} phoneKeys={['sku', 'lastInward', 'lastInwardQty', 'rangeQty']} externalSearch={masterSearch}
            search={masterSearchFn} searchPlaceholder="Search SKU, category, sub-category…"
            fixedHeight={440} />
        </Card>
      )}

      {/* Vendor master — every vendor ever used (3rd-party + Inhouse, Internal excluded), since
          Apr-25, independent of the selected date range except "Units (range)". Same convention as
          Product master above: phone gets the search-only card, desktop keeps the full table. */}
      {data && !isPhone && (
        <Card isPhone={false} inlineHeader title="Vendor master" sub={`${(data.vendorMaster || []).length} vendors · since Apr-25 · search any vendor, even ones not inwarded in the selected range`}
          action={(
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30, marginLeft: 'auto', justifyContent: 'flex-end' }}>
              <input type="text" value={vendorMasterSearch} onChange={e => setVendorMasterSearch(e.target.value)} placeholder="Search vendor, source type…"
                style={{ height: '100%', fontSize: 11.5, padding: '0 10px', borderRadius: 7, background: IC.surface, color: IC.t1, border: `1px solid ${IC.border2}`, width: 220, boxSizing: 'border-box' }} />
              <ExportButton filename={`inward_vendor_master.csv`} rows={data.vendorMaster || []}
                columns={[{ label: 'Vendor', key: 'vendor' }, { label: 'Source', key: 'sourceType' }, { label: 'Last GRN', key: 'lastGrn' },
                  { label: 'Units (range)', key: 'rangeUnits' }, { label: 'Lifetime GRNs', key: 'lifetimeGrns' }, { label: 'Lifetime units', key: 'lifetimeUnits' },
                  { label: 'SKUs supplied', key: 'skuCount' }, { label: 'Products supplied', get: r => (r.productsSupplied || []).map(p => p.subCategory).join('; ') }]} />
            </div>
          )}>
          <InwardTable columns={vendorMasterCols} rows={(data.vendorMaster || []).map(r => ({ ...r, _key: r.vendor }))} isPhone={false} title="Vendor master" filename="inward_vendor_master.csv"
            defaultSort={{ key: 'lastGrn', dir: 'desc' }} phoneKeys={['vendor', 'lastGrn', 'rangeUnits', 'lifetimeUnits']} externalSearch={vendorMasterSearch}
            search={vendorMasterSearchFn} searchPlaceholder="Search vendor, source type…"
            onRowClick={r => setDrill({ mode: 'vendor', id: r.vendor, subtitle: r.sourceType })}
            fixedHeight={440} />
        </Card>
      )}

      {/* Later: "not-required inward" flag table (inward for SKUs that already had enough cover).
          Deliberately not built yet — the spec parks it; it slots in here, after SKU detail. */}

      {/* 6. Data quality — admins only (the API sends it only to admins), collapsed by default */}
      {data?.dataQuality && (
        <Card isPhone={isPhone} title="Data quality" sub="Admins only · rows excluded from or flagged on this page, for the selected range"
          action={<button type="button" style={btnStyle(isPhone)} aria-expanded={dqOpen} onClick={() => setDqOpen(o => !o)}>{dqOpen ? 'Hide' : 'Show'}</button>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', fontSize: 12.5, color: IC.t2 }}>
            <span>SKU not in SKU master: <b>{fmtUnits(data.dataQuality.unmappedSku.count)}</b> codes · {fmtUnits(data.dataQuality.unmappedSku.lines)} lines · {fmtUnits(data.dataQuality.unmappedSku.units)} units (excluded)</span>
            <span>Vendors not in vendor mapping: <b>{fmtUnits(data.dataQuality.unmappedVendor.count)}</b> · {fmtUnits(data.dataQuality.unmappedVendor.units)} units (shown as "Unmapped")</span>
            <span>Zero / negative quantity: <b>{fmtUnits(data.dataQuality.badQty.lines)}</b> lines</span>
          </div>
          {dqOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: ink }}>GRN SKUs not in the SKU master</div>
                  <button type="button" style={btnStyle(isPhone)} disabled={dqExportLoading} onClick={() => exportDq('sku')}>{dqExportLoading ? 'Exporting…' : 'Export full GRN detail (CSV)'}</button>
                </div>
                <InwardTable isPhone={isPhone} title="SKUs not in SKU master" filename={`inward_dq_skus_${meta.start}_${meta.end}.csv`} defaultSort={{ key: 'units', dir: 'desc' }}
                  rows={data.dataQuality.unmappedSku.rows.map((r, i) => ({ ...r, _key: `${r.itemSkuCode}-${i}` }))} phoneKeys={['itemSkuCode', 'units', 'lines', 'reason']}
                  columns={[{ key: 'itemSkuCode', label: 'GRN SKU code', text: r => r.itemSkuCode }, { key: 'finalSku', label: 'Final SKU', text: r => r.finalSku }, { key: 'reason', label: 'Reason', text: r => r.reason, maxWidth: 260 },
                    { key: 'lines', label: 'Lines', num: true, text: r => fmtUnits(r.lines), csv: r => r.lines }, { key: 'units', label: 'Units', num: true, text: r => fmtUnits(r.units), csv: r => r.units }, { key: 'lastDate', label: 'Last GRN', text: r => fmtDayYear(r.lastDate), csv: r => r.lastDate, sort: r => r.lastDate }]} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: ink }}>Vendors not in vendor mapping</div>
                  <button type="button" style={btnStyle(isPhone)} disabled={dqExportLoading} onClick={() => exportDq('vendor')}>{dqExportLoading ? 'Exporting…' : 'Export full GRN detail (CSV)'}</button>
                </div>
                <InwardTable isPhone={isPhone} title="Vendors not in vendor mapping" filename={`inward_dq_vendors_${meta.start}_${meta.end}.csv`} defaultSort={{ key: 'units', dir: 'desc' }}
                  rows={data.dataQuality.unmappedVendor.rows.map(r => ({ ...r, _key: r.vendorName }))} phoneKeys={['vendorName', 'units', 'lines', 'lastDate']}
                  columns={[{ key: 'vendorName', label: 'Vendor name', text: r => r.vendorName, maxWidth: 300 }, { key: 'lines', label: 'Lines', num: true, text: r => fmtUnits(r.lines), csv: r => r.lines },
                    { key: 'units', label: 'Units', num: true, text: r => fmtUnits(r.units), csv: r => r.units }, { key: 'lastDate', label: 'Last GRN', text: r => fmtDayYear(r.lastDate), csv: r => r.lastDate, sort: r => r.lastDate }]} />
              </div>
              <div style={{ paddingBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: ink, marginBottom: 6 }}>Zero or negative quantities</div>
                <InwardTable isPhone={isPhone} title="Zero or negative quantities" filename={`inward_dq_qty_${meta.start}_${meta.end}.csv`} defaultSort={{ key: 'lastDate', dir: 'desc' }}
                  rows={data.dataQuality.badQty.rows.map((r, i) => ({ ...r, _key: `${r.grnCode}-${r.itemSkuCode}-${i}` }))} phoneKeys={['grnCode', 'itemSkuCode', 'quantityReceived', 'lastDate']}
                  columns={[{ key: 'grnCode', label: 'GRN', text: r => r.grnCode }, { key: 'itemSkuCode', label: 'GRN SKU code', text: r => r.itemSkuCode }, { key: 'quantityReceived', label: 'Qty received', num: true, text: r => String(r.quantityReceived ?? '—') },
                    { key: 'lines', label: 'Lines', num: true, text: r => fmtUnits(r.lines), csv: r => r.lines }, { key: 'lastDate', label: 'GRN date', text: r => fmtDayYear(r.lastDate), csv: r => r.lastDate, sort: r => r.lastDate }]} />
              </div>
            </div>
          )}
        </Card>
      )}

      {data && <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>
        Source: Unicommerce GRNs (refined), SKUs resolved through the SKU master · last GRN {fmtDayYear(meta.lastGrnDate)} · last sale {fmtDayYear(meta.lastSalesDate)}
        {invData?.asOf ? ` · stock as of ${new Date(invData.asOf).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}` : ''}
      </div>}

      {drill && <LastGrnDrill mode={drill.mode} id={drill.id} subtitle={drill.subtitle} isPhone={isPhone} onClose={() => setDrill(null)} range={meta} />}
    </div>
  )
}
