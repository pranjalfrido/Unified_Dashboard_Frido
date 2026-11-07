// Inventory → Inward (rewritten 2026-11-08; replaces the old hidden Inward tab that read the legacy
// GRN table). Laptop / desktop / phone in one component:
//   phone (≤ 768 or phone landscape): green header holds date + filter (App.jsx Topnav), filters in a
//     bottom sheet, KPI tiles 2 per row, charts full width, tables 4 columns + "View full table ⤢"
//   laptop 1024–1279: KPI tiles 3 per row, charts stacked
//   desktop ≥ 1280: 6 KPI tiles in a row, trend + source mix side by side
// Data: POST /api/inward (one call per filter change, cached server-side) + Inventory Health's own
// feed for current stock / Avg Sale / DOI (passed in as invData), so those match Health exactly.
import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { IC, SearchableMultiSelect } from './theme.jsx'
import { C, fmt, fmtBig } from '../utils.js'
import { usePhone, inwardFilterCount, useSkuDetail } from './useInward.js'
import KpiTileM from '../responsive/KpiTile.jsx'
import DeltaBadge from '../responsive/DeltaBadge.jsx'
import BottomSheet from '../responsive/BottomSheet.jsx'
import FilterPicker from '../responsive/FilterPicker.jsx'
import FullScreenTable from '../responsive/FullScreenTable.jsx'
import {
  SOURCE_TYPES, SOURCE_COLORS, autoGrain, rollup, fmtBucket, fmtDay, fmtDayYear, fmtRange, pctChange,
  stockIndex, attachStock, warehouseStock, estimateStock, toTsv, toCsv, fmtUnits, fmtRatio, fmtPct,
} from './inwardUtils.js'

const M = C.m
const MAX_ROWS = 10
const PHONE_COLS = 4

