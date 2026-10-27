import { useState } from 'react'
import { C } from '../utils.js'
import BottomSheet from './BottomSheet.jsx'

// One row with a stacked bucket bar (LOGISTICS_MOBILE_REDESIGN_PROMPT.md §2c/2f): name left, the
// headline value right, a 10px bar of the buckets (green shades, fastest darkest, 2px gaps).
// When `labels` are given, every bucket value ("0–1d 79.7%") is one tap away: tapping anywhere in
// the row opens a sheet with each bucket (Suraj, 27 Oct: the row itself only shows the headline;
// the inline labels crowded a 375px screen). Flagged values (an existing desktop red rule) show in
// red. `soft` = the Total row's background. onClick (instead of labels): the caller's own action.
//   pcts: [number|null] per bucket · flags: [bool] · right / rightSub: headline value + its label
const SHADES = ['#1f5a3d', '#5f8f75', '#9cc4ad', '#d5dbd7', '#eeebe4']

export default function StackedBucketRow({ name, sub, right, rightSub, pcts, labels, flags = [], soft = false, onClick }) {
  const M = C.m
  const [open, setOpen] = useState(false)
  const segs = pcts.map((p, i) => ({ p: p || 0, c: SHADES[i] || SHADES.at(-1) })).filter(s => s.p > 0)
  const tap = onClick || (labels ? () => setOpen(true) : null)
  const Tag = tap ? 'button' : 'div'
  return (
    <>
      <Tag type={tap ? 'button' : undefined} onClick={tap || undefined} className="sbr-row" aria-haspopup={labels && !onClick ? 'dialog' : undefined}
        style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', fontFamily: 'var(--font)', color: M.ink, cursor: tap ? 'pointer' : 'default',
          background: soft ? M.soft : 'transparent', borderRadius: soft ? 12 : 0, padding: soft ? '10px 12px' : '12px 0', borderTop: soft ? 'none' : `1px solid ${M.line}` }}>
        <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: M.type.listValue, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            {sub && <span style={{ display: 'block', fontSize: 12, color: M.muted }}>{sub}</span>}
          </span>
          <span style={{ flexShrink: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            <b style={{ fontSize: M.type.listValue }}>{right}</b>{rightSub && <span style={{ fontSize: 12, color: M.muted }}> {rightSub}</span>}
            {labels && !onClick && <span aria-hidden="true" style={{ color: M.muted, fontSize: 15, marginLeft: 6 }}>›</span>}
          </span>
        </span>
        <span aria-hidden="true" style={{ display: 'flex', gap: 2, height: 10, margin: '7px 0 0', borderRadius: 5, overflow: 'hidden', background: M.line }}>
          {segs.map((s, i) => <i key={i} style={{ display: 'block', width: `${s.p}%`, background: s.c }} />)}
        </span>
      </Tag>
      {labels && !onClick && (
        <BottomSheet open={open} onClose={() => setOpen(false)} title={name} subtitle={right != null ? `${right}${rightSub ? ` ${rightSub}` : ''}` : undefined}>
          {labels.map((l, i) => (
            <div key={l} style={{ padding: '9px 0', borderTop: i ? `1px solid ${M.line}` : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: M.muted }}>{l}</span>
                <b style={{ fontWeight: 700, color: flags[i] ? M.down : M.ink }}>{pcts[i] == null ? '—' : `${pcts[i]}%`}</b>
              </div>
              <div aria-hidden="true" style={{ height: 6, marginTop: 5, borderRadius: 3, background: M.line, overflow: 'hidden' }}>
                <i style={{ display: 'block', height: '100%', width: `${Math.min(100, pcts[i] || 0)}%`, background: flags[i] ? M.down : SHADES[i] || SHADES.at(-1), borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </BottomSheet>
      )}
    </>
  )
}
