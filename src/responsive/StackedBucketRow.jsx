import { C } from '../utils.js'

// One row with a stacked bucket bar (LOGISTICS_MOBILE_REDESIGN_PROMPT.md §2c/2f): name left, the
// headline value right, a 10px bar of the buckets (green shades, fastest darkest, 2px gaps) and,
// when `labels` are given, every bucket value in aligned columns under it ("0–1d 79.7%").
// Flagged values (an existing desktop red rule) show in red. `soft` = the Total row's background.
//   pcts: [number|null] per bucket · flags: [bool] · right / rightSub: headline value + its label
const SHADES = ['#1f5a3d', '#5f8f75', '#9cc4ad', '#d5dbd7', '#eeebe4']

export default function StackedBucketRow({ name, sub, right, rightSub, pcts, labels, flags = [], soft = false, onClick }) {
  const M = C.m
  const segs = pcts.map((p, i) => ({ p: p || 0, c: SHADES[i] || SHADES.at(-1) })).filter(s => s.p > 0)
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className="sbr-row"
      style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', fontFamily: 'var(--font)', color: M.ink, cursor: onClick ? 'pointer' : 'default',
        background: soft ? M.soft : 'transparent', borderRadius: soft ? 12 : 0, padding: soft ? '10px 12px' : '12px 0', borderTop: soft ? 'none' : `1px solid ${M.line}` }}>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: M.type.listValue, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          {sub && <span style={{ display: 'block', fontSize: 12, color: M.muted }}>{sub}</span>}
        </span>
        <span style={{ flexShrink: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          <b style={{ fontSize: M.type.listValue }}>{right}</b>{rightSub && <span style={{ fontSize: 12, color: M.muted }}> {rightSub}</span>}
        </span>
      </span>
      <span aria-hidden="true" style={{ display: 'flex', gap: 2, height: 10, margin: '7px 0 0', borderRadius: 5, overflow: 'hidden', background: M.line }}>
        {segs.map((s, i) => <i key={i} style={{ display: 'block', width: `${s.p}%`, background: s.c }} />)}
      </span>
      {labels && (
        // Columns at least 128px wide: on a phone four buckets go 2 × 2 (in one row of four they ran
        // into each other at 375px, e.g. "12–24h 10.7%24–48h 25.7%"); wider screens fit them in one row.
        <span style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(128px, 1fr))`, columnGap: 12, rowGap: 2, marginTop: 5, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
          {labels.map((l, i) => (
            <span key={l} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span style={{ color: M.muted }}>{l} </span><b style={{ fontWeight: 600, color: flags[i] ? M.down : M.ink }}>{pcts[i] == null ? '—' : `${pcts[i]}%`}</b>
            </span>
          ))}
        </span>
      )}
    </Tag>
  )
}