// ── Small building blocks ───────────────────────────────────────────────────────────────
function Card({ title, sub, action, children, isPhone, id, style }) {
  return (
    <section id={id} style={{
      background: isPhone ? M.card : IC.surface, border: isPhone ? 'none' : `1px solid ${IC.border}`,
      borderRadius: isPhone ? M.radius.card : 16, boxShadow: isPhone ? M.cardShadow : 'none',
      padding: isPhone ? '14px 14px 12px' : '16px 18px', minWidth: 0, boxSizing: 'border-box', ...style,
    }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: isPhone ? M.type.cardTitle : 14, fontWeight: 700, color: isPhone ? M.ink : IC.t1, letterSpacing: '-.01em' }}>{title}</div>
            {sub && <div style={{ fontSize: 12, color: isPhone ? M.muted : IC.t3, marginTop: 2 }}>{sub}</div>}
          </div>
          {action}
        </div>
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
          style={{ minHeight: isPhone ? 44 : 30, padding: isPhone ? '0 9px' : '0 10px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer',
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
function InwardTable({ columns, rows, isPhone, filename, title, defaultSort, sortable = true, onRowClick, phoneKeys, search, searchPlaceholder, rowStyle, emptyText = 'No rows for these filters', fullNote }) {
  const [sort, setSort] = useState(defaultSort || null)
  const [all, setAll] = useState(false)
  const [full, setFull] = useState(false)
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState(false)
  const filtered = useMemo(() => (search && q.trim() ? rows.filter(r => search(r, q.trim().toLowerCase())) : rows), [rows, q, search])
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
  const shown = all ? sorted : sorted.slice(0, MAX_ROWS)
  const cols = isPhone && phoneKeys ? phoneKeys.slice(0, PHONE_COLS).map(k => columns.find(c => c.key === k)).filter(Boolean) : columns
  const textOf = (c, r) => (c.text ? c.text(r) : r[c.key] == null ? '' : String(r[c.key]))
  const csvCols = columns.map(c => ({ label: c.label, csv: r => (c.csv ? c.csv(r) : textOf(c, r)) }))
  const onSort = k => { if (!sortable) return; setSort(s => (s?.key === k ? { key: k, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key: k, dir: columns.find(c => c.key === k)?.num ? 'desc' : 'asc' })) }
  const copy = () => copyText(toTsv(csvCols, sorted)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  const ink = isPhone ? M.ink : IC.t1, muted = isPhone ? M.muted : IC.t3, line = isPhone ? M.line : IC.border
  const th = c => ({ textAlign: c.num ? 'right' : 'left', fontSize: 12, fontWeight: 600, color: sort?.key === c.key ? ink : muted, padding: isPhone ? '8px 6px' : '7px 10px',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: `1px solid ${line}`, cursor: sortable ? 'pointer' : 'default', userSelect: 'none', background: isPhone ? M.soft : IC.page })
  const td = c => ({ textAlign: c.num ? 'right' : 'left', fontSize: 12.5, color: c.num ? ink : (isPhone ? M.ink : IC.t2), padding: isPhone ? '0 6px' : '7px 10px', height: isPhone ? 44 : undefined,
    whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', borderBottom: `1px solid ${line}`, maxWidth: c.maxWidth || (isPhone ? 140 : 280), overflow: 'hidden', textOverflow: 'ellipsis' })
  return (
    <div style={{ minWidth: 0 }}>
      {search && (
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={searchPlaceholder || 'Search…'} aria-label={searchPlaceholder || 'Search table'}
          style={{ width: isPhone ? '100%' : 260, boxSizing: 'border-box', marginBottom: 10, minHeight: isPhone ? 44 : 32, fontSize: isPhone ? 16 : 12.5, padding: '0 12px', borderRadius: 9,
            border: `1px solid ${q ? IC.accBorder : (isPhone ? M.line : IC.border2)}`, background: isPhone ? '#fff' : IC.surface, color: ink, fontFamily: 'var(--font)', outline: 'none' }} />
      )}
      <div style={{ overflowX: isPhone ? 'hidden' : 'auto', minWidth: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: isPhone ? 'fixed' : 'auto' }}>
          <thead><tr>{cols.map((c, i) => (
            <th key={c.key} style={{ ...th(c), ...(isPhone && i === 0 ? { width: '36%' } : {}) }} onClick={() => onSort(c.key)} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
              {c.label}{sort?.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
            </th>))}</tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r._key || i} onClick={onRowClick ? () => onRowClick(r) : undefined}
                style={{ cursor: onRowClick ? 'pointer' : 'default', ...(rowStyle ? rowStyle(r) : {}) }}>
                {cols.map(c => <td key={c.key} style={td(c)} title={textOf(c, r)}>{c.render ? c.render(r) : textOf(c, r)}</td>)}
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={cols.length} style={{ padding: 16, fontSize: 12.5, color: muted, textAlign: 'center' }}>{emptyText}</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
        {sorted.length > MAX_ROWS && <button type="button" style={btnStyle(isPhone)} onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${sorted.length}`}</button>}
        {isPhone && phoneKeys && columns.length > PHONE_COLS && <button type="button" style={btnStyle(isPhone)} onClick={() => setFull(true)}>View full table ⤢</button>}
        <span style={{ flex: 1 }} />
        <button type="button" style={btnStyle(isPhone)} onClick={copy} aria-live="polite">{copied ? 'Copied ✓' : 'Copy'}</button>
        <button type="button" style={btnStyle(isPhone)} onClick={() => downloadCsv(filename, toCsv(csvCols, sorted))}>CSV</button>
      </div>
      {isPhone && (
        <FullScreenTable open={full} onClose={() => setFull(false)} title={title} note={fullNote} head={columns[0].label}
          cols={columns.slice(1).map(c => c.label)} firstWidth={130}
          rows={sorted.map((r, i) => ({ key: r._key || i, label: textOf(columns[0], r), cells: columns.slice(1).map(c => ({ text: textOf(c, r) })) }))} />
      )}
    </div>
  )
}

// ── KPI tile (desktop / laptop) ────────────────────────────────────────────────────────────
function KpiDesk({ label, value, delta, sub, title }) {
  return (
    <div title={title} style={{ background: IC.surface, border: `1px solid ${IC.border}`, borderRadius: 14, padding: '12px 14px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: IC.t3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: IC.t1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
        <DeltaBadge delta={delta} neutral size={12} />
      </div>
      <span style={{ fontSize: 12, color: IC.t3, minHeight: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub || ' '}</span>
    </div>
  )
}

function TrendTip({ active, payload, label, grain }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload || {}
  return (
    <div style={{ background: '#fff', border: `1px solid ${IC.border2}`, borderRadius: 10, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 14px rgba(0,0,0,.08)', minWidth: 170 }}>
      <div style={{ fontWeight: 700, color: IC.t1, marginBottom: 4 }}>{fmtBucket(label, grain)}</div>
      {payload.filter(p => p.value).map(p => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, color: IC.t2, lineHeight: 1.6 }}>
          <span style={{ width: 8, height: p.dataKey === 'sales' ? 2 : 8, borderRadius: 2, background: p.dataKey === 'sales' ? IC.t1 : p.fill }} />
          <span>{p.dataKey === 'sales' ? 'Sales units' : p.dataKey}</span>
          <span style={{ marginLeft: 'auto', fontWeight: 700, color: IC.t1, fontVariantNumeric: 'tabular-nums' }}>{fmtUnits(p.value)}</span>
        </div>
      ))}
      <div style={{ borderTop: `1px solid ${IC.border}`, marginTop: 4, paddingTop: 4, display: 'flex', color: IC.t2 }}>
        <span>Inward total</span><span style={{ marginLeft: 'auto', fontWeight: 700, color: IC.t1 }}>{fmtUnits(row.total)}</span>
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

// ── Desktop filter row ──────────────────────────────────────────────────────────────────
function DesktopFilters({ opts, filters, setFilters }) {
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
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <SearchableMultiSelect label="Warehouse" options={opts.warehouses || []} selected={filters.warehouse || []} onChange={set('warehouse')} width={150} />
      <SearchableMultiSelect label="Source type" options={opts.sourceTypes || []} selected={filters.sourceType || []} onChange={set('sourceType')} width={150} />
      <SearchableMultiSelect label="Vendor" options={(opts.vendors || []).map(v => v.vendor)} selected={filters.vendor || []} onChange={set('vendor')} width={170} />
      <SearchableMultiSelect label="Category" options={opts.categories || []} selected={filters.category || []} onChange={set('category')} width={160} />
      <SearchableMultiSelect label="Sub-category" options={[...new Set(subOpts)]} selected={filters.subCategory || []} onChange={set('subCategory')} width={180} />
      <input value={sku} onChange={e => setSku(e.target.value)} placeholder="Search SKU…" aria-label="SKU search"
        style={{ height: 34, width: 170, boxSizing: 'border-box', borderRadius: 8, border: `1px solid ${sku ? IC.accBorder : IC.border2}`, padding: '0 10px', fontSize: 12.5, color: IC.t1, background: IC.surface, fontFamily: 'var(--font)', outline: 'none' }} />
      {inwardFilterCount(filters) > 0 && (
        <button type="button" onClick={() => setFilters({})} style={{ ...btnStyle(false), height: 34, color: IC.negative }}>Clear all</button>
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
function SkuDrill({ row, start, end, isPhone, onClose }) {
  const { data, loading, error } = useSkuDetail(row?.sku, start, end)
  const series = useMemo(() => (data ? estimateStock(data.daily, row?.stock ?? null) : []), [data, row])
  useEffect(() => {
    if (isPhone) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPhone, onClose])
  const h = isPhone ? 190 : 220
  const tick = { fontSize: 12, fill: IC.t3 }
  const eventCols = [
    { key: 'date', label: 'Date', text: r => fmtDayYear(r.date), csv: r => r.date, sort: r => r.date },
    { key: 'vendor', label: 'Vendor', text: r => r.vendor, maxWidth: 220 },
    { key: 'units', label: 'Units', num: true, text: r => fmtUnits(r.units), csv: r => r.units },
    { key: 'warehouse', label: 'Warehouse', text: r => r.warehouse },
    { key: 'sourceType', label: 'Source', text: r => r.sourceType },
    { key: 'grnCode', label: 'GRN', text: r => r.grnCode },
  ]
  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12.5, color: IC.t2 }}>
        <span>Current stock <b style={{ color: IC.t1 }}>{row.stock == null ? '—' : fmtUnits(row.stock)}</b></span>
        <span>Avg sale <b style={{ color: IC.t1 }}>{row.avgSale == null ? '—' : `${fmtUnits(row.avgSale)}/day`}</b></span>
        <span>DOI <b style={{ color: IC.t1 }}>{row.doi == null ? '—' : `${row.doi} d`}</b></span>
        <span>Inward in range <b style={{ color: IC.t1 }}>{fmtUnits(row.units)}</b></span>
      </div>
      {loading && <div style={{ height: h * 2, borderRadius: 12, background: IC.page }} aria-busy="true" />}
      {error && <div style={{ fontSize: 12.5, color: IC.negative }}>⚠ {error}</div>}
      {data && (
        <>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: IC.t1 }}>Estimated stock and inward</div>
            <div style={{ fontSize: 12, color: IC.t3, marginBottom: 6 }}>Estimated: today's stock − inward since that day + sales since that day{row.stock == null ? ' (no current stock in Inventory Health, so no estimate)' : ''}</div>
            <div style={{ height: h }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={IC.border} vertical={false} />
                  <XAxis dataKey="date" tick={tick} tickFormatter={fmtDay} minTickGap={24} />
                  <YAxis tick={tick} tickFormatter={fmtBig} width={44} />
                  <Tooltip formatter={(v, n) => [fmtUnits(v), n === 'estStock' ? 'Estimated stock' : 'Inward units']} labelFormatter={fmtDayYear} contentStyle={{ fontSize: 12, borderRadius: 10 }} />
                  <Bar dataKey="inward" fill={SOURCE_COLORS.Domestic} maxBarSize={10} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Line dataKey="estStock" stroke={IC.t1} strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <Legend isPhone={isPhone} items={[{ label: 'Estimated stock (end of day)', color: IC.t1, line: true }, { label: 'Inward units', color: SOURCE_COLORS.Domestic }]} />
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: IC.t1, marginBottom: 6 }}>Daily sales units</div>
            <div style={{ height: isPhone ? 150 : 170 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={IC.border} vertical={false} />
                  <XAxis dataKey="date" tick={tick} tickFormatter={fmtDay} minTickGap={24} />
                  <YAxis tick={tick} tickFormatter={fmtBig} width={44} />
                  <Tooltip formatter={v => [fmtUnits(v), 'Sales units']} labelFormatter={fmtDayYear} contentStyle={{ fontSize: 12, borderRadius: 10 }} />
                  <Bar dataKey="sales" fill="#7b847f" maxBarSize={10} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: IC.t1, marginBottom: 6 }}>Inward events ({data.events.length})</div>
            <InwardTable columns={eventCols} rows={data.events.map((e, i) => ({ ...e, _key: `${e.grnCode}-${i}` }))} isPhone={isPhone} title={`${row.sku} · inward events`}
              filename={`inward_events_${row.sku}.csv`} defaultSort={{ key: 'date', dir: 'desc' }} phoneKeys={['date', 'vendor', 'units', 'warehouse']} />
          </div>
        </>
      )}
    </div>
  )
  const title = `${row.sku} · ${row.subCategory || ''}`
  if (isPhone) return <BottomSheet open onClose={onClose} title={title} subtitle={`${fmtDay(start)} → today · estimated stock`}>{body}</BottomSheet>
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: C.z.modal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)' }} />
      <div role="dialog" aria-modal="true" aria-label={title} style={{ position: 'relative', width: 'min(960px, 94vw)', maxHeight: '90vh', overflowY: 'auto', background: IC.surface, borderRadius: 16, padding: '18px 20px', boxShadow: '0 12px 40px rgba(0,0,0,.25)', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: IC.t1 }}>{title}</div>
            <div style={{ fontSize: 12, color: IC.t3 }}>{fmtDay(start)} → today · {row.category}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: IC.page, fontSize: 18, cursor: 'pointer', color: IC.t1 }}>×</button>
        </div>
        {body}
      </div>
    </div>,
    document.body,
  )
}

// ── The page ──────────────────────────────────────────────────────────────────────────────
export default function InwardPage({ data, loading, error, status, invData, invLoading, filters, setFilters, sidebarTop, sheetOpen, setSheetOpen }) {
  const { isPhone, width } = usePhone()
  const [grainSel, setGrainSel] = useState('auto')
  const [drill, setDrill] = useState(null)
  const [openCats, setOpenCats] = useState(() => new Set())
  const [dqOpen, setDqOpen] = useState(false)

  const meta = data?.meta
  const opts = data?.filterOptions || {}
  const k = data?.kpis
  const idx = useMemo(() => stockIndex(invData), [invData])
  const skuRows = useMemo(() => attachStock(data?.skus, idx), [data?.skus, idx])
  const whStock = useMemo(() => warehouseStock(invData, filters), [invData, filters])
  const grain = grainSel === 'auto' ? autoGrain(meta?.days || 0) : grainSel
  const trend = useMemo(() => rollup(data?.daily || [], grain), [data?.daily, grain])
  const typesInTrend = useMemo(() => (opts.sourceTypes || SOURCE_TYPES).filter(t => (data?.daily || []).some(d => d[t])), [opts.sourceTypes, data?.daily])
  const toggleSource = t => setFilters(f => { const cur = f.sourceType || []; return { ...f, sourceType: cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t] } })

  const ink = isPhone ? M.ink : IC.t1, muted = isPhone ? M.muted : IC.t3
  const gap = isPhone ? 12 : 16
  const kpiCols = isPhone ? 2 : width >= 1280 ? 6 : 3
  const sideBySide = !isPhone && width >= 1280

  if (status === 403 && !data) {
    return (
      <div style={{ padding: isPhone ? 16 : 24, display: 'flex', flexDirection: 'column', gap: 12 }}>{!isPhone && sidebarTop}
        <Card isPhone={isPhone} title="No access to Inward"><div style={{ fontSize: 13, color: muted }}>Ask an admin to give you <b>Inventory → Inward</b> in Profile → Team.</div></Card>
      </div>
    )
  }

  const rangeLine = meta ? `${fmtRange(meta.start, meta.end)} · ▲/▼ vs ${fmtRange(meta.prevStart, meta.prevEnd)}` : ''
  const fmtVal = v => (v ? fmt(v) : '₹0')
  const delta = key => pctChange(k?.cur?.[key], k?.prev?.[key])
  const kpiList = k ? [
    { id: 'units', label: 'Inward units', value: fmtUnits(k.cur.units), delta: delta('units'), sub: `${fmtUnits(k.cur.rejected)} rejected`, def: 'Units received in GRNs (pack-adjusted), SKUs in the SKU master only.' },
    { id: 'value', label: 'Inward value', value: fmtVal(k.cur.value), delta: delta('value'), sub: k.cur.uncostedUnits ? `${fmtUnits(k.cur.uncostedUnits)} units without COGS` : 'at COGS', def: 'Units × COGS per unit for the GRN month (same COGS table and rule as P&L).' },
    { id: 'grns', label: 'GRNs', value: fmtUnits(k.cur.grns), delta: delta('grns'), sub: 'distinct GRN codes', def: 'Distinct GRN codes in the period.' },
    { id: 'skus', label: 'SKUs received', short: 'SKUs', value: fmtUnits(k.cur.skus), delta: delta('skus'), sub: 'distinct SKUs', def: 'Distinct SKUs received.' },
    { id: 'vendors', label: 'Active vendors', short: 'Vendors', value: fmtUnits(k.cur.vendors), delta: delta('vendors'), sub: 'with at least 1 GRN', def: 'Vendors (unified name) with at least one GRN.' },
    { id: 'ratio', label: 'Inward ÷ sales', short: 'In ÷ sales', value: fmtRatio(k.cur.ratio), delta: delta('ratio'), sub: `sales ${fmtUnits(k.cur.salesUnits)} units`, def: 'Inward units ÷ sales units in the same period. Above 1 = stock building.' },
  ] : []

  // ── Tables ──
  const vendorCols = [
    { key: 'vendor', label: 'Vendor', text: r => r.vendor, maxWidth: 260 },
    { key: 'sourceType', label: 'Source', text: r => r.sourceType },
    { key: 'grns', label: 'GRNs', num: true, text: r => fmtUnits(r.grns), csv: r => r.grns },
    { key: 'units', label: 'Units', num: true, text: r => fmtUnits(r.units), csv: r => r.units },
    { key: 'value', label: '₹ value', num: true, text: r => fmtVal(r.value), csv: r => Math.round(r.value) },
    { key: 'skus', label: 'SKUs', num: true, text: r => fmtUnits(r.skus), csv: r => r.skus },
    { key: 'lastGrn', label: 'Last GRN', text: r => fmtDayYear(r.lastGrn), csv: r => r.lastGrn, sort: r => r.lastGrn },
    { key: 'avgDaysBetween', label: 'Avg days between', num: true, text: r => (r.avgDaysBetween == null ? '—' : r.avgDaysBetween.toFixed(1)), csv: r => r.avgDaysBetween ?? '' },
    { key: 'rejectionPct', label: 'Rejection %', num: true, text: r => fmtPct(r.rejectionPct), csv: r => r.rejectionPct.toFixed(2) },
    { key: 'leadTimeDays', label: 'Lead time (d)', num: true, text: r => (r.leadTimeDays == null ? '—' : r.leadTimeDays.toFixed(1)), csv: r => r.leadTimeDays ?? '' },
  ]
  const whRows = (data?.warehouses || []).map(w => { const s = whStock.get(w.location); return { ...w, _key: w.location, stock: s ? s.stock : null, doi: s ? s.doi : null, avgSale: s ? s.avgSale : null } })
  const whCols = [
    { key: 'location', label: 'Warehouse', text: r => r.location },
    { key: 'units', label: 'Inward units', num: true, text: r => fmtUnits(r.units), csv: r => r.units },
    { key: 'value', label: 'Inward ₹', num: true, text: r => fmtVal(r.value), csv: r => Math.round(r.value) },
    { key: 'salesUnits', label: 'Sales units', num: true, text: r => fmtUnits(r.salesUnits), csv: r => r.salesUnits },
    { key: 'ratio', label: 'Inward ÷ sales', num: true, text: r => fmtRatio(r.ratio), csv: r => (r.ratio == null ? '' : r.ratio.toFixed(3)) },
    { key: 'stock', label: 'Current stock', num: true, text: r => (r.stock == null ? (invLoading ? '…' : '—') : fmtUnits(r.stock)), csv: r => r.stock ?? '' },
    { key: 'avgSale', label: 'Avg sale /day', num: true, text: r => (r.avgSale == null ? '—' : fmtUnits(r.avgSale)), csv: r => r.avgSale ?? '' },
    { key: 'doi', label: 'DOI', num: true, text: r => (r.doi == null ? '—' : `${r.doi} d`), csv: r => r.doi ?? '' },
  ]
  const catRows = []
  for (const c of data?.categories || []) {
    catRows.push({ ...c, _key: `c:${c.category}`, level: 0, label: c.category })
    if (openCats.has(c.category)) for (const s of c.subs) catRows.push({ ...s, category: c.category, _key: `s:${c.category}|${s.subCategory}`, level: 1, label: s.subCategory })
  }
  const allCatRows = (data?.categories || []).flatMap(c => [{ ...c, label: c.category, level: 0 }, ...c.subs.map(s => ({ ...s, category: c.category, label: s.subCategory, level: 1 }))])
  const catCols = [
    { key: 'label', label: 'Category / sub-category', text: r => r.label, csv: r => (r.level ? `${r.category} > ${r.label}` : r.label), maxWidth: 300,
      render: r => (r.level ? <span style={{ paddingLeft: 16, color: muted }}>{r.label}</span> : <span style={{ fontWeight: 700, color: ink }}>{openCats.has(r.category) ? '▾' : '▸'} {r.label}</span>) },
    { key: 'units', label: 'Inward units', num: true, text: r => fmtUnits(r.units), csv: r => r.units },
    { key: 'value', label: 'Inward ₹', num: true, text: r => fmtVal(r.value), csv: r => Math.round(r.value) },
    { key: 'salesUnits', label: 'Sales units', num: true, text: r => fmtUnits(r.salesUnits), csv: r => r.salesUnits },
    { key: 'ratio', label: 'Inward ÷ sales', num: true, text: r => fmtRatio(r.ratio), csv: r => (r.ratio == null ? '' : r.ratio.toFixed(3)) },
  ]
  const skuCols = [
    { key: 'sku', label: 'SKU', text: r => r.sku },
    { key: 'subCategory', label: 'Sub-category', text: r => r.subCategory, maxWidth: 220 },
    { key: 'units', label: 'Inward units', num: true, text: r => fmtUnits(r.units), csv: r => r.units },
    { key: 'value', label: '₹ value', num: true, text: r => fmtVal(r.value), csv: r => Math.round(r.value) },
    { key: 'grns', label: 'GRNs', num: true, text: r => fmtUnits(r.grns), csv: r => r.grns },
    { key: 'stock', label: 'Current stock', num: true, text: r => (r.stock == null ? (invLoading ? '…' : '—') : fmtUnits(r.stock)), csv: r => r.stock ?? '' },
    { key: 'avgSale', label: 'Avg sale /day', num: true, text: r => (r.avgSale == null ? '—' : fmtUnits(r.avgSale)), csv: r => r.avgSale ?? '' },
    { key: 'doi', label: 'DOI', num: true, text: r => (r.doi == null ? '—' : `${r.doi} d`), csv: r => r.doi ?? '' },
    { key: 'lastInward', label: 'Last inward', text: r => fmtDayYear(r.lastInward), csv: r => r.lastInward, sort: r => r.lastInward },
  ]

  const loadingFirst = !data && !error
  const skel = hgt => <div aria-busy="true" style={{ height: hgt, borderRadius: isPhone ? M.radius.card : 16, background: isPhone ? '#ebe8e1' : IC.surface, opacity: 0.7, pointerEvents: 'none' }} />

  return (
    // The page is its own (full-area) scroll container, like the other Inventory sub-pages.
    <div className="inward-page" style={{ background: isPhone ? M.bg : IC.page, flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: isPhone ? '12px 16px 96px' : width >= 1280 ? '18px 24px 40px' : '16px 20px 40px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap }}>
      {!isPhone && sidebarTop && <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>{sidebarTop}</div>}
      {/* Title, date range and Refresh live in the app's top bar (desktop) / green header (phone). */}
      <div style={{ fontSize: 12, color: muted }}>{rangeLine}{loading && data ? ' · updating…' : ''}</div>
      {!isPhone && <DesktopFilters opts={opts} filters={filters} setFilters={setFilters} />}
      <FilterChips filters={filters} setFilters={setFilters} isPhone={isPhone} />
      {isPhone && sheetOpen && <InwardFilterSheet open onClose={() => setSheetOpen(false)} opts={opts} filters={filters} setFilters={setFilters} />}

      {error && !data && <div role="alert" style={{ padding: '12px 14px', borderRadius: 12, background: C.red.bg, border: `1px solid ${C.red.bd}`, color: C.red.tx, fontSize: 12.5 }}>⚠ {error}</div>}
      {error && data && <div role="alert" style={{ fontSize: 12, color: C.red.tx }}>⚠ Couldn't refresh: {error} (showing the last result)</div>}

      {/* 1. KPI tiles */}
      {loadingFirst ? skel(isPhone ? 196 : 96) : k && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${kpiCols}, minmax(0, 1fr))`, gap: isPhone ? 8 : 12 }}>
            {kpiList.map(t => isPhone
              ? <KpiTileM key={t.id} label={t.short || t.label} value={t.value} delta={t.delta} deltaNeutral def={`${t.def}${t.sub ? ` (${t.sub})` : ''}`} />
              : <KpiDesk key={t.id} label={t.label} value={t.value} delta={t.delta} sub={t.sub} title={t.def} />)}
          </div>
          <div style={{ fontSize: 12, color: muted, marginTop: 6 }}>
            Inward ÷ sales above 1 = stock building.{(meta?.notes || []).map(n => ` ${n}`).join('')}
          </div>
        </div>
      )}

      {/* 2. Trend + 3. Source mix */}
      {loadingFirst ? skel(isPhone ? 300 : 340) : data && (
        <div style={{ display: 'grid', gridTemplateColumns: sideBySide ? 'minmax(0, 1.65fr) minmax(0, 1fr)' : 'minmax(0, 1fr)', gap }}>
          <Card isPhone={isPhone} title="Inward trend" sub={`Units by source type, with the sales line · ${grain}`}
            action={<Seg isPhone={isPhone} label="Trend grain" value={grainSel} onChange={setGrainSel}
              options={[{ value: 'auto', label: 'Auto' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />}>
            <div style={{ height: isPhone ? 220 : 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={IC.border} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: IC.t3 }} tickFormatter={d => fmtBucket(d, grain)} minTickGap={isPhone ? 18 : 28} />
                  <YAxis tick={{ fontSize: 12, fill: IC.t3 }} tickFormatter={fmtBig} width={44} />
                  <Tooltip content={<TrendTip grain={grain} />} cursor={{ fill: 'rgba(31,90,61,.06)' }} />
                  {typesInTrend.map(t => <Bar key={t} dataKey={t} stackId="in" fill={SOURCE_COLORS[t] || '#6f7d75'} stroke="#fff" strokeWidth={1} maxBarSize={isPhone ? 18 : 28} isAnimationActive={false} />)}
                  <Line dataKey="sales" stroke={IC.t1} strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <Legend isPhone={isPhone} items={[...typesInTrend.map(t => ({ label: t, color: SOURCE_COLORS[t] || '#6f7d75' })), { label: 'Sales units', color: IC.t1, line: true }]} />
          </Card>

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
                      <div style={{ width: `${Math.max(0, Math.min(100, s.share * 100))}%`, height: '100%', background: SOURCE_COLORS[s.sourceType] || '#6f7d75', borderRadius: 3 }} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: 12, color: muted }}>
                      <span>{fmtVal(s.value)}</span><span>{fmtUnits(s.grns)} GRNs</span><span>avg {fmtUnits(s.avgGrnSize)} units/GRN</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </Card>
        </div>
      )}

      {/* 4. Vendor performance */}
      {data && (
        <Card isPhone={isPhone} title="Vendor performance" sub={`${data.vendors.length} vendors · lead time = PO date → GRN received, avg per GRN`}>
          <InwardTable columns={vendorCols} rows={data.vendors.map(v => ({ ...v, _key: v.vendor }))} isPhone={isPhone} title="Vendor performance" filename={`inward_vendors_${meta.start}_${meta.end}.csv`}
            defaultSort={{ key: 'units', dir: 'desc' }} phoneKeys={['vendor', 'units', 'value', 'rejectionPct']} />
        </Card>
      )}

      {/* 5. Warehouse view */}
      {data && (
        <Card isPhone={isPhone} title="Warehouse view" sub="Inward vs that warehouse's sales, same period · stock, Avg sale and DOI as on Inventory Health (last 7 days)">
          <InwardTable columns={whCols} rows={whRows} isPhone={isPhone} title="Warehouse view" filename={`inward_warehouses_${meta.start}_${meta.end}.csv`}
            phoneKeys={['location', 'units', 'salesUnits', 'doi']} />
        </Card>
      )}

      {/* 6. Category / sub-category */}
      {data && (
        <Card isPhone={isPhone} title="Category breakdown" sub="Tap a category to open its sub-categories">
          <InwardTable columns={catCols} rows={catRows} isPhone={isPhone} title="Category breakdown" filename={`inward_categories_${meta.start}_${meta.end}.csv`}
            sortable={false} phoneKeys={['label', 'units', 'salesUnits', 'ratio']} fullNote="Categories (open ones show their sub-categories underneath)"
            onRowClick={r => { if (r.level) return; setOpenCats(s => { const n = new Set(s); if (n.has(r.category)) n.delete(r.category); else n.add(r.category); return n }) }}
            rowStyle={r => (r.level ? { background: isPhone ? '#faf9f6' : IC.hoverBg } : {})} />
          <button type="button" style={{ ...btnStyle(isPhone), border: 'none', background: 'none', padding: 0, color: IC.acc, marginTop: 4 }}
            onClick={() => downloadCsv(`inward_categories_all_${meta.start}_${meta.end}.csv`, toCsv(catCols.map(c => ({ label: c.label, csv: c.csv || c.text })), allCatRows))}>CSV with every sub-category</button>
        </Card>
      )}

      {/* 7. SKU detail */}
      {data && (
        <Card isPhone={isPhone} title="SKU detail" sub={`${skuRows.length} SKUs received · tap a row for the inward timeline`}>
          <InwardTable columns={skuCols} rows={skuRows.map(s => ({ ...s, _key: s.skuKey }))} isPhone={isPhone} title="SKU detail" filename={`inward_skus_${meta.start}_${meta.end}.csv`}
            defaultSort={{ key: 'units', dir: 'desc' }} phoneKeys={['sku', 'units', 'stock', 'doi']} onRowClick={setDrill}
            search={(r, q) => r.sku.toLowerCase().includes(q) || String(r.subCategory || '').toLowerCase().includes(q)} searchPlaceholder="Search SKU or sub-category" />
        </Card>
      )}

      {/* Later: "not-required inward" flag table (inward for SKUs that already had enough cover).
          Deliberately not built yet — the spec parks it; it slots in here, after SKU detail. */}

      {/* 8. Data quality — admins only (the API sends it only to admins), collapsed by default */}
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
                <div style={{ fontSize: 13, fontWeight: 700, color: ink, marginBottom: 6 }}>GRN SKUs not in the SKU master</div>
                <InwardTable isPhone={isPhone} title="SKUs not in SKU master" filename={`inward_dq_skus_${meta.start}_${meta.end}.csv`} defaultSort={{ key: 'units', dir: 'desc' }}
                  rows={data.dataQuality.unmappedSku.rows.map((r, i) => ({ ...r, _key: `${r.itemSkuCode}-${i}` }))} phoneKeys={['itemSkuCode', 'units', 'lines', 'reason']}
                  columns={[{ key: 'itemSkuCode', label: 'GRN SKU code', text: r => r.itemSkuCode }, { key: 'finalSku', label: 'Final SKU', text: r => r.finalSku }, { key: 'reason', label: 'Reason', text: r => r.reason, maxWidth: 260 },
                    { key: 'lines', label: 'Lines', num: true, text: r => fmtUnits(r.lines), csv: r => r.lines }, { key: 'units', label: 'Units', num: true, text: r => fmtUnits(r.units), csv: r => r.units }, { key: 'lastDate', label: 'Last GRN', text: r => fmtDayYear(r.lastDate), csv: r => r.lastDate, sort: r => r.lastDate }]} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: ink, marginBottom: 6 }}>Vendors not in vendor mapping</div>
                <InwardTable isPhone={isPhone} title="Vendors not in vendor mapping" filename={`inward_dq_vendors_${meta.start}_${meta.end}.csv`} defaultSort={{ key: 'units', dir: 'desc' }}
                  rows={data.dataQuality.unmappedVendor.rows.map(r => ({ ...r, _key: r.vendorName }))} phoneKeys={['vendorName', 'units', 'lines', 'lastDate']}
                  columns={[{ key: 'vendorName', label: 'Vendor name', text: r => r.vendorName, maxWidth: 300 }, { key: 'lines', label: 'Lines', num: true, text: r => fmtUnits(r.lines), csv: r => r.lines },
                    { key: 'units', label: 'Units', num: true, text: r => fmtUnits(r.units), csv: r => r.units }, { key: 'lastDate', label: 'Last GRN', text: r => fmtDayYear(r.lastDate), csv: r => r.lastDate, sort: r => r.lastDate }]} />
              </div>
              <div>
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

      {data && <div style={{ fontSize: 12, color: muted }}>
        Source: Unicommerce GRNs (refined), SKUs resolved through the SKU master · last GRN {fmtDayYear(meta.lastGrnDate)} · last sale {fmtDayYear(meta.lastSalesDate)}
        {invData?.asOf ? ` · stock as of ${new Date(invData.asOf).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}` : ''}
      </div>}

      {drill && <SkuDrill row={drill} start={meta?.start} end={meta?.end} isPhone={isPhone} onClose={() => setDrill(null)} />}
    </div>
  )
}
