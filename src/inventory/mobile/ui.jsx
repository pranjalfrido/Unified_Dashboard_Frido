import { C } from '../../utils.js'

// Small building blocks for the Inventory mobile views - same look as src/sales/SalesMobileView.jsx.
const M = C.m

export function Card({ title, right, sub, children, id }) {
  return (
    <section id={id} style={{ background: M.card, borderRadius: M.radius.card, padding: 16, boxShadow: M.cardShadow, minWidth: 0, scrollMarginTop: 12 }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: sub ? 2 : 10 }}>
          <h2 style={{ margin: 0, fontSize: M.type.cardTitle, fontWeight: 700, color: M.ink }}>{title}</h2>
          {right}
        </div>
      )}
      {sub && <div style={{ fontSize: 12, color: M.muted, marginBottom: 10 }}>{sub}</div>}
      {children}
    </section>
  )
}

export function ShowAllButton({ children, onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{ marginTop: 10, width: '100%', minHeight: 44, borderRadius: 12, border: `1px solid ${M.line}`, background: '#fff', color: M.green, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>{children}</button>
  )
}

// Chip row (location chips, Units / Revenue …): scrolls sideways, active chip filled green.
// inline: no own scroll row, so two groups can share one line (see ChipRow)
export function Chips({ options, value, onChange, label, inline = false }) {
  return (
    <div role="group" aria-label={label} style={inline ? { display: 'flex', gap: 6, flex: '0 0 auto' } : { display: 'flex', gap: 6, overflowX: 'auto', margin: '0 -16px 6px', padding: '1px 16px', scrollbarWidth: 'none' }}>
      {options.map(o => {
        const on = o.id === value
        return (
          <button key={o.id} type="button" aria-pressed={on} onClick={() => onChange(o.id)}
            style={{ flex: '0 0 auto', minHeight: 28, padding: '0 7px', borderRadius: M.radius.chip, border: `1px solid ${on ? M.green : M.line}`, background: on ? M.green : '#fff', color: on ? '#fff' : M.ink,
              fontSize: 12, fontWeight: on ? 700 : 500, fontFamily: 'var(--font)', cursor: 'pointer' }}>{o.label}</button>
        )
      })}
    </div>
  )
}

// Several chip groups on one line with a wider gap between groups; wraps on very narrow phones.
export function ChipRow({ children }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 6, marginBottom: 6 }}>{children}</div>
}

// Label / value tiles inside a detail sheet.
export function KV({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
      {items.map(d => (
        <div key={d.label} style={{ background: M.soft, borderRadius: M.radius.tile, padding: '10px 12px', minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em', color: M.muted }}>{d.label}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: d.color || M.ink, marginTop: 3, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{d.value}</div>
        </div>
      ))}
    </div>
  )
}

// Two-line list row content: name + grey sub-line on the left, bold value + grey line on the right.
export function RowText({ name, sub, value, valueSub, valueColor }) {
  return (
    <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', columnGap: 10, alignItems: 'baseline' }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: M.type.listValue, fontWeight: 600, lineHeight: '17px', overflowWrap: 'anywhere' }}>{name}</span>
        {sub && <span style={{ display: 'block', fontSize: 12, lineHeight: '16px', color: M.muted, marginTop: 1 }}>{sub}</span>}
      </span>
      <span style={{ textAlign: 'right' }}>
        <span style={{ display: 'block', fontSize: M.type.listValue, fontWeight: 700, lineHeight: '17px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: valueColor || M.ink }}>{value}</span>
        {valueSub && <span style={{ display: 'block', fontSize: 12, lineHeight: '16px', color: M.muted, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{valueSub}</span>}
      </span>
    </span>
  )
}
