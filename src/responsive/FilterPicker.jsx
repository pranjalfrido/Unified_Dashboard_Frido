import { useMemo, useState } from 'react'
import { C } from '../utils.js'

const SHOWN = 40

// Level 2 of FilterSheet (docs/responsive/MOBILE_DESIGN_SYSTEM.md §2): one filter's values.
// Search, "Top by revenue" / "A–Z", current selections pinned on top, the first 40 matches listed
// (type to narrow down, so it stays fast with 1000+ values), Clear, and Apply (n).
//   options: [{ value, label?, sub?, rank?, icon? }]  (rank = revenue or count; omit for A–Z only;
//            icon = small logo URL shown before the label, e.g. courier logos)
//   selected: [value]; multi: checkboxes vs single choice; onApply(values); onBack()
//   fmtRank:  rank → text shown at the row's right (e.g. revenue)
//   searchAll / searchAllNote: extra values only reachable by search (e.g. the full SKU master behind
//             the SKUs that sold in the period); they list after the matching options, with the note
export default function FilterPicker({ title, noun = 'items', options, selected, multi = true, onApply, onBack, fmtRank, searchAll, searchAllNote = '' }) {
  const M = C.m
  const [q, setQ] = useState('')
  const hasRank = options.some(o => o.rank != null)
  const [sort, setSort] = useState(hasRank ? 'top' : 'az')
  const [sel, setSel] = useState(() => new Set(selected))
  const label = o => o.label ?? o.value
  const items = useMemo(() => {
    const t = q.trim().toLowerCase()
    const xs = t ? options.filter(o => `${label(o)} ${o.sub || ''}`.toLowerCase().includes(t)) : options
    const sorted = [...xs].sort((a, b) => sort === 'top' ? (b.rank ?? 0) - (a.rank ?? 0) : String(label(a)).localeCompare(String(label(b))))
    if (!t || !searchAll?.length) return sorted
    const have = new Set(options.map(o => o.value))
    const extra = searchAll.filter(v => !have.has(v) && String(v).toLowerCase().includes(t)).slice(0, 200).map(v => ({ value: v, sub: searchAllNote }))
    return [...sorted, ...extra]
  }, [options, q, sort, searchAll, searchAllNote])
  const byValue = useMemo(() => new Map(options.map(o => [o.value, o])), [options])
  const toggle = v => setSel(s => {
    const n = new Set(multi ? s : [])
    if (s.has(v)) n.delete(v); else n.add(v)
    return n
  })
  const row = (o, on) => (
    <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '6px 2px', borderTop: `1px solid ${M.line}`, cursor: 'pointer' }}>
      <input type={multi ? 'checkbox' : 'radio'} checked={on} onChange={() => toggle(o.value)} style={{ width: 18, height: 18, accentColor: M.green, flexShrink: 0 }} />
      {o.icon && <img src={o.icon} alt="" style={{ width: 20, height: 20, objectFit: 'contain', borderRadius: 4, flexShrink: 0 }} />}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: on ? 600 : 500, color: M.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label(o)}</span>
        {o.sub && <span style={{ display: 'block', fontSize: 12, color: M.muted }}>{o.sub}</span>}
      </span>
      {fmtRank && o.rank != null && <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: M.muted, fontVariantNumeric: 'tabular-nums' }}>{fmtRank(o.rank)}</span>}
    </label>
  )
  const groupHead = text => <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: M.muted, padding: '12px 0 6px' }}>{text}</div>
  const chip = (id, text) => (
    <button key={id} type="button" aria-pressed={sort === id} onClick={() => setSort(id)}
      style={{ minHeight: 32, padding: '0 12px', borderRadius: M.radius.chip, border: `1px solid ${sort === id ? M.green : M.line}`, background: sort === id ? M.green : '#fff', color: sort === id ? '#fff' : M.ink, fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>{text}</button>
  )
  const rest = items.filter(o => !sel.has(o.value))
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <button type="button" onClick={onBack} aria-label="Back to filters"
          style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: M.soft, color: M.ink, fontSize: 20, cursor: 'pointer' }}>‹</button>
        <span style={{ fontSize: 16, fontWeight: 700, color: M.ink }}>{title}</span>
        <button type="button" onClick={() => setSel(new Set())} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: M.green, fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)', cursor: 'pointer', minHeight: 36 }}>Clear</button>
      </div>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${searchAll?.length > options.length ? searchAll.length : options.length} ${noun}…`} aria-label={`Search ${noun}`}
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '10px 12px', borderRadius: 12, border: `1px solid ${M.line}`, background: M.soft, color: M.ink, outline: 'none', fontFamily: 'var(--font)' }} />
      {hasRank && <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>{chip('top', 'Top by revenue')}{chip('az', 'A–Z')}</div>}
      {sel.size > 0 && <>{groupHead(`Selected (${sel.size})`)}{[...sel].map(v => row(byValue.get(v) || { value: v }, true))}</>}
      {groupHead(`${q ? 'Results' : 'All'} · ${rest.length}`)}
      {rest.slice(0, SHOWN).map(o => row(o, false))}
      {rest.length > SHOWN && <div style={{ fontSize: 12.5, color: M.muted, padding: '10px 0' }}>Showing {SHOWN} of {rest.length}. Type to narrow down.</div>}
      {!items.length && <div style={{ fontSize: 12.5, color: M.muted, padding: '10px 0' }}>No matches</div>}
      <div style={{ position: 'sticky', bottom: 0, background: '#fff', paddingTop: 10, marginTop: 6 }}>
        <button type="button" onClick={() => onApply([...sel])}
          style={{ width: '100%', minHeight: 46, borderRadius: 12, border: 'none', background: M.green, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>
          Apply{sel.size ? ` (${sel.size})` : ''}
        </button>
      </div>
    </div>
  )
}
